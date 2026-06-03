/**
 * AES-256-GCM encrypt / decrypt using the browser Web Crypto API.
 *
 * The password is never stored. It is stretched into a 256-bit key using
 * PBKDF2-SHA-256 with a random 16-byte salt and 310 000 iterations
 * (OWASP 2023 recommendation for PBKDF2-HMAC-SHA256).
 *
 * Encrypted blob format (all concatenated, stored as base64):
 *   [4 bytes: magic "PWLT"]
 *   [1 byte:  version = 0x01]
 *   [16 bytes: PBKDF2 salt]
 *   [12 bytes: AES-GCM IV]
 *   [N bytes:  AES-GCM ciphertext + 16-byte auth tag]
 */

const MAGIC = new Uint8Array([0x50, 0x57, 0x4c, 0x54]); // "PWLT"
const VERSION = 0x01;
const PBKDF2_ITERATIONS = 310_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const arr of arrays) {
    out.set(arr, offset);
    offset += arr.length;
  }
  return out;
}

function toBuffer(u: Uint8Array): ArrayBuffer {
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(password);
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    toBuffer(encoded),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: toBuffer(salt), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptPrivateKey(
  privateKeyBytes: Uint8Array,
  password: string,
): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(password, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toBuffer(iv) },
    key,
    toBuffer(privateKeyBytes),
  );
  const header = new Uint8Array([...MAGIC, VERSION]);
  const blob = concat(header, salt, iv, new Uint8Array(ciphertext));
  return btoa(String.fromCharCode(...blob));
}

export async function decryptPrivateKey(
  encryptedBase64: string,
  password: string,
): Promise<Uint8Array> {
  const raw = Uint8Array.from(atob(encryptedBase64), (c) => c.charCodeAt(0));

  // Validate magic + version
  const magic = raw.slice(0, 4);
  if (magic[0] !== MAGIC[0] || magic[1] !== MAGIC[1] || magic[2] !== MAGIC[2] || magic[3] !== MAGIC[3]) {
    throw new Error("Invalid wallet file format.");
  }
  const version = raw[4];
  if (version !== VERSION) {
    throw new Error(`Unsupported wallet version: ${version}`);
  }

  const salt = raw.slice(5, 5 + SALT_BYTES);
  const iv = raw.slice(5 + SALT_BYTES, 5 + SALT_BYTES + IV_BYTES);
  const ciphertext = raw.slice(5 + SALT_BYTES + IV_BYTES);

  const key = await deriveKey(password, salt);
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: toBuffer(iv) },
      key,
      toBuffer(ciphertext),
    );
    return new Uint8Array(plaintext);
  } catch {
    throw new Error("Incorrect password or corrupted wallet.");
  }
}
