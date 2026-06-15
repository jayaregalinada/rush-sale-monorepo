---
status: accepted
---

# Purchase endpoint: HTTP status + outcome discriminator

## Context

`POST /sales/:saleId/purchases` has several *expected business outcomes* (success,
already-purchased, sold-out, sale not active) alongside genuine faults. Modelling
expected outcomes purely as HTTP errors floods monitoring with 4xx during a normal
sellout; modelling everything as `200` discards useful protocol-level signal. We want
both a precise status code *and* an unambiguous machine-readable reason.

## Decision

Every response carries an `{ outcome, ... }` discriminator in the body, and the HTTP
status reflects the outcome class:

| Outcome | HTTP | Notes |
| --- | --- | --- |
| `SUCCESS` | `201 Created` | a Reservation resource was created |
| `ALREADY_PURCHASED` | `200 OK` | **idempotent** - return the Buyer's existing Reservation, not an error |
| `SOLD_OUT` | `422 Unprocessable Content` | well-formed, but a business rule (no Stock) forbids it |
| `NOT_ACTIVE` (upcoming) | `409 Conflict` | sale not yet open - current state conflicts with the request |
| `NOT_ACTIVE` (ended) | `410 Gone` | sale window permanently over |
| bad input | `400` | genuine fault |
| unknown sale | `404` | genuine fault |
| dependency down | `503` | genuine fault |

The body discriminator is authoritative; clients switch on `outcome`, never on status
code alone. Alerting groups by `outcome`, so expected `422`/`409`/`410` during a sellout
don't read as system errors.

## Considered Options

- **All business outcomes as `200` + body** - clean, but discards protocol signal.
- **`409` for every business rejection** - consistent but conflates sold-out with
  window state and leans on "state conflict" where `422` ("business rule says no") is
  more accurate.
- **`425 Too Early` for upcoming** - rejected: `425` means "request may be replayed"
  (TLS early-data), it carries no "not yet open" semantics.

## Consequences

- `ALREADY_PURCHASED` being `200` keeps the buy endpoint **idempotent and safe to retry**.
- No authentication in this exercise: `userId` is taken from the request body. Production
  would derive the Buyer from an authenticated session (a client-supplied id lets a user
  burn another's slot). Documented as a known deviation.
