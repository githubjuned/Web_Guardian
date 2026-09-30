import { Router } from 'express';
import * as audits from '../controllers/auditsController';
import * as issues from '../controllers/issuesController';
import * as demo from '../controllers/demoController';
import { aiLimiter, auditLimiter, verifyLimiter } from '../middleware/rateLimit';
import { config } from '../config';
import { aiAvailable } from '../ai/service';
import { queueStats } from '../services/auditService';
import { PERSONAS_INFO } from '../personas';

export const api = Router();

api.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'webguardian-api',
    time: new Date().toISOString(),
    gemini: { configured: aiAvailable(), model: config.geminiModel },
    lighthouse: config.lighthouseEnabled,
    queue: queueStats(),
  });
});

api.get('/config', (_req, res) => {
  res.json({
    maxPagesLimit: config.maxPagesLimit,
    aiConfigured: aiAvailable(),
    aiModel: config.geminiModel,
    demoAvailable: true,
    publicBaseUrl: config.publicBaseUrl,
  });
});

api.get('/personas', (_req, res) => res.json(PERSONAS_INFO));

// Audits
api.post('/audits', auditLimiter, audits.create);
api.get('/audits', audits.list);
api.get('/audits/:id', audits.get);
api.get('/audits/:id/issues', audits.issues);
api.get('/audits/:id/events', audits.events);
api.get('/audits/:id/report', audits.report);
api.post('/audits/:id/verify', verifyLimiter, audits.verify);
api.post('/audits/:id/ai', aiLimiter, audits.retryAi);
api.post('/audits/:id/chat', aiLimiter, audits.chat);

// Issues
api.get('/issues/:id', issues.get);
api.post('/issues/:id/explain', aiLimiter, issues.explain);
api.post('/issues/:id/fix', aiLimiter, issues.fix);
api.post('/issues/:id/apply', issues.apply);
api.post('/issues/:id/reject', issues.reject);
api.post('/issues/:id/verify', verifyLimiter, issues.verify);

// Demo sandboxes
api.post('/demo/sandbox', auditLimiter, demo.create);
api.post('/demo/sandbox/:id/reset', demo.reset);
