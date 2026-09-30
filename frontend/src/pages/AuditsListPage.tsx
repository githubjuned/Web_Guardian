import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Audit } from '@webguardian/shared';
import { ChevronRight } from 'lucide-react';
import { api } from '../services/api';
import { AuditStatusBadge } from '../components/Badges';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import { hostOf, scoreColor, timeAgo } from '../utils/format';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export function AuditsListPage() {
  useDocumentTitle('Recent audits');
  const [audits, setAudits] = useState<Audit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.listAudits().then(setAudits).catch((e) => setError((e as Error).message));
  }, []);

  return (
    <div className="container-page py-12">
      <h1 className="text-3xl font-bold tracking-tight">Recent audits</h1>
      <p className="mt-2 text-fg-muted">The latest audits run on this WebGuardian server.</p>
      <div className="mt-8">
        {error && <ErrorState message={error} />}
        {!error && !audits && <LoadingState />}
        {audits && audits.length === 0 && (
          <EmptyState title="No audits yet" message="Start your first audit to see it here." action={<Link to="/audit" className="btn-primary">Audit a website</Link>} />
        )}
        {audits && audits.length > 0 && (
          <ul className="space-y-2">
            {audits.map((a) => (
              <li key={a.id}>
                <Link to={`/audits/${a.id}`} className="card card-hover flex items-center gap-4 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{hostOf(a.url)}</span>
                      <AuditStatusBadge status={a.status} />
                    </div>
                    <p className="truncate font-mono text-xs text-fg-subtle">{a.url}</p>
                  </div>
                  <div className="hidden text-right sm:block">
                    <p className={`text-lg font-bold ${scoreColor(a.scoresAfter?.overall ?? a.scoresBefore?.overall)}`}>{a.scoresAfter?.overall ?? a.scoresBefore?.overall ?? '—'}</p>
                    <p className="text-xs text-fg-subtle">{a.totalIssues} issues</p>
                  </div>
                  <p className="hidden w-24 text-right text-xs text-fg-subtle md:block">{timeAgo(a.createdAt)}</p>
                  <ChevronRight className="h-5 w-5 text-fg-subtle" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
