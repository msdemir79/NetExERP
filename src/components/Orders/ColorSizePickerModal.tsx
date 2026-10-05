import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Palette } from 'lucide-react';
import Modal from '../Modal';
import { ColorSelect } from '../Colors/ColorSelect';
import ColorSwatch from '../Colors/ColorSwatch';
import { cn } from '../../lib/utils';
import type { Product } from '../../types';

interface Props {
  product: Product | null;
  onClose: () => void;
  /** Renk adı (satır metni) ve merkezî renk kartı bağı birlikte döner. */
  onSelect: (color: string, colorId?: number | null) => void;
}

export default function ColorSizePickerModal({ product, onClose, onSelect }: Props) {
  const [highlight, setHighlight] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHighlight(0);
  }, [product?.id]);

  useEffect(() => {
    if (product) bodyRef.current?.focus();
  }, [product]);

  const { colors, sizes, matrix, rowTotals, hexByColor, idByColor } = useMemo(() => {
    if (!product) {
      return {
        colors: [] as string[],
        sizes: [] as string[],
        matrix: new Map<string, number>(),
        rowTotals: new Map<string, number>(),
        hexByColor: new Map<string, string>(),
        idByColor: new Map<string, number>(),
      };
    }
    const colorSet = new Set<string>();
    (product.colors || []).forEach(c => c && colorSet.add(c));
    (product.variantBarcodes || []).forEach(v => v.color && colorSet.add(v.color));

    // Merkezî renk kartı künyesi: gerçek HEX ve colorId buradan gelir.
    const hexMap = new Map<string, string>();
    const idMap = new Map<string, number>();
    (product.colorRefs || []).forEach(ref => {
      const key = (ref.name || '').trim().toLocaleUpperCase('tr');
      if (!key) return;
      if (ref.hexCode) hexMap.set(key, ref.hexCode);
      if (ref.id != null) idMap.set(key, Number(ref.id));
      colorSet.add(ref.name);
    });

    const sizeSet = new Set<string>();
    (product.variantBarcodes || []).forEach(v => v.size && sizeSet.add(String(v.size)));
    const sizeList = Array.from(sizeSet).sort((a, b) => {
      const na = Number(a); const nb = Number(b);
      if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
      return a.localeCompare(b, 'tr');
    });

    const stockMatrix = new Map<string, number>();
    const totals = new Map<string, number>();
    (product.variantBarcodes || []).forEach(v => {
      const key = `${v.color}||${v.size}`;
      stockMatrix.set(key, (stockMatrix.get(key) || 0) + (v.stock || 0));
      totals.set(v.color, (totals.get(v.color) || 0) + (v.stock || 0));
    });

    return {
      colors: Array.from(colorSet),
      sizes: sizeList,
      matrix: stockMatrix,
      rowTotals: totals,
      hexByColor: hexMap,
      idByColor: idMap,
    };
  }, [product]);

  if (!product) return null;

  const pick = (color: string, colorId?: number | null) => {
    if (!color || !color.trim()) return;
    const name = color.trim();
    onSelect(name, colorId ?? idByColor.get(name.toLocaleUpperCase('tr')) ?? null);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (colors.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight(h => (h + 1) % colors.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(h => (h - 1 + colors.length) % colors.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(colors[highlight]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const totalStockOf = (color: string) =>
    rowTotals.has(color) ? rowTotals.get(color)! : (colors.length === 1 ? (product.stock || 0) : 0);

  return (
    <Modal
      isOpen={Boolean(product)}
      onClose={onClose}
      title={`Renk & Beden Seçimi — ${product.code} ${product.name}`}
      size="2xl"
    >
      <div
        ref={bodyRef}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="space-y-4 outline-none"
      >
        <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1.5">
            <Palette className="w-4 h-4 text-indigo-600" />
            Renk satırını <b>çift tıklayın</b> veya ok tuşlarıyla gezip <b>Enter</b>'a basın.
          </span>
          <span className="font-mono">Toplam Stok: {product.stock || 0} {product.unit || 'Çift'}</span>
        </div>

        {colors.length === 0 ? (
          <div className="space-y-2 p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-2xl">
            <p className="text-xs font-bold text-amber-900 dark:text-amber-200">Bu ürün için tanımlı standart renk bulunmuyor.</p>
            <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-300">
              Renkler merkezî renk kartlarından seçilir. Listedeki renk yeterli değilse <b>Yeni Renk</b> ile kart açabilirsiniz.
            </p>
            <ColorSelect
              placeholder="Merkezî renk kartından seçin..."
              onChange={(colorId, color) => { if (color) pick(color.name, colorId); }}
            />
          </div>
        ) : (
          <div className="border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
            <div className="overflow-auto max-h-[50vh]">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800 border-b border-slate-300 dark:border-slate-600">
                  <tr>
                    <th className="px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Renk</th>
                    {sizes.length > 0 ? (
                      sizes.map(s => (
                        <th key={s} className="px-2 py-2 text-center text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 w-14">{s}</th>
                      ))
                    ) : (
                      <th className="px-2 py-2 text-center text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 w-24">Stok</th>
                    )}
                    <th className="px-3 py-2 text-right text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 w-24">Toplam</th>
                  </tr>
                </thead>
                <tbody>
                  {colors.map((color, i) => {
                    const isHl = i === highlight;
                    return (
                      <tr
                        key={color}
                        onClick={() => setHighlight(i)}
                        onDoubleClick={() => pick(color)}
                        className={cn(
                          'border-b border-slate-100 dark:border-slate-800 cursor-pointer transition-colors',
                          isHl ? 'bg-indigo-50 dark:bg-indigo-500/10 ring-1 ring-inset ring-indigo-300' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        )}
                      >
                        <td className="px-3 py-2">
                          <span className="flex items-center gap-2 text-xs font-bold uppercase text-slate-800 dark:text-slate-100">
                            <ColorSwatch name={color} hexCode={hexByColor.get(color.trim().toLocaleUpperCase('tr'))} size={16} className="rounded-full shrink-0" />
                            {color}
                          </span>
                        </td>
                        {sizes.length > 0 ? (
                          sizes.map(s => {
                            const st = matrix.get(`${color}||${s}`);
                            return (
                              <td key={s} className={cn('px-2 py-2 text-center font-mono text-xs',
                                st === undefined || st === 0 ? 'text-slate-300 dark:text-slate-600' : 'text-slate-700 dark:text-slate-200 font-bold')}>
                                {st ?? '-'}
                              </td>
                            );
                          })
                        ) : (
                          <td className="px-2 py-2 text-center font-mono text-xs font-bold text-slate-700 dark:text-slate-200">
                            {totalStockOf(color)}
                          </td>
                        )}
                        <td className="px-3 py-2 text-right font-mono text-xs font-black text-indigo-700 dark:text-indigo-300">
                          {totalStockOf(color)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2 border-t border-slate-200 dark:border-slate-700">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold uppercase cursor-pointer"
          >
            Vazgeç
          </button>
          {colors.length > 0 && (
            <button
              type="button"
              onClick={() => pick(colors[highlight])}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-md cursor-pointer"
            >
              Rengi Seç: {colors[highlight]?.toUpperCase()}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
