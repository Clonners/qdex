import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

const contractsRoot = new URL('../', import.meta.url);
const readContractFile = (path) => readFile(new URL(path, contractsRoot), 'utf8');

const config = await readContractFile('hardhat.config.cjs');
const pkg = JSON.parse(await readContractFile('package.json'));

assert.ok(config.includes("defaultNetwork: 'hardhat'"), 'Hardhat must default to the local in-memory network');
assert.ok(config.includes("version: '0.8.20'"), 'Hardhat compiler must stay pinned to the current Quai candidate');
assert.ok(config.includes("metadata: { bytecodeHash: 'ipfs', useLiteralContent: true }"), 'Quaiscan-compatible metadata settings must stay present');
assert.equal(pkg.scripts.check, 'node scripts/guard-local-only-hardhat-config.mjs');
assert.equal(pkg.scripts.test, 'pnpm run check');
assert.equal(pkg.scripts['test:local'], 'hardhat test --network hardhat');

const networksBlock = config.match(/networks:\s*\{([\s\S]*?)\n  \},/);
assert.ok(networksBlock, 'Hardhat config must include an explicit networks block');
const configuredNetworkNames = [...networksBlock[1].matchAll(/^\s{4}([A-Za-z0-9_]+):\s*\{/gm)].map((match) => match[1]);
assert.deepEqual(configuredNetworkNames, ['hardhat'], 'Autonomous contract harness may only define the local hardhat network');

for (const [pattern, label] of [
  [/process\.env/u, 'environment loading'],
  [/\baccounts\s*:/iu, 'external account wiring'],
  [/\burl\s*:/iu, 'external endpoint wiring'],
  [/\bRPC_URL\b/u, 'RPC URL variable'],
  [/\bcyprus\d?\b/iu, 'Cyprus network'],
  [/\borchard\b/iu, 'Orchard network'],
  [/\bmainnet\b/iu, 'mainnet network'],
  [/\btestnet\b/iu, 'testnet network'],
  [/\bwallet\b/iu, 'wallet material'],
  [/\bdeploy\b/iu, 'deployment action'],
]) {
  assert.doesNotMatch(config, pattern, `Local Hardhat config must not include ${label}`);
}

const scriptText = Object.values(pkg.scripts ?? {}).join('\n');
for (const pattern of [/\bcyprus\d?\b/iu, /\borchard\b/iu, /\bmainnet\b/iu, /\btestnet\b/iu, /\bRPC_URL\b/u, /process\.env/u]) {
  assert.doesNotMatch(scriptText, pattern, `Package scripts must stay local-only: ${pattern}`);
}

async function* walk(dirUrl) {
  for (const entry of await readdir(dirUrl, { withFileTypes: true })) {
    if (['node_modules', 'cache', 'artifacts'].includes(entry.name)) {
      continue;
    }

    const entryUrl = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, dirUrl);
    if (entry.isDirectory()) {
      yield* walk(entryUrl);
      continue;
    }

    yield entryUrl;
  }
}

for await (const fileUrl of walk(contractsRoot)) {
  const relativePath = fileUrl.pathname.slice(contractsRoot.pathname.length);
  assert.doesNotMatch(relativePath, /(^|\/)(deploy|deployment|broadcast|send-tx)(\.|\/|-|$)/iu, `Deployment-like file path is not allowed in autonomous harness: ${relativePath}`);
}
