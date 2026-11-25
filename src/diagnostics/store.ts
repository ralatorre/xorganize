/**
 * Storage for the diagnostics report: a small IndexedDB database of its own,
 * under the extension's origin, that exists only in the diagnostics build.
 */

import type { EnvironmentObservation } from './environment';
import type { OperationObservation } from './observe';
import {
  buildReport,
  mergeEnvironment,
  mergeOperation,
  type DiagnosticsReport,
  type EnvironmentRecord,
  type OperationRecord,
} from './report';

const DATABASE = 'xorganize-diagnostics';
const OPERATIONS = 'operations';
const ENVIRONMENT = 'environment';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(OPERATIONS, { keyPath: 'op' });
      request.result.createObjectStore(ENVIRONMENT, { keyPath: 'page' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('could not open database'));
  });
}

function done(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('transaction failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('transaction aborted'));
  });
}

/** Reads a record, merges an observation into it and writes it back, in one transaction. */
async function update<T>(store: string, key: string, merge: (existing: T | undefined) => T) {
  const database = await open();
  try {
    const transaction = database.transaction(store, 'readwrite');
    const objects = transaction.objectStore(store);
    const read = objects.get(key);
    read.onsuccess = () => objects.put(merge(read.result as T | undefined));
    await done(transaction);
  } finally {
    database.close();
  }
}

export function recordOperation(seen: OperationObservation): Promise<void> {
  return update<OperationRecord>(OPERATIONS, seen.op, (existing) => mergeOperation(existing, seen));
}

export function recordEnvironment(seen: EnvironmentObservation): Promise<void> {
  return update<EnvironmentRecord>(ENVIRONMENT, seen.page, (existing) =>
    mergeEnvironment(existing, seen),
  );
}

export async function readReport(): Promise<DiagnosticsReport> {
  const database = await open();
  try {
    const transaction = database.transaction([OPERATIONS, ENVIRONMENT], 'readonly');
    const operations = transaction.objectStore(OPERATIONS).getAll();
    const environment = transaction.objectStore(ENVIRONMENT).getAll();
    await done(transaction);
    return buildReport(
      operations.result as OperationRecord[],
      environment.result as EnvironmentRecord[],
    );
  } finally {
    database.close();
  }
}

export async function clearReport(): Promise<void> {
  const database = await open();
  try {
    const transaction = database.transaction([OPERATIONS, ENVIRONMENT], 'readwrite');
    transaction.objectStore(OPERATIONS).clear();
    transaction.objectStore(ENVIRONMENT).clear();
    await done(transaction);
  } finally {
    database.close();
  }
}
