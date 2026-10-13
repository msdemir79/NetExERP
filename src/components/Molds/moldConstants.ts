import type { Mold, MoldLocationType, MoldMoveType, MoldStock } from '../../types';

/** Konum etiketleri — sunucudaki MOLD_LOCATION_LABELS ile birebir aynı. */
export const MOLD_LOCATION_LABELS: Record<MoldLocationType, string> = {
  factory_warehouse: 'Fabrika Deposu',
  factory_line: 'Üretim Hattı',
  factory_other: 'Fabrika İçi Diğer',
  subcontract: 'Fason Firma',
  subcontract_warehouse: 'Fason Deposu',
  maintenance: 'Bakım/Onarım',
  scrap_lost: 'Hurda/Kayıp',
  allocated: 'İş Emrine Tahsis',
};

export const MOLD_FACTORY_LOCATIONS: MoldLocationType[] = [
  'factory_warehouse',
  'factory_line',
  'factory_other',
];

export const MOLD_SUBCONTRACT_LOCATIONS: MoldLocationType[] = ['subcontract', 'subcontract_warehouse'];

export type LocationTone = 'green' | 'blue' | 'orange' | 'amber' | 'red' | 'slate' | 'violet' | 'cyan';

export const MOLD_LOCATION_TONE: Record<MoldLocationType, LocationTone> = {
  factory_warehouse: 'blue',
  factory_line: 'cyan',
  factory_other: 'slate',
  subcontract: 'amber',
  subcontract_warehouse: 'orange',
  maintenance: 'violet',
  scrap_lost: 'red',
  allocated: 'green',
};

/** Hareket türü etiketleri — sunucudaki MOLD_MOVE_LABELS ile birebir aynı. */
export const MOLD_MOVE_LABELS: Record<MoldMoveType, string> = {
  initial_entry: 'İlk Kalıp Girişi',
  to_line: 'Üretim Hattına Transfer',
  from_line_return: 'Hattan Depoya İade',
  to_subcontract: 'Fasona Gönderim',
  from_subcontract_return: 'Fasondan İade',
  subcontract_transfer: 'Fasonlar Arası Transfer',
  warehouse_transfer: 'Fabrika İçi Transfer',
  to_maintenance: 'Bakıma Gönderim',
  from_maintenance: 'Bakımdan Dönüş',
  damage: 'Hasarlı Kalıp',
  loss: 'Kayıp Kalıp',
  scrap: 'Hurdaya Ayırma',
  count_adjust: 'Sayım Düzeltmesi',
  allocate: 'İş Emrine Tahsis',
  deallocate: 'Tahsis İptali',
};

export const MOLD_MOVE_TONE: Record<MoldMoveType, LocationTone> = {
  initial_entry: 'green',
  to_line: 'cyan',
  from_line_return: 'blue',
  to_subcontract: 'amber',
  from_subcontract_return: 'blue',
  subcontract_transfer: 'orange',
  warehouse_transfer: 'slate',
  to_maintenance: 'violet',
  from_maintenance: 'blue',
  damage: 'red',
  loss: 'red',
  scrap: 'red',
  count_adjust: 'violet',
  allocate: 'green',
  deallocate: 'blue',
};

export type MoveType = Exclude<MoldMoveType, 'count_adjust' | 'allocate' | 'deallocate'>;

/** Hareket türlerinin modalda hangi ek alanları istediği. */
export interface MoveFieldFlags {
  /** Kaynak fabrika konumu seçimi. */
  fromFactory?: 'optional' | 'required';
  /** Hedef fabrika konumu seçimi. */
  toFactory?: 'optional' | 'required';
  fromSub?: boolean;
  toSub?: boolean;
}

export const MOLD_MOVE_FIELDS: Record<MoveType, MoveFieldFlags> = {
  initial_entry: { toFactory: 'optional' },
  to_line: { fromFactory: 'optional' },
  from_line_return: {},
  to_subcontract: { fromFactory: 'optional', toSub: true },
  from_subcontract_return: { fromSub: true },
  subcontract_transfer: { fromSub: true, toSub: true },
  warehouse_transfer: { fromFactory: 'required', toFactory: 'required' },
  to_maintenance: { fromFactory: 'optional' },
  from_maintenance: {},
  damage: { fromFactory: 'optional' },
  loss: { fromFactory: 'optional' },
  scrap: { fromFactory: 'optional' },
};

/** Modalda gruplu gösterim için hareket türü listesi. */
export const MOLD_MOVE_GROUPS: { group: string; types: MoveType[] }[] = [
  { group: 'Giriş / Üretim', types: ['initial_entry', 'to_line', 'from_line_return'] },
  { group: 'Fason', types: ['to_subcontract', 'from_subcontract_return', 'subcontract_transfer'] },
  { group: 'Depo / Bakım', types: ['warehouse_transfer', 'to_maintenance', 'from_maintenance'] },
  { group: 'Fire', types: ['damage', 'loss', 'scrap'] },
];

