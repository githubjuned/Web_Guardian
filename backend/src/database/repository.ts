import type {
  Audit,
  AuditEvent,
  Issue,
  Verification,
  SeverityCounts,
} from '@webguardian/shared';
import { getDb, fromJson, toJson } from './db';
import { nowIso } from '../utils/ids';

type Row = Record<string, unknown>;
const EMPTY_COUNTS: SeverityCounts = { critical: 0, high: 0, medium: 0, low: 0 };

/* ----------------------------------------------------------------- audits */

function rowToAudit(r: Row): Audit {
  return {
    id: r.id as string,
    url: r.url as string,
    maxPages: r.max_pages as number,
    status: r.status as Audit['status'],
    progress: r.progress as number,
    stage: r.stage as string,
    pages: fromJson(r.pages, []),
    scoresBefore: fromJson(r.scores_before, null),
    scoresAfter: fromJson(r.scores_after, null),
    issueCounts: fromJson(r.issue_counts, EMPTY_COUNTS),
    totalIssues: r.total_issues as number,
    resolvedIssues: r.resolved_issues as number,
    detectors: fromJson(r.detectors, {}),
    aiSummary: fromJson(r.ai_summary, null),
    lighthouse: fromJson(r.lighthouse, null),
    aiStatus: r.ai_status as Audit['aiStatus'],
    aiError: (r.ai_error as string | null) ?? null,
    sandboxId: (r.sandbox_id as string | null) ?? null,
    lastVerification: fromJson(r.last_verification, null),
    error: (r.error as string | null) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export function insertAudit(a: Pick<Audit, 'id' | 'url' | 'maxPages' | 'status' | 'sandboxId'>): Audit {
  const ts = nowIso();
  getDb()
    .prepare(
      `INSERT INTO audits (id, url, max_pages, status, sandbox_id, stage, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'Waiting for an available agent', ?, ?)`,
    )
    .run(a.id, a.url, a.maxPages, a.status, a.sandboxId, ts, ts);
  return getAudit(a.id)!;
}

export function getAudit(id: string): Audit | null {
  const row = getDb().prepare('SELECT * FROM audits WHERE id = ?').get(id) as Row | undefined;
  return row ? rowToAudit(row) : null;
}

export function listAudits(limit = 20): Audit[] {
  return (getDb().prepare('SELECT * FROM audits ORDER BY created_at DESC LIMIT ?').all(limit) as Row[]).map(rowToAudit);
}

const AUDIT_COLUMNS: Record<string, { col: string; json?: boolean }> = {
  status: { col: 'status' },
  progress: { col: 'progress' },
  stage: { col: 'stage' },
  pages: { col: 'pages', json: true },
  scoresBefore: { col: 'scores_before', json: true },
  scoresAfter: { col: 'scores_after', json: true },
  issueCounts: { col: 'issue_counts', json: true },
  totalIssues: { col: 'total_issues' },
  resolvedIssues: { col: 'resolved_issues' },
  detectors: { col: 'detectors', json: true },
  aiSummary: { col: 'ai_summary', json: true },
  lighthouse: { col: 'lighthouse', json: true },
  aiStatus: { col: 'ai_status' },
  aiError: { col: 'ai_error' },
  lastVerification: { col: 'last_verification', json: true },
  error: { col: 'error' },
};

export function updateAudit(id: string, patch: Partial<Audit>): Audit {
  const sets: string[] = [];
  const values: (string | number | null)[] = [];
  for (const [key, value] of Object.entries(patch)) {
    const spec = AUDIT_COLUMNS[key];
    if (!spec) continue;
    sets.push(`${spec.col} = ?`);
    values.push(spec.json ? toJson(value) : ((value ?? null) as string | number | null));
  }
  sets.push('updated_at = ?');
  values.push(nowIso());
  getDb().prepare(`UPDATE audits SET ${sets.join(', ')} WHERE id = ?`).run(...values, id);
  return getAudit(id)!;
}

/* ----------------------------------------------------------------- issues */

function rowToIssue(r: Row): Issue {
  return {
    id: r.id as string,
    number: r.number as number,
    auditId: r.audit_id as string,
    pageUrl: r.page_url as string,
    category: r.category as Issue['category'],
    persona: r.persona as Issue['persona'],
    severity: r.severity as Issue['severity'],
    priorityScore: r.priority_score as number,
    priorityReason: r.priority_reason as string,
    confidence: r.confidence as Issue['confidence'],
    title: r.title as string,
    description: r.description as string,
    affectedUsers: r.affected_users as string,
    whyItMatters: r.why_it_matters as string,
    howToFix: r.how_to_fix as string,
    selector: (r.selector as string | null) ?? null,
    htmlSnippet: (r.html_snippet as string | null) ?? null,
    screenshotPath: (r.screenshot_path as string | null) ?? null,
    steps: fromJson(r.steps, []),
    rule: r.rule as string,
    detectedBy: r.detected_by as string,
    helpUrl: (r.help_url as string | null) ?? null,
    fingerprint: r.fingerprint as string,
    metrics: fromJson(r.metrics, null),
    ai: fromJson(r.ai, null),
    fix: fromJson(r.fix, null),
    status: r.status as Issue['status'],
    createdAt: r.created_at as string,
  };
}

export function insertIssues(issues: Issue[]) {
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO issues (id, number, audit_id, page_url, category, persona, severity, priority_score, priority_reason,
      confidence, title, description, affected_users, why_it_matters, how_to_fix, selector, html_snippet,
      screenshot_path, steps, rule, detected_by, help_url, fingerprint, metrics, ai, fix, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  db.exec('BEGIN');
  try {
    for (const i of issues) {
      stmt.run(
        i.id, i.number, i.auditId, i.pageUrl, i.category, i.persona, i.severity, i.priorityScore, i.priorityReason,
        i.confidence, i.title, i.description, i.affectedUsers, i.whyItMatters, i.howToFix, i.selector, i.htmlSnippet,
        i.screenshotPath, toJson(i.steps), i.rule, i.detectedBy, i.helpUrl, i.fingerprint, toJson(i.metrics),
        toJson(i.ai), toJson(i.fix), i.status, i.createdAt,
      );
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function getIssue(id: string): Issue | null {
  const row = getDb().prepare('SELECT * FROM issues WHERE id = ?').get(id) as Row | undefined;
  return row ? rowToIssue(row) : null;
}

export function listIssues(auditId: string): Issue[] {
  return (getDb().prepare('SELECT * FROM issues WHERE audit_id = ? ORDER BY number ASC').all(auditId) as Row[]).map(rowToIssue);
}

export function updateIssue(id: string, patch: Partial<Pick<Issue, 'ai' | 'fix' | 'status'>>): Issue {
  if ('ai' in patch) getDb().prepare('UPDATE issues SET ai = ? WHERE id = ?').run(toJson(patch.ai), id);
  if ('fix' in patch) getDb().prepare('UPDATE issues SET fix = ? WHERE id = ?').run(toJson(patch.fix), id);
  if (patch.status) getDb().prepare('UPDATE issues SET status = ? WHERE id = ?').run(patch.status, id);
  return getIssue(id)!;
}

/* ----------------------------------------------------------------- events */

function rowToEvent(r: Row): AuditEvent {
  return {
    id: r.id as number,
    auditId: r.audit_id as string,
    timestamp: r.timestamp as string,
    type: r.type as AuditEvent['type'],
    message: r.message as string,
    metadata: fromJson(r.metadata, null),
  };
}

export function insertEvent(e: Omit<AuditEvent, 'id' | 'timestamp'>): AuditEvent {
  const ts = nowIso();
  const result = getDb()
    .prepare('INSERT INTO events (audit_id, timestamp, type, message, metadata) VALUES (?, ?, ?, ?, ?)')
    .run(e.auditId, ts, e.type, e.message, toJson(e.metadata ?? null));
  return { ...e, id: Number(result.lastInsertRowid), timestamp: ts };
}

export function listEvents(auditId: string, afterId = 0): AuditEvent[] {
  return (
    getDb().prepare('SELECT * FROM events WHERE audit_id = ? AND id > ? ORDER BY id ASC').all(auditId, afterId) as Row[]
  ).map(rowToEvent);
}

/* ---------------------------------------------------------- verifications */

export function insertVerification(v: Verification) {
  getDb()
    .prepare(
      `INSERT INTO verifications (id, issue_id, audit_id, before_result, after_result, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(v.id, v.issueId, v.auditId, toJson(v.beforeResult)!, toJson(v.afterResult)!, v.status, v.createdAt);
}

export function listVerifications(auditId: string): Verification[] {
  return (
    getDb().prepare('SELECT * FROM verifications WHERE audit_id = ? ORDER BY created_at ASC').all(auditId) as Row[]
  ).map((r) => ({
    id: r.id as string,
    issueId: (r.issue_id as string | null) ?? null,
    auditId: r.audit_id as string,
    beforeResult: fromJson(r.before_result, {}),
    afterResult: fromJson(r.after_result, {}),
    status: r.status as Verification['status'],
    createdAt: r.created_at as string,
  }));
}

/** Marks audits that were mid-flight when the server stopped as failed. */
export function failInterruptedAudits() {
  getDb()
    .prepare(`UPDATE audits SET status = 'completed', stage = 'Verification was interrupted', updated_at = ? WHERE status = 'verifying'`)
    .run(nowIso());
  getDb()
    .prepare(
      `UPDATE audits SET status = 'failed', error = 'The server restarted while this audit was running.', updated_at = ?
       WHERE status IN ('queued','initializing','crawling','testing','analyzing','generating_report')`,
    )
    .run(nowIso());
}
