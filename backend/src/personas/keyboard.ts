/**
 * Keyboard-only persona.
 *
 * Navigates the page exclusively with Tab / Shift+Tab / Escape / Enter — never the mouse —
 * and records what receives focus. Detects:
 *   - focus traps (focus cycles inside a region and cannot leave it)
 *   - missing visible focus indicators
 *   - clickable navigation items that are not keyboard-focusable
 */
import type { Page } from 'playwright';
import type { DetectorContext, RawFinding } from '../detectors/types';

interface FocusInfo {
  id: string | null;
  tag: string;
  name: string;
  selector: string | null;
  html: string;
  inNav: boolean;
  isLink: boolean;
  visible: boolean;
}

interface SetupInfo {
  total: number;
  navCount: number;
  navClickableNotFocusable: { selector: string | null; html: string; text: string }[];
}

const DISMISS_PATTERN = /accept|agree|allow|close|dismiss|got it|^ok$|reject|decline|continue|understand/i;

async function setup(page: Page): Promise<SetupInfo> {
  return page.evaluate(() => {
    const SELECTOR = 'a[href], button, input, select, textarea, summary, iframe, [tabindex], [contenteditable="true"]';
    const signature = (el: Element) => {
      const s = getComputedStyle(el);
      return [s.outlineStyle, s.outlineWidth, s.outlineColor, s.boxShadow, s.backgroundColor, s.color, s.borderColor, s.textDecorationLine].join('|');
    };
    let n = 0;
    let navCount = 0;
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(SELECTOR))) {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (el.tabIndex < 0 || (el as HTMLButtonElement).disabled || rect.width === 0 || rect.height === 0 || style.visibility === 'hidden') continue;
      el.setAttribute('data-wg-kb', String(n++));
      el.setAttribute('data-wg-sig', signature(el));
      if (el.closest('nav, [role="navigation"]')) navCount++;
    }
    const navClickableNotFocusable = Array.from(document.querySelectorAll<HTMLElement>('nav *, [role="navigation"] *'))
      .filter((el) => (el.hasAttribute('onclick') || getComputedStyle(el).cursor === 'pointer') && el.tabIndex < 0 && !el.closest('a[href], button'))
      .slice(0, 3)
      .map((el) => ({
        selector: (window as unknown as { __wg?: { cssPath: (e: Element) => string | null } }).__wg?.cssPath(el) ?? null,
        html: el.outerHTML.slice(0, 200),
        text: (el.textContent ?? '').trim().slice(0, 60),
      }));
    return { total: n, navCount, navClickableNotFocusable };
  });
}

async function activeInfo(page: Page): Promise<FocusInfo> {
  // Give focus transitions a moment so the visible-focus comparison is fair.
  await page.waitForTimeout(80);
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body || el === document.documentElement) {
      return { id: null, tag: 'body', name: '(page / browser UI)', selector: null, html: '', inNav: false, isLink: false, visible: true };
    }
    const s = getComputedStyle(el);
    const sig = [s.outlineStyle, s.outlineWidth, s.outlineColor, s.boxShadow, s.backgroundColor, s.color, s.borderColor, s.textDecorationLine].join('|');
    const before = el.getAttribute('data-wg-sig');
    const name =
      el.getAttribute('aria-label') ||
      (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60) ||
      el.getAttribute('placeholder') ||
      el.getAttribute('title') ||
      `<${el.tagName.toLowerCase()}>`;
    const clone = el.cloneNode(true) as HTMLElement;
    clone.removeAttribute('data-wg-kb');
    clone.removeAttribute('data-wg-sig');
    return {
      id: el.getAttribute('data-wg-kb'),
      tag: el.tagName.toLowerCase(),
      name,
      selector: (window as unknown as { __wg?: { cssPath: (e: Element) => string | null } }).__wg?.cssPath(el) ?? null,
      html: clone.outerHTML.slice(0, 300),
      inNav: !!el.closest('nav, [role="navigation"]'),
      isLink: el.tagName === 'A' && !!el.getAttribute('href') && !el.getAttribute('href')!.startsWith('#'),
      visible: before === null ? true : before !== sig,
    };
  });
}

async function highlightActive(page: Page, label: string, color?: string) {
  await page.evaluate(
    ([l, c]) => {
      const wg = (window as unknown as { __wg?: { highlight: (e: Element | null, l: string, c?: string) => boolean } }).__wg;
      wg?.highlight(document.activeElement, l, c);
    },
    [label, color] as const,
  );
}

async function clearHighlight(page: Page) {
  await page.evaluate(() => (window as unknown as { __wg?: { clearHighlight: () => void } }).__wg?.clearHighlight());
}

export interface KeyboardResult {
  findings: RawFinding[];
  visited: number;
  totalFocusable: number;
  trapped: boolean;
}

