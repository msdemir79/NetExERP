import express, { type Request, type Response, type Router } from 'express';
import { execute, query, queryOne, withTransaction } from './db.js';
import { getDef, getMeta, RESOURCE_NAMES } from './registry.js';
import { reseed } from './seed.js';
import type { ResourceDef } from './columns.js';

/* ------------------------------------------------------------------ */
/* Yardımcılar                                                         */
/* ------------------------------------------------------------------ */

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function req_<T>(value: unknown, message: string): T {
  if (value === undefined || value === null || value === '') throw new HttpError(400, message);
  return value as T;
}

/** Gelen değeri kolon tipine göre MySQL'in kabul edeceği hale getirir. */
function coerce(def: ResourceDef, column: string, value: any): any {
  if (value === undefined) return undefined;
  if (value === null) return null;

  const colDef = def.columns.find((c) => c.name === column);
  if (!colDef) return undefined;

  if (def.jsonColumns.includes(column)) {
    return typeof value === 'string' ? value : JSON.stringify(value);
  }

  switch (colDef.type) {
    case 'tinyint':
      return value === true || value === 1 || value === '1' ? 1 : 0;
    case 'datetime': {
      if (value instanceof Date) return value;
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    case 'decimal':
    case 'bigint':
    case 'int': {
      if (value === '') return null;
      const n = Number(value);
      return Number.isNaN(n) ? null : n;
    }
    default:
      return typeof value === 'object' ? JSON.stringify(value) : value;
  }
}

/** Gövdedeki alanları tablonun kolonlarına göre filtreler. */
function pickColumns(def: ResourceDef, body: any, opts: { partial: boolean }): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(body || {})) {
    if (key === def.primaryKey) continue;
    const col = def.columns.find((c) => c.name === key);
    if (!col) continue;
    const coerced = coerce(def, key, value);
    if (coerced === undefined) continue;
    out[key] = coerced;
  }
  if (!opts.partial) {
    // INSERT: gönderilmeyen kolonlar için NULL/DEFAULT bırak.
    for (const col of def.columns) {
      if (col.name === def.primaryKey) continue;
      if (!(col.name in out) && def.jsonColumns.includes(col.name)) out[col.name] = null;
    }
  }
  return out;
}

function insertSql(def: ResourceDef, data: Record<string, any>): { sql: string; params: any[] } {
  const keys = Object.keys(data);
  if (!keys.length) {
    return { sql: `INSERT INTO \`${def.table}\` () VALUES ()`, params: [] };
  }
  const cols = keys.map((k) => `\`${k}\``).join(', ');
  const marks = keys.map(() => '?').join(', ');
  return {
    sql: `INSERT INTO \`${def.table}\` (${cols}) VALUES (${marks})`,
    params: keys.map((k) => data[k]),
  };
}

/**
 * pickColumns birincil anahtarı gövdeden ayıklar; INSERT öncesi burada
 * tipi doğrulanmış biçimde geri eklenir. Boş bırakılırsa AUTO_INCREMENT devreye girer.
 */
function withPrimaryKey(def: ResourceDef, data: Record<string, any>, pk: any): Record<string, any> {
  if (pk === undefined || pk === null || pk === '') return data;
  const coerced = coerce(def, def.primaryKey, pk);
  if (coerced === undefined || coerced === null) return data;
  return { ...data, [def.primaryKey]: coerced };
}

function updateSql(def: ResourceDef, data: Record<string, any>, whereSql: string): { sql: string; params: any[] } {
  const keys = Object.keys(data);
  const setSql = keys.map((k) => `\`${k}\` = ?`).join(', ');
  return {
    sql: `UPDATE \`${def.table}\` SET ${setSql} ${whereSql}`,
    params: [...keys.map((k) => data[k])],
  };
}

/* ------------------------------------------------------------------ */
/* Canlı güncelleme (SSE)                                              */
/* ------------------------------------------------------------------ */

