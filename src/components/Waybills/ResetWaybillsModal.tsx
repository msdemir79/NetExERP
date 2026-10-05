import { useState } from 'react';
import { waybillService } from '../../services/waybillService';
import { showToast, confirmDialog } from '../../lib/feedback';
import { X, AlertTriangle, RotateCcw } from 'lucide-react';

// =========================================================================================
// RESET WAYBILLS MODAL
// =========================================================================================
export default function ResetWaybillsModal({
  isOpen,
  onClose,
  onSuccess
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [resetStock, setResetStock] = useState(true);
  const [resetOrders, setResetOrders] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleReset = async () => {
    if (!(await confirmDialog('DİKKAT: Tüm irsaliyeler silinecektir. Devam etmek istiyor musunuz?', { tone: 'danger', confirmText: 'Sıfırla' }))) return;

    setIsSubmitting(true);
    try {
      await waybillService.resetWaybillsAndShipments({
        resetStockMovements: resetStock,
        resetOrdersShipment: resetOrders
      });
      onSuccess();
    } catch (err: any) {
      showToast('Sıfırlama sırasında hata oluştu: ' + err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="p-4 bg-rose-600 text-white flex justify-between items-center">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-white" />
            <h3 className="font-bold text-sm">İrsaliyeleri Sıfırla</h3>
          </div>
          <button onClick={onClose} className="text-rose-200 hover:text-white"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          <p className="text-slate-600">
            Test ve kurulum aşamasında girilen tüm sevk ve alış irsaliyelerini topluca temizler.
          </p>

          <div className="space-y-2 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
            <label className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200 cursor-pointer">
              <input 
                type="checkbox" 
                checked={resetOrders} 
                onChange={(e) => setResetOrders(e.target.checked)} 
                className="rounded text-rose-600"
              />
              <span>Siparişlerin Sevk Miktarını ve Durumunu Geri Yükle</span>
            </label>
            <label className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200 cursor-pointer">
              <input 
                type="checkbox" 
                checked={resetStock} 
                onChange={(e) => setResetStock(e.target.checked)} 
                className="rounded text-rose-600"
              />
              <span>İrsaliye Kaynaklı Stok Hareketlerini Temizle</span>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 font-bold rounded-xl">Vazgeç</button>
            <button 
              disabled={isSubmitting}
              onClick={handleReset} 
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl flex items-center gap-1.5"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Sıfırla</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
