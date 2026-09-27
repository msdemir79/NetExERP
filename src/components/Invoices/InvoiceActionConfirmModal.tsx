import { useState } from 'react';
import { invoiceService } from '../../services/invoiceService';
import type { Invoice } from '../../types';
import { AlertCircle, X, Trash2, Check, Ban, AlertTriangle, ShieldAlert } from 'lucide-react';
import { cn } from '../../lib/utils';

// -----------------------------------------------------------------------------------------
// CONTROLLED INVOICE ACTION MODAL (CANCEL / DELETE WITH AUTOMATIC ROLLBACKS)
// -----------------------------------------------------------------------------------------

interface InvoiceActionConfirmModalProps {
  invoice: Invoice;
  contactName?: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (action: 'cancelled' | 'deleted', message: string) => void;
}

export default function InvoiceActionConfirmModal({
  invoice,
  contactName,
  isOpen,
  onClose,
  onSuccess
}: InvoiceActionConfirmModalProps) {
  const isIssued = invoice.status === 'issued';
  const isCancelled = invoice.status === 'cancelled';
  const isDraft = invoice.status === 'draft';

  const [activeTab] = useState<'cancel' | 'delete'>(isIssued ? 'cancel' : 'delete');
  const [cancelReason, setCancelReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen) return null;

  const handleCancelInvoice = async () => {
    try {
      setIsProcessing(true);
      setErrorMessage('');
      await invoiceService.cancelInvoice(invoice.id!, cancelReason.trim() || undefined);
      onSuccess(
        'cancelled',
        `${invoice.invoiceNumber} no'lu fatura iptal edildi. Sipariş miktarları, cari hesap bakiyesi ve stoklar başarıyla iade edildi.`
      );
    } catch (err: any) {
      setErrorMessage(err?.message || 'Fatura iptal edilirken bir hata oluştu.');
      setIsProcessing(false);
    }
  };

  const handleDeleteInvoice = async () => {
    try {
      setIsProcessing(true);
      setErrorMessage('');
      await invoiceService.deleteInvoice(invoice.id!);
      onSuccess(
        'deleted',
        `${invoice.invoiceNumber} no'lu fatura kalıcı olarak silindi.`
      );
    } catch (err: any) {
      setErrorMessage(err?.message || 'Fatura silinirken bir hata oluştu.');
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-xl shadow-2xl border border-slate-100 dark:border-slate-800 flex flex-col overflow-hidden my-auto animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="p-6 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-10 h-10 rounded-2xl flex items-center justify-center shadow-xs",
              activeTab === 'cancel' ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"
            )}>
              {activeTab === 'cancel' ? <Ban className="w-5 h-5" /> : <Trash2 className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-base font-black text-slate-800 dark:text-slate-200 tracking-tight">
                {isIssued 
                  ? 'Fatura İptali & Silme Kontrolü' 
                  : isDraft 
                    ? 'Taslak Faturayı Sil' 
                    : 'İptal Edilmiş Faturayı Sil'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Fatura No: <span className="font-mono font-bold text-slate-700 dark:text-slate-200">{invoice.invoiceNumber}</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isProcessing}
            className="w-9 h-9 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Invoice Summary Card */}
          <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Cari Ünvan</span>
              <span className="font-bold text-slate-800 dark:text-slate-200 truncate block">{contactName || 'Belirtilmemiş'}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Fatura Tutarı</span>
              <span className="font-mono font-bold text-indigo-700 block">
                ₺{invoice.grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Tarih</span>
              <span className="text-slate-700 dark:text-slate-200 block">{new Date(invoice.date).toLocaleDateString('tr-TR')}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Bağlı Sipariş</span>
              <span className="font-mono font-bold text-slate-700 dark:text-slate-200 block">{invoice.orderNumber || 'Yok'}</span>
            </div>
          </div>

          {/* Kesilmiş fatura kalıcı olarak silinemez; yalnızca iptal edilir.
              Taslak/iptal edilmiş faturalar doğrudan silme akışını görür. */}

          {/* Error Message */}
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {errorMessage}
            </div>
          )}

          {/* Tab 1: Cancel Invoice Content */}
          {activeTab === 'cancel' && isIssued && (
            <div className="space-y-4">
              <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-2xl space-y-2.5">
                <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
                  <ShieldAlert className="w-4 h-4 text-amber-600" />
                  İptal İşlemi İle Otomatik Gerçekleşecek Adımlar:
                </div>
                <ul className="text-xs text-amber-800 space-y-1.5 pl-1">
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span><strong>Sipariş Kalan Adetleri:</strong> {invoice.orderNumber ? `${invoice.orderNumber} siparişinden düşülen miktarlar iade edilir ve sipariş tekrar faturalanabilir duruma döner.` : 'Fatura ile düşülen sipariş kalemleri iade edilir.'}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span><strong>Cari Hesap Bakiyesi:</strong> Fatura tutarı olan <strong>₺{invoice.grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</strong> cari hesaptan düşülerek bakiye eski haline getirilir.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span><strong>Stok İadesi:</strong> Depodan çıkışı yapılan ayakkabı / varyant (beden) adetleri depoya geri yüklenir.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span><strong>Resmi Takip:</strong> Fatura kaydı ve sıra numarası silinmez, "İptal Edildi" statüsünde saklanır.</span>
                  </li>
                </ul>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1.5">
                  İptal Nedeni (Opsiyonel)
                </label>
                <input
                  type="text"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Örn: Yanlış miktar girildi / Müşteri talebiyle iptal / Hatalı iskonto"
                  className="w-full px-4 py-2.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>
            </div>
          )}

          {/* Tab 2: Permanent Delete Content (yalnızca taslak / iptal edilmiş) */}
          {!isIssued && (
            <div className="space-y-4">
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl space-y-2.5 text-xs text-rose-800">
                <div className="flex items-center gap-2 font-bold text-rose-900">
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                  Kalıcı Silme Uyarısı
                </div>
                <p>
                  {isDraft
                    ? 'Bu taslak faturayı kalıcı olarak silmek istediğinize emin misiniz?'
                    : 'Bu iptal edilmiş faturayı listeden tamamen kaldırmak üzeresiniz.'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="p-6 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="px-5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 hover:bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50"
          >
            Vazgeç
          </button>

          {activeTab === 'cancel' && isIssued ? (
            <button
              type="button"
              onClick={handleCancelInvoice}
              disabled={isProcessing}
              className="px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-md shadow-amber-200 flex items-center gap-2 disabled:opacity-50"
            >
              <Ban className="w-4 h-4" />
              {isProcessing ? 'İptal Ediliyor...' : 'Faturayı İptal Et & İadeleri Uygula'}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleDeleteInvoice}
              disabled={isProcessing}
              className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-md shadow-rose-200 flex items-center gap-2 disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              {isProcessing ? 'Siliniyor...' : 'Faturayı Tamamen Sil'}
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
