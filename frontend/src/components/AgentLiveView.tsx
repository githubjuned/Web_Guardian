import { useEffect, useRef, useState } from 'react';
import type { AuditEvent } from '@webguardian/shared';
import { AlertTriangle, Bot, CheckCircle2, ChevronRight, Keyboard, Sparkles, XCircle, Lock } from 'lucide-react';
import type { LiveFrame } from '../hooks/useAuditStream';

const TYPE_STYLE: Record<AuditEvent['type'], { icon: typeof Bot; style: string }> = {
  status: { icon: Bot, style: 'text-brand-300' },
  step: { icon: CheckCircle2, style: 'text-fg' },
  action: { icon: ChevronRight, style: 'text-fg-muted' },
  issue: { icon: AlertTriangle, style: 'text-sev-high' },
  warning: { icon: AlertTriangle, style: 'text-sev-medium' },
  error: { icon: XCircle, style: 'text-sev-critical' },
  ai: { icon: Sparkles, style: 'text-azure-400' },
  progress: { icon: ChevronRight, style: 'text-fg-muted' },
  done: { icon: CheckCircle2, style: 'text-ok' },
};

/**
 * The "watch the agent work" view: a browser-like viewport streaming what the
 * headless browser sees, next to the agent's live activity feed.
 */
export function AgentLiveView({ frame, events, running }: { frame: LiveFrame | null; events: AuditEvent[]; running: boolean }) {
  const feedRef = useRef<HTMLOListElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const lastIssue = [...events].reverse().find((e) => e.type === 'issue');
  const currentAction = [...events].reverse().find((e) => e.type === 'action' || e.type === 'step');

  useEffect(() => {
    const el = feedRef.current;
    if (el && autoScroll) el.scrollTop = el.scrollHeight;
  }, [events, autoScroll]);

  return (
    <section aria-labelledby="live-heading" className="grid gap-4 lg:grid-cols-[1.45fr_1fr]">
      <h2 id="live-heading" className="sr-only">
        Live agent view
      </h2>
      {/* Browser viewport */}
      <figure className="card overflow-hidden">
        <div className="flex items-center gap-3 border-b border-line bg-ink-800 px-4 py-2.5">
          <div className="flex gap-1.5" aria-hidden="true">
            <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
            <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
            <span className="h-3 w-3 rounded-full bg-[#28c840]" />
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-ink-950 px-3 py-1.5 font-mono text-xs text-fg-muted">
            <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{frame?.url ?? 'about:blank'}</span>
          </div>
          {running && (
            <span className="chip border-sev-critical/40 bg-sev-critical/10 text-sev-critical">
              <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-current" aria-hidden="true" />
              LIVE
            </span>
          )}
        </div>
        <div className="relative aspect-[16/10] bg-ink-950">
          {frame ? (
            <img
              src={`data:image/jpeg;base64,${frame.data}`}
              alt={`What the agent's browser currently shows: ${frame.caption}`}
              className="h-full w-full object-cover object-top"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-fg-subtle">
              {running ? 'Waiting for the browser to open the website…' : 'No live frame recorded.'}
            </div>
          )}
          {frame && (
            <figcaption className="absolute right-3 bottom-3 left-3 flex items-center gap-2 rounded-lg bg-ink-950/85 px-3 py-2 text-xs text-fg backdrop-blur">
              <Keyboard className="h-3.5 w-3.5 shrink-0 text-brand-300" aria-hidden="true" />
              <span className="truncate">{frame.caption}</span>
            </figcaption>
          )}
        </div>
      </figure>

      {/* Activity feed */}
      <div className="card flex max-h-[560px] min-h-[360px] flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <Bot className="h-4 w-4 text-brand-300" aria-hidden="true" />
          <h3 className="text-sm font-semibold tracking-wide">{running ? 'AI AGENT ACTIVE' : 'AGENT ACTIVITY'}</h3>
          <label className="ml-auto flex items-center gap-1.5 text-xs text-fg-subtle">
            <input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} className="accent-brand-500" />
            Follow
          </label>
        </div>
        {currentAction && running && (
          <div className="border-b border-line bg-ink-800/60 px-4 py-2.5">
            <p className="text-[11px] font-semibold tracking-wider text-fg-subtle">CURRENT ACTION</p>
            <p className="truncate font-mono text-xs text-fg">{currentAction.message}</p>
          </div>
        )}
        <ol ref={feedRef} className="flex-1 space-y-1 overflow-y-auto px-3 py-3 font-mono text-xs" aria-label="Agent activity log">
          {events.length === 0 && <li className="px-1 text-fg-subtle">Connecting to the agent…</li>}
          {events.map((e) => {
            const t = TYPE_STYLE[e.type] ?? TYPE_STYLE.step;
            const Icon = t.icon;
            const isTrap = e.type === 'issue' && /ISSUE FOUND/.test(e.message);
            return (
              <li
                key={e.id}
                className={`animate-feed-in flex gap-2 rounded-md px-1.5 py-1 ${isTrap ? 'border border-sev-critical/40 bg-sev-critical/10' : ''} ${t.style}`}
              >
                <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="break-words">{e.message}</span>
              </li>
            );
          })}
        </ol>
        {lastIssue && (
          <div className="border-t border-line bg-sev-high/10 px-4 py-2.5" role="status">
            <p className="text-[11px] font-semibold tracking-wider text-sev-high">LATEST ISSUE DETECTED</p>
            <p className="truncate text-xs text-fg">{lastIssue.message.replace(/^⚠\s*/, '')}</p>
          </div>
        )}
      </div>
    </section>
  );
}
