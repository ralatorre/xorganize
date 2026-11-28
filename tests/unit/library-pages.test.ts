import { describe, expect, it } from 'vitest';
import type { StoredAccount } from '@/src/db/types';
import { accountLabel, sizeLine, storedLine } from '@/src/library/accounts';
import { DAY_MS, lastBackupLine } from '@/src/library/backup-reminder';
import { menuIndex } from '@/src/library/menu';
import { pageOf } from '@/src/library/route';
import { NO_TOAST, changeToast } from '@/src/library/toast';
import { noMatchLine, viewTitle } from '@/src/library/toolbar';

const ACCOUNT = '9000000000000000001';
const OTHER = '9000000000000000002';

describe('pageOf', () => {
  it.each(['#settings', '#settings-privacy', '#settings-danger'])(
    'shows Settings for %s',
    (hash) => {
      expect(pageOf(hash)).toBe('settings');
    },
  );

  it.each(['', '#', '#settingsx', '#other', 'settings'])('shows the library for %j', (hash) => {
    expect(pageOf(hash)).toBe('library');
  });
});

describe('accountLabel', () => {
  it('uses the handle when it has been seen on x.com', () => {
    expect(accountLabel({ accountId: ACCOUNT, handle: 'some_one' })).toBe('@some_one');
  });

  it('uses the last digits of the ID until then', () => {
    expect(accountLabel({ accountId: ACCOUNT })).toBe('X account ···0001');
  });
});

describe('storedLine', () => {
  const account = (accountId: string, extra: Partial<StoredAccount> = {}): StoredAccount => ({
    accountId,
    posts: 10,
    tags: 7,
    assignments: 13,
    ...extra,
  });

  it('says so when nothing is stored', () => {
    expect(storedLine([], undefined)).toBe('Nothing is stored yet.');
  });

  it('lists the shown account first, then the others', () => {
    const accounts = [
      account(ACCOUNT),
      account(OTHER, { handle: 'second', posts: 1, tags: 1, assignments: 1 }),
    ];
    expect(storedLine(accounts, OTHER)).toBe(
      '1 post, 1 tag and 1 tag assignment for @second; ' +
        '10 posts, 7 tags and 13 tag assignments for X account ···0001.',
    );
  });
});

describe('sizeLine', () => {
  it.each([
    [0, 'About 0.1 KB'],
    [1_234, 'About 1.2 KB'],
    [45_600, 'About 46 KB'],
    [1_200_000, 'About 1.2 MB'],
    [2_500_000_000, 'About 2.5 GB'],
    [9_000_000_000_000, 'About 9,000 GB'],
  ])('writes %i bytes as %s', (bytes, line) => {
    expect(sizeLine(bytes)).toBe(line);
  });
});

describe('lastBackupLine', () => {
  const NOW = Date.UTC(2026, 10, 27, 12);

  it('says when there has been no backup', () => {
    expect(lastBackupLine({}, NOW)).toBe('Never backed up.');
  });

  it.each([
    [0, 'Last backed up today.'],
    [1, 'Last backed up yesterday.'],
    [12, 'Last backed up 12 days ago.'],
  ])('%i days after a backup, says %s', (days, line) => {
    expect(lastBackupLine({ lastBackupAt: NOW - days * DAY_MS - 1 }, NOW)).toBe(line);
  });

  it('treats a backup in the future as today', () => {
    expect(lastBackupLine({ lastBackupAt: NOW + DAY_MS }, NOW)).toBe('Last backed up today.');
  });
});

describe('menuIndex', () => {
  it('starts at either end when nothing has focus', () => {
    expect(menuIndex(-1, 'ArrowDown', 3)).toBe(0);
    expect(menuIndex(-1, 'ArrowUp', 3)).toBe(2);
  });

  it('wraps round with the arrows', () => {
    expect(menuIndex(2, 'ArrowDown', 3)).toBe(0);
    expect(menuIndex(0, 'ArrowUp', 3)).toBe(2);
    expect(menuIndex(1, 'ArrowDown', 3)).toBe(2);
  });

  it('goes to either end with Home and End', () => {
    expect(menuIndex(1, 'Home', 3)).toBe(0);
    expect(menuIndex(1, 'End', 3)).toBe(2);
  });

  it('ignores other keys, and a menu with no items', () => {
    expect(menuIndex(1, 'a', 3)).toBeUndefined();
    expect(menuIndex(-1, 'ArrowDown', 0)).toBeUndefined();
  });
});

describe('changeToast', () => {
  const undo = { label: 'Undo', run: () => undefined };

  it('shows one toast, which a new one replaces', () => {
    const first = changeToast(NO_TOAST, { type: 'show', message: 'Link copied' });
    expect(first.shown).toEqual({ id: 1, message: 'Link copied' });
    const second = changeToast(first, { type: 'show', message: 'Removed', action: undo });
    expect(second.shown).toEqual({ id: 2, message: 'Removed', action: undo });
  });

  it('closes only the toast it was asked to', () => {
    const first = changeToast(NO_TOAST, { type: 'show', message: 'One' });
    const second = changeToast(first, { type: 'show', message: 'Two' });
    expect(changeToast(second, { type: 'close', id: 1 })).toBe(second);
    expect(changeToast(second, { type: 'close', id: 2 }).shown).toBeUndefined();
  });
});

describe('the toolbar', () => {
  it('titles the view by its tag when one tag is chosen among all posts', () => {
    expect(viewTitle('all', [{ name: 'rust' }])).toBe('rust');
    expect(viewTitle('all', [])).toBe('All posts');
    expect(viewTitle('all', [{ name: 'rust' }, { name: 'go' }])).toBe('All posts');
    expect(viewTitle('bookmarks', [{ name: 'rust' }])).toBe('Bookmarks');
  });

  it.each([
    ['bookmarks', 'tokio', 0, 'Nothing in Bookmarks matches “tokio”.'],
    ['all', '  tokio ', 2, 'Nothing in All posts matches “tokio” with these tags.'],
    ['untagged', '', 1, 'Nothing in Untagged matches these filters.'],
  ] as const)('says why nothing in %s matches %j', (source, query, tags, line) => {
    expect(noMatchLine(source, query, tags)).toBe(line);
  });
});
