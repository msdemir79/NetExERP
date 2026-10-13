import { useRef, useState } from 'react';
import { ChevronDown, Sun, Moon, KeyRound, LogOut, UserCog } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { usePopover } from './usePopover';
import { cn } from '../../lib/utils';

export interface UserMenuProps {
  onOpenSwitcher: () => void;
  onOpenChangePassword: () => void;
}

/**
 * DMR Kinetiq üst bar kullanıcı menüsü: avatar + ad/rol tetikleyicisi ve
 * açılır menü (kullanıcı değiştir, parola, tema, oturumu kapat).
 */
export default function UserMenu({ onOpenSwitcher, onOpenChangePassword }: UserMenuProps) {
  const { currentUser, currentRole, isSuperAdmin, logout } = useAuth();
  const { actualTheme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const { panelRef, style } = usePopover(triggerRef, open, () => setOpen(false), {
    width: 240,
    maxHeight: 360,
    align: 'end',
  });

  const initials =
    currentUser?.fullName?.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() || 'U';
  const roleLabel = currentRole?.name || currentUser?.roleName || 'Tanımsız Rol';
  const isDark = actualTheme === 'dark';

  const close = () => setOpen(false);
  const item =
    'w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-fg hover:bg-surface-hover transition-colors cursor-pointer text-left';

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 pl-1.5 pr-2 py-1.5 rounded-xl border border-line hover:bg-surface-hover transition-colors cursor-pointer"
      >
        <span
          className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-xs shrink-0 border border-white/10"
          style={{ backgroundColor: currentUser?.color || '#4f46e5' }}
        >
          {initials}
        </span>
        <span className="hidden sm:block min-w-0 text-left">
          <span className="block text-xs font-semibold text-fg-strong truncate max-w-[120px]">
            {currentUser?.fullName || 'Giriş Yapılmadı'}
          </span>
          <span className="block text-2xs text-fg-muted truncate max-w-[120px]">{roleLabel}</span>
        </span>
        <ChevronDown className={cn('w-4 h-4 text-fg-muted shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {open && style && (
        <div
          ref={panelRef}
          style={style}
          className="z-50 bg-surface border border-line rounded-card shadow-raised overflow-hidden py-1"
        >
          <div className="px-3 py-2 border-b border-line">
            <p className="text-xs font-black text-fg-strong truncate">{currentUser?.fullName}</p>
            <p className="text-2xs text-fg-muted truncate">{roleLabel}</p>
          </div>

          {isSuperAdmin && (
            <button type="button" className={item} onClick={() => { close(); onOpenSwitcher(); }}>
              <UserCog className="w-4 h-4 text-fg-muted" />
              Kullanıcı / Rol Değiştir
            </button>
          )}
          <button type="button" className={item} onClick={() => { close(); onOpenChangePassword(); }}>
            <KeyRound className="w-4 h-4 text-fg-muted" />
            Parolamı Değiştir
          </button>
          <button
            type="button"
            className={item}
            onClick={() => { close(); setTheme(isDark ? 'light' : 'dark'); }}
          >
            {isDark ? <Sun className="w-4 h-4 text-fg-muted" /> : <Moon className="w-4 h-4 text-fg-muted" />}
            {isDark ? 'Aydınlık Tema' : 'Karanlık Tema'}
          </button>

          <div className="my-1 border-t border-line" />
          <button
            type="button"
            className={cn(item, 'text-danger hover:bg-danger-soft')}
            onClick={() => { close(); logout(); }}
          >
            <LogOut className="w-4 h-4" />
            Oturumu Kapat
          </button>
        </div>
      )}
    </>
  );
}
