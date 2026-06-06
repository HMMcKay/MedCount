const PBKDF2_ITERATIONS = 310_000;
const VERIFY_PLAINTEXT = 'medcount-v1-verify';

function bufToHex(buf) {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBuf(hex) {
  return new Uint8Array(hex.match(/.{2}/g).map(b => parseInt(b, 16)));
}

async function deriveKey(pin, salt) {
  const enc = new TextEncoder();
  const raw = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    raw,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function setupEncryption(pin) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key  = await deriveKey(pin, salt);
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const enc  = new TextEncoder();
  const ct   = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(VERIFY_PLAINTEXT));
  return {
    key,
    saltHex:   bufToHex(salt),
    ivHex:     bufToHex(iv),
    verifyHex: bufToHex(ct),
  };
}

export async function unlockWithPin(pin, saltHex, ivHex, verifyHex) {
  try {
    const key = await deriveKey(pin, hexToBuf(saltHex));
    const dec = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: hexToBuf(ivHex) },
      key,
      hexToBuf(verifyHex)
    );
    if (new TextDecoder().decode(dec) !== VERIFY_PLAINTEXT) return null;
    return key;
  } catch {
    return null;
  }
}

export async function encryptData(obj, key) {
  const iv  = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ct  = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
  return { iv: bufToHex(iv), data: bufToHex(ct) };
}

export async function decryptData(envelope, key) {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: hexToBuf(envelope.iv) },
    key,
    hexToBuf(envelope.data)
  );
  return JSON.parse(new TextDecoder().decode(plain));
}
