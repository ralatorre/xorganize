import { describe, expect, it } from 'vitest';
import { normalisePost } from '@/src/capture/normalise';
import type { TagSuggestion, TagSummary } from '@/src/db/types';
import { themeOfColour } from '@/src/dom/theme';
import { GUARDED_EVENTS, contain, createKeyboardGuard } from '@/src/inline/keyboard-guard';
import { keyAction, moveHighlight, recentOf, rowsOf } from '@/src/inline/popover-model';
import { placePopover } from '@/src/inline/position';
import { createDismissTimer, firstInView, inView, PROMPT_MS } from '@/src/inline/prompt';
import { TAG_SHORTCUT, isShortcutPress, matchesShortcut, postAnchor } from '@/src/inline/shortcut';
import { createTagState } from '@/src/inline/tag-state';
import { PENDING_COLOUR, createTagger, preview } from '@/src/inline/tagger';
import { createTagsListener, type ListeningPort } from '@/src/inline/tags-port';
import type { TagsSetMessage, TagsSetReply } from '@/src/messaging/protocol';
import { rawPost } from '../fixtures/posts';

const ACCOUNT = '9000000000000000001';
const RUST: TagSummary = { id: 'tag-1', name: 'Rust', color: 0 };
const READ: TagSummary = { id: 'tag-2', name: 'to read', color: 1 };
const suggestion = (tag: TagSummary, count = 1): TagSuggestion => ({ ...tag, count });

