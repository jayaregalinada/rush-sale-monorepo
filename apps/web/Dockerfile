# syntax=docker/dockerfile:1
# Build context is the repo root (see docker-compose.yml).

FROM node:26-alpine AS builder
RUN npm install -g pnpm@10.33.2
WORKDIR /repo
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY apps/web/package.json ./apps/web/package.json
RUN pnpm install --frozen-lockfile --filter @rush-sale/web...
COPY apps/web ./apps/web
# Vite inlines VITE_* at build time, so the API URL is baked into the bundle here.
ARG VITE_API_URL=http://localhost:3000
ENV VITE_API_URL=$VITE_API_URL
RUN pnpm --filter @rush-sale/web build

FROM nginx:1.27-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
