import type { Request, Response } from 'express';
import { z } from 'zod';
import type { ChatMessage, CreateAuditResponse } from '@webguardian/shared';
import { config } from '../config';
import { getAudit, listAudits, listEvents, listIssues, listVerifications } from '../database/repository';
import { latestFrame, subscribe, type BusMessage } from '../events/bus';
import { createAudit, retryAiAnalysis, startAuditVerification, trustedOrigins } from '../services/auditService';
import { validateAuditUrl } from '../utils/url';
import { answerQuestion, aiAvailable, NO_EVIDENCE_ANSWER } from '../ai/service';
import { AiUnavailableError } from '../ai/gemini';
import { HttpError } from '../middleware/errors';

const CreateAuditBody = z.object({
  url: z.string().min(1, 'Please enter a website URL.').max(2048),
  maxPages: z.coerce.number().int().min(1).max(config.maxPagesLimit).optional(),
});

function requireAudit(id: string) {
  const audit = getAudit(id);
  if (!audit) throw new HttpError(404, 'Audit not found');
  return audit;
}

export async function create(req: Request, res: Response) {
  const body = CreateAuditBody.parse(req.body ?? {});
  const url = await validateAuditUrl(body.url, { allowPrivate: config.allowPrivateUrls, trustedOrigins: trustedOrigins() });
  const audit = createAudit(url.href, body.maxPages ?? config.maxPagesLimit);
  const response: CreateAuditResponse = { auditId: audit.id, status: audit.status };
  res.status(202).location(`/api/audits/${audit.id}`).json(response);
}

export function list(_req: Request, res: Response) {
  res.json(listAudits(20));
}

export function get(req: Request<{ id: string }>, res: Response) {
  res.json(requireAudit(req.params.id));
}

export function issues(req: Request<{ id: string }>, res: Response) {
  requireAudit(req.params.id);
  res.json(listIssues(req.params.id));
}

export function report(req: Request<{ id: string }>, res: Response) {
  const audit = requireAudit(req.params.id);
  res.json({
    generatedAt: new Date().toISOString(),
    generator: 'WebGuardian AI',
    audit,
    issues: listIssues(audit.id),
    verifications: listVerifications(audit.id),
    events: listEvents(audit.id).filter((e) => e.type !== 'action'),
  });
}

/** Server-Sent Events: replays the timeline, then streams live events and browser frames. */
export function events(req: Request<{ id: string }>, res: Response) {
  const audit = requireAudit(req.params.id);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();
  const send = (kind: BusMessage['kind'], data: unknown, id?: number) => {
    res.write(`${id !== undefined ? `id: ${id}\n` : ''}event: ${kind}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  const after = Number(req.header('Last-Event-ID') ?? req.query.after ?? 0) || 0;
  send('audit', audit);
  for (const e of listEvents(audit.id, after)) send('event', e, e.id);
  const frame = latestFrame(audit.id);
  if (frame) send('frame', frame);

  const unsubscribe = subscribe(audit.id, (msg) => {
    if (msg.kind === 'event') send('event', msg.event, msg.event.id);
    else if (msg.kind === 'frame') send('frame', msg.frame);
    else send('audit', msg.audit);
  });
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 15_000);
  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
}

export function verify(req: Request<{ id: string }>, res: Response) {
  requireAudit(req.params.id);
  try {
    res.status(202).json(startAuditVerification(req.params.id));
  } catch (err) {
    throw new HttpError(409, (err as Error).message);
  }
}

export async function retryAi(req: Request<{ id: string }>, res: Response) {
  requireAudit(req.params.id);
  await retryAiAnalysis(req.params.id);
  res.json(getAudit(req.params.id));
}

const ChatBody = z.object({
  question: z.string().trim().min(1).max(1000),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(4000) }))
    .max(20)
    .default([]),
});

export async function chat(req: Request<{ id: string }>, res: Response) {
  const audit = requireAudit(req.params.id);
  const body = ChatBody.parse(req.body ?? {});
  if (!['completed', 'verified', 'verifying'].includes(audit.status)) {
    throw new HttpError(409, 'Chat becomes available once the audit has finished.');
  }
  if (!aiAvailable()) throw new AiUnavailableError('Gemini is not configured on this server.');
  const issues = listIssues(audit.id);
  const reply: ChatMessage = await answerQuestion(audit, issues, body.question, body.history as ChatMessage[]);
  res.json({ ...reply, content: reply.content || NO_EVIDENCE_ANSWER });
}