/** Runs scheduled tasks only when told to. */
function manualSchedule() {
  const tasks: Array<() => void> = [];
  return {
    schedule: (task: () => void) => void tasks.push(task),
    run: () => tasks.splice(0).forEach((task) => task()),
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('createTagState', () => {
  it('asks once for every post that appears together, in batches', async () => {
    const asked: string[][] = [];
    const timing = manualSchedule();
    const state = createTagState({
      schedule: timing.schedule,
      batchSize: 2,
      fetch: async (ids) => (
        asked.push(ids),
        new Map(ids.map((id) => [id, id === '1' ? [RUST] : []]))
      ),
    });
    const seen: Array<[string, TagSummary[]]> = [];
    for (const id of ['1', '2', '3']) state.watch(id, (tags) => seen.push([id, tags]));

    timing.run();
    await settle();

    expect(asked).toEqual([['1', '2'], ['3']]);
    expect(seen).toEqual([
      ['1', [RUST]],
      ['2', []],
      ['3', []],
    ]);
  });

  it('tells a new watcher what is known at once, without asking again', async () => {
    let asks = 0;
    const timing = manualSchedule();
    const state = createTagState({
      schedule: timing.schedule,
      fetch: async (ids) => (asks++, new Map(ids.map((id) => [id, [RUST]]))),
    });
    state.watch('1', () => {});
    timing.run();
    await settle();

    const seen: TagSummary[][] = [];
    state.watch('1', (tags) => seen.push(tags));
    expect(seen).toEqual([[RUST]]);
    expect(asks).toBe(1);
  });

  it('forgets a post nobody shows, and ignores changes to it', async () => {
    const timing = manualSchedule();
    const state = createTagState({ schedule: timing.schedule, fetch: async () => new Map() });
    const stop = state.watch('1', () => {});
    state.set('1', [RUST]);
    stop();
    expect(state.get('1')).toBeUndefined();
    state.set('1', [READ]);
    expect(state.get('1')).toBeUndefined();
  });

  it('asks again for everything on screen when told changes were missed', async () => {
    const asked: string[][] = [];
    const timing = manualSchedule();
    const state = createTagState({
      schedule: timing.schedule,
      fetch: async (ids) => (asked.push(ids), new Map()),
    });
    state.watch('1', () => {});
    state.watch('2', () => {});
    timing.run();
    state.refresh();
    timing.run();
    expect(asked).toEqual([
      ['1', '2'],
      ['1', '2'],
    ]);
  });

  it('survives the worker not answering', async () => {
    const timing = manualSchedule();
    const state = createTagState({
      schedule: timing.schedule,
      fetch: async () => {
        throw new Error('gone');
      },
    });
    state.watch('1', () => {});
    timing.run();
    await settle();
    expect(state.get('1')).toBeUndefined();
  });
});

describe('createTagger', () => {
  const POST = normalisePost(rawPost({ id: '101' }))!;

  function setup(
    reply: TagsSetReply | undefined,
    options: { accountId?: string | undefined } = {},
  ) {
    const timing = manualSchedule();
    const state = createTagState({ schedule: timing.schedule, fetch: async () => new Map() });
    const shown: TagSummary[][] = [];
    state.watch('101', (tags) => shown.push(tags));
    state.set('101', [RUST]);
    const sent: TagsSetMessage[] = [];
    const failed: string[] = [];
    const change = createTagger({
      accountId: () => ('accountId' in options ? options.accountId : ACCOUNT),
      send: async (message) => (sent.push(message), reply),
      postFor: (id) => (id === '101' ? { post: POST, partial: false } : undefined),
      state,
      onFailed: (id) => void failed.push(id),
    });
    return { change, shown, sent, failed, state };
  }

  it('shows the change at once, then what the worker confirmed', async () => {
    const { change, shown, sent } = setup({ ok: true, tags: [RUST, READ] });
    expect(await change('101', { add: ['to read'] })).toBe(true);
    expect(shown.slice(1)).toEqual([
      [RUST, { id: 'pending:to read', name: 'to read', color: PENDING_COLOUR }],
      [RUST, READ],
    ]);
    expect(sent).toEqual([
      {
        type: 'tags/set',
        accountId: ACCOUNT,
        postId: '101',
        add: ['to read'],
        remove: [],
        post: POST,
        partial: false,
      },
    ]);
  });

  it('puts the tags back and reports when the worker says no', async () => {
    const { change, state, failed } = setup({ ok: false });
    expect(await change('101', { remove: ['tag-1'] })).toBe(false);
    expect(state.get('101')).toEqual([RUST]);
    expect(failed).toEqual(['101']);
  });

  it('puts the tags back when the worker cannot be reached', async () => {
    const { change, state, failed } = setup(undefined);
    expect(await change('101', { add: ['x'] })).toBe(false);
    expect(state.get('101')).toEqual([RUST]);
    expect(failed).toEqual(['101']);
  });

  it('sends nothing without a signed-in account', async () => {
    const { change, sent, failed } = setup({ ok: true, tags: [] }, { accountId: undefined });
    expect(await change('101', { add: ['x'] })).toBe(false);
    expect(sent).toEqual([]);
    expect(failed).toEqual(['101']);
  });

  it('drops invalid names and never sends a tag that is not saved yet', async () => {
    const { change, sent } = setup({ ok: true, tags: [] });
    await change('101', { add: ['a;b', 'ok'], remove: ['pending:x', 'tag-1'] });
    expect(sent[0]).toMatchObject({ add: ['ok'], remove: ['tag-1'] });
  });
});

describe('preview', () => {
  it('does not show a name twice, whatever its casing', () => {
    expect(preview([RUST], ['rust', 'New', 'new'], []).map((tag) => tag.name)).toEqual([
      'Rust',
      'New',
    ]);
  });
});

describe('popover model', () => {
  it('offers matching tags not on the post, then to create the typed name', () => {
    expect(rowsOf('ty', [suggestion(RUST), suggestion(READ)], [RUST])).toEqual([
      { kind: 'tag', tag: suggestion(READ) },
      { kind: 'create', name: 'ty' },
    ]);
  });

  it('does not offer to create a tag that exists or is on the post', () => {
    expect(rowsOf(' RUST ', [suggestion(RUST)], [])).toEqual([
      { kind: 'tag', tag: suggestion(RUST) },
    ]);
    expect(rowsOf('rust', [], [RUST])).toEqual([]);
    expect(rowsOf('a;b', [], [])).toEqual([]);
  });

  it('offers recent tags that are not on the post', () => {
    expect(recentOf([RUST, READ], [RUST])).toEqual([READ]);
  });

  it('moves the highlight round in both directions', () => {
    expect(moveHighlight(-1, 1, 3)).toBe(0);
    expect(moveHighlight(-1, -1, 3)).toBe(2);
    expect(moveHighlight(2, 1, 3)).toBe(0);
    expect(moveHighlight(0, -1, 3)).toBe(2);
    expect(moveHighlight(0, 1, 0)).toBe(-1);
  });

  const rows = rowsOf('ne', [suggestion(READ)], []);
  const context = { query: 'ne', rows, highlight: 1, appliedCount: 1 };

  it.each([
    ['Escape', { type: 'close' }],
    ['ArrowDown', { type: 'move', delta: 1 }],
    ['ArrowUp', { type: 'move', delta: -1 }],
    ['Enter', { type: 'apply', row: rows[1] }],
    ['Backspace', { type: 'none' }],
    ['a', { type: 'none' }],
  ])('%s does what DESIGN 4.2 says', (key, action) => {
    expect(keyAction(key, context)).toEqual(action);
  });

  it('removes the last tag on Backspace only when nothing is typed', () => {
    expect(keyAction('Backspace', { ...context, query: '' })).toEqual({ type: 'remove-last' });
    expect(keyAction('Backspace', { ...context, query: '', appliedCount: 0 })).toEqual({
      type: 'none',
    });
  });

  it('applies the first row on Enter when nothing is highlighted, and nothing for an empty query', () => {
    expect(keyAction('Enter', { ...context, highlight: -1 })).toEqual({
      type: 'apply',
      row: rows[0],
    });
    expect(keyAction('Enter', { query: '', rows: [], highlight: -1, appliedCount: 0 })).toEqual({
      type: 'none',
    });
  });
});

describe('placePopover', () => {
  const viewport = { width: 1000, height: 800 };
  const size = { width: 300, height: 200 };

  it('sits below the button, right-aligned with it', () => {
    expect(placePopover({ top: 100, left: 500, width: 34, height: 34 }, size, viewport)).toEqual({
      top: 142,
      left: 234,
      side: 'below',
    });
  });

  it('flips above when there is no room below', () => {
    expect(
      placePopover({ top: 700, left: 500, width: 34, height: 34 }, size, viewport),
    ).toMatchObject({
      top: 492,
      side: 'above',
    });
  });

  it('stays inside the window at either edge', () => {
    expect(placePopover({ top: 100, left: 0, width: 34, height: 34 }, size, viewport).left).toBe(8);
    expect(placePopover({ top: 100, left: 990, width: 34, height: 34 }, size, viewport).left).toBe(
      692,
    );
  });

  it('starts at the button’s left edge when aligned to its start, as in the library', () => {
    const anchor = { top: 100, left: 400, width: 34, height: 34 };
    expect(placePopover(anchor, size, viewport, { align: 'start' })).toEqual({
      top: 142,
      left: 400,
      side: 'below',
    });
    // Still kept inside the window.
    const late = { top: 100, left: 900, width: 34, height: 34 };
    expect(placePopover(late, size, viewport, { align: 'start' }).left).toBe(692);
  });

  it('stays below, inside the window, when there is no room either way', () => {
    const place = placePopover(
      { top: 50, left: 500, width: 34, height: 34 },
      { width: 300, height: 790 },
      viewport,
    );
    expect(place.side).toBe('below');
  });
});

describe('createTagsListener', () => {
  function fakePort() {
    const messages: Array<(message: unknown) => void> = [];
    const disconnects: Array<() => void> = [];
    const port: ListeningPort = {
      onMessage: { addListener: (listener) => void messages.push(listener) },
      onDisconnect: { addListener: (listener) => void disconnects.push(listener) },
    };
    return {
      port,
      receive: (message: unknown) => messages.forEach((listener) => listener(message)),
      disconnect: () => disconnects.forEach((listener) => listener()),
    };
  }

  function setup() {
    const ports: Array<ReturnType<typeof fakePort>> = [];
    const changes: Array<[string, TagSummary[]]> = [];
    let reconnects = 0;
    const listener = createTagsListener({
      connect: () => {
        const next = fakePort();
        ports.push(next);
        return next.port;
      },
      accountId: () => ACCOUNT,
      onChange: (postId, tags) => void changes.push([postId, tags]),
      onStale: () => void reconnects++,
    });
    return { listener, ports, changes, reconnects: () => reconnects };
  }

  it('connects once, and passes on changes for this account only', () => {
    const { listener, ports, changes } = setup();
    listener.ensure();
    listener.ensure();
    expect(ports).toHaveLength(1);

    ports[0]!.receive({ type: 'tags/changed', accountId: ACCOUNT, postId: '1', tags: [RUST] });
    ports[0]!.receive({
      type: 'tags/changed',
      accountId: '9000000000000000002',
      postId: '1',
      tags: [],
    });
    ports[0]!.receive({
      type: 'tags/changed',
      accountId: ACCOUNT,
      postId: '1',
      tags: [{ id: '<x>' }],
    });
    ports[0]!.receive('junk');
    expect(changes).toEqual([['1', [RUST]]]);
  });

  it('reconnects only when next needed, and then catches up', () => {
    const { listener, ports, reconnects } = setup();
    listener.ensure();
    ports[0]!.disconnect();
    expect(ports).toHaveLength(1);
    expect(reconnects()).toBe(0);

    listener.ensure();
    expect(ports).toHaveLength(2);
    expect(reconnects()).toBe(1);
  });

  it('asks again for everything when this account’s tags were edited in the library', () => {
    const { listener, ports, reconnects } = setup();
    listener.ensure();
    ports[0]!.receive({ type: 'tags/refresh', accountId: ACCOUNT });
    ports[0]!.receive({ type: 'tags/refresh', accountId: '9000000000000000002' });
    ports[0]!.receive({ type: 'tags/refresh', accountId: '<x>' });
    expect(reconnects()).toBe(1);
  });

  it('gives up quietly when the extension has gone', () => {
    const listener = createTagsListener({
      connect: () => {
        throw new Error('Extension context invalidated');
      },
      accountId: () => ACCOUNT,
      onChange: () => {},
      onStale: () => {},
    });
    expect(() => listener.ensure()).not.toThrow();
  });
});

describe('createKeyboardGuard', () => {
  it('hands typing aimed at a protected host to it, and to nothing after', () => {
    const window = new EventTarget();
    const guard = createKeyboardGuard(window);
    const later: string[] = [];
    for (const type of GUARDED_EVENTS) window.addEventListener(type, () => later.push(type), true);

    const handled: string[] = [];
    guard.protect(window, (event) => handled.push(event.type));
    window.dispatchEvent(new Event('keydown'));
    window.dispatchEvent(new Event('input'));
    window.dispatchEvent(new Event('paste'));
    expect(handled).toEqual(['keydown', 'input', 'paste']);
    expect(later).toEqual([]);

    guard.release(window);
    window.dispatchEvent(new Event('keydown'));
    expect(later).toEqual(['keydown']);
  });

  it('leaves events aimed elsewhere alone', () => {
    const window = new EventTarget();
    createKeyboardGuard(window).protect(new EventTarget());
    const later: string[] = [];
    window.addEventListener('keydown', () => later.push('keydown'), true);
    window.dispatchEvent(new Event('keydown'));
    expect(later).toEqual(['keydown']);
  });
});

describe('contain', () => {
  it('stops clicks at the host', () => {
    const host = new EventTarget();
    contain(host);
    const event = new Event('click', { bubbles: true });
    host.dispatchEvent(event);
    expect(event.cancelBubble).toBe(true);
  });
});

describe('themeOfColour', () => {
  it.each([
    ['rgb(255, 255, 255)', 'light'],
    ['rgb(21, 32, 43)', 'dim'],
    ['rgb(0, 0, 0)', 'dark'],
    ['rgba(0, 0, 0, 0)', 'light'],
    ['rgba(0, 0, 0, 1)', 'dark'],
    ['', 'light'],
  ])('reads %j as %s', (colour, theme) => {
    expect(themeOfColour(colour)).toBe(theme);
  });
});

describe('matchesShortcut', () => {
  const press = (changes: Partial<typeof TAG_SHORTCUT>) => ({ ...TAG_SHORTCUT, ...changes });

  it('matches Alt+T only', () => {
    expect(matchesShortcut(press({}))).toBe(true);
    expect(matchesShortcut(press({ altKey: false }))).toBe(false);
    expect(matchesShortcut(press({ ctrlKey: true }))).toBe(false);
    expect(matchesShortcut(press({ shiftKey: true }))).toBe(false);
    expect(matchesShortcut(press({ metaKey: true }))).toBe(false);
    expect(matchesShortcut(press({ code: 'KeyL' }))).toBe(false);
  });

  it('can be given another shortcut', () => {
    expect(matchesShortcut(press({ code: 'KeyG' }), press({ code: 'KeyG' }))).toBe(true);
  });
});

describe('isShortcutPress', () => {
  const event = (type: string, changes: Partial<typeof TAG_SHORTCUT> = {}) =>
    ({ type, ...TAG_SHORTCUT, ...changes }) as unknown as Event;

  it('is the shortcut going down', () => {
    expect(isShortcutPress(event('keydown'))).toBe(true);
  });

  it('is not the shortcut coming up, nor another event the guard hands on', () => {
    expect(isShortcutPress(event('keyup'))).toBe(false);
    expect(isShortcutPress(event('input'))).toBe(false);
  });

  it('is not another key going down', () => {
    expect(isShortcutPress(event('keydown', { code: 'KeyJ' }))).toBe(false);
  });
});

describe('postAnchor', () => {
  it('is placed at the tag button, and gives focus back to the post', () => {
    const shown: boolean[] = [];
    const host = { id: 'host' } as unknown as HTMLElement;
    const post = { id: 'post' } as unknown as HTMLElement;
    const button = {
      postId: '101',
      host,
      button: { id: 'button' } as unknown as HTMLElement,
      setExpanded: (expanded: boolean) => void shown.push(expanded),
    };

    const anchor = postAnchor(button, post);
    anchor.setExpanded(true);

    expect(anchor.postId).toBe('101');
    expect(anchor.host).toBe(host);
    expect(anchor.button).toBe(post);
    expect(shown).toEqual([true]);
  });
});

describe('the tag prompt', () => {
  const box = (top: number, left = 0) => ({ top, left, bottom: top + 20, right: left + 20 });

  it('opens from the first of a post’s buttons wholly on screen', () => {
    expect(inView(box(0), 100, 100)).toBe(true);
    expect(inView(box(-1), 100, 100)).toBe(false);
    expect(inView(box(90), 100, 100)).toBe(false);
    expect(inView(box(0, 90), 100, 100)).toBe(false);
    const boxes = new Map([
      ['gone', undefined],
      ['above', box(-50)],
      ['shown', box(40)],
      ['also shown', box(60)],
    ]);
    const pick = (items: string[]) => firstInView(items, (item) => boxes.get(item), 100, 100);
    expect(pick(['gone', 'above', 'shown', 'also shown'])).toBe('shown');
    expect(pick(['gone', 'above'])).toBeUndefined();
  });

  function timer() {
    const pending = new Map<number, { task: () => void; ms: number }>();
    let next = 0;
    let expired = 0;
    const control = createDismissTimer({
      schedule: (task, ms) => {
        const id = next++;
        pending.set(id, { task, ms });
        return () => pending.delete(id);
      },
      onExpire: () => expired++,
    });
    const fire = () => {
      for (const [id, { task }] of [...pending]) {
        pending.delete(id);
        task();
      }
    };
    return { control, pending, fire, expired: () => expired };
  }

  it('goes after five seconds, unless something holds it', () => {
    const { control, pending, fire, expired } = timer();
    control.start();
    expect([...pending.values()].map(({ ms }) => ms)).toEqual([PROMPT_MS]);
    fire();
    expect(expired()).toBe(1);
    expect(pending.size).toBe(0);
  });

  it('waits while the pointer is over it or focus is in it, then counts again in full', () => {
    const { control, pending, fire, expired } = timer();
    control.start();
    control.hold('pointer');
    control.hold('focus');
    expect(pending.size).toBe(0);
    control.release('pointer');
    expect(pending.size).toBe(0);
    control.release('focus');
    expect([...pending.values()].map(({ ms }) => ms)).toEqual([PROMPT_MS]);
    // Releasing what was not held changes nothing.
    control.release('pointer');
    expect(pending.size).toBe(1);
    fire();
    expect(expired()).toBe(1);
  });

  it('starts afresh when shown again, and stays gone once stopped', () => {
    const { control, pending, expired } = timer();
    control.start();
    control.hold('pointer');
    control.start();
    expect(pending.size).toBe(1);
    control.stop();
    expect(pending.size).toBe(0);
    control.release('pointer');
    expect(pending.size).toBe(0);
    expect(expired()).toBe(0);
  });
});
