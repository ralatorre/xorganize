/**
 * Turns one raw post from x.com's API into the extension's own shape.
 *
 * The input is untrusted: it comes from the page. Every field is checked for
 * type and size, only https URLs are kept, and nothing is trusted to be HTML.
 * Field locations were confirmed against real traffic (spec, 18.1); where the
 * API has moved a field before, the older location is still tried.
 */

import { httpsUrl, isId, isRecord } from '@/src/guards';

export interface CapturedMedia {
  kind: 'photo' | 'video' | 'gif';
  /** The image, or the best video file. */
  url: string;
  /** A still image, for videos and gifs. */
  previewUrl?: string;
  alt?: string;
}

export interface CapturedLink {
  url: string;
  display: string;
}

export interface CapturedPost {
  id: string;
  url: string;
  text: string;
  /** Epoch milliseconds. */
  createdAt: number | null;
  lang?: string;
  author: { id?: string; handle: string; name: string; avatarUrl?: string };
  media: CapturedMedia[];
  links: CapturedLink[];
  quotedId?: string;
  sensitive: boolean;
  /** The logged-in account's own state for this post, when the API says. */
  bookmarked?: boolean;
  liked?: boolean;
}

const MAX_TEXT = 30_000;
const MAX_NAME = 100;
const MAX_ALT = 2_000;
const MAX_MEDIA = 10;
const MAX_LINKS = 30;
const HANDLE = /^[A-Za-z0-9_]{1,20}$/;
const LANG = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/;

/** A post result with the visibility wrapper removed, if there is one. */
export function unwrapPost(result: unknown): Record<string, unknown> | undefined {
  if (!isRecord(result)) return undefined;
  return isRecord(result.tweet) ? result.tweet : result;
}

export function normalisePost(result: unknown): CapturedPost | undefined {
  const raw = unwrapPost(result);
  if (!raw || !isId(raw.rest_id)) return undefined;
  const legacy = isRecord(raw.legacy) ? raw.legacy : {};

  const author = authorOf(raw);
  if (!author) return undefined;

  const entities = isRecord(legacy.entities) ? legacy.entities : {};
  const extended = isRecord(legacy.extended_entities) ? legacy.extended_entities : {};
  const rawMedia = records(extended.media ?? entities.media);
  const note = noteOf(raw);
  const rawLinks = [...records(entities.urls), ...records(note?.urls)];

  const quoted = unwrapPost(isRecord(raw.quoted_status_result) && raw.quoted_status_result.result);
  const quotedId = isId(quoted?.rest_id)
    ? quoted.rest_id
    : isId(legacy.quoted_status_id_str)
      ? legacy.quoted_status_id_str
      : undefined;

  const created = typeof legacy.created_at === 'string' ? Date.parse(legacy.created_at) : NaN;
  const lang = typeof legacy.lang === 'string' && LANG.test(legacy.lang) ? legacy.lang : undefined;

  return {
    id: raw.rest_id,
    url: `https://x.com/${author.handle}/status/${raw.rest_id}`,
    text: readableText(note?.text ?? string(legacy.full_text, MAX_TEXT) ?? '', rawLinks, rawMedia),
    createdAt: Number.isFinite(created) ? created : null,
    ...(lang ? { lang } : {}),
    author,
    media: rawMedia.slice(0, MAX_MEDIA).flatMap(mediaOf),
    links: linksOf(rawLinks),
    ...(quotedId ? { quotedId } : {}),
    sensitive: legacy.possibly_sensitive === true,
    ...(typeof legacy.bookmarked === 'boolean' ? { bookmarked: legacy.bookmarked } : {}),
    ...(typeof legacy.favorited === 'boolean' ? { liked: legacy.favorited } : {}),
  };
}

/** Checks a value that claims to be a CapturedPost, for the worker's side of the message. */
export function isCapturedPost(value: unknown): value is CapturedPost {
  if (!isRecord(value) || !isId(value.id)) return false;
  const { author, media, links } = value;
  if (!isRecord(author) || typeof author.handle !== 'string' || !HANDLE.test(author.handle)) {
    return false;
  }
  return (
    value.url === `https://x.com/${author.handle}/status/${value.id}` &&
    isText(value.text, MAX_TEXT) &&
    (value.createdAt === null || Number.isFinite(value.createdAt)) &&
    isOptional(value.lang, (lang) => typeof lang === 'string' && LANG.test(lang)) &&
    isOptional(author.id, isId) &&
    isText(author.name, MAX_NAME) &&
    isOptional(author.avatarUrl, isHttps) &&
    Array.isArray(media) &&
    media.length <= MAX_MEDIA &&
    media.every(isCapturedMedia) &&
    Array.isArray(links) &&
    links.length <= MAX_LINKS &&
    links.every((link) => isRecord(link) && isHttps(link.url) && isText(link.display, 300)) &&
    isOptional(value.quotedId, isId) &&
    typeof value.sensitive === 'boolean' &&
    isOptional(value.bookmarked, (flag) => typeof flag === 'boolean') &&
    isOptional(value.liked, (flag) => typeof flag === 'boolean')
  );
}

