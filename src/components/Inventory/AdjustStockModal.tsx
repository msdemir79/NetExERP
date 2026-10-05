import React, { useState, useEffect, useMemo } from 'react';
import Modal from '../Modal';
import { cn } from '../../lib/utils';
import { formatQuantity } from '../../lib/inventoryCalculator';
import { inventoryService } from '../../services/inventoryService';
import { showToast } from '../../lib/feedback';
import { ColorSelect } from '../Colors/ColorSelect';
import { Product } from '../../types';

interface AdjustStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  onSubmitted: () => void;
}

export default function AdjustStockModal({ isOpen, onClose, product, onSubmitted }: AdjustStockModalProps) {
  const [adjustData, setAdjustData] = useState({
    type: 'in' as 'in' | 'out',
    quantity: 1,
    selectedColor: '',
    selectedColorId: null as number | null,
    selectedSize: '',
    description: 'Manuel stok düzeltme'
  });

  const restrictColorIds = useMemo(
    () => (product?.colorRefs || []).map((ref) => Number(ref.id)).filter((id) => Number.isFinite(id) && id > 0),
    [product?.colorRefs]
  );

  useEffect(() => {
    if (isOpen && product) {
      const firstRef = (product.colorRefs || [])[0];
      setAdjustData({
        type: 'in',
        quantity: 1,
        selectedColor: firstRef?.name || product.colors?.[0] || '',
        selectedColorId: firstRef?.id ?? null,
        selectedSize: product.variantBarcodes?.[0]?.size || '',
        description: 'Stok hareketi'
      });
    }
  }, [isOpen, product?.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product?.id) return;

    try {
      const variant = (product.hasSizeVariants || product.isFootwear) && adjustData.selectedColor && adjustData.selectedSize
        ? { color: adjustData.selectedColor, size: adjustData.selectedSize }
        : undefined;

      await inventoryService.adjustStock(
        product.id,
        Number(adjustData.quantity) || 1,
        adjustData.type,
        adjustData.description,
        variant
      );

      onClose();
      onSubmitted();
    } catch (err: any) {
      showToast('Stok hareketi işlenirken hata oluştu: ' + (err.message || err), 'error');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Hızlı Stok Hareketi"
      className="max-w-md"
    >
      {product && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl space-y-1">
            <div className="text-[10px] font-bold text-slate-400 uppercase">Seçili Kart</div>
            <div className="text-xs font-black text-slate-900 dark:text-slate-100">{product.name} ({product.code})</div>
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Güncel Stok: <span className="font-mono font-black text-indigo-600">{formatQuantity(product.stock)} {product.unit}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">İşlem Türü</label>
              <select
                value={adjustData.type}
                onChange={e => setAdjustData(prev => ({ ...prev, type: e.target.value as 'in' | 'out' }))}
                className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-bold outline-none"
              >
                <option value="in">Stok Girişi (+)</option>
                <option value="out">Stok Çıkışı (-)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Miktar ({product.unit})</label>
              <input
                type="number"
                required
                step="any"
                min="0.01"
                value={adjustData.quantity}
                onChange={e => setAdjustData(prev => ({ ...prev, quantity: Number(e.target.value) }))}
                className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-black outline-none"
              />
            </div>
          </div>

          {/* If product has colors */}
          {(product.colors?.length || product.colorRefs?.length) ? (
            <div className={cn("grid gap-3", (product.hasSizeVariants || product.isFootwear) ? "grid-cols-2" : "grid-cols-1")}>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">İşlem Yapılacak Renk</label>
                <ColorSelect
                  value={adjustData.selectedColorId}
                  valueName={adjustData.selectedColor || null}
                  restrictToIds={restrictColorIds.length > 0 ? restrictColorIds : undefined}
                  placeholder="Genel / Tümü"
                  onChange={(colorId, color) => setAdjustData(prev => ({ ...prev, selectedColor: color?.name || '', selectedColorId: colorId }))}
                />
              </div>

              {(product.hasSizeVariants || product.isFootwear) && (
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Numara / Beden</label>
                  <select
                    value={adjustData.selectedSize}
                    onChange={e => setAdjustData(prev => ({ ...prev, selectedSize: e.target.value }))}
                    className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-bold outline-none"
                  >
                    <option value="">Tüm Bedenler</option>
                    {product.variantBarcodes?.map((v, i) => (
                      <option key={i} value={v.size}>{v.size}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          ) : null}

          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Hareket Açıklaması</label>
            <input
              type="text"
              required
              value={adjustData.description}
              onChange={e => setAdjustData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Örn: İmalat girişi, Fire çıkışı, Sayım düzeltmesi..."
              className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-bold outline-none"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-slate-900 hover:bg-indigo-600 text-white py-3 rounded-xl font-black text-xs uppercase tracking-wider transition-colors shadow-md"
          >
            Hareketi Onayla ve Kaydet
          </button>
        </form>
      )}
    </Modal>
  );
}
