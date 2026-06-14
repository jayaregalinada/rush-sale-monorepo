---
status: accepted
---

# NestJS on the Fastify adapter (TypeScript)

## Context

The brief allows Express, Fastify, Nest, or native `http`, and grades both
high-throughput design and clean, maintainable code. Bookipi is a product-SaaS team
maintaining a long-lived codebase, so structure and testability matter as much as raw
speed.

## Decision

Build the API with **NestJS in TypeScript, running on the `@nestjs/platform-fastify`
adapter** instead of the default Express adapter. Nest provides the module/DI structure
and testability a senior reviewer expects; the Fastify adapter supplies the throughput
the flash-sale brief demands. The concurrency-critical logic lives in a thin, sharply
named module so it is not buried under framework boilerplate.

## Consequences

- Slightly less conventional than Nest-on-Express; a couple of plugins differ — accepted
  for the throughput and the explicit-trade-off signal.
- Keep the Gate logic in its own small module to stay legible.
