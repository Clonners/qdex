import { jsonResult } from '../http.js';

const tradeProofId = (pathname) => {
  const prefix = '/v1/proofs/trades/';
  if (!pathname.startsWith(prefix)) {
    return null;
  }

  const rawValue = pathname.slice(prefix.length);
  return rawValue.length > 0 ? decodeURIComponent(rawValue) : null;
};

export const handleProofRoute = ({ method, pathname, searchParams, state }) => {
  // GET /v1/proofs - list all proofs
  if (method === 'GET' && pathname === '/v1/proofs') {
    const limit = Math.min(Number(searchParams.get('limit')) || 50, 200);
    const proofs = state.listProofs();
    return jsonResult(200, {
      proofs: proofs.slice(0, limit),
      total: proofs.length,
      source: 'proof-service-indexer-projection',
    });
  }

  // GET /v1/proofs/trades/{tradeId}
  const tradeId = tradeProofId(pathname);

  if (method === 'GET' && tradeId !== null) {
    const result = state.getTradeProof(tradeId);
    return jsonResult(result.statusCode, result.body);
  }

  return null;
};
