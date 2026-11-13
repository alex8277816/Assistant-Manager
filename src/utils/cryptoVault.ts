const CHECK_PLAIN = 'KAIRO_E2EE_VAULT_VERIFIED_V1';

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function getSubtle(): SubtleCrypto {
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    return globalThis.crypto.subtle;
  }
  throw new Error('Web Crypto API is unavailable in this environment.');
}

export function generateSaltBase64(byteLength = 16): string {
  const salt = new Uint8Array(byteLength);
  globalThis.crypto.getRandomValues(salt);
  return toBase64(salt);
}

export async function deriveAesKey(passphrase: string, saltBase64: string): Promise<CryptoKey> {
  const subtle = getSubtle();
  const encoder = new TextEncoder();
  const keyMaterial = await subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const saltBytes = fromBase64(saltBase64);
  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes as BufferSource,
      iterations: 150000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptText(
  key: CryptoKey,
  plaintext: string
): Promise<{ ciphertext: string; iv: string }> {
  const subtle = getSubtle();
  const iv = new Uint8Array(12);
  globalThis.crypto.getRandomValues(iv);
  const encoded = new TextEncoder().encode(plaintext);
  const cipherBuffer = await subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  return {
    ciphertext: toBase64(new Uint8Array(cipherBuffer)),
    iv: toBase64(iv),
  };
}

export async function decryptText(
  key: CryptoKey,
  ciphertextBase64: string,
  ivBase64: string
): Promise<string> {
  const subtle = getSubtle();
  const cipherBytes = fromBase64(ciphertextBase64);
  const ivBytes = fromBase64(ivBase64);
  const plainBuffer = await subtle.decrypt(
    { name: 'AES-GCM', iv: ivBytes as BufferSource },
    key,
    cipherBytes as BufferSource
  );
  return new TextDecoder().decode(plainBuffer);
}

export async function createVaultCheck(
  key: CryptoKey
): Promise<{ checkCipher: string; checkIv: string }> {
  const { ciphertext, iv } = await encryptText(key, CHECK_PLAIN);
  return { checkCipher: ciphertext, checkIv: iv };
}

export async function verifyVaultCheck(
  key: CryptoKey,
  checkCipher: string,
  checkIv: string
): Promise<boolean> {
  try {
    const decrypted = await decryptText(key, checkCipher, checkIv);
    return decrypted === CHECK_PLAIN;
  } catch {
    return false;
  }
}

export interface EncryptedArchiveFile {
  format: 'kairo-e2ee-backup-v1';
  createdAt: string;
  salt: string;
  iv: string;
  ciphertext: string;
  itemCount: number;
}

export async function createEncryptedArchive(
  passphrase: string,
  payload: unknown,
  itemCount: number
): Promise<EncryptedArchiveFile> {
  const salt = generateSaltBase64(16);
  const key = await deriveAesKey(passphrase, salt);
  const { ciphertext, iv } = await encryptText(key, JSON.stringify(payload));
  return {
    format: 'kairo-e2ee-backup-v1',
    createdAt: new Date().toISOString(),
    salt,
    iv,
    ciphertext,
    itemCount,
  };
}

export async function decryptEncryptedArchive<T>(
  passphrase: string,
  archive: Pick<EncryptedArchiveFile, 'salt' | 'iv' | 'ciphertext'>
): Promise<T> {
  const key = await deriveAesKey(passphrase, archive.salt);
  const json = await decryptText(key, archive.ciphertext, archive.iv);
  return JSON.parse(json) as T;
}
