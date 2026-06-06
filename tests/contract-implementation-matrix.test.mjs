import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repoRoot = new URL('../', import.meta.url);
const readRepoFile = (path) => readFile(new URL(path, repoRoot), 'utf8');

test('contract implementation test matrix pins local-only custody and proof invariants', async () => {
  const matrix = await readRepoFile('docs/contract-implementation-test-matrix.md');

  for (const requiredText of [
    '# Contract Implementation Test Matrix',
    '## Local-only execution boundary',
    '- No deployments, RPC calls, real wallets, private credentials, recovery material, or funds.',
    '- Contract implementation tests must run against a local in-memory Hardhat network only until Clonners explicitly approves Orchard/testnet work.',
    '## TradingVault test matrix',
    '| TV-01 | User deposit increases available balance |',
    '| TV-02 | User withdraws only caller-owned available balance |',
    '| TV-03 | Admin/operator cannot withdraw user funds |',
    '| TV-04 | Locked balances cannot be withdrawn by the user until unlocked or settled |',
    '| TV-05 | Settlement-only lock/unlock/move hooks reject non-settlement callers |',
    '| TV-06 | Trading pause never becomes a broad withdrawal freeze |',
    '## Settlement test matrix',
    '| ST-01 | Valid signed fill settles once |',
    '| ST-02 | Fill rejects reused or cancelled nonces |',
    '| ST-03 | Fill rejects expired orders and replay-domain mismatch |',
    '| ST-04 | Fill rejects disabled markets and invalid price/amount constraints |',
    '| ST-05 | Partial fill accounting cannot exceed signed order amounts |',
    '| ST-06 | Fee cap and fee recipient are enforced before balance movement |',
    '| ST-07 | TradeSettled event is the only public proof trigger |',
    '## Dependency contract matrix',
    '| NonceManager | `NM-01`: `cancelNonce`, `cancelNonceRange`, `markNonceUsed` |',
    '| MarketRegistry | enabled market metadata and precision/minimums |',
    '| FeeManager | hard `maxFeeBps()` cap plus fee-update events |',
    '| DelegateKeyRegistry | `READ_ONLY`, trading/cancel permissions, `NO_WITHDRAW`, `NO_ADMIN` |',
    '## Approval gates before real Quai activity',
    '- Adding a Hardhat test harness is allowed only for local/in-memory execution unless explicitly approved.',
    '- Orchard deployments, contract verification, private keys, or transaction sends require explicit Clonners approval.',
    '## Native Qi caveat',
    'Native Qi is UTXO-model and must not be treated as an ERC-20 vault token until a wrapper/adapter/conversion design is proven.',
  ]) {
    assert.ok(matrix.includes(requiredText), `matrix should include: ${requiredText}`);
  }

  assert.doesNotMatch(matrix, /adminWithdraw|operatorWithdraw|emergencyWithdraw|withdrawFor|rescueFunds|rescueTokens|sweep/i, 'matrix must not normalize admin/operator withdrawal selectors');
});

test('contracts overview links the implementation test matrix', async () => {
  const contractsDoc = await readRepoFile('docs/contracts.md');

  assert.ok(
    contractsDoc.includes('[`docs/contract-implementation-test-matrix.md`](./contract-implementation-test-matrix.md)'),
    'docs/contracts.md should link the implementation test matrix',
  );
});
