import type { ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface FilterBarSearch {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export interface FilterBarProps {
  /** Sol taraftaki arama kutusu. */
  search?: FilterBarSearch;
  /** Arama ile aynı satırda duran dropdown/select filtreleri. */
  filters?: ReactNode;
  /** Sağa hizalanan birincil aksiyonlar (Excel'e Aktar, Yeni kayıt vb.). */
  actions?: ReactNode;
  /** "Filtreleri Temizle" butonu; yalnızca `clearable` doğruysa görünür. */
  onClear?: () => void;
  clearable?: boolean;
  /** İkinci satırda "N kayıt" sayacı. */
  resultCount?: number;
  /** İkinci satır içeriği (ör. SegmentedFilter pills). */
  children?: ReactNode;
  className?: string;
}

/**
 * DMR Kinetiq standart liste aracı çubuğu: arama + filtreler + temizle +
 * aksiyonlar, tutarlı kart içinde. Tüm liste ekranları bunu kullanır.
 */
export default function FilterBar({
  search,
  filters,
  actions,
  onClear,
  clearable,
  resultCount,
  children,
  className,
}: FilterBarProps) {
  const hasSecondRow = children != null || resultCount !== undefined;

  return (
    <div className={cn('space-y-3 rounded-card border border-line bg-surface p-3 shadow-card', className)}>
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        {search && (
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-fg-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search.value}
              onChange={(e) => search.onChange(e.target.value)}
              placeholder={search.placeholder || 'Ara…'}
              className="w-full h-9 pl-9 pr-9 text-xs rounded-control border border-line bg-surface-hover/50 text-fg placeholder:text-fg-muted outline-none focus:border-brand focus:ring-2 focus:ring-ring transition-colors"
            />
            {search.value && (
              <button
                type="button"
                onClick={() => search.onChange('')}
                aria-label="Aramayı temizle"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg-strong transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {filters && <div className="flex flex-wrap items-center gap-2">{filters}</div>}

        {clearable && onClear && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-control border border-line text-2xs font-semibold text-fg-muted hover:text-danger hover:border-danger hover:bg-danger-soft transition-colors cursor-pointer whitespace-nowrap"
          >
            <X className="w-3.5 h-3.5" />
            Filtreleri Temizle
          </button>
        )}

        {actions && <div className="flex flex-wrap items-center gap-2 lg:ml-auto">{actions}</div>}
      </div>

      {hasSecondRow && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 flex-1">{children}</div>
          {resultCount !== undefined && (
            <span className="text-2xs font-semibold text-fg-muted whitespace-nowrap tabular-nums">
              {resultCount} kayıt
            </span>
          )}
        </div>
      )}
    </div>
  );
}
