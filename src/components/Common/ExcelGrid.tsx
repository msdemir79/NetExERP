import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useIsMobile } from '../../hooks/useIsMobile';

export type ExcelCellType = 'text' | 'number' | 'select' | 'combobox' | 'readonly';

export interface ExcelSuggestion<T> {
  label: string;
  hint?: string;
  patch: Partial<T>;
}

export interface ExcelColumn<T> {
  key: string;
  title: string;
  type: ExcelCellType;
  width?: string;
  align?: 'left' | 'center' | 'right';
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  options?: { value: string | number; label: string }[];
  lookup?: (query: string) => ExcelSuggestion<T>[];
  onPicked?: (rowIndex: number, patch: Partial<T>) => void;
  compute?: (row: T) => React.ReactNode;
  extraInfo?: (row: T) => React.ReactNode;
  required?: boolean;
  disabled?: boolean;
}

export interface ExcelGridProps<T> {
  columns: ExcelColumn<T>[];
  rows: T[];
  onChange: (rows: T[]) => void;
  createRow: () => T;
  computeRow?: (row: T, changedKey?: string) => T;
  rowKey?: (row: T, index: number) => string | number;
  onRemoveRow?: (index: number) => void;
  addLabel?: string;
  emptyHint?: React.ReactNode;
  maxHeight?: string;
}

type ComboState = {
  rowIndex: number;
  colKey: string;
  items: { label: string; hint?: string; patch: any }[];
  highlight: number;
} | null;

