import { useState, useEffect } from 'react';
import { useApiQuery } from '../../hooks/useApiQuery';
import { api } from '../../api/client';
import { invoiceService } from '../../services/invoiceService';
import type { ColorMaster, Invoice, InvoiceItem, InvoiceType, InvoiceStatus, InvoiceScenario, Contact, Order } from '../../types';
import { Receipt, Plus, X, Trash2, ShoppingBag, Package, Check, Truck } from 'lucide-react';
import { cn } from '../../lib/utils';
import { getCartonSize } from '../../lib/carton';
import { showToast } from '../../lib/feedback';
import { ColorSelect } from '../Colors/ColorSelect';
import { ContactSelect } from '../Contacts/ContactSelect';
import { ProductSelect } from '../Common/ProductSelect';
import { OrderImportSelector, WaybillImportSelector } from './InvoiceImportSelectors';
import { useProductionDemand, demandOptionSuffix, demandChipText } from '../../services/productionDemand';

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
  const [isStockDeducted, setIsStockDeducted] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
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
  const templates = useApiQuery(() => api.assortmentTemplates.list(), [], ['assortmentTemplates']);
  // Üretimden bekleyen ihtiyaç: yalnızca modal açıkken hesaplanır
  const { demand } = useProductionDemand(isOpen);

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

  /**
   * Renk seçimi satıra hem metin (`color`, tarihsel kolon) hem merkezî kart bağı
   * (`colorId`) olarak yazılır; serbest metin girişi yoktur.
   */
  const updateItemColor = (index: number, colorId: number | null, color: ColorMaster | null) => {
    setItems(prev => prev.map((it, i) => (i === index ? { ...it, color: color?.name || undefined, colorId } : it)));
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

  /**
   * Kayıt durumu altbilgi düğmesinden gelir: "Taslak Kaydet" → draft,
   * "Faturayı Kes" → issued (cari bakiyesine yansır).
   */
  const handleSubmit = async (nextStatus: InvoiceStatus) => {
    if (!contactId) {
      showToast('Lütfen bir müşteri veya tedarikçi cari seçiniz.', 'warning');
      return;
    }
    if (items.length === 0) {
      showToast('Lütfen faturaya en az bir ürün veya hizmet satırı ekleyiniz.', 'warning');
      return;
    }
    if (!date) {
      showToast('Fatura tarihi zorunludur.', 'warning');
      return;
    }

    // Validate quantities
    for (const item of items) {
      if (item.quantity <= 0) {
        showToast(`"${item.productName}" satırında miktar 0'dan büyük olmalıdır.`, 'warning');
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
      status: nextStatus,
      notes,
      isStockDeducted
    };

    setIsSubmitting(true);
    try {
      const newInvoiceId = await invoiceService.createInvoice(invoiceData, items);
      onSuccess(newInvoiceId as number);
    } catch (err: any) {
      console.error(err);
      showToast('Fatura kaydedilirken bir hata oluştu: ' + err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredContacts = contacts?.filter(c => {
    if (type === 'sales') return c.type === 'customer' || c.type === 'both';
    return c.type === 'supplier' || c.type === 'both';
  }) || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-5xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl flex flex-col max-h-[96vh] overflow-hidden border border-slate-200 dark:border-slate-700">
        
        {/* Modal Header */}
        <div className="bg-slate-900 text-white p-5 px-6 flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-md",
              type === 'sales' ? "bg-indigo-600 shadow-indigo-500/20" : "bg-amber-600 shadow-amber-500/20"
            )}>
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black tracking-tight">
                {type === 'sales' ? 'Yeni Satış Faturası Düzenle' : 'Yeni Alış Faturası Girişi'}
              </h3>
              <p className="text-xs text-slate-400">
                {type === 'sales' ? 'e-Fatura / e-Arşiv Standartlarında Satış ve Cari Borçlandırma Kaydı' : 'Tedarikçi Alış Faturası, Stok Girişi ve Borç Kaydı'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50 dark:bg-slate-800/50 text-xs">
          
          {/* Top Form Fields */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs">
            {/* Invoice Type Toggle */}
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">Fatura Türü</label>
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                <button
                  type="button"
                  onClick={() => setType('sales')}
                  className={cn(
                    "py-1.5 rounded-lg font-bold text-xs transition-all",
                    type === 'sales' ? "bg-white dark:bg-slate-900 text-indigo-700 shadow-2xs" : "text-slate-600 dark:text-slate-400"
                  )}
                >
                  Satış Faturası
                </button>
                <button
                  type="button"
                  onClick={() => setType('purchase')}
                  className={cn(
                    "py-1.5 rounded-lg font-bold text-xs transition-all",
                    type === 'purchase' ? "bg-white dark:bg-slate-900 text-amber-700 shadow-2xs" : "text-slate-600 dark:text-slate-400"
                  )}
                >
                  Alış Faturası
                </button>
              </div>
            </div>

            {/* Contact Select */}
            <div className="md:col-span-2">
              <label className="font-bold text-slate-700 dark:text-slate-200 mb-1 flex items-center justify-between">
                <span>{type === 'sales' ? 'Müşteri Cari' : 'Tedarikçi Cari'} *</span>
                {contactId && pendingOrders.length > 0 && (
                  <span className="text-[10px] text-indigo-600 font-bold">
                    ({pendingOrders.length} Bekleyen Sipariş Mevcut)
                  </span>
                )}
              </label>
              <ContactSelect
                contacts={filteredContacts}
                value={contactId ? Number(contactId) : null}
                createType={type === 'sales' ? 'customer' : 'supplier'}
                placeholder="-- Cari Seçiniz --"
                onChange={(id) => {
                  setContactId(id ?? '');
                  setSelectedOrderId(undefined);
                  setSelectedOrderNumber('');
                  setItems([]);
                }}
              />
            </div>

            {/* Invoice Number */}
            <div className="space-y-1.5">
              <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">
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
              <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">
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
              <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">
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
              <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">
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
                <label className="font-bold text-slate-700 dark:text-slate-200">
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

          {/* Invoice Items Table */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs overflow-hidden">
            <div className="p-3 px-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Package className="w-4 h-4 text-indigo-600" />
                <span className="font-black text-slate-800 dark:text-slate-200 text-xs">Fatura Kalemleri & Satır Detayları</span>
                <span className="bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full font-bold text-[10px]">
                  {items.length} Kalem
                </span>
                {selectedOrderNumber && (
                  <span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full font-bold text-[10px]">
                    Bağlı Sipariş: {selectedOrderNumber}
                  </span>
                )}
                <span className="text-[10px] text-slate-400 font-bold">Tüm tutarlar KDV hariç birim fiyattır</span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!contactId) {
                      showToast('Lütfen önce bir cari seçiniz.', 'warning');
                      return;
                    }
                    setIsWaybillSelectorOpen(true);
                  }}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs shrink-0 cursor-pointer"
                >
                  <Truck className="w-3.5 h-3.5" />
                  İrsaliyeden Çağır ({pendingWaybills.length})
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (!contactId) {
                      showToast('Lütfen önce bir cari seçiniz.', 'warning');
                      return;
                    }
                    setIsOrderSelectorOpen(true);
                  }}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs shrink-0 cursor-pointer"
                >
                  <ShoppingBag className="w-3.5 h-3.5" />
                  Siparişten Çağır ({pendingOrders.length})
                </button>

                <button
                  type="button"
                  onClick={addBlankItem}
                  className="bg-white dark:bg-slate-900 hover:bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 px-3 py-1 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 shadow-2xs shrink-0 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Serbest Satır Ekle
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800/75 border-b border-slate-200 dark:border-slate-700 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    <th className="p-2.5 w-10 text-center">#</th>
                    <th className="p-2.5 min-w-[220px]">Ürün / Hizmet</th>
                    <th className="p-2.5 w-56">Renk / Beden</th>
                    <th className="p-2.5 w-20 text-center">Miktar</th>
                    <th className="p-2.5 w-16 text-center">Birim</th>
                    <th className="p-2.5 w-24 text-right">Birim Fiyat</th>
                    <th className="p-2.5 w-14 text-center">İsk %</th>
                    <th className="p-2.5 w-16 text-center">KDV %</th>
                    <th className="p-2.5 w-28 text-right">Satır Net Tutar</th>
                    <th className="p-2.5 w-10"></th>
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
                      const prodSizes = itemProd?.assortment?.map(a => a.size) || [];
                      const itemCarton = getCartonSize(itemProd, templates);

                      return (
                        <tr key={`inv-item-row-${item.productId || 'p'}-${idx}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                          <td className="p-2.5 text-center font-mono text-slate-400 font-bold">
                            {idx + 1}
                          </td>
                          <td className="p-2.5">
                            <ProductSelect
                              compact
                              allowClear={false}
                              placeholder="Ürün seçin..."
                              products={products || []}
                              value={item.productId ?? null}
                              onChange={(productId) => updateItemField(idx, 'productId', productId ?? '')}
                              optionSuffix={(p) => {
                                const carton = getCartonSize(p, templates);
                                return [
                                  carton > 1 ? `Asortili ${carton}'li koli` : '',
                                  demandOptionSuffix(p.id != null ? demand.get(p.id) : undefined).trim(),
                                ].filter(Boolean).join(' · ');
                              }}
                            />
                            {item.productId != null && demandChipText(demand.get(item.productId), item.color) && (
                              <div className="mt-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400">
                                {demandChipText(demand.get(item.productId), item.color)}
                              </div>
                            )}
                            {isFootwear && (
                              <div className="text-[10px] text-indigo-600 font-medium mt-0.5">
                                {item.size && item.size !== 'Asorti' && item.size !== 'Tüm Bedenler' 
                                  ? `Tek Beden: ${item.size}` 
                                  : `Asorti Dağılımı (${itemCarton > 1 ? `~${(item.quantity / itemCarton).toFixed(1)} Koli` : 'Tüm Bedenler'})`}
                              </div>
                            )}
                          </td>
                          <td className="p-2.5">
                            <div className="flex gap-1">
                              <ColorSelect
                                compact
                                className="w-28 shrink-0"
                                value={item.colorId ?? null}
                                valueName={item.color}
                                placeholder="Renk"
                                onChange={(colorId, color) => updateItemColor(idx, colorId, color)}
                              />

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
                          <td className="p-2.5">
                            <input
                              type="number"
                              min="1"
                              step="any"
                              value={item.quantity}
                              onChange={(e) => updateItemField(idx, 'quantity', Number(e.target.value))}
                              className="w-full p-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded text-right font-mono font-bold text-indigo-700"
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            <select
                              value={item.unit || 'Çift'}
                              onChange={(e) => updateItemField(idx, 'unit', e.target.value)}
                              className="w-full p-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded text-[11px] text-slate-800 dark:text-slate-200"
                            >
                              <option value="Çift">Çift</option>
                              <option value="Adet">Adet</option>
                              <option value="Metre">Metre</option>
                              <option value="Kg">Kg</option>
                              <option value="Kutu">Kutu</option>
                              <option value="Paket">Paket</option>
                            </select>
                          </td>
                          <td className="p-2.5">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={item.unitPrice}
                              onChange={(e) => updateItemField(idx, 'unitPrice', Number(e.target.value))}
                              className="w-full p-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded text-right font-mono font-bold text-slate-800 dark:text-slate-200"
                            />
                          </td>
                          <td className="p-2.5">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={item.discountRate}
                              onChange={(e) => updateItemField(idx, 'discountRate', Number(e.target.value))}
                              className="w-full p-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded text-right font-mono"
                            />
                          </td>
                          <td className="p-2.5">
                            <select
                              value={item.taxRate}
                              onChange={(e) => updateItemField(idx, 'taxRate', Number(e.target.value))}
                              className="w-full p-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded text-center font-mono font-bold text-slate-800 dark:text-slate-200"
                            >
                              <option value={0}>%0</option>
                              <option value={1}>%1</option>
                              <option value={10}>%10</option>
                              <option value={20}>%20</option>
                            </select>
                          </td>
                          <td className="p-2.5 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                            ₺{item.total.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="p-2.5 text-center">
                            <button
                              type="button"
                              onClick={() => removeItem(idx)}
                              className="text-slate-400 hover:text-rose-600 transition-colors p-1 cursor-pointer"
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

          {/* Bottom Summary & Notes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs">
                <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">
                  Fatura Açıklaması / Dipnot (e-Arşiv Metni)
                </label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Banka hesap bilgileri, teslimat notu veya e-fatura özel açıklamaları..."
                  className="w-full p-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none"
                />
              </div>

              {/* Stok Hareketi Checkbox */}
              <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-700 flex items-start gap-2">
                <input
                  type="checkbox"
                  id="invoiceStockDeduct"
                  checked={isStockDeducted}
                  onChange={(e) => setIsStockDeducted(e.target.checked)}
                  className="w-4 h-4 mt-0.5 text-indigo-600 rounded border-slate-300"
                />
                <label htmlFor="invoiceStockDeduct" className="cursor-pointer">
                  <div className="text-xs">
                    <span className="font-bold text-slate-800 dark:text-slate-200 block">Stok Hareketi Otomatik İşlensin (Asorti & Beden Dağılımlı)</span>
                    <span className="text-slate-500 dark:text-slate-400 text-[10px]">
                      {type === 'sales' 
                        ? 'Ayakkabı modellerinde stoklar asorti şablonuna göre beden bazında (örn. 40, 41, 42...) depodan anında düşülür ve stok detay raporuna yansır.' 
                        : 'Faturadaki ürünler asorti oranlarına göre depoya stok girişi yapılır.'}
                    </span>
                  </div>
                </label>
              </div>
            </div>

            {/* Calculations Box */}
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs space-y-2 font-mono text-xs">
              <div className="flex justify-between text-slate-600 dark:text-slate-300">
                <span className="font-sans font-bold">Ara Toplam (Matrah):</span>
                <span className="font-bold text-slate-900 dark:text-slate-100">
                  ₺{subtotal.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>

              {discountTotal > 0 && (
                <div className="flex justify-between text-rose-600">
                  <span className="font-sans">Toplam İskonto:</span>
                  <span className="font-bold">
                    -₺{discountTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}

              <div className="flex justify-between text-slate-600 dark:text-slate-300">
                <span className="font-sans">Hesaplanan KDV Toplamı:</span>
                <span className="font-bold text-indigo-600">
                  ₺{taxTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>

              {withholdingAmount > 0 && (
                <div className="flex justify-between text-purple-700 dark:text-purple-300">
                  <span className="font-sans">Tevkifat KDV Tutarı (5/10):</span>
                  <span className="font-bold">
                    -₺{withholdingAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-between items-baseline">
                <span className="font-sans text-sm font-black text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                  Genel Toplam:
                </span>
                <span className="text-xl font-black text-indigo-600">
                  ₺{grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

        </div>

        {/* Footer Actions */}
        <div className="p-4 px-6 bg-slate-900 text-white flex items-center justify-between border-t border-slate-800 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            Vazgeç
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleSubmit('draft')}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded-xl text-xs font-bold transition-colors disabled:opacity-60 cursor-pointer"
            >
              Taslak Kaydet
            </button>

            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleSubmit('issued')}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition-all disabled:opacity-60 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Faturayı Kes & Bakiyeye İşle</span>
            </button>
          </div>
        </div>
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