type SseClient = { id: number; res: Response };

const sseClients = new Set<SseClient>();
let sseSeq = 0;

export function broadcast(resource: string, action: 'create' | 'update' | 'delete' | 'seed' | 'refresh', ids: (number | string)[] = []) {
  const payload = `data: ${JSON.stringify({ resource, action, ids, at: Date.now() })}\n\n`;
  for (const client of sseClients) {
    try {
      client.res.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

export function sseHandler(req: Request, res: Response) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(`retry: 3000\n\n`);
  res.write(`data: ${JSON.stringify({ resource: '*', action: 'refresh', ids: [], at: Date.now() })}\n\n`);

  const client: SseClient = { id: ++sseSeq, res };
  sseClients.add(client);

  const ping = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      /* kapanmış bağlantı */
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(ping);
    sseClients.delete(client);
  });
}

/* ------------------------------------------------------------------ */
/* Referans kontrolü (silme güvenliği)                                 */
/* ------------------------------------------------------------------ */

async function assertNoDependents(resource: string, id: number | string) {
  const meta = getMeta(resource);
  for (const guard of meta.guards || []) {
    const row = await queryOne<{ n: number }>(
      `SELECT COUNT(*) AS n FROM \`${guard.table}\` WHERE \`${guard.column}\` = ? LIMIT 1`,
      [id]
    );
    if (row && Number((row as any).n) > 0) {
      throw new HttpError(409, guard.message);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Sorgu oluşturma                                                     */
/* ------------------------------------------------------------------ */

interface ListQuery {
  where: Record<string, any>;
  search?: string;
  orderBy?: string;
  orderDir?: 'ASC' | 'DESC';
  limit?: number;
  offset?: number;
  select?: string[];
  countOnly?: boolean;
}

const FILTER_OPS = [
  'eq',
  'ne',
  'gt',
  'gte',
  'lt',
  'lte',
  'like',
  'startsWith',
  'endsWith',
  'contains',
  'equalsIgnoreCase',
  'isNull',
  'notNull',
] as const;

type FilterOp = (typeof FILTER_OPS)[number];

function isFilterExpr(value: unknown): value is { op: FilterOp; value?: any } {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date) &&
    typeof (value as any).op === 'string' &&
    (FILTER_OPS as readonly string[]).includes((value as any).op)
  );
}

function buildWhere(def: ResourceDef, resource: string, filters: Record<string, any>): { sql: string; params: any[] } {
  const clauses: string[] = [];
  const params: any[] = [];

  for (const [key, raw] of Object.entries(filters || {})) {
    const parts = key.split('+'); // bileşik indeks: [employeeId+date]
    for (const part of parts) {
      if (!def.columns.some((c) => c.name === part)) {
        throw new HttpError(400, `Geçersiz filtre kolonu: ${part} (${resource})`);
      }
    }
    if (isFilterExpr(raw)) {
      if (parts.length > 1) throw new HttpError(400, `Bileşik filtrede operatör kullanılamaz: ${key}`);
      if (raw.op === 'isNull') {
        clauses.push(`\`${parts[0]}\` IS NULL`);
        continue;
      }
      if (raw.op === 'notNull') {
        clauses.push(`\`${parts[0]}\` IS NOT NULL`);
        continue;
      }
      const col = `\`${parts[0]}\``;
      const value = coerce(def, parts[0], raw.value);
      switch (raw.op) {
        case 'eq':
          clauses.push(`${col} = ?`);
          params.push(value);
          break;
        case 'ne':
          clauses.push(`${col} <> ?`);
          params.push(value);
          break;
        case 'gt':
          clauses.push(`${col} > ?`);
          params.push(value);
          break;
        case 'gte':
          clauses.push(`${col} >= ?`);
          params.push(value);
          break;
        case 'lt':
          clauses.push(`${col} < ?`);
          params.push(value);
          break;
        case 'lte':
          clauses.push(`${col} <= ?`);
          params.push(value);
          break;
        case 'like':
          clauses.push(`${col} LIKE ?`);
          params.push(String(raw.value ?? ''));
          break;
        case 'startsWith':
          clauses.push(`${col} LIKE ?`);
          params.push(`${String(raw.value ?? '').replace(/[%_\\]/g, '\\$&')}%`);
          break;
        case 'endsWith':
          clauses.push(`${col} LIKE ?`);
          params.push(`%${String(raw.value ?? '').replace(/[%_\\]/g, '\\$&')}`);
          break;
        case 'contains':
          clauses.push(`${col} LIKE ?`);
          params.push(`%${String(raw.value ?? '').replace(/[%_\\]/g, '\\$&')}%`);
          break;
        case 'equalsIgnoreCase':
          clauses.push(`LOWER(${col}) = LOWER(?)`);
          params.push(value);
          break;
      }
      continue;
    }
    if (raw === null) {
      clauses.push(parts.map((p) => `\`${p}\` IS NULL`).join(' AND '));
    } else if (Array.isArray(raw)) {
      if (!raw.length) {
        clauses.push('1 = 0');
        continue;
      }
      if (parts.length > 1) {
        // Bileşik anahtar: dizi, kolon sırasına göre konumsal değerlerdir ([employeeId+date] → [id, tarih]).
        if (raw.length !== parts.length) {
          throw new HttpError(400, `Bileşik filtre ${parts.length} değer bekliyor: ${key}`);
        }
        clauses.push(`(${parts.map((p) => `\`${p}\` = ?`).join(' AND ')})`);
        for (let i = 0; i < parts.length; i++) params.push(coerce(def, parts[i], raw[i]));
      } else {
        clauses.push(`(\`${parts[0]}\` IN (${raw.map(() => '?').join(', ')}))`);
        for (const v of raw) params.push(coerce(def, parts[0], v));
      }
    } else {
      const coerced = coerce(def, parts[0], raw);
      const cmp = parts.length > 1 ? parts.map((p, i) => `\`${p}\` = ?`) : null;
      if (cmp) {
        clauses.push(`(${cmp.join(' AND ')})`);
        for (let i = 0; i < parts.length; i++) params.push(coerce(def, parts[i], raw));
      } else {
        clauses.push(`\`${parts[0]}\` = ?`);
        params.push(coerced);
      }
    }
  }

  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

