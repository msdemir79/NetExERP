import React, { useState, useMemo } from 'react';
import { api } from '../../api/client';
import { useApiQuery } from '../../hooks/useApiQuery';
import {
  Hammer,
  Search,
  Printer,
  FileDown,
  Filter,
  Clock,
  CheckCircle2,
  Layers,
  TrendingUp
} from 'lucide-react';
import DataGrid, { StatusPill, type GridColumn } from '../Common/DataGrid';
import { printTabularReport } from '../../lib/printService';
import { exportToCsv } from '../../lib/exportService';
import { cn } from '../../lib/utils';
import type { WorkOrder, ProductionStage } from '../../types';

const STAGE_LABELS: Record<ProductionStage, string> = {
  planning: 'Planlama',
  cutting: 'Kesimhane',
  printing: 'Baskı / Nakış',
  sewing: 'Saya Dikim',
  assembly: 'Taban Montaj',
  finishing: 'Finisaj',
  quality_packing: 'Kalite Kontrol & Paket',
  completed: 'Tamamlandı (Mamul Depo)'
};

const STAGE_PROGRESS: Record<ProductionStage, number> = {
  planning: 10,
  cutting: 25,
  printing: 40,
  sewing: 60,
  assembly: 75,
  finishing: 85,
  quality_packing: 95,
  completed: 100
};

