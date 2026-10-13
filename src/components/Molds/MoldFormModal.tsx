import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { ImageIcon, Plus, Save, Trash2, Upload, Grid } from 'lucide-react';
import Modal from '../Modal';
import Button from '../Common/Button';
import { Field, Input, Select, Textarea } from '../Common/Field';
import { ProductSelect } from '../Common/ProductSelect';
import ContactSelect from '../Contacts/ContactSelect';
import AssortmentTemplatesModal from '../Inventory/AssortmentTemplatesModal';
import { uploadImage } from '../../api/client';
import { resizeAndOptimizeImage } from '../../utils/imageUtils';
import { showToast } from '../../lib/feedback';
import type { AssortmentTemplate, Contact, Mold, Product } from '../../types';

const MOLD_TYPES = ['Bot', 'Çizme', 'Patik', 'Spor', 'Klasik', 'Terlik', 'Sandalet', 'Çocuk', 'İş Güvenliği'];
const CURRENCIES = ['TRY', 'USD', 'EUR'];

export interface MoldFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<Mold>) => Promise<void>;
  initialData?: Mold | null;
  templates: AssortmentTemplate[];
  products: Product[];
  contacts: Contact[];
}

interface FormState {
  code: string;
  name: string;
  moldType: string;
  brand: string;
  material: string;
  supplierId: number | null;
  supplierName: string;
  purchaseCost: string;
  currency: string;
  firstRecordDate: string;
  barcode: string;
  description: string;
  image: string;
  productId: number | null;
  assortmentTemplateId: number | null;
  isActive: boolean;
}

function toForm(mold: Mold | null | undefined): FormState {
  return {
    code: mold?.code || '',
    name: mold?.name || '',
    moldType: mold?.moldType || '',
    brand: mold?.brand || '',
    material: mold?.material || '',
    supplierId: mold?.supplierId ?? null,
    supplierName: mold?.supplierName || '',
    purchaseCost: mold?.purchaseCost != null ? String(mold.purchaseCost) : '',
    currency: mold?.currency || 'TRY',
    firstRecordDate: mold?.firstRecordDate ? String(mold.firstRecordDate).slice(0, 10) : '',
    barcode: mold?.barcode || '',
    description: mold?.description || '',
    image: mold?.image || '',
    productId: mold?.productId ?? null,
    assortmentTemplateId: mold?.assortmentTemplateId ?? null,
    isActive: mold?.isActive == null ? true : Boolean(Number(mold.isActive)),
  };
}

