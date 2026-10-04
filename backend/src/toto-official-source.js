import { fetchTotoHtml, mapLimit, renderTotoSource } from './toto-source-fetch.js';
import { config } from './config.js';
import { htmlLines } from './toto-collector-core.js';

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const textOf = html => htmlLines(html).join(' ');
const token = value => clean(value).replace(/[^0-9]/g, '');
const oneDigit = value => {
  const raw = token(value);
  if (!/^\d{1,2}$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 9 ? String(n) : null;
};
const four = values => {
  const digits = values.map(oneDigit);
  return digits.length >= 4 && digits.slice(0, 4).every(Boolean) ? digits.slice(0, 4).join('') : null;
};

const MONTHS = Object.freeze({
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12
});
function isoParts(year, month, day) {
  const y = Number(year), m = Number(month), d = Number(day);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d) || y < 2020 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
function inferYear(month, day) {
  const now = new Date();
  let year = now.getUTCFullYear();
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (candidate.getTime() > now.getTime() + 7 * 86400000) year -= 1;
  return year;
}
export function officialDate(value) {
  const raw = clean(value).replace(/(\d)(st|nd|rd|th)\b/gi, '$1');
  let m = raw.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (m) return isoParts(m[1], m[2], m[3]);
  m = raw.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2}|20\d{2})\b/);
  if (m) {
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return isoParts(year, m[1], m[2]); // official US operator pages use MM/DD[/YY]
  }
  m = raw.match(/\b(?:mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)?\s*[,/]?\s*([A-Za-z]{3,9})\s+(\d{1,2})(?:,\s*|\s+)(20\d{2})\b/i);
  if (m && MONTHS[m[1].toLowerCase()]) return isoParts(m[3], MONTHS[m[1].toLowerCase()], m[2]);
  m = raw.match(/\b(?:mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)?\s*[,/]?\s*([A-Za-z]{3,9})\s+(\d{1,2})\b/i);
  if (m && MONTHS[m[1].toLowerCase()]) {
    const month = MONTHS[m[1].toLowerCase()], day = Number(m[2]);
    return isoParts(inferYear(month, day), month, day);
  }
  m = raw.match(/\b(?:mon|tue|wed|thu|fri|sat|sun)\s*\/\s*([A-Za-z]{3})\s+(\d{1,2}),\s*(20\d{2})\b/i);
  if (m && MONTHS[m[1].toLowerCase()]) return isoParts(m[3], MONTHS[m[1].toLowerCase()], m[2]);
  return null;
}

function observation(source, slug, result, drawDate, session = null) {
  if (!/^\d{4}$/.test(String(result || '')) || !drawDate) return null;
  return {
    slug,
    result: String(result),
    drawDate,
    drawTime: null,
    session,
    source: source.code,
    sourceName: source.name,
    sourceUrl: source.url,
    authority: 'OFFICIAL'
  };
}
function collectAfter(lines, start, limit = 16, count = 5) {
  const out = [];
  for (let i = start + 1; i < Math.min(lines.length, start + limit + 1); i += 1) {
    const line = clean(lines[i]);
    if (/fire\s*ball|wild\s*ball|super\s*ball/i.test(line)) break;
    if (officialDate(line)) continue;
    const direct = oneDigit(line);
    if (direct !== null) out.push(direct);
    else if (/^(?:0?\d[\s,|/-]+){1,9}0?\d$/.test(line)) {
      for (const part of line.match(/\b\d{1,2}\b/g) || []) {
        const digit = oneDigit(part);
        if (digit !== null) out.push(digit);
        if (out.length >= count) break;
      }
    }
    if (out.length >= count) break;
  }
  return out;
}
function latestBySession(items) {
  const rank = { morning: 1, midday: 2, day: 2, evening: 3, night: 4 };
  return [...items].sort((a, b) => a.drawDate.localeCompare(b.drawDate) || (rank[a.session] || 0) - (rank[b.session] || 0)).at(-1) || null;
}


