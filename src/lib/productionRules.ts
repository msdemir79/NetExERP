import { distributeWithLargestRemainder, quantityDecimals } from './inventoryCalculator';

export const PRODUCTION_STAGE_ORDER = ['planning', 'cutting', 'printing', 'sewing', 'assembly', 'finishing', 'quality_packing', 'completed'] as const;

export function distributeAssortment(
  product: { unit?: string; assortment?: { size: string; quantity: number }[]; variantBarcodes?: { size?: string }[] },
  quantity: number,
  specificSize?: string,
  templateItems?: { size: string; quantity: number }[],
): { size: string; quantity: number }[] {
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Üretim miktarı sıfırdan büyük olmalıdır.');
  const decimals = quantityDecimals(product.unit);
  if (decimals === 0 && !Number.isInteger(quantity)) throw new Error('Adet/çift üretim miktarı tam sayı olmalıdır.');
  if (specificSize?.trim()) return [{ size: specificSize.trim(), quantity }];
  const source = product.assortment?.length ? product.assortment : templateItems;
  const uniqueSizes = [...new Set((product.variantBarcodes || []).map(item => item.size?.trim()).filter((size): size is string => !!size))]
    .sort((a, b) => a.localeCompare(b, 'tr', { numeric: true }));
  const items = source?.length ? source : (uniqueSizes.length ? uniqueSizes : ['40', '41', '42', '43', '44'])
    .map(size => ({ size, quantity: 1 }));
  const shares = distributeWithLargestRemainder(quantity, items.map(item => Number(item.quantity)), decimals);
  return items.map((item, index) => ({ size: String(item.size), quantity: shares[index] }));
}

export function selectProductionRecipe<T extends { productId: number; targetColor?: string | null }>(recipes: T[], productId: number, color?: string | null): T | null {
  const fold = (value?: string | null) => (value || '').trim().toLocaleLowerCase('tr-TR');
  const candidates = recipes.filter(recipe => Number(recipe.productId) === Number(productId));
  const exact = color ? candidates.find(recipe => fold(recipe.targetColor) === fold(color)) : undefined;
  return exact ?? candidates.find(recipe => ['', 'all', 'genel'].includes(fold(recipe.targetColor))) ?? null;
}
