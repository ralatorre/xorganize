/**
 * Accumulates observations into the diagnostics report. Pure functions: the
 * storage lives in ./store.ts.
 */

import type { EnvironmentObservation } from './environment';
import type { OperationObservation } from './observe';
import type { YesNo } from './shape';

export interface OperationRecord {
  op: string;
  responses: number;
  transports: string[];
  hosts: string[];
  methods: string[];
  statuses: number[];
  unparseable: number;
  responsesWithErrors: number;
  maxBodyLength: number;
  paths: Record<string, string[]>;
  enums: Record<string, string[]>;
  truncated: boolean;
  entryIdPatterns: string[];
  /** Entries in each of the most recent responses. */
  entriesPerResponse: number[];
  entriesTotal: number;
  tweetResultsTotal: number;
  postEntriesTotal: number;
  /** Responses whose post entries were, or were not, sorted from high to low. */
  postSortIndexDescending: YesNo;
  /** Post entries whose sort index is the post's own id. */
  sortIndexIsPostIdTotal: number;
  /** The viewer's own state on the posts seen. */
  bookmarked: YesNo;
  favorited: YesNo;
  variableKeys: string[];
  requestBodyKeys: string[];
  userIdIsViewer: { yes: number; no: number; unknown: number };
}

export interface EnvironmentRecord {
  page: string;
  observations: number;
  accountCookie: string[];
  /** The highest count seen for each selector on this kind of page. */
  selectors: Record<string, number>;
}

export interface DiagnosticsReport {
  format: 'xorganize-diagnostics';
  version: 1;
  note: string;
  operations: OperationRecord[];
  environment: EnvironmentRecord[];
}

const RECENT = 50;

export function mergeOperation(
  existing: OperationRecord | undefined,
  seen: OperationObservation,
): OperationRecord {
  const record: OperationRecord = existing ?? {
    op: seen.op,
    responses: 0,
    transports: [],
    hosts: [],
    methods: [],
    statuses: [],
    unparseable: 0,
    responsesWithErrors: 0,
    maxBodyLength: 0,
    paths: {},
    enums: {},
    truncated: false,
    entryIdPatterns: [],
    entriesPerResponse: [],
    entriesTotal: 0,
    tweetResultsTotal: 0,
    postEntriesTotal: 0,
    postSortIndexDescending: { yes: 0, no: 0 },
    sortIndexIsPostIdTotal: 0,
    bookmarked: { yes: 0, no: 0 },
    favorited: { yes: 0, no: 0 },
    variableKeys: [],
    requestBodyKeys: [],
    userIdIsViewer: { yes: 0, no: 0, unknown: 0 },
  };

  record.responses += 1;
  record.transports = union(record.transports, [seen.transport]);
  record.hosts = union(record.hosts, [seen.host]);
  record.methods = union(record.methods, [seen.method]);
  record.statuses = [...new Set([...record.statuses, seen.status])].sort((a, b) => a - b);
  record.maxBodyLength = Math.max(record.maxBodyLength, seen.bodyLength);
  if (!seen.parseable) record.unparseable += 1;
  if (seen.errors) record.responsesWithErrors += 1;

  if (seen.shape) {
    record.paths = unionRecord(record.paths, seen.shape.paths);
    record.enums = unionRecord(record.enums, seen.shape.enums);
    record.truncated ||= seen.shape.truncated;
  }
  if (seen.timeline) {
    record.entryIdPatterns = union(record.entryIdPatterns, seen.timeline.entryIdPatterns);
    record.entriesPerResponse = [...record.entriesPerResponse, seen.timeline.entries].slice(
      -RECENT,
    );
    record.entriesTotal += seen.timeline.entries;
    record.tweetResultsTotal += seen.timeline.tweetResults;
    record.postEntriesTotal += seen.timeline.postEntries;
    record.sortIndexIsPostIdTotal += seen.timeline.sortIndexIsPostId;
    if (seen.timeline.postSortIndexDescending === true) record.postSortIndexDescending.yes += 1;
    if (seen.timeline.postSortIndexDescending === false) record.postSortIndexDescending.no += 1;
    for (const flag of ['bookmarked', 'favorited'] as const) {
      record[flag].yes += seen.timeline[flag].yes;
      record[flag].no += seen.timeline[flag].no;
    }
  }
  record.variableKeys = union(record.variableKeys, seen.variableKeys ?? []);
  record.requestBodyKeys = union(record.requestBodyKeys, seen.requestBodyKeys ?? []);
  record.userIdIsViewer[
    seen.userIdIsViewer === null ? 'unknown' : seen.userIdIsViewer ? 'yes' : 'no'
  ] += 1;

  return record;
}

export function mergeEnvironment(
  existing: EnvironmentRecord | undefined,
  seen: EnvironmentObservation,
): EnvironmentRecord {
  const record: EnvironmentRecord = existing ?? {
    page: seen.page,
    observations: 0,
    accountCookie: [],
    selectors: {},
  };
  record.observations += 1;
  record.accountCookie = union(record.accountCookie, [seen.accountCookie]);
  for (const [name, count] of Object.entries(seen.selectors)) {
    record.selectors[name] = Math.max(record.selectors[name] ?? 0, count);
  }
  return record;
}

export function buildReport(
  operations: OperationRecord[],
  environment: EnvironmentRecord[],
): DiagnosticsReport {
  return {
    format: 'xorganize-diagnostics',
    version: 1,
    note:
      'Structure only: key names, value types, counts, and schema names. ' +
      'No post text, handles, ids, cookies or tokens.',
    operations: [...operations].sort((a, b) => a.op.localeCompare(b.op)),
    environment: [...environment].sort((a, b) => a.page.localeCompare(b.page)),
  };
}

function union(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b])].sort();
}

function unionRecord(
  a: Record<string, string[]>,
  b: Record<string, string[]>,
): Record<string, string[]> {
  const merged: Record<string, string[]> = { ...a };
  for (const [key, values] of Object.entries(b)) merged[key] = union(merged[key] ?? [], values);
  return merged;
}
