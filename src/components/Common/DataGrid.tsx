import React, { useMemo, useState } from 'react';
import { Filter, ChevronUp, ChevronDown, Search, PackageOpen } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useIsMobile } from '../../hooks/useIsMobile';

/* ------------------------------------------------------------------ */
/* Durum rozeti (Nesilce tarzı pill)                                   */
/* ------------------------------------------------------------------ */

export type PillTone = 'green' | 'blue' | 'orange' | 'amber' | 'red' | 'slate' | 'violet' | 'cyan';

const PILL_TONES: Record<PillTone, string> = {
  green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  blue: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  orange: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400',
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  red: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400',
  slate: 'bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300',
  violet: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400',
  cyan: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-400',
};

export function StatusPill({ tone = 'slate', children, className }: { tone?: PillTone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold whitespace-nowrap', PILL_TONES[tone], className)}>
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Kolon tanımı                                                        */
/* ------------------------------------------------------------------ */

export interface GridColumn<T> {
  /** Satır alan adı veya benzersiz kimlik */
  key: string;
  title: string;
  width?: string;
  align?: 'left' | 'center' | 'right';
  /** Başlığa tıklayınca sıralanır. Varsayılan: true */
  sortable?: boolean;
  /** Başlık altında arama kutusu gösterir. Varsayılan: true */
  filterable?: boolean;
  /** Hücre içeriği; verilmezse row[key] basılır */
  render?: (row: T, index: number) => React.ReactNode;
  /** Sütun filtresinin arayacağı metin; verilmezse String(row[key]) */
  filterValue?: (row: T) => string;
  /** Sıralamada kullanılacak değer; verilmezse row[key], o da yoksa filterValue */
  sortValue?: (row: T) => unknown;
}

export interface DataGridProps<T> {
  columns: GridColumn<T>[];
  data: T[];
  rowKey: keyof T | ((row: T) => string | number);
  loading?: boolean;
  /** Grid üstünde araç çubuğu (tarih filtreleri, butonlar vb.) */
  toolbar?: React.ReactNode;
  selectable?: boolean;
  selectedIds?: (string | number)[];
  onSelectionChange?: (ids: (string | number)[]) => void;
  onRowClick?: (row: T) => void;
  /** Satır sonunda işlem butonları döndüren fonksiyon */
  rowActions?: (row: T) => React.ReactNode;
  emptyMessage?: string;
  maxHeight?: string;
  className?: string;
  footer?: React.ReactNode;
  /** Açılışta uygulanan sıralama. Başlığa üçüncü tıklama (sıralamayı bırak) bu sıraya döner. */
  defaultSort?: { key: string; dir: 'asc' | 'desc' };
  /** Satır yoğunluğu: compact = daha dar satırlar ve küçük punto (liste ekranları). */
  density?: 'comfortable' | 'compact';
}

/* ------------------------------------------------------------------ */
/* Yardımcılar                                                         */
/* ------------------------------------------------------------------ */

function defaultCompare(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  const na = typeof a === 'number' ? a : typeof a === 'string' && a.trim() !== '' && !Number.isNaN(Number(a)) ? Number(a) : Number.NaN;
  const nb = typeof b === 'number' ? b : typeof b === 'string' && b.trim() !== '' && !Number.isNaN(Number(b)) ? Number(b) : Number.NaN;
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  return String(a).localeCompare(String(b), 'tr');
}

const ALIGN: Record<'left' | 'center' | 'right', string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

/* ------------------------------------------------------------------ */
/* DataGrid                                                            */
/* ------------------------------------------------------------------ */

export default function DataGrid<T>({
  columns,
  data,
  rowKey,
  loading = false,
  toolbar,
  selectable = false,
  selectedIds,
  onSelectionChange,
  onRowClick,
  rowActions,
  emptyMessage = 'Kayıt bulunamadı.',
  maxHeight,
  className,
  footer,
  defaultSort,
  density = 'comfortable',
}: DataGridProps<T>) {
  const baseSort = defaultSort ?? { key: '', dir: 'asc' as const };
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' }>(baseSort);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const isMobile = useIsMobile();

  const compact = density === 'compact';
  const headPad = compact ? 'px-3 py-1.5' : 'px-3 py-2.5';
  const cellPad = compact ? 'px-3 py-1' : 'px-3 py-2';

  const getKey = (row: T): string | number =>
    typeof rowKey === 'function' ? rowKey(row) : (row[rowKey] as string | number);

  const getSortValue = (row: T, key: string): unknown => {
    const col = columns.find((c) => c.key === key);
    if (col?.sortValue) return col.sortValue(row);
    return col?.filterValue ? col.filterValue(row) : (row as Record<string, unknown>)[key];
  };

  const filtered = useMemo(() => {
    const active = Object.keys(filters)
      .filter((k) => (filters[k] || '').trim() !== '')
      .map((k) => [k, filters[k]] as const);
    let rows = data;
    if (active.length) {
      rows = rows.filter((row) =>
        active.every(([key, text]) => {
          const col = columns.find((c) => c.key === key);
          const raw = col?.filterValue ? col.filterValue(row) : (row as Record<string, unknown>)[key];
          if (raw == null) return false;
          return String(raw).toLocaleLowerCase('tr').includes(text.trim().toLocaleLowerCase('tr'));
        })
      );
    }
    if (sort.key) {
      const key = sort.key;
      const dir = sort.dir === 'desc' ? -1 : 1;
      rows = [...rows].sort((a, b) => defaultCompare(getSortValue(a, key), getSortValue(b, key)) * dir);
    }
    return rows;
  }, [data, filters, sort, columns]);

  const selectedSet = useMemo(() => new Set(selectedIds || []), [selectedIds]);

  const toggleSort = (col: GridColumn<T>) => {
    if (col.sortable === false) return;
    setSort((s) =>
      s.key !== col.key ? { key: col.key, dir: 'asc' } : s.dir === 'asc' ? { key: col.key, dir: 'desc' } : baseSort
    );
  };

  const toggleAll = () => {
    if (!onSelectionChange) return;
    const ids = filtered.map(getKey);
    const allSelected = ids.length > 0 && ids.every((id) => selectedSet.has(id));
    if (allSelected) {
      onSelectionChange((selectedIds || []).filter((id) => !ids.includes(id)));
    } else {
      const merged = new Set(selectedIds || []);
      ids.forEach((id) => merged.add(id));
      onSelectionChange(Array.from(merged));
    }
  };

  const toggleOne = (id: string | number) => {
    if (!onSelectionChange) return;
    if (selectedSet.has(id)) onSelectionChange((selectedIds || []).filter((x) => x !== id));
    else onSelectionChange([...(selectedIds || []), id]);
  };

  const colCount = columns.length + (selectable ? 1 : 0) + (rowActions ? 1 : 0);

  return (
    <div className={cn('bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm', compact ? 'text-xs' : 'text-sm', className)}>
      {toolbar && (
        <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 border-b border-slate-200 dark:border-slate-800">
          {toolbar}
        </div>
      )}
      {isMobile ? (
        <div className="divide-y divide-slate-200 dark:divide-slate-800 overflow-auto" style={maxHeight ? { maxHeight } : undefined}>
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={`mskel-${i}`} className="space-y-2 p-3">
                <div className="h-4 w-2/3 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
                <div className="h-3 w-full rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
                <div className="h-3 w-1/2 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
              </div>
            ))
          ) : filtered.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <PackageOpen className="w-10 h-10 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
              <p className="text-sm text-slate-400">{emptyMessage}</p>
            </div>
          ) : (
            filtered.map((row, i) => {
              const id = getKey(row);
              const [primaryCol, ...restCols] = columns;
              return (
                <div
                  key={String(id)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn('p-3', onRowClick && 'cursor-pointer active:bg-slate-50 dark:active:bg-slate-800/40')}
                >
                  <div className="flex items-start gap-2.5">
                    {selectable && (
                      <input
                        type="checkbox"
                        checked={selectedSet.has(id)}
                        onChange={() => toggleOne(id)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      {primaryCol.render ? primaryCol.render(row, i) : String((row as Record<string, unknown>)[primaryCol.key] ?? '')}
                    </div>
                  </div>
                  {restCols.length > 0 && (
                    <div className="mt-2.5 space-y-1.5">
                      {restCols.map((col) => (
                        <div key={col.key} className="flex items-baseline justify-between gap-3">
                          <span className="shrink-0 text-label uppercase tracking-wide text-slate-500 dark:text-slate-400">{col.title}</span>
                          <div
                            className={cn(
                              'min-w-0 text-sm text-slate-700 dark:text-slate-300',
                              col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                            )}
                          >
                            {col.render ? col.render(row, i) : String((row as Record<string, unknown>)[col.key] ?? '')}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {rowActions && (
                    <div
                      className="mt-2.5 flex items-center justify-end gap-1 border-t border-slate-100 dark:border-slate-800 pt-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {rowActions(row)}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      ) : (
      <div className="overflow-auto" style={maxHeight ? { maxHeight } : undefined}>
        <table className="w-full border-collapse min-w-[640px]">
          <thead className="bg-slate-50 dark:bg-slate-800/60 sticky top-0 z-10">
            <tr className="border-b border-slate-200 dark:border-slate-700">
              {selectable && (
                <th className={cn('w-10', headPad)}>
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && filtered.every((r) => selectedSet.has(getKey(r)))}
                    onChange={toggleAll}
                    className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500 cursor-pointer align-middle"
                  />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={col.width ? { width: col.width } : undefined}
                  onClick={() => toggleSort(col)}
                  className={cn(
                    headPad,
                    'text-xs font-bold text-slate-600 dark:text-slate-300 whitespace-nowrap',
                    col.align ? ALIGN[col.align] : 'text-left',
                    col.sortable !== false && 'cursor-pointer select-none hover:text-slate-900 dark:hover:text-slate-100'
                  )}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.title}
                    <Filter className="w-3 h-3 text-slate-400" />
                    {sort.key === col.key &&
                      (sort.dir === 'asc' ? (
                        <ChevronUp className="w-3.5 h-3.5 text-indigo-500" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 text-indigo-500" />
                      ))}
                  </span>
                </th>
              ))}
              {rowActions && <th className={cn('w-10', headPad)} />}
            </tr>
            <tr className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              {selectable && <th className="w-10" />}
              {columns.map((col) =>
                col.filterable === false ? (
                  <th key={col.key} style={col.width ? { width: col.width } : undefined} />
                ) : (
                  <th key={col.key} style={col.width ? { width: col.width } : undefined} className="px-2 py-1.5">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                      <input
                        value={filters[col.key] || ''}
                        onChange={(e) => setFilters((f) => ({ ...f, [col.key]: e.target.value }))}
                        placeholder="Ara"
                        className="w-full h-7 pl-7 pr-2 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 placeholder:text-slate-400 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200 dark:focus:ring-indigo-500/30"
                      />
                    </div>
                  </th>
                )
              )}
              {rowActions && <th className="w-10" />}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={`skel-${i}`} className="border-b border-slate-100 dark:border-slate-800/70">
                  {selectable && (
                    <td className={cellPad}>
                      <div className="w-3.5 h-3.5 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td key={col.key} className={cellPad}>
                      <div className="h-3.5 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" style={{ width: `${55 + ((i * 17 + col.key.length * 13) % 40)}%` }} />
                    </td>
                  ))}
                  {rowActions && <td className={cellPad} />}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="px-4 py-12 text-center">
                  <PackageOpen className="w-10 h-10 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                  <p className="text-sm text-slate-400">{emptyMessage}</p>
                </td>
              </tr>
            ) : (
              filtered.map((row, i) => {
                const id = getKey(row);
                return (
                  <tr
                    key={String(id)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn(
                      'border-b border-slate-100 dark:border-slate-800/70 last:border-0 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40',
                      onRowClick && 'cursor-pointer'
                    )}
                  >
                    {selectable && (
                      <td className={cellPad} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedSet.has(id)}
                          onChange={() => toggleOne(id)}
                          className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500 cursor-pointer align-middle"
                        />
                      </td>
                    )}
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={cn(cellPad, 'text-slate-700 dark:text-slate-300', col.align ? ALIGN[col.align] : 'text-left')}
                      >
                        {col.render ? col.render(row, i) : String((row as Record<string, unknown>)[col.key] ?? '')}
                      </td>
                    ))}
                    {rowActions && (
                      <td className={cellPad} onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">{rowActions(row)}</div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      )}
      {footer && <div className="px-3 py-2 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500">{footer}</div>}
    </div>
  );
}
