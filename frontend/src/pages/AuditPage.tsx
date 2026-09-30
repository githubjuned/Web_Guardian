import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import type { Issue, Severity } from '@webguardian/shared';
import { ArrowLeft, Download, ExternalLink, Loader2, RefreshCw, ShieldCheck, History } from 'lucide-react';
import { useAuditStream } from '../hooks/useAuditStream';
import { useIssues } from '../hooks/useIssues';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { api, type ServerConfig } from '../services/api';
import { AgentLiveView } from '../components/AgentLiveView';
import { AuditProgress, DetectorStatusList } from '../components/AuditProgress';
import { AuditStatusBadge } from '../components/Badges';
import { CategoryScoreGrid, IssueSummaryCards } from '../components/ScoreCards';
import { AiSummaryCard } from '../components/AiSummaryCard';
import { IssueList } from '../components/IssueList';
import { IssueDetail } from '../components/IssueDetail';
import { BeforeAfterComparison } from '../components/BeforeAfterComparison';
import { AuditChat } from '../components/AuditChat';
import { ErrorState, LoadingState } from '../components/States';
import { hostOf, isRunning } from '../utils/format';

export function AuditPage() {
  const { id } = useParams<{ id: string }>();
  const { audit, setAudit, events, frame, error } = useAuditStream(id);
  const hasResults = !!audit && ['completed', 'verified', 'verifying'].includes(audit.status);
  const { issues, replace, reload } = useIssues(id, hasResults, `${audit?.status}-${audit?.resolvedIssues}-${audit?.aiStatus}-${audit?.lastVerification?.id ?? ''}`);
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [severity, setSeverity] = useState<Severity | null>(null);
  const [params, setParams] = useSearchParams();
  const [showTimeline, setShowTimeline] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const openId = params.get('issue');
  const openIssue = useMemo(() => issues.find((i) => i.id === openId) ?? null, [issues, openId]);

  useDocumentTitle(audit ? `Audit · ${hostOf(audit.url)}` : 'Audit');
  useEffect(() => {
    api.config().then(setConfig).catch(() => undefined);
  }, []);

  const openIssueFn = useCallback(
    (i: Issue) =>
      setParams(
        (p) => {
          p.set('issue', i.id);
          return p;
        },
        { replace: false },
      ),
    [setParams],
  );
  const closeIssue = useCallback(
    () =>
      setParams((p) => {
        p.delete('issue');
        return p;
      }),
    [setParams],
  );

  if (error && !audit) return <div className="container-page py-16"><ErrorState title="Audit not available" message={error} action={<Link to="/audit" className="btn-primary">Start a new audit</Link>} /></div>;
  if (!audit) return <LoadingState label="Connecting to the agent…" />;

  const running = isRunning(audit.status);
  const aiConfigured = config?.aiConfigured ?? audit.aiStatus === 'available';

  async function verifyAll() {
    if (!audit) return;
    setVerifyError(null);
    try {
      setAudit(await api.verifyAudit(audit.id));
      setShowTimeline(true);
    } catch (e) {
      setVerifyError((e as Error).message);
    }
  }

  const appliedFixes = issues.filter((i) => i.fix?.appliedAt).length;

  return (
    <div className="container-page space-y-6 py-8">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
        <div className="min-w-0 flex-1">
          <Link to="/audit" className="mb-3 inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> New audit
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{hostOf(audit.url)}</h1>
            <AuditStatusBadge status={audit.status} />
          </div>
          <a href={audit.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex max-w-full items-center gap-1 truncate font-mono text-sm text-azure-400 hover:underline">
            <span className="truncate">{audit.url}</span> <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          </a>
        </div>
        {hasResults && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-ghost" onClick={() => setShowTimeline((s) => !s)} aria-expanded={showTimeline}>
              <History className="h-4 w-4" aria-hidden="true" /> {showTimeline ? 'Hide' : 'Show'} agent timeline
            </button>
            <a href={api.reportUrl(audit.id)} className="btn-secondary" download={`webguardian-${audit.id}.json`}>
              <Download className="h-4 w-4" aria-hidden="true" /> Report (JSON)
            </a>
            <button type="button" className="btn-primary" onClick={verifyAll} disabled={audit.status === 'verifying'}>
              {audit.status === 'verifying' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="h-4 w-4" aria-hidden="true" />}
              {audit.status === 'verifying' ? 'Re-testing…' : appliedFixes ? `Verify ${appliedFixes} fix${appliedFixes === 1 ? '' : 'es'} (full re-test)` : 'Re-test website'}
            </button>
          </div>
        )}
      </div>
      {verifyError && (
        <p role="alert" className="rounded-xl border border-sev-critical/40 bg-sev-critical/10 px-4 py-3 text-sm text-sev-critical">
          {verifyError}
        </p>
      )}

      {audit.status === 'failed' && (
        <ErrorState
          title="The audit could not finish"
          message={audit.error ?? 'Unknown error'}
          action={
            <Link to="/audit" className="btn-primary">
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again
            </Link>
          }
        />
      )}

      {(running || showTimeline) && (
        <>
          <AuditProgress audit={audit} />
          <AgentLiveView frame={frame} events={events} running={running} />
        </>
      )}

      {Object.keys(audit.detectors).length > 0 && (running || hasResults) && (
        <details className="card px-5 py-4" open={running}>
          <summary className="cursor-pointer text-sm font-semibold">Detectors</summary>
          <div className="mt-3">
            <DetectorStatusList detectors={audit.detectors} />
          </div>
        </details>
      )}

      {hasResults && audit.scoresBefore && (
        <>
          <BeforeAfterComparison audit={audit} />
          <AiSummaryCard audit={audit} issues={issues} onOpen={openIssueFn} onAuditChange={(a) => { setAudit(a); void reload(); }} />
          <section aria-label="Scores" className="space-y-3">
            <CategoryScoreGrid scores={audit.lastVerification ? audit.scoresAfter ?? audit.scoresBefore : audit.scoresBefore} issues={issues.filter((i) => i.status !== 'resolved')} />
            {audit.lastVerification && <p className="text-xs text-fg-subtle">Scores reflect the latest verification re-test.</p>}
            {audit.lighthouse && (
              <p className="text-xs text-fg-subtle">
                Lighthouse (mobile, simulated slow 4G) on the homepage: performance {audit.lighthouse.performance ?? '—'} · accessibility {audit.lighthouse.accessibility ?? '—'} · SEO{' '}
                {audit.lighthouse.seo ?? '—'} · LCP {audit.lighthouse.lcpMs ? `${(audit.lighthouse.lcpMs / 1000).toFixed(1)} s` : '—'}
              </p>
            )}
          </section>
          <IssueSummaryCards counts={audit.issueCounts} total={audit.totalIssues} selected={severity} onSelect={setSeverity} />
          <p className="text-sm text-fg-muted">
            Scanned {audit.pages.filter((p) => p.status === 'scanned').length} page(s)
            {audit.pages.some((p) => p.status === 'failed') && ` · ${audit.pages.filter((p) => p.status === 'failed').length} page(s) could not be loaded`}. Every issue below was detected by a
            deterministic test and carries evidence.
          </p>
          <IssueList issues={issues} severity={severity} activeId={openId} onOpen={openIssueFn} />
        </>
      )}

      <IssueDetail issue={openIssue} aiConfigured={aiConfigured} onClose={closeIssue} onChange={replace} />
      {hasResults && <AuditChat auditId={audit.id} issues={issues} aiConfigured={aiConfigured} enabled={hasResults} onOpen={openIssueFn} />}
    </div>
  );
}
