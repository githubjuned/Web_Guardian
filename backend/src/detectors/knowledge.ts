/**
 * Plain-language knowledge base for the rules WebGuardian detects.
 * This is the deterministic baseline explanation shown for every issue.
 * Gemini, when available, adds a tailored explanation on top of it.
 */
import type { Persona } from '@webguardian/shared';

export interface RuleKnowledge {
  affectedUsers: string;
  whyItMatters: string;
  howToFix: string;
}

const PERSONA_DEFAULTS: Record<Persona, RuleKnowledge> = {
  keyboard: {
    affectedUsers: 'Keyboard-only users, including people with motor disabilities and power users.',
    whyItMatters: 'If something cannot be reached or operated with the keyboard, these visitors cannot complete their task at all.',
    howToFix: 'Make every interactive element reachable with Tab, operable with Enter/Space, and give it a visible focus style.',
  },
  'screen-reader': {
    affectedUsers: 'Blind and low-vision visitors using screen readers such as NVDA, JAWS or VoiceOver.',
    whyItMatters: 'Screen readers rely on the page structure and accessible names. Missing information leaves these users guessing.',
    howToFix: 'Use semantic HTML and give every control, image and form field an accessible name.',
  },
  'low-vision': {
    affectedUsers: 'Visitors with low vision, colour-vision deficiencies, older users and anyone reading in bright sunlight.',
    whyItMatters: 'Text that does not stand out from its background is hard or impossible to read.',
    howToFix: 'Increase the contrast between text and background to at least 4.5:1 (3:1 for large text).',
  },
  'slow-device': {
    affectedUsers: 'Mobile visitors on slow networks or low-end devices.',
    whyItMatters: 'Slow pages lose visitors — many leave if a page takes more than a few seconds to show content.',
    howToFix: 'Reduce the amount of data the page downloads and defer anything not needed for the first view.',
  },
  'first-time-visitor': {
    affectedUsers: 'First-time visitors arriving from search engines or shared links.',
    whyItMatters: 'Search engines and social networks use this information to decide how (and whether) to show your page.',
    howToFix: 'Add the missing page metadata and a clear page structure.',
  },
};

