import { useEffect, useMemo, useState } from 'react';
import { FileText, Printer, FileDown, Search, X, Calendar, RotateCcw } from 'lucide-react';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import Modal from '../Modal';
import DataGrid, { GridColumn, StatusPill } from '../Common/DataGrid';
import { cn } from '../../lib/utils';
import { formatQuantity } from '../../lib/inventoryCalculator';
import { printTabularReport } from '../../lib/printService';
import { exportToCsv } from '../../lib/exportService';
import type { InventoryLog, Product } from '../../types';

interface StockStatementModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  inventoryLogs: InventoryLog[] | undefined;
}

type StatementTypeFilter = 'all' | 'in' | 'out' | 'production_in' | 'production_out';

export default function StockStatementModal({ isOpen, onClose, product, inventoryLogs }: StockStatementModalProps) {
  const [statementTypeFilter, setStatementTypeFilter] = useState<StatementTypeFilter>('all');
  const [statementSearch, setStatementSearch] = useState('');
  const [statementDateRange, setStatementDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });

  useEffect(() => {
    if (isOpen) {
      setStatementTypeFilter('all');
      setStatementSearch('');
      setStatementDateRange({ start: '', end: '' });
    }
  }, [isOpen, product?.id]);

  // Compute movement logs and running balance for the selected product
  const productLogs = useMemo(() => {
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

    // Sort chronologically (oldest to newest) to calculate running balance accurately
    const sorted = [...filtered].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let runningBalance = 0;
    const withBalance = sorted.map(log => {
      const qty = Number(log.quantity) || 0;
      runningBalance += qty;
      return {
        ...log,
        runningBalance
      };
    });

    return withBalance.reverse();
  }, [product, inventoryLogs, statementDateRange, statementTypeFilter, statementSearch]);

  const statementStats = useMemo(() => {
    if (!productLogs || productLogs.length === 0) {
      return { totalIn: 0, totalOut: 0, netChange: 0, totalCount: 0 };
    }
    let totalIn = 0;
    let totalOut = 0;
    productLogs.forEach(l => {
      const q = Number(l.quantity) || 0;
      if (q > 0) totalIn += q;
      else totalOut += Math.abs(q);
    });
    return {
      totalIn,
      totalOut,
      netChange: totalIn - totalOut,
      totalCount: productLogs.length
    };
  }, [productLogs]);

  const statementColumns = useMemo<GridColumn<(typeof productLogs)[number]>[]>(() => [
    {
      key: 'date',
      title: 'Tarih & Saat',
      render: (log) => (
        <span className="font-mono text-[11px] text-slate-600">
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
      filterValue: (log) =>
        log.type === 'in' ? 'Stok Girişi' :
        log.type === 'out' ? 'Stok Çıkışı' :
        log.type === 'production_in' ? 'Üretim Girişi' :
        log.type === 'production_out' ? 'Hammadde Sarf' :
        (log.type || '')
    },
    {
      key: 'variant',
      title: 'Renk / Beden',
      render: (log) => (
        <span className="text-slate-700 dark:text-slate-200 text-[11px]">
          {[log.color, log.size].filter(Boolean).join(' / ') || '-'}
        </span>
      ),
      filterValue: (log) => [log.color, log.size].filter(Boolean).join(' ')
    },
    {
      key: 'quantity',
      title: 'Giriş (+)',
      align: 'right',
      render: (log) => {
        const qty = Number(log.quantity) || 0;
        return (
          <span className="font-mono font-bold text-emerald-600">
            {qty > 0 ? `+${qty}` : '-'}
          </span>
        );
      },
      filterValue: (log) => `${Number(log.quantity) || 0}`
    },
    {
      key: 'quantityOut',
      title: 'Çıkış (-)',
      align: 'right',
      render: (log) => {
        const qty = Number(log.quantity) || 0;
        return (
          <span className="font-mono font-bold text-rose-600">
            {qty <= 0 ? `-${Math.abs(qty)}` : '-'}
          </span>
        );
      },
      filterValue: (log) => `${Math.abs(Number(log.quantity) || 0)}`
    },
    {
      key: 'runningBalance',
      title: 'Yürüyen Bakiye',
      align: 'right',
      render: (log) => (
        <span className="font-mono font-black text-slate-900 dark:text-slate-100">
          {log.runningBalance} <span className="text-[10px] text-slate-400 font-semibold">{product?.unit}</span>
        </span>
      ),
      filterValue: (log) => `${log.runningBalance}`
    },
    {
      key: 'description',
      title: 'Açıklama / Belge',
      render: (log) => (
        <span className="text-slate-600 text-[11px]">{log.description || '-'}</span>
      ),
      filterValue: (log) => log.description || ''
    }
  ], [product]);

  const handlePrintStatement = () => {
    if (!product || !productLogs || productLogs.length === 0) return;

    const headers = ['TARİH & SAAT', 'HAREKET TİPİ', 'VARYANT / RENK / BEDEN', 'GİRİŞ (+)', 'ÇIKIŞ (-)', 'YÜRÜYEN BAKİYE', 'AÇIKLAMA'];
    const rows = productLogs.map(l => {
      const dateFormatted = l.date ? format(new Date(l.date), 'dd.MM.yyyy HH:mm', { locale: tr }) : '-';
      const typeLabel =
        l.type === 'in' ? 'Stok Girişi' :
        l.type === 'out' ? 'Stok Çıkışı' :
        l.type === 'production_in' ? 'Üretim Girişi' :
        l.type === 'production_out' ? 'Hammadde Sarf' : l.type;

      const variantLabel = [l.color, l.size].filter(Boolean).join(' / ') || '-';
      const qty = Number(l.quantity) || 0;
      const inQty = qty > 0 ? `+${qty}` : '-';
      const outQty = qty < 0 ? `${Math.abs(qty)}` : '-';

      return [
        dateFormatted,
        typeLabel,
        variantLabel,
        inQty,
        outQty,
        `${l.runningBalance} ${product.unit}`,
        l.description || '-'
      ];
    });

    printTabularReport(
      `Stok Kart Ekstresi: ${product.name} (${product.code})`,
      `Detaylı Stok Hareket Ve Bakiyeleri Dökümü - Birim: ${product.unit}`,
      headers,
      rows,
      [
        { label: 'Mevcut Stok', value: `${formatQuantity(product.stock)} ${product.unit}` },
        { label: 'Toplam Giriş', value: `+${formatQuantity(statementStats.totalIn)} ${product.unit}` },
        { label: 'Toplam Çıkış', value: `-${formatQuantity(statementStats.totalOut)} ${product.unit}` },
        { label: 'İşlem Adedi', value: statementStats.totalCount }
      ]
    );
  };

  const handleExportStatementCsv = () => {
    if (!product || !productLogs || productLogs.length === 0) return;

    const headers = ['Tarih', 'Ürün Kodu', 'Ürün Adı', 'Hareket Tipi', 'Renk/Beden', 'Giriş', 'Çıkış', 'Yürüyen Bakiye', 'Birim', 'Açıklama'];
    const rows = productLogs.map(l => {
      const dateFormatted = l.date ? format(new Date(l.date), 'dd.MM.yyyy HH:mm', { locale: tr }) : '-';
      const typeLabel =
        l.type === 'in' ? 'Stok Girişi' :
        l.type === 'out' ? 'Stok Çıkışı' :
        l.type === 'production_in' ? 'Üretim Girişi' :
        l.type === 'production_out' ? 'Hammadde Sarf' : l.type;

      const variantLabel = [l.color, l.size].filter(Boolean).join(' / ') || '-';
      const qty = Number(l.quantity) || 0;
      return [
        dateFormatted,
        product.code,
        product.name,
        typeLabel,
        variantLabel,
        qty > 0 ? qty : 0,
        qty < 0 ? Math.abs(qty) : 0,
        l.runningBalance,
        product.unit,
        l.description || '-'
      ];
    });

    exportToCsv(`${product.code}_Stok_Ekstresi.csv`, headers, rows);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Stok Kart Ekstresi: ${product?.name || ''}`}
      size="2xl"
    >
      {product && (
        <div className="space-y-5">
          {/* Stock Summary Header Card */}
          <div className="p-4 bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-2xl shadow-sm space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-900/10 flex items-center justify-center shrink-0 border border-white/10">
                  <FileText className="w-5 h-5 text-purple-300" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-white dark:bg-slate-900/15 text-purple-200">
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

              {/* Print & Export Actions */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrintStatement}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-900/10 hover:bg-white dark:bg-slate-900/20 text-white rounded-xl text-xs font-bold transition-all cursor-pointer border border-white/15"
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
              <div className="bg-white dark:bg-slate-900/5 p-2.5 rounded-xl border border-white/10">
                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Mevcut Stok</div>
                <div className="text-base font-black font-mono text-emerald-400 mt-0.5">
                  {formatQuantity(product.stock)} <span className="text-xs uppercase">{product.unit}</span>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900/5 p-2.5 rounded-xl border border-white/10">
                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Toplam Giriş (+)</div>
                <div className="text-base font-black font-mono text-indigo-300 mt-0.5">
                  +{formatQuantity(statementStats.totalIn)} <span className="text-xs uppercase">{product.unit}</span>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900/5 p-2.5 rounded-xl border border-white/10">
                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Toplam Çıkış (-)</div>
                <div className="text-base font-black font-mono text-rose-300 mt-0.5">
                  -{formatQuantity(statementStats.totalOut)} <span className="text-xs uppercase">{product.unit}</span>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900/5 p-2.5 rounded-xl border border-white/10">
                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">İşlem Adedi</div>
                <div className="text-base font-black font-mono text-amber-300 mt-0.5">
                  {statementStats.totalCount} <span className="text-xs">Hareket</span>
                </div>
              </div>
            </div>
          </div>

          {/* Filter Toolbar */}
          <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 dark:border-slate-800/80 rounded-2xl space-y-3">
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

              {(statementDateRange.start || statementDateRange.end || statementSearch || statementTypeFilter !== 'all') && (
                <button
                  onClick={() => {
                    setStatementDateRange({ start: '', end: '' });
                    setStatementTypeFilter('all');
                    setStatementSearch('');
                  }}
                  className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
                  title="Filtreleri Temizle"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Sıfırla</span>
                </button>
              )}
            </div>

            {/* Movement Type Filter Tabs */}
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
                      : "bg-white dark:bg-slate-900 text-slate-600 hover:bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 dark:border-slate-800/80"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Movement Ledger Table */}
          <DataGrid<(typeof productLogs)[number]>
            columns={statementColumns}
            data={productLogs}
            rowKey={(log) => log.id ?? `${log.date}-${log.quantity}-${log.runningBalance}`}
            maxHeight="380px"
            emptyMessage="Seçilen kriterlere uygun stok kartı hareketi kaydedilmedi."
          />
        </div>
      )}
    </Modal>
  );
}
