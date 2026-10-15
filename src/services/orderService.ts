import {
  api,
  callOp,
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
    const result = await callOp<{ orderId: number }>('save-order', { order, items });
    return result.orderId;
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

  async updateOrder(id: number, order: Partial<Order>, items?: Omit<OrderItem, 'id' | 'orderId'>[], expectedVersion?: number) {
    await callOp('save-order', { id, order, items, expectedVersion });
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
