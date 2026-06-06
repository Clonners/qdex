import http from 'node:http';

const PORT = Number.parseInt(process.env.PORT ?? '8787', 10);

const json = (response, statusCode, body) => {
  const payload = JSON.stringify(body, null, 2);
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(`${payload}\n`);
};

const notImplemented = (response, route) => json(response, 501, {
  error: 'not_implemented',
  route,
  message: 'Architecture scaffold only. Wire this route to the matching/indexer/proof services next.',
});

const server = http.createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

  if (request.method === 'GET' && url.pathname === '/v1/health') {
    json(response, 200, {
      ok: true,
      service: '@qdex/api',
      mode: 'scaffold',
      custody: 'non-custodial',
      settlement: 'on-chain',
    });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/v1/markets') {
    json(response, 200, {
      markets: [
        {
          id: 'QI-QUAI',
          base: 'QI',
          quote: 'QUAI',
          status: 'planned',
          zone: 'single-zone-mvp',
        },
      ],
    });
    return;
  }

  notImplemented(response, `${request.method} ${url.pathname}`);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`@qdex/api listening on http://127.0.0.1:${PORT}`);
});
