import { Package } from 'lucide-react';
import { cn } from '../../lib/utils';
import { getColorSwatch } from '../../lib/colorSwatches';
import type { Product } from '../../types';

interface ProductBrowserListProps {
  filteredProducts: Product[];
  orderType: 'sales' | 'purchase';
  selectedProduct: Product | null;
  onSelect: (p: Product) => void;
}

export function ProductBrowserList({ filteredProducts, orderType, selectedProduct, onSelect }: ProductBrowserListProps) {
  return (
    <div className="lg:col-span-5 flex flex-col space-y-2 border border-slate-200 dark:border-slate-700 rounded-2xl bg-white dark:bg-slate-900 p-2.5 shadow-2xs">
      <div className="flex items-center justify-between px-2 py-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
        <span>Ürün Listesi ({filteredProducts.length})</span>
        <span>{orderType === 'sales' ? 'Satış Fiyatı' : 'Alış Fiyatı'}</span>
      </div>

      <div className="overflow-y-auto max-h-[500px] space-y-1.5 pr-1">
        {filteredProducts.length === 0 ? (
          <div className="p-8 text-center text-slate-400 space-y-2">
            <Package className="w-8 h-8 mx-auto opacity-40" />
            <p className="text-xs font-bold">Aradığınız kriterde ürün bulunamadı.</p>
          </div>
        ) : (
          filteredProducts.map(p => {
            const isSelected = selectedProduct?.id === p.id;
            const price = orderType === 'sales' ? p.sellingPrice : p.buyingPrice;
            const hasStock = (p.stock || 0) > 0;

            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelect(p)}
                className={cn(
                  "w-full text-left p-3 rounded-xl border transition-all flex items-start justify-between gap-2.5 cursor-pointer relative",
                  isSelected
                    ? "bg-indigo-50/80 border-indigo-600 text-slate-900 dark:text-slate-100 shadow-sm ring-1 ring-indigo-500"
                    : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700/80 dark:border-slate-800/80 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:bg-slate-800/50 hover:border-slate-300"
                )}
              >
                {/* Left: Thumbnail & Info */}
                <div className="flex items-start gap-2.5 min-w-0">
                  {p.image ? (
                    <img
                      src={p.image}
                      alt={p.name}
                      className="w-11 h-11 object-cover rounded-lg border border-slate-200 dark:border-slate-700 shrink-0 mt-0.5 bg-slate-50 dark:bg-slate-800/50"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className={cn(
                      "w-11 h-11 rounded-lg border flex items-center justify-center shrink-0 mt-0.5 font-mono text-xs font-bold",
                      isSelected ? "bg-indigo-100 border-indigo-300 text-indigo-700" : "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400"
                    )}>
                      <Package className="w-5 h-5" />
                    </div>
                  )}

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono font-black text-xs text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100 uppercase">
                        {p.code}
                      </span>
                      {p.moldCode && (
                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">
                          Kalıp: {p.moldCode}
                        </span>
                      )}
                    </div>

                    <div className="font-bold text-xs text-slate-900 dark:text-slate-100 truncate mt-1">
                      {p.name}
                    </div>

                    {/* Color dots preview */}
                    {p.colors && p.colors.length > 0 && (
                      <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                        {p.colors.slice(0, 5).map(c => {
                          const style = getColorSwatch(c);
                          return (
                            <span
                              key={c}
                              title={c}
                              className="w-2.5 h-2.5 rounded-full border border-slate-400/60 shadow-2xs"
                              style={{ backgroundColor: style.bg }}
                            />
                          );
                        })}
                        {p.colors.length > 5 && (
                          <span className="text-[9px] font-bold text-slate-400">
                            +{p.colors.length - 5}
                          </span>
                        )}
                        <span className="text-[10px] text-slate-400 font-semibold ml-1">
                          ({p.colors.length} Renk)
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Stock & Price */}
                <div className="text-right shrink-0 space-y-1">
                  <div className="font-mono font-black text-xs text-slate-900 dark:text-slate-100">
                    {(price || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                  </div>

                  <div className={cn(
                    "inline-block px-1.5 py-0.5 rounded text-[10px] font-bold",
                    hasStock ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-rose-50 text-rose-700 border border-rose-200"
                  )}>
                    {hasStock ? `${p.stock} ${p.unit || 'Çift'}` : 'Tükendi'}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
