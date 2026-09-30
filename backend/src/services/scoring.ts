/**
 * Category health scores (0–100) computed from evidence-backed findings.
 * Each distinct rule multiplies the score down by a severity-based factor, with a
 * small extra penalty for repeated instances — so fixing any issue visibly helps.
 */
import { CATEGORIES, type CategoryScores, type Category, type Severity, type SeverityCounts } from '@webguardian/shared';

const RULE_PENALTY: Record<Severity, number> = { critical: 0.22, high: 0.13, medium: 0.07, low: 0.025 };

interface Scorable {
  category: Category;
  severity: Severity;
  rule: string;
  pageUrl: string;
}

export function computeScores(issues: Scorable[], unavailable: Partial<Record<Category, boolean>> = {}): CategoryScores {
  const scores = {} as CategoryScores;
  for (const category of CATEGORIES) {
    if (unavailable[category]) {
      scores[category] = null;
      continue;
    }
    const byRule = new Map<string, { worst: Severity; count: number }>();
    for (const i of issues.filter((x) => x.category === category)) {
      const cur = byRule.get(i.rule);
      const order = ['low', 'medium', 'high', 'critical'];
      if (!cur) byRule.set(i.rule, { worst: i.severity, count: 1 });
      else {
        cur.count++;
        if (order.indexOf(i.severity) > order.indexOf(cur.worst)) cur.worst = i.severity;
      }
    }
    let score = 1;
    for (const { worst, count } of byRule.values()) {
      const penalty = RULE_PENALTY[worst] + Math.min(0.06, (count - 1) * 0.01);
      score *= 1 - penalty;
    }
    scores[category] = Math.round(score * 100);
  }
  const available = CATEGORIES.map((c) => scores[c]).filter((s): s is number => s !== null);
  scores.overall = available.length ? Math.round(available.reduce((a, b) => a + b, 0) / available.length) : null;
  return scores;
}

export function countSeverities(issues: { severity: Severity }[]): SeverityCounts {
  const counts: SeverityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const i of issues) counts[i.severity]++;
  return counts;
}
