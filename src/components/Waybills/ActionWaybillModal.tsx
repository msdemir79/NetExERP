import { useState } from 'react';
import { waybillService } from '../../services/waybillService';
import type { Waybill } from '../../types';
import { AlertCircle, X, Trash2, Ban, ShieldAlert } from 'lucide-react';

// =========================================================================================
// ACTION / CANCEL / DELETE MODAL
// =========================================================================================
export default function ActionWaybillModal({
  waybill,
  isOpen,
  onClose,
  onSuccess
}: {
  waybill: Waybill;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (msg: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleCancel = async () => {
    if (!waybill.id || isDeleting) return;
    setIsDeleting(true);
    try {
      await waybillService.cancelWaybill(waybill.id, reason);
      onSuccess(`${waybill.waybillNumber} no'lu irsaliye iptal edildi, sipariş sevk miktarı ve stok geri yüklendi.`);
    } catch (err: any) {
      alert('İptal işlemi başarısız: ' + err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDelete = async () => {
    if (!waybill.id || isDeleting) return;
    if (!confirm('Bu irsaliye kaydını kalıcı olarak silmek istediğinize emin misiniz?')) return;

    setIsDeleting(true);
    try {
      await waybillService.deleteWaybill(waybill.id);
      onSuccess(`${waybill.waybillNumber} no'lu irsaliye kalıcı olarak silindi.`);
    } catch (err: any) {
      alert('Silme işlemi başarısız: ' + err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-rose-400" />
            <h3 className="font-bold text-sm">İrsaliye İşlemi: {waybill.waybillNumber}</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          {waybill.invoicedStatus === 'invoiced' && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Bu İrsaliye Faturalandırılmıştır!</p>
                <p className="text-[11px] text-rose-700 mt-0.5">
                  Bağlı Fatura No: <strong>{waybill.invoiceNumber || 'Fatura Kesilmiş'}</strong>. İrsaliyeyi iptal etmek veya silmek için lütfen önce ilgili faturayı iptal ediniz.
                </p>
              </div>
            </div>
          )}

          {waybill.status === 'issued' ? (
            <>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900">
                <p className="font-bold">İrsaliyeyi İptal Et</p>
                <p className="text-[11px] mt-0.5">
                  Bu irsaliye iptal edildiğinde bağlı sipariş kalemlerinin sevk miktarları geri yüklenecek ve stok hareketi otomatik olarak tersine çevrilecektir.
                </p>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">İptal Sebebi (Opsiyonel)</label>
                <input
                  type="text"
                  value={reason}
                  disabled={waybill.invoicedStatus === 'invoiced'}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Örn: Müşteri siparişi revize etti / Sevkiyat ertelendi"
                  className="w-full p-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs disabled:opacity-50"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleCancel}
                  disabled={waybill.invoicedStatus === 'invoiced' || isDeleting}
                  className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Ban className="w-4 h-4" />
                  <span>{isDeleting ? 'İşleniyor...' : 'İrsaliyeyi İptal Et'}</span>
                </button>
                <button
                  onClick={handleDelete}
                  disabled={waybill.invoicedStatus === 'invoiced' || isDeleting}
                  className="px-3 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed text-slate-600 font-bold rounded-xl transition-all cursor-pointer"
                  title="Kalıcı Olarak Sil"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-slate-600 font-medium">
                Bu irsaliye taslak veya iptal durumundadır. Kaydı kalıcı olarak veritabanından temizlemek istiyor musunuz?
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={onClose} disabled={isDeleting} className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 font-bold rounded-xl cursor-pointer">Vazgeç</button>
                <button onClick={handleDelete} disabled={isDeleting} className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl flex items-center gap-1.5 cursor-pointer">
                  <Trash2 className="w-4 h-4" />
                  <span>{isDeleting ? 'Siliniyor...' : 'Kalıcı Olarak Sil'}</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
