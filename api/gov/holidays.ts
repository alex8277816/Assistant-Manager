import type { IncomingMessage, ServerResponse } from 'node:http';
import { fetchGovHolidays } from '../../src/utils/govService.ts';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url || '/', 'http://localhost');
  const yearParam = Number(url.searchParams.get('year') || new Date().getFullYear());

  try {
    const payload = await fetchGovHolidays(yearParam);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=600');
    res.end(JSON.stringify(payload));
  } catch (error) {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(
      JSON.stringify({
        error: error instanceof Error ? error.message : '連線政府辦公日曆表失敗',
      })
    );
  }
}
