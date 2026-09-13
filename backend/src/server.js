import { createApp, initialize, startMarketCloseScheduler } from './app.js';
import { config } from './config.js';
import { closeDatabase } from './db.js';
import { closeRedis } from './redis.js';
import { logger } from './logger.js';
import { startMemoryGuard } from './memory-guard.js';

await initialize();
startMemoryGuard({ label: 'core' });
const stopMarketCloseScheduler=startMarketCloseScheduler();
const server=createApp();
server.keepAliveTimeout=65000;server.headersTimeout=66000;server.requestTimeout=30000;
server.listen(config.port,config.host,()=>logger.info('Core listening',{host:config.host,port:config.port,database:'postgresql',cache:'redis'}));
async function shutdown(signal){logger.info('Shutdown requested',{signal});stopMarketCloseScheduler&&stopMarketCloseScheduler();server.close(async()=>{await Promise.allSettled([closeDatabase(),closeRedis()]);process.exit(0)});setTimeout(()=>process.exit(1),10000).unref();}
process.on('SIGTERM',()=>shutdown('SIGTERM'));process.on('SIGINT',()=>shutdown('SIGINT'));
