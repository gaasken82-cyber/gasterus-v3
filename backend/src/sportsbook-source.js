import crypto from 'node:crypto';
import { config } from './config.js';
import { AppError } from './errors.js';
import { logger } from './logger.js';
import { browserRendererStatus, renderSportsbookPage } from './sportsbook-browser-renderer.js';

const CACHE_TTL_MS = config.sportsSourceRefreshSeconds * 1000;
const MAX_EVENTS = 1500;
const MAX_HTML_BYTES = 8 * 1024 * 1024;
const EVENT_KEYS = new Set([
  'eventid','event_id','matchid','match_id','fixtureid','fixture_id','gameid','game_id',
  'home','hometeam','home_team','homename','home_name','team1','host',
  'away','awayteam','away_team','awayname','away_name','team2','guest',
  'participants','competitors','teams','contestants'
]);

let cache = {
  value: null,
  fetchedAt: 0,
  expiresAt: 0,
  error: null
};
let inFlight = null;
let sourceSessionCookie = '';
const eventDetailCache = new Map();
const scheduleIndexCache = new Map();

function text(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  return String(value).replace(/\s+/g, ' ').trim();
}
function finite(value) {
  const normalized = String(value ?? '').replace(',', '.').replace(/[^0-9.+-]/g, '');
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}
function first(object, keys, fallback = null) {
  if (!object || typeof object !== 'object') return fallback;
  const entries = Object.entries(object);
  for (const key of keys) {
    const direct = object[key];
    if (direct !== undefined && direct !== null && direct !== '') return direct;
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    const found = entries.find(([name]) => name.toLowerCase().replace(/[^a-z0-9]/g, '') === normalized);
    if (found && found[1] !== undefined && found[1] !== null && found[1] !== '') return found[1];
  }
  return fallback;
}
function slug(value) {
  return text(value).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90);
}
function stableId(parts) {
  return crypto.createHash('sha256').update(parts.map(value => text(value)).join('|')).digest('hex').slice(0, 24);
}
function normalizeSport(value) {
  const raw = text(value, 'Football');
  const key = raw.toLowerCase();
  if (/basket|nba/.test(key)) return 'Basketball';
  if (/tennis|atp|wta/.test(key)) return 'Tennis';
  if (/esport|e-sport|dota|counter|valorant|league of legends/.test(key)) return 'Esports';
  if (/hockey|nhl/.test(key)) return 'Ice Hockey';
  if (/baseball|mlb/.test(key)) return 'Baseball';
  return /soccer|football|bola/.test(key) ? 'Football' : raw;
}
function normalizeStatus(value, liveHint = false) {
  const raw = text(value, liveHint ? 'LIVE' : 'SCHEDULED');
  const key = raw.toLowerCase();
  if (liveHint || /live|in.?play|running|1st|2nd|half|quarter|period/.test(key)) return 'LIVE';
  if (/finish|ended|full.?time|settled|closed/.test(key)) return 'FINISHED';
  if (/cancel|postpone|suspend|abandon/.test(key)) return 'SUSPENDED';
  return 'SCHEDULED';
}
function normalizeStartTime(value) {
  const raw = text(value);
  if (!raw) return null;
  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : raw.slice(0, 80);
}
function parseScore(value) {
  if (Array.isArray(value) && value.length >= 2) return [finite(value[0]), finite(value[1])];
  if (value && typeof value === 'object') {
    return [
      finite(first(value, ['home','homeScore','scoreHome','team1'], null)),
      finite(first(value, ['away','awayScore','scoreAway','team2'], null))
    ];
  }
  const match = text(value).match(/(\d+)\s*[-:]\s*(\d+)/);
  return match ? [Number(match[1]), Number(match[2])] : [null, null];
}
function normalizePeriod(value, label = '') {
  const raw = `${text(value)} ${text(label)}`.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_');
  if (/(?:^|_)h1(?:_|$)|first_half|1st_half|firsthalf|half_time(?!_full)|halftime(?!_full)|babak_pertama|paruh_pertama|setengah_pertama|babak_1(?:_|$)/.test(raw)) return '1H';
  if (/(?:^|_)h2(?:_|$)|second_half|2nd_half|secondhalf|babak_kedua|paruh_kedua|setengah_kedua|babak_2(?:_|$)/.test(raw)) return '2H';
  if (/(?:^|_)q1(?:_|$)|first_quarter|1st_quarter/.test(raw)) return 'Q1';
  if (/(?:^|_)q2(?:_|$)|second_quarter|2nd_quarter/.test(raw)) return 'Q2';
  if (/(?:^|_)q3(?:_|$)|third_quarter|3rd_quarter/.test(raw)) return 'Q3';
  if (/(?:^|_)q4(?:_|$)|fourth_quarter|4th_quarter/.test(raw)) return 'Q4';
  return 'FT';
}
function marketTypeFromLabel(value) {
  const raw = text(value).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  if (/\b1x2\b|match result|full time result|moneyline|pemenang pertandingan|hasil pertandingan/.test(raw)) return '1X2';
  if (/asian handicap|handicap asia|\bhandicap\b|\bhdp\b|\bspread\b/.test(raw)) return 'HANDICAP';
  if (/over under|\bover\b|\bunder\b|\btotal(?:s)?\b|goal line|jumlah gol|total gol|atas bawah/.test(raw)) return 'TOTALS';
  if (/both teams.*score|btts|kedua tim.*cetak|kedua tim.*gol/.test(raw)) return 'BTTS';
  if (/double chance|peluang ganda/.test(raw)) return 'DOUBLE_CHANCE';
  if (/half time full time|halftime fulltime|ht ft|babak pertama.*hasil akhir/.test(raw)) return 'HT_FT';
  if (/correct score|skor tepat|skor benar/.test(raw)) return 'CORRECT_SCORE';
  if (/draw no bet|seri tidak dihitung|tanpa seri/.test(raw)) return 'DRAW_NO_BET';
  if (/odd even|ganjil genap/.test(raw)) return 'ODD_EVEN';
  if (/team total|total tim/.test(raw)) return 'TEAM_TOTALS';
  if (/corner|tendangan sudut/.test(raw)) return 'CORNERS';
  if (/card|kartu/.test(raw)) return 'CARDS';
  if (/first goal|gol pertama/.test(raw)) return 'FIRST_GOAL';
  return 'OTHER';
}
function oddSelection(label, odds, key = label, handicap = null) {
  const price = finite(odds);
  if (price === null || price <= 1 || price > 10000) return null;
  return { key: slug(key) || stableId([label, price]), label: text(label), odds: price, handicap: text(handicap) || null };
}
function compactSelections(items) {
  const seen = new Set();
  return items.filter(Boolean).filter(item => {
    const key = `${item.key}|${item.odds}|${item.handicap ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 20);
}
function market(type, label, line, selections, idHint = '', period = '') {
  const clean = compactSelections(selections);
  if (!clean.length) return null;
  const resolvedPeriod = normalizePeriod(period, label);
  return {
    id: slug(idHint) || stableId([type, label, resolvedPeriod, line, ...clean.map(item => `${item.key}:${item.odds}`)]),
    type: text(type, 'OTHER').toUpperCase(),
    label: text(label, type || 'Market'),
    period: resolvedPeriod,
    line: text(line) || null,
    selections: clean
  };
}
function normalizeMarketObject(raw, index = 0) {
  if (!raw || typeof raw !== 'object') return null;
  const label = text(first(raw, ['name','marketName','market','label','type','betType'], `Market ${index + 1}`));
  const typeKey = label.toLowerCase();
  const line = first(raw, ['line','handicap','total','points','hdp'], null);
  const sourceSelections = first(raw, ['selections','outcomes','prices','odds','options','runners'], null);
  const selections = [];

  if (Array.isArray(sourceSelections)) {
    sourceSelections.forEach((selection, selectionIndex) => {
      if (typeof selection === 'number' || typeof selection === 'string') {
        selections.push(oddSelection(`Selection ${selectionIndex + 1}`, selection));
        return;
      }
      if (!selection || typeof selection !== 'object') return;
      selections.push(oddSelection(
        first(selection, ['name','label','selectionName','outcome','team','side'], `Selection ${selectionIndex + 1}`),
        first(selection, ['odds','price','decimal','value','rate'], null),
        first(selection, ['key','code','id','selectionId','outcomeId'], `selection-${selectionIndex + 1}`),
        first(selection, ['handicap','line','points'], null)
      ));
    });
  } else if (sourceSelections && typeof sourceSelections === 'object') {
    Object.entries(sourceSelections).forEach(([name, value]) => {
      if (value && typeof value === 'object') {
        selections.push(oddSelection(name, first(value, ['odds','price','decimal','value'], null), name, first(value, ['handicap','line'], null)));
      } else {
        selections.push(oddSelection(name, value, name));
      }
    });
  }

  const homeOdds = first(raw, ['homeOdds','oddsHome','homePrice','priceHome','one'], null);
  const drawOdds = first(raw, ['drawOdds','oddsDraw','drawPrice','priceDraw','x'], null);
  const awayOdds = first(raw, ['awayOdds','oddsAway','awayPrice','priceAway','two'], null);
  if ([homeOdds, drawOdds, awayOdds].some(value => finite(value) !== null)) {
    selections.push(oddSelection('Home', homeOdds, 'home'));
    selections.push(oddSelection('Draw', drawOdds, 'draw'));
    selections.push(oddSelection('Away', awayOdds, 'away'));
  }

  const overOdds = first(raw, ['overOdds','oddsOver','overPrice','priceOver'], null);
  const underOdds = first(raw, ['underOdds','oddsUnder','underPrice','priceUnder'], null);
  if ([overOdds, underOdds].some(value => finite(value) !== null)) {
    selections.push(oddSelection(`Over${line !== null ? ` ${line}` : ''}`, overOdds, 'over', line));
    selections.push(oddSelection(`Under${line !== null ? ` ${line}` : ''}`, underOdds, 'under', line));
  }

  const type = marketTypeFromLabel(typeKey);

  const period = first(raw, ['period','periodName','timePeriod','segment','half'], '');
  return market(type, label, line, selections, first(raw, ['id','marketId','code'], ''), period);
}
function inferMarkets(raw) {
  const markets = [];
  const source = first(raw, ['markets','market','betOffers','betoffers','odds','prices'], null);
  if (Array.isArray(source)) source.forEach((item, index) => markets.push(normalizeMarketObject(item, index)));
  else if (source && typeof source === 'object') {
    Object.entries(source).forEach(([name, item], index) => {
      if (item && typeof item === 'object') markets.push(normalizeMarketObject({ name, ...item }, index));
    });
  }

  markets.push(normalizeMarketObject({
    name: '1X2',
    homeOdds: first(raw, ['homeOdds','oddsHome','homePrice','priceHome'], null),
    drawOdds: first(raw, ['drawOdds','oddsDraw','drawPrice','priceDraw'], null),
    awayOdds: first(raw, ['awayOdds','oddsAway','awayPrice','priceAway'], null)
  }));
  markets.push(normalizeMarketObject({
    name: 'Over / Under',
    line: first(raw, ['total','totalLine','overUnderLine','ouLine'], null),
    overOdds: first(raw, ['overOdds','oddsOver','overPrice'], null),
    underOdds: first(raw, ['underOdds','oddsUnder','underPrice'], null)
  }));

  const handicapLine = first(raw, ['handicap','handicapLine','asianHandicap','spread'], null);
  const handicapHome = first(raw, ['handicapHomeOdds','homeHandicapOdds','spreadHomeOdds'], null);
  const handicapAway = first(raw, ['handicapAwayOdds','awayHandicapOdds','spreadAwayOdds'], null);
  markets.push(market('HANDICAP', 'Asian Handicap', handicapLine, [
    oddSelection(`Home${handicapLine !== null ? ` ${handicapLine}` : ''}`, handicapHome, 'home-handicap', handicapLine),
    oddSelection(`Away${handicapLine !== null ? ` ${handicapLine}` : ''}`, handicapAway, 'away-handicap', handicapLine)
  ]));

  const seen = new Set();
  return markets.filter(Boolean).filter(item => {
    const key = `${item.type}|${item.label}|${item.line ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 40);
}
function participantPair(raw) {
  const participants = first(raw, ['participants','competitors','teams','contestants'], null);
  if (!Array.isArray(participants) || participants.length < 2) return [null, null];
  const side = item => text(first(item, ['side','homeAway','home_away','type','position','role'], '')).toLowerCase();
  const named = item => item && typeof item === 'object' ? first(item, ['name','teamName','participantName','shortName','label'], item) : item;
  const home = participants.find(item => /^(home|host|1)$/.test(side(item))) || participants[0];
  const away = participants.find(item => /^(away|guest|2)$/.test(side(item))) || participants.find(item => item !== home) || participants[1];
  return [named(home), named(away)];
}
function normalizeEvent(raw, index = 0, context = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const [participantHome, participantAway] = participantPair(raw);
  const homeRaw = first(raw, ['home','homeTeam','home_team','homeName','home_name','team1','host','participant1'], participantHome);
  const awayRaw = first(raw, ['away','awayTeam','away_team','awayName','away_name','team2','guest','participant2'], participantAway);
  const homeName = text(homeRaw && typeof homeRaw === 'object' ? first(homeRaw, ['name','teamName','participantName','shortName'], '') : homeRaw);
  const awayName = text(awayRaw && typeof awayRaw === 'object' ? first(awayRaw, ['name','teamName','participantName','shortName'], '') : awayRaw);
  if (!homeName || !awayName || homeName === awayName) return null;

  const scoreRaw = first(raw, ['score','scores','result','currentScore'], null);
  const [parsedHomeScore, parsedAwayScore] = parseScore(scoreRaw);
  const homeScore = finite(first(raw, ['homeScore','scoreHome','home_score'], parsedHomeScore));
  const awayScore = finite(first(raw, ['awayScore','scoreAway','away_score'], parsedAwayScore));
  const statusRaw = first(raw, ['status','matchStatus','gameStatus','state','phase'], '');
  const liveHint = Boolean(first(raw, ['live','isLive','inPlay','isInPlay'], false)) || homeScore !== null || awayScore !== null;
  const status = normalizeStatus(statusRaw, liveHint && !/finish|ended|full.?time/i.test(text(statusRaw)));
  const league = text(first(raw, ['league','leagueName','competition','competitionName','tournament','tournamentName'], context.league || 'Other'));
  const sport = normalizeSport(first(raw, ['sport','sportName','sportType','category'], context.sport || 'Football'));
  const startTime = normalizeStartTime(first(raw, ['startTime','startDate','kickoff','kickOff','date','eventTime','matchTime'], null));
  const id = text(first(raw, ['eventId','event_id','matchId','match_id','fixtureId','fixture_id','gameId','game_id','id'], '')) || stableId([sport, league, homeName, awayName, startTime, index]);
  const markets = inferMarkets(raw);
  if (!markets.length && !liveHint && !startTime) return null;

  return {
    id: slug(id) || stableId([id]),
    sourceId: text(id),
    sport,
    league,
    startTime,
    status,
    live: status === 'LIVE',
    clock: text(first(raw, ['clock','minute','timer','elapsed','period'], '')) || null,
    home: { name: homeName, score: homeScore },
    away: { name: awayName, score: awayScore },
    markets
  };
}
function objectLooksLikeEvent(object) {
  if (!object || typeof object !== 'object' || Array.isArray(object)) return false;
  const keys = Object.keys(object).map(key => key.toLowerCase().replace(/[^a-z0-9_]/g, ''));
  const eventKeyCount = keys.filter(key => EVENT_KEYS.has(key)).length;
  const hasHome = keys.some(key => /^(home|hometeam|home_team|homename|home_name|team1|host|participant1)$/.test(key));
  const hasAway = keys.some(key => /^(away|awayteam|away_team|awayname|away_name|team2|guest|participant2)$/.test(key));
  const participants = first(object, ['participants','competitors','teams','contestants'], null);
  const hasParticipantPair = Array.isArray(participants) && participants.length >= 2;
  return eventKeyCount >= 2 && ((hasHome && hasAway) || hasParticipantPair);
}
function collectEventObjects(value, output, depth = 0, context = {}) {
  if (depth > 9 || output.length >= MAX_EVENTS * 3 || value === null || value === undefined) return;
  if (Array.isArray(value)) {
    value.forEach(item => collectEventObjects(item, output, depth + 1, context));
    return;
  }
  if (typeof value !== 'object') return;
  const nextContext = {
    sport: first(value, ['sport','sportName','category'], context.sport),
    league: first(value, ['league','leagueName','competition','tournament'], context.league)
  };
  if (objectLooksLikeEvent(value)) output.push({ value, context: nextContext });
  Object.values(value).forEach(item => collectEventObjects(item, output, depth + 1, nextContext));
}
function balancedJsonCandidates(source) {
  const candidates = [];
  const starts = [];
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{' || char === '[') starts.push(index);
  }
  for (const start of starts.slice(0, 1800)) {
    const opening = source[start];
    const closing = opening === '{' ? '}' : ']';
    let depth = 0;
    let quote = null;
    let escaped = false;
    for (let index = start; index < Math.min(source.length, start + 2_000_000); index += 1) {
      const char = source[index];
      if (quote) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === quote) quote = null;
        continue;
      }
      if (char === '"' || char === "'") { quote = char; continue; }
      if (char === opening) depth += 1;
      if (char === closing) depth -= 1;
      if (depth === 0) {
        const raw = source.slice(start, index + 1);
        if (raw.length >= 20 && raw.length <= 2_000_000) candidates.push(raw);
        break;
      }
    }
    if (candidates.length >= 120) break;
  }
  return candidates;
}
function decodeHtml(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}
function stripTags(value) {
  return text(decodeHtml(String(value || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')));
}
function attrValue(tag, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(tag || '').match(new RegExp(`\\s${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return decodeHtml(match?.[1] ?? match?.[2] ?? match?.[3] ?? '');
}
function classFragmentText(html, classNames) {
  for (const className of classNames) {
    const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`<[^>]+class=["'][^"']*\\b${escaped}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`, 'i');
    const match = String(html || '').match(pattern);
    if (match) {
      const value = stripTags(match[1]);
      if (value) return value;
    }
  }
  return '';
}
function parseJsonEvents(html) {
  const sources = [];
  for (const match of String(html || '').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    const content = match[1] || '';
    if (/home|away|match|event|fixture|odds|market/i.test(content)) sources.push(content);
  }
  for (const match of String(html || '').matchAll(/\sdata-(?:events|matches|fixtures|odds)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    sources.push(decodeHtml(match[1] ?? match[2] ?? ''));
  }

  const objects = [];
  for (const source of sources.slice(0, 120)) {
    const candidates = balancedJsonCandidates(source);
    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate);
        collectEventObjects(parsed, objects);
      } catch {
        // Ignore JavaScript object literals that are not strict JSON.
      }
      if (objects.length >= MAX_EVENTS * 3) break;
    }
    if (objects.length >= MAX_EVENTS * 3) break;
  }
  return objects.map((item, index) => normalizeEvent(item.value, index, item.context)).filter(Boolean);
}

const SB_MONTHS = Object.freeze({ jan: 0, feb: 1, mar: 2, apr: 3, mei: 4, may: 4, jun: 5, jul: 6, agu: 7, aug: 7, sep: 8, okt: 9, oct: 9, nov: 10, des: 11, dec: 11 });
function sbDateTime(value, yearHint = new Date().getUTCFullYear()) {
  const raw = stripTags(value);
  const match = raw.match(/\b([A-Za-z]{3})\s+(\d{1,2})\s+(\d{1,2}):(\d{2})\b/);
  if (!match) return null;
  const month = SB_MONTHS[match[1].toLowerCase()];
  if (month === undefined) return null;
  // Source display uses WIB. Convert the source local clock to UTC.
  return new Date(Date.UTC(Number(yearHint), month, Number(match[2]), Number(match[3]) - 7, Number(match[4]))).toISOString();
}
function sbOdds(rowHtml) {
  const out = [];
  const pattern = /<(a|span)\b([^>]*class=["'][^"']*OddsTab[^"']*["'][^>]*)>([\s\S]*?)<\/\1>/gi;
  for (const match of String(rowHtml || '').matchAll(pattern)) {
    const body = match[3] || '';
    const label = classFragmentText(body, ['OddsL']);
    const price = finite(classFragmentText(body, ['OddsR']));
    const line = classFragmentText(body, ['OddsM']) || null;
    if (!label || price === null || price <= 1) continue;
    out.push({ label, price, line });
  }
  return out;
}
function parseSbobetHtmlEvents(html) {
  const source = String(html || '');
  if (!/\bOddsTab[LR]?\b/i.test(source) || !/bu:od:(?:afa:ev|go:ev):/i.test(source)) return [];
  const yearHint = Number(source.match(/\/(20\d{2})-\d{2}-\d{2}/)?.[1] || new Date().getUTCFullYear());
  const tokens = [];
  for (const match of source.matchAll(/<div\b[^>]*class=["'][^"']*\bSubHead\b[^"']*["'][^>]*>[\s\S]{0,600}?<span[^>]*>([\s\S]*?)<\/span>/gi)) {
    tokens.push({ index: match.index, type: 'market', value: stripTags(match[1]) });
  }
  for (const match of source.matchAll(/<div\b[^>]*class=["'][^"']*\bSubHeadT\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi)) {
    tokens.push({ index: match.index, type: 'league', value: stripTags(match[1]) });
  }
  for (const match of source.matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi)) {
    if (!/bu:od:(?:afa:ev|go:ev):\d+/i.test(match[2])) continue;
    tokens.push({ index: match.index, type: 'row', tag: match[1] || '', body: match[2] || '' });
  }
  tokens.sort((a, b) => a.index - b.index);
  let currentMarket = '';
  let currentLeague = 'Other';
  const events = new Map();
  for (const token of tokens) {
    if (token.type === 'market') { currentMarket = token.value; continue; }
    if (token.type === 'league') { currentLeague = token.value || 'Other'; continue; }
    const id = token.body.match(/bu:od:(?:afa:ev|go:ev):(\d+)/i)?.[1];
    if (!id) continue;
    const odds = sbOdds(token.body);
    if (!odds.length) continue;
    const dtRaw = classFragmentText(token.body, ['DateTimeTxt']);
    const scoreMatch = dtRaw.match(/\b(\d+)\s*-\s*(\d+)\b/);
    const live = Boolean(scoreMatch || /\b(?:HT|[12]H\s*\d*'?|LIVE)\b/i.test(dtRaw));
    const startTime = live ? null : sbDateTime(dtRaw, yearHint);
    const eventLinkMatch = token.body.match(new RegExp(`<a\\b([^>]*id=[\"']bu:od:go:ev:${id}[\"'][^>]*)>([\\s\\S]*?)<\\/a>`, 'i'));
    const eventLink = eventLinkMatch ? attrValue(eventLinkMatch[1], 'href') : (token.body.match(/href=["']([^"']*\/([0-9]+)\/[^"']*(?:-vs-|%2Dvs%2D)[^"']*)["']/i)?.[1] || '');
    const marketCount = eventLinkMatch ? Number(stripTags(eventLinkMatch[2]).match(/\d+/)?.[0] || 0) : 0;
    const marketTitle = currentMarket || 'Main Market';
    let event = events.get(id);
    let home = event?.home?.name || '';
    let away = event?.away?.name || '';
    const labels = odds.map(item => item.label).filter(label => !/^seri$|^draw$/i.test(label));
    if (!home && labels[0]) home = labels[0];
    if (!away && labels.at(-1)) away = labels.at(-1);
    if (!home || !away || home === away) continue;
    if (!event) {
      event = {
        id,
        sourceId: id,
        sport: 'Football',
        league: currentLeague,
        startTime,
        status: live ? 'LIVE' : 'SCHEDULED',
        live,
        clock: live ? dtRaw.replace(/^\d+\s*-\s*\d+\s*/, '') || null : null,
        home: { name: home, score: scoreMatch ? Number(scoreMatch[1]) : null },
        away: { name: away, score: scoreMatch ? Number(scoreMatch[2]) : null },
        markets: [],
        sourceUrl: eventLink || null,
        availableMarketCount: marketCount || null
      };
      events.set(id, event);
    } else {
      if (currentLeague && event.league === 'Other') event.league = currentLeague;
      if (!event.startTime && startTime) event.startTime = startTime;
      if (!event.sourceUrl && eventLink) event.sourceUrl = eventLink;
      if (marketCount) event.availableMarketCount = Math.max(Number(event.availableMarketCount || 0), marketCount);
      if (live) {
        event.live = true; event.status = 'LIVE'; event.clock ||= dtRaw.replace(/^\d+\s*-\s*\d+\s*/, '') || null;
        if (scoreMatch) { event.home.score = Number(scoreMatch[1]); event.away.score = Number(scoreMatch[2]); }
      }
    }
    const type = marketTypeFromLabel(marketTitle);
    const line = odds.map(item => item.line).find(Boolean) || null;
    const offerId = token.tag.match(/id=["']bu:od:or:([^"']+)/i)?.[1] || stableId([id, marketTitle, line, event.markets.length]);
    const selections = odds.map((item, index) => {
      let keyName = slug(item.label) || `selection-${index + 1}`;
      if (type === '1X2') keyName = /^seri$|^draw$/i.test(item.label) ? 'draw' : item.label === home ? 'home' : item.label === away ? 'away' : keyName;
      else if (type === 'HANDICAP') keyName = item.label === home ? 'home' : item.label === away ? 'away' : keyName;
      return oddSelection(item.label, item.price, keyName, item.line);
    });
    const parsedMarket = market(type, marketTitle, line, selections, `${id}-${offerId}-${type}`, normalizePeriod('', marketTitle));
    if (parsedMarket && !event.markets.some(existing => existing.id === parsedMarket.id)) event.markets.push(parsedMarket);
  }
  return [...events.values()].filter(event => event.markets.length);
}
function parseHtmlMarkets(rowHtml) {
  const grouped = new Map();
  const oddPattern = /<([a-z0-9]+)\b([^>]*(?:data-odd|data-odds|data-price|data-selection|class=["'][^"']*(?:odd|price)[^"']*["'])[^>]*)>([\s\S]*?)<\/\1>/gi;
  let index = 0;
  for (const match of String(rowHtml || '').matchAll(oddPattern)) {
    const tag = match[2] || '';
    const body = match[3] || '';
    const rawValue = attrValue(tag, 'data-odd') || attrValue(tag, 'data-odds') || attrValue(tag, 'data-price') || classFragmentText(body, ['value','price','odd-value']) || stripTags(body);
    const odds = finite(rawValue);
    if (odds === null || odds <= 1 || odds > 10000) continue;
    const visible = stripTags(body);
    const label = text(attrValue(tag, 'data-selection') || attrValue(tag, 'data-label') || attrValue(tag, 'title') || visible.replace(String(rawValue), ''), `Selection ${index + 1}`);
    const marketName = text(attrValue(tag, 'data-market') || attrValue(tag, 'data-market-name'), 'Main Market');
    const line = text(attrValue(tag, 'data-line') || attrValue(tag, 'data-handicap')) || null;
    const list = grouped.get(marketName) || [];
    list.push(oddSelection(label, odds, attrValue(tag, 'data-selection-id') || label, line));
    grouped.set(marketName, list);
    index += 1;
  }
  const markets = [];
  for (const [name, selections] of grouped) {
    const type = marketTypeFromLabel(name);
    markets.push(market(type, name, null, selections, '', normalizePeriod('', name)));
  }
  return markets.filter(Boolean);
}
function parseHtmlEvents(html) {
  const events = [];
  const rows = [];
  for (const match of String(html || '').matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi)) rows.push({ tag: match[1] || '', body: match[2] || '' });
  for (const match of String(html || '').matchAll(/<article\b([^>]*(?:data-event-id|data-match-id|class=["'][^"']*(?:event-row|match-row|game-row)[^"']*["'])[^>]*)>([\s\S]*?)<\/article>/gi)) rows.push({ tag: match[1] || '', body: match[2] || '' });
  for (const match of String(html || '').matchAll(/<li\b([^>]*(?:data-event-id|data-match-id|class=["'][^"']*(?:event-row|match-row|game-row)[^"']*["'])[^>]*)>([\s\S]*?)<\/li>/gi)) rows.push({ tag: match[1] || '', body: match[2] || '' });

  rows.slice(0, 3000).forEach(({ tag, body }, index) => {
    const fullText = stripTags(body);
    if (fullText.length < 8) return;
    let home = classFragmentText(body, ['home-team','team-home','home','participant-home']) || text(attrValue(tag, 'data-home-team'));
    let away = classFragmentText(body, ['away-team','team-away','away','participant-away']) || text(attrValue(tag, 'data-away-team'));
    if (!home || !away) {
      const versus = fullText.match(/^(.{2,80}?)\s+(?:vs\.?|v|—|–|-vs-)\s+(.{2,80}?)(?:\s+\d|$)/i);
      if (versus) { home = text(versus[1]); away = text(versus[2]); }
    }
    if (!home || !away || home === away) return;

    const scoreText = classFragmentText(body, ['score','live-score','result']) || attrValue(tag, 'data-score') || '';
    const [homeScore, awayScore] = parseScore(scoreText);
    const statusText = classFragmentText(body, ['status','match-status','live-status','time-status']) || attrValue(tag, 'data-status') || '';
    const start = classFragmentText(body, ['kickoff','start-time','event-time']) || attrValue(tag, 'data-start-time') || '';
    const league = text(attrValue(tag, 'data-league') || classFragmentText(body, ['league-name','competition-name']), 'Other');
    const sport = normalizeSport(attrValue(tag, 'data-sport') || 'Football');
    const markets = parseHtmlMarkets(body);
    if (!markets.length) return;
    const status = normalizeStatus(statusText, homeScore !== null || awayScore !== null);
    events.push({
      id: slug(attrValue(tag, 'data-event-id') || attrValue(tag, 'data-match-id') || '') || stableId([sport, league, home, away, start, index]),
      sourceId: text(attrValue(tag, 'data-event-id') || attrValue(tag, 'data-match-id') || ''),
      sport,
      league,
      startTime: normalizeStartTime(start),
      status,
      live: status === 'LIVE',
      clock: classFragmentText(body, ['clock','minute','timer']) || null,
      home: { name: home, score: homeScore },
      away: { name: away, score: awayScore },
      markets
    });
  });
  return events;
}
function marketIdentity(market) {
  return `${text(market?.type, 'OTHER')}|${text(market?.period, 'FT')}|${text(market?.line)}|${text(market?.label).toLowerCase()}`;
}
function mergeSourceEvent(target, incoming) {
  if (!target) return structuredClone(incoming);
  if (!incoming) return target;
  target.league ||= incoming.league;
  target.sport ||= incoming.sport;
  target.startTime ||= incoming.startTime;
  target.sourceUrl ||= incoming.sourceUrl;
  target.availableMarketCount = Math.max(Number(target.availableMarketCount || 0), Number(incoming.availableMarketCount || 0)) || null;
  if (incoming.live) {
    target.live = true;
    target.status = 'LIVE';
    target.clock = incoming.clock || target.clock;
    target.home.score = incoming.home?.score ?? target.home?.score ?? null;
    target.away.score = incoming.away?.score ?? target.away?.score ?? null;
  } else if (!target.live && incoming.status === 'FINISHED') {
    target.status = 'FINISHED';
    target.home.score = incoming.home?.score ?? target.home?.score ?? null;
    target.away.score = incoming.away?.score ?? target.away?.score ?? null;
  }
  const byIdentity = new Map((target.markets || []).map(item => [marketIdentity(item), item]));
  for (const candidate of incoming.markets || []) {
    const key = marketIdentity(candidate);
    const existing = byIdentity.get(key);
    if (!existing || (candidate.selections?.length || 0) >= (existing.selections?.length || 0)) byIdentity.set(key, structuredClone(candidate));
  }
  target.markets = [...byIdentity.values()];
  return target;
}
function dedupeEvents(events) {
  const byKey = new Map();
  for (const event of events) {
    const key = event.sourceId || `${event.sport}|${event.league}|${event.home.name}|${event.away.name}|${event.startTime ?? ''}`;
    const existing = byKey.get(key);
    byKey.set(key, existing ? mergeSourceEvent(existing, event) : structuredClone(event));
  }
  return [...byKey.values()].slice(0, MAX_EVENTS);
}

function parseSourceHtml(html) {
  const jsonEvents = parseJsonEvents(html);
  const sbEvents = parseSbobetHtmlEvents(html);
  const htmlEvents = parseHtmlEvents(html);
  return dedupeEvents([...jsonEvents, ...sbEvents, ...htmlEvents]);
}
function collectNestedPayloadStrings(value, output, depth = 0) {
  if (depth > 8 || output.length >= 240 || value === null || value === undefined) return;
  if (typeof value === 'string') {
    const candidate = value.trim();
    if (candidate.length >= 20 && candidate.length <= MAX_HTML_BYTES && /(?:OddsTab|bu:od:|<tr\b|<article\b|<li\b|"markets?"\s*:|"events?"\s*:)/i.test(candidate)) output.push(candidate);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(item => collectNestedPayloadStrings(item, output, depth + 1));
    return;
  }
  if (typeof value !== 'object') return;
  Object.values(value).forEach(item => collectNestedPayloadStrings(item, output, depth + 1));
}
function jsonRootCandidates(payload) {
  const source = String(payload || '').trim().replace(/^\)\]\}',?\s*/, '');
  const roots = [];
  const push = value => {
    if (!value || typeof value !== 'object') return;
    roots.push(value);
  };
  try { push(JSON.parse(source)); } catch {}
  if (!roots.length && /^[\w$.]+\s*\(/.test(source)) {
    const start = source.indexOf('(');
    const end = source.lastIndexOf(')');
    if (start >= 0 && end > start) {
      try { push(JSON.parse(source.slice(start + 1, end))); } catch {}
    }
  }
  if (!roots.length && /^[{[]/.test(source)) {
    for (const candidate of balancedJsonCandidates(source).slice(0, 40)) {
      try { push(JSON.parse(candidate)); } catch {}
      if (roots.length >= 12) break;
    }
  }
  return roots;
}
function parseJsonDocumentEvents(payload) {
  const objects = [];
  const nested = [];
  for (const root of jsonRootCandidates(payload)) {
    collectEventObjects(root, objects);
    collectNestedPayloadStrings(root, nested);
  }
  const normalized = objects.map((item, index) => normalizeEvent(item.value, index, item.context)).filter(Boolean);
  const nestedEvents = [];
  for (const fragment of nested) {
    nestedEvents.push(...parseSourceHtml(fragment));
    if (nestedEvents.length >= MAX_EVENTS * 2) break;
  }
  return dedupeEvents([...normalized, ...nestedEvents]);
}
function parseSourcePayload(payload) {
  const direct = parseSourceHtml(payload);
  const documentEvents = parseJsonDocumentEvents(payload);
  return dedupeEvents([...direct, ...documentEvents]);
}
function countMatches(source, pattern, max = 100000) {
  let count = 0;
  for (const _ of String(source || '').matchAll(pattern)) {
    count += 1;
    if (count >= max) break;
  }
  return count;
}
function sourcePayloadDiagnostics(payload, contentType = '') {
  const source = String(payload || '');
  const trimmed = source.trim();
  const oddsMarkers = countMatches(source, /\bOddsTab[LR]?\b/gi);
  const eventMarkers = countMatches(source, /bu:od:(?:afa:ev|go:ev):\d+/gi);
  const menuCounters = countMatches(source, /\b(?:NumEvt|NumEvtCountry)\b/gi);
  const scriptTags = countMatches(source, /<script\b/gi);
  const eventLinks = countMatches(source, /href=["'][^"']*\/\d+\/[^"']*(?:-vs-|%2Dvs%2D)[^"']*["']/gi);
  const jsonLike = /^[{[]/.test(trimmed) || /application\/json/i.test(contentType);
  const catalogSignals = menuCounters > 0 || /\bAll Events\b|\bLive Betting\b|\bPertandingan\b|\bTaruhan Live\b/i.test(source);
  const hasPricedPayload = oddsMarkers > 0 || eventMarkers > 0 || /"(?:odds|price|markets?|selections?)"\s*:/i.test(source);
  return {
    bytes: Buffer.byteLength(source),
    sha256: crypto.createHash('sha256').update(source).digest('hex'),
    contentType: text(contentType).slice(0, 120) || null,
    format: jsonLike ? 'JSON' : /<html\b|<div\b|<table\b|<body\b/i.test(source) ? 'HTML' : 'TEXT',
    oddsMarkers,
    eventMarkers,
    eventLinks,
    menuCounters,
    scriptTags,
    catalogOnly: Boolean(catalogSignals && !hasPricedPayload),
    likelyClientHydrated: Boolean(catalogSignals && !hasPricedPayload && scriptTags > 0)
  };
}
function samePublicHost(left, right) {
  const a = String(left || '').toLowerCase();
  const b = String(right || '').toLowerCase();
  return Boolean(a && b && (a === b || a === `www.${b}` || `www.${a}` === b));
}
function normalizedDomain(value) {
  return String(value || '').trim().toLowerCase().replace(/^\.|\.$/g, '');
}
function domainHost(hostname, domain) {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  const clean = normalizedDomain(domain);
  if (!host || !clean) return false;
  return host === clean || host.endsWith(`.${clean}`);
}
function vendorHost(hostname) {
  return domainHost(hostname, config.sportsSourceAllowedDomain);
}
function trustedRedirectHost(hostname) {
  return String(config.sportsSourceTrustedRedirectDomains || '')
    .split(/[;,\s]+/)
    .map(normalizedDomain)
    .filter(Boolean)
    .some(domain => domainHost(hostname, domain));
}
function approvedSourceHost(hostname) {
  return vendorHost(hostname) || trustedRedirectHost(hostname) || samePublicHost(hostname, sourceBaseUrl().allowedHost);
}
function privateSourceHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
  if (/^(?:127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(host)) return true;
  if (host === '::1' || host === '::' || /^f[cd][0-9a-f:]*$/i.test(host) || /^fe[89ab][0-9a-f:]*$/i.test(host)) return true;
  return false;
}
function publicIpHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (privateSourceHost(host)) return false;
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || /^[0-9a-f:]+$/i.test(host);
}
function sourceBaseUrl() {
  if (!config.sportsSourceBaseUrl) throw new AppError(503, 'SPORTS_SOURCE_BASE_URL belum dikonfigurasi.', 'SPORTS_SOURCE_NOT_CONFIGURED');
  let url;
  try { url = new URL(config.sportsSourceBaseUrl); }
  catch { throw new AppError(500, 'SPORTS_SOURCE_BASE_URL tidak valid.', 'SPORTS_SOURCE_CONFIG_INVALID'); }
  if (!['https:', ...(config.nodeEnv === 'development' ? ['http:'] : [])].includes(url.protocol)) {
    throw new AppError(500, 'Sumber sportsbook harus menggunakan HTTPS.', 'SPORTS_SOURCE_PROTOCOL_INVALID');
  }
  const allowedHost = config.sportsSourceAllowedHost || url.hostname;
  if (!samePublicHost(url.hostname, allowedHost) && !vendorHost(url.hostname)) throw new AppError(500, 'Host sumber sportsbook tidak diizinkan.', 'SPORTS_SOURCE_HOST_INVALID');
  if (config.nodeEnv !== 'development' && privateSourceHost(url.hostname)) {
    throw new AppError(500, 'Host privat tidak diizinkan sebagai sumber sportsbook.', 'SPORTS_SOURCE_PRIVATE_HOST');
  }
  return { url, allowedHost };
}
function resolveSourcePath(pathTemplate) {
  const { url: base, allowedHost } = sourceBaseUrl();
  const path = String(pathTemplate || '').replace('{ref}', encodeURIComponent(config.sportsSourceRef));
  const resolved = new URL(path, base);
  if (!samePublicHost(resolved.hostname, allowedHost) && !vendorHost(resolved.hostname) && !trustedRedirectHost(resolved.hostname)) throw new AppError(500, 'Sumber keluar dari allowlist vendor/migration.', 'SPORTS_SOURCE_HOST_INVALID');
  return resolved;
}
function mergeCookies(...cookieGroups) {
  const jar = new Map();
  for (const group of cookieGroups) {
    const segments = String(group || '').split(';').map(part => part.trim()).filter(Boolean);
    const isSetCookie = segments.slice(1).some(part => /^(?:path|domain|expires|max-age|samesite)=|^(?:secure|httponly)$/i.test(part));
    const pairs = isSetCookie ? segments.slice(0, 1) : segments;
    for (const pair of pairs) {
      const separator = pair.indexOf('=');
      if (separator <= 0) continue;
      const name = pair.slice(0, separator).trim();
      const value = pair.slice(separator + 1).trim();
      if (name && value) jar.set(name, value);
    }
  }
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}
function configuredSourceUrls() {
  const urls = [resolveSourcePath(config.sportsSourceMainPath)];
  if (config.sportsSourceLivePath) urls.push(resolveSourcePath(config.sportsSourceLivePath));
  for (const raw of String(config.sportsSourceCandidateUrls || '').split(';').map(item => item.trim()).filter(Boolean)) {
    try {
      const url = new URL(raw, sourceBaseUrl().url);
      if (url.protocol !== 'https:' && !(config.nodeEnv === 'development' && url.protocol === 'http:')) continue;
      if (!vendorHost(url.hostname) && !trustedRedirectHost(url.hostname) && !samePublicHost(url.hostname, sourceBaseUrl().allowedHost)) continue;
      urls.push(url);
    } catch {}
  }
  const seen = new Set();
  return urls.filter(url => {
    const key = url.toString();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function discoverScheduleIndexUrls(html) {
  if (!config.sportsSourceScheduleDiscoveryEnabled) return [];
  const { url: base, allowedHost } = sourceBaseUrl();
  const urls = [];
  for (const match of String(html || '').matchAll(/<a\b([^>]*\bid=["']bu:od:go:dt:\d+["'][^>]*)>/gi)) {
    const href = attrValue(match[1], 'href');
    if (!href) continue;
    let resolved;
    try { resolved = new URL(href, base); } catch { continue; }
    if (resolved.protocol !== 'https:' && !(config.nodeEnv === 'development' && resolved.protocol === 'http:')) continue;
    if (!vendorHost(resolved.hostname) && !trustedRedirectHost(resolved.hostname) && !samePublicHost(resolved.hostname, allowedHost)) continue;
    if (!/^\/id-id\/euro\/sepak-bola\/(?:20\d{2}-\d{2}-\d{2}|lainnya)\/?$/i.test(resolved.pathname)) continue;
    urls.push(resolved);
  }
  const seen = new Set();
  return urls.filter(url => {
    const key = url.toString();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, config.sportsSourceScheduleMaxPages);
}
async function collectScheduleCandidate(url, cookie) {
  const key = String(url);
  const now = Date.now();
  const existing = scheduleIndexCache.get(key);
  if (existing?.value && now < existing.expiresAt) return { ...existing.value, scheduleCacheHit: true };
  if (existing?.inFlight) return existing.inFlight;
  const inFlightSchedule = collectCandidate(url, cookie).then(value => {
    const stored = { ...value, scheduleCacheHit: false };
    scheduleIndexCache.set(key, {
      value: stored,
      fetchedAt: Date.now(),
      expiresAt: Date.now() + config.sportsSourceScheduleRefreshSeconds * 1000,
      inFlight: null
    });
    return stored;
  }).catch(error => {
    scheduleIndexCache.delete(key);
    throw error;
  });
  scheduleIndexCache.set(key, {
    value: existing?.value || null,
    fetchedAt: existing?.fetchedAt || 0,
    expiresAt: existing?.expiresAt || 0,
    inFlight: inFlightSchedule
  });
  return inFlightSchedule;
}
function sourceHeaders({ cookie = '', includeSensitive = true } = {}) {
  return {
    accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
    'accept-language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    'cache-control': 'no-cache',
    pragma: 'no-cache',
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': 'none',
    'upgrade-insecure-requests': '1',
    'user-agent': config.sportsSourceUserAgent,
    ...(includeSensitive && cookie ? { cookie } : {}),
    ...(includeSensitive && config.sportsSourceAuthorization ? { authorization: config.sportsSourceAuthorization } : {}),
    ...(includeSensitive && config.sportsSourceReferer ? { referer: config.sportsSourceReferer } : {})
  };
}
function setCookiesFrom(response) {
  if (typeof response.headers.getSetCookie === 'function') return response.headers.getSetCookie();
  const single = response.headers.get('set-cookie');
  return single ? [single] : [];
}
function publicEdgeHopAllowed(url, includeSensitive) {
  return config.sportsSourceAllowPublicEdgeRedirect
    && ['http:', 'https:'].includes(url.protocol)
    && publicIpHost(url.hostname)
    && !includeSensitive
    && !config.sportsSourceAuthorization
    && !config.sportsSourceCookie;
}
function trustedAliasHttpHopAllowed(url, includeSensitive) {
  return url.protocol === 'http:'
    && trustedRedirectHost(url.hostname)
    && !includeSensitive
    && !config.sportsSourceAuthorization
    && !config.sportsSourceCookie;
}
function crossDomainMigrationPath(current, next) {
  if (!trustedRedirectHost(next.hostname)) return null;
  if (next.pathname && next.pathname !== '/') return null;
  if (!/^\/id-id\/(?:sports(?:\/|$)|euro\/(?:taruhan-live\/)?sepak-bola(?:\/|$))/i.test(current.pathname)) return null;
  return `${current.pathname}${current.search || ''}`;
}
function redirectTargetAllowed(current, next, includeSensitive) {
  const sameApprovedHost = next.protocol === 'https:'
    && (vendorHost(next.hostname) || samePublicHost(next.hostname, sourceBaseUrl().allowedHost));
  if (sameApprovedHost) return { allowed: true, includeSensitive };

  // Canonical source domain may migrate to an explicitly approved alias. Never carry
  // session material across that boundary. HTTP is tolerated only as a bootstrap hop;
  // fetchUrl rejects an HTTP final response before parsing any odds.
  const fromApprovedSource = current.protocol === 'https:' && (vendorHost(current.hostname) || trustedRedirectHost(current.hostname));
  const aliasMigration = (fromApprovedSource || trustedAliasHttpHopAllowed(current, includeSensitive))
    && ['http:', 'https:'].includes(next.protocol)
    && trustedRedirectHost(next.hostname)
    && !config.sportsSourceAuthorization
    && !config.sportsSourceCookie;
  if (aliasMigration) {
    return { allowed: true, includeSensitive: false, preserveSportsbookPath: crossDomainMigrationPath(current, next) };
  }

  const fromVendor = current.protocol === 'https:' && vendorHost(current.hostname);
  const fromPublicEdge = publicEdgeHopAllowed(current, includeSensitive);
  const publicEdge = config.sportsSourceAllowPublicEdgeRedirect
    && (fromVendor || fromPublicEdge)
    && ['http:', 'https:'].includes(next.protocol)
    && publicIpHost(next.hostname)
    && !config.sportsSourceAuthorization
    && !config.sportsSourceCookie;
  if (publicEdge) return { allowed: true, includeSensitive: false };
  return { allowed: false, includeSensitive: false };
}
async function fetchUrl(inputUrl, initialCookie = '') {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.sportsSourceTimeoutMs);
  let current = new URL(inputUrl);
  let cookie = initialCookie;
  let includeSensitive = vendorHost(current.hostname) || samePublicHost(current.hostname, sourceBaseUrl().allowedHost);
  let redirects = 0;
  const visited = new Set();
  const redirectChain = [];
  const urlKey = url => {
    const normalized = new URL(url.toString());
    normalized.hash = '';
    return normalized.toString();
  };
  const redirectError = (message, code, next = null) => {
    const error = new AppError(502, message, code);
    error.redirectChain = [...redirectChain, ...(next ? [next.toString()] : [])];
    return error;
  };
  try {
    while (true) {
      const currentKey = urlKey(current);
      if (visited.has(currentKey)) {
        throw redirectError('Sumber sportsbook membentuk redirect loop.', 'SPORTS_SOURCE_REDIRECT_LOOP', current);
      }
      visited.add(currentKey);
      redirectChain.push(current.toString());

      if (current.protocol === 'https:') {
        const approvedVendor = vendorHost(current.hostname) || trustedRedirectHost(current.hostname) || samePublicHost(current.hostname, sourceBaseUrl().allowedHost);
        if (!approvedVendor && !publicEdgeHopAllowed(current, includeSensitive)) throw new AppError(502, 'Host sumber sportsbook tidak diizinkan.', 'SPORTS_SOURCE_HOST_INVALID');
        if (config.nodeEnv !== 'development' && privateSourceHost(current.hostname)) throw new AppError(502, 'Host privat sumber sportsbook diblokir.', 'SPORTS_SOURCE_PRIVATE_HOST');
      } else if (!publicEdgeHopAllowed(current, includeSensitive) && !trustedAliasHttpHopAllowed(current, includeSensitive)) {
        throw new AppError(502, 'Downgrade protocol sumber sportsbook diblokir.', 'SPORTS_SOURCE_PROTOCOL_INVALID');
      }

      const response = await fetch(current, {
        redirect: 'manual',
        signal: controller.signal,
        headers: sourceHeaders({ cookie, includeSensitive })
      });
      cookie = mergeCookies(cookie, ...setCookiesFrom(response));
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        if (redirects >= config.sportsSourceMaxRedirects) {
          throw redirectError('Sumber sportsbook melewati batas redirect.', 'SPORTS_SOURCE_TOO_MANY_REDIRECTS');
        }
        const location = response.headers.get('location');
        if (!location) throw redirectError('Redirect sumber sportsbook tidak memiliki lokasi.', 'SPORTS_SOURCE_REDIRECT_INVALID');
        const rawNext = new URL(location, current);
        const policy = redirectTargetAllowed(current, rawNext, includeSensitive);
        if (!policy.allowed) {
          const blocked = redirectError(`Redirect sumber keluar dari kebijakan vendor (${rawNext.protocol}//${rawNext.hostname}).`, 'SPORTS_SOURCE_REDIRECT_BLOCKED', rawNext);
          blocked.redirectTarget = { protocol: rawNext.protocol, hostname: rawNext.hostname };
          throw blocked;
        }

        let next = rawNext;
        if (policy.preserveSportsbookPath) {
          const migrated = new URL(rawNext.toString());
          const preserved = new URL(policy.preserveSportsbookPath, `${migrated.protocol}//${migrated.host}/`);
          migrated.pathname = preserved.pathname;
          migrated.search = preserved.search;
          const migratedKey = urlKey(migrated);
          const rawKey = urlKey(rawNext);
          // Path preservation is a migration convenience, never authority to create a
          // synthetic loop. If preserving would revisit the current/previous URL,
          // follow the provider's safe raw redirect instead.
          if (!visited.has(migratedKey) && migratedKey !== currentKey) {
            next = migrated;
          } else if (!visited.has(rawKey) && rawKey !== currentKey) {
            next = rawNext;
          } else {
            throw redirectError('Sumber sportsbook membentuk redirect loop setelah migrasi domain.', 'SPORTS_SOURCE_REDIRECT_LOOP', rawNext);
          }
        } else {
          const rawKey = urlKey(rawNext);
          if (visited.has(rawKey) || rawKey === currentKey) {
            throw redirectError('Sumber sportsbook membentuk redirect loop.', 'SPORTS_SOURCE_REDIRECT_LOOP', rawNext);
          }
        }

        current = next;
        includeSensitive = policy.includeSensitive;
        if (!includeSensitive) cookie = '';
        redirects += 1;
        continue;
      }
      if (!response.ok) throw new AppError(502, `Sumber sportsbook merespons HTTP ${response.status}.`, 'SPORTS_SOURCE_HTTP_ERROR');
      if (current.protocol !== 'https:') {
        throw new AppError(502, 'Final response sumber sportsbook wajib HTTPS; HTTP hanya diizinkan sebagai hop migrasi tanpa kredensial.', 'SPORTS_SOURCE_INSECURE_FINAL');
      }
      const contentLength = Number(response.headers.get('content-length') || 0);
      if (contentLength > MAX_HTML_BYTES) throw new AppError(502, 'Respons sumber sportsbook terlalu besar.', 'SPORTS_SOURCE_RESPONSE_TOO_LARGE');
      const html = await response.text();
      if (Buffer.byteLength(html) > MAX_HTML_BYTES) throw new AppError(502, 'Respons sumber sportsbook terlalu besar.', 'SPORTS_SOURCE_RESPONSE_TOO_LARGE');
      return {
        html,
        cookie,
        url: current.toString(),
        redirects,
        redirectChain,
        edgeRedirect: false,
        contentType: response.headers.get('content-type') || ''
      };
    }
  } catch (error) {
    if (error?.name === 'AbortError') throw new AppError(504, 'Sumber sportsbook melewati batas waktu.', 'SPORTS_SOURCE_TIMEOUT');
    if (!error.redirectChain) error.redirectChain = [...redirectChain];
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
async function fetchPage(pathTemplate, cookie = '') {
  return fetchUrl(resolveSourcePath(pathTemplate), cookie);
}
async function browserRenderedPage(inputUrl, directPage = null) {
  if (!config.sportsSourceBrowserEnabled) return null;
  const current = new URL(inputUrl);
  if (!vendorHost(current.hostname) && !trustedRedirectHost(current.hostname) && !samePublicHost(current.hostname, sourceBaseUrl().allowedHost)) {
    throw new AppError(502, 'Browser renderer menolak host di luar vendor allowlist.', 'SPORTS_SOURCE_BROWSER_HOST_BLOCKED');
  }
  try {
    const rendered = await renderSportsbookPage(current.toString(), {
      executable: config.sportsSourceBrowserExecutable,
      timeoutMs: config.sportsSourceBrowserTimeoutMs,
      settleMs: config.sportsSourceBrowserSettleMs,
      cacheSeconds: config.sportsSourceBrowserCacheSeconds,
      maxBytes: MAX_HTML_BYTES,
      userAgent: config.sportsSourceUserAgent,
      referer: config.sportsSourceReferer
    });
    const renderedFinal = new URL(rendered.finalUrl || current.toString());
    if (renderedFinal.protocol !== 'https:' || !approvedSourceHost(renderedFinal.hostname)) {
      throw new AppError(502, `Browser-rendered source berakhir di host/protocol yang tidak disetujui (${renderedFinal.protocol}//${renderedFinal.hostname}).`, 'SPORTS_SOURCE_BROWSER_FINAL_URL_BLOCKED');
    }
    return {
      html: rendered.html,
      cookie: directPage?.cookie || '',
      url: renderedFinal.toString(),
      redirects: directPage?.redirects || 0,
      edgeRedirect: false,
      contentType: 'text/html; renderer=chromium-cdp',
      renderer: rendered.renderer,
      rendererCacheHit: Boolean(rendered.cacheHit),
      renderMs: rendered.renderMs || null,
      renderedAt: rendered.renderedAt || new Date().toISOString()
    };
  } catch (error) {
    const wrapped = new AppError(502, `Browser-rendered source gagal: ${error.message}`, 'SPORTS_SOURCE_BROWSER_FAILED');
    wrapped.cause = error;
    throw wrapped;
  }
}
async function loadSourcePageWithBrowserFallback(inputUrl, cookie = '', transports = {}) {
  const directFetch = transports.fetchDirect || fetchUrl;
  const browserFetch = transports.renderBrowser || browserRenderedPage;
  try {
    const page = await directFetch(inputUrl, cookie);
    return { page, transportError: null, browserFallback: false };
  } catch (directError) {
    if (!config.sportsSourceBrowserEnabled) throw directError;
    try {
      const page = await browserFetch(new URL(inputUrl).toString(), null);
      return { page, transportError: directError, browserFallback: true };
    } catch (browserError) {
      const error = new AppError(502, 'Transport HTTP dan browser renderer sama-sama gagal mengakses sumber sportsbook.', 'SPORTS_SOURCE_TRANSPORT_AND_BROWSER_FAILED');
      error.diagnostics = {
        directTransport: { code: directError?.code || directError?.name || 'SPORTS_SOURCE_ERROR', message: directError?.message || 'fetch failed' },
        browser: { code: browserError?.code || browserError?.name || 'SPORTS_SOURCE_BROWSER_FAILED', message: browserError?.message || 'browser render failed' }
      };
      error.redirectChain = directError?.redirectChain || null;
      throw error;
    }
  }
}

function snapshotQuality(events) {
  const marketCount = events.reduce((sum, event) => sum + (event.markets?.length || 0), 0);
  const selectionCount = events.reduce((sum, event) => sum + (event.markets || []).reduce((inner, market) => inner + (market.selections?.length || 0), 0), 0);
  const liveCount = events.filter(event => event.live).length;
  return { eventCount: events.length, marketCount, selectionCount, liveCount, score: events.length * 10 + marketCount * 4 + selectionCount + liveCount * 20 };
}
async function collectCandidate(url, cookie, transports = {}) {
  const loaded = await loadSourcePageWithBrowserFallback(url, cookie, transports);
  let page = loaded.page;
  let events = parseSourcePayload(page.html);
  let diagnostics = sourcePayloadDiagnostics(page.html, page.contentType);
  let directDiagnostics = loaded.browserFallback ? {
    transportError: {
      code: loaded.transportError?.code || loaded.transportError?.name || 'SPORTS_SOURCE_ERROR',
      message: loaded.transportError?.message || 'fetch failed'
    }
  } : null;

  if (loaded.browserFallback) {
    diagnostics = {
      ...diagnostics,
      renderer: page.renderer || 'CHROMIUM_CDP',
      rendererCacheHit: Boolean(page.rendererCacheHit),
      renderMs: page.renderMs || null,
      directTransport: directDiagnostics.transportError
    };
  } else if (!events.length && config.sportsSourceBrowserEnabled && diagnostics.catalogOnly) {
    directDiagnostics = diagnostics;
    try {
      const browserFetch = transports.renderBrowser || browserRenderedPage;
      const rendered = await browserFetch(page.url || url, page);
      if (rendered) {
        page = rendered;
        events = parseSourcePayload(page.html);
        diagnostics = {
          ...sourcePayloadDiagnostics(page.html, page.contentType),
          renderer: page.renderer || 'CHROMIUM_CDP',
          rendererCacheHit: Boolean(page.rendererCacheHit),
          renderMs: page.renderMs || null,
          directHttp: directDiagnostics
        };
      }
    } catch (browserError) {
      diagnostics = { ...directDiagnostics, browserError: { code: browserError.code || 'SPORTS_SOURCE_BROWSER_FAILED', message: browserError.message } };
    }
  }

  if (events.length) {
    const pageBase = page.url || url.toString();
    events = events.map(event => {
      if (!event?.sourceUrl) return event;
      try { return { ...event, sourceUrl: new URL(event.sourceUrl, pageBase).toString() }; }
      catch { return { ...event, sourceUrl: null }; }
    });
  }

  if (!events.length) {
    const catalogOnly = diagnostics.catalogOnly || directDiagnostics?.catalogOnly;
    const browserAttempted = Boolean(directDiagnostics);
    const transportBrowserFallback = Boolean(loaded.browserFallback);
    const error = new AppError(
      502,
      transportBrowserFallback
        ? 'Transport HTTP gagal dan browser-rendered DOM belum menghasilkan event/odds yang dikenali.'
        : browserAttempted
          ? 'Upstream HTTP hanya katalog dan browser-rendered DOM belum menghasilkan event/odds yang dikenali.'
          : catalogOnly
            ? 'Upstream dapat diakses, tetapi respons HTTP hanya berisi katalog/navigasi tanpa event/odds.'
            : 'Upstream dapat diakses tetapi tidak berisi event/odds yang dikenali.',
      browserAttempted ? 'SPORTS_SOURCE_BROWSER_PARSE_EMPTY' : catalogOnly ? 'SPORTS_SOURCE_CATALOG_ONLY' : 'SPORTS_SOURCE_PARSE_EMPTY'
    );
    error.diagnostics = diagnostics;
    throw error;
  }
  return { page, events, quality: snapshotQuality(events), diagnostics };
}
async function collectSnapshot() {
  let cookie = config.sportsSourceCookie;
  if (config.sportsSourcePanelPath) {
    try {
      const panel = await fetchPage(config.sportsSourcePanelPath, cookie);
      cookie = mergeCookies(cookie, panel.cookie);
    } catch (error) {
      logger.warn('Sportsbook panel bootstrap unavailable; continuing with direct upstreams', { code: error.code, error: error.message });
    }
  }

  // HOT indexes (current football + live) are refreshed every source cycle.
  const candidates = configuredSourceUrls();
  const baseSettled = await Promise.allSettled(candidates.map(url => collectCandidate(url, cookie)));
  const baseSuccessful = baseSettled
    .map((result, index) => ({ result, url: candidates[index].toString() }))
    .filter(item => item.result.status === 'fulfilled')
    .map(item => ({ ...item.result.value, requestedUrl: item.url, indexKind: 'HOT' }));

  if (!baseSuccessful.length) {
    const upstreams = baseSettled.map((result, index) => result.status === 'fulfilled'
      ? { url: candidates[index].toString(), healthy: true, finalUrl: result.value.page.url, ...result.value.quality, indexKind: 'HOT' }
      : { url: candidates[index].toString(), healthy: false, indexKind: 'HOT', diagnostics: result.reason?.diagnostics || null, redirectChain: result.reason?.redirectChain || null, error: { code: result.reason?.code || 'SPORTS_SOURCE_ERROR', message: result.reason?.message || 'upstream failed' } });
    const firstError = baseSettled.find(result => result.status === 'rejected')?.reason;
    const error = new AppError(502, firstError?.message || 'Seluruh upstream sportsbook gagal.', firstError?.code || 'SPORTS_SOURCE_ALL_UPSTREAMS_FAILED');
    error.upstreams = upstreams;
    error.redirectChain = firstError?.redirectChain || null;
    throw error;
  }

  sourceSessionCookie = mergeCookies(config.sportsSourceCookie, ...baseSuccessful.map(item => item.page.cookie));

  // The source exposes dated football tabs (today, future dates, and "lainnya").
  // Discover them from the live HTML itself instead of hard-coding dates. These
  // schedule pages are refreshed at a slower cadence to keep the bridge polite
  // while still automatically following all priced matches advertised by source.
  const baseKeys = new Set(candidates.map(url => url.toString()));
  const discoveredUrls = [];
  const discoveredSeen = new Set();
  for (const item of baseSuccessful) {
    for (const url of discoverScheduleIndexUrls(item.page.html)) {
      const key = url.toString();
      if (baseKeys.has(key) || discoveredSeen.has(key)) continue;
      discoveredSeen.add(key);
      discoveredUrls.push(url);
      if (discoveredUrls.length >= config.sportsSourceScheduleMaxPages) break;
    }
    if (discoveredUrls.length >= config.sportsSourceScheduleMaxPages) break;
  }

  const scheduleSettled = await Promise.allSettled(discoveredUrls.map(url => collectScheduleCandidate(url, sourceSessionCookie)));
  const scheduleSuccessful = scheduleSettled
    .map((result, index) => ({ result, url: discoveredUrls[index]?.toString() || '' }))
    .filter(item => item.result.status === 'fulfilled')
    .map(item => ({ ...item.result.value, requestedUrl: item.url, indexKind: 'SCHEDULE' }));

  const successful = [...baseSuccessful, ...scheduleSuccessful];
  sourceSessionCookie = mergeCookies(sourceSessionCookie, ...scheduleSuccessful.map(item => item.page.cookie));

  const baseUpstreams = baseSettled.map((result, index) => result.status === 'fulfilled'
    ? {
        url: candidates[index].toString(), healthy: true, finalUrl: result.value.page.url, ...result.value.quality,
        redirects: result.value.page.redirects, edgeRedirect: result.value.page.edgeRedirect,
        diagnostics: result.value.diagnostics, indexKind: 'HOT', cacheHit: false
      }
    : {
        url: candidates[index].toString(), healthy: false, diagnostics: result.reason?.diagnostics || null, redirectChain: result.reason?.redirectChain || null,
        error: { code: result.reason?.code || 'SPORTS_SOURCE_ERROR', message: result.reason?.message || 'upstream failed' }, indexKind: 'HOT', cacheHit: false
      });
  const scheduleUpstreams = scheduleSettled.map((result, index) => result.status === 'fulfilled'
    ? {
        url: discoveredUrls[index].toString(), healthy: true, finalUrl: result.value.page.url, ...result.value.quality,
        redirects: result.value.page.redirects, edgeRedirect: result.value.page.edgeRedirect,
        diagnostics: result.value.diagnostics, indexKind: 'SCHEDULE', cacheHit: Boolean(result.value.scheduleCacheHit)
      }
    : {
        url: discoveredUrls[index].toString(), healthy: false, diagnostics: result.reason?.diagnostics || null, redirectChain: result.reason?.redirectChain || null,
        error: { code: result.reason?.code || 'SPORTS_SOURCE_ERROR', message: result.reason?.message || 'upstream failed' }, indexKind: 'SCHEDULE', cacheHit: false
      });
  const upstreams = [...baseUpstreams, ...scheduleUpstreams];

  successful.sort((a, b) => b.quality.score - a.quality.score);
  const best = successful[0];
  const events = dedupeEvents(successful.flatMap(item => item.events));
  const aggregateQuality = snapshotQuality(events);
  const sports = [...new Set(events.map(event => event.sport))].sort();
  const fetchedAt = new Date().toISOString();
  return {
    source: {
      name: config.sportsSourceName,
      mode: 'DIRECT_MULTI_PAGE_SOURCE',
      fetchedAt,
      refreshSeconds: config.sportsSourceRefreshSeconds,
      scheduleRefreshSeconds: config.sportsSourceScheduleRefreshSeconds,
      upstream: best.page.url,
      requestedUpstream: best.requestedUrl,
      quality: aggregateQuality,
      activeIndexes: successful.map(item => item.page.url),
      hotIndexes: baseSuccessful.map(item => item.page.url),
      discoveredScheduleIndexes: scheduleSuccessful.map(item => item.page.url),
      discoveredScheduleCount: discoveredUrls.length,
      browserRendererEnabled: config.sportsSourceBrowserEnabled,
      renderedIndexes: successful.filter(item => item.diagnostics?.renderer).map(item => item.page.url),
      renderer: successful.some(item => item.diagnostics?.renderer) ? 'CHROMIUM_CDP_FALLBACK' : 'DIRECT_HTTP'
    },
    upstreams,
    sports,
    events,
    total: events.length
  };
}
function detailCacheTtlMs(event) {
  return (event?.live ? config.sportsSourceDetailRefreshSeconds : config.sportsSourceDetailPrematchRefreshSeconds) * 1000;
}
function detailUrlForEvent(event) {
  if (!event?.sourceUrl) return null;
  const { url: base, allowedHost } = sourceBaseUrl();
  let resolved;
  try { resolved = new URL(event.sourceUrl, base); } catch { return null; }
  if (resolved.protocol !== 'https:' && !(config.nodeEnv === 'development' && resolved.protocol === 'http:')) return null;
  if (!vendorHost(resolved.hostname) && !trustedRedirectHost(resolved.hostname) && !samePublicHost(resolved.hostname, allowedHost)) return null;
  return resolved;
}
function applyCachedEventDetails(snapshot) {
  if (!snapshot?.events?.length || !eventDetailCache.size) return snapshot;
  const now = Date.now();
  snapshot.events = snapshot.events.map(event => {
    const cached = eventDetailCache.get(String(event.sourceId || event.id));
    if (!cached?.value || now >= cached.expiresAt) return event;
    return mergeSourceEvent(structuredClone(event), cached.value);
  });
  snapshot.total = snapshot.events.length;
  if (snapshot.source) snapshot.source.quality = snapshotQuality(snapshot.events);
  return snapshot;
}
async function fetchEventDetail(event) {
  const sourceId = String(event?.sourceId || event?.id || '');
  if (!sourceId) throw new AppError(404, 'ID pertandingan sumber tidak tersedia.', 'SPORTS_SOURCE_EVENT_ID_MISSING');
  if (!config.sportsSourceDetailEnabled) return event;
  const resolved = detailUrlForEvent(event);
  if (!resolved) return event;
  const now = Date.now();
  const existing = eventDetailCache.get(sourceId);
  if (existing?.value && now < existing.expiresAt) return existing.value;
  if (existing?.inFlight) return existing.inFlight;
  const inFlightDetail = (async () => {
    const loaded = await loadSourcePageWithBrowserFallback(resolved, sourceSessionCookie || config.sportsSourceCookie);
    let page = loaded.page;
    sourceSessionCookie = mergeCookies(sourceSessionCookie, page.cookie);
    let parsed = parseSourcePayload(page.html);
    const directDiagnostics = sourcePayloadDiagnostics(page.html, page.contentType);
    if (!parsed.length && config.sportsSourceBrowserEnabled && directDiagnostics.catalogOnly && !loaded.browserFallback) {
      const rendered = await browserRenderedPage(page.url || resolved, page);
      if (rendered) {
        page = rendered;
        parsed = parseSourcePayload(page.html);
      }
    }
    const match = parsed.find(item => String(item.sourceId || item.id) === sourceId)
      || parsed.find(item => text(item.home?.name).toLowerCase() === text(event.home?.name).toLowerCase() && text(item.away?.name).toLowerCase() === text(event.away?.name).toLowerCase());
    if (!match?.markets?.length) {
      const error = new AppError(502, 'Halaman detail pertandingan tidak mengembalikan pasaran odds yang dikenali.', 'SPORTS_SOURCE_DETAIL_EMPTY');
      error.diagnostics = sourcePayloadDiagnostics(page.html, page.contentType);
      throw error;
    }
    const merged = mergeSourceEvent(structuredClone(event), match);
    merged.sourceUrl = event.sourceUrl || match.sourceUrl || null;
    merged.availableMarketCount = Math.max(Number(event.availableMarketCount || 0), Number(match.availableMarketCount || 0), merged.markets.length) || merged.markets.length;
    merged.detailFetchedAt = new Date().toISOString();
    const ttl = detailCacheTtlMs(merged);
    eventDetailCache.set(sourceId, { value: merged, fetchedAt: Date.now(), expiresAt: Date.now() + ttl, inFlight: null });
    return merged;
  })().catch(error => {
    if (existing?.value) {
      eventDetailCache.set(sourceId, existing);
      return existing.value;
    }
    eventDetailCache.delete(sourceId);
    throw error;
  });
  eventDetailCache.set(sourceId, { value: existing?.value || null, fetchedAt: existing?.fetchedAt || 0, expiresAt: existing?.expiresAt || 0, inFlight: inFlightDetail });
  return inFlightDetail;
}
export async function sportsbookEventDetail(eventId) {
  const snapshot = cache.value && Date.now() < cache.expiresAt ? cache.value : await refreshSportsbookSource();
  const requested = String(eventId || '');
  const event = snapshot.events.find(item => String(item.id) === requested || String(item.sourceId) === requested);
  if (!event) throw new AppError(404, 'Pertandingan tidak ditemukan pada sumber sportsbook.', 'SPORTS_SOURCE_EVENT_NOT_FOUND');
  const detail = await fetchEventDetail(event);
  const sourceId = String(event.sourceId || event.id);
  if (cache.value?.events?.length) {
    cache.value.events = cache.value.events.map(item => String(item.sourceId || item.id) === sourceId ? mergeSourceEvent(structuredClone(item), detail) : item);
    cache.value.source.quality = snapshotQuality(cache.value.events);
  }
  return detail;
}

async function refreshCache() {
  try {
    const value = applyCachedEventDetails(await collectSnapshot());
    cache = { value, fetchedAt: Date.now(), expiresAt: Date.now() + CACHE_TTL_MS, error: null };
    return value;
  } catch (error) {
    cache.error = { message: error.message, code: error.code || 'SPORTS_SOURCE_ERROR', at: new Date().toISOString(), upstreams: error.upstreams || null };
    logger.error('Sportsbook source refresh failed', {
      code: error.code,
      error: error.message,
      upstreams: (error.upstreams || []).map(item => ({
        url: item.url,
        healthy: Boolean(item.healthy),
        code: item.error?.code || null,
        format: item.diagnostics?.format || null,
        bytes: item.diagnostics?.bytes || null,
        oddsMarkers: item.diagnostics?.oddsMarkers || 0,
        eventMarkers: item.diagnostics?.eventMarkers || 0,
        catalogOnly: Boolean(item.diagnostics?.catalogOnly),
        redirectChain: item.redirectChain || null
      }))
    });
    if (cache.value) return { ...cache.value, stale: true, sourceError: cache.error };
    throw error;
  } finally {
    inFlight = null;
  }
}
export async function refreshSportsbookSource() {
  if (!inFlight) inFlight = refreshCache();
  return inFlight;
}
export async function sportsbookSnapshot({ sport = '', live = '', q = '' } = {}) {
  const now = Date.now();
  const snapshot = cache.value && now < cache.expiresAt
    ? cache.value
    : await refreshSportsbookSource();
  const sportKey = text(sport).toLowerCase();
  const query = text(q).toLowerCase();
  const liveOnly = ['1','true','yes','live'].includes(text(live).toLowerCase());
  const events = snapshot.events.filter(event => {
    if (sportKey && event.sport.toLowerCase() !== sportKey) return false;
    if (liveOnly && !event.live) return false;
    if (query && !`${event.league} ${event.home.name} ${event.away.name}`.toLowerCase().includes(query)) return false;
    return true;
  });
  return {
    ...snapshot,
    events,
    total: events.length,
    stale: Boolean(snapshot.stale || now - cache.fetchedAt > CACHE_TTL_MS * 2),
    sourceError: snapshot.sourceError || cache.error || null
  };
}
export function sportsbookSourceStatus() {
  return {
    configured: Boolean(config.sportsSourceBaseUrl || config.sportsSourceCandidateUrls),
    sourceName: config.sportsSourceName,
    allowedDomain: config.sportsSourceAllowedDomain,
    panelPath: config.sportsSourcePanelPath,
    mainPath: config.sportsSourceMainPath,
    livePath: config.sportsSourceLivePath,
    detailEnabled: config.sportsSourceDetailEnabled,
    detailCacheEntries: eventDetailCache.size,
    scheduleDiscoveryEnabled: config.sportsSourceScheduleDiscoveryEnabled,
    scheduleRefreshSeconds: config.sportsSourceScheduleRefreshSeconds,
    scheduleIndexCacheEntries: scheduleIndexCache.size,
    activeScheduleIndexes: cache.value?.source?.discoveredScheduleIndexes?.length || 0,
    activeIndexCount: cache.value?.source?.activeIndexes?.length || 0,
    candidateCount: configuredSourceUrls().length,
    refreshSeconds: config.sportsSourceRefreshSeconds,
    backgroundPoll: config.sportsSourceBackgroundPollEnabled,
    hasSessionCookie: Boolean(config.sportsSourceCookie),
    browserRendererEnabled: config.sportsSourceBrowserEnabled,
    browserRendererExecutable: config.sportsSourceBrowserExecutable,
    browserRenderer: browserRendererStatus(),
    lastSuccessAt: cache.value?.source?.fetchedAt || null,
    activeUpstream: cache.value?.source?.upstream || null,
    upstreams: cache.value?.upstreams || cache.error?.upstreams || [],
    lastError: cache.error
  };
}

export const __sportsbookParser = Object.freeze({
  parseSourceHtml,
  parseSourcePayload,
  parseJsonDocumentEvents,
  parseSbobetHtmlEvents,
  normalizeEvent,
  normalizeMarketObject,
  snapshotQuality,
  sourcePayloadDiagnostics,
  marketTypeFromLabel,
  normalizePeriod,
  mergeSourceEvent
});
export const __sportsbookSourcePolicy = Object.freeze({ vendorHost, trustedRedirectHost, approvedSourceHost, privateSourceHost, publicIpHost, publicEdgeHopAllowed, trustedAliasHttpHopAllowed, crossDomainMigrationPath, redirectTargetAllowed });
export const __sportsbookSourceInternals = Object.freeze({ loadSourcePageWithBrowserFallback, collectCandidate });
