import {
  api,
  callOp,
  commit,
  type Mutation,
} from '../api/client';
import { roundUpQuantity } from '../lib/inventoryCalculator';
import type {
  WorkOrder,
  Order,
  OrderItem,
  OrderStatus,
  MrpCalculationResult,
  MrpRequirementItem,
  MaterialReadinessStatus,
} from '../types';

/**
 * MRP (Malzeme İhtiyaç Planlaması) motoru ve MRP kaynaklı satın alma emri
 * üretimi. productionService'ten bölündü (#46). Renk normalizasyon yardımcıları
 * da bu modülle birlikte taşındı.
 */

/**
 * Robust Turkish-aware color normalization and matching helper.
 * Handles casing (I/i/İ/ı), trailing spaces, and standardizes generic/universal indicators.
 */
export function normalizeColorKey(c?: string | null): string {
  if (!c) return '';
  const s = c.trim().toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');
  if (['genel', 'all', 'standart', 'tumu', 'tümü', 'hepsi', 'default', '-', 'yok', 'tanimsiz', 'yok/tanimsiz'].includes(s)) return '';
  return s;
}

export function colorsMatch(c1?: string | null, c2?: string | null): boolean {
  const n1 = normalizeColorKey(c1);
  const n2 = normalizeColorKey(c2);
  if (!n1 || !n2) return true; // If either is empty, generic or ALL, it matches!
  return n1 === n2;
}

