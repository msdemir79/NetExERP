import { RESOURCES, type ResourceDef } from './columns.js';
import type { AppModule } from '../src/types.js';

export interface ResourceMeta {
  /** Kaynağın bağlı olduğu yetki modülü (RBAC). Sunucu tarafı izin denetiminde kullanılır. */
  module: AppModule;
  /** ?search= parametresinin aradığı kolonlar */
  searchable: string[];
  /** Varsayılan sıralama (ORDER BY) */
  defaultOrder: string;
  /** Silme öncesi bağlı kayıt kontrolü: { tablo, kolon, mesaj } */
  guards?: { table: string; column: string; message: string }[];
  /** Sadece okunabilir (istemci yazamaz) */
  readOnly?: boolean;
  /** Okuma için modül izni gerekmez; oturum açmış olmak yeterlidir. */
  readAuthOnly?: boolean;
  /** İstemci hiçbir zaman yazamaz (yalnızca sunucu tarafı işlemler yazar). */
  protectedColumns?: string[];
  /**
   * Türetilmiş/bakiye kolonları: generic CRUD ve /ops/commit UPDATE yollarında
   * istemci gövdesinden SOYULUR (INSERT'te açılış değeri olarak yazılabilir).
   * Bu alanlar yalnızca kontrollü iş uçlarında (ops) satır kilidi altında,
   * karşılık gelen hareket + muhasebe kaydıyla birlikte güncellenir.
   */
  derivedColumns?: string[];
  /**
   * Hareket defteri tabloları (ör. inventoryLogs): generic satır yazımı
   * (insert/update/delete/bulk/delete-where) HERKESE kapalıdır; yalnızca
   * sunucu tarafı ops yazar. `clear` mevcut Süper Admin kapısıyla kalır.
   */
  movementTable?: boolean;
  /**
   * Transactional kayıtlar (fatura, cari hareket, yevmiye fişi, tahsilat/tediye
   * makbuzu): generic hard-delete (DELETE, bulk-delete, delete-where, commit
   * delete/deleteWhere) HERKESE kapalıdır. Silme/iptal yalnızca kontrollü op'lar
   * (cancel-invoice, reverse-journal, contact-transaction delete vb.) üzerinden,
   * ilgili bakiye/muhasebe geri alımı ve audit ile yapılır. `clear` (Süper Admin,
   * fabrika sıfırlama/yedek geri yükleme) bu kısıttan muaftır.
   */
  noHardDelete?: boolean;
  /** Kayıtlar istemciye gönderilmeden önce çıkarılan kolonlar. */
  hidden?: string[];
}

