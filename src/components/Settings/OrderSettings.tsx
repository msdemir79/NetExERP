import React, { useState } from 'react';
import { ShoppingCart, Save, Check, Percent } from 'lucide-react';
import { showToast } from '../../lib/feedback';
import SettingsSection from './SettingsSection';
import { Field, Input, Select } from '../Common/Field';
import Button from '../Common/Button';
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
      showToast('Sipariş ve sevkiyat ayarları kaydedilirken hata oluştu.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {saveSuccess && (
        <div className="flex items-center gap-2 rounded-card border border-success/30 bg-success-soft px-3.5 py-2.5 text-xs font-bold text-success">
          <Check className="h-4 w-4" />
          Sipariş, İrsaliye ve Fatura ayarları başarıyla kaydedildi.
        </div>
      )}

      <SettingsSection
        title="Sipariş & Sevkiyat Evrak Numaratörleri"
        description="Satış, satın alma, irsaliye ve fatura serisi önek kuralları"
        icon={<ShoppingCart />}
        keywords="satış sipariş önek satın alma irsaliye fatura seri numara"
      >
        <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Satış Siparişi Öneki" hint={`Örnek: ${salesPrefix}000142`}>
            <Input type="text" value={salesPrefix} onChange={(e) => setSalesPrefix(e.target.value)} />
          </Field>
          <Field label="Satın Alma Siparişi Öneki" hint={`Örnek: ${purchasePrefix}000085`}>
            <Input type="text" value={purchasePrefix} onChange={(e) => setPurchasePrefix(e.target.value)} />
          </Field>
          <Field label="Satış İrsaliye Öneki" hint={`Örnek: ${waybillSalesPrefix}000210`}>
            <Input type="text" value={waybillSalesPrefix} onChange={(e) => setWaybillSalesPrefix(e.target.value)} />
          </Field>
          <Field label="Alış İrsaliye Öneki" hint={`Örnek: ${waybillPurchasePrefix}000094`}>
            <Input type="text" value={waybillPurchasePrefix} onChange={(e) => setWaybillPurchasePrefix(e.target.value)} />
          </Field>
          <Field label="E-Fatura / Satış Faturası Öneki" hint={`Örnek: ${invoiceSalesPrefix}000512`}>
            <Input type="text" value={invoiceSalesPrefix} onChange={(e) => setInvoiceSalesPrefix(e.target.value)} />
          </Field>
          <Field label="Alış / Gider Faturası Öneki" hint={`Örnek: ${invoicePurchasePrefix}000189`}>
            <Input type="text" value={invoicePurchasePrefix} onChange={(e) => setInvoicePurchasePrefix(e.target.value)} />
          </Field>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Ticari Varsayılanlar & KDV"
        description="Varsayılan vergi oranları, para birimi, vade ve otomasyon kuralları"
        icon={<Percent />}
        keywords="kdv vergi oranı para birimi vade ödeme iş emri otomatik stok düş"
      >
        <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-3">
          <Field label="Varsayılan KDV Oranı (%)">
            <Select value={defaultVat} onChange={(e) => setDefaultVat(Number(e.target.value))}>
              <option value="1">%1 (İstisnai / Temel Gıda vb.)</option>
              <option value="10">%10 (Tekstil / Konfeksiyon / Ayakkabı İndirimli)</option>
              <option value="20">%20 (Genel Standart KDV Oranı)</option>
              <option value="0">%0 (İhracat / KDV Muaf)</option>
            </Select>
          </Field>
          <Field label="Varsayılan Para Birimi">
            <Select value={defaultCurrency} onChange={(e) => setDefaultCurrency(e.target.value)}>
              <option value="TRY">Türk Lirası (₺ - TRY)</option>
              <option value="USD">Amerikan Doları ($ - USD)</option>
              <option value="EUR">Euro (€ - EUR)</option>
              <option value="GBP">İngiliz Sterlini (£ - GBP)</option>
            </Select>
          </Field>
          <Field label="Standart Ödeme Vadesi (Gün)">
            <Input type="number" min="0" value={defaultTermDays} onChange={(e) => setDefaultTermDays(Number(e.target.value))} />
          </Field>
        </div>

        <div className="space-y-3 border-t border-line bg-surface-hover/40 p-4">
          <label className="flex cursor-pointer select-none items-start gap-3">
            <input
              type="checkbox"
              checked={autoWorkOrders}
              onChange={(e) => setAutoWorkOrders(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded accent-[var(--brand)]"
            />
            <span>
              <span className="block text-xs font-black uppercase tracking-wider text-fg-strong">Sipariş Onayında Otomatik İş Emri Oluştur</span>
              <span className="block text-2xs font-semibold text-fg-muted">Müşteri siparişi onaylandığında üretilecek mamuller için otomatik üretim iş emirleri açılır.</span>
            </span>
          </label>
          <label className="flex cursor-pointer select-none items-start gap-3">
            <input
              type="checkbox"
              checked={autoDeductWaybill}
              onChange={(e) => setAutoDeductWaybill(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded accent-[var(--brand)]"
            />
            <span>
              <span className="block text-xs font-black uppercase tracking-wider text-fg-strong">İrsaliye Kesildiğinde Stokları Anında Düş</span>
              <span className="block text-2xs font-semibold text-fg-muted">Satış sevk irsaliyesi düzenlendiğinde ilgili mamul/varyant stokları depodan otomatik düşürülür.</span>
            </span>
          </label>
        </div>

      </SettingsSection>
        <div className="flex justify-end rounded-card border border-line bg-surface p-4 shadow-card">
          <Button type="submit" variant="primary" icon={<Save className="h-4 w-4" />} loading={isSaving}>
            Sipariş &amp; Sevkiyat Ayarlarını Kaydet
          </Button>
        </div>
    </form>
  );
}
