/**
 * Gasterus v3 — Sportsbook Feed & Betslip Logic
 */

import api from './api.js';
import auth from './auth.js';
import { formatRupiah, showToast } from './utils.js';

let allEvents = [];
let activeSelection = null; // single bet selection { eventId, match, marketType, selectionName, odds }

export async function initSportsbook() {
  auth.updateHeaderAuthUI();
  setupFilterTabs();
  setupBetslip();
  await loadSportsbookEvents();
}

async function loadSportsbookEvents(filter = 'ALL') {
  const container = document.getElementById('matches-list-container');
  if (!container) return;

  try {
    const res = await api.get('/member/sportsbook/events');
    allEvents = res.events || res.data || res || [];
    renderEvents(allEvents, filter);
  } catch (err) {
    console.warn('Live sportsbook feed offline, using mock matches', err);
    allEvents = [
      {
        id: 'match-1',
        league: 'English Premier League',
        homeTeam: 'Arsenal',
        awayTeam: 'Chelsea',
        status: 'LIVE',
        liveMinute: '34\'',
        score: '1 - 0',
        odds1X2: { home: 1.85, draw: 3.40, away: 4.20 },
        oddsTotals: { over: 1.92, under: 1.88, line: '2.5' }
      },
      {
        id: 'match-2',
        league: 'English Premier League',
        homeTeam: 'Manchester City',
        awayTeam: 'Liverpool',
        status: 'UPCOMING',
        kickoff: '23:30',
        score: 'VS',
        odds1X2: { home: 2.10, draw: 3.60, away: 3.10 },
        oddsTotals: { over: 1.75, under: 2.05, line: '3.0' }
      },
      {
        id: 'match-3',
        league: 'Spanish La Liga',
        homeTeam: 'Real Madrid',
        awayTeam: 'Barcelona',
        status: 'UPCOMING',
        kickoff: '02:00',
        score: 'VS',
        odds1X2: { home: 2.25, draw: 3.50, away: 2.90 },
        oddsTotals: { over: 1.80, under: 1.95, line: '2.5' }
      },
      {
        id: 'match-4',
        league: 'Italian Serie A',
        homeTeam: 'Inter Milan',
        awayTeam: 'AC Milan',
        status: 'LIVE',
        liveMinute: '68\'',
        score: '2 - 1',
        odds1X2: { home: 1.45, draw: 4.50, away: 6.00 },
        oddsTotals: { over: 1.65, under: 2.15, line: '3.5' }
      }
    ];
    renderEvents(allEvents, filter);
  }
}

function renderEvents(events, filter) {
  const container = document.getElementById('matches-list-container');
  if (!container) return;

  let filtered = events;
  if (filter === 'LIVE') {
    filtered = events.filter(e => e.status === 'LIVE' || e.isLive);
  } else if (filter === 'UPCOMING') {
    filtered = events.filter(e => e.status !== 'LIVE' && !e.isLive);
  }

  if (!filtered.length) {
    container.innerHTML = `<div class="card" style="text-align:center; padding:40px; color:var(--text-muted);">Tidak ada pertandingan yang tersedia saat ini.</div>`;
    return;
  }

  // Group by league
  const groups = {};
  filtered.forEach(item => {
    const lg = item.league || 'Liga Internasional';
    if (!groups[lg]) groups[lg] = [];
    groups[lg].push(item);
  });

  let html = '';
  for (const [league, matches] of Object.entries(groups)) {
    html += `
      <div class="league-group-header">
        <span>⚽ ${league}</span>
        <span style="font-size: 0.75rem; color: var(--text-secondary);">${matches.length} Laga</span>
      </div>
    `;

    matches.forEach(m => {
      const isLive = m.status === 'LIVE' || m.isLive;
      const statusBadge = isLive
        ? `<span class="badge badge-danger"><span class="live-indicator"></span> LIVE ${m.liveMinute || ''}</span>`
        : `<span class="badge badge-info">${m.kickoff || 'Hari ini'}</span>`;

      const odds1 = m.odds1X2?.home || 1.95;
      const oddsX = m.odds1X2?.draw || 3.30;
      const odds2 = m.odds1X2?.away || 3.80;

      html += `
        <div class="match-card fade-in" data-match-id="${m.id}">
          <div class="match-header-row">
            <span>Sepakbola</span>
            ${statusBadge}
          </div>

          <div class="match-teams-grid">
            <div class="teams-list">
              <div class="team-row">
                <span>🔴</span>
                <span>${m.homeTeam}</span>
              </div>
              <div class="team-row">
                <span>🔵</span>
                <span>${m.awayTeam}</span>
              </div>
            </div>
            <div class="match-score">${m.score || 'VS'}</div>
          </div>

          <!-- Market 1X2 Odds Buttons -->
          <div style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 4px;">Pasaran 1X2 (Full Time)</div>
          <div class="odds-row">
            <button type="button" class="odd-btn" onclick="window.selectOdd('${m.id}', '${m.homeTeam} vs ${m.awayTeam}', '1X2', 'Home (${m.homeTeam})', ${odds1})">
              <span class="odd-label">1 (Home)</span>
              <span class="odd-rate">${odds1.toFixed(2)}</span>
            </button>
            <button type="button" class="odd-btn" onclick="window.selectOdd('${m.id}', '${m.homeTeam} vs ${m.awayTeam}', '1X2', 'Draw (Seri)', ${oddsX})">
              <span class="odd-label">X (Draw)</span>
              <span class="odd-rate">${oddsX.toFixed(2)}</span>
            </button>
            <button type="button" class="odd-btn" onclick="window.selectOdd('${m.id}', '${m.homeTeam} vs ${m.awayTeam}', '1X2', 'Away (${m.awayTeam})', ${odds2})">
              <span class="odd-label">2 (Away)</span>
              <span class="odd-rate">${odds2.toFixed(2)}</span>
            </button>
          </div>
        </div>
      `;
    });
  }

  container.innerHTML = html;
}

