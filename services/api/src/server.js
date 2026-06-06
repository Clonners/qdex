import http from 'node:http';
import { pathToFileURL } from 'node:url';

import { notFound, sendJson } from './http.js';
import { handlePrivateRoute } from './routes/private.js';
import { handleProofRoute } from './routes/proofs.js';
import { handlePublicRoute } from './routes/public.js';

const PORT = Number.parseInt(process.env.PORT ?? '8787', 10);
const ROUTE_HANDLERS = [handlePublicRoute, handlePrivateRoute, handleProofRoute];

export const handleApiRequest = (request) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  const context = {
    method: request.method ?? 'GET',
    pathname: url.pathname,
    searchParams: url.searchParams,
    headers: request.headers,
  };

  for (const handleRoute of ROUTE_HANDLERS) {
    const result = handleRoute(context, request);
    if (result !== null) {
      return result;
    }
  }

  return notFound(context);
};

export const createApiServer = () => http.createServer((request, response) => {
  try {
    sendJson(response, handleApiRequest(request));
  } catch (error) {
    sendJson(response, {
      statusCode: 500,
      body: {
        error: 'internal_error',
        message: error instanceof Error ? error.message : 'Unknown API error',
      },
    });
  }
});

const shouldListen = () => process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (shouldListen()) {
  const server = createApiServer();
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`@qdex/api listening on http://127.0.0.1:${PORT}`);
  });
}
