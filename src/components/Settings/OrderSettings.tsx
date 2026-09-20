import React, { useState } from 'react';
import { ShoppingCart, Truck, Receipt, Save, Check, ShieldCheck, Percent, Clock } from 'lucide-react';
import type { AppSettings } from '../../types';

interface OrderSettingsProps {
  settings: AppSettings;
  onSave: (newSettings: AppSettings) => Promise<void>;
}

export default function OrderSettings({ settings, onSave }: OrderSettingsProps) {
  const [salesPrefix, setSalesPrefix] = useState(settings.order?.salesOrderPrefix || 'SIP-2026-');
  const [purchasePrefix, setPurchasePrefix] = useState(settings.order?.purchaseOrderPrefix || 'SAT-2026-');
  const [waybillSalesPrefix, setWaybillSalesPrefix] = useState(settings.order?.waybillSalesPrefix || 'IRS-2026-');
  const [waybillPurchasePrefix, setWaybillPurchasePrefix] = useState(settings.order?.waybillPurchasePrefix || 'GIR-2026-');
  const [invoiceSalesPrefix, setInvoiceSalesPrefix] = useState(settings.order?.invoiceSalesPrefix || 'EFT-2026-');
  const [invoicePurchasePrefix, setInvoicePurchasePrefix] = useState(settings.order?.invoicePurchasePrefix || 'ALS-2026-');
  
  const [defaultVat, setDefaultVat] = useState(settings.order?.defaultVatRate || 20);
  const [defaultCurrency, setDefaultCurrency] = useState(settings.order?.defaultCurrency || 'TRY');
  const [defaultTermDays, setDefaultTermDays] = useState(settings.order?.defaultPaymentTermDays || 30);
  const [autoWorkOrders, setAutoWorkOrders] = useState(settings.order?.autoCreateWorkOrdersOnConfirm ?? true);
  const [autoDeductWaybill, setAutoDeductWaybill] = useState(settings.order?.autoDeductStockOnWaybill ?? true);

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const updated: AppSettings = {
        ...settings,
        order: {
          ...settings.order,
          salesOrderPrefix: salesPrefix,
          purchaseOrderPrefix: purchasePrefix,
          waybillSalesPrefix,
          waybillPurchasePrefix,
          invoiceSalesPrefix,
          invoicePurchasePrefix,
          defaultVatRate: Number(defaultVat),
          defaultCurrency,
          defaultPaymentTermDays: Number(defaultTermDays),
          autoCreateWorkOrdersOnConfirm: autoWorkOrders,
          autoDeductStockOnWaybill: autoDeductWaybill
        }
      };
      await onSave(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Ayarlar kaydedilemedi:', err);
      alert('Sipariş ve sevkiyat ayarları kaydedilirken hata oluştu.');
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
            <span className="text-xs font-bold uppercase tracking-wider">Sipariş, İrsaliye ve Fatura ayarları başarıyla kaydedildi.</span>
          </div>
        </div>
      )}

      {/* SECTION 1: EVRAK & NUMARA SERİLERİ */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-md">
              <ShoppingCart className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold uppercase tracking-wider">Sipariş & Sevkiyat Evrak Numaratörleri</h3>
              <p className="text-slate-400 text-xs font-medium">Satış, satın alma, irsaliye ve fatura serisi önek kuralları</p>
            </div>
          </div>
        </div>

        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Satış Siparişi Öneki</label>
            <input
              type="text"
              value={salesPrefix}
              onChange={e => setSalesPrefix(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
            <span className="text-[10px] text-slate-400">Örnek: {salesPrefix}000142</span>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Satın Alma Siparişi Öneki</label>
            <input
              type="text"
              value={purchasePrefix}
              onChange={e => setPurchasePrefix(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
            <span className="text-[10px] text-slate-400">Örnek: {purchasePrefix}000085</span>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Satış İrsaliye Öneki</label>
            <input
              type="text"
              value={waybillSalesPrefix}
              onChange={e => setWaybillSalesPrefix(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
            <span className="text-[10px] text-slate-400">Örnek: {waybillSalesPrefix}000210</span>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Alış İrsaliye Öneki</label>
            <input
              type="text"
              value={waybillPurchasePrefix}
              onChange={e => setWaybillPurchasePrefix(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
            <span className="text-[10px] text-slate-400">Örnek: {waybillPurchasePrefix}000094</span>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">E-Fatura / Satış Faturası Öneki</label>
            <input
              type="text"
              value={invoiceSalesPrefix}
              onChange={e => setInvoiceSalesPrefix(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
            <span className="text-[10px] text-slate-400">Örnek: {invoiceSalesPrefix}000512</span>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Alış / Gider Faturası Öneki</label>
            <input
              type="text"
              value={invoicePurchasePrefix}
              onChange={e => setInvoicePurchasePrefix(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
            <span className="text-[10px] text-slate-400">Örnek: {invoicePurchasePrefix}000189</span>
          </div>
        </div>
      </div>

      {/* SECTION 2: TİCARİ VE FİNANSAL VARSAYILANLAR */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-600 rounded-xl flex items-center justify-center text-white shadow-md">
              <Percent className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold uppercase tracking-wider">Ticari Varsayılanlar & KDV</h3>
              <p className="text-slate-400 text-xs font-medium">Varsayılan vergi oranları, para birimi ve vade opsiyonları</p>
            </div>
          </div>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Varsayılan KDV Oranı (%)</label>
            <select
              value={defaultVat}
              onChange={e => setDefaultVat(Number(e.target.value))}
              className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            >
              <option value="1">%1 (İstisnai / Temel Gıda vb.)</option>
              <option value="10">%10 (Tekstil / Konfeksiyon / Ayakkabı İndirimli)</option>
              <option value="20">%20 (Genel Standart KDV Oranı)</option>
              <option value="0">%0 (İhracat / KDV Muaf)</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Varsayılan Para Birimi</label>
            <select
              value={defaultCurrency}
              onChange={e => setDefaultCurrency(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            >
              <option value="TRY">Türk Lirası (₺ - TRY)</option>
              <option value="USD">Amerikan Doları ($ - USD)</option>
              <option value="EUR">Euro (€ - EUR)</option>
              <option value="GBP">İngiliz Sterlini (£ - GBP)</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Standart Ödeme Vadesi (Gün)</label>
            <input
              type="number"
              min="0"
              value={defaultTermDays}
              onChange={e => setDefaultTermDays(Number(e.target.value))}
              className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>
        </div>

        {/* Automation Toggles */}
        <div className="p-6 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700 space-y-4">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoWorkOrders}
              onChange={e => setAutoWorkOrders(e.target.checked)}
              className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300"
            />
            <div>
              <span className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider block">Sipariş Onayında Otomatik İş Emri Oluştur</span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Müşteri siparişi onaylandığında üretilecek mamuller için otomatik üretim iş emirleri açılır.</span>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoDeductWaybill}
              onChange={e => setAutoDeductWaybill(e.target.checked)}
              className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300"
            />
            <div>
              <span className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider block">İrsaliye Kesildiğinde Stokları Anında Düş</span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Satış sevk irsaliyesi düzenlendiğinde ilgili mamul/varyant stokları depodan otomatik düşürülür.</span>
            </div>
          </label>
        </div>

        <div className="p-6 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 flex justify-end">
          <button
            type="submit"
            disabled={isSaving}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-sm flex items-center gap-2 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Kaydediliyor...' : 'Sipariş & Sevkiyat Ayarlarını Kaydet'}
          </button>
        </div>
      </div>
    </form>
  );
}
