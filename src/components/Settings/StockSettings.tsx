import React, { useState, useRef } from 'react';
import { useApiQuery } from '../../hooks/useApiQuery';
import { api } from '../../api/client';
import { inventoryService } from '../../services/inventoryService';
import {
  Barcode,
  Ruler,
  Plus,
  Trash2,
  Edit3,
  Check,
  Boxes,
  Sparkles,
  Save,
  Layers,
  X,
} from 'lucide-react';
import { BarcodeSvg } from '../BarcodeSvg';
import PermissionGate from '../Common/PermissionGate';
import ColorSettings from './ColorSettings';
import SettingsSection from './SettingsSection';
import { Field, Input, Select } from '../Common/Field';
import Button from '../Common/Button';
import StatusBadge from '../Common/StatusBadge';
import { showToast, confirmDialog } from '../../lib/feedback';
import type { AppSettings, AssortmentTemplate } from '../../types';

interface StockSettingsProps {
  settings: AppSettings;
  onSave: (newSettings: AppSettings) => Promise<void>;
}

export default function StockSettings({ settings, onSave }: StockSettingsProps) {
  const templates = useApiQuery(() => api.assortmentTemplates.list(), [], ['assortmentTemplates']);

  // Local state for stock parameters
  const [barcodeType, setBarcodeType] = useState(settings.stock?.barcodeType || settings.barcodeType || 'CODE-128');
  const [barcodePrefix, setBarcodePrefix] = useState(settings.stock?.barcodePrefix || settings.barcodePrefix || '869');
  const [nextSeq, setNextSeq] = useState(settings.stock?.nextBarcodeSequence || settings.nextBarcodeSequence || 1000000);
  const [autoBarcode, setAutoBarcode] = useState(settings.stock?.autoBarcodeOnProductCreate ?? true);
  const [criticalThreshold, setCriticalThreshold] = useState(settings.stock?.defaultCriticalStockThreshold || 10);
  const [shoeSizesStr, setShoeSizesStr] = useState((settings.stock?.defaultShoeSizes || ['35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46']).join(', '));

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Assortment template states
  const [editingTemplateId, setEditingTemplateId] = useState<number | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [templateItems, setTemplateItems] = useState<{ size: string; quantity: number }[]>([]);
  const [newItemSize, setNewItemSize] = useState('');
  const [newItemQty, setNewItemQty] = useState(1);
  const sizeInputRef = useRef<HTMLInputElement>(null);

  // Quick preset templates
  const PRESET_TEMPLATES = [
    {
      name: "10'lu Erkek Spor (40-44)",
      items: [
        { size: '40', quantity: 1 },
        { size: '41', quantity: 2 },
        { size: '42', quantity: 3 },
        { size: '43', quantity: 2 },
        { size: '44', quantity: 2 }
      ]
    },
    {
      name: "12'li Erkek Klasik (40-45)",
      items: [
        { size: '40', quantity: 1 },
        { size: '41', quantity: 2 },
        { size: '42', quantity: 4 },
        { size: '43', quantity: 3 },
        { size: '44', quantity: 1 },
        { size: '45', quantity: 1 }
      ]
    },
    {
      name: "8'li Kadın Standart (36-40)",
      items: [
        { size: '36', quantity: 1 },
        { size: '37', quantity: 2 },
        { size: '38', quantity: 3 },
        { size: '39', quantity: 1 },
        { size: '40', quantity: 1 }
      ]
    },
    {
      name: "10'lu Çocuk Patik (26-30)",
      items: [
        { size: '26', quantity: 2 },
        { size: '27', quantity: 2 },
        { size: '28', quantity: 2 },
        { size: '29', quantity: 2 },
        { size: '30', quantity: 2 }
      ]
    },
    {
      name: "10'lu Taban & Mostra Serisi (39-44)",
      items: [
        { size: '39', quantity: 1 },
        { size: '40', quantity: 2 },
        { size: '41', quantity: 2 },
        { size: '42', quantity: 3 },
        { size: '43', quantity: 1 },
        { size: '44', quantity: 1 }
      ]
    }
  ];

  const handleSaveParameters = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const parsedSizes = shoeSizesStr
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

      const updated: AppSettings = {
        ...settings,
        barcodeType,
        barcodePrefix,
        nextBarcodeSequence: Number(nextSeq),
        stock: {
          ...settings.stock,
          barcodeType,
          barcodePrefix,
          nextBarcodeSequence: Number(nextSeq),
          autoBarcodeOnProductCreate: autoBarcode,
          defaultCriticalStockThreshold: Number(criticalThreshold),
          defaultShoeSizes: parsedSizes.length > 0 ? parsedSizes : settings.stock?.defaultShoeSizes || ['36', '37', '38', '39', '40', '41', '42', '43', '44', '45']
        }
      };

      await onSave(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Ayarlar kaydedilemedi:', err);
      showToast('Ayarlar kaydedilirken bir hata oluştu.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddTemplateItem = () => {
    if (!newItemSize || newItemQty <= 0) return;
    const cleanSize = newItemSize.trim().toUpperCase();
    if (templateItems.some(i => i.size === cleanSize)) {
      showToast(`${cleanSize} numarası zaten listede ekli.`, 'warning');
      return;
    }
    setTemplateItems([...templateItems, { size: cleanSize, quantity: newItemQty }]);
    setNewItemSize('');
    setNewItemQty(1);
    sizeInputRef.current?.focus();
  };

  const handleRemoveTemplateItem = (size: string) => {
    setTemplateItems(templateItems.filter(i => i.size !== size));
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!templateName.trim()) {
      showToast('Lütfen şablon adı girin.', 'warning');
      return;
    }
    if (templateItems.length === 0) {
      showToast('Lütfen en az bir beden ve miktar ekleyin.', 'warning');
      return;
    }

    if (editingTemplateId) {
      await inventoryService.updateAssortmentTemplate(editingTemplateId, {
        name: templateName.trim(),
        items: templateItems
      });
      setEditingTemplateId(null);
    } else {
      await inventoryService.addAssortmentTemplate({
        name: templateName.trim(),
        items: templateItems
      });
    }

    setTemplateName('');
    setTemplateItems([]);
    setNewItemSize('');
    setNewItemQty(1);
  };

  const startEditTemplate = (t: AssortmentTemplate) => {
    setEditingTemplateId(t.id || null);
    setTemplateName(t.name);
    setTemplateItems([...t.items]);
  };

  const cancelEditTemplate = () => {
    setEditingTemplateId(null);
    setTemplateName('');
    setTemplateItems([]);
  };

  const handleDeleteTemplate = async (id: number) => {
    if (await confirmDialog('Bu asorti şablonunu silmek istediğinize emin misiniz?', { tone: 'danger', confirmText: 'Sil' })) {
      await inventoryService.deleteAssortmentTemplate(id);
      if (editingTemplateId === id) cancelEditTemplate();
    }
  };

  const handleApplyPreset = async (preset: typeof PRESET_TEMPLATES[0]) => {
    await inventoryService.addAssortmentTemplate(preset);
  };

  const sampleBarcodePreview = `${barcodePrefix}${nextSeq}`;

  const totalPairsInForm = templateItems.reduce((acc, curr) => acc + curr.quantity, 0);

  return (
    <div className="space-y-3">
      {saveSuccess && (
        <div className="flex items-center gap-2 rounded-card border border-success/30 bg-success-soft px-3.5 py-2.5 text-xs font-bold text-success">
          <Check className="h-4 w-4" />
          Stok modülü parametreleri başarıyla kaydedildi ve senkronize edildi.
        </div>
      )}

      {/* SECTION 1: ASORTİ ŞABLONLARI YÖNETİMİ */}
      <SettingsSection
        title="Asorti & Beden Şablonları"
        description="Ayakkabı üretim, koli paketleme ve numara dağılım standartları"
        icon={<Boxes />}
        count={`${templates?.length || 0} Şablon`}
        keywords="asorti şablon beden koli numara dağılım preset çift"
      >
        <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-12">
          {/* Left: Template Creator / Editor Form */}
          <div className="space-y-3 rounded-card border border-line bg-surface-raised p-4 lg:col-span-5">
            <div className="flex items-center justify-between border-b border-line pb-2">
              <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-fg-strong">
                {editingTemplateId ? <Edit3 className="h-4 w-4 text-warning" /> : <Plus className="h-4 w-4 text-brand" />}
                {editingTemplateId ? 'Şablonu Güncelle' : 'Yeni Asorti Şablonu Oluştur'}
              </span>
              {editingTemplateId && (
                <button type="button" onClick={cancelEditTemplate} className="cursor-pointer text-2xs font-bold uppercase text-fg-muted underline hover:text-fg-strong">
                  İptal
                </button>
              )}
            </div>

            <form onSubmit={handleSaveTemplate} className="space-y-3">
              <Field label="Şablon Adı" required>
                <Input
                  type="text"
                  required
                  placeholder="Örn: 10'LU ERKEK SPOR (40-44)"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  className="uppercase"
                />
              </Field>

              <div className="space-y-2 rounded-card border border-line bg-surface p-3">
                <div className="flex items-center justify-between">
                  <span className="text-2xs font-black uppercase tracking-wider text-fg-muted">Numara & Miktar Ekle</span>
                  {totalPairsInForm > 0 && <StatusBadge tone="brand">{totalPairsInForm} Çift</StatusBadge>}
                </div>

                <div className="flex items-center gap-2">
                  <div className="w-24">
                    <Input
                      ref={sizeInputRef}
                      type="text"
                      placeholder="Beden (42)"
                      value={newItemSize}
                      onChange={(e) => setNewItemSize(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddTemplateItem(); } }}
                      className="text-center"
                    />
                  </div>
                  <div className="w-24">
                    <Input
                      type="number"
                      min="1"
                      placeholder="Çift (2)"
                      value={newItemQty}
                      onChange={(e) => setNewItemQty(Number(e.target.value))}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddTemplateItem(); } }}
                      className="text-center"
                    />
                  </div>
                  <Button type="button" variant="secondary" size="sm" className="flex-1" onClick={handleAddTemplateItem}>
                    Numara Ekle
                  </Button>
                </div>

                {templateItems.length > 0 ? (
                  <div className="flex max-h-36 flex-wrap gap-1.5 border-t border-line pt-2">
                    {templateItems.map((item) => (
                      <span key={item.size} className="inline-flex items-center gap-1.5 rounded-control border border-brand/30 bg-brand-soft px-2 py-1 text-xs font-bold text-brand-fg">
                        <span>{item.size}: <b>{item.quantity} Çift</b></span>
                        <button type="button" onClick={() => handleRemoveTemplateItem(item.size)} className="cursor-pointer text-brand-fg/60 hover:text-danger">
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="py-2 text-center text-2xs font-semibold italic text-fg-muted">Henüz numara eklenmedi. Yukarıdan beden ve çift sayısı girin.</p>
                )}
              </div>

              <Button type="submit" variant="primary" block icon={<Save className="h-4 w-4" />} disabled={templateItems.length === 0 || !templateName.trim()}>
                {editingTemplateId ? 'Değişiklikleri Kaydet' : 'Şablonu Sisteme Ekle'}
              </Button>
            </form>
          </div>

          {/* Right: Existing Templates List & Presets */}
          <div className="space-y-4 lg:col-span-7">
            <div className="space-y-2 rounded-card border border-warning/30 bg-warning-soft/50 p-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-warning" />
                <span className="text-2xs font-black uppercase tracking-wider text-fg-strong">Hızlı Hazır Şablon Ekle (Presets)</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {PRESET_TEMPLATES.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleApplyPreset(preset)}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-control border border-line bg-surface px-2.5 py-1.5 text-2xs font-bold text-fg-strong transition-colors hover:border-brand hover:bg-brand-soft"
                  >
                    <Plus className="h-3 w-3 text-brand" />
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black uppercase tracking-wider text-fg-strong">Kayıtlı Asorti Şablonları</h4>
                <span className="text-2xs font-bold uppercase text-fg-muted">{templates?.length || 0} Şablon</span>
              </div>

              <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
                {templates && templates.length > 0 ? (
                  templates.map((t) => {
                    const totalPairs = t.items.reduce((acc, curr) => acc + curr.quantity, 0);
                    return (
                      <div key={t.id} className="flex flex-col gap-2 rounded-card border border-line bg-surface p-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-xs font-black uppercase text-fg-strong">{t.name}</span>
                            <StatusBadge tone="neutral">{totalPairs} Çift / Koli</StatusBadge>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {t.items.map((it, idx) => (
                              <span key={idx} className="rounded border border-line bg-surface-hover px-1.5 py-0.5 font-mono text-2xs font-bold text-fg">
                                {it.size}: {it.quantity}ç
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1 self-end sm:self-center">
                          <button type="button" onClick={() => startEditTemplate(t)} title="Düzenle" className="cursor-pointer rounded-control p-1.5 text-fg-muted transition-colors hover:bg-brand-soft hover:text-brand">
                            <Edit3 className="h-4 w-4" />
                          </button>
                          <button type="button" onClick={() => handleDeleteTemplate(t.id!)} title="Sil" className="cursor-pointer rounded-control p-1.5 text-fg-muted transition-colors hover:bg-danger-soft hover:text-danger">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-card border border-dashed border-line bg-surface-hover/40 p-6 text-center">
                    <Boxes className="mx-auto mb-2 h-7 w-7 text-fg-muted" />
                    <p className="text-xs font-black uppercase text-fg-strong">Henüz kayıtlı asorti şablonu bulunmuyor.</p>
                    <p className="mt-1 text-2xs font-semibold text-fg-muted">Sol taraftaki formdan oluşturabilir veya hazır şablon butonlarını kullanabilirsiniz.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </SettingsSection>

      {/* SECTION 2: BARKOD PARAMETRELERİ & STANDARDI */}
      <SettingsSection
        title="Barkod Formatı & Sayacı"
        description="Otomatik ürün, varyant ve koli barkodu üretim kuralları"
        icon={<Barcode />}
        keywords="barkod code-128 ean-13 code-39 önek gs1 sayaç otomatik üret"
      >
        <form onSubmit={handleSaveParameters} className="space-y-4 p-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field label="Barkod Standardı" hint="Ayakkabı kutusu ve tekil çift etiketlerinde yüksek okunabilirlik sağlar.">
              <Select value={barcodeType} onChange={(e) => setBarcodeType(e.target.value as any)}>
                <option value="CODE-128">CODE-128 (Önerilen - Esnek Alfamerik & Kompakt)</option>
                <option value="EAN-13">EAN-13 (Uluslararası GS1 Perakende Standart)</option>
                <option value="CODE-39">CODE-39 (Klasik Endüstriyel Format)</option>
              </Select>
            </Field>
            <Field label="Barkod Ön Eki (GS1 / Firma Prefix)" hint="Üretilen barkodların başına otomatik eklenecek sabit önek.">
              <Input type="text" placeholder="Örn: 869 veya AYK" value={barcodePrefix} onChange={(e) => setBarcodePrefix(e.target.value)} />
            </Field>
            <Field label="Sıradaki Sayaç (Sequence Counter)" hint="Her yeni barkod üretildiğinde bu sayaç otomatik 1 artırılır.">
              <Input type="number" value={nextSeq} onChange={(e) => setNextSeq(Number(e.target.value))} />
            </Field>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-card border border-line bg-surface-hover/40 px-3.5 py-3">
            <input type="checkbox" checked={autoBarcode} onChange={(e) => setAutoBarcode(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[var(--brand)]" />
            <span>
              <span className="block text-xs font-black uppercase tracking-wider text-fg-strong">Yeni ürün oluştururken otomatik barkod üret</span>
              <span className="block text-2xs font-semibold text-fg-muted">Ürün kaydedildiğinde yukarıdaki format ve sayaca göre barkod otomatik oluşturulur.</span>
            </span>
          </label>

          <div className="flex flex-col items-center justify-between gap-4 rounded-card border border-line bg-surface-raised p-4 sm:flex-row">
            <div className="text-center sm:text-left">
              <div className="text-xs font-black uppercase tracking-wider text-fg-strong">Canlı Barkod Önizleme</div>
              <div className="text-2xs font-mono font-semibold text-fg-muted">Standart: {barcodeType} | Kod: <b className="text-fg-strong">{sampleBarcodePreview}</b></div>
            </div>
            <div className="rounded-control border border-line bg-white p-3">
              <BarcodeSvg value={sampleBarcodePreview} height={50} />
            </div>
          </div>

          <div className="flex justify-end border-t border-line pt-1">
            <Button type="submit" variant="primary" icon={<Save className="h-4 w-4" />} loading={isSaving}>
              Barkod Parametrelerini Kaydet
            </Button>
          </div>
        </form>
      </SettingsSection>

      {/* SECTION 3: AYAKKABI NUMARA SERİLERİ & STOK EŞİKLERİ */}
      <SettingsSection
        title="Numara Standartları & Kritik Eşik"
        description="Varsayılan numara aralığı ve otomatik kritik stok alarm seviyesi"
        icon={<Ruler />}
        keywords="numara seri ayakka kritik stok eşik uyarı limiti"
      >
        <form onSubmit={handleSaveParameters} className="space-y-4 p-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Varsayılan Numara Serisi (Virgülle Ayrılmış)" hint="Yeni mamul oluşturulurken hızlı numara seçiminde listelenecek numaralar.">
              <Input type="text" placeholder="36, 37, 38, 39, 40, 41, 42, 43, 44, 45" value={shoeSizesStr} onChange={(e) => setShoeSizesStr(e.target.value)} />
            </Field>
            <Field label="Varsayılan Kritik Stok Uyarı Limiti (Adet / Çift)" hint="Stok miktarı bu sayının altına indiğinde panelde kritik stok uyarısı verilir.">
              <Input type="number" min="0" value={criticalThreshold} onChange={(e) => setCriticalThreshold(Number(e.target.value))} />
            </Field>
          </div>

          <div className="flex justify-end border-t border-line pt-1">
            <Button type="submit" variant="primary" icon={<Save className="h-4 w-4" />} loading={isSaving}>
              Numara &amp; Eşik Ayarlarını Kaydet
            </Button>
          </div>
        </form>
      </SettingsSection>

      {/* SECTION 4: MERKEZİ RENK TANIMLARI (COLOR MASTER) */}
      <PermissionGate module="colors" action="view">
        <SettingsSection
          title="Renk Tanımları"
          description="Merkezi renk kartları: kod, HEX, Pantone ve üretici kodu"
          icon={<Layers />}
          keywords="renk kartı hex pantone rgb üretici kodu grup tanımları"
        >
          <ColorSettings />
        </SettingsSection>
      </PermissionGate>
    </div>
  );
}
