/**
 * TDHP hesap planını veritabanına ekler (restart gerektirmez).
 *
 * Normalde `server/seed.ts` bu hesapları yalnızca sunucu açılışında ve
 * `accounts` tablosu boşken ekler. Tablo sonradan boşaldıysa ve çalışan
 * sunucuyu restart etmek istemiyorsanız bu script aynı veriyi güvenle yükler.
 *
 * `code` UNIQUE olduğu için INSERT IGNORE kullanılır: tekrar çalıştırmak
 * güvenlidir, mevcut hesapların üzerine yazmaz.
 *
 * Kullanım: npm run seed:accounts
 */
import { query, execute, closePool } from '../server/db.js';
import { INITIAL_TDHP_ACCOUNTS } from '../src/data/tdhpAccounts.js';

async function main() {
  const before = await query<{ n: number }>('SELECT COUNT(*) AS n FROM `accounts`');
  console.log(`Mevcut hesap sayısı: ${before[0]?.n ?? 0}`);
  console.log(`TDHP kaynağı: ${INITIAL_TDHP_ACCOUNTS.length} hesap`);

  let inserted = 0;
  let skipped = 0;
  for (const acc of INITIAL_TDHP_ACCOUNTS as any[]) {
    const res = await execute(
      `INSERT IGNORE INTO \`accounts\`
        (\`code\`, \`name\`, \`type\`, \`level\`, \`parentCode\`, \`currency\`, \`description\`, \`isSystem\`, \`isActive\`, \`version\`)
       VALUES (?,?,?,?,?,?,?,?,?,1)`,
      [
        acc.code,
        acc.name,
        acc.type,
        acc.level ?? 1,
        acc.parentCode ?? null,
        acc.currency ?? 'TRY',
        acc.description ?? null,
        acc.isSystem ? 1 : 0,
        acc.isActive === false ? 0 : 1,
      ],
    );
    if (res?.affectedRows) inserted++;
    else skipped++;
  }

  const after = await query<{ n: number }>('SELECT COUNT(*) AS n FROM `accounts`');
  console.log(`\nEklendi: ${inserted}, atlandı (zaten mevcut): ${skipped}`);
  console.log(`Toplam hesap: ${after[0]?.n ?? 0}`);
  await closePool();
}

main().catch(async (err) => {
  console.error('\nHesap planı eklenemedi: ' + (err?.message || err) + '\n');
  try { await closePool(); } catch {}
  process.exit(1);
});
