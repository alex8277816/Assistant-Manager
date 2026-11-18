import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar,
  CheckSquare,
  FileText,
  Link2,
  Moon,
  Plus,
  Puzzle,
  Settings,
  Square,
  Sun,
  Users,
  Volume2,
  X,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import {
  type ActiveReminderAlert,
  type BusinessCardItem,
  type CloudBackupRecord,
  type FloatingNotificationItem,
  type GovSettings,
  type GovSyncCache,
  type MainTab,
  type MemoItem,
  type PluginLogEntry,
  type QuickLinkItem,
  type TaskItem,
  type ThemeSettings,
  type VaultState,
  type VoiceSettings,
  type WorkflowPlugin,
} from './types/assistant';
import {
  clearSessionCryptoKey,
  createSeedWorkspace,
  getTodayDateStr,
  loadSessionCryptoKey,
  loadWorkspaceFromOffline,
  saveSessionCryptoKey,
  saveWorkspaceToOffline,
} from './services/offlineStore';
import {
  clearSyncRuntimeCaches,
  connectWithSyncSerial,
  createCloudBackupSnapshot,
  deleteCloudBackupSnapshot,
  ensureFirestoreOnline,
  fetchRemoteEncryptedItems,
  fetchUserVaultMeta,
  listCloudBackupSnapshots,
  pushEncryptedSyncItem,
  registerSyncAccount,
  signInSyncAccount,
  signOutSyncSession,
  subscribeAuth,
  subscribeEncryptedSyncItems,
  subscribeUserVaultMeta,
  testFirestoreConnection,
  updateRemoteThemePrefs,
  upsertUserVaultMeta,
  type SyncBatchDiagnostics,
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
  createEncryptedArchive,
  createVaultCheck,
  decodeEncryptedSyncCode,
  decryptEncryptedArchive,
  deriveAesKey,
  encodeEncryptedSyncCode,
  encryptText,
  generateSaltBase64,
  verifyVaultCheck,
  type EncryptedArchiveFile,
} from './utils/cryptoVault';
import { parseQuickTaskInput } from './utils/smartEngine';
import { findItemsNeedingPush, mergeSyncedCollection } from './utils/syncMerge';
import { buildNewBusinessCard, type BusinessCardDraft } from './utils/cardHelpers';
import { buildQuickLinkItem } from './utils/quickLinks';
import {
  formatFirestoreSyncError,
  isOfflineSyncError,
  loadSyncIdentityHint,
  resolveSyncIdentityLabel,
  type SyncIdentityHint,
} from './utils/syncAuth';
import { parseSerialPairingHash, type ParsedPairingLink } from './utils/pairingLink';
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
import { SidebarQuickLinks } from './components/SidebarQuickLinks';
import { TodayScheduleView } from './components/TodayScheduleView';
import { CalendarSyncView } from './components/CalendarSyncView';
import { MemosView } from './components/MemosView';
import { PluginsView } from './components/PluginsView';
import { SettingsBackupView } from './components/SettingsBackupView';
import { TaskModal } from './components/TaskModal';

