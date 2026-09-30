# WebGuardian AI — API reference

Base URL: your backend origin (e.g. `https://webguardian-ai.onrender.com`). All bodies are JSON. Errors return `{ "error": string, "details"?: unknown }` with an appropriate status code.

## Audits

### `POST /api/audits`
Start an audit. The URL is validated (http/https only, no credentials, no private/local addresses).

```json
{ "url": "https://example.com", "maxPages": 3 }
```
`202 Accepted`
```json
{ "auditId": "audit_k2x9...", "status": "queued" }
```

### `GET /api/audits/:id`
```json
{
  "id": "audit_...",
  "url": "https://example.com/",
  "status": "testing",
  "progress": 45,
  "stage": "Testing page 2 of 3",
  "pages": [{ "url": "...", "title": "...", "status": "scanned", "httpStatus": 200, "screenshot": "/api/screenshots/..." }],
  "scoresBefore": { "accessibility": 18, "seo": 83, "performance": 70, "functionality": 78, "ux": 93, "overall": 68 },
  "scoresAfter": null,
  "issueCounts": { "critical": 15, "high": 12, "medium": 14, "low": 3 },
  "totalIssues": 44,
  "resolvedIssues": 0,
  "detectors": { "axe-core": "completed", "keyboard-persona": "completed", "lighthouse": "unavailable" },
  "aiStatus": "available",
  "aiSummary": { "summary": "...", "overallRisk": "critical", "topPriorities": [{ "issueId": "issue_...", "reason": "..." }], "quickWins": [] },
  "lighthouse": { "performance": 59, "lcpMs": 27157, "...": "..." },
  "lastVerification": null
}
```

### `GET /api/audits`
The 20 most recent audits.

### `GET /api/audits/:id/issues`
Array of issues ordered by priority (`number` 1 = highest). Each issue includes: `category`, `persona`, `severity`, `confidence`, `title`, `description`, `affectedUsers`, `whyItMatters`, `howToFix`, `priorityReason`, `selector`, `htmlSnippet`, `screenshotPath`, `steps`, `rule`, `detectedBy`, `helpUrl`, `metrics`, `ai` (Gemini explanation or `null`), `fix` (proposal or `null`), `status`.

### `GET /api/audits/:id/events` — Server-Sent Events
Replays the stored timeline, then streams live updates. Supports `Last-Event-ID` for resumption.

| event | data |
|---|---|
| `audit` | full audit object (status/progress changes) |
| `event` | `{ id, type: status\|step\|action\|issue\|warning\|error\|ai\|done, message, metadata }` |
| `frame` | `{ data: base64 JPEG, caption, url, timestamp }` — what the agent's browser currently shows |

### `GET /api/audits/:id/report`
Complete report: audit, issues, verifications and the timeline (excluding per-key-press actions).

### `POST /api/audits/:id/verify`
Re-runs every detector on the same pages (`202`, status → `verifying` → `verified`). Result in `lastVerification`:
```json
{ "issuesBefore": 44, "issuesAfter": 43, "resolved": 1, "remaining": 43, "newIssues": 0,
  "scoresBefore": { "...": 0 }, "scoresAfter": { "...": 0 }, "resolvedIssueIds": ["issue_..."], "pagesAfter": [] }
```

### `POST /api/audits/:id/ai`
Retry the Gemini explanation + summary step (e.g. after a rate limit).

### `POST /api/audits/:id/chat`
Grounded audit chat.
```json
{ "question": "What should I fix first?", "history": [{ "role": "user", "content": "..." }] }
```
```json
{ "role": "assistant", "content": "Fix #1 first: ...", "citedIssueIds": ["issue_..."] }
```
If the answer isn't in the audit data: `"I don't have evidence for that in this audit."`

## Issues

| Endpoint | Purpose |
|---|---|
| `GET /api/issues/:id` | One issue |
| `POST /api/issues/:id/explain` | Gemini explanation for this instance (sends the evidence screenshot as an image) |
| `POST /api/issues/:id/fix` | Gemini fix proposal → `issue.fix` `{ summary, file, oldCode, newCode, diff, explanation, risk, applicable, applicableReason }` |
| `POST /api/issues/:id/apply` | Apply an approved fix. **Requires** `{ "approved": true }`. Only for demo sandboxes (`422` otherwise). |
| `POST /api/issues/:id/reject` | Reject the proposal |
| `POST /api/issues/:id/verify` | Re-test this issue's page; returns `{ verification: { status: "resolved" \| "still_present", before, after }, issue }` |

AI endpoints return `503 { "error": "AI temporarily unavailable" }` when Gemini is not configured or unreachable.

## Demo sandbox

| Endpoint | Purpose |
|---|---|
| `POST /api/demo/sandbox` | Create a private copy of the Brewly demo site → `{ sandboxId, url }` |
| `POST /api/demo/sandbox/:id/reset` | Restore the sandbox to the original (flawed) version |
| `GET /demo/` | Read-only original demo site |
| `GET /sandbox/:id/...` | A sandbox copy (fixes are applied here) |

## Misc

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | `{ status, gemini: { configured, model }, lighthouse, queue }` (never exposes secrets) |
| `GET /api/config` | Public client config (`maxPagesLimit`, `aiConfigured`, …) |
| `GET /api/personas` | Persona descriptions |
| `GET /api/screenshots/:auditId/:file` | Evidence screenshots |

Rate limits (per IP): 12 audits / 15 min, 40 verifications / 15 min, 30 AI requests / min.
