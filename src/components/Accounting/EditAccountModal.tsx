import React, { useState, useEffect } from 'react';
import { X, Edit3, Type, Check, Sparkles, Building2, Trash2 } from 'lucide-react';
import type { Account } from '../../types';
import { accountingService } from '../../services/accountingService';

interface EditAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  account: Account | null;
  onSuccess?: () => void;
  onDeleteAccount?: (account: Account) => void;
}

export default function EditAccountModal({
  isOpen,
  onClose,
  account,
  onSuccess,
  onDeleteAccount
}: EditAccountModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [currency, setCurrency] = useState('TRY');
  const [syncJournalEntries, setSyncJournalEntries] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (account) {
      setName(account.name || '');
      setDescription(account.description || '');
      setCurrency(account.currency || 'TRY');
      setError(null);
    }
  }, [account]);

  if (!isOpen || !account) return null;

  // Formatting helpers for tidy account names
  const handleToUpperCase = () => {
    setName(prev => prev.toLocaleUpperCase('tr-TR'));
  };

  const handleToTitleCase = () => {
    setName(prev => 
      prev
        .toLocaleLowerCase('tr-TR')
        .split(' ')
        .filter(Boolean)
        .map(word => word.charAt(0).toLocaleUpperCase('tr-TR') + word.slice(1))
        .join(' ')
    );
  };

  const handleCleanWhitespace = () => {
    setName(prev => prev.replace(/\s+/g, ' ').trim());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Lütfen geçerli bir hesap adı giriniz.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await accountingService.updateAccount(
        account.id!,
        {
          name: name.trim(),
          description: description.trim() || undefined,
          currency: currency.trim() || 'TRY'
        },
        syncJournalEntries
      );

      if (onSuccess) {
        onSuccess();
      }
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Hesap güncellenirken bir hata oluştu.');
    } finally {
      setSaving(false);
    }
  };

  const levelLabel = 
    account.level === 1 ? '1: Sınıf' :
    account.level === 2 ? '2: Grup' :
    account.level === 3 ? '3: Ana Hesap' :
    account.level === 4 ? '4: Alt Hesap' : '5: Muavin Hesap';

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 dark:border-slate-700">
        {/* Header */}
        <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/80 flex items-center justify-center text-white">
              <Edit3 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">Hesap Adını ve Bilgilerini Düzenle</h2>
              <p className="text-xs text-slate-300">Tek Düzen Hesap Planı tanımını düzenleyin</p>
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
          {/* Account Meta Badges */}
          <div className="flex flex-wrap items-center gap-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700 text-xs">
            <span className="font-semibold text-slate-600">Hesap Kodu:</span>
            <span className="font-mono font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded text-sm">
              {account.code}
            </span>
            <span className="text-slate-300">|</span>
            <span className="font-semibold text-slate-600">Seviye:</span>
            <span className="bg-slate-200 text-slate-800 dark:text-slate-200 font-medium px-2 py-0.5 rounded">
              {levelLabel}
            </span>
            {account.isSystem ? (
              <span className="bg-amber-50 text-amber-700 border border-amber-200 font-medium px-2 py-0.5 rounded">
                Sistem Hesabı
              </span>
            ) : (
              <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium px-2 py-0.5 rounded">
                Kullanıcı / Cari Hesabı
              </span>
            )}
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              {error}
            </div>
          )}

          {/* Account Name */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Hesap Adı <span className="text-rose-500">*</span>
              </label>
              {/* Quick Format Tools */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleToTitleCase}
                  className="px-2 py-0.5 text-[11px] font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded border border-slate-300 transition-colors"
                  title="İlk harfleri büyük yap (Örn: Aslanlar Ayakkabı)"
                >
                  Aa Baş Harfler
                </button>
                <button
                  type="button"
                  onClick={handleToUpperCase}
                  className="px-2 py-0.5 text-[11px] font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded border border-slate-300 transition-colors"
                  title="Tümünü büyük harf yap (Örn: ASLANLAR AYAKKABI)"
                >
                  AA BÜYÜK
                </button>
                <button
                  type="button"
                  onClick={handleCleanWhitespace}
                  className="px-2 py-0.5 text-[11px] font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded border border-slate-300 transition-colors"
                  title="Fazla boşlukları temizle"
                >
                  Boşlukları Düzelt
                </button>
              </div>
            </div>
            <input
              type="text"
              required
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Örn: Aslanlar Ayakkabı Sanayi Ltd. Şti."
              className="w-full text-sm font-medium border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-slate-900"
            />
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Bu hesap adı mizan, muavin, defter-i kebir ve mali tablolarda görüntülenecektir.
            </p>
          </div>

          {/* Description */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">Açıklama / Not (İsteğe Bağlı)</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Örn: Müşteri Cari Kartı Hesabı"
              className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-slate-900"
            />
          </div>

          {/* Currency */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">Para Birimi</label>
            <select
              value={currency}
              onChange={e => setCurrency(e.target.value)}
              className="w-full text-xs font-mono font-semibold border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-slate-900"
            >
              <option value="TRY">TRY - Türk Lirası</option>
              <option value="USD">USD - Amerikan Doları</option>
              <option value="EUR">EUR - Euro</option>
              <option value="GBP">GBP - İngiliz Sterlini</option>
            </select>
          </div>

          {/* Sync Journal Entries Checkbox */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={syncJournalEntries}
                onChange={e => setSyncJournalEntries(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
              />
              <div className="text-xs text-slate-700 dark:text-slate-200">
                <span className="font-semibold text-slate-800 dark:text-slate-200">Geçmiş yevmiye fişlerindeki hesap adını da güncelle</span>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Daha önce işlenmiş yevmiye fişlerindeki ve kebir raporlarındaki eski hesap adını otomatik olarak bu yeni adla günceller.
                </p>
              </div>
            </label>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2.5">
            {onDeleteAccount ? (
              <button
                type="button"
                onClick={() => {
                  if (account) {
                    onDeleteAccount(account);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-rose-700 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-300 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 border border-rose-200 dark:border-rose-800 rounded-lg transition-colors cursor-pointer"
                title="Bu hesabı sil"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Hesabı Sil</span>
              </button>
            ) : <div />}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                Vazgeç
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-lg shadow-sm transition-colors disabled:opacity-50 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                {saving ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