function isCapturedMedia(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.kind === 'photo' || value.kind === 'video' || value.kind === 'gif') &&
    isHttps(value.url) &&
    isOptional(value.previewUrl, isHttps) &&
    isOptional(value.alt, (alt) => isText(alt, MAX_ALT))
  );
}

function authorOf(raw: Record<string, unknown>): CapturedPost['author'] | undefined {
  const results = isRecord(raw.core) && isRecord(raw.core.user_results) && raw.core.user_results;
  const user = results && isRecord(results.result) ? results.result : undefined;
  if (!user) return undefined;
  const core = isRecord(user.core) ? user.core : {};
  const legacy = isRecord(user.legacy) ? user.legacy : {};
  const avatar = isRecord(user.avatar) ? user.avatar : {};

  const handle = core.screen_name ?? legacy.screen_name;
  if (typeof handle !== 'string' || !HANDLE.test(handle)) return undefined;
  const avatarUrl = httpsUrl(avatar.image_url ?? legacy.profile_image_url_https);

  return {
    ...(isId(user.rest_id) ? { id: user.rest_id } : {}),
    handle,
    name: string(core.name ?? legacy.name, MAX_NAME) ?? handle,
    ...(avatarUrl ? { avatarUrl } : {}),
  };
}

/** Long-form text and its link entities, when the post has them. */
function noteOf(raw: Record<string, unknown>): { text: string; urls: unknown } | undefined {
  const results =
    isRecord(raw.note_tweet) &&
    isRecord(raw.note_tweet.note_tweet_results) &&
    raw.note_tweet.note_tweet_results.result;
  if (!isRecord(results)) return undefined;
  const text = string(results.text, MAX_TEXT);
  if (text === undefined) return undefined;
  return { text, urls: isRecord(results.entity_set) ? results.entity_set.urls : undefined };
}

/**
 * The text as a person would read it: shortened links replaced by the real
 * ones, the trailing link to the post's own media removed, and the three
 * characters the API escapes turned back.
 */
function readableText(
  text: string,
  links: Record<string, unknown>[],
  media: Record<string, unknown>[],
): string {
  let result = text;
  for (const link of links) {
    const expanded = httpsUrl(link.expanded_url);
    if (typeof link.url === 'string' && link.url !== '' && expanded) {
      result = result.split(link.url).join(expanded);
    }
  }
  for (const item of media) {
    if (typeof item.url === 'string' && item.url !== '') result = result.split(item.url).join('');
  }
  return result
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim()
    .slice(0, MAX_TEXT);
}

function mediaOf(item: Record<string, unknown>): CapturedMedia[] {
  const still = httpsUrl(item.media_url_https);
  const alt = string(item.ext_alt_text, MAX_ALT);
  const extras = alt ? { alt } : {};

  if (item.type === 'photo') return still ? [{ kind: 'photo', url: still, ...extras }] : [];
  if (item.type !== 'video' && item.type !== 'animated_gif') return [];

  const variants = records(isRecord(item.video_info) ? item.video_info.variants : undefined)
    .filter((variant) => variant.content_type === 'video/mp4')
    .sort((a, b) => bitrate(b) - bitrate(a));
  const url = httpsUrl(variants[0]?.url) ?? still;
  if (!url) return [];
  return [
    {
      kind: item.type === 'video' ? 'video' : 'gif',
      url,
      ...(still && still !== url ? { previewUrl: still } : {}),
      ...extras,
    },
  ];
}

function linksOf(links: Record<string, unknown>[]): CapturedLink[] {
  const seen = new Set<string>();
  const result: CapturedLink[] = [];
  for (const link of links) {
    const url = httpsUrl(link.expanded_url);
    if (!url || seen.has(url) || result.length >= MAX_LINKS) continue;
    seen.add(url);
    result.push({ url, display: string(link.display_url, 300) ?? url.slice(0, 300) });
  }
  return result;
}

function bitrate(variant: Record<string, unknown>): number {
  return typeof variant.bitrate === 'number' ? variant.bitrate : 0;
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function string(value: unknown, max: number): string | undefined {
  return typeof value === 'string' ? value.slice(0, max) : undefined;
}

function isText(value: unknown, max: number): boolean {
  return typeof value === 'string' && value.length <= max;
}

function isHttps(value: unknown): boolean {
  return typeof value === 'string' && httpsUrl(value) !== undefined;
}

function isOptional(value: unknown, check: (value: unknown) => boolean): boolean {
  return value === undefined || check(value);
}
