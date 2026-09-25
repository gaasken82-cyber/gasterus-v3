export function isWorkerHeartbeatFresh(rawHeartbeat, {
  now = Date.now(),
  staleAfterSeconds = 180
} = {}) {
  const timestamp = Date.parse(String(rawHeartbeat || ''));
  if (!Number.isFinite(timestamp)) return false;
  const ageMs = now - timestamp;
  if (ageMs < 0) return false;
  const limit = Number(staleAfterSeconds);
  return Number.isFinite(limit) && limit > 0 && ageMs <= limit * 1000;
}

export function workerHealthStatus(rawHeartbeat, options = {}) {
  const fresh = isWorkerHeartbeatFresh(rawHeartbeat, options);
  return { status: fresh ? 'ok' : 'degraded', healthy: fresh };
}
