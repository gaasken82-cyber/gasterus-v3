import { connectRedis, closeRedis } from '../src/redis.js';
import { sportsbookSettlementSnapshot, sportsbookSourceStatus } from '../src/sportsbook-feed.js';

try {
  await connectRedis();
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const snapshot = await sportsbookSettlementSnapshot();
      const status = sportsbookSourceStatus();
      if (!snapshot.events?.length) throw new Error('Sportsbook provider returned zero events');
      if (!status.configured || !status.healthy) throw new Error(`Sportsbook provider unhealthy: ${JSON.stringify(status)}`);
      console.log(JSON.stringify({ status: 'passed', events: snapshot.events.length, source: status }, null, 2));
      process.exitCode = 0;
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  if (lastError) throw lastError;
} finally {
  await closeRedis().catch(() => {});
}
