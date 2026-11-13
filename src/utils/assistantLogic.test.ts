import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computePriorityScore,
  inferSmartTags,
  parseQuickTaskInput,
  sortTasks,
} from './smartEngine';
import { exportTasksToICS, parseICSContent } from './icsSync';
import {
  findDueReminders,
  findTodayPendingSummary,
  formatBriefingScript,
} from './reminderEngine';
import {
  buildGoogleCalendarEventPayload,
  mapRawGoogleEvents,
} from '../services/googleCalendarService';
import { applyWorkflowPlugins, exportTasksToMarkdown } from './pluginEngine';
import {
  createEncryptedArchive,
  createVaultCheck,
  decryptEncryptedArchive,
  decryptText,
  deriveAesKey,
  encryptText,
  generateSaltBase64,
  verifyVaultCheck,
} from './cryptoVault';
import { computeDayTaskAnalytics, resolveTaskTypeLabel } from './taskAnalytics';
import type { MemoItem, TaskItem, WorkflowPlugin } from '../types/assistant';

const BASE_DATE = '2026-11-12';

function makeTask(overrides: Partial<TaskItem> = {}): TaskItem {
  return {
    id: 't1',
    title: '測試任務',
    notes: '',
    dueDate: BASE_DATE,
    startTime: '14:00',
    isMeeting: false,
    priority: 'medium',
    tags: ['日常'],
    completed: false,
    reminderMinutes: 15,
    voiceReminder: true,
    version: 1,
    syncStatus: 'local',
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

test('smartEngine parses quick task input with date, time, priority, and tags', () => {
  const parsed = parseQuickTaskInput('明天 09:30 Q4 產品評審會議 #重要 !高', BASE_DATE);
  assert.equal(parsed.dueDate, '2026-11-13');
  assert.equal(parsed.startTime, '09:30');
  assert.equal(parsed.priority, 'high');
  assert.equal(parsed.isMeeting, true);
  assert.ok(parsed.tags.includes('重要'));
  assert.ok(parsed.tags.includes('會議'));
  assert.equal(parsed.title, 'Q4 產品評審會議');
});

test('smartEngine infers smart tags and sorts tasks by smart priority score', () => {
  const tags = inferSmartTags('修復資料庫加密 API bug', '上線前測試');
  assert.ok(tags.includes('開發'));

  const nowMs = new Date('2026-11-12T13:30:00').getTime();
  const urgentSoon = makeTask({
    id: 'urgent',
    title: '客戶合約會議',
    startTime: '14:00',
    priority: 'urgent',
    isMeeting: true,
  });
  const lowLater = makeTask({
    id: 'low',
    title: '整理書桌',
    dueDate: '2026-11-16',
    startTime: '20:00',
    priority: 'low',
  });
  const completedUrgent = makeTask({
    id: 'done',
    title: '已完成急件',
    priority: 'urgent',
    completed: true,
  });

  const sorted = sortTasks([lowLater, completedUrgent, urgentSoon], 'smart', nowMs);
  assert.deepEqual(
    sorted.map((t) => t.id),
    ['urgent', 'low', 'done']
  );
  assert.ok(computePriorityScore(urgentSoon, nowMs) > computePriorityScore(lowLater, nowMs));
});

test('icsSync round-trips tasks to RFC 5545 iCalendar and back', () => {
  const tasks = [
    makeTask({
      id: 'ics-1',
      title: '週會同步',
      notes: '檢視季度目標',
      dueDate: '2026-11-12',
      startTime: '10:00',
      endTime: '11:00',
      tags: ['會議', '工作'],
      reminderMinutes: 15,
    }),
  ];
  const ics = exportTasksToICS(tasks);
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /SUMMARY:週會同步/);
  assert.match(ics, /TRIGGER:-PT15M/);

  const imported = parseICSContent(ics);
  assert.equal(imported.length, 1);
  assert.equal(imported[0].title, '週會同步');
  assert.equal(imported[0].dueDate, '2026-11-12');
  assert.equal(imported[0].startTime, '10:00');
  assert.equal(imported[0].endTime, '11:00');
  assert.equal(imported[0].reminderMinutes, 15);
  assert.equal(imported[0].isMeeting, true);
});

test('reminderEngine detects due reminders and builds spoken briefing script', () => {
  const task = makeTask({
    id: 'rem-1',
    title: '重要投資人會議',
    dueDate: '2026-11-12',
    startTime: '15:00',
    reminderMinutes: 15,
    isMeeting: true,
    priority: 'urgent',
  });
  const earlyNow = new Date('2026-11-12T14:30:00').getTime();
  const dueNow = new Date('2026-11-12T14:46:00').getTime();

  assert.equal(findDueReminders([task], earlyNow, {}, new Set()).length, 0);
  const alerts = findDueReminders([task], dueNow, {}, new Set());
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].taskId, 'rem-1');

  const snoozed = findDueReminders(
    [task],
    dueNow,
    { 'rem-1': dueNow + 600000 },
    new Set()
  );
  assert.equal(snoozed.length, 0);

  const script = formatBriefingScript([task], '2026-11-12', dueNow);
  assert.match(script, /重要投資人會議/);
  assert.match(script, /15:00/);
});

