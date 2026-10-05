import { useEffect, useMemo, useState } from 'react';
import { FileText, Printer, FileDown, Search, X, Calendar, RotateCcw, Palette, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import Modal from '../Modal';
import DataGrid, { GridColumn, StatusPill } from '../Common/DataGrid';
import { cn } from '../../lib/utils';
import { formatQuantity } from '../../lib/inventoryCalculator';
import { printTabularReport } from '../../lib/printService';
import { exportToCsv } from '../../lib/exportService';
import { getColorSwatch, hexFromColorRefs } from '../../lib/colorSwatches';
import type { InventoryLog, Product } from '../../types';

interface StockStatementModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  inventoryLogs: InventoryLog[] | undefined;
}

type StatementTypeFilter = 'all' | 'in' | 'out' | 'production_in' | 'production_out';

/** Renk kolonu boş olan hareketlerin toplandığı grubun anahtarı. */
const NO_COLOR = '__renksiz__';
const NO_COLOR_LABEL = 'Renksiz Kayıtlar';
const ALL_COLORS = '*';

interface StatementRow extends InventoryLog {
  colorKey: string;
  runningBalance: number;
}

interface ColorGroup {
  colorKey: string;
  label: string;
  rows: StatementRow[];
  totalIn: number;
  totalOut: number;
  closingBalance: number;
}

function typeLabel(type: string): string {
  return type === 'in' ? 'Stok Girişi'
    : type === 'out' ? 'Stok Çıkışı'
    : type === 'production_in' ? 'Üretim Girişi'
    : type === 'production_out' ? 'Hammadde Sarf'
    : (type || '');
}

/** inventoryLogs.quantity mutlak büyüklüktür; yön hareket tipinden gelir. */
function isIncoming(type: string): boolean {
  return type === 'in' || type === 'production_in';
}

function signedQuantity(log: InventoryLog): number {
  const qty = Math.abs(Number(log.quantity) || 0);
  return isIncoming(log.type) ? qty : -qty;
}

/** Çıkış toplamını "-1.680" biçiminde, sıfırda ise "-0" çirkinliği olmadan basar. */
function outText(n: number): string {
  return n > 0 ? `-${formatQuantity(n)}` : formatQuantity(n);
}

