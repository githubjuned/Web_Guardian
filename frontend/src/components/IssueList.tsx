import { useMemo, useState } from 'react';
import type { Category, Issue, Persona, Severity } from '@webguardian/shared';
import { CATEGORIES, PERSONAS } from '@webguardian/shared';
import { Camera, ChevronRight, Wrench } from 'lucide-react';
import { CategoryBadge, ConfidenceBadge, IssueStatusBadge, PersonaBadge, SeverityBadge } from './Badges';
import { EmptyState } from './States';
import { CATEGORY_LABEL, PERSONA_LABEL, shortUrl } from '../utils/format';

export function IssueCard({ issue, onOpen, active }: { issue: Issue; onOpen: () => void; active: boolean }) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-current={active ? 'true' : undefined}
        className={`card card-hover group flex w-full items-start gap-4 p-4 text-left ${active ? 'border-brand-400/60 bg-ink-800' : ''}`}
      >
        <span className="mt-0.5 w-9 shrink-0 font-mono text-sm text-fg-subtle">#{issue.number}</span>
        <span className="min-w-0 flex-1 space-y-2">
          <span className="flex flex-wrap items-center gap-1.5">
            <SeverityBadge severity={issue.severity} />
            <CategoryBadge category={issue.category} />
            <PersonaBadge persona={issue.persona} />
            {issue.status !== 'open' && <IssueStatusBadge status={issue.status} />}
          </span>
          <span className="block font-semibold text-fg">{issue.title}</span>
          <span className="line-clamp-2 block text-sm text-fg-muted">{issue.ai?.whatHappened ?? issue.description}</span>
          <span className="flex flex-wrap items-center gap-3 text-xs text-fg-subtle">
            <span className="font-mono">{shortUrl(issue.pageUrl)}</span>
            {issue.selector && <code className="max-w-[220px] truncate rounded bg-ink-950 px-1.5 py-0.5">{issue.selector}</code>}
            <ConfidenceBadge confidence={issue.confidence} />
            {issue.screenshotPath && (
              <span className="flex items-center gap-1">
                <Camera className="h-3 w-3" aria-hidden="true" /> Evidence
              </span>
            )}
            {issue.fix && (
              <span className="flex items-center gap-1 text-azure-400">
                <Wrench className="h-3 w-3" aria-hidden="true" /> Fix available
              </span>
            )}
          </span>
        </span>
        <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </button>
    </li>
  );
}

interface Filters {
  category: Category | 'all';
  persona: Persona | 'all';
  status: 'all' | 'open' | 'resolved';
}

export function IssueList({
  issues,
  severity,
  activeId,
  onOpen,
}: {
  issues: Issue[];
  severity: Severity | null;
  activeId: string | null;
  onOpen: (issue: Issue) => void;
}) {
  const [filters, setFilters] = useState<Filters>({ category: 'all', persona: 'all', status: 'all' });
  const filtered = useMemo(
    () =>
      issues.filter(
        (i) =>
          (!severity || i.severity === severity) &&
          (filters.category === 'all' || i.category === filters.category) &&
          (filters.persona === 'all' || i.persona === filters.persona) &&
          (filters.status === 'all' || (filters.status === 'resolved' ? i.status === 'resolved' : i.status !== 'resolved')),
      ),
    [issues, severity, filters],
  );

  return (
    <section aria-labelledby="issues-heading" className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <h2 id="issues-heading" className="mr-auto text-lg font-semibold">
          Issues <span className="text-fg-subtle">({filtered.length})</span>
        </h2>
        <FilterSelect
          label="Category"
          value={filters.category}
          onChange={(v) => setFilters((f) => ({ ...f, category: v as Filters['category'] }))}
          options={CATEGORIES.map((c) => [c, CATEGORY_LABEL[c]])}
        />
        <FilterSelect
          label="Persona"
          value={filters.persona}
          onChange={(v) => setFilters((f) => ({ ...f, persona: v as Filters['persona'] }))}
          options={PERSONAS.map((p) => [p, PERSONA_LABEL[p]])}
        />
        <FilterSelect
          label="Status"
          value={filters.status}
          onChange={(v) => setFilters((f) => ({ ...f, status: v as Filters['status'] }))}
          options={[
            ['open', 'Open'],
            ['resolved', 'Resolved'],
          ]}
        />
      </div>
      {filtered.length === 0 ? (
        <EmptyState title={issues.length === 0 ? 'No issues found' : 'No issues match these filters'} message={issues.length === 0 ? 'The detectors did not find any problems on the scanned pages.' : undefined} />
      ) : (
        <ul className="space-y-2">
          {filtered.map((i) => (
            <IssueCard key={i.id} issue={i} active={i.id === activeId} onOpen={() => onOpen(i)} />
          ))}
        </ul>
      )}
    </section>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-fg-muted">
      {label}
      <select className="input py-2 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="all">All</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}
