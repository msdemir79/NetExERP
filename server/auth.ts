/**
 * Sunucu tarafı kimlik doğrulama, oturum ve yetki katmanı.
 *
 * Yetkilendirme artık istemcide değil burada yapılır: her API çağrısı
 * `requireAuth` ardından ilgili kaynağın modül/eylem izninden geçer.
 * Parolalar scrypt (KDF) ile saklanır; eski sha256 kayıtları ilk başarılı
 * girişte otomatik olarak scrypt'e yükseltilir.
 */
import crypto from 'crypto';
import { promisify } from 'util';
import type { NextFunction, Request, Response } from 'express';
import { query, queryOne } from './db.js';
import { getMeta } from './registry.js';
import type { AppModule, PermissionAction, RolePermissions } from '../src/types.js';

const scrypt = promisify(crypto.scrypt) as (
  password: crypto.BinaryLike,
  salt: crypto.BinaryLike,
  keylen: number,
  options: crypto.ScryptOptions,
) => Promise<Buffer>;

/* ------------------------------------------------------------------ */
/* Parola saklama (scrypt)                                             */
/* ------------------------------------------------------------------ */

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 } as const;
const SCRYPT_KEYLEN = 64;
const HASH_PREFIX = 'scrypt';
export const MIN_PASSWORD_LENGTH = 8;

function scryptParams(): crypto.ScryptOptions {
  // keylen'i aşan maxmem gereksinimi: 128 * N * r * 2
  return { N: SCRYPT_PARAMS.N, r: SCRYPT_PARAMS.r, p: SCRYPT_PARAMS.p, maxmem: 64 * 1024 * 1024 };
}

export interface PasswordRecord {
  hash: string;
  salt: string;
}

/** Yeni parolayı scrypt ile hashler. Düz metin parola hiçbir yerde saklanmaz. */
export async function hashPassword(password: string): Promise<PasswordRecord> {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, SCRYPT_KEYLEN, scryptParams());
  const { N, r, p } = SCRYPT_PARAMS;
  return { hash: `${HASH_PREFIX}$${N}$${r}$${p}$${derived.toString('hex')}`, salt };
}

function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Parolayı doğrular. `needsRehash`, kaydın eski (sha256) biçimde olduğunu
 * ve başarılı giriş sonrası scrypt'e yükseltilmesi gerektiğini bildirir.
 */
export async function verifyPassword(
  password: string,
  salt: string,
  storedHash: string,
): Promise<{ valid: boolean; needsRehash: boolean }> {
  if (!storedHash) return { valid: false, needsRehash: false };

  if (storedHash.startsWith(`${HASH_PREFIX}$`)) {
    const [, n, r, p, digest] = storedHash.split('$');
    try {
      const derived = await scrypt(password, salt, SCRYPT_KEYLEN, {
        N: Number(n) || SCRYPT_PARAMS.N,
        r: Number(r) || SCRYPT_PARAMS.r,
        p: Number(p) || SCRYPT_PARAMS.p,
        maxmem: 64 * 1024 * 1024,
      });
      return { valid: safeEqualHex(derived.toString('hex'), digest || ''), needsRehash: false };
    } catch {
      return { valid: false, needsRehash: false };
    }
  }

  // Eski biçim: sha256(parola + ':' + salt). Kurulu veritabanları için korunur.
  const legacy = crypto.createHash('sha256').update(`${password}:${salt}`, 'utf8').digest('hex');
  return { valid: safeEqualHex(legacy, storedHash), needsRehash: true };
}

/* ------------------------------------------------------------------ */
/* Oturum deposu                                                       */
/* ------------------------------------------------------------------ */

export interface AuthUser {
  id: number;
  username: string;
  fullName: string;
  email: string;
  phone?: string | null;
  title?: string | null;
  department?: string | null;
  roleId?: number | null;
  roleCode: string;
  roleName?: string | null;
  status: string;
  avatar?: string | null;
  color?: string | null;
  lastLoginAt?: Date | string | null;
  notes?: string | null;
}