function parseSingapore(source, html) {
  const text = textOf(html);
  const m = text.match(/(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,?\s+(\d{1,2})\s+([A-Za-z]{3,9})\s+(20\d{2})\s*\|?\s*Draw\s+No\.?\s*\d+[\s\S]{0,420}?1st\s+Prize\s*\|?\s*(\d{4})/i)
    || text.match(/Draw\s+Date[^\d]*(\d{1,2})[\/-](\d{1,2})[\/-](20\d{2})[\s\S]{0,420}?1st\s+Prize[^\d]*(\d{4})/i);
  if (!m) return [];
  let date;
  if (/^[A-Za-z]/.test(String(m[2] || ''))) date = officialDate(`${m[2]} ${m[1]}, ${m[3]}`);
  else date = isoParts(m[3], m[2], m[1]);
  return [observation(source, 'singapore-pool', m[4], date)].filter(Boolean);
}

function parseGeorgia(source, html) {
  const text = textOf(html);
  const anchor = text.search(/Play\s+Cash\s+4/i);
  if (anchor < 0) return [];
  const segment = text.slice(anchor, anchor + 1800);
  const items = [];
  const sessions = [
    ['MIDDAY', 'georgia-mid-pool', 'midday'],
    ['EVENING', 'georgia-eve-pool', 'evening'],
    ['NIGHT', 'georgia-ngt-pool', 'night']
  ];
  for (const [label, slug, session] of sessions) {
    const re = new RegExp(String.raw`\b${label}\s+(\d{1,2}\/\d{1,2}\/20\d{2})\s+(\d)\s+(\d)\s+(\d)\s+(\d)`, 'i');
    const m = segment.match(re);
    if (!m) continue;
    items.push(observation(source, slug, `${m[2]}${m[3]}${m[4]}${m[5]}`, officialDate(m[1]), session));
  }
  return items.filter(Boolean);
}

function parsePcso(source, html) {
  const lines = htmlLines(html);
  const found = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!/^4DL$/i.test(lines[i])) continue;
    const window = lines.slice(i, i + 22);
    const date = window.map(officialDate).find(Boolean);
    if (!date) continue;
    const dateIndex = window.findIndex(x => officialDate(x) === date);
    const digits = [];
    for (let j = dateIndex + 1; j < window.length && digits.length < 4; j += 1) {
      if (/^[₱$]/.test(window[j])) continue;
      const d = oneDigit(window[j]);
      if (d !== null) digits.push(d);
    }
    const result = four(digits);
    if (result) found.push(observation(source, 'pcso-pool', result, date));
  }
  return found.filter(Boolean).sort((a, b) => a.drawDate.localeCompare(b.drawDate)).slice(-1);
}

function parseCalifornia(source, html) {
  const lines = htmlLines(html);
  for (let i = 0; i < lines.length; i += 1) {
    const date = officialDate(lines[i]);
    if (!date) continue;
    const context = lines.slice(Math.max(0, i - 5), i + 2).join(' ');
    if (!/winning numbers|daily 4/i.test(context)) continue;
    const result = four(collectAfter(lines, i, 14, 4));
    if (result) return [observation(source, 'california-pool', result, date)].filter(Boolean);
  }
  return [];
}

function parseWisconsin(source, html) {
  const lines = htmlLines(html), items = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!/^Pick 4$/i.test(lines[i])) continue;
    let date = null, session = null;
    for (let j = i - 1; j >= Math.max(0, i - 5); j -= 1) {
      date ||= officialDate(lines[j]);
      const sm = lines[j].match(/\b(Midday|Evening)\b/i);
      if (sm) session ||= sm[1].toLowerCase();
    }
    const result = four(collectAfter(lines, i, 8, 4));
    if (date && result) items.push(observation(source, 'wisconsin-pool', result, date, session));
  }
  const latest = latestBySession(items.filter(Boolean));
  return latest ? [latest] : [];
}

function parseMaryland(source, html) {
  const lines = htmlLines(html), items = [];
  for (let i = 0; i < lines.length; i += 1) {
    const date = officialDate(lines[i]);
    const sm = lines[i].match(/\b(Midday|Evening)\b/i);
    if (!date || !sm) continue;
    const digits = [];
    for (let j = i + 1; j < Math.min(lines.length, i + 30) && digits.length < 12; j += 1) {
      if (officialDate(lines[j])) break;
      const d = oneDigit(lines[j]);
      if (d !== null) digits.push(d);
    }
    if (digits.length < 7) continue;
    const result = four(digits.slice(3, 7)); // Pick 3 (3 digits), then Pick 4 (4 digits)
    if (!result) continue;
    const session = sm[1].toLowerCase();
    const slug = session === 'midday' ? 'maryland-mid-pool' : 'maryland-eve-pool';
    items.push(observation(source, slug, result, date, session));
  }
  const bySlug = new Map();
  for (const item of items.filter(Boolean)) if (!bySlug.has(item.slug) || bySlug.get(item.slug).drawDate < item.drawDate) bySlug.set(item.slug, item);
  return [...bySlug.values()];
}

