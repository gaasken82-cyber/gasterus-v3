export function bettingWindowReady(config, nowMs = Date.now()){
  const closeMs=config?.closeAt?new Date(config.closeAt).getTime():NaN;
  // Betting availability is schedule driven. Result authority is only required for settlement.
  // A market must remain playable until closeAt while the scheduled period is open.
  return Boolean(config?.bettingStatus==='OPEN'&&config?.period&&Number.isFinite(closeMs)&&closeMs>nowMs);
}
