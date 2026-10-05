import React, { useState } from 'react';
import { X } from 'lucide-react';
import { financeService } from '../../services/financeService';
import { ContactSelect } from '../Contacts/ContactSelect';
import { showToast } from '../../lib/feedback';
import type { CheckNote, CheckStatus, Contact, BankAccount } from '../../types';

export type CheckActionType = 'collect' | 'endorse' | 'bank_collection' | 'bounce';

interface CheckActionModalProps {
  check: CheckNote;
  initialActionType: CheckActionType;
  bankAccounts: BankAccount[];
  contacts: Contact[];
  onClose: () => void;
}

export default function CheckActionModal({
  check,
  initialActionType,
  bankAccounts,
  contacts,
  onClose
}: CheckActionModalProps) {
  const [checkActionType, setCheckActionType] = useState<CheckActionType>(initialActionType);
  const [checkTargetBankId, setCheckTargetBankId] = useState<number | ''>('');
  const [checkTargetCashId, setCheckTargetCashId] = useState<number | ''>('');
  const [checkEndorseContactId, setCheckEndorseContactId] = useState<number | ''>('');
  const [checkActionNotes, setCheckActionNotes] = useState('');

  // Handle Check Action (Collect, Endorse, etc.)
  const handleSaveCheckAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!check?.id) return;
    if (checkActionType === 'endorse' && !checkEndorseContactId) {
      showToast('Lütfen ciro edilecek tedarikçiyi seçiniz.', 'warning');
      return;
    }

    try {
      let targetStatus: CheckStatus = 'collected';
      if (checkActionType === 'collect') targetStatus = 'collected';
      else if (checkActionType === 'endorse') targetStatus = 'endorsed';
      else if (checkActionType === 'bank_collection') targetStatus = 'bank_collection';
      else if (checkActionType === 'bounce') targetStatus = 'bounced';

      await financeService.updateCheckStatus(check.id, targetStatus, {
        targetBankAccountId: checkTargetBankId ? Number(checkTargetBankId) : undefined,
        targetCashBoxId: checkTargetCashId ? Number(checkTargetCashId) : undefined,
        endorsedToContactId: checkEndorseContactId ? Number(checkEndorseContactId) : undefined,
        notes: checkActionNotes
      });

      onClose();
      showToast('Çek işlem kaydı güncellendi ve muhasebe yevmiye fişi oluşturuldu.', 'success');
    } catch (err: any) {
      showToast(`Çek işlemi hatası: ${err.message}`, 'error');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-md w-full p-6 space-y-5">
        <div className="flex items-center justify-between border-b pb-3">
          <h2 className="text-lg font-bold text-gray-900">
            Çek Durum İşlemi: {check.portfolioNumber}
          </h2>
          <button
            onClick={() => onClose()}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 text-xs space-y-1">
          <p><span className="font-semibold text-gray-700">Keşideci:</span> {check.drawer}</p>
          <p><span className="font-semibold text-gray-700">Tutar:</span> ₺{check.amount.toLocaleString('tr-TR')}</p>
          <p><span className="font-semibold text-gray-700">Vade:</span> {new Date(check.dueDate).toLocaleDateString('tr-TR')}</p>
        </div>

        <form onSubmit={handleSaveCheckAction} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Yapılacak İşlem *
            </label>
            <select
              value={checkActionType}
              onChange={(e) => setCheckActionType(e.target.value as any)}
              className="w-full text-sm border border-gray-300 rounded-lg p-2.5 bg-white dark:bg-slate-900"
            >
              <option value="collect">Tahsil Et (Nakit veya Bankaya Yatır)</option>
              <option value="endorse">Ciro Et (Tedarikçiye Devret)</option>
              <option value="bank_collection">Bankaya Tahsile Ver (Beklemede)</option>
              <option value="bounce">Karşılıksız / Protesto Kaydı</option>
            </select>
          </div>

          {checkActionType === 'collect' && (
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Tahsil Edilecek Banka Hesabı
              </label>
              <select
                value={checkTargetBankId}
                onChange={(e) => setCheckTargetBankId(Number(e.target.value))}
                className="w-full text-sm border border-gray-300 rounded-lg p-2.5 bg-white dark:bg-slate-900"
              >
                <option value="">Banka Seçiniz...</option>
                {bankAccounts.map(b => (
                  <option key={b.id} value={b.id}>{b.bankName} ({b.iban})</option>
                ))}
              </select>
            </div>
          )}

          {checkActionType === 'endorse' && (
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Ciro Edilecek Tedarikçi *
              </label>
              <ContactSelect
                contacts={contacts}
                value={checkEndorseContactId ? Number(checkEndorseContactId) : null}
                allowTypes={['supplier', 'both']}
                placeholder="Tedarikçi Seçiniz..."
                showBalance
                onChange={(id) => setCheckEndorseContactId(id ?? '')}
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              İşlem Notu
            </label>
            <input
              type="text"
              placeholder="İsteğe bağlı not..."
              value={checkActionNotes}
              onChange={(e) => setCheckActionNotes(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-lg p-2.5"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={() => onClose()}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
            >
              Vazgeç
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 shadow-sm"
            >
              Onayla & TDHP'ye İşle
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
