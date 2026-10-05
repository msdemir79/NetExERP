import React, { useEffect, useMemo, useState } from 'react';
import { Palette, Save, Eye, EyeOff, Hash } from 'lucide-react';
import Modal from '../Modal';
import ColorSwatch from './ColorSwatch';
import { api } from '../../api/client';
import { cn } from '../../lib/utils';
import type { ColorMaster } from '../../types';

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

interface ColorFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Verilirse düzenleme, verilmezse yeni kart oluşturulur. */
  color?: ColorMaster | null;
  /** Kayıt başarıyla tamamlandığında çağrılır; seçici içinde açıldıysa kart otomatik seçilir. */
  onSaved: (color: ColorMaster) => void;
  /** Başka bir modalın içinden açılıyorsa ESC yalnızca bu formu kapatır. */
  nested?: boolean;
}

interface ColorFormState {
  code: string;
  name: string;
  groupName: string;
  hexCode: string;
  pantoneCode: string;
  manufacturerCode: string;
  description: string;
  isActive: boolean;
}

const EMPTY_FORM: ColorFormState = {
  code: '',
  name: '',
  groupName: '',
  hexCode: '',
  pantoneCode: '',
  manufacturerCode: '',
  description: '',
  isActive: true,
};

function toForm(color: ColorMaster | null | undefined): ColorFormState {
  if (!color) return { ...EMPTY_FORM };
  return {
    code: color.code || '',
    name: color.name || '',
    groupName: color.groupName || '',
    hexCode: color.hexCode || '',
    pantoneCode: color.pantoneCode || '',
    manufacturerCode: color.manufacturerCode || '',
    description: color.description || '',
    isActive: color.isActive !== false,
  };
}

/** RGB sunucuda HEX'ten türetilir; burada yalnızca anlık önizleme gösterilir. */
function hexToRgbPreview(hex: string): string {
  if (!HEX_RE.test(hex)) return '—';
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ');
}

const FIELD_CLASS =
  'w-full bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500';
const LABEL_CLASS = 'text-[10px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest';

/**
 * Merkezi renk kartı oluşturma/düzenleme formu. Hem Renk Tanımları ekranından
 * hem de stok kartı gibi seçicilerin içindeki "Yeni Renk" düğmesinden açılır.
 *
 * Renk kodu boş bırakılırsa sunucu kilitli sayaçtan `R-0001` biçiminde üretir;
 * elle girilen kodun benzersizliği sunucuda denetlenir (409). `rgbCode` hiçbir
 * zaman istemciden gönderilmez, HEX'ten sunucuda türetilir.
 */
