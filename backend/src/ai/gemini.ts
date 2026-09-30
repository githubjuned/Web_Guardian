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

export class GeminiClient implements AiClient {
  private client: GoogleGenAI | null;
  readonly model: string;

  constructor(apiKey: string, model: string) {
    this.model = model;
    this.client = apiKey ? new GoogleGenAI({ apiKey }) : null;
  }

  get available() {
    return this.client !== null;
  }

  async generateJson<T extends z.ZodType>(opts: GenerateOptions<T>): Promise<z.infer<T>> {
    if (!this.client) throw new AiUnavailableError('GEMINI_API_KEY is not configured on the server.');
    let feedback = '';
    let lastError = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      const parts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[] = [
        { text: opts.prompt + feedback },
      ];
      for (const img of opts.images ?? []) parts.push({ inlineData: img });

      let text: string;
      try {
        const response = await withTimeout(
          this.client.models.generateContent({
            model: this.model,
            contents: [{ role: 'user', parts }],
            config: {
              systemInstruction: opts.system,
              responseMimeType: 'application/json',
              temperature: opts.temperature ?? 0.2,
            },
          }),
          config.geminiTimeoutMs,
        );
        text = response.text ?? '';
      } catch (err) {
        const message = errorMessage(err);
        logger.warn('Gemini request failed', { model: this.model, error: message.slice(0, 300) });
        if (/api key|permission|unauthori[sz]ed|403|401/i.test(message)) {
          throw new AiUnavailableError('Gemini rejected the API key. Check GEMINI_API_KEY on the server.');
        }
        if (/429|quota|rate/i.test(message)) {
          throw new AiUnavailableError('Gemini rate limit reached. Please try again in a minute.');
        }
        throw new AiUnavailableError(`Gemini request failed: ${message.slice(0, 200)}`);
      }

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
