import { config } from './config.js';
import { AppError } from './errors.js';
import { logger } from './logger.js';
import { sportsbookSnapshot } from './sportsbook-feed.js';

const clients = new Set();
let pollTimer = null;
let heartbeatTimer = null;
let inFlight = null;
let lastStateToken = '';
let lastSnapshot = null;
const metrics = {
  totalConnections: 0,
  broadcasts: 0,
  broadcastBytes: 0,
  refreshErrors: 0,
  lastBroadcastAt: null,
  lastRefreshAt: null,
  lastErrorAt: null,
  lastErrorCode: null,
  slowClientsDropped: 0
};

function sendEvent(response, event, data, id = '') {
  if (response.destroyed || response.writableEnded) return 0;
  if (Number(response.writableLength || 0) > 1024 * 1024) {
    metrics.slowClientsDropped += 1;
    response.destroy();
    return 0;
  }
  const payload = `${id ? `id: ${String(id).replace(/[\r\n]/g, '')}\n` : ''}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  response.write(payload);
  return Buffer.byteLength(payload);
}
function removeClient(client) {
  clients.delete(client);
  if (!clients.size) stopTimers();
}
function stateToken(snapshot) {
  const source = snapshot?.source || {};
  return [source.feedRevision || '', source.status || '', source.mode || '', snapshot?.stale ? 'stale' : 'fresh', Number(source.pricedMarkets || 0), Number(source.bettableMarkets || 0)].join('|');
}
function broadcastSnapshot(snapshot) {
  const token = stateToken(snapshot);
  if (!token || token === lastStateToken) return;
  lastStateToken = token;
  lastSnapshot = snapshot;
  const id = snapshot?.source?.feedRevision || String(Date.now());
  let bytes = 0;
  for (const client of [...clients]) {
    try { bytes += sendEvent(client.response, 'snapshot', snapshot, id); }
    catch { removeClient(client); }
  }
  metrics.broadcasts += 1;
  metrics.broadcastBytes += bytes;
  metrics.lastBroadcastAt = new Date().toISOString();
}
async function refreshOnce() {
  if (inFlight || !clients.size) return inFlight;
  inFlight = (async () => {
    try {
      const snapshot = await sportsbookSnapshot();
      metrics.lastRefreshAt = new Date().toISOString();
      broadcastSnapshot(snapshot);
      return snapshot;
    } catch (error) {
      metrics.refreshErrors += 1;
      metrics.lastErrorAt = new Date().toISOString();
      metrics.lastErrorCode = error?.code || 'SPORTSBOOK_REALTIME_REFRESH_ERROR';
      logger.warn('Sportsbook realtime refresh unavailable', { code: error?.code, error: error?.message });
      for (const client of [...clients]) {
        try { sendEvent(client.response, 'degraded', { code: error?.code || 'SPORTSBOOK_REALTIME_REFRESH_ERROR', at: metrics.lastErrorAt }); }
        catch { removeClient(client); }
      }
      return null;
    } finally { inFlight = null; }
  })();
  return inFlight;
}
function stopTimers() {
  if (pollTimer) clearInterval(pollTimer);
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  pollTimer = null;
  heartbeatTimer = null;
}
function ensureTimers() {
  if (!config.sportsbookRealtimeEnabled) return;
  if (!pollTimer) pollTimer = setInterval(() => { refreshOnce().catch(() => {}); }, config.sportsbookRealtimePollMs).unref();
  if (!heartbeatTimer) heartbeatTimer = setInterval(() => {
    const now = new Date().toISOString();
    for (const client of [...clients]) {
      try {
        if (!client.response.destroyed && !client.response.writableEnded) client.response.write(`: heartbeat ${now}\n\n`);
        else removeClient(client);
      } catch { removeClient(client); }
    }
  }, config.sportsbookRealtimeHeartbeatSeconds * 1000).unref();
}

export function openSportsbookRealtimeStream(request, response) {
  if (!config.sportsbookRealtimeEnabled) throw new AppError(503, 'Realtime Sportsbook sedang dinonaktifkan.', 'SPORTSBOOK_REALTIME_DISABLED');
  if (clients.size >= config.sportsbookRealtimeMaxClients) throw new AppError(503, 'Kapasitas koneksi realtime sedang penuh.', 'SPORTSBOOK_REALTIME_CAPACITY');
  response.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store, no-transform',
    'connection': 'keep-alive',
    'x-accel-buffering': 'no'
  });
  response.flushHeaders?.();
  response.write('retry: 3000\n\n');
  const client = { response, connectedAt: Date.now() };
  clients.add(client);
  metrics.totalConnections += 1;
  sendEvent(response, 'ready', { connected: true, heartbeatSeconds: config.sportsbookRealtimeHeartbeatSeconds, pollMs: config.sportsbookRealtimePollMs, at: new Date().toISOString() });
  if (lastSnapshot) sendEvent(response, 'snapshot', lastSnapshot, lastSnapshot?.source?.feedRevision || String(Date.now()));
  ensureTimers();
  refreshOnce().catch(() => {});
  const close = () => removeClient(client);
  request.once('close', close);
  response.once('close', close);
  response.once('error', close);
}

export function sportsbookRealtimeStatus() {
  return {
    enabled: Boolean(config.sportsbookRealtimeEnabled),
    connectedClients: clients.size,
    maxClients: config.sportsbookRealtimeMaxClients,
    pollMs: config.sportsbookRealtimePollMs,
    heartbeatSeconds: config.sportsbookRealtimeHeartbeatSeconds,
    lastFeedRevision: lastSnapshot?.source?.feedRevision || null,
    ...metrics
  };
}

export const __sportsbookRealtime = { stateToken };