export async function calculateMRP(targetWorkOrderIds?: number[]): Promise<MrpCalculationResult> {
  let workOrdersToAnalyze: WorkOrder[] = [];

  if (targetWorkOrderIds && targetWorkOrderIds.length > 0) {
    const fetched = await Promise.all(targetWorkOrderIds.map(woId => api.workOrders.get(woId)));
    workOrdersToAnalyze = fetched.filter((w): w is WorkOrder => Boolean(w) && w.status !== 'completed' && w.status !== 'cancelled');
  } else {
    // Analyze all active / pending work orders
    workOrdersToAnalyze = (await api.workOrders.list())
      .filter(w => w.status === 'pending' || w.status === 'in_progress');
  }

  const products = await api.products.list();
  const recipes = await api.recipes.list();
  const contacts = await api.contacts.list();
  const assortmentTemplates = await api.assortmentTemplates.list();
  const allOrders = await api.orders.list();
  const allOrderItems = await api.orderItems.list();

  const productMap = new Map(products.map(p => [p.id!, p]));
  const templateMap = new Map(assortmentTemplates.map(t => [t.id!, t]));
  const supplierMap = new Map(contacts.filter(c => c.type === 'supplier' || c.type === 'both').map(c => [c.id!, c.name]));
  const orderMap = new Map(allOrders.map(o => [o.id!, o]));

  // Identify active / open Purchase Orders (not cancelled)
  const activePurchaseOrders = allOrders.filter(o => o.type === 'purchase' && o.status !== 'cancelled');
  const activePOIds = new Set(activePurchaseOrders.map(o => o.id!));
  const activePurchaseOrderItems = allOrderItems.filter(i => activePOIds.has(i.orderId));

  // Helper to find best recipe for a work order
  const getRecipeForWO = (productId: number, color?: string) => {
    const allProductRecipes = recipes.filter(r => r.productId === productId);
    if (allProductRecipes.length === 0) return null;
    if (color) {
      const exactMatch = allProductRecipes.find(r => r.targetColor && r.targetColor.toLowerCase() === color.toLowerCase());
      if (exactMatch) return exactMatch;
    }
    const genericMatch = allProductRecipes.find(r => !r.targetColor || r.targetColor === 'all' || r.targetColor === 'Genel');
    if (genericMatch) return genericMatch;
    return allProductRecipes[0];
  };

  // Aggregate requirements per (rawMaterialId + color)
  const rawMaterialNeeds = new Map<string, {
    rawMaterialId: number;
    color?: string;
    isMatrixMatched?: boolean;
    requiredQuantity: number;
    sizeNeedsMap: Map<string, number>;
    affectedWorkOrderIds: number[];
  }>();

  for (const wo of workOrdersToAnalyze) {
    const recipe = getRecipeForWO(wo.productId, wo.color);
    if (!recipe || !recipe.ingredients || recipe.ingredients.length === 0) continue;

    // Resolve size breakdown of this work order
    let woSizes: { size: string; quantity: number }[] = [];
    if (wo.assortmentBreakdown && wo.assortmentBreakdown.length > 0) {
      woSizes = wo.assortmentBreakdown;
    } else if (wo.size && wo.size.trim() !== '') {
      woSizes = [{ size: wo.size.trim(), quantity: wo.quantity }];
    } else {
      const finishedProduct = productMap.get(wo.productId);
      if (finishedProduct?.assortment && finishedProduct.assortment.length > 0) {
        const totalAssort = finishedProduct.assortment.reduce((s, a) => s + (a.quantity || 0), 0);
        const ratio = totalAssort > 0 ? (wo.quantity / totalAssort) : 1;
        woSizes = finishedProduct.assortment.map(a => ({
          size: a.size,
          quantity: Math.round(a.quantity * ratio)
        }));
      } else if (finishedProduct?.assortmentTemplateId) {
        const tmpl = templateMap.get(finishedProduct.assortmentTemplateId);
        if (tmpl && tmpl.items.length > 0) {
          const totalAssort = tmpl.items.reduce((s, a) => s + (a.quantity || 0), 0);
          const ratio = totalAssort > 0 ? (wo.quantity / totalAssort) : 1;
          woSizes = tmpl.items.map(a => ({
            size: a.size,
            quantity: Math.round(a.quantity * ratio)
          }));
        }
      }
    }

    for (const ing of recipe.ingredients) {
      const rawProduct = productMap.get(ing.productId);
      if (!rawProduct) continue;

      const isSizeMatrix = Boolean(
        ing.isMatrixMatched ||
        rawProduct.hasSizeVariants ||
        rawProduct.isFootwear ||
        ['Taban', 'Mostra', 'Fuspet', 'Salpa', 'Saya', 'Kalıp'].includes(rawProduct.subType || '')
      );

      const totalIngNeeded = ing.quantity * wo.quantity;
      let ingColor = ing.color?.trim() || '';
      if (!ingColor) {
        const hasMultipleColors = rawProduct.colors && rawProduct.colors.length > 1;
        if (hasMultipleColors) {
          ingColor = wo.color?.trim() || '';
        } else if (rawProduct.colors && rawProduct.colors.length === 1 && normalizeColorKey(rawProduct.colors[0]) !== '') {
          ingColor = rawProduct.colors[0];
        } else {
          ingColor = ''; // Generic / universal color
        }
      }

      const key = `${ing.productId}__${normalizeColorKey(ingColor) || 'ALL'}`;

      let existing = rawMaterialNeeds.get(key);
      if (!existing) {
        existing = {
          rawMaterialId: ing.productId,
          color: ingColor || undefined,
          isMatrixMatched: isSizeMatrix,
          requiredQuantity: 0,
          sizeNeedsMap: new Map<string, number>(),
          affectedWorkOrderIds: []
        };
        rawMaterialNeeds.set(key, existing);
      }

      existing.requiredQuantity += totalIngNeeded;
      if (!existing.affectedWorkOrderIds.includes(wo.id!)) {
        existing.affectedWorkOrderIds.push(wo.id!);
      }

      if (isSizeMatrix && woSizes.length > 0) {
        existing.isMatrixMatched = true;
        for (const s of woSizes) {
          const sizeKey = s.size.trim();
          const sizeQtyNeeded = s.quantity * ing.quantity;
          existing.sizeNeedsMap.set(sizeKey, (existing.sizeNeedsMap.get(sizeKey) || 0) + sizeQtyNeeded);
        }
      }
    }
  }

  const mrpItems: MrpRequirementItem[] = [];
  let shortageCount = 0;
  let totalShortageCost = 0;

  for (const [key, data] of rawMaterialNeeds.entries()) {
    const rawProduct = productMap.get(data.rawMaterialId);
    if (!rawProduct) continue;

    let currentStock = 0;
    let onOrderQuantity = 0;
    let grossShortageQuantity = 0;
    let shortageQuantity = 0;
    let sizeBreakdownList: { size: string; required: number; currentStock: number; onOrderQuantity?: number; shortage: number }[] | undefined = undefined;

    const hasMatrix = data.sizeNeedsMap.size > 0;

    // Filter matching active purchase order items for this rawMaterialId and color
    const matchingPOItems = activePurchaseOrderItems.filter(poi => {
      if (poi.productId !== data.rawMaterialId) return false;
      if (!colorsMatch(poi.color, data.color)) {
        return false;
      }
      return true;
    });

    // Aggregate POs info for this item
    const activePOsForThisItem: {
      orderId: number;
      orderNumber: string;
      supplierName?: string;
      quantity: number;
      date: Date | string;
      status: OrderStatus;
    }[] = [];

    const poAggMap = new Map<number, number>();
    for (const poi of matchingPOItems) {
      const shipped = poi.shippedQuantity || 0;
      const invoiced = poi.invoicedQuantity || 0;
      const fulfilled = Math.max(shipped, invoiced);
      const remaining = Math.max(0, (poi.quantity || 0) - fulfilled);
      if (remaining > 0) {
        poAggMap.set(poi.orderId, (poAggMap.get(poi.orderId) || 0) + remaining);
      }
    }
    for (const [poId, qty] of poAggMap.entries()) {
      const po = orderMap.get(poId);
      if (po) {
        activePOsForThisItem.push({
          orderId: po.id!,
          orderNumber: po.orderNumber,
          supplierName: supplierMap.get(po.contactId) || 'Tedarikçi',
          quantity: qty,
          date: po.date,
          status: po.status
        });
      }
    }

    if (hasMatrix) {
      sizeBreakdownList = [];
      for (const [size, reqQtyForSize] of data.sizeNeedsMap.entries()) {
        let sizeStock = 0;
        if (rawProduct.variantBarcodes && rawProduct.variantBarcodes.length > 0) {
          const matchingVariants = rawProduct.variantBarcodes.filter(v => 
            colorsMatch(v.color, data.color) &&
            (v.size && v.size.toString().trim() === size.toString().trim())
          );
          sizeStock = matchingVariants.reduce((sum, v) => sum + (v.stock || 0), 0);
        }
        sizeStock = roundUpQuantity(sizeStock, 2);

        // Find open PO quantity for this specific size
        const sizeMatchingPOItems = matchingPOItems.filter(poi => 
          poi.size && poi.size.toString().trim() === size.toString().trim()
        );
        const sizeOnOrder = roundUpQuantity(
          sizeMatchingPOItems.reduce((sum, poi) => {
            const shipped = poi.shippedQuantity || 0;
            const invoiced = poi.invoicedQuantity || 0;
            const fulfilled = Math.max(shipped, invoiced);
            return sum + Math.max(0, (poi.quantity || 0) - fulfilled);
          }, 0),
          2
        );

        const roundedReq = roundUpQuantity(reqQtyForSize, 2);
        const sizeShortage = Math.max(0, roundUpQuantity(roundedReq - sizeStock - sizeOnOrder, 2));

        sizeBreakdownList.push({
          size,
          required: roundedReq,
          currentStock: sizeStock,
          onOrderQuantity: sizeOnOrder,
          shortage: sizeShortage
        });
      }

      // Sort size breakdown naturally
      sizeBreakdownList.sort((a, b) => {
        const na = parseFloat(a.size);
        const nb = parseFloat(b.size);
        if (!isNaN(na) && !isNaN(nb)) return na - nb;
        return a.size.localeCompare(b.size);
      });

      // Totals from size breakdown
      const totalReqFromSizes = sizeBreakdownList.reduce((s, x) => s + x.required, 0);
      const totalStockFromSizes = sizeBreakdownList.reduce((s, x) => s + x.currentStock, 0);
      const totalOnOrderFromSizes = sizeBreakdownList.reduce((s, x) => s + (x.onOrderQuantity || 0), 0);

      // Check if there is total warehouse inventory (e.g. from waybill / invoice) that wasn't barcode-split or exceeds variant stock
      const totalWarehouseStock = roundUpQuantity(rawProduct.stock || 0, 2);
      let unallocatedStock = Math.max(0, roundUpQuantity(totalWarehouseStock - totalStockFromSizes, 2));

      // If unallocated stock exists, fulfill shortages across sizes
      if (unallocatedStock > 0) {
        for (const sb of sizeBreakdownList) {
          if (sb.shortage > 0 && unallocatedStock > 0) {
            const allocation = Math.min(sb.shortage, unallocatedStock);
            sb.currentStock = roundUpQuantity(sb.currentStock + allocation, 2);
            sb.shortage = roundUpQuantity(Math.max(0, sb.required - sb.currentStock - (sb.onOrderQuantity || 0)), 2);
            unallocatedStock = roundUpQuantity(unallocatedStock - allocation, 2);
          }
        }
      }

      // Effective stock
      const calculatedStockFromSizes = sizeBreakdownList.reduce((s, x) => s + x.currentStock, 0);
      currentStock = Math.max(calculatedStockFromSizes, totalWarehouseStock);
      onOrderQuantity = totalOnOrderFromSizes;
      grossShortageQuantity = Math.max(0, roundUpQuantity(totalReqFromSizes - currentStock, 2));

      const sumShortageFromSizes = sizeBreakdownList.reduce((s, x) => s + x.shortage, 0);
      shortageQuantity = Math.min(sumShortageFromSizes, Math.max(0, roundUpQuantity(totalReqFromSizes - currentStock - onOrderQuantity, 2)));
    } else {
      // Non-matrix stock and PO check
      let variantStock = 0;
      if (rawProduct.variantBarcodes && rawProduct.variantBarcodes.length > 0) {
        const colorVariants = rawProduct.variantBarcodes.filter(v => colorsMatch(v.color, data.color));
        if (colorVariants.length > 0) {
          variantStock = colorVariants.reduce((sum, v) => sum + (v.stock || 0), 0);
        }
      }

      const warehouseStock = roundUpQuantity(rawProduct.stock || 0, 2);
      currentStock = roundUpQuantity(Math.max(warehouseStock, variantStock), 2);

      onOrderQuantity = roundUpQuantity(
        matchingPOItems.reduce((sum, poi) => {
          const shipped = poi.shippedQuantity || 0;
          const invoiced = poi.invoicedQuantity || 0;
          const fulfilled = Math.max(shipped, invoiced);
          return sum + Math.max(0, (poi.quantity || 0) - fulfilled);
        }, 0),
        2
      );

      const reqQty = roundUpQuantity(data.requiredQuantity, 2);
      grossShortageQuantity = Math.max(0, roundUpQuantity(reqQty - currentStock, 2));
      shortageQuantity = Math.max(0, roundUpQuantity(reqQty - currentStock - onOrderQuantity, 2));
    }

    const buyingPrice = rawProduct.buyingPrice || 0;
    const estimatedCost = roundUpQuantity(shortageQuantity * buyingPrice, 2);

    // Automatically heal floating point precision artifact in DB if detected
    if (rawProduct.id && Math.abs((rawProduct.stock || 0) - currentStock) > 0.00000001 && (!rawProduct.variantBarcodes || rawProduct.variantBarcodes.length === 0)) {
      callOp('product-variants', { productId: rawProduct.id, stock: currentStock, logDelta: false }).catch(() => {});
    }

    let itemStatus: 'sufficient' | 'shortage' | 'po_created' = 'sufficient';
    if (shortageQuantity > 0) {
      itemStatus = 'shortage';
      shortageCount++;
      totalShortageCost += estimatedCost;
    } else if (grossShortageQuantity > 0 && onOrderQuantity > 0) {
      itemStatus = 'po_created';
    } else {
      itemStatus = 'sufficient';
    }

    const preferredSupplierId = rawProduct.preferredSupplierId;
    const preferredSupplierName = preferredSupplierId ? (rawProduct.preferredSupplierName || supplierMap.get(preferredSupplierId)) : undefined;

    const affectedWOs = data.affectedWorkOrderIds.map(woId => {
      const wo = workOrdersToAnalyze.find(w => w.id === woId);
      const prod = wo ? productMap.get(wo.productId) : undefined;
      return {
        workOrderId: woId,
        barcode: wo?.barcode || `#WO-${woId}`,
        quantity: wo?.quantity || 0,
        modelName: prod?.name || 'Ürün'
      };
    });

    mrpItems.push({
      rawMaterialId: data.rawMaterialId,
      rawMaterialName: rawProduct.name,
      rawMaterialCode: rawProduct.code,
      color: data.color,
      categoryType: rawProduct.categoryType,
      subType: rawProduct.subType,
      isMatrixMatched: data.isMatrixMatched,
      hasSizeMatrix: hasMatrix,
      sizeBreakdown: sizeBreakdownList,
      unit: rawProduct.unit || 'Çift',
      currentStock,
      requiredQuantity: roundUpQuantity(data.requiredQuantity, 2),
      onOrderQuantity,
      grossShortageQuantity,
      shortageQuantity,
      status: itemStatus,
      activePurchaseOrders: activePOsForThisItem,
      buyingPrice,
      estimatedCost,
      preferredSupplierId,
      preferredSupplierName,
      workOrderCount: data.affectedWorkOrderIds.length,
      affectedWorkOrderIds: data.affectedWorkOrderIds,
      affectedWorkOrders: affectedWOs,
      warehouseStock: rawProduct.stock || 0
    });
  }

  // Sort: shortages first, then po_created, then sufficient
  mrpItems.sort((a, b) => {
    const orderMap: Record<string, number> = { shortage: 0, po_created: 1, sufficient: 2 };
    const scoreA = orderMap[a.status] ?? 3;
    const scoreB = orderMap[b.status] ?? 3;
    if (scoreA !== scoreB) return scoreA - scoreB;
    return b.shortageQuantity - a.shortageQuantity;
  });

  // Update material readiness on work orders
  for (const wo of workOrdersToAnalyze) {
    const recipe = getRecipeForWO(wo.productId, wo.color);
    if (!recipe) {
      await api.workOrders.update(wo.id!, { materialStatus: 'no_recipe' });
      continue;
    }
    
    let hasShortage = false;
    let hasPoCreated = false;

    for (const ing of recipe.ingredients) {
      const ingColor = ing.color || wo.color || '';
      const item = mrpItems.find(m => m.rawMaterialId === ing.productId && colorsMatch(m.color, ingColor));
      if (item) {
        if (item.status === 'shortage') {
          hasShortage = true;
        } else if (item.status === 'po_created') {
          hasPoCreated = true;
        }
      }
    }

    let newStatus: MaterialReadinessStatus = 'materials_ready';
    if (hasShortage) {
      newStatus = 'materials_shortage';
    } else if (hasPoCreated) {
      newStatus = 'po_created';
    } else {
      newStatus = 'materials_ready';
    }
    await api.workOrders.update(wo.id!, { materialStatus: newStatus });
  }

  return {
    calculatedAt: new Date(),
    totalWorkOrders: workOrdersToAnalyze.length,
    totalRequiredMaterialsCount: mrpItems.length,
    shortageItemsCount: shortageCount,
    totalShortageCost,
    items: mrpItems
  };
}

