import { api } from '../api/client';
import type { AppModule, PermissionAction, AppUser, Role } from '../types';

export class AuthorizationError extends Error {
  constructor(
    public module: AppModule,
    public action: PermissionAction,
    public userName?: string,
    public userRole?: string
  ) {
    super(
      `Yetkisiz İşlem: "${userName || 'Kullanıcı'}" (${userRole || 'Rol Yok'}) kullanıcısının ` +
      `"${module.toUpperCase()}" modülünde "${action.toUpperCase()}" işlem yetkisi bulunmamaktadır.`
    );
    this.name = 'AuthorizationError';
  }
}

/**
 * Web Crypto tabanlı SHA-256 Parola Hashleme (Salt destekli)
 */
export async function hashPassword(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + ':' + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export function generateSalt(length = 16): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

export function generateSessionToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return 'pe_' + Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyPassword(password: string, salt: string, storedHash: string): Promise<boolean> {
  const computed = await hashPassword(password, salt);
  return computed === storedHash;
}

/**
 * Servis Katmanı Yetki Kontrolcüsü (Service-Layer Authorization Guard)
 *
 * Veritabanı ve servis çağrılarında kullanıcının yetkisi olup olmadığını
 * doğrudan veri işleme öncesinde denetler ve yetkisiz işlemleri engeller.
 */
export async function getSessionUser(): Promise<{ user: AppUser | null; role: Role | null }> {
  try {
    const rawUserId = localStorage.getItem('proerp_active_user_id');
    const userId = rawUserId ? parseInt(rawUserId, 10) : null;

    if (userId) {
      const user = await api.users.get(userId);
      if (user && user.status === 'active') {
        let role: Role | undefined;
        if (user.roleCode) {
          role = await api.roles.findOne({ code: user.roleCode });
        }
        if (!role && user.roleId) {
          role = await api.roles.get(user.roleId);
        }
        return { user, role: role || null };
      }
    }

    // Fallback: Aktif super_admin veya ilk aktif kullanıcı
    const superAdmin = await api.users.findOne({ roleCode: 'super_admin' });
    if (superAdmin?.id) {
      let role: Role | undefined;
      if (superAdmin.roleCode) {
        role = await api.roles.findOne({ code: superAdmin.roleCode });
      }
      return { user: superAdmin, role: role || null };
    }

    const anyUser = (await api.users.list({ limit: 1 }))[0];
    return { user: anyUser || null, role: null };
  } catch (err) {
    console.warn('Oturum kullanıcısı alınamadı:', err);
    return { user: null, role: null };
  }
}

/**
 * Belirtilen modül ve eylem için yetki doğrulaması yapar; yetkisiz ise hata fırlatır
 */
export async function assertServicePermission(
  module: AppModule,
  action: PermissionAction,
  bypassIfNoUser: boolean = false
): Promise<AppUser | null> {
  const { user, role } = await getSessionUser();

  if (!user) {
    if (bypassIfNoUser) return null;
    throw new Error('Aktif kullanıcı oturumu bulunamadı. Lütfen giriş yapınız.');
  }

  // Süper Admin her zaman tam yetkiye sahiptir
  if (user.roleCode === 'super_admin' || role?.code === 'super_admin') {
    return user;
  }

  // Kullanıcı pasif veya askıya alınmışsa engelle
  if (user.status !== 'active') {
    throw new Error(`"${user.fullName}" kullanıcısının hesabı ${user.status === 'suspended' ? 'askıya alınmıştır' : 'pasiftir'}.`);
  }

  const modulePerms = role?.permissions?.[module];
  const hasActionPermission = Boolean(modulePerms?.[action]);

  if (!hasActionPermission) {
    throw new AuthorizationError(module, action, user.fullName, role?.name || user.roleName);
  }

  return user;
}
