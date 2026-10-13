import { useEffect, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface DetailPanelProps {
  isOpen: boolean;
  onClose: () => void;
  title: ReactNode;
  badge?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  widthClass?: string;
}

/**
 * DMR Kinetiq standardı: kayıt detayları modal yerine sağdan açılan panelde gösterilir.
 */
export default function DetailPanel({
  isOpen,
  onClose,
  title,
  badge,
  children,
  footer,
  widthClass = 'max-w-[440px]',
}: DetailPanelProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setMounted(false);
      return;
    }
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <div
        className={cn(
          'absolute inset-0 bg-slate-900/40 transition-opacity duration-200',
          mounted ? 'opacity-100' : 'opacity-0'
        )}
        onClick={onClose}
      />
      <aside
        className={cn(
          'absolute inset-y-0 right-0 w-full bg-surface border-l border-line shadow-raised flex flex-col',
          'transition-transform duration-200 ease-out',
          widthClass,
          mounted ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        <header className="flex items-center justify-between gap-2 p-4 border-b border-line shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="text-sm font-black text-fg-strong truncate">{title}</h3>
            {badge}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="p-1.5 rounded-lg text-fg-muted hover:text-fg hover:bg-surface-hover transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">{children}</div>
        {footer ? <footer className="p-4 border-t border-line shrink-0">{footer}</footer> : null}
      </aside>
    </div>
  );
}
