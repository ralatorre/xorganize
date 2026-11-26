/**
 * Reads what was typed in the search box (DESIGN, 4.5). `#name` filters by
 * tag and `@handle` by author; everything else is text that a post must
 * contain. Double quotes keep spaces in one piece: `"to read"` is one phrase,
 * `#"to read"` one tag.
 */

import { tagKey } from '@/src/tags/names';
import { handleKey, searchKey } from './text';

/** Longest query read, in UTF-16 units. The search box allows no more. */
export const MAX_QUERY = 500;

const TAG = '#';
const AUTHOR = '@';
const QUOTE = '"';

export interface QueryToken {
  value: string;
  /**
   * The last token, still being typed: it matches names that start with it.
   * Any other token matches a whole name.
   */
  prefix: boolean;
}

export interface SearchQuery {
  /** Words and phrases, in searchKey form. A post must contain every one. */
  terms: string[];
  /** Tag names, in tagKey form. A post must carry a match for every one. */
  tags: QueryToken[];
  /** Handles in handleKey form, without the `@`. A post must be by a match for one of them. */
  authors: QueryToken[];
}

interface Token {
  kind: 'text' | 'tag' | 'author';
  value: string;
  /** Ended by a closing quote or by space, so it is complete. */
  closed: boolean;
}

export function parseQuery(input: string): SearchQuery {
  const tokens = tokenise(input.slice(0, MAX_QUERY));
  const query: SearchQuery = { terms: [], tags: [], authors: [] };
  tokens.forEach((token, index) => {
    const prefix = index === tokens.length - 1 && !token.closed;
    if (token.kind === 'text') {
      const term = searchKey(token.value).trim();
      if (term !== '') query.terms.push(term);
    } else if (token.kind === 'tag') {
      const value = tagKey(token.value);
      if (value !== '') query.tags.push({ value, prefix });
    } else {
      const value = handleKey(token.value.trim());
      if (value !== '') query.authors.push({ value, prefix });
    }
  });
  return query;
}

/** Whether a name, in the token's form, is what the token asks for. */
export function matchesToken(token: QueryToken, name: string): boolean {
  return token.prefix ? name.startsWith(token.value) : name === token.value;
}

function tokenise(input: string): Token[] {
  const tokens: Token[] = [];
  let at = 0;
  while (at < input.length) {
    if (/\s/u.test(input[at]!)) {
      at += 1;
      continue;
    }
    const sigil = input[at];
    const kind = sigil === TAG ? 'tag' : sigil === AUTHOR ? 'author' : 'text';
    if (kind !== 'text') at += 1;

    if (input[at] === QUOTE) {
      const end = input.indexOf(QUOTE, at + 1);
      const closed = end !== -1;
      tokens.push({ kind, value: input.slice(at + 1, closed ? end : undefined), closed });
      at = closed ? end + 1 : input.length;
    } else {
      const rest = input.slice(at);
      const length = rest.search(/\s/u);
      const closed = length !== -1;
      tokens.push({ kind, value: closed ? rest.slice(0, length) : rest, closed });
      at += closed ? length : rest.length;
    }
  }
  return tokens;
}
