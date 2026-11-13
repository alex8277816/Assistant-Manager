import React, { useRef, useState } from 'react';
import {
  BellRing,
  Check,
  Cloud,
  CloudUpload,
  CloudLightning,
  Copy,
  Download,
  ExternalLink,
  KeyRound,
  Lock,
  LogOut,
  MonitorSmartphone,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Square,
  Trash2,
  Unlock,
  Upload,
  Volume2,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import type {
  CloudBackupRecord,
  GovSettings,
  ThemeAccent,
  ThemeMode,
  ThemeSettings,
  VaultState,
  VoiceSettings,
} from '../types/assistant';
import {
  DGPA_PORTAL_URL,
  DGPA_TYPHOON_URL,
  TAIWAN_CITIES,
} from '../utils/govCalendar';
import { PWAInstallButton } from './PWAInstallButton';

interface SettingsBackupViewProps {
  user: User | null;
  authLoading: boolean;
  vault: VaultState;
  theme: ThemeSettings;
  voice: VoiceSettings;
  govSettings: GovSettings;
  govSyncing: boolean;
  govLastUpdatedText: string;
  isSpeaking: boolean;
  cloudBackups: CloudBackupRecord[];
  syncStatusText: string;
  pendingSyncCount: number;
  syncingNow: boolean;
  sampleCipherPreview: { ciphertext: string; iv: string } | null;
  onGoogleSignIn: () => Promise<void>;
  onGoogleSignOut: () => Promise<void>;
  onSyncNow: () => Promise<void>;
  onSetupOrUnlockVault: (passphrase: string) => Promise<boolean>;
  onLockVault: () => void;
  onCreateCloudBackup: (label: string) => Promise<void>;
  onRestoreCloudBackup: (backup: CloudBackupRecord, passphrase: string) => Promise<boolean>;
  onDeleteCloudBackup: (backupId: string) => Promise<void>;
  onExportEncryptedFile: (passphrase: string) => Promise<void>;
  onImportEncryptedFile: (file: File, passphrase: string) => Promise<boolean>;
  onUpdateTheme: (next: ThemeSettings) => void;
  onUpdateVoice: (next: VoiceSettings) => void;
  onUpdateGovSettings: (next: GovSettings) => void;
  onSyncGovNow: () => Promise<void>;
  onTestTyphoonVoice: () => void;
  onTestVoice: () => void;
  onStopSpeaking: () => void;
  onTestFloatingNotification: () => void;
  onRequestBrowserNotifications: () => Promise<NotificationPermission | 'unsupported'>;
}

const ACCENT_OPTIONS: Array<{ id: ThemeAccent; label: string; hex: string }> = [
  { id: 'teal', label: '深青 Teal', hex: '#0d9488' },
  { id: 'indigo', label: '靛藍 Indigo', hex: '#4f46e5' },
  { id: 'emerald', label: '翠綠 Emerald', hex: '#059669' },
  { id: 'amber', label: '琥珀 Amber', hex: '#d97706' },
  { id: 'rose', label: '玫瑰 Rose', hex: '#e11d48' },
];

export const SettingsBackupView: React.FC<SettingsBackupViewProps> = ({
  user,
  authLoading,
  vault,
  theme,
  voice,
  govSettings,
  govSyncing,
  govLastUpdatedText,
  isSpeaking,
  cloudBackups,
  syncStatusText,
  pendingSyncCount,
  syncingNow,
  sampleCipherPreview,
  onGoogleSignIn,
  onGoogleSignOut,
  onSyncNow,
  onSetupOrUnlockVault,
  onLockVault,
  onCreateCloudBackup,
  onRestoreCloudBackup,
  onDeleteCloudBackup,
  onExportEncryptedFile,
  onImportEncryptedFile,
  onUpdateTheme,
  onUpdateVoice,
  onUpdateGovSettings,
  onSyncGovNow,
  onTestTyphoonVoice,
  onTestVoice,
  onStopSpeaking,
  onTestFloatingNotification,
  onRequestBrowserNotifications,
}) => {
  const [passphrase, setPassphrase] = useState('');
  const [vaultFeedback, setVaultFeedback] = useState('');
  const [backupLabel, setBackupLabel] = useState('');
  const [backupFeedback, setBackupFeedback] = useState('');
  const [restorePassphrase, setRestorePassphrase] = useState('');
  const [filePassphrase, setFilePassphrase] = useState('');
  const [notifStatus, setNotifStatus] = useState<string>(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  );
  const [copiedAppUrl, setCopiedAppUrl] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const isInIframe = typeof window !== 'undefined' && window.self !== window.top;

  const handleCopyAppUrl = async () => {
    if (typeof window === 'undefined') return;
    try {
      await navigator.clipboard.writeText(window.location.origin);
      setCopiedAppUrl(true);
      window.setTimeout(() => setCopiedAppUrl(false), 2000);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleVaultSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passphrase.trim().length < 4) {
      setVaultFeedback('金鑰密碼至少需 4 個字元');
      return;
    }
    const ok = await onSetupOrUnlockVault(passphrase.trim());
    if (ok) {
      setVaultFeedback(vault.initialized ? '端對端加密金鑰庫已解鎖，可同步與檢視密文。' : '已成功建立本機與雲端 AES-256-GCM 端對端金鑰庫。');
      setPassphrase('');
    } else {
      setVaultFeedback('金鑰密碼錯誤，無法解密驗證權杖。');
    }
  };

  const handleCloudBackup = async () => {
    setBackupFeedback('正在加密並上傳完整快照...');
    const label = backupLabel.trim() || `雲端快照 ${new Date().toLocaleString('zh-TW')}`;
    await onCreateCloudBackup(label);
    setBackupLabel('');
    setBackupFeedback('已完成端對端加密雲端備份！更換設備時登入即可還原。');
  };

  const handleExportFile = async () => {
    const pwd = filePassphrase.trim() || passphrase.trim();
    if (pwd.length < 4) {
      setBackupFeedback('請先輸入至少 4 字元的備份加密密碼。');
      return;
    }
    await onExportEncryptedFile(pwd);
    setBackupFeedback('已匯出 .kairo.json 端對端加密備份檔。');
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const pwd = filePassphrase.trim() || passphrase.trim();
    if (pwd.length < 4) {
      setBackupFeedback('請在「離線檔案加密密碼」輸入該備份檔的解密密碼後再匯入。');
      e.target.value = '';
      return;
    }
    const ok = await onImportEncryptedFile(file, pwd);
    setBackupFeedback(ok ? '成功從加密備份檔還原所有排程、備忘錄與插件！' : '解密失敗，請確認密碼是否正確。');
    e.target.value = '';
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1. End-to-End Encryption Vault */}
        <section className="rounded-2xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-stone-900 dark:text-zinc-100 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 accent-text" />
                <span>端對端加密安全金鑰庫 (AES-256-GCM)</span>
              </h2>
              <p className="text-xs text-stone-600 dark:text-zinc-400 mt-1">
                所有任務、備忘錄與插件規則皆在裝置端使用 PBKDF2 + AES-GCM 加密後才寫入雲端或備份檔，伺服器無法讀取明文。
              </p>
            </div>
            <span className="text-xs font-mono font-medium accent-text whitespace-nowrap">
              {vault.unlocked ? '已解鎖' : vault.initialized ? '已鎖定' : '未設定'}
            </span>
          </div>

          <form onSubmit={handleVaultSubmit} className="flex flex-col sm:flex-row gap-2">
            <input
              type="password"
              aria-label="端對端加密金鑰密碼"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder={vault.initialized ? '輸入金鑰密碼以解鎖同步...' : '設定您的個人端對端加密密碼 (至少4字元)'}
              className="flex-1 rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-950 px-3.5 py-2.5 text-sm"
            />
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-1.5 rounded-xl accent-bg px-4 py-2.5 text-xs font-medium min-h-[44px] whitespace-nowrap"
            >
              {vault.unlocked ? <KeyRound className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
              <span>{vault.initialized ? (vault.unlocked ? '驗證 / 更新' : '解鎖金鑰庫') : '建立加密金鑰'}</span>
            </button>
            {vault.unlocked && (
              <button
                type="button"
                onClick={onLockVault}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-stone-200 dark:border-zinc-700 px-3.5 py-2.5 text-xs font-medium min-h-[44px]"
              >
                <Lock className="w-4 h-4" />
                <span>鎖定</span>
              </button>
            )}
          </form>

          {vaultFeedback && (
            <p className="text-xs font-medium accent-text">{vaultFeedback}</p>
          )}

          {sampleCipherPreview && (
            <div className="rounded-xl border border-stone-200 dark:border-zinc-800 bg-stone-50 dark:bg-zinc-950 p-3 space-y-1">
              <p className="text-[11px] font-medium text-stone-600 dark:text-zinc-400">
                即時加密密文驗證預覽（上傳至雲端的實際格式）：
              </p>
              <p className="text-[11px] font-mono text-stone-500 dark:text-zinc-400 break-all">
                iv: {sampleCipherPreview.iv} · cipher: {sampleCipherPreview.ciphertext.slice(0, 76)}...
              </p>
            </div>
          )}
        </section>

        {/* 2. Dark Mode & Custom Themes */}
        <section className="rounded-2xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-stone-900 dark:text-zinc-100">
                深色模式與自訂主題色彩
              </h2>
              <p className="text-xs text-stone-600 dark:text-zinc-400 mt-0.5">
                調整日夜間視覺外觀與重點強調色，讓長時間閱讀更舒適。
              </p>
            </div>
            <PWAInstallButton />
          </div>

          <div>
            <p className="text-xs font-medium text-stone-600 dark:text-zinc-400 mb-2">
              顯示模式
            </p>
            <div className="grid grid-cols-3 gap-2 p-1 rounded-xl bg-stone-100 dark:bg-zinc-800/80">
              {(
                [
                  { id: 'light', label: '淺色模式' },
                  { id: 'dark', label: '深色模式' },
                  { id: 'system', label: '跟隨系統' },
                ] as Array<{ id: ThemeMode; label: string }>
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onUpdateTheme({ ...theme, mode: m.id })}
                  className={`py-2 px-3 rounded-lg text-xs font-medium transition-colors min-h-[40px] ${
                    theme.mode === m.id
                      ? 'bg-white dark:bg-zinc-900 text-stone-900 dark:text-zinc-100 shadow-xs'
                      : 'text-stone-600 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-200'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-stone-600 dark:text-zinc-400 mb-2">
              主題強調色
            </p>
            <div className="flex flex-wrap gap-2">
              {ACCENT_OPTIONS.map((opt) => {
                const active = theme.accent === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onUpdateTheme({ ...theme, accent: opt.id })}
                    className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium min-h-[40px] transition-colors ${
                      active
                        ? 'border-stone-900 dark:border-zinc-100 bg-stone-100 dark:bg-zinc-800 text-stone-900 dark:text-zinc-100'
                        : 'border-stone-200 dark:border-zinc-700 text-stone-700 dark:text-zinc-300 hover:bg-stone-50 dark:hover:bg-zinc-800/50'
                    }`}
                  >
                    <span
                      className="w-3.5 h-3.5 rounded-full shrink-0"
                      style={{ backgroundColor: opt.hex }}
                      aria-hidden="true"
                    />
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      {/* 3. Cloud Sync & Backup / Restore */}
      <section className="rounded-2xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-200 dark:border-zinc-800">
          <div>
            <h2 className="text-base font-semibold text-stone-900 dark:text-zinc-100 flex items-center gap-2">
              <Cloud className="w-4 h-4 accent-text" />
              <span>跨平台雲端同步與設備還原備份</span>
            </h2>
            <p className="text-xs text-stone-600 dark:text-zinc-400 mt-1 tabular-nums">
              {syncStatusText}
              {pendingSyncCount > 0 && ` · 待同步項目 ${pendingSyncCount} 筆`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {user ? (
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-xs text-stone-600 dark:text-zinc-300 truncate max-w-[200px]">
                  {user.email || user.displayName}
                </span>
                {vault.unlocked && (
                  <button
                    type="button"
                    disabled={syncingNow}
                    onClick={() => onSyncNow()}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 dark:border-zinc-700 px-3.5 py-2 text-xs font-medium hover:bg-stone-100 dark:hover:bg-zinc-800 min-h-[40px] disabled:opacity-60"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 accent-text ${syncingNow ? 'animate-spin' : ''}`} />
                    <span>{syncingNow ? '同步中...' : '立即雙向同步'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={onGoogleSignOut}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 dark:border-zinc-700 px-3.5 py-2 text-xs font-medium hover:bg-stone-100 dark:hover:bg-zinc-800 min-h-[40px]"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>登出雲端</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={authLoading}
                onClick={onGoogleSignIn}
                className="inline-flex items-center gap-2 rounded-xl accent-bg px-4 py-2.5 text-xs font-medium min-h-[44px] disabled:opacity-60"
              >
                <Cloud className="w-4 h-4" />
                <span>{authLoading ? '連線中...' : '登入 Google 開啟跨裝置雲端同步'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Cloud Snapshot Controls */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-stone-900 dark:text-zinc-100">
              雲端加密快照備份
            </h3>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                aria-label="備份快照名稱"
                value={backupLabel}
                onChange={(e) => setBackupLabel(e.target.value)}
                placeholder="輸入備份名稱（例如：更換新手機前備份）"
                className="flex-1 rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-950 px-3 py-2 text-xs"
              />
              <button
                type="button"
                disabled={!user || !vault.unlocked}
                onClick={handleCloudBackup}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl accent-bg px-4 py-2 text-xs font-medium min-h-[40px] disabled:opacity-50 whitespace-nowrap"
              >
                <CloudUpload className="w-4 h-4" />
                <span>建立雲端備份</span>
              </button>
            </div>
            {(!user || !vault.unlocked) && (
              <p className="text-xs text-stone-500 dark:text-zinc-400">
                提示：請先登入 Google 帳號並解鎖上方「端對端加密金鑰庫」，即可建立與還原雲端備份。
              </p>
            )}

            {cloudBackups.length > 0 && (
              <div className="space-y-2 pt-2">
                <input
                  type="password"
                  aria-label="還原雲端備份解密密碼"
                  value={restorePassphrase}
                  onChange={(e) => setRestorePassphrase(e.target.value)}
                  placeholder="輸入備份解密密碼（若與目前金鑰相同可留空）"
                  className="w-full rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-950 px-3 py-2 text-xs"
                />
                <ul className="divide-y divide-stone-100 dark:divide-zinc-800 border border-stone-200 dark:border-zinc-800 rounded-xl">
                  {cloudBackups.map((b) => (
                    <li key={b.id} className="px-3.5 py-2.5 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-stone-900 dark:text-zinc-100 truncate">
                          {b.label}
                        </p>
                        <p className="text-[11px] font-mono text-stone-500 dark:text-zinc-400 tabular-nums">
                          {new Date(b.createdAtMs).toLocaleString('zh-TW')} · {b.itemCount} 筆資料
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={async () => {
                            const ok = await onRestoreCloudBackup(b, restorePassphrase.trim());
                            setBackupFeedback(
                              ok ? `已還原備份「${b.label}」` : '解密還原失敗，請確認密碼是否正確。'
                            );
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-stone-200 dark:border-zinc-700 px-2.5 py-1.5 text-xs font-medium hover:bg-stone-100 dark:hover:bg-zinc-800 min-h-[34px]"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>還原</span>
                        </button>
                        <button
                          type="button"
                          aria-label={`刪除備份 ${b.label}`}
                          onClick={() => onDeleteCloudBackup(b.id)}
                          className="p-1.5 rounded-lg text-stone-400 hover:text-rose-600 min-h-[34px] min-w-[34px] flex items-center justify-center"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Offline Encrypted File Archive */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-stone-900 dark:text-zinc-100">
              離線加密檔案匯出 / 還原 (.kairo.json)
            </h3>
            <p className="text-xs text-stone-600 dark:text-zinc-400">
              不依賴特定雲端帳號，可將所有任務、備忘錄與插件打包為 AES-256-GCM 加密檔案存放於隨身碟或任意雲端硬碟。
            </p>
            <input
              type="password"
              aria-label="離線檔案加密密碼"
              value={filePassphrase}
              onChange={(e) => setFilePassphrase(e.target.value)}
              placeholder="輸入離線備份檔加密 / 解密密碼 (至少4字元)"
              className="w-full rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-950 px-3 py-2 text-xs"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleExportFile}
                className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 dark:border-zinc-700 px-4 py-2 text-xs font-medium hover:bg-stone-100 dark:hover:bg-zinc-800 min-h-[40px]"
              >
                <Download className="w-4 h-4 accent-text" />
                <span>匯出加密備份檔</span>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".json"
                onChange={handleImportFile}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 dark:border-zinc-700 px-4 py-2 text-xs font-medium hover:bg-stone-100 dark:hover:bg-zinc-800 min-h-[40px]"
              >
                <Upload className="w-4 h-4" />
                <span>從加密備份檔還原</span>
              </button>
            </div>
            {backupFeedback && (
              <p className="text-xs font-medium accent-text">{backupFeedback}</p>
            )}
          </div>
        </div>
      </section>

      {/* 4. Voice & Auto-Reminder Settings */}
      <section className="rounded-2xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-stone-900 dark:text-zinc-100 flex items-center gap-2">
              <Volume2 className="w-4 h-4 accent-text" />
              <span>語音提醒與系統通知設定</span>
            </h2>
            <p className="text-xs text-stone-600 dark:text-zinc-400 mt-0.5">
              自訂任務到期與會議自動播報的語音速度、提示音效與系統推播權限。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onTestFloatingNotification}
              className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 dark:border-zinc-700 px-3.5 py-2 text-xs font-medium hover:bg-stone-100 dark:hover:bg-zinc-800 min-h-[40px]"
            >
              <BellRing className="w-3.5 h-3.5 accent-text" />
              <span>測試桌面右下 / 手機通知</span>
            </button>
            <button
              type="button"
              onClick={async () => {
                const res = await onRequestBrowserNotifications();
                setNotifStatus(res);
              }}
              className="rounded-xl border border-stone-200 dark:border-zinc-700 px-3.5 py-2 text-xs font-medium hover:bg-stone-100 dark:hover:bg-zinc-800 min-h-[40px]"
            >
              系統通知 ({notifStatus === 'granted' ? '已允許' : notifStatus === 'denied' ? '已封鎖' : '請求授權'})
            </button>
            {isSpeaking ? (
              <button
                type="button"
                onClick={onStopSpeaking}
                className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 text-white px-4 py-2 text-xs font-medium hover:bg-rose-700 min-h-[40px]"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>停止語音</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onTestVoice}
                className="inline-flex items-center gap-1.5 rounded-xl accent-bg px-4 py-2 text-xs font-medium min-h-[40px]"
              >
                <Volume2 className="w-4 h-4" />
                <span>測試語音提醒</span>
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
          <label className="flex items-center gap-2.5 text-sm text-stone-700 dark:text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={voice.enabled}
              onChange={(e) => onUpdateVoice({ ...voice, enabled: e.target.checked })}
              className="h-4 w-4 rounded accent-control"
            />
            <span>啟用語音助理播報</span>
          </label>

          <label className="flex items-center gap-2.5 text-sm text-stone-700 dark:text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={voice.autoSpeakReminders}
              onChange={(e) => onUpdateVoice({ ...voice, autoSpeakReminders: e.target.checked })}
              className="h-4 w-4 rounded accent-control"
            />
            <span>到期自動語音朗讀</span>
          </label>

          <label className="flex items-center gap-2.5 text-sm text-stone-700 dark:text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={voice.playChime}
              onChange={(e) => onUpdateVoice({ ...voice, playChime: e.target.checked })}
              className="h-4 w-4 rounded accent-control"
            />
            <span>播報前播放柔和提示音</span>
          </label>

          <div>
            <label htmlFor="voice-rate" className="block text-xs text-stone-500 dark:text-zinc-400 mb-1 font-mono tabular-nums">
              語音速度: {voice.rate.toFixed(1)}x
            </label>
            <input
              id="voice-rate"
              type="range"
              min="0.7"
              max="1.5"
              step="0.1"
              value={voice.rate}
              onChange={(e) => onUpdateVoice({ ...voice, rate: Number(e.target.value) })}
              className="w-full accent-control"
            />
          </div>
        </div>
      </section>

      {/* 5. DGPA Government Holiday & Typhoon Alert Settings */}
      <section className="rounded-2xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-stone-900 dark:text-zinc-100 flex items-center gap-2">
              <CloudLightning className="w-4 h-4 accent-text" />
              <span>行政院人事行事曆與颱風假自動提醒設定</span>
            </h2>
            <p className="text-xs text-stone-600 dark:text-zinc-400 mt-0.5">
              自動串接政府行政機關辦公日曆表與天然災害停班停課網站（{govLastUpdatedText}）。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={govSyncing}
              onClick={() => onSyncGovNow()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 dark:border-zinc-700 px-3.5 py-2 text-xs font-medium hover:bg-stone-100 dark:hover:bg-zinc-800 min-h-[40px] disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${govSyncing ? 'animate-spin' : ''}`} />
              <span>{govSyncing ? '同步中...' : '立即同步政府公告'}</span>
            </button>
            <button
              type="button"
              onClick={onTestTyphoonVoice}
              className="inline-flex items-center gap-1.5 rounded-xl accent-bg px-4 py-2 text-xs font-medium min-h-[40px]"
            >
              <Volume2 className="w-4 h-4" />
              <span>試聽颱風假警報</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2 items-center">
          <label className="flex items-center gap-2.5 text-sm text-stone-700 dark:text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={govSettings.enabled}
              onChange={(e) => onUpdateGovSettings({ ...govSettings, enabled: e.target.checked })}
              className="h-4 w-4 rounded accent-control"
            />
            <span>啟用人事總處自動同步與提醒</span>
          </label>

          <label className="flex items-center gap-2.5 text-sm text-stone-700 dark:text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={govSettings.autoSpeakGovAlerts}
              onChange={(e) =>
                onUpdateGovSettings({ ...govSettings, autoSpeakGovAlerts: e.target.checked })
              }
              className="h-4 w-4 rounded accent-control"
            />
            <span>停班停課與國定假日自動語音</span>
          </label>

          <div>
            <label
              htmlFor="gov-monitored-city"
              className="block text-xs text-stone-500 dark:text-zinc-400 mb-1"
            >
              監測颱風假縣市
            </label>
            <select
              id="gov-monitored-city"
              value={govSettings.monitoredCity}
              onChange={(e) =>
                onUpdateGovSettings({ ...govSettings, monitoredCity: e.target.value })
              }
              className="w-full rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-950 px-3 py-2 text-xs text-stone-800 dark:text-zinc-200 min-h-[40px]"
            >
              {TAIWAN_CITIES.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="gov-holiday-days"
              className="block text-xs text-stone-500 dark:text-zinc-400 mb-1"
            >
              國定假日提前提醒天數
            </label>
            <select
              id="gov-holiday-days"
              value={govSettings.holidayRemindDaysAhead}
              onChange={(e) =>
                onUpdateGovSettings({
                  ...govSettings,
                  holidayRemindDaysAhead: Number(e.target.value),
                })
              }
              className="w-full rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-950 px-3 py-2 text-xs text-stone-800 dark:text-zinc-200 min-h-[40px]"
            >
              <option value={0}>當天提醒</option>
              <option value={1}>提前 1 天</option>
              <option value={3}>提前 3 天</option>
              <option value={7}>提前 7 天</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 pt-1 text-xs border-t border-stone-100 dark:border-zinc-800/80">
          <span className="text-stone-500 dark:text-zinc-400">官方資料來源：</span>
          <a
            href={DGPA_PORTAL_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 accent-text hover:underline font-medium"
          >
            <span>行政院人事行政總處全球資訊網</span>
            <ExternalLink className="w-3 h-3" />
          </a>
          <a
            href={DGPA_TYPHOON_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 accent-text hover:underline font-medium"
          >
            <span>天然災害停止上班及上課即時查詢</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </section>

      {/* 6. How to Install as Desktop & Mobile App */}
      <section
        aria-labelledby="install-guide-heading"
        className="rounded-2xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-100 dark:border-zinc-800">
          <div>
            <h2
              id="install-guide-heading"
              className="text-base font-semibold text-stone-900 dark:text-zinc-100 flex items-center gap-2"
            >
              <MonitorSmartphone className="w-4 h-4 accent-text" />
              <span>如何安裝為應用程式</span>
            </h2>
            <p className="text-xs text-stone-600 dark:text-zinc-400 mt-0.5">
              將 Kairo 隨行助理釘選到電腦桌面、工作列、Dock 或手機主畫面，享有獨立視窗、離線存取與右下角提醒通知。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCopyAppUrl}
              className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 dark:border-zinc-700 px-3.5 py-2 text-xs font-medium text-stone-700 dark:text-zinc-200 hover:bg-stone-100 dark:hover:bg-zinc-800 min-h-[40px]"
            >
              {copiedAppUrl ? (
                <Check className="w-3.5 h-3.5 accent-text" />
              ) : (
                <Copy className="w-3.5 h-3.5 accent-text" />
              )}
              <span>{copiedAppUrl ? '已複製網址' : '複製獨立開啟網址'}</span>
            </button>
            <PWAInstallButton label="立即安裝為應用程式" />
          </div>
        </div>

        {isInIframe && (
          <div className="rounded-xl border border-amber-300/70 dark:border-amber-700/60 bg-amber-50/70 dark:bg-amber-950/30 px-4 py-3 text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
            提醒：偵測到目前正在內嵌預覽視窗中開啟。瀏覽器僅會在獨立分頁提供「安裝此應用程式」功能，建議先複製上方網址並於 Chrome 或 Edge 新分頁開啟，再進行桌面釘選。
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-stone-200 dark:border-zinc-800 bg-stone-50 dark:bg-zinc-950 p-4 space-y-2">
            <h3 className="text-xs font-semibold text-stone-900 dark:text-zinc-100">
              Google Chrome（Windows / macOS）
            </h3>
            <ol className="list-decimal list-inside space-y-1.5 text-xs text-stone-600 dark:text-zinc-300 leading-relaxed">
              <li>
                方法一（網址列）：點擊網址列最右側的「安裝 Kairo 隨行助理」圖示，再按「安裝」。
              </li>
              <li>
                方法二（安裝此應用程式）：點擊右上角「⋮」選單 →「投放、儲存及分享」→「安裝『Kairo 隨行助理』…」。
              </li>
              <li>
                方法三（建立捷徑釘選桌面）：點擊「⋮」→「投放、儲存及分享」→「建立捷徑…」，輸入名稱並勾選「以視窗開啟」，即可直接釘選至電腦桌面與工作列。
              </li>
            </ol>
          </div>

          <div className="rounded-xl border border-stone-200 dark:border-zinc-800 bg-stone-50 dark:bg-zinc-950 p-4 space-y-2">
            <h3 className="text-xs font-semibold text-stone-900 dark:text-zinc-100">
              Microsoft Edge（Windows / macOS）
            </h3>
            <ol className="list-decimal list-inside space-y-1.5 text-xs text-stone-600 dark:text-zinc-300 leading-relaxed">
              <li>
                方法一（網址列）：點擊網址列右側的「應用程式可用」圖示，確認安裝即可啟動獨立視窗。
              </li>
              <li>
                方法二（選單安裝）：點擊右上角「⋯」設定選單 →「應用程式」→「將此網站安裝為應用程式」。
              </li>
              <li>
                安裝後在視窗右上角或工作列右鍵點擊圖示，即可勾選「釘選到工作列」、「釘選到桌面」或「登入時自動啟動」。
              </li>
            </ol>
          </div>

          <div className="rounded-xl border border-stone-200 dark:border-zinc-800 bg-stone-50 dark:bg-zinc-950 p-4 space-y-2">
            <h3 className="text-xs font-semibold text-stone-900 dark:text-zinc-100">
              macOS Safari 與手機主畫面（iOS / Android）
            </h3>
            <ul className="list-disc list-inside space-y-1.5 text-xs text-stone-600 dark:text-zinc-300 leading-relaxed">
              <li>
                macOS Safari：上方選單列「檔案」→「加入 Dock」，即可釘選至 Mac 桌面 Dock。
              </li>
              <li>
                Android Chrome：點右上角「⋮」→「安裝應用程式」或「加到主畫面」，提醒將顯示於頂部通知欄。
              </li>
              <li>
                iPhone / iPad Safari：點底部「分享」按鈕 →「加入主畫面」，即可全螢幕獨立使用。
              </li>
            </ul>
          </div>

          <div className="rounded-xl border border-stone-200 dark:border-zinc-800 bg-stone-50 dark:bg-zinc-950 p-4 space-y-2">
            <h3 className="text-xs font-semibold text-stone-900 dark:text-zinc-100">
              安裝後的桌面優勢與注意事項
            </h3>
            <ul className="list-disc list-inside space-y-1.5 text-xs text-stone-600 dark:text-zinc-300 leading-relaxed">
              <li>
                獨立視窗運行，不與其他網頁分頁混雜，並具備專屬桌面圖示與視窗標題列。
              </li>
              <li>
                內建 Service Worker 與 IndexedDB，無網路時仍可瀏覽與編輯排程、備忘錄與名片。
              </li>
              <li>
                於上方「語音提醒與系統通知設定」允許系統通知後，重要排程與颱風假會在電腦右下角同步彈出。
              </li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
};
