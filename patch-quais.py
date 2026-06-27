#!/usr/bin/env python3
"""Patch quais SDK to accept 42-char Quai addresses (PR #451 fix)."""

base = "/home/clonners/.hermes/hermes-agent/quai-terminal-dex/node_modules/quais/lib/esm/address"

# Patch checks.js
with open(f"{base}/checks.js", "r") as f:
    content = f.read()

# resolveAddress
old = "if (target.match(/^0x[0-9a-f]{40}$/i)) {"
new = "if (target.match(/^0x[0-9a-f]{40}$/i) || target.match(/^0x00[0-9a-f]{40}$/i)) {"
content = content.replace(old, new, 1)

# validateAddress
old2 = "address.match(/^(0x)?[0-9a-fA-F]{40}$/)"
new2 = "address.match(/^(0x)?[0-9a-fA-F]{40}$/) || address.match(/^(0x)?00[0-9a-fA-F]{40}$/)"
content = content.replace(old2, new2, 1)

with open(f"{base}/checks.js", "w") as f:
    f.write(content)
print("✅ checks.js patched")

# Patch address.js
with open(f"{base}/address.js", "r") as f:
    content = f.read()

old3 = "if (address.match(/^(0x)?[0-9a-fA-F]{40}$/)) {"
new3 = "if (address.match(/^(0x)?[0-9a-fA-F]{40}$/) || address.match(/^(0x)?00[0-9a-fA-F]{40}$/)) {"
content = content.replace(old3, new3, 1)

with open(f"{base}/address.js", "w") as f:
    f.write(content)
print("✅ address.js patched")

# Verify
with open(f"{base}/checks.js", "r") as f:
    checks = f.read()
with open(f"{base}/address.js", "r") as f:
    addr = f.read()

print(f"checks.js: {checks.count('0x00[0-9a-f]')} 42-char pattern(s)")
print(f"address.js: {addr.count('00[0-9a-fA-F]')} 42-char pattern(s)")
print("✅ Patch complete!")
