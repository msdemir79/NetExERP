import type { ProductionStage, WorkOrder, WorkOrderStageLog } from '../types';
import { PRODUCTION_STAGES_CONFIG } from './productionService';

/**
 * Üretim Kontrol Merkezi (DMR NEXUS) veri türetme katmanı.
 *
 * Bu modül SADECE mevcut ERP iş emirlerinden (workOrders + stages[]) gerçek
 * özetler üretir. Makine/PLC/sensör verisi KULLANMAZ ve gerçek olmayan hiçbir
 * değer üretmez: veri yoksa 0 / boş döner, asla rastgele veya "uydurma" sayı
 * basmaz. Animasyon/canlılık sinyalleri de yalnızca gerçek `in_progress`
 * iş emirlerinden türetilir.
 *
 * Birim: iş emri `quantity` ve aşama `completedQuantity` ÇİFT bazlıdır.
 */

/** Hattaki 7 proses (tamamlanan/depoya giren 'completed' bir proses değildir). */
export const LINE_PROCESS_STAGES: ProductionStage[] = [
  'planning',
  'cutting',
  'printing',
  'sewing',
  'assembly',
  'finishing',
  'quality_packing',
];

/** Her proses için koyu temalı 3D görsel (public/ → /images/line/...). */
export const LINE_STAGE_IMAGE: Record<ProductionStage, string> = {
  planning: '/images/line/planlama.png',
  cutting: '/images/line/kesim.png',
  printing: '/images/line/baski.png',
  sewing: '/images/line/saya.png',
  assembly: '/images/line/montaj.png',
  finishing: '/images/line/finisaj.png',
  quality_packing: '/images/line/kalite.png',
  completed: '/images/line/kalite.png',
};

const STAGE_ORDER: Record<ProductionStage, number> = PRODUCTION_STAGES_CONFIG.reduce(
  (acc, s) => {
    acc[s.id] = s.order;
    return acc;
  },
  {} as Record<ProductionStage, number>,
);

export function stageOrderOf(stage: ProductionStage): number {
  return STAGE_ORDER[stage] ?? 0;
}

export interface LineFilters {
  search?: string;
  orderId?: number | null;
  productId?: number | null;
  colorId?: number | null;
  size?: string | null;
  line?: string | null;
  status?: 'all' | 'active' | 'completed' | 'pending';
  dateFrom?: string | null; // ISO date (termin)
  dateTo?: string | null;
}

export interface StageSummary {
  stage: ProductionStage;
  label: string;
  shortLabel: string;
  image: string;
  plannedPairs: number; // bu aşamada sıradaki + çalışan (anlık yük)
  targetPairs: number;
  producedPairs: number;
  remainingPairs: number;
  completionPct: number; // 0-100
  durationMs: number | null; // tamamlanmış aşama loglarından en uzun gerçek süre
  scrapPairs: number; // fire (gerçek kayıtlı)
  workOrderCount: number; // bu aşamada bekleyen + çalışan
  inProgressCount: number; // gerçekten çalışan (in_progress)
  waitingCount: number; // sırada bekleyen (pending)
  isBottleneck: boolean;
  operators: string[]; // gerçek, aşama logundan
}

export interface LineSummary {
  stages: StageSummary[];
  totalPairs: number;
  completedPairs: number; // tüm prosesleri biten (status completed)
  activeWorkOrders: number;
  totalWorkOrders: number;
  overallPct: number;
  isBottleneckStage: ProductionStage | null;
}

function stageLog(wo: WorkOrder, stage: ProductionStage): WorkOrderStageLog | undefined {
  return wo.stages?.find((l) => l.stage === stage);
}

/** İş emrinin çift bazlı hedefi. */
function pairsOf(wo: WorkOrder): number {
  return Number(wo.quantity) || 0;
}

/**
 * Bir iş emrinin belirli bir proseste TAMAMLANAN çift sayısı (dürüst):
 * - iş emri bu prosesin gerisindeyse (henüz ulaşmadı): 0
 * - bu proseste çalışıyorsa: kayıtlı completedQuantity (parça)
 * - bu prosesi geçip ileriye gittiyse veya bittiyse: tam miktar (geçti)
 * Mükerrer sayım olmaz: her iş emri bir proseste en fazla kendi miktarı kadar sayılır.
 */
