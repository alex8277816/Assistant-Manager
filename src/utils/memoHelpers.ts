import type { MemoItem } from '../types/assistant';

export const MEMO_PAGE_SIZE_OPTIONS = [5, 6, 10, 15] as const;
export const DEFAULT_MEMO_PAGE_SIZE = 6;

export type MemoFilterMode = 'all' | 'pinned' | 'desktop';

export interface MemoPaginationResult {
  items: MemoItem[];
  page: number;
  pageSize: number;
  totalPages: number;
  totalItems: number;
  startIndex: number;
  endIndex: number;
}

/**
 * Normalizes page size to at least 5 per page (default 6).
 */
export function normalizeMemoPageSize(rawSize?: number): number {
  if (typeof rawSize !== 'number' || !Number.isFinite(rawSize)) {
    return DEFAULT_MEMO_PAGE_SIZE;
  }
  const rounded = Math.floor(rawSize);
  if (rounded < 5) return 5;
  if (rounded > 50) return 50;
  return rounded;
}

/**
 * Filters active memos (all / pinned / pinnedToDesktop) and search query,
 * sorting multiple pinned memos to the top by newest update first.
 */
export function sortAndFilterMemos(
  memos: MemoItem[],
  searchQuery = '',
  filterMode: MemoFilterMode = 'all'
): MemoItem[] {
  const q = searchQuery.trim().toLowerCase();
  return [...memos]
    .filter((m) => !m.deleted)
    .filter((m) => {
      if (filterMode === 'pinned') return Boolean(m.pinned);
      if (filterMode === 'desktop') return Boolean(m.pinnedToDesktop);
      return true;
    })
    .filter((m) => {
      if (!q) return true;
      const hay = `${m.title || ''} ${m.content || ''} ${(Array.isArray(m.tags) ? m.tags : []).join(' ')}`.toLowerCase();
      return hay.includes(q);
    })
    .sort((a, b) => {
      const pinDiff = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
      if (pinDiff !== 0) return pinDiff;
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
}

/**
 * Slices memos into pages of `pageSize` (default 6, minimum 5) and clamps out-of-range page numbers.
 */
export function paginateMemos(
  memos: MemoItem[],
  requestedPage: number,
  pageSize = DEFAULT_MEMO_PAGE_SIZE
): MemoPaginationResult {
  const safeSize = normalizeMemoPageSize(pageSize);
  const totalItems = memos.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / safeSize));
  const page = Math.min(Math.max(1, Math.floor(requestedPage) || 1), totalPages);
  const startIndex = (page - 1) * safeSize;
  const endIndex = Math.min(startIndex + safeSize, totalItems);
  return {
    items: memos.slice(startIndex, endIndex),
    page,
    pageSize: safeSize,
    totalPages,
    totalItems,
    startIndex,
    endIndex,
  };
}

/**
 * Returns all active memos pinned to the desktop sticky board.
 */
export function getDesktopPinnedMemos(memos: MemoItem[]): MemoItem[] {
  return [...memos]
    .filter((m) => !m.deleted && Boolean(m.pinnedToDesktop))
    .sort((a, b) => {
      const pinDiff = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
      if (pinDiff !== 0) return pinDiff;
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
}
