/**
 * Audit lifecycle: queue → scan (browser + personas + detectors) → issues →
 * Gemini analysis → report, plus deterministic re-test verification.
 *
 * State machine: queued → initializing → crawling ⇄ testing → analyzing →
 * generating_report → completed → (verifying → verified) | failed
 */
import type { Audit, AuditStatus, AuditVerification, Category, DetectorName, DetectorState, Issue } from '@webguardian/shared';
import { config } from '../config';
import {
  getAudit,
  insertAudit,
  insertIssues,
  insertVerification,
  listIssues,
  updateAudit,
  updateIssue,
} from '../database/repository';
import { publishAudit, publishEvent } from '../events/bus';
import { runScan, type ScanResult } from '../agents/orchestrator';
import { buildIssues, fingerprintOf, screenshotUrl } from './issueFactory';
import { computeScores, countSeverities } from './scoring';
import { sandboxExists, sandboxIdFromUrl } from './sandboxService';
import { aiAvailable, explainRuleGroups, summarizeAudit } from '../ai/service';
import { AiUnavailableError } from '../ai/gemini';
import { newId, nowIso } from '../utils/ids';
import { errorMessage, logger } from '../utils/logger';

/* ------------------------------------------------------------ job queue */

const queue: (() => Promise<void>)[] = [];
let running = 0;

function enqueue(job: () => Promise<void>) {
  queue.push(job);
  pump();
}

function pump() {
  while (running < config.maxConcurrentAudits && queue.length > 0) {
    const job = queue.shift()!;
    running++;
    job()
      .catch((err) => logger.error('Job crashed', { error: errorMessage(err) }))
      .finally(() => {
        running--;
        pump();
      });
  }
}

export function queueStats() {
  return { running, waiting: queue.length, capacity: config.maxConcurrentAudits };
}

const runningJobs = new Set<Promise<void>>();
/** Resolves when all in-flight jobs finish (used by tests). */
export async function waitForIdle() {
  while (running > 0 || queue.length > 0) await new Promise((r) => setTimeout(r, 100));
  await Promise.all(runningJobs);
}

/* ------------------------------------------------------------- helpers */

export function trustedOrigins(): string[] {
  const origins = new Set<string>([new URL(config.publicBaseUrl).origin, `http://localhost:${config.port}`, `http://127.0.0.1:${config.port}`]);
  return [...origins];
}

function setStatus(id: string, patch: Partial<Audit>) {
  const audit = updateAudit(id, patch);
  publishAudit(audit);
  return audit;
}

function unavailableCategories(result: ScanResult): Partial<Record<Category, boolean>> {
  const e = result.detectorErrors;
  return {
    accessibility: !!e['axe-core'] && !!e['keyboard-persona'],
    seo: !!e.seo,
    performance: !!e.performance && !result.lighthouse,
    functionality: !!e.functionality,
    ux: !!e['mobile-ux'] && !!e.seo,
  };
}

function scanCallbacks(auditId: string, detectors: Partial<Record<DetectorName, DetectorState>>, trackStatus: boolean) {
  let lastStatus: AuditStatus | undefined;
  return {
    log: (type: 'step' | 'action' | 'warning' | 'issue' | 'error', message: string, metadata?: Record<string, unknown>) =>
      publishEvent(auditId, type, message, metadata),
    onProgress: (progress: number, stage: string, status?: AuditStatus) => {
      const patch: Partial<Audit> = { progress, stage };
      if (trackStatus && status && status !== lastStatus) {
        patch.status = status;
        lastStatus = status;
      }
      setStatus(auditId, patch);
    },
    onDetector: (name: DetectorName, state: DetectorState) => {
      // A detector that failed once stays marked as failed (partial results).
      if (detectors[name] === 'failed' && state === 'completed') return;
      if (detectors[name] === state) return;
      detectors[name] = state;
      setStatus(auditId, { detectors: { ...detectors } });
    },
  };
}

/* --------------------------------------------------------------- audits */