export const META: Record<string, ResourceMeta> = {
  contacts: {
    module: 'contacts',
    /**
     * Cari kartları sipariş, irsaliye, fatura ve finans ekranlarının ortak
     * referans verisidir; okuma için oturum yeterlidir (yazma modül iznine bağlıdır).
     */
    readAuthOnly: true,
    searchable: ['code', 'name', 'companyTitle', 'contactPerson', 'phone', 'mobile', 'email', 'taxNumber'],
    defaultOrder: 'name ASC',
    /** Cari bakiyesi yalnızca kontrollü finans uçlarında (fatura, tahsilat/tediye, açılış, reset) değişir. */
    derivedColumns: ['balance'],
    guards: [
      { table: 'orders', column: 'contactId', message: 'Bu cariye bağlı siparişler var. Önce siparişleri silin.' },
      { table: 'invoices', column: 'contactId', message: 'Bu cariye bağlı faturalar var. Önce faturaları silin.' },
      { table: 'waybills', column: 'contactId', message: 'Bu cariye bağlı irsaliyeler var. Önce irsaliyeleri silin.' },
      { table: 'transactions', column: 'contactId', message: 'Bu cariye bağlı kasa/banka hareketleri var.' },
    ],
  },
  assortmentTemplates: { module: 'inventory', searchable: ['name'], defaultOrder: 'name ASC' },
  barcodeTemplates: { module: 'inventory', searchable: ['name', 'description'], defaultOrder: 'name ASC' },
  products: {
    module: 'inventory',
    /**
     * Ürün kartları sipariş, irsaliye, fatura ve üretim ekranlarında seçim
     * listesi olarak kullanılır; okuma için oturum yeterlidir.
     */
    readAuthOnly: true,
    searchable: ['code', 'name', 'barcode', 'moldCode', 'moldGroup', 'subType', 'brand', 'category', 'documentNo'],
    defaultOrder: 'name ASC',
    /**
     * Stok ve varyant stoğu yalnızca kontrollü uçlarda (stok hareketi, fatura/irsaliye
     * stok düşümü, varyant senkronu, reset) satır kilidi altında ve inventoryLogs
     * kaydıyla birlikte güncellenir.
     */
    derivedColumns: ['stock', 'variantBarcodes'],
    guards: [
      { table: 'orderItems', column: 'productId', message: 'Bu ürüne bağlı sipariş kalemleri var.' },
      { table: 'waybillItems', column: 'productId', message: 'Bu ürüne bağlı irsaliye kalemleri var.' },
      { table: 'invoiceItems', column: 'productId', message: 'Bu ürüne bağlı fatura kalemleri var.' },
      { table: 'workOrders', column: 'productId', message: 'Bu ürüne bağlı iş emirleri var.' },
    ],
  },
  recipes: {
    module: 'production',
    searchable: ['name', 'targetColor'],
    defaultOrder: 'id DESC',
    guards: [{ table: 'workOrders', column: 'recipeId', message: 'Bu reçeteye bağlı iş emirleri var.' }],
  },
  workOrders: {
    module: 'production',
    searchable: ['barcode', 'orderNumber', 'customerName', 'documentNo', 'moldCode', 'moldGroup', 'color'],
    defaultOrder: 'id DESC',
  },
  inventoryLogs: { module: 'inventory', searchable: ['description', 'color', 'size'], defaultOrder: 'id DESC', movementTable: true },
  transactions: { module: 'finance', searchable: ['description', 'category', 'documentNo'], defaultOrder: 'date DESC', noHardDelete: true, protectedColumns: ['status', 'cancelledAt', 'reversalOfId'] },
  /** Firma künyesi/logo gibi kabuk ayarları arayüzün her yerinde okunur. */
  settings: { module: 'settings', searchable: [], defaultOrder: 'id ASC', readAuthOnly: true },
  orders: {
    module: 'orders',
    searchable: ['orderNumber', 'notes'],
    defaultOrder: 'id DESC',
    guards: [
      { table: 'orderItems', column: 'orderId', message: 'Sipariş kalemleri silinmeden sipariş silinemez.' },
      { table: 'waybills', column: 'orderId', message: 'Bu siparişe bağlı irsaliyeler var.' },
    ],
  },
  orderItems: { module: 'orders', searchable: [], defaultOrder: 'id ASC' },
  invoices: {
    module: 'invoices',
    searchable: ['invoiceNumber', 'orderNumber', 'waybillNumber', 'ettn', 'notes'],
    defaultOrder: 'id DESC',
    /** Ödeme durumu ve ödenen tutar yalnızca tahsilat/tediye op'unda (satır kilidi + muhasebe) belirlenir; istemci generic INSERT/UPDATE'te yazamaz. */
    protectedColumns: ['paidAmount', 'paymentStatus'],
    noHardDelete: true,
    guards: [{ table: 'invoiceItems', column: 'invoiceId', message: 'Fatura kalemleri silinmeden fatura silinemez.' }],
  },
  invoiceItems: { module: 'invoices', searchable: ['productCode', 'productName'], defaultOrder: 'id ASC' },
  waybills: {
    module: 'waybills',
    searchable: ['waybillNumber', 'orderNumber', 'contactName', 'ettn', 'vehiclePlate', 'notes'],
    defaultOrder: 'id DESC',
    /** Fatura bağı yalnızca create/issue/cancel/delete-invoice op'larında (satır kilidi altında) belirlenir; istemci generic yazımda yazamaz. */
    protectedColumns: ['invoicedStatus', 'invoiceId', 'invoiceNumber'],
    guards: [{ table: 'waybillItems', column: 'waybillId', message: 'İrsaliye kalemleri silinmeden irsaliye silinemez.' }],
  },
  waybillItems: { module: 'waybills', searchable: ['productCode', 'productName'], defaultOrder: 'id ASC' },
  accounts: { module: 'accounting', searchable: ['code', 'name', 'description'], defaultOrder: 'code ASC' },
  journalEntries: {
    module: 'accounting',
    searchable: ['entryNumber', 'description', 'documentNumber', 'documentType'],
    defaultOrder: 'id DESC',
    /** Yevmiye defteri immutable: onaylı fiş generic silinemez, reverse-journal ile ters kayıt üretilir. */
    noHardDelete: true,
  },
  cashBoxes: { module: 'finance', searchable: ['code', 'name', 'responsiblePerson'], defaultOrder: 'code ASC', derivedColumns: ['balance'] },
  bankAccounts: { module: 'finance', searchable: ['bankName', 'iban', 'accountNumber'], defaultOrder: 'id ASC', derivedColumns: ['balance'] },
  checks: {
    module: 'finance',
    searchable: ['portfolioNumber', 'serialNumber', 'bankName', 'drawer', 'contactName'],
    defaultOrder: 'dueDate ASC',
    /** Çek durumu ve ciro bilgileri yalnızca /ops/check-status ucunda (kasa/banka/cari + muhasebe ile) belirlenir; istemci generic yazımda yazamaz. */
    protectedColumns: ['status', 'statusChangeDate', 'endorsedToContactId', 'endorsedToContactName', 'journalEntryId'],
  },
  collectionReceipts: { module: 'finance', searchable: ['receiptNumber', 'contactName', 'description'], defaultOrder: 'id DESC', protectedColumns: ['isAccounted', 'journalEntryId'], noHardDelete: true },
  employees: {
    module: 'hr',
    searchable: ['employeeCode', 'name', 'tcNo', 'department', 'position', 'phone'],
    defaultOrder: 'name ASC',
    guards: [
      { table: 'attendanceRecords', column: 'employeeId', message: 'Personelin puantaj kayıtları var.' },
      { table: 'payrollRecords', column: 'employeeId', message: 'Personelin bordro kayıtları var.' },
      { table: 'advanceRequests', column: 'employeeId', message: 'Personelin avans kayıtları var.' },
      { table: 'leaveRequests', column: 'employeeId', message: 'Personelin izin kayıtları var.' },
    ],
  },
  attendanceRecords: { module: 'hr', searchable: ['status', 'notes'], defaultOrder: 'date DESC' },
  leaveRequests: { module: 'hr', searchable: ['employeeName', 'leaveType', 'reason'], defaultOrder: 'id DESC' },
  advanceRequests: { module: 'hr', searchable: ['employeeName', 'description'], defaultOrder: 'id DESC' },
  payrollRecords: { module: 'hr', searchable: ['employeeName', 'employeeCode', 'department'], defaultOrder: 'id DESC', protectedColumns: ['paymentStatus', 'isAccounted', 'journalEntryId'] },
  periodLocks: { module: 'hr', searchable: [], defaultOrder: 'year DESC, month DESC' },
  /** Roller her oturum sahibi tarafından okunabilir; kendi rolünü çözmek için gerekir. */
  roles: { module: 'users', searchable: ['code', 'name', 'description'], defaultOrder: 'id ASC', readAuthOnly: true },
  users: {
    module: 'users',
    searchable: ['username', 'fullName', 'email', 'department', 'title'],
    defaultOrder: 'id ASC',
    protectedColumns: ['passwordHash', 'passwordSalt'],
    hidden: ['passwordHash', 'passwordSalt'],
  },
  /** Denetim izi yalnızca sunucu tarafından yazılır; istemci sadece okur. */
  auditLogs: {
    module: 'users',
    searchable: ['userName', 'action', 'module', 'description', 'entityId'],
    defaultOrder: 'id DESC',
    readOnly: true,
  },
};

const FALLBACK_META: ResourceMeta = { module: 'dashboard', searchable: [], defaultOrder: 'id ASC' };

export function getMeta(resource: string): ResourceMeta {
  return META[resource] || FALLBACK_META;
}

export function getDef(resource: string): ResourceDef | undefined {
  return RESOURCES[resource];
}

export const RESOURCE_NAMES = Object.keys(RESOURCES);
