/**
 * Slow device / network persona: analyses what the page actually downloaded
 * (Resource Timing API) and how images are sized on screen.
 */
import type { Page } from 'playwright';
import type { DetectorContext, RawFinding } from './types';

/** Slow 4G as used by Lighthouse: ~1.6 Mbps down. */
const SLOW_4G_BYTES_PER_SEC = (1.6 * 1024 * 1024) / 8;
const LARGE_IMAGE_BYTES = 400 * 1024;
const HEAVY_PAGE_BYTES = 3 * 1024 * 1024;

export interface PerfSnapshot {
  totalBytes: number;
  resourceCount: number;
  loadTimeMs: number | null;
  images: {
    src: string;
    bytes: number;
    naturalWidth: number;
    naturalHeight: number;
    displayWidth: number;
    displayHeight: number;
    selector: string;
    html: string;
  }[];
}

export async function collectPerfSnapshot(page: Page): Promise<PerfSnapshot> {
  return page.evaluate(() => {
    const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    const sizeOf = (e: PerformanceResourceTiming) => e.transferSize || e.encodedBodySize || e.decodedBodySize || 0;
    const byUrl = new Map(entries.map((e) => [e.name, sizeOf(e)]));
    const totalBytes = entries.reduce((sum, e) => sum + sizeOf(e), 0) + (nav ? nav.transferSize || nav.encodedBodySize || 0 : 0);
    const images = Array.from(document.images).map((img) => {
      const rect = img.getBoundingClientRect();
      const cls = typeof img.className === 'string' && img.className.trim() ? `.${img.className.trim().split(/\s+/).join('.')}` : '';
      return {
        src: img.currentSrc || img.src,
        bytes: byUrl.get(img.currentSrc || img.src) ?? 0,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        displayWidth: Math.round(rect.width),
        displayHeight: Math.round(rect.height),
        selector: img.id ? `#${img.id}` : `img${cls}[src="${img.getAttribute('src')}"]`,
        html: img.outerHTML.slice(0, 300),
      };
    });
    return {
      totalBytes,
      resourceCount: entries.length,
      loadTimeMs: nav ? Math.round(nav.loadEventEnd - nav.startTime) : null,
      images,
    };
  });
}

const kb = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);
const slow4g = (b: number) => Math.max(0.1, b / SLOW_4G_BYTES_PER_SEC);

export function analyzePerformance(s: PerfSnapshot, ctx: Pick<DetectorContext, 'pageUrl'>): RawFinding[] {
  const findings: RawFinding[] = [];
  for (const img of s.images) {
    if (img.bytes < LARGE_IMAGE_BYTES) continue;
    const oversize = img.displayWidth > 0 ? img.naturalWidth / img.displayWidth : null;
    findings.push({
      pageUrl: ctx.pageUrl,
      category: 'performance',
      persona: 'slow-device',
      baseSeverity: img.bytes > 1.5 * 1024 * 1024 ? 'high' : 'medium',
      confidence: 'high',
      title: 'Large, unoptimized image slows down the page',
      description:
        `This image downloads ${kb(img.bytes)} (${img.naturalWidth}×${img.naturalHeight}px) but is displayed at ` +
        `${img.displayWidth}×${img.displayHeight}px` +
        (oversize && oversize > 1.5 ? ` — ${oversize.toFixed(1)}× larger than needed` : '') +
        `. On a slow 4G connection this one file takes about ${slow4g(img.bytes).toFixed(1)} s to download.`,
      selector: img.selector,
      htmlSnippet: img.html,
      steps: [
        `Open ${ctx.pageUrl}`,
        `Measure the downloaded size of ${img.src.split('/').pop()}: ${kb(img.bytes)}`,
        `Compare its intrinsic size (${img.naturalWidth}px wide) with its on-screen size (${img.displayWidth}px wide)`,
      ],
      rule: 'perf-large-image',
      detectedBy: 'WebGuardian performance detector (Resource Timing API)',
      helpUrl: 'https://web.dev/articles/serve-responsive-images',
      metrics: {
        bytes: img.bytes,
        naturalWidth: img.naturalWidth,
        displayWidth: img.displayWidth,
        slow4gSeconds: Number(slow4g(img.bytes).toFixed(1)),
      },
      fingerprintKey: img.src.split('/').pop(),
    });
  }
  if (s.totalBytes > HEAVY_PAGE_BYTES) {
    findings.push({
      pageUrl: ctx.pageUrl,
      category: 'performance',
      persona: 'slow-device',
      baseSeverity: 'medium',
      confidence: 'high',
      title: 'Page is very heavy to download',
      description: `The page downloads ${kb(s.totalBytes)} across ${s.resourceCount} requests — an estimated ${slow4g(s.totalBytes).toFixed(1)} s on a slow 4G connection.`,
      selector: null,
      htmlSnippet: null,
      steps: [`Open ${ctx.pageUrl}`, `Sum the transfer size of all resources: ${kb(s.totalBytes)}`],
      rule: 'perf-page-weight',
      detectedBy: 'WebGuardian performance detector (Resource Timing API)',
      helpUrl: 'https://web.dev/articles/total-byte-weight',
      metrics: { totalBytes: s.totalBytes, requests: s.resourceCount },
    });
  }
  return findings;
}

export async function runPerformance(page: Page, ctx: DetectorContext): Promise<{ findings: RawFinding[]; snapshot: PerfSnapshot }> {
  ctx.log('Slow-device persona: measuring page weight and image sizes', 'step');
  const snapshot = await collectPerfSnapshot(page);
  const findings = analyzePerformance(snapshot, ctx);
  ctx.log(`Page weight ${kb(snapshot.totalBytes)} in ${snapshot.resourceCount} requests`, 'action');
  return { findings, snapshot };
}
