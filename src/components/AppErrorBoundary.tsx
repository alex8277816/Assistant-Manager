import React from 'react';

interface AppErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
  clearing: boolean;
}

export async function clearAppCachesAndReload(): Promise<void> {
  try {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
    }
  } catch {
    // ignore
  }

  try {
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
    }
  } catch {
    // ignore
  }

  try {
    sessionStorage.removeItem('kairo_boot_recover_v1');
  } catch {
    // ignore
  }

  window.location.reload();
}

export class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  AppErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
      clearing: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<AppErrorBoundaryState> {
    return {
      hasError: true,
      errorMessage: error?.message || '頁面載入時發生未預期的錯誤',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Kairo UI ErrorBoundary caught error:', error, info?.componentStack);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen bg-stone-50 dark:bg-zinc-950 text-stone-900 dark:text-zinc-100 flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-lg space-y-4">
          <div className="space-y-1">
            <h1 className="text-base font-bold text-stone-900 dark:text-zinc-100">
              Kairo 隨行助理頁面需要重新整理
            </h1>
            <p className="text-xs text-stone-600 dark:text-zinc-400 leading-relaxed">
              偵測到瀏覽器暫存檔案或資料格式異常。系統不會刪除您儲存在本機的排程、名片或加密備忘錄，請點擊下方按鈕清除舊快取並重新載入。
            </p>
          </div>

          {this.state.errorMessage && (
            <div className="rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 px-3 py-2 text-[11px] font-mono text-rose-700 dark:text-rose-300 break-words">
              {this.state.errorMessage}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <button
              type="button"
              disabled={this.state.clearing}
              onClick={() => {
                this.setState({ clearing: true });
                clearAppCachesAndReload();
              }}
              className="flex-1 rounded-xl bg-teal-700 hover:bg-teal-800 text-white px-4 py-2.5 text-xs font-medium min-h-[42px] disabled:opacity-60"
            >
              {this.state.clearing ? '正在清除快取...' : '清除快取並重新載入'}
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-xl border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-stone-100 dark:hover:bg-zinc-800 text-stone-700 dark:text-zinc-200 px-4 py-2.5 text-xs font-medium min-h-[42px]"
            >
              僅重新整理
            </button>
          </div>
        </div>
      </div>
    );
  }
}
