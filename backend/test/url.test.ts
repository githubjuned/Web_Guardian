import { describe, expect, it } from 'vitest';
import { isPrivateAddress, normalizeAuditUrl, pageKey, UrlValidationError, validateAuditUrl } from '../src/utils/url';

describe('URL validation', () => {
  it('accepts http and https URLs and strips the hash', () => {
    expect(normalizeAuditUrl('https://example.com/about#team').href).toBe('https://example.com/about');
    expect(normalizeAuditUrl('http://example.com').protocol).toBe('http:');
  });

  it('adds https:// when the protocol is omitted', () => {
    expect(normalizeAuditUrl('example.com').href).toBe('https://example.com/');
  });

  it.each(['file:///etc/passwd', 'javascript:alert(1)', 'ftp://example.com', 'data:text/html,hi', 'chrome://settings'])(
    'rejects non-http protocol %s',
    (url) => {
      expect(() => normalizeAuditUrl(url)).toThrow(UrlValidationError);
    },
  );

  it.each(['', '   ', 'https://', 'http://exa mple.com', 'https://-.', 'https://foo..com', 'not a url at all'])('rejects malformed URL %j', (url) => {
    expect(() => normalizeAuditUrl(url)).toThrow(UrlValidationError);
  });

  it('rejects URLs with embedded credentials', () => {
    expect(() => normalizeAuditUrl('https://user:pass@example.com')).toThrow(/credentials/);
  });

  it('rejects non-string input and overly long URLs', () => {
    expect(() => normalizeAuditUrl(42)).toThrow(UrlValidationError);
    expect(() => normalizeAuditUrl(`https://example.com/${'a'.repeat(2100)}`)).toThrow(/too long/);
  });

  it('identifies private and reserved addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.10', '172.16.5.4', '169.254.169.254', '0.0.0.0', '::1', 'fd00::1', '::ffff:127.0.0.1']) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '2606:4700::1111']) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });

  it('blocks private targets unless the origin is trusted (SSRF protection)', async () => {
    const policy = { allowPrivate: false, trustedOrigins: ['http://localhost:8080'] };
    await expect(validateAuditUrl('http://localhost:5432/', policy)).rejects.toThrow(/Private or local/);
    await expect(validateAuditUrl('http://169.254.169.254/latest/meta-data', policy)).rejects.toThrow(/Private or local/);
    await expect(validateAuditUrl('http://127.0.0.1:8080/', policy)).rejects.toThrow(/Private or local/);
    expect((await validateAuditUrl('http://localhost:8080/sandbox/sbx_abc/index.html', policy)).pathname).toContain('/sandbox/');
    expect((await validateAuditUrl('http://127.0.0.1:9000/', { ...policy, allowPrivate: true })).port).toBe('9000');
  });

  it('normalises page keys so sandbox copies and index pages compare equal', () => {
    expect(pageKey('http://localhost:8080/sandbox/sbx_0123456789/index.html')).toBe('/');
    expect(pageKey('http://localhost:8080/sandbox/sbx_0123456789/products.html')).toBe('/products.html');
    expect(pageKey('https://example.com/blog/')).toBe('/blog');
  });
});
