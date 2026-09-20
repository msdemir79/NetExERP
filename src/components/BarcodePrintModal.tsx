import React, { useState, useEffect, useMemo, useRef } from 'react';
import { api } from '../api/client';
import { 
  Barcode, 
  Printer, 
  Layers, 
  Package, 
  Sparkles, 
  Settings2, 
  Tag, 
  Check, 
  Plus, 
  Minus, 
  Eye,
  Image as ImageIcon,
  Upload,
  Trash2,
  ExternalLink,
  Loader2,
  RefreshCw,
  Sliders
} from 'lucide-react';
import { cn } from '../lib/utils';
import Modal from './Modal';
import { BarcodeSvg } from './BarcodeSvg';
import { Product, AssortmentTemplate, BarcodeTemplate } from '../types';
import { printHtml, openPrintWindow } from '../lib/printService';
import { resizeAndOptimizeImage } from '../utils/imageUtils';
import { useApiQuery } from '../hooks/useApiQuery';

export interface BarcodePrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  templates?: AssortmentTemplate[];
  initialMode?: 'box' | 'variant';
  initialBoxCount?: number;
  orderContext?: {
    orderNumber?: string;
    customerName?: string;
    orderedQuantities?: { color?: string; size?: string; quantity: number }[];
  };
}

export const BarcodePrintModal: React.FC<BarcodePrintModalProps> = ({
  isOpen,
  onClose,
  product,
  templates = [],
  initialMode = 'box',
  initialBoxCount = 1,
  orderContext
}) => {
  // Active print category: 'box' (Koli Barkodu) vs 'variant' (Asorti / Beden Barkodu)
  const [activeTab, setActiveTab] = useState<'box' | 'variant'>(initialMode);

  // Database Barcode Templates
  const dbBarcodeTemplates = useApiQuery(() => api.barcodeTemplates.list(), [], ['barcodeTemplates']) || [];
  const [selectedDbTemplateId, setSelectedDbTemplateId] = useState<number | ''>('');

  // Label formatting options & custom dimensions
  const [labelSize, setLabelSize] = useState<'100x80' | '100x150' | '80x60' | '60x40' | '50x30' | '40x25' | 'custom'>('100x80');
  const [customWidthMm, setCustomWidthMm] = useState<number>(100);
  const [customHeightMm, setCustomHeightMm] = useState<number>(80);

  const [showPrice, setShowPrice] = useState<boolean>(true);
  const [showOrderInfo, setShowOrderInfo] = useState<boolean>(Boolean(orderContext?.orderNumber));
  const [showBoxSerial, setShowBoxSerial] = useState<boolean>(true);
  const [companyHeader, setCompanyHeader] = useState<string>('ProERP SHOES');

  // Apply a selected DB Template
  const handleApplyDbTemplate = (templateId: number | '') => {
    setSelectedDbTemplateId(templateId);
    if (!templateId) return;

    const tmpl = dbBarcodeTemplates.find(t => t.id === templateId);
    if (tmpl) {
      setLabelSize(tmpl.presetSize as any);
      setCustomWidthMm(tmpl.widthMm);
      setCustomHeightMm(tmpl.heightMm);
      if (tmpl.config) {
        if (tmpl.config.companyHeaderText) setCompanyHeader(tmpl.config.companyHeaderText);
        if (tmpl.config.showPrice !== undefined) setShowPrice(tmpl.config.showPrice);
        if (tmpl.config.showOrderInfo !== undefined) setShowOrderInfo(tmpl.config.showOrderInfo);
        if (tmpl.config.showBoxSerial !== undefined) setShowBoxSerial(tmpl.config.showBoxSerial);
        if (tmpl.config.showProductImage !== undefined) setShowImage(tmpl.config.showProductImage);
        if (tmpl.config.imageFit) setImageFit(tmpl.config.imageFit);
      }
    }
  };

  // --- Image support on labels ---
  const [showImage, setShowImage] = useState<boolean>(Boolean(product?.image || (product?.colorImages && product.colorImages.length > 0)));
  const [customImage, setCustomImage] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<'sm' | 'md' | 'lg'>('md');
  const [imageFit, setImageFit] = useState<'contain' | 'cover'>('contain');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get active effective dimensions in mm
  const getEffectiveDimensions = (): { width: number; height: number } => {
    if (labelSize === 'custom') {
      return {
        width: Math.max(20, Math.min(300, Number(customWidthMm) || 100)),
        height: Math.max(15, Math.min(300, Number(customHeightMm) || 80))
      };
    }
    const [w, h] = labelSize.split('x').map(Number);
    return { width: w || 100, height: h || 80 };
  };

  const handleSelectPresetSize = (preset: '100x80' | '100x150' | '80x60' | '60x40' | '50x30' | '40x25') => {
    setLabelSize(preset);
    const [w, h] = preset.split('x').map(Number);
    setCustomWidthMm(w);
    setCustomHeightMm(h);
  };

  const handleCustomWidthChange = (val: number) => {
    setCustomWidthMm(val);
    setLabelSize('custom');
  };

  const handleCustomHeightChange = (val: number) => {
    setCustomHeightMm(val);
    setLabelSize('custom');
  };

  // Print loading state
  const [isPrinting, setIsPrinting] = useState<boolean>(false);

  // --- Koli Barkodu State ---
  const availableColors = useMemo(() => {
    if (product?.colors && product.colors.length > 0) return product.colors;
    return ['Genel'];
  }, [product?.colors]);

  const [boxCounts, setBoxCounts] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    availableColors.forEach(c => {
      init[c] = initialBoxCount || 1;
    });
    return init;
  });

  const [globalBoxInput, setGlobalBoxInput] = useState<number>(initialBoxCount || 10);

  // --- Asorti / Beden Barkodu State ---
  const [selectedVariantColors, setSelectedVariantColors] = useState<string[]>(availableColors);

  // Assortment item definitions for this product
  const effectiveAssortment = useMemo(() => {
    if (!product) return [{ size: 'Standart', quantity: 1 }];
    if (product.assortment && product.assortment.length > 0) {
      return product.assortment;
    }
    if (product.assortmentTemplateId && templates) {
      const tmpl = templates.find(t => t.id === product.assortmentTemplateId);
      if (tmpl && tmpl.items?.length > 0) return tmpl.items;
    }
    if (product.isFootwear) {
      return [
        { size: '40', quantity: 1 },
        { size: '41', quantity: 2 },
        { size: '42', quantity: 2 },
        { size: '43', quantity: 2 },
        { size: '44', quantity: 1 }
      ];
    }
    return [{ size: 'Standart', quantity: 1 }];
  }, [product, templates]);

  const totalPairsPerBox = useMemo(() => {
    return effectiveAssortment.reduce((acc, curr) => acc + (curr.quantity || 1), 0);
  }, [effectiveAssortment]);

  // Variant quantity map: key `${color}_${size}` -> print quantity
  const [variantQuantities, setVariantQuantities] = useState<Record<string, number>>({});
  const [assortmentBoxMultiplier, setAssortmentBoxMultiplier] = useState<number>(initialBoxCount || 10);

  // Helper to retrieve the appropriate image for a specific color or general label
  const getLabelImageForColor = (color?: string): string | null => {
    if (!showImage) return null;
    if (customImage) return customImage;
    if (!product) return null;
    if (color && product.colorImages && product.colorImages.length > 0) {
      const found = product.colorImages.find(ci => ci.color.toLowerCase() === color.toLowerCase());
      if (found && found.image) return found.image;
    }
    return product.image || null;
  };

  // Image upload handler with automatic resizing & compression
  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const optimized = await resizeAndOptimizeImage(file, { maxWidth: 600, maxHeight: 600, quality: 0.85 });
        setCustomImage(optimized);
        setShowImage(true);
      } catch (err) {
        console.error('Etiket görseli optimize hatası:', err);
      }
    }
  };

  // Apply automatic assortment distribution: (Size Ratio x Box Count)
  const applyAssortmentMultiplier = (boxes: number, activeColors = selectedVariantColors) => {
    const newQty: Record<string, number> = {};
    activeColors.forEach(color => {
      effectiveAssortment.forEach(item => {
        const key = `${color}_${item.size}`;
        newQty[key] = (item.quantity || 1) * Math.max(1, boxes);
      });
    });
    setVariantQuantities(newQty);
  };

  // Initialize or reset quantities based on product and context
  useEffect(() => {
    if (!isOpen || !product) return;

    const colors = product.colors && product.colors.length > 0 ? product.colors : ['Genel'];
    setSelectedVariantColors(colors);

    if (orderContext?.orderedQuantities && orderContext.orderedQuantities.length > 0) {
      const vQty: Record<string, number> = {};
      const bQty: Record<string, number> = {};
      colors.forEach(c => { bQty[c] = 0; });

      orderContext.orderedQuantities.forEach(item => {
        const color = item.color || colors[0];
        const size = item.size || 'Standart';
        const key = `${color}_${size}`;
        vQty[key] = (vQty[key] || 0) + item.quantity;
        bQty[color] = (bQty[color] || 0) + Math.ceil(item.quantity / Math.max(1, totalPairsPerBox));
      });

      setVariantQuantities(vQty);
      setBoxCounts(bQty);
    } else {
      applyAssortmentMultiplier(assortmentBoxMultiplier, colors);
      const bQty: Record<string, number> = {};
      colors.forEach(c => {
        bQty[c] = initialBoxCount || 5;
      });
      setBoxCounts(bQty);
    }
  }, [isOpen, product, orderContext, effectiveAssortment, totalPairsPerBox]);

  const getBoxBarcode = (color: string) => {
    if (!product) return `BOX-${color}`;
    const found = product.colorBoxBarcodes?.find(b => b.color === color);
    if (found && found.barcode) return found.barcode;
    return `BOX-${product.code || 'PROD'}-${color.slice(0, 3).toUpperCase()}`;
  };

  const getVariantBarcode = (color: string, size: string) => {
    if (!product) return `BAR-${color}-${size}`;
    const found = product.variantBarcodes?.find(v => v.color === color && v.size === size);
    if (found && found.barcode) return found.barcode;
    return `${product.code || 'PROD'}-${color.slice(0, 3).toUpperCase()}-${size}`;
  };

  // Generate label items to print
  const boxLabelsToPrint = useMemo(() => {
    const labels: Array<{
      color: string;
      barcode: string;
      boxIndex: number;
      totalBoxesForColor: number;
      image: string | null;
    }> = [];

    availableColors.forEach(color => {
      const count = boxCounts[color] || 0;
      const barcode = getBoxBarcode(color);
      const image = getLabelImageForColor(color);

      for (let i = 1; i <= count; i++) {
        labels.push({
          color,
          barcode,
          boxIndex: i,
          totalBoxesForColor: count,
          image
        });
      }
    });

    return labels;
  }, [availableColors, boxCounts, product, showImage, customImage]);

  const variantLabelsToPrint = useMemo(() => {
    const labels: Array<{
      color: string;
      size: string;
      barcode: string;
      ratio: number;
      index: number;
      image: string | null;
    }> = [];

    selectedVariantColors.forEach(color => {
      const img = getLabelImageForColor(color);
      effectiveAssortment.forEach(item => {
        const key = `${color}_${item.size}`;
        const count = variantQuantities[key] || 0;
        const barcode = getVariantBarcode(color, item.size);

        for (let i = 1; i <= count; i++) {
          labels.push({
            color,
            size: item.size,
            barcode,
            ratio: item.quantity,
            index: i,
            image: img
          });
        }
      });
    });

    return labels;
  }, [selectedVariantColors, effectiveAssortment, variantQuantities, product, showImage, customImage]);

  const totalLabelsCount = activeTab === 'box' ? boxLabelsToPrint.length : variantLabelsToPrint.length;

  const generatePrintCss = (wMm: number, hMm: number) => `
    @page { 
      size: ${wMm}mm ${hMm}mm; 
      margin: 0; 
    }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      background: #ffffff !important;
    }
    .print-card { 
      page-break-after: always !important; 
      break-after: page !important; 
      border: 1.5px solid #000000 !important; 
      margin: 0 auto !important; 
      padding: ${hMm <= 35 ? '6px' : hMm <= 60 ? '10px' : '14px'} !important;
      background: #ffffff !important;
      width: ${wMm}mm !important;
      min-height: ${hMm}mm !important;
      max-height: ${hMm}mm !important;
      box-sizing: border-box !important;
      overflow: hidden !important;
      display: flex !important;
      flex-direction: column !important;
      justify-content: space-between !important;
    }
    .label-img-frame {
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      background-color: #ffffff !important;
      border: 1.5px solid #000000 !important;
      border-radius: 6px !important;
      overflow: hidden !important;
      padding: 2px !important;
      box-sizing: border-box !important;
      flex-shrink: 0 !important;
    }
    .label-img-frame img {
      max-width: 100% !important;
      max-height: 100% !important;
      width: 100% !important;
      height: 100% !important;
      object-fit: ${imageFit === 'cover' ? 'cover' : 'contain'} !important;
      object-position: center !important;
      display: block !important;
      margin: auto !important;
    }
  `;

  // DIRECT PRINT HANDLER (Uses isolated iframe with instant fallback)
  const handlePrint = async () => {
    if (totalLabelsCount === 0) return;
    setIsPrinting(true);

    try {
      const printContainer = document.getElementById('barcode-printable-area');
      if (!printContainer) {
        window.print();
        return;
      }

      const { width: currentW, height: currentH } = getEffectiveDimensions();

      await printHtml(printContainer.innerHTML, {
        title: `${product.name} - ${activeTab === 'box' ? 'Koli Barkodları' : 'Asorti Barkodları'} (${totalLabelsCount} Adet)`,
        widthMm: currentW,
        heightMm: currentH,
        css: generatePrintCss(currentW, currentH)
      });
    } catch (err) {
      console.error('Direct print failed, invoking standard print:', err);
      window.print();
    } finally {
      setIsPrinting(false);
    }
  };

  // OPEN IN NEW CLEAN TAB FOR PRINTING
  const handleOpenInNewTab = () => {
    if (totalLabelsCount === 0 || !product) return;
    const printContainer = document.getElementById('barcode-printable-area');
    if (printContainer) {
      const { width: currentW, height: currentH } = getEffectiveDimensions();
      openPrintWindow(
        printContainer.innerHTML, 
        `${product.name} - ${activeTab === 'box' ? 'Koli Barkodları' : 'Asorti / Beden Barkodları'}`,
        {
          widthMm: currentW,
          heightMm: currentH,
          css: generatePrintCss(currentW, currentH)
        }
      );
    }
  };

  if (!isOpen || !product) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Gelişmiş Barkod & Etiket Yazdırma Sistemi"
      size="3xl"
      className="max-w-7xl w-full"
    >
      <div className="space-y-6">
        {/* Hidden File Input for Image Upload */}
        <input 
          ref={fileInputRef}
          type="file" 
          accept="image/*" 
          className="hidden" 
          onChange={handleImageFileChange}
        />

        {/* Top Product Context Banner */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white p-5 rounded-3xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white dark:bg-slate-900 border border-white/20 flex items-center justify-center backdrop-blur-md overflow-hidden shrink-0 shadow-inner relative group p-1">
              {getLabelImageForColor() ? (
                <img src={getLabelImageForColor()!} alt="" className="max-w-full max-h-full object-contain" />
              ) : (
                <Barcode className="w-8 h-8 text-indigo-400" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-black bg-indigo-500 text-white px-2 py-0.5 rounded uppercase tracking-wider">
                  {product.code}
                </span>
                {product.brand && (
                  <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">
                    {product.brand}
                  </span>
                )}
                {product.isFootwear && (
                  <span className="text-[10px] font-bold bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded border border-amber-500/30 uppercase">
                    Ayakkabı & Asorti
                  </span>
                )}
              </div>
              <h3 className="text-xl font-black uppercase tracking-tight text-white mt-1">
                {product.name}
              </h3>
              {orderContext?.orderNumber && (
                <div className="text-[11px] font-semibold text-emerald-400 mt-0.5 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Sipariş No: {orderContext.orderNumber} ({orderContext.customerName || 'Müşteri'})
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Etiket Toplamı</div>
              <div className="text-2xl font-black font-mono text-indigo-400">
                {totalLabelsCount} <span className="text-xs uppercase text-slate-300 font-sans">Etiket</span>
              </div>
            </div>

            {/* Print in New Tab */}
            <button
              onClick={handleOpenInNewTab}
              disabled={totalLabelsCount === 0}
              title="Açılır Yazdırma Penceresinde Aç"
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-3.5 rounded-2xl font-black text-xs uppercase tracking-wider transition-all border border-slate-700 disabled:opacity-40"
            >
              <ExternalLink className="w-4 h-4" />
              <span className="hidden md:inline">Yeni Sekmede</span>
            </button>

            {/* Direct Print Button */}
            <button
              onClick={handlePrint}
              disabled={totalLabelsCount === 0 || isPrinting}
              className="flex items-center gap-2.5 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white px-6 py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-indigo-600/40 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPrinting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Yazdırılıyor...
                </>
              ) : (
                <>
                  <Printer className="w-4 h-4" />
                  Yazdır ({totalLabelsCount})
                </>
              )}
            </button>
          </div>
        </div>

        {/* Mode Selector Tabs */}
        <div className="grid grid-cols-2 p-1.5 bg-slate-100 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
          <button
            type="button"
            onClick={() => {
              setActiveTab('box');
              setLabelSize('100x80');
            }}
            className={cn(
              "flex items-center justify-center gap-2.5 py-3.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all",
              activeTab === 'box'
                ? "bg-white dark:bg-slate-900 text-indigo-600 shadow-md shadow-indigo-900/5 font-extrabold"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-slate-100"
            )}
          >
            <Package className="w-4 h-4" />
            1. Koli Barkodu ({boxLabelsToPrint.length} Koli)
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('variant');
              setLabelSize('60x40');
            }}
            className={cn(
              "flex items-center justify-center gap-2.5 py-3.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all",
              activeTab === 'variant'
                ? "bg-white dark:bg-slate-900 text-indigo-600 shadow-md shadow-indigo-900/5 font-extrabold"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-slate-100"
            )}
          >
            <Tag className="w-4 h-4" />
            2. Asorti / Beden Barkodu ({variantLabelsToPrint.length} Çift)
          </button>
        </div>

        {/* Main Configuration & Preview Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Left Column: Controls & Image Settings (5 Cols) */}
          <div className="lg:col-span-5 space-y-5">
            
            {/* TAB 1: KOLİ BARKODU CONTROLS */}
            {activeTab === 'box' && (
              <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-5">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                      <Package className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
                        Koli Miktarları & Renk Dağılımı
                      </h4>
                      <p className="text-[10px] text-slate-400 font-bold uppercase">
                        Basılacak koli etiketi adetleri
                      </p>
                    </div>
                  </div>
                </div>

                {/* Quick Multiplier */}
                <div className="bg-indigo-50/70 p-4 rounded-2xl border border-indigo-100 space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-indigo-900 flex items-center justify-between">
                    <span>Hızlı Toplu Koli Belirle</span>
                    <span className="text-[9px] font-bold text-indigo-600">Her Renk İçin</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      value={globalBoxInput}
                      onChange={e => {
                        const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                        setGlobalBoxInput(val);
                      }}
                      className="w-24 bg-white dark:bg-slate-900 border border-indigo-200 rounded-xl p-2.5 text-center font-mono font-black text-indigo-700 outline-none text-base shadow-sm"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const updated: Record<string, number> = {};
                        availableColors.forEach(c => { updated[c] = globalBoxInput; });
                        setBoxCounts(updated);
                      }}
                      className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 px-3 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all shadow-sm flex items-center justify-center gap-1.5"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Tüm Renklere Uygula
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {[1, 5, 10, 20, 50, 100].map(cnt => (
                      <button
                        key={cnt}
                        type="button"
                        onClick={() => {
                          setGlobalBoxInput(cnt);
                          const updated: Record<string, number> = {};
                          availableColors.forEach(c => { updated[c] = cnt; });
                          setBoxCounts(updated);
                        }}
                        className="px-2.5 py-1 bg-white dark:bg-slate-900 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-[10px] font-black transition-all"
                      >
                        +{cnt} Koli
                      </button>
                    ))}
                  </div>
                </div>

                {/* Per Color Box Quantities */}
                <div className="space-y-3">
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Renk Bazlı Koli Adetleri
                  </div>
                  <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                    {availableColors.map(color => {
                      const count = boxCounts[color] || 0;
                      const barcode = getBoxBarcode(color);
                      return (
                        <div
                          key={color}
                          className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl hover:border-indigo-300 transition-all"
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full bg-indigo-600"></span>
                              <span className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase">
                                {color}
                              </span>
                            </div>
                            <div className="text-[9px] font-mono font-bold text-slate-400">
                              Barkod: {barcode}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setBoxCounts(prev => ({ ...prev, [color]: Math.max(0, (prev[color] || 0) - 1) }))}
                              className="w-8 h-8 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center font-bold"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <input
                              type="number"
                              min="0"
                              value={count}
                              onChange={e => {
                                const v = Math.max(0, parseInt(e.target.value, 10) || 0);
                                setBoxCounts(prev => ({ ...prev, [color]: v }));
                              }}
                              className="w-14 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-1.5 text-center font-mono font-black text-slate-900 dark:text-slate-100 text-sm outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => setBoxCounts(prev => ({ ...prev, [color]: (prev[color] || 0) + 1 }))}
                              className="w-8 h-8 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center font-bold"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Box Assortment Summary */}
                {product.isFootwear && (
                  <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                      <span>1 Koli İçeriği (Asorti Dağılımı):</span>
                      <span className="font-mono font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                        Toplam {totalPairsPerBox} Çift / Koli
                      </span>
                    </div>
                    <div className="grid grid-cols-5 gap-1.5">
                      {effectiveAssortment.map((a, i) => (
                        <div key={i} className="bg-white dark:bg-slate-900 p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-center">
                          <div className="text-[9px] font-bold text-slate-400">{a.size}</div>
                          <div className="text-xs font-mono font-black text-slate-800 dark:text-slate-200">{a.quantity} Ad.</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: ASORTİ / BEDEN BARKODU CONTROLS */}
            {activeTab === 'variant' && (
              <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-5">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
                        Akıllı Asorti & Beden Dağıtıcısı
                      </h4>
                      <p className="text-[10px] text-slate-400 font-bold uppercase">
                        Koli sayısına göre beden adetlerini otomatik hesaplar
                      </p>
                    </div>
                  </div>
                </div>

                {/* Automatic Multiplier */}
                <div className="bg-gradient-to-br from-indigo-50 via-indigo-50/50 to-purple-50 p-4 rounded-2xl border border-indigo-100 space-y-3 shadow-inner">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-black uppercase tracking-wider text-indigo-950 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-indigo-600" />
                      Koli Sayısına Göre Otomatik Dağıt
                    </label>
                    <span className="text-[9px] font-black text-indigo-600 bg-white dark:bg-slate-900 px-2 py-0.5 rounded-full border border-indigo-200 uppercase">
                      1 Koli = {totalPairsPerBox} Çift
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type="number"
                        min="1"
                        value={assortmentBoxMultiplier}
                        onChange={e => {
                          const val = Math.max(1, parseInt(e.target.value, 10) || 1);
                          setAssortmentBoxMultiplier(val);
                          applyAssortmentMultiplier(val);
                        }}
                        className="w-full bg-white dark:bg-slate-900 border-2 border-indigo-300 focus:border-indigo-600 rounded-2xl p-3 text-center font-mono font-black text-indigo-900 outline-none text-lg shadow-sm"
                        placeholder="Koli adedi..."
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-indigo-400 uppercase pointer-events-none">
                        KOLİ
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => applyAssortmentMultiplier(assortmentBoxMultiplier)}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-wider transition-all shadow-md shadow-indigo-600/30 flex items-center gap-1.5 shrink-0"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Hesapla
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-1 pt-1">
                    <span className="text-[9px] font-bold text-indigo-700 uppercase">Hızlı Koli Seç:</span>
                    <div className="flex gap-1">
                      {[1, 5, 10, 20, 50].map(boxes => (
                        <button
                          key={boxes}
                          type="button"
                          onClick={() => {
                            setAssortmentBoxMultiplier(boxes);
                            applyAssortmentMultiplier(boxes);
                          }}
                          className={cn(
                            "px-2.5 py-1 rounded-lg text-[10px] font-black transition-all border",
                            assortmentBoxMultiplier === boxes
                              ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                              : "bg-white dark:bg-slate-900 text-indigo-700 border-indigo-200 hover:bg-indigo-100"
                          )}
                        >
                          {boxes} Koli ({boxes * totalPairsPerBox} Çift)
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Color Selection Filter */}
                {availableColors.length > 1 && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Yazdırılacak Renkleri Seç
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {availableColors.map(color => {
                        const isSelected = selectedVariantColors.includes(color);
                        return (
                          <button
                            key={color}
                            type="button"
                            onClick={() => {
                              if (isSelected) {
                                if (selectedVariantColors.length > 1) {
                                  setSelectedVariantColors(prev => prev.filter(c => c !== color));
                                }
                              } else {
                                const next = [...selectedVariantColors, color];
                                setSelectedVariantColors(next);
                                applyAssortmentMultiplier(assortmentBoxMultiplier, next);
                              }
                            }}
                            className={cn(
                              "px-3 py-1.5 rounded-xl text-xs font-bold uppercase transition-all flex items-center gap-2 border",
                              isSelected
                                ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                                : "bg-white dark:bg-slate-900 text-slate-600 border-slate-200 dark:border-slate-700 hover:border-slate-300"
                            )}
                          >
                            <span className={cn("w-2 h-2 rounded-full", isSelected ? "bg-indigo-400" : "bg-slate-300")}></span>
                            {color}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Individual Size Quantity List */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <span>Beden Bazında Basılacak Adetler</span>
                    <button
                      type="button"
                      onClick={() => setVariantQuantities({})}
                      className="text-rose-500 hover:text-rose-700 font-bold"
                    >
                      Sıfırla
                    </button>
                  </div>

                  <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                    {selectedVariantColors.map(color => (
                      <div key={color} className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
                        <div className="text-[10px] font-black text-slate-700 dark:text-slate-200 uppercase flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                          Renk: {color}
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {effectiveAssortment.map(item => {
                            const key = `${color}_${item.size}`;
                            const qty = variantQuantities[key] || 0;
                            const barcode = getVariantBarcode(color, item.size);

                            return (
                              <div
                                key={item.size}
                                className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1 hover:border-indigo-300 transition-all shadow-xs"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-black text-slate-900 dark:text-slate-100">
                                    No: {item.size}
                                  </span>
                                  <span className="text-[9px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-1 rounded">
                                    oran: {item.quantity}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    min="0"
                                    value={qty}
                                    onChange={e => {
                                      const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                                      setVariantQuantities(prev => ({ ...prev, [key]: val }));
                                    }}
                                    className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-1 text-center font-mono font-black text-indigo-600 text-xs outline-none"
                                  />
                                </div>
                                <div className="text-[8px] font-mono text-slate-400 truncate" title={barcode}>
                                  {barcode}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* BARKOD RESİM SEÇENEKLERİ (IMAGE SETTINGS PANEL) */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-pink-50 text-pink-600 rounded-xl">
                    <ImageIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
                      Barkod Resim Seçenekleri
                    </h4>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">
                      Etiketlere ürün veya logo görseli ekleyin
                    </p>
                  </div>
                </div>

                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showImage}
                    onChange={e => setShowImage(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white dark:bg-slate-900 after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              {showImage && (
                <div className="space-y-3 pt-1">
                  {/* Current Active Image Thumbnail & Actions */}
                  <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700">
                    <div className="w-14 h-14 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 overflow-hidden flex items-center justify-center shrink-0 shadow-xs p-1">
                      {getLabelImageForColor() ? (
                        <img 
                          src={getLabelImageForColor()!} 
                          alt="Barkod Görseli" 
                          className={cn(
                            "max-w-full max-h-full",
                            imageFit === 'cover' ? "w-full h-full object-cover" : "w-auto h-auto object-contain"
                          )}
                        />
                      ) : (
                        <ImageIcon className="w-6 h-6 text-slate-300" />
                      )}
                    </div>

                    <div className="flex-1 space-y-1">
                      <div className="text-[10px] font-black uppercase text-slate-700 dark:text-slate-200">
                        {customImage ? 'Özel Yüklenen Görsel' : product.image ? 'Ürün Ana Görseli' : 'Görsel Bulunamadı'}
                      </div>
                      <p className="text-[9px] text-slate-400">
                        {customImage ? 'Bu baskı grubu için özel ayarlandı.' : 'Kayıtlı ürün veya renk resmi basılacaktır.'}
                      </p>
                      
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="flex items-center gap-1 px-2.5 py-1 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:bg-slate-800 border border-slate-300 rounded-lg text-[9px] font-black uppercase text-slate-700 dark:text-slate-200 transition-all shadow-xs"
                        >
                          <Upload className="w-3 h-3 text-indigo-600" />
                          {getLabelImageForColor() ? 'Değiştir / Yükle' : 'Resim Yükle'}
                        </button>
                        
                        {customImage && (
                          <button
                            type="button"
                            onClick={() => setCustomImage(null)}
                            className="flex items-center gap-1 px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg text-[9px] font-bold transition-all"
                            title="Özel resmi kaldır, orijinaline dön"
                          >
                            <Trash2 className="w-3 h-3" />
                            Sıfırla
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Image fit & size selection */}
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-600">
                      <span>Çerçeveye Uyum:</span>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => setImageFit('contain')}
                          className={cn(
                            "px-2.5 py-1 rounded-lg text-[9px] font-black uppercase transition-all border",
                            imageFit === 'contain'
                              ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                              : "bg-white dark:bg-slate-900 text-slate-600 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:bg-slate-800/50"
                          )}
                          title="Görselin tamamı çerçeve içine sığdırılır, kesilmez"
                        >
                          Sığdır (Tam)
                        </button>
                        <button
                          type="button"
                          onClick={() => setImageFit('cover')}
                          className={cn(
                            "px-2.5 py-1 rounded-lg text-[9px] font-black uppercase transition-all border",
                            imageFit === 'cover'
                              ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                              : "bg-white dark:bg-slate-900 text-slate-600 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:bg-slate-800/50"
                          )}
                          title="Çerçeveyi tam dolduracak şekilde ayarlar"
                        >
                          Doldur
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-600">
                      <span>Etiket Görsel Boyutu:</span>
                      <div className="flex gap-1.5">
                        {[
                          { id: 'sm', label: 'Küçük' },
                          { id: 'md', label: 'Standart' },
                          { id: 'lg', label: 'Geniş' },
                        ].map(sz => (
                          <button
                            key={sz.id}
                            type="button"
                            onClick={() => setImageSize(sz.id as any)}
                            className={cn(
                              "px-2.5 py-1 rounded-lg text-[9px] font-black uppercase transition-all border",
                              imageSize === sz.id
                                ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                                : "bg-white dark:bg-slate-900 text-slate-600 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:bg-slate-800/50"
                            )}
                          >
                            {sz.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Label Print Options Card */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                  <Settings2 className="w-3.5 h-3.5" />
                  Etiket Ölçüleri & Şablon
                </div>
                <span className="text-[10px] font-black text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-lg">
                  {getEffectiveDimensions().width} × {getEffectiveDimensions().height} mm
                </span>
              </div>

              {/* DB Registered Template Selector */}
              {dbBarcodeTemplates.length > 0 && (
                <div className="p-3 bg-indigo-50/60 dark:bg-indigo-950/40 rounded-2xl border border-indigo-100 dark:border-indigo-900/60 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black uppercase tracking-wider text-indigo-900 dark:text-indigo-200 flex items-center gap-1">
                      <Sliders className="w-3 h-3 text-indigo-600" />
                      Kayıtlı Termal Şablonu Yükle:
                    </label>
                  </div>
                  <select
                    value={selectedDbTemplateId}
                    onChange={e => handleApplyDbTemplate(e.target.value ? Number(e.target.value) : '')}
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">-- Özel / Manuel Seçim --</option>
                    {dbBarcodeTemplates.map(tmpl => (
                      <option key={tmpl.id} value={tmpl.id}>
                        {tmpl.name} ({tmpl.widthMm}x{tmpl.heightMm} mm - {tmpl.type === 'shipping' ? 'Lojistik Koli' : tmpl.type === 'shoe_box' ? 'Tekil Kutu' : 'Koli'})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Preset buttons */}
              <div className="space-y-1.5">
                <div className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase">Hazır Ölçü Şablonları</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: '100x150', label: '100×150 mm', desc: '📦 Lojistik Koli' },
                    { id: '100x80', label: '100×80 mm', desc: '🏷️ Standart Koli' },
                    { id: '80x60', label: '80×60 mm', desc: '🗄️ Kompakt Koli' },
                    { id: '60x40', label: '60×40 mm', desc: '👟 Tekil Kutu' },
                    { id: '50x30', label: '50×30 mm', desc: '🔖 Fiyat / Tekil' },
                    { id: '40x25', label: '40×25 mm', desc: '🔍 Mini Etiket' },
                  ].map(size => (
                    <button
                      key={size.id}
                      type="button"
                      onClick={() => handleSelectPresetSize(size.id as any)}
                      className={cn(
                        "p-2 rounded-xl text-center border transition-all cursor-pointer",
                        labelSize === size.id
                          ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                          : "bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:bg-slate-800"
                      )}
                    >
                      <div className="text-[10px] font-black">{size.label}</div>
                      <div className="text-[8px] opacity-80 truncate">{size.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Manual mm Inputs */}
              <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2.5">
                <div className="flex items-center justify-between text-[10px] font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider">
                  <span>Elle Ölçü Gir (Manuel mm)</span>
                  {labelSize === 'custom' && (
                    <span className="text-[8px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-md">
                      Özel Ölçü Aktif
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {/* Width Input */}
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase">Genişlik (mm)</label>
                    <div className="flex items-center gap-1 bg-white dark:bg-slate-900 rounded-xl border border-slate-300 p-1">
                      <button
                        type="button"
                        onClick={() => handleCustomWidthChange(Math.max(20, customWidthMm - 5))}
                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 font-bold text-xs"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min={20}
                        max={300}
                        value={customWidthMm}
                        onChange={e => handleCustomWidthChange(Number(e.target.value))}
                        className="w-full text-center text-xs font-black text-slate-900 dark:text-slate-100 focus:outline-hidden"
                      />
                      <button
                        type="button"
                        onClick={() => handleCustomWidthChange(Math.min(300, customWidthMm + 5))}
                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 font-bold text-xs"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Height Input */}
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase">Yükseklik (mm)</label>
                    <div className="flex items-center gap-1 bg-white dark:bg-slate-900 rounded-xl border border-slate-300 p-1">
                      <button
                        type="button"
                        onClick={() => handleCustomHeightChange(Math.max(15, customHeightMm - 5))}
                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 font-bold text-xs"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min={15}
                        max={300}
                        value={customHeightMm}
                        onChange={e => handleCustomHeightChange(Number(e.target.value))}
                        className="w-full text-center text-xs font-black text-slate-900 dark:text-slate-100 focus:outline-hidden"
                      />
                      <button
                        type="button"
                        onClick={() => handleCustomHeightChange(Math.min(300, customHeightMm + 5))}
                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 font-bold text-xs"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <label className="flex items-center gap-2 p-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 cursor-pointer text-[10px] font-bold text-slate-700 dark:text-slate-200 hover:border-slate-300">
                  <input
                    type="checkbox"
                    checked={showPrice}
                    onChange={e => setShowPrice(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600"
                  />
                  <span>Fiyat Göster</span>
                </label>

                <label className="flex items-center gap-2 p-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 cursor-pointer text-[10px] font-bold text-slate-700 dark:text-slate-200 hover:border-slate-300">
                  <input
                    type="checkbox"
                    checked={showBoxSerial}
                    onChange={e => setShowBoxSerial(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600"
                  />
                  <span>Koli No / Sıra</span>
                </label>
              </div>
            </div>

          </div>

          {/* Right Column: Live Printable Preview (7 Cols) */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  Canlı Etiket Önizleme ({getEffectiveDimensions().width} × {getEffectiveDimensions().height} mm)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full uppercase">
                  {activeTab === 'box' ? 'Koli Etiketi Modu' : 'Asorti / Beden Etiketi Modu'} ({totalLabelsCount} Adet)
                </span>
              </div>
            </div>

            {/* Scrollable Preview Area */}
            <div className="bg-slate-100 dark:bg-slate-800/80 p-5 rounded-3xl border border-slate-200 dark:border-slate-700 min-h-[480px] max-h-[620px] overflow-y-auto space-y-4 shadow-inner">
              
              {/* PRINTABLE CONTAINER */}
              <div id="barcode-printable-area" className="space-y-4">
                
                {/* 1. BOX LABELS PREVIEW */}
                {activeTab === 'box' && (
                  boxLabelsToPrint.length === 0 ? (
                    <div className="py-24 text-center space-y-2 text-slate-400">
                      <Package className="w-12 h-12 mx-auto opacity-30 text-indigo-400" />
                      <p className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                        Yazdırılacak koli miktarı girilmedi
                      </p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase">
                        Sol taraftan koli adedi belirleyerek başlayın
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4">
                      {boxLabelsToPrint.map((label, idx) => (
                        <div
                          key={`box-${idx}`}
                          className="print-card bg-white dark:bg-slate-900 border-2 border-slate-300 rounded-2xl p-5 shadow-sm space-y-4 text-black print:border-none print:shadow-none print:m-0 print:p-6 print:page-break-after-always"
                          style={{
                            minHeight: `${Math.max(180, getEffectiveDimensions().height * 3.2)}px`
                          }}
                        >
                          {/* Label Header with Optional Model Photo */}
                          <div className="flex items-start justify-between border-b-2 border-black pb-2.5 gap-3">
                            <div className="flex items-center gap-3">
                              {label.image && (
                                <div 
                                  className="label-img-frame rounded-xl border-2 border-black overflow-hidden bg-white dark:bg-slate-900 shrink-0 shadow-2xs flex items-center justify-center p-1"
                                  style={{
                                    width: imageSize === 'sm' ? '52px' : imageSize === 'lg' ? '92px' : '72px',
                                    height: imageSize === 'sm' ? '52px' : imageSize === 'lg' ? '92px' : '72px',
                                    minWidth: imageSize === 'sm' ? '52px' : imageSize === 'lg' ? '92px' : '72px',
                                    minHeight: imageSize === 'sm' ? '52px' : imageSize === 'lg' ? '92px' : '72px',
                                    maxWidth: imageSize === 'sm' ? '52px' : imageSize === 'lg' ? '92px' : '72px',
                                    maxHeight: imageSize === 'sm' ? '52px' : imageSize === 'lg' ? '92px' : '72px',
                                    boxSizing: 'border-box'
                                  }}
                                >
                                  <img 
                                    src={label.image} 
                                    alt="Ürün Görseli" 
                                    style={{
                                      width: '100%',
                                      height: '100%',
                                      maxWidth: '100%',
                                      maxHeight: '100%',
                                      objectFit: imageFit,
                                      objectPosition: 'center',
                                      display: 'block',
                                      margin: 'auto'
                                    }}
                                  />
                                </div>
                              )}
                              <div>
                                <div className="text-[10px] font-black tracking-widest text-slate-600 uppercase">
                                  {companyHeader}
                                </div>
                                <h2 className="text-base font-black uppercase tracking-tight text-black">
                                  {product.name}
                                </h2>
                                {product.brand && (
                                  <div className="text-[9px] font-bold uppercase text-slate-600">
                                    {product.brand}
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <div className="text-xs font-mono font-black bg-black text-white px-2.5 py-1 rounded uppercase">
                                {product.code}
                              </div>
                              {showPrice && product.sellingPrice > 0 && (
                                <div className="text-xs font-black font-mono text-black mt-1">
                                  ₺{product.sellingPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Color and Box Numbers */}
                          <div className="flex items-center justify-between bg-slate-100 dark:bg-slate-800 print:bg-slate-200/50 p-2.5 rounded-xl font-bold">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] uppercase text-slate-500 dark:text-slate-400">RENK:</span>
                              <span className="text-sm font-black uppercase text-black">{label.color}</span>
                            </div>
                            {showBoxSerial && (
                              <div className="text-xs font-mono font-black text-black">
                                KOLİ: {label.boxIndex} / {label.totalBoxesForColor}
                              </div>
                            )}
                          </div>

                          {/* Assortment Table */}
                          {product.isFootwear && (
                            <div className="space-y-1">
                              <div className="text-[9px] font-black uppercase tracking-widest text-slate-600 flex justify-between">
                                <span>KOLİ İÇİ ASORTİ DAĞILIMI</span>
                                <span className="font-mono">{totalPairsPerBox} ÇİFT / KOLİ</span>
                              </div>
                              <div className="border border-black rounded-lg overflow-hidden grid grid-flow-col auto-cols-fr text-center divide-x divide-black">
                                {effectiveAssortment.map((a, i) => (
                                  <div key={i} className="flex flex-col">
                                    <div className="bg-slate-200 print:bg-slate-300 font-bold text-[10px] py-1 border-b border-black">
                                      {a.size}
                                    </div>
                                    <div className="font-mono font-black text-xs py-1.5 bg-white dark:bg-slate-900">
                                      {a.quantity}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Barcode SVG */}
                          <div className="pt-2 flex flex-col items-center justify-center border-t border-slate-200 dark:border-slate-700">
                            <BarcodeSvg
                              value={label.barcode}
                              height={getEffectiveDimensions().height <= 45 ? 36 : 52}
                              showText={true}
                              className="w-full max-w-[280px]"
                            />
                          </div>

                          {/* Footer Info */}
                          {showOrderInfo && orderContext?.orderNumber && (
                            <div className="text-[9px] font-bold text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-700 pt-1 flex justify-between uppercase">
                              <span>Sipariş: {orderContext.orderNumber}</span>
                              <span>{orderContext.customerName}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )
                )}

                {/* 2. VARIANT / SIZE LABELS PREVIEW */}
                {activeTab === 'variant' && (
                  variantLabelsToPrint.length === 0 ? (
                    <div className="py-24 text-center space-y-2 text-slate-400">
                      <Tag className="w-12 h-12 mx-auto opacity-30 text-indigo-400" />
                      <p className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                        Yazdırılacak beden etiketi seçilmedi
                      </p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase">
                        Sol taraftan koli miktarı girerek veya beden adetleri belirleyerek başlayın
                      </p>
                    </div>
                  ) : (
                    <div className={cn(
                      "grid gap-3",
                      getEffectiveDimensions().height <= 40 ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-2"
                    )}>
                      {variantLabelsToPrint.map((label, idx) => (
                        <div
                          key={`var-${idx}`}
                          className="print-card bg-white dark:bg-slate-900 border-2 border-slate-300 rounded-2xl p-4 shadow-sm space-y-2 text-black print:border-none print:shadow-none print:m-0 print:p-4 print:page-break-after-always flex flex-col justify-between"
                          style={{
                            minHeight: `${Math.max(130, getEffectiveDimensions().height * 3.0)}px`
                          }}
                        >
                          {/* Top Row: Brand, Code & Optional Thumbnail */}
                          <div className="flex items-start justify-between border-b border-black pb-1.5 gap-2">
                            <div className="flex items-center gap-2">
                              {label.image && (
                                <div 
                                  className="label-img-frame rounded-lg border border-black overflow-hidden bg-white dark:bg-slate-900 shrink-0 p-0.5 flex items-center justify-center shadow-2xs"
                                  style={{
                                    width: '44px',
                                    height: '44px',
                                    minWidth: '44px',
                                    minHeight: '44px',
                                    maxWidth: '44px',
                                    maxHeight: '44px',
                                    boxSizing: 'border-box'
                                  }}
                                >
                                  <img 
                                    src={label.image} 
                                    alt="Ürün Görseli" 
                                    style={{
                                      width: '100%',
                                      height: '100%',
                                      maxWidth: '100%',
                                      maxHeight: '100%',
                                      objectFit: imageFit,
                                      objectPosition: 'center',
                                      display: 'block',
                                      margin: 'auto'
                                    }}
                                  />
                                </div>
                              )}
                              <div>
                                <div className="text-[9px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">
                                  {product.brand || companyHeader}
                                </div>
                                <div className="text-xs font-black uppercase text-black line-clamp-1">
                                  {product.name}
                                </div>
                              </div>
                            </div>

                            <span className="text-[9px] font-mono font-black uppercase bg-black text-white px-1.5 py-0.5 rounded shrink-0">
                              {product.code}
                            </span>
                          </div>

                          {/* Middle Highlight: SIZE & COLOR */}
                          <div className="flex items-center justify-between bg-slate-100 dark:bg-slate-800 print:bg-slate-200/50 p-2 rounded-xl">
                            <div className="text-[10px] font-bold uppercase text-slate-600">
                              RENK: <span className="font-black text-black">{label.color}</span>
                            </div>
                            <div className="text-right flex items-center">
                              <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase mr-1.5">BEDEN:</span>
                              <span className="text-lg font-black font-mono text-black bg-white dark:bg-slate-900 px-2.5 py-0.5 rounded-lg border border-slate-400 shadow-2xs">
                                {label.size}
                              </span>
                            </div>
                          </div>

                          {/* Price if enabled */}
                          {showPrice && product.sellingPrice > 0 && (
                            <div className="text-right text-[11px] font-mono font-black text-black">
                              FİYAT: ₺{product.sellingPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                            </div>
                          )}

                          {/* Barcode */}
                          <div className="pt-1 flex flex-col items-center justify-center">
                            <BarcodeSvg
                              value={label.barcode}
                              height={getEffectiveDimensions().height <= 35 ? 28 : 38}
                              showText={true}
                              className="w-full max-w-[220px]"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                )}

              </div>
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center justify-between pt-2">
              <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                Seçilen Mod: <span className="font-black text-slate-900 dark:text-slate-100 uppercase">{activeTab === 'box' ? 'Koli Barkodu' : 'Asorti / Beden Barkodu'}</span> ({totalLabelsCount} Etiket)
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all"
                >
                  Kapat
                </button>
                
                <button
                  type="button"
                  onClick={handleOpenInNewTab}
                  disabled={totalLabelsCount === 0}
                  className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all disabled:opacity-40"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Yeni Sekmede Aç
                </button>

                <button
                  type="button"
                  onClick={handlePrint}
                  disabled={totalLabelsCount === 0 || isPrinting}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-7 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-md shadow-indigo-600/30 disabled:opacity-50"
                >
                  {isPrinting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Printer className="w-4 h-4" />
                  )}
                  Yazdır ({totalLabelsCount})
                </button>
              </div>
            </div>

          </div>

        </div>
      </div>
    </Modal>
  );
};

export default BarcodePrintModal;