export interface AuthRole {
  id: number;
  code: string;
  name: string;
  color?: string | null;
  isSystem?: boolean;
  permissions: RolePermissions | null;
}

export interface Session {
  token: string;
  userId: number;
  createdAt: number;
  expiresAt: number;
  lastSeenAt: number;
  ip?: string;
  userAgent?: string;
  /**
   * Süper admin başka bir kullanıcı adına oturum açtıysa kaynağı.
   * `originalToken`, yöneticinin kendi oturumuna dönebilmesi için saklanır;
   * bu belirteç hiçbir zaman istemciye gönderilmez.
   */
  impersonatedBy?: { userId: number; userName: string; originalToken: string };
  /** Yetki kontrolünde tekrar tekrar sorgu atmamak için kısa ömürlü önbellek. */
  cache?: { user: AuthUser; role: AuthRole | null; at: number };
}

/** Ön yüz tipinde tutulan alanlarla aynı; parola alanları asla dışarı çıkmaz. */
const USER_COLUMNS = [
  'id',
  'username',
  'fullName',
  'email',
  'phone',
  'title',
  'department',
  'roleId',
  'roleCode',
  'roleName',
  'status',
  'avatar',
  'color',
  'lastLoginAt',
  'notes',
];

const SESSION_TTL_MS = Number(process.env.SESSION_TTL_HOURS || 24) * 60 * 60 * 1000;
const CACHE_TTL_MS = 15 * 1000;

const sessions = new Map<string, Session>();

const CLEANUP_TIMER = setInterval(() => {
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(token);
  }
}, 10 * 60 * 1000);
if (typeof CLEANUP_TIMER.unref === 'function') CLEANUP_TIMER.unref();

function newToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function createSession(input: {
  userId: number;
  ip?: string;
  userAgent?: string;
  impersonatedBy?: { userId: number; userName: string; originalToken: string };
}): Session {
  const now = Date.now();
  const session: Session = {
    token: newToken(),
    userId: input.userId,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
    lastSeenAt: now,
    ip: input.ip,
    userAgent: input.userAgent,
    impersonatedBy: input.impersonatedBy,
  };
  sessions.set(session.token, session);
  return session;
}

export function destroySession(token: string): void {
  sessions.delete(token);
}

/** Kullanıcının tüm oturumlarını kapatır (parola/durum/rol değişikliğinde). */
export function destroyUserSessions(userId: number, exceptToken?: string): number {
  let removed = 0;
  for (const [token, session] of sessions) {
    if (session.userId === userId && token !== exceptToken) {
      sessions.delete(token);
      removed++;
    }
  }
  return removed;
}

/** Kullanıcı veya rolü değiştiğinde önbelleği düşürür. */
export function invalidateUserCache(userId?: number): void {
  for (const session of sessions.values()) {
    if (userId === undefined || session.userId === userId) session.cache = undefined;
  }
}

export function activeSessionCount(): number {
  return sessions.size;
}

async function loadUser(userId: number): Promise<AuthUser | null> {
  const row = await queryOne<AuthUser>(
    `SELECT ${USER_COLUMNS.map((c) => `\`${c}\``).join(', ')} FROM \`users\` WHERE \`id\` = ?`,
    [userId],
  );
  return row || null;
}

async function loadRole(user: AuthUser): Promise<AuthRole | null> {
  const row = user.roleId
    ? await queryOne<any>('SELECT * FROM `roles` WHERE `id` = ?', [user.roleId])
    : null;
  const role = row || (user.roleCode
    ? await queryOne<any>('SELECT * FROM `roles` WHERE `code` = ?', [user.roleCode])
    : null);
  if (!role) return null;

  let permissions: RolePermissions | null = null;
  const raw = role.permissions;
  if (raw && typeof raw === 'object') permissions = raw as RolePermissions;
  else if (typeof raw === 'string' && raw.trim()) {
    try {
      permissions = JSON.parse(raw) as RolePermissions;
    } catch {
      permissions = null;
    }
  }

  return {
    id: Number(role.id),
    code: String(role.code),
    name: String(role.name),
    color: role.color ?? null,
    isSystem: Boolean(role.isSystem),
    permissions,
  };
}

