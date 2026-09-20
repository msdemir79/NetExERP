import React, { useState, useEffect } from 'react';
import { 
  Trash2, 
  X, 
  AlertTriangle, 
  CheckCircle2, 
  ShieldAlert, 
  Layers, 
  FileText, 
  Users, 
  Package, 
  CreditCard 
} from 'lucide-react';
import type { Account } from '../../types';
import { accountingService } from '../../services/accountingService';

interface DeleteAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  account: Account | null;
  onSuccess?: () => void;
}

export default function DeleteAccountModal({
  isOpen,
  onClose,
  account,
  onSuccess
}: DeleteAccountModalProps) {
  const [loadingCheck, setLoadingCheck] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [checkResult, setCheckResult] = useState<{
    canDelete: boolean;
    reason?: string;
    isSystem: boolean;
    childAccounts: Account[];
    journalEntriesCount: number;
    totalDebit: number;
    totalCredit: number;
    linkedContactsCount: number;
    linkedCashOrBankCount: number;
    linkedProductsCount: number;
  }>({
    canDelete: false,
    isSystem: false,
    childAccounts: [],
    journalEntriesCount: 0,
    totalDebit: 0,
    totalCredit: 0,
    linkedContactsCount: 0,
    linkedCashOrBankCount: 0,
    linkedProductsCount: 0
  });

  useEffect(() => {
    if (isOpen && account && account.id) {
      setLoadingCheck(true);
      setError(null);
      accountingService.checkAccountDeletable(account.id)
        .then(res => {
          setCheckResult(res);
        })
        .catch(err => {
          setError(err?.message || 'Hesap kontrolü yapılamadı.');
        })
        .finally(() => {
          setLoadingCheck(false);
        });
    }
  }, [isOpen, account]);

  if (!isOpen || !account) return null;

  const levelLabel = 
    account.level === 1 ? '1: Sınıf' :
    account.level === 2 ? '2: Grup' :
    account.level === 3 ? '3: Ana Hesap' :
    account.level === 4 ? '4: Alt Hesap' : '5: Muavin Hesap';

  const handleDelete = async () => {
    if (!account.id || !checkResult.canDelete) return;

    setDeleting(true);
    setError(null);

    try {
      await accountingService.deleteAccount(account.id);
      if (onSuccess) {
        onSuccess();
      }
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Hesap silinirken bir hata oluştu.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 dark:border-slate-700">
        
        {/* Header */}
        <div className="bg-rose-900 text-white px-5 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-rose-700 flex items-center justify-center text-white shadow-xs">
              <Trash2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">TDHP Hesabını Sil</h2>
              <p className="text-xs text-rose-200">Hesap planı tanımını sistemden kaldırın</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-rose-300 hover:text-white hover:bg-rose-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 flex-1 min-h-0 overflow-y-auto">
          
          {/* Account Details Box */}
          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700 space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Hesap Kodu:</span>
                <span className="font-mono font-black text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 px-2.5 py-0.5 rounded text-sm">
                  {account.code}
                </span>
              </div>
              <span className="text-[11px] bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium px-2 py-0.5 rounded">
                Seviye: {levelLabel}
              </span>
            </div>

            <div>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium block">Hesap Adı:</span>
              <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {account.name}
              </span>
            </div>

            {account.description && (
              <div className="text-xs text-slate-600 dark:text-slate-300">
                <span className="font-medium text-slate-500 dark:text-slate-400">Açıklama:</span> {account.description}
              </div>
            )}
          </div>

          {/* Loading State */}
          {loadingCheck && (
            <div className="py-6 flex flex-col items-center justify-center gap-2 text-slate-500">
              <div className="w-6 h-6 border-2 border-rose-600 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs font-medium">Hesap ilişkileri ve hareketleri denetleniyor...</span>
            </div>
          )}

          {/* General Error Message */}
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Condition Checks Result */}
          {!loadingCheck && (
            <>
              {/* CANNOT DELETE: Protected System Account */}
              {checkResult.isSystem && (
                <div className="p-3.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs space-y-1.5">
                  <div className="flex items-center gap-2 font-bold text-amber-800 dark:text-amber-300">
                    <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Sistem Hesabı Silinemez</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-amber-800/90 dark:text-amber-200/90">
                    Bu hesap ({account.code}), Tek Düzen Hesap Planı resmi mevzuat yapısına ait standart sistem hesabıdır. Muhasebe düzeninin bozulmaması için sistem hesapları silinemez.
                  </p>
                </div>
              )}

              {/* CANNOT DELETE: Has Sub-Accounts */}
              {!checkResult.isSystem && checkResult.childAccounts.length > 0 && (
                <div className="p-3.5 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200 text-xs space-y-2">
                  <div className="flex items-center gap-2 font-bold text-rose-800 dark:text-rose-300">
                    <Layers className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>Alt Hesaplar Bulunuyor ({checkResult.childAccounts.length} Adet)</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-rose-800/90 dark:text-rose-200/90">
                    Bu hesabın altında tanımlı alt hesaplar bulunmaktadır. Bu ana/ara hesabı silebilmek için öncelikle altındaki tüm hesapları silmeniz gerekmektedir.
                  </p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {checkResult.childAccounts.slice(0, 6).map(child => (
                      <span key={child.id || child.code} className="font-mono text-[10px] bg-white dark:bg-slate-900 border border-rose-200 px-1.5 py-0.5 rounded text-rose-700 dark:text-rose-300 font-semibold">
                        {child.code} {child.name}
                      </span>
                    ))}
                    {checkResult.childAccounts.length > 6 && (
                      <span className="text-[10px] text-rose-600 font-bold self-center">
                        +{checkResult.childAccounts.length - 6} diğer
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* CANNOT DELETE: Has Journal Entries */}
              {!checkResult.isSystem && checkResult.childAccounts.length === 0 && checkResult.journalEntriesCount > 0 && (
                <div className="p-3.5 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200 text-xs space-y-2">
                  <div className="flex items-center gap-2 font-bold text-rose-800 dark:text-rose-300">
                    <FileText className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>Muhasebe Fiş Hareketi Bulunuyor ({checkResult.journalEntriesCount} Fiş)</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-rose-800/90 dark:text-rose-200/90">
                    Bu hesap ile kaydedilmiş yevmiye fişleri bulunmaktadır. Mali tablolar ve defter-i kebir dengesi için hareket görmüş hesaplar silinemez.
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-[11px] bg-white dark:bg-slate-900 p-2 rounded border border-rose-200">
                    <div>
                      <span className="text-slate-500 font-medium">Toplam Borç Hareketi:</span>
                      <div className="font-mono font-bold text-slate-900 dark:text-slate-100">
                        {checkResult.totalDebit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                      </div>
                    </div>
                    <div>
                      <span className="text-slate-500 font-medium">Toplam Alacak Hareketi:</span>
                      <div className="font-mono font-bold text-slate-900 dark:text-slate-100">
                        {checkResult.totalCredit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* CAN DELETE: Safe to delete */}
              {checkResult.canDelete && (
                <div className="space-y-3">
                  <div className="p-3.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 text-xs space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-emerald-800 dark:text-emerald-300">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Silme İşlemine Uygun (Hareket Görmemiş)</span>
                    </div>
                    <p className="text-[11px] text-emerald-800/90 dark:text-emerald-200/90">
                      Bu hesapta herhangi bir yevmiye fişi veya bakiye bulunmamaktadır. Yanlışlıkla açıldıysa sistemden güvenle silebilirsiniz.
                    </p>
                  </div>

                  {/* Inform if linked to cards */}
                  {(checkResult.linkedContactsCount > 0 || checkResult.linkedCashOrBankCount > 0 || checkResult.linkedProductsCount > 0) && (
                    <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-200 text-xs space-y-1">
                      <span className="font-semibold block text-blue-800 dark:text-blue-300">Bağlantılı Kart Bilgisi:</span>
                      <ul className="list-disc list-inside text-[11px] text-blue-800/90 dark:text-blue-200/90 space-y-0.5">
                        {checkResult.linkedContactsCount > 0 && (
                          <li>{checkResult.linkedContactsCount} adet cari kartta bu hesap tanımlı.</li>
                        )}
                        {checkResult.linkedCashOrBankCount > 0 && (
                          <li>{checkResult.linkedCashOrBankCount} adet kasa / banka kartında bu hesap tanımlı.</li>
                        )}
                        {checkResult.linkedProductsCount > 0 && (
                          <li>{checkResult.linkedProductsCount} adet stok / mamul kartında bu hesap tanımlı.</li>
                        )}
                      </ul>
                      <p className="text-[10px] text-blue-700 dark:text-blue-300 pt-0.5">
                        * Hesap silindiğinde bu kartlardaki TDHP hesap kodu alanı otomatik olarak boşaltılacaktır.
                      </p>
                    </div>
                  )}

                  <div className="p-3 rounded-lg bg-rose-50/70 border border-rose-100 text-rose-900 text-xs">
                    <strong className="block font-bold mb-0.5">Dikkat:</strong>
                    Bu hesabı sildiğinizde hesap planından ve arama listelerinden kalıcı olarak silinecektir. Bu işlem geri alınamaz.
                  </div>
                </div>
              )}
            </>
          )}

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              {checkResult.canDelete ? 'Vazgeç' : 'Kapat'}
            </button>

            {checkResult.canDelete && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 rounded-lg shadow-sm transition-colors disabled:opacity-50 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                {deleting ? 'Siliniyor...' : 'Hesabı Kalıcı Olarak Sil'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
