import React, { useState, useEffect } from 'react';
import { X, Edit3, Check, Wallet, AlertCircle } from 'lucide-react';
import type { CashBox } from '../../types';
import { financeService } from '../../services/financeService';

interface EditCashBoxModalProps {
  isOpen: boolean;
  onClose: () => void;
  cashBox: CashBox | null;
  onSuccess?: () => void;
}

export default function EditCashBoxModal({
  isOpen,
  onClose,
  cashBox,
  onSuccess
}: EditCashBoxModalProps) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [accountCode, setAccountCode] = useState('100.01');
  const [currency, setCurrency] = useState('TRY');
  const [balance, setBalance] = useState('0');
  const [responsiblePerson, setResponsiblePerson] = useState('');
  const [notes, setNotes] = useState('');
  const [syncAccount, setSyncAccount] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cashBox) {
      setCode(cashBox.code || '');
      setName(cashBox.name || '');
      setAccountCode(cashBox.accountCode || '100.01');
      setCurrency(cashBox.currency || 'TRY');
      setBalance(cashBox.balance !== undefined ? cashBox.balance.toString() : '0');
      setResponsiblePerson(cashBox.responsiblePerson || '');
      setNotes(cashBox.notes || '');
      setError(null);
    }
  }, [cashBox]);

  if (!isOpen || !cashBox) return null;

  // Formatting helpers
  const handleToUpperCase = () => {
    setName(prev => prev.toLocaleUpperCase('tr-TR'));
  };

  const handleToTitleCase = () => {
    setName(prev =>
      prev
        .toLocaleLowerCase('tr-TR')
        .split(' ')
        .filter(Boolean)
        .map(w => w.charAt(0).toLocaleUpperCase('tr-TR') + w.slice(1))
        .join(' ')
    );
  };

  const handleCleanWhitespace = () => {
    setName(prev => prev.replace(/\s+/g, ' ').trim());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Lütfen geçerli bir kasa adı giriniz.');
      return;
    }
    if (!code.trim()) {
      setError('Lütfen kasa kodu giriniz.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await financeService.updateCashBox(
        cashBox.id!,
        {
          code: code.trim(),
          name: name.trim(),
          accountCode: accountCode.trim(),
          currency,
          balance: parseFloat(balance) || 0,
          responsiblePerson: responsiblePerson.trim() || undefined,
          notes: notes.trim() || undefined
        },
        syncAccount
      );

      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Kasa güncellenirken bir hata oluştu.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 dark:border-slate-700">
        {/* Header */}
        <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white">
              <Wallet className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">Kasa Bilgilerini Düzenle</h2>
              <p className="text-xs text-slate-300">Nakit kasa kartı ve hesap detaylarını güncelleyin</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 flex-1 min-h-0 overflow-y-auto">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Kasa Kodu ve TDHP Kodu */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Kasa Kodu <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={code}
                onChange={e => setCode(e.target.value)}
                placeholder="Örn: KAS-01"
                className="w-full text-xs font-mono font-bold border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                TDHP Muhasebe Kodu
              </label>
              <input
                type="text"
                value={accountCode}
                onChange={e => setAccountCode(e.target.value)}
                placeholder="Örn: 100.01"
                className="w-full text-xs font-mono border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-900"
              />
            </div>
          </div>

          {/* Kasa Adı */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-gray-800">
                Kasa Adı <span className="text-rose-500">*</span>
              </label>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleToTitleCase}
                  className="px-2 py-0.5 text-[11px] font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded border border-slate-300 transition-colors"
                  title="İlk harfleri büyük yap"
                >
                  Aa Baş Harfler
                </button>
                <button
                  type="button"
                  onClick={handleToUpperCase}
                  className="px-2 py-0.5 text-[11px] font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded border border-slate-300 transition-colors"
                  title="Tümünü büyük yap"
                >
                  AA BÜYÜK
                </button>
                <button
                  type="button"
                  onClick={handleCleanWhitespace}
                  className="px-2 py-0.5 text-[11px] font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded border border-slate-300 transition-colors"
                  title="Boşlukları düzenle"
                >
                  Boşlukları Düzelt
                </button>
              </div>
            </div>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Örn: Merkez TL Kasası"
              className="w-full text-sm font-medium border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-900"
            />
          </div>

          {/* Bakiye ve Para Birimi */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Güncel Bakiye
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  value={balance}
                  onChange={e => setBalance(e.target.value)}
                  className="w-full text-xs font-bold text-emerald-700 border border-gray-300 rounded-lg p-2 pr-8 focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-900"
                />
                <span className="absolute right-2.5 top-2 text-xs font-bold text-gray-400 select-none">
                  {currency === 'TRY' ? '₺' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency}
                </span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Para Birimi
              </label>
              <select
                value={currency}
                onChange={e => setCurrency(e.target.value)}
                className="w-full text-xs font-semibold border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-900"
              >
                <option value="TRY">TRY - Türk Lirası</option>
                <option value="USD">USD - Amerikan Doları</option>
                <option value="EUR">EUR - Euro</option>
                <option value="GBP">GBP - İngiliz Sterlini</option>
              </select>
            </div>
          </div>

          {/* Sorumlu Kişi */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Kasa Sorumlusu / Yetkili
            </label>
            <input
              type="text"
              value={responsiblePerson}
              onChange={e => setResponsiblePerson(e.target.value)}
              placeholder="Örn: Ahmet Yılmaz"
              className="w-full text-xs border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-900"
            />
          </div>

          {/* Notlar */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Açıklama / Notlar
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Kasa ile ilgili ek notlar..."
              className="w-full text-xs border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-900 resize-none"
            />
          </div>

          {/* TDHP Senkronizasyonu */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={syncAccount}
                onChange={e => setSyncAccount(e.target.checked)}
                className="mt-0.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
              />
              <div className="text-xs text-slate-700 dark:text-slate-200">
                <span className="font-semibold text-slate-800 dark:text-slate-200">Tek Düzen Hesap Planı (TDHP) hesabını da güncelle</span>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {accountCode} nolu muhasebe hesap kartının adını ve kodunu bu kasa bilgileriyle senkronize eder.
                </p>
              </div>
            </label>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-lg transition-colors"
            >
              Vazgeç
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-lg shadow-sm transition-colors disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              {saving ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
