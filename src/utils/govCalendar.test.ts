import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHolidayVoiceScript,
  buildTyphoonVoiceScript,
  filterTyphoonRegionsForCity,
  getUpcomingHolidays,
  parseDgpaTyphoonHtml,
  parseTaiwanCalendarJson,
} from './govCalendar';

test('parseTaiwanCalendarJson extracts named holidays and make-up workdays', () => {
  const rows = [
    { date: '20260101', week: '四', isHoliday: true, description: '開國紀念日' },
    { date: '20260103', week: '六', isHoliday: true, description: '' },
    { date: '20260207', week: '六', isHoliday: false, description: '補行上班' },
    { date: '20261010', week: '六', isHoliday: true, description: '國慶日' },
  ];
  const parsed = parseTaiwanCalendarJson(rows);
  assert.equal(parsed.length, 3);
  assert.equal(parsed[0].date, '2026-01-01');
  assert.equal(parsed[0].name, '開國紀念日');
  assert.equal(parsed[1].isMakeUpWorkday, true);
  assert.equal(parsed[2].date, '2026-10-10');
});

test('parseDgpaTyphoonHtml handles normal no-alert page and active suspension table', () => {
  const normalHtml = `
    <div class="Header_YMD">115年 11月 13日 天然災害停止上班及上課情形</div>
    <div class="Content_Updata"><h4>更新時間：2026/11/13 10:10:28</h4></div>
    <TBODY class="Table_Body"><TR><TD><h2>無停班停課訊息。</h2></TD></TR></TBODY>
  `;
  const normalReport = parseDgpaTyphoonHtml(normalHtml, 1000);
  assert.equal(normalReport.hasAlert, false);
  assert.equal(normalReport.updatedAtText, '2026/11/13 10:10:28');
  assert.equal(normalReport.regions.length, 0);

  const alertHtml = `
    <div class="Header_YMD">115年 09月 18日 天然災害停止上班及上課情形</div>
    <div class="Content_Updata"><h4>更新時間：2026/09/18 20:00:00</h4></div>
    <TBODY class="Table_Body">
      <TR><TD>臺北市</TD><TD>明天停止上班、停止上課。</TD></TR>
      <TR><TD>新北市</TD><TD>明天停止上班、停止上課。</TD></TR>
      <TR><TD>臺中市</TD><TD>尚未宣布停止上班及上課。</TD></TR>
      <TR><TD colspan="3"><a href="https://www.dgpa.gov.tw/index">人事行政總處全球資訊網</a></TD></TR>
    </TBODY>
  `;
  const alertReport = parseDgpaTyphoonHtml(alertHtml, 2000);
  assert.equal(alertReport.hasAlert, true);
  assert.equal(alertReport.regions.length, 3);
  assert.equal(alertReport.regions[0].isSuspended, true);
  assert.equal(alertReport.regions[2].isSuspended, false);

  const taipeiOnly = filterTyphoonRegionsForCity(alertReport, '台北市');
  assert.equal(taipeiOnly.length, 1);
  assert.equal(taipeiOnly[0].region, '臺北市');

  const voice = buildTyphoonVoiceScript(taipeiOnly, alertReport.updatedAtText);
  assert.match(voice, /臺北市/);
  assert.match(voice, /停止上班、停止上課/);
});

test('getUpcomingHolidays finds holidays within threshold and builds voice script', () => {
  const holidays = [
    { date: '2026-11-14', weekday: '六', isHoliday: true, name: '測試假日', isMakeUpWorkday: false },
    { date: '2026-12-25', weekday: '五', isHoliday: true, name: '行憲紀念日', isMakeUpWorkday: false },
  ];
  const upcoming = getUpcomingHolidays(holidays, '2026-11-13', 3);
  assert.equal(upcoming.length, 1);
  assert.equal(upcoming[0].daysUntil, 1);
  assert.match(buildHolidayVoiceScript(upcoming[0]), /1 天後.*測試假日/);
});