export default function MoldFormModal({
  isOpen,
  onClose,
  onSave,
  initialData,
  templates,
  products,
  contacts,
}: MoldFormModalProps) {
  const [form, setForm] = useState<FormState>(() => toForm(initialData));
  const [recentTemplates, setRecentTemplates] = useState<AssortmentTemplate[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [assortModalOpen, setAssortModalOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setForm(toForm(initialData));
      setErrors({});
      setRecentTemplates([]);
    }
  }, [isOpen, initialData]);

  const allTemplates = useMemo(() => {
    const map = new Map<number, AssortmentTemplate>();
    for (const t of [...templates, ...recentTemplates]) if (t.id != null) map.set(Number(t.id), t);
    return Array.from(map.values());
  }, [templates, recentTemplates]);

  const activeTemplate = allTemplates.find((t) => Number(t.id) === Number(form.assortmentTemplateId)) || null;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleImage = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const base64 = await resizeAndOptimizeImage(file, { maxWidth: 800, maxHeight: 800, quality: 0.85 });
      const url = await uploadImage(base64);
      set('image', url);
    } catch {
      showToast('Kalıp görseli işlenemedi.', 'error');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!form.name.trim()) nextErrors.name = 'Kalıp adı zorunludur.';
    if (form.purchaseCost && Number(form.purchaseCost) < 0) nextErrors.purchaseCost = 'Maliyet negatif olamaz.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    const payload: Partial<Mold> = {
      code: form.code.trim() || undefined,
      name: form.name.trim(),
      moldType: form.moldType.trim() || null,
      brand: form.brand.trim() || null,
      material: form.material.trim() || null,
      supplierId: form.supplierId,
      supplierName: form.supplierName.trim() || null,
      purchaseCost: form.purchaseCost === '' ? null : Number(form.purchaseCost),
      currency: form.currency,
      firstRecordDate: form.firstRecordDate || null,
      barcode: form.barcode.trim() || null,
      description: form.description.trim() || null,
      image: form.image || null,
      productId: form.productId,
      assortmentTemplateId: form.assortmentTemplateId,
      assortment: activeTemplate ? activeTemplate.items : null,
      isActive: form.isActive ? 1 : 0,
    };
    if (initialData?.id) payload.id = initialData.id;

    setSaving(true);
    try {
      await onSave(payload);
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Kalıp kaydedilemedi.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={initialData?.id ? `Kalıp Düzenle — ${initialData.code || initialData.name}` : 'Yeni Kalıp Kartı'}
        size="lg"
        footer={
          <div className="flex items-center justify-between gap-3">
            <span className="text-2xs font-semibold text-fg-muted">
              Kod boş bırakılırsa otomatik üretilir (KLP-…). Numara kümesi seçilen asorti şablonundan türer.
            </span>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={onClose} disabled={saving}>Vazgeç</Button>
              <Button variant="primary" icon={<Save className="h-3.5 w-3.5" />} loading={saving} onClick={handleSubmit}>
                Kaydet
              </Button>
            </div>
          </div>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Görsel + temel kimlik */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="shrink-0">
              <div className="relative h-28 w-28 rounded-card border border-line bg-surface-raised overflow-hidden flex items-center justify-center">
                {form.image ? (
                  <img src={form.image} alt="Kalıp görseli" className="h-full w-full object-contain" />
                ) : (
                  <ImageIcon className="h-8 w-8 text-fg-muted" />
                )}
                {uploading && (
                  <div className="absolute inset-0 bg-surface/70 flex items-center justify-center text-2xs font-bold text-fg-strong">
                    Yükleniyor…
                  </div>
                )}
              </div>
              <div className="mt-2 flex gap-1.5">
                <Button variant="secondary" size="sm" icon={<Upload className="h-3.5 w-3.5" />} onClick={() => fileRef.current?.click()} disabled={uploading}>
                  Yükle
                </Button>
                {form.image && (
                  <Button variant="ghost" size="sm" iconOnly onClick={() => set('image', '')} title="Görseli kaldır">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" onChange={handleImage} className="hidden" />
            </div>

            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Kalıp Kodu" htmlFor="mold-code" hint="Boş → otomatik">
                <Input id="mold-code" value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase())} placeholder="KLP-0001" className="font-mono uppercase" />
              </Field>
              <Field label="Kalıp Adı" htmlFor="mold-name" required error={errors.name}>
                <Input id="mold-name" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Örn: PTK Patik 26-30" invalid={!!errors.name} />
              </Field>
              <Field label="Kalıp Tipi" htmlFor="mold-type">
                <Input id="mold-type" list="mold-type-options" value={form.moldType} onChange={(e) => set('moldType', e.target.value)} placeholder="Bot / Spor / Patik…" />
                <datalist id="mold-type-options">
                  {MOLD_TYPES.map((t) => <option key={t} value={t} />)}
                </datalist>
              </Field>
              <Field label="Marka / Seri" htmlFor="mold-brand">
                <Input id="mold-brand" value={form.brand} onChange={(e) => set('brand', e.target.value)} placeholder="Örn: Kinetiq" />
              </Field>
              <Field label="Malzeme" htmlFor="mold-material">
                <Input id="mold-material" value={form.material} onChange={(e) => set('material', e.target.value)} placeholder="Örn: Polietilen" />
              </Field>
              <Field label="Barkod" htmlFor="mold-barcode">
                <Input id="mold-barcode" value={form.barcode} onChange={(e) => set('barcode', e.target.value)} placeholder="Kart/karekod" className="font-mono" />
              </Field>
            </div>
          </div>

          {/* Asorti bağı */}
          <div className="rounded-card border border-line bg-surface-raised p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-fg-muted">
                <Grid className="h-4 w-4 text-brand" />
                Numara Asortisi
              </div>
              <Button variant="secondary" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setAssortModalOpen(true)}>
                Yeni Asorti
              </Button>
            </div>
            <Field label="Asorti Şablonu" htmlFor="mold-assort" hint="Kalıbın numara kümesi bu şablondan türer; stok ve hareketler bu numaralarla izlenir.">
              <Select
                id="mold-assort"
                value={form.assortmentTemplateId ?? ''}
                onChange={(e) => set('assortmentTemplateId', e.target.value === '' ? null : Number(e.target.value))}
              >
                <option value="">— Asorti şablonu seçilmedi —</option>
                {allTemplates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </Select>
            </Field>
            {activeTemplate && (
              <div className="flex flex-wrap gap-1.5">
                {activeTemplate.items.map((it) => (
                  <span key={it.size} className="inline-flex items-center gap-1 rounded-md bg-brand-soft px-2 py-0.5 text-2xs font-bold text-brand-fg">
                    {it.size}
                    <span className="font-mono text-fg-muted">×{it.quantity}</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Tedarik / maliyet / bağlantılar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Tedarikçi / Fason Cari" htmlFor="mold-supplier">
              <ContactSelect
                contacts={contacts}
                value={form.supplierId}
                allowTypes={['supplier', 'both']}
                createType="supplier"
                placeholder="Cari seçin…"
                onChange={(id, contact) => {
                  setForm((prev) => ({ ...prev, supplierId: id, supplierName: contact?.name || '' }));
                }}
              />
            </Field>
            <Field label="Bağlı Stok Kartı" htmlFor="mold-product">
              <ProductSelect
                products={products}
                value={form.productId}
                showStock={false}
                placeholder="Ürün bağla (opsiyonel)…"
                onChange={(id) => set('productId', id)}
              />
            </Field>
            <Field label="Alış Maliyeti" htmlFor="mold-cost" error={errors.purchaseCost}>
              <Input id="mold-cost" type="number" min="0" step="0.01" value={form.purchaseCost} onChange={(e) => set('purchaseCost', e.target.value)} placeholder="0,00" invalid={!!errors.purchaseCost} />
            </Field>
            <Field label="Para Birimi" htmlFor="mold-currency">
              <Select id="mold-currency" value={form.currency} onChange={(e) => set('currency', e.target.value)}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </Field>
            <Field label="İlk Kayıt Tarihi" htmlFor="mold-date">
              <Input id="mold-date" type="date" value={form.firstRecordDate} onChange={(e) => set('firstRecordDate', e.target.value)} />
            </Field>
            <Field label="Durum" htmlFor="mold-active">
              <Select id="mold-active" value={form.isActive ? '1' : '0'} onChange={(e) => set('isActive', e.target.value === '1')}>
                <option value="1">Aktif</option>
                <option value="0">Pasif</option>
              </Select>
            </Field>
          </div>

          <Field label="Açıklama / Not" htmlFor="mold-desc">
            <Textarea id="mold-desc" value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Kalıp hakkında notlar…" />
          </Field>
        </form>
      </Modal>

      {assortModalOpen && (
        <AssortmentTemplatesModal
          isOpen
          nested
          templates={allTemplates}
          onClose={() => setAssortModalOpen(false)}
          onCreated={(t) => {
            setRecentTemplates((prev) => [...prev.filter((x) => Number(x.id) !== Number(t.id)), t]);
            set('assortmentTemplateId', Number(t.id));
          }}
        />
      )}
    </>
  );
}
