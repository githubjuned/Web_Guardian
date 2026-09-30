/** Same-origin link discovery for the limited MVP crawl. */
import type { Page } from 'playwright';

const SKIP_EXTENSIONS = /\.(pdf|zip|gz|rar|7z|dmg|exe|msi|png|jpe?g|gif|webp|avif|svg|ico|mp4|webm|mov|mp3|wav|css|js|json|xml|txt|csv|docx?|xlsx?|pptx?)$/i;
const SKIP_PATHS = /(logout|signout|sign-out|log-out|wp-admin|\/cart\/add|\/checkout)/i;

export function normalizeCandidate(href: string, origin: string): string | null {
  try {
    const u = new URL(href);
    if (u.origin !== origin) return null;
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (SKIP_EXTENSIONS.test(u.pathname) || SKIP_PATHS.test(u.pathname)) return null;
    u.hash = '';
    return u.href;
  } catch {
    return null;
  }
}

export async function discoverLinks(page: Page, origin: string): Promise<string[]> {
  const hrefs = await page.$$eval('a[href]', (as) => as.map((a) => (a as HTMLAnchorElement).href));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const href of hrefs) {
    const n = normalizeCandidate(href, origin);
    if (n && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

/** Treat "/", "/index.html" and "/?" as the same page. */
export function samePage(a: string, b: string): boolean {
  const norm = (s: string) => {
    const u = new URL(s);
    u.hash = '';
    u.pathname = u.pathname.replace(/\/index\.html?$/i, '/');
    return u.href.replace(/\/$/, '');
  };
  try {
    return norm(a) === norm(b);
  } catch {
    return a === b;
  }
}
