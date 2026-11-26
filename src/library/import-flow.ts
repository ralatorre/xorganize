/**
 * The steps of an import in the library (docs/DESIGN.md, 5.6): a file is
 * picked and read, its preview asks merge or replace, and the import runs.
 * Changes are pure, so the page holds no rules of its own.
 */

import {
  backupSummary,
  type BackupSummary,
  type ImportMode,
  type ImportResult,
} from '@/src/transfer/import';
import type { Backup, ParsedBackup } from '@/src/transfer/validate';
import { importStatus, problemMessage } from './import-messages';

export type ImportFlow =
  /** Nothing under way. `status` says how the last attempt went, if there was one. */
  | { step: 'idle'; status: string }
  | { step: 'reading' }
  | { step: 'preview'; backup: Backup; summary: BackupSummary }
  | { step: 'importing'; mode: ImportMode; summary: BackupSummary };

export type ImportEvent =
  | { type: 'read' }
  | { type: 'parsed'; result: ParsedBackup }
  | { type: 'cancel' }
  | { type: 'write'; mode: ImportMode }
  /** The import finished, with what it wrote, or undefined if it failed. */
  | { type: 'written'; result: ImportResult | undefined };

export const IDLE: ImportFlow = { step: 'idle', status: '' };

export function changeImport(flow: ImportFlow, event: ImportEvent): ImportFlow {
  switch (event.type) {
    case 'read':
      return flow.step === 'idle' ? { step: 'reading' } : flow;
    case 'parsed':
      if (flow.step !== 'reading') return flow;
      return event.result.ok
        ? {
            step: 'preview',
            backup: event.result.backup,
            summary: backupSummary(event.result.backup),
          }
        : { step: 'idle', status: problemMessage(event.result.problem) };
    case 'cancel':
      return flow.step === 'preview' ? IDLE : flow;
    case 'write':
      if (flow.step !== 'preview') return flow;
      // A file holding part of a library is never offered Replace; refuse it here too.
      if (event.mode === 'replace' && flow.summary.partial) return flow;
      return { step: 'importing', mode: event.mode, summary: flow.summary };
    case 'written':
      return flow.step === 'importing'
        ? { step: 'idle', status: importStatus(event.result) }
        : flow;
  }
}

/** True while a file is being read or written: the import button waits. */
export const isBusy = (flow: ImportFlow) => flow.step === 'reading' || flow.step === 'importing';
