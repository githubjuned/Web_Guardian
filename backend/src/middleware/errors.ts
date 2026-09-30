import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { UrlValidationError } from '../utils/url';
import { AiUnavailableError } from '../ai/gemini';
import { FixWorkflowError } from '../services/fixService';
import { errorMessage, logger } from '../utils/logger';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const notFound: RequestHandler = (req, res) => {
  res.status(404).json({ error: `Not found: ${req.method} ${req.path}` });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (res.headersSent) return;
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, details: err.details });
  } else if (err instanceof UrlValidationError) {
    res.status(400).json({ error: err.message });
  } else if (err instanceof ZodError) {
    res.status(400).json({ error: 'Invalid request', details: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
  } else if (err instanceof AiUnavailableError) {
    res.status(503).json({ error: 'AI temporarily unavailable', details: err.message });
  } else if (err instanceof FixWorkflowError) {
    res.status(err.status).json({ error: err.message });
  } else if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Request body must be valid JSON' });
  } else {
    logger.error('Unhandled error', { error: errorMessage(err), stack: err instanceof Error ? err.stack : undefined });
    res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
  }
};
