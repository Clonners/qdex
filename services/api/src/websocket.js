import { createHash } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';

import { createStreamSnapshot } from './streams.js';

export const STREAM_WEBSOCKET_PATH = '/v1/ws';

// ---------- Legacy raw-socket helpers (kept for backward compat) ----------

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

/**
 * Legacy raw-socket WebSocket upgrade handler.
 * Handles any upgrade requests that ws does not claim (non-/v1/ws paths).
 */
export const attachStreamWebSocketUpgrade = (server, { state }) => {
  server.on('upgrade', (request, socket) => {
    // If ws already handled this (socket destroyed), skip
    if (socket.destroyed) return;

    try {
      const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
      if (url.pathname === STREAM_WEBSOCKET_PATH) {
        // ws library should handle this; reject if it didn't
        socket.destroy();
        return;
      }

      rejectUpgrade(socket, 404, {
        error: 'websocket_route_not_found',
        message: `Use ${STREAM_WEBSOCKET_PATH}?channel=<stream-channel> for local MVP stream snapshots.`,
      });
    } catch {
      if (!socket.destroyed) {
        socket.destroy();
      }
    }
  });

  return server;
};

// ---------- ws-based WebSocket server ----------

/**
 * Attach a ws-powered WebSocket server to the given HTTP server.
 * Listens on /v1/ws and supports:
 *   - Query-string channel subscriptions: ?channel=market.WQUAI-WQI.depth
 *   - JSON subscribe/unsubscribe messages (multi-channel)
 *   - Polls mock-dex for data updates every 2s and pushes changes
 */
