import type { ComponentChildren } from 'preact';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'preact/hooks';
import type { AccountId, PostId, TagSuggestion } from '@/src/db/types';
import { EMPTY_CATALOGUE, browseView, type Catalogue } from '@/src/library/browse';
import type { LibraryEdits } from '@/src/library/edits';
import { summaryOf } from '@/src/library/format';
import { IDLE, changeImport, isBusy, type ImportEvent } from '@/src/library/import-flow';
import { previewLines } from '@/src/library/import-messages';
import type { LibraryImport } from '@/src/library/importer';
import { deletionImpact, deletionMessage } from '@/src/library/tag-actions';
import { DEFAULT_VIEW, changeView } from '@/src/library/view';
import { viewScope } from '@/src/library/view-export';
import type { SearchClient } from '@/src/search/client';
import { parseQuery } from '@/src/search/query';
import type { ExportFormat } from '@/src/transfer/format';
import type { ExportScope } from '@/src/transfer/read';
import { buttonAnchor, type Popover } from '@/src/ui/popover';
import { ConfirmDialog } from './components/ConfirmDialog';
import { EmptyLibrary } from './components/EmptyLibrary';
import { ExportControl } from './components/ExportControl';
import { FilterBar } from './components/FilterBar';
import { ImageSetting } from './components/ImageSetting';
import { ImportControl } from './components/ImportControl';
import { ImportDialog } from './components/ImportDialog';
import { NoMatches } from './components/NoMatches';
import type { PostActions } from './components/PostCard';
import { PostList } from './components/PostList';
import { SearchBox } from './components/SearchBox';
import { ShortcutHelp } from './components/ShortcutHelp';
import { Sidebar } from './components/Sidebar';
import type { TagManagement } from './components/TagManager';
import { ViewSummary } from './components/ViewSummary';
import type { PostNavigation } from './use-post-navigation';
import type { LoadPosts } from './use-post-views';
import { useLiveQuery } from './use-live-query';
import { useShortcuts } from './use-shortcuts';
import { useTextSearch } from './use-text-search';

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
  /** Exports posts to a file the browser saves. Resolves to how many, or undefined if it failed. */
  exportPosts(
    accountId: AccountId,
    scope: ExportScope,
    format: ExportFormat,
  ): Promise<number | undefined>;
  /** Reads a backup the user picked, and imports it. */
  importer: LibraryImport;
  /** Turns images from X on or off. */
  setRemoteImages(enabled: boolean): void;
  /** Shown below the library: the diagnostics panel, in that build. */
  children?: ComponentChildren;
}

const LIBRARY_FORMATS: Record<ExportFormat, string> = { json: 'JSON backup', csv: 'CSV' };
const VIEW_FORMATS: Record<ExportFormat, string> = { json: 'JSON', csv: 'CSV' };

/** A question the library is asking, or the shortcut list. */
type Dialog =
  | { kind: 'delete-tag'; tag: TagSuggestion }
  | { kind: 'remove-post'; postId: PostId }
  | { kind: 'shortcuts' };

/**
 * The library page. It is handed how to read and change the library. It does
 * not open it. The catalogue is re-read when the library changes; each view
 * is worked out from it at once, and search results join it from the worker.
 */
