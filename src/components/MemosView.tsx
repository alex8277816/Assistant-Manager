import React, { useEffect, useMemo, useState } from 'react';
import { Lock, Pin, Plus, Search, Trash2, Volume2 } from 'lucide-react';
import type { MemoItem } from '../types/assistant';
import { inferSmartTags } from '../utils/smartEngine';

interface MemosViewProps {
  memos: MemoItem[];
  vaultUnlocked: boolean;
  onSaveMemo: (
    draft: Omit<MemoItem, 'id' | 'version' | 'syncStatus' | 'createdAt' | 'updatedAt'>,
    existingId?: string
  ) => void;
  onDeleteMemo: (id: string) => void;
  onSpeakMemo: (memo: MemoItem) => void;
}

export const MemosView: React.FC<MemosViewProps> = ({
  memos,
  vaultUnlocked,
  onSaveMemo,
  onDeleteMemo,
  onSpeakMemo,
}) => {
  const activeMemos = useMemo(
    () =>
      [...memos]
        .filter((m) => !m.deleted)
        .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt),
    [memos]
  );

  const [selectedId, setSelectedId] = useState<string | null>(activeMemos[0]?.id || null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const currentMemo = useMemo(
    () => (isCreating ? null : activeMemos.find((m) => m.id === selectedId) || activeMemos[0] || null),
    [activeMemos, selectedId, isCreating]
  );

  const [title, setTitle] = useState(currentMemo?.title || '');
  const [content, setContent] = useState(currentMemo?.content || '');
  const [pinned, setPinned] = useState(currentMemo?.pinned || false);
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
      setTagsText(currentMemo.tags.join(', '));
    }
  }, [currentMemo?.id, isCreating]);

  const selectMemoForEdit = (memo: MemoItem) => {
    setIsCreating(false);
    setSelectedId(memo.id);
    setTitle(memo.title);
    setContent(memo.content);
    setPinned(memo.pinned);
    setTagsText(memo.tags.join(', '));
    setFormError('');
    setSavedNotice('');
  };

  const startNewMemo = () => {
    setIsCreating(true);
    setSelectedId(null);
    setTitle('');
    setContent('');
    setPinned(false);
    setTagsText('');
    setFormError('');
    setSavedNotice('');
  };

  const filteredMemos = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return activeMemos;
    return activeMemos.filter((m) =>
      `${m.title} ${m.content} ${m.tags.join(' ')}`.toLowerCase().includes(q)
    );
  }, [activeMemos, searchQuery]);

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

    onSaveMemo(
      {
        title: title.trim(),
        content: content.trim(),
        tags: mergedTags,
        pinned,
        checklist: currentMemo?.checklist || [],
      },
      currentMemo?.id
    );
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
        checklist: nextChecklist,
      },
      currentMemo.id
    );
    setChecklistText('');
  };

  const handleToggleChecklist = (itemId: string) => {
    if (!currentMemo) return;
    const nextChecklist = currentMemo.checklist.map((item) =>
      item.id === itemId ? { ...item, done: !item.done } : item
    );
    onSaveMemo(
      {
        title: currentMemo.title,
        content: currentMemo.content,
        tags: currentMemo.tags,
        pinned: currentMemo.pinned,
        checklist: nextChecklist,
      },
      currentMemo.id
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6 items-start">
      {/* Memo List Pane */}
      <section className="rounded-2xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
        <div className="p-4 border-b border-stone-200 dark:border-zinc-800 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-base font-semibold text-stone-900 dark:text-zinc-100">
              加密備忘錄 ({activeMemos.length})
            </h1>
            <button
              type="button"
              onClick={startNewMemo}
              className="inline-flex items-center gap-1.5 rounded-xl accent-bg px-3 py-2 text-xs font-medium min-h-[40px] whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>新增筆記</span>
            </button>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              aria-label="搜尋備忘錄"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜尋筆記標題、內文或標籤..."
              className="w-full rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-950 pl-9 pr-3 py-2 text-xs text-stone-900 dark:text-zinc-100"
            />
          </div>
        </div>

        {filteredMemos.length === 0 ? (
          <div className="p-8 text-center text-xs text-stone-500 dark:text-zinc-400">
            尚無符合條件的加密備忘錄
          </div>
        ) : (
          <ul className="divide-y divide-stone-100 dark:divide-zinc-800">
            {filteredMemos.map((memo) => {
              const active = !isCreating && currentMemo?.id === memo.id;
              return (
                <li key={memo.id}>
                  <button
                    type="button"
                    onClick={() => selectMemoForEdit(memo)}
                    className={`w-full text-left px-4 py-3.5 transition-colors ${
                      active
                        ? 'accent-soft-bg'
                        : 'hover:bg-stone-50 dark:hover:bg-zinc-800/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-stone-900 dark:text-zinc-100 truncate">
                        {memo.title}
                      </span>
                      {memo.pinned && (
                        <Pin className="w-3.5 h-3.5 accent-text shrink-0" aria-label="已置頂" />
                      )}
                    </div>
                    <p className="text-xs text-stone-500 dark:text-zinc-400 mt-1 line-clamp-2">
                      {memo.content || '（無內文）'}
                    </p>
                    <p className="text-[11px] text-stone-400 dark:text-zinc-500 mt-1.5 font-mono">
                      {memo.tags.join(' / ')} · {new Date(memo.updatedAt).toLocaleDateString('zh-TW')}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Memo Editor Pane */}
      <section className="rounded-2xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-stone-200 dark:border-zinc-800">
          <div className="flex items-center gap-2 text-xs text-stone-500 dark:text-zinc-400">
            <Lock className="w-3.5 h-3.5 accent-text" />
            <span>
              {vaultUnlocked
                ? 'AES-256-GCM 端對端金鑰已解鎖 · 雲端同步全程加密'
                : '本機離線安全儲存（設定金鑰即可同步端對端加密雲端）'}
            </span>
          </div>

          {currentMemo && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onSpeakMemo(currentMemo)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium text-stone-700 dark:text-zinc-300 hover:bg-stone-100 dark:hover:bg-zinc-800 min-h-[38px]"
              >
                <Volume2 className="w-3.5 h-3.5 accent-text" />
                <span>語音朗讀</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteMemo(currentMemo.id);
                  startNewMemo();
                }}
                aria-label={`刪除備忘錄「${currentMemo.title}」`}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 min-h-[38px]"
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
              id="memo-title-input"
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (formError) setFormError('');
              }}
              placeholder="輸入備忘錄標題..."
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
              placeholder="記錄會議摘要、個人密碼提示、靈感或待確認事項..."
              className="w-full rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-950 px-3.5 py-2.5 text-sm leading-relaxed text-stone-900 dark:text-zinc-100"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
            <div>
              <label htmlFor="memo-tags-input" className="block text-xs font-medium text-stone-600 dark:text-zinc-400 mb-1.5">
                智慧標籤（逗號分隔）
              </label>
              <input
                id="memo-tags-input"
                type="text"
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
                placeholder="工作, 靈感, 開發"
                className="w-full rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-950 px-3.5 py-2 text-xs text-stone-900 dark:text-zinc-100"
              />
            </div>

            <label className="inline-flex items-center gap-2 text-sm text-stone-700 dark:text-zinc-300 cursor-pointer min-h-[40px]">
              <input
                type="checkbox"
                checked={pinned}
                onChange={(e) => setPinned(e.target.checked)}
                className="h-4 w-4 rounded border-stone-300 text-teal-600"
              />
              <span>置頂此備忘錄</span>
            </label>
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
                className="flex-1 rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-950 px-3 py-2 text-xs text-stone-900 dark:text-zinc-100"
              />
              <button
                type="button"
                onClick={handleAddChecklistItem}
                className="rounded-xl border border-stone-200 dark:border-zinc-700 px-3.5 py-2 text-xs font-medium text-stone-700 dark:text-zinc-200 hover:bg-stone-100 dark:hover:bg-zinc-800 min-h-[38px]"
              >
                加入項目
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
