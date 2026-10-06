/**
 * Test verisi temizleyici — YALNIZCA bakım aracı (API'den erişilemez).
 *
 * Uygulama içi silme kuralları bilinçli olarak sıkıdır: stok hareketi tek
 * başına silinemez (kademe 3), finansal kayıt parola ister (kademe 2), bağlı
 * kaydı olan ana kart guard ile korunur (409). Testler canlı veritabanına
 * karşı koştuğu için bu kuralların arkasında kaçınılmaz olarak işaretli test
 * kalıntısı birikir ve ekranlardan temizlenemez.
 *
 * Bu modül o kalıntıyı kaldırır: yalnızca `TEST-` işareti (veya test kod
 * önekleri) taşıyan satırları, yabancı anahtar sırasına uygun biçimde TEK
 * transaction içinde siler ve silmenin yan etkilerini (cari bakiyesi, ürün
 * stoğu, fatura ödenen tutarı, sipariş fatura toplamı, kasa/banka bakiyesi)
 * satır kilidi altında GERİ HESAPLAR. İşaretsiz gerçek veriye dokunmaz; bir
 * satır başka bir gerçek kayıt tarafından referanslanıyorsa silmek yerine
 * atlanır ve uyarı olarak raporlanır.
 *
 * Denetim izi (auditLogs) silinmez — purge'ün kendisi de oraya yazılır.
 */
import type { PoolConnection } from 'mysql2/promise';
import { writeAuditInTx } from './audit.js';
import { versionSupported } from './schema.js';

/** Test satırını gerçek veriden ayıran metin işareti. */
const TEXT_MARK = '(^|[^A-Za-z0-9])TEST-';

/** Test suite'lerinin ürettiği kart kodu önekleri (renk kodları BİLİNÇLİ olarak yok: `R-####` sayacı gerçek renklerle ortak). */
const CODE_PREFIXES = ['TD-', 'TF3', 'TF4', 'TRP', 'RBAC-'];

function textMarked(columns: string[]): string {
  return columns.map((c) => `\`${c}\` REGEXP '${TEXT_MARK}'`).join(' OR ');
}

function codeMarked(column = 'code'): string {
  return CODE_PREFIXES.map((p) => `\`${column}\` LIKE '${p}%'`).join(' OR ');
}

/** Silinmesi başka bir gerçek kayda bağlı olan tablolar için RESTRICT koruması. */
interface Blocker {
  table: string;
  column: string;
  label: string;
}

interface PurgeStep {
  table: string;
  label: string;
  /** İşaret koşulu (sabit SQL, kullanıcı girdisi içermez). */
  where: string;
  /** `scope` verilmişse içinde aranacak kolonlar (koşu damgası vb.). */
  scopeColumns: string[];
  /** Kuru koşuda listelenecek tek satırlık tanıtıcı. */
  sample: string;
  /** Bu tabloda referanslayan gerçek kayıt varsa satır atlanır. */
  blockers?: Blocker[];
}

const PRODUCT_MARK = `((${textMarked(['name', 'notes'])}) OR (${codeMarked('code')}))`;

/**
 * Yabancı anahtar bağımlılık sırası: hareket/belge önce, ana kart sonra.
 * Çocuk satırlar (invoiceItems, waybillItems, orderItems, productColors,
 * recipes, inventoryLogs, puantaj/izin/avans/bordro) ON DELETE CASCADE ile
 * kendiliğinden gider.
 */
