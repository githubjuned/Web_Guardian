import { CheckCircle2, XCircle } from 'lucide-react';
import type { IssueVerificationResult } from '../services/api';
import { assetUrl } from '../services/api';

export function VerificationPanel({ result }: { result: IssueVerificationResult['verification'] }) {
  const resolved = result.status === 'resolved';
  const before = assetUrl(result.before.screenshot);
  const after = assetUrl(result.after.screenshot);
  return (
    <div className={`space-y-4 rounded-xl border p-4 ${resolved ? 'border-ok/40 bg-ok/5' : 'border-sev-critical/40 bg-sev-critical/5'}`} role="status">
      <div className="flex items-center gap-2">
        {resolved ? <CheckCircle2 className="h-5 w-5 text-ok" aria-hidden="true" /> : <XCircle className="h-5 w-5 text-sev-critical" aria-hidden="true" />}
        <p className="font-semibold">{resolved ? 'Verified: the issue is resolved' : 'Still present after re-testing'}</p>
      </div>
      <p className="text-sm text-fg-muted">
        WebGuardian re-ran <strong className="text-fg">{result.checkedBy}</strong> on the same page in a fresh browser.{' '}
        {resolved ? 'The problem is no longer detected.' : result.after.evidence}
        {result.after.sameRuleElsewhere > 0 && ` (${result.after.sameRuleElsewhere} other element(s) on this page still fail the same rule.)`}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { label: 'BEFORE', src: before, count: result.before.pageFindings, tone: 'text-sev-critical' },
          { label: 'AFTER', src: after, count: result.after.pageFindings, tone: resolved ? 'text-ok' : 'text-sev-critical' },
        ].map((s) => (
          <figure key={s.label} className="overflow-hidden rounded-lg border border-line bg-ink-950">
            <figcaption className="flex items-center justify-between px-3 py-1.5 text-xs">
              <span className={`font-semibold tracking-wider ${s.tone}`}>{s.label}</span>
              <span className="text-fg-subtle">{s.count} finding(s) on page</span>
            </figcaption>
            {s.src ? <img src={s.src} alt={`${s.label.toLowerCase()} screenshot of the page`} className="max-h-48 w-full object-cover object-top" /> : null}
          </figure>
        ))}
      </div>
    </div>
  );
}