function parseIndiana(source, html) {
  const lines = htmlLines(html), items = [];
  for (let i = 0; i < lines.length; i += 1) {
    const m = lines[i].match(/\b(Midday|Evening)\b/i);
    if (!m) continue;
    const date = officialDate(lines[i]) || lines.slice(i, i + 4).map(officialDate).find(Boolean);
    if (!date) continue;
    const result = four(collectAfter(lines, i, 10, 5));
    if (!result) continue;
    const session = m[1].toLowerCase();
    const slug = session === 'midday' ? 'indiana-mid-pool' : 'indiana-eve-pool';
    items.push(observation(source, slug, result, date, session));
  }
  const bySlug = new Map();
  for (const item of items.filter(Boolean)) if (!bySlug.has(item.slug) || bySlug.get(item.slug).drawDate < item.drawDate) bySlug.set(item.slug, item);
  return [...bySlug.values()];
}

function parseTennessee(source, html) {
  const lines = htmlLines(html), items = [];
  let currentDate = null;
  for (let i = 0; i < lines.length; i += 1) {
    currentDate = officialDate(lines[i]) || currentDate;
    const m = lines[i].match(/^(morning|midday|evening)$/i);
    if (!m || !currentDate) continue;
    const result = four(collectAfter(lines, i, 8, 5));
    if (!result) continue;
    const session = m[1].toLowerCase();
    const slug = session === 'morning' ? 'tennesse-mor-pool' : session === 'midday' ? 'tennessee-mid-pool' : 'tennessee-eve-pool';
    items.push(observation(source, slug, result, currentDate, session));
  }
  const bySlug = new Map();
  for (const item of items.filter(Boolean)) if (!bySlug.has(item.slug) || bySlug.get(item.slug).drawDate < item.drawDate) bySlug.set(item.slug, item);
  return [...bySlug.values()];
}

function parseTexas(source, html) {
  const lines = htmlLines(html), items = [];
  for (let i = 0; i < lines.length; i += 1) {
    const m = lines[i].match(/(\d{1,2}\/\d{1,2}\/20\d{2}).*\b(Morning|Day|Evening|Night)\b/i);
    if (!m) continue;
    const date = officialDate(m[1]), session = m[2].toLowerCase();
    const result = four(collectAfter(lines, i, 10, 4));
    if (!date || !result) continue;
    const slug = session === 'morning' ? 'texas-mor-pool' : session === 'day' ? 'texas-day-pool' : session === 'evening' ? 'texas-eve-pool' : 'texas-night-pool';
    items.push(observation(source, slug, result, date, session));
  }
  const bySlug = new Map();
  for (const item of items.filter(Boolean)) if (!bySlug.has(item.slug) || bySlug.get(item.slug).drawDate < item.drawDate) bySlug.set(item.slug, item);
  return [...bySlug.values()];
}

function parseIllinois(source, html) {
  const text = textOf(html), items = [];
  const re = /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+([A-Za-z]{3})\s+(\d{1,2}),\s+(20\d{2})\s+(evening|midday)\s+(\d)\s+(\d)\s+(\d)\s+(\d)(?:\s+\d)?/gi;
  for (const m of text.matchAll(re)) {
    const date = officialDate(`${m[1]} ${m[2]}, ${m[3]}`), session = m[4].toLowerCase(), result = `${m[5]}${m[6]}${m[7]}${m[8]}`;
    const slug = session === 'midday' ? 'illinois-mid-pool' : 'illinois-eve-pool';
    items.push(observation(source, slug, result, date, session));
  }
  const bySlug = new Map();
  for (const item of items.filter(Boolean)) if (!bySlug.has(item.slug) || bySlug.get(item.slug).drawDate < item.drawDate) bySlug.set(item.slug, item);
  return [...bySlug.values()];
}

