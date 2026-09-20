import React from 'react';
import { useAuth } from '../../context/AuthContext';
import type { AppModule, PermissionAction } from '../../types';

interface PermissionGateProps {
  module: AppModule;
  action?: PermissionAction;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  hideIfNoPermission?: boolean;
}

export default function PermissionGate({
  module,
  action = 'view',
  children,
  fallback = null,
  hideIfNoPermission = true
}: PermissionGateProps) {
  const { hasPermission } = useAuth();

  const allowed = hasPermission(module, action);

  if (allowed) {
    return <>{children}</>;
  }

  if (hideIfNoPermission) {
    return fallback ? <>{fallback}</> : null;
  }

  return <>{fallback}</>;
}
