#!/usr/bin/env node
import { pathToFileURL } from 'node:url';

import { QDexClient, runMockCrossSmoke } from '../../../sdk/typescript/src/client.js';

const DEFAULT_BASE_URL = 'http://127.0.0.1:8787';

const parseArgs = (argv) => {
  const args = [...argv];
  let baseUrl = process.env.QDEX_BASE_URL ?? DEFAULT_BASE_URL;

  for (let index = 0; index < args.length;) {
    const arg = args[index];
    if (arg === '--base-url') {
      baseUrl = args[index + 1];
      args.splice(index, 2);
      continue;
    }

    if (arg.startsWith('--base-url=')) {
      baseUrl = arg.slice('--base-url='.length);
      args.splice(index, 1);
      continue;
    }

    index += 1;
  }

  return { baseUrl, args };
};

const writeJson = (stdout, payload) => {
  stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
};

const parsePositiveInteger = (value, label) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || String(parsed) !== String(value)) {
    throw new Error(`${label} must be a positive integer.`);
  }

  return parsed;
};

const parseNonNegativeInteger = (value, label) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0 || String(parsed) !== String(value)) {
    throw new Error(`${label} must be a non-negative integer.`);
  }

  return parsed;
};

const parseStreamOptions = (args) => {
  let limit = 1;
  let timeoutMs = 2_000;

  for (let index = 0; index < args.length;) {
    const arg = args[index];
    if (arg === '--limit') {
      limit = parsePositiveInteger(args[index + 1], '--limit');
      index += 2;
      continue;
    }

    if (arg.startsWith('--limit=')) {
      limit = parsePositiveInteger(arg.slice('--limit='.length), '--limit');
      index += 1;
      continue;
    }

    if (arg === '--timeout-ms') {
      timeoutMs = parsePositiveInteger(args[index + 1], '--timeout-ms');
      index += 2;
      continue;
    }

    if (arg.startsWith('--timeout-ms=')) {
      timeoutMs = parsePositiveInteger(arg.slice('--timeout-ms='.length), '--timeout-ms');
      index += 1;
      continue;
    }

    throw new Error(`unknown stream option: ${arg}`);
  }

  return { limit, timeoutMs };
};

const parseNonceCancelOptions = (args) => {
  const request = {};
  const nonceRange = {};
  let prepare = false;

  for (let index = 0; index < args.length;) {
    const arg = args[index];

    if (arg === '--prepare') {
      prepare = true;
      index += 1;
      continue;
    }

    if (arg === '--owner') {
      request.owner = args[index + 1];
      index += 2;
      continue;
    }

    if (arg === '--nonce') {
      request.nonce = args[index + 1];
      index += 2;
      continue;
    }

    if (arg === '--from') {
      nonceRange.from = args[index + 1];
      index += 2;
      continue;
    }

    if (arg === '--to') {
      nonceRange.to = args[index + 1];
      index += 2;
      continue;
    }

    if (arg === '--chain-id') {
      request.chainId = parseNonNegativeInteger(args[index + 1], '--chain-id');
      index += 2;
      continue;
    }

    if (arg === '--nonce-manager-contract') {
      request.nonceManagerContract = args[index + 1];
      index += 2;
      continue;
    }

    if (arg === '--expires-at') {
      request.expiresAt = parsePositiveInteger(args[index + 1], '--expires-at');
      index += 2;
      continue;
    }

    if (arg === '--signature') {
      request.signature = args[index + 1];
      index += 2;
      continue;
    }

    throw new Error(`unknown nonces cancel option: ${arg}`);
  }

  if (!prepare) {
    throw new Error('nonces cancel requires --prepare; this CLI does not sign or broadcast nonce cancellations.');
  }

  for (const requiredField of ['owner', 'chainId', 'nonceManagerContract', 'expiresAt', 'signature']) {
    if (request[requiredField] === undefined) {
      throw new Error(`nonces cancel --prepare requires ${requiredField}.`);
    }
  }

  const hasSingleNonce = request.nonce !== undefined;
  const hasRange = nonceRange.from !== undefined || nonceRange.to !== undefined;

  if (hasSingleNonce && hasRange) {
    throw new Error('nonces cancel --prepare accepts either --nonce or --from/--to, not both.');
  }

  if (hasSingleNonce) {
    return { action: 'cancelNonce', ...request };
  }

  if (nonceRange.from === undefined || nonceRange.to === undefined) {
    throw new Error('nonces cancel --prepare requires --nonce or both --from and --to.');
  }

  return {
    action: 'cancelNonceRange',
    ...request,
    nonceRange,
  };
};

