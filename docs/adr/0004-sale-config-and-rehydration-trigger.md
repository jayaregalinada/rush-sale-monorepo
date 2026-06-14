---
status: accepted
---

# Sale definitions in Postgres; seed/rehydrate Redis on boot + reconnect

## Context

The Redis Gate holds live Stock but can restart or be wiped. We need a durable home for
sale definitions and a concrete, oversell-safe way to (re)initialise Redis — including
the case where Redis dies while the app keeps running.

## Decision

- **Sale definitions live in a Postgres `sales` table** (`id`, product, `starts_at`,
  `ends_at`, `initial_stock`). This generalises past a single product; the demo seeds one
  row. The `status` endpoint derives Upcoming/Active/Ended from `now` vs the window plus
  remaining Stock.
- **Seed and Rehydration are one code path**: when the Redis stock key is absent,
  initialise it to `initial_stock − COUNT(reservations)` and rebuild the buyer SET from
  the Ledger. No reservations → fresh seed; reservations present → rehydrate. Recomputing
  from `initial_stock` can never exceed initial, so it is oversell-safe.
- **Trigger**: run this initialisation at app **boot** and on every Redis client
  **reconnect** event, guarded by a `SET NX` lock so only one instance rebuilds.
- **Gate guard**: a *missing* stock key means `NOT_READY` (→ `503`, retryable), which is
  explicitly distinct from a stock value of `0` (→ `SOLD_OUT`). During the brief rebuild
  window, requests get a retryable 503, never a wrong sold-out.

## Consequences

- Normal Redis restarts self-heal from AOF (Stock, buyers, and Stream all return) — the
  Ledger Rehydration path is the catastrophic fallback only.
- Stress test can kill Redis mid-run and observe: momentary 503s → rehydrate from Ledger
  → traffic resumes, with zero Oversell.
- The `NOT_READY ≠ SOLD_OUT` distinction must be honoured in the Lua Gate script.
