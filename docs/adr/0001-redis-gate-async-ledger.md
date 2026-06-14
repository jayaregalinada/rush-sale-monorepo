---
status: accepted
---

# Redis atomic Gate with asynchronous Postgres Ledger

## Context

A flash sale puts thousands of concurrent Buyers in contention for a small Stock. The
two hard requirements are **no Oversell** and **One-Per-User**, both under extreme load,
plus a credible durability/recovery story. The obvious database-only approach
(`SELECT ... FOR UPDATE` / `UPDATE ... WHERE stock > 0`) serializes every Buyer on a
single row, making the hot Stock row the throughput bottleneck and risking
connection-pool exhaustion during a spike.

## Decision

Put a single **Redis atomic Gate** on the hot path: one Lua script performs
"check the Buyer has no Reservation → decrement Stock if > 0 → record the Buyer →
`XADD` an event to a Redis Stream" as **one indivisible operation**. Because Redis is
single-threaded, Oversell and double-buys are *structurally* impossible — there is no
race window, and the event is durably enqueued the instant the Reservation exists (no
dual-write gap).

Redis runs with **AOF persistence** and is **authoritative for live Stock** during an
Active sale. A worker consumes the Stream (consumer group, idempotent upsert) and
appends each Reservation to a **Postgres Ledger** — the durable system of record. If the
Gate's state is ever lost, it is **Rehydrated** from the Ledger
(`remaining = initial − COUNT(reservations)`, buyer set rebuilt from rows).

## Considered Options

- **Postgres row locking only** — correct but lock contention on the hot row caps
  throughput; weakest high-throughput story.
- **Redis gate, AOF only, no Rehydration** — simplest, but losing the AOF file makes
  safe recovery impossible (risk of Oversell on a cold rebuild).
- **Full async queue (RabbitMQ) + worker + client polling** — strongest backpressure
  story but eventual-consistency UX and the most infrastructure for a single product.

## Consequences

- Infra is just **Redis + Postgres** — no separate broker, since Redis Streams is the
  queue.
- The Stream is at-least-once, so the worker's Ledger write must be **idempotent**.
  We use the natural key `UNIQUE(sale_id, buyer_id)` with `INSERT ... ON CONFLICT DO
  NOTHING`: because One-Per-User makes a Buyer appear at most once, the same key enforces
  one-per-user *and* exactly-once Ledger writes, and serves as a DB-level defense-in-depth
  backstop behind the Redis Gate.
- AOF `appendfsync everysec` can lose ≤1s of writes on a hard crash — accepted, and the
  Ledger backstops it.
- Rehydration is real code that must be written and tested, not assumed.
- The worker uses a Redis Streams consumer group: `XACK` only after a successful Ledger
  write, pending entries reclaimed via `XAUTOCLAIM` on restart. If Postgres is down the
  worker retries with backoff and never acks, so the Gate keeps serving SUCCESS and events
  buffer in the Stream until the DB recovers — a DB outage never blocks the sale. A
  dead-letter queue for poison events is noted as a future extension, out of scope here.
