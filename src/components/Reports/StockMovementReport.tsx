import React, { useState } from 'react';
import { api } from '../../api/client';
import { useApiQuery } from '../../hooks/useApiQuery';
import { erpService } from '../../services/erpService';
import { ArrowUpRight, ArrowDownLeft, Search, Calendar, Package, Filter, Printer, Trash2, RotateCcw, AlertTriangle, X, Check, FileDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { printTabularReport } from '../../lib/printService';
import { exportToCsv } from '../../lib/exportService';

export default function StockMovementReport() {
  const logs = useApiQuery(() => api.inventoryLogs.list({ orderBy: 'id', orderDir: 'desc' }), [], ['inventoryLogs']);
  const products = useApiQuery(() => api.products.list(), [], ['products']);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'in' | 'out' | 'production_in' | 'production_out'>('all');
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [clearSuccess, setClearSuccess] = useState(false);

  const productMap = React.useMemo(() => {
    const map: Record<number, any> = {};
    products?.forEach(p => {
      map[p.id!] = p;
    });
    return map;
  }, [products]);

  const filteredLogs = React.useMemo(() => {
    if (!logs) return [];
    return logs.filter(log => {
      const product = productMap[log.productId];
      const matchesSearch = product?.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            product?.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            log.description.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = filterType === 'all' || log.type === filterType;
      return matchesSearch && matchesType;
    });
  }, [logs, searchTerm, filterType, productMap]);

  const handleClearLogs = async () => {
    try {
      setIsClearing(true);
      await erpService.clearAllStockMovements();
      setIsClearing(false);
      setIsClearModalOpen(false);
      setClearSuccess(true);
      setTimeout(() => setClearSuccess(false), 4000);
    } catch (e) {
      console.error(e);
      setIsClearing(false);
    }
  };

  const handlePrint = () => {
    if (!filteredLogs || filteredLogs.length === 0) return;

    const headers = ['TARİH', 'KOD', 'ÜRÜN / MODEL', 'HAREKET TİPİ', 'MİKTAR', 'AÇIKLAMA'];
    const rows = filteredLogs.map(log => {
      const p = productMap[log.productId];
      const typeLabel = 
        log.type === 'in' ? 'Stok Girişi' :
        log.type === 'out' ? 'Stok Çıkışı' :
        log.type === 'production_in' ? 'Üretim Girişi' :
        log.type === 'production_out' ? 'Hammadde Sarf' : log.type;
      
      const dateFormatted = log.date ? format(new Date(log.date), 'dd.MM.yyyy HH:mm', { locale: tr }) : '-';

      return [
        dateFormatted,
        p?.code || '-',
        p?.name || '-',
        typeLabel,
        `${log.quantity > 0 ? '+' : ''}${log.quantity} ${p?.unit || 'Adet'}`,
        log.description || '-'
      ];
    });

    const totalIn = filteredLogs.filter(l => l.type === 'in' || l.type === 'production_in').reduce((sum, l) => sum + Math.abs(l.quantity), 0);
    const totalOut = filteredLogs.filter(l => l.type === 'out' || l.type === 'production_out').reduce((sum, l) => sum + Math.abs(l.quantity), 0);

    printTabularReport(
      'Stok Hareket Raporu',
      'Giriş, çıkış ve sarf stok hareketlerinin detaylı dökümü',
      headers,
      rows,
      [
        { label: 'Kayıt Sayısı', value: filteredLogs.length },
        { label: 'Toplam Giriş', value: `+${totalIn}` },
        { label: 'Toplam Çıkış', value: `-${totalOut}` },
      ]
    );
  };

  const handleExportExcel = () => {
    if (!filteredLogs || filteredLogs.length === 0) return;
    const headers = ['Tarih', 'Ürün Kodu', 'Ürün / Model Adı', 'Hareket Tipi', 'Miktar', 'Birim', 'Açıklama'];
    const rows = filteredLogs.map(log => {
      const p = productMap[log.productId];
      const typeLabel = 
        log.type === 'in' ? 'Stok Girişi' :
        log.type === 'out' ? 'Stok Çıkışı' :
        log.type === 'production_in' ? 'Üretim Girişi' :
        log.type === 'production_out' ? 'Hammadde Sarf' : log.type;

      const dateFormatted = log.date ? format(new Date(log.date), 'dd.MM.yyyy HH:mm', { locale: tr }) : '-';
      return [
        dateFormatted,
        p?.code || '-',
        p?.name || '-',
        typeLabel,
        log.quantity,
        p?.unit || 'Adet',
        log.description || '-'
      ];
    });

    exportToCsv('Stok_Hareket_Raporu.csv', headers, rows);
  };

  return (
    <div className="space-y-6">
      {clearSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-800 flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600" />
          Stok hareket geçmişi başarıyla sıfırlandı ve temizlendi.
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Stok Hareket Raporu</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Giriş, çıkış ve üretim kaynaklı tüm stok hareketlerini takip edin.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {logs && logs.length > 0 && (
            <button
              onClick={() => setIsClearModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-rose-100 transition-colors shadow-xs cursor-pointer"
              title="Stok hareket loglarını temizle"
            >
              <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
              <span>Hareketleri Temizle</span>
            </button>
          )}

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

          <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700 self-start sm:self-center">
            {(['all', 'in', 'out', 'production_in', 'production_out'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-[9px] font-bold uppercase tracking-widest transition-all",
                  filterType === t ? "bg-white dark:bg-slate-900 shadow text-indigo-600" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-200"
                )}
              >
                {t === 'all' ? 'Tümü' : t === 'in' ? 'Giriş' : t === 'out' ? 'Çıkış' : t === 'production_in' ? 'Üretim Giriş' : 'Üretim Çıkış'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input 
              type="text" 
              placeholder="ÜRÜN VEYA AÇIKLAMA ARA..." 
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500 text-[10px] font-bold uppercase tracking-widest transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 text-[10px] text-slate-400 uppercase font-bold tracking-widest">
                <th className="px-6 py-3">Tarih</th>
                <th className="px-6 py-3">Ürün</th>
                <th className="px-6 py-3">Tür</th>
                <th className="px-6 py-3">Açıklama</th>
                <th className="px-6 py-3 text-right">Miktar</th>
              </tr>
            </thead>
            <tbody className="text-sm text-slate-600 divide-y divide-slate-50">
              {filteredLogs.length === 0 && (
                <tr key="empty-logs">
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400 font-bold uppercase text-[10px] tracking-widest">
                    Kayıtlı stok hareketi bulunamadı.
                  </td>
                </tr>
              )}
              {filteredLogs.map((log) => {
                const product = productMap[log.productId];
                const isIn = log.type === 'in' || log.type === 'production_in';
                return (
                  <tr 
                    key={log.id}
                    className="hover:bg-slate-50 dark:bg-slate-800/50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 text-slate-300" />
                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                          {format(log.date, 'dd MMM yyyy HH:mm', { locale: tr })}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                         <div className="w-8 h-8 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden border border-slate-200 dark:border-slate-700">
                           {product?.image ? (
                             <img src={product.image} className="w-full h-full object-cover" />
                           ) : (
                             <Package className="w-4 h-4 text-slate-300" />
                           )}
                         </div>
                         <div>
                           <div className="font-bold text-slate-800 dark:text-slate-200 text-[11px] uppercase tracking-tight">{product?.name || 'Bilinmeyen'}</div>
                           <div className="text-[9px] text-slate-400 font-bold uppercase">{product?.code}</div>
                         </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                       <div className={cn(
                         "flex items-center gap-1.5 px-2 py-0.5 rounded-full w-fit text-[9px] font-black uppercase tracking-widest",
                         isIn ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                       )}>
                         {isIn ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownLeft className="w-3 h-3" />}
                         {log.type === 'in' ? 'Giriş' : log.type === 'out' ? 'Çıkış' : log.type === 'production_in' ? 'ÜRETİM GİRİŞ' : 'ÜRETİM ÇIKIŞ'}
                       </div>
                    </td>
                    <td className="px-6 py-4 text-[10px] font-medium text-slate-500 dark:text-slate-400 italic max-w-xs truncate">
                      {log.description}
                    </td>
                    <td className="px-6 py-4 text-right font-bold font-mono">
                      <span className={isIn ? 'text-emerald-600' : 'text-rose-600'}>
                        {isIn ? '+' : '-'}{Math.abs(log.quantity)}
                      </span>
                      <span className="text-[9px] text-slate-400 ml-1 font-bold">{product?.unit}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Clear Stock Movements Confirmation Modal */}
      {isClearModalOpen && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md shadow-2xl border border-slate-100 dark:border-slate-800 flex flex-col max-h-[90vh] overflow-hidden my-auto animate-in fade-in zoom-in duration-200">
            <div className="p-6 bg-rose-50 border-b border-rose-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-rose-600 text-white rounded-2xl flex items-center justify-center shadow-md shadow-rose-200">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-rose-950 tracking-tight">
                    Stok Hareketlerini Sıfırla
                  </h3>
                  <p className="text-xs text-rose-700 mt-0.5">
                    Tüm Giriş, Çıkış ve Sarf Hareket Kayıtlarını Temizle
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsClearModalOpen(false)}
                disabled={isClearing}
                className="w-8 h-8 bg-white dark:bg-slate-900 border border-rose-200 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs text-slate-600 flex-1 min-h-0 overflow-y-auto">
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  Dikkat
                </div>
                <p>
                  Stok hareket raporunda listelenen <strong>{logs?.length || 0} adet</strong> hareket kaydı kalıcı olarak temizlenecektir. Ürün kartlarınız silinmez.
                </p>
              </div>
              <p>
                Tüm stok hareket geçmişini sıfırlamak istediğinize emin misiniz?
              </p>
            </div>

            <div className="p-5 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsClearModalOpen(false)}
                disabled={isClearing}
                className="px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 hover:bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleClearLogs}
                disabled={isClearing}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-md shadow-rose-200 flex items-center gap-1.5 disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                {isClearing ? 'Temizleniyor...' : 'Evet, Hepsini Temizle'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
