import type { AuditStatus, Category, Confidence, IssueStatus, Persona, Severity } from '@webguardian/shared';
import { Accessibility, Eye, Gauge, Keyboard, Search, ShieldCheck, ShieldAlert, ShieldQuestion } from 'lucide-react';
import { CATEGORY_LABEL, PERSONA_LABEL, STATUS_LABEL, capitalize, isRunning } from '../utils/format';

const SEVERITY_STYLE: Record<Severity, string> = {
  critical: 'border-sev-critical/40 bg-sev-critical/10 text-sev-critical',
  high: 'border-sev-high/40 bg-sev-high/10 text-sev-high',
  medium: 'border-sev-medium/40 bg-sev-medium/10 text-sev-medium',
  low: 'border-sev-low/40 bg-sev-low/10 text-sev-low',
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={`chip font-semibold uppercase tracking-wide ${SEVERITY_STYLE[severity]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {severity}
    </span>
  );
}

const PERSONA_ICON: Record<Persona, typeof Keyboard> = {
  keyboard: Keyboard,
  'screen-reader': Accessibility,
  'low-vision': Eye,
  'slow-device': Gauge,
  'first-time-visitor': Search,
};

export function PersonaBadge({ persona }: { persona: Persona }) {
  const Icon = PERSONA_ICON[persona];
  return (
    <span className="chip border-brand-400/30 bg-brand-500/10 text-brand-300">
      <Icon className="h-3 w-3" aria-hidden="true" />
      {PERSONA_LABEL[persona]}
    </span>
  );
}

export function PersonaIcon({ persona, className }: { persona: Persona; className?: string }) {
  const Icon = PERSONA_ICON[persona];
  return <Icon className={className} aria-hidden="true" />;
}

const CONFIDENCE_INFO: Record<Confidence, { icon: typeof ShieldCheck; style: string; hint: string }> = {
  high: { icon: ShieldCheck, style: 'border-ok/30 bg-ok/10 text-ok', hint: 'Confirmed directly by a deterministic test' },
  medium: { icon: ShieldAlert, style: 'border-sev-medium/30 bg-sev-medium/10 text-sev-medium', hint: 'Detected with heuristic or AI-assisted reasoning' },
  low: { icon: ShieldQuestion, style: 'border-line-strong bg-ink-700 text-fg-muted', hint: 'Evidence is uncertain — please double-check' },
};

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  const info = CONFIDENCE_INFO[confidence];
  const Icon = info.icon;
  return (
    <span className={`chip ${info.style}`} title={info.hint}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {capitalize(confidence)} confidence
    </span>
  );
}

export function CategoryBadge({ category }: { category: Category }) {
  return <span className="chip border-line-strong bg-ink-800 text-fg-muted">{CATEGORY_LABEL[category]}</span>;
}

const ISSUE_STATUS: Record<IssueStatus, { label: string; style: string }> = {
  open: { label: 'Open', style: 'border-line-strong bg-ink-800 text-fg-muted' },
  fix_proposed: { label: 'Fix proposed', style: 'border-azure-400/40 bg-azure-500/10 text-azure-400' },
  fix_applied: { label: 'Fix applied · verify', style: 'border-brand-400/40 bg-brand-500/10 text-brand-300' },
  fix_rejected: { label: 'Fix rejected', style: 'border-line-strong bg-ink-800 text-fg-subtle' },
  resolved: { label: 'Verified resolved', style: 'border-ok/40 bg-ok/10 text-ok' },
  still_present: { label: 'Still present', style: 'border-sev-critical/40 bg-sev-critical/10 text-sev-critical' },
};

export function IssueStatusBadge({ status }: { status: IssueStatus }) {
  const s = ISSUE_STATUS[status];
  return <span className={`chip ${s.style}`}>{s.label}</span>;
}

export function AuditStatusBadge({ status }: { status: AuditStatus }) {
  const running = isRunning(status);
  const style =
    status === 'failed'
      ? 'border-sev-critical/40 bg-sev-critical/10 text-sev-critical'
      : status === 'completed' || status === 'verified'
        ? 'border-ok/40 bg-ok/10 text-ok'
        : 'border-brand-400/40 bg-brand-500/10 text-brand-300';
  return (
    <span className={`chip ${style}`}>
      {running && <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-current" aria-hidden="true" />}
      {STATUS_LABEL[status]}
    </span>
  );
}
