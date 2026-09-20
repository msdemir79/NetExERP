import React from 'react';
import { X, Users, Shield, Check, ArrowRight, Sparkles, UserCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import type { AppUser } from '../../types';

interface UserSwitcherModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function UserSwitcherModal({ isOpen, onClose }: UserSwitcherModalProps) {
  const { currentUser, users, switchUser } = useAuth();

  if (!isOpen) return null;

  const handleSelectUser = async (user: AppUser) => {
    if (!user.id) return;
    if (user.status !== 'active') {
      alert('Bu kullanıcı hesabı aktif değildir, giriş yapılamaz.');
      return;
    }
    await switchUser(user.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold tracking-tight">Kullanıcı & Rol Değiştir</h2>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/30">
                  Canlı Simülatör
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Farklı rollerdeki kullanıcı hesaplarına geçerek yetkileri anında test edin
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User list */}
        <div className="p-5 max-h-[460px] overflow-y-auto space-y-2 custom-scrollbar flex-1 min-h-0">
          {users.map((u) => {
            const isCurrent = currentUser?.id === u.id;
            const isActive = u.status === 'active';

            return (
              <div
                key={u.id}
                onClick={() => handleSelectUser(u)}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                  isCurrent
                    ? 'bg-indigo-50/80 border-indigo-300 shadow-xs ring-1 ring-indigo-500/30'
                    : isActive
                    ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:bg-slate-800/50'
                    : 'bg-slate-50 dark:bg-slate-800/50/60 border-slate-200 dark:border-slate-700 opacity-60 cursor-not-allowed'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-sm shrink-0 shadow-xs"
                    style={{ backgroundColor: u.color || '#4f46e5' }}
                  >
                    {u.fullName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                        {u.fullName}
                      </span>
                      {isCurrent && (
                        <span className="px-2 py-0.5 rounded-md bg-indigo-600 text-white text-[10px] font-bold">
                          Aktif Oturum
                        </span>
                      )}
                      {!isActive && (
                        <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 text-[10px] font-semibold">
                          {u.status === 'suspended' ? 'Askıda' : 'Pasif'}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      <span className="font-semibold text-slate-700 dark:text-slate-200">{u.title || u.department}</span>
                      <span>•</span>
                      <span className="text-indigo-600 font-medium">{u.roleName || u.roleCode}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {isCurrent ? (
                    <div className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                      <Check className="w-4 h-4" />
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={!isActive}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isActive) handleSelectUser(u);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-indigo-600 hover:text-white text-slate-700 dark:text-slate-200 text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed"
                    >
                      <span>Geçiş Yap</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer info */}
        <div className="px-6 py-3 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span>Kullanıcı değiştiğinde sol menü ve işlem butonları anında yetkiye göre güncellenir.</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-900 text-white font-semibold hover:bg-slate-800 transition-colors"
          >
            Tamam
          </button>
        </div>
      </div>
    </div>
  );
}
