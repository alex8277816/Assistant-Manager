import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar,
  CheckSquare,
  FileText,
  Moon,
  Plus,
  Puzzle,
  Settings,
  Square,
  Sun,
  Users,
  Volume2,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import {
  type ActiveReminderAlert,
  type BusinessCardItem,
  type CloudBackupRecord,
  type FloatingNotificationItem,
  type GoogleCalendarEventItem,
  type GovSettings,
  type GovSyncCache,
  type MainTab,
  type MemoItem,
  type PluginLogEntry,
  type TaskItem,
  type ThemeSettings,
  type VaultState,
  type VoiceSettings,
  type WorkflowPlugin,
} from './types/assistant';
import {
  createSeedWorkspace,
  getTodayDateStr,
  loadWorkspaceFromOffline,
  saveWorkspaceToOffline,
} from './services/offlineStore';
import {
  connectGoogleCalendarPopup,
  createCloudBackupSnapshot,
  deleteCloudBackupSnapshot,
  disconnectGoogleCalendarToken,
  fetchUserVaultMeta,
  getGoogleCalendarAccessToken,
  listCloudBackupSnapshots,
  pushEncryptedSyncItem,
  signInWithGoogle,
  signOutGoogle,
  subscribeAuth,
  subscribeCalendarToken,
  subscribeEncryptedSyncItems,
  updateRemoteThemePrefs,
  upsertUserVaultMeta,
} from './services/firebaseSync';
import {
  speakText,
  stopSpeaking,
  subscribeSpeakingState,
} from './services/voiceService';
import {
  requestSystemNotificationPermission,
  sendSystemNotification,
} from './services/notificationService';
import {
  createGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  fetchGoogleCalendarEvents,
  updateGoogleCalendarEvent,
} from './services/googleCalendarService';
import {
  createEncryptedArchive,
  createVaultCheck,
  decryptEncryptedArchive,
  deriveAesKey,
  encryptText,
  generateSaltBase64,
  verifyVaultCheck,
  type EncryptedArchiveFile,
} from './utils/cryptoVault';
import { parseQuickTaskInput } from './utils/smartEngine';
import { applyWorkflowPlugins } from './utils/pluginEngine';
import {
  buildReminderTriggerKey,
  findDueReminders,
  findTodayPendingSummary,
  formatBriefingScript,
} from './utils/reminderEngine';
import type { ImportedICSEvent } from './utils/icsSync';
import { fetchGovHolidays, fetchGovTyphoonStatus } from './services/govSyncService';
import {
  buildHolidayVoiceScript,
  buildTyphoonVoiceScript,
  filterTyphoonRegionsForCity,
  getUpcomingHolidays,
} from './utils/govCalendar';
import { BusinessCardsView } from './components/BusinessCardsView';
import { FloatingNotificationStack } from './components/FloatingNotificationStack';
import { GovAlertBanner } from './components/GovAlertBanner';
import { OfflineBanner, PWAInstallButton } from './components/PWAInstallButton';
import { ReminderBanner } from './components/ReminderBanner';
import { TodayScheduleView } from './components/TodayScheduleView';
import { CalendarSyncView } from './components/CalendarSyncView';
import { MemosView } from './components/MemosView';
import { PluginsView } from './components/PluginsView';
import { SettingsBackupView } from './components/SettingsBackupView';
import { TaskModal } from './components/TaskModal';

const NAV_ITEMS: Array<{ id: MainTab; label: string; mobileLabel: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'today', label: '今日排程', mobileLabel: '今日', icon: CheckSquare },
  { id: 'calendar', label: '行事曆同步', mobileLabel: '日曆', icon: Calendar },
  { id: 'memos', label: '加密備忘錄', mobileLabel: '備忘', icon: FileText },
  { id: 'cards', label: '名片夾', mobileLabel: '名片', icon: Users },
  { id: 'plugins', label: '插件擴充', mobileLabel: '插件', icon: Puzzle },
  { id: 'settings', label: '備份與主題', mobileLabel: '設定', icon: Settings },
];

