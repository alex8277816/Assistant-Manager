import React, { useState } from 'react';
import { Trash2, X } from 'lucide-react';
import type { PriorityLevel, TaskItem } from '../types/assistant';
import { inferSmartTags } from '../utils/smartEngine';

interface TaskModalProps {
  initialTask?: TaskItem | null;
  defaultDate: string;
  onSave: (draft: Omit<TaskItem, 'id' | 'version' | 'syncStatus' | 'createdAt' | 'updatedAt'>, existingId?: string) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
}

export const TaskModal: React.FC<TaskModalProps> = ({
  initialTask,
  defaultDate,
  onSave,
  onDelete,
  onClose,
}) => {
  const [title, setTitle] = useState(initialTask?.title || '');
  const [notes, setNotes] = useState(initialTask?.notes || '');
  const [dueDate, setDueDate] = useState(initialTask?.dueDate || defaultDate);
  const [startTime, setStartTime] = useState(initialTask?.startTime || '');
  const [endTime, setEndTime] = useState(initialTask?.endTime || '');
  const [priority, setPriority] = useState<PriorityLevel>(initialTask?.priority || 'medium');
  const [isMeeting, setIsMeeting] = useState(initialTask?.isMeeting || false);
  const [tagsInput, setTagsInput] = useState((initialTask?.tags || []).join(', '));
  const [reminderMinutes, setReminderMinutes] = useState<number>(
    initialTask?.reminderMinutes ?? 15
  );
  const [voiceReminder, setVoiceReminder] = useState<boolean>(
    initialTask?.voiceReminder ?? true
  );
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setError('請輸入任務或會議標題');
      return;
    }

    const explicitTags = tagsInput
      .split(/[,，\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const mergedTags = inferSmartTags(trimmed, notes, explicitTags);

    onSave(
      {
        title: trimmed,
        notes: notes.trim(),
        dueDate,
        startTime: startTime || undefined,
        endTime: endTime || undefined,
        isMeeting,
        priority,
        tags: mergedTags,
        completed: initialTask?.completed || false,
        reminderMinutes,
        voiceReminder,
      },
      initialTask?.id
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={initialTask ? '編輯任務與排程' : '新增任務與排程'}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4"
    >
      <div className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-stone-200 dark:border-zinc-800">
          <h2 className="text-lg font-semibold text-stone-900 dark:text-zinc-100">
            {initialTask ? '編輯排程與任務' : '新增排程或待辦'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="關閉編輯視窗"
            className="p-2 rounded-lg text-stone-500 hover:bg-stone-100 dark:hover:bg-zinc-800 min-h-[40px] min-w-[40px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label htmlFor="task-title-input" className="block text-xs font-medium text-stone-600 dark:text-zinc-400 mb-1.5">
              標題 *
            </label>
            <input
              id="task-title-input"
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (error) setError('');
              }}
              placeholder="例如：產品評審會議、完成季度財務報表"
              className="w-full rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-950 px-3.5 py-2.5 text-sm text-stone-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            {error && <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
          </div>

          <div>
            <label htmlFor="task-notes-input" className="block text-xs font-medium text-stone-600 dark:text-zinc-400 mb-1.5">
              備註細節
            </label>
            <textarea
              id="task-notes-input"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="補充待辦清單、會議連結或討論重點..."
              className="w-full rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-950 px-3.5 py-2 text-sm text-stone-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="task-date-input" className="block text-xs font-medium text-stone-600 dark:text-zinc-400 mb-1.5">
                日期
              </label>
              <input
                id="task-date-input"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-950 px-3 py-2 text-sm font-mono text-stone-900 dark:text-zinc-100"
              />
            </div>
            <div>
              <label htmlFor="task-start-input" className="block text-xs font-medium text-stone-600 dark:text-zinc-400 mb-1.5">
                開始時間
              </label>
              <input
                id="task-start-input"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-950 px-3 py-2 text-sm font-mono text-stone-900 dark:text-zinc-100"
              />
            </div>
            <div>
              <label htmlFor="task-end-input" className="block text-xs font-medium text-stone-600 dark:text-zinc-400 mb-1.5">
                結束時間
              </label>
              <input
                id="task-end-input"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-950 px-3 py-2 text-sm font-mono text-stone-900 dark:text-zinc-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="task-priority-select" className="block text-xs font-medium text-stone-600 dark:text-zinc-400 mb-1.5">
                優先順序
              </label>
              <select
                id="task-priority-select"
                value={priority}
                onChange={(e) => setPriority(e.target.value as PriorityLevel)}
                className="w-full rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-950 px-3 py-2.5 text-sm text-stone-900 dark:text-zinc-100"
              >
                <option value="urgent">緊急 (Urgent)</option>
                <option value="high">高優先 (High)</option>
                <option value="medium">中優先 (Medium)</option>
                <option value="low">低優先 (Low)</option>
              </select>
            </div>

            <div>
              <label htmlFor="task-reminder-select" className="block text-xs font-medium text-stone-600 dark:text-zinc-400 mb-1.5">
                自動提醒時間
              </label>
              <select
                id="task-reminder-select"
                value={reminderMinutes}
                onChange={(e) => setReminderMinutes(Number(e.target.value))}
                className="w-full rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-950 px-3 py-2.5 text-sm text-stone-900 dark:text-zinc-100"
              >
                <option value={-1}>關閉提醒</option>
                <option value={0}>準時提醒</option>
                <option value={5}>提前 5 分鐘</option>
                <option value={10}>提前 10 分鐘</option>
                <option value={15}>提前 15 分鐘</option>
                <option value={30}>提前 30 分鐘</option>
                <option value={60}>提前 1 小時</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="task-tags-input" className="block text-xs font-medium text-stone-600 dark:text-zinc-400 mb-1.5">
              智慧標籤（逗號分隔，系統亦會自動補齊語意標籤）
            </label>
            <input
              id="task-tags-input"
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="例如：工作, 會議, 開發"
              className="w-full rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-950 px-3.5 py-2 text-sm text-stone-900 dark:text-zinc-100"
            />
          </div>

          <div className="flex flex-wrap items-center gap-6 pt-1">
            <label className="inline-flex items-center gap-2 text-sm text-stone-700 dark:text-zinc-300 cursor-pointer min-h-[40px]">
              <input
                type="checkbox"
                checked={isMeeting}
                onChange={(e) => setIsMeeting(e.target.checked)}
                className="h-4 w-4 rounded border-stone-300 text-teal-600"
              />
              <span>標記為預定會議</span>
            </label>

            <label className="inline-flex items-center gap-2 text-sm text-stone-700 dark:text-zinc-300 cursor-pointer min-h-[40px]">
              <input
                type="checkbox"
                checked={voiceReminder}
                onChange={(e) => setVoiceReminder(e.target.checked)}
                className="h-4 w-4 rounded border-stone-300 text-teal-600"
              />
              <span>開啟語音播報提醒</span>
            </label>
          </div>

          <div className="flex items-center justify-between gap-3 pt-4 border-t border-stone-200 dark:border-zinc-800">
            {initialTask && onDelete ? (
              <button
                type="button"
                onClick={() => onDelete(initialTask.id)}
                className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-sm font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 min-h-[44px]"
              >
                <Trash2 className="w-4 h-4" />
                <span>刪除</span>
              </button>
            ) : (
              <div />
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-stone-200 dark:border-zinc-700 px-4 py-2.5 text-sm font-medium text-stone-700 dark:text-zinc-300 hover:bg-stone-100 dark:hover:bg-zinc-800 min-h-[44px]"
              >
                取消
              </button>
              <button
                type="submit"
                className="rounded-xl accent-bg px-5 py-2.5 text-sm font-medium min-h-[44px]"
              >
                儲存排程
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