function steps(): PurgeStep[] {
  return [
    {
      table: 'inventoryLogs',
      label: 'Stok hareketi',
      where: `((${textMarked(['description'])}) OR \`productId\` IN (SELECT \`id\` FROM \`products\` WHERE ${PRODUCT_MARK}))`,
      scopeColumns: ['description'],
      sample: 'CONCAT(COALESCE(`description`, \'\'), \' (\', `type`, \' \', `quantity`, \')\')',
    },
    {
      table: 'journalEntries',
      label: 'Muhasebe fişi',
      where: textMarked(['description', 'documentNumber']),
      scopeColumns: ['description', 'documentNumber'],
      sample: 'CONCAT(`entryNumber`, \' — \', COALESCE(`description`, \'\'))',
    },
    {
      table: 'transactions',
      label: 'Cari hareket',
      where: textMarked(['description', 'category', 'documentNo']),
      scopeColumns: ['description', 'documentNo'],
      sample: 'CONCAT(COALESCE(`documentNo`, CONCAT(\'HRK-\', `id`)), \' — \', COALESCE(`description`, \'\'), \' (\', `amount`, \')\')',
    },
    {
      table: 'collectionReceipts',
      label: 'Tahsilat makbuzu',
      where: textMarked(['description', 'receiptNumber', 'contactName', 'invoiceNumber']),
      scopeColumns: ['description', 'receiptNumber'],
      sample: 'CONCAT(`receiptNumber`, \' — \', COALESCE(`contactName`, \'\'), \' (\', `amount`, \')\')',
    },
    {
      table: 'checks',
      label: 'Çek/Senet',
      where: textMarked(['notes', 'statusNotes', 'portfolioNumber', 'contactName', 'drawer']),
      scopeColumns: ['notes', 'portfolioNumber'],
      sample: 'CONCAT(`portfolioNumber`, \' — \', COALESCE(`contactName`, \'\'), \' (\', `amount`, \')\')',
    },
    {
      table: 'invoices',
      label: 'Fatura',
      where: textMarked(['invoiceNumber', 'notes', 'orderNumber', 'waybillNumber']),
      scopeColumns: ['invoiceNumber', 'notes'],
      sample: 'CONCAT(`invoiceNumber`, \' — \', COALESCE(`notes`, \'\'), \' (\', `grandTotal`, \')\')',
    },
    {
      table: 'waybills',
      label: 'İrsaliye',
      where: textMarked(['waybillNumber', 'notes', 'orderNumber', 'invoiceNumber']),
      scopeColumns: ['waybillNumber', 'notes'],
      sample: 'CONCAT(`waybillNumber`, \' — \', COALESCE(`notes`, \'\'))',
    },
    {
      table: 'orders',
      label: 'Sipariş',
      where: textMarked(['orderNumber', 'notes']),
      scopeColumns: ['orderNumber', 'notes'],
      sample: 'CONCAT(`orderNumber`, \' (\', `grandTotal`, \')\')',
    },
    {
      table: 'workOrders',
      label: 'İş emri',
      where: textMarked(['orderNumber', 'documentNo', 'customerName', 'notes']),
      scopeColumns: ['orderNumber', 'customerName', 'notes'],
      sample: 'CONCAT(COALESCE(`orderNumber`, COALESCE(`documentNo`, CONCAT(\'İE-\', `id`))), \' — \', COALESCE(`customerName`, \'\'))',
    },
    {
      table: 'employees',
      label: 'Personel',
      where: textMarked(['name', 'notes']),
      scopeColumns: ['name', 'notes'],
      sample: 'CONCAT(`employeeCode`, \' — \', `name`)',
    },
    {
      table: 'products',
      label: 'Ürün',
      where: PRODUCT_MARK,
      scopeColumns: ['name', 'code'],
      sample: 'CONCAT(`code`, \' — \', `name`, \' (stok: \', `stock`, \')\')',
      blockers: [
        { table: 'orderItems', column: 'productId', label: 'sipariş kalemi' },
        { table: 'workOrders', column: 'productId', label: 'iş emri' },
      ],
    },
    {
      table: 'contacts',
      label: 'Cari',
      where: `((${textMarked(['name', 'notes'])}) OR (${codeMarked('code')}))`,
      scopeColumns: ['name', 'code'],
      sample: 'CONCAT(COALESCE(`code`, CONCAT(\'CAR-\', `id`)), \' — \', `name`, \' (\', `balance`, \')\')',
      blockers: [
        { table: 'invoices', column: 'contactId', label: 'fatura' },
        { table: 'orders', column: 'contactId', label: 'sipariş' },
        { table: 'waybills', column: 'contactId', label: 'irsaliye' },
      ],
    },
    {
      table: 'periodLocks',
      label: 'Dönem kilidi',
      where: textMarked(['lockedBy', 'notes']),
      scopeColumns: ['lockedBy', 'notes'],
      sample: 'CONCAT(`year`, \'/\', LPAD(`month`, 2, \'0\'), \' — \', COALESCE(`lockedBy`, \'\'))',
    },
    {
      table: 'users',
      label: 'Kullanıcı',
      where: `((${textMarked(['fullName', 'department', 'title', 'notes'])}) OR \`email\` LIKE '%@test.local')`,
      scopeColumns: ['fullName', 'username'],
      sample: 'CONCAT(`username`, \' — \', COALESCE(`fullName`, \'\'))',
    },
    {
      table: 'colors',
      label: 'Renk',
      where: textMarked(['name', 'groupName', 'description']),
      scopeColumns: ['name', 'groupName'],
      sample: 'CONCAT(`code`, \' — \', `name`)',
      blockers: [{ table: 'productColors', column: 'colorId', label: 'ürün bağı' }],
    },
  ];
}

