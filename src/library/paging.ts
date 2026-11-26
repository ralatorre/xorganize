/**
 * Which posts the list loads: whole pages around the rows on screen, so that
 * scrolling a little does not ask for new data each time.
 */

/** Posts per page. */
export const PAGE_SIZE = 25;

/**
 * The start (inclusive) and end (exclusive) of the pages that hold rows
 * `first` to `last`, within a list of `total` rows.
 */
export function pageSpan(
  first: number,
  last: number,
  total: number,
  size = PAGE_SIZE,
): { start: number; end: number } {
  if (total <= 0 || last < first) return { start: 0, end: 0 };
  const start = Math.max(0, Math.floor(first / size) * size);
  const end = Math.min(total, (Math.floor(last / size) + 1) * size);
  return { start: Math.min(start, end), end };
}
