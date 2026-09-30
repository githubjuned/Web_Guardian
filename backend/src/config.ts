import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const BACKEND_ROOT = path.resolve(here, '..');
export const REPO_ROOT = path.resolve(BACKEND_ROOT, '..');

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function int(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const port = int(process.env.PORT, 8080);
const dataDir = path.resolve(BACKEND_ROOT, process.env.WEBGUARDIAN_DATA_DIR ?? 'data');

function databaseFile(): string {
  const url = process.env.DATABASE_URL;
  if (!url) return path.join(dataDir, 'webguardian.db');
  const file = url.replace(/^file:/, '');
  return file === ':memory:' ? file : path.resolve(BACKEND_ROOT, file);
}

export const config = {
  port,
  dataDir,
  databaseFile: databaseFile(),
  screenshotDir: path.join(dataDir, 'screenshots'),
  sandboxDir: path.join(dataDir, 'sandboxes'),
  demoSiteDir: path.join(REPO_ROOT, 'demo-site', 'src'),
  frontendDistDir: path.join(REPO_ROOT, 'frontend', 'dist'),
  publicBaseUrl: (process.env.PUBLIC_BASE_URL ?? `http://localhost:${port}`).replace(/\/$/, ''),
  frontendOrigins: (process.env.FRONTEND_URL ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean),
  geminiApiKey: process.env.GEMINI_API_KEY ?? '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
  geminiTimeoutMs: int(process.env.GEMINI_TIMEOUT_MS, 60_000),
  maxConcurrentAudits: int(process.env.MAX_CONCURRENT_AUDITS, 2),
  maxPagesLimit: 3,
  lighthouseEnabled: bool(process.env.LIGHTHOUSE_ENABLED, true),
  allowPrivateUrls: bool(process.env.ALLOW_PRIVATE_URLS, false),
  navigationTimeoutMs: int(process.env.NAVIGATION_TIMEOUT_MS, 30_000),
  auditTimeoutMs: int(process.env.AUDIT_TIMEOUT_MS, 6 * 60_000),
  sandboxTtlMs: 24 * 60 * 60_000,
};

export type Config = typeof config;
