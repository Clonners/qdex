import { jsonResult } from '../http.js';

export async function handleVaultRoute(context, vaultAdapter) {
  const { pathname, method, body } = context;

  if (method === 'GET' && pathname === '/v1/vault/config') {
    return jsonResult(200, {
      vaultAddress: vaultAdapter.vaultAddress,
      tokens: vaultAdapter.tokens,
      custody: 'non-custodial-contract-vault',
      settlementMode: 'quai_contract',
      realQuaiTransactions: true,
      source: 'vault-adapter',
    });
  }

  if (method === 'POST' && pathname === '/v1/vault/approve') {
    try {
      const { tokenSymbol, amount } = body || {};
      if (!tokenSymbol || !amount) return jsonResult(400, { error: 'missing_params' });
      const tokenAddress = vaultAdapter.tokens[tokenSymbol];
      if (!tokenAddress) return jsonResult(400, { error: 'invalid_token' });
      return jsonResult(200, vaultAdapter.buildApproveTx(tokenAddress, amount));
    } catch (error) {
      return jsonResult(500, { error: 'vault_error', message: error.message });
    }
  }

  if (method === 'POST' && pathname === '/v1/vault/deposit') {
    try {
      const { tokenSymbol, amount } = body || {};
      if (!tokenSymbol || !amount) return jsonResult(400, { error: 'missing_params' });
      const tokenAddress = vaultAdapter.tokens[tokenSymbol];
      if (!tokenAddress) return jsonResult(400, { error: 'invalid_token' });
      return jsonResult(200, vaultAdapter.buildDepositTx(tokenAddress, amount));
    } catch (error) {
      return jsonResult(500, { error: 'vault_error', message: error.message });
    }
  }

  if (method === 'POST' && pathname === '/v1/vault/withdraw') {
    try {
      const { tokenSymbol, amount } = body || {};
      if (!tokenSymbol || !amount) return jsonResult(400, { error: 'missing_params' });
      const tokenAddress = vaultAdapter.tokens[tokenSymbol];
      if (!tokenAddress) return jsonResult(400, { error: 'invalid_token' });
      return jsonResult(200, vaultAdapter.buildWithdrawTx(tokenAddress, amount));
    } catch (error) {
      return jsonResult(500, { error: 'vault_error', message: error.message });
    }
  }

  // GET /v1/vault/balance?address=0x00...
  if (method === 'GET' && pathname === '/v1/vault/balance') {
    const address = context.searchParams.get('address');
    if (!address) return jsonResult(400, { error: 'missing address parameter' });
    try {
      const balances = [];
      for (const [symbol, tokenAddr] of Object.entries(vaultAdapter.tokens)) {
        const balResult = await vaultAdapter.getBalance(address, tokenAddr);
        const availResult = await vaultAdapter.getAvailableBalance(address, tokenAddr);
        const lockedResult = await vaultAdapter.getLockedBalance(address, tokenAddr);
        balances.push({
          token: symbol,
          tokenAddress: tokenAddr,
          balance: balResult.balance || '0',
          available: availResult.available || '0',
          locked: lockedResult.locked || '0',
        });
      }
      return jsonResult(200, { address, balances, vaultAddress: vaultAdapter.vaultAddress });
    } catch (error) {
      return jsonResult(500, { error: 'vault_balance_error', message: error.message });
    }
  }

  // POST /v1/vault/allowance?address=... (from request URL)
  if (method === 'POST' && pathname === '/v1/vault/allowance') {
    try {
      const { address, tokenSymbol } = body || {};
      if (!address || !tokenSymbol) return jsonResult(400, { error: 'missing params' });
      const tokenAddress = vaultAdapter.tokens[tokenSymbol];
      if (!tokenAddress) return jsonResult(400, { error: 'invalid_token' });
      const allowance = await vaultAdapter.getAllowance(address, tokenAddress);
      return jsonResult(200, { address, tokenSymbol, tokenAddress, allowance, source: 'vault-adapter' });
    } catch (error) {
      return jsonResult(500, { error: 'vault_error', message: error.message });
    }
  }

  return null;
}
