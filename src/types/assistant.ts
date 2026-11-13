export type PriorityLevel = 'urgent' | 'high' | 'medium' | 'low';

export type SortMode = 'smart' | 'time' | 'deadline' | 'newest';

export type SyncStatus = 'local' | 'pending' | 'synced';

export type ThemeMode = 'light' | 'dark' | 'system';

export type ThemeAccent = 'teal' | 'indigo' | 'emerald' | 'amber' | 'rose';

export type MainTab = 'today' | 'calendar' | 'memos' | 'cards' | 'plugins' | 'settings';

export interface TaskItem {
  id: string;
  title: string;
  notes: string;
  dueDate: string; // YYYY-MM-DD
  startTime?: string; // HH:mm
  endTime?: string; // HH:mm
  isMeeting: boolean;
  priority: PriorityLevel;
  tags: string[];
  completed: boolean;
  reminderMinutes: number; // -1 = none, 0 = at time, 5, 15, 30, 60
  voiceReminder: boolean;
  googleEventId?: string;
  version: number;
  deleted?: boolean;
  syncStatus: SyncStatus;
  createdAt: number;
  updatedAt: number;
}

export interface MemoChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface MemoItem {
  id: string;
  title: string;
  content: string;
  tags: string[];
  pinned: boolean;
  checklist: MemoChecklistItem[];
  version: number;
  deleted?: boolean;
  syncStatus: SyncStatus;
  createdAt: number;
  updatedAt: number;
}

export type PluginTrigger = 'on_task_create' | 'on_task_complete' | 'manual';

export type PluginKind = 'pomodoro' | 'briefing' | 'webhook' | 'markdown' | 'rule';

export interface WorkflowRuleConfig {
  trigger: PluginTrigger;
  keywordMatch: string;
  addTag?: string;
  setPriority?: PriorityLevel;
  setReminderMinutes?: number;
  enableVoice?: boolean;
  webhookUrl?: string;
}

export interface WorkflowPlugin {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  kind: PluginKind;
  enabled: boolean;
  config: WorkflowRuleConfig;
  lastRunAt?: number;
  runCount: number;
  syncStatus: SyncStatus;
  updatedAt: number;
}

export interface VoiceSettings {
  enabled: boolean;
  autoSpeakReminders: boolean;
  playChime: boolean;
  lang: 'zh-TW' | 'en-US';
  rate: number;
  pitch: number;
}

export interface ThemeSettings {
  mode: ThemeMode;
  accent: ThemeAccent;
}

export interface VaultState {
  initialized: boolean;
  unlocked: boolean;
  salt: string | null;
  checkCipher: string | null;
  checkIv: string | null;
}

export interface CloudBackupRecord {
  id: string;
  label: string;
  itemCount: number;
  ciphertext: string;
  iv: string;
  salt: string;
  createdAtMs: number;
}

export interface ActiveReminderAlert {
  taskId: string;
  title: string;
  dueDate: string;
  startTime?: string;
  isMeeting: boolean;
  priority: PriorityLevel;
  triggeredAt: number;
}

export interface PluginLogEntry {
  id: string;
  pluginId: string;
  pluginName: string;
  message: string;
  timestamp: number;
  status: 'ok' | 'error';
}

export interface GovHolidayItem {
  date: string; // YYYY-MM-DD
  weekday: string;
  isHoliday: boolean;
  name: string;
  isMakeUpWorkday: boolean;
}

export interface TyphoonRegionStatus {
  region: string;
  statusText: string;
  isSuspended: boolean;
}

export interface TyphoonAlertReport {
  title: string;
  updatedAtText: string;
  hasAlert: boolean;
  summary: string;
  regions: TyphoonRegionStatus[];
  sourceUrl: string;
  fetchedAt: number;
}

export interface GovSettings {
  enabled: boolean;
  monitoredCity: string; // e.g. '全部縣市' | '臺北市' | ...
  holidayRemindDaysAhead: number; // 0, 1, 3, 7
  autoSpeakGovAlerts: boolean;
}

export interface GovSyncCache {
  year: number;
  holidays: GovHolidayItem[];
  lastHolidaySyncAt: number | null;
  typhoonReport: TyphoonAlertReport | null;
}

export type BusinessCardCategory = 'client' | 'colleague' | 'other';

export interface BusinessCardItem {
  id: string;
  category: BusinessCardCategory;
  name: string;
  company: string;
  title: string;
  phone: string;
  email: string;
  notes: string;
  pinned: boolean;
  version: number;
  deleted?: boolean;
  syncStatus: SyncStatus;
  createdAt: number;
  updatedAt: number;
}

export interface GoogleCalendarEventItem {
  id: string;
  summary: string;
  description: string;
  startDate: string; // YYYY-MM-DD
  startTime?: string; // HH:mm
  endTime?: string; // HH:mm
  isAllDay: boolean;
  location?: string;
  htmlLink?: string;
}

export interface FloatingNotificationItem {
  id: string;
  kind: 'todo' | 'holiday' | 'typhoon' | 'meeting' | 'calendar';
  title: string;
  body: string;
  timestamp: number;
  voiceText?: string;
}

