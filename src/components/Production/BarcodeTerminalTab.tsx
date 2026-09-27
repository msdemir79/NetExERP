import React from 'react';
import { Volume2, Camera, Barcode, CheckCircle2, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';
import { productionService, PRODUCTION_STAGES_CONFIG } from '../../services/productionService';
import DataGrid, { GridColumn, StatusPill } from '../Common/DataGrid';
import type { WorkOrder, ProductionStage, Product } from '../../types';

// Audio feedback helper for shopfloor scanner
function playBeepSound(type: 'success' | 'error' = 'success') {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'success') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
      osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.15); // E6
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.16);
    } else {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.26);
    }
  } catch {
    // AudioContext blocked or not supported, ignore silently
  }
}

interface BarcodeTerminalTabProps {
  onScanSuccess: () => void;
  onOpenCameraScanner: () => void;
}

export default function BarcodeTerminalTab({ onScanSuccess, onOpenCameraScanner }: BarcodeTerminalTabProps) {
  const [scannedCode, setScannedCode] = React.useState('');
  const [scannerOperator, setScannerOperator] = React.useState('İstasyon Operatörü');
  const [scanFeedback, setScanFeedback] = React.useState<{
    type: 'success' | 'error';
    title: string;
    message: string;
    workOrder?: WorkOrder;
    product?: Product;
    timestamp: Date;
  } | null>(null);
  const [scanHistory, setScanHistory] = React.useState<{
    id: string;
    barcode: string;
    productName: string;
    prevStage: string;
    newStage: string;
    time: string;
  }[]>([]);

  const barcodeInputRef = React.useRef<HTMLInputElement>(null);

  type ScanHistoryRow = {
    id: string;
    barcode: string;
    productName: string;
    prevStage: string;
    newStage: string;
    time: string;
  };

  const scanHistoryColumns = React.useMemo<GridColumn<ScanHistoryRow>[]>(() => [
    {
      key: 'time', title: 'Saat', width: 'w-24',
      render: (hist) => <span className="font-mono font-bold text-slate-500 dark:text-slate-400">{hist.time}</span>,
    },
    {
      key: 'barcode', title: 'Barkod',
      render: (hist) => <span className="font-mono font-black text-indigo-600">{hist.barcode}</span>,
      filterValue: (hist) => hist.barcode,
    },
    {
      key: 'productName', title: 'Model / Ürün',
      render: (hist) => <span className="font-black text-slate-900 dark:text-slate-100">{hist.productName}</span>,
      filterValue: (hist) => hist.productName,
    },
    {
      key: 'prevStage', title: 'Önceki Aşama',
      render: (hist) => <span className="font-bold text-slate-500 dark:text-slate-400">{hist.prevStage}</span>,
      filterValue: (hist) => hist.prevStage,
    },
    {
      key: 'newStage', title: 'Yeni Aşama',
      render: (hist) => <span className="font-black text-emerald-600">{hist.newStage}</span>,
      filterValue: (hist) => hist.newStage,
    },
    {
      key: 'status', title: 'Durum', align: 'center', width: 'w-28', sortable: false,
      render: () => <StatusPill tone="green" className="text-[9px] uppercase">Tamamlandı</StatusPill>,
      filterable: false,
    },
  ], []);

  const getStageInfo = (stageId: ProductionStage) => {
    return PRODUCTION_STAGES_CONFIG.find(s => s.id === stageId) || PRODUCTION_STAGES_CONFIG[0];
  };

  // Barcode Scanner Action
  const handleBarcodeSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const code = scannedCode.trim();
    if (!code) return;

    try {
      const result = await productionService.scanWorkOrderBarcode(code, scannerOperator);
      playBeepSound(result.success ? 'success' : 'error');
      
      const product = result.product;
      setScanFeedback({
        type: result.success ? 'success' : 'error',
        title: result.success ? 'Aşama Başarıyla Güncellendi' : 'İşlem Uyarısı',
        message: result.message,
        workOrder: result.workOrder,
        product,
        timestamp: new Date()
      });

      if (result.success) {
        setScanHistory(prev => [
          {
            id: String(Date.now()),
            barcode: result.workOrder.barcode,
            productName: product?.name || 'Ürün',
            prevStage: getStageInfo(result.previousStage as ProductionStage).shortLabel,
            newStage: getStageInfo(result.newStage as ProductionStage).shortLabel,
            time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
          },
          ...prev.slice(0, 19)
        ]);
        onScanSuccess();
      }
    } catch (err: any) {
      playBeepSound('error');
      setScanFeedback({
        type: 'error',
        title: 'Barkod Okuma Başarısız',
        message: err.message,
        timestamp: new Date()
      });
    } finally {
      setScannedCode('');
      if (barcodeInputRef.current) {
        barcodeInputRef.current.focus();
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 text-white p-6 rounded-3xl border border-slate-800 shadow-xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5" /> Canlı Barkod Okutma İstasyonu
            </span>
            <h3 className="text-xl font-black tracking-tight mt-1">İmalat Operatör Terminali</h3>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onOpenCameraScanner()}
              className="flex items-center gap-2 px-3.5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-purple-900/30 cursor-pointer"
              title="Cihaz kamerasını açarak refakat kartı üzerindeki barkodu doğrudan tara"
            >
              <Camera className="w-4 h-4" />
              <span>Kamera ile Tara</span>
            </button>

            <div className="flex items-center gap-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase">Operatör / Hat:</label>
              <input
                type="text"
                value={scannerOperator}
                onChange={e => setScannerOperator(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs font-black text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* Big Live Input */}
        <form onSubmit={handleBarcodeSubmit} className="space-y-3">
          <div className="relative">
            <Barcode className="w-8 h-8 absolute left-4 top-1/2 -translate-y-1/2 text-indigo-400" />
            <input
              ref={barcodeInputRef}
              autoFocus
              type="text"
              placeholder="Barkod okutun veya 'WO-000101' yazıp Enter'a basın..."
              value={scannedCode}
              onChange={e => setScannedCode(e.target.value)}
              className="w-full pl-16 pr-32 py-5 bg-slate-800/90 border-2 border-indigo-500/50 rounded-2xl text-lg font-mono font-black text-white placeholder:text-slate-500 dark:text-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/20 tracking-wider uppercase"
            />
            <button
              type="submit"
              className="absolute right-3 top-1/2 -translate-y-1/2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md"
            >
              Onayla & Geçir
            </button>
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold">
            <span>⚡ USB El Terminali / Barkod Okuyucu direkt algılanır.</span>
            <span>Her okutmada otomatik sesli geri bildirim verilir.</span>
          </div>
        </form>

        {/* Scan Feedback Banner */}
        <AnimatePresence>
          {scanFeedback && (
            <motion.div
              key={`scan-feedback-${scanFeedback.timestamp.getTime()}`}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={cn(
                "p-5 rounded-2xl border flex items-start gap-4 transition-all",
                scanFeedback.type === 'success'
                  ? "bg-emerald-950/80 border-emerald-500 text-emerald-100"
                  : "bg-rose-950/80 border-rose-500 text-rose-100"
              )}
            >
              {scanFeedback.type === 'success' ? (
                <CheckCircle2 className="w-8 h-8 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-8 h-8 text-rose-400 shrink-0 mt-0.5" />
              )}

              <div className="flex-1 space-y-1">
                <div className="text-sm font-black uppercase tracking-wide">
                  {scanFeedback.title}
                </div>
                <div className="text-xs opacity-90 font-medium">
                  {scanFeedback.message}
                </div>
                {scanFeedback.product && (
                  <div className="text-[11px] font-bold text-indigo-300 mt-2">
                    Model: {scanFeedback.product.name} ({scanFeedback.product.code}) • Miktar: {scanFeedback.workOrder?.quantity} Adet
                  </div>
                )}
              </div>

              <span className="text-[10px] font-mono opacity-60">
                {scanFeedback.timestamp.toLocaleTimeString('tr-TR')}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Scan History Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs overflow-hidden">
        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <span className="text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider">
            Son Terminal İşlem Kayıtları
          </span>
          <span className="text-[10px] text-slate-400 font-bold uppercase">Canlı Akış</span>
        </div>

        <DataGrid
          columns={scanHistoryColumns}
          data={scanHistory}
          rowKey="id"
          emptyMessage="Henüz barkod okutma işlemi yapılmadı."
        />
      </div>
    </div>
  );
}