export function producedAtStage(wo: WorkOrder, stage: ProductionStage): number {
  const target = pairsOf(wo);
  const cur = stageOrderOf(wo.currentStage);
  const s = stageOrderOf(stage);
  if (wo.status === 'completed') return target; // her prosesten geçti
  if (s < cur) return target; // ilerideki aşamaya geçmiş → bu prosesi bitirdi
  if (s > cur) return 0; // henüz ulaşmadı
  // s === cur → şu an bu proseste
  const log = stageLog(wo, stage);
  return Math.min(target, Number(log?.completedQuantity) || 0);
}

/** Uygulanabilir iş emirlerini filtreler (iptaller hariç tutulmaz; durum süzgeci ayrı). */
export function filterWorkOrders(workOrders: WorkOrder[], filters: LineFilters): WorkOrder[] {
  const q = (filters.search || '').trim().toLowerCase();
  return workOrders.filter((wo) => {
    if (filters.orderId != null && Number(wo.orderId) !== Number(filters.orderId)) return false;
    if (filters.productId != null && Number(wo.productId) !== Number(filters.productId)) return false;
    if (filters.colorId != null && Number(wo.colorId) !== Number(filters.colorId)) return false;
    if (filters.size && wo.size !== filters.size) return false;
    if (filters.line && (wo.line || '') !== filters.line) return false;
    if (filters.status === 'completed' && wo.status !== 'completed') return false;
    if (filters.status === 'active' && !(wo.status === 'in_progress' || wo.status === 'pending')) return false;
    if (filters.status === 'pending' && wo.status !== 'pending') return false;
    if (filters.dateFrom || filters.dateTo) {
      const t = wo.targetDate ? new Date(wo.targetDate).getTime() : 0;
      if (filters.dateFrom && (!t || t < new Date(filters.dateFrom).getTime())) return false;
      if (filters.dateTo && (!t || t > new Date(`${filters.dateTo}T23:59:59`).getTime())) return false;
    }
    if (q) {
      const hay = `${wo.barcode || ''} ${wo.orderNumber || ''} ${wo.customerName || ''} ${wo.color || ''} ${wo.size || ''} ${wo.line || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/**
 * Proses bazında canlı özeti üretir. `workOrders` filtrelenmiş girdi olmalı.
 * İptal edilen iş emirleri hedefe dahil edilmez.
 */
export function buildLineSummary(workOrders: WorkOrder[]): LineSummary {
  const active = workOrders.filter((w) => w.status !== 'cancelled');

  let maxWaiting = -1;
  let bottleneck: ProductionStage | null = null;

  const stages: StageSummary[] = LINE_PROCESS_STAGES.map((stage) => {
    const cfg = PRODUCTION_STAGES_CONFIG.find((s) => s.id === stage)!;
    let target = 0;
    let produced = 0;
    let scrap = 0;
    let inProgress = 0;
    let waiting = 0;
    let durationMs: number | null = null;
    const operators = new Set<string>();

    for (const wo of active) {
      const t = pairsOf(wo);
      target += t;
      produced += producedAtStage(wo, stage);

      const log = stageLog(wo, stage);
      if (log?.scrapQuantity) scrap += Number(log.scrapQuantity) || 0;
      if (log?.operator) operators.add(log.operator);
      if (log?.status === 'completed' && wo.operator) operators.add(wo.operator);
      if (log?.startedAt && log?.completedAt) {
        const ms = new Date(log.completedAt).getTime() - new Date(log.startedAt).getTime();
        if (ms > 0 && (durationMs == null || ms > durationMs)) durationMs = ms;
      }

      if (wo.currentStage === stage) {
        if (wo.status === 'in_progress') inProgress += 1;
        else if (wo.status === 'pending') waiting += 1;
      }
    }

    const remaining = Math.max(0, target - produced);
    const pct = target > 0 ? Math.min(100, Math.round((produced / target) * 100)) : 0;
    if (waiting > maxWaiting) {
      maxWaiting = waiting;
      bottleneck = stage;
    }

    return {
      stage,
      label: cfg.label,
      shortLabel: cfg.shortLabel,
      image: LINE_STAGE_IMAGE[stage],
      plannedPairs: target,
      targetPairs: target,
      producedPairs: produced,
      remainingPairs: remaining,
      completionPct: pct,
      durationMs,
      scrapPairs: scrap,
      workOrderCount: inProgress + waiting,
      inProgressCount: inProgress,
      waitingCount: waiting,
      isBottleneck: false,
      operators: Array.from(operators),
    };
  });

  // Darboğaz yalnızca gerçek birikme varsa işaretlenir (bekleyen iş emri > 0).
  if (bottleneck && maxWaiting > 0) {
    const b = stages.find((s) => s.stage === bottleneck);
    if (b) b.isBottleneck = true;
  } else {
    bottleneck = null;
  }

  const totalPairs = stages.length ? stages[0].targetPairs : 0;
  const completedPairs = active.filter((w) => w.status === 'completed').reduce((a, w) => a + pairsOf(w), 0);
  const activeWorkOrders = active.filter((w) => w.status === 'in_progress' || w.status === 'pending').length;
  const overallPct = totalPairs > 0 ? Math.min(100, Math.round((completedPairs / totalPairs) * 100)) : 0;

  return {
    stages,
    totalPairs,
    completedPairs,
    activeWorkOrders,
    totalWorkOrders: active.length,
    overallPct,
    isBottleneckStage: bottleneck,
  };
}

/** Bir proseste duran iş emirleri (tıklandığında gösterilecek). */
export function workOrdersAtStage(workOrders: WorkOrder[], stage: ProductionStage): WorkOrder[] {
  return workOrders.filter((w) => w.status !== 'cancelled' && w.currentStage === stage);
}

/** Filtre kutusu için iş emirlerindeki benzersiz üretim hattı adları. */
export function distinctLines(workOrders: WorkOrder[]): string[] {
  const set = new Set<string>();
  for (const wo of workOrders) if (wo.line) set.add(wo.line);
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'tr'));
}

export interface MatrixCell {
  color: string;
  colorId: number | null;
  size: string;
  targetPairs: number;
  donePairs: number; // son prosesten (kalite/paket) geçen çift
  pct: number;
}

/**
 * Renk x Beden üretim ilerleme matrisi. "done" = iş emrinin `stage` prosesinden
 * geçen çift sayısı (varsayılan: kalite/paket = üretilmiş mamul). Gerçek veri
 * dışında değer yok.
 */
export function buildColorSizeMatrix(
  workOrders: WorkOrder[],
  stage: ProductionStage = 'quality_packing',
): {
  colors: string[];
  sizes: string[];
  cells: MatrixCell[];
} {
  const active = workOrders.filter((w) => w.status !== 'cancelled');
  const cellMap = new Map<string, MatrixCell>();
  const colorSet = new Set<string>();
  const sizeSet = new Set<string>();

  for (const wo of active) {
    const color = wo.color || '—';
    const size = wo.size || '—';
    colorSet.add(color);
    sizeSet.add(size);
    const key = `${color}||${size}`;
    const target = pairsOf(wo);
    const done = producedAtStage(wo, stage);
    const existing = cellMap.get(key);
    if (existing) {
      existing.targetPairs += target;
      existing.donePairs += done;
    } else {
      cellMap.set(key, {
        color,
        colorId: wo.colorId ?? null,
        size,
        targetPairs: target,
        donePairs: done,
        pct: target > 0 ? Math.min(100, Math.round((done / target) * 100)) : 0,
      });
    }
  }

  const sizes = Array.from(sizeSet).sort((a, b) => (Number(a) || 0) - (Number(b) || 0) || a.localeCompare(b));
  const colors = Array.from(colorSet).sort((a, b) => a.localeCompare(b, 'tr'));
  const cells = Array.from(cellMap.values());
  return { colors, sizes, cells };
}
