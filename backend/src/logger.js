const REDACT = /password|secret|token|cookie|authorization|api.?key|account_number/i;
function clean(value, depth = 0) {
  if (depth > 6) return '[depth-limit]';
  if (Array.isArray(value)) return value.map(v => clean(v, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k,v]) => [k, REDACT.test(k) ? '[redacted]' : clean(v, depth + 1)]));
  }
  return value;
}
function write(level, message, context = {}) {
  process.stdout.write(`${JSON.stringify({ts:new Date().toISOString(),level,message,...clean(context)})}\n`);
}
export const logger = {
  info: (message, context) => write('info', message, context),
  warn: (message, context) => write('warn', message, context),
  error: (message, context) => write('error', message, context)
};
