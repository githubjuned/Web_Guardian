/**
 * Basic functionality detector: JavaScript errors, failed resources, broken links
 * and in-page anchors that point nowhere.
 */
import type { APIRequestContext, Page } from 'playwright';
import type { DetectorContext, RawFinding } from './types';

export interface RuntimeProblems {
  pageErrors: string[];
  failedResources: { url: string; status: number | null; resourceType: string; failure?: string }[];
}

export interface PageLink {
  href: string;
  selector: string;
  text: string;
  html: string;
}

export interface LinkSnapshot {
  links: PageLink[];
  missingAnchors: PageLink[];
}

export async function collectLinks(page: Page): Promise<LinkSnapshot> {
  return page.evaluate(() => {
    const describe = (a: HTMLAnchorElement, index: number) => {
      const parent = a.closest('nav, header, footer, main, [id]');
      const scope = parent ? (parent.id ? `#${parent.id}` : parent.tagName.toLowerCase()) : '';
      const hrefAttr = a.getAttribute('href') ?? '';
      return {
        href: a.href,
        selector: `${scope ? `${scope} ` : ''}a[href="${hrefAttr.replace(/"/g, '\\"')}"]`,
        text: (a.textContent ?? '').trim().slice(0, 80) || `(link ${index + 1})`,
        html: a.outerHTML.slice(0, 300),
      };
    };
    const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'));
    const links = anchors
      .map(describe)
      .filter((l) => /^https?:/i.test(l.href));
    const missingAnchors = anchors
      .filter((a) => {
        const raw = a.getAttribute('href') ?? '';
        if (!raw.startsWith('#') || raw.length < 2) return false;
        const id = decodeURIComponent(raw.slice(1));
        return !document.getElementById(id) && document.getElementsByName(id).length === 0;
      })
      .map(describe);
    return { links, missingAnchors };
  });
}

export function analyzeRuntime(p: RuntimeProblems, ctx: Pick<DetectorContext, 'pageUrl'>): RawFinding[] {
  const findings: RawFinding[] = [];
  for (const message of [...new Set(p.pageErrors)].slice(0, 5)) {
    findings.push({
      pageUrl: ctx.pageUrl,
      category: 'functionality',
      persona: 'first-time-visitor',
      baseSeverity: 'medium',
      confidence: 'high',
      title: 'JavaScript error on page load',
      description: `The page threw an uncaught error: ${message.split('\n')[0].slice(0, 300)}`,
      selector: null,
      htmlSnippet: null,
      steps: [`Open ${ctx.pageUrl}`, 'Open the browser developer console', `Observe the uncaught error: ${message.split('\n')[0].slice(0, 160)}`],
      rule: 'js-runtime-error',
      detectedBy: 'Playwright (pageerror event)',
      helpUrl: null,
      metrics: { message: message.slice(0, 1000) },
      fingerprintKey: message.split('\n')[0].slice(0, 120),
    });
  }
  for (const r of p.failedResources.slice(0, 8)) {
    findings.push({
      pageUrl: ctx.pageUrl,
      category: 'functionality',
      persona: 'first-time-visitor',
      baseSeverity: r.resourceType === 'script' || r.resourceType === 'stylesheet' ? 'high' : 'medium',
      confidence: 'high',
      title: `A ${r.resourceType} failed to load`,
      description: `${r.url} ${r.status ? `returned HTTP ${r.status}` : `failed (${r.failure ?? 'network error'})`}.`,
      selector: null,
      htmlSnippet: null,
      steps: [`Open ${ctx.pageUrl}`, `Watch network requests: ${r.url} → ${r.status ?? r.failure}`],
      rule: 'broken-resource',
      detectedBy: 'Playwright (network monitoring)',
      helpUrl: null,
      metrics: { url: r.url, status: r.status },
      fingerprintKey: r.url,
    });
  }
  return findings;
}

export function analyzeMissingAnchors(links: PageLink[], ctx: Pick<DetectorContext, 'pageUrl'>): RawFinding[] {
  return links.slice(0, 5).map((l) => ({
    pageUrl: ctx.pageUrl,
    category: 'functionality' as const,
    persona: 'first-time-visitor' as const,
    baseSeverity: 'low' as const,
    confidence: 'high' as const,
    title: 'In-page link points to a section that does not exist',
    description: `The link "${l.text}" points to ${new URL(l.href).hash}, but no element with that id exists.`,
    selector: l.selector,
    htmlSnippet: l.html,
    steps: [`Open ${ctx.pageUrl}`, `Click "${l.text}"`, `Nothing happens: there is no element with id "${new URL(l.href).hash.slice(1)}"`],
    rule: 'broken-anchor',
    detectedBy: 'WebGuardian link checker (DOM inspection)',
    helpUrl: null,
    fingerprintKey: new URL(l.href).hash,
  }));
}

export type LinkStatusCache = Map<string, Promise<{ status: number | null; error?: string }>>;

/** Checks internal links (same origin) with real HTTP requests. Results are cached per audit. */
export async function checkLinks(
  request: APIRequestContext,
  links: PageLink[],
  origin: string,
  cache: LinkStatusCache,
  ctx: DetectorContext,
  maxChecks = 25,
): Promise<RawFinding[]> {
  const internal = new Map<string, PageLink>();
  for (const l of links) {
    const u = new URL(l.href);
    u.hash = '';
    if (u.origin === origin && !internal.has(u.href)) internal.set(u.href, l);
  }
  const targets = [...internal.entries()].slice(0, maxChecks);
  ctx.log(`Checking ${targets.length} internal link(s) for broken destinations`, 'step');
  const findings: RawFinding[] = [];
  await Promise.all(
    targets.map(async ([href, link]) => {
      if (!cache.has(href)) {
        cache.set(
          href,
          request
            .get(href, { timeout: 10_000, maxRedirects: 5, failOnStatusCode: false })
            .then((res) => ({ status: res.status() }))
            .catch((err: Error) => ({ status: null, error: err.message.split('\n')[0] })),
        );
      }
      const result = await cache.get(href)!;
      if (result.status !== null && result.status < 400) return;
      findings.push({
        pageUrl: ctx.pageUrl,
        category: 'functionality',
        persona: 'first-time-visitor',
        baseSeverity: 'high',
        confidence: 'high',
        title: `Broken link: "${link.text}"`,
        description: `The link "${link.text}" goes to ${href}, which ${result.status ? `returns HTTP ${result.status}` : `could not be loaded (${result.error})`}.`,
        selector: link.selector,
        htmlSnippet: link.html,
        steps: [`Open ${ctx.pageUrl}`, `Click the "${link.text}" link`, `The destination ${href} responds with ${result.status ?? result.error}`],
        rule: 'broken-link',
        detectedBy: 'WebGuardian link checker (HTTP request)',
        helpUrl: null,
        metrics: { href, status: result.status },
        fingerprintKey: new URL(href).pathname,
      });
    }),
  );
  return findings;
}
