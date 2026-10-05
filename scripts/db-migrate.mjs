/**
 * Veritabanı geçiş (migration) çalıştırıcısı.
 *
 * `db/migrations/` altındaki `.sql` dosyalarını dosya adı sırasına göre uygular
 * ve uygulananları `schema_migrations` tablosunda işaretler; böylece tekrar
 * çalıştırıldığında aynı geçiş ikinci kez uygulanmaz.
 *
 * Kullanım: npm run db:migrate
 *
 * Not: MySQL'de DDL otomatik commit edilir; bu nedenle her dosya tek tek
 * uygulanır ve başarılı olanlar kaydedilir. Bir dosya hata verirse işlem
 * durur ve hata mesajı gösterilir.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const migrationsDir = path.join(root, 'db', 'migrations');

async function main() {
  if (!fs.existsSync(migrationsDir)) {
    console.log('db/migrations klasörü bulunamadı; uygulanacak geçiş yok.');
    return;
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (!files.length) {
    console.log('Uygulanacak geçiş dosyası yok.');
    return;
  }

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'proerp',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'proerp',
    charset: 'utf8mb4_turkish_ci',
    multipleStatements: true,
  });

  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id        VARCHAR(255) NOT NULL,
        appliedAt DATETIME     NOT NULL,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci
    `);

    const [rows] = await conn.query('SELECT id FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.id));

    let count = 0;
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`  = ${file} (daha önce uygulanmış)`);
        continue;
      }
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      process.stdout.write(`  → ${file} uygulanıyor... `);
      try {
        await conn.query(sql);
        await conn.query('INSERT INTO schema_migrations (id, appliedAt) VALUES (?, NOW())', [file]);
        console.log('tamam');
        count++;
      } catch (err) {
        console.log('HATA');
        console.error(`\n"${file}" uygulanamadı: ${err?.message || err}`);
        console.error(
          [
            '',
            '⚠ Kısmi uygulama mümkün: MySQL DDL ifadelerini otomatik commit eder,',
            '  bu yüzden bu dosya birden fazla ifade içeriyorsa bazıları uygulanmış,',
            '  bazıları uygulanmamış olabilir. Dosya schema_migrations\'a İŞLENMEDİ.',
            '',
            '  Ne yapmalı:',
            `  1. "${file}" içeriğini ve yukarıdaki hata mesajını inceleyin.`,
            '  2. Veritabanının gerçek durumunu kontrol edin (SHOW COLUMNS / SHOW TABLES',
            '     / information_schema) — ifadenin yarısı uygulanmış olabilir.',
            '  3. Gerekirse `npm run db:backup` ile yedek alıp düzeltin, sonra tekrar',
            '     `npm run db:migrate` çalıştırın.',
            '  4. Taze bir kurulumda (npm run db:setup) bu dosya zaten taban çizgisinde',
            '     işaretlenir; orada schema.sql güncel kabul edilir.',
            '',
          ].join('\n'),
        );
        throw err;
      }
    }

    console.log('');
    console.log(count ? `${count} geçiş uygulandı.` : 'Veritabanı güncel; uygulanacak geçiş yok.');
    console.log('');
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('Geçiş işlemi başarısız:', err?.message || err);
  console.error('.env içindeki DB_* ayarlarını kontrol edin.\n');
  process.exitCode = 1;
});
