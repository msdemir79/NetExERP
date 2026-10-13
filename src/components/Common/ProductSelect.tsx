import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { usePopover } from './usePopover';
import { cn } from '../../lib/utils';
import { formatQuantity } from '../../lib/inventoryCalculator';
import type { Product } from '../../types';

const PANEL_WIDTH = 440;
const PANEL_MAX_HEIGHT = 360;

function searchFields(product: Product): string {
  return [
    product.code,
    product.name,
    product.barcode,
    product.brand,
    product.subType,
    product.category,
    product.moldCode,
    product.moldGroup,
    ...(product.variantBarcodes || []).map((v) => v.barcode),
    ...(product.colorBoxBarcodes || []).map((c) => c.barcode),
    ...(product.colors || []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('tr');
}

function matches(product: Product, needle: string): boolean {
  if (!needle) return true;
  return searchFields(product).includes(needle);
}

function subtitle(product: Product): string {
  return [product.code, product.subType || product.category, product.brand].filter(Boolean).join(' · ');
}

export interface ProductSelectProps {
  /** Stok kartı listesi. Çağıran ekran zaten yüklüyor; bileşen sorgu yapmaz. */
  products: Product[];
  value?: number | null;
  /** Seçilen kart da döner; çağıran taraf fiyat/koli bilgisini yeniden aramak zorunda kalmaz. */
  onChange: (productId: number | null, product: Product | null) => void;
  placeholder?: string;
  disabled?: boolean;
  allowClear?: boolean;
  /** Panel satırında stok miktarı gösterilir. */
  showStock?: boolean;
  /** Satıra eklenen bilgi metni (ör. üretim ihtiyacı, koli/asorti bilgisi). */
  optionSuffix?: (product: Product) => string;
  /** Tablo satırları için tek satırlı yoğun görünüm. */
  compact?: boolean;
  className?: string;
}

/**
 * Aranabilir stok seçici. Native `<select>` yüzlerce stok kartında kullanılamaz
 * olduğu için panelin en üstünde arama kutusu vardır; kod, ad, barkod, marka ve
 * alt tür üzerinde tr-küçük harf ile arar. Panel portal üzerinden çizilir, böylece
 * tablo hücrelerindeki `overflow` kapsayıcıları paneli kırpmaz.
 */
export function ProductSelect({
  products,
  value = null,
  onChange,
  placeholder = 'Stok kartı seçin...',
  disabled = false,
  allowClear = true,
  showStock = true,
  optionSuffix,
  compact = false,
  className,
}: ProductSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [term, setTerm] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const { panelRef, style } = usePopover(triggerRef, isOpen, () => setIsOpen(false), {
    width: PANEL_WIDTH,
    maxHeight: PANEL_MAX_HEIGHT,
  });

  const byId = useMemo(() => {
    const map = new Map<number, Product>();
    for (const p of products) if (p.id != null) map.set(Number(p.id), p);
    return map;
  }, [products]);

  const selectedId = value == null || value === 0 ? null : Number(value);
  const selected = selectedId != null ? byId.get(selectedId) ?? null : null;

  useEffect(() => {
    if (isOpen) {
      setTerm('');
      searchRef.current?.focus();
    }
  }, [isOpen]);

  const pick = (product: Product) => {
    onChange(Number(product.id), product);
    setIsOpen(false);
  };

  const clear = (event?: React.MouseEvent | React.KeyboardEvent) => {
    event?.stopPropagation();
    onChange(null, null);
  };

  const filtered = useMemo(() => {
    const needle = term.trim().toLocaleLowerCase('tr');
    return needle ? products.filter((p) => matches(p, needle)) : products;
  }, [products, term]);

  return (
    <div className={cn('relative w-full', className)}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((open) => !open)}
        className={cn(
          'w-full flex items-center justify-between gap-2 rounded-lg border text-left transition-all shadow-2xs cursor-pointer disabled:cursor-not-allowed disabled:opacity-60',
          compact ? 'px-2 py-1' : 'px-2.5 py-1.5',
          selected
            ? 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600'
            : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700',
          isOpen && 'ring-1 ring-indigo-500 border-indigo-500',
        )}
      >
        {selected ? (
          compact ? (
            <span className="text-[11px] font-black text-slate-900 dark:text-slate-100 truncate">
              <span className="font-mono text-slate-600 dark:text-slate-300">{selected.code}</span>
              {' · '}{selected.name}
            </span>
          ) : (
            <span className="min-w-0">
              <span className="block text-[11px] font-black text-slate-900 dark:text-slate-100 truncate">
                {selected.name}
              </span>
              <span className="block text-[10px] font-bold font-mono text-slate-600 dark:text-slate-300 truncate">
                {subtitle(selected)}
              </span>
            </span>
          )
        ) : (
          <span className={cn('font-bold text-slate-600 dark:text-slate-300 truncate', compact ? 'text-[11px]' : 'text-xs')}>
            {placeholder}
          </span>
        )}
        <span className="flex items-center gap-1 shrink-0">
          {allowClear && selected && !disabled && (
            <span
              role="button"
              tabIndex={0}
              title="Stok seçimini temizle"
              onClick={clear}
              onKeyDown={(e) => { if (e.key === 'Enter') clear(e); }}
              className="p-0.5 text-slate-400 hover:text-rose-600 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          )}
          <ChevronDown className={cn('text-slate-400 transition-transform duration-200', compact ? 'w-3.5 h-3.5' : 'w-4 h-4', isOpen && 'rotate-180')} />
        </span>
      </button>

      {isOpen && style && createPortal(
        <div
          ref={panelRef}
          style={style}
          className="z-[90] bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden flex flex-col"
        >
          <div className="p-2 border-b border-slate-100 dark:border-slate-800">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={searchRef}
                type="text"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Stok kodu, adı, barkod, marka veya alt tür ara..."
                className="w-full bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg pl-8 pr-2.5 py-1.5 text-xs font-bold text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="overflow-y-auto p-1.5 space-y-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs font-semibold text-slate-600 dark:text-slate-300">
                Aramaya uyan stok kartı bulunamadı.
              </div>
            ) : (
              filtered.map((product) => {
                const isSelected = selectedId != null && Number(product.id) === selectedId;
                const suffix = optionSuffix ? optionSuffix(product) : '';
                return (
                  <button
                    key={`prod-opt-${product.id}`}
                    type="button"
                    onClick={() => pick(product)}
                    className={cn(
                      'w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between gap-2 transition-colors cursor-pointer',
                      isSelected
                        ? 'bg-indigo-50 dark:bg-indigo-500/15 ring-1 ring-indigo-300 dark:ring-indigo-500/40'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800',
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block text-xs font-black text-slate-900 dark:text-slate-100 truncate">
                        {product.name}
                      </span>
                      <span className="block text-[10px] font-bold font-mono text-slate-600 dark:text-slate-300 truncate">
                        {subtitle(product)}
                      </span>
                      {suffix && (
                        <span className="block text-[10px] font-bold text-amber-700 dark:text-amber-400 truncate">
                          {suffix}
                        </span>
                      )}
                    </span>
                    <span className="flex items-center gap-1.5 shrink-0">
                      {showStock && (
                        <span
                          className={cn(
                            'text-[10px] font-black font-mono',
                            (product.stock || 0) <= 0
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-slate-700 dark:text-slate-200',
                          )}
                          title={`Stok: ${formatQuantity(product.stock || 0)} ${product.unit || ''}`}
                        >
                          {formatQuantity(product.stock || 0)}
                        </span>
                      )}
                      {isSelected && <Check className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          <div className="border-t border-slate-100 dark:border-slate-800 px-2.5 py-1.5 flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300">
              {term.trim() ? `${filtered.length} / ${products.length} stok kartı` : `${products.length} stok kartı`}
            </span>
            {term.trim() && (
              <button
                type="button"
                onClick={() => setTerm('')}
                className="text-[10px] font-black uppercase tracking-wider text-indigo-700 dark:text-indigo-300 hover:underline cursor-pointer"
              >
                Aramayı temizle
              </button>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

export default ProductSelect;
