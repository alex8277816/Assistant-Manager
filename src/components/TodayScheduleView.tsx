import React, { useMemo, useState } from 'react';
import {
  BellRing,
  CheckCircle2,
  Circle,
  Edit3,
  Mic,
  MicOff,
  Play,
  Plus,
  Search,
  Square,
  Volume2,
} from 'lucide-react';
import type {
  GovSettings,
  GovSyncCache,
  SortMode,
  TaskItem,
} from '../types/assistant';
import {
  addDaysToDateStr,
  computePriorityScore,
  parseQuickTaskInput,
  sortTasks,
} from '../utils/smartEngine';
import { getUpcomingHolidays } from '../utils/govCalendar';
import { isSpeechRecognitionSupported, startVoiceDictation } from '../services/voiceService';
import { TodayAnalyticsCard } from './TodayAnalyticsCard';

interface TodayScheduleViewProps {
  tasks: TaskItem[];
  selectedDate: string;
  govSettings: GovSettings;
  govCache: GovSyncCache;
  isSpeaking: boolean;
  onSelectDate: (dateStr: string) => void;
  onQuickAddTask: (raw: string, baseDate: string) => void;
  onToggleTask: (id: string) => void;
  onEditTask: (task: TaskItem) => void;
  onSpeakTask: (task: TaskItem) => void;
  onSpeakBriefing: () => void;
  onStopSpeaking: () => void;
  onTriggerTodayAutoReminder: () => void;
  onOpenNewTaskModal: () => void;
  onJumpToPomodoro: (taskId: string) => void;
  onSyncGovNow: () => void;
  onSpeakGovStatus: () => void;
}

const PRIORITY_LABEL: Record<TaskItem['priority'], string> = {
  urgent: '緊急',
  high: '高優先',
  medium: '中優先',
  low: '低優先',
};

const PRIORITY_TEXT_CLASS: Record<TaskItem['priority'], string> = {
  urgent: 'text-rose-600 dark:text-rose-400 font-semibold',
  high: 'text-amber-600 dark:text-amber-400 font-medium',
  medium: 'text-stone-600 dark:text-zinc-400',
  low: 'text-stone-500 dark:text-zinc-500',
};

const WEEKDAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'];

