import React, { useState } from 'react';
import { Hammer, Save, Check, Layers, AlertCircle, Sparkles, Activity } from 'lucide-react';
import { PRODUCTION_STAGES_CONFIG } from '../../services/erpService';
import type { AppSettings } from '../../types';

interface ProductionSettingsProps {
  settings: AppSettings;
  onSave: (newSettings: AppSettings) => Promise<void>;
}

export default function ProductionSettings({ settings, onSave }: ProductionSettingsProps) {
  const [woPrefix, setWoPrefix] = useState(settings.production?.workOrderPrefix || 'WO-');
  const [dailyCapacity, setDailyCapacity] = useState(settings.production?.defaultDailyCapacityPairs || 650);
  const [scrapTolerance, setScrapTolerance] = useState(settings.production?.scrapTolerancePercentage || 2);
  const [autoConsume, setAutoConsume] = useState(settings.production?.autoConsumeMaterialsOnStart ?? true);

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const updated: AppSettings = {
        ...settings,
        production: {
          ...settings.production,
          workOrderPrefix: woPrefix,
          defaultDailyCapacityPairs: Number(dailyCapacity),
          scrapTolerancePercentage: Number(scrapTolerance),
          autoConsumeMaterialsOnStart: autoConsume
        }
      };
      await onSave(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Üretim ayarları kaydedilemedi:', err);
      alert('Üretim ayarları kaydedilirken hata oluştu.');
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
            <span className="text-xs font-bold uppercase tracking-wider">Üretim ve İmalat modülü ayarları başarıyla kaydedildi.</span>
          </div>
        </div>
      )}

      {/* SECTION 1: İMALAT VE KAPASİTE PARAMETRELERİ */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-600 rounded-xl flex items-center justify-center text-white shadow-md">
              <Hammer className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold uppercase tracking-wider">Üretim & İş Emri Parametreleri</h3>
              <p className="text-slate-400 text-xs font-medium">Bant kapasitesi, fire toleransı ve iş emri barkod formatı</p>
            </div>
          </div>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">İş Emri Barkod Öneki</label>
            <input
              type="text"
              value={woPrefix}
              onChange={e => setWoPrefix(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
            <span className="text-[10px] text-slate-400">Örnek: {woPrefix}000452</span>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Hedef Günlük Üretim Kapasitesi (Çift/Gün)</label>
            <input
              type="number"
              min="1"
              value={dailyCapacity}
              onChange={e => setDailyCapacity(Number(e.target.value))}
              className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
            <span className="text-[10px] text-slate-400">Tüm montaj bantlarının toplam günlük nominal kapasitesi</span>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Standart Fire / Hurda Kabul Toleransı (%)</label>
            <input
              type="number"
              min="0"
              max="20"
              step="0.5"
              value={scrapTolerance}
              onChange={e => setScrapTolerance(Number(e.target.value))}
              className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
            <span className="text-[10px] text-slate-400">Saya kesim ve finisaj aşamalarında kabul edilen standart pay</span>
          </div>
        </div>

        <div className="p-6 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoConsume}
              onChange={e => setAutoConsume(e.target.checked)}
              className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300"
            />
            <div>
              <span className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider block">Planlamadan Kesime Geçildiğinde Reçete Hammaddelerini Otomatik Düş</span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">İş emri kesim/dikim aşamasına alındığında reçetedeki deri, taban, astar ve aksesuarlar depodan otomatik rezerve/sarf edilir.</span>
            </div>
          </label>
        </div>
      </div>

      {/* SECTION 2: ÜRETİM İSTASYONLARI VE AŞAMALAR */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-teal-600 rounded-xl flex items-center justify-center text-white shadow-md">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold uppercase tracking-wider">Üretim İstasyonları & İmalat Akışı</h3>
              <p className="text-slate-400 text-xs font-medium">Bant boyunca takip edilen standart 8 aşamalı üretim süreci</p>
            </div>
          </div>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {PRODUCTION_STAGES_CONFIG.map((stage) => (
              <div 
                key={stage.id}
                className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50/70 space-y-2 hover:border-slate-300 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="w-6 h-6 rounded-full bg-slate-900 text-white text-xs font-black flex items-center justify-center">
                    {stage.order}
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${stage.color}`}>
                    {stage.shortLabel}
                  </span>
                </div>
                <div className="text-xs font-black text-slate-900 dark:text-slate-100">{stage.label}</div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">{stage.description}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="p-6 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 flex justify-end">
          <button
            type="submit"
            disabled={isSaving}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-sm flex items-center gap-2 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Kaydediliyor...' : 'Üretim Ayarlarını Kaydet'}
          </button>
        </div>
      </div>
    </form>
  );
}
