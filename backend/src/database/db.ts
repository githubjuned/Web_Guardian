/**
 * SQLite persistence using Node's built-in `node:sqlite` (no native build step).
 * JSON-shaped columns are stored as TEXT and parsed on read.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from '../config';

let db: DatabaseSync | null = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS audits (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  max_pages INTEGER NOT NULL,
  status TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  stage TEXT NOT NULL DEFAULT '',
  pages TEXT NOT NULL DEFAULT '[]',
  scores_before TEXT,
  scores_after TEXT,
  issue_counts TEXT NOT NULL DEFAULT '{"critical":0,"high":0,"medium":0,"low":0}',
  total_issues INTEGER NOT NULL DEFAULT 0,
  resolved_issues INTEGER NOT NULL DEFAULT 0,
  detectors TEXT NOT NULL DEFAULT '{}',
  ai_summary TEXT,
  lighthouse TEXT,
  ai_status TEXT NOT NULL DEFAULT 'pending',
  ai_error TEXT,
  sandbox_id TEXT,
  last_verification TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS issues (
  id TEXT PRIMARY KEY,
  number INTEGER NOT NULL,
  audit_id TEXT NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  page_url TEXT NOT NULL,
  category TEXT NOT NULL,
  persona TEXT NOT NULL,
  severity TEXT NOT NULL,
  priority_score REAL NOT NULL,
  priority_reason TEXT NOT NULL,
  confidence TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  affected_users TEXT NOT NULL,
  why_it_matters TEXT NOT NULL,
  how_to_fix TEXT NOT NULL,
  selector TEXT,
  html_snippet TEXT,
  screenshot_path TEXT,
  steps TEXT NOT NULL DEFAULT '[]',
  rule TEXT NOT NULL,
  detected_by TEXT NOT NULL,
  help_url TEXT,
  fingerprint TEXT NOT NULL,
  metrics TEXT,
  ai TEXT,
  fix TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_issues_audit ON issues(audit_id);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  audit_id TEXT NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  timestamp TEXT NOT NULL,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_audit ON events(audit_id);

CREATE TABLE IF NOT EXISTS verifications (
  id TEXT PRIMARY KEY,
  issue_id TEXT,
  audit_id TEXT NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  before_result TEXT NOT NULL,
  after_result TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_verifications_audit ON verifications(audit_id);
`;

export function getDb(): DatabaseSync {
  if (db) return db;
  if (config.databaseFile !== ':memory:') {
    fs.mkdirSync(path.dirname(config.databaseFile), { recursive: true });
  }
  db = new DatabaseSync(config.databaseFile);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}

export function closeDb() {
  db?.close();
  db = null;
}

export function toJson(value: unknown): string | null {
  return value === undefined || value === null ? null : JSON.stringify(value);
}

export function fromJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || value === '') return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
