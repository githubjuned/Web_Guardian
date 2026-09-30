# 3-minute demo script

> Rehearse against the **deployed** app from a fresh browser. Keep a local instance and a recorded video as backups.

**Before going on stage:** open the live URL, run one demo audit to warm up the container, confirm `/api/health` shows Gemini configured.

| Time | Show | Say |
|---|---|---|
| 0:00–0:20 | Landing page | "Many websites look fine but fail real users. A keyboard user gets trapped. A screen-reader user hits unlabeled buttons. The owner never knows. Meet **WebGuardian AI** — it doesn't scan your website, it *uses* it the way your users do." |
| 0:20–1:00 | Live URL → **Audit Your Website** → **Audit the demo site** | "This is the live cloud deployment. The backend just launched a real Chromium browser." Point at the activity feed: *Browser initialized → Page loaded → axe-core → Keyboard persona*. "Watch — it's pressing Tab… Tab… Tab…" → **⚠ ISSUE FOUND: keyboard focus is trapped inside #cookie-banner**. "It even tried Escape and Enter, like a real user would." |
| 1:00–1:40 | Dashboard | Read the real counts on screen (they come from the scan). Open issue **#1**: highlighted screenshot, selector, HTML, reproduction steps, *High confidence — detected by the keyboard persona*. "Every finding has evidence. The AI never invents issues." |
| 1:40–2:00 | Gemini summary + chat | "Gemini runs on our Node.js backend — the key never touches the browser." Ask the chat **"What should I fix first?"** → answer cites real issue numbers. |
| 2:00–2:30 | Issue #1 → **Generate Fix** | Show BEFORE/AFTER, explanation, risk. "Nothing changes without approval." Click **Apply Fix**. |
| 2:30–3:00 | **Verify Fix**, then **Verify fixes (full re-test)** | "WebGuardian re-runs the same test in a fresh browser — *Verified: resolved*." Show the before/after panel with the real resolved/remaining counts and screenshots. Close: "**WebGuardian doesn't scan your website. It uses it like your users do.**" |

## Hackathon highlights — where each one is visible

1. **Real-world problem** — the trapped keyboard user and unlabeled buttons, shown live with evidence.
2. **Full-stack AI** — frontend → Express → Playwright → detectors → Gemini → SQLite → dashboard, all in one flow.
3. **Backend Gemini** — `/api/health` shows Gemini configured server-side; explanations, fixes and chat all go through `/api/*`.
4. **Live cloud deployment** — the demo is run on the public URL, not localhost.
5. **Portfolio-ready** — polished UI, README with architecture, tests (`npm test`), and an honest limitations list.

## Judge Q&A

**Why not just Lighthouse?** Lighthouse is a rule-based audit (we run it too). WebGuardian adds persona-based interaction (it actually presses keys and tries to escape traps), evidence per issue, AI explanations for non-experts, fix generation with approval, and verification by re-testing.

**Why not paste Lighthouse output into ChatGPT?** That can't tell you whether a keyboard user gets trapped, can't produce a screenshot of the problem, can't apply a fix, and can't prove the fix worked. WebGuardian runs the site, gathers evidence, reasons, acts and verifies.

**How do you stop hallucinations?** Deterministic tools find issues; Gemini only explains them. Responses are schema-validated; references to issues that don't exist are rejected; fixes must quote code that exists verbatim in the file; the chat refuses questions the audit can't answer; verification is deterministic.

**Is the fix safe?** It's shown as a diff with a risk rating, it requires explicit approval, it's applied only to the sandbox copy we own, and the system re-tests afterwards — including checking for newly introduced issues.

**Does it work on any website?** Any public http(s) website. Login-protected pages and code tracing need extra access and are outside the MVP. Fixes are applied automatically only where we have the source (the demo sandbox); for other sites WebGuardian gives you the diff and re-tests after you deploy it.

**What makes it agentic?** It plans a test session, launches a browser, navigates, interacts, observes, detects, collects evidence, reasons, proposes an action, and verifies the outcome — a closed loop, not a single prompt.
