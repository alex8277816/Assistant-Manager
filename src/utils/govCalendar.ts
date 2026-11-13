import type {
  GovHolidayItem,
  TyphoonAlertReport,
  TyphoonRegionStatus,
} from '../types/assistant.ts';

export const TAIWAN_CITIES: string[] = [
  '全部縣市',
  '基隆市',
  '臺北市',
  '新北市',
  '桃園市',
  '新竹市',
  '新竹縣',
  '苗栗縣',
  '臺中市',
  '彰化縣',
  '南投縣',
  '雲林縣',
  '嘉義市',
  '嘉義縣',
  '臺南市',
  '高雄市',
  '屏東縣',
  '宜蘭縣',
  '花蓮縣',
  '臺東縣',
  '澎湖縣',
  '金門縣',
  '連江縣',
];

export const DGPA_PORTAL_URL = 'https://www.dgpa.gov.tw/';
export const DGPA_TYPHOON_URL = 'https://www.dgpa.gov.tw/typh/daily/nds.html';
export const GOV_OPENDATA_CALENDAR_URL = 'https://data.gov.tw/dataset/14718';

export interface RawTaiwanCalendarRow {
  date: string;
  week?: string;
  isHoliday: boolean;
  description?: string;
}

export function normalizeGovDate(rawDate: string): string {
  const clean = rawDate.replace(/\D/g, '');
  if (clean.length !== 8) return rawDate;
  return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`;
}

export function parseTaiwanCalendarJson(rows: RawTaiwanCalendarRow[]): GovHolidayItem[] {
  if (!Array.isArray(rows)) return [];
  const items: GovHolidayItem[] = [];

  for (const row of rows) {
    if (!row || !row.date) continue;
    const desc = (row.description || '').trim();
    const isMakeUpWorkday = !row.isHoliday && /補行上班|補班/.test(desc);
    const isNamedHoliday = Boolean(row.isHoliday && desc.length > 0);

    if (!isNamedHoliday && !isMakeUpWorkday) continue;

    items.push({
      date: normalizeGovDate(row.date),
      weekday: row.week || '',
      isHoliday: Boolean(row.isHoliday),
      name: desc || '國定假日',
      isMakeUpWorkday,
    });
  }

  return items.sort((a, b) => a.date.localeCompare(b.date));
}

function stripHtmlTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseDgpaTyphoonHtml(
  html: string,
  fetchedAt = Date.now()
): TyphoonAlertReport {
  const titleMatch = html.match(/<div[^>]*class=["']Header_YMD["'][^>]*>([\s\S]*?)<\/div>/i);
  const title = titleMatch
    ? stripHtmlTags(titleMatch[1])
    : '行政院人事行政總處 天然災害停止上班及上課情形';

  const updatedMatch = html.match(/更新時間[：:]\s*([0-9/:\s]+)/);
  const updatedAtText = updatedMatch ? updatedMatch[1].trim() : '';

  const tbodyMatch = html.match(/<tbody[^>]*class=["']Table_Body["'][^>]*>([\s\S]*?)<\/tbody>/i);
  const tbodyHtml = tbodyMatch ? tbodyMatch[1] : html;

  if (/無停班停課訊息/.test(tbodyHtml)) {
    return {
      title,
      updatedAtText,
      hasAlert: false,
      summary: '目前全臺各縣市正常上班上課，無天然災害停班停課訊息。',
      regions: [],
      sourceUrl: DGPA_TYPHOON_URL,
      fetchedAt,
    };
  }

  const regions: TyphoonRegionStatus[] = [];
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRegex.exec(tbodyHtml)) !== null) {
    const rowHtml = rowMatch[1];
    // Skip footnote row
    if (/人事行政總處全球資訊網|語音查詢電話|勞動部網頁/.test(rowHtml)) continue;

    const cells: string[] = [];
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      cells.push(stripHtmlTags(cellMatch[1]));
    }

    if (cells.length >= 2) {
      const region = cells[0];
      const statusText = cells.slice(1).join(' ').trim();
      if (!region || !statusText) continue;
      const isSuspended =
        /停止上班|停止上課/.test(statusText) && !/尚未宣布|照常上班、照常上課/.test(statusText);
      regions.push({ region, statusText, isSuspended });
    }
  }

  const suspendedRegions = regions.filter((r) => r.isSuspended);
  const hasAlert = suspendedRegions.length > 0;
  const summary = hasAlert
    ? `目前共有 ${suspendedRegions.length} 個縣市發布停班停課訊息：${suspendedRegions
        .map((r) => r.region)
        .slice(0, 6)
        .join('、')}${suspendedRegions.length > 6 ? ' 等' : ''}`
    : '目前各縣市無停止上班上課公告。';

  return {
    title,
    updatedAtText,
    hasAlert,
    summary,
    regions,
    sourceUrl: DGPA_TYPHOON_URL,
    fetchedAt,
  };
}

export interface UpcomingHolidayAlert {
  holiday: GovHolidayItem;
  daysUntil: number;
}

export function getUpcomingHolidays(
  holidays: GovHolidayItem[],
  todayDateStr: string,
  withinDays: number
): UpcomingHolidayAlert[] {
  const [ty, tm, td] = todayDateStr.split('-').map(Number);
  const todayMs = Date.UTC(ty, tm - 1, td);
  const results: UpcomingHolidayAlert[] = [];

  for (const h of holidays) {
    if (!h.isHoliday) continue;
    const [hy, hm, hd] = h.date.split('-').map(Number);
    const hMs = Date.UTC(hy, hm - 1, hd);
    const diffDays = Math.round((hMs - todayMs) / (1000 * 60 * 60 * 24));
    if (diffDays >= 0 && diffDays <= withinDays) {
      results.push({ holiday: h, daysUntil: diffDays });
    }
  }

  return results.sort((a, b) => a.daysUntil - b.daysUntil);
}

export function filterTyphoonRegionsForCity(
  report: TyphoonAlertReport | null,
  monitoredCity: string
): TyphoonRegionStatus[] {
  if (!report || !report.hasAlert) return [];
  const suspended = report.regions.filter((r) => r.isSuspended);
  if (!monitoredCity || monitoredCity === '全部縣市') return suspended;
  const normalizedTarget = monitoredCity.replace(/台/g, '臺');
  return suspended.filter((r) => r.region.replace(/台/g, '臺').includes(normalizedTarget));
}

export function buildHolidayVoiceScript(alert: UpcomingHolidayAlert): string {
  if (alert.daysUntil === 0) {
    return `假日提醒：今天 ${alert.holiday.date} 為行政院人事行政總處公告之「${alert.holiday.name}」，請留意機關與銀行放假時間。`;
  }
  return `假日預告：${alert.daysUntil} 天後（${alert.holiday.date}）為國定假日「${alert.holiday.name}」，建議提前調整工作排程。`;
}

export function buildTyphoonVoiceScript(
  regions: TyphoonRegionStatus[],
  updatedAtText: string
): string {
  if (regions.length === 0) {
    return `行政院人事行政總處最新天然災害公告（更新時間 ${updatedAtText || '即時'}）：目前無停止上班上課訊息。`;
  }
  const details = regions
    .slice(0, 4)
    .map((r) => `${r.region}：${r.statusText}`)
    .join('。');
  return `緊急停班停課提醒：行政院人事行政總處通報，${details}。請注意安全並留意最新氣象局與人事總處資訊。`;
}
