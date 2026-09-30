/* Tiny structured logger — avoids a dependency and never logs secrets. */
type Level = 'info' | 'warn' | 'error' | 'debug';

function log(level: Level, message: string, meta?: Record<string, unknown>) {
  if (level === 'debug' && !process.env.DEBUG) return;
  if (process.env.NODE_ENV === 'test' && level !== 'error') return;
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${message}`;
  const out = meta ? `${line} ${JSON.stringify(meta)}` : line;
  (level === 'error' ? console.error : console.log)(out);
}

export const logger = {
  info: (m: string, meta?: Record<string, unknown>) => log('info', m, meta),
  warn: (m: string, meta?: Record<string, unknown>) => log('warn', m, meta),
  error: (m: string, meta?: Record<string, unknown>) => log('error', m, meta),
  debug: (m: string, meta?: Record<string, unknown>) => log('debug', m, meta),
};

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
