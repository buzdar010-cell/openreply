/**
 * Password hashing, OTP codes, and session/device tokens -- all built on
 * the Web Crypto API (crypto.subtle), which Cloudflare Workers implements
 * natively. No bcrypt/argon2: those rely on native bindings Workers'
 * V8-isolate runtime doesn't have, and a pure-JS port would be slow enough
 * to risk the CPU-time limit on every login. PBKDF2 via crypto.subtle is
 * natively backed, not interpreted, so it stays fast at a real iteration
 * count -- verified directly against production, see the auth build notes.
 */

const PBKDF2_ITERATIONS = 100_000;

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return toHex(bytes.buffer);
}

/** Opaque bearer token for a session -- 256 bits of randomness, nothing derivable from it. */
export function generateSessionToken(): string {
  return randomHex(32);
}

/** Stored client-side only; presented alongside login to skip step-up verification on a known device. */
export function generateDeviceToken(): string {
  return randomHex(32);
}

export async function hashPassword(password: string, saltHex?: string): Promise<{ hash: string; salt: string }> {
  const salt = saltHex ?? randomHex(16);
  const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: hexToBytes(salt), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  return { hash: toHex(bits), salt };
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

export async function verifyPassword(password: string, storedHash: string, storedSalt: string): Promise<boolean> {
  const { hash } = await hashPassword(password, storedSalt);
  return timingSafeEqual(hash, storedHash);
}

/** Avoids leaking timing information about how much of the hash matched. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** A 6-digit numeric code -- easy to type on a phone, ~20 bits of entropy which is fine given it's rate-limited and short-lived. */
export function generateOtpCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return n.toString().padStart(6, "0");
}

export async function hashOtpCode(code: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  return toHex(digest);
}
