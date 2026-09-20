import mysql from 'mysql2/promise';
import type { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

export const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'proerp',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'proerp',
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_SIZE || 10),
  queueLimit: 0,
  charset: 'utf8mb4_turkish_ci',
  // DECIMAL kolonlar mysql2 tarafından varsayılan olarak string döner;
  // uygulama katmanı sayı beklediği için number'a çeviriyoruz.
  decimalNumbers: true,
  dateStrings: false,
  timezone: 'local',
  multipleStatements: false,
  // TINYINT(1) -> boolean. MySQL 8 TINYINT(1) display width'i boolean uyumu için korur.
  typeCast(field: any, next: () => any) {
    if (field.type === 'TINY' && field.length === 1) {
      const value = field.string();
      return value === null ? null : value === '1';
    }
    return next();
  },
} as mysql.PoolOptions;

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = mysql.createPool(dbConfig);
  }
  return pool;
}

export async function query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const [rows] = await getPool().query(sql, params);
  return rows as T[];
}

export async function queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows.length ? rows[0] : null;
}

export async function execute(sql: string, params: any[] = []): Promise<ResultSetHeader> {
  const [result] = await getPool().execute(sql, params);
  return result as ResultSetHeader;
}

/**
 * Tek bir bağlantı üzerinde atomik işlem. Dexie'deki db.transaction('rw', ...)
 * bloklarının MySQL karşılığı.
 */
export async function withTransaction<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try {
      await conn.rollback();
    } catch {
      /* rollback hatası asıl hatayı gölgelemesin */
    }
    throw err;
  } finally {
    conn.release();
  }
}

export async function testConnection(): Promise<{ ok: boolean; version?: string; error?: string }> {
  try {
    const row = await queryOne<RowDataPacket>('SELECT VERSION() AS version');
    return { ok: true, version: (row as any)?.version };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
