import type { TaskItem } from '../types/assistant';
import { inferSmartTags } from './smartEngine';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function escapeICS(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function unescapeICS(text: string): string {
  return text
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

function toICSDateTime(dateStr: string, timeStr?: string): { value: string; allDay: boolean } {
  const compactDate = dateStr.replace(/-/g, '');
  if (!timeStr) {
    return { value: compactDate, allDay: true };
  }
  const [hh, mm] = timeStr.split(':');
  return { value: `${compactDate}T${pad2(Number(hh))}${pad2(Number(mm))}00`, allDay: false };
}

function addMinutesToTime(dateStr: string, timeStr: string, minutes: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  const dt = new Date(y, m - 1, d, hh, mm + minutes, 0);
  return `${dt.getFullYear()}${pad2(dt.getMonth() + 1)}${pad2(dt.getDate())}T${pad2(dt.getHours())}${pad2(dt.getMinutes())}00`;
}

export function exportTasksToICS(tasks: TaskItem[], calendarName = 'Kairo 隨行助理'): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Kairo Assistant//Cross-Platform Sync//ZH',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeICS(calendarName)}`,
  ];

  for (const task of tasks) {
    if (task.deleted) continue;
    const start = toICSDateTime(task.dueDate, task.startTime);
    const uid = `${task.id}@kairo.local`;
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${uid}`);
    lines.push(`SUMMARY:${escapeICS(task.title)}`);
    if (task.notes) {
      lines.push(`DESCRIPTION:${escapeICS(task.notes)}`);
    }
    if (start.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${start.value}`);
    } else {
      lines.push(`DTSTART:${start.value}`);
      const endStr = task.endTime
        ? toICSDateTime(task.dueDate, task.endTime).value
        : addMinutesToTime(task.dueDate, task.startTime!, 45);
      lines.push(`DTEND:${endStr}`);
    }
    if (task.tags.length > 0) {
      lines.push(`CATEGORIES:${task.tags.map(escapeICS).join(',')}`);
    }
    lines.push(`STATUS:${task.completed ? 'COMPLETED' : 'CONFIRMED'}`);
    if (task.reminderMinutes >= 0 && !task.completed) {
      lines.push('BEGIN:VALARM');
      lines.push('ACTION:DISPLAY');
      lines.push(`DESCRIPTION:${escapeICS(task.title)}`);
      lines.push(`TRIGGER:-PT${task.reminderMinutes}M`);
      lines.push('END:VALARM');
    }
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export interface ImportedICSEvent {
  title: string;
  notes: string;
  dueDate: string;
  startTime?: string;
  endTime?: string;
  tags: string[];
  isMeeting: boolean;
  reminderMinutes: number;
}

function parseICSDateField(rawVal: string): { date: string; time?: string } | null {
  const clean = rawVal.trim().replace(/Z$/, '');
  const dateOnly = clean.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnly) {
    return { date: `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}` };
  }
  const dateTime = clean.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/);
  if (dateTime) {
    return {
      date: `${dateTime[1]}-${dateTime[2]}-${dateTime[3]}`,
      time: `${dateTime[4]}:${dateTime[5]}`,
    };
  }
  return null;
}

export function parseICSContent(icsText: string): ImportedICSEvent[] {
  const unfolded = icsText.replace(/\r?\n[ \t]/g, '');
  const lines = unfolded.split(/\r?\n/);
  const events: ImportedICSEvent[] = [];

  let current: Partial<ImportedICSEvent> & { inAlarm?: boolean } | null = null;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      current = { reminderMinutes: 15, tags: [] };
      continue;
    }
    if (line === 'END:VEVENT') {
      if (current?.title && current?.dueDate) {
        const tags = inferSmartTags(current.title, current.notes || '', current.tags);
        events.push({
          title: current.title,
          notes: current.notes || '',
          dueDate: current.dueDate,
          startTime: current.startTime,
          endTime: current.endTime,
          tags,
          isMeeting: tags.includes('會議') || /會議|meeting|sync|call/i.test(current.title),
          reminderMinutes: current.reminderMinutes ?? 15,
        });
      }
      current = null;
      continue;
    }
    if (!current) continue;

    if (line === 'BEGIN:VALARM') {
      current.inAlarm = true;
      continue;
    }
    if (line === 'END:VALARM') {
      current.inAlarm = false;
      continue;
    }

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const keyPart = line.slice(0, colonIdx).toUpperCase();
    const valPart = line.slice(colonIdx + 1);
    const baseKey = keyPart.split(';')[0];

    if (current.inAlarm) {
      if (baseKey === 'TRIGGER') {
        const minMatch = valPart.match(/-PT(\d+)M/i);
        if (minMatch) current.reminderMinutes = Number(minMatch[1]);
      }
      continue;
    }

    if (baseKey === 'SUMMARY') {
      current.title = unescapeICS(valPart).trim();
    } else if (baseKey === 'DESCRIPTION') {
      current.notes = unescapeICS(valPart).trim();
    } else if (baseKey === 'DTSTART') {
      const parsed = parseICSDateField(valPart);
      if (parsed) {
        current.dueDate = parsed.date;
        current.startTime = parsed.time;
      }
    } else if (baseKey === 'DTEND') {
      const parsed = parseICSDateField(valPart);
      if (parsed?.time) {
        current.endTime = parsed.time;
      }
    } else if (baseKey === 'CATEGORIES') {
      current.tags = valPart
        .split(',')
        .map((t) => unescapeICS(t).trim())
        .filter(Boolean);
    }
  }

  return events;
}
