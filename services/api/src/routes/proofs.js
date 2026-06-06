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
    const result = state.getTradeProof(tradeId);
    return jsonResult(result.statusCode, result.body);
  }

  return null;
};
