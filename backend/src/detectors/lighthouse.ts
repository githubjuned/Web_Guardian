/**
 * Lighthouse (slow-device persona): simulated mobile + slow 4G run against the
 * agent's own Chromium via the remote debugging port. Optional — if it fails the
 * audit continues and the dashboard shows Performance (Lighthouse) as unavailable.
 */
import type { LighthouseSummary } from '@webguardian/shared';
import type { DetectorContext, RawFinding } from './types';

export async function runLighthouse(
  url: string,
  port: number,
  ctx: DetectorContext,
  timeoutMs = 90_000,
): Promise<{ summary: LighthouseSummary; findings: RawFinding[] }> {
  ctx.log('Running Lighthouse (simulated mid-range phone on slow 4G)…', 'step');
  const { default: lighthouse } = await import('lighthouse');
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Lighthouse timed out after ${timeoutMs / 1000}s`)), timeoutMs);
  });
  try {
    const result = await Promise.race([
      lighthouse(url, {
        port,
        output: 'json',
        logLevel: 'error',
        onlyCategories: ['performance', 'accessibility', 'seo', 'best-practices'],
      }),
      timeout,
    ]);
    const lhr = result?.lhr;
    if (!lhr) throw new Error('Lighthouse returned no result');
    if (lhr.runtimeError) throw new Error(lhr.runtimeError.message);
    const score = (id: string) => {
      const s = lhr.categories[id]?.score;
      return typeof s === 'number' ? Math.round(s * 100) : null;
    };
    const num = (id: string) => {
      const v = lhr.audits[id]?.numericValue;
      return typeof v === 'number' ? v : null;
    };
    const summary: LighthouseSummary = {
      url,
      performance: score('performance'),
      accessibility: score('accessibility'),
      seo: score('seo'),
      bestPractices: score('best-practices'),
      lcpMs: num('largest-contentful-paint'),
      cls: num('cumulative-layout-shift'),
      tbtMs: num('total-blocking-time'),
      totalBytes: num('total-byte-weight'),
    };

    const findings: RawFinding[] = [];
    if (summary.lcpMs !== null && summary.lcpMs > 4000) {
      findings.push({
        pageUrl: url,
        category: 'performance',
        persona: 'slow-device',
        baseSeverity: summary.lcpMs > 8000 ? 'high' : 'medium',
        confidence: 'high',
        title: 'Main content appears slowly on mobile',
        description: `Largest Contentful Paint is ${(summary.lcpMs / 1000).toFixed(1)} s on a simulated mid-range phone with slow 4G (good is under 2.5 s).`,
        selector: null,
        htmlSnippet: null,
        steps: [`Run Lighthouse (mobile, simulated throttling) on ${url}`, `Largest Contentful Paint: ${(summary.lcpMs / 1000).toFixed(1)} s`],
        rule: 'perf-slow-lcp',
        detectedBy: 'Lighthouse',
        helpUrl: 'https://web.dev/articles/lcp',
        metrics: { lcpMs: Math.round(summary.lcpMs), performanceScore: summary.performance },
      });
    }
    if (summary.cls !== null && summary.cls > 0.25) {
      findings.push({
        pageUrl: url,
        category: 'performance',
        persona: 'slow-device',
        baseSeverity: 'medium',
        confidence: 'high',
        title: 'Page layout jumps while loading',
        description: `Cumulative Layout Shift is ${summary.cls.toFixed(2)} (good is under 0.1).`,
        selector: null,
        htmlSnippet: null,
        steps: [`Run Lighthouse on ${url}`, `Cumulative Layout Shift: ${summary.cls.toFixed(2)}`],
        rule: 'perf-layout-shift',
        detectedBy: 'Lighthouse',
        helpUrl: 'https://web.dev/articles/cls',
        metrics: { cls: summary.cls },
      });
    }
    ctx.log(
      `Lighthouse finished: performance ${summary.performance ?? 'n/a'}, LCP ${summary.lcpMs ? (summary.lcpMs / 1000).toFixed(1) + ' s' : 'n/a'}`,
      'step',
    );
    return { summary, findings };
  } finally {
    clearTimeout(timer);
  }
}
