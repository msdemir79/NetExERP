import { api, authApi, type SessionPayload } from '../api/client';
import type {
  AppUser,
  Role,
  AuditLog,
  AppModule,
  PermissionAction,
  AuditActionType,
  UserStatus
} from '../types';
import { INITIAL_ROLES } from '../data/initialRoles';

/**
 * Kullanıcı, rol ve oturum servisi.
 *
 * Oturum sunucu tarafında yönetilir (httpOnly çerez); parola işlemleri
 * (`login`, `changePassword`) sunucuda doğrulanır. Tarayıcıda parola
 * hashleme/doğrulama yapılmaz.
 */
class UserService {
  // Listeners for active user changes
  private activeUserChangeListeners: Array<(user: AppUser | null, role: Role | null) => void> = [];

  /** Sunucudan alınan son oturum bilgisi; tekrar tekrar sorgu atmamak için önbelleklenir. */
  private session: SessionPayload = { user: null, role: null };

  getCachedSession(): SessionPayload {
    return this.session;
  }

  getCachedUserId(): number | null {
    return this.session.user?.id ?? null;
  }

  private setSession(payload: SessionPayload | null): void {
    this.session = payload || { user: null, role: null };
  }

  // =========================================================================
  // KULLANICI İŞLEMLERİ (USERS)
  // =========================================================================

  async getUsers(): Promise<AppUser[]> {
    return await api.users.list();
  }

  async getUserById(id: number): Promise<AppUser | undefined> {
    return await api.users.get(id);
  }

  async getUserByUsername(username: string): Promise<AppUser | undefined> {
    return await api.users.findOne({ username });
  }

  /**
   * Kullanıcı oluşturur. Parola gövdede düz metin olarak gönderilir ve
   * sunucuda scrypt ile hashlenir; istemci hiçbir hash üretmez.
   */
  async createUser(user: Omit<AppUser, 'id'>): Promise<number> {
    const existing = await api.users.findOne({ username: user.username });
    if (existing) {
      throw new Error(`"${user.username}" kullanıcı adı zaten kullanımda.`);
    }

    if (!user.password) {
      throw new Error('Yeni kullanıcı için parola tanımlanmalıdır.');
    }

    let roleName = user.roleName;
    if (!roleName && user.roleCode) {
      const role = await api.roles.findOne({ code: user.roleCode });
      roleName = role?.name;
    }

    const newId = await api.users.create({
      ...user,
      roleName,
      createdAt: new Date(),
      updatedAt: new Date()
    } as AppUser);

    await this.logAudit(
      'create',
      'users',
      `Yeni kullanıcı hesabı oluşturuldu: ${user.fullName} (${user.username})`,
      `Rol: ${roleName || user.roleCode}, Departman: ${user.department || '-'}`,
      newId as number
    );

    return newId as number;
  }

  async updateUser(id: number, updates: Partial<AppUser>): Promise<void> {
    const existing = await api.users.get(id);
    if (!existing) throw new Error('Kullanıcı bulunamadı.');

    // If username is changing, check uniqueness
    if (updates.username && updates.username !== existing.username) {
      const duplicate = await api.users.findOne({ username: updates.username });
      if (duplicate && duplicate.id !== id) {
        throw new Error(`"${updates.username}" kullanıcı adı başka bir kullanıcı tarafından kullanılıyor.`);
      }
    }

    let roleName = updates.roleName || existing.roleName;
    if (updates.roleCode && updates.roleCode !== existing.roleCode) {
      const role = await api.roles.findOne({ code: updates.roleCode });
      roleName = role?.name;
    }

    // `password` alanı yalnızca dolduysa gönderilir; boşsa mevcut parola korunur.
    const payload: Partial<AppUser> = {
      ...updates,
      roleName,
      updatedAt: new Date(),
    };
    if (!payload.password) delete payload.password;

    await api.users.update(id, payload);

    await this.logAudit(
      'update',
      'users',
      `Kullanıcı bilgileri güncellendi: ${updates.fullName || existing.fullName}`,
      `Kullanıcı Adı: ${updates.username || existing.username}${payload.password ? ', parola yenilendi' : ''}`,
      id
    );

    // Notify listeners if active user was updated
    if (this.getCachedUserId() === id) {
      await this.refreshSession();
    }
  }

  /** Kullanıcı kendi parolasını değiştirir (mevcut parola doğrulanır). */
  async changeOwnPassword(currentPassword: string, newPassword: string): Promise<void> {
    const user = this.session.user;
    if (!user?.id) throw new Error('Aktif oturum bulunamadı.');

    await authApi.changePassword({ currentPassword, newPassword });

    await this.logAudit(
      'update',
      'users',
      `Parola değiştirildi: ${user.fullName}`,
      'Diğer cihazlardaki oturumlar kapatıldı.',
      user.id
    );
  }

