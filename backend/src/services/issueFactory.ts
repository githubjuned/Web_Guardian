import type { Issue } from '@webguardian/shared';
import type { RawFinding } from '../detectors/types';
import { knowledgeFor } from '../detectors/knowledge';
import { prioritize } from './prioritization';
import { newId, nowIso } from '../utils/ids';
import { pageKey } from '../utils/url';

export function fingerprintOf(f: Pick<RawFinding, 'rule' | 'pageUrl' | 'selector' | 'fingerprintKey'>): string {
  // Some findings are page-level (one per page); others are anchored to an element or a key.
  const pageLevel = ['keyboard-focus-trap', 'focus-not-visible', 'perf-page-weight', 'perf-slow-lcp', 'perf-layout-shift'];
  const anchor = pageLevel.includes(f.rule) ? '' : (f.fingerprintKey ?? f.selector ?? '');
  // Site-wide problems (same broken link / script error on every page) are reported once.
  const siteWide = ['broken-link', 'js-runtime-error', 'broken-resource'];
  const scope = siteWide.includes(f.rule) ? '*' : pageKey(f.pageUrl);
  return `${f.rule}|${scope}|${anchor}`;
}

export function screenshotUrl(relative: string | null | undefined): string | null {
  return relative ? `/api/screenshots/${relative}` : null;
}

/** Converts raw detector findings into prioritised, numbered issues. */
export function buildIssues(auditId: string, findings: RawFinding[], homepageUrl: string): Issue[] {
  const seen = new Set<string>();
  const issues: Issue[] = [];
  for (const f of findings) {
    const fingerprint = fingerprintOf(f);
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    const k = knowledgeFor(f.rule, f.persona);
    const p = prioritize(f, pageKey(f.pageUrl) === pageKey(homepageUrl));
    issues.push({
      id: newId('issue'),
      number: 0,
      auditId,
      pageUrl: f.pageUrl,
      category: f.category,
      persona: f.persona,
      severity: p.severity,
      priorityScore: p.score,
      priorityReason: p.reason,
      confidence: f.confidence,
      title: f.title,
      description: f.description,
      affectedUsers: k.affectedUsers,
      whyItMatters: k.whyItMatters,
      howToFix: k.howToFix,
      selector: f.selector,
      htmlSnippet: f.htmlSnippet,
      screenshotPath: screenshotUrl(f.screenshotPath),
      steps: f.steps,
      rule: f.rule,
      detectedBy: f.detectedBy,
      helpUrl: f.helpUrl,
      fingerprint,
      metrics: f.metrics ?? null,
      ai: null,
      fix: null,
      status: 'open',
      createdAt: nowIso(),
    });
  }
  issues.sort((a, b) => b.priorityScore - a.priorityScore || a.pageUrl.localeCompare(b.pageUrl));
  issues.forEach((issue, index) => (issue.number = index + 1));
  return issues;
}
