import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Edit3,
  GripHorizontal,
  Maximize2,
  Minimize2,
  Pin,
  PinOff,
  PictureInPicture2,
  Plus,
  StickyNote,
  Volume2,
  X,
} from 'lucide-react';
import type { MemoItem } from '../types/assistant';

interface StickyMemoCardProps {
  memo: MemoItem;
  compact?: boolean;
  isFloating?: boolean;
  onCopy?: (memo: MemoItem) => void;
  onSpeak?: (memo: MemoItem) => void;
  onEdit?: (memo: MemoItem) => void;
  onUnpinDesktop?: (id: string) => void;
  onToggleFloating?: (id: string) => void;
  onToggleChecklist?: (memoId: string, itemId: string) => void;
}

export const StickyMemoCard: React.FC<StickyMemoCardProps> = ({
  memo,
  compact = false,
  isFloating = false,
  onCopy,
  onSpeak,
  onEdit,
  onUnpinDesktop,
  onToggleFloating,
  onToggleChecklist,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const text = memo.content?.trim() ? `${memo.title}\n${memo.content}` : memo.title;
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    onCopy?.(memo);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <article
      data-testid={`desktop-sticky-card-${memo.id}`}
      className={`rounded-xl border border-amber-200/90 dark:border-amber-800/60 bg-amber-50/75 dark:bg-amber-950/20 ${
        compact ? 'p-3' : 'p-3.5'
      } space-y-2 transition-colors`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {memo.pinned && (
              <Pin className="w-3 h-3 text-amber-700 dark:text-amber-400 shrink-0" aria-label="已置頂" />
            )}
            <h3 className="text-xs font-semibold text-stone-900 dark:text-zinc-100 break-words leading-snug">
              {memo.title}
            </h3>
          </div>
          {Array.isArray(memo.tags) && memo.tags.length > 0 && (
            <p className="text-[10.5px] text-amber-800/80 dark:text-amber-300/80 font-mono mt-0.5 truncate">
              {memo.tags.join(' / ')}
            </p>
          )}
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          {onToggleFloating && (
            <button
              type="button"
              onClick={() => onToggleFloating(memo.id)}
              aria-pressed={isFloating}
              aria-label={isFloating ? `收回浮動便利貼「${memo.title}」` : `拉出浮動便利貼「${memo.title}」`}
              title={isFloating ? '收回全域浮動便利貼' : '拉出為全域桌面浮動便利貼'}
              className={`p-1.5 rounded-lg transition-colors min-h-[28px] min-w-[28px] flex items-center justify-center ${
                isFloating
                  ? 'bg-amber-600 text-white'
                  : 'text-stone-500 dark:text-zinc-400 hover:bg-amber-200/60 dark:hover:bg-amber-900/40'
              }`}
            >
              <PictureInPicture2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={handleCopy}
            aria-label={`複製備忘錄「${memo.title}」內容`}
            title="複製標題與內容"
            className="p-1.5 rounded-lg text-stone-600 dark:text-zinc-300 hover:bg-amber-200/60 dark:hover:bg-amber-900/40 transition-colors min-h-[28px] min-w-[28px] flex items-center justify-center"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          {onUnpinDesktop && (
            <button
              type="button"
              onClick={() => onUnpinDesktop(memo.id)}
              aria-label={`從桌面移除「${memo.title}」`}
              title="從桌面釘選移除"
              className="p-1.5 rounded-lg text-stone-500 dark:text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors min-h-[28px] min-w-[28px] flex items-center justify-center"
            >
              <PinOff className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {memo.content && (
        <p className="text-xs text-stone-700 dark:text-zinc-200 whitespace-pre-wrap break-words leading-relaxed">
          {memo.content}
        </p>
      )}

      {Array.isArray(memo.checklist) && memo.checklist.length > 0 && (
        <ul className="space-y-1 pt-1 border-t border-amber-200/60 dark:border-amber-800/40">
          {memo.checklist.map((item) => (
            <li key={item.id}>
              {onToggleChecklist ? (
                <label className="flex items-center gap-2 text-[11.5px] text-stone-700 dark:text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={() => onToggleChecklist(memo.id, item.id)}
                    className="h-3.5 w-3.5 rounded border-amber-400 text-teal-600"
                  />
                  <span className={item.done ? 'line-through text-stone-400 dark:text-zinc-500' : ''}>
                    {item.text}
                  </span>
                </label>
              ) : (
                <span className={`text-[11.5px] block ${item.done ? 'line-through text-stone-400' : 'text-stone-700 dark:text-zinc-300'}`}>
                  • {item.text}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {(onSpeak || onEdit) && (
        <div className="pt-1 border-t border-amber-200/60 dark:border-amber-800/40 flex items-center justify-end gap-1.5">
          {onSpeak && (
            <button
              type="button"
              onClick={() => onSpeak(memo)}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-stone-600 dark:text-zinc-300 hover:bg-amber-200/50 dark:hover:bg-amber-900/40"
            >
              <Volume2 className="w-3 h-3 accent-text" />
              <span>朗讀</span>
            </button>
          )}
          {onEdit && (
            <button
              type="button"
              onClick={() => onEdit(memo)}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-stone-700 dark:text-zinc-200 hover:bg-amber-200/50 dark:hover:bg-amber-900/40"
            >
              <Edit3 className="w-3 h-3" />
              <span>編輯</span>
            </button>
          )}
        </div>
      )}
    </article>
  );
};

interface FloatingPos {
  x: number;
  y: number;
}

const STORAGE_POS_KEY = 'kairo_floating_memo_pos_v1';

function loadSavedPositions(): Record<string, FloatingPos> {
  try {
    const raw = localStorage.getItem(STORAGE_POS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, FloatingPos>) : {};
  } catch {
    return {};
  }
}

interface FloatingStickyMemosOverlayProps {
  memos: MemoItem[];
  onCloseFloating: (id: string) => void;
  onUnpinDesktop: (id: string) => void;
  onEditMemo: (memo: MemoItem) => void;
  onCopyMemo: (memo: MemoItem) => void;
  onToggleChecklist: (memoId: string, itemId: string) => void;
}

export const FloatingStickyMemosOverlay: React.FC<FloatingStickyMemosOverlayProps> = ({
  memos,
  onCloseFloating,
  onUnpinDesktop,
  onEditMemo,
  onCopyMemo,
  onToggleChecklist,
}) => {
  const [positions, setPositions] = useState<Record<string, FloatingPos>>(() => loadSavedPositions());
  const [minimizedIds, setMinimizedIds] = useState<Record<string, boolean>>({});
  const dragRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_POS_KEY, JSON.stringify(positions));
    } catch {
      // ignore
    }
  }, [positions]);

  useEffect(() => {
    const handleMove = (ev: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
      const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
      const nextX = Math.min(Math.max(12, drag.origX + (ev.clientX - drag.startX)), Math.max(12, vw - 292));
      const nextY = Math.min(Math.max(64, drag.origY + (ev.clientY - drag.startY)), Math.max(64, vh - 80));
      setPositions((prev) => ({
        ...prev,
        [drag.id]: { x: nextX, y: nextY },
      }));
    };
    const handleUp = () => {
      dragRef.current = null;
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, []);

  if (memos.length === 0) return null;

  return (
    <div
      aria-label="全域桌面浮動便利貼"
      data-testid="floating-sticky-overlay"
      className="fixed inset-0 pointer-events-none z-40"
    >
      {memos.map((memo, index) => {
        const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
        const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
        const defaultX = vw >= 1024 ? 296 + (index % 3) * 28 : 16 + (index % 2) * 16;
        const defaultY =
          vw >= 1024
            ? Math.max(84, vh - 270 - (index % 3) * 32)
            : Math.max(72, vh - 320 - (index % 2) * 28);
        const pos = positions[memo.id] ?? { x: defaultX, y: defaultY };
        const clampedX = Math.min(Math.max(12, pos.x), Math.max(12, vw - 292));
        const clampedY = Math.min(Math.max(64, pos.y), Math.max(64, vh - 96));
        const minimized = Boolean(minimizedIds[memo.id]);

        return (
          <section
            key={memo.id}
            style={{ left: `${clampedX}px`, top: `${clampedY}px` }}
            className="pointer-events-auto fixed w-[276px] sm:w-[296px] rounded-2xl border border-amber-300/95 dark:border-amber-700/80 bg-amber-50/95 dark:bg-zinc-900/95 shadow-xl backdrop-blur-md overflow-hidden"
          >
            <div
              onPointerDown={(e) => {
                if ((e.target as HTMLElement).closest('button')) return;
                dragRef.current = {
                  id: memo.id,
                  startX: e.clientX,
                  startY: e.clientY,
                  origX: clampedX,
                  origY: clampedY,
                };
              }}
              title="按住拖曳移動位置"
              className="px-3 py-2 bg-amber-100/90 dark:bg-amber-950/60 border-b border-amber-200/90 dark:border-amber-800/60 flex items-center justify-between gap-2 cursor-grab active:cursor-grabbing select-none"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <GripHorizontal className="w-3.5 h-3.5 text-amber-700/70 dark:text-amber-400/80 shrink-0" />
                <StickyNote className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400 shrink-0" />
                <span className="text-xs font-semibold text-stone-900 dark:text-zinc-100 truncate">
                  {memo.title}
                </span>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    setMinimizedIds((prev) => ({ ...prev, [memo.id]: !prev[memo.id] }))
                  }
                  aria-label={minimized ? `展開便利貼「${memo.title}」` : `收合便利貼「${memo.title}」`}
                  className="p-1 rounded-md text-stone-600 dark:text-zinc-300 hover:bg-amber-200/70 dark:hover:bg-amber-900/50"
                >
                  {minimized ? <Maximize2 className="w-3 h-3" /> : <Minimize2 className="w-3 h-3" />}
                </button>
                <button
                  type="button"
                  onClick={() => onCloseFloating(memo.id)}
                  aria-label={`關閉浮動便利貼「${memo.title}」`}
                  title="收回浮動視窗（仍保留桌面釘選）"
                  className="p-1 rounded-md text-stone-600 dark:text-zinc-300 hover:bg-amber-200/70 dark:hover:bg-amber-900/50"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {!minimized && (
              <div className="p-3 space-y-2 max-h-[260px] overflow-y-auto">
                <p className="text-xs text-stone-800 dark:text-zinc-200 whitespace-pre-wrap break-words leading-relaxed">
                  {memo.content || '（無詳細內文）'}
                </p>

                {Array.isArray(memo.checklist) && memo.checklist.length > 0 && (
                  <ul className="space-y-1 pt-1.5 border-t border-amber-200/70 dark:border-amber-800/50">
                    {memo.checklist.map((item) => (
                      <li key={item.id}>
                        <label className="flex items-center gap-2 text-[11.5px] text-stone-700 dark:text-zinc-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={item.done}
                            onChange={() => onToggleChecklist(memo.id, item.id)}
                            className="h-3.5 w-3.5 rounded border-amber-400 text-teal-600"
                          />
                          <span className={item.done ? 'line-through text-stone-400' : ''}>
                            {item.text}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="pt-1.5 border-t border-amber-200/70 dark:border-amber-800/50 flex items-center justify-between gap-1.5">
                  <button
                    type="button"
                    onClick={() => onUnpinDesktop(memo.id)}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-stone-500 dark:text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                  >
                    <PinOff className="w-3 h-3" />
                    <span>取消釘選</span>
                  </button>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        const text = memo.content?.trim()
                          ? `${memo.title}\n${memo.content}`
                          : memo.title;
                        navigator.clipboard?.writeText(text).catch(() => {});
                        onCopyMemo(memo);
                      }}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-stone-700 dark:text-zinc-200 hover:bg-amber-200/60 dark:hover:bg-amber-900/40"
                    >
                      <Copy className="w-3 h-3" />
                      <span>複製</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onEditMemo(memo)}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium accent-text hover:bg-amber-200/60 dark:hover:bg-amber-900/40"
                    >
                      <Edit3 className="w-3 h-3" />
                      <span>編輯</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
};

interface DesktopStickyDockWidgetProps {
  memos: MemoItem[];
  floatingMemoIds: string[];
  onCopyMemo: (memo: MemoItem) => void;
  onToggleFloating: (id: string) => void;
  onUnpinDesktop: (id: string) => void;
  onOpenMemoInMemos: (memoId?: string) => void;
}

export const DesktopStickyDockWidget: React.FC<DesktopStickyDockWidgetProps> = ({
  memos,
  floatingMemoIds,
  onCopyMemo,
  onToggleFloating,
  onUnpinDesktop,
  onOpenMemoInMemos,
}) => {
  return (
    <section
      aria-label="桌面釘選便利貼"
      data-testid="today-desktop-sticky-board"
      className="rounded-2xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-3"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <StickyNote className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <h2 className="text-sm font-semibold text-stone-900 dark:text-zinc-100 truncate">
            桌面釘選便利貼 ({memos.length})
          </h2>
        </div>
        <button
          type="button"
          onClick={() => onOpenMemoInMemos()}
          className="inline-flex items-center gap-1 rounded-lg border border-stone-200 dark:border-zinc-700 px-2.5 py-1 text-[11px] font-medium text-stone-700 dark:text-zinc-200 hover:bg-stone-100 dark:hover:bg-zinc-800 shrink-0"
        >
          <Plus className="w-3 h-3" />
          <span>設定釘選</span>
        </button>
      </div>

      {memos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-stone-200 dark:border-zinc-800 bg-stone-50/70 dark:bg-zinc-950/50 p-3 text-xs text-stone-500 dark:text-zinc-400 leading-relaxed">
          可將「郵局時間」、「商家電話」等常用備忘錄釘選至此，打開首頁即可直接查看，不必逐篇搜尋。
        </div>
      ) : (
        <div className="space-y-2.5">
          {memos.map((memo) => (
            <StickyMemoCard
              key={memo.id}
              memo={memo}
              compact
              isFloating={floatingMemoIds.includes(memo.id)}
              onCopy={onCopyMemo}
              onToggleFloating={onToggleFloating}
              onUnpinDesktop={onUnpinDesktop}
              onEdit={() => onOpenMemoInMemos(memo.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
};
