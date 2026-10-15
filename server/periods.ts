import type { PoolConnection } from 'mysql2/promise';
import { HttpError } from './errors.js';
import { assertBalancedJournalEntry } from '../src/lib/accountingValidator.js';
import { can, type AuthContext } from './auth.js';

export type PeriodScope = 'hr' | 'accounting';

export function periodOf(value: unknown): { year: number; month: number } {
  const date = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(date.getTime())) throw new HttpError(400, 'Geçersiz işlem tarihi.', 'INVALID_DATE');
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

/** Kilit satırını aynı transaction'da alır: dönem kapama ile kayıt yazımı yarışamaz. */
export async function assertOpenPeriod(conn: PoolConnection, scope: PeriodScope, value: unknown): Promise<void> {
  const { year, month } = periodOf(value);
  await conn.query('INSERT IGNORE INTO `periodLocks` (`scope`, `year`, `month`, `isLocked`) VALUES (?, ?, ?, 0)', [scope, year, month]);
  const [rows] = await conn.query<any[]>('SELECT `isLocked` FROM `periodLocks` WHERE `scope` = ? AND `year` = ? AND `month` = ? FOR UPDATE', [scope, year, month]);
  if (rows[0]?.isLocked) throw new HttpError(409, `${month}/${year} ${scope === 'hr' ? 'İK' : 'muhasebe'} dönemi kilitli.`, 'PERIOD_LOCKED');
}

const SCOPES: Record<string, PeriodScope> = {
  journalEntries: 'accounting', invoices: 'accounting', waybills: 'accounting', transactions: 'accounting',
  collectionReceipts: 'accounting', checks: 'accounting', inventoryLogs: 'accounting',
  attendanceRecords: 'hr', payrollRecords: 'hr', advanceRequests: 'hr', leaveRequests: 'hr',
};

export async function assertResourcePeriod(conn: PoolConnection, resource: string, data: any, id?: unknown, auth?: AuthContext): Promise<void> {
  if (resource === 'periodLocks') {
    const [existing] = id != null ? await conn.query<any[]>('SELECT * FROM `periodLocks` WHERE `id`=? FOR UPDATE', [id]) : [[]];
    const merged = { ...existing[0], ...data };
    const scope = merged.scope || 'hr';
    if (scope === 'accounting') throw new HttpError(400, 'Muhasebe dönemi kontrol ve kapama işlemini kullanın.', 'CONTROLLED_WRITE');
    if (!['hr', 'accounting'].includes(scope) || !can(auth?.role || null, scope, 'approve')) throw new HttpError(403, 'Dönem kilidi için ilgili modülde onay yetkisi gerekir.', 'FORBIDDEN');
    if (!Number.isInteger(Number(merged.month)) || Number(merged.month) < 1 || Number(merged.month) > 12 || !Number.isInteger(Number(merged.year)) || Number(merged.year) < 2000 || Number(merged.year) > 2100) throw new HttpError(400, 'Geçersiz dönem.');
    if (existing[0] && (Number(merged.year) !== Number(existing[0].year) || Number(merged.month) !== Number(existing[0].month) || scope !== existing[0].scope)) throw new HttpError(400, 'Kilit kapsamı ve dönemi değiştirilemez.');
    data.scope = scope; data.lockedBy = auth?.user.fullName || auth?.user.username; data.lockedAt = merged.isLocked ? new Date() : null;
    return;
  }
  const scope = SCOPES[resource];
  if (!scope) return;
  let before: any;
  if (id !== undefined && id !== null) {
    const [rows] = await conn.query<any[]>(`SELECT * FROM \`${resource}\` WHERE \`id\` = ? FOR UPDATE`, [id]);
    before = rows[0];
  }
  if (resource === 'journalEntries') {
    if (before && before.status !== 'draft') throw new HttpError(409, 'Kesinleşmiş fiş değiştirilemez; ters kayıt kullanın.', 'POSTED_DOCUMENT');
    const merged = { ...before, ...data };
    const lines = typeof merged.lines === 'string' ? JSON.parse(merged.lines) : merged.lines;
    if (merged.status !== 'draft' || (Array.isArray(lines) && lines.length)) {
      let totals;
      try { totals = assertBalancedJournalEntry(lines); }
      catch (error) { throw new HttpError(422, (error as Error).message, 'INVALID_JOURNAL_LINES'); }
      const codes = [...new Set(lines.map((line: any) => line.accountCode))];
      const [accounts] = await conn.query<any[]>('SELECT `code` FROM `accounts` WHERE `code` IN (?) AND `isActive` = 1', [codes]);
      if (accounts.length !== codes.length) throw new HttpError(400, 'Fişteki hesaplardan biri tanımsız veya pasif.', 'INVALID_ACCOUNT');
      data.totalDebit = totals.totalDebit; data.totalCredit = totals.totalCredit; data.isBalanced = 1;
    } else {
      data.totalDebit = 0; data.totalCredit = 0; data.isBalanced = 0;
    }
  }
  const assertRow = async (row: any) => {
    if (!row) return;
    if (resource === 'payrollRecords' || resource === 'advanceRequests' || (resource === 'attendanceRecords' && !row.date)) {
      if (!Number.isInteger(Number(row.year)) || !Number.isInteger(Number(row.month)) || Number(row.month) < 1 || Number(row.month) > 12) {
        throw new HttpError(400, 'Geçerli ay ve yıl zorunludur.', 'INVALID_PERIOD');
      }
      await assertOpenPeriod(conn, scope, new Date(Number(row.year), Number(row.month) - 1, 1));
    } else {
      const date = row.date ?? row.startDate ?? row.issueDate;
      if (date) await assertOpenPeriod(conn, scope, date);
      if (resource === 'leaveRequests' && row.endDate) {
        const end = periodOf(row.endDate);
        const cursor = new Date(String(row.startDate));
        cursor.setDate(1);
        while (cursor.getFullYear() * 12 + cursor.getMonth() <= end.year * 12 + end.month - 1) {
          await assertOpenPeriod(conn, scope, cursor);
          cursor.setMonth(cursor.getMonth() + 1);
        }
      }
    }
  };
  await assertRow(before);
  await assertRow({ ...before, ...data });
}
