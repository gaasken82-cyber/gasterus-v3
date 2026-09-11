/**
 * GASTERUS Sportsbook — WAM-inspired UI, wired to the Gasterus API only.
 *
 * DATA SOURCES (all Gasterus, realtime, never mocked):
 *   - GET  /api/member/sportsbook/stream      (SSE — full snapshot + realtime revisions)
 *   - GET  /api/member/sportsbook/events/{id} (full market detail)
 *   - POST /api/member/sportsbook/quotes      (server quote / odds lock + revalidation)
 *   - POST /api/member/sportsbook/bets        (place bet with quoteToken + idempotency)
 *
 * The member API has NO /feed REST endpoint; the SSE stream IS the member feed.
 * No games.json, no Math.random(), no setTimeout bet simulation.
 */
import api from './api.js';
import auth from './auth.js';
import { formatRupiah, showToast, escapeHtml } from './utils.js';

const STREAM_URL = '/api/member/sportsbook/stream';
const SNAPSHOT_URL = '/api/member/sportsbook/events';
const FEED_DETAIL_URL = (id) => `/api/member/sportsbook/events/${encodeURIComponent(id)}`;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let feed = { events: [], stale: false, degraded: false, source: {} };
let selected = new Map(); // selectionKey -> leg payload (betslip)
let currentSport = 'all';
let currentLeague = 'all';
let currentFilter = 'all'; // all | live
let searchQuery = '';
let lastRenderRevision = '';
let bettingConfig = { minStake: 1000, maxStake: 50000000, maxLegs: 12, quoteRequired: true };
let streamClosed = false;
let restRefreshTimer = null;
let quote = null; // last successful server quote
let placing = false;

const el = (id) => document.getElementById(id);
const selKey = (ev, mk, sk) => `${ev}|${mk}|${sk}`;
const fmt = (n) => (Number.isFinite(Number(n)) ? new Intl.NumberFormat('id-ID').format(Number(n)) : '0');

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
export async function initSportsbook() {
  buildSkeleton();
  auth.updateHeaderAuthUI();
  if (auth.isLoggedIn()) {
    try { await auth.fetchMe(); } catch { /* session already expired */ }
    auth.updateHeaderAuthUI();
  }
  setupFilterTabs();
  setupSearch();
  setupMobileDock();
  bindEventHandlers();

  if (!auth.isLoggedIn()) {
    setStatus('offline');
    renderAuthRequired();
    return;
  }
  startStream();
  refreshTicketNote();
}

function buildSkeleton() {
  const s = el('sb-skeleton');
  if (!s) return;
  let h = '';
  for (let i = 0; i < 4; i += 1) {
    h += `<div class="sb-sk-card"><div class="sb-sk-line" style="width:45%"></div>` +
      `<div class="sb-sk-line" style="width:80%"></div>` +
      `<div class="sb-sk-line" style="width:30%"></div></div>`;
  }
  s.innerHTML = h;
}

function renderAuthRequired() {
  hideSkeleton();
  setEmpty('Silakan login untuk melihat odds dan memasang taruhan sportsbook.');
  const err = el('sb-error');
  if (err) {
    err.hidden = false;
    err.innerHTML = `Sesi member belum aktif. <a href="/index.html">Login</a> untuk melanjutkan ke sportsbook.`;
  }
}

