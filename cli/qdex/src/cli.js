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

const usage = () => `Usage:
  qdex --base-url http://127.0.0.1:8787 markets
  qdex --base-url http://127.0.0.1:8787 book QI-QUAI
  qdex --base-url http://127.0.0.1:8787 contracts
  qdex --base-url http://127.0.0.1:8787 proof trade <trade-id>
  qdex --base-url http://127.0.0.1:8787 stream fills [--limit 1]
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

    if (command === 'stream' && rest[0] === 'fills') {
      const options = parseStreamOptions(rest.slice(1));
      const messages = await client.fills.stream(options);
      writeJson(stdout, {
        command: 'stream fills',
        baseUrl,
        channel: 'fills',
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