export default function App() {
  const initialSeed = useMemo(() => createSeedWorkspace(), []);

  const [loaded, setLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<MainTab>('today');
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDateStr());

  const [tasks, setTasks] = useState<TaskItem[]>(initialSeed.tasks);
  const [memos, setMemos] = useState<MemoItem[]>(initialSeed.memos);
  const [plugins, setPlugins] = useState<WorkflowPlugin[]>(initialSeed.plugins);
  const [businessCards, setBusinessCards] = useState<BusinessCardItem[]>(
    initialSeed.businessCards || []
  );
  const [theme, setTheme] = useState<ThemeSettings>(initialSeed.theme);
  const [voice, setVoice] = useState<VoiceSettings>(initialSeed.voice);
  const [vault, setVault] = useState<VaultState>(initialSeed.vault);
  const [govSettings, setGovSettings] = useState<GovSettings>(initialSeed.govSettings!);
  const [govCache, setGovCache] = useState<GovSyncCache>(initialSeed.govCache!);
  const [govSyncing, setGovSyncing] = useState(false);
  const [dismissedTyphoonAlert, setDismissedTyphoonAlert] = useState(false);
  const [dismissedHolidayAlert, setDismissedHolidayAlert] = useState(false);
  const lastAnnouncedGovKeyRef = useRef<string>('');
  const todayDigestShownRef = useRef<string>('');
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

  // Runtime non-persisted state
  const [cryptoKey, setCryptoKey] = useState<CryptoKey | null>(null);
  const [activePassphrase, setActivePassphrase] = useState<string | null>(null);
  const [sampleCipherPreview, setSampleCipherPreview] = useState<{ ciphertext: string; iv: string } | null>(null);

  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [cloudBackups, setCloudBackups] = useState<CloudBackupRecord[]>([]);
  const [googleCalendarToken, setGoogleCalendarToken] = useState<string | null>(null);
  const [googleCalendarEvents, setGoogleCalendarEvents] = useState<GoogleCalendarEventItem[]>([]);
  const [googleCalendarLoading, setGoogleCalendarLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);

  const [activeAlerts, setActiveAlerts] = useState<ActiveReminderAlert[]>([]);
  const [floatingNotifications, setFloatingNotifications] = useState<FloatingNotificationItem[]>([]);
  const snoozedRef = useRef<Record<string, number>>({});
  const triggeredKeysRef = useRef<Set<string>>(new Set());

  const [pluginLogs, setPluginLogs] = useState<PluginLogEntry[]>([]);
  const [toastMessage, setToastMessage] = useState<string>('');

  const pushFloatingNotification = useCallback(
    (
      item: Omit<FloatingNotificationItem, 'timestamp'>,
      alsoSystemNotif = true
    ) => {
      const ts = Date.now();
      const next: FloatingNotificationItem = { ...item, timestamp: ts };
      setFloatingNotifications((prev) => {
        const filtered = prev.filter((p) => p.id !== next.id);
        return [next, ...filtered].slice(0, 5);
      });
      if (alsoSystemNotif) {
        sendSystemNotification(next.title, next.body, next.id).catch(() => {});
      }
      if (next.kind !== 'typhoon') {
        window.setTimeout(() => {
          setFloatingNotifications((prev) =>
            prev.filter((p) => !(p.id === next.id && p.timestamp === ts))
          );
        }, 15000);
      }
    },
    []
  );

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? '' : prev));
    }, 3500);
  }, []);

  // 1. Load offline IndexedDB workspace immediately on boot
  useEffect(() => {
    let active = true;
    loadWorkspaceFromOffline().then((ws) => {
      if (!active) return;
      setTasks(ws.tasks);
      setMemos(ws.memos);
      setPlugins(ws.plugins);
      setBusinessCards(ws.businessCards || createSeedWorkspace().businessCards || []);
      setTheme(ws.theme);
      setVoice(ws.voice);
      setVault({ ...ws.vault, unlocked: false });
      if (ws.govSettings) setGovSettings(ws.govSettings);
      if (ws.govCache) setGovCache(ws.govCache);
      setLastSyncedAt(ws.lastSyncedAt);
      setLoaded(true);
    });
    const unsubSpeak = subscribeSpeakingState((s) => setIsSpeaking(s.isSpeaking));
    const unsubCalToken = subscribeCalendarToken((t) => setGoogleCalendarToken(t));
    return () => {
      active = false;
      unsubSpeak();
      unsubCalToken();
    };
  }, []);

  // 2. Persist workspace to IndexedDB whenever state changes
  useEffect(() => {
    if (!loaded) return;
    saveWorkspaceToOffline({
      tasks,
      memos,
      plugins,
      businessCards,
      theme,
      voice,
      vault: { ...vault, unlocked: false },
      govSettings,
      govCache,
      lastSyncedAt,
    }).catch(() => {});
  }, [loaded, tasks, memos, plugins, businessCards, theme, voice, vault, govSettings, govCache, lastSyncedAt]);

  // 3. Apply Dark Mode & Custom Accent Theme to <html>
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-accent', theme.accent);

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const applyDark = () => {
      const isDark = theme.mode === 'dark' || (theme.mode === 'system' && media.matches);
      root.classList.toggle('dark', isDark);
    };
    applyDark();
    media.addEventListener('change', applyDark);
    return () => media.removeEventListener('change', applyDark);
  }, [theme]);

  // 4. Refresh E2EE Cipher Preview whenever cryptoKey or tasks change
  useEffect(() => {
    if (!cryptoKey || tasks.length === 0) {
      setSampleCipherPreview(null);
      return;
    }
    encryptText(cryptoKey, JSON.stringify(tasks[0]))
      .then((res) => setSampleCipherPreview(res))
      .catch(() => {});
  }, [cryptoKey, tasks]);

  // 5. Subscribe Firebase Auth state
  useEffect(() => {
    const unsub = subscribeAuth(async (nextUser) => {
      setUser(nextUser);
      if (nextUser) {
        try {
          const remoteMeta = await fetchUserVaultMeta(nextUser.uid);
          if (remoteMeta) {
            setVault((prev) => ({
              ...prev,
              initialized: true,
              salt: remoteMeta.vaultSalt,
              checkCipher: remoteMeta.vaultCheckCipher,
              checkIv: remoteMeta.vaultCheckIv,
            }));
          }
          const backups = await listCloudBackupSnapshots(nextUser.uid);
          setCloudBackups(backups);
        } catch {
          // Offline or unverified; stay gracefully in local-first mode
        }
      } else {
        setCloudBackups([]);
      }
    });
    return () => unsub();
  }, []);

  // 6. Subscribe E2EE Firestore Sync when authenticated AND vault unlocked
  useEffect(() => {
    if (!user || !cryptoKey) return;
    const unsub = subscribeEncryptedSyncItems(user.uid, cryptoKey, (batch) => {
      setTasks((prev) => {
        const map = new Map<string, TaskItem>(prev.map((t) => [t.id, t]));
        for (const rt of batch.tasks) {
          const local = map.get(rt.id);
          if (!local || rt.updatedAt >= local.updatedAt) {
            map.set(rt.id, rt);
          }
        }
        return Array.from(map.values());
      });
      setMemos((prev) => {
        const map = new Map<string, MemoItem>(prev.map((m) => [m.id, m]));
        for (const rm of batch.memos) {
          const local = map.get(rm.id);
          if (!local || rm.updatedAt >= local.updatedAt) {
            map.set(rm.id, rm);
          }
        }
        return Array.from(map.values());
      });
      setPlugins((prev) => {
        const map = new Map<string, WorkflowPlugin>(prev.map((p) => [p.id, p]));
        for (const rp of batch.plugins) {
          const local = map.get(rp.id);
          if (!local || rp.updatedAt >= local.updatedAt) {
            map.set(rp.id, rp);
          }
        }
        return Array.from(map.values());
      });
      setBusinessCards((prev) => {
        const map = new Map<string, BusinessCardItem>(prev.map((c) => [c.id, c]));
        for (const rc of batch.cards) {
          const local = map.get(rc.id);
          if (!local || rc.updatedAt >= local.updatedAt) {
            map.set(rc.id, rc);
          }
        }
        return Array.from(map.values());
      });
      setLastSyncedAt(Date.now());
    });
    return () => unsub();
  }, [user, cryptoKey]);

  const syncSingleItemToCloud = useCallback(
    async (
      kind: 'task' | 'memo' | 'plugin' | 'card',
      item: TaskItem | MemoItem | WorkflowPlugin | BusinessCardItem
    ) => {
      if (!user || !cryptoKey) return;
      try {
        await pushEncryptedSyncItem(user.uid, cryptoKey, kind, item);
        setLastSyncedAt(Date.now());
      } catch {
        // Keep local item as pending; offline-first guarantees zero data loss
      }
    },
    [user, cryptoKey]
  );

  // 7. Auto-Reminder Polling Engine
  useEffect(() => {
    const evaluate = () => {
      const nowMs = Date.now();
      const due = findDueReminders(tasks, nowMs, snoozedRef.current, triggeredKeysRef.current);
      if (due.length === 0) return;

      due.forEach((alert) => {
        const task = tasks.find((t) => t.id === alert.taskId);
        if (task) {
          triggeredKeysRef.current.add(buildReminderTriggerKey(task));
          if (voice.autoSpeakReminders && task.voiceReminder) {
            speakText(
              `${task.isMeeting ? '會議提醒' : '任務提醒'}：${task.title}，預定時間 ${task.startTime || ''}`,
              voice,
              task.title
            );
          }
          pushFloatingNotification({
            id: `due-${task.id}`,
            kind: task.isMeeting ? 'meeting' : 'todo',
            title: task.title,
            body: `${task.dueDate} ${task.startTime || ''} · ${
              task.isMeeting ? '預定會議即將開始' : '任務提醒時間已到'
            }`,
            voiceText: `${task.isMeeting ? '會議提醒' : '任務提醒'}：${task.title}，預定時間 ${task.startTime || ''}`,
          });
        }
      });

      setActiveAlerts((prev) => {
        const existingIds = new Set(prev.map((a) => a.taskId));
        return [...prev, ...due.filter((d) => !existingIds.has(d.taskId))];
      });
    };

    evaluate();
    const timer = window.setInterval(evaluate, 15000);
    return () => window.clearInterval(timer);
  }, [tasks, voice, pushFloatingNotification]);

  // 7a. Automatic Today Pending Tasks Digest Reminder
  const triggerTodayPendingReminder = useCallback(
    (manual = false) => {
      const todayStr = getTodayDateStr();
      const summary = findTodayPendingSummary(tasks, todayStr);
      if (!summary) {
        if (manual) showToast('今日待辦事項皆已完成！');
        return;
      }
      pushFloatingNotification({
        id: `today-digest-${todayStr}`,
        kind: 'todo',
        title: `今日尚有 ${summary.count} 項待辦事項`,
        body: summary.bodyText,
        voiceText: summary.voiceScript,
      });
      if (manual && voice.enabled) {
        speakText(summary.voiceScript, voice, '今日待辦自動提醒');
      }
    },
    [tasks, voice, pushFloatingNotification, showToast]
  );

  useEffect(() => {
    if (!loaded) return;
    const todayStr = getTodayDateStr();
    if (todayDigestShownRef.current === todayStr) return;
    const summary = findTodayPendingSummary(tasks, todayStr);
    if (!summary) return;
    todayDigestShownRef.current = todayStr;
    pushFloatingNotification({
      id: `today-digest-${todayStr}`,
      kind: 'todo',
      title: `今日尚有 ${summary.count} 項待辦事項`,
      body: summary.bodyText,
      voiceText: summary.voiceScript,
    });
  }, [loaded, tasks, pushFloatingNotification]);

  // 7b. DGPA National Holiday & Typhoon Suspension Sync + Auto-Alert
  const syncGovNow = useCallback(async () => {
    setGovSyncing(true);
    try {
      const currentYear = new Date().getFullYear();
      const currentMonth = new Date().getMonth() + 1;
      const holidayPromises = [fetchGovHolidays(currentYear)];
      if (currentMonth >= 11) {
        holidayPromises.push(fetchGovHolidays(currentYear + 1).catch(() => ({
          year: currentYear + 1,
          sourceUrl: '',
          openDataUrl: '',
          apiUrl: '',
          holidays: [],
          fetchedAt: Date.now(),
        })));
      }

      const [holidayResults, typhoonReport] = await Promise.all([
        Promise.all(holidayPromises),
        fetchGovTyphoonStatus().catch(() => null),
      ]);

      const mergedMap = new Map(
        holidayResults.flatMap((res) => res.holidays).map((item) => [item.date, item])
      );
      const mergedHolidays = Array.from(mergedMap.values()).sort((a, b) =>
        a.date.localeCompare(b.date)
      );

      setGovCache((prev) => ({
        year: currentYear,
        holidays: mergedHolidays.length > 0 ? mergedHolidays : prev.holidays,
        lastHolidaySyncAt: Date.now(),
        typhoonReport: typhoonReport ?? prev.typhoonReport,
      }));
    } catch {
      // Keep offline cache if network fails
    } finally {
      setGovSyncing(false);
    }
  }, []);

  useEffect(() => {
    if (!loaded || !govSettings.enabled) return;
    if (typeof navigator === 'undefined' || navigator.onLine) {
      syncGovNow();
    }
    const timer = window.setInterval(() => {
      if (typeof navigator === 'undefined' || navigator.onLine) {
        fetchGovTyphoonStatus()
          .then((report) => {
            setGovCache((prev) => ({ ...prev, typhoonReport: report }));
          })
          .catch(() => {});
      }
    }, 600000);
    return () => window.clearInterval(timer);
  }, [loaded, govSettings.enabled, syncGovNow]);

  const monitoredTyphoonRegions = useMemo(
    () => filterTyphoonRegionsForCity(govCache.typhoonReport, govSettings.monitoredCity),
    [govCache.typhoonReport, govSettings.monitoredCity]
  );

  const upcomingGovHoliday = useMemo(() => {
    const todayStr = getTodayDateStr();
    return getUpcomingHolidays(
      govCache.holidays,
      todayStr,
      govSettings.holidayRemindDaysAhead
    )[0] || null;
  }, [govCache.holidays, govSettings.holidayRemindDaysAhead]);

  useEffect(() => {
    if (!loaded || !govSettings.enabled) return;
    const typhoonKey =
      monitoredTyphoonRegions.length > 0
        ? `typhoon:${govCache.typhoonReport?.updatedAtText || ''}:${monitoredTyphoonRegions.map((r) => `${r.region}:${r.statusText}`).join('|')}`
        : '';
    const holidayKey = upcomingGovHoliday
      ? `holiday:${upcomingGovHoliday.holiday.date}:${upcomingGovHoliday.daysUntil}`
      : '';
    const combinedKey = `${typhoonKey}#${holidayKey}`;
    if (!typhoonKey && !holidayKey) return;
    if (lastAnnouncedGovKeyRef.current === combinedKey) return;
    lastAnnouncedGovKeyRef.current = combinedKey;

    if (monitoredTyphoonRegions.length > 0) {
      setDismissedTyphoonAlert(false);
      const script = buildTyphoonVoiceScript(
        monitoredTyphoonRegions,
        govCache.typhoonReport?.updatedAtText || ''
      );
      pushFloatingNotification({
        id: `gov-typhoon-${govCache.typhoonReport?.updatedAtText || 'live'}`,
        kind: 'typhoon',
        title: '人事總處停班停課通報',
        body: monitoredTyphoonRegions.map((r) => `${r.region}：${r.statusText}`).join(' ｜ '),
        voiceText: script,
      });
      if (govSettings.autoSpeakGovAlerts) {
        speakText(script, voice, '颱風假停班停課警報');
      }
    } else if (upcomingGovHoliday) {
      const holidayScript = buildHolidayVoiceScript(upcomingGovHoliday);
      pushFloatingNotification({
        id: `gov-holiday-${upcomingGovHoliday.holiday.date}`,
        kind: 'holiday',
        title: `國定假日提醒：${upcomingGovHoliday.holiday.name}`,
        body:
          upcomingGovHoliday.daysUntil === 0
            ? `今天 (${upcomingGovHoliday.holiday.date}) 為政府公告放假日`
            : `${upcomingGovHoliday.daysUntil} 天後 (${upcomingGovHoliday.holiday.date}) 放假`,
        voiceText: holidayScript,
      });
      if (govSettings.autoSpeakGovAlerts) {
        speakText(holidayScript, voice, '國定假日提醒');
      }
    }
  }, [
    loaded,
    govSettings.enabled,
    govSettings.autoSpeakGovAlerts,
    monitoredTyphoonRegions,
    govCache.typhoonReport?.updatedAtText,
    upcomingGovHoliday,
    voice,
    pushFloatingNotification,
  ]);

  const logPluginExecution = useCallback(
    (pluginId: string, pluginName: string, message: string, status: 'ok' | 'error' = 'ok') => {
      setPluginLogs((prev) => [
        { id: `log-${Date.now()}`, pluginId, pluginName, message, timestamp: Date.now(), status },
        ...prev.slice(0, 19),
      ]);
      setPlugins((prev) =>
        prev.map((p) =>
          p.id === pluginId ? { ...p, runCount: p.runCount + 1, lastRunAt: Date.now() } : p
        )
      );
    },
    []
  );

  const dispatchWebhookIfEnabled = useCallback(
    async (eventType: string, payload: unknown) => {
      const hook = plugins.find((p) => p.kind === 'webhook' && p.enabled && p.config.webhookUrl);
      if (!hook || !hook.config.webhookUrl) return;
      try {
        await fetch(hook.config.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event: eventType, timestamp: new Date().toISOString(), payload }),
        });
        logPluginExecution(hook.id, hook.name, `已推播 ${eventType} 事件至 Webhook`);
      } catch {
        logPluginExecution(hook.id, hook.name, `推播 ${eventType} 失敗（離線或跨網域限制）`, 'error');
      }
    },
    [plugins, logPluginExecution]
  );

  // Task CRUD Handlers
  const handleQuickAddTask = (raw: string, baseDate: string) => {
    const parsed = parseQuickTaskInput(raw, baseDate);
    const now = Date.now();
    const draftTask: TaskItem = {
      id: `task-${now}-${Math.random().toString(36).slice(2, 6)}`,
      title: parsed.title,
      notes: '',
      dueDate: parsed.dueDate,
      startTime: parsed.startTime,
      isMeeting: parsed.isMeeting,
      priority: parsed.priority,
      tags: parsed.tags,
      completed: false,
      reminderMinutes: parsed.startTime ? 15 : -1,
      voiceReminder: true,
      version: 1,
      syncStatus: user && cryptoKey ? 'pending' : 'local',
      createdAt: now,
      updatedAt: now,
    };

    const { task: processed, appliedPluginNames } = applyWorkflowPlugins(
      draftTask,
      plugins,
      'on_task_create'
    );

    if (appliedPluginNames.length > 0) {
      showToast(`已新增任務，並觸發插件規則：${appliedPluginNames.join('、')}`);
    } else {
      showToast(`已新增「${processed.title}」`);
    }

    setTasks((prev) => [processed, ...prev]);
    setSelectedDate(processed.dueDate);
    syncSingleItemToCloud('task', processed);
  };

  const handleSaveTaskModal = (
    draft: Omit<TaskItem, 'id' | 'version' | 'syncStatus' | 'createdAt' | 'updatedAt'>,
    existingId?: string
  ) => {
    const now = Date.now();
    if (existingId) {
      let updatedItem: TaskItem | null = null;
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id !== existingId) return t;
          updatedItem = {
            ...t,
            ...draft,
            version: t.version + 1,
            syncStatus: user && cryptoKey ? 'pending' : 'local',
            updatedAt: now,
          };
          return updatedItem;
        })
      );
      if (updatedItem) syncSingleItemToCloud('task', updatedItem);
      showToast('已更新排程項目');
    } else {
      const created: TaskItem = {
        ...draft,
        id: `task-${now}-${Math.random().toString(36).slice(2, 6)}`,
        version: 1,
        syncStatus: user && cryptoKey ? 'pending' : 'local',
        createdAt: now,
        updatedAt: now,
      };
      const { task: processed } = applyWorkflowPlugins(created, plugins, 'on_task_create');
      setTasks((prev) => [processed, ...prev]);
      setSelectedDate(processed.dueDate);
      syncSingleItemToCloud('task', processed);
      showToast(`已建立排程「${processed.title}」`);
    }
    setIsTaskModalOpen(false);
    setEditingTask(null);
  };

  const handleDeleteTask = (id: string) => {
    const now = Date.now();
    let target: TaskItem | null = null;
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        target = { ...t, deleted: true, version: t.version + 1, updatedAt: now };
        return target;
      })
    );
    if (target) syncSingleItemToCloud('task', target);
    setIsTaskModalOpen(false);
    setEditingTask(null);
    showToast('已移除排程項目');
  };

  const handleToggleTask = (id: string) => {
    const now = Date.now();
    let changed: TaskItem | null = null;
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        changed = {
          ...t,
          completed: !t.completed,
          version: t.version + 1,
          syncStatus: user && cryptoKey ? 'pending' : 'local',
          updatedAt: now,
        };
        return changed;
      })
    );
    if (changed) {
      const finalTask: TaskItem = changed;
      syncSingleItemToCloud('task', finalTask);
      if (finalTask.completed) {
        dispatchWebhookIfEnabled('task.completed', { id: finalTask.id, title: finalTask.title });
      }
    }
    setActiveAlerts((prev) => prev.filter((a) => a.taskId !== id));
  };

  const handleRescheduleTask = (taskId: string, newDate: string, newTime?: string) => {
    const now = Date.now();
    let changed: TaskItem | null = null;
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== taskId) return t;
        changed = {
          ...t,
          dueDate: newDate,
          startTime: newTime ?? t.startTime,
          version: t.version + 1,
          updatedAt: now,
        };
        return changed;
      })
    );
    if (changed) syncSingleItemToCloud('task', changed);
    showToast(`已調整排程至 ${newDate}${newTime ? ` ${newTime}` : ''}`);
  };

  const handleImportICSEvents = (events: ImportedICSEvent[]): number => {
    const now = Date.now();
    const newTasks: TaskItem[] = events.map((ev, idx) => ({
      id: `ics-${now}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
      title: ev.title,
      notes: ev.notes,
      dueDate: ev.dueDate,
      startTime: ev.startTime,
      endTime: ev.endTime,
      isMeeting: ev.isMeeting,
      priority: ev.isMeeting ? 'high' : 'medium',
      tags: ev.tags,
      completed: false,
      reminderMinutes: ev.reminderMinutes,
      voiceReminder: true,
      version: 1,
      syncStatus: user && cryptoKey ? 'pending' : 'local',
      createdAt: now,
      updatedAt: now,
    }));
    setTasks((prev) => [...newTasks, ...prev]);
    newTasks.forEach((t) => syncSingleItemToCloud('task', t));
    return newTasks.length;
  };

  // Memo CRUD
  const handleSaveMemo = (
    draft: Omit<MemoItem, 'id' | 'version' | 'syncStatus' | 'createdAt' | 'updatedAt'>,
    existingId?: string
  ) => {
    const now = Date.now();
    if (existingId) {
      let updated: MemoItem | null = null;
      setMemos((prev) =>
        prev.map((m) => {
          if (m.id !== existingId) return m;
          updated = { ...m, ...draft, version: m.version + 1, updatedAt: now };
          return updated;
        })
      );
      if (updated) syncSingleItemToCloud('memo', updated);
    } else {
      const created: MemoItem = {
        ...draft,
        id: `memo-${now}-${Math.random().toString(36).slice(2, 6)}`,
        version: 1,
        syncStatus: user && cryptoKey ? 'pending' : 'local',
        createdAt: now,
        updatedAt: now,
      };
      setMemos((prev) => [created, ...prev]);
      syncSingleItemToCloud('memo', created);
    }
  };

  const handleDeleteMemo = (id: string) => {
    const now = Date.now();
    let deletedMemo: MemoItem | null = null;
    setMemos((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        deletedMemo = { ...m, deleted: true, version: m.version + 1, updatedAt: now };
        return deletedMemo;
      })
    );
    if (deletedMemo) syncSingleItemToCloud('memo', deletedMemo);
    showToast('已刪除加密備忘錄');
  };

  // Business Card CRUD
  const handleSaveCard = (
    draft: Omit<BusinessCardItem, 'id' | 'version' | 'syncStatus' | 'createdAt' | 'updatedAt'>,
    existingId?: string
  ) => {
    const now = Date.now();
    if (existingId) {
      let updated: BusinessCardItem | null = null;
      setBusinessCards((prev) =>
        prev.map((c) => {
          if (c.id !== existingId) return c;
          updated = { ...c, ...draft, version: c.version + 1, updatedAt: now };
          return updated;
        })
      );
      if (updated) syncSingleItemToCloud('card', updated);
      showToast(`已更新「${draft.name}」名片`);
    } else {
      const created: BusinessCardItem = {
        ...draft,
        id: `card-${now}-${Math.random().toString(36).slice(2, 6)}`,
        version: 1,
        syncStatus: user && cryptoKey ? 'pending' : 'local',
        createdAt: now,
        updatedAt: now,
      };
      setBusinessCards((prev) => [created, ...prev]);
      syncSingleItemToCloud('card', created);
      showToast(`已新增「${created.name}」名片`);
    }
  };

  const handleDeleteCard = (id: string) => {
    const now = Date.now();
    let deletedCard: BusinessCardItem | null = null;
    setBusinessCards((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        deletedCard = { ...c, deleted: true, version: c.version + 1, updatedAt: now };
        return deletedCard;
      })
    );
    if (deletedCard) syncSingleItemToCloud('card', deletedCard);
    showToast('已刪除名片');
  };

  // Google Calendar Connection & Sync Handlers
  const handleLoadGoogleCalendarEvents = useCallback(async () => {
    const token = getGoogleCalendarAccessToken();
    if (!token) {
      showToast('請先連結 Google 行事曆');
      return;
    }
    setGoogleCalendarLoading(true);
    try {
      const now = new Date();
      const timeMin = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const timeMax = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59).toISOString();
      const events = await fetchGoogleCalendarEvents(token, timeMin, timeMax);
      setGoogleCalendarEvents(events);
      showToast(`已從 Google 行事曆載入 ${events.length} 筆事件`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : '載入 Google 行事曆失敗');
    } finally {
      setGoogleCalendarLoading(false);
    }
  }, [showToast]);

  const handleConnectGoogleCalendar = async () => {
    setGoogleCalendarLoading(true);
    try {
      const res = await connectGoogleCalendarPopup();
      setGoogleCalendarToken(res.accessToken);
      const now = new Date();
      const timeMin = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const timeMax = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59).toISOString();
      const events = await fetchGoogleCalendarEvents(res.accessToken, timeMin, timeMax);
      setGoogleCalendarEvents(events);
      pushFloatingNotification({
        id: 'google-calendar-connected',
        kind: 'calendar',
        title: '已連結 Google 行事曆',
        body: `成功同步近期 ${events.length} 筆 Google 行事曆事件`,
      });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Google 行事曆授權取消或失敗');
    } finally {
      setGoogleCalendarLoading(false);
    }
  };

  const handleImportGoogleEventsToTasks = (events: GoogleCalendarEventItem[]): number => {
    const existingGoogleIds = new Set(
      tasks.filter((t) => !t.deleted && t.googleEventId).map((t) => t.googleEventId!)
    );
    const now = Date.now();
    const additions: TaskItem[] = [];
    for (const ev of events) {
      if (existingGoogleIds.has(ev.id)) continue;
      additions.push({
        id: `gcal-${now}-${Math.random().toString(36).slice(2, 6)}`,
        title: ev.summary,
        notes: [ev.description, ev.location ? `地點：${ev.location}` : ''].filter(Boolean).join('\n'),
        dueDate: ev.startDate,
        startTime: ev.startTime,
        endTime: ev.endTime,
        isMeeting: Boolean(ev.startTime),
        priority: ev.startTime ? 'high' : 'medium',
        tags: ['Google行事曆'],
        completed: false,
        reminderMinutes: ev.startTime ? 15 : -1,
        voiceReminder: true,
        googleEventId: ev.id,
        version: 1,
        syncStatus: user && cryptoKey ? 'pending' : 'local',
        createdAt: now,
        updatedAt: now,
      });
    }
    if (additions.length > 0) {
      setTasks((prev) => [...additions, ...prev]);
      additions.forEach((t) => syncSingleItemToCloud('task', t));
    }
    return additions.length;
  };

  const handlePushTasksToGoogleCalendar = async (tasksToPush: TaskItem[]): Promise<number> => {
    const token = getGoogleCalendarAccessToken();
    if (!token) {
      showToast('Google 行事曆授權已過期，請重新連結');
      return 0;
    }
    setGoogleCalendarLoading(true);
    let syncedCount = 0;
    const idUpdates = new Map<string, string>();
    try {
      for (const t of tasksToPush) {
        if (t.googleEventId) {
          await updateGoogleCalendarEvent(token, t.googleEventId, t);
          syncedCount += 1;
        } else {
          const created = await createGoogleCalendarEvent(token, t);
          idUpdates.set(t.id, created.id);
          syncedCount += 1;
        }
      }
      if (idUpdates.size > 0) {
        setTasks((prev) =>
          prev.map((t) => {
            const gid = idUpdates.get(t.id);
            if (!gid) return t;
            const updated = { ...t, googleEventId: gid, version: t.version + 1, updatedAt: Date.now() };
            syncSingleItemToCloud('task', updated);
            return updated;
          })
        );
      }
      await handleLoadGoogleCalendarEvents();
    } finally {
      setGoogleCalendarLoading(false);
    }
    return syncedCount;
  };

  const handleDeleteGoogleCalendarEvent = async (eventId: string) => {
    const token = getGoogleCalendarAccessToken();
    if (!token) return;
    setGoogleCalendarLoading(true);
    try {
      await deleteGoogleCalendarEvent(token, eventId);
      setGoogleCalendarEvents((prev) => prev.filter((e) => e.id !== eventId));
      setTasks((prev) =>
        prev.map((t) =>
          t.googleEventId === eventId ? { ...t, googleEventId: undefined, updatedAt: Date.now() } : t
        )
      );
      showToast('已從 Google 行事曆移除該事件');
    } finally {
      setGoogleCalendarLoading(false);
    }
  };

  // Vault & Backup Handlers
  const handleSetupOrUnlockVault = async (passphrase: string): Promise<boolean> => {
    if (vault.initialized && vault.salt && vault.checkCipher && vault.checkIv) {
      const key = await deriveAesKey(passphrase, vault.salt);
      const valid = await verifyVaultCheck(key, vault.checkCipher, vault.checkIv);
      if (!valid) return false;
      setCryptoKey(key);
      setActivePassphrase(passphrase);
      setVault((prev) => ({ ...prev, unlocked: true }));
      return true;
    }

    const salt = generateSaltBase64(16);
    const key = await deriveAesKey(passphrase, salt);
    const { checkCipher, checkIv } = await createVaultCheck(key);
    setCryptoKey(key);
    setActivePassphrase(passphrase);
    setVault({
      initialized: true,
      unlocked: true,
      salt,
      checkCipher,
      checkIv,
    });

    if (user) {
      try {
        await upsertUserVaultMeta(user.uid, {
          vaultSalt: salt,
          vaultCheckCipher: checkCipher,
          vaultCheckIv: checkIv,
          themeMode: theme.mode,
          themeAccent: theme.accent,
        });
        for (const t of tasks) await pushEncryptedSyncItem(user.uid, key, 'task', t);
        for (const m of memos) await pushEncryptedSyncItem(user.uid, key, 'memo', m);
        for (const p of plugins) await pushEncryptedSyncItem(user.uid, key, 'plugin', p);
        for (const c of businessCards) await pushEncryptedSyncItem(user.uid, key, 'card', c);
      } catch {
        // Ignore offline errors
      }
    }
    return true;
  };

  const handleCreateCloudBackup = async (label: string) => {
    if (!user || !activePassphrase) return;
    const payload = { tasks, memos, plugins, businessCards, theme, voice };
    const totalCount =
      tasks.filter((t) => !t.deleted).length +
      memos.filter((m) => !m.deleted).length +
      businessCards.filter((c) => !c.deleted).length;
    const archive = await createEncryptedArchive(activePassphrase, payload, totalCount);
    const backupId = `bkp-${Date.now()}`;
    await createCloudBackupSnapshot(user.uid, {
      id: backupId,
      label,
      itemCount: archive.itemCount,
      ciphertext: archive.ciphertext,
      iv: archive.iv,
      salt: archive.salt,
    });
    const refreshed = await listCloudBackupSnapshots(user.uid);
    setCloudBackups(refreshed);
  };

  const handleRestoreCloudBackup = async (
    backup: CloudBackupRecord,
    passphraseOverride: string
  ): Promise<boolean> => {
    const pwd = passphraseOverride || activePassphrase;
    if (!pwd) return false;
    try {
      const restored = await decryptEncryptedArchive<{
        tasks: TaskItem[];
        memos: MemoItem[];
        plugins: WorkflowPlugin[];
        businessCards?: BusinessCardItem[];
        theme?: ThemeSettings;
        voice?: VoiceSettings;
      }>(pwd, backup);
      if (Array.isArray(restored.tasks)) setTasks(restored.tasks);
      if (Array.isArray(restored.memos)) setMemos(restored.memos);
      if (Array.isArray(restored.plugins)) setPlugins(restored.plugins);
      if (Array.isArray(restored.businessCards)) setBusinessCards(restored.businessCards);
      if (restored.theme) setTheme(restored.theme);
      if (restored.voice) setVoice(restored.voice);
      showToast(`已從雲端備份「${backup.label}」還原所有資料`);
      return true;
    } catch {
      return false;
    }
  };

  const handleExportEncryptedFile = async (passphrase: string) => {
    const payload = { tasks, memos, plugins, businessCards, theme, voice };
    const totalCount =
      tasks.filter((t) => !t.deleted).length +
      memos.filter((m) => !m.deleted).length +
      businessCards.filter((c) => !c.deleted).length;
    const archive = await createEncryptedArchive(passphrase, payload, totalCount);
    const blob = new Blob([JSON.stringify(archive, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kairo-e2ee-backup-${getTodayDateStr()}.kairo.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportEncryptedFile = async (file: File, passphrase: string): Promise<boolean> => {
    try {
      const raw = await file.text();
      const archive = JSON.parse(raw) as EncryptedArchiveFile;
      const restored = await decryptEncryptedArchive<{
        tasks: TaskItem[];
        memos: MemoItem[];
        plugins: WorkflowPlugin[];
        businessCards?: BusinessCardItem[];
        theme?: ThemeSettings;
        voice?: VoiceSettings;
      }>(passphrase, archive);
      if (Array.isArray(restored.tasks)) setTasks(restored.tasks);
      if (Array.isArray(restored.memos)) setMemos(restored.memos);
      if (Array.isArray(restored.plugins)) setPlugins(restored.plugins);
      if (Array.isArray(restored.businessCards)) setBusinessCards(restored.businessCards);
      if (restored.theme) setTheme(restored.theme);
      if (restored.voice) setVoice(restored.voice);
      return true;
    } catch {
      return false;
    }
  };

  const handleSpeakBriefing = () => {
    const script = formatBriefingScript(tasks, selectedDate, Date.now());
    speakText(script, voice);
    const briefPlugin = plugins.find((p) => p.kind === 'briefing');
    if (briefPlugin) logPluginExecution(briefPlugin.id, briefPlugin.name, '已播報每日語音簡報');
    showToast('正在進行每日行程語音簡報');
  };

  const handleSpeakGovStatus = () => {
    if (monitoredTyphoonRegions.length > 0) {
      speakText(
        buildTyphoonVoiceScript(
          monitoredTyphoonRegions,
          govCache.typhoonReport?.updatedAtText || ''
        ),
        voice
      );
      showToast('正在語音播報停班停課最新通報');
      return;
    }
    const baseText = buildTyphoonVoiceScript(
      [],
      govCache.typhoonReport?.updatedAtText || ''
    );
    const holidayExtra = upcomingGovHoliday
      ? ` ${buildHolidayVoiceScript(upcomingGovHoliday)}`
      : '';
    speakText(`${baseText}${holidayExtra}`, voice);
    showToast('正在語音播報人事行政總處公告');
  };

  const handleImportGovHolidaysToTasks = (): number => {
    const todayStr = getTodayDateStr();
    const existingKeys = new Set(
      tasks
        .filter((t) => !t.deleted)
        .map((t) => `${t.dueDate}::${t.title}`)
    );
    const now = Date.now();
    const newTasks: TaskItem[] = [];

    for (const h of govCache.holidays) {
      if (!h.isHoliday || h.date < todayStr) continue;
      const title = `國定假日：${h.name}`;
      if (existingKeys.has(`${h.date}::${title}`)) continue;
      newTasks.push({
        id: `gov-holiday-${h.date}-${Math.random().toString(36).slice(2, 5)}`,
        title,
        notes: '來源：行政院人事行政總處 政府行政機關辦公日曆表',
        dueDate: h.date,
        isMeeting: false,
        priority: 'medium',
        tags: ['國定假日'],
        completed: false,
        reminderMinutes: 0,
        voiceReminder: true,
        version: 1,
        syncStatus: user && cryptoKey ? 'pending' : 'local',
        createdAt: now,
        updatedAt: now,
      });
    }

    if (newTasks.length > 0) {
      setTasks((prev) => [...newTasks, ...prev]);
      newTasks.forEach((t) => syncSingleItemToCloud('task', t));
    }
    return newTasks.length;
  };

  const activeTabMeta = NAV_ITEMS.find((n) => n.id === activeTab)!;

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-zinc-950 text-stone-900 dark:text-zinc-100 flex flex-col lg:flex-row">
      {/* Desktop Left Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-60 lg:shrink-0 border-r border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <div className="h-16 px-6 flex items-center border-b border-stone-200 dark:border-zinc-800">
          <span className="font-display text-lg font-bold tracking-tight text-stone-900 dark:text-zinc-100 whitespace-nowrap">
            Kairo 隨行助理
          </span>
        </div>

        <nav aria-label="主導覽列" className="flex-1 p-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors min-h-[44px] ${
                  active
                    ? 'accent-bg'
                    : 'text-stone-600 dark:text-zinc-400 hover:bg-stone-100 dark:hover:bg-zinc-800 hover:text-stone-900 dark:hover:text-zinc-100'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="whitespace-nowrap">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-stone-200 dark:border-zinc-800 space-y-2.5">
          <button
            type="button"
            onClick={() =>
              setTheme((prev) => ({
                ...prev,
                mode: document.documentElement.classList.contains('dark') ? 'light' : 'dark',
              }))
            }
            className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-zinc-700 text-xs font-medium text-stone-700 dark:text-zinc-300 hover:bg-stone-100 dark:hover:bg-zinc-800 min-h-[42px]"
          >
            <span>切換日 / 夜間外觀</span>
            {theme.mode === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <PWAInstallButton />
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className="flex-1 min-w-0 flex flex-col pb-20 lg:pb-0">
        <OfflineBanner />

        {/* Top Bar Contract: 3 clean zones separated by gap-8 */}
        <header className="sticky top-0 z-30 h-14 lg:h-16 px-4 lg:px-8 border-b border-stone-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md flex items-center justify-between gap-8">
          <div className="min-w-0 flex items-center gap-3">
            <span className="lg:hidden font-display text-base font-bold tracking-tight text-stone-900 dark:text-zinc-100 whitespace-nowrap shrink-0">
              Kairo 助理
            </span>
            <span className="hidden lg:inline text-sm font-medium text-stone-500 dark:text-zinc-400 whitespace-nowrap shrink-0">
              工作區 / {activeTabMeta.label}
            </span>
          </div>

          <div className="hidden md:flex items-center gap-4 text-xs text-stone-500 dark:text-zinc-400 font-mono whitespace-nowrap shrink-0">
            <span>{vault.unlocked ? '端對端加密已解鎖' : '離線安全模式'}</span>
            <span aria-hidden="true">·</span>
            <span>{user ? '雲端已連線' : '本機 IndexedDB'}</span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isSpeaking ? (
              <button
                type="button"
                onClick={() => {
                  stopSpeaking();
                  showToast('已停止語音播報');
                }}
                aria-label="停止語音播報"
                className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 text-white px-3 py-2 text-xs font-medium hover:bg-rose-700 min-h-[40px] whitespace-nowrap shrink-0"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>停止播報</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSpeakBriefing}
                aria-label="語音播報今日簡報"
                className="lg:hidden p-2 rounded-lg text-stone-600 dark:text-zinc-300 hover:bg-stone-100 dark:hover:bg-zinc-800 min-h-[40px] min-w-[40px] flex items-center justify-center"
              >
                <Volume2 className="w-4 h-4 accent-text" />
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setEditingTask(null);
                setIsTaskModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl accent-bg px-3.5 sm:px-4 py-2 text-xs font-medium min-h-[40px] whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>新增排程</span>
            </button>
          </div>
        </header>

        {govSettings.enabled && (
          <GovAlertBanner
            typhoonRegions={monitoredTyphoonRegions}
            typhoonUpdatedAt={govCache.typhoonReport?.updatedAtText || ''}
            upcomingHoliday={upcomingGovHoliday}
            dismissedTyphoon={dismissedTyphoonAlert}
            dismissedHoliday={dismissedHolidayAlert}
            isSpeaking={isSpeaking}
            onSpeakTyphoon={() =>
              speakText(
                buildTyphoonVoiceScript(
                  monitoredTyphoonRegions,
                  govCache.typhoonReport?.updatedAtText || ''
                ),
                voice,
                '颱風假通報'
              )
            }
            onSpeakHoliday={() => {
              if (upcomingGovHoliday) {
                speakText(buildHolidayVoiceScript(upcomingGovHoliday), voice, '國定假日提醒');
              }
            }}
            onStopSpeaking={stopSpeaking}
            onDismissTyphoon={() => setDismissedTyphoonAlert(true)}
            onDismissHoliday={() => setDismissedHolidayAlert(true)}
          />
        )}

        <ReminderBanner
          alerts={activeAlerts}
          isSpeaking={isSpeaking}
          onSpeak={(a) =>
            speakText(
              `提醒您，${a.isMeeting ? '會議' : '任務'}「${a.title}」時間為 ${a.startTime || a.dueDate}`,
              voice,
              a.title
            )
          }
          onStopSpeaking={stopSpeaking}
          onSnooze={(taskId) => {
            snoozedRef.current[taskId] = Date.now() + 10 * 60 * 1000;
            setActiveAlerts((prev) => prev.filter((a) => a.taskId !== taskId));
            showToast('已延後 10 分鐘後再次提醒');
          }}
          onComplete={handleToggleTask}
          onDismiss={(taskId) =>
            setActiveAlerts((prev) => prev.filter((a) => a.taskId !== taskId))
          }
        />

        {toastMessage && (
          <div
            role="status"
            className="mx-4 lg:mx-8 mt-3 rounded-xl border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-2.5 text-xs font-medium text-stone-800 dark:text-zinc-200 shadow-xs"
          >
            {toastMessage}
          </div>
        )}

        <main className="flex-1 p-4 pb-24 lg:p-8 lg:pb-24 max-w-7xl w-full mx-auto">
          {activeTab === 'today' && (
            <TodayScheduleView
              tasks={tasks}
              selectedDate={selectedDate}
              govSettings={govSettings}
              govCache={govCache}
              isSpeaking={isSpeaking}
              onSelectDate={setSelectedDate}
              onQuickAddTask={handleQuickAddTask}
              onToggleTask={handleToggleTask}
              onEditTask={(task) => {
                setEditingTask(task);
                setIsTaskModalOpen(true);
              }}
              onSpeakTask={(task) => {
                speakText(
                  `${task.isMeeting ? '預定會議' : '待辦任務'}：${task.title}。${
                    task.startTime ? `排定時間為 ${task.startTime}。` : ''
                  }${task.notes ? `備註：${task.notes}` : ''}`,
                  voice,
                  task.title
                );
                showToast(`語音提醒播報中：「${task.title}」`);
              }}
              onSpeakBriefing={handleSpeakBriefing}
              onStopSpeaking={() => {
                stopSpeaking();
                showToast('已停止語音播報');
              }}
              onTriggerTodayAutoReminder={() => triggerTodayPendingReminder(true)}
              onOpenNewTaskModal={() => {
                setEditingTask(null);
                setIsTaskModalOpen(true);
              }}
              onJumpToPomodoro={(taskId) => {
                setFocusedTaskId(taskId);
                setActiveTab('plugins');
              }}
              onSyncGovNow={() => {
                syncGovNow();
                showToast('正在更新行政院人事行政總處假日與停班停課狀態');
              }}
              onSpeakGovStatus={handleSpeakGovStatus}
            />
          )}

          {activeTab === 'calendar' && (
            <CalendarSyncView
              tasks={tasks}
              selectedDate={selectedDate}
              govSettings={govSettings}
              govCache={govCache}
              govSyncing={govSyncing}
              isSpeaking={isSpeaking}
              googleCalendarConnected={Boolean(googleCalendarToken)}
              googleCalendarLoading={googleCalendarLoading}
              googleCalendarEvents={googleCalendarEvents}
              onSelectDate={setSelectedDate}
              onEditTask={(task) => {
                setEditingTask(task);
                setIsTaskModalOpen(true);
              }}
              onRescheduleTask={handleRescheduleTask}
              onCreateTaskOnDate={(dateStr) => {
                setSelectedDate(dateStr);
                setEditingTask(null);
                setIsTaskModalOpen(true);
              }}
              onImportICSEvents={handleImportICSEvents}
              onSyncGovNow={syncGovNow}
              onUpdateGovSettings={setGovSettings}
              onImportGovHolidaysToTasks={handleImportGovHolidaysToTasks}
              onSpeakGovStatus={handleSpeakGovStatus}
              onStopSpeaking={() => {
                stopSpeaking();
                showToast('已停止語音播報');
              }}
              onTestFloatingNotification={() => triggerTodayPendingReminder(true)}
              onConnectGoogleCalendar={handleConnectGoogleCalendar}
              onDisconnectGoogleCalendar={() => {
                disconnectGoogleCalendarToken();
                setGoogleCalendarEvents([]);
                showToast('已中斷 Google 行事曆連線');
              }}
              onLoadGoogleCalendarEvents={handleLoadGoogleCalendarEvents}
              onImportGoogleEventsToTasks={handleImportGoogleEventsToTasks}
              onPushTasksToGoogleCalendar={handlePushTasksToGoogleCalendar}
              onDeleteGoogleCalendarEvent={handleDeleteGoogleCalendarEvent}
            />
          )}

          {activeTab === 'memos' && (
            <MemosView
              memos={memos}
              vaultUnlocked={vault.unlocked}
              onSaveMemo={handleSaveMemo}
              onDeleteMemo={handleDeleteMemo}
              onSpeakMemo={(memo) => {
                speakText(`加密備忘錄：${memo.title}。${memo.content}`, voice, memo.title);
                showToast(`正在朗讀備忘錄「${memo.title}」`);
              }}
            />
          )}

          {activeTab === 'cards' && (
            <BusinessCardsView
              cards={businessCards}
              vaultUnlocked={vault.unlocked}
              isSpeaking={isSpeaking}
              onSaveCard={handleSaveCard}
              onDeleteCard={handleDeleteCard}
              onSpeakCard={(card) => {
                speakText(
                  `名片資訊：${card.name}，${card.company || ''} ${card.title || ''}。電話 ${
                    card.phone || '未填寫'
                  }，電子信箱 ${card.email || '未填寫'}。${card.notes ? `備註：${card.notes}` : ''}`,
                  voice,
                  card.name
                );
                showToast(`正在朗讀「${card.name}」名片資訊`);
              }}
              onStopSpeaking={() => {
                stopSpeaking();
                showToast('已停止語音播報');
              }}
            />
          )}

          {activeTab === 'plugins' && (
            <PluginsView
              plugins={plugins}
              tasks={tasks}
              memos={memos}
              selectedDate={selectedDate}
              focusedTaskId={focusedTaskId}
              onSelectFocusTask={setFocusedTaskId}
              onTogglePlugin={(id) => {
                let updated: WorkflowPlugin | null = null;
                setPlugins((prev) =>
                  prev.map((p) => {
                    if (p.id !== id) return p;
                    updated = { ...p, enabled: !p.enabled, updatedAt: Date.now() };
                    return updated;
                  })
                );
                if (updated) syncSingleItemToCloud('plugin', updated);
              }}
              onAddRulePlugin={(draft) => {
                const created: WorkflowPlugin = {
                  ...draft,
                  id: `plugin-rule-${Date.now()}`,
                  runCount: 0,
                  syncStatus: user && cryptoKey ? 'pending' : 'local',
                  updatedAt: Date.now(),
                };
                setPlugins((prev) => [created, ...prev]);
                syncSingleItemToCloud('plugin', created);
                showToast(`已新增工作流規則插件「${created.name}」`);
              }}
              onDeletePlugin={(id) => {
                setPlugins((prev) => prev.filter((p) => p.id !== id));
              }}
              onUpdateWebhookUrl={(id, url) => {
                setPlugins((prev) =>
                  prev.map((p) =>
                    p.id === id ? { ...p, config: { ...p.config, webhookUrl: url }, updatedAt: Date.now() } : p
                  )
                );
              }}
              onSpeakBriefing={handleSpeakBriefing}
              onSpeakNotice={(text) => speakText(text, voice)}
              pluginLogs={pluginLogs}
              onTriggerWebhookTest={async (hook) => {
                if (!hook.config.webhookUrl) return;
                try {
                  await fetch(hook.config.webhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      event: 'kairo.test',
                      date: selectedDate,
                      activeTaskCount: tasks.filter((t) => !t.deleted && !t.completed).length,
                    }),
                  });
                  logPluginExecution(hook.id, hook.name, `測試事件已成功發送至 ${hook.config.webhookUrl}`);
                  showToast('Webhook 測試事件已發送');
                } catch {
                  logPluginExecution(hook.id, hook.name, '發送失敗（請確認端點與 CORS 設定）', 'error');
                  showToast('Webhook 發送紀錄已寫入執行日誌');
                }
              }}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsBackupView
              user={user}
              authLoading={authLoading}
              vault={vault}
              theme={theme}
              voice={voice}
              govSettings={govSettings}
              govSyncing={govSyncing}
              govLastUpdatedText={
                govCache.typhoonReport?.updatedAtText
                  ? `最新更新：${govCache.typhoonReport.updatedAtText}`
                  : govCache.lastHolidaySyncAt
                    ? `上次同步：${new Date(govCache.lastHolidaySyncAt).toLocaleTimeString('zh-TW')}`
                    : '尚未同步'
              }
              isSpeaking={isSpeaking}
              cloudBackups={cloudBackups}
              syncStatusText={
                user
                  ? vault.unlocked
                    ? `已連接帳號 ${user.email} · 端對端加密即時同步啟用中${lastSyncedAt ? ` (上次同步 ${new Date(lastSyncedAt).toLocaleTimeString('zh-TW')})` : ''}`
                    : `已登入 ${user.email}，請輸入上方金鑰密碼以解鎖雲端同步`
                  : '目前為純離線本機儲存模式，登入 Google 帳號即可啟用跨平台加密同步。'
              }
              sampleCipherPreview={sampleCipherPreview}
              onGoogleSignIn={async () => {
                setAuthLoading(true);
                try {
                  await signInWithGoogle();
                  showToast('已登入 Google 帳號');
                } catch {
                  showToast('Google 登入已取消或受阻');
                } finally {
                  setAuthLoading(false);
                }
              }}
              onGoogleSignOut={async () => {
                await signOutGoogle();
                setCryptoKey(null);
                setActivePassphrase(null);
                setGoogleCalendarEvents([]);
                setVault((prev) => ({ ...prev, unlocked: false }));
                showToast('已登出雲端帳號，本機離線資料仍完整保留');
              }}
              onSetupOrUnlockVault={handleSetupOrUnlockVault}
              onLockVault={() => {
                setCryptoKey(null);
                setActivePassphrase(null);
                setVault((prev) => ({ ...prev, unlocked: false }));
              }}
              onCreateCloudBackup={handleCreateCloudBackup}
              onRestoreCloudBackup={handleRestoreCloudBackup}
              onDeleteCloudBackup={async (backupId) => {
                if (!user) return;
                await deleteCloudBackupSnapshot(user.uid, backupId);
                setCloudBackups((prev) => prev.filter((b) => b.id !== backupId));
              }}
              onExportEncryptedFile={handleExportEncryptedFile}
              onImportEncryptedFile={handleImportEncryptedFile}
              onUpdateTheme={(next) => {
                setTheme(next);
                if (user) {
                  updateRemoteThemePrefs(user.uid, next.mode, next.accent).catch(() => {});
                }
              }}
              onUpdateVoice={setVoice}
              onUpdateGovSettings={setGovSettings}
              onSyncGovNow={syncGovNow}
              onTestTyphoonVoice={() => {
                const sampleCity =
                  govSettings.monitoredCity === '全部縣市' ? '臺北市' : govSettings.monitoredCity;
                const script = buildTyphoonVoiceScript(
                  [
                    {
                      region: sampleCity,
                      statusText: '今天停止上班、停止上課（警報測試）',
                      isSuspended: true,
                    },
                  ],
                  '測試模式'
                );
                speakText(script, voice, '颱風假警報測試');
                showToast(`正在播放 ${sampleCity} 颱風假語音警報測試`);
              }}
              onTestVoice={() => {
                speakText(
                  '您好，這是 Kairo 隨行助理語音提醒測試，您的下一場重要會議將於十分鐘後開始。',
                  voice,
                  '語音提醒測試'
                );
                showToast('正在播放語音提醒測試');
              }}
              onStopSpeaking={() => {
                stopSpeaking();
                showToast('已停止語音播報');
              }}
              onTestFloatingNotification={() => {
                triggerTodayPendingReminder(true);
              }}
              onRequestBrowserNotifications={requestSystemNotificationPermission}
            />
          )}
        </main>
      </div>

      {/* Desktop Bottom-Right & Mobile Top-Bar Floating Notifications */}
      <FloatingNotificationStack
        notifications={floatingNotifications}
        isSpeaking={isSpeaking}
        onSpeak={(text, label) => speakText(text, voice, label)}
        onStopSpeaking={() => {
          stopSpeaking();
          showToast('已停止語音播報');
        }}
        onDismiss={(id) =>
          setFloatingNotifications((prev) => prev.filter((n) => n.id !== id))
        }
      />

      {/* Mobile Bottom Thumb-Zone Navigation Bar (64px <= 15% cap) */}
      <nav
        aria-label="行動端底部導覽列"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 h-16 pb-safe bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border-t border-stone-200 dark:border-zinc-800 grid grid-cols-6 items-center"
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center justify-center h-full min-h-[44px] transition-colors ${
                active ? 'accent-text font-semibold' : 'text-stone-500 dark:text-zinc-400'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] mt-1 tracking-tight whitespace-nowrap">
                {item.mobileLabel}
              </span>
            </button>
          );
        })}
      </nav>

      {isTaskModalOpen && (
        <TaskModal
          initialTask={editingTask}
          defaultDate={selectedDate}
          onSave={handleSaveTaskModal}
          onDelete={handleDeleteTask}
          onClose={() => {
            setIsTaskModalOpen(false);
            setEditingTask(null);
          }}
        />
      )}
    </div>
  );
}