export function createAudit(url: string, maxPages: number): Audit {
  const sandboxId = sandboxIdFromUrl(url, trustedOrigins());
  const audit = insertAudit({ id: newId('audit'), url, maxPages, status: 'queued', sandboxId });
  publishEvent(audit.id, 'status', `Audit queued for ${url}`, { maxPages });
  enqueue(async () => {
    const job = runAudit(audit.id);
    runningJobs.add(job);
    await job.finally(() => runningJobs.delete(job));
  });
  return audit;
}

export async function runAudit(id: string): Promise<void> {
  const audit = getAudit(id);
  if (!audit) return;
  const detectors: Partial<Record<DetectorName, DetectorState>> = {};
  const callbacks = scanCallbacks(id, detectors, true);
  const started = Date.now();
  try {
    if (audit.sandboxId && !(await sandboxExists(audit.sandboxId))) {
      throw new Error('This demo sandbox has expired. Start a new demo audit.');
    }
    setStatus(id, { status: 'initializing', progress: 3, stage: 'Starting the AI agent' });
    publishEvent(id, 'status', 'AI agent active — planning the test session', {
      plan: ['Crawl up to ' + audit.maxPages + ' pages', 'Screen-reader, low-vision, keyboard, slow-device and first-time-visitor personas', 'Collect evidence', 'Gemini analysis'],
    });

    const result = await runScan({
      auditId: id,
      startUrl: audit.url,
      maxPages: audit.maxPages,
      shotPrefix: '',
      lighthouse: true,
      trustedOrigins: trustedOrigins(),
      deadline: started + config.auditTimeoutMs,
      ...callbacks,
    });

    setStatus(id, { status: 'analyzing', progress: 86, stage: 'Prioritising findings' });
    const issues = buildIssues(id, result.findings, result.pages.find((p) => p.status === 'scanned')?.url ?? audit.url);
    insertIssues(issues);
    const scores = computeScores(issues, unavailableCategories(result));
    const counts = countSeverities(issues);
    let current = setStatus(id, {
      pages: result.pages.map((p) => ({ ...p, screenshot: screenshotUrl(p.screenshot) })),
      scoresBefore: scores,
      issueCounts: counts,
      totalIssues: issues.length,
      lighthouse: result.lighthouse,
    });
    publishEvent(id, 'step', `✓ ${issues.length} evidence-backed issues found (${counts.critical} critical, ${counts.high} high, ${counts.medium} medium, ${counts.low} low)`, {
      counts,
    });

    await runAiAnalysis(current, issues);

    current = setStatus(id, { status: 'generating_report', progress: 96, stage: 'Generating report' });
    const seconds = Math.round((Date.now() - started) / 1000);
    setStatus(id, { status: 'completed', progress: 100, stage: `Completed in ${seconds}s` });
    publishEvent(id, 'done', `Audit complete in ${seconds}s — ${issues.length} issues across ${result.pages.filter((p) => p.status === 'scanned').length} page(s)`);
  } catch (err) {
    const message = errorMessage(err).split('\n')[0];
    logger.error('Audit failed', { id, error: message });
    setStatus(id, { status: 'failed', error: message, stage: 'Audit failed' });
    publishEvent(id, 'error', `Audit failed: ${message}`);
  }
}

/** Gemini explains, prioritises and summarises. Failure never breaks the audit. */
async function runAiAnalysis(audit: Audit, issues: Issue[]) {
  const id = audit.id;
  if (!aiAvailable()) {
    setStatus(id, { aiStatus: 'unavailable', aiError: 'Gemini is not configured on this server (GEMINI_API_KEY missing).' });
    publishEvent(id, 'warning', 'AI explanation temporarily unavailable — showing deterministic results');
    return;
  }
  if (issues.length === 0) {
    setStatus(id, { aiStatus: 'available' });
    return;
  }
  setStatus(id, { progress: 88, stage: 'Gemini is analysing the evidence' });
  publishEvent(id, 'ai', `Sending ${issues.length} evidence-backed findings to Gemini (backend)…`);
  let failures = 0;
  try {
    const explanations = await explainRuleGroups(audit, issues);
    for (const issue of issues) {
      const ai = explanations.get(issue.rule);
      if (ai) {
        updateIssue(issue.id, { ai });
        issue.ai = ai;
      }
    }
    publishEvent(id, 'ai', `✓ Gemini explained ${explanations.size} issue types in plain language`);
  } catch (err) {
    failures++;
    publishEvent(id, 'warning', `AI explanation temporarily unavailable: ${errorMessage(err)}`);
  }
  try {
    setStatus(id, { progress: 92, stage: 'Gemini is prioritising fixes' });
    const summary = await summarizeAudit(getAudit(id)!, issues);
    setStatus(id, { aiSummary: summary });
    publishEvent(id, 'ai', '✓ Gemini prioritised what to fix first', { topPriorities: summary.topPriorities.length });
  } catch (err) {
    failures++;
    publishEvent(id, 'warning', `AI summary temporarily unavailable: ${errorMessage(err)}`);
  }
  setStatus(id, failures === 2 ? { aiStatus: 'unavailable', aiError: 'Gemini did not respond. Deterministic results are still valid.' } : { aiStatus: 'available', aiError: null });
}

