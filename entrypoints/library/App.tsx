import type { ComponentChildren } from 'preact';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'preact/hooks';
import type { SourceKind } from '@/src/capture/operations';
import type { AccountId, PostId, TagSuggestion, ThemeSetting as ThemeChoice } from '@/src/db/types';
import type { Theme } from '@/src/dom/theme';
import { backupReminder, lastBackupLine, reminderMessage } from '@/src/library/backup-reminder';
import { EMPTY_CATALOGUE, browseView, type Catalogue } from '@/src/library/browse';
import type { LibraryEdits } from '@/src/library/edits';
import { summaryOf } from '@/src/library/format';
import { IDLE, changeImport, isBusy, type ImportEvent } from '@/src/library/import-flow';
import { previewLines } from '@/src/library/import-messages';
import type { LibraryImport } from '@/src/library/importer';
import {
  createProblem,
  deletionImpact,
  deletionMessage,
  renameProblem,
} from '@/src/library/tag-actions';
import { groupCounts, tagTree } from '@/src/library/tag-tree';
import { DEFAULT_VIEW, changeView, type SourceFilter } from '@/src/library/view';
import { backupMessage, exportMessage, viewScope } from '@/src/library/view-export';
import { isBackup, type LibraryExport } from '@/src/library/exporter';
import { UNTAGGED_HINT, noMatchLine, viewTitle } from '@/src/library/toolbar';
import type { SearchClient } from '@/src/search/client';
import { parseQuery } from '@/src/search/query';
import type { ExportFormat } from '@/src/transfer/format';
import type { ExportScope } from '@/src/transfer/read';
import { buttonAnchor, type Popover } from '@/src/ui/popover';
import { AccountMenu } from './components/AccountMenu';
import { BackupReminder } from './components/BackupReminder';
import { ConfirmDialog } from './components/ConfirmDialog';
import { DeleteAllDialog } from './components/DeleteAllDialog';
import { EmptyLibrary } from './components/EmptyLibrary';
import { ExportMenu } from './components/ExportMenu';
import { FilterBar } from './components/FilterBar';
import { FilterSheet } from './components/FilterSheet';
import { Header } from './components/Header';
import { ImportControl } from './components/ImportControl';
import { ImportDialog } from './components/ImportDialog';
import { MergeTagDialog } from './components/MergeTagDialog';
import { NoMatches } from './components/NoMatches';
import type { PostActions } from './components/PostCard';
import { PostList } from './components/PostList';
import { SearchBox } from './components/SearchBox';
import { SettingsPage } from './components/SettingsPage';
import { ShortcutHelp } from './components/ShortcutHelp';
import { SortMenu } from './components/SortMenu';
import { Toasts } from './components/Toasts';
import { Toolbar } from './components/Toolbar';
import { Sidebar } from './components/Sidebar';
import { SourcePills } from './components/SourcePills';
import type { TagActions } from './components/TagList';
import { TagNameDialog } from './components/TagNameDialog';
import type { PostNavigation } from './use-post-navigation';
import type { LoadPosts } from './use-post-views';
import { useLiveQuery } from './use-live-query';
import { usePage, type Pages } from './use-page';
import { useShortcuts } from './use-shortcuts';
import { useTextSearch } from './use-text-search';
import { useTheme, type ColourScheme } from './use-theme';
import { useToasts } from './use-toasts';

export interface LibraryProps {
  /** Reads the library's sources and tags. Re-run whenever the data it read changes. */
  catalogue(): Promise<Catalogue>;
  /** Reads every post by author, for the Author order. */
  authorOrder(accountId: AccountId): Promise<PostId[]>;
  /** Reads the cards for the rows on screen. */
  posts: LoadPosts;
  /** Searches post text and authors in the search worker. */
  search: SearchClient;
  /** Changes tags and posts. */
  edits: LibraryEdits;
  /** The tag popover for an account's posts. */
  createPopover(accountId: AccountId): Popover;
  /** Puts text on the clipboard. False if the browser refused. */
  copy(text: string): Promise<boolean>;
  /** Exports posts to a file the browser saves. Resolves to what was saved, or undefined if it failed. */
  exportPosts: LibraryExport;
  /** Reads a backup the user picked, and imports it. */
  importer: LibraryImport;
  /** Turns images from X on or off. */
  setRemoteImages(enabled: boolean): void;
  /** Turns capturing bookmarks or likes on or off. */
  setCapture(source: SourceKind, enabled: boolean): void;
  /** Chooses the library's theme. */
  setTheme(theme: ThemeChoice): void;
  /** Whether the system asks for dark colours, for the System and Match X themes. */
  colourScheme: ColourScheme;
  /** Shows the library in a theme. */
  applyTheme(theme: Theme): void;
  /** Sets how many days after a backup the library reminds the user. 0: never. */
  setBackupReminder(days: number): void;
  /** Puts the backup reminder off for one interval. */
  dismissBackupReminder(accountId: AccountId): void;
  /** Shows another account's library. */
  chooseAccount(accountId: AccountId): void;
  /** Which page of the library the address shows. */
  pages: Pages;
  /** How many bytes the library takes up in this browser, if the browser says. */
  measureStorage(): Promise<number | undefined>;
  /** The time, in epoch milliseconds. */
  now(): number;
  /** Shown below the library: the diagnostics panel, in that build. */
  children?: ComponentChildren;
}

