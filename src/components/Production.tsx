import React from 'react';
import { api } from '../api/client';
import { useApiQuery } from '../hooks/useApiQuery';
import { 
  Play, 
  CheckCircle2, 
  Clock, 
  Plus, 
  Settings2, 
  Scissors, 
  Printer, 
  Hammer, 
  Sparkles, 
  PackageCheck, 
  Barcode, 
  Search, 
  AlertTriangle, 
  Layers, 
  ArrowRight, 
  RefreshCw, 
  ShoppingCart, 
  FileText, 
  FileSpreadsheet,
  Calendar, 
  User, 
  Eye, 
  Check, 
  X, 
  Volume2, 
  Package, 
  Filter,
  CheckCircle,
  HelpCircle,
  TrendingUp,
  AlertCircle,
  Palette,
  Loader2,
  Download,
  ExternalLink,
  BarChart3,
  Camera,
  Building2,
  Split,
  Copy,
  Zap,
  Truck
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { Factory } from 'lucide-react';
import PageHeader from './PageHeader';
import { erpService, PRODUCTION_STAGES_CONFIG, formatQuantity, roundUpQuantity } from '../services/erpService';
import Modal from './Modal';
import { BarcodeSvg } from './BarcodeSvg';
import DetailedWorkOrderCardModal from './Production/DetailedWorkOrderCardModal';
import ProductionRefakatKartiModal from './Production/ProductionRefakatKartiModal';
import BomConsumptionModal from './Production/BomConsumptionModal';
import { RecipeModal } from './Production/RecipeModal';
import CameraBarcodeScannerModal, { type ScannerMode } from './Common/CameraBarcodeScannerModal';
import DataGrid, { GridColumn, StatusPill } from './Common/DataGrid';
import { PurchaseOrderPrintModal } from './Orders/PurchaseOrderPrintModal';
import ProductionReport from './Reports/ProductionReport';
import { printElement, openPrintWindow } from '../lib/printService';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas-pro';
import { sanitizeCssColor } from '../lib/pdfService';
import type { 
  WorkOrder, 
  ProductionStage, 
  Product, 
  Recipe, 
  RecipeIngredient,
  MrpCalculationResult, 
  MrpRequirementItem, 
  Order, 
  OrderItem,
  MaterialReadinessStatus 
} from '../types';

type ProductionTab = 'pipeline' | 'orders_pool' | 'mrp' | 'barcode_terminal' | 'recipes' | 'reports';

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

export default function Production() {
  const workOrders = useApiQuery(() => api.workOrders.list({ orderBy: 'id', orderDir: 'desc' }), [], ['workOrders']);
  const products = useApiQuery(() => api.products.list(), [], ['products']);
  const recipes = useApiQuery(() => api.recipes.list(), [], ['recipes']);
  const orders = useApiQuery(() => api.orders.list({ where: { type: 'sales' }, orderBy: 'id', orderDir: 'desc' }), [], ['orders']);
  const orderItems = useApiQuery(() => api.orderItems.list(), [], ['orderItems']);
  const contacts = useApiQuery(() => api.contacts.list(), [], ['contacts']);

  const [activeTab, setActiveTab] = React.useState<ProductionTab>('pipeline');
  const [searchTerm, setSearchTerm] = React.useState('');
  const [stageFilter, setStageFilter] = React.useState<string>('all');
  const [selectedWorkOrder, setSelectedWorkOrder] = React.useState<WorkOrder | null>(null);

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = React.useState(false);
  const [isRecipeModalOpen, setIsRecipeModalOpen] = React.useState(false);
  const [isTicketModalOpen, setIsTicketModalOpen] = React.useState(false);
  const [ticketWorkOrder, setTicketWorkOrder] = React.useState<WorkOrder | null>(null);
  const [isPrintingTicket, setIsPrintingTicket] = React.useState(false);
  const [isDownloadingTicketPdf, setIsDownloadingTicketPdf] = React.useState(false);
  const [ticketPrintNotice, setTicketPrintNotice] = React.useState<{ message: string; blobUrl?: string } | null>(null);
  const [isDetailedSheetModalOpen, setIsDetailedSheetModalOpen] = React.useState(false);
  const [detailedSheetWorkOrder, setDetailedSheetWorkOrder] = React.useState<WorkOrder | null>(null);
  const [isStageTransitionModalOpen, setIsStageTransitionModalOpen] = React.useState(false);
  const [transitionTargetStage, setTransitionTargetStage] = React.useState<ProductionStage>('cutting');
  const [transitionOperator, setTransitionOperator] = React.useState('');
  const [transitionScrap, setTransitionScrap] = React.useState(0);
  const [transitionNotes, setTransitionNotes] = React.useState('');

  // 1. Üretim Refakat Kartı (İş Emri Fişi) Modal State
  const [isRefakatKartiModalOpen, setIsRefakatKartiModalOpen] = React.useState(false);
  const [refakatWorkOrder, setRefakatWorkOrder] = React.useState<WorkOrder | null>(null);

  // 2. Kamera ile Canlı Barkod / Karekod Okuyucu State
  const [isCameraScannerOpen, setIsCameraScannerOpen] = React.useState(false);
  const [cameraScannerInitialMode, setCameraScannerInitialMode] = React.useState<ScannerMode>('production_wo');
  const [cameraScannerInitialCode, setCameraScannerInitialCode] = React.useState('');

  // 3. BOM (Ürün Reçetesi) & Otomatik Sarfiyat Düşümü State
  const [isBomConsumptionModalOpen, setIsBomConsumptionModalOpen] = React.useState(false);
  const [bomSelectedProductId, setBomSelectedProductId] = React.useState<number | undefined>(undefined);

  const openRefakatKarti = (wo: WorkOrder) => {
    setRefakatWorkOrder(wo);
    setIsRefakatKartiModalOpen(true);
  };

  const handleOpenScanner = (mode: ScannerMode = 'production_wo', initialCode: string = '') => {
    setCameraScannerInitialMode(mode);
    setCameraScannerInitialCode(initialCode);
    setIsCameraScannerOpen(true);
  };

  const handleOpenBomModal = (productId?: number) => {
    setBomSelectedProductId(productId);
    setIsBomConsumptionModalOpen(true);
  };

  // Recipe Modal State
  const [selectedProductId, setSelectedProductId] = React.useState<number>(0);
  const [selectedRecipeTargetColor, setSelectedRecipeTargetColor] = React.useState<string>('all');

  // Manual Work Order Form State
  const [manualWoProductId, setManualWoProductId] = React.useState<number>(0);
  const [manualWoColor, setManualWoColor] = React.useState<string>('');
  const [manualWoSize, setManualWoSize] = React.useState<string>('');

  // MRP State
  const [mrpResult, setMrpResult] = React.useState<MrpCalculationResult | null>(null);
  const [isMrpCalculating, setIsMrpCalculating] = React.useState(false);
  const [selectedMrpKeys, setSelectedMrpKeys] = React.useState<string[]>([]);
  const [expandedMatrixKeys, setExpandedMatrixKeys] = React.useState<string[]>([]);
  const [isPurchaseOrderModalOpen, setIsPurchaseOrderModalOpen] = React.useState(false);
  const [mrpSupplierId, setMrpSupplierId] = React.useState<number | null>(null);
  const [itemSuppliers, setItemSuppliers] = React.useState<Record<string, number>>({});
  const [batchSupplierId, setBatchSupplierId] = React.useState<number | null>(null);
  const [isCreatingPO, setIsCreatingPO] = React.useState(false);
  const [poCreatedSummary, setPoCreatedSummary] = React.useState<{
    orders: {
      orderId: number;
      orderNumber: string;
      supplierId: number;
      supplierName: string;
      itemCount: number;
      grandTotal: number;
    }[];
    totalOrders: number;
    totalAmount: number;
  } | null>(null);
  const [isPoPrintModalOpen, setIsPoPrintModalOpen] = React.useState(false);
  const [printPoId, setPrintPoId] = React.useState<number | null>(null);

  const getMrpKey = (item: { rawMaterialId: number; color?: string }) => `${item.rawMaterialId}__${item.color || 'all'}`;

  // Barcode Terminal State
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

  const [mrpWoFilter, setMrpWoFilter] = React.useState<string>('all');

  // Helper Maps
  const productMap = React.useMemo(() => new Map((products || []).map(p => [p.id!, p])), [products]);
  const recipeMap = React.useMemo(() => new Map((recipes || []).map(r => [r.productId, r])), [recipes]);

  // MRP DataGrid columns (custom checkbox column + in-cell matrix expansion)
  const mrpColumns = React.useMemo<GridColumn<MrpRequirementItem>[]>(() => [
    {
      key: '_select', title: '', width: 'w-10', sortable: false, filterable: false,
      render: (item) => {
        const itemKey = getMrpKey(item);
        const isSelected = selectedMrpKeys.includes(itemKey);
        const isShortage = item.status === 'shortage' && item.shortageQuantity > 0;
        const isPoCreated = item.status === 'po_created';
        return (
          <input
            type="checkbox"
            checked={isSelected}
            disabled={!isShortage}
            onChange={(e) => {
              if (e.target.checked) {
                setSelectedMrpKeys([...selectedMrpKeys, itemKey]);
              } else {
                setSelectedMrpKeys(selectedMrpKeys.filter(k => k !== itemKey));
              }
            }}
            title={
              isPoCreated
                ? "Bu malzeme için Satın Alma Siparişi zaten oluşturuldu. Mükerrer sipariş engellendi."
                : !isShortage
                  ? "Mevcut stok yeterli."
                  : "Satın alma siparişi oluşturmak için seçin"
            }
            className="rounded text-indigo-600 focus:ring-indigo-500 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
          />
        );
      },
    },
    {
      key: 'rawMaterialName', title: 'Hammadde Kodu & Adı',
      render: (item) => {
        const itemKey = getMrpKey(item);
        const isMatrixExpanded = expandedMatrixKeys.includes(itemKey);
        return (
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-black text-slate-900 dark:text-slate-100">{item.rawMaterialName}</span>
              {item.color && (
                <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                  Renk: {item.color}
                </span>
              )}
              {item.subType && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                  {item.subType}
                </span>
              )}
            </div>
            <div className="text-[10px] font-mono text-slate-400 mt-0.5">{item.rawMaterialCode}</div>

            {item.affectedWorkOrders && item.affectedWorkOrders.length > 0 && (
              <div className="mt-1 flex flex-wrap items-center gap-1">
                <span className="text-[9px] font-bold text-slate-400">İş Emirleri ({item.affectedWorkOrders.length}):</span>
                {item.affectedWorkOrders.map((wo, woIdx) => (
                  <span
                    key={`wo-badge-${itemKey}-${wo.workOrderId}-${woIdx}`}
                    className="inline-flex items-center gap-1 text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60"
                    title={`${wo.modelName} — ${wo.quantity} Çift`}
                  >
                    <span>{wo.barcode} ({wo.quantity} Çift)</span>
                  </span>
                ))}
              </div>
            )}

            {item.activePurchaseOrders && item.activePurchaseOrders.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {item.activePurchaseOrders.map((po, poIdx) => (
                  <span
                    key={`mrp-po-tag-${itemKey}-${po.orderId}-${poIdx}`}
                    className="inline-flex items-center gap-1 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800"
                    title={`${po.supplierName || 'Tedarikçi'} firmasından ${po.quantity} ${item.unit} sipariş edildi`}
                  >
                    <Truck className="w-2.5 h-2.5 text-sky-500" />
                    <span>SAS: <b>{po.orderNumber}</b> ({po.quantity} {item.unit})</span>
                  </span>
                ))}
              </div>
            )}

            {item.hasSizeMatrix && item.sizeBreakdown && item.sizeBreakdown.length > 0 && (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => {
                    if (isMatrixExpanded) {
                      setExpandedMatrixKeys(expandedMatrixKeys.filter(k => k !== itemKey));
                    } else {
                      setExpandedMatrixKeys([...expandedMatrixKeys, itemKey]);
                    }
                  }}
                  className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/80 px-2 py-0.5 rounded-lg transition-colors cursor-pointer"
                >
                  <Layers className="w-3 h-3" />
                  <span>Beden Asorti Matrisi ({item.sizeBreakdown.length} Beden)</span>
                  <span className="text-[9px] font-mono font-black">{isMatrixExpanded ? '▲ Gizle' : '▼ Detay'}</span>
                </button>
              </div>
            )}

            {item.hasSizeMatrix && item.sizeBreakdown && item.sizeBreakdown.length > 0 && isMatrixExpanded && (
              <div className="mt-2 p-3 bg-white dark:bg-slate-900 rounded-xl border border-indigo-100 dark:border-indigo-900/60 shadow-xs space-y-2">
                <div className="flex items-center justify-between text-[11px] font-black text-indigo-900 dark:text-indigo-200">
                  <span className="flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-indigo-600" />
                    {item.rawMaterialName} ({item.color ? `Renk: ${item.color}` : 'Tüm Renkler'}) — Beden / Asorti Detayı:
                  </span>
                  <span className="text-slate-500 font-normal">
                    {item.unit || 'Çift'} bazında dağılım
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
                  {item.sizeBreakdown.map((sb, sbIdx) => {
                    const isSbShortage = sb.shortage > 0;
                    const isSbOnOrder = (sb.onOrderQuantity || 0) > 0 && sb.shortage === 0;

                    return (
                      <div
                        key={`sb-chip-${itemKey}-${sb.size}-${sbIdx}`}
                        className={cn(
                          "p-2 rounded-lg border text-center space-y-0.5 transition-all",
                          isSbShortage
                            ? "bg-rose-50/60 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/50"
                            : isSbOnOrder
                              ? "bg-sky-50/50 dark:bg-sky-950/30 border-sky-200 dark:border-sky-900/50"
                              : "bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/40"
                        )}
                      >
                        <div className="text-xs font-black text-slate-800 dark:text-slate-100">
                          Beden {sb.size}
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">
                          İhtiyaç: <b className="text-slate-900 dark:text-slate-100">{sb.required}</b>
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">
                          Stok: <b className="text-slate-700 dark:text-slate-300">{sb.currentStock}</b>
                        </div>
                        {sb.onOrderQuantity && sb.onOrderQuantity > 0 ? (
                          <div className="text-[10px] text-sky-600 dark:text-sky-400 font-semibold">
                            Yolda: <b>+{sb.onOrderQuantity}</b>
                          </div>
                        ) : null}
                        <div className="text-[10px] font-black pt-0.5 border-t border-slate-200 dark:border-slate-700">
                          {isSbShortage ? (
                            <span className="text-rose-600 dark:text-rose-400">Eksik: {sb.shortage}</span>
                          ) : isSbOnOrder ? (
                            <span className="text-sky-600 dark:text-sky-400">Siparişte (+{sb.onOrderQuantity})</span>
                          ) : (
                            <span className="text-emerald-600 dark:text-emerald-400">Yeterli</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      },
      filterValue: (item) => `${item.rawMaterialName} ${item.rawMaterialCode} ${item.color || ''} ${item.subType || ''}`,
    },
    {
      key: 'preferredSupplierName', title: 'Öncelikli Tedarikçi', width: 'w-44',
      render: (item) => item.preferredSupplierName ? (
        <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900/40">
          <Building2 className="w-3 h-3 text-indigo-500 shrink-0" />
          <span className="truncate max-w-[130px]">{item.preferredSupplierName}</span>
        </div>
      ) : (
        <span className="text-[11px] text-slate-400 italic">Genel / Tanımsız</span>
      ),
      filterValue: (item) => item.preferredSupplierName || 'Genel Tanımsız',
    },
    {
      key: 'requiredQuantity', title: 'Toplam İhtiyaç', align: 'right', width: 'w-32',
      render: (item) => (
        <span className="text-xs font-black text-slate-800 dark:text-slate-200">
          {formatQuantity(item.requiredQuantity)} {item.unit}
        </span>
      ),
      filterValue: (item) => `${item.requiredQuantity ?? 0}`,
    },
    {
      key: 'currentStock', title: 'Mevcut Stok / Yolda', align: 'right', width: 'w-40',
      render: (item) => (
        <div className="text-right">
          <div className="text-xs font-black text-slate-800 dark:text-slate-200">
            {formatQuantity(item.currentStock)} {item.unit}
          </div>
          {item.warehouseStock !== undefined && item.warehouseStock !== item.currentStock && (
            <div className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
              Depo Kartı: {formatQuantity(item.warehouseStock)} {item.unit}
            </div>
          )}
          {item.onOrderQuantity && item.onOrderQuantity > 0 ? (
            <div className="text-[10px] font-bold text-sky-600 dark:text-sky-400 flex items-center justify-end gap-1 mt-0.5">
              <Truck className="w-3 h-3" />
              <span>Yolda (SAS): +{formatQuantity(item.onOrderQuantity)} {item.unit}</span>
            </div>
          ) : null}
        </div>
      ),
      filterValue: (item) => `${item.currentStock ?? 0}`,
    },
    {
      key: 'shortageQuantity', title: 'Net Eksik / Fazla', align: 'right', width: 'w-36',
      render: (item) => {
        const isShortage = item.status === 'shortage' && item.shortageQuantity > 0;
        const isPoCreated = item.status === 'po_created';
        if (isShortage) {
          return (
            <span className="text-xs font-black text-rose-600 bg-rose-100 dark:bg-rose-950/50 px-2 py-0.5 rounded">
              -{formatQuantity(item.shortageQuantity)} {item.unit}
            </span>
          );
        }
        if (isPoCreated) {
          return (
            <span className="text-xs font-bold text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/60 px-2 py-0.5 rounded border border-sky-200 dark:border-sky-800 inline-block">
              Siparişte (+{formatQuantity(item.onOrderQuantity || 0)} {item.unit})
            </span>
          );
        }
        return (
          <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
            +{formatQuantity(item.currentStock - item.requiredQuantity)} {item.unit} (Yeterli)
          </span>
        );
      },
      filterValue: (item) => `${item.shortageQuantity ?? 0}`,
    },
    {
      key: 'status', title: 'Durum', align: 'center', width: 'w-32',
      render: (item) => {
        const isShortage = item.status === 'shortage' && item.shortageQuantity > 0;
        const isPoCreated = item.status === 'po_created';
        if (isShortage) return <StatusPill tone="red" className="text-[9px] uppercase">Kritik Eksik</StatusPill>;
        if (isPoCreated) return <StatusPill tone="blue" className="text-[9px] uppercase"><Truck className="w-3 h-3" /> Sipariş Açıldı</StatusPill>;
        return <StatusPill tone="green" className="text-[9px] uppercase">Stok Yeterli</StatusPill>;
      },
      filterValue: (item) => {
        const isShortage = item.status === 'shortage' && item.shortageQuantity > 0;
        const isPoCreated = item.status === 'po_created';
        if (isShortage) return 'Kritik Eksik';
        if (isPoCreated) return 'Sipariş Açıldı';
        return 'Stok Yeterli';
      },
    },
    {
      key: 'estimatedCost', title: 'Tahmini Maliyet', align: 'right', width: 'w-32',
      render: (item) => (
        <div className="text-right">
          <div className="text-xs font-black text-slate-800 dark:text-slate-200">
            {item.estimatedCost.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
          </div>
          <div className="text-[9px] text-slate-400">
            Birim: {item.buyingPrice.toLocaleString('tr-TR')} ₺
          </div>
        </div>
      ),
      filterValue: (item) => `${item.estimatedCost ?? 0}`,
    },
  ], [selectedMrpKeys, expandedMatrixKeys]);

  // PO Modal items DataGrid columns
  const poModalColumns = React.useMemo<GridColumn<MrpRequirementItem>[]>(() => [
    {
      key: 'rawMaterialName', title: 'Hammadde / Malzeme',
      render: (item) => {
        const itemKey = getMrpKey(item);
        return (
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-bold text-slate-900 dark:text-slate-100">{item.rawMaterialName}</span>
              {item.color && (
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-bold border border-indigo-200 dark:border-indigo-800">
                  Renk: {item.color}
                </span>
              )}
              {item.subType && (
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold">
                  {item.subType}
                </span>
              )}
            </div>
            <div className="text-[10px] font-mono text-slate-400">{item.rawMaterialCode}</div>

            {item.hasSizeMatrix && item.sizeBreakdown && item.sizeBreakdown.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {item.sizeBreakdown.filter(sb => sb.shortage > 0).map((sb, sbIdx) => (
                  <span
                    key={`po-chip-${itemKey}-${sb.size}-${sbIdx}`}
                    className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60"
                  >
                    {sb.size}: {sb.shortage} {item.unit || 'Çift'}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      },
      filterValue: (item) => `${item.rawMaterialName} ${item.rawMaterialCode} ${item.color || ''} ${item.subType || ''}`,
    },
    {
      key: 'shortageQuantity', title: 'Eksik Miktar', align: 'right', width: 'w-32',
      render: (item) => (
        <span className="font-black text-rose-600">
          {formatQuantity(item.shortageQuantity)} {item.unit}
        </span>
      ),
      filterValue: (item) => `${item.shortageQuantity ?? 0}`,
    },
    {
      key: 'supplier', title: 'Tedarikçi Firma',
      render: (item) => {
        const itemKey = getMrpKey(item);
        const currentSupId = itemSuppliers[itemKey] || itemSuppliers[String(item.rawMaterialId)] || item.preferredSupplierId || 0;
        const isPredefined = item.preferredSupplierId && currentSupId === item.preferredSupplierId;
        return (
          <div className="flex items-center gap-2">
            <select
              value={currentSupId || ''}
              onChange={e => {
                const val = Number(e.target.value) || 0;
                setItemSuppliers(prev => {
                  const updated = { ...prev, [itemKey]: val, [String(item.rawMaterialId)]: val };
                  mrpResult?.items.forEach(otherItem => {
                    if (otherItem.rawMaterialId === item.rawMaterialId) {
                      updated[getMrpKey(otherItem)] = val;
                    }
                  });
                  return updated;
                });
              }}
              className="w-full max-w-[200px] border border-slate-200 dark:border-slate-700 rounded-lg p-1.5 text-xs font-bold bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none"
            >
              <option value="">Tedarikçi Seçin...</option>
              {contacts?.filter(c => c.type === 'supplier' || c.type === 'both').map(c => (
                <option key={`po-sup-opt-${itemKey}-${c.id}`} value={c.id}>
                  {c.name} {c.id === item.preferredSupplierId ? '(Tanımlı)' : ''}
                </option>
              ))}
            </select>
            {isPredefined && (
              <span className="text-[9px] font-black uppercase text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-1.5 py-0.5 rounded shrink-0">
                Kayıtlı
              </span>
            )}
          </div>
        );
      },
      filterValue: (item) => {
        const itemKey = getMrpKey(item);
        const currentSupId = itemSuppliers[itemKey] || itemSuppliers[String(item.rawMaterialId)] || item.preferredSupplierId || 0;
        const sup = contacts?.find(c => c.id === currentSupId);
        return sup?.name || '';
      },
    },
    {
      key: 'estimatedCost', title: 'Tahmini Tutar', align: 'right', width: 'w-32',
      render: (item) => (
        <span className="font-black text-slate-900 dark:text-slate-100">
          {item.estimatedCost.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
        </span>
      ),
      filterValue: (item) => `${item.estimatedCost ?? 0}`,
    },
  ], [itemSuppliers, contacts, mrpResult]);


  // Run initial MRP calculation when tab opens or on demand
  const handleCalculateMRP = async (targetIds?: number[]) => {
    setIsMrpCalculating(true);
    try {
      const result = await erpService.calculateMRP(targetIds);
      setMrpResult(result);
      // Select all shortage items by default
      const shortageKeys = result.items.filter(i => i.status === 'shortage').map(i => getMrpKey(i));
      setSelectedMrpKeys(shortageKeys);
    } catch (err: any) {
      alert(`MRP Hesaplama Hatası: ${err.message}`);
    } finally {
      setIsMrpCalculating(false);
    }
  };

  // Auto calculate MRP once data is loaded if null
  React.useEffect(() => {
    if (workOrders && products && recipes && !mrpResult) {
      handleCalculateMRP();
    }
  }, [workOrders?.length, products?.length, recipes?.length]);

  // Filtered Work Orders for Pipeline
  const filteredWorkOrders = React.useMemo(() => {
    if (!workOrders) return [];
    return workOrders.filter(wo => {
      const prod = productMap.get(wo.productId);
      const matchesSearch = 
        wo.barcode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (prod?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (prod?.code || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (wo.orderNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (wo.customerName || '').toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStage = stageFilter === 'all' || wo.currentStage === stageFilter;
      return matchesSearch && matchesStage;
    });
  }, [workOrders, searchTerm, stageFilter, productMap]);

  // Filter Sales Orders for Pool
  const pendingSalesOrders = React.useMemo(() => {
    if (!orders || !orderItems) return [];
    return orders.filter(o => o.status !== 'cancelled').map(order => {
      const items = orderItems.filter(i => i.orderId === order.id);
      const existingWOs = workOrders?.filter(w => w.orderId === order.id) || [];
      const contact = contacts?.find(c => c.id === order.contactId);
      return {
        ...order,
        contactName: contact?.name || 'Müşteri',
        items,
        workOrderCount: existingWOs.length,
        hasMissingWorkOrders: items.some(item => {
          const prod = productMap.get(item.productId);
          if (!prod || prod.isRawMaterial) return false;
          return !existingWOs.some(w => w.orderItemId === item.id);
        })
      };
    });
  }, [orders, orderItems, workOrders, contacts, productMap]);

  // Orders Pool DataGrid columns
  const ordersPoolColumns = React.useMemo<GridColumn<(typeof pendingSalesOrders)[number]>[]>(() => [
    {
      key: 'orderNumber', title: 'Sipariş No',
      render: (order) => (
        <div>
          <div className="text-sm font-black text-slate-900 dark:text-slate-100">{order.orderNumber}</div>
          <span className="text-[9px] font-bold text-slate-400 uppercase">Satış Siparişi</span>
        </div>
      ),
      filterValue: (order) => order.orderNumber || '',
    },
    {
      key: 'contactName', title: 'Müşteri / Cari',
      render: (order) => <div className="text-xs font-black text-slate-800 dark:text-slate-200">{order.contactName}</div>,
      filterValue: (order) => order.contactName || '',
    },
    {
      key: 'date', title: 'Sipariş & Termin Tarihi', width: 'w-44',
      render: (order) => (
        <div>
          <div className="text-xs font-bold text-slate-700 dark:text-slate-200">
            {new Date(order.date).toLocaleDateString('tr-TR')}
          </div>
          {order.deliveryDate && (
            <div className="text-[10px] text-amber-600 font-bold flex items-center gap-1">
              <Calendar className="w-3 h-3" /> Termin: {new Date(order.deliveryDate).toLocaleDateString('tr-TR')}
            </div>
          )}
        </div>
      ),
      filterValue: (order) => `${new Date(order.date).toLocaleDateString('tr-TR')} ${order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString('tr-TR') : ''}`,
    },
    {
      key: 'items', title: 'Ürün Kalemleri',
      render: (order) => (
        <div className="space-y-1">
          {order.items.map((item, idx) => {
            const prod = productMap.get(item.productId);
            const hasRecipe = recipeMap.has(item.productId);
            return (
              <div key={idx} className="flex items-center gap-2 text-xs">
                <span className="font-bold text-slate-800 dark:text-slate-200">{prod?.name || 'Ürün'}</span>
                <span className="text-slate-400 font-medium">({item.quantity} Adet)</span>
                {!hasRecipe && (
                  <button
                    type="button"
                    onClick={() => openRecipeModalForProduct(item.productId)}
                    className="text-[9px] font-black text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded hover:bg-amber-100"
                  >
                    + Reçete Yaz
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ),
      filterValue: (order) => order.items.map(item => `${productMap.get(item.productId)?.name || ''} ${item.quantity}`).join(' '),
    },
    {
      key: 'hasMissingWorkOrders', title: 'Üretim Durumu', width: 'w-56',
      render: (order) => order.hasMissingWorkOrders ? (
        <StatusPill tone="amber" className="text-[9px] uppercase"><Clock className="w-3 h-3" /> Plana Alınmayı Bekliyor</StatusPill>
      ) : (
        <StatusPill tone="green" className="text-[9px] uppercase"><CheckCircle2 className="w-3 h-3" /> Üretim Planında ({order.workOrderCount} İş Emri)</StatusPill>
      ),
      filterValue: (order) => order.hasMissingWorkOrders ? 'Plana Alınmayı Bekliyor' : 'Üretim Planında',
    },
  ], [productMap, recipeMap]);

  // Stage Helpers
  const getStageInfo = (stageId: ProductionStage) => {
    return PRODUCTION_STAGES_CONFIG.find(s => s.id === stageId) || PRODUCTION_STAGES_CONFIG[0];
  };

  const getStageIcon = (stageId: ProductionStage) => {
    switch (stageId) {
      case 'planning': return FileText;
      case 'cutting': return Scissors;
      case 'printing': return Printer;
      case 'sewing': return Layers;
      case 'assembly': return Hammer;
      case 'finishing': return Sparkles;
      case 'quality_packing': return PackageCheck;
      case 'completed': return CheckCircle2;
      default: return Clock;
    }
  };

  const openRecipeModalForProduct = (productId: number, targetColor?: string) => {
    setSelectedProductId(productId);
    const prod = productMap.get(productId);
    const colorToUse = targetColor || (prod?.colors && prod.colors.length > 0 ? prod.colors[0] : 'all');
    setSelectedRecipeTargetColor(colorToUse);
    setIsRecipeModalOpen(true);
  };

  const handleDeleteRecipe = async (recipeId: number) => {
    if (confirm('Bu reçeteyi silmek istediğinize emin misiniz?')) {
      await erpService.deleteRecipe(recipeId);
      handleCalculateMRP();
    }
  };

  // Direct create single work order
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
      await erpService.createWorkOrder({
        productId,
        quantity,
        color: color || undefined,
        size: size || undefined,
        targetDate: targetDateStr ? new Date(targetDateStr) : undefined,
        notes: notes || undefined
      });
      setIsAddModalOpen(false);
      handleCalculateMRP();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Convert Sales Order to Work Orders
  const handleTransferOrderToProduction = async (orderId: number) => {
    try {
      const createdIds = await erpService.createWorkOrdersFromOrder(orderId);
      if (createdIds.length > 0) {
        alert(`${createdIds.length} adet ürün kalemi başarıyla üretim planına alındı ve barkodları oluşturuldu.`);
        handleCalculateMRP();
      } else {
        alert('Bu siparişteki tüm kalemler zaten üretim planına alınmış.');
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Stage Advancement Handler
  const handleOpenStageTransition = (wo: WorkOrder, target?: ProductionStage) => {
    setSelectedWorkOrder(wo);
    const stagesList: ProductionStage[] = ['planning', 'cutting', 'printing', 'sewing', 'assembly', 'finishing', 'quality_packing', 'completed'];
    const currIdx = stagesList.indexOf(wo.currentStage);
    const defaultNext = target || (currIdx < stagesList.length - 1 ? stagesList[currIdx + 1] : 'completed');
    setTransitionTargetStage(defaultNext);
    setTransitionOperator(wo.operator || '');
    setTransitionScrap(0);
    setTransitionNotes('');
    setIsStageTransitionModalOpen(true);
  };

  const handleExecuteStageTransition = async () => {
    if (!selectedWorkOrder) return;
    try {
      await erpService.advanceWorkOrderStage(selectedWorkOrder.id!, transitionTargetStage, {
        operator: transitionOperator || undefined,
        scrapQuantity: transitionScrap > 0 ? transitionScrap : undefined,
        notes: transitionNotes || undefined
      });
      setIsStageTransitionModalOpen(false);
      handleCalculateMRP();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Barcode Scanner Action
  const handleBarcodeSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const code = scannedCode.trim();
    if (!code) return;

    try {
      const result = await erpService.scanWorkOrderBarcode(code, scannerOperator);
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
        handleCalculateMRP();
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

  // Open MRP Purchase Order Modal with auto-assigned preferred suppliers
  const handleOpenPurchaseOrderModal = () => {
    if (!mrpResult) return;
    const suppliers = contacts?.filter(c => c.type === 'supplier' || c.type === 'both') || [];
    const defaultSupId = suppliers[0]?.id || 0;

    const initialMapping: Record<string, number> = {};
    mrpResult.items.forEach(item => {
      const key = getMrpKey(item);
      const supId = item.preferredSupplierId || defaultSupId;
      initialMapping[key] = supId;
      initialMapping[String(item.rawMaterialId)] = supId;
    });
    setItemSuppliers(initialMapping);
    setBatchSupplierId(null);
    setPoCreatedSummary(null);

    // Auto-select shortage items only
    const shortageKeys = mrpResult.items
      .filter(i => i.status === 'shortage' && i.shortageQuantity > 0)
      .map(i => getMrpKey(i));
    setSelectedMrpKeys(shortageKeys);
    setIsPurchaseOrderModalOpen(true);
  };

  // Create Purchase Order from MRP shortages (multi-supplier auto split)
  const handleCreatePurchaseOrderFromMRP = async () => {
    if (!mrpResult || selectedMrpKeys.length === 0) {
      alert('Lütfen satın alma siparişi oluşturmak için en az bir hammadde seçin.');
      return;
    }

    const itemsToBuy = mrpResult.items
      .filter(i => selectedMrpKeys.includes(getMrpKey(i)) && i.shortageQuantity > 0)
      .map(i => {
        const key = getMrpKey(i);
        const validSizes = i.sizeBreakdown
          ?.filter(sb => sb.shortage > 0)
          .map(sb => ({ size: sb.size, quantity: roundUpQuantity(sb.shortage, 2) }));

        return {
          rawMaterialId: i.rawMaterialId,
          color: i.color,
          quantity: roundUpQuantity(i.shortageQuantity, 2),
          sizeBreakdown: validSizes && validSizes.length > 0 ? validSizes : undefined,
          unitPrice: i.buyingPrice,
          supplierId: itemSuppliers[key] || itemSuppliers[String(i.rawMaterialId)] || i.preferredSupplierId
        };
      });

    if (itemsToBuy.length === 0) {
      alert('Seçilen kalemler arasında eksik stok bulunmuyor.');
      return;
    }

    setIsCreatingPO(true);
    try {
      const res = await erpService.createPurchaseOrdersBySupplierFromMRP(itemsToBuy);
      setPoCreatedSummary({
        orders: res.ordersCreated,
        totalOrders: res.totalOrdersCount,
        totalAmount: res.totalGrandTotal
      });
      // Recalculate MRP to update onOrderQuantity, po_created status and prevent duplicates
      await handleCalculateMRP();
    } catch (err: any) {
      alert(`Sipariş oluşturma hatası: ${err.message}`);
    } finally {
      setIsCreatingPO(false);
    }
  };

  // Print Work Order Ticket Modal trigger
  const openTicketModal = (wo: WorkOrder) => {
    setTicketWorkOrder(wo);
    setTicketPrintNotice(null);
    setIsTicketModalOpen(true);
  };

  // Direct Print Ticket with Fail-Safe Blob URL (Bypasses iframe restrictions)
  const handlePrintTicket = async () => {
    const printArea = document.getElementById('printable-ticket');
    if (!printArea || !ticketWorkOrder) return;

    setIsPrintingTicket(true);
    setTicketPrintNotice(null);

    try {
      // 1. Open dedicated print window via Blob URL (Bypasses iframe sandbox restrictions completely)
      const blobUrl = openPrintWindow(
        printArea.outerHTML,
        `İş Emri Proses Kartı - ${ticketWorkOrder.barcode}`,
        {
          title: `İş Emri Proses Ref Kartı - ${ticketWorkOrder.barcode}`,
          landscape: false,
          css: `
            body { background: #ffffff !important; padding: 12px !important; }
            #printable-ticket {
              margin: 0 auto !important;
              max-width: 620px !important;
              border: 2px solid #000000 !important;
              border-radius: 16px !important;
              padding: 16px !important;
              background: #ffffff !important;
              box-shadow: none !important;
            }
          `
        }
      );

      setTicketPrintNotice({
        message: 'İş emri proses kartı yeni yazdırma sekmesinde açıldı ve yazıcı penceresi otomatik tetiklendi.',
        blobUrl: blobUrl || undefined
      });

      // 2. Also try native print if outside iframe
      if (window.self === window.top) {
        setTimeout(() => {
          try {
            window.print();
          } catch (e) {
            console.warn('Native window.print failed:', e);
          }
        }, 150);
      }
    } catch (err) {
      console.error('Baskı başlatılırken hata:', err);
      await handleDownloadTicketPdf();
    } finally {
      setTimeout(() => {
        setIsPrintingTicket(false);
      }, 1000);
    }
  };

  // Download Ticket Card as High Quality PDF (.pdf)
  const handleDownloadTicketPdf = async () => {
    const printArea = document.getElementById('printable-ticket');
    if (!printArea || !ticketWorkOrder) return;

    setIsDownloadingTicketPdf(true);
    try {
      const canvas = await html2canvas(printArea, {
        scale: 2.5,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        onclone: (clonedDoc) => {
          const printRoot = clonedDoc.getElementById('printable-ticket');
          if (printRoot) {
            printRoot.style.fontFamily = 'Arial, Helvetica, sans-serif';
            printRoot.style.letterSpacing = 'normal';
            printRoot.style.transform = 'none';
          }
          const allElements = clonedDoc.querySelectorAll('*');
          allElements.forEach((el) => {
            const htmlEl = el as HTMLElement;
            try {
              htmlEl.style.fontFamily = 'Arial, Helvetica, sans-serif';
              htmlEl.style.letterSpacing = 'normal';
              const computed = window.getComputedStyle(htmlEl);
              const colorProps = ['color', 'backgroundColor', 'borderTopColor', 'borderBottomColor', 'borderLeftColor', 'borderRightColor'];
              colorProps.forEach((prop) => {
                const val = (computed as any)[prop];
                if (val && (val.includes('oklch') || val.includes('oklab') || val.includes('color(') || val.includes('lab(') || val.includes('lch('))) {
                  (htmlEl.style as any)[prop] = sanitizeCssColor(val);
                }
              });
            } catch {}
          });
        }
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true
      });

      const imgWidth = 180;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 15, 20, imgWidth, Math.min(imgHeight, 250));

      const cleanBarcode = String(ticketWorkOrder.barcode || ticketWorkOrder.id || 'proses').replace(/[^a-zA-Z0-9_-]/g, '_');
      pdf.save(`Is_Emri_Proses_Karti_${cleanBarcode}.pdf`);
    } catch (err) {
      console.error('PDF oluşturulurken hata:', err);
    } finally {
      setIsDownloadingTicketPdf(false);
    }
  };

  // Open Full A4 Detailed Work Order & Cutting Card Modal
  const openDetailedWorkOrderSheet = (wo: WorkOrder) => {
    setDetailedSheetWorkOrder(wo);
    setIsDetailedSheetModalOpen(true);
  };

  const handleSaveDetailedWorkOrder = async (updatedFields: Partial<WorkOrder>) => {
    if (!detailedSheetWorkOrder?.id) return;
    try {
      await api.workOrders.update(detailedSheetWorkOrder.id, updatedFields);
      setDetailedSheetWorkOrder({ ...detailedSheetWorkOrder, ...updatedFields });
    } catch (err: any) {
      console.error("İş emri güncellenirken hata:", err);
    }
  };

  // Material Status Pill
  const renderMaterialStatusBadge = (status?: MaterialReadinessStatus, productId?: number) => {
    switch (status) {
      case 'materials_ready':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">
            <CheckCircle className="w-3 h-3" /> Malzeme Hazır
          </span>
        );
      case 'po_created':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-300 dark:border-sky-800">
            <Truck className="w-3 h-3" /> Sipariş Açıldı (Yolda)
          </span>
        );
      case 'materials_shortage':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-rose-100 text-rose-800 border border-rose-200 animate-pulse">
            <AlertTriangle className="w-3 h-3" /> Hammadde Eksik
          </span>
        );
      case 'materials_consumed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
            <Check className="w-3 h-3" /> Malzeme Harcandı
          </span>
        );
      case 'no_recipe':
        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (productId) openRecipeModalForProduct(productId);
            }}
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200 transition-colors"
          >
            <AlertCircle className="w-3 h-3" /> Reçete Tanımla
          </button>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-sky-100 text-sky-800 border border-sky-200">
            <HelpCircle className="w-3 h-3" /> MRP Bekleniyor
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <PageHeader
        title="Üretim Planlama & Proses Takibi"
        subtitle="Siparişten imalata, otomatik ürün reçeteleri (BoM), MRP ve 8 kademeli barkodlu istasyonlar"
        badge="Üretim Takibi"
        icon={Factory}
        iconColor="amber"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleOpenScanner('production_wo')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/60 dark:hover:bg-purple-900/60 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 rounded-lg text-xs font-bold transition-colors shadow-xs cursor-pointer"
              title="Kamera ile Canlı Barkod/Karekod Okut (Stok Sayımı, Mal Kabul, İrsaliye, İş Emri)"
            >
              <Camera className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
              <span>Kamera ile Canlı Oku</span>
            </button>

            <button
              type="button"
              onClick={() => handleOpenBomModal()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 rounded-lg text-xs font-bold transition-colors shadow-xs cursor-pointer"
              title="Bir çift ayakkabı için deri, taban, astar ve bağcık otomatik sarfiyat düşümü"
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Otomatik BOM Sarfiyatı</span>
            </button>

            <button
              onClick={() => handleCalculateMRP()}
              disabled={isMrpCalculating}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold hover:bg-slate-50 dark:bg-slate-800/50 transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={cn("w-3.5 h-3.5 text-indigo-600", isMrpCalculating && "animate-spin")} />
              <span>{isMrpCalculating ? "Hesaplanıyor..." : "MRP İhtiyaç Hesapla"}</span>
            </button>

            <button
              onClick={() => setIsRecipeModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold hover:bg-slate-50 dark:bg-slate-800/50 transition-colors shadow-xs cursor-pointer"
            >
              <Settings2 className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              <span>Reçeteler (BoM)</span>
            </button>

            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 transition-colors shadow-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Yeni İş Emri</span>
            </button>
          </div>
        }
      />

      {/* Quick Stat Highlights */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Aktif İş Emirleri</span>
            <span className="text-xl font-black text-slate-900 dark:text-slate-100">
              {workOrders?.filter(w => w.status !== 'completed' && w.status !== 'cancelled').length || 0}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Sipariş Havuzu</span>
            <span className="text-xl font-black text-amber-600">
              {pendingSalesOrders.filter(o => o.hasMissingWorkOrders).length}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <ShoppingCart className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Eksik Hammadde</span>
            <span className={cn(
              "text-xl font-black",
              (mrpResult?.shortageItemsCount || 0) > 0 ? "text-rose-600" : "text-emerald-600"
            )}>
              {mrpResult?.shortageItemsCount || 0} Kalem
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Tamamlanan İmalat</span>
            <span className="text-xl font-black text-emerald-600">
              {workOrders?.filter(w => w.status === 'completed').length || 0}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="col-span-2 sm:col-span-4 lg:col-span-1 bg-gradient-to-br from-slate-900 to-indigo-950 p-4 rounded-2xl shadow-sm text-white flex items-center justify-between">
          <div>
            <span className="text-[9px] font-black uppercase tracking-widest text-indigo-300 block">Barkod İstasyonu</span>
            <button
              onClick={() => setActiveTab('barcode_terminal')}
              className="text-xs font-black text-white hover:text-indigo-200 uppercase flex items-center gap-1 mt-1 underline decoration-indigo-400 underline-offset-4"
            >
              Terminali Aç <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-900/10 text-white flex items-center justify-center">
            <Barcode className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Main Tab Navigation Bar */}
      <div className="bg-white dark:bg-slate-900 p-2 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1">
          <button
            onClick={() => setActiveTab('pipeline')}
            className={cn(
              "px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2",
              activeTab === 'pipeline'
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100 dark:bg-slate-800"
            )}
          >
            <Layers className="w-4 h-4 text-indigo-400" />
            1. Üretim Proses Hattı & Takip
          </button>

          <button
            onClick={() => setActiveTab('orders_pool')}
            className={cn(
              "px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2",
              activeTab === 'orders_pool'
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100 dark:bg-slate-800"
            )}
          >
            <ShoppingCart className="w-4 h-4 text-amber-400" />
            2. Bekleyen Sipariş Havuzu
            {pendingSalesOrders.filter(o => o.hasMissingWorkOrders).length > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('mrp')}
            className={cn(
              "px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2",
              activeTab === 'mrp'
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100 dark:bg-slate-800"
            )}
          >
            <RefreshCw className="w-4 h-4 text-rose-400" />
            3. Malzeme İhtiyaç Planlama (MRP)
            {(mrpResult?.shortageItemsCount || 0) > 0 && (
              <span className="px-1.5 py-0.2 text-[9px] font-black bg-rose-500 text-white rounded-md">
                {mrpResult?.shortageItemsCount} Eksik
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('barcode_terminal')}
            className={cn(
              "px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2",
              activeTab === 'barcode_terminal'
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100 dark:bg-slate-800"
            )}
          >
            <Barcode className="w-4 h-4 text-emerald-400" />
            4. Barkodlu İstasyon Terminali
          </button>

          <button
            onClick={() => setActiveTab('recipes')}
            className={cn(
              "px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2",
              activeTab === 'recipes'
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100 dark:bg-slate-800"
            )}
          >
            <Settings2 className="w-4 h-4 text-sky-400" />
            5. Reçeteler (BoM)
          </button>

          <button
            onClick={() => setActiveTab('reports')}
            className={cn(
              "px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2",
              activeTab === 'reports'
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100 dark:bg-slate-800"
            )}
          >
            <BarChart3 className="w-4 h-4 text-purple-400" />
            6. Üretim & Hat Raporları
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/reports?tab=production"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
          >
            <span>Raporlar Merkezi</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>

        {activeTab === 'pipeline' && (
          <div className="flex items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="İş emri, barkod, model ara..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <select
              value={stageFilter}
              onChange={e => setStageFilter(e.target.value)}
              className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none"
            >
              <option value="all">Tüm Aşamalar</option>
              {PRODUCTION_STAGES_CONFIG.map(st => (
                <option key={st.id} value={st.id}>{st.label}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* TAB 1: PRODUCTION PIPELINE & STAGES */}
      {activeTab === 'pipeline' && (
        <div className="space-y-6">
          {/* Horizontal Stage Stepper / Summary Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
            {PRODUCTION_STAGES_CONFIG.map(stage => {
              const count = workOrders?.filter(w => w.currentStage === stage.id && w.status !== 'cancelled').length || 0;
              const StageIcon = getStageIcon(stage.id);
              const isActive = stageFilter === stage.id;
              return (
                <button
                  key={stage.id}
                  onClick={() => setStageFilter(isActive ? 'all' : stage.id)}
                  className={cn(
                    "p-3 rounded-2xl border text-left transition-all relative overflow-hidden",
                    isActive
                      ? "bg-indigo-900 text-white border-indigo-900 shadow-md ring-2 ring-indigo-400"
                      : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-indigo-300"
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <StageIcon className={cn("w-4 h-4", isActive ? "text-indigo-300" : "text-slate-400")} />
                    <span className={cn(
                      "text-xs font-black px-1.5 py-0.5 rounded-md",
                      isActive ? "bg-white dark:bg-slate-900/20 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                    )}>
                      {count}
                    </span>
                  </div>
                  <div className="text-[10px] font-black uppercase tracking-tight truncate">{stage.shortLabel}</div>
                  <div className="text-[8px] opacity-70 truncate">{stage.description}</div>
                </button>
              );
            })}
          </div>

          {/* Work Order Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredWorkOrders.length === 0 ? (
              <div className="col-span-full bg-white dark:bg-slate-900 rounded-3xl p-16 border border-slate-200 dark:border-slate-700 text-center space-y-3">
                <Layers className="w-12 h-12 mx-auto text-slate-300" />
                <h4 className="text-base font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider">Kayıtlı İş Emri Bulunamadı</h4>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Seçili filtreye uygun aktif iş emri yok. Satış Siparişleri Havuzundan siparişleri üretime alabilir veya yukarıdan yeni iş emri açabilirsiniz.
                </p>
              </div>
            ) : (
              filteredWorkOrders.map(wo => {
                const product = productMap.get(wo.productId);
                const stageInfo = getStageInfo(wo.currentStage);
                const StageIcon = getStageIcon(wo.currentStage);

                return (
                  <div
                    key={wo.id}
                    className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-3 group relative overflow-hidden"
                  >
                    {/* Top Stage & Barcode Row */}
                    <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className={cn(
                          "px-2 py-0.5 rounded-lg text-[9px] font-black uppercase flex items-center gap-1 border",
                          stageInfo.color
                        )}>
                          <StageIcon className="w-3 h-3" />
                          {stageInfo.shortLabel}
                        </span>
                      </div>

                      <span className="font-mono text-[10px] font-black text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700">
                        {wo.barcode}
                      </span>
                    </div>

                    {/* Product & Order Details */}
                    <div className="space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                            {product?.code || 'KODSUZ'}
                          </div>
                          <h4 className="text-sm font-black text-slate-900 dark:text-slate-100 line-clamp-1 group-hover:text-indigo-600 transition-colors">
                            {product?.name || 'Bilinmeyen Ürün'}
                          </h4>
                        </div>
                        {product?.image && (
                          <img 
                            src={product.image} 
                            alt="" 
                            className="w-10 h-10 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0" 
                          />
                        )}
                      </div>

                      {/* Variant & Order info */}
                      <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                        {wo.color && (
                          <span className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-2 py-0.5 rounded font-bold uppercase">
                            Renk: {wo.color}
                          </span>
                        )}
                        {wo.size && (
                          <span className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-2 py-0.5 rounded font-bold uppercase">
                            Beden: {wo.size}
                          </span>
                        )}
                        {wo.orderNumber && (
                          <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-bold uppercase">
                            Sip: {wo.orderNumber}
                          </span>
                        )}
                      </div>

                      {wo.customerName && (
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium truncate flex items-center gap-1">
                          <User className="w-3 h-3 text-slate-400" />
                          {wo.customerName}
                        </div>
                      )}
                    </div>

                    {/* Quantity & Material Status */}
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                      <div>
                        <div className="text-[9px] font-bold text-slate-400 uppercase">Miktar</div>
                        <div className="text-base font-black text-slate-900 dark:text-slate-100">{wo.quantity} <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Adet/Çift</span></div>
                      </div>

                      <div className="text-right">
                        {renderMaterialStatusBadge(wo.materialStatus, wo.productId)}
                      </div>
                    </div>

                    {/* Progress Bar (8 Stages) */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[8px] font-black uppercase text-slate-400">
                        <span>İlerleme: {stageInfo.order} / 8</span>
                        <span>{Math.round((stageInfo.order / 8) * 100)}%</span>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden flex">
                        <div 
                          className="bg-indigo-600 h-full rounded-full transition-all duration-300"
                          style={{ width: `${(stageInfo.order / 8) * 100}%` }}
                        />
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="pt-2 flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openRefakatKarti(wo)}
                        className="p-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 text-xs font-black transition-all flex items-center justify-center shrink-0 shadow-xs cursor-pointer"
                        title="Üretim Refakat Kartı (Kesim ➔ Dikim ➔ Montaj ➔ Finisaj Takip ve Onay Kutucuklu Fiş)"
                      >
                        <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenBomModal(wo.productId)}
                        className="p-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-black transition-all flex items-center justify-center shrink-0 shadow-xs cursor-pointer"
                        title="BOM Reçete Sarfiyatını İncele ve Otomatik Düş"
                      >
                        <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      </button>

                      <button
                        type="button"
                        onClick={() => openDetailedWorkOrderSheet(wo)}
                        className="p-2 rounded-xl bg-amber-100 hover:bg-amber-400 text-amber-950 text-xs font-black transition-all flex items-center justify-center shrink-0 shadow-xs"
                        title="Detaylı A4 Üretim & Kesim Kartelasını Görüntüle / Yazdır"
                      >
                        <FileSpreadsheet className="w-4 h-4 text-amber-800" />
                      </button>

                      <button
                        type="button"
                        onClick={() => openTicketModal(wo)}
                        className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all flex items-center justify-center shrink-0"
                        title="İş Emri & Barkod Ref Kartı"
                      >
                        <Printer className="w-4 h-4" />
                      </button>

                      {wo.status !== 'completed' ? (
                        <button
                          type="button"
                          onClick={() => handleOpenStageTransition(wo)}
                          className="flex-1 py-2 px-3 bg-slate-900 hover:bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-xs"
                        >
                          <Play className="w-3.5 h-3.5" />
                          Sonraki Aşamaya Geç
                        </button>
                      ) : (
                        <div className="flex-1 py-2 px-3 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-[10px] font-black uppercase tracking-wider text-center flex items-center justify-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Üretim Bitti
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* TAB 2: SALES ORDERS POOL (SİPARİŞTEN ÜRETİME HAVUZ) */}
      {activeTab === 'orders_pool' && (
        <div className="space-y-4">
          <div className="bg-amber-50 p-4 rounded-2xl border border-amber-200 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <ShoppingCart className="w-6 h-6 text-amber-600 shrink-0" />
              <div>
                <h4 className="text-sm font-black text-amber-900 uppercase">Satış Siparişleri & Üretim Entegrasyonu</h4>
                <p className="text-xs text-amber-700 font-medium">
                  Alınan ve onaylanan tüm satış siparişleri buraya düşer. Tek tuşla tüm kalemler için üretim iş emirleri ve proses barkodları oluşturabilirsiniz.
                </p>
              </div>
            </div>
          </div>

          <DataGrid
            columns={ordersPoolColumns}
            data={pendingSalesOrders}
            rowKey="id"
            emptyMessage="Kayıtlı satış siparişi bulunamadı."
            rowActions={(order) => (
              <button
                type="button"
                onClick={() => handleTransferOrderToProduction(order.id!)}
                className="px-4 py-2 bg-indigo-600 hover:bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shadow-xs whitespace-nowrap"
              >
                ⚡ Üretim Planına Al
              </button>
            )}
          />
        </div>
      )}

      {/* TAB 3: MRP (MALZEME İHTİYAÇ PLANLAMASI) */}
      {activeTab === 'mrp' && (
        <div className="space-y-6">
          {/* MRP Header Card */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight">
                  Otomatik Malzeme İhtiyaç Planlaması (MRP)
                </h3>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Aktif üretim iş emirlerinin reçete hammadde ihtiyaçları anlık depo mevcudu ve satın alma siparişleriyle uzlaştırılır.
              </p>
            </div>

            <div className="flex items-center flex-wrap gap-3">
              {/* Work Order Filter Dropdown */}
              <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
                <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap">Kapsam:</label>
                <select
                  value={mrpWoFilter}
                  onChange={(e) => {
                    const val = e.target.value;
                    setMrpWoFilter(val);
                    if (val === 'all') {
                      handleCalculateMRP();
                    } else {
                      handleCalculateMRP([Number(val)]);
                    }
                  }}
                  className="bg-transparent text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer"
                >
                  <option value="all">Tüm Aktif İş Emirleri (Genel MRP)</option>
                  {(workOrders || []).filter(w => w.status === 'pending' || w.status === 'in_progress').map(wo => {
                    const p = productMap.get(wo.productId);
                    return (
                      <option key={`mrp-wo-opt-${wo.id}`} value={wo.id}>
                        {wo.barcode || `#WO-${wo.id}`} — {p?.name || 'Ürün'} ({wo.quantity} Çift)
                      </option>
                    );
                  })}
                </select>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (mrpWoFilter === 'all') {
                    handleCalculateMRP();
                  } else {
                    handleCalculateMRP([Number(mrpWoFilter)]);
                  }
                }}
                disabled={isMrpCalculating}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2"
              >
                <RefreshCw className={cn("w-4 h-4", isMrpCalculating && "animate-spin")} />
                Yeniden Hesapla
              </button>

              {(mrpResult?.shortageItemsCount || 0) > 0 ? (
                <button
                  type="button"
                  onClick={handleOpenPurchaseOrderModal}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 shadow-md shadow-rose-100 animate-pulse"
                >
                  <ShoppingCart className="w-4 h-4" />
                  Eksikler İçin Satın Alma Oluştur ({mrpResult?.shortageItemsCount})
                </button>
              ) : mrpResult && mrpResult.items.some(i => i.status === 'po_created') ? (
                <div className="px-3.5 py-2 bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 text-sky-800 dark:text-sky-300 rounded-xl text-xs font-black flex items-center gap-2">
                  <Truck className="w-4 h-4 text-sky-600" />
                  <span>Eksik Malzemeler Siparişte (Mükerrer Koruma Aktif)</span>
                </div>
              ) : null}
            </div>
          </div>

          {/* MRP Table */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs overflow-hidden">
            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div className="text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider">
                Gerekli Hammadde ve Malzeme Listesi ({mrpResult?.items.length || 0} Kalem)
              </div>
              {mrpResult?.totalShortageCost ? (
                <div className="text-xs font-black text-rose-600">
                  Tahmini Eksik Tedarik Maliyeti: {mrpResult.totalShortageCost.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                </div>
              ) : mrpResult && mrpResult.items.some(i => i.status === 'po_created') ? (
                <div className="text-xs font-bold text-sky-700 dark:text-sky-300 flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5 text-sky-600" />
                  Tüm eksikler için Satın Alma Siparişi açılmıştır
                </div>
              ) : null}
            </div>

            <DataGrid<MrpRequirementItem>
              columns={mrpColumns}
              data={mrpResult?.items || []}
              rowKey={(item) => getMrpKey(item)}
              emptyMessage="Aktif üretim emirlerinde hammadde ihtiyacı bulunamadı veya reçete tanımlanmamış."
              toolbar={(() => {
                const shortages = mrpResult?.items.filter(i => i.status === 'shortage' && i.shortageQuantity > 0) || [];
                const allShortagesSelected = shortages.length > 0 && shortages.every(i => selectedMrpKeys.includes(getMrpKey(i)));
                return (
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={allShortagesSelected}
                      disabled={shortages.length === 0}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedMrpKeys(shortages.map(i => getMrpKey(i)));
                        } else {
                          setSelectedMrpKeys([]);
                        }
                      }}
                      className="rounded text-indigo-600 focus:ring-indigo-500 disabled:opacity-30 cursor-pointer"
                      title={shortages.length === 0 ? "Sipariş verilecek yeni eksik hammadde bulunmuyor" : "Tüm eksikleri seç"}
                    />
                    Tüm Eksikleri Seç ({shortages.length})
                  </label>
                );
              })()}
            />
          </div>
        </div>
      )}

      {/* TAB 4: BARCODE OPERATOR TERMINAL */}
      {activeTab === 'barcode_terminal' && (
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
                  onClick={() => handleOpenScanner('production_wo')}
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
      )}

      {/* TAB 5: RECIPES (BoM) MANAGEMENT */}
      {activeTab === 'recipes' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-xs">
            <div>
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight">Ürün Reçeteleri & Varyant BoM Yönetimi</h3>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1">
                1 adet veya 1 çift mamul üretimi için gereken hammadde, yarı mamul (taban, mostra vb.), aksesuar ve sarfiyat reçeteleri. Renk bazlı (örn: 2045 Siyah için 126 Taban Siyah) ve asorti matris eşlemeli tanımlanabilir.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                const finishedProds = products?.filter(p => p.categoryType === 'finished' || (!p.categoryType && !p.isRawMaterial && p.categoryType !== 'semi_finished' && p.categoryType !== 'accessory')) || [];
                const firstId = finishedProds[0]?.id || 0;
                openRecipeModalForProduct(firstId, 'all');
              }}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-xs shrink-0"
            >
              <Plus className="w-4 h-4" /> Yeni Reçete Tanımla
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {products?.filter(p => p.categoryType === 'finished' || (!p.categoryType && !p.isRawMaterial && p.categoryType !== 'semi_finished' && p.categoryType !== 'accessory')).map(prod => {
              const allProdRecipes = recipes?.filter(r => r.productId === prod.id) || [];
              const hasGenericRecipe = allProdRecipes.some(r => !r.targetColor || r.targetColor === 'all');

              return (
                <div key={prod.id} className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 p-5 shadow-xs space-y-4 flex flex-col justify-between hover:border-slate-300 transition-all">
                  <div className="space-y-3">
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                      <span className="text-[10px] font-mono font-black text-slate-400 uppercase tracking-widest">{prod.code}</span>
                      <div className="flex items-center gap-1.5">
                        {allProdRecipes.length > 0 ? (
                          <span className="text-[9px] font-black bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            {allProdRecipes.length} Reçete Tanımlı
                          </span>
                        ) : (
                          <span className="text-[9px] font-black bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full border border-amber-200">
                            Reçete Yok
                          </span>
                        )}
                      </div>
                    </div>

                    <div>
                      <h4 className="text-base font-black text-slate-900 dark:text-slate-100 line-clamp-1">{prod.name}</h4>
                      {prod.brand && <p className="text-[11px] font-bold text-slate-400">{prod.brand} {prod.subType ? `• ${prod.subType}` : ''}</p>}
                    </div>

                    {/* Color Pills & Status */}
                    {prod.colors && prod.colors.length > 0 && (
                      <div className="space-y-1 bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-2xl border border-slate-100 dark:border-slate-800">
                        <div className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Model Renk Varyantları:</div>
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          {prod.colors.map(col => {
                            const colorRecipe = allProdRecipes.find(r => r.targetColor === col);
                            return (
                              <button
                                key={col}
                                type="button"
                                onClick={() => openRecipeModalForProduct(prod.id!, col)}
                                className={cn(
                                  "text-[10px] font-black px-2.5 py-1 rounded-lg border flex items-center gap-1.5 transition-all",
                                  colorRecipe
                                    ? "bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100"
                                    : hasGenericRecipe
                                    ? "bg-sky-50 text-sky-800 border-sky-200 hover:bg-sky-100"
                                    : "bg-white dark:bg-slate-900 text-slate-600 border-slate-200 dark:border-slate-700 hover:border-indigo-300"
                                )}
                              >
                                <span>{col}</span>
                                {colorRecipe ? (
                                  <span className="text-[8px] bg-emerald-200 text-emerald-900 px-1 rounded font-black">Özel</span>
                                ) : hasGenericRecipe ? (
                                  <span className="text-[8px] bg-sky-200 text-sky-900 px-1 rounded font-black">Genel</span>
                                ) : (
                                  <span className="text-[8px] text-amber-600 font-bold">+ Ekle</span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Defined Recipes Detailed List */}
                    {allProdRecipes.length > 0 && (
                      <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                        {allProdRecipes.map((rc, rcIdx) => (
                          <div key={`prod-${prod.id}-rc-${rc.id || rcIdx}-${rc.targetColor || 'genel'}`} className="bg-slate-50 dark:bg-slate-800/50/80 p-3 rounded-2xl border border-slate-200 dark:border-slate-700/80 dark:border-slate-800/80 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-md uppercase bg-indigo-100 text-indigo-800 border border-indigo-200">
                                {rc.targetColor ? `🎨 ${rc.targetColor} Reçetesi` : '🌐 Genel (Tüm Renkler)'}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => openRecipeModalForProduct(prod.id!, rc.targetColor || 'all')}
                                  className="text-[9px] font-black text-slate-600 dark:text-slate-300 hover:text-indigo-600 uppercase flex items-center gap-0.5"
                                  title="Reçeteyi aç veya başka renklere kopyala"
                                >
                                  <Copy className="w-3 h-3" />
                                  Düzenle / Kopyala
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openRecipeModalForProduct(prod.id!, rc.targetColor || 'all')}
                                  className="text-[9px] font-black text-indigo-600 hover:text-indigo-800 uppercase"
                                >
                                  Düzenle
                                </button>
                                {rc.id && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteRecipe(rc.id!)}
                                    className="text-[9px] font-black text-rose-500 hover:text-rose-700 uppercase"
                                  >
                                    Sil
                                  </button>
                                )}
                              </div>
                            </div>

                            <div className="space-y-1">
                              {rc.ingredients.map((ing, i) => {
                                const matProd = productMap.get(ing.productId);
                                const isSemi = matProd?.categoryType === 'semi_finished';
                                const isAccessory = matProd?.categoryType === 'accessory';
                                return (
                                  <div key={i} className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 p-1.5 rounded-xl border border-slate-100 dark:border-slate-800">
                                    <div className="truncate flex items-center gap-1.5">
                                      <span className={cn(
                                        "text-[8px] font-black px-1.5 py-0.2 rounded uppercase",
                                        isSemi ? "bg-sky-100 text-sky-800" : isAccessory ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                                      )}>
                                        {isSemi ? 'Yarı Mamul' : isAccessory ? 'Aksesuar' : 'Hammadde'}
                                      </span>
                                      <span className="truncate text-slate-900 dark:text-slate-100">{matProd?.name || 'Malzeme'}</span>
                                      {ing.color && (
                                        <span className="text-[9px] font-black text-indigo-600 bg-indigo-50 px-1.5 py-0.2 rounded">
                                          [{ing.color}]
                                        </span>
                                      )}
                                      {ing.isMatrixMatched && (
                                        <span className="text-[8px] font-black bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded border border-emerald-200">
                                          🎯 Matrisli
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-indigo-600 font-black flex-shrink-0 ml-2">
                                      {ing.quantity} {ing.unit || matProd?.unit || 'Adet'}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openRecipeModalForProduct(prod.id!)}
                      className="flex-1 py-2.5 bg-slate-900 hover:bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all text-center shadow-xs"
                    >
                      {allProdRecipes.length > 0 ? "Reçeteleri Yönet / Ekle" : "+ İlk Reçeteyi Tanımla"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 6: PRODUCTION & SHOPFLOOR REPORTS */}
      {activeTab === 'reports' && (
        <ProductionReport />
      )}

      {/* MODAL 1: NEW MANUAL WORK ORDER */}
      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Yeni Üretim İş Emri">
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
              onChange={e => {
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
              {products?.filter(p => p.categoryType === 'finished' || (!p.categoryType && !p.isRawMaterial && p.categoryType !== 'semi_finished' && p.categoryType !== 'accessory')).map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.code}) {p.subType ? `• ${p.subType}` : ''}</option>
              ))}
            </select>
          </div>

          {/* Quick Color Selector if model has colors */}
          {manualWoProductId > 0 && productMap.get(manualWoProductId)?.colors && (
            <div className="space-y-1.5 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Model Renk Seçimi:</label>
              <div className="flex flex-wrap gap-1.5">
                {productMap.get(manualWoProductId)!.colors!.map(col => (
                  <button
                    key={col}
                    type="button"
                    onClick={() => setManualWoColor(col)}
                    className={cn(
                      "text-xs font-black px-3 py-1.5 rounded-lg border transition-all uppercase",
                      manualWoColor === col
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                        : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-300 hover:border-indigo-300"
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
                onChange={e => setManualWoColor(e.target.value)}
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
                onChange={e => setManualWoSize(e.target.value)}
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

      {/* MODAL 2: RECIPE (BoM) BUILDER & VARIANT MANAGEMENT */}
      <RecipeModal
        isOpen={isRecipeModalOpen}
        onClose={() => setIsRecipeModalOpen(false)}
        selectedProductId={selectedProductId}
        setSelectedProductId={setSelectedProductId}
        selectedRecipeTargetColor={selectedRecipeTargetColor}
        setSelectedRecipeTargetColor={setSelectedRecipeTargetColor}
        products={products}
        recipes={recipes}
        onSaveSuccess={() => {
          handleCalculateMRP();
        }}
      />

      {/* MODAL 3: STAGE ADVANCEMENT MODAL */}
      <Modal isOpen={isStageTransitionModalOpen} onClose={() => setIsStageTransitionModalOpen(false)} title="Üretim Aşaması İlerlemesi">
        {selectedWorkOrder && (
          <div className="space-y-4">
            <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
              <div className="text-[10px] font-bold text-slate-400 uppercase">İş Emri & Model</div>
              <div className="text-base font-black text-slate-900 dark:text-slate-100">
                {productMap.get(selectedWorkOrder.productId)?.name} ({selectedWorkOrder.barcode})
              </div>
              <div className="text-xs font-bold text-indigo-700">
                Mevcut Aşama: {getStageInfo(selectedWorkOrder.currentStage).label}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Hedef Aşama</label>
              <select
                value={transitionTargetStage}
                onChange={e => setTransitionTargetStage(e.target.value as ProductionStage)}
                className="w-full border border-slate-300 rounded-xl p-3 text-sm font-black text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 focus:outline-none"
              >
                {PRODUCTION_STAGES_CONFIG.map(st => (
                  <option key={st.id} value={st.id}>{st.label}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">İşleyen Operatör</label>
                <input
                  type="text"
                  placeholder="Örn: Ahmet Usta"
                  value={transitionOperator}
                  onChange={e => setTransitionOperator(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Fire / Iskarta (Adet)</label>
                <input
                  type="number"
                  min="0"
                  value={transitionScrap}
                  onChange={e => setTransitionScrap(Number(e.target.value))}
                  className="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Aşama Notu</label>
              <input
                type="text"
                placeholder="Örn: Kesim tamamlandı, lazer baskıya aktarıldı."
                value={transitionNotes}
                onChange={e => setTransitionNotes(e.target.value)}
                className="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none"
              />
            </div>

            <button
              type="button"
              onClick={handleExecuteStageTransition}
              className="w-full bg-indigo-600 hover:bg-slate-900 text-white py-3.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-md"
            >
              Aşamayı Onayla ve Geçişi Kaydet
            </button>
          </div>
        )}
      </Modal>

      {/* MODAL 4: WORK ORDER REF TICKET / BARCODE PRINT */}
      <Modal 
        isOpen={isTicketModalOpen} 
        onClose={() => {
          setIsTicketModalOpen(false);
          setTicketPrintNotice(null);
        }} 
        title="İş Emri & Proses Ref Kartı" 
        className="max-w-xl"
      >
        {ticketWorkOrder && (
          <div className="space-y-4">
            {/* Print Feedback Banner */}
            {ticketPrintNotice && (
              <div className="bg-amber-50 border border-amber-300 text-amber-950 p-3 rounded-2xl flex items-center justify-between gap-3 text-xs font-semibold print:hidden shadow-sm">
                <div className="flex items-center gap-2">
                  <Printer className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>{ticketPrintNotice.message}</span>
                  {ticketPrintNotice.blobUrl && (
                    <a
                      href={ticketPrintNotice.blobUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline font-bold text-indigo-700 hover:text-indigo-900 ml-1 inline-flex items-center gap-1"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> Yazdırma Sayfasını Aç
                    </a>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setTicketPrintNotice(null)}
                  className="p-1 hover:bg-amber-200/70 rounded-lg text-slate-600 cursor-pointer"
                  title="Kapat"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            <div id="printable-ticket" className="bg-white dark:bg-slate-900 p-6 rounded-3xl border-2 border-slate-900 space-y-4 text-black">
              {/* Header */}
              <div className="flex items-center justify-between border-b-2 border-black pb-3">
                <div>
                  <h3 className="text-xl font-black uppercase tracking-tight">PRO-ERP İŞ EMRİ REFAKAT KARTI</h3>
                  <p className="text-[10px] font-mono font-bold">TAKİP NO: {ticketWorkOrder.barcode}</p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold font-mono">{new Date().toLocaleDateString('tr-TR')}</span>
                </div>
              </div>

              {/* Product Info */}
              <div className="grid grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-2xl border border-slate-300">
                <div>
                  <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase block">Model Adı / Kodu</span>
                  <span className="text-sm font-black text-black">
                    {productMap.get(ticketWorkOrder.productId)?.name} ({productMap.get(ticketWorkOrder.productId)?.code})
                  </span>
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase block">Üretim Miktarı</span>
                  <span className="text-sm font-black text-black">{ticketWorkOrder.quantity} Çift / Adet</span>
                </div>
                {ticketWorkOrder.orderNumber && (
                  <div>
                    <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase block">Sipariş / Müşteri</span>
                    <span className="text-xs font-black text-black">{ticketWorkOrder.orderNumber} - {ticketWorkOrder.customerName || ''}</span>
                  </div>
                )}
                {ticketWorkOrder.color && (
                  <div>
                    <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase block">Varyant / Renk</span>
                    <span className="text-xs font-black text-black">{ticketWorkOrder.color} {ticketWorkOrder.size ? `(${ticketWorkOrder.size})` : ''}</span>
                  </div>
                )}
              </div>

              {/* Main Work Order Barcode */}
              <div className="p-3 bg-white dark:bg-slate-900 border border-slate-300 rounded-2xl flex flex-col items-center justify-center">
                <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">İş Emri Ana Barkodu</div>
                <BarcodeSvg value={ticketWorkOrder.barcode} height={50} showText={true} />
              </div>

              {/* Process Stages Quick Barcodes */}
              <div className="space-y-2">
                <div className="text-[9px] font-black uppercase tracking-wider text-slate-600">Proses Aşama Ref Kodları</div>
                <div className="grid grid-cols-4 gap-1.5 text-center text-[8px] font-bold font-mono">
                  {PRODUCTION_STAGES_CONFIG.slice(1, 7).map(st => (
                    <div key={st.id} className="p-1.5 rounded-lg border border-slate-300 bg-slate-50 dark:bg-slate-800/50">
                      <div className="text-[8px] font-black uppercase text-slate-800 dark:text-slate-200 mb-0.5">{st.shortLabel}</div>
                      <BarcodeSvg value={`${ticketWorkOrder.barcode}-${st.id.slice(0, 3).toUpperCase()}`} height={24} showText={false} />
                      <span className="text-[7px] text-slate-500 dark:text-slate-400">{ticketWorkOrder.barcode}-{st.id.slice(0, 3).toUpperCase()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => {
                  setIsTicketModalOpen(false);
                  openDetailedWorkOrderSheet(ticketWorkOrder);
                }}
                className="py-2.5 px-4 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-md shadow-amber-400/20 cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4" /> Detaylı A4 Kartelayı Aç
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isDownloadingTicketPdf}
                  onClick={handleDownloadTicketPdf}
                  className="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
                >
                  {isDownloadingTicketPdf ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> PDF...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" /> PDF İndir
                    </>
                  )}
                </button>

                <button
                  type="button"
                  disabled={isPrintingTicket}
                  onClick={handlePrintTicket}
                  className="py-2.5 px-5 bg-slate-900 hover:bg-indigo-600 disabled:opacity-50 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
                >
                  {isPrintingTicket ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Yazıcı Açılıyor...
                    </>
                  ) : (
                    <>
                      <Printer className="w-4 h-4" /> Barkod Kartını Yazdır
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL 4B: DETAILED A4 WORK ORDER & CUTTING SHEET MODAL (AYAKKABI STANDART KARTELA) */}
      <DetailedWorkOrderCardModal
        isOpen={isDetailedSheetModalOpen}
        onClose={() => setIsDetailedSheetModalOpen(false)}
        workOrder={detailedSheetWorkOrder}
        product={detailedSheetWorkOrder ? productMap.get(detailedSheetWorkOrder.productId) : undefined}
        recipe={detailedSheetWorkOrder?.productId ? (recipes?.find(r => r.productId === detailedSheetWorkOrder.productId && (!r.targetColor || r.targetColor === 'all' || r.targetColor === detailedSheetWorkOrder.color)) || recipes?.find(r => r.productId === detailedSheetWorkOrder.productId)) : undefined}
        allProducts={products || []}
        customer={contacts?.find(c => c.name === detailedSheetWorkOrder?.customerName || c.code === detailedSheetWorkOrder?.customerCode)}
        onSaveWorkOrder={handleSaveDetailedWorkOrder}
      />

      {/* MODAL 5: AUTO PURCHASE ORDER FROM MRP (MULTI-SUPPLIER SPLIT) */}
      <Modal 
        isOpen={isPurchaseOrderModalOpen} 
        onClose={() => {
          setIsPurchaseOrderModalOpen(false);
          setPoCreatedSummary(null);
        }} 
        title="MRP'den Tedarikçiye Göre Ayrıştırılmış Satın Alma Siparişleri"
        className="max-w-3xl sm:max-w-4xl"
      >
        {poCreatedSummary ? (
          <div className="space-y-6 py-2">
            <div className="p-6 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 rounded-3xl text-center space-y-2">
              <div className="w-12 h-12 bg-emerald-600 text-white rounded-full flex items-center justify-center mx-auto shadow-lg shadow-emerald-200">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-black text-emerald-900 dark:text-emerald-200 uppercase tracking-tight">
                {poCreatedSummary.totalOrders} Adet Satın Alma Siparişi Başarıyla Oluşturuldu!
              </h3>
              <p className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">
                Eksik malzemeler tedarikçi firmalarına göre otomatik gruplandırılarak ayrı ayrı resmi alış siparişlerine dönüştürüldü.
              </p>
            </div>

            <div className="space-y-3">
              <div className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Oluşturulan Sipariş Fişleri ({poCreatedSummary.totalOrders})
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-64 overflow-y-auto pr-1">
                {poCreatedSummary.orders.map(o => (
                  <div key={o.orderId} className="p-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2 shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-black text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 px-2 py-0.5 rounded">
                        #{o.orderNumber}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
                        {o.itemCount} Kalem Malzeme
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs font-black text-slate-900 dark:text-slate-100">
                      <Building2 className="w-3.5 h-3.5 text-slate-400" />
                      <span>{o.supplierName}</span>
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-700">
                      <button
                        type="button"
                        onClick={() => {
                          setPrintPoId(o.orderId);
                          setIsPoPrintModalOpen(true);
                        }}
                        className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer border border-indigo-200 dark:border-indigo-800"
                      >
                        <Printer className="w-3 h-3" />
                        <span>Tedarikçi Formu & Yazdır</span>
                      </button>
                      <span className="text-xs font-black text-slate-900 dark:text-slate-100">
                        {o.grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-700">
              <Link
                to="/orders"
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2"
              >
                <ExternalLink className="w-4 h-4" />
                Siparişler Modülünde Gör
              </Link>
              <button
                type="button"
                onClick={() => {
                  setIsPurchaseOrderModalOpen(false);
                  setPoCreatedSummary(null);
                }}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all"
              >
                Tamam
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-3.5 bg-indigo-50/60 dark:bg-indigo-950/30 rounded-2xl border border-indigo-100 dark:border-indigo-900/40 flex items-start gap-3">
              <Split className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />
              <div className="text-xs text-indigo-900 dark:text-indigo-200">
                <span className="font-bold">Çoklu Tedarikçi Ayrıştırması: </span>
                Her malzeme için tanımlı tedarikçi otomatik seçilmiştir. Onayladığınızda sistem her tedarikçi firmaya <b>ayrı bir Satın Alma Siparişi</b> oluşturacaktır.
              </div>
            </div>

            {/* Quick batch assign */}
            <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-xs font-bold text-slate-600 dark:text-slate-400">
                Toplu Tedarikçi Ata:
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <select
                  value={batchSupplierId || ''}
                  onChange={e => setBatchSupplierId(Number(e.target.value) || null)}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none"
                >
                  <option value="">Tedarikçi Seçin...</option>
                  {contacts?.filter(c => c.type === 'supplier' || c.type === 'both').map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!batchSupplierId}
                  onClick={() => {
                    if (!batchSupplierId) return;
                    const updated = { ...itemSuppliers };
                    selectedMrpKeys.forEach(key => {
                      updated[key] = batchSupplierId;
                    });
                    setItemSuppliers(updated);
                  }}
                  className="px-3 py-1.5 bg-slate-900 dark:bg-slate-100 hover:bg-indigo-600 text-white dark:text-slate-900 dark:hover:text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50 shrink-0"
                >
                  Tümüne Uygula
                </button>
              </div>
            </div>

            {/* Items table */}
            <DataGrid<MrpRequirementItem>
              columns={poModalColumns}
              data={(mrpResult?.items || []).filter(i => selectedMrpKeys.includes(getMrpKey(i)) && i.shortageQuantity > 0)}
              rowKey={(item) => getMrpKey(item)}
              maxHeight="18rem"
              emptyMessage="Seçili eksik hammadde bulunmuyor."
            />

            {/* Live split summary preview */}
            {(() => {
              const shortageList = mrpResult?.items.filter(i => selectedMrpKeys.includes(getMrpKey(i)) && i.shortageQuantity > 0) || [];
              const groupMap = new Map<number, { supplierName: string; items: typeof shortageList; totalCost: number }>();
              const allSuppliers = contacts?.filter(c => c.type === 'supplier' || c.type === 'both') || [];

              shortageList.forEach(it => {
                const key = getMrpKey(it);
                const sId = itemSuppliers[key] || itemSuppliers[String(it.rawMaterialId)] || it.preferredSupplierId || allSuppliers[0]?.id || 0;
                const supplierObj = allSuppliers.find(c => c.id === sId);
                const sName = supplierObj?.name || 'Genel Tedarikçi';

                const existing = groupMap.get(sId) || { supplierName: sName, items: [], totalCost: 0 };
                existing.items.push(it);
                existing.totalCost += it.estimatedCost;
                groupMap.set(sId, existing);
              });

              const totalSplitOrders = groupMap.size;
              const totalEstAmount = Array.from(groupMap.values()).reduce((sum, g) => sum + g.totalCost, 0);

              return (
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    <span>Otomatik Açılacak Siparişler ({totalSplitOrders} Ayrı Firma)</span>
                    <span className="text-indigo-600 font-bold">Toplam: {totalEstAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                    {Array.from(groupMap.entries()).map(([sId, g], groupIdx) => (
                      <div key={`po-group-box-${sId}-${groupIdx}`} className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900 dark:text-slate-100 truncate">{g.supplierName}</span>
                          <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 px-1.5 py-0.2 rounded">
                            {g.items.length} Kalem
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {g.items.map(i => `${i.rawMaterialName}${i.color ? ` (${i.color})` : ''}`).join(', ')}
                        </div>
                        <div className="text-[11px] font-black text-slate-800 dark:text-slate-200 text-right">
                          {g.totalCost.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    disabled={isCreatingPO || shortageList.length === 0}
                    onClick={handleCreatePurchaseOrderFromMRP}
                    className="w-full bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white py-3.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-md shadow-rose-100 flex items-center justify-center gap-2 cursor-pointer mt-3"
                  >
                    {isCreatingPO ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Siparişler Oluşturuluyor...
                      </>
                    ) : (
                      <>
                        <Split className="w-4 h-4" />
                        Tedarikçilere Göre Ayrıştır ve {totalSplitOrders} Ayrı Sipariş Aç
                      </>
                    )}
                  </button>
                </div>
              );
            })()}
          </div>
        )}
      </Modal>

      {/* MODAL 6: ÜRETİM REFAKAT KARTI (İŞ EMRİ TAKİP FİŞİ) MODAL */}
      <ProductionRefakatKartiModal
        isOpen={isRefakatKartiModalOpen}
        onClose={() => {
          setIsRefakatKartiModalOpen(false);
          setRefakatWorkOrder(null);
        }}
        workOrder={refakatWorkOrder}
        product={refakatWorkOrder ? productMap.get(refakatWorkOrder.productId) : undefined}
        recipe={refakatWorkOrder?.productId ? (recipes?.find(r => r.productId === refakatWorkOrder.productId && (!r.targetColor || r.targetColor === 'all' || r.targetColor === refakatWorkOrder.color)) || recipes?.find(r => r.productId === refakatWorkOrder.productId)) : undefined}
        customer={contacts?.find(c => c.name === refakatWorkOrder?.customerName || c.code === refakatWorkOrder?.customerCode)}
        onStageUpdated={() => {
          // Live query will refresh data automatically
        }}
      />

      {/* MODAL 7: BOM (ÜRÜN REÇETESİ) & OTOMATİK SARFİYAT DÜŞÜMÜ MODAL */}
      <BomConsumptionModal
        isOpen={isBomConsumptionModalOpen}
        onClose={() => {
          setIsBomConsumptionModalOpen(false);
          setBomSelectedProductId(undefined);
        }}
        initialProductId={bomSelectedProductId}
      />

      {/* MODAL 8: KAMERA İLE CANLI BARKOD / KAREKOD OKUYUCU MODAL */}
      <CameraBarcodeScannerModal
        isOpen={isCameraScannerOpen}
        onClose={() => setIsCameraScannerOpen(false)}
        initialMode={cameraScannerInitialMode}
        initialScannedCode={cameraScannerInitialCode}
        onWorkOrderFound={(wo) => {
          setRefakatWorkOrder(wo);
          setIsRefakatKartiModalOpen(true);
        }}
      />

      {/* MODAL 9: SATINALMA SİPARİŞİ / TEDARİKÇİ FORMU & ASORTİ MATRİSİ YAZDIRMA & MAİL */}
      <PurchaseOrderPrintModal
        isOpen={isPoPrintModalOpen}
        onClose={() => {
          setIsPoPrintModalOpen(false);
          setPrintPoId(null);
        }}
        orderId={printPoId}
      />

    </div>
  );
}
