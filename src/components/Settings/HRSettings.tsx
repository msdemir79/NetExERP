import React, { useState } from 'react';
import { Clock, Calendar, Calculator, Shield, Save, Check } from 'lucide-react';
import { showToast } from '../../lib/feedback';
import SettingsSection from './SettingsSection';
import { Field, Input } from '../Common/Field';
import Button from '../Common/Button';
import { cn } from '../../lib/utils';
import type { AppSettings } from '../../types';
import { HR_CONSTANTS_2026 } from '../../lib/payrollCalculator';

// JS Date.getDay() indeksine göre sıralı gün listesi (0 = Pazar)
const WEEK_DAYS: { index: number; label: string }[] = [
  { index: 1, label: 'Pazartesi' },
  { index: 2, label: 'Salı' },
  { index: 3, label: 'Çarşamba' },
  { index: 4, label: 'Perşembe' },
  { index: 5, label: 'Cuma' },
  { index: 6, label: 'Cumartesi' },
  { index: 0, label: 'Pazar' }
];

interface NumberFieldProps {
  label: string;
  hint?: string;
  value: number;
  onChange: (value: number) => void;
  step?: string;
  min?: number;
  max?: number;
}

function NumberField({ label, hint, value, onChange, step, min, max }: NumberFieldProps) {
  return (
    <Field label={label} hint={hint}>
      <Input
        type="number"
        step={step}
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </Field>
  );
}

interface HRSettingsProps {
  settings: AppSettings;
  onSave: (newSettings: AppSettings) => Promise<void>;
}

