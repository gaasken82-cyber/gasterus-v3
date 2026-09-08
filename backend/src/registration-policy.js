export const MEMBER_USERNAME_RE = /^[A-Za-z0-9_]{3,12}$/;
export const MEMBER_PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d).{8,72}$/;

export function isValidMemberUsername(value) {
  return MEMBER_USERNAME_RE.test(String(value ?? '').trim());
}

export function isValidMemberPassword(value) {
  return MEMBER_PASSWORD_RE.test(String(value ?? ''));
}

export function isValidMemberEmail(value) {
  const email = String(value ?? '').trim();
  if (!email || email.length > 254 || /\s/.test(email)) return false;
  const parts = email.split('@');
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  if (!local || local.length > 64 || !domain || domain.length > 253) return false;
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false;
  if (!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)) return false;
  const labels = domain.split('.');
  if (labels.length < 2 || labels.some(label => !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label))) return false;
  return /^[A-Za-z]{2,63}$/.test(labels.at(-1));
}
