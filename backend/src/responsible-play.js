import { query } from './db.js';
import { assert } from './errors.js';

async function activatePending(memberId,db){
  await db.query(`INSERT INTO responsible_play_profiles(member_id) VALUES($1) ON CONFLICT(member_id) DO NOTHING`,[memberId]);
  const r=(await db.query(`SELECT * FROM responsible_play_profiles WHERE member_id=$1`,[memberId])).rows[0];
  if(r?.pending_limits&&r.pending_effective_at&&new Date(r.pending_effective_at)<=new Date()){
    const p=r.pending_limits||{};
    await db.query(`UPDATE responsible_play_profiles SET deposit_daily_limit=COALESCE($1,deposit_daily_limit),deposit_weekly_limit=COALESCE($2,deposit_weekly_limit),deposit_monthly_limit=COALESCE($3,deposit_monthly_limit),spend_daily_limit=COALESCE($4,spend_daily_limit),session_minutes_limit=COALESCE($5,session_minutes_limit),pending_limits=NULL,pending_effective_at=NULL,updated_at=now() WHERE member_id=$6`,[p.depositDailyLimit??null,p.depositWeeklyLimit??null,p.depositMonthlyLimit??null,p.spendDailyLimit??null,p.sessionMinutesLimit??null,memberId]);
    return (await db.query(`SELECT * FROM responsible_play_profiles WHERE member_id=$1`,[memberId])).rows[0];
  }
  return r;
}

export async function enforceResponsiblePlay(memberId,{kind,amount,client=null,sessionCreatedAt=null}={}){
  const db=client||{query};const profile=await activatePending(memberId,db);const now=new Date();
  assert(!profile.self_excluded_until||new Date(profile.self_excluded_until)<=now,403,'Akun sedang dalam periode self-exclusion.','SELF_EXCLUDED');
  assert(!profile.cooling_off_until||new Date(profile.cooling_off_until)<=now,403,'Akun sedang dalam periode cooling-off.','COOLING_OFF_ACTIVE');
  if(profile.session_minutes_limit&&sessionCreatedAt){const started=new Date(sessionCreatedAt);if(Number.isFinite(started.getTime()))assert((Date.now()-started.getTime())/60000<=Number(profile.session_minutes_limit),403,'Batas waktu sesi telah tercapai. Silakan keluar dan beristirahat sebelum melanjutkan.','RESPONSIBLE_SESSION_LIMIT');}
  if(kind==='DEPOSIT'){
    const totals=(await db.query(`SELECT COALESCE(SUM(amount) FILTER(WHERE created_at>=date_trunc('day',now())),0)::bigint d,COALESCE(SUM(amount) FILTER(WHERE created_at>=date_trunc('week',now())),0)::bigint w,COALESCE(SUM(amount) FILTER(WHERE created_at>=date_trunc('month',now())),0)::bigint m FROM wallet_requests WHERE member_id=$1 AND request_type='DEPOSIT' AND status<>'REJECTED'`,[memberId])).rows[0];
    if(profile.deposit_daily_limit!==null)assert(Number(totals.d)+amount<=Number(profile.deposit_daily_limit),409,'Batas deposit harian telah tercapai.','RESPONSIBLE_DEPOSIT_DAILY_LIMIT');
    if(profile.deposit_weekly_limit!==null)assert(Number(totals.w)+amount<=Number(profile.deposit_weekly_limit),409,'Batas deposit mingguan telah tercapai.','RESPONSIBLE_DEPOSIT_WEEKLY_LIMIT');
    if(profile.deposit_monthly_limit!==null)assert(Number(totals.m)+amount<=Number(profile.deposit_monthly_limit),409,'Batas deposit bulanan telah tercapai.','RESPONSIBLE_DEPOSIT_MONTHLY_LIMIT');
  }
  if(kind==='BET'&&profile.spend_daily_limit!==null){
    const totals=(await db.query(`SELECT (COALESCE((SELECT SUM(total_stake) FROM bet_orders WHERE member_id=$1 AND status NOT IN('DRAFT','CANCELLED','VOID') AND created_at>=date_trunc('day',now())),0)+COALESCE((SELECT SUM(total_stake) FROM sportsbook_tickets WHERE member_id=$1 AND status<>'VOID' AND created_at>=date_trunc('day',now())),0))::bigint total`,[memberId])).rows[0];
    assert(Number(totals.total||0)+amount<=Number(profile.spend_daily_limit),409,'Batas pengeluaran harian telah tercapai.','RESPONSIBLE_SPEND_DAILY_LIMIT');
  }
  return profile;
}