export const TodayScheduleView: React.FC<TodayScheduleViewProps> = ({
  tasks,
  selectedDate,
  govSettings,
  govCache,
  isSpeaking,
  onSelectDate,
  onQuickAddTask,
  onToggleTask,
  onEditTask,
  onSpeakTask,
  onSpeakBriefing,
  onStopSpeaking,
  onTriggerTodayAutoReminder,
  onOpenNewTaskModal,
  onJumpToPomodoro,
  onSyncGovNow,
  onSpeakGovStatus,
}) => {
  const [quickInput, setQuickInput] = useState('');
  const [quickError, setQuickError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'meetings' | 'done'>('all');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [sortMode, setSortMode] = useState<SortMode>('smart');
  const [viewMode, setViewMode] = useState<'priority' | 'timeline'>('priority');
  const [listening, setListening] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState('');

  const nowMs = Date.now();

  const dateStrip = useMemo(() => {
    const items: Array<{ dateStr: string; weekday: string; dayNum: string }> = [];
    for (let offset = -1; offset <= 5; offset++) {
      const ds = addDaysToDateStr(selectedDate, offset);
      const [y, m, d] = ds.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      items.push({
        dateStr: ds,
        weekday: WEEKDAY_NAMES[dt.getDay()],
        dayNum: String(d).padStart(2, '0'),
      });
    }
    return items;
  }, [selectedDate]);

  const activeTasks = useMemo(
    () => tasks.filter((t) => !t.deleted),
    [tasks]
  );

  const dayTasks = useMemo(
    () => activeTasks.filter((t) => t.dueDate === selectedDate),
    [activeTasks, selectedDate]
  );

  const availableTags = useMemo(() => {
    const set = new Set<string>();
    activeTasks.forEach((t) => t.tags.forEach((tag) => set.add(tag)));
    return Array.from(set);
  }, [activeTasks]);

  const filteredTasks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = dayTasks.filter((t) => {
      if (statusFilter === 'active' && t.completed) return false;
      if (statusFilter === 'done' && !t.completed) return false;
      if (statusFilter === 'meetings' && !t.isMeeting) return false;
      if (tagFilter !== 'all' && !t.tags.includes(tagFilter)) return false;
      if (q) {
        const hay = `${t.title} ${t.notes} ${t.tags.join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const effectiveSort: SortMode = viewMode === 'timeline' ? 'time' : sortMode;
    return sortTasks(list, effectiveSort, nowMs);
  }, [dayTasks, statusFilter, tagFilter, searchQuery, sortMode, viewMode, nowMs]);

  const completedCount = dayTasks.filter((t) => t.completed).length;
  const totalCount = dayTasks.length;
  const meetingCount = dayTasks.filter((t) => t.isMeeting && !t.completed).length;
  const completionPct = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

  const quickPreview = useMemo(() => {
    if (!quickInput.trim()) return null;
    return parseQuickTaskInput(quickInput, selectedDate);
  }, [quickInput, selectedDate]);

  const handleQuickSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickInput.trim()) {
      setQuickError('請輸入任務內容，例如：明天 14:30 客戶會議 !高 #工作');
      return;
    }
    onQuickAddTask(quickInput.trim(), selectedDate);
    setQuickInput('');
    setQuickError('');
  };

  const handleVoiceDictate = () => {
    if (!isSpeechRecognitionSupported()) {
      setVoiceNotice('此瀏覽器未提供麥克風語音轉文字，您可以直接於上方輸入框鍵入排程。');
      return;
    }
    setVoiceNotice('');
    setListening(true);
    startVoiceDictation(
      'zh-TW',
      (transcript) => {
        setQuickInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
      },
      (err) => setVoiceNotice(err),
      () => setListening(false)
    );
  };

  const nextUpcomingTask = useMemo(() => {
    return sortTasks(
      activeTasks.filter((t) => !t.completed && t.startTime),
      'time',
      nowMs
    )[0];
  }, [activeTasks, nowMs]);

  const ringRadius = 20;
  const ringCirc = 2 * Math.PI * ringRadius;
  const ringOffset = ringCirc - (completionPct / 100) * ringCirc;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6 items-start">
      <div className="space-y-6 min-w-0">
        {/* Daily KPI & Progress Summary Row */}
        <section
          aria-label="今日進度摘要"
          className="rounded-2xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="relative w-14 h-14 flex items-center justify-center shrink-0">
                <svg className="w-14 h-14 -rotate-90" viewBox="0 0 48 48" aria-hidden="true">
                  <circle
                    cx="24"
                    cy="24"
                    r={ringRadius}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="4"
                    className="text-stone-200 dark:text-zinc-800"
                  />
                  <circle
                    cx="24"
                    cy="24"
                    r={ringRadius}
                    fill="none"
                    stroke="var(--accent-600)"
                    strokeWidth="4"
                    strokeDasharray={ringCirc}
                    strokeDashoffset={ringOffset}
                    strokeLinecap="round"
                  />
                </svg>
                <span className="absolute text-xs font-mono font-semibold text-stone-900 dark:text-zinc-100 tabular-nums">
                  {completionPct}%
                </span>
              </div>
              <div>
                <h1 className="text-xl font-semibold text-stone-900 dark:text-zinc-100">
                  每日排程與智慧清單
                </h1>
                <p className="text-sm text-stone-600 dark:text-zinc-400 mt-0.5 tabular-nums">
                  {selectedDate} · 待完成 {totalCount - completedCount} 項 · 預定會議 {meetingCount} 場 · 已完成 {completedCount}/{totalCount}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onTriggerTodayAutoReminder}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-800/70 px-3.5 py-2.5 text-xs font-medium text-stone-800 dark:text-zinc-200 hover:bg-stone-100 dark:hover:bg-zinc-800 transition-colors min-h-[44px] whitespace-nowrap"
              >
                <BellRing className="w-4 h-4 accent-text" />
                <span>今日待辦提醒</span>
              </button>
              {isSpeaking ? (
                <button
                  type="button"
                  onClick={onStopSpeaking}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 text-white px-4 py-2.5 text-xs font-medium hover:bg-rose-700 transition-colors min-h-[44px] whitespace-nowrap"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>停止語音播報</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onSpeakBriefing}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-800/70 px-4 py-2.5 text-xs font-medium text-stone-800 dark:text-zinc-200 hover:bg-stone-100 dark:hover:bg-zinc-800 transition-colors min-h-[44px] whitespace-nowrap"
                >
                  <Volume2 className="w-4 h-4 accent-text" />
                  <span>語音播報今日簡報</span>
                </button>
              )}
            </div>
          </div>

          {/* Horizontal Date Scroller */}
          <div className="mt-5 flex items-center gap-2 overflow-x-auto pb-1">
            {dateStrip.map((d) => {
              const isSelected = d.dateStr === selectedDate;
              return (
                <button
                  key={d.dateStr}
                  type="button"
                  onClick={() => onSelectDate(d.dateStr)}
                  aria-label={`查看 ${d.dateStr} 排程`}
                  aria-pressed={isSelected}
                  className={`flex flex-col items-center justify-center min-w-[56px] min-h-[56px] px-3 py-2 rounded-xl border transition-colors shrink-0 ${
                    isSelected
                      ? 'accent-bg border-transparent'
                      : 'border-stone-200 dark:border-zinc-800 bg-stone-50 dark:bg-zinc-950 text-stone-700 dark:text-zinc-300 hover:bg-stone-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  <span className="text-[11px] opacity-80">週{d.weekday}</span>
                  <span className="text-sm font-mono font-semibold tabular-nums mt-0.5">
                    {d.dayNum}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Smart Quick-Add Bar */}
        <section
          aria-label="智慧快速新增任務"
          className="rounded-2xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4"
        >
          <form onSubmit={handleQuickSubmit} className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <label htmlFor="quick-task-input" className="sr-only">
                快速輸入任務（支援時間、#標籤、!優先度）
              </label>
              <input
                id="quick-task-input"
                type="text"
                value={quickInput}
                onChange={(e) => {
                  setQuickInput(e.target.value);
                  if (quickError) setQuickError('');
                }}
                placeholder="快速輸入：例如「15:30 設計會議 #工作 !高」"
                className="w-full rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-950 pl-4 pr-12 py-3 text-sm text-stone-900 dark:text-zinc-100 placeholder:text-stone-400 dark:placeholder:text-zinc-500 focus:outline-none accent-focus"
              />
              <button
                type="button"
                onClick={handleVoiceDictate}
                aria-label={listening ? '正在語音聽寫' : '語音輸入任務'}
                className={`absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center ${
                  listening
                    ? 'bg-rose-600 text-white'
                    : 'text-stone-500 dark:text-zinc-400 hover:bg-stone-200/70 dark:hover:bg-zinc-800'
                }`}
              >
                {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
            </div>
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 rounded-xl accent-bg px-5 py-3 text-sm font-medium min-h-[44px] whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>智慧加入</span>
            </button>
          </form>

          {quickError && (
            <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{quickError}</p>
          )}
          {voiceNotice && (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">{voiceNotice}</p>
          )}
          {quickPreview && (
            <p className="mt-2.5 text-xs text-stone-500 dark:text-zinc-400 font-mono">
              智慧解析預覽：{quickPreview.dueDate}
              {quickPreview.startTime ? ` ${quickPreview.startTime}` : ''} · 優先度{' '}
              {PRIORITY_LABEL[quickPreview.priority]} · 標籤 {quickPreview.tags.join(' / ')}
            </p>
          )}
        </section>

        {/* Mini Analytics Dashboard (Completion Rate & Task Type Distribution) */}
        <TodayAnalyticsCard tasks={tasks} selectedDate={selectedDate} />

        {/* Filter, Sort & Task List */}
        <section
          aria-label="任務清單與時間軸"
          className="rounded-2xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden"
        >
          {/* Toolbar */}
          <div className="p-4 border-b border-stone-200 dark:border-zinc-800 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1 p-1 rounded-xl bg-stone-100 dark:bg-zinc-800/80">
                {(
                  [
                    { id: 'all', label: '全部' },
                    { id: 'active', label: '待辦' },
                    { id: 'meetings', label: '會議' },
                    { id: 'done', label: '已完成' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setStatusFilter(tab.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap min-h-[36px] ${
                      statusFilter === tab.id
                        ? 'bg-white dark:bg-zinc-900 text-stone-900 dark:text-zinc-100 shadow-xs'
                        : 'text-stone-600 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1 p-1 rounded-xl bg-stone-100 dark:bg-zinc-800/80">
                  <button
                    type="button"
                    onClick={() => setViewMode('priority')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap min-h-[36px] ${
                      viewMode === 'priority'
                        ? 'bg-white dark:bg-zinc-900 text-stone-900 dark:text-zinc-100 shadow-xs'
                        : 'text-stone-600 dark:text-zinc-400'
                    }`}
                  >
                    優先排序
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('timeline')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap min-h-[36px] ${
                      viewMode === 'timeline'
                        ? 'bg-white dark:bg-zinc-900 text-stone-900 dark:text-zinc-100 shadow-xs'
                        : 'text-stone-600 dark:text-zinc-400'
                    }`}
                  >
                    時間軸
                  </button>
                </div>

                {viewMode === 'priority' && (
                  <select
                    aria-label="排序方式"
                    value={sortMode}
                    onChange={(e) => setSortMode(e.target.value as SortMode)}
                    className="rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-950 px-3 py-1.5 text-xs text-stone-700 dark:text-zinc-300 min-h-[38px]"
                  >
                    <option value="smart">智慧優先度</option>
                    <option value="time">排程時間</option>
                    <option value="deadline">截止期限</option>
                    <option value="newest">最新建立</option>
                  </select>
                )}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  aria-label="搜尋今日任務與標籤"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜尋任務標題、備註或智慧標籤..."
                  className="w-full rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-950 pl-9 pr-3 py-2 text-xs text-stone-900 dark:text-zinc-100"
                />
              </div>

              <select
                aria-label="依智慧標籤篩選"
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
                className="rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-950 px-3 py-2 text-xs text-stone-700 dark:text-zinc-300 min-h-[38px]"
              >
                <option value="all">所有智慧標籤</option>
                {availableTags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Task Rows */}
          {filteredTasks.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm font-medium text-stone-700 dark:text-zinc-300">
                {selectedDate} 目前沒有符合條件的任務或排程
              </p>
              <p className="text-xs text-stone-500 dark:text-zinc-500 mt-1">
                使用上方快速輸入欄，或點擊新增排程按鈕建立您的第一項待辦事項。
              </p>
              <button
                type="button"
                onClick={onOpenNewTaskModal}
                className="mt-4 inline-flex items-center gap-2 rounded-xl accent-bg px-4 py-2.5 text-xs font-medium min-h-[44px]"
              >
                <Plus className="w-4 h-4" />
                <span>建立第一項排程</span>
              </button>
            </div>
          ) : (
            <ul className="divide-y divide-stone-100 dark:divide-zinc-800/80" data-testid="task-list">
              {filteredTasks.map((task) => {
                const score = computePriorityScore(task, nowMs);
                return (
                  <li
                    key={task.id}
                    className="px-4 py-3.5 hover:bg-stone-50/90 dark:hover:bg-zinc-800/40 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => onToggleTask(task.id)}
                        aria-label={`切換完成狀態「${task.title}」`}
                        className="mt-0.5 p-1.5 -ml-1.5 rounded-lg text-stone-400 hover:text-teal-600 dark:hover:text-teal-400 min-h-[40px] min-w-[40px] flex items-center justify-center shrink-0"
                      >
                        {task.completed ? (
                          <CheckCircle2 className="w-5 h-5 accent-text" />
                        ) : (
                          <Circle className="w-5 h-5" />
                        )}
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => onEditTask(task)}
                            className={`text-left text-sm font-medium hover:underline underline-offset-4 ${
                              task.completed
                                ? 'line-through text-stone-400 dark:text-zinc-500'
                                : 'text-stone-900 dark:text-zinc-100'
                            }`}
                          >
                            {task.title}
                          </button>
                          {!task.completed && (
                            <span className="hidden sm:inline text-xs font-mono text-stone-500 dark:text-zinc-400 tabular-nums shrink-0">
                              優先度 {score}
                            </span>
                          )}
                        </div>

                        {task.notes && (
                          <p className="text-xs text-stone-600 dark:text-zinc-400 mt-1 line-clamp-2">
                            {task.notes}
                          </p>
                        )}

                        {/* Unboxed zero-pill metadata line */}
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-stone-500 dark:text-zinc-400">
                          {task.startTime && (
                            <span className="font-mono tabular-nums text-stone-700 dark:text-zinc-300">
                              {task.startTime}
                              {task.endTime ? `–${task.endTime}` : ''}
                            </span>
                          )}
                          {task.startTime && <span aria-hidden="true">·</span>}
                          <span className={PRIORITY_TEXT_CLASS[task.priority]}>
                            {PRIORITY_LABEL[task.priority]}
                          </span>
                          {!task.completed && (
                            <>
                              <span className="sm:hidden" aria-hidden="true">·</span>
                              <span className="sm:hidden font-mono tabular-nums">優先 {score}</span>
                            </>
                          )}
                          {task.isMeeting && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="accent-text font-medium">預定會議</span>
                            </>
                          )}
                          <span aria-hidden="true">·</span>
                          <span>{task.tags.join(' / ')}</span>
                          {task.reminderMinutes >= 0 && !task.completed && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>
                                {task.reminderMinutes === 0
                                  ? '準時提醒'
                                  : `提前 ${task.reminderMinutes} 分提醒`}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => onSpeakTask(task)}
                          aria-label={`語音提醒「${task.title}」`}
                          title="立即語音提醒"
                          className="p-2 rounded-lg text-stone-500 dark:text-zinc-400 hover:bg-stone-200/70 dark:hover:bg-zinc-800 min-h-[40px] min-w-[40px] flex items-center justify-center"
                        >
                          <Volume2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onJumpToPomodoro(task.id)}
                          aria-label={`開始專注計時「${task.title}」`}
                          title="啟動番茄鐘專注"
                          className="hidden sm:flex p-2 rounded-lg text-stone-500 dark:text-zinc-400 hover:bg-stone-200/70 dark:hover:bg-zinc-800 min-h-[40px] min-w-[40px] items-center justify-center"
                        >
                          <Play className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onEditTask(task)}
                          aria-label={`編輯「${task.title}」`}
                          title="編輯排程"
                          className="p-2 rounded-lg text-stone-500 dark:text-zinc-400 hover:bg-stone-200/70 dark:hover:bg-zinc-800 min-h-[40px] min-w-[40px] flex items-center justify-center"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {/* Desktop Assistant Context Dock */}
      <aside className="space-y-4">
        <div className="rounded-2xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <h2 className="text-sm font-semibold text-stone-900 dark:text-zinc-100">
            下一場提醒預告
          </h2>
          {nextUpcomingTask ? (
            <div className="mt-3 space-y-2">
              <p className="text-sm font-medium text-stone-900 dark:text-zinc-100">
                {nextUpcomingTask.title}
              </p>
              <p className="text-xs font-mono text-stone-500 dark:text-zinc-400 tabular-nums">
                {nextUpcomingTask.dueDate} {nextUpcomingTask.startTime} ·{' '}
                {nextUpcomingTask.reminderMinutes >= 0
                  ? `提前 ${nextUpcomingTask.reminderMinutes} 分鐘自動提醒`
                  : '未啟用自動提醒'}
              </p>
              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onSpeakTask(nextUpcomingTask)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 dark:border-zinc-700 px-3 py-2 text-xs font-medium text-stone-700 dark:text-zinc-200 hover:bg-stone-100 dark:hover:bg-zinc-800 min-h-[40px]"
                >
                  <Volume2 className="w-3.5 h-3.5 accent-text" />
                  <span>試聽提醒</span>
                </button>
                <button
                  type="button"
                  onClick={() => onEditTask(nextUpcomingTask)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 dark:border-zinc-700 px-3 py-2 text-xs font-medium text-stone-700 dark:text-zinc-200 hover:bg-stone-100 dark:hover:bg-zinc-800 min-h-[40px]"
                >
                  <span>調整時間</span>
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-xs text-stone-500 dark:text-zinc-400">
              目前沒有尚未完成的排定時段項目。
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-stone-900 dark:text-zinc-100">
              人事總處假日與颱風假快報
            </h2>
            <span className="text-[11px] font-mono text-stone-500 dark:text-zinc-400">
              {govSettings.monitoredCity}
            </span>
          </div>
          <p
            className={`text-xs leading-relaxed ${
              govCache.typhoonReport?.hasAlert
                ? 'text-rose-600 dark:text-rose-400 font-medium'
                : 'text-stone-600 dark:text-zinc-400'
            }`}
          >
            {govCache.typhoonReport?.summary || '載入行政院人事行政總處停班停課狀態中...'}
          </p>
          {(() => {
            const nextHoliday = getUpcomingHolidays(govCache.holidays, selectedDate, 60)[0];
            if (!nextHoliday) return null;
            return (
              <p className="text-xs font-mono text-stone-700 dark:text-zinc-300 tabular-nums">
                下一個國定假日：{nextHoliday.holiday.name} ({nextHoliday.holiday.date} ·{' '}
                {nextHoliday.daysUntil === 0 ? '今天' : `${nextHoliday.daysUntil} 天後`})
              </p>
            );
          })()}
          <div className="pt-1 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onSyncGovNow}
              className="rounded-lg border border-stone-200 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium text-stone-700 dark:text-zinc-200 hover:bg-stone-100 dark:hover:bg-zinc-800 min-h-[36px]"
            >
              重新檢查
            </button>
            {isSpeaking ? (
              <button
                type="button"
                onClick={onStopSpeaking}
                className="rounded-lg bg-rose-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-rose-700 min-h-[36px]"
              >
                停止播報
              </button>
            ) : (
              <button
                type="button"
                onClick={onSpeakGovStatus}
                className="rounded-lg border border-stone-200 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium text-stone-700 dark:text-zinc-200 hover:bg-stone-100 dark:hover:bg-zinc-800 min-h-[36px]"
              >
                語音播報
              </button>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <h2 className="text-sm font-semibold text-stone-900 dark:text-zinc-100">
            智慧輸入語法提示
          </h2>
          <p className="mt-2 text-xs text-stone-600 dark:text-zinc-400 leading-relaxed">
            在快速輸入框直接輸入日期、時間、標籤與優先級，系統會離線自動分類並計算優先分數：
          </p>
          <ul className="mt-3 space-y-1.5 text-xs font-mono text-stone-700 dark:text-zinc-300">
            <li>明天 14:30 — 指定日期與時間</li>
            <li>#專案 #會議 — 加入自訂標籤</li>
            <li>!緊急 / !高 / !低 — 設定優先權</li>
          </ul>
        </div>
      </aside>
    </div>
  );
};
