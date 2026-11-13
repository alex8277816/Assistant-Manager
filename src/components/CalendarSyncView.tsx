import React, { useMemo, useRef, useState } from 'react';
import {
  BellRing,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  CloudLightning,
  Download,
  ExternalLink,
  Plus,
  RefreshCw,
  Square,
  Trash2,
  Upload,
  Volume2,
} from 'lucide-react';
import type {
  GoogleCalendarEventItem,
  GovHolidayItem,
  GovSettings,
  GovSyncCache,
  TaskItem,
} from '../types/assistant';
import { exportTasksToICS, parseICSContent, type ImportedICSEvent } from '../utils/icsSync';
import {
  DGPA_PORTAL_URL,
  DGPA_TYPHOON_URL,
  GOV_OPENDATA_CALENDAR_URL,
  TAIWAN_CITIES,
} from '../utils/govCalendar';
import { GoogleSignInButton } from './GoogleSignInButton';
import { PWAInstallButton } from './PWAInstallButton';

interface CalendarSyncViewProps {
  tasks: TaskItem[];
  selectedDate: string;
  govSettings: GovSettings;
  govCache: GovSyncCache;
  govSyncing: boolean;
  isSpeaking: boolean;
  googleCalendarConnected: boolean;
  googleCalendarLoading: boolean;
  googleCalendarEvents: GoogleCalendarEventItem[];
  onSelectDate: (dateStr: string) => void;
  onEditTask: (task: TaskItem) => void;
  onRescheduleTask: (taskId: string, newDate: string, newTime?: string) => void;
  onCreateTaskOnDate: (dateStr: string) => void;
  onImportICSEvents: (events: ImportedICSEvent[]) => number;
  onSyncGovNow: () => Promise<void>;
  onUpdateGovSettings: (next: GovSettings) => void;
  onImportGovHolidaysToTasks: () => number;
  onSpeakGovStatus: () => void;
  onStopSpeaking: () => void;
  onTestFloatingNotification: () => void;
  onConnectGoogleCalendar: () => Promise<void>;
  onDisconnectGoogleCalendar: () => void;
  onLoadGoogleCalendarEvents: () => Promise<void>;
  onImportGoogleEventsToTasks: (events: GoogleCalendarEventItem[]) => number;
  onPushTasksToGoogleCalendar: (tasksToPush: TaskItem[]) => Promise<number>;
  onDeleteGoogleCalendarEvent: (eventId: string) => Promise<void>;
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

export const CalendarSyncView: React.FC<CalendarSyncViewProps> = ({
  tasks,
  selectedDate,
  govSettings,
  govCache,
  govSyncing,
  isSpeaking,
  googleCalendarConnected,
  googleCalendarLoading,
  googleCalendarEvents,
  onSelectDate,
  onEditTask,
  onRescheduleTask,
  onCreateTaskOnDate,
  onImportICSEvents,
  onSyncGovNow,
  onUpdateGovSettings,
  onImportGovHolidaysToTasks,
  onSpeakGovStatus,
  onStopSpeaking,
  onTestFloatingNotification,
  onConnectGoogleCalendar,
  onDisconnectGoogleCalendar,
  onLoadGoogleCalendarEvents,
  onImportGoogleEventsToTasks,
  onPushTasksToGoogleCalendar,
  onDeleteGoogleCalendarEvent,
}) => {
  const initialYear = Number(selectedDate.slice(0, 4));
  const initialMonth = Number(selectedDate.slice(5, 7)) - 1;
  const [viewYear, setViewYear] = useState(initialYear);
  const [viewMonth, setViewMonth] = useState(initialMonth);
  const [syncMessage, setSyncMessage] = useState('');
  const [rescheduleId, setRescheduleId] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [pendingGoogleConfirm, setPendingGoogleConfirm] = useState<
    | { type: 'push'; tasksToPush: TaskItem[] }
    | { type: 'delete'; event: GoogleCalendarEventItem }
    | null
  >(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeTasks = useMemo(() => tasks.filter((t) => !t.deleted), [tasks]);

  const tasksByDate = useMemo(() => {
    const map: Record<string, TaskItem[]> = {};
    for (const t of activeTasks) {
      if (!map[t.dueDate]) map[t.dueDate] = [];
      map[t.dueDate].push(t);
    }
    return map;
  }, [activeTasks]);

  const holidayByDate = useMemo(() => {
    const map: Record<string, GovHolidayItem> = {};
    for (const h of govCache.holidays) {
      map[h.date] = h;
    }
    return map;
  }, [govCache.holidays]);

  const selectedDayHoliday = holidayByDate[selectedDate] || null;

  const calendarCells = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: Array<{ dateStr: string; day: number; inMonth: boolean }> = [];

    for (let i = 0; i < firstDay; i++) {
      const prevDate = new Date(viewYear, viewMonth, -firstDay + i + 1);
      const ds = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-${String(prevDate.getDate()).padStart(2, '0')}`;
      cells.push({ dateStr: ds, day: prevDate.getDate(), inMonth: false });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ dateStr: ds, day: d, inMonth: true });
    }

    while (cells.length % 7 !== 0) {
      const idx = cells.length - (firstDay + daysInMonth) + 1;
      const nextDate = new Date(viewYear, viewMonth + 1, idx);
      const ds = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(nextDate.getDate()).padStart(2, '0')}`;
      cells.push({ dateStr: ds, day: nextDate.getDate(), inMonth: false });
    }

    return cells;
  }, [viewYear, viewMonth]);

