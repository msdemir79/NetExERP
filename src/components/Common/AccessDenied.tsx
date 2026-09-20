import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, ArrowLeft, Users, Home } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ALL_APP_MODULES } from '../../data/initialRoles';
import type { AppModule } from '../../types';

interface AccessDeniedProps {
  module?: AppModule;
  action?: string;
  title?: string;
  description?: string;
}

export default function AccessDenied({
  module,
  action = 'görüntüleme',
  title = 'Erişim Yetkiniz Bulunmamaktadır',
  description
}: AccessDeniedProps) {
  const navigate = useNavigate();
  const { currentUser, currentRole, users, switchUser } = useAuth();

  const moduleInfo = ALL_APP_MODULES.find(m => m.id === module);
  const moduleName = moduleInfo?.name || module || 'Bu modül';

  const defaultDescription = description || `Mevcut rolünüz (${currentRole?.name || currentUser?.roleName || 'Tanımsız'}), ${moduleName} ekranı için ${action} yetkisine sahip değildir. İşlem yapmak için sistem yöneticinizle görüşebilir veya aşağıdan yetkili bir kullanıcı profiline geçiş yapabilirsiniz.`;

  // Filter super admin or users that have view permission
  const authorizedUsers = users.filter(u => u.status === 'active' && u.roleCode === 'super_admin');

  return (
    <div className="min-h-[460px] flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700/80 dark:border-slate-800/80 shadow-sm p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center mx-auto mb-5 text-rose-600 shadow-xs">
          <ShieldAlert className="w-8 h-8" />
        </div>

        <span className="inline-block px-3 py-1 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold rounded-full uppercase tracking-wider mb-2">
          Yetkisiz Erişim (403)
        </span>

        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
          {title}
        </h2>

        <p className="text-xs text-slate-600 mt-2 leading-relaxed">
          {defaultDescription}
        </p>

        {/* Current User Info */}
        <div className="mt-5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 flex items-center justify-between text-left text-xs">
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase block">Aktif Kullanıcı</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">{currentUser?.fullName}</span>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-slate-400 font-bold uppercase block">Aktif Rol</span>
            <span className="font-semibold text-indigo-600">{currentRole?.name || currentUser?.roleName}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-2.5">
          <button
            onClick={() => navigate(-1)}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:bg-slate-800/50 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Önceki Sayfaya Dön
          </button>

          <button
            onClick={() => navigate('/')}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors shadow-xs"
          >
            <Home className="w-4 h-4" />
            Ana Panele Git
          </button>
        </div>

        {/* Quick Switch to Super Admin */}
        {authorizedUsers.length > 0 && currentUser?.roleCode !== 'super_admin' && (
          <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800">
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">Demo / Test Ortamı Hızlı Yetkilendirme:</p>
            <button
              onClick={() => authorizedUsers[0]?.id && switchUser(authorizedUsers[0].id)}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-semibold hover:bg-indigo-100 transition-colors"
            >
              <Users className="w-3.5 h-3.5" />
              Süper Admin ({authorizedUsers[0].fullName}) Hesabına Geç
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
