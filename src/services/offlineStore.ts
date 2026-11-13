import type {
  BusinessCardItem,
  GovSettings,
  GovSyncCache,
  MemoItem,
  TaskItem,
  ThemeSettings,
  VaultState,
  VoiceSettings,
  WorkflowPlugin,
} from '../types/assistant';
import { addDaysToDateStr } from '../utils/smartEngine';

const DB_NAME = 'kairo-assistant-db';
const DB_VERSION = 1;
const STORE_KV = 'kv';

export function getTodayDateStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export interface PersistedWorkspace {
  tasks: TaskItem[];
  memos: MemoItem[];
  plugins: WorkflowPlugin[];
  businessCards?: BusinessCardItem[];
  theme: ThemeSettings;
  voice: VoiceSettings;
  vault: VaultState;
  govSettings?: GovSettings;
  govCache?: GovSyncCache;
  lastSyncedAt: number | null;
}

export function createSeedWorkspace(): PersistedWorkspace {
  const today = getTodayDateStr();
  const tomorrow = addDaysToDateStr(today, 1);
  const dayAfter = addDaysToDateStr(today, 2);
  const now = Date.now();

  const tasks: TaskItem[] = [
    {
      id: 'seed-task-1',
      title: '產品週會與季度路線圖評審',
      notes: '確認行動端 PWA 離線快取策略與下季開發里程碑。',
      dueDate: today,
      startTime: '10:00',
      endTime: '11:00',
      isMeeting: true,
      priority: 'urgent',
      tags: ['會議', '工作'],
      completed: false,
      reminderMinutes: 15,
      voiceReminder: true,
      version: 1,
      syncStatus: 'local',
      createdAt: now - 3600000 * 4,
      updatedAt: now - 3600000 * 4,
    },
    {
      id: 'seed-task-2',
      title: '審查端對端加密金鑰輪換規格',
      notes: '驗證 AES-GCM 256-bit 加密與 PBKDF2 參數符合跨裝置同步規範。',
      dueDate: today,
      startTime: '14:30',
      endTime: '15:30',
      isMeeting: false,
      priority: 'high',
      tags: ['開發', '工作'],
      completed: false,
      reminderMinutes: 15,
      voiceReminder: true,
      version: 1,
      syncStatus: 'local',
      createdAt: now - 3600000 * 3,
      updatedAt: now - 3600000 * 3,
    },
    {
      id: 'seed-task-3',
      title: '整理十月雲端服務報帳發票',
      notes: '將電子發票 PDF 彙整並提交財務系統。',
      dueDate: today,
      startTime: '17:00',
      endTime: '17:30',
      isMeeting: false,
      priority: 'medium',
      tags: ['財務', '工作'],
      completed: false,
      reminderMinutes: 10,
      voiceReminder: false,
      version: 1,
      syncStatus: 'local',
      createdAt: now - 3600000 * 2,
      updatedAt: now - 3600000 * 2,
    },
    {
      id: 'seed-task-4',
      title: '晚間有氧慢跑與伸展 30 分鐘',
      notes: '維持每週三次運動節奏，完成後補充水分。',
      dueDate: today,
      startTime: '19:30',
      endTime: '20:15',
      isMeeting: false,
      priority: 'low',
      tags: ['健康'],
      completed: true,
      reminderMinutes: 15,
      voiceReminder: false,
      version: 1,
      syncStatus: 'local',
      createdAt: now - 3600000 * 5,
      updatedAt: now - 3600000,
    },
    {
      id: 'seed-task-5',
      title: '客戶設計稿同步會議',
      notes: '與設計團隊對齊深色模式與主題色彩規範。',
      dueDate: tomorrow,
      startTime: '11:00',
      endTime: '12:00',
      isMeeting: true,
      priority: 'high',
      tags: ['會議', '工作'],
      completed: false,
      reminderMinutes: 30,
      voiceReminder: true,
      version: 1,
      syncStatus: 'local',
      createdAt: now - 3600000 * 2,
      updatedAt: now - 3600000 * 2,
    },
    {
      id: 'seed-task-6',
      title: '閱讀分散式離線同步架構論文',
      notes: '重點整理 CRDT 與本地優先儲存實踐筆記。',
      dueDate: dayAfter,
      startTime: '20:00',
      endTime: '21:00',
      isMeeting: false,
      priority: 'medium',
      tags: ['學習', '開發'],
      completed: false,
      reminderMinutes: 15,
      voiceReminder: false,
      version: 1,
      syncStatus: 'local',
      createdAt: now - 3600000,
      updatedAt: now - 3600000,
    },
  ];

  const memos: MemoItem[] = [
    {
      id: 'seed-memo-1',
      title: '跨裝置切換與安全檢查清單',
      content: '更換手機或電腦時，先於設定頁執行「雲端加密備份」，在新裝置登入同一帳號並輸入端對端加密金鑰密碼即可無縫還原所有行程與筆記。',
      tags: ['工作', '開發'],
      pinned: true,
      checklist: [
        { id: 'c1', text: '設定個人 E2EE 金鑰密碼', done: true },
        { id: 'c2', text: '匯出 .ics 行事曆訂閱檔', done: false },
        { id: 'c3', text: '開啟語音自動提醒權限', done: false },
      ],
      version: 1,
      syncStatus: 'local',
      createdAt: now - 86400000,
      updatedAt: now - 3600000,
    },
    {
      id: 'seed-memo-2',
      title: '本週靈感與產品待優化項目',
      content: '1. 快速輸入支援自然時間與 #標籤解析。\n2. 番茄鐘計時器與任務聯動，結束時播報提示音。\n3. 支援 Webhook 自動推送完成紀錄到團隊頻道。',
      tags: ['開發', '學習'],
      pinned: false,
      checklist: [],
      version: 1,
      syncStatus: 'local',
      createdAt: now - 43200000,
      updatedAt: now - 7200000,
    },
  ];

  const plugins: WorkflowPlugin[] = [
    {
      id: 'plugin-pomodoro',
      name: '番茄鐘專注計時器',
      description: '鎖定高優先任務執行 25 分鐘深度工作，倒數結束時自動語音提醒休息。',
      author: 'Kairo Core',
      version: '1.2.0',
      kind: 'pomodoro',
      enabled: true,
      config: { trigger: 'manual', keywordMatch: '' },
      runCount: 3,
      syncStatus: 'local',
      updatedAt: now,
    },
    {
      id: 'plugin-briefing',
      name: '晨間語音簡報助理',
      description: '彙整當日會議與最高優先級任務，一鍵以自然語音播報行動摘要。',
      author: 'Kairo Core',
      version: '1.1.0',
      kind: 'briefing',
      enabled: true,
      config: { trigger: 'manual', keywordMatch: '' },
      runCount: 5,
      syncStatus: 'local',
      updatedAt: now,
    },
    {
      id: 'plugin-markdown',
      name: 'Markdown 日報匯出器',
      description: '將今日排程、完成狀態與置頂加密備忘錄轉換為乾淨 Markdown 文件。',
      author: 'Kairo Community',
      version: '1.0.4',
      kind: 'markdown',
      enabled: true,
      config: { trigger: 'manual', keywordMatch: '' },
      runCount: 2,
      syncStatus: 'local',
      updatedAt: now,
    },
    {
      id: 'plugin-webhook',
      name: 'Webhook / Zapier 工作流連接器',
      description: '當任務建立或完成時，發送自訂 JSON Webhook 事件整合外部團隊工具。',
      author: 'Kairo Integrations',
      version: '2.0.1',
      kind: 'webhook',
      enabled: false,
      config: {
        trigger: 'on_task_complete',
        keywordMatch: '',
        webhookUrl: 'https://httpbin.org/post',
      },
      runCount: 0,
      syncStatus: 'local',
      updatedAt: now,
    },
    {
      id: 'plugin-rule-meeting',
      name: '會議自動加急與提前提醒',
      description: '偵測任務標題含「會議」或「Sync」時，自動設為高優先並開啟 15 分鐘前語音提醒。',
      author: '自訂工作流規則',
      version: '1.0.0',
      kind: 'rule',
      enabled: true,
      config: {
        trigger: 'on_task_create',
        keywordMatch: '會議',
        addTag: '會議',
        setPriority: 'high',
        setReminderMinutes: 15,
        enableVoice: true,
      },
      runCount: 4,
      syncStatus: 'local',
      updatedAt: now,
    },
  ];

  const businessCards: BusinessCardItem[] = [
    {
      id: 'seed-card-1',
      category: 'client',
      name: '陳志明',
      company: '亞太雲端科技股份有限公司',
      title: '技術採購總監',
      phone: '0912-345-678',
      email: 'jm.chen@apac-cloud.example.tw',
      notes: 'Q4 企業安全稽核合作窗口，偏好週二上午 10:00 進行視訊同步。',
      pinned: true,
      version: 1,
      syncStatus: 'local',
      createdAt: now - 86400000 * 3,
      updatedAt: now - 3600000 * 6,
    },
    {
      id: 'seed-card-2',
      category: 'colleague',
      name: '林佳穎',
      company: '產品設計與研發部',
      title: '資深 UI/UX 設計師',
      phone: '02-2700-8899 #312',
      email: 'jiaying.lin@kairo-office.example.tw',
      notes: '負責行動端 PWA 互動規格與深色主題設計規範。',
      pinned: false,
      version: 1,
      syncStatus: 'local',
      createdAt: now - 86400000 * 2,
      updatedAt: now - 3600000 * 2,
    },
  ];

  return {
    tasks,
    memos,
    plugins,
    businessCards,
    theme: { mode: 'light', accent: 'teal' },
    voice: {
      enabled: true,
      autoSpeakReminders: true,
      playChime: true,
      lang: 'zh-TW',
      rate: 1.0,
      pitch: 1.0,
    },
    vault: {
      initialized: false,
      unlocked: false,
      salt: null,
      checkCipher: null,
      checkIv: null,
    },
    govSettings: {
      enabled: true,
      monitoredCity: '全部縣市',
      holidayRemindDaysAhead: 3,
      autoSpeakGovAlerts: true,
    },
    govCache: {
      year: new Date().getFullYear(),
      holidays: [],
      lastHolidaySyncAt: null,
      typhoonReport: null,
    },
    lastSyncedAt: null,
  };
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_KV)) {
        db.createObjectStore(STORE_KV);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadWorkspaceFromOffline(): Promise<PersistedWorkspace> {
  try {
    const db = await openDB();
    const raw = await new Promise<PersistedWorkspace | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_KV, 'readonly');
      const store = tx.objectStore(STORE_KV);
      const req = store.get('workspace');
      req.onsuccess = () => resolve(req.result as PersistedWorkspace | undefined);
      req.onerror = () => reject(req.error);
    });
    if (raw && Array.isArray(raw.tasks)) {
      return raw;
    }
  } catch {
    try {
      const ls = localStorage.getItem('kairo_workspace_fallback');
      if (ls) return JSON.parse(ls) as PersistedWorkspace;
    } catch {
      // ignore
    }
  }
  const seed = createSeedWorkspace();
  await saveWorkspaceToOffline(seed);
  return seed;
}

export async function saveWorkspaceToOffline(workspace: PersistedWorkspace): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_KV, 'readwrite');
      const store = tx.objectStore(STORE_KV);
      const req = store.put(workspace, 'workspace');
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    try {
      localStorage.setItem('kairo_workspace_fallback', JSON.stringify(workspace));
    } catch {
      // ignore
    }
  }
}
