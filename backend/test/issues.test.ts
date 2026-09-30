import { describe, expect, it } from 'vitest';
import type { RawFinding } from '../src/detectors/types';
import { buildIssues, fingerprintOf } from '../src/services/issueFactory';
import { prioritize } from '../src/services/prioritization';
import { computeScores, countSeverities } from '../src/services/scoring';
import { analyzeSeo } from '../src/detectors/seo';
import { analyzePerformance } from '../src/detectors/performance';
import { IssueSchema } from './issueSchema';

const finding = (over: Partial<RawFinding> = {}): RawFinding => ({
  pageUrl: 'https://shop.example/',
  category: 'accessibility',
  persona: 'screen-reader',
  baseSeverity: 'critical',
  confidence: 'high',
  title: 'Buttons must have discernible text',
  description: 'Element does not have inner text that is visible to screen readers',
  selector: 'header .menu-toggle',
  htmlSnippet: '<button class="menu-toggle"></button>',
  steps: ['Open the page'],
  rule: 'button-name',
  detectedBy: 'axe-core',
  helpUrl: null,
  ...over,
});

describe('issue construction', () => {
  it('produces schema-valid, numbered issues ordered by priority', () => {
    const issues = buildIssues(
      'audit_x',
      [
        finding({ rule: 'seo-meta-description-missing', category: 'seo', persona: 'first-time-visitor', baseSeverity: 'medium', selector: 'head' }),
        finding(),
        finding({ rule: 'keyboard-focus-trap', persona: 'keyboard', selector: '#cookie-banner' }),
      ],
      'https://shop.example/',
    );
    for (const issue of issues) IssueSchema.parse(issue);
    expect(issues.map((i) => i.number)).toEqual([1, 2, 3]);
    expect(issues[0].rule).toBe('keyboard-focus-trap');
    expect(issues.at(-1)!.rule).toBe('seo-meta-description-missing');
  });

  it('deduplicates identical findings and site-wide problems', () => {
    const issues = buildIssues(
      'audit_x',
      [
        finding(),
        finding(),
        finding({ rule: 'broken-link', category: 'functionality', fingerprintKey: '/pricing.html' }),
        finding({ rule: 'broken-link', category: 'functionality', fingerprintKey: '/pricing.html', pageUrl: 'https://shop.example/about' }),
      ],
      'https://shop.example/',
    );
    expect(issues).toHaveLength(2);
  });

  it('fingerprints are stable across sandbox copies of the same page', () => {
    const a = fingerprintOf(finding({ pageUrl: 'http://h/sandbox/sbx_aaaaaaaaaa/index.html' }));
    const b = fingerprintOf(finding({ pageUrl: 'http://h/sandbox/sbx_bbbbbbbbbb/' }));
    expect(a).toBe(b);
  });
});

describe('prioritisation (severity × users affected × page visibility)', () => {
  it('ranks a homepage focus trap as critical and explains why', () => {
    const p = prioritize(finding({ rule: 'keyboard-focus-trap', persona: 'keyboard', selector: '#cookie-banner' }), true);
    expect(p.severity).toBe('critical');
    expect(p.reason).toMatch(/keyboard-only users/);
    expect(p.reason).toMatch(/homepage/);
  });

  it('lowers priority on inner pages', () => {
    const home = prioritize(finding({ baseSeverity: 'high', selector: '.x' }), true);
    const inner = prioritize(finding({ baseSeverity: 'high', selector: '.x' }), false);
    expect(inner.score).toBeLessThan(home.score);
  });

  it('mentions navigation when the element is in the header', () => {
    expect(prioritize(finding({ selector: 'nav a.menu' }), true).reason).toMatch(/navigation/);
  });
});

describe('scoring', () => {
  it('gives 100 when a category has no issues and less when it does', () => {
    const scores = computeScores([{ category: 'seo', severity: 'medium', rule: 'seo-h1-missing', pageUrl: 'x' }]);
    expect(scores.accessibility).toBe(100);
    expect(scores.seo).toBeLessThan(100);
    expect(scores.overall).toBeGreaterThan(scores.seo!);
  });

  it('fixing an issue raises the score', () => {
    const before = computeScores([
      { category: 'accessibility', severity: 'critical', rule: 'a', pageUrl: 'x' },
      { category: 'accessibility', severity: 'high', rule: 'b', pageUrl: 'x' },
    ]);
    const after = computeScores([{ category: 'accessibility', severity: 'high', rule: 'b', pageUrl: 'x' }]);
    expect(after.accessibility!).toBeGreaterThan(before.accessibility!);
  });

  it('marks unavailable categories as null instead of guessing', () => {
    expect(computeScores([], { performance: true }).performance).toBeNull();
  });

  it('counts severities', () => {
    expect(countSeverities([{ severity: 'high' }, { severity: 'high' }, { severity: 'low' }])).toEqual({ critical: 0, high: 2, medium: 0, low: 1 });
  });
});

describe('SEO detector', () => {
  const ctx = { pageUrl: 'https://shop.example/', pageIndex: 0 };
  const good = {
    title: 'Brewly — Fresh Coffee, Delivered',
    metaDescription: 'Specialty beans from independent farms, roasted to order and delivered to your door.',
    h1s: [{ text: 'Coffee', html: '<h1>Coffee</h1>' }],
    viewport: 'width=device-width',
    ogTitle: 'Brewly',
    headlineCandidate: null,
    lang: 'en',
  };

  it('reports nothing for a well-formed page', () => {
    expect(analyzeSeo(good, ctx)).toEqual([]);
  });

  it('detects missing title, meta description and H1', () => {
    const rules = analyzeSeo(
      { ...good, title: null, metaDescription: null, h1s: [], headlineCandidate: { selector: 'div.hero-title', html: '<div class="hero-title">Coffee</div>', text: 'Coffee' } },
      ctx,
    ).map((f) => f.rule);
    expect(rules).toEqual(expect.arrayContaining(['seo-title-missing', 'seo-meta-description-missing', 'seo-h1-missing']));
  });

  it('detects multiple H1s, a missing viewport and missing Open Graph tags', () => {
    const rules = analyzeSeo({ ...good, h1s: [good.h1s[0], good.h1s[0]], viewport: null, ogTitle: null }, ctx).map((f) => f.rule);
    expect(rules).toEqual(expect.arrayContaining(['seo-multiple-h1', 'ux-viewport-missing', 'seo-open-graph-missing']));
  });
});

describe('performance detector', () => {
  it('flags large images with measured sizes', () => {
    const [f] = analyzePerformance(
      {
        totalBytes: 600_000,
        resourceCount: 3,
        loadTimeMs: 400,
        images: [{ src: 'https://x/hero.png', bytes: 2_000_000, naturalWidth: 2800, naturalHeight: 2000, displayWidth: 540, displayHeight: 386, selector: 'img.hero', html: '<img>' }],
      },
      { pageUrl: 'https://x/' },
    );
    expect(f.rule).toBe('perf-large-image');
    expect(f.baseSeverity).toBe('high');
    expect(f.description).toMatch(/5\.2× larger than needed/);
  });
});
