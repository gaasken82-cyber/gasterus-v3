import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compactMemberMarkets, projectMemberMarkets } from '../src/sportsbook-member-projection.js';

function selection(key='A',odds=1.9,suspended=false){return {key,label:key,odds,line:null,suspended,priceVersion:'v1',provider:'SHOULD_NOT_LEAK'};}
function market(id,type,period,line,{mainLine=false,suspended=false,odds=1.9}={}){
  return {id,type,period,line,mainLine,suspended,label:`${type} ${period}`,provider:'SHOULD_NOT_LEAK',sourceMarketId:'SECRET',selections:[selection('HOME',odds,suspended),selection('AWAY',odds+0.1,suspended)]};
}

test('FINAL mobile sportsbook list projection keeps core FT/1H markets and bounds payload',()=>{
  const markets=[];
  markets.push(market('1x2-ft','1X2','FT',null,{mainLine:true}));
  markets.push(market('1x2-1h','1X2','1H',null,{mainLine:true}));
  for(let i=-15;i<=15;i+=1){
    markets.push(market(`h-ft-${i}`,'HANDICAP','FT',i/4,{mainLine:i===0}));
    markets.push(market(`t-ft-${i}`,'TOTALS','FT',2.5+i/4,{mainLine:i===0}));
    markets.push(market(`h-1h-${i}`,'HANDICAP','1H',i/4,{mainLine:i===0}));
    markets.push(market(`t-1h-${i}`,'TOTALS','1H',1.5+i/4,{mainLine:i===0}));
  }
  for(const type of ['BTTS','DOUBLE_CHANCE','DRAW_NO_BET','TEAM_TOTAL','ODD_EVEN','HT_FT','CORRECT_SCORE','BET_BUILDER']) markets.push(market(type,type,'FT',null,{mainLine:true}));
  const compact=compactMemberMarkets(markets);
  assert.ok(compact.length<=12,`compact market count=${compact.length}`);
  const keys=new Set(compact.map(x=>`${x.type}:${x.period}`));
  for(const key of ['1X2:FT','HANDICAP:FT','TOTALS:FT','1X2:1H','HANDICAP:1H','TOTALS:1H']) assert.ok(keys.has(key),`missing ${key}`);
  assert.equal(compact.find(x=>x.type==='HANDICAP'&&x.period==='FT')?.mainLine,true);
  assert.equal(compact.find(x=>x.type==='TOTALS'&&x.period==='FT')?.mainLine,true);
});

test('FINAL mobile member market projection strips provider/source telemetry',()=>{
  const output=projectMemberMarkets([market('m1','1X2','FT',null,{mainLine:true})]);
  assert.equal(output.length,1);
  assert.equal('provider' in output[0],false);
  assert.equal('sourceMarketId' in output[0],false);
  assert.equal('provider' in output[0].selections[0],false);
  assert.deepEqual(Object.keys(output[0].selections[0]).sort(),['key','label','line','odds','priceVersion','suspended'].sort());
});

test('FINAL mobile sportsbook list is compact while event detail remains full',()=>{
  const feed=readFileSync(new URL('../src/sportsbook-feed.js',import.meta.url),'utf8');
  assert.match(feed,/function memberPublicEvent\(event\)[\s\S]*compactMemberMarkets\(item\.markets \|\| \[\]\)/);
  assert.match(feed,/function memberPublicEventDetail\(event\)[\s\S]*memberEventShape\(item, item\.markets \|\| \[\]\)/);
  assert.match(feed,/event: applySportsbookTradingControls\(\[memberPublicEventDetail\(current\)\]/);
});

test('FINAL mobile frontend has bounded timeout plus one retry for first feed load',()=>{
  const js=readFileSync(new URL('../../member/public/sportsbook.js',import.meta.url),'utf8');
  assert.match(js,/async function requestSportsbookFeed\(\)/);
  assert.match(js,/new AbortController\(\)/);
  assert.match(js,/setTimeout\(\(\) => controller\.abort\(\), 6000\)/);
  assert.match(js,/for \(let attempt = 0; attempt < 2; attempt \+= 1\)/);
  assert.match(js,/const payload = await requestSportsbookFeed\(\)/);
});
