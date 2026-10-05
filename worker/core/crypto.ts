/**
 * Contraseñas (PBKDF2-SHA256 con sal aleatoria) y fichas de sesión firmadas (HMAC-SHA256), solo con Web Crypto:
 * funciona igual en Cloudflare Workers y en Node (pruebas). Las iteraciones quedan guardadas en cada hash, así se
 * pueden subir más adelante sin invalidar las contraseñas existentes.
 */
const enc = new TextEncoder();
/** ≈ 4 ms de CPU: cabe en el límite de 10 ms del plan gratuito de Workers. */
export const PBKDF2_ITERATIONS = 30_000;

export function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(s: string): Uint8Array {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string, iterations = PBKDF2_ITERATIONS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$sha256$${iterations}$${b64url(salt)}$${b64url(await pbkdf2(password, salt, iterations))}`;
}

/** Comparación en tiempo constante (no revela cuántos bytes coinciden). */
function equal(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [kind, hash, it, salt, digest] = stored.split('$');
  if (kind !== 'pbkdf2' || hash !== 'sha256' || !salt || !digest) return false;
  const iterations = Number(it);
  if (!Number.isFinite(iterations) || iterations < 1000) return false;
  return equal(await pbkdf2(password, fromB64url(salt), iterations), fromB64url(digest));
}

/** Contraseña temporal legible (sin caracteres ambiguos), para altas y restablecimientos del administrador. */
export function temporaryPassword(len = 12): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let s = '';
  for (const b of bytes) s += alphabet[b % alphabet.length];
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}

/** Reglas mínimas de contraseña elegida por el usuario. */
export function passwordProblem(p: string): string | null {
  if (p.length < 10) return 'PASSWORD_TOO_SHORT';
  if (!/[A-Za-z]/.test(p) || !/[0-9]/.test(p)) return 'PASSWORD_NEEDS_LETTERS_AND_DIGITS';
  return null;
}

export interface SessionClaims {
  sub: string;
  role: string;
  ver: number;
  /** Expiración (segundos Unix). */
  exp: number;
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function signSession(claims: SessionClaims, secret: string): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(claims)));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

export async function verifySession(token: string, secret: string, nowS = Math.floor(Date.now() / 1000)): Promise<SessionClaims | null> {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), fromB64url(sig) as BufferSource, enc.encode(body));
  if (!ok) return null;
  try {
    const c = JSON.parse(new TextDecoder().decode(fromB64url(body))) as SessionClaims;
    return typeof c.exp === 'number' && c.exp > nowS ? c : null;
  } catch {
    return null;
  }
}