export async function createPurchaseOrdersBySupplierFromMRP(
  shortageItems: { 
    rawMaterialId: number; 
    quantity: number; 
    color?: string;
    sizeBreakdown?: { size: string; quantity: number }[];
    unitPrice?: number; 
    supplierId?: number;
  }[],
  defaultSupplierContactId?: number,
  notes?: string
): Promise<{
  ordersCreated: {
    orderId: number;
    orderNumber: string;
    supplierId: number;
    supplierName: string;
    itemCount: number;
    grandTotal: number;
  }[];
  totalOrdersCount: number;
  totalGrandTotal: number;
}> {
  if (!shortageItems || shortageItems.length === 0) {
    throw new Error('Satın alma siparişi için en az bir hammadde seçilmelidir.');
  }

  const allContacts = await api.contacts.list();
  const allProducts = await api.products.list();
  const productMap = new Map(allProducts.map(p => [p.id!, p]));
  const contactMap = new Map(allContacts.map(c => [c.id!, c]));

  // Fallback supplier if none specified
  let fallbackSupplier = allContacts.find(c => c.type === 'supplier' || c.type === 'both');
  if (!fallbackSupplier) {
    // not: kimlik zinciri nedeniyle iki adımlı yazma
    const fallbackId = await api.contacts.create({
      name: 'Genel Hammadde Tedarikçisi',
      type: 'supplier',
      balance: 0
    });
    fallbackSupplier = { id: fallbackId, name: 'Genel Hammadde Tedarikçisi', type: 'supplier', balance: 0 };
    contactMap.set(fallbackId, fallbackSupplier);
  }

  // Group items by supplier ID
  const supplierGroups = new Map<number, { 
    rawMaterialId: number; 
    quantity: number; 
    color?: string;
    sizeBreakdown?: { size: string; quantity: number }[];
    unitPrice?: number;
  }[]>();

  // Track supplier assignment per raw material to update products
  const rawMaterialSupplierMap = new Map<number, number>();

  for (const item of shortageItems) {
    const raw = productMap.get(item.rawMaterialId);
    let targetSupplierId = item.supplierId;
    
    if (!targetSupplierId && raw?.preferredSupplierId) {
      targetSupplierId = raw.preferredSupplierId;
    }
    if (!targetSupplierId && defaultSupplierContactId) {
      targetSupplierId = defaultSupplierContactId;
    }
    if (!targetSupplierId) {
      targetSupplierId = fallbackSupplier.id!;
    }

    rawMaterialSupplierMap.set(item.rawMaterialId, targetSupplierId);

    const group = supplierGroups.get(targetSupplierId) || [];
    group.push(item);
    supplierGroups.set(targetSupplierId, group);
  }

  const mutations: Mutation[] = [];

  // Automatically remember preferred suppliers on products
  for (const [rawId, supId] of rawMaterialSupplierMap.entries()) {
    const sup = contactMap.get(supId);
    if (sup) {
      mutations.push({
        op: 'update',
        resource: 'products',
        id: rawId,
        data: {
          preferredSupplierId: supId,
          preferredSupplierName: sup.name
        }
      });
    }
  }

  const ordersCreated: {
    orderId: number;
    orderNumber: string;
    supplierId: number;
    supplierName: string;
    itemCount: number;
    grandTotal: number;
  }[] = [];

  let overallGrandTotal = 0;
  let orderIndex = 0;
  const timestamp = Date.now().toString().slice(-5);

  for (const [supplierId, groupItems] of supplierGroups.entries()) {
    orderIndex++;
    const supplier = contactMap.get(supplierId) || fallbackSupplier;
    let subtotal = 0;
    const orderItemsData: Omit<OrderItem, 'id' | 'orderId'>[] = [];

    for (const it of groupItems) {
      const raw = productMap.get(it.rawMaterialId);
      if (!raw) continue;

      const price = it.unitPrice !== undefined ? it.unitPrice : (raw.buyingPrice || 0);

      const validSizes = it.sizeBreakdown?.filter(s => (s.quantity || 0) > 0);
      if (validSizes && validSizes.length > 0) {
        // Create size-specific purchase order line items (e.g. 40-100, 41-200, 42-200, 43-200, 44-100)
        for (const sb of validSizes) {
          const lineQty = roundUpQuantity(sb.quantity, 2);
          const lineNet = price * lineQty;
          const lineTotal = lineNet * 1.20; // 20% VAT
          subtotal += lineNet;

          orderItemsData.push({
            productId: it.rawMaterialId,
            color: it.color,
            size: sb.size,
            quantity: lineQty,
            shippedQuantity: 0,
            unitPrice: price,
            taxRate: 20,
            discountRate: 0,
            total: lineTotal
          });
        }
      } else {
        const lineQty = roundUpQuantity(it.quantity, 2);
        const lineNet = price * lineQty;
        const lineTotal = lineNet * 1.20; // 20% VAT
        subtotal += lineNet;

        orderItemsData.push({
          productId: it.rawMaterialId,
          color: it.color,
          quantity: lineQty,
          shippedQuantity: 0,
          unitPrice: price,
          taxRate: 20,
          discountRate: 0,
          total: lineTotal
        });
      }
    }

    if (orderItemsData.length === 0) continue;

    const taxAmount = subtotal * 0.20;
    const grandTotal = subtotal + taxAmount;
    overallGrandTotal += grandTotal;

    // Clean short supplier prefix
    const supplierTag = supplier.name.slice(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, 'TED');
    const orderNumber = `PO-MRP-${supplierTag}-${timestamp}-${orderIndex}`;

    const matrixSummaries = groupItems
      .map(it => {
        const raw = productMap.get(it.rawMaterialId);
        if (!raw) return '';
        const colorStr = it.color ? ` (Renk: ${it.color})` : '';
        const validSizes = it.sizeBreakdown?.filter(s => (s.quantity || 0) > 0);
        if (validSizes && validSizes.length > 0) {
          const assortStr = validSizes.map(s => `${s.size}:${s.quantity}`).join(', ');
          return `${raw.name}${colorStr} - Asorti: [${assortStr} ${raw.unit || 'Çift'}] (Toplam: ${it.quantity} ${raw.unit || 'Çift'})`;
        }
        return `${raw.name}${colorStr} - ${it.quantity} ${raw.unit || 'Adet'}`;
      })
      .filter(Boolean)
      .join('\n');

    const orderData: Omit<Order, 'id'> = {
      type: 'purchase',
      orderNumber,
      contactId: supplierId,
      date: new Date(),
      status: 'confirmed',
      totalAmount: subtotal,
      taxAmount,
      discountAmount: 0,
      grandTotal,
      notes: notes || `MRP Otomatik Sipariş:\n${matrixSummaries}`,
      currency: 'TRY'
    };

    // not: kimlik zinciri nedeniyle iki adımlı yazma
    const orderId = await api.orders.create(orderData as Order);
    const itemsWithOrderId = orderItemsData.map(it => ({ ...it, orderId }));
    mutations.push({ op: 'insertMany', resource: 'orderItems', rows: itemsWithOrderId as OrderItem[] });

    ordersCreated.push({
      orderId,
      orderNumber,
      supplierId,
      supplierName: supplier.name,
      itemCount: orderItemsData.length,
      grandTotal
    });
  }

  await commit(mutations);

  return {
    ordersCreated,
    totalOrdersCount: ordersCreated.length,
    totalGrandTotal: overallGrandTotal
  };
}