const RULES: Record<string, Partial<RuleKnowledge>> = {
  'button-name': {
    affectedUsers: 'Screen-reader users and voice-control users (who say the button name to click it).',
    whyItMatters: 'The button is announced only as "button" — users cannot tell what it does.',
    howToFix: 'Add visible text or an aria-label (e.g. aria-label="Open menu") to the button.',
  },
  'link-name': {
    whyItMatters: 'The link is announced without a destination, so users cannot decide whether to follow it.',
    howToFix: 'Give the link descriptive text or an aria-label.',
  },
  'image-alt': {
    whyItMatters: 'Screen readers announce the file name or skip the image, so its meaning is lost.',
    howToFix: 'Add an alt attribute describing the image, or alt="" if it is purely decorative.',
  },
  'color-contrast': {
    howToFix: 'Darken the text colour (or lighten the background) until the contrast ratio is at least 4.5:1.',
  },
  label: {
    whyItMatters: 'Placeholder text disappears while typing and is not a reliable label; screen readers may announce just "edit text".',
    howToFix: 'Add a <label for="..."> element (it can be visually hidden) or an aria-label to each form field.',
  },
  'label-placeholder-only': {
    whyItMatters: 'Placeholder text vanishes while typing, has low contrast, and is not reliably announced — users forget what the field was for.',
    howToFix: 'Add a visible <label for="..."> (or at least an aria-label) and keep the placeholder only as an example.',
  },
  'select-name': {
    howToFix: 'Associate a <label> with the select element.',
  },
  'heading-order': {
    whyItMatters: 'Screen-reader users navigate by headings; skipped levels make the page outline confusing.',
    howToFix: 'Use heading levels in order (h1 → h2 → h3) without skipping levels.',
  },
  region: {
    whyItMatters: 'Landmarks let screen-reader users jump straight to the main content, navigation or footer.',
    howToFix: 'Place all content inside landmarks such as <header>, <nav>, <main> and <footer>.',
  },
  'landmark-one-main': { howToFix: 'Wrap the primary content of the page in a single <main> element.' },
  'html-has-lang': { howToFix: 'Add a lang attribute to the <html> element, e.g. <html lang="en">.' },
  'keyboard-focus-trap': {
    affectedUsers: 'Keyboard-only users and screen-reader users who navigate with the Tab key.',
    whyItMatters: 'Focus is stuck in one part of the page, so these users cannot reach the navigation or content at all — the site is unusable for them.',
    howToFix: 'Do not intercept the Tab key. Use real <button> elements so Enter/Space work, and let Escape close the banner.',
  },
  'keyboard-nav-unreachable': {
    whyItMatters: 'Keyboard users cannot reach the main navigation, so they cannot move around the site.',
    howToFix: 'Make navigation links focusable and ensure nothing on the page captures or blocks Tab.',
  },
  'focus-not-visible': {
    whyItMatters: 'Without a visible focus indicator, keyboard users cannot see where they are on the page.',
    howToFix: 'Remove outline: none on :focus, or replace it with a clear :focus-visible style (e.g. a 2px outline).',
  },
  'seo-title-missing': {
    whyItMatters: 'The page title is shown in browser tabs and search results; without it the page looks broken and ranks poorly.',
    howToFix: 'Add a unique, descriptive <title> element (50–60 characters).',
  },
  'seo-title-length': { howToFix: 'Keep the title between roughly 10 and 65 characters so it is not truncated in search results.' },
  'seo-meta-description-missing': {
    whyItMatters: 'Search engines show the meta description under your link; without it they guess, often poorly, which lowers click-through.',
    howToFix: 'Add <meta name="description" content="..."> with a 120–160 character summary of the page.',
  },
  'seo-meta-description-length': { howToFix: 'Aim for a 50–160 character description.' },
  'seo-h1-missing': {
    affectedUsers: 'Search engines, first-time visitors and screen-reader users.',
    whyItMatters: 'The H1 tells search engines and assistive technology what the page is about.',
    howToFix: 'Mark up the main page headline as a single <h1> element.',
  },
  'seo-multiple-h1': { howToFix: 'Use a single H1 for the main page headline and H2+ for sections.' },
  'seo-open-graph-missing': {
    whyItMatters: 'Without Open Graph tags, links shared on social media show a poor or blank preview.',
    howToFix: 'Add og:title, og:description and og:image meta tags.',
  },
  'ux-viewport-missing': {
    affectedUsers: 'Mobile visitors.',
    whyItMatters: 'Without a viewport tag, mobile browsers render the desktop layout zoomed out and text becomes tiny.',
    howToFix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.',
  },
  'ux-horizontal-overflow': {
    affectedUsers: 'Mobile visitors.',
    whyItMatters: 'Content wider than the screen forces sideways scrolling and hides information.',
    howToFix: 'Find the element wider than the viewport and constrain it with max-width: 100% or responsive CSS.',
  },
  'perf-large-image': {
    whyItMatters: 'This single image makes the page download far more data than needed, delaying the first view on mobile.',
    howToFix: 'Resize the image to its displayed size, compress it and serve a modern format (WebP/AVIF or JPEG).',
  },
  'perf-page-weight': { howToFix: 'Compress images, remove unused scripts and lazy-load content below the fold.' },
  'perf-slow-lcp': { howToFix: 'Optimise the largest above-the-fold element (usually the hero image) and reduce render-blocking resources.' },
  'perf-layout-shift': { howToFix: 'Reserve space for images and embeds with width/height attributes or aspect-ratio.' },
  'broken-link': {
    affectedUsers: 'Every visitor who clicks the link, plus search engine crawlers.',
    whyItMatters: 'Broken links are a dead end: visitors lose trust and search engines treat the site as poorly maintained.',
    howToFix: 'Point the link to an existing page or remove it.',
  },
  'broken-anchor': {
    affectedUsers: 'Every visitor who clicks the link.',
    whyItMatters: 'The link points to a section that does not exist, so nothing happens when it is clicked.',
    howToFix: 'Add the missing element id or update the link target.',
  },
  'broken-resource': {
    affectedUsers: 'Every visitor.',
    whyItMatters: 'A file the page depends on (image, script or stylesheet) failed to load, so part of the page is broken.',
    howToFix: 'Restore the missing file or update the reference.',
  },
  'js-runtime-error': {
    affectedUsers: 'Every visitor.',
    whyItMatters: 'An uncaught JavaScript error can stop features (menus, forms, widgets) from working.',
    howToFix: 'Fix or guard the failing code path so it does not throw on page load.',
  },
};

export function knowledgeFor(rule: string, persona: Persona): RuleKnowledge {
  const base = PERSONA_DEFAULTS[persona];
  const specific = RULES[rule] ?? {};
  return {
    affectedUsers: specific.affectedUsers ?? base.affectedUsers,
    whyItMatters: specific.whyItMatters ?? base.whyItMatters,
    howToFix: specific.howToFix ?? base.howToFix,
  };
}

export const PERSONA_LABELS: Record<Persona, string> = {
  keyboard: 'keyboard-only users',
  'screen-reader': 'screen-reader users',
  'low-vision': 'low-vision users',
  'slow-device': 'visitors on slow devices',
  'first-time-visitor': 'first-time visitors and search engines',
};