function parseMissouri(source, html) {
  const text = textOf(html), items = [];
  const re = /\b(20\d{2}-\d{2}-\d{2})\s+(Evening|Midday)\s+(\d)\s+(\d)\s+(\d)\s+(\d)(?:\s+\d)?/gi;
  for (const m of text.matchAll(re)) {
    const date = officialDate(m[1]), session = m[2].toLowerCase(), result = `${m[3]}${m[4]}${m[5]}${m[6]}`;
    const slug = session === 'midday' ? 'missouri-mid-pool' : 'missouri-eve-pool';
    items.push(observation(source, slug, result, date, session));
  }
  if (!items.length) {
    const lines = htmlLines(html); let currentDate = null;
    for (let i = 0; i < lines.length; i += 1) {
      currentDate = officialDate(lines[i]) || currentDate;
      const sm = lines[i].match(/^(Evening|Midday)$/i);
      if (!sm || !currentDate) continue;
      const result = four(collectAfter(lines, i, 8, 4));
      if (!result) continue;
      const session = sm[1].toLowerCase();
      items.push(observation(source, session === 'midday' ? 'missouri-mid-pool' : 'missouri-eve-pool', result, currentDate, session));
    }
  }
  const bySlug = new Map();
  for (const item of items.filter(Boolean)) if (!bySlug.has(item.slug) || bySlug.get(item.slug).drawDate < item.drawDate) bySlug.set(item.slug, item);
  return [...bySlug.values()];
}

function parseVirginia(source, html) {
  const text = textOf(html), items = [];
  const dateMatch = text.match(/(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d{1,2}\/\d{1,2}\/20\d{2})\s+Winning Numbers/i)
    || text.match(/Latest Drawing:\s*(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)?\s*(\d{1,2}\/\d{1,2}\/20\d{2})/i);
  const date = dateMatch ? officialDate(dateMatch[1]) : null;
  if (!date) return [];
  const day = text.match(/\bDAY:\s*(\d)\s+(\d)\s+(\d)\s+(\d)(?:\s+\d\s+FIREBALL)?/i);
  const night = text.match(/\bNIGHT:\s*(\d)\s+(\d)\s+(\d)\s+(\d)(?:\s+\d\s+FIREBALL)?/i);
  if (day) items.push(observation(source, 'virginia-day-pool', `${day[1]}${day[2]}${day[3]}${day[4]}`, date, 'day'));
  if (night) items.push(observation(source, 'virginia-ngt-pool', `${night[1]}${night[2]}${night[3]}${night[4]}`, date, 'night'));
  return items.filter(Boolean);
}

function parseNorthCarolina(source, html) {
  const lines = htmlLines(html), items = [];
  // The Pick 4 page places its own latest Daytime/Evening pair before the generic cross-game cards.
  for (const sessionLabel of ['Daytime', 'Evening']) {
    const index = lines.findIndex(line => new RegExp(`^Latest ${sessionLabel} Drawing`, 'i').test(line));
    if (index < 0) continue;
    const date = officialDate(lines[index]);
    const digits = collectAfter(lines, index, 10, 5);
    const result = four(digits);
    if (!date || !result) continue;
    const session = sessionLabel.toLowerCase();
    items.push(observation(source, session === 'daytime' ? 'northcaroday-pool' : 'northcaroeve-pool', result, date, session));
  }
  return items.filter(Boolean);
}


function parseNewYork(source, payload) {
  let rows;
  try { rows = JSON.parse(String(payload || '')); } catch { return []; }
  if (!Array.isArray(rows)) return [];
  const items = [];
  for (const row of rows) {
    const date = officialDate(String(row?.draw_date || '').slice(0, 10));
    if (!date) continue;
    const midday = token(row?.midday_win_4);
    const evening = token(row?.evening_win_4);
    if (/^\d{4}$/.test(midday)) items.push(observation(source, 'newyork-mid-pool', midday, date, 'midday'));
    if (/^\d{4}$/.test(evening)) items.push(observation(source, 'newyork-eve-pool', evening, date, 'evening'));
  }
  const bySlug = new Map();
  for (const item of items.filter(Boolean)) if (!bySlug.has(item.slug) || bySlug.get(item.slug).drawDate < item.drawDate) bySlug.set(item.slug, item);
  return [...bySlug.values()];
}

function parseNewJersey(source, html) {
  const lines = htmlLines(html), items = [];
  let anchor = lines.findIndex(line => /PICK-4 BRINGS/i.test(line));
  if (anchor < 0) anchor = lines.findIndex(line => /^Pick-4$/i.test(line));
  if (anchor < 0) return [];
  for (let i = anchor; i < Math.min(lines.length, anchor + 55); i += 1) {
    const m = lines[i].match(/^(MIDDAY|EVENING)\s*\(([^)]+)\)/i);
    if (!m) continue;
    const date = officialDate(m[2]), session = m[1].toLowerCase();
    const result = four(collectAfter(lines, i, 10, 5));
    if (!date || !result) continue;
    items.push(observation(source, session === 'midday' ? 'newjersey-mid-pool' : 'newjerseyeve-pool', result, date, session));
  }
  return items.filter(Boolean);
}

