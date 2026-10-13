import { Factory, PackageCheck } from 'lucide-react';
import { cn } from '../../lib/utils';
import { formatQuantity } from '../../lib/inventoryCalculator';
import ColorSwatch from '../Colors/ColorSwatch';
import { useColorHexByName } from '../Colors/useColorMaster';
import { PRODUCTION_STAGES_CONFIG } from '../../services/productionService';
import { useProductionDemand } from '../../services/productionDemand';
import type { DemandSide } from '../../services/productionDemand';

interface ProductionDemandPanelProps {
  productId: number;
  /** Ürün birimi (Çift / Adet / dm² …) — yalnızca etiket için */
  unit: string;
  /** Mevcut depo stoğu; hammadde tarafında açık ihtiyaç hesabında kullanılır */
  stock: number;
}

const stageLabel = (id: string) => PRODUCTION_STAGES_CONFIG.find(s => s.id === id)?.shortLabel ?? id;

/**
 * Stok kartında "üretimden dolayı bekleyen miktar" bloğu.
 * Modal açıkken mount olur; hesap paylaşımı useProductionDemand içindeki
 * uçuş-içi tekilleştirme ile yapılır.
 */
export default function ProductionDemandPanel({ productId, unit, stock }: ProductionDemandPanelProps) {
  const { demand, demandLoading } = useProductionDemand();
  const hexOf = useColorHexByName();
  const entry = demand.get(productId);

  if (demandLoading || !entry) return null;

  const colorChips = (side: DemandSide) => (
    <div className="flex flex-wrap gap-1.5">
      {side.byColor.map((line, i) => (
        <div
          key={`${line.color || 'genel'}-${i}`}
          className="px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm"
        >
          <div className="flex items-center gap-1.5">
            {line.color && <ColorSwatch name={line.color} hexCode={hexOf(line.color)} size={10} className="rounded-full" />}
            <span className="text-[11px] font-black uppercase text-slate-800 dark:text-slate-200">
              {line.color || 'Genel'}
            </span>
            <span className="text-[11px] font-black font-mono text-slate-900 dark:text-slate-100">
              {formatQuantity(line.quantity)}
            </span>
            {line.workOrderCount > 1 && (
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                ({line.workOrderCount} İE)
              </span>
            )}
          </div>
          {line.sizes.length > 0 && (
            <div className="mt-0.5 font-mono text-[10px] font-bold text-slate-600 dark:text-slate-300">
              {line.sizes.map(s => `${s.size}:${formatQuantity(s.quantity)}`).join(' · ')}
            </div>
          )}
        </div>
      ))}
    </div>
  );

  const workOrderList = (side: DemandSide) => (
    <div className="space-y-0.5">
      {side.workOrders.slice(0, 5).map(wo => (
        <div key={wo.id} className="flex items-center gap-2 text-[10px] font-bold text-slate-600 dark:text-slate-300">
          <span className="font-mono text-slate-800 dark:text-slate-200">{wo.barcode}</span>
          <span className="truncate">{wo.customerName || wo.orderNumber || '—'}</span>
          <span className="ml-auto shrink-0 font-mono">{formatQuantity(wo.quantity)}</span>
          <span className="shrink-0 rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-slate-600 dark:text-slate-300">
            {stageLabel(wo.currentStage)}
          </span>
        </div>
      ))}
      {side.workOrders.length > 5 && (
        <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
          +{side.workOrders.length - 5} iş emri daha
        </div>
      )}
    </div>
  );

  const openNeed = entry.material ? Math.max(0, entry.material.total - (stock || 0)) : 0;

  return (
    <div className="space-y-3">
      {entry.material && (
        <div className="p-4 bg-amber-50 dark:bg-amber-950/25 rounded-2xl border border-amber-200 dark:border-amber-800/60 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-black text-amber-900 dark:text-amber-300 uppercase tracking-wider flex items-center gap-2">
              <Factory className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              Üretim İçin Bekleyen İhtiyaç
            </h4>
            <span className="text-[10px] font-bold text-amber-800 dark:text-amber-300 bg-white/70 dark:bg-slate-900/50 px-2.5 py-0.5 rounded-full border border-amber-200 dark:border-amber-800/60">
              {entry.material.workOrderCount} İş Emri · malzemesi düşülmemiş
            </span>
          </div>

          <div className="flex flex-wrap items-end gap-x-6 gap-y-1">
            <div>
              <div className="text-[10px] font-bold text-amber-800/80 dark:text-amber-400/80 uppercase">Toplam İhtiyaç</div>
              <div className="text-2xl font-black font-mono text-amber-900 dark:text-amber-200">
                {formatQuantity(entry.material.total)} <span className="text-xs uppercase">{unit}</span>
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-amber-800/80 dark:text-amber-400/80 uppercase">Stok Sonrası Açık</div>
              <div className={cn(
                'text-2xl font-black font-mono',
                openNeed > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400',
              )}>
                {formatQuantity(openNeed)} <span className="text-xs uppercase">{unit}</span>
              </div>
            </div>
          </div>

          {colorChips(entry.material)}
          {workOrderList(entry.material)}
        </div>
      )}

      {entry.output && (
        <div className="p-4 bg-indigo-50 dark:bg-indigo-950/25 rounded-2xl border border-indigo-200 dark:border-indigo-800/60 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-black text-indigo-900 dark:text-indigo-300 uppercase tracking-wider flex items-center gap-2">
              <PackageCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              Üretimden Depoya Girecek
            </h4>
            <span className="text-[10px] font-bold text-indigo-800 dark:text-indigo-300 bg-white/70 dark:bg-slate-900/50 px-2.5 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-800/60">
              {entry.output.workOrderCount} İş Emri
            </span>
          </div>

          <div className="text-2xl font-black font-mono text-indigo-900 dark:text-indigo-200">
            {formatQuantity(entry.output.total)} <span className="text-xs uppercase">{unit}</span>
          </div>

          {colorChips(entry.output)}
          {workOrderList(entry.output)}
        </div>
      )}
    </div>
  );
}
