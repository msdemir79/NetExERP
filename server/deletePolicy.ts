/**
 * Silme politikası motoru.
 *
 * Eski model iki uç arasında sıkışmıştı: ya generic DELETE serbestti ya da
 * tablo tamamen kilitliydi (`noHardDelete`) ve kullanıcı "ters kayıt" ile
 * baş başa kalıyordu. Yerine kademe (tier) tabanlı tek bir kural seti geldi:
 *
 *   0 — Serbest:   bağlı kayıt yoksa silinir (guard'lar 409 üretir), tek onay.
 *   1 — Uyarılı:   silinecek çocuk kayıtların listesi gösterilir, onay istenir.
 *   2 — Şifreli:   kademe 1 + oturum sahibinin parolası + zorunlu gerekçe.
 *                  Bakiye/stok/muhasebe etkisi olan her kayıt bu kademededir.
 *   3 — Ters kayıt: silme kapalı; yalnızca kapanmış muhasebe dönemi fişleri.
 *
 * Silme HER ZAMAN fizikseldir ve türetilmiş alanlar (cari bakiye, ürün stoğu,
 * kasa/banka bakiyesi, fatura ödeme durumu, sipariş fatura/sevk toplamları)
 * aynı transaction içinde satır kilidi altında GERİ HESAPLANIR. Ters kayıt
 * (reversal) üretilmez; defter şişmez.
 *
 * İptal (cancel) silmeden farklıdır ve varlığını korur: iptal edilen belge
 * kaydı olarak kalır, muhasebede ters kayıtla düzeltilir. Silme ise belgeyi
 * ve tüm yan etkilerini ortadan kaldırır.
 *
 * Her silme denetim izine yazılır: kim, rol, IP, zaman, gerekçe ve silinen
 * kaydın tek satırlık tanıtıcısı (`recordSummary`). Satır içeriğinin kopyası
 * tutulmaz, dolayısıyla geri yükleme yoktur — tek kurtarma yolu `db:restore`.
 */
import type { PoolConnection } from 'mysql2/promise';
import { HttpError } from './errors.js';
import { AUDITED_RESOURCES, writeAudit, writeAuditInTx } from './audit.js';
import { verifyPassword, type AuthContext } from './auth.js';
import { versionSupported } from './schema.js';
import { getMeta } from './registry.js';

export type DeleteTier = 0 | 1 | 2 | 3;

/**
 * Motorun ihtiyaç duyduğu finansal yan etki yardımcıları. Stok matematiği ve
 * bakiye kilitleri businessOps içinde yaşadığı için enjeksiyonla alınır:
 * aynı hesabın iki ayrı kopyası olmaz.
 */
export interface DeleteEffects {
  adjustBalance(
    conn: PoolConnection,
    table: 'cashBoxes' | 'bankAccounts' | 'contacts',
    id: number,
    delta: number,
    withVersion: boolean,
  ): Promise<void>;
  lockContact(conn: PoolConnection, id: number): Promise<any>;
  lockCashBox(conn: PoolConnection, id: number): Promise<any>;
  lockBankAccount(conn: PoolConnection, id: number): Promise<any>;
  applyInvoiceBalance(
    conn: PoolConnection,
    invoice: { type: string; contactId: number | null; grandTotal: number },
    mode: 'apply' | 'reverse',
    withVersion: boolean,
  ): Promise<void>;
  applyInvoiceOrderLink(
    conn: PoolConnection,
    orderId: number,
    items: any[],
    grandTotal: number,
    direction: 1 | -1,
  ): Promise<void>;
  resetWaybillsForInvoice(conn: PoolConnection, invoiceId: number, waybillId: number | null): Promise<void>;
  revertWaybillOrderShipments(conn: PoolConnection, orderId: number, items: any[]): Promise<void>;
  applyWaybillStockReverse(
    conn: PoolConnection,
    items: any[],
    isSales: boolean,
    waybillNumber: string,
    withVersion: boolean,
    writeLog: boolean,
  ): Promise<number[]>;
  applyInvoiceStock(
    conn: PoolConnection,
    items: any[],
    isSales: boolean,
    invoiceNumber: string,
    documentDate: Date | null,
    reverse: boolean,
    withVersion: boolean,
    writeLog: boolean,
  ): Promise<number[]>;
}

export interface DeleteContext {
  auth?: AuthContext | null;
  ip?: string | null;
  /** Kademe 2'de zorunlu: kullanıcının girdiği silme gerekçesi. */
  reason?: string | null;
  /** Kademe 2'de zorunlu: oturum sahibinin parolası. Asla loglanmaz/saklanmaz. */
  password?: string | null;
}

export interface CascadeItem {
  label: string;
  count: number;
}

export interface BlockInfo {
  code: string;
  message: string;
}

/** İstemcinin onay modalını kurmak için ihtiyacı olan her şey. */
export interface DeletePlan {
  resource: string;
  id: string | number;
  label: string;
  tier: DeleteTier;
  summary: string;
  passwordRequired: boolean;
  reasonRequired: boolean;
  cascade: CascadeItem[];
  warnings: string[];
  blocked: BlockInfo | null;
}

/* ------------------------------------------------------------------ */
/* Yardımcılar                                                         */
/* ------------------------------------------------------------------ */

const money = (value: unknown): string =>
  `${(Number(value) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`;

