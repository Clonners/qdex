# Matching Engine Service

Adapter layer for the orderbook/matching engine.

Preferred direction:

- Keep matching deterministic and isolated.
- Integrate `exchange-core` or mirror its command/event model.
- Do not let matching-engine balances become final truth.
- Treat final fills as pending until settlement contract confirmation.

Command model:

```text
PLACE_ORDER
CANCEL_ORDER
CANCEL_ALL
MATCH_TICK
SNAPSHOT
RESTORE
```

Event model:

```text
ORDER_ACCEPTED
ORDER_REJECTED
ORDER_MATCHED
ORDER_CANCELLED
FILL_PENDING_SETTLEMENT
FILL_CONFIRMED_ON_CHAIN
FILL_FAILED_ON_CHAIN
```
