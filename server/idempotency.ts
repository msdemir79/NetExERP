import crypto from 'node:crypto';
import type { Request } from 'express';
import type { PoolConnection } from 'mysql2/promise';
import { withTransaction } from './db.js';
import { HttpError } from './errors.js';

/** Sonuç ve mali etkiler aynı transaction'da kalıcılaşır; cevap kaybında tekrar uygulanmaz. */
export async function withOperation<T>(req: Request, run: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const key = req.get('Idempotency-Key');
  if (!key) return withTransaction(run);
  if (!/^[\w-]{16,100}$/.test(key)) throw new HttpError(400, 'Geçersiz işlem anahtarı.', 'INVALID_IDEMPOTENCY_KEY');
  const userId = req.auth?.user.id;
  const scope = req.path;
  const hash = crypto.createHash('sha256').update(JSON.stringify(req.body ?? {})).digest('hex');
  return withTransaction(async conn => {
    await conn.query('INSERT IGNORE INTO `operationRequests` (`userId`, `scope`, `requestKey`, `payloadHash`) VALUES (?, ?, ?, ?)', [userId, scope, key, hash]);
    const [records] = await conn.query<any[]>('SELECT `payloadHash`, `result`, `completedAt` FROM `operationRequests` WHERE `userId` = ? AND `scope` = ? AND `requestKey` = ? FOR UPDATE', [userId, scope, key]);
    const record = records[0];
    if (record.payloadHash !== hash) throw new HttpError(409, 'İşlem anahtarı farklı içerikle tekrar kullanılamaz.', 'IDEMPOTENCY_CONFLICT');
    if (record.completedAt != null) return (typeof record.result === 'string' ? JSON.parse(record.result) : record.result) as T;
    const result = await run(conn);
    await conn.query('UPDATE `operationRequests` SET `result` = ?, `completedAt` = NOW() WHERE `userId` = ? AND `scope` = ? AND `requestKey` = ?', [JSON.stringify(result ?? null), userId, scope, key]);
    return result;
  });
}