  async deleteUser(id: number): Promise<void> {
    const user = await api.users.get(id);
    if (!user) return;

    // Prevent deleting the main super admin
    if (user.username === 'mdemir' || user.roleCode === 'super_admin') {
      const adminCount = await api.users.count({ roleCode: 'super_admin' });
      if (adminCount <= 1) {
        throw new Error('Sistemdeki son Süper Admin hesabı silinemez.');
      }
    }

    await api.users.remove(id);

    await this.logAudit(
      'delete',
      'users',
      `Kullanıcı hesabı silindi: ${user.fullName} (${user.username})`,
      `Silinen Rol: ${user.roleName || user.roleCode}`,
      id
    );

    if (this.getCachedUserId() === id) {
      await this.logout();
    }
  }

  async toggleUserStatus(id: number, status: UserStatus): Promise<void> {
    const user = await api.users.get(id);
    if (!user) return;

    await api.users.update(id, { status, updatedAt: new Date() });

    await this.logAudit(
      'status_change',
      'users',
      `Kullanıcı durumu değiştirildi: ${user.fullName} -> ${status.toUpperCase()}`,
      status === 'active' ? undefined : 'Açık oturumlar sunucu tarafında kapatıldı.',
      id
    );

    if (this.getCachedUserId() === id) {
      await this.refreshSession();
    }
  }

  // =========================================================================
  // ROL & YETKİ İŞLEMLERİ (ROLES & PERMISSIONS)
  // =========================================================================

  async getRoles(): Promise<Role[]> {
    return await api.roles.list();
  }

  async getRoleById(id: number): Promise<Role | undefined> {
    return await api.roles.get(id);
  }

  async getRoleByCode(code: string): Promise<Role | undefined> {
    return await api.roles.findOne({ code });
  }

  async createRole(role: Omit<Role, 'id'>): Promise<number> {
    const existing = await api.roles.findOne({ code: role.code });
    if (existing) {
      throw new Error(`"${role.code}" kodlu rol zaten mevcut.`);
    }

    const newId = await api.roles.create({
      ...role,
      createdAt: new Date(),
      updatedAt: new Date()
    } as Role);

    await this.logAudit(
      'create',
      'users',
      `Yeni rol tanımlandı: ${role.name} (${role.code})`,
      role.description,
      newId as number
    );

    return newId as number;
  }

  async updateRole(id: number, updates: Partial<Role>): Promise<void> {
    const role = await api.roles.get(id);
    if (!role) throw new Error('Rol bulunamadı.');

    await api.roles.update(id, {
      ...updates,
      updatedAt: new Date()
    });

    // If role name changed, update all users with this role
    if (updates.name && updates.name !== role.name) {
      const usersWithRole = await api.users.list({ where: { roleCode: role.code } });
      for (const u of usersWithRole) {
        if (u.id) {
          await api.users.update(u.id, { roleName: updates.name });
        }
      }
    }

    await this.logAudit(
      'permission_change',
      'users',
      `Rol yetki ve bilgileri güncellendi: ${updates.name || role.name}`,
      `Rol Kodu: ${role.code}`,
      id
    );

    await this.refreshSession();
  }

  async deleteRole(id: number): Promise<void> {
    const role = await api.roles.get(id);
    if (!role) return;

    if (role.isSystem || role.code === 'super_admin') {
      throw new Error('Sistem rollerinin (ön tanımlı roller) silinmesine izin verilmez.');
    }

    // Check if any users are assigned to this role
    const assignedUsersCount = await api.users.count({ roleCode: role.code });
    if (assignedUsersCount > 0) {
      throw new Error(`Bu role atanmış ${assignedUsersCount} kullanıcı bulunmaktadır. Önce kullanıcıların rolünü değiştiriniz.`);
    }

    await api.roles.remove(id);

    await this.logAudit(
      'delete',
      'users',
      `Özel rol silindi: ${role.name} (${role.code})`,
      undefined,
      id
    );
  }

  async resetRolesToDefaults(): Promise<void> {
    // Keep custom roles, re-seed or update system roles
    for (const initRole of INITIAL_ROLES) {
      const existing = await api.roles.findOne({ code: initRole.code });
      if (existing && existing.id) {
        await api.roles.update(existing.id, {
          name: initRole.name,
          description: initRole.description,
          permissions: initRole.permissions,
          color: initRole.color,
          updatedAt: new Date()
        });
      } else {
        await api.roles.create(initRole);
      }
    }

    await this.logAudit(
      'system',
      'system',
      'Sistem rolleri ve yetki matrisleri fabrika varsayılan ayarlarına sıfırlandı.',
      '7 temel sistem rolü yeniden yapılandırıldı.'
    );

    await this.refreshSession();
  }

  // =========================================================================
  // AKTİF KULLANICI & OTURUM YÖNETİMİ (SESSION & SWITCH USER)
  // =========================================================================

  /**
   * Sunucudaki oturumu okuyarak aktif kullanıcı ve rolü tazeler.
   * Oturum yoksa (401) null döner; varsayılan kullanıcıya düşme yapılmaz.
   */
  async refreshSession(): Promise<SessionPayload | null> {
    const payload = await authApi.session();
    this.setSession(payload);
    await this.notifyActiveUserChanged();
    return payload;
  }

