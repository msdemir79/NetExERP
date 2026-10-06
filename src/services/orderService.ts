import {
  api,
  commit,
  type Mutation,
} from '../api/client';
import { productionService } from './productionService';
import type {
  Order,
  OrderItem,
  OrderStatus,
} from '../types';

/**
 * Sipariş yönetimi servisi. erpService'ten bölündü (#46).
 */

export const orderService = {
  // --- Order Management ---
  async createOrder(order: Omit<Order, 'id'>, items: Omit<OrderItem, 'id' | 'orderId'>[]) {
    // not: kimlik zinciri nedeniyle iki adımlı yazma
    const orderId = await api.orders.create(order as Order);
    const itemsWithOrderId = items.map(item => ({ ...item, orderId }));
    await commit([{ op: 'insertMany', resource: 'orderItems', rows: itemsWithOrderId as OrderItem[] }]);

    // If it's a confirmed sales order, automatically create work orders for manufactured items
    if (order.type === 'sales' && order.status === 'confirmed') {
      try {
        await productionService.createWorkOrdersFromOrder(orderId);
      } catch (err) {
        console.warn('Otomatik iş emri oluşturulurken uyarı:', err);
      }
    }

    return orderId;
  },

  async canModifyOrDeleteOrder(id: number | string): Promise<{ canModify: boolean; reason?: string; invoices: any[]; waybills: any[] }> {
    const numId = Number(id);
    const allInvoices = await api.invoices.list();
    const activeInvoices = allInvoices.filter(inv => 
      (inv.orderId === id || (inv.orderId !== undefined && !isNaN(numId) && Number(inv.orderId) === numId)) && 
      inv.status !== 'cancelled'
    );

    const allWaybills = await api.waybills.list();
    const activeWaybills = allWaybills.filter(wb => 
      (wb.orderId === id || (wb.orderId !== undefined && !isNaN(numId) && Number(wb.orderId) === numId)) && 
      wb.status !== 'cancelled'
    );

    if (activeInvoices.length > 0) {
      const invNumbers = activeInvoices.map(i => i.invoiceNumber).join(', ');
      return {
        canModify: false,
        reason: `Bu siparişe bağlı oluşturulmuş aktif fatura (${invNumbers}) bulunmaktadır. Sipariş üzerinde değişiklik yapmak veya silmek için önce ilgili faturayı iptal etmeli ya da silmelisiniz.`,
        invoices: activeInvoices,
        waybills: activeWaybills
      };
    }

    if (activeWaybills.length > 0) {
      const wbNumbers = activeWaybills.map(w => w.waybillNumber).join(', ');
      return {
        canModify: false,
        reason: `Bu siparişe bağlı oluşturulmuş aktif irsaliye (${wbNumbers}) bulunmaktadır. Sipariş üzerinde değişiklik yapmak veya silmek için önce ilgili irsaliyeyi iptal etmeli ya da silmelisiniz.`,
        invoices: activeInvoices,
        waybills: activeWaybills
      };
    }

    return { canModify: true, invoices: [], waybills: [] };
  },

  async updateOrder(id: number, order: Partial<Order>, items?: Omit<OrderItem, 'id' | 'orderId'>[]) {
    const check = await this.canModifyOrDeleteOrder(id);
    if (!check.canModify) {
      throw new Error(check.reason);
    }

    const mutations: Mutation[] = [];
    mutations.push({ op: 'update', resource: 'orders', id, data: order });
    if (items) {
      // Remove existing work orders if items are changed to re-synchronize
      mutations.push({ op: 'deleteWhere', resource: 'workOrders', where: { orderId: id } });
      mutations.push({ op: 'deleteWhere', resource: 'orderItems', where: { orderId: id } });
      const itemsWithOrderId = items.map(item => ({ ...item, orderId: id }));
      mutations.push({ op: 'insertMany', resource: 'orderItems', rows: itemsWithOrderId as OrderItem[] });
    }
    await commit(mutations);

    // If sales order is confirmed, recreate work orders
    const currentOrder = await api.orders.get(id);
    if (currentOrder && currentOrder.type === 'sales' && currentOrder.status === 'confirmed') {
      try {
        await productionService.createWorkOrdersFromOrder(id);
      } catch (err) {
        console.warn('İş emri senkronizasyon uyarısı:', err);
      }
    }
  },

  async getOrder(id: number) {
    const order = await api.orders.get(id);
    if (!order) return null;
    const items = await api.orderItems.list({ where: { orderId: id } });
    return { ...order, items };
  },

  async getOrdersByContact(contactId: number) {
    return await api.orders.list({ where: { contactId } });
  },

  async updateOrderStatus(id: number, status: OrderStatus) {
    await commit([{ op: 'update', resource: 'orders', id, data: { status } }]);
    if (status === 'confirmed') {
      const order = await api.orders.get(id);
      if (order && order.type === 'sales') {
        await productionService.createWorkOrdersFromOrder(id);
      }
    }
  },
};
