# Relayer Service

Submits valid matched fills to mock settlement first and, later, to Quai settlement contracts.

See `spec.md` for the state machine and settlement/proof projection contract.

Responsibilities:

- consume matched fill packets
- validate signatures and local risk constraints before spending gas
- submit settlement transactions
- track pending/confirmed/failed txs
- expose settlement status to API/WebSocket

Non-goals:

- no custody
- no arbitrary balance mutation
- no withdrawal authority
