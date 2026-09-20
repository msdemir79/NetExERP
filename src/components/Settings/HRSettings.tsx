import React, { useState } from 'react';
import { Clock, Calendar, Calculator, Shield, Save, Check } from 'lucide-react';
import type { AppSettings } from '../../types';

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
    <div className="space-y-1.5">
      <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 tracking-widest">{label}</label>
      <input
        type="number"
        step={step}
        min={min}
        max={max}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
      />
      {hint && <span className="text-[10px] text-slate-400">{hint}</span>}
    </div>
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
  const [minWageGross, setMinWageGross] = useState(settings.hr?.minWageGross ?? 26005);
  const [minWageNet, setMinWageNet] = useState(settings.hr?.minWageNet ?? 22104);
  const [minWageIncomeTaxExemption, setMinWageIncomeTaxExemption] = useState(settings.hr?.minWageIncomeTaxExemption ?? 3315.64);
  const [minWageStampTaxExemption, setMinWageStampTaxExemption] = useState(settings.hr?.minWageStampTaxExemption ?? 197.38);
  const [sgkMonthlyHours, setSgkMonthlyHours] = useState(settings.hr?.sgkMonthlyHours ?? 225);
  const [nonSgkMonthlyHours, setNonSgkMonthlyHours] = useState(settings.hr?.nonSgkMonthlyHours ?? 240);

  const [sgkEmployee, setSgkEmployee] = useState(settings.hr?.sgkEmployeeRate ?? 14);
  const [unempEmployee, setUnempEmployee] = useState(settings.hr?.unemploymentEmployeeRate ?? 1);
  const [sgkEmployer, setSgkEmployer] = useState(settings.hr?.sgkEmployerRate ?? 15.5);
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
      alert('İK ayarları kaydedilirken hata oluştu.');
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
            <span className="text-xs font-bold tracking-wider">İnsan Kaynakları & Bordro parametreleri başarıyla kaydedildi.</span>
          </div>
        </div>
      )}

      {/* SECTION 1: ÇALIŞMA SÜRELERİ VE FAZLA MESAİ */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-md">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold tracking-wider">ÇALIŞMA SÜRELERİ & FAZLA MESAİ KATSAYILARI</h3>
              <p className="text-slate-400 text-xs font-medium">4857 sayılı İş Kanunu standartları ve mesai çarpanları</p>
            </div>
          </div>
        </div>

        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <NumberField
            label="HAFTALIK YASAL ÇALIŞMA (SAAT)"
            hint="Yasal standart 45 saat"
            value={weeklyHours}
            onChange={setWeeklyHours}
            min={1}
            max={60}
          />
          <NumberField
            label="GÜNLÜK NORMAL MESAİ (SAAT)"
            hint="Genel vardiya 8 saat"
            value={dailyHours}
            onChange={setDailyHours}
            min={1}
            max={12}
          />
          <NumberField
            label="HAFTA İÇİ MESAİ ÇARPANI (X)"
            hint="Standart %50 zamlı (1.5x)"
            value={overtimeWeekday}
            onChange={setOvertimeWeekday}
            step="0.1"
            min={1}
            max={3}
          />
          <NumberField
            label="HAFTA TATİLİ MESAİ ÇARPANI (X)"
            hint="Hafta tatili ve resmi tatillerde %100 zamlı (2.0x)"
            value={overtimeWeekend}
            onChange={setOvertimeWeekend}
            step="0.1"
            min={1}
            max={4}
          />
          <NumberField
            label="YILLIK İZİN TABAN GÜNÜ"
            hint="Kıdemsiz personel için yasal taban (14 gün)"
            value={annualLeaveDays}
            onChange={setAnnualLeaveDays}
            min={1}
            max={60}
          />
        </div>
      </div>

      {/* SECTION 2: HAFTA TATİLİ GÜNLERİ */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-sky-600 rounded-xl flex items-center justify-center text-white shadow-md">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold tracking-wider">HAFTA TATİLİ GÜNLERİ</h3>
              <p className="text-slate-400 text-xs font-medium">İşletmenizin çalışma takvimine göre tatil günlerini seçin</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Seçilen günler puantajda <b>Hafta Tatili (H)</b> olarak değerlendirilir: otomatik puantaj doldurma,
            toplu durum atama ve bordro hesaplamasında (kayıt girilmemiş günler için) bu günler tatil sayılır.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {WEEK_DAYS.map(day => {
              const selected = weekendDays.includes(day.index);
              return (
                <button
                  key={day.index}
                  type="button"
                  onClick={() => toggleWeekendDay(day.index)}
                  className={`px-3 py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                    selected
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-900 ring-2 ring-indigo-500/20'
                      : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-800/50'
                  }`}
                >
                  {day.label}
                </button>
              );
            })}
          </div>
          {weekendDays.length === 0 ? (
            <p className="text-[11px] font-semibold text-amber-600">
              Hiçbir gün seçilmedi: puantajda hafta tatili günü olmayacak, tüm günler çalışma günü sayılacak.
            </p>
          ) : (
            <p className="text-[11px] text-slate-400">
              Hafta tatili: <b>{WEEK_DAYS.filter(d => weekendDays.includes(d.index)).map(d => d.label).join(', ')}</b>
            </p>
          )}
        </div>
      </div>

      {/* SECTION 3: ASGARİ ÜCRET VE VERGİ PARAMETRELERİ */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-600 rounded-xl flex items-center justify-center text-white shadow-md">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold tracking-wider">ASGARİ ÜCRET & VERGİ PARAMETRELERİ</h3>
              <p className="text-slate-400 text-xs font-medium">Netten brüte dönüşüm, vergi istisnaları ve saatlik ücret bölenleri</p>
            </div>
          </div>
        </div>

        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <NumberField
            label="ASGARİ ÜCRET BRÜT (₺)"
            hint="Yıllık güncellenen brüt asgari ücret"
            value={minWageGross}
            onChange={setMinWageGross}
            step="0.01"
          />
          <NumberField
            label="ASGARİ ÜCRET NET (₺)"
            hint="Netten brüte dönüşümde referans taban"
            value={minWageNet}
            onChange={setMinWageNet}
            step="0.01"
          />
          <NumberField
            label="GELİR VERGİSİ İSTİSNASI (₺)"
            hint="Asgari ücret için aylık istisna tutarı"
            value={minWageIncomeTaxExemption}
            onChange={setMinWageIncomeTaxExemption}
            step="0.01"
          />
          <NumberField
            label="DAMGA VERGİSİ İSTİSNASI (₺)"
            hint="Asgari ücret için aylık istisna tutarı"
            value={minWageStampTaxExemption}
            onChange={setMinWageStampTaxExemption}
            step="0.01"
          />
          <NumberField
            label="GELİR VERGİSİ ORANI (%)"
            hint="1. vergi dilimi oranı (yasal %15)"
            value={incomeTaxRate}
            onChange={setIncomeTaxRate}
            step="0.01"
            min={0}
            max={40}
          />
          <NumberField
            label="DAMGA VERGİSİ ORANI (BİNDE)"
            hint="Yasal binde 7,59"
            value={stampTaxPerMille}
            onChange={setStampTaxPerMille}
            step="0.01"
            min={0}
          />
          <NumberField
            label="SGK'LI AYLIK SAAT (BÖLEN)"
            hint="Aylık brüt / saatlik brüt ve mesai için (yasal 225)"
            value={sgkMonthlyHours}
            onChange={setSgkMonthlyHours}
            min={1}
          />
          <NumberField
            label="SGK'SIZ AYLIK SAAT (BÖLEN)"
            hint="Harici/yevmiyeli saatlik ücret böleni (30 x 8 = 240)"
            value={nonSgkMonthlyHours}
            onChange={setNonSgkMonthlyHours}
            min={1}
          />
        </div>
      </div>

      {/* SECTION 4: SGK VE YASAL KESİNTİLER */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white shadow-md">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold tracking-wider">SGK & BORDRO YASAL KESİNTİ ORANLARI</h3>
              <p className="text-slate-400 text-xs font-medium">Bordro hesaplamasında kullanılan işçi ve işveren payları</p>
            </div>
          </div>
        </div>

        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <NumberField
            label="SGK İŞÇİ PRİMİ (%)"
            hint="Yasal oran %14"
            value={sgkEmployee}
            onChange={setSgkEmployee}
            step="0.1"
          />
          <NumberField
            label="İŞSİZLİK SİGORTASI İŞÇİ (%)"
            hint="Yasal oran %1"
            value={unempEmployee}
            onChange={setUnempEmployee}
            step="0.1"
          />
          <NumberField
            label="SGK İŞVEREN PRİMİ (%)"
            hint="Hazine teşvikli %15,5 / normal %20,5"
            value={sgkEmployer}
            onChange={setSgkEmployer}
            step="0.1"
          />
          <NumberField
            label="İŞSİZLİK SİGORTASI İŞVEREN (%)"
            hint="Yasal oran %2"
            value={unempEmployer}
            onChange={setUnempEmployer}
            step="0.1"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isSaving}
          className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black tracking-wider transition-all shadow-sm flex items-center gap-2 cursor-pointer"
        >
          <Save className="w-4 h-4" />
          {isSaving ? 'Kaydediliyor...' : 'İK Parametrelerini Kaydet'}
        </button>
      </div>
    </form>
  );
}