function buildSearch(def: ResourceDef, resource: string, term: string): { sql: string; params: any[] } {
  const cols = getMeta(resource).searchable.filter((c) => def.columns.some((col) => col.name === c));
  if (!cols.length) return { sql: '', params: [] };
  const like = `%${term}%`;
  return {
    sql: `(${cols.map((c) => `\`${c}\` LIKE ?`).join(' OR ')})`,
    params: cols.map(() => like),
  };
}

async function listRows(resource: string, def: ResourceDef, q: ListQuery) {
  const where = buildWhere(def, resource, q.where);
  const clauses: string[] = [];
  if (where.sql) clauses.push(where.sql.replace(/^WHERE /, ''));
  const params = [...where.params];

  if (q.search && q.search.trim()) {
    const s = buildSearch(def, resource, q.search.trim());
    if (s.sql) {
      clauses.push(s.sql);
      params.push(...s.params);
    }
  }

  const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  if (q.countOnly) {
    const row = await queryOne<{ n: number }>(`SELECT COUNT(*) AS n FROM \`${def.table}\` ${whereSql}`, params);
    return Number((row as any)?.n || 0);
  }

  let orderSql = '';
  const meta = getMeta(resource);
  const requestedOrder = q.orderBy && def.columns.some((c) => c.name === q.orderBy) ? q.orderBy : null;
  if (requestedOrder) {
    orderSql = `ORDER BY \`${requestedOrder}\` ${q.orderDir === 'DESC' ? 'DESC' : 'ASC'}`;
  } else if (meta.defaultOrder) {
    const parts = meta.defaultOrder.split(',').map((p) => {
      const [col, dir] = p.trim().split(/\s+/);
      return def.columns.some((c) => c.name === col) ? `\`${col}\` ${dir || 'ASC'}` : null;
    });
    const valid = parts.filter(Boolean);
    if (valid.length) orderSql = `ORDER BY ${valid.join(', ')}`;
  }

  let selectSql = '*';
  if (q.select && q.select.length) {
    const cols = q.select.filter((c) => def.columns.some((col) => col.name === c));
    if (cols.length) selectSql = cols.map((c) => `\`${c}\``).join(', ');
  }

  let limitSql = '';
  if (q.limit !== undefined && Number.isFinite(q.limit)) {
    limitSql = `LIMIT ${Math.max(0, Math.floor(q.limit))}`;
    if (q.offset !== undefined && Number.isFinite(q.offset)) limitSql += ` OFFSET ${Math.max(0, Math.floor(q.offset))}`;
  } else if (q.offset !== undefined && Number.isFinite(q.offset)) {
    limitSql = `LIMIT 18446744073709551615 OFFSET ${Math.max(0, Math.floor(q.offset))}`;
  }

  return query(`SELECT ${selectSql} FROM \`${def.table}\` ${whereSql} ${orderSql} ${limitSql}`, params);
}

