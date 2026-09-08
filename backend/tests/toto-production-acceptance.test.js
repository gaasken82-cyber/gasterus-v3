import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTotoAuthoritySnapshot, compareTotoProduction, totoAuthoritySnapshotRevision } from '../src/toto-production-acceptance.js';
import { parseRailwayTotoLine, isTotoProductionProof, selectRailwayTotoProof, parseRailwayTotoSourceLine, isTotoSourceHealthProof, selectRailwayTotoSourceHealthProof } from '../../../scripts/toto-production-proof.mjs';
import { runAcceptance } from '../../../scripts/toto-production-acceptance.mjs';

const visible = Array.from({length:85},(_,i)=>({
  slug:`market-${i+1}`,
  status:i<2?'VERIFIED':'UNMAPPED',
  result:i<2?String(1000+i):null,
  drawDate:i<2?'2026-08-18':null,
  drawTime:null,
  authority:i===0?'OFFICIAL':undefined,
  sources:i===0?['Official Example']:i===1?['Source A','Source B']:[],
  observations:i<2?[{sourceName:'x'}]:[]
}));

test('V12 authority snapshot preserves trusted source class and fail-closed empty states',()=>{
  const snapshot=buildTotoAuthoritySnapshot(visible);
  assert.equal(snapshot.visibleMarkets,85);
  assert.equal(snapshot.trusted,2);
  assert.equal(snapshot.official,1);
  assert.equal(snapshot.consensus,1);
  assert.equal(snapshot.safeEmpty,83);
  assert.equal(snapshot.rows[0].authority,'OFFICIAL');
});

test('V12 authority snapshot revision changes when trusted publication state changes',()=>{
  const first=buildTotoAuthoritySnapshot(visible);
  const changed=structuredClone(visible);
  changed[0].status='SINGLE_SOURCE';
  changed[0].result=null;
  changed[0].authority=undefined;
  const second=buildTotoAuthoritySnapshot(changed);
  const firstRevision=totoAuthoritySnapshotRevision(first);
  const secondRevision=totoAuthoritySnapshotRevision(second);
  assert.match(firstRevision,/^[a-f0-9]{64}$/);
  assert.match(secondRevision,/^[a-f0-9]{64}$/);
  assert.notEqual(firstRevision,secondRevision);
});

test('V12 production acceptance rejects wrong or untrusted published results',()=>{
  const proof={rows:buildTotoAuthoritySnapshot(visible).rows};
  const good=visible.map(x=>({slug:x.slug,result:x.status==='VERIFIED'?x.result:null,drawDate:x.drawDate}));
  assert.equal(compareTotoProduction({proof,memberItems:good,memberTotal:85}).status,'PASS');
  const wrong=structuredClone(good); wrong[0].result='9999';
  const mismatch=compareTotoProduction({proof,memberItems:wrong,memberTotal:85});
  assert.equal(mismatch.status,'FAIL');
  assert.equal(mismatch.rows.find(x=>x.slug==='market-1').reason,'RESULT_MISMATCH');
  const unsafe=structuredClone(good); unsafe[10].result='1234';
  assert.equal(compareTotoProduction({proof,memberItems:unsafe,memberTotal:85}).rows.find(x=>x.slug==='market-11').reason,'UNTRUSTED_RESULT_PUBLISHED');
});

test('V12 Railway proof parser accepts JSON and real pretty logs with nested rows and exact deployment binding',()=>{
  const deploymentId='dep-v18-rootcause';
  const rows=Array.from({length:85},(_,i)=>({slug:`m${i}`,status:i<2?'VERIFIED':'UNMAPPED',result:i<2?String(1000+i):null,sources:i===0?['Official Example']:i===1?['Source A','Source B']:[]}));
  const snapshotRevision=totoAuthoritySnapshotRevision({visibleMarkets:85,expectedVisibleMarkets:85,rows});
  const obj={ts:'2026-08-18T08:00:00.000Z',level:'info',message:'TOTO production result authority snapshot',deploymentId,snapshotVersion:'R6.9.0.23-V12',snapshotRevision,visibleMarkets:85,expectedVisibleMarkets:85,rows};

  const jsonParsed=parseRailwayTotoLine(JSON.stringify(obj));
  assert.equal(jsonParsed.message,obj.message);
  assert.equal(isTotoProductionProof(jsonParsed,new Date('2026-08-18T07:59:59.000Z'),deploymentId),true);

  const pretty=`2026-08-18T08:00:00.123456789Z [INFO] TOTO production result authority snapshot ts="2026-08-18T08:00:00.000Z" reason="worker-scheduled" deploymentId="${deploymentId}" snapshotVersion="R6.9.0.23-V12" snapshotRevision="${snapshotRevision}" visibleMarkets=85 expectedVisibleMarkets=85 trusted=2 official=1 consensus=1 safeEmpty=83 rows=${JSON.stringify(rows)}`;
  const prettyParsed=parseRailwayTotoLine(pretty);
  assert.equal(prettyParsed.deploymentId,deploymentId);
  assert.equal(prettyParsed.rows.length,85);
  assert.deepEqual(prettyParsed.rows[1].sources,['Source A','Source B']);
  assert.equal(isTotoProductionProof(prettyParsed,new Date('2026-08-18T07:59:59.000Z'),deploymentId),true);
  assert.equal(isTotoProductionProof(prettyParsed,new Date('2026-08-18T08:00:01.000Z'),deploymentId),false);
  assert.equal(isTotoProductionProof(prettyParsed,new Date('2026-08-18T07:59:59.000Z'),'different-deployment'),false);
  assert.equal(isTotoProductionProof({...prettyParsed,snapshotRevision:''},new Date('2026-08-18T07:59:59.000Z'),deploymentId),false);
  assert.equal(isTotoProductionProof({...prettyParsed,rows:rows.slice(0,84)},new Date('2026-08-18T07:59:59.000Z'),deploymentId),false);
});


