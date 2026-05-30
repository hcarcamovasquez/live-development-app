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
# gosu para bajar privilegios a `dev` desde el entrypoint; git para simple-git.
RUN apt-get update && apt-get install -y --no-install-recommends \
      git ca-certificates gosu && rm -rf /var/lib/apt/lists/*
# pnpm global (en /usr/local/bin, usable por cualquier usuario) en vez de corepack
# por-usuario, para que el usuario `dev` no tenga que descargarlo en runtime.
RUN npm install -g pnpm@11.1.1
# El server y las terminales corren como el usuario `node` (uid 1000, ya existe
# en la imagen base), no como root.
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

# Restaura el bit de ejecución del spawn-helper de node-pty y del entrypoint.
RUN node scripts/fix-pty.mjs || true
RUN chmod +x scripts/docker-entrypoint.sh

ENV NODE_ENV=production \
    PORT=3000 \
    PROJECTS_DIR=/data/projects \
    DB_PATH=/data/registry.db \
    NODE_OPTIONS=--disable-warning=ExperimentalWarning \
    PREVIEW_HMR_CLIENT_PORT=443 \
    PREVIEW_HMR_PROTOCOL=wss \
    HOME=/home/node \
    SHELL=/bin/bash

# Persistencia de los proyectos del workspace (Dokploy monta un volumen aquí).
VOLUME /data
EXPOSE 3000
# El entrypoint (root) prepara /data y hace exec gosu node → todo corre como `node`.
ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
CMD ["node", "apps/server/dist/index.js"]
