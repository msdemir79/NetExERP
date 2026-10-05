import type { AssortmentTemplate, Product } from '../types';

export type AssortmentLine = { size: string; quantity: number };

/**
 * Kartın etkin asortisi: önce kartın kendi asortisi, o boşsa bağlı şablon.
 * Şablondan seçim yapılırken asorti karta da yazıldığı için ikisi normalde
 * aynıdır; şablon yedeği yalnızca eski kartlar içindir.
 */
export function resolveAssortment(
  product?: Product | null,
  templates?: AssortmentTemplate[]
): AssortmentLine[] {
  if (!product) return [];
  const own = Array.isArray(product.assortment) ? product.assortment : [];
  if (own.length) return own;

  const templateId = product.assortmentTemplateId;
  if (!templateId || !templates?.length) return [];
  const items = templates.find(t => Number(t.id) === Number(templateId))?.items;
  return Array.isArray(items) ? items : [];
}

/**
 * Koli içi mamul adedi — projedeki tek doğru kaynak.
 * Öncelik asortidedir (asorti toplamı koli düzenini tanımlar), asorti yoksa
 * karttaki koli çarpanı kullanılır. 0 = koli bilgisi tanımlı değil.
 */
export function getCartonSize(
  product?: Product | null,
  templates?: AssortmentTemplate[]
): number {
  const total = resolveAssortment(product, templates)
    .reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);
  if (total > 0) return total;

  const multiplier = Number(product?.multiplier) || 0;
  return multiplier > 1 ? multiplier : 0;
}
