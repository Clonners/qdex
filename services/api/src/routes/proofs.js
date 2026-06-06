import { jsonResult } from '../http.js';
import { CUSTODY_NOTE } from '../mock-dex.js';

const PROOF_SOURCE = 'proof-service-indexer-projection';

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
        source: PROOF_SOURCE,
        custody: CUSTODY_NOTE,
      });
    }

    return jsonResult(404, {
      error: 'proof_not_found',
      tradeId,
      proof: null,
      source: PROOF_SOURCE,
      custody: CUSTODY_NOTE,
      message: 'No indexed settlement proof exists for this trade yet.',
    });
  }

  return null;
};
