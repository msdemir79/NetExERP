/**
 * Stok ve Envanter Matematiksel Hesaplama & Doğrulama Modülü
 */

/**
 * İmalat miktarları (metre, çift, dm², kg) temiz ve okunur olmalıdır.
 * Kayan nokta artefaktlarını (0.3999999999999986 gibi) temizleyip yukarı yuvarlar.
 * Sunucu ve istemci aynı fonksiyonu kullanır.
 */
export function roundUpQuantity(val: number, decimals: number = 2): number {
  if (val === undefined || val === null || isNaN(val)) return 0;
  if (val === 0) return 0;
  const isNegative = val < 0;
  const absVal = Math.abs(val);
  // Çok küçük ölçümlerde (< 0.01) hassasiyeti koru.
  const effDecimals = absVal > 0 && absVal < 0.01 ? 4 : decimals;
  const clean = Math.round(absVal * 1000000) / 1000000;
  const factor = Math.pow(10, effDecimals);
  const rounded = Math.ceil(clean * factor) / factor;
  return isNegative ? -rounded : rounded;
}

/** Miktarı Türkçe biçimde (binlik ayraçlı) gösterir. */
export function formatQuantity(val: number): string {
  if (val === undefined || val === null || isNaN(val)) return '0';
  if (val === 0) return '0';
  const isNegative = val < 0;
  const rounded = roundUpQuantity(Math.abs(val), 2);

  const formatted = Number.isInteger(rounded)
    ? rounded.toLocaleString('tr-TR')
    : rounded.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return isNegative ? `-${formatted}` : formatted;
}

export interface StockItem {
  id?: number;
  code: string;
  name: string;
  stock: number;
  minStock?: number;
  unitCost?: number;
}

export type MovementType = 'in' | 'out' | 'transfer' | 'waste' | 'count_adjustment' | 'production_in' | 'production_out';

/**
 * Stok hareketine göre yeni stok miktarını hesaplar
 */
export function calculateNewStock(
  currentStock: number,
  movementType: MovementType,
  quantity: number,
  allowNegative: boolean = false
): number {
  if (quantity < 0) {
    throw new Error('Stok hareket miktarı negatif olamaz.');
  }

  let delta = 0;
  switch (movementType) {
    case 'in':
    case 'production_in':
      delta = quantity;
      break;
    case 'out':
    case 'production_out':
    case 'waste':
      delta = -quantity;
      break;
    case 'count_adjustment':
      // Sayım farkında miktar doğrudan yeni stok olarak atanabilir veya fark girilebilir
      delta = quantity;
      break;
    case 'transfer':
      delta = -quantity;
      break;
    default:
      delta = 0;
  }

  const newStock = currentStock + delta;
  if (!allowNegative && newStock < 0) {
    throw new Error(`Yetersiz stok! Mevcut: ${currentStock}, Çıkış istenen: ${quantity}`);
  }

  return Number(newStock.toFixed(2));
}

/**
 * Ürünün kritik stok seviyesinde veya altında olup olmadığını kontrol eder
 */
export function isStockCritical(stock: number, minStock?: number): boolean {
  if (minStock === undefined || minStock === null) return false;
  return stock <= minStock;
}

/**
 * Satın alma veya üretim girişi sonrasında Ağırlıklı Ortalama Maliyet (AOM) hesaplar
 */
export function calculateWeightedAverageCost(
  currentStock: number,
  currentUnitCost: number,
  incomingQuantity: number,
  incomingUnitCost: number
): number {
  const validCurrentStock = Math.max(0, currentStock);
  const totalStock = validCurrentStock + incomingQuantity;

  if (totalStock <= 0) {
    return incomingUnitCost > 0 ? incomingUnitCost : currentUnitCost;
  }

  const currentValue = validCurrentStock * (currentUnitCost || 0);
  const incomingValue = incomingQuantity * (incomingUnitCost || 0);
  const totalValue = currentValue + incomingValue;

  return Number((totalValue / totalStock).toFixed(4));
}

/**
 * Parti / Lot bazlı rezerve edilebilir serbest miktar hesabı
 */
export function calculateAvailableLotQuantity(totalLotQty: number, allocatedQty: number): number {
  return Math.max(0, Number((totalLotQty - allocatedQty).toFixed(2)));
}

/* ------------------------------------------------------------------ */
/* Reçete (BOM) sarfiyat bazı                                          */
/* ------------------------------------------------------------------ */

export interface RecipeBasisLine {
  quantity?: number;
  /** Kaç mamul için geçerli (örn. 8'li koli = 8). Boş/0 → 1 mamul. */
  basisQty?: number;
}

/**
 * Tam adede yuvarlanan sayılabilir birimler. Liste dışındaki her birim
 * (METR, PLAK, dm² gibi kısaltmalar dahil) bölünebilir sayılır: bilinmeyen bir
 * birimi yukarı yuvarlamak hammaddeden fazladan düşmek anlamına gelir.
 */
const COUNTABLE_UNITS = ['adet', 'koli', 'kutu', 'paket', 'çift', 'kasa', 'poşet', 'torba', 'takım', 'set', 'çuval'];

export function isCountableUnit(unit?: string): boolean {
  return COUNTABLE_UNITS.includes((unit || '').trim().toLocaleLowerCase('tr'));
}

/**
 * Malzeme miktarını birimine göre yuvarlar: koli, kutu, adet gibi sayılabilir
 * birimlerde tam adede yukarı (1,25 koli → 2 koli), diğerlerinde kayan nokta
 * temizliğiyle virgülden sonra 2 basamak.
 */
export function roundMaterialQuantity(qty: number, unit?: string): number {
  if (!Number.isFinite(qty) || qty <= 0) return 0;
  // Kayan nokta artefaktı (2/3 × 3 = 2.0000000000000004) fazladan birim yuvarlatmasın.
  const cleaned = Number(qty.toFixed(6));
  return isCountableUnit(unit) ? Math.ceil(cleaned) : roundUpQuantity(cleaned, 2);
}

/**
 * Reçete satırının 1 mamul (çift/adet) başına etkin sarfiyatı = miktar / baz.
 * Bölme en sona bırakılır; kesirli bazlarda (1 koli / 12 çift) hassasiyet kaybolmaz.
 */
export function ingredientPerUnit(line: RecipeBasisLine): number {
  const basis = Number(line?.basisQty) > 0 ? Number(line.basisQty) : 1;
  return (Number(line?.quantity) || 0) / basis;
}

/**
 * Üretilen mamul adedi için gereken malzeme miktarı (baz + birim yuvarlaması).
 */
export function requiredIngredientQuantity(
  line: RecipeBasisLine,
  producedQty: number,
  unit?: string
): number {
  return roundMaterialQuantity(ingredientPerUnit(line) * (Number(producedQty) || 0), unit);
}