export default function ProductionReport() {
  const [searchTerm, setSearchTerm] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'in_progress' | 'completed'>('all');

  // Queries
  const workOrders = useApiQuery(() => api.workOrders.list(), [], ['workOrders']) || [];
  const products = useApiQuery(() => api.products.list(), [], ['products']) || [];

  const productMap = useMemo(() => {
    return new Map(products.map(p => [p.id!, p]));
  }, [products]);

  // Filtered List
  const filteredWorkOrders = useMemo(() => {
    return workOrders.filter(wo => {
      const prod = productMap.get(wo.productId);
      const prodName = prod?.name || '';
      const prodCode = prod?.code || '';
      
      const matchesSearch = 
        wo.barcode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        prodName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        prodCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (wo.orderNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (wo.customerName || '').toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStage = stageFilter === 'all' || wo.currentStage === stageFilter;
      const matchesStatus = 
        statusFilter === 'all' || 
        (statusFilter === 'completed' && wo.currentStage === 'completed') ||
        (statusFilter === 'in_progress' && wo.currentStage !== 'completed');

      return matchesSearch && matchesStage && matchesStatus;
    });
  }, [workOrders, searchTerm, stageFilter, statusFilter, productMap]);

  // Stats calculation
  const stats = useMemo(() => {
    const totalOrders = filteredWorkOrders.length;
    const totalPairs = filteredWorkOrders.reduce((sum, wo) => sum + (wo.quantity || 0), 0);
    const completedOrders = filteredWorkOrders.filter(wo => wo.currentStage === 'completed');
    const completedPairs = completedOrders.reduce((sum, wo) => sum + (wo.quantity || 0), 0);
    const activePairs = totalPairs - completedPairs;

    // Stage counts
    const stageCounts: Record<string, { count: number; pairs: number }> = {};
    Object.keys(STAGE_LABELS).forEach(stage => {
      stageCounts[stage] = { count: 0, pairs: 0 };
    });

    filteredWorkOrders.forEach(wo => {
      if (stageCounts[wo.currentStage]) {
        stageCounts[wo.currentStage].count += 1;
        stageCounts[wo.currentStage].pairs += (wo.quantity || 0);
      }
    });

    return {
      totalOrders,
      totalPairs,
      completedOrders: completedOrders.length,
      completedPairs,
      activePairs,
      completionRate: totalPairs > 0 ? Math.round((completedPairs / totalPairs) * 100) : 0,
      stageCounts
    };
  }, [filteredWorkOrders]);

  // Print Report
  const handlePrint = () => {
    if (filteredWorkOrders.length === 0) return;

    const headers = [
      'BARKOD / NO',
      'MODEL / ÜRÜN',
      'SİPARİŞ NO',
      'MÜŞTERİ',
      'MİKTAR (ÇİFT)',
      'RENK',
      'MEVCUT AŞAMA',
      'İLERLEME (%)',
      'HEDEF TARİH',
      'OPERATÖR'
    ];

    const rows = filteredWorkOrders.map(wo => {
      const prod = productMap.get(wo.productId);
      return [
        wo.barcode,
        prod?.name || 'Bilinmiyor',
        wo.orderNumber || '-',
        wo.customerName || '-',
        wo.quantity.toString(),
        wo.color || '-',
        STAGE_LABELS[wo.currentStage] || wo.currentStage,
        `%${STAGE_PROGRESS[wo.currentStage] || 0}`,
        (wo as any).targetCompletionDate || (wo as any).dueDate ? new Date((wo as any).targetCompletionDate || (wo as any).dueDate).toLocaleDateString('tr-TR') : '-',
        wo.operator || '-'
      ];
    });

    printTabularReport(
      'Üretim & İmalat Çizelgesi Raporu',
      'Model ve iş emri bazlı aşama tamamlama durumları ve hat verimlilik özeti',
      headers,
      rows,
      [
        { label: 'Toplam İş Emri', value: stats.totalOrders },
        { label: 'Toplam İmalat', value: `${stats.totalPairs} Çift` },
        { label: 'Biten Üretim', value: `${stats.completedPairs} Çift` },
        { label: 'Hatta Devam Eden', value: `${stats.activePairs} Çift` }
      ]
    );
  };

  // Export to Excel CSV
  const handleExportCsv = () => {
    if (filteredWorkOrders.length === 0) return;

    const headers = [
      'Barkod / İş Emri No',
      'Model Kodu',
      'Model Adı',
      'Sipariş No',
      'Müşteri Adı',
      'Planlanan Miktar (Çift)',
      'Renk / Varyant',
      'Mevcut İstasyon',
      'Tamamlanma Oranı (%)',
      'Planlanan Bitiş Tarihi',
      'Sorumlu Operatör',
      'Notlar'
    ];

    const rows = filteredWorkOrders.map(wo => {
      const prod = productMap.get(wo.productId);
      return [
        wo.barcode,
        prod?.code || '',
        prod?.name || '',
        wo.orderNumber || '',
        wo.customerName || '',
        wo.quantity,
        wo.color || '',
        STAGE_LABELS[wo.currentStage] || wo.currentStage,
        STAGE_PROGRESS[wo.currentStage] || 0,
        (wo as any).targetCompletionDate || (wo as any).dueDate ? new Date((wo as any).targetCompletionDate || (wo as any).dueDate).toLocaleDateString('tr-TR') : '',
        wo.operator || '',
        wo.notes || ''
      ];
    });

    exportToCsv('Uretim_Takip_Raporu.csv', headers, rows);
  };

  const columns: GridColumn<WorkOrder>[] = [
    {
      key: 'barcode',
      title: 'Barkod / No',
      render: (wo) => (
        <span className="font-mono font-bold text-slate-600">{wo.barcode}</span>
      ),
    },
    {
      key: 'product',
      title: 'Model / Ürün',
      render: (wo) => {
        const prod = productMap.get(wo.productId);
        return (
          <div>
            <div className="font-black text-slate-900 dark:text-slate-100">{prod?.name || 'Ürün Tanımsız'}</div>
            <div className="text-[10px] text-slate-400 font-semibold">{prod?.code || ''} {wo.color ? `• ${wo.color}` : ''}</div>
          </div>
        );
      },
      filterValue: (wo) => {
        const prod = productMap.get(wo.productId);
        return `${prod?.name || ''} ${prod?.code || ''} ${wo.color || ''}`;
      },
    },
    {
      key: 'orderInfo',
      title: 'Sipariş & Müşteri',
      render: (wo) => (
        <div>
          <div className="font-bold text-slate-800 dark:text-slate-200">{wo.orderNumber || 'Serbest Stok'}</div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">{wo.customerName || '-'}</div>
        </div>
      ),
      filterValue: (wo) => `${wo.orderNumber || ''} ${wo.customerName || ''}`,
    },
    {
      key: 'quantity',
      title: 'Miktar',
      align: 'right',
      render: (wo) => (
        <span className="font-mono font-black text-slate-900 dark:text-slate-100 text-sm">
          {wo.quantity} <span className="text-[10px] text-slate-400 font-semibold">Çift</span>
        </span>
      ),
    },
    {
      key: 'currentStage',
      title: 'Mevcut İstasyon',
      render: (wo) => (
        <StatusPill
          tone={wo.currentStage === 'completed' ? 'green' : wo.currentStage === 'planning' ? 'slate' : 'blue'}
          className="border"
        >
          {STAGE_LABELS[wo.currentStage] || wo.currentStage}
        </StatusPill>
      ),
      filterValue: (wo) => STAGE_LABELS[wo.currentStage] || wo.currentStage,
    },
    {
      key: 'progress',
      title: 'İlerleme',
      width: '10rem',
      render: (wo) => {
        const progress = STAGE_PROGRESS[wo.currentStage] || 0;
        return (
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-300",
                  progress === 100 ? "bg-emerald-600" : "bg-indigo-600"
                )}
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="font-mono text-[10px] font-bold text-slate-600 w-8">
              %{progress}
            </span>
          </div>
        );
      },
      filterValue: (wo) => `${STAGE_PROGRESS[wo.currentStage] || 0}`,
    },
    {
      key: 'operator',
      title: 'Operatör',
      render: (wo) => (
        <span className="text-slate-600 font-medium text-[11px]">{wo.operator || '-'}</span>
      ),
      filterValue: (wo) => wo.operator || '',
    },
    {
      key: 'targetDate',
      title: 'Hedef Bitiş',
      align: 'right',
      render: (wo) => (
        <span className="text-slate-600 font-medium text-[11px]">
          {(wo as any).targetCompletionDate || (wo as any).dueDate ? new Date((wo as any).targetCompletionDate || (wo as any).dueDate).toLocaleDateString('tr-TR') : '-'}
        </span>
      ),
      filterValue: (wo) =>
        (wo as any).targetCompletionDate || (wo as any).dueDate
          ? new Date((wo as any).targetCompletionDate || (wo as any).dueDate).toLocaleDateString('tr-TR')
          : '',
    },
  ];

  return (
    <div className="space-y-6">
      
      {/* Üst Filtre ve Aksiyon Barı */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text"
              placeholder="Model, barkod, sipariş no ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-3 py-2 text-xs font-medium bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 w-56"
            />
          </div>

          <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/50 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
            <Filter className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
            <span className="text-[11px] font-bold text-slate-600 uppercase">Aşama:</span>
            <select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="all">Tüm Aşamalar</option>
              {Object.entries(STAGE_LABELS).map(([stageKey, label]) => (
                <option key={stageKey} value={stageKey}>{label}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            <button
              onClick={() => setStatusFilter('all')}
              className={cn(
                "px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer",
                statusFilter === 'all' ? "bg-white dark:bg-slate-900 text-indigo-700 shadow-xs" : "text-slate-600 hover:text-slate-900 dark:text-slate-100"
              )}
            >
              Tümü ({workOrders.length})
            </button>
            <button
              onClick={() => setStatusFilter('in_progress')}
              className={cn(
                "px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer",
                statusFilter === 'in_progress' ? "bg-white dark:bg-slate-900 text-amber-700 shadow-xs" : "text-slate-600 hover:text-slate-900 dark:text-slate-100"
              )}
            >
              Hatta ({workOrders.filter(w => w.currentStage !== 'completed').length})
            </button>
            <button
              onClick={() => setStatusFilter('completed')}
              className={cn(
                "px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer",
                statusFilter === 'completed' ? "bg-white dark:bg-slate-900 text-emerald-700 shadow-xs" : "text-slate-600 hover:text-slate-900 dark:text-slate-100"
              )}
            >
              Bitenler ({workOrders.filter(w => w.currentStage === 'completed').length})
            </button>
          </div>

        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-xl transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4 text-slate-600" />
            Yazdır (A4)
          </button>
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <FileDown className="w-4 h-4" />
            Excel'e Aktar
          </button>
        </div>
      </div>

      {/* KPI Kartları */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Toplam İş Emri</span>
            <Hammer className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-slate-100 font-mono">
            {stats.totalOrders} <span className="text-xs font-bold text-slate-400">Emir</span>
          </div>
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-1">
            {stats.totalPairs.toLocaleString('tr-TR')} Çift İmalat
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Tamamlanan Üretim</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-700 font-mono">
            {stats.completedPairs.toLocaleString('tr-TR')} <span className="text-xs font-bold text-slate-400">Çift</span>
          </div>
          <div className="text-[11px] font-semibold text-emerald-600 mt-1">
            %{stats.completionRate} Genel Tamamlanma
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Hatta Devam Eden</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-black text-amber-700 font-mono">
            {stats.activePairs.toLocaleString('tr-TR')} <span className="text-xs font-bold text-slate-400">Çift</span>
          </div>
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-1">
            {stats.totalOrders - stats.completedOrders} Adet Açık İş Emri
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Proses Verimliliği</span>
            <TrendingUp className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-2xl font-black text-purple-800 font-mono">
            8 İstasyon
          </div>
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-1">
            Barkodlu Akış Kontrolü
          </div>
        </div>

      </div>

      {/* İstasyon Bazlı Çift Dağılım İcmali */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs">
        <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2">
          <Layers className="w-4 h-4 text-indigo-600" />
          Hat & İstasyon Doluluk Dağılımı (Çift Adetleri)
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          {Object.entries(STAGE_LABELS).map(([stageKey, label]) => {
            const data = stats.stageCounts[stageKey] || { count: 0, pairs: 0 };
            return (
              <div 
                key={stageKey} 
                onClick={() => setStageFilter(stageFilter === stageKey ? 'all' : stageKey)}
                className={cn(
                  "p-2.5 rounded-xl border text-center transition-all cursor-pointer",
                  stageFilter === stageKey 
                    ? "bg-indigo-50 border-indigo-300 ring-2 ring-indigo-500/20" 
                    : "bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700/80 dark:border-slate-800/80"
                )}
              >
                <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 truncate" title={label}>{label}</div>
                <div className="text-base font-black text-slate-900 dark:text-slate-100 font-mono mt-0.5">{data.pairs} <span className="text-[9px] font-normal text-slate-400">çift</span></div>
                <div className="text-[9px] font-semibold text-slate-400 mt-0.5">{data.count} iş emri</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detaylı İş Emirleri Tablosu */}
      <DataGrid<WorkOrder>
        columns={columns}
        data={filteredWorkOrders}
        rowKey="id"
        emptyMessage="Seçili filtrelere uygun üretim iş emri bulunamadı."
        toolbar={
          <>
            <div className="flex items-center gap-2">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                <Hammer className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-slate-100">
                  Model ve İş Emri Bazlı İmalat İzleme Çizelgesi
                </h3>
                <p className="text-[10px] text-slate-400 font-semibold">Tüm proses istasyonları, tamamlanma yüzdeleri ve terminler</p>
              </div>
            </div>
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 ml-auto">
              {filteredWorkOrders.length} İş Emri
            </span>
          </>
        }
        footer={filteredWorkOrders.length > 0 ? (
          <div className="flex items-center justify-end gap-2 font-black text-slate-900 dark:text-slate-100 uppercase text-[10px] tracking-wider">
            <span>Toplam İmalat Adedi:</span>
            <span className="font-mono text-sm">{stats.totalPairs.toLocaleString('tr-TR')} Çift</span>
          </div>
        ) : undefined}
      />

    </div>
  );
}
