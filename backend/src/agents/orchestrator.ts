/**
 * Agent orchestrator: plans and executes a browser-based QA session.
 *
 *   launch browser → crawl (≤ maxPages) → for each page:
 *     load → watch errors → axe-core → SEO → performance → links → evidence →
 *     keyboard persona → mobile persona
 *   → Lighthouse on the first page
 *
 * Each detector is isolated: a failure is reported and the audit continues.
 */
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import type { AuditStatus, DetectorName, DetectorState, LighthouseSummary, PageResult } from '@webguardian/shared';
import { config } from '../config';
import { publishFrame } from '../events/bus';
import { runAxe, runFormLabelCheck } from '../detectors/axe';
import { runSeo } from '../detectors/seo';
import { runPerformance } from '../detectors/performance';
import { analyzeMissingAnchors, analyzeRuntime, checkLinks, collectLinks, type LinkStatusCache, type RuntimeProblems } from '../detectors/functionality';
import { runMobileChecks } from '../detectors/mobile';
import { runLighthouse } from '../detectors/lighthouse';
import type { DetectorContext, RawFinding } from '../detectors/types';
import { runKeyboardPersona } from '../personas/keyboard';
import { discoverLinks, samePage } from './crawler';
import { HELPER_SCRIPT } from './pageHelpers';
import { errorMessage, logger } from '../utils/logger';
import { isLocalHostname } from '../utils/url';

export type LogFn = (type: 'step' | 'action' | 'warning' | 'issue' | 'error', message: string, metadata?: Record<string, unknown>) => void;

export interface ScanOptions {
  auditId: string;
  startUrl: string;
  maxPages: number;
  /** Verification mode: scan exactly these pages instead of crawling. */
  fixedPages?: string[];
  shotPrefix: string;
  lighthouse: boolean;
  trustedOrigins: string[];
  log: LogFn;
  onProgress: (progress: number, stage: string, status?: AuditStatus) => void;
  onDetector: (name: DetectorName, state: DetectorState) => void;
  deadline: number;
  /** Only run these detectors (verification of a single issue can use all; kept for tests). */
  skipKeyboard?: boolean;
  skipMobile?: boolean;
}

export interface ScanResult {
  pages: PageResult[];
  findings: RawFinding[];
  lighthouse: LighthouseSummary | null;
  detectorErrors: Partial<Record<DetectorName, string>>;
}

const USER_AGENT_SUFFIX = ' WebGuardianAI/1.0 (+https://github.com/githubjuned/web_guardian)';

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

export async function launchBrowser(withDebugPort: boolean): Promise<{ browser: Browser; debugPort: number | null }> {
  const debugPort = withDebugPort ? await freePort() : null;
  const args = ['--disable-dev-shm-usage', '--no-sandbox'];
  if (debugPort) args.push(`--remote-debugging-port=${debugPort}`);
  const launch = (executablePath?: string) => chromium.launch({ headless: true, args, executablePath });
  try {
    return { browser: await launch(), debugPort };
  } catch (err) {
    // Fall back to a system Chromium if Playwright's bundled build is unavailable.
    const fallback = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';
    logger.warn('Bundled Chromium failed to launch, trying fallback', { error: errorMessage(err), fallback });
    return { browser: await launch(fallback), debugPort };
  }
}

function shouldBlock(requestUrl: string, trustedOrigins: string[]): boolean {
  try {
    const u = new URL(requestUrl);
    if (u.protocol === 'data:' || u.protocol === 'blob:') return false;
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return true;
    if (trustedOrigins.includes(u.origin)) return false;
    return isLocalHostname(u.hostname);
  } catch {
    return true;
  }
}

async function newAgentContext(browser: Browser, opts: ScanOptions): Promise<BrowserContext> {
  const userAgent = `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${browser.version()} Safari/537.36${USER_AGENT_SUFFIX}`;
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent,
    ignoreHTTPSErrors: false,
  });
  await prepareContext(context, opts);
  return context;
}

async function prepareContext(context: BrowserContext, opts: Pick<ScanOptions, 'trustedOrigins'>) {
  context.setDefaultNavigationTimeout(config.navigationTimeoutMs);
  context.setDefaultTimeout(15_000);
  await context.addInitScript(HELPER_SCRIPT);
  if (!config.allowPrivateUrls) {
    // Block page sub-requests to private/local addresses (SSRF protection).
    await context.route('**/*', (route) =>
      shouldBlock(route.request().url(), opts.trustedOrigins) ? route.abort('blockedbyclient') : route.continue(),
    );
  }
}

