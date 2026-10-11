const managedCaches = new Set();

export function setBoundedCacheEntry(cache, key, value, {
  fetchedAt = Date.now(),
  maxEntryBytes,
  maxTotalBytes
} = {}) {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new Error('Cache value is not JSON-serializable');
  const sizeBytes = Buffer.byteLength(serialized, 'utf8');
  if (sizeBytes > maxEntryBytes) {
    throw new Error(`Provider response exceeds cache entry limit (${sizeBytes} > ${maxEntryBytes} bytes)`);
  }
  if (sizeBytes > maxTotalBytes) {
    throw new Error(`Provider response exceeds total cache limit (${sizeBytes} > ${maxTotalBytes} bytes)`);
  }

  let totalBytes = 0;
  const oldestFirst = [];
  managedCaches.add(cache);
  for (const managedCache of managedCaches) {
    for (const [entryKey, entry] of managedCache) {
      if (managedCache === cache && entryKey === key) continue;
      const entrySize = Number(entry?.sizeBytes) || 0;
      totalBytes += entrySize;
      oldestFirst.push([managedCache, entryKey, Number(entry?.fetchedAt) || 0, entrySize]);
    }
  }
  oldestFirst.sort((a, b) => a[2] - b[2]);

  while (totalBytes + sizeBytes > maxTotalBytes && oldestFirst.length) {
    const [oldestCache, oldestKey, , entrySize] = oldestFirst.shift();
    oldestCache.delete(oldestKey);
    totalBytes -= entrySize;
  }
  if (totalBytes + sizeBytes > maxTotalBytes) {
    throw new Error('Provider response cannot fit within total cache limit');
  }

  const entry = { value, fetchedAt, sizeBytes };
  cache.set(key, entry);
  return entry;
}
