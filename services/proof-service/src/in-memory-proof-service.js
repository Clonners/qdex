export const PROOF_SOURCE = 'proof-service-indexer-projection';
export const CUSTODY_NOTE = 'non-custodial-no-withdrawal-authority';

export const createInMemoryProofService = ({ indexer }) => ({
  getTradeProof(tradeId) {
    const proof = indexer.getProof(tradeId);
    if (proof === null) {
      return {
        statusCode: 404,
        body: {
          error: 'proof_not_found',
          tradeId,
          proof: null,
          source: PROOF_SOURCE,
          custody: CUSTODY_NOTE,
          message: 'No indexed settlement proof exists for this trade yet.',
        },
      };
    }

    return {
      statusCode: 200,
      body: {
        tradeId,
        source: PROOF_SOURCE,
        custody: CUSTODY_NOTE,
        proof,
      },
    };
  },
});
