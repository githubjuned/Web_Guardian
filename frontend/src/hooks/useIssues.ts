import { useCallback, useEffect, useState } from 'react';
import type { Issue } from '@webguardian/shared';
import { api } from '../services/api';

/** Loads issues once an audit has results; reloads whenever `version` changes. */
export function useIssues(auditId: string | undefined, enabled: boolean, version: string) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!auditId) return;
    setLoading(true);
    try {
      setIssues(await api.getIssues(auditId));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [auditId]);

  useEffect(() => {
    if (enabled) void load();
  }, [enabled, version, load]);

  const replace = useCallback((updated: Issue) => {
    setIssues((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
  }, []);

  return { issues, loading, error, reload: load, replace };
}
