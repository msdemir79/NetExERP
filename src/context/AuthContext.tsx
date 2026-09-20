import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { onUnauthorized } from '../api/client';
import { userService } from '../services/userService';
import { setSessionSnapshot } from '../services/authGuard';
import type { AppUser, Role, AppModule, PermissionAction } from '../types';

export interface ImpersonationInfo {
  userId: number;
  userName: string;
}

interface AuthContextType {
  currentUser: AppUser | null;
  currentRole: Role | null;
  isLoading: boolean;
  /** Süper admin başka bir kullanıcı adına işlem yapıyorsa kaynağı. */
  impersonatedBy: ImpersonationInfo | null;
  /** Giriş sırasında tespit edilen zayıf parola uyarısı (varsa). */
  passwordWarning: string | null;
  isSuperAdmin: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  /** Yalnızca Süper Admin: başka bir kullanıcının yetkileriyle oturum açar. */
  switchUser: (userId: number) => Promise<void>;
  stopImpersonation: () => Promise<void>;
  hasPermission: (module: AppModule, action?: PermissionAction) => boolean;
  refreshAuth: () => Promise<void>;
  /** Kişinin kendi parolasını değiştirmesi (mevcut parola doğrulanır). */
  changeOwnPassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [currentRole, setCurrentRole] = useState<Role | null>(null);
  const [impersonatedBy, setImpersonatedBy] = useState<ImpersonationInfo | null>(null);
  const [passwordWarning, setPasswordWarning] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const applySession = useCallback(
    (user: AppUser | null, role: Role | null, impersonation: ImpersonationInfo | null) => {
      setCurrentUser(user);
      setCurrentRole(role);
      setImpersonatedBy(impersonation);
      // Servis katmanındaki yetki ön denetimi aynı anlık görüntüyü kullanır.
      setSessionSnapshot(user, role);
    },
    []
  );

  const refreshAuth = useCallback(async () => {
    try {
      const payload = await userService.refreshSession();
      applySession(payload?.user || null, payload?.role || null, payload?.impersonatedBy || null);
    } catch (err) {
      console.error('Oturum bilgisi alınamadı:', err);
      applySession(null, null, null);
    } finally {
      setIsLoading(false);
    }
  }, [applySession]);

  useEffect(() => {
    refreshAuth();

    const unsubscribe = userService.onActiveUserChange((user, role) => {
      applySession(user, role, userService.getImpersonatedBy());
    });

    // Oturum sunucuda düşerse (401) arayüz giriş ekranına döner.
    const unsubscribeUnauthorized = onUnauthorized(() => {
      applySession(null, null, null);
    });

    return () => {
      unsubscribe();
      unsubscribeUnauthorized();
    };
  }, [refreshAuth, applySession]);

  const login = async (username: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await userService.login(username, password);
      if (res.success) {
        const payload = userService.getCachedSession();
        applySession(payload.user || null, payload.role || null, payload.impersonatedBy || null);
        setPasswordWarning(payload.passwordWarning || null);
      }
      return { success: res.success, error: res.error };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await userService.logout();
      applySession(null, null, null);
      setPasswordWarning(null);
    } finally {
      setIsLoading(false);
    }
  };

  const changeOwnPassword = async (currentPassword: string, newPassword: string) => {
    await userService.changeOwnPassword(currentPassword, newPassword);
    // Parola artık politikaya uygun; uyarıyı kaldır.
    setPasswordWarning(null);
  };

  const switchUser = async (userId: number) => {
    setIsLoading(true);
    try {
      await userService.setActiveUserId(userId);
    } finally {
      setIsLoading(false);
    }
  };

  const stopImpersonation = async () => {
    setIsLoading(true);
    try {
      await userService.stopImpersonation();
    } finally {
      setIsLoading(false);
    }
  };

  const hasPermission = useCallback(
    (module: AppModule, action: PermissionAction = 'view'): boolean => {
      return userService.hasPermission(currentUser, currentRole, module, action);
    },
    [currentUser, currentRole]
  );

  const isSuperAdmin = Boolean(
    currentUser?.roleCode === 'super_admin' || currentRole?.code === 'super_admin'
  );

  const value: AuthContextType = {
    currentUser,
    currentRole,
    isLoading,
    impersonatedBy,
    passwordWarning,
    isSuperAdmin,
    login,
    logout,
    switchUser,
    stopImpersonation,
    hasPermission,
    refreshAuth,
    changeOwnPassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
