/**
 * Regression test for real-world sites (e.g. heavy college/business homepages) where a
 * tracker or image never finishes loading. The audit must still complete instead of
 * waiting for the page's "load" event until the navigation timeout.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PRIVATE_HOST_PATTERN, runScan } from '../src/agents/orchestrator';

let server: http.Server;
let origin = '';

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url?.startsWith('/hang')) {
      res.writeHead(200, { 'Content-Type': 'image/png' }); // never ends
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<!doctype html><html lang="en"><head><title>Slow Institute Homepage</title></head><body>
      <nav><a href="/">Home</a></nav><main><h1>Admissions open</h1><button><svg width="10" height="10"></svg></button>
      <img src="/hang.png" width="10" height="10"></main></body></html>`);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.closeAllConnections();
  server.close();
});

describe('sites with never-ending resources', () => {
  it('completes the audit, shows a live frame early and still finds real issues', async () => {
    const logs: string[] = [];
    const started = Date.now();
    const result = await runScan({
      auditId: 'slow-site-test',
      startUrl: `${origin}/`,
      maxPages: 1,
      shotPrefix: '',
      lighthouse: false,
      trustedOrigins: [origin],
      deadline: Date.now() + 180_000,
      log: (_t, m) => logs.push(m),
      onProgress: () => undefined,
      onDetector: () => undefined,
    });
    expect(result.pages[0]).toMatchObject({ status: 'scanned', title: 'Slow Institute Homepage' });
    expect(result.pages[0].screenshot).toBeTruthy();
    expect(result.findings.map((f) => f.rule)).toContain('button-name');
    expect(logs.join('\n')).toMatch(/still loading after 10s — stopped them/);
    expect(Date.now() - started).toBeLessThan(90_000);
  }, 180_000);
});

describe('private-address request pattern (SSRF guard)', () => {
  it.each([
    'http://localhost:5432/x',
    'http://127.0.0.1/',
    'http://10.0.0.5/admin',
    'http://192.168.1.1/',
    'http://172.20.0.1/',
    'http://169.254.169.254/latest/meta-data',
    'http://metadata.google.internal/computeMetadata',
    'http://[::1]:8080/',
  ])('intercepts %s', (url) => expect(PRIVATE_HOST_PATTERN.test(url)).toBe(true));

  it.each(['https://niatindia.com/', 'https://www.google-analytics.com/g/collect', 'https://172.217.0.1/', 'https://cdn.example.com/10.0.0.1.js'])(
    'lets public request %s through without interception',
    (url) => expect(PRIVATE_HOST_PATTERN.test(url)).toBe(false),
  );
});
