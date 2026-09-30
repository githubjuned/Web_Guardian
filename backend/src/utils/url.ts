import dns from 'node:dns/promises';
import net from 'node:net';

export class UrlValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UrlValidationError';
  }
}

/** Synchronous structural validation: protocol, host, credentials, length. */
export function normalizeAuditUrl(input: unknown): URL {
  if (typeof input !== 'string' || input.trim() === '') {
    throw new UrlValidationError('Please enter a website URL.');
  }
  let raw = input.trim();
  if (raw.length > 2048) throw new UrlValidationError('That URL is too long.');
  // Friendly default: "example.com" → "https://example.com"
  if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) raw = `https://${raw}`;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UrlValidationError('That does not look like a valid URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UrlValidationError('Only http:// and https:// websites can be audited.');
  }
  if (!url.hostname) throw new UrlValidationError('The URL is missing a host name.');
  if (url.username || url.password) {
    throw new UrlValidationError('URLs containing credentials are not supported.');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const isIp = net.isIP(host) !== 0;
  if (!isIp && host !== 'localhost' && !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(host)) {
    throw new UrlValidationError('The URL host name is malformed.');
  }
  if (!isIp && host.split('.').some((label) => label.length === 0 || label.length > 63)) {
    throw new UrlValidationError('The URL host name is malformed.');
  }
  url.hash = '';
  return url;
}

export function isPrivateAddress(address: string): boolean {
  const ip = address.replace(/^\[|\]$/g, '').toLowerCase();
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  if (net.isIPv6(ip)) {
    if (ip === '::1' || ip === '::') return true;
    if (ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80')) return true;
    const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return false;
  }
  return false;
}

export function isLocalHostname(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || (net.isIP(host) !== 0 && isPrivateAddress(host));
}

export interface UrlPolicy {
  allowPrivate: boolean;
  /** Origins that are always allowed (e.g. this server's own demo sandbox). */
  trustedOrigins: string[];
}

/**
 * Full validation including DNS: blocks private / loopback / link-local targets
 * (SSRF protection) unless the origin is trusted or private URLs are allowed.
 */
export async function validateAuditUrl(input: unknown, policy: UrlPolicy): Promise<URL> {
  const url = normalizeAuditUrl(input);
  if (policy.allowPrivate || policy.trustedOrigins.includes(url.origin)) return url;

  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isLocalHostname(host)) {
    throw new UrlValidationError('Private or local network addresses cannot be audited.');
  }
  if (net.isIP(host) === 0) {
    let addresses: { address: string }[];
    try {
      addresses = await dns.lookup(host, { all: true });
    } catch {
      throw new UrlValidationError(`Could not resolve "${host}". Check the address and try again.`);
    }
    if (addresses.some((a) => isPrivateAddress(a.address))) {
      throw new UrlValidationError('Private or local network addresses cannot be audited.');
    }
  }
  return url;
}

/** Stable, comparable path for a page URL (used in fingerprints). */
export function pageKey(pageUrl: string): string {
  try {
    const u = new URL(pageUrl);
    let p = u.pathname.replace(/\/index\.html?$/i, '/');
    if (p.length > 1) p = p.replace(/\/$/, '');
    // Sandbox copies of the demo site share fingerprints with each other.
    p = p.replace(/^\/sandbox\/[^/]+/, '').replace(/^\/demo/, '') || '/';
    return p + u.search;
  } catch {
    return pageUrl;
  }
}
