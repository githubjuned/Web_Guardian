import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { HELPER_SCRIPT } from '../src/agents/pageHelpers';
import { runKeyboardPersona } from '../src/personas/keyboard';
import { runAxe, runFormLabelCheck } from '../src/detectors/axe';
import { collectSeoSnapshot, analyzeSeo } from '../src/detectors/seo';
import type { DetectorContext } from '../src/detectors/types';

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch().catch(() => chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }));
});
afterAll(async () => browser?.close());

const ctx = (pageUrl = 'https://test.local/'): DetectorContext => ({
  auditId: 'test',
  pageUrl,
  pageIndex: 0,
  log: () => undefined,
  frame: async () => undefined,
  screenshot: async () => null,
});

async function pageWith(html: string): Promise<Page> {
  const context = await browser.newContext();
  await context.addInitScript(HELPER_SCRIPT);
  const page = await context.newPage();
  await page.setContent(html, { waitUntil: 'load' });
  return page;
}

const NAV = `<header><nav><a href="/a">Home</a><a href="/b">Shop</a><a href="/c">Contact</a></nav></header>`;

describe('keyboard-only persona', () => {
  it('walks a normal page without reporting a trap', async () => {
    const page = await pageWith(`${NAV}<main><h1>Hi</h1><button>Buy</button><a href="/d">More</a></main>
      <style>a:focus, button:focus { outline: 3px solid blue; }</style>`);
    const result = await runKeyboardPersona(page, ctx());
    expect(result.trapped).toBe(false);
    expect(result.visited).toBe(result.totalFocusable);
    expect(result.findings).toEqual([]);
  });

  it('detects a focus trap that intercepts Tab and ignores Escape/Enter', async () => {
    const page = await pageWith(`${NAV}<main><button>Buy</button></main>
      <div id="consent"><a href="#p">Privacy</a><div tabindex="0">Accept all</div></div>
      <script>
        const f = document.querySelectorAll('#consent a, #consent [tabindex="0"]'); let i = -1;
        document.addEventListener('keydown', (e) => { if (e.key === 'Tab') { e.preventDefault(); i = (i + 1) % f.length; f[i].focus(); } });
      </script>`);
    const result = await runKeyboardPersona(page, ctx());
    expect(result.trapped).toBe(true);
    const trap = result.findings.find((f) => f.rule === 'keyboard-focus-trap')!;
    expect(trap.selector).toBe('#consent');
    expect(trap.baseSeverity).toBe('critical');
    expect(trap.steps.join(' ')).toMatch(/Escape does not release focus/);
    expect(trap.steps.join(' ')).toMatch(/Enter on "Accept all" does nothing/);
    expect(trap.metrics).toMatchObject({ navigationReached: false });
  });

  it('does not report a trap when Enter on "Accept" dismisses the banner', async () => {
    const page = await pageWith(`${NAV}<main><button>Buy</button></main>
      <div id="consent"><button id="ok">Accept all</button></div>
      <script>
        let active = true;
        document.getElementById('ok').addEventListener('click', () => { active = false; document.getElementById('consent').remove(); });
        document.addEventListener('keydown', (e) => { if (active && e.key === 'Tab') { e.preventDefault(); document.getElementById('ok').focus(); } });
      </script>
      <style>*:focus { outline: 2px solid red; }</style>`);
    const result = await runKeyboardPersona(page, ctx());
    expect(result.trapped).toBe(false);
    expect(result.findings.find((f) => f.rule === 'keyboard-focus-trap')).toBeUndefined();
  });

  it('detects invisible focus indicators', async () => {
    const page = await pageWith(`${NAV}<style>*:focus { outline: none; }</style>`);
    const result = await runKeyboardPersona(page, ctx());
    const f = result.findings.find((x) => x.rule === 'focus-not-visible')!;
    expect(f).toBeDefined();
    expect(f.metrics).toMatchObject({ invisible: 3, checked: 3 });
  });
});

describe('accessibility detection (axe-core + form labels)', () => {
  it('finds unlabeled icon buttons, missing alt text and low contrast', async () => {
    const page = await pageWith(`<!doctype html><html lang="en"><head><title>Test page</title></head><body><main>
      <h1>Shop</h1><button class="icon-menu"><svg width="10" height="10"></svg></button>
      <img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" width="20" height="20">
      <p style="color:#bbb;background:#fff">Low contrast text</p>
      <input type="email" placeholder="Email"></main></body></html>`);
    const findings = [...(await runAxe(page, ctx())), ...(await runFormLabelCheck(page, ctx()))];
    const rules = findings.map((f) => f.rule);
    expect(rules).toEqual(expect.arrayContaining(['button-name', 'image-alt', 'color-contrast', 'label-placeholder-only']));
    const button = findings.find((f) => f.rule === 'button-name')!;
    // axe-core emits the shortest unique selector — the only <button> on this page.
    expect(button.selector).toBe('button');
    expect(button.htmlSnippet).toContain('<button class="icon-menu">');
    expect(button.confidence).toBe('high');
    const contrast = findings.find((f) => f.rule === 'color-contrast')!;
    expect(contrast.persona).toBe('low-vision');
    expect(contrast.metrics).toHaveProperty('contrastRatio');
  });
});

describe('SEO detection on a real DOM', () => {
  it('finds a styled div posing as the headline', async () => {
    const page = await pageWith(`<html><head><title>Brewly — Fresh coffee delivered</title></head><body>
      <div class="hero-title" style="font-size:60px">Coffee worth waking up for.</div><p>text</p></body></html>`);
    const findings = analyzeSeo(await collectSeoSnapshot(page), ctx());
    const h1 = findings.find((f) => f.rule === 'seo-h1-missing')!;
    expect(h1.selector).toBe('div.hero-title');
    expect(findings.map((f) => f.rule)).toContain('seo-meta-description-missing');
  });
});
