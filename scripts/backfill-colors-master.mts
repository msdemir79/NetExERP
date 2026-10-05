/**
 * Merkezi renk kartı (color master) veri taşıma betiği.
 *
 * Renk bilgisi bugüne kadar serbest metin olarak birçok yerde tutuluyordu:
 *   - products.colors (JSON dizi), variantBarcodes[].color, colorBoxBarcodes[].color,
 *     colorImages[].color
 *   - recipes.targetColor, workOrders.color
 *   - inventoryLogs.color, orderItems.color, waybillItems.color, invoiceItems.color
 *
 * Bu betik:
 *   1) Tüm bu metinleri tarar, Türkçe büyük/küçük harf farklarını katlayarak
 *      (Siyah / SİYAH / siyah → tek kayıt) benzersiz renk adları üretir,
 *   2) `colors` tablosuna R-0001, R-0002 ... kodlarıyla kartları açar,
 *   3) products ↔ colors bağını `productColors`'a yazar,
 *   4) satır tablolarındaki `colorId` FK'larını mevcut metne göre doldurur.
 *
 * VERİ GÜVENLİĞİ:
 *   - Hiçbir satırın mevcut `color` metni SİLİNMEZ ya da DEĞİŞTİRİLMEZ
 *     (yalnızca colorId/productColors doldurulur; boş değerler ezilmez).
 *   - HEX kodu YALNIZCA src/lib/colorSwatches.ts paletinde birebir karşılığı
 *     olan adlar için yazılır. Emin olunmayan renkte HEX boş bırakılır;
 *     kullanıcı Renk Tanımları ekranından sonradan doldurur (uydurma değer yok).
 *   - Betik tekrar koşmaya dayanıklıdır (idempotent): var olan kart/bağ atlanır.
 *
 * Kullanım:
 *   npx tsx scripts/backfill-colors-master.mts           # kuru çalıştırma (yazmaz)
 *   npx tsx scripts/backfill-colors-master.mts --apply   # uygular
 */
import { query, closePool } from '../server/db.js';
import { getPaletteHex } from '../src/lib/colorSwatches.js';

const APPLY = process.argv.includes('--apply');

/** Karşılaştırma anahtarı: Türkçe harfleri katlanmış büyük harf. */
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

/** Kartta saklanacak ad: Türkçe büyük harf (uygulama genelindeki kanonik biçim). */
function canonicalName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleUpperCase('tr');
}

function parseList(raw: unknown): any[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try { const parsed = JSON.parse(raw); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
  }
  return [];
}

function hexFor(name: string): { hex: string | null; rgb: string | null } {
  const bg = getPaletteHex(name);
  if (!bg) return { hex: null, rgb: null };
  const r = parseInt(bg.slice(1, 3), 16);
  const g = parseInt(bg.slice(3, 5), 16);
  const b = parseInt(bg.slice(5, 7), 16);
  return { hex: bg, rgb: `${r}, ${g}, ${b}` };
}

/** Aynı rengin farklı yazımları arasında en sık geçen yazımı temsilci seçer. */
class ColorVocabulary {
  private byFold = new Map<string, { variants: Map<string, number>; canonical: string }>();

  add(raw: unknown): void {
    const text = typeof raw === 'string' ? raw.trim() : '';
    if (!text || text === '-') return;
    const key = foldTurkish(text);
    if (!key) return;
    let entry = this.byFold.get(key);
    if (!entry) {
      entry = { variants: new Map(), canonical: canonicalName(text) };
      this.byFold.set(key, entry);
    }
    entry.variants.set(text, (entry.variants.get(text) || 0) + 1);
    // En sık geçen yazım kanonik ad olur (eşitlikte mevcut kanonik korunur).
    let best = entry.canonical;
    let bestCount = 0;
    for (const [variant, count] of entry.variants) {
      if (count > bestCount) { best = canonicalName(variant); bestCount = count; }
    }
    entry.canonical = best;
  }

  /** Katlanmış ad → kanonik ad. */
  entries(): { key: string; name: string }[] {
    return [...this.byFold.entries()]
      .map(([key, entry]) => ({ key, name: entry.canonical }))
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  }
}

