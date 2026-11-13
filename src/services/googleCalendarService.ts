import type { GoogleCalendarEventItem, TaskItem } from '../types/assistant';

interface RawGoogleEventDateTime {
  dateTime?: string;
  date?: string;
}

interface RawGoogleEvent {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  start?: RawGoogleEventDateTime;
  end?: RawGoogleEventDateTime;
}

export function parseGoogleEventDateTime(raw?: RawGoogleEventDateTime): {
  date: string;
  time?: string;
  isAllDay: boolean;
} {
  if (!raw) {
    return { date: '', isAllDay: true };
  }
  if (raw.date) {
    return { date: raw.date, isAllDay: true };
  }
  if (raw.dateTime) {
    const dt = new Date(raw.dateTime);
    if (!Number.isNaN(dt.getTime())) {
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, '0');
      const d = String(dt.getDate()).padStart(2, '0');
      const hh = String(dt.getHours()).padStart(2, '0');
      const mm = String(dt.getMinutes()).padStart(2, '0');
      return { date: `${y}-${m}-${d}`, time: `${hh}:${mm}`, isAllDay: false };
    }
    return { date: raw.dateTime.slice(0, 10), isAllDay: false };
  }
  return { date: '', isAllDay: true };
}

export function mapRawGoogleEvents(items: RawGoogleEvent[]): GoogleCalendarEventItem[] {
  if (!Array.isArray(items)) return [];
  const mapped: GoogleCalendarEventItem[] = [];

  for (const item of items) {
    if (!item || item.status === 'cancelled') continue;
    const start = parseGoogleEventDateTime(item.start);
    const end = parseGoogleEventDateTime(item.end);
    if (!start.date) continue;

    mapped.push({
      id: item.id,
      summary: item.summary?.trim() || '(無標題 Google 行事曆事件)',
      description: item.description?.trim() || '',
      startDate: start.date,
      startTime: start.time,
      endTime: end.time,
      isAllDay: start.isAllDay,
      location: item.location,
      htmlLink: item.htmlLink,
    });
  }

  return mapped;
}

function addOneDay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(
    dt.getUTCDate()
  ).padStart(2, '0')}`;
}

function addOneHour(timeStr: string): string {
  const [hh, mm] = timeStr.split(':').map(Number);
  const total = Math.min(23 * 60 + 59, hh * 60 + mm + 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function buildGoogleCalendarEventPayload(task: TaskItem) {
  const timeZone =
    typeof Intl !== 'undefined'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Taipei'
      : 'Asia/Taipei';

  const basePayload: {
    summary: string;
    description: string;
    start: { date?: string; dateTime?: string; timeZone?: string };
    end: { date?: string; dateTime?: string; timeZone?: string };
    reminders?: { useDefault: boolean; overrides?: Array<{ method: string; minutes: number }> };
  } = {
    summary: task.title,
    description: [
      task.notes,
      task.tags.length > 0 ? `標籤: ${task.tags.join(', ')}` : '',
      '由 Kairo 隨行助理同步',
    ]
      .filter(Boolean)
      .join('\n'),
    start: {},
    end: {},
  };

  if (task.startTime) {
    const startIso = `${task.dueDate}T${task.startTime}:00`;
    const endTime = task.endTime || addOneHour(task.startTime);
    const endIso = `${task.dueDate}T${endTime}:00`;
    basePayload.start = { dateTime: startIso, timeZone };
    basePayload.end = { dateTime: endIso, timeZone };
  } else {
    basePayload.start = { date: task.dueDate };
    basePayload.end = { date: addOneDay(task.dueDate) };
  }

  if (task.reminderMinutes >= 0) {
    basePayload.reminders = {
      useDefault: false,
      overrides: [{ method: 'popup', minutes: task.reminderMinutes }],
    };
  }

  return basePayload;
}

export async function fetchGoogleCalendarEvents(
  accessToken: string,
  timeMinIso: string,
  timeMaxIso: string
): Promise<GoogleCalendarEventItem[]> {
  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');
  url.searchParams.set('maxResults', '50');
  url.searchParams.set('timeMin', timeMinIso);
  url.searchParams.set('timeMax', timeMaxIso);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`讀取 Google 行事曆失敗 (${res.status}) ${errText}`);
  }
  const data = (await res.json()) as { items?: RawGoogleEvent[] };
  return mapRawGoogleEvents(data.items || []);
}

export async function createGoogleCalendarEvent(
  accessToken: string,
  task: TaskItem
): Promise<{ id: string; htmlLink?: string }> {
  const res = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildGoogleCalendarEventPayload(task)),
    }
  );
  if (!res.ok) {
    throw new Error(`建立 Google 行事曆事件失敗 (${res.status})`);
  }
  return res.json() as Promise<{ id: string; htmlLink?: string }>;
}

export async function updateGoogleCalendarEvent(
  accessToken: string,
  eventId: string,
  task: TaskItem
): Promise<{ id: string; htmlLink?: string }> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(
      eventId
    )}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildGoogleCalendarEventPayload(task)),
    }
  );
  if (!res.ok) {
    throw new Error(`更新 Google 行事曆事件失敗 (${res.status})`);
  }
  return res.json() as Promise<{ id: string; htmlLink?: string }>;
}

export async function deleteGoogleCalendarEvent(
  accessToken: string,
  eventId: string
): Promise<void> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(
      eventId
    )}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok && res.status !== 410 && res.status !== 404) {
    throw new Error(`刪除 Google 行事曆事件失敗 (${res.status})`);
  }
}
