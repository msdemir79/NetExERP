import React from 'react';
import { api } from '../api/client';
import { useNavigate, Link } from 'react-router-dom';
import { useApiQuery } from '../hooks/useApiQuery';
import {
  ShoppingCart,
  Plus,
  Eye,
  Trash2,
  X,
  FileText,
  User,
  Package,
  CheckCircle2,
  Clock,
  AlertCircle,
  Hammer,
  Truck,
  Factory,
  BarChart3,
  Edit2,
  Lock,
  Printer
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { getCartonSize, resolveAssortment } from '../lib/carton';
import DataGrid, { StatusPill, type GridColumn, type PillTone } from './Common/DataGrid';
import ExcelGrid, { type ExcelColumn } from './Common/ExcelGrid';
import Modal from './Modal';
import ProductSelectorModal from './Orders/ProductSelectorModal';
import ColorSizePickerModal from './Orders/ColorSizePickerModal';
import { PurchaseOrderPrintModal } from './Orders/PurchaseOrderPrintModal';
import OrderDetailModal from './Orders/OrderDetailModal';
import DeleteConfirmModal from './Common/DeleteConfirmModal';
import { ContactSelect } from './Contacts/ContactSelect';
import { orderService } from '../services/orderService';
import { productionService } from '../services/productionService';
import PageHeader from './PageHeader';
import type { Order, OrderItem, OrderStatus, OrderType, Product } from '../types';

type OrderTab = 'all' | 'sales' | 'purchase';

export default function Orders() {
  const navigate = useNavigate();
  const orders = useApiQuery(() => api.orders.list({ orderBy: 'id', orderDir: 'desc' }), [], ['orders']);
  const contacts = useApiQuery(() => api.contacts.list(), [], ['contacts']);
  const products = useApiQuery(() => api.products.list(), [], ['products']);
  const templates = useApiQuery(() => api.assortmentTemplates.list(), [], ['assortmentTemplates']);
  const workOrders = useApiQuery(() => api.workOrders.list(), [], ['workOrders']);
  const orderItemsAll = useApiQuery(() => api.orderItems.list(), [], ['orderItems']);
  const invoices = useApiQuery(() => api.invoices.list(), [], ['invoices']);
  const waybills = useApiQuery(() => api.waybills.list(), [], ['waybills']);

  const [activeTab, setActiveTab] = React.useState<OrderTab>('all');
  const [formOrderType, setFormOrderType] = React.useState<OrderType>('sales');
  const [statusFilter, setStatusFilter] = React.useState<string>('all');
  const [isAddModalOpen, setIsAddModalOpen] = React.useState(false);
  const [editingOrderId, setEditingOrderId] = React.useState<number | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = React.useState(false);
  const [selectedOrder, setSelectedOrder] = React.useState<any>(null);
  const [isTransferringToProduction, setIsTransferringToProduction] = React.useState(false);
  const [isProcessing, setIsProcessing] = React.useState(false);
  
  // Silme onayı ortak modal üzerinden yürür (plan + cascade sunucudan gelir).
  const [deleteTarget, setDeleteTarget] = React.useState<{ id: number; orderNumber: string } | null>(null);
  const [feedbackAlert, setFeedbackAlert] = React.useState<{ type: 'success' | 'error'; message: string } | null>(null);
  
  // Product Selector Modal State
  const [isProductSelectorOpen, setIsProductSelectorOpen] = React.useState(false);

  // Color & Size Picker Modal State (Excel grid product pick -> color/size matrix)
  const [colorPick, setColorPick] = React.useState<{ rowIndex: number; product: Product } | null>(null);
  
  // Purchase / Sales Order Print & Email Form Modal State
  const [isPrintModalOpen, setIsPrintModalOpen] = React.useState(false);
  const [printOrderId, setPrintOrderId] = React.useState<number | null>(null);
  
  // Form State
  const [orderItems, setOrderItems] = React.useState<any[]>([]);
  const [selectedContactId, setSelectedContactId] = React.useState<number | null>(null);
  const [orderDate, setOrderDate] = React.useState(new Date().toISOString().split('T')[0]);
  const [deliveryDate, setDeliveryDate] = React.useState('');
  const [orderNumber, setOrderNumber] = React.useState('');
  const [notes, setNotes] = React.useState('');

  // Helper to compute tracking stats for a single order
  const getOrderProgressStats = React.useCallback((orderId: number) => {
    const items = orderItemsAll?.filter(oi => oi.orderId === orderId) || [];
    const orderWOs = workOrders?.filter(wo => wo.orderId === orderId) || [];
    
    const totalOrdered = items.reduce((sum, it) => sum + (it.quantity || 0), 0);
    
    // Produced quantity: completed work orders
    const totalProduced = orderWOs
      .filter(wo => wo.status === 'completed')
      .reduce((sum, wo) => sum + (wo.quantity || 0), 0);
      
    // In progress quantity
    const totalInProduction = orderWOs
      .filter(wo => wo.status === 'in_progress' || wo.status === 'pending')
      .reduce((sum, wo) => sum + (wo.quantity || 0), 0);

    // Shipped quantity: from order items invoiced / shipped fields
    const totalShipped = items.reduce((sum, it) => sum + (it.shippedQuantity || it.invoicedQuantity || 0), 0);

    const remainingToProduce = Math.max(0, totalOrdered - totalProduced);
    const remainingToShip = Math.max(0, totalOrdered - totalShipped);

    const producePercent = totalOrdered > 0 ? Math.min(100, Math.round((totalProduced / totalOrdered) * 100)) : 0;
    const shipPercent = totalOrdered > 0 ? Math.min(100, Math.round((totalShipped / totalOrdered) * 100)) : 0;

    return {
      totalOrdered,
      totalProduced,
      totalInProduction,
      totalShipped,
      remainingToProduce,
      remainingToShip,
      producePercent,
      shipPercent,
      workOrdersCount: orderWOs.length,
      items
    };
  }, [orderItemsAll, workOrders]);

  // Global KPIs for current tab
  const tabKPIs = React.useMemo(() => {
    if (!orders) return { totalOrders: 0, totalOrderedQty: 0, totalProducedQty: 0, totalShippedQty: 0, remainingShipQty: 0 };
    const tabOrders = activeTab === 'all' ? orders : orders.filter(o => o.type === activeTab);
    
    let totalOrderedQty = 0;
    let totalProducedQty = 0;
    let totalShippedQty = 0;

    tabOrders.forEach(o => {
      if (o.id) {
        const stats = getOrderProgressStats(o.id);
        totalOrderedQty += stats.totalOrdered;
        totalProducedQty += stats.totalProduced;
        totalShippedQty += stats.totalShipped;
      }
    });

    return {
      totalOrders: tabOrders.length,
      totalOrderedQty,
      totalProducedQty,
      totalShippedQty,
      remainingShipQty: Math.max(0, totalOrderedQty - totalShippedQty)
    };
  }, [orders, activeTab, getOrderProgressStats]);

  const filteredOrders = React.useMemo(() => {
    if (!orders) return [];
    return orders.filter(o => {
      const matchesType = activeTab === 'all' || o.type === activeTab;

      if (!matchesType) return false;
      if (statusFilter === 'all') return true;

      const stats = o.id ? getOrderProgressStats(o.id) : null;
      if (!stats) return true;

      if (statusFilter === 'pending_prod') return stats.totalProduced < stats.totalOrdered;
      if (statusFilter === 'in_prod') return stats.totalInProduction > 0;
      if (statusFilter === 'ready_ship') return stats.totalProduced > stats.totalShipped;
      if (statusFilter === 'shipped') return stats.totalShipped >= stats.totalOrdered && stats.totalOrdered > 0;
      return true;
    });
  }, [orders, activeTab, statusFilter, getOrderProgressStats]);

  const totals = React.useMemo(() => {
    const filled = orderItems.filter(it => (it.name && String(it.name).trim()) || it.productId);
    const subtotal = filled.reduce((acc, item) => {
      const unit = Number(item.unitPrice) || 0;
      const qty = Number(item.quantity) || 0;
      const disc = Number(item.discountRate) || 0;
      const lineNet = unit * qty * (1 - disc / 100);
      return acc + lineNet;
    }, 0);

    const taxTotal = filled.reduce((acc, item) => {
      const unit = Number(item.unitPrice) || 0;
      const qty = Number(item.quantity) || 0;
      const disc = Number(item.discountRate) || 0;
      const tax = Number(item.taxRate) || 0;
      const lineNet = unit * qty * (1 - disc / 100);
      return acc + (lineNet * (tax / 100));
    }, 0);

    const grandTotal = subtotal + taxTotal;
    return { subtotal, taxTotal, grandTotal };
  }, [orderItems]);

  const openProductSelector = () => {
    setIsProductSelectorOpen(true);
  };

  const handleAddItemFromModal = (newItem: {
    productId: number;
    name: string;
    code: string;
    color?: string;
    colorId?: number | null;
    size?: string;
    isFootwear?: boolean;
    assortmentTemplateId?: number;
    pairsPerBox?: number;
    boxCount?: number;
    quantity: number;
    unitPrice: number;
    taxRate: number;
    discountRate: number;
    total: number;
    unit?: string;
    moldCode?: string;
    matrixBreakdown?: { [size: string]: number };
    notes?: string;
  }) => {
    // Check if identical item (same productId and same color) exists
    const existingIndex = orderItems.findIndex(
      oi => oi.productId === newItem.productId && (oi.color || '').trim().toLowerCase() === (newItem.color || '').trim().toLowerCase()
    );

    if (existingIndex >= 0) {
      const newItems = [...orderItems];
      const existing = newItems[existingIndex];
      const updatedQty = Number(existing.quantity || 0) + Number(newItem.quantity || 0);
      const updatedBoxes = existing.boxCount && newItem.boxCount ? existing.boxCount + newItem.boxCount : newItem.boxCount;
      const disc = Number(newItem.discountRate) || 0;
      const lineNet = (newItem.unitPrice || 0) * updatedQty * (1 - disc / 100);
      const lineTax = lineNet * ((newItem.taxRate || 0) / 100);

      newItems[existingIndex] = {
        ...existing,
        ...newItem,
        quantity: updatedQty,
        boxCount: updatedBoxes,
        total: lineNet + lineTax
      };
      setOrderItems(newItems);
    } else {
      setOrderItems(prev => [...prev, newItem]);
    }
  };

  const removeOrderItem = (index: number) => {
    setOrderItems(orderItems.filter((_, i) => i !== index));
  };

  const handleOpenEditModal = async (orderId: number) => {
    try {
      const check = await orderService.canModifyOrDeleteOrder(orderId);
      if (!check.canModify) {
        setFeedbackAlert({
          type: 'error',
          message: check.reason || 'Bu sipariş faturası veya irsaliyesi kesildiği için değiştirilemez.'
        });
        setTimeout(() => setFeedbackAlert(null), 5000);
        return;
      }

      const orderData = await orderService.getOrder(orderId);
      if (!orderData) {
        setFeedbackAlert({ type: 'error', message: 'Sipariş kaydı bulunamadı.' });
        return;
      }

      setEditingOrderId(orderId);
      setSelectedContactId(orderData.contactId);
      setOrderNumber(orderData.orderNumber);
      setOrderDate(orderData.date ? new Date(orderData.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
      setDeliveryDate(orderData.deliveryDate ? new Date(orderData.deliveryDate).toISOString().split('T')[0] : '');
      setNotes(orderData.notes || '');
      setFormOrderType(orderData.type);

      // Map existing items
      const mappedItems = (orderData.items || []).map(item => {
        const prod = products?.find(p => p.id === item.productId) as any;
        const base = {
          productId: item.productId,
          name: prod ? `${prod.code} — ${prod.name}` : 'Ürün',
          code: prod?.code || '',
          unit: prod?.unit || 'Çift',
          color: item.color,
          size: item.size,
          moldCode: prod?.moldCode,
          isFootwear: prod?.isFootwear,
          assortmentTemplateId: prod?.assortmentTemplateId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          taxRate: item.taxRate,
          discountRate: item.discountRate || 0,
          total: item.total || 0,
          notes: (item as any).notes || ''
        };
        const computed: any = computeOrderItemRow(base, 'quantity');
        const ppb = Number(computed.pairsPerBox) || 0;
        if (ppb > 0) {
          computed.boxCount = Math.max(1, Math.round((Number(item.quantity) || 0) / ppb));
        }
        return computed;
      });

      setOrderItems(mappedItems);
      setIsAddModalOpen(true);
    } catch (error: any) {
      setFeedbackAlert({ type: 'error', message: 'Sipariş düzenleme moduna alınırken hata: ' + (error?.message || error) });
    }
  };

  const handleRequestDelete = (orderId: number, ordNumber: string) => {
    setDeleteTarget({ id: orderId, orderNumber: ordNumber });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const filledItems = orderItems.filter(isFilledOrderItem);
    if (!selectedContactId || filledItems.length === 0) {
      setFeedbackAlert({ type: 'error', message: 'Lütfen bir cari seçin ve en az bir ürün ekleyin.' });
      return;
    }

    const orderData: Omit<Order, 'id'> = {
      type: formOrderType,
      orderNumber: orderNumber || `ORD-${Date.now()}`,
      contactId: selectedContactId,
      date: new Date(orderDate),
      deliveryDate: deliveryDate ? new Date(deliveryDate) : undefined,
      status: 'confirmed',
      totalAmount: totals.subtotal,
      taxAmount: totals.taxTotal,
      discountAmount: 0,
      grandTotal: totals.grandTotal,
      notes,
      currency: 'TRY'
    };

    const items: Omit<OrderItem, 'id' | 'orderId'>[] = filledItems.map(item => {
      const net = item.unitPrice * item.quantity * (1 - (item.discountRate || 0) / 100);
      return {
        productId: item.productId ?? null as any,
        quantity: item.quantity,
        shippedQuantity: 0,
        unitPrice: item.unitPrice,
        taxRate: item.taxRate,
        discountRate: item.discountRate || 0,
        total: net + net * ((item.taxRate || 0) / 100),
        color: item.color,
        size: item.size
      };
    });

    try {
      setIsProcessing(true);
      if (editingOrderId) {
        await orderService.updateOrder(editingOrderId, orderData, items);
        setFeedbackAlert({ type: 'success', message: `"${orderData.orderNumber}" numaralı sipariş başarıyla güncellendi!` });
      } else {
        await orderService.createOrder(orderData, items);
        setFeedbackAlert({ type: 'success', message: `"${orderData.orderNumber}" numaralı sipariş başarıyla oluşturuldu!` });
      }
      setTimeout(() => setFeedbackAlert(null), 4000);
      setIsAddModalOpen(false);
      resetForm();
    } catch (error: any) {
      setFeedbackAlert({ type: 'error', message: 'İşlem sırasında hata oluştu: ' + (error?.message || error) });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCreateWorkOrders = async (orderId: number) => {
    try {
      setIsTransferringToProduction(true);
      await productionService.createWorkOrdersFromOrder(orderId);
      setFeedbackAlert({ type: 'success', message: 'Sipariş için üretim iş emirleri başarıyla oluşturuldu!' });
      setTimeout(() => setFeedbackAlert(null), 4000);
      if (selectedOrder?.id === orderId) {
        const updated = await orderService.getOrder(orderId);
        setSelectedOrder(updated);
      }
    } catch (error: any) {
      setFeedbackAlert({ type: 'error', message: 'İş emri oluşturulurken hata: ' + error.message });
    } finally {
      setIsTransferringToProduction(false);
    }
  };

  // --- Excel-style order item grid helpers ---
  const createBlankOrderItem = (): any => ({
    productId: undefined,
    code: '',
    name: '',
    color: '',
    size: '',
    unit: 'Adet',
    quantity: 1,
    unitPrice: 0,
    taxRate: 20,
    discountRate: 0,
    total: 0,
    boxCount: undefined,
    pairsPerBox: undefined,
    isFootwear: false,
    moldCode: undefined,
  });

  const assortmentOf = (item: any): { size: string; quantity: number }[] => {
    if (item?.assortmentTemplateId) {
      const tpl = (templates || []).find(t => t.id === item.assortmentTemplateId);
      if (tpl) return tpl.items || [];
    }
    if (item?.productId) {
      const prod = (products || []).find(p => p.id === item.productId) as any;
      if (prod?.assortment?.length) return prod.assortment;
    }
    return [];
  };

  const pairsPerBoxOf = (item: any): number => {
    const items = assortmentOf(item);
    if (items.length) return items.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
    if (item?.productId) {
      const prod = (products || []).find(p => p.id === item.productId) as any;
      if (prod?.multiplier > 1) return prod.multiplier;
    }
    return 0;
  };

  const computeOrderItemRow = (item: any, changedKey?: string) => {
    const next: any = { ...item };
    const ppb = pairsPerBoxOf(item);
    next.pairsPerBox = ppb > 0 ? ppb : undefined;

    if (ppb > 0 && (item.isFootwear || assortmentOf(item).length > 0)) {
      const assortment = assortmentOf(item);
      if (changedKey === 'boxCount') {
        const boxes = Math.max(0, Number(next.boxCount) || 0);
        next.quantity = boxes * ppb;
        const matrix: { [size: string]: number } = {};
        assortment.forEach(it => { matrix[it.size] = (Number(it.quantity) || 0) * boxes; });
        next.matrixBreakdown = matrix;
      } else if (changedKey === 'quantity') {
        const qty = Math.max(0, Number(next.quantity) || 0);
        const boxes = Math.max(1, Math.round(qty / ppb));
        next.boxCount = boxes;
        const matrix: { [size: string]: number } = {};
        assortment.forEach(it => { matrix[it.size] = (Number(it.quantity) || 0) * boxes; });
        next.matrixBreakdown = matrix;
      }
    }

    const unit = Number(next.unitPrice) || 0;
    const qty = Number(next.quantity) || 0;
    const disc = Number(next.discountRate) || 0;
    const tax = Number(next.taxRate) || 0;
    const lineNet = unit * qty * (1 - disc / 100);
    next.total = lineNet + lineNet * (tax / 100);
    return next;
  };

  const isFilledOrderItem = (item: any) =>
    Boolean((item.name && String(item.name).trim()) || item.productId);

  const productLookup = (query: string) => {
    const q = (query || '').trim().toLocaleLowerCase('tr-TR');
    return (products || [])
      .filter(p =>
        !q ||
        (p.code || '').toLocaleLowerCase('tr-TR').includes(q) ||
        (p.name || '').toLocaleLowerCase('tr-TR').includes(q) ||
        (p.barcode || '').includes(q)
      )
      .slice(0, 30)
      .map(p => {
        const assortment = resolveAssortment(p, templates);
        const ppb = getCartonSize(p, templates);
        const isAssorti = Boolean(p.isFootwear || assortment.length > 0) && ppb > 0;
        const matrix: { [size: string]: number } = {};
        if (isAssorti) assortment.forEach(it => { matrix[it.size] = Number(it.quantity) || 0; });

        return {
          label: `${p.code} — ${p.name}`,
          hint: `${(formOrderType === 'sales' ? p.sellingPrice : p.buyingPrice || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺${isAssorti ? ` · ${ppb}/koli` : ''}`,
          patch: {
            productId: p.id,
            code: p.code,
            name: `${p.code} — ${p.name}`,
            unit: p.unit || 'Adet',
            unitPrice: formOrderType === 'sales' ? (p.sellingPrice || 0) : (p.buyingPrice || 0),
            taxRate: p.vatRate ?? 20,
            moldCode: p.moldCode,
            isFootwear: p.isFootwear,
            assortmentTemplateId: p.assortmentTemplateId,
            pairsPerBox: isAssorti ? ppb : undefined,
            boxCount: isAssorti ? 1 : undefined,
            quantity: isAssorti ? ppb : 1,
            matrixBreakdown: isAssorti ? matrix : undefined,
          } as any,
        };
      });
  };

  const money = (n: number) => `${(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺`;

  const orderItemColumns: ExcelColumn<any>[] = [
    {
      key: 'name',
      title: 'Ürün / Hizmet',
      type: 'combobox',
      width: 'min-w-[16rem]',
      align: 'left',
      placeholder: 'Ürün kodu/adı yazın veya hizmet girin...',
      lookup: productLookup,
      onPicked: (rowIndex, patch) => {
        const prod = (products || []).find(p => p.id === (patch as any).productId);
        if (prod && ((prod.colors && prod.colors.length > 0) || (prod.variantBarcodes && prod.variantBarcodes.length > 0))) {
          setColorPick({ rowIndex, product: prod });
        }
      },
      required: true,
      extraInfo: (row: any) => {
        const chips: React.ReactNode[] = [];
        if (row.color) chips.push(<span key="c" className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded">Renk: {row.color}</span>);
        if (row.size) chips.push(<span key="s" className="text-[10px] font-black text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">Beden: {row.size}</span>);
        if (row.boxCount && row.pairsPerBox) chips.push(<span key="b" className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded">{row.boxCount} Koli × {row.pairsPerBox}</span>);
        const breakdown = row.matrixBreakdown && Object.entries(row.matrixBreakdown).filter(([, q]) => Number(q) > 0);
        if (breakdown && breakdown.length > 0) {
          chips.push(
            <span key="m" className="text-[10px] font-mono font-bold text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">
              Asorti: {breakdown.map(([size, q]) => `${size}:${q}`).join('  ')}
            </span>
          );
        }
        if (!chips.length) return null;
        return <div className="flex flex-wrap gap-1 px-2 pb-1.5">{chips}</div>;
      },
    },
    { key: 'quantity', title: 'Miktar', type: 'number', width: 'w-20', align: 'center', min: 0, step: 1, placeholder: '0' },
    { key: 'boxCount', title: 'Koli', type: 'number', width: 'w-16', align: 'center', min: 0, step: 1, placeholder: '-' },
    { key: 'unit', title: 'Birim', type: 'text', width: 'w-16', align: 'center', placeholder: 'Adet' },
    { key: 'unitPrice', title: 'Birim Fiyat', type: 'number', width: 'w-24', align: 'right', min: 0, step: 0.01, placeholder: '0,00' },
    { key: 'discountRate', title: 'İsk. %', type: 'number', width: 'w-16', align: 'center', min: 0, max: 100, step: 0.1, placeholder: '0' },
    { key: 'taxRate', title: 'KDV %', type: 'number', width: 'w-16', align: 'center', min: 0, max: 100, step: 0.1, placeholder: '20' },
    {
      key: 'lineNet',
      title: 'Net Tutar',
      type: 'readonly',
      width: 'w-24',
      align: 'right',
      compute: (row: any) => {
        const net = (Number(row.unitPrice) || 0) * (Number(row.quantity) || 0) * (1 - (Number(row.discountRate) || 0) / 100);
        return money(net);
      },
    },
    {
      key: 'lineTax',
      title: 'KDV Tutarı',
      type: 'readonly',
      width: 'w-24',
      align: 'right',
      compute: (row: any) => {
        const net = (Number(row.unitPrice) || 0) * (Number(row.quantity) || 0) * (1 - (Number(row.discountRate) || 0) / 100);
        return money(net * ((Number(row.taxRate) || 0) / 100));
      },
    },
    {
      key: 'total',
      title: 'Toplam',
      type: 'readonly',
      width: 'w-28',
      align: 'right',
      compute: (row: any) => {
        const net = (Number(row.unitPrice) || 0) * (Number(row.quantity) || 0) * (1 - (Number(row.discountRate) || 0) / 100);
        const total = net + net * ((Number(row.taxRate) || 0) / 100);
        return <span className="text-indigo-700 dark:text-indigo-300">{money(total)}</span>;
      },
    },
  ];

  const resetForm = () => {
    setEditingOrderId(null);
    setOrderItems([createBlankOrderItem()]);
    setSelectedContactId(null);
    setOrderDate(new Date().toISOString().split('T')[0]);
    setDeliveryDate('');
    setOrderNumber('');
    setNotes('');
    setFormOrderType(activeTab === 'purchase' ? 'purchase' : 'sales');
  };

  const orderStatusMeta: Record<OrderStatus, { label: string; tone: PillTone }> = {
    draft: { label: 'Taslak', tone: 'slate' },
    confirmed: { label: 'Onaylandı', tone: 'green' },
    partially_shipped: { label: 'Kısmi Sevk', tone: 'amber' },
    completed: { label: 'Tamamlandı', tone: 'green' },
    cancelled: { label: 'İptal', tone: 'red' }
  };

  const orderColumns: GridColumn<Order>[] = [
    {
      key: 'orderNumber',
      title: 'Sipariş & Cari',
      render: (order) => {
        const contact = contacts?.find(c => c.id === order.contactId);
        const meta = orderStatusMeta[order.status] || { label: order.status, tone: 'slate' as PillTone };
        const linkedInvoices = invoices?.filter(inv => inv.orderId === order.id && inv.status !== 'cancelled') || [];
        const linkedWaybills = waybills?.filter(wb => wb.orderId === order.id && wb.status !== 'cancelled') || [];
        const hasActiveWaybill = linkedWaybills.length > 0;
        const hasActiveInvoice = linkedInvoices.length > 0;
        const hasLock = hasActiveInvoice || hasActiveWaybill;
        return (
          <div className="flex items-center gap-2.5">
            <div className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black uppercase shrink-0 border",
              order.type === 'sales' ? "bg-indigo-50 text-indigo-700 border-indigo-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"
            )}>
              {contact?.name?.substring(0, 2) || 'SP'}
            </div>
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-black text-slate-900 dark:text-slate-100 font-mono">{order.orderNumber}</span>
                <span className={cn(
                  "text-[9px] font-black px-1.5 py-0.2 rounded border uppercase",
                  order.type === 'sales' ? "bg-indigo-50 text-indigo-700 border-indigo-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"
                )}>
                  {order.type === 'sales' ? 'Satış' : 'Alış'}
                </span>
                <StatusPill tone={meta.tone}>{meta.label}</StatusPill>
                {hasLock && (
                  <span className="inline-flex items-center gap-1 text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.2 rounded" title="Fatura veya İrsaliyesi kesilmiş">
                    <Lock className="w-2.5 h-2.5 text-amber-600" />
                    {hasActiveInvoice ? 'Faturalı' : 'İrsaliyeli'}
                  </span>
                )}
              </div>
              <div className="text-xs font-bold text-slate-600 truncate max-w-[170px] mt-0.5">{contact?.name}</div>
            </div>
          </div>
        );
      },
      filterValue: (order) => {
        const contact = contacts?.find(c => c.id === order.contactId);
        return `${order.orderNumber} ${contact?.name || ''}`;
      }
    },
    {
      key: 'targetQty',
      title: 'Hedef Sipariş',
      align: 'center',
      sortable: false,
      filterable: false,
      render: (order) => {
        const stats = order.id ? getOrderProgressStats(order.id) : null;
        return (
          <>
            <span className="text-xs font-black text-slate-900 dark:text-slate-100 font-mono">
              {(stats?.totalOrdered || 0).toLocaleString('tr-TR')}
            </span>
            <span className="block text-[9px] font-bold text-slate-400 uppercase">Çift / Adet</span>
          </>
        );
      }
    },
    {
      key: 'production',
      title: 'Üretim Durumu',
      sortable: false,
      filterable: false,
      render: (order) => {
        const stats = order.id ? getOrderProgressStats(order.id) : null;
        const totalOrdered = stats?.totalOrdered || 0;
        const totalProduced = stats?.totalProduced || 0;
        const producePercent = stats?.producePercent || 0;
        return (
          <div className="space-y-0.5 min-w-[150px]">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-blue-700 font-mono text-[11px]">
                {totalProduced} / {totalOrdered}
              </span>
              <span className="text-[9px] font-black text-blue-700 bg-blue-50 px-1 py-0.2 rounded">
                %{producePercent}
              </span>
            </div>
            <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 rounded-full transition-all"
                style={{ width: `${producePercent}%` }}
              />
            </div>
            <div className="text-[9px] font-bold text-slate-400">
              {stats?.workOrdersCount === 0 ? (
                <span className="text-amber-600">İş Emri Açılmadı</span>
              ) : producePercent === 100 ? (
                <span className="text-emerald-600">Üretim Tamamlandı</span>
              ) : (
                <span>{stats?.workOrdersCount} İş Emri Devam Ediyor</span>
              )}
            </div>
          </div>
        );
      }
    },
    {
      key: 'shipment',
      title: 'Sevkiyat Durumu',
      sortable: false,
      filterable: false,
      render: (order) => {
        const stats = order.id ? getOrderProgressStats(order.id) : null;
        const totalOrdered = stats?.totalOrdered || 0;
        const totalShipped = stats?.totalShipped || 0;
        const shipPercent = stats?.shipPercent || 0;
        return (
          <div className="space-y-0.5 min-w-[150px]">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-emerald-700 font-mono text-[11px]">
                {totalShipped} / {totalOrdered}
              </span>
              <span className="text-[9px] font-black text-emerald-700 bg-emerald-50 px-1 py-0.2 rounded">
                %{shipPercent}
              </span>
            </div>
            <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-600 rounded-full transition-all"
                style={{ width: `${shipPercent}%` }}
              />
            </div>
            <div className="text-[9px] font-bold text-slate-400">
              {shipPercent === 100 ? (
                <span className="text-emerald-600">Tamamı Sevk Edildi</span>
              ) : totalShipped > 0 ? (
                <span className="text-amber-600">Kısmi Sevk Edildi</span>
              ) : (
                <span>Sevkiyat Bekliyor</span>
              )}
            </div>
          </div>
        );
      }
    },
    {
      key: 'remaining',
      title: 'Kalan Miktar',
      filterable: false,
      filterValue: (order) => String(order.id ? getOrderProgressStats(order.id).remainingToShip : 0),
      render: (order) => {
        const stats = order.id ? getOrderProgressStats(order.id) : null;
        const remainingProduce = stats?.remainingToProduce || 0;
        const remainingShip = stats?.remainingToShip || 0;
        return (
          <div className="space-y-0.5 text-[11px] font-bold font-mono">
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-bold text-slate-400 uppercase">Kalan Ür:</span>
              <span className={cn(remainingProduce > 0 ? "text-blue-700" : "text-slate-400")}>
                {remainingProduce}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-bold text-slate-400 uppercase">Kalan Sevk:</span>
              <span className={cn(remainingShip > 0 ? "text-amber-700" : "text-emerald-600")}>
                {remainingShip}
              </span>
            </div>
          </div>
        );
      }
    },
    {
      key: 'grandTotal',
      title: 'Tutar & Tarih',
      align: 'right',
      filterable: false,
      render: (order) => (
        <>
          <div className="text-xs font-black text-slate-900 dark:text-slate-100 font-mono">
            {order.grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
          </div>
          <div className="text-[10px] font-semibold text-slate-400">
            {new Date(order.date).toLocaleDateString('tr-TR')}
          </div>
        </>
      )
    }
  ];

  const orderRowActions = (order: Order) => {
    const contact = contacts?.find(c => c.id === order.contactId);
    const stats = order.id ? getOrderProgressStats(order.id) : null;
    const linkedInvoices = invoices?.filter(inv => inv.orderId === order.id && inv.status !== 'cancelled') || [];
    const linkedWaybills = waybills?.filter(wb => wb.orderId === order.id && wb.status !== 'cancelled') || [];
    const hasActiveWaybill = linkedWaybills.length > 0;
    const hasActiveInvoice = linkedInvoices.length > 0;
    const hasLock = hasActiveInvoice || hasActiveWaybill;

    return (
      <>
        <button
          disabled={hasActiveWaybill}
          onClick={() => !hasActiveWaybill && navigate(`/waybills?orderId=${order.id}&contactId=${order.contactId}&type=${order.type}`)}
          title={hasActiveWaybill
            ? `Siparişin kesilmiş irsaliyesi bulunmaktadır (${linkedWaybills[0]?.waybillNumber || 'İrsaliye'}). İrsaliye iptal edilmedikçe yeniden irsaliye kesilemez.`
            : "İrsaliye Kes / Sevk Et"
          }
          className={cn(
            "p-1.5 rounded-lg transition-all flex items-center gap-1 border border-slate-200 dark:border-slate-700 shadow-2xs text-[10px] font-black",
            hasActiveWaybill
              ? "bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700 cursor-not-allowed opacity-60"
              : "text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 cursor-pointer"
          )}
        >
          <Truck className={cn("w-3.5 h-3.5", hasActiveWaybill ? "text-slate-400" : "text-indigo-600")} />
          <span className={cn("hidden xl:inline", hasActiveWaybill ? "text-slate-400" : "text-indigo-700")}>
            {hasActiveWaybill ? 'İrsaliyeli' : 'İrsaliye'}
          </span>
        </button>

        <button
          disabled={hasActiveInvoice}
          onClick={() => !hasActiveInvoice && navigate(`/invoices?orderId=${order.id}&contactId=${order.contactId}&type=${order.type}`)}
          title={hasActiveInvoice
            ? `Siparişin kesilmiş faturası bulunmaktadır (${linkedInvoices[0]?.invoiceNumber || 'Fatura'}). Fatura iptal edilmedikçe yeniden faturalandırılamaz.`
            : "Fatura Kes"
          }
          className={cn(
            "p-1.5 rounded-lg transition-all flex items-center gap-1 border border-slate-200 dark:border-slate-700 shadow-2xs text-[10px] font-black",
            hasActiveInvoice
              ? "bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700 cursor-not-allowed opacity-60"
              : "text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 cursor-pointer"
          )}
        >
          <FileText className={cn("w-3.5 h-3.5", hasActiveInvoice ? "text-slate-400" : "text-emerald-600")} />
          <span className={cn("hidden xl:inline", hasActiveInvoice ? "text-slate-400" : "text-emerald-700")}>
            {hasActiveInvoice ? 'Faturalı' : 'Fatura'}
          </span>
        </button>

        {stats && stats.workOrdersCount === 0 && (
          <button
            onClick={() => handleCreateWorkOrders(order.id!)}
            title="Üretim İş Emirlerini Başlat"
            className="p-1.5 bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white rounded-lg transition-colors cursor-pointer"
          >
            <Hammer className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          onClick={() => {
            setPrintOrderId(order.id!);
            setIsPrintModalOpen(true);
          }}
          title={order.type === 'purchase' ? "Satınalma Siparişi & Tedarikçi Formu (Yazdır / Mail)" : "Sipariş Formu (Yazdır / PDF)"}
          className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded-lg transition-colors cursor-pointer"
        >
          <Printer className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={async () => {
            const detail = await orderService.getOrder(order.id!);
            setSelectedOrder(detail);
            setIsDetailModalOpen(true);
          }}
          title="Detay & İlerleme Takibi"
          className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
        >
          <Eye className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => handleOpenEditModal(order.id!)}
          title={hasLock ? "Fatura veya İrsaliye oluşturulduğu için değiştirilemez" : "Siparişi Düzenle"}
          className={cn(
            "p-1.5 rounded-lg transition-colors cursor-pointer",
            hasLock
              ? "text-slate-300 hover:text-amber-600 hover:bg-amber-50"
              : "text-slate-500 dark:text-slate-400 hover:text-blue-600 hover:bg-blue-50"
          )}
        >
          <Edit2 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => handleRequestDelete(order.id!, order.orderNumber)}
          title={hasLock ? "Fatura veya İrsaliye oluşturulduğu için silinemez" : "Siparişi Sil"}
          className={cn(
            "p-1.5 rounded-lg transition-colors cursor-pointer",
            hasLock
              ? "text-slate-300 hover:text-amber-600 hover:bg-amber-50"
              : "text-slate-400 hover:text-rose-600 hover:bg-rose-50"
          )}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </>
    );
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification Alert */}
      <AnimatePresence>
        {feedbackAlert && (
          <motion.div 
            initial={{ opacity: 0, y: -15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className={cn(
              "p-3.5 rounded-xl border text-xs font-bold flex items-center justify-between shadow-md",
              feedbackAlert.type === 'success' 
                ? "bg-emerald-50 text-emerald-800 border-emerald-200" 
                : "bg-rose-50 text-rose-800 border-rose-200"
            )}
          >
            <div className="flex items-center gap-2">
              {feedbackAlert.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{feedbackAlert.message}</span>
            </div>
            <button 
              onClick={() => setFeedbackAlert(null)}
              className="p-1 hover:bg-black/5 rounded cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header Banner */}
      <PageHeader
        title="Sipariş Yönetimi & Takip"
        subtitle="Müşteri ve tedarikçi siparişleri, üretim ilerlemesi ve sevk durum takibi"
        badge="Sipariş Operasyonları"
        icon={ShoppingCart}
        iconColor="purple"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700/80 dark:border-slate-800/80">
              <button 
                onClick={() => setActiveTab('all')}
                className={cn(
                  "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5",
                  activeTab === 'all' ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs" : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200"
                )}
              >
                <span>Tüm Siparişler</span>
                <span className={cn(
                  "text-[10px] px-1.5 py-0.2 rounded-full font-mono font-black",
                  activeTab === 'all' ? "bg-slate-900 text-white" : "bg-slate-200 text-slate-600"
                )}>
                  {orders?.length || 0}
                </span>
              </button>
              <button 
                onClick={() => setActiveTab('sales')}
                className={cn(
                  "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5",
                  activeTab === 'sales' ? "bg-white dark:bg-slate-900 text-indigo-600 shadow-xs" : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200"
                )}
              >
                <span>Satış Siparişleri</span>
                <span className={cn(
                  "text-[10px] px-1.5 py-0.2 rounded-full font-mono font-black",
                  activeTab === 'sales' ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-600"
                )}>
                  {orders?.filter(o => o.type === 'sales').length || 0}
                </span>
              </button>
              <button 
                onClick={() => setActiveTab('purchase')}
                className={cn(
                  "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5",
                  activeTab === 'purchase' ? "bg-white dark:bg-slate-900 text-emerald-600 shadow-xs" : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200"
                )}
              >
                <span>Alış Siparişleri</span>
                <span className={cn(
                  "text-[10px] px-1.5 py-0.2 rounded-full font-mono font-black",
                  activeTab === 'purchase' ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-600"
                )}>
                  {orders?.filter(o => o.type === 'purchase').length || 0}
                </span>
              </button>
            </div>

            <Link
              to="/reports?tab=orders"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/80 rounded-lg text-xs font-semibold text-indigo-700 transition-colors"
            >
              <BarChart3 className="w-3.5 h-3.5 text-indigo-600" />
              <span>Sipariş Raporu</span>
            </Link>

            <button
              onClick={() => {
                resetForm();
                setIsAddModalOpen(true);
              }}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Yeni Sipariş Ekle</span>
            </button>
          </div>
        }
      />

      {/* Production & Shipment Live KPI Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] font-black uppercase tracking-wider">Toplam Sipariş</span>
            <Package className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-xl font-black text-slate-900 dark:text-slate-100 font-mono">
            {tabKPIs.totalOrderedQty.toLocaleString('tr-TR')} <span className="text-xs font-bold text-slate-400">Çift/Adet</span>
          </div>
          <p className="text-[10px] text-slate-400 font-bold mt-1">{tabKPIs.totalOrders} Adet Aktif Sipariş</p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] font-black uppercase tracking-wider">Üretilen Miktar</span>
            <Factory className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-xl font-black text-blue-600 font-mono">
            {tabKPIs.totalProducedQty.toLocaleString('tr-TR')} <span className="text-xs font-bold text-slate-400">Çift</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-600 rounded-full" 
                style={{ width: `${tabKPIs.totalOrderedQty > 0 ? (tabKPIs.totalProducedQty / tabKPIs.totalOrderedQty) * 100 : 0}%` }}
              />
            </div>
            <span className="text-[10px] font-black text-blue-600">
              %{tabKPIs.totalOrderedQty > 0 ? Math.round((tabKPIs.totalProducedQty / tabKPIs.totalOrderedQty) * 100) : 0}
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] font-black uppercase tracking-wider">Sevk Edilen Miktar</span>
            <Truck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl font-black text-emerald-600 font-mono">
            {tabKPIs.totalShippedQty.toLocaleString('tr-TR')} <span className="text-xs font-bold text-slate-400">Çift</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-emerald-600 rounded-full" 
                style={{ width: `${tabKPIs.totalOrderedQty > 0 ? (tabKPIs.totalShippedQty / tabKPIs.totalOrderedQty) * 100 : 0}%` }}
              />
            </div>
            <span className="text-[10px] font-black text-emerald-600">
              %{tabKPIs.totalOrderedQty > 0 ? Math.round((tabKPIs.totalShippedQty / tabKPIs.totalOrderedQty) * 100) : 0}
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] font-black uppercase tracking-wider">Kalan Sevkiyat (Bakiye)</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-xl font-black text-amber-600 font-mono">
            {tabKPIs.remainingShipQty.toLocaleString('tr-TR')} <span className="text-xs font-bold text-slate-400">Çift</span>
          </div>
          <p className="text-[10px] text-slate-400 font-bold mt-1">Müşteriye Teslim Bekleyen</p>
        </div>
      </div>

      <DataGrid<Order>
        columns={orderColumns}
        data={filteredOrders}
        rowKey="id"
        loading={!orders}
        toolbar={
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'all', label: 'Tümü' },
              { id: 'pending_prod', label: 'Üretim Bekleyen' },
              { id: 'in_prod', label: 'Üretimde' },
              { id: 'ready_ship', label: 'Sevkiyata Hazır' },
              { id: 'shipped', label: 'Tamamlananlar' }
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setStatusFilter(f.id)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer",
                  statusFilter === f.id ? "bg-slate-900 text-white" : "bg-white dark:bg-slate-900 text-slate-600 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:bg-slate-800"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        }
        rowActions={orderRowActions}
        emptyMessage="Kriterlere uygun sipariş bulunamadı"
      />

      {/* ========================================================================= */}
      {/* ORDER DETAIL & PROGRESS TRACKING MODAL (extracted)                        */}
      {/* ========================================================================= */}
      <OrderDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        order={selectedOrder}
        contacts={contacts}
        products={products}
        workOrders={workOrders}
        waybills={waybills}
        invoices={invoices}
        getStats={getOrderProgressStats}
        isTransferring={isTransferringToProduction}
        onPrint={(id) => { setPrintOrderId(id); setIsPrintModalOpen(true); }}
        onEdit={(id) => { setIsDetailModalOpen(false); handleOpenEditModal(id); }}
        onRequestDelete={handleRequestDelete}
        onCreateWorkOrders={handleCreateWorkOrders}
      />

      {/* Add / Edit Order Modal (Size 2XL) */}
      <Modal 
        isOpen={isAddModalOpen} 
        onClose={() => { setIsAddModalOpen(false); resetForm(); }} 
        title={
          editingOrderId 
            ? (formOrderType === 'sales' ? `Satış Siparişini Düzenle (#${orderNumber || editingOrderId})` : `Alış Siparişini Düzenle (#${orderNumber || editingOrderId})`)
            : (formOrderType === 'sales' ? "Yeni Satış Siparişi Oluştur" : "Yeni Alış Siparişi Oluştur")
        } 
        size="4xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* TOP HEADER STRIP */}
          <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
              {/* Order Type Toggle */}
              <div className="space-y-1 col-span-2 md:col-span-2 xl:col-span-1">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Sipariş Türü</label>
                <div className="grid grid-cols-2 gap-1 bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => setFormOrderType('sales')}
                    className={cn(
                      "py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                      formOrderType === 'sales' ? "bg-indigo-600 text-white shadow-xs" : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200"
                    )}
                  >
                    Satış
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormOrderType('purchase')}
                    className={cn(
                      "py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                      formOrderType === 'purchase' ? "bg-emerald-600 text-white shadow-xs" : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200"
                    )}
                  >
                    Alış
                  </button>
                </div>
              </div>

              <div className="space-y-1 col-span-2 md:col-span-2 xl:col-span-2">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Cari Seçimi</label>
                <ContactSelect
                  contacts={contacts ?? []}
                  value={selectedContactId}
                  allowTypes={formOrderType === 'sales' ? ['customer', 'both'] : ['supplier', 'both']}
                  placeholder="Cari Seçiniz..."
                  onChange={(id) => setSelectedContactId(id)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Sipariş No</label>
                <input 
                  type="text" 
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(e.target.value)}
                  placeholder="Otomatik..."
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-mono font-bold uppercase bg-white dark:bg-slate-900 outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Sipariş Tarihi</label>
                <input 
                  type="date" 
                  value={orderDate}
                  onChange={(e) => setOrderDate(e.target.value)}
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-xl p-2 text-xs font-bold bg-white dark:bg-slate-900 outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Termin Tarihi</label>
                <input 
                  type="date" 
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-xl p-2 text-xs font-bold bg-white dark:bg-slate-900 outline-none"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Sipariş Notu</label>
              <textarea 
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-medium bg-white dark:bg-slate-900 outline-none"
              />
            </div>
          </div>

          {/* FULL-WIDTH ITEMS GRID */}
          <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
                    <Package className="w-4 h-4 text-indigo-600" /> Sipariş Kalemleri ({orderItems.filter(isFilledOrderItem).length})
                  </h4>
                  <p className="text-[10px] text-slate-400">Excel gibi satır satır ürün/hizmet girin. Tab ile sonraki hücreye, son hücrede otomatik yeni satıra geçersiniz.</p>
                </div>
                <button 
                  type="button"
                  onClick={openProductSelector}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" /> Ürün & Stok Ekle
                </button>
              </div>

              <ExcelGrid<any>
                columns={orderItemColumns}
                rows={orderItems}
                onChange={setOrderItems}
                createRow={createBlankOrderItem}
                computeRow={computeOrderItemRow}
                rowKey={(row, i) => `${row.productId ?? 'blank'}-${i}`}
                onRemoveRow={(index) => removeOrderItem(index)}
                addLabel="Satır Ekle"
                maxHeight="26rem"
                emptyHint={
                  <div className="space-y-2">
                    <Package className="w-8 h-8 mx-auto opacity-30 text-indigo-600" />
                    <div className="text-xs font-bold text-slate-600">Henüz sipariş kalemi yok.</div>
                    <div className="text-[11px] text-slate-400">"Satır Ekle" ile başlayın veya "Ürün & Stok Ekle" ile renk/beden/koli seçin.</div>
                  </div>
                }
              />

          </div>

          {/* BOTTOM BAR: SUMMARY + ACTIONS */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-200 dark:border-slate-700">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Ara Toplam: <span className="font-mono font-bold text-slate-800 dark:text-slate-100">{totals.subtotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Hesaplanan KDV: <span className="font-mono font-bold text-slate-800 dark:text-slate-100">{totals.taxTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-slate-900 rounded-xl shadow-md">
                <span className="text-[10px] font-black uppercase tracking-wider text-indigo-300">Genel Toplam:</span>
                <span className="font-mono text-base font-black text-emerald-400">{totals.grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setIsAddModalOpen(false); resetForm(); }}
                className="px-5 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold uppercase cursor-pointer"
              >
                Vazgeç
              </button>
              <button
                type="submit"
                disabled={isProcessing}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-md cursor-pointer flex items-center gap-2"
              >
                {isProcessing && <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                <span>{editingOrderId ? "Değişiklikleri Kaydet" : "Siparişi Kaydet"}</span>
              </button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Silme onayı: plan, cascade ve engeller sunucudan gelir */}
      {deleteTarget && (
        <DeleteConfirmModal
          resource="orders"
          id={deleteTarget.id}
          title="Siparişi Sil"
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => {
            const deletedNum = deleteTarget.orderNumber;
            if (selectedOrder?.id === deleteTarget.id) {
              setIsDetailModalOpen(false);
              setSelectedOrder(null);
            }
            setDeleteTarget(null);
            setFeedbackAlert({
              type: 'success',
              message: `"${deletedNum}" numaralı sipariş ve bağlı kayıtları silindi.`
            });
            setTimeout(() => setFeedbackAlert(null), 4000);
          }}
        />
      )}

      {/* Advanced Product & Variant Selection Modal */}
      <ProductSelectorModal
        isOpen={isProductSelectorOpen}
        onClose={() => setIsProductSelectorOpen(false)}
        onAddItem={handleAddItemFromModal}
        orderType={formOrderType}
        products={products || []}
        templates={templates || []}
      />

      {/* Color & Size Matrix Picker (opened from Excel grid product pick) */}
      <ColorSizePickerModal
        product={colorPick?.product || null}
        onClose={() => setColorPick(null)}
        onSelect={(color, colorId) => {
          if (colorPick) {
            const idx = colorPick.rowIndex;
            setOrderItems(prev => prev.map((it, i) => (i === idx ? { ...it, color, colorId: colorId ?? null } : it)));
          }
          setColorPick(null);
        }}
      />

      {/* Purchase / Sales Order Print, Size Matrix & Email Form Modal */}
      <PurchaseOrderPrintModal
        isOpen={isPrintModalOpen}
        onClose={() => {
          setIsPrintModalOpen(false);
          setPrintOrderId(null);
        }}
        orderId={printOrderId}
      />
    </div>
  );
}
