import React, { useState } from 'react';
import { X, AlertTriangle, Trash2 } from 'lucide-react';
import type { CashBox, BankAccount } from '../../types';

interface DeleteFinanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'cash' | 'bank';
  target: CashBox | BankAccount | null;
  receiptCount: number;
  onConfirm: (force: boolean) => Promise<void>;
}

export default function DeleteFinanceModal({
  isOpen,
  onClose,
  type,
  target,
  receiptCount,
  onConfirm
}: DeleteFinanceModalProps) {
  const [forceConfirmed, setForceConfirmed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !target) return null;

  const isCash = type === 'cash';
  const cash = target as CashBox;
  const bank = target as BankAccount;

  const displayName = isCash ? `${cash.code} - ${cash.name}` : `${bank.bankName} (${bank.branchName || 'Merkez'})`;
  const balance = target.balance || 0;

  const handleDelete = async () => {
    if (receiptCount > 0 && !forceConfirmed) {
      setError('Bağlı makbuz kayıtları bulunduğu için lütfen onay kutusunu işaretleyiniz.');
      return;
    }

    setDeleting(true);
    setError(null);
    try {
      await onConfirm(receiptCount > 0);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Silme işlemi sırasında bir hata oluştu.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-md w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 dark:border-slate-700">
        {/* Header */}
        <div className="bg-rose-600 text-white px-5 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-rose-700/80 flex items-center justify-center text-white">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">
                {isCash ? 'Kasayı Sil' : 'Banka Hesabını Sil'}
              </h2>
              <p className="text-xs text-rose-100">Bu işlem geri alınamaz</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-rose-200 hover:text-white hover:bg-rose-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 flex-1 min-h-0 overflow-y-auto">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              {error}
            </div>
          )}

          <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700 space-y-1">
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Silinecek {isCash ? 'Kasa' : 'Banka Hesabı'}:
            </p>
            <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{displayName}</p>
            {isCash ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">TDHP: {cash.accountCode}</p>
            ) : (
              <p className="text-xs font-mono text-slate-600">{bank.iban}</p>
            )}
            <div className="pt-2 flex items-center justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-400">Mevcut Bakiye:</span>
              <span className={`font-bold ${balance > 0 ? 'text-emerald-600' : 'text-slate-700 dark:text-slate-200'}`}>
                ₺{balance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {receiptCount > 0 ? (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-2">
              <div className="flex items-center gap-1.5 font-bold text-amber-800">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Dikkat: Bağlı Makbuz Kayıtları Mevcut</span>
              </div>
              <p className="text-amber-700 leading-relaxed">
                Bu hesaba bağlı <strong>{receiptCount} adet</strong> tahsilat veya tediye makbuzu bulunmaktadır. Kartı sildiğinizde hesap planındaki geçmiş yevmiye kayıtları korunacak ancak bu kart finans listesinden kaldırılacaktır.
              </p>
              <label className="flex items-center gap-2 pt-1 font-semibold text-amber-900 cursor-pointer">
                <input
                  type="checkbox"
                  checked={forceConfirmed}
                  onChange={e => setForceConfirmed(e.target.checked)}
                  className="rounded border-amber-300 text-rose-600 focus:ring-rose-500"
                />
                <span>Bağlı makbuzlara rağmen bu kartı silmeyi onaylıyorum</span>
              </label>
            </div>
          ) : (
            <p className="text-xs text-slate-600">
              Bu {isCash ? 'kasayı' : 'banka hesabını'} sistemden kalıcı olarak silmek istediğinizden emin misiniz?
            </p>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-lg transition-colors"
            >
              Vazgeç
            </button>
            <button
              type="button"
              disabled={deleting || (receiptCount > 0 && !forceConfirmed)}
              onClick={handleDelete}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 rounded-lg shadow-sm transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              {deleting ? 'Siliniyor...' : 'Evet, Sil'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
