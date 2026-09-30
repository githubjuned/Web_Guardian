import type { FixProposal } from '@webguardian/shared';
import { CopyButton } from './EvidenceViewer';

function lineClass(line: string) {
  if (line.startsWith('+++') || line.startsWith('---')) return 'text-fg-subtle';
  if (line.startsWith('+')) return 'diff-add';
  if (line.startsWith('-')) return 'diff-del';
  if (line.startsWith('@@')) return 'diff-hunk';
  return 'text-fg-muted';
}

const RISK_STYLE = {
  low: 'border-ok/40 bg-ok/10 text-ok',
  medium: 'border-sev-medium/40 bg-sev-medium/10 text-sev-medium',
  high: 'border-sev-critical/40 bg-sev-critical/10 text-sev-critical',
};

/** Shows an AI-generated fix as BEFORE / AFTER code plus a unified diff. */
export function FixDiffViewer({ fix }: { fix: FixProposal }) {
  const lines = fix.diff.split('\n').filter((l) => !l.startsWith('=====') && !l.startsWith('Index:') && l !== '\\ No newline at end of file');
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="chip border-azure-400/40 bg-azure-500/10 text-azure-400">AI generated fix · Gemini</span>
        <span className={`chip ${RISK_STYLE[fix.risk]}`}>Risk: {fix.risk}</span>
        {fix.file && <code className="chip border-line-strong bg-ink-950 font-mono text-fg-muted">{fix.file}</code>}
      </div>
      <p className="font-semibold">{fix.summary}</p>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <div className="mb-1 flex items-center justify-between">
            <h4 className="text-xs font-semibold tracking-wider text-sev-critical">BEFORE</h4>
          </div>
          <pre className="max-h-64 overflow-auto rounded-lg border border-sev-critical/25 bg-ink-950 p-3 text-xs leading-relaxed whitespace-pre-wrap text-fg-muted">
            {fix.oldCode}
          </pre>
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <h4 className="text-xs font-semibold tracking-wider text-ok">AFTER</h4>
            <CopyButton text={fix.newCode} label="fixed code" />
          </div>
          <pre className="max-h-64 overflow-auto rounded-lg border border-ok/25 bg-ink-950 p-3 text-xs leading-relaxed whitespace-pre-wrap text-fg">{fix.newCode}</pre>
        </div>
      </div>

      <details className="rounded-lg border border-line bg-ink-950">
        <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-fg-muted">Unified diff</summary>
        <pre className="max-h-72 overflow-auto border-t border-line py-2 text-xs leading-relaxed" aria-label="Code diff">
          {lines.map((l, i) => (
            <div key={i} className={`px-3 ${lineClass(l)}`}>
              {l || ' '}
            </div>
          ))}
        </pre>
      </details>

      <div>
        <h4 className="mb-1 text-xs font-semibold tracking-wider text-fg-subtle">EXPLANATION</h4>
        <p className="text-sm text-fg-muted">{fix.explanation}</p>
      </div>
    </div>
  );
}
