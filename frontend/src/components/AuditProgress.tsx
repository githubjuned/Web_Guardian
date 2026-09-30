import type { Audit, AuditStatus, DetectorName, DetectorState } from '@webguardian/shared';
import { Check, CircleDashed, Loader2, X, MinusCircle } from 'lucide-react';

const PIPELINE: { status: AuditStatus; label: string }[] = [
  { status: 'queued', label: 'Queued' },
  { status: 'initializing', label: 'Browser' },
  { status: 'crawling', label: 'Crawling' },
  { status: 'testing', label: 'Persona tests' },
  { status: 'analyzing', label: 'Gemini analysis' },
  { status: 'generating_report', label: 'Report' },
  { status: 'completed', label: 'Done' },
];

const DETECTOR_LABEL: Record<DetectorName, string> = {
  'axe-core': 'Accessibility (axe-core)',
  'keyboard-persona': 'Keyboard persona',
  seo: 'SEO & metadata',
  performance: 'Page weight',
  functionality: 'Links & errors',
  'mobile-ux': 'Mobile layout',
  lighthouse: 'Lighthouse',
};

export function AuditProgress({ audit }: { audit: Audit }) {
  const verifying = audit.status === 'verifying';
  const current = PIPELINE.findIndex((p) => p.status === audit.status);

  return (
    <section aria-labelledby="progress-heading" className="card p-5">
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 id="progress-heading" className="text-sm font-semibold">
          {verifying ? 'Verification in progress' : 'Audit progress'}
        </h2>
        <span className="font-mono text-sm text-fg-muted">{audit.progress}%</span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-ink-700"
        role="progressbar"
        aria-valuenow={audit.progress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Audit progress"
      >
        <div className="h-full rounded-full bg-gradient-to-r from-brand-600 to-azure-400 transition-all duration-500" style={{ width: `${audit.progress}%` }} />
      </div>
      <p className="mt-3 text-sm text-fg-muted" aria-live="polite">
        {audit.stage}
      </p>

      {!verifying && (
        <ol className="mt-5 grid grid-cols-4 gap-2 sm:grid-cols-7" aria-label="Audit stages">
          {PIPELINE.map((p, i) => {
            const done = audit.status === 'failed' ? false : i < current || audit.status === 'completed';
            const active = i === current && audit.status !== 'completed';
            return (
              <li key={p.status} className="flex flex-col items-center gap-1.5 text-center" aria-current={active ? 'step' : undefined}>
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full border text-xs ${
                    done ? 'border-ok/50 bg-ok/15 text-ok' : active ? 'border-brand-400 bg-brand-500/20 text-brand-300' : 'border-line bg-ink-800 text-fg-subtle'
                  }`}
                >
                  {done ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : active ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : i + 1}
                </span>
                <span className={`text-[11px] leading-tight ${active ? 'text-fg' : 'text-fg-subtle'}`}>{p.label}</span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

export function DetectorStatusList({ detectors }: { detectors: Audit['detectors'] }) {
  const entries = Object.entries(detectors) as [DetectorName, DetectorState][];
  if (!entries.length) return null;
  return (
    <ul className="grid gap-2 sm:grid-cols-2" aria-label="Detector status">
      {entries.map(([name, state]) => (
        <li key={name} className="flex items-center gap-2 text-sm">
          <DetectorIcon state={state} />
          <span className="text-fg-muted">{DETECTOR_LABEL[name] ?? name}</span>
          <span className="sr-only">: {state}</span>
          {(state === 'unavailable' || state === 'failed') && (
            <span className="text-xs text-sev-medium">{state === 'failed' ? 'partial' : 'unavailable'}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function DetectorIcon({ state }: { state: DetectorState }) {
  switch (state) {
    case 'completed':
      return <Check className="h-4 w-4 text-ok" aria-hidden="true" />;
    case 'running':
      return <Loader2 className="h-4 w-4 animate-spin text-brand-300" aria-hidden="true" />;
    case 'failed':
      return <X className="h-4 w-4 text-sev-high" aria-hidden="true" />;
    case 'unavailable':
      return <MinusCircle className="h-4 w-4 text-sev-medium" aria-hidden="true" />;
    default:
      return <CircleDashed className="h-4 w-4 text-fg-subtle" aria-hidden="true" />;
  }
}
