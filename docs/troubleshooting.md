# Troubleshooting

Common issues when building, running, or stress-testing Rush Sale, and how to resolve them.

## Quick reset

When in doubt, rebuild from a clean slate. This stops every container and **deletes all
persisted state** (Postgres + Redis live under `./data/`):

```bash
docker compose --profile app --profile tools down
rm -rf data/
pnpm up        # rebuild + restart the full stack
```

The default sale (`launch-2026`) re-seeds on API boot, so a wipe is safe in dev.

---

## A port is already in use

`Error: ... address already in use` (or a container exits immediately). The stack publishes:

| Port | Service |
|---|---|
| 3000 | API |
| 5173 | Web SPA |
| 5432 | Postgres |
| 6379 | Redis |
| 8081 | pgweb (admin) |
| 8082 | redis-commander (admin) |

Find and stop whatever holds the port:

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN     # macOS / Linux
```

A common culprit is a **local dev API/Redis/Postgres** already running from `pnpm infra:up`
plus a separate `pnpm --filter @rush-sale/api dev`. Pick one path — containerized (`pnpm up`)
**or** local dev — not both on the same ports.

## `curl localhost:3000` returns nothing, but the container is up

On some setups `localhost` resolves to IPv6 `::1` while Docker publishes on IPv4. Use the
explicit IPv4 loopback:

```bash
curl 127.0.0.1:3000/ready
```

Browsers handle this automatically; it only bites raw `curl`/`wget`.

## Docker / Compose issues

- **`docker: command not found` / daemon not running** — start Docker Desktop or OrbStack.
- **`unknown shorthand flag: 'profile'`** — you have Compose v1. This project needs Compose
  v2 (`docker compose`, not `docker-compose`).
- **`corepack: not found` during an image build** — expected on Node 26; the Dockerfiles
  install pnpm via `npm i -g pnpm`. If you changed that line, restore it.

## The schema is missing (`relation "reservations" does not exist`)

The one-shot `migrate` service pushes the Drizzle schema before the API starts. If it was
skipped (e.g. you started only `infra:up`), push it manually:

```bash
pnpm --filter @rush-sale/api db:push     # local dev
# or, fully containerized:
docker compose --profile app up migrate
```

## API returns `NOT_READY` (503) instead of selling

`NOT_READY` means the sale's stock key is absent in Redis — the Gate has not been seeded yet,
which is **not** the same as `SOLD_OUT`. Causes:

- the API has not finished booting (it seeds `launch-2026` on startup) — wait and retry;
- Redis was wiped while the API stayed up. Restart the API so it rehydrates from the Ledger,
  or restart the whole stack.

## A purchase succeeds but nothing appears in Postgres

Reservations land in Redis instantly; the **worker** drains the Stream into the Ledger
asynchronously. Check it is running and healthy:

```bash
docker compose --profile app logs worker --tail 50
```

If the worker is down, events stay pending in the Redis Stream (by design — the Gate keeps
selling) and flush once it recovers. Inspect the pending entries in redis-commander, or:

```bash
docker compose exec redis redis-cli XINFO GROUPS sale:launch-2026:reservations
```

## Inspecting live data (admin UIs)

```bash
pnpm tools:up        # pgweb + redis-commander, both auto-connect
```

- **Postgres** → http://localhost:8081 (pgweb)
- **Redis** → http://localhost:8082 (redis-commander)

If a UI shows no data, confirm the underlying service is healthy (`docker compose ps`) and
that you ran a migration / made at least one purchase.

## k6: `command not found`

k6 is a separate binary, not an npm package. Install it
([instructions](https://grafana.com/docs/k6/latest/set-up/install-k6/)), e.g. `brew install
k6`, then run the scenarios from `apps/load`.

## A k6 run aborts immediately

The scenarios encode invariants as `abortOnFail` thresholds (e.g. `outcome_success<=1000`).
An instant abort usually means the sale is **already sold out or fully claimed** from a
previous run — reset state (see *Quick reset*) and re-run.

## `pnpm lint` reports unexpected errors

Lint + format run through a single root Biome config (`biome.json`). Apply the safe fixes:

```bash
pnpm format
```

NestJS-specific notes: parameter decorators are enabled via
`unsafeParameterDecoratorsEnabled`, and `useImportType` is disabled for `apps/api` because an
`import type` on a dependency-injected class is erased at runtime and breaks Nest's metadata.
