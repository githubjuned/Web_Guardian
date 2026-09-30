import { useEffect, useState } from 'react';
import { Keyboard, Accessibility, Eye, Gauge, Search } from 'lucide-react';
import { AuditForm } from '../components/AuditForm';
import { api, type ServerConfig } from '../services/api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export function NewAuditPage() {
  useDocumentTitle('Start an audit');
  const [config, setConfig] = useState<ServerConfig | null>(null);
  useEffect(() => {
    api.config().then(setConfig).catch(() => setConfig(null));
  }, []);

  return (
    <div className="relative">
      <div className="glow absolute inset-x-0 top-0 h-80" aria-hidden="true" />
      <div className="container-page relative grid gap-10 py-14 lg:grid-cols-[1.3fr_1fr]">
        <div>
          <p className="eyebrow">New audit</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Give WebGuardian a website</h1>
          <p className="mt-3 mb-8 text-fg-muted">
            The agent opens it in a real browser, tests it as five kinds of users, and backs every finding with evidence.
          </p>
          <AuditForm maxPagesLimit={config?.maxPagesLimit ?? 3} />
        </div>
        <aside className="space-y-4 lg:pt-24" aria-label="What happens during an audit">
          <div className="card p-6">
            <h2 className="font-semibold">What the agent will do</h2>
            <ul className="mt-4 space-y-3 text-sm text-fg-muted">
              {[
                [Keyboard, 'Navigate with Tab, Enter and Escape only — no mouse'],
                [Accessibility, 'Inspect names, labels, headings and landmarks'],
                [Eye, 'Measure text contrast against WCAG AA'],
                [Gauge, 'Load the page on a phone viewport and measure its weight'],
                [Search, 'Check title, description, H1, links and script errors'],
              ].map(([Icon, text]) => {
                const I = Icon as typeof Keyboard;
                return (
                  <li key={text as string} className="flex gap-3">
                    <I className="mt-0.5 h-4 w-4 shrink-0 text-brand-300" aria-hidden="true" />
                    {text as string}
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="card p-6 text-sm text-fg-muted">
            <p>
              <strong className="text-fg">Typical duration:</strong> 20–60 seconds for 3 pages.
            </p>
            <p className="mt-2">
              <strong className="text-fg">AI:</strong>{' '}
              {config ? (config.aiConfigured ? `Gemini (${config.aiModel}) is connected on the server.` : 'Gemini is not configured on this server — results will use rule-based explanations.') : 'Checking…'}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
