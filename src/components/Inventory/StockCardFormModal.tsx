import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  BookOpen,
  Boxes,
  Building2,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Grid,
  Loader2,
  Palette,
  Plus,
  Sparkles,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import Modal from '../Modal';
import Tabs from '../Common/Tabs';
import Button from '../Common/Button';
import PermissionGate from '../Common/PermissionGate';
import SegmentedFilter from '../Common/SegmentedFilter';
import { Field, Input, Select, Textarea, controlClass } from '../Common/Field';
import { ColorMultiSelect } from '../Colors/ColorSelect';
import ColorSwatch from '../Colors/ColorSwatch';
import { ContactSelect } from '../Contacts/ContactSelect';
import AssortmentTemplatesModal from './AssortmentTemplatesModal';
import { cn } from '../../lib/utils';
import { api, uploadImage } from '../../api/client';
import { showToast } from '../../lib/feedback';
import { settingsService } from '../../services/settingsService';
import { inventoryService } from '../../services/inventoryService';
import { resizeAndOptimizeImage } from '../../utils/imageUtils';
import { CATEGORY_CONFIGS, getProductCategoryType } from './categoryConfig';
import { getCartonSize } from '../../lib/carton';
import type { Account, AssortmentTemplate, BarcodeVariant, ColorMaster, Contact, Product, StockCategoryType } from '../../types';

/* ------------------------------------------------------------------ */
/* Bölüm (step) tanımları                                              */
/* ------------------------------------------------------------------ */

type SectionKey = 'general' | 'features' | 'stock' | 'accounting' | 'images' | 'barcodes';

const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: 'general', label: 'Temel Bilgiler' },
  { key: 'features', label: 'Özellikler' },
  { key: 'stock', label: 'Stok & Satış' },
  { key: 'accounting', label: 'Muhasebe' },
  { key: 'images', label: 'Görseller' },
  { key: 'barcodes', label: 'Barkod' },
];

/** Muhasebe bölümündeki hızlı TDHP şablonları. */
const TDHP_PRESETS = [
  { key: 'mamul', label: 'Mamul (Ayakkabı)', summary: '157 / 600 / 620', accountingCode: '157.01', salesAccountCode: '600.01', purchaseAccountCode: '620.01' },
  { key: 'hammadde', label: 'İlk Madde (Deri/Kumaş)', summary: '150 / 600 / 150', accountingCode: '150.01', salesAccountCode: '600.20', purchaseAccountCode: '150.01' },
  { key: 'yarimamul', label: 'Yarı Mamul (Taban/Mostra)', summary: '152 / 600 / 710', accountingCode: '152.01', salesAccountCode: '600.01', purchaseAccountCode: '710.01' },
  { key: 'ticari', label: 'Ticari Mal / Aksesuar', summary: '153 / 600 / 153', accountingCode: '153.01', salesAccountCode: '600.20', purchaseAccountCode: '153.01' },
] as const;

const VAT_RATES = [0, 1, 10, 20];

const COLOR_HINT_BY_CATEGORY: Record<StockCategoryType, string> = {
  finished: 'Ayakkabı renk varyantları',
  semi_finished: 'Mostra, fuspet, taban renk varyantları',
  raw_material: 'Deri, suni deri, kumaş, astar renkleri',
  accessory: 'Bağcık, toka, iplik, fermuar renkleri',
};

/* ------------------------------------------------------------------ */
/* Yalnız bu form içinde tekrar eden bloklar                            */
/* ------------------------------------------------------------------ */

interface TdhpAccountFieldProps {
  id: string;
  label: string;
  groupHint: string;
  listId: string;
  placeholder: string;
  description: string;
  value: string;
  accounts: Account[] | undefined;
  onChange: (value: string) => void;
}

/**
 * TDHP hesap kodu girişi + durum satırı: kod planda tanımlıysa hesap adı,
 * değilse "kaydedilince otomatik açılacak" bilgisi gösterilir.
 */
function TdhpAccountField({ id, label, groupHint, listId, placeholder, description, value, accounts, onChange }: TdhpAccountFieldProps) {
  const code = (value || '').trim();
  const match = code ? accounts?.find(a => a.code.toLowerCase() === code.toLowerCase()) : undefined;
  return (
    <div className="space-y-2 rounded-card border border-line bg-surface-raised p-3">
      <div className="flex items-start justify-between gap-2">
        <label htmlFor={id} className="text-label font-black uppercase tracking-widest text-fg-muted">{label}</label>
        <span className="shrink-0 text-2xs font-bold text-brand-fg">{groupHint}</span>
      </div>
      <Input
        id={id}
        type="text"
        list={listId}
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className="font-mono"
      />
      {code ? (
        match ? (
          <p className="flex items-center gap-1.5 text-2xs font-bold text-success">
            <span className="h-1.5 w-1.5 shrink-0 rounded-pill bg-success" aria-hidden="true" />
            <span>Tanımlı hesap: {match.name}</span>
          </p>
        ) : (
          <p className="flex items-center gap-1.5 text-2xs font-bold text-brand-fg">
            <Sparkles className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span>Otomatik açılacak — kaydedildiğinde hesap planına eklenir.</span>
          </p>
        )
      ) : (
        <p className="text-2xs font-semibold text-fg-muted">{description}</p>
      )}
    </div>
  );
}

interface BarcodeEntry {
  color: string;
  size?: string;
  barcode: string;
}

interface BarcodeCardListProps {
  items: BarcodeEntry[];
  onChange: (items: BarcodeEntry[]) => void;
  onAdd: () => void;
  addLabel: string;
  emptyText: string;
  scrollable?: boolean;
}

