import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {
  fetchGovHolidays,
  fetchGovTyphoon,
} from './src/utils/govService.ts';

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

async function createApp() {
  const app = express();
  const httpServer = http.createServer(app);
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  // 行政院人事行政總處 政府行政機關辦公日曆表 (國定假日與補行上班日)
  app.get('/api/gov/holidays', async (req, res) => {
    const yearParam = Number(req.query.year || new Date().getFullYear());
    try {
      const payload = await fetchGovHolidays(yearParam);
      res.json(payload);
    } catch (error) {
      res.status(502).json({
        error: error instanceof Error ? error.message : '連線政府辦公日曆表失敗',
      });
    }
  });

  // 行政院人事行政總處 天然災害停止上班及上課即時查詢 (颱風假)
  app.get('/api/gov/typhoon', async (_req, res) => {
    try {
      const report = await fetchGovTyphoon();
      res.json(report);
    } catch (error) {
      res.status(502).json({
        error: error instanceof Error ? error.message : '連線人事行政總處天然災害查詢失敗',
      });
    }
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : { server: httpServer },
        watch: process.env.DISABLE_HMR === 'true' ? null : undefined,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(import.meta.dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Not built');
      }
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Kairo Assistant server listening on http://0.0.0.0:${PORT}`);
  });
}

createApp();
