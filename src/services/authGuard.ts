import type { AppModule, PermissionAction, AppUser, Role } from '../types';

/**
 * İstemci tarafı yetki ön denetimi.
 *
 * Yetkilendirmenin asıl sahibi sunucudur: her API çağrısı oturum çerezi ve
 * kaynağın RBAC modül izniyle denetlenir (`server/auth.ts`, `server/api.ts`).
 * Buradaki kontroller yalnızca kullanıcıya hızlı ve anlaşılır geri bildirim
 * vermek içindir; güvenlik sınırı değildir.
 *
 * Parola hashleme/doğrulama tarayıcıdan tamamen kaldırılmıştır: parolalar
 * sunucuda scrypt ile işlenir.
 */

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

/* ------------------------------------------------------------------ */
/* Oturum anlık görüntüsü (AuthContext tarafından beslenir)            */
/* ------------------------------------------------------------------ */

interface SessionSnapshot {
  user: AppUser | null;
  role: Role | null;
}

let snapshot: SessionSnapshot = { user: null, role: null };

/** AuthContext oturum bilgisini her değiştiğinde çağırır. */
export function setSessionSnapshot(user: AppUser | null, role: Role | null): void {
  snapshot = { user, role };
}

export function getSessionUser(): SessionSnapshot {
  return snapshot;
}

export function hasPermissionInSnapshot(module: AppModule, action: PermissionAction = 'view'): boolean {
  const { user, role } = snapshot;
  if (!user || user.status !== 'active') return false;
  if (user.roleCode === 'super_admin' || role?.code === 'super_admin') return true;
  return Boolean(role?.permissions?.[module]?.[action]);
}

/**
 * Servis katmanı yetki ön denetimi.
 *
 * Sunucu tarafı denetim nihai kararı verir; bu fonksiyon yetkisiz isteğin
 * ağ turu yapmadan anlaşılır bir hatayla dönmesini sağlar.
 */
export async function assertServicePermission(
  module: AppModule,
  action: PermissionAction,
  bypassIfNoUser: boolean = false
): Promise<AppUser | null> {
  const { user, role } = snapshot;

  if (!user) {
    if (bypassIfNoUser) return null;
    throw new Error('Aktif kullanıcı oturumu bulunamadı. Lütfen giriş yapınız.');
  }

  if (user.roleCode === 'super_admin' || role?.code === 'super_admin') {
    return user;
  }

  if (user.status !== 'active') {
    throw new Error(
      `"${user.fullName}" kullanıcısının hesabı ${user.status === 'suspended' ? 'askıya alınmıştır' : 'pasiftir'}.`
    );
  }

  if (!hasPermissionInSnapshot(module, action)) {
    throw new AuthorizationError(module, action, user.fullName, role?.name || user.roleName);
  }

  return user;
}
