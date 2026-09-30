import { useState } from 'react';
import type { Issue } from '@webguardian/shared';
import { Check, Copy, ExternalLink, Maximize2 } from 'lucide-react';
import { assetUrl } from '../services/api';

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn-ghost px-2 py-1 text-xs"
      onClick={async () => {
        await navigator.clipboard?.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-ok" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

export function EvidenceViewer({ issue }: { issue: Issue }) {
  const shot = assetUrl(issue.screenshotPath);
  const metrics = issue.metrics ? Object.entries(issue.metrics).filter(([, v]) => v !== null && typeof v !== 'object') : [];
  return (
    <div className="space-y-4">
      {shot && (
        <figure className="overflow-hidden rounded-xl border border-line bg-ink-950">
          <a href={shot} target="_blank" rel="noreferrer" className="group relative block" aria-label="Open evidence screenshot in a new tab">
            <img src={shot} alt={`Screenshot evidence for "${issue.title}" with the affected element highlighted in red`} className="w-full" loading="lazy" />
            <span className="absolute top-2 right-2 rounded-md bg-ink-950/80 p-1.5 text-fg-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              <Maximize2 className="h-4 w-4" aria-hidden="true" />
            </span>
          </a>
          <figcaption className="border-t border-line px-3 py-2 text-xs text-fg-subtle">
            Captured by the agent's browser at the moment of detection. The highlighted element is the evidence.
          </figcaption>
        </figure>
      )}

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium text-fg-subtle">Page</dt>
          <dd className="truncate font-mono text-xs">
            <a href={issue.pageUrl} target="_blank" rel="noreferrer" className="text-azure-400 hover:underline">
              {issue.pageUrl}
            </a>
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-fg-subtle">Detected by</dt>
          <dd>{issue.detectedBy}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-fg-subtle">Rule</dt>
          <dd className="flex items-center gap-1.5 font-mono text-xs">
            {issue.rule}
            {issue.helpUrl && (
              <a href={issue.helpUrl} target="_blank" rel="noreferrer" className="text-azure-400" aria-label={`Documentation for rule ${issue.rule}`}>
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            )}
          </dd>
        </div>
        {metrics.map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs font-medium text-fg-subtle">{k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}</dt>
            <dd className="font-mono text-xs">{String(v)}</dd>
          </div>
        ))}
      </dl>

      {issue.selector && (
        <div>
          <div className="mb-1 flex items-center justify-between">
            <h4 className="text-xs font-medium text-fg-subtle">CSS selector</h4>
            <CopyButton text={issue.selector} label="selector" />
          </div>
          <code className="block overflow-x-auto rounded-lg border border-line bg-ink-950 px-3 py-2 text-xs text-brand-300">{issue.selector}</code>
        </div>
      )}

      {issue.htmlSnippet && (
        <div>
          <div className="mb-1 flex items-center justify-between">
            <h4 className="text-xs font-medium text-fg-subtle">HTML snippet</h4>
            <CopyButton text={issue.htmlSnippet} label="HTML" />
          </div>
          <pre className="max-h-56 overflow-auto rounded-lg border border-line bg-ink-950 p-3 text-xs leading-relaxed whitespace-pre-wrap text-fg-muted">
            {issue.htmlSnippet}
          </pre>
        </div>
      )}

      {issue.steps.length > 0 && (
        <div>
          <h4 className="mb-1.5 text-xs font-medium text-fg-subtle">Steps to reproduce</h4>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-fg-muted">
            {issue.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
