# Indexer Service

Reads Quai contract events and builds queryable state for UI/API.

Indexed event classes:

- deposits
- withdrawals
- balance locks/unlocks
- settled trades
- cancelled nonces
- market/fee/admin changes

Rule:

```text
contract events are final truth; DB is cache/projection
```
