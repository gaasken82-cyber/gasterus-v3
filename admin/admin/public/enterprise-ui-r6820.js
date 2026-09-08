(()=>{
'use strict';
const paths={
 dashboard:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
 users:'<circle cx="8" cy="8" r="3"/><circle cx="17" cy="7" r="2.5"/><path d="M3 20c0-4 2-6 5-6s5 2 5 6M14 13c4 0 6 2 6 6"/>',
 shield:'<path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/>',
 risk:'<path d="M12 3 2 20h20L12 3Z"/><path d="M12 9v5M12 17h.01"/>',
 card:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M7 15h4"/>',
 ledger:'<path d="M5 3h14v18H5z"/><path d="M8 7h8M8 11h8M8 15h5"/>',
 reconcile:'<path d="M7 7h11l-3-3M17 17H6l3 3"/><path d="M18 7l-3 3M6 17l3-3"/>',
 support:'<path d="M4 13a8 8 0 0 1 16 0"/><path d="M4 13v4a2 2 0 0 0 2 2h2v-6H4Zm16 0v4a2 2 0 0 1-2 2h-2v-6h4Z"/>',
 report:'<path d="M5 3h14v18H5z"/><path d="M8 16v-4M12 16V8M16 16v-6"/>',
 ticket:'<path d="M4 6h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4V6Z"/><path d="M12 8v8"/>',
 number:'<path d="M8 3 6 21M18 3l-2 18M3 9h18M2 15h18"/>',
 content:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h7M7 16h5"/>',
 approval:'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
 lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
 settings:'<circle cx="12" cy="12" r="3"/><path d="M19 13.5v-3l-2-.7a7 7 0 0 0-.8-1.8l.9-1.9-2.2-2.2-1.9.9a7 7 0 0 0-1.8-.8L10.5 2h-3l-.7 2a7 7 0 0 0-1.8.8l-1.9-.9L.9 6.1 1.8 8a7 7 0 0 0-.8 1.8l-2 .7v3l2 .7a7 7 0 0 0 .8 1.8l-.9 1.9 2.2 2.2 1.9-.9a7 7 0 0 0 1.8.8l.7 2h3l.7-2a7 7 0 0 0 1.8-.8l1.9.9 2.2-2.2-.9-1.9a7 7 0 0 0 .8-1.8l2-.7Z" transform="translate(2 0) scale(.83)"/>',
 help:'<circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.3 2.3 0 1 1 3.5 2c-.9.5-1.3 1.1-1.3 2M12 17h.01"/>'
};
const svg=name=>`<svg class="ui-icon-svg" aria-hidden="true" viewBox="0 0 24 24">${paths[name]||paths.help}</svg>`;
function cleanLegacy(root=document){root.querySelectorAll?.('[data-modern-icon], [data-e-icon], .e-icon, .r9-icon-host').forEach(node=>{if(!node.hasAttribute('data-ui-icon'))node.remove()})}
function render(root=document){root.querySelectorAll?.('[data-ui-icon]').forEach(host=>{const name=host.getAttribute('data-ui-icon')||'help';host.classList.add('ui-icon-host');host.replaceChildren();host.insertAdjacentHTML('afterbegin',svg(name))});cleanLegacy(root)}

const BRAND_LOGO='assets/sbototo-logo.png';
function brandContext(el){
 const small=el.querySelector?.('small');
 if(small?.textContent?.trim())return small.textContent.trim();
 return (el.textContent||'').replace(/\s+/g,' ').trim().replace(/^(?:SBOTOTO|ASEAN777)\b/i,'').replace(/^[\s•|·—–-]+/,'').trim();
}
function brandify(el){
 if(!el||el.dataset?.sbototoBrand==='1')return;
 const text=(el.textContent||'').replace(/\s+/g,' ').trim();
 if(!/^(?:SBOTOTO|ASEAN777)\b/i.test(text))return;
 const context=brandContext(el);
 const img=document.createElement('img');
 img.src=BRAND_LOGO;img.alt='SBOTOTO';img.className='sbototo-brand-logo';img.decoding='async';img.loading='eager';
 el.replaceChildren(img);
 if(context){const ctx=document.createElement('span');ctx.className='sbototo-brand-context';ctx.textContent=context;el.appendChild(ctx)}
 el.classList.add('sbototo-brand-host');el.dataset.sbototoBrand='1';
}
function applyBrand(root=document){
 const selectors='.brand,.top>strong,h1';
 if(root.matches?.(selectors))brandify(root);
 root.querySelectorAll?.(selectors).forEach(brandify);
 const appIcon=root.matches?.('.app-icon')?root:root.querySelector?.('.app-icon');
 if(appIcon){appIcon.textContent='';appIcon.classList.add('sbototo-app-icon');appIcon.setAttribute('aria-label','SBOTOTO')}
}

function start(){document.body.classList.add('enterprise-r6820');document.body.classList.remove('enterprise-r689','enterprise-r6811','enterprise-r6812','enterprise-r6815','enterprise-r6817','enterprise-r6818');render();applyBrand();const observer=new MutationObserver(records=>{for(const record of records){for(const node of record.addedNodes){if(node.nodeType!==1)continue;const el=node;if(el.matches?.('[data-modern-icon], [data-e-icon], .e-icon, .r9-icon-host'))el.remove();else{render(el);applyBrand(el)}}}});observer.observe(document.body,{childList:true,subtree:true})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();


(()=>{
'use strict';
const cardSelectors=['.card','.section','.summary-card','.quick-card','.market-card','.provider-card','.slot-card','.results-panel','.transaction-box','.info-card','.latest-pools-section','.pool-card','.sports-panel','.bet-slip','.league-card','.event-row','.market-block','.source-card','.ticket-card','.slip-selection','.panel-card','.metric-card','.history-card','.control-panel','.history-hero','.market-hero','.register-card','.register-help-card','.rules-card','.member-side','.case'];
const buttonSelectors=['button','.btn','.odd-button','.side-link','.nav-link','.quick-nav a','.league-chip','.market-tab','.date-button'];
const statusWords={success:/approved|success|selesai|verified|online|active|open|ready|sehat|completed|win|won/i,warning:/pending|processing|menunggu|review|limited|single.source|warning|maintenance/i,danger:/rejected|failed|error|offline|closed|suspended|conflict|blocked|lose|lost|ditolak|gagal/i,info:/live|info|new|running|process/i};
function tone(text=''){for(const [k,re] of Object.entries(statusWords))if(re.test(text))return k;return 'neutral'}
function enrich(root=document){
  const scope=root.nodeType===1?root:document;
  for(const sel of cardSelectors)scope.querySelectorAll?.(sel).forEach(el=>el.setAttribute('data-pe-glow',''));
  for(const sel of buttonSelectors)scope.querySelectorAll?.(sel).forEach(el=>el.setAttribute('data-pe-button',''));
  scope.querySelectorAll?.('.badge,.status,.provider-health,.source-dot,.live-status,.connection-pill,.verification-badge,.live-badge,.panel-status').forEach(el=>el.setAttribute('data-status-tone',tone(el.textContent||el.getAttribute('title')||'')));
  scope.querySelectorAll?.('.loading-state,.empty,.empty-state').forEach(el=>el.setAttribute('data-pe-state',''));
}
function pointerGlow(e){const card=e.target.closest?.('[data-pe-glow]');if(!card)return;const r=card.getBoundingClientRect();card.style.setProperty('--pe-x',`${e.clientX-r.left}px`);card.style.setProperty('--pe-y',`${e.clientY-r.top}px`)}
const oddValues=new WeakMap();
function observeOdds(){document.querySelectorAll('.odd-button').forEach(el=>{const v=parseFloat((el.textContent||'').replace(',','.').match(/\d+(?:\.\d+)?/)?.[0]||'');if(Number.isFinite(v))oddValues.set(el,v)});const mo=new MutationObserver(records=>{for(const r of records){const el=(r.target.nodeType===3?r.target.parentElement:r.target)?.closest?.('.odd-button');if(!el)continue;const v=parseFloat((el.textContent||'').replace(',','.').match(/\d+(?:\.\d+)?/)?.[0]||'');if(!Number.isFinite(v))continue;const prev=oddValues.get(el);oddValues.set(el,v);if(!Number.isFinite(prev)||prev===v)continue;el.classList.remove('pe-odds-up','pe-odds-down');void el.offsetWidth;el.classList.add(v>prev?'pe-odds-up':'pe-odds-down');setTimeout(()=>el.classList.remove('pe-odds-up','pe-odds-down'),850)}});mo.observe(document.body,{subtree:true,childList:true,characterData:true})}
function observeValues(){const targets=[...document.querySelectorAll('.balance,.balance-mini,.amount,.number,.result-number,.pool-result-number,.latest-digits')];const cache=new WeakMap(targets.map(el=>[el,el.textContent]));const mo=new MutationObserver(records=>{for(const r of records){const el=(r.target.nodeType===3?r.target.parentElement:r.target);const target=targets.find(x=>x===el||x.contains(el));if(!target)continue;const now=target.textContent;if(cache.get(target)===now)continue;cache.set(target,now);target.classList.remove('pe-value-flash');void target.offsetWidth;target.classList.add('pe-value-flash');setTimeout(()=>target.classList.remove('pe-value-flash'),760)}});mo.observe(document.body,{subtree:true,childList:true,characterData:true})}
function start(){document.body.classList.add('enterprise-r6820');document.body.classList.remove('enterprise-r6818','enterprise-r6819');document.body.dataset.premiumExperience='6820';enrich();document.addEventListener('pointermove',pointerGlow,{passive:true});observeOdds();observeValues();const mo=new MutationObserver(rs=>{for(const r of rs)for(const n of r.addedNodes)if(n.nodeType===1)enrich(n)});mo.observe(document.body,{subtree:true,childList:true})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();


/* R6.8.20 Maximum Premium Experience — visual-only onboarding intelligence. */
(()=>{
function initMaxRegister(){
 const form=document.getElementById('registerForm'); if(!form)return;
 const percent=document.getElementById('registerProgressPercent'),bar=document.getElementById('registerProgressBar'),label=document.getElementById('registerProgressLabel');
 const required=[...form.querySelectorAll('[required]')].filter(el=>el.type!=='checkbox'); const agree=document.getElementById('agreeRules');
 const fieldOf=el=>el?.closest('.form-field');
 const validEnough=el=>{if(!el)return false;const v=(el.value||'').trim();if(!v)return false;if(el.type==='email')return /^\S+@\S+\.\S+$/.test(v);if(el.id==='regConfirmPassword')return v===document.getElementById('regPassword')?.value;return true};
 function update(){let done=required.filter(validEnough).length+(agree?.checked?1:0),total=required.length+1,p=Math.round(done/Math.max(total,1)*100);if(percent)percent.textContent=p+'%';if(bar)bar.style.width=p+'%';if(label)label.textContent=p===100?'Data siap diverifikasi':p>=65?'Hampir selesai':p>=25?'Lanjutkan data berikutnya':'Mulai lengkapi data';required.forEach(el=>fieldOf(el)?.classList.toggle('is-complete',validEnough(el)))}
 required.forEach(el=>{el.addEventListener('input',update,{passive:true});el.addEventListener('change',update,{passive:true})});agree?.addEventListener('change',update,{passive:true});update();
 const pass=document.getElementById('regPassword'); if(pass&&!form.querySelector('.password-strength')){const wrap=document.createElement('div');wrap.className='password-strength';wrap.innerHTML='<div class="password-strength-track"><span></span></div><small>Belum diisi</small>';const err=document.getElementById('regPasswordError');err?.insertAdjacentElement('afterend',wrap);const fill=wrap.querySelector('span'),txt=wrap.querySelector('small');const strength=()=>{const v=pass.value||'';let score=0;if(v.length>=10)score++;if(/[a-z]/.test(v)&&/[A-Z]/.test(v))score++;if(/\d/.test(v))score++;if(/[^A-Za-z0-9]/.test(v))score++;const pct=[0,28,52,76,100][score];fill.style.width=pct+'%';fill.style.background=score<2?'#ff6b81':score<4?'#f4c16e':'#72e3ad';txt.textContent=!v?'Belum diisi':['Sangat lemah','Dasar','Cukup','Kuat','Sangat kuat'][score];};pass.addEventListener('input',strength,{passive:true});strength()}
}
function startMax(){document.body.classList.add('enterprise-r6820');document.body.classList.remove('enterprise-r6819');document.body.dataset.maximumPremium='6820';initMaxRegister()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',startMax,{once:true});else startMax();
})();
