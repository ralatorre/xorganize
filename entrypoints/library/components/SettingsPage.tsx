import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { SourceKind } from '@/src/capture/operations';
import type { AccountId, Settings, StoredAccount, ThemeSetting } from '@/src/db/types';
import { sizeLine, storedLine } from '@/src/library/accounts';
import { REMINDER_CHOICES } from '@/src/library/backup-reminder';
import type { IconName } from '../icons';
import { Icon } from './Icon';
import { Select } from './Select';
import { SettingRow } from './SettingRow';
import { SettingSwitch } from './SettingSwitch';
import { SettingsGroup } from './SettingsGroup';
import { ThemePicker } from './ThemePicker';

const GROUPS: ReadonlyArray<{ id: string; title: string; icon: IconName }> = [
  { id: 'capture', title: 'Capture', icon: 'bookmark' },
  { id: 'appearance', title: 'Appearance', icon: 'appearance' },
  { id: 'privacy', title: 'Privacy', icon: 'privacy' },
  { id: 'backup', title: 'Backup and restore', icon: 'backup' },
  { id: 'danger', title: 'Danger zone', icon: 'warning' },
];

/** What a backup or export of the shown account needs. Absent while the library is empty. */
export interface SettingsExports {
  /** When the last backup was made, as a line to show. */
  lastBackup: string;
  /** Each says what it did in a toast. */
  backUp(): void;
  exportCsv(): void;
}

/**
 * Settings, a page of the library (DESIGN, 4.7): a list on the left that
 * jumps to each group, and the groups as panels of rows.
 */
export function SettingsPage(props: {
  settings: Settings;
  accounts: readonly StoredAccount[];
  shown: AccountId | undefined;
  /** How many bytes the library takes up in this browser, if the browser says. */
  measure(): Promise<number | undefined>;
  exports: SettingsExports | undefined;
  /** The control that picks a backup to restore. */
  restore: ComponentChildren;
  onCapture(source: SourceKind, enabled: boolean): void;
  onTheme(theme: ThemeSetting): void;
  onImages(enabled: boolean): void;
  onReminder(days: number): void;
  onDeleteAll(): void;
}) {
  const { settings, accounts, measure, exports } = props;
  const [size, setSize] = useState<number>();
  useEffect(() => {
    void measure().then(setSize);
  }, [measure, accounts]);

  return (
    <div class="shell">
      <nav class="sidebar settings__nav" aria-label="Settings">
        <h1 class="settings__heading">Settings</h1>
        <ul>
          {GROUPS.map((group) => (
            <li key={group.id}>
              <a class="sidebar__item" href={`#settings-${group.id}`}>
                <Icon name={group.icon} />
                <span class="sidebar__label">{group.title}</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <main class="content settings">
        <SettingsGroup
          id="capture"
          title="Capture"
          description="What xorganize saves from x.com. Turning one off keeps what is already saved, but no longer follows its changes on X."
        >
          <SettingRow
            id="capture-bookmarks"
            title="Capture bookmarks"
            description="Saves your Bookmarks page as it loads, and each post you bookmark on X."
          >
            <SettingSwitch
              id="capture-bookmarks"
              checked={settings.captureBookmarks}
              onChange={(enabled) => props.onCapture('bookmark', enabled)}
            />
          </SettingRow>
          <SettingRow
            id="capture-likes"
            title="Capture likes"
            description="Saves your Likes as they load, and each post you like on X."
          >
            <SettingSwitch
              id="capture-likes"
              checked={settings.captureLikes}
              onChange={(enabled) => props.onCapture('like', enabled)}
            />
          </SettingRow>
        </SettingsGroup>

        <SettingsGroup
          id="appearance"
          title="Appearance"
          description="Match X uses the theme you last had on x.com. The tag button on x.com always follows X."
        >
          <ThemePicker theme={settings.theme} onChange={props.onTheme} />
        </SettingsGroup>

        <SettingsGroup
          id="privacy"
          title="Privacy"
          description="Your library is kept in this browser. Nothing is sent anywhere."
        >
          <SettingRow
            id="images"
            title="Show images from X"
            description="Avatars and thumbnails load from X’s image server, without cookies. Turned off, the library makes no network requests at all."
          >
            <SettingSwitch id="images" checked={settings.remoteImages} onChange={props.onImages} />
          </SettingRow>
          <SettingRow
            id="stored"
            title="Stored in this browser"
            description={storedLine(accounts, props.shown)}
          >
            {size === undefined ? null : (
              <span class="setting__stat">
                <Icon name="privacy" size="small" />
                {sizeLine(size)}
              </span>
            )}
          </SettingRow>
        </SettingsGroup>

        <SettingsGroup
          id="backup"
          title="Backup and restore"
          description="A JSON backup holds the whole library: posts, tags and colours. It is the only file you can restore from."
        >
          {exports ? (
            <>
              <SettingRow id="back-up" title="Back up the library" description={exports.lastBackup}>
                <button type="button" class="button button--primary" onClick={exports.backUp}>
                  <Icon name="export" size="small" />
                  Back up now
                </button>
              </SettingRow>
              <SettingRow
                id="csv"
                title="Export as CSV"
                description="One row per post, for spreadsheets. It cannot be imported again."
              >
                <button type="button" class="button" onClick={exports.exportCsv}>
                  Export CSV
                </button>
              </SettingRow>
            </>
          ) : null}
          <SettingRow
            id="restore"
            title="Restore from a backup"
            description="Merge a JSON backup into this library, or replace what it holds. You see what the file contains before anything changes."
          >
            {props.restore}
          </SettingRow>
          <SettingRow
            id="reminder"
            title="Backup reminder"
            description="Counts from the last JSON backup of the whole library."
          >
            <Select
              aria-labelledby="reminder-title"
              aria-describedby="reminder-description"
              value={String(settings.backupReminderDays)}
              onChange={(event) => props.onReminder(Number(event.currentTarget.value))}
            >
              {REMINDER_CHOICES.map((choice) => (
                <option key={choice.days} value={String(choice.days)}>
                  {choice.label}
                </option>
              ))}
            </Select>
          </SettingRow>
        </SettingsGroup>

        <SettingsGroup
          id="danger"
          title="Danger zone"
          description="Nothing here changes anything on X."
          danger
        >
          <SettingRow
            id="delete-all"
            title="Delete all data"
            description="Deletes every post, tag and tag assignment, for every X account in this browser. Settings are kept."
          >
            <button type="button" class="button button--danger-outline" onClick={props.onDeleteAll}>
              Delete all data…
            </button>
          </SettingRow>
        </SettingsGroup>
      </main>
    </div>
  );
}
