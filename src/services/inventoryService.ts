import {
  api,
  callOp,
  commit,
  stockMovement,
} from '../api/client';
import { accountingService } from './accountingService';

/**
 * Envanter/stok servisi: ürün kartları, stok hareketleri, asorti şablonları ve
 * varyant senkronizasyonu. erpService'ten bölündü (#46). Ayar/barkod-üretim ve
 * reset gibi çapraz kesen işler kendi servislerinde kalır.
 */
export const inventoryService = {
  async adjustStock(
    productId: number,
    quantity: number,
    type: 'in' | 'out',
    description: string,
    variant?: { color?: string; size?: string },
    options?: { unitCost?: number; allowNegative?: boolean }
  ) {
    if (!Number.isFinite(productId)) throw new Error('Geçerli bir ürün seçilmelidir.');
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Stok hareket miktarı sıfırdan büyük olmalıdır.');

    return await stockMovement({
      productId,
      quantity: Math.abs(quantity),
      type,
      description,
      variant,
      unitCost: options?.unitCost,
      allowNegative: options?.allowNegative,
    });
  },

  async adjustInventoryQuantity(
    productId: number,
    quantityDiff: number,
    description: string,
    variant?: { color?: string; size?: string }
  ) {
    const type = quantityDiff >= 0 ? 'in' : 'out';
    return await this.adjustStock(productId, Math.abs(quantityDiff), type, description, variant);
  },

  async addProduct(product: any) {
    const id = await api.products.create({
      ...product,
      stock: product.stock || 0
    });
    // Otomatik TDHP Muhasebe Hesapları Senkronizasyonu (Stok, Satış Geliri, Alış/Maliyet)
    await this.syncProductAccountingAccounts({ ...product, id });
    return id;
  },

  async updateProduct(id: number, product: any) {
    // stock + variantBarcodes türetilmiş alanlardır; generic update'te soyulur.
    // Tanım alanları generic update ile, stok/varyant kontrollü uçtan yazılır.
    const { stock, variantBarcodes, ...definitionData } = product || {};
    const res = await api.products.update(id, definitionData);

    const hasStock = stock !== undefined && stock !== null;
    const hasVariants = variantBarcodes !== undefined;
    if (hasStock || hasVariants) {
      await callOp('product-variants', {
        productId: id,
        ...(hasStock ? { stock: Number(stock) || 0 } : {}),
        ...(hasVariants ? { variantBarcodes } : {}),
        logDelta: true,
      });
    }

    const fullProduct = await api.products.get(id);
    if (fullProduct) {
      await this.syncProductAccountingAccounts(fullProduct);
    }
    return res;
  },

  async syncProductAccountingAccounts(product: any) {
    try {
      const code = product.code ? `${product.code} - ` : '';
      // 1. Envanter / Stok Hesabı (örn. 150.01.001, 152.01.001, 153.01.001)
      if (product.accountingCode?.trim()) {
        await accountingService.registerAccountFromCode({
          code: product.accountingCode.trim(),
          name: `${code}${product.name} (Stok)`,
          type: 'asset',
          sourceModule: 'product',
          description: `Stok Envanter Hesabı (${product.code || ''})`
        });
      }
      // 2. Satış Gelir Hesabı (örn. 600.01.001, 600.20.001)
      if (product.salesAccountCode?.trim()) {
        await accountingService.registerAccountFromCode({
          code: product.salesAccountCode.trim(),
          name: `${code}${product.name} (Satış Geliri)`,
          type: 'revenue',
          sourceModule: 'product',
          description: `Satış Gelir Hesabı (${product.code || ''})`
        });
      }
      // 3. Alış / Maliyet Hesabı (örn. 150.01.001 veya 620.01.001)
      if (product.purchaseAccountCode?.trim()) {
        await accountingService.registerAccountFromCode({
          code: product.purchaseAccountCode.trim(),
          name: `${code}${product.name} (Alış/Maliyet)`,
          sourceModule: 'product',
          description: `Alış / Maliyet Hesabı (${product.code || ''})`
        });
      }
    } catch (err) {
      console.error('Ürün muhasebe hesapları senkronizasyon hatası:', err);
    }
  },

  async deleteProduct(id: number) {
    const logs = await api.inventoryLogs.count({ productId: id });
    if (logs > 0) {
      throw new Error('Bu ürünün stok hareketleri bulunmaktadır. Silmeden önce hareketleri silmelisiniz.');
    }

    const recipes = await api.recipes.count({ productId: id });
    if (recipes > 0) {
      throw new Error('Bu ürün bir reçeteye tanımlıdır. Önce reçeteyi silmelisiniz.');
    }

    return await api.products.remove(id);
  },

  async clearAllProducts() {
    await commit([
      { op: 'clear', resource: 'products' },
      { op: 'clear', resource: 'inventoryLogs' },
      { op: 'clear', resource: 'recipes' },
      { op: 'clear', resource: 'workOrders' },
      { op: 'clear', resource: 'contacts' },
      { op: 'clear', resource: 'transactions' }
    ]);
  },

  async clearAllTemplates() {
    return await api.assortmentTemplates.clear();
  },

  async addAssortmentTemplate(template: { name: string, items: { size: string, quantity: number }[] }) {
    return await api.assortmentTemplates.create(template);
  },

  async updateAssortmentTemplate(id: number, template: { name: string, items: { size: string, quantity: number }[] }) {
    return await api.assortmentTemplates.update(id, template);
  },

  async deleteAssortmentTemplate(id: number) {
    return await api.assortmentTemplates.remove(id);
  },

  async syncProductVariantStocks(_targetProductId?: number) {
    await callOp<{ changed: number[] }>('sync-variant-stocks', {});
  },

  // Fatura/irsaliye stok düşümü sunucuda, ürün satırı kilitlenerek tek
  // transaction içinde uygulanır (products.stock + variantBarcodes türetilmiş
  // alan olduğundan generic CRUD'a kapalıdır; varyant/asorti dağılımı sunucuda).
  async applyItemStockMovement(
    item: { productId: number; quantity: number; color?: string; size?: string; productName?: string },
    isSales: boolean,
    documentNumber: string,
    documentDate: Date,
    reverse: boolean = false
  ) {
    if (!item?.productId) return;
    await callOp('invoice-stock', {
      items: [{ productId: item.productId, quantity: item.quantity, color: item.color ?? null, size: item.size ?? null }],
      isSales,
      documentNumber,
      documentDate: new Date(documentDate),
      reverse,
    });
  },

  async clearAllStockMovements() {
    return await api.inventoryLogs.clear();
  },
};
