import type {
  Contact,
  AssortmentTemplate,
  BarcodeTemplate,
  Product,
  Recipe,
  WorkOrder,
  InventoryLog,
  Transaction,
  AppSettings,
  Order,
  OrderItem,
  Invoice,
  InvoiceItem,
  Waybill,
  WaybillItem,
  Account,
  JournalEntry,
  CashBox,
  BankAccount,
  CheckNote,
  CollectionReceipt,
  Employee,
  AttendanceRecord,
  LeaveRequest,
  AdvanceRequest,
  PayrollRecord,
  AttendancePeriodLock,
  Role,
  AppUser,
  AuditLog,
} from '../types';

/* ------------------------------------------------------------------ */
/* Tipler                                                              */
/* ------------------------------------------------------------------ */

export type FilterOp =
  | 'eq'
  | 'ne'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'like'
  | 'startsWith'
  | 'endsWith'
  | 'contains'
  | 'equalsIgnoreCase'
  | 'isNull'
  | 'notNull';

export interface FilterExpr {
  op: FilterOp;
  value?: string | number | boolean | null;
}

export type FilterValue =
  | string
  | number
  | boolean
  | null
  | (string | number)[]
  | FilterExpr;

export interface ListOptions {
  /** Bileşik anahtar için 'employeeId+date' biçiminde yazılır. */
  where?: Record<string, FilterValue>;
  search?: string;
  orderBy?: string;
  orderDir?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
  select?: string[];
}

/** Dexie'nin `.where('x').startsWith(v)` zincirinin kısa yazımı. */
export function startsWith(value: string): FilterExpr {
  return { op: 'startsWith', value };
}

/** Dexie'nin `.where('x').equalsIgnoreCase(v)` zincirinin kısa yazımı. */
export function equalsIgnoreCase(value: string): FilterExpr {
  return { op: 'equalsIgnoreCase', value };
}

export type Id = number | string;

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/* ------------------------------------------------------------------ */
/* HTTP çekirdeği                                                      */
/* ------------------------------------------------------------------ */

const BASE = '/api';

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });
  } catch (err: any) {
    throw new ApiError(
      'Sunucuya bağlanılamadı. Uygulamanın arka uç sunucusu çalışıyor mu?',
      0,
      'NETWORK'
    );
  }

  const text = await res.text();
  let payload: any = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { error: text };
    }
  }

  if (!res.ok) {
    throw new ApiError(payload?.error || `İstek başarısız (${res.status})`, res.status, payload?.code);
  }
  return payload as T;
}

