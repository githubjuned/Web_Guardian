/**
 * Live audit state via Server-Sent Events, with automatic fallback to polling
 * if the stream cannot be established (e.g. behind a proxy that buffers SSE).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Audit, AuditEvent } from '@webguardian/shared';
import { api } from '../services/api';

export interface LiveFrame {
  data: string;
  caption: string;
  url: string;
  timestamp: string;
}

export function useAuditStream(auditId: string | undefined) {
  const [audit, setAudit] = useState<Audit | null>(null);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [frame, setFrame] = useState<LiveFrame | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'sse' | 'polling'>('sse');
  const lastEventId = useRef(0);

  const refresh = useCallback(async () => {
    if (!auditId) return;
    try {
      setAudit(await api.getAudit(auditId));
    } catch (err) {
      setError((err as Error).message);
    }
  }, [auditId]);

  useEffect(() => {
    if (!auditId) return;
    setEvents([]);
    lastEventId.current = 0;
    let closed = false;
    let failures = 0;
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    let source: EventSource | undefined;

    const addEvents = (incoming: AuditEvent[]) => {
      const fresh = incoming.filter((e) => e.id > lastEventId.current);
      if (!fresh.length) return;
      lastEventId.current = fresh[fresh.length - 1].id;
      setEvents((prev) => [...prev, ...fresh].slice(-500));
    };

    const startPolling = () => {
      setMode('polling');
      const tick = async () => {
        try {
          const a = await api.getAudit(auditId);
          setAudit(a);
          const report = await fetch(api.reportUrl(auditId)).then((r) => r.json());
          addEvents(report.events ?? []);
        } catch (err) {
          setError((err as Error).message);
        }
      };
      void tick();
      pollTimer = setInterval(tick, 2500);
    };

    const connect = () => {
      source = new EventSource(api.eventsUrl(auditId));
      source.addEventListener('audit', (e) => {
        failures = 0;
        setAudit(JSON.parse((e as MessageEvent).data));
        setError(null);
      });
      source.addEventListener('event', (e) => addEvents([JSON.parse((e as MessageEvent).data)]));
      source.addEventListener('frame', (e) => setFrame(JSON.parse((e as MessageEvent).data)));
      source.onerror = () => {
        if (closed) return;
        failures++;
        if (failures >= 3) {
          source?.close();
          startPolling();
        }
      };
    };

    // Load the audit first so 404s are reported clearly.
    api
      .getAudit(auditId)
      .then((a) => {
        if (closed) return;
        setAudit(a);
        if (typeof EventSource === 'undefined') startPolling();
        else connect();
      })
      .catch((err) => setError((err as Error).message));

    return () => {
      closed = true;
      source?.close();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [auditId]);

  return { audit, setAudit, events, frame, error, mode, refresh };
}
