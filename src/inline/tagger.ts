/**
 * Changes a post's tags from the page. Changes show at once and are then
 * confirmed by the worker; if the worker says no, the post's tags go back to
 * what they were and the failure is reported.
 */

import type { CapturedPost } from '@/src/capture/normalise';
import type { TagSummary } from '@/src/db/types';
import type { TagsSetMessage, TagsSetReply } from '@/src/messaging/protocol';
import { parseTagName, tagKey } from '@/src/tags/names';
import type { TagState } from './tag-state';

/** Marks a tag shown before the worker has confirmed it. */
export const PENDING_PREFIX = 'pending:';
/** Palette index for a tag not yet confirmed: drawn without a colour. */
export const PENDING_COLOUR = -1;

export interface TaggerDependencies {
  accountId(): string | undefined;
  send(message: TagsSetMessage): Promise<TagsSetReply | undefined>;
  /** The post as the page loaded it, and whether it was read from the page itself. */
  postFor(postId: string): { post: CapturedPost; partial: boolean } | undefined;
  state: Pick<TagState, 'get' | 'set'>;
  onFailed(postId: string): void;
}

export interface TagEdit {
  /** Names to add. */
  add?: string[];
  /** Tag ids to remove. */
  remove?: string[];
}

export function createTagger(deps: TaggerDependencies) {
  return async function change(postId: string, edit: TagEdit): Promise<boolean> {
    const accountId = deps.accountId();
    if (accountId === undefined) {
      deps.onFailed(postId);
      return false;
    }
    const before = deps.state.get(postId) ?? [];
    const remove = (edit.remove ?? []).filter((id) => !id.startsWith(PENDING_PREFIX));
    const add = (edit.add ?? []).filter((name) => parseTagName(name).ok);
    deps.state.set(postId, preview(before, add, edit.remove ?? []));

    const found = deps.postFor(postId);
    const reply = await deps
      .send({
        type: 'tags/set',
        accountId,
        postId,
        add,
        remove,
        ...(found ? { post: found.post, partial: found.partial } : {}),
      })
      .catch(() => undefined);

    if (reply?.ok) {
      deps.state.set(postId, reply.tags);
      return true;
    }
    deps.state.set(postId, before);
    deps.onFailed(postId);
    return false;
  };
}

/** The tags as they will be once the change is saved, as far as can be known now. */
export function preview(tags: TagSummary[], add: string[], remove: string[]): TagSummary[] {
  const kept = tags.filter((tag) => !remove.includes(tag.id));
  const keys = new Set(kept.map((tag) => tagKey(tag.name)));
  for (const raw of add) {
    const parsed = parseTagName(raw);
    if (!parsed.ok || keys.has(parsed.nameKey)) continue;
    keys.add(parsed.nameKey);
    kept.push({
      id: `${PENDING_PREFIX}${parsed.nameKey}`,
      name: parsed.name,
      color: PENDING_COLOUR,
    });
  }
  return kept;
}
