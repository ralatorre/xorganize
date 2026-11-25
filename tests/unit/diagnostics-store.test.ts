import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { observeEnvironment, type ObservedPage } from '@/src/diagnostics/environment';
import { observe } from '@/src/diagnostics/observe';
import { createDiagnosticsStore } from '@/src/diagnostics/store';
import { SELECTORS } from '@/src/dom/selectors';
import { VIEWER_ID, bookmarksResponse } from '../fixtures/timeline';

const operation = () =>
  observe(
    {
      v: 1,
      kind: 'response',
      op: 'Bookmarks',
      transport: 'xhr',
      host: 'x.com',
      method: 'GET',
      status: 200,
      body: JSON.stringify(bookmarksResponse),
    },
    VIEWER_ID,
  );

/** A page whose every selector matches `count` elements. */
const page = (count: number): ObservedPage => ({
  root: { querySelectorAll: () => ({ length: count }) } as unknown as ParentNode,
  pathname: '/i/bookmarks',
  cookie: `twid=u%3D${VIEWER_ID}`,
});

describe('observeEnvironment', () => {
  it('counts what each selector finds on the page it is given', () => {
    const seen = observeEnvironment(page(2));
    expect(seen.page).toBe('/i/bookmarks');
    expect(seen.accountCookie).toBe('ok');
    expect(Object.keys(seen.selectors).sort()).toEqual(Object.keys(SELECTORS).sort());
    expect(Object.values(seen.selectors).every((count) => count === 2)).toBe(true);
  });
});

describe('createDiagnosticsStore', () => {
  it('merges what it records into one report, and clears it', async () => {
    const store = createDiagnosticsStore(new IDBFactory());
    await store.recordOperation(operation());
    await store.recordOperation(operation());
    await store.recordEnvironment(observeEnvironment(page(1)));

    const report = await store.readReport();
    expect(report.operations).toHaveLength(1);
    expect(report.operations[0]).toMatchObject({ op: 'Bookmarks', responses: 2 });

    await store.clearReport();
    expect((await store.readReport()).operations).toEqual([]);
  });

  it('keeps separate stores apart', async () => {
    const factory = new IDBFactory();
    await createDiagnosticsStore(factory, 'one').recordOperation(operation());
    expect((await createDiagnosticsStore(factory, 'two').readReport()).operations).toEqual([]);
  });
});
