import React, { useState } from 'react';
import { Package, Layers, ArrowLeftRight, AlertTriangle } from 'lucide-react';
import StockSummaryReport from './StockSummaryReport';
import StockDetailReport from './StockDetailReport';
import StockMovementReport from './StockMovementReport';
import BrokenSizeReport from './BrokenSizeReport';
import { cn } from '../../lib/utils';

export default function StockReportTab() {
  const [stockSubTab, setStockSubTab] = useState<'summary' | 'detail' | 'movements' | 'broken'>('summary');

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs flex flex-wrap items-center gap-2">
        <button
          onClick={() => setStockSubTab('summary')}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer",
            stockSubTab === 'summary' 
              ? "bg-indigo-600 text-white shadow-xs" 
              : "text-slate-600 hover:bg-slate-100 dark:bg-slate-800"
          )}
        >
          <Package className="w-4 h-4" />
          Stok Özet Raporu
        </button>

        <button
          onClick={() => setStockSubTab('detail')}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer",
            stockSubTab === 'detail' 
              ? "bg-indigo-600 text-white shadow-xs" 
              : "text-slate-600 hover:bg-slate-100 dark:bg-slate-800"
          )}
        >
          <Layers className="w-4 h-4" />
          Beden & Numara Detay Raporu
        </button>

        <button
          onClick={() => setStockSubTab('movements')}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer",
            stockSubTab === 'movements' 
              ? "bg-indigo-600 text-white shadow-xs" 
              : "text-slate-600 hover:bg-slate-100 dark:bg-slate-800"
          )}
        >
          <ArrowLeftRight className="w-4 h-4" />
          Stok Giriş / Çıkış Hareketleri
        </button>

        <button
          onClick={() => setStockSubTab('broken')}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer",
            stockSubTab === 'broken' 
              ? "bg-indigo-600 text-white shadow-xs" 
              : "text-slate-600 hover:bg-slate-100 dark:bg-slate-800"
          )}
        >
          <AlertTriangle className="w-4 h-4" />
          Kırık Beden & Asorti Raporu
        </button>
      </div>

      {stockSubTab === 'summary' && <StockSummaryReport />}
      {stockSubTab === 'detail' && <StockDetailReport />}
      {stockSubTab === 'movements' && <StockMovementReport />}
      {stockSubTab === 'broken' && <BrokenSizeReport />}
    </div>
  );
}
