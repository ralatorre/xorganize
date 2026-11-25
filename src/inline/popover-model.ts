/**
 * What the tag popover offers and what each key does, as pure functions, so
 * the behaviour in docs/DESIGN.md 4.2 can be tested without a page.
 */

import type { TagSuggestion, TagSummary } from '@/src/db/types';
import { parseTagName, tagKey } from '@/src/tags/names';

export type Row = { kind: 'tag'; tag: TagSuggestion } | { kind: 'create'; name: string };

/**
 * Suggestions not already on the post, then an offer to create the typed name
 * when no tag has that name yet.
 */
export function rowsOf(query: string, suggestions: TagSuggestion[], applied: TagSummary[]): Row[] {
  const appliedKeys = new Set(applied.map((tag) => tagKey(tag.name)));
  const rows: Row[] = suggestions
    .filter((tag) => !appliedKeys.has(tagKey(tag.name)))
    .map((tag) => ({ kind: 'tag', tag }));

  const parsed = parseTagName(query);
  const exists =
    parsed.ok &&
    (appliedKeys.has(parsed.nameKey) ||
      suggestions.some((tag) => tagKey(tag.name) === parsed.nameKey));
  if (parsed.ok && !exists) rows.push({ kind: 'create', name: parsed.name });
  return rows;
}

/** Recently used tags worth offering: those not on the post already. */
export function recentOf(recent: TagSummary[], applied: TagSummary[]): TagSummary[] {
  const appliedKeys = new Set(applied.map((tag) => tagKey(tag.name)));
  return recent.filter((tag) => !appliedKeys.has(tagKey(tag.name)));
}

/** The name a row adds. */
export function nameOf(row: Row): string {
  return row.kind === 'tag' ? row.tag.name : row.name;
}

/** Moves the highlight, wrapping at either end. -1 means nothing is highlighted. */
export function moveHighlight(highlight: number, delta: number, count: number): number {
  if (count === 0) return -1;
  if (highlight < 0) return delta > 0 ? 0 : count - 1;
  return (((highlight + delta) % count) + count) % count;
}

export type KeyAction =
  | { type: 'apply'; row: Row }
  | { type: 'move'; delta: number }
  | { type: 'remove-last' }
  | { type: 'close' }
  | { type: 'none' };

export interface KeyContext {
  query: string;
  rows: Row[];
  highlight: number;
  appliedCount: number;
}

export function keyAction(key: string, context: KeyContext): KeyAction {
  switch (key) {
    case 'Escape':
      return { type: 'close' };
    case 'ArrowDown':
      return { type: 'move', delta: 1 };
    case 'ArrowUp':
      return { type: 'move', delta: -1 };
    case 'Enter': {
      const row =
        context.rows[context.highlight] ?? (context.query.trim() ? context.rows[0] : undefined);
      return row ? { type: 'apply', row } : { type: 'none' };
    }
    case 'Backspace':
      return context.query === '' && context.appliedCount > 0
        ? { type: 'remove-last' }
        : { type: 'none' };
    default:
      return { type: 'none' };
  }
}
