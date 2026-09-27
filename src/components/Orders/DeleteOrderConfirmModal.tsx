import { Trash2, AlertCircle } from 'lucide-react';
import Modal from '../Modal';

interface DeleteTarget {
  id: number;
  orderNumber: string;
  grandTotal?: number;
  contactName?: string;
}

interface DeleteOrderConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  target: DeleteTarget | null;
  error: string | null;
  isProcessing: boolean;
  onConfirm: () => void;
}

export default function DeleteOrderConfirmModal({ isOpen, onClose, target, error, isProcessing, onConfirm }: DeleteOrderConfirmModalProps) {
  return (
      <Modal
        isOpen={isOpen}
        onClose={() => {
          if (!isProcessing) onClose();
        }}
        title="Siparişi Silme Onayı"
        size="md"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3.5 bg-rose-50 border border-rose-200 rounded-2xl">
            <div className="p-2 bg-rose-100 rounded-xl text-rose-600 shrink-0">
              <Trash2 className="w-5 h-5" />
            </div>
            <div className="space-y-1 text-xs">
              <p className="font-black text-rose-900">
                "{target?.orderNumber}" numaralı siparişi silmek istediğinize emin misiniz?
              </p>
              <p className="text-rose-700 font-semibold">
                {target?.contactName && <span>Cari: <b>{target.contactName}</b><br /></span>}
                {target?.grandTotal !== undefined && <span>Tutar: <b>{target.grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</b><br /></span>}
                Bu işlem geri alınamaz. Siparişe bağlı tüm kalemler ve henüz faturası/irsaliyesi kesilmemiş iş emirleri de silinecektir.
              </p>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-300 rounded-xl">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <p className="text-xs font-bold text-red-700">{error}</p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={isProcessing}
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold uppercase transition-colors cursor-pointer"
            >
              Vazgeç
            </button>
            <button
              type="button"
              disabled={isProcessing}
              onClick={onConfirm}
              className="px-5 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-md transition-colors cursor-pointer flex items-center gap-1.5"
            >
              {isProcessing && <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              <span>Evet, Siparişi Sil</span>
            </button>
          </div>
        </div>
      </Modal>
  );
}
