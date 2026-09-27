import React, { useState, useEffect, useRef } from 'react';
import {
  Camera,
  X,
  Flashlight,
  FlashlightOff,
  Volume2,
  VolumeX,
  Search,
  Package,
  Truck,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Barcode,
  Upload,
  Keyboard,
} from 'lucide-react';
import Modal from '../Modal';
import { api } from '../../api/client';
import { settingsService } from '../../services/settingsService';
import { waybillService } from '../../services/waybillService';
import { inventoryService } from '../../services/inventoryService';
import { productionService } from '../../services/productionService';
import type { Product, WorkOrder, Contact, Waybill } from '../../types';
import {
  StockCountPanel,
  GoodsReceiptPanel,
  WaybillDispatchPanel,
  ProductionWoPanel,
} from './CameraScannerPanels';
import { Html5Qrcode } from 'html5-qrcode';

export type ScannerMode = 'stock_count' | 'goods_receipt' | 'waybill_dispatch' | 'production_wo';

export interface CameraBarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: ScannerMode;
  initialBarcode?: string;
  initialScannedCode?: string;
  onSuccess?: () => void;
  onWorkOrderFound?: (wo: WorkOrder) => void;
  onProductScanned?: (product: Product, variant?: any) => void;
}

// Audio Beep generator using Web Audio API
function playScannerBeep(type: 'success' | 'error' | 'stage') {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'success') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
      osc.frequency.setValueAtTime(1320, audioCtx.currentTime + 0.08); // E6
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.2);
    } else if (type === 'stage') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.1); // A5
      osc.frequency.setValueAtTime(1174.66, audioCtx.currentTime + 0.2); // D6
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.35);
    } else {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.3);
    }
  } catch {
    // AudioContext blocked or not supported
  }
}

