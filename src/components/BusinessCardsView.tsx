import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  Globe,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  PhoneCall,
  Pin,
  Plus,
  Printer,
  Search,
  Square,
  Trash2,
  UserCheck,
  Volume2,
} from 'lucide-react';
import type { BusinessCardCategory, BusinessCardItem } from '../types/assistant';
import {
  CARDS_PAGE_SIZE,
  filterBusinessCards,
  paginateBusinessCards,
  validateAndNormalizeCardDraft,
  type BusinessCardDraft,
} from '../utils/cardHelpers';

interface BusinessCardsViewProps {
  cards: BusinessCardItem[];
  vaultUnlocked: boolean;
  cloudConnected?: boolean;
  isSpeaking: boolean;
  onSaveCard: (draft: BusinessCardDraft, existingId?: string) => void;
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
  cloudConnected = false,
  isSpeaking,
  onSaveCard,
  onDeleteCard,
  onSpeakCard,
  onStopSpeaking,
}) => {
  const activeCards = useMemo(() => filterBusinessCards(cards, 'all', ''), [cards]);

  const [categoryFilter, setCategoryFilter] = useState<'all' | BusinessCardCategory>('all');
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [category, setCategory] = useState<BusinessCardCategory>('client');
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [department, setDepartment] = useState('');
  const [companyUrl, setCompanyUrl] = useState('');
  const [title, setTitle] = useState('');
  const [landline, setLandline] = useState('');
  const [phone, setPhone] = useState('');
  const [fax, setFax] = useState('');
  const [lineId, setLineId] = useState('');
  const [address, setAddress] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [pinned, setPinned] = useState(false);
  const [formError, setFormError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [formHighlighted, setFormHighlighted] = useState(false);

  const formSectionRef = useRef<HTMLElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  const filteredCards = useMemo(
    () => filterBusinessCards(cards, categoryFilter, search),
    [cards, categoryFilter, search]
  );

  const paginated = useMemo(
    () => paginateBusinessCards(filteredCards, currentPage, CARDS_PAGE_SIZE),
    [filteredCards, currentPage]
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [categoryFilter, search]);

  useEffect(() => {
    if (paginated.page !== currentPage) {
      setCurrentPage(paginated.page);
    }
  }, [paginated.page, currentPage]);

  const resetForm = () => {
    setEditingId(null);
    setCategory('client');
    setName('');
    setCompany('');
    setDepartment('');
    setCompanyUrl('');
    setTitle('');
    setLandline('');
    setPhone('');
    setFax('');
    setLineId('');
    setAddress('');
    setEmail('');
    setNotes('');
    setPinned(false);
    setFormError('');
  };

  const handleStartNewCard = () => {
    resetForm();
    setFeedback('請填寫下方「姓名」後點擊儲存名片。');
    setFormHighlighted(true);
    window.setTimeout(() => setFormHighlighted(false), 1200);
    formSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    window.setTimeout(() => nameInputRef.current?.focus(), 80);
  };

  const loadCardIntoForm = (card: BusinessCardItem) => {
    setEditingId(card.id);
    setCategory(card.category);
    setName(card.name);
    setCompany(card.company);
    setDepartment(card.department || '');
    setCompanyUrl(card.companyUrl || '');
    setTitle(card.title);
    setLandline(card.landline || '');
    setPhone(card.phone);
    setFax(card.fax || '');
    setLineId(card.lineId || '');
    setAddress(card.address || '');
    setEmail(card.email);
    setNotes(card.notes);
    setPinned(card.pinned);
    setFormError('');
    setFeedback('');
    formSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const handleToggleCardPin = (card: BusinessCardItem) => {
    onSaveCard(
      {
        category: card.category,
        name: card.name,
        company: card.company,
        department: card.department || '',
        companyUrl: card.companyUrl || '',
        title: card.title,
        phone: card.phone,
        landline: card.landline || '',
        fax: card.fax || '',
        lineId: card.lineId || '',
        address: card.address || '',
        email: card.email,
        notes: card.notes,
        pinned: !card.pinned,
      },
      card.id
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validated = validateAndNormalizeCardDraft({
      category,
      name,
      company,
      department,
      companyUrl,
      title,
      phone,
      landline,
      fax,
      lineId,
      address,
      email,
      notes,
      pinned,
    });
    if (!validated.ok) {
      setFormError(validated.error);
      if (validated.error.includes('姓名')) {
        nameInputRef.current?.focus();
      }
      return;
    }

    onSaveCard(validated.draft, editingId ?? undefined);
    if (categoryFilter !== 'all' && categoryFilter !== validated.draft.category) {
      setCategoryFilter('all');
    }
    if (search.trim()) {
      setSearch('');
    }
    setCurrentPage(1);
    setFeedback(
      editingId
        ? `已更新「${validated.draft.name}」的名片資料`
        : `已新增「${validated.draft.name}」至名片夾`
    );
    resetForm();
  };

  const handleCopy = async (card: BusinessCardItem) => {
    const orgLine = [card.company, card.department].filter(Boolean).join(' · ');
    const summary = [
      `${card.name}${card.title ? ` (${card.title})` : ''}`,
      orgLine,
      card.companyUrl ? `網址: ${card.companyUrl}` : '',
      card.landline ? `室內電話: ${card.landline}` : '',
      card.phone ? `個人手機: ${card.phone}` : '',
      card.fax ? `傳真: ${card.fax}` : '',
      card.lineId ? `Line ID: ${card.lineId}` : '',
      card.email ? `電子信箱: ${card.email}` : '',
      card.address ? `地址: ${card.address}` : '',
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
      .map((c) => {
        const orgValue = [c.company, c.department].filter(Boolean).join(';');
        const noteWithLine = [
          c.lineId ? `Line ID: ${c.lineId}` : '',
          c.notes ? c.notes.replace(/\n/g, ' ') : '',
        ]
          .filter(Boolean)
          .join(' | ');
        return [
          'BEGIN:VCARD',
          'VERSION:3.0',
          `FN:${c.name}`,
          orgValue ? `ORG:${orgValue}` : '',
          c.title ? `TITLE:${c.title}` : '',
          c.landline ? `TEL;TYPE=WORK,VOICE:${c.landline}` : '',
          c.phone ? `TEL;TYPE=CELL:${c.phone}` : '',
          c.fax ? `TEL;TYPE=WORK,FAX:${c.fax}` : '',
          c.address ? `ADR;TYPE=WORK:;;${c.address};;;;` : '',
          c.email ? `EMAIL:${c.email}` : '',
          c.companyUrl ? `URL:${c.companyUrl}` : '',
          c.lineId ? `X-LINE-ID:${c.lineId}` : '',
          noteWithLine ? `NOTE:${noteWithLine}` : '',
          'END:VCARD',
        ]
          .filter(Boolean)
          .join('\r\n');
      })
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
              共 {activeCards.length} 張名片（每頁 {CARDS_PAGE_SIZE} 張）·{' '}
              {cloudConnected && vaultUnlocked
                ? '端對端加密保護中，已連線跨裝置即時雲端同步'
                : cloudConnected && !vaultUnlocked
                  ? '已連線雲端空間，請至「備份與主題」輸入密碼解鎖金鑰以同步更新'
                  : vaultUnlocked
                    ? '本機金鑰加密中（尚未連線雲端同步帳號或序號）'
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
              onClick={handleStartNewCard}
              className="inline-flex items-center gap-1.5 rounded-xl accent-bg px-4 py-2 text-xs font-medium min-h-[40px]"
            >
              <Plus className="w-4 h-4" />
              <span>新增名片</span>
            </button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-[1.25fr_1fr] gap-6 items-start">
        {/* Left: Search, Filter, Directory List & 5-per-page Pagination */}
        <section className="rounded-2xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-4">
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                aria-label="搜尋名片姓名、公司部門、電話、Line ID、地址或信箱"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜尋姓名、公司部門、手機、市話、Line ID、地址、信箱..."
                className="w-full rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-950 pl-9 pr-3 py-2 text-xs"
              />
            </div>

            <div className="flex items-center gap-1 p-1 rounded-xl bg-stone-100 dark:bg-zinc-800/80 shrink-0 overflow-x-auto">
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
            <>
              <ul className="divide-y divide-stone-100 dark:divide-zinc-800" data-testid="business-cards-list">
                {paginated.items.map((card) => {
                  const orgParts = [card.company, card.department, card.title].filter(Boolean);
                  return (
                    <li
                      key={card.id}
                      className={`py-4 first:pt-1 last:pb-1 space-y-2 ${
                        editingId === card.id ? 'accent-soft-bg rounded-xl px-3 -mx-3' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
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
                            {card.title && (
                              <span className="text-xs text-stone-500 dark:text-zinc-400">
                                · {card.title}
                              </span>
                            )}
                            {card.pinned && (
                              <Pin className="w-3.5 h-3.5 accent-text shrink-0" aria-label="已置頂" />
                            )}
                          </div>

                          {(orgParts.length > 0 || card.companyUrl) && (
                            <div className="text-xs text-stone-600 dark:text-zinc-300 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                              {(card.company || card.department) && (
                                <span className="inline-flex items-center gap-1.5 min-w-0">
                                  <Building2 className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                                  <span className="break-words">
                                    {[card.company, card.department].filter(Boolean).join(' · ')}
                                  </span>
                                </span>
                              )}
                              {card.companyUrl && (
                                <a
                                  href={card.companyUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 accent-text hover:underline font-medium break-all"
                                >
                                  <Globe className="w-3 h-3 shrink-0" />
                                  <span>網站連結</span>
                                  <ExternalLink className="w-3 h-3 shrink-0" />
                                </a>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleToggleCardPin(card)}
                            aria-label={card.pinned ? `取消置頂「${card.name}」` : `置頂「${card.name}」`}
                            title={card.pinned ? '取消置頂' : '置頂名片'}
                            className={`p-2 rounded-lg min-h-[34px] min-w-[34px] flex items-center justify-center ${
                              card.pinned
                                ? 'accent-text bg-stone-100 dark:bg-zinc-800'
                                : 'text-stone-400 hover:text-stone-700 hover:bg-stone-100 dark:hover:bg-zinc-800'
                            }`}
                          >
                            <Pin className="w-3.5 h-3.5" />
                          </button>
                          {isSpeaking ? (
                            <button
                              type="button"
                              onClick={onStopSpeaking}
                              aria-label="停止語音朗讀"
                              className="p-2 rounded-lg bg-rose-600 text-white hover:bg-rose-700 min-h-[34px] min-w-[34px] flex items-center justify-center"
                            >
                              <Square className="w-3.5 h-3.5 fill-current" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onSpeakCard(card)}
                              aria-label={`語音朗讀名片「${card.name}」`}
                              className="p-2 rounded-lg text-stone-500 hover:bg-stone-100 dark:hover:bg-zinc-800 min-h-[34px] min-w-[34px] flex items-center justify-center"
                            >
                              <Volume2 className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleCopy(card)}
                            aria-label={`複製「${card.name}」聯絡資訊`}
                            className="p-2 rounded-lg text-stone-500 hover:bg-stone-100 dark:hover:bg-zinc-800 min-h-[34px] min-w-[34px] flex items-center justify-center"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteCard(card.id)}
                            aria-label={`刪除名片「${card.name}」`}
                            className="p-2 rounded-lg text-stone-400 hover:text-rose-600 hover:bg-stone-100 dark:hover:bg-zinc-800 min-h-[34px] min-w-[34px] flex items-center justify-center"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Contact Details Grid */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-stone-600 dark:text-zinc-400 font-mono tabular-nums">
                        {card.landline && (
                          <a
                            href={`tel:${card.landline}`}
                            className="inline-flex items-center gap-1 hover:underline text-stone-700 dark:text-zinc-300"
                          >
                            <PhoneCall className="w-3.5 h-3.5 accent-text shrink-0" />
                            <span className="font-sans text-[11px] text-stone-500 dark:text-zinc-400">市話</span>
                            <span>{card.landline}</span>
                          </a>
                        )}
                        {card.phone && (
                          <a
                            href={`tel:${card.phone}`}
                            className="inline-flex items-center gap-1 hover:underline text-stone-700 dark:text-zinc-300"
                          >
                            <Phone className="w-3.5 h-3.5 accent-text shrink-0" />
                            <span className="font-sans text-[11px] text-stone-500 dark:text-zinc-400">手機</span>
                            <span>{card.phone}</span>
                          </a>
                        )}
                        {card.fax && (
                          <span className="inline-flex items-center gap-1 text-stone-700 dark:text-zinc-300">
                            <Printer className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                            <span className="font-sans text-[11px] text-stone-500 dark:text-zinc-400">傳真</span>
                            <span>{card.fax}</span>
                          </span>
                        )}
                        {card.lineId && (
                          <span className="inline-flex items-center gap-1 text-stone-700 dark:text-zinc-300">
                            <MessageCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            <span className="font-sans text-[11px] text-stone-500 dark:text-zinc-400">Line</span>
                            <span>{card.lineId}</span>
                          </span>
                        )}
                        {card.email && (
                          <a
                            href={`mailto:${card.email}`}
                            className="inline-flex items-center gap-1 hover:underline text-stone-700 dark:text-zinc-300 break-all"
                          >
                            <Mail className="w-3.5 h-3.5 accent-text shrink-0" />
                            <span>{card.email}</span>
                          </a>
                        )}
                        {copiedId === card.id && (
                          <span className="text-[11px] font-sans font-medium accent-text">
                            已複製名片資訊
                          </span>
                        )}
                      </div>

                      {card.address && (
                        <p className="text-xs text-stone-600 dark:text-zinc-300 flex items-start gap-1.5 leading-relaxed">
                          <MapPin className="w-3.5 h-3.5 text-stone-400 shrink-0 mt-0.5" />
                          <span className="break-words">{card.address}</span>
                        </p>
                      )}

                      {card.notes && (
                        <p className="text-xs text-stone-600 dark:text-zinc-400 leading-relaxed">
                          備註：{card.notes}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>

              {/* Pagination Controls (5 cards per page) */}
              <div
                data-testid="cards-pagination"
                className="pt-3 border-t border-stone-200/80 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-2"
              >
                <span className="text-[11px] font-mono tabular-nums text-stone-500 dark:text-zinc-400">
                  第 {paginated.page} / {paginated.totalPages} 頁 · 共 {paginated.totalItems} 張（每頁 {CARDS_PAGE_SIZE} 張）
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={paginated.page <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    aria-label="上一頁名片"
                    className="inline-flex items-center gap-1 rounded-lg border border-stone-200 dark:border-zinc-700 px-2.5 py-1.5 text-xs font-medium text-stone-700 dark:text-zinc-300 hover:bg-stone-100 dark:hover:bg-zinc-800 disabled:opacity-40 min-h-[34px]"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>上一頁</span>
                  </button>
                  {Array.from({ length: paginated.totalPages }, (_, i) => i + 1).map((pageNum) => (
                    <button
                      key={pageNum}
                      type="button"
                      onClick={() => setCurrentPage(pageNum)}
                      aria-label={`名片第 ${pageNum} 頁`}
                      aria-current={pageNum === paginated.page ? 'page' : undefined}
                      className={`min-w-[32px] min-h-[34px] px-2 rounded-lg text-xs font-mono font-medium transition-colors ${
                        pageNum === paginated.page
                          ? 'accent-bg'
                          : 'border border-stone-200 dark:border-zinc-700 text-stone-600 dark:text-zinc-300 hover:bg-stone-100 dark:hover:bg-zinc-800'
                      }`}
                    >
                      {pageNum}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={paginated.page >= paginated.totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(paginated.totalPages, p + 1))}
                    aria-label="下一頁名片"
                    className="inline-flex items-center gap-1 rounded-lg border border-stone-200 dark:border-zinc-700 px-2.5 py-1.5 text-xs font-medium text-stone-700 dark:text-zinc-300 hover:bg-stone-100 dark:hover:bg-zinc-800 disabled:opacity-40 min-h-[34px]"
                  >
                    <span>下一頁</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </>
          )}
        </section>

        {/* Right: Create / Edit Business Card Form */}
        <section
          ref={formSectionRef}
          aria-label="編輯或新增名片"
          className={`rounded-2xl border bg-white dark:bg-zinc-900 p-5 space-y-4 transition-all ${
            formHighlighted
              ? 'accent-border ring-2 ring-offset-2 ring-stone-300 dark:ring-zinc-700'
              : 'border-stone-200 dark:border-zinc-800'
          }`}
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

          <form onSubmit={handleSubmit} noValidate className="space-y-3.5">
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
                ref={nameInputRef}
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
                  公司名稱
                </label>
                <input
                  id="card-company"
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="例如：亞太雲端科技"
                  className="w-full rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-950 px-3.5 py-2 text-xs"
                />
              </div>
              <div>
                <label htmlFor="card-department" className="block text-xs font-medium text-stone-700 dark:text-zinc-300 mb-1">
                  公司部門
                </label>
                <input
                  id="card-department"
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="例如：資訊處 / 採購部"
                  className="w-full rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-950 px-3.5 py-2 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="card-company-url" className="block text-xs font-medium text-stone-700 dark:text-zinc-300 mb-1">
                  公司／部門網址（選填）
                </label>
                <input
                  id="card-company-url"
                  type="url"
                  value={companyUrl}
                  onChange={(e) => {
                    setCompanyUrl(e.target.value);
                    if (formError) setFormError('');
                  }}
                  placeholder="https://company.com/dept"
                  className="w-full rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-950 px-3.5 py-2 text-xs font-mono"
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
                <label htmlFor="card-landline" className="block text-xs font-medium text-stone-700 dark:text-zinc-300 mb-1">
                  室內電話
                </label>
                <input
                  id="card-landline"
                  type="tel"
                  value={landline}
                  onChange={(e) => setLandline(e.target.value)}
                  placeholder="02-2700-8899 #312"
                  className="w-full rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-950 px-3.5 py-2 text-xs font-mono"
                />
              </div>
              <div>
                <label htmlFor="card-phone" className="block text-xs font-medium text-stone-700 dark:text-zinc-300 mb-1">
                  個人手機
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
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="card-fax" className="block text-xs font-medium text-stone-700 dark:text-zinc-300 mb-1">
                  傳真
                </label>
                <input
                  id="card-fax"
                  type="tel"
                  value={fax}
                  onChange={(e) => setFax(e.target.value)}
                  placeholder="02-2700-8800"
                  className="w-full rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-950 px-3.5 py-2 text-xs font-mono"
                />
              </div>
              <div>
                <label htmlFor="card-line-id" className="block text-xs font-medium text-stone-700 dark:text-zinc-300 mb-1">
                  Line ID
                </label>
                <input
                  id="card-line-id"
                  type="text"
                  value={lineId}
                  onChange={(e) => setLineId(e.target.value)}
                  placeholder="例如：@company_id"
                  className="w-full rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-950 px-3.5 py-2 text-xs font-mono"
                />
              </div>
            </div>

            <div>
              <label htmlFor="card-email" className="block text-xs font-medium text-stone-700 dark:text-zinc-300 mb-1">
                電子信箱
              </label>
              <input
                id="card-email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (formError) setFormError('');
                }}
                placeholder="name@company.com"
                className="w-full rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-950 px-3.5 py-2 text-xs font-mono"
              />
            </div>

            <div>
              <label htmlFor="card-address" className="block text-xs font-medium text-stone-700 dark:text-zinc-300 mb-1">
                地址
              </label>
              <input
                id="card-address"
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="例如：臺北市信義區松仁路 100 號"
                className="w-full rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-950 px-3.5 py-2 text-xs"
              />
            </div>

            <div>
              <label htmlFor="card-notes" className="block text-xs font-medium text-stone-700 dark:text-zinc-300 mb-1">
                備註
              </label>
              <textarea
                id="card-notes"
                rows={2}
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
