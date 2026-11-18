import React, { useState } from 'react';
import { BellPlus, Trash2, X } from 'lucide-react';
import type { PriorityLevel, TaskItem, TaskReminderRule } from '../types/assistant';
import { addDaysToDateStr, inferSmartTags } from '../utils/smartEngine';
import {
  EXTENDED_REMINDER_PRESETS,
  formatReminderRuleLabel,
} from '../utils/reminderEngine';

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
  const [customReminders, setCustomReminders] = useState<TaskReminderRule[]>(
    initialTask?.customReminders || []
  );
  const [exactDateInput, setExactDateInput] = useState(initialTask?.dueDate || defaultDate);
  const [exactTimeInput, setExactTimeInput] = useState(initialTask?.startTime || '09:00');
  const [relAmountInput, setRelAmountInput] = useState('1');
  const [relUnitInput, setRelUnitInput] = useState<'minutes' | 'hours' | 'days'>('days');
  const [reminderFeedback, setReminderFeedback] = useState('');
  const [voiceReminder, setVoiceReminder] = useState<boolean>(
    initialTask?.voiceReminder ?? true
  );
  const [error, setError] = useState('');

  const addExactReminderRule = (targetDate: string, targetTime: string) => {
    if (!targetDate || !targetTime) {
      setReminderFeedback('請選擇要提醒的日期與時間');
      return;
    }
    const duplicate = customReminders.some(
      (r) => r.mode === 'exact' && r.date === targetDate && r.time === targetTime
    );
    if (duplicate) {
      setReminderFeedback(`已存在 ${targetDate} ${targetTime} 的提醒`);
      return;
    }
    setCustomReminders((prev) => [
      ...prev,
      {
        id: `rem-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        mode: 'exact',
        date: targetDate,
        time: targetTime,
      },
    ]);
    setReminderFeedback('');
  };

  const addRelativeReminderRule = (minutesBefore: number) => {
    if (!Number.isFinite(minutesBefore) || minutesBefore < 0) {
      setReminderFeedback('請輸入有效的提前提醒時間');
      return;
    }
    if (
      minutesBefore === reminderMinutes ||
      customReminders.some((r) => r.mode === 'relative' && r.minutesBefore === minutesBefore)
    ) {
      setReminderFeedback('此提前提醒時間已存在於排程中');
      return;
    }
    setCustomReminders((prev) => [
      ...prev,
      {
        id: `rem-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        mode: 'relative',
        minutesBefore,
      },
    ]);
    setReminderFeedback('');
  };

  const handleAddCustomRelative = () => {
    const amount = Number(relAmountInput);
    if (!Number.isFinite(amount) || amount <= 0) {
      setReminderFeedback('請輸入大於 0 的數字');
      return;
    }
    const multiplier = relUnitInput === 'days' ? 1440 : relUnitInput === 'hours' ? 60 : 1;
    addRelativeReminderRule(Math.round(amount * multiplier));
  };

  const prevDayStr = dueDate ? addDaysToDateStr(dueDate, -1) : '';

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
        customReminders: customReminders.length > 0 ? customReminders : undefined,
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
                onChange={(e) => {
                  const nextDate = e.target.value;
                  if (exactDateInput === dueDate && nextDate) {
                    setExactDateInput(nextDate);
                  }
                  setDueDate(nextDate);
                }}
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
                主要提醒時間
              </label>
              <select
                id="task-reminder-select"
                value={reminderMinutes}
                onChange={(e) => setReminderMinutes(Number(e.target.value))}
                className="w-full rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-950 px-3 py-2.5 text-sm text-stone-900 dark:text-zinc-100"
              >
                {EXTENDED_REMINDER_PRESETS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Multi-Day / Custom Date-Time Reminder Builder */}
          <div className="rounded-xl border border-stone-200 dark:border-zinc-800 bg-stone-50/80 dark:bg-zinc-950/70 p-3.5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-stone-800 dark:text-zinc-200 flex items-center gap-1.5">
                <BellPlus className="w-3.5 h-3.5 accent-text" />
                <span>額外多日／指定日期時間提醒</span>
              </span>
              <span className="text-[11px] font-mono text-stone-500 dark:text-zinc-400">
                可同時新增多組
              </span>
            </div>

            {dueDate && (
              <div className="flex flex-wrap items-center gap-1.5">
                {prevDayStr && (
                  <button
                    type="button"
                    onClick={() => addExactReminderRule(prevDayStr, '17:00')}
                    className="rounded-lg border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1 text-[11px] font-medium text-stone-700 dark:text-zinc-300 hover:bg-stone-100 dark:hover:bg-zinc-800"
                  >
                    + 前一天 ({prevDayStr.slice(5)}) 17:00
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => addExactReminderRule(dueDate, '07:00')}
                  className="rounded-lg border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1 text-[11px] font-medium text-stone-700 dark:text-zinc-300 hover:bg-stone-100 dark:hover:bg-zinc-800"
                >
                  + 當日 ({dueDate.slice(5)}) 07:00
                </button>
                <button
                  type="button"
                  onClick={() => addRelativeReminderRule(1440)}
                  className="rounded-lg border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1 text-[11px] font-medium text-stone-700 dark:text-zinc-300 hover:bg-stone-100 dark:hover:bg-zinc-800"
                >
                  + 1 天前
                </button>
                <button
                  type="button"
                  onClick={() => addRelativeReminderRule(2880)}
                  className="rounded-lg border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1 text-[11px] font-medium text-stone-700 dark:text-zinc-300 hover:bg-stone-100 dark:hover:bg-zinc-800"
                >
                  + 2 天前
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2 items-center">
              <input
                type="date"
                aria-label="指定提醒日期"
                value={exactDateInput}
                onChange={(e) => setExactDateInput(e.target.value)}
                className="rounded-lg border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-xs font-mono text-stone-900 dark:text-zinc-100"
              />
              <input
                type="time"
                aria-label="指定提醒時間"
                value={exactTimeInput}
                onChange={(e) => setExactTimeInput(e.target.value)}
                className="rounded-lg border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-xs font-mono text-stone-900 dark:text-zinc-100"
              />
              <button
                type="button"
                onClick={() => addExactReminderRule(exactDateInput, exactTimeInput)}
                className="rounded-lg border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-xs font-medium accent-text hover:bg-stone-100 dark:hover:bg-zinc-800 whitespace-nowrap min-h-[34px]"
              >
                加入指定時間
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-stone-500 dark:text-zinc-400">或自訂提前：</span>
              <input
                type="number"
                min={1}
                max={365}
                aria-label="自訂提前數值"
                value={relAmountInput}
                onChange={(e) => setRelAmountInput(e.target.value)}
                className="w-16 rounded-lg border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-xs font-mono text-stone-900 dark:text-zinc-100"
              />
              <select
                aria-label="自訂提前單位"
                value={relUnitInput}
                onChange={(e) => setRelUnitInput(e.target.value as 'minutes' | 'hours' | 'days')}
                className="rounded-lg border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-xs text-stone-900 dark:text-zinc-100"
              >
                <option value="minutes">分鐘前</option>
                <option value="hours">小時前</option>
                <option value="days">天前</option>
              </select>
              <button
                type="button"
                onClick={handleAddCustomRelative}
                className="rounded-lg border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1 text-xs font-medium text-stone-700 dark:text-zinc-300 hover:bg-stone-100 dark:hover:bg-zinc-800 min-h-[32px]"
              >
                加入提前提醒
              </button>
            </div>

            {reminderFeedback && (
              <p className="text-[11px] text-amber-700 dark:text-amber-400">{reminderFeedback}</p>
            )}

            {customReminders.length > 0 && (
              <ul className="space-y-1.5 pt-1 border-t border-stone-200/80 dark:border-zinc-800" data-testid="custom-reminders-list">
                {customReminders.map((rule) => {
                  const label = formatReminderRuleLabel(rule);
                  return (
                    <li
                      key={rule.id}
                      className="flex items-center justify-between gap-2 rounded-lg bg-white dark:bg-zinc-900 border border-stone-200/80 dark:border-zinc-800 px-2.5 py-1.5 text-xs"
                    >
                      <span className="font-mono text-stone-800 dark:text-zinc-200">
                        {rule.mode === 'exact' ? `指定時間：${label}` : label}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setCustomReminders((prev) => prev.filter((item) => item.id !== rule.id))
                        }
                        aria-label={`移除提醒 ${label}`}
                        className="text-stone-400 hover:text-rose-600 p-1 rounded"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
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