  async login(username: string, password: string): Promise<{ success: boolean; user?: AppUser; error?: string }> {
    try {
      const payload = await authApi.login(username, password);
      this.setSession(payload);
      await this.notifyActiveUserChanged();
      return { success: true, user: payload.user || undefined };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Giriş yapılamadı.' };
    }
  }

  async logout(): Promise<void> {
    const user = this.session.user;
    try {
      if (user) {
        await this.logAudit('logout', 'auth', `Oturum kapatıldı: ${user.fullName}`);
      }
      await authApi.logout();
    } finally {
      this.setSession(null);
      await this.notifyActiveUserChanged();
    }
  }

  /** Yalnızca süper admin: başka bir kullanıcının yetkileriyle oturum açar. */
  async setActiveUserId(id: number): Promise<void> {
    const payload = await authApi.impersonate(id);
    this.setSession(payload);
    await this.notifyActiveUserChanged();
  }

  /** Yetki simülasyonunu bitirip yöneticinin kendi oturumuna döner. */
  async stopImpersonation(): Promise<void> {
    const payload = await authApi.stopImpersonation();
    this.setSession(payload);
    await this.notifyActiveUserChanged();
  }

  getImpersonatedBy(): { userId: number; userName: string } | null {
    return this.session.impersonatedBy || null;
  }

  getActiveUser(): AppUser | null {
    return this.session.user;
  }

  getActiveRole(): Role | null {
    return this.session.role;
  }

  isAuthenticated(): boolean {
    return Boolean(this.session.user);
  }

  onActiveUserChange(callback: (user: AppUser | null, role: Role | null) => void): () => void {
    this.activeUserChangeListeners.push(callback);
    return () => {
      this.activeUserChangeListeners = this.activeUserChangeListeners.filter(cb => cb !== callback);
    };
  }

  private async notifyActiveUserChanged() {
    const user = this.session.user;
    const role = this.session.role;
    for (const cb of this.activeUserChangeListeners) {
      try {
        cb(user, role);
      } catch (err) {
        console.error('Active user change listener error:', err);
      }
    }
  }

  // =========================================================================
  // YETKİ KONTROL YARDIMCILARI (PERMISSION CHECKERS)
  // =========================================================================

  hasPermission(
    user: AppUser | null,
    role: Role | null,
    module: AppModule,
    action: PermissionAction = 'view'
  ): boolean {
    if (!user || user.status !== 'active') return false;

    // Super admin has absolute access to everything
    if (user.roleCode === 'super_admin' || role?.code === 'super_admin') {
      return true;
    }

    if (!role || !role.permissions) {
      return false;
    }

    const modulePerm = role.permissions[module];
    if (!modulePerm) return false;

    return Boolean(modulePerm[action]);
  }

  isSuperAdmin(user: AppUser | null, role: Role | null): boolean {
    return Boolean(user?.roleCode === 'super_admin' || role?.code === 'super_admin');
  }

  // =========================================================================
  // İŞLEM DENETİM İZİ (AUDIT LOGS)
  // =========================================================================

  /**
   * Denetim kaydı yazar. Kullanıcı kimliği, rolü, IP ve zaman damgası
   * sunucu tarafından eklenir; istemci yalnızca açıklama gönderir.
   */
  async logAudit(
    action: AuditActionType,
    module: AppModule | 'auth' | 'system',
    description: string,
    details?: string,
    entityId?: string | number
  ): Promise<void> {
    try {
      await authApi.audit({ action, module, description, details, entityId });
    } catch (err) {
      console.warn('Denetim günlüğü kaydedilemedi:', err);
    }
  }

  async getAuditLogs(options?: {
    module?: string;
    action?: string;
    userId?: number;
    search?: string;
    limit?: number;
  }): Promise<AuditLog[]> {
    let logs = await api.auditLogs.list({ orderBy: 'id', orderDir: 'desc' });

    if (options?.module && options.module !== 'all') {
      logs = logs.filter(l => l.module === options.module);
    }

    if (options?.action && options.action !== 'all') {
      logs = logs.filter(l => l.action === options.action);
    }

    if (options?.userId) {
      logs = logs.filter(l => l.userId === options.userId);
    }

    if (options?.search) {
      const q = options.search.toLowerCase();
      logs = logs.filter(l =>
        l.description.toLowerCase().includes(q) ||
        l.userName.toLowerCase().includes(q) ||
        (l.details && l.details.toLowerCase().includes(q))
      );
    }

    if (options?.limit) {
      logs = logs.slice(0, options.limit);
    }

    return logs;
  }

  /** Denetim izini temizler (yalnızca Süper Admin). */
  async clearAuditLogs(): Promise<void> {
    await authApi.clearAuditLogs();
    await this.logAudit(
      'system',
      'system',
      'İşlem denetim izi (audit log) geçmişi temizlendi.'
    );
  }
}

export const userService = new UserService();
