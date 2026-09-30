# WebGuardian AI — production image
# One service: Express API + Playwright/Chromium agent + the built React app.
# The official Playwright image ships Chromium and all its system dependencies.
FROM mcr.microsoft.com/playwright:v1.56.1-noble AS base
WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    NPM_CONFIG_UPDATE_NOTIFIER=false

# node:sqlite needs Node >= 22.5 — fail the build early if the base image is older.
RUN node -e "require('node:sqlite'); console.log('Node', process.version, 'OK')"

# ---- dependencies (cached layer) ----
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --no-audit --no-fund

# ---- build the frontend (same-origin API, so VITE_API_URL stays empty) ----
COPY shared shared
COPY frontend frontend
RUN npm run build -w frontend

# ---- backend + demo site ----
COPY backend backend
COPY demo-site demo-site

ENV NODE_ENV=production \
    PORT=8080 \
    WEBGUARDIAN_DATA_DIR=/app/backend/data
RUN mkdir -p /app/backend/data && chown -R pwuser:pwuser /app/backend/data
USER pwuser
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npm", "run", "start", "-w", "backend"]