export interface AuthContext {
  session: Session;
  user: AuthUser;
  role: AuthRole | null;
}

/** Oturum belirtecini çözer; geçersiz/süresi dolmuş/askıya alınmış ise null. */
export async function resolveSession(token: string | undefined | null): Promise<AuthContext | null> {
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;

  const now = Date.now();
  if (session.expiresAt <= now) {
    sessions.delete(token);
    return null;
  }

  // Kayan pencere: son 5 dakikada etkinlik varsa oturum ömrünü uzat.
  if (now - session.lastSeenAt > 5 * 60 * 1000) {
    session.lastSeenAt = now;
    session.expiresAt = now + SESSION_TTL_MS;
  }

  // Kısa ömürlü önbellek: yetki değişikliklerini en fazla 15 sn geciktirir.
  if (!session.cache || now - session.cache.at > CACHE_TTL_MS) {
    const user = await loadUser(session.userId);
    if (!user) {
      sessions.delete(token);
      return null;
    }
    session.cache = { user, role: await loadRole(user), at: now };
  }

  const user = session.cache.user;
  if (user.status !== 'active') {
    // Askıya alınmış/pasif hesabın oturumu derhal kapatılır.
    sessions.delete(token);
    return null;
  }

  return { session, user, role: session.cache.role };
}

export const SESSION_COOKIE = 'proerp_session';

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, value] = header.split(' ');
  if (!value || scheme.toLowerCase() !== 'bearer') return null;
  return value.trim() || null;
}

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

/**
 * Oturum belirtecini taşıyan kaynak: önce Authorization başlığı (API istemcileri),
 * yoksa httpOnly çerez (tarayıcı ve EventSource).
 */
export function requestToken(req: Request): string | null {
  return bearerToken(req) || readCookie(req, SESSION_COOKIE);
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false',
    path: '/',
    maxAge: SESSION_TTL_MS,
  };
}

/** Oturumu httpOnly çerez olarak yazar; belirteç JavaScript'e açılmaz. */
export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, cookieOptions());
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { ...cookieOptions(), maxAge: undefined });
}

/**
 * Yetki simülasyonunu bitirir: impersonation oturumunu kapatıp yöneticinin
 * kendi oturum belirtecini döner (istemciye sızmadan).
 */
export function stopImpersonation(token: string | null): string | null {
  if (!token) return null;
  const session = sessions.get(token);
  const originalToken = session?.impersonatedBy?.originalToken;
  if (!session || !originalToken) return null;
  const original = sessions.get(originalToken);
  if (!original || original.expiresAt <= Date.now()) return null;
  sessions.delete(token);
  original.lastSeenAt = Date.now();
  original.expiresAt = Date.now() + SESSION_TTL_MS;
  return originalToken;
}

export function clientIp(req: Request): string {
  return req.ip || req.socket?.remoteAddress || 'bilinmeyen';
}

/* ------------------------------------------------------------------ */
/* İzin kontrolü                                                       */
/* ------------------------------------------------------------------ */

export function can(
  role: AuthRole | null,
  module: AppModule,
  action: PermissionAction,
): boolean {
  if (!role) return false;
  if (role.code === 'super_admin') return true;
  const modulePerms = role.permissions?.[module];
  return Boolean(modulePerms?.[action]);
}

/** HTTP metodu → izin eylemi eşlemesi. */
export function actionForMethod(method: string): PermissionAction {
  switch (method.toUpperCase()) {
    case 'GET':
      return 'view';
    case 'POST':
      return 'create';
    case 'PUT':
    case 'PATCH':
      return 'edit';
    case 'DELETE':
      return 'delete';
    default:
      return 'view';
  }
}

