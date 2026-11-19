import type { BusinessCardCategory, BusinessCardItem } from '../types/assistant';

export const CARDS_PAGE_SIZE = 5;

export type BusinessCardDraft = Omit<
  BusinessCardItem,
  'id' | 'version' | 'syncStatus' | 'createdAt' | 'updatedAt'
>;

export interface CardDraftInput {
  category: BusinessCardCategory;
  name: string;
  company: string;
  department?: string;
  companyUrl?: string;
  title: string;
  phone: string;
  landline?: string;
  fax?: string;
  lineId?: string;
  address?: string;
  email: string;
  notes: string;
  pinned: boolean;
}

export function normalizeCardCompanyUrl(
  rawUrl: string
): { ok: true; url: string } | { ok: false; error: string } {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { ok: true, url: '' };
  }
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('vbscript:')
  ) {
    return { ok: false, error: '公司／部門網址格式不安全，請使用 http:// 或 https://' };
  }
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withScheme);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, error: '公司／部門網址僅支援 http 或 https 協定' };
    }
    return { ok: true, url: parsed.toString() };
  } catch {
    return { ok: false, error: '公司／部門網址格式不正確，若無網址可留空' };
  }
}

export function validateAndNormalizeCardDraft(
  input: CardDraftInput
): { ok: true; draft: BusinessCardDraft } | { ok: false; error: string } {
  const name = input.name.trim();
  if (!name) {
    return { ok: false, error: '請填寫聯絡人姓名' };
  }
  const email = input.email.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: '電子信箱格式不正確，若無信箱可留空' };
  }

  const normalizedUrl = normalizeCardCompanyUrl(input.companyUrl || '');
  if (!normalizedUrl.ok) {
    return { ok: false, error: normalizedUrl.error };
  }

  return {
    ok: true,
    draft: {
      category: input.category,
      name: name.slice(0, 80),
      company: input.company.trim().slice(0, 120),
      department: (input.department || '').trim().slice(0, 120),
      companyUrl: normalizedUrl.url.slice(0, 300),
      title: input.title.trim().slice(0, 80),
      phone: input.phone.trim().slice(0, 60),
      landline: (input.landline || '').trim().slice(0, 60),
      fax: (input.fax || '').trim().slice(0, 60),
      lineId: (input.lineId || '').trim().slice(0, 80),
      address: (input.address || '').trim().slice(0, 240),
      email: email.slice(0, 120),
      notes: input.notes.trim().slice(0, 1000),
      pinned: Boolean(input.pinned),
    },
  };
}

export function buildNewBusinessCard(
  draft: BusinessCardDraft,
  now: number,
  syncStatus: 'local' | 'pending' = 'local'
): BusinessCardItem {
  return {
    ...draft,
    id: `card-${now}-${Math.random().toString(36).slice(2, 6)}`,
    version: 1,
    syncStatus,
    createdAt: now,
    updatedAt: now,
  };
}

export function filterBusinessCards(
  cards: BusinessCardItem[],
  categoryFilter: 'all' | BusinessCardCategory,
  searchQuery: string
): BusinessCardItem[] {
  const q = searchQuery.trim().toLowerCase();
  return cards
    .filter((c) => !c.deleted)
    .filter((card) => {
      if (categoryFilter !== 'all' && card.category !== categoryFilter) return false;
      if (!q) return true;
      const hay = [
        card.name,
        card.company,
        card.department || '',
        card.companyUrl || '',
        card.title,
        card.phone,
        card.landline || '',
        card.fax || '',
        card.lineId || '',
        card.address || '',
        card.email,
        card.notes,
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    })
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
}

export interface PaginatedCardsResult {
  items: BusinessCardItem[];
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
}

export function paginateBusinessCards(
  cards: BusinessCardItem[],
  requestedPage: number,
  pageSize: number = CARDS_PAGE_SIZE
): PaginatedCardsResult {
  const safePageSize = Math.max(1, Math.floor(pageSize));
  const totalItems = cards.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const page = Math.min(Math.max(1, Math.floor(requestedPage) || 1), totalPages);
  const start = (page - 1) * safePageSize;
  return {
    items: cards.slice(start, start + safePageSize),
    page,
    totalPages,
    totalItems,
    pageSize: safePageSize,
  };
}
