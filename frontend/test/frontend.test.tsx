import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Issue } from '@webguardian/shared';
import { validateWebsiteUrl } from '../src/utils/validation';
import { AuditForm } from '../src/components/AuditForm';
import { IssueCard } from '../src/components/IssueList';
import { FixDiffViewer } from '../src/components/FixDiffViewer';
import { ConfidenceBadge, SeverityBadge } from '../src/components/Badges';

afterEach(() => vi.restoreAllMocks());

describe('URL validation', () => {
  it('accepts http(s) URLs and adds https:// when missing', () => {
    expect(validateWebsiteUrl('example.com')).toEqual({ ok: true, url: 'https://example.com/' });
    expect(validateWebsiteUrl('http://shop.example.org/a')).toEqual({ ok: true, url: 'http://shop.example.org/a' });
  });

  it.each([
    ['', /enter a website/],
    ['ftp://example.com', /http/],
    ['javascript:alert(1)', /http/],
    ['https://nodot', /domain/],
    ['https://user:pw@example.com', /credentials/],
    ['exa mple.com', /valid/],
  ])('rejects %j', (input, message) => {
    const r = validateWebsiteUrl(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(message);
  });
});

function renderForm() {
  return render(
    <MemoryRouter initialEntries={['/audit']}>
      <Routes>
        <Route path="/audit" element={<AuditForm />} />
        <Route path="/audits/:id" element={<p>Audit page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AuditForm (critical flow: start an audit)', () => {
  it('has labelled inputs and shows validation errors without calling the API', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    renderForm();
    await userEvent.type(screen.getByLabelText('Website URL'), 'ftp://example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Start AI Audit' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Only http:// and https:// websites can be audited.');
    expect(screen.getByLabelText('Website URL')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Maximum pages')).toHaveValue('3');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('posts to the backend and navigates to the live audit', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ auditId: 'audit_abc', status: 'queued' }), { status: 202 }));
    renderForm();
    await userEvent.type(screen.getByLabelText('Website URL'), 'example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Start AI Audit' }));
    expect(await screen.findByText('Audit page')).toBeInTheDocument();
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/audits');
    expect(JSON.parse(String(init!.body))).toEqual({ url: 'https://example.com/', maxPages: 3 });
  });

  it('shows server errors (e.g. blocked private addresses)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: 'Private or local network addresses cannot be audited.' }), { status: 400 }));
    renderForm();
    await userEvent.type(screen.getByLabelText('Website URL'), 'https://intranet.example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Start AI Audit' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Private or local network addresses cannot be audited.');
  });

  it('states the MVP limitation', () => {
    renderForm();
    expect(screen.getByText(/Login-protected pages are not supported in the MVP/)).toBeInTheDocument();
  });
});

const issue: Issue = {
  id: 'issue_1',
  number: 1,
  auditId: 'audit_1',
  pageUrl: 'https://shop.example/',
  category: 'accessibility',
  persona: 'keyboard',
  severity: 'critical',
  priorityScore: 5,
  priorityReason: 'Critical priority',
  confidence: 'high',
  title: 'Keyboard focus is trapped inside #cookie-banner',
  description: 'Pressing Tab only cycles between 4 elements.',
  affectedUsers: 'Keyboard users',
  whyItMatters: 'Blocked',
  howToFix: 'Stop intercepting Tab',
  selector: '#cookie-banner',
  htmlSnippet: '<div id="cookie-banner"></div>',
  screenshotPath: '/api/screenshots/a/b.jpg',
  steps: ['Open'],
  rule: 'keyboard-focus-trap',
  detectedBy: 'WebGuardian keyboard persona',
  helpUrl: null,
  fingerprint: 'x',
  metrics: null,
  ai: null,
  fix: null,
  status: 'open',
  createdAt: new Date().toISOString(),
};

describe('issue presentation', () => {
  it('renders an issue card with severity, persona, confidence and evidence markers', async () => {
    const onOpen = vi.fn();
    render(
      <ul>
        <IssueCard issue={issue} onOpen={onOpen} active={false} />
      </ul>,
    );
    const button = screen.getByRole('button', { name: /Keyboard focus is trapped/ });
    expect(button).toHaveTextContent('critical');
    expect(button).toHaveTextContent('Keyboard-only');
    expect(button).toHaveTextContent('High confidence');
    expect(button).toHaveTextContent('Evidence');
    await userEvent.click(button);
    expect(onOpen).toHaveBeenCalled();
  });

  it('badges carry text, not colour alone', () => {
    render(
      <>
        <SeverityBadge severity="high" />
        <ConfidenceBadge confidence="medium" />
      </>,
    );
    expect(screen.getByText('high')).toBeInTheDocument();
    expect(screen.getByText('Medium confidence')).toBeInTheDocument();
  });

  it('shows an AI fix as before/after with risk and file', () => {
    render(
      <FixDiffViewer
        fix={{
          summary: 'Add an accessible label',
          explanation: 'Screen readers will announce "Open menu".',
          risk: 'low',
          file: 'index.html',
          oldCode: '<button class="menu">',
          newCode: '<button class="menu" aria-label="Open menu">',
          diff: '--- a/index.html\n+++ b/index.html\n@@ -1 +1 @@\n-<button class="menu">\n+<button class="menu" aria-label="Open menu">',
          applicable: true,
          applicableReason: '',
          source: 'gemini',
          model: 'gemini',
          generatedAt: '',
        }}
      />,
    );
    expect(screen.getByText('BEFORE')).toBeInTheDocument();
    expect(screen.getByText('AFTER')).toBeInTheDocument();
    expect(screen.getByText('Risk: low')).toBeInTheDocument();
    expect(screen.getByText('index.html')).toBeInTheDocument();
    expect(screen.getByText('<button class="menu" aria-label="Open menu">')).toBeInTheDocument();
  });
});
