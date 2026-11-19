import {
  DEFAULT_DESKTOP_NOTIFICATION_SETTINGS,
  evaluateDesktopNotificationSupport,
  sanitizeDesktopNotificationSettings,
  type DesktopNotificationSettings,
  type DesktopNotificationSupportInfo,
} from '../utils/desktopNotificationHelpers';

const DESKTOP_NOTIF_SETTINGS_KEY = 'kairo_desktop_notif_settings_v1';

export interface SendSystemNotificationOptions {
  tag?: string;
  requireInteraction?: boolean;
  silent?: boolean;
  data?: Record<string, unknown>;
  onClick?: () => void;
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof Notification === 'undefined') return 'unsupported';
  try {
    return Notification.permission;
  } catch {
    return 'unsupported';
  }
}

export function isRunningInIframe(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function loadDesktopNotificationSettings(): DesktopNotificationSettings {
  if (typeof localStorage === 'undefined') {
    return { ...DEFAULT_DESKTOP_NOTIFICATION_SETTINGS };
  }
  try {
    const raw = localStorage.getItem(DESKTOP_NOTIF_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_DESKTOP_NOTIFICATION_SETTINGS };
    return sanitizeDesktopNotificationSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_DESKTOP_NOTIFICATION_SETTINGS };
  }
}

export function saveDesktopNotificationSettings(
  settings: DesktopNotificationSettings
): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(DESKTOP_NOTIF_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore storage errors
  }
}

export function getDesktopNotificationSupport(
  settings: DesktopNotificationSettings
): DesktopNotificationSupportInfo {
  const isSecureContext =
    typeof window === 'undefined' ? true : Boolean(window.isSecureContext);
  return evaluateDesktopNotificationSupport({
    hasNotificationApi: typeof Notification !== 'undefined',
    permission: getNotificationPermission(),
    isSecureContext,
    isInIframe: isRunningInIframe(),
    settings,
  });
}

export async function requestSystemNotificationPermission(): Promise<
  NotificationPermission | 'unsupported'
> {
  if (typeof Notification === 'undefined') return 'unsupported';
  try {
    const result = await Notification.requestPermission();
    return result;
  } catch {
    return getNotificationPermission();
  }
}

export async function sendSystemNotification(
  title: string,
  body: string,
  tagOrOptions?: string | SendSystemNotificationOptions
): Promise<boolean> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
    return false;
  }

  const opts: SendSystemNotificationOptions =
    typeof tagOrOptions === 'string'
      ? { tag: tagOrOptions }
      : tagOrOptions || {};

  const notificationOptions: NotificationOptions = {
    body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: opts.tag,
    requireInteraction: Boolean(opts.requireInteraction),
    silent: Boolean(opts.silent),
    data: {
      url: typeof window !== 'undefined' ? window.location.href : '/',
      ...(opts.data || {}),
    },
  };

  // Prefer direct Window Notification on desktop browsers so click focus & immediate OS popup work even without active SW
  try {
    const notif = new Notification(title, notificationOptions);
    notif.onclick = () => {
      try {
        window.focus();
      } catch {
        // ignore focus restriction
      }
      opts.onClick?.();
      try {
        notif.close();
      } catch {
        // ignore
      }
    };
    return true;
  } catch {
    // Mobile Chrome / restricted contexts require ServiceWorkerRegistration.showNotification
  }

  try {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg?.active && 'showNotification' in reg) {
        await reg.showNotification(title, notificationOptions);
        return true;
      }
    }
  } catch {
    // ignore SW notification failure
  }

  return false;
}