function nextItemVersion(current: unknown): number {
  return (typeof current === 'number' && Number.isFinite(current) ? current : 1) + 1;
}

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
  const [quickLinks, setQuickLinks] = useState<QuickLinkItem[]>(
    initialSeed.quickLinks || []
  );
  const [isMobileLinksOpen, setIsMobileLinksOpen] = useState(false);
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
  const [syncingNow, setSyncingNow] = useState(false);

  const tabIdRef = useRef<string>(`tab-${Math.random().toString(36).slice(2, 10)}`);
  const suppressBroadcastRef = useRef(false);
  const remoteSnapshotRef = useRef<{
    tasks: TaskItem[];
    memos: MemoItem[];
    plugins: WorkflowPlugin[];
    cards: BusinessCardItem[];
    links: QuickLinkItem[];
  }>({ tasks: [], memos: [], plugins: [], cards: [], links: [] });
  const latestCollectionsRef = useRef({
    tasks,
    memos,
    plugins,
    businessCards,
    quickLinks,
  });
  latestCollectionsRef.current = { tasks, memos, plugins, businessCards, quickLinks };

  // Runtime non-persisted state
  const [cryptoKey, setCryptoKey] = useState<CryptoKey | null>(null);
  const [activePassphrase, setActivePassphrase] = useState<string | null>(null);
  const [sampleCipherPreview, setSampleCipherPreview] = useState<{ ciphertext: string; iv: string } | null>(null);

  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [syncIdentityHint, setSyncIdentityHint] = useState<SyncIdentityHint | null>(() =>
    loadSyncIdentityHint()
  );
  const [activeSyncSerial, setActiveSyncSerial] = useState<string | null>(
    () => loadSyncIdentityHint()?.serial ?? null
  );
  const [pairedPrefill, setPairedPrefill] = useState<ParsedPairingLink | null>(null);
  const autoPairAttemptedRef = useRef(false);
  const remoteSyncedOnceRef = useRef(false);
  const remoteMetaExistsRef = useRef(false);
  const inFlightFlushRef = useRef<Promise<number> | null>(null);
  const vaultRef = useRef(vault);
  vaultRef.current = vault;
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const [syncDiagnostics, setSyncDiagnostics] = useState<
    SyncBatchDiagnostics & { lastError: string | null }
  >({
    remoteTotalDocs: 0,
    decryptedCount: 0,
    skippedDecryptCount: 0,
    lastError: null,
  });
  const [cloudBackups, setCloudBackups] = useState<CloudBackupRecord[]>([]);
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
      setQuickLinks(ws.quickLinks || []);
      setTheme(ws.theme);
      setVoice(ws.voice);
      setVault((prev) => ({
        ...ws.vault,
        unlocked: prev.unlocked,
      }));
      if (ws.govSettings) setGovSettings(ws.govSettings);
      if (ws.govCache) setGovCache(ws.govCache);
      setLastSyncedAt(ws.lastSyncedAt);
      setLoaded(true);
    });

    const consumePairingHash = () => {
      if (typeof window === 'undefined' || !window.location.hash) return;
      const parsedPair = parseSerialPairingHash(window.location.hash);
      if (parsedPair) {
        autoPairAttemptedRef.current = false;
        setPairedPrefill({ ...parsedPair });
        setActiveTab('settings');
        window.history.replaceState(
          null,
          '',
          `${window.location.pathname}${window.location.search}`
        );
      }
    };
    consumePairingHash();
    window.addEventListener('hashchange', consumePairingHash);
    testFirestoreConnection()
      .then((ok) => {
        if (!ok) {
          setSyncDiagnostics((prev) => ({
            ...prev,
            lastError: 'Firestore 連線異常，請確認網路連線或 Firebase 專案設定。',
          }));
        }
      })
      .catch(() => {});
    const unsubSpeak = subscribeSpeakingState((s) => setIsSpeaking(s.isSpeaking));

    // Same-device cross-tab / installed PWA window sync via BroadcastChannel
    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel('kairo-workspace-sync');
      channel.onmessage = (event) => {
        if (!event.data || event.data.senderId === tabIdRef.current) return;
        loadWorkspaceFromOffline().then((ws) => {
          suppressBroadcastRef.current = true;
          setTasks(ws.tasks);
          setMemos(ws.memos);
          setPlugins(ws.plugins);
          setBusinessCards(ws.businessCards || []);
          setQuickLinks(ws.quickLinks || []);
          setTheme(ws.theme);
          setVoice(ws.voice);
          if (ws.govSettings) setGovSettings(ws.govSettings);
          if (ws.govCache) setGovCache(ws.govCache);
          setLastSyncedAt(ws.lastSyncedAt);
        }).catch(() => {});
      };
    }

    return () => {
      active = false;
      window.removeEventListener('hashchange', consumePairingHash);
      unsubSpeak();
      channel?.close();
    };
  }, []);

  // 2. Persist workspace to IndexedDB whenever state changes
  useEffect(() => {
    if (!loaded) return;
    const shouldBroadcast = !suppressBroadcastRef.current;
    suppressBroadcastRef.current = false;
    saveWorkspaceToOffline({
      tasks,
      memos,
      plugins,
      businessCards,
      quickLinks,
      theme,
      voice,
      vault: { ...vault, unlocked: false },
      govSettings,
      govCache,
      lastSyncedAt,
    })
      .then(() => {
        if (shouldBroadcast && typeof BroadcastChannel !== 'undefined') {
          const bc = new BroadcastChannel('kairo-workspace-sync');
          bc.postMessage({ senderId: tabIdRef.current, updatedAt: Date.now() });
          bc.close();
        }
      })
      .catch(() => {});
  }, [loaded, tasks, memos, plugins, businessCards, quickLinks, theme, voice, vault, govSettings, govCache, lastSyncedAt]);

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

  // 5. Subscribe Firebase Auth state and restore cached non-extractable session CryptoKey if valid
  useEffect(() => {
    const unsub = subscribeAuth(async (nextUser) => {
      setUser(nextUser);
      if (nextUser) {
        let checkCipher = vaultRef.current.checkCipher;
        let checkIv = vaultRef.current.checkIv;
        try {
          const remoteMeta = await fetchUserVaultMeta(nextUser.uid);
          if (remoteMeta) {
            remoteMetaExistsRef.current = true;
            checkCipher = remoteMeta.vaultCheckCipher;
            checkIv = remoteMeta.vaultCheckIv;
            setVault((prev) => ({
              ...prev,
              initialized: true,
              salt: remoteMeta.vaultSalt,
              checkCipher: remoteMeta.vaultCheckCipher,
              checkIv: remoteMeta.vaultCheckIv,
            }));
            if (remoteMeta.themeMode && remoteMeta.themeAccent) {
              setTheme((prev) =>
                prev.mode === remoteMeta.themeMode && prev.accent === remoteMeta.themeAccent
                  ? prev
                  : { mode: remoteMeta.themeMode, accent: remoteMeta.themeAccent }
              );
            }
          }
          const backups = await listCloudBackupSnapshots(nextUser.uid);
          setCloudBackups(backups);
        } catch {
          // Offline or unverified; stay gracefully in local-first mode
        }

        // Auto-restore non-extractable session CryptoKey across page reloads
        if (checkCipher && checkIv) {
          try {
            const cachedKey = await loadSessionCryptoKey(nextUser.uid);
            if (cachedKey) {
              const valid = await verifyVaultCheck(cachedKey, checkCipher, checkIv);
              if (valid) {
                setCryptoKey(cachedKey);
                setVault((prev) => ({ ...prev, initialized: true, unlocked: true }));
              }
            }
          } catch {
            // Keep locked if key check fails
          }
        }
      } else {
        remoteMetaExistsRef.current = false;
        setCloudBackups([]);
      }
    });
    return () => unsub();
  }, []);

  // 5b. Subscribe real-time remote user theme & vault metadata across devices
  useEffect(() => {
    if (!user) return;
    return subscribeUserVaultMeta(user.uid, (remoteMeta) => {
      remoteMetaExistsRef.current = true;
      setVault((prev) => ({
        ...prev,
        initialized: true,
        salt: remoteMeta.vaultSalt,
        checkCipher: remoteMeta.vaultCheckCipher,
        checkIv: remoteMeta.vaultCheckIv,
      }));
      if (remoteMeta.themeMode && remoteMeta.themeAccent) {
        setTheme((prev) =>
          prev.mode === remoteMeta.themeMode && prev.accent === remoteMeta.themeAccent
            ? prev
            : { mode: remoteMeta.themeMode, accent: remoteMeta.themeAccent }
        );
      }
    });
  }, [user]);

  const flushPendingItemsToCloud = useCallback(
    async (
      targetUser: User,
      targetKey: CryptoKey,
      overrideSnapshot?: {
        tasks?: TaskItem[];
        memos?: MemoItem[];
        plugins?: WorkflowPlugin[];
        cards?: BusinessCardItem[];
        links?: QuickLinkItem[];
      }
    ): Promise<number> => {
      if (inFlightFlushRef.current && !overrideSnapshot) {
        return inFlightFlushRef.current;
      }

      const runFlush = async (): Promise<number> => {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          return 0;
        }

        const currentVault = vaultRef.current;
        const currentTheme = themeRef.current;
        if (
          !remoteMetaExistsRef.current &&
          currentVault.initialized &&
          currentVault.salt &&
          currentVault.checkCipher &&
          currentVault.checkIv
        ) {
          try {
            await upsertUserVaultMeta(
              targetUser.uid,
              {
                vaultSalt: currentVault.salt,
                vaultCheckCipher: currentVault.checkCipher,
                vaultCheckIv: currentVault.checkIv,
                themeMode: currentTheme.mode,
                themeAccent: currentTheme.accent,
              },
              false
            );
            remoteMetaExistsRef.current = true;
          } catch (err) {
            setSyncDiagnostics((prev) => ({
              ...prev,
              lastError: formatFirestoreSyncError(err, '雲端初始化寫入失敗'),
            }));
            throw err;
          }
        }

        let current = latestCollectionsRef.current;

        if (!remoteSyncedOnceRef.current) {
          try {
            const { batch, diagnostics } = await fetchRemoteEncryptedItems(targetUser.uid, targetKey);
            remoteSnapshotRef.current = batch;
            remoteSyncedOnceRef.current = true;
            setSyncDiagnostics({ ...diagnostics, lastError: null });

            const mergedTasks = mergeSyncedCollection(overrideSnapshot?.tasks ?? current.tasks, batch.tasks);
            const mergedMemos = mergeSyncedCollection(overrideSnapshot?.memos ?? current.memos, batch.memos);
            const mergedPlugins = mergeSyncedCollection(overrideSnapshot?.plugins ?? current.plugins, batch.plugins);
            const mergedCards = mergeSyncedCollection(overrideSnapshot?.cards ?? current.businessCards, batch.cards);
            const mergedLinks = mergeSyncedCollection(overrideSnapshot?.links ?? current.quickLinks, batch.links);
            setTasks(mergedTasks);
            setMemos(mergedMemos);
            setPlugins(mergedPlugins);
            setBusinessCards(mergedCards);
            setQuickLinks(mergedLinks);
            current = {
              tasks: mergedTasks,
              memos: mergedMemos,
              plugins: mergedPlugins,
              businessCards: mergedCards,
              quickLinks: mergedLinks,
            };
          } catch (err) {
            setSyncDiagnostics((prev) => ({
              ...prev,
              lastError: formatFirestoreSyncError(err, '無法讀取雲端資料'),
            }));
          }
        }

        const remote = remoteSnapshotRef.current;
        const pushTasks = findItemsNeedingPush(overrideSnapshot?.tasks ?? current.tasks, remote.tasks);
        const pushMemos = findItemsNeedingPush(overrideSnapshot?.memos ?? current.memos, remote.memos);
        const pushPlugins = findItemsNeedingPush(overrideSnapshot?.plugins ?? current.plugins, remote.plugins);
        const pushCards = findItemsNeedingPush(overrideSnapshot?.cards ?? current.businessCards, remote.cards);
        const pushLinks = findItemsNeedingPush(overrideSnapshot?.links ?? current.quickLinks, remote.links);

        const remoteTaskMap = new Map(remote.tasks.map((t) => [t.id, t]));
        const remoteMemoMap = new Map(remote.memos.map((m) => [m.id, m]));
        const remotePluginMap = new Map(remote.plugins.map((p) => [p.id, p]));
        const remoteCardMap = new Map(remote.cards.map((c) => [c.id, c]));
        const remoteLinkMap = new Map(remote.links.map((l) => [l.id, l]));

        const totalToPush =
          pushTasks.length +
          pushMemos.length +
          pushPlugins.length +
          pushCards.length +
          pushLinks.length;
        if (totalToPush === 0) return 0;

        const pushedTaskAt = new Map<string, number>();
        const pushedMemoAt = new Map<string, number>();
        const pushedPluginAt = new Map<string, number>();
        const pushedCardAt = new Map<string, number>();
        const pushedLinkAt = new Map<string, number>();

        setSyncingNow(true);
        try {
          for (const t of pushTasks) {
            const r = remoteTaskMap.get(t.id);
            await pushEncryptedSyncItem(targetUser.uid, targetKey, 'task', t, {
              knownRemoteExists: Boolean(r),
              knownRemoteVersion: r?.version,
            });
            pushedTaskAt.set(t.id, t.updatedAt);
            remoteTaskMap.set(t.id, { ...t, syncStatus: 'synced' });
          }
          for (const m of pushMemos) {
            const r = remoteMemoMap.get(m.id);
            await pushEncryptedSyncItem(targetUser.uid, targetKey, 'memo', m, {
              knownRemoteExists: Boolean(r),
              knownRemoteVersion: r?.version,
            });
            pushedMemoAt.set(m.id, m.updatedAt);
            remoteMemoMap.set(m.id, { ...m, syncStatus: 'synced' });
          }
          for (const p of pushPlugins) {
            const r = remotePluginMap.get(p.id);
            await pushEncryptedSyncItem(targetUser.uid, targetKey, 'plugin', p, {
              knownRemoteExists: Boolean(r),
              knownRemoteVersion: typeof r?.version === 'number' ? r.version : undefined,
            });
            pushedPluginAt.set(p.id, p.updatedAt);
            remotePluginMap.set(p.id, { ...p, syncStatus: 'synced' });
          }
          for (const c of pushCards) {
            const r = remoteCardMap.get(c.id);
            await pushEncryptedSyncItem(targetUser.uid, targetKey, 'card', c, {
              knownRemoteExists: Boolean(r),
              knownRemoteVersion: r?.version,
            });
            pushedCardAt.set(c.id, c.updatedAt);
            remoteCardMap.set(c.id, { ...c, syncStatus: 'synced' });
          }
          for (const l of pushLinks) {
            const r = remoteLinkMap.get(l.id);
            await pushEncryptedSyncItem(targetUser.uid, targetKey, 'link', l, {
              knownRemoteExists: Boolean(r),
              knownRemoteVersion: r?.version,
            });
            pushedLinkAt.set(l.id, l.updatedAt);
            remoteLinkMap.set(l.id, { ...l, syncStatus: 'synced' });
          }

          setLastSyncedAt(Date.now());
          setSyncDiagnostics((prev) => ({ ...prev, lastError: null }));
          return (
            pushedTaskAt.size +
            pushedMemoAt.size +
            pushedPluginAt.size +
            pushedCardAt.size +
            pushedLinkAt.size
          );
        } catch (err) {
          setSyncDiagnostics((prev) => ({
            ...prev,
            lastError: formatFirestoreSyncError(err, '上傳同步失敗'),
          }));
          throw err;
        } finally {
          remoteSnapshotRef.current = {
            tasks: Array.from(remoteTaskMap.values()),
            memos: Array.from(remoteMemoMap.values()),
            plugins: Array.from(remotePluginMap.values()),
            cards: Array.from(remoteCardMap.values()),
            links: Array.from(remoteLinkMap.values()),
          };
          if (pushedTaskAt.size > 0) {
            setTasks((prev) =>
              prev.map((t) =>
                pushedTaskAt.get(t.id) === t.updatedAt ? { ...t, syncStatus: 'synced' } : t
              )
            );
          }
          if (pushedMemoAt.size > 0) {
            setMemos((prev) =>
              prev.map((m) =>
                pushedMemoAt.get(m.id) === m.updatedAt ? { ...m, syncStatus: 'synced' } : m
              )
            );
          }
          if (pushedPluginAt.size > 0) {
            setPlugins((prev) =>
              prev.map((p) =>
                pushedPluginAt.get(p.id) === p.updatedAt ? { ...p, syncStatus: 'synced' } : p
              )
            );
          }
          if (pushedCardAt.size > 0) {
            setBusinessCards((prev) =>
              prev.map((c) =>
                pushedCardAt.get(c.id) === c.updatedAt ? { ...c, syncStatus: 'synced' } : c
              )
            );
          }
          if (pushedLinkAt.size > 0) {
            setQuickLinks((prev) =>
              prev.map((l) =>
                pushedLinkAt.get(l.id) === l.updatedAt ? { ...l, syncStatus: 'synced' } : l
              )
            );
          }
          setSyncingNow(false);
        }
      };

      const promise = runFlush().finally(() => {
        if (inFlightFlushRef.current === promise) {
          inFlightFlushRef.current = null;
        }
      });
      inFlightFlushRef.current = promise;
      return promise;
    },
    []
  );

  // 6. Subscribe E2EE Firestore Sync when authenticated AND vault unlocked
  useEffect(() => {
    if (!user || !cryptoKey) return;
    remoteSyncedOnceRef.current = false;
    const unsub = subscribeEncryptedSyncItems(
      user.uid,
      cryptoKey,
      (batch, diagnostics) => {
        remoteSnapshotRef.current = batch;
        remoteSyncedOnceRef.current = true;
        setSyncDiagnostics({ ...diagnostics, lastError: null });
        const current = latestCollectionsRef.current;

        setTasks((prev) => mergeSyncedCollection(prev, batch.tasks));
        setMemos((prev) => mergeSyncedCollection(prev, batch.memos));
        setPlugins((prev) => mergeSyncedCollection(prev, batch.plugins));
        setBusinessCards((prev) => mergeSyncedCollection(prev, batch.cards));
        setQuickLinks((prev) => mergeSyncedCollection(prev, batch.links));
        setLastSyncedAt(Date.now());

        // Automatically push any local offline edits or new items not yet on remote
        const pendingTasks = findItemsNeedingPush(current.tasks, batch.tasks);
        const pendingMemos = findItemsNeedingPush(current.memos, batch.memos);
        const pendingPlugins = findItemsNeedingPush(current.plugins, batch.plugins);
        const pendingCards = findItemsNeedingPush(current.businessCards, batch.cards);
        const pendingLinks = findItemsNeedingPush(current.quickLinks, batch.links);
        if (
          pendingTasks.length +
            pendingMemos.length +
            pendingPlugins.length +
            pendingCards.length +
            pendingLinks.length >
          0
        ) {
          flushPendingItemsToCloud(user, cryptoKey).catch(() => {});
        }
      },
      (err) => {
        setSyncDiagnostics((prev) => ({
          ...prev,
          lastError: formatFirestoreSyncError(err, '雲端即時監聽發生錯誤'),
        }));
      }
    );

    const handleOnlineResume = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      ensureFirestoreOnline(true)
        .then(() => flushPendingItemsToCloud(user, cryptoKey))
        .catch(() => {});
    };
    const handleVisibilityResume = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      ensureFirestoreOnline(false)
        .then(() => flushPendingItemsToCloud(user, cryptoKey))
        .catch(() => {});
    };
    window.addEventListener('online', handleOnlineResume);
    document.addEventListener('visibilitychange', handleVisibilityResume);

    const retryTimer = window.setInterval(() => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      const col = latestCollectionsRef.current;
      const hasPending =
        col.tasks.some((t) => t.syncStatus === 'pending') ||
        col.memos.some((m) => m.syncStatus === 'pending') ||
        col.plugins.some((p) => p.syncStatus === 'pending') ||
        col.businessCards.some((c) => c.syncStatus === 'pending') ||
        col.quickLinks.some((l) => l.syncStatus === 'pending');
      if (hasPending) {
        flushPendingItemsToCloud(user, cryptoKey).catch(() => {});
      }
    }, 8000);

    return () => {
      unsub();
      window.removeEventListener('online', handleOnlineResume);
      document.removeEventListener('visibilitychange', handleVisibilityResume);
      window.clearInterval(retryTimer);
    };
  }, [user, cryptoKey, flushPendingItemsToCloud]);

  const syncSingleItemToCloud = useCallback(
    async (
      kind: 'task' | 'memo' | 'plugin' | 'card' | 'link',
      item: TaskItem | MemoItem | WorkflowPlugin | BusinessCardItem | QuickLinkItem
    ) => {
      if (!user || !cryptoKey) return;
      const remoteSnap = remoteSnapshotRef.current;
      const existingRemote =
        kind === 'task'
          ? remoteSnap.tasks.find((t) => t.id === item.id)
          : kind === 'memo'
            ? remoteSnap.memos.find((m) => m.id === item.id)
            : kind === 'plugin'
              ? remoteSnap.plugins.find((p) => p.id === item.id)
              : kind === 'card'
                ? remoteSnap.cards.find((c) => c.id === item.id)
                : remoteSnap.links.find((l) => l.id === item.id);
      try {
        await pushEncryptedSyncItem(user.uid, cryptoKey, kind, item, {
          knownRemoteExists: Boolean(existingRemote),
          knownRemoteVersion:
            existingRemote && typeof existingRemote.version === 'number'
              ? existingRemote.version
              : undefined,
        });
        if (kind === 'task') {
          const syncedTask = { ...(item as TaskItem), syncStatus: 'synced' as const };
          remoteSnapshotRef.current = {
            ...remoteSnapshotRef.current,
            tasks: [
              ...remoteSnapshotRef.current.tasks.filter((t) => t.id !== item.id),
              syncedTask,
            ],
          };
          setTasks((prev) =>
            prev.map((t) => (t.id === item.id && t.updatedAt === item.updatedAt ? { ...t, syncStatus: 'synced' } : t))
          );
        } else if (kind === 'memo') {
          const syncedMemo = { ...(item as MemoItem), syncStatus: 'synced' as const };
          remoteSnapshotRef.current = {
            ...remoteSnapshotRef.current,
            memos: [
              ...remoteSnapshotRef.current.memos.filter((m) => m.id !== item.id),
              syncedMemo,
            ],
          };
          setMemos((prev) =>
            prev.map((m) => (m.id === item.id && m.updatedAt === item.updatedAt ? { ...m, syncStatus: 'synced' } : m))
          );
        } else if (kind === 'plugin') {
          const syncedPlugin = { ...(item as WorkflowPlugin), syncStatus: 'synced' as const };
          remoteSnapshotRef.current = {
            ...remoteSnapshotRef.current,
            plugins: [
              ...remoteSnapshotRef.current.plugins.filter((p) => p.id !== item.id),
              syncedPlugin,
            ],
          };
          setPlugins((prev) =>
            prev.map((p) => (p.id === item.id && p.updatedAt === item.updatedAt ? { ...p, syncStatus: 'synced' } : p))
          );
        } else if (kind === 'card') {
          const syncedCard = { ...(item as BusinessCardItem), syncStatus: 'synced' as const };
          remoteSnapshotRef.current = {
            ...remoteSnapshotRef.current,
            cards: [
              ...remoteSnapshotRef.current.cards.filter((c) => c.id !== item.id),
              syncedCard,
            ],
          };
          setBusinessCards((prev) =>
            prev.map((c) => (c.id === item.id && c.updatedAt === item.updatedAt ? { ...c, syncStatus: 'synced' } : c))
          );
        } else if (kind === 'link') {
          const syncedLink = { ...(item as QuickLinkItem), syncStatus: 'synced' as const };
          remoteSnapshotRef.current = {
            ...remoteSnapshotRef.current,
            links: [
              ...remoteSnapshotRef.current.links.filter((l) => l.id !== item.id),
              syncedLink,
            ],
          };
          setQuickLinks((prev) =>
            prev.map((l) => (l.id === item.id && l.updatedAt === item.updatedAt ? { ...l, syncStatus: 'synced' } : l))
          );
        }
        setLastSyncedAt(Date.now());
        setSyncDiagnostics((prev) => (prev.lastError ? { ...prev, lastError: null } : prev));
      } catch (err) {
        const msg = formatFirestoreSyncError(err, '雲端寫入失敗');
        setSyncDiagnostics((prev) => ({ ...prev, lastError: msg }));
        showToast(
          isOfflineSyncError(err)
            ? '目前離線，資料已安全暫存於本機，連線後自動同步'
            : '資料已暫存於本機，雲端同步寫入失敗，請至「備份與主題」檢查連線'
        );
      }
    },
    [user, cryptoKey, showToast]
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
          triggeredKeysRef.current.add(alert.triggerKey || buildReminderTriggerKey(task));
          const labelSuffix = alert.reminderLabel ? `（${alert.reminderLabel}）` : '';
          if (voice.autoSpeakReminders && task.voiceReminder) {
            speakText(
              `${task.isMeeting ? '會議提醒' : '任務提醒'}${labelSuffix}：${task.title}，預定時間 ${task.startTime || ''}`,
              voice,
              task.title
            );
          }
          pushFloatingNotification({
            id: `due-${alert.triggerKey || task.id}`,
            kind: task.isMeeting ? 'meeting' : 'todo',
            title: task.title,
            body: `${task.dueDate} ${task.startTime || ''} · ${alert.reminderLabel || (task.isMeeting ? '預定會議提醒' : '任務提醒')}`,
            voiceText: `${task.isMeeting ? '會議提醒' : '任務提醒'}${labelSuffix}：${task.title}，預定時間 ${task.startTime || ''}`,
          });
        }
      });

      setActiveAlerts((prev) => {
        const existingKeys = new Set(prev.map((a) => a.triggerKey || a.taskId));
        return [
          ...prev,
          ...due.filter((d) => !existingKeys.has(d.triggerKey || d.taskId)),
        ];
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
      syncStatus: user ? 'pending' : 'local',
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
      const existing = latestCollectionsRef.current.tasks.find((t) => t.id === existingId);
      const updatedItem: TaskItem | null = existing
        ? {
            ...existing,
            ...draft,
            version: nextItemVersion(existing.version),
            syncStatus: user ? 'pending' : 'local',
            updatedAt: now,
          }
        : null;
      setTasks((prev) =>
        prev.map((t) => (t.id === existingId && updatedItem ? updatedItem : t))
      );
      if (updatedItem) syncSingleItemToCloud('task', updatedItem);
      showToast('已更新排程項目');
    } else {
      const created: TaskItem = {
        ...draft,
        id: `task-${now}-${Math.random().toString(36).slice(2, 6)}`,
        version: 1,
        syncStatus: user ? 'pending' : 'local',
        createdAt: now,
        updatedAt: now,
      };
      const { task: pluginTagged } = applyWorkflowPlugins(created, plugins, 'on_task_create');
      const processed: TaskItem = {
        ...pluginTagged,
        priority: created.priority,
        reminderMinutes: created.reminderMinutes,
        voiceReminder: created.voiceReminder,
      };
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
    const existing = latestCollectionsRef.current.tasks.find((t) => t.id === id);
    const target: TaskItem | null = existing
      ? {
          ...existing,
          deleted: true,
          version: nextItemVersion(existing.version),
          syncStatus: user ? 'pending' : 'local',
          updatedAt: now,
        }
      : null;
    setTasks((prev) => prev.map((t) => (t.id === id && target ? target : t)));
    if (target) syncSingleItemToCloud('task', target);
    setIsTaskModalOpen(false);
    setEditingTask(null);
    showToast('已移除排程項目');
  };

  const handleToggleTask = (id: string) => {
    const now = Date.now();
    const existing = latestCollectionsRef.current.tasks.find((t) => t.id === id);
    const changed: TaskItem | null = existing
      ? {
          ...existing,
          completed: !existing.completed,
          version: nextItemVersion(existing.version),
          syncStatus: user ? 'pending' : 'local',
          updatedAt: now,
        }
      : null;
    setTasks((prev) => prev.map((t) => (t.id === id && changed ? changed : t)));
    if (changed) {
      syncSingleItemToCloud('task', changed);
      if (changed.completed) {
        dispatchWebhookIfEnabled('task.completed', { id: changed.id, title: changed.title });
      }
    }
    setActiveAlerts((prev) => prev.filter((a) => a.taskId !== id));
  };

  const handleRescheduleTask = (taskId: string, newDate: string, newTime?: string) => {
    const now = Date.now();
    const existing = latestCollectionsRef.current.tasks.find((t) => t.id === taskId);
    const changed: TaskItem | null = existing
      ? {
          ...existing,
          dueDate: newDate,
          startTime: newTime ?? existing.startTime,
          version: nextItemVersion(existing.version),
          syncStatus: user ? 'pending' : 'local',
          updatedAt: now,
        }
      : null;
    setTasks((prev) => prev.map((t) => (t.id === taskId && changed ? changed : t)));
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
      syncStatus: user ? 'pending' : 'local',
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
      const existing = latestCollectionsRef.current.memos.find((m) => m.id === existingId);
      const updated: MemoItem | null = existing
        ? {
            ...existing,
            ...draft,
            version: nextItemVersion(existing.version),
            syncStatus: user ? 'pending' : 'local',
            updatedAt: now,
          }
        : null;
      setMemos((prev) => prev.map((m) => (m.id === existingId && updated ? updated : m)));
      if (updated) syncSingleItemToCloud('memo', updated);
    } else {
      const created: MemoItem = {
        ...draft,
        id: `memo-${now}-${Math.random().toString(36).slice(2, 6)}`,
        version: 1,
        syncStatus: user ? 'pending' : 'local',
        createdAt: now,
        updatedAt: now,
      };
      setMemos((prev) => [created, ...prev]);
      syncSingleItemToCloud('memo', created);
    }
  };

  const handleDeleteMemo = (id: string) => {
    const now = Date.now();
    const existing = latestCollectionsRef.current.memos.find((m) => m.id === id);
    const deletedMemo: MemoItem | null = existing
      ? {
          ...existing,
          deleted: true,
          version: nextItemVersion(existing.version),
          syncStatus: user ? 'pending' : 'local',
          updatedAt: now,
        }
      : null;
    setMemos((prev) => prev.map((m) => (m.id === id && deletedMemo ? deletedMemo : m)));
    if (deletedMemo) syncSingleItemToCloud('memo', deletedMemo);
    showToast('已刪除加密備忘錄');
  };

  // Business Card CRUD
  const handleSaveCard = (draft: BusinessCardDraft, existingId?: string) => {
    const now = Date.now();
    if (existingId) {
      const existing = latestCollectionsRef.current.businessCards.find((c) => c.id === existingId);
      const updated: BusinessCardItem | null = existing
        ? {
            ...existing,
            ...draft,
            version: nextItemVersion(existing.version),
            syncStatus: user ? 'pending' : 'local',
            updatedAt: now,
          }
        : null;
      setBusinessCards((prev) =>
        prev.map((c) => (c.id === existingId && updated ? updated : c))
      );
      if (updated) syncSingleItemToCloud('card', updated);
      showToast(`已更新「${draft.name}」名片`);
    } else {
      const created = buildNewBusinessCard(
        draft,
        now,
        user ? 'pending' : 'local'
      );
      setBusinessCards((prev) => [created, ...prev]);
      syncSingleItemToCloud('card', created);
      showToast(`已新增「${created.name}」名片`);
    }
  };

  const handleDeleteCard = (id: string) => {
    const now = Date.now();
    const existing = latestCollectionsRef.current.businessCards.find((c) => c.id === id);
    const deletedCard: BusinessCardItem | null = existing
      ? {
          ...existing,
          deleted: true,
          version: nextItemVersion(existing.version),
          syncStatus: user ? 'pending' : 'local',
          updatedAt: now,
        }
      : null;
    setBusinessCards((prev) =>
      prev.map((c) => (c.id === id && deletedCard ? deletedCard : c))
    );
    if (deletedCard) syncSingleItemToCloud('card', deletedCard);
    showToast('已刪除名片');
  };

  // Quick Links CRUD
  const handleAddQuickLink = (name: string, url: string) => {
    const created = buildQuickLinkItem(name, url, Date.now(), user ? 'pending' : 'local');
    setQuickLinks((prev) => [...prev, created]);
    syncSingleItemToCloud('link', created);
    showToast(`已新增常用連結「${created.name}」`);
  };

  const handleUpdateQuickLink = (id: string, name: string, url: string) => {
    const now = Date.now();
    const existing = latestCollectionsRef.current.quickLinks.find((l) => l.id === id);
    const updated: QuickLinkItem | null = existing
      ? {
          ...existing,
          name,
          url,
          version: nextItemVersion(existing.version),
          syncStatus: user ? 'pending' : 'local',
          updatedAt: now,
        }
      : null;
    setQuickLinks((prev) => prev.map((l) => (l.id === id && updated ? updated : l)));
    if (updated) syncSingleItemToCloud('link', updated);
    showToast(`已更新連結「${name}」`);
  };

  const handleDeleteQuickLink = (id: string) => {
    const now = Date.now();
    const existing = latestCollectionsRef.current.quickLinks.find((l) => l.id === id);
    const deletedLink: QuickLinkItem | null = existing
      ? {
          ...existing,
          deleted: true,
          version: nextItemVersion(existing.version),
          syncStatus: user ? 'pending' : 'local',
          updatedAt: now,
        }
      : null;
    setQuickLinks((prev) => prev.map((l) => (l.id === id && deletedLink ? deletedLink : l)));
    if (deletedLink) syncSingleItemToCloud('link', deletedLink);
    showToast('已移除常用連結');
  };

  // Vault & Backup Handlers (Cloud vault metadata always takes precedence when authenticated)
  const handleSetupOrUnlockVault = async (
    passphrase: string,
    targetUser?: User
  ): Promise<boolean> => {
    const activeUser = targetUser ?? user;
    let saltToUse = vault.salt;
    let checkCipherToUse = vault.checkCipher;
    let checkIvToUse = vault.checkIv;
    let vaultInitialized = vault.initialized;

    if (activeUser) {
      // Align with remote vault salt/check when online; preserve local vault metadata if offline
      try {
        const remoteMeta = await fetchUserVaultMeta(activeUser.uid);
        if (remoteMeta) {
          remoteMetaExistsRef.current = true;
          vaultInitialized = true;
          saltToUse = remoteMeta.vaultSalt;
          checkCipherToUse = remoteMeta.vaultCheckCipher;
          checkIvToUse = remoteMeta.vaultCheckIv;
          setVault((prev) => ({
            ...prev,
            initialized: true,
            salt: remoteMeta.vaultSalt,
            checkCipher: remoteMeta.vaultCheckCipher,
            checkIv: remoteMeta.vaultCheckIv,
          }));
        } else {
          remoteMetaExistsRef.current = false;
          vaultInitialized = false;
          saltToUse = null;
          checkCipherToUse = null;
          checkIvToUse = null;
        }
      } catch (err) {
        setSyncDiagnostics((prev) => ({
          ...prev,
          lastError: formatFirestoreSyncError(err, '無法讀取雲端金鑰資訊'),
        }));
      }
    }

    if (vaultInitialized && saltToUse && checkCipherToUse && checkIvToUse) {
      const key = await deriveAesKey(passphrase, saltToUse);
      const valid = await verifyVaultCheck(key, checkCipherToUse, checkIvToUse);
      if (!valid) return false;
      remoteSyncedOnceRef.current = false;
      setCryptoKey(key);
      setActivePassphrase(passphrase);
      setVault({
        initialized: true,
        unlocked: true,
        salt: saltToUse,
        checkCipher: checkCipherToUse,
        checkIv: checkIvToUse,
      });
      if (activeUser && !(typeof navigator !== 'undefined' && navigator.onLine === false)) {
        setSyncDiagnostics((prev) => ({ ...prev, lastError: null }));
      }
      if (activeUser) {
        saveSessionCryptoKey(activeUser.uid, key).catch(() => {});
        flushPendingItemsToCloud(activeUser, key).catch(() => {});
      }
      return true;
    }

    const salt = generateSaltBase64(16);
    const key = await deriveAesKey(passphrase, salt);
    const { checkCipher, checkIv } = await createVaultCheck(key);
    remoteSyncedOnceRef.current = false;

    if (activeUser) {
      try {
        await upsertUserVaultMeta(
          activeUser.uid,
          {
            vaultSalt: salt,
            vaultCheckCipher: checkCipher,
            vaultCheckIv: checkIv,
            themeMode: theme.mode,
            themeAccent: theme.accent,
          },
          false
        );
        remoteMetaExistsRef.current = true;
      } catch (err) {
        const msg = formatFirestoreSyncError(err, '雲端初始化寫入失敗');
        setSyncDiagnostics((prev) => ({ ...prev, lastError: msg }));
        showToast(
          isOfflineSyncError(err)
            ? '目前離線，已於本機建立加密空間，連線後將自動同步'
            : '無法寫入雲端同步空間，請確認網路連線或資料庫權限'
        );
      }
    }

    setCryptoKey(key);
    setActivePassphrase(passphrase);
    setVault({
      initialized: true,
      unlocked: true,
      salt,
      checkCipher,
      checkIv,
    });

    if (activeUser) {
      saveSessionCryptoKey(activeUser.uid, key).catch(() => {});
      flushPendingItemsToCloud(activeUser, key).catch(() => {});
    }
    return true;
  };

  const finalizeSyncAuth = async (
    authedUser: User,
    passphrase: string,
    label: string
  ): Promise<{ ok: boolean; message: string }> => {
    setSyncIdentityHint(loadSyncIdentityHint());
    const unlocked = await handleSetupOrUnlockVault(passphrase, authedUser);
    if (unlocked) {
      const msg = `已連線「${label}」，並自動解鎖 AES-256-GCM 跨平台同步！`;
      showToast(msg);
      return { ok: true, message: msg };
    }
    const msg = `已連線「${label}」，請於左上方金鑰庫輸入您原先設定的加密密碼以解鎖資料同步。`;
    showToast(msg);
    return { ok: true, message: msg };
  };

  const handleRegisterSyncAccount = async (
    identifier: string,
    password: string
  ): Promise<{ ok: boolean; message: string }> => {
    setAuthLoading(true);
    try {
      clearSyncRuntimeCaches();
      await clearSessionCryptoKey();
      remoteSyncedOnceRef.current = false;
      remoteMetaExistsRef.current = false;
      remoteSnapshotRef.current = { tasks: [], memos: [], plugins: [], cards: [], links: [] };
      const { user: authedUser, displayLabel } = await registerSyncAccount(identifier, password);
      return await finalizeSyncAuth(authedUser, password, displayLabel);
    } catch (err) {
      const message = err instanceof Error ? err.message : '註冊同步帳號失敗';
      showToast(message);
      return { ok: false, message };
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignInSyncAccount = async (
    identifier: string,
    password: string
  ): Promise<{ ok: boolean; message: string }> => {
    setAuthLoading(true);
    try {
      clearSyncRuntimeCaches();
      await clearSessionCryptoKey();
      remoteSyncedOnceRef.current = false;
      remoteMetaExistsRef.current = false;
      remoteSnapshotRef.current = { tasks: [], memos: [], plugins: [], cards: [], links: [] };
      const { user: authedUser, displayLabel } = await signInSyncAccount(identifier, password);
      return await finalizeSyncAuth(authedUser, password, displayLabel);
    } catch (err) {
      const message = err instanceof Error ? err.message : '登入同步帳號失敗';
      showToast(message);
      return { ok: false, message };
    } finally {
      setAuthLoading(false);
    }
  };

  const handleConnectSyncSerial = useCallback(
    async (
      serial: string,
      syncPassword: string,
      intent: 'auto' | 'create' | 'join' = 'auto'
    ): Promise<{ ok: boolean; message: string }> => {
      setAuthLoading(true);
      try {
        clearSyncRuntimeCaches();
        await clearSessionCryptoKey();
        remoteSyncedOnceRef.current = false;
        remoteMetaExistsRef.current = false;
        remoteSnapshotRef.current = { tasks: [], memos: [], plugins: [], cards: [], links: [] };
        const { user: authedUser, formattedSerial } = await connectWithSyncSerial(
          serial,
          syncPassword,
          intent
        );
        setActiveSyncSerial(formattedSerial);
        return await finalizeSyncAuth(authedUser, syncPassword, formattedSerial);
      } catch (err) {
        const message = err instanceof Error ? err.message : '序號配對連線失敗';
        showToast(message);
        return { ok: false, message };
      } finally {
        setAuthLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [theme.mode, theme.accent]
  );

  // Auto-handle #pair= quick link once local IndexedDB workspace has finished loading
  useEffect(() => {
    if (!loaded || !pairedPrefill || autoPairAttemptedRef.current) return;
    autoPairAttemptedRef.current = true;
    setActiveTab('settings');
    if (pairedPrefill.password) {
      handleConnectSyncSerial(pairedPrefill.serial, pairedPrefill.password, 'auto');
    } else {
      showToast('已從快速配對連結帶入序號，請輸入 6 字元配對密碼完成同步連線');
    }
  }, [loaded, pairedPrefill, handleConnectSyncSerial, showToast]);

  const handleForceTwoWaySync = async () => {
    if (!user || !cryptoKey) return;
    remoteSyncedOnceRef.current = false;
    setSyncingNow(true);
    try {
      const pushed = await flushPendingItemsToCloud(user, cryptoKey);
      const { remoteTotalDocs, decryptedCount, skippedDecryptCount } =
        remoteSyncedOnceRef.current
          ? await fetchRemoteEncryptedItems(user.uid, cryptoKey).then((res) => {
              remoteSnapshotRef.current = res.batch;
              setTasks((prev) => mergeSyncedCollection(prev, res.batch.tasks));
              setMemos((prev) => mergeSyncedCollection(prev, res.batch.memos));
              setPlugins((prev) => mergeSyncedCollection(prev, res.batch.plugins));
              setBusinessCards((prev) => mergeSyncedCollection(prev, res.batch.cards));
              setQuickLinks((prev) => mergeSyncedCollection(prev, res.batch.links));
              setSyncDiagnostics({ ...res.diagnostics, lastError: null });
              return res.diagnostics;
            })
          : { remoteTotalDocs: 0, decryptedCount: 0, skippedDecryptCount: 0 };

      setLastSyncedAt(Date.now());
      if (skippedDecryptCount > 0) {
        showToast(
          `雲端共 ${remoteTotalDocs} 筆資料，但有 ${skippedDecryptCount} 筆金鑰密碼不符無法解密，請輸入原金鑰密碼解鎖`
        );
      } else {
        showToast(
          `雙向同步完成：雲端共 ${decryptedCount} 筆已合併${pushed > 0 ? `，本次上傳 ${pushed} 筆` : ''}`
        );
      }
    } catch (err) {
      const msg = formatFirestoreSyncError(err, '強制同步失敗');
      setSyncDiagnostics((prev) => ({ ...prev, lastError: msg }));
      showToast('同步過程發生異常，請確認網路與權限設定');
    } finally {
      setSyncingNow(false);
    }
  };

  const handleCreateCloudBackup = async (label: string) => {
    if (!user || !activePassphrase) return;
    const payload = { tasks, memos, plugins, businessCards, quickLinks, theme, voice };
    const totalCount =
      tasks.filter((t) => !t.deleted).length +
      memos.filter((m) => !m.deleted).length +
      businessCards.filter((c) => !c.deleted).length +
      quickLinks.filter((l) => !l.deleted).length;
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
        quickLinks?: QuickLinkItem[];
        theme?: ThemeSettings;
        voice?: VoiceSettings;
      }>(pwd, backup);
      const restoredTasks = Array.isArray(restored.tasks)
        ? restored.tasks.map((t) => ({ ...t, updatedAt: Math.max(t.updatedAt, Date.now()), syncStatus: 'pending' as const }))
        : undefined;
      const restoredMemos = Array.isArray(restored.memos)
        ? restored.memos.map((m) => ({ ...m, updatedAt: Math.max(m.updatedAt, Date.now()), syncStatus: 'pending' as const }))
        : undefined;
      const restoredPlugins = Array.isArray(restored.plugins)
        ? restored.plugins.map((p) => ({ ...p, updatedAt: Math.max(p.updatedAt, Date.now()), syncStatus: 'pending' as const }))
        : undefined;
      const restoredCards = Array.isArray(restored.businessCards)
        ? restored.businessCards.map((c) => ({ ...c, updatedAt: Math.max(c.updatedAt, Date.now()), syncStatus: 'pending' as const }))
        : undefined;
      const restoredLinks = Array.isArray(restored.quickLinks)
        ? restored.quickLinks.map((l) => ({ ...l, updatedAt: Math.max(l.updatedAt, Date.now()), syncStatus: 'pending' as const }))
        : undefined;

      if (restoredTasks) setTasks(restoredTasks);
      if (restoredMemos) setMemos(restoredMemos);
      if (restoredPlugins) setPlugins(restoredPlugins);
      if (restoredCards) setBusinessCards(restoredCards);
      if (restoredLinks) setQuickLinks(restoredLinks);
      if (restored.theme) setTheme(restored.theme);
      if (restored.voice) setVoice(restored.voice);
      if (user && cryptoKey) {
        flushPendingItemsToCloud(user, cryptoKey, {
          tasks: restoredTasks,
          memos: restoredMemos,
          plugins: restoredPlugins,
          cards: restoredCards,
          links: restoredLinks,
        }).catch(() => {});
      }
      showToast(`已從雲端備份「${backup.label}」還原所有資料`);
      return true;
    } catch {
      return false;
    }
  };

  const handleExportEncryptedFile = async (passphrase: string) => {
    const payload = { tasks, memos, plugins, businessCards, quickLinks, theme, voice };
    const totalCount =
      tasks.filter((t) => !t.deleted).length +
      memos.filter((m) => !m.deleted).length +
      businessCards.filter((c) => !c.deleted).length +
      quickLinks.filter((l) => !l.deleted).length;
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
        quickLinks?: QuickLinkItem[];
        theme?: ThemeSettings;
        voice?: VoiceSettings;
      }>(passphrase, archive);
      const restoredTasks = Array.isArray(restored.tasks)
        ? restored.tasks.map((t) => ({ ...t, updatedAt: Math.max(t.updatedAt, Date.now()), syncStatus: 'pending' as const }))
        : undefined;
      const restoredMemos = Array.isArray(restored.memos)
        ? restored.memos.map((m) => ({ ...m, updatedAt: Math.max(m.updatedAt, Date.now()), syncStatus: 'pending' as const }))
        : undefined;
      const restoredPlugins = Array.isArray(restored.plugins)
        ? restored.plugins.map((p) => ({ ...p, updatedAt: Math.max(p.updatedAt, Date.now()), syncStatus: 'pending' as const }))
        : undefined;
      const restoredCards = Array.isArray(restored.businessCards)
        ? restored.businessCards.map((c) => ({ ...c, updatedAt: Math.max(c.updatedAt, Date.now()), syncStatus: 'pending' as const }))
        : undefined;
      const restoredLinks = Array.isArray(restored.quickLinks)
        ? restored.quickLinks.map((l) => ({ ...l, updatedAt: Math.max(l.updatedAt, Date.now()), syncStatus: 'pending' as const }))
        : undefined;

      if (restoredTasks) setTasks(restoredTasks);
      if (restoredMemos) setMemos(restoredMemos);
      if (restoredPlugins) setPlugins(restoredPlugins);
      if (restoredCards) setBusinessCards(restoredCards);
      if (restoredLinks) setQuickLinks(restoredLinks);
      if (restored.theme) setTheme(restored.theme);
      if (restored.voice) setVoice(restored.voice);
      if (user && cryptoKey) {
        flushPendingItemsToCloud(user, cryptoKey, {
          tasks: restoredTasks,
          memos: restoredMemos,
          plugins: restoredPlugins,
          cards: restoredCards,
          links: restoredLinks,
        }).catch(() => {});
      }
      return true;
    } catch {
      return false;
    }
  };

  const handleGenerateSyncCode = async (passphrase: string): Promise<string> => {
    const current = latestCollectionsRef.current;
    const payload = {
      tasks: current.tasks,
      memos: current.memos,
      plugins: current.plugins,
      businessCards: current.businessCards,
      quickLinks: current.quickLinks,
      theme,
      voice,
    };
    const totalCount =
      current.tasks.filter((t) => !t.deleted).length +
      current.memos.filter((m) => !m.deleted).length +
      current.businessCards.filter((c) => !c.deleted).length +
      current.quickLinks.filter((l) => !l.deleted).length;
    return encodeEncryptedSyncCode(passphrase, payload, totalCount);
  };

  const handleImportSyncCode = async (
    rawCode: string,
    passphrase: string
  ): Promise<boolean> => {
    try {
      const restored = await decodeEncryptedSyncCode<{
        tasks?: TaskItem[];
        memos?: MemoItem[];
        plugins?: WorkflowPlugin[];
        businessCards?: BusinessCardItem[];
        quickLinks?: QuickLinkItem[];
        theme?: ThemeSettings;
        voice?: VoiceSettings;
      }>(passphrase, rawCode);

      const current = latestCollectionsRef.current;
      const syncMark = user && cryptoKey ? ('pending' as const) : ('local' as const);
      const bump = (items?: Array<TaskItem | MemoItem | WorkflowPlugin | BusinessCardItem | QuickLinkItem>) =>
        Array.isArray(items)
          ? items.map((item) => ({ ...item, syncStatus: syncMark }))
          : [];

      const mergedTasks = restored.tasks
        ? mergeSyncedCollection(current.tasks, bump(restored.tasks) as TaskItem[])
        : current.tasks;
      const mergedMemos = restored.memos
        ? mergeSyncedCollection(current.memos, bump(restored.memos) as MemoItem[])
        : current.memos;
      const mergedPlugins = restored.plugins
        ? mergeSyncedCollection(current.plugins, bump(restored.plugins) as WorkflowPlugin[])
        : current.plugins;
      const mergedCards = restored.businessCards
        ? mergeSyncedCollection(current.businessCards, bump(restored.businessCards) as BusinessCardItem[])
        : current.businessCards;
      const mergedLinks = restored.quickLinks
        ? mergeSyncedCollection(current.quickLinks, bump(restored.quickLinks) as QuickLinkItem[])
        : current.quickLinks;

      setTasks(mergedTasks);
      setMemos(mergedMemos);
      setPlugins(mergedPlugins);
      setBusinessCards(mergedCards);
      setQuickLinks(mergedLinks);
      if (restored.theme) setTheme(restored.theme);
      if (restored.voice) setVoice(restored.voice);

      if (user && cryptoKey) {
        flushPendingItemsToCloud(user, cryptoKey, {
          tasks: mergedTasks,
          memos: mergedMemos,
          plugins: mergedPlugins,
          cards: mergedCards,
          links: mergedLinks,
        }).catch(() => {});
      }
      showToast('已成功解密並合併跨裝置加密同步碼的資料');
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
      <aside className="hidden lg:flex lg:flex-col lg:w-[272px] lg:shrink-0 border-r border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <div className="h-16 px-6 flex items-center border-b border-stone-200 dark:border-zinc-800 shrink-0">
          <span className="font-display text-lg font-bold tracking-tight text-stone-900 dark:text-zinc-100 whitespace-nowrap">
            Kairo 隨行助理
          </span>
        </div>

        <div className="flex-1 overflow-y-auto">
          <nav aria-label="主導覽列" className="p-3 space-y-1">
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

          <SidebarQuickLinks
            links={quickLinks}
            onAddLink={handleAddQuickLink}
            onUpdateLink={handleUpdateQuickLink}
            onDeleteLink={handleDeleteQuickLink}
          />
        </div>

        <div className="p-4 border-t border-stone-200 dark:border-zinc-800 space-y-2.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              const nextMode = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
              setTheme((prev) => ({
                ...prev,
                mode: nextMode,
              }));
              if (user) {
                updateRemoteThemePrefs(user.uid, nextMode, theme.accent).catch(() => {});
              }
            }}
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
        <header className="sticky top-0 z-30 h-14 lg:h-16 px-4 lg:px-8 border-b border-stone-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md flex items-center justify-between gap-4 sm:gap-8">
          <div className="min-w-0 flex items-center gap-3">
            <span className="lg:hidden font-display text-base font-bold tracking-tight text-stone-900 dark:text-zinc-100 whitespace-nowrap shrink-0">
              Kairo 助理
            </span>
            <span className="hidden lg:inline text-sm font-medium text-stone-500 dark:text-zinc-400 whitespace-nowrap shrink-0">
              工作區 / {activeTabMeta.label}
            </span>
          </div>

          <div className="hidden md:flex items-center gap-4 text-xs text-stone-500 dark:text-zinc-400 font-mono whitespace-nowrap shrink-0">
            <span>
              {user && vault.unlocked
                ? '端對端加密已解鎖'
                : user
                  ? '待解鎖同步金鑰'
                  : vault.unlocked
                    ? '本機金鑰已解鎖'
                    : '離線安全模式'}
            </span>
            <span aria-hidden="true">·</span>
            <span>{user && vault.unlocked ? '雲端即時同步中' : user ? '已連線（未解鎖）' : '本機 IndexedDB'}</span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsMobileLinksOpen(true)}
              aria-label="開啟常用連結"
              className="lg:hidden inline-flex items-center gap-1 rounded-lg border border-stone-200 dark:border-zinc-700 px-2.5 py-1.5 text-xs font-medium text-stone-700 dark:text-zinc-200 hover:bg-stone-100 dark:hover:bg-zinc-800 min-h-[38px] whitespace-nowrap"
            >
              <Link2 className="w-3.5 h-3.5 accent-text" />
              <span>常用連結</span>
            </button>
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
              quickLinks={quickLinks}
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
              onAddQuickLink={handleAddQuickLink}
              onUpdateQuickLink={handleUpdateQuickLink}
              onDeleteQuickLink={handleDeleteQuickLink}
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
              cloudConnected={Boolean(user)}
              vaultUnlocked={vault.unlocked}
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
            />
          )}

          {activeTab === 'memos' && (
            <MemosView
              memos={memos}
              vaultUnlocked={vault.unlocked}
              cloudConnected={Boolean(user)}
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
              cloudConnected={Boolean(user)}
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
                const existing = latestCollectionsRef.current.plugins.find((p) => p.id === id);
                const updated: WorkflowPlugin | null = existing
                  ? {
                      ...existing,
                      enabled: !existing.enabled,
                      syncStatus: user && cryptoKey ? 'pending' : 'local',
                      updatedAt: Date.now(),
                    }
                  : null;
                setPlugins((prev) =>
                  prev.map((p) => (p.id === id && updated ? updated : p))
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
                const existing = latestCollectionsRef.current.plugins.find((p) => p.id === id);
                const updated: WorkflowPlugin | null = existing
                  ? {
                      ...existing,
                      config: { ...existing.config, webhookUrl: url },
                      syncStatus: user && cryptoKey ? 'pending' : 'local',
                      updatedAt: Date.now(),
                    }
                  : null;
                setPlugins((prev) =>
                  prev.map((p) => (p.id === id && updated ? updated : p))
                );
                if (updated) syncSingleItemToCloud('plugin', updated);
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
              syncIdentityLabel={resolveSyncIdentityLabel(user?.email, syncIdentityHint)}
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
                    ? `已連接同步空間「${resolveSyncIdentityLabel(user.email, syncIdentityHint)}」· 端對端加密即時同步啟用中${lastSyncedAt ? ` (上次同步 ${new Date(lastSyncedAt).toLocaleTimeString('zh-TW')})` : ''}`
                    : `已連線「${resolveSyncIdentityLabel(user.email, syncIdentityHint)}」，請輸入上方金鑰密碼以解鎖雲端同步`
                  : '目前為純離線本機儲存模式，輸入「帳號密碼」或「同步序號」即可啟用跨平台加密同步。'
              }
              syncDiagnostics={syncDiagnostics}
              activeSyncSerial={activeSyncSerial}
              activePassphrase={activePassphrase}
              pairedPrefill={pairedPrefill}
              pendingSyncCount={
                tasks.filter((t) => t.syncStatus === 'pending').length +
                memos.filter((m) => m.syncStatus === 'pending').length +
                plugins.filter((p) => p.syncStatus === 'pending').length +
                businessCards.filter((c) => c.syncStatus === 'pending').length +
                quickLinks.filter((l) => l.syncStatus === 'pending').length
              }
              syncingNow={syncingNow}
              sampleCipherPreview={sampleCipherPreview}
              onSyncNow={handleForceTwoWaySync}
              onRegisterSyncAccount={handleRegisterSyncAccount}
              onSignInSyncAccount={handleSignInSyncAccount}
              onConnectSyncSerial={handleConnectSyncSerial}
              onSignOutSync={async () => {
                await signOutSyncSession();
                await clearSessionCryptoKey();
                setSyncIdentityHint(null);
                setActiveSyncSerial(null);
                remoteSyncedOnceRef.current = false;
                remoteMetaExistsRef.current = false;
                remoteSnapshotRef.current = { tasks: [], memos: [], plugins: [], cards: [], links: [] };
                setSyncDiagnostics({
                  remoteTotalDocs: 0,
                  decryptedCount: 0,
                  skippedDecryptCount: 0,
                  lastError: null,
                });
                setCryptoKey(null);
                setActivePassphrase(null);
                setVault((prev) => ({ ...prev, unlocked: false }));
                showToast('已登出同步空間，本機離線資料仍完整保留');
              }}
              onSetupOrUnlockVault={handleSetupOrUnlockVault}
              onLockVault={() => {
                clearSessionCryptoKey().catch(() => {});
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
              onExportSyncCode={handleGenerateSyncCode}
              onImportSyncCode={handleImportSyncCode}
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

      {isMobileLinksOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="常用連結管理"
          className="lg:hidden fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4"
        >
          <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-2xl max-h-[85vh] overflow-y-auto space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-stone-200 dark:border-zinc-800">
              <h2 className="text-base font-semibold text-stone-900 dark:text-zinc-100">
                公司與常用系統連結
              </h2>
              <button
                type="button"
                onClick={() => setIsMobileLinksOpen(false)}
                aria-label="關閉常用連結視窗"
                className="p-2 rounded-lg text-stone-500 hover:bg-stone-100 dark:hover:bg-zinc-800 min-h-[38px] min-w-[38px] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <SidebarQuickLinks
              links={quickLinks}
              variant="dialog"
              onAddLink={handleAddQuickLink}
              onUpdateLink={handleUpdateQuickLink}
              onDeleteLink={handleDeleteQuickLink}
            />
          </div>
        </div>
      )}
    </div>
  );
}
