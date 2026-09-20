import express, { type Request, type Response, type Router } from 'express';
import { execute, query, queryOne, withTransaction } from './db.js';
import { getDef, getMeta, RESOURCE_NAMES } from './registry.js';
import { reseed } from './seed.js';
import type { ResourceDef } from './columns.js';
import type { AppModule, PermissionAction } from '../src/types.js';
import {
  actionForMethod,
  can,
  clearSessionCookie,
  clientIp,
  createSession,
  destroySession,
  destroyUserSessions,
  invalidateUserCache,
  MIN_PASSWORD_LENGTH,
  rateLimit,
  requestToken,
  requireAuth,
  requireSuperAdmin,
  resetRateLimit,
  resolveSession,
  setSessionCookie,
  setUserPassword,
  stopImpersonation,
  validatePasswordStrength,
  verifyPassword,
  type AuthContext,
} from './auth.js';
import { writeAudit } from './audit.js';

/* ------------------------------------------------------------------ */
/* Yardımcılar                                                         */
/* ------------------------------------------------------------------ */

class HttpError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
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

/**
 * Gövdedeki alanları tablonun kolonlarına göre filtreler.
 * `protectedColumns` (ör. passwordHash) istemci gövdesinden hiçbir zaman alınmaz.
 */
function pickColumns(
  resource: string,
  def: ResourceDef,
  body: any,
  opts: { partial: boolean },
): Record<string, any> {
  const protectedColumns = new Set(getMeta(resource).protectedColumns || []);
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(body || {})) {
    if (key === def.primaryKey) continue;
    if (protectedColumns.has(key)) continue;
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
      if (protectedColumns.has(col.name)) continue;
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

/** Gizli kolonları (parola türevleri) istemciye göndermeden önce ayıklar. */
function stripHidden(resource: string, row: any): any {
  const hidden = getMeta(resource).hidden;
  if (!row || !hidden?.length) return row;
  const copy: Record<string, any> = { ...row };
  for (const col of hidden) delete copy[col];
  return copy;
}

function stripHiddenRows(resource: string, rows: any[]): any[] {
  const hidden = getMeta(resource).hidden;
  if (!hidden?.length) return rows;
  return rows.map((row) => stripHidden(resource, row));
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

  // Beyaz liste: şemada tanımlı kolonlar dışındaki (eski kurulumlardan kalan
  // pinCode/sessionToken gibi) kolonlar hiçbir zaman dışarı çıkmaz.
  let selectSql = def.columns.map((c) => `\`${c.name}\``).join(', ');
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
/* Yetki yardımcıları                                                  */
/* ------------------------------------------------------------------ */

/** Kaynak yazma işlemlerinde kullanılan modül/eylem denetimi. */
function assertResourcePermission(resource: string, method: string, auth: AuthContext | undefined): void {
  const meta = getMeta(resource);
  const action = actionForMethod(method);
  // Salt-okunur kaynaklar (ör. denetim izi) okunabilir; yazma yolları kapalıdır.
  if (meta.readOnly && action !== 'view') {
    throw new HttpError(403, 'Bu kaynak yalnızca okunabilir; doğrudan yazma kapalıdır.', 'READ_ONLY_RESOURCE');
  }
  if (action === 'view' && meta.readAuthOnly) return;
  if (!can(auth?.role || null, meta.module, action)) {
    throw new HttpError(
      403,
      `"${auth?.user.fullName || 'Kullanıcı'}" kullanıcısının "${meta.module.toUpperCase()}" modülünde "${action.toUpperCase()}" yetkisi yok.`,
      'FORBIDDEN',
    );
  }
}

/** Tüm tabloyu boşaltmak yıkıcı bir yönetici işlemidir. */
function assertSuperAdmin(auth: AuthContext | undefined, message: string): void {
  const isSuper = Boolean(auth?.role?.code === 'super_admin' || auth?.user.roleCode === 'super_admin');
  if (!isSuper) throw new HttpError(403, message, 'SUPER_ADMIN_REQUIRED');
}

const AUDIT_ACTIONS = new Set([
  'create',
  'update',
  'delete',
  'login',
  'logout',
  'export',
  'approve',
  'status_change',
  'permission_change',
  'system',
]);

function auditActionForMethod(method: string): string {
  switch (method.toUpperCase()) {
    case 'POST':
      return 'create';
    case 'PUT':
    case 'PATCH':
      return 'update';
    case 'DELETE':
      return 'delete';
    default:
      return 'update';
  }
}

/** users/roles kayıtlarındaki değişiklikleri sunucu tarafında denetim izine yazar. */
function auditSecurityMutations(req: Request, res: Response, next: any) {
  const resource = String(req.params.resource || '');
  if (!['users', 'roles'].includes(resource) || req.method.toUpperCase() === 'GET') {
    next();
    return;
  }
  res.on('finish', () => {
    if (res.statusCode < 200 || res.statusCode >= 300) return;
    const id = req.params.id ? ` (id: ${req.params.id})` : '';
    void writeAudit(
      {
        action: auditActionForMethod(req.method),
        module: 'users',
        entityId: req.params.id ?? null,
        description: `${resource === 'users' ? 'Kullanıcı' : 'Rol'} kaydı ${auditActionForMethod(req.method) === 'create' ? 'oluşturuldu' : auditActionForMethod(req.method) === 'update' ? 'güncellendi' : 'silindi'}${id}`,
        details: req.body && typeof req.body === 'object' ? `Alanlar: ${Object.keys(req.body).filter((k) => k !== 'password').join(', ') || '-'}` : null,
      },
      { auth: req.auth, ip: clientIp(req) },
    );
  });
  next();
}

/* ------------------------------------------------------------------ */
/* Router                                                              */
/* ------------------------------------------------------------------ */

export function createApiRouter(): Router {
  const router = express.Router();

  /* ---------------------------------------------------------------- */
  /* Kimlik doğrulama uçları (oturum gerektirmeyen tek uç: /auth/login) */
  /* ---------------------------------------------------------------- */

  router.post('/auth/login', async (req, res, next) => {
    try {
      const ip = clientIp(req);
      const username = String(req.body?.username ?? '').trim().toLowerCase();
      const password = String(req.body?.password ?? '');
      if (!username || !password) {
        throw new HttpError(400, 'Kullanıcı adı ve parola zorunludur.', 'MISSING_CREDENTIALS');
      }

      const ipLimit = rateLimit(`login:ip:${ip}`, 30, 15 * 60 * 1000);
      if (!ipLimit.allowed) {
        throw new HttpError(429, `Çok fazla giriş denemesi yapıldı. ${ipLimit.retryAfterSec} saniye sonra tekrar deneyin.`, 'RATE_LIMITED');
      }
      const userLimit = rateLimit(`login:user:${ip}:${username}`, 8, 15 * 60 * 1000);
      if (!userLimit.allowed) {
        await writeAudit(
          { action: 'login', module: 'auth', description: `Hız sınırına takılan giriş denemesi: "${username}"`, details: `IP: ${ip}` },
          { ip },
        );
        throw new HttpError(429, `Çok fazla hatalı deneme. ${userLimit.retryAfterSec} saniye sonra tekrar deneyin.`, 'RATE_LIMITED');
      }

      const invalid = () => new HttpError(401, 'Kullanıcı adı veya parola hatalı.', 'INVALID_CREDENTIALS');
      const row = await queryOne<any>(
        'SELECT `id`, `username`, `fullName`, `status`, `passwordHash`, `passwordSalt` FROM `users` WHERE `username` = ? LIMIT 1',
        [username],
      );

      if (!row) {
        await writeAudit(
          { action: 'login', module: 'auth', description: `Başarısız giriş denemesi: "${username}" (kullanıcı bulunamadı)`, details: `IP: ${ip}` },
          { ip },
        );
        throw invalid();
      }

      let valid = false;
      let needsRehash = false;
      if (row.passwordHash && row.passwordSalt) {
        const result = await verifyPassword(password, String(row.passwordSalt), String(row.passwordHash));
        valid = result.valid;
        needsRehash = result.needsRehash;
      }

      if (!valid) {
        await writeAudit(
          { action: 'login', module: 'auth', description: `Başarısız giriş denemesi: "${row.fullName || username}" (hatalı parola)`, details: `IP: ${ip}` },
          { ip },
        );
        throw invalid();
      }

      if (row.status !== 'active') {
        await writeAudit(
          { action: 'login', module: 'auth', entityId: row.id, description: `Pasif hesap giriş denemesi: "${row.fullName || username}" (${row.status})`, details: `IP: ${ip}` },
          { ip },
        );
        throw new HttpError(
          403,
          `Hesabınız ${row.status === 'suspended' ? 'askıya alınmıştır' : 'pasif durumdadır'}. Lütfen sistem yöneticisi ile görüşün.`,
          'ACCOUNT_INACTIVE',
        );
      }

      // Eski sha256 kaydı başarılı girişte scrypt'e yükseltilir.
      if (needsRehash) await setUserPassword(Number(row.id), password);

      resetRateLimit(`login:user:${ip}:${username}`);
      const session = createSession({ userId: Number(row.id), ip, userAgent: req.headers['user-agent'] });
      setSessionCookie(res, session.token);
      await execute('UPDATE `users` SET `lastLoginAt` = NOW() WHERE `id` = ?', [row.id]);

      const context = await resolveSession(session.token);
      await writeAudit(
        {
          action: 'login',
          module: 'auth',
          entityId: row.id,
          description: `Oturum açıldı: ${row.fullName || username}`,
          details: needsRehash ? 'Parola kaydı güvenli biçime (scrypt) yükseltildi.' : null,
        },
        { auth: context, ip },
      );

      // Zayıf (kısa) parolalarla giriş yapan kullanıcıya arayüzde uyarı gösterilir.
      const passwordWarning =
        password.length < MIN_PASSWORD_LENGTH
          ? `Parolanız ${password.length} karakter. Güvenlik için en az ${MIN_PASSWORD_LENGTH} karakterlik yeni bir parola belirleyin.`
          : null;

      res.json({
        data: {
          user: context?.user,
          role: context?.role,
          expiresAt: session.expiresAt,
          impersonatedBy: null,
          passwordWarning,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/auth/logout', requireAuth, async (req, res, next) => {
    try {
      const token = requestToken(req);
      await writeAudit(
        { action: 'logout', module: 'auth', entityId: req.auth?.user.id, description: `Oturum kapatıldı: ${req.auth?.user.fullName}` },
        { auth: req.auth, ip: clientIp(req) },
      );
      if (token) destroySession(token);
      clearSessionCookie(res);
      res.json({ data: { ok: true } });
    } catch (err) {
      next(err);
    }
  });

  router.get('/auth/session', requireAuth, (req, res) => {
    const context = req.auth!;
    res.json({
      data: {
        user: context.user,
        role: context.role,
        expiresAt: context.session.expiresAt,
        impersonatedBy: context.session.impersonatedBy
          ? { userId: context.session.impersonatedBy.userId, userName: context.session.impersonatedBy.userName }
          : null,
      },
    });
  });

  /** Süper admin, bir kullanıcının yetkilerini test etmek için onun adına oturum açabilir. */
  router.post('/auth/impersonate', requireAuth, requireSuperAdmin, async (req, res, next) => {
    try {
      const admin = req.auth!;
      const targetId = Number(req.body?.userId);
      if (!Number.isFinite(targetId)) throw new HttpError(400, 'Geçerli bir kullanıcı seçilmelidir.');

      const target = await queryOne<any>(
        'SELECT `id`, `fullName`, `username`, `status` FROM `users` WHERE `id` = ? LIMIT 1',
        [targetId],
      );
      if (!target) throw new HttpError(404, 'Kullanıcı bulunamadı.');
      if (target.status !== 'active') throw new HttpError(400, 'Yalnızca aktif kullanıcılar için oturum açılabilir.');

      const originalToken = requestToken(req);
      if (!originalToken) throw new HttpError(400, 'Mevcut oturum belirteci bulunamadı.');

      const session = createSession({
        userId: Number(target.id),
        ip: clientIp(req),
        userAgent: req.headers['user-agent'],
        impersonatedBy: { userId: admin.user.id, userName: admin.user.fullName, originalToken },
      });
      setSessionCookie(res, session.token);
      const context = await resolveSession(session.token);

      await writeAudit(
        {
          action: 'login',
          module: 'auth',
          entityId: target.id,
          description: `Yetki simülasyonu: ${admin.user.fullName}, ${target.fullName || target.username} hesabına geçti.`,
          details: `Modül bazlı yetki testi. Yönetici oturumu açık tutuldu.`,
        },
        { auth: context, ip: clientIp(req) },
      );

      res.json({
        data: {
          user: context?.user,
          role: context?.role,
          expiresAt: session.expiresAt,
          impersonatedBy: { userId: admin.user.id, userName: admin.user.fullName },
        },
      });
    } catch (err) {
      next(err);
    }
  });

  /** Simülasyonu bitirip yöneticinin kendi oturumuna döner. */
  router.post('/auth/impersonate/stop', requireAuth, async (req, res, next) => {
    try {
      const token = requestToken(req);
      const restored = stopImpersonation(token);
      if (!restored) throw new HttpError(400, 'Aktif bir yetki simülasyonu oturumu bulunamadı.', 'NO_IMPERSONATION');

      setSessionCookie(res, restored);
      const context = await resolveSession(restored);
      await writeAudit(
        { action: 'login', module: 'auth', description: `Yetki simülasyonu sona erdi: ${context?.user.fullName} kendi hesabına döndü.` },
        { auth: context, ip: clientIp(req) },
      );
      res.json({
        data: {
          user: context?.user,
          role: context?.role,
          expiresAt: context?.session.expiresAt,
          impersonatedBy: null,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  /** Parola değiştirme: kendi hesabı (mevcut parola ile) veya yetkili kullanıcı tarafından. */
  router.post('/auth/password', requireAuth, async (req, res, next) => {
    try {
      const me = req.auth!.user;
      const targetId = req.body?.userId ? Number(req.body.userId) : me.id;
      if (!Number.isFinite(targetId)) throw new HttpError(400, 'Geçerli bir kullanıcı belirtilmelidir.');

      const newPassword = String(req.body?.newPassword ?? '');
      const strengthError = validatePasswordStrength(newPassword);
      if (strengthError) throw new HttpError(400, strengthError, 'WEAK_PASSWORD');

      if (targetId !== me.id) {
        if (!can(req.auth!.role, 'users', 'edit')) {
          throw new HttpError(403, 'Başka bir kullanıcının parolasını yalnızca yetkili kişiler değiştirebilir.', 'FORBIDDEN');
        }
        const target = await queryOne<any>('SELECT `id`, `fullName` FROM `users` WHERE `id` = ? LIMIT 1', [targetId]);
        if (!target) throw new HttpError(404, 'Kullanıcı bulunamadı.');
        await setUserPassword(targetId, newPassword);
        destroyUserSessions(targetId);
        invalidateUserCache(targetId);
        await writeAudit(
          { action: 'update', module: 'users', entityId: targetId, description: `Parola sıfırlandı: ${target.fullName}`, details: `İşlemi yapan: ${me.fullName}` },
          { auth: req.auth, ip: clientIp(req) },
        );
        res.json({ data: { ok: true, userId: targetId } });
        return;
      }

      const currentPassword = String(req.body?.currentPassword ?? '');
      const row = await queryOne<any>('SELECT `passwordHash`, `passwordSalt` FROM `users` WHERE `id` = ? LIMIT 1', [me.id]);
      if (!row?.passwordHash || !row?.passwordSalt) {
        throw new HttpError(400, 'Hesabınızda tanımlı bir parola bulunamadı. Yöneticinizle görüşün.', 'NO_PASSWORD');
      }
      const { valid } = await verifyPassword(currentPassword, String(row.passwordSalt), String(row.passwordHash));
      if (!valid) throw new HttpError(400, 'Mevcut parolanız doğrulanamadı.', 'INVALID_CURRENT_PASSWORD');

      await setUserPassword(me.id, newPassword);
      destroyUserSessions(me.id, requestToken(req) ?? undefined);
      invalidateUserCache(me.id);
      await writeAudit(
        { action: 'update', module: 'users', entityId: me.id, description: `Kullanıcı kendi parolasını değiştirdi: ${me.fullName}`, details: 'Diğer oturumlar kapatıldı.' },
        { auth: req.auth, ip: clientIp(req) },
      );
      res.json({ data: { ok: true, userId: me.id } });
    } catch (err) {
      next(err);
    }
  });

  /* ---------------------------------------------------------------- */
  /* Buradan sonrası oturum gerektirir.                                */
  /* ---------------------------------------------------------------- */
  router.use(requireAuth);

  router.get('/meta/resources', (_req, res) => {
    res.json({
      resources: RESOURCE_NAMES,
      meta: RESOURCE_NAMES.reduce<Record<string, any>>((acc, name) => {
        const def = getDef(name)!;
        const meta = getMeta(name);
        acc[name] = {
          primaryKey: def.primaryKey,
          columns: def.columns.map((c) => c.name),
          jsonColumns: def.jsonColumns,
          searchable: meta.searchable,
          module: meta.module,
          readOnly: Boolean(meta.readOnly),
        };
        return acc;
      }, {}),
    });
  });

  router.get('/events', sseHandler);

  /* ---------------------------------------------------------------- */
  /* Denetim izi: istemci yalnızca açıklama gönderir, kimlik sunucudan */
  /* yazılır; temizleme yıkıcı işlem olarak Süper Admin'e kapalıdır.   */
  /* ---------------------------------------------------------------- */
  router.post('/ops/audit', async (req, res, next) => {
    try {
      const action = String(req.body?.action ?? '');
      const module = String(req.body?.module ?? 'system');
      const description = String(req.body?.description ?? '').slice(0, 1000);
      if (!AUDIT_ACTIONS.has(action)) throw new HttpError(400, `Geçersiz denetim eylemi: ${action || '(boş)'}`);
      if (!description) throw new HttpError(400, 'Denetim kaydı açıklaması zorunludur.');

      await writeAudit(
        {
          action,
          module,
          description,
          details: req.body?.details ? String(req.body.details).slice(0, 1000) : null,
          entityId: req.body?.entityId ?? null,
        },
        { auth: req.auth, ip: clientIp(req) },
      );
      res.status(201).json({ data: { ok: true } });
    } catch (err) {
      next(err);
    }
  });

  router.post('/ops/audit-clear', requireSuperAdmin, async (req, res, next) => {
    try {
      const result = await execute('DELETE FROM `auditLogs`');
      broadcast('auditLogs', 'delete', []);
      await writeAudit(
        { action: 'system', module: 'system', description: 'Denetim izi geçmişi temizlendi.', details: `Silinen kayıt: ${result.affectedRows ?? 0}` },
        { auth: req.auth, ip: clientIp(req) },
      );
      res.json({ data: { deleted: result.affectedRows ?? 0 } });
    } catch (err) {
      next(err);
    }
  });

  /* ---------------------------------------------------------------- */
  /* Demo verilerine sıfırlama: yalnızca Süper Admin ve üretim dışında */
  /* ---------------------------------------------------------------- */
  router.post('/ops/reseed', requireSuperAdmin, async (req, res, next) => {
    try {
      if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DESTRUCTIVE_OPS !== 'true') {
        throw new HttpError(403, 'Demo verisine sıfırlama üretim ortamında kapalıdır (ALLOW_DESTRUCTIVE_OPS=true ile açılabilir).', 'DESTRUCTIVE_OPS_DISABLED');
      }
      const result = await reseed();
      for (const resource of RESOURCE_NAMES) broadcast(resource, 'seed', []);
      await writeAudit(
        { action: 'system', module: 'system', description: 'Tüm veriler silinip demo fabrika verileri yeniden yüklendi.', details: `Kullanıcı: ${req.auth?.user.fullName}` },
        { auth: req.auth, ip: clientIp(req) },
      );
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  });

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

  const MUTATION_ACTIONS: Record<Mutation['op'], PermissionAction> = {
    insert: 'create',
    insertMany: 'create',
    update: 'edit',
    updateWhere: 'edit',
    delete: 'delete',
    deleteWhere: 'delete',
    clear: 'delete',
  };

  router.post('/ops/commit', async (req, res, next) => {
    try {
      const mutations: Mutation[] = Array.isArray(req.body?.mutations) ? req.body.mutations : [];
      if (!mutations.length) throw new HttpError(400, 'Uygulanacak işlem bulunamadı.');
      // Yedek geri yükleme gibi tüm tabloları boşaltıp yeniden dolduran işlemlerde
      // yabancı anahtar sırası gözetilemez; bu bayrak yalnızca Süper Admin'e açıktır.
      const disableFkChecks = req.body?.disableFkChecks === true;
      if (disableFkChecks) {
        assertSuperAdmin(req.auth, 'Yabancı anahtar denetimini devre dışı bırakmak yalnızca Süper Admin yetkisindedir.');
      }

      // Yazma fazından önce tüm işlemlerin yetkisi doğrulanır: yarısı uygulanmış
      // bir toplu işlem oluşmasın.
      for (const m of mutations) {
        const meta = getMeta(m.resource);
        if (!getDef(m.resource)) throw new HttpError(400, `Bilinmeyen kaynak: ${m.resource}`);
        if (meta.readOnly) {
          throw new HttpError(403, `"${m.resource}" kaynağı yalnızca okunabilir.`, 'READ_ONLY_RESOURCE');
        }
        const action = MUTATION_ACTIONS[m.op];
        if (!action) throw new HttpError(400, `Desteklenmeyen işlem: ${(m as any).op}`);
        if (m.op === 'clear') {
          assertSuperAdmin(req.auth, `"${m.resource}" tablosunu tamamen boşaltmak yalnızca Süper Admin yetkisindedir.`);
        } else if (!can(req.auth?.role || null, meta.module, action)) {
          throw new HttpError(
            403,
            `"${req.auth?.user.fullName}" kullanıcısının "${meta.module.toUpperCase()}" modülünde "${action.toUpperCase()}" yetkisi yok.`,
            'FORBIDDEN',
          );
        }
      }

      const touched = new Set<string>();
      const results: any[] = [];

      await withTransaction(async (conn) => {
        if (disableFkChecks) await conn.query('SET FOREIGN_KEY_CHECKS = 0');
        try {
          for (const m of mutations) {
            const def = getDef(m.resource)!;
            touched.add(m.resource);

            switch (m.op) {
              case 'insert': {
                const { sql, params } = insertSql(def, pickColumns(m.resource, def, m.data || {}, { partial: false }));
                const [r] = await conn.query(sql, params);
                results.push({ op: m.op, resource: m.resource, id: (r as any)?.insertId });
                break;
              }
              case 'insertMany': {
                const rows = Array.isArray(m.rows) ? m.rows : [];
                const ids: any[] = [];
                for (const row of rows) {
                  const { sql, params } = insertSql(def, pickColumns(m.resource, def, row, { partial: false }));
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
                  pickColumns(m.resource, def, m.data || {}, { partial: true }),
                  `WHERE \`${def.primaryKey}\` = ?`,
                );
                const [r] = await conn.query(sql, [...params, coerce(def, def.primaryKey, m.id)]);
                results.push({ op: m.op, resource: m.resource, changes: (r as any)?.affectedRows ?? 0 });
                break;
              }
              case 'updateWhere': {
                const where = buildWhere(def, m.resource, m.where || {});
                if (!where.sql) throw new HttpError(400, 'updateWhere için filtre gerekli.');
                const { sql, params } = updateSql(def, pickColumns(m.resource, def, m.data || {}, { partial: true }), where.sql);
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

      if (touched.has('users') || touched.has('roles')) invalidateUserCache();

      for (const resource of touched) broadcast(resource, 'update', []);

      const destructive = mutations.filter((m) => m.op === 'clear' || m.op === 'deleteWhere');
      if (destructive.length) {
        await writeAudit(
          {
            action: 'delete',
            module: 'system',
            description: `Toplu veri silme işlemi uygulandı (${destructive.length} kaynak).`,
            details: destructive.map((m) => `${m.resource}:${m.op}`).join(', ').slice(0, 1000),
          },
          { auth: req.auth, ip: clientIp(req) },
        );
      }

      res.json({ data: { results } });
    } catch (err) {
      next(err);
    }
  });

  /* ---------------------------------------------------------------- */
  /* Kaynak uçları (RBAC denetimli)                                   */
  /* ---------------------------------------------------------------- */

  /** İstek yolundaki kaynağa göre modül/eylem iznini denetler. */
  const resourceAccess = (req: Request, _res: Response, next: any) => {
    try {
      const resource = String(req.params.resource || '');
      if (!getDef(resource)) throw new HttpError(404, `Bilinmeyen kaynak: ${resource}`);
      assertResourcePermission(resource, req.method, req.auth);
      next();
    } catch (err) {
      next(err);
    }
  };

  // ---- Liste / sayım ----
  router.get('/:resource', resourceAccess, async (req, res, next) => {
    try {
      const resource = req.params.resource;
      const def = getDef(resource)!;
      const q = parseListQuery(req);
      const result = await listRows(resource, def, q);
      if (q.countOnly) res.json({ count: result });
      else res.json({ data: stripHiddenRows(resource, result as any[]) });
    } catch (err) {
      next(err);
    }
  });

  // ---- Tek kayıt ----
  router.get('/:resource/:id', resourceAccess, async (req, res, next) => {
    try {
      const resource = req.params.resource;
      const def = getDef(resource)!;
      const columns = def.columns.map((c) => `\`${c.name}\``).join(', ');
      const row = await queryOne(
        `SELECT ${columns} FROM \`${def.table}\` WHERE \`${def.primaryKey}\` = ?`,
        [coerce(def, def.primaryKey, req.params.id)]
      );
      if (!row) throw new HttpError(404, 'Kayıt bulunamadı.');
      res.json({ data: stripHidden(resource, row) });
    } catch (err) {
      next(err);
    }
  });

  // ---- Oluştur (tek veya toplu) ----
  router.post('/:resource', resourceAccess, auditSecurityMutations, async (req, res, next) => {
    try {
      const resource = req.params.resource;
      const def = getDef(resource)!;

      const body = req.body;
      const rows: any[] = Array.isArray(body) ? body : [body];
      if (!rows.length) throw new HttpError(400, 'Eklenecek kayıt yok.');

      // Kullanıcı oluşturmada parola zorunludur; parola hiçbir zaman gövdedeki
      // hash alanlarından alınmaz, sunucuda üretilir.
      if (resource === 'users') {
        const password = String(rows[0]?.password ?? '');
        const strengthError = validatePasswordStrength(password);
        if (strengthError) throw new HttpError(400, `Yeni kullanıcı için parola zorunludur. ${strengthError}`, 'WEAK_PASSWORD');
      }

      const ids = await withTransaction(async (conn) => {
        const created: any[] = [];
        for (const row of rows) {
          const data = withPrimaryKey(def, pickColumns(resource, def, row, { partial: false }), row?.[def.primaryKey]);
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

      if (resource === 'users') {
        for (let i = 0; i < ids.length; i++) {
          const password = rows[i]?.password ?? rows[0]?.password;
          if (password) await setUserPassword(Number(ids[i]), String(password));
        }
        invalidateUserCache();
      }

      broadcast(resource, 'create', ids);
      res.status(201).json({ data: Array.isArray(body) ? ids : ids[0], ids });
    } catch (err) {
      next(err);
    }
  });

  // ---- Kısmi güncelleme ----
  router.patch('/:resource/:id', resourceAccess, auditSecurityMutations, async (req, res, next) => {
    try {
      const resource = req.params.resource;
      const def = getDef(resource)!;

      const data = pickColumns(resource, def, req.body, { partial: true });
      if (def.timestamps.includes('updatedAt')) data.updatedAt = new Date();
      if (!Object.keys(data).length) throw new HttpError(400, 'Güncellenecek alan yok.');

      // Parola gövde alanı yazma öncesi doğrulanır (yarım kalmış güncelleme olmasın).
      await assertUserPasswordChange(req, resource, req.body, req.params.id);

      const { sql, params } = updateSql(def, data, `WHERE \`${def.primaryKey}\` = ?`);
      const result = await execute(sql, [...params, coerce(def, def.primaryKey, req.params.id)]);
      if (!result.affectedRows) throw new HttpError(404, 'Kayıt bulunamadı.');

      await applyUserSecuritySideEffects(resource, req.params.id, data, req.body, requestToken(req));
      broadcast(resource, 'update', [req.params.id]);
      res.json({ data: { id: req.params.id, changes: result.affectedRows } });
    } catch (err) {
      next(err);
    }
  });

  // ---- Tam değiştirme (Dexie put karşılığı) ----
  router.put('/:resource/:id', resourceAccess, auditSecurityMutations, async (req, res, next) => {
    try {
      const resource = req.params.resource;
      const def = getDef(resource)!;

      const id = coerce(def, def.primaryKey, req.params.id);
      const existing = await queryOne(`SELECT \`${def.primaryKey}\` FROM \`${def.table}\` WHERE \`${def.primaryKey}\` = ?`, [id]);

      const data = pickColumns(resource, def, req.body, { partial: true });
      if (def.timestamps.includes('updatedAt')) data.updatedAt = new Date();

      if (existing) {
        if (!Object.keys(data).length) throw new HttpError(400, 'Güncellenecek alan yok.');
        await assertUserPasswordChange(req, resource, req.body, req.params.id);
        const { sql, params } = updateSql(def, data, `WHERE \`${def.primaryKey}\` = ?`);
        await execute(sql, [...params, id]);
        await applyUserSecuritySideEffects(resource, req.params.id, data, req.body, requestToken(req));
        broadcast(resource, 'update', [req.params.id]);
        res.json({ data: { id: req.params.id, created: false } });
      } else {
        if (resource === 'users') {
          const strengthError = validatePasswordStrength(String(req.body?.password ?? ''));
          if (strengthError) throw new HttpError(400, `Yeni kullanıcı için parola zorunludur. ${strengthError}`, 'WEAK_PASSWORD');
        }
        const insertData = withPrimaryKey(
          def,
          { ...pickColumns(resource, def, req.body, { partial: false }), ...data },
          id
        );
        if (def.timestamps.includes('createdAt') && !insertData.createdAt) insertData.createdAt = new Date();
        const { sql, params } = insertSql(def, insertData);
        await execute(sql, params);
        if (resource === 'users' && req.body?.password) {
          await setUserPassword(Number(id), String(req.body.password));
          invalidateUserCache();
        }
        broadcast(resource, 'create', [id]);
        res.status(201).json({ data: { id, created: true } });
      }
    } catch (err) {
      next(err);
    }
  });

  // ---- Toplu ekleme / güncelleme ----
  router.post('/:resource/bulk', resourceAccess, async (req, res, next) => {
    try {
      const resource = req.params.resource;
      const def = getDef(resource)!;

      const body = req.body as { mode?: 'insert' | 'upsert'; rows?: any[] };
      const rows = Array.isArray(body?.rows) ? body.rows : Array.isArray(body) ? (body as any) : null;
      if (!rows || !rows.length) throw new HttpError(400, 'Toplu işlem için kayıt listesi gerekli.');
      if (resource === 'users' && body?.mode !== 'upsert') {
        throw new HttpError(400, 'Kullanıcılar toplu ekleme ile oluşturulamaz; parola gerektirir.', 'PASSWORD_REQUIRED');
      }

      const ids = await withTransaction(async (conn) => {
        const created: any[] = [];
        for (const row of rows) {
          const pk = row?.[def.primaryKey];
          const data = withPrimaryKey(def, pickColumns(resource, def, row, { partial: false }), pk);
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

      if (resource === 'users' || resource === 'roles') invalidateUserCache();
      broadcast(resource, 'create', ids);
      res.status(201).json({ data: ids, ids });
    } catch (err) {
      next(err);
    }
  });

  // ---- Sil ----
  router.delete('/:resource/:id', resourceAccess, auditSecurityMutations, async (req, res, next) => {
    try {
      const resource = req.params.resource;
      const def = getDef(resource)!;

      const id = coerce(def, def.primaryKey, req.params.id);
      const hasGuards = Boolean((getMeta(resource).guards || []).length);
      if (hasGuards) await assertNoDependents(resource, id);

      const result = await execute(`DELETE FROM \`${def.table}\` WHERE \`${def.primaryKey}\` = ?`, [id]);
      if (!result.affectedRows) throw new HttpError(404, 'Kayıt bulunamadı.');

      if (resource === 'roles') invalidateUserCache();
      if (resource === 'users') {
        invalidateUserCache(Number(id));
        destroyUserSessions(Number(id));
      }

      broadcast(resource, 'delete', [req.params.id]);
      res.json({ data: { id: req.params.id, deleted: result.affectedRows } });
    } catch (err) {
      next(err);
    }
  });

  // ---- Toplu sil ----
  router.post('/:resource/bulk-delete', resourceAccess, async (req, res, next) => {
    try {
      const resource = req.params.resource;
      const def = getDef(resource)!;

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

      if (resource === 'users' || resource === 'roles') invalidateUserCache();
      if (resource === 'users') for (const id of ids) destroyUserSessions(Number(id));

      broadcast(resource, 'delete', ids);
      res.json({ data: { deleted: result.affectedRows } });
    } catch (err) {
      next(err);
    }
  });

  // ---- Koşullu toplu silme (Dexie where().delete() karşılığı) ----
  router.post('/:resource/delete-where', resourceAccess, async (req, res, next) => {
    try {
      const resource = req.params.resource;
      const def = getDef(resource)!;

      const where = buildWhere(def, resource, req.body?.where || {});
      if (!where.sql) throw new HttpError(400, 'Koşulsuz silme engellendi. Filtre gerekli.');

      const result = await execute(`DELETE FROM \`${def.table}\` ${where.sql}`, where.params);
      await writeAudit(
        {
          action: 'delete',
          module: 'system',
          description: `Koşullu toplu silme: ${resource}`,
          details: `Silinen kayıt: ${result.affectedRows ?? 0}. Filtre: ${JSON.stringify(req.body?.where || {}).slice(0, 500)}`,
        },
        { auth: req.auth, ip: clientIp(req) },
      );
      broadcast(resource, 'delete', []);
      res.json({ data: { deleted: result.affectedRows } });
    } catch (err) {
      next(err);
    }
  });

  // Kaynağı tamamen boşaltır (fabrika sıfırlama / yedek geri yükleme).
  // FK kısıtları geçici olarak devre dışı bırakılır; bağlantı havuza dönerken geri açılır.
  router.post(
    '/:resource/clear',
    resourceAccess,
    requireSuperAdmin,
    async (req, res, next) => {
      try {
        const resource = req.params.resource;
        const def = getDef(resource)!;

        const deleted = await withTransaction(async (conn) => {
          await conn.query('SET FOREIGN_KEY_CHECKS = 0');
          try {
            const [result] = await conn.query(`DELETE FROM \`${def.table}\``);
            return (result as any)?.affectedRows ?? 0;
          } finally {
            await conn.query('SET FOREIGN_KEY_CHECKS = 1');
          }
        });

        await writeAudit(
          {
            action: 'delete',
            module: 'system',
            description: `Tablo tamamen boşaltıldı: ${resource}`,
            details: `Silinen kayıt: ${deleted}`,
          },
          { auth: req.auth, ip: clientIp(req) },
        );

        broadcast(resource, 'delete', []);
        res.json({ data: { deleted } });
      } catch (err) {
        next(err);
      }
    },
  );

  // ---- Hata yönetimi ----
  router.use((err: any, _req: Request, res: Response, _next: any) => {
    const status = typeof err?.status === 'number' ? err.status : 500;
    if (status >= 500) console.error('[API]', err);
    res.status(status).json({
      error: err?.message || 'Sunucu hatası',
      code: err?.code,
    });
  });

  return router;
}

/* ------------------------------------------------------------------ */
/* Kullanıcı güvenliği yan etkileri                                    */
/* ------------------------------------------------------------------ */

/**
 * Kullanıcı kaydındaki parola / durum / rol değişikliklerinde oturumları
 * ve yetki önbelleğini tutarlı tutar.
 */
async function applyUserSecuritySideEffects(
  resource: string,
  rawId: string,
  data: Record<string, any>,
  body: any,
  currentToken?: string | null,
): Promise<void> {
  if (resource !== 'users') {
    if (resource === 'roles') invalidateUserCache();
    return;
  }
  const userId = Number(rawId);
  if (!Number.isFinite(userId)) return;

  if (body?.password) {
    await setUserPassword(userId, String(body.password));
    // Kullanıcının diğer cihazlardaki oturumları kapatılır; işlemi yapan
    // yönetici kendi oturumunu kaybetmez.
    destroyUserSessions(userId, currentToken ?? undefined);
  }

  // Pasife alınan/askıya alınan kullanıcının açık oturumları kapatılır.
  if (data.status && data.status !== 'active') {
    destroyUserSessions(userId);
  }

  invalidateUserCache(userId);
}

/**
 * Kullanıcı kaydındaki `password` alanını doğrular.
 * Kişi kendi parolasını değiştiriyorsa mevcut parolasını da girmek zorundadır;
 * başka bir kullanıcının parolasını yalnızca `users:edit` yetkisi olan değiştirebilir.
 * Parola değeri hiçbir zaman doğrudan kolona yazılmaz (pickColumns atlar).
 */
async function assertUserPasswordChange(
  req: Request,
  resource: string,
  body: any,
  rawId: unknown,
): Promise<void> {
  if (resource !== 'users' || !body?.password) return;

  const strengthError = validatePasswordStrength(String(body.password));
  if (strengthError) throw new HttpError(400, strengthError, 'WEAK_PASSWORD');

  const auth = req.auth!;
  const targetId = Number(rawId);

  if (targetId === auth.user.id) {
    const row = await queryOne<any>('SELECT `passwordHash`, `passwordSalt` FROM `users` WHERE `id` = ? LIMIT 1', [auth.user.id]);
    if (!row?.passwordHash || !row?.passwordSalt) {
      throw new HttpError(400, 'Hesabınızda tanımlı bir parola bulunamadı.', 'NO_PASSWORD');
    }
    const { valid } = await verifyPassword(String(body?.currentPassword ?? ''), String(row.passwordSalt), String(row.passwordHash));
    if (!valid) {
      throw new HttpError(400, 'Kendi parolanızı değiştirmek için mevcut parolanızı doğru girmelisiniz.', 'INVALID_CURRENT_PASSWORD');
    }
    return;
  }

  if (!can(auth.role, 'users', 'edit')) {
    throw new HttpError(403, 'Başka bir kullanıcının parolasını değiştirme yetkiniz yok.', 'FORBIDDEN');
  }
}
