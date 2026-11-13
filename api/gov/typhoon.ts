import type { IncomingMessage, ServerResponse } from 'node:http';
import { fetchGovTyphoon } from '../../src/utils/govService.ts';

export default async function handler(_req: IncomingMessage, res: ServerResponse) {
  try {
    const report = await fetchGovTyphoon();
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=180, stale-while-revalidate=60');
    res.end(JSON.stringify(report));
  } catch (error) {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(
      JSON.stringify({
        error: error instanceof Error ? error.message : '連線人事行政總處天然災害查詢失敗',
      })
    );
  }
}
