/**
 * Live audit event bus.
 * - Timeline events are persisted (so a page refresh replays history) and broadcast.
 * - Browser "frames" (JPEG screenshots of what the agent sees) are broadcast only;
 *   the latest frame per audit is kept in memory for late subscribers.
 */
import { EventEmitter } from 'node:events';
import type { Audit, AuditEvent } from '@webguardian/shared';
import { insertEvent } from '../database/repository';

export interface FramePayload {
  auditId: string;
  data: string; // base64 JPEG
  caption: string;
  url: string;
  timestamp: string;
}

export type BusMessage =
  | { kind: 'event'; event: AuditEvent }
  | { kind: 'frame'; frame: FramePayload }
  | { kind: 'audit'; audit: Audit };

const emitter = new EventEmitter();
emitter.setMaxListeners(200);
const latestFrames = new Map<string, FramePayload>();

export function publishEvent(
  auditId: string,
  type: AuditEvent['type'],
  message: string,
  metadata?: Record<string, unknown> | null,
): AuditEvent {
  const event = insertEvent({ auditId, type, message, metadata: metadata ?? null });
  emitter.emit(auditId, { kind: 'event', event } satisfies BusMessage);
  return event;
}

export function publishFrame(auditId: string, data: Buffer, caption: string, url: string) {
  const frame: FramePayload = { auditId, data: data.toString('base64'), caption, url, timestamp: new Date().toISOString() };
  latestFrames.set(auditId, frame);
  emitter.emit(auditId, { kind: 'frame', frame } satisfies BusMessage);
}

export function publishAudit(audit: Audit) {
  emitter.emit(audit.id, { kind: 'audit', audit } satisfies BusMessage);
}

export function latestFrame(auditId: string): FramePayload | undefined {
  return latestFrames.get(auditId);
}

export function subscribe(auditId: string, listener: (msg: BusMessage) => void): () => void {
  emitter.on(auditId, listener);
  return () => emitter.off(auditId, listener);
}
