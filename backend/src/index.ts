import fs from 'node:fs';
import { config } from './config';
import { createApp } from './app';
import { getDb } from './database/db';
import { failInterruptedAudits } from './database/repository';
import { aiAvailable } from './ai/service';
import { logger } from './utils/logger';

// node:sqlite prints an ExperimentalWarning on Node 22 — harmless, keep logs clean.
process.removeAllListeners('warning');
process.on('warning', (w) => {
  if (w.name !== 'ExperimentalWarning') console.warn(w);
});

fs.mkdirSync(config.screenshotDir, { recursive: true });
fs.mkdirSync(config.sandboxDir, { recursive: true });
getDb();
failInterruptedAudits();

const app = createApp();
app.listen(config.port, () => {
  logger.info(`WebGuardian API listening on http://localhost:${config.port}`);
  logger.info(`Public base URL: ${config.publicBaseUrl} · demo site: ${config.publicBaseUrl}/demo/`);
  logger.info(`Gemini: ${aiAvailable() ? `configured (${config.geminiModel})` : 'NOT configured — set GEMINI_API_KEY to enable AI features'}`);
});
