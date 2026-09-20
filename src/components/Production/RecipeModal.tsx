import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Layers,
  Palette,
  Sparkles,
  Copy,
  Plus,
  Trash2,
  Check,
  Package,
  Search,
  ChevronDown,
  Info,
  Calculator,
  RefreshCw,
  Tag,
  ArrowRight,
  CheckCircle2,
  Split
} from 'lucide-react';
import { cn } from '../../lib/utils';
import Modal from '../Modal';
import { erpService } from '../../services/erpService';
import type { Product, Recipe, RecipeIngredient } from '../../types';

interface RecipeModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedProductId: number;
  setSelectedProductId: (id: number) => void;
  selectedRecipeTargetColor: string;
  setSelectedRecipeTargetColor: (col: string) => void;
  products?: Product[];
  recipes?: Recipe[];
  onSaveSuccess: () => void;
}

const DEPARTMENTS = [
  { id: 'KESİM', name: 'KESİM', color: 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300' },
  { id: 'BASKI', name: 'BASKI', color: 'bg-purple-100 text-purple-900 border-purple-300 dark:bg-purple-950/60 dark:text-purple-300' },
  { id: 'SAYA', name: 'SAYA', color: 'bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-950/60 dark:text-blue-300' },
  { id: 'BAĞCIK', name: 'BAĞCIK', color: 'bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300' },
  { id: 'MONTA', name: 'MONTA', color: 'bg-indigo-100 text-indigo-900 border-indigo-300 dark:bg-indigo-950/60 dark:text-indigo-300' },
  { id: 'TEMİZLEME', name: 'TEMİZLEME', color: 'bg-teal-100 text-teal-900 border-teal-300 dark:bg-teal-950/60 dark:text-teal-300' },
  { id: 'AMBALAJ', name: 'AMBALAJ', color: 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300' },
  { id: 'DİĞER', name: 'DİĞER', color: 'bg-slate-100 text-slate-900 border-slate-300 dark:bg-slate-800 dark:text-slate-300' },
];

const PRESET_PARTS = [
  { label: 'Taban', department: 'MONTA', partName: 'TABAN', unit: 'Çift', isMatrix: true },
  { label: 'Mostra', department: 'MONTA', partName: 'MOSTRA', unit: 'Çift', isMatrix: true },
  { label: 'Fuspet', department: 'MONTA', partName: 'FUSPET', unit: 'Çift', isMatrix: true },
  { label: 'Saya Derisi', department: 'KESİM', partName: 'SAYA', unit: 'dm²', isMatrix: false },
  { label: 'Astar', department: 'KESİM', partName: 'DİL / GAMBA ASTAR', unit: 'dm²', isMatrix: false },
  { label: 'Bağcık', department: 'BAĞCIK', partName: 'BAĞCIK', unit: 'Çift', isMatrix: false },
  { label: 'Ayakkabı Kutusu', department: 'AMBALAJ', partName: 'KUTU', unit: 'Adet', isMatrix: false },
  { label: 'Koli', department: 'AMBALAJ', partName: 'KOLİ', unit: 'Adet', isMatrix: false },
];

// Helper: Extract all colors registered for a product card
export function getProductAvailableColors(prod?: Product): string[] {
  if (!prod) return [];
  const colorSet = new Set<string>();

  if (Array.isArray(prod.colors)) {
    prod.colors.forEach(c => c && colorSet.add(c.trim().toUpperCase()));
  }
  if (Array.isArray(prod.variantBarcodes)) {
    prod.variantBarcodes.forEach(v => v.color && colorSet.add(v.color.trim().toUpperCase()));
  }
  if (Array.isArray(prod.colorBoxBarcodes)) {
    prod.colorBoxBarcodes.forEach(cb => cb.color && colorSet.add(cb.color.trim().toUpperCase()));
  }

  return Array.from(colorSet).filter(Boolean);
}

// Interactive Color Combobox Component
interface ColorComboboxProps {
  value?: string;
  onChange: (color: string) => void;
  availableColors: string[];
  targetModelColor?: string;
  placeholder?: string;
}

const ColorCombobox: React.FC<ColorComboboxProps> = ({
  value = '',
  onChange,
  availableColors,
  targetModelColor,
  placeholder = 'Renk Seçin...'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSearchTerm(value || '');
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredColors = useMemo(() => {
    if (!searchTerm.trim()) return availableColors;
    const term = searchTerm.trim().toUpperCase();
    return availableColors.filter(c => c.toUpperCase().includes(term));
  }, [availableColors, searchTerm]);

  const handleSelect = (color: string) => {
    onChange(color);
    setSearchTerm(color);
    setIsOpen(false);
  };

  const isExactMatchInAvailable = availableColors.some(
    c => c.toUpperCase() === (value || '').toUpperCase()
  );

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="flex items-center relative">
        <input
          type="text"
          value={searchTerm}
          placeholder={availableColors.length > 0 ? `${placeholder} (${availableColors.length})` : 'Renk Giriniz...'}
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            const val = e.target.value.toUpperCase();
            setSearchTerm(val);
            onChange(val);
            setIsOpen(true);
          }}
          className={cn(
            "w-full border rounded-lg py-1.5 pl-2.5 pr-7 text-xs font-bold uppercase transition-all shadow-2xs focus:outline-none focus:ring-1 focus:ring-indigo-500",
            value
              ? "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100"
              : "bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-500",
            targetModelColor && value && value.toUpperCase() === targetModelColor.toUpperCase() &&
              "border-indigo-400 dark:border-indigo-500 text-indigo-700 dark:text-indigo-300 font-black"
          )}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setIsOpen(!isOpen)}
          className="absolute right-1.5 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
        >
          <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-200", isOpen && "rotate-180")} />
        </button>
      </div>

      {isOpen && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden max-h-56 overflow-y-auto">
          {availableColors.length > 0 ? (
            <div className="p-1.5 space-y-1">
              <div className="px-2 py-1 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
                <span>Ürüne Tanımlı Renkler</span>
                <span className="bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.2 rounded font-mono text-[9px]">
                  {availableColors.length} Renk
                </span>
              </div>

              {filteredColors.map((col) => {
                const isSelected = value.toUpperCase() === col.toUpperCase();
                const isModelTarget = targetModelColor && targetModelColor !== 'all' && col.toUpperCase() === targetModelColor.toUpperCase();

                return (
                  <button
                    key={col}
                    type="button"
                    onClick={() => handleSelect(col)}
                    className={cn(
                      "w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-bold uppercase flex items-center justify-between transition-colors cursor-pointer",
                      isSelected
                        ? "bg-indigo-600 text-white"
                        : "hover:bg-indigo-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "w-2.5 h-2.5 rounded-full border",
                        isSelected ? "bg-white border-white" : "bg-slate-400 dark:bg-slate-600 border-slate-300"
                      )} />
                      <span>{col}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {isModelTarget && (
                        <span className={cn(
                          "text-[9px] px-1.5 py-0.2 rounded font-black tracking-tight",
                          isSelected ? "bg-indigo-800 text-white" : "bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300"
                        )}>
                          🎯 Model Rengi
                        </span>
                      )}
                      {isSelected && <Check className="w-3.5 h-3.5" />}
                    </div>
                  </button>
                );
              })}

              {/* Free text option if user typed something not in list */}
              {searchTerm && !availableColors.some(c => c.toUpperCase() === searchTerm.toUpperCase()) && (
                <button
                  type="button"
                  onClick={() => handleSelect(searchTerm.toUpperCase())}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-bold uppercase text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 flex items-center gap-2 border border-amber-200 dark:border-amber-800"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Özel Renk Olarak Ekle: "{searchTerm}"</span>
                </button>
              )}
            </div>
          ) : (
            <div className="p-3 text-center text-xs text-slate-500 dark:text-slate-400">
              <p className="font-semibold">Bu malzeme kartında renk kaydı yok.</p>
              <p className="text-[10px] text-slate-400 mt-1">İstediğiniz rengi klavyeden yazabilirsiniz.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const RecipeModal: React.FC<RecipeModalProps> = ({
  isOpen,
  onClose,
  selectedProductId,
  setSelectedProductId,
  selectedRecipeTargetColor,
  setSelectedRecipeTargetColor,
  products = [],
  recipes = [],
  onSaveSuccess
}) => {
  const [recipeIngredients, setRecipeIngredients] = useState<RecipeIngredient[]>([]);
  const [recipeLaborCost, setRecipeLaborCost] = useState<number>(0);
  const [recipeNotes, setRecipeNotes] = useState<string>('');
  
  // Filter & Search inside the grid
  const [filterDepartment, setFilterDepartment] = useState<string>('all');
  const [gridSearchQuery, setGridSearchQuery] = useState<string>('');

  // Copy Modal states
  const [isCopyModalOpen, setIsCopyModalOpen] = useState(false);
  const [copySourceColor, setCopySourceColor] = useState<string>('');
  const [copyTargetColors, setCopyTargetColors] = useState<string[]>([]);
  const [copyFeedbackMsg, setCopyFeedbackMsg] = useState<string | null>(null);

  const productMap = useMemo(() => new Map(products.map(p => [p.id!, p])), [products]);

  // Load recipe for given product and color
  const loadRecipe = (productId: number, targetColor: string) => {
    setSelectedProductId(productId);
    setSelectedRecipeTargetColor(targetColor);

    const allProdRecipes = recipes.filter(r => r.productId === productId);
    const existing = allProdRecipes.find(r => (r.targetColor || 'all') === targetColor);

    if (existing && existing.ingredients) {
      setRecipeIngredients(existing.ingredients.map(ing => ({
        ...ing,
        quantity: ing.quantity || 1,
        wasteRate: ing.wasteRate || 0
      })));
      setRecipeLaborCost(existing.laborCost || 0);
      setRecipeNotes(existing.notes || '');
      return;
    }

    // Fallback to generic 'all' recipe if specific color is new
    if (targetColor !== 'all') {
      const generic = allProdRecipes.find(r => !r.targetColor || r.targetColor === 'all');
      if (generic && generic.ingredients) {
        setRecipeIngredients(generic.ingredients.map(ing => {
          const mat = productMap.get(ing.productId);
          const matColors = getProductAvailableColors(mat);
          const hasColor = matColors.some(c => c.toUpperCase() === targetColor.toUpperCase());
          return {
            ...ing,
            color: hasColor ? targetColor : ing.color,
            wasteRate: ing.wasteRate || 0
          };
        }));
        setRecipeLaborCost(generic.laborCost || 0);
        setRecipeNotes(generic.notes || '');
        return;
      }
    }

    // Default 1 blank line
    setRecipeIngredients([{
      productId: 0,
      department: 'KESİM',
      partName: '',
      color: targetColor !== 'all' ? targetColor : undefined,
      quantity: 1,
      unit: 'Adet',
      isMatrixMatched: false,
      wasteRate: 0
    }]);
    setRecipeLaborCost(0);
    setRecipeNotes('');
  };

  useEffect(() => {
    if (isOpen && selectedProductId) {
      loadRecipe(selectedProductId, selectedRecipeTargetColor || 'all');
    }
  }, [isOpen, selectedProductId]);

  // Handle quick source load (clone from another color)
  const handleQuickApplySourceColor = (fromColor: string) => {
    if (!selectedProductId) return;
    const allProdRecipes = recipes.filter(r => r.productId === selectedProductId);
    const srcRecipe = allProdRecipes.find(r => (r.targetColor || 'all') === fromColor);
    if (!srcRecipe) {
      alert(`"${fromColor}" varyantı için kayıtlı reçete bulunamadı.`);
      return;
    }

    const cloned = srcRecipe.ingredients.map(ing => {
      const mat = productMap.get(ing.productId);
      const isSemi = mat?.categoryType === 'semi_finished' || mat?.isFootwear || mat?.unit === 'Çift';
      let adaptedColor = ing.color;
      if (selectedRecipeTargetColor !== 'all') {
        const matColors = getProductAvailableColors(mat);
        if (matColors.some(c => c.toUpperCase() === selectedRecipeTargetColor.toUpperCase())) {
          adaptedColor = selectedRecipeTargetColor;
        } else if (fromColor !== 'all' && ing.color === fromColor) {
          adaptedColor = selectedRecipeTargetColor;
        }
      }
      return {
        ...ing,
        color: adaptedColor,
        isMatrixMatched: ing.isMatrixMatched ?? isSemi,
        wasteRate: ing.wasteRate || 0
      };
    });

    setRecipeIngredients(cloned);
    setRecipeLaborCost(srcRecipe.laborCost || 0);
    setRecipeNotes(srcRecipe.notes || '');
  };

  // Add blank row
  const handleAddRow = () => {
    setRecipeIngredients(prev => [
      ...prev,
      {
        productId: 0,
        department: 'KESİM',
        partName: '',
        color: selectedRecipeTargetColor !== 'all' ? selectedRecipeTargetColor : undefined,
        quantity: 1,
        unit: 'Adet',
        isMatrixMatched: false,
        wasteRate: 0
      }
    ]);
  };

  // Quick Preset Add
  const handleAddPreset = (preset: typeof PRESET_PARTS[0]) => {
    setRecipeIngredients(prev => [
      ...prev,
      {
        productId: 0,
        department: preset.department,
        partName: preset.partName,
        color: selectedRecipeTargetColor !== 'all' ? selectedRecipeTargetColor : undefined,
        quantity: 1,
        unit: preset.unit,
        isMatrixMatched: preset.isMatrix,
        wasteRate: 0
      }
    ]);
  };

  // Duplicate Row
  const handleDuplicateRow = (index: number) => {
    const item = recipeIngredients[index];
    if (!item) return;
    setRecipeIngredients(prev => {
      const next = [...prev];
      next.splice(index + 1, 0, { ...item });
      return next;
    });
  };

  // Remove Row
  const handleRemoveRow = (index: number) => {
    setRecipeIngredients(prev => prev.filter((_, i) => i !== index));
  };

  // Material selection change handler with auto-color suggestion
  const handleMaterialChange = (index: number, productId: number) => {
    setRecipeIngredients(prev => {
      const next = [...prev];
      const row = { ...next[index], productId };
      const mat = productMap.get(productId);

      if (mat) {
        row.unit = mat.unit || 'Adet';
        const isSemi = mat.categoryType === 'semi_finished' || mat.isFootwear || mat.unit === 'Çift';
        row.isMatrixMatched = isSemi;

        // Auto color match:
        const available = getProductAvailableColors(mat);
        if (selectedRecipeTargetColor !== 'all') {
          const match = available.find(c => c.toUpperCase() === selectedRecipeTargetColor.toUpperCase());
          if (match) {
            row.color = match;
          } else if (available.length === 1) {
            row.color = available[0];
          }
        } else if (available.length === 1) {
          row.color = available[0];
        }
      }

      next[index] = row;
      return next;
    });
  };

  // Save recipe
  const handleSaveRecipe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId) {
      alert('Lütfen bir hedef model seçin.');
      return;
    }
    const validIngredients = recipeIngredients.filter(i => i.productId > 0 && i.quantity > 0);
    if (validIngredients.length === 0) {
      alert('Reçete için en az bir hammadde veya yarı mamul ve geçerli miktar girilmelidir.');
      return;
    }

    try {
      await erpService.saveRecipe({
        productId: selectedProductId,
        targetColor: selectedRecipeTargetColor !== 'all' ? selectedRecipeTargetColor : undefined,
        ingredients: validIngredients,
        laborCost: recipeLaborCost,
        notes: recipeNotes
      });
      onSaveSuccess();
      onClose();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Open copy modal
  const handleOpenCopyModal = () => {
    if (!selectedProductId) return;
    setCopySourceColor(selectedRecipeTargetColor);
    setCopyTargetColors([]);
    setCopyFeedbackMsg(null);
    setIsCopyModalOpen(true);
  };

  // Execute copy across colors
  const handleExecuteCopy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId || copyTargetColors.length === 0) {
      alert('Lütfen en az bir hedef renk seçin.');
      return;
    }

    const validIngredients = recipeIngredients.filter(i => i.productId > 0 && i.quantity > 0);
    if (validIngredients.length === 0) {
      alert('Kopyalanacak reçetede en az 1 geçerli malzeme bulunmalıdır.');
      return;
    }

    try {
      for (const targetCol of copyTargetColors) {
        const adapted = validIngredients.map(ing => {
          const mat = productMap.get(ing.productId);
          const matColors = getProductAvailableColors(mat);
          let newColor = ing.color;

          if (matColors.some(c => c.toUpperCase() === targetCol.toUpperCase())) {
            newColor = targetCol;
          } else if (copySourceColor !== 'all' && ing.color?.toUpperCase() === copySourceColor.toUpperCase()) {
            newColor = targetCol;
          }
          return { ...ing, color: newColor };
        });

        await erpService.saveRecipe({
          productId: selectedProductId,
          targetColor: targetCol !== 'all' ? targetCol : undefined,
          ingredients: adapted,
          laborCost: recipeLaborCost,
          notes: recipeNotes ? `${recipeNotes} (${targetCol} rengi için kopyalandı)` : undefined
        });
      }

      setCopyFeedbackMsg(`Reçete ${copyTargetColors.length} adet renk varyantına başarıyla kopyalandı!`);
      onSaveSuccess();
      setTimeout(() => {
        setIsCopyModalOpen(false);
        setCopyFeedbackMsg(null);
      }, 1200);
    } catch (err: any) {
      alert(`Kopyalama hatası: ${err.message}`);
    }
  };

  // Filtered rows for Excel-style view
  const filteredRows = useMemo(() => {
    return recipeIngredients.map((item, originalIndex) => ({ item, originalIndex })).filter(({ item }) => {
      if (filterDepartment !== 'all' && item.department !== filterDepartment) return false;
      if (gridSearchQuery.trim()) {
        const q = gridSearchQuery.toLowerCase();
        const mat = productMap.get(item.productId);
        const nameMatch = mat?.name?.toLowerCase().includes(q) || false;
        const codeMatch = mat?.code?.toLowerCase().includes(q) || false;
        const partMatch = item.partName?.toLowerCase().includes(q) || false;
        const colorMatch = item.color?.toLowerCase().includes(q) || false;
        return nameMatch || codeMatch || partMatch || colorMatch;
      }
      return true;
    });
  }, [recipeIngredients, filterDepartment, gridSearchQuery, productMap]);

  // Live Cost Calculations
  const { totalMaterialCost, totalCost } = useMemo(() => {
    let matCost = 0;
    recipeIngredients.forEach(ing => {
      if (ing.productId > 0 && ing.quantity > 0) {
        const mat = productMap.get(ing.productId);
        const unitPrice = mat?.buyingPrice || 0;
        const wasteMultiplier = 1 + (Number(ing.wasteRate) || 0) / 100;
        matCost += unitPrice * ing.quantity * wasteMultiplier;
      }
    });
    return {
      totalMaterialCost: matCost,
      totalCost: matCost + (Number(recipeLaborCost) || 0)
    };
  }, [recipeIngredients, recipeLaborCost, productMap]);

  const currentProduct = productMap.get(selectedProductId);

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Ürün Reçetesi (BOM) & Varyant Yönetimi"
        size="full"
      >
        <form onSubmit={handleSaveRecipe} className="space-y-4">
          {/* Top Bar: Model Selector & Target Color Variants */}
          <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
              {/* Target Model Selection */}
              <div className="lg:col-span-4 space-y-1.5">
                <label className="text-[11px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-indigo-600" />
                  Hedef Ayakkabı Modeli
                </label>
                <select
                  required
                  value={selectedProductId}
                  onChange={e => {
                    const newId = Number(e.target.value);
                    const prod = productMap.get(newId);
                    const colorToUse = prod?.colors && prod.colors.length > 0 ? prod.colors[0] : 'all';
                    loadRecipe(newId, colorToUse);
                  }}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-xl p-2.5 text-sm font-black text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-xs"
                >
                  <option value="0">Model Seçiniz...</option>
                  {products.filter(p => p.categoryType === 'finished' || (!p.categoryType && !p.isRawMaterial && p.categoryType !== 'semi_finished' && p.categoryType !== 'accessory')).map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.code}) {p.subType ? `• ${p.subType}` : ''}</option>
                  ))}
                </select>
                {currentProduct && (
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium flex items-center gap-2 pt-0.5">
                    <span className="bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded text-[10px] font-bold">Kod: {currentProduct.code}</span>
                    {currentProduct.moldCode && <span className="text-slate-600 dark:text-slate-300 font-bold">Kalıp: {currentProduct.moldCode}</span>}
                    {currentProduct.moldGroup && <span className="text-slate-400">({currentProduct.moldGroup})</span>}
                  </div>
                )}
              </div>

              {/* Target Color Variant Pills */}
              <div className="lg:col-span-8 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-[11px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Palette className="w-4 h-4 text-indigo-600" />
                    Model Renk Varyantı
                  </label>
                  <div className="flex items-center gap-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    <span>Şu An Düzenlenen:</span>
                    <span className="font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2.5 py-0.5 rounded-lg border border-indigo-200 dark:border-indigo-800">
                      {selectedRecipeTargetColor === 'all' ? '🌐 Genel (Tüm Renkler)' : `${selectedRecipeTargetColor} Rengi`}
                    </span>
                  </div>
                </div>

                {selectedProductId > 0 ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {/* General Recipe */}
                    <button
                      type="button"
                      onClick={() => loadRecipe(selectedProductId, 'all')}
                      className={cn(
                        "px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wide border transition-all cursor-pointer",
                        selectedRecipeTargetColor === 'all'
                          ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                          : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-slate-400"
                      )}
                    >
                      🌐 Genel Reçete
                    </button>

                    {/* Specific Colors */}
                    {currentProduct?.colors?.map(col => {
                      const hasColorRecipe = recipes.some(r => r.productId === selectedProductId && r.targetColor === col);
                      const isCurrent = selectedRecipeTargetColor === col;
                      return (
                        <button
                          key={col}
                          type="button"
                          onClick={() => loadRecipe(selectedProductId, col)}
                          className={cn(
                            "px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wide border transition-all flex items-center gap-1.5 cursor-pointer",
                            isCurrent
                              ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                              : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-indigo-300"
                          )}
                        >
                          <span>{col}</span>
                          {hasColorRecipe ? (
                            <span className={cn(
                              "text-[9px] px-1.5 py-0.2 rounded font-black",
                              isCurrent ? "bg-indigo-800 text-white" : "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300"
                            )}>
                              ✓ Reçeteli
                            </span>
                          ) : (
                            <span className="text-[9px] text-slate-400 font-bold">+ Yeni</span>
                          )}
                        </button>
                      );
                    })}

                    {/* Quick Add other color */}
                    <input
                      type="text"
                      placeholder="+ Başka Renk..."
                      className="border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 rounded-xl px-2.5 py-1 text-xs font-bold uppercase w-32 focus:outline-none focus:border-indigo-500 shadow-2xs"
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const val = (e.target as HTMLInputElement).value.trim();
                          if (val) {
                            loadRecipe(selectedProductId, val);
                            (e.target as HTMLInputElement).value = '';
                          }
                        }
                      }}
                    />
                  </div>
                ) : (
                  <div className="text-xs text-slate-400 italic">Lütfen yukarıdan bir model seçiniz.</div>
                )}
              </div>
            </div>

            {/* Quick Clone & Copy Bar */}
            {selectedProductId > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-200/80 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  <span className="font-bold text-slate-700 dark:text-slate-300">
                    Başka Bir Renkten Şablon Yükle:
                  </span>
                  <select
                    defaultValue=""
                    onChange={e => {
                      const fromCol = e.target.value;
                      if (fromCol) {
                        handleQuickApplySourceColor(fromCol);
                        e.target.value = '';
                      }
                    }}
                    className="border border-indigo-200 dark:border-slate-600 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="">Rengin Reçetesini Aktar...</option>
                    {recipes.filter(r => r.productId === selectedProductId).map(r => (
                      <option key={`clone-opt-${r.id}`} value={r.targetColor || 'all'}>
                        {r.targetColor ? `${r.targetColor} Rengi Reçetesi` : 'Genel Reçete'} ({r.ingredients?.length || 0} malzeme)
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={handleOpenCopyModal}
                  className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-xl font-bold flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Toplu Renklere Çoğalt
                </button>
              </div>
            )}
          </div>

          {/* Quick Presets & Grid Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs">
            {/* Quick Part Presets */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 mr-1 flex items-center gap-1">
                <Tag className="w-3.5 h-3.5" /> Hızlı Kalem Ekle:
              </span>
              {PRESET_PARTS.map(preset => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => handleAddPreset(preset)}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 rounded-lg text-[11px] font-bold border border-slate-200 dark:border-slate-700 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3 h-3 text-indigo-500" />
                  <span>{preset.label}</span>
                </button>
              ))}
            </div>

            {/* Actions: Add Row & Filter */}
            <div className="flex items-center gap-2 ml-auto">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Tabloda ara..."
                  value={gridSearchQuery}
                  onChange={e => setGridSearchQuery(e.target.value)}
                  className="pl-8 pr-2.5 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 w-36 focus:w-48 transition-all focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <select
                value={filterDepartment}
                onChange={e => setFilterDepartment(e.target.value)}
                className="py-1.5 px-2 text-xs font-bold border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none"
              >
                <option value="all">Tüm Departmanlar</option>
                {DEPARTMENTS.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>

              <button
                type="button"
                onClick={handleAddRow}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Yeni Satır
              </button>
            </div>
          </div>

          {/* EXCEL-LIKE ERGONOMIC MODERN DATA GRID */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
            <div className="overflow-x-auto max-h-[50vh] overflow-y-auto">
              <table className="w-full text-left border-collapse min-w-[1080px]">
                {/* Fixed/Sticky Table Header */}
                <thead className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-800 text-[10px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 select-none shadow-2xs">
                  <tr>
                    <th className="py-2.5 px-2 text-center w-10 border-r border-slate-200 dark:border-slate-700">#</th>
                    <th className="py-2.5 px-3 w-32 border-r border-slate-200 dark:border-slate-700">Departman</th>
                    <th className="py-2.5 px-3 w-40 border-r border-slate-200 dark:border-slate-700">Parça / Açıklama</th>
                    <th className="py-2.5 px-3 w-72 border-r border-slate-200 dark:border-slate-700">Malzeme (Stok Kartı)</th>
                    <th className="py-2.5 px-3 w-48 border-r border-slate-200 dark:border-slate-700">
                      <div className="flex items-center gap-1 text-indigo-700 dark:text-indigo-400">
                        <Palette className="w-3 h-3" />
                        <span>Malzeme Rengi</span>
                      </div>
                    </th>
                    <th className="py-2.5 px-2 text-center w-24 border-r border-slate-200 dark:border-slate-700">Birim Sarfiyat</th>
                    <th className="py-2.5 px-2 text-center w-20 border-r border-slate-200 dark:border-slate-700">Birim</th>
                    <th className="py-2.5 px-2 text-center w-16 border-r border-slate-200 dark:border-slate-700" title="Fire / Zayiat Oranı (%)">Fire %</th>
                    <th className="py-2.5 px-3 text-center w-36 border-r border-slate-200 dark:border-slate-700">Asorti Eşleme</th>
                    <th className="py-2.5 px-3 text-right w-28 border-r border-slate-200 dark:border-slate-700">Tahmini Tutar</th>
                    <th className="py-2.5 px-2 text-center w-16">İşlem</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-12 text-center text-slate-400 bg-slate-50/50 dark:bg-slate-800/20">
                        <Package className="w-8 h-8 mx-auto mb-2 opacity-40 text-slate-400" />
                        <p className="font-bold text-slate-600 dark:text-slate-300">Henüz malzeme satırı eklenmedi.</p>
                        <p className="text-[11px] text-slate-400 mt-1">Yukarıdaki "Yeni Satır" veya "Hızlı Kalem Ekle" butonlarını kullanabilirsiniz.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map(({ item: ing, originalIndex: idx }, visualIdx) => {
                      const selectedMat = productMap.get(ing.productId);
                      const availableColors = getProductAvailableColors(selectedMat);
                      const unitPrice = selectedMat?.buyingPrice || 0;
                      const wasteMultiplier = 1 + (Number(ing.wasteRate) || 0) / 100;
                      const lineCost = unitPrice * (ing.quantity || 0) * wasteMultiplier;

                      return (
                        <tr
                          key={idx}
                          className={cn(
                            "hover:bg-indigo-50/40 dark:hover:bg-slate-800/60 transition-colors group",
                            visualIdx % 2 === 1 ? "bg-slate-50/40 dark:bg-slate-800/20" : "bg-white dark:bg-slate-900"
                          )}
                        >
                          {/* 1. Row Index */}
                          <td className="py-2 px-2 text-center font-mono font-bold text-[11px] text-slate-400 border-r border-slate-200 dark:border-slate-800">
                            {visualIdx + 1}
                          </td>

                          {/* 2. Departman */}
                          <td className="py-1.5 px-2 border-r border-slate-200 dark:border-slate-800">
                            <select
                              value={ing.department || 'KESİM'}
                              onChange={e => {
                                const next = [...recipeIngredients];
                                next[idx].department = e.target.value;
                                setRecipeIngredients(next);
                              }}
                              className="w-full border border-slate-200 dark:border-slate-700 rounded-lg p-1.5 text-xs font-black text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500 uppercase"
                            >
                              {DEPARTMENTS.map(d => (
                                <option key={d.id} value={d.id}>{d.name}</option>
                              ))}
                            </select>
                          </td>

                          {/* 3. Parça / Açıklama */}
                          <td className="py-1.5 px-2 border-r border-slate-200 dark:border-slate-800">
                            <input
                              type="text"
                              placeholder="Örn: ÇEMBER"
                              value={ing.partName || ''}
                              onChange={e => {
                                const next = [...recipeIngredients];
                                next[idx].partName = e.target.value.toUpperCase();
                                setRecipeIngredients(next);
                              }}
                              list="part-suggestions"
                              className="w-full border border-slate-200 dark:border-slate-700 rounded-lg p-1.5 text-xs font-bold text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 uppercase focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          </td>

                          {/* 4. Malzeme Kartı */}
                          <td className="py-1.5 px-2 border-r border-slate-200 dark:border-slate-800">
                            <select
                              required
                              value={ing.productId}
                              onChange={e => handleMaterialChange(idx, Number(e.target.value))}
                              className="w-full border border-slate-200 dark:border-slate-700 rounded-lg p-1.5 text-xs font-bold text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500 truncate"
                            >
                              <option value="0">Malzeme Seçiniz...</option>
                              
                              {/* Yarı Mamuller */}
                              <optgroup label="── 🏭 Yarı Mamuller (Taban, Mostra vb.) ──">
                                {products.filter(p => p.categoryType === 'semi_finished').map(p => (
                                  <option key={`opt-semi-${p.id}`} value={p.id}>
                                    {p.name} ({p.code}) {p.colors && p.colors.length > 0 ? `[${p.colors.join(', ')}]` : ''}
                                  </option>
                                ))}
                              </optgroup>

                              {/* Hammaddeler */}
                              <optgroup label="── 📦 Hammaddeler (Deri, Kumaş, Plaka) ──">
                                {products.filter(p => (p.categoryType === 'raw_material' || (!p.categoryType && p.isRawMaterial)) && p.categoryType !== 'semi_finished').map(p => (
                                  <option key={`opt-raw-${p.id}`} value={p.id}>
                                    {p.name} ({p.code}) {p.colors && p.colors.length > 0 ? `[${p.colors.join(', ')}]` : ''}
                                  </option>
                                ))}
                              </optgroup>

                              {/* Aksesuar & Sarf */}
                              <optgroup label="── ✂️ Aksesuar & Sarf Malzemeler ──">
                                {products.filter(p => p.categoryType === 'accessory').map(p => (
                                  <option key={`opt-acc-${p.id}`} value={p.id}>
                                    {p.name} ({p.code}) {p.colors && p.colors.length > 0 ? `[${p.colors.join(', ')}]` : ''}
                                  </option>
                                ))}
                              </optgroup>
                            </select>
                          </td>

                          {/* 5. Malzeme Rengi (DYNAMIC COMBOBOX) */}
                          <td className="py-1.5 px-2 border-r border-slate-200 dark:border-slate-800">
                            <ColorCombobox
                              value={ing.color || ''}
                              onChange={(newCol) => {
                                const next = [...recipeIngredients];
                                next[idx].color = newCol || undefined;
                                setRecipeIngredients(next);
                              }}
                              availableColors={availableColors}
                              targetModelColor={selectedRecipeTargetColor}
                              placeholder="Renk Seç..."
                            />
                          </td>

                          {/* 6. Birim Sarfiyat (Miktar) */}
                          <td className="py-1.5 px-2 border-r border-slate-200 dark:border-slate-800">
                            <input
                              type="number"
                              step="0.00001"
                              min="0.00001"
                              required
                              value={ing.quantity}
                              onChange={e => {
                                const next = [...recipeIngredients];
                                next[idx].quantity = Number(e.target.value);
                                setRecipeIngredients(next);
                              }}
                              className="w-full border border-slate-200 dark:border-slate-700 rounded-lg p-1.5 text-xs font-black text-center text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                            />
                          </td>

                          {/* 7. Birim */}
                          <td className="py-1.5 px-2 border-r border-slate-200 dark:border-slate-800">
                            <input
                              type="text"
                              value={ing.unit || 'Adet'}
                              onChange={e => {
                                const next = [...recipeIngredients];
                                next[idx].unit = e.target.value;
                                setRecipeIngredients(next);
                              }}
                              className="w-full border border-slate-200 dark:border-slate-700 rounded-lg p-1.5 text-[11px] font-bold text-center text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500 uppercase"
                            />
                          </td>

                          {/* 8. Fire / Zayiat (%) */}
                          <td className="py-1.5 px-2 border-r border-slate-200 dark:border-slate-800">
                            <input
                              type="number"
                              step="0.5"
                              min="0"
                              max="100"
                              value={ing.wasteRate || 0}
                              onChange={e => {
                                const next = [...recipeIngredients];
                                next[idx].wasteRate = Number(e.target.value);
                                setRecipeIngredients(next);
                              }}
                              className="w-full border border-slate-200 dark:border-slate-700 rounded-lg p-1.5 text-[11px] font-bold text-center text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                            />
                          </td>

                          {/* 9. Asorti Eşleme Toggle */}
                          <td className="py-1.5 px-2 border-r border-slate-200 dark:border-slate-800 text-center">
                            <button
                              type="button"
                              onClick={() => {
                                const next = [...recipeIngredients];
                                next[idx].isMatrixMatched = !next[idx].isMatrixMatched;
                                setRecipeIngredients(next);
                              }}
                              className={cn(
                                "w-full py-1 px-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors border cursor-pointer flex items-center justify-center gap-1",
                                ing.isMatrixMatched
                                  ? "bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800"
                                  : "bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 hover:bg-slate-100"
                              )}
                              title={ing.isMatrixMatched ? "Sipariş asorti numaraları ile (40,41,42...) 1:1 eşleşir" : "Çift başına sabit miktarda düşülür"}
                            >
                              <span>{ing.isMatrixMatched ? '🎯 Asorti Matris' : 'Sabit Sarfiyat'}</span>
                            </button>
                          </td>

                          {/* 10. Tahmini Tutar */}
                          <td className="py-1.5 px-2 border-r border-slate-200 dark:border-slate-800 text-right font-mono font-bold text-[11px] text-slate-700 dark:text-slate-300">
                            {lineCost.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺
                          </td>

                          {/* 11. İşlem Aksiyonları */}
                          <td className="py-1.5 px-2 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleDuplicateRow(idx)}
                                title="Satırı Klonla"
                                className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-slate-800 rounded transition-colors cursor-pointer"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveRow(idx)}
                                title="Satırı Sil"
                                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bottom Live Summary & Labor Cost & Notes */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 items-center">
            {/* Notes */}
            <div className="lg:col-span-5 space-y-1">
              <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Reçete / Proses Notları & Kalıp Bilgisi
              </label>
              <input
                type="text"
                value={recipeNotes}
                onChange={e => setRecipeNotes(e.target.value)}
                placeholder="Örn: Taban montajında çift yapıştırıcı, 224 nolu kalıp..."
                className="w-full border border-slate-300 dark:border-slate-600 rounded-xl p-2 text-xs font-medium text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {/* Labor Cost Input */}
            <div className="lg:col-span-3 space-y-1">
              <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Birim İşçilik Maliyeti (₺)</span>
                <span className="text-[9px] text-slate-400 font-normal">Çift Başına</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={recipeLaborCost}
                onChange={e => setRecipeLaborCost(Number(e.target.value))}
                placeholder="0.00"
                className="w-full border border-slate-300 dark:border-slate-600 rounded-xl p-2 text-xs font-black text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono text-right"
              />
            </div>

            {/* Live Cost Summary Badges */}
            <div className="lg:col-span-4 flex items-center justify-end gap-3 pt-2 lg:pt-0">
              <div className="bg-white dark:bg-slate-900 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-right shadow-2xs">
                <span className="text-[9px] font-bold text-slate-400 uppercase block">Toplam Malzeme</span>
                <span className="text-xs font-black text-slate-800 dark:text-slate-200 font-mono">
                  {totalMaterialCost.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺
                </span>
              </div>

              <div className="bg-indigo-50 dark:bg-indigo-950/60 px-3 py-2 rounded-xl border border-indigo-200 dark:border-indigo-800 text-right shadow-2xs">
                <span className="text-[9px] font-black text-indigo-600 dark:text-indigo-400 uppercase block">Tahmini Birim Maliyet</span>
                <span className="text-sm font-black text-indigo-700 dark:text-indigo-300 font-mono">
                  {totalCost.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺ / Çift
                </span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
            >
              Vazgeç / Kapat
            </button>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleOpenCopyModal}
                disabled={!selectedProductId || recipeIngredients.length === 0}
                className="px-4 py-2.5 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 border border-indigo-200 dark:border-indigo-800 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Copy className="w-4 h-4" />
                <span>Bu Reçeteyi Diğer Renklere Kopyala</span>
              </button>

              <button
                type="submit"
                className="bg-slate-900 hover:bg-indigo-600 text-white px-7 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-md flex items-center gap-2 cursor-pointer active:scale-98"
              >
                <Check className="w-4 h-4" />
                <span>Reçeteyi Kaydet</span>
              </button>
            </div>
          </div>
        </form>
      </Modal>

      {/* COPY RECIPE TO OTHER COLORS MODAL */}
      <Modal
        isOpen={isCopyModalOpen}
        onClose={() => setIsCopyModalOpen(false)}
        title="Reçeteyi Başka Renklere Kopyala"
        size="lg"
      >
        <form onSubmit={handleExecuteCopy} className="space-y-4">
          <div className="bg-indigo-50/70 dark:bg-slate-800/60 p-4 rounded-2xl border border-indigo-100 dark:border-slate-700 space-y-2">
            <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-300 font-black text-xs uppercase tracking-wide">
              <Copy className="w-4 h-4" />
              Kaynak Model & Reçete:
            </div>
            <div className="text-sm font-black text-slate-900 dark:text-slate-100">
              {currentProduct?.name} ({currentProduct?.code})
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2">
              <span>Kaynak Varyant:</span>
              <span className="font-black bg-white dark:bg-slate-900 px-2.5 py-0.5 rounded-lg border border-indigo-200 dark:border-slate-600 text-indigo-700 dark:text-indigo-400">
                {copySourceColor === 'all' ? '🌐 Genel (Tüm Renkler)' : `${copySourceColor} Rengi`}
              </span>
              <span className="text-slate-400">• ({recipeIngredients.length} malzeme)</span>
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider block">
              Hangi Renk Varyantlarına Kopyalansın?
            </label>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {currentProduct?.colors?.map(col => {
                const isSelected = copyTargetColors.includes(col);
                const isSource = col === copySourceColor;
                const alreadyHas = recipes.some(r => r.productId === selectedProductId && r.targetColor === col);

                return (
                  <button
                    key={`target-col-${col}`}
                    type="button"
                    disabled={isSource}
                    onClick={() => {
                      if (isSelected) {
                        setCopyTargetColors(copyTargetColors.filter(c => c !== col));
                      } else {
                        setCopyTargetColors([...copyTargetColors, col]);
                      }
                    }}
                    className={cn(
                      "p-3 rounded-xl border text-left flex flex-col gap-1 transition-all cursor-pointer relative",
                      isSource 
                        ? "opacity-40 cursor-not-allowed bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700" 
                        : isSelected
                          ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                          : "bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-indigo-400"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black uppercase tracking-wider">{col}</span>
                      {isSelected && <Check className="w-3.5 h-3.5" />}
                    </div>
                    <div className={cn("text-[10px]", isSelected ? "text-indigo-100" : "text-slate-400")}>
                      {isSource ? '(Mevcut Kaynak)' : alreadyHas ? '⚠️ Üzerine Yazılacak' : '✓ Yeni Reçete'}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Custom target color input */}
            <div className="pt-2">
              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block mb-1">
                Listede olmayan özel bir renk ekle:
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Örn: Siyah / Beyaz veya Taba"
                  className="flex-1 border border-slate-300 dark:border-slate-600 rounded-xl p-2 text-xs font-bold uppercase bg-white dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const val = (e.target as HTMLInputElement).value.trim();
                      if (val && !copyTargetColors.includes(val)) {
                        setCopyTargetColors([...copyTargetColors, val]);
                        (e.target as HTMLInputElement).value = '';
                      }
                    }
                  }}
                />
              </div>
            </div>
          </div>

          {copyFeedbackMsg && (
            <div className="p-3 bg-emerald-50 text-emerald-800 rounded-xl border border-emerald-200 text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>{copyFeedbackMsg}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setIsCopyModalOpen(false)}
              className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Vazgeç
            </button>
            <button
              type="submit"
              disabled={copyTargetColors.length === 0}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-colors disabled:opacity-50"
            >
              {copyTargetColors.length} Renge Kopyala & Kaydet
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
};
