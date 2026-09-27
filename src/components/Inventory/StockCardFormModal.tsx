import React, { useState, useRef, useEffect } from 'react';
import {
  BookOpen,
  Boxes,
  Building2,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Grid,
  Palette,
  Plus,
  Sparkles,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import Modal from '../Modal';
import { cn } from '../../lib/utils';
import { api } from '../../api/client';
import { settingsService } from '../../services/settingsService';
import { inventoryService } from '../../services/inventoryService';
import { resizeAndOptimizeImage } from '../../utils/imageUtils';
import { CATEGORY_CONFIGS, getProductCategoryType } from './categoryConfig';
import type { Account, AssortmentTemplate, BarcodeVariant, Contact, Product, StockCategoryType } from '../../types';

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

  // Active Tab inside Add/Edit Modal
  const [activeTab, setActiveTab] = useState<'general' | 'matrix' | 'images' | 'barcodes' | 'accounting'>('general');
  const [barcodeSubTab, setBarcodeSubTab] = useState<'box' | 'variants'>('box');
  const [showColorPanel, setShowColorPanel] = useState(false);

  // Asorti (beden x renk matrisi) akisi
  const [assortMode, setAssortMode] = useState(false);
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
    secondaryUnit: 'Çift',
    accountingCode: '157.01',
    salesAccountCode: '600.01',
    purchaseAccountCode: '620.01',
    vatRate: 20,
    notes: '',
    preferredSupplierId: undefined as number | undefined
  });

  // Variant & Matrix Data
  const [colors, setColors] = useState<string[]>([]);
  const [newColor, setNewColor] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | undefined>(undefined);
  const [colorBoxBarcodes, setColorBoxBarcodes] = useState<{ color: string; barcode: string }[]>([]);
  const [variantBarcodes, setVariantBarcodes] = useState<BarcodeVariant[]>([]);
  const [matrixData, setMatrixData] = useState<Record<string, Record<string, number>>>({});

  // Image upload state
  const [mainImage, setMainImage] = useState<string | undefined>(undefined);
  const [colorImages, setColorImages] = useState<{ color: string; image: string }[]>([]);

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
      secondaryUnit: 'Çift',
      accountingCode: '157.01',
      salesAccountCode: '600.01',
      purchaseAccountCode: '620.01',
      vatRate: 20,
      notes: '',
      preferredSupplierId: undefined
    });
    setColors([]);
    setNewColor('');
    setSelectedTemplateId(undefined);
    setColorBoxBarcodes([]);
    setVariantBarcodes([]);
    setMatrixData({});
    setMainImage(undefined);
    setColorImages([]);
    setIsEditMode(false);
    setEditingProduct(null);
    setActiveTab('general');
    setShowColorPanel(false);
    setAssortMode(false);
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
      secondaryUnit: d.unit,
      multiplier: 1,
      accountingCode: d.accountingCode,
      salesAccountCode: d.salesAccountCode,
      purchaseAccountCode: d.purchaseAccountCode,
      vatRate: 20
    }));
    setSubType(CATEGORY_CONFIGS[newCat]?.subTypes[0] || 'Standart');
    setAssortMode(false);
    setHasSizeVariants(false);
  };

  // "Asorti Ekle" — beden × renk matrisi akışını başlatır (renk ve numara şablonu zorunlu olur)
  const handleStartAssortment = () => {
    setAssortMode(true);
    setHasSizeVariants(true);
    setActiveTab('matrix');
  };

  const handleCancelAssortment = () => {
    setAssortMode(false);
    setHasSizeVariants(false);
    setActiveTab('general');
  };

  // Populate form from an existing product (edit mode)
  const populateFromProduct = (product: Product) => {
    setEditingProduct(product);
    setIsEditMode(true);
    setAssortMode(false);
    setSavedBanner(null);

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
      secondaryUnit: product.secondaryUnit || product.unit || 'Çift',
      accountingCode: product.accountingCode || (cat === 'finished' ? '157.01' : cat === 'semi_finished' ? '152.01' : '150.01'),
      salesAccountCode: product.salesAccountCode || '600.01',
      purchaseAccountCode: product.purchaseAccountCode || (cat === 'finished' ? '620.01' : '150.01'),
      vatRate: product.vatRate ?? 20,
      notes: product.notes || '',
      preferredSupplierId: product.preferredSupplierId
    });

    setColors(product.colors ? [...product.colors] : []);
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

    setActiveTab('general');
  };

  // Color add/remove
  const addColor = () => {
    if (!newColor.trim()) return;
    const clean = newColor.trim().toUpperCase();
    if (!colors.includes(clean)) {
      setColors([...colors, clean]);
    }
    setNewColor('');
  };

  const removeColor = (colorToRemove: string) => {
    setColors(colors.filter(c => c !== colorToRemove));
    setColorBoxBarcodes(colorBoxBarcodes.filter(b => b.color !== colorToRemove));
    setVariantBarcodes(variantBarcodes.filter(v => v.color !== colorToRemove));
    setColorImages(colorImages.filter(ci => ci.color !== colorToRemove));
  };

  // Image upload
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const base64 = await resizeAndOptimizeImage(file, { maxWidth: 800, maxHeight: 800, quality: 0.85 });
        setMainImage(base64);
      } catch (err) {
        console.error('Error optimizing image:', err);
      }
    }
  };

  const handleColorImageUpload = async (color: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const base64 = await resizeAndOptimizeImage(file, { maxWidth: 800, maxHeight: 800, quality: 0.85 });
        setColorImages(prev => {
          const filtered = prev.filter(ci => ci.color !== color);
          return [...filtered, { color, image: base64 }];
        });
      } catch (err) {
        console.error('Error optimizing color image:', err);
      }
    }
  };

  // Barcode Generation
  const handleGenerateBarcodes = async () => {
    const activeTemplate = templates?.find(t => t.id === (selectedTemplateId || editingProduct?.assortmentTemplateId));
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
    }
  };

  // Auto-distribute total stock proportionally based on template ratios
  const handleAutoDistributeStock = (totalAmount: number) => {
    const activeTemplate = templates?.find(t => t.id === (selectedTemplateId || editingProduct?.assortmentTemplateId));
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

    if (!productForm.name.trim()) {
      alert('Lütfen Malzeme/Ürün Adını giriniz.');
      return;
    }

    if (assortMode) {
      if (colors.length === 0) {
        alert('Asorti kaydetmek için en az 1 renk girmelisiniz.');
        setActiveTab('matrix');
        return;
      }
      if (!selectedTemplateId) {
        alert('Asorti kaydetmek için bir numara (beden) şablonu seçmelisiniz.');
        setActiveTab('matrix');
        return;
      }
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

    const activeTemplate = templates?.find(t => t.id === (selectedTemplateId || editingProduct?.assortmentTemplateId));
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
      secondaryUnit: productForm.secondaryUnit || productForm.unit,
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
      colors: colors && colors.length > 0 ? colors : undefined,
      assortmentTemplateId: hasSizeVariants ? selectedTemplateId : undefined,
      assortment: effectiveAssortment,
      colorBoxBarcodes: colorBoxBarcodes.length > 0 ? colorBoxBarcodes : undefined,
      variantBarcodes: finalVariantBarcodes.length > 0 ? finalVariantBarcodes : undefined,
      image: mainImage,
      colorImages: colorImages.length > 0 ? colorImages : undefined,
      updatedAt: new Date()
    };

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
      alert('Kayıt kaydedilirken bir hata oluştu: ' + (err.message || err));
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

  return (
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={isEditMode ? `Stok Kartını Düzenle: ${editingProduct?.name}` : 'Yeni Stok Kartı Oluştur'}
        className="max-w-4xl"
        footer={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-xl font-bold text-xs text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:bg-slate-800 transition-colors"
            >
              {isEditMode ? 'Kapat' : 'Vazgeç'}
            </button>
            {!isEditMode && (
              <button
                type="submit"
                form="stock-card-form"
                onClick={() => { submitIntentRef.current = 'saveNew'; }}
                title="Kartı kaydeder, formu temizleyip yeni kart için hazır bırakır"
                className="bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 px-4 py-2 rounded-xl font-black text-xs uppercase tracking-wider transition-all active:scale-95"
              >
                Kaydet ve Yeni
              </button>
            )}
            <button
              type="submit"
              form="stock-card-form"
              onClick={() => { submitIntentRef.current = 'save'; }}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-xl font-black text-xs uppercase tracking-wider shadow-lg shadow-indigo-600/30 active:scale-95 transition-all"
            >
              {isEditMode
                ? (assortMode ? 'Asortiyi Kaydet' : 'Güncellemeyi Kaydet')
                : (assortMode ? 'Kartı Kaydet ve Matrise Geç' : 'Kartı Envantere Ekle')}
            </button>
          </div>
        }
      >
        <form id="stock-card-form" onSubmit={handleSubmitProduct} className="space-y-6">
          {/* Compact Category Strip (combobox) */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2.5 flex-shrink-0">
              <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm">
                <Boxes className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Stok Kategorisi</div>
                <div className="text-[9px] text-slate-400 font-medium">
                  {isEditMode ? 'Kategori kayıttan sonra değiştirilemez' : 'Birim ve muhasebe kodları otomatik uygulanır'}
                </div>
              </div>
            </div>
            <select
              value={categoryType}
              disabled={isEditMode}
              onChange={e => applyCategoryChange(e.target.value as StockCategoryType)}
              className={cn(
                "flex-1 sm:max-w-[320px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-bold focus:ring-2 focus:ring-indigo-500/20 outline-none",
                isEditMode && "opacity-60 cursor-not-allowed"
              )}
            >
              {(Object.keys(CATEGORY_CONFIGS) as StockCategoryType[]).map(catKey => (
                <option key={catKey} value={catKey}>
                  {CATEGORY_CONFIGS[catKey].title}
                </option>
              ))}
            </select>
          </div>

          {/* Step Tabs Navigation */}
          <div className="flex border-b border-slate-200 dark:border-slate-700/80 gap-6 overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveTab('general')}
              className={cn(
                "pb-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all whitespace-nowrap",
                activeTab === 'general' ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-400 hover:text-slate-600"
              )}
            >
              1. Genel Bilgiler
            </button>
            {hasSizeVariants && (
              <button
                type="button"
                onClick={() => setActiveTab('matrix')}
                className={cn(
                  "pb-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all whitespace-nowrap",
                  activeTab === 'matrix' ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-400 hover:text-slate-600"
                )}
              >
                2. Varyant & Matris
              </button>
            )}
            <button
              type="button"
              onClick={() => setActiveTab('images')}
              className={cn(
                "pb-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all whitespace-nowrap",
                activeTab === 'images' ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-400 hover:text-slate-600"
              )}
            >
              {hasSizeVariants ? '3.' : '2.'} Görsel Galerisi
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('barcodes')}
              className={cn(
                "pb-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all whitespace-nowrap",
                activeTab === 'barcodes' ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-400 hover:text-slate-600"
              )}
            >
              {hasSizeVariants ? '4.' : '3.'} Barkod Yönetimi
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('accounting')}
              className={cn(
                "pb-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all whitespace-nowrap flex items-center gap-1.5",
                activeTab === 'accounting' ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-400 hover:text-slate-600"
              )}
            >
              <BookOpen className="w-3.5 h-3.5" />
              {hasSizeVariants ? '5.' : '4.'} Muhasebe (TDHP)
            </button>
          </div>

          {/* Kayıt / Asorti durum şeridi */}
          {savedBanner && !assortMode && (
            <div className="flex flex-wrap items-center gap-3 p-3 rounded-2xl border bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <div className="text-[11px] font-bold text-emerald-800 dark:text-emerald-200 flex-1 min-w-[180px]">
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
                <button
                  type="button"
                  onClick={handleStartAssortment}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-[11px] uppercase tracking-wide shadow-sm active:scale-95 transition-all"
                >
                  <Grid className="w-3.5 h-3.5" />
                  Asorti Ekle
                </button>
              )}
            </div>
          )}

          {/* Asorti modu rehberi */}
          {assortMode && (
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl border bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800">
              <div className="flex items-center gap-2 text-[11px] font-bold text-indigo-800 dark:text-indigo-200">
                <Grid className="w-4 h-4 shrink-0" />
                <span>Asorti modu: en az 1 renk ve 1 numara şablonu girmelisiniz. "Asortiyi Kaydet" ile tamamlayın.</span>
              </div>
              <button
                type="button"
                onClick={handleCancelAssortment}
                className="px-3 py-1.5 rounded-xl font-bold text-[11px] text-indigo-700 dark:text-indigo-300 bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100/60 transition-colors"
              >
                Asortiden Vazgeç
              </button>
            </div>
          )}

          {/* Asorti ekleme teklifi (mevcut kartı düzenlerken) */}
          {!savedBanner && !assortMode && isEditMode && !hasSizeVariants && (categoryType === 'finished' || categoryType === 'semi_finished') && (
            <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl border bg-gradient-to-r from-indigo-50/80 to-slate-50 dark:from-indigo-950/40 dark:to-slate-900/40 border-indigo-100 dark:border-indigo-900">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm shrink-0">
                  <Grid className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200">Beden / Numara Asortisi Ekleyin</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Stok ve satışı numara bazlı takip etmek isterseniz ekleyin. Suni deri gibi sadece renk gereken ürünlerde gerek yoktur; renkleri "Genel Bilgiler" sekmesindeki renk panelinden girebilirsiniz.
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={handleStartAssortment}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-[11px] uppercase tracking-wide shadow-sm active:scale-95 transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                Asorti Ekle
              </button>
            </div>
          )}

          {/* TAB 1: GENERAL INFO */}
          {activeTab === 'general' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      Stok / Malzeme Kodu
                    </label>
                    <span className="text-[9px] text-indigo-500 font-bold">Boşsa otomatik üretilir</span>
                  </div>
                  <input
                    type="text"
                    value={productForm.code}
                    onChange={e => setProductForm(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                    placeholder="Boş bırakılırsa otomatik kod atanır"
                    className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-bold uppercase focus:bg-white dark:bg-slate-900 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                  />
                </div>

                <div className="md:col-span-2 space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Stok Kartı / Malzeme Adı *
                  </label>
                  <input
                    type="text"
                    required
                    ref={nameInputRef}
                    value={productForm.name}
                    onChange={e => setProductForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Örn: Oxford Deri Klasik Ayakkabı, Termo Taban Siyah, Siyah Vidala Deri..."
                    className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-bold focus:bg-white dark:bg-slate-900 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Marka / Model</label>
                  <input
                    type="text"
                    value={productForm.brand}
                    onChange={e => setProductForm(prev => ({ ...prev, brand: e.target.value }))}
                    placeholder="Örn: ProShoes, DeriSan..."
                    className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-bold focus:bg-white dark:bg-slate-900 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ana Birim *</label>
                  <select
                    value={productForm.unit}
                    onChange={e => setProductForm(prev => ({ ...prev, unit: e.target.value }))}
                    className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-bold focus:bg-white dark:bg-slate-900 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                  >
                    {(CATEGORY_CONFIGS[categoryType]?.defaultUnits || ['Çift', 'Adet', 'Kg', 'dm²', 'Metre']).map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Depo Raf / Adres</label>
                  <input
                    type="text"
                    value={productForm.shelf}
                    onChange={e => setProductForm(prev => ({ ...prev, shelf: e.target.value }))}
                    placeholder="Örn: A-12, Taban-04..."
                    className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-bold focus:bg-white dark:bg-slate-900 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                  />
                </div>
              </div>

              {/* Alt Tür (tek noktadan yönetim) */}
              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
                <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5" />
                  <span>Malzeme / Ürün Alt Türü</span>
                </label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={subType}
                      onChange={e => setSubType(e.target.value)}
                      placeholder="Örn: Termo Taban, Vidala Deri, 8mm Eva, Spor..."
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 dark:text-slate-200 placeholder:text-slate-400 placeholder:font-normal focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none shadow-sm transition-all"
                      list="subtype-suggestions"
                    />
                    <datalist id="subtype-suggestions">
                      {Array.from(new Set([
                        ...(CATEGORY_CONFIGS[categoryType]?.subTypes || []),
                        ...(products ? products.map(p => p.subType).filter(Boolean) as string[] : [])
                      ])).map(st => (
                        <option key={`gen-st-${st}`} value={st} />
                      ))}
                    </datalist>
                  </div>
                  {subType && (
                    <button
                      type="button"
                      onClick={() => setSubType('')}
                      title="Temizle"
                      className="p-2.5 rounded-xl bg-slate-200/70 hover:bg-slate-300 text-slate-600 text-xs font-bold transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {(CATEGORY_CONFIGS[categoryType]?.subTypes || []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {(CATEGORY_CONFIGS[categoryType]?.subTypes || []).map(st => {
                      const isSelected = subType?.toLowerCase().trim() === st.toLowerCase().trim();
                      return (
                        <button
                          key={`btn-st-${st}`}
                          type="button"
                          onClick={() => setSubType(st)}
                          className={cn(
                            "px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all border",
                            isSelected
                              ? "bg-indigo-600 border-indigo-600 text-white shadow-sm font-black"
                              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 hover:bg-slate-100 dark:bg-slate-800 hover:text-slate-900 dark:text-slate-100"
                          )}
                        >
                          {st}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Pricing & Stock Numbers */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Alış Fiyatı (₺)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={productForm.buyingPrice}
                    onChange={e => setProductForm(prev => ({ ...prev, buyingPrice: Number(e.target.value) }))}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-bold outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Satış Fiyatı (₺)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={productForm.sellingPrice}
                    onChange={e => setProductForm(prev => ({ ...prev, sellingPrice: Number(e.target.value) }))}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-bold text-indigo-600 outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                    {hasSizeVariants ? 'Toplam Stok (Oto)' : 'Başlangıç Stoğu'}
                  </label>
                  <input
                    type="number"
                    disabled={hasSizeVariants && Object.keys(matrixData).length > 0}
                    value={productForm.stock}
                    onChange={e => setProductForm(prev => ({ ...prev, stock: Number(e.target.value) }))}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-black outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-rose-500 uppercase tracking-widest">Kritik Stok Uyarısı</label>
                  <input
                    type="number"
                    value={productForm.minStock}
                    onChange={e => setProductForm(prev => ({ ...prev, minStock: Number(e.target.value) }))}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-bold outline-none"
                  />
                </div>
              </div>

              {/* TDHP Muhasebe Özeti & Hızlı Erişim */}
              <div className="p-3.5 bg-gradient-to-r from-indigo-50/80 to-slate-50 rounded-2xl border border-indigo-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black shadow-sm">
                    <BookOpen className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center flex-wrap gap-1.5">
                      <span>TDHP Stok Kodu:</span>
                      <span className="font-mono bg-white dark:bg-slate-900 px-2 py-0.5 rounded border border-indigo-200 text-indigo-700 font-black">
                        {productForm.accountingCode || 'Belirtilmedi'}
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                        | Satış: <span className="font-mono text-slate-700 dark:text-slate-200 font-bold">{productForm.salesAccountCode || '600.01'}</span>
                        | Alış: <span className="font-mono text-slate-700 dark:text-slate-200 font-bold">{productForm.purchaseAccountCode || '150.01'}</span>
                        | KDV: <span className="font-mono text-slate-700 dark:text-slate-200 font-bold">%{productForm.vatRate ?? 20}</span>
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">
                      Fatura ve stok hareketlerinde bu hesap kodlarına otomatik yevmiye kaydı işlenir.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('accounting')}
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all whitespace-nowrap shadow-sm active:scale-95"
                >
                  Hesap Planı Detayları &rarr;
                </button>
              </div>

              {/* Öncelikli Tedarikçi Firma (MRP Malzeme İhtiyaç Otomasyonu) */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 text-indigo-600 flex items-center justify-center font-black">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                      <span>Öncelikli Tedarikçi Firma (MRP Satın Alma)</span>
                      {categoryType === 'raw_material' && (
                        <span className="text-[9px] bg-rose-100 text-rose-700 px-2 py-0.2 rounded font-black uppercase">
                          Hammadde Önerisi
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">
                      MRP üretim planında hammadde eksik çıktığında doğrudan atanacak varsayılan satın alma firması.
                    </p>
                  </div>
                </div>
                <select
                  value={productForm.preferredSupplierId || ''}
                  onChange={e => setProductForm(prev => ({ ...prev, preferredSupplierId: Number(e.target.value) || undefined }))}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-slate-100 min-w-[220px] focus:outline-none"
                >
                  <option value="">-- Öncelikli Tedarikçi Yok --</option>
                  {contacts?.filter(c => c.type === 'supplier' || c.type === 'both').map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Color Options for ALL Categories (collapsible) */}
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowColorPanel(p => !p)}
                  className="w-full p-4 flex items-center justify-between gap-3 text-left"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Palette className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span className="text-[11px] font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                      Renk Seçenekleri & Varyantlar
                    </span>
                    <span className={cn(
                      "text-[10px] font-black px-2.5 py-0.5 rounded-full border shrink-0",
                      colors.length > 0
                        ? "bg-indigo-100 text-indigo-800 border-indigo-200"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700"
                    )}>
                      {colors.length > 0 ? `${colors.length} Renk` : 'Opsiyonel'}
                    </span>
                    {colors.length > 0 && (
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold truncate hidden sm:inline">
                        {colors.join(', ')}
                      </span>
                    )}
                  </div>
                  <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform shrink-0", showColorPanel && "rotate-180")} />
                </button>

                {showColorPanel && (
                  <div className="px-4 pb-4 space-y-3 border-t border-slate-200 dark:border-slate-700 pt-3">
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">
                      {categoryType === 'raw_material' ? 'Deri, Suni Deri, Kumaş, Astar renkleri' :
                       categoryType === 'accessory' ? 'Bağcık, Toka, İplik, Fermuar renkleri' :
                       categoryType === 'semi_finished' ? 'Mostra, Fuspet, Taban renk varyantları' : 'Ayakkabı renk varyantları'}
                    </div>

                    {/* Color Input and Popular Color Badges */}
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Renk adı yazıp Enter'a veya Ekle'ye basınız (Örn: SİYAH, BEYAZ, GRİ, TABA, FÜME)..."
                          value={newColor}
                          onChange={e => setNewColor(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addColor(); } }}
                          className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-bold uppercase focus:bg-white dark:bg-slate-900 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                        />
                        <button
                          type="button"
                          onClick={addColor}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 rounded-xl font-black text-xs uppercase tracking-wider shadow-sm transition-all"
                        >
                          Ekle
                        </button>
                      </div>

                      {/* Quick Color Suggestions */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-1">Hızlı Seçim:</span>
                        {['SİYAH', 'BEYAZ', 'GRİ', 'TABA', 'KAHVE', 'LACİVERT', 'BEJ', 'BORDO', 'HAKİ', 'KIRMIZI', 'HARDAL', 'NUBUK', 'ŞEFFAF'].map(quickCol => {
                          const isAdded = colors.includes(quickCol);
                          return (
                            <button
                              key={quickCol}
                              type="button"
                              onClick={() => {
                                if (isAdded) {
                                  removeColor(quickCol);
                                } else {
                                  setColors([...colors, quickCol]);
                                }
                              }}
                              className={cn(
                                "px-2.5 py-1 rounded-lg text-[10px] font-black uppercase transition-all flex items-center gap-1",
                                isAdded
                                  ? "bg-indigo-600 text-white shadow-sm"
                                  : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 hover:border-indigo-300 hover:text-indigo-600"
                              )}
                            >
                              {quickCol}
                              {isAdded && <X className="w-2.5 h-2.5 ml-0.5 opacity-80" />}
                            </button>
                          );
                        })}
                      </div>

                      {/* Active Selected Colors Chips */}
                      {colors.length > 0 ? (
                        <div className="pt-2 flex flex-wrap gap-2">
                          {colors.map(col => (
                            <span
                              key={col}
                              className="inline-flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-900 border-2 border-indigo-100 rounded-xl text-xs font-black uppercase text-indigo-950 shadow-sm"
                            >
                              <span className="w-2 h-2 rounded-full bg-indigo-600" />
                              {col}
                              <button
                                type="button"
                                onClick={() => removeColor(col)}
                                className="text-slate-400 hover:text-rose-600 transition-colors p-0.5 rounded-md hover:bg-rose-50"
                                title={`${col} rengini kaldır`}
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <div className="text-[11px] text-amber-700 bg-amber-50 p-2.5 rounded-xl border border-amber-200 font-medium">
                          ⚠️ Henüz bir renk eklenmedi. Örnek: Deniz suni deri için yukarıdan <b>SİYAH</b>, <b>BEYAZ</b> ve <b>GRİ</b> renklerini seçebilir veya özel renk yazabilirsiniz.
                        </div>
                      )}
                    </div>

                    <div className="text-[10px] text-slate-400 font-medium">
                      💡 Bu renkler üretim reçetelerinde (BoM), siparişlerde ve stok hareketlerinde otomatik filtrelenir ve malzeme eşleştirmelerinde kullanılır.
                    </div>
                  </div>
                )}
              </div>

              {/* Next Step */}
              <div className="flex justify-end pt-4">
                <button
                  type="button"
                  onClick={() => setActiveTab(hasSizeVariants ? 'matrix' : 'images')}
                  className="flex items-center justify-center gap-2 bg-slate-900 text-white px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider hover:bg-indigo-600 transition-all shadow-md"
                >
                  <span>Sonraki Adım</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: VARIANT & MATRIX */}
          {activeTab === 'matrix' && hasSizeVariants && (
            <div className="space-y-6">
              {/* Color & Template selector */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-700">
                {/* Colors */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                    1. Renk Varyantları
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Örn: Siyah, Kahve, Taba, Beyaz..."
                      value={newColor}
                      onChange={e => setNewColor(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addColor(); } }}
                      className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold uppercase outline-none"
                    />
                    <button
                      type="button"
                      onClick={addColor}
                      className="bg-slate-900 hover:bg-indigo-600 text-white px-4 rounded-xl font-bold text-xs"
                    >
                      Ekle
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {colors.map(col => (
                      <span key={col} className="inline-flex items-center gap-1.5 px-3 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-black uppercase text-slate-700 dark:text-slate-200 shadow-sm">
                        {col}
                        <button type="button" onClick={() => removeColor(col)} className="text-slate-400 hover:text-rose-500">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Assortment Template */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                    2. Asorti / Numara Şablonu
                  </label>
                  <select
                    value={selectedTemplateId || ''}
                    onChange={e => setSelectedTemplateId(Number(e.target.value) || undefined)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-bold outline-none"
                  >
                    <option value="">Şablon Seçiniz</option>
                    {templates?.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>

                  {/* Auto Distribute helper */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        const total = prompt('Dağıtılacak toplam stok miktarını giriniz (Örn: 120):', '120');
                        if (total && !isNaN(Number(total))) {
                          handleAutoDistributeStock(Number(total));
                        }
                      }}
                      className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                    >
                      <Sparkles className="w-3.5 h-3.5" /> Şablon Oranlarına Göre Otomatik Dağıt
                    </button>
                  </div>
                </div>
              </div>

              {/* Live Matrix Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
                    <Grid className="w-4 h-4 text-indigo-600" /> Canlı Stok Matrisi
                  </h4>
                  <div className="text-[10px] text-slate-400 font-bold">
                    Her numara için başlangıç veya güncel stok adetlerini giriniz
                  </div>
                </div>

                <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-2xl bg-white dark:bg-slate-900 shadow-sm">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                        <th className="p-3 text-left font-black text-slate-600 uppercase w-32">Renk / Numara</th>
                        {templates?.find(t => t.id === (selectedTemplateId || editingProduct?.assortmentTemplateId))?.items.map((it, idx) => (
                          <th key={idx} className="p-3 text-center border-l border-slate-200 dark:border-slate-700 font-black text-slate-800 dark:text-slate-200">
                            {it.size}
                            <div className="text-[9px] text-slate-400 font-semibold">Oran: {it.quantity}</div>
                          </th>
                        )) || (
                          <th className="p-6 text-center text-slate-400 font-semibold italic">
                            Lütfen yukarıdan bir Asorti Şablonu seçiniz
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {colors.length === 0 ? (
                        <tr>
                          <td colSpan={20} className="p-8 text-center text-slate-400 font-semibold italic">
                            Lütfen önce en az 1 renk ekleyiniz
                          </td>
                        </tr>
                      ) : (
                        colors.map(col => (
                          <tr key={col} className="border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:bg-slate-800/50/50">
                            <td className="p-3 font-black text-slate-900 dark:text-slate-100 uppercase">{col}</td>
                            {templates?.find(t => t.id === (selectedTemplateId || editingProduct?.assortmentTemplateId))?.items.map((it, sIdx) => (
                              <td key={sIdx} className="p-1.5 border-l border-slate-100 dark:border-slate-800">
                                <input
                                  type="number"
                                  min="0"
                                  placeholder="0"
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
                                  className="w-full text-center py-2 border border-slate-200 dark:border-slate-700 rounded-lg font-black text-slate-800 dark:text-slate-200 focus:bg-indigo-50/50 focus:border-indigo-300 outline-none"
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

              {/* Navigation buttons */}
              <div className="flex justify-between pt-4">
                <button
                  type="button"
                  onClick={() => setActiveTab('general')}
                  className="px-5 py-2.5 rounded-xl font-bold text-xs text-slate-600 hover:bg-slate-100 dark:bg-slate-800"
                >
                  Geri Dön
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('images')}
                  className="flex items-center gap-2 bg-slate-900 text-white px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider hover:bg-indigo-600 transition-all shadow-md"
                >
                  <span>Görsel Adımı</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: IMAGES */}
          {activeTab === 'images' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Main Catalog Image */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Ana Katalog Fotoğrafı
                  </label>
                  <div className="aspect-square bg-slate-50 dark:bg-slate-800/50 border-2 border-dashed border-slate-300 rounded-2xl overflow-hidden relative flex items-center justify-center group hover:border-indigo-400 transition-colors">
                    {mainImage ? (
                      <>
                        <img src={mainImage} alt="Main" className="w-full h-full object-contain" />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                          <label className="cursor-pointer bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-1.5 rounded-lg text-xs font-bold">
                            Değiştir
                            <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                          </label>
                          <button
                            type="button"
                            onClick={() => setMainImage(undefined)}
                            className="bg-rose-600 text-white p-1.5 rounded-lg"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </>
                    ) : (
                      <label className="cursor-pointer flex flex-col items-center justify-center p-6 text-center">
                        <Camera className="w-8 h-8 text-slate-300 mb-2 group-hover:text-indigo-500 transition-colors" />
                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Fotoğraf Yükle</span>
                        <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                      </label>
                    )}
                  </div>
                </div>

                {/* Color-based images */}
                <div className="md:col-span-2 space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Renk Varyantı Fotoğrafları
                  </label>
                  {colors.length === 0 ? (
                    <div className="p-8 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl text-center text-slate-400 text-xs font-semibold">
                      Varyant sekmesinden renk tanımladığınızda renk bazlı fotoğraflar buraya eklenebilir.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {colors.map(col => {
                        const colImg = colorImages.find(ci => ci.color === col)?.image;
                        return (
                          <div key={col} className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl space-y-2">
                            <div className="flex items-center justify-between text-[10px] font-black uppercase text-slate-700 dark:text-slate-200">
                              <span>{col}</span>
                              {colImg && (
                                <button
                                  type="button"
                                  onClick={() => setColorImages(prev => prev.filter(ci => ci.color !== col))}
                                  className="text-rose-500 hover:text-rose-700"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                            <label className="cursor-pointer block aspect-square bg-white dark:bg-slate-900 border border-dashed border-slate-300 rounded-lg overflow-hidden flex items-center justify-center hover:border-indigo-400 transition-colors">
                              {colImg ? (
                                <img src={colImg} alt={col} className="w-full h-full object-contain" />
                              ) : (
                                <Camera className="w-5 h-5 text-slate-300" />
                              )}
                              <input type="file" accept="image/*" onChange={e => handleColorImageUpload(col, e)} className="hidden" />
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Navigation buttons */}
              <div className="flex justify-between pt-4">
                <button
                  type="button"
                  onClick={() => setActiveTab(hasSizeVariants ? 'matrix' : 'general')}
                  className="px-5 py-2.5 rounded-xl font-bold text-xs text-slate-600 hover:bg-slate-100 dark:bg-slate-800"
                >
                  Geri Dön
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('barcodes')}
                  className="flex items-center gap-2 bg-slate-900 text-white px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider hover:bg-indigo-600 transition-all shadow-md"
                >
                  <span>Barkod Yönetimine Geç</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* TAB 4: BARCODES */}
          {activeTab === 'barcodes' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setBarcodeSubTab('box')}
                    className={cn(
                      "px-4 py-2 rounded-xl text-xs font-bold transition-all",
                      barcodeSubTab === 'box' ? "bg-indigo-600 text-white shadow-sm" : "bg-slate-100 dark:bg-slate-800 text-slate-600 hover:bg-slate-200"
                    )}
                  >
                    Koli / Kutu Barkodları
                  </button>
                  {hasSizeVariants && (
                    <button
                      type="button"
                      onClick={() => setBarcodeSubTab('variants')}
                      className={cn(
                        "px-4 py-2 rounded-xl text-xs font-bold transition-all",
                        barcodeSubTab === 'variants' ? "bg-indigo-600 text-white shadow-sm" : "bg-slate-100 dark:bg-slate-800 text-slate-600 hover:bg-slate-200"
                      )}
                    >
                      Beden & Varyant Barkodları
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleGenerateBarcodes}
                  className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-indigo-600 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Otomatik Barkod Üret</span>
                </button>
              </div>

              {/* Barcodes Content */}
              {barcodeSubTab === 'box' ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {colorBoxBarcodes.map((b, idx) => (
                      <div key={idx} className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl space-y-2">
                        <div className="flex items-center justify-between text-xs font-black text-slate-700 dark:text-slate-200 uppercase">
                          <span>{b.color} Koli Barkodu</span>
                          <button
                            type="button"
                            onClick={() => setColorBoxBarcodes(prev => prev.filter((_, i) => i !== idx))}
                            className="text-slate-400 hover:text-rose-500"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <input
                          type="text"
                          value={b.barcode}
                          onChange={e => {
                            const updated = [...colorBoxBarcodes];
                            updated[idx].barcode = e.target.value;
                            setColorBoxBarcodes(updated);
                          }}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 font-mono text-xs font-bold outline-none"
                        />
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => setColorBoxBarcodes(prev => [...prev, { color: colors[0] || 'Genel', barcode: `869${Date.now().toString().slice(-9)}` }])}
                    className="w-full py-3 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-500 dark:text-slate-400 hover:border-indigo-400 hover:text-indigo-600 transition-colors flex items-center justify-center gap-2"
                  >
                    <Plus className="w-4 h-4" /> Elle Koli Barkodu Ekle
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-72 overflow-y-auto p-1">
                    {variantBarcodes.map((v, idx) => (
                      <div key={idx} className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl space-y-1.5">
                        <div className="flex items-center justify-between text-xs font-black text-slate-700 dark:text-slate-200 uppercase">
                          <span>{v.color} / No: {v.size}</span>
                          <button
                            type="button"
                            onClick={() => setVariantBarcodes(prev => prev.filter((_, i) => i !== idx))}
                            className="text-slate-400 hover:text-rose-500"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <input
                          type="text"
                          value={v.barcode}
                          onChange={e => {
                            const updated = [...variantBarcodes];
                            updated[idx].barcode = e.target.value;
                            setVariantBarcodes(updated);
                          }}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 font-mono text-xs font-bold outline-none"
                        />
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => setVariantBarcodes(prev => [...prev, { color: colors[0] || 'Genel', size: 'Standart', barcode: `869${Date.now().toString().slice(-9)}`, stock: 0 }])}
                    className="w-full py-3 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-500 dark:text-slate-400 hover:border-indigo-400 hover:text-indigo-600 transition-colors flex items-center justify-center gap-2"
                  >
                    <Plus className="w-4 h-4" /> Elle Varyant Barkodu Ekle
                  </button>
                </div>
              )}

              {/* Back Navigation */}
              <div className="pt-6 border-t border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setActiveTab('images')}
                  className="px-5 py-2.5 rounded-xl font-bold text-xs text-slate-600 hover:bg-slate-100 dark:bg-slate-800"
                >
                  Geri Dön
                </button>
              </div>
            </div>
          )}

          {/* TAB 5: ACCOUNTING (TDHP) */}
          {activeTab === 'accounting' && (
            <div className="space-y-5">
              {/* Presets / Information Bar */}
              <div className="p-4 bg-indigo-50/60 border border-indigo-200/80 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-black text-indigo-900 uppercase tracking-wider">
                    <BookOpen className="w-4 h-4 text-indigo-600" />
                    Tek Düzen Hesap Planı (TDHP) Entegrasyonu
                  </div>
                  <span className="text-[11px] font-bold text-indigo-600 bg-white dark:bg-slate-900 px-2.5 py-0.5 rounded-full border border-indigo-200">
                    Otomatik Yevmiye Eşlemesi
                  </span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Bu stok kartı kaydedildiğinde, tanımlanan tüm TDHP hesapları (Stok, Satış Geliri ve Alış/Maliyet) Muhasebe Modülünde <strong>otomatik olarak açılır</strong>. Faturalara veya irsaliyelere eklendiğinde ise sistem bu hesap kodlarını doğrudan yevmiye maddelerine aktarır.
                </p>

                {/* Quick Presets */}
                <div className="pt-1">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                    Hızlı Şablon Uygula:
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <button
                      type="button"
                      onClick={() => setProductForm(prev => ({
                        ...prev,
                        accountingCode: '157.01',
                        salesAccountCode: '600.01',
                        purchaseAccountCode: '620.01',
                        vatRate: 20
                      }))}
                      className="p-2 bg-white dark:bg-slate-900 hover:bg-indigo-600 hover:text-white border border-indigo-200/70 rounded-xl text-left transition-all group shadow-sm"
                    >
                      <div className="text-[11px] font-black group-hover:text-white text-indigo-900">Mamul (Ayakkabı)</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 group-hover:text-indigo-100 font-mono">157 / 600 / 620</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setProductForm(prev => ({
                        ...prev,
                        accountingCode: '150.01',
                        salesAccountCode: '600.20',
                        purchaseAccountCode: '150.01',
                        vatRate: 20
                      }))}
                      className="p-2 bg-white dark:bg-slate-900 hover:bg-indigo-600 hover:text-white border border-indigo-200/70 rounded-xl text-left transition-all group shadow-sm"
                    >
                      <div className="text-[11px] font-black group-hover:text-white text-indigo-900">İlk Madde (Deri/Kumaş)</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 group-hover:text-indigo-100 font-mono">150.01 / 600 / 150</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setProductForm(prev => ({
                        ...prev,
                        accountingCode: '152.01',
                        salesAccountCode: '600.01',
                        purchaseAccountCode: '710.01',
                        vatRate: 20
                      }))}
                      className="p-2 bg-white dark:bg-slate-900 hover:bg-indigo-600 hover:text-white border border-indigo-200/70 rounded-xl text-left transition-all group shadow-sm"
                    >
                      <div className="text-[11px] font-black group-hover:text-white text-indigo-900">Yarı Mamul (Taban/Mostra)</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 group-hover:text-indigo-100 font-mono">152.01 / 600 / 710</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setProductForm(prev => ({
                        ...prev,
                        accountingCode: '153.01',
                        salesAccountCode: '600.20',
                        purchaseAccountCode: '153.01',
                        vatRate: 20
                      }))}
                      className="p-2 bg-white dark:bg-slate-900 hover:bg-indigo-600 hover:text-white border border-indigo-200/70 rounded-xl text-left transition-all group shadow-sm"
                    >
                      <div className="text-[11px] font-black group-hover:text-white text-indigo-900">Ticari Mal / Aksesuar</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 group-hover:text-indigo-100 font-mono">153.01 / 600 / 153</div>
                    </button>
                  </div>
                </div>
              </div>

              {/* Form inputs */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. Stok Hesabı */}
                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                      1. Stok Bilanço Hesabı (Aktif)
                    </label>
                    <span className="text-[10px] font-bold text-indigo-600">150, 152, 153, 157 Grubu</span>
                  </div>
                  <input
                    type="text"
                    value={productForm.accountingCode}
                    onChange={e => setProductForm(prev => ({ ...prev, accountingCode: e.target.value }))}
                    list="tdhp-stock-accounts"
                    placeholder="Örn: 157.01, 150.01..."
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-mono font-bold focus:ring-2 focus:ring-indigo-500/20 outline-none"
                  />
                  <div className="text-[11px] mt-1">
                    {productForm.accountingCode?.trim() && (
                      tdhpAccounts?.some(a => a.code.toLowerCase() === productForm.accountingCode.trim().toLowerCase()) ? (
                        <span className="text-emerald-700 font-medium flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Tanımlı TDHP Hesabı: {tdhpAccounts?.find(a => a.code.toLowerCase() === productForm.accountingCode.trim().toLowerCase())?.name}
                        </span>
                      ) : (
                        <span className="text-indigo-700 font-medium flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-indigo-600" />
                          Otomatik Açılacak: Kaydedildiğinde Tek Düzen Hesap Planına eklenecektir.
                        </span>
                      )
                    )}
                    {!productForm.accountingCode?.trim() && (
                      <span className="text-slate-500 dark:text-slate-400">Envanter giriş/çıkışlarında borç/alacak çalışan aktif stok hesabı.</span>
                    )}
                  </div>
                </div>

                {/* 2. Satış Gelir Hesabı */}
                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                      2. Yurtiçi Satış Gelir Hesabı
                    </label>
                    <span className="text-[10px] font-bold text-indigo-600">600 Grubu</span>
                  </div>
                  <input
                    type="text"
                    value={productForm.salesAccountCode}
                    onChange={e => setProductForm(prev => ({ ...prev, salesAccountCode: e.target.value }))}
                    list="tdhp-sales-accounts"
                    placeholder="Örn: 600.01 (Mamul Satışları)..."
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-mono font-bold focus:ring-2 focus:ring-indigo-500/20 outline-none"
                  />
                  <div className="text-[11px] mt-1">
                    {productForm.salesAccountCode?.trim() && (
                      tdhpAccounts?.some(a => a.code.toLowerCase() === productForm.salesAccountCode.trim().toLowerCase()) ? (
                        <span className="text-emerald-700 font-medium flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Tanımlı Gelir Hesabı: {tdhpAccounts?.find(a => a.code.toLowerCase() === productForm.salesAccountCode.trim().toLowerCase())?.name}
                        </span>
                      ) : (
                        <span className="text-indigo-700 font-medium flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-indigo-600" />
                          Otomatik Açılacak: Kaydedildiğinde 600 grubu altına eklenecektir.
                        </span>
                      )
                    )}
                    {!productForm.salesAccountCode?.trim() && (
                      <span className="text-slate-500 dark:text-slate-400">Satış faturasında alacak kaydı açılacak gelir hesabı.</span>
                    )}
                  </div>
                </div>

                {/* 3. Alış / Maliyet Hesabı */}
                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                      3. Alış / Maliyet Hesabı
                    </label>
                    <span className="text-[10px] font-bold text-indigo-600">150, 620, 710 Grubu</span>
                  </div>
                  <input
                    type="text"
                    value={productForm.purchaseAccountCode}
                    onChange={e => setProductForm(prev => ({ ...prev, purchaseAccountCode: e.target.value }))}
                    list="tdhp-purchase-accounts"
                    placeholder="Örn: 620.01 (Mamul Maliyeti) veya 150.01..."
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-mono font-bold focus:ring-2 focus:ring-indigo-500/20 outline-none"
                  />
                  <div className="text-[11px] mt-1">
                    {productForm.purchaseAccountCode?.trim() && (
                      tdhpAccounts?.some(a => a.code.toLowerCase() === productForm.purchaseAccountCode.trim().toLowerCase()) ? (
                        <span className="text-emerald-700 font-medium flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Tanımlı Hesap: {tdhpAccounts?.find(a => a.code.toLowerCase() === productForm.purchaseAccountCode.trim().toLowerCase())?.name}
                        </span>
                      ) : (
                        <span className="text-indigo-700 font-medium flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-indigo-600" />
                          Otomatik Açılacak: Kaydedildiğinde TDHP planına eklenecektir.
                        </span>
                      )
                    )}
                    {!productForm.purchaseAccountCode?.trim() && (
                      <span className="text-slate-500 dark:text-slate-400">Alış faturasında veya satılan mamul maliyeti mahsubunda kullanılır.</span>
                    )}
                  </div>
                </div>

                {/* 4. KDV Oranı (%) */}
                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                      4. Varsayılan KDV Oranı (%)
                    </label>
                    <span className="text-[10px] font-bold text-indigo-600">391 / 191 Hesapları</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={productForm.vatRate}
                      onChange={e => setProductForm(prev => ({ ...prev, vatRate: Number(e.target.value) }))}
                      className="w-24 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-bold focus:ring-2 focus:ring-indigo-500/20 outline-none"
                    />
                    <div className="flex gap-1.5 flex-1">
                      {[0, 1, 10, 20].map(rate => (
                        <button
                          key={rate}
                          type="button"
                          onClick={() => setProductForm(prev => ({ ...prev, vatRate: rate }))}
                          className={cn(
                            "flex-1 py-2 rounded-xl text-xs font-bold border transition-all",
                            productForm.vatRate === rate
                              ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                              : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:bg-slate-800"
                          )}
                        >
                          %{rate}
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Fatura hesaplamalarında 391 Hesaplanan KDV veya 191 İndirilecek KDV için uygulanır.
                  </p>
                </div>
              </div>

              {/* Datalists for Accounts Auto-suggest */}
              <datalist id="tdhp-stock-accounts">
                {tdhpAccounts
                  ?.filter(a => a.code.startsWith('15'))
                  .reduce((acc, a) => acc.some(x => x.code === a.code) ? acc : [...acc, a], [] as typeof tdhpAccounts)
                  .map(a => (
                    <option key={`stk-${a.id || a.code}`} value={a.code}>{a.name}</option>
                  ))}
              </datalist>
              <datalist id="tdhp-sales-accounts">
                {tdhpAccounts
                  ?.filter(a => a.code.startsWith('60'))
                  .reduce((acc, a) => acc.some(x => x.code === a.code) ? acc : [...acc, a], [] as typeof tdhpAccounts)
                  .map(a => (
                    <option key={`sls-${a.id || a.code}`} value={a.code}>{a.name}</option>
                  ))}
              </datalist>
              <datalist id="tdhp-purchase-accounts">
                {tdhpAccounts
                  ?.filter(a => a.code.startsWith('15') || a.code.startsWith('62') || a.code.startsWith('71'))
                  .reduce((acc, a) => acc.some(x => x.code === a.code) ? acc : [...acc, a], [] as typeof tdhpAccounts)
                  .map(a => (
                    <option key={`prc-${a.id || a.code}`} value={a.code}>{a.name}</option>
                  ))}
              </datalist>

              {/* Back Navigation */}
              <div className="pt-6 border-t border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setActiveTab('general')}
                  className="px-5 py-2.5 rounded-xl font-bold text-xs text-slate-600 hover:bg-slate-100 dark:bg-slate-800"
                >
                  Genel Bilgilere Dön
                </button>
              </div>
            </div>
          )}
        </form>
      </Modal>
  );
}
