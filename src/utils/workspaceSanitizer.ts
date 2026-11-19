import type {
  BusinessCardItem,
  GovSettings,
  GovSyncCache,
  MemoItem,
  PriorityLevel,
  QuickLinkItem,
  TaskItem,
  ThemeAccent,
  ThemeMode,
  ThemeSettings,
  VaultState,
  VoiceSettings,
  WorkflowPlugin,
} from '../types/assistant';
import type { PersistedWorkspace } from '../services/offlineStore';

const VALID_PRIORITIES = new Set<PriorityLevel>(['urgent', 'high', 'medium', 'low']);
const VALID_THEME_MODES = new Set<ThemeMode>(['light', 'dark', 'system']);
const VALID_THEME_ACCENTS = new Set<ThemeAccent>(['teal', 'indigo', 'emerald', 'amber', 'rose']);

export function sanitizeTaskItem(raw: Partial<TaskItem> | null | undefined, fallbackDate: string): TaskItem | null {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id) {
    return null;
  }
  const now = Date.now();
  return {
    id: raw.id,
    title: typeof raw.title === 'string' ? raw.title : '未命名排程',
    notes: typeof raw.notes === 'string' ? raw.notes : '',
    dueDate: typeof raw.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.dueDate) ? raw.dueDate : fallbackDate,
    startTime: typeof raw.startTime === 'string' ? raw.startTime : undefined,
    endTime: typeof raw.endTime === 'string' ? raw.endTime : undefined,
    isMeeting: Boolean(raw.isMeeting),
    priority: VALID_PRIORITIES.has(raw.priority as PriorityLevel) ? (raw.priority as PriorityLevel) : 'medium',
    tags: Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === 'string') : [],
    completed: Boolean(raw.completed),
    reminderMinutes: typeof raw.reminderMinutes === 'number' && Number.isFinite(raw.reminderMinutes) ? raw.reminderMinutes : 15,
    customReminders: Array.isArray(raw.customReminders) ? raw.customReminders : undefined,
    voiceReminder: raw.voiceReminder !== false,
    version: typeof raw.version === 'number' && Number.isFinite(raw.version) ? raw.version : 1,
    syncStatus: raw.syncStatus === 'synced' || raw.syncStatus === 'pending' ? raw.syncStatus : 'local',
    deleted: raw.deleted ? true : undefined,
    createdAt: typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : now,
  };
}

export function sanitizeMemoItem(raw: Partial<MemoItem> | null | undefined): MemoItem | null {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id) {
    return null;
  }
  const now = Date.now();
  return {
    id: raw.id,
    title: typeof raw.title === 'string' ? raw.title : '未命名備忘錄',
    content: typeof raw.content === 'string' ? raw.content : '',
    tags: Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === 'string') : [],
    pinned: Boolean(raw.pinned),
    checklist: Array.isArray(raw.checklist)
      ? raw.checklist
          .filter((c): c is { id: string; text: string; done: boolean } => Boolean(c && typeof c === 'object'))
          .map((c, idx) => ({
            id: typeof c.id === 'string' && c.id ? c.id : `chk-${idx}`,
            text: typeof c.text === 'string' ? c.text : '',
            done: Boolean(c.done),
          }))
      : [],
    version: typeof raw.version === 'number' && Number.isFinite(raw.version) ? raw.version : 1,
    syncStatus: raw.syncStatus === 'synced' || raw.syncStatus === 'pending' ? raw.syncStatus : 'local',
    deleted: raw.deleted ? true : undefined,
    createdAt: typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : now,
  };
}

