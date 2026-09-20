import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Printer, 
  Download, 
  Mail, 
  Copy, 
  Check, 
  X, 
  FileText, 
  Building2, 
  Calendar, 
  DollarSign, 
  Boxes, 
  Phone, 
  MapPin, 
  Sparkles, 
  AlertCircle,
  Edit3,
  Save,
  Layers,
  Hash,
  ShieldCheck,
  Barcode,
  Scissors,
  Hammer,
  CheckSquare,
  PackageCheck,
  Sliders,
  RefreshCw,
  Clock,
  ExternalLink
} from 'lucide-react';
import { api, commit, type Mutation } from '../../api/client';
import { erpService } from '../../services/erpService';
import { downloadElementAsPdf, sanitizeClonedDocumentColors } from '../../lib/pdfService';
import { printHtml, openPrintWindow } from '../../lib/printService';
import { BarcodeSvg } from '../BarcodeSvg';
import { cn } from '../../lib/utils';
import type { Order, OrderItem, Contact, Product, CompanySettings, AssortmentTemplate, WorkOrder } from '../../types';

export type PoTemplateType = 'official' | 'matrix_focused' | 'compact';

interface PurchaseOrderPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId?: number | null;
  orderData?: Order & { items: OrderItem[] };
}

interface SizedRowGroup {
  productId: number;
  productCode: string;
  productName: string;
  color: string;
  unit: string;
  moldCode?: string;
  moldGroup?: string;
  unitPrice: number;
  taxRate: number;
  sizeQuantities: { [size: string]: number };
  totalQuantity: number;
  totalAmount: number;
  originalItemIds?: number[];
}

/**
 * Turkish currency to words converter (for official letter)
 */
function numberToTurkishWords(amount: number): string {
  if (isNaN(amount) || amount === 0) return 'SIFIR TÜRK LİRASI';

  const ones = ['', 'BİR', 'İKİ', 'ÜÇ', 'DÖRT', 'BEŞ', 'ALTI', 'YEDİ', 'SEKİZ', 'DOKUZ'];
  const tens = ['', 'ON', 'YİRMİ', 'OTUZ', 'KIRK', 'ELLİ', 'ALTMIŞ', 'YETMİŞ', 'SEKSEN', 'DOKSAN'];
  const groups = ['', 'BİN', 'MİLYON', 'MİLYAR', 'TRİLYON'];

  const parts = Math.abs(amount).toFixed(2).split('.');
  const integerPart = parseInt(parts[0], 10);
  const kurusPart = parseInt(parts[1], 10);

  function convertThreeDigits(n: number): string {
    let result = '';
    const h = Math.floor(n / 100);
    const t = Math.floor((n % 100) / 10);
    const o = n % 10;

    if (h === 1) result += 'YÜZ';
    else if (h > 1) result += ones[h] + 'YÜZ';

    if (t > 0) result += tens[t];
    if (o > 0) {
      if (!(h === 0 && t === 0 && o === 1 && result.length === 0)) {
        result += ones[o];
      } else {
        result += 'BİR';
      }
    }
    return result;
  }

  let num = integerPart;
  let groupIdx = 0;
  let liraWords = '';

  if (num === 0) {
    liraWords = 'SIFIR';
  } else {
    while (num > 0) {
      const chunk = num % 1000;
      if (chunk > 0) {
        let chunkWords = convertThreeDigits(chunk);
        if (groupIdx === 1 && chunk === 1) {
          chunkWords = '';
        }
        liraWords = chunkWords + groups[groupIdx] + liraWords;
      }
      num = Math.floor(num / 1000);
      groupIdx++;
    }
  }

  let kurusWords = '';
  if (kurusPart > 0) {
    const t = Math.floor(kurusPart / 10);
    const o = kurusPart % 10;
    kurusWords = tens[t] + (o > 0 ? ones[o] : '');
  }

  let finalStr = liraWords + ' TÜRK LİRASI';
  if (kurusPart > 0) {
    finalStr += ' ' + kurusWords + ' KURUŞ';
  }

  return finalStr;
}

/**
 * Standard adult male shoe size distribution ratio (40-45)
 */
const DEFAULT_MEN_RATIO = [
  { size: '40', weight: 1 },
  { size: '41', weight: 2 },
  { size: '42', weight: 3 },
  { size: '43', weight: 3 },
  { size: '44', weight: 2 },
  { size: '45', weight: 1 }
];

const DEFAULT_WOMEN_RATIO = [
  { size: '36', weight: 1 },
  { size: '37', weight: 3 },
  { size: '38', weight: 4 },
  { size: '39', weight: 3 },
  { size: '40', weight: 1 }
];

const DEFAULT_KIDS_RATIO = [
  { size: '26', weight: 1 },
  { size: '27', weight: 1 },
  { size: '28', weight: 1 },
  { size: '29', weight: 1 },
  { size: '30', weight: 1 }
];

/**
 * Checks if a product or order item qualifies as a footwear/sized component
 */
function isFootwearProduct(prod?: Product, item?: OrderItem): boolean {
  if (!prod && !item) return false;
  if (item?.size && item.size.trim() !== '' && item.size.trim() !== '-') return true;
  if (!prod) return false;

  if (prod.hasSizeVariants || prod.isFootwear) return true;
  if (prod.categoryType === 'finished') return true;
  if (prod.assortmentTemplateId && prod.assortmentTemplateId > 0) return true;
  if (prod.assortment && prod.assortment.length > 0) return true;

  const subType = (prod.subType || '').toLowerCase();
  if (['taban', 'mostra', 'fuspet', 'salpa', 'saya', 'kalıp', 'bitmiş ayakkabı', 'mamul', 'fort', 'bombe'].includes(subType)) {
    return true;
  }

  const name = (prod.name || '').toLowerCase();
  if (name.includes('taban') || name.includes('mostra') || name.includes('fuspet') || name.includes('merdane') || name.includes('ayakkabı')) {
    return true;
  }

  if ((prod.unit || '').toLowerCase() === 'çift') {
    return true;
  }

  return false;
}

/**
 * Calculates a proportional size breakdown for a total quantity using template or default ratio
 */
function calculateAssortmentBreakdown(
  totalQty: number,
  templateItems?: { size: string; quantity: number }[] | { size: string; weight: number }[],
  prodName?: string,
  moldGroup?: string
): { [size: string]: number } {
  let ratioItems: { size: string; weight: number }[] = [];

  if (templateItems && templateItems.length > 0) {
    ratioItems = templateItems.map(item => ({
      size: item.size,
      weight: (item as any).quantity || (item as any).weight || 1
    }));
  } else {
    // Pick standard based on mold or product name
    const combined = `${prodName || ''} ${moldGroup || ''}`.toLowerCase();
    if (combined.includes('kadın') || combined.includes('zenne') || combined.includes('36-40')) {
      ratioItems = DEFAULT_WOMEN_RATIO;
    } else if (combined.includes('patik') || combined.includes('çocuk') || combined.includes('26-30') || combined.includes('26-35')) {
      ratioItems = DEFAULT_KIDS_RATIO;
    } else {
      ratioItems = DEFAULT_MEN_RATIO;
    }
  }

  const totalWeight = ratioItems.reduce((acc, curr) => acc + (curr.weight || 0), 0);
  if (totalWeight <= 0) return {};

  const result: { [size: string]: number } = {};
  let accumulated = 0;

  ratioItems.forEach((item, index) => {
    if (index === ratioItems.length - 1) {
      // Last item gets remainder to ensure exact sum equals totalQty
      result[item.size] = Math.max(0, totalQty - accumulated);
    } else {
      const calculatedQty = Math.round((item.weight / totalWeight) * totalQty);
      result[item.size] = calculatedQty;
      accumulated += calculatedQty;
    }
  });

  return result;
}

