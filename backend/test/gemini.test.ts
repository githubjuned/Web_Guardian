import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { Audit, Issue } from '@webguardian/shared';
import { AiUnavailableError, GeminiClient, setAi } from '../src/ai/gemini';
import { FixSchema, SummarySchema } from '../src/ai/schemas';
import { proposeFix, summarizeAudit } from '../src/ai/service';

/** A real GeminiClient whose network transport is replaced by scripted responses. */
function scriptedClient(responses: (string | Error)[]) {
  const client = new GeminiClient('test-key', 'gemini-test');
  const prompts: string[] = [];
  (client as unknown as { client: unknown }).client = {
    models: {
      generateContent: async (req: { contents: { parts: { text?: string }[] }[] }) => {
        prompts.push(req.contents[0].parts[0].text ?? '');
        const next = responses.shift();
        if (next instanceof Error) throw next;
        return { text: next };
      },
    },
  };
  return { client, prompts };
}

const audit = { id: 'audit_1', url: 'https://shop.example/', pages: [], scoresBefore: null, issueCounts: {}, lighthouse: null } as unknown as Audit;
const issue = (n: number): Issue =>
  ({ id: `issue_${n}`, number: n, title: `Issue ${n}`, severity: 'high', category: 'accessibility', persona: 'keyboard', confidence: 'high', pageUrl: 'https://shop.example/', rule: 'r', detectedBy: 'axe-core', selector: '.x', description: 'desc', status: 'open', fix: null, htmlSnippet: '<b>', steps: [], metrics: null, priorityReason: 'p', affectedUsers: 'a', whyItMatters: 'w', howToFix: 'h' }) as unknown as Issue;

afterEach(() => setAi(new GeminiClient('', 'none')));

describe('Gemini client', () => {
  it('reports unavailable without an API key (never calls the network)', async () => {
    const client = new GeminiClient('', 'gemini-test');
    expect(client.available).toBe(false);
    await expect(client.generateJson({ system: '', prompt: '', schema: z.object({}) })).rejects.toBeInstanceOf(AiUnavailableError);
  });

  it('parses JSON, including fenced output', async () => {
    const { client } = scriptedClient(['```json\n{"a": 1}\n```']);
    expect(await client.generateJson({ system: '', prompt: 'p', schema: z.object({ a: z.number() }) })).toEqual({ a: 1 });
  });

  it('retries once with feedback when the response fails schema validation', async () => {
    const { client, prompts } = scriptedClient(['{"a": "not a number"}', '{"a": 2}']);
    expect(await client.generateJson({ system: '', prompt: 'p', schema: z.object({ a: z.number() }) })).toEqual({ a: 2 });
    expect(prompts[1]).toMatch(/PREVIOUS RESPONSE WAS REJECTED/);
  });

  it('gives up after two invalid responses', async () => {
    const { client } = scriptedClient(['nope', '{"b":1}']);
    await expect(client.generateJson({ system: '', prompt: 'p', schema: z.object({ a: z.number() }) })).rejects.toThrow(/invalid response/);
  });

  it('maps rate limits and auth failures to friendly errors', async () => {
    await expect(scriptedClient([new Error('429 RESOURCE_EXHAUSTED quota')]).client.generateJson({ system: '', prompt: '', schema: z.object({}) })).rejects.toThrow(/rate limit/);
    await expect(scriptedClient([new Error('API key not valid')]).client.generateJson({ system: '', prompt: '', schema: z.object({}) })).rejects.toThrow(/API key/);
  });
});

describe('hallucination control', () => {
  it('summary rejects issue numbers that do not exist, then keeps only real ones', async () => {
    const invented = { summary: 'Overall poor.', overallRisk: 'high', topPriorities: [{ issueNumber: 99, reason: 'made up' }], quickWins: [] };
    const valid = { summary: 'Overall poor.', overallRisk: 'high', topPriorities: [{ issueNumber: 2, reason: 'blocks keyboard users' }], quickWins: ['Add alt text'] };
    const { client, prompts } = scriptedClient([JSON.stringify(invented), JSON.stringify(valid)]);
    setAi(client);
    const summary = await summarizeAudit(audit, [issue(1), issue(2)]);
    expect(prompts[1]).toMatch(/do not exist/);
    expect(summary.topPriorities).toEqual([{ issueId: 'issue_2', reason: 'blocks keyboard users' }]);
    SummarySchema.parse({ ...valid });
  });

  it('fix generation requires oldCode to exist exactly once in the chosen file', async () => {
    const files = [{ path: 'index.html', content: '<head>\n  <title>Shop</title>\n</head>' }];
    const wrong = { summary: 's', file: 'index.html', oldCode: '<title>Store</title>', newCode: 'x', explanation: 'e', risk: 'low' };
    const right = { summary: 'Add description', file: 'index.html', oldCode: '  <title>Shop</title>', newCode: '  <title>Shop</title>\n  <meta name="description" content="A shop">', explanation: 'Adds a description', risk: 'low' };
    const { client, prompts } = scriptedClient([JSON.stringify(wrong), JSON.stringify(right)]);
    setAi(client);
    const fix = await proposeFix(issue(1), files);
    expect(prompts[1]).toMatch(/not found verbatim/);
    expect(FixSchema.parse(fix).newCode).toContain('meta name="description"');
  });

  it('fix generation rejects a no-op change', async () => {
    const noop = { summary: 's', file: null, oldCode: '<b>', newCode: '<b>', explanation: 'e', risk: 'low' };
    const { client } = scriptedClient([JSON.stringify(noop), JSON.stringify(noop)]);
    setAi(client);
    await expect(proposeFix(issue(1), null)).rejects.toThrow(/identical/);
  });
});
