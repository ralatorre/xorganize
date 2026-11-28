import { render } from 'preact';
import { DIAGNOSTICS } from '@/src/build';
import { captureChange, chooseAccount, dismissBackupReminder, updateSettings } from '@/src/db/repo';
import type { SourceKind } from '@/src/capture/operations';
import { library } from '@/src/db/schema';
import type { AccountId, PostId, ThemeSetting } from '@/src/db/types';
import type { Theme } from '@/src/dom/theme';
import { createDiagnosticsStore } from '@/src/diagnostics/store';
import { createKeyboardGuard } from '@/src/inline/keyboard-guard';
import { loadAuthorOrder, loadCatalogue } from '@/src/library/browse';
import { createLibraryEdits } from '@/src/library/edits';
import { createLibraryExport } from '@/src/library/exporter';
import { createLibraryImport } from '@/src/library/importer';
import { loadPosts } from '@/src/library/posts';
import { createLibraryTagging } from '@/src/library/tagging';
import { pageOf } from '@/src/library/route';
import { themeFor } from '@/src/library/theme';
import { TAGS_CHANNEL, type TagsEditedNotice } from '@/src/messaging/protocol';
import { createSearchClient } from '@/src/search/client';
import type { ExportedFile } from '@/src/transfer/export';
import { createPopover } from '@/src/ui/popover';
import { App } from './App';
import { Diagnostics } from './Diagnostics';
import type { Pages } from './use-page';
import type { ColourScheme } from './use-theme';
import './tokens.css';
import './style.css';

// Wiring only: the real database, the search worker, the clipboard, file
// downloads, the channel that tells open x.com tabs about edits, and, in the
// diagnostics build, its store.
const db = library();
const catalogue = () => loadCatalogue(db);
const authorOrder = (accountId: AccountId) => loadAuthorOrder(db, accountId);
const posts = (accountId: AccountId, ids: readonly PostId[]) => loadPosts(db, accountId, ids);
const search = createSearchClient(
  new Worker(new URL('./search-worker.ts', import.meta.url), { type: 'module' }),
);
const setRemoteImages = (enabled: boolean) => void updateSettings(db, { remoteImages: enabled });
const setCapture = (source: SourceKind, enabled: boolean) =>
  void updateSettings(db, captureChange(source, enabled));
const setBackupReminder = (days: number) => void updateSettings(db, { backupReminderDays: days });
const setTheme = (theme: ThemeSetting) => void updateSettings(db, { theme });
const dismissReminder = (accountId: AccountId) =>
  void dismissBackupReminder(db, accountId, Date.now());
const showAccount = (accountId: AccountId) => void chooseAccount(db, accountId);

// The page shown is in the address, so Back returns from Settings to the
// list. Moving between the two starts at the top.
const pages: Pages = {
  current: () => pageOf(location.hash),
  watch: (onChange) => {
    let shown = pageOf(location.hash);
    const listener = () => {
      const next = pageOf(location.hash);
      if (next !== shown) window.scrollTo(0, 0);
      shown = next;
      onChange();
    };
    window.addEventListener('hashchange', listener);
    return () => window.removeEventListener('hashchange', listener);
  },
  open: (page) => {
    location.hash = page === 'settings' ? '#settings' : '';
  },
};

// Settings says how much the library takes up. The browser's estimate needs no permission.
const measureStorage = () =>
  navigator.storage.estimate().then(
    ({ usage }) => usage,
    () => undefined,
  );

const channel = new BroadcastChannel(TAGS_CHANNEL);
const announce = (accountId: AccountId) =>
  channel.postMessage({ type: 'tags/edited', accountId } satisfies TagsEditedNotice);
const edits = createLibraryEdits(db, announce);
const importer = createLibraryImport(db, announce);
const copy = (text: string) =>
  navigator.clipboard.writeText(text).then(
    () => true,
    () => false,
  );

/** Long enough for the browser to have read a download's contents. */
const DOWNLOAD_URL_LIFETIME_MS = 60_000;

// A file is handed to the browser as a download from a local blob: no
// permission is needed, and nothing leaves the device.
const save = (file: ExportedFile) => {
  const url = URL.createObjectURL(new Blob(file.parts, { type: file.type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_URL_LIFETIME_MS);
};
const exportTo = createLibraryExport(db, save, () => new Date());

// The theme is set on the root element, which the tokens are keyed on. Until
// the settings are read it follows the system.
const dark = window.matchMedia('(prefers-color-scheme: dark)');
const colourScheme: ColourScheme = {
  dark: () => dark.matches,
  watch: (onChange) => {
    dark.addEventListener('change', onChange);
    return () => dark.removeEventListener('change', onChange);
  },
};
let theme: Theme = themeFor('system', undefined, dark.matches);
const applyTheme = (chosen: Theme) => {
  theme = chosen;
  document.documentElement.dataset.theme = chosen;
};
applyTheme(theme);

// Typing in the popover goes to the popover alone, not to the page's shortcuts.
const guard = createKeyboardGuard(window);
const popoverFor = (accountId: AccountId) =>
  createPopover({
    view: window,
    guard,
    theme: () => theme,
    mountPoint: () => document.body,
    align: 'start',
    look: 'library',
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
      exportPosts={exportTo}
      importer={importer}
      setRemoteImages={setRemoteImages}
      setCapture={setCapture}
      setBackupReminder={setBackupReminder}
      setTheme={setTheme}
      colourScheme={colourScheme}
      applyTheme={applyTheme}
      dismissBackupReminder={dismissReminder}
      chooseAccount={showAccount}
      pages={pages}
      measureStorage={measureStorage}
      now={Date.now}
    >
      {DIAGNOSTICS ? <Diagnostics store={createDiagnosticsStore(indexedDB)} /> : null}
    </App>,
    root,
  );
}
