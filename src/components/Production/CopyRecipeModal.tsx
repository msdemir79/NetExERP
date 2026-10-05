import React from 'react';
import { Copy, Check, CheckCircle2, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import Modal from '../Modal';
import { ColorSelect } from '../Colors/ColorSelect';
import ColorSwatch from '../Colors/ColorSwatch';
import type { Product, Recipe } from '../../types';

interface CopyRecipeModalProps {
  isCopyModalOpen: boolean;
  setIsCopyModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  copySourceColor: string;
  copyTargetColors: string[];
  setCopyTargetColors: React.Dispatch<React.SetStateAction<string[]>>;
  copyFeedbackMsg: string | null;
  handleExecuteCopy: (e: React.FormEvent) => Promise<void>;
  currentProduct?: Product;
  recipes: Recipe[];
  selectedProductId: number;
  materialCount: number;
}

const CopyRecipeModal: React.FC<CopyRecipeModalProps> = ({
  isCopyModalOpen,
  setIsCopyModalOpen,
  copySourceColor,
  copyTargetColors,
  setCopyTargetColors,
  copyFeedbackMsg,
  handleExecuteCopy,
  currentProduct,
  recipes,
  selectedProductId,
  materialCount
}) => {
  /** Ürün kartında tanımlı olmayıp seçilen hedef renkler (ayrıca listelenir). */
  const cardColors = currentProduct?.colors || [];
  const extraTargetColors = copyTargetColors.filter(col => !cardColors.includes(col));

  return (
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
            <span className="text-slate-400">• ({materialCount} malzeme)</span>
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
                    <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider">
                      <ColorSwatch
                        name={col}
                        hexCode={currentProduct?.colorRefs?.find(ref => (ref.name || '').toLocaleUpperCase('tr') === col.toLocaleUpperCase('tr'))?.hexCode}
                        size={14}
                        className="rounded-full shrink-0"
                      />
                      {col}
                    </span>
                    {isSelected && <Check className="w-3.5 h-3.5" />}
                  </div>
                  <div className={cn("text-[10px]", isSelected ? "text-indigo-100" : "text-slate-400")}>
                    {isSource ? '(Mevcut Kaynak)' : alreadyHas ? '⚠️ Üzerine Yazılacak' : '✓ Yeni Reçete'}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Kartta tanımlı olmayan hedef renkler merkezî listeden seçilir */}
          <div className="pt-2 space-y-2">
            <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block">
              Listede olmayan bir renk ekle:
            </label>
            <ColorSelect
              placeholder="Merkezî renk kartından seçin..."
              onChange={(_colorId, color) => {
                const name = (color?.name || '').trim();
                if (name && !copyTargetColors.includes(name)) setCopyTargetColors([...copyTargetColors, name]);
              }}
            />

            {extraTargetColors.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {extraTargetColors.map(col => (
                  <span
                    key={`extra-col-${col}`}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30 text-[11px] font-black uppercase text-indigo-800 dark:text-indigo-200"
                  >
                    {col}
                    <button
                      type="button"
                      title="Listeden çıkar"
                      onClick={() => setCopyTargetColors(copyTargetColors.filter(c => c !== col))}
                      className="text-indigo-400 hover:text-rose-600 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
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
  );
};

export default CopyRecipeModal;
