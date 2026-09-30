# Deploying WebGuardian AI

WebGuardian needs a **server that can run Chromium** (Playwright). A serverless frontend host alone cannot run the agent. The recommended setup is a single Docker service; optionally, the frontend can also be served from Vercel.

## Option A — one Docker service (recommended)

The root `Dockerfile` builds the React app and runs the Express API, the Playwright agent, the demo site and the built frontend on one origin. It is based on the official `mcr.microsoft.com/playwright:v1.56.1-noble` image, which contains Chromium and its system libraries.

```bash
docker build -t webguardian .
docker run -p 8080:8080 \
  -e GEMINI_API_KEY=your_key \
  -e PUBLIC_BASE_URL=http://localhost:8080 \
  -v webguardian-data:/app/backend/data \
  webguardian
# open http://localhost:8080
```

Resource guidance: **≥ 1 GB RAM (2 GB recommended)** — headless Chromium plus Lighthouse. Keep `MAX_CONCURRENT_AUDITS=1` on small instances.

### Render
1. Push the repository to GitHub.
2. Render dashboard → **New → Blueprint** → choose the repo (uses `render.yaml`).
3. Set `GEMINI_API_KEY` and `PUBLIC_BASE_URL` (your `https://<service>.onrender.com` URL) in the service's Environment tab.
4. Deploy. The persistent disk keeps the SQLite DB and screenshots across restarts.

### Fly.io
```bash
fly launch --no-deploy            # keeps fly.toml
fly volumes create webguardian_data --size 1
fly secrets set GEMINI_API_KEY=... PUBLIC_BASE_URL=https://<app>.fly.dev
fly deploy
```

### Google Cloud Run
```bash
gcloud run deploy webguardian --source . --region us-central1 --memory 2Gi --cpu 2 \
  --no-cpu-throttling --min-instances 1 --timeout 3600 \
  --set-env-vars PUBLIC_BASE_URL=https://<service-url>,MAX_CONCURRENT_AUDITS=1 \
  --set-secrets GEMINI_API_KEY=gemini-api-key:latest
```
`--no-cpu-throttling` keeps background audit jobs running after the POST returns. Cloud Run's filesystem is ephemeral: audits are lost when the instance is replaced (acceptable for a demo; mount a volume or move to a managed DB for production).

## Option B — frontend on Vercel + backend on a container host

1. Deploy the backend with Option A.
2. Vercel → **Add New Project** → import the repo → **Root Directory: `frontend`** (uses `frontend/vercel.json`).
3. Environment variable: `VITE_API_URL=https://<your-backend-host>`.
4. On the backend set `FRONTEND_URL=https://<your-app>.vercel.app` (CORS). `*.vercel.app` preview URLs are allowed automatically.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | yes (for AI) | Google AI Studio key. Backend only. Without it the audit still runs with rule-based explanations. |
| `GEMINI_MODEL` | no | Default `gemini-2.5-flash`. |
| `PUBLIC_BASE_URL` | yes in the cloud | Public URL of the backend. Used to build demo-sandbox URLs and to allow-list the server's own origin. |
| `FRONTEND_URL` | when split | Comma-separated allowed CORS origins. |
| `PORT` | no | Default `8080`. |
| `DATABASE_URL` | no | `file:./data/webguardian.db` by default (Node's built-in SQLite). |
| `MAX_CONCURRENT_AUDITS` | no | Default `2`. |
| `LIGHTHOUSE_ENABLED` | no | Default `true`. |
| `ALLOW_PRIVATE_URLS` | no | Default `false`. Keep false in production (SSRF protection). |

## Post-deployment checklist

- [ ] `GET https://<backend>/api/health` → `"status":"ok"` and `"gemini":{"configured":true}`
- [ ] Open the public URL in a **fresh private browser window**
- [ ] Click **Audit Your Website → Audit the demo site** — the live agent view streams frames
- [ ] Dashboard shows the Gemini summary (not "AI explanation temporarily unavailable")
- [ ] Open issue #1 → **Generate Fix** → **Apply Fix** → **Verify Fix** → "Verified: the issue is resolved"
- [ ] **Verify fixes (full re-test)** → before/after panel
- [ ] Ask the chat "What should I fix first?"
- [ ] Update the live URLs in `README.md`
