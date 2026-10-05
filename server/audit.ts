/**
 * Sunucu tarafı denetim kaydı (audit log).
 *
 * Kayıtların kullanıcı kimliği, rolü, IP adresi ve zaman damgası her zaman
 * sunucudan yazılır; istemci yalnızca açıklama/detay metni gönderebilir.
 * Böylece denetim izi istemci tarafından taklit edilemez.
 */
import { execute } from './db.js';
import type { PoolConnection } from 'mysql2/promise';
import type { AuthContext } from './auth.js';
import type { AuthUser } from './auth.js';

export interface AuditEntry {
  action: string;
  module: string;
  description: string;
  details?: string | null;
  entityId?: string | number | null;
}

/**
 * Denetim izine otomatik yazılan kritik kaynaklar. Ana veriler (ürün/cari
 * kartı tanımı) ve tüm finansal/stok/muhasebe/üretim/bordro/ayar kayıtları
 * burada listelenir; generic REST yazımları bu kaynaklar için aynı
 * transaction içinde sunucu tarafında denetim kaydı üretir.
 */
export const AUDITED_RESOURCES: Record<string, { label: string; module: string }> = {
  users: { label: 'Kullanıcı', module: 'users' },
  roles: { label: 'Rol', module: 'users' },
  contacts: { label: 'Cari', module: 'contacts' },
  products: { label: 'Ürün', module: 'inventory' },
  colors: { label: 'Renk', module: 'colors' },
  invoices: { label: 'Fatura', module: 'invoices' },
  cashBoxes: { label: 'Kasa', module: 'finance' },
  bankAccounts: { label: 'Banka Hesabı', module: 'finance' },
  checks: { label: 'Çek', module: 'finance' },
  collectionReceipts: { label: 'Tahsilat Makbuzu', module: 'finance' },
  journalEntries: { label: 'Muhasebe Fişi', module: 'accounting' },
  orders: { label: 'Sipariş', module: 'orders' },
  waybills: { label: 'İrsaliye', module: 'waybills' },
  workOrders: { label: 'İş Emri', module: 'production' },
  payrollRecords: { label: 'Bordro', module: 'hr' },
  settings: { label: 'Ayar', module: 'settings' },
};

/** Denetim izine asla yazılmayan hassas gövde alanları. */
const HIDDEN_FIELDS = new Set(['password', 'passwordHash', 'passwordSalt']);

/**
 * Eski → yeni değer karşılaştırması denetim detayına yazılan alanlar.
 * Renk künyesi ve ürün kartının renk listesi tarihsel belgelerde de göründüğü
 * için ayrıca izlenir: "bu ürünün rengi neydi, ne oldu" audit'ten okunabilmelidir.
 */
const DIFF_FIELDS: Record<string, string[]> = {
  colors: ['code', 'name', 'groupName', 'hexCode', 'pantoneCode', 'manufacturerCode', 'isActive'],
  products: ['code', 'name', 'colors'],
};

/** Bu kaynak için güncellemede eski → yeni karşılaştırması tutuluyor mu? */
export function auditTracksChanges(resource: string): boolean {
  return Boolean(DIFF_FIELDS[resource]?.length);
}

