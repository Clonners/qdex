#!/bin/bash
# QDEX campaign runner - runs omp directly
set -euo pipefail

export PATH="$HOME/.local/bin:$PATH"
cd /home/clonners/.hermes/hermes-agent/quai-terminal-dex

BEFORE=$(git log --oneline -3)
OUTPUT=$(omp --model qwen-local/Qwen3.6-27B-Q4_K_M.gguf \
  --no-extensions \
  -p "QDEX campaign. Read CAMPAIGN_STATUS.md. Work ONE slice. RED→GREEN→pnpm check→git commit. Update status. No real RPC/wallets/signing/txs/funds. Spanish summary." 2>&1 || true)
AFTER=$(git log --oneline -5)

echo "QDEX Campaign Run"
echo "================="
echo ""
echo "Before: $BEFORE"
echo ""
echo "After: $AFTER"
echo ""
echo "$OUTPUT"
