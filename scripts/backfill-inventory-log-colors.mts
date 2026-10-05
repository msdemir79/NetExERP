/**
 * inventoryLogs.color/size geri doldurma (bakım betiği).
 *
 * Renk kolonu doldurulmadan önce yazılmış eski hareketlerde renk bilgisi yalnızca
 * `description` serbest metninde duruyor; bu yüzden stok kartı ekstresi renk
 * kırılımı gösteremiyordu. Betik, ürün kartındaki renk listesini esas alarak
 * açıklamada geçen rengi bulur ve yalnızca color IS NULL olan satırlara yazar.
 *
 * Kullanım:
 *   npx tsx scripts/backfill-inventory-log-colors.mts           # kuru çalıştırma (yazmaz)
 *   npx tsx scripts/backfill-inventory-log-colors.mts --apply   # uygular
 */
import { query, closePool } from '../server/db.js';

const APPLY = process.argv.includes('--apply');

interface LogRow {
  id: number;
  productId: number;
  description: string;
}

const parseList = (raw: unknown): any[] => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((v) => ({ ...v }));
  if (typeof raw === 'string') {
    try { const p = JSON.parse(raw); return Array.isArray(p) ? p.map((v: any) => ({ ...v })) : []; } catch { return []; }
  }
  return [];
};

/**
 * Eski kayıtlarda renk adı ASCII ("SIYAH") veya küçük harf ("Siyah") yazılmış olabiliyor.
 * Karşılaştırma Türkçe harfleri katlayarak yapılır; geriye her zaman ürün kartındaki
 * kanonik yazım döner ki ekstre aynı rengi iki ayrı gruba bölmesin.
 */
function foldTurkish(value: string): string {
  return value
    .toLocaleUpperCase('tr')
    .replace(/İ/g, 'I')
    .replace(/Ş/g, 'S')
    .replace(/Ğ/g, 'G')
    .replace(/Ü/g, 'U')
    .replace(/Ö/g, 'O')
    .replace(/Ç/g, 'C');
}

/** Açıklamadan beden bilgisini çıkarır; asorti dağılımları tek bedene indirgenmez. */
function extractSize(desc: string): string | null {
  if (/asorti/i.test(desc)) return 'Asorti';
  const m = desc.match(/Beden[:\s]+(\d{2,3})(?!\s*[-–])/i);
  return m ? m[1] : null;
}

