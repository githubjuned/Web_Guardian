/**
 * Google Gemini client (backend only).
 *
 * The API key is read from process.env.GEMINI_API_KEY and is never sent to the
 * browser. All responses are requested as JSON and validated with zod; one
 * repair attempt is made if the model returns malformed output.
 */
import { GoogleGenAI } from '@google/genai';
import type { z } from 'zod';
import { config } from '../config';
import { errorMessage, logger } from '../utils/logger';

export class AiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiUnavailableError';
  }
}

export interface GenerateOptions<T extends z.ZodType> {
  system: string;
  prompt: string;
  schema: T;
  images?: { mimeType: string; data: string }[];
  temperature?: number;
  /** Extra semantic validation (e.g. "oldCode must exist in the file"). Return an error string to trigger a retry. */
  check?: (value: z.infer<T>) => string | null;
}

/** Abstraction so tests (and future providers) can swap the implementation. */
export interface AiClient {
  readonly available: boolean;
  readonly model: string;
  generateJson<T extends z.ZodType>(opts: GenerateOptions<T>): Promise<z.infer<T>>;
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // Tolerate ```json fences or leading prose.
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) return JSON.parse(fenced[1]);
    const start = trimmed.search(/[[{]/);
    const end = Math.max(trimmed.lastIndexOf('}'), trimmed.lastIndexOf(']'));
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error('Response was not valid JSON');
  }
}

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };
type FailureKind = 'auth' | 'model' | 'busy' | 'quota' | 'other';

/** Classifies a Gemini transport error so we know whether to retry, switch model, or give up. */
export function classifyGeminiError(message: string): FailureKind {
  if (/api[_ ]key|permission_denied|unauthori[sz]ed|"code":\s*40[13]\b/i.test(message)) return 'auth';
  if (/"code":\s*404|not[_ ]found|no longer available|is not supported|unknown model/i.test(message)) return 'model';
  if (/per ?day|daily/i.test(message)) return 'quota';
  if (/"code":\s*(429|500|502|503|504)|\b(429|500|502|503|504)\b|unavailable|overloaded|high demand|resource_exhausted|timed out|deadline|fetch failed|econnreset|etimedout|socket hang up|internal error/i.test(message))
    return 'busy';
  return 'other';
}

const FRIENDLY: Record<FailureKind, (model: string) => string> = {
  auth: () => 'Gemini rejected the API key. Check GEMINI_API_KEY on the server.',
  model: (m) => `The Gemini model "${m}" is not available for this API key, and no alternative model responded. Set GEMINI_MODEL on the server to a current model.`,
  busy: () => 'Gemini is busy right now (high demand at Google). WebGuardian retried automatically — please try again in a minute.',
  quota: () => 'The Gemini API quota for this key is used up. Try again later or use a key with a higher quota.',
  other: () => 'Gemini could not answer this request. Please try again.',
};

const BACKOFF_MS = [1500, 4000];
/** Total time one request may spend across retries and fallback models. */
const REQUEST_BUDGET_MS = 110_000;

