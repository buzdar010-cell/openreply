/**
 * Web Push, implemented directly against the RFC 8291 (message encryption)
 * and RFC 8292 (VAPID) specs via the platform's native Web Crypto -- no
 * external push library. Same reasoning as auth.ts's native PBKDF2: one
 * fewer dependency to trust, and Workers' runtime already has everything
 * this needs (ECDH, ECDSA, HKDF-via-HMAC, AES-GCM).
 */

const textEncoder = new TextEncoder();

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/** One HMAC-SHA-256 call, which is all HKDF-Extract and single-block HKDF-Expand reduce to here (every info string used is short enough for one block). */
async function hmacSha256(keyBytes: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, data);
  return new Uint8Array(sig);
}

async function hkdfExpand(prk: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const full = await hmacSha256(prk, concatBytes(info, new Uint8Array([0x01])));
  return full.slice(0, length);
}

export interface VapidKeyPair {
  privateKey: CryptoKey; // ECDSA, P-256
  publicKeyRaw: Uint8Array; // 65-byte uncompressed point, safe to share (this is the "applicationServerKey")
}

/** Reconstructs the VAPID signing key from a stored JWK string (see scripts/generate_vapid.mjs for how it's produced). */
export async function importVapidPrivateKey(jwkJson: string): Promise<CryptoKey> {
  const jwk = JSON.parse(jwkJson);
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}

export async function buildVapidJwt(privateKey: CryptoKey, audience: string, subject: string): Promise<string> {
  const header = { typ: "JWT", alg: "ES256" };
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: subject,
  };
  const unsigned = `${base64UrlEncode(textEncoder.encode(JSON.stringify(header)))}.${base64UrlEncode(textEncoder.encode(JSON.stringify(payload)))}`;
  // Web Crypto's ECDSA signatures are already raw r||s (IEEE P1363), which is exactly what a JWS ES256 signature needs -- no DER conversion.
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, textEncoder.encode(unsigned));
  return `${unsigned}.${base64UrlEncode(new Uint8Array(signature))}`;
}

/** The RFC 8291 key derivation: ECDH between a fresh sender keypair and the subscriber's key, combined with their auth secret and a per-message salt. */
async function deriveContentEncryptionKeys(
  asPrivateKey: CryptoKey,
  asPublicRaw: Uint8Array,
  uaPublicRaw: Uint8Array,
  authSecret: Uint8Array,
  salt: Uint8Array,
): Promise<{ cek: Uint8Array; nonce: Uint8Array }> {
  const uaPublicKey = await crypto.subtle.importKey("raw", uaPublicRaw, { name: "ECDH", namedCurve: "P-256" }, false, []);
  // @cloudflare/workers-types misnames this field "$public" in its DeriveKeyAlgorithm type, but the
  // actual Web Crypto API (both Node and the Workers runtime) expects the standard "public" key --
  // cast past the incorrect type rather than send a field name the runtime won't recognize.
  const ecdhSecretBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: uaPublicKey } as unknown as SubtleCryptoDeriveKeyAlgorithm,
    asPrivateKey,
    256,
  );
  const ecdhSecret = new Uint8Array(ecdhSecretBits);

  const keyInfo = concatBytes(textEncoder.encode("WebPush: info"), new Uint8Array([0x00]), uaPublicRaw, asPublicRaw);
  const prkKey = await hmacSha256(authSecret, ecdhSecret); // HKDF-Extract(salt=auth_secret, ikm=ecdh_secret)
  const ikm = await hkdfExpand(prkKey, keyInfo, 32);

  const prk = await hmacSha256(salt, ikm); // HKDF-Extract(salt=salt, ikm=ikm) -- the RFC 8188 stage
  const cek = await hkdfExpand(prk, concatBytes(textEncoder.encode("Content-Encoding: aes128gcm"), new Uint8Array([0x00])), 16);
  const nonce = await hkdfExpand(prk, concatBytes(textEncoder.encode("Content-Encoding: nonce"), new Uint8Array([0x00])), 12);
  return { cek, nonce };
}

/** Builds the full aes128gcm (RFC 8188) request body: header + single encrypted record. */
async function encryptAes128Gcm(plaintext: Uint8Array, cek: Uint8Array, nonce: Uint8Array, salt: Uint8Array, asPublicRaw: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  // Single record (payload is always tiny for a reminder notification) -- padding delimiter 0x02 marks it as the last record, no extra padding needed.
  const recordPlaintext = concatBytes(plaintext, new Uint8Array([0x02]));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, recordPlaintext));

  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, 4096, false);
  const header = concatBytes(salt, recordSize, new Uint8Array([asPublicRaw.length]), asPublicRaw);
  return concatBytes(header, ciphertext);
}

export interface PushSubscriptionKeys {
  endpoint: string;
  p256dh: string; // base64url, subscriber's public key (65 bytes)
  auth: string; // base64url, subscriber's auth secret (16 bytes)
}

export type WebPushResult = { ok: true } | { ok: false; status: number; expired: boolean };

/** Sends one push message. `expired: true` means the subscription is dead (404/410) and should be deleted, not retried. */
export async function sendWebPush(
  subscription: PushSubscriptionKeys,
  payload: unknown,
  vapid: VapidKeyPair,
  subject: string,
): Promise<WebPushResult> {
  const uaPublicRaw = base64UrlDecode(subscription.p256dh);
  const authSecret = base64UrlDecode(subscription.auth);

  const asKeyPair = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const asPublicRaw = new Uint8Array((await crypto.subtle.exportKey("raw", asKeyPair.publicKey)) as ArrayBuffer);
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const { cek, nonce } = await deriveContentEncryptionKeys(asKeyPair.privateKey, asPublicRaw, uaPublicRaw, authSecret, salt);
  const body = await encryptAes128Gcm(textEncoder.encode(JSON.stringify(payload)), cek, nonce, salt, asPublicRaw);

  const audience = new URL(subscription.endpoint).origin;
  const jwt = await buildVapidJwt(vapid.privateKey, audience, subject);

  const res = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      TTL: "86400",
      Authorization: `vapid t=${jwt}, k=${base64UrlEncode(vapid.publicKeyRaw)}`,
    },
    body,
  });

  if (res.ok) return { ok: true };
  return { ok: false, status: res.status, expired: res.status === 404 || res.status === 410 };
}
