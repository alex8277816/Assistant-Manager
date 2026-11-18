import type { ActiveReminderAlert, TaskItem, TaskReminderRule } from '../types/assistant';
import { computePriorityScore } from './smartEngine';

export const EXTENDED_REMINDER_PRESETS: Array<{ value: number; label: string }> = [
  { value: -1, label: '關閉主要提醒' },
  { value: 0, label: '準時提醒' },
  { value: 5, label: '提前 5 分鐘' },
  { value: 10, label: '提前 10 分鐘' },
  { value: 15, label: '提前 15 分鐘' },
  { value: 30, label: '提前 30 分鐘' },
  { value: 60, label: '提前 1 小時' },
  { value: 120, label: '提前 2 小時' },
  { value: 180, label: '提前 3 小時' },
  { value: 360, label: '提前 6 小時' },
  { value: 720, label: '提前 12 小時' },
  { value: 1440, label: '提前 1 天' },
  { value: 2880, label: '提前 2 天' },
  { value: 4320, label: '提前 3 天' },
  { value: 10080, label: '提前 1 週 (7 天)' },
];

export function formatReminderMinutesLabel(minutes: number): string {
  if (minutes < 0) return '關閉提醒';
  if (minutes === 0) return '準時提醒';
  if (minutes < 60) return `提前 ${minutes} 分鐘`;
  if (minutes < 1440) {
    const hours = Math.floor(minutes / 60);
    const remMins = minutes % 60;
    return remMins === 0 ? `提前 ${hours} 小時` : `提前 ${hours} 小時 ${remMins} 分`;
  }
  if (minutes % 10080 === 0) {
    return `提前 ${minutes / 10080} 週`;
  }
  const days = Math.floor(minutes / 1440);
  const remHours = Math.round((minutes % 1440) / 60);
  return remHours === 0 ? `提前 ${days} 天` : `提前 ${days} 天 ${remHours} 小時`;
}

export function formatReminderRuleLabel(rule: TaskReminderRule): string {
  if (rule.mode === 'exact') {
    const d = rule.date || '';
    const t = rule.time || '';
    return `${d} ${t}`.trim();
  }
  return formatReminderMinutesLabel(rule.minutesBefore ?? 0);
}