export async function runScan(opts: ScanOptions): Promise<ScanResult> {
  const detectorErrors: Partial<Record<DetectorName, string>> = {};
  const findings: RawFinding[] = [];
  const pages: PageResult[] = [];
  let lighthouse: LighthouseSummary | null = null;
  const shotDir = path.join(config.screenshotDir, opts.auditId);
  await fs.mkdir(shotDir, { recursive: true });

  opts.onProgress(5, 'Launching headless Chromium', 'initializing');
  opts.log('step', 'Launching browser (headless Chromium via Playwright)');
  const wantLighthouse = opts.lighthouse && config.lighthouseEnabled;
  const { browser, debugPort } = await launchBrowser(wantLighthouse);
  opts.log('step', `✓ Browser initialized (Chromium ${browser.version()})`);

  const allDetectors: DetectorName[] = ['axe-core', 'keyboard-persona', 'seo', 'performance', 'functionality', 'mobile-ux'];
  for (const d of allDetectors) opts.onDetector(d, 'pending');
  opts.onDetector('lighthouse', wantLighthouse ? 'pending' : 'unavailable');
  const failed = (name: DetectorName, err: unknown, pageUrl: string) => {
    const message = errorMessage(err).split('\n')[0];
    detectorErrors[name] = message;
    opts.onDetector(name, 'failed');
    opts.log('warning', `⚠ ${name} failed on ${pageUrl}: ${message} — continuing with other checks`);
  };

  const linkCache: LinkStatusCache = new Map();
  const reportedLinkKeys = new Set<string>();
  const origin = new URL(opts.startUrl).origin;
  const queue: string[] = opts.fixedPages ? [...opts.fixedPages] : [opts.startUrl];
  const seen = new Set<string>();
  const maxPages = opts.fixedPages ? opts.fixedPages.length : opts.maxPages;
  let attempts = 0;
  let lastFrameAt = 0;

  try {
    while (queue.length > 0 && pages.filter((p) => p.status === 'scanned').length < maxPages && attempts < maxPages * 3) {
      if (Date.now() > opts.deadline) {
        opts.log('warning', '⚠ Audit time limit reached — finishing with the pages scanned so far');
        break;
      }
      const url = queue.shift()!;
      if ([...seen].some((s) => samePage(s, url))) continue;
      seen.add(url);
      attempts++;
      const pageIndex = pages.filter((p) => p.status === 'scanned').length;
      const progressBase = 10 + (pageIndex * 70) / maxPages;
      opts.onProgress(Math.round(progressBase), `Scanning page ${pageIndex + 1} of ${maxPages}`, opts.fixedPages ? undefined : 'crawling');
      opts.log('step', `Scanning page ${pageIndex + 1} of ${maxPages}: ${url}`, { url });

      const context = await newAgentContext(browser, opts);
      const page = await context.newPage();
      const runtime: RuntimeProblems = { pageErrors: [], failedResources: [] };
      page.on('pageerror', (err) => runtime.pageErrors.push(err.message));
      page.on('response', (res) => {
        const req = res.request();
        if (res.status() >= 400 && req.resourceType() !== 'document' && new URL(res.url()).origin === origin) {
          runtime.failedResources.push({ url: res.url(), status: res.status(), resourceType: req.resourceType() });
        }
      });

      const frame = async (caption: string) => {
        const now = Date.now();
        if (now - lastFrameAt < 120) return;
        lastFrameAt = now;
        try {
          const buf = await page.screenshot({ type: 'jpeg', quality: 55, timeout: 5000 });
          publishFrame(opts.auditId, buf, caption, page.url());
        } catch {
          /* frames are best-effort */
        }
      };
      const screenshot = async (name: string, highlightSelector?: string | null) => {
        try {
          if (highlightSelector) {
            await page
              .locator(highlightSelector)
              .first()
              .scrollIntoViewIfNeeded({ timeout: 2000 })
              .catch(() => undefined);
            await page
              .evaluate(
                (sel) => {
                  const wg = (window as unknown as { __wg?: { highlight: (e: Element | null, l: string, c: string) => boolean } }).__wg;
                  let el: Element | null = null;
                  try {
                    el = document.querySelector(sel);
                  } catch {
                    /* invalid selector */
                  }
                  wg?.highlight(el, 'Issue', '#ef4444');
                },
                highlightSelector,
              )
              .catch(() => undefined);
          }
          const file = `${opts.shotPrefix}${name}.jpg`;
          await page.screenshot({ path: path.join(shotDir, file), type: 'jpeg', quality: 70, timeout: 8000 });
          await page.evaluate(() => (window as unknown as { __wg?: { clearHighlight: () => void } }).__wg?.clearHighlight()).catch(() => undefined);
          return `${opts.auditId}/${file}`;
        } catch (err) {
          logger.debug('Screenshot failed', { error: errorMessage(err) });
          return null;
        }
      };
      const ctx: DetectorContext = {
        auditId: opts.auditId,
        pageUrl: url,
        pageIndex,
        log: (message, type = 'step') => opts.log(type, message),
        frame,
        screenshot,
      };

      try {
        const started = Date.now();
        let response;
        try {
          response = await page.goto(url, { waitUntil: 'load' });
        } catch (err) {
          const message = errorMessage(err).split('\n')[0];
          pages.push({ url, title: null, status: 'failed', httpStatus: null, error: message });
          opts.log('warning', `⚠ Could not load ${url}: ${message}`);
          continue;
        }
        const status = response?.status() ?? null;
        const contentType = response?.headers()['content-type'] ?? '';
        if (status !== null && status >= 400) {
          pages.push({ url, title: null, status: 'failed', httpStatus: status, error: `HTTP ${status}` });
          opts.log('warning', `⚠ ${url} responded with HTTP ${status} — recorded as a failed page`);
          continue;
        }
        if (contentType && !contentType.includes('html')) {
          opts.log('action', `Skipping ${url} (not an HTML page)`);
          continue;
        }
        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
        const finalUrl = page.url();
        if (new URL(finalUrl).origin !== origin && pageIndex === 0) {
          opts.log('warning', `Redirected to ${finalUrl}`);
        }
        const loadTimeMs = Date.now() - started;
        const title = await page.title().catch(() => null);
        opts.log('step', `✓ Page loaded: "${title || url}" (HTTP ${status ?? '?'}, ${loadTimeMs} ms)`);
        await frame(`Page ${pageIndex + 1} loaded · ${title ?? url}`);
        opts.onProgress(Math.round(progressBase + 3), `Testing page ${pageIndex + 1} of ${maxPages}`, opts.fixedPages ? undefined : 'testing');

        if (!opts.fixedPages) {
          for (const link of await discoverLinks(page, origin)) queue.push(link);
        }

        const pageShot = await (async () => {
          try {
            const file = `${opts.shotPrefix}page-${pageIndex}.jpg`;
            const height = await page.evaluate(() => document.documentElement.scrollHeight);
            await page.screenshot({ path: path.join(shotDir, file), type: 'jpeg', quality: 60, fullPage: height < 6000, timeout: 15000 });
            return `${opts.auditId}/${file}`;
          } catch {
            return null;
          }
        })();

        const pageFindings: RawFinding[] = [];
        const run = async <T>(name: DetectorName, fn: () => Promise<T>): Promise<T | null> => {
          opts.onDetector(name, 'running');
          try {
            const result = await fn();
            if (!detectorErrors[name]) opts.onDetector(name, 'completed');
            return result;
          } catch (err) {
            failed(name, err, url);
            return null;
          }
        };

        // 1. Screen-reader + low-vision personas (axe-core on the pristine DOM)
        await frame(`Accessibility scan · ${title ?? url}`);
        const axe = await run('axe-core', async () => [...(await runAxe(page, ctx)), ...(await runFormLabelCheck(page, ctx))]);
        if (axe) pageFindings.push(...axe);

        // 2. First-time visitor / SEO
        const seo = await run('seo', () => runSeo(page, ctx));
        if (seo) pageFindings.push(...seo);

        // 3. Slow device — resource weight
        const perf = await run('performance', () => runPerformance(page, ctx));
        if (perf) pageFindings.push(...perf.findings);

        // 4. Functionality — errors, failed resources, links
        const func = await run('functionality', async () => {
          const out = analyzeRuntime(runtime, ctx);
          const { links, missingAnchors } = await collectLinks(page);
          out.push(...analyzeMissingAnchors(missingAnchors, ctx));
          const broken = await checkLinks(context.request, links, origin, linkCache, ctx);
          // Report each broken destination once per audit (it usually appears on every page).
          for (const f of broken) {
            const key = String(f.fingerprintKey);
            if (reportedLinkKeys.has(key)) continue;
            reportedLinkKeys.add(key);
            out.push(f);
          }
          if (out.length) ctx.log(`Functionality checks found ${out.length} problem(s)`, 'warning');
          return out;
        });
        if (func) pageFindings.push(...func);

        // Evidence screenshots for DOM-anchored findings (before the keyboard persona changes focus).
        let shots = 0;
        for (const f of pageFindings) {
          if (shots >= 30) break;
          if (f.selector && f.selector !== 'head' && !f.screenshotPath) {
            f.screenshotPath = await screenshot(`issue-${pageIndex}-${shots++}`, f.selector);
          }
        }
        for (const f of pageFindings) {
          if (!f.screenshotPath) f.screenshotPath = pageShot;
        }
        for (const f of pageFindings) {
          if (f.baseSeverity === 'critical' || f.baseSeverity === 'high') {
            opts.log('issue', `⚠ ${f.title}${f.selector ? ` (${f.selector})` : ''}`, { rule: f.rule });
          }
        }

        // 5. Keyboard-only persona (interactive)
        if (!opts.skipKeyboard) {
          await page.reload({ waitUntil: 'load' }).catch(() => undefined);
          const kb = await run('keyboard-persona', () => runKeyboardPersona(page, ctx));
          if (kb) {
            for (const f of kb.findings) if (!f.screenshotPath) f.screenshotPath = pageShot;
            pageFindings.push(...kb.findings);
          }
        }

        // 6. Mobile viewport
        if (!opts.skipMobile) {
          const mobile = await run('mobile-ux', () => runMobileChecks(browser, ctx, config.navigationTimeoutMs, (c) => prepareContext(c, opts)));
          if (mobile) {
            for (const f of mobile) f.screenshotPath = f.screenshotPath ?? pageShot;
            pageFindings.push(...mobile);
          }
        }

        findings.push(...pageFindings);
        pages.push({ url, title, status: 'scanned', httpStatus: status, screenshot: pageShot, loadTimeMs });
        opts.log('step', `✓ Page ${pageIndex + 1} complete — ${pageFindings.length} finding(s)`, { url, findings: pageFindings.length });
      } finally {
        await context.close().catch(() => undefined);
      }
    }

    const firstPage = pages.find((p) => p.status === 'scanned');
    if (!firstPage) {
      throw new Error(pages[0]?.error ? `The website could not be loaded: ${pages[0].error}` : 'No pages could be scanned.');
    }

    // Lighthouse (slow-device persona) — first page only, optional.
    if (wantLighthouse && debugPort) {
      opts.onProgress(82, 'Running Lighthouse performance audit');
      opts.onDetector('lighthouse', 'running');
      try {
        const lhCtx: DetectorContext = {
          auditId: opts.auditId,
          pageUrl: firstPage.url,
          pageIndex: 0,
          log: (message, type = 'step') => opts.log(type, message),
          frame: async () => undefined,
          screenshot: async () => null,
        };
        const lh = await runLighthouse(firstPage.url, debugPort, lhCtx, Math.max(20_000, Math.min(90_000, opts.deadline - Date.now())));
        lighthouse = lh.summary;
        for (const f of lh.findings) f.screenshotPath = firstPage.screenshot ?? null;
        findings.push(...lh.findings);
        opts.onDetector('lighthouse', 'completed');
      } catch (err) {
        detectorErrors.lighthouse = errorMessage(err).split('\n')[0];
        opts.onDetector('lighthouse', 'unavailable');
        opts.log('warning', `⚠ Lighthouse unavailable: ${detectorErrors.lighthouse} — other results are unaffected`);
      }
    }
  } finally {
    await browser.close().catch(() => undefined);
  }

  return { pages, findings, lighthouse, detectorErrors };
}
