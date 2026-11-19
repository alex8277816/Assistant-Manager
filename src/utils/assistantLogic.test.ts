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
  EXTENDED_REMINDER_PRESETS,
  findDueReminders,
  findTodayPendingSummary,
  formatBriefingScript,
  formatReminderMinutesLabel,
  formatReminderRuleLabel,
  formatTaskReminderSummary,
} from './reminderEngine';
import {
  buildGoogleCalendarEventPayload,
  mapRawGoogleEvents,
} from '../services/googleCalendarService';
import { applyWorkflowPlugins, exportTasksToMarkdown } from './pluginEngine';
import {
  createEncryptedArchive,
  createVaultCheck,
  decodeEncryptedSyncCode,
  decryptEncryptedArchive,
  decryptText,
  deriveAesKey,
  encodeEncryptedSyncCode,
  encryptText,
  generateSaltBase64,
  verifyVaultCheck,
} from './cryptoVault';
import { computeDayTaskAnalytics, resolveTaskTypeLabel } from './taskAnalytics';
import {
  findItemsNeedingPush,
  mergeSyncedCollection,
  SEED_BASE_TIMESTAMP,
} from './syncMerge';
import {
  deriveSerialAuthCredentials,
  formatAuthErrorMessage,
  formatFirestoreSyncError,
  generateSyncSerial,
  isEmailProviderDisabledError,
  isOfflineSyncError,
  maskSyncSerial,
  normalizeAccountIdentifier,
  normalizeSyncSerial,
  resolveSyncIdentityLabel,
} from './syncAuth';
import {
  buildNewBusinessCard,
  filterBusinessCards,
  validateAndNormalizeCardDraft,
} from './cardHelpers';
import { buildSerialPairingUrl, parseSerialPairingHash } from './pairingLink';
import {
  buildQuickLinkItem,
  formatQuickLinkHost,
  validateAndNormalizeQuickLink,
} from './quickLinks';
import type { BusinessCardItem, MemoItem, TaskItem, WorkflowPlugin } from '../types/assistant';

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

  const syncCode = await encodeEncryptedSyncCode(
    'sync-secret-88',
    { note: '繁體中文跨裝置同步資料 🚀', count: 2 },
    1
  );
  assert.ok(syncCode.startsWith('KAIRO-SYNC-V1:'));
  const decoded = await decodeEncryptedSyncCode<{ note: string; count: number }>(
    'sync-secret-88',
    syncCode
  );
  assert.equal(decoded.note, '繁體中文跨裝置同步資料 🚀');
  assert.equal(decoded.count, 2);
  await assert.rejects(() => decodeEncryptedSyncCode('wrong-pass', syncCode));
  await assert.rejects(() => decodeEncryptedSyncCode('sync-secret-88', 'INVALID:abc'));
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

test('syncMerge converges cross-platform edits via LWW and avoids pushing untouched seeds over populated cloud', () => {
  const untouchedSeed = makeTask({
    id: 'seed-task-1',
    title: '初始範本',
    updatedAt: SEED_BASE_TIMESTAMP,
    syncStatus: 'local',
  });
  const remoteEditedSeed = makeTask({
    id: 'seed-task-1',
    title: '手機修改後的標題',
    updatedAt: SEED_BASE_TIMESTAMP + 50000,
    syncStatus: 'synced',
  });
  const localOfflineNew = makeTask({
    id: 'task-offline-1',
    title: '電腦離線新增',
    updatedAt: SEED_BASE_TIMESTAMP + 80000,
    syncStatus: 'pending',
  });

  const merged = mergeSyncedCollection(
    [untouchedSeed, localOfflineNew],
    [remoteEditedSeed]
  );
  assert.equal(merged.length, 2);
  assert.equal(merged.find((t) => t.id === 'seed-task-1')?.title, '手機修改後的標題');
  assert.equal(merged.find((t) => t.id === 'seed-task-1')?.syncStatus, 'synced');
  assert.equal(merged.find((t) => t.id === 'task-offline-1')?.syncStatus, 'pending');

  const untouchedSeed2 = makeTask({
    id: 'seed-task-2',
    updatedAt: SEED_BASE_TIMESTAMP,
    syncStatus: 'local',
  });
  const needPush = findItemsNeedingPush(
    [untouchedSeed, untouchedSeed2, localOfflineNew],
    [remoteEditedSeed]
  );
  assert.deepEqual(
    needPush.map((t) => t.id),
    ['task-offline-1']
  );

  const initialPush = findItemsNeedingPush([untouchedSeed, untouchedSeed2], []);
  assert.equal(initialPush.length, 2);
});