export function PurchaseOrderPrintModal({
  isOpen,
  onClose,
  orderId,
  orderData: initialOrderData
}: PurchaseOrderPrintModalProps) {
  const [order, setOrder] = useState<any>(null);
  const [supplier, setSupplier] = useState<Contact | null>(null);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [productsMap, setProductsMap] = useState<Map<number, Product>>(new Map());
  const [assortmentTemplates, setAssortmentTemplates] = useState<AssortmentTemplate[]>([]);
  const [workOrdersList, setWorkOrdersList] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState<PoTemplateType>('official');
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  
  // Custom Matrix Overrides (e.g. user manually edits or picks template in modal)
  const [customMatrixOverrides, setCustomMatrixOverrides] = useState<Record<string, { [size: string]: number }>>({});
  
  // Size Breakdown Editor Drawer/Modal state
  const [isMatrixEditorOpen, setIsMatrixEditorOpen] = useState(false);
  const [matrixEditingTarget, setMatrixEditingTarget] = useState<{
    productId: number;
    productName: string;
    color: string;
    totalQuantity: number;
    currentSizes: { [size: string]: number };
  } | null>(null);
  const [selectedTemplateIdForEdit, setSelectedTemplateIdForEdit] = useState<number | string>('');
  const [customSizeInputs, setCustomSizeInputs] = useState<{ size: string; quantity: number }[]>([]);
  const [isApplyingMatrixToDb, setIsApplyingMatrixToDb] = useState(false);

  // Email Modal & Copy state
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [emailRecipient, setEmailRecipient] = useState('');
  const [copiedEmail, setCopiedEmail] = useState(false);
  
  // Custom Editable Order Instructions for Printing
  const [customInstructions, setCustomInstructions] = useState<string>('');
  const [isEditingInstructions, setIsEditingInstructions] = useState(false);
  const [isSavingNotes, setIsSavingNotes] = useState(false);

  const printContentRef = useRef<HTMLDivElement>(null);

  // Load Order, Supplier, Company, Products, Templates & Work Orders
  useEffect(() => {
    async function loadData() {
      if (!isOpen) return;
      if (!orderId && !initialOrderData) return;

      setLoading(true);
      try {
        let loadedOrder = initialOrderData;
        if (orderId) {
          loadedOrder = await erpService.getOrder(orderId);
        }

        if (!loadedOrder) {
          setLoading(false);
          return;
        }

        setOrder(loadedOrder);
        setCustomInstructions(loadedOrder.notes || '');

        const [sysSettings, allProducts, allContacts, allTemplates, allWorkOrders] = await Promise.all([
          erpService.getSystemSettings(),
          api.products.list(),
          api.contacts.list(),
          api.assortmentTemplates.list(),
          api.workOrders.list()
        ]);

        if (sysSettings?.company) {
          setCompanySettings(sysSettings.company);
        }

        setAssortmentTemplates(allTemplates);
        setWorkOrdersList(allWorkOrders);

        const pMap = new Map<number, Product>();
        allProducts.forEach(p => {
          if (p.id) pMap.set(p.id, p);
        });
        setProductsMap(pMap);

        const foundSupplier = allContacts.find(c => c.id === loadedOrder.contactId) || null;
        setSupplier(foundSupplier);

        if (foundSupplier?.email) {
          setEmailRecipient(foundSupplier.email);
        } else {
          setEmailRecipient('');
        }
      } catch (err) {
        console.error('Satınalma siparişi yüklenirken hata:', err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [isOpen, orderId, initialOrderData]);

  // Aggregate Size Matrix Groups & Non-sized Items
  const { sizedGroups, uniqueSizes, nonSizedItems, totalSizedQuantity, totalNonSizedQuantity, hasSizedItems } = useMemo(() => {
    if (!order?.items || order.items.length === 0) {
      return {
        sizedGroups: [],
        uniqueSizes: [],
        nonSizedItems: [],
        totalSizedQuantity: 0,
        totalNonSizedQuantity: 0,
        hasSizedItems: false
      };
    }

    const sizeSet = new Set<string>();
    const sizedMap = new Map<string, SizedRowGroup>();
    const nonSized: any[] = [];
    let totalSizedQty = 0;
    let totalNonSizedQty = 0;

    // Group items by product + color first to see if size breakdown is explicit or needs derivation
    const rawGroups = new Map<string, OrderItem[]>();
    order.items.forEach((item: OrderItem) => {
      const groupKey = `${item.productId}_${(item.color || '').trim().toLowerCase()}`;
      const list = rawGroups.get(groupKey) || [];
      list.push(item);
      rawGroups.set(groupKey, list);
    });

    rawGroups.forEach((items, groupKey) => {
      const firstItem = items[0];
      const prod = productsMap.get(firstItem.productId);
      const isSizedGroup = items.some(i => isFootwearProduct(prod, i));

      if (isSizedGroup) {
        // Check if items have explicit size breakdown
        const itemsWithExplicitSize = items.filter(i => !!i.size && i.size.trim() !== '' && i.size.trim() !== '-');

        const totalQtyForGroup = items.reduce((acc, curr) => acc + (Number(curr.quantity) || 0), 0);
        const price = Number(firstItem.unitPrice) || (prod?.buyingPrice || 0);
        const totalAmountForGroup = items.reduce((acc, curr) => acc + (Number(curr.total) || ((Number(curr.quantity) || 0) * price)), 0);

        const defaultProdColor = prod?.colors && prod.colors.length > 0 ? prod.colors[0] : (firstItem.color || 'STANDART');
        const color = firstItem.color || defaultProdColor;

        let sizeQuantities: { [size: string]: number } = {};

        // 1. Check custom overrides from local state
        const overrideKey = `${firstItem.productId}_${color.trim().toLowerCase()}`;
        if (customMatrixOverrides[overrideKey]) {
          sizeQuantities = { ...customMatrixOverrides[overrideKey] };
        } else if (itemsWithExplicitSize.length > 0) {
          // 2. Use explicit sizes from OrderItems
          itemsWithExplicitSize.forEach(i => {
            const sz = i.size!.trim();
            sizeQuantities[sz] = (sizeQuantities[sz] || 0) + (Number(i.quantity) || 0);
          });
        } else {
          // 3. Auto-calculate size distribution for sized component (Taban, Mostra, etc.)
          let templateToUse: AssortmentTemplate | undefined = undefined;
          if (prod?.assortmentTemplateId) {
            templateToUse = assortmentTemplates.find(t => t.id === prod.assortmentTemplateId);
          }

          if (templateToUse && templateToUse.items.length > 0) {
            sizeQuantities = calculateAssortmentBreakdown(totalQtyForGroup, templateToUse.items, prod?.name, prod?.moldGroup);
          } else if (prod?.assortment && prod.assortment.length > 0) {
            sizeQuantities = calculateAssortmentBreakdown(totalQtyForGroup, prod.assortment, prod?.name, prod?.moldGroup);
          } else {
            // Check active work orders for ratio
            const matchedWo = workOrdersList.find(w => w.assortmentBreakdown && w.assortmentBreakdown.length > 0);
            if (matchedWo?.assortmentBreakdown) {
              sizeQuantities = calculateAssortmentBreakdown(totalQtyForGroup, matchedWo.assortmentBreakdown, prod?.name, prod?.moldGroup);
            } else {
              // Default distribution based on mold or adult series
              sizeQuantities = calculateAssortmentBreakdown(totalQtyForGroup, undefined, prod?.name, prod?.moldGroup);
            }
          }
        }

        // Register sizes into sizeSet
        Object.keys(sizeQuantities).forEach(sz => {
          if (sizeQuantities[sz] > 0) {
            sizeSet.add(sz);
          }
        });

        totalSizedQty += totalQtyForGroup;

        sizedMap.set(groupKey, {
          productId: firstItem.productId,
          productCode: prod?.code || '-',
          productName: prod?.name || 'Hammadde / Ürün',
          color: color,
          unit: prod?.unit || 'Çift',
          moldCode: prod?.moldCode || (prod?.moldGroup ? prod.moldGroup.split(' ')[0] : '018'),
          moldGroup: prod?.moldGroup || 'ERKEK STANDART (40-45)',
          unitPrice: price,
          taxRate: firstItem.taxRate || 20,
          sizeQuantities,
          totalQuantity: totalQtyForGroup,
          totalAmount: totalAmountForGroup,
          originalItemIds: items.map(i => i.id!).filter(Boolean)
        });
      } else {
        // Non-sized item (e.g. Leather, Adhesive, Buckle, Fabric)
        items.forEach(item => {
          const qty = Number(item.quantity) || 0;
          totalNonSizedQty += qty;
          const defaultProdColor = prod?.colors && prod.colors.length > 0 ? prod.colors[0] : '-';
          nonSized.push({
            ...item,
            productCode: prod?.code || '-',
            productName: prod?.name || 'Hammadde / Malzeme',
            unit: prod?.unit || 'Adet',
            color: item.color || defaultProdColor
          });
        });
      }
    });

    // Intelligently sort sizes: numeric order if possible
    const sortedSizes = Array.from(sizeSet).sort((a, b) => {
      const numA = parseFloat(a);
      const numB = parseFloat(b);
      if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB;
      }
      return a.localeCompare(b, 'tr');
    });

    return {
      sizedGroups: Array.from(sizedMap.values()),
      uniqueSizes: sortedSizes,
      nonSizedItems: nonSized,
      totalSizedQuantity: totalSizedQty,
      totalNonSizedQuantity: totalNonSizedQty,
      hasSizedItems: sizedMap.size > 0
    };
  }, [order, productsMap, customMatrixOverrides, assortmentTemplates, workOrdersList]);

  // Size column totals
  const sizeColumnTotals = useMemo(() => {
    const totals: { [size: string]: number } = {};
    uniqueSizes.forEach(s => {
      totals[s] = sizedGroups.reduce((acc, row) => acc + (row.sizeQuantities[s] || 0), 0);
    });
    return totals;
  }, [uniqueSizes, sizedGroups]);

  // Open size breakdown editor for a specific group
  const handleOpenMatrixEditor = (group: SizedRowGroup) => {
    setMatrixEditingTarget({
      productId: group.productId,
      productName: group.productName,
      color: group.color,
      totalQuantity: group.totalQuantity,
      currentSizes: { ...group.sizeQuantities }
    });

    // Populate inputs from current sizes
    const inputs: { size: string; quantity: number }[] = [];
    const sizes = Object.keys(group.sizeQuantities);
    if (sizes.length > 0) {
      sizes.sort((a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0)).forEach(sz => {
        inputs.push({ size: sz, quantity: group.sizeQuantities[sz] || 0 });
      });
    } else {
      ['40', '41', '42', '43', '44', '45'].forEach(sz => {
        inputs.push({ size: sz, quantity: 0 });
      });
    }
    setCustomSizeInputs(inputs);
    setSelectedTemplateIdForEdit('');
    setIsMatrixEditorOpen(true);
  };

  // Apply template inside matrix editor
  const handleSelectTemplateInEditor = (templateIdStr: string) => {
    setSelectedTemplateIdForEdit(templateIdStr);
    if (!templateIdStr || !matrixEditingTarget) return;

    const tmplId = Number(templateIdStr);
    const tmpl = assortmentTemplates.find(t => t.id === tmplId);
    if (!tmpl || tmpl.items.length === 0) return;

    const calculated = calculateAssortmentBreakdown(matrixEditingTarget.totalQuantity, tmpl.items);
    const newInputs = tmpl.items.map(ti => ({
      size: ti.size,
      quantity: calculated[ti.size] || 0
    }));
    setCustomSizeInputs(newInputs);
  };

  // Save customized matrix (both to local state & database orderItems)
  const handleSaveMatrixCustomization = async (applyToDb: boolean) => {
    if (!matrixEditingTarget) return;

    const overrideKey = `${matrixEditingTarget.productId}_${matrixEditingTarget.color.trim().toLowerCase()}`;
    const newMap: { [size: string]: number } = {};
    customSizeInputs.forEach(inp => {
      if (inp.quantity > 0) {
        newMap[inp.size] = inp.quantity;
      }
    });

    setCustomMatrixOverrides(prev => ({
      ...prev,
      [overrideKey]: newMap
    }));

    if (applyToDb && order?.id) {
      setIsApplyingMatrixToDb(true);
      try {
        // Find existing orderItems for this product and color
        const existingItems = await api.orderItems.list({ where: { orderId: order.id } });
        const itemsToRemove = existingItems.filter(i => 
          i.productId === matrixEditingTarget.productId && 
          (!matrixEditingTarget.color || (i.color || '').toLowerCase() === matrixEditingTarget.color.toLowerCase())
        );

        // Insert new size breakdown items
        const unitPrice = itemsToRemove[0]?.unitPrice || productsMap.get(matrixEditingTarget.productId)?.buyingPrice || 0;
        const taxRate = itemsToRemove[0]?.taxRate || 20;

        const newItemsToInsert: Omit<OrderItem, 'id'>[] = Object.entries(newMap).map(([size, qty]) => ({
          orderId: order.id,
          productId: matrixEditingTarget.productId,
          color: matrixEditingTarget.color,
          size: size,
          quantity: qty,
          shippedQuantity: 0,
          unitPrice: unitPrice,
          taxRate: taxRate,
          discountRate: 0,
          total: qty * unitPrice * (1 + taxRate / 100)
        }));

        // Delete existing items and insert new size breakdown atomically
        const ops: Mutation[] = [];
        const idsToDelete = itemsToRemove.map(i => i.id!).filter(Boolean);
        if (idsToDelete.length > 0) {
          ops.push({ op: 'deleteWhere', resource: 'orderItems', where: { id: idsToDelete } });
        }
        if (newItemsToInsert.length > 0) {
          ops.push({ op: 'insertMany', resource: 'orderItems', rows: newItemsToInsert as any });
        }
        if (ops.length > 0) {
          await commit(ops);
        }

        // Refresh order data
        const updatedOrder = await erpService.getOrder(order.id);
        if (updatedOrder) {
          setOrder(updatedOrder);
        }
      } catch (err) {
        console.error('Beden matrisi veritabanına kaydedilirken hata:', err);
      } finally {
        setIsApplyingMatrixToDb(false);
      }
    }

    setIsMatrixEditorOpen(false);
  };

  // Generate Email Content
  useEffect(() => {
    if (!order) return;

    const companyTitle = companySettings?.companyTitle || companySettings?.companyName || 'ABC Ayakkabı Sanayi & Ticaret A.Ş.';
    const supplierName = supplier?.name || 'Sayın Tedarikçi';
    const orderNum = order.orderNumber || `SAS-${order.id}`;
    const dateStr = order.date ? new Date(order.date).toLocaleDateString('tr-TR') : new Date().toLocaleDateString('tr-TR');
    const deliveryDateStr = order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString('tr-TR') : 'En Kısa Sürede';

    const subject = `[Satın Alma Siparişi] ${orderNum} - ${companyTitle}`;

    let body = `Sayın ${supplierName},\n\n`;
    body += `${companyTitle} olarak tarafınıza açmış olduğumuz ${orderNum} numaralı Satın Alma Siparişimizin detayları aşağıda yer almaktadır.\n\n`;
    body += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    body += `📋 SİPARİŞ BİLGİLERİ\n`;
    body += `Sipariş No: ${orderNum}\n`;
    body += `Sipariş Tarihi: ${dateStr}\n`;
    body += `Termin / Teslim Tarihi: ${deliveryDateStr}\n`;
    body += `Teslimat Adresi: ${companySettings?.address || 'Merkez Fabrika Deposu'} ${companySettings?.city ? `(${companySettings.city})` : ''}\n`;
    body += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    if (hasSizedItems) {
      body += `👟 BEDEN & ASORTİ DAĞILIM MATRİSİ\n`;
      body += `───────────────────────────────────────────────────\n`;
      sizedGroups.forEach(g => {
        body += `Ürün: ${g.productName} (Kod: ${g.productCode})\n`;
        body += `Renk: ${g.color} | Kalıp: ${g.moldCode || '-'}\n`;
        body += `Beden Dağılımı:\n`;
        uniqueSizes.forEach(s => {
          const q = g.sizeQuantities[s] || 0;
          if (q > 0) {
            body += `  • No ${s}: ${q.toLocaleString('tr-TR')} ${g.unit}\n`;
          }
        });
        body += `Toplam: ${g.totalQuantity.toLocaleString('tr-TR')} ${g.unit} x ${g.unitPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺ = ${g.totalAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺\n\n`;
      });
    }

    if (nonSizedItems.length > 0) {
      body += `📦 DİĞER HAMMADDE VE MALZEMELER\n`;
      body += `───────────────────────────────────────────────────\n`;
      nonSizedItems.forEach((it, idx) => {
        const qty = Number(it.quantity) || 0;
        const price = Number(it.unitPrice) || 0;
        const total = Number(it.total) || qty * price;
        body += `${idx + 1}. ${it.productName} (${it.productCode}) - ${it.color || 'Standart'}\n`;
        body += `   Miktar: ${qty.toLocaleString('tr-TR')} ${it.unit} x ${price.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺ = ${total.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺\n`;
      });
      body += `\n`;
    }

    body += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    body += `💰 FİNANSAL ÖZET\n`;
    body += `KDV Hariç Matrah: ${(order.totalAmount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺\n`;
    body += `Hesaplanan KDV (%20): ${(order.taxAmount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺\n`;
    body += `GENEL TOPLAM: ${(order.grandTotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺\n`;
    body += `Tutar Yazıyla: #${numberToTurkishWords(order.grandTotal || 0)}#\n`;
    body += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    if (customInstructions) {
      body += `⚠️ ÖZEL SİPARİŞ & TESLİMAT TALİMATI:\n`;
      body += `${customInstructions}\n\n`;
    }

    body += `Sipariş teyidinizi ve tahmini sevk gününüzü bildirmenizi rica eder, iyi çalışmalar dileriz.\n\n`;
    body += `Saygılarımızla,\n`;
    body += `${companyTitle}\n`;
    body += `Satınalma & Tedarik Departmanı\n`;
    if (companySettings?.phone) body += `Tel: ${companySettings.phone}\n`;
    if (companySettings?.email) body += `E-Posta: ${companySettings.email}\n`;

    setEmailSubject(subject);
    setEmailBody(body);
  }, [order, supplier, companySettings, sizedGroups, uniqueSizes, nonSizedItems, hasSizedItems, customInstructions]);

  if (!isOpen) return null;

  const isPurchase = (order?.type || 'purchase') === 'purchase';
  const currency = order?.currency || 'TRY';
  const companyTitle = companySettings?.companyTitle || companySettings?.companyName || 'PRO-ERP AYAKKABI SANAYİ VE TİCARET A.Ş.';
  const companyName = companySettings?.companyName || 'PRO-ERP AYAKKABI';

  // Direct Print Handling
  const handlePrint = async () => {
    if (!printContentRef.current) return;
    openPrintWindow(
      printContentRef.current.innerHTML,
      `${order.orderNumber || 'Satinalma_Siparisi'}_Tedarikci_Formu`,
      { title: `${order.orderNumber || 'Satinalma_Siparisi'} - Tedarikçi Sipariş Formu` }
    );
  };

  // PDF Download Handling (Vector Canvas with Color Sanitization)
  const handleDownloadPdf = async () => {
    if (!printContentRef.current || !order) return;
    setDownloadingPdf(true);
    try {
      await downloadElementAsPdf(
        printContentRef.current,
        {
          filename: `${order.orderNumber || 'Satinalma_Siparisi'}_Tedarikci_Formu.pdf`,
          orientation: 'portrait',
          scale: 2.2,
          marginMm: 6,
          backgroundColor: '#ffffff'
        }
      );
    } catch (error) {
      console.error('PDF oluşturma hatası:', error);
      alert('PDF oluşturulurken bir hata oluştu. Lütfen yazdırma penceresini kullanarak "PDF Olarak Kaydet" seçeneğini deneyin.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  // Save updated notes to order in DB
  const handleSaveNotesToDb = async () => {
    if (!order?.id) return;
    setIsSavingNotes(true);
    try {
      await api.orders.update(order.id, { notes: customInstructions });
      setOrder((prev: any) => ({ ...prev, notes: customInstructions }));
      setIsEditingInstructions(false);
    } catch (err) {
      console.error('Not kaydedilemedi:', err);
    } finally {
      setIsSavingNotes(false);
    }
  };

  // Copy email body
  const handleCopyEmail = () => {
    navigator.clipboard.writeText(emailBody);
    setCopiedEmail(true);
    setTimeout(() => setCopiedEmail(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-5xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[96vh]">
        
        {/* ========================================================================= */}
        {/* MODAL CONTROL HEADER (ACTIONS & TABS) */}
        {/* ========================================================================= */}
        <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {/* Title & Document Badge */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-white tracking-tight">
                  Tedarikçi Satınalma Formu & Beden Matrisi
                </h2>
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  #{order?.orderNumber || 'SAS-YENİ'}
                </span>
                {supplier && (
                  <span className="text-xs font-semibold text-slate-300 hidden sm:inline-block">
                    • {supplier.name}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                A4 Resmi Sipariş Çıktısı, Beden & Asorti Dağılım Matrisi, PDF ve Tedarikçi E-Posta Gönderimi
              </p>
            </div>
          </div>

          {/* Action Buttons & Template Selector */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Template Selector Tabs */}
            <div className="flex bg-slate-800 p-1 rounded-xl border border-slate-700 text-xs font-bold">
              <button
                type="button"
                onClick={() => setActiveTemplate('official')}
                className={cn(
                  "px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5",
                  activeTemplate === 'official' 
                    ? "bg-indigo-600 text-white shadow-sm" 
                    : "text-slate-300 hover:text-white hover:bg-slate-700/50"
                )}
                title="Resmi Tedarikçi Mektubu ve Sözleşme Şablonu"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Resmi Mektup</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTemplate('matrix_focused')}
                className={cn(
                  "px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5",
                  activeTemplate === 'matrix_focused' 
                    ? "bg-indigo-600 text-white shadow-sm" 
                    : "text-slate-300 hover:text-white hover:bg-slate-700/50"
                )}
                title="Renk & Beden Dağılım Matrisi Odaklı İmalat Şablonu"
              >
                <Boxes className="w-3.5 h-3.5" />
                <span>Asorti / Beden Matrisi</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTemplate('compact')}
                className={cn(
                  "px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5",
                  activeTemplate === 'compact' 
                    ? "bg-indigo-600 text-white shadow-sm" 
                    : "text-slate-300 hover:text-white hover:bg-slate-700/50"
                )}
                title="Kompakt Atölye ve İmalat Fişi"
              >
                <Scissors className="w-3.5 h-3.5" />
                <span>Atölye Fişi</span>
              </button>
            </div>

            {/* Email Button */}
            <button
              type="button"
              onClick={() => setIsEmailModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Mail Gönder</span>
            </button>

            {/* PDF Button */}
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={downloadingPdf}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{downloadingPdf ? 'Hazırlanıyor...' : 'PDF İndir'}</span>
            </button>

            {/* Direct Print Button */}
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-white text-slate-900 hover:bg-slate-100 rounded-lg text-xs font-black transition-all shadow-sm cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-indigo-600" />
              <span>Yazdır (A4)</span>
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* QUICK CUSTOM NOTES & INSTRUCTIONS BANNER */}
        {/* ========================================================================= */}
        <div className="px-4 py-2 bg-slate-800/80 border-b border-slate-700 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="font-bold text-slate-300 shrink-0 flex items-center gap-1">
              <FileText className="w-3.5 h-3.5 text-indigo-400" /> Sipariş Notu / Talimat:
            </span>
            {isEditingInstructions ? (
              <div className="flex items-center gap-2 flex-1">
                <input
                  type="text"
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  placeholder="Tedarikçiye iletilecek özel teslimat, koli veya kalite talimatı..."
                  className="flex-1 px-2.5 py-1 text-xs bg-slate-900 text-white border border-indigo-500 rounded-lg focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={handleSaveNotesToDb}
                  disabled={isSavingNotes}
                  className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Save className="w-3 h-3" /> Kaydet
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingInstructions(false)}
                  className="px-2 py-1 bg-slate-700 text-slate-200 rounded-lg text-xs font-bold cursor-pointer"
                >
                  İptal
                </button>
              </div>
            ) : (
              <span className="text-slate-300 truncate italic">
                {customInstructions ? `"${customInstructions}"` : 'Özel talimat eklenmemiş (Standart şartlar geçerli)'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {sizedGroups.length > 0 && (
              <button
                type="button"
                onClick={() => handleOpenMatrixEditor(sizedGroups[0])}
                className="px-2.5 py-1 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/40 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer"
              >
                <Sliders className="w-3 h-3 text-indigo-400" />
                <span>Beden Dağılımını Ayarla</span>
              </button>
            )}
            {!isEditingInstructions && (
              <button
                type="button"
                onClick={() => setIsEditingInstructions(true)}
                className="px-2 py-1 text-indigo-400 hover:bg-indigo-950/50 rounded-md text-[11px] font-bold flex items-center gap-1 cursor-pointer shrink-0"
              >
                <Edit3 className="w-3 h-3" /> Notu Düzenle
              </button>
            )}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* DOCUMENT PREVIEW CONTAINER (SCROLLABLE) */}
        {/* ========================================================================= */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-950/60 flex justify-center">
          {loading ? (
            <div className="py-20 text-center space-y-3">
              <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs font-bold text-slate-400">Sipariş formu hazırlanıyor...</p>
            </div>
          ) : !order ? (
            <div className="py-20 text-center text-slate-400">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 text-rose-500" />
              <p className="text-xs font-bold">Sipariş kaydı bulunamadı.</p>
            </div>
          ) : (
            /* PRINTABLE PAPER CANVAS (A4 Ratio: 210mm x 297mm) */
            <div
              ref={printContentRef}
              id="purchase-order-printable-canvas"
              className="w-full max-w-[210mm] min-h-[297mm] bg-white text-slate-900 shadow-2xl border border-slate-300 p-6 sm:p-8 space-y-4 text-xs select-text box-border"
              style={{
                fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
                color: '#0f172a',
                backgroundColor: '#ffffff'
              }}
            >
              {/* PRINT CSS STYLES */}
              <style dangerouslySetInnerHTML={{ __html: `
                @media print {
                  body {
                    margin: 0 !important;
                    padding: 0 !important;
                    background: #ffffff !important;
                  }
                  #purchase-order-printable-canvas {
                    width: 100% !important;
                    max-width: 100% !important;
                    min-height: auto !important;
                    border: none !important;
                    box-shadow: none !important;
                    padding: 4mm 6mm !important;
                    margin: 0 !important;
                  }
                  .no-print {
                    display: none !important;
                  }
                }
              `}} />

              {/* ================================================================= */}
              {/* TEMPLATE 1: RESMİ MEKTUP (OFFICIAL LETTER & CONTRACT) */}
              {/* ================================================================= */}
              {activeTemplate === 'official' && (
                <div className="space-y-4">
                  {/* FORM HEADER: LOGO & COMPANY INFO & ORDER BADGES */}
                  <div className="border-b-2 border-slate-900 pb-3 flex flex-wrap items-start justify-between gap-4">
                    {/* Left: Buyer Company Info */}
                    <div className="flex-1 min-w-[220px]">
                      <div className="flex items-center gap-2 mb-1">
                        {companySettings?.logo ? (
                          <img
                            src={companySettings.logo}
                            alt="Logo"
                            className="h-10 w-auto max-w-[140px] object-contain"
                            crossOrigin="anonymous"
                          />
                        ) : (
                          <div className="w-8 h-8 bg-slate-900 text-white rounded-lg flex items-center justify-center font-black text-sm tracking-wider">
                            {companyName.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <h1 className="text-base font-black tracking-tight text-slate-900 uppercase">
                            {companyTitle}
                          </h1>
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                            Satınalma & Tedarik Yönetimi
                          </p>
                        </div>
                      </div>

                      <div className="text-[10px] text-slate-600 space-y-0.5 mt-1 leading-tight">
                        {companySettings?.address && <p>{companySettings.address} {companySettings.city ? `- ${companySettings.city}` : ''}</p>}
                        <p>
                          {companySettings?.taxOffice && <span>V.D.: {companySettings.taxOffice} </span>}
                          {companySettings?.taxNumber && <span>/ V.No: {companySettings.taxNumber}</span>}
                        </p>
                        <p>
                          {companySettings?.phone && <span>Tel: {companySettings.phone} </span>}
                          {companySettings?.email && <span>| E-Posta: {companySettings.email}</span>}
                        </p>
                      </div>
                    </div>

                    {/* Right: PO Document Metadata Box */}
                    <div className="text-right min-w-[180px]">
                      <div className="inline-block bg-slate-900 text-white px-3 py-1 rounded text-center mb-1">
                        <span className="text-[11px] font-black tracking-wider uppercase">
                          SATINALMA SİPARİŞİ
                        </span>
                        <span className="block text-[8px] font-mono tracking-widest text-slate-300">PURCHASE ORDER & CONTRACT</span>
                      </div>

                      <div className="text-[10px] space-y-0.5 text-slate-800">
                        <p className="font-mono font-black text-xs text-indigo-900">
                          Sipariş No: <span className="font-black underline">{order.orderNumber}</span>
                        </p>
                        <p>
                          <span className="font-bold text-slate-500">Sipariş Tarihi:</span>{' '}
                          <span className="font-mono font-bold">
                            {order.date ? new Date(order.date).toLocaleDateString('tr-TR') : '-'}
                          </span>
                        </p>
                        <p className="bg-amber-50 border border-amber-300 px-1.5 py-0.5 rounded text-amber-900 font-bold inline-block mt-0.5">
                          Termin / Teslim: {order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString('tr-TR') : 'ACİL SEVKİYAT'}
                        </p>
                        {order.currency && (
                          <p className="text-[9px] text-slate-500 font-bold">
                            Para Birimi: <span className="text-slate-900">{order.currency}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* FORMAL COVER LETTER INTRO */}
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-700 leading-relaxed">
                    <p className="font-bold text-slate-900 mb-0.5">Sayın {supplier?.name || 'Tedarikçi Yetkilisi'},</p>
                    <p>
                      Aşağıda kod, renk, teknik detay ve <b>beden asorti dağılımı</b> belirtilen malzemelerin, belirtilen termin tarihinde eksiksiz, 
                      kalite standartlarımıza ve numune onayına uygun olarak fabrikamıza sevk edilmesini rica ederiz.
                    </p>
                  </div>

                  {/* SUPPLIER & DELIVERY PARTY BOXES */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* Supplier Box */}
                    <div className="border border-slate-300 rounded-lg p-2.5 bg-slate-50/70">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-1 mb-1.5">
                        <span className="text-[9px] font-black uppercase text-indigo-900 tracking-wider flex items-center gap-1">
                          <Building2 className="w-3 h-3 text-indigo-700" /> TEDARİKÇİ / SATICI FİRMA
                        </span>
                        <span className="text-[9px] font-bold text-slate-400">Cari Kodu: {supplier?.code || '-'}</span>
                      </div>
                      <div className="space-y-0.5 text-[10px]">
                        <p className="font-black text-slate-900 text-[11px] leading-tight">
                          {supplier?.name || 'Belirtilmemiş Tedarikçi'}
                        </p>
                        {supplier?.contactPerson && (
                          <p className="text-slate-700 font-semibold">Yetkili: {supplier.contactPerson}</p>
                        )}
                        {supplier?.phone && (
                          <p className="text-slate-600">Tel: {supplier.phone}</p>
                        )}
                        {supplier?.email && (
                          <p className="text-slate-600">E-Posta: {supplier.email}</p>
                        )}
                        {supplier?.taxNumber && (
                          <p className="text-slate-600">
                            V.D.: {supplier.taxOffice || '-'} / V.No: {supplier.taxNumber}
                          </p>
                        )}
                        {supplier?.address && (
                          <p className="text-slate-600 line-clamp-2">Adres: {supplier.address}</p>
                        )}
                      </div>
                    </div>

                    {/* Delivery / Shipping Destination Box */}
                    <div className="border border-slate-300 rounded-lg p-2.5 bg-slate-50/70">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-1 mb-1.5">
                        <span className="text-[9px] font-black uppercase text-slate-900 tracking-wider flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-slate-700" /> TESLİMAT & FATURA BİLGİSİ
                        </span>
                        <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 px-1 py-0.2 rounded">
                          Fabrika Giriş Deposu
                        </span>
                      </div>
                      <div className="space-y-0.5 text-[10px]">
                        <p className="font-black text-slate-900 leading-tight">
                          {companyTitle}
                        </p>
                        <p className="text-slate-600">
                          Teslimat Deposu: {companySettings?.address || 'Fabrika Giriş Deposu'}
                        </p>
                        <p className="text-slate-600">
                          İl / İlçe: {companySettings?.city || 'İstanbul'}
                        </p>
                        <p className="text-slate-600">
                          Sipariş Sorumlusu: Satınalma Departmanı
                        </p>
                        <p className="text-slate-600">
                          İrtibat: {companySettings?.phone || '-'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* ASORTİ & BEDEN DAĞILIM MATRİSİ */}
                  {hasSizedItems && (
                    <div className="border border-indigo-200 rounded-lg overflow-hidden">
                      <div className="bg-indigo-900 text-white px-3 py-1.5 flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Boxes className="w-3.5 h-3.5 text-indigo-300" />
                          <span className="text-[10px] font-black uppercase tracking-wider">
                            RENK & BEDEN ASORTİ DAĞILIM MATRİSİ
                          </span>
                        </div>
                        <span className="text-[9px] font-bold text-indigo-200">
                          Toplam: {totalSizedQuantity.toLocaleString('tr-TR')} Çift
                        </span>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-center border-collapse text-[10px]">
                          <thead className="bg-indigo-50 border-b border-indigo-200 text-indigo-950 font-black">
                            <tr>
                              <th className="p-1.5 text-left border-r border-indigo-200 min-w-[130px]">Ürün / Malzeme Adı</th>
                              <th className="p-1.5 border-r border-indigo-200 min-w-[60px]">Renk</th>
                              {uniqueSizes.map(size => (
                                <th key={size} className="p-1.5 border-r border-indigo-200 min-w-[28px] font-mono text-[11px] bg-indigo-100/70">
                                  {size}
                                </th>
                              ))}
                              <th className="p-1.5 border-r border-indigo-200 bg-indigo-100 min-w-[50px]">Top. Çift</th>
                              <th className="p-1.5 border-r border-indigo-200 min-w-[55px] text-right">Birim Fiyat</th>
                              <th className="p-1.5 min-w-[65px] text-right bg-indigo-100/50">Tutar</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 font-medium">
                            {sizedGroups.map((g, idx) => (
                              <tr key={idx} className={idx % 2 === 1 ? "bg-slate-50" : "bg-white"}>
                                <td className="p-1.5 text-left border-r border-slate-200">
                                  <div className="font-bold text-slate-900">{g.productName}</div>
                                  <div className="text-[8px] font-mono text-slate-500">{g.productCode}</div>
                                  {g.moldCode && (
                                    <div className="text-[8px] font-bold text-indigo-700">Kalıp: {g.moldCode}</div>
                                  )}
                                </td>
                                <td className="p-1.5 border-r border-slate-200 font-bold uppercase text-slate-800">
                                  {g.color}
                                </td>
                                {uniqueSizes.map(size => {
                                  const qty = g.sizeQuantities[size];
                                  return (
                                    <td 
                                      key={size} 
                                      className={cn(
                                        "p-1.5 border-r border-slate-200 font-mono text-[10px]",
                                        qty ? "font-black text-slate-900 bg-indigo-50/40" : "text-slate-300"
                                      )}
                                    >
                                      {qty ? qty.toLocaleString('tr-TR') : '-'}
                                    </td>
                                  );
                                })}
                                <td className="p-1.5 border-r border-slate-200 font-black font-mono text-indigo-900 bg-indigo-50/80">
                                  {g.totalQuantity.toLocaleString('tr-TR')} {g.unit}
                                </td>
                                <td className="p-1.5 border-r border-slate-200 text-right font-mono font-bold text-slate-700">
                                  {g.unitPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {currency === 'TRY' ? '₺' : currency}
                                </td>
                                <td className="p-1.5 text-right font-mono font-black text-slate-900 bg-indigo-50/30">
                                  {g.totalAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {currency === 'TRY' ? '₺' : currency}
                                </td>
                              </tr>
                            ))}

                            {/* Totals Row */}
                            <tr className="bg-indigo-100/90 font-black text-indigo-950 border-t-2 border-indigo-300">
                              <td colSpan={2} className="p-1.5 text-left border-r border-indigo-300 uppercase tracking-wider">
                                BEDEN TOPLAMLARI
                              </td>
                              {uniqueSizes.map(size => (
                                <td key={size} className="p-1.5 border-r border-indigo-300 font-mono text-[11px]">
                                  {sizeColumnTotals[size] ? sizeColumnTotals[size].toLocaleString('tr-TR') : '-'}
                                </td>
                              ))}
                              <td className="p-1.5 border-r border-indigo-300 font-mono text-[11px] text-indigo-950">
                                {totalSizedQuantity.toLocaleString('tr-TR')} Çift
                              </td>
                              <td colSpan={2} className="p-1.5 text-right font-mono text-[11px]">
                                {sizedGroups.reduce((acc, g) => acc + g.totalAmount, 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {currency === 'TRY' ? '₺' : currency}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* DİĞER MALZEME LİSTESİ */}
                  {nonSizedItems.length > 0 && (
                    <div className="border border-slate-300 rounded-lg overflow-hidden">
                      <div className="bg-slate-800 text-white px-3 py-1.5 flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-wider">
                          {hasSizedItems ? 'DİĞER MALZEME & HAMMADDE KALEMLERİ' : 'SİPARİŞ KALEMLERİ LİSTESİ'}
                        </span>
                        <span className="text-[9px] font-bold text-slate-300">
                          {nonSizedItems.length} Kalem Malzeme
                        </span>
                      </div>

                      <table className="w-full text-left border-collapse text-[10px]">
                        <thead className="bg-slate-100 border-b border-slate-300 font-black text-slate-800">
                          <tr>
                            <th className="p-1.5 w-8 text-center">#</th>
                            <th className="p-1.5">Malzeme Kodu & Adı</th>
                            <th className="p-1.5 text-center">Renk / Özellik</th>
                            <th className="p-1.5 text-center">Miktar</th>
                            <th className="p-1.5 text-center">Birim</th>
                            <th className="p-1.5 text-right">Birim Fiyat</th>
                            <th className="p-1.5 text-center">KDV %</th>
                            <th className="p-1.5 text-right">Tutar</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {nonSizedItems.map((item, idx) => {
                            const price = Number(item.unitPrice || 0);
                            const qty = Number(item.quantity || 0);
                            const total = Number(item.total || qty * price);
                            return (
                              <tr key={idx} className={idx % 2 === 1 ? "bg-slate-50" : "bg-white"}>
                                <td className="p-1.5 text-center text-slate-400 font-mono">{idx + 1}</td>
                                <td className="p-1.5">
                                  <div className="font-bold text-slate-900">{item.productName}</div>
                                  <div className="text-[8px] font-mono text-slate-500">{item.productCode}</div>
                                </td>
                                <td className="p-1.5 text-center font-bold uppercase text-slate-700">
                                  {item.color || '-'}
                                </td>
                                <td className="p-1.5 text-center font-black font-mono text-slate-900">
                                  {qty.toLocaleString('tr-TR')}
                                </td>
                                <td className="p-1.5 text-center text-slate-600 font-bold">
                                  {item.unit}
                                </td>
                                <td className="p-1.5 text-right font-mono font-bold text-slate-800">
                                  {price.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {currency === 'TRY' ? '₺' : currency}
                                </td>
                                <td className="p-1.5 text-center font-mono text-slate-600">
                                  %{item.taxRate || 20}
                                </td>
                                <td className="p-1.5 text-right font-mono font-black text-slate-900">
                                  {total.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {currency === 'TRY' ? '₺' : currency}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* FINANCIAL SUMMARY & AMOUNT IN TURKISH WORDS */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    {/* Left: Amount in Words & Notes */}
                    <div className="space-y-2">
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                        <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">
                          Yalnız / Yazıyla Tutar:
                        </div>
                        <div className="text-[11px] font-black text-slate-900 font-mono tracking-tight">
                          # {numberToTurkishWords(order.grandTotal || 0)} #
                        </div>
                      </div>

                      {customInstructions && (
                        <div className="bg-amber-50/80 border border-amber-300 rounded-lg p-2 text-[10px] text-amber-950">
                          <span className="font-black uppercase tracking-wider block text-[9px] text-amber-900 mb-0.5">
                            Özel Sipariş Talimatı:
                          </span>
                          <p className="font-medium italic leading-relaxed">{customInstructions}</p>
                        </div>
                      )}
                    </div>

                    {/* Right: Tax & Grand Total Table */}
                    <div className="border border-slate-300 rounded-lg overflow-hidden bg-slate-50/50">
                      <div className="p-2 space-y-1 text-[11px]">
                        <div className="flex justify-between text-slate-600">
                          <span>Ara Toplam (Matrah):</span>
                          <span className="font-mono font-bold text-slate-900">
                            {(order.totalAmount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {currency === 'TRY' ? '₺' : currency}
                          </span>
                        </div>
                        {order.discountAmount > 0 && (
                          <div className="flex justify-between text-rose-600">
                            <span>İskonto Tutarı:</span>
                            <span className="font-mono font-bold">
                              -{(order.discountAmount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {currency === 'TRY' ? '₺' : currency}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between text-slate-600">
                          <span>Hesaplanan KDV (%20):</span>
                          <span className="font-mono font-bold text-slate-900">
                            {(order.taxAmount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {currency === 'TRY' ? '₺' : currency}
                          </span>
                        </div>
                        <div className="border-t-2 border-slate-900 pt-1 flex justify-between text-slate-950 font-black text-xs bg-slate-100 -mx-2 -mb-2 p-2">
                          <span className="uppercase tracking-wider">GENEL TOPLAM:</span>
                          <span className="font-mono text-sm text-indigo-950">
                            {(order.grandTotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {currency === 'TRY' ? '₺' : currency}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* TERMS & CONDITIONS (RESMİ TEDARİK ŞARTLARI) */}
                  <div className="border border-slate-200 rounded-lg p-2.5 bg-slate-50/50 space-y-1 text-[9px] text-slate-600 leading-tight">
                    <p className="font-black text-slate-800 uppercase tracking-wider text-[10px]">
                      SİPARİŞ, TESLİMAT VE KALİTE KABUL ŞARTLARI:
                    </p>
                    <ol className="list-decimal pl-4 space-y-0.5">
                      <li>Tüm sevkiyat kolilerinin üzerinde <b>Sipariş No, Model Kodu, Renk ve Beden Asorti Dağılımını</b> gösteren etiketler yer almalıdır.</li>
                      <li>Teslim edilen malzemelerin kalite ve sertlik (Shore) değerleri, onaylı referans numune ile birebir aynı olmalıdır. Hatalı ve tolerans dışı ürünler iade edilir.</li>
                      <li>İrsaliye ve e-Faturalarda sipariş numaramız (<b>{order.orderNumber}</b>) mutlaka belirtilmelidir.</li>
                      <li>Termin gecikmelerinde en az 48 saat öncesinden Satınalma Departmanımıza yazılı bilgi verilmesi zorunludur.</li>
                    </ol>
                  </div>

                  {/* SIGNATURE & APPROVAL STAMP BOXES */}
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div className="border border-slate-300 rounded-lg p-3 text-center min-h-[90px] flex flex-col justify-between bg-white">
                      <div>
                        <p className="font-black text-[10px] text-slate-900 uppercase">SİPARİŞ VEREN / ALICI FİRMA ONAYI</p>
                        <p className="text-[9px] text-slate-500 font-bold">{companyTitle}</p>
                      </div>
                      <div className="border-t border-dashed border-slate-300 pt-1 text-[8px] text-slate-400">
                        Yetkili Kaşe & İmza
                      </div>
                    </div>

                    <div className="border border-slate-300 rounded-lg p-3 text-center min-h-[90px] flex flex-col justify-between bg-white">
                      <div>
                        <p className="font-black text-[10px] text-slate-900 uppercase">SİPARİŞİ KABUL EDEN / TEDARİKÇİ TEYİDİ</p>
                        <p className="text-[9px] text-slate-500 font-bold">{supplier?.name || 'Tedarikçi Firma'}</p>
                      </div>
                      <div className="border-t border-dashed border-slate-300 pt-1 text-[8px] text-slate-400">
                        Kaşe, İmza & Teyit Tarihi
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ================================================================= */}
              {/* TEMPLATE 2: ASORTİ / BEDEN MATRİSİ ODAKLI İMALAT FORMU */}
              {/* ================================================================= */}
              {activeTemplate === 'matrix_focused' && (
                <div className="space-y-4">
                  {/* High Impact Matrix Header */}
                  <div className="border-b-4 border-indigo-900 pb-3 flex items-start justify-between">
                    <div>
                      <div className="inline-block bg-indigo-900 text-white px-3 py-1 rounded-lg text-xs font-black tracking-wider uppercase mb-1">
                        İMALAT & TEDARİKÇİ ASORTİ MATRİS FORMU
                      </div>
                      <h1 className="text-lg font-black text-slate-900 uppercase tracking-tight">
                        {companyTitle}
                      </h1>
                      <p className="text-xs font-bold text-indigo-700">
                        Taban, Saya & Yarı Mamul İmalat / Sevkiyat Asorti Planı
                      </p>
                    </div>

                    <div className="text-right space-y-1">
                      <div className="text-xs font-mono font-black text-indigo-950 bg-indigo-50 border border-indigo-200 px-3 py-1 rounded-lg inline-block">
                        SİPARİŞ NO: {order.orderNumber}
                      </div>
                      <p className="text-[10px] font-bold text-slate-600">
                        Tarih: {order.date ? new Date(order.date).toLocaleDateString('tr-TR') : '-'}
                      </p>
                      <p className="text-[10px] font-black text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded inline-block">
                        Termin: {order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString('tr-TR') : 'ACİL İMALAT'}
                      </p>
                    </div>
                  </div>

                  {/* Supplier & Model Information Cards */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="border border-slate-300 rounded-xl p-3 bg-slate-50">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1">
                        TEDARİKÇİ / İMALATÇI ATÖLYE
                      </span>
                      <p className="text-sm font-black text-slate-900">{supplier?.name || 'Tedarikçi Firma'}</p>
                      {supplier?.contactPerson && <p className="text-xs text-slate-700">Yetkili: {supplier.contactPerson}</p>}
                      {supplier?.phone && <p className="text-xs text-slate-600">Tel: {supplier.phone}</p>}
                    </div>

                    <div className="border border-indigo-200 rounded-xl p-3 bg-indigo-50/50">
                      <span className="text-[10px] font-black text-indigo-900 uppercase tracking-wider block mb-1">
                        TOPLAM SİPARİŞ HACMİ
                      </span>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-black text-indigo-950 font-mono">
                          {totalSizedQuantity.toLocaleString('tr-TR')}
                        </span>
                        <span className="text-xs font-bold text-indigo-700 uppercase">Çift Bedenli Malzeme</span>
                      </div>
                      {sizedGroups[0]?.moldGroup && (
                        <p className="text-xs font-bold text-indigo-900 mt-1">
                          Seri: {sizedGroups[0].moldGroup}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* LARGE HIGH-CONTRAST SIZE MATRIX TABLE */}
                  {hasSizedItems ? (
                    sizedGroups.map((g, gIdx) => (
                      <div key={gIdx} className="border-2 border-slate-900 rounded-xl overflow-hidden shadow-sm">
                        {/* Group Header */}
                        <div className="bg-slate-900 text-white p-3 flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-black uppercase tracking-wide text-amber-400">
                                {g.productName}
                              </span>
                              <span className="bg-slate-800 text-slate-200 px-2 py-0.5 rounded text-[10px] font-mono font-bold">
                                Kod: {g.productCode}
                              </span>
                            </div>
                            <div className="text-xs text-slate-300 mt-0.5 flex items-center gap-3">
                              <span>Renk: <b className="text-white uppercase">{g.color}</b></span>
                              {g.moldCode && <span>Kalıp No: <b className="text-white">{g.moldCode}</b></span>}
                              {g.moldGroup && <span>Seri: <b className="text-white">{g.moldGroup}</b></span>}
                            </div>
                          </div>

                          <div className="text-right">
                            <span className="text-xs text-slate-400 block font-bold">Parti Miktarı</span>
                            <span className="text-lg font-black font-mono text-emerald-400">
                              {g.totalQuantity.toLocaleString('tr-TR')} {g.unit}
                            </span>
                          </div>
                        </div>

                        {/* Large Matrix Grid */}
                        <div className="p-3 bg-white">
                          <div className="grid grid-cols-6 sm:grid-cols-8 gap-2 text-center">
                            {uniqueSizes.map(size => {
                              const qty = g.sizeQuantities[size] || 0;
                              return (
                                <div 
                                  key={size} 
                                  className={cn(
                                    "p-2.5 rounded-lg border-2 flex flex-col items-center justify-center transition-all",
                                    qty > 0 
                                      ? "border-indigo-600 bg-indigo-50/70 text-indigo-950" 
                                      : "border-slate-200 bg-slate-50 text-slate-400 opacity-60"
                                  )}
                                >
                                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-600 mb-0.5">
                                    NO {size}
                                  </span>
                                  <span className="text-lg font-black font-mono">
                                    {qty > 0 ? `${qty.toLocaleString('tr-TR')} Çift` : '-'}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Packaging & Quality Check Footer */}
                        <div className="bg-slate-100 p-2.5 border-t border-slate-300 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                          <div className="flex items-center gap-2">
                            <PackageCheck className="w-4 h-4 text-slate-700" />
                            <span className="font-bold text-slate-800">
                              Koli / Paket Dağılımı:
                            </span>
                            <span className="font-mono font-black text-indigo-900">
                              {Math.floor(g.totalQuantity / 12)} Koli (12'li Asorti) {g.totalQuantity % 12 > 0 ? `+ ${g.totalQuantity % 12} Çift Tekil` : ''}
                            </span>
                          </div>

                          <div className="text-slate-600 font-bold">
                            Birim Fiyat: {g.unitPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺ | Toplam: {g.totalAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-8 border border-dashed border-slate-300 rounded-xl text-center text-slate-500">
                      Bu siparişte bedenli malzeme bulunmamaktadır.
                    </div>
                  )}

                  {/* Quality & Production Inspection Specifications */}
                  <div className="border border-slate-300 rounded-xl p-3 bg-slate-50 space-y-2">
                    <span className="text-xs font-black text-slate-900 uppercase tracking-wider block">
                      İMALAT VE KABUL KALİTE PARAMETRELERİ:
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
                      <div className="p-2 bg-white border border-slate-200 rounded-lg">
                        <span className="font-bold text-slate-500 block">Kalıp Numarası:</span>
                        <span className="font-black text-slate-900">{sizedGroups[0]?.moldCode || '018 Standart'}</span>
                      </div>
                      <div className="p-2 bg-white border border-slate-200 rounded-lg">
                        <span className="font-bold text-slate-500 block">Shore Sertlik Değeri:</span>
                        <span className="font-black text-slate-900">55 - 60 Shore A</span>
                      </div>
                      <div className="p-2 bg-white border border-slate-200 rounded-lg">
                        <span className="font-bold text-slate-500 block">Yüzey & Çapak:</span>
                        <span className="font-black text-slate-900">Çapaksız / Temiz Enjeksiyon</span>
                      </div>
                      <div className="p-2 bg-white border border-slate-200 rounded-lg">
                        <span className="font-bold text-slate-500 block">Eşleşme:</span>
                        <span className="font-black text-slate-900">Sağ - Sol Çift Bağlı</span>
                      </div>
                    </div>
                  </div>

                  {/* Workshop Double Signatures */}
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div className="border border-slate-300 rounded-xl p-3 text-center min-h-[90px] flex flex-col justify-between">
                      <p className="font-black text-[11px] text-slate-900">TESLİM EDEN (İMALATÇI / TEDARİKÇİ)</p>
                      <p className="text-[10px] text-slate-500">Ad / Soyad / İmza</p>
                    </div>
                    <div className="border border-slate-300 rounded-xl p-3 text-center min-h-[90px] flex flex-col justify-between">
                      <p className="font-black text-[11px] text-slate-900">TESLİM ALAN (FABRİKA DEPO / KALİTE KONTROL)</p>
                      <p className="text-[10px] text-slate-500">Ad / Soyad / İmza / Kaşe</p>
                    </div>
                  </div>
                </div>
              )}

              {/* ================================================================= */}
              {/* TEMPLATE 3: ATÖLYE FİŞİ (COMPACT WORKSHOP RECEIPT) */}
              {/* ================================================================= */}
              {activeTemplate === 'compact' && (
                <div className="space-y-4">
                  {/* Workshop Barcode Header */}
                  <div className="border-b-2 border-slate-900 pb-2 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-black uppercase text-indigo-700 tracking-wider">
                        PRO-ERP İMALAT TAKİP FİŞİ
                      </span>
                      <h1 className="text-base font-black text-slate-900 uppercase">
                        ATÖLYE & DEPO TESLİM ÇİZELGESİ
                      </h1>
                      <p className="text-[10px] text-slate-600 font-bold">
                        Tedarikçi: {supplier?.name || 'Genel Tedarikçi'} | Sipariş: {order.orderNumber}
                      </p>
                    </div>

                    <div className="text-right flex flex-col items-end">
                      <BarcodeSvg value={order.orderNumber || 'SAS-000000'} height={28} />
                      <span className="text-[9px] font-mono font-bold text-slate-600 mt-0.5">
                        Termin: {order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString('tr-TR') : 'ACİL'}
                      </span>
                    </div>
                  </div>

                  {/* Fast Physical Counting Checklist */}
                  {hasSizedItems && sizedGroups.map((g, idx) => (
                    <div key={idx} className="border border-slate-300 rounded-lg overflow-hidden">
                      <div className="bg-slate-800 text-white px-3 py-1.5 flex items-center justify-between text-[11px]">
                        <span className="font-black uppercase">{g.productName} ({g.color})</span>
                        <span className="font-mono font-black text-amber-400">Toplam: {g.totalQuantity} Çift</span>
                      </div>

                      <div className="p-3 bg-white">
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                          Fiziki Sayım ve Kabul Onay Kutucukları:
                        </div>
                        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                          {uniqueSizes.map(sz => {
                            const qty = g.sizeQuantities[sz] || 0;
                            return (
                              <div key={sz} className="p-2 border border-slate-300 rounded flex items-center gap-2 bg-slate-50">
                                <div className="w-4 h-4 border-2 border-slate-400 rounded-xs flex items-center justify-center text-transparent font-bold text-xs">
                                  ✓
                                </div>
                                <div className="text-left">
                                  <div className="text-[10px] font-bold text-slate-500">No {sz}</div>
                                  <div className="text-xs font-black font-mono text-slate-900">{qty} Çift</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Stage Checkpoints */}
                  <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 space-y-2">
                    <span className="text-[10px] font-black uppercase text-slate-700 tracking-wider block">
                      ATÖLYE İSTASYON ONAYLARI:
                    </span>
                    <div className="grid grid-cols-4 gap-2 text-center text-[10px]">
                      <div className="p-2 border border-slate-300 rounded bg-white">
                        <span className="font-bold text-slate-600 block">1. Depo Giriş</span>
                        <span className="text-[9px] text-slate-400">[ ] Kabul Edildi</span>
                      </div>
                      <div className="p-2 border border-slate-300 rounded bg-white">
                        <span className="font-bold text-slate-600 block">2. Kalite Kontrol</span>
                        <span className="text-[9px] text-slate-400">[ ] Onaylandı</span>
                      </div>
                      <div className="p-2 border border-slate-300 rounded bg-white">
                        <span className="font-bold text-slate-600 block">3. Kesim / Saya</span>
                        <span className="text-[9px] text-slate-400">[ ] Sevk Edildi</span>
                      </div>
                      <div className="p-2 border border-slate-300 rounded bg-white">
                        <span className="font-bold text-slate-600 block">4. Montaj Bandı</span>
                        <span className="text-[9px] text-slate-400">[ ] Teslim Edildi</span>
                      </div>
                    </div>
                  </div>

                  {/* Compact Signatures */}
                  <div className="grid grid-cols-2 gap-3 pt-1 text-[10px]">
                    <div className="border border-slate-300 rounded p-2 text-center">
                      <p className="font-bold text-slate-800">Depo Sorumlusu İmzası</p>
                    </div>
                    <div className="border border-slate-300 rounded p-2 text-center">
                      <p className="font-bold text-slate-800">Atölye Şefi / Usta İmzası</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL: BEDEN / ASORTİ DAĞILIMINI DÜZENLEME & ŞABLON SEÇME */}
      {/* ========================================================================= */}
      {isMatrixEditorOpen && matrixEditingTarget && (
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
                onClick={() => setIsMatrixEditorOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-slate-800/80 rounded-xl space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Malzeme:</span>
                <span className="font-black text-white">{matrixEditingTarget.productName} ({matrixEditingTarget.color})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Hedef Toplam Çift:</span>
                <span className="font-mono font-black text-emerald-400 text-sm">{matrixEditingTarget.totalQuantity.toLocaleString('tr-TR')} Çift</span>
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
              const diff = matrixEditingTarget.totalQuantity - currentSum;
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
                onClick={() => setIsMatrixEditorOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={() => handleSaveMatrixCustomization(false)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-xs font-bold"
              >
                Önizlemeye Uygula
              </button>
              <button
                type="button"
                disabled={isApplyingMatrixToDb}
                onClick={() => handleSaveMatrixCustomization(true)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-black shadow-md shadow-indigo-900/40"
              >
                {isApplyingMatrixToDb ? 'Kaydediliyor...' : 'Siparişi Güncelle & Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: TEDARİKÇİYE E-POSTA GÖNDERME */}
      {/* ========================================================================= */}
      {isEmailModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-3 bg-black/75 backdrop-blur-xs">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-5 space-y-4 text-white max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <Mail className="w-5 h-5 text-blue-400" />
                <h3 className="text-sm font-black text-white">
                  Tedarikçiye E-Posta İle Sipariş Gönder
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsEmailModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs flex-1 min-h-0 overflow-y-auto">
              <div>
                <label className="font-bold text-slate-300 block mb-1">Alıcı Tedarikçi E-Posta:</label>
                <input
                  type="email"
                  value={emailRecipient}
                  onChange={(e) => setEmailRecipient(e.target.value)}
                  placeholder="tedarikci@firma.com"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-xs focus:outline-hidden focus:border-blue-500"
                />
              </div>

              <div>
                <label className="font-bold text-slate-300 block mb-1">E-Posta Konusu:</label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-bold text-xs focus:outline-hidden focus:border-blue-500"
                />
              </div>

              <div>
                <label className="font-bold text-slate-300 block mb-1">Mesaj Metni & Beden Dağılımı:</label>
                <textarea
                  rows={9}
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-slate-200 font-mono text-[11px] leading-relaxed focus:outline-hidden focus:border-blue-500 select-text"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={handleCopyEmail}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border border-slate-700"
              >
                {copiedEmail ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                <span>{copiedEmail ? 'Metin Kopyalandı!' : 'Metni Kopyala'}</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsEmailModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold"
                >
                  Kapat
                </button>
                <a
                  href={`mailto:${emailRecipient}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-md shadow-blue-900/30 transition-all"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Mail İstemcisinde Aç</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