  const selectedDayTasks = useMemo(() => {
    return [...(tasksByDate[selectedDate] || [])].sort((a, b) =>
      (a.startTime || '99:99').localeCompare(b.startTime || '99:99')
    );
  }, [tasksByDate, selectedDate]);

  const goMonth = (delta: number) => {
    const dt = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(dt.getFullYear());
    setViewMonth(dt.getMonth());
  };

  const handleExportICS = () => {
    const ics = exportTasksToICS(activeTasks);
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kairo-schedule-${selectedDate}.ics`;
    a.click();
    URL.revokeObjectURL(url);
    setSyncMessage(`已匯出 ${activeTasks.length} 項排程至標準 .ics 行事曆檔，可匯入 Apple / Google / Outlook 行事曆。`);
  };

  const handleImportICSFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const events = parseICSContent(text);
    if (events.length === 0) {
      setSyncMessage('在該 .ics 檔案中未偵測到有效的 VEVENT 行程事件。');
    } else {
      const added = onImportICSEvents(events);
      setSyncMessage(`成功同步匯入 ${added} 項外部行事曆事件，並已加密儲存。`);
    }
    e.target.value = '';
  };

  const handleImportSampleICS = () => {
    const sample = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      `DTSTART:${selectedDate.replace(/-/g, '')}T160000`,
      `DTEND:${selectedDate.replace(/-/g, '')}T170000`,
      'SUMMARY:跨平台行事曆同步會議',
      'DESCRIPTION:從外部 iCalendar 訂閱同步匯入的評審行程',
      'CATEGORIES:會議,工作',
      'BEGIN:VALARM',
      'TRIGGER:-PT15M',
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const events = parseICSContent(sample);
    const added = onImportICSEvents(events);
    setSyncMessage(`已從外部 iCalendar 訂閱同步 ${added} 項行程至 ${selectedDate}。`);
  };

  return (
    <div className="space-y-6">
      {/* Calendar Sync Toolbar */}
      <section className="rounded-2xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-stone-900 dark:text-zinc-100">
              行事曆整合與雙向同步
            </h1>
            <p className="text-sm text-stone-600 dark:text-zinc-400 mt-0.5">
              支援標準 RFC 5545 (.ics) 行事曆匯入與匯出，點選任一日期即可檢視或調整所有待辦事項。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept=".ics,text/calendar"
              onChange={handleImportICSFile}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-800 px-3.5 py-2.5 text-xs font-medium text-stone-800 dark:text-zinc-200 hover:bg-stone-100 dark:hover:bg-zinc-700 min-h-[44px] whitespace-nowrap"
            >
              <Upload className="w-4 h-4" />
              <span>匯入 .ics 檔</span>
            </button>
            <button
              type="button"
              onClick={handleImportSampleICS}
              className="inline-flex items-center gap-2 rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-800 px-3.5 py-2.5 text-xs font-medium text-stone-800 dark:text-zinc-200 hover:bg-stone-100 dark:hover:bg-zinc-700 min-h-[44px] whitespace-nowrap"
            >
              <CalendarIcon className="w-4 h-4 accent-text" />
              <span>同步外部訂閱示範</span>
            </button>
            <PWAInstallButton label="安裝至桌面 / 手機" />
            <button
              type="button"
              onClick={onTestFloatingNotification}
              className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-800 px-3.5 py-2.5 text-xs font-medium text-stone-800 dark:text-zinc-200 hover:bg-stone-100 dark:hover:bg-zinc-700 min-h-[44px] whitespace-nowrap"
            >
              <BellRing className="w-4 h-4 accent-text" />
              <span>測試桌面 / 手機提醒</span>
            </button>
            <button
              type="button"
              onClick={handleExportICS}
              className="inline-flex items-center gap-2 rounded-xl accent-bg px-4 py-2.5 text-xs font-medium min-h-[44px] whitespace-nowrap"
            >
              <Download className="w-4 h-4" />
              <span>匯出 .ics 行事曆</span>
            </button>
          </div>
        </div>

        {syncMessage && (
          <p className="mt-3 text-xs font-medium accent-text">{syncMessage}</p>
        )}
      </section>

      {/* Google Calendar Integration Section */}
      <section
        aria-label="Google 行事曆連線與同步"
        className="rounded-2xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-4"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-stone-900 dark:text-zinc-100 flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 accent-text" />
              <span>Google 行事曆雲端雙向連線</span>
            </h2>
            <p className="text-xs text-stone-600 dark:text-zinc-400 mt-1">
              {googleCalendarConnected
                ? '已取得 Google Calendar 授權（存取權杖僅存於記憶體），可讀取行程或將本機待辦同步至 Google 行事曆。'
                : '連結您的 Google 帳號，即可直接瀏覽 Google 行事曆行程並將排程寫入您的日曆。'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {!googleCalendarConnected ? (
              <GoogleSignInButton
                onClick={async () => {
                  await onConnectGoogleCalendar();
                  setSyncMessage('已連結 Google 行事曆！');
                }}
                disabled={googleCalendarLoading}
              />
            ) : (
              <>
                <button
                  type="button"
                  disabled={googleCalendarLoading}
                  onClick={async () => {
                    await onLoadGoogleCalendarEvents();
                    setSyncMessage('已從 Google 行事曆載入最新行程。');
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 dark:border-zinc-700 px-3.5 py-2 text-xs font-medium hover:bg-stone-100 dark:hover:bg-zinc-800 min-h-[40px] disabled:opacity-60"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${googleCalendarLoading ? 'animate-spin' : ''}`} />
                  <span>載入 Google 行程</span>
                </button>
                <button
                  type="button"
                  disabled={googleCalendarLoading || activeTasks.filter((t) => !t.completed).length === 0}
                  onClick={() => {
                    const targets = activeTasks.filter((t) => !t.completed).slice(0, 15);
                    setPendingGoogleConfirm({ type: 'push', tasksToPush: targets });
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl accent-bg px-3.5 py-2 text-xs font-medium min-h-[40px] disabled:opacity-50"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>同步排程至 Google 行事曆</span>
                </button>
                <button
                  type="button"
                  onClick={onDisconnectGoogleCalendar}
                  className="rounded-xl border border-stone-200 dark:border-zinc-700 px-3 py-2 text-xs text-stone-600 dark:text-zinc-300 hover:bg-stone-100 dark:hover:bg-zinc-800 min-h-[40px]"
                >
                  中斷連線
                </button>
              </>
            )}
          </div>
        </div>

