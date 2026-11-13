import type { PriorityLevel, SortMode, TaskItem } from '../types/assistant';

const TAG_RULES: Array<{ tag: string; keywords: string[] }> = [
  { tag: '會議', keywords: ['會議', '開會', '評審', '討論', '簡報', 'sync', 'meeting', 'standup', '1:1', 'call'] },
  { tag: '工作', keywords: ['專案', '客戶', '報告', '企劃', '交付', '合約', '報表', 'project', 'client', 'review', 'deploy'] },
  { tag: '開發', keywords: ['程式', '修復', '測試', '上線', 'api', 'bug', 'code', 'git', 'ui', '資料庫', '加密'] },
  { tag: '財務', keywords: ['繳費', '帳單', '報帳', '發票', '轉帳', '預算', '稅', 'invoice', 'bill', 'budget'] },
  { tag: '健康', keywords: ['運動', '健身', '跑步', '看診', '牙醫', '體檢', '喝水', '冥想', 'gym', 'doctor', 'run'] },
  { tag: '學習', keywords: ['閱讀', '課程', '筆記', '練習', '論文', '書', 'study', 'read', 'course'] },
  { tag: '生活', keywords: ['採買', '超市', '寄件', '打掃', '洗衣', '聚餐', '旅行', 'grocery', 'home', 'travel'] },
];

export function inferSmartTags(title: string, notes: string, explicitTags: string[] = []): string[] {
  const combined = `${title} ${notes}`.toLowerCase();
  const result = new Set<string>(explicitTags.map((t) => t.trim()).filter(Boolean));

  for (const rule of TAG_RULES) {
    if (rule.keywords.some((kw) => combined.includes(kw.toLowerCase()))) {
      result.add(rule.tag);
    }
  }

  if (result.size === 0) {
    result.add('日常');
  }

  return Array.from(result).slice(0, 5);
}

export function addDaysToDateStr(dateStr: string, offsetDays: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + offsetDays));
  return dt.toISOString().slice(0, 10);
}

export interface ParsedQuickTask {
  title: string;
  dueDate: string;
  startTime?: string;
  priority: PriorityLevel;
  tags: string[];
  isMeeting: boolean;
}

export function parseQuickTaskInput(raw: string, baseDateStr: string): ParsedQuickTask {
  let working = raw.trim();
  let dueDate = baseDateStr;
  let startTime: string | undefined;
  let priority: PriorityLevel = 'medium';
  const explicitTags: string[] = [];

  // Extract #tags
  working = working.replace(/#([\p{L}\p{N}_-]+)/gu, (_, tag) => {
    explicitTags.push(tag);
    return '';
  });

  // Extract priority markers (!緊急, !高, !中, !低, !urgent, !high, !low)
  if (/!(緊急|urgent)/i.test(working)) {
    priority = 'urgent';
    working = working.replace(/!(緊急|urgent)/gi, '');
  } else if (/!(高|high)/i.test(working)) {
    priority = 'high';
    working = working.replace(/!(高|high)/gi, '');
  } else if (/!(低|low)/i.test(working)) {
    priority = 'low';
    working = working.replace(/!(低|low)/gi, '');
  } else if (/!(中|medium)/i.test(working)) {
    priority = 'medium';
    working = working.replace(/!(中|medium)/gi, '');
  }

  // Extract relative date tokens
  if (/後天/.test(working)) {
    dueDate = addDaysToDateStr(baseDateStr, 2);
    working = working.replace(/後天/g, '');
  } else if (/明天|tomorrow/i.test(working)) {
    dueDate = addDaysToDateStr(baseDateStr, 1);
    working = working.replace(/明天|tomorrow/gi, '');
  } else if (/今天|today/i.test(working)) {
    dueDate = baseDateStr;
    working = working.replace(/今天|today/gi, '');
  }

  // Extract explicit YYYY-MM-DD
  const isoDateMatch = working.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (isoDateMatch) {
    dueDate = isoDateMatch[1];
    working = working.replace(isoDateMatch[0], '');
  }

  // Extract HH:mm time
  const timeMatch = working.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (timeMatch) {
    const hh = timeMatch[1].padStart(2, '0');
    const mm = timeMatch[2];
    startTime = `${hh}:${mm}`;
    working = working.replace(timeMatch[0], '');
  }

  const cleanTitle = working.replace(/\s+/g, ' ').trim() || raw.trim();
  const tags = inferSmartTags(cleanTitle, '', explicitTags);
  const isMeeting = tags.includes('會議') || /會議|meeting|sync|討論|面談/i.test(cleanTitle);

  return {
    title: cleanTitle,
    dueDate,
    startTime,
    priority,
    tags,
    isMeeting,
  };
}

const PRIORITY_BASE: Record<PriorityLevel, number> = {
  urgent: 60,
  high: 42,
  medium: 24,
  low: 10,
};

export function getTaskTimestampMs(task: Pick<TaskItem, 'dueDate' | 'startTime'>): number {
  const timePart = task.startTime || '23:59';
  const parsed = new Date(`${task.dueDate}T${timePart}:00`).getTime();
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
}

export function computePriorityScore(
  task: Pick<TaskItem, 'priority' | 'dueDate' | 'startTime' | 'isMeeting' | 'completed'>,
  nowMs: number
): number {
  if (task.completed) return 0;

  let score = PRIORITY_BASE[task.priority] ?? 24;
  if (task.isMeeting) score += 8;

  const targetMs = getTaskTimestampMs(task);
  const hoursLeft = (targetMs - nowMs) / (1000 * 60 * 60);

  if (hoursLeft < 0) {
    score += 32; // Overdue urgency
  } else if (hoursLeft <= 2) {
    score += 28;
  } else if (hoursLeft <= 8) {
    score += 20;
  } else if (hoursLeft <= 24) {
    score += 12;
  } else if (hoursLeft <= 72) {
    score += 5;
  }

  return Math.min(100, Math.max(1, Math.round(score)));
}

export function sortTasks(tasks: TaskItem[], mode: SortMode, nowMs: number): TaskItem[] {
  return [...tasks].sort((a, b) => {
    if (a.completed !== b.completed) {
      return a.completed ? 1 : -1;
    }

    if (mode === 'smart') {
      const scoreDiff = computePriorityScore(b, nowMs) - computePriorityScore(a, nowMs);
      if (scoreDiff !== 0) return scoreDiff;
      return getTaskTimestampMs(a) - getTaskTimestampMs(b);
    }

    if (mode === 'time' || mode === 'deadline') {
      const timeDiff = getTaskTimestampMs(a) - getTaskTimestampMs(b);
      if (timeDiff !== 0) return timeDiff;
      return computePriorityScore(b, nowMs) - computePriorityScore(a, nowMs);
    }

    return b.createdAt - a.createdAt;
  });
}
