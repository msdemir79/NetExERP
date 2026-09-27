import { useState } from 'react';
import { Sliders, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { calculateAssortmentBreakdown } from '../../lib/assortmentHelpers';
import type { AssortmentTemplate } from '../../types';

export interface MatrixEditingTarget {
  productId: number;
  productName: string;
  color: string;
  totalQuantity: number;
  currentSizes: { [size: string]: number };
}

interface PoMatrixEditorModalProps {
  target: MatrixEditingTarget;
  assortmentTemplates: AssortmentTemplate[];
  onClose: () => void;
  onSave: (newSizes: { [size: string]: number }, applyToDb: boolean) => Promise<void>;
}

export function PoMatrixEditorModal({ target, assortmentTemplates, onClose, onSave }: PoMatrixEditorModalProps) {
  const [selectedTemplateIdForEdit, setSelectedTemplateIdForEdit] = useState<number | string>('');
  const [customSizeInputs, setCustomSizeInputs] = useState<{ size: string; quantity: number }[]>(() => {
    const inputs: { size: string; quantity: number }[] = [];
    const sizes = Object.keys(target.currentSizes);
    if (sizes.length > 0) {
      sizes.sort((a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0)).forEach(sz => {
        inputs.push({ size: sz, quantity: target.currentSizes[sz] || 0 });
      });
    } else {
      ['40', '41', '42', '43', '44', '45'].forEach(sz => {
        inputs.push({ size: sz, quantity: 0 });
      });
    }
    return inputs;
  });
  const [isApplyingMatrixToDb, setIsApplyingMatrixToDb] = useState(false);

  const handleSelectTemplateInEditor = (templateIdStr: string) => {
    setSelectedTemplateIdForEdit(templateIdStr);
    if (!templateIdStr) return;

    const tmplId = Number(templateIdStr);
    const tmpl = assortmentTemplates.find(t => t.id === tmplId);
    if (!tmpl || tmpl.items.length === 0) return;

    const calculated = calculateAssortmentBreakdown(target.totalQuantity, tmpl.items);
    const newInputs = tmpl.items.map(ti => ({
      size: ti.size,
      quantity: calculated[ti.size] || 0
    }));
    setCustomSizeInputs(newInputs);
  };

  const handleSave = async (applyToDb: boolean) => {
    const newMap: { [size: string]: number } = {};
    customSizeInputs.forEach(inp => {
      if (inp.quantity > 0) {
        newMap[inp.size] = inp.quantity;
      }
    });

    setIsApplyingMatrixToDb(true);
    try {
      await onSave(newMap, applyToDb);
      onClose();
    } catch (err) {
      console.error('Beden matrisi kaydedilirken hata:', err);
    } finally {
      setIsApplyingMatrixToDb(false);
    }
  };

  return (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-3 bg-black/75 backdrop-blur-xs">
          <div className="w-full max-w-xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-5 space-y-4 text-white max-h-[90vh] flex flex-col overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-indigo-400" />
                <h3 className="text-sm font-black text-white">
                  Beden / Asorti Dağılımını Düzenle
                </h3>
              </div>
              <button
                type="button"
                onClick={() => onClose()}
                className="p-1 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-slate-800/80 rounded-xl space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Malzeme:</span>
                <span className="font-black text-white">{target.productName} ({target.color})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Hedef Toplam Çift:</span>
                <span className="font-mono font-black text-emerald-400 text-sm">{target.totalQuantity.toLocaleString('tr-TR')} Çift</span>
              </div>
            </div>

            {/* Quick Template Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300 block">
                Hazır Asorti Şablonu Uygula:
              </label>
              <select
                value={selectedTemplateIdForEdit}
                onChange={(e) => handleSelectTemplateInEditor(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-hidden focus:border-indigo-500"
              >
                <option value="">Şablon Seçin veya Manuel Girin...</option>
                {assortmentTemplates.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.items.map(i => `${i.size}:${i.quantity}`).join(', ')})
                  </option>
                ))}
              </select>
            </div>

            {/* Size Number Inputs */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300 block">
                Beden Başına Çift Adetleri:
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 max-h-48 overflow-y-auto pr-1">
                {customSizeInputs.map((inp, idx) => (
                  <div key={idx} className="p-2 bg-slate-800 border border-slate-700 rounded-xl space-y-1 text-center">
                    <span className="text-[10px] font-black text-slate-400 uppercase">NO {inp.size}</span>
                    <input
                      type="number"
                      min={0}
                      value={inp.quantity === 0 ? '' : inp.quantity}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10) || 0;
                        const copy = [...customSizeInputs];
                        copy[idx].quantity = val;
                        setCustomSizeInputs(copy);
                      }}
                      placeholder="0"
                      className="w-full bg-slate-900 border border-slate-600 rounded-lg px-2 py-1 text-center font-mono font-black text-xs text-white focus:outline-hidden focus:border-indigo-400"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Sum indicator */}
            {(() => {
              const currentSum = customSizeInputs.reduce((acc, curr) => acc + (curr.quantity || 0), 0);
              const diff = target.totalQuantity - currentSum;
              return (
                <div className={cn(
                  "p-2.5 rounded-xl border text-xs font-bold flex items-center justify-between",
                  diff === 0 
                    ? "bg-emerald-950/40 border-emerald-600/50 text-emerald-300" 
                    : "bg-amber-950/40 border-amber-600/50 text-amber-300"
                )}>
                  <span>Girilen Toplam: {currentSum.toLocaleString('tr-TR')} Çift</span>
                  <span>{diff === 0 ? '✓ Tam Uyumlu' : `Fark: ${diff > 0 ? `+${diff}` : diff} Çift`}</span>
                </div>
              );
            })()}

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => onClose()}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={() => handleSave(false)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-xs font-bold"
              >
                Önizlemeye Uygula
              </button>
              <button
                type="button"
                disabled={isApplyingMatrixToDb}
                onClick={() => handleSave(true)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-black shadow-md shadow-indigo-900/40"
              >
                {isApplyingMatrixToDb ? 'Kaydediliyor...' : 'Siparişi Güncelle & Kaydet'}
              </button>
            </div>
          </div>
        </div>
  );
}
