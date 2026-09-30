import type { Category, Confidence, Persona, Severity } from '@webguardian/shared';

/**
 * A factual finding produced by a deterministic detector or persona.
 * Every finding carries its own evidence. Gemini never creates findings.
 */
export interface RawFinding {
  pageUrl: string;
  category: Category;
  persona: Persona;
  /** Severity reported by the detector, before prioritisation. */
  baseSeverity: Severity;
  confidence: Confidence;
  title: string;
  description: string;
  selector: string | null;
  htmlSnippet: string | null;
  steps: string[];
  rule: string;
  detectedBy: string;
  helpUrl: string | null;
  metrics?: Record<string, unknown> | null;
  /** Extra discriminator for the fingerprint (e.g. the broken href). */
  fingerprintKey?: string;
  /** Screenshot captured at the moment of detection (relative path). */
  screenshotPath?: string | null;
}

export interface DetectorContext {
  auditId: string;
  pageUrl: string;
  pageIndex: number;
  log: (message: string, type?: 'step' | 'action' | 'warning' | 'issue') => void;
  frame: (caption: string) => Promise<void>;
  screenshot: (name: string, highlightSelector?: string | null) => Promise<string | null>;
}
