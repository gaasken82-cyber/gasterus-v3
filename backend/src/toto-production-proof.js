import { createHash } from 'node:crypto';

const parseJson = value => {
  try { return JSON.parse(value); } catch { return null; }
};

function parseKeyValues(line) {
  const out = {};
  for (const match of String(line).matchAll(/(\w+)=(?:"([^"]*)"|(\[[^\]]*\])|(\d+))/g)) {
    const value = match[2] ?? match[3] ?? match[4];
    out[match[1]] = value?.startsWith('[') ? parseJson(value) : (/^\d+$/.test(value) ? Number(value) : value);
  }
  return out;
}

export function parseRailwayTotoLine(line) {
  const json = parseJson(line);
  if (json) return json;
  const prefix = String(line).match(/TOTO production result authority snapshot/);
  if (!prefix) return null;
  const values = parseKeyValues(line);
  const rows = String(line).match(/rows=(\[[\s\S]*)$/)?.[1];
  return { ...values, ...(rows ? { rows: parseJson(rows) } : {}), message: 'TOTO production result authority snapshot' };
}

export function isTotoProductionProof(proof, now = new Date(), deploymentId) {
  const proofTime = proof?.ts ? new Date(proof.ts).getTime() : NaN;
  return Boolean(proof?.deploymentId === deploymentId &&
    proof?.snapshotRevision &&
    Array.isArray(proof.rows) && proof.rows.length === 85 &&
    Number.isFinite(proofTime) && proofTime >= now.getTime() &&
    proofTime - now.getTime() <= 1000);
}

export function selectRailwayTotoProof(log, since, deploymentId) {
  return String(log).split(/\r?\n/).map(parseRailwayTotoLine)
    .filter(row => row?.deploymentId === deploymentId && row?.snapshotRevision &&
      Array.isArray(row.rows) && row.rows.length === 85 && row.ts && new Date(row.ts) >= since)
    .sort((a, b) => new Date(a.ts) - new Date(b.ts)).at(-1) || null;
}

export function parseRailwayTotoSourceLine(line) {
  const values = parseKeyValues(line);
  const diagnostics = String(line).match(/sourceDiagnostics=(\[[\s\S]*)$/)?.[1];
  return { ...values, ...(diagnostics ? { sourceDiagnostics: parseJson(diagnostics) } : {}), message: 'TOTO collector cycle completed' };
}

export function isTotoSourceHealthProof(proof, now = new Date(), deploymentId) {
  const proofTime = proof?.ts ? new Date(proof.ts).getTime() : NaN;
  return Boolean(proof?.deploymentId === deploymentId && Array.isArray(proof.sourceDiagnostics) &&
    proof.sourceDiagnostics.length >= 6 && Number.isFinite(proofTime) &&
    proofTime >= now.getTime() && proofTime - now.getTime() <= 1000);
}

export function selectRailwayTotoSourceHealthProof(log, since, deploymentId) {
  return String(log).split(/\r?\n/).map(parseRailwayTotoSourceLine)
    .filter(row => row?.deploymentId === deploymentId && Array.isArray(row.sourceDiagnostics) &&
      row.sourceDiagnostics.length >= 6 && row.ts && new Date(row.ts) >= since)
    .sort((a, b) => new Date(a.ts) - new Date(b.ts)).at(-1) || null;
}
