import type { Audit } from '@webguardian/shared';
import { CATEGORIES } from '@webguardian/shared';
import { ArrowRight, CheckCircle2, CircleDot, Sparkle } from 'lucide-react';
import { CATEGORY_LABEL, scoreColor } from '../utils/format';
import { assetUrl } from '../services/api';

/** Website health before vs. after the verification re-test. Every number comes from a real re-run. */
export function BeforeAfterComparison({ audit }: { audit: Audit }) {
  const v = audit.lastVerification;
  if (!v) return null;
  const rows = [...CATEGORIES.map((c) => ({ key: c, label: CATEGORY_LABEL[c] })), { key: 'overall' as const, label: 'Overall' }];
  const beforeShot = assetUrl(audit.pages.find((p) => p.status === 'scanned')?.screenshot);
  const afterShot = assetUrl(v.pagesAfter.find((p) => p.status === 'scanned')?.screenshot);

  return (
    <section aria-labelledby="ba-heading" className="card overflow-hidden">
      <div className="glow border-b border-line px-6 py-5">
        <p className="eyebrow">Verified by re-testing</p>
        <h2 id="ba-heading" className="mt-1 text-xl font-bold">
          Website health: before → after
        </h2>
        <p className="mt-1 text-sm text-fg-muted">
          WebGuardian re-ran every persona and detector on the same {v.pagesAfter.filter((p) => p.status === 'scanned').length} page(s) on{' '}
          {new Date(v.createdAt).toLocaleString()}.
        </p>
      </div>

      <div className="grid gap-6 p-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            <Stat label="Issues before" value={v.issuesBefore} tone="text-fg" />
            <Stat label="Issues after" value={v.issuesAfter} tone="text-fg" />
            <Stat label="Resolved" value={v.resolved} tone="text-ok" icon={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />} />
            <Stat label="Remaining" value={v.remaining} tone="text-sev-medium" icon={<CircleDot className="h-4 w-4" aria-hidden="true" />} />
            <Stat label="New" value={v.newIssues} tone={v.newIssues ? 'text-sev-high' : 'text-fg-subtle'} icon={<Sparkle className="h-4 w-4" aria-hidden="true" />} />
            <Stat
              label="Overall"
              value={
                <span>
                  {v.scoresBefore.overall ?? '—'}
                  <ArrowRight className="mx-1 inline h-4 w-4 text-fg-subtle" aria-label="to" />
                  <span className={scoreColor(v.scoresAfter.overall)}>{v.scoresAfter.overall ?? '—'}</span>
                </span>
              }
              tone="text-fg"
            />
          </div>
          <table className="w-full text-sm">
            <caption className="sr-only">Category scores before and after</caption>
            <thead>
              <tr className="text-left text-xs text-fg-subtle">
                <th scope="col" className="py-2 font-medium">
                  Category
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Before
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  After
                </th>
                <th scope="col" className="py-2 pl-3 font-medium">
                  <span className="sr-only">Change</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const b = v.scoresBefore[r.key];
                const a = v.scoresAfter[r.key];
                const delta = a !== null && b !== null ? a - b : null;
                return (
                  <tr key={r.key} className={`border-t border-line ${r.key === 'overall' ? 'font-semibold' : ''}`}>
                    <th scope="row" className="py-2 text-left font-normal">
                      {r.label}
                    </th>
                    <td className={`py-2 text-right font-mono ${scoreColor(b)}`}>{b ?? '—'}</td>
                    <td className={`py-2 text-right font-mono ${scoreColor(a)}`}>{a ?? '—'}</td>
                    <td className="w-24 py-2 pl-3">
                      {delta !== null && (
                        <span className={`font-mono text-xs ${delta > 0 ? 'text-ok' : delta < 0 ? 'text-sev-critical' : 'text-fg-subtle'}`}>
                          {delta > 0 ? `▲ +${delta}` : delta < 0 ? `▼ ${delta}` : '—'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {v.newIssueTitles.length > 0 && (
            <div className="rounded-lg border border-sev-high/30 bg-sev-high/5 p-3 text-xs text-fg-muted">
              <p className="mb-1 font-semibold text-sev-high">Newly detected after the change</p>
              <ul className="list-disc space-y-0.5 pl-4">
                {v.newIssueTitles.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'BEFORE', src: beforeShot, tone: 'text-sev-critical' },
            { label: 'AFTER', src: afterShot, tone: 'text-ok' },
          ].map((s) => (
            <figure key={s.label} className="overflow-hidden rounded-xl border border-line bg-ink-950">
              <figcaption className={`px-3 py-1.5 text-xs font-semibold tracking-wider ${s.tone}`}>{s.label}</figcaption>
              {s.src && <img src={s.src} alt={`Homepage ${s.label.toLowerCase()} the fixes`} className="h-72 w-full object-cover object-top" />}
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value, tone, icon }: { label: string; value: React.ReactNode; tone: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-ink-800/60 p-3">
      <p className={`flex items-center justify-center gap-1 text-2xl font-bold ${tone}`}>
        {icon}
        {value}
      </p>
      <p className="text-xs text-fg-muted">{label}</p>
    </div>
  );
}