export async function retryAiAnalysis(id: string) {
  const audit = getAudit(id);
  if (!audit) return;
  if (!aiAvailable()) throw new AiUnavailableError('Gemini is not configured on this server.');
  await runAiAnalysis(audit, listIssues(id));
}

/* --------------------------------------------------------- verification */

const VERIFIABLE: AuditStatus[] = ['completed', 'verified'];

export function startAuditVerification(id: string): Audit {
  const audit = getAudit(id);
  if (!audit) throw new Error('Audit not found');
  if (!VERIFIABLE.includes(audit.status)) throw new Error(`An audit can only be verified once it has completed (current status: ${audit.status}).`);
  const updated = setStatus(id, { status: 'verifying', progress: 0, stage: 'Re-testing the website' });
  publishEvent(id, 'status', 'Verification started — re-running the same tests on the same pages');
  enqueue(async () => {
    const job = runAuditVerification(id);
    runningJobs.add(job);
    await job.finally(() => runningJobs.delete(job));
  });
  return updated;
}

async function runAuditVerification(id: string) {
  const audit = getAudit(id)!;
  const verId = newId('ver');
  const detectors: Partial<Record<DetectorName, DetectorState>> = {};
  const callbacks = scanCallbacks(id, detectors, false);
  try {
    const pages = audit.pages.filter((p) => p.status === 'scanned').map((p) => p.url);
    const result = await runScan({
      auditId: id,
      startUrl: audit.url,
      maxPages: pages.length,
      fixedPages: pages,
      shotPrefix: `${verId}-`,
      lighthouse: !!audit.lighthouse,
      trustedOrigins: trustedOrigins(),
      deadline: Date.now() + config.auditTimeoutMs,
      ...callbacks,
    });
    const before = listIssues(id);
    const after = buildIssues(id, result.findings, pages[0] ?? audit.url);
    const afterFingerprints = new Set(after.map((i) => i.fingerprint));
    const beforeFingerprints = new Set(before.map((i) => i.fingerprint));
    const resolved = before.filter((i) => !afterFingerprints.has(i.fingerprint));
    const remaining = before.filter((i) => afterFingerprints.has(i.fingerprint));
    const newIssues = after.filter((i) => !beforeFingerprints.has(i.fingerprint));

    for (const i of resolved) updateIssue(i.id, { status: 'resolved' });
    for (const i of remaining) {
      if (i.status === 'resolved' || i.status === 'fix_applied') updateIssue(i.id, { status: 'still_present' });
    }

    const scoresBefore = audit.scoresBefore ?? computeScores(before);
    const scoresAfter = computeScores(after, unavailableCategories(result));
    const verification: AuditVerification = {
      id: verId,
      scoresBefore,
      scoresAfter,
      issuesBefore: before.length,
      issuesAfter: after.length,
      resolved: resolved.length,
      remaining: remaining.length,
      newIssues: newIssues.length,
      resolvedIssueIds: resolved.map((i) => i.id),
      newIssueTitles: newIssues.slice(0, 10).map((i) => `${i.title} (${new URL(i.pageUrl).pathname})`),
      pagesAfter: result.pages.map((p) => ({ ...p, screenshot: screenshotUrl(p.screenshot) })),
      createdAt: nowIso(),
    };
    insertVerification({
      id: verId,
      issueId: null,
      auditId: id,
      beforeResult: { scores: scoresBefore, issues: before.length },
      afterResult: { scores: scoresAfter, issues: after.length, resolved: resolved.length, newIssues: newIssues.length },
      status: 'completed',
      createdAt: verification.createdAt,
    });
    setStatus(id, {
      status: 'verified',
      progress: 100,
      stage: 'Verification complete',
      scoresAfter,
      resolvedIssues: resolved.length,
      lastVerification: verification,
    });
    publishEvent(
      id,
      'done',
      `Verification complete: ${before.length} → ${after.length} issues · ${resolved.length} resolved · ${remaining.length} remaining${newIssues.length ? ` · ${newIssues.length} new` : ''}`,
      { resolved: resolved.length, remaining: remaining.length, newIssues: newIssues.length },
    );
  } catch (err) {
    const message = errorMessage(err).split('\n')[0];
    setStatus(id, { status: 'completed', stage: `Verification failed: ${message}` });
    publishEvent(id, 'error', `Verification failed: ${message}`);
  }
}

