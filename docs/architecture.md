# Rush Sale — System Architecture

High-throughput flash-sale platform. Hot path is a single **Redis atomic Gate** (oversell
structurally impossible); durability is an async **Postgres Ledger** fed by a separate
**worker** over Redis Streams. See the [ADRs](./adr) for the reasoning.

## Containers

```mermaid
flowchart LR
    subgraph client[Browser]
        Web["Web SPA<br/>(Vite + React + React Query)"]
    end

    subgraph api_tier[API tier — scales horizontally]
        API["API<br/>(NestJS on Fastify)"]
    end

    subgraph worker_tier[Worker tier — scales independently]
        Worker["Worker<br/>(Streams consumer group)"]
    end

    subgraph redis[Redis · AOF everysec · authoritative live state]
        Gate["Gate (Lua script)<br/>stock counter · buyers SET"]
        Stream["Reservation Stream<br/>(XADD / consumer group)"]
    end

    subgraph pg[Postgres · durable system of record]
        Sales["sales (config)"]
        Ledger["reservations (Ledger)<br/>UNIQUE(sale_id, buyer_id)"]
    end

    Web -->|"POST /sales/:id/purchases"| API
    Web -->|"GET /sales/:id/status"| API
    API -->|"EVALSHA gate"| Gate
    Gate -->|"XADD on success"| Stream
    Worker -->|"XREADGROUP"| Stream
    Worker -->|"INSERT ... ON CONFLICT DO NOTHING"| Ledger
    API -.->|"seed / rehydrate (boot + reconnect)"| Gate
    API -.->|"read config + COUNT(reservations)"| Sales
    API -.->|"rehydrate count"| Ledger
```

**Why split API and worker:** API stays on the hot path and never blocks on Postgres. If
the DB stalls, the worker simply stops acking — events buffer in the Stream, the Gate keeps
serving `SUCCESS`. They scale and fail independently (ADR-0001, ADR-0005).

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
    Note over G: single-threaded, indivisible<br/>1 check buyer in SET<br/>2 check stock > 0<br/>3 DECR stock + SADD buyer<br/>4 XADD reservation
    alt stock key missing
        G-->>A: NOT_READY
        A-->>W: 503 NOT_READY
    else buyer already in SET
        G-->>A: ALREADY_PURCHASED
        A-->>W: 200 ALREADY_PURCHASED
    else stock == 0
        G-->>A: SOLD_OUT
        A-->>W: 422 SOLD_OUT
    else success
        G->>S: XADD reservation
        G-->>A: SUCCESS
        A-->>W: 201 SUCCESS
    end
```

No oversell + one-per-user are decided inside one Lua script. Redis being single-threaded
means there is no race window — the event is enqueued the instant the Reservation exists,
so there is no dual-write gap.

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
defense-in-depth backstop for one-per-user.

## Rehydration — recover live state from the Ledger

```mermaid
sequenceDiagram
    autonumber
    participant A as API (boot / Redis reconnect)
    participant R as Redis
    participant P as Postgres

    A->>R: SET sale:{id}:init-lock NX
    alt lock acquired
        A->>P: SELECT sale config + COUNT(reservations)
        P-->>A: initial_stock, reserved_count, buyers
        Note over A: remaining = initial_stock − reserved_count
        A->>R: seed stock counter + buyers SET
        Note over R: same code path as cold seed
    else lock held by peer
        Note over A: skip — another node is seeding
    end
```

Boot seed and post-crash rehydrate are the **same** code path. AOF can lose ≤1s on a hard
crash; the Ledger backstops it so a cold rebuild can never oversell (ADR-0004).

## Failure modes

| Failure | Behaviour | Why it holds |
|---|---|---|
| Traffic spike (thundering herd) | Gate serializes atomically in Redis | single-threaded, no row lock contention |
| Postgres down | Gate keeps serving; events buffer in Stream | worker decoupled, never acks until write ok |
| Redis crash (AOF intact) | restart → AOF replays live state | `appendfsync everysec`, ≤1s loss |
| Redis state lost (AOF gone) | rehydrate from Ledger on boot | `remaining = initial − COUNT(reservations)` |
| Duplicate Stream delivery | second Ledger insert is a no-op | `ON CONFLICT DO NOTHING` on natural key |
| Double-click / retry buy | `ALREADY_PURCHASED`, not an error | buyer SET checked inside the Gate |
```
