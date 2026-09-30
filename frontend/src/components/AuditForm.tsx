import { useId, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Globe, Info, Loader2, Sparkles, FlaskConical } from 'lucide-react';
import { api } from '../services/api';
import { validateWebsiteUrl } from '../utils/validation';

export function AuditForm({ maxPagesLimit = 3 }: { maxPagesLimit?: number }) {
  const navigate = useNavigate();
  const [url, setUrl] = useState('');
  const [maxPages, setMaxPages] = useState(maxPagesLimit);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'custom' | 'demo' | null>(null);
  const urlId = useId();
  const pagesId = useId();
  const errorId = useId();

  async function start(target: string, kind: 'custom' | 'demo') {
    setBusy(kind);
    setError(null);
    try {
      const { auditId } = await api.createAudit(target, maxPages);
      navigate(`/audits/${auditId}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const result = validateWebsiteUrl(url);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await start(result.url, 'custom');
  }

  async function onDemo() {
    setBusy('demo');
    setError(null);
    try {
      const sandbox = await api.createDemoSandbox();
      await start(sandbox.url, 'demo');
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={onSubmit} noValidate className="card space-y-5 p-6 sm:p-8">
        <div>
          <label htmlFor={urlId} className="label">
            Website URL
          </label>
          <div className="relative">
            <Globe className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-fg-subtle" aria-hidden="true" />
            <input
              id={urlId}
              name="url"
              type="url"
              inputMode="url"
              autoComplete="url"
              placeholder="https://example.com"
              className="input pl-12 text-base"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              aria-invalid={!!error}
              aria-describedby={error ? errorId : undefined}
              disabled={!!busy}
            />
          </div>
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="sm:w-48">
            <label htmlFor={pagesId} className="label">
              Maximum pages
            </label>
            <select id={pagesId} className="input" value={maxPages} onChange={(e) => setMaxPages(Number(e.target.value))} disabled={!!busy}>
              {Array.from({ length: maxPagesLimit }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? 'page' : 'pages'}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-primary px-6 py-3 text-base sm:ml-auto" disabled={!!busy}>
            {busy === 'custom' ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Sparkles className="h-5 w-5" aria-hidden="true" />}
            {busy === 'custom' ? 'Starting agent…' : 'Start AI Audit'}
          </button>
        </div>
        {error && (
          <p id={errorId} role="alert" className="rounded-xl border border-sev-critical/40 bg-sev-critical/10 px-4 py-3 text-sm text-sev-critical">
            {error}
          </p>
        )}
        <p className="flex items-start gap-2 text-sm text-fg-muted">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          WebGuardian currently supports public websites. Login-protected pages are not supported in the MVP. Only audit sites you own or are authorised to test.
        </p>
      </form>

      <div className="card flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 text-brand-300">
          <FlaskConical className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="flex-1">
          <h2 className="font-semibold">Try the full loop on our demo store</h2>
          <p className="text-sm text-fg-muted">
            Brewly is a realistic coffee shop with real, hidden defects. You get a private copy, so you can approve AI fixes and watch WebGuardian verify them.
          </p>
        </div>
        <button type="button" className="btn-secondary" onClick={onDemo} disabled={!!busy}>
          {busy === 'demo' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {busy === 'demo' ? 'Preparing demo…' : 'Audit the demo site'}
        </button>
      </div>
    </div>
  );
}
