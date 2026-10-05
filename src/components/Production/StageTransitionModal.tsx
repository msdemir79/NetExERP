import { useEffect, useState } from 'react';
import Modal from '../Modal';
import { productionService, PRODUCTION_STAGES_CONFIG } from '../../services/productionService';
import { showToast } from '../../lib/feedback';
import type { WorkOrder, ProductionStage } from '../../types';

interface StageTransitionModalProps {
  isOpen: boolean;
  onClose: () => void;
  workOrder: WorkOrder | null;
  productName?: string;
  initialTargetStage: ProductionStage;
  onDone: () => void;
}

const getStageInfo = (stageId: ProductionStage) =>
  PRODUCTION_STAGES_CONFIG.find((s) => s.id === stageId) || PRODUCTION_STAGES_CONFIG[0];

export default function StageTransitionModal({
  isOpen,
  onClose,
  workOrder,
  productName,
  initialTargetStage,
  onDone,
}: StageTransitionModalProps) {
  const [targetStage, setTargetStage] = useState<ProductionStage>('cutting');
  const [operator, setOperator] = useState('');
  const [scrap, setScrap] = useState(0);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setTargetStage(initialTargetStage);
    setOperator(workOrder?.operator || '');
    setScrap(0);
    setNotes('');
  }, [isOpen, workOrder?.id, initialTargetStage]);

  const handleExecute = async () => {
    if (!workOrder) return;
    try {
      await productionService.advanceWorkOrderStage(workOrder.id!, targetStage, {
        operator: operator || undefined,
        scrapQuantity: scrap > 0 ? scrap : undefined,
        notes: notes || undefined,
      });
      onClose();
      onDone();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Üretim Aşaması İlerlemesi">
      {workOrder && (
        <div className="space-y-4">
          <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
            <div className="text-[10px] font-bold text-slate-400 uppercase">İş Emri & Model</div>
            <div className="text-base font-black text-slate-900 dark:text-slate-100">
              {productName} ({workOrder.barcode})
            </div>
            <div className="text-xs font-bold text-indigo-700">
              Mevcut Aşama: {getStageInfo(workOrder.currentStage).label}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Hedef Aşama</label>
            <select
              value={targetStage}
              onChange={(e) => setTargetStage(e.target.value as ProductionStage)}
              className="w-full border border-slate-300 rounded-xl p-3 text-sm font-black text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 focus:outline-none"
            >
              {PRODUCTION_STAGES_CONFIG.map((st) => (
                <option key={st.id} value={st.id}>{st.label}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">İşleyen Operatör</label>
              <input
                type="text"
                placeholder="Örn: Ahmet Usta"
                value={operator}
                onChange={(e) => setOperator(e.target.value)}
                className="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Fire / Iskarta (Adet)</label>
              <input
                type="number"
                min="0"
                value={scrap}
                onChange={(e) => setScrap(Number(e.target.value))}
                className="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Aşama Notu</label>
            <input
              type="text"
              placeholder="Örn: Kesim tamamlandı, lazer baskıya aktarıldı."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={handleExecute}
            className="w-full bg-indigo-600 hover:bg-slate-900 text-white py-3.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-md"
          >
            Aşamayı Onayla ve Geçişi Kaydet
          </button>
        </div>
      )}
    </Modal>
  );
}