window.selectOdd = function(eventId, match, marketType, selectionName, odds) {
  if (!auth.isLoggedIn()) {
    if (window.openLoginModal) window.openLoginModal();
    else window.location.href = '/index.html';
    return;
  }

  activeSelection = { eventId, match, marketType, selectionName, odds };

  // Highlight button
  document.querySelectorAll('.odd-btn').forEach(btn => btn.classList.remove('selected'));
  if (event && event.currentTarget) {
    event.currentTarget.classList.add('selected');
  }

  renderBetslip();
};

function renderBetslip() {
  const content = document.getElementById('betslip-content');
  const emptyMsg = document.getElementById('betslip-empty');
  const stakeInput = document.getElementById('sports-stake-input');
  const submitBtn = document.getElementById('btn-place-sports-bet');

  if (!activeSelection) {
    if (content) content.style.display = 'none';
    if (emptyMsg) emptyMsg.style.display = 'block';
    if (submitBtn) submitBtn.disabled = true;
    return;
  }

  if (emptyMsg) emptyMsg.style.display = 'none';
  if (content) content.style.display = 'block';
  if (submitBtn) submitBtn.disabled = false;

  document.getElementById('slip-match-name').textContent = activeSelection.match;
  document.getElementById('slip-selection-name').textContent = `${activeSelection.selectionName} @ ${activeSelection.odds.toFixed(2)}`;

  updatePayout();
}

function updatePayout() {
  if (!activeSelection) return;
  const stakeInput = document.getElementById('sports-stake-input');
  const payoutEl = document.getElementById('slip-est-payout');
  const stake = Number(stakeInput?.value) || 0;
  const est = Math.round(stake * activeSelection.odds);
  if (payoutEl) payoutEl.textContent = formatRupiah(est);
}

function setupBetslip() {
  const stakeInput = document.getElementById('sports-stake-input');
  if (stakeInput) {
    stakeInput.addEventListener('input', updatePayout);
  }

  const submitBtn = document.getElementById('btn-place-sports-bet');
  if (submitBtn) {
    submitBtn.addEventListener('click', handleSportsBetSubmit);
  }
}

async function handleSportsBetSubmit() {
  if (!activeSelection) return;

  const stakeInput = document.getElementById('sports-stake-input');
  const stake = Number(stakeInput.value);

  if (!stake || stake < 10000) {
    showToast('Minimal taruhan sportsbook adalah Rp 10.000.', 'warning');
    return;
  }

  const user = auth.getUser();
  if (user && user.balance < stake) {
    showToast('Saldo Anda tidak mencukupi untuk memasang taruhan ini.', 'danger');
    return;
  }

  const payload = {
    eventId: activeSelection.eventId,
    marketType: activeSelection.marketType,
    selection: activeSelection.selectionName,
    odds: activeSelection.odds,
    stake
  };

  const submitBtn = document.getElementById('btn-place-sports-bet');
  try {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Memasang Taruhan...';

    await api.post('/member/sportsbook/bets', payload);
    showToast('Tiket taruhan sportsbook berhasil dikonfirmasi!', 'success');
    await auth.fetchMe();
    auth.updateHeaderAuthUI();

    activeSelection = null;
    renderBetslip();
  } catch (err) {
    showToast(err.message || 'Gagal memasang taruhan sportsbook.', 'danger');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Pasang Taruhan Sekarang';
  }
}

function setupFilterTabs() {
  document.querySelectorAll('.sport-filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.sport-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const filter = btn.getAttribute('data-filter') || 'ALL';
      renderEvents(allEvents, filter);
    });
  });
}

// Auto init
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSportsbook);
} else {
  initSportsbook();
}
