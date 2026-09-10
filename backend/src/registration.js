import { randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { query } from './db.js';
import { redis } from './redis.js';
import { AppError, assert } from './errors.js';
import { hmac } from './security.js';
import { isValidMemberUsername, isValidMemberEmail } from './registration-policy.js';

const CAPTCHA_TTL_SECONDS = 300;
const CAPTCHA_MIN_AGE_MS = 700;
const CAPTCHA_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CAPTCHA_KEY = id => `registration:captcha:${id}`;

function secureChoice(chars) {
  return chars[randomInt(0, chars.length)];
}

function safeCompareHex(left, right) {
  const a = Buffer.from(String(left || ''), 'hex');
  const b = Buffer.from(String(right || ''), 'hex');
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

function buildCaptchaSvg(answer) {
  const width = 180;
  const height = 54;
  const lineCount = 9;
  const dotCount = 34;
  const lines = Array.from({ length: lineCount }, () => {
    const x1 = randomInt(0, width), y1 = randomInt(0, height), x2 = randomInt(0, width), y2 = randomInt(0, height);
    const opacity = (randomInt(14, 35) / 100).toFixed(2);
    return `<path d="M${x1} ${y1} L${x2} ${y2}" stroke="#8b0f18" stroke-width="${randomInt(1,3)}" opacity="${opacity}"/>`;
  }).join('');
  const dots = Array.from({ length: dotCount }, () => {
    const cx = randomInt(2, width - 2), cy = randomInt(2, height - 2), r = randomInt(1, 3);
    const fill = randomInt(0, 2) ? '#d5b35d' : '#6b1018';
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" opacity="0.28"/>`;
  }).join('');
  const chars = [...answer].map((char, index) => {
    const x = 28 + index * 31 + randomInt(-2, 3);
    const y = 35 + randomInt(-4, 5);
    const rotation = randomInt(-16, 17);
    const fill = index % 2 ? '#7c0c14' : '#201215';
    return `<text x="${x}" y="${y}" transform="rotate(${rotation} ${x} ${y})" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="29" font-weight="900" fill="${fill}">${char}</text>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff9ed"/><stop offset="1" stop-color="#ead7c9"/></linearGradient><filter id="noise"><feTurbulence baseFrequency=".72" numOctaves="2" seed="${randomInt(1,9999)}" type="fractalNoise"/><feColorMatrix values="0 0 0 0 0.42 0 0 0 0 0.07 0 0 0 0 0.10 0 0 0 .10 0"/></filter></defs><rect width="100%" height="100%" rx="7" fill="url(#bg)"/><rect width="100%" height="100%" rx="7" filter="url(#noise)" opacity=".34"/>${dots}${lines}${chars}<path d="M8 28 C44 18 72 40 108 25 S151 18 173 31" fill="none" stroke="#2a1215" stroke-width="2" opacity=".45"/></svg>`;
}

export async function registrationUsernameAvailability(value) {
  const username = String(value ?? '').trim();
  if (!isValidMemberUsername(username)) return { valid: false, available: false };
  const { rows } = await query('SELECT 1 FROM users WHERE username=$1 LIMIT 1', [username]);
  return { valid: true, available: !rows[0] };
}

export async function registrationEmailAvailability(value) {
  const email = String(value ?? '').trim().toLowerCase();
  if (!isValidMemberEmail(email)) return { valid: false, available: false };
  const { rows } = await query('SELECT 1 FROM users WHERE email=$1 LIMIT 1', [email]);
  return { valid: true, available: !rows[0] };
}

// Nomor rekening dianggap "terpakai" apabila milik member aktif (bukan akun
// OWNER/STAFF/operator) sehingga seorang calon member tidak bisa mendaftarkan
// rekening yang sudah dipakai pemain lain (mencegah shared payout account).
export async function registrationAccountNumberAvailability(value) {
  const accountNumber = String(value ?? '').trim();
  if (accountNumber.length < 4 || accountNumber.length > 80) return { valid: false, available: false };
  const { rows } = await query(`SELECT 1 FROM users u
    WHERE u.account_number=$1 AND btrim(u.account_number)<>''
      AND NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id=u.id)
    LIMIT 1`, [accountNumber]);
  return { valid: true, available: !rows[0] };
}

export async function createRegistrationCaptcha() {
  const challengeId = randomUUID();
  const answer = Array.from({ length: 5 }, () => secureChoice(CAPTCHA_CHARSET)).join('');
  const issuedAt = Date.now();
  await redis.set(CAPTCHA_KEY(challengeId), JSON.stringify({ answerHash: hmac(answer), issuedAt }), { EX: CAPTCHA_TTL_SECONDS });
  const svg = buildCaptchaSvg(answer);
  return {
    challengeId,
    image: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
    expiresInSeconds: CAPTCHA_TTL_SECONDS
  };
}

export async function verifyRegistrationCaptcha(input) {
  assert(!String(input.website || '').trim(), 400, 'Verifikasi pendaftaran tidak valid.', 'REGISTRATION_REJECTED');
  const challengeId = String(input.captchaId || '').trim();
  const answer = String(input.captchaAnswer || '').trim().toUpperCase();
  assert(/^[0-9a-f-]{36}$/i.test(challengeId) && /^[A-Z2-9]{5}$/.test(answer), 400, 'Captcha tidak valid.', 'CAPTCHA_INVALID');
  const key = CAPTCHA_KEY(challengeId);
  const raw = await redis.get(key);
  await redis.del(key);
  assert(raw, 400, 'Captcha sudah kedaluwarsa. Muat captcha baru.', 'CAPTCHA_EXPIRED');
  let challenge;
  try { challenge = JSON.parse(raw); } catch { throw new AppError(400, 'Captcha tidak valid.', 'CAPTCHA_INVALID'); }
  assert(Date.now() - Number(challenge.issuedAt || 0) >= CAPTCHA_MIN_AGE_MS, 400, 'Captcha diisi terlalu cepat. Coba kembali.', 'CAPTCHA_TOO_FAST');
  assert(safeCompareHex(challenge.answerHash, hmac(answer)), 400, 'Kode captcha tidak sesuai.', 'CAPTCHA_INVALID');
  return true;
}