export default function ExcelGrid<T>({
  columns,
  rows,
  onChange,
  createRow,
  computeRow,
  rowKey,
  onRemoveRow,
  addLabel = 'Satır Ekle',
  emptyHint,
  maxHeight = '22rem',
}: ExcelGridProps<T>) {
  const focusRefs = useRef<Map<string, HTMLElement>>(new Map());
  const [combo, setCombo] = useState<ComboState>(null);
  const [comboPos, setComboPos] = useState<{ top: number; left: number; width: number; dropUp: boolean } | null>(null);
  const comboListRef = useRef<HTMLDivElement | null>(null);
  const isMobile = useIsMobile();

  // Liste, grid'in overflow kapsayıcısında kırpılmasın diye portal ile body'ye çizilir;
  // anchor hücresinin ekran konumuna sabitlenir, yer yoksa yukarı açılır.
  useEffect(() => {
    if (!combo) {
      setComboPos(null);
      return;
    }
    const measure = () => {
      const colIndex = columns.findIndex((c) => c.key === combo.colKey);
      const anchor = focusRefs.current.get(`${combo.rowIndex}:${colIndex}`);
      if (!anchor) {
        setComboPos(null);
        return;
      }
      const rect = anchor.getBoundingClientRect();
      const LIST_MAX_H = 224;
      const spaceBelow = window.innerHeight - rect.bottom;
      const dropUp = spaceBelow < LIST_MAX_H + 8 && rect.top > spaceBelow;
      setComboPos({
        left: rect.left,
        top: dropUp ? rect.top - 4 : rect.bottom + 2,
        width: Math.max(rect.width, 288),
        dropUp,
      });
    };
    measure();
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [combo, columns]);

  useEffect(() => {
    if (!combo || !comboListRef.current) return;
    comboListRef.current
      .querySelector<HTMLElement>(`[data-idx="${combo.highlight}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [combo?.highlight]);

  const focusableIdx = useMemo(
    () => columns.map((c, i) => i).filter((i) => columns[i].type !== 'readonly'),
    [columns]
  );

  const setRef = (key: string) => (el: HTMLElement | null) => {
    if (el) focusRefs.current.set(key, el);
    else focusRefs.current.delete(key);
  };

  const focusCell = (rowIndex: number, colIndex: number) => {
    const el = focusRefs.current.get(`${rowIndex}:${colIndex}`);
    if (!el) return;
    el.focus();
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      try { el.select(); } catch { /* noop */ }
    }
  };

  const buildRow = (raw: T, changedKey?: string): T => (computeRow ? computeRow(raw, changedKey) : raw);

  const commitRows = (next: T[]) => onChange(next);

  const updateCell = (rowIndex: number, key: string, value: any) => {
    const next = rows.slice();
    const patched = { ...next[rowIndex], [key]: value } as T;
    next[rowIndex] = buildRow(patched, key);
    commitRows(next);
  };

  const addRow = (): number => {
    const next = rows.slice();
    next.push(buildRow(createRow()));
    commitRows(next);
    return next.length - 1;
  };

  const appendAndFocus = (colIndex: number) => {
    const newIdx = addRow();
    setTimeout(() => focusCell(newIdx, colIndex), 0);
  };

  // Navigation -------------------------------------------------------------
  const navigate = (
    e: React.KeyboardEvent,
    rowIndex: number,
    colIndex: number,
    dir: 'next' | 'prev' | 'down' | 'up'
  ) => {
    const pos = focusableIdx.indexOf(colIndex);
    if (pos === -1) return;

    if (dir === 'down') {
      e.preventDefault();
      if (rowIndex + 1 < rows.length) focusCell(rowIndex + 1, colIndex);
      else appendAndFocus(colIndex);
      return;
    }
    if (dir === 'up') {
      e.preventDefault();
      if (rowIndex - 1 >= 0) focusCell(rowIndex - 1, colIndex);
      return;
    }
    if (dir === 'next') {
      e.preventDefault();
      if (pos + 1 < focusableIdx.length) {
        focusCell(rowIndex, focusableIdx[pos + 1]);
      } else if (rowIndex + 1 < rows.length) {
        focusCell(rowIndex + 1, focusableIdx[0]);
      } else {
        appendAndFocus(focusableIdx[0]);
      }
      return;
    }
    if (dir === 'prev') {
      e.preventDefault();
      if (pos - 1 >= 0) {
        focusCell(rowIndex, focusableIdx[pos - 1]);
      } else if (rowIndex - 1 >= 0) {
        focusCell(rowIndex - 1, focusableIdx[focusableIdx.length - 1]);
      }
      return;
    }
  };

  const onCellKeyDown = (
    e: React.KeyboardEvent,
    rowIndex: number,
    colIndex: number,
    col: ExcelColumn<T>
  ) => {
    const isCombo = col.type === 'combobox';
    const comboOpen = isCombo && combo && combo.rowIndex === rowIndex && combo.colKey === col.key && combo.items.length > 0;

    if (e.key === 'Tab') {
      if (comboOpen) setCombo(null);
      navigate(e, rowIndex, colIndex, e.shiftKey ? 'prev' : 'next');
      return;
    }
    if (e.key === 'Enter') {
      if (comboOpen) {
        e.preventDefault();
        selectSuggestion(rowIndex, col, combo!.items[combo!.highlight] || combo!.items[0]);
        return;
      }
      navigate(e, rowIndex, colIndex, 'down');
      return;
    }
    if (comboOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      setCombo((prev) => {
        if (!prev) return prev;
        const len = prev.items.length;
        const nextH = e.key === 'ArrowDown'
          ? (prev.highlight + 1) % len
          : (prev.highlight - 1 + len) % len;
        return { ...prev, highlight: nextH };
      });
      return;
    }
    if (comboOpen && e.key === 'Escape') {
      e.preventDefault();
      setCombo(null);
      return;
    }
    if (!isCombo && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      navigate(e, rowIndex, colIndex, e.key === 'ArrowDown' ? 'down' : 'up');
      return;
    }
  };

  const selectSuggestion = (rowIndex: number, col: ExcelColumn<T>, item: { patch: Partial<T> }) => {
    const next = rows.slice();
    next[rowIndex] = buildRow({ ...next[rowIndex], ...item.patch } as T);
    commitRows(next);
    setCombo(null);
    col.onPicked?.(rowIndex, item.patch);
    const colIndex = columns.findIndex((c) => c.key === col.key);
    const pos = focusableIdx.indexOf(colIndex);
    if (pos + 1 < focusableIdx.length) {
      setTimeout(() => focusCell(rowIndex, focusableIdx[pos + 1]), 0);
    } else {
      setTimeout(() => navigate({ preventDefault() {} } as any, rowIndex, colIndex, 'next'), 0);
    }
  };

  const openComboFor = (rowIndex: number, col: ExcelColumn<T>, query: string) => {
    if (!col.lookup) return;
    const items = col.lookup(query);
    setCombo({ rowIndex, colKey: col.key, items, highlight: 0 });
  };

  // Render helpers ---------------------------------------------------------
  const renderCell = (row: T, rowIndex: number, col: ExcelColumn<T>, colIndex: number) => {
    const cellKey = `${rowIndex}:${colIndex}`;
    const value = (row as any)[col.key];
    const align = col.align || 'left';

    if (col.type === 'readonly') {
      return (
        <div className={cn('px-2 py-1.5 text-xs font-mono font-bold whitespace-nowrap',
          align === 'right' && 'text-right', align === 'center' && 'text-center', align === 'left' && 'text-left',
          'text-slate-700 dark:text-slate-200')}>
          {col.compute ? col.compute(row) : String(value ?? '')}
        </div>
      );
    }

    const baseInput = 'w-full bg-transparent outline-none text-xs font-medium text-slate-900 dark:text-slate-100 px-2 py-1.5 focus:bg-indigo-50/60 dark:focus:bg-indigo-500/10';

    if (col.type === 'select') {
      return (
        <select
          ref={setRef(cellKey) as any}
          value={value ?? ''}
          disabled={col.disabled}
          onChange={(e) => updateCell(rowIndex, col.key, e.target.value)}
          onKeyDown={(e) => onCellKeyDown(e, rowIndex, colIndex, col)}
          className={cn(baseInput, 'cursor-pointer', align === 'right' && 'text-right', align === 'center' && 'text-center')}
        >
          {(col.options || []).map((o) => (
            <option key={String(o.value)} value={o.value}>{o.label}</option>
          ))}
        </select>
      );
    }

    if (col.type === 'combobox') {
      return (
        <div className="relative">
          <input
            ref={setRef(cellKey) as any}
            type="text"
            value={value ?? ''}
            placeholder={col.placeholder}
            disabled={col.disabled}
            onChange={(e) => {
              updateCell(rowIndex, col.key, e.target.value);
              openComboFor(rowIndex, col, e.target.value);
            }}
            onFocus={(e) => {
              openComboFor(rowIndex, col, e.target.value);
              e.currentTarget.select();
            }}
            onBlur={() => setTimeout(() => setCombo((c) => (c && c.rowIndex === rowIndex && c.colKey === col.key ? null : c)), 120)}
            onKeyDown={(e) => onCellKeyDown(e, rowIndex, colIndex, col)}
            className={cn(baseInput, 'font-bold')}
          />
          {col.extraInfo && col.extraInfo(row)}
        </div>
      );
    }

    // text / number
    return (
      <input
        ref={setRef(cellKey) as any}
        type={col.type === 'number' ? 'number' : 'text'}
        value={value ?? ''}
        placeholder={col.placeholder}
        disabled={col.disabled}
        min={col.min}
        max={col.max}
        step={col.type === 'number' ? (col.step ?? 'any') : undefined}
        onChange={(e) => {
          const raw = col.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value;
          updateCell(rowIndex, col.key, raw);
        }}
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={(e) => onCellKeyDown(e, rowIndex, colIndex, col)}
        className={cn(baseInput,
          col.type === 'number' && 'font-mono font-bold',
          align === 'right' && 'text-right', align === 'center' && 'text-center')}
      />
    );
  };

  const colWidth = (col: ExcelColumn<T>) => col.width || (col.type === 'readonly' ? 'w-24' : col.type === 'combobox' ? 'min-w-[12rem]' : 'w-24');

  const comboCol = combo ? columns.find((c) => c.key === combo.colKey) || null : null;

  return (
    <>
    <div className="border border-slate-300 dark:border-slate-600 rounded-xl overflow-hidden bg-white dark:bg-slate-900">
      {isMobile ? (
        <div className="overflow-auto" style={{ maxHeight }}>
          {rows.length === 0 ? (
            <div className="p-10 text-center text-slate-400">
              {emptyHint || 'Satır eklemek için aşağıdaki butona tıklayın veya bir hücreye yazmaya başlayın.'}
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-700">
              {rows.map((row, rowIndex) => (
                <div key={rowKey ? rowKey(row, rowIndex) : rowIndex} className="space-y-2 p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">Satır {rowIndex + 1}</span>
                    {onRemoveRow && (
                      <button
                        type="button"
                        onClick={() => onRemoveRow(rowIndex)}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-rose-600 transition-colors hover:bg-rose-50 dark:hover:bg-rose-500/10 cursor-pointer"
                        title="Satırı Sil"
                      >
                        <X className="w-3.5 h-3.5" /> Sil
                      </button>
                    )}
                  </div>
                  {columns.map((col, colIndex) => (
                    <div key={colIndex}>
                      <label className="mb-0.5 block text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        {col.title}{col.required && <span className="text-rose-500 ml-0.5">*</span>}
                      </label>
                      <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 focus-within:border-indigo-400">
                        {renderCell(row, rowIndex, col, colIndex)}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
      <div className="overflow-auto" style={{ maxHeight }}>
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-20">
            <tr className="bg-slate-100 dark:bg-slate-800 border-b border-slate-300 dark:border-slate-600">
              <th className="w-8 px-1 py-2 text-center text-[10px] font-black text-slate-400">#</th>
              {columns.map((c, i) => (
                <th key={i} className={cn('px-2 py-2 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 border-l border-slate-200 dark:border-slate-700',
                  c.align === 'right' && 'text-right', c.align === 'center' && 'text-center', colWidth(c))}>
                  {c.title}{c.required && <span className="text-rose-500 ml-0.5">*</span>}
                </th>
              ))}
              {onRemoveRow && <th className="w-10 px-1 py-2 text-center text-[10px] font-black text-slate-400 border-l border-slate-200 dark:border-slate-700">Sil</th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1 + (onRemoveRow ? 1 : 0)} className="p-10 text-center text-slate-400">
                  {emptyHint || 'Satır eklemek için aşağıdaki butona tıklayın veya bir hücreye yazmaya başlayın.'}
                </td>
              </tr>
            ) : (
              rows.map((row, rowIndex) => (
                <tr key={rowKey ? rowKey(row, rowIndex) : rowIndex}
                  className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="px-1 py-1.5 text-center text-[10px] font-black text-slate-300 dark:text-slate-600 align-top">
                    {rowIndex + 1}
                  </td>
                  {columns.map((col, colIndex) => (
                    <td key={colIndex}
                      className={cn('border-l border-slate-200 dark:border-slate-700 align-top',
                        col.type !== 'readonly' && 'p-0',
                        col.type === 'readonly' && 'py-0.5')}>
                      {renderCell(row, rowIndex, col, colIndex)}
                    </td>
                  ))}
                  {onRemoveRow && (
                    <td className="px-1 py-1.5 text-center border-l border-slate-200 dark:border-slate-700">
                      <button
                        type="button"
                        onClick={() => onRemoveRow(rowIndex)}
                        className="p-1 text-slate-300 hover:text-rose-600 rounded transition-colors cursor-pointer"
                        title="Satırı Sil"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      )}
      <div className="border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-2 flex items-center justify-between">
        {!isMobile && (
        <span className="text-[10px] font-medium text-slate-400 px-1">
          İpucu: <kbd className="px-1 py-0.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded text-[9px] font-bold">Tab</kbd> sonraki hücre/alt satır • <kbd className="px-1 py-0.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded text-[9px] font-bold">Enter</kbd> alt satır
        </span>
        )}
        <button
          type="button"
          onClick={() => { const idx = addRow(); setTimeout(() => focusCell(idx, focusableIdx[0]), 0); }}
          className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[11px] font-bold uppercase tracking-wider shadow-sm transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" /> {addLabel}
        </button>
      </div>
    </div>
    {combo && combo.items.length > 0 && comboPos && comboCol && createPortal(
      <div
        ref={comboListRef}
        className="fixed z-[60] max-h-56 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg shadow-xl"
        style={{
          left: comboPos.left,
          top: comboPos.top,
          width: comboPos.width,
          transform: comboPos.dropUp ? 'translateY(-100%)' : undefined,
        }}
      >
        {combo.items.map((s, i) => (
          <button
            type="button"
            key={i}
            data-idx={i}
            onMouseDown={(e) => { e.preventDefault(); selectSuggestion(combo.rowIndex, comboCol, s); }}
            onMouseEnter={() => setCombo((c) => (c ? { ...c, highlight: i } : c))}
            className={cn('w-full text-left px-3 py-1.5 text-xs flex items-center justify-between gap-2',
              i === combo.highlight ? 'bg-indigo-600 text-white' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800')}
          >
            <span className="font-medium truncate">{s.label}</span>
            {s.hint && <span className={cn('text-[10px] shrink-0', i === combo.highlight ? 'text-indigo-200' : 'text-slate-400')}>{s.hint}</span>}
          </button>
        ))}
      </div>,
      document.body
    )}
    </>
  );
}
