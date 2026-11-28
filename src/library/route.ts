/**
 * Which page of the library the address shows (DESIGN, 4.7). Settings is
 * `#settings`, and `#settings-<group>` jumps to one of its groups, so the
 * browser's Back returns to the list.
 */

export type Page = 'library' | 'settings';

export const SETTINGS_HASH = '#settings';

export function pageOf(hash: string): Page {
  return hash === SETTINGS_HASH || hash.startsWith(`${SETTINGS_HASH}-`) ? 'settings' : 'library';
}
