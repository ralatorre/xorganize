/**
 * Turns one observed response into a content-free summary.
 *
 * Runs in the isolated content script. The response body never leaves this
 * function: only its structure does.
 */

import type { ResponseMessage } from '@/src/messaging/protocol';
import { isRecord } from '@/src/messaging/protocol';
import {
  describeKeys,
  describeShape,
  timelineStats,
  type ShapeSummary,
  type TimelineStats,
} from './shape';

export interface OperationObservation {
  op: string;
  transport: 'fetch' | 'xhr';
  host: string;
  method: string;
  status: number;
  bodyLength: number;
  parseable: boolean;
  shape?: ShapeSummary;
  timeline?: TimelineStats;
  /** Length of a top-level `errors` array, if there is one. */
  errors?: number;
  variableKeys?: string[];
  requestBodyKeys?: string[];
  /** Whether `variables.userId` is the logged-in account. Null when either is unknown. */
  userIdIsViewer: boolean | null;
}

export function observe(
  message: ResponseMessage,
  viewerId: string | undefined,
): OperationObservation {
  const observation: OperationObservation = {
    op: message.op,
    transport: message.transport,
    host: message.host,
    method: message.method,
    status: message.status,
    bodyLength: message.body.length,
    parseable: false,
    userIdIsViewer: null,
  };

  const body = parse(message.body);
  if (body !== undefined) {
    observation.parseable = true;
    observation.shape = describeShape(body);
    observation.timeline = timelineStats(body);
    if (isRecord(body) && Array.isArray(body.errors)) observation.errors = body.errors.length;
  }

  const variables = message.variables === undefined ? undefined : parse(message.variables);
  if (variables !== undefined) {
    observation.variableKeys = describeKeys(variables);
    if (isRecord(variables) && typeof variables.userId === 'string' && viewerId !== undefined) {
      observation.userIdIsViewer = variables.userId === viewerId;
    }
  }

  const requestBody = message.requestBody === undefined ? undefined : parse(message.requestBody);
  if (requestBody !== undefined) observation.requestBodyKeys = describeKeys(requestBody);

  return observation;
}

function parse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}