interface ResolvedStep {
  step: PurgeStep;
  sql: string;
  params: any[];
}

function resolve(step: PurgeStep, scope: string | null): ResolvedStep {
  if (!scope) return { step, sql: step.where, params: [] };
  const ors = step.scopeColumns.map((c) => `\`${c}\` LIKE ?`).join(' OR ');
  return {
    step,
    sql: `(${step.where}) AND (${ors})`,
    params: step.scopeColumns.map(() => `%${scope}%`),
  };
}

/** Blocker'ları `NOT EXISTS` korumasına çevirir (gerçek kayıt referanslıyorsa satır atlanır). */
function withBlockers(table: string, sql: string, blockers?: Blocker[]): string {
  if (!blockers?.length) return sql;
  const guards = blockers.map(
    (b) => `NOT EXISTS (SELECT 1 FROM \`${b.table}\` \`_b\` WHERE \`_b\`.\`${b.column}\` = \`${table}\`.\`id\`)`,
  );
  return `(${sql}) AND ${guards.join(' AND ')}`;
}

async function countRows(conn: PoolConnection, sql: string, params: any[] = []): Promise<number> {
  const rows = await conn.query<any[]>(sql, params);
  return Number((rows[0] as any[])?.[0]?.n ?? 0);
}

async function selectRows(conn: PoolConnection, sql: string, params: any[] = []): Promise<any[]> {
  const rows = await conn.query<any[]>(sql, params);
  return (rows[0] as any[]) || [];
}

function add(map: Map<number, number>, key: unknown, delta: number): void {
  const id = Number(key);
  if (!Number.isFinite(id) || id <= 0 || !delta) return;
  map.set(id, Number(((map.get(id) || 0) + delta).toFixed(4)));
}

export interface PurgeOptions {
  /** false ise hiçbir şey silinmez, yalnızca sayım/örnek döner (varsayılan). */
  apply?: boolean;
  /** Ek daraltma: işaretli satırda bu belirteç de geçmeli (ör. koşu damgası). */
  scope?: string | null;
  /** Denetim izine yazılacak gerekçe. */
  reason?: string;
  /** Kuru koşuda tablo başına listelenecek örnek satır sayısı. */
  sampleLimit?: number;
}

export interface PurgeTableResult {
  table: string;
  label: string;
  count: number;
  /** Blocker nedeniyle atlanan satır sayısı (yalnızca uygularken bilinir). */
  skipped: number;
  samples: string[];
}

export interface PurgeReport {
  apply: boolean;
  scope: string | null;
  tables: PurgeTableResult[];
  total: number;
  skippedTotal: number;
  recalculated: {
    contacts: number;
    products: number;
    invoices: number;
    orders: number;
    cashBoxes: number;
    bankAccounts: number;
  };
  warnings: string[];
}

