import React, { useState, useMemo, useEffect } from 'react';
import { 
  Search, 
  Package, 
  X, 
  Check, 
  Plus, 
  Minus, 
  Boxes, 
  Layers, 
  Tag, 
  Sparkles, 
  CheckCircle2, 
  Info,
  DollarSign, 
  SlidersHorizontal,
  ChevronRight,
  Palette,
  LayoutGrid,
  Filter
} from 'lucide-react';
import Modal from '../Modal';
import { cn } from '../../lib/utils';
import { getColorSwatch } from '../../lib/colorSwatches';
import type { Product, AssortmentTemplate, StockCategoryType } from '../../types';

interface ProductSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddItem: (item: {
    productId: number;
    name: string;
    code: string;
    color?: string;
    size?: string;
    isFootwear?: boolean;
    assortmentTemplateId?: number;
    pairsPerBox?: number;
    boxCount?: number;
    quantity: number;
    unitPrice: number;
    taxRate: number;
    discountRate: number;
    total: number;
    unit?: string;
    moldCode?: string;
    matrixBreakdown?: { [size: string]: number };
    notes?: string;
  }) => void;
  orderType: 'sales' | 'purchase';
  products: Product[];
  templates: AssortmentTemplate[];
}

export default function ProductSelectorModal({
  isOpen,
  onClose,
  onAddItem,
  orderType,
  products,
  templates
}: ProductSelectorModalProps) {
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [onlyInStock, setOnlyInStock] = useState(false);
  
  // Selected Product State
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedColor, setSelectedColor] = useState<string>('');
  const [customColor, setCustomColor] = useState<string>('');
  const [isCustomColorMode, setIsCustomColorMode] = useState(false);

  // Quantity Management Modes: 'direct' | 'box' | 'matrix'
  const [quantityMode, setQuantityMode] = useState<'direct' | 'box' | 'matrix'>('direct');
  const [quantity, setQuantity] = useState<number>(1);
  const [boxCount, setBoxCount] = useState<number>(1);
  const [matrixValues, setMatrixValues] = useState<{ [size: string]: number }>({});
  
  // Pricing & Taxation
  const [unitPrice, setUnitPrice] = useState<number>(0);
  const [discountRate, setDiscountRate] = useState<number>(0);
  const [taxRate, setTaxRate] = useState<number>(20);
  const [itemNotes, setItemNotes] = useState<string>('');
  const [recentlyAddedBadge, setRecentlyAddedBadge] = useState(false);

  // Reset or initialize on product selection
  const handleSelectProduct = (p: Product) => {
    setSelectedProduct(p);
    
    // Determine colors
    const colorsList = p.colors || [];
    const firstColor = colorsList.length > 0 ? colorsList[0] : '';
    setSelectedColor(firstColor);
    setCustomColor('');
    setIsCustomColorMode(false);

    // Initial pricing
    const defaultPrice = orderType === 'sales' ? (p.sellingPrice || 0) : (p.buyingPrice || 0);
    setUnitPrice(defaultPrice);
    setDiscountRate(0);
    setTaxRate(p.vatRate ?? 20);
    setItemNotes('');

    // Template and quantity determination
    const template = p.assortmentTemplateId ? templates.find(t => t.id === p.assortmentTemplateId) : null;
    const pairsPerBox = template 
      ? template.items.reduce((s, it) => s + it.quantity, 0)
      : (p.assortment ? p.assortment.reduce((s, it) => s + it.quantity, 0) : 0);

    if (p.isFootwear && pairsPerBox > 0) {
      setQuantityMode('box');
      setBoxCount(1);
      setQuantity(pairsPerBox);
      
      // Initialize matrix values from template
      const matrix: { [size: string]: number } = {};
      if (template) {
        template.items.forEach(it => {
          matrix[it.size] = it.quantity;
        });
      } else if (p.assortment) {
        p.assortment.forEach(it => {
          matrix[it.size] = it.quantity;
        });
      }
      setMatrixValues(matrix);
    } else {
      setQuantityMode('direct');
      setBoxCount(1);
      setQuantity(1);
      setMatrixValues({});
    }
  };

  // Sync box count and quantity
  const handleBoxCountChange = (val: number) => {
    const newBoxes = Math.max(1, val);
    setBoxCount(newBoxes);

    if (selectedProduct) {
      const template = selectedProduct.assortmentTemplateId ? templates.find(t => t.id === selectedProduct.assortmentTemplateId) : null;
      const pairsPerBox = template 
        ? template.items.reduce((s, it) => s + it.quantity, 0)
        : (selectedProduct.assortment ? selectedProduct.assortment.reduce((s, it) => s + it.quantity, 0) : 0);
      
      if (pairsPerBox > 0) {
        setQuantity(newBoxes * pairsPerBox);
        // update matrix
        const newMatrix: { [size: string]: number } = {};
        const items = template ? template.items : (selectedProduct.assortment || []);
        items.forEach(it => {
          newMatrix[it.size] = it.quantity * newBoxes;
        });
        setMatrixValues(newMatrix);
      }
    }
  };

  // Direct quantity change
  const handleQuantityChange = (val: number) => {
    const newQty = Math.max(1, val);
    setQuantity(newQty);

    if (selectedProduct) {
      const template = selectedProduct.assortmentTemplateId ? templates.find(t => t.id === selectedProduct.assortmentTemplateId) : null;
      const pairsPerBox = template 
        ? template.items.reduce((s, it) => s + it.quantity, 0)
        : (selectedProduct.assortment ? selectedProduct.assortment.reduce((s, it) => s + it.quantity, 0) : 0);

      if (pairsPerBox > 0) {
        setBoxCount(Math.max(1, Math.round(newQty / pairsPerBox)));
      }
    }
  };

  // Matrix item change
  const handleMatrixSizeChange = (size: string, val: number) => {
    const newMatrix = { ...matrixValues, [size]: Math.max(0, val) };
    setMatrixValues(newMatrix);
    const sum = (Object.values(newMatrix) as number[]).reduce((a, b) => (Number(a) || 0) + (Number(b) || 0), 0);
    setQuantity(Math.max(1, sum));
  };

  // Filter products
  const filteredProducts = useMemo(() => {
    if (!products) return [];
    return products.filter(p => {
      // Category filter
      if (activeCategory === 'finished' && p.categoryType !== 'finished' && !p.isFootwear && p.isRawMaterial) return false;
      if (activeCategory === 'semi_finished' && p.categoryType !== 'semi_finished') return false;
      if (activeCategory === 'raw_material' && p.categoryType !== 'raw_material' && !p.isRawMaterial) return false;
      if (activeCategory === 'accessory' && p.categoryType !== 'accessory') return false;

      // In stock only
      if (onlyInStock && (p.stock || 0) <= 0) return false;

      // Search term
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchCode = p.code.toLowerCase().includes(term);
        const matchName = p.name.toLowerCase().includes(term);
        const matchMold = p.moldCode?.toLowerCase().includes(term) || p.moldGroup?.toLowerCase().includes(term);
        const matchBrand = p.brand?.toLowerCase().includes(term);
        const matchSubType = p.subType?.toLowerCase().includes(term);
        const matchColor = p.colors?.some(c => c.toLowerCase().includes(term));
        if (!matchCode && !matchName && !matchMold && !matchBrand && !matchSubType && !matchColor) {
          return false;
        }
      }
      return true;
    });
  }, [products, activeCategory, onlyInStock, searchTerm]);

  // Current selected template / assortment info
  const currentTemplate = useMemo(() => {
    if (!selectedProduct?.assortmentTemplateId) return null;
    return templates.find(t => t.id === selectedProduct.assortmentTemplateId) || null;
  }, [selectedProduct, templates]);

  const pairsPerBox = useMemo(() => {
    if (currentTemplate) {
      return currentTemplate.items.reduce((s, it) => s + it.quantity, 0);
    }
    if (selectedProduct?.assortment) {
      return selectedProduct.assortment.reduce((s, it) => s + it.quantity, 0);
    }
    return 0;
  }, [currentTemplate, selectedProduct]);

  // Calculation summaries
  const effectiveColor = isCustomColorMode ? customColor.trim() : selectedColor;
  const lineSubtotal = quantity * unitPrice;
  const discountAmount = lineSubtotal * (discountRate / 100);
  const discountedNet = lineSubtotal - discountAmount;
  const taxAmount = discountedNet * (taxRate / 100);
  const lineGrandTotal = discountedNet + taxAmount;

  // Add Item to cart
  const handleAddCurrentProduct = () => {
    if (!selectedProduct) return;
    if (quantity <= 0) {
      alert('Lütfen geçerli bir miktar giriniz.');
      return;
    }

    onAddItem({
      productId: selectedProduct.id!,
      name: selectedProduct.name,
      code: selectedProduct.code,
      color: effectiveColor || undefined,
      isFootwear: selectedProduct.isFootwear,
      assortmentTemplateId: selectedProduct.assortmentTemplateId,
      pairsPerBox: pairsPerBox > 0 ? pairsPerBox : undefined,
      boxCount: pairsPerBox > 0 ? boxCount : undefined,
      quantity,
      unitPrice,
      taxRate,
      discountRate,
      total: lineGrandTotal,
      unit: selectedProduct.unit || 'Çift',
      moldCode: selectedProduct.moldCode,
      matrixBreakdown: Object.keys(matrixValues).length > 0 ? matrixValues : undefined,
      notes: itemNotes.trim() || undefined
    });

    // Flash feedback
    setRecentlyAddedBadge(true);
    setTimeout(() => {
      setRecentlyAddedBadge(false);
    }, 1500);
  };

  // Helper color swatch
  const getColorStyle = (colName: string) => getColorSwatch(colName);

  // Selected color image if any
  const currentColorImage = useMemo(() => {
    if (!selectedProduct) return null;
    if (effectiveColor && selectedProduct.colorImages && selectedProduct.colorImages.length > 0) {
      const match = selectedProduct.colorImages.find(ci => ci.color.toLowerCase() === effectiveColor.toLowerCase());
      if (match?.image) return match.image;
    }
    return selectedProduct.image || null;
  }, [selectedProduct, effectiveColor]);

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      if (products.length > 0 && !selectedProduct) {
        handleSelectProduct(products[0]);
      }
    }
  }, [isOpen, products]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Siparişe Ürün / Stok & Renk Seçimi"
      size="3xl"
    >
      <div className="space-y-4 -mt-2">
        {/* Top Filter Tabs & Quick Search */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-slate-100 dark:bg-slate-800/80 p-2.5 rounded-2xl border border-slate-200 dark:border-slate-700">
          {/* Category Tabs */}
          <div className="flex flex-wrap items-center gap-1">
            {[
              { id: 'all', label: 'Tümü' },
              { id: 'finished', label: '👞 Mamul Ayakkabı' },
              { id: 'semi_finished', label: '⚙️ Yarı Mamul' },
              { id: 'raw_material', label: '🧱 Hammadde' },
              { id: 'accessory', label: '🏷️ Aksesuar & Kutu' }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveCategory(tab.id)}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer",
                  activeCategory === tab.id
                    ? "bg-white dark:bg-slate-900 text-indigo-700 shadow-xs border border-slate-200 dark:border-slate-700"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-100 hover:bg-white dark:bg-slate-900/50"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Box & In-stock toggle */}
          <div className="flex items-center gap-2">
            <div className="relative min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Model, kod, kalıp, renk ara..."
                className="w-full pl-9 pr-7 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200 placeholder-slate-400 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setOnlyInStock(!onlyInStock)}
              className={cn(
                "px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer whitespace-nowrap flex items-center gap-1",
                onlyInStock
                  ? "bg-emerald-600 border-emerald-600 text-white"
                  : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 hover:bg-slate-50 dark:bg-slate-800/50"
              )}
              title="Sadece mevcut stoğu 0'dan büyük olan ürünleri filtrele"
            >
              <Check className={cn("w-3 h-3", onlyInStock ? "opacity-100" : "opacity-0")} />
              <span>Stoktakiler</span>
            </button>
          </div>
        </div>

        {/* Main 2-Column Split Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-[480px]">
          {/* Left Column: Product List Browser (5 cols) */}
          <div className="lg:col-span-5 flex flex-col space-y-2 border border-slate-200 dark:border-slate-700 rounded-2xl bg-white dark:bg-slate-900 p-2.5 shadow-2xs">
            <div className="flex items-center justify-between px-2 py-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
              <span>Ürün Listesi ({filteredProducts.length})</span>
              <span>{orderType === 'sales' ? 'Satış Fiyatı' : 'Alış Fiyatı'}</span>
            </div>

            <div className="overflow-y-auto max-h-[500px] space-y-1.5 pr-1">
              {filteredProducts.length === 0 ? (
                <div className="p-8 text-center text-slate-400 space-y-2">
                  <Package className="w-8 h-8 mx-auto opacity-40" />
                  <p className="text-xs font-bold">Aradığınız kriterde ürün bulunamadı.</p>
                </div>
              ) : (
                filteredProducts.map(p => {
                  const isSelected = selectedProduct?.id === p.id;
                  const price = orderType === 'sales' ? p.sellingPrice : p.buyingPrice;
                  const hasStock = (p.stock || 0) > 0;

                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSelectProduct(p)}
                      className={cn(
                        "w-full text-left p-3 rounded-xl border transition-all flex items-start justify-between gap-2.5 cursor-pointer relative",
                        isSelected
                          ? "bg-indigo-50/80 border-indigo-600 text-slate-900 dark:text-slate-100 shadow-sm ring-1 ring-indigo-500"
                          : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700/80 dark:border-slate-800/80 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:bg-slate-800/50 hover:border-slate-300"
                      )}
                    >
                      {/* Left: Thumbnail & Info */}
                      <div className="flex items-start gap-2.5 min-w-0">
                        {p.image ? (
                          <img
                            src={p.image}
                            alt={p.name}
                            className="w-11 h-11 object-cover rounded-lg border border-slate-200 dark:border-slate-700 shrink-0 mt-0.5 bg-slate-50 dark:bg-slate-800/50"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className={cn(
                            "w-11 h-11 rounded-lg border flex items-center justify-center shrink-0 mt-0.5 font-mono text-xs font-bold",
                            isSelected ? "bg-indigo-100 border-indigo-300 text-indigo-700" : "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400"
                          )}>
                            <Package className="w-5 h-5" />
                          </div>
                        )}

                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono font-black text-xs text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100 uppercase">
                              {p.code}
                            </span>
                            {p.moldCode && (
                              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">
                                Kalıp: {p.moldCode}
                              </span>
                            )}
                          </div>
                          
                          <div className="font-bold text-xs text-slate-900 dark:text-slate-100 truncate mt-1">
                            {p.name}
                          </div>

                          {/* Color dots preview */}
                          {p.colors && p.colors.length > 0 && (
                            <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                              {p.colors.slice(0, 5).map(c => {
                                const style = getColorStyle(c);
                                return (
                                  <span
                                    key={c}
                                    title={c}
                                    className="w-2.5 h-2.5 rounded-full border border-slate-400/60 shadow-2xs"
                                    style={{ backgroundColor: style.bg }}
                                  />
                                );
                              })}
                              {p.colors.length > 5 && (
                                <span className="text-[9px] font-bold text-slate-400">
                                  +{p.colors.length - 5}
                                </span>
                              )}
                              <span className="text-[10px] text-slate-400 font-semibold ml-1">
                                ({p.colors.length} Renk)
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right: Stock & Price */}
                      <div className="text-right shrink-0 space-y-1">
                        <div className="font-mono font-black text-xs text-slate-900 dark:text-slate-100">
                          {(price || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                        </div>

                        <div className={cn(
                          "inline-block px-1.5 py-0.5 rounded text-[10px] font-bold",
                          hasStock ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-rose-50 text-rose-700 border border-rose-200"
                        )}>
                          {hasStock ? `${p.stock} ${p.unit || 'Çift'}` : 'Tükendi'}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Variant & Quantity Customizer (7 cols) */}
          <div className="lg:col-span-7 flex flex-col justify-between space-y-4 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-700">
            {selectedProduct ? (
              <div className="space-y-4 overflow-y-auto max-h-[500px] pr-1">
                {/* 1. Selected Product Header Summary */}
                <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs flex items-start gap-3">
                  {currentColorImage ? (
                    <img
                      src={currentColorImage}
                      alt={selectedProduct.name}
                      className="w-16 h-16 object-cover rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 shrink-0"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 text-slate-400 font-mono font-black">
                      <Package className="w-7 h-7" />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-black text-xs text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-100 uppercase">
                        {selectedProduct.code}
                      </span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase">
                        {selectedProduct.unit || 'Çift'} Bazlı Stok
                      </span>
                    </div>

                    <h4 className="text-sm font-black text-slate-900 dark:text-slate-100 mt-1 uppercase truncate">
                      {selectedProduct.name}
                    </h4>

                    <div className="flex items-center gap-2 mt-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      {selectedProduct.moldGroup && (
                        <span className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-600">
                          {selectedProduct.moldGroup}
                        </span>
                      )}
                      <span>Stok: <b className="text-slate-800 dark:text-slate-200">{selectedProduct.stock || 0} {selectedProduct.unit || 'Çift'}</b></span>
                    </div>
                  </div>
                </div>

                {/* 2. Color Selection (Varyant Renkleri) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                      <Palette className="w-4 h-4 text-indigo-600" />
                      Renk Seçimi {effectiveColor ? <span className="text-indigo-600 font-mono font-bold">({effectiveColor})</span> : ''}
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setIsCustomColorMode(!isCustomColorMode);
                        if (!isCustomColorMode) {
                          setCustomColor(selectedColor || '');
                        }
                      }}
                      className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 underline cursor-pointer"
                    >
                      {isCustomColorMode ? 'Tanımlı Renklerden Seç' : '+ Farklı Renk Gir'}
                    </button>
                  </div>

                  {!isCustomColorMode ? (
                    <div className="flex flex-wrap gap-2">
                      {selectedProduct.colors && selectedProduct.colors.length > 0 ? (
                        selectedProduct.colors.map(color => {
                          const isSelected = selectedColor === color;
                          const swatch = getColorStyle(color);
                          
                          // Check if variant barcode has specific stock
                          const variantInfo = selectedProduct.variantBarcodes?.find(v => v.color.toLowerCase() === color.toLowerCase());
                          const variantStock = variantInfo?.stock;

                          return (
                            <button
                              key={color}
                              type="button"
                              onClick={() => setSelectedColor(color)}
                              className={cn(
                                "flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer",
                                isSelected
                                  ? "bg-slate-900 border-slate-900 text-white shadow-sm ring-2 ring-indigo-400 ring-offset-1"
                                  : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:bg-slate-800 hover:border-slate-300"
                              )}
                            >
                              <span
                                className="w-3.5 h-3.5 rounded-full border border-slate-400/60 shrink-0 shadow-2xs"
                                style={{ backgroundColor: swatch.bg }}
                              />
                              <span className="uppercase">{color}</span>
                              {variantStock !== undefined && (
                                <span className={cn(
                                  "text-[10px] px-1.5 py-0.2 rounded font-mono",
                                  isSelected ? "bg-slate-800 text-slate-300" : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                                )}>
                                  {variantStock} Çift
                                </span>
                              )}
                            </button>
                          );
                        })
                      ) : (
                        <div className="w-full p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center justify-between">
                          <span>Bu ürün için tanımlı standart renk bulunmuyor.</span>
                          <button
                            type="button"
                            onClick={() => setIsCustomColorMode(true)}
                            className="font-bold underline text-amber-900"
                          >
                            Renk Belirt
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <input
                        type="text"
                        value={customColor}
                        onChange={(e) => setCustomColor(e.target.value)}
                        placeholder="Örn: Bordo Nubuk, Siyah Rugan, Taba Deri..."
                        className="w-full p-2.5 bg-white dark:bg-slate-900 border border-indigo-300 rounded-xl text-xs font-bold uppercase outline-none focus:ring-2 focus:ring-indigo-500"
                        autoFocus
                      />
                      <p className="text-[10px] text-slate-400">Özel sipariş veya listede olmayan bir renk adı belirtebilirsiniz.</p>
                    </div>
                  )}
                </div>

                {/* 3. Quantity Calculation Modes */}
                <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                      <Boxes className="w-4 h-4 text-indigo-600" />
                      Miktar Belirleme ({selectedProduct.unit || 'Çift'})
                    </label>

                    {/* Mode Tabs for Footwear / Assortment */}
                    {(selectedProduct.isFootwear || pairsPerBox > 0) && (
                      <div className="flex bg-slate-200 p-0.5 rounded-lg text-[10px] font-bold">
                        <button
                          type="button"
                          onClick={() => setQuantityMode('direct')}
                          className={cn(
                            "px-2 py-0.5 rounded-md transition-all cursor-pointer",
                            quantityMode === 'direct' ? "bg-white dark:bg-slate-900 text-indigo-700 shadow-xs" : "text-slate-600 hover:text-slate-900 dark:text-slate-100"
                          )}
                        >
                          Net Miktar
                        </button>
                        <button
                          type="button"
                          onClick={() => setQuantityMode('box')}
                          className={cn(
                            "px-2 py-0.5 rounded-md transition-all cursor-pointer",
                            quantityMode === 'box' ? "bg-white dark:bg-slate-900 text-indigo-700 shadow-xs" : "text-slate-600 hover:text-slate-900 dark:text-slate-100"
                          )}
                        >
                          Koli Hesabı
                        </button>
                        <button
                          type="button"
                          onClick={() => setQuantityMode('matrix')}
                          className={cn(
                            "px-2 py-0.5 rounded-md transition-all cursor-pointer",
                            quantityMode === 'matrix' ? "bg-white dark:bg-slate-900 text-indigo-700 shadow-xs" : "text-slate-600 hover:text-slate-900 dark:text-slate-100"
                          )}
                        >
                          Numara Dağılımı
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Mode 1: Direct Quantity Input */}
                  {quantityMode === 'direct' && (
                    <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2.5">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleQuantityChange(quantity - 1)}
                          className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center font-bold text-lg cursor-pointer"
                        >
                          <Minus className="w-4 h-4" />
                        </button>

                        <div className="flex-1 relative">
                          <input
                            type="number"
                            min="1"
                            value={quantity}
                            onChange={(e) => handleQuantityChange(Number(e.target.value))}
                            className="w-full p-2 text-center text-xl font-black font-mono text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 uppercase">
                            {selectedProduct.unit || 'Çift'}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleQuantityChange(quantity + 1)}
                          className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center font-bold text-lg cursor-pointer"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Quick Add Chips */}
                      <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-slate-100 dark:border-slate-800">
                        <span className="text-[10px] font-bold text-slate-400">Hızlı Ekle:</span>
                        {[5, 10, 20, 50, 100, 500].map(inc => (
                          <button
                            key={inc}
                            type="button"
                            onClick={() => handleQuantityChange(quantity + inc)}
                            className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 hover:text-indigo-700 border border-slate-200 dark:border-slate-700 rounded-lg text-[10px] font-bold text-slate-600 transition-colors cursor-pointer"
                          >
                            +{inc}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Mode 2: Box / Assortment Template Input */}
                  {quantityMode === 'box' && (
                    <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="w-1/2 space-y-1">
                          <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase">Koli / Kutu Adedi</label>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleBoxCountChange(boxCount - 1)}
                              className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 flex items-center justify-center font-bold text-xs"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min="1"
                              value={boxCount}
                              onChange={(e) => handleBoxCountChange(Number(e.target.value))}
                              className="w-full p-1.5 text-center font-mono font-black text-sm bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg"
                            />
                            <button
                              type="button"
                              onClick={() => handleBoxCountChange(boxCount + 1)}
                              className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 flex items-center justify-center font-bold text-xs"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        <div className="w-1/2 space-y-1 text-right">
                          <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase">Toplam Çift Miktarı</label>
                          <div className="p-1.5 bg-indigo-50 border border-indigo-100 rounded-lg text-indigo-700 font-mono font-black text-sm text-center">
                            {quantity} Çift
                          </div>
                        </div>
                      </div>

                      {/* Template Size Breakdown */}
                      {pairsPerBox > 0 && (
                        <div className="p-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/80 dark:border-slate-800/80 space-y-1.5">
                          <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 dark:text-slate-400">
                            <span>1 Koli Asorti Dağılımı ({pairsPerBox} Çift/Koli):</span>
                            <span className="font-mono text-indigo-600">{currentTemplate?.name || 'Özel Asorti'}</span>
                          </div>

                          <div className="flex items-center gap-1.5 flex-wrap">
                            {(currentTemplate?.items || selectedProduct.assortment || []).map(it => (
                              <div
                                key={it.size}
                                className="flex flex-col items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-2 py-1 rounded-lg text-[10px]"
                              >
                                <span className="font-black text-slate-700 dark:text-slate-200 font-mono">{it.size}</span>
                                <span className="text-indigo-600 font-bold font-mono">
                                  {it.quantity * boxCount} Çift
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Mode 3: Matrix Size Breakdown Input */}
                  {quantityMode === 'matrix' && (
                    <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2.5">
                      <div className="flex items-center justify-between text-[11px] font-bold text-slate-600">
                        <span>Numara Bazında Adet Girişi:</span>
                        <span className="font-mono font-black text-indigo-600">Toplam: {quantity} Çift</span>
                      </div>

                      <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                        {['35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45'].map(sz => (
                          <div key={sz} className="space-y-1 text-center">
                            <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 font-mono block">{sz}</label>
                            <input
                              type="number"
                              min="0"
                              value={matrixValues[sz] || 0}
                              onChange={(e) => handleMatrixSizeChange(sz, Number(e.target.value))}
                              className="w-full p-1 text-center font-mono font-bold text-xs bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* 4. Pricing, Discount & Tax Inputs */}
                <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase">Birim Fiyat (TL)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={unitPrice}
                      onChange={(e) => setUnitPrice(Number(e.target.value))}
                      className="w-full p-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl font-mono font-bold text-xs text-slate-900 dark:text-slate-100 outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase">İskonto (%)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={discountRate}
                      onChange={(e) => setDiscountRate(Number(e.target.value))}
                      className="w-full p-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl font-mono font-bold text-xs text-slate-900 dark:text-slate-100 outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase">KDV Oranı (%)</label>
                    <select
                      value={taxRate}
                      onChange={(e) => setTaxRate(Number(e.target.value))}
                      className="w-full p-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-xs text-slate-900 dark:text-slate-100 outline-none"
                    >
                      <option value={20}>%20</option>
                      <option value={10}>%10</option>
                      <option value={1}>%1</option>
                      <option value={0}>%0</option>
                    </select>
                  </div>
                </div>

                {/* 5. Item Note */}
                <div className="space-y-1">
                  <input
                    type="text"
                    value={itemNotes}
                    onChange={(e) => setItemNotes(e.target.value)}
                    placeholder="Kalem özel notu (opsiyonel)..."
                    className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium outline-none"
                  />
                </div>
              </div>
            ) : (
              <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-slate-300">
                <Package className="w-12 h-12 opacity-30 mb-2" />
                <p className="text-xs font-bold uppercase text-center text-slate-400">
                  Lütfen sol taraftaki listeden bir ürün seçiniz
                </p>
              </div>
            )}

            {/* Bottom Actions & Live Calculation Summary */}
            {selectedProduct && (
              <div className="pt-3 border-t border-slate-200 dark:border-slate-700 space-y-3">
                {/* Live Cost Summary Banner */}
                <div className="bg-indigo-900 text-white p-3 rounded-xl flex items-center justify-between shadow-sm">
                  <div>
                    <div className="text-[10px] font-bold text-indigo-300 uppercase">
                      {quantity} {selectedProduct.unit || 'Çift'} {effectiveColor ? `• ${effectiveColor}` : ''}
                    </div>
                    <div className="text-xs text-indigo-200 font-semibold">
                      {(unitPrice || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺ {discountRate > 0 ? `(-%${discountRate})` : ''} + %{taxRate} KDV
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-[10px] font-black text-indigo-300 uppercase">Kalem Toplamı</div>
                    <div className="text-base font-black font-mono text-emerald-400">
                      {lineGrandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                    </div>
                  </div>
                </div>

                {/* Add To Cart & Close Buttons */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2.5 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-xs uppercase cursor-pointer"
                  >
                    Kapat
                  </button>

                  <button
                    type="button"
                    onClick={handleAddCurrentProduct}
                    className={cn(
                      "flex-1 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-md cursor-pointer",
                      recentlyAddedBadge
                        ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                        : "bg-indigo-600 hover:bg-indigo-700 text-white"
                    )}
                  >
                    {recentlyAddedBadge ? (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Sepete Eklendi! (Tekrar Ekleyebilirsiniz)</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4" />
                        <span>Sepete Ekle ({quantity} {selectedProduct.unit || 'Çift'})</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