test('pluginEngine applies enabled workflow rules and exports Markdown', () => {
  const rulePlugin: WorkflowPlugin = {
    id: 'p-rule-1',
    name: '財務自動加急',
    description: '偵測發票與繳費自動設為高優先',
    author: 'Kairo',
    version: '1.0.0',
    kind: 'rule',
    enabled: true,
    config: {
      trigger: 'on_task_create',
      keywordMatch: '發票',
      addTag: '必辦',
      setPriority: 'high',
      setReminderMinutes: 30,
      enableVoice: true,
    },
    runCount: 0,
    syncStatus: 'local',
    updatedAt: 1000,
  };

  const base = makeTask({ title: '整理十月發票報帳', priority: 'low', reminderMinutes: 0 });
  const { task: transformed, appliedPluginNames } = applyWorkflowPlugins(
    base,
    [rulePlugin],
    'on_task_create'
  );
  assert.equal(appliedPluginNames.length, 1);
  assert.equal(transformed.priority, 'high');
  assert.equal(transformed.reminderMinutes, 30);
  assert.ok(transformed.tags.includes('必辦'));

  const memo: MemoItem = {
    id: 'm1',
    title: '會議紀錄',
    content: '確認加密備份規範',
    tags: ['工作'],
    pinned: true,
    checklist: [],
    version: 1,
    syncStatus: 'local',
    createdAt: 1000,
    updatedAt: 1000,
  };
  const md = exportTasksToMarkdown([transformed], [memo], BASE_DATE);
  assert.match(md, /整理十月發票報帳/);
  assert.match(md, /會議紀錄/);
});

test('cryptoVault encrypts, decrypts, verifies vault check, and restores encrypted archive', async () => {
  const salt = generateSaltBase64();
  const key = await deriveAesKey('kairo-secret-passphrase', salt);
  const { checkCipher, checkIv } = await createVaultCheck(key);

  assert.equal(await verifyVaultCheck(key, checkCipher, checkIv), true);

  const wrongKey = await deriveAesKey('wrong-passphrase', salt);
  assert.equal(await verifyVaultCheck(wrongKey, checkCipher, checkIv), false);

  const { ciphertext, iv } = await encryptText(key, '機密備忘錄內容 2026');
  assert.notEqual(ciphertext, '機密備忘錄內容 2026');
  const plain = await decryptText(key, ciphertext, iv);
  assert.equal(plain, '機密備忘錄內容 2026');

  const archive = await createEncryptedArchive('backup-pass-99', { tasks: [1, 2, 3] }, 3);
  const restored = await decryptEncryptedArchive<{ tasks: number[] }>('backup-pass-99', archive);
  assert.deepEqual(restored.tasks, [1, 2, 3]);
});

