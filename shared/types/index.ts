/**
 * Shared domain types for WebGuardian AI.
 * Imported by both the backend (Express) and the frontend (React).
 */

export const CATEGORIES = ['accessibility', 'seo', 'performance', 'functionality', 'ux'] as const;
export type Category = (typeof CATEGORIES)[number];

export const PERSONAS = ['keyboard', 'screen-reader', 'low-vision', 'slow-device', 'first-time-visitor'] as const;
export type Persona = (typeof PERSONAS)[number];

export const SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const CONFIDENCES = ['high', 'medium', 'low'] as const;
export type Confidence = (typeof CONFIDENCES)[number];

export const AUDIT_STATUSES = [
  'queued',
  'initializing',
  'crawling',
  'testing',
  'analyzing',
  'generating_report',
  'completed',
  'failed',
  'verifying',
  'verified',
] as const;
export type AuditStatus = (typeof AUDIT_STATUSES)[number];

export type IssueStatus =
  | 'open'
  | 'fix_proposed'
  | 'fix_applied'
  | 'fix_rejected'
  | 'resolved'
  | 'still_present';

export type DetectorName = 'axe-core' | 'keyboard-persona' | 'seo' | 'performance' | 'lighthouse' | 'functionality' | 'mobile-ux';
export type DetectorState = 'pending' | 'running' | 'completed' | 'unavailable' | 'failed';

export interface CategoryScores {
  accessibility: number | null;
  seo: number | null;
  performance: number | null;
  functionality: number | null;
  ux: number | null;
  overall: number | null;
}

export type SeverityCounts = Record<Severity, number>;

export interface PageResult {
  url: string;
  title: string | null;
  status: 'scanned' | 'failed';
  httpStatus?: number | null;
  error?: string;
  screenshot?: string | null;
  loadTimeMs?: number | null;
}

export interface AiPriority {
  issueId: string;
  reason: string;
}

export interface AiSummary {
  summary: string;
  overallRisk: 'critical' | 'high' | 'medium' | 'low';
  topPriorities: AiPriority[];
  quickWins: string[];
  generatedAt: string;
  model: string;
}

export interface LighthouseSummary {
  url: string;
  performance: number | null;
  accessibility: number | null;
  seo: number | null;
  bestPractices: number | null;
  lcpMs: number | null;
  cls: number | null;
  tbtMs: number | null;
  totalBytes: number | null;
}

export interface Audit {
  id: string;
  url: string;
  maxPages: number;
  status: AuditStatus;
  progress: number;
  stage: string;
  pages: PageResult[];
  scoresBefore: CategoryScores | null;
  scoresAfter: CategoryScores | null;
  issueCounts: SeverityCounts;
  totalIssues: number;
  resolvedIssues: number;
  detectors: Partial<Record<DetectorName, DetectorState>>;
  aiSummary: AiSummary | null;
  lighthouse: LighthouseSummary | null;
  aiStatus: 'pending' | 'available' | 'unavailable';
  aiError?: string | null;
  sandboxId: string | null;
  lastVerification: AuditVerification | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiExplanation {
  whatHappened: string;
  whoItAffects: string;
  whyItMatters: string;
  howToFix: string;
  priority: Severity;
  priorityReason: string;
  beginnerExplanation: string;
  model: string;
  generatedAt: string;
}

export interface FixProposal {
  summary: string;
  explanation: string;
  risk: 'low' | 'medium' | 'high';
  /** Source file path (relative to the project) the fix applies to, if known. */
  file: string | null;
  oldCode: string;
  newCode: string;
  /** Unified diff computed server-side from oldCode/newCode. */
  diff: string;
  /** True only when the fix can be applied automatically (demo sandbox). */
  applicable: boolean;
  applicableReason: string;
  source: 'gemini';
  model: string;
  generatedAt: string;
  appliedAt?: string | null;
}

export interface Issue {
  id: string;
  /** Human-friendly number within the audit (#1 is the highest priority). */
  number: number;
  auditId: string;
  pageUrl: string;
  category: Category;
  persona: Persona;
  severity: Severity;
  priorityScore: number;
  priorityReason: string;
  confidence: Confidence;
  title: string;
  description: string;
  affectedUsers: string;
  whyItMatters: string;
  howToFix: string;
  selector: string | null;
  htmlSnippet: string | null;
  screenshotPath: string | null;
  steps: string[];
  rule: string;
  detectedBy: string;
  helpUrl: string | null;
  fingerprint: string;
  metrics: Record<string, unknown> | null;
  ai: AiExplanation | null;
  fix: FixProposal | null;
  status: IssueStatus;
  createdAt: string;
}

export interface AuditEvent {
  id: number;
  auditId: string;
  timestamp: string;
  type:
    | 'status'
    | 'step'
    | 'action'
    | 'issue'
    | 'warning'
    | 'error'
    | 'ai'
    | 'progress'
    | 'done';
  message: string;
  metadata?: Record<string, unknown> | null;
}

export interface Verification {
  id: string;
  issueId: string | null;
  auditId: string;
  beforeResult: Record<string, unknown>;
  afterResult: Record<string, unknown>;
  status: 'resolved' | 'still_present' | 'completed' | 'failed';
  createdAt: string;
}

export interface AuditVerification {
  id: string;
  scoresBefore: CategoryScores;
  scoresAfter: CategoryScores;
  issuesBefore: number;
  issuesAfter: number;
  resolved: number;
  remaining: number;
  newIssues: number;
  resolvedIssueIds: string[];
  newIssueTitles: string[];
  pagesAfter: PageResult[];
  createdAt: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  citedIssueIds?: string[];
}

export interface CreateAuditRequest {
  url: string;
  maxPages?: number;
}

export interface CreateAuditResponse {
  auditId: string;
  status: AuditStatus;
}

export interface ApiError {
  error: string;
  details?: unknown;
}
