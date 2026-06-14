# Load & stress testing

The [k6](https://grafana.com/docs/k6/latest/) scenarios in `apps/load/scenarios` are the
**non-functional proof**: that the system stays fast under a spike, that the concurrency
controls actually hold at load (not just in a unit test), and that it survives a Redis fault.
Each scenario encodes its pass/fail as **k6 thresholds**, so a run exits non-zero the instant
an invariant breaks — no eyeballing required.

> The data-layer proof (the Lua Gate under 1000 concurrent buyers) is the integration test
> `apps/api/test/gate.int-spec.ts`; the HTTP-edge proof is `apps/api/test/api.int-spec.ts`.
> These k6 runs are the **system-level** proof against the real running stack.

## Prerequisites

1. The stack running and seeded: `pnpm start` (API on `:3000`, seeds `launch-2026`, stock 1000).
2. k6 — choose one:
   - **Containerized (no install)** — recommended. Uses the `grafana/k6` image via the compose
     `load` profile; nothing to install. This is the `pnpm load:*` path below.
   - **Local binary** — `brew install k6`
     ([other platforms](https://grafana.com/docs/k6/latest/set-up/install-k6/)); the
     `pnpm -F @rush-sale/load run <scenario>` path below.
3. **Reset state between runs.** A scenario aborts instantly if the sale is already sold out
   from a previous run — wipe to a clean, freshly-seeded slate first:
   ```bash
   pnpm load:reset   # down → rm -rf data → rebuild + start (re-seeds launch-2026)
   ```

## The scenarios

**Containerized (no k6 install)** — from the repo root, with the app stack up:

```bash
pnpm load:herd           # 1 — thundering herd
pnpm load:one-per-user   # 2 — one-per-user under a retry storm
pnpm load:window         # 3 — sale-window enforcement
pnpm load:fault-redis    # 4 — Redis fault injection (manual kill mid-run)
# arbitrary script: pnpm load scenarios/<name>.js
```

These run `grafana/k6` on the compose network, so the container reaches the API at
`http://api:3000` (preset via `BASE_URL` on the `k6` service). Equivalent raw command:
`docker compose --profile load run --rm k6 run scenarios/thundering-herd.js`.

**Local k6 binary** — run from the repo root via the package filter (no `cd`); targets the
published host port (`http://localhost:3000`):

```bash
pnpm -F @rush-sale/load run herd          # 1 — thundering herd
pnpm -F @rush-sale/load run one-per-user  # 2 — one-per-user under a retry storm
pnpm -F @rush-sale/load run window        # 3 — sale-window enforcement
pnpm -F @rush-sale/load run fault-redis   # 4 — Redis fault injection (manual kill mid-run)
```

Reset to a clean slate between runs with `pnpm load:reset` (or `pnpm load:reset:attach` to
stream the rebuild logs in the foreground).

| # | Scenario | Load profile | Proves | Hard invariant (`abortOnFail`) |
|---|---|---|---|---|
| 1 | **thundering-herd** | ramps to **5000 rps** for 20s | hot path holds under a spike; never oversells | `outcome_success ≤ 1000` (= initial stock) |
| 2 | **one-per-user** | 50 buyers × 40 concurrent retries | a buyer can never hold two reservations | `outcome_success ≤ 50` (one each) |
| 3 | **sale-window** | 20 VUs for 40s | outcome always agrees with the live window | every outcome matches `UPCOMING`/`ACTIVE`/`ENDED` |
| 4 | **fault-redis** | 300 rps for 60s, kill Redis mid-run | fails clean during outage, recovers, no oversell | no-oversell signal holds on **every** request |

Override the target with env vars (they pass straight through the pnpm script):
`BASE_URL=http://host:3000 SALE_ID=my-sale pnpm -F @rush-sale/load run herd`.

## Reading the results

A run prints a threshold block. Each line is a pass (`✓`) or fail (`✗`):

```
✓ outcome_success.........: count=1000   <- exactly the stock; never more
  outcome_sold_out........: count=...     (everyone after the first 1000)
✓ http_req_duration.......: p(95)=...ms p(99)=...ms   <- under 150ms / 250ms
✓ http_req_failed.........: rate=0.00%   <- only 5xx counts as failed (see below)
✓ checks..................: rate=99.xx%  <- every iteration reached a decisive outcome
```

What each signal means:

- **`outcome_*` counters** — the correctness tallies (`apps/load/lib/common.js`). `outcome_success`
  is the one that must never exceed stock; it's wired to `abortOnFail`, so an oversell kills the
  run immediately rather than reporting a soft failure.
- **`http_req_failed`** — scoped to **5xx only** (`http.expectedStatuses({min:200,max:499})`),
  because business rejections use 4xx by design (ADR-0003): `SOLD_OUT`=422, upcoming=409,
  ended=410. Those are *correct* responses, not faults — without this scope a healthy sellout
  would red-fail the run.
- **`http_req_duration`** — the latency SLO. The herd asserts `p95 < 150ms`, `p99 < 250ms`,
  `max < 2000ms` while sustaining 5000 rps. This is the throughput claim: the hot path is one
  O(1) Redis script with no DB, so latency stays flat under the spike.
- **`checks`** — the per-iteration assertions (`> 99%`): every request reached a decisive,
  server-error-free outcome.

### The independent cross-check (don't just trust k6)

The invariants are also verifiable straight from the Ledger, independent of the load tool —
after the worker drains the Stream:

```sql
-- never more reservations than stock:
SELECT count(*) FROM reservations WHERE sale_id = 'launch-2026';   -- ≤ initial_stock
-- and no buyer twice:
SELECT sale_id, buyer_id, count(*) FROM reservations
  GROUP BY 1, 2 HAVING count(*) > 1;                               -- 0 rows
```

Open pgweb at http://localhost:8081 (`pnpm tools:up`) to run these, and watch the
`sale:*:stock` key drop live in redis-commander (http://localhost:8082).

## Scenario 4 — injecting the Redis fault

Run `pnpm fault-redis`, and **mid-run** kill Redis one of two ways:

```bash
docker compose restart redis                                   # AOF replays → warm recovery
# or, to force a COLD rehydrate from the Ledger:
docker compose stop redis && rm -rf data/redis && docker compose up -d redis
```

Expected: during the outage requests fail cleanly (5xx / `NOT_READY`) — `http_req_failed`
tolerated up to 40% *for this run only* — but the no-oversell check holds on every request.
After recovery the API rehydrates (warm from AOF, or `remaining = initial − COUNT(reservations)`
cold from the Ledger) and `SUCCESS` resumes. The final DB cross-check above still passes.

## Tuning to your host

- The herd's `outcome_success ≤ 1000` threshold is tied to the **seeded stock of 1000**. If you
  change `SEED_SALE_STOCK`, update the threshold in `scenarios/thundering-herd.js` to match.
- If the load generator (not the API) is the bottleneck — k6 itself CPU-bound — lower the target
  rate or raise `preAllocatedVUs`/`maxVUs`. A laptop won't push a true 5000 rps; the *invariants*
  still hold at whatever rate you reach, which is the point of the test.

See [troubleshooting.md](./troubleshooting.md#performance--load-symptom--bottleneck--mitigation)
when a run behaves unexpectedly.