const PARSERS = Object.freeze({
  singapore: parseSingapore,
  georgia: parseGeorgia,
  pcso: parsePcso,
  california: parseCalifornia,
  wisconsin: parseWisconsin,
  maryland: parseMaryland,
  indiana: parseIndiana,
  tennessee: parseTennessee,
  texas: parseTexas,
  illinois: parseIllinois,
  missouri: parseMissouri,
  virginia: parseVirginia,
  northcarolina: parseNorthCarolina,
  newjersey: parseNewJersey,
  newyork: parseNewYork
});

export const TOTO_OFFICIAL_SOURCES = Object.freeze([
  { code: 'official-singapore', browserFallback: true, name: 'Singapore Pools 4D', url: 'https://www.singaporepools.com.sg/en/product/pages/4d_results.aspx', parser: 'singapore' },
  { code: 'official-georgia', browserFallback: true, name: 'Georgia Lottery', url: 'https://www.galottery.com/en-us/winning-numbers.html', parser: 'georgia' },
  { code: 'official-pcso', browserFallback: true, name: 'PCSO LottoMatik', url: 'https://lottomatik.pcso.gov.ph/lotto-results', parser: 'pcso' },
  { code: 'official-california', name: 'California State Lottery', url: 'https://scorigin.calottery.com/en/draw-games/daily-4', parser: 'california' },
  { code: 'official-wisconsin', name: 'Wisconsin Lottery', url: 'https://wilottery.com/winners/draw-history?game=pick-4', parser: 'wisconsin' },
  { code: 'official-maryland', browserFallback: true, name: 'Maryland Lottery', url: 'https://www.mdlottery.com/player-tools/winning-numbers/', parser: 'maryland' },
  { code: 'official-indiana', name: 'Hoosier Lottery', url: 'https://hoosierlottery.com/games/draw/daily-4/', parser: 'indiana' },
  { code: 'official-tennessee', browserFallback: true, name: 'Tennessee Lottery', url: 'https://tnlottery.com/winning-numbers/cash4/', parser: 'tennessee' },
  { code: 'official-texas', name: 'Texas Lottery', url: 'https://www.texaslottery.com/export/sites/lottery/Games/Daily_4/', parser: 'texas' },
  { code: 'official-illinois', browserFallback: true, name: 'Illinois Lottery', url: 'https://www.illinoislottery.com/dbg/results/pick4/', parser: 'illinois' },
  { code: 'official-missouri', browserFallback: true, name: 'Missouri Lottery', url: 'https://www.lotterydirect.molottery.com/pick4/winning-numbers.do', parser: 'missouri' },
  { code: 'official-virginia', name: 'Virginia Lottery', url: 'https://www.valottery.com/data/draw-games/pick-4', parser: 'virginia' },
  { code: 'official-northcarolina', browserFallback: true, name: 'NC Education Lottery', url: 'https://nclottery.com/Pick4', parser: 'northcarolina' },
  { code: 'official-newjersey', browserFallback: true, name: 'New Jersey Lottery', url: 'https://www.njlottery.com/en-us/home.html/Pick4', parser: 'newjersey' },
  { code: 'official-newyork', name: 'New York State Gaming Commission Open Data', url: 'https://data.ny.gov/resource/hsys-3def.json?$limit=5&$order=draw_date%20DESC', parser: 'newyork' }
]);

export const OFFICIAL_MARKET_SLUGS = Object.freeze(new Set([
  'singapore-pool',
  'georgia-mid-pool','georgia-eve-pool','georgia-ngt-pool',
  'pcso-pool','california-pool','wisconsin-pool',
  'maryland-mid-pool','maryland-eve-pool',
  'indiana-mid-pool','indiana-eve-pool',
  'tennesse-mor-pool','tennessee-mid-pool','tennessee-eve-pool',
  'texas-mor-pool','texas-day-pool','texas-eve-pool','texas-night-pool',
  'illinois-mid-pool','illinois-eve-pool',
  'missouri-mid-pool','missouri-eve-pool',
  'virginia-day-pool','virginia-ngt-pool',
  'northcaroday-pool','northcaroeve-pool',
  'newjersey-mid-pool','newjerseyeve-pool',
  'newyork-mid-pool','newyork-eve-pool'
]));

