import { randomUUID } from 'node:crypto';
import { query } from './db.js';
const clean=(v,max=500)=>String(v??'').trim().slice(0,max);
const nullable=(v,max=500)=>clean(v,max)||null;
export async function recordSecurityEvent({memberId=null,channel='SYSTEM',eventType,severity='INFO',usernameHint=null,ip='',userAgent='',details={}}){
  try{await query(`INSERT INTO security_events(id,member_id,channel,event_type,severity,username_hint,ip_address,user_agent,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,[randomUUID(),memberId,clean(channel,20).toUpperCase(),clean(eventType,80),clean(severity,20).toUpperCase(),nullable(usernameHint,80),nullable(ip,100),nullable(userAgent,300),JSON.stringify(details||{})]);}catch{}
}