/* ------------------------------------------------------------------ */
/* Express middleware                                                  */
/* ------------------------------------------------------------------ */

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export class AuthError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Oturum zorunlu; başarılıysa `req.auth` doldurulur. */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const context = await resolveSession(requestToken(req));
    if (!context) {
      throw new AuthError(401, 'Oturum bulunamadı veya süresi doldu. Lütfen tekrar giriş yapın.', 'UNAUTHENTICATED');
    }
    req.auth = context;
    next();
  } catch (err) {
    next(err);
  }
}

/** Oturum sahibinin modül/eylem iznini denetler. */
export function requirePermission(module: AppModule, action: PermissionAction) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const context = req.auth;
    if (!context) {
      next(new AuthError(401, 'Oturum bulunamadı.', 'UNAUTHENTICATED'));
      return;
    }
    if (!can(context.role, module, action)) {
      next(
        new AuthError(
          403,
          `"${context.user.fullName}" kullanıcısının "${module.toUpperCase()}" modülünde "${action.toUpperCase()}" yetkisi yok.`,
          'FORBIDDEN',
        ),
      );
      return;
    }
    next();
  };
}

export function requireSuperAdmin(req: Request, _res: Response, next: NextFunction) {
  const context = req.auth;
  const isSuper = Boolean(context?.role?.code === 'super_admin' || context?.user.roleCode === 'super_admin');
  if (!isSuper) {
    next(new AuthError(403, 'Bu işlem yalnızca Süper Admin tarafından yapılabilir.', 'SUPER_ADMIN_REQUIRED'));
    return;
  }
  next();
}

/** Kaynağın modülü + metodun eylemi ile izin denetimi. */
export function resourceGuard(resource: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const meta = getMeta(resource);
    if (!meta.module) {
      next(new AuthError(403, 'Bu kaynak için yetki tanımı bulunamadı.', 'FORBIDDEN'));
      return;
    }
    const action = actionForMethod(req.method);
    if (action === 'view' && meta.readAuthOnly) {
      next();
      return;
    }
    requirePermission(meta.module, action)(req, _res, next);
  };
}

/* ------------------------------------------------------------------ */
/* Giriş denemesi sınırlayıcı (brute-force koruması)                   */
/* ------------------------------------------------------------------ */

interface AttemptWindow {
  count: number;
  resetAt: number;
}

const attempts = new Map<string, AttemptWindow>();

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: 0 };
  }
  entry.count += 1;
  if (entry.count > limit) {
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
  }
  return { allowed: true, retryAfterSec: 0 };
}

export function resetRateLimit(key: string): void {
  attempts.delete(key);
}

const ATTEMPT_CLEANUP = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of attempts) {
    if (entry.resetAt <= now) attempts.delete(key);
  }
}, 15 * 60 * 1000);
if (typeof ATTEMPT_CLEANUP.unref === 'function') ATTEMPT_CLEANUP.unref();

/* ------------------------------------------------------------------ */
/* Parola güncelleme yardımcıları                                      */
/* ------------------------------------------------------------------ */

export function validatePasswordStrength(password: string): string | null {
  if (!password || password.trim().length < MIN_PASSWORD_LENGTH) {
    return `Parola en az ${MIN_PASSWORD_LENGTH} karakter olmalıdır.`;
  }
  if (/^\d+$/.test(password)) {
    return 'Parola yalnızca rakamlardan oluşamaz.';
  }
  const weak = ['1234', '12345', '123456', 'password', 'parola', 'qwerty', 'proerp', 'admin'];
  if (weak.includes(password.toLowerCase())) {
    return 'Bu parola çok yaygın; lütfen daha güçlü bir parola seçin.';
  }
  return null;
}

/** Kullanıcının parolasını scrypt ile yeniden yazar. */
export async function setUserPassword(userId: number, password: string): Promise<void> {
  const { hash, salt } = await hashPassword(password);
  await query('UPDATE `users` SET `passwordHash` = ?, `passwordSalt` = ?, `updatedAt` = NOW() WHERE `id` = ?', [
    hash,
    salt,
    userId,
  ]);
}
