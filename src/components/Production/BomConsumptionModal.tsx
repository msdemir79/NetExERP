import React, { useState, useEffect } from 'react';
import { 
  Package, 
  Layers, 
  ArrowRight, 
  CheckCircle2, 
  AlertTriangle, 
  Loader2, 
  RefreshCw, 
  Plus, 
  Minus, 
  Sparkles,
  Info,
  Check,
  Building2,
  Calendar
} from 'lucide-react';
import Modal from '../Modal';
import { StatusPill } from '../Common/DataGrid';
import { api } from '../../api/client';
import { productionService } from '../../services/productionService';
import { useApiQuery } from '../../hooks/useApiQuery';
import { useColorMaster } from '../Colors/useColorMaster';
import type { Product, Recipe } from '../../types';

interface BomConsumptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialProductId?: number;
  selectedProductId?: number;
  onSuccess?: () => void;
}

export default function BomConsumptionModal({
  isOpen,
  onClose,
  initialProductId,
  selectedProductId,
  onSuccess
}: BomConsumptionModalProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [targetProductId, setTargetProductId] = useState<number>(initialProductId || selectedProductId || 0);

  useEffect(() => {
    if (initialProductId) {
      setTargetProductId(initialProductId);
    } else if (selectedProductId) {
      setTargetProductId(selectedProductId);
    }
  }, [initialProductId, selectedProductId]);
  const [quantity, setQuantity] = useState<number>(1);
  const [selectedColor, setSelectedColor] = useState<string>('Siyah');
  const [selectedSize, setSelectedSize] = useState<string>('Standart');
  const [operatorName, setOperatorName] = useState<string>('Üretim Sorumlusu');
  const [notes, setNotes] = useState<string>('BOM reçetesine göre otomatik hammadde sarfiyat düşümü');

  const [preview, setPreview] = useState<any>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Renk seçenekleri merkezî renk kartlarından, beden seçenekleri stok ayarlarından gelir
  const colorMaster = useColorMaster();
  const systemSettings = useApiQuery(() => api.settings.get('global_settings'), [], ['settings']);
  const shoeSizeList = systemSettings?.stock?.defaultShoeSizes?.length
    ? systemSettings.stock.defaultShoeSizes
    : ['36', '37', '38', '39', '40', '41', '42', '43', '44', '45'];
  const sizeOptions = Array.from(new Set(['Standart', ...shoeSizeList, selectedSize]));
  const colorOptions = Array.from(new Set([selectedColor, ...colorMaster.map(c => c.name)])).filter(Boolean);

  // Load products list (finished footwear)
  useEffect(() => {
    async function loadData() {
      const all = await api.products.list();
      const finished = all.filter(p => p.categoryType === 'finished' || p.isFootwear);
      setProducts(finished.length > 0 ? finished : all);
      if (!targetProductId && (finished.length > 0 || all.length > 0)) {
        setTargetProductId(finished[0]?.id || all[0]?.id || 0);
      }
    }
    if (isOpen) {
      loadData();
      setExecutionResult(null);
      setError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (selectedProductId) {
      setTargetProductId(selectedProductId);
    }
  }, [selectedProductId]);

  // Fetch preview when product, quantity or variant changes
  useEffect(() => {
    async function updatePreview() {
      if (!targetProductId || quantity <= 0) {
        setPreview(null);
        return;
      }
      setIsLoadingPreview(true);
      setError(null);
      try {
        const result = await productionService.previewRecipeConsumption({
          productId: targetProductId,
          quantity,
          color: selectedColor,
          size: selectedSize
        });
        setPreview(result);
      } catch (err: any) {
        console.error('Reçete önizleme hatası:', err);
        setError(err.message || 'Reçete önizlemesi yüklenemedi.');
      } finally {
        setIsLoadingPreview(false);
      }
    }

    if (isOpen && targetProductId) {
      updatePreview();
    }
  }, [targetProductId, quantity, selectedColor, selectedSize, isOpen]);

  const handleExecuteConsumption = async () => {
    if (!targetProductId || quantity <= 0) return;
    setIsExecuting(true);
    setError(null);

    try {
      const res = await productionService.consumeRecipeMaterialsDirectly({
        productId: targetProductId,
        quantity,
        color: selectedColor,
        size: selectedSize,
        operator: operatorName,
        notes: notes
      });

      setExecutionResult(res);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      console.error('Sarfiyat düşüm hatası:', err);
      setError(err.message || 'Sarfiyat düşülürken hata oluştu.');
    } finally {
      setIsExecuting(false);
    }
  };

  const selectedProduct = products.find(p => p.id === targetProductId);
  const finishedUnit = preview?.finishedProduct?.unit || selectedProduct?.unit || 'Çift';

  const sufficientCount = (preview?.ingredients || []).filter((i: any) => i.isSufficient).length;
  const insufficientCount = (preview?.ingredients || []).filter((i: any) => !i.isSufficient).length;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="BOM (Ürün Reçetesi) & Otomatik Sarfiyat Düşümü"
      className="max-w-5xl max-h-[90vh] overflow-y-auto"
    >
      <div className="space-y-4">
        {/* Info Banner */}
        <div className="p-3.5 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 rounded-2xl flex items-start gap-3 text-xs text-indigo-950 dark:text-indigo-200">
          <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-bold">Otomatik Hammadde Tüketim & Sarfiyat Motoru</p>
            <p className="text-[11px] text-indigo-800 dark:text-indigo-300">
              Üretilen ayakkabı miktarına göre, ürün reçetesinde (BOM) tanımlı deri (dm²), taban (çift), astar ve bağcık miktarları hammadde deposundan anında düşülür ve mamul ayakkabı stoğu artırılır.
            </p>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 rounded-xl text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Execution Result Success Panel */}
        {executionResult ? (
          <div className="bg-emerald-50 dark:bg-emerald-950/30 border-2 border-emerald-500/40 p-5 rounded-3xl space-y-4 text-emerald-950 dark:text-emerald-200 animate-in fade-in">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-black text-sm text-emerald-900 dark:text-emerald-200">
                  Otomatik Sarfiyat Başarıyla Tamamlandı!
                </h3>
                <p className="text-xs text-emerald-700 dark:text-emerald-300">
                  {executionResult.finishedProduct.name} modelinden {executionResult.finishedProduct.quantityAdded} Çift üretildi ve hammaddeler depodan otomatik düşüldü.
                </p>
              </div>
            </div>

            <div className="border border-emerald-200 dark:border-emerald-800/80 rounded-2xl overflow-hidden bg-white dark:bg-slate-900 text-xs">
              <div className="bg-emerald-100/70 dark:bg-emerald-950/70 px-3.5 py-2 font-black text-emerald-900 dark:text-emerald-200 border-b border-emerald-200 dark:border-emerald-800">
                Depodan Düşülen Hammadde Sarfiyat Listesi
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {executionResult.consumedIngredients.map((item: any, idx: number) => (
                  <div key={idx} className="p-3 flex items-center justify-between text-slate-800 dark:text-slate-200">
                    <div>
                      <span className="font-bold block">{item.name}</span>
                      <span className="text-[10px] text-slate-500 font-mono">Kod: {item.code}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-black text-rose-600 dark:text-rose-400 block font-mono">
                        -{item.totalConsumed} {item.unit}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        Kalan Stok: {item.remainingStock} {item.unit}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setExecutionResult(null);
                }}
                className="py-2 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Yeni Sarfiyat Gerçekleştir
              </button>
              <button
                type="button"
                onClick={onClose}
                className="py-2 px-4 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Kapat
              </button>
            </div>
          </div>
        ) : (
          /* Form & Live Preview */
          <div className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
              {/* Sol: üretim formu */}
              <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-800/40 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs">
              <div className="col-span-2 space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">
                  Üretilen Ayakkabı Modeli
                </label>
                <select
                  value={targetProductId}
                  onChange={(e) => setTargetProductId(Number(e.target.value))}
                  className="w-full py-2 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium"
                >
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.code}) - Mevcut Stok: {p.stock || 0} {p.unit || 'Çift'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Quantity Selector with quick 1-pair / 10-pair / 50-pair buttons */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span>Üretim Miktarı</span>
                  <span className="text-[10px] text-indigo-600 font-mono font-bold">{quantity} Çift</span>
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="p-2 rounded-xl bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 cursor-pointer"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <input
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full text-center py-2 px-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-black text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setQuantity(quantity + 1)}
                    className="p-2 rounded-xl bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Color */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">
                  Renk
                </label>
                <select
                  value={selectedColor}
                  onChange={(e) => setSelectedColor(e.target.value)}
                  className="w-full py-2 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium"
                >
                  {colorOptions.map(c => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {/* Size */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">
                  Beden
                </label>
                <select
                  value={selectedSize}
                  onChange={(e) => setSelectedSize(e.target.value)}
                  className="w-full py-2 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium"
                >
                  {sizeOptions.map(s => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              {/* Operator */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">
                  Operatör
                </label>
                <input
                  type="text"
                  value={operatorName}
                  onChange={(e) => setOperatorName(e.target.value)}
                  className="w-full py-2 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium"
                />
              </div>

              {/* Notes */}
              <div className="col-span-2 space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">
                  Not
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="w-full py-2 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium"
                />
              </div>
            </div>

            {/* Quick Quantity Presets */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-[10px] text-slate-500 font-bold uppercase">Hızlı Miktar:</span>
              {[1, 5, 10, 25, 50, 100].map(q => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setQuantity(q)}
                  className={`px-2.5 py-1 rounded-lg font-mono font-bold text-xs transition-all cursor-pointer ${
                    quantity === q
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  {q} {q === 1 ? 'Çift (Test)' : 'Çift'}
                </button>
              ))}
            </div>
              </div>

              {/* Sağ: hammadde ihtiyaç listesi + yeterlilik durumları */}
            <div className="border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden bg-white dark:bg-slate-900 shadow-xs flex flex-col">
              <div className="bg-slate-100 dark:bg-slate-800/80 px-4 py-2.5 flex items-center justify-between border-b border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span className="text-xs font-black uppercase text-slate-800 dark:text-slate-200 tracking-wider">
                    {preview?.recipeName || 'BOM Ürün Reçetesi Sarfiyat Tablosu'}
                  </span>
                </div>
                <span className="text-[11px] font-bold text-slate-500">
                  Hesaplanan: <strong className="text-indigo-600">{quantity} Çift</strong> Ayakkabı
                </span>
              </div>

              {isLoadingPreview ? (
                <div className="p-8 text-center text-slate-500 text-xs flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                  <span>Reçete sarfiyatı hesaplanıyor...</span>
                </div>
              ) : preview?.hasRecipe ? (
                <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {preview.ingredients.map((ing: any, idx: number) => {
                    const isSufficient = ing.isSufficient;
                    return (
                      <div 
                        key={idx} 
                        className={`p-3.5 flex items-center justify-between transition-colors ${
                          !isSufficient ? 'bg-rose-50/40 dark:bg-rose-950/20' : ''
                        }`}
                      >
                        <div className="space-y-0.5 min-w-0 flex-1 pr-4">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-slate-900 dark:text-slate-100">
                              {ing.name}
                            </span>
                            {ing.department && (
                              <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                                {ing.department}
                              </span>
                            )}
                            {ing.isMatrixMatched && (
                              <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200">
                                Beden Eşleşmeli
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500">
                            Sarfiyat:{' '}
                            <strong className="text-slate-700 dark:text-slate-300 font-mono">
                              {ing.quantityPerPair} {ing.unit} / 1 {finishedUnit}
                            </strong>
                            {Number(ing.basisQty) > 1 && (
                              <span className="text-slate-600 dark:text-slate-400 font-semibold">
                                {' '}({ing.basisQty} {finishedUnit} için {ing.basisQuantity} {ing.unit})
                              </span>
                            )}
                            {' '}• Depo Stoğu: <span className="font-mono text-slate-700 dark:text-slate-300">{ing.currentStock} {ing.unit}</span>
                          </p>
                        </div>

                        {/* Quantity Needed and Remaining Stock */}
                        <div className="text-right shrink-0">
                          <div className="flex items-center justify-end gap-1.5 font-mono font-black text-sm text-rose-600 dark:text-rose-400">
                            <span>-{ing.totalNeeded}</span>
                            <span className="text-xs text-slate-500 font-semibold">{ing.unit}</span>
                          </div>
                          <div className="text-[10px] text-slate-500 flex items-center justify-end gap-1 mt-0.5">
                            <span>Kalan:</span>
                            <span className={`font-mono font-bold ${ing.remainingStockAfter < 0 ? 'text-rose-600' : 'text-slate-700 dark:text-slate-300'}`}>
                              {ing.remainingStockAfter} {ing.unit}
                            </span>
                          </div>
                          <div className="mt-1 flex justify-end">
                            {isSufficient ? (
                              <StatusPill tone="green">YETERLİ</StatusPill>
                            ) : (
                              <StatusPill tone="red">YETERSİZ</StatusPill>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-6 text-center space-y-2 text-slate-500 text-xs">
                  <AlertTriangle className="w-6 h-6 text-amber-500 mx-auto" />
                  <p className="font-bold text-slate-700 dark:text-slate-300">
                    Bu model için henüz bir BOM reçetesi tanımlanmamış.
                  </p>
                  <p className="text-[11px]">
                    Üretim Reçeteleri sekmesinden Deri, Taban, Astar ve Bağcık sarfiyatlarını ekleyebilirsiniz.
                  </p>
                </div>
              )}

              {/* Toplamlar */}
              {preview?.hasRecipe && !isLoadingPreview ? (
                <div className="border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-4 py-2 flex items-center justify-between text-[11px] font-bold">
                  <span className="text-slate-600 dark:text-slate-300">
                    Kalem: <span className="font-mono text-slate-900 dark:text-slate-100">{preview.ingredients.length}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <StatusPill tone="green">{sufficientCount} Yeterli</StatusPill>
                    {insufficientCount > 0 ? <StatusPill tone="red">{insufficientCount} Yetersiz</StatusPill> : null}
                  </span>
                </div>
              ) : null}
            </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={onClose}
                className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                İptal
              </button>

              <button
                type="button"
                disabled={isExecuting || !preview?.hasRecipe || !preview?.allSufficient}
                onClick={handleExecuteConsumption}
                className="py-2.5 px-6 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 shadow-md shadow-emerald-600/20 cursor-pointer"
              >
                {isExecuting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Stoğa İşleniyor...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Otomatik Sarfiyatı Düş & Stoğa İşle ({quantity} Çift)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
