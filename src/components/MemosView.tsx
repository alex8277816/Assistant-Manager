import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Lock,
  Pin,
  Plus,
  Search,
  StickyNote,
  Trash2,
  Volume2,
} from 'lucide-react';
import type { MemoItem } from '../types/assistant';
import { inferSmartTags } from '../utils/smartEngine';
import {
  DEFAULT_MEMO_PAGE_SIZE,
  getDesktopPinnedMemos,
  MEMO_PAGE_SIZE_OPTIONS,
  normalizeMemoPageSize,
  paginateMemos,
  sortAndFilterMemos,
  type MemoFilterMode,
} from '../utils/memoHelpers';
import { StickyMemoCard } from './DesktopStickyMemos';

const MEMO_PAGE_SIZE_KEY = 'kairo_memo_page_size_v1';

function loadSavedPageSize(): number {
  try {
    const raw = localStorage.getItem(MEMO_PAGE_SIZE_KEY);
    if (!raw) return DEFAULT_MEMO_PAGE_SIZE;
    return normalizeMemoPageSize(Number(raw));
  } catch {
    return DEFAULT_MEMO_PAGE_SIZE;
  }
}

interface MemosViewProps {
  memos: MemoItem[];
  initialSelectedId?: string | null;
  vaultUnlocked: boolean;
  cloudConnected?: boolean;
  floatingMemoIds?: string[];
  onSaveMemo: (
    draft: Omit<MemoItem, 'id' | 'version' | 'syncStatus' | 'createdAt' | 'updatedAt'>,
    existingId?: string
  ) => string | void;
  onToggleMemoPin: (id: string) => void;
  onToggleDesktopPin: (id: string, forceValue?: boolean) => void;
  onToggleFloatingMemo?: (id: string) => void;
  onToggleChecklistItem?: (memoId: string, itemId: string) => void;
  onCopyMemo?: (memo: MemoItem) => void;
  onDeleteMemo: (id: string) => void;
  onSpeakMemo: (memo: MemoItem) => void;
}

