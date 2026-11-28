import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  backupTimes,
  deleteAllData,
  dismissBackupReminder,
  readSettings,
  readXTheme,
  recordBackup,
  recordXTheme,
  updateSettings,
} from '@/src/db/repo';
import { LibraryDatabase } from '@/src/db/schema';
import type { StoredPost } from '@/src/db/types';
import {
  DAY_MS,
  REMINDER_CHOICES,
  backupReminder,
  reminderMessage,
} from '@/src/library/backup-reminder';
import { loadCatalogue } from '@/src/library/browse';
import { DELETE_ALL_MESSAGE, confirmsDeletion } from '@/src/library/delete-all';
import { createLibraryEdits } from '@/src/library/edits';
import { createLibraryExport, isBackup } from '@/src/library/exporter';
import type { ExportedFile } from '@/src/transfer/export';

const ACCOUNT = '9000000000000000001';
const OTHER = '9000000000000000002';
const DAY = Date.UTC(2026, 0, 2);

const post = (id: string, accountId = ACCOUNT, savedAt = DAY): StoredPost => ({
  accountId,
  id,
  url: `https://x.com/example_user/status/${id}`,
  text: `Post ${id}`,
  createdAt: DAY,
  author: { handle: 'example_user', name: 'Example User' },
  media: [],
  links: [],
  sensitive: false,
  isBookmark: 1,
  isLike: 0,
  hasTags: 1,
  bookmarkSort: id.padStart(30, '0'),
  partial: false,
  unavailable: false,
  firstSeenAt: savedAt,
  lastSeenAt: savedAt,
  savedAt,
});

let db: LibraryDatabase;
let databases = 0;

beforeEach(async () => {
  db = new LibraryDatabase(`library-data-test-${++databases}`);
  await db.posts.bulkPut([post('1', ACCOUNT, DAY + 5), post('2', ACCOUNT, DAY), post('1', OTHER)]);
  await db.tags.bulkPut([
    {
      accountId: ACCOUNT,
      id: 't1',
      name: 'rust',
      nameKey: 'rust',
      color: 0,
      createdAt: DAY,
      lastUsedAt: DAY,
    },
    {
      accountId: OTHER,
      id: 't2',
      name: 'go',
      nameKey: 'go',
      color: 1,
      createdAt: DAY,
      lastUsedAt: DAY,
    },
  ]);
  await db.postTags.bulkPut([
    { accountId: ACCOUNT, postId: '1', tagId: 't1', taggedAt: DAY },
    { accountId: OTHER, postId: '1', tagId: 't2', taggedAt: DAY },
  ]);
  await db.meta.put({ accountId: '', key: 'activeAccount', value: ACCOUNT });
});

describe('backupTimes', () => {
  it('counts from the oldest post in the library until a backup is made', async () => {
    expect(await backupTimes(db, ACCOUNT)).toEqual({ startedAt: DAY });
  });

  it('holds the last backup and the last time the reminder was put off, per account', async () => {
    await recordBackup(db, ACCOUNT, DAY + 10);
    await dismissBackupReminder(db, ACCOUNT, DAY + 20);
    await recordBackup(db, OTHER, DAY + 30);
    expect(await backupTimes(db, ACCOUNT)).toEqual({
      startedAt: DAY,
      lastBackupAt: DAY + 10,
      dismissedAt: DAY + 20,
    });
    expect(await backupTimes(db, OTHER)).toEqual({ startedAt: DAY, lastBackupAt: DAY + 30 });
  });

  it('leaves out times that are not numbers, and an empty library has no start', async () => {
    await db.meta.put({ accountId: ACCOUNT, key: 'lastBackupAt', value: 'yesterday' });
    await db.meta.put({ accountId: ACCOUNT, key: 'backupReminderDismissedAt', value: Infinity });
    expect(await backupTimes(db, ACCOUNT)).toEqual({ startedAt: DAY });
    expect(await backupTimes(db, '9000000000000000003')).toEqual({});
  });

  it('is part of what the library reads', async () => {
    await recordBackup(db, ACCOUNT, DAY + 10);
    expect((await loadCatalogue(db)).backup).toEqual({ startedAt: DAY, lastBackupAt: DAY + 10 });
  });
});

