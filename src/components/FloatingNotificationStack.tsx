import React from 'react';
import { BellRing, Calendar, CloudLightning, Square, Volume2, X } from 'lucide-react';
import type { FloatingNotificationItem } from '../types/assistant';

interface FloatingNotificationStackProps {
  notifications: FloatingNotificationItem[];
  isSpeaking: boolean;
  onSpeak: (text: string, label: string) => void;
  onStopSpeaking: () => void;
  onDismiss: (id: string) => void;
}

const KIND_LABEL: Record<FloatingNotificationItem['kind'], string> = {
  todo: '今日待辦自動提醒',
  holiday: '國定假日提醒',
  typhoon: '天然災害停班停課警報',
  meeting: '會議即時提醒',
  calendar: '行事曆同步通知',
};

export const FloatingNotificationStack: React.FC<FloatingNotificationStackProps> = ({
  notifications,
  isSpeaking,
  onSpeak,
  onStopSpeaking,
  onDismiss,
}) => {
  if (notifications.length === 0) return null;

  return (
    <aside
      aria-label="即時提醒通知"
      data-testid="floating-notification-stack"
      className="fixed z-50 top-2 left-3 right-3 md:top-auto md:left-auto md:bottom-5 md:right-5 md:w-96 space-y-2.5 pointer-events-none"
    >
      {notifications.slice(0, 3).map((item) => {
        const isDanger = item.kind === 'typhoon';
        const Icon =
          item.kind === 'typhoon'
            ? CloudLightning
            : item.kind === 'holiday' || item.kind === 'calendar'
              ? Calendar
              : BellRing;

        return (
          <div
            key={item.id}
            role={isDanger ? 'alert' : 'status'}
            className={`pointer-events-auto rounded-2xl border shadow-lg backdrop-blur-md p-3.5 transition-all ${
              isDanger
                ? 'border-rose-300 dark:border-rose-700/80 bg-rose-50/95 dark:bg-rose-950/95 text-stone-900 dark:text-zinc-100'
                : 'border-stone-200 dark:border-zinc-700 bg-white/95 dark:bg-zinc-900/95 text-stone-900 dark:text-zinc-100'
            }`}
          >
            <div className="flex items-start justify-between gap-2.5">
              <div className="flex items-start gap-2.5 min-w-0">
                <div
                  className={`mt-0.5 p-2 rounded-xl shrink-0 ${
                    isDanger
                      ? 'bg-rose-100 dark:bg-rose-900/70 text-rose-600 dark:text-rose-300'
                      : 'accent-soft-bg accent-text'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p
                    className={`text-[11px] font-semibold ${
                      isDanger ? 'text-rose-700 dark:text-rose-300' : 'accent-text'
                    }`}
                  >
                    {KIND_LABEL[item.kind]} ·{' '}
                    <span className="font-mono tabular-nums">
                      {new Date(item.timestamp).toLocaleTimeString('zh-TW', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </p>
                  <p className="text-sm font-semibold truncate mt-0.5">{item.title}</p>
                  <p className="text-xs text-stone-600 dark:text-zinc-300 mt-0.5 line-clamp-2">
                    {item.body}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onDismiss(item.id)}
                aria-label={`關閉通知 ${item.title}`}
                className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-zinc-200 hover:bg-stone-100 dark:hover:bg-zinc-800 min-h-[34px] min-w-[34px] flex items-center justify-center shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {item.voiceText && (
              <div className="mt-2.5 pt-2 border-t border-stone-200/70 dark:border-zinc-800 flex items-center justify-end gap-2">
                {isSpeaking ? (
                  <button
                    type="button"
                    onClick={onStopSpeaking}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-rose-700 min-h-[34px]"
                  >
                    <Square className="w-3 h-3 fill-current" />
                    <span>停止語音</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSpeak(item.voiceText!, item.title)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium hover:bg-stone-100 dark:hover:bg-zinc-800 min-h-[34px]"
                  >
                    <Volume2 className="w-3.5 h-3.5 accent-text" />
                    <span>語音朗讀</span>
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </aside>
  );
};
