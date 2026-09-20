import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { createApiRouter } from './server/api.js';
import { testConnection } from './server/db.js';
import { runSeed } from './server/seed.js';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  app.use(express.json({ limit: '25mb' }));

  // Sağlık kontrolü — veritabanı bağlantısını da raporlar.
  app.get('/api/health', async (_req, res) => {
    const db = await testConnection();
    res.status(db.ok ? 200 : 503).json({
      status: db.ok ? 'ok' : 'db_error',
      database: db.ok ? { connected: true, version: db.version } : { connected: false, error: db.error },
      timestamp: new Date().toISOString(),
    });
  });

  // REST API
  app.use('/api', createApiRouter());

  // Vite (geliştirme) / statik dosyalar (üretim)
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api/')) {
        res.status(404).json({ error: 'Bilinmeyen API yolu.' });
        return;
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const db = await testConnection();
  if (db.ok) {
    console.log(`MySQL bağlantısı kuruldu (${db.version}).`);
    try {
      const seeded = await runSeed();
      if (seeded.created) console.log('Başlangıç verileri yüklendi.');
    } catch (err: any) {
      console.error('Seed hatası:', err?.message || err);
    }
  } else {
    console.error('');
    console.error('!!! MySQL bağlantısı kurulamadı: ' + db.error);
    console.error('    .env dosyasındaki DB_* ayarlarını kontrol edin.');
    console.error('    Veritabanını kurmak için: npm run db:setup');
    console.error('');
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ProERP sunucusu http://localhost:${PORT} adresinde çalışıyor.`);
  });
}

startServer();
