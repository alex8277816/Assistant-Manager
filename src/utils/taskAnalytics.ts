import type { TaskItem } from '../types/assistant';

export interface CompletionSlice {
  name: string;
  value: number;
  color: string;
}

export interface CategoryDistributionItem {
  name: string;
  total: number;
  completed: number;
  pending: number;
  color: string;
}

export interface DayTaskAnalytics {
  dateStr: string;
  total: number;
  completed: number;
  pending: number;
  meetingTotal: number;
  completionRate: number;
  completionSlices: CompletionSlice[];
  categoryDistribution: CategoryDistributionItem[];
}

const CATEGORY_COLORS: Record<string, string> = {
  預定會議: '#0d9488',
  開發: '#4f46e5',
  工作: '#0284c7',
  財務: '#d97706',
  健康: '#059669',
  學習: '#7c3aed',
  個人: '#e11d48',
  一般待辦: '#78716c',
};

const FALLBACK_PALETTE = [
  '#0d9488',
  '#4f46e5',
  '#d97706',
  '#059669',
  '#0284c7',
  '#e11d48',
];

export function resolveTaskTypeLabel(task: TaskItem): string {
  if (task.isMeeting) return '預定會議';
  const firstTag = task.tags.find((t) => t.trim().length > 0);
  return firstTag ? firstTag.trim() : '一般待辦';
}

export function computeDayTaskAnalytics(
  tasks: TaskItem[],
  dateStr: string
): DayTaskAnalytics {
  const dayTasks = tasks.filter((t) => !t.deleted && t.dueDate === dateStr);
  const total = dayTasks.length;
  const completed = dayTasks.filter((t) => t.completed).length;
  const pending = total - completed;
  const meetingTotal = dayTasks.filter((t) => t.isMeeting).length;
  const completionRate = total === 0 ? 0 : Math.round((completed / total) * 100);

  const completionSlices: CompletionSlice[] =
    total === 0
      ? []
      : [
          { name: '已完成', value: completed, color: '#0d9488' },
          { name: '待完成', value: pending, color: '#cbd5e1' },
        ];

  const categoryMap = new Map<string, { completed: number; pending: number }>();
  for (const task of dayTasks) {
    const label = resolveTaskTypeLabel(task);
    const entry = categoryMap.get(label) ?? { completed: 0, pending: 0 };
    if (task.completed) {
      entry.completed += 1;
    } else {
      entry.pending += 1;
    }
    categoryMap.set(label, entry);
  }

  const categoryDistribution: CategoryDistributionItem[] = Array.from(
    categoryMap.entries()
  )
    .map(([name, counts], idx) => ({
      name,
      total: counts.completed + counts.pending,
      completed: counts.completed,
      pending: counts.pending,
      color:
        CATEGORY_COLORS[name] ??
        FALLBACK_PALETTE[idx % FALLBACK_PALETTE.length],
    }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'zh-Hant'));

  return {
    dateStr,
    total,
    completed,
    pending,
    meetingTotal,
    completionRate,
    completionSlices,
    categoryDistribution,
  };
}
