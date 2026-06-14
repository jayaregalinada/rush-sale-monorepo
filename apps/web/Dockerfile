# syntax=docker/dockerfile:1
# Build context is the repo root (see docker-compose.yml).

FROM node:26-alpine AS builder
RUN npm install -g pnpm@11.6.0
WORKDIR /repo
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY apps/web/package.json ./apps/web/package.json
RUN pnpm install --frozen-lockfile --filter @rush-sale/web...
COPY apps/web ./apps/web
# No API URL is baked in: the bundle calls the same-origin /api prefix, which nginx
# proxies to the API service (see nginx.conf). This keeps the image host-agnostic.
RUN pnpm --filter @rush-sale/web build

FROM nginx:1.27-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
