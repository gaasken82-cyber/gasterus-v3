import { createHash, randomUUID } from 'node:crypto';
import { query, tx } from './db.js';
import { redis } from './redis.js';
import { config } from './config.js';
import { AppError, assert } from './errors.js';
import { hmac, hashPassword, randomToken } from './security.js';
import { audit } from './audit.js';
import { logger } from './logger.js';
import { isValidMemberEmail, isValidMemberPassword, isValidMemberUsername } from './registration-policy.js';

const RESET_WINDOW_SECONDS = 15 * 60;
const RESET_MAX_REQUESTS = 3;
const GENERIC_RESPONSE = Object.freeze({
  message: 'Jika data terdaftar, tautan reset password akan dikirim ke email Anda.'
});

const hashResetToken = token => createHash('sha256').update(String(token), 'utf8').digest('hex');

async function limitForgotPassword(identifier) {
  const key = `rate:member-forgot-password:${hmac(identifier)}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, RESET_WINDOW_SECONDS);
  if (count > RESET_MAX_REQUESTS) {
    throw new AppError(429, 'Terlalu banyak permintaan. Coba kembali dalam 15 menit.', 'RATE_LIMITED');
  }
}

function createResetUrl(rawToken) {
  let url;
  try { url = new URL(config.frontendResetUrl); }
  catch { throw new Error('FRONTEND_RESET_URL must be a valid absolute URL'); }
  if (url.protocol !== 'https:') throw new Error('FRONTEND_RESET_URL must use HTTPS');
  url.searchParams.set('token', rawToken);
  return url.toString();
}

async function sendResetEmail(email, rawToken) {
  if (!config.resendApiKey || !config.resendFromEmail) {
    throw new Error('RESEND_API_KEY and RESEND_FROM_EMAIL must be configured');
  }
  const resetUrl = createResetUrl(rawToken);
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.resendApiKey}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      from: config.resendFromEmail,
      to: [email],
      subject: 'Reset password akun Gasterus',
      html: `<p>Halo,</p><p>Kami menerima permintaan reset password akun Gasterus Anda.</p><p><a href="${resetUrl}">Buat password baru</a></p><p>Tautan berlaku 15 menit dan hanya dapat digunakan satu kali. Jika Anda tidak meminta reset password, abaikan email ini.</p>`,
      text: `Reset password akun Gasterus: ${resetUrl}\n\nTautan berlaku 15 menit dan hanya dapat digunakan satu kali. Abaikan email ini jika Anda tidak meminta reset password.`
    }),
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`Resend request failed with HTTP ${response.status}`);
}

export async function requestMemberPasswordReset(input, ip = '', userAgent = '') {
  const email = String(input.email ?? '').trim().toLowerCase();
  const username = String(input.username ?? '').trim();
  assert(Boolean(email) !== Boolean(username), 400, 'Isi email atau username.', 'RESET_IDENTIFIER_REQUIRED');
  if (email) assert(isValidMemberEmail(email), 400, 'Format email tidak valid.', 'EMAIL_INVALID');
  else assert(isValidMemberUsername(username), 400, 'Format username tidak valid.', 'USERNAME_INVALID');

  const identifier = email || username;
  await limitForgotPassword(identifier);
  const lookup = email
    ? await query(`SELECT u.id,u.email FROM users u WHERE u.email=$1 AND u.status='ACTIVE' AND u.email IS NOT NULL AND btrim(u.email::text)<>'' AND NOT EXISTS(SELECT 1 FROM user_roles ur WHERE ur.user_id=u.id) LIMIT 1`, [email])
    : await query(`SELECT u.id,u.email FROM users u WHERE u.username=$1 AND u.status='ACTIVE' AND u.email IS NOT NULL AND btrim(u.email::text)<>'' AND NOT EXISTS(SELECT 1 FROM user_roles ur WHERE ur.user_id=u.id) LIMIT 1`, [username]);
  const user = lookup.rows[0];

  if (user) {
    const rawToken = randomToken(32);
    try {
      await query(`INSERT INTO password_reset_tokens(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '15 minutes')`, [randomUUID(), user.id, hashResetToken(rawToken)]);
      await sendResetEmail(user.email, rawToken);
    } catch (error) {
      logger.error('Password reset email delivery failed', { userId: user.id, error: error.message, ip, userAgent });
    }
  }
  return { ...GENERIC_RESPONSE };
}

export async function resetMemberPasswordByToken(input, ip = '') {
  const rawToken = String(input.token ?? '').trim();
  const newPassword = String(input.newPassword ?? '');
  assert(/^[A-Za-z0-9_-]{43}$/.test(rawToken), 400, 'Token reset password tidak valid atau sudah kedaluwarsa.', 'RESET_TOKEN_INVALID');
  assert(isValidMemberPassword(newPassword), 400, 'Password baru harus 8-72 karakter serta mengandung huruf dan angka.', 'PASSWORD_INVALID');

  const passwordHash = await hashPassword(newPassword);
  const tokenHash = hashResetToken(rawToken);
  await tx(async client => {
    const found = await client.query(`SELECT t.user_id FROM password_reset_tokens t JOIN users u ON u.id=t.user_id WHERE t.token_hash=$1 AND t.used_at IS NULL AND t.expires_at>now() AND u.status='ACTIVE' AND NOT EXISTS(SELECT 1 FROM user_roles ur WHERE ur.user_id=u.id) FOR UPDATE OF t`, [tokenHash]);
    assert(found.rows[0], 400, 'Token reset password tidak valid atau sudah kedaluwarsa.', 'RESET_TOKEN_INVALID');
    const ownerId = found.rows[0].user_id;
    const updated = await client.query(`UPDATE users SET password_hash=$1,updated_at=now() WHERE id=$2 RETURNING id`, [passwordHash, ownerId]);
    assert(updated.rows[0], 400, 'Token reset password tidak valid atau sudah kedaluwarsa.', 'RESET_TOKEN_INVALID');
    await client.query(`UPDATE password_reset_tokens SET used_at=now() WHERE user_id=$1 AND used_at IS NULL`, [ownerId]);
    await audit({ actorRole: 'SYSTEM', action: 'MEMBER_PASSWORD_RESET', targetType: 'USER', targetId: ownerId, ip, client });
  });
  return { ok: true, message: 'Password berhasil diperbarui. Silakan masuk.' };
}