test('findTodayPendingSummary summarizes incomplete tasks for today', () => {
  const tasks = [
    makeTask({ id: 't1', title: '產品週會', dueDate: BASE_DATE, isMeeting: true, priority: 'urgent' }),
    makeTask({ id: 't2', title: '寄送報價單', dueDate: BASE_DATE, completed: false }),
    makeTask({ id: 't3', title: '已完成任務', dueDate: BASE_DATE, completed: true }),
    makeTask({ id: 't4', title: '明日行程', dueDate: '2026-11-13', completed: false }),
  ];
  const summary = findTodayPendingSummary(tasks, BASE_DATE);
  assert.ok(summary);
  assert.equal(summary.count, 2);
  assert.equal(summary.meetingCount, 1);
  assert.equal(summary.urgentCount, 1);
  assert.match(summary.bodyText, /產品週會/);
  assert.match(summary.voiceScript, /今日待辦自動提醒/);

  assert.equal(findTodayPendingSummary([tasks[2]], BASE_DATE), null);
});

test('googleCalendarService maps events and builds event payloads accurately', () => {
  const events = mapRawGoogleEvents([
    {
      id: 'ev-1',
      summary: '客戶簡報會議',
      description: '季度檢討',
      start: { dateTime: '2026-11-13T10:30:00+08:00' },
      end: { dateTime: '2026-11-13T11:30:00+08:00' },
    },
    {
      id: 'ev-cancelled',
      status: 'cancelled',
      summary: '取消的會議',
      start: { date: '2026-11-14' },
    },
  ]);
  assert.equal(events.length, 1);
  assert.equal(events[0].summary, '客戶簡報會議');
  assert.equal(events[0].isAllDay, false);

  const payload = buildGoogleCalendarEventPayload(
    makeTask({ dueDate: '2026-11-13', startTime: '14:00', endTime: '15:00', reminderMinutes: 15 })
  );
  assert.equal(payload.summary, '測試任務');
  assert.match(payload.start.dateTime || '', /2026-11-13T14:00:00/);
  assert.equal(payload.reminders?.overrides?.[0].minutes, 15);
});

test('taskAnalytics computes completion rate and task type distribution accurately', () => {
  const sampleTasks: TaskItem[] = [
    makeTask({ id: 'a1', dueDate: BASE_DATE, isMeeting: true, completed: false, tags: ['會議', '工作'] }),
    makeTask({ id: 'a2', dueDate: BASE_DATE, isMeeting: false, completed: true, tags: ['開發'] }),
    makeTask({ id: 'a3', dueDate: BASE_DATE, isMeeting: false, completed: false, tags: ['開發'] }),
    makeTask({ id: 'a4', dueDate: BASE_DATE, isMeeting: false, completed: true, tags: ['財務'] }),
    makeTask({ id: 'a5', dueDate: BASE_DATE, deleted: true, completed: false, tags: ['健康'] }),
    makeTask({ id: 'a6', dueDate: '2026-11-13', isMeeting: false, completed: false, tags: ['健康'] }),
  ];

  assert.equal(resolveTaskTypeLabel(sampleTasks[0]), '預定會議');
  assert.equal(resolveTaskTypeLabel(sampleTasks[1]), '開發');

  const result = computeDayTaskAnalytics(sampleTasks, BASE_DATE);
  assert.equal(result.total, 4);
  assert.equal(result.completed, 2);
  assert.equal(result.pending, 2);
  assert.equal(result.completionRate, 50);
  assert.equal(result.meetingTotal, 1);
  assert.deepEqual(
    result.categoryDistribution.map((c) => ({
      name: c.name,
      total: c.total,
      completed: c.completed,
      pending: c.pending,
    })),
    [
      { name: '開發', total: 2, completed: 1, pending: 1 },
      { name: '財務', total: 1, completed: 1, pending: 0 },
      { name: '預定會議', total: 1, completed: 0, pending: 1 },
    ]
  );

  const emptyResult = computeDayTaskAnalytics(sampleTasks, '2026-12-01');
  assert.equal(emptyResult.total, 0);
  assert.equal(emptyResult.completionRate, 0);
  assert.equal(emptyResult.completionSlices.length, 0);
});

