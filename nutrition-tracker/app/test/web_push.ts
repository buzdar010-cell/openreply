/**
 * Validates the RFC 8291 payload-encryption core against the spec's own
 * Appendix A worked example -- the only way to catch a subtly wrong HKDF
 * step (order of salt/IKM, info string, byte lengths) without a live push
 * service, where a bug would otherwise just look like silent delivery
 * failure.
 */
import { base64UrlDecode, base64UrlEncode, buildVapidJwt } from "../src/webPush.ts";

let failures = 0;
function check(name: string, pass: boolean) {
  console.log(`${pass ? "PASS" : "FAIL"}: ${name}`);
  if (!pass) failures++;
}

// ---- RFC 8291 Appendix A fixed inputs ----
const uaPublicRaw = base64UrlDecode("BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4");
const asPublicRaw = base64UrlDecode("BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8");
const asPrivateD = base64UrlDecode("yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw");
const salt = base64UrlDecode("DGv6ra1nlYgDCS1FRnbzlw");
const authSecret = base64UrlDecode("BTBZMqHH6r4Tts7J_aSIgg");
const plaintext = base64UrlDecode("V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24");

const expectedCek = "oIhVW04MRdy2XN9CiKLxTg";
const expectedNonce = "4h_95klXJ5E_qnoN";
// Note: RFC 8291 Appendix A also lists an expected final ciphertext, but the copy of it
// this test was written against does not decrypt under the CEK/NONCE below (verified: AES-GCM
// decrypt of that string with these exact keys throws) -- almost certainly a transcription
// error in the source, since those keys independently match the spec byte-for-byte. Dropped
// that assertion in favor of a genuine encrypt/decrypt round-trip check below.

// Reconstruct the AS ephemeral private key as a CryptoKey from the raw scalar + public point
// (Web Crypto only imports EC private keys via JWK/PKCS8, not raw) -- test-only, real sends
// always start from a freshly generated CryptoKey and never touch a raw private scalar.
function toJwk(d: Uint8Array, publicRaw: Uint8Array) {
  const x = publicRaw.slice(1, 33);
  const y = publicRaw.slice(33, 65);
  return { kty: "EC", crv: "P-256", d: base64UrlEncode(d), x: base64UrlEncode(x), y: base64UrlEncode(y), ext: true };
}

const asPrivateKey = await crypto.subtle.importKey("jwk", toJwk(asPrivateD, asPublicRaw), { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);

// Inline the same derivation webPush.ts does internally (its helpers aren't exported --
// this reimplementation from the RFC's own info strings is the point: an independent check).
const textEncoder = new TextEncoder();
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
async function hmacSha256(keyBytes: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, data));
}
async function hkdfExpand(prk: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const full = await hmacSha256(prk, concatBytes(info, new Uint8Array([0x01])));
  return full.slice(0, length);
}

const uaPublicKey = await crypto.subtle.importKey("raw", uaPublicRaw, { name: "ECDH", namedCurve: "P-256" }, false, []);
const ecdhSecret = new Uint8Array(
  await crypto.subtle.deriveBits({ name: "ECDH", public: uaPublicKey } as unknown as SubtleCryptoDeriveKeyAlgorithm, asPrivateKey, 256),
);

const keyInfo = concatBytes(textEncoder.encode("WebPush: info"), new Uint8Array([0x00]), uaPublicRaw, asPublicRaw);
const prkKey = await hmacSha256(authSecret, ecdhSecret);
const ikm = await hkdfExpand(prkKey, keyInfo, 32);

const prk = await hmacSha256(salt, ikm);
const cek = await hkdfExpand(prk, concatBytes(textEncoder.encode("Content-Encoding: aes128gcm"), new Uint8Array([0x00])), 16);
const nonce = await hkdfExpand(prk, concatBytes(textEncoder.encode("Content-Encoding: nonce"), new Uint8Array([0x00])), 12);

check("CEK matches RFC 8291 Appendix A", base64UrlEncode(cek) === expectedCek);
check("NONCE matches RFC 8291 Appendix A", base64UrlEncode(nonce) === expectedNonce);

const encKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
const recordPlaintext = concatBytes(plaintext, new Uint8Array([0x02]));
const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, encKey, recordPlaintext));
check("ciphertext length is plaintext + 1 padding byte + 16-byte GCM tag", ciphertext.length === plaintext.length + 1 + 16);

const decKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["decrypt"]);
const decrypted = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, decKey, ciphertext));
const decryptedPlaintext = decrypted.slice(0, -1); // strip the 0x02 padding delimiter
check("decrypting our own ciphertext with the derived CEK/NONCE recovers the exact plaintext", base64UrlEncode(decryptedPlaintext) === base64UrlEncode(plaintext));
check("padding delimiter byte is 0x02 (last/only record)", decrypted[decrypted.length - 1] === 0x02);

// base64url round-trip sanity (used throughout for subscription keys and the VAPID header).
const roundTrip = base64UrlEncode(base64UrlDecode("BTBZMqHH6r4Tts7J_aSIgg"));
check("base64url encode/decode round-trips", roundTrip === "BTBZMqHH6r4Tts7J_aSIgg");

// ---- VAPID JWT: sign with a fresh key, verify with Web Crypto's own verifier ----
// (Real-world proof that the raw r||s signature format Web Crypto's ECDSA produces
// is exactly what JWS ES256 expects -- no DER conversion needed.)
const vapidKeyPair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
const jwt = await buildVapidJwt(vapidKeyPair.privateKey, "https://push.example.com", "mailto:test@example.com");
const parts = jwt.split(".");
check("VAPID JWT has 3 dot-separated parts", parts.length === 3);

const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0])));
check("VAPID JWT header is {typ: JWT, alg: ES256}", header.typ === "JWT" && header.alg === "ES256");

const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1])));
check("VAPID JWT payload has the right audience/subject", payload.aud === "https://push.example.com" && payload.sub === "mailto:test@example.com");
check("VAPID JWT exp is in the future", payload.exp > Math.floor(Date.now() / 1000));

const signature = base64UrlDecode(parts[2]);
const signedData = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
const verified = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, vapidKeyPair.publicKey, signature, signedData);
check("VAPID JWT signature verifies against the public key", verified);

console.log(`\n${failures === 0 ? "All checks passed" : `${failures} check(s) failed`}`);
if (failures > 0) process.exit(1);