export async function createPurchaseOrderFromMRP(
  shortageItems: { 
    rawMaterialId: number; 
    quantity: number; 
    color?: string;
    sizeBreakdown?: { size: string; quantity: number }[];
    unitPrice?: number;
  }[],
  supplierContactId?: number,
  notes?: string
) {
  if (!shortageItems || shortageItems.length === 0) {
    throw new Error('Satın alma siparişi için en az bir hammadde seçilmelidir.');
  }

  // Find or fallback supplier contact
  let contactId = supplierContactId;
  if (!contactId) {
    const firstSupplier = await api.contacts.findOne({ type: 'supplier' });
    if (firstSupplier) {
      contactId = firstSupplier.id;
    } else {
      // Create default supplier if none exists
      // not: kimlik zinciri nedeniyle iki adımlı yazma
      contactId = await api.contacts.create({
        name: 'Genel Hammadde Tedarikçisi',
        type: 'supplier',
        balance: 0
      });
    }
  }

  let subtotal = 0;
  const orderItemsData: Omit<OrderItem, 'id' | 'orderId'>[] = [];

  for (const item of shortageItems) {
    const raw = await api.products.get(item.rawMaterialId);
    if (!raw) continue;

    const price = item.unitPrice !== undefined ? item.unitPrice : (raw.buyingPrice || 0);

    const validSizes = item.sizeBreakdown?.filter(s => (s.quantity || 0) > 0);
    if (validSizes && validSizes.length > 0) {
      for (const sb of validSizes) {
        const lineQty = roundUpQuantity(sb.quantity, 2);
        const lineNet = price * lineQty;
        const lineTotal = lineNet * 1.20;
        subtotal += lineNet;

        orderItemsData.push({
          productId: item.rawMaterialId,
          color: item.color,
          size: sb.size,
          quantity: lineQty,
          shippedQuantity: 0,
          unitPrice: price,
          taxRate: 20,
          discountRate: 0,
          total: lineTotal
        });
      }
    } else {
      const lineQty = roundUpQuantity(item.quantity, 2);
      const lineNet = price * lineQty;
      const lineTotal = lineNet * 1.20;
      subtotal += lineNet;

      orderItemsData.push({
        productId: item.rawMaterialId,
        color: item.color,
        quantity: lineQty,
        shippedQuantity: 0,
        unitPrice: price,
        taxRate: 20,
        discountRate: 0,
        total: lineTotal
      });
    }
  }

  const taxAmount = subtotal * 0.20;
  const grandTotal = subtotal + taxAmount;
  const orderNumber = `PO-MRP-${Date.now().toString().slice(-6)}`;

  const orderData: Omit<Order, 'id'> = {
    type: 'purchase',
    orderNumber,
    contactId: contactId!,
    date: new Date(),
    status: 'confirmed',
    totalAmount: subtotal,
    taxAmount,
    discountAmount: 0,
    grandTotal,
    notes: notes || 'MRP (Malzeme İhtiyaç Planlama) tarafından otomatik oluşturulan hammadde tedarik siparişi.',
    currency: 'TRY'
  };

  // not: kimlik zinciri nedeniyle iki adımlı yazma
  const orderId = await api.orders.create(orderData as Order);
  const itemsWithOrderId = orderItemsData.map(it => ({ ...it, orderId }));
  await commit([{ op: 'insertMany', resource: 'orderItems', rows: itemsWithOrderId as OrderItem[] }]);

  return { orderId, orderNumber, grandTotal };
}
