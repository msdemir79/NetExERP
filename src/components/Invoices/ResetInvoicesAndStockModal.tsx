import { useState } from 'react';
import { invoiceService } from '../../services/invoiceService';
import { Receipt, AlertCircle, X, Building2, ShoppingBag, Package, AlertTriangle, RotateCcw } from 'lucide-react';

// -----------------------------------------------------------------------------------------
// RESET INVOICES & STOCK MOVEMENTS MODAL (Full Testing Reset)
// -----------------------------------------------------------------------------------------

interface ResetInvoicesAndStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export default function ResetInvoicesAndStockModal({
  isOpen,
  onClose,
  onSuccess
}: ResetInvoicesAndStockModalProps) {
  const [clearStockLogs, setClearStockLogs] = useState(true);
  const [resetOrderInvoicing, setResetOrderInvoicing] = useState(true);
  const [resetContactBalances, setResetContactBalances] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleExecuteReset = async () => {
    try {
      setIsProcessing(true);
      setError('');

      await invoiceService.resetInvoicesAndStockMovements({
        resetStockMovements: clearStockLogs,
        resetOrdersInvoicing: resetOrderInvoicing,
        resetContactBalances: resetContactBalances
      });

      onSuccess(
        'Tüm faturalar, fatura kalemleri, stok hareket kayıtları ve sipariş faturalanma durumları sıfırlandı. Yeniden test etmeye hazırsınız.'
      );
    } catch (err: any) {
      setError(err?.message || 'Sıfırlama işlemi sırasında bir hata oluştu.');
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-lg shadow-2xl border border-slate-100 dark:border-slate-800 flex flex-col overflow-hidden my-auto animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="p-6 bg-rose-50 border-b border-rose-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-rose-600 text-white rounded-2xl flex items-center justify-center shadow-md shadow-rose-200">
              <RotateCcw className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-black text-rose-950 tracking-tight">
                Fatura & Stok Hareketlerini Sıfırla
              </h3>
              <p className="text-xs text-rose-700 mt-0.5">
                Test Verilerini Temizleme ve Başlangıç Durumuna Getirme
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isProcessing}
            className="w-9 h-9 bg-white dark:bg-slate-900 border border-rose-200 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 space-y-1.5">
            <div className="flex items-center gap-2 font-bold text-amber-950">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              Sıfırlama Bilgilendirmesi
            </div>
            <p>
              Bu işlem ile sistemdeki tüm fatura kayıtları ve geçmiş stok hareket logları temizlenir. Ürün kartlarınız ve tanımlı siparişleriniz silinmez, yalnızca faturalanma durumları sıfırlanır.
            </p>
          </div>

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Options */}
          <div className="space-y-3">
            <label className="text-xs font-black uppercase text-slate-400 tracking-wider block">
              Sıfırlanacak Alanlar
            </label>

            <div className="space-y-2.5">
              <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl">
                <div className="flex items-center gap-2.5">
                  <Receipt className="w-4 h-4 text-indigo-600" />
                  <div>
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200">Tüm Faturalar ve Kalemleri</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">Satış ve alış fatura kayıtları tamamen silinir.</div>
                  </div>
                </div>
                <div className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  Dahil
                </div>
              </div>

              <label className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl cursor-pointer transition-colors">
                <div className="flex items-center gap-2.5">
                  <Package className="w-4 h-4 text-amber-600" />
                  <div>
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200">Stok Hareket Geçmişi (Loglar)</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">Raporlardaki tüm giriş, çıkış ve sarf hareket dökümü sıfırlanır.</div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={clearStockLogs}
                  onChange={(e) => setClearStockLogs(e.target.checked)}
                  className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 border-slate-300"
                />
              </label>

              <label className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl cursor-pointer transition-colors">
                <div className="flex items-center gap-2.5">
                  <ShoppingBag className="w-4 h-4 text-blue-600" />
                  <div>
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200">Sipariş Faturalanma Durumları</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">Siparişlerin faturalanan miktarları 0'lanır ve tekrar faturalandırılabilir olur.</div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={resetOrderInvoicing}
                  onChange={(e) => setResetOrderInvoicing(e.target.checked)}
                  className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 border-slate-300"
                />
              </label>

              <label className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl cursor-pointer transition-colors">
                <div className="flex items-center gap-2.5">
                  <Building2 className="w-4 h-4 text-emerald-600" />
                  <div>
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200">Cari Fatura Bakiyeleri</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">Faturalardan kaynaklanan cari hesap borç/alacak bakiyeleri sıfırlanır.</div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={resetContactBalances}
                  onChange={(e) => setResetContactBalances(e.target.checked)}
                  className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 border-slate-300"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="px-5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 hover:bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50"
          >
            Vazgeç
          </button>
          <button
            type="button"
            onClick={handleExecuteReset}
            disabled={isProcessing}
            className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-md shadow-rose-200 flex items-center gap-2 disabled:opacity-50"
          >
            <RotateCcw className="w-4 h-4" />
            {isProcessing ? 'Sıfırlanıyor...' : 'Seçilenleri Sıfırla ve Temizle'}
          </button>
        </div>

      </div>
    </div>
  );
}
