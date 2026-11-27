import type { ThemeSetting as Choice } from '@/src/db/types';
import { THEME_SETTINGS } from '@/src/db/repo';
import { THEME_LABELS } from '@/src/library/theme';
import { Select } from './Select';

/** The library's theme. Match X follows x.com; the tag button there always does. */
export function ThemeSetting(props: { theme: Choice; onChange(theme: Choice): void }) {
  return (
    <label class="library__setting">
      Theme{' '}
      <Select
        value={props.theme}
        onChange={(event) => {
          const chosen = THEME_SETTINGS.find((theme) => theme === event.currentTarget.value);
          if (chosen) props.onChange(chosen);
        }}
      >
        {THEME_SETTINGS.map((theme) => (
          <option key={theme} value={theme}>
            {THEME_LABELS[theme]}
          </option>
        ))}
      </Select>
      <span class="library__hint">Match X uses the theme you last had on x.com.</span>
    </label>
  );
}