test('syncAuth normalizes custom accounts, generates & derives deterministic serial credentials', async () => {
  const custom = normalizeAccountIdentifier('Alex_2026');
  assert.equal(custom.authEmail, 'acct-alex_2026@account.kairo.local');
  assert.equal(custom.displayLabel, 'alex_2026');
  assert.equal(custom.isCustomId, true);

  const email = normalizeAccountIdentifier('User@Example.TW');
  assert.equal(email.authEmail, 'user@example.tw');
  assert.equal(email.isCustomId, false);

  assert.throws(() => normalizeAccountIdentifier('ab'));

  const serial = generateSyncSerial();
  assert.match(serial, /^KAIRO-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/);
  assert.equal(normalizeSyncSerial(serial.toLowerCase().replace(/-/g, ' ')), serial);
  assert.match(maskSyncSerial(serial), /^KAIRO-[A-F0-9]{4}-••••-[A-F0-9]{4}$/);

  const cred1 = await deriveSerialAuthCredentials(serial, 'syncPass88');
  const cred2 = await deriveSerialAuthCredentials(serial.toLowerCase(), 'syncPass88');
  const credDiffPwd = await deriveSerialAuthCredentials(serial, 'otherPass99');
  assert.equal(cred1.authEmail, cred2.authEmail);
  assert.equal(cred1.authPassword, cred2.authPassword);
  assert.notEqual(cred1.authPassword, credDiffPwd.authPassword);

  assert.equal(resolveSyncIdentityLabel(custom.authEmail, null), 'alex_2026');
  assert.equal(
    resolveSyncIdentityLabel(cred1.authEmail, {
      mode: 'serial',
      label: maskSyncSerial(serial),
      serial,
    }),
    maskSyncSerial(serial)
  );
  const opNotAllowedMsg = formatAuthErrorMessage({ code: 'auth/operation-not-allowed' });
  assert.match(opNotAllowedMsg, /Email\/Password/);
  assert.equal(isEmailProviderDisabledError({ code: 'auth/operation-not-allowed' }), true);
  assert.equal(isEmailProviderDisabledError(opNotAllowedMsg), true);
  assert.equal(isEmailProviderDisabledError('網路連線異常'), false);
});

test('cardHelpers validates, builds, and filters business cards cleanly', () => {
  const invalidEmpty = validateAndNormalizeCardDraft({
    category: 'client',
    name: '   ',
    company: 'Test',
    title: '',
    phone: '',
    email: '',
    notes: '',
    pinned: false,
  });
  assert.equal(invalidEmpty.ok, false);

  const invalidEmail = validateAndNormalizeCardDraft({
    category: 'client',
    name: '張小美',
    company: '台積創新',
    title: '',
    phone: '',
    email: 'not-an-email',
    notes: '',
    pinned: false,
  });
  assert.equal(invalidEmail.ok, false);

  const valid = validateAndNormalizeCardDraft({
    category: 'client',
    name: '  張小美 ',
    company: ' 台積創新 ',
    title: '業務經理',
    phone: '0988-111-222',
    email: '',
    notes: '合作夥伴',
    pinned: true,
  });
  assert.equal(valid.ok, true);
  if (valid.ok) {
    const created: BusinessCardItem = buildNewBusinessCard(valid.draft, 5000, 'local');
    assert.equal(created.name, '張小美');
    assert.equal(created.version, 1);
    const list = filterBusinessCards([created], 'client', '台積');
    assert.equal(list.length, 1);
    assert.equal(list[0].id, created.id);
  }
});