/** LIKE deseninde kullanıcı/belge metnindeki % ve _ karakterlerini kaçırır. */
function likeEscape(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

async function countRows(conn: PoolConnection, sql: string, params: any[] = []): Promise<number> {
  const rows = await conn.query<any[]>(sql, params);
  const first = (rows[0] as any[])?.[0];
  return Number(first?.n ?? 0);
}

/** Fatura/sipariş tablolarında cari adı tutulmaz; tanıtıcı için ayrıca okunur. */
async function enrichContactName(conn: PoolConnection, row: any): Promise<Record<string, any>> {
  if (!row?.contactId) return {};
  const rows = await conn.query<any[]>('SELECT `name` FROM `contacts` WHERE `id` = ? LIMIT 1', [Number(row.contactId)]);
  return { contactName: (rows[0] as any[])[0]?.name ?? null };
}

/** Puantaj tablosunda personel adı tutulmaz. */
async function enrichEmployeeName(conn: PoolConnection, row: any): Promise<Record<string, any>> {
  if (!row?.employeeId) return {};
  const rows = await conn.query<any[]>('SELECT `name` FROM `employees` WHERE `id` = ? LIMIT 1', [Number(row.employeeId)]);
  return { employeeName: (rows[0] as any[])[0]?.name ?? null };
}

interface ChildDef {
  table: string;
  column: string;
  label: string;
}

interface PolicyDef {
  /** Kaynak türünün Türkçe adı (audit ve modal başlığı). */
  label: string;
  /** Sabit kademe veya satıra göre çözülen kademe. */
  tier: DeleteTier | ((row: any) => DeleteTier);
  /** Silinen kaydın tek satırlık tanıtıcısı. */
  summary: (row: any) => string;
  /** Tabloda durmayan ama tanıtıcıda gereken alanları (cari adı vb.) tamamlar. */
  enrich?: (conn: PoolConnection, row: any) => Promise<Record<string, any>>;
  /** Bildirimsel cascade: bu tabloların ilgili kolonuna göre silinir. */
  children?: ChildDef[];
  /** Satıra özel ek önizleme/uyarı/blokaj. */
  plan?: (conn: PoolConnection, row: any) => Promise<{ cascade?: CascadeItem[]; warnings?: string[]; blocked?: BlockInfo | null }>;
  /**
   * Türetilmiş alan geri yazımı ve satıra özel silmeler (DELETE'ten ÖNCE koşar).
   * Dönen sayılar stoğu değişen ürün id'leridir; SSE yayını için kullanılır.
   */
  exec?: (conn: PoolConnection, row: any, effects: DeleteEffects) => Promise<number[] | void>;
}

const DEFAULT_POLICY: PolicyDef = {
  label: 'Kayıt',
  tier: 0,
  summary: (row) => String(row?.id ?? ''),
};

/* ------------------------------------------------------------------ */
/* Politika tablosu                                                    */
/* ------------------------------------------------------------------ */

const POLICY: Record<string, PolicyDef> = {
  /* ---------------- Kademe 0: ana veri kartları ---------------- */
  contacts: {
    label: 'Cari',
    tier: 0,
    summary: (r) => `${r.code || `CAR-${String(r.id).padStart(4, '0')}`} — ${r.name}${r.balance ? ` (${money(r.balance)})` : ''}`,
    plan: async (_conn, row) => ({
      warnings: Number(row.balance) !== 0
        ? [`Cari bakiyesi ${money(row.balance)} — kayıtla birlikte silinecek.`]
        : [],
    }),
  },
  products: {
    label: 'Ürün',
    tier: 0,
    summary: (r) => `${r.code || '—'} — ${r.name}${r.stock ? ` (stok: ${r.stock} ${r.unit || ''})`.trimEnd() : ''}`,
    children: [{ table: 'productColors', column: 'productId', label: 'Ürün↔renk bağı' }],
    plan: async (_conn, row) => ({
      warnings: Number(row.stock) !== 0
        ? [`Ürün stoğu ${row.stock} ${row.unit || 'Adet'} — kayıtla birlikte silinecek.`]
        : [],
    }),
  },
  employees: {
    label: 'Personel',
    tier: 0,
    summary: (r) => `${r.employeeCode || '—'} — ${r.name}${r.department ? ` / ${r.department}` : ''}`,
  },
  colors: {
    label: 'Renk',
    tier: 0,
    summary: (r) => `${r.code || '—'} — ${r.name}`,
    plan: async (conn, row) => {
      // Renk kartı hiçbir yerde referans verilmiyorsa silinebilir; referanslıysa
      // pasifleştirme korunur (bağlar SET NULL ile sessizce kopmasın).
      const refs: { table: string; column: string; label: string }[] = [
        { table: 'productColors', column: 'colorId', label: 'ürün' },
        { table: 'inventoryLogs', column: 'colorId', label: 'stok hareketi' },
        { table: 'orderItems', column: 'colorId', label: 'sipariş kalemi' },
        { table: 'waybillItems', column: 'colorId', label: 'irsaliye kalemi' },
        { table: 'invoiceItems', column: 'colorId', label: 'fatura kalemi' },
        { table: 'workOrders', column: 'colorId', label: 'iş emri' },
        { table: 'recipes', column: 'targetColorId', label: 'reçete' },
      ];
      const used: string[] = [];
      for (const ref of refs) {
        const n = await countRows(conn, `SELECT COUNT(*) AS \`n\` FROM \`${ref.table}\` WHERE \`${ref.column}\` = ? LIMIT 1`, [row.id]);
        if (n > 0) used.push(`${ref.label} (${n})`);
      }
      return {
        blocked: used.length
          ? {
              code: 'COLOR_IN_USE',
              message: `Bu renk ${used.join(', ')} kaydında kullanılıyor. Silmek yerine pasifleştirin.`,
            }
          : null,
      };
    },
  },
  recipes: { label: 'Reçete', tier: 0, summary: (r) => `${r.name || '—'}${r.targetColor ? ` / ${r.targetColor}` : ''}` },
  workOrders: { label: 'İş Emri', tier: 0, summary: (r) => `${r.orderNumber || r.documentNo || `İE-${r.id}`}${r.customerName ? ` — ${r.customerName}` : ''}` },
  assortmentTemplates: { label: 'Asorti Şablonu', tier: 0, summary: (r) => String(r.name || r.id) },
  barcodeTemplates: { label: 'Barkod Şablonu', tier: 0, summary: (r) => String(r.name || r.id) },
  leaveRequests: { label: 'İzin Talebi', tier: 0, summary: (r) => `${r.employeeName || `personel #${r.employeeId}`} — ${r.leaveType || ''} (${r.startDate || ''} → ${r.endDate || ''})` },
  advanceRequests: { label: 'Avans Talebi', tier: 0, summary: (r) => `${r.employeeName || `personel #${r.employeeId}`} — ${money(r.amount)} (${r.month || ''}/${r.year || ''})` },
  attendanceRecords: {
    label: 'Puantaj',
    tier: 0,
    summary: (r) => `${r.employeeName || `personel #${r.employeeId}`} — ${r.date || `${r.month || ''}/${r.year || ''}`} (${r.status || ''})`,
    enrich: enrichEmployeeName,
  },
  periodLocks: { label: 'Dönem Kilidi', tier: 0, summary: (r) => `${r.year}/${String(r.month).padStart(2, '0')} (${r.scope === 'accounting' ? 'muhasebe' : 'İK'})` },
  orderItems: {
    label: 'Sipariş Kalemi',
    tier: 0,
    summary: (r) => `ürün #${r.productId}${r.color ? ` / ${r.color}` : ''}${r.size ? ` / ${r.size}` : ''} — ${Number(r.quantity) || 0} adet`,
  },
  invoiceItems: { label: 'Fatura Kalemi', tier: 0, summary: (r) => `${r.productName || r.productCode || `#${r.id}`}` },
  waybillItems: { label: 'İrsaliye Kalemi', tier: 0, summary: (r) => `${r.productName || r.productCode || `#${r.id}`}` },

  /* ---------------- Kademe 1: belge taslakları ---------------- */
  orders: {
    label: 'Sipariş',
    tier: 1,
    summary: (r) => `${r.orderNumber || `SİP-${r.id}`}${r.contactName ? ` — ${r.contactName}` : ''} (${money(r.grandTotal)})`,
    enrich: enrichContactName,
    children: [
      { table: 'orderItems', column: 'orderId', label: 'Sipariş kalemi' },
      { table: 'workOrders', column: 'orderId', label: 'İş emri' },
    ],
  },
  settings: {
    label: 'Ayar',
    tier: 1,
    summary: (r) => String(r.id),
    plan: async () => ({ warnings: ['Bu ayar silinirse ilgili ekran varsayılan değerlerle çalışır.'] }),
  },

  /* ---------------- Fatura / İrsaliye: duruma göre kademe ---------------- */
  invoices: {
    label: 'Fatura',
    tier: (r) => (r.status === 'draft' ? 1 : 2),
    summary: (r) => `${r.invoiceNumber} — ${r.contactName || `cari #${r.contactId}`} (${money(r.grandTotal)}, ${r.status === 'draft' ? 'taslak' : r.status === 'issued' ? 'kesilmiş' : 'iptal'})`,
    enrich: enrichContactName,
    children: [{ table: 'invoiceItems', column: 'invoiceId', label: 'Fatura kalemi' }],
    plan: async (conn, row) => {
      const cascade: CascadeItem[] = [];
      const je = await countRows(
        conn,
        "SELECT COUNT(*) AS `n` FROM `journalEntries` WHERE `documentId` = ? AND `documentType` IN ('invoice','invoice_reversal')",
        [row.id],
      );
      if (je > 0) cascade.push({ label: 'Muhasebe fişi', count: je });
      const tx = await countRows(conn, 'SELECT COUNT(*) AS `n` FROM `transactions` WHERE `documentNo` = ?', [row.invoiceNumber]);
      if (tx > 0) cascade.push({ label: 'Cari hareket', count: tx });
      const logs = row.isStockDeducted
        ? await countRows(conn, 'SELECT COUNT(*) AS `n` FROM `inventoryLogs` WHERE `description` LIKE ?', [`%${likeEscape(String(row.invoiceNumber))}%`])
        : 0;
      if (logs > 0) cascade.push({ label: 'Stok hareketi', count: logs });

      const warnings: string[] = [];
      if (row.status === 'issued') {
        warnings.push(`Cari bakiyesi ${money(row.grandTotal)} geri alınacak, stok iade edilecek.`);
      }
      if (row.status === 'cancelled') {
        warnings.push('Fatura daha önce iptal edildi: iptalin ters kaydı ve orijinal muhasebe fişi birlikte silinecek.');
      }
      const wb = await countRows(conn, 'SELECT COUNT(*) AS `n` FROM `waybills` WHERE `invoiceId` = ?', [row.id]);
      if (wb > 0) warnings.push(`${wb} irsaliyenin fatura bağı kaldırılacak (irsaliye silinmez).`);
      return { cascade, warnings };
    },
    exec: async (conn, row, effects) => {
      const invoiceId = Number(row.id);
      const items = ((await conn.query<any[]>('SELECT `productId`, `orderItemId`, `quantity`, `color`, `size`, `productName` FROM `invoiceItems` WHERE `invoiceId` = ?', [invoiceId]))[0] as any[]) || [];
      const withVersionContact = await versionSupported('contacts');
      const withVersionProduct = await versionSupported('products');
      let touched: number[] = [];

      // Kesilmiş faturada yan etkiler uygulanmıştı → geri al.
      // İptal edilmiş faturada yan etkiler cancel-invoice tarafından zaten
      // geri alındı → yalnızca izler temizlenir (çift geri alım bakiyeyi bozar).
      if (row.status === 'issued') {
        if (row.orderId) await effects.applyInvoiceOrderLink(conn, Number(row.orderId), items, Number(row.grandTotal) || 0, -1);
        await effects.applyInvoiceBalance(conn, { type: row.type, contactId: row.contactId ? Number(row.contactId) : null, grandTotal: Number(row.grandTotal) || 0 }, 'reverse', withVersionContact);
        if (Number(row.isStockDeducted)) {
          touched = await effects.applyInvoiceStock(conn, items, row.type === 'sales', String(row.invoiceNumber), row.date ? new Date(row.date) : null, true, withVersionProduct, false);
        }
      }
      await effects.resetWaybillsForInvoice(conn, invoiceId, row.waybillId ? Number(row.waybillId) : null);

      await conn.query("DELETE FROM `journalEntries` WHERE `documentId` = ? AND `documentType` IN ('invoice','invoice_reversal')", [invoiceId]);
      await conn.query('DELETE FROM `transactions` WHERE `documentNo` = ?', [row.invoiceNumber]);
      if (Number(row.isStockDeducted)) {
        await conn.query('DELETE FROM `inventoryLogs` WHERE `description` LIKE ?', [`%${likeEscape(String(row.invoiceNumber))}%`]);
      }
      return touched;
    },
  },
  waybills: {
    label: 'İrsaliye',
    tier: (r) => (r.status === 'draft' ? 1 : 2),
    summary: (r) => `${r.waybillNumber} — ${r.contactName || `cari #${r.contactId}`} (${r.status === 'draft' ? 'taslak' : r.status === 'issued' ? 'kesilmiş' : 'iptal'})`,
    children: [{ table: 'waybillItems', column: 'waybillId', label: 'İrsaliye kalemi' }],
    plan: async (conn, row) => {
      const cascade: CascadeItem[] = [];
      const logs = await countRows(conn, 'SELECT COUNT(*) AS `n` FROM `inventoryLogs` WHERE `description` LIKE ?', [`%${likeEscape(String(row.waybillNumber))}%`]);
      if (logs > 0) cascade.push({ label: 'Stok hareketi', count: logs });
      const warnings: string[] = [];
      if (row.status === 'issued') warnings.push('Stok iade edilecek ve sipariş sevk miktarları geri alınacak.');
      if (row.status === 'cancelled') warnings.push('İrsaliye daha önce iptal edildi: stok zaten iade edilmişti, yalnızca hareket izleri silinecek.');
      return {
        cascade,
        warnings,
        blocked: row.invoicedStatus === 'invoiced' || row.invoiceId != null
          ? {
              code: 'WAYBILL_INVOICED',
              message: `Bu irsaliye faturalandırılmış (${row.invoiceNumber || 'bağlı fatura'}). Önce faturayı silin.`,
            }
          : null,
      };
    },
    exec: async (conn, row, effects) => {
      const waybillId = Number(row.id);
      const items = ((await conn.query<any[]>('SELECT `productId`, `orderItemId`, `quantity`, `color`, `size`, `productName` FROM `waybillItems` WHERE `waybillId` = ?', [waybillId]))[0] as any[]) || [];
      const withVersionProduct = await versionSupported('products');
      let touched: number[] = [];
      if (row.status === 'issued') {
        if (row.orderId) await effects.revertWaybillOrderShipments(conn, Number(row.orderId), items);
        if (Number(row.isStockDeducted ?? 1) !== 0) {
          touched = await effects.applyWaybillStockReverse(conn, items, row.type === 'sales', String(row.waybillNumber), withVersionProduct, false);
        }
      }
      await conn.query('DELETE FROM `inventoryLogs` WHERE `description` LIKE ?', [`%${likeEscape(String(row.waybillNumber))}%`]);
      return touched;
    },
  },

  /* ---------------- Kademe 2: finansal kayıtlar ---------------- */
  transactions: {
    label: 'Cari Hareket',
    tier: 2,
    summary: (r) =>
      `${r.documentNo || `HRK-${r.id}`} — ${r.description || (r.type === 'income' ? 'Tahsilat' : 'Ödeme')} (${money(r.amount)}, ${r.type === 'income' ? 'gelir' : 'gider'})`,
    plan: async (_conn, row) => ({
      warnings: row.contactId
        ? [`Cari bakiyesi ${money(row.amount)} ${row.type === 'income' ? 'artacak' : 'azalacak'} (hareketin etkisi geri alınır).`]
        : [],
    }),
    exec: async (conn, row, effects) => {
      if (!row.contactId) return;
      const withVersion = await versionSupported('contacts');
      await effects.lockContact(conn, Number(row.contactId));
      const amount = Number(row.amount) || 0;
      // Oluşturmada: income → -amount, expense → +amount. Silmede tersi.
      const delta = row.type === 'income' ? amount : -amount;
      await effects.adjustBalance(conn, 'contacts', Number(row.contactId), delta, withVersion);
    },
  },
  collectionReceipts: {
    label: 'Tahsilat Makbuzu',
    tier: 2,
    summary: (r) => `${r.receiptNumber} — ${r.contactName || `cari #${r.contactId}`} (${money(r.amount)}, ${r.type === 'collection' ? 'tahsilat' : 'tediye'})`,
    plan: async (conn, row) => {
      const cascade: CascadeItem[] = [];
      if (row.journalEntryId) cascade.push({ label: 'Muhasebe fişi', count: 1 });
      const tx = await countRows(conn, 'SELECT COUNT(*) AS `n` FROM `transactions` WHERE `documentNo` = ?', [row.receiptNumber]);
      if (tx > 0) cascade.push({ label: 'Cari hareket', count: tx });
      if (row.checkId) cascade.push({ label: 'Çek/Senet (makbuzla oluşturulmuş)', count: 1 });
      return {
        cascade,
        warnings: [
          `Cari bakiyesi ${money(row.amount)} ${row.type === 'collection' ? 'artacak' : 'azalacak'}.`,
          row.cashBoxId || row.bankAccountId
            ? `${row.cashBoxId ? 'Kasa' : 'Banka'} bakiyesi ${money(row.amount)} geri alınacak.`
            : '',
          row.invoiceId ? 'Bağlı faturanın ödenen tutarı düşülecek.' : '',
        ].filter(Boolean),
      };
    },
    exec: async (conn, row, effects) => {
      const amount = Number(row.amount) || 0;
      const isCollection = row.type === 'collection';
      const withVersionContact = await versionSupported('contacts');
      const withVersionCash = await versionSupported('cashBoxes');
      const withVersionBank = await versionSupported('bankAccounts');

      if (row.contactId) {
        await effects.lockContact(conn, Number(row.contactId));
        await effects.adjustBalance(conn, 'contacts', Number(row.contactId), isCollection ? amount : -amount, withVersionContact);
      }
      if (row.cashBoxId) {
        await effects.lockCashBox(conn, Number(row.cashBoxId));
        await effects.adjustBalance(conn, 'cashBoxes', Number(row.cashBoxId), isCollection ? -amount : amount, withVersionCash);
      }
      if (row.bankAccountId) {
        await effects.lockBankAccount(conn, Number(row.bankAccountId));
        await effects.adjustBalance(conn, 'bankAccounts', Number(row.bankAccountId), isCollection ? -amount : amount, withVersionBank);
      }
      if (row.invoiceId) {
        const invRows = await conn.query<any[]>('SELECT `id`, `grandTotal`, `paidAmount` FROM `invoices` WHERE `id` = ? FOR UPDATE', [Number(row.invoiceId)]);
        const inv = (invRows[0] as any[])[0];
        if (inv) {
          const newPaid = Math.max(0, Number(((Number(inv.paidAmount) || 0) - amount).toFixed(2)));
          const grandTotal = Number(inv.grandTotal) || 0;
          const paymentStatus = newPaid >= grandTotal ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid';
          await conn.query('UPDATE `invoices` SET `paidAmount` = ?, `paymentStatus` = ?, `updatedAt` = NOW() WHERE `id` = ?', [newPaid, paymentStatus, Number(row.invoiceId)]);
        }
      }

      await conn.query('DELETE FROM `transactions` WHERE `documentNo` = ?', [row.receiptNumber]);
      if (row.journalEntryId) await conn.query('DELETE FROM `journalEntries` WHERE `id` = ?', [Number(row.journalEntryId)]);
      await conn.query("DELETE FROM `journalEntries` WHERE `documentId` = ? AND `documentType` IN ('collection','disbursement')", [Number(row.id)]);
      // Makbuzla birlikte oluşturulan çek/senet portföy kaydı da silinir.
      if (row.checkId) await conn.query('DELETE FROM `checks` WHERE `id` = ?', [Number(row.checkId)]);
    },
  },
  checks: {
    label: 'Çek/Senet',
    tier: 2,
    summary: (r) => `${r.portfolioNumber || `CEK-${r.id}`}${r.serialNumber ? ` / ${r.serialNumber}` : ''} — ${r.contactName || ''} (${money(r.amount)})`,
    plan: async (conn, row) => {
      const receipts = await countRows(conn, 'SELECT COUNT(*) AS `n` FROM `collectionReceipts` WHERE `checkId` = ? LIMIT 1', [row.id]);
      const journals = await countRows(conn, "SELECT COUNT(*) AS `n` FROM `journalEntries` WHERE `documentType` = 'check' AND `documentId` = ?", [row.id]);
      return {
        cascade: journals ? [{ label: 'Muhasebe fişi', count: journals }] : [],
        blocked: row.status !== 'portfolio'
          ? {
              code: 'CHECK_NOT_PORTFOLIO',
              message: `Çek durumu "${row.status}" olduğu için silinemez. Önce çek durumunu portföye geri alın.`,
            }
          : receipts > 0
            ? { code: 'CHECK_HAS_RECEIPT', message: 'Bu çek bir tahsilat/tediye makbuzuna bağlı. Önce makbuzu silin.' }
            : null,
      };
    },
    exec: async (conn, row) => {
      await conn.query("DELETE FROM `journalEntries` WHERE `documentType` = 'check' AND `documentId` = ?", [Number(row.id)]);
    },
  },
  cashBoxes: {
    label: 'Kasa',
    tier: 2,
    summary: (r) => `${r.code || '—'} — ${r.name}${r.balance ? ` (${money(r.balance)})` : ''}`,
    plan: async (conn, row) => {
      const receipts = await countRows(conn, 'SELECT COUNT(*) AS `n` FROM `collectionReceipts` WHERE `cashBoxId` = ? LIMIT 1', [row.id]);
      return {
        warnings: Number(row.balance) !== 0 ? [`Kasa bakiyesi ${money(row.balance)} — kayıtla birlikte silinecek.`] : [],
        blocked: receipts > 0
          ? { code: 'CASHBOX_HAS_RECEIPTS', message: `Bu kasaya bağlı ${receipts} makbuz var. Önce makbuzları silin.` }
          : null,
      };
    },
  },
  bankAccounts: {
    label: 'Banka Hesabı',
    tier: 2,
    summary: (r) => `${r.bankName}${r.iban ? ` (${r.iban})` : ''}${r.balance ? ` — ${money(r.balance)}` : ''}`,
    plan: async (conn, row) => {
      const receipts = await countRows(conn, 'SELECT COUNT(*) AS `n` FROM `collectionReceipts` WHERE `bankAccountId` = ? LIMIT 1', [row.id]);
      return {
        warnings: Number(row.balance) !== 0 ? [`Hesap bakiyesi ${money(row.balance)} — kayıtla birlikte silinecek.`] : [],
        blocked: receipts > 0
          ? { code: 'BANK_HAS_RECEIPTS', message: `Bu hesaba bağlı ${receipts} makbuz var. Önce makbuzları silin.` }
          : null,
      };
    },
  },
  accounts: {
    label: 'Muhasebe Hesabı',
    tier: 2,
    summary: (r) => `${r.code} — ${r.name}`,
    plan: async (conn, row) => {
      const code = String(row.code);
      const used = await countRows(conn, 'SELECT COUNT(*) AS `n` FROM `journalEntries` WHERE JSON_SEARCH(`lines`, \'one\', ?) IS NOT NULL LIMIT 1', [code]);
      // Alt hesap: hem doğrudan parentCode bağı hem TDHP kod hiyerarşisi (120.01 → 120) sayılır.
      const children = await countRows(
        conn,
        'SELECT COUNT(*) AS `n` FROM `accounts` WHERE `id` <> ? AND (`parentCode` = ? OR `code` LIKE ?) LIMIT 1',
        [Number(row.id), code, `${likeEscape(code)}.%`],
      );
      const linkedContacts = await countRows(conn, 'SELECT COUNT(*) AS `n` FROM `contacts` WHERE `accountCode` = ? LIMIT 1', [code]);
      const linkedCashBoxes = await countRows(conn, 'SELECT COUNT(*) AS `n` FROM `cashBoxes` WHERE `accountCode` = ? LIMIT 1', [code]);
      const linkedBanks = await countRows(conn, 'SELECT COUNT(*) AS `n` FROM `bankAccounts` WHERE `accountCode` = ? LIMIT 1', [code]);
      const linkedChecks = await countRows(conn, 'SELECT COUNT(*) AS `n` FROM `checks` WHERE `accountCode` = ? LIMIT 1', [code]);
      const linkedProducts = await countRows(
        conn,
        'SELECT COUNT(*) AS `n` FROM `products` WHERE `accountingCode` = ? OR `salesAccountCode` = ? OR `purchaseAccountCode` = ? LIMIT 1',
        [code, code, code],
      );

      const warnings: string[] = [];
      if (linkedContacts) warnings.push(`${linkedContacts} cari kartta bu hesap tanımlı; silinince hesap kodu alanı boşaltılır.`);
      if (linkedCashBoxes || linkedBanks) warnings.push(`${linkedCashBoxes + linkedBanks} kasa/banka kartında bu hesap tanımlı; hesap kodu alanı boşaltılır.`);
      if (linkedChecks) warnings.push(`${linkedChecks} çek kaydında bu hesap tanımlı; hesap kodu alanı boşaltılır.`);
      if (linkedProducts) warnings.push(`${linkedProducts} stok kartında bu hesap tanımlı; ilgili hesap kodu alanları boşaltılır.`);

      const blocked = row.isSystem && Number(row.level) <= 3
        ? { code: 'SYSTEM_ACCOUNT', message: `Bu hesap standart Tek Düzen Hesap Planı sistem hesabıdır (${code}). Muhasebe düzeninin bozulmaması için sistem hesapları silinemez.` }
        : used > 0
          ? { code: 'ACCOUNT_IN_USE', message: `Bu hesap ${used} yevmiye fişinde kullanılmış. Silinemez; pasifleştirin veya yeni hesap açın.` }
          : children > 0
            ? { code: 'ACCOUNT_HAS_CHILDREN', message: `Bu hesaba bağlı ${children} alt hesap var. Önce alt hesapları silin.` }
            : null;
      return { blocked, warnings };
    },
    exec: async (conn, row) => {
      const code = String(row.code);
      await conn.query('UPDATE `contacts` SET `accountCode` = NULL WHERE `accountCode` = ?', [code]);
      await conn.query('UPDATE `cashBoxes` SET `accountCode` = NULL WHERE `accountCode` = ?', [code]);
      await conn.query('UPDATE `bankAccounts` SET `accountCode` = NULL WHERE `accountCode` = ?', [code]);
      await conn.query('UPDATE `checks` SET `accountCode` = NULL WHERE `accountCode` = ?', [code]);
      await conn.query(
        'UPDATE `products` SET `accountingCode` = IF(`accountingCode` = ?, NULL, `accountingCode`), `salesAccountCode` = IF(`salesAccountCode` = ?, NULL, `salesAccountCode`), `purchaseAccountCode` = IF(`purchaseAccountCode` = ?, NULL, `purchaseAccountCode`) WHERE `accountingCode` = ? OR `salesAccountCode` = ? OR `purchaseAccountCode` = ?',
        [code, code, code, code, code, code],
      );
    },
  },
  payrollRecords: {
    label: 'Bordro',
    tier: 2,
    summary: (r) => `${r.employeeName || `personel #${r.employeeId}`} ${String(r.month || '').padStart(2, '0')}/${r.year || ''} (net ${money(r.netSalary)})`,
    plan: async (_conn, row) => ({
      cascade: row.journalEntryId ? [{ label: 'Muhasebe fişi', count: 1 }] : [],
      warnings: row.paymentStatus === 'paid'
        ? ['Bordro ödenmiş görünüyor; kasa/banka bakiyesi bu kayıtla birlikte GERİ ALINMAZ. Önce ödeme makbuzunu silin.']
        : [],
    }),
    exec: async (conn, row) => {
      if (row.journalEntryId) await conn.query('DELETE FROM `journalEntries` WHERE `id` = ?', [Number(row.journalEntryId)]);
    },
  },
  users: {
    label: 'Kullanıcı',
    tier: 2,
    summary: (r) => `${r.username}${r.fullName ? ` — ${r.fullName}` : ''}`,
    plan: async (conn, row) => {
      // Sistem kilitlenmesin: son Süper Admin silinemez.
      const admins = row.roleCode === 'super_admin'
        ? await countRows(conn, "SELECT COUNT(*) AS `n` FROM `users` WHERE `roleCode` = 'super_admin' AND `status` = 'active' LIMIT 1", [])
        : 0;
      return {
        blocked: admins > 0 && admins <= 1
          ? { code: 'LAST_SUPER_ADMIN', message: 'Sistemdeki son aktif Süper Admin hesabı silinemez.' }
          : null,
        warnings: ['Kullanıcının denetim kayıtları silinmez; yalnızca kullanıcı bağı kopar (kayıtlarda adı metin olarak kalır).'],
      };
    },
  },
  roles: {
    label: 'Rol',
    tier: 2,
    summary: (r) => `${r.code} — ${r.name}`,
    plan: async (conn, row) => {
      const users = await countRows(conn, 'SELECT COUNT(*) AS `n` FROM `users` WHERE `roleId` = ? OR `roleCode` = ? LIMIT 1', [row.id, String(row.code)]);
      const blocked = row.isSystem || row.code === 'super_admin'
        ? { code: 'SYSTEM_ROLE', message: 'Ön tanımlı sistem rolleri silinemez; gerekmiyorsa pasifleştirin.' }
        : users > 0
          ? { code: 'ROLE_HAS_USERS', message: `Bu role atanmış ${users} kullanıcı var. Önce kullanıcıların rolünü değiştirin.` }
          : null;
      return { blocked };
    },
  },
  journalEntries: {
    label: 'Muhasebe Fişi',
    tier: 2,
    summary: (r) => `${r.entryNumber} — ${r.description || r.documentType || 'yevmiye'} (${money(r.totalDebit)})`,
    plan: async (conn, row) => {
      // 1) Kaynak belgesi duran otomatik fiş tek başına silinemez.
      const auto = String(row.documentType || '');
      if (auto && auto !== 'manual') {
        const sourceTable = auto === 'invoice' || auto === 'invoice_reversal'
          ? 'invoices'
          : auto === 'collection' || auto === 'disbursement'
            ? 'collectionReceipts'
            : auto === 'check'
              ? 'checks'
              : null;
        const sourceAlive = sourceTable && row.documentId
          ? await countRows(conn, `SELECT COUNT(*) AS \`n\` FROM \`${sourceTable}\` WHERE \`id\` = ? LIMIT 1`, [Number(row.documentId)])
          : 0;
        if (sourceAlive) {
          return {
            blocked: {
              code: 'JOURNAL_HAS_SOURCE',
              message: `Bu fiş ${row.documentNumber ? `"${row.documentNumber}" ` : ''}belgesinden türetilmiş ve belge hâlâ duruyor. Önce belgeyi silin; fiş onunla birlikte silinir.`,
            },
          };
        }
        if (auto === 'journal_reversal') {
          const original = await countRows(conn, 'SELECT COUNT(*) AS `n` FROM `journalEntries` WHERE `id` = ? LIMIT 1', [Number(row.documentId)]);
          if (original) {
            return {
              blocked: {
                code: 'JOURNAL_REVERSAL_ALIVE',
                message: 'Bu fiş bir iptal ters kaydıdır ve asıl fiş hâlâ duruyor. Önce asıl fişi silin.',
              },
            };
          }
        }
      }

      // 2) Kapanmış muhasebe dönemi → kademe 3 (yalnızca ters kayıt).
      const locked = row.date
        ? await countRows(
            conn,
            "SELECT COUNT(*) AS `n` FROM `periodLocks` WHERE `scope` = 'accounting' AND `isLocked` = 1 AND `year` = YEAR(?) AND `month` = MONTH(?)",
            [row.date, row.date],
          )
        : 0;
      if (locked > 0) {
        return {
          blocked: {
            code: 'PERIOD_LOCKED',
            message: `Bu fişin dönemi (${new Date(row.date).toLocaleDateString('tr-TR')}) muhasebe tarafından kapatılmış. Kapalı dönem kaydı silinemez; düzeltme ters kayıtla yapılır.`,
          },
        };
      }
      return {};
    },
  },

  /* ---------------- Kademe 3: hareket defterleri ---------------- */
  inventoryLogs: {
    label: 'Stok Hareketi',
    tier: 3,
    summary: (r) => `${r.description || `#${r.id}`} (${r.quantity} ${r.type})`,
    plan: async () => ({
      blocked: {
        code: 'MOVEMENT_LEDGER',
        message: 'Stok hareketleri tek başına silinemez; ürün stoğu ile hareket defteri tutarlı kalmalı. Hareketi oluşturan belgeyi (fatura/irsaliye/üretim) silin — hareketleri onunla birlikte kaldırılır.',
      },
    }),
  },
};

/* ------------------------------------------------------------------ */
/* Motor                                                               */
/* ------------------------------------------------------------------ */

function policyFor(resource: string): PolicyDef {
  const audit = AUDITED_RESOURCES[resource];
  return POLICY[resource] || { ...DEFAULT_POLICY, label: audit?.label || resource };
}

function resolveTier(policy: PolicyDef, row: any): DeleteTier {
  return typeof policy.tier === 'function' ? policy.tier(row) : policy.tier;
}

/** META'daki guard'ları (bağlı kayıt kontrolü) transaction içinde denetler. */
export async function assertGuards(conn: PoolConnection, resource: string, id: number | string): Promise<void> {
  for (const guard of getMeta(resource).guards || []) {
    const n = await countRows(conn, `SELECT COUNT(*) AS \`n\` FROM \`${guard.table}\` WHERE \`${guard.column}\` = ? LIMIT 1`, [id]);
    if (n > 0) throw new HttpError(409, guard.message, 'HAS_DEPENDENTS');
  }
}

async function loadRow(conn: PoolConnection, table: string, primaryKey: string, id: any): Promise<any> {
  const rows = await conn.query<any[]>(`SELECT * FROM \`${table}\` WHERE \`${primaryKey}\` = ? LIMIT 1 FOR UPDATE`, [id]);
  const row = (rows[0] as any[])[0];
  if (!row) throw new HttpError(404, 'Kayıt bulunamadı.', 'NOT_FOUND');
  return row;
}

/**
 * Silme planını çıkarır: kademe, kayıt tanıtıcısı, birlikte silinecekler,
 * uyarılar ve varsa blokaj. İstemci onay modalını buna göre kurar.
 */
export async function planDelete(
  conn: PoolConnection,
  effects: DeleteEffects,
  resource: string,
  table: string,
  primaryKey: string,
  id: any,
): Promise<{ plan: DeletePlan; row: any }> {
  const policy = policyFor(resource);
  const row = await loadRow(conn, table, primaryKey, id);
  if (policy.enrich) Object.assign(row, await policy.enrich(conn, row));
  const extra = policy.plan ? await policy.plan(conn, row) : {};
  const tier = resolveTier(policy, row);

  const cascade: CascadeItem[] = [];
  for (const child of policy.children || []) {
    const n = await countRows(conn, `SELECT COUNT(*) AS \`n\` FROM \`${child.table}\` WHERE \`${child.column}\` = ?`, [id]);
    if (n > 0) cascade.push({ label: child.label, count: n });
  }
  for (const item of extra.cascade || []) cascade.push(item);

  return {
    row,
    plan: {
      resource,
      id,
      label: policy.label,
      tier,
      summary: policy.summary(row),
      passwordRequired: tier === 2,
      reasonRequired: tier === 2,
      cascade,
      warnings: extra.warnings || [],
      blocked: extra.blocked || (tier === 3 ? { code: 'DELETE_NOT_ALLOWED', message: 'Bu kayıt silinemez.' } : null),
    },
  };
}

/** Kademe 2 yetkilendirmesi: parola (oturum sahibi) + zorunlu gerekçe. */
async function authorizeTier2(conn: PoolConnection, ctx: DeleteContext, target: { resource: string; label: string; summary: string; id: any }): Promise<void> {
  const reason = String(ctx.reason || '').trim();
  if (reason.length < 3) {
    throw new HttpError(400, 'Bu kayıt için silme gerekçesi zorunludur (en az 3 karakter).', 'REASON_REQUIRED');
  }
  const userId = ctx.auth?.user?.id;
  if (!userId) throw new HttpError(401, 'Oturum bulunamadı.', 'UNAUTHORIZED');

  const password = ctx.password == null ? '' : String(ctx.password);
  if (!password) throw new HttpError(400, 'Bu işlem için parolanız gereklidir.', 'PASSWORD_REQUIRED');

  const userRows = await conn.query<any[]>('SELECT `passwordHash`, `passwordSalt` FROM `users` WHERE `id` = ? LIMIT 1', [userId]);
  const user = (userRows[0] as any[])[0];
  if (!user || !user.passwordHash || !user.passwordSalt) {
    throw new HttpError(403, 'Hesabınız için parola tanımlı değil; silme yetkisi doğrulanamıyor.', 'NO_PASSWORD_SET');
  }
  const { valid } = await verifyPassword(password, String(user.passwordSalt), String(user.passwordHash));
  if (!valid) {
    // Reddedilen deneme de iz bırakır; parola metni hiçbir yere yazılmaz.
    // Silme transaction'ı bu hatayla geri alınacağı için iz AYRI bir bağlantıyla
    // (writeAudit) yazılır — aksi halde reddin kaydı da rollback olurdu.
    await writeAudit(
      {
        action: 'delete_denied',
        module: AUDITED_RESOURCES[target.resource]?.module || getMeta(target.resource).module || 'system',
        description: `Silme yetkisi doğrulanamadı (hatalı parola): ${target.label} — ${target.summary}`,
        entityId: target.id,
        recordSummary: target.summary.slice(0, 500),
      },
      { auth: ctx.auth, ip: ctx.ip || undefined },
    );
    throw new HttpError(403, 'Parola doğrulanamadı.', 'PASSWORD_INVALID');
  }
}

export interface DeleteResult {
  resource: string;
  id: any;
  deleted: number;
  plan: DeletePlan;
  touchedProducts: number[];
}

/**
 * Kaydı politikaya göre fiziksel olarak siler: guard'lar, kademe 2 yetkisi,
 * türetilmiş alan geri yazımı, cascade ve denetim kaydı TEK transaction'da.
 * Çağıran taraf transaction'ı açar (api.ts / businessOps).
 */
export async function executeDelete(
  conn: PoolConnection,
  effects: DeleteEffects,
  resource: string,
  table: string,
  primaryKey: string,
  id: any,
  ctx: DeleteContext,
): Promise<DeleteResult> {
  const { plan, row } = await planDelete(conn, effects, resource, table, primaryKey, id);
  if (plan.blocked) throw new HttpError(409, plan.blocked.message, plan.blocked.code);
  if (plan.tier === 2) {
    await authorizeTier2(conn, ctx, { resource, label: plan.label, summary: plan.summary, id });
  }
  await assertGuards(conn, resource, id);

  const policy = policyFor(resource);
  const touched = policy.exec ? ((await policy.exec(conn, row, effects)) || []) : [];

  for (const child of policy.children || []) {
    await conn.query(`DELETE FROM \`${child.table}\` WHERE \`${child.column}\` = ?`, [id]);
  }
  const [result] = await conn.query(`DELETE FROM \`${table}\` WHERE \`${primaryKey}\` = ?`, [id]);
  const deleted = Number((result as any)?.affectedRows ?? 0);
  if (!deleted) throw new HttpError(404, 'Kayıt bulunamadı.', 'NOT_FOUND');

  const auditMeta = AUDITED_RESOURCES[resource];
  // Kullanıcı kendi hesabını sildiğinde denetim satırı artık var olmayan bir
  // userId'ye bağlanamaz (fk_auditLogs_user); ad/rol metni korunur, userId NULL kalır.
  const selfDelete = resource === 'users' && Number(ctx.auth?.user?.id) === Number(id);
  const auditAuth = selfDelete && ctx.auth?.user
    ? { ...ctx.auth, user: { ...ctx.auth.user, id: null as unknown as number } }
    : ctx.auth;
  await writeAuditInTx(
    conn,
    {
      action: 'delete',
      module: auditMeta?.module || getMeta(resource).module || 'system',
      description: `${policy.label} kaydı silindi: ${plan.summary}`,
      details: plan.cascade.length ? `Birlikte silinen: ${plan.cascade.map((c) => `${c.label} (${c.count})`).join(', ')}` : null,
      entityId: id,
      reason: plan.tier === 2 ? String(ctx.reason || '').trim() : null,
      recordSummary: plan.summary.slice(0, 500),
    },
    { auth: auditAuth, ip: ctx.ip || undefined },
  );

  return { resource, id, deleted, plan, touchedProducts: touched };
}