function parseListQuery(req: Request): ListQuery {
  const q: ListQuery = { where: {} };
  if (typeof req.query.where === 'string' && req.query.where.trim()) {
    try {
      q.where = JSON.parse(req.query.where);
    } catch {
      throw new HttpError(400, 'where parametresi geçerli JSON değil.');
    }
  } else if (req.query.where && typeof req.query.where === 'object') {
    q.where = req.query.where as Record<string, any>;
  }
  if (typeof req.query.search === 'string') q.search = req.query.search;
  if (typeof req.query.orderBy === 'string') q.orderBy = req.query.orderBy;
  if (typeof req.query.orderDir === 'string') q.orderDir = req.query.orderDir.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
  if (req.query.limit !== undefined) q.limit = Number(req.query.limit);
  if (req.query.offset !== undefined) q.offset = Number(req.query.offset);
  if (typeof req.query.select === 'string') q.select = req.query.select.split(',').map((s) => s.trim()).filter(Boolean);
  if (req.query.count === '1' || req.query.count === 'true') q.countOnly = true;
  return q;
}

/* ------------------------------------------------------------------ */
/* Router                                                              */
/* ------------------------------------------------------------------ */

export function createApiRouter(): Router {
  const router = express.Router();

  router.get('/meta/resources', (_req, res) => {
    res.json({
      resources: RESOURCE_NAMES,
      meta: RESOURCE_NAMES.reduce<Record<string, any>>((acc, name) => {
        const def = getDef(name)!;
        acc[name] = {
          primaryKey: def.primaryKey,
          columns: def.columns.map((c) => c.name),
          jsonColumns: def.jsonColumns,
          searchable: getMeta(name).searchable,
        };
        return acc;
      }, {}),
    });
  });

  /* ---------------------------------------------------------------- */
  /* Demo verilerine sıfırlama: tüm tablolar boşaltılıp yeniden seed.  */
  /* ---------------------------------------------------------------- */
  router.post('/ops/reseed', async (_req, res, next) => {
    try {
      const result = await reseed();
      for (const resource of RESOURCE_NAMES) broadcast(resource, 'seed', []);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  });

  router.get('/events', sseHandler);

  /* ---------------------------------------------------------------- */
  /* Atomik toplu yazma: birden çok tabloya dokunan işlemler          */
  /* tek bir MySQL transaction'ı içinde uygulanır.                    */
  /* ---------------------------------------------------------------- */
  interface Mutation {
    op: 'insert' | 'insertMany' | 'update' | 'updateWhere' | 'delete' | 'deleteWhere' | 'clear';
    resource: string;
    id?: number | string;
    where?: Record<string, any>;
    data?: Record<string, any>;
    rows?: Record<string, any>[];
  }

  router.post('/ops/commit', async (req, res, next) => {
    try {
      const mutations: Mutation[] = Array.isArray(req.body?.mutations) ? req.body.mutations : [];
      if (!mutations.length) throw new HttpError(400, 'Uygulanacak işlem bulunamadı.');
      // Yedek geri yükleme gibi tüm tabloları boşaltıp yeniden dolduran işlemlerde
      // yabancı anahtar sırası gözetilemez; bu bayrak ile denetim işlem boyunca kapatılır.
      const disableFkChecks = req.body?.disableFkChecks === true;

      const touched = new Set<string>();
      const results: any[] = [];

      await withTransaction(async (conn) => {
        if (disableFkChecks) await conn.query('SET FOREIGN_KEY_CHECKS = 0');
        try {
          for (const m of mutations) {
            const def = getDef(m.resource);
            if (!def) throw new HttpError(400, `Bilinmeyen kaynak: ${m.resource}`);
            touched.add(m.resource);

            switch (m.op) {
              case 'insert': {
                const { sql, params } = insertSql(def, pickColumns(def, m.data || {}, { partial: false }));
                const [r] = await conn.query(sql, params);
                results.push({ op: m.op, resource: m.resource, id: (r as any)?.insertId });
                break;
              }
              case 'insertMany': {
                const rows = Array.isArray(m.rows) ? m.rows : [];
                const ids: any[] = [];
                for (const row of rows) {
                  const { sql, params } = insertSql(def, pickColumns(def, row, { partial: false }));
                  const [r] = await conn.query(sql, params);
                  ids.push((r as any)?.insertId);
                }
                results.push({ op: m.op, resource: m.resource, ids });
                break;
              }
              case 'update': {
                if (m.id === undefined || m.id === null) throw new HttpError(400, 'update için id gerekli.');
                const { sql, params } = updateSql(
                  def,
                  pickColumns(def, m.data || {}, { partial: true }),
                  `WHERE \`${def.primaryKey}\` = ?`,
                );
                const [r] = await conn.query(sql, [...params, coerce(def, def.primaryKey, m.id)]);
                results.push({ op: m.op, resource: m.resource, changes: (r as any)?.affectedRows ?? 0 });
                break;
              }
              case 'updateWhere': {
                const where = buildWhere(def, m.resource, m.where || {});
                if (!where.sql) throw new HttpError(400, 'updateWhere için filtre gerekli.');
                const { sql, params } = updateSql(def, pickColumns(def, m.data || {}, { partial: true }), where.sql);
                const [r] = await conn.query(sql, [...params, ...where.params]);
                results.push({ op: m.op, resource: m.resource, changes: (r as any)?.affectedRows ?? 0 });
                break;
              }
              case 'delete': {
                if (m.id === undefined || m.id === null) throw new HttpError(400, 'delete için id gerekli.');
                await assertNoDependents(m.resource, m.id);
                const [r] = await conn.query(`DELETE FROM \`${def.table}\` WHERE \`${def.primaryKey}\` = ?`, [
                  coerce(def, def.primaryKey, m.id),
                ]);
                results.push({ op: m.op, resource: m.resource, deleted: (r as any)?.affectedRows ?? 0 });
                break;
              }
              case 'deleteWhere': {
                const where = buildWhere(def, m.resource, m.where || {});
                if (!where.sql) throw new HttpError(400, 'deleteWhere için filtre gerekli.');
                const [r] = await conn.query(`DELETE FROM \`${def.table}\` ${where.sql}`, where.params);
                results.push({ op: m.op, resource: m.resource, deleted: (r as any)?.affectedRows ?? 0 });
                break;
              }
              case 'clear': {
                if (!disableFkChecks) await conn.query('SET FOREIGN_KEY_CHECKS = 0');
                try {
                  const [r] = await conn.query(`DELETE FROM \`${def.table}\``);
                  results.push({ op: m.op, resource: m.resource, deleted: (r as any)?.affectedRows ?? 0 });
                } finally {
                  if (!disableFkChecks) await conn.query('SET FOREIGN_KEY_CHECKS = 1');
                }
                break;
              }
              default:
                throw new HttpError(400, `Desteklenmeyen işlem: ${(m as any).op}`);
            }
          }
        } finally {
          if (disableFkChecks) await conn.query('SET FOREIGN_KEY_CHECKS = 1');
        }
      });

      for (const resource of touched) broadcast(resource, 'update', []);
      res.json({ data: { results } });
    } catch (err) {
      next(err);
    }
  });

  // ---- Liste / sayım ----
  router.get('/:resource', async (req, res, next) => {
    try {
      const resource = req.params.resource;
      const def = getDef(resource);
      if (!def) throw new HttpError(404, `Bilinmeyen kaynak: ${resource}`);
      const q = parseListQuery(req);
      const result = await listRows(resource, def, q);
      if (q.countOnly) res.json({ count: result });
      else res.json({ data: result });
    } catch (err) {
      next(err);
    }
  });

  // ---- Tek kayıt ----
  router.get('/:resource/:id', async (req, res, next) => {
    try {
      const def = getDef(req.params.resource);
      if (!def) throw new HttpError(404, `Bilinmeyen kaynak: ${req.params.resource}`);
      const row = await queryOne(
        `SELECT * FROM \`${def.table}\` WHERE \`${def.primaryKey}\` = ?`,
        [coerce(def, def.primaryKey, req.params.id)]
      );
      if (!row) throw new HttpError(404, 'Kayıt bulunamadı.');
      res.json({ data: row });
    } catch (err) {
      next(err);
    }
  });

  // ---- Oluştur (tek veya toplu) ----
  router.post('/:resource', async (req, res, next) => {
    try {
      const resource = req.params.resource;
      const def = getDef(resource);
      if (!def) throw new HttpError(404, `Bilinmeyen kaynak: ${resource}`);

      const body = req.body;
      const rows: any[] = Array.isArray(body) ? body : [body];
      if (!rows.length) throw new HttpError(400, 'Eklenecek kayıt yok.');

      const ids = await withTransaction(async (conn) => {
        const created: any[] = [];
        for (const row of rows) {
          const data = withPrimaryKey(def, pickColumns(def, row, { partial: false }), row?.[def.primaryKey]);
          if (def.timestamps.includes('createdAt') && !data.createdAt) data.createdAt = new Date();
          if (def.timestamps.includes('updatedAt') && !data.updatedAt) data.updatedAt = new Date();
          if (!Object.keys(data).length) {
            const [r] = await conn.query(`INSERT INTO \`${def.table}\` () VALUES ()`);
            created.push((r as any).insertId);
            continue;
          }
          const { sql, params } = insertSql(def, data);
          const [r] = await conn.query(sql, params);
          created.push(data[def.primaryKey] ?? (r as any).insertId);
        }
        return created;
      });

      broadcast(resource, 'create', ids);
      res.status(201).json({ data: Array.isArray(body) ? ids : ids[0], ids });
    } catch (err) {
      next(err);
    }
  });

  // ---- Kısmi güncelleme ----
  router.patch('/:resource/:id', async (req, res, next) => {
    try {
      const resource = req.params.resource;
      const def = getDef(resource);
      if (!def) throw new HttpError(404, `Bilinmeyen kaynak: ${resource}`);

      const data = pickColumns(def, req.body, { partial: true });
      if (def.timestamps.includes('updatedAt')) data.updatedAt = new Date();
      if (!Object.keys(data).length) throw new HttpError(400, 'Güncellenecek alan yok.');

      const { sql, params } = updateSql(def, data, `WHERE \`${def.primaryKey}\` = ?`);
      const result = await execute(sql, [...params, coerce(def, def.primaryKey, req.params.id)]);
      if (!result.affectedRows) throw new HttpError(404, 'Kayıt bulunamadı.');

      broadcast(resource, 'update', [req.params.id]);
      res.json({ data: { id: req.params.id, changes: result.affectedRows } });
    } catch (err) {
      next(err);
    }
  });

  // ---- Tam değiştirme (Dexie put karşılığı) ----
  router.put('/:resource/:id', async (req, res, next) => {
    try {
      const resource = req.params.resource;
      const def = getDef(resource);
      if (!def) throw new HttpError(404, `Bilinmeyen kaynak: ${resource}`);

      const id = coerce(def, def.primaryKey, req.params.id);
      const existing = await queryOne(`SELECT \`${def.primaryKey}\` FROM \`${def.table}\` WHERE \`${def.primaryKey}\` = ?`, [id]);

      const data = pickColumns(def, req.body, { partial: true });
      if (def.timestamps.includes('updatedAt')) data.updatedAt = new Date();

      if (existing) {
        if (!Object.keys(data).length) throw new HttpError(400, 'Güncellenecek alan yok.');
        const { sql, params } = updateSql(def, data, `WHERE \`${def.primaryKey}\` = ?`);
        await execute(sql, [...params, id]);
        broadcast(resource, 'update', [req.params.id]);
        res.json({ data: { id: req.params.id, created: false } });
      } else {
        const insertData = withPrimaryKey(
          def,
          { ...pickColumns(def, req.body, { partial: false }), ...data },
          id
        );
        if (def.timestamps.includes('createdAt') && !insertData.createdAt) insertData.createdAt = new Date();
        const { sql, params } = insertSql(def, insertData);
        await execute(sql, params);
        broadcast(resource, 'create', [id]);
        res.status(201).json({ data: { id, created: true } });
      }
    } catch (err) {
      next(err);
    }
  });

  // ---- Toplu ekleme / güncelleme ----
  router.post('/:resource/bulk', async (req, res, next) => {
    try {
      const resource = req.params.resource;
      const def = getDef(resource);
      if (!def) throw new HttpError(404, `Bilinmeyen kaynak: ${resource}`);

      const body = req.body as { mode?: 'insert' | 'upsert'; rows?: any[] };
      const rows = Array.isArray(body?.rows) ? body.rows : Array.isArray(body) ? (body as any) : null;
      if (!rows || !rows.length) throw new HttpError(400, 'Toplu işlem için kayıt listesi gerekli.');

      const ids = await withTransaction(async (conn) => {
        const created: any[] = [];
        for (const row of rows) {
          const pk = row?.[def.primaryKey];
          const data = withPrimaryKey(def, pickColumns(def, row, { partial: false }), pk);
          if (def.timestamps.includes('createdAt') && !data.createdAt) data.createdAt = new Date();
          if (def.timestamps.includes('updatedAt') && !data.updatedAt) data.updatedAt = new Date();

          if (body?.mode === 'upsert' && pk !== undefined && pk !== null && pk !== '') {
            const keys = Object.keys(data).filter((k) => k !== def.primaryKey);
            if (keys.length) {
              const { sql, params } = updateSql(def, data, `WHERE \`${def.primaryKey}\` = ?`);
              const [r] = await conn.query(sql, [...params, coerce(def, def.primaryKey, pk)]);
              if ((r as any).affectedRows) {
                created.push(pk);
                continue;
              }
            }
          }
          const { sql, params } = insertSql(def, data);
          const [r] = await conn.query(sql, params);
          created.push(data[def.primaryKey] ?? (r as any).insertId);
        }
        return created;
      });

      broadcast(resource, 'create', ids);
      res.status(201).json({ data: ids, ids });
    } catch (err) {
      next(err);
    }
  });

  // ---- Sil ----
  router.delete('/:resource/:id', async (req, res, next) => {
    try {
      const resource = req.params.resource;
      const def = getDef(resource);
      if (!def) throw new HttpError(404, `Bilinmeyen kaynak: ${resource}`);

      const id = coerce(def, def.primaryKey, req.params.id);
      const hasGuards = Boolean((getMeta(resource).guards || []).length);
      if (hasGuards) await assertNoDependents(resource, id);

      const result = await execute(`DELETE FROM \`${def.table}\` WHERE \`${def.primaryKey}\` = ?`, [id]);
      if (!result.affectedRows) throw new HttpError(404, 'Kayıt bulunamadı.');

      broadcast(resource, 'delete', [req.params.id]);
      res.json({ data: { id: req.params.id, deleted: result.affectedRows } });
    } catch (err) {
      next(err);
    }
  });

  // ---- Toplu sil ----
  router.post('/:resource/bulk-delete', async (req, res, next) => {
    try {
      const resource = req.params.resource;
      const def = getDef(resource);
      if (!def) throw new HttpError(404, `Bilinmeyen kaynak: ${resource}`);

      const ids: any[] = req.body?.ids || [];
      if (!ids.length) throw new HttpError(400, 'Silinecek kayıt yok.');

      const hasGuards = Boolean((getMeta(resource).guards || []).length);
      if (hasGuards) {
        for (const id of ids) await assertNoDependents(resource, coerce(def, def.primaryKey, id));
      }

      const marks = ids.map(() => '?').join(', ');
      const result = await execute(
        `DELETE FROM \`${def.table}\` WHERE \`${def.primaryKey}\` IN (${marks})`,
        ids.map((id) => coerce(def, def.primaryKey, id))
      );

      broadcast(resource, 'delete', ids);
      res.json({ data: { deleted: result.affectedRows } });
    } catch (err) {
      next(err);
    }
  });

  // ---- Koşullu toplu silme (Dexie where().delete() karşılığı) ----
  router.post('/:resource/delete-where', async (req, res, next) => {
    try {
      const resource = req.params.resource;
      const def = getDef(resource);
      if (!def) throw new HttpError(404, `Bilinmeyen kaynak: ${resource}`);

      const where = buildWhere(def, resource, req.body?.where || {});
      if (!where.sql) throw new HttpError(400, 'Koşulsuz silme engellendi. Filtre gerekli.');

      const result = await execute(`DELETE FROM \`${def.table}\` ${where.sql}`, where.params);
      broadcast(resource, 'delete', []);
      res.json({ data: { deleted: result.affectedRows } });
    } catch (err) {
      next(err);
    }
  });

  // Kaynağı tamamen boşaltır (fabrika sıfırlama işlemleri için).
  // FK kısıtları geçici olarak devre dışı bırakılır; bağlantı havuza dönerken geri açılır.
  router.post('/:resource/clear', async (req, res, next) => {
    try {
      const resource = req.params.resource;
      const def = getDef(resource);
      if (!def) throw new HttpError(404, `Bilinmeyen kaynak: ${resource}`);

      const deleted = await withTransaction(async (conn) => {
        await conn.query('SET FOREIGN_KEY_CHECKS = 0');
        try {
          const [result] = await conn.query(`DELETE FROM \`${def.table}\``);
          return (result as any)?.affectedRows ?? 0;
        } finally {
          await conn.query('SET FOREIGN_KEY_CHECKS = 1');
        }
      });

      broadcast(resource, 'delete', []);
      res.json({ data: { deleted } });
    } catch (err) {
      next(err);
    }
  });

  // ---- Hata yönetimi ----
  router.use((err: any, _req: Request, res: Response, _next: any) => {
    const status = err instanceof HttpError ? err.status : 500;
    if (status >= 500) console.error('[API]', err);
    res.status(status).json({
      error: err?.message || 'Sunucu hatası',
      code: err?.code,
    });
  });

  return router;
}
