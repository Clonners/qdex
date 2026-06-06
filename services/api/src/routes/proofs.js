import { jsonResult } from '../http.js';

const tradeProofId = (pathname) => {
  const prefix = '/v1/proofs/trades/';
  if (!pathname.startsWith(prefix)) {
    return null;
  }

  const rawValue = pathname.slice(prefix.length);
  return rawValue.length > 0 ? decodeURIComponent(rawValue) : null;
};

export const handleProofRoute = ({ method, pathname, state }) => {
  const tradeId = tradeProofId(pathname);

  if (method === 'GET' && tradeId !== null) {
    const proof = state.getProof(tradeId);
    if (proof !== null) {
      return jsonResult(200, {
        tradeId,
        proof,
        source: 'mock-proof-projection',
      });
    }

    return jsonResult(404, {
      error: 'proof_not_found',
      tradeId,
      proof: null,
      source: 'mock-proof-projection',
      message: 'No indexed settlement proof exists for this trade yet.',
    });
  }

  return null;
};
