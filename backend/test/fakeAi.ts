/**
 * Deterministic stand-in for Gemini used in integration tests. It applies the
 * same schema + semantic checks as the real client, so a bad fake response
 * fails the test exactly like a bad Gemini response would.
 */
import type { z } from 'zod';
import type { AiClient, GenerateOptions } from '../src/ai/gemini';

export const TRAP_OLD = `  document.addEventListener('keydown', function (event) {
    if (!document.body.contains(banner)) return;
    if (event.key === 'Tab') {
      event.preventDefault();
      current = event.shiftKey ? (current - 1 + focusable.length) % focusable.length : (current + 1) % focusable.length;
      focusable[current].focus();
    }
  });`;

export const TRAP_NEW = `  document.addEventListener('keydown', function (event) {
    if (!document.body.contains(banner)) return;
    if (event.key === 'Escape') banner.remove();
  });`;

export class FakeAi implements AiClient {
  readonly available = true;
  readonly model = 'fake-gemini';
  calls: string[] = [];

  async generateJson<T extends z.ZodType>(opts: GenerateOptions<T>): Promise<z.infer<T>> {
    const p = opts.prompt;
    let value: unknown;
    if (p.includes('Explain each type of issue')) {
      this.calls.push('explain-rules');
      const rules = [...new Set([...p.matchAll(/"rule": "([^"]+)",\n\s*"occurrences"/g)].map((m) => m[1]))];
      value = { explanations: rules.map((rule) => ({ rule, ...explanation(rule) })) };
    } else if (p.includes('Explain this single issue')) {
      this.calls.push('explain-issue');
      value = explanation('single');
    } else if (p.includes('Summarise this website audit')) {
      this.calls.push('summary');
      value = {
        summary: 'Keyboard users are completely blocked by the cookie banner and several images lack descriptions.',
        overallRisk: 'critical',
        // 999 does not exist: the service must drop it (hallucination guard).
        topPriorities: [{ issueNumber: 1, reason: 'Blocks every keyboard user on the homepage.' }],
        quickWins: ['Add alt text to images'],
      };
    } else if (p.includes('Generate a minimal, safe code fix')) {
      this.calls.push('fix');
      value = p.includes('"rule": "keyboard-focus-trap"')
        ? { summary: 'Stop intercepting Tab in the cookie banner', file: 'app.js', oldCode: TRAP_OLD, newCode: TRAP_NEW, explanation: 'Removes the Tab interception and lets Escape close the banner.', risk: 'low' }
        : {
            summary: 'Add a meta description',
            file: 'index.html',
            oldCode: '  <title>Brewly — Fresh Coffee, Delivered</title>',
            newCode:
              '  <title>Brewly — Fresh Coffee, Delivered</title>\n  <meta name="description" content="Specialty coffee from independent farms, roasted to order and delivered to your door every two weeks.">',
            explanation: 'Adds a descriptive meta description for search results.',
            risk: 'low',
          };
    } else if (p.includes("Answer the user's question")) {
      this.calls.push('chat');
      value = p.includes('weather')
        ? { answer: "I don't have evidence for that in this audit.", citedIssueNumbers: [], grounded: false }
        : { answer: 'Fix #1 first: the keyboard trap blocks keyboard users.', citedIssueNumbers: [1, 999], grounded: true };
    } else {
      throw new Error('FakeAi: unexpected prompt');
    }
    const parsed = opts.schema.parse(value);
    const problem = opts.check?.(parsed);
    if (problem) throw new Error(`FakeAi response rejected: ${problem}`);
    return parsed;
  }
}

function explanation(rule: string) {
  return {
    whatHappened: `Explained ${rule}.`,
    whoItAffects: 'People using assistive technology.',
    whyItMatters: 'They cannot complete their task.',
    howToFix: 'Follow the recommended fix.',
    priority: 'high',
    priorityReason: 'Affects many users on the homepage.',
    beginnerExplanation: 'Think of it like a door without a handle.',
  };
}
