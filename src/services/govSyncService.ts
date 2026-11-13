import type { GovHolidayItem, TyphoonAlertReport } from '../types/assistant';

export interface GovHolidaysResponse {
  year: number;
  sourceUrl: string;
  openDataUrl: string;
  apiUrl: string;
  holidays: GovHolidayItem[];
  fetchedAt: number;
}

export async function fetchGovHolidays(year: number): Promise<GovHolidaysResponse> {
  const res = await fetch(`/api/gov/holidays?year=${encodeURIComponent(year)}`);
  if (!res.ok) {
    throw new Error(`無法取得 ${year} 年行政院人事行政總處辦公日曆表`);
  }
  return res.json() as Promise<GovHolidaysResponse>;
}

export async function fetchGovTyphoonStatus(): Promise<TyphoonAlertReport> {
  const res = await fetch('/api/gov/typhoon');
  if (!res.ok) {
    throw new Error('無法取得行政院人事行政總處停班停課公告');
  }
  return res.json() as Promise<TyphoonAlertReport>;
}
