/**
 * Sunucu tarafı denetim kaydı (audit log).
 *
 * Kayıtların kullanıcı kimliği, rolü, IP adresi ve zaman damgası her zaman
 * sunucudan yazılır; istemci yalnızca açıklama/detay metni gönderebilir.
 * Böylece denetim izi istemci tarafından taklit edilemez.
 */
import { execute } from './db.js';
import type { AuthContext } from './auth.js';
import type { AuthUser } from './auth.js';

export interface AuditEntry {
  action: string;
  module: string;
  description: string;
  details?: string | null;
  entityId?: string | number | null;
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
