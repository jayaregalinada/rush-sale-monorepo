# Rush Sale — System Architecture

High-throughput flash-sale platform. Hot path is a single **Redis atomic Gate** (oversell
structurally impossible); durability is an async **Postgres Ledger** fed by a separate
**worker** over Redis Streams. See the [ADRs](./adr) for the reasoning.

## Components at a glance

| Component | Responsibility | Why it exists |
|---|---|---|
| **Web SPA** | Status display, countdown, Buy button | Thin client; never trusted for invariants |
| **Edge proxy** (nginx prod / Vite dev) | Serve SPA + proxy `/api/*` → API, same-origin | No CORS, no host-specific URLs (ADR drop-CORS) |
| **API** (NestJS/Fastify) | HTTP surface; calls the Gate; seeds/rehydrates | Stateless, scales horizontally; off the DB hot path |
| **Redis Gate** (Lua) | Authoritative *live* stock + one-per-user | Single-threaded ⇒ no race window, no oversell |
| **Reservation Stream** | Durable buffer of successful reservations | Decouples the hot path from Postgres |
| **Worker** | Drains Stream → Ledger, idempotently | DB outage stalls only this, not selling |
| **Postgres** | `sales` config + `reservations` Ledger (record) | Durable source of truth + rehydration source |

## Containers

```mermaid
flowchart LR
    subgraph client[Browser]
        Web["Web SPA<br/>(Vite + React + TanStack Query)"]
    end

    subgraph edge[Static host + same-origin proxy · :5173]
        Proxy["nginx (prod) / Vite (dev)<br/>serves SPA · proxies /api/* → api:3000"]
    end

    subgraph api_tier[API tier — scales horizontally · stateless]
        API["API (NestJS on Fastify)<br/>sale cache · unknown-id negative cache"]
    end

    subgraph worker_tier[Worker tier — scales independently]
        Worker["Worker<br/>(Streams consumer group)"]
    end

    subgraph redis[Redis · AOF everysec · authoritative live state]
        Gate["Gate (Lua script)<br/>stock counter · buyers HASH (buyerId → reservationId)"]
        Stream["Reservation Stream<br/>(XADD / consumer group)"]
    end

    subgraph pg[Postgres · durable system of record]
        Sales["sales (config)"]
        Ledger["reservations (Ledger)<br/>UNIQUE(sale_id, buyer_id)"]
    end

    Web -->|"same-origin /api/* (no CORS)"| Proxy
    Proxy -->|"POST /sales/:id/purchases<br/>GET /sales/:id/status<br/>GET /sales/:id/purchases/:userId"| API
    API -->|"EVALSHA gate"| Gate
    Gate -->|"XADD on success"| Stream
    Worker -->|"XREADGROUP / XAUTOCLAIM"| Stream
    Worker -->|"INSERT ... ON CONFLICT DO NOTHING"| Ledger
    API -.->|"seed / rehydrate (boot + reconnect)"| Gate
    API -.->|"read config + reservations"| Sales
    API -.->|"rehydrate buyers + count"| Ledger
```

**Why split API and worker:** API stays on the hot path and never blocks on Postgres. If
the DB stalls, the worker simply stops acking — events buffer in the Stream, the Gate keeps
serving `SUCCESS`. They scale and fail independently (ADR-0001, ADR-0005).

**Why the same-origin proxy:** the browser only ever calls its own origin (`/api/*`); the
edge proxy forwards to the API. No CORS preflight, no hard-coded API host — the storefront
works wherever the host port is reached. Non-browser clients ignore CORS anyway.

## Purchase — hot path

