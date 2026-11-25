import { describe, expect, it } from 'vitest';
import type { EnvironmentObservation } from '@/src/diagnostics/environment';
import { SETTLE_MS, createDiagnosticsForwarder } from '@/src/diagnostics/forward';
import type { DiagnosticsMessage, ResponseMessage } from '@/src/messaging/protocol';
import { MARKER, VIEWER_ID, bookmarksResponse } from '../fixtures/timeline';

const RESPONSE: ResponseMessage = {
  v: 1,
  kind: 'response',
  op: 'Bookmarks',
  transport: 'xhr',
  host: 'x.com',
  method: 'GET',
  status: 200,
  body: JSON.stringify(bookmarksResponse),
};

const PAGE: EnvironmentObservation = {
  page: 'bookmarks',
  accountCookie: 'ok',
  selectors: {} as EnvironmentObservation['selectors'],
};

/** A clock the test moves by hand. */
function manualTimers() {
  let now = 0;
  const tasks: Array<{ at: number; task: () => void; cancelled: boolean }> = [];
  return {
    schedule(task: () => void, ms: number) {
      const entry = { at: now + ms, task, cancelled: false };
      tasks.push(entry);
      return () => void (entry.cancelled = true);
    },
    advance(ms: number) {
      now += ms;
      for (const entry of tasks) {
        if (!entry.cancelled && entry.at <= now) {
          entry.cancelled = true;
          entry.task();
        }
      }
    },
  };
}

function setup(settleMs?: number) {
  const sent: DiagnosticsMessage[] = [];
  const timers = manualTimers();
  const forwarder = createDiagnosticsForwarder({
    send: (message) => void sent.push(message),
    viewerId: () => VIEWER_ID,
    observePage: () => PAGE,
    schedule: timers.schedule,
    ...(settleMs === undefined ? {} : { settleMs }),
  });
  return { sent, timers, forwarder };
}

describe('createDiagnosticsForwarder', () => {
  it('sends a summary of each response, and none of its content', () => {
    const { sent, forwarder } = setup();
    forwarder.onResponse(RESPONSE);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ type: 'diagnostics/operation', payload: { op: 'Bookmarks' } });
    expect(JSON.stringify(sent)).not.toContain(MARKER);
    expect(JSON.stringify(sent)).not.toContain(VIEWER_ID);
  });

  it('probes the page once it has settled, not after every response', () => {
    const { sent, timers, forwarder } = setup();
    forwarder.onResponse(RESPONSE);
    timers.advance(SETTLE_MS - 1);
    forwarder.onResponse(RESPONSE);
    timers.advance(SETTLE_MS - 1);
    expect(sent.map((message) => message.type)).toEqual([
      'diagnostics/operation',
      'diagnostics/operation',
    ]);

    timers.advance(1);
    expect(sent.at(-1)).toEqual({ type: 'diagnostics/environment', payload: PAGE });
    expect(sent).toHaveLength(3);
  });

  it('waits as long as it is told to', () => {
    const { sent, timers, forwarder } = setup(10);
    forwarder.onResponse(RESPONSE);
    timers.advance(10);
    expect(sent.at(-1)?.type).toBe('diagnostics/environment');
  });
});
