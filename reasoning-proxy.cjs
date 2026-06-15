const http = require('http');

const PORT = parseInt(process.argv[2]) || 8789;
const UPSTREAM = process.argv[3] || 'http://100.77.187.100:8080';
const UPSTREAM_URL = new URL(UPSTREAM);

const server = http.createServer((req, res) => {
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  const chunks = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    
    const options = {
      hostname: UPSTREAM_URL.hostname,
      port: UPSTREAM_URL.port,
      path: UPSTREAM_URL.pathname === '/' ? req.url : UPSTREAM_URL.pathname + req.url,
      method: req.method,
      headers: {
        ...req.headers,
        host: UPSTREAM_URL.host,
        'content-length': body.length,
      },
    };
    
    const upstreamReq = http.request(options, (upstreamRes) => {
      const upstreamChunks = [];
      upstreamRes.on('data', chunk => upstreamChunks.push(chunk));
      upstreamRes.on('end', () => {
        try {
          const parsed = JSON.parse(Buffer.concat(upstreamChunks));
          
          if (parsed.choices) {
            for (const choice of parsed.choices) {
              if (choice.message) {
                if (choice.message.reasoning_content) {
                  choice.message.content = (choice.message.reasoning_content || '') + (choice.message.content || '');
                  delete choice.message.reasoning_content;
                }
              }
            }
          }
          
          const transformed = JSON.stringify(parsed);
          res.writeHead(upstreamRes.statusCode, {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(transformed),
          });
          res.end(transformed);
        } catch (err) {
          const response = Buffer.concat(upstreamChunks);
          res.writeHead(upstreamRes.statusCode, {
            'Content-Type': 'application/json',
            'Content-Length': response.length,
          });
          res.end(response);
        }
      });
    });
    
    upstreamReq.on('error', (err) => {
      res.writeHead(502);
      res.end('Bad gateway: ' + err.message);
    });
    
    upstreamReq.end(body);
  });
});

server.listen(PORT, () => {
  console.error('Proxy running on port ' + PORT + ' -> ' + UPSTREAM);
});
