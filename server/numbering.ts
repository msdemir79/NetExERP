import type { PoolConnection } from 'mysql2/promise';

/**
 * Belge/fiş numarası üretimi (item 8: concurrency hardening).
 *
 * Eski yaklaşım `COUNT(*)+1` ile kilitsizdi: eşzamanlı iki istek aynı
 * numarayı hesaplayıp UNIQUE çakışması (ER_DUP_ENTRY → 500) üretebiliyordu.
 * Burada her (scope, prefix, year) için `documentNumbers` tablosunda atomik
 * bir sayaç tutulur.
 *
 * KİLİT STRATEJİSİ (deadlock'tan kaçınmak için):
 *  1) HIZLI YOL: mevcut sayaç satırını tek bir `UPDATE ... lastNumber+1` ile
 *     artırır. Bu, satır üzerinde X kilidi alır ve çağıran transaction commit
 *     olana kadar tutar; eşzamanlı istekler bu satırda DÜZENLİ biçimde sıraya
 *     girer (deadlock yok, yalnızca bekleme). Her istek hedef tabloyu OKUMADAN
 *     numara alır, böylece gap/next-key kilit çakışması oluşmaz.
 *  2) YAVAŞ YOL (yalnızca ilk kullanım): sayaç satırı yoksa, hedef tablodaki
 *     mevcut maksimum numaradan (kilitsiz snapshot SELECT) tembel başlatılır.
 *     `INSERT IGNORE` ile eşzamanlı ilk çağrılardan sadece biri satırı oluşturur,
 *     ardından hızlı yol tekrar denenir. Bu yol scope/prefix/year başına yalnızca
 *     bir kez çalışır; kararlı durumda tüm istekler hızlı yoldan gider.
 *
 * Dönen biçim: `${prefix}-${year}-${padStart(lastNumber)}`.
 */

/** Tablo adı → benzersiz numara kolonu eşlemesi (yalnızca iç sabitler). */
const NUMBER_COLUMN: Record<string, string> = {
  journalEntries: 'entryNumber',
  collectionReceipts: 'receiptNumber',
  invoices: 'invoiceNumber',
  waybills: 'waybillNumber',
  orders: 'orderNumber',
};

/** Yevmiye fişi tipi → numara öneki. Bilinmeyen tipler 'YEV' (mahsup) alır. */
export const JOURNAL_NUMBER_PREFIX: Record<string, string> = { tahsil: 'THS', tediye: 'TDY', acilis: 'ACL', kapanis: 'KPN' };

export function journalPrefixFor(entryType: string | undefined | null): string {
  return JOURNAL_NUMBER_PREFIX[String(entryType || '')] || 'YEV';
}

export interface AllocateNumberOptions {
  /** Hedef tablo (scope olarak da kullanılır). */
  table: string;
  /** Numara öneki (ör. YEV, THS, SAT, IRS). */
  prefix: string;
  /** Sıfır dolgulu basamak sayısı. */
  pad: number;
  /** Belirtilmezse içinde bulunulan yıl. */
  year?: number;
  /** Benzersiz numara kolonu; verilmezse NUMBER_COLUMN'dan çözülür. */
  column?: string;
}

/** Sayaç satırını atomik artırır; satır yoksa (affectedRows=0) false döner. */
async function bumpCounter(conn: PoolConnection, scope: string, prefix: string, year: number): Promise<boolean> {
  const [r] = await conn.query(
    `UPDATE \`documentNumbers\` SET \`lastNumber\` = \`lastNumber\` + 1, \`updatedAt\` = NOW()
      WHERE \`scope\` = ? AND \`prefix\` = ? AND \`year\` = ?`,
    [scope, prefix, year],
  );
  return ((r as any)?.affectedRows ?? 0) === 1;
}

/**
 * Verilen transaction bağlantısı üzerinde bir sonraki belge numarasını ayırır.
 */
export async function allocateDocumentNumber(
  conn: PoolConnection,
  opts: AllocateNumberOptions,
): Promise<string> {
  const year = opts.year ?? new Date().getFullYear();
  const column = opts.column || NUMBER_COLUMN[opts.table];
  if (!column) throw new Error(`allocateDocumentNumber: '${opts.table}' için numara kolonu bilinmiyor.`);

  // 1) HIZLI YOL: sayaç satırı zaten varsa tek atomik UPDATE ile ayır.
  let bumped = await bumpCounter(conn, opts.table, opts.prefix, year);

  // 2) YAVAŞ YOL (ilk kullanım): satırı mevcut maksimumdan tembel başlat.
  if (!bumped) {
    const like = `${opts.prefix}-${year}-%`;
    // Kilitsiz snapshot read: hedef tablodaki en büyük sıra numarasını bul.
    const seedRows = await conn.query<any[]>(
      `SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(\`${column}\`, '-', -1) AS UNSIGNED)), 0) AS seed
         FROM \`${opts.table}\` WHERE \`${column}\` LIKE ?`,
      [like],
    );
    const seed = Number((seedRows[0] as any[])[0]?.seed || 0);
    // Eşzamanlı ilk çağrılardan yalnızca biri satırı oluşturur; diğerleri yoksayar.
    await conn.query(
      `INSERT IGNORE INTO \`documentNumbers\` (\`scope\`, \`prefix\`, \`year\`, \`lastNumber\`)
       VALUES (?, ?, ?, ?)`,
      [opts.table, opts.prefix, year, seed],
    );
    bumped = await bumpCounter(conn, opts.table, opts.prefix, year);
    if (!bumped) {
      throw new Error(`allocateDocumentNumber: '${opts.table}/${opts.prefix}/${year}' sayacı başlatılamadı.`);
    }
  }

  const rows = await conn.query<any[]>(
    `SELECT \`lastNumber\` FROM \`documentNumbers\` WHERE \`scope\` = ? AND \`prefix\` = ? AND \`year\` = ?`,
    [opts.table, opts.prefix, year],
  );
  const n = Number((rows[0] as any[])[0]?.lastNumber || 0);
  return `${opts.prefix}-${year}-${String(n).padStart(opts.pad, '0')}`;
}
