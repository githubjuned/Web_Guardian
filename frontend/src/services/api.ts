/**
 * Typed client for the WebGuardian backend. The frontend never talks to Gemini
 * directly — every AI call goes through these backend endpoints.
 */
import type { Audit, ChatMessage, CreateAuditResponse, Issue } from '@webguardian/shared';

/** Empty string = same origin (dev proxy or single-service deployment). */
export const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    });
  } catch {
    throw new ApiError('Cannot reach the WebGuardian server. Check your connection and try again.', 0);
  }
  const text = await res.text();
  const body = text ? safeJson(text) : null;
  if (!res.ok) {
    const b = body as { error?: string; details?: unknown } | null;
    const detail = typeof b?.details === 'string' ? ` ${b.details}` : '';
    throw new ApiError((b?.error ?? `Request failed (${res.status})`) + detail, res.status, b?.details);
  }
  return body as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { error: text.slice(0, 200) };
  }
}

const post = <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

export interface ServerConfig {
  maxPagesLimit: number;
  aiConfigured: boolean;
  aiModel: string;
  demoAvailable: boolean;
  publicBaseUrl: string;
}

export interface IssueVerificationResult {
  verification: {
    id: string;
    status: 'resolved' | 'still_present';
    before: { present: boolean; evidence: string; screenshot: string | null; pageFindings: number };
    after: { present: boolean; evidence: string; screenshot: string | null; sameRuleElsewhere: number; pageFindings: number };
    checkedBy: string;
    createdAt: string;
  };
  issue: Issue;
}

export const api = {
  config: () => request<ServerConfig>('/api/config'),
  listAudits: () => request<Audit[]>('/api/audits'),
  createAudit: (url: string, maxPages: number) => post<CreateAuditResponse>('/api/audits', { url, maxPages }),
  getAudit: (id: string) => request<Audit>(`/api/audits/${id}`),
  getIssues: (id: string) => request<Issue[]>(`/api/audits/${id}/issues`),
  verifyAudit: (id: string) => post<Audit>(`/api/audits/${id}/verify`),
  retryAi: (id: string) => post<Audit>(`/api/audits/${id}/ai`),
  chat: (id: string, question: string, history: ChatMessage[]) =>
    post<ChatMessage>(`/api/audits/${id}/chat`, { question, history: history.map(({ role, content }) => ({ role, content })) }),
  explainIssue: (id: string) => post<Issue>(`/api/issues/${id}/explain`),
  generateFix: (id: string) => post<Issue>(`/api/issues/${id}/fix`),
  applyFix: (id: string) => post<Issue>(`/api/issues/${id}/apply`, { approved: true }),
  rejectFix: (id: string) => post<Issue>(`/api/issues/${id}/reject`),
  verifyIssue: (id: string) => post<IssueVerificationResult>(`/api/issues/${id}/verify`),
  createDemoSandbox: () => post<{ sandboxId: string; url: string }>('/api/demo/sandbox'),
  reportUrl: (id: string) => `${API_BASE}/api/audits/${id}/report`,
  eventsUrl: (id: string) => `${API_BASE}/api/audits/${id}/events`,
};

/** Screenshots are served by the backend; prefix relative paths with the API origin. */
export function assetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return /^https?:/.test(path) ? path : `${API_BASE}${path}`;
}
