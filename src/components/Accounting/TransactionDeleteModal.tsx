import React, { useState } from 'react';
import type { Transaction, Contact } from '../../types';
import { 
  Trash2, 
  AlertTriangle, 
  X, 
  ArrowDownLeft, 
  ArrowUpRight, 
  Building2, 
  Calendar,
  CreditCard
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { contactService } from '../../services/contactService';

interface TransactionDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: Transaction | null;
  contact?: Contact | null;
  onSuccess?: (message?: string) => void;
}

export default function TransactionDeleteModal({
  isOpen,
  onClose,
  transaction,
  contact,
  onSuccess
}: TransactionDeleteModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !transaction) return null;

  const handleDelete = async () => {
    try {
      setLoading(true);
      setError(null);
      await contactService.deleteTransaction(transaction.id!);
      if (onSuccess) onSuccess('Finansal hareket kaydı silindi ve cari bakiye güncellendi.');
      onClose();
    } catch (err: any) {
      setError(err?.message || 'İşlem silinirken bir hata oluştu.');
      setLoading(false);
    }
  };

  const isIncome = transaction.type === 'income';

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md shadow-2xl border border-slate-100 dark:border-slate-800 flex flex-col max-h-[90vh] overflow-hidden my-auto animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="p-6 bg-rose-50 border-b border-rose-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-rose-600 text-white rounded-2xl flex items-center justify-center shadow-md shadow-rose-200">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-black text-rose-950 tracking-tight">
                {isIncome ? 'Tahsilat Kaydını Sil' : 'Ödeme Kaydını Sil'}
              </h3>
              <p className="text-xs text-rose-700 mt-0.5">
                Finansal hareket iptal edilecek
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={loading}
            className="w-9 h-9 bg-white dark:bg-slate-900 border border-rose-200 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 text-xs flex-1 min-h-0 overflow-y-auto">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl">
              {error}
            </div>
          )}

          <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-amber-900 space-y-1">
            <div className="font-bold flex items-center gap-1.5 text-amber-950">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              Bakiye Düzeltme Uyarısı
            </div>
            <p>
              Bu {isIncome ? 'tahsilat' : 'ödeme'} kaydını sildiğinizde, varsa ilgili cari hesabın bakiyesi bu işlem öncesindeki durumuna geri döndürülecektir.
            </p>
          </div>

          {/* Transaction Summary Card */}
          <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[10px]">Tutar:</span>
              <span className={cn(
                "font-mono font-black text-base",
                isIncome ? "text-emerald-600" : "text-rose-600"
              )}>
                {isIncome ? '+' : '-'}₺{transaction.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[10px]">Tür / Kategori:</span>
              <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200">
                <span className={cn(
                  "px-2 py-0.5 rounded text-[10px] uppercase tracking-wider",
                  isIncome ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                )}>
                  {isIncome ? 'Tahsilat' : 'Ödeme'}
                </span>
                <span>{transaction.category}</span>
              </div>
            </div>

            {contact && (
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[10px]">İlgili Cari:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{contact.name}</span>
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[10px]">Tarih / Belge:</span>
              <span className="font-mono text-slate-700 dark:text-slate-200 font-bold">
                {new Date(transaction.date).toLocaleDateString('tr-TR')} {transaction.documentNo ? `(${transaction.documentNo})` : ''}
              </span>
            </div>

            {transaction.description && (
              <div className="pt-2 border-t border-slate-200 dark:border-slate-700 text-slate-600">
                <span className="font-bold text-slate-700 dark:text-slate-200 block mb-0.5">Açıklama:</span>
                {transaction.description}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 hover:bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-50"
          >
            Vazgeç
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={loading}
            className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors shadow-md shadow-rose-200 flex items-center gap-2 disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            {loading ? 'Siliniyor...' : 'Evet, Bu Hareketi Sil'}
          </button>
        </div>
      </div>
    </div>
  );
}
