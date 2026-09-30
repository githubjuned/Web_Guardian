/**
 * First-time visitor / SEO detector: inspects the rendered DOM for basic metadata.
 */
import type { Page } from 'playwright';
import type { DetectorContext, RawFinding } from './types';

export interface SeoSnapshot {
  title: string | null;
  metaDescription: string | null;
  h1s: { text: string; html: string }[];
  viewport: string | null;
  ogTitle: string | null;
  headlineCandidate: { selector: string; html: string; text: string } | null;
  lang: string | null;
}

export async function collectSeoSnapshot(page: Page): Promise<SeoSnapshot> {
  return page.evaluate(() => {
    const meta = (name: string, attr = 'name') =>
      document.querySelector(`meta[${attr}="${name}"]`)?.getAttribute('content')?.trim() ?? null;
    const h1s = Array.from(document.querySelectorAll('h1')).map((h) => ({
      text: (h.textContent ?? '').trim().slice(0, 140),
      html: h.outerHTML.slice(0, 300),
    }));
    // Find the visually largest text block as a likely "fake heading".
    let headlineCandidate: SeoSnapshot['headlineCandidate'] = null;
    if (h1s.length === 0) {
      let best = 0;
      for (const el of Array.from(document.querySelectorAll('body *'))) {
        if (el.children.length > 0 || !(el.textContent ?? '').trim()) continue;
        const size = parseFloat(getComputedStyle(el).fontSize);
        const rect = el.getBoundingClientRect();
        if (size > best && rect.width > 0 && rect.height > 0) {
          best = size;
          const cls = typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/).join('.')}` : '';
          headlineCandidate = {
            selector: el.id ? `#${el.id}` : `${el.tagName.toLowerCase()}${cls}`,
            html: el.outerHTML.slice(0, 300),
            text: (el.textContent ?? '').trim().slice(0, 140),
          };
        }
      }
    }
    return {
      title: document.title?.trim() || null,
      metaDescription: meta('description'),
      h1s,
      viewport: meta('viewport'),
      ogTitle: meta('og:title', 'property'),
      headlineCandidate,
      lang: document.documentElement.getAttribute('lang'),
    };
  });
}

