#!/bin/bash
# QDEX campaign runner — runs omp directly, bypasses Hermes LLM
set -euo pipefail

export PATH="$HOME/.local/bin:$PATH"
cd /home/clonners/.hermes/hermes-agent/quai-terminal-dex

BEFORE=$(git log --oneline -3)

OUTPUT=$(timeout 1500 omp --model qwen-local/Qwen3.6-27B-Q4_K_M.gguf -p "QDEX autonomous campaign. Read CAMPAIGN_STATUS.md for next slice. Work on ONE bounded slice. RED test → GREEN implementation → pnpm check → git add -A && git commit -m 'slice: X'. Update CAMPAIGN_STATUS.md. No real RPC, wallets, signing, broadcasts, deploys, or funds. Deliver Spanish summary." 2>&1 || true)

AFTER=$(git log --oneline -5)

echo "QDEX Campaign Run"
echo "================="
echo ""
echo "Before: $BEFORE"
echo ""
echo "After: $AFTER"
echo ""
echo "$OUTPUT"
