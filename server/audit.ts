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

/** Bir kaynak yazımı için otomatik denetim kaydı üretir (kimlik sunucudan). */
export function resourceAuditEntry(
  resource: string,
  action: 'create' | 'update' | 'delete',
  id: string | number | null,
  body?: unknown,
): AuditEntry | null {
  const meta = AUDITED_RESOURCES[resource];
  if (!meta) return null;
  const verb = action === 'create' ? 'oluşturuldu' : action === 'update' ? 'güncellendi' : 'silindi';
  const idText = id === undefined || id === null ? '' : ` (id: ${id})`;
  let details: string | null = null;
  if (body && typeof body === 'object') {
    const fields = Object.keys(body as Record<string, unknown>).filter(
      (k) => k !== 'password' && k !== 'passwordHash' && k !== 'passwordSalt',
    );
    if (fields.length) details = `Alanlar: ${fields.join(', ')}`.slice(0, 1000);
  }
  return {
    action,
    module: meta.module,
    entityId: id ?? null,
    description: `${meta.label} kaydı ${verb}${idText}`,
    details,
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
