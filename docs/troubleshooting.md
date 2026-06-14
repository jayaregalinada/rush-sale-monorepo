# Troubleshooting

Common issues when building, running, or stress-testing Rush Sale, and how to resolve them.

## Quick reset

When in doubt, rebuild from a clean slate. This stops every container and **deletes all
persisted state** (Postgres + Redis live under `./data/`):

```bash
docker compose --profile app --profile tools down
rm -rf data/
pnpm start     # rebuild + restart the full stack
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
plus a separate `pnpm --filter @rush-sale/api dev`. Pick one path — containerized (`pnpm start`)
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

## Every purchase 500s with `WRONGTYPE` (stale Redis volume)

A load run where **every** request fails (`http_req_failed` 100%, every outcome `NOT_READY`,
`checks` and `http_req_failed` thresholds crossed) and the API logs:

```
WRONGTYPE Operation against a key holding the wrong kind of value
  ... command: evalsha ... sale:<id>:buyers ...
```

The Gate's keys have fixed Redis types — `sale:<id>:stock` is a string, `sale:<id>:buyers` is
a **HASH** (buyerId → reservationId), `sale:<id>:reservations` is a **STREAM**. If an *older
build* wrote one of these keys with a different shape (e.g. `buyers` as a SET), that value
survives in the persisted `./data/redis` volume across a rebuild — the new code's `HGET`/`HSET`
then collide with it. Confirm the mismatch:

```bash
docker compose exec redis redis-cli TYPE sale:launch-2026:buyers   # expect: hash
```

Fix by clearing the stale state — either a full reset (recommended; wipes the volume) or an
in-place flush + re-seed:

```bash
pnpm load:reset                                    # down → rm -rf data → rebuild + re-seed
# or, without a rebuild:
docker compose exec redis redis-cli FLUSHALL
docker compose restart api worker                  # re-seeds the Gate from the Ledger on boot
```

Reset between runs as a habit — it guarantees no cross-version key shape lingers.

## Performance & load: symptom → bottleneck → mitigation

A runbook for behaviour under stress. The architecture's scaling levers are in
[architecture.md](./architecture.md#scaling--bottlenecks); this is how to *operate* them.

| Symptom | Likely bottleneck | Mitigation |
|---|---|---|
| Buy latency climbs under load, Redis CPU near 100% | single Redis thread saturated | scale Redis vertically (faster box); for many concurrent sales, shard by `saleId` across Redis Cluster |
| Postgres rows lag far behind successful buys | worker drain rate < arrival rate | add worker replicas (competing consumers); raise `BATCH`; check Postgres write throughput |
| Redis memory growing during a long, hot sale | Stream never trimmed — acked entries linger | `XTRIM sale:{id}:reservations MINID <id>` after the backlog drains, or add approx `MAXLEN` to `XADD` |
| API replicas at high CPU, Redis fine | API tier under-provisioned | add API replicas behind the proxy (stateless — safe to scale freely) |
| Random/bogus sale ids spike DB reads | negative cache too small or churning | raise `UNKNOWN_SALE_CACHE_CAPACITY`; front the edge with per-IP rate limiting |
| Many `503 NOT_READY` right after deploy | sales not seeded yet on a fresh node | expected during boot — node rehydrates from the Ledger; gate traffic until `/ready` passes |

**Measure before you tune.** Inspect the live pressure points:

```bash
# Stream backlog (pending = un-acked work the worker still owes)
docker compose exec redis redis-cli XINFO GROUPS sale:launch-2026:reservations
docker compose exec redis redis-cli XLEN sale:launch-2026:reservations

# Redis throughput / memory
docker compose exec redis redis-cli INFO stats | grep instantaneous_ops_per_sec
docker compose exec redis redis-cli INFO memory | grep used_memory_human

# Reproduce load (scenarios live in apps/load/scenarios/)
k6 run apps/load/scenarios/thundering-herd.js
```

A growing **pending** count (not just `XLEN`) is the true backpressure signal: it means the
worker is behind, *not* that selling is at risk — the Gate is unaffected.

## `pnpm lint` reports unexpected errors

Lint + format run through a single root Biome config (`biome.json`). Apply the safe fixes:

```bash
pnpm format
```

NestJS-specific notes: parameter decorators are enabled via
`unsafeParameterDecoratorsEnabled`, and `useImportType` is disabled for `apps/api` because an
`import type` on a dependency-injected class is erased at runtime and breaks Nest's metadata.
