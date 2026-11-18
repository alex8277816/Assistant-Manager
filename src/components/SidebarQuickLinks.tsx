import React, { useMemo, useState } from 'react';
import { ExternalLink, Link2, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { QuickLinkItem } from '../types/assistant';
import { validateAndNormalizeQuickLink } from '../utils/quickLinks';

interface SidebarQuickLinksProps {
  links: QuickLinkItem[];
  onAddLink: (name: string, url: string) => void;
  onUpdateLink: (id: string, name: string, url: string) => void;
  onDeleteLink: (id: string) => void;
}

export const SidebarQuickLinks: React.FC<SidebarQuickLinksProps> = ({
  links,
  onAddLink,
  onUpdateLink,
  onDeleteLink,
}) => {
  const activeLinks = useMemo(
    () => links.filter((l) => !l.deleted),
    [links]
  );

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

  return (
    <div className="px-3 pt-3 pb-2 border-t border-stone-200/80 dark:border-zinc-800 space-y-2">
      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] font-semibold tracking-wide text-stone-500 dark:text-zinc-400 flex items-center gap-1.5">
          <Link2 className="w-3.5 h-3.5 accent-text" />
          <span>常用連結</span>
        </span>
        <button
          type="button"
          onClick={formOpen && !editingId ? closeForm : openAddForm}
          aria-label="新增常用連結"
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium accent-text hover:bg-stone-100 dark:hover:bg-zinc-800 min-h-[28px]"
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
          className="rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-950 p-2.5 space-y-2"
        >
          <div>
            <label htmlFor="quick-link-name" className="block text-[11px] font-medium text-stone-600 dark:text-zinc-400 mb-1">
              連結名稱
            </label>
            <input
              id="quick-link-name"
              type="text"
              value={nameInput}
              onChange={(e) => {
                setNameInput(e.target.value);
                if (error) setError('');
              }}
              placeholder="例如：公司 EIP、合約系統"
              className="w-full rounded-lg border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-xs text-stone-900 dark:text-zinc-100"
            />
          </div>
          <div>
            <label htmlFor="quick-link-url" className="block text-[11px] font-medium text-stone-600 dark:text-zinc-400 mb-1">
              系統網址
            </label>
            <input
              id="quick-link-url"
              type="url"
              value={urlInput}
              onChange={(e) => {
                setUrlInput(e.target.value);
                if (error) setError('');
              }}
              placeholder="https://eip.company.com"
              className="w-full rounded-lg border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-xs font-mono text-stone-900 dark:text-zinc-100"
            />
          </div>
          {error && <p className="text-[11px] text-rose-600 dark:text-rose-400">{error}</p>}
          <div className="flex items-center justify-end gap-1.5 pt-0.5">
            <button
              type="button"
              onClick={closeForm}
              className="rounded-lg border border-stone-200 dark:border-zinc-700 px-2.5 py-1 text-[11px] font-medium text-stone-600 dark:text-zinc-300 hover:bg-stone-100 dark:hover:bg-zinc-800 min-h-[28px]"
            >
              取消
            </button>
            <button
              type="submit"
              className="rounded-lg accent-bg px-2.5 py-1 text-[11px] font-medium min-h-[28px]"
            >
              {editingId ? '儲存變更' : '加入連結'}
            </button>
          </div>
        </form>
      )}

      {activeLinks.length === 0 ? (
        !formOpen && (
          <p className="px-2 py-1 text-[11px] leading-relaxed text-stone-400 dark:text-zinc-500">
            可新增公司 EIP、合約系統等常用連結以便快速開啟。
          </p>
        )
      ) : (
        <ul className="space-y-1" data-testid="sidebar-quick-links">
          {activeLinks.map((link) => (
            <li
              key={link.id}
              className="group flex items-center justify-between gap-1 rounded-xl px-2 py-1.5 hover:bg-stone-100 dark:hover:bg-zinc-800/80 transition-colors"
            >
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                title={link.url}
                className="flex-1 min-w-0 flex items-center gap-2 text-xs font-medium text-stone-700 dark:text-zinc-200 hover:accent-text"
              >
                <ExternalLink className="w-3.5 h-3.5 shrink-0 text-stone-400 dark:text-zinc-500" />
                <span className="truncate">{link.name}</span>
              </a>
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => openEditForm(link)}
                  aria-label={`編輯常用連結「${link.name}」`}
                  title="編輯名稱或網址"
                  className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-zinc-200 hover:bg-stone-200/70 dark:hover:bg-zinc-700 min-h-[28px] min-w-[28px] flex items-center justify-center"
                >
                  <Pencil className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (editingId === link.id) closeForm();
                    onDeleteLink(link.id);
                  }}
                  aria-label={`刪除常用連結「${link.name}」`}
                  title="刪除常用連結"
                  className="p-1.5 rounded-lg text-stone-400 hover:text-rose-600 hover:bg-stone-200/70 dark:hover:bg-zinc-700 min-h-[28px] min-w-[28px] flex items-center justify-center"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
