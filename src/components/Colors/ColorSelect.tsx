import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, Plus, Search, X } from 'lucide-react';
import ColorSwatch from './ColorSwatch';
import ColorFormModal from './ColorFormModal';
import PermissionGate from '../Common/PermissionGate';
import { foldColorName as foldName, useColorMaster } from './useColorMaster';
import { cn } from '../../lib/utils';
import type { ColorMaster } from '../../types';

function matches(color: ColorMaster, term: string): boolean {
  if (!term) return true;
  const needle = term.toLocaleLowerCase('tr');
  return [color.code, color.name, color.groupName, color.pantoneCode, color.manufacturerCode]
    .some((field) => (field || '').toLocaleLowerCase('tr').includes(needle));
}

/** Seçilebilir renkler: aktif kartlar + (kısıtlama varsa) yalnızca izin verilenler. */
function useSelectableColors(all: ColorMaster[], selectedIds: number[], restrictToIds?: number[]) {
  const [recent, setRecent] = useState<ColorMaster[]>([]);
  const merged = useMemo(() => {
    const byId = new Map<number, ColorMaster>();
    for (const c of [...all, ...recent]) byId.set(Number(c.id), c);
    return [...byId.values()];
  }, [all, recent]);

  const selectable = useMemo(
    () => (restrictToIds
      ? merged.filter((c) => restrictToIds.includes(Number(c.id)))
      : merged.filter((c) => c.isActive || selectedIds.includes(Number(c.id)))),
    [merged, restrictToIds, selectedIds],
  );

  const byId = useMemo(() => new Map(merged.map((c) => [Number(c.id), c])), [merged]);
  const addRecent = (c: ColorMaster) => setRecent((prev) => [...prev.filter((x) => x.id !== c.id), c]);
  return { selectable, byId, addRecent };
}

/* ------------------------------------------------------------------ */
/* Açılır panel                                                        */
/* ------------------------------------------------------------------ */

const PANEL_WIDTH = 300;
const PANEL_MAX_HEIGHT = 330;

interface ColorPickerPanelProps {
  isOpen: boolean;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLElement | null>;
  options: ColorMaster[];
  selectedIds: number[];
  onPick: (color: ColorMaster) => void;
  emptyMessage: string;
  /** false ise "Yeni Renk" düğmesi gösterilmez (ürüne bağlı renk kısıtı). */
  canCreate: boolean;
  onCreate: () => void;
  footerLabel?: string;
  /** Bu ada uyan seçenek "Model Rengi" olarak vurgulanır (reçete hedef rengi). */
  highlightName?: string;
}

/**
 * Renk listesi portal üzerinden çizilir: satır editörleri ve grid hücreleri
 * `overflow` kapsayıcıları içinde olduğu için normal akışta panel kırpılırdı.
 * Konum tetikleyiciye göre hesaplanır, yer dar ise üste doğru açılır.
 */
