import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from '../api/client';
import { useApiQuery } from '../hooks/useApiQuery';
import { userService } from '../services/userService';
import type { AppUser, Role, AppModule, PermissionAction } from '../types';

interface AuthContextType {
  currentUser: AppUser | null;
  currentRole: Role | null;
  users: AppUser[];
  roles: Role[];
  isLoading: boolean;
  sessionToken: string | null;
  switchUser: (userId: number) => Promise<void>;
  login: (username: string, passwordAttempt: string) => Promise<{ success: boolean; user?: AppUser; token?: string; error?: string }>;
  logout: () => Promise<void>;
  hasPermission: (module: AppModule, action?: PermissionAction) => boolean;
  isSuperAdmin: boolean;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [currentRole, setCurrentRole] = useState<Role | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(() => userService.getSessionTokenSync());
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Live queries for all users and roles
  const users = useApiQuery(() => api.users.list(), [], ['users']) || [];
  const roles = useApiQuery(() => api.roles.list(), [], ['roles']) || [];

  const loadActiveUserAndRole = useCallback(async () => {
    try {
      const user = await userService.getActiveUser();
      setCurrentUser(user);
      setSessionToken(userService.getSessionTokenSync());

      if (user) {
        let role: Role | undefined;
        if (user.roleCode) {
          role = await api.roles.findOne({ code: user.roleCode });
        }
        if (!role && user.roleId) {
          role = await api.roles.get(user.roleId);
        }
        setCurrentRole(role || null);
      } else {
        setCurrentRole(null);
      }
    } catch (err) {
      console.error('Auth yükleme hatası:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadActiveUserAndRole();

    const unsubscribe = userService.onActiveUserChange((user, role) => {
      setCurrentUser(user);
      setCurrentRole(role);
      setSessionToken(userService.getSessionTokenSync());
    });

    return () => {
      unsubscribe();
    };
  }, [loadActiveUserAndRole]);

  // If users or roles change in DB (e.g. initial seeding completes), re-evaluate
  useEffect(() => {
    if (!currentUser && users.length > 0) {
      loadActiveUserAndRole();
    } else if (currentUser && roles.length > 0) {
      const updatedRole = roles.find(r => r.code === currentUser.roleCode || r.id === currentUser.roleId);
      if (updatedRole) {
        setCurrentRole(updatedRole);
      }
    }
  }, [users, roles, currentUser, loadActiveUserAndRole]);

  const switchUser = async (userId: number) => {
    setIsLoading(true);
    try {
      await userService.setActiveUserId(userId, true);
      await loadActiveUserAndRole();
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (username: string, passwordAttempt: string) => {
    setIsLoading(true);
    try {
      const res = await userService.login(username, passwordAttempt);
      if (res.success) {
        await loadActiveUserAndRole();
      }
      return res;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await userService.logout();
      setCurrentUser(null);
      setCurrentRole(null);
      setSessionToken(null);
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
    users,
    roles,
    isLoading,
    sessionToken,
    switchUser,
    login,
    logout,
    hasPermission,
    isSuperAdmin,
    refreshAuth: loadActiveUserAndRole
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
