import React, { useState, useEffect } from 'react';
import { useApiQuery } from '../../hooks/useApiQuery';
import { api } from '../../api/client';
import { invoiceService } from '../../services/invoiceService';
import type { Invoice, InvoiceItem, InvoiceType, InvoiceStatus, InvoiceScenario, Contact, Order } from '../../types';
import { Receipt, Plus, X, Trash2, ShoppingBag, Package, Check, Truck } from 'lucide-react';
import { cn } from '../../lib/utils';
import { OrderImportSelector, WaybillImportSelector } from './InvoiceImportSelectors';

// -----------------------------------------------------------------------------------------
// CREATE INVOICE MODAL COMPONENT (Full Support for Partial Order Invoicing & Manual Items)
// -----------------------------------------------------------------------------------------

interface CreateInvoiceModalProps {
  isOpen: boolean;
  initialType: InvoiceType;
  initialContactId?: number;
  initialOrderId?: number;
  initialWaybillId?: number;
  onClose: () => void;
  onSuccess: (invoiceId: number) => void;
}

export default function CreateInvoiceModal({
  isOpen,
  initialType,
  initialContactId,
  initialOrderId,
  initialWaybillId,
  onClose,
  onSuccess
}: CreateInvoiceModalProps) {
  const [type, setType] = useState<InvoiceType>(initialType);
  const [scenario, setScenario] = useState<InvoiceScenario>('commercial');
  const [contactId, setContactId] = useState<number | ''>(initialContactId || '');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [ettn, setEttn] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<InvoiceStatus>('issued');
  const [isStockDeducted, setIsStockDeducted] = useState(true);
  const [selectedOrderId, setSelectedOrderId] = useState<number | undefined>(initialOrderId);
  const [selectedOrderNumber, setSelectedOrderNumber] = useState<string | undefined>('');
  const [selectedWaybillId, setSelectedWaybillId] = useState<number | undefined>(initialWaybillId);
  const [selectedWaybillNumber, setSelectedWaybillNumber] = useState<string | undefined>('');

  // Items State
  const [items, setItems] = useState<Omit<InvoiceItem, 'id' | 'invoiceId'>[]>([]);

  // Sub-modal for importing open order items
  const [isOrderSelectorOpen, setIsOrderSelectorOpen] = useState(false);
  const [pendingOrders, setPendingOrders] = useState<any[]>([]);

  // Sub-modal for importing open waybill items
  const [isWaybillSelectorOpen, setIsWaybillSelectorOpen] = useState(false);
  const [pendingWaybills, setPendingWaybills] = useState<any[]>([]);

  // Queries
  const contacts = useApiQuery(() => api.contacts.list(), [], ['contacts']);
  const products = useApiQuery(() => api.products.list(), [], ['products']);

  // Generate initial invoice number and ETTN
  useEffect(() => {
    async function initInvoiceInfo() {
      const num = await invoiceService.generateInvoiceNumber(type);
      setInvoiceNumber(num);
      setEttn(invoiceService.generateETTN());
    }
    initInvoiceInfo();
  }, [type]);

  // Load pending orders and waybills when contact changes
  useEffect(() => {
    async function loadOrdersAndWaybills() {
      if (contactId) {
        const [ords, wbs] = await Promise.all([
          invoiceService.getPendingOrdersForInvoicing(Number(contactId), type),
          invoiceService.getPendingWaybillsForInvoicing(Number(contactId), type)
        ]);
        setPendingOrders(ords);
        setPendingWaybills(wbs);

        // If an initial waybill ID was passed, auto-load its items
        if (initialWaybillId) {
          let targetWb = wbs.find(w => w.id === initialWaybillId);
          if (!targetWb) {
            const rawWb = await api.waybills.get(initialWaybillId);
            if (rawWb) {
              const rawItems = await api.waybillItems.list({ where: { waybillId: initialWaybillId } });
              targetWb = { ...rawWb, items: rawItems };
            }
          }
          if (targetWb) {
            await importWaybillItems(targetWb);
          }
        } else if (initialOrderId && ords.some(o => o.id === initialOrderId)) {
          // If an initial order ID was passed, auto-load its remaining items
          const target = ords.find(o => o.id === initialOrderId);
          if (target) {
            importOrderItems(target);
          }
        }
      } else if (initialWaybillId) {
        // If contact not yet set, load waybill first
        const rawWb = await api.waybills.get(initialWaybillId);
        if (rawWb) {
          const rawItems = await api.waybillItems.list({ where: { waybillId: initialWaybillId } });
          const targetWb = { ...rawWb, items: rawItems };
          if (targetWb.contactId) setContactId(targetWb.contactId);
          if (targetWb.type) setType(targetWb.type);
          await importWaybillItems(targetWb);
        }
      } else {
        setPendingOrders([]);
        setPendingWaybills([]);
      }
    }
    loadOrdersAndWaybills();
  }, [contactId, type, initialOrderId, initialWaybillId]);

  // Helper to import items from a waybill
  const importWaybillItems = async (wb: any) => {
    setSelectedWaybillId(wb.id);
    setSelectedWaybillNumber(wb.waybillNumber);
    if (wb.orderId) {
      setSelectedOrderId(wb.orderId);
      setSelectedOrderNumber(wb.orderNumber || '');
    }
    if (wb.contactId && !contactId) {
      setContactId(wb.contactId);
    }
    if (wb.type) {
      setType(wb.type);
    }

    // Crucial: Waybill already handled physical stock deduction/addition!
    setIsStockDeducted(false);

    let wbItems = wb.items;
    if (!wbItems || wbItems.length === 0) {
      wbItems = await api.waybillItems.list({ where: { waybillId: wb.id } });
    }

    if (wbItems && wbItems.length > 0) {
      const mappedItems: Omit<InvoiceItem, 'id' | 'invoiceId'>[] = wbItems.map((wi: any) => {
        const product = products?.find(p => p.id === wi.productId);
        const qty = wi.quantity || 0;
        let unitPrice = wi.unitPrice || 0;
        if (!unitPrice && product) {
          unitPrice = (wb.type === 'purchase' ? product.buyingPrice : product.sellingPrice) || 0;
        }
        const discountRate = wi.discountRate || 0;
        const taxRate = wi.taxRate || 20;

        const sub = qty * unitPrice;
        const discAmt = (sub * discountRate) / 100;
        const taxable = sub - discAmt;
        const taxAmt = (taxable * taxRate) / 100;
        const tot = taxable + taxAmt;

        return {
          productId: wi.productId,
          orderItemId: wi.orderItemId,
          productCode: wi.productCode || product?.code || 'STK',
          productName: wi.productName || product?.name || 'Ürün',
          color: wi.color,
          size: wi.size,
          quantity: qty,
          unit: wi.unit || 'Çift',
          unitPrice,
          discountRate,
          discountAmount: discAmt,
          taxRate,
          taxAmount: taxAmt,
          total: tot
        };
      });
      setItems(mappedItems);
    }

    if (wb.notes) {
      setNotes((prev) => prev ? `${prev}\nİrsaliye Ref: ${wb.waybillNumber}` : `İrsaliye Ref: ${wb.waybillNumber}`);
    }

    setIsWaybillSelectorOpen(false);
  };

  // Helper to import items from an order
  const importOrderItems = (order: any) => {
    setSelectedOrderId(order.id);
    setSelectedOrderNumber(order.orderNumber);

    const mappedItems: Omit<InvoiceItem, 'id' | 'invoiceId'>[] = order.items.map((oi: any) => {
      const product = products?.find(p => p.id === oi.productId);
      const remaining = oi.remainingQuantity || oi.quantity;
      const unitPrice = oi.unitPrice || 0;
      const discountRate = oi.discountRate || 0;
      const taxRate = oi.taxRate || 20;

      const sub = remaining * unitPrice;
      const discAmt = (sub * discountRate) / 100;
      const taxable = sub - discAmt;
      const taxAmt = (taxable * taxRate) / 100;
      const tot = taxable + taxAmt;

      return {
        productId: oi.productId,
        orderItemId: oi.id,
        productCode: oi.productCode || product?.code || 'STK',
        productName: oi.productName || product?.name || 'Ürün',
        color: oi.color,
        size: oi.size,
        quantity: remaining, // Defaults to full remaining quantity
        unit: 'Çift',
        unitPrice,
        discountRate,
        discountAmount: discAmt,
        taxRate,
        taxAmount: taxAmt,
        total: tot
      };
    });

    setItems(mappedItems);
    setIsOrderSelectorOpen(false);
  };

  // Add blank manual item row
  const addBlankItem = () => {
    const defaultProduct = products && products.length > 0 ? products[0] : null;
    const unitPrice = type === 'sales' ? (defaultProduct?.sellingPrice || 0) : (defaultProduct?.buyingPrice || 0);
    const taxRate = 20;
    const qty = 1;
    const sub = qty * unitPrice;
    const taxAmt = (sub * taxRate) / 100;

    const newItem: Omit<InvoiceItem, 'id' | 'invoiceId'> = {
      productId: defaultProduct?.id,
      productCode: defaultProduct?.code || 'STK-001',
      productName: defaultProduct?.name || 'Yeni Ürün / Hizmet',
      quantity: 1,
      unit: 'Çift',
      unitPrice,
      discountRate: 0,
      discountAmount: 0,
      taxRate: 20,
      taxAmount: taxAmt,
      total: sub + taxAmt
    };
    setItems([...items, newItem]);
  };

  // Update item field and recalculate line taxes
  const updateItemField = (index: number, field: string, value: any) => {
    const updated = [...items];
    const item = { ...updated[index], [field]: value };

    // If product selection changed
    if (field === 'productId') {
      const prod = products?.find(p => p.id === Number(value));
      if (prod) {
        item.productId = prod.id;
        item.productCode = prod.code;
        item.productName = prod.name;
        item.unitPrice = type === 'sales' ? prod.sellingPrice : prod.buyingPrice;
      }
    }

    const qty = Number(item.quantity) || 0;
    const price = Number(item.unitPrice) || 0;
    const discRate = Number(item.discountRate) || 0;
    const taxRate = Number(item.taxRate) || 0;

    const sub = qty * price;
    const discAmt = (sub * discRate) / 100;
    const taxable = sub - discAmt;
    const taxAmt = (taxable * taxRate) / 100;

    item.discountAmount = discAmt;
    item.taxAmount = taxAmt;
    item.total = taxable + taxAmt;

    updated[index] = item;
    setItems(updated);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  // Calculate invoice level totals
  const subtotal = items.reduce((sum, it) => sum + (it.quantity * it.unitPrice), 0);
  const discountTotal = items.reduce((sum, it) => sum + it.discountAmount, 0);
  const taxTotal = items.reduce((sum, it) => sum + it.taxAmount, 0);
  
  // Withholding calculation if scenario is withholding
  let withholdingAmount = 0;
  if (scenario === 'withholding') {
    withholdingAmount = taxTotal * 0.5; // Default 5/10
  }
  const grandTotal = subtotal - discountTotal + taxTotal - withholdingAmount;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactId) {
      alert('Lütfen bir müşteri veya tedarikçi cari seçiniz.');
      return;
    }
    if (items.length === 0) {
      alert('Lütfen faturaya en az bir ürün veya hizmet satırı ekleyiniz.');
      return;
    }

    // Validate quantities
    for (const item of items) {
      if (item.quantity <= 0) {
        alert(`"${item.productName}" satırında miktar 0'dan büyük olmalıdır.`);
        return;
      }
    }

    const invoiceData: Omit<Invoice, 'id'> = {
      invoiceNumber: invoiceNumber.trim() || (await invoiceService.generateInvoiceNumber(type)),
      type,
      scenario,
      contactId: Number(contactId),
      orderId: selectedOrderId,
      orderNumber: selectedOrderNumber,
      waybillId: selectedWaybillId,
      waybillNumber: selectedWaybillNumber,
      date: new Date(date),
      dueDate: dueDate ? new Date(dueDate) : undefined,
      ettn,
      subtotal,
      discountTotal,
      taxTotal,
      withholdingRate: scenario === 'withholding' ? 5 : undefined,
      withholdingAmount: withholdingAmount > 0 ? withholdingAmount : undefined,
      grandTotal,
      currency: 'TRY',
      paymentStatus: 'unpaid',
      status,
      notes,
      isStockDeducted
    };

    try {
      const newInvoiceId = await invoiceService.createInvoice(invoiceData, items);
      onSuccess(newInvoiceId as number);
    } catch (err: any) {
      console.error(err);
      alert('Fatura kaydedilirken bir hata oluştu: ' + err.message);
    }
  };

  const filteredContacts = contacts?.filter(c => {
    if (type === 'sales') return c.type === 'customer' || c.type === 'both';
    return c.type === 'supplier' || c.type === 'both';
  }) || [];

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-5xl shadow-2xl border border-slate-100 dark:border-slate-800 flex flex-col max-h-[92vh] overflow-hidden my-auto animate-in fade-in zoom-in duration-200">
        
        {/* Modal Header */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-10 h-10 rounded-2xl flex items-center justify-center shadow-sm",
              type === 'sales' ? "bg-indigo-600 text-white" : "bg-amber-600 text-white"
            )}>
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-800 dark:text-slate-200 tracking-tight">
                {type === 'sales' ? 'YENİ SATIŞ FATURASI DÜZENLE' : 'YENİ ALIŞ FATURASI GİRİŞİ'}
              </h2>
              <p className="text-xs text-slate-400 font-medium">
                {type === 'sales' ? 'Müşteriye resmi satış faturası kesme ve cari hesap borçlandırma' : 'Tedarikçi alış faturası girişi ve stok/borç güncelleme'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex bg-slate-200/80 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setType('sales')}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all",
                  type === 'sales' ? "bg-white dark:bg-slate-900 text-indigo-600 shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-indigo-600"
                )}
              >
                Satış Faturası
              </button>
              <button
                type="button"
                onClick={() => setType('purchase')}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all",
                  type === 'purchase' ? "bg-white dark:bg-slate-900 text-amber-600 shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-amber-600"
                )}
              >
                Alış Faturası
              </button>
            </div>

            <button 
              onClick={onClose}
              className="w-9 h-9 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-50 dark:bg-slate-800/50 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Form Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Top Form Fields */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Contact Select */}
            <div className="md:col-span-2 space-y-1.5">
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center justify-between">
                <span>{type === 'sales' ? 'Müşteri Cari' : 'Tedarikçi Cari'} *</span>
                {contactId && pendingOrders.length > 0 && (
                  <span className="text-[10px] text-indigo-600 font-bold">
                    ({pendingOrders.length} Bekleyen Sipariş Mevcut)
                  </span>
                )}
              </label>
              <select
                value={contactId}
                onChange={(e) => {
                  setContactId(e.target.value ? Number(e.target.value) : '');
                  setSelectedOrderId(undefined);
                  setSelectedOrderNumber('');
                  setItems([]);
                }}
                required
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              >
                <option value="">-- Cari Seçiniz --</option>
                {filteredContacts.map(c => (
                  <option key={`inv-contact-opt-${c.id}`} value={c.id}>
                    {c.name} {c.taxOffice ? `(${c.taxOffice} V.D. - ${c.taxNumber || ''})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Invoice Number */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                Fatura Seri / Sıra No *
              </label>
              <input
                type="text"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                required
                placeholder="SAT-2026-000001"
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            {/* Scenario */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                Fatura Senaryosu
              </label>
              <select
                value={scenario}
                onChange={(e) => setScenario(e.target.value as InvoiceScenario)}
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              >
                <option value="commercial">Ticari Fatura</option>
                <option value="basic">Temel Fatura</option>
                <option value="withholding">Tevkifatlı Fatura (5/10)</option>
                <option value="return">İade Faturası</option>
                <option value="export">İhracat Faturası</option>
              </select>
            </div>

            {/* Invoice Date */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                Fatura Tarihi *
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            {/* Due Date */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                Vade Tarihi
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            {/* ETTN No (UUID) */}
            <div className="md:col-span-2 space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  e-Fatura / e-Arşiv UUID (ETTN)
                </label>
                <button
                  type="button"
                  onClick={() => setEttn(invoiceService.generateETTN())}
                  className="text-[10px] text-indigo-600 font-bold hover:underline"
                >
                  Yenile
                </button>
              </div>
              <input
                type="text"
                value={ettn}
                onChange={(e) => setEttn(e.target.value)}
                placeholder="UUID"
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Selected Waybill banner if linked */}
          {selectedWaybillNumber && (
            <div className="bg-purple-50 border border-purple-200 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-purple-600 text-white flex items-center justify-center shrink-0">
                  <Truck className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-purple-950 flex items-center gap-2">
                    <span>Bağlı Sevk İrsaliyesi: <strong>{selectedWaybillNumber}</strong></span>
                    <span className="bg-purple-200/80 text-purple-800 text-[10px] px-2 py-0.5 rounded-full font-bold">Faturalandırılıyor</span>
                  </div>
                  <div className="text-[11px] text-purple-700 mt-0.5">
                    Bu fatura irsaliye sevkine istinaden düzenlendiği için stok düşümü irsaliyede yapılmıştır (Mükerrer stok hareketi yapılmaz).
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedWaybillId(undefined);
                  setSelectedWaybillNumber('');
                }}
                className="text-xs font-bold text-purple-700 hover:text-purple-900 hover:underline px-2 py-1 self-start sm:self-center cursor-pointer"
              >
                İrsaliye Bağlantısını Kaldır
              </button>
            </div>
          )}

          {/* Import from Orders & Waybills banner / buttons */}
          <div className="bg-gradient-to-r from-indigo-50 to-slate-50 p-4 rounded-2xl border border-indigo-100 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                <ShoppingBag className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-indigo-950">
                  {selectedOrderNumber ? `Bağlı Sipariş: ${selectedOrderNumber}` : 'Sipariş veya İrsaliyeden Otomatik Kalem Aktarımı'}
                </div>
                <div className="text-[11px] text-indigo-700/80">
                  {selectedOrderNumber 
                    ? 'Siparişin kalan miktarları aktarıldı. İhtiyacınıza göre kısmi fatura adetlerini satırlarda düzenleyebilirsiniz.'
                    : 'Cariye ait bekleyen açık sipariş veya sevk irsaliyelerini çağırarak tek tıkla fatura kesin.'}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!contactId) {
                    alert('Lütfen önce bir cari seçiniz.');
                    return;
                  }
                  setIsWaybillSelectorOpen(true);
                }}
                className="bg-purple-600 hover:bg-purple-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-sm shrink-0 cursor-pointer"
              >
                <Truck className="w-3.5 h-3.5" />
                İrsaliyeden Çağır ({pendingWaybills.length})
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!contactId) {
                    alert('Lütfen önce bir cari seçiniz.');
                    return;
                  }
                  setIsOrderSelectorOpen(true);
                }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-sm shrink-0 cursor-pointer"
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                Siparişten Çağır ({pendingOrders.length})
              </button>

              <button
                type="button"
                onClick={addBlankItem}
                className="bg-white dark:bg-slate-900 hover:bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Serbest Satır Ekle
              </button>
            </div>
          </div>

          {/* Invoice Items Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
                <Package className="w-4 h-4 text-indigo-600" />
                Fatura Kalemleri & Satır Detayları ({items.length})
              </h3>
              <span className="text-[10px] text-slate-400 font-bold uppercase">
                Tüm tutarlar KDV hariç birim fiyattır
              </span>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                  <tr>
                    <th className="px-3 py-3 w-12 text-center">#</th>
                    <th className="px-3 py-3">Ürün / Hizmet</th>
                    <th className="px-3 py-3 w-28">Renk / Beden</th>
                    <th className="px-3 py-3 w-24 text-right">Miktar</th>
                    <th className="px-3 py-3 w-20">Birim</th>
                    <th className="px-3 py-3 w-28 text-right">Birim Fiyat (₺)</th>
                    <th className="px-3 py-3 w-20 text-right">İsk %</th>
                    <th className="px-3 py-3 w-20 text-right">KDV %</th>
                    <th className="px-3 py-3 w-32 text-right">Satır Net Tutar</th>
                    <th className="px-3 py-3 w-10 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-slate-400 font-medium">
                        Henüz kalem eklenmedi. "Siparişten Çağır" veya "Serbest Satır Ekle" butonunu kullanın.
                      </td>
                    </tr>
                  ) : (
                    items.map((item, idx) => {
                      const itemProd = products?.find(p => p.id === item.productId);
                      const isFootwear = itemProd?.isFootwear || (itemProd?.variantBarcodes && itemProd.variantBarcodes.length > 0);
                      const prodColors = itemProd?.colors || [];
                      const prodSizes = itemProd?.assortment?.map(a => a.size) || [];

                      return (
                        <tr key={`inv-item-row-${item.productId || 'p'}-${idx}`} className="hover:bg-slate-50 dark:bg-slate-800/50/60 transition-colors">
                          <td className="px-3 py-2.5 text-center font-mono text-slate-400 font-bold">
                            {idx + 1}
                          </td>
                          <td className="px-3 py-2.5">
                            <select
                              value={item.productId || ''}
                              onChange={(e) => updateItemField(idx, 'productId', e.target.value)}
                              className="w-full px-2 py-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-800 dark:text-slate-200"
                            >
                              {products?.map(p => (
                                <option key={`inv-prod-opt-${p.id}`} value={p.id}>
                                  [{p.code}] {p.name} {p.isFootwear ? `(Asortili - ${p.multiplier || 8}'li Koli)` : ''}
                                </option>
                              ))}
                            </select>
                            {isFootwear && (
                              <div className="text-[10px] text-indigo-600 font-medium mt-0.5">
                                {item.size && item.size !== 'Asorti' && item.size !== 'Tüm Bedenler' 
                                  ? `Tek Beden: ${item.size}` 
                                  : `Asorti Dağılımı (${itemProd?.multiplier ? `~${(item.quantity / (itemProd.multiplier || 1)).toFixed(1)} Koli` : 'Tüm Bedenler'})`}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex gap-1">
                              {prodColors.length > 0 ? (
                                <select
                                  value={item.color || ''}
                                  onChange={(e) => updateItemField(idx, 'color', e.target.value)}
                                  className="w-20 px-1 py-1 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded text-[11px] font-medium text-slate-800 dark:text-slate-200"
                                >
                                  <option value="">Renk Seç</option>
                                  {prodColors.map((c, cIdx) => <option key={`inv-color-${c}-${cIdx}`} value={c}>{c}</option>)}
                                </select>
                              ) : (
                                <input
                                  type="text"
                                  placeholder="Renk"
                                  value={item.color || ''}
                                  onChange={(e) => updateItemField(idx, 'color', e.target.value)}
                                  className="w-16 px-1.5 py-1 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded text-[11px]"
                                />
                              )}

                              {isFootwear ? (
                                <select
                                  value={item.size || 'Asorti'}
                                  onChange={(e) => updateItemField(idx, 'size', e.target.value)}
                                  className="w-24 px-1 py-1 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded text-[11px] font-bold text-indigo-700"
                                >
                                  <option value="Asorti">Asorti</option>
                                  {prodSizes.map(s => <option key={s} value={s}>Beden {s}</option>)}
                                </select>
                              ) : (
                                <input
                                  type="text"
                                  placeholder="Beden"
                                  value={item.size || ''}
                                  onChange={(e) => updateItemField(idx, 'size', e.target.value)}
                                  className="w-14 px-1.5 py-1 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded text-[11px]"
                                />
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <input
                              type="number"
                              min="1"
                              step="any"
                              value={item.quantity}
                              onChange={(e) => updateItemField(idx, 'quantity', Number(e.target.value))}
                              className="w-20 px-2 py-1 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-right font-mono font-bold text-indigo-700"
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            <select
                              value={item.unit || 'Çift'}
                              onChange={(e) => updateItemField(idx, 'unit', e.target.value)}
                              className="w-16 px-1.5 py-1 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded text-[11px]"
                            >
                              <option value="Çift">Çift</option>
                              <option value="Adet">Adet</option>
                              <option value="Metre">Metre</option>
                              <option value="Kg">Kg</option>
                              <option value="Kutu">Kutu</option>
                              <option value="Paket">Paket</option>
                            </select>
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={item.unitPrice}
                              onChange={(e) => updateItemField(idx, 'unitPrice', Number(e.target.value))}
                              className="w-24 px-2 py-1 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-right font-mono font-bold text-slate-800 dark:text-slate-200"
                            />
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={item.discountRate}
                              onChange={(e) => updateItemField(idx, 'discountRate', Number(e.target.value))}
                              className="w-16 px-1.5 py-1 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-right font-mono"
                            />
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <select
                              value={item.taxRate}
                              onChange={(e) => updateItemField(idx, 'taxRate', Number(e.target.value))}
                              className="w-16 px-1 py-1 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-right font-mono font-bold"
                            >
                              <option value={0}>%0</option>
                              <option value={1}>%1</option>
                              <option value={10}>%10</option>
                              <option value={20}>%20</option>
                            </select>
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                            ₺{item.total.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <button
                              type="button"
                              onClick={() => removeItem(idx)}
                              className="text-slate-300 hover:text-rose-600 transition-colors p-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bottom Grid: Options & Totals */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            {/* Notes & Options */}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  Fatura Açıklaması / Dipnot (e-Arşiv Metni)
                </label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Banka hesap bilgileri, teslimat notu veya e-fatura özel açıklamaları..."
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 placeholder:text-slate-300"
                />
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50/50 cursor-pointer hover:bg-slate-50 dark:bg-slate-800/50">
                  <input
                    type="checkbox"
                    checked={isStockDeducted}
                    onChange={(e) => setIsStockDeducted(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <div className="text-xs">
                    <span className="font-bold text-slate-800 dark:text-slate-200 block">Stok Hareketi Otomatik İşlensin (Asorti & Beden Dağılımlı)</span>
                    <span className="text-slate-500 dark:text-slate-400 text-[10px]">
                      {type === 'sales' 
                        ? 'Ayakkabı modellerinde stoklar asorti şablonuna göre beden bazında (örn. 40, 41, 42...) depodan anında düşülür ve stok detay raporuna yansır.' 
                        : 'Faturadaki ürünler asorti oranlarına göre depoya stok girişi yapılır.'}
                    </span>
                  </div>
                </label>

                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-slate-600">Kayıt Durumu:</span>
                  <label className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-200 cursor-pointer">
                    <input
                      type="radio"
                      name="status"
                      value="issued"
                      checked={status === 'issued'}
                      onChange={() => setStatus('issued')}
                      className="text-indigo-600"
                    />
                    <span>Resmi Olarak Kes (Bakiyeye Yansıt)</span>
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-200 cursor-pointer">
                    <input
                      type="radio"
                      name="status"
                      value="draft"
                      checked={status === 'draft'}
                      onChange={() => setStatus('draft')}
                      className="text-indigo-600"
                    />
                    <span>Taslak Olarak Kaydet</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Calculations Box */}
            <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
              <div className="flex justify-between text-xs text-slate-600">
                <span>Ara Toplam (Matrah):</span>
                <span className="font-mono font-bold">
                  ₺{subtotal.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>

              {discountTotal > 0 && (
                <div className="flex justify-between text-xs text-rose-600">
                  <span>Toplam İskonto:</span>
                  <span className="font-mono font-bold">
                    -₺{discountTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}

              <div className="flex justify-between text-xs text-slate-600">
                <span>Hesaplanan KDV Toplamı:</span>
                <span className="font-mono font-bold text-indigo-600">
                  ₺{taxTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>

              {withholdingAmount > 0 && (
                <div className="flex justify-between text-xs text-purple-700 font-medium">
                  <span>Tevkifat KDV Tutarı (5/10):</span>
                  <span className="font-mono font-bold">
                    -₺{withholdingAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}

              <div className="pt-3 border-t border-slate-200 dark:border-slate-700 flex justify-between items-baseline">
                <span className="text-sm font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                  Genel Toplam:
                </span>
                <span className="text-2xl font-black font-mono text-indigo-600">
                  ₺{grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          {/* Modal Footer Actions */}
          <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50/50 flex items-center justify-end gap-3 -mx-6 -mb-6">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:bg-slate-800 transition-colors uppercase tracking-wider"
            >
              Vazgeç
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold uppercase tracking-wider transition-all shadow-md shadow-indigo-200 flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              Faturayı Kaydet & Oluştur
            </button>
          </div>
        </form>
      </div>

      {/* SUB-MODAL: CHOOSE PENDING ORDER TO IMPORT */}
      {isOrderSelectorOpen && (
        <OrderImportSelector
          pendingOrders={pendingOrders}
          importOrderItems={importOrderItems}
          setIsOrderSelectorOpen={setIsOrderSelectorOpen}
        />
      )}

      {/* SUB-MODAL: CHOOSE PENDING WAYBILL TO IMPORT */}
      {isWaybillSelectorOpen && (
        <WaybillImportSelector
          pendingWaybills={pendingWaybills}
          importWaybillItems={importWaybillItems}
          setIsWaybillSelectorOpen={setIsWaybillSelectorOpen}
        />
      )}
    </div>
  );
}
