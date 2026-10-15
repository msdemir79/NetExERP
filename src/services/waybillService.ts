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
    return ''; // Numara, belge oluşturma transaction'ında sunucudan alınır.
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
    const result = await callOp<{ waybillId: number; waybillNumber: string }>('create-waybill', { waybill: waybillData, items });
    return result.waybillId;
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
    if (status === 'cancelled') return this.cancelWaybill(id);
    if (status !== 'issued') throw new Error('Kesinleşmiş irsaliye taslağa çevrilemez.');
    await callOp('issue-waybill', { waybillId: id });
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
