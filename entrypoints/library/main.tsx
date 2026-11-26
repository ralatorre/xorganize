import { render } from 'preact';
import { DIAGNOSTICS } from '@/src/build';
import { updateSettings } from '@/src/db/repo';
import { library } from '@/src/db/schema';
import type { AccountId, PostId } from '@/src/db/types';
import { createDiagnosticsStore } from '@/src/diagnostics/store';
import { loadBrowse } from '@/src/library/browse';
import { loadPosts } from '@/src/library/posts';
import type { View } from '@/src/library/view';
import { App } from './App';
import { Diagnostics } from './Diagnostics';
import './style.css';

// Wiring only: the real database and, in the diagnostics build, its store.
const db = library();
const browse = (view: View) => loadBrowse(db, view);
const posts = (accountId: AccountId, ids: readonly PostId[]) => loadPosts(db, accountId, ids);
const setRemoteImages = (enabled: boolean) => void updateSettings(db, { remoteImages: enabled });

const root = document.getElementById('app');
if (root) {
  render(
    <App browse={browse} posts={posts} setRemoteImages={setRemoteImages}>
      {DIAGNOSTICS ? <Diagnostics store={createDiagnosticsStore(indexedDB)} /> : null}
    </App>,
    root,
  );
}