```mermaid
sequenceDiagram
    autonumber
    participant W as Web
    participant A as API
    participant G as Redis Gate (Lua)
    participant S as Reservation Stream

    W->>A: POST /sales/:id/purchases { userId }
    A->>G: EVALSHA gate(saleId, userId)
    Note over G: single-threaded, indivisible<br/>1 EXISTS stock (seeded?)<br/>2 HGET buyer in buyers HASH<br/>3 stock > 0?<br/>4 DECR stock · XADD reservation · HSET buyer→reservationId
    alt stock key missing
        G-->>A: NOT_READY
        A-->>W: 503 NOT_READY
    else buyer already in HASH
        G-->>A: ALREADY_PURCHASED + reservationId
        A-->>W: 200 ALREADY_PURCHASED
    else stock == 0
        G-->>A: SOLD_OUT
        A-->>W: 422 SOLD_OUT
    else success
        G->>S: XADD reservation (returns streamId)
        G-->>A: SUCCESS + remaining + reservationId
        A-->>W: 201 SUCCESS
    end
```

No oversell + one-per-user are decided inside one Lua script. Redis being single-threaded
means there is no race window — the event is enqueued the instant the reservation exists, so
there is no dual-write gap. The reservation's stream id **is** its `reservationId`: it is
written into the buyers HASH, so a repeat attempt echoes the original (idempotent receipt)
and `GET /sales/:id/purchases/:userId` can return it.

> The status endpoint (`GET /sales/:id/status`) reports lifecycle (`UPCOMING`/`ACTIVE`/
> `ENDED`), but collapses `ACTIVE` → `SOLD_OUT` when live remaining is `0`, using the same
> Gate read it already needs (no extra round trip).

## Persistence — worker drains the Stream

```mermaid
sequenceDiagram
    autonumber
    participant S as Reservation Stream
    participant Wk as Worker (consumer group)
    participant L as Postgres Ledger

    Wk->>S: XAUTOCLAIM (reclaim stale pending)
    Wk->>S: XREADGROUP (new entries)
    S-->>Wk: reservation events
    Wk->>L: INSERT ... ON CONFLICT DO NOTHING
    alt write ok
        Wk->>S: XACK
    else Postgres down
        Note over Wk,S: no XACK → retry w/ backoff<br/>events stay pending, Gate keeps selling
    end
```

At-least-once delivery → the Ledger write must be idempotent. The natural key
`UNIQUE(sale_id, buyer_id)` makes the write exactly-once **and** is a DB-level
defense-in-depth backstop for one-per-user. The stream id is reused as the row id for
end-to-end traceability.

## Rehydration — recover live state from the Ledger

```mermaid
sequenceDiagram
    autonumber
    participant A as API (boot / Redis reconnect)
    participant R as Redis
    participant P as Postgres

    A->>R: SET sale:{id}:init-lock NX
    alt lock acquired
        A->>R: EXISTS stock? (live state already present → skip)
        A->>P: SELECT sale config + reservations (id, buyer_id)
        P-->>A: initial_stock, reserved_count, buyers
        Note over A: remaining = initial_stock − reserved_count
        A->>R: seed stock counter + buyers HASH (buyer→reservationId)
        Note over R: same code path as cold seed
    else lock held by peer
        Note over A: skip — another node is seeding
    end
```

Boot seed and post-crash rehydrate are the **same** code path. The seed is skipped when live
state already exists, so an intact AOF is never clobbered with the (lagging) Ledger count.
AOF can lose ≤1s on a hard crash; the Ledger backstops it so a cold rebuild can never
oversell (ADR-0004).

## Failure modes

| Failure | Behaviour | Why it holds |
|---|---|---|
| Traffic spike (thundering herd) | Gate serializes atomically in Redis | single-threaded, no row lock contention |
| Postgres down | Gate keeps serving; events buffer in Stream | worker decoupled, never acks until write ok |
| Redis crash (AOF intact) | restart → AOF replays live state | `appendfsync everysec`, ≤1s loss |
| Redis state lost (AOF gone) | rehydrate from Ledger on boot | `remaining = initial − COUNT(reservations)` |
| Duplicate Stream delivery | second Ledger insert is a no-op | `ON CONFLICT DO NOTHING` on natural key |
| Double-click / retry buy | `ALREADY_PURCHASED` + original id, not an error | buyer HASH checked inside the Gate |
| Flood of bogus sale ids | bounded negative cache absorbs repeats | capacity-capped + TTL'd, can't OOM |
