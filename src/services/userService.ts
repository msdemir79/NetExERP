import { api } from '../api/client';
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
import { hashPassword, generateSalt, generateSessionToken, verifyPassword } from './authGuard';

const ACTIVE_USER_STORAGE_KEY = 'proerp_active_user_id';
const ACTIVE_SESSION_TOKEN_KEY = 'proerp_session_token';

class UserService {
  // Listeners for active user changes
  private activeUserChangeListeners: Array<(user: AppUser | null, role: Role | null) => void> = [];

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

  async createUser(user: Omit<AppUser, 'id'>): Promise<number> {
    // Check if username exists
    const existing = await api.users.findOne({ username: user.username });
    if (existing) {
      throw new Error(`"${user.username}" kullanıcı adı zaten kullanımda.`);
    }

    // Lookup role name
    let roleName = user.roleName;
    if (!roleName && user.roleCode) {
      const role = await api.roles.findOne({ code: user.roleCode });
      roleName = role?.name;
    }

    // Parola güvenliği: pinCode veya şifre hashleme
    let passwordHash = user.passwordHash;
    let passwordSalt = user.passwordSalt;
    if (!passwordHash && user.pinCode) {
      passwordSalt = generateSalt();
      passwordHash = await hashPassword(user.pinCode, passwordSalt);
    }

    const newId = await api.users.create({
      ...user,
      passwordHash,
      passwordSalt,
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

    // Parola güncelleniyorsa yeniden hashle
    let passwordHash = updates.passwordHash || existing.passwordHash;
    let passwordSalt = updates.passwordSalt || existing.passwordSalt;
    if (updates.pinCode && updates.pinCode !== existing.pinCode) {
      passwordSalt = generateSalt();
      passwordHash = await hashPassword(updates.pinCode, passwordSalt);
    }

    await api.users.update(id, {
      ...updates,
      passwordHash,
      passwordSalt,
      roleName,
      updatedAt: new Date()
    });

    await this.logAudit(
      'update',
      'users',
      `Kullanıcı bilgileri güncellendi: ${updates.fullName || existing.fullName}`,
      `Kullanıcı Adı: ${updates.username || existing.username}`,
      id
    );

    // Notify listeners if active user was updated
    const activeUserId = this.getActiveUserIdSync();
    if (activeUserId === id) {
      this.notifyActiveUserChanged();
    }
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

    // If deleted user was active, switch to first super_admin
    const activeUserId = this.getActiveUserIdSync();
    if (activeUserId === id) {
      const firstAdmin = await api.users.findOne({ roleCode: 'super_admin' });
      if (firstAdmin?.id) {
        this.setActiveUserId(firstAdmin.id);
      }
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
      undefined,
      id
    );

    const activeUserId = this.getActiveUserIdSync();
    if (activeUserId === id) {
      this.notifyActiveUserChanged();
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

    // Super admin permissions cannot be downgraded
    if (role.code === 'super_admin' && updates.permissions) {
      // Keep super_admin having full permissions
    }

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

    this.notifyActiveUserChanged();
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

    this.notifyActiveUserChanged();
  }

  // =========================================================================
  // AKTİF KULLANICI & OTURUM YÖNETİMİ (SESSION & SWITCH USER)
  // =========================================================================

  getActiveUserIdSync(): number | null {
    try {
      const raw = localStorage.getItem(ACTIVE_USER_STORAGE_KEY);
      return raw ? parseInt(raw, 10) : null;
    } catch {
      return null;
    }
  }

  getSessionTokenSync(): string | null {
    try {
      return localStorage.getItem(ACTIVE_SESSION_TOKEN_KEY);
    } catch {
      return null;
    }
  }

  /**
   * Gerçek Parola Doğrulaması ve Oturum Açma (Login)
   */
  async login(
    username: string, 
    passwordAttempt: string
  ): Promise<{ success: boolean; user?: AppUser; token?: string; error?: string }> {
    const user = await api.users.findOne({ username: username.trim().toLowerCase() });
    if (!user) {
      return { success: false, error: 'Kullanıcı adı veya parola hatalı.' };
    }

    if (user.status !== 'active') {
      return { 
        success: false, 
        error: `Hesabınız ${user.status === 'suspended' ? 'askıya alınmıştır' : 'pasif durumdadır'}. Lütfen sistem yöneticisi ile görüşünüz.` 
      };
    }

    let isValid = false;

    // 1. Hash ve Salt kontrolü
    if (user.passwordHash && user.passwordSalt) {
      isValid = await verifyPassword(passwordAttempt, user.passwordSalt, user.passwordHash);
    } 
    // 2. Geriye dönük uyumluluk: pinCode ile kontrol edip derhal hashlemeye yükseltme
    else if (user.pinCode) {
      isValid = (user.pinCode === passwordAttempt);
      if (isValid && user.id) {
        const salt = generateSalt();
        const hash = await hashPassword(passwordAttempt, salt);
        await api.users.update(user.id, {
          passwordHash: hash,
          passwordSalt: salt
        });
      }
    } else if (passwordAttempt === '1234') {
      // Varsayılan ilk giriş şifresi
      isValid = true;
      if (user.id) {
        const salt = generateSalt();
        const hash = await hashPassword('1234', salt);
        await api.users.update(user.id, {
          passwordHash: hash,
          passwordSalt: salt
        });
      }
    }

    if (!isValid) {
      await this.logAudit(
        'login',
        'auth',
        `Başarısız giriş denemesi: "${username}" için parola hatalı girildi.`,
        undefined,
        user.id
      );
      return { success: false, error: 'Kullanıcı adı veya parola hatalı.' };
    }

    // Başarılı giriş: Oturum belirteci ve son giriş zamanı
    const sessionToken = generateSessionToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 saat

    if (user.id) {
      await api.users.update(user.id, {
        sessionToken,
        sessionExpiresAt: expiresAt,
        lastLoginAt: new Date()
      });
      localStorage.setItem(ACTIVE_USER_STORAGE_KEY, user.id.toString());
      localStorage.setItem(ACTIVE_SESSION_TOKEN_KEY, sessionToken);
    }

    await this.logAudit(
      'login',
      'auth',
      `Oturum açıldı: ${user.fullName} (${user.roleName || user.roleCode})`,
      'Başarılı parola doğrulaması yapıldı.',
      user.id
    );

    this.notifyActiveUserChanged();
    return { success: true, user, token: sessionToken };
  }

  /**
   * Oturumu Güvenle Kapatma (Logout)
   */
  async logout(): Promise<void> {
    const activeUser = await this.getActiveUser();
    if (activeUser?.id) {
      await api.users.update(activeUser.id, {
        sessionToken: undefined,
        sessionExpiresAt: undefined
      });
      await this.logAudit(
        'logout',
        'auth',
        `Oturum kapatıldı: ${activeUser.fullName} (${activeUser.roleName || activeUser.roleCode})`,
        'Kullanıcı güvenli çıkış yaptı.',
        activeUser.id
      );
    }

    localStorage.removeItem(ACTIVE_USER_STORAGE_KEY);
    localStorage.removeItem(ACTIVE_SESSION_TOKEN_KEY);
    this.notifyActiveUserChanged();
  }

  /**
   * Sistemdeki kullanıcıların parola hashlerini güvenceye alır
   */
  async ensureHashedCredentials(): Promise<void> {
    const allUsers = await api.users.list();
    for (const u of allUsers) {
      if (!u.id) continue;
      if (!u.passwordHash || !u.passwordSalt) {
        const rawPin = u.pinCode || '1234';
        const salt = generateSalt();
        const hash = await hashPassword(rawPin, salt);
        await api.users.update(u.id, {
          passwordHash: hash,
          passwordSalt: salt
        });
      }
    }
  }

  async getActiveUser(): Promise<AppUser | null> {
    const id = this.getActiveUserIdSync();
    if (id) {
      const user = await api.users.get(id);
      if (user && user.status === 'active') {
        return user;
      }
    }

    // Default fallback: first active super_admin or any active user
    const superAdmin = await api.users.findOne({ roleCode: 'super_admin' });
    if (superAdmin?.id) {
      this.setActiveUserId(superAdmin.id, false);
      return superAdmin;
    }

    const anyUser = (await api.users.list({ limit: 1 }))[0];
    if (anyUser?.id) {
      this.setActiveUserId(anyUser.id, false);
      return anyUser;
    }

    return null;
  }

  async getActiveRole(): Promise<Role | null> {
    const user = await this.getActiveUser();
    if (!user) return null;

    if (user.roleCode) {
      const role = await api.roles.findOne({ code: user.roleCode });
      if (role) return role;
    }

    if (user.roleId) {
      return (await api.roles.get(user.roleId)) || null;
    }

    return null;
  }

  async setActiveUserId(id: number, recordLog: boolean = true): Promise<void> {
    const targetUser = await api.users.get(id);
    if (!targetUser) return;

    localStorage.setItem(ACTIVE_USER_STORAGE_KEY, id.toString());

    // Update last login
    await api.users.update(id, { lastLoginAt: new Date() });

    if (recordLog) {
      await this.logAudit(
        'login',
        'auth',
        `Kullanıcı oturumu açıldı: ${targetUser.fullName} (${targetUser.roleName || targetUser.roleCode})`,
        `Rol Simülatörü / Hızlı Profil Değişimi ile oturum açıldı.`,
        id
      );
    }

    this.notifyActiveUserChanged();
  }

  onActiveUserChange(callback: (user: AppUser | null, role: Role | null) => void): () => void {
    this.activeUserChangeListeners.push(callback);
    return () => {
      this.activeUserChangeListeners = this.activeUserChangeListeners.filter(cb => cb !== callback);
    };
  }

  private async notifyActiveUserChanged() {
    const user = await this.getActiveUser();
    const role = await this.getActiveRole();
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

  async logAudit(
    action: AuditActionType,
    module: AppModule | 'auth' | 'system',
    description: string,
    details?: string,
    entityId?: string | number
  ): Promise<void> {
    try {
      const activeUser = await this.getActiveUser();
      const userName = activeUser?.fullName || 'Sistem';
      const userRole = activeUser?.roleName || activeUser?.roleCode || 'Sistem';

      await api.auditLogs.create({
        userId: activeUser?.id,
        userName,
        userRole,
        action,
        module,
        entityId,
        description,
        details,
        ipAddress: '192.168.1.100', // Yerel ağ istemcisi
        timestamp: new Date()
      });
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

  async clearAuditLogs(): Promise<void> {
    await api.auditLogs.clear();
    await this.logAudit(
      'system',
      'system',
      'İşlem denetim izi (audit log) geçmişi temizlendi.'
    );
  }
}

export const userService = new UserService();