export class GeminiClient implements AiClient {
  private client: GoogleGenAI | null;
  /** The model currently in use; switches to a working fallback if the configured one fails. */
  private activeModel: string;
  private fallbackModels: Promise<string[]> | null = null;
  /** Test hook: sleep between retries. */
  sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  constructor(
    apiKey: string,
    readonly configuredModel: string,
    private readonly explicitFallbacks: string[] = (process.env.GEMINI_FALLBACK_MODELS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  ) {
    this.activeModel = configuredModel;
    this.client = apiKey ? new GoogleGenAI({ apiKey }) : null;
  }

  get model() {
    return this.activeModel;
  }

  get available() {
    return this.client !== null;
  }

  /** Flash models this key can use, newest first (discovered once, only when needed). */
  private discoverFallbacks(): Promise<string[]> {
    if (this.fallbackModels) return this.fallbackModels;
    this.fallbackModels = (async () => {
      if (this.explicitFallbacks.length) return this.explicitFallbacks;
      try {
        const found: string[] = [];
        const pager = await this.client!.models.list();
        for await (const m of pager as AsyncIterable<{ name?: string; supportedActions?: string[] }>) {
          const name = (m.name ?? '').replace(/^models\//, '');
          const usable = !m.supportedActions || m.supportedActions.includes('generateContent');
          if (usable && /^gemini-[\d.]+-flash(-lite)?(-latest|-\d+)?$/.test(name)) found.push(name);
          if (found.length > 40) break;
        }
        const version = (n: string) => parseFloat(n.replace(/^gemini-/, '')) || 0;
        return found.sort((a, b) => version(b) - version(a) || a.length - b.length).slice(0, 4);
      } catch (err) {
        logger.warn('Could not list Gemini models for fallback', { error: errorMessage(err).slice(0, 200) });
        return [];
      }
    })();
    return this.fallbackModels;
  }

  /** One generateContent call with retries on transient errors and fallback to other models. */
  private async call(parts: Part[], opts: GenerateOptions<z.ZodType>): Promise<string> {
    const started = Date.now();
    const tried = new Set<string>();
    let last: { kind: FailureKind; model: string } = { kind: 'other', model: this.activeModel };
    let candidates = [this.activeModel];

    for (let c = 0; c < candidates.length; c++) {
      const model = candidates[c];
      if (tried.has(model)) continue;
      tried.add(model);
      for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
        if (Date.now() - started > REQUEST_BUDGET_MS) break;
        try {
          const response = await withTimeout(
            this.client!.models.generateContent({
              model,
              contents: [{ role: 'user', parts }],
              config: { systemInstruction: opts.system, responseMimeType: 'application/json', temperature: opts.temperature ?? 0.2 },
            }),
            config.geminiTimeoutMs,
          );
          if (model !== this.activeModel) {
            logger.warn('Switched Gemini model after failures', { from: this.activeModel, to: model });
            this.activeModel = model;
          }
          return response.text ?? '';
        } catch (err) {
          const message = errorMessage(err);
          const kind = classifyGeminiError(message);
          last = { kind, model };
          logger.warn('Gemini request failed', { model, attempt, kind, error: message.slice(0, 240) });
          if (kind === 'auth') throw new AiUnavailableError(FRIENDLY.auth(model));
          if (kind !== 'busy' || attempt === BACKOFF_MS.length) break; // try the next model
          await this.sleep(BACKOFF_MS[attempt]);
        }
      }
      // The current model failed: extend the candidate list with discovered alternatives.
      if (c === candidates.length - 1 && Date.now() - started < REQUEST_BUDGET_MS) {
        const more = (await this.discoverFallbacks()).filter((m) => !tried.has(m) && !candidates.includes(m));
        candidates = [...candidates, ...more.slice(0, 2)];
      }
    }
    throw new AiUnavailableError(FRIENDLY[last.kind](this.configuredModel));
  }

  async generateJson<T extends z.ZodType>(opts: GenerateOptions<T>): Promise<z.infer<T>> {
    if (!this.client) throw new AiUnavailableError('GEMINI_API_KEY is not configured on the server.');
    let feedback = '';
    let lastError = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      const parts: Part[] = [{ text: opts.prompt + feedback }];
      for (const img of opts.images ?? []) parts.push({ inlineData: img });
      const text = await this.call(parts, opts as GenerateOptions<z.ZodType>);
      try {
        const parsed = opts.schema.parse(extractJson(text));
        const problem = opts.check?.(parsed);
        if (!problem) return parsed;
        lastError = problem;
      } catch (err) {
        lastError = errorMessage(err).slice(0, 600);
      }
      feedback = `\n\nYOUR PREVIOUS RESPONSE WAS REJECTED: ${lastError}\nReturn corrected JSON only, following the schema exactly.`;
      logger.warn('Gemini response failed validation, retrying', { error: lastError.slice(0, 200) });
    }
    throw new AiUnavailableError(`Gemini returned an invalid response: ${lastError.slice(0, 200)}`);
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`timed out after ${Math.round(ms / 1000)}s`)), ms);
    }),
  ]);
}

let instance: AiClient = new GeminiClient(config.geminiApiKey, config.geminiModel);

export function getAi(): AiClient {
  return instance;
}

/** Test hook: replace the AI client (e.g. with a deterministic fake). */
export function setAi(client: AiClient) {
  instance = client;
}
