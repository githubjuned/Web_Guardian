import type { CategoryScores, Category, Issue, SeverityCounts } from '@webguardian/shared';
import { CATEGORIES } from '@webguardian/shared';
import { CATEGORY_LABEL, SEVERITY_ORDER, capitalize, scoreColor } from '../utils/format';

function Ring({ score, size = 76 }: { score: number | null; size?: number }) {
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  const pct = score === null ? 0 : score / 100;
  const color = score === null ? '#3b4166' : score >= 90 ? '#34d399' : score >= 50 ? '#facc15' : '#fb7185';
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1f2753" strokeWidth="7" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={`${c * pct} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dasharray .6s ease' }}
      />
    </svg>
  );
}

export function ScoreCard({ label, score, issues, hint }: { label: string; score: number | null; issues?: number; hint?: string }) {
  return (
    <div className="card flex items-center gap-4 p-4">
      <div className="relative">
        <Ring score={score} />
        <span className={`absolute inset-0 flex items-center justify-center text-lg font-bold ${scoreColor(score)}`}>{score ?? '—'}</span>
      </div>
      <div className="min-w-0">
        <p className="font-semibold">{label}</p>
        <p className="text-xs text-fg-muted">
          {score === null ? (hint ?? 'Unavailable') : issues !== undefined ? `${issues} issue${issues === 1 ? '' : 's'}` : hint}
        </p>
      </div>
    </div>
  );
}

export function CategoryScoreGrid({ scores, issues }: { scores: CategoryScores; issues: Issue[] }) {
  const count = (c: Category) => issues.filter((i) => i.category === c).length;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {CATEGORIES.map((c) => (
        <ScoreCard key={c} label={CATEGORY_LABEL[c]} score={scores[c]} issues={count(c)} hint="Detector unavailable" />
      ))}
    </div>
  );
}

const SEV_STYLE = {
  critical: 'text-sev-critical border-sev-critical/30',
  high: 'text-sev-high border-sev-high/30',
  medium: 'text-sev-medium border-sev-medium/30',
  low: 'text-sev-low border-sev-low/30',
};

export function IssueSummaryCards({ counts, total, onSelect, selected }: { counts: SeverityCounts; total: number; onSelect?: (s: keyof SeverityCounts | null) => void; selected?: string | null }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      <button
        type="button"
        onClick={() => onSelect?.(null)}
        aria-pressed={!selected}
        className={`card card-hover p-4 text-left ${!selected ? 'ring-1 ring-brand-400/60' : ''}`}
      >
        <p className="text-3xl font-bold">{total}</p>
        <p className="text-sm text-fg-muted">Issues found</p>
      </button>
      {SEVERITY_ORDER.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onSelect?.(selected === s ? null : s)}
          aria-pressed={selected === s}
          className={`card card-hover border p-4 text-left ${SEV_STYLE[s]} ${selected === s ? 'ring-1 ring-current' : ''}`}
        >
          <p className="text-3xl font-bold">{counts[s]}</p>
          <p className="text-sm">{capitalize(s)}</p>
        </button>
      ))}
    </div>
  );
}
