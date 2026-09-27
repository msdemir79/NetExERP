import React, { useEffect, useMemo, useState } from 'react';
import Modal from '../Modal';
import { cn } from '../../lib/utils';
import { productionService } from '../../services/productionService';
import type { Product } from '../../types';

interface AddWorkOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[] | undefined;
  onCreated: () => void;
}

export default function AddWorkOrderModal({ isOpen, onClose, products, onCreated }: AddWorkOrderModalProps) {
  const [manualWoProductId, setManualWoProductId] = useState<number>(0);
  const [manualWoColor, setManualWoColor] = useState<string>('');
  const [manualWoSize, setManualWoSize] = useState<string>('');

  const productMap = useMemo(() => new Map((products || []).map((p) => [p.id!, p])), [products]);

  useEffect(() => {
    if (!isOpen) return;
    setManualWoProductId(0);
    setManualWoColor('');
    setManualWoSize('');
  }, [isOpen]);

  const handleCreateManualWorkOrder = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const productId = Number(formData.get('productId'));
    const quantity = Number(formData.get('quantity'));
    const color = formData.get('color') as string;
    const size = formData.get('size') as string;
    const targetDateStr = formData.get('targetDate') as string;
    const notes = formData.get('notes') as string;

    try {
      await productionService.createWorkOrder({
        productId,
        quantity,
        color: color || undefined,
        size: size || undefined,
        targetDate: targetDateStr ? new Date(targetDateStr) : undefined,
        notes: notes || undefined,
      });
      onClose();
      onCreated();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Yeni Üretim İş Emri">
      <form onSubmit={handleCreateManualWorkOrder} className="space-y-4">
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Üretilecek Model / Mamul</label>
            <span className="text-[9px] font-bold text-indigo-600">Yalnızca Bitmiş Mamuller</span>
          </div>
          <select
            required
            name="productId"
            value={manualWoProductId || ''}
            onChange={(e) => {
              const pId = Number(e.target.value);
              setManualWoProductId(pId);
              const selectedP = productMap.get(pId);
              if (selectedP?.colors && selectedP.colors.length > 0) {
                setManualWoColor(selectedP.colors[0]);
              }
            }}
            className="w-full border border-slate-300 rounded-xl p-3 text-sm font-bold text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          >
            <option value="">Mamul Model Seçiniz...</option>
            {products?.filter((p) => p.categoryType === 'finished' || (!p.categoryType && !p.isRawMaterial && p.categoryType !== 'semi_finished' && p.categoryType !== 'accessory')).map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.code}) {p.subType ? `• ${p.subType}` : ''}</option>
            ))}
          </select>
        </div>

        {manualWoProductId > 0 && productMap.get(manualWoProductId)?.colors && (
          <div className="space-y-1.5 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Model Renk Seçimi:</label>
            <div className="flex flex-wrap gap-1.5">
              {productMap.get(manualWoProductId)!.colors!.map((col) => (
                <button
                  key={col}
                  type="button"
                  onClick={() => setManualWoColor(col)}
                  className={cn(
                    'text-xs font-black px-3 py-1.5 rounded-lg border transition-all uppercase',
                    manualWoColor === col
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                      : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-300 hover:border-indigo-300'
                  )}
                >
                  {col}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Üretim Miktarı (Çift / Adet)</label>
            <input
              type="number"
              required
              min="1"
              defaultValue="100"
              name="quantity"
              className="w-full border border-slate-300 rounded-xl p-3 text-sm font-black text-slate-900 dark:text-slate-100 focus:outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Hedef Bitiş Tarihi</label>
            <input
              type="date"
              name="targetDate"
              className="w-full border border-slate-300 rounded-xl p-3 text-sm font-bold text-slate-900 dark:text-slate-100 focus:outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Renk / Varyant</label>
            <input
              type="text"
              name="color"
              value={manualWoColor}
              onChange={(e) => setManualWoColor(e.target.value)}
              placeholder="Örn: Siyah"
              className="w-full border border-slate-300 rounded-xl p-3 text-sm font-bold text-slate-900 dark:text-slate-100 focus:outline-none uppercase"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Beden / Asorti (Opsiyonel)</label>
            <input
              type="text"
              name="size"
              value={manualWoSize}
              onChange={(e) => setManualWoSize(e.target.value)}
              placeholder="Örn: 40-44 Asorti"
              className="w-full border border-slate-300 rounded-xl p-3 text-sm font-bold text-slate-900 dark:text-slate-100 focus:outline-none"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Notlar / Özel Talimatlar</label>
          <textarea
            name="notes"
            rows={2}
            placeholder="Örn: Kalıp 224 kullanılacak, özel logo baskısı yapılacak..."
            className="w-full border border-slate-300 rounded-xl p-3 text-sm font-medium text-slate-900 dark:text-slate-100 focus:outline-none"
          />
        </div>

        <button
          type="submit"
          className="w-full bg-slate-900 hover:bg-indigo-600 text-white py-3.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-md"
        >
          İş Emrini Başlat & Barkod Oluştur
        </button>
      </form>
    </Modal>
  );
}
