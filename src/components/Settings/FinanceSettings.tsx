import React, { useState } from 'react';
import { Landmark, BookOpen, Save, Check } from 'lucide-react';
import { showToast } from '../../lib/feedback';
import SettingsSection from './SettingsSection';
import { Field, Input, Select } from '../Common/Field';
import Button from '../Common/Button';
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
      showToast('Finans ayarları kaydedilirken hata oluştu.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {saveSuccess && (
        <div className="flex items-center gap-2 rounded-card border border-success/30 bg-success-soft px-3.5 py-2.5 text-xs font-bold text-success">
          <Check className="h-4 w-4" />
          Finans ve Muhasebe modülü ayarları başarıyla kaydedildi.
        </div>
      )}

      <SettingsSection
        title="Finans & Tahsilat Parametreleri"
        description="Kasa/banka varsayılanları ve çek/senet risk hatırlatıcıları"
        icon={<Landmark />}
        keywords="para birimi çek senet vade alarm gün kasa banka"
      >
        <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2">
          <Field label="Temel Para Birimi">
            <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="TRY">Türk Lirası (₺ - TRY)</option>
              <option value="USD">Amerikan Doları ($ - USD)</option>
              <option value="EUR">Euro (€ - EUR)</option>
              <option value="GBP">İngiliz Sterlini (£ - GBP)</option>
            </Select>
          </Field>
          <Field label="Çek / Senet Vade Alarm Eşiği (Gün Önce)" hint="Vadesine bu kadar gün kalan portföydeki çekler sarı/kırmızı uyarı listesine alınır.">
            <Input type="number" min="1" max="60" value={alertDays} onChange={(e) => setAlertDays(Number(e.target.value))} />
          </Field>
        </div>
      </SettingsSection>

      <SettingsSection
        title="TDHP Hesap Kodu Eşleştirmeleri"
        description="Otomatik yevmiye fişi üretiminde kullanılan Tek Düzen Hesap Planı kökleri"
        icon={<BookOpen />}
        count="7 Hesap"
        keywords="tdhp hesap planı müşteri tedarikçi mamul hammadde satış gelir hesaplanan kdv indirilecek kdv"
      >
        <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Müşteri Cari Hesabı (Alıcılar)" hint="Standart TDHP 120 Grubu">
            <Input type="text" className="font-mono" value={custCode} onChange={(e) => setCustCode(e.target.value)} />
          </Field>
          <Field label="Tedarikçi Cari Hesabı (Satıcılar)" hint="Standart TDHP 320 Grubu">
            <Input type="text" className="font-mono" value={suppCode} onChange={(e) => setSuppCode(e.target.value)} />
          </Field>
          <Field label="Mamul Stok Hesabı" hint="Standart TDHP 157 veya 152 Grubu">
            <Input type="text" className="font-mono" value={finishedStockCode} onChange={(e) => setFinishedStockCode(e.target.value)} />
          </Field>
          <Field label="Hammadde Stok Hesabı" hint="Standart TDHP 150 İlk Madde ve Malzeme">
            <Input type="text" className="font-mono" value={rawStockCode} onChange={(e) => setRawStockCode(e.target.value)} />
          </Field>
          <Field label="Satış Gelirleri Hesabı" hint="Standart TDHP 600 Yurtiçi Satışlar">
            <Input type="text" className="font-mono" value={salesRevenueCode} onChange={(e) => setSalesRevenueCode(e.target.value)} />
          </Field>
          <Field label="Hesaplanan KDV (Satış)" hint="Standart TDHP 391 Grubu">
            <Input type="text" className="font-mono" value={vatCalcCode} onChange={(e) => setVatCalcCode(e.target.value)} />
          </Field>
          <Field label="İndirilecek KDV (Alış)" hint="Standart TDHP 191 Grubu">
            <Input type="text" className="font-mono" value={vatDedCode} onChange={(e) => setVatDedCode(e.target.value)} />
          </Field>
        </div>

      </SettingsSection>
        <div className="flex justify-end rounded-card border border-line bg-surface p-4 shadow-card">
          <Button type="submit" variant="primary" icon={<Save className="h-4 w-4" />} loading={isSaving}>
            Finans &amp; Muhasebe Ayarlarını Kaydet
          </Button>
        </div>
    </form>
  );
}