/** Re-runs the tests for a single issue's page and checks whether that exact finding is still present. */
export async function verifyIssue(issue: Issue) {
  const audit = getAudit(issue.auditId)!;
  const verId = newId('ver');
  publishEvent(audit.id, 'status', `Verifying issue #${issue.number}: re-testing ${issue.pageUrl}`);
  const isLighthouse = issue.detectedBy === 'Lighthouse';
  const result = await runScan({
    auditId: audit.id,
    startUrl: audit.url,
    maxPages: 1,
    fixedPages: [issue.pageUrl],
    shotPrefix: `${verId}-`,
    lighthouse: isLighthouse,
    trustedOrigins: trustedOrigins(),
    deadline: Date.now() + config.auditTimeoutMs,
    skipKeyboard: issue.persona !== 'keyboard',
    skipMobile: issue.rule !== 'ux-horizontal-overflow',
    log: (type, message) => publishEvent(audit.id, type, message),
    onProgress: () => undefined,
    onDetector: () => undefined,
  });
  const page = result.pages.find((p) => p.status === 'scanned');
  if (!page) throw new Error(result.pages[0]?.error ?? 'The page could not be loaded for verification.');
  const matching = result.findings.filter((f) => fingerprintOf(f) === issue.fingerprint);
  const sameRule = result.findings.filter((f) => f.rule === issue.rule);
  const status = matching.length === 0 ? 'resolved' : 'still_present';
  const beforePage = audit.pages.find((p) => p.url === issue.pageUrl);
  const outcome = {
    id: verId,
    issueId: issue.id,
    status,
    before: {
      present: true,
      evidence: issue.description,
      screenshot: beforePage?.screenshot ?? issue.screenshotPath,
      pageFindings: listIssues(audit.id).filter((i) => i.pageUrl === issue.pageUrl).length,
    },
    after: {
      present: matching.length > 0,
      evidence: matching[0]?.description ?? `The "${issue.rule}" check no longer reports this problem.`,
      screenshot: screenshotUrl(matching[0]?.screenshotPath ?? page.screenshot),
      sameRuleElsewhere: sameRule.length - matching.length,
      pageFindings: new Set(result.findings.map((f) => fingerprintOf(f))).size,
    },
    checkedBy: issue.detectedBy,
    createdAt: nowIso(),
  } as const;
  insertVerification({
    id: verId,
    issueId: issue.id,
    auditId: audit.id,
    beforeResult: outcome.before,
    afterResult: outcome.after,
    status,
    createdAt: outcome.createdAt,
  });
  updateIssue(issue.id, { status });
  const resolvedCount = listIssues(audit.id).filter((i) => i.status === 'resolved').length;
  setStatus(audit.id, { resolvedIssues: resolvedCount });
  publishEvent(
    audit.id,
    status === 'resolved' ? 'done' : 'warning',
    status === 'resolved'
      ? `✓ Issue #${issue.number} verified as RESOLVED — ${issue.detectedBy} no longer detects it`
      : `✗ Issue #${issue.number} is STILL PRESENT after re-testing`,
  );
  return outcome;
}
