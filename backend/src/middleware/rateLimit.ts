import rateLimit from 'express-rate-limit';

const disabled = process.env.NODE_ENV === 'test' || process.env.DISABLE_RATE_LIMIT === 'true';

const limiter = (windowMs: number, limit: number, message: string) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => disabled,
    message: { error: message },
  });

/** Browser audits are expensive: keep them fair on a shared deployment. */
export const auditLimiter = limiter(15 * 60_000, 12, 'Too many audits started from your network. Please wait a few minutes.');
export const verifyLimiter = limiter(15 * 60_000, 40, 'Too many verification runs. Please wait a few minutes.');
export const aiLimiter = limiter(60_000, 30, 'Too many AI requests. Please wait a moment.');
