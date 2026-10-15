import { distributeAssortment, selectProductionRecipe } from '../lib/productionRules';
import {
  api,
  callOp,
  commit,
  consumeRecipe,
  type Mutation,
} from '../api/client';
import type {
  WorkOrder,
  Product,
  Recipe,
  Order,
  OrderItem,
  ProductionStage,
  WorkOrderStageLog,
  MaterialReadinessStatus,
} from '../types';
import {
  calculateMRP,
  createPurchaseOrdersBySupplierFromMRP,
  createPurchaseOrderFromMRP,
} from './productionMrp';
import { ingredientPerUnit, requiredIngredientQuantity } from '../lib/inventoryCalculator';

/**
 * Üretim servisi: iş emirleri, aşama geçişleri, reçeteler (BOM), MRP ve
 * otomatik hammadde düşümü. erpService'ten bölündü (#46). Renk eşleştirme ve
 * aşama konfigürasyonu yardımcıları da bu modülle birlikte taşındı.
 */

export const PRODUCTION_STAGES_CONFIG: {
  id: ProductionStage;
  label: string;
  shortLabel: string;
  description: string;
  order: number;
  color: string;
}[] = [
  { id: 'planning', label: '1. Planlama & Reçete', shortLabel: 'Planlama', description: 'Reçete ve hammadde tahsisi', order: 1, color: 'text-sky-600 bg-sky-50 border-sky-200' },
  { id: 'cutting', label: '2. Kesim (Saya & Taban)', shortLabel: 'Kesim', description: 'Deri, astar ve taban kesimi', order: 2, color: 'text-amber-600 bg-amber-50 border-amber-200' },
  { id: 'printing', label: '3. Baskı, Nakış & Lazer', shortLabel: 'Baskı/Nakış', description: 'Logo, desen ve lazer işlemleri', order: 3, color: 'text-violet-600 bg-violet-50 border-violet-200' },
  { id: 'sewing', label: '4. Saya Dikim & Çatım', shortLabel: 'Dikim/Saya', description: 'Saya parçalarının montajı ve dikimi', order: 4, color: 'text-indigo-600 bg-indigo-50 border-indigo-200' },
  { id: 'assembly', label: '5. Montaj & Kalıplama', shortLabel: 'Montaj/Kalıp', description: 'Kalıba çekme ve tabanlama montajı', order: 5, color: 'text-orange-600 bg-orange-50 border-orange-200' },
  { id: 'finishing', label: '6. Finisaj & Temizlik', shortLabel: 'Finisaj', description: 'Boya, parlatma, temizlik ve rötuş', order: 6, color: 'text-teal-600 bg-teal-50 border-teal-200' },
  { id: 'quality_packing', label: '7. Kalite Kontrol & Paketleme', shortLabel: 'Kalite/Paket', description: 'Son kontrol, kutulama ve kolileme', order: 7, color: 'text-blue-600 bg-blue-50 border-blue-200' },
  { id: 'completed', label: '8. Üretim Tamamlandı (Depo)', shortLabel: 'Tamamlandı', description: 'Mamul depoya giriş yapıldı', order: 8, color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
];

export const productionService = {
  // --- Production & Work Orders ---
  computeAssortmentDistribution(
    product: any,
    quantity: number,
    specificSize?: string,
    templateItems?: { size: string; quantity: number }[]
  ): { size: string; quantity: number }[] {
    return distributeAssortment(product, quantity, specificSize, templateItems);
  },

  async createWorkOrder(data: {
    productId: number;
    quantity: number;
    orderId?: number;
    orderItemId?: number;
    orderNumber?: string;
    customerName?: string;
    customerCode?: string;
    orderDate?: Date | string;
    documentNo?: string;
    moldCode?: string;
    moldGroup?: string;
    color?: string;
    colorId?: number | null;
    size?: string;
    assortmentBreakdown?: { size: string; quantity: number }[];
    targetDate?: Date;
    notes?: string;
    operator?: string;
    line?: string;
  }) {
    const result = await callOp<{ workOrderId: number }>('create-work-order', data);
    return result.workOrderId;
  },
  async createWorkOrdersFromOrder(orderId: number) {
    const result = await callOp<{ ids: number[] }>('order-work-orders', { orderId });
    return result.ids;
  },

  async startWorkOrder(id: number, operator?: string) {
    return this.advanceWorkOrderStage(id, 'cutting', { operator });
  },

  async advanceWorkOrderStage(id: number, targetStage?: ProductionStage, options?: { operator?: string; scrapQuantity?: number; notes?: string }) {
    return callOp<{ nextStage: ProductionStage; order: WorkOrder }>('transition-production', { workOrderId: id, targetStage, ...options });
  },
  async scanWorkOrderBarcode(scannedCode: string, operatorName?: string) {
    const cleanCode = scannedCode.trim().toUpperCase();
    if (!cleanCode) throw new Error('Lütfen geçerli bir barkod okutun.');

    // Look for matching work order by barcode or ID
    let workOrder = await api.workOrders.findOne({ barcode: cleanCode });
    
    // Check if it's formatted like WO-123 or just numeric
    if (!workOrder) {
      if (cleanCode.startsWith('WO-')) {
        const numPart = parseInt(cleanCode.replace('WO-', ''), 10);
        if (!isNaN(numPart)) {
          workOrder = await api.workOrders.get(numPart);
        }
      } else if (!isNaN(Number(cleanCode))) {
        workOrder = await api.workOrders.get(Number(cleanCode));
      }
    }

    if (!workOrder) {
      throw new Error(`[${cleanCode}] barkoduna ait iş emri bulunamadı.`);
    }

    if (workOrder.status === 'completed') {
      return {
        success: false,
        isCompleted: true,
        workOrder,
        message: `#${workOrder.barcode} nolu iş emri zaten tamamlanmıştır.`
      };
    }

    const previousStage = workOrder.currentStage;
    const result = await this.advanceWorkOrderStage(workOrder.id!, undefined, {
      operator: operatorName || 'Barkod Operatörü'
    });

    const product = await api.products.get(workOrder.productId);

    return {
      success: true,
      workOrder: result.order,
      product,
      previousStage,
      newStage: result.nextStage,
      message: `#${workOrder.barcode} (${product?.name || 'Ürün'}) başarıyla [${previousStage}] aşamasından [${result.nextStage}] aşamasına geçirildi.`
    };
  },

  // --- Material Requirements Planning (MRP) ---
  // Hesaplama ve satın alma emri üretimi productionMrp.ts modülünde (#46).
  calculateMRP,
  createPurchaseOrdersBySupplierFromMRP,
  createPurchaseOrderFromMRP,

  async completeWorkOrder(id: number) {
    return await this.advanceWorkOrderStage(id, 'completed');
  },

  async transitionWorkOrderStage(
    id: number,
    targetStage?: ProductionStage,
    options?: { operator?: string; scrapQuantity?: number; notes?: string }
  ) {
    return await this.advanceWorkOrderStage(id, targetStage, options);
  },

  async saveRecipe(recipe: Recipe) {
    const targetColor = recipe.targetColor && recipe.targetColor !== 'all' ? recipe.targetColor.trim() : undefined;
    
    // Find if a recipe already exists for this specific productId and targetColor
    const allRecipes = await api.recipes.list({ where: { productId: recipe.productId } });
    const existing = allRecipes.find(r => {
      const rColor = r.targetColor && r.targetColor !== 'all' ? r.targetColor.trim() : undefined;
      return rColor === targetColor;
    });

    if (existing && existing.id) {
      await api.recipes.update(existing.id, {
        ...recipe,
        targetColor,
        updatedAt: new Date()
      });
      return existing.id;
    }

    return await api.recipes.create({
      ...recipe,
      targetColor,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  },

  async addRecipe(recipe: Recipe) {
    return await this.saveRecipe(recipe);
  },

  async deleteRecipe(id: number) {
    return await api.recipes.remove(id);
  },

  // --- BOM (Product Recipe) & Automatic Material Deduction ---
  async previewRecipeConsumption(params: {
    productId: number;
    quantity: number;
    color?: string;
    size?: string;
  }) {
    const { productId, quantity, color, size } = params;
    const allProductRecipes = await api.recipes.list({ where: { productId } });
    const recipe = selectProductionRecipe(allProductRecipes, productId, color);

    if (!recipe || !recipe.ingredients || recipe.ingredients.length === 0) {
      return {
        hasRecipe: false,
        recipeName: '',
        ingredients: [],
        allSufficient: true
      };
    }

    const finishedProduct = await api.products.get(productId);
    const ingredientPreviews = [];
    let allSufficient = true;

    for (const ing of recipe.ingredients) {
      const raw = await api.products.get(ing.productId);
      if (!raw) continue;

      const totalNeeded = requiredIngredientQuantity(ing, quantity, raw.unit || ing.unit);
      const currentStock = raw.stock || 0;
      const isSufficient = currentStock >= totalNeeded;
      if (!isSufficient) allSufficient = false;

      ingredientPreviews.push({
        productId: raw.id!,
        name: raw.name,
        code: raw.code,
        categoryType: raw.categoryType,
        subType: raw.subType || ing.partName,
        department: ing.department,
        partName: ing.partName,
        unit: raw.unit || ing.unit || 'Adet',
        quantityPerPair: ingredientPerUnit(ing),
        basisQty: Number(ing.basisQty) > 0 ? Number(ing.basisQty) : 1,
        basisQuantity: Number(ing.quantity) || 0,
        totalNeeded,
        currentStock,
        remainingStockAfter: currentStock - totalNeeded,
        isSufficient,
        isMatrixMatched: !!ing.isMatrixMatched
      });
    }

    return {
      hasRecipe: true,
      recipeId: recipe.id,
      recipeName: recipe.name || `${finishedProduct?.name} BOM Reçetesi`,
      targetColor: recipe.targetColor,
      finishedProduct,
      quantity,
      ingredients: ingredientPreviews,
      allSufficient
    };
  },

  /**
   * Reçete (BOM) sarfiyatı ve mamul stoğa giriş.
   *
   * Hammadde düşümü, varyant stokları ve mamul girişi sunucuda TEK transaction
   * içinde ve satır kilidiyle uygulanır: yarıda kalan sarfiyat ya da eşzamanlı
   * üretimlerde kayıp güncelleme oluşmaz.
   */
  async consumeRecipeMaterialsDirectly(params: {
    productId: number;
    quantity: number;
    color?: string;
    size?: string;
    operator?: string;
    notes?: string;
    orderBarcode?: string;
  }) {
    if (!Number.isFinite(params.productId)) throw new Error('Geçerli bir mamul ürün seçilmelidir.');
    if (!Number.isFinite(params.quantity) || params.quantity <= 0) throw new Error('Üretim miktarı sıfırdan büyük olmalıdır.');

    return await consumeRecipe({
      productId: params.productId,
      quantity: params.quantity,
      color: params.color,
      size: params.size,
      operator: params.operator,
      notes: params.notes,
      orderBarcode: params.orderBarcode,
    });
  },
};