/** A question the library is asking, or the shortcut list. */
type Dialog =
  | { kind: 'new-tag' }
  | { kind: 'rename-tag'; tag: TagSuggestion }
  | { kind: 'merge-tag'; tag: TagSuggestion }
  | { kind: 'delete-tag'; tag: TagSuggestion }
  | { kind: 'delete-all' }
  | { kind: 'shortcuts' }
  | { kind: 'filters' };

/**
 * The library page. It is handed how to read and change the library. It does
 * not open it. The catalogue is re-read when the library changes; each view
 * is worked out from it at once, and search results join it from the worker.
 */
export function App(props: LibraryProps) {
  const { catalogue, authorOrder, posts, search, edits, copy, setRemoteImages, children } = props;
  const { exportPosts, importer, setBackupReminder, dismissBackupReminder, now } = props;
  const { setCapture, setTheme, colourScheme, applyTheme, chooseAccount, pages, measureStorage } =
    props;
  const page = usePage(pages);
  const [view, change] = useReducer(changeView, DEFAULT_VIEW);
  const [flow, step] = useReducer(changeImport, IDLE);
  const [dialog, setDialog] = useState<Dialog>();
  const searchInput = useRef<HTMLInputElement>(null);
  const navigation = useRef<PostNavigation | undefined>(undefined);
  const toasts = useToasts();
  // How a picked file or an import went is said in a toast.
  useEffect(() => {
    if (flow.step === 'idle' && flow.status !== '') toasts.show(flow.status);
  }, [flow]);

  const library = useLiveQuery(catalogue, EMPTY_CATALOGUE);
  const account = library?.account;
  useTheme(
    library && { setting: library.settings.theme, xTheme: library.xTheme },
    colourScheme,
    applyTheme,
  );
  const query = useMemo(() => parseQuery(view.query), [view.query]);
  const text = useTextSearch(search, account, query);

  const { createPopover } = props;
  const popover = useMemo(
    () => (account === undefined ? undefined : createPopover(account)),
    [createPopover, account],
  );
  useEffect(() => () => popover?.close(false), [popover]);

  // On Settings only `?` acts: the others are for the list.
  const onList = page === 'library';
  useShortcuts({
    search: () => {
      if (!onList || !searchInput.current) return false;
      searchInput.current.focus();
      searchInput.current.select();
    },
    next: () => (onList ? navigation.current?.move(1) : false),
    previous: () => (onList ? navigation.current?.move(-1) : false),
    tag: () => (onList && navigation.current?.act('tag')) ?? false,
    open: () => (onList && navigation.current?.act('open')) ?? false,
    help: () => setDialog({ kind: 'shortcuts' }),
  });

  // Read only while the Author order is chosen.
  const byAuthors = view.sort === 'author' && account !== undefined;
  const readAuthors = useCallback(
    () => (byAuthors ? authorOrder(account) : Promise.resolve(undefined)),
    [authorOrder, byAuthors, account],
  );
  const byAuthor = useLiveQuery(readAuthors, undefined);

  // The sidebar's tree changes only with the library, not with each view.
  const sidebarTags = useMemo(() => {
    const tree = tagTree(library?.tags ?? []);
    return { tree, groupCounts: groupCounts(tree, library?.tagged ?? new Map()) };
  }, [library]);

  const matches = text.state === 'done' ? text.ids : undefined;
  const state = useMemo(
    () => library && browseView(library, view, { matches, byAuthor }),
    [library, view, matches, byAuthor],
  );

  if (!library || !state) return <div class="app" />;

  // Import: pick a file, preview it, then merge or replace.
  const pickBackup = (file: File) => {
    step({ type: 'read' });
    void importer.read(file).then((result) => step({ type: 'parsed', result }));
  };
  const writeBackup = (mode: ImportEvent & { type: 'write' }) => {
    if (flow.step !== 'preview' || changeImport(flow, mode).step !== 'importing') return;
    const { backup } = flow;
    step(mode);
    void importer.write(backup, mode.mode).then((result) => step({ type: 'written', result }));
  };
  const importControl = (label: string, buttonClass?: string) => (
    <ImportControl
      label={label}
      {...(buttonClass ? { buttonClass } : {})}
      busy={isBusy(flow)}
      onFile={pickBackup}
    />
  );
  const importDialog =
    flow.step === 'preview' || flow.step === 'importing' ? (
      <ImportDialog
        lines={previewLines(flow.summary, state.account)}
        canReplace={!flow.summary.partial}
        busy={flow.step === 'importing'}
        onMerge={() => writeBackup({ type: 'write', mode: 'merge' })}
        onReplace={() => writeBackup({ type: 'write', mode: 'replace' })}
        onCancel={() => step({ type: 'cancel' })}
      />
    ) : null;

  const closeDialog = () => setDialog(undefined);
  // Every export reports in a toast: a backup by its file's name, anything else by its count.
  const exportAndSay = (accountId: AccountId, scope: ExportScope, format: ExportFormat) =>
    exportPosts(accountId, scope, format).then((exported) =>
      toasts.show(
        isBackup(scope, format) ? backupMessage(exported) : exportMessage(exported, format),
      ),
    );
  const time = now();
  const empty = state.account === undefined || state.counts.all === 0;
  const accountId = empty ? undefined : state.account;
  const accountMenu = (
    <AccountMenu
      accounts={library.accounts}
      shown={accountId}
      images={state.settings.remoteImages}
      onChoose={chooseAccount}
    />
  );
  const help = () => setDialog({ kind: 'shortcuts' });

  const shared =
    dialog?.kind === 'delete-all' ? (
      <DeleteAllDialog
        onDelete={() => {
          void edits.deleteAll();
          closeDialog();
          pages.open('library');
        }}
        onCancel={closeDialog}
      />
    ) : dialog?.kind === 'shortcuts' ? (
      <ShortcutHelp onClose={closeDialog} />
    ) : null;

  if (page === 'settings') {
    return (
      <div class="app">
        <Header page="settings" account={accountMenu} onHelp={help} />
        <SettingsPage
          settings={state.settings}
          accounts={library.accounts}
          shown={accountId}
          measure={measureStorage}
          exports={
            accountId === undefined
              ? undefined
              : {
                  lastBackup: lastBackupLine(library.backup, time),
                  backUp: () => void exportAndSay(accountId, 'library', 'json'),
                  exportCsv: () => void exportAndSay(accountId, 'library', 'csv'),
                }
          }
          restore={importControl('Choose a file…', 'button')}
          onCapture={setCapture}
          onTheme={setTheme}
          onImages={setRemoteImages}
          onReminder={setBackupReminder}
          onDeleteAll={() => setDialog({ kind: 'delete-all' })}
        />
        {shared}
        {importDialog}
        <Toasts shown={toasts.state.shown} onClose={toasts.close} />
      </div>
    );
  }

  if (accountId === undefined) {
    return (
      <div class="app">
        <Header page="library" onHelp={help} />
        <main class="shell shell--single">
          <EmptyLibrary>
            {importControl('Restore from a backup', 'button button--large')}
          </EmptyLibrary>
          {children}
        </main>
        {shared}
        {importDialog}
        <Toasts shown={toasts.state.shown} onClose={toasts.close} />
      </div>
    );
  }

  const tagActions: TagActions = {
    create: () => setDialog({ kind: 'new-tag' }),
    rename: (tag) => setDialog({ kind: 'rename-tag', tag }),
    recolour: (tag, colour) => void edits.recolour(accountId, tag.id, colour),
    merge: (tag) => setDialog({ kind: 'merge-tag', tag }),
    remove: (tag) => setDialog({ kind: 'delete-tag', tag }),
  };
  const actions: PostActions = {
    onTag: (postId, button) => popover?.toggle(buttonAnchor(postId, button)),
    onCopyLink: (url) =>
      void copy(url).then((copied) =>
        toasts.show(copied ? 'Link copied' : 'Could not copy the link'),
      ),
    // At once, with Undo: a question every time would slow triage (DESIGN, 8, decision 10).
    onRemove: (postId) =>
      void edits.removePost(accountId, postId).then((removed) => {
        if (!removed) return;
        toasts.show('Removed from library', {
          label: 'Undo',
          run: () => void edits.restorePost(removed),
        });
      }),
    onShowTag: (tagId, add) => change({ type: 'tag', tagId, add }),
  };
  const reminder = backupReminder(library.backup, state.settings.backupReminderDays, time);
  const pickSource = (source: SourceFilter) => change({ type: 'source', source });

  // Until the text search answers, the list would show posts it may not match.
  const listed = text.state === 'none' || text.state === 'done';
  return (
    <div class="app">
      <Header
        page="library"
        search={
          <SearchBox
            query={view.query}
            onChange={(query) => change({ type: 'query', query })}
            inputRef={searchInput}
          />
        }
        account={accountMenu}
        filters={{ chosen: view.tags.length, onOpen: () => setDialog({ kind: 'filters' }) }}
        onHelp={help}
      />
      <div class="shell">
        <Sidebar
          counts={state.counts}
          tags={state.tags}
          tree={sidebarTags.tree}
          groupCounts={sidebarTags.groupCounts}
          view={view}
          onChange={change}
          actions={tagActions}
        />
        <main class="content">
          <SourcePills counts={state.counts} selected={view.source} onSelect={pickSource} />
          <Toolbar
            title={viewTitle(view.source, state.selected)}
            status={summaryOf(text, state.ids.length)}
            {...(view.source === 'untagged' ? { hint: UNTAGGED_HINT } : {})}
          >
            <SortMenu sort={view.sort} onSort={(sort) => change({ type: 'sort', sort })} />
            {listed && state.ids.length > 0 ? (
              <ExportMenu
                count={state.ids.length}
                onExport={(format) => void exportAndSay(accountId, viewScope(state), format)}
              />
            ) : null}
          </Toolbar>
          <FilterBar
            query={view.query}
            selected={state.selected}
            match={view.match}
            onChange={change}
          />
          {reminder.due ? (
            <BackupReminder
              message={reminderMessage(reminder, time)}
              onBackUp={() => exportAndSay(accountId, 'library', 'json')}
              onLater={() => dismissBackupReminder(accountId)}
            />
          ) : null}
          {!listed ? null : state.ids.length > 0 ? (
            <PostList
              accountId={accountId}
              ids={state.ids}
              load={posts}
              images={state.settings.remoteImages}
              actions={actions}
              navigation={navigation}
              now={time}
            />
          ) : (
            <NoMatches
              line={noMatchLine(view.source, view.query, state.selected.length)}
              {...(view.query.trim() === ''
                ? {}
                : { onClearSearch: () => change({ type: 'query', query: '' }) })}
              onShowAll={() => change({ type: 'clear' })}
            />
          )}
          {children}
        </main>
      </div>
      {dialog?.kind === 'filters' ? (
        <FilterSheet
          tags={state.tags}
          selected={state.selected}
          match={view.match}
          count={state.ids.length}
          onChange={change}
          onClose={closeDialog}
        />
      ) : dialog?.kind === 'new-tag' ? (
        <TagNameDialog
          title="New tag"
          save="Create tag"
          onSave={(name) =>
            edits
              .createTag(accountId, name)
              .then((result) => (result.ok ? undefined : createProblem(result.problem)))
          }
          onClose={closeDialog}
        />
      ) : dialog?.kind === 'rename-tag' ? (
        <TagNameDialog
          title={`Rename “${dialog.tag.name}”`}
          name={dialog.tag.name}
          save="Rename"
          onSave={(name) =>
            edits
              .rename(accountId, dialog.tag.id, name)
              .then((result) => (result.ok ? undefined : renameProblem(result.problem)))
          }
          onClose={closeDialog}
        />
      ) : dialog?.kind === 'merge-tag' ? (
        <MergeTagDialog
          tag={dialog.tag}
          others={state.tags.filter((other) => other.id !== dialog.tag.id)}
          onMerge={(intoId) => {
            void edits.merge(accountId, dialog.tag.id, intoId);
            closeDialog();
          }}
          onClose={closeDialog}
        />
      ) : dialog?.kind === 'delete-tag' ? (
        <ConfirmDialog
          title={`Delete the tag “${dialog.tag.name}”?`}
          message={deletionMessage(deletionImpact(library, dialog.tag.id))}
          confirm="Delete tag"
          onConfirm={() => {
            void edits.deleteTag(accountId, dialog.tag.id);
            closeDialog();
          }}
          onCancel={closeDialog}
        />
      ) : (
        shared
      )}
      {importDialog}
      <Toasts shown={toasts.state.shown} onClose={toasts.close} />
    </div>
  );
}
