import { z } from 'zod';
import { CATEGORIES, CONFIDENCES, PERSONAS, SEVERITIES } from '@webguardian/shared';

/** Contract every issue must satisfy: evidence-backed and fully explained. */
export const IssueSchema = z.object({
  id: z.string().startsWith('issue_'),
  number: z.number().int().positive(),
  auditId: z.string(),
  pageUrl: z.string().url(),
  category: z.enum(CATEGORIES),
  persona: z.enum(PERSONAS),
  severity: z.enum(SEVERITIES),
  confidence: z.enum(CONFIDENCES),
  title: z.string().min(3),
  description: z.string().min(10),
  affectedUsers: z.string().min(5),
  whyItMatters: z.string().min(10),
  howToFix: z.string().min(10),
  priorityReason: z.string().min(10),
  priorityScore: z.number().positive(),
  steps: z.array(z.string()).min(1),
  rule: z.string().min(1),
  detectedBy: z.string().min(1),
  fingerprint: z.string().min(1),
  status: z.string(),
});
