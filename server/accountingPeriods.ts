import type { Router, Request } from 'express';
import type { PoolConnection } from 'mysql2/promise';
import { can, clientIp } from './auth.js';
import { HttpError } from './errors.js';
import { withTransaction } from './db.js';
import { withOperation } from './idempotency.js';
import { assertBalancedJournalEntry } from '../src/lib/accountingValidator.js';
import { writeAuditInTx } from './audit.js';
import { broadcast } from './sse.js';

function period(body: any) {
  const year = Number(body.year), month = Number(body.month);
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) throw new HttpError(400, 'Geçerli ay ve yıl seçin.');
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end = `${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2, '0')}-01`;
  return { year, month, start, end };
}
function permission(req: Request, action: 'view' | 'approve') {
  if (!can(req.auth?.role || null, 'accounting', action)) throw new HttpError(403, 'Muhasebe dönem işlemi için yetkiniz yok.', 'FORBIDDEN');
}
async function checklist(conn: PoolConnection, range: ReturnType<typeof period>) {
  const count = async (sql: string) => { const [result] = await conn.query<any[]>(sql, [range.start, range.end]); return Number(result[0].n); };
  const [entries] = await conn.query<any[]>('SELECT id,`lines`,totalDebit,totalCredit FROM journalEntries WHERE date>=? AND date<? AND status=\'approved\'', [range.start, range.end]);
  let invalidEntries = 0;
  for (const entry of entries) {
    try {
      const totals = assertBalancedJournalEntry(typeof entry.lines === 'string' ? JSON.parse(entry.lines) : entry.lines);
      if (Math.abs(totals.totalDebit - Number(entry.totalDebit)) > 0.005 || Math.abs(totals.totalCredit - Number(entry.totalCredit)) > 0.005) invalidEntries++;
    } catch { invalidEntries++; }
  }
  return [
    { key: 'draftEntries', label: 'Taslak muhasebe fişleri', count: await count("SELECT COUNT(*) n FROM journalEntries WHERE date>=? AND date<? AND status='draft'"), blocking: true },
    { key: 'invalidEntries', label: 'Dengesiz veya toplamı hatalı kesinleşmiş fişler', count: invalidEntries, blocking: true },
    { key: 'unaccountedInvoices', label: 'Muhasebe fişi olmayan kesinleşmiş faturalar', count: await count("SELECT COUNT(*) n FROM invoices i WHERE i.date>=? AND i.date<? AND i.status='issued' AND NOT EXISTS (SELECT 1 FROM journalEntries j WHERE j.documentType='invoice' AND j.documentId=i.id AND j.status='approved')"), blocking: true },
    { key: 'unaccountedReceipts', label: 'Muhasebe fişi olmayan tahsilat / tediye', count: await count("SELECT COUNT(*) n FROM collectionReceipts r WHERE r.date>=? AND r.date<? AND NOT EXISTS (SELECT 1 FROM journalEntries j WHERE j.id=r.journalEntryId AND j.status='approved')"), blocking: true },
    { key: 'draftInvoices', label: 'Taslak faturalar (bilgi)', count: await count("SELECT COUNT(*) n FROM invoices WHERE date>=? AND date<? AND status='draft'"), blocking: false },
  ];
}
export function registerAccountingPeriods(router: Router) {
  router.post('/accounting-period', async (req, res, next) => {
    try {
      permission(req, 'view'); const range = period(req.body);
      const data = await withTransaction(async conn => {
        const [locks] = await conn.query<any[]>("SELECT * FROM periodLocks WHERE scope='accounting' AND year=? AND month=?", [range.year, range.month]);
        return { ...range, lock: locks[0] || null, checks: await checklist(conn, range) };
      });
      res.json({ data });
    } catch (error) { next(error); }
  });
  router.post('/set-accounting-period', async (req, res, next) => {
    try {
      permission(req, 'approve'); const range = period(req.body);
      if (typeof req.body.isLocked !== 'boolean' || typeof req.body.expectedVersion !== 'number' || !String(req.body.reason || '').trim()) throw new HttpError(400, 'Dönem durumu, sürüm ve işlem gerekçesi zorunludur.');
      const data = await withOperation(req, async conn => {
        // İşlem yazımları da aynı satırı kilitler; son kontrol ile kapama arasına kayıt giremez.
        await conn.query("INSERT IGNORE INTO periodLocks (scope,year,month,isLocked) VALUES ('accounting',?,?,0)", [range.year, range.month]);
        const [locks] = await conn.query<any[]>("SELECT * FROM periodLocks WHERE scope='accounting' AND year=? AND month=? FOR UPDATE", [range.year, range.month]);
        const lock = locks[0];
        const expected = req.body.expectedVersion;
        // Henüz oluşmamış satır ekranda sürüm 0'dır; başka işlem açık satır oluşturmuş olabilir.
        if (Number(lock.version) !== expected && !(expected === 0 && Number(lock.version) === 1 && !lock.isLocked && !lock.lockedBy)) throw new HttpError(409, 'Dönem başka bir kullanıcı tarafından değiştirildi. Yenileyin.', 'VERSION_CONFLICT');
        if (!!lock.isLocked === req.body.isLocked) throw new HttpError(409, 'Dönem zaten istenen durumda.');
        const checks = await checklist(conn, range);
        if (req.body.isLocked && checks.some(check => check.blocking && check.count > 0)) throw new HttpError(409, 'Dönem kapatılamadı. Önce kontrol listesindeki engelleri giderin.', 'PERIOD_NOT_READY');
        await conn.query('UPDATE periodLocks SET isLocked=?,lockedAt=?,lockedBy=?,notes=?,version=version+1 WHERE id=?', [req.body.isLocked, req.body.isLocked ? new Date() : null, req.auth!.user.fullName || req.auth!.user.username, req.body.reason.trim(), lock.id]);
        await writeAuditInTx(conn, { action: 'update', module: 'accounting', entityId: lock.id, description: `${range.month}/${range.year} muhasebe dönemi ${req.body.isLocked ? 'kapatıldı' : 'yeniden açıldı'}`, details: req.body.reason.trim() }, { auth: req.auth, ip: clientIp(req) });
        return { isLocked: req.body.isLocked };
      });
      broadcast('periodLocks', 'update', []);
      // periodLocks kaynağı İK modülüne bağlıdır; yalnız muhasebe yetkili ekranlar da yenilenmeli.
      broadcast('journalEntries', 'refresh', []);
      res.json({ data });
    } catch (error) { next(error); }
  });
}
