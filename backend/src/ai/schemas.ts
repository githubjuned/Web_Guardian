/** zod schemas that every Gemini response must satisfy before it is stored. */
import { z } from 'zod';

const severity = z.enum(['critical', 'high', 'medium', 'low']);
const text = (max: number) => z.string().trim().min(1).max(max);

export const ExplanationSchema = z.object({
  whatHappened: text(800),
  whoItAffects: text(500),
  whyItMatters: text(800),
  howToFix: text(1200),
  priority: severity,
  priorityReason: text(500),
  beginnerExplanation: text(800),
});
export type ExplanationResult = z.infer<typeof ExplanationSchema>;

export const RuleExplanationsSchema = z.object({
  explanations: z.array(ExplanationSchema.extend({ rule: z.string().min(1) })).max(60),
});

export const SummarySchema = z.object({
  summary: text(1500),
  overallRisk: severity,
  topPriorities: z
    .array(z.object({ issueNumber: z.number().int().positive(), reason: text(400) }))
    .max(5),
  quickWins: z.array(text(300)).max(5),
});

export const FixSchema = z.object({
  summary: text(300),
  file: z.string().nullable(),
  oldCode: z.string().min(1).max(8000),
  newCode: z.string().max(8000),
  explanation: text(1500),
  risk: z.enum(['low', 'medium', 'high']),
});
export type FixResult = z.infer<typeof FixSchema>;

export const ChatSchema = z.object({
  answer: text(4000),
  citedIssueNumbers: z.array(z.number().int().positive()).max(30).default([]),
  grounded: z.boolean().default(true),
});