function setStatus(state) {
  const dot = el('rt-dot');
  const label = el('rt-label');
  if (state === 'online') { if (dot) dot.className = 'sb-rt-dot on'; if (label) label.textContent = 'Live'; }
  else if (state === 'connecting') { if (dot) dot.className = 'sb-rt-dot'; if (label) label.textContent = 'Connecting…'; }
  else { if (dot) dot.className = 'sb-rt-dot off'; if (label) label.textContent = 'Offline'; }
// ---------------------------------------------------------------------------
// SSE stream — manual client so the Authorization header can be sent.
// EventSource cannot set headers, and the member session may be Bearer-based.
// ---------------------------------------------------------------------------
const SB_BUILD = 'sb4';
window.__SB_BUILD = SB_BUILD;
console.info(`[GASTERUS] sportsbook build ${SB_BUILD}`);

function startStream() {
  streamClosed = false;
  setStatus('connecting');
  loadRestSnapshot(); // REST bootstrap — render papan data seketika; SSE mengambil alih realtime.
  if (!restRefreshTimer) restRefreshTimer = setInterval(() => { if (!streamClosed) loadRestSnapshot(); }, 45000); // periodic fallback refresh
  connectStream();
}

// REST bootstrap/fallback — papan tetap terisi walau SSE terblokir/dibuffer perantara.
async function loadRestSnapshot() {
  try {
    const headers = { Accept: 'application/json' };
    if (api.token) { headers.Authorization = `Bearer ${api.token}`; headers['x-session-token'] = api.token; }
    const res = await fetch(SNAPSHOT_URL, { method: 'GET', credentials: 'include', headers });
    if (!res.ok) { console.warn('[GASTERUS] snapshot http', res.status); return false; }
    const json = await res.json();
    const payload = json?.data || json || null;
    if (payload && Array.isArray(payload.events) && payload.events.length) {
      onSnapshot(payload);
      return true;
    }
  } catch (e) { console.warn('[GASTERUS] snapshot bootstrap gagal', e); }
  return false;
}

async function connectStream() {
  let backoff = 1500;
  while (!streamClosed) {
    try {
      const headers = { Accept: 'text/event-stream', 'x-session-token': api.token || '' };
      if (api.token) headers.Authorization = `Bearer ${api.token}`;
      const res = await fetch(STREAM_URL, { method: 'GET', credentials: 'include', headers });
      if (res.status === 401) {
        window.location.href = '/index.html?msg=session_expired';
        return;
      }
      if (!res.ok || !res.body) throw new Error(`stream http ${res.status}`);
      setStatus('online');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (!streamClosed) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buf += decoder.decode(chunk.value ?? new Uint8Array(0), { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const frame = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          handleFrame(frame.replace(/\r\n/g, '\n'));
        }
      }
      reader.release?.();
      if (streamClosed) return;
    } catch (e) {
      // transport error — refresh data via REST fallback lalu reconnect dengan backoff
      await loadRestSnapshot();
    }
    if (streamClosed) return;
    setStatus('connecting');
    await new Promise((resolve) => setTimeout(resolve, backoff));
    backoff = Math.min(backoff * 1.6, 15000);
  }
}

function handleFrame(frame) {
  if (!frame.trim()) return;
  let event = 'message';
  let data = '';
  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data += (data ? '\n' : '') + line.slice(5).trim();
  }
  if (event === 'ready') return; // handshake only
  if (event === 'degraded') { setStatus('online'); return; }
  if (event === 'snapshot' && data) {
    let payload;
    try { payload = JSON.parse(data); } catch { return; }
    onSnapshot(payload);
  }
}

// Re-render only when the feed revision actually changes (prevents flicker).
function onSnapshot(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.events)) return;
  const revision = snapshot.source?.feedRevision || '';
  feed = {
    events: snapshot.events,
    stale: Boolean(snapshot.stale),
    degraded: Boolean(snapshot.degraded),
    source: snapshot.source || {}
  };
  if (snapshot.betting) bettingConfig = { ...bettingConfig, ...snapshot.betting };
  pruneSelections(feed.events);

  const eventsEl = el('sb-events');
  const needsFirstRender = !eventsEl || !eventsEl.innerHTML;
  if (revision !== lastRenderRevision || needsFirstRender) {
    lastRenderRevision = revision;
    try { renderAll(); }
    catch (e) {
      // Fail-loud: bug render harus terlihat, bukan "Connecting…" tanpa akhir.
      console.error('[GASTERUS] renderAll gagal', e);
      if (eventsEl) eventsEl.innerHTML = `<div class="sb-empty">Gagal menampilkan papan: ${escapeHtml(e?.message || String(e))} (build ${SB_BUILD})</div>`;
    }
  }
  renderStatusMeta();
}

function pruneSelections(events) {
  if (!selected.size) return;
  const liveKeys = new Set();
  for (const ev of events) {
    for (const mk of ev.markets || []) {
      for (const sk of mk.selections || []) liveKeys.add(selKey(ev.id, mk.id, sk.key));
    }
  }
  let changed = false;
  for (const key of [...selected.keys()]) {
    if (!liveKeys.has(key)) { selected.delete(key); changed = true; }
  }
  if (changed) { quote = null; renderBetslip(); }
}

function renderStatusMeta() {
  const banner = el('sb-stale-banner');
  if (banner) {
    if (feed.stale) {
      banner.hidden = false;
      banner.textContent = 'Sumber odds sedang stale — sportsbook sementara read-only. Feed akan memperbarui otomatis.';
    } else banner.hidden = true;
  }
}
// ---------------------------------------------------------------------------
// Filters / search
// ---------------------------------------------------------------------------
function setupFilterTabs() {
  const tabs = [
    { id: 'all', label: 'Semua' },
    { id: 'live', label: '● LIVE' }
  ];
  const host = el('filter-tabs');
  if (!host) return;
  host.innerHTML = '';
  for (const t of tabs) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sb-chip' + (t.id === currentFilter ? ' active' : '');
    b.setAttribute('data-filter', t.id);
    b.textContent = t.label;
    b.addEventListener('click', () => { currentFilter = t.id; renderAll(); syncFilterUI(); });
    host.appendChild(b);
  }
}

