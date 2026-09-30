/** Client-side URL validation (the backend validates again, including SSRF checks). */
export function validateWebsiteUrl(input: string): { ok: true; url: string } | { ok: false; error: string } {
  const raw = input.trim();
  if (!raw) return { ok: false, error: 'Please enter a website URL.' };
  const withProtocol = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    return { ok: false, error: 'That does not look like a valid URL.' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, error: 'Only http:// and https:// websites can be audited.' };
  }
  const host = url.hostname;
  if (!host || /\s/.test(raw) || (!host.includes('.') && host !== 'localhost') || host.split('.').some((p) => !p)) {
    return { ok: false, error: 'The address is missing a valid domain (for example: example.com).' };
  }
  if (url.username || url.password) return { ok: false, error: 'URLs containing credentials are not supported.' };
  return { ok: true, url: url.href };
}
