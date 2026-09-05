// One-off: run with `node scripts/generate_vapid.mjs`, then:
//   - put VAPID_PUBLIC_KEY (printed) into wrangler.jsonc's "vars" and the frontend's env
//   - `wrangler secret put VAPID_PRIVATE_JWK` and paste the printed JSON when prompted
function base64UrlEncode(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const keyPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const publicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey));
const privateJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);

console.log('VAPID_PUBLIC_KEY (not secret):');
console.log(base64UrlEncode(publicRaw));
console.log('\nVAPID_PRIVATE_JWK (secret -- wrangler secret put VAPID_PRIVATE_JWK):');
console.log(JSON.stringify(privateJwk));