describe('backupReminder', () => {
  const days = 30;
  const interval = days * DAY_MS;

  it('is due once the interval has passed since the library started, if never backed up', () => {
    expect(backupReminder({ startedAt: DAY }, days, DAY + interval - 1)).toEqual({ due: false });
    expect(backupReminder({ startedAt: DAY }, days, DAY + interval)).toEqual({ due: true });
  });

  it('counts from the last backup or the last time it was put off, whichever is later', () => {
    const times = {
      startedAt: DAY,
      lastBackupAt: DAY + 10 * DAY_MS,
      dismissedAt: DAY + 20 * DAY_MS,
    };
    expect(backupReminder(times, days, DAY + 20 * DAY_MS + interval - 1)).toEqual({ due: false });
    expect(backupReminder(times, days, DAY + 20 * DAY_MS + interval)).toEqual({
      due: true,
      lastBackupAt: DAY + 10 * DAY_MS,
    });
    const backedUp = { startedAt: DAY, lastBackupAt: DAY + 40 * DAY_MS, dismissedAt: DAY };
    expect(backupReminder(backedUp, days, DAY + 40 * DAY_MS + interval - 1)).toEqual({
      due: false,
    });
  });

  it('is never due when turned off, or for an empty library', () => {
    expect(backupReminder({ startedAt: DAY }, 0, DAY + 1000 * DAY_MS)).toEqual({ due: false });
    expect(backupReminder({}, days, DAY + 1000 * DAY_MS)).toEqual({ due: false });
  });

  it('says how long it has been', () => {
    expect(reminderMessage({ due: true }, DAY)).toBe('Your library has not been backed up yet.');
    expect(reminderMessage({ due: true, lastBackupAt: DAY }, DAY + 45 * DAY_MS + 5)).toBe(
      'Your last backup was 45 days ago.',
    );
    expect(reminderMessage({ due: true, lastBackupAt: DAY }, DAY + DAY_MS)).toBe(
      'Your last backup was 1 day ago.',
    );
    expect(reminderMessage({ due: true, lastBackupAt: DAY + 5 }, DAY)).toBe(
      'Your last backup was 0 days ago.',
    );
  });

  it('offers exactly the intervals the settings accept, the default among them', async () => {
    for (const choice of REMINDER_CHOICES) {
      await updateSettings(db, { backupReminderDays: choice.days });
      expect((await readSettings(db)).backupReminderDays).toBe(choice.days);
    }
    expect(REMINDER_CHOICES.map((choice) => choice.days)).toContain(30);
  });
});

describe('createLibraryExport', () => {
  const NOON = DAY + 12 * 60 * 60 * 1000; // the same date in any time zone within 12 hours of UTC
  const now = () => new Date(NOON);

  it('counts only a whole-library JSON export as a backup', () => {
    expect(isBackup('library', 'json')).toBe(true);
    expect(isBackup('library', 'csv')).toBe(false);
    expect(isBackup({ postIds: ['1'] }, 'json')).toBe(false);
  });

  it('saves the file and records a backup', async () => {
    const saved: ExportedFile[] = [];
    const exportTo = createLibraryExport(db, (file) => saved.push(file), now);
    expect(await exportTo(ACCOUNT, 'library', 'json')).toEqual({
      count: 2,
      name: 'xorganize-export-2026-01-02.json',
    });
    expect(saved.map((file) => file.name)).toEqual(['xorganize-export-2026-01-02.json']);
    expect((await backupTimes(db, ACCOUNT)).lastBackupAt).toBe(NOON);
  });

  it('records nothing for anything else', async () => {
    const exportTo = createLibraryExport(db, vi.fn(), now);
    expect((await exportTo(ACCOUNT, 'library', 'csv'))?.count).toBe(2);
    expect((await exportTo(ACCOUNT, { postIds: ['1'] }, 'json'))?.count).toBe(1);
    expect((await backupTimes(db, ACCOUNT)).lastBackupAt).toBeUndefined();
  });

  it('resolves to undefined, recording nothing, when the file cannot be saved', async () => {
    const exportTo = createLibraryExport(
      db,
      () => {
        throw new Error('no');
      },
      now,
    );
    expect(await exportTo(ACCOUNT, 'library', 'json')).toBeUndefined();
    expect((await backupTimes(db, ACCOUNT)).lastBackupAt).toBeUndefined();
  });
});

describe('deleteAllData', () => {
  it('empties every account’s library, keeping the settings', async () => {
    await updateSettings(db, { remoteImages: false });
    await recordBackup(db, ACCOUNT, DAY);
    await db.meta.put({ accountId: ACCOUNT, key: 'captureComplete:bookmark', value: true });
    await recordXTheme(db, 'dark');
    expect(await deleteAllData(db)).toEqual([ACCOUNT, OTHER]);
    expect(await db.posts.count()).toBe(0);
    expect(await db.tags.count()).toBe(0);
    expect(await db.postTags.count()).toBe(0);
    expect(await db.meta.toArray()).toEqual([
      {
        accountId: '',
        key: 'settings',
        value: { remoteImages: false, backupReminderDays: 30, theme: 'x' },
      },
    ]);
    expect((await loadCatalogue(db)).account).toBeUndefined();
    // Until x.com is visited again, Match X follows the system.
    expect(await readXTheme(db)).toBeUndefined();
  });

  it('names an account that has only tags', async () => {
    await db.posts.clear();
    expect(await deleteAllData(db)).toEqual([ACCOUNT, OTHER]);
  });

  it('names no account in an empty library', async () => {
    await deleteAllData(db);
    expect(await deleteAllData(db)).toEqual([]);
  });

  it('tells open x.com tabs about each account, through the library’s edits', async () => {
    const announce = vi.fn();
    await createLibraryEdits(db, announce).deleteAll();
    expect(announce.mock.calls).toEqual([[ACCOUNT], [OTHER]]);
  });
});

describe('confirmsDeletion', () => {
  it('needs the word, in any case, with space around it allowed', () => {
    expect(confirmsDeletion('delete')).toBe(true);
    expect(confirmsDeletion('  DELETE ')).toBe(true);
    expect(confirmsDeletion('')).toBe(false);
    expect(confirmsDeletion('delet')).toBe(false);
    expect(confirmsDeletion('delete all')).toBe(false);
  });

  it('says what is deleted and what is not', () => {
    expect(DELETE_ALL_MESSAGE).toMatch(/every X account/);
    expect(DELETE_ALL_MESSAGE).toMatch(/Settings are kept/);
  });
});
