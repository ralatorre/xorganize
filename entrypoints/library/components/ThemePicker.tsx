import type { ThemeSetting } from '@/src/db/types';
import { THEME_SETTINGS } from '@/src/db/repo';
import type { Theme } from '@/src/dom/theme';
import { THEME_LABELS } from '@/src/library/theme';

/** What each choice previews: one theme, or the two Match X and System most often pick between. */
const PREVIEWS: Record<ThemeSetting, readonly Theme[]> = {
  x: ['light', 'dim'],
  system: ['light', 'dark'],
  light: ['light'],
  dim: ['dim'],
  dark: ['dark'],
};

/**
 * The library's theme, each choice drawn as a small preview in its own
 * colours. They are radio buttons, so the arrows move between them, and the
 * chosen one is ringed as well as checked.
 */
export function ThemePicker(props: { theme: ThemeSetting; onChange(theme: ThemeSetting): void }) {
  return (
    <fieldset class="themes">
      <legend class="visually-hidden">Theme</legend>
      {THEME_SETTINGS.map((choice) => (
        <label key={choice} class="themes__choice">
          <input
            type="radio"
            name="theme"
            class="visually-hidden"
            checked={props.theme === choice}
            onChange={() => props.onChange(choice)}
          />
          <span class="themes__preview" aria-hidden="true">
            {PREVIEWS[choice].map((theme) => (
              <span key={theme} class="themes__half" data-theme={theme}>
                <span class="themes__bar themes__bar--text" />
                <span class="themes__bar themes__bar--line" />
                <span class="themes__bar themes__bar--accent" />
              </span>
            ))}
          </span>
          {THEME_LABELS[choice]}
        </label>
      ))}
    </fieldset>
  );
}
