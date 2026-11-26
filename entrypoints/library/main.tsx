import { render } from 'preact';
import { DIAGNOSTICS } from '@/src/build';
import { updateSettings } from '@/src/db/repo';
import { library } from '@/src/db/schema';
import type { AccountId, PostId } from '@/src/db/types';
import { createDiagnosticsStore } from '@/src/diagnostics/store';
import { loadAuthorOrder, loadCatalogue } from '@/src/library/browse';
import { loadPosts } from '@/src/library/posts';
import { createSearchClient } from '@/src/search/client';
import { App } from './App';
import { Diagnostics } from './Diagnostics';
import './style.css';

// Wiring only: the real database, the search worker and, in the diagnostics
// build, its store.
const db = library();
const catalogue = () => loadCatalogue(db);
const authorOrder = (accountId: AccountId) => loadAuthorOrder(db, accountId);
const posts = (accountId: AccountId, ids: readonly PostId[]) => loadPosts(db, accountId, ids);
const search = createSearchClient(
  new Worker(new URL('./search-worker.ts', import.meta.url), { type: 'module' }),
);
const setRemoteImages = (enabled: boolean) => void updateSettings(db, { remoteImages: enabled });

const root = document.getElementById('app');
if (root) {
  render(
    <App
      catalogue={catalogue}
      authorOrder={authorOrder}
      posts={posts}
      search={search}
      setRemoteImages={setRemoteImages}
    >
      {DIAGNOSTICS ? <Diagnostics store={createDiagnosticsStore(indexedDB)} /> : null}
    </App>,
    root,
  );
}