        {googleCalendarConnected && googleCalendarEvents.length > 0 && (
          <div className="rounded-xl border border-stone-200 dark:border-zinc-800 bg-stone-50 dark:bg-zinc-950 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-stone-800 dark:text-zinc-200 tabular-nums">
                近期 Google 行事曆事件 ({googleCalendarEvents.length} 筆)
              </p>
              <button
                type="button"
                onClick={() => {
                  const imported = onImportGoogleEventsToTasks(googleCalendarEvents);
                  setSyncMessage(
                    imported > 0
                      ? `已從 Google 行事曆匯入 ${imported} 項新行程至 Kairo 排程。`
                      : '顯示的 Google 行事曆事件皆已存在於排程中。'
                  );
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-xs font-medium hover:bg-stone-100 dark:hover:bg-zinc-800 min-h-[34px]"
              >
                <Plus className="w-3.5 h-3.5 accent-text" />
                <span>匯入至 Kairo 待辦</span>
              </button>
            </div>
            <ul className="divide-y divide-stone-200/70 dark:divide-zinc-800 max-h-56 overflow-y-auto">
              {googleCalendarEvents.map((ev) => (
                <li key={ev.id} className="py-2 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <p className="font-medium text-stone-900 dark:text-zinc-100 truncate">
                      {ev.summary}
                    </p>
                    <p className="font-mono text-stone-500 dark:text-zinc-400 tabular-nums">
                      {ev.startDate} {ev.startTime ? `${ev.startTime}${ev.endTime ? `–${ev.endTime}` : ''}` : '全天'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {ev.htmlLink && (
                      <a
                        href={ev.htmlLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`在 Google 行事曆開啟 ${ev.summary}`}
                        className="p-1.5 rounded-lg text-stone-500 hover:bg-stone-200/60 dark:hover:bg-zinc-800"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => setPendingGoogleConfirm({ type: 'delete', event: ev })}
                      aria-label={`從 Google 行事曆刪除 ${ev.summary}`}
                      className="p-1.5 rounded-lg text-stone-400 hover:text-rose-600 hover:bg-stone-200/60 dark:hover:bg-zinc-800"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* DGPA National Holidays & Typhoon Suspension Integration */}
      <section
        aria-label="行政院人事行事曆與颱風假連動"
        className="rounded-2xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-4"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-stone-900 dark:text-zinc-100 flex items-center gap-2">
              <CloudLightning className="w-4 h-4 accent-text" />
              <span>行政院人事行政總處 · 國定假日與天然災害停班停課</span>
            </h2>
            <p className="text-xs text-stone-600 dark:text-zinc-400 mt-1">
              直接串接政府行政機關辦公日曆表與天然災害停班停課即時查詢，離線時自動保留最新快取。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <select
              aria-label="選擇關注縣市"
              value={govSettings.monitoredCity}
              onChange={(e) =>
                onUpdateGovSettings({ ...govSettings, monitoredCity: e.target.value })
              }
              className="rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-950 px-3 py-2 text-xs text-stone-800 dark:text-zinc-200 min-h-[40px]"
            >
              {TAIWAN_CITIES.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={govSyncing}
              onClick={async () => {
                await onSyncGovNow();
                setSyncMessage('已同步最新行政院人事行政總處國定假日與天然災害停班停課資訊。');
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 dark:border-zinc-700 px-3.5 py-2 text-xs font-medium hover:bg-stone-100 dark:hover:bg-zinc-800 min-h-[40px] disabled:opacity-60 whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${govSyncing ? 'animate-spin' : ''}`} />
              <span>{govSyncing ? '同步中...' : '立即同步政府公告'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                const count = onImportGovHolidaysToTasks();
                setSyncMessage(
                  count > 0
                    ? `已將 ${count} 項尚未建立的國定假日匯入每日排程與自動提醒。`
                    : '本年度國定假日皆已存在於您的排程中。'
                );
              }}
              className="inline-flex items-center gap-1.5 rounded-xl accent-bg px-3.5 py-2 text-xs font-medium min-h-[40px] whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>匯入國定假日至排程</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          <div className="rounded-xl border border-stone-200 dark:border-zinc-800 bg-stone-50 dark:bg-zinc-950 p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-stone-800 dark:text-zinc-200">
                天然災害停班停課即時狀態 ({govSettings.monitoredCity})
              </span>
              {isSpeaking ? (
                <button
                  type="button"
                  onClick={onStopSpeaking}
                  className="inline-flex items-center gap-1 text-xs font-medium text-rose-600 dark:text-rose-400 hover:underline min-h-[32px]"
                >
                  <Square className="w-3 h-3 fill-current" />
                  <span>停止播報</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onSpeakGovStatus}
                  className="inline-flex items-center gap-1 text-xs font-medium accent-text hover:underline min-h-[32px]"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>語音播報</span>
                </button>
              )}
            </div>
            <p
              className={`text-sm font-medium ${
                govCache.typhoonReport?.hasAlert
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-stone-700 dark:text-zinc-300'
              }`}
            >
              {govCache.typhoonReport?.summary || '尚未檢查，點擊「立即同步政府公告」即可即時查詢。'}
            </p>
            <p className="text-[11px] font-mono text-stone-500 dark:text-zinc-400">
              {govCache.typhoonReport?.updatedAtText
                ? `人事總處更新：${govCache.typhoonReport.updatedAtText}`
                : '資料來源：行政院人事行政總處 nds.html'}
            </p>
          </div>

          <div className="rounded-xl border border-stone-200 dark:border-zinc-800 bg-stone-50 dark:bg-zinc-950 p-4 space-y-2">
            <p className="text-xs font-semibold text-stone-800 dark:text-zinc-200">
              政府官方網站與開放資料連結
            </p>
            <p className="text-xs text-stone-600 dark:text-zinc-400 tabular-nums">
              已同步 {govCache.year} 年政府辦公日曆表 · 共 {govCache.holidays.length} 筆假日／補班紀錄
            </p>
            <div className="flex flex-wrap items-center gap-4 pt-1 text-xs">
              <a
                href={DGPA_PORTAL_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 accent-text hover:underline font-medium"
              >
                <span>行政院人事行政總處</span>
                <ExternalLink className="w-3 h-3" />
              </a>
              <a
                href={DGPA_TYPHOON_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 accent-text hover:underline font-medium"
              >
                <span>天然災害停班停課查詢</span>
                <ExternalLink className="w-3 h-3" />
              </a>
              <a
                href={GOV_OPENDATA_CALENDAR_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 accent-text hover:underline font-medium"
              >
                <span>政府資料開放平臺</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-6 items-start">
        {/* Month Grid */}
        <section
          aria-label="月曆視圖"
          className="rounded-2xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold font-mono text-stone-900 dark:text-zinc-100 tabular-nums">
              {viewYear} 年 {String(viewMonth + 1).padStart(2, '0')} 月
            </h2>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => goMonth(-1)}
                aria-label="上個月"
                className="p-2 rounded-lg border border-stone-200 dark:border-zinc-700 hover:bg-stone-100 dark:hover:bg-zinc-800 min-h-[40px] min-w-[40px] flex items-center justify-center"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => goMonth(1)}
                aria-label="下個月"
                className="p-2 rounded-lg border border-stone-200 dark:border-zinc-700 hover:bg-stone-100 dark:hover:bg-zinc-800 min-h-[40px] min-w-[40px] flex items-center justify-center"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-stone-500 dark:text-zinc-400 mb-2">
            {WEEKDAYS.map((w) => (
              <div key={w} className="py-1">
                {w}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {calendarCells.map((cell) => {
              const dayItems = tasksByDate[cell.dateStr] || [];
              const holiday = holidayByDate[cell.dateStr];
              const pendingCount = dayItems.filter((t) => !t.completed).length;
              const isSelected = cell.dateStr === selectedDate;

              return (
                <button
                  key={cell.dateStr}
                  type="button"
                  onClick={() => onSelectDate(cell.dateStr)}
                  aria-label={`${cell.dateStr}${holiday ? ` ${holiday.name}` : ''}，${dayItems.length} 項排程`}
                  aria-pressed={isSelected}
                  className={`min-h-[68px] p-1.5 rounded-xl border text-left flex flex-col justify-between transition-colors ${
                    isSelected
                      ? 'accent-border accent-soft-bg'
                      : 'border-stone-100 dark:border-zinc-800/70 hover:bg-stone-50 dark:hover:bg-zinc-800/50'
                  } ${!cell.inMonth ? 'opacity-45' : ''}`}
                >
                  <div className="flex items-center justify-between gap-1 w-full">
                    <span
                      className={`text-xs font-mono font-medium tabular-nums ${
                        holiday?.isHoliday
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-stone-800 dark:text-zinc-200'
                      }`}
                    >
                      {cell.day}
                    </span>
                    {holiday && (
                      <span
                        className={`text-[10px] truncate max-w-[54px] ${
                          holiday.isMakeUpWorkday
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {holiday.name}
                      </span>
                    )}
                  </div>
                  {dayItems.length > 0 && (
                    <span className="text-[11px] font-mono tabular-nums text-stone-600 dark:text-zinc-400 truncate">
                      {pendingCount > 0 ? `${pendingCount} 待辦` : `${dayItems.length} 已完成`}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* Selected Day Agenda & Reschedule Panel */}
        <section
          aria-label="選定日期議程"
          className="rounded-2xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5"
        >
          <div className="flex items-center justify-between pb-3 border-b border-stone-200 dark:border-zinc-800">
            <div>
              <h2 className="text-base font-semibold font-mono text-stone-900 dark:text-zinc-100 tabular-nums">
                {selectedDate}
                {selectedDayHoliday ? ` · ${selectedDayHoliday.name}` : ''}
              </h2>
              <p className="text-xs text-stone-500 dark:text-zinc-400 mt-0.5 tabular-nums">
                共 {selectedDayTasks.length} 項待辦與會議
                {selectedDayHoliday
                  ? selectedDayHoliday.isHoliday
                    ? ' · 政府公告放假日'
                    : ' · 補行上班日'
                  : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onCreateTaskOnDate(selectedDate)}
              className="inline-flex items-center gap-1.5 rounded-xl accent-bg px-3.5 py-2 text-xs font-medium min-h-[40px] whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>新增至此日</span>
            </button>
          </div>

          {selectedDayTasks.length === 0 ? (
            <p className="py-8 text-center text-xs text-stone-500 dark:text-zinc-400">
              此日期尚未安排行程，點擊「新增至此日」即可建立。
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-stone-100 dark:divide-zinc-800">
              {selectedDayTasks.map((task) => {
                const isRescheduling = rescheduleId === task.id;
                return (
                  <li key={task.id} className="py-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p
                          className={`text-sm font-medium ${
                            task.completed
                              ? 'line-through text-stone-400 dark:text-zinc-500'
                              : 'text-stone-900 dark:text-zinc-100'
                          }`}
                        >
                          {task.title}
                        </p>
                        <p className="text-xs text-stone-500 dark:text-zinc-400 mt-0.5 font-mono tabular-nums">
                          {task.startTime || '全天'} · {task.tags.join(' / ')}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            if (isRescheduling) {
                              setRescheduleId(null);
                            } else {
                              setRescheduleId(task.id);
                              setRescheduleDate(task.dueDate);
                              setRescheduleTime(task.startTime || '');
                            }
                          }}
                          className="rounded-lg border border-stone-200 dark:border-zinc-700 px-2.5 py-1.5 text-xs text-stone-700 dark:text-zinc-300 hover:bg-stone-100 dark:hover:bg-zinc-800 min-h-[36px]"
                        >
                          改期
                        </button>
                        <button
                          type="button"
                          onClick={() => onEditTask(task)}
                          className="rounded-lg border border-stone-200 dark:border-zinc-700 px-2.5 py-1.5 text-xs text-stone-700 dark:text-zinc-300 hover:bg-stone-100 dark:hover:bg-zinc-800 min-h-[36px]"
                        >
                          編輯
                        </button>
                      </div>
                    </div>

                    {isRescheduling && (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <input
                          type="date"
                          aria-label={`調整「${task.title}」日期`}
                          value={rescheduleDate}
                          onChange={(e) => setRescheduleDate(e.target.value)}
                          className="rounded-lg border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-950 px-2.5 py-1.5 text-xs font-mono"
                        />
                        <input
                          type="time"
                          aria-label={`調整「${task.title}」時間`}
                          value={rescheduleTime}
                          onChange={(e) => setRescheduleTime(e.target.value)}
                          className="rounded-lg border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-950 px-2.5 py-1.5 text-xs font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (rescheduleDate) {
                              onRescheduleTask(task.id, rescheduleDate, rescheduleTime || undefined);
                              setRescheduleId(null);
                            }
                          }}
                          className="rounded-lg accent-bg px-3 py-1.5 text-xs font-medium min-h-[36px]"
                        >
                          套用調整
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {/* Mandatory User Confirmation Dialog for Google Calendar Mutations */}
      {pendingGoogleConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="確認變更 Google 行事曆"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
        >
          <div className="w-full max-w-md rounded-2xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-xl space-y-4">
            <h3 className="text-base font-semibold text-stone-900 dark:text-zinc-100">
              {pendingGoogleConfirm.type === 'push'
                ? `確認同步 ${pendingGoogleConfirm.tasksToPush.length} 項排程至 Google 行事曆？`
                : `確認從 Google 行事曆刪除「${pendingGoogleConfirm.event.summary}」？`}
            </h3>
            {pendingGoogleConfirm.type === 'push' ? (
              <div className="space-y-2 text-xs text-stone-600 dark:text-zinc-300">
                <p>系統將在您的 Google 主要行事曆新增或更新以下項目：</p>
                <ul className="max-h-40 overflow-y-auto rounded-xl border border-stone-200 dark:border-zinc-800 bg-stone-50 dark:bg-zinc-950 p-3 space-y-1 font-mono">
                  {pendingGoogleConfirm.tasksToPush.map((t) => (
                    <li key={t.id} className="truncate">
                      • {t.dueDate} {t.startTime || '全天'} {t.title}
                      {t.googleEventId ? ' (更新)' : ' (新增)'}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-xs text-stone-600 dark:text-zinc-300">
                此操作將永久移除 Google 行事曆中 {pendingGoogleConfirm.event.startDate} 的「
                {pendingGoogleConfirm.event.summary}」事件且無法復原。
              </p>
            )}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPendingGoogleConfirm(null)}
                className="rounded-xl border border-stone-200 dark:border-zinc-700 px-4 py-2 text-xs font-medium min-h-[40px]"
              >
                取消
              </button>
              <button
                type="button"
                disabled={googleCalendarLoading}
                onClick={async () => {
                  const action = pendingGoogleConfirm;
                  setPendingGoogleConfirm(null);
                  if (action.type === 'push') {
                    const count = await onPushTasksToGoogleCalendar(action.tasksToPush);
                    setSyncMessage(`已確認並成功同步 ${count} 項排程至 Google 行事曆。`);
                  } else {
                    await onDeleteGoogleCalendarEvent(action.event.id);
                    setSyncMessage(`已從 Google 行事曆刪除「${action.event.summary}」。`);
                  }
                }}
                className={`rounded-xl px-4 py-2 text-xs font-medium text-white min-h-[40px] ${
                  pendingGoogleConfirm.type === 'delete'
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'accent-bg'
                }`}
              >
                {pendingGoogleConfirm.type === 'delete' ? '確認刪除' : '確認同步至 Google'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
