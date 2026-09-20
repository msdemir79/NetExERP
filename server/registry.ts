import { RESOURCES, type ResourceDef } from './columns.js';

export interface ResourceMeta {
  /** ?search= parametresinin aradığı kolonlar */
  searchable: string[];
  /** Varsayılan sıralama (ORDER BY) */
  defaultOrder: string;
  /** Silme öncesi bağlı kayıt kontrolü: { tablo, kolon, mesaj } */
  guards?: { table: string; column: string; message: string }[];
  /** Sadece okunabilir (istemci yazamaz) */
  readOnly?: boolean;
}

export const META: Record<string, ResourceMeta> = {
  contacts: {
    searchable: ['code', 'name', 'companyTitle', 'contactPerson', 'phone', 'mobile', 'email', 'taxNumber'],
    defaultOrder: 'name ASC',
    guards: [
      { table: 'orders', column: 'contactId', message: 'Bu cariye bağlı siparişler var. Önce siparişleri silin.' },
      { table: 'invoices', column: 'contactId', message: 'Bu cariye bağlı faturalar var. Önce faturaları silin.' },
      { table: 'waybills', column: 'contactId', message: 'Bu cariye bağlı irsaliyeler var. Önce irsaliyeleri silin.' },
      { table: 'transactions', column: 'contactId', message: 'Bu cariye bağlı kasa/banka hareketleri var.' },
    ],
  },
  assortmentTemplates: { searchable: ['name'], defaultOrder: 'name ASC' },
  barcodeTemplates: { searchable: ['name', 'description'], defaultOrder: 'name ASC' },
  products: {
    searchable: ['code', 'name', 'barcode', 'moldCode', 'moldGroup', 'subType', 'brand', 'category', 'documentNo'],
    defaultOrder: 'name ASC',
    guards: [
      { table: 'orderItems', column: 'productId', message: 'Bu ürüne bağlı sipariş kalemleri var.' },
      { table: 'waybillItems', column: 'productId', message: 'Bu ürüne bağlı irsaliye kalemleri var.' },
      { table: 'invoiceItems', column: 'productId', message: 'Bu ürüne bağlı fatura kalemleri var.' },
      { table: 'workOrders', column: 'productId', message: 'Bu ürüne bağlı iş emirleri var.' },
    ],
  },
  recipes: {
    searchable: ['name', 'targetColor'],
    defaultOrder: 'id DESC',
    guards: [{ table: 'workOrders', column: 'recipeId', message: 'Bu reçeteye bağlı iş emirleri var.' }],
  },
  workOrders: {
    searchable: ['barcode', 'orderNumber', 'customerName', 'documentNo', 'moldCode', 'moldGroup', 'color'],
    defaultOrder: 'id DESC',
  },
  inventoryLogs: { searchable: ['description', 'color', 'size'], defaultOrder: 'id DESC' },
  transactions: { searchable: ['description', 'category', 'documentNo'], defaultOrder: 'date DESC' },
  settings: { searchable: [], defaultOrder: 'id ASC' },
  orders: {
    searchable: ['orderNumber', 'notes'],
    defaultOrder: 'id DESC',
    guards: [
      { table: 'orderItems', column: 'orderId', message: 'Sipariş kalemleri silinmeden sipariş silinemez.' },
      { table: 'waybills', column: 'orderId', message: 'Bu siparişe bağlı irsaliyeler var.' },
    ],
  },
  orderItems: { searchable: [], defaultOrder: 'id ASC' },
  invoices: {
    searchable: ['invoiceNumber', 'orderNumber', 'waybillNumber', 'ettn', 'notes'],
    defaultOrder: 'id DESC',
    guards: [{ table: 'invoiceItems', column: 'invoiceId', message: 'Fatura kalemleri silinmeden fatura silinemez.' }],
  },
  invoiceItems: { searchable: ['productCode', 'productName'], defaultOrder: 'id ASC' },
  waybills: {
    searchable: ['waybillNumber', 'orderNumber', 'contactName', 'ettn', 'vehiclePlate', 'notes'],
    defaultOrder: 'id DESC',
    guards: [{ table: 'waybillItems', column: 'waybillId', message: 'İrsaliye kalemleri silinmeden irsaliye silinemez.' }],
  },
  waybillItems: { searchable: ['productCode', 'productName'], defaultOrder: 'id ASC' },
  accounts: { searchable: ['code', 'name', 'description'], defaultOrder: 'code ASC' },
  journalEntries: {
    searchable: ['entryNumber', 'description', 'documentNumber', 'documentType'],
    defaultOrder: 'id DESC',
  },
  cashBoxes: { searchable: ['code', 'name', 'responsiblePerson'], defaultOrder: 'code ASC' },
  bankAccounts: { searchable: ['bankName', 'iban', 'accountNumber'], defaultOrder: 'id ASC' },
  checks: {
    searchable: ['portfolioNumber', 'serialNumber', 'bankName', 'drawer', 'contactName'],
    defaultOrder: 'dueDate ASC',
  },
  collectionReceipts: { searchable: ['receiptNumber', 'contactName', 'description'], defaultOrder: 'id DESC' },
  employees: {
    searchable: ['employeeCode', 'name', 'tcNo', 'department', 'position', 'phone'],
    defaultOrder: 'name ASC',
    guards: [
      { table: 'attendanceRecords', column: 'employeeId', message: 'Personelin puantaj kayıtları var.' },
      { table: 'payrollRecords', column: 'employeeId', message: 'Personelin bordro kayıtları var.' },
      { table: 'advanceRequests', column: 'employeeId', message: 'Personelin avans kayıtları var.' },
      { table: 'leaveRequests', column: 'employeeId', message: 'Personelin izin kayıtları var.' },
    ],
  },
  attendanceRecords: { searchable: ['status', 'notes'], defaultOrder: 'date DESC' },
  leaveRequests: { searchable: ['employeeName', 'leaveType', 'reason'], defaultOrder: 'id DESC' },
  advanceRequests: { searchable: ['employeeName', 'description'], defaultOrder: 'id DESC' },
  payrollRecords: { searchable: ['employeeName', 'employeeCode', 'department'], defaultOrder: 'id DESC' },
  periodLocks: { searchable: [], defaultOrder: 'year DESC, month DESC' },
  roles: { searchable: ['code', 'name', 'description'], defaultOrder: 'id ASC' },
  users: {
    searchable: ['username', 'fullName', 'email', 'department', 'title'],
    defaultOrder: 'id ASC',
  },
  auditLogs: { searchable: ['userName', 'action', 'module', 'description', 'entityId'], defaultOrder: 'id DESC' },
};

export function getMeta(resource: string): ResourceMeta {
  return META[resource] || { searchable: [], defaultOrder: 'id ASC' };
}

export function getDef(resource: string): ResourceDef | undefined {
  return RESOURCES[resource];
}

export const RESOURCE_NAMES = Object.keys(RESOURCES);