export function sanitizePluginItem(raw: Partial<WorkflowPlugin> | null | undefined): WorkflowPlugin | null {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id) {
    return null;
  }
  return {
    id: raw.id,
    name: typeof raw.name === 'string' ? raw.name : '工作流插件',
    description: typeof raw.description === 'string' ? raw.description : '',
    author: typeof raw.author === 'string' ? raw.author : 'Kairo',
    version: typeof raw.version === 'string' ? raw.version : '1.0.0',
    kind:
      raw.kind === 'pomodoro' ||
      raw.kind === 'briefing' ||
      raw.kind === 'markdown' ||
      raw.kind === 'webhook' ||
      raw.kind === 'rule'
        ? raw.kind
        : 'rule',
    enabled: Boolean(raw.enabled),
    config: raw.config && typeof raw.config === 'object' ? raw.config : { trigger: 'manual', keywordMatch: '' },
    runCount: typeof raw.runCount === 'number' && Number.isFinite(raw.runCount) ? raw.runCount : 0,
    lastRunAt: typeof raw.lastRunAt === 'number' ? raw.lastRunAt : undefined,
    syncStatus: raw.syncStatus === 'synced' || raw.syncStatus === 'pending' ? raw.syncStatus : 'local',
    updatedAt: typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : Date.now(),
  };
}

export function sanitizeBusinessCardItem(raw: Partial<BusinessCardItem> | null | undefined): BusinessCardItem | null {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id) {
    return null;
  }
  const now = Date.now();
  const validCategory =
    raw.category === 'colleague' || raw.category === 'client' || raw.category === 'other'
      ? raw.category
      : 'other';
  return {
    id: raw.id,
    category: validCategory,
    name: typeof raw.name === 'string' ? raw.name : '未命名聯絡人',
    company: typeof raw.company === 'string' ? raw.company : '',
    title: typeof raw.title === 'string' ? raw.title : '',
    phone: typeof raw.phone === 'string' ? raw.phone : '',
    email: typeof raw.email === 'string' ? raw.email : '',
    notes: typeof raw.notes === 'string' ? raw.notes : '',
    pinned: Boolean(raw.pinned),
    version: typeof raw.version === 'number' && Number.isFinite(raw.version) ? raw.version : 1,
    syncStatus: raw.syncStatus === 'synced' || raw.syncStatus === 'pending' ? raw.syncStatus : 'local',
    deleted: raw.deleted ? true : undefined,
    createdAt: typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : now,
  };
}

export function sanitizeQuickLinkItem(raw: Partial<QuickLinkItem> | null | undefined): QuickLinkItem | null {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id) {
    return null;
  }
  const now = Date.now();
  return {
    id: raw.id,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name : '未命名連結',
    url: typeof raw.url === 'string' && raw.url.trim() ? raw.url : 'https://example.com',
    pinned: Boolean(raw.pinned),
    category: typeof raw.category === 'string' && raw.category.trim() ? raw.category : '公司系統',
    version: typeof raw.version === 'number' && Number.isFinite(raw.version) ? raw.version : 1,
    syncStatus: raw.syncStatus === 'synced' || raw.syncStatus === 'pending' ? raw.syncStatus : 'local',
    deleted: raw.deleted ? true : undefined,
    createdAt: typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : now,
  };
}

