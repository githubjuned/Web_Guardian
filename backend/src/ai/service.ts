/**
 * Gemini-powered reasoning over evidence: explanation, prioritisation, summary,
 * fix generation and grounded audit chat. Every output is validated against the
 * stored audit so the model cannot introduce issues that do not exist.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import type { AiExplanation, AiSummary, Audit, ChatMessage, Issue } from '@webguardian/shared';
import { config } from '../config';
import { getAi } from './gemini';
import { ChatSchema, ExplanationSchema, FixSchema, RuleExplanationsSchema, SummarySchema, type FixResult } from './schemas';
import { GROUNDING_RULES, chatPrompt, fixPrompt, issueExplanationPrompt, ruleExplanationsPrompt, summaryPrompt } from './prompts';
import { nowIso } from '../utils/ids';

export const NO_EVIDENCE_ANSWER = "I don't have evidence for that in this audit.";

export function aiAvailable() {
  return getAi().available;
}

/** One Gemini call explains every distinct rule; the explanation is shared by all instances. */
export async function explainRuleGroups(audit: Audit, issues: Issue[]): Promise<Map<string, AiExplanation>> {
  const byRule = new Map<string, { rule: string; count: number; example: Issue }>();
  for (const i of issues) {
    const g = byRule.get(i.rule);
    if (g) g.count++;
    else byRule.set(i.rule, { rule: i.rule, count: 1, example: i });
  }
  const groups = [...byRule.values()].slice(0, 40);
  const ai = getAi();
  const result = await ai.generateJson({
    system: GROUNDING_RULES,
    prompt: ruleExplanationsPrompt(audit, groups),
    schema: RuleExplanationsSchema,
    check: (v) => {
      const known = new Set(groups.map((g) => g.rule));
      const unknown = v.explanations.filter((e) => !known.has(e.rule)).map((e) => e.rule);
      return unknown.length ? `Unknown rule ids: ${unknown.join(', ')}. Use only the rule ids provided.` : null;
    },
  });
  const out = new Map<string, AiExplanation>();
  for (const e of result.explanations) {
    const { rule, ...rest } = e;
    out.set(rule, { ...rest, model: ai.model, generatedAt: nowIso() });
  }
  return out;
}

async function screenshotFor(issue: Issue): Promise<{ mimeType: string; data: string } | null> {
  if (!issue.screenshotPath) return null;
  const relative = issue.screenshotPath.replace(/^\/api\/screenshots\//, '');
  const file = path.resolve(config.screenshotDir, relative);
  if (!file.startsWith(path.resolve(config.screenshotDir))) return null;
  try {
    const data = await fs.readFile(file);
    return { mimeType: 'image/jpeg', data: data.toString('base64') };
  } catch {
    return null;
  }
}

/** Instance-specific explanation; includes the evidence screenshot for visual context. */
export async function explainIssue(audit: Audit, issue: Issue): Promise<AiExplanation> {
  const ai = getAi();
  const image = await screenshotFor(issue);
  const result = await ai.generateJson({
    system: GROUNDING_RULES,
    prompt: issueExplanationPrompt(audit, issue, !!image),
    schema: ExplanationSchema,
    images: image ? [image] : [],
  });
  return { ...result, model: ai.model, generatedAt: nowIso() };
}

export async function summarizeAudit(audit: Audit, issues: Issue[]): Promise<AiSummary> {
  const ai = getAi();
  const numbers = new Map(issues.map((i) => [i.number, i.id]));
  const result = await ai.generateJson({
    system: GROUNDING_RULES,
    prompt: summaryPrompt(audit, issues),
    schema: SummarySchema,
    check: (v) => {
      const bad = v.topPriorities.filter((p) => !numbers.has(p.issueNumber)).map((p) => p.issueNumber);
      return bad.length ? `Issue numbers ${bad.join(', ')} do not exist. Use only the issue numbers provided.` : null;
    },
  });
  return {
    summary: result.summary,
    overallRisk: result.overallRisk,
    // Hallucination guard: drop anything that does not reference a real issue.
    topPriorities: result.topPriorities
      .filter((p) => numbers.has(p.issueNumber))
      .map((p) => ({ issueId: numbers.get(p.issueNumber)!, reason: p.reason })),
    quickWins: result.quickWins,
    generatedAt: nowIso(),
    model: ai.model,
  };
}

export async function proposeFix(
  issue: Issue,
  files: { path: string; content: string }[] | null,
  assets: string[] = [],
): Promise<FixResult & { model: string }> {
  const ai = getAi();
  const result = await ai.generateJson({
    system: `${GROUNDING_RULES}\nYou generate minimal, reviewable code patches. A human must approve every change.`,
    prompt: fixPrompt(issue, files, assets),
    schema: FixSchema,
    temperature: 0.1,
    check: (v) => {
      if (v.oldCode === v.newCode) return 'newCode is identical to oldCode — it must fix the issue.';
      if (!files) return null;
      const file = files.find((f) => f.path === v.file);
      if (!file) return `"file" must be one of: ${files.map((f) => f.path).join(', ')}`;
      const occurrences = file.content.split(v.oldCode).length - 1;
      if (occurrences === 0) return `oldCode was not found verbatim in ${v.file}. Copy it exactly from the file content.`;
      if (occurrences > 1) return `oldCode appears ${occurrences} times in ${v.file}. Include more surrounding lines so it is unique.`;
      return null;
    },
  });
  return { ...result, model: ai.model };
}

export async function answerQuestion(
  audit: Audit,
  issues: Issue[],
  question: string,
  history: ChatMessage[],
): Promise<ChatMessage> {
  const ai = getAi();
  const result = await ai.generateJson({
    system: GROUNDING_RULES,
    prompt: chatPrompt(audit, issues, question, history),
    schema: ChatSchema,
    temperature: 0.3,
  });
  const byNumber = new Map(issues.map((i) => [i.number, i.id]));
  return {
    role: 'assistant',
    content: result.grounded === false && !result.answer.trim() ? NO_EVIDENCE_ANSWER : result.answer,
    citedIssueIds: result.citedIssueNumbers.filter((n) => byNumber.has(n)).map((n) => byNumber.get(n)!),
  };
}
