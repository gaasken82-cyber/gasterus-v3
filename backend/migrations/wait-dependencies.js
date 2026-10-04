import pg from 'pg';
import { createClient } from 'redis';
const { Pool } = pg;
const databaseUrl=String(process.env.DATABASE_URL||process.env.POSTGRES_URL||process.env.DATABASE_PRIVATE_URL||process.env.DATABASE_PUBLIC_URL||'').trim(),redisUrl=String(process.env.REDIS_URL||process.env.REDIS_PRIVATE_URL||process.env.REDIS_PUBLIC_URL||'').trim();
if(!databaseUrl)throw new Error('DATABASE_URL is required');if(!redisUrl)throw new Error('REDIS_URL is required');
const sslEnabled=!['0','false','no','off','disabled'].includes(String(process.env.DATABASE_SSL||'false').toLowerCase());
const pool=new Pool({connectionString:databaseUrl,max:1,connectionTimeoutMillis:4000,ssl:sslEnabled?{rejectUnauthorized:false}:undefined,application_name:'gasterus-startup-check'});
const redis=createClient({url:redisUrl,socket:{connectTimeout:4000,reconnectStrategy:false}});
try{await pool.query('SELECT 1');await redis.connect();if(await redis.ping()!=='PONG')throw new Error('Redis did not return PONG');console.log(JSON.stringify({status:'ready',postgres:true,redis:true}));}
finally{await Promise.allSettled([pool.end(),redis.isOpen?redis.quit():Promise.resolve()]);}
