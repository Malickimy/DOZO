# syntax=docker/dockerfile:1

# Build context is the monorepo root (see docker-compose.yml). The dashboard SPA
# is built by CI (or locally) and staged at DOZO-Server/public before this build;
# this image never runs Vite. See .github/workflows/container.yml.

# ---- server dependencies (native better-sqlite3) ----
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY DOZO-Server/package.json DOZO-Server/package-lock.json* ./
RUN npm ci --omit=dev

# ---- runtime ----
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY DOZO-Server/package.json ./
COPY DOZO-Server/src ./src
COPY DOZO-Server/scripts ./scripts
# Pre-built SPA: DOZO-Dashboard/dist is copied to DOZO-Server/public by CI.
COPY DOZO-Server/public ./public
RUN mkdir -p /data && chown -R node:node /data
USER node
ENV PORT=3000 \
    DB_PATH=/data/dozo.db \
    REDIRECT_DOMAIN=http://localhost:3000 \
    GOOGLE_REVIEW_BASE=https://search.google.com/local/writereview \
    DASHBOARD_DIST_PATH=/app/public
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/dashboard.js"]
