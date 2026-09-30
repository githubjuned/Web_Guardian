/**
 * The most important test: the complete WebGuardian loop through the real API.
 *
 *   URL → audit → browser → detection → Gemini (fake) → results
 *   → fix → approval → apply → re-test → before/after
 *
 * Only Gemini is replaced (by a deterministic fake with the same validation);
 * the browser, detectors, database and demo sandbox are all real.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Audit, Issue } from '@webguardian/shared';
import { FakeAi } from './fakeAi';
import { IssueSchema } from './issueSchema';

const PORT = 18931;
process.env.PORT = String(PORT);
process.env.PUBLIC_BASE_URL = `http://localhost:${PORT}`;
process.env.NODE_ENV = 'test';

const { config } = await import('../src/config');
const { createApp } = await import('../src/app');
const { setAi, GeminiClient } = await import('../src/ai/gemini');
const { waitForIdle } = await import('../src/services/auditService');
const { closeDb } = await import('../src/database/db');

const fake = new FakeAi();
let server: Server;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  fs.rmSync(config.dataDir, { recursive: true, force: true });
  setAi(fake);
  app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(PORT, () => resolve());
  });
});

afterAll(async () => {
  await waitForIdle();
  server?.close();
  closeDb();
  setAi(new GeminiClient('', 'none'));
});

describe('API basics', () => {
  it('reports health without exposing secrets', async () => {
    const res = await request(app).get('/api/health').expect(200);
    expect(res.body.status).toBe('ok');
    expect(JSON.stringify(res.body)).not.toMatch(/key/i);
  });

  it('rejects invalid URLs with a helpful message', async () => {
    expect((await request(app).post('/api/audits').send({ url: 'javascript:alert(1)' }).expect(400)).body.error).toMatch(/http/);
    expect((await request(app).post('/api/audits').send({}).expect(400)).body.error).toBeTruthy();
    await request(app).post('/api/audits').send({ url: 'https://example.com', maxPages: 50 }).expect(400);
  });

  it('returns 404 for unknown audits and issues', async () => {
    await request(app).get('/api/audits/audit_nope').expect(404);
    await request(app).post('/api/issues/issue_nope/fix').expect(404);
  });
});

describe('end-to-end audit of the demo site', () => {
  let audit: Audit;
  let issues: Issue[];
  let sandboxId: string;

  it('creates a sandbox and runs a real browser audit', async () => {
    const sbx = await request(app).post('/api/demo/sandbox').expect(201);
    sandboxId = sbx.body.sandboxId;
    expect(sbx.body.url).toBe(`http://localhost:${PORT}/sandbox/${sandboxId}/index.html`);

    const created = await request(app).post('/api/audits').send({ url: sbx.body.url, maxPages: 3 }).expect(202);
    expect(created.body).toMatchObject({ status: 'queued' });
    expect(created.body.auditId).toMatch(/^audit_/);

    await waitForIdle();
    audit = (await request(app).get(`/api/audits/${created.body.auditId}`).expect(200)).body;
    expect(audit.status).toBe('completed');
    expect(audit.progress).toBe(100);
    expect(audit.pages.filter((p) => p.status === 'scanned')).toHaveLength(3);
    expect(audit.pages.find((p) => p.url.endsWith('pricing.html'))).toMatchObject({ status: 'failed', httpStatus: 404 });
    expect(audit.detectors).toMatchObject({ 'axe-core': 'completed', 'keyboard-persona': 'completed', seo: 'completed' });
    expect(audit.scoresBefore!.accessibility).toBeLessThan(60);
  });

  it('stores evidence-backed issues for every planted problem', async () => {
    issues = (await request(app).get(`/api/audits/${audit.id}/issues`).expect(200)).body;
    for (const issue of issues) IssueSchema.parse(issue);
    const rules = new Set(issues.map((i) => i.rule));
    for (const planted of [
      'keyboard-focus-trap',
      'button-name',
      'image-alt',
      'seo-meta-description-missing',
      'seo-h1-missing',
      'color-contrast',
      'perf-large-image',
      'focus-not-visible',
      'broken-link',
      'js-runtime-error',
      'label-placeholder-only',
      'heading-order',
    ]) {
      expect(rules, planted).toContain(planted);
    }
    expect(audit.totalIssues).toBe(issues.length);

    const trap = issues.find((i) => i.rule === 'keyboard-focus-trap')!;
    expect(trap.number).toBe(1);
    expect(trap.severity).toBe('critical');
    expect(trap.selector).toBe('#cookie-banner');
    expect(trap.screenshotPath).toMatch(/^\/api\/screenshots\//);
    await request(app).get(trap.screenshotPath!).expect(200).expect('Content-Type', /jpeg/);
  });

  it('streams the live agent timeline over SSE', async () => {
    const res = await fetch(`http://localhost:${PORT}/api/audits/${audit.id}/events`);
    const reader = res.body!.getReader();
    let text = '';
    while (!text.includes('Audit complete')) text += new TextDecoder().decode((await reader.read()).value);
    await reader.cancel();
    expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);
    expect(text).toContain('event: audit');
    expect(text).toMatch(/Pressing Tab \(\d+\)/);
    expect(text).toContain('ISSUE FOUND: keyboard focus is trapped');
  });

  it('has Gemini explanations and a grounded summary', async () => {
    expect(audit.aiStatus).toBe('available');
    expect(audit.aiSummary!.topPriorities).toEqual([{ issueId: issues[0].id, reason: expect.any(String) }]);
    expect(issues.every((i) => i.ai !== null)).toBe(true);
    const explained = await request(app).post(`/api/issues/${issues[0].id}/explain`).expect(200);
    expect(explained.body.ai.beginnerExplanation).toBeTruthy();
  });

  it('answers chat only from audit data and drops invented citations', async () => {
    const res = await request(app).post(`/api/audits/${audit.id}/chat`).send({ question: 'What should I fix first?' }).expect(200);
    expect(res.body.content).toMatch(/#1/);
    expect(res.body.citedIssueIds).toEqual([issues[0].id]);
    const off = await request(app).post(`/api/audits/${audit.id}/chat`).send({ question: "What's the weather?" }).expect(200);
    expect(off.body.content).toBe("I don't have evidence for that in this audit.");
  });

  it('generates a fix, requires approval, applies it, and verifies the trap is gone', async () => {
    const trap = issues.find((i) => i.rule === 'keyboard-focus-trap')!;
    const proposed = (await request(app).post(`/api/issues/${trap.id}/fix`).expect(200)).body as Issue;
    expect(proposed.status).toBe('fix_proposed');
    expect(proposed.fix).toMatchObject({ file: 'app.js', applicable: true, risk: 'low', source: 'gemini' });
    expect(proposed.fix!.diff).toContain("-      event.preventDefault();");

    // Nothing is applied without explicit approval.
    await request(app).post(`/api/issues/${trap.id}/apply`).send({}).expect(400);
    const appJs = path.join(config.sandboxDir, sandboxId, 'app.js');
    expect(fs.readFileSync(appJs, 'utf8')).toContain('event.preventDefault()');

    const applied = (await request(app).post(`/api/issues/${trap.id}/apply`).send({ approved: true }).expect(200)).body as Issue;
    expect(applied.status).toBe('fix_applied');
    expect(fs.readFileSync(appJs, 'utf8')).not.toContain('event.preventDefault()');
    await request(app).post(`/api/issues/${trap.id}/apply`).send({ approved: true }).expect(409);

    const verified = (await request(app).post(`/api/issues/${trap.id}/verify`).expect(200)).body;
    expect(verified.verification.status).toBe('resolved');
    expect(verified.issue.status).toBe('resolved');
  });

  it('a rejected fix is not applied', async () => {
    const h1 = issues.find((i) => i.rule === 'seo-meta-description-missing' && i.pageUrl.endsWith('index.html'))!;
    await request(app).post(`/api/issues/${h1.id}/fix`).expect(200);
    const rejected = (await request(app).post(`/api/issues/${h1.id}/reject`).expect(200)).body as Issue;
    expect(rejected.status).toBe('fix_rejected');
    expect(fs.readFileSync(path.join(config.sandboxDir, sandboxId, 'index.html'), 'utf8')).not.toContain('name="description"');
  });

  it('re-tests the whole site and reports before/after', async () => {
    const meta = issues.find((i) => i.rule === 'seo-meta-description-missing' && i.pageUrl.endsWith('index.html'))!;
    await request(app).post(`/api/issues/${meta.id}/fix`).expect(200);
    await request(app).post(`/api/issues/${meta.id}/apply`).send({ approved: true }).expect(200);

    await request(app).post(`/api/audits/${audit.id}/verify`).expect(202);
    await waitForIdle();
    const after = (await request(app).get(`/api/audits/${audit.id}`).expect(200)).body as Audit;
    expect(after.status).toBe('verified');
    const v = after.lastVerification!;
    expect(v.issuesBefore).toBe(issues.length);
    expect(v.resolved).toBeGreaterThanOrEqual(2);
    expect(v.issuesAfter).toBe(v.issuesBefore - v.resolved + v.newIssues);
    expect(after.scoresAfter!.seo!).toBeGreaterThan(after.scoresBefore!.seo!);
    expect(after.scoresAfter!.accessibility!).toBeGreaterThan(after.scoresBefore!.accessibility!);

    const finalIssues = (await request(app).get(`/api/audits/${audit.id}/issues`).expect(200)).body as Issue[];
    expect(finalIssues.find((i) => i.id === meta.id)!.status).toBe('resolved');

    const report = (await request(app).get(`/api/audits/${audit.id}/report`).expect(200)).body;
    expect(report.verifications.length).toBeGreaterThanOrEqual(2);
  });
});