export const attachWebSocketServer = (httpServer, { state }) => {
  const wss = new WebSocketServer({
    noServer: true,
  });

  // Map of ws connection -> Set of channel names
  const connections = new WeakMap();

  // Map of channel -> Set of ws connections
  const channelSubscribers = new Map();

  // Track previous polled state to detect changes
  let previousSnapshots = new Map();

  /**
   * Handle WebSocket upgrade request from the HTTP server.
   */
  httpServer.on('upgrade', (request, socket, head) => {
    try {
      const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

      if (url.pathname !== STREAM_WEBSOCKET_PATH) {
        // Let the raw handler deal with non-ws paths
        return;
      }

      const channel = url.searchParams.get('channel');

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request, channel);
      });
    } catch {
      if (!socket.destroyed) {
        socket.destroy();
      }
    }
  });

  /**
   * Subscribe a client to a channel and send initial snapshot.
   */
  const subscribeClient = (ws, channel) => {
    const clientChannels = connections.get(ws) ?? new Set();
    clientChannels.add(channel);
    connections.set(ws, clientChannels);

    if (!channelSubscribers.has(channel)) {
      channelSubscribers.set(channel, new Set());
    }
    channelSubscribers.get(channel).add(ws);

    // Send initial snapshot
    const message = snapshotMessage({ channel, state });
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  };

  /**
   * Unsubscribe a client from a channel.
   */
  const unsubscribeClient = (ws, channel) => {
    const clientChannels = connections.get(ws);
    if (clientChannels) {
      clientChannels.delete(channel);
    }
    const subs = channelSubscribers.get(channel);
    if (subs) {
      subs.delete(ws);
    }
  };

  /**
   * Send a JSON message to a specific client.
   */
  const sendToClient = (ws, message) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  };

  /**
   * Broadcast a snapshot to all subscribers of a channel.
   */
  const broadcastToChannel = (channel, message) => {
    const subs = channelSubscribers.get(channel);
    if (!subs) return;
    for (const ws of subs) {
      sendToClient(ws, message);
    }
  };

  /**
   * Compute a simple hash of state data to detect changes.
   */
  const dataHash = (data) => {
    if (!data) return 'empty';
    return createHash('md5').update(JSON.stringify(data)).digest('hex');
  };

  /**
   * Get stream snapshot data for a channel.
   */
  const getSnapshotForChannel = (channel) => {
    try {
      const snap = createStreamSnapshot({ channel, state });
      if (snap.error !== undefined) return null;
      return snap;
    } catch {
      return null;
    }
  };

  /**
   * Poll mock-dex for data changes and broadcast to subscribed clients.
   */
  const pollForChanges = () => {
    const channelsToPoll = [
      'market.WQUAI-WQI.depth',
      'market.WQUAI-WQI.trades',
      'global.tickers',
      'balances',
    ];

    for (const channel of channelsToPoll) {
      const subs = channelSubscribers.get(channel);
      if (!subs || subs.size === 0) continue;

      const currentSnapshot = getSnapshotForChannel(channel);
      const currentHash = dataHash(currentSnapshot?.data);
      const prevHash = previousSnapshots.get(channel);

      if (currentHash !== prevHash && currentSnapshot) {
        previousSnapshots.set(channel, currentHash);

        const message = snapshotMessage({
          channel,
          state,
          streamEvent: {
            reason: 'polling_update',
            marketId: 'WQUAI-WQI',
            channels: [channel],
          },
        });

        broadcastToChannel(channel, message);
      }
    }
  };

  /**
   * Handle new WebSocket connection.
   */
  wss.on('connection', (ws, request, initialChannel) => {
    const clientChannels = new Set();
    connections.set(ws, clientChannels);

    // Handle initial channel from query string
    if (initialChannel) {
      subscribeClient(ws, initialChannel);
    }

    // Handle incoming JSON messages
    ws.on('message', (data) => {
      let message;
      try {
        message = JSON.parse(data.toString());
      } catch {
        sendToClient(ws, {
          type: 'error',
          transport: 'websocket',
          error: 'invalid_json',
          message: 'Expected valid JSON message.',
        });
        return;
      }

      if (message.type === 'subscribe' && message.channel) {
        if (message.channels && Array.isArray(message.channels)) {
          for (const ch of message.channels) {
            subscribeClient(ws, ch);
          }
        } else {
          subscribeClient(ws, message.channel);
        }
      } else if (message.type === 'unsubscribe' && message.channel) {
        if (message.channels && Array.isArray(message.channels)) {
          for (const ch of message.channels) {
            unsubscribeClient(ws, ch);
          }
        } else {
          unsubscribeClient(ws, message.channel);
        }
      } else {
        sendToClient(ws, {
          type: 'error',
          transport: 'websocket',
          error: 'unknown_message_type',
          message: `Unsupported message type: "${message.type}". Use "subscribe" or "unsubscribe".`,
        });
      }
    });

    // Handle client disconnect
    ws.on('close', () => {
      const channels = connections.get(ws);
      if (channels) {
        for (const channel of channels) {
          const subs = channelSubscribers.get(channel);
          if (subs) {
            subs.delete(ws);
          }
        }
      }
      connections.delete(ws);
    });

    ws.on('error', () => {
      // Cleanup on error
      const channels = connections.get(ws);
      if (channels) {
        for (const channel of channels) {
          const subs = channelSubscribers.get(channel);
          if (subs) {
            subs.delete(ws);
          }
        }
      }
      connections.delete(ws);
    });
  });

  // Wire up event-driven stream updates from mock-dex (subscribeStreamUpdates)
  let unsubscribeStream = () => {};
  if (typeof state.subscribeStreamUpdates === 'function') {
    unsubscribeStream = state.subscribeStreamUpdates((streamEvent) => {
      const channels = streamEvent.channels || [];
      for (const channel of channels) {
        const subs = channelSubscribers.get(channel);
        if (!subs || subs.size === 0) continue;

        const snap = getSnapshotForChannel(channel);
        if (!snap) continue;

        const currentHash = dataHash(snap.data);
        previousSnapshots.set(channel, currentHash);

        const message = snapshotMessage({
          channel,
          state,
          streamEvent,
        });

        broadcastToChannel(channel, message);
      }
    });
  }

  // Start polling for data updates every 2 seconds
  const pollInterval = setInterval(pollForChanges, 2000);
  pollInterval.unref(); // Don't keep process alive

  // Return cleanup function
  return {
    wss,
    cleanup: () => {
      clearInterval(pollInterval);
      unsubscribeStream();
      wss.close();
    },
  };
};
