import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { Account, AccountType } from '../../types';
import { accountingService } from '../../services/accountingService';
import { showToast } from '../../lib/feedback';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  parentAccounts: Account[];
  onSuccess: () => void;
  initialParentCode?: string;
}

export default function AddAccountModal({ isOpen, onClose, parentAccounts, onSuccess, initialParentCode }: Props) {
  const [parentCode, setParentCode] = useState(initialParentCode || '100');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('TRY');
  const [description, setDescription] = useState('');

  React.useEffect(() => {
    if (initialParentCode) {
      setParentCode(initialParentCode);
    }
  }, [initialParentCode, isOpen]);

  if (!isOpen) return null;

  const selectedParent = parentAccounts.find(p => p.code === parentCode);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!code.trim() || !name.trim()) {
      showToast('Lütfen hesap kodu ve hesap adı giriniz.', 'warning');
      return;
    }

    try {
      let type: AccountType = selectedParent ? selectedParent.type : 'asset';

      await accountingService.addAccount({
        code: code.trim(),
        name: name.trim().toUpperCase(),
        type,
        level: 4,
        parentCode,
        currency,
        description: description || undefined,
        isSystem: false,
        isActive: true
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      showToast(`Hesap ekleme hatası: ${err.message}`, 'error');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-md w-full p-6 space-y-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b pb-3 shrink-0">
          <h2 className="text-lg font-bold text-gray-900">Yeni Alt / Muavin Hesap Aç</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 flex-1 min-h-0 overflow-y-auto">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Bağlı Üst Hesap (Ana Hesap) *
            </label>
            <select
              value={parentCode}
              onChange={(e) => {
                setParentCode(e.target.value);
                setCode(`${e.target.value}.`);
              }}
              className="w-full text-xs border border-gray-300 rounded-lg p-2.5 bg-white dark:bg-slate-900 font-medium"
            >
              {parentAccounts.filter(p => p.level === 3).map((p) => (
                <option key={`parent-acc-${p.code}`} value={p.code}>
                  {p.code} - {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Yeni Hesap Kodu * (Örn: 100.05, 120.03)
            </label>
            <input
              type="text"
              required
              placeholder={`${parentCode}.01`}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full text-sm font-mono font-bold border border-gray-300 rounded-lg p-2.5"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Hesap Adı *
            </label>
            <input
              type="text"
              required
              placeholder="Örn: E-TİCARET KAPIDA ÖDEME KASASI"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-lg p-2.5 uppercase"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Para Birimi
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-lg p-2.5 bg-white dark:bg-slate-900"
              >
                <option value="TRY">TRY (₺)</option>
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Açıklama
              </label>
              <input
                type="text"
                placeholder="İsteğe bağlı açıklama"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-lg p-2.5"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
            >
              Vazgeç
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 shadow-sm"
            >
              Hesabı Oluştur
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
