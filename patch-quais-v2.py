#!/usr/bin/env python3
"""Patch quais SDK formatMixedCaseChecksumAddress to handle 42-char Quai addresses."""

target = "/home/clonners/.hermes/hermes-agent/quai-terminal-dex/node_modules/quais/lib/esm/address/address.js"

with open(target, "r") as f:
    content = f.read()

# Replace formatMixedCaseChecksumAddress to handle 0x00 prefix
old_func = """export function formatMixedCaseChecksumAddress(address) {
    address = address.toLowerCase();
    const chars = address.substring(2).split('');
    const expanded = new Uint8Array(40);
    for (let i = 0; i < 40; i++) {
        expanded[i] = chars[i].charCodeAt(0);
    }
    const hashed = getBytes(keccak256(expanded));
    for (let i = 0; i < 40; i += 2) {
        if (hashed[i >> 1] >> 4 >= 8) {
            chars[i] = chars[i].toUpperCase();
        }
        if ((hashed[i >> 1] & 0x0f) >= 8) {
            chars[i + 1] = chars[i + 1].toUpperCase();
        }
    }
    return '0x' + chars.join('');
}"""

new_func = """export function formatMixedCaseChecksumAddress(address) {
    address = address.toLowerCase();
    const isQuai = address.startsWith('0x00') && address.length === 44;
    const offset = isQuai ? 4 : 2;
    const prefix = isQuai ? '0x00' : '0x';
    const chars = address.substring(offset).split('');
    const expanded = new Uint8Array(40);
    for (let i = 0; i < 40; i++) {
        expanded[i] = chars[i].charCodeAt(0);
    }
    const hashed = getBytes(keccak256(expanded));
    for (let i = 0; i < 40; i += 2) {
        if (hashed[i >> 1] >> 4 >= 8) {
            chars[i] = chars[i].toUpperCase();
        }
        if ((hashed[i >> 1] & 0x0f) >= 8) {
            chars[i + 1] = chars[i + 1].toUpperCase();
        }
    }
    return prefix + chars.join('');
}"""

if old_func in content:
    content = content.replace(old_func, new_func)
    with open(target, "w") as f:
        f.write(content)
    print("✅ formatMixedCaseChecksumAddress patched for 42-char support")
else:
    print("❌ Could not find function to patch")
