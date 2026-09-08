import { createHash } from 'node:crypto';
import { memberMarketVisible, MEMBER_VISIBLE_TOTO_MARKET_COUNT } from './toto-member-catalog.js';

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const unique = values => [...new Set((values || []).map(clean).filter(Boolean))];

export function totoAuthoritySnapshotRevision(snapshot = {}) {
  const canonical = {
    visibleMarkets: Number(snapshot?.visibleMarkets || 0),
    expectedVisibleMarkets: Number(snapshot?.expectedVisibleMarkets || 0),
    rows: Array.isArray(snapshot?.rows) ? snapshot.rows : []
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export function buildTotoAuthoritySnapshot(decisions = []) {
  const rows = decisions
    .filter(memberMarketVisible)
    .map(decision => {
      const verified = decision?.status === 'VERIFIED' && /^\d{3,6}$/.test(String(decision?.result || '')) && Boolean(decision?.drawDate);
      const authority = verified ? (decision.authority === 'OFFICIAL' ? 'OFFICIAL' : 'CONSENSUS') : String(decision?.status || 'UNMAPPED');
      return {
        slug: String(decision?.slug || ''),
        status: String(decision?.status || 'UNMAPPED'),
        result: verified ? String(decision.result) : null,
        drawDate: decision?.drawDate || null,
        drawTime: decision?.drawTime || null,
        authority,
        sources: unique(decision?.sources || decision?.observations?.map(item => item?.sourceName)),
        observationCount: Array.isArray(decision?.observations) ? decision.observations.length : 0
      };
    })
    .sort((a, b) => a.slug.localeCompare(b.slug));
  return {
    visibleMarkets: rows.length,
    expectedVisibleMarkets: MEMBER_VISIBLE_TOTO_MARKET_COUNT,
    trusted: rows.filter(row => row.status === 'VERIFIED').length,
    official: rows.filter(row => row.authority === 'OFFICIAL').length,
    consensus: rows.filter(row => row.authority === 'CONSENSUS').length,
    safeEmpty: rows.filter(row => row.status !== 'VERIFIED').length,
    rows
  };
}

export function compareTotoProduction({ proof, memberItems, memberTotal = null, expectedVisibleMarkets = MEMBER_VISIBLE_TOTO_MARKET_COUNT } = {}) {
  const proofRows = Array.isArray(proof?.rows) ? proof.rows : [];
  const items = Array.isArray(memberItems) ? memberItems : [];
  const bySlug = new Map(items.map(item => [String(item?.slug || ''), item]));
  const rows = [];
  let failures = 0;
  let trustedPublished = 0;
  let safeEmpty = 0;
  for (const expected of proofRows) {
    const actual = bySlug.get(expected.slug) || null;
    let status = 'PASS';
    let reason = 'MATCH';
    const expectedTrusted = expected.status === 'VERIFIED' && Boolean(expected.result);
    const actualResult = actual?.result == null ? null : String(actual.result);
    const actualDrawDate = actual?.drawDate || null;
    if (!actual) {
      status = 'FAIL'; reason = 'MISSING_FROM_MEMBER_API'; failures += 1;
    } else if (expectedTrusted) {
      if (actualResult !== String(expected.result)) {
        status = 'FAIL'; reason = actualResult ? 'RESULT_MISMATCH' : 'VERIFIED_RESULT_NOT_PUBLISHED'; failures += 1;
      } else if (expected.drawDate && actualDrawDate !== expected.drawDate) {
        status = 'FAIL'; reason = 'DRAW_DATE_MISMATCH'; failures += 1;
      } else {
        trustedPublished += 1;
      }
    } else if (actualResult !== null && actualResult !== '') {
      status = 'FAIL'; reason = 'UNTRUSTED_RESULT_PUBLISHED'; failures += 1;
    } else {
      status = 'SAFE_EMPTY'; reason = expected.status || 'UNVERIFIED'; safeEmpty += 1;
    }
    rows.push({
      slug: expected.slug,
      result: actualResult,
      drawDate: actualDrawDate,
      authority: expected.authority,
      source: unique(expected.sources).join(' + ') || '-',
      sourceStatus: expected.status,
      status,
      reason
    });
  }

  const total = Number.isInteger(Number(memberTotal)) ? Number(memberTotal) : items.length;
  if (proofRows.length !== expectedVisibleMarkets) failures += 1;
  if (total !== expectedVisibleMarkets || items.length !== expectedVisibleMarkets) failures += 1;
  if (trustedPublished < 1) failures += 1;
  const unexpected = items.filter(item => !proofRows.some(row => row.slug === item.slug)).map(item => item.slug);
  if (unexpected.length) failures += unexpected.length;

  return {
    status: failures === 0 ? 'PASS' : 'FAIL',
    expectedVisibleMarkets,
    proofRows: proofRows.length,
    memberTotal: total,
    memberItems: items.length,
    trustedPublished,
    safeEmpty,
    failures,
    unexpected,
    rows
  };
}
