import React, { useState, useRef } from 'react';
import { useApiQuery } from '../../hooks/useApiQuery';
import { api } from '../../api/client';
import { erpService } from '../../services/erpService';
import { 
  Barcode, 
  Ruler, 
  Plus, 
  Trash2, 
  Edit3, 
  Check, 
  RefreshCw, 
  Boxes, 
  Sparkles, 
  Tag, 
  Save, 
  Info,
  Layers,
  AlertCircle
} from 'lucide-react';
import { BarcodeSvg } from '../BarcodeSvg';
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
      alert('Ayarlar kaydedilirken bir hata oluştu.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddTemplateItem = () => {
    if (!newItemSize || newItemQty <= 0) return;
    const cleanSize = newItemSize.trim().toUpperCase();
    if (templateItems.some(i => i.size === cleanSize)) {
      alert(`${cleanSize} numarası zaten listede ekli.`);
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
      alert('Lütfen şablon adı girin.');
      return;
    }
    if (templateItems.length === 0) {
      alert('Lütfen en az bir beden ve miktar ekleyin.');
      return;
    }

    if (editingTemplateId) {
      await erpService.updateAssortmentTemplate(editingTemplateId, {
        name: templateName.trim(),
        items: templateItems
      });
      setEditingTemplateId(null);
    } else {
      await erpService.addAssortmentTemplate({
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
    if (confirm('Bu asorti şablonunu silmek istediğinize emin misiniz?')) {
      await erpService.deleteAssortmentTemplate(id);
      if (editingTemplateId === id) cancelEditTemplate();
    }
  };

  const handleApplyPreset = async (preset: typeof PRESET_TEMPLATES[0]) => {
    await erpService.addAssortmentTemplate(preset);
  };

  const sampleBarcodePreview = `${barcodePrefix}${nextSeq}`;

  const totalPairsInForm = templateItems.reduce((acc, curr) => acc + curr.quantity, 0);

  return (
    <div className="space-y-8">
      {/* Save Success Alert */}
      {saveSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <Check className="w-5 h-5 text-emerald-600" />
            <span className="text-xs font-bold uppercase tracking-wider">Stok modülü parametreleri başarıyla kaydedildi ve senkronize edildi.</span>
          </div>
        </div>
      )}

      {/* SECTION 1: ASORTİ ŞABLONLARI YÖNETİMİ */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="p-6 bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-md">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold uppercase tracking-wider">Asorti & Beden Şablonları</h3>
              <p className="text-slate-400 text-xs font-medium">Ayakkabı üretim, koli paketleme ve numara dağılım standartları</p>
            </div>
          </div>
          <div className="text-xs font-bold text-slate-300 bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700">
            Kayıtlı Şablon: {templates?.length || 0} Adet
          </div>
        </div>

        <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left: Template Creator / Editor Form */}
          <div className="lg:col-span-5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-700">
              <span className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest flex items-center gap-2">
                {editingTemplateId ? <Edit3 className="w-4 h-4 text-amber-600" /> : <Plus className="w-4 h-4 text-indigo-600" />}
                {editingTemplateId ? 'Şablonu Güncelle' : 'Yeni Asorti Şablonu Oluştur'}
              </span>
              {editingTemplateId && (
                <button 
                  onClick={cancelEditTemplate}
                  className="text-[10px] text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200 font-bold uppercase underline"
                >
                  İptal
                </button>
              )}
            </div>

            <form onSubmit={handleSaveTemplate} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Şablon Adı</label>
                <input
                  type="text"
                  required
                  placeholder="Örn: 10'LU ERKEK SPOR (40-44)"
                  value={templateName}
                  onChange={e => setTemplateName(e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-bold uppercase outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              {/* Add Size/Qty row */}
              <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Numara & Miktar Ekle</span>
                  {totalPairsInForm > 0 && (
                    <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
                      Toplam: {totalPairsInForm} Çift
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <div className="w-24">
                    <input
                      ref={sizeInputRef}
                      type="text"
                      placeholder="Beden (42)"
                      value={newItemSize}
                      onChange={e => setNewItemSize(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddTemplateItem(); } }}
                      className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-xs font-bold text-center outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="w-24">
                    <input
                      type="number"
                      min="1"
                      placeholder="Çift (2)"
                      value={newItemQty}
                      onChange={e => setNewItemQty(Number(e.target.value))}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddTemplateItem(); } }}
                      className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-xs font-bold text-center outline-none focus:border-indigo-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddTemplateItem}
                    className="flex-1 bg-slate-900 hover:bg-indigo-600 text-white rounded-lg text-[10px] font-black uppercase py-2 transition-colors cursor-pointer"
                  >
                    Numara Ekle
                  </button>
                </div>

                {/* Badges list */}
                {templateItems.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-800 max-h-36 overflow-y-auto">
                    {templateItems.map((item) => (
                      <span 
                        key={item.size} 
                        className="inline-flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 text-indigo-900 px-2.5 py-1 rounded-lg text-xs font-bold"
                      >
                        <span>{item.size}: <b className="text-indigo-600">{item.quantity} Çift</b></span>
                        <button
                          type="button"
                          onClick={() => handleRemoveTemplateItem(item.size)}
                          className="text-indigo-400 hover:text-rose-600 ml-0.5 cursor-pointer"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-400 italic text-center py-2">
                    Henüz numara eklenmedi. Yukarıdan beden ve çift sayısı girin.
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={templateItems.length === 0 || !templateName.trim()}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white py-3 rounded-xl font-black text-xs uppercase tracking-wider transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                {editingTemplateId ? 'Değişiklikleri Kaydet' : 'Şablonu Sisteme Ekle'}
              </button>
            </form>
          </div>

          {/* Right: Existing Templates List & Presets */}
          <div className="lg:col-span-7 space-y-6">
            {/* Quick Presets */}
            <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-2.5">
                <Sparkles className="w-4 h-4 text-amber-600" />
                <span className="text-[11px] font-black text-amber-900 uppercase tracking-widest">Hızlı Hazır Şablon Ekle (Presets)</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {PRESET_TEMPLATES.map((preset, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleApplyPreset(preset)}
                    className="text-[10px] font-bold bg-white dark:bg-slate-900 hover:bg-amber-100 text-amber-900 border border-amber-300 px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <Plus className="w-3 h-3 text-amber-600" />
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>

            {/* List */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest">Kayıtlı Asorti Şablonları</h4>
                <span className="text-[10px] text-slate-400 font-bold uppercase">{templates?.length || 0} Şablon</span>
              </div>

              <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                {templates && templates.length > 0 ? (
                  templates.map((t) => {
                    const totalPairs = t.items.reduce((acc, curr) => acc + curr.quantity, 0);
                    return (
                      <div 
                        key={t.id} 
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-slate-300 transition-colors shadow-2xs"
                      >
                        <div className="space-y-1.5 flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight truncate">{t.name}</span>
                            <span className="px-2 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-700 text-[10px] font-black rounded-md shrink-0">
                              {totalPairs} Çift / Koli
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {t.items.map((it, idx) => (
                              <span key={idx} className="text-[9px] font-mono font-bold px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded border border-slate-200 dark:border-slate-700">
                                {it.size}: {it.quantity}ç
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 self-end sm:self-center shrink-0">
                          <button
                            onClick={() => startEditTemplate(t)}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                            title="Düzenle"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteTemplate(t.id!)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="Sil"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-8 text-center bg-slate-50 dark:bg-slate-800/50 border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
                    <Boxes className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Henüz kayıtlı asorti şablonu bulunmuyor.</p>
                    <p className="text-[11px] text-slate-400 mt-1">Sol taraftaki formdan oluşturabilir veya yukarıdaki hazır şablon butonlarına tıklayabilirsiniz.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: BARKOD PARAMETRELERİ & STANDARDI */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white shadow-md">
              <Barcode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold uppercase tracking-wider">Barkod Formatı & Sayacı</h3>
              <p className="text-slate-400 text-xs font-medium">Otomatik ürün, varyant ve koli barkodu üretim kuralları</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSaveParameters} className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Standard */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Barkod Standardı</label>
              <select
                value={barcodeType}
                onChange={e => setBarcodeType(e.target.value as any)}
                className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-3 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              >
                <option value="CODE-128">CODE-128 (Önerilen - Esnek Alfamerik & Kompakt)</option>
                <option value="EAN-13">EAN-13 (Uluslararası GS1 Perakende Standart)</option>
                <option value="CODE-39">CODE-39 (Klasik Endüstriyel Format)</option>
              </select>
              <p className="text-[10px] text-slate-400">Ayakkabı kutusu ve tekil çift etiketlerinde yüksek okunabilirlik sağlar.</p>
            </div>

            {/* Prefix */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Barkod Ön Eki (GS1 / Firma Prefix)</label>
              <input
                type="text"
                value={barcodePrefix}
                onChange={e => setBarcodePrefix(e.target.value)}
                placeholder="Örn: 869 veya AYK"
                className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-3 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
              <p className="text-[10px] text-slate-400">Üretilen barkodların başına otomatik eklenecek sabit önek.</p>
            </div>

            {/* Sequence Counter */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Sıradaki Sayaç (Sequence Counter)</label>
              <input
                type="number"
                value={nextSeq}
                onChange={e => setNextSeq(Number(e.target.value))}
                className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-3 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
              <p className="text-[10px] text-slate-400">Her yeni barkod üretildiğinde bu sayaç otomatik 1 artırılır.</p>
            </div>
          </div>

          {/* Barcode Simulation Preview */}
          <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-5 flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="space-y-1 text-center sm:text-left">
              <div className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest">Canlı Barkod Önizleme</div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">Standart: {barcodeType} | Kod: <b className="text-slate-900 dark:text-slate-100">{sampleBarcodePreview}</b></div>
            </div>
            <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
              <BarcodeSvg value={sampleBarcodePreview} height={50} />
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-3 bg-slate-900 hover:bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-sm flex items-center gap-2 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Kaydediliyor...' : 'Barkod Parametrelerini Kaydet'}
            </button>
          </div>
        </form>
      </div>

      {/* SECTION 3: AYAKKABI NUMARA SERİLERİ & STOK EŞİKLERİ */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-violet-600 rounded-xl flex items-center justify-center text-white shadow-md">
              <Ruler className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold uppercase tracking-wider">Numara Standartları & Kritik Eşik</h3>
              <p className="text-slate-400 text-xs font-medium">Varsayılan numara aralığı ve otomatik kritik stok alarm seviyesi</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSaveParameters} className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Varsayılan Numara Serisi (Virgülle Ayrılmış)</label>
              <input
                type="text"
                value={shoeSizesStr}
                onChange={e => setShoeSizesStr(e.target.value)}
                placeholder="36, 37, 38, 39, 40, 41, 42, 43, 44, 45"
                className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-3 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
              <p className="text-[10px] text-slate-400">Yeni mamul oluşturulurken hızlı numara seçiminde listelenecek numaralar.</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Varsayılan Kritik Stok Uyarı Limiti (Adet / Çift)</label>
              <input
                type="number"
                min="0"
                value={criticalThreshold}
                onChange={e => setCriticalThreshold(Number(e.target.value))}
                className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-3 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
              <p className="text-[10px] text-slate-400">Stok miktarı bu sayının altına indiğinde panelde kritik stok uyarısı verilir.</p>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-sm flex items-center gap-2 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Kaydediliyor...' : 'Numara & Eşik Ayarlarını Kaydet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