export default function StockStatementModal({ isOpen, onClose, product, inventoryLogs }: StockStatementModalProps) {
  const [statementTypeFilter, setStatementTypeFilter] = useState<StatementTypeFilter>('all');
  const [statementSearch, setStatementSearch] = useState('');
  const [statementDateRange, setStatementDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const [colorFilter, setColorFilter] = useState<string>(ALL_COLORS);

  useEffect(() => {
    if (isOpen) {
      setStatementTypeFilter('all');
      setStatementSearch('');
      setStatementDateRange({ start: '', end: '' });
      setColorFilter(ALL_COLORS);
    }
  }, [isOpen, product?.id]);

  /** Ürün kartında tanımlı renkler; ekstre gruplarının sıralamasını belirler. */
  const productColorOrder = useMemo<string[]>(() => {
    if (!product) return [];
    const ordered: string[] = [];
    const push = (value: unknown) => {
      const name = typeof value === 'string' ? value.trim() : '';
      if (name && !ordered.includes(name)) ordered.push(name);
    };
    (product.colors || []).forEach(push);
    (product.variantBarcodes || []).forEach((v: any) => push(v?.color));
    return ordered;
  }, [product]);

  /** Seçilen ürünün filtrelenmiş hareketleri, renk grubu + renk içi yürüyen bakiye ile. */
  const groups = useMemo<ColorGroup[]>(() => {
    if (!product || !inventoryLogs) return [];

    let filtered = inventoryLogs.filter(l => l.productId === product.id);

    if (statementDateRange.start) {
      const startDate = new Date(statementDateRange.start);
      startDate.setHours(0, 0, 0, 0);
      filtered = filtered.filter(l => l.date && new Date(l.date) >= startDate);
    }
    if (statementDateRange.end) {
      const endDate = new Date(statementDateRange.end);
      endDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter(l => l.date && new Date(l.date) <= endDate);
    }
    if (statementTypeFilter !== 'all') {
      filtered = filtered.filter(l => l.type === statementTypeFilter);
    }
    if (statementSearch.trim()) {
      const s = statementSearch.toLowerCase();
      filtered = filtered.filter(l =>
        (l.description || '').toLowerCase().includes(s) ||
        (l.color || '').toLowerCase().includes(s) ||
        (l.size || '').toLowerCase().includes(s)
      );
    }

    const byColor = new Map<string, InventoryLog[]>();
    filtered.forEach(log => {
      const key = String(log.color || '').trim() || NO_COLOR;
      const bucket = byColor.get(key);
      if (bucket) bucket.push(log);
      else byColor.set(key, [log]);
    });

    // Renk sırası: ürün kartındaki tanım → hareketlerde görülen ek renkler → renksiz grup en sonda.
    const keys: string[] = [];
    productColorOrder.forEach(c => { if (byColor.has(c)) keys.push(c); });
    [...byColor.keys()]
      .filter(k => k !== NO_COLOR && !keys.includes(k))
      .sort((a, b) => a.localeCompare(b, 'tr'))
      .forEach(k => keys.push(k));
    if (byColor.has(NO_COLOR)) keys.push(NO_COLOR);

    return keys.map(key => {
      const sorted = [...(byColor.get(key) || [])].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );
      let balance = 0;
      let totalIn = 0;
      let totalOut = 0;
      const rows: StatementRow[] = sorted.map(log => {
        const signed = signedQuantity(log);
        const qty = Math.abs(signed);
        balance += signed;
        if (signed > 0) totalIn += qty; else totalOut += qty;
        return { ...log, colorKey: key, runningBalance: balance };
      });
      return {
        colorKey: key,
        label: key === NO_COLOR ? NO_COLOR_LABEL : key,
        rows,
        totalIn,
        totalOut,
        closingBalance: balance,
      };
    });
  }, [product, inventoryLogs, statementDateRange, statementTypeFilter, statementSearch, productColorOrder]);

  const visibleGroups = useMemo(
    () => (colorFilter === ALL_COLORS ? groups : groups.filter(g => g.colorKey === colorFilter)),
    [groups, colorFilter]
  );

  /** Renk özet şeridi: üründe tanımlı ama hareketi olmayan renkler de sıfırla görünür. */
  const colorSummary = useMemo(() => {
    const list: ColorGroup[] = groups.map(g => ({ ...g }));
    productColorOrder.forEach(name => {
      if (!list.some(g => g.colorKey === name)) {
        list.push({ colorKey: name, label: name, rows: [], totalIn: 0, totalOut: 0, closingBalance: 0 });
      }
    });
    return list;
  }, [groups, productColorOrder]);

  const statementStats = useMemo(() => {
    let totalIn = 0;
    let totalOut = 0;
    let totalCount = 0;
    groups.forEach(g => {
      totalIn += g.totalIn;
      totalOut += g.totalOut;
      totalCount += g.rows.length;
    });
    return { totalIn, totalOut, netChange: totalIn - totalOut, totalCount };
  }, [groups]);

  const noColorCount = useMemo(
    () => groups.filter(g => g.colorKey === NO_COLOR).reduce((sum, g) => sum + g.rows.length, 0),
    [groups]
  );

  const gridColumns = useMemo<GridColumn<StatementRow>[]>(() => [
    {
      key: 'date',
      title: 'Tarih & Saat',
      render: (log) => (
        <span className="font-mono text-[11px] text-slate-600 dark:text-slate-300">
          {log.date ? format(new Date(log.date), 'dd.MM.yyyy HH:mm', { locale: tr }) : '-'}
        </span>
      ),
      filterValue: (log) => (log.date ? format(new Date(log.date), 'dd.MM.yyyy HH:mm', { locale: tr }) : '')
    },
    {
      key: 'type',
      title: 'Hareket Tipi',
      render: (log) => {
        if (log.type === 'in') return <StatusPill tone="green">Stok Girişi</StatusPill>;
        if (log.type === 'out') return <StatusPill tone="red">Stok Çıkışı</StatusPill>;
        if (log.type === 'production_in') return <StatusPill tone="violet">Üretim Girişi</StatusPill>;
        if (log.type === 'production_out') return <StatusPill tone="amber">Hammadde Sarf</StatusPill>;
        return <StatusPill tone="slate">{log.type}</StatusPill>;
      },
      filterValue: (log) => typeLabel(log.type)
    },
    {
      key: 'size',
      title: 'Beden',
      render: (log) => (
        <span className="font-mono text-[11px] font-bold text-slate-700 dark:text-slate-200">
          {log.size || '-'}
        </span>
      ),
      filterValue: (log) => log.size || ''
    },
    {
      key: 'quantity',
      title: 'Giriş (+)',
      align: 'right',
      render: (log) => {
        const qty = Math.abs(Number(log.quantity) || 0);
        return <span className="font-mono font-bold text-emerald-600">{isIncoming(log.type) ? `+${qty}` : '-'}</span>;
      },
      filterValue: (log) => `${Math.abs(Number(log.quantity) || 0)}`
    },
    {
      key: 'quantityOut',
      title: 'Çıkış (-)',
      align: 'right',
      render: (log) => {
        const qty = Math.abs(Number(log.quantity) || 0);
        return <span className="font-mono font-bold text-rose-600">{!isIncoming(log.type) ? `-${qty}` : '-'}</span>;
      },
      filterValue: (log) => `${Math.abs(Number(log.quantity) || 0)}`
    },
    {
      key: 'runningBalance',
      title: 'Bakiye',
      align: 'right',
      render: (log) => (
        <span className="font-mono font-black text-slate-900 dark:text-slate-100">
          {log.runningBalance} <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">{product?.unit}</span>
        </span>
      ),
      filterValue: (log) => `${log.runningBalance}`
    },
    {
      key: 'description',
      title: 'Açıklama / Belge',
      render: (log) => <span className="text-slate-700 dark:text-slate-200 text-[11px]">{log.description || '-'}</span>,
      filterValue: (log) => log.description || ''
    }
  ], [product]);

  const handlePrintStatement = () => {
    if (!product || statementStats.totalCount === 0) return;
    const unit = product.unit || 'Adet';

    const headers = ['TARİH & SAAT', 'HAREKET TİPİ', 'RENK', 'BEDEN', 'GİRİŞ (+)', 'ÇIKIŞ (-)', 'BAKİYE', 'AÇIKLAMA / BELGE'];
    const rows: (string | number)[][] = [];
    visibleGroups.forEach(group => {
      group.rows.forEach(l => {
        const qty = Math.abs(Number(l.quantity) || 0);
        rows.push([
          l.date ? format(new Date(l.date), 'dd.MM.yyyy HH:mm', { locale: tr }) : '-',
          typeLabel(l.type),
          group.label,
          l.size || '-',
          isIncoming(l.type) ? `+${qty}` : '-',
          !isIncoming(l.type) ? `-${qty}` : '-',
          `${l.runningBalance} ${unit}`,
          l.description || '-'
        ]);
      });
      rows.push([
        '', '', `${group.label} ARA TOPLAM`, '',
        `+${formatQuantity(group.totalIn)}`, `-${formatQuantity(group.totalOut)}`,
        `${formatQuantity(group.closingBalance)} ${unit}`, `${group.rows.length} hareket`
      ]);
    });
    rows.push([
      '', '', 'GENEL TOPLAM', '',
      `+${formatQuantity(statementStats.totalIn)}`, `-${formatQuantity(statementStats.totalOut)}`,
      `${formatQuantity(statementStats.netChange)} ${unit}`, `${statementStats.totalCount} hareket`
    ]);

    printTabularReport(
      `Stok Kart Ekstresi: ${product.name} (${product.code})`,
      `Renk Bazlı Stok Hareket Ve Bakiye Dökümü - Birim: ${unit}`,
      headers,
      rows,
      [
        { label: 'Mevcut Stok', value: `${formatQuantity(product.stock)} ${unit}` },
        { label: 'Toplam Giriş', value: `+${formatQuantity(statementStats.totalIn)} ${unit}` },
        { label: 'Toplam Çıkış', value: `${outText(statementStats.totalOut)} ${unit}` },
        { label: 'Renk / İşlem', value: `${colorSummary.length} renk · ${statementStats.totalCount} hareket` }
      ]
    );
  };

  const handleExportStatementCsv = () => {
    if (!product || statementStats.totalCount === 0) return;
    const unit = product.unit || 'Adet';

    const headers = ['Tarih', 'Ürün Kodu', 'Ürün Adı', 'Renk', 'Hareket Tipi', 'Beden', 'Giriş', 'Çıkış', 'Yürüyen Bakiye', 'Birim', 'Açıklama'];
    const rows: (string | number)[][] = [];
    visibleGroups.forEach(group => {
      group.rows.forEach(l => {
        const qty = Math.abs(Number(l.quantity) || 0);
        rows.push([
          l.date ? format(new Date(l.date), 'dd.MM.yyyy HH:mm', { locale: tr }) : '-',
          product.code,
          product.name,
          group.label,
          typeLabel(l.type),
          l.size || '-',
          isIncoming(l.type) ? qty : 0,
          !isIncoming(l.type) ? qty : 0,
          l.runningBalance,
          unit,
          l.description || '-'
        ]);
      });
      rows.push([
        '', product.code, product.name, group.label, 'ARA TOPLAM', '',
        group.totalIn, group.totalOut, group.closingBalance, unit, `${group.rows.length} hareket`
      ]);
    });
    rows.push([
      '', product.code, product.name, 'GENEL TOPLAM', '', '',
      statementStats.totalIn, statementStats.totalOut, statementStats.netChange, unit, `${statementStats.totalCount} hareket`
    ]);

    exportToCsv(`${product.code}_Stok_Ekstresi.csv`, headers, rows);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Stok Kart Ekstresi: ${product?.name || ''}`}
      size="3xl"
    >
      {product && (
        <div className="space-y-5">
          {/* Stock Summary Header Card */}
          <div className="p-4 bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-2xl shadow-sm space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0 border border-white/10">
                  <FileText className="w-5 h-5 text-purple-300" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-white/15 text-purple-200">
                      {product.code}
                    </span>
                    {product.brand && (
                      <span className="text-[10px] text-slate-300 uppercase font-bold tracking-wider">
                        {product.brand}
                      </span>
                    )}
                  </div>
                  <h3 className="text-base font-black text-white">{product.name}</h3>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrintStatement}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all cursor-pointer border border-white/15"
                >
                  <Printer className="w-3.5 h-3.5 text-purple-300" />
                  <span>Ekstre Yazdır</span>
                </button>
                <button
                  onClick={handleExportStatementCsv}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  <span>Excel'e Aktar</span>
                </button>
              </div>
            </div>

            {/* KPI Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
              <div className="bg-white/5 p-2.5 rounded-xl border border-white/10">
                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Mevcut Stok</div>
                <div className="text-base font-black font-mono text-emerald-400 mt-0.5">
                  {formatQuantity(product.stock)} <span className="text-xs uppercase">{product.unit}</span>
                </div>
              </div>
              <div className="bg-white/5 p-2.5 rounded-xl border border-white/10">
                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Toplam Giriş (+)</div>
                <div className="text-base font-black font-mono text-indigo-300 mt-0.5">
                  +{formatQuantity(statementStats.totalIn)} <span className="text-xs uppercase">{product.unit}</span>
                </div>
              </div>
              <div className="bg-white/5 p-2.5 rounded-xl border border-white/10">
                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Toplam Çıkış (-)</div>
                <div className="text-base font-black font-mono text-rose-300 mt-0.5">
                  {outText(statementStats.totalOut)} <span className="text-xs uppercase">{product.unit}</span>
                </div>
              </div>
              <div className="bg-white/5 p-2.5 rounded-xl border border-white/10">
                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Renk / Hareket</div>
                <div className="text-base font-black font-mono text-amber-300 mt-0.5">
                  {colorSummary.length} <span className="text-xs text-slate-400">renk</span> · {statementStats.totalCount}
                </div>
              </div>
            </div>
          </div>

          {/* Color Breakdown Strip */}
          {colorSummary.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <Palette className="w-3.5 h-3.5" />
                <span>Renk Bazlı Ekstre Özeti</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {colorSummary.map(group => {
                  const swatch = getColorSwatch(group.label);
                  const active = colorFilter === group.colorKey;
                  return (
                    <button
                      key={group.colorKey}
                      onClick={() => setColorFilter(active ? ALL_COLORS : group.colorKey)}
                      className={cn(
                        'text-left p-2.5 rounded-xl border transition-all cursor-pointer bg-white dark:bg-slate-900',
                        active
                          ? 'border-purple-500 ring-2 ring-purple-500/25 shadow-sm'
                          : 'border-slate-200 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600'
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="w-4 h-4 rounded-md shrink-0 border"
                          style={{ backgroundColor: hexFromColorRefs(product?.colorRefs, group.label) || swatch.bg, borderColor: swatch.border }}
                        />
                        <span className="text-xs font-black text-slate-800 dark:text-slate-100 truncate uppercase">
                          {group.label}
                        </span>
                        <span className="ml-auto text-[10px] font-bold text-slate-400">{group.rows.length} hareket</span>
                      </div>
                      <div className="mt-1.5 grid grid-cols-3 gap-1 text-[10px] font-bold font-mono">
                        <span className="text-emerald-600">+{formatQuantity(group.totalIn)}</span>
                        <span className="text-rose-600">{outText(group.totalOut)}</span>
                        <span className="text-right text-slate-900 dark:text-slate-100 font-black">
                          {formatQuantity(group.closingBalance)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {noColorCount > 0 && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-300 leading-relaxed">
                {noColorCount} hareket kaydında renk bilgisi yok; bunlar “{NO_COLOR_LABEL}” grubunda listeleniyor.
                Bu kayıtlar renk kolonu doldurulmadan önce oluşturulmuş eski hareketlerdir — yeni hareketler renk ve beden ile kaydedilir.
              </p>
            </div>
          )}

          {/* Filter Toolbar */}
          <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 rounded-2xl space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex-1 min-w-[200px] relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={statementSearch}
                  onChange={e => setStatementSearch(e.target.value)}
                  placeholder="Açıklama, renk veya beden ile filtrele..."
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-3 py-1.5 text-xs font-semibold outline-none focus:ring-2 focus:ring-purple-500/20"
                />
                {statementSearch && (
                  <button onClick={() => setStatementSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
                <Calendar className="w-3.5 h-3.5 text-slate-400 ml-1.5" />
                <input
                  type="date"
                  value={statementDateRange.start}
                  onChange={e => setStatementDateRange(prev => ({ ...prev, start: e.target.value }))}
                  className="text-xs font-bold text-slate-700 dark:text-slate-200 outline-none bg-transparent"
                />
                <span className="text-slate-300 font-black">-</span>
                <input
                  type="date"
                  value={statementDateRange.end}
                  onChange={e => setStatementDateRange(prev => ({ ...prev, end: e.target.value }))}
                  className="text-xs font-bold text-slate-700 dark:text-slate-200 outline-none bg-transparent pr-1"
                />
              </div>

              {(statementDateRange.start || statementDateRange.end || statementSearch || statementTypeFilter !== 'all' || colorFilter !== ALL_COLORS) && (
                <button
                  onClick={() => {
                    setStatementDateRange({ start: '', end: '' });
                    setStatementTypeFilter('all');
                    setStatementSearch('');
                    setColorFilter(ALL_COLORS);
                  }}
                  className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
                  title="Filtreleri Temizle"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Sıfırla</span>
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-1 border-t border-slate-200 dark:border-slate-700/60 pt-2">
              {[
                { id: 'all', label: 'Tüm Hareketler' },
                { id: 'in', label: 'Stok Girişi (+)' },
                { id: 'out', label: 'Stok Çıkışı (-)' },
                { id: 'production_in', label: 'Üretim Girişi (+)' },
                { id: 'production_out', label: 'Hammadde Sarf (-)' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setStatementTypeFilter(tab.id as StatementTypeFilter)}
                  className={cn(
                    "px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer",
                    statementTypeFilter === tab.id
                      ? "bg-purple-600 text-white shadow-xs"
                      : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/80"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Per-color statement ledgers */}
          {visibleGroups.length === 0 ? (
            <div className="p-10 text-center border border-dashed border-slate-300 dark:border-slate-700 rounded-2xl">
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                Seçilen kriterlere uygun stok kartı hareketi kaydedilmedi.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {visibleGroups.map(group => {
                const swatch = getColorSwatch(group.label);
                return (
                  <div
                    key={group.colorKey}
                    className="border border-slate-200 dark:border-slate-700/80 rounded-2xl overflow-hidden"
                  >
                    <div className="flex flex-wrap items-center gap-3 px-3 py-2 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700/80">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-4 h-4 rounded-md border"
                          style={{ backgroundColor: hexFromColorRefs(product?.colorRefs, group.label) || swatch.bg, borderColor: swatch.border }}
                        />
                        <span className="text-xs font-black uppercase tracking-wide text-slate-800 dark:text-slate-100">
                          {group.label}
                        </span>
                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                          {group.rows.length} hareket
                        </span>
                      </div>
                      <div className="ml-auto flex items-center gap-3 text-[11px] font-mono font-bold">
                        <span className="text-emerald-600">Giriş +{formatQuantity(group.totalIn)}</span>
                        <span className="text-rose-600">Çıkış {outText(group.totalOut)}</span>
                        <span className="px-2 py-0.5 rounded-lg bg-slate-900 dark:bg-slate-950 text-white font-black">
                          Bakiye {formatQuantity(group.closingBalance)} {product.unit}
                        </span>
                      </div>
                    </div>

                    <DataGrid<StatementRow>
                      columns={gridColumns}
                      data={group.rows}
                      rowKey={(log) => log.id ?? `${log.date}-${log.quantity}-${log.runningBalance}`}
                      maxHeight={visibleGroups.length > 1 ? '280px' : '420px'}
                      emptyMessage="Bu renk için seçilen kriterlere uygun hareket yok."
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
