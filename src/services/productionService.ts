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
    if (specificSize && specificSize.trim() !== '') {
      return [{ size: specificSize.trim(), quantity }];
    }

    // 1. Direct product assortment
    if (product?.assortment && product.assortment.length > 0) {
      const totalAssort = product.assortment.reduce((s: number, a: any) => s + (Number(a.quantity) || 0), 0);
      if (totalAssort > 0) {
        const ratio = quantity / totalAssort;
        let sum = 0;
        const items = product.assortment.map((a: any) => {
          const q = Math.round((Number(a.quantity) || 0) * ratio);
          sum += q;
          return { size: String(a.size), quantity: q };
        });
        const diff = quantity - sum;
        if (diff !== 0 && items.length > 0) {
          items[items.length - 1].quantity += diff;
        }
        return items;
      }
    }

    // 2. Assortment template items
    if (templateItems && templateItems.length > 0) {
      const totalAssort = templateItems.reduce((s: number, a: any) => s + (Number(a.quantity) || 0), 0);
      if (totalAssort > 0) {
        const ratio = quantity / totalAssort;
        let sum = 0;
        const items = templateItems.map((a: any) => {
          const q = Math.round((Number(a.quantity) || 0) * ratio);
          sum += q;
          return { size: String(a.size), quantity: q };
        });
        const diff = quantity - sum;
        if (diff !== 0 && items.length > 0) {
          items[items.length - 1].quantity += diff;
        }
        return items;
      }
    }

    // 3. Variant barcodes size set
    if (product?.variantBarcodes && product.variantBarcodes.length > 0) {
      const uniqueSizes: string[] = Array.from(new Set<string>(product.variantBarcodes.map((v: any) => String(v.size)).filter(Boolean)));
      if (uniqueSizes.length > 0) {
        uniqueSizes.sort((a: string, b: string) => {
          const na = parseFloat(a);
          const nb = parseFloat(b);
          if (!isNaN(na) && !isNaN(nb)) return na - nb;
          return a.localeCompare(b);
        });

        const count = uniqueSizes.length;
        let weights: number[] = [];
        if (count === 5) weights = [1, 2, 2, 2, 1];
        else if (count === 6) weights = [1, 2, 2, 2, 2, 1];
        else if (count === 4) weights = [1, 2, 2, 1];
        else weights = new Array(count).fill(1);

        const totalWeight = weights.reduce((s, w) => s + w, 0);
        let allocated = 0;
        const items: { size: string; quantity: number }[] = uniqueSizes.map((size, idx) => {
          const q = Math.round(quantity * (weights[idx] / totalWeight));
          allocated += q;
          return { size, quantity: q };
        });
        const diff = quantity - allocated;
        if (diff !== 0 && items.length > 0) {
          items[Math.floor(items.length / 2)].quantity += diff;
        }
        return items;
      }
    }

    // 4. Default standard 40-44 classic shoe distribution (Standard ratio: 1/8, 2/8, 2/8, 2/8, 1/8)
    const defaultSizes = ['40', '41', '42', '43', '44'];
    const weights = [1, 2, 2, 2, 1];
    const totalWeight = 8;
    let allocated = 0;
    const items = defaultSizes.map((size, idx) => {
      const q = Math.round(quantity * (weights[idx] / totalWeight));
      allocated += q;
      return { size, quantity: q };
    });
    const diff = quantity - allocated;
    if (diff !== 0 && items.length > 2) {
      items[2].quantity += diff;
    }
    return items;
  },

  generateDefaultStages(): WorkOrderStageLog[] {
    return PRODUCTION_STAGES_CONFIG.map(st => ({
      stage: st.id,
      stageName: st.label,
      status: st.id === 'planning' ? 'in_progress' : 'pending',
      startedAt: st.id === 'planning' ? new Date() : undefined
    }));
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
    size?: string;
    assortmentBreakdown?: { size: string; quantity: number }[];
    targetDate?: Date;
    notes?: string;
    operator?: string;
  }) {
    const recipe = await api.recipes.findOne({ productId: data.productId });
    const prod = await api.products.get(data.productId);
    
    // Determine initial material status
    let materialStatus: MaterialReadinessStatus = 'no_recipe';
    if (recipe && recipe.ingredients.length > 0) {
      materialStatus = 'pending_mrp';
    }

    const defaultStages = this.generateDefaultStages();

    // Compute assortment breakdown if not passed
    let computedAssortment = data.assortmentBreakdown;
    if (!computedAssortment || computedAssortment.length === 0) {
      let templateItems: { size: string; quantity: number }[] | undefined = undefined;
      if (prod?.assortmentTemplateId) {
        const tmpl = await api.assortmentTemplates.get(prod.assortmentTemplateId);
        templateItems = tmpl?.items;
      }
      computedAssortment = this.computeAssortmentDistribution(prod, data.quantity, data.size, templateItems);
    }

    // Preliminary add to get ID
    // not: kimlik zinciri nedeniyle iki adımlı yazma
    const initialId = await api.workOrders.create({
      productId: data.productId,
      quantity: data.quantity,
      status: 'pending',
      currentStage: 'planning',
      stages: defaultStages,
      createdAt: new Date(),
      targetDate: data.targetDate,
      orderId: data.orderId,
      orderItemId: data.orderItemId,
      orderNumber: data.orderNumber,
      customerName: data.customerName,
      customerCode: data.customerCode,
      orderDate: data.orderDate || new Date(),
      documentNo: data.documentNo || prod?.documentNo,
      moldCode: data.moldCode || prod?.moldCode,
      moldGroup: data.moldGroup || prod?.moldGroup,
      color: data.color,
      size: data.size,
      assortmentBreakdown: computedAssortment,
      notes: data.notes,
      operator: data.operator,
      materialStatus,
      recipeId: recipe?.id,
      barcode: `WO-${Date.now().toString().slice(-6)}`
    });

    // Update with standardized barcode containing the work order ID
    const formattedBarcode = `WO-${initialId.toString().padStart(6, '0')}`;
    await api.workOrders.update(initialId, { barcode: formattedBarcode });

    return initialId;
  },

  async createWorkOrdersFromOrder(orderId: number) {
    const order = await api.orders.get(orderId);
    if (!order) throw new Error('Sipariş bulunamadı');
    
    const contact = await api.contacts.get(order.contactId);
    const items = await api.orderItems.list({ where: { orderId } });
    const existingWOs = await api.workOrders.list({ where: { orderId } });
    
    const createdIds: number[] = [];
    const mutations: Mutation[] = [];

    for (const item of items) {
      const product = await api.products.get(item.productId);
      if (!product || product.isRawMaterial) continue; // Only produce finished/semi-finished goods

      // Check if an existing active work order exists for this item
      const alreadyExists = existingWOs.some(w => 
        w.productId === item.productId && 
        w.orderItemId === item.id &&
        w.status !== 'cancelled'
      );
      if (alreadyExists) continue;

      const recipe = await api.recipes.findOne({ productId: item.productId });
      const materialStatus: MaterialReadinessStatus = recipe ? 'pending_mrp' : 'no_recipe';

      const defaultStages = this.generateDefaultStages();

      // Calculate size distribution
      let templateItems: { size: string; quantity: number }[] | undefined = undefined;
      if (product.assortmentTemplateId) {
        const tmpl = await api.assortmentTemplates.get(product.assortmentTemplateId);
        templateItems = tmpl?.items;
      }
      const assortmentBreakdown = this.computeAssortmentDistribution(product, item.quantity, item.size, templateItems);

      // not: kimlik zinciri nedeniyle iki adımlı yazma
      const woId = await api.workOrders.create({
        productId: item.productId,
        quantity: item.quantity,
        status: 'pending',
        currentStage: 'planning',
        stages: defaultStages,
        createdAt: new Date(),
        targetDate: order.deliveryDate,
        orderId: order.id,
        orderItemId: item.id,
        orderNumber: order.orderNumber,
        customerName: contact?.name,
        customerCode: contact?.code,
        orderDate: order.date,
        documentNo: product.documentNo,
        moldCode: product.moldCode,
        moldGroup: product.moldGroup,
        color: item.color,
        size: item.size,
        assortmentBreakdown,
        notes: `Sipariş: ${order.orderNumber} - ${item.color || ''} ${item.size ? 'Beden: ' + item.size : ''}`,
        materialStatus,
        recipeId: recipe?.id,
        barcode: `WO-${Date.now().toString().slice(-6)}`
      });

      const formattedBarcode = `WO-${woId.toString().padStart(6, '0')}`;
      mutations.push({ op: 'update', resource: 'workOrders', id: woId, data: { barcode: formattedBarcode } });
      createdIds.push(woId);
    }

    await commit(mutations);

    return createdIds;
  },

  async startWorkOrder(id: number, operator?: string) {
    const order = await api.workOrders.get(id);
    if (!order) throw new Error('İş emri bulunamadı');

    const updatedStages = (order.stages || this.generateDefaultStages()).map(st => {
      if (st.stage === 'cutting') {
        return { ...st, status: 'in_progress' as const, startedAt: new Date(), operator: operator || st.operator };
      }
      if (st.stage === 'planning') {
        return { ...st, status: 'completed' as const, completedAt: new Date() };
      }
      return st;
    });

    return await api.workOrders.update(id, { 
      status: 'in_progress',
      currentStage: 'cutting',
      stages: updatedStages,
      operator: operator || order.operator
    });
  },

  async advanceWorkOrderStage(
    id: number, 
    targetStage?: ProductionStage, 
    options?: { operator?: string; scrapQuantity?: number; notes?: string }
  ) {
    const order = await api.workOrders.get(id);
    if (!order) throw new Error('İş emri bulunamadı');
    if (order.status === 'completed') throw new Error('Bu iş emri zaten tamamlandı!');

    const stageOrderList: ProductionStage[] = [
      'planning',
      'cutting',
      'printing',
      'sewing',
      'assembly',
      'finishing',
      'quality_packing',
      'completed'
    ];

    const currentIdx = stageOrderList.indexOf(order.currentStage);
    let nextStage: ProductionStage;

    if (targetStage) {
      nextStage = targetStage;
    } else {
      const nextIdx = Math.min(stageOrderList.length - 1, currentIdx + 1);
      nextStage = stageOrderList[nextIdx];
    }

    const now = new Date();
    let stages = order.stages && order.stages.length > 0 ? [...order.stages] : this.generateDefaultStages();

    // Mark current stage completed
    stages = stages.map(s => {
      if (s.stage === order.currentStage) {
        return {
          ...s,
          status: 'completed' as const,
          completedAt: now,
          operator: options?.operator || s.operator || order.operator,
          scrapQuantity: options?.scrapQuantity !== undefined ? options.scrapQuantity : s.scrapQuantity,
          notes: options?.notes || s.notes
        };
      }
      if (s.stage === nextStage) {
        const newStatus: 'completed' | 'in_progress' = nextStage === 'completed' ? 'completed' : 'in_progress';
        return {
          ...s,
          status: newStatus,
          startedAt: s.startedAt || now,
          completedAt: nextStage === 'completed' ? now : undefined,
          operator: options?.operator || s.operator || order.operator
        };
      }
      return s;
    });

    const mutations: Mutation[] = [];
    // Stok etkileri (hammadde sarfı + mamul girişi) sunucuda, ürün satırları
    // kilitlenerek ve varyant/asorti dağılımı sunucuda yapılarak uygulanır.
    const movements: {
      productId: number;
      signedQuantity: number;
      color?: string | null;
      size?: string | null;
      type: string;
      description: string;
      date: Date;
    }[] = [];

    // If moving past planning for the first time, consume materials if not already consumed
    if (order.currentStage === 'planning' && nextStage !== 'planning' && order.materialStatus !== 'materials_consumed') {
      const allProductRecipes = await api.recipes.list({ where: { productId: order.productId } });
      const recipe = allProductRecipes.find(r => order.color && r.targetColor === order.color) ||
                     allProductRecipes.find(r => !r.targetColor || r.targetColor === 'all' || r.targetColor === 'Genel') ||
                     allProductRecipes[0];

      if (recipe && recipe.ingredients.length > 0) {
        for (const ing of recipe.ingredients) {
          const totalNeeded = ing.quantity * order.quantity;
          if (!ing.productId || !(totalNeeded > 0)) continue;
          movements.push({
            productId: ing.productId,
            signedQuantity: -totalNeeded,
            color: ing.color || order.color || null,
            size: order.size || null,
            type: 'production_out',
            description: `#${order.barcode} Üretim başlangıcı için harcandı`,
            date: now,
          });
        }
      }
    }

    // If next stage is COMPLETED, finish goods are added to stock
    if (nextStage === 'completed') {
      movements.push({
        productId: order.productId,
        signedQuantity: order.quantity,
        color: order.color || null,
        size: order.size || null,
        type: 'production_in',
        description: `#${order.barcode} Üretimi tamamlandı ve depoya alındı`,
        date: now,
      });

      mutations.push({
        op: 'update',
        resource: 'workOrders',
        id,
        data: {
          status: 'completed',
          currentStage: 'completed',
          completedAt: now,
          stages,
          materialStatus: 'materials_consumed'
        }
      });
    } else {
      mutations.push({
        op: 'update',
        resource: 'workOrders',
        id,
        data: {
          status: 'in_progress',
          currentStage: nextStage,
          stages,
          operator: options?.operator || order.operator
        }
      });
    }

    await commit(mutations);

    if (movements.length) {
      await callOp('production-stock', { movements, workOrderId: id });
    }

    return { nextStage, order };
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
    const recipe = allProductRecipes.find(r => color && r.targetColor === color) ||
                   allProductRecipes.find(r => !r.targetColor || r.targetColor === 'all' || r.targetColor === 'Genel') ||
                   allProductRecipes[0];

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

      const totalNeeded = Number((ing.quantity * quantity).toFixed(3));
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
        quantityPerPair: ing.quantity,
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