/** Kalıbın numara kümesi: önce asorti, yoksa sizeRange çözümlenir. */
export function moldSizes(mold: Mold | null | undefined): string[] {
  if (!mold) return [];
  const fromAssort = (mold.assortment || [])
    .map((a) => String(a?.size ?? '').trim())
    .filter(Boolean);
  if (fromAssort.length) return uniq(fromAssort);
  return parseSizeRange(mold.sizeRange);
}

function uniq(values: string[]): string[] {
  return Array.from(new Set(values));
}

/** "36-40" → [36..40]; "36,38,40" → [36,38,40]; boş → []. */
export function parseSizeRange(range: string | null | undefined): string[] {
  const raw = String(range || '').trim();
  if (!raw) return [];
  const numericRange = raw.match(/^(\d+)\s*-\s*(\d+)$/);
  if (numericRange) {
    const start = Number(numericRange[1]);
    const end = Number(numericRange[2]);
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start && end - start <= 60) {
      const out: string[] = [];
      for (let n = start; n <= end; n++) out.push(String(n));
      return out;
    }
  }
  return uniq(
    raw
      .split(/[,;/]+/)
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/** Bir konum kovasında numara bazında mevcut çiftler. */
export function availableAt(
  buckets: MoldStock[],
  size: string,
  loc: { locationType: MoldLocationType; subcontractId: number } | null,
): number {
  if (!loc) return 0;
  return buckets
    .filter(
      (b) =>
        b.size === size &&
        b.locationType === loc.locationType &&
        Number(b.subcontractId) === Number(loc.subcontractId) &&
        Number(b.workOrderId) === 0,
    )
    .reduce((sum, b) => sum + (Number(b.pairs) || 0), 0);
}

/** Hareket türüne göre kaynak konumu (modal önizlemesi için; sunucu otoriterdir). */
export function sourceLocationOf(
  type: MoveType,
  fromFactory: MoldLocationType,
  fromSubcontractId: number,
): { locationType: MoldLocationType; subcontractId: number } | null {
  switch (type) {
    case 'initial_entry':
      return null;
    case 'to_line':
    case 'to_subcontract':
    case 'to_maintenance':
    case 'damage':
    case 'loss':
    case 'scrap':
      return { locationType: fromFactory, subcontractId: 0 };
    case 'from_line_return':
      return { locationType: 'factory_line', subcontractId: 0 };
    case 'from_subcontract_return':
    case 'subcontract_transfer':
      return { locationType: 'subcontract', subcontractId: fromSubcontractId };
    case 'warehouse_transfer':
      return { locationType: fromFactory, subcontractId: 0 };
    case 'from_maintenance':
      return { locationType: 'maintenance', subcontractId: 0 };
    default:
      return null;
  }
}

/** Hareket türüne göre hedef konumu (modal önizlemesi için; sunucu otoriterdir). */
export function targetLocationOf(
  type: MoveType,
  toFactory: MoldLocationType,
  toSubcontractId: number,
): { locationType: MoldLocationType; subcontractId: number } {
  switch (type) {
    case 'initial_entry':
    case 'warehouse_transfer':
      return { locationType: toFactory, subcontractId: 0 };
    case 'to_line':
      return { locationType: 'factory_line', subcontractId: 0 };
    case 'from_line_return':
    case 'from_subcontract_return':
    case 'from_maintenance':
      return { locationType: 'factory_warehouse', subcontractId: 0 };
    case 'to_subcontract':
    case 'subcontract_transfer':
      return { locationType: 'subcontract', subcontractId: toSubcontractId };
    case 'to_maintenance':
      return { locationType: 'maintenance', subcontractId: 0 };
    case 'damage':
    case 'loss':
    case 'scrap':
      return { locationType: 'scrap_lost', subcontractId: 0 };
    default:
      return { locationType: 'factory_warehouse', subcontractId: 0 };
  }
}

/** Konum + varsa fason cari etiketi (örn. "Fason Firma (#12)"). */
export function endpointLabel(loc: { locationType: MoldLocationType; subcontractId: number } | null): string {
  if (!loc) return 'Kaynak yok (giriş)';
  const base = MOLD_LOCATION_LABELS[loc.locationType];
  return loc.subcontractId ? `${base} (#${loc.subcontractId})` : base;
}

export function formatPairs(value: number): string {
  const n = Number(value) || 0;
  return Number.isInteger(n) ? String(n) : n.toLocaleString('tr-TR', { maximumFractionDigits: 4 });
}