export const MemosView: React.FC<MemosViewProps> = ({
  memos,
  initialSelectedId = null,
  vaultUnlocked,
  cloudConnected = false,
  floatingMemoIds = [],
  onSaveMemo,
  onToggleMemoPin,
  onToggleDesktopPin,
  onToggleFloatingMemo,
  onToggleChecklistItem,
  onCopyMemo,
  onDeleteMemo,
  onSpeakMemo,
}) => {
  const activeMemos = useMemo(() => sortAndFilterMemos(memos, '', 'all'), [memos]);
  const desktopPinnedMemos = useMemo(() => getDesktopPinnedMemos(memos), [memos]);
  const pinnedCount = useMemo(
    () => activeMemos.filter((m) => m.pinned).length,
    [activeMemos]
  );

  const [selectedId, setSelectedId] = useState<string | null>(
    initialSelectedId || activeMemos[0]?.id || null
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<MemoFilterMode>('all');
  const [pageSize, setPageSize] = useState<number>(() => loadSavedPageSize());
  const [currentPage, setCurrentPage] = useState(1);
  const [isCreating, setIsCreating] = useState(false);
  const [isDropActive, setIsDropActive] = useState(false);
  const [quickPinPickId, setQuickPinPickId] = useState('');

  const titleInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (initialSelectedId) {
      setIsCreating(false);
      setSelectedId(initialSelectedId);
    }
  }, [initialSelectedId]);

  const currentMemo = useMemo(
    () =>
      isCreating
        ? null
        : activeMemos.find((m) => m.id === selectedId) || activeMemos[0] || null,
    [activeMemos, selectedId, isCreating]
  );

  const [title, setTitle] = useState(currentMemo?.title || '');
  const [content, setContent] = useState(currentMemo?.content || '');
  const [pinned, setPinned] = useState(currentMemo?.pinned || false);
  const [pinnedToDesktop, setPinnedToDesktop] = useState(
    Boolean(currentMemo?.pinnedToDesktop)
  );
  const [tagsText, setTagsText] = useState((currentMemo?.tags || []).join(', '));
  const [checklistText, setChecklistText] = useState('');
  const [formError, setFormError] = useState('');
  const [savedNotice, setSavedNotice] = useState('');

  useEffect(() => {
    if (isCreating) return;
    if (currentMemo) {
      setTitle(currentMemo.title);
      setContent(currentMemo.content);
      setPinned(currentMemo.pinned);
      setPinnedToDesktop(Boolean(currentMemo.pinnedToDesktop));
      setTagsText(currentMemo.tags.join(', '));
    }
  }, [currentMemo?.id, isCreating]);

  // Keep pin toggles in form synchronized when toggled via 1-click actions or right panel
  useEffect(() => {
    if (isCreating || !currentMemo) return;
    setPinned(Boolean(currentMemo.pinned));
    setPinnedToDesktop(Boolean(currentMemo.pinnedToDesktop));
  }, [currentMemo?.id, currentMemo?.pinned, currentMemo?.pinnedToDesktop, isCreating]);

  const selectMemoForEdit = (memo: MemoItem) => {
    setIsCreating(false);
    setSelectedId(memo.id);
    setTitle(memo.title);
    setContent(memo.content);
    setPinned(memo.pinned);
    setPinnedToDesktop(Boolean(memo.pinnedToDesktop));
    setTagsText(memo.tags.join(', '));
    setFormError('');
    setSavedNotice('');
  };

  const startNewMemo = (defaultPinToDesktop = false) => {
    setIsCreating(true);
    setSelectedId(null);
    setTitle('');
    setContent('');
    setPinned(false);
    setPinnedToDesktop(defaultPinToDesktop);
    setTagsText(defaultPinToDesktop ? '常用' : '');
    setFormError('');
    setSavedNotice('');
    window.setTimeout(() => titleInputRef.current?.focus(), 20);
  };

  const filteredMemos = useMemo(
    () => sortAndFilterMemos(memos, searchQuery, filterMode),
    [memos, searchQuery, filterMode]
  );

  const pagination = useMemo(
    () => paginateMemos(filteredMemos, currentPage, pageSize),
    [filteredMemos, currentPage, pageSize]
  );

  const unpinnedDesktopCandidates = useMemo(
    () => activeMemos.filter((m) => !m.pinnedToDesktop),
    [activeMemos]
  );

  const handlePageSizeChange = (nextSize: number) => {
    const normalized = normalizeMemoPageSize(nextSize);
    setPageSize(normalized);
    setCurrentPage(1);
    try {
      localStorage.setItem(MEMO_PAGE_SIZE_KEY, String(normalized));
    } catch {
      // ignore
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setFormError('請輸入備忘錄標題');
      return;
    }
    const explicitTags = tagsText
      .split(/[,，\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const mergedTags = inferSmartTags(title, content, explicitTags);

    const savedId = onSaveMemo(
      {
        title: title.trim(),
        content: content.trim(),
        tags: mergedTags,
        pinned,
        pinnedToDesktop,
        checklist: currentMemo?.checklist || [],
      },
      currentMemo?.id
    );
    if (typeof savedId === 'string' && savedId) {
      setSelectedId(savedId);
    }
    setIsCreating(false);
    setFormError('');
    setSavedNotice('已儲存並加入本地加密儲存庫');
  };

  const handleAddChecklistItem = () => {
    if (!currentMemo || !checklistText.trim()) return;
    const nextChecklist = [
      ...currentMemo.checklist,
      { id: `chk-${Date.now()}`, text: checklistText.trim(), done: false },
    ];
    onSaveMemo(
      {
        title: currentMemo.title,
        content: currentMemo.content,
        tags: currentMemo.tags,
        pinned: currentMemo.pinned,
        pinnedToDesktop: Boolean(currentMemo.pinnedToDesktop),
        checklist: nextChecklist,
      },
      currentMemo.id
    );
    setChecklistText('');
  };

  const handleToggleChecklist = (itemId: string) => {
    if (!currentMemo) return;
    if (onToggleChecklistItem) {
      onToggleChecklistItem(currentMemo.id, itemId);
      return;
    }
    const nextChecklist = currentMemo.checklist.map((item) =>
      item.id === itemId ? { ...item, done: !item.done } : item
    );
    onSaveMemo(
      {
        title: currentMemo.title,
        content: currentMemo.content,
        tags: currentMemo.tags,
        pinned: currentMemo.pinned,
        pinnedToDesktop: Boolean(currentMemo.pinnedToDesktop),
        checklist: nextChecklist,
      },
      currentMemo.id
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[310px_minmax(0,1fr)_300px] gap-5 items-start">
      {/* Left Pane: Paginated Memo List */}
      <section className="rounded-2xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
        <div className="p-3.5 border-b border-stone-200 dark:border-zinc-800 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-base font-semibold text-stone-900 dark:text-zinc-100">
              加密備忘錄 ({activeMemos.length})
            </h1>
            <button
              type="button"
              onClick={() => startNewMemo(false)}
              className="inline-flex items-center gap-1.5 rounded-xl accent-bg px-3 py-1.5 text-xs font-medium min-h-[36px] whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>新增筆記</span>
            </button>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              aria-label="搜尋備忘錄"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="搜尋筆記標題、內文或標籤..."
              className="w-full rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-950 pl-8 pr-3 py-1.5 text-xs text-stone-900 dark:text-zinc-100"
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 min-w-0">
              {(
                [
                  { id: 'all', label: `全部 (${activeMemos.length})` },
                  { id: 'pinned', label: `已置頂 (${pinnedCount})` },
                  { id: 'desktop', label: `桌面 (${desktopPinnedMemos.length})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setFilterMode(tab.id);
                    setCurrentPage(1);
                  }}
                  className={`px-2 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap transition-colors ${
                    filterMode === tab.id
                      ? 'accent-bg'
                      : 'bg-stone-100 dark:bg-zinc-800 text-stone-600 dark:text-zinc-300 hover:bg-stone-200 dark:hover:bg-zinc-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <select
              aria-label="每頁顯示備忘錄筆數"
              value={pageSize}
              onChange={(e) => handlePageSizeChange(Number(e.target.value))}
              className="rounded-lg border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-950 px-1.5 py-1 text-[11px] font-medium text-stone-700 dark:text-zinc-300 shrink-0"
            >
              {MEMO_PAGE_SIZE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  每頁 {opt} 則
                </option>
              ))}
            </select>
          </div>
        </div>

        {pagination.items.length === 0 ? (
          <div className="p-8 text-center text-xs text-stone-500 dark:text-zinc-400">
            尚無符合條件的加密備忘錄
          </div>
        ) : (
          <ul
            data-testid="memo-list"
            className="divide-y divide-stone-100 dark:divide-zinc-800"
          >
            {pagination.items.map((memo) => {
              const active = !isCreating && currentMemo?.id === memo.id;
              return (
                <li
                  key={memo.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', memo.id);
                    e.dataTransfer.setData('application/x-kairo-memo', memo.id);
                    e.dataTransfer.effectAllowed = 'copyMove';
                  }}
                  className={`flex items-start gap-1.5 px-3 py-2.5 transition-colors ${
                    active
                      ? 'accent-soft-bg'
                      : 'hover:bg-stone-50 dark:hover:bg-zinc-800/40'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => selectMemoForEdit(memo)}
                    className="flex-1 min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 rounded-md"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[13px] font-semibold text-stone-900 dark:text-zinc-100 truncate">
                        {memo.title}
                      </span>
                    </div>
                    <p className="text-[11.5px] text-stone-500 dark:text-zinc-400 mt-0.5 truncate">
                      {memo.content || '（無內文）'}
                    </p>
                    <p className="text-[10.5px] text-stone-400 dark:text-zinc-500 mt-1 font-mono truncate">
                      {memo.tags.join(' / ') || '一般'} ·{' '}
                      {new Date(memo.updatedAt).toLocaleDateString('zh-TW')}
                    </p>
                  </button>

                  <div className="flex items-center gap-0.5 shrink-0 pt-0.5">
                    <button
                      type="button"
                      onClick={() => onToggleMemoPin(memo.id)}
                      aria-pressed={memo.pinned}
                      aria-label={memo.pinned ? `取消置頂「${memo.title}」` : `置頂「${memo.title}」`}
                      title={memo.pinned ? '取消置頂' : '置頂備忘錄（可置頂多則）'}
                      className={`p-1.5 rounded-lg transition-colors min-h-[28px] min-w-[28px] flex items-center justify-center ${
                        memo.pinned
                          ? 'accent-text bg-white/90 dark:bg-zinc-800 shadow-2xs'
                          : 'text-stone-400 dark:text-zinc-500 hover:text-stone-700 dark:hover:text-zinc-200 hover:bg-stone-200/60 dark:hover:bg-zinc-800'
                      }`}
                    >
                      <Pin className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleDesktopPin(memo.id)}
                      aria-pressed={Boolean(memo.pinnedToDesktop)}
                      aria-label={
                        memo.pinnedToDesktop
                          ? `從桌面便利貼移除「${memo.title}」`
                          : `釘選「${memo.title}」到桌面便利貼`
                      }
                      title={
                        memo.pinnedToDesktop
                          ? '已釘選到桌面便利貼（點擊移除）'
                          : '釘選到右側桌面便利貼'
                      }
                      className={`p-1.5 rounded-lg transition-colors min-h-[28px] min-w-[28px] flex items-center justify-center ${
                        memo.pinnedToDesktop
                          ? 'text-amber-700 dark:text-amber-400 bg-amber-100/90 dark:bg-amber-950/60'
                          : 'text-stone-400 dark:text-zinc-500 hover:text-amber-700 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30'
                      }`}
                    >
                      <StickyNote className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* Pagination Controls */}
        {pagination.totalItems > 0 && (
          <div
            data-testid="memo-pagination"
            className="px-3.5 py-2.5 border-t border-stone-200 dark:border-zinc-800 bg-stone-50/70 dark:bg-zinc-950/50 space-y-2"
          >
            <div className="flex items-center justify-between text-[11px] text-stone-500 dark:text-zinc-400 font-mono tabular-nums">
              <span>
                顯示第 {pagination.startIndex + 1}–{pagination.endIndex} 則 / 共 {pagination.totalItems} 則
              </span>
              <span>
                第 {pagination.page} / {pagination.totalPages} 頁
              </span>
            </div>

            {pagination.totalPages > 1 && (
              <nav aria-label="備忘錄分頁" className="flex items-center justify-between gap-1.5">
                <button
                  type="button"
                  disabled={pagination.page <= 1}
                  onClick={() => setCurrentPage(pagination.page - 1)}
                  aria-label="上一頁備忘錄"
                  className="inline-flex items-center gap-0.5 rounded-lg border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1 text-[11px] font-medium text-stone-700 dark:text-zinc-200 hover:bg-stone-100 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:pointer-events-none min-h-[30px]"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>上一頁</span>
                </button>

                <div className="flex items-center gap-1">
                  {pagination.totalPages <= 5 ? (
                    Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setCurrentPage(p)}
                        aria-label={`備忘錄第 ${p} 頁`}
                        aria-current={p === pagination.page ? 'page' : undefined}
                        className={`min-w-[28px] h-[28px] px-1.5 rounded-lg text-[11px] font-mono tabular-nums font-medium transition-colors ${
                          p === pagination.page
                            ? 'accent-bg'
                            : 'text-stone-600 dark:text-zinc-400 hover:bg-stone-200/70 dark:hover:bg-zinc-800'
                        }`}
                      >
                        {p}
                      </button>
                    ))
                  ) : (
                    <span className="text-[11px] font-mono tabular-nums text-stone-600 dark:text-zinc-300 px-1">
                      {pagination.page} / {pagination.totalPages}
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => setCurrentPage(pagination.page + 1)}
                  aria-label="下一頁備忘錄"
                  className="inline-flex items-center gap-0.5 rounded-lg border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1 text-[11px] font-medium text-stone-700 dark:text-zinc-200 hover:bg-stone-100 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:pointer-events-none min-h-[30px]"
                >
                  <span>下一頁</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </nav>
            )}
          </div>
        )}
      </section>

      {/* Center Pane: Memo Editor */}
      <section className="rounded-2xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-stone-200 dark:border-zinc-800">
          <div className="flex items-center gap-2 text-xs text-stone-500 dark:text-zinc-400 min-w-0">
            <Lock className="w-3.5 h-3.5 accent-text shrink-0" />
            <span className="truncate">
              {cloudConnected && vaultUnlocked
                ? 'AES-256-GCM 端對端金鑰已解鎖 · 跨裝置雲端同步啟用中'
                : cloudConnected && !vaultUnlocked
                  ? '已連線雲端空間 · 請至「備份與主題」輸入密碼解鎖金鑰以同步更新'
                  : vaultUnlocked
                    ? '本機端對端金鑰已解鎖（尚未連線雲端帳號或同步序號）'
                    : '本機離線安全儲存（連線同步空間並設定金鑰即可跨平台同步）'}
            </span>
          </div>

          {currentMemo && (
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => onToggleMemoPin(currentMemo.id)}
                aria-pressed={currentMemo.pinned}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium min-h-[36px] transition-colors ${
                  currentMemo.pinned
                    ? 'accent-border accent-soft-bg accent-text'
                    : 'border-stone-200 dark:border-zinc-700 text-stone-700 dark:text-zinc-300 hover:bg-stone-100 dark:hover:bg-zinc-800'
                }`}
              >
                <Pin className="w-3.5 h-3.5" />
                <span>{currentMemo.pinned ? '已置頂' : '置頂'}</span>
              </button>
              <button
                type="button"
                onClick={() => onToggleDesktopPin(currentMemo.id)}
                aria-pressed={Boolean(currentMemo.pinnedToDesktop)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium min-h-[36px] transition-colors ${
                  currentMemo.pinnedToDesktop
                    ? 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300'
                    : 'border-stone-200 dark:border-zinc-700 text-stone-700 dark:text-zinc-300 hover:bg-stone-100 dark:hover:bg-zinc-800'
                }`}
              >
                <StickyNote className="w-3.5 h-3.5" />
                <span>{currentMemo.pinnedToDesktop ? '已釘選桌面' : '釘選到桌面'}</span>
              </button>
              <button
                type="button"
                onClick={() => onSpeakMemo(currentMemo)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 dark:border-zinc-700 px-2.5 py-1.5 text-xs font-medium text-stone-700 dark:text-zinc-300 hover:bg-stone-100 dark:hover:bg-zinc-800 min-h-[36px]"
              >
                <Volume2 className="w-3.5 h-3.5 accent-text" />
                <span>語音朗讀</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteMemo(currentMemo.id);
                  startNewMemo(false);
                }}
                aria-label={`刪除備忘錄「${currentMemo.title}」`}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 min-h-[36px]"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>刪除</span>
              </button>
            </div>
          )}
        </div>

        <form onSubmit={handleSave} className="mt-4 space-y-4">
          <div>
            <label htmlFor="memo-title-input" className="block text-xs font-medium text-stone-600 dark:text-zinc-400 mb-1.5">
              筆記標題
            </label>
            <input
              ref={titleInputRef}
              id="memo-title-input"
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (formError) setFormError('');
              }}
              placeholder="輸入備忘錄標題（例如：郵局代辦時間、常用廠商電話）..."
              className="w-full rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-950 px-3.5 py-2.5 text-sm font-medium text-stone-900 dark:text-zinc-100"
            />
            {formError && <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{formError}</p>}
          </div>

          <div>
            <label htmlFor="memo-content-input" className="block text-xs font-medium text-stone-600 dark:text-zinc-400 mb-1.5">
              詳細內容
            </label>
            <textarea
              id="memo-content-input"
              rows={7}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="記錄服務時間、聯絡電話、會議摘要或個人待確認事項..."
              className="w-full rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-950 px-3.5 py-2.5 text-sm leading-relaxed text-stone-900 dark:text-zinc-100"
            />
          </div>

          <div className="space-y-3">
            <div>
              <label htmlFor="memo-tags-input" className="block text-xs font-medium text-stone-600 dark:text-zinc-400 mb-1.5">
                智慧標籤（逗號分隔）
              </label>
              <input
                id="memo-tags-input"
                type="text"
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
                placeholder="工作, 郵局, 商家電話"
                className="w-full rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-950 px-3.5 py-2 text-xs text-stone-900 dark:text-zinc-100"
              />
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <label className="inline-flex items-center gap-2 text-xs sm:text-sm text-stone-700 dark:text-zinc-300 cursor-pointer min-h-[36px]">
                <input
                  type="checkbox"
                  checked={pinned}
                  onChange={(e) => setPinned(e.target.checked)}
                  className="h-4 w-4 rounded border-stone-300 text-teal-600"
                />
                <span>置頂此備忘錄（可多則）</span>
              </label>

              <label className="inline-flex items-center gap-2 text-xs sm:text-sm text-stone-700 dark:text-zinc-300 cursor-pointer min-h-[36px]">
                <input
                  type="checkbox"
                  checked={pinnedToDesktop}
                  onChange={(e) => setPinnedToDesktop(e.target.checked)}
                  className="h-4 w-4 rounded border-stone-300 text-amber-600"
                />
                <span>釘選到桌面便利貼</span>
              </label>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 pt-2">
            <span className="text-xs accent-text font-medium">{savedNotice}</span>
            <button
              type="submit"
              className="rounded-xl accent-bg px-5 py-2.5 text-sm font-medium min-h-[44px]"
            >
              {currentMemo ? '儲存變更' : '建立備忘錄'}
            </button>
          </div>
        </form>

        {/* Interactive Checklist inside existing memo */}
        {currentMemo && (
          <div className="mt-6 pt-5 border-t border-stone-200 dark:border-zinc-800 space-y-3">
            <h3 className="text-xs font-semibold text-stone-700 dark:text-zinc-300">
              核對清單項目
            </h3>
            {currentMemo.checklist.length > 0 && (
              <ul className="space-y-2">
                {currentMemo.checklist.map((item) => (
                  <li key={item.id}>
                    <label className="flex items-center gap-2.5 text-sm text-stone-800 dark:text-zinc-200 cursor-pointer min-h-[36px]">
                      <input
                        type="checkbox"
                        checked={item.done}
                        onChange={() => handleToggleChecklist(item.id)}
                        className="h-4 w-4 rounded border-stone-300 text-teal-600"
                      />
                      <span className={item.done ? 'line-through text-stone-400 dark:text-zinc-500' : ''}>
                        {item.text}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex gap-2">
              <input
                type="text"
                aria-label="新增核對項目"
                value={checklistText}
                onChange={(e) => setChecklistText(e.target.value)}
                placeholder="加入子檢查項目..."
                className="flex-1 min-w-0 rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-950 px-3 py-2 text-xs text-stone-900 dark:text-zinc-100"
              />
              <button
                type="button"
                onClick={handleAddChecklistItem}
                className="rounded-xl border border-stone-200 dark:border-zinc-700 px-3.5 py-2 text-xs font-medium text-stone-700 dark:text-zinc-200 hover:bg-stone-100 dark:hover:bg-zinc-800 min-h-[38px] shrink-0 whitespace-nowrap"
              >
                加入項目
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Right Pane: Desktop Sticky Memos Board (Drag & Drop or 1-Click Pin) */}
      <aside
        aria-label="桌面釘選便利貼服務區"
        data-testid="memo-desktop-pin-service"
        onDragOver={(e) => {
          e.preventDefault();
          if (!isDropActive) setIsDropActive(true);
        }}
        onDragLeave={() => setIsDropActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDropActive(false);
          const droppedId =
            e.dataTransfer.getData('application/x-kairo-memo') ||
            e.dataTransfer.getData('text/plain');
          if (droppedId) {
            onToggleDesktopPin(droppedId, true);
          }
        }}
        className={`lg:col-span-2 xl:col-span-1 rounded-2xl border bg-white dark:bg-zinc-900 p-4 space-y-3 transition-colors ${
          isDropActive
            ? 'border-amber-400 ring-2 ring-amber-400/40 bg-amber-50/40 dark:bg-amber-950/20'
            : 'border-stone-200 dark:border-zinc-800'
        }`}
      >
        <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-stone-200 dark:border-zinc-800">
          <div className="flex items-center gap-1.5 min-w-0">
            <StickyNote className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <h2 className="text-sm font-semibold text-stone-900 dark:text-zinc-100 truncate">
              桌面釘選便利貼 ({desktopPinnedMemos.length})
            </h2>
          </div>
          <button
            type="button"
            onClick={() => startNewMemo(true)}
            className="inline-flex items-center gap-1 rounded-lg border border-amber-300 dark:border-amber-700/80 bg-amber-50 dark:bg-amber-950/40 px-2.5 py-1 text-[11px] font-medium text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/50 whitespace-nowrap shrink-0"
          >
            <Plus className="w-3 h-3" />
            <span>新增便利貼</span>
          </button>
        </div>

        <p className="text-[11px] text-stone-500 dark:text-zinc-400 leading-relaxed">
          將常用資訊（如郵局時間、商家電話）釘選至此或拖曳左方備忘錄至此；也可點擊卡片右上角圖示「拉出為全域浮動便利貼」，在任何分頁都能直接查看。
        </p>

        {unpinnedDesktopCandidates.length > 0 && (
          <div className="flex items-center gap-1.5">
            <select
              aria-label="選擇要釘選到桌面的備忘錄"
              value={quickPinPickId}
              onChange={(e) => {
                const chosen = e.target.value;
                if (chosen) {
                  onToggleDesktopPin(chosen, true);
                  setQuickPinPickId('');
                }
              }}
              className="flex-1 min-w-0 rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-950 px-2.5 py-1.5 text-xs text-stone-700 dark:text-zinc-200"
            >
              <option value="">+ 快速選擇備忘錄釘選至桌面...</option>
              {unpinnedDesktopCandidates.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
          </div>
        )}

        {desktopPinnedMemos.length === 0 ? (
          <div className="rounded-xl border border-dashed border-amber-300/80 dark:border-amber-800/60 bg-amber-50/40 dark:bg-amber-950/10 p-5 text-center space-y-1.5">
            <p className="text-xs font-medium text-stone-700 dark:text-zinc-300">
              尚未釘選任何桌面便利貼
            </p>
            <p className="text-[11px] text-stone-500 dark:text-zinc-400 leading-relaxed">
              點擊左側備忘錄旁的便條圖示，或直接將備忘錄拖曳至此處即可固定顯示。
            </p>
          </div>
        ) : (
          <div className="space-y-2.5" data-testid="memo-desktop-pin-list">
            {desktopPinnedMemos.map((memo) => (
              <StickyMemoCard
                key={memo.id}
                memo={memo}
                isFloating={floatingMemoIds.includes(memo.id)}
                onCopy={onCopyMemo}
                onSpeak={onSpeakMemo}
                onEdit={selectMemoForEdit}
                onUnpinDesktop={(id) => onToggleDesktopPin(id, false)}
                onToggleFloating={onToggleFloatingMemo}
                onToggleChecklist={onToggleChecklistItem}
              />
            ))}
          </div>
        )}
      </aside>
    </div>
  );
};
