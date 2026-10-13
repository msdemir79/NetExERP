import { useMemo } from 'react';
import { api } from '../api/client';
import { useApiQueryIf } from '../hooks/useApiQuery';
import { formatQuantity, ingredientPerUnit, roundMaterialQuantity } from '../lib/inventoryCalculator';
import { colorsMatch, normalizeColorKey, pickRecipeForWorkOrder } from './productionMrp';
import type { Product, WorkOrder } from '../types';

/**
 * Üretimden kaynaklanan BEKLEYEN miktarların salt-okur hesabı.
 * MRP'den farkı: stok/açık sipariş mahsuplaşması yapmaz ve iş emirlerine
 * materialStatus yazmaz; yalnızca "üretim bu üründen ne kadar bekliyor" sorusunu
 * renk (ve varsa beden) kırılımıyla cevaplar.
 */

const SIZE_MATRIX_SUBTYPES = ['Taban', 'Mostra', 'Fuspet', 'Salpa', 'Saya', 'Kalıp'];

export interface DemandSizeLine {
  size: string;
  quantity: number;
}

export interface DemandColorLine {
  /** Boş/undefined = genel (renksiz) ihtiyaç */
  color?: string;
  quantity: number;
  sizes: DemandSizeLine[];
  workOrderCount: number;
}

export interface DemandWorkOrderRef {
  id: number;
  barcode: string;
  quantity: number;
  color?: string;
  size?: string;
  currentStage: WorkOrder['currentStage'];
  orderNumber?: string;
  customerName?: string;
  targetDate?: Date | string;
}

export interface DemandSide {
  total: number;
  byColor: DemandColorLine[];
  workOrderCount: number;
  workOrders: DemandWorkOrderRef[];
}

export interface ProductionDemandEntry {
  productId: number;
  code: string;
  name: string;
  unit: string;
  /** Reçeteden doğan, malzemesi henüz stoğa işlenmemiş ihtiyaç (hammadde / yarı mamul / aksesuar) */
  material: DemandSide | null;
  /** Tamamlanmamış iş emirlerinden depoya girecek mamul / yarı mamul miktarı */
  output: DemandSide | null;
}

interface ColorAgg {
  color?: string;
  quantity: number;
  sizes: Map<string, number>;
  workOrderIds: Set<number>;
}

interface ProductAgg {
  colors: Map<string, ColorAgg>;
  workOrders: Map<number, DemandWorkOrderRef>;
}

function aggFor(map: Map<number, ProductAgg>, productId: number): ProductAgg {
  let agg = map.get(productId);
  if (!agg) {
    agg = { colors: new Map(), workOrders: new Map() };
    map.set(productId, agg);
  }
  return agg;
}

function toRef(wo: WorkOrder): DemandWorkOrderRef {
  return {
    id: wo.id!,
    barcode: wo.barcode,
    quantity: wo.quantity || 0,
    color: wo.color || undefined,
    size: wo.size || undefined,
    currentStage: wo.currentStage,
    orderNumber: wo.orderNumber || undefined,
    customerName: wo.customerName || undefined,
    targetDate: wo.targetDate,
  };
}

function addNeed(
  agg: ProductAgg,
  wo: WorkOrder,
  color: string | undefined,
  quantity: number,
  sizeLines: DemandSizeLine[] | null,
): void {
  const key = normalizeColorKey(color) || 'ALL';
  let line = agg.colors.get(key);
  if (!line) {
    line = { color, quantity: 0, sizes: new Map(), workOrderIds: new Set() };
    agg.colors.set(key, line);
  }
  line.quantity += quantity;
  line.workOrderIds.add(wo.id!);
  if (sizeLines) {
    for (const s of sizeLines) {
      const size = s.size.trim();
      if (!size) continue;
      line.sizes.set(size, (line.sizes.get(size) || 0) + s.quantity);
    }
  }
  if (!agg.workOrders.has(wo.id!)) agg.workOrders.set(wo.id!, toRef(wo));
}

