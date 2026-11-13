import React from 'react';
import { BellRing, Check, Clock, Square, Volume2, X } from 'lucide-react';
import type { ActiveReminderAlert } from '../types/assistant';

interface ReminderBannerProps {
  alerts: ActiveReminderAlert[];
  isSpeaking: boolean;
  onSpeak: (alert: ActiveReminderAlert) => void;
  onStopSpeaking: () => void;
  onSnooze: (taskId: string) => void;
  onComplete: (taskId: string) => void;
  onDismiss: (taskId: string) => void;
}

export const ReminderBanner: React.FC<ReminderBannerProps> = ({
  alerts,
  isSpeaking,
  onSpeak,
  onStopSpeaking,
  onSnooze,
  onComplete,
  onDismiss,
}) => {
  if (alerts.length === 0) return null;
  const active = alerts[0];

  return (
    <div
      role="alert"
      className="mx-4 mt-3 rounded-xl border border-amber-300 dark:border-amber-700/70 bg-amber-50 dark:bg-amber-950/50 px-4 py-3 text-stone-900 dark:text-zinc-100"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 p-2 rounded-lg bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 shrink-0">
            <BellRing className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
              {active.isMeeting ? '即將開始會議提醒' : '任務期限自動提醒'}
              {alerts.length > 1 ? ` · 另有 ${alerts.length - 1} 項提醒` : ''}
            </p>
            <p className="text-sm font-semibold mt-0.5">{active.title}</p>
            <p className="text-xs text-stone-600 dark:text-zinc-400 font-mono mt-0.5">
              {active.dueDate} {active.startTime || ''}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {isSpeaking ? (
            <button
              type="button"
              onClick={onStopSpeaking}
              className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-rose-700 transition-colors min-h-[38px] whitespace-nowrap"
            >
              <Square className="w-3 h-3 fill-current" />
              <span>停止播報</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onSpeak(active)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-xs font-medium hover:bg-stone-100 dark:hover:bg-zinc-800 transition-colors min-h-[38px] whitespace-nowrap"
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>語音播報</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => onSnooze(active.taskId)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-xs font-medium hover:bg-stone-100 dark:hover:bg-zinc-800 transition-colors min-h-[38px] whitespace-nowrap"
          >
            <Clock className="w-3.5 h-3.5" />
            <span>延後 10 分</span>
          </button>
          <button
            type="button"
            onClick={() => onComplete(active.taskId)}
            className="inline-flex items-center gap-1.5 rounded-lg accent-bg px-3 py-1.5 text-xs font-medium min-h-[38px] whitespace-nowrap"
          >
            <Check className="w-3.5 h-3.5" />
            <span>標記完成</span>
          </button>
          <button
            type="button"
            onClick={() => onDismiss(active.taskId)}
            aria-label={`關閉提醒 ${active.title}`}
            className="p-2 rounded-lg text-stone-500 hover:bg-stone-200/60 dark:hover:bg-zinc-800 min-h-[38px] min-w-[38px] flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
