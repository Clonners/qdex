export const jsonResult = (statusCode, body) => ({ statusCode, body });

export const sendJson = (response, { statusCode, body }) => {
  const payload = JSON.stringify(body, null, 2);

  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(`${payload}\n`);
};

export const notImplemented = (context, next) => jsonResult(501, {
  error: 'not_implemented',
  route: `${context.method} ${context.pathname}`,
  message: 'Route exists in the MVP API surface, but the backing engine/projection is not wired yet.',
  next,
});

export const notFound = (context) => jsonResult(404, {
  error: 'not_found',
  route: `${context.method} ${context.pathname}`,
});