export function analyzeSeo(s: SeoSnapshot, ctx: Pick<DetectorContext, 'pageUrl' | 'pageIndex'>): RawFinding[] {
  const findings: RawFinding[] = [];
  const base = {
    pageUrl: ctx.pageUrl,
    category: 'seo' as const,
    persona: 'first-time-visitor' as const,
    confidence: 'high' as const,
    detectedBy: 'WebGuardian SEO detector (DOM inspection)',
    helpUrl: null,
  };

  if (!s.title) {
    findings.push({
      ...base,
      baseSeverity: 'high',
      title: 'Page has no title',
      description: 'The <title> element is missing or empty.',
      selector: 'head',
      htmlSnippet: '<title></title>',
      steps: [`Open ${ctx.pageUrl}`, 'Look at the browser tab: no page title is shown', 'Inspect <head>: no non-empty <title> element'],
      rule: 'seo-title-missing',
      helpUrl: 'https://developer.mozilla.org/en-US/docs/Web/HTML/Element/title',
    });
  } else if (s.title.length < 10 || s.title.length > 65) {
    findings.push({
      ...base,
      baseSeverity: 'low',
      title: s.title.length < 10 ? 'Page title is too short' : 'Page title is too long',
      description: `The title "${s.title}" is ${s.title.length} characters long; 10–65 characters is recommended.`,
      selector: 'head > title',
      htmlSnippet: `<title>${s.title}</title>`,
      steps: [`Open ${ctx.pageUrl}`, `Read the <title>: "${s.title}" (${s.title.length} characters)`],
      rule: 'seo-title-length',
      metrics: { length: s.title.length },
    });
  }

  if (!s.metaDescription) {
    findings.push({
      ...base,
      baseSeverity: 'medium',
      title: 'Meta description is missing',
      description: 'The page has no <meta name="description">, so search engines will generate their own snippet.',
      selector: 'head',
      htmlSnippet: s.title ? `<title>${s.title}</title>` : null,
      steps: [`Open ${ctx.pageUrl}`, 'Inspect <head>', 'No <meta name="description"> element was found'],
      rule: 'seo-meta-description-missing',
      helpUrl: 'https://developers.google.com/search/docs/appearance/snippet',
    });
  } else if (s.metaDescription.length < 50 || s.metaDescription.length > 170) {
    findings.push({
      ...base,
      baseSeverity: 'low',
      title: s.metaDescription.length < 50 ? 'Meta description is too short' : 'Meta description is too long',
      description: `The meta description is ${s.metaDescription.length} characters; 50–160 is recommended.`,
      selector: 'meta[name="description"]',
      htmlSnippet: `<meta name="description" content="${s.metaDescription.slice(0, 200)}">`,
      steps: [`Open ${ctx.pageUrl}`, `Read the meta description (${s.metaDescription.length} characters)`],
      rule: 'seo-meta-description-length',
      metrics: { length: s.metaDescription.length },
    });
  }

  if (s.h1s.length === 0) {
    const c = s.headlineCandidate;
    findings.push({
      ...base,
      baseSeverity: 'medium',
      title: 'Page has no H1 heading',
      description: c
        ? `No <h1> element was found. The visually largest text ("${c.text}") is a <${c.selector.split(/[.#]/)[0]}> that only looks like a heading.`
        : 'No <h1> element was found on the page.',
      selector: c?.selector ?? 'body',
      htmlSnippet: c?.html ?? null,
      steps: [`Open ${ctx.pageUrl}`, 'List all heading elements', 'No <h1> exists' + (c ? `; the main headline is a styled ${c.selector}` : '')],
      rule: 'seo-h1-missing',
    });
  } else if (s.h1s.length > 1) {
    findings.push({
      ...base,
      baseSeverity: 'low',
      title: 'Page has multiple H1 headings',
      description: `Found ${s.h1s.length} <h1> elements: ${s.h1s.map((h) => `"${h.text}"`).join(', ')}.`,
      selector: 'h1',
      htmlSnippet: s.h1s[1].html,
      steps: [`Open ${ctx.pageUrl}`, `Count the <h1> elements: ${s.h1s.length}`],
      rule: 'seo-multiple-h1',
      metrics: { count: s.h1s.length },
    });
  }

  if (!s.viewport) {
    findings.push({
      ...base,
      category: 'ux',
      persona: 'slow-device',
      baseSeverity: 'medium',
      title: 'Mobile viewport is not configured',
      description: 'The page has no <meta name="viewport">, so phones render it as a zoomed-out desktop page.',
      selector: 'head',
      htmlSnippet: null,
      steps: [`Open ${ctx.pageUrl} on a phone`, 'Text renders tiny because no viewport meta tag exists'],
      rule: 'ux-viewport-missing',
    });
  }

  if (ctx.pageIndex === 0 && !s.ogTitle) {
    findings.push({
      ...base,
      baseSeverity: 'low',
      title: 'Social sharing preview tags are missing',
      description: 'The homepage has no Open Graph tags (og:title), so shared links show a generic preview.',
      selector: 'head',
      htmlSnippet: null,
      steps: [`Open ${ctx.pageUrl}`, 'Inspect <head>: no <meta property="og:title"> element'],
      rule: 'seo-open-graph-missing',
      helpUrl: 'https://ogp.me/',
    });
  }
  return findings;
}

export async function runSeo(page: Page, ctx: DetectorContext): Promise<RawFinding[]> {
  ctx.log('First-time visitor persona: checking title, description, headings and metadata', 'step');
  const snapshot = await collectSeoSnapshot(page);
  const findings = analyzeSeo(snapshot, ctx);
  ctx.log(`SEO checks finished: ${findings.length} finding(s)`, 'step');
  return findings;
}
