import {
  DGPA_PORTAL_URL,
  DGPA_TYPHOON_URL,
  GOV_OPENDATA_CALENDAR_URL,
  parseDgpaTyphoonHtml,
  parseTaiwanCalendarJson,
  type RawTaiwanCalendarRow,
} from './govCalendar.ts';
import type { GovHolidayItem, TyphoonAlertReport } from '../types/assistant.ts';

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export interface GovHolidaysPayload {
  year: number;
  sourceUrl: string;
  openDataUrl: string;
  apiUrl: string;
  holidays: GovHolidayItem[];
  fetchedAt: number;
}

const holidayCache = new Map<number, CacheEntry<GovHolidaysPayload>>();
let typhoonCache: CacheEntry<TyphoonAlertReport> | null = null;

export async function fetchGovHolidays(yearInput?: number): Promise<GovHolidaysPayload> {
  const currentYear = new Date().getFullYear();
  const year =
    typeof yearInput === 'number' &&
    Number.isInteger(yearInput) &&
    yearInput >= 2020 &&
    yearInput <= 2035
      ? yearInput
      : currentYear;

  const cached = holidayCache.get(year);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const apiUrl = `https://cdn.jsdelivr.net/gh/ruyut/TaiwanCalendar/data/${year}.json`;
  const response = await fetch(apiUrl, {
    headers: { 'User-Agent': 'KairoAssistant/1.0' },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    throw new Error(`無法取得 ${year} 年政府辦公日曆表 (${response.status})`);
  }
  const raw = (await response.json()) as RawTaiwanCalendarRow[];
  const items = parseTaiwanCalendarJson(raw);
  const payload: GovHolidaysPayload = {
    year,
    sourceUrl: DGPA_PORTAL_URL,
    openDataUrl: GOV_OPENDATA_CALENDAR_URL,
    apiUrl,
    holidays: items,
    fetchedAt: Date.now(),
  };
  holidayCache.set(year, {
    data: payload,
    expiresAt: Date.now() + 60 * 60 * 1000,
  });
  return payload;
}

export async function fetchGovTyphoon(): Promise<TyphoonAlertReport> {
  if (typhoonCache && typhoonCache.expiresAt > Date.now()) {
    return typhoonCache.data;
  }

  const response = await fetch(DGPA_TYPHOON_URL, {
    headers: { 'User-Agent': 'KairoAssistant/1.0' },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    throw new Error(`無法取得人事行政總處停班停課頁面 (${response.status})`);
  }
  const html = await response.text();
  const report = parseDgpaTyphoonHtml(html, Date.now());
  typhoonCache = {
    data: report,
    expiresAt: Date.now() + 3 * 60 * 1000,
  };
  return report;
}
