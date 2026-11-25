/**
 * Decides what to do with each response the interceptor observed.
 *
 * Runs in the isolated content script. It never touches the page or the
 * database itself: it is handed the two things it needs, which also makes it
 * easy to test.
 */

import type { Counts } from '@/src/db/types';
import { isId, isRecord } from '@/src/guards';
import type { CaptureMessage, CaptureReply, ResponseMessage } from '@/src/messaging/protocol';
import { MAX_ITEMS } from '@/src/messaging/protocol';
import { extractPosts } from './extract';
import type { CapturedPost } from './normalise';
import { AMBIENT_TIMELINES, MUTATIONS, SOURCE_TIMELINES, type SourceKind } from './operations';
import { SeenPosts } from './seen';

export interface CaptureEnvironment {
  /** The logged-in account's id, or undefined when it cannot be determined. */
  viewerId(): string | undefined;
  send(message: CaptureMessage): Promise<CaptureReply | undefined>;
  /** Called after posts were stored, with the account's new totals. */
  onCaptured(source: SourceKind, counts: Counts): void;
  /** Called when the worker did not store what it was sent. Never silent. */
  onFailed(): void;
  /** Reads the basics of a post from the page, for one that was never seen arriving. */
  postFromPage(id: string): CapturedPost | undefined;
}

export function createCapture(environment: CaptureEnvironment) {
  const seen = new SeenPosts();

  const store = async (message: CaptureMessage, source: SourceKind) => {
    const reply = await environment.send(message).catch(() => undefined);
    if (reply?.ok) environment.onCaptured(source, reply.counts);
    else environment.onFailed();
  };

  const onMutation = async (message: ResponseMessage, body: Record<string, unknown>) => {
    const { source, added } = MUTATIONS[message.op]!;
    // The site answers a failed change with a normal status and an error list.
    if (Array.isArray(body.errors) && body.errors.length > 0) return;

    const request = parse(message.requestBody);
    const variables = isRecord(request) && isRecord(request.variables) ? request.variables : {};
    const postId = variables.tweet_id;
    const accountId = environment.viewerId();
    if (!isId(postId) || accountId === undefined) return;

    if (!added) {
      await store({ type: 'capture/clear', accountId, source, postId }, source);
      return;
    }

    // The request names the post only by id. The rest comes from where the
    // user saw it. Its recorded bookmark and like state predates this change
    // and may be stale, so it is left out: the source alone decides.
    const remembered = seen.get(postId);
    const post = remembered ?? environment.postFromPage(postId);
    if (!post) return;
    const content = { ...post };
    delete content.bookmarked;
    delete content.liked;
    await store(
      {
        type: 'capture/posts',
        accountId,
        source,
        items: [remembered ? { post: content } : { post: content, partial: true }],
        referenced: [],
        unavailable: [],
      },
      source,
    );
  };

  return async function capture(message: ResponseMessage): Promise<void> {
    if (message.status < 200 || message.status >= 300) return;
    const body = parse(message.body);
    if (!isRecord(body)) return;

    if (Object.hasOwn(MUTATIONS, message.op)) {
      await onMutation(message, body);
      return;
    }

    const source = Object.hasOwn(SOURCE_TIMELINES, message.op)
      ? SOURCE_TIMELINES[message.op]
      : undefined;
    if (source === undefined && !AMBIENT_TIMELINES.includes(message.op)) return;

    const { entries, nested, unavailable } = extractPosts(body);
    for (const post of nested) seen.add(post);
    for (const { post } of entries) seen.add(post);
    if (source === undefined) return;

    const accountId = environment.viewerId();
    if (accountId === undefined) return;

    // Only the account's own likes are its likes. (Other people's are not
    // visible on X today, but nothing here should depend on that.)
    if (source === 'like') {
      const variables = parse(message.variables);
      if (!isRecord(variables) || variables.userId !== accountId) return;
    }

    if (entries.length === 0 && unavailable.length === 0) return;
    await store(
      {
        type: 'capture/posts',
        accountId,
        source,
        items: entries.slice(0, MAX_ITEMS),
        referenced: nested.slice(0, MAX_ITEMS * 2),
        unavailable: unavailable.slice(0, MAX_ITEMS),
      },
      source,
    );
  };
}

function parse(text: string | undefined): unknown {
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}
