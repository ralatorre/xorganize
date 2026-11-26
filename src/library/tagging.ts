/**
 * What the tag popover needs in the library: the same tag state and
 * optimistic changes as on x.com (src/inline/), reading and writing the
 * database directly instead of messaging the worker.
 */

import type { AccountId } from '@/src/db/types';
import { POPOVER_SUGGESTIONS, type Suggestions } from '@/src/inline/popover-model';
import { createTagState, type TagState } from '@/src/inline/tag-state';
import { createTagger, type TagEdit } from '@/src/inline/tagger';
import type { LibraryEdits } from './edits';

export interface LibraryTaggingDependencies {
  edits: Pick<LibraryEdits, 'tagsOf' | 'suggest' | 'setTags'>;
  accountId: AccountId;
  /** Runs `task` soon, once, so that several requests can be gathered. */
  schedule(task: () => void): void;
}

export interface LibraryTagging {
  state: TagState;
  change(postId: string, edit: TagEdit): Promise<boolean>;
  suggest(query: string): Promise<Suggestions | undefined>;
}

export function createLibraryTagging(deps: LibraryTaggingDependencies): LibraryTagging {
  const { edits, accountId } = deps;
  const state = createTagState({
    fetch: (postIds) => edits.tagsOf(accountId, postIds),
    schedule: deps.schedule,
  });
  const change = createTagger({
    accountId: () => accountId,
    send: ({ postId, add, remove }) =>
      edits.setTags(accountId, postId, { add, remove }).then(
        (tags) => ({ ok: true as const, tags }),
        () => ({ ok: false as const }),
      ),
    postFor: () => undefined, // every post the library shows is stored already
    state,
    onFailed: () => {}, // the popover says so itself
  });
  const suggest = (query: string) =>
    edits.suggest(accountId, query, POPOVER_SUGGESTIONS).catch(() => undefined);
  return { state, change, suggest };
}