async function main(): Promise<void> {
  const logs = (await query(
    'SELECT `id`, `productId`, `description` FROM `inventoryLogs` WHERE `color` IS NULL OR `color` = \'\' ORDER BY `id` ASC',
  )) as LogRow[];

  const products = (await query('SELECT `id`, `code`, `name`, `variantBarcodes` FROM `products`')) as any[];
  const colorsByProduct = new Map<number, string[]>();
  /** Hammadde kartlarında renk listesi yoktur; sarf hareketleri bu ortak sözlükle eşleşir. */
  const globalColors: string[] = [];
  const pushGlobal = (v: unknown) => {
    const s = typeof v === 'string' ? v.trim() : '';
    if (s && !globalColors.some((n) => foldTurkish(n) === foldTurkish(s))) globalColors.push(s);
  };
  const pushProduct = (productId: number, v: unknown) => {
    const s = typeof v === 'string' ? v.trim() : '';
    if (!s) return;
    const names = colorsByProduct.get(productId) || [];
    if (!names.some((n) => foldTurkish(n) === foldTurkish(s))) names.push(s);
    colorsByProduct.set(productId, names);
    pushGlobal(s);
  };
  for (const p of products) {
    const id = Number(p.id);
    if (!colorsByProduct.has(id)) colorsByProduct.set(id, []);
    parseList(p.variantBarcodes).forEach((v: any) => pushProduct(id, v?.color));
  }
  // Renk listesi artık products.colors JSON'unda değil, merkezi kartlarda
  // (productColors bağı) tutulur; ürün sözlüğü oradan kurulur.
  const linkedColors = (await query(
    'SELECT `pc`.`productId`, `c`.`name` FROM `productColors` `pc` JOIN `colors` `c` ON `c`.`id` = `pc`.`colorId` ORDER BY `pc`.`productId`, `pc`.`sortOrder`',
  )) as any[];
  linkedColors.forEach((r) => pushProduct(Number(r.productId), r.name));
  // Merkezi kartların tamamı ortak sözlüğe girer: ürüne bağlanmamış renkler de
  // açıklama metninden tanınabilsin.
  const allColors = (await query('SELECT `name` FROM `colors` ORDER BY `name`')) as any[];
  allColors.forEach((r) => pushGlobal(r.name));
  const usedColors = (await query('SELECT DISTINCT `color` FROM `inventoryLogs` WHERE `color` IS NOT NULL AND `color` <> \'\'')) as any[];
  usedColors.forEach((r) => pushGlobal(r.color));

  let resolvable = 0;
  let ambiguous = 0;
  let unmatched = 0;
  const plan: { id: number; color: string | null; size: string | null; description: string }[] = [];
  const skipped: { id: number; reason: string; description: string }[] = [];

  for (const log of logs) {
    const desc = String(log.description || '');
    const foldedDesc = foldTurkish(desc);
    const productColors = colorsByProduct.get(Number(log.productId)) || [];
    const vocabulary = productColors.length > 0 ? productColors : globalColors;
    const hits = vocabulary.filter((n) => foldedDesc.includes(foldTurkish(n)));

    // "KIRIK BEYAZ" ve "BEYAZ" birlikte eşleşirse uzun olan kazanır.
    let color: string | null = null;
    if (hits.length > 0) {
      const longest = Math.max(...hits.map((h) => foldTurkish(h).length));
      const best = hits.filter((h) => foldTurkish(h).length === longest);
      if (new Set(best.map(foldTurkish)).size === 1) {
        color = best[0];
        resolvable++;
      } else {
        ambiguous++;
        skipped.push({ id: log.id, reason: `birden çok renk (${best.join(', ')})`, description: desc.slice(0, 90) });
      }
    } else {
      unmatched++;
      skipped.push({ id: log.id, reason: 'açıklamada renk adı geçmiyor', description: desc.slice(0, 90) });
    }

    const size = extractSize(desc);
    if (color || size) plan.push({ id: log.id, color, size, description: desc.slice(0, 90) });
  }

  console.log(`\ninventoryLogs renk geri doldurma — ${APPLY ? 'UYGULANIYOR' : 'KURU ÇALIŞTIRMA'}`);
  console.log(`Renksiz hareket: ${logs.length} | tek renk eşleşen: ${resolvable} | birden çok eşleşen (atlandı): ${ambiguous} | eşleşmeyen (atlandı): ${unmatched}`);
  console.log(`Güncellenecek satır: ${plan.length} (renk yazılacak: ${plan.filter((p) => p.color).length})\n`);

  for (const p of plan) {
    console.log(`  #${p.id} → color=${p.color ?? '(NULL kalır)'} size=${p.size ?? '-'} | ${p.description}`);
  }
  if (skipped.length) {
    console.log('\nAtlanan satırlar (color NULL kalır, ekstrede "Renksiz Kayıtlar" grubunda görünür):');
    for (const s of skipped) console.log(`  #${s.id} — ${s.reason} | ${s.description}`);
  }

  if (!APPLY) {
    console.log('\nHiçbir kayıt değiştirilmedi. Uygulamak için: --apply\n');
    return;
  }

  for (const p of plan) {
    // Yalnızca boş kolonlar doldurulur; mevcut bir değer asla ezilmez (betik tekrar koşmaya dayanıklıdır).
    await query(
      'UPDATE `inventoryLogs` SET `color` = COALESCE(NULLIF(`color`, \'\'), ?), `size` = COALESCE(NULLIF(`size`, \'\'), ?) WHERE `id` = ?',
      [p.color, p.size, p.id],
    );
  }
  console.log(`\n${plan.length} satır güncellendi.\n`);
}

main()
  .catch((err) => { console.error('Betiğin dışında hata:', err); process.exitCode = 1; })
  .finally(() => closePool());