/**
 * İşaretli test verisini bağımlılık sırasında siler ve türetilmiş alanları
 * geri hesaplar. Çağıran taraf transaction'ı açar (CLI veya test suite'i);
 * böylece hata olursa her şey birlikte geri alınır.
 */
export async function purgeTestData(conn: PoolConnection, options: PurgeOptions = {}): Promise<PurgeReport> {
  const apply = options.apply === true;
  const scope = String(options.scope ?? '').trim() || null;
  const sampleLimit = Math.max(0, Number(options.sampleLimit ?? 5));
  const resolved = steps().map((s) => resolve(s, scope));
  const warnings: string[] = [];

  /* ---------------- 1) Yan etkileri topla (silmeden ÖNCE) ---------------- */
  const contactDelta = new Map<number, number>();
  const productDelta = new Map<number, number>();
  const invoicePaid = new Map<number, number>();
  const orderTotal = new Map<number, number>();
  const cashDelta = new Map<number, number>();
  const bankDelta = new Map<number, number>();

  const stepOf = (table: string): ResolvedStep => {
    const found = resolved.find((r) => r.step.table === table);
    if (!found) throw new Error(`Purge adımı bulunamadı: ${table}`);
    return found;
  };

  const txStep = stepOf('transactions');
  for (const r of await selectRows(
    conn,
    `SELECT \`contactId\`, \`type\`, \`amount\` FROM \`transactions\` WHERE ${txStep.sql}`,
    txStep.params,
  )) {
    if (!r.contactId) continue;
    const amount = Number(r.amount) || 0;
    // Oluşturmada income bakiyeyi düşürür, expense yükseltir; silmede tersi.
    add(contactDelta, r.contactId, r.type === 'income' ? amount : -amount);
  }

  const invStep = stepOf('invoices');
  const invoices = await selectRows(
    conn,
    `SELECT \`id\`, \`contactId\`, \`orderId\`, \`type\`, \`grandTotal\`, \`status\` FROM \`invoices\` WHERE ${invStep.sql}`,
    invStep.params,
  );
  for (const r of invoices) {
    const total = Number(r.grandTotal) || 0;
    // Yan etkisi uygulanmış tek durum 'issued': taslak bakiyeye dokunmamıştı,
    // iptal edilmiş faturanın etkisi cancel-invoice tarafından zaten geri alınmıştı.
    if (r.status !== 'issued') continue;
    if (r.contactId) add(contactDelta, r.contactId, r.type === 'sales' ? -total : total);
    if (r.orderId) add(orderTotal, r.orderId, -total);
  }

  const recStep = stepOf('collectionReceipts');
  for (const r of await selectRows(
    conn,
    `SELECT \`contactId\`, \`invoiceId\`, \`cashBoxId\`, \`bankAccountId\`, \`type\`, \`amount\` FROM \`collectionReceipts\` WHERE ${recStep.sql}`,
    recStep.params,
  )) {
    const amount = Number(r.amount) || 0;
    const isCollection = r.type === 'collection';
    if (r.contactId) add(contactDelta, r.contactId, isCollection ? amount : -amount);
    if (r.cashBoxId) add(cashDelta, r.cashBoxId, isCollection ? -amount : amount);
    if (r.bankAccountId) add(bankDelta, r.bankAccountId, isCollection ? -amount : amount);
    if (r.invoiceId) add(invoicePaid, r.invoiceId, -amount);
  }

  const logStep = stepOf('inventoryLogs');
  const logs = await selectRows(
    conn,
    `SELECT \`productId\`, \`type\`, \`quantity\` FROM \`inventoryLogs\` WHERE ${logStep.sql}`,
    logStep.params,
  );
  for (const r of logs) {
    const qty = Number(r.quantity) || 0;
    const signed = r.type === 'in' || r.type === 'production_in' ? qty : -qty;
    add(productDelta, r.productId, -signed);
  }

  /* ---------------- 2) Say / sil ---------------- */
  const tables: PurgeTableResult[] = [];
  for (const { step, sql, params } of resolved) {
    const markedSql = withBlockers(step.table, sql);
    if (!apply) {
      const count = await countRows(conn, `SELECT COUNT(*) AS \`n\` FROM \`${step.table}\` WHERE ${markedSql}`, params);
      const samples = sampleLimit
        ? (await selectRows(
            conn,
            `SELECT ${step.sample} AS \`s\` FROM \`${step.table}\` WHERE ${markedSql} ORDER BY \`id\` LIMIT ${sampleLimit}`,
            params,
          )).map((r) => String(r.s))
        : [];
      if (count) tables.push({ table: step.table, label: step.label, count, skipped: 0, samples });
      continue;
    }

    const marked = await countRows(conn, `SELECT COUNT(*) AS \`n\` FROM \`${step.table}\` WHERE ${sql}`, params);
    const [result] = await conn.query(`DELETE FROM \`${step.table}\` WHERE ${markedSql}`, params);
    const count = Number((result as any)?.affectedRows ?? 0);
    const skipped = Math.max(0, marked - count);
    if (skipped > 0) {
      const reasons = (step.blockers || []).map((b) => b.label).join(', ');
      warnings.push(`${step.label}: ${skipped} satır atlandı — gerçek bir kayıt tarafından referanslanıyor (${reasons}).`);
    }
    if (count || skipped) tables.push({ table: step.table, label: step.label, count, skipped, samples: [] });
  }

  const report: PurgeReport = {
    apply,
    scope,
    tables,
    total: tables.reduce((s, t) => s + t.count, 0),
    skippedTotal: tables.reduce((s, t) => s + t.skipped, 0),
    recalculated: { contacts: 0, products: 0, invoices: 0, orders: 0, cashBoxes: 0, bankAccounts: 0 },
    warnings,
  };
  if (!apply) return report;

  /* ---------------- 3) Türetilmiş alanları geri yaz (yalnızca yaşayan satırlar) ---------------- */
  const bumpContacts = await versionSupported('contacts');
  for (const [id, delta] of contactDelta) {
    const [r] = await conn.query(
      `UPDATE \`contacts\` SET \`balance\` = \`balance\` + ?, ${bumpContacts ? '`version` = `version` + 1,' : ''} \`updatedAt\` = NOW() WHERE \`id\` = ?`,
      [delta, id],
    );
    report.recalculated.contacts += Number((r as any)?.affectedRows ?? 0);
  }

  const bumpProducts = await versionSupported('products');
  const variantProducts: number[] = [];
  for (const [id, delta] of productDelta) {
    const [r] = await conn.query(
      `UPDATE \`products\` SET \`stock\` = GREATEST(0, \`stock\` + ?), ${bumpProducts ? '`version` = `version` + 1,' : ''} \`updatedAt\` = NOW() WHERE \`id\` = ?`,
      [delta, id],
    );
    const touched = Number((r as any)?.affectedRows ?? 0);
    report.recalculated.products += touched;
    if (touched) {
      const rows = await selectRows(conn, 'SELECT `variantBarcodes` FROM `products` WHERE `id` = ? LIMIT 1', [id]);
      const raw = rows[0]?.variantBarcodes;
      const hasVariants = Array.isArray(raw) ? raw.length > 0 : Boolean(raw && String(raw) !== '[]');
      if (hasVariants) variantProducts.push(id);
    }
  }
  if (variantProducts.length) {
    warnings.push(
      `Renk×beden varyant stoğu olan ${variantProducts.length} ürünün toplam stoğu geri alındı ama varyant kırılımı (variantBarcodes) el değmedi: ${variantProducts.join(', ')}. Stok kartından kontrol edin.`,
    );
  }

  for (const [id, delta] of invoicePaid) {
    const rows = await selectRows(conn, 'SELECT `id`, `grandTotal`, `paidAmount` FROM `invoices` WHERE `id` = ? LIMIT 1 FOR UPDATE', [id]);
    const inv = rows[0];
    if (!inv) continue;
    const paid = Math.max(0, Number(((Number(inv.paidAmount) || 0) + delta).toFixed(2)));
    const grandTotal = Number(inv.grandTotal) || 0;
    const paymentStatus = paid >= grandTotal ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
    const [r] = await conn.query('UPDATE `invoices` SET `paidAmount` = ?, `paymentStatus` = ?, `updatedAt` = NOW() WHERE `id` = ?', [
      paid,
      paymentStatus,
      id,
    ]);
    report.recalculated.invoices += Number((r as any)?.affectedRows ?? 0);
  }

  for (const orderId of orderTotal.keys()) {
    const rows = await selectRows(
      conn,
      `SELECT COALESCE(SUM(\`grandTotal\`), 0) AS \`total\` FROM \`invoices\` WHERE \`orderId\` = ? AND \`status\` = 'issued'`,
      [orderId],
    );
    const total = Math.max(0, Number(rows[0]?.total) || 0);
    const statusRows = await selectRows(
      conn,
      'SELECT COALESCE(SUM(`quantity`), 0) AS `ordered`, COALESCE(SUM(`invoicedQuantity`), 0) AS `invoiced` FROM `orderItems` WHERE `orderId` = ?',
      [orderId],
    );
    const ordered = Number(statusRows[0]?.ordered) || 0;
    const invoiced = Number(statusRows[0]?.invoiced) || 0;
    const invoicingStatus = ordered > 0 && invoiced >= ordered ? 'fully_invoiced' : invoiced > 0 ? 'partially_invoiced' : 'not_invoiced';
    const [r] = await conn.query('UPDATE `orders` SET `invoicedTotal` = ?, `invoicingStatus` = ?, `updatedAt` = NOW() WHERE `id` = ?', [
      total,
      invoicingStatus,
      orderId,
    ]);
    const touched = Number((r as any)?.affectedRows ?? 0);
    report.recalculated.orders += touched;
    if (touched) {
      warnings.push(
        `Sipariş #${orderId}: fatura toplamı yeniden hesaplandı ama kalem bazındaki \`invoicedQuantity\` değerlerine dokunulmadı; sipariş ekranından kontrol edin.`,
      );
    }
  }

  const bumpCash = await versionSupported('cashBoxes');
  for (const [id, delta] of cashDelta) {
    const [r] = await conn.query(
      `UPDATE \`cashBoxes\` SET \`balance\` = \`balance\` + ?${bumpCash ? ', `version` = `version` + 1' : ''} WHERE \`id\` = ?`,
      [delta, id],
    );
    report.recalculated.cashBoxes += Number((r as any)?.affectedRows ?? 0);
  }

  const bumpBank = await versionSupported('bankAccounts');
  for (const [id, delta] of bankDelta) {
    const [r] = await conn.query(
      `UPDATE \`bankAccounts\` SET \`balance\` = \`balance\` + ?${bumpBank ? ', `version` = `version` + 1' : ''} WHERE \`id\` = ?`,
      [delta, id],
    );
    report.recalculated.bankAccounts += Number((r as any)?.affectedRows ?? 0);
  }

  /* ---------------- 4) Denetim izi ---------------- */
  const summary = tables
    .filter((t) => t.count > 0)
    .map((t) => `${t.label}: ${t.count}`)
    .join(', ');
  await writeAuditInTx(conn, {
    action: 'delete',
    module: 'system',
    description: `Test verisi temizliği (${report.total} satır)${scope ? ` — kapsam: ${scope}` : ''}`,
    details: `${summary || 'silinen satır yok'}${report.skippedTotal ? ` | atlanan: ${report.skippedTotal}` : ''}`,
    reason: options.reason || 'Test kalıntısı temizliği (db:purge-test)',
    recordSummary: summary.slice(0, 500) || null,
  });

  return report;
}
