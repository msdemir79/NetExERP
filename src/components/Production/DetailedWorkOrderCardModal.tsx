import React from 'react';
import { 
  Printer, 
  Download, 
  Edit3, 
  Check, 
  X, 
  ExternalLink, 
  Image as ImageIcon,
  Sparkles,
  Info,
  Calendar,
  Layers,
  Hash,
  Loader2,
  FileText
} from 'lucide-react';
import Modal from '../Modal';
import { BarcodeSvg } from '../BarcodeSvg';
import type { WorkOrder, Product, Recipe, RecipeIngredient, Contact } from '../../types';
import { cn } from '../../lib/utils';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas-pro';
import { printHtml, openPrintWindow } from '../../lib/printService';
import { sanitizeCssColor } from '../../lib/pdfService';

interface DetailedWorkOrderCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  workOrder: WorkOrder | null;
  product?: Product;
  recipe?: Recipe;
  allProducts?: Product[];
  customer?: Contact;
  onSaveWorkOrder?: (updated: Partial<WorkOrder>) => void;
}

// Shoe factory standard departments for ordering
const DEPARTMENT_ORDER = [
  'KESİM',
  'BASKI',
  'SAYA',
  'BAĞCIK',
  'MONTA',
  'TEMİZLEME',
  'DİĞER'
];

