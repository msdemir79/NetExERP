import React from 'react';
import { api } from '../api/client';
import { useNavigate, Link } from 'react-router-dom';
import { useApiQuery } from '../hooks/useApiQuery';
import { 
  ShoppingCart, 
  Plus, 
  Search, 
  Eye, 
  Trash2, 
  ChevronRight, 
  X, 
  FileText, 
  Calendar, 
  User, 
  Package, 
  Calculator, 
  ArrowRight, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Hammer, 
  Sparkles,
  Truck,
  Layers,
  Boxes,
  Factory,
  BarChart3,
  Edit2,
  Lock,
  Printer
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import Modal from './Modal';
import ProductSelectorModal from './Orders/ProductSelectorModal';
import { PurchaseOrderPrintModal } from './Orders/PurchaseOrderPrintModal';
import { erpService } from '../services/erpService';
import PageHeader from './PageHeader';
import type { Order, OrderItem, OrderStatus, OrderType } from '../types';

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

  const [searchTerm, setSearchTerm] = React.useState('');
  const [activeTab, setActiveTab] = React.useState<OrderTab>('all');
  const [formOrderType, setFormOrderType] = React.useState<OrderType>('sales');
  const [statusFilter, setStatusFilter] = React.useState<string>('all');
  const [isAddModalOpen, setIsAddModalOpen] = React.useState(false);
  const [editingOrderId, setEditingOrderId] = React.useState<number | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = React.useState(false);
  const [selectedOrder, setSelectedOrder] = React.useState<any>(null);
  const [isTransferringToProduction, setIsTransferringToProduction] = React.useState(false);
  const [isProcessing, setIsProcessing] = React.useState(false);
  
  // Custom in-app delete confirmation & warning modals
  const [isDeleteModalOpen, setIsDeleteModalOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<{ id: number; orderNumber: string; grandTotal?: number; contactName?: string } | null>(null);
  const [isBlockedModalOpen, setIsBlockedModalOpen] = React.useState(false);
  const [blockedReason, setBlockedReason] = React.useState<string | null>(null);
  const [feedbackAlert, setFeedbackAlert] = React.useState<{ type: 'success' | 'error'; message: string } | null>(null);
  
  // Product Selector Modal State
  const [isProductSelectorOpen, setIsProductSelectorOpen] = React.useState(false);
  
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
      const contact = contacts?.find(c => c.id === o.contactId);
      const matchesSearch = 
        o.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (contact?.name || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = activeTab === 'all' || o.type === activeTab;
      
      if (!matchesSearch || !matchesType) return false;
      if (statusFilter === 'all') return true;

      const stats = o.id ? getOrderProgressStats(o.id) : null;
      if (!stats) return true;

      if (statusFilter === 'pending_prod') return stats.totalProduced < stats.totalOrdered;
      if (statusFilter === 'in_prod') return stats.totalInProduction > 0;
      if (statusFilter === 'ready_ship') return stats.totalProduced > stats.totalShipped;
      if (statusFilter === 'shipped') return stats.totalShipped >= stats.totalOrdered && stats.totalOrdered > 0;
      return true;
    });
  }, [orders, contacts, searchTerm, activeTab, statusFilter, getOrderProgressStats]);

  const totals = React.useMemo(() => {
    const subtotal = orderItems.reduce((acc, item) => {
      const unit = Number(item.unitPrice) || 0;
      const qty = Number(item.quantity) || 0;
      const disc = Number(item.discountRate) || 0;
      const lineNet = unit * qty * (1 - disc / 100);
      return acc + lineNet;
    }, 0);

    const taxTotal = orderItems.reduce((acc, item) => {
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

  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...orderItems];
    const item = { ...newItems[index], [field]: value };
    
    if (field === 'boxCount' && item.isFootwear && item.pairsPerBox && item.pairsPerBox > 0) {
      item.quantity = Math.max(1, Number(value)) * item.pairsPerBox;
    } else if (field === 'quantity' && item.isFootwear && item.pairsPerBox && item.pairsPerBox > 0) {
      item.boxCount = Math.max(1, Math.floor(Number(value) / item.pairsPerBox));
    }
    
    const unit = Number(item.unitPrice) || 0;
    const qty = Number(item.quantity) || 0;
    const disc = Number(item.discountRate) || 0;
    const tax = Number(item.taxRate) || 0;
    const lineNet = unit * qty * (1 - disc / 100);
    const lineTax = lineNet * (tax / 100);
    item.total = lineNet + lineTax;
    
    newItems[index] = item;
    setOrderItems(newItems);
  };

  const handleOpenEditModal = async (orderId: number) => {
    try {
      const check = await erpService.canModifyOrDeleteOrder(orderId);
      if (!check.canModify) {
        setBlockedReason(check.reason || 'Bu sipariş faturası veya irsaliyesi kesildiği için değiştirilemez.');
        setIsBlockedModalOpen(true);
        return;
      }

      const orderData = await erpService.getOrder(orderId);
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
        const lineNet = (Number(item.unitPrice) || 0) * (Number(item.quantity) || 0) * (1 - (Number(item.discountRate) || 0) / 100);
        const lineTax = lineNet * ((Number(item.taxRate) || 0) / 100);
        return {
          productId: item.productId,
          name: prod?.name || 'Ürün',
          code: prod?.code || '',
          unit: prod?.unit || 'Çift',
          color: item.color,
          size: item.size,
          moldCode: prod?.moldCode,
          isFootwear: prod?.isFootwear,
          assortmentTemplateId: prod?.assortmentTemplateId,
          pairsPerBox: prod?.pairsPerBox,
          boxCount: (prod?.pairsPerBox && prod.pairsPerBox > 0) ? Math.floor(item.quantity / prod.pairsPerBox) : undefined,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          taxRate: item.taxRate,
          discountRate: item.discountRate || 0,
          total: item.total || (lineNet + lineTax),
          notes: (item as any).notes || ''
        };
      });

      setOrderItems(mappedItems);
      setIsAddModalOpen(true);
    } catch (error: any) {
      setFeedbackAlert({ type: 'error', message: 'Sipariş düzenleme moduna alınırken hata: ' + (error?.message || error) });
    }
  };

  const handleRequestDelete = async (orderId: number, ordNumber: string, grandTotal?: number, contactName?: string) => {
    try {
      const check = await erpService.canModifyOrDeleteOrder(orderId);
      if (!check.canModify) {
        setBlockedReason(check.reason || 'Bu sipariş faturası veya irsaliyesi kesildiği için silinemez.');
        setIsBlockedModalOpen(true);
        return;
      }

      setDeleteTarget({
        id: orderId,
        orderNumber: ordNumber,
        grandTotal,
        contactName
      });
      setIsDeleteModalOpen(true);
    } catch (error: any) {
      setBlockedReason('Kontrol sırasında hata oluştu: ' + (error?.message || error));
      setIsBlockedModalOpen(true);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      setIsProcessing(true);
      await erpService.deleteOrder(deleteTarget.id);
      if (selectedOrder?.id === deleteTarget.id) {
        setIsDetailModalOpen(false);
        setSelectedOrder(null);
      }
      setIsDeleteModalOpen(false);
      const deletedNum = deleteTarget.orderNumber;
      setDeleteTarget(null);
      setFeedbackAlert({
        type: 'success',
        message: `"${deletedNum}" numaralı sipariş ve bağlı iş emirleri başarıyla silindi.`
      });
      setTimeout(() => setFeedbackAlert(null), 4000);
    } catch (error: any) {
      setFeedbackAlert({
        type: 'error',
        message: 'Sipariş silinirken hata: ' + (error?.message || error)
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedContactId || orderItems.length === 0) {
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

    const items: Omit<OrderItem, 'id' | 'orderId'>[] = orderItems.map(item => ({
      productId: item.productId,
      quantity: item.quantity,
      shippedQuantity: 0,
      unitPrice: item.unitPrice,
      taxRate: item.taxRate,
      discountRate: item.discountRate || 0,
      total: item.unitPrice * item.quantity * (1 + item.taxRate / 100),
      color: item.color,
      size: item.size
    }));

    try {
      setIsProcessing(true);
      if (editingOrderId) {
        await erpService.updateOrder(editingOrderId, orderData, items);
        setFeedbackAlert({ type: 'success', message: `"${orderData.orderNumber}" numaralı sipariş başarıyla güncellendi!` });
      } else {
        await erpService.createOrder(orderData, items);
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
      await erpService.createWorkOrdersFromOrder(orderId);
      setFeedbackAlert({ type: 'success', message: 'Sipariş için üretim iş emirleri başarıyla oluşturuldu!' });
      setTimeout(() => setFeedbackAlert(null), 4000);
      if (selectedOrder?.id === orderId) {
        const updated = await erpService.getOrder(orderId);
        setSelectedOrder(updated);
      }
    } catch (error: any) {
      setFeedbackAlert({ type: 'error', message: 'İş emri oluşturulurken hata: ' + error.message });
    } finally {
      setIsTransferringToProduction(false);
    }
  };

  const resetForm = () => {
    setEditingOrderId(null);
    setOrderItems([]);
    setSelectedContactId(null);
    setOrderDate(new Date().toISOString().split('T')[0]);
    setDeliveryDate('');
    setOrderNumber('');
    setNotes('');
    setFormOrderType(activeTab === 'purchase' ? 'purchase' : 'sales');
  };

  const getStatusBadge = (status: OrderStatus) => {
    const styles = {
      draft: "bg-slate-100 dark:bg-slate-800 text-slate-600 border-slate-200 dark:border-slate-700",
      confirmed: "bg-indigo-50 text-indigo-700 border-indigo-200",
      partially_shipped: "bg-amber-50 text-amber-700 border-amber-200",
      completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
      cancelled: "bg-rose-50 text-rose-700 border-rose-200"
    };

    const labels = {
      draft: "Taslak",
      confirmed: "Onaylandı",
      partially_shipped: "Kısmi Sevk",
      completed: "Tamamlandı",
      cancelled: "İptal"
    };

    return (
      <span className={cn("px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border", styles[status])}>
        {labels[status]}
      </span>
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

      {/* Main Table Container */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        {/* Filter and Search Bar */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50/50 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Sipariş no veya cari adı ile ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

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
        </div>

        {/* Orders Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50/90 border-b border-slate-200 dark:border-slate-700">
                <th className="px-3 py-2.5 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">Sipariş & Cari</th>
                <th className="px-3 py-2.5 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center">Hedef Sipariş</th>
                <th className="px-3 py-2.5 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">Üretim Durumu</th>
                <th className="px-3 py-2.5 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">Sevkiyat Durumu</th>
                <th className="px-3 py-2.5 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">Kalan Miktar</th>
                <th className="px-3 py-2.5 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Tutar & Tarih</th>
                <th className="px-3 py-2.5 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-400">
                    <ShoppingCart className="w-10 h-10 mx-auto mb-2 opacity-20" />
                    <p className="text-xs font-bold uppercase tracking-wider">Kriterlere uygun sipariş bulunamadı</p>
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => {
                  const contact = contacts?.find(c => c.id === order.contactId);
                  const stats = order.id ? getOrderProgressStats(order.id) : null;
                  const totalOrdered = stats?.totalOrdered || 0;
                  const totalProduced = stats?.totalProduced || 0;
                  const totalShipped = stats?.totalShipped || 0;
                  const remainingProduce = stats?.remainingToProduce || 0;
                  const remainingShip = stats?.remainingToShip || 0;
                  const producePercent = stats?.producePercent || 0;
                  const shipPercent = stats?.shipPercent || 0;

                  const linkedInvoices = invoices?.filter(inv => inv.orderId === order.id && inv.status !== 'cancelled') || [];
                  const linkedWaybills = waybills?.filter(wb => wb.orderId === order.id && wb.status !== 'cancelled') || [];
                  const hasActiveWaybill = linkedWaybills.length > 0;
                  const hasActiveInvoice = linkedInvoices.length > 0;
                  const hasLock = hasActiveInvoice || hasActiveWaybill;

                  return (
                    <tr key={order.id} className="hover:bg-slate-50 dark:bg-slate-800/50/80 transition-colors group">
                      {/* Order & Contact */}
                      <td className="px-3 py-2.5">
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
                              {getStatusBadge(order.status)}
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
                      </td>

                      {/* Total Ordered Qty */}
                      <td className="px-3 py-2.5 text-center">
                        <span className="text-xs font-black text-slate-900 dark:text-slate-100 font-mono">
                          {totalOrdered.toLocaleString('tr-TR')}
                        </span>
                        <span className="block text-[9px] font-bold text-slate-400 uppercase">Çift / Adet</span>
                      </td>

                      {/* Production Status */}
                      <td className="px-3 py-2.5 min-w-[150px]">
                        <div className="space-y-0.5">
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
                      </td>

                      {/* Shipment Status */}
                      <td className="px-3 py-2.5 min-w-[150px]">
                        <div className="space-y-0.5">
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
                      </td>

                      {/* Remaining Quantities */}
                      <td className="px-3 py-2.5">
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
                      </td>

                      {/* Total Price & Date */}
                      <td className="px-3 py-2.5 text-right">
                        <div className="text-xs font-black text-slate-900 dark:text-slate-100 font-mono">
                          {order.grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                        </div>
                        <div className="text-[10px] font-semibold text-slate-400">
                          {new Date(order.date).toLocaleDateString('tr-TR')}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* Waybill Button */}
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

                          {/* Invoice Button */}
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
                              const detail = await erpService.getOrder(order.id!);
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
                            onClick={() => handleRequestDelete(order.id!, order.orderNumber, order.grandTotal, contact?.name)}
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
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* ORDER DETAIL & PROGRESS TRACKING MODAL (SIZE 3XL)                        */}
      {/* ========================================================================= */}
      <Modal 
        isOpen={isDetailModalOpen} 
        onClose={() => setIsDetailModalOpen(false)} 
        title={`Sipariş Takip & İlerleme: ${selectedOrder?.orderNumber || ''}`}
        size="3xl"
      >
        {selectedOrder && (() => {
          const stats = selectedOrder.id ? getOrderProgressStats(selectedOrder.id) : null;
          const contact = contacts?.find(c => c.id === selectedOrder.contactId);
          const orderWOs = workOrders?.filter(w => w.orderId === selectedOrder.id) || [];

          return (
            <div className="space-y-6">
              {/* Top Summary Status Matrix */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 text-center">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Toplam Hedef</p>
                  <h4 className="text-xl font-black text-slate-900 dark:text-slate-100 font-mono">
                    {stats?.totalOrdered.toLocaleString('tr-TR')} <span className="text-xs uppercase text-slate-400">Çift</span>
                  </h4>
                </div>

                <div className="bg-blue-50/60 p-4 rounded-2xl border border-blue-200 text-center">
                  <p className="text-[10px] font-black text-blue-700 uppercase tracking-wider mb-1">Üretilen Miktar</p>
                  <h4 className="text-xl font-black text-blue-700 font-mono">
                    {stats?.totalProduced.toLocaleString('tr-TR')} <span className="text-xs text-blue-500">Çift (%{stats?.producePercent})</span>
                  </h4>
                  <div className="w-full h-1.5 bg-blue-100 rounded-full mt-2 overflow-hidden">
                    <div className="h-full bg-blue-600 rounded-full" style={{ width: `${stats?.producePercent}%` }} />
                  </div>
                </div>

                <div className="bg-emerald-50/60 p-4 rounded-2xl border border-emerald-200 text-center">
                  <p className="text-[10px] font-black text-emerald-700 uppercase tracking-wider mb-1">Sevk Edilen Miktar</p>
                  <h4 className="text-xl font-black text-emerald-700 font-mono">
                    {stats?.totalShipped.toLocaleString('tr-TR')} <span className="text-xs text-emerald-500">Çift (%{stats?.shipPercent})</span>
                  </h4>
                  <div className="w-full h-1.5 bg-emerald-100 rounded-full mt-2 overflow-hidden">
                    <div className="h-full bg-emerald-600 rounded-full" style={{ width: `${stats?.shipPercent}%` }} />
                  </div>
                </div>

                <div className="bg-amber-50/60 p-4 rounded-2xl border border-amber-200 text-center">
                  <p className="text-[10px] font-black text-amber-700 uppercase tracking-wider mb-1">Kalan Bakiye (Sevk)</p>
                  <h4 className="text-xl font-black text-amber-700 font-mono">
                    {stats?.remainingToShip.toLocaleString('tr-TR')} <span className="text-xs text-amber-500">Çift</span>
                  </h4>
                  <p className="text-[9px] font-bold text-amber-600 mt-1">Kalan Üretim: {stats?.remainingToProduce} Çift</p>
                </div>
              </div>

              {/* Order Info & Line Items with Variant Breakdown */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Panel: Contact & Order Details */}
                <div className="lg:col-span-1 space-y-4">
                  <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-2 border-b border-slate-200 dark:border-slate-700 pb-2">
                      <User className="w-3.5 h-3.5" /> Cari & Sipariş Detayı
                    </h4>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Cari Ünvan</p>
                      <p className="text-sm font-black text-slate-900 dark:text-slate-100">{contact?.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mt-0.5">{contact?.phone || 'Telefon Yok'}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Sipariş Tarihi</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">{new Date(selectedOrder.date).toLocaleDateString('tr-TR')}</span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Termin Tarihi</span>
                        <span className="font-bold text-indigo-600">
                          {selectedOrder.deliveryDate ? new Date(selectedOrder.deliveryDate).toLocaleDateString('tr-TR') : '-'}
                        </span>
                      </div>
                    </div>
                    <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center text-sm font-black text-indigo-600">
                      <span>Genel Tutar:</span>
                      <span>{selectedOrder.grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                    </div>
                  </div>

                  {/* Quick Production Button if needed */}
                  {orderWOs.length === 0 ? (
                    <button
                      onClick={() => handleCreateWorkOrders(selectedOrder.id)}
                      disabled={isTransferringToProduction}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-md cursor-pointer"
                    >
                      <Hammer className="w-4 h-4" /> Üretim İş Emirlerini Başlat
                    </button>
                  ) : (
                    <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 flex items-center justify-between">
                      <span>Bağlı İş Emirleri:</span>
                      <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-mono">{orderWOs.length} Adet</span>
                    </div>
                  )}
                </div>

                {/* Right Panel: Product Lines Table with Exact Quantities */}
                <div className="lg:col-span-2 space-y-4">
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm">
                    <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                      <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
                        <Package className="w-4 h-4 text-indigo-600" /> Sipariş Kalemleri ve Aşama Takibi
                      </h4>
                      <span className="text-[10px] font-bold text-slate-400">{selectedOrder.items?.length || 0} Kalem</span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead className="bg-slate-50 dark:bg-slate-800/50/50 border-b border-slate-100 dark:border-slate-800 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                          <tr>
                            <th className="p-3">Ürün & Renk</th>
                            <th className="p-3 text-center">Sipariş</th>
                            <th className="p-3 text-center">Üretilen</th>
                            <th className="p-3 text-center">Sevk Edilen</th>
                            <th className="p-3 text-center">Kalan</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs">
                          {selectedOrder.items?.map((item: any, i: number) => {
                            const p = products?.find(prod => prod.id === item.productId);
                            const itemWOs = orderWOs.filter(wo => wo.orderItemId === item.id || (wo.productId === item.productId && wo.color === item.color));
                            const itemProduced = itemWOs.filter(w => w.status === 'completed').reduce((s, w) => s + w.quantity, 0);
                            const itemShipped = item.shippedQuantity || item.invoicedQuantity || 0;
                            const itemRemainingShip = Math.max(0, item.quantity - itemShipped);

                            return (
                              <tr key={i} className="hover:bg-slate-50 dark:bg-slate-800/50">
                                <td className="p-3">
                                  <div className="font-bold text-slate-800 dark:text-slate-200 uppercase">{p?.code || '-'}</div>
                                  <div className="text-[10px] text-slate-400 font-semibold">{p?.name}</div>
                                  {item.color && (
                                    <span className="inline-flex items-center gap-1 text-[9px] font-black text-indigo-600 bg-indigo-50 px-1.5 py-0.2 rounded mt-0.5 uppercase">
                                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
                                      {item.color}
                                    </span>
                                  )}
                                  {item.size && (
                                    <span className="inline-flex items-center gap-1 text-[9px] font-black text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded mt-0.5">
                                      Beden: {item.size}
                                    </span>
                                  )}
                                </td>
                                <td className="p-3 text-center font-black font-mono text-slate-900 dark:text-slate-100">
                                  {item.quantity}
                                </td>
                                <td className="p-3 text-center">
                                  <span className="font-black font-mono text-blue-600">{itemProduced}</span>
                                  <span className="text-[9px] block text-slate-400 font-bold">
                                    %{item.quantity > 0 ? Math.round((itemProduced / item.quantity) * 100) : 0}
                                  </span>
                                </td>
                                <td className="p-3 text-center">
                                  <span className="font-black font-mono text-emerald-600">{itemShipped}</span>
                                  <span className="text-[9px] block text-slate-400 font-bold">
                                    %{item.quantity > 0 ? Math.round((itemShipped / item.quantity) * 100) : 0}
                                  </span>
                                </td>
                                <td className="p-3 text-center font-black font-mono text-amber-600">
                                  {itemRemainingShip}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Bar */}
              <div className="flex flex-wrap justify-between items-center gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                <div className="text-xs font-bold text-slate-500 dark:text-slate-400">
                  {selectedOrder.notes && <span>Not: "{selectedOrder.notes}"</span>}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {(() => {
                    const selWaybills = waybills?.filter(wb => wb.orderId === selectedOrder.id && wb.status !== 'cancelled') || [];
                    const selInvoices = invoices?.filter(inv => inv.orderId === selectedOrder.id && inv.status !== 'cancelled') || [];
                    const hasSelWaybill = selWaybills.length > 0;
                    const hasSelInvoice = selInvoices.length > 0;
                    const isLocked = hasSelWaybill || hasSelInvoice;

                    return (
                      <>
                        <button 
                          onClick={() => {
                            setPrintOrderId(selectedOrder.id);
                            setIsPrintModalOpen(true);
                          }}
                          className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 dark:hover:bg-indigo-900/50 px-3.5 py-2.5 rounded-xl font-bold text-xs uppercase flex items-center gap-1.5 transition-all cursor-pointer border border-indigo-200 dark:border-indigo-800"
                        >
                          <Printer className="w-4 h-4" />
                          <span>{selectedOrder.type === 'purchase' ? 'Tedarikçi Formu & Yazdır' : 'Sipariş Formu & Yazdır'}</span>
                        </button>

                        <button 
                          onClick={() => {
                            const id = selectedOrder.id;
                            setIsDetailModalOpen(false);
                            handleOpenEditModal(id);
                          }}
                          className="bg-blue-50 hover:bg-blue-100 text-blue-700 px-3.5 py-2.5 rounded-xl font-bold text-xs uppercase flex items-center gap-1.5 transition-all cursor-pointer border border-blue-200"
                        >
                          <Edit2 className="w-4 h-4" />
                          <span>Düzenle</span>
                        </button>

                        <button 
                          onClick={() => {
                            const id = selectedOrder.id;
                            const num = selectedOrder.orderNumber;
                            const total = selectedOrder.grandTotal;
                            const cName = contact?.name;
                            handleRequestDelete(id, num, total, cName);
                          }}
                          className="bg-rose-50 hover:bg-rose-100 text-rose-700 px-3.5 py-2.5 rounded-xl font-bold text-xs uppercase flex items-center gap-1.5 transition-all cursor-pointer border border-rose-200"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span>Sil</span>
                        </button>

                        <button 
                          disabled={hasSelWaybill}
                          onClick={() => {
                            if (hasSelWaybill) return;
                            setIsDetailModalOpen(false);
                            navigate(`/waybills?orderId=${selectedOrder.id}&contactId=${selectedOrder.contactId}&type=${selectedOrder.type}`);
                          }}
                          title={hasSelWaybill ? `Siparişin kesilmiş irsaliyesi bulunmaktadır (${selWaybills[0]?.waybillNumber}). İptal edilmedikçe yeniden irsaliye kesilemez.` : "İrsaliye Kes"}
                          className={cn(
                            "px-4 py-2.5 rounded-xl font-bold text-xs uppercase flex items-center gap-2 transition-all border",
                            hasSelWaybill
                              ? "bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700 cursor-not-allowed opacity-60 shadow-none"
                              : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20 cursor-pointer border-transparent"
                          )}
                        >
                          <Truck className="w-4 h-4" />
                          <span>{hasSelWaybill ? 'İrsaliyesi Kesilmiş' : 'İrsaliye Kes'}</span>
                        </button>

                        <button 
                          disabled={hasSelInvoice}
                          onClick={() => {
                            if (hasSelInvoice) return;
                            setIsDetailModalOpen(false);
                            navigate(`/invoices?orderId=${selectedOrder.id}&contactId=${selectedOrder.contactId}&type=${selectedOrder.type}`);
                          }}
                          title={hasSelInvoice ? `Siparişin kesilmiş faturası bulunmaktadır (${selInvoices[0]?.invoiceNumber}). İptal edilmedikçe yeniden faturalandırılamaz.` : "Fatura Kes"}
                          className={cn(
                            "px-4 py-2.5 rounded-xl font-bold text-xs uppercase flex items-center gap-2 transition-all border",
                            hasSelInvoice
                              ? "bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700 cursor-not-allowed opacity-60 shadow-none"
                              : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20 cursor-pointer border-transparent"
                          )}
                        >
                          <FileText className="w-4 h-4" />
                          <span>{hasSelInvoice ? 'Faturalandırılmış' : 'Fatura Kes'}</span>
                        </button>
                      </>
                    );
                  })()}

                  <button 
                    onClick={() => setIsDetailModalOpen(false)}
                    className="bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 px-5 py-2.5 rounded-xl font-bold text-xs uppercase cursor-pointer"
                  >
                    Kapat
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* Add / Edit Order Modal (Size 2XL) */}
      <Modal 
        isOpen={isAddModalOpen} 
        onClose={() => { setIsAddModalOpen(false); resetForm(); }} 
        title={
          editingOrderId 
            ? (formOrderType === 'sales' ? `Satış Siparişini Düzenle (#${orderNumber || editingOrderId})` : `Alış Siparişini Düzenle (#${orderNumber || editingOrderId})`)
            : (formOrderType === 'sales' ? "Yeni Satış Siparişi Oluştur" : "Yeni Alış Siparişi Oluştur")
        } 
        size="2xl"
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Header Inputs */}
            <div className="space-y-4 lg:col-span-1 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-700">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700 pb-2">
                Sipariş Bilgileri
              </h4>

              {/* Order Type Toggle */}
              <div className="space-y-1">
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
                    Satış Siparişi
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormOrderType('purchase')}
                    className={cn(
                      "py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                      formOrderType === 'purchase' ? "bg-emerald-600 text-white shadow-xs" : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200"
                    )}
                  >
                    Alış Siparişi
                  </button>
                </div>
              </div>
              
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Cari Seçimi</label>
                <select 
                  required
                  value={selectedContactId || ''}
                  onChange={(e) => setSelectedContactId(Number(e.target.value))}
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-bold bg-white dark:bg-slate-900 outline-none"
                >
                  <option value="">Cari Seçiniz...</option>
                  {contacts?.filter(c => c.type === (formOrderType === 'sales' ? 'customer' : 'supplier')).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Sipariş No</label>
                <input 
                  type="text" 
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(e.target.value)}
                  placeholder="Otomatik oluşturulacak..."
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-mono font-bold uppercase bg-white dark:bg-slate-900 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
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

              {/* Summary */}
              <div className="p-3.5 bg-slate-900 rounded-2xl text-white space-y-1.5 shadow-md">
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Ara Toplam:</span>
                  <span className="font-mono font-bold text-slate-200">
                    {totals.subtotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                  </span>
                </div>
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Hesaplanan KDV:</span>
                  <span className="font-mono font-bold text-slate-200">
                    {totals.taxTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                  </span>
                </div>
                <div className="pt-1.5 border-t border-slate-800 flex justify-between items-center">
                  <span className="text-xs font-black uppercase text-indigo-300">Genel Toplam:</span>
                  <span className="font-mono text-base font-black text-emerald-400">
                    {totals.grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                  </span>
                </div>
              </div>
            </div>

            {/* Right Items List */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
                    <Package className="w-4 h-4 text-indigo-600" /> Sipariş Kalemleri ({orderItems.length})
                  </h4>
                  <p className="text-[10px] text-slate-400">Eklenen ürünlerin miktar, renk, iskonto ve birim fiyatlarını düzenleyebilirsiniz.</p>
                </div>
                <button 
                  type="button"
                  onClick={openProductSelector}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" /> Ürün & Stok Ekle
                </button>
              </div>

              <div className="border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden min-h-[260px] max-h-[380px] overflow-y-auto bg-white dark:bg-slate-900 shadow-2xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 text-[10px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
                    <tr>
                      <th className="p-3">Ürün & Renk / Detay</th>
                      <th className="p-3 text-center w-28">Miktar</th>
                      <th className="p-3 text-right w-28">Birim Fiyat</th>
                      <th className="p-3 text-center w-16">İsk. %</th>
                      <th className="p-3 text-right w-28">Toplam</th>
                      <th className="p-3 text-center w-10">Sil</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {orderItems.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-12 text-center text-slate-400 space-y-2">
                          <Package className="w-8 h-8 mx-auto opacity-30 text-indigo-600" />
                          <div className="text-xs font-bold text-slate-600">Henüz sipariş kalemi eklenmedi.</div>
                          <div className="text-[11px] text-slate-400">Ürün, renk, koli veya miktar seçmek için "Ürün & Stok Ekle" butonuna tıklayınız.</div>
                        </td>
                      </tr>
                    ) : (
                      orderItems.map((item, index) => {
                        const lineNet = (Number(item.unitPrice) || 0) * (Number(item.quantity) || 0) * (1 - (Number(item.discountRate) || 0) / 100);
                        const lineTax = lineNet * ((Number(item.taxRate) || 0) / 100);
                        const lineTotal = lineNet + lineTax;

                        return (
                          <tr key={index} className="hover:bg-slate-50 dark:bg-slate-800/50 transition-colors">
                            <td className="p-3">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-mono font-black text-slate-900 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-[11px] uppercase">
                                  {item.code}
                                </span>
                                {item.moldCode && (
                                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">
                                    Kalıp: {item.moldCode}
                                  </span>
                                )}
                              </div>
                              <div className="font-bold text-xs text-slate-800 dark:text-slate-200 mt-1 uppercase">{item.name}</div>
                              
                              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                {item.color && (
                                  <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-md uppercase">
                                    Renk: {item.color}
                                  </span>
                                )}
                                {item.size && (
                                  <span className="text-[10px] font-black text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md">
                                    Beden: {item.size}
                                  </span>
                                )}
                                {item.boxCount && item.pairsPerBox ? (
                                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded-md">
                                    {item.boxCount} Koli ({item.pairsPerBox} Çift/Koli)
                                  </span>
                                ) : null}
                                {item.notes && (
                                  <span className="text-[10px] text-slate-500 dark:text-slate-400 italic">
                                    Not: {item.notes}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="p-3 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <input 
                                  type="number" 
                                  min="1" 
                                  value={item.quantity} 
                                  onChange={(e) => updateItem(index, 'quantity', Number(e.target.value))}
                                  className="w-16 p-1 text-center font-black font-mono border border-slate-200 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-indigo-500 outline-none"
                                />
                                <span className="text-[10px] font-bold text-slate-400 uppercase">
                                  {item.unit || 'Çift'}
                                </span>
                              </div>
                            </td>
                            <td className="p-3 text-right">
                              <input 
                                type="number"
                                step="0.01"
                                min="0"
                                value={item.unitPrice}
                                onChange={(e) => updateItem(index, 'unitPrice', Number(e.target.value))}
                                className="w-20 p-1 text-right font-mono font-bold border border-slate-200 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-indigo-500 outline-none"
                              />
                            </td>
                            <td className="p-3 text-center">
                              <input 
                                type="number"
                                min="0"
                                max="100"
                                value={item.discountRate || 0}
                                onChange={(e) => updateItem(index, 'discountRate', Number(e.target.value))}
                                className="w-12 p-1 text-center font-mono font-bold border border-slate-200 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-indigo-500 outline-none"
                              />
                            </td>
                            <td className="p-3 text-right font-mono font-black text-indigo-700">
                              {lineTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                            </td>
                            <td className="p-3 text-center">
                              <button 
                                type="button" 
                                onClick={() => removeOrderItem(index)}
                                className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                                title="Kalemi Sil"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
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
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation In-App Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          if (!isProcessing) {
            setIsDeleteModalOpen(false);
            setDeleteTarget(null);
          }
        }}
        title="Siparişi Silme Onayı"
        size="md"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3.5 bg-rose-50 border border-rose-200 rounded-2xl">
            <div className="p-2 bg-rose-100 rounded-xl text-rose-600 shrink-0">
              <Trash2 className="w-5 h-5" />
            </div>
            <div className="space-y-1 text-xs">
              <p className="font-black text-rose-900">
                "{deleteTarget?.orderNumber}" numaralı siparişi silmek istediğinize emin misiniz?
              </p>
              <p className="text-rose-700 font-semibold">
                {deleteTarget?.contactName && <span>Cari: <b>{deleteTarget.contactName}</b><br /></span>}
                {deleteTarget?.grandTotal !== undefined && <span>Tutar: <b>{deleteTarget.grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</b><br /></span>}
                Bu işlem geri alınamaz. Siparişe bağlı tüm kalemler ve henüz faturası/irsaliyesi kesilmemiş iş emirleri de silinecektir.
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={isProcessing}
              onClick={() => {
                setIsDeleteModalOpen(false);
                setDeleteTarget(null);
              }}
              className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold uppercase transition-colors cursor-pointer"
            >
              Vazgeç
            </button>
            <button
              type="button"
              disabled={isProcessing}
              onClick={handleConfirmDelete}
              className="px-5 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-md transition-colors cursor-pointer flex items-center gap-1.5"
            >
              {isProcessing && <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              <span>Evet, Siparişi Sil</span>
            </button>
          </div>
        </div>
      </Modal>

      {/* Blocked / Protected Order Warning Modal */}
      <Modal
        isOpen={isBlockedModalOpen}
        onClose={() => {
          setIsBlockedModalOpen(false);
          setBlockedReason(null);
        }}
        title="İşlem Yapılamaz"
        size="md"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
            <div className="p-2 bg-amber-100 rounded-xl text-amber-600 shrink-0">
              <Lock className="w-5 h-5" />
            </div>
            <div className="space-y-1.5 text-xs">
              <h4 className="font-black text-amber-900 text-sm">Sipariş Korumalı</h4>
              <p className="text-amber-800 font-semibold leading-relaxed">
                {blockedReason}
              </p>
              <p className="text-amber-700 text-[11px]">
                Siparişi silmek veya düzenlemek için öncelikle ilgili fatura ve irsaliyeleri iptal etmeniz veya silmeniz gerekmektedir.
              </p>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={() => {
                setIsBlockedModalOpen(false);
                setBlockedReason(null);
              }}
              className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold uppercase cursor-pointer"
            >
              Tamam
            </button>
          </div>
        </div>
      </Modal>

      {/* Advanced Product & Variant Selection Modal */}
      <ProductSelectorModal
        isOpen={isProductSelectorOpen}
        onClose={() => setIsProductSelectorOpen(false)}
        onAddItem={handleAddItemFromModal}
        orderType={formOrderType}
        products={products || []}
        templates={templates || []}
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
