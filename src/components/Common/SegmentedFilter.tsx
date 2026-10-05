import React from 'react';
import { cn } from '../../lib/utils';

export interface SegmentOption {
  key: string;
  label: string;
  /** Sayı varsa etiketin yanında mono fontla gösterilir (ör. kategori adetleri). */
  count?: number;
  icon?: React.ReactNode;
}

export interface SegmentedFilterProps {
  options: SegmentOption[];
  value: string;
  onChange: (key: string) => void;
  ariaLabel?: string;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Tek satırlık kompakt kategori/durum filtresi. Büyük özet kartların yerini
 * alır: aynı bilgi (etiket + adet) kalır, ekranın ana içeriğinin önüne geçmez.
 * Seçim yalnız renkle değil `aria-pressed` ile de bildirilir.
 */
export default function SegmentedFilter({
  options,
  value,
  onChange,
  ariaLabel,
  size = 'md',
  className,
}: SegmentedFilterProps) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-control border border-line bg-surface-raised p-1',
        className,
      )}
    >
      {options.map((option) => {
        const active = option.key === value;
        return (
          <button
            key={option.key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.key)}
            className={cn(
              'inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-[10px] px-3 text-xs font-bold whitespace-nowrap transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              size === 'sm' ? 'h-8' : 'h-9',
              active
                ? 'bg-surface-active text-fg-inverted shadow-card'
                : 'text-fg-muted hover:bg-surface-hover hover:text-fg-strong',
            )}
          >
            {option.icon ? <span className="flex items-center [&>svg]:h-3.5 [&>svg]:w-3.5">{option.icon}</span> : null}
            <span>{option.label}</span>
            {option.count != null ? (
              <span className="font-mono text-2xs font-black tabular-nums">{option.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