export default function DetailedWorkOrderCardModal({
  isOpen,
  onClose,
  workOrder,
  product,
  recipe,
  allProducts = [],
  customer,
  onSaveWorkOrder
}: DetailedWorkOrderCardModalProps) {
  // Quick edit mode state
  const [isEditing, setIsEditing] = React.useState(false);
  
  // Customizable Form State
  const [moldCode, setMoldCode] = React.useState('');
  const [moldGroup, setMoldGroup] = React.useState('');
  const [documentNo, setDocumentNo] = React.useState('');
  const [customerName, setCustomerName] = React.useState('');
  const [customerCode, setCustomerCode] = React.useState('');
  const [orderNumber, setOrderNumber] = React.useState('');
  const [orderDateStr, setOrderDateStr] = React.useState('');
  const [colorName, setColorName] = React.useState('');
  const [customSizes, setCustomSizes] = React.useState<{ size: string; quantity: number }[]>([]);

  // Sync state whenever workOrder or product changes
  React.useEffect(() => {
    if (workOrder && isOpen) {
      setMoldCode(workOrder.moldCode || product?.moldCode || '018');
      setMoldGroup(workOrder.moldGroup || product?.moldGroup || 'PTK _ PATİK (26-30)');
      setDocumentNo(workOrder.documentNo || product?.documentNo || 'KİŞ 74');
      setCustomerName(workOrder.customerName || customer?.name || 'BESTOF AYAKKABI');
      setCustomerCode(workOrder.customerCode || customer?.code || 'MUS-0021');
      setOrderNumber(workOrder.orderNumber || '2423');
      
      const oDate = workOrder.orderDate ? new Date(workOrder.orderDate) : new Date();
      setOrderDateStr(oDate.toLocaleDateString('tr-TR'));
      
      setColorName(workOrder.color || (product?.colors && product.colors[0]) || 'SİYAH/BEYAZ');
      
      if (workOrder.assortmentBreakdown && workOrder.assortmentBreakdown.length > 0) {
        setCustomSizes(workOrder.assortmentBreakdown);
      } else if (product?.assortment && product.assortment.length > 0) {
        const total = product.assortment.reduce((s, a) => s + (Number(a.quantity) || 0), 0);
        const ratio = total > 0 ? workOrder.quantity / total : 1;
        setCustomSizes(product.assortment.map(a => ({
          size: a.size,
          quantity: Math.round((Number(a.quantity) || 0) * ratio)
        })));
      } else if (product?.variantBarcodes && product.variantBarcodes.length > 0) {
        const uniqueSizes = Array.from(new Set(product.variantBarcodes.map(v => String(v.size)).filter(Boolean)));
        uniqueSizes.sort((a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0));
        const totalQty = workOrder.quantity || 800;
        const count = uniqueSizes.length || 5;
        let weights = count === 5 ? [1, 2, 2, 2, 1] : new Array(count).fill(1);
        const totalW = weights.reduce((s, w) => s + w, 0);
        let alloc = 0;
        const dist = uniqueSizes.map((sz, i) => {
          const q = Math.round(totalQty * (weights[i] / totalW));
          alloc += q;
          return { size: sz, quantity: q };
        });
        const diff = totalQty - alloc;
        if (diff !== 0 && dist.length > 0) dist[Math.floor(dist.length / 2)].quantity += diff;
        setCustomSizes(dist);
      } else {
        // Standard 40-44 men footwear sample sizes
        const totalQty = workOrder.quantity || 800;
        const p40 = Math.round(totalQty * (1 / 8));
        const p41 = Math.round(totalQty * (2 / 8));
        const p42 = Math.round(totalQty * (2 / 8));
        const p43 = Math.round(totalQty * (2 / 8));
        const p44 = totalQty - (p40 + p41 + p42 + p43);
        setCustomSizes([
          { size: '40', quantity: p40 },
          { size: '41', quantity: p41 },
          { size: '42', quantity: p42 },
          { size: '43', quantity: p43 },
          { size: '44', quantity: p44 },
        ]);
      }
    }
  }, [workOrder, product, customer, isOpen]);

  // Product map helper
  const productMap = React.useMemo(() => {
    return new Map(allProducts.map(p => [p.id!, p]));
  }, [allProducts]);

  // If no recipe ingredients are defined, provide standard footwear industrial template ingredients
  const recipeItems = React.useMemo(() => {
    if (recipe && recipe.ingredients && recipe.ingredients.length > 0) {
      return recipe.ingredients;
    }

    // Default template matching user photo exactly for sample demonstration
    return [
      // KESİM
      { department: 'KESİM', rawName: 'SUMİ', partName: 'ÇEMBER', color: 'SİYAH', quantity: 0.0285625, unit: 'METR' },
      { department: 'KESİM', rawName: 'SUMİ', partName: 'NAL', color: 'SİYAH', quantity: 0.0027968, unit: 'METR' },
      { department: 'KESİM', rawName: 'CİLT PU', partName: 'GAMBA', color: 'SİYAH', quantity: 0.035703, unit: 'METR' },
      { department: 'KESİM', rawName: 'CİLT PU', partName: 'CIRT', color: 'SİYAH', quantity: 0.008906, unit: 'METR' },
      { department: 'KESİM', rawName: 'CİLT PU', partName: 'KUŞ', color: 'SAKS', quantity: 0.0055, unit: 'METR' },
      { department: 'KESİM', rawName: 'SUMİ', partName: 'FORT', color: 'SİYAH', quantity: 0.015875, unit: 'METR' },
      { department: 'KESİM', rawName: 'CİLT PU', partName: 'YÜZ', color: 'SİYAH', quantity: 0.011093, unit: 'METR' },
      { department: 'KESİM', rawName: 'JUMP ANORAK', partName: 'DİL', color: 'SİYAH', quantity: 0.019203, unit: 'METR' },
      { department: 'KESİM', rawName: 'JUMP ANORAK', partName: 'KONÇ', color: 'SİYAH', quantity: 0.014906, unit: 'METR' },
      { department: 'KESİM', rawName: 'JUMP LAKOST(165 GR) +3,23 MM', partName: 'GAMBA ASTAR', color: 'SİYAH', quantity: 0.037, unit: 'METR' },
      { department: 'KESİM', rawName: 'JUMP LAKOST(165 GR) +3,23 MM', partName: 'DİL ASTAR', color: 'SAKS', quantity: 0.019203, unit: 'METR' },
      { department: 'KESİM', rawName: 'SATEN +2 MM PU(50 DN)+70 GR', partName: 'VİZO', color: 'SİYAH', quantity: 0.0714, unit: 'METR' },
      { department: 'KESİM', rawName: 'TAKVİYE PVC', partName: 'GAMBA TAKVİYE', color: 'SİYAH', quantity: 0.035703, unit: 'METR' },
      { department: 'KESİM', rawName: '1.5 CM 26D 120*240 SÜNGER', partName: 'KONÇ SÜNGER', color: '-', quantity: 0.005156, unit: 'PLAK' },
      { department: 'KESİM', rawName: '0.8 CM 14D 120*240 SÜNGER', partName: 'DİL SÜNGER', color: '-', quantity: 0.006203, unit: 'PLAK' },
      { department: 'KESİM', rawName: '1.2 LİK KEMİK', partName: 'FORT', color: '-', quantity: 0.011203, unit: 'PLAK' },
      { department: 'KESİM', rawName: '0.8 KALIN PİNPON', partName: 'BOMBE', color: '-', quantity: 0.011593, unit: 'PLAK' },
      { department: 'KESİM', rawName: 'JÜT', partName: 'JÜT', color: 'BEYAZ', quantity: 0.023203, unit: 'METR' },
      
      // BASKI
      { department: 'BASKI', rawName: '74 ÇOCUK MODELİ FORT BASKI', partName: 'FORT BASKI', color: 'BEYAZ', quantity: 2, unit: 'ADET' },
      { department: 'BASKI', rawName: '74 ÇOCUK MODELİ GAMBA BASKI', partName: 'GAMBA BASKI', color: 'BEYAZ', quantity: 4, unit: 'ADET' },
      { department: 'BASKI', rawName: '74 ÇOCUK MODELİ KUŞ BASKI', partName: 'KUŞ BASKISI', color: 'BEYAZ', quantity: 2, unit: 'ADET' },
      { department: 'BASKI', rawName: 'ÇOCUK MODEL CIRT BASKI', partName: 'CIRT BASKISI', color: '1.RENK:BYZ/2.RENK:SAKS/YAZI:SİYAH', quantity: 2, unit: 'ADET' },
      
      // SAYA
      { department: 'SAYA', rawName: 'BEST OF PATİK DİL ALTI ETİKET', partName: 'DİL ALTI ETİKET', color: 'SUNİ:TEKSTİL/TEKSTİL/SUNİ', quantity: 1, unit: 'ÇİFT' },
      { department: 'SAYA', rawName: '2 NOLU BOYALI SAC KAPSÜL', partName: 'KAPSÜL', color: 'SİYAH', quantity: 12, unit: 'ADET' },
      { department: 'SAYA', rawName: 'CIRT DİŞİ 2 CM (GENİŞLİK 12 CM)', partName: 'CIRT', color: 'SİYAH', quantity: 0.18, unit: 'METR' },
      { department: 'SAYA', rawName: 'CIRT ERKEK 2 CM (GENİŞLİK 12 CM)', partName: 'CIRT', color: 'SİYAH', quantity: 0.20, unit: 'METR' },
      { department: 'SAYA', rawName: 'D TOKA', partName: 'CIRT TOKA', color: 'NİKEL', quantity: 2, unit: 'ADET' },
      { department: 'SAYA', rawName: 'ÇOCUK BESTOF KİDS FUSPET', partName: 'MOSTRA ETİKETİ', color: 'SARI/TURUNCU/MAVİ/KIRMIZI', quantity: 1, unit: 'ÇİFT' },
      
      // BAĞCIK
      { department: 'BAĞCIK', rawName: '6 MM LASTİK', partName: 'BAĞCIK', color: 'SİYAH', quantity: 0.60, unit: 'METR' },
      
      // MONTA
      { department: 'MONTA', rawName: 'LJK 967 PATİK TABAN (3GEN)', partName: 'TABAN', color: 'BEYAZ', quantity: 1, unit: 'ÇİFT' },
      { department: 'MONTA', rawName: 'MEMORY FOAM PATİK', partName: 'FUSPET', color: 'GRİ', quantity: 1, unit: 'ÇİFT' },
      
      // TEMİZLEME
      { department: 'TEMİZLEME', rawName: 'BESTOF PATİK 8 Lİ KOLİ', partName: 'KOLİ', color: '-', quantity: 0.125, unit: 'ADET' },
      { department: 'TEMİZLEME', rawName: 'BESTOF PATİK KUTU', partName: 'KUTU', color: '-', quantity: 1, unit: 'ADET' },
      { department: 'TEMİZLEME', rawName: 'İÇ KAĞIT BASKISIZ', partName: 'İÇ KAĞIT', color: '-', quantity: 2, unit: 'ADET' },
      { department: 'TEMİZLEME', rawName: 'BESTOF BASKILI PELUR', partName: 'PELUR', color: 'BASKI:SİYAH', quantity: 1, unit: 'ADET' },
      { department: 'TEMİZLEME', rawName: 'METAL ZİNCİR (TANITIM KART İÇİN)', partName: 'ZİNCİR', color: 'GÜMÜŞ', quantity: 1, unit: 'ADET' },
      { department: 'TEMİZLEME', rawName: 'BESTOF TANITIM KARTI', partName: 'TANITIM KARTI', color: '-', quantity: 1, unit: 'ADET' },
    ];
  }, [recipe]);

  // Group items by Department
  const groupedDepartments = React.useMemo(() => {
    const totalProductionPairs = workOrder?.quantity || 640;
    const groups: { [key: string]: any[] } = {};

    recipeItems.forEach((ing: any) => {
      let dept = ing.department?.toUpperCase() || '';
      const prod = ing.productId ? productMap.get(ing.productId) : null;
      const rawName = ing.rawName || prod?.name || prod?.code || 'Hammadde';

      // Smart infer department if missing
      if (!dept) {
        const sub = (prod?.subType || '').toLowerCase();
        const n = rawName.toLowerCase();
        if (sub.includes('taban') || sub.includes('fuspet') || n.includes('taban') || n.includes('fuspet')) {
          dept = 'MONTA';
        } else if (sub.includes('kutu') || sub.includes('koli') || n.includes('kutu') || n.includes('koli') || n.includes('pelur') || n.includes('kart')) {
          dept = 'TEMİZLEME';
        } else if (sub.includes('bağcık') || sub.includes('lastik') || n.includes('bağcık') || n.includes('lastik')) {
          dept = 'BAĞCIK';
        } else if (sub.includes('baskı') || n.includes('baskı') || n.includes('nakış') || n.includes('lazer')) {
          dept = 'BASKI';
        } else if (sub.includes('saya') || sub.includes('kapsül') || sub.includes('cırt') || sub.includes('toka') || sub.includes('mostra') || n.includes('kapsül') || n.includes('cırt')) {
          dept = 'SAYA';
        } else if (sub.includes('deri') || sub.includes('pu') || sub.includes('astar') || sub.includes('sünger') || sub.includes('kemik') || sub.includes('bombe') || sub.includes('jüt') || n.includes('pu') || n.includes('deri')) {
          dept = 'KESİM';
        } else {
          dept = 'DİĞER';
        }
      }

      if (!groups[dept]) {
        groups[dept] = [];
      }

      // Total quantity for the work order batch
      const unitPerPair = Number(ing.quantity) || 0;
      const batchQty = unitPerPair * totalProductionPairs;

      // Smart part name / explanation
      let partName = ing.partName || ing.notes || '';
      if (!partName) {
        partName = prod?.subType || prod?.name || '-';
      }

      groups[dept].push({
        rawName,
        rawCode: prod?.code,
        partName,
        color: ing.color || (ing.color === '-' ? '-' : (colorName || '-')),
        unitPerPair,
        batchQty,
        unit: ing.unit || prod?.unit || 'ADET'
      });
    });

    // Sort departments in logical shoemaking order
    const sortedDepts = Object.keys(groups).sort((a, b) => {
      const idxA = DEPARTMENT_ORDER.indexOf(a);
      const idxB = DEPARTMENT_ORDER.indexOf(b);
      return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
    });

    return sortedDepts.map(d => ({
      name: d,
      items: groups[d]
    }));
  }, [recipeItems, workOrder?.quantity, productMap, colorName]);

  // PDF Generation & Print States
  const [isGeneratingPdf, setIsGeneratingPdf] = React.useState(false);
  const [isPrinting, setIsPrinting] = React.useState(false);
  const [printNotice, setPrintNotice] = React.useState<{ message: string; blobUrl?: string } | null>(null);

  // Format numbers nicely with Turkish locale (e.g. 18,28 or 1.280,00)
  const formatQty = (qty: number, unit: string) => {
    if (unit === 'ADET' || unit === 'ÇİFT' || unit === 'Adet' || unit === 'Çift') {
      if (qty >= 10) {
        return qty.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }
      return qty.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    }
    // For meters, plates, kg: format with 2 decimals
    return qty.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Direct High Quality PDF Generation & Download (.pdf file)
  const handleDownloadPdf = async () => {
    const printArea = document.getElementById('work-order-sheet-printable');
    if (!printArea) return;

    setIsGeneratingPdf(true);
    try {
      const canvas = await html2canvas(printArea, {
        scale: 2.5,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        scrollX: 0,
        scrollY: 0,
        windowWidth: 1050,
        onclone: (clonedDoc) => {
          const printRoot = clonedDoc.getElementById('work-order-sheet-printable');
          if (printRoot) {
            printRoot.style.fontFamily = 'Arial, Helvetica, sans-serif';
            printRoot.style.letterSpacing = 'normal';
            printRoot.style.transform = 'none';
          }

          // Sanitize every element in cloned DOM and fix text baselines
          const allElements = clonedDoc.querySelectorAll('*');
          allElements.forEach((el) => {
            const htmlEl = el as HTMLElement;
            try {
              htmlEl.style.fontFamily = 'Arial, Helvetica, sans-serif';
              htmlEl.style.letterSpacing = 'normal';
              
              if (htmlEl.tagName === 'TH' || htmlEl.tagName === 'TD') {
                htmlEl.style.verticalAlign = 'middle';
                htmlEl.style.lineHeight = '1';
                htmlEl.style.paddingTop = '1px';
                htmlEl.style.paddingBottom = '3px';
              } else if (htmlEl.tagName === 'DIV' || htmlEl.tagName === 'SPAN' || htmlEl.tagName === 'P') {
                htmlEl.style.lineHeight = '1.15';
              }

              const computed = window.getComputedStyle(htmlEl);
              const colorProps = [
                'color',
                'background-color',
                'border-top-color',
                'border-bottom-color',
                'border-left-color',
                'border-right-color',
                'outline-color'
              ];

              colorProps.forEach((prop) => {
                const val = computed.getPropertyValue(prop);
                if (val && (val.includes('oklch') || val.includes('oklab') || val.includes('color(') || val.includes('lab(') || val.includes('lch('))) {
                  const clean = sanitizeCssColor(val);
                  htmlEl.style.setProperty(prop, clean, 'important');
                }
              });

              const shadow = computed.boxShadow;
              if (shadow && (shadow.includes('oklch') || shadow.includes('oklab') || shadow.includes('color('))) {
                htmlEl.style.boxShadow = 'none';
              }
            } catch {
              // ignore
            }
          });
        }
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.98);
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = pdf.internal.pageSize.getWidth(); // 210mm
      const pageHeight = pdf.internal.pageSize.getHeight(); // 297mm
      const margin = 4; // 4mm margins
      const printableWidth = pageWidth - (margin * 2);
      const imgHeight = (canvas.height * printableWidth) / canvas.width;

      if (imgHeight <= (pageHeight - (margin * 2))) {
        pdf.addImage(imgData, 'JPEG', margin, margin, printableWidth, imgHeight);
      } else {
        const ratio = (pageHeight - (margin * 2)) / imgHeight;
        const fittedWidth = printableWidth * ratio;
        const xOffset = (pageWidth - fittedWidth) / 2;
        pdf.addImage(imgData, 'JPEG', xOffset, margin, fittedWidth, pageHeight - (margin * 2));
      }

      const cleanName = (workOrder?.barcode || workOrder?.id || 'Kartela')
        .toString()
        .replace(/[^a-zA-Z0-9_-]/g, '_');
      pdf.save(`Is_Emri_${cleanName}_Kartela.pdf`);
    } catch (err) {
      console.error('PDF oluşturulurken hata:', err);
      handlePrint();
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Direct Print Dialog with Multi-Strategy Fail-Safe
  const handlePrint = async () => {
    const printArea = document.getElementById('work-order-sheet-printable');
    if (!printArea) return;

    setIsPrinting(true);
    setPrintNotice(null);

    try {
      // 1. Open isolated print tab via Blob URL (Bypasses iframe sandbox print restrictions completely)
      const blobUrl = openPrintWindow(
        printArea.outerHTML, 
        `İş Emri Fişi - ${workOrder?.barcode || workOrder?.id || ''}`, 
        {
          title: `İş Emri Kartelası - ${workOrder?.barcode || workOrder?.id || ''}`,
          landscape: false,
          css: `
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #000000; font-size: 9.5px; vertical-align: middle; }
          `
        }
      );

      setPrintNotice({
        message: 'Yazdırma sayfası yeni sekmede açıldı ve yazıcı penceresi otomatik tetiklendi.',
        blobUrl: blobUrl || undefined
      });

      // 2. Also try native print if outside iframe
      if (window.self === window.top) {
        setTimeout(() => {
          try {
            window.print();
          } catch (e) {
            console.warn('Native window.print fallback failed:', e);
          }
        }, 150);
      }
    } catch (err) {
      console.error('Baskı başlatılırken hata:', err);
      // Fallback: download PDF directly
      await handleDownloadPdf();
    } finally {
      setTimeout(() => {
        setIsPrinting(false);
      }, 1000);
    }
  };

  // Open Clean Print in New Tab
  const handleOpenInNewTab = () => {
    const printArea = document.getElementById('work-order-sheet-printable');
    if (!printArea) return;

    const blobUrl = openPrintWindow(
      printArea.outerHTML, 
      `İş Emri Kartelası - ${workOrder?.barcode || workOrder?.id || ''}`, 
      {
        title: `İş Emri Fişi - ${workOrder?.barcode || workOrder?.id || ''}`,
        landscape: false
      }
    );

    if (blobUrl) {
      setPrintNotice({
        message: 'Önizleme sayfası yeni sekmede açıldı.',
        blobUrl
      });
    }
  };

  const handleSaveCustomData = () => {
    if (onSaveWorkOrder && workOrder) {
      onSaveWorkOrder({
        moldCode,
        moldGroup,
        documentNo,
        customerName,
        customerCode,
        orderNumber,
        color: colorName,
        assortmentBreakdown: customSizes
      });
    }
    setIsEditing(false);
  };

  if (!isOpen || !workOrder) return null;

  const totalAssortmentQty = customSizes.reduce((s, a) => s + (Number(a.quantity) || 0), 0) || workOrder.quantity || 640;
  const woCreatedDate = workOrder.createdAt ? new Date(workOrder.createdAt) : new Date();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Detaylı Üretim İş Emri & Kesim Fişi (A4 Kartela)"
      className="max-w-5xl"
    >
      <div className="space-y-4">
        {/* Top Control Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 text-white p-3.5 rounded-2xl print:hidden">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center font-black">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-black flex items-center gap-2">
                <span>İş Emri Kartelası: {workOrder.barcode}</span>
                <span className="text-[10px] bg-amber-400/20 text-amber-300 px-2 py-0.5 rounded-md font-bold uppercase">
                  A4 Endüstriyel Şablon
                </span>
              </div>
              <p className="text-xs text-slate-300">
                {product?.name || 'Ayakkabı Modeli'} • {totalAssortmentQty} Çift Üretim MRP Sarfiyat Listesi
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setIsEditing(!isEditing)}
              className={cn(
                "px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all",
                isEditing ? "bg-amber-400 text-slate-950" : "bg-slate-800 text-slate-200 hover:bg-slate-700"
              )}
            >
              <Edit3 className="w-3.5 h-3.5" />
              {isEditing ? 'Düzenlemeyi Bitir' : 'Fiş Bilgilerini Düzenle'}
            </button>

            <button
              type="button"
              onClick={handleOpenInNewTab}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all"
              title="Yeni temiz sekmede açarak önizle"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Önizleme
            </button>

            <button
              type="button"
              disabled={isGeneratingPdf}
              onClick={handleDownloadPdf}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-md transition-all cursor-pointer"
            >
              {isGeneratingPdf ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> PDF Hazırlanıyor...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" /> PDF İndir
                </>
              )}
            </button>

            <button
              type="button"
              disabled={isPrinting}
              onClick={handlePrint}
              className="px-4 py-2 bg-amber-400 hover:bg-amber-300 disabled:opacity-60 text-slate-950 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-md shadow-amber-400/20 transition-all cursor-pointer"
            >
              {isPrinting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Yazıcı Açılıyor...
                </>
              ) : (
                <>
                  <Printer className="w-4 h-4" /> Yazdır
                </>
              )}
            </button>
          </div>
        </div>

        {/* Print Feedback Banner */}
        {printNotice && (
          <div className="bg-amber-50 border border-amber-300 text-amber-950 p-3 rounded-2xl flex items-center justify-between gap-3 text-xs font-semibold print:hidden shadow-sm">
            <div className="flex items-center gap-2">
              <Printer className="w-4 h-4 text-amber-700 shrink-0" />
              <span>{printNotice.message}</span>
              {printNotice.blobUrl && (
                <a
                  href={printNotice.blobUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-bold text-indigo-700 hover:text-indigo-900 ml-1.5 inline-flex items-center gap-1"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Yazdırma Sayfasını Aç
                </a>
              )}
            </div>
            <button
              type="button"
              onClick={() => setPrintNotice(null)}
              className="p-1 hover:bg-amber-200/70 rounded-lg text-slate-600 cursor-pointer"
              title="Kapat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Quick Edit Drawer */}
        {isEditing && (
          <div className="bg-amber-50/70 border border-amber-200 p-4 rounded-2xl space-y-4 print:hidden">
            <div className="flex items-center justify-between border-b border-amber-200 pb-2">
              <span className="text-xs font-black text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                <Edit3 className="w-4 h-4" /> İş Emri Kartı Parametrelerini Güncelle
              </span>
              <button
                type="button"
                onClick={handleSaveCustomData}
                className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold flex items-center gap-1"
              >
                <Check className="w-3.5 h-3.5" /> Uygula
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-bold">
              <div>
                <label className="text-[10px] text-amber-800 uppercase block mb-1">Kalıp Kodu</label>
                <input
                  type="text"
                  value={moldCode}
                  onChange={e => setMoldCode(e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-amber-300 rounded-lg p-2 font-mono text-slate-900 dark:text-slate-100"
                  placeholder="örn: 018"
                />
              </div>

              <div>
                <label className="text-[10px] text-amber-800 uppercase block mb-1">Kalıp / Seri Grubu</label>
                <input
                  type="text"
                  value={moldGroup}
                  onChange={e => setMoldGroup(e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-amber-300 rounded-lg p-2 text-slate-900 dark:text-slate-100 uppercase"
                  placeholder="örn: PTK _ PATİK (26-30)"
                />
              </div>

              <div>
                <label className="text-[10px] text-amber-800 uppercase block mb-1">Müşteri Adı</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-amber-300 rounded-lg p-2 text-slate-900 dark:text-slate-100 uppercase font-black"
                  placeholder="örn: BESTOF AYAKKABI"
                />
              </div>

              <div>
                <label className="text-[10px] text-amber-800 uppercase block mb-1">Belge No</label>
                <input
                  type="text"
                  value={documentNo}
                  onChange={e => setDocumentNo(e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-amber-300 rounded-lg p-2 font-mono text-slate-900 dark:text-slate-100 uppercase"
                  placeholder="örn: KİŞ 74"
                />
              </div>

              <div>
                <label className="text-[10px] text-amber-800 uppercase block mb-1">Sipariş No</label>
                <input
                  type="text"
                  value={orderNumber}
                  onChange={e => setOrderNumber(e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-amber-300 rounded-lg p-2 font-mono text-slate-900 dark:text-slate-100"
                  placeholder="örn: 2423"
                />
              </div>

              <div>
                <label className="text-[10px] text-amber-800 uppercase block mb-1">Üretilecek Renk / Varyant</label>
                <input
                  type="text"
                  value={colorName}
                  onChange={e => setColorName(e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-amber-300 rounded-lg p-2 uppercase text-slate-900 dark:text-slate-100 font-bold"
                  placeholder="örn: SİYAH/BEYAZ"
                />
              </div>

              <div>
                <label className="text-[10px] text-amber-800 uppercase block mb-1">Sipariş Tarihi</label>
                <input
                  type="text"
                  value={orderDateStr}
                  onChange={e => setOrderDateStr(e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-amber-300 rounded-lg p-2 font-mono text-slate-900 dark:text-slate-100"
                  placeholder="11/04/2022"
                />
              </div>

              <div>
                <label className="text-[10px] text-amber-800 uppercase block mb-1">Müşteri Kodu</label>
                <input
                  type="text"
                  value={customerCode}
                  onChange={e => setCustomerCode(e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-amber-300 rounded-lg p-2 font-mono text-slate-900 dark:text-slate-100 uppercase"
                  placeholder="MUS-0021"
                />
              </div>
            </div>

            {/* Sizes Edit */}
            <div className="space-y-1.5 pt-2 border-t border-amber-200">
              <label className="text-[10px] text-amber-900 uppercase block font-black">Beden & Asorti Dağılımı</label>
              <div className="flex flex-wrap gap-2">
                {customSizes.map((sz, idx) => (
                  <div key={idx} className="bg-white dark:bg-slate-900 border border-amber-300 rounded-lg p-1.5 text-center flex items-center gap-1.5">
                    <span className="font-mono font-bold text-amber-900 text-xs px-1.5 bg-amber-100 rounded">{sz.size}:</span>
                    <input
                      type="number"
                      value={sz.quantity}
                      onChange={e => {
                        const next = [...customSizes];
                        next[idx].quantity = Number(e.target.value) || 0;
                        setCustomSizes(next);
                      }}
                      className="w-14 text-center font-bold text-xs p-0.5 border border-slate-200 dark:border-slate-700 rounded"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* PRINTABLE INDUSTRIAL WORK ORDER SHEET (EXACT CLONE OF USER IMAGE)        */}
        {/* ========================================================================= */}
        <div className="overflow-x-auto bg-slate-100 dark:bg-slate-800 p-2 sm:p-4 rounded-2xl flex justify-center">
          <div
            id="work-order-sheet-printable"
            className="w-full max-w-[210mm] bg-white dark:bg-slate-900 text-black p-3.5 sm:p-5 border-2 border-black select-text shadow-xl"
            style={{ 
              minHeight: '280mm',
              fontFamily: 'Arial, Helvetica, sans-serif',
              lineHeight: '1.4'
            }}
          >
            {/* Header Main Grid */}
            <div className="grid grid-cols-12 border-2 border-black">
              {/* Left Column: Form Details & Header Barcode */}
              <div className="col-span-9 border-r-2 border-black divide-y border-black">
                {/* Row 1: Emir No + Barcode + Siparis Tarih */}
                <div className="grid grid-cols-12 text-[10.5px] items-center">
                  <div className="col-span-4 p-2 font-bold border-r border-black flex items-center" style={{ verticalAlign: 'middle' }}>
                    <span>Emir No : <strong className="font-black text-[12px]">{workOrder.id || '1458'}</strong></span>
                  </div>
                  <div className="col-span-4 p-1 border-r border-black flex items-center justify-center bg-white dark:bg-slate-900">
                    <BarcodeSvg 
                      value={workOrder.barcode ? workOrder.barcode.replace(/\D/g, '') || workOrder.barcode : '1458'} 
                      height={32} 
                      showText={false} 
                    />
                  </div>
                  <div className="col-span-4 p-2 text-[9.5px] font-bold" style={{ verticalAlign: 'middle' }}>
                    <span>Sipariş : <strong>{orderDateStr || woCreatedDate.toLocaleDateString('tr-TR')}</strong></span>
                  </div>
                </div>

                {/* Row 2: Emir Tarihi + Sipariş No */}
                <div className="grid grid-cols-12 text-[10.5px]">
                  <div className="col-span-8 p-2 font-bold border-r border-black" style={{ verticalAlign: 'middle' }}>
                    <span>Emir Tarihi : <strong>{woCreatedDate.toLocaleDateString('tr-TR')} {woCreatedDate.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</strong></span>
                  </div>
                  <div className="col-span-4 p-2 font-bold" style={{ verticalAlign: 'middle' }}>
                    <span>Sipariş No : <strong className="text-[12px]">{orderNumber || '2423'}</strong></span>
                  </div>
                </div>

                {/* Row 3: Müşteri Kodu + Belge No */}
                <div className="grid grid-cols-12 text-[10.5px]">
                  <div className="col-span-8 p-2 font-bold border-r border-black" style={{ verticalAlign: 'middle' }}>
                    <span>Müşteri Kodu : <strong>{customerCode || '-'}</strong></span>
                  </div>
                  <div className="col-span-4 p-2 font-bold" style={{ verticalAlign: 'middle' }}>
                    <span>Belge No : <strong className="uppercase">{documentNo || 'KİŞ 74'}</strong></span>
                  </div>
                </div>

                {/* Row 4: Müşteri Adı (Large Blue Bold) */}
                <div className="p-2.5 bg-white dark:bg-slate-900">
                  <div className="flex items-center text-[12px] font-bold" style={{ verticalAlign: 'middle' }}>
                    <span className="mr-2">Müşteri Adı :</span>
                    <span className="text-[15px] font-black tracking-wide uppercase" style={{ color: '#0033cc' }}>
                      {customerName || 'BESTOF AYAKKABI'}
                    </span>
                  </div>
                </div>

                {/* Row 5: Kalıp Kodu + Kalıp/Seri Grubu */}
                <div className="grid grid-cols-12 text-[10.5px] bg-white dark:bg-slate-900">
                  <div className="col-span-5 p-2 font-bold border-r border-black" style={{ verticalAlign: 'middle' }}>
                    <span>Kalıp Kodu: <strong className="text-[12px] font-black">{moldCode || '018'}</strong></span>
                  </div>
                  <div className="col-span-7 p-2 font-black uppercase text-[11px] tracking-wider" style={{ verticalAlign: 'middle' }}>
                    <span>{moldGroup || 'PTK _ PATİK (26-30)'}</span>
                  </div>
                </div>
              </div>

              {/* Right Column: Model Photo Box */}
              <div className="col-span-3 flex flex-col items-center justify-center p-2 relative min-h-[120px]" style={{ backgroundColor: '#f8fafc' }}>
                {product?.image ? (
                  <img
                    src={product.image}
                    alt={product.name}
                    className="max-h-28 max-w-full object-contain rounded"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-full h-full min-h-[100px] border border-dashed rounded flex flex-col items-center justify-center p-2 text-center" style={{ borderColor: '#94a3b8', color: '#94a3b8' }}>
                    <ImageIcon className="w-8 h-8 mb-1 opacity-50" />
                    <span className="text-[8.5px] font-bold uppercase leading-tight">Model Görseli</span>
                  </div>
                )}
              </div>
            </div>

            {/* Model Name & Size Assortment Header Row */}
            <div className="mt-3 flex flex-wrap items-end justify-between gap-2">
              {/* Size / Assortment Table */}
              <div className="border border-black">
                <table className="border-collapse text-[10px]" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#d8b4e2' }}>
                      <th className="border border-black px-2.5 py-1 font-black text-center text-black min-w-[75px] text-[9.5px]" style={{ verticalAlign: 'middle', lineHeight: '1.4' }}>
                        Renk / Varyant
                      </th>
                      {customSizes.map((sz, idx) => (
                        <th key={idx} className="border border-black px-2.5 py-1 font-black text-center text-black min-w-[34px]" style={{ verticalAlign: 'middle', lineHeight: '1.4' }}>
                          {sz.size}
                        </th>
                      ))}
                      <th className="border border-black px-3 py-1 font-black text-center text-black min-w-[45px]" style={{ verticalAlign: 'middle', lineHeight: '1.4' }}>
                        Toplam
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border border-black px-2 py-1 font-black text-center uppercase tracking-wider text-[9px]" style={{ backgroundColor: '#6b21a8', color: '#ffffff', verticalAlign: 'middle', lineHeight: '1.4' }}>
                        {colorName || 'SİYAH/BEYAZ'}
                      </td>
                      {customSizes.map((sz, idx) => (
                        <td key={idx} className="border border-black px-2 py-1 font-black text-center text-black text-[10.5px]" style={{ verticalAlign: 'middle', lineHeight: '1.4' }}>
                          {sz.quantity}
                        </td>
                      ))}
                      <td className="border border-black px-2.5 py-1 font-black text-center text-black text-[11px]" style={{ backgroundColor: '#f1f5f9', verticalAlign: 'middle', lineHeight: '1.4' }}>
                        {totalAssortmentQty}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Model Title Display (Bold Red) */}
              <div className="text-right">
                <div className="text-sm font-bold" style={{ lineHeight: '1.3' }}>
                  Üretilecek Model : <span className="text-xl sm:text-2xl font-black uppercase tracking-tight" style={{ color: '#cc0000' }}>
                    {product?.code || '22K-B74 P'}
                  </span>
                </div>
                {product?.name && product.name !== product.code && (
                  <div className="text-[11px] font-bold uppercase mt-0.5" style={{ color: '#334155', lineHeight: '1.3' }}>
                    {product.name}
                  </div>
                )}
              </div>
            </div>

            {/* Reçete Malzeme Listesi Tablosu */}
            <div className="mt-3 border-2 border-black">
              {/* Header Columns */}
              <table className="w-full border-collapse" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr className="border-b-2 border-black text-[10px] font-black bg-white dark:bg-slate-900">
                    <th className="p-1.5 text-left border-r border-black w-[32%]" style={{ verticalAlign: 'middle', lineHeight: '1.4' }}>Hammadde Adı</th>
                    <th className="p-1.5 text-left border-r border-black w-[25%]" style={{ verticalAlign: 'middle', lineHeight: '1.4' }}>Açıklama / Not</th>
                    <th className="p-1.5 text-left border-r border-black w-[25%]" style={{ verticalAlign: 'middle', lineHeight: '1.4' }}>Kullanılacak Renk</th>
                    <th className="p-1.5 text-right border-r border-black w-[10%]" style={{ verticalAlign: 'middle', lineHeight: '1.4' }}>Miktar</th>
                    <th className="p-1.5 text-center w-[8%]" style={{ verticalAlign: 'middle', lineHeight: '1.4' }}>Birim</th>
                  </tr>
                </thead>

                <tbody>
                  {groupedDepartments.map((deptGroup) => (
                    <React.Fragment key={deptGroup.name}>
                      {/* Department Section Banner (Bright Yellow Bar) */}
                      <tr>
                        <td 
                          colSpan={5} 
                          className="font-black text-[11px] uppercase tracking-wider py-1 px-2.5 border-y border-black"
                          style={{ backgroundColor: '#ffff00', color: '#000000', verticalAlign: 'middle', lineHeight: '1.4' }}
                        >
                          {deptGroup.name}
                        </td>
                      </tr>

                      {/* Department Rows */}
                      {deptGroup.items.map((row: any, rIdx: number) => (
                        <tr key={rIdx} className="border-b border-black text-[9.5px]">
                          {/* Raw material name */}
                          <td className="p-1.5 font-bold border-r border-black text-black uppercase" style={{ verticalAlign: 'middle', lineHeight: '1.4' }}>
                            {row.rawName}
                          </td>

                          {/* Part / Explanation (Bold Blue) */}
                          <td className="p-1.5 font-black border-r border-black uppercase text-[9.5px]" style={{ color: '#0033cc', verticalAlign: 'middle', lineHeight: '1.4' }}>
                            {row.partName}
                          </td>

                          {/* Color */}
                          <td className="p-1.5 font-bold border-r border-black uppercase text-[9px]" style={{ color: '#0f172a', verticalAlign: 'middle', lineHeight: '1.4' }}>
                            {row.color}
                          </td>

                          {/* Quantity */}
                          <td className="p-1.5 font-black border-r border-black text-right text-[10px] text-black font-mono" style={{ verticalAlign: 'middle', lineHeight: '1.4' }}>
                            {formatQty(row.batchQty, row.unit)}
                          </td>

                          {/* Unit */}
                          <td className="p-1.5 font-bold text-center text-[9px] uppercase" style={{ color: '#1e293b', verticalAlign: 'middle', lineHeight: '1.4' }}>
                            {row.unit}
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Bottom Footer Info & Signature Boxes */}
            <div className="mt-4 pt-2 border-t-2 border-black flex items-center justify-between text-[10px] font-bold" style={{ lineHeight: '1.4' }}>
              <div>
                <span>Model : </span>
                <strong className="text-[11px] font-black uppercase" style={{ color: '#b91c1c' }}>
                  {moldCode ? `KALIP:${moldCode}` : 'KALIP:018'}
                </strong>
                {workOrder.notes && (
                  <span className="ml-3 font-medium" style={{ color: '#475569' }}>({workOrder.notes})</span>
                )}
              </div>

              <div className="flex items-center gap-6 text-[9px] font-bold uppercase" style={{ color: '#334155' }}>
                <span>Kesim Onay: ________</span>
                <span>Saya Onay: ________</span>
                <span>Montaj Onay: ________</span>
                <span>Kontrol / Sevk: ________</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Modal Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-700 print:hidden">
          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1.5">
            <Info className="w-4 h-4 text-indigo-500 shrink-0" />
            <span>
              Bu fiş A4 endüstriyel formatta hazırlanmıştır. PDF olarak indirebilir veya doğrudan yazıcıya gönderebilirsiniz.
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
            >
              Kapat
            </button>
            <button
              type="button"
              disabled={isGeneratingPdf}
              onClick={handleDownloadPdf}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-md transition-all cursor-pointer"
            >
              {isGeneratingPdf ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> PDF Hazırlanıyor...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" /> PDF İndir (.pdf)
                </>
              )}
            </button>
            <button
              type="button"
              disabled={isPrinting}
              onClick={handlePrint}
              className="px-5 py-2.5 bg-slate-900 hover:bg-indigo-600 disabled:opacity-60 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-md transition-all cursor-pointer"
            >
              {isPrinting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Yazıcı Açılıyor...
                </>
              ) : (
                <>
                  <Printer className="w-4 h-4" /> Yazdır (Print)
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
