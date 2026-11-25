import { describe, expect, it } from 'vitest';
import { createContentHandler } from '@/src/capture/content';
import type { ResponseMessage } from '@/src/messaging/protocol';

const RESPONSE: ResponseMessage = {
  v: 1,
  kind: 'response',
  op: 'Bookmarks',
  transport: 'xhr',
  host: 'x.com',
  method: 'GET',
  status: 200,
  body: '{}',
};

function setup(capture: () => Promise<void> = () => Promise.resolve()) {
  const calls: string[] = [];
  const deps = {
    announce: () => void calls.push('announce'),
    capture: (message: ResponseMessage) => (calls.push(`capture ${message.op}`), capture()),
  };
  return { calls, deps };
}

describe('createContentHandler', () => {
  it('announces itself once the page-context script is ready', () => {
    const { calls, deps } = setup();
    createContentHandler(deps)({ v: 1, kind: 'ready' });
    expect(calls).toEqual(['announce']);
  });

  it('hands each response to capture', () => {
    const { calls, deps } = setup();
    createContentHandler(deps)(RESPONSE);
    expect(calls).toEqual(['capture Bookmarks']);
  });

  it('ignores the channel opening', () => {
    const { calls, deps } = setup();
    createContentHandler(deps)({ v: 1, kind: 'open' });
    expect(calls).toEqual([]);
  });

  it('swallows a failed capture, so nothing reaches the page', async () => {
    const { deps } = setup(() => Promise.reject(new Error('boom')));
    const unhandled: unknown[] = [];
    const listener = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', listener);
    createContentHandler(deps)(RESPONSE);
    await new Promise((resolve) => setTimeout(resolve, 0));
    process.off('unhandledRejection', listener);
    expect(unhandled).toEqual([]);
  });

  it('also describes each response, when diagnostics are wired in', () => {
    const { calls, deps } = setup();
    const described: string[] = [];
    createContentHandler({ ...deps, diagnostics: { onResponse: (m) => described.push(m.op) } })(
      RESPONSE,
    );
    expect(calls).toEqual(['capture Bookmarks']);
    expect(described).toEqual(['Bookmarks']);
  });
});