export function App(props: LibraryProps) {
  const { catalogue, authorOrder, posts, search, edits, copy, setRemoteImages, children } = props;
  const { exportPosts, importer } = props;
  const [view, change] = useReducer(changeView, DEFAULT_VIEW);
  const [flow, step] = useReducer(changeImport, IDLE);
  const [dialog, setDialog] = useState<Dialog>();
  const searchInput = useRef<HTMLInputElement>(null);
  const navigation = useRef<PostNavigation | undefined>(undefined);

  const library = useLiveQuery(catalogue, EMPTY_CATALOGUE);
  const account = library?.account;
  const query = useMemo(() => parseQuery(view.query), [view.query]);
  const text = useTextSearch(search, account, query);

  const { createPopover } = props;
  const popover = useMemo(
    () => (account === undefined ? undefined : createPopover(account)),
    [createPopover, account],
  );
  useEffect(() => () => popover?.close(false), [popover]);

  useShortcuts({
    search: () => {
      searchInput.current?.focus();
      searchInput.current?.select();
    },
    next: () => navigation.current?.move(1),
    previous: () => navigation.current?.move(-1),
    tag: () => navigation.current?.act('tag') ?? false,
    open: () => navigation.current?.act('open') ?? false,
    help: () => setDialog({ kind: 'shortcuts' }),
  });

  // Read only while the Author order is chosen.
  const byAuthors = view.sort === 'author' && account !== undefined;
  const readAuthors = useCallback(
    () => (byAuthors ? authorOrder(account) : Promise.resolve(undefined)),
    [authorOrder, byAuthors, account],
  );
  const byAuthor = useLiveQuery(readAuthors, undefined);

  const matches = text.state === 'done' ? text.ids : undefined;
  const state = useMemo(
    () => library && browseView(library, view, { matches, byAuthor }),
    [library, view, matches, byAuthor],
  );

  if (!library || !state) return <main class="library" />;

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
  const importControl = (label: string) => (
    <ImportControl
      label={label}
      busy={isBusy(flow)}
      status={flow.step === 'idle' ? flow.status : ''}
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

  if (state.account === undefined || state.counts.all === 0) {
    return (
      <main class="library library--empty">
        <h1 class="sidebar__title">xorganize</h1>
        <EmptyLibrary>{importControl('Restore from a backup')}</EmptyLibrary>
        {children}
        {importDialog}
      </main>
    );
  }

  const accountId = state.account;
  const manage: TagManagement = {
    rename: (tagId, name) => edits.rename(accountId, tagId, name),
    recolour: (tagId, colour) => void edits.recolour(accountId, tagId, colour),
    merge: (fromId, intoId) => void edits.merge(accountId, fromId, intoId),
    remove: (tag) => setDialog({ kind: 'delete-tag', tag }),
  };
  const actions: PostActions = {
    onTag: (postId, button) => popover?.toggle(buttonAnchor(postId, button)),
    onCopyLink: copy,
    onRemove: (postId) => setDialog({ kind: 'remove-post', postId }),
  };
  const closeDialog = () => setDialog(undefined);

  // Until the text search answers, the list would show posts it may not match.
  const listed = text.state === 'none' || text.state === 'done';
  return (
    <div class="library">
      <Sidebar
        counts={state.counts}
        tags={state.tags}
        view={view}
        onChange={change}
        manage={manage}
      >
        <section class="sidebar__section" aria-labelledby="settings-title">
          <h2 id="settings-title">Settings</h2>
          <ImageSetting enabled={state.settings.remoteImages} onChange={setRemoteImages} />
          <ExportControl
            label="Export library"
            formats={LIBRARY_FORMATS}
            onExport={(format) => exportPosts(accountId, 'library', format)}
          />
          {importControl('Import backup')}
        </section>
      </Sidebar>
      <main class="library__main">
        <SearchBox
          query={view.query}
          onChange={(query) => change({ type: 'query', query })}
          inputRef={searchInput}
        />
        <FilterBar selected={state.selected} match={view.match} onChange={change} />
        <ViewSummary
          status={summaryOf(text, state.ids.length)}
          sort={view.sort}
          onSort={(sort) => change({ type: 'sort', sort })}
        >
          {listed && state.ids.length > 0 ? (
            <ExportControl
              label="Export view"
              formats={VIEW_FORMATS}
              onExport={(format) => exportPosts(accountId, viewScope(state), format)}
            />
          ) : null}
        </ViewSummary>
        {!listed ? null : state.ids.length > 0 ? (
          <PostList
            accountId={accountId}
            ids={state.ids}
            load={posts}
            images={state.settings.remoteImages}
            actions={actions}
            navigation={navigation}
          />
        ) : (
          <NoMatches onClear={() => change({ type: 'clear' })} />
        )}
        {children}
      </main>
      {dialog?.kind === 'delete-tag' ? (
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
      ) : dialog?.kind === 'remove-post' ? (
        <ConfirmDialog
          title="Remove this post from the library?"
          message="Its tags are taken off. If it is still bookmarked or liked on X, it comes back the next time those pages load."
          confirm="Remove"
          onConfirm={() => {
            void edits.removePost(accountId, dialog.postId);
            closeDialog();
          }}
          onCancel={closeDialog}
        />
      ) : dialog?.kind === 'shortcuts' ? (
        <ShortcutHelp onClose={closeDialog} />
      ) : null}
      {importDialog}
    </div>
  );
}
