# Matching Engine Service

Adapter layer for the orderbook/matching engine.

Preferred direction:

- Keep matching deterministic and isolated.
- Integrate `exchange-core` or mirror its command/event model.
- Do not let matching-engine balances become final truth.
- Treat final fills as pending until settlement contract confirmation.

Specs:

- `spec.md` — command boundary, deterministic matching rules, `FillPacket` handoff.
- `events.md` — event envelope, matcher event shapes, settlement/proof lifecycle.
