# syntax=docker/dockerfile:1

# =============================================================================
# Portail Amitel — image Docker (multi-stage)
#
# better-sqlite3 est un module NATIF : il faut le compiler (toolchain C++).
# On compile dans un stage "builder" jetable, puis on copie uniquement les
# node_modules compilés dans un runtime slim SANS la toolchain (image légère).
# =============================================================================

# --- Stage 1 : builder (compile better-sqlite3) ------------------------------
FROM node:20-bookworm-slim AS builder
WORKDIR /app

# Outils de compilation requis par better-sqlite3 (node-gyp : python + make + g++).
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# Couche de cache : les deps ne se réinstallent que si package*.json change.
COPY package.json package-lock.json ./
# Deps de PRODUCTION uniquement ; npm ci compile le binaire natif pour Linux.
RUN npm ci --omit=dev

# --- Stage 2 : runtime (image finale, sans toolchain) ------------------------
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    PORTAIL_DB=/app/data/onboarding.db
WORKDIR /app

# node_modules déjà compilés + code applicatif (pas de sources de build).
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
COPY server ./server
COPY public ./public

# Dossier de données (monté en volume) + propriété au user non-root "node"
# (présent dans l'image officielle, uid 1000) pour autoriser l'écriture SQLite.
RUN mkdir -p /app/data && chown -R node:node /app
USER node

EXPOSE 3000

# Sonde de santé : l'app sert "/" (index.html) → 200 quand elle est prête.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/',r=>process.exit(r.statusCode<400?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "server/index.js"]
