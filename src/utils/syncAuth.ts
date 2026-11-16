export interface NormalizedAccount {
  authEmail: string;
  displayLabel: string;
  isCustomId: boolean;
}

export interface SyncIdentityHint {
  mode: 'account' | 'serial';
  label: string;
}

const SYNC_HINT_STORAGE_KEY = 'kairo_sync_identity_hint';

/**
 * Normalizes a user-provided sync account (either a standard email or a custom username/account ID).
 */
export function normalizeAccountIdentifier(raw: string): NormalizedAccount {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) {
    throw new Error('請輸入同步帳號或電子信箱');
  }

  if (trimmed.includes('@')) {
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
    if (!emailOk) {
      throw new Error('電子信箱格式不正確，請重新確認');
    }
    return {
      authEmail: trimmed,
      displayLabel: trimmed,
      isCustomId: false,
    };
  }

  const sanitized = trimmed.replace(/[^a-z0-9._-]/g, '');
  if (sanitized !== trimmed || sanitized.length < 3 || sanitized.length > 48) {
    throw new Error('自訂帳號需為 3～48 字元的英數字或 . _ - 符號');
  }

  return {
    authEmail: `acct-${sanitized}@account.kairo.local`,
    displayLabel: sanitized,
    isCustomId: true,
  };
}

/**
 * Generates a high-entropy (80-bit) sync serial in the format KAIRO-XXXX-XXXX-XXXX-XXXX.
 */
export function generateSyncSerial(): string {
  const bytes = new Uint8Array(8);
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `KAIRO-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}`;
}

/**
 * Normalizes and validates an input sync serial (case/space/dash insensitive).
 */
export function normalizeSyncSerial(raw: string): string {
  const upper = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const body = upper.startsWith('KAIRO') ? upper.slice(5) : upper;
  if (body.length < 12 || body.length > 32) {
    throw new Error('同步序號格式錯誤，請輸入完整序號（例如 KAIRO-XXXX-XXXX-XXXX-XXXX）');
  }
  const groups = body.match(/.{1,4}/g) || [body];
  return `KAIRO-${groups.join('-')}`;
}

export function maskSyncSerial(formattedSerial: string): string {
  const parts = formattedSerial.split('-');
  if (parts.length < 3) return formattedSerial;
  return `${parts[0]}-${parts[1]}-••••-${parts[parts.length - 1]}`;
}

async function sha256Hex(input: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('瀏覽器 Web Crypto API 無法使用');
  }
  const encoded = new TextEncoder().encode(input);
  const digest = await subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Deterministically maps (syncSerial, syncPassword) to Firebase Auth Email/Password credentials.
 * Uses domain-separated SHA-256 digests so neither the raw serial nor the raw password leaves
 * the client in plaintext as an Auth credential.
 */
export async function deriveSerialAuthCredentials(
  rawSerial: string,
  syncPassword: string
): Promise<{ authEmail: string; authPassword: string; formattedSerial: string }> {
  const formattedSerial = normalizeSyncSerial(rawSerial);
  const pwd = syncPassword.trim();
  if (pwd.length < 6) {
    throw new Error('同步密碼至少需 6 個字元');
  }
  const serialIdHash = await sha256Hex(`kairo:serial:id:v1:${formattedSerial}`);
  const secretHash = await sha256Hex(`kairo:serial:secret:v1:${formattedSerial}:${pwd}`);
  return {
    formattedSerial,
    authEmail: `serial-${serialIdHash.slice(0, 24)}@serial.kairo.local`,
    authPassword: `Kr!${secretHash.slice(0, 40)}`,
  };
}

export function saveSyncIdentityHint(hint: SyncIdentityHint | null): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (!hint) {
      localStorage.removeItem(SYNC_HINT_STORAGE_KEY);
    } else {
      localStorage.setItem(SYNC_HINT_STORAGE_KEY, JSON.stringify(hint));
    }
  } catch {
    // Ignore storage quota / privacy errors
  }
}

export function loadSyncIdentityHint(): SyncIdentityHint | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SYNC_HINT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SyncIdentityHint;
    if (parsed && (parsed.mode === 'account' || parsed.mode === 'serial') && parsed.label) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

export function resolveSyncIdentityLabel(
  email: string | null | undefined,
  hint: SyncIdentityHint | null
): string {
  if (hint?.label) return hint.label;
  if (!email) return '同步空間已連線';
  if (email.startsWith('acct-') && email.endsWith('@account.kairo.local')) {
    return email.slice('acct-'.length, -'@account.kairo.local'.length);
  }
  if (email.startsWith('serial-') && email.endsWith('@serial.kairo.local')) {
    return '序號同步空間';
  }
  return email;
}

export function isEmailProviderDisabledError(errorOrMessage: unknown): boolean {
  const code =
    typeof errorOrMessage === 'object' && errorOrMessage !== null && 'code' in errorOrMessage
      ? String((errorOrMessage as { code: unknown }).code)
      : '';
  const msg = errorOrMessage instanceof Error ? errorOrMessage.message : String(errorOrMessage || '');
  return (
    code === 'auth/operation-not-allowed' ||
    msg.includes('operation-not-allowed') ||
    msg.includes('尚未在 Firebase Console 啟用')
  );
}

export function formatAuthErrorMessage(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : '';
  const msg = error instanceof Error ? error.message : String(error);

  if (code === 'auth/operation-not-allowed' || msg.includes('operation-not-allowed')) {
    return '尚未在 Firebase Console 啟用「電子郵件/密碼 (Email/Password)」登入方式，請依下方步驟開啟後再試。';
  }
  if (code === 'auth/email-already-in-use') {
    return '此帳號或序號已存在，請改用「登入同步」或確認密碼是否正確。';
  }
  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/wrong-password' ||
    code === 'auth/user-not-found'
  ) {
    return '帳號／序號或密碼錯誤，請重新確認。';
  }
  if (code === 'auth/weak-password') {
    return '密碼強度不足，請輸入至少 6 個字元。';
  }
  if (code === 'auth/too-many-requests') {
    return '嘗試次數過多，請稍候再試。';
  }
  if (code === 'auth/network-request-failed') {
    return '網路連線異常，目前維持本機離線儲存。';
  }
  return msg || '同步驗證失敗，請稍後再試。';
}
