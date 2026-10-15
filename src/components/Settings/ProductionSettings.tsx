import React, { useState } from 'react';
import { Hammer, Save, Check, Layers } from 'lucide-react';
import { PRODUCTION_STAGES_CONFIG } from '../../services/productionService';
import { showToast } from '../../lib/feedback';
import SettingsSection from './SettingsSection';
import { Field, Input } from '../Common/Field';
import Button from '../Common/Button';
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
      showToast('Üretim ayarları kaydedilirken hata oluştu.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {saveSuccess && (
        <div className="flex items-center gap-2 rounded-card border border-success/30 bg-success-soft px-3.5 py-2.5 text-xs font-bold text-success">
          <Check className="h-4 w-4" />
          Üretim ve İmalat modülü ayarları başarıyla kaydedildi.
        </div>
      )}

      <SettingsSection
        title="Üretim & İş Emri Parametreleri"
        description="Bant kapasitesi, fire toleransı ve iş emri barkod formatı"
        icon={<Hammer />}
        keywords="iş emri önek barkod kapasite çift fire tolerans reçete hammadde otomatik düş"
      >
        <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-3">
          <Field label="İş Emri Barkod Öneki" hint={`Örnek: ${woPrefix}000452`}>
            <Input type="text" value={woPrefix} onChange={(e) => setWoPrefix(e.target.value)} />
          </Field>
          <Field label="Hedef Günlük Üretim Kapasitesi (Çift/Gün)" hint="Tüm montaj bantlarının toplam günlük nominal kapasitesi">
            <Input type="number" min="1" value={dailyCapacity} onChange={(e) => setDailyCapacity(Number(e.target.value))} />
          </Field>
          <Field label="Standart Fire / Hurda Kabul Toleransı (%)" hint="Saya kesim ve finisaj aşamalarında kabul edilen standart pay">
            <Input type="number" min="0" max="20" step="0.5" value={scrapTolerance} onChange={(e) => setScrapTolerance(Number(e.target.value))} />
          </Field>
        </div>

        <div className="border-t border-line bg-surface-hover/40 p-4">
          <label className="flex cursor-pointer select-none items-start gap-3">
            <input
              type="checkbox"
              checked={autoConsume}
              onChange={(e) => setAutoConsume(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded accent-[var(--brand)]"
            />
            <span>
              <span className="block text-xs font-black uppercase tracking-wider text-fg-strong">Planlamadan Kesime Geçildiğinde Reçete Hammaddelerini Otomatik Düş</span>
              <span className="block text-2xs font-semibold text-fg-muted">İş emri kesim/dikim aşamasına alındığında reçetedeki deri, taban, astar ve aksesuarlar depodan otomatik rezerve/sarf edilir.</span>
            </span>
          </label>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Üretim İstasyonları & İmalat Akışı"
        description="Bant boyunca takip edilen standart 8 aşamalı üretim süreci"
        icon={<Layers />}
        count={`${PRODUCTION_STAGES_CONFIG.length} Aşama`}
        keywords="istasyon aşama bant imalat süreci kesim dikim finisaj"
      >
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          {PRODUCTION_STAGES_CONFIG.map((stage) => (
            <div key={stage.id} className="space-y-1.5 rounded-card border border-line bg-surface-raised p-3">
              <div className="flex items-center justify-between">
                <span className="flex h-6 w-6 items-center justify-center rounded-pill bg-brand text-2xs font-black text-on-brand">{stage.order}</span>
                <span className={`rounded-control border px-2 py-0.5 text-2xs font-bold ${stage.color}`}>{stage.shortLabel}</span>
              </div>
              <div className="text-xs font-black text-fg-strong">{stage.label}</div>
              <p className="text-2xs font-semibold text-fg-muted">{stage.description}</p>
            </div>
          ))}
        </div>

      </SettingsSection>
        <div className="flex justify-end rounded-card border border-line bg-surface p-4 shadow-card">
          <Button type="submit" variant="primary" icon={<Save className="h-4 w-4" />} loading={isSaving}>
            Üretim Ayarlarını Kaydet
          </Button>
        </div>
    </form>
  );
}
