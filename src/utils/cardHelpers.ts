import type { BusinessCardCategory, BusinessCardItem } from '../types/assistant';

export type BusinessCardDraft = Omit<
  BusinessCardItem,
  'id' | 'version' | 'syncStatus' | 'createdAt' | 'updatedAt'
>;

export interface CardDraftInput {
  category: BusinessCardCategory;
  name: string;
  company: string;
  title: string;
  phone: string;
  email: string;
  notes: string;
  pinned: boolean;
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

  return {
    ok: true,
    draft: {
      category: input.category,
      name: name.slice(0, 80),
      company: input.company.trim().slice(0, 120),
      title: input.title.trim().slice(0, 80),
      phone: input.phone.trim().slice(0, 60),
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
      const hay = `${card.name} ${card.company} ${card.title} ${card.phone} ${card.email} ${card.notes}`.toLowerCase();
      return hay.includes(q);
    })
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
}