const usage = () => `Usage:
  qdex --base-url http://127.0.0.1:8787 markets
  qdex --base-url http://127.0.0.1:8787 book QI-QUAI
  qdex --base-url http://127.0.0.1:8787 contracts
  qdex --base-url http://127.0.0.1:8787 listings policy
  qdex --base-url http://127.0.0.1:8787 relayer gate
  qdex --base-url http://127.0.0.1:8787 nonces cancel --prepare --owner <0xowner> --nonce <nonce> --chain-id <id> --nonce-manager-contract <0xcontract> --expires-at <unix> --signature <0xsig>
  qdex --base-url http://127.0.0.1:8787 proof trade <trade-id>
  qdex --base-url http://127.0.0.1:8787 cancel --all
  qdex --base-url http://127.0.0.1:8787 stream fills [--limit 1]
  qdex --base-url http://127.0.0.1:8787 stream orders [--limit 1]
  qdex --base-url http://127.0.0.1:8787 smoke
`;

export const runQdexCli = async (argv = process.argv.slice(2), {
  stdout = process.stdout,
  stderr = process.stderr,
  fetch: fetchImpl = globalThis.fetch,
} = {}) => {
  const { baseUrl, args } = parseArgs(argv);
  const [command, ...rest] = args;
  const client = new QDexClient({ baseUrl, fetch: fetchImpl });

  try {
    if (command === 'markets') {
      writeJson(stdout, {
        command: 'markets',
        baseUrl,
        markets: await client.markets.list(),
      });
      return 0;
    }

    if (command === 'book') {
      const marketId = rest[0] ?? 'QI-QUAI';
      writeJson(stdout, {
        command: 'book',
        ...(await client.orderbook.get(marketId)),
      });
      return 0;
    }

    if (command === 'contracts') {
      writeJson(stdout, {
        command: 'contracts',
        baseUrl,
        ...(await client.contracts.get()),
      });
      return 0;
    }

    if (command === 'listings' && rest[0] === 'policy') {
      writeJson(stdout, {
        command: 'listings policy',
        baseUrl,
        ...(await client.listings.policy.get()),
      });
      return 0;
    }

    if (command === 'relayer' && rest[0] === 'gate') {
      writeJson(stdout, {
        command: 'relayer gate',
        baseUrl,
        ...(await client.relayer.settlementModeGate.get()),
      });
      return 0;
    }

    if (command === 'nonces' && rest[0] === 'cancel') {
      const request = parseNonceCancelOptions(rest.slice(1));
      const result = await client.nonces.prepareCancel(request);
      writeJson(stdout, {
        command: 'nonces cancel prepare',
        baseUrl,
        status: result.status,
        ...result.body,
      });
      return 0;
    }

    if (command === 'proof' && rest[0] === 'trade' && rest[1] !== undefined) {
      const proofEnvelope = await client.proofs.trade(rest[1]);
      writeJson(stdout, {
        command: 'proof trade',
        source: proofEnvelope.source,
        custody: proofEnvelope.custody,
        proof: proofEnvelope.proof,
      });
      return 0;
    }

    if (command === 'cancel' && rest.length === 1 && rest[0] === '--all') {
      writeJson(stdout, {
        command: 'cancel all',
        baseUrl,
        ...(await client.orders.cancelAll()),
      });
      return 0;
    }

    if (command === 'stream' && (rest[0] === 'fills' || rest[0] === 'orders')) {
      const channel = rest[0];
      const options = parseStreamOptions(rest.slice(1));
      const messages = await client[channel].stream(options);
      writeJson(stdout, {
        command: `stream ${channel}`,
        baseUrl,
        channel,
        transport: 'websocket',
        limit: options.limit,
        messages,
      });
      return 0;
    }

    if (command === 'smoke') {
      const smoke = await runMockCrossSmoke(client);
      const delegateSafety = await client.delegateKeys.list();
      writeJson(stdout, {
        command: 'smoke',
        baseUrl,
        marketId: smoke.marketId,
        fill: smoke.fill,
        proof: {
          source: smoke.proofEnvelope.source,
          custody: smoke.proofEnvelope.custody,
          ...smoke.proof,
        },
        delegateSafety,
      });
      return 0;
    }

    stderr.write(usage());
    return 2;
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
};

const shouldRun = () => process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (shouldRun()) {
  const exitCode = await runQdexCli();
  process.exitCode = exitCode;
}