function syncFilterUI() {
  document.querySelectorAll('#filter-tabs .sb-chip').forEach((b) => {
    b.classList.toggle('active', b.getAttribute('data-filter') === currentFilter);
  });
  document.querySelectorAll('#league-nav .sb-nav-item').forEach((b) => {
    b.classList.toggle('active', b.getAttribute('data-league') === currentLeague);
  });
  document.querySelectorAll('#sport-nav .sb-nav-item').forEach((b) => {
    b.classList.toggle('active', b.getAttribute('data-sport') === currentSport);
  });
}

function setupSearch() {
  const input = el('sb-search');
  if (!input) return;
  let t;
  input.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => { searchQuery = input.value.trim().toLowerCase(); renderAll(); }, 200);
  });
}

function bindEventHandlers() {
  const ev = el('sb-events');
  if (!ev) return;
  ev.addEventListener('click', (e) => {
    const odd = e.target.closest('.sb-odd');
    if (odd && !odd.classList.contains('sb-odd-off')) { handleOddClick(odd); return; }
    const more = e.target.closest('[data-more-markets]');
    if (more) { handleMoreMarkets(more); return; }
  });
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function visibleEvents() {
  let list = feed.events;
  if (currentSport !== 'all') list = list.filter((e) => String(e.sport || '').toLowerCase() === String(currentSport).toLowerCase());
  if (currentLeague !== 'all') list = list.filter((e) => String(e.league || '') === currentLeague);
  if (currentFilter === 'live') list = list.filter((e) => Boolean(e.live) || String(e.status || '').toUpperCase() === 'LIVE');
  if (searchQuery) {
    list = list.filter((e) =>
      String(e.league || '').toLowerCase().includes(searchQuery) ||
      String(e.home?.name || '').toLowerCase().includes(searchQuery) ||
      String(e.away?.name || '').toLowerCase().includes(searchQuery));
  }
  return list;
}

function renderAll() {
  hideSkeleton();
  const ev = el('sb-events');
  if (!ev) return;
  const list = visibleEvents();
  if (!list.length) {
    ev.innerHTML = '';
    setEmpty('Tidak ada pertandingan yang tersedia pada filter ini.');
    renderSidebar(feed.events);
    return;
  }
  const empty = el('sb-empty');
  if (empty) empty.hidden = true;
  ev.innerHTML = renderLeagueGroups(list);
  renderSidebar(feed.events);
}

function setEmpty(msg) {
  hideSkeleton();
  const e = el('sb-empty');
  if (e) { e.hidden = false; e.textContent = msg; }
}

function hideSkeleton() { const s = el('sb-skeleton'); if (s) s.innerHTML = ''; }

function renderLeagueGroups(list) {
  const groups = new Map();
  for (const e of list) {
    const lg = e.league || 'Liga Internasional';
    if (!groups.has(lg)) groups.set(lg, []);
    groups.get(lg).push(e);
  }
  const sorted = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  let html = '';
  for (const [league, events] of sorted) {
    html += `<div class="sb-league-group">`;
    html += `<div class="sb-league-head"><span class="sb-league-name">${escapeHtml(league)}</span><span class="sb-league-count">${events.length} laga</span></div>`;
    html += `<div class="sb-match-list">`;
    for (const e of events) html += renderMatch(e);
    html += `</div></div>`;
  }
  return html;
}
function renderMatch(e) {
  const isLive = Boolean(e.live) || String(e.status || '').toUpperCase() === 'LIVE';
  const finished = String(e.status || '').toUpperCase() === 'FINISHED';
  const home = e.home || {}, away = e.away || {};
  const hScore = home.score == null ? '' : String(home.score);
  const aScore = away.score == null ? '' : String(away.score);
  const scoreTxt = (hScore !== '' || aScore !== '') ? `${hScore} - ${aScore}` : '';

  const markets = (e.markets || []).filter((m) => m && !m.suspended);
  const primary = markets.slice(0, 4);

  const badge = isLive
    ? '<span class="sb-badge sb-badge-live">● LIVE</span>'
    : finished
      ? '<span class="sb-badge sb-badge-done">FINISHED</span>'
      : `<span class="sb-badge sb-badge-time">${timeLabel(e.startTime)}</span>`;

  const logoFor = (team) => (team && team.logo
    ? `<img class="sb-team-logo" src="${escapeHtml(team.logo)}" alt="" loading="lazy">`
    : `<span class="sb-team-logo sb-team-logo-ph">${escapeHtml(((team && team.name) || '?')[0]?.toUpperCase())}</span>`);

  let marketsHtml = primary.map((m) => renderMarketRow(e, m, finished)).join('');
  if (markets.length > primary.length) {
    marketsHtml += `<button type="button" class="sb-ghost-btn sb-more" data-more-markets="${escapeHtml(e.id)}">Pasaran lainnya (${markets.length - primary.length}) ▾</button>` +
      `<div class="sb-extra" data-extra="${escapeHtml(e.id)}" hidden></div>`;
  }

  const compLogo = e.leagueLogo ? `<img class="sb-comp-logo" src="${escapeHtml(e.leagueLogo)}" alt="" loading="lazy">` : '';

  return `<article class="sb-match${isLive ? ' is-live' : ''}${finished ? ' is-done' : ''}" data-evid="${escapeHtml(e.id)}">
      <div class="sb-match-head">
        <span class="sb-match-comp">${compLogo}<span>${escapeHtml(e.league || '')}</span></span>
        ${badge}
      </div>
      <div class="sb-match-teams">
        <div class="sb-team">
          <div class="sb-team-logo-wrap">${logoFor(home)}</div>
          <span class="sb-team-name">${escapeHtml(home.name || '')}</span>
        </div>
        <div class="sb-match-vs">
          ${scoreTxt
            ? `<span class="sb-score">${escapeHtml(scoreTxt)}</span>${isLive && e.clock ? `<span class="sb-clock">${escapeHtml(String(e.clock))}'</span>` : ''}`
            : `<span class="sb-vs">${isLive ? 'LIVE' : 'VS'}</span>`}
        </div>
        <div class="sb-team sb-team-away">
          <div class="sb-team-logo-wrap">${logoFor(away)}</div>
          <span class="sb-team-name">${escapeHtml(away.name || '')}</span>
        </div>
      </div>
      <div class="sb-markets">${marketsHtml}</div>
    </article>`;
}
function renderMarketRow(e, m, locked) {
  const type = String(m.type || 'OTHER').toUpperCase();
  const period = String(m.period || 'FT').toUpperCase();
  const lineLabel = m.line ? ` <span class="sb-market-line">${escapeHtml(String(m.line))}</span>` : '';
  const label = `${marketLabel(type)}${period === '1H' ? ' · HT' : ''}${lineLabel}`;
  let cols = m.selections || [];
  if (cols.length > 7) cols = cols.slice(0, 7);
  const btnHtml = cols.map((s) => {
    if (s.suspended) return `<span class="sb-odd sb-odd-off" title="Ditutup">${escapeHtml(shortSel(s.label || s.key))}<b>—</b></span>`;
    const key = selKey(e.id, m.id, s.key);
    const sel = selected.get(key);
    const odds = (s.odds != null && Number(s.odds) > 1) ? Number(s.odds) : null;
    if (!odds) return `<span class="sb-odd sb-odd-off" title="Tidak ada harga">${escapeHtml(shortSel(s.label || s.key))}<b>—</b></span>`;
    const dir = oddsChangeDir(key, odds);
    const caret = dir === 'up' ? '<i class="sb-caret up">▲</i>' : dir === 'down' ? '<i class="sb-caret down">▼</i>' : '';
    return `<button type="button" class="sb-odd${sel ? ' chosen' : ''}${locked ? ' sb-locked' : ''}" data-sel="${escapeHtml(key)}"` +
      ` data-evid="${escapeHtml(e.id)}" data-mk="${escapeHtml(m.id)}" data-sk="${escapeHtml(s.key)}"` +
      ` data-odds="${odds}" data-pv="${escapeHtml(s.priceVersion || '')}" aria-pressed="${sel ? 'true' : 'false'}"` +
      ` title="${escapeHtml(s.label || s.key)} @ ${odds.toFixed(2)}">` +
      `<span class="sb-odd-label">${escapeHtml(shortSel(s.label || s.key))}</span><span class="sb-odd-rate">${odds.toFixed(2)}${caret}</span></button>`;
  }).join('');
  return `<div class="sb-market${locked ? ' sb-market-locked' : ''}" title="${escapeHtml(m.label || label)}">` +
    `<span class="sb-market-name">${escapeHtml(label)}</span>` +
    `<div class="sb-odd-grid">${btnHtml}</div></div>`;
}

const MARKET_LABELS = {
  '1X2': '1X2', HANDICAP: 'Handicap', TOTALS: 'Over / Under', BTTS: 'GG / NG',
  DOUBLE_CHANCE: 'Double chance', DRAW_NO_BET: 'Draw no bet', TEAM_TOTAL: 'Team total',
  ODD_EVEN: 'Odd / Even', HT_FT: 'HT / FT', CORRECT_SCORE: 'Correct score', BET_BUILDER: 'Bet builder'
};
function marketLabel(type) { return MARKET_LABELS[type] || type; }

function shortSel(label) {
  const s = String(label || '');
  const map = { home: '1', draw: 'X', away: '2' };
  if (map[s.toLowerCase()]) return map[s.toLowerCase()];
  if (s.length > 22) return s.slice(0, 19) + '…';
  return s || '—';
}

function timeLabel(start) {
  if (!start) return 'TBA';
  const d = new Date(start);
  if (isNaN(d.getTime())) return 'TBA';
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

// Odds direction memory — derived from real feed price changes, no flicker.
const oddsHistory = new Map();
function oddsChangeDir(key, odds) {
  const prev = oddsHistory.get(key);
  const o = Number(odds);
  let dir = '';
  if (prev && Number.isFinite(prev.odds) && Number.isFinite(o)) {
    if (o > prev.odds) dir = 'up';
    else if (o < prev.odds) dir = 'down';
  }
  oddsHistory.set(key, { odds: o });
  return dir;
}

function renderSidebar(list) {
  const sportHost = el('sport-nav');
  const leagueHost = el('league-nav');
  const sports = [...new Set(list.map((e) => e.sport || 'Football'))];
  const leagues = [...new Set(list.map((e) => e.league || 'Liga Internasional'))].sort((a, b) => a.localeCompare(b));
  if (sportHost) {
    let h = `<button type="button" class="sb-nav-item${currentSport === 'all' ? ' active' : ''}" data-sport="all">Semua</button>`;
    h += sports.map((s) => `<button type="button" class="sb-nav-item${currentSport === s ? ' active' : ''}" data-sport="${escapeHtml(s)}">${escapeHtml(s)}</button>`).join('');
    sportHost.innerHTML = h;
    sportHost.querySelectorAll('.sb-nav-item').forEach((b) => b.addEventListener('click', () => { currentSport = b.getAttribute('data-sport'); renderAll(); syncFilterUI(); }));
  }
  if (leagueHost) {
    let h = `<button type="button" class="sb-nav-item${currentLeague === 'all' ? ' active' : ''}" data-league="all">Semua Liga</button>`;
    h += leagues.map((l) => `<button type="button" class="sb-nav-item${currentLeague === l ? ' active' : ''}" data-league="${escapeHtml(l)}">${escapeHtml(l)}</button>`).join('');
    leagueHost.innerHTML = h;
    leagueHost.querySelectorAll('.sb-nav-item').forEach((b) => b.addEventListener('click', () => { currentLeague = b.getAttribute('data-league'); renderAll(); syncFilterUI(); }));
  }
  const st = el('sidebar-status');
  if (st) st.innerHTML = feed.source?.pricedMarkets ? `${fmt(feed.source.pricedMarkets)} markets` : '—';
}
// ---------------------------------------------------------------------------
// "More markets" — full detail from GET /api/member/sportsbook/events/{id}
// ---------------------------------------------------------------------------
async function handleMoreMarkets(trigger) {
  const eventId = trigger.getAttribute('data-more-markets');
  const host = document.querySelector(`[data-extra="${CSS.escape(eventId)}"]`);
  if (!host) return;
  const isOpen = trigger.getAttribute('data-open') === 'true';
  if (isOpen) {
    host.hidden = true;
    trigger.setAttribute('data-open', 'false');
    return;
  }
  trigger.setAttribute('data-open', 'true');
  host.hidden = false;
  host.innerHTML = '<div class="sb-extra-loading">Memuat pasaran…</div>';
  try {
    const res = await api.get(`/member/sportsbook/events/${encodeURIComponent(eventId)}`);
    const event = res?.data?.event || res?.data || null;
    const markets = (event?.markets || []).filter((m) => m && !m.suspended);
    const shown = new Set();
    const card = trigger.closest('.sb-match');
    if (card) card.querySelectorAll('.sb-market').forEach((n) => shown.add(n.getAttribute('title')));
    const extra = markets.filter((m) => !shown.has(m.label || marketLabel(m.type)));
    host.innerHTML = extra.length
      ? extra.map((m) => renderMarketRow(event, m, event && String((event.status || '').toUpperCase()) === 'FINISHED')).join('')
      : '<div class="sb-extra-loading">Semua pasaran sudah ditampilkan.</div>';
  } catch (err) {
    host.innerHTML = `<div class="sb-extra-loading sb-err">Gagal memuat pasaran: ${escapeHtml(err.message || '')}</div>`;
  }
}

// ---------------------------------------------------------------------------
// Odds click -> betslip
// ---------------------------------------------------------------------------
function handleOddClick(btn) {
  const key = btn.getAttribute('data-sel');
  const odds = Number(btn.getAttribute('data-odds'));
  const priceVersion = btn.getAttribute('data-pv') || '';
  if (!key || !Number.isFinite(odds)) return;

  if (selected.has(key)) {
    selected.delete(key);
    quote = null;
    renderBetslip();
    renderAll();
    return;
  }
  if (selected.size >= bettingConfig.maxLegs) {
    showToast(`Maksimal ${bettingConfig.maxLegs} pilihan per tiket.`, 'warning');
    return;
  }
  const event = feed.events.find((e) => e.id === btn.getAttribute('data-evid'));
  const market = event?.markets?.find((m) => m.id === btn.getAttribute('data-mk'));
  const selection = market?.selections?.find((s) => s.key === btn.getAttribute('data-sk'));
  if (!event || !market || !selection || !priceVersion) {
    showToast('Data pilihan tidak lengkap. Muat ulang halaman.', 'danger');
    return;
  }
  // One selection per market per event (sportsbook rule, like WAM)
  for (const [k, v] of [...selected.entries()]) {
    if (v.eventId === event.id && v.marketId === market.id) selected.delete(k);
  }
  selected.set(key, {
    eventId: event.id,
    marketId: market.id,
    selectionId: selection.key,
    selectionLabel: selection.label,
    marketLabel: market.label || marketLabel(market.type),
    marketPeriod: market.period || 'FT',
    marketLine: market.line || null,
    eventName: `${event.home?.name || ''} vs ${event.away?.name || ''}`,
    odds,
    priceVersion
  });
  quote = null;
  renderBetslip();
  renderAll();
  showToast(`${selection.label} @ ${odds.toFixed(2)} ditambahkan`, 'success');
}
// ---------------------------------------------------------------------------
// Betslip — WAM-style accumulator, backed by Gasterus server quotes
// ---------------------------------------------------------------------------
function betType() { return selected.size > 1 ? 'PARLAY' : 'SINGLE'; }

function totalOdds() {
  let acc = 1;
  for (const s of selected.values()) acc *= Number(s.odds) || 1;
  return acc;
}

function betslipStake() {
  const n = Number(el('sb-stake')?.value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function renderBetslip() {
  const desktop = el('betslip-body');
  const sheet = el('sb-mobile-sheet');
  const dock = el('sb-mobile-dock');
  const isMobile = Boolean(dock && !dock.hidden && sheet && sheet.classList.contains('open'));
  const target = isMobile ? sheet : desktop;
  if (!target) return;

  if (!selected.size) {
    target.innerHTML = '<div class="sb-slip-empty">Pilih odds pada pertandingan untuk memasang taruhan.</div>';
    if (desktop && desktop !== target) desktop.innerHTML = '';
    if (sheet && sheet !== target) sheet.innerHTML = '';
    const mode = el('betslip-mode');
    if (mode) mode.textContent = '';
    return;
  }
  const stake = betslipStake();
  const odds = totalOdds();
  const est = Math.floor(stake * odds);
  const legs = [...selected.values()];
  const mode = el('betslip-mode');
  if (mode) mode.textContent = betType() === 'SINGLE' ? 'Single' : `Parlay · ${legs.length} leg`;

  target.innerHTML = `<div class="sb-slip-legs">${legs.map(slipLegHtml).join('')}</div>
    <div class="sb-slip-summary">
      <div class="sb-slip-row"><span>Jumlah pilihan</span><b>${legs.length}</b></div>
      <div class="sb-slip-row"><span>Total odds</span><b>${odds.toFixed(2)}</b></div>
      <div class="sb-slip-row"><span>Estimasi kemenangan</span><b class="sb-win" id="slip-est">${formatRupiah(est)}</b></div>
      <div id="slip-quote" class="sb-slip-quote"></div>
      <div id="sb-quote-error" class="sb-quote-error" hidden></div>
    </div>
    <div class="sb-slip-stake">
      <label class="sb-label" for="sb-stake">Nominal taruhan (Rp)</label>
      <input type="number" id="sb-stake" inputmode="numeric" min="${bettingConfig.minStake}" max="${bettingConfig.maxStake}" step="1000" value="${stake || bettingConfig.minStake}">
      <div class="sb-quick" role="group" aria-label="Quick stake">
        ${[10000, 25000, 50000, 100000].map((v) => `<button type="button" class="sb-quick-btn" data-quick="${v}">${fmt(v)}</button>`).join('')}
      </div>
      <div class="sb-slip-hint">Min ${formatRupiah(bettingConfig.minStake)} · Maks ${formatRupiah(bettingConfig.maxStake)}</div>
    </div>
    <button type="button" id="btn-place-bet" class="sb-btn sb-btn-primary sb-btn-block"${placing ? ' disabled' : ''}>${placing ? 'Memproses…' : 'Pasang Taruhan'}</button>
    <button type="button" id="btn-clear-slip" class="sb-btn sb-btn-ghost sb-btn-block sb-btn-sm">Kosongkan betslip</button>`;

  bindBetslipEvents(target);
  if (dock) {
    dock.hidden = false;
    const c = el('sb-dock-count');
    if (c) c.textContent = String(legs.length);
  }
  if (stake >= bettingConfig.minStake) requestQuote();
}

function slipLegHtml(s) {
  const key = selKey(s.eventId, s.marketId, s.selectionId);
  return `<div class="sb-slip-leg" data-key="${escapeHtml(key)}">
    <div class="sb-slip-leg-main">
      <span class="sb-slip-event">${escapeHtml(s.eventName)}</span>
      <span class="sb-slip-pick">${escapeHtml(s.selectionLabel)} <b>@ ${Number(s.odds).toFixed(2)}</b></span>
      <span class="sb-slip-market">${escapeHtml(s.marketLabel)}${s.marketPeriod === '1H' ? ' · HT' : ''}${s.marketLine ? ` (${escapeHtml(String(s.marketLine))})` : ''}</span>
    </div>
    <button type="button" class="sb-slip-remove" data-remove="${escapeHtml(key)}" aria-label="Hapus pilihan">×</button>
  </div>`;
}
// ---------------------------------------------------------------------------
// Server quote (odds lock) + place bet — real Gasterus endpoints only
// ---------------------------------------------------------------------------
let quoteInFlight = false;
let stakeTimer;

async function requestQuote() {
  if (quoteInFlight || !selected.size) return;
  const stake = betslipStake();
  if (stake < bettingConfig.minStake || stake > bettingConfig.maxStake) return;
  quoteInFlight = true;
  try {
    const payload = {
      betType: betType(),
      stake,
      oddsChangePolicy: 'REJECT',
      selections: [...selected.values()].map((s) => ({
        eventId: s.eventId,
        marketId: s.marketId,
        selectionId: s.selectionId,
        acceptedOdds: s.odds,
        acceptedPriceVersion: s.priceVersion
      }))
    };
    const res = await api.post('/member/sportsbook/quotes', payload);
    const q = res?.data || res;
    quote = q;
    renderQuote(q);
  } catch (err) {
    quote = null;
    showQuoteError(err?.message || 'Gagal membuat quote.');
  } finally {
    quoteInFlight = false;
  }
}

function renderQuote(q) {
  const host = el('slip-quote');
  if (!host) return;
  if (!q) { host.innerHTML = ''; return; }
  const expires = q.expiresAt ? new Date(q.expiresAt) : null;
  host.innerHTML = `<div class="sb-slip-row sb-quote-ok"><span>Quote server terkunci</span><b>${Number(q.totalOdds).toFixed(2)}</b></div>
    <div class="sb-slip-row"><span>Potensi bayar (server)</span><b class="sb-win">${formatRupiah(Number(q.potentialPayout || 0))}</b></div>
    ${expires ? `<div class="sb-slip-hint">Berlaku sampai ${expires.toLocaleTimeString('id-ID')}</div>` : ''}`;
  const err = el('sb-quote-error');
  if (err) err.hidden = true;
}

function showQuoteError(message) {
  const err = el('sb-quote-error');
  if (err) { err.hidden = false; err.textContent = message; }
  const host = el('slip-quote');
  if (host) host.innerHTML = '';
}
function bindBetslipEvents(root) {
  root.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', () => {
    selected.delete(b.getAttribute('data-remove'));
    quote = null;
    renderBetslip();
    renderAll();
  }));
  root.querySelectorAll('[data-quick]').forEach((b) => b.addEventListener('click', () => {
    const input = el('sb-stake');
    if (input) { input.value = b.getAttribute('data-quick'); onStakeChange(); }
  }));
  const stakeInput = el('sb-stake');
  if (stakeInput) stakeInput.addEventListener('input', onStakeChange);
  const place = el('btn-place-bet');
  if (place) place.addEventListener('click', placeBet);
  const clear = el('btn-clear-slip');
  if (clear) clear.addEventListener('click', () => { selected.clear(); quote = null; renderBetslip(); renderAll(); });
}

function onStakeChange() {
  const stake = betslipStake();
  const est = el('slip-est');
  if (est) est.textContent = formatRupiah(Math.floor(stake * totalOdds()));
  quote = null;
  const host = el('slip-quote');
  if (host) host.innerHTML = '';
  clearTimeout(stakeTimer);
  stakeTimer = setTimeout(() => { if (selected.size && stake >= bettingConfig.minStake) requestQuote(); }, 500);
}

async function placeBet() {
  if (placing || !selected.size) return;
  const stake = betslipStake();
  if (stake < bettingConfig.minStake) { showToast(`Minimal taruhan ${formatRupiah(bettingConfig.minStake)}.`, 'warning'); return; }
  if (stake > bettingConfig.maxStake) { showToast(`Maksimal taruhan ${formatRupiah(bettingConfig.maxStake)}.`, 'warning'); return; }
  if (bettingConfig.quoteRequired && !quote?.quoteToken) {
    showToast('Quote server belum siap. Coba lagi sebentar.', 'warning');
    return;
  }
  const btn = el('btn-place-bet');
  placing = true;
  if (btn) { btn.disabled = true; btn.textContent = 'Memproses…'; }
  try {
    const idempotencyKey = (crypto?.randomUUID)
      ? crypto.randomUUID()
      : `sb-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    const res = await api.post('/member/sportsbook/bets', { idempotencyKey, quoteToken: quote.quoteToken });
    const ticket = res?.data || res;
    selected.clear();
    quote = null;
    renderBetslip();
    renderAll();
    showToast(`Tiket ${ticket?.invoice || ''} berhasil dipasang!`, 'success');
    refreshTicketNote();
    try { await auth.fetchMe(); auth.updateHeaderAuthUI(); } catch { /* ignore */ }
  } catch (err) {
    const code = err?.data?.error?.code || '';
    if (code === 'SPORTSBOOK_ODDS_CHANGED' || code === 'SPORTSBOOK_ODDS_VERSION_CHANGED') {
      showToast('Odds telah berubah. Betslip diperbarui — tinjau kembali.', 'warning');
      quote = null;
      renderBetslip();
      renderAll();
    } else {
      showToast(err?.message || 'Gagal memasang taruhan.', 'danger');
    }
  } finally {
    placing = false;
    const b = el('btn-place-bet');
    if (b) { b.disabled = false; b.textContent = 'Pasang Taruhan'; }
  }
}

// Read-only ticket note (GET /api/member/sportsbook/bets)
async function refreshTicketNote() {
  try {
    const res = await api.get('/member/sportsbook/bets?limit=5');
    const items = res?.data?.items || res?.data || [];
    if (!Array.isArray(items) || !items.length) return;
    const st = el('sidebar-status');
    if (st) st.innerHTML = `${fmt(feed.source?.pricedMarkets || 0)} markets · ${items.length} tiket terakhir`;
  } catch { /* informational only */ }
}

// ---------------------------------------------------------------------------
// Mobile dock / sheet
// ---------------------------------------------------------------------------
function setupMobileDock() {
  const dock = el('sb-mobile-dock');
  const trigger = el('sb-dock-trigger');
  const sheet = el('sb-mobile-sheet');
  if (!dock || !trigger || !sheet) return;
  trigger.addEventListener('click', () => {
    const open = sheet.classList.toggle('open');
    trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) renderBetslip();
  });
  document.addEventListener('click', (e) => {
    if (!sheet.classList.contains('open')) return;
    if (sheet.contains(e.target) || trigger.contains(e.target)) return;
    sheet.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    sheet.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
    const backdrop = el('sb-detail-backdrop');
    if (backdrop) backdrop.hidden = true;
  });
}

// Auto init
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSportsbook);
} else {
  initSportsbook();
}
}