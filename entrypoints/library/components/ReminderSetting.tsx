import { REMINDER_CHOICES } from '@/src/library/backup-reminder';

/** How often the library asks for a backup. */
export function ReminderSetting(props: { days: number; onChange(days: number): void }) {
  return (
    <label class="library__setting">
      Backup reminder{' '}
      <select
        class="library__select"
        value={String(props.days)}
        onChange={(event) => props.onChange(Number(event.currentTarget.value))}
      >
        {REMINDER_CHOICES.map((choice) => (
          <option key={choice.days} value={String(choice.days)}>
            {choice.label}
          </option>
        ))}
      </select>
      <span class="library__hint">Counts from the last JSON backup of the whole library.</span>
    </label>
  );
}
