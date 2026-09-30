/**
 * Fix workflow: Gemini proposes → the user reviews the diff → explicit approval →
 * applied to the demo sandbox → verification re-tests it.
 *
 * Fixes are only ever applied automatically to sandboxes this server owns.
 * For any other website the diff is shown for the owner to copy into their code.
 */
import { createTwoFilesPatch } from 'diff';
import type { FixProposal, Issue } from '@webguardian/shared';
import { getAudit, updateIssue } from '../database/repository';
import { publishEvent } from '../events/bus';
import { proposeFix } from '../ai/service';
import { ApplyFixError, applyToSandbox, listSandboxFiles, readSandboxSources, sandboxExists } from './sandboxService';
import { nowIso } from '../utils/ids';

export class FixWorkflowError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export async function generateFix(issue: Issue): Promise<Issue> {
  const audit = getAudit(issue.auditId);
  if (!audit) throw new FixWorkflowError('Audit not found', 404);

  const hasSource = !!audit.sandboxId && (await sandboxExists(audit.sandboxId));
  let files: { path: string; content: string }[] | null = null;
  let assets: string[] = [];
  if (hasSource) {
    files = await readSandboxSources(audit.sandboxId!);
    // The asset inventory lets the model reference files that already exist (e.g. an optimised image).
    assets = (await listSandboxFiles(audit.sandboxId!)).filter((f) => !files!.some((s) => s.path === f));
  }

  publishEvent(audit.id, 'ai', `Gemini is generating a fix for issue #${issue.number}: ${issue.title}`);
  const result = await proposeFix(issue, files, assets);

  let diff: string;
  if (hasSource && result.file) {
    const original = files!.find((f) => f.path === result.file)!.content;
    const updated = original.replace(result.oldCode, () => result.newCode);
    diff = createTwoFilesPatch(`a/${result.file}`, `b/${result.file}`, original, updated, '', '', { context: 3 });
  } else {
    diff = createTwoFilesPatch('before', 'after', `${result.oldCode}\n`, `${result.newCode}\n`, '', '', { context: 3 });
  }

  const fix: FixProposal = {
    summary: result.summary,
    explanation: result.explanation,
    risk: result.risk,
    file: hasSource ? result.file : null,
    oldCode: result.oldCode,
    newCode: result.newCode,
    diff,
    applicable: hasSource,
    applicableReason: hasSource
      ? 'This audit targets a WebGuardian demo sandbox, so the fix can be applied to its source after your approval.'
      : "WebGuardian doesn't have access to this website's source code. Copy the change into your project, redeploy, then click Verify.",
    source: 'gemini',
    model: result.model,
    generatedAt: nowIso(),
    appliedAt: null,
  };
  publishEvent(audit.id, 'ai', `✓ Fix proposed for issue #${issue.number} (${fix.risk} risk) — waiting for your approval`);
  return updateIssue(issue.id, { fix, status: 'fix_proposed' });
}

export async function applyFix(issue: Issue, approved: unknown): Promise<Issue> {
  if (approved !== true) throw new FixWorkflowError('Fixes are only applied after explicit approval ({ "approved": true }).');
  const audit = getAudit(issue.auditId);
  if (!audit) throw new FixWorkflowError('Audit not found', 404);
  if (!issue.fix) throw new FixWorkflowError('Generate a fix before applying it.');
  if (issue.fix.appliedAt) throw new FixWorkflowError('This fix has already been applied.', 409);
  if (!issue.fix.applicable || !audit.sandboxId || !issue.fix.file) {
    throw new FixWorkflowError(issue.fix.applicableReason, 422);
  }
  if (!(await sandboxExists(audit.sandboxId))) throw new FixWorkflowError('The demo sandbox has expired. Start a new demo audit.', 410);
  try {
    await applyToSandbox(audit.sandboxId, issue.fix.file, issue.fix.oldCode, issue.fix.newCode);
  } catch (err) {
    if (err instanceof ApplyFixError) throw new FixWorkflowError(err.message, 409);
    throw err;
  }
  publishEvent(audit.id, 'action', `✓ User approved fix for issue #${issue.number} — applied to ${issue.fix.file}. Click Verify to re-test.`);
  return updateIssue(issue.id, { fix: { ...issue.fix, appliedAt: nowIso() }, status: 'fix_applied' });
}

export function rejectFix(issue: Issue): Issue {
  if (!issue.fix) throw new FixWorkflowError('There is no fix to reject.');
  if (issue.fix.appliedAt) throw new FixWorkflowError('This fix has already been applied.', 409);
  publishEvent(issue.auditId, 'action', `Fix for issue #${issue.number} rejected by the user`);
  return updateIssue(issue.id, { status: 'fix_rejected' });
}
