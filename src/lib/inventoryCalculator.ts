/**
 * Stok ve Envanter Matematiksel Hesaplama & Doğrulama Modülü
 */

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