test('pairingLink encodes and parses #pair= hash fragments safely without query params', () => {
  const urlNoPwd = buildSerialPairingUrl('https://kairo.example.com/', 'kairo-1a2b-3c4d-5e6f-7a8b');
  assert.match(urlNoPwd, /^https:\/\/kairo\.example\.com\/#pair=[A-Za-z0-9_-]+$/);
  assert.equal(urlNoPwd.includes('?'), false);

  const parsedNoPwd = parseSerialPairingHash(urlNoPwd);
  assert.deepEqual(parsedNoPwd, {
    serial: 'KAIRO-1A2B-3C4D-5E6F-7A8B',
    password: undefined,
  });

  const urlWithPwd = buildSerialPairingUrl(
    'https://kairo.example.com',
    'KAIRO-ABCD-1234-EF56-7890',
    'secret77'
  );
  const parsedWithPwd = parseSerialPairingHash(urlWithPwd.slice(urlWithPwd.indexOf('#')));
  assert.deepEqual(parsedWithPwd, {
    serial: 'KAIRO-ABCD-1234-EF56-7890',
    password: 'secret77',
  });

  assert.equal(parseSerialPairingHash('#pair=invalid_base64'), null);
  assert.equal(parseSerialPairingHash(''), null);
});

test('isOfflineSyncError and formatFirestoreSyncError detect offline getDoc errors cleanly', () => {
  const rawOfflineErr = new Error(
    JSON.stringify({
      error: 'Failed to get document because the client is offline.',
      operationType: 'write',
      path: 'users/uid/items/task-1',
    })
  );
  assert.equal(isOfflineSyncError(rawOfflineErr), true);
  assert.match(formatFirestoreSyncError(rawOfflineErr), /離線|暫存於本機/);

  const otherErr = new Error('Missing or insufficient permissions.');
  assert.equal(isOfflineSyncError(otherErr), false);
  assert.equal(formatFirestoreSyncError(otherErr), 'Missing or insufficient permissions.');
});

test('extended reminder presets, formatting, and multi-day/exact reminders trigger independently', () => {
  assert.ok(EXTENDED_REMINDER_PRESETS.some((p) => p.value === 1440 && p.label === '提前 1 天'));
  assert.ok(EXTENDED_REMINDER_PRESETS.some((p) => p.value === 2880 && p.label === '提前 2 天'));
  assert.ok(EXTENDED_REMINDER_PRESETS.some((p) => p.value === 10080));

  assert.equal(formatReminderMinutesLabel(1440), '提前 1 天');
  assert.equal(formatReminderMinutesLabel(2880), '提前 2 天');
  assert.equal(formatReminderMinutesLabel(10080), '提前 1 週');
  assert.equal(
    formatReminderRuleLabel({ id: 'r1', mode: 'exact', date: '2026-11-14', time: '17:00' }),
    '2026-11-14 17:00'
  );

  const meeting = makeTask({
    id: 'mtg-1115',
    title: '重要合約審閱會議',
    dueDate: '2026-11-15',
    startTime: '09:00',
    isMeeting: true,
    reminderMinutes: 1440,
    customReminders: [
      { id: 'c1', mode: 'exact', date: '2026-11-14', time: '17:00' },
      { id: 'c2', mode: 'exact', date: '2026-11-15', time: '07:00' },
      { id: 'c3', mode: 'relative', minutesBefore: 120 },
    ],
  });

  const summary = formatTaskReminderSummary(meeting);
  assert.equal(summary, '提前 1 天 · 指定 2026-11-14 17:00、2026-11-15 07:00 等 3 組');

  const noPrimarySummary = formatTaskReminderSummary({
    reminderMinutes: -1,
    customReminders: [{ id: 'c1', mode: 'exact', date: '2026-11-14', time: '17:00' }],
  });
  assert.equal(noPrimarySummary, '指定 2026-11-14 17:00');

  const triggered = new Set<string>();

  // Before 1 day prior (2026-11-14 08:30) -> no alerts
  assert.equal(
    findDueReminders([meeting], new Date('2026-11-14T08:30:00').getTime(), {}, triggered).length,
    0
  );

  // At 2026-11-14 09:05 -> primary 1-day-before reminder fires
  const dayBeforeAlerts = findDueReminders(
    [meeting],
    new Date('2026-11-14T09:05:00').getTime(),
    {},
    triggered
  );
  assert.equal(dayBeforeAlerts.length, 1);
  assert.equal(dayBeforeAlerts[0].reminderLabel, '提前 1 天');
  triggered.add(dayBeforeAlerts[0].triggerKey!);

  // At 2026-11-14 17:05 -> first exact reminder fires independently
  const eveFiveAlerts = findDueReminders(
    [meeting],
    new Date('2026-11-14T17:05:00').getTime(),
    {},
    triggered
  );
  assert.equal(eveFiveAlerts.length, 1);
  assert.equal(eveFiveAlerts[0].reminderLabel, '2026-11-14 17:00');
  triggered.add(eveFiveAlerts[0].triggerKey!);

  // At 2026-11-15 07:05 -> both exact 07:00 and relative 120m before (07:00) fire cleanly
  const morningAlerts = findDueReminders(
    [meeting],
    new Date('2026-11-15T07:05:00').getTime(),
    {},
    triggered
  );
  assert.equal(morningAlerts.length, 2);
  assert.ok(morningAlerts.some((a) => a.reminderLabel === '2026-11-15 07:00'));
  assert.ok(morningAlerts.some((a) => a.reminderLabel === '提前 2 小時'));

  // All-day task (empty startTime) with 1-day-before defaults to 09:00
  const allDayTask = makeTask({
    id: 'allday-1',
    dueDate: '2026-11-15',
    startTime: '',
    reminderMinutes: 1440,
  });
  const allDayAlerts = findDueReminders(
    [allDayTask],
    new Date('2026-11-14T09:01:00').getTime(),
    {},
    new Set()
  );
  assert.equal(allDayAlerts.length, 1);
  assert.equal(allDayAlerts[0].taskId, 'allday-1');
});

test('quickLinks validates, normalizes URLs safely, and builds quick link items', () => {
  const autoHttps = validateAndNormalizeQuickLink('公司 EIP', 'eip.company.com/portal');
  assert.equal(autoHttps.ok, true);
  if (autoHttps.ok) {
    assert.equal(autoHttps.name, '公司 EIP');
    assert.equal(autoHttps.url, 'https://eip.company.com/portal');
  }

  const intranet = validateAndNormalizeQuickLink('內部合約系統', 'http://contract-sys:8080/login');
  assert.equal(intranet.ok, true);
  if (intranet.ok) {
    assert.equal(intranet.url, 'http://contract-sys:8080/login');
  }

  assert.equal(validateAndNormalizeQuickLink('  ', 'https://eip.com').ok, false);
  assert.equal(validateAndNormalizeQuickLink('a'.repeat(41), 'https://eip.com').ok, false);
  assert.equal(validateAndNormalizeQuickLink('EIP', '   ').ok, false);
  assert.equal(validateAndNormalizeQuickLink('壞連結', 'javascript:alert(1)').ok, false);
  assert.equal(validateAndNormalizeQuickLink('壞連結', 'data:text/html,hi').ok, false);
  assert.equal(validateAndNormalizeQuickLink('壞連結', 'vbscript:msgbox').ok, false);

  const built = buildQuickLinkItem('公司 EIP', 'https://eip.company.com/', 9999, 'pending');
  assert.match(built.id, /^link-9999-/);
  assert.equal(built.name, '公司 EIP');
  assert.equal(built.url, 'https://eip.company.com/');
  assert.equal(built.version, 1);
  assert.equal(built.syncStatus, 'pending');
  assert.equal(built.createdAt, 9999);
  assert.equal(built.updatedAt, 9999);

  assert.equal(formatQuickLinkHost('https://www.eip.company.com/portal'), 'eip.company.com');
  assert.equal(formatQuickLinkHost('http://contract-sys:8080/login'), 'contract-sys:8080');
});

test('sortAndFilterQuickLinks sorts pinned items first and filters by category and search query', async () => {
  const { sortAndFilterQuickLinks } = await import('./quickLinks');
  const l1 = buildQuickLinkItem('盛大台北系統', 'https://tpe-eip.shengda.com', 100, 'synced', {
    pinned: false,
    category: '公司系統',
  });
  const l2 = buildQuickLinkItem('合約簽核平台', 'https://sign.shengda.com', 200, 'synced', {
    pinned: true,
    category: '行政簽核',
  });
  const l3 = {
    ...buildQuickLinkItem('已刪除系統', 'https://old.shengda.com', 300, 'synced'),
    deleted: true,
  };

  const allSorted = sortAndFilterQuickLinks([l1, l2, l3]);
  assert.equal(allSorted.length, 2);
  assert.equal(allSorted[0].id, l2.id); // pinned first
  assert.equal(allSorted[1].id, l1.id);

  const pinnedOnly = sortAndFilterQuickLinks([l1, l2, l3], '', 'pinned');
  assert.deepEqual(pinnedOnly.map((x) => x.id), [l2.id]);

  const byCat = sortAndFilterQuickLinks([l1, l2, l3], '', '公司系統');
  assert.deepEqual(byCat.map((x) => x.id), [l1.id]);

  const bySearch = sortAndFilterQuickLinks([l1, l2, l3], 'sign.shengda', 'all');
  assert.deepEqual(bySearch.map((x) => x.id), [l2.id]);
});

test('paginateQuickLinks slices 4 per page and clamps out-of-range pages cleanly', async () => {
  const { paginateQuickLinks, SIDEBAR_LINKS_PAGE_SIZE } = await import('./quickLinks');
  assert.equal(SIDEBAR_LINKS_PAGE_SIZE, 4);

  const items = Array.from({ length: 6 }, (_, idx) =>
    buildQuickLinkItem(`系統 ${idx + 1}`, `https://sys${idx + 1}.example.com`, 1000 + idx)
  );

  const p1 = paginateQuickLinks(items, 1);
  assert.equal(p1.page, 1);
  assert.equal(p1.totalPages, 2);
  assert.equal(p1.totalItems, 6);
  assert.equal(p1.items.length, 4);
  assert.equal(p1.items[0].name, '系統 1');
  assert.equal(p1.items[3].name, '系統 4');

  const p2 = paginateQuickLinks(items, 2);
  assert.equal(p2.page, 2);
  assert.equal(p2.items.length, 2);
  assert.equal(p2.items[0].name, '系統 5');
  assert.equal(p2.items[1].name, '系統 6');

  // Clamps if items shrink (e.g. after deletion or filter change)
  const clamped = paginateQuickLinks(items.slice(0, 3), 3);
  assert.equal(clamped.page, 1);
  assert.equal(clamped.totalPages, 1);
  assert.equal(clamped.items.length, 3);
});

test('mergeSyncedCollection resolves minor clock skew via numeric version when local is not pending', () => {
  const localSynced = makeTask({
    id: 'skew-1',
    title: '舊版本標題',
    version: 2,
    updatedAt: 50000,
    syncStatus: 'synced',
  });
  const remoteNewerVersion = makeTask({
    id: 'skew-1',
    title: '另一台剛修改但時鐘慢 5 秒的標題',
    version: 3,
    updatedAt: 45000,
    syncStatus: 'synced',
  });
  const merged = mergeSyncedCollection([localSynced], [remoteNewerVersion]);
  assert.equal(merged[0].title, '另一台剛修改但時鐘慢 5 秒的標題');
  assert.equal(merged[0].syncStatus, 'synced');

  const localPending = makeTask({
    id: 'skew-2',
    title: '本機待上傳修改',
    version: 2,
    updatedAt: 50000,
    syncStatus: 'pending',
  });
  const remoteOlderTimeHigherVer = makeTask({
    id: 'skew-2',
    title: '遠端版本',
    version: 5,
    updatedAt: 45000,
    syncStatus: 'synced',
  });
  const mergedPending = mergeSyncedCollection([localPending], [remoteOlderTimeHigherVer]);
  assert.equal(mergedPending[0].title, '本機待上傳修改');
  assert.equal(mergedPending[0].syncStatus, 'pending');
});


