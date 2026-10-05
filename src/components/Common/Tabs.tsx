import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface TabItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  disabled?: boolean;
  /** Numaralı modda adım numarası yerine onay işareti gösterilir. */
  completed?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (key: string) => void;
  /** Numaralı adım görünümü (stok kartı stepper-sekmeli hibrit). */
  numbered?: boolean;
  size?: 'sm' | 'md';
  ariaLabel?: string;
  className?: string;
}

export const tabId = (key: string) => `tab-${key}`;
export const tabPanelId = (key: string) => `tabpanel-${key}`;

/**
 * Yatay sekme şeridi. `role="tablist"` + `aria-selected` ve ok tuşlarıyla
 * gezinme desteği vardır; sekmeler doğrudan tıklanabilir (adımlar kilitli
 * değildir), böylece uzun formlarda istenen bölüme tek tıkla geçilir.
 */
export default function Tabs({
  items,
  value,
  onChange,
  numbered = false,
  size = 'md',
  ariaLabel,
  className,
}: TabsProps) {
  const enabledKeys = items.filter((item) => !item.disabled).map((item) => item.key);

  const move = (event: React.KeyboardEvent) => {
    if (enabledKeys.length === 0) return;
    const position = enabledKeys.indexOf(value);
    let next: string | undefined;
    if (event.key === 'ArrowRight') next = enabledKeys[(position + 1) % enabledKeys.length];
    else if (event.key === 'ArrowLeft') next = enabledKeys[(position - 1 + enabledKeys.length) % enabledKeys.length];
    else if (event.key === 'Home') next = enabledKeys[0];
    else if (event.key === 'End') next = enabledKeys[enabledKeys.length - 1];
    if (!next) return;
    event.preventDefault();
    onChange(next);
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={move}
      className={cn('flex items-center gap-1 overflow-x-auto border-b border-line', className)}
    >
      {items.map((item, index) => {
        const active = item.key === value;
        const showCheck = numbered && item.completed && !active;
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            id={tabId(item.key)}
            aria-selected={active}
            aria-controls={tabPanelId(item.key)}
            tabIndex={active ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onChange(item.key)}
            className={cn(
              'relative flex shrink-0 cursor-pointer items-center gap-2 border-b-2 px-3 text-xs whitespace-nowrap transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              size === 'sm' ? 'h-9' : 'h-11',
              active
                ? 'border-brand font-black text-brand-fg'
                : 'border-transparent font-bold text-fg-muted hover:border-line-strong hover:text-fg-strong',
              item.disabled && 'cursor-not-allowed opacity-50 hover:border-transparent hover:text-fg-muted',
            )}
          >
            {numbered ? (
              <span
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-pill text-2xs font-black',
                  showCheck
                    ? 'bg-success-soft text-success'
                    : active
                      ? 'bg-brand text-on-brand'
                      : 'bg-surface-raised text-fg-muted',
                )}
              >
                {showCheck ? <Check className="h-3 w-3" /> : index + 1}
              </span>
            ) : (
              item.icon
            )}
            <span>{item.label}</span>
            {item.badge}
          </button>
        );
      })}
    </div>
  );
}