export default function HRSettings({ settings, onSave }: HRSettingsProps) {
  const [weeklyHours, setWeeklyHours] = useState(settings.hr?.weeklyWorkHours ?? 45);
  const [dailyHours, setDailyHours] = useState(settings.hr?.dailyWorkHours ?? 8);
  const [weekendDays, setWeekendDays] = useState<number[]>(settings.hr?.weekendDays ?? [0]);
  const [overtimeWeekday, setOvertimeWeekday] = useState(settings.hr?.overtimeWeekdayMultiplier ?? 1.5);
  const [overtimeWeekend, setOvertimeWeekend] = useState(settings.hr?.overtimeWeekendMultiplier ?? 2.0);
  const [annualLeaveDays, setAnnualLeaveDays] = useState(settings.hr?.annualLeaveBaseDays ?? 14);

  const [incomeTaxRate, setIncomeTaxRate] = useState(settings.hr?.incomeTaxRate ?? 15);
  const [stampTaxPerMille, setStampTaxPerMille] = useState(settings.hr?.stampTaxPerMille ?? 7.59);
  const [minWageGross, setMinWageGross] = useState(settings.hr?.minWageGross ?? 33030);
  const [minWageNet, setMinWageNet] = useState(settings.hr?.minWageNet ?? 28075.50);
  const [minWageIncomeTaxExemption, setMinWageIncomeTaxExemption] = useState(settings.hr?.minWageIncomeTaxExemption ?? 4211.33);
  const [minWageStampTaxExemption, setMinWageStampTaxExemption] = useState(settings.hr?.minWageStampTaxExemption ?? 250.70);
  const [sgkMonthlyHours, setSgkMonthlyHours] = useState(settings.hr?.sgkMonthlyHours ?? 225);
  const [nonSgkMonthlyHours, setNonSgkMonthlyHours] = useState(settings.hr?.nonSgkMonthlyHours ?? 240);

  const [sgkEmployee, setSgkEmployee] = useState(settings.hr?.sgkEmployeeRate ?? 14);
  const [unempEmployee, setUnempEmployee] = useState(settings.hr?.unemploymentEmployeeRate ?? 1);
  const [sgkEmployer, setSgkEmployer] = useState(settings.hr?.sgkEmployerRate ?? 16.75);
  const [unempEmployer, setUnempEmployer] = useState(settings.hr?.unemploymentEmployerRate ?? 2);

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const toggleWeekendDay = (day: number) => {
    setWeekendDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort((a, b) => a - b)
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const updated: AppSettings = {
        ...settings,
        hr: {
          ...settings.hr,
          weeklyWorkHours: Number(weeklyHours),
          dailyWorkHours: Number(dailyHours),
          weekendDays,
          overtimeWeekdayMultiplier: Number(overtimeWeekday),
          overtimeWeekendMultiplier: Number(overtimeWeekend),
          annualLeaveBaseDays: Number(annualLeaveDays),
          incomeTaxRate: Number(incomeTaxRate),
          stampTaxPerMille: Number(stampTaxPerMille),
          minWageGross: Number(minWageGross),
          minWageNet: Number(minWageNet),
          minWageIncomeTaxExemption: Number(minWageIncomeTaxExemption),
          minWageStampTaxExemption: Number(minWageStampTaxExemption),
          sgkMonthlyHours: Number(sgkMonthlyHours),
          nonSgkMonthlyHours: Number(nonSgkMonthlyHours),
          sgkEmployeeRate: Number(sgkEmployee),
          unemploymentEmployeeRate: Number(unempEmployee),
          sgkEmployerRate: Number(sgkEmployer),
          unemploymentEmployerRate: Number(unempEmployer)
        }
      };
      await onSave(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('İK ayarları kaydedilemedi:', err);
      showToast('İK ayarları kaydedilirken hata oluştu.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-brand-soft p-4 text-xs text-fg">
        <p>2026 ücret/vergi tarifesi ve 297.270 TL SGK tavanı kullanılır. Vergi istisnası aya göre hesaplanır. Mevcut kayıtlar değiştirilmez.</p>
        <Button onClick={() => { setMinWageGross(HR_CONSTANTS_2026.MIN_WAGE_GROSS_TL); setMinWageNet(HR_CONSTANTS_2026.MIN_WAGE_NET_TL); setMinWageIncomeTaxExemption(HR_CONSTANTS_2026.MIN_WAGE_INCOME_TAX_EXEMPTION_TL); setMinWageStampTaxExemption(HR_CONSTANTS_2026.MIN_WAGE_STAMP_TAX_EXEMPTION_TL); setSgkEmployer(16.75); setSgkEmployee(14); setUnempEmployee(1); setUnempEmployer(2); }}>2026 imalat tarifesini uygula</Button>
      </div>
      {saveSuccess && (
        <div className="flex items-center gap-2 rounded-card border border-success/30 bg-success-soft px-3.5 py-2.5 text-xs font-bold text-success">
          <Check className="h-4 w-4" />
          İnsan Kaynakları &amp; Bordro parametreleri başarıyla kaydedildi.
        </div>
      )}

      <SettingsSection
        title="Çalışma Süreleri & Fazla Mesai"
        description="4857 sayılı İş Kanunu standartları ve mesai çarpanları"
        icon={<Clock />}
        keywords="haftalık günlük saat mesai çarpanı fazla çalışma izin"
      >
        <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <NumberField label="Haftalık Yasal Çalışma (Saat)" hint="Yasal standart 45 saat" value={weeklyHours} onChange={setWeeklyHours} min={1} max={60} />
          <NumberField label="Günlük Normal Mesai (Saat)" hint="Genel vardiya 8 saat" value={dailyHours} onChange={setDailyHours} min={1} max={12} />
          <NumberField label="Hafta İçi Mesai Çarpanı (x)" hint="Standart %50 zamlı (1.5x)" value={overtimeWeekday} onChange={setOvertimeWeekday} step="0.1" min={1} max={3} />
          <NumberField label="Hafta Tatili Mesai Çarpanı (x)" hint="Hafta tatili ve resmi tatillerde %100 zamlı (2.0x)" value={overtimeWeekend} onChange={setOvertimeWeekend} step="0.1" min={1} max={4} />
          <NumberField label="Yıllık İzin Taban Günü" hint="Kıdemsiz personel için yasal taban (14 gün)" value={annualLeaveDays} onChange={setAnnualLeaveDays} min={1} max={60} />
        </div>
      </SettingsSection>

      <SettingsSection
        title="Hafta Tatili Günleri"
        description="İşletmenizin çalışma takvimine göre tatil günlerini seçin"
        icon={<Calendar />}
        count={`${weekendDays.length} Gün`}
        keywords="hafta tatili gün puantaj çalışma takvimi pazar cumartesi"
      >
        <div className="space-y-3 p-4">
          <p className="text-2xs font-semibold leading-relaxed text-fg-muted">
            Seçilen günler puantajda <b className="text-fg-strong">Hafta Tatili (H)</b> olarak değerlendirilir: otomatik puantaj doldurma,
            toplu durum atama ve bordro hesaplamasında (kayıt girilmemiş günler için) bu günler tatil sayılır.
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {WEEK_DAYS.map((day) => {
              const selected = weekendDays.includes(day.index);
              return (
                <button
                  key={day.index}
                  type="button"
                  onClick={() => toggleWeekendDay(day.index)}
                  aria-pressed={selected}
                  className={cn(
                    'cursor-pointer rounded-control border px-3 py-2 text-xs font-bold transition-colors',
                    selected
                      ? 'border-brand bg-brand-soft text-brand'
                      : 'border-line bg-surface text-fg-muted hover:bg-surface-hover hover:text-fg-strong',
                  )}
                >
                  {day.label}
                </button>
              );
            })}
          </div>
          {weekendDays.length === 0 ? (
            <p className="text-2xs font-bold text-warning">
              Hiçbir gün seçilmedi: puantajda hafta tatili günü olmayacak, tüm günler çalışma günü sayılacak.
            </p>
          ) : (
            <p className="text-2xs font-semibold text-fg-muted">
              Hafta tatili: <b className="text-fg-strong">{WEEK_DAYS.filter((d) => weekendDays.includes(d.index)).map((d) => d.label).join(', ')}</b>
            </p>
          )}
        </div>
      </SettingsSection>

      <SettingsSection
        title="Asgari Ücret & Vergi Parametreleri"
        description="Netten brüte dönüşüm, vergi istisnaları ve saatlik ücret bölenleri"
        icon={<Calculator />}
        keywords="asgari ücret brüt net gelir vergisi damga istisna sgk saat bölen"
      >
        <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <NumberField label="Asgari Ücret Brüt (₺)" hint="Yıllık güncellenen brüt asgari ücret" value={minWageGross} onChange={setMinWageGross} step="0.01" />
          <NumberField label="Asgari Ücret Net (₺)" hint="Netten brüte dönüşümde referans taban" value={minWageNet} onChange={setMinWageNet} step="0.01" />
          <NumberField label="Gelir Vergisi İstisnası (₺)" hint="Asgari ücret için aylık istisna tutarı" value={minWageIncomeTaxExemption} onChange={setMinWageIncomeTaxExemption} step="0.01" />
          <NumberField label="Damga Vergisi İstisnası (₺)" hint="Asgari ücret için aylık istisna tutarı" value={minWageStampTaxExemption} onChange={setMinWageStampTaxExemption} step="0.01" />
          <NumberField label="Gelir Vergisi Oranı (%)" hint="1. vergi dilimi oranı (yasal %15)" value={incomeTaxRate} onChange={setIncomeTaxRate} step="0.01" min={0} max={40} />
          <NumberField label="Damga Vergisi Oranı (Binde)" hint="Yasal binde 7,59" value={stampTaxPerMille} onChange={setStampTaxPerMille} step="0.01" min={0} />
          <NumberField label="SGK'lı Aylık Saat (Bölen)" hint="Aylık brüt / saatlik brüt ve mesai için (yasal 225)" value={sgkMonthlyHours} onChange={setSgkMonthlyHours} min={1} />
          <NumberField label="SGK'sız Aylık Saat (Bölen)" hint="Harici/yevmiyeli saatlik ücret böleni (30 x 8 = 240)" value={nonSgkMonthlyHours} onChange={setNonSgkMonthlyHours} min={1} />
        </div>
      </SettingsSection>

      <SettingsSection
        title="SGK & Yasal Kesinti Oranları"
        description="Bordro hesaplamasında kullanılan işçi ve işveren payları"
        icon={<Shield />}
        keywords="sgk işçi işveren prim işsizlik kesinti oran bordro"
      >
        <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <NumberField label="SGK İşçi Primi (%)" hint="Yasal oran %14" value={sgkEmployee} onChange={setSgkEmployee} step="0.1" />
          <NumberField label="İşsizlik Sigortası İşçi (%)" hint="Yasal oran %1" value={unempEmployee} onChange={setUnempEmployee} step="0.1" />
          <NumberField label="SGK İşveren Primi (%)" hint="Hazine teşvikli %15,5 / normal %20,5" value={sgkEmployer} onChange={setSgkEmployer} step="0.1" />
          <NumberField label="İşsizlik Sigortası İşveren (%)" hint="Yasal oran %2" value={unempEmployer} onChange={setUnempEmployer} step="0.1" />
        </div>

      </SettingsSection>
        <div className="flex justify-end rounded-card border border-line bg-surface p-4 shadow-card">
          <Button type="submit" variant="primary" icon={<Save className="h-4 w-4" />} loading={isSaving}>
            İK Parametrelerini Kaydet
          </Button>
        </div>
    </form>
  );
}
