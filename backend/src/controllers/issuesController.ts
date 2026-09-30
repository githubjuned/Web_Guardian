import type { Request, Response } from 'express';
import { getAudit, getIssue, updateIssue } from '../database/repository';
import { explainIssue } from '../ai/service';
import { applyFix, generateFix, rejectFix } from '../services/fixService';
import { verifyIssue } from '../services/auditService';
import { publishEvent } from '../events/bus';
import { HttpError } from '../middleware/errors';

function requireIssue(id: string) {
  const issue = getIssue(id);
  if (!issue) throw new HttpError(404, 'Issue not found');
  return issue;
}

export function get(req: Request<{ id: string }>, res: Response) {
  res.json(requireIssue(req.params.id));
}

export async function explain(req: Request<{ id: string }>, res: Response) {
  const issue = requireIssue(req.params.id);
  const audit = getAudit(issue.auditId)!;
  const ai = await explainIssue(audit, issue);
  publishEvent(audit.id, 'ai', `✓ Gemini explained issue #${issue.number} using its evidence${issue.screenshotPath ? ' and screenshot' : ''}`);
  res.json(updateIssue(issue.id, { ai }));
}

export async function fix(req: Request<{ id: string }>, res: Response) {
  res.json(await generateFix(requireIssue(req.params.id)));
}

export async function apply(req: Request<{ id: string }>, res: Response) {
  res.json(await applyFix(requireIssue(req.params.id), req.body?.approved));
}

export function reject(req: Request<{ id: string }>, res: Response) {
  res.json(rejectFix(requireIssue(req.params.id)));
}

export async function verify(req: Request<{ id: string }>, res: Response) {
  const issue = requireIssue(req.params.id);
  const outcome = await verifyIssue(issue);
  res.json({ verification: outcome, issue: getIssue(issue.id) });
}
