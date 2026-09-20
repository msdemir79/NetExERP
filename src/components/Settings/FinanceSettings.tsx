import React, { useState } from 'react';
import { Landmark, BookOpen, Save, Check, ShieldCheck, BellRing } from 'lucide-react';
import type { AppSettings } from '../../types';

interface FinanceSettingsProps {
  settings: AppSettings;
  onSave: (newSettings: AppSettings) => Promise<void>;
}

export default function FinanceSettings({ settings, onSave }: FinanceSettingsProps) {
  const [currency, setCurrency] = useState(settings.finance?.defaultCurrency || 'TRY');
  const [alertDays, setAlertDays] = useState(settings.finance?.checkAlertDaysBeforeDue || 7);
  const [custCode, setCustCode] = useState(settings.finance?.defaultCustomerAccountCode || '120.01');
  const [suppCode, setSuppCode] = useState(settings.finance?.defaultSupplierAccountCode || '320.01');
  const [finishedStockCode, setFinishedStockCode] = useState(settings.finance?.defaultFinishedStockAccountCode || '157.01');
  const [rawStockCode, setRawStockCode] = useState(settings.finance?.defaultRawMaterialAccountCode || '150.01');
  const [salesRevenueCode, setSalesRevenueCode] = useState(settings.finance?.defaultSalesRevenueAccountCode || '600.01');
  const [vatCalcCode, setVatCalcCode] = useState(settings.finance?.defaultVatCalculatedAccountCode || '391.01');
  const [vatDedCode, setVatDedCode] = useState(settings.finance?.defaultVatDeductibleAccountCode || '191.01');

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const updated: AppSettings = {
        ...settings,
        finance: {
          ...settings.finance,
          defaultCurrency: currency,
          checkAlertDaysBeforeDue: Number(alertDays),
          defaultCustomerAccountCode: custCode,
          defaultSupplierAccountCode: suppCode,
          defaultFinishedStockAccountCode: finishedStockCode,
          defaultRawMaterialAccountCode: rawStockCode,
          defaultSalesRevenueAccountCode: salesRevenueCode,
          defaultVatCalculatedAccountCode: vatCalcCode,
          defaultVatDeductibleAccountCode: vatDedCode
        }
      };
      await onSave(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Finans ayarları kaydedilemedi:', err);
      alert('Finans ayarları kaydedilirken hata oluştu.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {saveSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <Check className="w-5 h-5 text-emerald-600" />
            <span className="text-xs font-bold uppercase tracking-wider">Finans ve Muhasebe modülü ayarları başarıyla kaydedildi.</span>
          </div>
        </div>
      )}

      {/* SECTION 1: FİNANSAL ALARMLAR VE PARA BİRİMİ */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white shadow-md">
              <Landmark className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold uppercase tracking-wider">Finans & Tahsilat Parametreleri</h3>
              <p className="text-slate-400 text-xs font-medium">Kasa/banka varsayılanları ve çek/senet risk hatırlatıcıları</p>
            </div>
          </div>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Temel Para Birimi</label>
            <select
              value={currency}
              onChange={e => setCurrency(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            >
              <option value="TRY">Türk Lirası (₺ - TRY)</option>
              <option value="USD">Amerikan Doları ($ - USD)</option>
              <option value="EUR">Euro (€ - EUR)</option>
              <option value="GBP">İngiliz Sterlini (£ - GBP)</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Çek / Senet Vade Alarm Eşiği (Gün Önce)</label>
            <input
              type="number"
              min="1"
              max="60"
              value={alertDays}
              onChange={e => setAlertDays(Number(e.target.value))}
              className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
            <span className="text-[10px] text-slate-400">Vadesine bu kadar gün kalan portföydeki çekler sarı/kırmızı uyarı listesine alınır.</span>
          </div>
        </div>
      </div>

      {/* SECTION 2: TDHP MUHASEBE HESAP KODU EŞLEŞTİRMELERİ */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-md">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold uppercase tracking-wider">Tek Düzen Hesap Planı (TDHP) Entegrasyonu</h3>
              <p className="text-slate-400 text-xs font-medium">Otomatik yevmiye fişi üretiminde kullanılan standart hesap kökleri</p>
            </div>
          </div>
        </div>

        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Müşteri Cari Hesabı (Alıcılar)</label>
            <input
              type="text"
              value={custCode}
              onChange={e => setCustCode(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
            <span className="text-[10px] text-slate-400">Standart TDHP 120 Grubu</span>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Tedarikçi Cari Hesabı (Satıcılar)</label>
            <input
              type="text"
              value={suppCode}
              onChange={e => setSuppCode(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
            <span className="text-[10px] text-slate-400">Standart TDHP 320 Grubu</span>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Mamul Stok Hesabı</label>
            <input
              type="text"
              value={finishedStockCode}
              onChange={e => setFinishedStockCode(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
            <span className="text-[10px] text-slate-400">Standart TDHP 157 veya 152 Grubu</span>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Hammadde Stok Hesabı</label>
            <input
              type="text"
              value={rawStockCode}
              onChange={e => setRawStockCode(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
            <span className="text-[10px] text-slate-400">Standart TDHP 150 İlk Madde ve Malzeme</span>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Satış Gelirleri Hesabı</label>
            <input
              type="text"
              value={salesRevenueCode}
              onChange={e => setSalesRevenueCode(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
            <span className="text-[10px] text-slate-400">Standart TDHP 600 Yurtiçi Satışlar</span>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Hesaplanan KDV (Satış)</label>
            <input
              type="text"
              value={vatCalcCode}
              onChange={e => setVatCalcCode(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
            <span className="text-[10px] text-slate-400">Standart TDHP 391 Grubu</span>
          </div>
        </div>

        <div className="p-6 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 flex justify-end">
          <button
            type="submit"
            disabled={isSaving}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-sm flex items-center gap-2 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Kaydediliyor...' : 'Finans & Muhasebe Ayarlarını Kaydet'}
          </button>
        </div>
      </div>
    </form>
  );
}
