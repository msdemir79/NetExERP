import React from 'react';
import { api } from '../../api/client';
import { useApiQuery } from '../../hooks/useApiQuery';
import { Search, Printer, FileDown } from 'lucide-react';
import DataGrid, { StatusPill, type GridColumn } from '../Common/DataGrid';
import { printTabularReport } from '../../lib/printService';
import { exportToCsv } from '../../lib/exportService';

export default function BrokenSizeReport() {
  const products = useApiQuery(() => api.products.list(), [], ['products']);
  const [searchTerm, setSearchTerm] = React.useState('');

  const brokenSizeProducts = React.useMemo(() => {
    if (!products) return [];
    
    return products
      .filter(p => p.isFootwear && (p.variantBarcodes || p.assortment))
      .map(p => {
        const variants = p.variantBarcodes || [];
        const missingSizes = variants
          .filter(v => (v.stock || 0) === 0)
          .map(v => `${v.color}-${v.size}`);

        const isBroken = missingSizes.length > 0 && variants.some(v => (v.stock || 0) > 0);
        
        return {
          ...p,
          isBroken,
          missingSizes: missingSizes.slice(0, 5)
        };
      })
      .filter(p => 
        p.isBroken && 
        (p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
         p.code.toLowerCase().includes(searchTerm.toLowerCase()))
      );
  }, [products, searchTerm]);

  const handlePrint = () => {
    if (!brokenSizeProducts || brokenSizeProducts.length === 0) return;

    const headers = ['KOD', 'MODEL ADI', 'MARKA', 'MEVCUT STOK', 'EKSİK / TÜKENEN BEDENLER', 'DURUM'];
    const rows = brokenSizeProducts.map(p => [
      p.code,
      p.name,
      p.brand || '-',
      `${p.stock} ${p.unit}`,
      p.missingSizes?.join(', ') || 'Takım Eksik',
      'KIRIK BEDEN (Eksik Numara)'
    ]);

    printTabularReport(
      'Kırık Beden Raporu',
      'Takımı bozulan, serisi eksik ve tükenen numaraların dökümü',
      headers,
      rows,
      [
        { label: 'Kırık Model Sayısı', value: brokenSizeProducts.length },
        { label: 'Rapor Tarihi', value: new Date().toLocaleDateString('tr-TR') }
      ]
    );
  };

  const handleExportExcel = () => {
    if (!brokenSizeProducts || brokenSizeProducts.length === 0) return;
    const headers = ['Model Kodu', 'Model Adı', 'Marka', 'Mevcut Stok', 'Birim', 'Eksik / Tükenen Bedenler', 'Durum'];
    const rows = brokenSizeProducts.map(p => [
      p.code,
      p.name,
      p.brand || '-',
      p.stock,
      p.unit,
      p.missingSizes?.join(', ') || 'Takım Eksik',
      'KIRIK BEDEN (Eksik Numara)'
    ]);
    exportToCsv('Kirik_Beden_Raporu.csv', headers, rows);
  };

  type BrokenRow = (typeof brokenSizeProducts)[number];

  const columns: GridColumn<BrokenRow>[] = [
    {
      key: 'code',
      title: 'Kod',
      render: (row) => (
        <span className="font-mono text-[11px] font-bold text-slate-600">{row.code}</span>
      ),
    },
    {
      key: 'name',
      title: 'Ürün/Model',
      render: (row) => (
        <div>
          <div className="font-bold text-slate-800 dark:text-slate-200 uppercase text-[11px]">{row.name}</div>
          <div className="text-[9px] text-slate-400 font-bold uppercase">{row.brand}</div>
        </div>
      ),
      filterValue: (row) => `${row.name || ''} ${row.brand || ''}`,
    },
    {
      key: 'status',
      title: 'Durum',
      align: 'center',
      render: (row) => row.stock < 12 ? (
        <StatusPill tone="red">Kırık Beden</StatusPill>
      ) : (
        <StatusPill tone="green">Takım Tam</StatusPill>
      ),
      filterValue: (row) => row.stock < 12 ? 'Kırık Beden' : 'Takım Tam',
    },
    {
      key: 'missingSizes',
      title: 'Eksik Bedenler',
      align: 'center',
      render: (row) => row.missingSizes.length > 0 ? (
        <div className="flex flex-wrap gap-1 justify-center">
          {row.missingSizes.map((s: string, idx: number) => (
            <span key={idx} className="bg-rose-50 text-rose-500 text-[8px] font-bold px-1.5 py-0.5 rounded border border-rose-100 uppercase">{s}</span>
          ))}
          {row.variantBarcodes && row.variantBarcodes.length > row.missingSizes.length && (
            <span className="text-[8px] text-slate-400 font-bold">...</span>
          )}
        </div>
      ) : (
        <span className="text-[9px] text-slate-300 uppercase font-bold">-</span>
      ),
      filterValue: (row) => row.missingSizes.join(' '),
    },
    {
      key: 'stock',
      title: 'Toplam Stok',
      align: 'right',
      render: (row) => (
        <span>
          <span className="font-bold font-mono text-slate-900 dark:text-slate-100">{row.stock}</span>
          <span className="text-slate-400 text-[9px] uppercase font-bold ml-1">{row.unit}</span>
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight uppercase">Kırık Beden Raporu</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm font-bold uppercase tracking-widest">Takımı bozulan veya eksik numarası kalan modellerinizi takip edin.</p>
        </div>
        <div className="flex items-center gap-3 self-start sm:self-center">
          <button 
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-slate-50 dark:bg-slate-800/50 transition-colors shadow-xs cursor-pointer"
          >
            <Printer className="w-4 h-4" /> Yazdır
          </button>
          <button 
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-indigo-700 transition-colors shadow-sm cursor-pointer"
          >
            <FileDown className="w-4 h-4" /> Excel'e Aktar
          </button>
        </div>
      </div>

      <DataGrid<BrokenRow>
        columns={columns}
        data={brokenSizeProducts}
        rowKey="id"
        loading={!products}
        emptyMessage="Kayıt bulunamadı."
        toolbar={
          <div className="relative max-w-md w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input
              type="text"
              placeholder="MODEL ARA..."
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500 text-[10px] font-bold uppercase tracking-widest transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        }
      />
    </div>
  );
}
