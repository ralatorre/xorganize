import { useEffect, useState } from 'preact/hooks';
import type { ThemeSetting } from '@/src/db/types';
import type { Theme } from '@/src/dom/theme';
import { themeFor } from '@/src/library/theme';

/** Whether the system asks for dark colours, and word of when that changes. */
export interface ColourScheme {
  dark(): boolean;
  /** Calls `onChange` when it changes. Returns a function that stops it. */
  watch(onChange: () => void): () => void;
}

/**
 * Works out the library's theme and hands it to `apply` whenever it changes.
 * Until the settings are read, `apply` is not called.
 */
export function useTheme(
  chosen: { setting: ThemeSetting; xTheme: Theme | undefined } | undefined,
  scheme: ColourScheme,
  apply: (theme: Theme) => void,
): void {
  const [systemDark, setSystemDark] = useState(scheme.dark);
  useEffect(() => scheme.watch(() => setSystemDark(scheme.dark())), [scheme]);
  const theme = chosen && themeFor(chosen.setting, chosen.xTheme, systemDark);
  useEffect(() => {
    if (theme) apply(theme);
  }, [theme, apply]);
}
