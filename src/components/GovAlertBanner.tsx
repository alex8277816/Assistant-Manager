import React from 'react';
import { CalendarDays, CloudLightning, ExternalLink, Square, Volume2, X } from 'lucide-react';
import type { TyphoonRegionStatus } from '../types/assistant';
import { DGPA_PORTAL_URL, DGPA_TYPHOON_URL, type UpcomingHolidayAlert } from '../utils/govCalendar';

interface GovAlertBannerProps {
  typhoonRegions: TyphoonRegionStatus[];
  typhoonUpdatedAt: string;
  upcomingHoliday: UpcomingHolidayAlert | null;
  dismissedTyphoon: boolean;
  dismissedHoliday: boolean;
  isSpeaking: boolean;
  onSpeakTyphoon: () => void;
  onSpeakHoliday: () => void;
  onStopSpeaking: () => void;
  onDismissTyphoon: () => void;
  onDismissHoliday: () => void;
}

export const GovAlertBanner: React.FC<GovAlertBannerProps> = ({
  typhoonRegions,
  typhoonUpdatedAt,
  upcomingHoliday,
  dismissedTyphoon,
  dismissedHoliday,
  isSpeaking,
  onSpeakTyphoon,
  onSpeakHoliday,
  onStopSpeaking,
  onDismissTyphoon,
  onDismissHoliday,
}) => {
  const showTyphoon = !dismissedTyphoon && typhoonRegions.length > 0;
  const showHoliday = !dismissedHoliday && Boolean(upcomingHoliday);

  if (!showTyphoon && !showHoliday) return null;

  return (
    <div className="mx-4 lg:mx-8 mt-3 space-y-2">
      {showTyphoon && (
        <div
          role="alert"
          className="rounded-xl border border-rose-300 dark:border-rose-700/70 bg-rose-50 dark:bg-rose-950/50 px-4 py-3 text-stone-900 dark:text-zinc-100"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 p-2 rounded-lg bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300 shrink-0">
                <CloudLightning className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-rose-700 dark:text-rose-300">
                  行政院人事行政總處 · 天然災害停班停課通報 ({typhoonUpdatedAt || '即時'})
                </p>
                <p className="text-sm font-medium mt-0.5">
                  {typhoonRegions.map((r) => `${r.region}：${r.statusText}`).slice(0, 3).join(' ｜ ')}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <a
                href={DGPA_TYPHOON_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-xs font-medium hover:bg-stone-100 dark:hover:bg-zinc-800 min-h-[38px]"
              >
                <span>官方公告</span>
                <ExternalLink className="w-3 h-3" />
              </a>
              {isSpeaking ? (
                <button
                  type="button"
                  onClick={onStopSpeaking}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-rose-700 text-white px-3 py-1.5 text-xs font-medium hover:bg-rose-800 min-h-[38px]"
                >
                  <Square className="w-3 h-3 fill-current" />
                  <span>停止播報</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onSpeakTyphoon}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-rose-700 min-h-[38px]"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>語音播報</span>
                </button>
              )}
              <button
                type="button"
                onClick={onDismissTyphoon}
                aria-label="關閉停班停課提醒"
                className="p-2 rounded-lg text-stone-500 hover:bg-stone-200/60 dark:hover:bg-zinc-800 min-h-[38px] min-w-[38px] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {showHoliday && upcomingHoliday && (
        <div
          role="status"
          className="rounded-xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3 text-stone-900 dark:text-zinc-100"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 p-2 rounded-lg accent-soft-bg accent-text shrink-0">
                <CalendarDays className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-medium accent-text">
                  行政院人事行政總處國定假日提醒
                </p>
                <p className="text-sm font-medium mt-0.5">
                  {upcomingHoliday.daysUntil === 0
                    ? `今天 ${upcomingHoliday.holiday.date} 為「${upcomingHoliday.holiday.name}」（放假日）`
                    : `${upcomingHoliday.daysUntil} 天後（${upcomingHoliday.holiday.date}）為「${upcomingHoliday.holiday.name}」`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <a
                href={DGPA_PORTAL_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-stone-200 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium text-stone-700 dark:text-zinc-300 hover:bg-stone-100 dark:hover:bg-zinc-800 min-h-[38px]"
              >
                <span>人事總處官網</span>
                <ExternalLink className="w-3 h-3" />
              </a>
              {isSpeaking ? (
                <button
                  type="button"
                  onClick={onStopSpeaking}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-rose-700 min-h-[38px]"
                >
                  <Square className="w-3 h-3 fill-current" />
                  <span>停止播報</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onSpeakHoliday}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium hover:bg-stone-100 dark:hover:bg-zinc-800 min-h-[38px]"
                >
                  <Volume2 className="w-3.5 h-3.5 accent-text" />
                  <span>語音提醒</span>
                </button>
              )}
              <button
                type="button"
                onClick={onDismissHoliday}
                aria-label="關閉國定假日提醒"
                className="p-2 rounded-lg text-stone-500 hover:bg-stone-200/60 dark:hover:bg-zinc-800 min-h-[38px] min-w-[38px] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
