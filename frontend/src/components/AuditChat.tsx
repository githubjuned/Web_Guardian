import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { ChatMessage, Issue } from '@webguardian/shared';
import { Bot, Loader2, MessageSquare, Send, User, X } from 'lucide-react';
import { api } from '../services/api';

const SUGGESTIONS = [
  'What should I fix first?',
  'Which issues affect keyboard users?',
  'How many accessibility issues were found?',
  'Explain issue #1 like I’m a beginner.',
  'Show all high-priority issues.',
];

/** Minimal markdown-ish rendering: bullets and #issue references become links. */
function MessageBody({ text, issues, onOpen }: { text: string; issues: Issue[]; onOpen: (i: Issue) => void }) {
  const lines = text.split('\n');
  const renderInline = (line: string, key: number) => {
    const parts = line.split(/(#\d+)/g);
    return (
      <span key={key}>
        {parts.map((p, i) => {
          const m = p.match(/^#(\d+)$/);
          const issue = m ? issues.find((x) => x.number === Number(m[1])) : undefined;
          return issue ? (
            <button key={i} type="button" className="font-mono text-azure-400 underline-offset-2 hover:underline" onClick={() => onOpen(issue)}>
              {p}
            </button>
          ) : (
            <span key={i}>{p.replace(/\*\*(.+?)\*\*/g, '$1')}</span>
          );
        })}
      </span>
    );
  };
  const bullets = lines.filter((l) => /^\s*[-*•]\s+/.test(l));
  if (bullets.length >= 2) {
    const intro = lines.filter((l) => l.trim() && !/^\s*[-*•]\s+/.test(l));
    return (
      <div className="space-y-2">
        {intro.map((l, i) => (
          <p key={i}>{renderInline(l, i)}</p>
        ))}
        <ul className="list-disc space-y-1 pl-4">
          {bullets.map((b, i) => (
            <li key={i}>{renderInline(b.replace(/^\s*[-*•]\s+/, ''), i)}</li>
          ))}
        </ul>
      </div>
    );
  }
  return <p className="whitespace-pre-wrap">{lines.map((l, i) => (i ? [<br key={`b${i}`} />, renderInline(l, i)] : renderInline(l, i)))}</p>;
}

export function AuditChat({ auditId, issues, aiConfigured, enabled, onOpen }: { auditId: string; issues: Issue[]; aiConfigured: boolean; enabled: boolean; onOpen: (i: Issue) => void }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inputId = useId();

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    const history = messages;
    setMessages((m) => [...m, { role: 'user', content: q }]);
    setInput('');
    setBusy(true);
    setError(null);
    try {
      const reply = await api.chat(auditId, q, history);
      setMessages((m) => [...m, reply]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void ask(input);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-primary fixed right-4 bottom-4 z-30 rounded-full px-5 py-3 shadow-2xl sm:right-6 sm:bottom-6"
        aria-haspopup="dialog"
      >
        <MessageSquare className="h-5 w-5" aria-hidden="true" />
        Ask about this audit
      </button>
    );
  }

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby="chat-title"
      className="fixed right-2 bottom-2 left-2 z-30 flex rounded-2xl border border-line-strong bg-ink-850 h-[min(620px,85vh)] flex-col shadow-2xl sm:right-6 sm:bottom-6 sm:left-auto sm:w-[420px]"
      onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
    >
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <Bot className="h-5 w-5 text-brand-300" aria-hidden="true" />
        <div className="flex-1">
          <h2 id="chat-title" className="text-sm font-semibold">
            Audit chat · Gemini
          </h2>
          <p className="text-[11px] text-fg-subtle">Answers only from this audit's evidence</p>
        </div>
        <button type="button" className="btn-ghost p-1.5" onClick={() => setOpen(false)} aria-label="Close chat">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>

      <div ref={logRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4 text-sm" aria-live="polite" aria-busy={busy}>
        {!enabled && <p className="text-fg-muted">Chat becomes available once the audit has finished.</p>}
        {enabled && !aiConfigured && <p className="text-sev-medium">AI chat is temporarily unavailable (Gemini is not configured on the server).</p>}
        {enabled && aiConfigured && messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-fg-muted">Ask anything about the findings. Try:</p>
            <ul className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <li key={s}>
                  <button type="button" className="chip border-line-strong bg-ink-800 py-1 text-fg-muted hover:text-fg" onClick={() => ask(s)}>
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${m.role === 'user' ? 'bg-ink-600' : 'bg-brand-500/20 text-brand-300'}`}>
              {m.role === 'user' ? <User className="h-3.5 w-3.5" aria-hidden="true" /> : <Bot className="h-3.5 w-3.5" aria-hidden="true" />}
              <span className="sr-only">{m.role === 'user' ? 'You' : 'WebGuardian'}</span>
            </span>
            <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 leading-relaxed ${m.role === 'user' ? 'bg-brand-600/30' : 'bg-ink-800 text-fg'}`}>
              <MessageBody text={m.content} issues={issues} onOpen={onOpen} />
            </div>
          </div>
        ))}
        {busy && (
          <p className="flex items-center gap-2 text-fg-muted">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Gemini is reading the audit…
          </p>
        )}
        {error && (
          <p role="alert" className="text-sev-critical">
            {error}
          </p>
        )}
      </div>

      <form onSubmit={onSubmit} className="flex gap-2 border-t border-line p-3">
        <label htmlFor={inputId} className="sr-only">
          Ask a question about this audit
        </label>
        <input
          id={inputId}
          className="input py-2.5 text-sm"
          placeholder="What should I fix first?"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={!enabled || !aiConfigured || busy}
          maxLength={1000}
          autoComplete="off"
        />
        <button type="submit" className="btn-primary px-3" disabled={!enabled || !aiConfigured || busy || !input.trim()} aria-label="Send question">
          <Send className="h-4 w-4" aria-hidden="true" />
        </button>
      </form>
    </section>
  );
}
