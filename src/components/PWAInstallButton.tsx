import React, { useState } from 'react';
import { Download, MonitorSmartphone, WifiOff, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const PWAInstallButton: React.FC<{ compact?: boolean; label?: string }> = ({
  compact = false,
  label = '安裝至桌面 / 手機',
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (accepted) return;
    }
    setShowGuideModal(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex items-center gap-2 rounded-lg border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-medium text-stone-700 dark:text-zinc-200 hover:bg-stone-100 dark:hover:bg-zinc-800 transition-colors whitespace-nowrap shrink-0 min-h-[40px]"
      >
        <Download className="w-4 h-4 accent-text" />
        {!compact && <span>{isIOS ? '加入手機主畫面' : label}</span>}
      </button>

      {showGuideModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="安裝 Kairo 助理至電腦或手機桌面"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
        >
          <div className="w-full max-w-md rounded-2xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <MonitorSmartphone className="w-5 h-5 accent-text" />
                <h3 className="text-base font-semibold text-stone-900 dark:text-zinc-100">
                  安裝行事曆助理至電腦與手機桌面
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                aria-label="關閉安裝說明"
                className="p-2 rounded-lg text-stone-500 hover:bg-stone-100 dark:hover:bg-zinc-800 min-h-[40px] min-w-[40px] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-stone-600 dark:text-zinc-300 leading-relaxed">
              <div className="rounded-xl border border-stone-200 dark:border-zinc-800 bg-stone-50 dark:bg-zinc-950 p-3 space-y-1">
                <p className="font-semibold text-stone-900 dark:text-zinc-100">
                  電腦桌面 (Windows / macOS Chrome / Edge)
                </p>
                <p>
                  點擊瀏覽器網址列右側的「安裝應用程式」圖示，或開啟右上角選單 →「應用程式 / 儲存並分享」→「安裝 Kairo 隨行助理」，即可建立獨立視窗捷徑並於桌面右下角接收提醒。
                </p>
              </div>

              <div className="rounded-xl border border-stone-200 dark:border-zinc-800 bg-stone-50 dark:bg-zinc-950 p-3 space-y-1">
                <p className="font-semibold text-stone-900 dark:text-zinc-100">
                  Android 手機桌面 (Chrome)
                </p>
                <p>
                  點擊右上角「⋮」選單 →「安裝應用程式」或「加到主畫面」，通知將直接顯示於手機頂部通知欄。
                </p>
              </div>

              <div className="rounded-xl border border-stone-200 dark:border-zinc-800 bg-stone-50 dark:bg-zinc-950 p-3 space-y-1">
                <p className="font-semibold text-stone-900 dark:text-zinc-100">
                  iPhone / iPad (Safari)
                </p>
                <p>
                  點擊 Safari 工具列「分享」按鈕 → 向下捲動選擇「加入主畫面」，即可如原生 App 般全螢幕開啟與離線使用。
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowGuideModal(false)}
              className="w-full rounded-xl accent-bg py-2.5 text-sm font-medium min-h-[44px]"
            >
              我知道了
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineBanner: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-amber-600 text-white px-4 py-1.5 text-xs font-medium"
    >
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      <span>目前處於離線模式 — 所有任務、名片與加密備忘錄已儲存在本機 IndexedDB，連線後自動同步。</span>
    </div>
  );
};
