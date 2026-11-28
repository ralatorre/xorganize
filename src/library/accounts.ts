/**
 * How the X accounts this browser holds are named and summed up (DESIGN, 4.5
 * and 4.7). Only an account's numeric ID is certain; its @handle is known
 * once it has been seen on x.com.
 */

import type { AccountId, StoredAccount } from '@/src/db/types';
import { plural } from './format';

/** Digits of the ID shown for an account whose handle is not known yet. */
const ID_DIGITS = 4;

export function accountLabel(account: Pick<StoredAccount, 'accountId' | 'handle'>): string {
  return account.handle === undefined
    ? `X account ···${account.accountId.slice(-ID_DIGITS)}`
    : `@${account.handle}`;
}

/** What one account holds, as Settings lists it. */
function holding(account: StoredAccount): string {
  const parts = [plural(account.posts, 'post'), plural(account.tags, 'tag')];
  return `${parts.join(', ')} and ${plural(account.assignments, 'tag assignment')}`;
}

/**
 * Settings' "Stored in this browser": the shown account first, then the
 * others. Says so when nothing is stored.
 */
export function storedLine(
  accounts: readonly StoredAccount[],
  shown: AccountId | undefined,
): string {
  if (accounts.length === 0) return 'Nothing is stored yet.';
  const ordered = [
    ...accounts.filter(({ accountId }) => accountId === shown),
    ...accounts.filter(({ accountId }) => accountId !== shown),
  ];
  return `${ordered.map((account) => `${holding(account)} for ${accountLabel(account)}`).join('; ')}.`;
}

const UNITS = ['KB', 'MB', 'GB'] as const;
const STEP = 1000;

/** A size in bytes, rounded for reading: "About 1.2 MB". */
export function sizeLine(bytes: number): string {
  let value = bytes / STEP;
  let unit = 0;
  while (value >= STEP && unit < UNITS.length - 1) {
    value /= STEP;
    unit += 1;
  }
  const shown = value < 10 ? Math.max(0.1, Math.round(value * 10) / 10) : Math.round(value);
  return `About ${shown.toLocaleString()} ${UNITS[unit]}`;
}
