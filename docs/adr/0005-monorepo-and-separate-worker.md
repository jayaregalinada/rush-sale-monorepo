---
status: accepted
---

# Turborepo monorepo; worker runs as a separate process

## Context

The deliverable is a single git repo containing a NestJS API, a React (Vite) frontend,
and k6 load scripts. We also need to decide whether the Stream→Ledger worker runs inside
the API process or on its own.

## Decision

- **Turborepo + pnpm workspaces monorepo.** One install, one lockfile, shared
  tsconfig/lint, root task pipeline with caching. Packages: `api/`, `web/`, `load/`.
- **The worker is a separate process** sharing the `api/` codebase via a second
  entrypoint (`main.ts` = HTTP API, `worker.ts` = Redis Streams consumer), deployed as
  its own container in docker-compose.

## Considered Options

- **Plain folders, no workspace tooling** - simpler, but two installs/lockfiles, no
  shared config; reads less structured.
- **Worker inside the API process** - simplest to run, but it contradicts the
  fault-tolerance story (ADR-0001): a worker that lives in the API process can't keep
  buffering a DB outage independently, and can't be scaled or crash in isolation.

## Consequences

- Turborepo is mild overkill for two packages, accepted for the clean DX and senior
  signal.
- API and worker scale and fail independently; a DB outage stalls only the worker while
  the Gate keeps serving SUCCESS.
- Implementation stack: **Drizzle** for the DB layer, **ioredis** as the Redis client,
  **Testcontainers** for integration tests, **Vitest** as the test runner.
  - *Drizzle* (over Prisma/TypeORM/MikroORM): lightest and most type-safe, with explicit
    near-SQL queries and a trivial `onConflictDoNothing()` for the Ledger dedupe. The
    schema is tiny (sales + reservations) and the hard concurrency lives in the Redis Lua
    Gate, so a heavy ORM / Unit-of-Work buys little; Drizzle keeps SQL visible and typed.
  - *ioredis*: `defineCommand()` registers the Lua Gate as a typed custom command (auto
    `EVALSHA`), and its battle-tested `reconnect`/`ready` events drive the rehydrate
    trigger (ADR-0004).
  - *Testcontainers*: only a real Redis faithfully runs the Lua `EVAL` + Streams the
    correctness proof depends on; in-memory fakes (ioredis-mock/pg-mem) can't.
