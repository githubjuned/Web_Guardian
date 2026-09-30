import { Link } from 'react-router-dom';
import {
  Accessibility,
  ArrowDown,
  ArrowRight,
  Bot,
  Camera,
  CheckCircle2,
  Cloud,
  Code2,
  Cpu,
  Eye,
  FileSearch,
  Gauge,
  Globe,
  Keyboard,
  Layers,
  MessageSquare,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  Wand2,
  Briefcase,
} from 'lucide-react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const WORKFLOW = [
  { icon: Globe, label: 'Website' },
  { icon: Bot, label: 'AI agent' },
  { icon: Users, label: 'User simulation' },
  { icon: FileSearch, label: 'Problem detection' },
  { icon: Camera, label: 'Evidence' },
  { icon: Sparkles, label: 'AI explanation' },
  { icon: Wand2, label: 'Fix' },
  { icon: ShieldCheck, label: 'Verification' },
];

const LOOP = [
  { title: 'Scan', text: 'A real Chromium browser opens your site and crawls up to 3 pages.', icon: Globe },
  { title: 'Act as users', text: 'Personas navigate like real people: Tab-only, screen reader, low vision, slow phone, first-time visitor.', icon: Users },
  { title: 'Prove', text: 'axe-core, Lighthouse, DOM and accessibility-tree checks produce evidence: screenshots, selectors, HTML.', icon: Camera },
  { title: 'Explain', text: 'Gemini (on our backend) turns evidence into plain language: what, who, why and how.', icon: Sparkles },
  { title: 'Fix', text: 'Gemini proposes a minimal code diff. Nothing changes until you approve it.', icon: Wand2 },
  { title: 'Verify', text: 'The same deterministic tests run again. Only a passing re-test counts as fixed.', icon: RefreshCw },
];

const PERSONAS = [
  { icon: Keyboard, name: 'Keyboard-only user', text: 'Uses only Tab, Shift+Tab, Enter and Escape. Finds focus traps, invisible focus and unreachable navigation.', example: '“Keyboard focus is trapped inside the cookie banner.”' },
  { icon: Accessibility, name: 'Screen-reader user', text: 'Reads the accessibility tree: accessible names, labels, headings, landmarks and image descriptions.', example: '“This icon button has no accessible name.”' },
  { icon: Eye, name: 'Low-vision user', text: 'Measures real text contrast ratios against WCAG thresholds.', example: '“Body text contrast is 2.1:1.”' },
  { icon: Gauge, name: 'Slow device user', text: 'Mobile viewport, page weight, oversized images and Lighthouse on simulated slow 4G.', example: '“This 5 MB hero image takes ~26 s on slow 4G.”' },
  { icon: Search, name: 'First-time visitor', text: 'Checks what search engines and newcomers see first: title, description, H1, broken links, errors.', example: '“No H1 found.” · “Meta description is missing.”' },
];

const FEATURES = [
  { icon: Bot, title: 'Live agent view', text: 'Watch the browser work in real time — every key press and finding streams to your screen.' },
  { icon: Camera, title: 'Evidence for every issue', text: 'Highlighted screenshot, CSS selector, HTML snippet, reproduction steps, rule and detector.' },
  { icon: ShieldCheck, title: 'Confidence levels', text: 'High when a deterministic tool confirms it. The AI never invents findings.' },
  { icon: Layers, title: 'Smart prioritisation', text: 'Severity × users affected × page visibility, with a plain-English “why this priority?”.' },
  { icon: Wand2, title: 'AI fixes with approval', text: 'Reviewable before/after diffs. You approve every change — nothing is applied automatically.' },
  { icon: MessageSquare, title: 'Grounded audit chat', text: 'Ask “what should I fix first?” — answers come only from this audit’s evidence.' },
];

const TECH = [
  { group: 'Frontend', items: ['React 19', 'Vite', 'Tailwind CSS', 'TypeScript'] },
  { group: 'Backend', items: ['Node.js', 'Express', 'SQLite (node:sqlite)', 'Server-Sent Events'] },
  { group: 'Agent', items: ['Playwright', 'Chromium', 'axe-core', 'Lighthouse'] },
  { group: 'AI', items: ['Google Gemini', 'Structured JSON', 'zod validation', 'Backend-only key'] },
];