function buildQuery(opts: ListOptions = {}): string {
  const params = new URLSearchParams();
  if (opts.where && Object.keys(opts.where).length) params.set('where', JSON.stringify(opts.where));
  if (opts.search) params.set('search', opts.search);
  if (opts.orderBy) params.set('orderBy', opts.orderBy);
  if (opts.orderDir) params.set('orderDir', opts.orderDir);
  if (opts.limit !== undefined) params.set('limit', String(opts.limit));
  if (opts.offset !== undefined) params.set('offset', String(opts.offset));
  if (opts.select?.length) params.set('select', opts.select.join(','));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/* ------------------------------------------------------------------ */
/* Kaynak istemcisi                                                    */
/* ------------------------------------------------------------------ */

export interface ResourceClient<T> {
  readonly name: string;
  list(opts?: ListOptions): Promise<T[]>;
  /** Koşula uyan ilk kaydı döner (Dexie where().equals().first() karşılığı). */
  findOne(where: ListOptions['where']): Promise<T | undefined>;
  get(id: Id): Promise<T | undefined>;
  count(where?: ListOptions['where']): Promise<number>;
  create(data: Partial<T>): Promise<number>;
  createMany(rows: Partial<T>[]): Promise<number[]>;
  /** id varsa günceller, yoksa ekler (Dexie put karşılığı). */
  save(data: Partial<T> & { id?: Id }): Promise<Id>;
  saveMany(rows: (Partial<T> & { id?: Id })[]): Promise<Id[]>;
  update(id: Id, changes: Partial<T>): Promise<number>;
  remove(id: Id): Promise<void>;
  removeMany(ids: Id[]): Promise<number>;
  removeWhere(where: ListOptions['where']): Promise<number>;
  /** Tabloyu tamamen boşaltır (fabrika sıfırlama). */
  clear(): Promise<number>;
}

function resource<T>(name: string): ResourceClient<T> {
  return {
    name,

    async list(opts) {
      const res = await http<{ data: T[] }>(`/${name}${buildQuery(opts)}`);
      return res.data || [];
    },

    async findOne(where) {
      const rows = await this.list({ where, limit: 1 });
      return rows[0];
    },

    async get(id) {
      try {
        const res = await http<{ data: T }>(`/${name}/${encodeURIComponent(String(id))}`);
        return res.data;
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return undefined;
        throw err;
      }
    },

    async count(where) {
      const res = await http<{ count: number }>(`/${name}${buildQuery({ where })}${buildQuery({ where }) ? '&' : '?'}count=1`);
      return res.count || 0;
    },

    async create(data) {
      const res = await http<{ data: number }>(`/${name}`, { method: 'POST', body: JSON.stringify(data) });
      return res.data;
    },

    async createMany(rows) {
      if (!rows.length) return [];
      const res = await http<{ data: number[] }>(`/${name}/bulk`, {
        method: 'POST',
        body: JSON.stringify({ mode: 'insert', rows }),
      });
      return res.data || [];
    },

    async save(data) {
      const id = (data as any).id;
      if (id === undefined || id === null || id === '') {
        return this.create(data);
      }
      const res = await http<{ data: { id: Id } }>(`/${name}/${encodeURIComponent(String(id))}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      return res.data.id;
    },

    async saveMany(rows) {
      if (!rows.length) return [];
      const res = await http<{ data: Id[] }>(`/${name}/bulk`, {
        method: 'POST',
        body: JSON.stringify({ mode: 'upsert', rows }),
      });
      return res.data || [];
    },

    async update(id, changes) {
      const res = await http<{ data: { changes: number } }>(`/${name}/${encodeURIComponent(String(id))}`, {
        method: 'PATCH',
        body: JSON.stringify(changes),
      });
      return res.data?.changes ?? 0;
    },

    async remove(id) {
      await http(`/${name}/${encodeURIComponent(String(id))}`, { method: 'DELETE' });
    },

    async removeMany(ids) {
      if (!ids.length) return 0;
      const res = await http<{ data: { deleted: number } }>(`/${name}/bulk-delete`, {
        method: 'POST',
        body: JSON.stringify({ ids }),
      });
      return res.data?.deleted ?? 0;
    },

    async removeWhere(where) {
      const res = await http<{ data: { deleted: number } }>(`/${name}/delete-where`, {
        method: 'POST',
        body: JSON.stringify({ where }),
      });
      return res.data?.deleted ?? 0;
    },

    async clear() {
      const res = await http<{ data: { deleted: number } }>(`/${name}/clear`, { method: 'POST' });
      return res.data?.deleted ?? 0;
    },
  };
}

/* ------------------------------------------------------------------ */
/* Kaynak haritası (30 tablo)                                          */
/* ------------------------------------------------------------------ */

export const api = {
  contacts: resource<Contact>('contacts'),
  assortmentTemplates: resource<AssortmentTemplate>('assortmentTemplates'),
  barcodeTemplates: resource<BarcodeTemplate>('barcodeTemplates'),
  products: resource<Product>('products'),
  recipes: resource<Recipe>('recipes'),
  workOrders: resource<WorkOrder>('workOrders'),
  inventoryLogs: resource<InventoryLog>('inventoryLogs'),
  transactions: resource<Transaction>('transactions'),
  settings: resource<AppSettings>('settings'),
  orders: resource<Order>('orders'),
  orderItems: resource<OrderItem>('orderItems'),
  invoices: resource<Invoice>('invoices'),
  invoiceItems: resource<InvoiceItem>('invoiceItems'),
  waybills: resource<Waybill>('waybills'),
  waybillItems: resource<WaybillItem>('waybillItems'),
  accounts: resource<Account>('accounts'),
  journalEntries: resource<JournalEntry>('journalEntries'),
  cashBoxes: resource<CashBox>('cashBoxes'),
  bankAccounts: resource<BankAccount>('bankAccounts'),
  checks: resource<CheckNote>('checks'),
  collectionReceipts: resource<CollectionReceipt>('collectionReceipts'),
  employees: resource<Employee>('employees'),
  attendanceRecords: resource<AttendanceRecord>('attendanceRecords'),
  leaveRequests: resource<LeaveRequest>('leaveRequests'),
  advanceRequests: resource<AdvanceRequest>('advanceRequests'),
  payrollRecords: resource<PayrollRecord>('payrollRecords'),
  periodLocks: resource<AttendancePeriodLock>('periodLocks'),
  roles: resource<Role>('roles'),
  users: resource<AppUser>('users'),
  auditLogs: resource<AuditLog>('auditLogs'),
};

export type Api = typeof api;

/* ------------------------------------------------------------------ */
/* Toplu işlemler (sunucu tarafı, atomik)                              */
/* ------------------------------------------------------------------ */

export async function callOp<T = any>(op: string, payload: any = {}): Promise<T> {
  const res = await http<{ data: T }>(`/ops/${op}`, { method: 'POST', body: JSON.stringify(payload) });
  return res.data;
}

/* ------------------------------------------------------------------ */
/* Atomik toplu yazma                                                  */
/* ------------------------------------------------------------------ */

export type Mutation =
  | { op: 'insert'; resource: string; data: Record<string, any> }
  | { op: 'insertMany'; resource: string; rows: Record<string, any>[] }
  | { op: 'update'; resource: string; id: Id; data: Record<string, any> }
  | { op: 'updateWhere'; resource: string; where: ListOptions['where']; data: Record<string, any> }
  | { op: 'delete'; resource: string; id: Id }
  | { op: 'deleteWhere'; resource: string; where: ListOptions['where'] }
  | { op: 'clear'; resource: string };

export interface CommitResult {
  op: string;
  resource: string;
  id?: Id;
  ids?: Id[];
  changes?: number;
  deleted?: number;
}

/**
 * Birden çok tabloya dokunan yazma işlemlerini tek bir MySQL transaction'ı
 * içinde uygular. Okumalar önceden yapılır; yazma fazı atomiktir.
 *
 * `disableFkChecks`, tüm tabloları boşaltıp yeniden dolduran yedek geri
 * yükleme işlemlerinde yabancı anahtar sırasını devre dışı bırakır.
 */
export async function commit(mutations: Mutation[], options?: { disableFkChecks?: boolean }): Promise<CommitResult[]> {
  if (!mutations.length) return [];
  const res = await http<{ data: { results: CommitResult[] } }>('/ops/commit', {
    method: 'POST',
    body: JSON.stringify({ mutations, disableFkChecks: options?.disableFkChecks === true }),
  });
  return res.data?.results || [];
}

/** Tüm tabloları boşaltıp demo verisini baştan yükler. */
export async function reseedDatabase(): Promise<{ created: boolean }> {
  const res = await http<{ data: { created: boolean } }>('/ops/reseed', { method: 'POST' });
  return res.data || { created: false };
}

export async function health(): Promise<{ status: string; database: { connected: boolean; version?: string; error?: string } }> {
  return http('/health');
}
