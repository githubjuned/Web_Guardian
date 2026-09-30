/**
 * Mobile viewport check (slow-device persona): horizontal overflow on a phone-sized screen.
 */
import type { Browser, BrowserContext } from 'playwright';
import type { DetectorContext, RawFinding } from './types';
import { settlePage } from '../agents/pageHelpers';

export async function runMobileChecks(
  browser: Browser,
  ctx: DetectorContext,
  timeoutMs: number,
  /** Applies the agent's standard context setup (helpers + network guard). */
  prepare: (context: BrowserContext) => Promise<void>,
): Promise<RawFinding[]> {
  ctx.log('Slow-device persona: loading the page on a 390px mobile viewport', 'step');
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36 WebGuardianAI',
  });
  try {
    await prepare(context);
    const page = await context.newPage();
    await page.goto(ctx.pageUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await settlePage(page);
    const overflow = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const scrollWidth = document.documentElement.scrollWidth;
      if (scrollWidth <= vw + 2) return null;
      let culprit: Element | null = null;
      for (const el of Array.from(document.querySelectorAll('body *'))) {
        const r = el.getBoundingClientRect();
        if (r.right > vw + 2 && r.width > 0 && getComputedStyle(el).position !== 'fixed') {
          culprit = el;
          break;
        }
      }
      const cls = culprit && typeof culprit.className === 'string' && culprit.className.trim() ? `.${culprit.className.trim().split(/\s+/).join('.')}` : '';
      return {
        viewportWidth: vw,
        scrollWidth,
        selector: culprit ? (culprit.id ? `#${culprit.id}` : `${culprit.tagName.toLowerCase()}${cls}`) : null,
        html: culprit ? culprit.outerHTML.slice(0, 300) : null,
      };
    });
    if (!overflow) return [];
    return [
      {
        pageUrl: ctx.pageUrl,
        category: 'ux',
        persona: 'slow-device',
        baseSeverity: 'medium',
        confidence: 'high',
        title: 'Page scrolls sideways on mobile',
        description: `On a ${overflow.viewportWidth}px wide phone screen the page is ${overflow.scrollWidth}px wide, forcing horizontal scrolling.`,
        selector: overflow.selector,
        htmlSnippet: overflow.html,
        steps: [`Open ${ctx.pageUrl} on a 390px wide phone`, 'Swipe horizontally: the page scrolls sideways'],
        rule: 'ux-horizontal-overflow',
        detectedBy: 'Playwright (mobile viewport emulation)',
        helpUrl: 'https://web.dev/articles/responsive-web-design-basics',
        metrics: overflow,
      },
    ];
  } finally {
    await context.close();
  }
}
