import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { notFound, sendJson } from './http.js';
import { createMockDexState } from './mock-dex.js';
import { handlePrivateRoute } from './routes/private.js';
import { handleProofRoute } from './routes/proofs.js';
import { handlePublicRoute } from './routes/public.js';
import { attachStreamWebSocketUpgrade } from './websocket.js';

const PORT = Number.parseInt(process.env.PORT ?? '8787', 10);
const ROUTE_HANDLERS = [handlePublicRoute, handlePrivateRoute, handleProofRoute];
const METHODS_WITH_JSON_BODY = new Set(['POST', 'PUT', 'PATCH']);
const MAX_JSON_BODY_BYTES = 1_000_000;
const UI_DIR = path.join(process.cwd(), 'web', 'terminal-ui');
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const serveStatic = (response, filePath) => {
  const ext = path.extname(filePath);
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
  };
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  try {
    const content = fs.readFileSync(filePath);
    response.writeHead(200, { 'Content-Type': contentType, ...CORS_HEADERS });
    response.end(content);
    return true;
  } catch {
    return false;
  }
};

const readJsonBody = async (request) => {
  const method = request.method ?? 'GET';
  if (!METHODS_WITH_JSON_BODY.has(method)) {
    return { body: null };
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_JSON_BODY_BYTES) {
      return {
        error: {
          statusCode: 413,
          body: {
            error: 'payload_too_large',
            message: 'JSON request body exceeds the 1MB mock API limit.',
          },
        },
      };
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return { body: null };
  }

  const rawBody = Buffer.concat(chunks).toString('utf8').trim();
  if (rawBody.length === 0) {
    return { body: null };
  }
  try {
    return { body: JSON.parse(rawBody) };
  } catch {
    return {
      error: {
        statusCode: 400,
        body: {
          error: 'invalid_json',
          message: 'Request body must be valid JSON.',
        },
      },
    };
  }
};

export const handleApiRequest = (request, state = createMockDexState(), body = null) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  const context = {
    method: request.method ?? 'GET',
    pathname: url.pathname,
    searchParams: url.searchParams,
    headers: request.headers,
    body,
    state,
  };

  for (const handleRoute of ROUTE_HANDLERS) {
    const result = handleRoute(context, request);
    if (result !== null) {
      return result;
    }
  }

  return notFound(context);
};

const sendCorsJson = (response, result) => {
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    response.setHeader(key, value);
  }
  sendJson(response, result);
};

export const createApiServer = ({ state = createMockDexState() } = {}) => {
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
      const pathname = url.pathname;

      // Handle OPTIONS preflight
      if (request.method === 'OPTIONS') {
        response.writeHead(204, CORS_HEADERS);
        response.end();
        return;
      }

      // Serve static UI files
      if (pathname === '/' || pathname === '/index.html') {
        if (serveStatic(response, path.join(UI_DIR, 'index.html'))) return;
      } else if (!pathname.startsWith('/v1/')) {
        // Serve lightweight-charts vendor
        const tvPath = path.join(process.cwd(), 'node_modules', 'lightweight-charts', 'dist', 'lightweight-charts.standalone.production.js');
        if (pathname === '/vendor/lightweight-charts.js' && serveStatic(response, tvPath)) return;

        // Serve other static files from UI dir
        const safePath = path.normalize(pathname).replace(/\.\./, '');
        const filePath = path.join(UI_DIR, safePath);
        if (filePath.startsWith(UI_DIR) && serveStatic(response, filePath)) return;
      }

      // API routes
      const bodyResult = await readJsonBody(request);
      if (bodyResult.error !== undefined) {
        sendCorsJson(response, bodyResult.error);
        return;
      }

      sendCorsJson(response, handleApiRequest(request, state, bodyResult.body));
    } catch (error) {
      sendCorsJson(response, {
        statusCode: 500,
        body: {
          error: 'internal_error',
          message: error instanceof Error ? error.message : 'Unknown API error',
        },
      });
    }
  });

  return attachStreamWebSocketUpgrade(server, { state });
};

const shouldListen = () => process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (shouldListen()) {
  const server = createApiServer();
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`@qdex/api listening on http://127.0.0.1:${PORT}`);
  });
}
