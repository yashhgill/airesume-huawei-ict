/** Password hashing (PBKDF2-SHA256) and JWT (HS256) using WebCrypto only,
 *  so it runs unchanged on Cloudflare Workers and Node 22. */
const enc = new TextEncoder();
const ITER = 100_000; // Workers caps PBKDF2 at 100k iterations

const b64u = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64u = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
};

async function pbkdf2(password: string, salt: Uint8Array) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITER }, key, 256);
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITER}$${b64u(salt)}$${b64u(await pbkdf2(password, salt))}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [alg, , salt, hash] = stored.split('$');
  if (alg !== 'pbkdf2' || !salt || !hash) return false;
  const got = b64u(await pbkdf2(password, unb64u(salt)));
  if (got.length !== hash.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function signJwt(payload: Record<string, unknown>, secret: string, ttlSeconds = 60 * 60 * 24 * 7) {
  const header = b64u(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const now = Math.floor(Date.now() / 1000);
  const body = b64u(enc.encode(JSON.stringify({ ...payload, iat: now, exp: now + ttlSeconds })));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(`${header}.${body}`));
  return `${header}.${body}.${b64u(sig)}`;
}

export async function verifyJwt<T = Record<string, unknown>>(token: string, secret: string): Promise<T | null> {
  const [h, b, s] = token.split('.');
  if (!h || !b || !s) return null;
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), unb64u(s), enc.encode(`${h}.${b}`));
  if (!ok) return null;
  const payload = JSON.parse(new TextDecoder().decode(unb64u(b)));
  if (typeof payload.exp === 'number' && payload.exp < Date.now() / 1000) return null;
  return payload as T;
}

export const newId = () => crypto.randomUUID();
