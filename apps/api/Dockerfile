# syntax=docker/dockerfile:1
# Build context is the repo root (see docker-compose.yml) so the pnpm workspace,
# lockfile and tsconfig.base.json are all visible.

FROM node:26-alpine AS builder
RUN npm install -g pnpm@10.33.2
WORKDIR /repo
# Manifests first so the dependency layer caches across source changes.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/package.json
RUN pnpm install --frozen-lockfile --filter @rush-sale/api...
COPY apps/api ./apps/api
RUN pnpm --filter @rush-sale/api build

FROM node:26-alpine AS runtime
RUN npm install -g pnpm@10.33.2
ENV NODE_ENV=production
WORKDIR /repo
# Reinstall production-only dependencies — drops the SWC/Drizzle-kit/test toolchain.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/package.json
RUN pnpm install --frozen-lockfile --prod --filter @rush-sale/api
COPY --from=builder /repo/apps/api/dist ./apps/api/dist
WORKDIR /repo/apps/api
# Drop root — the runtime only reads world-readable files and binds a high port.
USER node
EXPOSE 3000
# Default process is the API; the worker overrides command in docker-compose.yml.
CMD ["node", "dist/main.js"]