test('HF8 Railway proof selection prefers the newest changed authority revision',()=>{
  const deploymentId='dep-hf8-race';
  const firstRows=buildTotoAuthoritySnapshot(visible).rows;
  const changed=structuredClone(visible);
  changed[0].status='SINGLE_SOURCE';
  changed[0].result=null;
  changed[0].authority=undefined;
  const secondRows=buildTotoAuthoritySnapshot(changed).rows;
  const firstRevision=totoAuthoritySnapshotRevision({visibleMarkets:85,expectedVisibleMarkets:85,rows:firstRows});
  const secondRevision=totoAuthoritySnapshotRevision({visibleMarkets:85,expectedVisibleMarkets:85,rows:secondRows});
  const first=JSON.stringify({ts:'2026-08-18T20:16:32.289Z',message:'TOTO production result authority snapshot',deploymentId,snapshotVersion:'R6.9.0.23-V12',snapshotRevision:firstRevision,visibleMarkets:85,expectedVisibleMarkets:85,rows:firstRows});
  const second=JSON.stringify({ts:'2026-08-18T20:17:38.803Z',message:'TOTO production result authority snapshot',deploymentId,snapshotVersion:'R6.9.0.23-V12',snapshotRevision:secondRevision,visibleMarkets:85,expectedVisibleMarkets:85,rows:secondRows});
  const selected=selectRailwayTotoProof(`${first}\n${second}`,new Date('2026-08-18T20:16:00Z'),deploymentId);
  assert.equal(selected.snapshotRevision,secondRevision);
  assert.notEqual(selected.snapshotRevision,firstRevision);
});

test('V12 live acceptance runner compares the public member endpoint without exposing authority metadata',async()=>{
  const proof={rows:buildTotoAuthoritySnapshot(visible).rows};
  const data=visible.map(x=>({slug:x.slug,result:x.status==='VERIFIED'?x.result:null,drawDate:x.drawDate}));
  let requested='';
  const fetchImpl=async url=>{requested=String(url);return {ok:true,status:200,json:async()=>({data,meta:{total:85}})}};
  const result=await runAcceptance({proof,baseUrl:'https://example.test',fetchImpl});
  assert.equal(result.status,'PASS');
  assert.match(requested,/\/member-api\/markets\?limit=100$/);
});


test('HF11 source-health proof is bound to the exact Railway deployment and keeps per-source diagnostics',()=>{
  const deploymentId='dep-hf11-source-health';
  const diagnostics=[
    {code:'datatoto',ok:true,transportOk:true,parsedMarkets:55,selectedMarkets:43,latestDrawDate:'2026-08-18',status:200,bytes:12000,latencyMs:120,error:null},
    {code:'poskopaito',ok:true,transportOk:true,parsedMarkets:42,status:200,bytes:11000,latencyMs:140,error:null},
    {code:'masterlive',ok:true,transportOk:true,parsedMarkets:5,status:200,bytes:9000,latencyMs:100,error:null},
    {code:'cindototo',ok:true,transportOk:true,parsedMarkets:78,status:200,bytes:45000,latencyMs:170,error:null},
    {code:'sumtoto',ok:true,transportOk:true,parsedMarkets:81,status:200,bytes:47000,latencyMs:160,error:null},
    {code:'miototo',ok:true,transportOk:true,parsedMarkets:52,status:200,bytes:43000,latencyMs:150,error:null}
  ];
  const line=`2026-08-19T05:00:00.123456789Z [INFO] TOTO collector cycle completed ts="2026-08-19T05:00:00.000Z" reason="worker-scheduled" deploymentId="${deploymentId}" verified=20 singleSource=30 conflict=2 unmapped=33 updated=0 unchanged=85 healthySources=6 sourceDiagnostics=${JSON.stringify(diagnostics)}`;
  const parsed=parseRailwayTotoSourceLine(line);
  assert.equal(parsed.deploymentId,deploymentId);
  assert.equal(parsed.sourceDiagnostics.length,6);
  assert.equal(isTotoSourceHealthProof(parsed,new Date('2026-08-19T04:59:59Z'),deploymentId),true);
  assert.equal(isTotoSourceHealthProof(parsed,new Date('2026-08-19T05:00:01Z'),deploymentId),false);
  assert.equal(isTotoSourceHealthProof(parsed,new Date('2026-08-19T04:59:59Z'),'old-deployment'),false);
  const selected=selectRailwayTotoSourceHealthProof(`noise\n${line}`,new Date('2026-08-19T04:59:59Z'),deploymentId);
  assert.equal(selected.sourceDiagnostics.find(x=>x.code==='cindototo').parsedMarkets,78);
  assert.equal(selected.sourceDiagnostics.find(x=>x.code==='datatoto').selectedMarkets,43);
  assert.equal(selected.sourceDiagnostics.find(x=>x.code==='datatoto').latestDrawDate,'2026-08-18');
});
