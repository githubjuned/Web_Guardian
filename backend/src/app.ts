import fs from 'node:fs';
import path from 'node:path';
import express, { type Express } from 'express';
import cors from 'cors';
import { config } from './config';
import { api } from './routes';
import { errorHandler, notFound } from './middleware/errors';
import { isValidSandboxId, sandboxPath } from './services/sandboxService';

const noStore = (res: express.Response) => res.setHeader('Cache-Control', 'no-store');

export function createApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  const allowed = new Set([...config.frontendOrigins, new URL(config.publicBaseUrl).origin]);
  app.use(
    '/api',
    cors({
      origin: (origin, cb) => cb(null, !origin || allowed.has(origin) || /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin)),
      methods: ['GET', 'POST'],
    }),
  );
  app.use(express.json({ limit: '200kb' }));

  // Evidence screenshots
  app.use('/api/screenshots', express.static(config.screenshotDir, { maxAge: '1h', fallthrough: false }));
  app.use('/api', api);
  app.use('/api', notFound);

  // The pristine demo site (read-only) and per-visitor sandboxes (fixes applied here).
  app.use('/demo', express.static(config.demoSiteDir, { setHeaders: noStore }));
  app.use('/sandbox/:id', (req, res, next) => {
    const { id } = req.params as { id: string };
    if (!isValidSandboxId(id)) return res.status(404).send('Sandbox not found');
    return express.static(sandboxPath(id), { etag: false, lastModified: false, setHeaders: noStore })(req, res, () =>
      res.status(404).type('html').send('<!doctype html><title>404 Not Found</title><h1>404 — Page not found</h1>'),
    );
  });

  // Optionally serve the built frontend from the same origin (single-service deployment).
  const indexHtml = path.join(config.frontendDistDir, 'index.html');
  if (fs.existsSync(indexHtml)) {
    app.use(express.static(config.frontendDistDir, { index: false, maxAge: '1h' }));
    app.get(/^\/(?!api\/|demo\/|sandbox\/).*/, (_req, res) => res.sendFile(indexHtml));
  } else {
    app.get('/', (_req, res) => {
      res.json({ service: 'WebGuardian AI API', health: '/api/health', demo: '/demo/' });
    });
  }

  app.use(errorHandler);
  return app;
}
