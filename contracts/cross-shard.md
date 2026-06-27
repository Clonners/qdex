# QDEX Cross-Shard Deployment Strategy

## Architecture

```
Prime (chain ID 9)
 └── Región 0: Cyprus [zona 0, 1, 2]
       ├── Cyprus-1 → [0,0] ← ✅ ACTUALMENTE ACTIVO (Deployado)
       ├── Cyprus-2 → [0,1] ← PENDING
       └── Cyprus-3 → [0,2] ← PENDING
 └── Región 1: Paxos [zona 0, 1, 2] ← PENDING
 └── Región 2: Hydra [zona 0, 1, 2] ← PENDING
```

## Address Sharding

Los primeros 9 bits de cada dirección determinan el scope:

```
Byte 0:  XXXXZZZZ L
         │   │    └─ Bit 8: Ledger (0=Quai EVM, 1=Qi UTXO)
         │   └─────── Bits 4-7: Zone number (0-15)
         └─────────── Bits 0-3: Region number (0-15)
```

| Address Prefix | Region | Zone | Ledger | ¿Dónde? |
|---------------|--------|------|--------|---------|
| `0x00xxxx...` | 0 | 0 | Quai | **Cyprus-1** ✅ |
| `0x01xxxx...` | 0 | 1 | Quai | Cyprus-2 |
| `0x02xxxx...` | 0 | 2 | Quai | Cyprus-3 |
| `0x008xxx...` | 0 | 0 | Qi | Cyprus-1 / Qi UTXO |

## Deployment Model

### Single Shard (Cyprus-1) — ACTUAL

```javascript
// contracts/scripts/deploy-quai.mjs
// Use BASE RPC with usePathing: true
const provider = new JsonRpcProvider('https://orchard.rpc.quai.network', undefined, { usePathing: true });
const wallet = new Wallet(PK, provider); // 0x00... = Cyprus-1
const factory = new ContractFactory(abi, bytecode, wallet);
factory.setIPFSHash('0'.repeat(46));
const contract = await factory.deploy();
```

### Multi-Shard — FUTURE

1. **Deploy sister contracts** en cada shard activo:
   - Cyprus-1: `0x00...` ← ✅ ya hecho
   - Cyprus-2: `0x01...` ← cuando exista
   - Cyprus-3: `0x02...` ← cuando exista

2. **Derivar wallet por zona** usando `QuaiHDWallet.getNextAddressSync(account, zone)`:
   ```javascript
   const wallet = new QuaiHDWallet(mnemonic, provider);
   const cyprus1Wallet = wallet.getNextAddressSync(0, 0); // [region 0, zone 0]
   const cyprus2Wallet = wallet.getNextAddressSync(0, 1); // [region 0, zone 1]
   ```

3. **Vincular con TOFU** (Trust On First Use):
   - Cada Settlement guarda las direcciones de sus "hermanos"
   - Constructor o función `setSisterContracts(addresses)` después del deploy
   - Comunicación cross-shard vía ETX (External Transactions)

## Sister Contract Linking

```solidity
contract Settlement {
    // Map of sister contract addresses by zone index
    mapping(uint8 zoneIndex => address sisterAddress) public sisters;
    
    // Initialize sister links (TOFU)
    function setSisterContracts(
        uint8[] calldata zoneIndices,
        address[] calldata sisterAddresses
    ) external onlyOwner {
        require(zoneIndices.length == sisterAddresses.length, "length mismatch");
        for (uint i = 0; i < zoneIndices.length; i++) {
            sisters[zoneIndices[i]] = sisterAddresses[i];
        }
    }
    
    // Cross-shard communication via ETX
    function forwardToSister(
        uint8 zoneIndex,
        bytes calldata data
    ) external onlyOwner returns (bytes memory) {
        address sister = sisters[zoneIndex];
        require(sister != address(0), "no sister for zone");
        // Use quai-specific opcode for cross-zone calls
        // This returns immediately; actual execution happens via ETX
        return forwardCrossZone(zoneIndex, sister, data);
    }
}
```

## Current Deployed State

| Contract | Cyprus-1 Address | Status |
|----------|-----------------|--------|
| Settlement | `0x00497118fAA729aC1d981c680080d7428fE8a4Bd` | ✅ Deployed |
| vault | `0x002325d071d57bafd3169f270a71b67a05360abf` | ✅ Deployed |
| nonceManager | `0x000c826c29746b9c35a9712fed465ba0a9902584` | ✅ Deployed |
| marketRegistry | `0x00793e6ac77dd2b895cc57eb90a7b3274d69353d` | ✅ Deployed |
| feeManager | `0x005a069df8705f4c47f3cd924ad9b8f39517f383` | ✅ Deployed |
| delegateKeyRegistry | `0x002a307a11d6f736d480a7e08fbe519e2d44b676` | ✅ Deployed |

## Rollout Plan

### Phase 1: Single Zone (DONE)
- [x] Deploy en Cyprus-1 con `usePathing: true`
- [x] Verificar que los contratos tienen código
- [x] Actualizar API config con las direcciones

### Phase 2: Multi-Zone Cyprus (WHEN ACTIVE)
- [ ] Deploy Settlement + subs en Cyprus-2
- [ ] Deploy Settlement + subs en Cyprus-3
- [ ] Vincular los 3 Settlements entre sí
- [ ] Test cross-zone ETX communication

### Phase 3: Full Network (WHEN ACTIVE)
- [ ] Deploy en Paxos 1/2/3
- [ ] Deploy en Hydra 1/2/3
- [ ] Vincular los 9 Settlements
- [ ] Test cross-region ETX communication
- [ ] Implement automatic market sync across zones

## RPC Configuration

| Network | URL | Pathing |
|---------|-----|---------|
| Orchard | `https://orchard.rpc.quai.network` | `usePathing: true` |
| Mainnet | `https://rpc.quai.network` | `usePathing: true` |

## Important

- **NUNCA** usar `/cyprus1` en la URL base con `usePathing: true`
- **NUNCA** usar `eth_sendRawTransaction` sin pathing
- **SIEMPRE** usar IPFS hash de 46 caracteres (sin `0x` prefix)
- Las wallets derivadas por zona son diferentes de la wallet base
