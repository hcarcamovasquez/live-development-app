# Imagen del EDITOR (un workspace). Dokploy la construye desde el repo git.
# Debian slim (no Alpine) por node-pty; incluye git para simple-git.

# ---- builder ----
FROM node:24-bookworm-slim AS builder
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ git ca-certificates && rm -rf /var/lib/apt/lists/*
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build

# ---- runtime ----
FROM node:24-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
      git ca-certificates && rm -rf /var/lib/apt/lists/*
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app

# Dependencias (incluye node-pty con su binario nativo) y artefactos compilados.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/apps/web/dist ./apps/web/dist
COPY --from=builder /app/apps/web/package.json ./apps/web/package.json
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/server/package.json ./apps/server/package.json
COPY --from=builder /app/apps/server/node_modules ./apps/server/node_modules

# Restaura el bit de ejecución del spawn-helper de node-pty.
RUN node scripts/fix-pty.mjs || true

ENV NODE_ENV=production \
    PORT=3000 \
    PROJECTS_DIR=/data/projects \
    DB_PATH=/data/registry.db \
    NODE_OPTIONS=--disable-warning=ExperimentalWarning \
    PREVIEW_HMR_CLIENT_PORT=443 \
    PREVIEW_HMR_PROTOCOL=wss

# Persistencia de los proyectos del workspace (Dokploy monta un volumen aquí).
VOLUME /data
EXPOSE 3000
CMD ["node", "apps/server/dist/index.js"]
