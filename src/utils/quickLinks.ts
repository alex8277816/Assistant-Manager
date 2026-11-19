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

export const QUICK_LINK_CATEGORIES = [
  '公司系統',
  '行政簽核',
  '專案開發',
  '其他',
] as const;

export function normalizeQuickLinkCategory(raw?: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '公司系統';
  return trimmed.slice(0, 16);
}

export function buildQuickLinkItem(
  name: string,
  url: string,
  nowMs: number,
  syncStatus: SyncStatus = 'local',
  options?: { pinned?: boolean; category?: string }
): QuickLinkItem {
  return {
    id: `link-${nowMs}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    url,
    pinned: Boolean(options?.pinned),
    category: normalizeQuickLinkCategory(options?.category),
    version: 1,
    syncStatus,
    createdAt: nowMs,
    updatedAt: nowMs,
  };
}

export function sortAndFilterQuickLinks(
  links: QuickLinkItem[],
  query = '',
  categoryFilter = 'all'
): QuickLinkItem[] {
  const q = query.trim().toLowerCase();
  return links
    .filter((l) => !l.deleted)
    .filter((l) => {
      if (categoryFilter === 'pinned') return Boolean(l.pinned);
      if (categoryFilter !== 'all') {
        return normalizeQuickLinkCategory(l.category) === categoryFilter;
      }
      return true;
    })
    .filter((l) => {
      if (!q) return true;
      const hay = `${l.name} ${l.url} ${l.category || ''}`.toLowerCase();
      return hay.includes(q);
    })
    .sort((a, b) => {
      const pinDiff = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
      if (pinDiff !== 0) return pinDiff;
      return a.createdAt - b.createdAt;
    });
}

export const SIDEBAR_LINKS_PAGE_SIZE = 4;

export interface QuickLinkPaginationResult {
  items: QuickLinkItem[];
  page: number;
  totalPages: number;
  totalItems: number;
  startIndex: number;
  endIndex: number;
}

export function paginateQuickLinks(
  links: QuickLinkItem[],
  requestedPage: number,
  pageSize = SIDEBAR_LINKS_PAGE_SIZE
): QuickLinkPaginationResult {
  const safeSize = Math.max(1, Math.floor(pageSize));
  const totalItems = links.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / safeSize));
  const page = Math.min(Math.max(1, Math.floor(requestedPage) || 1), totalPages);
  const startIndex = (page - 1) * safeSize;
  const endIndex = Math.min(startIndex + safeSize, totalItems);
  return {
    items: links.slice(startIndex, endIndex),
    page,
    totalPages,
    totalItems,
    startIndex,
    endIndex,
  };
}

export function formatQuickLinkHost(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.replace(/^www\./i, '');
    return parsed.port ? `${host}:${parsed.port}` : host;
  } catch {
    return rawUrl;
  }
}