/** Koli ve varyant barkodlarının ortak kart listesi. */
function BarcodeCardList({ items, onChange, onAdd, addLabel, emptyText, scrollable = false }: BarcodeCardListProps) {
  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <p className="rounded-card border border-dashed border-line-strong bg-surface-raised p-6 text-center text-2xs font-semibold text-fg-muted">
          {emptyText}
        </p>
      ) : (
        <div className={cn('grid grid-cols-1 gap-3 md:grid-cols-2', scrollable && 'max-h-72 overflow-y-auto p-0.5')}>
          {items.map((entry, idx) => (
            <div key={`${entry.color}-${entry.size || 'koli'}-${idx}`} className="space-y-1.5 rounded-card border border-line bg-surface-raised p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-label font-black uppercase tracking-wider text-fg-strong">
                  {entry.color}{entry.size ? ` / No: ${entry.size}` : ''} Barkodu
                </span>
                <button
                  type="button"
                  onClick={() => onChange(items.filter((_, i) => i !== idx))}
                  title="Barkodu sil"
                  aria-label={`${entry.color} barkodunu sil`}
                  className="shrink-0 cursor-pointer text-fg-muted transition-colors hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <input
                type="text"
                value={entry.barcode}
                aria-label={`${entry.color} barkod değeri`}
                onChange={e => {
                  const updated = [...items];
                  updated[idx] = { ...updated[idx], barcode: e.target.value };
                  onChange(updated);
                }}
                className={cn(controlClass(), 'h-9 px-2 font-mono text-2xs')}
              />
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={onAdd}
        className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-card border-2 border-dashed border-line-strong py-3 text-xs font-bold text-fg-muted transition-colors hover:border-brand hover:text-brand-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Plus className="h-4 w-4" />
        {addLabel}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Ana bileşen                                                         */
/* ------------------------------------------------------------------ */

interface StockCardFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  editProduct: Product | null;
  initialCategory: StockCategoryType;
  products: Product[] | undefined;
  templates: AssortmentTemplate[] | undefined;
  contacts: Contact[] | undefined;
  tdhpAccounts: Account[] | undefined;
}

interface FormErrors {
  name?: string;
  colors?: string;
  template?: string;
  multiplier?: string;
}

export default function StockCardFormModal({
  isOpen,
  onClose,
  editProduct,
  initialCategory,
  products,
  templates,
  contacts,
  tdhpAccounts,
}: StockCardFormModalProps) {
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // 6 sabit numaralı bölüm. Stepper-sekmeli hibrit: adımlar kilitli değildir,
  // "Kaydet" her bölümde erişilebilirdir; doğrulama adım bazlı değil form bazlıdır.
  const [activeSection, setActiveSection] = useState<SectionKey>('general');
  const [barcodeSubTab, setBarcodeSubTab] = useState<'box' | 'variants'>('box');
  const [errors, setErrors] = useState<FormErrors>({});

  // Asorti (beden x renk matrisi) akisi
  const [assortMode, setAssortMode] = useState(false);
  const [distributeTotal, setDistributeTotal] = useState('120');
  const [savedBanner, setSavedBanner] = useState<{ code: string; mode: 'created' | 'updated' | 'next' | 'assortSaved'; summary?: string } | null>(null);
  const submitIntentRef = useRef<'save' | 'saveNew'>('save');
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Form State for Stock Card
  const [categoryType, setCategoryType] = useState<StockCategoryType>('finished');
  const [hasSizeVariants, setHasSizeVariants] = useState<boolean>(false);
  const [subType, setSubType] = useState<string>('Spor');

  const [productForm, setProductForm] = useState({
    code: '',
    name: '',
    brand: '',
    unit: 'Çift',
    shelf: '',
    location: '',
    stock: 0,
    minStock: 5,
    buyingPrice: 0,
    sellingPrice: 0,
    multiplier: 1,
    secondaryUnit: 'Koli',
    accountingCode: '157.01',
    salesAccountCode: '600.01',
    purchaseAccountCode: '620.01',
    vatRate: 20,
    notes: '',
    preferredSupplierId: undefined as number | undefined
  });

  // Variant & Matrix Data
  // Renkler artık serbest metin değil, merkezi renk kartı seçimidir. Matris,
  // barkod ve renk görselleri renk ADI ile anahtarlandığı için `colors` ve
  // `colorIds` seçilen kartlardan türetilir; kayda yalnızca `colorIds` gider.
  const [selectedColors, setSelectedColors] = useState<ColorMaster[]>([]);
  const colors = useMemo(
    () => selectedColors.map(c => (c.name || '').trim().toUpperCase()).filter(Boolean),
    [selectedColors]
  );
  const colorIds = useMemo(
    () => selectedColors.map(c => Number(c.id)).filter(id => Number.isFinite(id) && id > 0),
    [selectedColors]
  );
  const colorByName = useMemo(() => {
    const map = new Map<string, ColorMaster>();
    selectedColors.forEach(c => map.set((c.name || '').trim().toUpperCase(), c));
    return map;
  }, [selectedColors]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | undefined>(undefined);
  // Bu oturumda oluşturulan şablonlar: SSE refetch'i beklenmeden seçilebilsin.
  const [recentTemplates, setRecentTemplates] = useState<AssortmentTemplate[]>([]);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [colorBoxBarcodes, setColorBoxBarcodes] = useState<{ color: string; barcode: string }[]>([]);
  const [variantBarcodes, setVariantBarcodes] = useState<BarcodeVariant[]>([]);
  const [matrixData, setMatrixData] = useState<Record<string, Record<string, number>>>({});

  // Image upload state
  const [mainImage, setMainImage] = useState<string | undefined>(undefined);
  const [colorImages, setColorImages] = useState<{ color: string; image: string }[]>([]);

  // Yükleme / kayıt göstergeleri
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // Prop olarak gelen şablonlar + bu oturumda yenileri (id'ye göre tekilleştirilmiş).
  const allTemplates = useMemo<AssortmentTemplate[]>(() => {
    const map = new Map<number, AssortmentTemplate>();
    for (const t of templates || []) {
      if (t.id != null) map.set(Number(t.id), t);
    }
    for (const t of recentTemplates) {
      if (t.id != null) map.set(Number(t.id), t);
    }
    return Array.from(map.values());
  }, [templates, recentTemplates]);

  const activeTemplate = allTemplates.find(t => t.id === (selectedTemplateId || editingProduct?.assortmentTemplateId));

  /**
   * Kartın etkin koli içi adedi: asorti toplamı, asorti yoksa koli çarpanı.
   * Hem koli bilgisi zorunluluğu hem de alan ipucu bu değeri kullanır.
   */
  const resolvedCartonSize = useMemo(
    () =>
      getCartonSize(
        {
          assortment: hasSizeVariants ? (activeTemplate?.items || editingProduct?.assortment) : editingProduct?.assortment,
          assortmentTemplateId: hasSizeVariants ? selectedTemplateId : editingProduct?.assortmentTemplateId,
          multiplier: Number(productForm.multiplier) || 1
        } as Product,
        allTemplates
      ),
    [hasSizeVariants, activeTemplate, editingProduct, selectedTemplateId, productForm.multiplier, allTemplates]
  );

  const sectionIndex = SECTIONS.findIndex(s => s.key === activeSection);

  /** Sekme başlığındaki onay işareti: bölümün asgari içeriği dolu mu? */
  const sectionCompleted = useMemo<Record<SectionKey, boolean>>(() => ({
    general: Boolean(productForm.name.trim()),
    features: colors.length > 0,
    stock: Number(productForm.sellingPrice) > 0,
    accounting: Boolean(productForm.accountingCode?.trim() && productForm.salesAccountCode?.trim() && productForm.purchaseAccountCode?.trim()),
    images: Boolean(mainImage) || colorImages.length > 0,
    barcodes: colorBoxBarcodes.length + variantBarcodes.length > 0,
  }), [
    productForm.name, productForm.sellingPrice, productForm.accountingCode,
    productForm.salesAccountCode, productForm.purchaseAccountCode,
    colors.length, mainImage, colorImages.length, colorBoxBarcodes.length, variantBarcodes.length,
  ]);

  /** Kodu aynı olan hesapları teke indirir; üç datalist bu listelerden üretilir. */
  const tdhpLists = useMemo(() => {
    const accounts = tdhpAccounts || [];
    const unique = (list: Account[]) => {
      const seen = new Map<string, Account>();
      list.forEach(a => { if (!seen.has(a.code)) seen.set(a.code, a); });
      return Array.from(seen.values());
    };
    return [
      { id: 'tdhp-stock-accounts', options: unique(accounts.filter(a => a.code.startsWith('15'))) },
      { id: 'tdhp-sales-accounts', options: unique(accounts.filter(a => a.code.startsWith('60'))) },
      { id: 'tdhp-purchase-accounts', options: unique(accounts.filter(a => a.code.startsWith('15') || a.code.startsWith('62') || a.code.startsWith('71'))) },
    ];
  }, [tdhpAccounts]);

  const unitOptions = CATEGORY_CONFIGS[categoryType]?.defaultUnits || ['Çift', 'Adet', 'Kg', 'dm²', 'Metre'];
  const subTypeSuggestions = useMemo(
    () => Array.from(new Set([
      ...(CATEGORY_CONFIGS[categoryType]?.subTypes || []),
      ...(products ? products.map(p => p.subType).filter(Boolean) as string[] : [])
    ])),
    [categoryType, products]
  );

  const resetForm = () => {
    setCategoryType('finished');
    setHasSizeVariants(false);
    setSubType('Spor');
    setProductForm({
      code: '',
      name: '',
      brand: '',
      unit: 'Çift',
      shelf: '',
      location: '',
      stock: 0,
      minStock: 5,
      buyingPrice: 0,
      sellingPrice: 0,
      multiplier: 1,
      secondaryUnit: 'Koli',
      accountingCode: '157.01',
      salesAccountCode: '600.01',
      purchaseAccountCode: '620.01',
      vatRate: 20,
      notes: '',
      preferredSupplierId: undefined
    });
    setSelectedColors([]);
    setSelectedTemplateId(undefined);
    setColorBoxBarcodes([]);
    setVariantBarcodes([]);
    setMatrixData({});
    setMainImage(undefined);
    setColorImages([]);
    setIsEditMode(false);
    setEditingProduct(null);
    setActiveSection('general');
    setBarcodeSubTab('box');
    setErrors({});
    setAssortMode(false);
    setDistributeTotal('120');
    setSavedBanner(null);
  };

  // Change category handler in form — birim ve TDHP kodlarını uygular; asorti/renk otomatik AÇILMAZ
  const applyCategoryChange = (newCat: StockCategoryType) => {
    setCategoryType(newCat);
    const defaults: Record<StockCategoryType, { unit: string; accountingCode: string; salesAccountCode: string; purchaseAccountCode: string }> = {
      finished: { unit: 'Çift', accountingCode: '157.01', salesAccountCode: '600.01', purchaseAccountCode: '620.01' },
      semi_finished: { unit: 'Çift', accountingCode: '152.01', salesAccountCode: '600.01', purchaseAccountCode: '710.01' },
      raw_material: { unit: 'dm²', accountingCode: '150.01', salesAccountCode: '600.20', purchaseAccountCode: '150.01' },
      accessory: { unit: 'Adet', accountingCode: '150.02', salesAccountCode: '600.20', purchaseAccountCode: '150.02' }
    };
    const d = defaults[newCat];
    setProductForm(prev => ({
      ...prev,
      unit: d.unit,
      secondaryUnit: 'Koli',
      multiplier: 1,
      accountingCode: d.accountingCode,
      salesAccountCode: d.salesAccountCode,
      purchaseAccountCode: d.purchaseAccountCode,
      vatRate: 20
    }));
    setSubType(CATEGORY_CONFIGS[newCat]?.subTypes[0] || 'Standart');
    setAssortMode(false);
    setHasSizeVariants(false);
    setBarcodeSubTab('box');
  };

  /**
   * Beden/numara varyantı anahtarı. Yeni kartta açıldığında asorti akışına
   * girilir (renk + şablon doğrulaması devreye girer); kapatıldığında matris
   * üzerinden yürüyen varyant barkodu alt sekmesi de sıfırlanır.
   */
  const handleToggleSizeVariants = () => {
    const next = !hasSizeVariants;
    setHasSizeVariants(next);
    if (next) {
      if (!isEditMode) setAssortMode(true);
    } else {
      setAssortMode(false);
      setBarcodeSubTab('box');
      setErrors(prev => ({ ...prev, template: undefined }));
    }
  };

  // "Asorti Ekle" — beden × renk matrisi akışını başlatır (renk ve numara şablonu zorunlu olur)
  const handleStartAssortment = () => {
    setAssortMode(true);
    setHasSizeVariants(true);
    setActiveSection('features');
  };

  const handleCancelAssortment = () => {
    setAssortMode(false);
    setHasSizeVariants(false);
    setBarcodeSubTab('box');
    setActiveSection('features');
  };

  // Populate form from an existing product (edit mode)
  const populateFromProduct = (product: Product) => {
    setEditingProduct(product);
    setIsEditMode(true);
    setAssortMode(false);
    setSavedBanner(null);
    setErrors({});

    const cat = getProductCategoryType(product);
    setCategoryType(cat);
    setHasSizeVariants(product.hasSizeVariants ?? (cat === 'finished' || Boolean(product.isFootwear && product.assortmentTemplateId)));
    setSubType(product.subType || product.category || (cat === 'finished' ? 'Spor' : 'Standart'));

    setProductForm({
      code: product.code || '',
      name: product.name || '',
      brand: product.brand || '',
      unit: product.unit || 'Çift',
      shelf: product.shelf || '',
      location: product.location || '',
      stock: product.stock || 0,
      minStock: product.minStock || 5,
      buyingPrice: product.buyingPrice || 0,
      sellingPrice: product.sellingPrice || 0,
      multiplier: product.multiplier || 1,
      secondaryUnit: product.secondaryUnit || 'Koli',
      accountingCode: product.accountingCode || (cat === 'finished' ? '157.01' : cat === 'semi_finished' ? '152.01' : '150.01'),
      salesAccountCode: product.salesAccountCode || '600.01',
      purchaseAccountCode: product.purchaseAccountCode || (cat === 'finished' ? '620.01' : '150.01'),
      vatRate: product.vatRate ?? 20,
      notes: product.notes || '',
      preferredSupplierId: product.preferredSupplierId
    });

    setSelectedColors((product.colorRefs || []).map(ref => ({ ...ref })));
    setSelectedTemplateId(product.assortmentTemplateId);
    setColorBoxBarcodes(product.colorBoxBarcodes ? [...product.colorBoxBarcodes] : []);
    setVariantBarcodes(product.variantBarcodes ? [...product.variantBarcodes] : []);
    setMainImage(product.image);
    setColorImages(product.colorImages ? [...product.colorImages] : []);

    // Reconstruct matrix data from variantBarcodes if available
    const matrix: Record<string, Record<string, number>> = {};
    if (product.variantBarcodes && product.variantBarcodes.length > 0) {
      product.variantBarcodes.forEach(vb => {
        if (!matrix[vb.color]) matrix[vb.color] = {};
        matrix[vb.color][vb.size] = vb.stock || 0;
      });
    }
    setMatrixData(matrix);

    setActiveSection('general');
    setBarcodeSubTab('box');
  };

  /**
   * Renk seçimini uygular. Listeden çıkarılan rengin koli/varyant barkodları,
   * renk fotoğrafı ve matris satırları da birlikte temizlenir; böylece seçimi
   * kaldırılan rengin adetleri stok toplamına yetim kayıt olarak yansımaz.
   */
  const applyColorSelection = (selected: ColorMaster[]) => {
    const nextNames = new Set(selected.map(c => (c.name || '').trim().toUpperCase()).filter(Boolean));
    const dropped = new Set(colors.filter(name => !nextNames.has(name)));
    setSelectedColors(selected);
    if (nextNames.size > 0) setErrors(prev => (prev.colors ? { ...prev, colors: undefined } : prev));
    if (dropped.size === 0) return;
    setColorBoxBarcodes(prev => prev.filter(b => !dropped.has((b.color || '').trim().toUpperCase())));
    setVariantBarcodes(prev => prev.filter(v => !dropped.has((v.color || '').trim().toUpperCase())));
    setColorImages(prev => prev.filter(ci => !dropped.has((ci.color || '').trim().toUpperCase())));
    setMatrixData(prev => {
      const next: Record<string, Record<string, number>> = {};
      Object.entries(prev as Record<string, Record<string, number>>).forEach(([colorName, sizes]) => {
        if (!dropped.has(colorName.trim().toUpperCase())) next[colorName] = sizes;
      });
      return next;
    });
  };

  // Image upload
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsUploadingImage(true);
      try {
        const base64 = await resizeAndOptimizeImage(file, { maxWidth: 800, maxHeight: 800, quality: 0.85 });
        // Görsel artık DB'de base64 tutulmaz; sunucuya yüklenip URL saklanır (#51).
        const url = await uploadImage(base64);
        setMainImage(url);
      } catch (err) {
        console.error('Error optimizing image:', err);
        showToast('Görsel işlenirken bir hata oluştu.', 'error');
      } finally {
        setIsUploadingImage(false);
      }
    }
  };

  const handleColorImageUpload = async (color: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsUploadingImage(true);
      try {
        const base64 = await resizeAndOptimizeImage(file, { maxWidth: 800, maxHeight: 800, quality: 0.85 });
        const url = await uploadImage(base64);
        setColorImages(prev => {
          const filtered = prev.filter(ci => ci.color !== color);
          return [...filtered, { color, image: url }];
        });
      } catch (err) {
        console.error('Error optimizing color image:', err);
        showToast('Renk görseli işlenirken bir hata oluştu.', 'error');
      } finally {
        setIsUploadingImage(false);
      }
    }
  };

  // Barcode Generation
  const handleGenerateBarcodes = async () => {
    const effectiveAssortment = activeTemplate ? activeTemplate.items : (editingProduct?.assortment || []);

    const productPayload = {
      isFootwear: hasSizeVariants,
      hasSizeVariants,
      colors: colors.length > 0 ? colors : ['Genel'],
      assortment: effectiveAssortment
    };

    try {
      const { colorBoxBarcodes: generatedBox, variantBarcodes: generatedVar } = await settingsService.generateAutomatedBarcodes(productPayload);

      // Preserve existing stock counts in matrix if any
      const updatedVars = generatedVar.map(gv => {
        const existingStock = matrixData[gv.color]?.[gv.size] || 0;
        return { ...gv, stock: existingStock };
      });

      setColorBoxBarcodes(generatedBox);
      setVariantBarcodes(updatedVars);
    } catch (err) {
      console.error('Barcode generation error:', err);
      showToast('Barkod üretilemedi: ' + ((err as Error)?.message || err), 'error');
    }
  };

  // Auto-distribute total stock proportionally based on template ratios
  const handleAutoDistributeStock = (totalAmount: number) => {
    if (!activeTemplate || activeTemplate.items.length === 0 || colors.length === 0) return;

    const totalRatio = activeTemplate.items.reduce((acc, it) => acc + (it.quantity || 1), 0);
    const amountPerColor = Math.floor(totalAmount / colors.length);

    const newMatrix: Record<string, Record<string, number>> = {};

    colors.forEach(col => {
      newMatrix[col] = {};
      activeTemplate.items.forEach(it => {
        const proportion = it.quantity / totalRatio;
        const itemStock = Math.round(amountPerColor * proportion);
        newMatrix[col][it.size] = itemStock;
      });
    });

    setMatrixData(newMatrix);

    // Update variantBarcodes stocks
    setVariantBarcodes(prev => prev.map(vb => {
      const s = newMatrix[vb.color]?.[vb.size] || 0;
      return { ...vb, stock: s };
    }));

    // Update total stock
    let calculatedTotal = 0;
    Object.values(newMatrix).forEach(sizes => {
      Object.values(sizes).forEach(qty => {
        calculatedTotal += qty;
      });
    });
    setProductForm(prev => ({ ...prev, stock: calculatedTotal }));
  };

  // Form Submit (Add or Edit)
  const handleSubmitProduct = async (e: React.FormEvent) => {
    e.preventDefault();

    const intent = submitIntentRef.current;
    submitIntentRef.current = 'save';

    // Form bazlı doğrulama: hatalar alert() ile değil alanın altında satır
    // içinde gösterilir ve kullanıcı ilgili bölüme taşınır.
    const nextErrors: FormErrors = {};
    if (!productForm.name.trim()) {
      nextErrors.name = 'Malzeme/Ürün adı zorunludur.';
    }
    if (assortMode) {
      if (colors.length === 0) {
        nextErrors.colors = 'Asorti kaydetmek için en az 1 renk seçmelisiniz.';
      } else if (!selectedTemplateId) {
        nextErrors.template = 'Asorti kaydetmek için bir numara (beden) şablonu seçmelisiniz.';
      }
    }

    // Koli bilgisi: koli hesapları ve reçete ambalaj bazı bu değere dayanır.
    if ((categoryType === 'finished' || categoryType === 'semi_finished') && resolvedCartonSize <= 1) {
      nextErrors.multiplier =
        "Koli bilgisi zorunludur: numara (beden) asortisi tanımlayın ya da koli çarpanına koli içi adedi girin (8'li koli için 8).";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setActiveSection(nextErrors.name ? 'general' : (nextErrors.colors || nextErrors.template) ? 'features' : 'stock');
      return;
    }

    let finalCode = productForm.code.trim().toUpperCase();
    if (!finalCode && isEditMode && editingProduct?.code) {
      finalCode = editingProduct.code;
    }
    if (!finalCode) {
      const prefixes: Record<StockCategoryType, string> = { finished: 'MAM', semi_finished: 'YRM', raw_material: 'HMD', accessory: 'AKS' };
      const prefix = prefixes[categoryType] || 'STK';
      const existingCodes = new Set((products || []).map(p => (p.code || '').toUpperCase()));
      let seq = 1;
      do {
        finalCode = `${prefix}-${String(seq).padStart(4, '0')}`;
        seq++;
      } while (existingCodes.has(finalCode));
    }

    const effectiveAssortment = hasSizeVariants ? (activeTemplate ? activeTemplate.items : (editingProduct?.assortment || [])) : undefined;

    // Calculate total stock from matrix if size-variant based
    let finalStock = Number(productForm.stock) || 0;
    let finalVariantBarcodes = variantBarcodes;

    if (hasSizeVariants && Object.keys(matrixData).length > 0) {
      let matrixTotal = 0;
      Object.entries(matrixData).forEach(([col, sizes]) => {
        Object.entries(sizes).forEach(([size, qty]) => {
          matrixTotal += Number(qty) || 0;
        });
      });

      if (matrixTotal > 0 || !isEditMode) {
        finalStock = matrixTotal;
      }

      // Sync variantBarcodes with matrix stocks
      if (finalVariantBarcodes.length > 0) {
        finalVariantBarcodes = finalVariantBarcodes.map(vb => ({
          ...vb,
          stock: matrixData[vb.color]?.[vb.size] !== undefined ? matrixData[vb.color][vb.size] : (vb.stock || 0)
        }));
      }
    }

    const payload: Partial<Product> = {
      code: finalCode,
      name: productForm.name.trim(),
      brand: productForm.brand.trim(),
      categoryType,
      hasSizeVariants,
      subType,
      category: subType,
      unit: productForm.unit,
      secondaryUnit: productForm.secondaryUnit || 'Koli',
      multiplier: Number(productForm.multiplier) || 1,
      stock: finalStock,
      minStock: Number(productForm.minStock) || 0,
      buyingPrice: Number(productForm.buyingPrice) || 0,
      sellingPrice: Number(productForm.sellingPrice) || 0,
      isRawMaterial: categoryType === 'raw_material' || categoryType === 'accessory',
      isFootwear: categoryType === 'finished' || (categoryType === 'semi_finished' && hasSizeVariants),
      shelf: productForm.shelf.trim(),
      location: productForm.location.trim(),
      accountingCode: productForm.accountingCode?.trim() || undefined,
      salesAccountCode: productForm.salesAccountCode?.trim() || undefined,
      purchaseAccountCode: productForm.purchaseAccountCode?.trim() || undefined,
      vatRate: Number(productForm.vatRate) || 20,
      preferredSupplierId: productForm.preferredSupplierId || undefined,
      preferredSupplierName: contacts?.find(c => c.id === productForm.preferredSupplierId)?.name || undefined,
      notes: productForm.notes.trim(),
      colorIds,
      assortmentTemplateId: hasSizeVariants ? selectedTemplateId : undefined,
      assortment: effectiveAssortment,
      colorBoxBarcodes: colorBoxBarcodes.length > 0 ? colorBoxBarcodes : undefined,
      variantBarcodes: finalVariantBarcodes.length > 0 ? finalVariantBarcodes : undefined,
      image: mainImage,
      colorImages: colorImages.length > 0 ? colorImages : undefined,
      updatedAt: new Date()
    };

    setIsSaving(true);
    try {
      if (isEditMode && editingProduct?.id) {
        await inventoryService.updateProduct(editingProduct.id, payload);

        const wasAssort = assortMode;
        setAssortMode(false);
        if (wasAssort) {
          const sizeCount = activeTemplate?.items.length || 0;
          setSavedBanner({
            code: finalCode,
            mode: 'assortSaved',
            summary: `${colors.length} renk × ${sizeCount} numara = ${colors.length * sizeCount} varyant`
          });
        } else {
          setSavedBanner({ code: finalCode, mode: 'updated' });
        }

        const refreshed = await api.products.get(editingProduct.id);
        if (refreshed) setEditingProduct(refreshed);
      } else {
        const createdId = await inventoryService.addProduct({
          ...payload,
          createdAt: new Date()
        });

        if (intent === 'saveNew') {
          const keptCategory = categoryType;
          resetForm();
          applyCategoryChange(keptCategory);
          setSavedBanner({ code: finalCode, mode: 'next' });
          setTimeout(() => nameInputRef.current?.focus(), 80);
        } else {
          // Modal açık kalır; kart düzenleme moduna geçer ve "Asorti Ekle" teklifi gösterilir
          setIsEditMode(true);
          setProductForm(prev => ({ ...prev, code: finalCode }));
          setEditingProduct({ ...(payload as Product), id: Number(createdId), createdAt: new Date() });
          setSavedBanner({ code: finalCode, mode: 'created' });
        }
      }
    } catch (err: any) {
      console.error('Error saving product:', err);
      showToast('Kayıt kaydedilirken bir hata oluştu: ' + (err.message || err), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Open/populate: edit mode fills the form from editProduct, add mode resets it.
  useEffect(() => {
    if (!isOpen) return;
    if (editProduct) {
      populateFromProduct(editProduct);
    } else {
      resetForm();
      applyCategoryChange(initialCategory);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editProduct?.id, initialCategory]);

  const saveLabel = isEditMode
    ? (assortMode ? 'Asortiyi Kaydet' : 'Güncellemeyi Kaydet')
    : (assortMode ? 'Kartı Kaydet ve Matrise Geç' : 'Kartı Envantere Ekle');

  const activePreset = TDHP_PRESETS.find(p =>
    p.accountingCode === productForm.accountingCode?.trim() &&
    p.salesAccountCode === productForm.salesAccountCode?.trim() &&
    p.purchaseAccountCode === productForm.purchaseAccountCode?.trim()
  );

  const goPrev = () => { if (sectionIndex > 0) setActiveSection(SECTIONS[sectionIndex - 1].key); };
  const goNext = () => { if (sectionIndex < SECTIONS.length - 1) setActiveSection(SECTIONS[sectionIndex + 1].key); };

  return (
    <>
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditMode ? `Stok Kartını Düzenle: ${editingProduct?.name}` : 'Yeni Stok Kartı Oluştur'}
      className="max-w-4xl"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" onClick={onClose}>{isEditMode ? 'Kapat' : 'Vazgeç'}</Button>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              icon={<ChevronLeft className="h-3.5 w-3.5" />}
              onClick={goPrev}
              disabled={sectionIndex <= 0}
            >
              Geri
            </Button>
            <Button
              variant="secondary"
              iconRight={<ChevronRight className="h-3.5 w-3.5" />}
              onClick={goNext}
              disabled={sectionIndex >= SECTIONS.length - 1}
            >
              İleri
            </Button>
            {!isEditMode && (
              <Button
                variant="subtle"
                type="submit"
                form="stock-card-form"
                onClick={() => { submitIntentRef.current = 'saveNew'; }}
                title="Kartı kaydeder, formu temizleyip yeni kart için hazır bırakır"
                disabled={isSaving}
              >
                Kaydet ve Yeni
              </Button>
            )}
            <Button
              variant="primary"
              type="submit"
              form="stock-card-form"
              onClick={() => { submitIntentRef.current = 'save'; }}
              loading={isSaving}
            >
              {isSaving ? 'Kaydediliyor…' : saveLabel}
            </Button>
          </div>
        </div>
      }
    >
      <form id="stock-card-form" onSubmit={handleSubmitProduct} noValidate className="space-y-4">
        {/* Kategori birim ve muhasebe varsayılanlarını belirlediği için bölümlerin üstünde sabit durur */}
        <div className="flex flex-col gap-2 rounded-card border border-line bg-surface-raised p-3 sm:flex-row sm:items-center sm:gap-3">
          <div className="flex shrink-0 items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-control bg-brand text-on-brand">
              <Boxes className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <div className="text-label font-black uppercase tracking-widest text-fg-muted">Stok Kategorisi</div>
              <div className="text-2xs font-semibold text-fg-muted">
                {isEditMode ? 'Kategori kayıttan sonra değiştirilemez' : 'Birim ve muhasebe kodları otomatik uygulanır'}
              </div>
            </div>
          </div>
          <Select
            aria-label="Stok kategorisi"
            value={categoryType}
            disabled={isEditMode}
            onChange={e => applyCategoryChange(e.target.value as StockCategoryType)}
            wrapperClassName="sm:max-w-80"
          >
            {(Object.keys(CATEGORY_CONFIGS) as StockCategoryType[]).map(catKey => (
              <option key={catKey} value={catKey}>
                {CATEGORY_CONFIGS[catKey].title}
              </option>
            ))}
          </Select>
        </div>

        <Tabs
          ariaLabel="Stok kartı bölümleri"
          numbered
          size="sm"
          value={activeSection}
          onChange={key => setActiveSection(key as SectionKey)}
          items={SECTIONS.map(s => ({ key: s.key, label: s.label, completed: sectionCompleted[s.key] }))}
        />

        {/* Kayıt / Asorti durum şeridi */}
        {savedBanner && !assortMode && (
          <div className="flex flex-wrap items-center gap-3 rounded-card border border-success/30 bg-success-soft p-3">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
            <div className="min-w-45 flex-1 text-2xs font-bold text-fg-strong">
              {savedBanner.mode === 'next' && (
                <><span className="font-mono">{savedBanner.code}</span> kaydedildi. Yeni kart için formu doldurup kaydedebilirsiniz.</>
              )}
              {savedBanner.mode === 'created' && (
                <><span className="font-mono">{savedBanner.code}</span> kaydedildi. Aynı ekrandan düzenlemeye devam edebilirsiniz.</>
              )}
              {savedBanner.mode === 'updated' && (
                <><span className="font-mono">{savedBanner.code}</span> güncellendi.</>
              )}
              {savedBanner.mode === 'assortSaved' && (
                <>Asorti kaydedildi: <span className="font-mono">{savedBanner.code}</span>{savedBanner.summary ? ` — ${savedBanner.summary}` : ''}.</>
              )}
            </div>
            {(savedBanner.mode === 'created' || savedBanner.mode === 'updated') && !hasSizeVariants && (categoryType === 'finished' || categoryType === 'semi_finished') && (
              <Button variant="primary" size="sm" icon={<Grid className="h-3.5 w-3.5" />} onClick={handleStartAssortment}>
                Asorti Ekle
              </Button>
            )}
          </div>
        )}

        {/* Asorti modu rehberi */}
        {assortMode && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-brand/30 bg-brand-soft p-3">
            <div className="flex items-center gap-2 text-2xs font-bold text-brand-fg">
              <Grid className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Asorti modu: en az 1 renk ve 1 numara şablonu girmelisiniz. "Asortiyi Kaydet" ile tamamlayın.</span>
            </div>
            <Button variant="secondary" size="sm" onClick={handleCancelAssortment}>Asortiden Vazgeç</Button>
          </div>
        )}

        {/* Asorti ekleme teklifi (mevcut kartı düzenlerken) */}
        {!savedBanner && !assortMode && isEditMode && !hasSizeVariants && (categoryType === 'finished' || categoryType === 'semi_finished') && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface-raised p-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-brand text-on-brand">
                <Grid className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-black text-fg-strong">Beden / Numara Asortisi Ekleyin</div>
                <div className="mt-0.5 text-2xs font-semibold text-fg-muted">
                  Stok ve satışı numara bazlı takip etmek isterseniz ekleyin. Suni deri gibi sadece renk gereken ürünlerde gerek yoktur; renkleri "Özellikler" bölümünden girebilirsiniz.
                </div>
              </div>
            </div>
            <Button variant="primary" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={handleStartAssortment}>
              Asorti Ekle
            </Button>
          </div>
        )}

        {/* BÖLÜM 1: TEMEL BİLGİLER */}
        {activeSection === 'general' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Field label="Stok / Malzeme Kodu" htmlFor="scf-code" hint="Boş bırakılırsa kategoriye göre otomatik üretilir">
                <Input
                  id="scf-code"
                  type="text"
                  value={productForm.code}
                  onChange={e => setProductForm(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                  placeholder="Örn: MAM-0012"
                  className="font-mono uppercase"
                />
              </Field>

              <Field
                label="Stok Kartı / Malzeme Adı"
                htmlFor="scf-name"
                required
                error={errors.name}
                className="md:col-span-2"
              >
                <Input
                  id="scf-name"
                  type="text"
                  ref={nameInputRef}
                  invalid={Boolean(errors.name)}
                  value={productForm.name}
                  onChange={e => {
                    setProductForm(prev => ({ ...prev, name: e.target.value }));
                    if (errors.name) setErrors(prev => ({ ...prev, name: undefined }));
                  }}
                  placeholder="Örn: Oxford Deri Klasik Ayakkabı, Termo Taban Siyah..."
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Field label="Marka / Model" htmlFor="scf-brand">
                <Input
                  id="scf-brand"
                  type="text"
                  value={productForm.brand}
                  onChange={e => setProductForm(prev => ({ ...prev, brand: e.target.value }))}
                  placeholder="Örn: ProShoes, DeriSan..."
                />
              </Field>

              <Field label="Ana Birim" htmlFor="scf-unit" required>
                <Select
                  id="scf-unit"
                  value={productForm.unit}
                  onChange={e => setProductForm(prev => ({ ...prev, unit: e.target.value }))}
                >
                  {unitOptions.map(u => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </Select>
              </Field>

              <Field label="Depo Raf / Adres" htmlFor="scf-shelf" hint="Stok listesinde raf bilgisi olarak görünür">
                <Input
                  id="scf-shelf"
                  type="text"
                  value={productForm.shelf}
                  onChange={e => setProductForm(prev => ({ ...prev, shelf: e.target.value }))}
                  placeholder="Örn: A-12, Taban-04..."
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Depo Konumu" htmlFor="scf-location" hint="Raf dışında depo / bölge bilgisi">
                <Input
                  id="scf-location"
                  type="text"
                  value={productForm.location}
                  onChange={e => setProductForm(prev => ({ ...prev, location: e.target.value }))}
                  placeholder="Örn: Ana Depo / Kat 2"
                />
              </Field>

              <Field
                label={
                  <span className="flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Öncelikli Tedarikçi (MRP)
                  </span>
                }
                hint="MRP planında hammadde eksik çıktığında atanacak varsayılan satın alma carisi"
              >
                <ContactSelect
                  className="w-full"
                  contacts={contacts ?? []}
                  value={productForm.preferredSupplierId ?? null}
                  allowTypes={['supplier', 'both']}
                  placeholder="-- Öncelikli Tedarikçi Yok --"
                  emptyOptionLabel="Öncelikli Tedarikçi Yok"
                  onChange={(id) => setProductForm(prev => ({ ...prev, preferredSupplierId: id ?? undefined }))}
                />
              </Field>
            </div>

            {/* Alt Tür (tek noktadan yönetim) */}
            <div className="space-y-2 rounded-card border border-line bg-surface-raised p-3">
              <label htmlFor="scf-subtype" className="flex items-center gap-1.5 text-label font-black uppercase tracking-widest text-brand-fg">
                <Tag className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Malzeme / Ürün Alt Türü</span>
              </label>
              <div className="flex items-center gap-2">
                <Input
                  id="scf-subtype"
                  type="text"
                  list="subtype-suggestions"
                  value={subType}
                  onChange={e => setSubType(e.target.value)}
                  placeholder="Örn: Termo Taban, Vidala Deri, 8mm Eva, Spor..."
                />
                {subType && (
                  <Button
                    variant="secondary"
                    iconOnly
                    onClick={() => setSubType('')}
                    title="Alt türü temizle"
                    aria-label="Alt türü temizle"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              <datalist id="subtype-suggestions">
                {subTypeSuggestions.map(st => (
                  <option key={`gen-st-${st}`} value={st} />
                ))}
              </datalist>
              {(CATEGORY_CONFIGS[categoryType]?.subTypes || []).length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {(CATEGORY_CONFIGS[categoryType]?.subTypes || []).map(st => {
                    const isSelected = subType?.toLowerCase().trim() === st.toLowerCase().trim();
                    return (
                      <button
                        key={`btn-st-${st}`}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => setSubType(st)}
                        className={cn(
                          'cursor-pointer rounded-pill border px-2.5 py-1 text-2xs font-bold transition-colors',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          isSelected
                            ? 'border-brand bg-brand font-black text-on-brand'
                            : 'border-line bg-surface text-fg-muted hover:bg-surface-hover hover:text-fg-strong'
                        )}
                      >
                        {st}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <Field label="Notlar" htmlFor="scf-notes" hint="Yalnızca bu kartta görünür, belgelere taşınmaz">
              <Textarea
                id="scf-notes"
                value={productForm.notes}
                onChange={e => setProductForm(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Ürün hakkında iç notlar, tedarikçi bilgisi, bakım talimatı..."
                className="min-h-16"
              />
            </Field>
          </div>
        )}

        {/* BÖLÜM 2: ÖZELLİKLER */}
        {activeSection === 'features' && (
          <div className="space-y-4">
            <Field
              label={
                <span className="flex items-center gap-1.5">
                  <Palette className="h-3.5 w-3.5" aria-hidden="true" />
                  Renk Varyantları
                </span>
              }
              error={errors.colors}
              hint={`${COLOR_HINT_BY_CATEGORY[categoryType]} — renkler yalnız merkezî renk kartlarından seçilir, listede olmayan renk için seçicideki "Yeni Renk" düğmesini kullanın. Üretim reçetesi, sipariş ve stok hareketlerinde otomatik filtrelenir.`}
            >
              <ColorMultiSelect
                values={colorIds}
                onChange={(_ids, selected) => applyColorSelection(selected)}
                placeholder="Renk kartı seçin... (listedeki renk yoksa 'Yeni Renk' ile tanımlayın)"
              />
            </Field>

            {colors.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {colors.map(col => (
                  <span
                    key={`chip-${col}`}
                    className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface-raised px-2.5 py-1 text-2xs font-black uppercase text-fg-strong"
                  >
                    <ColorSwatch name={col} hexCode={colorByName.get(col)?.hexCode} size={12} className="rounded-pill" />
                    {col}
                  </span>
                ))}
              </div>
            )}

            <button
              type="button"
              role="switch"
              aria-checked={hasSizeVariants}
              onClick={handleToggleSizeVariants}
              className={cn(
                'flex w-full cursor-pointer items-center justify-between gap-3 rounded-card border p-3 text-left transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                hasSizeVariants ? 'border-brand bg-brand-soft' : 'border-line bg-surface-raised hover:bg-surface-hover'
              )}
            >
              <span className="min-w-0">
                <span className={cn('block text-xs font-black', hasSizeVariants ? 'text-brand-fg' : 'text-fg-strong')}>
                  Beden / Numara Varyantları (Asorti)
                </span>
                <span className="mt-0.5 block text-2xs font-semibold text-fg-muted">
                  Açıkken renk × numara matrisi, varyant barkodları ve renk bazlı stok takibi kullanılır.
                </span>
              </span>
              <span
                aria-hidden="true"
                className={cn('relative h-5 w-9 shrink-0 rounded-pill transition-colors', hasSizeVariants ? 'bg-brand' : 'bg-line-strong')}
              >
                <span className={cn('absolute top-0.5 h-4 w-4 rounded-pill bg-white transition-all', hasSizeVariants ? 'left-[18px]' : 'left-0.5')} />
              </span>
            </button>

            {hasSizeVariants && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Field
                    label="Asorti / Numara Şablonu"
                    htmlFor="scf-template"
                    required={assortMode}
                    error={errors.template}
                    hint="Şablon, matris sütunlarını (numaraları) ve koli oranlarını belirler"
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-1">
                        <Select
                          id="scf-template"
                          invalid={Boolean(errors.template)}
                          value={selectedTemplateId || ''}
                          onChange={e => {
                            setSelectedTemplateId(Number(e.target.value) || undefined);
                            if (errors.template) setErrors(prev => ({ ...prev, template: undefined }));
                          }}
                        >
                          <option value="">Şablon Seçiniz</option>
                          {allTemplates.map(t => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </Select>
                      </div>
                      <PermissionGate module="inventory" action="create">
                        <Button
                          type="button"
                          variant="subtle"
                          icon={<Plus className="h-3.5 w-3.5" />}
                          onClick={() => setIsTemplateModalOpen(true)}
                          className="shrink-0"
                        >
                          Yeni Asorti
                        </Button>
                      </PermissionGate>
                    </div>
                  </Field>

                  <Field
                    label="Toplam Stoğu Şablona Göre Dağıt"
                    htmlFor="scf-distribute"
                    hint="Girilen adet, şablon oranlarına göre renk × numara hücrelerine bölünür"
                  >
                    <div className="flex items-center gap-2">
                      <Input
                        id="scf-distribute"
                        type="number"
                        min={0}
                        value={distributeTotal}
                        onChange={e => setDistributeTotal(e.target.value)}
                        className="w-24 font-mono"
                        aria-label="Dağıtılacak toplam stok miktarı"
                      />
                      <Button
                        variant="subtle"
                        icon={<Sparkles className="h-3.5 w-3.5" />}
                        disabled={!activeTemplate || colors.length === 0}
                        onClick={() => {
                          const total = Number(distributeTotal);
                          if (Number.isFinite(total) && total > 0) handleAutoDistributeStock(total);
                        }}
                      >
                        Otomatik Dağıt
                      </Button>
                    </div>
                  </Field>
                </div>

                {/* Canlı matris */}
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="flex items-center gap-2 text-label font-black uppercase tracking-widest text-fg-muted">
                      <Grid className="h-3.5 w-3.5 text-brand-fg" aria-hidden="true" />
                      Canlı Stok Matrisi
                    </h4>
                    <span className="text-2xs font-semibold text-fg-muted">
                      Her numara için başlangıç veya güncel stok adetlerini giriniz
                    </span>
                  </div>

                  <div className="overflow-x-auto rounded-card border border-line bg-surface">
                    <table className="w-full text-2xs">
                      <thead>
                        <tr className="border-b border-line bg-surface-raised">
                          <th className="w-32 p-2.5 text-left text-label font-black uppercase tracking-wider text-fg-muted">
                            Renk / Numara
                          </th>
                          {activeTemplate ? (
                            activeTemplate.items.map((it, idx) => (
                              <th key={idx} className="border-l border-line p-2.5 text-center">
                                <span className="block text-xs font-black text-fg-strong">{it.size}</span>
                                <span className="block text-label font-bold text-fg-muted">Oran: {it.quantity}</span>
                              </th>
                            ))
                          ) : (
                            <th className="p-4 text-center text-2xs font-semibold text-fg-muted italic">
                              Lütfen yukarıdan bir asorti şablonu seçiniz
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {colors.length === 0 ? (
                          <tr>
                            <td colSpan={20} className="p-6 text-center text-2xs font-semibold text-fg-muted italic">
                              Lütfen önce en az 1 renk seçiniz
                            </td>
                          </tr>
                        ) : (
                          colors.map(col => (
                            <tr key={col} className="border-b border-line last:border-0 hover:bg-surface-hover">
                              <td className="p-2.5">
                                <span className="flex items-center gap-2">
                                  <ColorSwatch name={col} hexCode={colorByName.get(col)?.hexCode} size={16} className="rounded" />
                                  <span className="text-2xs font-black uppercase text-fg-strong">{col}</span>
                                </span>
                              </td>
                              {activeTemplate?.items.map((it, sIdx) => (
                                <td key={sIdx} className="border-l border-line p-1">
                                  <input
                                    type="number"
                                    min="0"
                                    placeholder="0"
                                    aria-label={`${col} ${it.size} stok adedi`}
                                    value={matrixData[col]?.[it.size] || ''}
                                    onChange={e => {
                                      const val = Number(e.target.value) || 0;
                                      setMatrixData(prev => ({
                                        ...prev,
                                        [col]: {
                                          ...(prev[col] || {}),
                                          [it.size]: val
                                        }
                                      }));
                                    }}
                                    className={cn(controlClass(), 'h-8 px-1 text-center font-mono text-2xs font-black')}
                                  />
                                </td>
                              ))}
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* BÖLÜM 3: STOK & SATIŞ */}
        {activeSection === 'stock' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Field label="Alış Fiyatı (₺)" htmlFor="scf-buying">
                <Input
                  id="scf-buying"
                  type="number"
                  step="0.01"
                  min={0}
                  value={productForm.buyingPrice}
                  onChange={e => setProductForm(prev => ({ ...prev, buyingPrice: Number(e.target.value) }))}
                  className="font-mono"
                />
              </Field>

              <Field label="Satış Fiyatı (₺)" htmlFor="scf-selling" required>
                <Input
                  id="scf-selling"
                  type="number"
                  step="0.01"
                  min={0}
                  value={productForm.sellingPrice}
                  onChange={e => setProductForm(prev => ({ ...prev, sellingPrice: Number(e.target.value) }))}
                  className="font-mono font-black text-brand-fg"
                />
              </Field>

              <Field
                label={hasSizeVariants ? 'Toplam Stok (Otomatik)' : 'Başlangıç Stoğu'}
                htmlFor="scf-stock"
                hint={hasSizeVariants ? 'Matris toplamından hesaplanır' : `Birim: ${productForm.unit}`}
              >
                <Input
                  id="scf-stock"
                  type="number"
                  min={0}
                  disabled={hasSizeVariants && Object.keys(matrixData).length > 0}
                  value={productForm.stock}
                  onChange={e => setProductForm(prev => ({ ...prev, stock: Number(e.target.value) }))}
                  className="font-mono font-black"
                />
              </Field>

              <Field
                label="Kritik Stok Uyarısı"
                htmlFor="scf-minstock"
                hint="Bu seviyenin altına inince listede kırmızı işaretlenir"
              >
                <Input
                  id="scf-minstock"
                  type="number"
                  min={0}
                  value={productForm.minStock}
                  onChange={e => setProductForm(prev => ({ ...prev, minStock: Number(e.target.value) }))}
                  className="font-mono font-black text-danger"
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field
                label="Koli Çarpanı (Koli İçi Adet)"
                htmlFor="scf-multiplier"
                hint={
                  resolvedCartonSize > 1
                    ? `Koli içi ${resolvedCartonSize} ${productForm.unit || 'Adet'} · asorti toplamı öncelikli, asorti yoksa bu değer kullanılır`
                    : "Asorti tanımlıysa koli içi adet asorti toplamıdır; değilse buraya koli içi adedi yazın (8'li koli için 8)"
                }
                error={errors.multiplier}
              >
                <Input
                  id="scf-multiplier"
                  type="number"
                  min={1}
                  value={productForm.multiplier}
                  invalid={Boolean(errors.multiplier)}
                  onChange={e => {
                    if (errors.multiplier) setErrors(prev => ({ ...prev, multiplier: undefined }));
                    setProductForm(prev => ({ ...prev, multiplier: Number(e.target.value) }));
                  }}
                  className="font-mono"
                />
              </Field>

              <Field
                label="İkincil Birim"
                htmlFor="scf-secondary-unit"
                hint="Koli bazında gösterimde kullanılan birim etiketi (varsayılan: Koli)"
              >
                <Input
                  id="scf-secondary-unit"
                  type="text"
                  list="unit-suggestions"
                  value={productForm.secondaryUnit}
                  onChange={e => setProductForm(prev => ({ ...prev, secondaryUnit: e.target.value }))}
                  placeholder="Örn: Çift, Koli, Adet..."
                />
              </Field>
            </div>
            <datalist id="unit-suggestions">
              {Array.from(new Set(['Çift', 'Adet', 'Kg', 'dm²', 'Metre', 'Koli', ...unitOptions])).map(u => (
                <option key={`unit-${u}`} value={u} />
              ))}
            </datalist>
          </div>
        )}

        {/* BÖLÜM 4: MUHASEBE (TDHP) */}
        {activeSection === 'accounting' && (
          <div className="space-y-4">
            <div className="space-y-3 rounded-card border border-line bg-surface-raised p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-label font-black uppercase tracking-widest text-brand-fg">
                  <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                  Tek Düzen Hesap Planı (TDHP) Entegrasyonu
                </div>
                <span className="rounded-pill border border-line bg-surface px-2.5 py-0.5 text-2xs font-bold text-fg-muted">
                  Otomatik yevmiye eşlemesi
                </span>
              </div>
              <p className="text-2xs font-semibold text-fg-muted">
                Kaydedildiğinde tanımlı olmayan hesaplar (stok, satış geliri, alış/maliyet) hesap planında <strong className="text-fg-strong">otomatik açılır</strong>; fatura ve irsaliyelerde bu kodlar doğrudan yevmiye maddelerine aktarılır.
              </p>

              <div className="space-y-1.5">
                <div className="text-label font-black uppercase tracking-widest text-fg-muted">Hızlı şablon uygula</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:grid-cols-4">
                  {TDHP_PRESETS.map(preset => {
                    const isActive = activePreset?.key === preset.key;
                    return (
                      <button
                        key={preset.key}
                        type="button"
                        aria-pressed={isActive}
                        onClick={() => setProductForm(prev => ({
                          ...prev,
                          accountingCode: preset.accountingCode,
                          salesAccountCode: preset.salesAccountCode,
                          purchaseAccountCode: preset.purchaseAccountCode,
                          vatRate: 20
                        }))}
                        className={cn(
                          'cursor-pointer rounded-control border p-2 text-left transition-colors',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          isActive
                            ? 'border-brand bg-brand text-on-brand'
                            : 'border-line bg-surface hover:border-line-strong hover:bg-surface-hover'
                        )}
                      >
                        <span className={cn('block text-2xs font-black', isActive ? 'text-on-brand' : 'text-fg-strong')}>
                          {preset.label}
                        </span>
                        <span className={cn('block font-mono text-label font-bold', isActive ? 'text-on-brand/80' : 'text-fg-muted')}>
                          {preset.summary}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <TdhpAccountField
                id="scf-acc-stock"
                label="1. Stok Bilanço Hesabı (Aktif)"
                groupHint="150 / 152 / 153 / 157"
                listId="tdhp-stock-accounts"
                placeholder="Örn: 157.01, 150.01..."
                description="Envanter giriş/çıkışlarında borç/alacak çalışan aktif stok hesabı."
                value={productForm.accountingCode}
                accounts={tdhpAccounts}
                onChange={value => setProductForm(prev => ({ ...prev, accountingCode: value }))}
              />
              <TdhpAccountField
                id="scf-acc-sales"
                label="2. Yurtiçi Satış Gelir Hesabı"
                groupHint="600 Grubu"
                listId="tdhp-sales-accounts"
                placeholder="Örn: 600.01 (Mamul Satışları)..."
                description="Satış faturasında alacak kaydı açılacak gelir hesabı."
                value={productForm.salesAccountCode}
                accounts={tdhpAccounts}
                onChange={value => setProductForm(prev => ({ ...prev, salesAccountCode: value }))}
              />
              <TdhpAccountField
                id="scf-acc-purchase"
                label="3. Alış / Maliyet Hesabı"
                groupHint="150 / 620 / 710"
                listId="tdhp-purchase-accounts"
                placeholder="Örn: 620.01 (Mamul Maliyeti) veya 150.01..."
                description="Alış faturasında veya satılan mamul maliyeti mahsubunda kullanılır."
                value={productForm.purchaseAccountCode}
                accounts={tdhpAccounts}
                onChange={value => setProductForm(prev => ({ ...prev, purchaseAccountCode: value }))}
              />

              <div className="space-y-2 rounded-card border border-line bg-surface-raised p-3">
                <div className="flex items-start justify-between gap-2">
                  <label htmlFor="scf-vat" className="text-label font-black uppercase tracking-widest text-fg-muted">
                    4. Varsayılan KDV Oranı (%)
                  </label>
                  <span className="shrink-0 text-2xs font-bold text-brand-fg">391 / 191</span>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    id="scf-vat"
                    type="number"
                    min={0}
                    max={100}
                    value={productForm.vatRate}
                    onChange={e => setProductForm(prev => ({ ...prev, vatRate: Number(e.target.value) }))}
                    className="w-20 font-mono"
                  />
                  <div className="flex flex-1 gap-1.5">
                    {VAT_RATES.map(rate => (
                      <button
                        key={rate}
                        type="button"
                        aria-pressed={productForm.vatRate === rate}
                        onClick={() => setProductForm(prev => ({ ...prev, vatRate: rate }))}
                        className={cn(
                          'flex-1 cursor-pointer rounded-control border py-2 text-2xs font-bold transition-colors',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          productForm.vatRate === rate
                            ? 'border-brand bg-brand font-black text-on-brand'
                            : 'border-line bg-surface text-fg-muted hover:bg-surface-hover hover:text-fg-strong'
                        )}
                      >
                        %{rate}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-2xs font-semibold text-fg-muted">
                  Fatura hesaplamalarında 391 Hesaplanan KDV veya 191 İndirilecek KDV için uygulanır.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* BÖLÜM 5: GÖRSELLER */}
        {activeSection === 'images' && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field label="Ana Katalog Fotoğrafı" htmlFor="scf-image" hint="Kare alanda gösterilir, en fazla 800px olarak saklanır">
              <div className="group relative flex aspect-square items-center justify-center overflow-hidden rounded-card border-2 border-dashed border-line-strong bg-surface-raised transition-colors hover:border-brand">
                {mainImage ? (
                  <>
                    <img src={mainImage} alt="Ana katalog fotoğrafı" className="h-full w-full object-contain" />
                    <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/60 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                      <label className="cursor-pointer rounded-control bg-white px-3 py-1.5 text-xs font-bold text-slate-900">
                        Değiştir
                        <input id="scf-image" type="file" accept="image/*" onChange={handleImageUpload} disabled={isUploadingImage} className="hidden" />
                      </label>
                      <button
                        type="button"
                        onClick={() => setMainImage(undefined)}
                        title="Fotoğrafı kaldır"
                        aria-label="Ana fotoğrafı kaldır"
                        className="cursor-pointer rounded-control bg-danger p-1.5 text-white"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </>
                ) : (
                  <label className={cn('flex flex-col items-center justify-center p-6 text-center', isUploadingImage ? 'cursor-wait' : 'cursor-pointer')}>
                    {isUploadingImage ? (
                      <>
                        <Loader2 className="mb-2 h-8 w-8 animate-spin text-brand-fg" aria-hidden="true" />
                        <span className="text-xs font-bold text-fg-strong">Yükleniyor…</span>
                      </>
                    ) : (
                      <>
                        <Camera className="mb-2 h-8 w-8 text-fg-muted transition-colors group-hover:text-brand-fg" aria-hidden="true" />
                        <span className="text-xs font-bold text-fg-strong">Fotoğraf Yükle</span>
                      </>
                    )}
                    <input id="scf-image" type="file" accept="image/*" onChange={handleImageUpload} disabled={isUploadingImage} className="hidden" />
                  </label>
                )}
              </div>
            </Field>

            <div className="space-y-2 md:col-span-2">
              <div className="text-label font-black uppercase tracking-widest text-fg-muted">Renk Varyantı Fotoğrafları</div>
              {colors.length === 0 ? (
                <div className="rounded-card border border-dashed border-line-strong bg-surface-raised p-8 text-center text-2xs font-semibold text-fg-muted">
                  "Özellikler" bölümünden renk seçtiğinizde renk bazlı fotoğraflar buraya eklenebilir.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:grid-cols-3">
                  {colors.map(col => {
                    const colImg = colorImages.find(ci => ci.color === col)?.image;
                    return (
                      <div key={`img-${col}`} className="space-y-2 rounded-card border border-line bg-surface-raised p-2.5">
                        <div className="flex items-center justify-between gap-2 text-label font-black uppercase tracking-wider text-fg-strong">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <ColorSwatch name={col} hexCode={colorByName.get(col)?.hexCode} size={14} className="shrink-0 rounded" />
                            <span className="truncate">{col}</span>
                          </span>
                          {colImg && (
                            <button
                              type="button"
                              onClick={() => setColorImages(prev => prev.filter(ci => ci.color !== col))}
                              title={`${col} fotoğrafını kaldır`}
                              aria-label={`${col} fotoğrafını kaldır`}
                              className="shrink-0 cursor-pointer text-fg-muted transition-colors hover:text-danger"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                        <label className={cn(
                          'flex aspect-square items-center justify-center overflow-hidden rounded-control border border-dashed border-line-strong bg-surface transition-colors',
                          isUploadingImage ? 'cursor-wait' : 'cursor-pointer hover:border-brand'
                        )}>
                          {isUploadingImage && !colImg ? (
                            <Loader2 className="h-5 w-5 animate-spin text-brand-fg" aria-hidden="true" />
                          ) : colImg ? (
                            <img src={colImg} alt={col} className="h-full w-full object-contain" />
                          ) : (
                            <Camera className="h-5 w-5 text-fg-muted" aria-hidden="true" />
                          )}
                          <input type="file" accept="image/*" onChange={e => handleColorImageUpload(col, e)} disabled={isUploadingImage} className="hidden" />
                        </label>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* BÖLÜM 6: BARKOD */}
        {activeSection === 'barcodes' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <SegmentedFilter
                ariaLabel="Barkod türü"
                size="sm"
                value={barcodeSubTab}
                onChange={key => setBarcodeSubTab(key as 'box' | 'variants')}
                options={[
                  { key: 'box', label: 'Koli / Kutu', count: colorBoxBarcodes.length },
                  ...(hasSizeVariants ? [{ key: 'variants', label: 'Beden & Varyant', count: variantBarcodes.length }] : []),
                ]}
              />
              <Button variant="secondary" icon={<Sparkles className="h-3.5 w-3.5" />} onClick={handleGenerateBarcodes}>
                Otomatik Barkod Üret
              </Button>
            </div>

            {barcodeSubTab === 'box' ? (
              <BarcodeCardList
                items={colorBoxBarcodes}
                onChange={items => setColorBoxBarcodes(items as { color: string; barcode: string }[])}
                onAdd={() => setColorBoxBarcodes(prev => [...prev, { color: colors[0] || 'Genel', barcode: `869${Date.now().toString().slice(-9)}` }])}
                addLabel="Elle Koli Barkodu Ekle"
                emptyText="Henüz koli barkodu yok. Otomatik üretebilir veya elle ekleyebilirsiniz."
              />
            ) : (
              <BarcodeCardList
                items={variantBarcodes}
                onChange={items => setVariantBarcodes(items as BarcodeVariant[])}
                onAdd={() => setVariantBarcodes(prev => [...prev, { color: colors[0] || 'Genel', size: 'Standart', barcode: `869${Date.now().toString().slice(-9)}`, stock: 0 }])}
                addLabel="Elle Varyant Barkodu Ekle"
                emptyText="Henüz varyant barkodu yok. Bir asorti şablonu seçip otomatik üretebilirsiniz."
                scrollable
              />
            )}
          </div>
        )}

        {/* TDHP hesap kodu önerileri — üç hesap alanı da bu listeleri kullanır */}
        {tdhpLists.map(list => (
          <datalist key={list.id} id={list.id}>
            {list.options.map(a => (
              <option key={`${list.id}-${a.id || a.code}`} value={a.code}>{a.name}</option>
            ))}
          </datalist>
        ))}
      </form>
    </Modal>

    <AssortmentTemplatesModal
      isOpen={isTemplateModalOpen}
      nested
      onClose={() => setIsTemplateModalOpen(false)}
      templates={allTemplates}
      onCreated={(t) => {
        setRecentTemplates(prev => [...prev.filter(x => x.id !== t.id), t]);
        if (t.id != null) {
          setSelectedTemplateId(Number(t.id));
          setErrors(prev => ({ ...prev, template: undefined }));
        }
      }}
    />
    </>
  );
}