export default function ColorFormModal({ isOpen, onClose, color = null, onSaved, nested = false }: ColorFormModalProps) {
  const [form, setForm] = useState<ColorFormState>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = Boolean(color?.id);

  useEffect(() => {
    if (!isOpen) return;
    setForm(toForm(color));
    setError(null);
    setIsSaving(false);
  }, [isOpen, color]);

  const set = <K extends keyof ColorFormState>(key: K, value: ColorFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const hexError = useMemo(() => {
    const hex = form.hexCode.trim();
    if (!hex) return null;
    return HEX_RE.test(hex) ? null : 'HEX kodu #RRGGBB biçiminde olmalıdır (ör. #1A2B3C).';
  }, [form.hexCode]);

  const nameError = form.name.trim() ? null : 'Renk adı zorunludur.';
  const canSave = !isSaving && !hexError && Boolean(form.name.trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Portal ile taşınmış olsa da React olayları ağaçta yukarı yayılır;
    // ev sahibi formun (ör. stok kartı) submit'i tetiklenmesin.
    e.stopPropagation();
    if (!canSave) return;
    setIsSaving(true);
    setError(null);

    const hex = form.hexCode.trim().toUpperCase();
    const payload: Partial<ColorMaster> = {
      name: form.name.trim(),
      groupName: form.groupName.trim() || null,
      hexCode: hex || null,
      pantoneCode: form.pantoneCode.trim() || null,
      manufacturerCode: form.manufacturerCode.trim() || null,
      description: form.description.trim() || null,
      isActive: form.isActive,
    };
    const code = form.code.trim().toUpperCase();
    if (code) payload.code = code;

    try {
      if (isEdit) {
        await api.colors.update(color!.id!, payload);
        onSaved({ ...(color as ColorMaster), ...payload, code: code || color!.code });
      } else {
        const id = await api.colors.create(payload);
        const saved = await api.colors.get(id);
        onSaved(saved || ({ ...payload, id, code } as ColorMaster));
      }
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Renk kaydedilemedi.';
      setError(message);
      setIsSaving(false);
    }
  };

  const previewHex = HEX_RE.test(form.hexCode.trim()) ? form.hexCode.trim().toUpperCase() : null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? 'Renk Kartını Düzenle' : 'Yeni Renk Tanımı'}
      size="md"
      allowFullscreen={false}
      nested={nested}
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            Renk kartı pasifleştirilebilir ama silinemez; kullanılan renkler belgelerde korunur.
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Vazgeç
            </button>
            <button
              type="submit"
              form="color-form"
              disabled={!canSave}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-sm flex items-center gap-2 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Kaydediliyor...' : isEdit ? 'Değişiklikleri Kaydet' : 'Rengi Oluştur'}
            </button>
          </div>
        </div>
      }
    >
      <form id="color-form" onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 rounded-xl px-4 py-3 text-xs font-bold">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {/* Önizleme */}
          <div className="sm:col-span-1 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 flex flex-col items-center justify-center gap-3 text-center">
            <span
              className="w-24 h-24 rounded-2xl border border-slate-300 dark:border-slate-600 shadow-inner"
              style={{ backgroundColor: previewHex || '#F1F5F9' }}
            />
            <div className="space-y-0.5">
              <div className="text-sm font-black text-slate-900 dark:text-slate-100 uppercase tracking-wide break-words">
                {form.name.trim() || 'Yeni Renk'}
              </div>
              <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300 font-mono">
                {previewHex || 'HEX tanımsız'}
              </div>
              <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300 font-mono">
                RGB: {hexToRgbPreview(previewHex || '')}
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
              <Palette className="w-3.5 h-3.5" />
              {form.code.trim() || 'Kod otomatik üretilecek'}
            </div>
          </div>

          {/* Alanlar */}
          <div className="sm:col-span-2 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className={LABEL_CLASS}>Renk Kodu</label>
                <input
                  type="text"
                  value={form.code}
                  onChange={(e) => set('code', e.target.value.toUpperCase())}
                  placeholder="Otomatik (R-0001)"
                  maxLength={50}
                  className={cn(FIELD_CLASS, 'font-mono uppercase')}
                />
                <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                  Boş bırakılırsa sunucu sıradaki kodu üretir. Aynı kod ikinci kez kullanılamaz.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className={LABEL_CLASS}>Renk Adı *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => set('name', e.target.value.toUpperCase())}
                  placeholder="Örn: SİYAH"
                  maxLength={100}
                  required
                  className={cn(FIELD_CLASS, 'uppercase')}
                />
                <p className={cn('text-[10px] font-semibold', nameError ? 'text-rose-600' : 'text-slate-500 dark:text-slate-400')}>
                  {nameError || 'Aynı ad farklı üretici kodlarıyla birden çok kartta bulunabilir.'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className={LABEL_CLASS}>Renk Grubu</label>
                <input
                  type="text"
                  value={form.groupName}
                  onChange={(e) => set('groupName', e.target.value)}
                  placeholder="Örn: Siyahlar / Astar"
                  maxLength={100}
                  className={FIELD_CLASS}
                />
              </div>

              <div className="space-y-1.5">
                <label className={LABEL_CLASS}>Üretici Renk Kodu</label>
                <input
                  type="text"
                  value={form.manufacturerCode}
                  onChange={(e) => set('manufacturerCode', e.target.value.toUpperCase())}
                  placeholder="Örn: BLK-001"
                  maxLength={50}
                  className={cn(FIELD_CLASS, 'font-mono uppercase')}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className={LABEL_CLASS}>HEX Kodu</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={previewHex || '#0F172A'}
                  onChange={(e) => set('hexCode', e.target.value.toUpperCase())}
                  title="Renk seçici"
                  className="w-12 h-11 shrink-0 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1 cursor-pointer"
                />
                <div className="relative flex-1">
                  <Hash className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={form.hexCode}
                    onChange={(e) => set('hexCode', e.target.value.toUpperCase())}
                    placeholder="#1A2B3C"
                    maxLength={7}
                    className={cn(FIELD_CLASS, 'font-mono pl-8', hexError && 'border-rose-400 focus:border-rose-500')}
                  />
                </div>
                {form.hexCode && (
                  <button
                    type="button"
                    onClick={() => set('hexCode', '')}
                    title="HEX'i temizle"
                    className="p-2.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                  >
                    <EyeOff className="w-4 h-4" />
                  </button>
                )}
                <ColorSwatch name={form.name} hexCode={previewHex} size={40} className="rounded-xl" />
              </div>
              <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                RGB değeri HEX'ten sunucuda türetilir, elle girilmez. HEX bilinmiyorsa boş bırakın.
              </p>
              {hexError && <p className="text-[11px] font-bold text-rose-600">{hexError}</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className={LABEL_CLASS}>Pantone Kodu</label>
                <input
                  type="text"
                  value={form.pantoneCode}
                  onChange={(e) => set('pantoneCode', e.target.value.toUpperCase())}
                  placeholder="Örn: 19-4052 TCX"
                  maxLength={50}
                  className={cn(FIELD_CLASS, 'font-mono uppercase')}
                />
              </div>

              <div className="space-y-1.5">
                <label className={LABEL_CLASS}>Durum</label>
                <button
                  type="button"
                  onClick={() => set('isActive', !form.isActive)}
                  className={cn(
                    'w-full rounded-xl px-3.5 py-2.5 text-xs font-black uppercase tracking-wider border transition-colors flex items-center justify-between cursor-pointer',
                    form.isActive
                      ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
                      : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300',
                  )}
                >
                  <span className="flex items-center gap-2">
                    {form.isActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    {form.isActive ? 'Aktif' : 'Pasif'}
                  </span>
                  <span className="text-[10px] font-bold normal-case tracking-normal">
                    {form.isActive ? 'Seçilebilir' : 'Yalnızca mevcut kayıtlarda görünür'}
                  </span>
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className={LABEL_CLASS}>Açıklama</label>
              <textarea
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                placeholder="Örn: Deri tedarikçisi X'in 2024 kataloğundaki siyah tonu"
                rows={2}
                className={cn(FIELD_CLASS, 'resize-none')}
              />
            </div>
          </div>
        </div>
      </form>
    </Modal>
  );
}