function ColorPickerPanel({
  isOpen,
  onClose,
  triggerRef,
  options,
  selectedIds,
  onPick,
  emptyMessage,
  canCreate,
  onCreate,
  footerLabel,
  highlightName,
}: ColorPickerPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [term, setTerm] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const [style, setStyle] = useState<React.CSSProperties | null>(null);

  useLayoutEffect(() => {
    if (!isOpen) { setStyle(null); return; }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.max(rect.width, PANEL_WIDTH);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < PANEL_MAX_HEIGHT && rect.top > spaceBelow;
    setStyle({
      position: 'fixed',
      left,
      width,
      maxHeight: PANEL_MAX_HEIGHT,
      ...(openUpward ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
    });
  }, [isOpen, triggerRef]);

  useEffect(() => {
    if (!isOpen) return;
    setTerm('');
    const onClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      onClose();
    };
    const onEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    // Panel sabit konumlu olduğu için sayfa kaydırılınca/boyut değişince kapanır.
    // Panelin kendi listesinin kayması konumu değiştirmediğinden kapatmaz.
    const onMove = (event: Event) => {
      const target = event.target as Node | null;
      if (target && panelRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEscape);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    searchRef.current?.focus();
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [isOpen, onClose, triggerRef]);

  if (!isOpen || !style) return null;

  const filtered = options.filter((c) => matches(c, term.trim()));

  return createPortal(
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
            placeholder="Renk adı, kod, Pantone veya üretici kodu..."
            className="w-full bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg pl-8 pr-2.5 py-1.5 text-xs font-bold text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="px-3 py-4 text-center text-xs font-semibold text-slate-600 dark:text-slate-300">{emptyMessage}</div>
      ) : (
        <div className="overflow-y-auto p-1.5 space-y-1">
          {filtered.map((color) => {
            const isSelected = selectedIds.includes(Number(color.id));
            return (
              <button
                key={color.id}
                type="button"
                onClick={() => onPick(color)}
                className={cn(
                  'w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between gap-2 transition-colors cursor-pointer',
                  isSelected ? 'bg-indigo-50 dark:bg-indigo-500/15 ring-1 ring-indigo-300 dark:ring-indigo-500/40' : 'hover:bg-slate-50 dark:hover:bg-slate-800',
                )}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <ColorSwatch name={color.name} hexCode={color.hexCode} size={20} className="rounded-md" />
                  <span className="min-w-0">
                    <span className="block text-xs font-black text-slate-900 dark:text-slate-100 uppercase truncate">{color.name}</span>
                    <span className="block text-[10px] font-bold text-slate-600 dark:text-slate-300 font-mono truncate">
                      {color.code}
                      {color.manufacturerCode ? ` · ${color.manufacturerCode}` : ''}
                      {color.groupName ? ` · ${color.groupName}` : ''}
                    </span>
                  </span>
                </span>
                <span className="flex items-center gap-1.5 shrink-0">
                  {highlightName && foldName(color.name) === foldName(highlightName) && (
                    <span className={cn(
                      'text-[9px] px-1.5 py-0.5 rounded font-black tracking-tight',
                      isSelected ? 'bg-indigo-100 text-indigo-800' : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300',
                    )}>
                      Model Rengi
                    </span>
                  )}
                  {!color.isActive && (
                    <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200">Pasif</span>
                  )}
                  {isSelected && <Check className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {canCreate && (
        <PermissionGate module="colors" action="create">
          <div className="border-t border-slate-100 dark:border-slate-800 p-1.5 flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 px-1">
              {footerLabel ?? `${selectedIds.length} renk seçili`}
            </span>
            <button
              type="button"
              onClick={onCreate}
              className="px-2.5 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Yeni Renk
            </button>
          </div>
        </PermissionGate>
      )}
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ */
/* Tekli seçim                                                         */
/* ------------------------------------------------------------------ */

export interface ColorSelectProps {
  value?: number | null;
  /**
   * Ada göre seçim. Belge/hareket satırları tarihsel olarak renk METNİ tutar;
   * bu alan verilirse kart listeden ada göre çözülür (Türkçe harf duyarsız).
   * Kartı olmayan eski kayıtlar ad olarak gösterilmeye devam eder.
   */
  valueName?: string | null;
  /** Seçilen kartın adı/HEX'i de döner; satır tabloları hem colorId hem metin tutar. */
  onChange: (colorId: number | null, color: ColorMaster | null) => void;
  /** Yalnızca bu kartlar seçilebilir (ör. ürün kartına bağlı renkler). */
  restrictToIds?: number[];
  placeholder?: string;
  disabled?: boolean;
  allowClear?: boolean;
  /** Tablo/ExcelGrid hücreleri için tek satırlı yoğun görünüm. */
  compact?: boolean;
  /** Bu ada uyan seçenek "Model Rengi" olarak vurgulanır (reçete hedef rengi). */
  highlightName?: string;
  className?: string;
}

/**
 * Serbest metin renk girişinin yerine geçen merkezi renk seçici. Yalnızca
 * `colors` kartlarından seçim yapılabilir; kullanıcı renk adı yazamaz.
 * Kısıtlama yoksa panelde "Yeni Renk" düğmesi açılır ve form iç içe bir
 * modalda gösterilir — bulunulan ekranın durumu korunur, kayıt sonrası yeni
 * renk otomatik seçilir.
 */
export function ColorSelect({
  value = null,
  valueName = null,
  onChange,
  restrictToIds,
  placeholder = 'Renk seçin...',
  disabled = false,
  allowClear = true,
  compact = false,
  highlightName,
  className,
}: ColorSelectProps) {
  const all = useColorMaster();
  const byName = useMemo(() => {
    const map = new Map<string, ColorMaster>();
    all.forEach((c) => { const key = foldName(c.name); if (key && !map.has(key)) map.set(key, c); });
    return map;
  }, [all]);

  const nameMatch = value == null && valueName ? byName.get(foldName(valueName)) ?? null : null;
  const resolvedId = value != null ? Number(value) : nameMatch ? Number(nameMatch.id) : null;
  const selectedIds = resolvedId != null ? [resolvedId] : [];
  const { selectable, byId, addRecent } = useSelectableColors(all, selectedIds, restrictToIds);

  const [isOpen, setIsOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const selected = resolvedId != null ? byId.get(resolvedId) ?? null : null;
  /** Kartı bulunamayan eski kayıt: metin kaybolmasın diye olduğu gibi gösterilir. */
  const unmatchedName = !selected && valueName ? valueName.trim() : '';
  const hasValue = Boolean(selected || unmatchedName);

  const pick = (color: ColorMaster) => {
    onChange(Number(color.id), color);
    setIsOpen(false);
  };

  const clear = (event: React.MouseEvent | React.KeyboardEvent) => {
    event.stopPropagation();
    onChange(null, null);
  };

  return (
    <div ref={containerRef} className={cn('relative w-full', className)}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((open) => !open)}
        className={cn(
          'w-full flex items-center justify-between gap-2 rounded-lg border text-left transition-all shadow-2xs cursor-pointer disabled:cursor-not-allowed disabled:opacity-60',
          compact ? 'px-2 py-1' : 'px-2.5 py-1.5',
          hasValue
            ? 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600'
            : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700',
          isOpen && 'ring-1 ring-indigo-500 border-indigo-500',
        )}
      >
        {selected ? (
          compact ? (
            <span className="flex items-center gap-1.5 min-w-0">
              <ColorSwatch name={selected.name} hexCode={selected.hexCode} size={14} className="rounded shrink-0" />
              <span className="text-[11px] font-black text-slate-900 dark:text-slate-100 uppercase truncate">{selected.name}</span>
            </span>
          ) : (
            <span className="flex items-center gap-2 min-w-0">
              <ColorSwatch name={selected.name} hexCode={selected.hexCode} size={18} className="rounded shrink-0" />
              <span className="min-w-0">
                <span className="block text-xs font-black text-slate-900 dark:text-slate-100 uppercase truncate">{selected.name}</span>
                <span className="block text-[10px] font-bold text-slate-600 dark:text-slate-300 font-mono truncate">
                  {selected.code}{selected.manufacturerCode ? ` · ${selected.manufacturerCode}` : ''}
                </span>
              </span>
            </span>
          )
        ) : unmatchedName ? (
          <span
            className="flex items-center gap-1.5 min-w-0"
            title="Bu renk merkezî renk kartına bağlı değil (eski kayıt). Listeden seçerek karta bağlayın."
          >
            <ColorSwatch name={unmatchedName} size={compact ? 14 : 18} className="rounded shrink-0" />
            <span className={cn('font-black text-amber-800 dark:text-amber-300 uppercase truncate', compact ? 'text-[11px]' : 'text-xs')}>
              {unmatchedName}
            </span>
          </span>
        ) : (
          <span className={cn('font-bold text-slate-600 dark:text-slate-300 truncate', compact ? 'text-[11px]' : 'text-xs')}>{placeholder}</span>
        )}
        <span className="flex items-center gap-1 shrink-0">
          {allowClear && hasValue && !disabled && (
            <span
              role="button"
              tabIndex={0}
              title="Rengi temizle"
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

      <ColorPickerPanel
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        triggerRef={triggerRef}
        options={selectable}
        selectedIds={selectedIds}
        onPick={pick}
        emptyMessage={restrictToIds ? 'Bu ürüne bağlı renk kartı yok.' : 'Aramaya uyan renk kartı bulunamadı.'}
        canCreate={!restrictToIds}
        onCreate={() => { setIsOpen(false); setIsFormOpen(true); }}
        footerLabel={selected ? 'Seçili renk' : 'Renk seçilmedi'}
        highlightName={highlightName}
      />

      <ColorFormModal
        isOpen={isFormOpen}
        nested
        onClose={() => setIsFormOpen(false)}
        onSaved={(color) => {
          addRecent(color);
          if (color.id != null) onChange(Number(color.id), color);
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Çoklu seçim (ürün kartı renk listesi)                               */
/* ------------------------------------------------------------------ */

export interface ColorMultiSelectProps {
  values: number[];
  /** Seçilen kartlar da döner; çağıran taraf renk adlarını ayrıca sorgulamak zorunda kalmaz. */
  onChange: (ids: number[], selected: ColorMaster[]) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function ColorMultiSelect({ values, onChange, placeholder = 'Renk kartı seçin...', disabled = false, className }: ColorMultiSelectProps) {
  const all = useColorMaster();
  const selectedIds = values.map(Number);
  const { selectable, byId, addRecent } = useSelectableColors(all, selectedIds);

  const [isOpen, setIsOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  const selectedColors = useMemo(
    () => selectedIds.map((id) => byId.get(id)).filter((c): c is ColorMaster => Boolean(c)),
    [byId, selectedIds],
  );

  const emit = (ids: number[], extra?: ColorMaster[]) => {
    const pool = new Map<number, ColorMaster>([...byId, ...(extra || []).map((c) => [Number(c.id), c] as const)]);
    onChange(ids, ids.map((id) => pool.get(id)).filter((c): c is ColorMaster => Boolean(c)));
  };

  const toggle = (color: ColorMaster) => {
    const id = Number(color.id);
    emit(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  };

  const remove = (id: number) => emit(selectedIds.filter((x) => x !== id));

  return (
    <div ref={containerRef} className={cn('relative w-full', className)}>
      <div
        ref={triggerRef}
        className={cn(
          'w-full min-h-[38px] rounded-lg border bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 px-2 py-1.5 flex flex-wrap items-center gap-1.5 cursor-pointer transition-all shadow-2xs',
          isOpen && 'ring-1 ring-indigo-500 border-indigo-500',
          disabled && 'opacity-60 cursor-not-allowed',
        )}
        onClick={() => { if (!disabled) setIsOpen((open) => !open); }}
      >
        {selectedColors.length === 0 && (
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 px-1">{placeholder}</span>
        )}
        {selectedColors.map((color) => (
          <span
            key={color.id}
            className="inline-flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-1.5 pr-1 py-1"
          >
            <ColorSwatch name={color.name} hexCode={color.hexCode} size={16} className="rounded" />
            <span className="text-xs font-black text-slate-800 dark:text-slate-100 uppercase">{color.name}</span>
            <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 font-mono">{color.code}</span>
            {!disabled && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); remove(Number(color.id)); }}
                title="Listeden çıkar"
                className="p-0.5 text-slate-400 hover:text-rose-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </span>
        ))}
        <ChevronDown className={cn('w-4 h-4 text-slate-400 ml-auto transition-transform duration-200', isOpen && 'rotate-180')} />
      </div>

      <ColorPickerPanel
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        triggerRef={triggerRef}
        options={selectable}
        selectedIds={selectedIds}
        onPick={toggle}
        emptyMessage="Aramaya uyan renk kartı bulunamadı."
        canCreate
        onCreate={() => { setIsOpen(false); setIsFormOpen(true); }}
      />

      <ColorFormModal
        isOpen={isFormOpen}
        nested
        onClose={() => setIsFormOpen(false)}
        onSaved={(color) => {
          addRecent(color);
          if (color.id == null) return;
          const id = Number(color.id);
          if (!selectedIds.includes(id)) emit([...selectedIds, id], [color]);
        }}
      />
    </div>
  );
}