/** İş emrinin beden kırılımı: asorti dağılımı varsa o, yoksa tek beden. */
function workOrderSizes(wo: WorkOrder): DemandSizeLine[] {
  if (wo.assortmentBreakdown && wo.assortmentBreakdown.length > 0) {
    return wo.assortmentBreakdown.map(a => ({ size: String(a.size), quantity: a.quantity || 0 }));
  }
  const size = (wo.size || '').trim();
  if (size && !/^(asorti|tüm bedenler|tum bedenler)$/i.test(size)) {
    return [{ size, quantity: wo.quantity || 0 }];
  }
  return [];
}

function sortSizes(sizes: DemandSizeLine[]): DemandSizeLine[] {
  return sizes.sort((a, b) => {
    const na = parseFloat(a.size);
    const nb = parseFloat(b.size);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.size.localeCompare(b.size, 'tr');
  });
}

function buildSide(
  agg: ProductAgg,
  unit: string,
): DemandSide {
  const byColor: DemandColorLine[] = [];
  for (const c of agg.colors.values()) {
    const quantity = roundMaterialQuantity(c.quantity, unit);
    if (quantity <= 0) continue;
    const sizes = sortSizes(
      [...c.sizes.entries()]
        .map(([size, q]) => ({ size, quantity: roundMaterialQuantity(q, unit) }))
        .filter(s => s.quantity > 0),
    );
    byColor.push({ color: c.color, quantity, sizes, workOrderCount: c.workOrderIds.size });
  }
  if (byColor.length === 0) return { total: 0, byColor: [], workOrderCount: agg.workOrders.size, workOrders: [] };
  byColor.sort((a, b) => b.quantity - a.quantity || (a.color || '').localeCompare(b.color || '', 'tr'));
  const workOrders = [...agg.workOrders.values()].sort((a, b) => a.barcode.localeCompare(b.barcode));
  return {
    total: byColor.reduce((s, x) => s + x.quantity, 0),
    byColor,
    workOrderCount: workOrders.length,
    workOrders,
  };
}

export async function calculateProductionDemand(): Promise<ProductionDemandEntry[]> {
  const [workOrders, recipes, products] = await Promise.all([
    api.workOrders.list(),
    api.recipes.list(),
    api.products.list(),
  ]);

  const productMap = new Map<number, Product>();
  for (const p of products) {
    if (p.id != null) productMap.set(p.id, p);
  }

  const openWorkOrders = workOrders.filter(
    w => w.id != null && (w.status === 'pending' || w.status === 'in_progress'),
  );
  // Malzeme, iş emri planlama aşamasını terk ederken stoğa production_out olarak işlenir
  // (productionService.advanceWorkOrderStage); o noktadan sonra aynı ihtiyacı tekrar
  // saymak stoğu iki kez düşmek anlamına gelir.
  const awaitingMaterial = openWorkOrders.filter(
    w => w.currentStage === 'planning' && w.materialStatus !== 'materials_consumed',
  );

  const materialAgg = new Map<number, ProductAgg>();
  const outputAgg = new Map<number, ProductAgg>();

  for (const wo of awaitingMaterial) {
    const recipe = pickRecipeForWorkOrder(recipes, wo.productId, wo.color);
    if (!recipe || !recipe.ingredients || recipe.ingredients.length === 0) continue;
    const woSizes = workOrderSizes(wo);

    for (const ing of recipe.ingredients) {
      const raw = productMap.get(ing.productId);
      if (!raw) continue;
      const perUnit = ingredientPerUnit(ing);
      const needed = perUnit * (wo.quantity || 0);
      if (!(needed > 0)) continue;

      let ingColor = (ing.color || '').trim();
      if (!ingColor) {
        const colors = raw.colors || [];
        if (colors.length > 1) {
          ingColor = (wo.color || '').trim();
        } else if (colors.length === 1 && normalizeColorKey(colors[0]) !== '') {
          ingColor = colors[0];
        }
      }

      const matrix = Boolean(
        ing.isMatrixMatched ||
        raw.hasSizeVariants ||
        raw.isFootwear ||
        SIZE_MATRIX_SUBTYPES.includes(raw.subType || ''),
      );
      const sizeLines = matrix && woSizes.length > 0
        ? woSizes.map(s => ({ size: s.size, quantity: s.quantity * perUnit }))
        : null;

      addNeed(aggFor(materialAgg, ing.productId), wo, ingColor || undefined, needed, sizeLines);
    }
  }

  for (const wo of openWorkOrders) {
    addNeed(aggFor(outputAgg, wo.productId), wo, (wo.color || '').trim() || undefined, wo.quantity || 0, workOrderSizes(wo));
  }

  const entries: ProductionDemandEntry[] = [];
  const productIds = new Set<number>([...materialAgg.keys(), ...outputAgg.keys()]);
  for (const productId of productIds) {
    const product = productMap.get(productId);
    if (!product) continue;
    const unit = product.unit || 'Adet';
    const material = materialAgg.get(productId);
    const output = outputAgg.get(productId);
    const materialSide = material ? buildSide(material, unit) : null;
    const outputSide = output ? buildSide(output, unit) : null;
    if (!materialSide?.total && !outputSide?.total) continue;
    entries.push({
      productId,
      code: product.code,
      name: product.name,
      unit,
      material: materialSide?.total ? materialSide : null,
      output: outputSide?.total ? outputSide : null,
    });
  }

  return entries;
}

