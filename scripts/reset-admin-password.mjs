import { randomBytes } from 'node:crypto';
import pg from '../backend/node_modules/pg/lib/index.js';
import { hashPassword, encryptSecret, generateTotpSecret, totp } from '../backend/src/security.js';

const { Pool } = pg;
const newPassword = process.env.NEW_PASSWORD || 'GasTerus#2026!Admin';
const username = process.env.TARGET_USERNAME || 'owner';
const secret = generateTotpSecret();

const dbUrl = process.env.DATABASE_URL_OVERRIDE || 'postgresql://postgres:NhZftJLLQIxhtLoHTxmhftbElWxRgFQL@yamanote.proxy.rlwy.net:35054/railway';
const pool = new Pool({ connectionString: dbUrl });

try {
  const hash = await hashPassword(newPassword);
  const encryptedSecret = encryptSecret(secret);

  const res = await pool.query(
    `UPDATE users 
     SET password_hash = $1, 
         mfa_enabled = true, 
         mfa_secret_encrypted = $2, 
         status = 'ACTIVE', 
         updated_at = now() 
     WHERE username = $3 
     RETURNING id, username`,
    [hash, encryptedSecret, username]
  );

  if (res.rowCount === 0) {
    console.error(`User ${username} not found!`);
    process.exit(1);
  } else {
    const issuer = encodeURIComponent('SBOTOTO Enterprise');
    const label = encodeURIComponent(`SBOTOTO:${username}`);
    const otpauth = `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
    console.log('=== ADMIN CREDENTIALS RESET SUCCESS ===');
    console.log(JSON.stringify({
      success: true,
      username,
      password: newPassword,
      totpSecret: secret,
      otpauthUri: otpauth,
      currentOtp: totp(secret)
    }, null, 2));
  }
} catch (err) {
  console.error('Error resetting credentials:', err);
  process.exit(1);
} finally {
  await pool.end();
}
