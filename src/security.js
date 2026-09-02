import { HttpError } from './http.js';

export const SESSION_COOKIE = 'blexo_session';
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
// O runtime Web Crypto dos Workers limita PBKDF2 a 100 mil iterações.
// Mantemos o maior custo aceito em produção para evitar falhas no cadastro.
const PASSWORD_ITERATIONS = 100000;
const encoder = new TextEncoder();

const bytesToBase64Url = bytes => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const base64UrlToBytes = value => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
};

export function randomToken(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

export async function sha256(value) {
  const input = value instanceof ArrayBuffer
    ? value
    : ArrayBuffer.isView(value)
      ? value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)
      : encoder.encode(String(value));
  const digest = await crypto.subtle.digest('SHA-256', input);
  return bytesToBase64Url(new Uint8Array(digest));
}

export function validatePassword(password) {
  const value = String(password || '');
  if (value.length < 8) throw new HttpError(400, 'A senha deve possuir ao menos 8 caracteres.');
  if (value.length > 128) throw new HttpError(400, 'A senha informada é muito longa.');
  return value;
}

export function normalizeUsername(username) {
  const value = String(username || '').trim().toLocaleLowerCase('pt-BR');
  if (!/^[a-z0-9._@-]{3,80}$/i.test(value)) {
    throw new HttpError(400, 'Use um usuário válido com pelo menos 3 caracteres.');
  }
  return value;
}

export async function hashPassword(password) {
  const checked = validatePassword(password);
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const material = await crypto.subtle.importKey(
    'raw', encoder.encode(checked), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits({
    name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PASSWORD_ITERATIONS
  }, material, 256);
  return `pbkdf2-sha256$${PASSWORD_ITERATIONS}$${bytesToBase64Url(salt)}$${bytesToBase64Url(new Uint8Array(bits))}`;
}

export async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2-sha256') return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 10000 || iterations > 1000000) return false;
  let salt, expected;
  try {
    salt = base64UrlToBytes(parts[2]);
    expected = base64UrlToBytes(parts[3]);
  } catch {
    return false;
  }
  const material = await crypto.subtle.importKey(
    'raw', encoder.encode(String(password || '')), 'PBKDF2', false, ['deriveBits']
  );
  const bits = new Uint8Array(await crypto.subtle.deriveBits({
    name: 'PBKDF2', hash: 'SHA-256', salt, iterations
  }, material, expected.length * 8));
  if (bits.length !== expected.length) return false;
  let difference = 0;
  for (let i = 0; i < bits.length; i++) difference |= bits[i] ^ expected[i];
  return difference === 0;
}

export function readCookie(request, name) {
  const header = request.headers.get('cookie') || '';
  for (const item of header.split(';')) {
    const separator = item.indexOf('=');
    if (separator < 0) continue;
    if (item.slice(0, separator).trim() === name) {
      return decodeURIComponent(item.slice(separator + 1).trim());
    }
  }
  return null;
}

export function sessionCookie(request, token, maxAge = SESSION_MAX_AGE_SECONDS) {
  const url = new URL(request.url);
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly${secure}; SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearSessionCookie(request) {
  return sessionCookie(request, '', 0);
}