async function main(): Promise<void> {
  const vocab = new ColorVocabulary();

  // 007 geçişi products.colors kolonunu düşürür; betik hem öncesinde hem
  // sonrasında koşabilsin diye kolon varsa sorguya eklenir.
  const hasLegacyColumn = ((await query(
    'SELECT COUNT(*) AS `n` FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = \'products\' AND COLUMN_NAME = \'colors\'',
  )) as any[])[0]?.n > 0;
  const productColumns = hasLegacyColumn
    ? '`id`, `code`, `colors`, `variantBarcodes`, `colorBoxBarcodes`, `colorImages`'
    : '`id`, `code`, `variantBarcodes`, `colorBoxBarcodes`, `colorImages`';
  const products = (await query(`SELECT ${productColumns} FROM \`products\` ORDER BY \`id\` ASC`)) as any[];

  /** Ürün → renk adları (productColors bağı buradan yazılır). */
  const productColorNames = new Map<number, string[]>();
  for (const p of products) {
    const names: string[] = [];
    const push = (value: unknown) => {
      const text = typeof value === 'string' ? value.trim() : '';
      if (!text) return;
      vocab.add(text);
      const canonical = canonicalName(text);
      if (!names.some((n) => foldTurkish(n) === foldTurkish(canonical))) names.push(canonical);
    };
    parseList(p.colors).forEach(push);
    parseList(p.variantBarcodes).forEach((v: any) => push(v?.color));
    parseList(p.colorBoxBarcodes).forEach((v: any) => push(v?.color));
    parseList(p.colorImages).forEach((v: any) => push(v?.color));
    productColorNames.set(Number(p.id), names);
  }

  // Kolon düşürülmüşse ürün renkleri zaten productColors'tadır; mevcut bağlar
  // sözlüğe ve plana dahil edilir ki betik yeniden koştuğunda kart üretmesin.
  if (!hasLegacyColumn) {
    const existingLinks = (await query(
      'SELECT `pc`.`productId`, `c`.`name` FROM `productColors` `pc` JOIN `colors` `c` ON `c`.`id` = `pc`.`colorId` ORDER BY `pc`.`productId`, `pc`.`sortOrder`',
    )) as any[];
    for (const link of existingLinks) {
      vocab.add(link.name);
      const names = productColorNames.get(Number(link.productId)) || [];
      names.push(canonicalName(String(link.name)));
      productColorNames.set(Number(link.productId), names);
    }
  }

  // Satır/hareket tablolarındaki renk metinleri de sözlüğe eklenir: ürün kartında
  // hiç geçmeyen ama belgelerde kullanılan renkler karttan mahrum kalmasın.
  const textSources: { label: string; sql: string }[] = [
    { label: 'inventoryLogs', sql: 'SELECT DISTINCT `color` FROM `inventoryLogs` WHERE `color` IS NOT NULL AND `color` <> \'\'' },
    { label: 'orderItems', sql: 'SELECT DISTINCT `color` FROM `orderItems` WHERE `color` IS NOT NULL AND `color` <> \'\'' },
    { label: 'waybillItems', sql: 'SELECT DISTINCT `color` FROM `waybillItems` WHERE `color` IS NOT NULL AND `color` <> \'\'' },
    { label: 'invoiceItems', sql: 'SELECT DISTINCT `color` FROM `invoiceItems` WHERE `color` IS NOT NULL AND `color` <> \'\'' },
    { label: 'workOrders', sql: 'SELECT DISTINCT `color` FROM `workOrders` WHERE `color` IS NOT NULL AND `color` <> \'\'' },
    { label: 'recipes', sql: 'SELECT DISTINCT `targetColor` AS `color` FROM `recipes` WHERE `targetColor` IS NOT NULL AND `targetColor` <> \'\'' },
  ];
  for (const source of textSources) {
    const rows = (await query(source.sql)) as any[];
    rows.forEach((r) => vocab.add(r.color));
  }

  const existing = (await query('SELECT `id`, `code`, `name` FROM `colors`')) as any[];
  const existingByFold = new Map<string, { id: number; code: string }>(
    existing.map((c) => [foldTurkish(String(c.name)), { id: Number(c.id), code: String(c.code) }]),
  );
  const usedCodes = new Set(existing.map((c) => foldTurkish(String(c.code))));

  // Sıradaki R-#### kodu mevcut kartlardan tembel başlatılır (sayaç tablosu da güncellenir).
  let counter = existing.reduce((max, c) => {
    const m = /^R-(\d+)$/i.exec(String(c.code));
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
  const nextCode = (): string => {
    counter += 1;
    return `R-${String(counter).padStart(4, '0')}`;
  };

  const toCreate: { code: string; name: string; hex: string | null; rgb: string | null }[] = [];
  /** Katlanmış renk adı → colors.id (negatif değer: bu koşuda açılacak kartın dizini). */
  const nameToId = new Map<string, number>();
  for (const [fold, entry] of existingByFold) nameToId.set(fold, entry.id);

  for (const item of vocab.entries()) {
    if (nameToId.has(item.key)) continue;
    const { hex, rgb } = hexFor(item.name);
    let code = nextCode();
    while (usedCodes.has(foldTurkish(code))) code = nextCode();
    usedCodes.add(foldTurkish(code));
    toCreate.push({ code, name: item.name, hex, rgb });
    nameToId.set(item.key, -toCreate.length); // negatif: henüz insert edilmedi
  }

  const links: { productId: number; name: string; sortOrder: number }[] = [];
  for (const [productId, names] of productColorNames) {
    names.forEach((name, index) => links.push({ productId, name, sortOrder: index }));
  }

  console.log(`\nMerkezi renk kartı taşıma — ${APPLY ? 'UYGULANIYOR' : 'KURU ÇALIŞTIRMA'}`);
  console.log(`Taranan ürün: ${products.length} | bulunan benzersiz renk: ${vocab.entries().length}`);
  console.log(`Mevcut kart: ${existing.length} | yeni açılacak kart: ${toCreate.length} | ürün↔renk bağı: ${links.length}\n`);

  for (const c of toCreate) {
    console.log(`  + ${c.code} | ${c.name} | HEX: ${c.hex ?? '(boş bırakıldı — kullanıcı dolduracak)'}`);
  }

  if (!APPLY) {
    console.log('\nHiçbir kayıt değiştirilmedi. Uygulamak için: --apply\n');
    return;
  }

  const createdIds = new Map<number, number>(); // toCreate dizin (1-based) → colors.id
  for (let i = 0; i < toCreate.length; i++) {
    const c = toCreate[i];
    const result: any = await query(
      'INSERT INTO `colors` (`code`, `name`, `hexCode`, `rgbCode`, `isActive`, `createdAt`, `updatedAt`) VALUES (?, ?, ?, ?, 1, NOW(), NOW())',
      [c.code, c.name, c.hex, c.rgb],
    );
    const insertId = Number(result?.[0]?.insertId || result?.insertId || 0);
    createdIds.set(i + 1, insertId);
    nameToId.set(foldTurkish(c.name), insertId);
  }

  // Negatif yer tutucular gerçek id'lerle değiştirilir.
  const resolveId = (name: string): number | null => {
    const raw = nameToId.get(foldTurkish(name));
    if (raw === undefined) return null;
    return raw < 0 ? (createdIds.get(-raw) ?? null) : raw;
  };

  let linkCount = 0;
  for (const link of links) {
    const colorId = resolveId(link.name);
    if (!colorId) continue;
    await query(
      'INSERT IGNORE INTO `productColors` (`productId`, `colorId`, `sortOrder`, `createdAt`) VALUES (?, ?, ?, NOW())',
      [link.productId, colorId, link.sortOrder],
    );
    linkCount++;
  }

  // Satır tablolarının colorId bağı: metin değişmez, yalnızca FK doldurulur.
  // Eşleştirme Türkçe katlamasıyla (foldTurkish) yapılır: SQL eşitliği
  // utf8mb4_turkish_ci altında "SIYAH" ile "SİYAH"ı aynı saymaz, oysa ikisi
  // de aynı kartın yazımıdır ve kart sözlüğü zaten katlanarak kurulmuştur.
  const cards = (await query('SELECT `id`, `name` FROM `colors`')) as any[];
  const idByFold = new Map<string, number>();
  for (const card of cards) {
    const key = foldTurkish(String(card.name));
    if (!idByFold.has(key)) idByFold.set(key, Number(card.id));
  }

  const fkTargets = [
    { table: 'inventoryLogs', column: 'color' },
    { table: 'orderItems', column: 'color' },
    { table: 'waybillItems', column: 'color' },
    { table: 'invoiceItems', column: 'color' },
    { table: 'workOrders', column: 'color' },
    { table: 'recipes', column: 'targetColor', fk: 'targetColorId' },
  ];
  let fkCount = 0;
  for (const target of fkTargets) {
    const fkColumn = target.fk || 'colorId';
    const pending = (await query(
      `SELECT DISTINCT \`${target.column}\` AS \`text\` FROM \`${target.table}\`
        WHERE \`${fkColumn}\` IS NULL AND \`${target.column}\` IS NOT NULL AND \`${target.column}\` <> ''`,
    )) as any[];
    for (const row of pending) {
      const colorId = idByFold.get(foldTurkish(String(row.text)));
      if (!colorId) continue;
      const header: any = await query(
        `UPDATE \`${target.table}\` SET \`${fkColumn}\` = ? WHERE \`${fkColumn}\` IS NULL AND \`${target.column}\` = ?`,
        [colorId, row.text],
      );
      fkCount += Number(header?.affectedRows ?? header?.[0]?.affectedRows ?? 0);
    }
  }

  // Renk kodu sayacı, betiğin ürettiği son koda hizalanır (API aynı kodu yeniden üretmesin).
  if (counter > 0) {
    await query(
      `INSERT INTO \`documentNumbers\` (\`scope\`, \`prefix\`, \`year\`, \`lastNumber\`, \`updatedAt\`)
       VALUES ('colors', 'R', 0, ?, NOW())
       ON DUPLICATE KEY UPDATE \`lastNumber\` = GREATEST(\`lastNumber\`, VALUES(\`lastNumber\`)), \`updatedAt\` = NOW()`,
      [counter],
    );
  }

  console.log(`\n${toCreate.length} renk kartı açıldı, ${linkCount} ürün↔renk bağı yazıldı, ${fkCount} satırda colorId dolduruldu.\n`);
}

main()
  .catch((err) => { console.error('Betiğin dışında hata:', err); process.exitCode = 1; })
  .finally(() => closePool());
