# Imagen del MANAGER (la consola de workspaces). Se despliega con docker-compose.
FROM node:24-bookworm-slim AS builder
# build tools porque el install del monorepo compila node-pty (dep del editor),
# aunque el manager no lo use.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ git ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter manager build

FROM node:24-bookworm-slim AS runtime
RUN corepack enable
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/apps/manager/dist ./apps/manager/dist
COPY --from=builder /app/apps/manager/package.json ./apps/manager/package.json
COPY --from=builder /app/apps/manager/node_modules ./apps/manager/node_modules
ENV NODE_ENV=production \
    PORT=4000 \
    DB_PATH=/data/manager.db \
    NODE_OPTIONS=--disable-warning=ExperimentalWarning
VOLUME /data
EXPOSE 4000
WORKDIR /app/apps/manager
CMD ["node", "dist/server/index.js"]
