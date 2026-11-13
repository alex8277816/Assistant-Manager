import type { MemoItem, TaskItem, WorkflowPlugin } from '../types/assistant';

export interface PluginExecutionSummary {
  task: TaskItem;
  appliedPluginNames: string[];
}

export function applyWorkflowPlugins(
  task: TaskItem,
  plugins: WorkflowPlugin[],
  trigger: 'on_task_create' | 'on_task_complete'
): PluginExecutionSummary {
  let updated = { ...task, tags: [...task.tags] };
  const appliedPluginNames: string[] = [];

  for (const plugin of plugins) {
    if (!plugin.enabled || plugin.kind !== 'rule') continue;
    if (plugin.config.trigger !== trigger) continue;

    const kw = plugin.config.keywordMatch.trim().toLowerCase();
    const haystack = `${updated.title} ${updated.notes} ${updated.tags.join(' ')}`.toLowerCase();
    if (kw && !haystack.includes(kw)) continue;

    let changed = false;
    if (plugin.config.addTag && !updated.tags.includes(plugin.config.addTag)) {
      updated.tags.push(plugin.config.addTag);
      changed = true;
    }
    if (plugin.config.setPriority && updated.priority !== plugin.config.setPriority) {
      updated.priority = plugin.config.setPriority;
      changed = true;
    }
    if (
      typeof plugin.config.setReminderMinutes === 'number' &&
      plugin.config.setReminderMinutes >= 0
    ) {
      updated.reminderMinutes = plugin.config.setReminderMinutes;
      changed = true;
    }
    if (typeof plugin.config.enableVoice === 'boolean') {
      updated.voiceReminder = plugin.config.enableVoice;
      changed = true;
    }

    if (changed) {
      appliedPluginNames.push(plugin.name);
    }
  }

  return { task: updated, appliedPluginNames };
}

export function exportTasksToMarkdown(
  tasks: TaskItem[],
  memos: MemoItem[],
  dateStr: string
): string {
  const dayTasks = tasks.filter((t) => !t.deleted && t.dueDate === dateStr);
  const pinnedMemos = memos.filter((m) => !m.deleted && m.pinned);

  const lines: string[] = [
    `# Kairo 每日行動摘要 (${dateStr})`,
    '',
    '## 今日排程與任務',
  ];

  if (dayTasks.length === 0) {
    lines.push('- 今日尚無排程項目');
  } else {
    for (const t of dayTasks) {
      const check = t.completed ? 'x' : ' ';
      const time = t.startTime ? `\`${t.startTime}\` ` : '';
      const tags = t.tags.length ? ` (${t.tags.join(' / ')})` : '';
      lines.push(`- [${check}] ${time}**${t.title}**${tags}`);
    }
  }

  if (pinnedMemos.length > 0) {
    lines.push('', '## 置頂加密備忘錄');
    for (const m of pinnedMemos) {
      lines.push(`### ${m.title}`, m.content || '(無內文)', '');
    }
  }

  return lines.join('\n');
}
