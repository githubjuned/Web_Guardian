/**
 * Demo-site sandboxes.
 *
 * WebGuardian can only apply fixes to code it has access to. For the live demo,
 * each visitor gets a private copy of the Brewly demo site at /sandbox/<id>/.
 * Approved fixes are written to that copy, so re-testing measures a real change
 * and concurrent visitors never interfere with each other.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config';
import { newId } from '../utils/ids';
import { logger } from '../utils/logger';

const TEXT_EXTENSIONS = new Set(['.html', '.css', '.js']);
const SANDBOX_ID = /^sbx_[0-9a-z]{10}$/;

export function isValidSandboxId(id: string): boolean {
  return SANDBOX_ID.test(id);
}

export function sandboxPath(id: string): string {
  if (!isValidSandboxId(id)) throw new Error('Invalid sandbox id');
  return path.join(config.sandboxDir, id);
}

export function sandboxUrl(id: string, base = config.publicBaseUrl): string {
  return `${base}/sandbox/${id}/index.html`;
}

export async function createSandbox(): Promise<{ id: string; url: string }> {
  const id = newId('sbx');
  await fs.mkdir(config.sandboxDir, { recursive: true });
  await fs.cp(config.demoSiteDir, sandboxPath(id), { recursive: true });
  void cleanupSandboxes();
  return { id, url: sandboxUrl(id) };
}

export async function sandboxExists(id: string): Promise<boolean> {
  if (!isValidSandboxId(id)) return false;
  try {
    return (await fs.stat(sandboxPath(id))).isDirectory();
  } catch {
    return false;
  }
}

/** Extracts the sandbox id from an audited URL served by this backend. */
export function sandboxIdFromUrl(url: string, trustedOrigins: string[]): string | null {
  try {
    const u = new URL(url);
    if (!trustedOrigins.includes(u.origin)) return null;
    const match = u.pathname.match(/^\/sandbox\/(sbx_[0-9a-z]{10})(\/|$)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/** Text source files of a sandbox (HTML/CSS/JS), for fix generation. */
export async function readSandboxSources(id: string): Promise<{ path: string; content: string }[]> {
  const root = sandboxPath(id);
  const out: { path: string; content: string }[] = [];
  async function walk(dir: string) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (TEXT_EXTENSIONS.has(path.extname(entry.name))) {
        out.push({ path: path.relative(root, full).split(path.sep).join('/'), content: await fs.readFile(full, 'utf8') });
      }
    }
  }
  await walk(root);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/** Lists every file (including images) so the model can reference existing assets. */
export async function listSandboxFiles(id: string): Promise<string[]> {
  const root = sandboxPath(id);
  const out: string[] = [];
  async function walk(dir: string) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else out.push(path.relative(root, full).split(path.sep).join('/'));
    }
  }
  await walk(root);
  return out.sort();
}

export class ApplyFixError extends Error {}

/** Applies an exact, single-occurrence replacement to a sandbox file. */
export async function applyToSandbox(id: string, file: string, oldCode: string, newCode: string): Promise<void> {
  const root = sandboxPath(id);
  const target = path.resolve(root, file);
  if (!target.startsWith(root + path.sep) || !TEXT_EXTENSIONS.has(path.extname(target))) {
    throw new ApplyFixError('The fix targets a file outside the project.');
  }
  let content: string;
  try {
    content = await fs.readFile(target, 'utf8');
  } catch {
    throw new ApplyFixError(`${file} does not exist in the project.`);
  }
  const occurrences = content.split(oldCode).length - 1;
  if (occurrences !== 1) {
    throw new ApplyFixError(
      occurrences === 0
        ? 'The code this fix replaces is no longer in the file (another fix probably changed it). Generate a new fix.'
        : 'The code this fix replaces is ambiguous. Generate a new fix.',
    );
  }
  await fs.writeFile(target, content.replace(oldCode, () => newCode), 'utf8');
}

export async function resetSandbox(id: string): Promise<void> {
  const dir = sandboxPath(id);
  await fs.rm(dir, { recursive: true, force: true });
  await fs.cp(config.demoSiteDir, dir, { recursive: true });
}

let lastCleanup = 0;
export async function cleanupSandboxes() {
  if (Date.now() - lastCleanup < 60 * 60_000) return;
  lastCleanup = Date.now();
  try {
    for (const entry of await fs.readdir(config.sandboxDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || !isValidSandboxId(entry.name)) continue;
      const stat = await fs.stat(path.join(config.sandboxDir, entry.name));
      if (Date.now() - stat.mtimeMs > config.sandboxTtlMs) {
        await fs.rm(path.join(config.sandboxDir, entry.name), { recursive: true, force: true });
      }
    }
  } catch (err) {
    logger.warn('Sandbox cleanup failed', { error: String(err) });
  }
}