export function normalizePersistedWorkspace(
  raw: Partial<PersistedWorkspace> | null | undefined,
  seed: PersistedWorkspace,
  todayStr: string
): PersistedWorkspace {
  if (!raw || typeof raw !== 'object') {
    return seed;
  }

  const tasks = Array.isArray(raw.tasks)
    ? raw.tasks.map((t) => sanitizeTaskItem(t, todayStr)).filter((t): t is TaskItem => Boolean(t))
    : seed.tasks;

  const memos = Array.isArray(raw.memos)
    ? raw.memos.map((m) => sanitizeMemoItem(m)).filter((m): m is MemoItem => Boolean(m))
    : seed.memos;

  const plugins = Array.isArray(raw.plugins)
    ? raw.plugins.map((p) => sanitizePluginItem(p)).filter((p): p is WorkflowPlugin => Boolean(p))
    : seed.plugins;

  const businessCards = Array.isArray(raw.businessCards)
    ? raw.businessCards.map((c) => sanitizeBusinessCardItem(c)).filter((c): c is BusinessCardItem => Boolean(c))
    : seed.businessCards || [];

  const quickLinks = Array.isArray(raw.quickLinks)
    ? raw.quickLinks.map((l) => sanitizeQuickLinkItem(l)).filter((l): l is QuickLinkItem => Boolean(l))
    : seed.quickLinks || [];

  const rawTheme = raw.theme as Partial<ThemeSettings> | undefined;
  const theme: ThemeSettings = {
    mode: rawTheme && VALID_THEME_MODES.has(rawTheme.mode as ThemeMode) ? (rawTheme.mode as ThemeMode) : seed.theme.mode,
    accent: rawTheme && VALID_THEME_ACCENTS.has(rawTheme.accent as ThemeAccent) ? (rawTheme.accent as ThemeAccent) : seed.theme.accent,
  };

  const rawVoice = raw.voice as Partial<VoiceSettings> | undefined;
  const voice: VoiceSettings = {
    enabled: typeof rawVoice?.enabled === 'boolean' ? rawVoice.enabled : seed.voice.enabled,
    autoSpeakReminders: typeof rawVoice?.autoSpeakReminders === 'boolean' ? rawVoice.autoSpeakReminders : seed.voice.autoSpeakReminders,
    playChime: typeof rawVoice?.playChime === 'boolean' ? rawVoice.playChime : seed.voice.playChime,
    lang: typeof rawVoice?.lang === 'string' && rawVoice.lang ? rawVoice.lang : seed.voice.lang,
    rate: typeof rawVoice?.rate === 'number' && Number.isFinite(rawVoice.rate) ? rawVoice.rate : seed.voice.rate,
    pitch: typeof rawVoice?.pitch === 'number' && Number.isFinite(rawVoice.pitch) ? rawVoice.pitch : seed.voice.pitch,
  };

  const rawVault = raw.vault as Partial<VaultState> | undefined;
  const vault: VaultState = {
    initialized: Boolean(rawVault?.initialized),
    unlocked: false,
    salt: typeof rawVault?.salt === 'string' ? rawVault.salt : null,
    checkCipher: typeof rawVault?.checkCipher === 'string' ? rawVault.checkCipher : null,
    checkIv: typeof rawVault?.checkIv === 'string' ? rawVault.checkIv : null,
  };

  const rawGovSettings = raw.govSettings as Partial<GovSettings> | undefined;
  const govSettings: GovSettings = {
    enabled: typeof rawGovSettings?.enabled === 'boolean' ? rawGovSettings.enabled : (seed.govSettings?.enabled ?? true),
    monitoredCity:
      typeof rawGovSettings?.monitoredCity === 'string' && rawGovSettings.monitoredCity
        ? rawGovSettings.monitoredCity
        : (seed.govSettings?.monitoredCity ?? '全部縣市'),
    holidayRemindDaysAhead:
      typeof rawGovSettings?.holidayRemindDaysAhead === 'number' && Number.isFinite(rawGovSettings.holidayRemindDaysAhead)
        ? rawGovSettings.holidayRemindDaysAhead
        : (seed.govSettings?.holidayRemindDaysAhead ?? 3),
    autoSpeakGovAlerts:
      typeof rawGovSettings?.autoSpeakGovAlerts === 'boolean'
        ? rawGovSettings.autoSpeakGovAlerts
        : (seed.govSettings?.autoSpeakGovAlerts ?? true),
  };

  const rawGovCache = raw.govCache as Partial<GovSyncCache> | undefined;
  const govCache: GovSyncCache = {
    year:
      typeof rawGovCache?.year === 'number' && Number.isFinite(rawGovCache.year)
        ? rawGovCache.year
        : (seed.govCache?.year ?? new Date().getFullYear()),
    holidays: Array.isArray(rawGovCache?.holidays) ? rawGovCache.holidays : [],
    lastHolidaySyncAt: typeof rawGovCache?.lastHolidaySyncAt === 'number' ? rawGovCache.lastHolidaySyncAt : null,
    typhoonReport:
      rawGovCache?.typhoonReport && typeof rawGovCache.typhoonReport === 'object'
        ? {
            ...rawGovCache.typhoonReport,
            regions: Array.isArray(rawGovCache.typhoonReport.regions) ? rawGovCache.typhoonReport.regions : [],
          }
        : null,
  };

  return {
    tasks,
    memos,
    plugins,
    businessCards,
    quickLinks,
    theme,
    voice,
    vault,
    govSettings,
    govCache,
    lastSyncedAt: typeof raw.lastSyncedAt === 'number' ? raw.lastSyncedAt : null,
  };
}
