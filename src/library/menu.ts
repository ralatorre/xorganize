/**
 * Moving through a menu's items with the keyboard (WAI-ARIA menu pattern):
 * the arrows wrap round, Home and End go to either end.
 */

/** The item to focus after `key`, from `current` (-1: none yet). Undefined: the key is not for moving. */
export function menuIndex(current: number, key: string, count: number): number | undefined {
  if (count === 0) return undefined;
  switch (key) {
    case 'ArrowDown':
      return current < 0 ? 0 : (current + 1) % count;
    case 'ArrowUp':
      return current < 0 ? count - 1 : (current - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return undefined;
  }
}