const HIGHLIGHTS = [
  { icon: Users, title: 'Real-world problem', text: 'Websites fail keyboard, screen-reader and mobile users every day — and owners never know.' },
  { icon: Code2, title: 'Full-stack AI', text: 'React → Express → Playwright → detectors → Gemini → SQLite → live dashboard.' },
  { icon: Cpu, title: 'Backend Gemini', text: 'Gemini runs only on the Node.js server. The API key never reaches the browser.' },
  { icon: Cloud, title: 'Live cloud deployment', text: 'Dockerised backend with a real browser, frontend on the edge — try it from any browser.' },
  { icon: Briefcase, title: 'Portfolio-ready', text: 'Polished UI, tests, docs, architecture diagram and an honest limitations list.' },
];

export function LandingPage() {
  useDocumentTitle('');
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="bg-grid absolute inset-0" aria-hidden="true" />
        <div className="glow absolute inset-0" aria-hidden="true" />
        <div className="container-page relative py-20 text-center sm:py-28">
          <p className="eyebrow">WebGuardian AI</p>
          <h1 className="mx-auto mt-4 max-w-4xl text-4xl font-extrabold tracking-tight sm:text-6xl">
            Autonomous AI <span className="gradient-text">Website QA Agent</span>
          </h1>
          <p className="mt-5 text-xl font-medium text-fg sm:text-2xl">Tests, explains, fixes and verifies.</p>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-fg-muted">
            WebGuardian doesn't scan your website.
            <br />
            It uses it the way your users do.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link to="/audit" className="btn-primary px-7 py-3.5 text-base">
              Audit Your Website <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </Link>
            <a href="#how-it-works" className="btn-secondary px-7 py-3.5 text-base">
              See How It Works <ArrowDown className="h-5 w-5" aria-hidden="true" />
            </a>
          </div>

          {/* Workflow visual */}
          <ol className="mx-auto mt-16 grid max-w-5xl grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8" aria-label="How WebGuardian works, step by step">
            {WORKFLOW.map((s, i) => (
              <li key={s.label} className="relative">
                <div className="card flex h-full flex-col items-center gap-2 px-2 py-4">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600/40 to-azure-500/30 text-fg">
                    <s.icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="text-xs font-medium">{s.label}</span>
                </div>
                {i < WORKFLOW.length - 1 && (
                  <ArrowRight className="absolute top-1/2 -right-3 hidden h-4 w-4 -translate-y-1/2 text-fg-subtle lg:block" aria-hidden="true" />
                )}
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Problem */}
      <section className="container-page py-20" aria-labelledby="problem-h">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <p className="eyebrow">The problem</p>
            <h2 id="problem-h" className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Websites look fine — and still fail real people.
            </h2>
            <p className="mt-4 text-fg-muted">
              A keyboard user gets trapped in a cookie banner. A screen-reader user hears “button, button, button”. A phone on slow data waits 20 seconds for a
              hero image. The business owner never finds out.
            </p>
            <p className="mt-4 text-fg-muted">
              Existing tools produce long technical reports. People are left asking: <strong className="text-fg">what</strong> is wrong,{' '}
              <strong className="text-fg">who</strong> is affected, <strong className="text-fg">why</strong> it matters, <strong className="text-fg">how</strong> to
              fix it — and <strong className="text-fg">did the fix actually work?</strong>
            </p>
          </div>
          <dl className="grid gap-3 sm:grid-cols-2">
            {[
              ['Who it affects', 'Users with disabilities, mobile users on slow networks, and every visitor who meets a broken link or error.'],
              ['Who needs this', 'Students, beginner developers, freelancers, agencies, small businesses and startup/MVP builders — including AI-generated sites.'],
              ['The current gap', 'Rule-based reports without context, evidence, fixes or proof that a fix worked.'],
              ['WebGuardian', 'Real browser testing + deterministic detection + personas + Gemini reasoning + evidence + fixes + verification.'],
            ].map(([t, d]) => (
              <div key={t} className="card p-5">
                <dt className="font-semibold">{t}</dt>
                <dd className="mt-1.5 text-sm text-fg-muted">{d}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="scroll-mt-20 border-y border-line bg-ink-850/50 py-20" aria-labelledby="how-h">
        <div className="container-page">
          <p className="eyebrow text-center">How it works</p>
          <h2 id="how-h" className="mt-3 text-center text-3xl font-bold tracking-tight sm:text-4xl">
            Scan → Act as users → Prove → Explain → Fix → Verify
          </h2>
          <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {LOOP.map((s, i) => (
              <li key={s.title} className="card p-6">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/15 text-brand-300">
                    <s.icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="font-mono text-sm text-fg-subtle">0{i + 1}</span>
                </div>
                <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-sm text-fg-muted">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Personas */}
      <section id="personas" className="container-page scroll-mt-20 py-20" aria-labelledby="personas-h">
        <p className="eyebrow">Persona-based testing</p>
        <h2 id="personas-h" className="mt-3 max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl">
          Five users walk through your site. Each one finds different problems.
        </h2>
        <ul className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {PERSONAS.map((p) => (
            <li key={p.name} className="card card-hover p-6">
              <p.icon className="h-7 w-7 text-brand-300" aria-hidden="true" />
              <h3 className="mt-4 font-semibold">{p.name}</h3>
              <p className="mt-1.5 text-sm text-fg-muted">{p.text}</p>
              <p className="mt-3 rounded-lg bg-ink-950 px-3 py-2 font-mono text-xs text-fg-muted">{p.example}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-20 border-y border-line bg-ink-850/50 py-20" aria-labelledby="features-h">
        <div className="container-page">
          <p className="eyebrow">Features</p>
          <h2 id="features-h" className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            An AI QA engineer, not an AI wrapper around a report
          </h2>
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <li key={f.title} className="card p-6">
                <f.icon className="h-6 w-6 text-azure-400" aria-hidden="true" />
                <h3 className="mt-3 font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm text-fg-muted">{f.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Verification */}
      <section className="container-page py-20" aria-labelledby="verify-h">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <p className="eyebrow">Before / after verification</p>
            <h2 id="verify-h" className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              A fix only counts when the re-test passes.
            </h2>
            <p className="mt-4 text-fg-muted">
              After you approve a fix, WebGuardian re-runs the exact tests that found the problem — in a fresh browser — and compares fingerprints. You get
              resolved, remaining and newly introduced issues, updated scores, and before/after screenshots. No claims without a re-test.
            </p>
            <ul className="mt-5 space-y-2 text-sm text-fg-muted">
              {['Per-issue verification in seconds', 'Whole-site re-test with category scores', 'Detects regressions introduced by a fix'].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-ok" aria-hidden="true" /> {t}
                </li>
              ))}
            </ul>
          </div>
          <figure className="card p-6">
            <figcaption className="mb-4 text-xs text-fg-subtle">Illustrative layout — real numbers appear only after a real re-test.</figcaption>
            <div className="grid grid-cols-2 gap-3 text-center">
              {[
                ['BEFORE', 'Issues found by the first scan', 'text-sev-critical'],
                ['AFTER', 'Issues found by the re-test', 'text-ok'],
              ].map(([t, d, c]) => (
                <div key={t} className="rounded-xl border border-line bg-ink-950 p-5">
                  <p className={`text-xs font-semibold tracking-widest ${c}`}>{t}</p>
                  <p className="mt-2 text-sm text-fg-muted">{d}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3 text-center text-sm">
              {['Resolved', 'Remaining', 'New'].map((t) => (
                <div key={t} className="rounded-xl border border-line bg-ink-800/60 p-3 text-fg-muted">
                  {t}
                </div>
              ))}
            </div>
          </figure>
        </div>
      </section>

      {/* Tech */}
      <section className="border-y border-line bg-ink-850/50 py-20" aria-labelledby="tech-h">
        <div className="container-page">
          <p className="eyebrow">Technology</p>
          <h2 id="tech-h" className="mt-3 text-3xl font-bold tracking-tight">
            Built on real browser automation and deterministic detection
          </h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {TECH.map((t) => (
              <div key={t.group} className="card p-5">
                <h3 className="text-sm font-semibold text-brand-300">{t.group}</h3>
                <ul className="mt-3 space-y-1.5 text-sm text-fg-muted">
                  {t.items.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Hackathon */}
      <section className="container-page py-20" aria-labelledby="hack-h">
        <p className="eyebrow">Build To Ship · hackathon highlights</p>
        <h2 id="hack-h" className="mt-3 text-3xl font-bold tracking-tight">
          Five requirements, demonstrated by the working product
        </h2>
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {HIGHLIGHTS.map((h) => (
            <li key={h.title} className="card p-5">
              <h.icon className="h-6 w-6 text-azure-400" aria-hidden="true" />
              <h3 className="mt-3 font-semibold">{h.title}</h3>
              <p className="mt-1.5 text-sm text-fg-muted">{h.text}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* CTA */}
      <section className="container-page" aria-labelledby="cta-h">
        <div className="card relative overflow-hidden px-6 py-14 text-center">
          <div className="glow absolute inset-0" aria-hidden="true" />
          <div className="relative">
            <h2 id="cta-h" className="text-3xl font-bold tracking-tight sm:text-4xl">
              Give WebGuardian a website.
              <br />
              <span className="gradient-text">Let an AI QA engineer investigate it.</span>
            </h2>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link to="/audit" className="btn-primary px-7 py-3.5 text-base">
                Audit Your Website <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
