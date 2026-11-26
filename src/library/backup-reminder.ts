/**
 * The backup reminder (docs/DESIGN.md, 5.6): when the library should ask for
 * a backup, and what it says. Only a whole-library JSON export counts as a
 * backup, since nothing else can restore the library.
 */

import type { BackupTimes } from '@/src/db/types';
import { plural } from './format';

export const DAY_MS = 24 * 60 * 60 * 1000;

/** The choices for how often to remind, in the order offered. Days; 0 never. */
export const REMINDER_CHOICES: ReadonlyArray<{ days: number; label: string }> = [
  { days: 7, label: 'Every week' },
  { days: 30, label: 'Every 30 days' },
  { days: 90, label: 'Every 90 days' },
  { days: 0, label: 'Never' },
];

export type Reminder = { due: false } | { due: true; lastBackupAt?: number };

/**
 * Due once `days` have passed since the latest of the last backup, the last
 * time the reminder was put off, and the oldest post entering the library.
 * Never due for an empty library, or when reminders are off.
 */
export function backupReminder(times: BackupTimes, days: number, now: number): Reminder {
  if (days <= 0 || times.startedAt === undefined) return { due: false };
  const since = Math.max(times.startedAt, times.lastBackupAt ?? 0, times.dismissedAt ?? 0);
  if (now - since < days * DAY_MS) return { due: false };
  return times.lastBackupAt === undefined
    ? { due: true }
    : { due: true, lastBackupAt: times.lastBackupAt };
}

export function reminderMessage(reminder: Reminder & { due: true }, now: number): string {
  if (reminder.lastBackupAt === undefined) return 'Your library has not been backed up yet.';
  const days = Math.max(0, Math.floor((now - reminder.lastBackupAt) / DAY_MS));
  return `Your last backup was ${plural(days, 'day')} ago.`;
}
