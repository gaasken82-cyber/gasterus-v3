import { compareTotoProduction } from './toto-production-acceptance.js';

export async function runAcceptance({ proof, baseUrl, fetchImpl = fetch }) {
  const response = await fetchImpl(`${baseUrl}/member-api/markets?limit=100`);
  if (!response?.ok) return { status: 'FAIL', reason: `HTTP_${response?.status || 0}` };
  const payload = await response.json();
  return compareTotoProduction({
    proof,
    memberItems: payload.data,
    memberTotal: payload.meta?.total,
    expectedVisibleMarkets: proof?.rows?.length
  });
}
