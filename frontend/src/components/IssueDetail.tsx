import { useEffect, useRef, useState } from 'react';
import type { Issue } from '@webguardian/shared';
import { CheckCircle2, Loader2, RefreshCw, ShieldCheck, Sparkles, ThumbsDown, Wand2, X, AlertTriangle, GraduationCap } from 'lucide-react';
import { api, type IssueVerificationResult } from '../services/api';
import { CategoryBadge, ConfidenceBadge, IssueStatusBadge, PersonaBadge, SeverityBadge } from './Badges';
import { EvidenceViewer } from './EvidenceViewer';
import { FixDiffViewer } from './FixDiffViewer';
import { VerificationPanel } from './VerificationPanel';
import { capitalize } from '../utils/format';

type Busy = 'explain' | 'fix' | 'apply' | 'reject' | 'verify' | null;

/**
 * Issue detail, rendered in a native <dialog> (the browser handles focus
 * containment and Escape-to-close — a modal the user can always leave).
 */
export function IssueDetail({ issue, aiConfigured, onClose, onChange }: { issue: Issue | null; aiConfigured: boolean; onClose: () => void; onChange: (i: Issue) => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [verification, setVerification] = useState<IssueVerificationResult['verification'] | null>(null);
  const [beginner, setBeginner] = useState(false);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (issue && !d.open) d.showModal();
    if (!issue && d.open) d.close();
  }, [issue]);

  useEffect(() => {
    setError(null);
    setVerification(null);
    setBeginner(false);
  }, [issue?.id]);

  async function run(kind: Exclude<Busy, null>, fn: () => Promise<void>) {
    setBusy(kind);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const ai = issue?.ai;
  const fix = issue?.fix;
  const canApply = !!fix && fix.applicable && !fix.appliedAt && issue?.status !== 'fix_rejected';

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby="issue-title"
      className="m-0 ml-auto h-dvh max-h-dvh w-full max-w-3xl border-l border-line bg-ink-900 p-0 text-fg shadow-2xl backdrop:bg-ink-950/70 backdrop:backdrop-blur-sm"
    >
      {issue && (
        <div className="flex h-full flex-col">
          <header className="flex items-start gap-3 border-b border-line px-5 py-4 sm:px-6">
            <div className="min-w-0 flex-1 space-y-2">
              <p className="font-mono text-xs text-fg-subtle">Issue #{issue.number}</p>
              <h2 id="issue-title" className="text-xl font-bold">
                {issue.title}
              </h2>
              <div className="flex flex-wrap gap-1.5">
                <SeverityBadge severity={issue.severity} />
                <CategoryBadge category={issue.category} />
                <PersonaBadge persona={issue.persona} />
                <ConfidenceBadge confidence={issue.confidence} />
                <IssueStatusBadge status={issue.status} />
              </div>
            </div>
            <button type="button" className="btn-ghost p-2" onClick={() => dialogRef.current?.close()} aria-label="Close issue details">
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </header>

          <div className="flex-1 space-y-8 overflow-y-auto px-5 py-6 sm:px-6">
            {/* Explanation */}
            <section aria-labelledby="explain-h" className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 id="explain-h" className="text-sm font-semibold tracking-wider text-fg-subtle">
                  EXPLANATION
                </h3>
                {ai ? (
                  <span className="chip border-azure-400/40 bg-azure-500/10 text-azure-400">
                    <Sparkles className="h-3 w-3" aria-hidden="true" /> Gemini
                  </span>
                ) : (
                  <span className="chip border-line-strong bg-ink-800 text-fg-muted">Rule-based</span>
                )}
                <div className="ml-auto flex gap-2">
                  {ai && (
                    <button type="button" className="btn-ghost px-2.5 py-1.5 text-xs" aria-pressed={beginner} onClick={() => setBeginner((b) => !b)}>
                      <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" /> Explain simply
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-secondary px-2.5 py-1.5 text-xs"
                    disabled={!!busy || !aiConfigured}
                    onClick={() => run('explain', async () => onChange(await api.explainIssue(issue.id)))}
                  >
                    {busy === 'explain' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />}
                    {ai ? 'Re-explain with screenshot' : 'Explain with Gemini'}
                  </button>
                </div>
              </div>
              {!aiConfigured && (
                <p className="flex items-center gap-2 rounded-lg border border-sev-medium/30 bg-sev-medium/10 px-3 py-2 text-xs text-sev-medium">
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> AI explanation temporarily unavailable — showing the deterministic explanation.
                </p>
              )}
              {beginner && ai ? (
                <p className="rounded-xl border border-brand-400/30 bg-brand-500/10 p-4 text-sm leading-relaxed">{ai.beginnerExplanation}</p>
              ) : (
                <dl className="grid gap-4 sm:grid-cols-2">
                  <Explain label="What happened" text={ai?.whatHappened ?? issue.description} wide />
                  <Explain label="Who it affects" text={ai?.whoItAffects ?? issue.affectedUsers} />
                  <Explain label="Why it matters" text={ai?.whyItMatters ?? issue.whyItMatters} />
                  <Explain label="How to fix it" text={ai?.howToFix ?? issue.howToFix} wide />
                  <div className="rounded-xl border border-line bg-ink-850 p-4 sm:col-span-2">
                    <dt className="mb-1 text-xs font-semibold tracking-wider text-fg-subtle">WHY THIS PRIORITY?</dt>
                    <dd className="text-sm text-fg-muted">
                      <span className="mr-2 inline-block align-middle">
                        <SeverityBadge severity={issue.severity} />
                      </span>
                      {issue.priorityReason}
                      {ai && ai.priority !== issue.severity && (
                        <span className="mt-2 block text-xs text-azure-400">
                          Gemini's view: {capitalize(ai.priority)} — {ai.priorityReason}
                        </span>
                      )}
                    </dd>
                  </div>
                </dl>
              )}
            </section>

            {/* Evidence */}
            <section aria-labelledby="evidence-h" className="space-y-3">
              <h3 id="evidence-h" className="text-sm font-semibold tracking-wider text-fg-subtle">
                EVIDENCE
              </h3>
              <EvidenceViewer issue={issue} />
            </section>

            {/* Fix */}
            <section aria-labelledby="fix-h" className="space-y-4">
              <div className="flex items-center gap-2">
                <h3 id="fix-h" className="text-sm font-semibold tracking-wider text-fg-subtle">
                  SUGGESTED FIX
                </h3>
                <button
                  type="button"
                  className="btn-secondary ml-auto px-3 py-1.5 text-xs"
                  disabled={!!busy || !aiConfigured || !!fix?.appliedAt}
                  onClick={() => run('fix', async () => onChange(await api.generateFix(issue.id)))}
                >
                  {busy === 'fix' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />}
                  {busy === 'fix' ? 'Gemini is writing a fix…' : fix ? 'Regenerate fix' : 'Generate Fix'}
                </button>
              </div>
              {!fix && <p className="text-sm text-fg-muted">{aiConfigured ? 'Ask Gemini to propose a minimal code change. Nothing is changed until you approve it.' : 'AI fix generation is temporarily unavailable.'}</p>}
              {fix && <FixDiffViewer fix={fix} />}
              {fix && !fix.applicable && <p className="rounded-lg border border-line bg-ink-850 px-3 py-2 text-sm text-fg-muted">{fix.applicableReason}</p>}
              {fix?.appliedAt && (
                <p className="flex items-center gap-2 text-sm text-brand-300">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Applied with your approval. Now verify it with a fresh re-test.
                </p>
              )}
              {canApply && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand-400/30 bg-brand-500/5 p-4">
                  <p className="mr-auto text-sm">Review the change above. It will only be applied if you approve it.</p>
                  <button type="button" className="btn-ghost" disabled={!!busy} onClick={() => run('reject', async () => onChange(await api.rejectFix(issue.id)))}>
                    <ThumbsDown className="h-4 w-4" aria-hidden="true" /> Reject
                  </button>
                  <button type="button" className="btn-primary" disabled={!!busy} onClick={() => run('apply', async () => onChange(await api.applyFix(issue.id)))}>
                    {busy === 'apply' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
                    Apply Fix
                  </button>
                </div>
              )}
            </section>

            {/* Verify */}
            <section aria-labelledby="verify-h" className="space-y-4 pb-4">
              <div className="flex items-center gap-2">
                <h3 id="verify-h" className="text-sm font-semibold tracking-wider text-fg-subtle">
                  VERIFICATION
                </h3>
                <button
                  type="button"
                  className={`${fix?.appliedAt && issue.status === 'fix_applied' ? 'btn-primary' : 'btn-secondary'} ml-auto px-3 py-1.5 text-xs`}
                  disabled={!!busy}
                  onClick={() =>
                    run('verify', async () => {
                      const r = await api.verifyIssue(issue.id);
                      setVerification(r.verification);
                      onChange(r.issue);
                    })
                  }
                >
                  {busy === 'verify' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : fix?.appliedAt ? <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
                  {busy === 'verify' ? 'Re-testing in a real browser…' : 'Verify Fix'}
                </button>
              </div>
              <p className="text-sm text-fg-muted">Verification re-runs the same deterministic test that found this issue. WebGuardian only reports a fix as working when the re-test confirms it.</p>
              {verification && <VerificationPanel result={verification} />}
            </section>

            {error && (
              <p role="alert" className="rounded-xl border border-sev-critical/40 bg-sev-critical/10 px-4 py-3 text-sm text-sev-critical">
                {error}
              </p>
            )}
          </div>
        </div>
      )}
    </dialog>
  );
}

function Explain({ label, text, wide }: { label: string; text: string; wide?: boolean }) {
  return (
    <div className={`rounded-xl border border-line bg-ink-850 p-4 ${wide ? 'sm:col-span-2' : ''}`}>
      <dt className="mb-1 text-xs font-semibold tracking-wider text-fg-subtle">{label.toUpperCase()}</dt>
      <dd className="text-sm leading-relaxed text-fg-muted">{text}</dd>
    </div>
  );
}