export async function runKeyboardPersona(page: Page, ctx: DetectorContext, options: { maxPresses?: number } = {}): Promise<KeyboardResult> {
  ctx.log('Keyboard-only persona started — the mouse is disabled for this test', 'step');
  const info = await setup(page);
  const findings: RawFinding[] = [];
  if (info.total === 0) {
    ctx.log('No keyboard-focusable elements found on this page', 'warning');
    return { findings, visited: 0, totalFocusable: 0, trapped: false };
  }
  ctx.log(`Found ${info.total} focusable elements (${info.navCount} in navigation). Pressing Tab to walk the page…`, 'action');

  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur?.();
  });

  const maxPresses = Math.min(options.maxPresses ?? 45, info.total + 6);
  const sequence: FocusInfo[] = [];
  const firstSeenAt = new Map<string, number>();
  let trapCycle: FocusInfo[] | null = null;

  for (let i = 0; i < maxPresses; i++) {
    await page.keyboard.press('Tab');
    const f = await activeInfo(page);
    sequence.push(f);
    ctx.log(`Pressing Tab (${i + 1}) → ${f.id === null ? 'focus left the page content' : `<${f.tag}> "${f.name}"`}`, 'action');
    if (f.id !== null) {
      await highlightActive(page, `Tab ${i + 1}: ${f.name.slice(0, 32)}`);
      await ctx.frame(`Keyboard persona · Tab ${i + 1} → ${f.name.slice(0, 40)}`);
      await clearHighlight(page);
    }
    if (f.id === null) continue;
    const prev = firstSeenAt.get(f.id);
    if (prev !== undefined) {
      const cycle = sequence.slice(prev, sequence.length - 1);
      const escapedToPage = cycle.some((c) => c.id === null);
      const unique = new Set(cycle.map((c) => c.id)).size;
      if (!escapedToPage && unique < info.total) {
        trapCycle = cycle;
      }
      break; // Tab order has repeated — we have seen the whole reachable cycle.
    }
    firstSeenAt.set(f.id, sequence.length - 1);
  }

  const visitedIds = new Set(sequence.filter((s) => s.id !== null).map((s) => s.id));
  let trapped = false;

  if (trapCycle) {
    const cycleIds = new Set(trapCycle.map((c) => c.id));
    ctx.log(`⚠ Focus is cycling between the same ${cycleIds.size} element(s) — ${info.total - visitedIds.size} other elements are unreachable`, 'warning');

    // Standard escape attempts a real keyboard user would try.
    const leaves = async (presses: number) => {
      for (let i = 0; i < presses; i++) {
        await page.keyboard.press('Tab');
        const f = await activeInfo(page);
        if (f.id === null || !cycleIds.has(f.id)) return true;
      }
      return false;
    };

    const steps: string[] = [`Open ${ctx.pageUrl}`, 'Press Tab repeatedly without using the mouse'];
    steps.push(`Focus only moves between: ${[...new Map(trapCycle.map((c) => [c.id, c.name])).values()].map((n) => `"${n}"`).join(', ')}`);

    ctx.log('Trying to escape: pressing Escape…', 'action');
    await page.keyboard.press('Escape');
    let escaped = await leaves(cycleIds.size + 2);
    steps.push(escaped ? 'Pressing Escape released focus' : 'Pressing Escape does not release focus');

    if (!escaped) {
      const dismiss = trapCycle.find((c) => !c.isLink && DISMISS_PATTERN.test(c.name));
      if (dismiss) {
        ctx.log(`Trying to dismiss: focusing "${dismiss.name}" and pressing Enter…`, 'action');
        for (let i = 0; i <= cycleIds.size; i++) {
          const f = await activeInfo(page);
          if (f.id === dismiss.id) break;
          await page.keyboard.press('Tab');
        }
        await page.keyboard.press('Enter');
        await page.waitForTimeout(400);
        escaped = await leaves(cycleIds.size + 2);
        steps.push(
          escaped
            ? `Pressing Enter on "${dismiss.name}" dismissed it and released focus`
            : `Pressing Enter on "${dismiss.name}" does nothing — it cannot be activated from the keyboard`,
        );
      }
    }

    if (!escaped) {
      trapped = true;
      const container = await page.evaluate((ids: string[]) => {
        const els = ids.map((id) => document.querySelector(`[data-wg-kb="${id}"]`)).filter(Boolean) as Element[];
        if (els.length === 0) return null;
        let node: Element | null = els[0];
        while (node && !els.every((e) => node!.contains(e))) node = node.parentElement;
        // Prefer a meaningful container (with an id, role, or landmark tag).
        let target: Element | null = node;
        while (target && target !== document.body && !target.id && !target.getAttribute('role') && !/^(DIALOG|ASIDE|SECTION|FORM|NAV|HEADER|FOOTER)$/.test(target.tagName)) {
          target = target.parentElement;
        }
        const chosen = target && target !== document.body ? target : node;
        if (!chosen) return null;
        const clone = chosen.cloneNode(true) as Element;
        clone.querySelectorAll('[data-wg-kb]').forEach((e) => {
          e.removeAttribute('data-wg-kb');
          e.removeAttribute('data-wg-sig');
        });
        return {
          selector: (window as unknown as { __wg?: { cssPath: (e: Element) => string | null } }).__wg?.cssPath(chosen) ?? chosen.tagName.toLowerCase(),
          html: clone.outerHTML.slice(0, 700),
          label: (chosen.id || chosen.getAttribute('aria-label') || chosen.className || chosen.tagName).toString(),
        };
      }, [...cycleIds].filter((x): x is string => x !== null));

      const unreachable = info.total - visitedIds.size;
      const navReached = sequence.some((s) => s.inNav);
      const where = container?.label ? ` inside ${container.selector}` : '';
      ctx.log(`⚠ ISSUE FOUND: keyboard focus is trapped${where}. Keyboard users cannot reach the rest of the page.`, 'issue');
      steps.push(`${unreachable} of ${info.total} focusable elements (including ${navReached ? 'some' : `all ${info.navCount}`} navigation links) can never be reached`);
      const shot = await ctx.screenshot(`kb-trap-${ctx.pageIndex}`, container?.selector ?? null);
      findings.push({
        pageUrl: ctx.pageUrl,
        category: 'accessibility',
        persona: 'keyboard',
        baseSeverity: 'critical',
        confidence: 'high',
        title: `Keyboard focus is trapped${container ? ` inside ${container.selector}` : ''}`,
        description:
          `Pressing Tab only cycles between ${cycleIds.size} element(s)${where}. ` +
          `${unreachable} of ${info.total} focusable elements${!navReached && info.navCount > 0 ? `, including the main navigation,` : ''} can never be reached with the keyboard, and Escape does not release focus.`,
        selector: container?.selector ?? trapCycle[0].selector,
        htmlSnippet: container?.html ?? trapCycle[0].html,
        steps,
        rule: 'keyboard-focus-trap',
        detectedBy: 'WebGuardian keyboard persona (Playwright key presses)',
        helpUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/no-keyboard-trap.html',
        metrics: { cycleSize: cycleIds.size, focusable: info.total, unreachable, navigationReached: navReached },
        screenshotPath: shot,
      });
    } else {
      ctx.log('Focus was released — no trap', 'action');
    }
  } else {
    ctx.log(`Keyboard walk complete: reached ${visitedIds.size} of ${info.total} focusable elements`, 'action');
  }

  // Visible focus indicator check on everything that received focus.
  const focused = [...new Map(sequence.filter((s) => s.id !== null).map((s) => [s.id, s])).values()];
  const invisible = focused.filter((f) => !f.visible);
  if (invisible.length > 0) {
    const first = invisible[0];
    ctx.log(`⚠ ${invisible.length} of ${focused.length} focused elements showed no visible focus indicator`, 'issue');
    findings.push({
      pageUrl: ctx.pageUrl,
      category: 'accessibility',
      persona: 'keyboard',
      baseSeverity: invisible.length === focused.length ? 'high' : 'medium',
      confidence: 'high',
      title: 'Keyboard focus is invisible',
      description: `${invisible.length} of ${focused.length} elements that received keyboard focus looked exactly the same focused and unfocused (no outline, shadow, colour or border change). Examples: ${invisible
        .slice(0, 3)
        .map((f) => `"${f.name}"`)
        .join(', ')}.`,
      selector: first.selector,
      htmlSnippet: first.html,
      steps: [
        `Open ${ctx.pageUrl}`,
        'Press Tab to move focus',
        `Focus lands on "${first.name}" but nothing on screen shows where focus is`,
      ],
      rule: 'focus-not-visible',
      detectedBy: 'WebGuardian keyboard persona (computed-style comparison)',
      helpUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/focus-visible.html',
      metrics: { checked: focused.length, invisible: invisible.length, examples: invisible.slice(0, 5).map((f) => f.selector) },
    });
  }

  for (const item of info.navClickableNotFocusable) {
    findings.push({
      pageUrl: ctx.pageUrl,
      category: 'accessibility',
      persona: 'keyboard',
      baseSeverity: 'high',
      confidence: 'medium',
      title: 'Clickable navigation item cannot be reached with the keyboard',
      description: `"${item.text}" looks clickable (pointer cursor or click handler) but is not a link or button and cannot receive keyboard focus.`,
      selector: item.selector,
      htmlSnippet: item.html,
      steps: [`Open ${ctx.pageUrl}`, 'Tab through the navigation', `"${item.text}" is skipped`],
      rule: 'keyboard-nav-unreachable',
      detectedBy: 'WebGuardian keyboard persona (DOM inspection)',
      helpUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/keyboard.html',
      fingerprintKey: item.selector ?? item.text,
    });
  }

  // Clean up attributes so later inspections see the original DOM.
  await page.evaluate(() => {
    document.querySelectorAll('[data-wg-kb]').forEach((e) => {
      e.removeAttribute('data-wg-kb');
      e.removeAttribute('data-wg-sig');
    });
  });

  return { findings, visited: visitedIds.size, totalFocusable: info.total, trapped };
}
