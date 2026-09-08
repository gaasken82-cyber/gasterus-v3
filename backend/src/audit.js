import { randomUUID, createHmac } from 'node:crypto';
import { query } from './db.js';
import { config } from './config.js';
export async function audit({actorId=null,actorRole=null,action,targetType,targetId,details={},ip='',client=null}) {
  const ipHash = ip ? createHmac('sha256',config.sessionHmacKey).update(ip).digest('hex') : null;
  const db=client||{query};
  await db.query(`INSERT INTO audit_logs(id,actor_id,actor_role,action,target_type,target_id,details,ip_hash)
    VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,[randomUUID(),actorId,actorRole,action,targetType,String(targetId),JSON.stringify(details),ipHash]);
}
