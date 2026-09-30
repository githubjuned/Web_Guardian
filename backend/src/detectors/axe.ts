/**
 * axe-core accessibility detector (screen-reader, low-vision and keyboard personas).
 * Only confirmed violations become findings — "incomplete" results are ignored.
 */
import { AxeBuilder } from '@axe-core/playwright';
import type { Page } from 'playwright';
import type { Persona, Severity } from '@webguardian/shared';
import type { DetectorContext, RawFinding } from './types';

const MAX_NODES_PER_RULE = 8;

/** Rules handled by more specific WebGuardian detectors (avoids duplicates). */
const DISABLED_RULES = ['document-title', 'page-has-heading-one', 'meta-viewport'];

const KEYBOARD_RULES = new Set([
  'tabindex',
  'scrollable-region-focusable',
  'focus-order-semantics',
  'nested-interactive',
  'frame-focusable-content',
  'accesskeys',
]);

export function personaForAxeRule(ruleId: string): Persona {
  if (ruleId.startsWith('color-contrast') || ruleId === 'link-in-text-block') return 'low-vision';
  if (KEYBOARD_RULES.has(ruleId)) return 'keyboard';
  return 'screen-reader';
}

export function severityForImpact(impact: string | null | undefined): Severity {
  switch (impact) {
    case 'critical':
      return 'critical';
    case 'serious':
      return 'high';
    case 'moderate':
      return 'medium';
    default:
      return 'low';
  }
}

function clip(html: string, max = 600): string {
  return html.length > max ? `${html.slice(0, max)}…` : html;
}

interface ContrastData {
  fgColor?: string;
  bgColor?: string;
  contrastRatio?: number;
  expectedContrastRatio?: string;
  fontSize?: string;
}

export async function runAxe(page: Page, ctx: DetectorContext): Promise<RawFinding[]> {
  ctx.log('Running axe-core accessibility engine (WCAG 2.1 A/AA + best practices)', 'step');
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
    .disableRules(DISABLED_RULES)
    .analyze();

  const findings: RawFinding[] = [];
  for (const violation of results.violations) {
    const persona = personaForAxeRule(violation.id);
    for (const node of violation.nodes.slice(0, MAX_NODES_PER_RULE)) {
      const selector = node.target.map((t) => (Array.isArray(t) ? t.join(' ') : String(t))).join(' ');
      let description = node.failureSummary?.replace(/^Fix (any|all) of the following:\s*/i, '').trim() || violation.description;
      let metrics: Record<string, unknown> | null = null;
      if (violation.id.startsWith('color-contrast')) {
        const data = node.any.find((c) => c.id.startsWith('color-contrast'))?.data as ContrastData | undefined;
        if (data?.contrastRatio) {
          metrics = {
            contrastRatio: data.contrastRatio,
            expected: data.expectedContrastRatio,
            foreground: data.fgColor,
            background: data.bgColor,
            fontSize: data.fontSize,
          };
          description = `Text contrast is ${data.contrastRatio}:1 (${data.fgColor} on ${data.bgColor}); WCAG AA requires ${data.expectedContrastRatio}.`;
        }
      }
      findings.push({
        pageUrl: ctx.pageUrl,
        category: 'accessibility',
        persona,
        baseSeverity: severityForImpact(node.impact ?? violation.impact),
        confidence: 'high',
        title: violation.help,
        description,
        selector,
        htmlSnippet: clip(node.html),
        steps: [
          `Open ${ctx.pageUrl}`,
          `Inspect the element matching \`${selector}\``,
          `axe-core rule "${violation.id}" fails: ${violation.description}`,
        ],
        rule: violation.id,
        detectedBy: 'axe-core',
        helpUrl: violation.helpUrl ?? null,
        metrics,
      });
    }
    if (violation.nodes.length > MAX_NODES_PER_RULE) {
      ctx.log(`axe-core: "${violation.id}" matched ${violation.nodes.length} elements (keeping the first ${MAX_NODES_PER_RULE})`, 'warning');
    }
  }
  ctx.log(`axe-core finished: ${results.violations.length} rule violations, ${findings.length} affected elements`, 'step');
  return findings;
}

/**
 * Form fields whose only "label" is placeholder text. axe-core accepts a
 * placeholder as an accessible name, but it disappears on input and is not
 * reliably announced — WCAG 3.3.2 (Labels or Instructions).
 */
export async function runFormLabelCheck(page: Page, ctx: DetectorContext): Promise<RawFinding[]> {
  const fields = await page.evaluate(() => {
    const out: { selector: string; html: string; placeholder: string }[] = [];
    const inputs = Array.from(document.querySelectorAll<HTMLElement>('input, textarea'));
    for (const el of inputs) {
      const type = (el.getAttribute('type') ?? 'text').toLowerCase();
      if (['hidden', 'submit', 'button', 'reset', 'image', 'checkbox', 'radio'].includes(type)) continue;
      const placeholder = el.getAttribute('placeholder');
      if (!placeholder) continue;
      const labelled =
        el.getAttribute('aria-label') ||
        el.getAttribute('aria-labelledby') ||
        el.getAttribute('title') ||
        (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) ||
        el.closest('label');
      if (labelled) continue;
      const wg = (window as unknown as { __wg?: { cssPath: (e: Element) => string | null } }).__wg;
      out.push({ selector: wg?.cssPath(el) ?? el.tagName.toLowerCase(), html: el.outerHTML.slice(0, 300), placeholder });
    }
    return out.slice(0, 8);
  });
  return fields.map((f) => ({
    pageUrl: ctx.pageUrl,
    category: 'accessibility' as const,
    persona: 'screen-reader' as const,
    baseSeverity: 'medium' as const,
    confidence: 'high' as const,
    title: 'Form field uses placeholder text instead of a label',
    description: `This field has no <label> or aria-label — only the placeholder "${f.placeholder}", which disappears as soon as the user starts typing.`,
    selector: f.selector,
    htmlSnippet: f.html,
    steps: [`Open ${ctx.pageUrl}`, `Inspect the field \`${f.selector}\``, 'It has no associated <label>, aria-label or aria-labelledby'],
    rule: 'label-placeholder-only',
    detectedBy: 'WebGuardian form inspector (DOM)',
    helpUrl: 'https://www.w3.org/WAI/tutorials/forms/labels/',
  }));
}
