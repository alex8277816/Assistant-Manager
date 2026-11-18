import type { QuickLinkItem, SyncStatus } from '../types/assistant';

export type QuickLinkValidationResult =
  | { ok: true; name: string; url: string }
  | { ok: false; error: string };

export function validateAndNormalizeQuickLink(
  rawName: string,
  rawUrl: string
): QuickLinkValidationResult {
  const name = rawName.trim();
  if (!name) {
    return { ok: false, error: '請輸入連結名稱（例如：公司 EIP、合約系統）' };
  }
  if (name.length > 40) {
    return { ok: false, error: '連結名稱請勿超過 40 個字元' };
  }

  const trimmedUrl = rawUrl.trim();
  if (!trimmedUrl) {
    return { ok: false, error: '請輸入連結網址' };
  }

  const lower = trimmedUrl.toLowerCase();
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('vbscript:')
  ) {
    return { ok: false, error: '不支援此網址協定，請使用 http:// 或 https://' };
  }

  const candidate = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmedUrl)
    ? trimmedUrl
    : `https://${trimmedUrl}`;

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, error: '僅支援 http:// 或 https:// 網址' };
    }
    if (!parsed.hostname) {
      return { ok: false, error: '請輸入有效的網域名稱或系統網址' };
    }
    return { ok: true, name, url: parsed.toString() };
  } catch {
    return { ok: false, error: '網址格式不正確，請輸入例如 https://eip.company.com' };
  }
}

export function buildQuickLinkItem(
  name: string,
  url: string,
  nowMs: number,
  syncStatus: SyncStatus = 'local'
): QuickLinkItem {
  return {
    id: `link-${nowMs}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    url,
    version: 1,
    syncStatus,
    createdAt: nowMs,
    updatedAt: nowMs,
  };
}
