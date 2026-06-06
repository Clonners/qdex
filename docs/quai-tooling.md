# Quai Contract Tooling Notes

This document records the current contract/tooling baseline for the Quai Terminal DEX MVP. It is based on public Quai docs and the `dominant-strategies/hardhat-example` repository inspected during the autonomous campaign.

## Decision summary

For the MVP contract work, use a **single-zone Hardhat + Quais SDK stack targeting Cyprus-1**.

- **Primary test/deploy stack:** Hardhat, `quais`, `@quai/hardhat-deploy-metadata`, and `@quai/quais-upgrades` only if upgrade tests are explicitly needed.
- **Contract language:** regular Solidity first, not SolidityX, because the MVP is single-zone and should avoid cross-zone/cross-chain complexity.
- **Network target for future live testing:** Orchard testnet Cyprus-1 only until contract tests, audits, and explicit approval exist.
- **MVP repo policy:** no real wallets, keys, transactions, deployments, or contract verification from autonomous cron runs.

## Toolchain

Official/current references point to Hardhat rather than Foundry for Quai Solidity deployment.

Recommended initial `contracts/` stack when contract implementation starts:

```text
hardhat: ^2.19.5
@nomicfoundation/hardhat-toolbox: ^5.0.0
quais: ^1.0.0-alpha.36
@quai/hardhat-deploy-metadata: ^1.0.8
@openzeppelin/contracts: only after compiler/version compatibility is pinned
```

Hardhat config assumptions from the public `hardhat-example`:

```js
require('@nomicfoundation/hardhat-toolbox')
require('@quai/quais-upgrades')
require('@quai/hardhat-deploy-metadata')

module.exports = {
  defaultNetwork: 'cyprus1',
  networks: {
    cyprus1: {
      url: process.env.RPC_URL,
      accounts: [process.env.CYPRUS1_PK],
      chainId: Number(process.env.CHAIN_ID),
    },
  },
  solidity: {
    compilers: [
      {
        version: '0.8.17',
        settings: {
          optimizer: { enabled: true, runs: 1000 },
          metadata: { bytecodeHash: 'ipfs', useLiteralContent: true },
          evmVersion: 'london',
        },
      },
      {
        version: '0.8.20',
        settings: {
          optimizer: { enabled: true, runs: 1000 },
          metadata: { bytecodeHash: 'ipfs', useLiteralContent: true },
          evmVersion: 'london',
        },
      },
    ],
  },
}
```

For DEX contracts, prefer a pinned compiler once tests exist. Current docs have a conflict: the Solidity reference page says Quai EVM supports Solidity up to `0.8.19`, while the current Solidity deployment guide and `hardhat-example` use/support `0.8.20`. Treat `0.8.20` as the candidate because the active example uses it, but keep this as an open risk before deploying value-bearing contracts.

## RPC and chain IDs

Use Cyprus-1 for the first MVP. Quai docs state Cyprus-1 is currently the only active zone.

| Environment | Chain ID | HTTPS RPC | WSS RPC | GraphQL | Explorer |
| --- | ---: | --- | --- | --- | --- |
| Mainnet Cyprus-1 | `9` | `https://rpc.quai.network/cyprus1` | `wss://rpc.quai.network/cyprus1` | `https://graph.quai.network` | `https://quaiscan.io` |
| Orchard Cyprus-1 | `15000` | `https://orchard.rpc.quai.network/cyprus1` | `wss://orchard.rpc.quai.network/cyprus1` | `https://orchard.graph.quai.network` | `https://orchard.quaiscan.io` |
| Local | `1337` | local node runner, Cyprus1 HTTP `9200` | local node runner, Cyprus1 WS `8200` | local only | none by default |

API/client assumptions:

- Go-Quai JSON-RPC uses the `quai_` namespace rather than the Ethereum `eth_` namespace.
- The Quais SDK is Ethers-v6-like and should be used for transaction sending/signing and contract wrappers.
- Public SDK examples use `new quais.JsonRpcProvider('https://rpc.quai.network', undefined, { usePathing: true })`; for direct per-zone endpoints, preserve the Cyprus-1 path explicitly.

## Explorer and contract verification

Quaiscan is the explorer target:

```text
mainnet: https://quaiscan.io
orchard: https://orchard.quaiscan.io
```

The current Hardhat verification path uses `@quai/hardhat-deploy-metadata`, which pushes compiler metadata to IPFS so contracts can be verified on Quaiscan.

Compiler metadata settings are not optional for verifiability:

```js
metadata: {
  bytecodeHash: 'ipfs',
  useLiteralContent: true,
}
```

Do not remove those settings once production contract compilation is introduced.

## Token assumptions for the DEX MVP

Quai has two native assets with different ledger models:

- **QUAI:** smart-contract account-model asset.
- **Qi:** UTXO-model privacy asset; native Qi is UTXO-model and needs explicit settlement design before it can back a contract vault.

Implications for the MVP:

1. The mock market may remain `QI-QUAI` for product continuity.
2. Real contract settlement should start with account-model assets the vault can actually custody/lock under signed-order rules.
3. Native Qi settlement needs additional research before production contracts: either a confirmed Quai contract primitive, a wrapper/adapter, or an explicit conversion flow. Do not assume UTXO Qi can be treated like an ERC-20 inside `TradingVault`.
4. Until that is confirmed, use mock/wrapped token identifiers in API schemas and proofs, and label them as non-production.

## Open risks before production Solidity

- Resolve the documented Solidity version conflict (`0.8.19` reference page vs `0.8.20` deployment guide/example).
- Confirm exact Quaiscan verification command/API after a local/Orchard dry run in a manual, approved environment.
- Confirm whether Foundry can safely support Quai-specific transaction/pathing needs; not selected for MVP.
- Confirm native Qi smart-contract handling before promising real `QI-QUAI` non-custodial settlement.
- Confirm local node runner setup and whether it can support deterministic contract tests without external RPC.
- Define testnet-only environment handling that never commits real wallet material.

## Sources checked

- Quai docs `llms.txt` / `llms-full.txt`: `https://docs.qu.ai/llms.txt`, `https://docs.qu.ai/llms-full.txt`
- Networks: `https://docs.qu.ai/build/networks`
- Development introduction: `https://docs.qu.ai/build/introduction`
- Solidity support: `https://docs.qu.ai/build/smart-contracts/solidity`
- Contract deployment: `https://docs.qu.ai/build/smart-contracts/deployment`
- Solidity deployment tutorial: `https://docs.qu.ai/guides/development/solidity`
- JavaScript libraries / Quais SDK: `https://docs.qu.ai/build/apis/javascript-libraries`
- Hardhat example: `https://github.com/dominant-strategies/hardhat-example`
