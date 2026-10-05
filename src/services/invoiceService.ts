import {
  api,
  callOp,
  commit,
  type Mutation,
} from '../api/client';
import type {
  Invoice,
  InvoiceItem,
  InvoiceStatus,
  WaybillType,
} from '../types';

/**
 * Fatura yönetimi servisi. erpService'ten bölündü (#46).
 */

export const invoiceService = {
  // --- Invoice Management (Faturalar & Kısmi Faturalandırma) ---
  generateETTN(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  },

  async generateInvoiceNumber(type: 'sales' | 'purchase'): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = type === 'sales' ? `SAT-${year}-` : `ALS-${year}-`;
    const count = await api.invoices.count({ type });
    const nextSeq = (count + 1).toString().padStart(6, '0');
    return `${prefix}${nextSeq}`;
  },

  async getPendingOrdersForInvoicing(contactId?: number, orderType: 'sales' | 'purchase' = 'sales') {
    let query = api.orders.list({ where: { type: orderType } });
    if (contactId) {
      query = api.orders.list({ where: { 'type+contactId': [orderType, contactId] } }) as any;
    }
    
    const allOrders = contactId 
      ? (await api.orders.list({ where: { contactId } })).filter(o => o.type === orderType)
      : await api.orders.list({ where: { type: orderType } });

    const openOrders = allOrders.filter(o => o.status !== 'cancelled' && o.invoicingStatus !== 'fully_invoiced');

    const result = [];
    for (const order of openOrders) {
      const items = await api.orderItems.list({ where: { orderId: order.id! } });
      const itemsWithRemaining = items.map(item => {
        const invoicedQty = item.invoicedQuantity || 0;
        const remainingQty = Math.max(0, item.quantity - invoicedQty);
        return {
          ...item,
          invoicedQuantity: invoicedQty,
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

  async getPendingWaybillsForInvoicing(contactId?: number, type?: WaybillType) {
    let query = api.waybills.list({ where: { status: 'issued' } });
    const issuedWaybills = await query;

    const pendingWaybills = issuedWaybills.filter(wb => {
      const notInvoiced = !wb.invoicedStatus || wb.invoicedStatus === 'not_invoiced';
      const matchContact = contactId ? wb.contactId === contactId : true;
      const matchType = type ? wb.type === type : true;
      return notInvoiced && matchContact && matchType;
    });

    const result = [];
    for (const wb of pendingWaybills) {
      const items = await api.waybillItems.list({ where: { waybillId: wb.id! } });
      const contact = wb.contactId ? await api.contacts.get(wb.contactId) : null;
      result.push({
        ...wb,
        items,
        contact
      });
    }

    return result;
  },

  async createInvoice(
    invoiceData: Omit<Invoice, 'id'>,
    items: Omit<InvoiceItem, 'id' | 'invoiceId'>[]
  ): Promise<number> {
    // Fatura → kalemler → sipariş/irsaliye bağı → cari → stok → KDV/muhasebe
    // zinciri sunucuda TEK transaction içinde, satır kilitleriyle uygulanır.
    // Toplamlar/KDV/satır tutarları sunucuda yeniden hesaplanır ve doğrulanır.
    const result = await callOp<{ invoiceId: number }>('create-invoice', {
      invoice: invoiceData,
      items,
    });
    return result.invoiceId;
  },

  async cancelInvoice(id: number, reason?: string): Promise<void> {
    // İptal; cari + stok + sipariş/irsaliye + muhasebe (ters kayıt) etkilerini
    // sunucuda tek transaction içinde atomik olarak geri alır. Çift iptal,
    // fatura satırı kilit altında durum kontrolüyle (409) engellenir.
    await callOp('cancel-invoice', { invoiceId: id, reason });
  },

  async getInvoice(id: number) {
    const invoice = await api.invoices.get(id);
    if (!invoice) return null;
    const items = await api.invoiceItems.list({ where: { invoiceId: id } });
    const contact = invoice.contactId ? await api.contacts.get(invoice.contactId) : null;
    const order = invoice.orderId ? await api.orders.get(invoice.orderId) : null;
    return { ...invoice, items, contact, order };
  },

  async updateInvoiceStatus(id: number, status: InvoiceStatus) {
    if (status === 'cancelled') {
      return await this.cancelInvoice(id);
    }

    if (status === 'issued') {
      // Taslak → düzenlendi: cari + stok + muhasebe sunucuda tek transaction'da
      // işlenir (idempotent — fatura zaten düzenlenmişse no-op).
      await callOp('issue-invoice', { invoiceId: id });
      return;
    }

    const invoice = await api.invoices.get(id);
    if (!invoice || invoice.status === status) return;
    await commit([{ op: 'update', resource: 'invoices', id, data: { status, updatedAt: new Date() } }]);
  },

  async resetInvoicesAndStockMovements(options?: {
    resetStockMovements?: boolean;
    resetOrdersInvoicing?: boolean;
    resetContactBalances?: boolean;
  }) {
    const resetStock = options?.resetStockMovements !== false;
    const resetOrders = options?.resetOrdersInvoicing !== false;
    const resetContacts = options?.resetContactBalances !== false;

    const mutations: Mutation[] = [];

    // 1. Clear all invoices and invoice items
    mutations.push({ op: 'clear', resource: 'invoices' });
    mutations.push({ op: 'clear', resource: 'invoiceItems' });

    // 2. Clear inventory logs if requested
    if (resetStock) {
      mutations.push({ op: 'clear', resource: 'inventoryLogs' });
    }

    // 3. Reset order item invoiced quantities and order invoicing status
    if (resetOrders) {
      const orderItems = await api.orderItems.list();
      for (const oi of orderItems) {
        if (oi.id) {
          mutations.push({ op: 'update', resource: 'orderItems', id: oi.id, data: { invoicedQuantity: 0 } });
        }
      }

      const orders = await api.orders.list();
      for (const o of orders) {
        if (o.id) {
          mutations.push({
            op: 'update',
            resource: 'orders',
            id: o.id,
            data: {
              invoicingStatus: 'not_invoiced',
              invoicedTotal: 0
            }
          });
        }
      }
    }

    // 4. Reset contact balances if requested — Süper Admin kontrollü uç
    //    (contacts.balance türetilmiş alandır; generic update'e kapalıdır).
    await commit(mutations);
    if (resetContacts) {
      await callOp('reset-balances', { products: false, contacts: true, cashBoxes: false, bankAccounts: false });
    }
  },

  /**
   * Resets all movement and transactional data (stock movements, financial transactions,
   * contact balances, TDHP journal entries, invoices, waybills, work orders, HR logs)
   * EXCEPT for orders created today (and their order items).
   * Master cards (products, contacts, TDHP accounts, recipes, employees, templates) are KEPT intact.
   */
  async resetExceptTodayOrders(options?: { clearWorkOrders?: boolean }): Promise<{
    keptOrdersCount: number;
    deletedOrdersCount: number;
    keptWorkOrdersCount: number;
    deletedWorkOrdersCount: number;
  }> {
    const shouldClearWorkOrders = options?.clearWorkOrders ?? true;

    // Resilient date matcher comparing YYYY-MM-DD
    const getFormattedDate = (d: Date | string | number | undefined): string => {
      if (!d) return '';
      if (typeof d === 'string') {
        const match = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (match) return `${match[1]}-${match[2]}-${match[3]}`;
      }
      const dateObj = new Date(d);
      if (isNaN(dateObj.getTime())) return '';
      const y = dateObj.getFullYear();
      const m = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const isTodayDate = (d: Date | string | number | undefined): boolean => {
      if (!d) return false;
      const formatted = getFormattedDate(d);
      return formatted === todayStr;
    };

    // 1. Mark movements as reset in settings
    try {
      const currentSettings = await api.settings.get('global_barcode');
      if (currentSettings) {
        await api.settings.update('global_barcode', { movementsReset: true, productionReset: true } as any);
      } else {
        await api.settings.save({
          id: 'global_barcode',
          barcodeType: 'CODE-128',
          barcodePrefix: '869',
          nextBarcodeSequence: 1000000,
          movementsReset: true,
          productionReset: true
        } as any);
      }
    } catch (e) {
      console.warn('Ayar güncelleme uyarısı:', e);
    }

    // 1b. Belge/hareket defterleri önce temizlenir: sipariş silme, bağlı fatura/irsaliye
    //      varken politika motoru tarafından 409 ile reddedilir.
    try { await api.inventoryLogs.clear(); } catch (e) { console.warn(e); }
    try { await api.transactions.clear(); } catch (e) { console.warn(e); }
    try { await api.journalEntries.clear(); } catch (e) { console.warn(e); }
    try { await api.collectionReceipts.clear(); } catch (e) { console.warn(e); }
    try { await api.checks.clear(); } catch (e) { console.warn(e); }
    try { await api.invoices.clear(); } catch (e) { console.warn(e); }
    try { await api.invoiceItems.clear(); } catch (e) { console.warn(e); }
    try { await api.waybills.clear(); } catch (e) { console.warn(e); }
    try { await api.waybillItems.clear(); } catch (e) { console.warn(e); }
    try { await api.attendanceRecords.clear(); } catch (e) { console.warn(e); }
    try { await api.leaveRequests.clear(); } catch (e) { console.warn(e); }
    try { await api.payrollRecords.clear(); } catch (e) { console.warn(e); }
    try { await api.advanceRequests.clear(); } catch (e) { console.warn(e); }
    // Denetim izi değiştirilemez/silinemez; reset sırasında da korunur.

    // 2. Identify orders created today vs older
    const allOrders = await api.orders.list();
    const keptOrders = allOrders.filter(o => isTodayDate(o.date) || isTodayDate(o.createdAt));
    const keptOrderIds = new Set(keptOrders.map(o => o.id).filter(Boolean) as number[]);
    const deletedOrders = allOrders.filter(o => !o.id || !keptOrderIds.has(o.id));

    const deletedOrderIds = deletedOrders.map(o => o.id).filter(Boolean) as number[];
    if (deletedOrderIds.length > 0) {
      // Sipariş kalemleri silme motoru tarafından siparişle birlikte cascade edilir.
      await api.orders.removeMany(deletedOrderIds);
    }

    // 3. Handle work orders
    const allWorkOrders = await api.workOrders.list();
    let keptWorkOrdersCount = 0;
    let deletedWorkOrdersCount = 0;

    if (shouldClearWorkOrders) {
      deletedWorkOrdersCount = allWorkOrders.length;
      await api.workOrders.clear();
    } else {
      const keptWorkOrders = allWorkOrders.filter(wo => {
        if (wo.orderId && keptOrderIds.has(wo.orderId)) return true;
        if (isTodayDate(wo.createdAt) || isTodayDate(wo.orderDate)) return true;
        return false;
      });
      const keptWoIds = new Set(keptWorkOrders.map(wo => wo.id).filter(Boolean) as number[]);
      const workOrdersToDelete = allWorkOrders.filter(wo => !wo.id || !keptWoIds.has(wo.id));
      if (workOrdersToDelete.length > 0) {
        const woIdsToDelete = workOrdersToDelete.map(wo => wo.id).filter(Boolean) as number[];
        await api.workOrders.removeMany(woIdsToDelete);
      }
      keptWorkOrdersCount = keptWorkOrders.length;
      deletedWorkOrdersCount = workOrdersToDelete.length;
    }

    // 4. Ürün stokları + cari/kasa/banka bakiyeleri sıfırlanır (master kartlar korunur).
    //      Türetilmiş alanlar generic CRUD'a kapalı olduğundan Süper Admin kontrollü uç kullanılır.
    try {
      await callOp('reset-balances', { products: true, contacts: true, cashBoxes: true, bankAccounts: true });
    } catch (e) {
      console.warn('Bakiye/stok sıfırlama hatası:', e);
    }

    return {
      keptOrdersCount: keptOrders.length,
      deletedOrdersCount: deletedOrders.length,
      keptWorkOrdersCount,
      deletedWorkOrdersCount
    };
  },
};
