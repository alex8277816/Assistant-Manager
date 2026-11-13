import React, { useEffect, useMemo, useState } from 'react';
import {
  Copy,
  Download,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Send,
  Trash2,
  Volume2,
} from 'lucide-react';
import type {
  MemoItem,
  PluginLogEntry,
  PriorityLevel,
  TaskItem,
  WorkflowPlugin,
} from '../types/assistant';
import { exportTasksToMarkdown } from '../utils/pluginEngine';

interface PluginsViewProps {
  plugins: WorkflowPlugin[];
  tasks: TaskItem[];
  memos: MemoItem[];
  selectedDate: string;
  focusedTaskId: string | null;
  onSelectFocusTask: (id: string | null) => void;
  onTogglePlugin: (id: string) => void;
  onAddRulePlugin: (plugin: Omit<WorkflowPlugin, 'id' | 'runCount' | 'syncStatus' | 'updatedAt'>) => void;
  onDeletePlugin: (id: string) => void;
  onUpdateWebhookUrl: (id: string, url: string) => void;
  onSpeakBriefing: () => void;
  onSpeakNotice: (text: string) => void;
  pluginLogs: PluginLogEntry[];
  onTriggerWebhookTest: (plugin: WorkflowPlugin) => void;
}

export const PluginsView: React.FC<PluginsViewProps> = ({
  plugins,
  tasks,
  memos,
  selectedDate,
  focusedTaskId,
  onSelectFocusTask,
  onTogglePlugin,
  onAddRulePlugin,
  onDeletePlugin,
  onUpdateWebhookUrl,
  onSpeakBriefing,
  onSpeakNotice,
  pluginLogs,
  onTriggerWebhookTest,
}) => {
  // Pomodoro Timer State
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [timerRunning, setTimerRunning] = useState(false);

  // Markdown preview & copy state
  const [copiedMd, setCopiedMd] = useState(false);

  // Webhook URL local state
  const webhookPlugin = plugins.find((p) => p.kind === 'webhook');
  const [webhookUrl, setWebhookUrl] = useState(webhookPlugin?.config.webhookUrl || 'https://httpbin.org/post');

  // New Custom Rule Form
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [ruleName, setRuleName] = useState('');
  const [ruleKeyword, setRuleKeyword] = useState('');
  const [ruleTag, setRuleTag] = useState('');
  const [rulePriority, setRulePriority] = useState<PriorityLevel>('high');
  const [ruleReminder, setRuleReminder] = useState(15);
  const [ruleError, setRuleError] = useState('');

  const activeTasks = useMemo(
    () => tasks.filter((t) => !t.deleted && !t.completed),
    [tasks]
  );

  const focusedTask = useMemo(
    () => activeTasks.find((t) => t.id === focusedTaskId) || activeTasks[0] || null,
    [activeTasks, focusedTaskId]
  );

  useEffect(() => {
    if (!timerRunning) return;
    const id = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          setTimerRunning(false);
          onSpeakNotice(
            focusedTask
              ? `專注計時結束，任務「${focusedTask.title}」已完成一個番茄鐘，建議休息五分鐘。`
              : '番茄鐘專注時段結束，建議起身休息五分鐘。'
          );
          return 25 * 60;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [timerRunning, focusedTask, onSpeakNotice]);

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');

  const markdownPreview = useMemo(
    () => exportTasksToMarkdown(tasks, memos, selectedDate),
    [tasks, memos, selectedDate]
  );

  const handleCopyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(markdownPreview);
      setCopiedMd(true);
      setTimeout(() => setCopiedMd(false), 2000);
    } catch {
      // ignore clipboard errors in headless mode
    }
  };

  const handleDownloadMarkdown = () => {
    const blob = new Blob([markdownPreview], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kairo-digest-${selectedDate}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCreateRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleName.trim() || !ruleKeyword.trim()) {
      setRuleError('請填寫插件規則名稱與觸發關鍵字');
      return;
    }
    onAddRulePlugin({
      name: ruleName.trim(),
      description: `當新增任務包含「${ruleKeyword.trim()}」時，自動套用自訂標籤與優先提醒。`,
      author: '使用者自訂工作流',
      version: '1.0.0',
      kind: 'rule',
      enabled: true,
      config: {
        trigger: 'on_task_create',
        keywordMatch: ruleKeyword.trim(),
        addTag: ruleTag.trim() || undefined,
        setPriority: rulePriority,
        setReminderMinutes: ruleReminder,
        enableVoice: true,
      },
    });
    setRuleName('');
    setRuleKeyword('');
    setRuleTag('');
    setRuleError('');
    setShowRuleForm(false);
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-stone-900 dark:text-zinc-100">
            第三方插件擴充與自動化工作流
          </h1>
          <p className="text-sm text-stone-600 dark:text-zinc-400 mt-0.5">
            啟用內建生產力模組、串接外部 Webhook 或建立自訂觸發規則以自動化每日排程。
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowRuleForm((prev) => !prev)}
          className="inline-flex items-center gap-2 rounded-xl accent-bg px-4 py-2.5 text-xs font-medium min-h-[44px] whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>{showRuleForm ? '收合規則表單' : '新增自動化規則插件'}</span>
        </button>
      </section>

      {showRuleForm && (
        <section className="rounded-2xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <h2 className="text-base font-semibold text-stone-900 dark:text-zinc-100 mb-3">
            建立自訂工作流插件規則
          </h2>
          <form onSubmit={handleCreateRule} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label htmlFor="rule-name" className="block text-xs font-medium text-stone-600 dark:text-zinc-400 mb-1">
                規則插件名稱 *
              </label>
              <input
                id="rule-name"
                type="text"
                value={ruleName}
                onChange={(e) => setRuleName(e.target.value)}
                placeholder="例如：客戶提案自動加急"
                className="w-full rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-950 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="rule-keyword" className="block text-xs font-medium text-stone-600 dark:text-zinc-400 mb-1">
                觸發關鍵字 *
              </label>
              <input
                id="rule-keyword"
                type="text"
                value={ruleKeyword}
                onChange={(e) => setRuleKeyword(e.target.value)}
                placeholder="例如：提案、報告、繳費"
                className="w-full rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-950 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="rule-tag" className="block text-xs font-medium text-stone-600 dark:text-zinc-400 mb-1">
                自動附加標籤
              </label>
              <input
                id="rule-tag"
                type="text"
                value={ruleTag}
                onChange={(e) => setRuleTag(e.target.value)}
                placeholder="例如：必辦"
                className="w-full rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-950 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="rule-priority" className="block text-xs font-medium text-stone-600 dark:text-zinc-400 mb-1">
                自動設定優先級
              </label>
              <select
                id="rule-priority"
                value={rulePriority}
                onChange={(e) => setRulePriority(e.target.value as PriorityLevel)}
                className="w-full rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-950 px-3 py-2 text-sm"
              >
                <option value="urgent">緊急</option>
                <option value="high">高優先</option>
                <option value="medium">中優先</option>
                <option value="low">低優先</option>
              </select>
            </div>
            <div>
              <label htmlFor="rule-reminder" className="block text-xs font-medium text-stone-600 dark:text-zinc-400 mb-1">
                提前語音提醒
              </label>
              <select
                id="rule-reminder"
                value={ruleReminder}
                onChange={(e) => setRuleReminder(Number(e.target.value))}
                className="w-full rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-950 px-3 py-2 text-sm"
              >
                <option value={5}>提前 5 分鐘</option>
                <option value={15}>提前 15 分鐘</option>
                <option value={30}>提前 30 分鐘</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                className="w-full rounded-xl accent-bg px-4 py-2.5 text-sm font-medium min-h-[42px]"
              >
                安裝並啟用規則
              </button>
            </div>
          </form>
          {ruleError && <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{ruleError}</p>}
        </section>
      )}

      {/* Interactive Plugin Workbench Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Plugin 1: Pomodoro Focus Timer */}
        <section className="rounded-2xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-stone-900 dark:text-zinc-100">
                番茄鐘專注計時器
              </h2>
              <p className="text-xs text-stone-500 dark:text-zinc-400">
                鎖定單一待辦任務進入 25 分鐘深度專注
              </p>
            </div>
            <span className="text-3xl font-mono font-semibold tabular-nums text-stone-900 dark:text-zinc-100">
              {mm}:{ss}
            </span>
          </div>

          <div>
            <label htmlFor="pomodoro-task-select" className="block text-xs text-stone-500 dark:text-zinc-400 mb-1">
              選擇當前專注任務
            </label>
            <select
              id="pomodoro-task-select"
              value={focusedTask?.id || ''}
              onChange={(e) => onSelectFocusTask(e.target.value || null)}
              className="w-full rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-950 px-3 py-2 text-xs text-stone-800 dark:text-zinc-200"
            >
              {activeTasks.length === 0 ? (
                <option value="">目前無待辦任務</option>
              ) : (
                activeTasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title} ({t.dueDate})
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setTimerRunning((r) => !r)}
              className="inline-flex items-center gap-2 rounded-xl accent-bg px-4 py-2 text-xs font-medium min-h-[40px]"
            >
              {timerRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              <span>{timerRunning ? '暫停計時' : '開始專注'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setTimerRunning(false);
                setSecondsLeft(25 * 60);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 dark:border-zinc-700 px-3.5 py-2 text-xs font-medium text-stone-700 dark:text-zinc-300 hover:bg-stone-100 dark:hover:bg-zinc-800 min-h-[40px]"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>重設 25:00</span>
            </button>
            <button
              type="button"
              onClick={onSpeakBriefing}
              className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-stone-200 dark:border-zinc-700 px-3.5 py-2 text-xs font-medium text-stone-700 dark:text-zinc-300 hover:bg-stone-100 dark:hover:bg-zinc-800 min-h-[40px]"
            >
              <Volume2 className="w-3.5 h-3.5 accent-text" />
              <span>語音簡報</span>
            </button>
          </div>
        </section>

        {/* Plugin 2: Markdown Digest & Webhook Connector */}
        <section className="rounded-2xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-stone-900 dark:text-zinc-100">
                Markdown 日報匯出 & Webhook
              </h2>
              <p className="text-xs text-stone-500 dark:text-zinc-400">
                匯出每日筆記摘要或觸發外部自動化端點
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyMarkdown}
                className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium min-h-[38px]"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{copiedMd ? '已複製' : '複製 MD'}</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadMarkdown}
                className="inline-flex items-center gap-1.5 rounded-lg accent-bg px-3 py-1.5 text-xs font-medium min-h-[38px]"
              >
                <Download className="w-3.5 h-3.5" />
                <span>下載</span>
              </button>
            </div>
          </div>

          <pre className="rounded-xl border border-stone-200 dark:border-zinc-800 bg-stone-50 dark:bg-zinc-950 p-3 text-xs font-mono text-stone-700 dark:text-zinc-300 max-h-32 overflow-y-auto whitespace-pre-wrap">
            {markdownPreview}
          </pre>

          {webhookPlugin && (
            <div className="pt-2 border-t border-stone-200 dark:border-zinc-800 flex flex-col sm:flex-row gap-2">
              <input
                type="url"
                aria-label="Webhook 端點網址"
                value={webhookUrl}
                onChange={(e) => {
                  setWebhookUrl(e.target.value);
                  onUpdateWebhookUrl(webhookPlugin.id, e.target.value);
                }}
                placeholder="https://hooks.example.com/..."
                className="flex-1 rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-950 px-3 py-2 text-xs font-mono"
              />
              <button
                type="button"
                onClick={() => onTriggerWebhookTest(webhookPlugin)}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-stone-200 dark:border-zinc-700 px-3.5 py-2 text-xs font-medium hover:bg-stone-100 dark:hover:bg-zinc-800 min-h-[38px] whitespace-nowrap"
              >
                <Send className="w-3.5 h-3.5 accent-text" />
                <span>發送測試事件</span>
              </button>
            </div>
          )}
        </section>
      </div>

      {/* Installed Plugins Registry List */}
      <section className="rounded-2xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-stone-200 dark:border-zinc-800">
          <h2 className="text-base font-semibold text-stone-900 dark:text-zinc-100">
            已安裝擴充插件 ({plugins.length})
          </h2>
        </div>
        <ul className="divide-y divide-stone-100 dark:divide-zinc-800">
          {plugins.map((plugin) => (
            <li key={plugin.id} className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-stone-900 dark:text-zinc-100">
                  {plugin.name}
                </p>
                <p className="text-xs text-stone-600 dark:text-zinc-400 mt-0.5">
                  {plugin.description}
                </p>
                <p className="text-[11px] font-mono text-stone-400 dark:text-zinc-500 mt-1 tabular-nums">
                  {plugin.author} · v{plugin.version} · 已執行 {plugin.runCount} 次
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {plugin.kind === 'rule' && (
                  <button
                    type="button"
                    onClick={() => onDeletePlugin(plugin.id)}
                    aria-label={`移除規則插件「${plugin.name}」`}
                    className="p-2 rounded-lg text-stone-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 min-h-[40px] min-w-[40px] flex items-center justify-center"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="button"
                  role="switch"
                  aria-checked={plugin.enabled}
                  aria-label={`切換「${plugin.name}」啟用狀態`}
                  onClick={() => onTogglePlugin(plugin.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-medium transition-colors min-h-[40px] whitespace-nowrap ${
                    plugin.enabled
                      ? 'accent-bg'
                      : 'border border-stone-200 dark:border-zinc-700 text-stone-600 dark:text-zinc-400 hover:bg-stone-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  {plugin.enabled ? '已啟用' : '已停用'}
                </button>
              </div>
            </li>
          ))}
        </ul>

        {pluginLogs.length > 0 && (
          <div className="px-5 py-3 bg-stone-50 dark:bg-zinc-950 border-t border-stone-200 dark:border-zinc-800">
            <p className="text-xs font-medium text-stone-600 dark:text-zinc-400 mb-1.5">
              最近插件執行紀錄
            </p>
            <ul className="space-y-1 text-xs font-mono text-stone-500 dark:text-zinc-400">
              {pluginLogs.slice(0, 4).map((log) => (
                <li key={log.id}>
                  {new Date(log.timestamp).toLocaleTimeString('zh-TW')} · {log.pluginName} · {log.message}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
};
