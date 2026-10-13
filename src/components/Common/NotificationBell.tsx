import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, AlertTriangle, Hammer, Package } from 'lucide-react';
import { useAppSummary } from '../../hooks/useAppSummary';
import { useAuth } from '../../context/AuthContext';
import { usePopover } from './usePopover';
import { cn } from '../../lib/utils';

interface Note {
  id: string;
  tone: 'warning' | 'info';
  icon: typeof AlertTriangle;
  title: string;
  detail?: string;
  href: string;
}

/**
 * DMR Kinetiq üst bar bildirim zili. Notlar paylaşılan `/ops/dashboard-summary`
 * özetinden türetilir (ek istek yok, SSE ile tazelenir).
 */
export default function NotificationBell() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const { stats } = useAppSummary();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const notes = useMemo<Note[]>(() => {
    const list: Note[] = [];
    if (hasPermission('inventory', 'view') && stats.lowStockCount > 0) {
      list.push({
        id: 'low-stock',
        tone: 'warning',
        icon: AlertTriangle,
        title: `${stats.lowStockCount} üründe kritik stok`,
        detail: stats.lowStockProducts.slice(0, 4).map((p) => `${p.code} · ${p.name}`).join(', ') || undefined,
        href: '/inventory',
      });
    }
    if (hasPermission('production', 'view') && stats.activeWorkOrdersCount > 0) {
      list.push({
        id: 'active-wo',
        tone: 'info',
        icon: Hammer,
        title: `${stats.activeWorkOrdersCount} aktif iş emri`,
        detail: 'Üretim planlamada bekliyor',
        href: '/production',
      });
    }
    return list;
  }, [stats, hasPermission]);

  const count = notes.length;
  const { panelRef, style } = usePopover(triggerRef, open, () => setOpen(false), {
    width: 340,
    maxHeight: 400,
    align: 'end',
  });

  const go = (href: string) => {
    setOpen(false);
    navigate(href);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Bildirimler"
        className="relative p-2 rounded-xl border border-line text-fg-muted hover:text-fg hover:bg-surface-hover transition-colors cursor-pointer"
      >
        <Bell className="w-[18px] h-[18px]" />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 flex items-center justify-center rounded-pill bg-danger text-white text-[10px] font-bold leading-none">
            {count}
          </span>
        )}
      </button>

      {open && style && (
        <div
          ref={panelRef}
          style={style}
          className="z-50 bg-surface border border-line rounded-card shadow-raised overflow-hidden"
        >
          <div className="px-4 py-2.5 border-b border-line">
            <p className="text-xs font-black text-fg-strong">Bildirimler</p>
          </div>
          {count === 0 ? (
            <div className="px-4 py-8 text-center">
              <Package className="w-6 h-6 text-fg-muted mx-auto mb-2" />
              <p className="text-xs text-fg-muted">Yeni bildirim yok</p>
            </div>
          ) : (
            <ul className="max-h-[360px] overflow-y-auto custom-scrollbar py-1">
              {notes.map((note) => {
                const Icon = note.icon;
                return (
                  <li key={note.id}>
                    <button
                      type="button"
                      onClick={() => go(note.href)}
                      className="w-full flex items-start gap-2.5 px-4 py-2.5 text-left hover:bg-surface-hover transition-colors cursor-pointer"
                    >
                      <span
                        className={cn(
                          'w-7 h-7 rounded-lg flex items-center justify-center shrink-0',
                          note.tone === 'warning' ? 'bg-warning-soft text-warning' : 'bg-info-soft text-info'
                        )}
                      >
                        <Icon className="w-4 h-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold text-fg-strong">{note.title}</span>
                        {note.detail ? (
                          <span className="block text-2xs text-fg-muted truncate">{note.detail}</span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </>
  );
}
