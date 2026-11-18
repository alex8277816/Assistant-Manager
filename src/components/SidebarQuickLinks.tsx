import React, { useId, useMemo, useState } from 'react';
import { ExternalLink, Link2, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { QuickLinkItem } from '../types/assistant';
import { formatQuickLinkHost, validateAndNormalizeQuickLink } from '../utils/quickLinks';

interface SidebarQuickLinksProps {
  links: QuickLinkItem[];
  variant?: 'sidebar' | 'dialog';
  showFullUrl?: boolean;
  syncBanner?: React.ReactNode;
  onAddLink: (name: string, url: string) => void;
  onUpdateLink: (id: string, name: string, url: string) => void;
  onDeleteLink: (id: string) => void;
}

export const SidebarQuickLinks: React.FC<SidebarQuickLinksProps> = ({
  links,
  variant = 'sidebar',
  showFullUrl = variant === 'dialog',
  syncBanner,
  onAddLink,
  onUpdateLink,
  onDeleteLink,
}) => {
  const activeLinks = useMemo(
    () => links.filter((l) => !l.deleted),
    [links]
  );

  const nameInputId = useId();
  const urlInputId = useId();
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [error, setError] = useState('');

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setNameInput('');
    setUrlInput('');
    setError('');
  };

  const openAddForm = () => {
    setEditingId(null);
    setNameInput('');
    setUrlInput('');
    setError('');
    setFormOpen(true);
  };

  const openEditForm = (item: QuickLinkItem) => {
    setEditingId(item.id);
    setNameInput(item.name);
    setUrlInput(item.url);
    setError('');
    setFormOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = validateAndNormalizeQuickLink(nameInput, urlInput);
    if (!res.ok) {
      setError(res.error);
      return;
    }

    if (editingId) {
      onUpdateLink(editingId, res.name, res.url);
    } else {
      onAddLink(res.name, res.url);
    }
    closeForm();
  };

  const wrapperClass =
    variant === 'dialog'
      ? 'space-y-3'
      : 'px-3 pt-3.5 pb-3 border-t border-stone-200/80 dark:border-zinc-800 space-y-2.5';

  return (
    <div className={wrapperClass}>
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-semibold tracking-wide text-stone-600 dark:text-zinc-300 flex items-center gap-1.5">
          <Link2 className="w-3.5 h-3.5 accent-text shrink-0" />
          <span>常用連結</span>
          {activeLinks.length > 0 && (
            <span className="font-mono text-[11px] font-normal tabular-nums text-stone-400 dark:text-zinc-500">
              ({activeLinks.length})
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={formOpen && !editingId ? closeForm : openAddForm}
          aria-label="新增常用連結"
          className="inline-flex items-center gap-1 rounded-lg border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1 text-[11px] font-medium accent-text hover:bg-stone-100 dark:hover:bg-zinc-800 min-h-[28px] transition-colors whitespace-nowrap shrink-0"
        >
          {formOpen && !editingId ? (
            <>
              <X className="w-3 h-3" />
              <span>收合</span>
            </>
          ) : (
            <>
              <Plus className="w-3 h-3" />
              <span>新增</span>
            </>
          )}
        </button>
      </div>

      {formOpen && (
        <form
          onSubmit={handleSubmit}
          noValidate
          className="rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-950 p-3 space-y-2.5"
        >
          <div>
            <label htmlFor={nameInputId} className="block text-[11px] font-medium text-stone-600 dark:text-zinc-400 mb-1">
              連結名稱
            </label>
            <input
              id={nameInputId}
              type="text"
              value={nameInput}
              onChange={(e) => {
                setNameInput(e.target.value);
                if (error) setError('');
              }}
              placeholder="例如：公司 EIP、合約系統"
              className="w-full rounded-lg border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-xs text-stone-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div>
            <label htmlFor={urlInputId} className="block text-[11px] font-medium text-stone-600 dark:text-zinc-400 mb-1">
              系統網址
            </label>
            <input
              id={urlInputId}
              type="url"
              value={urlInput}
              onChange={(e) => {
                setUrlInput(e.target.value);
                if (error) setError('');
              }}
              placeholder="https://eip.company.com"
              className="w-full rounded-lg border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-xs font-mono text-stone-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          {error && <p className="text-[11px] text-rose-600 dark:text-rose-400">{error}</p>}
          <div className="flex items-center justify-end gap-1.5 pt-0.5">
            <button
              type="button"
              onClick={closeForm}
              className="rounded-lg border border-stone-200 dark:border-zinc-700 px-2.5 py-1 text-[11px] font-medium text-stone-600 dark:text-zinc-300 hover:bg-stone-100 dark:hover:bg-zinc-800 min-h-[30px]"
            >
              取消
            </button>
            <button
              type="submit"
              className="rounded-lg accent-bg px-3 py-1 text-[11px] font-medium min-h-[30px]"
            >
              {editingId ? '儲存變更' : '加入連結'}
            </button>
          </div>
        </form>
      )}

      {syncBanner}

      {activeLinks.length === 0 ? (
        !formOpen && (
          <p className="rounded-xl border border-dashed border-stone-200 dark:border-zinc-800 bg-stone-50/50 dark:bg-zinc-950/30 px-3 py-2.5 text-[11.5px] leading-relaxed text-stone-400 dark:text-zinc-500">
            可新增公司 EIP、合約系統等常用連結以便快速開啟。
          </p>
        )
      ) : (
        <ul className="space-y-2" data-testid="sidebar-quick-links">
          {activeLinks.map((link) => {
            const host = formatQuickLinkHost(link.url);
            return (
              <li
                key={link.id}
                className="rounded-xl border border-stone-200/85 dark:border-zinc-800 bg-stone-50/70 dark:bg-zinc-950/60 hover:border-stone-300 dark:hover:border-zinc-700 hover:bg-white dark:hover:bg-zinc-900 transition-colors p-2.5"
              >
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`${link.name}\n${link.url}`}
                  className="group/link flex items-start gap-2.5 w-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
                >
                  <span className="w-7 h-7 rounded-lg border border-stone-200/90 dark:border-zinc-700/80 bg-white dark:bg-zinc-900 flex items-center justify-center shrink-0 mt-0.5 text-stone-400 dark:text-zinc-500 group-hover/link:accent-text transition-colors">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-medium leading-snug text-stone-800 dark:text-zinc-100 group-hover/link:accent-text break-words whitespace-normal">
                      {link.name}
                    </span>
                    {showFullUrl && (
                      <span className="mt-1 block font-mono text-[11px] leading-snug text-stone-500 dark:text-zinc-400 break-all whitespace-normal">
                        {link.url}
                      </span>
                    )}
                  </span>
                </a>

                <div className="mt-2 pt-1.5 border-t border-stone-200/60 dark:border-zinc-800/80 flex items-center justify-between gap-2">
                  <span
                    className="flex-1 min-w-0 truncate font-mono text-[10.5px] text-stone-400 dark:text-zinc-500 pl-0.5"
                    title={link.url}
                  >
                    {host}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEditForm(link)}
                      aria-label={`編輯常用連結「${link.name}」`}
                      title="編輯名稱或網址"
                      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-stone-500 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-100 hover:bg-stone-200/70 dark:hover:bg-zinc-800 min-h-[26px] transition-colors"
                    >
                      <Pencil className="w-3 h-3" />
                      <span>編輯</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (editingId === link.id) closeForm();
                        onDeleteLink(link.id);
                      }}
                      aria-label={`刪除常用連結「${link.name}」`}
                      title="刪除常用連結"
                      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-stone-400 dark:text-zinc-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 min-h-[26px] transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>刪除</span>
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

