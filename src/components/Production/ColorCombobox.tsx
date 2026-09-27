import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ChevronDown, Check, Plus } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { Product } from '../../types';

// Helper: Extract all colors registered for a product card
export function getProductAvailableColors(prod?: Product): string[] {
  if (!prod) return [];
  const colorSet = new Set<string>();

  if (Array.isArray(prod.colors)) {
    prod.colors.forEach(c => c && colorSet.add(c.trim().toUpperCase()));
  }
  if (Array.isArray(prod.variantBarcodes)) {
    prod.variantBarcodes.forEach(v => v.color && colorSet.add(v.color.trim().toUpperCase()));
  }
  if (Array.isArray(prod.colorBoxBarcodes)) {
    prod.colorBoxBarcodes.forEach(cb => cb.color && colorSet.add(cb.color.trim().toUpperCase()));
  }

  return Array.from(colorSet).filter(Boolean);
}

// Interactive Color Combobox Component
interface ColorComboboxProps {
  value?: string;
  onChange: (color: string) => void;
  availableColors: string[];
  targetModelColor?: string;
  placeholder?: string;
}

const ColorCombobox: React.FC<ColorComboboxProps> = ({
  value = '',
  onChange,
  availableColors,
  targetModelColor,
  placeholder = 'Renk Seçin...'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSearchTerm(value || '');
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredColors = useMemo(() => {
    if (!searchTerm.trim()) return availableColors;
    const term = searchTerm.trim().toUpperCase();
    return availableColors.filter(c => c.toUpperCase().includes(term));
  }, [availableColors, searchTerm]);

  const handleSelect = (color: string) => {
    onChange(color);
    setSearchTerm(color);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="flex items-center relative">
        <input
          type="text"
          value={searchTerm}
          placeholder={availableColors.length > 0 ? `${placeholder} (${availableColors.length})` : 'Renk Giriniz...'}
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            const val = e.target.value.toUpperCase();
            setSearchTerm(val);
            onChange(val);
            setIsOpen(true);
          }}
          className={cn(
            "w-full border rounded-lg py-1.5 pl-2.5 pr-7 text-xs font-bold uppercase transition-all shadow-2xs focus:outline-none focus:ring-1 focus:ring-indigo-500",
            value
              ? "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100"
              : "bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-500",
            targetModelColor && value && value.toUpperCase() === targetModelColor.toUpperCase() &&
              "border-indigo-400 dark:border-indigo-500 text-indigo-700 dark:text-indigo-300 font-black"
          )}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setIsOpen(!isOpen)}
          className="absolute right-1.5 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
        >
          <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-200", isOpen && "rotate-180")} />
        </button>
      </div>

      {isOpen && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden max-h-56 overflow-y-auto">
          {availableColors.length > 0 ? (
            <div className="p-1.5 space-y-1">
              <div className="px-2 py-1 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
                <span>Ürüne Tanımlı Renkler</span>
                <span className="bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.2 rounded font-mono text-[9px]">
                  {availableColors.length} Renk
                </span>
              </div>

              {filteredColors.map((col) => {
                const isSelected = value.toUpperCase() === col.toUpperCase();
                const isModelTarget = targetModelColor && targetModelColor !== 'all' && col.toUpperCase() === targetModelColor.toUpperCase();

                return (
                  <button
                    key={col}
                    type="button"
                    onClick={() => handleSelect(col)}
                    className={cn(
                      "w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-bold uppercase flex items-center justify-between transition-colors cursor-pointer",
                      isSelected
                        ? "bg-indigo-600 text-white"
                        : "hover:bg-indigo-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "w-2.5 h-2.5 rounded-full border",
                        isSelected ? "bg-white border-white" : "bg-slate-400 dark:bg-slate-600 border-slate-300"
                      )} />
                      <span>{col}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {isModelTarget && (
                        <span className={cn(
                          "text-[9px] px-1.5 py-0.2 rounded font-black tracking-tight",
                          isSelected ? "bg-indigo-800 text-white" : "bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300"
                        )}>
                          🎯 Model Rengi
                        </span>
                      )}
                      {isSelected && <Check className="w-3.5 h-3.5" />}
                    </div>
                  </button>
                );
              })}

              {/* Free text option if user typed something not in list */}
              {searchTerm && !availableColors.some(c => c.toUpperCase() === searchTerm.toUpperCase()) && (
                <button
                  type="button"
                  onClick={() => handleSelect(searchTerm.toUpperCase())}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-bold uppercase text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 flex items-center gap-2 border border-amber-200 dark:border-amber-800"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Özel Renk Olarak Ekle: "{searchTerm}"</span>
                </button>
              )}
            </div>
          ) : (
            <div className="p-3 text-center text-xs text-slate-500 dark:text-slate-400">
              <p className="font-semibold">Bu malzeme kartında renk kaydı yok.</p>
              <p className="text-[10px] text-slate-400 mt-1">İstediğiniz rengi klavyeden yazabilirsiniz.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ColorCombobox;
