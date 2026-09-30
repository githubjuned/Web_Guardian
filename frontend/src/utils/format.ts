import type { AuditStatus, Category, Persona, Severity } from '@webguardian/shared';

export const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low'];

export const CATEGORY_LABEL: Record<Category, string> = {
  accessibility: 'Accessibility',
  seo: 'SEO',
  performance: 'Performance',
  functionality: 'Functionality',
  ux: 'UX',
};

export const PERSONA_LABEL: Record<Persona, string> = {
  keyboard: 'Keyboard-only',
  'screen-reader': 'Screen reader',
  'low-vision': 'Low vision',
  'slow-device': 'Slow device',
  'first-time-visitor': 'First-time visitor',
};

export const STATUS_LABEL: Record<AuditStatus, string> = {
  queued: 'Queued',
  initializing: 'Initializing',
  crawling: 'Crawling',
  testing: 'Testing',
  analyzing: 'Analyzing',
  generating_report: 'Generating report',
  completed: 'Completed',
  failed: 'Failed',
  verifying: 'Verifying',
  verified: 'Verified',
};

export const RUNNING_STATUSES: AuditStatus[] = ['queued', 'initializing', 'crawling', 'testing', 'analyzing', 'generating_report', 'verifying'];

export function isRunning(status: AuditStatus) {
  return RUNNING_STATUSES.includes(status);
}

export function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function shortUrl(url: string) {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/sandbox\/sbx_[a-z0-9]+/, '').replace(/\/index\.html$/, '/') || '/';
    return path;
  } catch {
    return url;
  }
}

export function hostOf(url: string) {
  try {
    const u = new URL(url);
    return /\/sandbox\//.test(u.pathname) ? 'Brewly demo site' : u.host;
  } catch {
    return url;
  }
}

export function scoreColor(score: number | null | undefined) {
  if (score === null || score === undefined) return 'text-fg-subtle';
  if (score >= 90) return 'text-ok';
  if (score >= 50) return 'text-sev-medium';
  return 'text-sev-critical';
}

export function timeAgo(iso: string) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
}
