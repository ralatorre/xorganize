/**
 * Which of its three themes the library shows (DESIGN, 4.7 and 7.1).
 */

import type { ThemeSetting } from '@/src/db/types';
import type { Theme } from '@/src/dom/theme';

/**
 * Match X uses the theme last seen on x.com, and the system's until x.com has
 * been visited. System is light or dark, as the system is. The rest are fixed.
 */
export function themeFor(
  setting: ThemeSetting,
  xTheme: Theme | undefined,
  systemDark: boolean,
): Theme {
  if (setting === 'x' && xTheme !== undefined) return xTheme;
  if (setting === 'x' || setting === 'system') return systemDark ? 'dark' : 'light';
  return setting;
}

/** How Settings names each choice. */
export const THEME_LABELS: Record<ThemeSetting, string> = {
  x: 'Match X',
  system: 'System',
  light: 'Light',
  dim: 'Dim',
  dark: 'Dark',
};