function diffText(value: unknown, booleanLike = false): string {
  if (booleanLike) return value ? 'aktif' : 'pasif';
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'aktif' : 'pasif';
  if (Array.isArray(value)) return value.join(', ') || '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * Bir kaynak yazımı için otomatik denetim kaydı üretir (kimlik sunucudan).
 * `before` verilirse izlenen alanlarda eski → yeni karşılaştırması da detaya
 * yazılır; böylece renk adı/kodu değişiklikleri sonradan denetlenebilir.
 */
export function resourceAuditEntry(
  resource: string,
  action: 'create' | 'update' | 'delete',
  id: string | number | null,
  body?: unknown,
  before?: Record<string, unknown> | null,
): AuditEntry | null {
  const meta = AUDITED_RESOURCES[resource];
  if (!meta) return null;
  const verb = action === 'create' ? 'oluşturuldu' : action === 'update' ? 'güncellendi' : 'silindi';
  const idText = id === undefined || id === null ? '' : ` (id: ${id})`;

  const payload = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const fields = Object.keys(payload).filter((k) => !HIDDEN_FIELDS.has(k));
  const parts: string[] = [];
  if (fields.length) parts.push(`Alanlar: ${fields.join(', ')}`);

  const changes: string[] = [];
  if (before && action === 'update') {
    for (const field of DIFF_FIELDS[resource] || []) {
      if (!(field in payload)) continue;
      const flagLike = field === 'isActive';
      const oldText = diffText(before[field], flagLike);
      const newText = diffText(payload[field], flagLike);
      if (oldText !== newText) changes.push(`${field}: "${oldText}" → "${newText}"`);
    }
  }
  if (changes.length) parts.push(`Değişen: ${changes.join(' | ')}`);

  let description = `${meta.label} kaydı ${verb}${idText}`;
  // Yalnızca durum değiştiyse denetim izi açık fiil kullanır (pasifleştirme/aktifleştirme).
  if (resource === 'colors' && action === 'update' && changes.length === 1 && changes[0].startsWith('isActive:')) {
    description = `Renk ${payload.isActive ? 'aktifleştirildi' : 'pasifleştirildi'}${idText}`;
  }

  return {
    action,
    module: meta.module,
    entityId: id ?? null,
    description,
    details: parts.length ? parts.join(' — ').slice(0, 1000) : null,
  };
}

function actorLabel(user: AuthUser | null): { name: string; role: string } {
  if (!user) return { name: 'Sistem', role: 'Sistem' };
  return {
    name: user.fullName || user.username,
    role: user.roleName || user.roleCode || 'Tanımsız',
  };
}

export async function writeAudit(
  entry: AuditEntry,
  options: { auth?: AuthContext | null; ip?: string } = {},
): Promise<void> {
  const { name, role } = actorLabel(options.auth?.user || null);
  try {
    await execute(
      `INSERT INTO \`auditLogs\`
         (\`userId\`, \`userName\`, \`userRole\`, \`action\`, \`module\`, \`entityId\`, \`description\`, \`details\`, \`ipAddress\`, \`timestamp\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        options.auth?.user?.id ?? null,
        name,
        role,
        entry.action,
        entry.module,
        entry.entityId === undefined || entry.entityId === null ? null : String(entry.entityId),
        entry.description,
        entry.details ?? null,
        options.ip ?? null,
      ],
    );
  } catch (err) {
    // Denetim kaydı yazılamaması asıl işlemi bozmamalı.
    console.error('[AUDIT] Kayıt yazılamadı:', (err as Error)?.message || err);
  }
}

/**
 * Denetim kaydını, asıl işlemle AYNI transaction içinde yazar.
 * Böylece işlem rollback olursa denetim kaydı da geri alınır; işlem
 * commit olursa denetim kaydı da garanti olarak commit edilir.
 */
export async function writeAuditInTx(
  conn: PoolConnection,
  entry: AuditEntry,
  options: { auth?: AuthContext | null; ip?: string } = {},
): Promise<void> {
  const { name, role } = actorLabel(options.auth?.user || null);
  await conn.query(
    `INSERT INTO \`auditLogs\`
       (\`userId\`, \`userName\`, \`userRole\`, \`action\`, \`module\`, \`entityId\`, \`description\`, \`details\`, \`ipAddress\`, \`timestamp\`)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      options.auth?.user?.id ?? null,
      name,
      role,
      entry.action,
      entry.module,
      entry.entityId === undefined || entry.entityId === null ? null : String(entry.entityId),
      entry.description,
      entry.details ?? null,
      options.ip ?? null,
    ],
  );
}
