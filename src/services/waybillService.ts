import {
  api,
  callOp,
  commit,
  type Mutation,
} from '../api/client';
import { inventoryService } from './inventoryService';
import type {
  Order,
  OrderStatus,
  Waybill,
  WaybillItem,
  WaybillStatus,
} from '../types';

/**
 * İrsaliye ve sevkiyat yönetimi servisi. erpService'ten bölündü (#46).
 */

export const waybillService = {
  // --- Waybill Management (İrsaliye & Sevkiyat Yönetimi) ---
  async generateWaybillNumber(type: 'sales' | 'purchase'): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = type === 'sales' ? `IRS-${year}-` : `GIR-${year}-`;
    const count = await api.waybills.count({ type });
    const nextSeq = (count + 1).toString().padStart(6, '0');
    return `${prefix}${nextSeq}`;
  },

  async getPendingOrdersForWaybill(contactId?: number, orderType: 'sales' | 'purchase' = 'sales') {
    const allOrders = contactId 
      ? (await api.orders.list({ where: { contactId } })).filter(o => o.type === orderType)
      : await api.orders.list({ where: { type: orderType } });

    const openOrders = allOrders.filter(o => o.status !== 'cancelled' && o.status !== 'completed');

    const result = [];
    for (const order of openOrders) {
      const items = await api.orderItems.list({ where: { orderId: order.id! } });
      const itemsWithRemaining = items.map(item => {
        const shippedQty = item.shippedQuantity || 0;
        const remainingQty = Math.max(0, item.quantity - shippedQty);
        return {
          ...item,
          shippedQuantity: shippedQty,
          remainingQuantity: remainingQty
        };
      }).filter(it => it.remainingQuantity > 0);

      if (itemsWithRemaining.length > 0) {
        result.push({
          ...order,
          items: itemsWithRemaining
        });
      }
    }

    return result;
  },

  async createWaybill(
    waybillData: Omit<Waybill, 'id'>,
    items: Omit<WaybillItem, 'id' | 'waybillId'>[]
  ) {
    // 1. Add Waybill
    // not: kimlik zinciri nedeniyle iki adımlı yazma
    const waybillId = await api.waybills.create({
      ...waybillData,
      createdAt: new Date(),
      updatedAt: new Date()
    } as Waybill);

    // 2. Add Waybill Items
    const itemsWithWaybillId = items.map(item => ({
      ...item,
      waybillId
    }));
    const mutations: Mutation[] = [{ op: 'insertMany', resource: 'waybillItems', rows: itemsWithWaybillId as WaybillItem[] }];

    // 3. Handle Order Shipment link
    if (waybillData.orderId) {
      const orderId = waybillData.orderId;
      const allOrderItems = await api.orderItems.list({ where: { orderId } });

      for (const item of items) {
        if (item.orderItemId) {
          const targetOrderItem = allOrderItems.find(oi => oi.id === item.orderItemId);
          if (targetOrderItem) {
            const prevShipped = targetOrderItem.shippedQuantity || 0;
            const newShipped = prevShipped + item.quantity;
            mutations.push({ op: 'update', resource: 'orderItems', id: targetOrderItem.id!, data: {
              shippedQuantity: newShipped
            } });
            targetOrderItem.shippedQuantity = newShipped;
          }
        }
      }

      const totalOrderedQty = allOrderItems.reduce((sum, oi) => sum + oi.quantity, 0);
      const totalShippedQty = allOrderItems.reduce((sum, oi) => sum + (oi.shippedQuantity || 0), 0);

      let orderStatus: OrderStatus = 'partially_shipped';
      if (totalShippedQty >= totalOrderedQty) {
        orderStatus = 'completed';
      } else if (totalShippedQty === 0) {
        orderStatus = 'confirmed';
      }

      mutations.push({ op: 'update', resource: 'orders', id: orderId, data: { status: orderStatus } });
    }

    await commit(mutations);

    // 4. Variant-Aware Stock Movement (if isStockDeducted !== false and status !== 'draft')
    if (waybillData.isStockDeducted !== false && waybillData.status !== 'draft') {
      const isSales = waybillData.type === 'sales';
      for (const item of items) {
        if (item.productId) {
          await inventoryService.applyItemStockMovement(
            {
              productId: item.productId,
              quantity: item.quantity,
              color: item.color,
              size: item.size,
              productName: item.productName
            },
            isSales,
            waybillData.waybillNumber,
            new Date(waybillData.dispatchDate || waybillData.date),
            false
          );
        }
      }
    }

    return waybillId;
  },

  async cancelWaybill(id: number, reason?: string) {
    // İptal; sipariş sevk miktarları ve stok etkileri sunucuda tek transaction
    // içinde, satır kilitleriyle geri alınır. Faturalandırılmış irsaliye 409 ile
    // reddedilir (çift durum: fatura oluşturulurken irsaliye de kilitlenir).
    await callOp('cancel-waybill', { waybillId: id, reason });
  },

  async getWaybill(id: number) {
    const waybill = await api.waybills.get(id);
    if (!waybill) return null;
    const items = await api.waybillItems.list({ where: { waybillId: id } });
    const contact = waybill.contactId ? await api.contacts.get(waybill.contactId) : null;
    const order = waybill.orderId ? await api.orders.get(waybill.orderId) : null;
    return { ...waybill, items, contact, order };
  },

  async updateWaybillStatus(id: number, status: WaybillStatus) {
    if (status === 'cancelled') {
      return await this.cancelWaybill(id);
    }

    const waybill = await api.waybills.get(id);
    if (!waybill) return;

    const prevStatus = waybill.status;
    if (prevStatus === status) return;

    await commit([{ op: 'update', resource: 'waybills', id, data: { status, updatedAt: new Date() } }]);

    // If transition from draft to issued and stock deduction enabled
    if (prevStatus === 'draft' && status === 'issued' && waybill.isStockDeducted !== false) {
      const items = await api.waybillItems.list({ where: { waybillId: id } });
      const isSales = waybill.type === 'sales';
      for (const item of items) {
        if (item.productId) {
          await inventoryService.applyItemStockMovement(
            {
              productId: item.productId,
              quantity: item.quantity,
              color: item.color,
              size: item.size,
              productName: item.productName
            },
            isSales,
            waybill.waybillNumber,
            new Date(waybill.dispatchDate || waybill.date),
            false
          );
        }
      }
    }
  },

  async resetWaybillsAndShipments(options?: {
    resetStockMovements?: boolean;
    resetOrdersShipment?: boolean;
  }) {
    const resetStock = options?.resetStockMovements !== false;
    const resetOrders = options?.resetOrdersShipment !== false;

    // Stok geri alınacaksa, irsaliyeler silinmeden önce düzenlenenleri ve satırlarını yakala.
    const issuedWaybills: { waybillNumber: string; type: string; date: any; items: any[] }[] = [];
    if (resetStock) {
      const allWaybills = await api.waybills.list({ where: { status: 'issued' } });
      for (const wb of allWaybills) {
        if (!wb.id || wb.isStockDeducted === false) continue;
        const wbItems = await api.waybillItems.list({ where: { waybillId: wb.id } });
        issuedWaybills.push({ waybillNumber: wb.waybillNumber, type: wb.type, date: wb.date, items: wbItems });
      }
    }

    const mutations: Mutation[] = [];

    mutations.push({ op: 'clear', resource: 'waybills' });
    mutations.push({ op: 'clear', resource: 'waybillItems' });

    if (resetOrders) {
      const orderItems = await api.orderItems.list();
      for (const oi of orderItems) {
        if (oi.id) {
          mutations.push({ op: 'update', resource: 'orderItems', id: oi.id, data: { shippedQuantity: 0 } });
        }
      }

      const orders = await api.orders.list();
      for (const o of orders) {
        if (o.id && (o.status === 'completed' || o.status === 'partially_shipped')) {
          mutations.push({ op: 'update', resource: 'orders', id: o.id, data: { status: 'confirmed' } });
        }
      }
    }

    await commit(mutations);

    // Stoğu geri al ve ilgili irsaliye stok hareketi kayıtlarını temizle (kilitli op).
    if (resetStock) {
      for (const wb of issuedWaybills) {
        await callOp('invoice-stock', {
          items: wb.items
            .filter((it) => it.productId)
            .map((it) => ({ productId: it.productId, quantity: it.quantity, color: it.color ?? null, size: it.size ?? null })),
          isSales: wb.type === 'sales',
          documentNumber: wb.waybillNumber,
          documentDate: wb.date ? new Date(wb.date) : undefined,
          reverse: true,
          writeLog: false,
          purgeDocumentLogs: true,
        });
      }
    }
  }
};
