import { render } from 'preact';
import { DIAGNOSTICS } from '@/src/build';
import { updateSettings } from '@/src/db/repo';
import { library } from '@/src/db/schema';
import type { AccountId, PostId } from '@/src/db/types';
import { createDiagnosticsStore } from '@/src/diagnostics/store';
import { createKeyboardGuard } from '@/src/inline/keyboard-guard';
import { loadAuthorOrder, loadCatalogue } from '@/src/library/browse';
import { createLibraryEdits } from '@/src/library/edits';
import { loadPosts } from '@/src/library/posts';
import { createLibraryTagging } from '@/src/library/tagging';
import { TAGS_CHANNEL, type TagsEditedNotice } from '@/src/messaging/protocol';
import { createSearchClient } from '@/src/search/client';
import { createPopover } from '@/src/ui/popover';
import { App } from './App';
import { Diagnostics } from './Diagnostics';
import './style.css';

// Wiring only: the real database, the search worker, the clipboard, the
// channel that tells open x.com tabs about edits, and, in the diagnostics
// build, its store.
const db = library();
const catalogue = () => loadCatalogue(db);
const authorOrder = (accountId: AccountId) => loadAuthorOrder(db, accountId);
const posts = (accountId: AccountId, ids: readonly PostId[]) => loadPosts(db, accountId, ids);
const search = createSearchClient(
  new Worker(new URL('./search-worker.ts', import.meta.url), { type: 'module' }),
);
const setRemoteImages = (enabled: boolean) => void updateSettings(db, { remoteImages: enabled });

const channel = new BroadcastChannel(TAGS_CHANNEL);
const edits = createLibraryEdits(db, (accountId) =>
  channel.postMessage({ type: 'tags/edited', accountId } satisfies TagsEditedNotice),
);
const copy = (text: string) =>
  navigator.clipboard.writeText(text).then(
    () => true,
    () => false,
  );

// Typing in the popover goes to the popover alone, not to the page's shortcuts.
const guard = createKeyboardGuard(window);
const dark = window.matchMedia('(prefers-color-scheme: dark)');
const popoverFor = (accountId: AccountId) =>
  createPopover({
    view: window,
    guard,
    theme: () => (dark.matches ? 'dark' : 'light'),
    mountPoint: () => document.body,
    ...createLibraryTagging({ edits, accountId, schedule: (task) => void setTimeout(task, 0) }),
  });

const root = document.getElementById('app');
if (root) {
  render(
    <App
      catalogue={catalogue}
      authorOrder={authorOrder}
      posts={posts}
      search={search}
      edits={edits}
      createPopover={popoverFor}
      copy={copy}
      setRemoteImages={setRemoteImages}
    >
      {DIAGNOSTICS ? <Diagnostics store={createDiagnosticsStore(indexedDB)} /> : null}
    </App>,
    root,
  );
}