export function parseOfficialSource(source, html) {
  const parser = PARSERS[source.parser];
  return parser ? parser(source, html) : [];
}

let officialBrowserCursor = 0;
const officialRenderedCache = new Map();
const OFFICIAL_BROWSER_PRIORITY = Object.freeze(['official-singapore','official-maryland','official-pcso','official-northcarolina','official-georgia','official-tennessee','official-illinois','official-missouri','official-newjersey']);

function cachedOfficial(code, now = Date.now()) {
  const cached = officialRenderedCache.get(code);
  if (!cached) return null;
  if (now - cached.cachedAt > config.totoBrowserFallbackCacheSeconds * 1000) {
    officialRenderedCache.delete(code);
    return null;
  }
  return { ...cached.result, renderer: `${cached.result.renderer || 'CHROMIUM_CDP'}_CACHE`, renderCacheAgeMs: now - cached.cachedAt };
}

export async function collectOfficialTotoSources(fetchImpl = fetch, renderImpl = renderTotoSource) {
  const initial = await mapLimit(TOTO_OFFICIAL_SOURCES, 2, async source => {
    const started = Date.now();
    try {
      const html = await fetchTotoHtml({ ...source, requestProfile: 'browser-en' }, fetchImpl);
      const observations = parseOfficialSource(source, html);
      return { ...source, ok: true, observations, parsedMarkets: observations.length, bytes: Buffer.byteLength(html), latencyMs: Date.now() - started, error: observations.length ? null : 'TOTO_OFFICIAL_PARSE_EMPTY' };
    } catch (error) {
      return { ...source, ok: false, observations: [], parsedMarkets: 0, bytes: 0, latencyMs: Date.now() - started, error: clean(error.message) };
    }
  });

  const candidates = initial.filter(item => item.browserFallback && Number(item.parsedMarkets || 0) === 0)
    .sort((a,b) => OFFICIAL_BROWSER_PRIORITY.indexOf(a.code) - OFFICIAL_BROWSER_PRIORITY.indexOf(b.code));
  const max = Math.min(config.totoOfficialBrowserFallbackMaxSources, candidates.length);
  const selected = [];
  for (let offset = 0; offset < max; offset += 1) selected.push(candidates[(officialBrowserCursor + offset) % candidates.length]);
  if (candidates.length && max) officialBrowserCursor = (officialBrowserCursor + max) % candidates.length;
  const replacements = new Map();
  for (const source of selected) {
    const started = Date.now();
    const rendered = await renderImpl({ ...source, browserFallback: true });
    const observations = rendered?.ok ? parseOfficialSource(source, rendered.html) : [];
    if (observations.length) {
      const result = { ...source, ...rendered, ok: true, observations, parsedMarkets: observations.length, bytes: Buffer.byteLength(String(rendered.html || '')), latencyMs: Number(source.latencyMs || 0) + (Date.now() - started), error: null };
      officialRenderedCache.set(source.code, { result, cachedAt: Date.now() });
      replacements.set(source.code, result);
    } else {
      replacements.set(source.code, cachedOfficial(source.code) || { ...source, ...rendered, observations: [], parsedMarkets: 0, error: rendered?.error || 'TOTO_OFFICIAL_PARSE_EMPTY' });
    }
  }
  for (const source of candidates) {
    if (replacements.has(source.code)) continue;
    const cached = cachedOfficial(source.code);
    if (cached) replacements.set(source.code, cached);
  }
  return initial.map(source => replacements.get(source.code) || source);
}

export function officialDecision(slug, officialResults) {
  const observations = officialResults.flatMap(source => source.ok ? source.observations.filter(item => item.slug === slug) : []);
  if (!observations.length) return null;
  const latest = [...observations].sort((a, b) => a.drawDate.localeCompare(b.drawDate)).at(-1);
  return {
    slug,
    status: 'VERIFIED',
    result: latest.result,
    drawDate: latest.drawDate,
    drawTime: latest.drawTime,
    confidence: 1,
    sources: [latest.sourceName],
    observations: [latest],
    authority: 'OFFICIAL',
    sourceUrl: latest.sourceUrl
  };
}

export const __officialToto = Object.freeze({ PARSERS, oneDigit, four, textOf, latestBySession });
