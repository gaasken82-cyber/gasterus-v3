import { randomUUID } from 'node:crypto';
import { query, closeDatabase } from '../src/db.js';
import { apiKeyHash, randomToken } from '../src/security.js';
const name=String(process.env.API_KEY_NAME||'result-ingestion').slice(0,80);const scopes=String(process.env.API_KEY_SCOPES||'bets:read,results:write').split(',').map(x=>x.trim()).filter(Boolean);const raw=`gasterus_live_${randomToken(36)}`;await query(`INSERT INTO api_keys(id,name,key_prefix,key_hash,scopes) VALUES($1,$2,$3,$4,$5::jsonb)`,[randomUUID(),name,raw.slice(0,18),apiKeyHash(raw),JSON.stringify(scopes)]);console.log('API key created. It will not be shown again.');console.log(raw);await closeDatabase();
