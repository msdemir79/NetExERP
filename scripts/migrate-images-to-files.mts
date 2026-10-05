/**
 * Görselleri veritabanından dosya sistemine taşır (#51).
 *
 * base64 data URL olarak saklanan ürün/renk görselleri, kullanıcı avatarı ve
 * firma logosu; diske (UPLOAD_DIR, varsayılan data/uploads) yazılır ve ilgili
 * kolonlar `/uploads/<hash>.<ext>` URL'ine güncellenir.
 *
 * Güvenlik/geri alınabilirlik:
 *  - Orijinal base64 değerleri `008-image-backup.sql` yedek tablolarında korunur.
 *    Bu script çalışmadan önce `npm run db:migrate` uygulanmış olmalıdır.
 *  - Idempotent: yalnızca `data:` ile başlayan değerler dönüştürülür; URL'ler
 *    ve boş değerler atlanır. Script birden çok kez güvenle çalıştırılabilir.
 *  - --dry-run: diske/DB'ye yazmadan neyin değişeceğini raporlar.
 *
 * Kullanım:
 *   npm run migrate:images            # gerçek dönüştürme
 *   npm run migrate:images -- --dry-run
 */
import { query, execute, closePool } from '../server/db.js';
import { storeImageFromDataUrl } from '../server/files.js';

const DRY_RUN = process.argv.includes('--dry-run');

function isDataUrl(value: unknown): value is string {
  return typeof value === 'string' && value.trim().startsWith('data:');
}

interface Stats {
  scanned: number;
  converted: number;
  skipped: number;
  bytes: number;
}
const stats: Stats = { scanned: 0, converted: 0, skipped: 0, bytes: 0 };

function log(...args: unknown[]) {
  console.log(...args);
}

/** Tek bir base64 değeri URL'e çevirir (dry-run'da sadece ölçer). */
function transform(dataUrl: string, label: string): string | null {
  stats.scanned++;
  if (DRY_RUN) {
    const approx = Math.floor((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75);
    stats.converted++;
    stats.bytes += approx;
    log(`  [dry-run] ${label}: ~${approx} bayt → dosyaya taşınacak`);
    return null;
  }
  const stored = storeImageFromDataUrl(dataUrl);
  stats.converted++;
  stats.bytes += stored.bytes;
  log(`  ${label}: ${stored.bytes} bayt → ${stored.url}`);
  return stored.url;
}

async function ensureBackups(): Promise<void> {
  const required = ['products_image_backup', 'users_avatar_backup', 'settings_company_backup'];
  const rows = await query<{ TABLE_NAME: string }>(
    `SELECT TABLE_NAME FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (?, ?, ?)`,
    required,
  );
  const found = new Set(rows.map((r) => r.TABLE_NAME));
  const missing = required.filter((t) => !found.has(t));
  if (missing.length) {
    throw new Error(
      `Yedek tabloları eksik: ${missing.join(', ')}. ` +
        `Önce 'npm run db:migrate' çalıştırın (008-image-backup.sql).`,
    );
  }
}

async function migrateProducts(): Promise<void> {
  log('\nÜrünler (products.image + products.colorImages):');
  const rows = await query<{ id: number; image: string | null; colorImages: any }>(
    'SELECT id, image, colorImages FROM products',
  );
  for (const row of rows) {
    let changed = false;
    let newImage: string | null = row.image;

    if (isDataUrl(row.image)) {
      const url = transform(row.image, `products#${row.id}.image`);
      if (url) { newImage = url; changed = true; }
    } else if (row.image) {
      stats.skipped++;
    }

    let newColorImages = row.colorImages;
    let colorArr: any[] | null = null;
    if (row.colorImages) {
      colorArr = typeof row.colorImages === 'string' ? JSON.parse(row.colorImages) : row.colorImages;
    }
    if (Array.isArray(colorArr)) {
      let colorChanged = false;
      for (const entry of colorArr) {
        if (entry && isDataUrl(entry.image)) {
          const url = transform(entry.image, `products#${row.id}.colorImages[${entry.color}]`);
          if (url) { entry.image = url; colorChanged = true; }
        } else if (entry && entry.image) {
          stats.skipped++;
        }
      }
      if (colorChanged) { newColorImages = colorArr; changed = true; }
    }

    if (changed && !DRY_RUN) {
      await execute(
        'UPDATE products SET image = ?, colorImages = ? WHERE id = ?',
        [newImage, newColorImages ? JSON.stringify(newColorImages) : null, row.id],
      );
    }
  }
}

async function migrateUsers(): Promise<void> {
  log('\nKullanıcılar (users.avatar):');
  const rows = await query<{ id: number; avatar: string | null }>('SELECT id, avatar FROM users');
  for (const row of rows) {
    if (isDataUrl(row.avatar)) {
      const url = transform(row.avatar, `users#${row.id}.avatar`);
      if (url && !DRY_RUN) await execute('UPDATE users SET avatar = ? WHERE id = ?', [url, row.id]);
    } else if (row.avatar) {
      stats.skipped++;
    }
  }
}

async function migrateSettings(): Promise<void> {
  log('\nAyarlar (settings.company.logo):');
  const rows = await query<{ id: string; company: any }>('SELECT id, company FROM settings');
  for (const row of rows) {
    if (!row.company) continue;
    const company = typeof row.company === 'string' ? JSON.parse(row.company) : row.company;
    if (company && isDataUrl(company.logo)) {
      const url = transform(company.logo, `settings#${row.id}.company.logo`);
      if (url) {
        company.logo = url;
        if (!DRY_RUN) {
          await execute('UPDATE settings SET company = ? WHERE id = ?', [JSON.stringify(company), row.id]);
        }
      }
    } else if (company && company.logo) {
      stats.skipped++;
    }
  }
}

async function main() {
  log(`Görsel migration ${DRY_RUN ? '(DRY-RUN — hiçbir şey yazılmaz)' : '(GERÇEK ÇALIŞTIRMA)'}`);
  await ensureBackups();
  await migrateProducts();
  await migrateUsers();
  await migrateSettings();
  log('\nÖzet:');
  log(`  Dönüştürülen görsel: ${stats.converted}`);
  log(`  Atlanan (zaten URL/boş): ${stats.skipped}`);
  log(`  Toplam boyut: ~${(stats.bytes / 1024).toFixed(1)} KB`);
  if (DRY_RUN) log('  (dry-run: DB ve disk değişmedi)');
  await closePool();
}

main().catch(async (err) => {
  console.error('Görsel migration başarısız:', err?.message || err);
  try { await closePool(); } catch { /* yoksay */ }
  process.exitCode = 1;
});
