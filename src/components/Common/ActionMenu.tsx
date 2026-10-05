import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';
import { cn } from '../../lib/utils';
import { usePopover } from './usePopover';

export interface ActionMenuItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
  onSelect: () => void;
  tone?: 'default' | 'danger';
  disabled?: boolean;
}

export interface ActionMenuProps {
  items: ActionMenuItem[];
  /** Erişilebilir ad; `title` olarak da gösterilir. */
  label?: string;
  /** 'end' = panel sağ kenara hizalanır (tablo satırının son hücresi). */
  align?: 'start' | 'end';
  /** Varsayılan tetikleyici ikonu (MoreVertical). */
  icon?: React.ReactNode;
  buttonClassName?: string;
  menuClassName?: string;
}

const MENU_WIDTH = 224;
const MENU_MAX_HEIGHT = 320;

/**
 * Satır/başlık işlemlerini tek `⋮` menüsünde toplar. Panel `document.body`'ye
 * çizilir; tablo ve modal kapsayıcılarının `overflow` kırpması etkilemez.
 * Olaylar yayılmaz, böylece DataGrid'in `onRowClick`'i tetiklenmez.
 */
export default function ActionMenu({
  items,
  label = 'İşlemler',
  align = 'end',
  icon,
  buttonClassName,
  menuClassName,
}: ActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const { panelRef, style } = usePopover(triggerRef, isOpen, () => setIsOpen(false), {
    width: MENU_WIDTH,
    maxHeight: MENU_MAX_HEIGHT,
    align,
  });

  useEffect(() => {
    if (!isOpen || !style) return;
    const first = items.findIndex((item) => !item.disabled);
    const index = first >= 0 ? first : 0;
    setActiveIndex(index);
    itemRefs.current[index]?.focus();
    // `items` bilerek bağımlılık değil: çağıran her render'da yeni dizi
    // geçirdiği için odak sürekli ilk öğeye döner, ok tuşlarıyla gezinme bozulurdu.
  }, [isOpen, style]);

  if (items.length === 0) return null;

  const enabledIndexes = items.reduce<number[]>((acc, item, index) => {
    if (!item.disabled) acc.push(index);
    return acc;
  }, []);

  const run = (item: ActionMenuItem) => {
    if (item.disabled) return;
    setIsOpen(false);
    item.onSelect();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!isOpen) {
      if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        event.stopPropagation();
        setIsOpen(true);
      }
      return;
    }
    if (enabledIndexes.length === 0) return;
    const position = enabledIndexes.indexOf(activeIndex);

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const next =
        position < 0
          ? enabledIndexes[0]
          : enabledIndexes[(position + step + enabledIndexes.length) % enabledIndexes.length];
      setActiveIndex(next);
      itemRefs.current[next]?.focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      event.stopPropagation();
      const next = event.key === 'Home' ? enabledIndexes[0] : enabledIndexes[enabledIndexes.length - 1];
      setActiveIndex(next);
      itemRefs.current[next]?.focus();
    } else if (event.key === 'Escape') {
      event.stopPropagation();
      setIsOpen(false);
      triggerRef.current?.focus();
    } else if (event.key === 'Tab') {
      setIsOpen(false);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={(event) => {
          event.stopPropagation();
          setIsOpen((open) => !open);
        }}
        onKeyDown={onKeyDown}
        className={cn(
          'inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-control border transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          isOpen ? 'border-brand bg-brand-soft text-brand-fg' : 'border-line bg-surface text-fg-muted hover:bg-surface-hover hover:text-fg-strong',
          buttonClassName,
        )}
      >
        {icon ?? <MoreVertical className="h-4 w-4" />}
      </button>

      {isOpen && style
        ? createPortal(
            <div
              ref={panelRef}
              role="menu"
              aria-label={label}
              style={style}
              onKeyDown={onKeyDown}
              className={cn(
                'z-[95] flex flex-col gap-0.5 overflow-y-auto overscroll-contain rounded-card border border-line bg-surface p-1.5 shadow-raised',
                menuClassName,
              )}
            >
              {items.map((item, index) => (
                <button
                  key={item.key}
                  ref={(element) => {
                    itemRefs.current[index] = element;
                  }}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  tabIndex={index === activeIndex ? 0 : -1}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={(event) => {
                    event.stopPropagation();
                    run(item);
                  }}
                  className={cn(
                    'flex min-h-9 w-full cursor-pointer items-center gap-2 rounded-control px-2.5 py-2 text-left text-xs font-bold transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    item.tone === 'danger' ? 'text-danger hover:bg-danger-soft' : 'text-fg-strong hover:bg-surface-hover',
                    item.disabled && 'cursor-not-allowed opacity-50 hover:bg-transparent',
                  )}
                >
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center [&>svg]:h-4 [&>svg]:w-4">
                    {item.icon}
                  </span>
                  <span className="truncate">{item.label}</span>
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
