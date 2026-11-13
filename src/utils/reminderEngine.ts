import type { ActiveReminderAlert, TaskItem } from '../types/assistant';
import { computePriorityScore } from './smartEngine';

export function findDueReminders(
  tasks: TaskItem[],
  nowMs: number,
  snoozedUntilMap: Record<string, number>,
  triggeredKeys: Set<string>
): ActiveReminderAlert[] {
  const alerts: ActiveReminderAlert[] = [];

  for (const task of tasks) {
    if (task.deleted || task.completed || task.reminderMinutes < 0) continue;
    if (!task.dueDate || !task.startTime) continue;

    const eventMs = new Date(`${task.dueDate}T${task.startTime}:00`).getTime();
    if (Number.isNaN(eventMs)) continue;

    const triggerMs = eventMs - task.reminderMinutes * 60 * 1000;
    const snoozedUntil = snoozedUntilMap[task.id] ?? 0;
    const key = `${task.id}:${task.dueDate}:${task.startTime}:${task.reminderMinutes}`;

    // Fire if within [triggerMs, eventMs + 10 min grace] and not snoozed or already triggered
    if (
      nowMs >= triggerMs &&
      nowMs <= eventMs + 10 * 60 * 1000 &&
      nowMs >= snoozedUntil &&
      !triggeredKeys.has(key)
    ) {
      alerts.push({
        taskId: task.id,
        title: task.title,
        dueDate: task.dueDate,
        startTime: task.startTime,
        isMeeting: task.isMeeting,
        priority: task.priority,
        triggeredAt: nowMs,
      });
    }
  }

  return alerts;
}

export function buildReminderTriggerKey(task: Pick<TaskItem, 'id' | 'dueDate' | 'startTime' | 'reminderMinutes'>): string {
  return `${task.id}:${task.dueDate}:${task.startTime || ''}:${task.reminderMinutes}`;
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

