import React, { useMemo, useState } from 'react';
import {
  Building2,
  Copy,
  Download,
  Mail,
  Phone,
  Pin,
  Plus,
  Search,
  Square,
  Trash2,
  UserCheck,
  Volume2,
} from 'lucide-react';
import type { BusinessCardCategory, BusinessCardItem } from '../types/assistant';

interface BusinessCardsViewProps {
  cards: BusinessCardItem[];
  vaultUnlocked: boolean;
  isSpeaking: boolean;
  onSaveCard: (
    draft: Omit<BusinessCardItem, 'id' | 'version' | 'syncStatus' | 'createdAt' | 'updatedAt'>,
    existingId?: string
  ) => void;
  onDeleteCard: (id: string) => void;
  onSpeakCard: (card: BusinessCardItem) => void;
  onStopSpeaking: () => void;
}

const CATEGORY_LABEL: Record<BusinessCardCategory, string> = {
  client: '客戶',
  colleague: '辦公室同仁',
  other: '合作夥伴',
};

export const BusinessCardsView: React.FC<BusinessCardsViewProps> = ({
  cards,
  vaultUnlocked,
  isSpeaking,
  onSaveCard,
  onDeleteCard,
  onSpeakCard,
  onStopSpeaking,
}) => {
  const activeCards = useMemo(
    () =>
      cards
        .filter((c) => !c.deleted)
        .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt),
    [cards]
  );

  const [categoryFilter, setCategoryFilter] = useState<'all' | BusinessCardCategory>('all');
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [category, setCategory] = useState<BusinessCardCategory>('client');
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [title, setTitle] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [pinned, setPinned] = useState(false);
  const [formError, setFormError] = useState('');
  const [feedback, setFeedback] = useState('');

  const filteredCards = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activeCards.filter((card) => {
      if (categoryFilter !== 'all' && card.category !== categoryFilter) return false;
      if (!q) return true;
      const hay = `${card.name} ${card.company} ${card.title} ${card.phone} ${card.email} ${card.notes}`.toLowerCase();
      return hay.includes(q);
    });
  }, [activeCards, categoryFilter, search]);

  const resetForm = () => {
    setEditingId(null);
    setCategory('client');
    setName('');
    setCompany('');
    setTitle('');
    setPhone('');
    setEmail('');
    setNotes('');
    setPinned(false);
    setFormError('');
  };

  const loadCardIntoForm = (card: BusinessCardItem) => {
    setEditingId(card.id);
    setCategory(card.category);
    setName(card.name);
    setCompany(card.company);
    setTitle(card.title);
    setPhone(card.phone);
    setEmail(card.email);
    setNotes(card.notes);
    setPinned(card.pinned);
    setFormError('');
    setFeedback('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError('請填寫聯絡人姓名');
      return;
    }
    onSaveCard(
      {
        category,
        name: name.trim(),
        company: company.trim(),
        title: title.trim(),
        phone: phone.trim(),
        email: email.trim(),
        notes: notes.trim(),
        pinned,
      },
      editingId ?? undefined
    );
    setFeedback(editingId ? `已更新「${name.trim()}」的名片資料` : `已新增「${name.trim()}」至名片夾`);
    resetForm();
  };

  const handleCopy = async (card: BusinessCardItem) => {
    const summary = [
      `${card.name}${card.title ? ` (${card.title})` : ''}`,
      card.company,
      card.phone ? `電話: ${card.phone}` : '',
      card.email ? `信箱: ${card.email}` : '',
      card.notes ? `備註: ${card.notes}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    try {
      await navigator.clipboard.writeText(summary);
      setCopiedId(card.id);
      setTimeout(() => setCopiedId((prev) => (prev === card.id ? null : prev)), 2000);
    } catch {
      // ignore clipboard error
    }
  };

  const handleExportVcf = () => {
    if (filteredCards.length === 0) return;
    const vcf = filteredCards
      .map((c) =>
        [
          'BEGIN:VCARD',
          'VERSION:3.0',
          `FN:${c.name}`,
          c.company ? `ORG:${c.company}` : '',
          c.title ? `TITLE:${c.title}` : '',
          c.phone ? `TEL;TYPE=CELL:${c.phone}` : '',
          c.email ? `EMAIL:${c.email}` : '',
          c.notes ? `NOTE:${c.notes.replace(/\n/g, ' ')}` : '',
          'END:VCARD',
        ]
          .filter(Boolean)
          .join('\r\n')
      )
      .join('\r\n');

    const blob = new Blob([vcf], { type: 'text/vcard;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'kairo-business-cards.vcf';
    a.click();
    URL.revokeObjectURL(url);
    setFeedback(`已匯出 ${filteredCards.length} 張名片為標準 .vcf 通訊錄檔`);
  };

  return (
    <div className="space-y-6">
      {/* Header Toolbar */}
      <section className="rounded-2xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-stone-900 dark:text-zinc-100">
              客戶與辦公室同仁名片夾
            </h1>
            <p className="text-sm text-stone-600 dark:text-zinc-400 mt-0.5 tabular-nums">
              共 {activeCards.length} 張名片 ·{' '}
              {vaultUnlocked
                ? '端對端加密保護中，可跨裝置雲端同步'
                : '本機離線安全儲存中'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportVcf}
              disabled={filteredCards.length === 0}
              className="inline-flex items-center gap-2 rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-800 px-3.5 py-2 text-xs font-medium hover:bg-stone-100 dark:hover:bg-zinc-700 min-h-[40px] disabled:opacity-50"
            >
              <Download className="w-4 h-4 accent-text" />
              <span>匯出 .vcf 名片檔</span>
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex items-center gap-1.5 rounded-xl accent-bg px-4 py-2 text-xs font-medium min-h-[40px]"
            >
              <Plus className="w-4 h-4" />
              <span>新增名片</span>
            </button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-[1.25fr_1fr] gap-6 items-start">
        {/* Left: Search, Filter & Directory List */}
        <section className="rounded-2xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-4">
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                aria-label="搜尋名片姓名、公司、電話或信箱"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜尋姓名、公司、電話、信箱或備註..."
                className="w-full rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-950 pl-9 pr-3 py-2 text-xs"
              />
            </div>

            <div className="flex items-center gap-1 p-1 rounded-xl bg-stone-100 dark:bg-zinc-800/80 shrink-0">
              {(
                [
                  { id: 'all', label: '全部' },
                  { id: 'client', label: '客戶' },
                  { id: 'colleague', label: '同仁' },
                  { id: 'other', label: '其他' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setCategoryFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap min-h-[34px] ${
                    categoryFilter === tab.id
                      ? 'bg-white dark:bg-zinc-900 text-stone-900 dark:text-zinc-100 shadow-xs'
                      : 'text-stone-600 dark:text-zinc-400'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {filteredCards.length === 0 ? (
            <div className="py-12 text-center text-xs text-stone-500 dark:text-zinc-400">
              尚未找到符合條件的名片，請於右側表單建立您的第一張客戶或同仁名片。
            </div>
          ) : (
            <ul className="divide-y divide-stone-100 dark:divide-zinc-800" data-testid="business-cards-list">
              {filteredCards.map((card) => (
                <li
                  key={card.id}
                  className={`py-4 first:pt-1 last:pb-1 space-y-2 ${
                    editingId === card.id ? 'accent-soft-bg rounded-xl px-3 -mx-3' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <button
                          type="button"
                          onClick={() => loadCardIntoForm(card)}
                          className="text-sm font-semibold text-stone-900 dark:text-zinc-100 hover:underline text-left"
                        >
                          {card.name}
                        </button>
                        <span className="text-xs font-medium accent-text">
                          {CATEGORY_LABEL[card.category]}
                        </span>
                        {card.pinned && (
                          <Pin className="w-3.5 h-3.5 accent-text shrink-0" aria-label="已置頂" />
                        )}
                      </div>
                      {(card.company || card.title) && (
                        <p className="text-xs text-stone-600 dark:text-zinc-300 mt-0.5 flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                          <span>
                            {[card.company, card.title].filter(Boolean).join(' · ')}
                          </span>
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {isSpeaking ? (
                        <button
                          type="button"
                          onClick={onStopSpeaking}
                          aria-label="停止語音朗讀"
                          className="p-2 rounded-lg bg-rose-600 text-white hover:bg-rose-700 min-h-[36px] min-w-[36px] flex items-center justify-center"
                        >
                          <Square className="w-3.5 h-3.5 fill-current" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onSpeakCard(card)}
                          aria-label={`語音朗讀名片「${card.name}」`}
                          className="p-2 rounded-lg text-stone-500 hover:bg-stone-100 dark:hover:bg-zinc-800 min-h-[36px] min-w-[36px] flex items-center justify-center"
                        >
                          <Volume2 className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleCopy(card)}
                        aria-label={`複製「${card.name}」聯絡資訊`}
                        className="p-2 rounded-lg text-stone-500 hover:bg-stone-100 dark:hover:bg-zinc-800 min-h-[36px] min-w-[36px] flex items-center justify-center"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteCard(card.id)}
                        aria-label={`刪除名片「${card.name}」`}
                        className="p-2 rounded-lg text-stone-400 hover:text-rose-600 hover:bg-stone-100 dark:hover:bg-zinc-800 min-h-[36px] min-w-[36px] flex items-center justify-center"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-600 dark:text-zinc-400 font-mono tabular-nums">
                    {card.phone && (
                      <a
                        href={`tel:${card.phone}`}
                        className="inline-flex items-center gap-1 hover:underline text-stone-700 dark:text-zinc-300"
                      >
                        <Phone className="w-3.5 h-3.5 accent-text" />
                        <span>{card.phone}</span>
                      </a>
                    )}
                    {card.email && (
                      <a
                        href={`mailto:${card.email}`}
                        className="inline-flex items-center gap-1 hover:underline text-stone-700 dark:text-zinc-300"
                      >
                        <Mail className="w-3.5 h-3.5 accent-text" />
                        <span>{card.email}</span>
                      </a>
                    )}
                    {copiedId === card.id && (
                      <span className="text-[11px] font-sans font-medium accent-text">
                        已複製名片資訊
                      </span>
                    )}
                  </div>

                  {card.notes && (
                    <p className="text-xs text-stone-600 dark:text-zinc-400 leading-relaxed">
                      備註：{card.notes}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Right: Create / Edit Business Card Form */}
        <section
          aria-label="編輯或新增名片"
          className="rounded-2xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-4"
        >
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-stone-200 dark:border-zinc-800">
            <h2 className="text-base font-semibold text-stone-900 dark:text-zinc-100 flex items-center gap-2">
              <UserCheck className="w-4 h-4 accent-text" />
              <span>{editingId ? '編輯聯絡人名片' : '建立新名片'}</span>
            </h2>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="text-xs text-stone-500 hover:text-stone-900 dark:hover:text-zinc-200"
              >
                取消編輯
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'client', label: '客戶' },
                  { id: 'colleague', label: '辦公室同仁' },
                  { id: 'other', label: '合作夥伴' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setCategory(opt.id)}
                  className={`py-2 px-2 rounded-xl border text-xs font-medium min-h-[40px] transition-colors ${
                    category === opt.id
                      ? 'accent-border accent-soft-bg accent-text'
                      : 'border-stone-200 dark:border-zinc-700 text-stone-600 dark:text-zinc-400'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div>
              <label htmlFor="card-name" className="block text-xs font-medium text-stone-700 dark:text-zinc-300 mb-1">
                姓名 *
              </label>
              <input
                id="card-name"
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (formError) setFormError('');
                }}
                placeholder="例如：王大明"
                className="w-full rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-950 px-3.5 py-2 text-sm"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="card-company" className="block text-xs font-medium text-stone-700 dark:text-zinc-300 mb-1">
                  公司 / 部門
                </label>
                <input
                  id="card-company"
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="公司名稱或內部部門"
                  className="w-full rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-950 px-3.5 py-2 text-xs"
                />
              </div>
              <div>
                <label htmlFor="card-title" className="block text-xs font-medium text-stone-700 dark:text-zinc-300 mb-1">
                  職稱
                </label>
                <input
                  id="card-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="例如：專案經理"
                  className="w-full rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-950 px-3.5 py-2 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="card-phone" className="block text-xs font-medium text-stone-700 dark:text-zinc-300 mb-1">
                  電話 / 分機
                </label>
                <input
                  id="card-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0912-345-678"
                  className="w-full rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-950 px-3.5 py-2 text-xs font-mono"
                />
              </div>
              <div>
                <label htmlFor="card-email" className="block text-xs font-medium text-stone-700 dark:text-zinc-300 mb-1">
                  電子信箱
                </label>
                <input
                  id="card-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-950 px-3.5 py-2 text-xs font-mono"
                />
              </div>
            </div>

            <div>
              <label htmlFor="card-notes" className="block text-xs font-medium text-stone-700 dark:text-zinc-300 mb-1">
                備註
              </label>
              <textarea
                id="card-notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="記錄合作專案、聯絡偏好或拜訪備註..."
                className="w-full rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-950 px-3.5 py-2 text-xs leading-relaxed"
              />
            </div>

            <label className="flex items-center gap-2 text-xs text-stone-700 dark:text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={pinned}
                onChange={(e) => setPinned(e.target.checked)}
                className="h-4 w-4 rounded accent-control"
              />
              <span>置頂為常用聯絡人</span>
            </label>

            {formError && (
              <p className="text-xs text-rose-600 dark:text-rose-400">{formError}</p>
            )}
            {feedback && (
              <p className="text-xs font-medium accent-text">{feedback}</p>
            )}

            <button
              type="submit"
              className="w-full rounded-xl accent-bg py-2.5 text-sm font-medium min-h-[44px]"
            >
              {editingId ? '儲存變更' : '儲存名片'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
};
