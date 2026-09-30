/**
 * Deterministic prioritisation: Severity × Users affected × Page visibility.
 * Users see a label (critical/high/medium/low) and a one-sentence reason.
 */
import type { Persona, Severity } from '@webguardian/shared';
import type { RawFinding } from '../detectors/types';
import { PERSONA_LABELS } from '../detectors/knowledge';

const SEVERITY_WEIGHT: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1 };

/** How strongly the issue blocks the affected group (1 = completely blocks them). */
const USER_IMPACT: Record<Persona, number> = {
  keyboard: 1,
  'screen-reader': 1,
  'low-vision': 0.9,
  'slow-device': 0.9,
  'first-time-visitor': 0.85,
};

/** Rules that stop a person from completing a task (not just make it harder). */
const BLOCKING_RULES = new Set(['keyboard-focus-trap', 'button-name', 'keyboard-nav-unreachable']);
/** A trap makes the entire page unusable, so it outranks everything else. */
const RULE_BOOST: Record<string, number> = { 'keyboard-focus-trap': 1.3 };

export interface Priority {
  severity: Severity;
  score: number;
  reason: string;
}

export function prioritize(f: RawFinding, isHomepage: boolean): Priority {
  const base = SEVERITY_WEIGHT[f.baseSeverity];
  // Problems that completely stop a task weigh more than ones that make it harder.
  const users = (f.category === 'functionality' ? 1 : USER_IMPACT[f.persona]) * (RULE_BOOST[f.rule] ?? (BLOCKING_RULES.has(f.rule) ? 1.15 : 1));
  const inNavigation = !!f.selector && /(^|\s|>)(nav|header)\b|main-nav|navbar|menu/i.test(f.selector);
  const pageWide = f.selector === null || f.selector === 'head' || f.selector === 'body';
  let visibility = isHomepage ? 1 : 0.85;
  if (inNavigation) visibility += 0.1;
  const score = Math.round(base * users * visibility * 100) / 100;

  let severity: Severity;
  if (score >= 3.4) severity = 'critical';
  else if (score >= 2.4) severity = 'high';
  else if (score >= 1.4) severity = 'medium';
  else severity = 'low';

  const severityPhrase = {
    critical: 'a blocking problem',
    high: 'a serious problem',
    medium: 'a noticeable problem',
    low: 'a minor problem',
  }[f.baseSeverity];
  const who = f.category === 'functionality' ? 'every visitor' : PERSONA_LABELS[f.persona];
  const where = isHomepage ? 'the homepage (usually the most visited page)' : 'an inner page';
  const location = inNavigation ? ', in the site navigation that appears on every page' : pageWide ? ', affecting the whole page' : '';
  const blocking = BLOCKING_RULES.has(f.rule) ? ' It stops people from completing basic tasks.' : '';
  const label = severity.charAt(0).toUpperCase() + severity.slice(1);
  return {
    severity,
    score,
    reason: `${label} priority: ${severityPhrase} for ${who} on ${where}${location}.${blocking}`,
  };
}