export default function CameraBarcodeScannerModal({
  isOpen,
  onClose,
  initialMode = 'stock_count',
  initialBarcode = '',
  initialScannedCode = '',
  onSuccess,
  onWorkOrderFound,
  onProductScanned
}: CameraBarcodeScannerModalProps) {
  const [activeMode, setActiveMode] = useState<ScannerMode>(initialMode);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [availableCameras, setAvailableCameras] = useState<{ id: string; label: string }[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  // Manual code entry / USB Scanner input
  const [manualCode, setManualCode] = useState('');
  const [lastScannedCode, setLastScannedCode] = useState<string>('');

  // 1. STOCK COUNT & LOOKUP STATE
  const [matchedProduct, setMatchedProduct] = useState<Product | null>(null);
  const [matchedVariant, setMatchedVariant] = useState<{ size: string; color?: string; stock?: number } | null>(null);
  const [countedQty, setCountedQty] = useState<number>(0);
  const [countNotice, setCountNotice] = useState<string | null>(null);

  // 2. GOODS RECEIPT (MAL KABUL) STATE
  const [receiptBasket, setReceiptBasket] = useState<{
    productId: number;
    code: string;
    name: string;
    unit: string;
    quantity: number;
    size?: string;
    color?: string;
  }[]>([]);
  const [supplierId, setSupplierId] = useState<number>(0);
  const [receiptDocumentNo, setReceiptDocumentNo] = useState<string>('');
  const [suppliers, setSuppliers] = useState<Contact[]>([]);

  // 3. WAYBILL DISPATCH (SEVKİYAT) STATE
  const [dispatchBasket, setDispatchBasket] = useState<{
    productId: number;
    code: string;
    name: string;
    unit: string;
    quantity: number;
    size?: string;
    color?: string;
    unitPrice: number;
  }[]>([]);
  const [customerId, setCustomerId] = useState<number>(0);
  const [customers, setCustomers] = useState<Contact[]>([]);
  const [createdWaybill, setCreatedWaybill] = useState<Waybill | null>(null);

  // 4. PRODUCTION WORK ORDER STATE
  const [matchedWorkOrder, setMatchedWorkOrder] = useState<WorkOrder | null>(null);
  const [targetStageFromBarcode, setTargetStageFromBarcode] = useState<string | null>(null);

  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const scannerContainerId = 'barcode-scanner-viewfinder';

  // Load Contacts (Suppliers & Customers)
  useEffect(() => {
    async function loadContacts() {
      const all = await api.contacts.list();
      setSuppliers(all.filter(c => c.type === 'supplier' || c.type === 'both'));
      setCustomers(all.filter(c => c.type === 'customer' || c.type === 'both'));
    }
    if (isOpen) {
      loadContacts();
    }
  }, [isOpen]);

  useEffect(() => {
    if (initialMode) setActiveMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    if (initialBarcode && isOpen) {
      handleCodeDetected(initialBarcode);
    }
  }, [initialBarcode, isOpen]);

  // Initialize and start Camera Scanner
  useEffect(() => {
    let isMounted = true;

    async function startCameraScanner() {
      if (!isOpen) return;

      try {
        setCameraError(null);
        // Request available video cameras
        const devices = await Html5Qrcode.getCameras();
        if (devices && devices.length > 0 && isMounted) {
          setAvailableCameras(devices);
          // Prefer back/environment camera
          const backCam = devices.find(d => 
            d.label.toLowerCase().includes('back') || 
            d.label.toLowerCase().includes('arka') ||
            d.label.toLowerCase().includes('environment')
          );
          const chosenId = backCam ? backCam.id : devices[0].id;
          setSelectedCameraId(chosenId);

          const scanner = new Html5Qrcode(scannerContainerId);
          html5QrCodeRef.current = scanner;

          await scanner.start(
            chosenId,
            {
              fps: 15,
              qrbox: { width: 280, height: 160 },
              aspectRatio: 1.777778
            },
            (decodedText) => {
              handleCodeDetected(decodedText);
            },
            () => {
              // Frame scan failure (benign, scanning in progress)
            }
          );

          if (isMounted) setCameraActive(true);
        } else {
          setCameraError('Cihazınızda aktif kamera bulunamadı veya erişim engellendi.');
        }
      } catch (err: any) {
        console.warn('Kamera başlatma uyarısı:', err);
        if (isMounted) {
          setCameraError('Kameraya erişilemedi (İzin verilmemiş olabilir veya tarayıcı güvenlik kısıtlaması). Barkod veya takip numarasını aşağıdaki alandan el ile girebilir veya barkod tabancasıyla okutabilirsiniz.');
          setCameraActive(false);
        }
      }
    }

    if (isOpen) {
      // Small timeout to allow modal container to render
      const timer = setTimeout(() => {
        startCameraScanner();
      }, 250);

      return () => {
        clearTimeout(timer);
        isMounted = false;
        stopScanner();
      };
    }
  }, [isOpen]);

  const stopScanner = async () => {
    if (html5QrCodeRef.current) {
      try {
        if (html5QrCodeRef.current.isScanning) {
          await html5QrCodeRef.current.stop();
        }
        await html5QrCodeRef.current.clear();
      } catch (err) {
        console.warn('Scanner temizleme hatası:', err);
      }
      html5QrCodeRef.current = null;
    }
    setCameraActive(false);
  };

  const handleCameraChange = async (cameraId: string) => {
    setSelectedCameraId(cameraId);
    if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
      await html5QrCodeRef.current.stop();
      await html5QrCodeRef.current.start(
        cameraId,
        {
          fps: 15,
          qrbox: { width: 280, height: 160 }
        },
        (decodedText) => handleCodeDetected(decodedText),
        () => {}
      );
    }
  };

  const toggleTorch = async () => {
    if (!html5QrCodeRef.current) return;
    try {
      const track = (html5QrCodeRef.current as any).getRunningTrackCapabilities?.();
      if (track && track.torch) {
        const nextState = !isTorchOn;
        await (html5QrCodeRef.current as any).applyVideoConstraints({
          advanced: [{ torch: nextState }]
        });
        setIsTorchOn(nextState);
      } else {
        alert('Bu kamerada fener (torch) özelliği desteklenmiyor.');
      }
    } catch (err) {
      console.warn('Fener açılamadı:', err);
    }
  };

  // Image file scanner fallback
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const scanner = html5QrCodeRef.current || new Html5Qrcode(scannerContainerId);
      const result = await scanner.scanFile(file, true);
      if (result) {
        handleCodeDetected(result);
      }
    } catch (err: any) {
      alert('Seçilen görselde okunabilir barkod bulunamadı.');
    }
  };

  // CORE LOGIC: Handle Barcode Detection
  const handleCodeDetected = async (rawCode: string) => {
    const code = rawCode.trim();
    if (!code || isProcessing) return;

    // Prevent immediate duplicate reading spam
    if (code === lastScannedCode && Date.now() - lastScanTimeRef.current < 1500) {
      return;
    }
    lastScanTimeRef.current = Date.now();
    setLastScannedCode(code);
    setIsProcessing(true);

    if (soundEnabled) playScannerBeep('success');
    if (navigator.vibrate) navigator.vibrate([80, 40, 80]);

    try {
      // 1. Check if it's a Work Order Barcode (starts with WO- or has hyphen suffix for stage)
      if (code.startsWith('WO-') || activeMode === 'production_wo') {
        const baseWoCode = code.split('-').slice(0, 2).join('-');
        const stagePart = code.split('-')[2]; // e.g. KES, SAY, MON, FIN

        const wo = await api.workOrders.findOne({ barcode: baseWoCode }) ||
                   await api.workOrders.findOne({ barcode: code });

        if (wo) {
          setMatchedWorkOrder(wo);
          if (onWorkOrderFound) {
            onWorkOrderFound(wo);
          }
          if (stagePart) {
            const stageMap: Record<string, string> = {
              'KES': 'cutting',
              'SAY': 'sewing',
              'DIK': 'sewing',
              'MON': 'assembly',
              'FIN': 'finishing',
              'KAL': 'finishing',
              'PAK': 'completed'
            };
            setTargetStageFromBarcode(stageMap[stagePart.toUpperCase()] || null);
          }
          setActiveMode('production_wo');
          setIsProcessing(false);
          return;
        }
      }

      // 2. Lookup Product in Database (by direct barcode, code, or variant barcode)
      const allProducts = await api.products.list();
      let foundProduct: Product | null = null;
      let foundVariant: { size: string; color?: string; stock?: number } | null = null;

      for (const p of allProducts) {
        if (p.barcode === code || p.code === code) {
          foundProduct = p;
          break;
        }
        if (p.variantBarcodes && p.variantBarcodes.length > 0) {
          const v = p.variantBarcodes.find(vb => vb.barcode === code);
          if (v) {
            foundProduct = p;
            foundVariant = v;
            break;
          }
        }
        if (p.colorBoxBarcodes && p.colorBoxBarcodes.length > 0) {
          const cb = p.colorBoxBarcodes.find(c => c.barcode === code);
          if (cb) {
            foundProduct = p;
            foundVariant = { size: 'Asorti', color: cb.color };
            break;
          }
        }
      }

      if (foundProduct) {
        setMatchedProduct(foundProduct);
        setMatchedVariant(foundVariant);
        if (onProductScanned) {
          onProductScanned(foundProduct, foundVariant);
        }
        const currentStock = foundVariant?.stock !== undefined ? foundVariant.stock : (foundProduct.stock || 0);
        setCountedQty(currentStock);
        setCountNotice(null);

        // If in Goods Receipt mode, append to receiving basket
        if (activeMode === 'goods_receipt') {
          setReceiptBasket(prev => {
            const existingIdx = prev.findIndex(item => 
              item.productId === foundProduct!.id && 
              item.size === (foundVariant?.size || 'Standart') && 
              item.color === (foundVariant?.color || 'Genel')
            );
            if (existingIdx > -1) {
              const updated = [...prev];
              updated[existingIdx].quantity += 1;
              return updated;
            } else {
              return [
                ...prev,
                {
                  productId: foundProduct!.id!,
                  code: foundProduct!.code,
                  name: foundProduct!.name,
                  unit: foundProduct!.unit || 'Adet',
                  quantity: 1,
                  size: foundVariant?.size,
                  color: foundVariant?.color
                }
              ];
            }
          });
        }

        // If in Waybill Dispatch mode, append to dispatch basket
        if (activeMode === 'waybill_dispatch') {
          setDispatchBasket(prev => {
            const existingIdx = prev.findIndex(item => 
              item.productId === foundProduct!.id && 
              item.size === (foundVariant?.size || 'Standart') && 
              item.color === (foundVariant?.color || 'Genel')
            );
            if (existingIdx > -1) {
              const updated = [...prev];
              updated[existingIdx].quantity += 1;
              return updated;
            } else {
              return [
                ...prev,
                {
                  productId: foundProduct!.id!,
                  code: foundProduct!.code,
                  name: foundProduct!.name,
                  unit: foundProduct!.unit || 'Çift',
                  quantity: 1,
                  size: foundVariant?.size,
                  color: foundVariant?.color,
                  unitPrice: foundProduct!.sellingPrice || 0
                }
              ];
            }
          });
        }
      } else {
        // Not found as product, check if work order without prefix
        const wo = await api.workOrders.findOne({ barcode: code });
        if (wo) {
          setMatchedWorkOrder(wo);
          if (onWorkOrderFound) {
            onWorkOrderFound(wo);
          }
          setActiveMode('production_wo');
        } else {
          setCountNotice(`'${code}' barkoduna ait ürün veya iş emri kaydı bulunamadı.`);
        }
      }
    } catch (err: any) {
      console.error('Barkod okuma işleme hatası:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Synchronize initial mode & barcode when modal opens
  useEffect(() => {
    if (isOpen) {
      if (initialMode) setActiveMode(initialMode);
      const codeToScan = initialBarcode || initialScannedCode;
      if (codeToScan) {
        setManualCode(codeToScan);
        handleCodeDetected(codeToScan);
      }
    }
  }, [isOpen, initialMode, initialBarcode, initialScannedCode]);

  const lastScanTimeRef = useRef<number>(0);

  // ACTION: Apply Physical Count adjustment (Mod 1: Sayım)
  const handleSaveStockCount = async () => {
    if (!matchedProduct || !matchedProduct.id) return;

    try {
      const currentSysStock = matchedVariant?.stock !== undefined ? matchedVariant.stock : (matchedProduct.stock || 0);
      const diff = countedQty - currentSysStock;

      if (diff === 0) {
        setCountNotice('Sayılan miktar ile sistem stoğu birebir aynı. Değişiklik yapılmadı.');
        return;
      }

      await inventoryService.adjustInventoryQuantity(
        matchedProduct.id,
        diff,
        `Kamera Canlı Barkod Sayımı Düzeltmesi (Sayılan: ${countedQty}, Önceki: ${currentSysStock} ${matchedVariant?.size ? 'Beden: ' + matchedVariant.size : ''})`
      );

      // Refresh product
      const updatedProd = await api.products.get(matchedProduct.id);
      if (updatedProd) {
        setMatchedProduct(updatedProd);
        if (matchedVariant && updatedProd.variantBarcodes) {
          const v = updatedProd.variantBarcodes.find(vb => vb.size === matchedVariant.size);
          if (v) setMatchedVariant(v);
        }
      }

      if (soundEnabled) playScannerBeep('stage');
      setCountNotice(`Stok başarıyla güncellendi! Yeni Fiili Stok: ${countedQty} ${matchedProduct.unit || 'Çift'}`);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      alert(`Stok kaydedilirken hata: ${err.message}`);
    }
  };

  // ACTION: Complete Goods Receipt (Mod 2: Mal Kabulü)
  const handleCompleteGoodsReceipt = async () => {
    if (receiptBasket.length === 0) return;

    try {
      const now = new Date();
      const sup = suppliers.find(s => s.id === supplierId);
      const supplierLabel = sup ? sup.name : 'Genel Mal Kabul';
      const docLabel = receiptDocumentNo ? ` - Belge: ${receiptDocumentNo}` : '';

      for (const item of receiptBasket) {
        await inventoryService.adjustInventoryQuantity(
          item.productId,
          item.quantity,
          `Kamera Mal Kabulü: ${supplierLabel}${docLabel} (+${item.quantity} ${item.unit} ${item.size ? 'Beden ' + item.size : ''})`
        );
      }

      if (soundEnabled) playScannerBeep('stage');
      alert(`Mal kabulü tamamlandı! Toplam ${receiptBasket.reduce((sum, it) => sum + it.quantity, 0)} birim depoya alındı.`);
      setReceiptBasket([]);
      setReceiptDocumentNo('');
      if (onSuccess) onSuccess();
    } catch (err: any) {
      alert(`Mal kabulü işlenirken hata: ${err.message}`);
    }
  };

  // ACTION: Create Waybill from Scanned Items (Mod 3: İrsaliye)
  const handleCreateWaybillFromDispatch = async () => {
    if (dispatchBasket.length === 0) return;

    try {
      const now = new Date();
      const cust = customers.find(c => c.id === customerId);
      const settings = await settingsService.getSystemSettings();
      const prefix = settings.order?.waybillSalesPrefix || 'IRS-2026-';
      const randomSeq = Math.floor(1000 + Math.random() * 9000);
      const waybillNumber = `${prefix}${randomSeq}`;

      const totalAmount = dispatchBasket.reduce((sum, it) => sum + (it.quantity * it.unitPrice), 0);
      const totalQty = dispatchBasket.reduce((sum, it) => sum + it.quantity, 0);

      const waybillData = {
        type: 'sales' as const,
        scenario: 'sevk' as const,
        waybillNumber,
        contactId: customerId || (customers[0]?.id || 1),
        contactName: cust?.name || 'Muhtelif Müşteri',
        date: now,
        shippingDate: now,
        dispatchDate: now,
        status: 'issued' as const,
        invoicedStatus: 'not_invoiced' as const,
        subtotal: totalAmount,
        discountTotal: 0,
        taxTotal: totalAmount * 0.20,
        grandTotal: totalAmount * 1.20,
        totalQuantity: totalQty,
        currency: 'TRY',
        isStockDeducted: true,
        notes: 'Kamera Canlı Sevkiyat Okuyucu ile otomatik oluşturuldu.'
      };

      const waybillItems = dispatchBasket.map(it => ({
        productId: it.productId,
        productCode: it.code,
        productName: it.name,
        quantity: it.quantity,
        unit: it.unit,
        unitPrice: it.unitPrice,
        discountRate: 0,
        discountAmount: 0,
        taxRate: 20,
        taxAmount: (it.quantity * it.unitPrice) * 0.20,
        total: (it.quantity * it.unitPrice) * 1.20
      }));

      const waybillId = await waybillService.createWaybill(waybillData, waybillItems);

      const created = await api.waybills.get(waybillId);
      setCreatedWaybill(created || null);
      if (soundEnabled) playScannerBeep('stage');
      setDispatchBasket([]);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      alert(`İrsaliye oluşturulurken hata: ${err.message}`);
    }
  };

  // ACTION: Advance Work Order Stage (Mod 4: Üretim Bandı)
  const handleAdvanceWorkOrderStage = async (targetStage: string) => {
    if (!matchedWorkOrder || !matchedWorkOrder.id) return;

    try {
      await productionService.transitionWorkOrderStage(matchedWorkOrder.id, targetStage as any, {
        operator: 'Kamera Refakat Barkod Okuyucu'
      });

      const updated = await api.workOrders.get(matchedWorkOrder.id);
      if (updated) setMatchedWorkOrder(updated);

      if (soundEnabled) playScannerBeep('stage');
      setTargetStageFromBarcode(null);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      alert(`İş emri aşaması güncellenirken hata: ${err.message}`);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Kamera ile Canlı Barkod & Karekod Okuyucu"
      className="max-w-4xl max-h-[94vh] overflow-y-auto"
    >
      <div className="space-y-4">
        {/* OPERATIONAL MODE SELECTION TABS */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-100 dark:bg-slate-800/60 p-1.5 rounded-2xl">
          <button
            type="button"
            onClick={() => setActiveMode('stock_count')}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeMode === 'stock_count'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            <span>1. Stok Sayım & Sorgu</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveMode('goods_receipt')}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeMode === 'goods_receipt'
                ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>2. Depoya Mal Kabulü</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveMode('waybill_dispatch')}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeMode === 'waybill_dispatch'
                ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Truck className="w-3.5 h-3.5" />
            <span>3. Hızlı İrsaliye & Sevk</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveMode('production_wo')}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeMode === 'production_wo'
                ? 'bg-white dark:bg-slate-900 text-purple-600 dark:text-purple-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>4. Refakat Kartı & Üretim</span>
          </button>
        </div>

        {/* CAMERA VIEWFINDER & LIVE SCANNER AREA */}
        <div className="relative rounded-3xl overflow-hidden bg-slate-950 border-2 border-slate-800 text-white min-h-[260px] flex flex-col items-center justify-center shadow-xl">
          {/* HTML5 QRCODE CONTAINER */}
          <div 
            id={scannerContainerId} 
            className="w-full max-w-md h-64 overflow-hidden rounded-2xl flex items-center justify-center"
          />

          {/* Crosshair Laser Scanning Line Overlay */}
          {cameraActive && (
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
              <div className="w-64 h-36 border-2 border-indigo-400/70 rounded-2xl relative overflow-hidden shadow-2xl">
                {/* Animated Red Laser Line */}
                <div className="w-full h-0.5 bg-rose-500 shadow-[0_0_8px_#f43f5e] animate-bounce absolute top-0" />
                {/* Corner markers */}
                <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-white" />
                <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-white" />
                <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-white" />
                <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-white" />
              </div>
              <span className="text-[10px] font-bold text-slate-300 bg-black/60 px-3 py-1 rounded-full mt-2 backdrop-blur-xs">
                Barkodu veya Karekodu kırmızı kılavuz alanına hizalayınız
              </span>
            </div>
          )}

          {/* Camera Controls Overlay (Top Bar) */}
          <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between pointer-events-auto">
            <div className="flex items-center gap-1.5 bg-black/70 backdrop-blur-md px-2.5 py-1 rounded-xl border border-white/10 text-xs">
              <span className={`w-2 h-2 rounded-full ${cameraActive ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <span className="text-[11px] font-bold">
                {cameraActive ? 'Kamera Canlı Okuyor' : 'Kamera Bekliyor'}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              {/* Torch Toggle */}
              <button
                type="button"
                onClick={toggleTorch}
                className="p-2 rounded-xl bg-black/70 hover:bg-black text-white border border-white/10 transition-all cursor-pointer"
                title="Feneri Aç / Kapat"
              >
                {isTorchOn ? <Flashlight className="w-4 h-4 text-amber-400" /> : <FlashlightOff className="w-4 h-4 text-slate-400" />}
              </button>

              {/* Sound Toggle */}
              <button
                type="button"
                onClick={() => setSoundEnabled(!soundEnabled)}
                className="p-2 rounded-xl bg-black/70 hover:bg-black text-white border border-white/10 transition-all cursor-pointer"
                title={soundEnabled ? 'Sesi Kapat' : 'Sesi Aç'}
              >
                {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
              </button>
            </div>
          </div>

          {/* Camera Error / Fallback Message */}
          {cameraError && (
            <div className="p-4 m-3 bg-amber-950/80 border border-amber-500/50 rounded-2xl text-amber-200 text-xs text-center space-y-2">
              <AlertTriangle className="w-6 h-6 text-amber-400 mx-auto" />
              <p>{cameraError}</p>
            </div>
          )}
        </div>

        {/* MANUAL CODE ENTRY / SCANNER GUN INPUT & IMAGE UPLOAD TOOLBAR */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs">
          <div className="sm:col-span-2 flex items-center gap-2">
            <div className="relative flex-1">
              <Keyboard className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="El ile Barkod / Kod girin veya barkod tabancasını okutun..."
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleCodeDetected(manualCode);
                    setManualCode('');
                  }
                }}
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono text-xs font-semibold"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                handleCodeDetected(manualCode);
                setManualCode('');
              }}
              className="py-2 px-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-xs cursor-pointer shadow-xs"
            >
              Sorgula
            </button>
          </div>

          {/* Image File Fallback */}
          <div className="flex items-center justify-end">
            <label className="py-2 px-3 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl font-bold text-xs cursor-pointer flex items-center gap-1.5 transition-all">
              <Upload className="w-3.5 h-3.5" />
              <span>Fotoğraftan Tara</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {/* STATUS NOTICE / FEEDBACK */}
        {countNotice && (
          <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-indigo-900 dark:text-indigo-200 rounded-2xl text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>{countNotice}</span>
            </div>
            <button onClick={() => setCountNotice(null)} className="p-1 hover:bg-indigo-100 rounded">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* MODE 1: STOCK COUNT & LOOKUP VIEW */}
        {activeMode === 'stock_count' && (
          <StockCountPanel
            matchedProduct={matchedProduct}
            matchedVariant={matchedVariant}
            lastScannedCode={lastScannedCode}
            countedQty={countedQty}
            setCountedQty={setCountedQty}
            handleSaveStockCount={handleSaveStockCount}
          />
        )}

        {/* MODE 2: GOODS RECEIPT (MAL KABULÜ) VIEW */}
        {activeMode === 'goods_receipt' && (
          <GoodsReceiptPanel
            supplierId={supplierId}
            setSupplierId={setSupplierId}
            suppliers={suppliers}
            receiptDocumentNo={receiptDocumentNo}
            setReceiptDocumentNo={setReceiptDocumentNo}
            receiptBasket={receiptBasket}
            setReceiptBasket={setReceiptBasket}
            handleCompleteGoodsReceipt={handleCompleteGoodsReceipt}
          />
        )}

        {/* MODE 3: WAYBILL DISPATCH (SEVKİYAT) VIEW */}
        {activeMode === 'waybill_dispatch' && (
          <WaybillDispatchPanel
            customerId={customerId}
            setCustomerId={setCustomerId}
            customers={customers}
            dispatchBasket={dispatchBasket}
            setDispatchBasket={setDispatchBasket}
            handleCreateWaybillFromDispatch={handleCreateWaybillFromDispatch}
            createdWaybill={createdWaybill}
          />
        )}

        {/* MODE 4: PRODUCTION WORK ORDER & ROUTE SHEET VIEW */}
        {activeMode === 'production_wo' && (
          <ProductionWoPanel
            matchedWorkOrder={matchedWorkOrder}
            targetStageFromBarcode={targetStageFromBarcode}
            handleAdvanceWorkOrderStage={handleAdvanceWorkOrderStage}
          />
        )}

        {/* FOOTER CLOSE BUTTON */}
        <div className="flex justify-end pt-2 border-t border-slate-200 dark:border-slate-700">
          <button
            type="button"
            onClick={onClose}
            className="py-2 px-5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer"
          >
            Kapat
          </button>
        </div>
      </div>
    </Modal>
  );
}
