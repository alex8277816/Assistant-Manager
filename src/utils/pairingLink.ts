import { normalizeSyncSerial } from './syncAuth';

export interface ParsedPairingLink {
  serial: string;
  password?: string;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(token: string): Uint8Array {
  const padded = token.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(token.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Builds a client-only URL with pairing metadata stored in the URL hash fragment (#pair=...)
 * so serial numbers and optional pairing secrets are never transmitted in HTTP query strings.
 */
export function buildSerialPairingUrl(
  baseOriginOrUrl: string,
  rawSerial: string,
  passphrase?: string
): string {
  const serial = normalizeSyncSerial(rawSerial);
  const payload: { s: string; p?: string } = { s: serial };
  const trimmedPwd = passphrase?.trim();
  if (trimmedPwd) {
    payload.p = trimmedPwd;
  }
  const encoded = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const cleanBase = baseOriginOrUrl.split('#')[0].split('?')[0].replace(/\/+$/, '') || '';
  return `${cleanBase}/#pair=${encoded}`;
}

/**
 * Parses #pair=... from window.location.hash or a full pairing URL.
 */
export function parseSerialPairingHash(hashOrUrl: string): ParsedPairingLink | null {
  if (!hashOrUrl) return null;
  const hashIdx = hashOrUrl.indexOf('#');
  const fragment = hashIdx >= 0 ? hashOrUrl.slice(hashIdx + 1) : hashOrUrl;
  const match = fragment.match(/(?:^|&)pair=([A-Za-z0-9_-]+)/);
  if (!match) return null;
  try {
    const jsonStr = new TextDecoder().decode(fromBase64Url(match[1]));
    const parsed = JSON.parse(jsonStr) as { s?: unknown; p?: unknown };
    if (typeof parsed.s !== 'string') return null;
    const serial = normalizeSyncSerial(parsed.s);
    const password =
      typeof parsed.p === 'string' && parsed.p.trim().length >= 6 ? parsed.p.trim() : undefined;
    return { serial, password };
  } catch {
    return null;
  }
}
