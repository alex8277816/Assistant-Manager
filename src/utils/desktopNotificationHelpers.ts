import type { ActiveReminderAlert, FloatingNotificationItem } from '../types/assistant';

export interface DesktopNotificationSettings {
  enabled: boolean;
  requireInteraction: boolean;
  includeDailyDigest: boolean;
  includeGovAlerts: boolean;
}

export const DEFAULT_DESKTOP_NOTIFICATION_SETTINGS: DesktopNotificationSettings = {
  enabled: true,
  requireInteraction: true,
  includeDailyDigest: true,
  includeGovAlerts: true,
};

export type DesktopNotificationSupportCode =
  | 'ready'
  | 'disabled_by_user'
  | 'needs_permission'
  | 'blocked'
  | 'iframe_restricted'
  | 'unsupported';

export interface DesktopNotificationSupportInfo {
  code: DesktopNotificationSupportCode;
  canPopUp: boolean;
  badgeLabel: string;
  description: string;
}

export function sanitizeDesktopNotificationSettings(
  raw: unknown
): DesktopNotificationSettings {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_DESKTOP_NOTIFICATION_SETTINGS };
  }
  const obj = raw as Record<string, unknown>;
  return {
    enabled: typeof obj.enabled === 'boolean' ? obj.enabled : true,
    requireInteraction:
      typeof obj.requireInteraction === 'boolean' ? obj.requireInteraction : true,
    includeDailyDigest:
      typeof obj.includeDailyDigest === 'boolean' ? obj.includeDailyDigest : true,
    includeGovAlerts:
      typeof obj.includeGovAlerts === 'boolean' ? obj.includeGovAlerts : true,
  };
}

export function evaluateDesktopNotificationSupport(params: {
  hasNotificationApi: boolean;
  permission: NotificationPermission | 'unsupported';
  isSecureContext: boolean;
  isInIframe: boolean;
  settings: DesktopNotificationSettings;
}): DesktopNotificationSupportInfo {
  const { hasNotificationApi, permission, isSecureContext, isInIframe, settings } = params;

  if (!hasNotificationApi || permission === 'unsupported' || !isSecureContext) {
    return {
      code: 'unsupported',
      canPopUp: false,
      badgeLabel: '瀏覽器不支援',
      description: '目前瀏覽器或非安全連線環境不支援系統桌面通知，仍可使用畫面內浮動提醒與語音播報。',
    };
  }

  if (permission === 'denied') {
    return {
      code: isInIframe ? 'iframe_restricted' : 'blocked',
      canPopUp: false,
      badgeLabel: isInIframe ? '內嵌視窗受限' : '已被瀏覽器封鎖',
      description: isInIframe
        ? '目前在內嵌預覽框中開啟，瀏覽器可能會限制桌面彈窗權限；請點右側「獨立分頁開啟」後再允許通知。'
        : '瀏覽器目前封鎖了通知權限。請點擊網址列左側鎖頭／設定圖示，將「通知」改為「允許」即可從桌面彈出。',
    };
  }

  if (permission === 'default') {
    return {
      code: isInIframe ? 'iframe_restricted' : 'needs_permission',
      canPopUp: false,
      badgeLabel: '尚未授權桌面彈出',
      description: isInIframe
        ? '點擊「開啟桌面彈出提醒」要求授權；若無反應，請在獨立瀏覽器分頁開啟此網站並允許通知。'
        : '點擊「開啟桌面彈出提醒」並允許瀏覽器通知後，行事曆與會議提醒即可直接從電腦桌面彈出。',
    };
  }

  if (!settings.enabled) {
    return {
      code: 'disabled_by_user',
      canPopUp: false,
      badgeLabel: '已暫停桌面彈出',
      description: '瀏覽器已授權通知，但您已手動關閉電腦桌面彈出開關；重新勾選即可恢復。',
    };
  }

  return {
    code: 'ready',
    canPopUp: true,
    badgeLabel: '已啟用電腦桌面彈出',
    description: '行事曆到期、會議前提醒與重要公告將同步從電腦桌面（Windows / macOS 通知中心）彈出顯示。',
  };
}

export interface DesktopNotificationPayload {
  title: string;
  body: string;
  tag: string;
  requireInteraction: boolean;
  data: {
    taskId?: string;
    dueDate?: string;
    kind: FloatingNotificationItem['kind'];
  };
}

export function buildCalendarReminderNotificationPayload(
  alert: Pick<
    ActiveReminderAlert,
    'taskId' | 'triggerKey' | 'title' | 'dueDate' | 'startTime' | 'isMeeting' | 'reminderLabel'
  >,
  settings: DesktopNotificationSettings
): DesktopNotificationPayload {
  const prefix = alert.isMeeting ? '會議提醒' : '行事曆提醒';
  const timePart = alert.startTime ? `${alert.dueDate} ${alert.startTime}` : alert.dueDate;
  const labelPart = alert.reminderLabel ? ` · ${alert.reminderLabel}` : '';
  return {
    title: `${prefix}：${alert.title}`,
    body: `${timePart}${labelPart}`,
    tag: `kairo-due-${alert.triggerKey || alert.taskId}`,
    requireInteraction: settings.requireInteraction && alert.isMeeting,
    data: {
      taskId: alert.taskId,
      dueDate: alert.dueDate,
      kind: alert.isMeeting ? 'meeting' : 'todo',
    },
  };
}

export function buildFloatingItemDesktopPayload(
  item: Pick<FloatingNotificationItem, 'id' | 'kind' | 'title' | 'body'>,
  settings: DesktopNotificationSettings
): DesktopNotificationPayload | null {
  if (!settings.enabled) return null;
  if (item.kind === 'todo' && item.id.startsWith('today-digest-') && !settings.includeDailyDigest) {
    return null;
  }
  if ((item.kind === 'holiday' || item.kind === 'typhoon') && !settings.includeGovAlerts) {
    return null;
  }

  const prefixMap: Record<FloatingNotificationItem['kind'], string> = {
    meeting: '會議通知',
    todo: '排程提醒',
    holiday: '國定假日提醒',
    typhoon: '停班停課通報',
    calendar: '行事曆通知',
  };

  return {
    title: `${prefixMap[item.kind]}：${item.title}`,
    body: item.body,
    tag: item.id,
    requireInteraction: settings.requireInteraction && (item.kind === 'meeting' || item.kind === 'typhoon'),
    data: {
      kind: item.kind,
    },
  };
}