let inFlight: Promise<ProductionDemandEntry[]> | null = null;

/** Aynı anda açılan birden çok ekranın tek hesap paylaşması için uçuş-içi tekilleştirme. */
export function getProductionDemand(): Promise<ProductionDemandEntry[]> {
  if (!inFlight) {
    inFlight = calculateProductionDemand().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

export function useProductionDemand(enabled = true): { demand: Map<number, ProductionDemandEntry>; demandLoading: boolean } {
  const data = useApiQueryIf<ProductionDemandEntry[]>(
    enabled,
    () => getProductionDemand(),
    [],
    ['workOrders', 'recipes'],
  );
  const demand = useMemo(() => {
    const map = new Map<number, ProductionDemandEntry>();
    for (const entry of data ?? []) map.set(entry.productId, entry);
    return map;
  }, [data]);
  return { demand, demandLoading: enabled && !data };
}

/* ------------------------------------------------------------------ */
/* Sunum yardımcıları                                                  */
/* ------------------------------------------------------------------ */

/** Ürün seçim listelerinde seçenek metnine eklenen kısa özet. */
export function demandOptionSuffix(entry?: ProductionDemandEntry): string {
  if (!entry) return '';
  const parts: string[] = [];
  if (entry.material) parts.push(`Ür.İht. ${formatQuantity(entry.material.total)}`);
  if (entry.output) parts.push(`Üretimde ${formatQuantity(entry.output.total)}`);
  return parts.length > 0 ? ` (${parts.join(' · ')})` : '';
}

function sideText(side: DemandSide, label: string, color?: string | null, maxColors = 3): string {
  const filter = normalizeColorKey(color);
  const lines = filter ? side.byColor.filter(l => colorsMatch(l.color, color)) : side.byColor;
  if (lines.length === 0) return '';
  if (lines.length === 1) {
    const only = lines[0];
    return `${label}: ${formatQuantity(only.quantity)}${only.color ? ` ${only.color}` : ''}`;
  }
  const shown = lines.slice(0, maxColors).map(l => `${l.color || 'Genel'} ${formatQuantity(l.quantity)}`);
  const rest = lines.length - shown.length;
  return `${label}: ${shown.join(' · ')}${rest > 0 ? ` · +${rest} renk` : ''}`;
}

/**
 * Renk kırılımlı tek satırlık bilgi metni. `color` verilirse yalnızca o rengin
 * (Türkçe katlamalı eşleşme) ihtiyacı gösterilir.
 */
export function demandChipText(entry?: ProductionDemandEntry, color?: string | null): string {
  if (!entry) return '';
  const parts = [
    entry.material ? sideText(entry.material, 'Üretim bekleyen ihtiyaç', color) : '',
    entry.output ? sideText(entry.output, 'Üretimden gelecek', color) : '',
  ].filter(Boolean);
  return parts.join('  |  ');
}
