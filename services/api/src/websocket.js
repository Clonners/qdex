import { createHash } from 'node:crypto';

import { createStreamSnapshot } from './streams.js';

export const STREAM_WEBSOCKET_PATH = '/v1/ws';

const WEBSOCKET_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_CONTROL_BODY_BYTES = 1_024;

const statusText = (statusCode) => {
  if (statusCode === 400) return 'Bad Request';
  if (statusCode === 404) return 'Not Found';
  if (statusCode === 500) return 'Internal Server Error';
  return 'Error';
};

const rejectUpgrade = (socket, statusCode, body) => {
  const payload = JSON.stringify(body).slice(0, MAX_CONTROL_BODY_BYTES);
  socket.write([
    `HTTP/1.1 ${statusCode} ${statusText(statusCode)}`,
    'Connection: close',
    'Content-Type: application/json',
    `Content-Length: ${Buffer.byteLength(payload)}`,
    '',
    payload,
  ].join('\r\n'));
  socket.destroy();
};

const websocketAccept = (key) => createHash('sha1')
  .update(`${key}${WEBSOCKET_GUID}`)
  .digest('base64');

export const encodeTextFrame = (text) => {
  const payload = Buffer.from(text, 'utf8');

  if (payload.length <= 125) {
    return Buffer.concat([Buffer.from([0x81, payload.length]), payload]);
  }

  if (payload.length <= 65_535) {
    const header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(payload.length, 2);
    return Buffer.concat([header, payload]);
  }

  const header = Buffer.alloc(10);
  header[0] = 0x81;
  header[1] = 127;
  header.writeBigUInt64BE(BigInt(payload.length), 2);
  return Buffer.concat([header, payload]);
};

const snapshotMessage = ({ channel, state, streamEvent }) => {
  const snapshot = createStreamSnapshot({ channel, state });

  if (snapshot.error !== undefined) {
    return {
      type: 'error',
      transport: 'websocket',
      ...snapshot,
      ...(streamEvent === undefined ? {} : { streamEvent }),
    };
  }

  return {
    type: 'snapshot',
    transport: 'websocket',
    snapshot,
    ...(streamEvent === undefined ? {} : { streamEvent }),
  };
};

export const attachStreamWebSocketUpgrade = (server, { state }) => {
  server.on('upgrade', (request, socket) => {
    socket.on('error', () => {});

    try {
      const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
      if (url.pathname !== STREAM_WEBSOCKET_PATH) {
        rejectUpgrade(socket, 404, {
          error: 'websocket_route_not_found',
          message: `Use ${STREAM_WEBSOCKET_PATH}?channel=<stream-channel> for local MVP stream snapshots.`,
        });
        return;
      }

      const channel = url.searchParams.get('channel');
      if (channel === null || channel.length === 0) {
        rejectUpgrade(socket, 400, {
          error: 'missing_stream_channel',
          message: 'WebSocket stream transport requires a channel query parameter.',
        });
        return;
      }

      const key = request.headers['sec-websocket-key'];
      if (typeof key !== 'string' || request.headers['sec-websocket-version'] !== '13') {
        rejectUpgrade(socket, 400, {
          error: 'invalid_websocket_upgrade',
          message: 'Expected an RFC 6455 WebSocket upgrade with Sec-WebSocket-Version 13.',
        });
        return;
      }

      socket.write([
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${websocketAccept(key)}`,
        '',
        '',
      ].join('\r\n'));

      socket.write(encodeTextFrame(JSON.stringify(snapshotMessage({ channel, state }))));

      let unsubscribe = () => {};
      const cleanup = () => {
        unsubscribe();
        unsubscribe = () => {};
      };

      if (typeof state.subscribeStreamUpdates === 'function') {
        unsubscribe = state.subscribeStreamUpdates((streamEvent) => {
          if (!streamEvent.channels.includes(channel) || socket.destroyed) {
            return;
          }

          try {
            socket.write(encodeTextFrame(JSON.stringify(snapshotMessage({ channel, state, streamEvent }))));
          } catch {
            cleanup();
          }
        });
      }

      socket.on('close', cleanup);
      socket.on('end', cleanup);
      socket.on('error', cleanup);

      socket.on('data', (chunk) => {
        if (chunk.length === 0) {
          return;
        }

        const opcode = chunk[0] & 0x0f;
        if (opcode === 0x08) {
          cleanup();
          socket.write(Buffer.from([0x88, 0x00]));
          socket.end();
        }
      });
    } catch (error) {
      if (!socket.destroyed) {
        rejectUpgrade(socket, 500, {
          error: 'websocket_internal_error',
          message: error instanceof Error ? error.message : 'Unknown WebSocket transport error.',
        });
      }
    }
  });

  return server;
};