export function formatTaskReminderSummary(
  task: Pick<TaskItem, 'reminderMinutes' | 'customReminders'>
): string | null {
  const parts: string[] = [];
  if (task.reminderMinutes >= 0) {
    parts.push(formatReminderMinutesLabel(task.reminderMinutes));
  }
  const custom = Array.isArray(task.customReminders) ? task.customReminders : [];
  if (custom.length > 0) {
    const preview = custom.slice(0, 2).map(formatReminderRuleLabel).filter(Boolean).join('、');
    parts.push(
      custom.length > 2 ? `指定 ${preview} 等 ${custom.length} 組` : `指定 ${preview}`
    );
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

export function findDueReminders(
  tasks: TaskItem[],
  nowMs: number,
  snoozedUntilMap: Record<string, number>,
  triggeredKeys: Set<string>
): ActiveReminderAlert[] {
  const alerts: ActiveReminderAlert[] = [];

  for (const task of tasks) {
    if (task.deleted || task.completed) continue;

    const effectiveTime = task.startTime || (task.reminderMinutes >= 1440 ? '09:00' : '');
    const eventMs =
      task.dueDate && effectiveTime
        ? new Date(`${task.dueDate}T${effectiveTime}:00`).getTime()
        : Number.NaN;

    // 1. Primary relative reminder (supports minutes, hours, days, weeks)
    if (task.reminderMinutes >= 0 && !Number.isNaN(eventMs) && (task.startTime || task.reminderMinutes >= 1440)) {
      const triggerMs = eventMs - task.reminderMinutes * 60 * 1000;
      const key = `${task.id}:${task.dueDate}:${effectiveTime}:${task.reminderMinutes}`;
      const snoozedUntil = snoozedUntilMap[key] ?? snoozedUntilMap[task.id] ?? 0;

      if (
        nowMs >= triggerMs &&
        nowMs <= eventMs + 10 * 60 * 1000 &&
        nowMs >= snoozedUntil &&
        !triggeredKeys.has(key)
      ) {
        alerts.push({
          taskId: task.id,
          triggerKey: key,
          reminderLabel: formatReminderMinutesLabel(task.reminderMinutes),
          title: task.title,
          dueDate: task.dueDate,
          startTime: task.startTime,
          isMeeting: task.isMeeting,
          priority: task.priority,
          triggeredAt: nowMs,
        });
      }
    }

    // 2. Additional multi-day or exact date/time custom reminders
    const customRules = Array.isArray(task.customReminders) ? task.customReminders : [];
    for (const rule of customRules) {
      let triggerMs = Number.NaN;
      let key = '';

      if (rule.mode === 'exact' && rule.date && rule.time) {
        triggerMs = new Date(`${rule.date}T${rule.time}:00`).getTime();
        key = `${task.id}:custom:${rule.id}:${rule.date}T${rule.time}`;
      } else if (rule.mode === 'relative' && typeof rule.minutesBefore === 'number') {
        const relTime = task.startTime || '09:00';
        const baseEventMs = task.dueDate
          ? new Date(`${task.dueDate}T${relTime}:00`).getTime()
          : Number.NaN;
        if (!Number.isNaN(baseEventMs)) {
          triggerMs = baseEventMs - rule.minutesBefore * 60 * 1000;
          key = `${task.id}:custom:${rule.id}:rel:${rule.minutesBefore}`;
        }
      }

      if (Number.isNaN(triggerMs) || !key) continue;

      const defaultEnd = triggerMs + 6 * 60 * 60 * 1000;
      const windowEnd =
        !Number.isNaN(eventMs) && triggerMs <= eventMs
          ? Math.min(defaultEnd, eventMs + 10 * 60 * 1000)
          : defaultEnd;
      const snoozedUntil = snoozedUntilMap[key] ?? snoozedUntilMap[task.id] ?? 0;

      if (
        nowMs >= triggerMs &&
        nowMs <= windowEnd &&
        nowMs >= snoozedUntil &&
        !triggeredKeys.has(key)
      ) {
        alerts.push({
          taskId: task.id,
          triggerKey: key,
          reminderLabel: formatReminderRuleLabel(rule),
          title: task.title,
          dueDate: task.dueDate,
          startTime: task.startTime,
          isMeeting: task.isMeeting,
          priority: task.priority,
          triggeredAt: nowMs,
        });
      }
    }
  }

  return alerts;
}

export function buildReminderTriggerKey(
  task: Pick<TaskItem, 'id' | 'dueDate' | 'startTime' | 'reminderMinutes'>
): string {
  const effectiveTime = task.startTime || (task.reminderMinutes >= 1440 ? '09:00' : '');
  return `${task.id}:${task.dueDate}:${effectiveTime}:${task.reminderMinutes}`;
}

export function formatBriefingScript(tasks: TaskItem[], dateStr: string, nowMs: number): string {
  const todays = tasks
    .filter((t) => !t.deleted && !t.completed && t.dueDate === dateStr)
    .sort((a, b) => computePriorityScore(b, nowMs) - computePriorityScore(a, nowMs));

  if (todays.length === 0) {
    return `${dateStr} 今日目前沒有待辦任務，您可以專注於長期規劃或新增排程。`;
  }

  const meetings = todays.filter((t) => t.isMeeting);
  const topTasks = todays.slice(0, 4);

  const parts: string[] = [
    `您好，為您播報 ${dateStr} 智慧行程簡報。今日共有 ${todays.length} 項待辦事項，包含 ${meetings.length} 場預定會議。`,
  ];

  topTasks.forEach((task, index) => {
    const timeLabel = task.startTime ? `預計於 ${task.startTime} 進行` : '尚未排定時段';
    const priorityLabel =
      task.priority === 'urgent' ? '緊急' : task.priority === 'high' ? '高優先' : '';
    parts.push(`第 ${index + 1} 項${priorityLabel ? `，${priorityLabel}` : ''}：${task.title}，${timeLabel}。`);
  });

  return parts.join(' ');
}

export interface TodayPendingSummary {
  count: number;
  urgentCount: number;
  meetingCount: number;
  topTitles: string[];
  bodyText: string;
  voiceScript: string;
}

export function findTodayPendingSummary(
  tasks: TaskItem[],
  todayDateStr: string
): TodayPendingSummary | null {
  const pending = tasks.filter(
    (t) => !t.deleted && !t.completed && t.dueDate === todayDateStr
  );
  if (pending.length === 0) return null;

  const urgentCount = pending.filter(
    (t) => t.priority === 'urgent' || t.priority === 'high'
  ).length;
  const meetingCount = pending.filter((t) => t.isMeeting).length;
  const topTitles = pending.slice(0, 3).map((t) => t.title);
  const bodyText = `今日 (${todayDateStr}) 尚有 ${pending.length} 項待辦${
    meetingCount > 0 ? `（含 ${meetingCount} 場會議）` : ''
  }：${topTitles.join('、')}${pending.length > 3 ? ' 等' : ''}`;
  const voiceScript = `今日待辦自動提醒：${todayDateStr} 共有 ${pending.length} 項未完成排程${
    urgentCount > 0 ? `，其中 ${urgentCount} 項為高優先或緊急` : ''
  }。首項為「${topTitles[0]}」。`;

  return {
    count: pending.length,
    urgentCount,
    meetingCount,
    topTitles,
    bodyText,
    voiceScript,
  };
}

