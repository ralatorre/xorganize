/**
 * Tells the worker which theme x.com shows, for the library's Match X: once
 * when it is first read, and again only when it changes.
 */

import type { Theme } from '@/src/dom/theme';

export function createThemeReport(send: (theme: Theme) => void): (theme: Theme) => void {
  let reported: Theme | undefined;
  return (theme) => {
    if (theme === reported) return;
    reported = theme;
    send(theme);
  };
}
