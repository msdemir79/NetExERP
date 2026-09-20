import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useApiQuery } from '../hooks/useApiQuery';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { erpService } from '../services/erpService';
import type { 
  Waybill, 
  WaybillItem, 
  WaybillType, 
  WaybillStatus, 
  WaybillScenario, 
  Contact, 
  Product, 
  Order 
} from '../types';
import { 
  Truck, 
  Plus, 
  Search, 
  FileText, 
  Printer, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  X, 
  Trash2, 
  Eye, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Building2, 
  ShoppingBag, 
  Calendar, 
  Tag, 
  DollarSign, 
  Percent, 
  Package, 
  Check, 
  CreditCard,
  QrCode,
  Layers,
  Sparkles,
  Ban,
  AlertTriangle,
  RotateCcw,
  FileX,
  Info,
  ShieldAlert,
  MapPin,
  Car,
  Receipt,
  Camera
} from 'lucide-react';
import { cn } from '../lib/utils';
import { WaybillPrintModal } from './Waybills/WaybillPrintModal';
import PageHeader from './PageHeader';
import CameraBarcodeScannerModal from './Common/CameraBarcodeScannerModal';

export default function Waybills() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<'all' | 'sales' | 'purchase'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'issued' | 'draft' | 'cancelled'>('all');
  const [invoicedFilter, setInvoicedFilter] = useState<'all' | 'invoiced' | 'not_invoiced'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modals
  const [isCameraScannerOpen, setIsCameraScannerOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createWaybillType, setCreateWaybillType] = useState<WaybillType>('sales');
  const [preselectedContactId, setPreselectedContactId] = useState<number | undefined>(undefined);
  const [preselectedOrderId, setPreselectedOrderId] = useState<number | undefined>(undefined);
  const [selectedWaybillId, setSelectedWaybillId] = useState<number | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);

  // Controlled Action / Delete / Cancel Modal State
  const [actionWaybill, setActionWaybill] = useState<Waybill | null>(null);
  const [isActionModalOpen, setIsActionModalOpen] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; title: string; message: string } | null>(null);

  // Auto-dismiss notification
  useEffect(() => {
    if (notification) {
      const t = setTimeout(() => setNotification(null), 6000);
      return () => clearTimeout(t);
    }
  }, [notification]);

  // Queries
  const waybills = useApiQuery(() => api.waybills.list(), [], ['waybills']);
  const contacts = useApiQuery(() => api.contacts.list(), [], ['contacts']);
  const orders = useApiQuery(() => api.orders.list(), [], ['orders']);
  const products = useApiQuery(() => api.products.list(), [], ['products']);

  // Handle URL params if directed from Orders or Contacts
  useEffect(() => {
    const orderIdParam = searchParams.get('orderId');
    const contactIdParam = searchParams.get('contactId');
    const typeParam = searchParams.get('type') as WaybillType;

    if (orderIdParam || contactIdParam) {
      if (orderIdParam) setPreselectedOrderId(Number(orderIdParam));
      if (contactIdParam) setPreselectedContactId(Number(contactIdParam));
      if (typeParam) setCreateWaybillType(typeParam);
      setIsCreateModalOpen(true);
      setSearchParams({});
    }
  }, [searchParams]);

  // Calculations for summary KPI cards
  const salesWaybills = waybills?.filter(w => w.type === 'sales' && w.status !== 'cancelled') || [];
  const purchaseWaybills = waybills?.filter(w => w.type === 'purchase' && w.status !== 'cancelled') || [];

  const totalSalesQuantity = salesWaybills.reduce((sum, w) => sum + (Number(w.totalQuantity) || 0), 0);
  const totalPurchaseQuantity = purchaseWaybills.reduce((sum, w) => sum + (Number(w.totalQuantity) || 0), 0);
  const totalSalesGrandTotal = salesWaybills.reduce((sum, w) => sum + (Number(w.grandTotal) || 0), 0);
  const totalPurchaseGrandTotal = purchaseWaybills.reduce((sum, w) => sum + (Number(w.grandTotal) || 0), 0);

  // Pending invoicing calculations
  const pendingInvoicingWaybills = waybills?.filter(w => w.status === 'issued' && (!w.invoicedStatus || w.invoicedStatus === 'not_invoiced')) || [];
  const pendingInvoicingCount = pendingInvoicingWaybills.length;
  const pendingInvoicingAmount = pendingInvoicingWaybills.reduce((sum, w) => sum + (Number(w.grandTotal) || 0), 0);

  const filteredWaybills = waybills?.filter(wb => {
    if (activeTab !== 'all' && wb.type !== activeTab) return false;
    if (statusFilter !== 'all' && wb.status !== statusFilter) return false;
    if (invoicedFilter === 'invoiced' && wb.invoicedStatus !== 'invoiced') return false;
    if (invoicedFilter === 'not_invoiced' && wb.invoicedStatus === 'invoiced') return false;
    
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const contact = contacts?.find(c => c.id === wb.contactId);
      const matchNumber = wb.waybillNumber?.toLowerCase().includes(term);
      const matchContact = contact?.name?.toLowerCase().includes(term);
      const matchOrder = wb.orderNumber?.toLowerCase().includes(term);
      const matchInvoice = wb.invoiceNumber?.toLowerCase().includes(term);
      const matchPlate = wb.vehiclePlate?.toLowerCase().includes(term);
      const matchDriver = wb.driverName?.toLowerCase().includes(term);
      const matchCarrier = wb.carrierTitle?.toLowerCase().includes(term);
      const matchEttn = wb.ettn?.toLowerCase().includes(term);
      return matchNumber || matchContact || matchOrder || matchInvoice || matchPlate || matchDriver || matchCarrier || matchEttn;
    }
    return true;
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) || [];

  const openCreateModal = (type: WaybillType = 'sales', contactId?: number, orderId?: number) => {
    setCreateWaybillType(type);
    setPreselectedContactId(contactId);
    setPreselectedOrderId(orderId);
    setIsCreateModalOpen(true);
  };

  const openViewModal = (id: number) => {
    setSelectedWaybillId(id);
    setIsViewModalOpen(true);
  };

  const openActionModalForWaybill = (wb: Waybill) => {
    setActionWaybill(wb);
    setIsActionModalOpen(true);
  };

  const handleApproveDraft = async (wb: Waybill) => {
    if (!wb.id) return;
    try {
      await erpService.updateWaybillStatus(wb.id, 'issued');
      setNotification({
        type: 'success',
        title: 'İrsaliye Kesildi',
        message: `${wb.waybillNumber} no'lu sevk irsaliyesi resmileştirildi ve stok hareketi güncellendi.`
      });
    } catch (err: any) {
      setNotification({
        type: 'error',
        title: 'İşlem Başarısız',
        message: err.message || 'İrsaliye onaylanırken hata oluştu.'
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* NOTIFICATION TOAST */}
      {notification && (
        <div className={cn(
          "p-4 rounded-2xl border flex items-center justify-between shadow-lg transition-all animate-in fade-in slide-in-from-top-4",
          notification.type === 'success' ? "bg-emerald-50 border-emerald-200 text-emerald-900" :
          notification.type === 'error' ? "bg-rose-50 border-rose-200 text-rose-900" :
          "bg-indigo-50 border-indigo-200 text-indigo-900"
        )}>
          <div className="flex items-center gap-3">
            {notification.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> :
             notification.type === 'error' ? <AlertCircle className="w-5 h-5 text-rose-600" /> :
             <Info className="w-5 h-5 text-indigo-600" />}
            <div>
              <h4 className="font-bold text-sm">{notification.title}</h4>
              <p className="text-xs opacity-90">{notification.message}</p>
            </div>
          </div>
          <button 
            onClick={() => setNotification(null)}
            className="p-1 rounded-lg hover:bg-black/5 transition-colors text-slate-500 dark:text-slate-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* HEADER & TOP ACTIONS */}
      <PageHeader
        title="İrsaliye & Sevkiyat Yönetimi"
        subtitle="GİB e-İrsaliye uyumlu sevk irsaliyeleri, yükleme çeteleleri ve sevkiyat takibi"
        badge="İrsaliyeler"
        icon={Truck}
        iconColor="blue"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => navigate('/invoices?action=selectWaybill')}
              className="bg-purple-600 hover:bg-purple-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              title="Faturalanmamış açık irsaliyeleri listeleyip faturaya dönüştür"
            >
              <Receipt className="w-3.5 h-3.5" />
              <span>İrsaliyeyi Faturalandır</span>
            </button>

            <button
              onClick={() => setIsResetModalOpen(true)}
              className="bg-white dark:bg-slate-900 hover:bg-rose-50 border border-slate-200 dark:border-slate-700 hover:border-rose-300 text-slate-600 hover:text-rose-700 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
              title="İrsaliyeleri ve sevkiyat durumlarını sıfırla"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Sıfırla</span>
            </button>

            <button
              type="button"
              onClick={() => setIsCameraScannerOpen(true)}
              className="bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/60 dark:hover:bg-purple-900/60 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
              title="Kamera ile barkod okutarak sevkiyat veya mal kabul irsaliyesi hazırla"
            >
              <Camera className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
              <span>Kamera ile İrsaliye Oku</span>
            </button>

            <button
              onClick={() => openCreateModal('purchase')}
              className="bg-white dark:bg-slate-900 hover:bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600" />
              <span>Gelen İrsaliye</span>
            </button>

            <button
              onClick={() => openCreateModal('sales')}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Yeni Sevk İrsaliyesi</span>
            </button>
          </div>
        }
      />

      {/* KPI SUMMARY CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Sevk İrsaliyeleri */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Satış & Sevk İrsaliyeleri</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
              {totalSalesGrandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
            </div>
            <div className="text-xs text-indigo-600 font-semibold mt-0.5">
              {salesWaybills.length} adet sevk irsaliyesi kesildi
            </div>
          </div>
        </div>

        {/* Toplam Sevk Miktarı */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Toplam Sevk Miktarı</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
              {totalSalesQuantity.toLocaleString('tr-TR')} <span className="text-sm font-bold text-slate-500 dark:text-slate-400">Çift</span>
            </div>
            <div className="text-xs text-emerald-600 font-semibold mt-0.5">
              Depodan sevk edilen net ürün hacmi
            </div>
          </div>
        </div>

        {/* Alış & Mal Kabul İrsaliyeleri */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Alış / Gelen İrsaliye</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <ArrowDownLeft className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
              {totalPurchaseGrandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
            </div>
            <div className="text-xs text-amber-600 font-semibold mt-0.5">
              {totalPurchaseQuantity.toLocaleString('tr-TR')} Çift / {purchaseWaybills.length} belge
            </div>
          </div>
        </div>

        {/* Faturalanmayı Bekleyen İrsaliyeler */}
        <div 
          onClick={() => {
            setInvoicedFilter(invoicedFilter === 'not_invoiced' ? 'all' : 'not_invoiced');
          }}
          className={cn(
            "bg-white dark:bg-slate-900 p-5 rounded-2xl border transition-all cursor-pointer shadow-2xs flex flex-col justify-between",
            invoicedFilter === 'not_invoiced' ? "border-purple-400 ring-2 ring-purple-400/20 bg-purple-50/20" : "border-slate-200 dark:border-slate-700 hover:border-purple-300"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Faturalanacak İrsaliyeler</span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
              {pendingInvoicingAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
            </div>
            <div className="text-xs text-purple-600 font-semibold mt-0.5 flex items-center gap-1">
              <span>{pendingInvoicingCount} adet irsaliye fatura bekliyor</span>
              {invoicedFilter === 'not_invoiced' && <span className="font-bold text-purple-700">(Filtrelendi)</span>}
            </div>
          </div>
        </div>
      </div>

      {/* SEARCH, TABS & FILTERS */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Tab Selection */}
          <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-xl w-full md:w-auto">
            <button
              onClick={() => setActiveTab('all')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                activeTab === 'all' ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs" : "text-slate-600 hover:text-slate-900 dark:text-slate-100"
              )}
            >
              Tümü ({waybills?.length || 0})
            </button>
            <button
              onClick={() => setActiveTab('sales')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5",
                activeTab === 'sales' ? "bg-white dark:bg-slate-900 text-indigo-700 shadow-2xs" : "text-slate-600 hover:text-slate-900 dark:text-slate-100"
              )}
            >
              <ArrowUpRight className="w-3.5 h-3.5 text-indigo-600" />
              <span>Satış & Sevk ({waybills?.filter(w => w.type === 'sales').length || 0})</span>
            </button>
            <button
              onClick={() => setActiveTab('purchase')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5",
                activeTab === 'purchase' ? "bg-white dark:bg-slate-900 text-emerald-700 shadow-2xs" : "text-slate-600 hover:text-slate-900 dark:text-slate-100"
              )}
            >
              <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600" />
              <span>Alış / Gelen ({waybills?.filter(w => w.type === 'purchase').length || 0})</span>
            </button>
          </div>

          {/* Status Filter & Search */}
          <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="all">Tüm Durumlar</option>
              <option value="issued">Sevk Edildi / Kesildi</option>
              <option value="draft">Taslak İrsaliyeler</option>
              <option value="cancelled">İptal Edilenler</option>
            </select>

            <select
              value={invoicedFilter}
              onChange={(e) => setInvoicedFilter(e.target.value as any)}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-purple-500/20"
            >
              <option value="all">Fatura: Tümü</option>
              <option value="not_invoiced">Faturalanmamış ({pendingInvoicingCount})</option>
              <option value="invoiced">Faturalanmış</option>
            </select>

            <div className="relative flex-1 md:w-72">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="İrsaliye no, cari, plaka, şoför..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-200 placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* WAYBILLS DATA TABLE */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50/90 border-b border-slate-200 dark:border-slate-700 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                <th className="px-3.5 py-2.5">İrsaliye Bilgileri</th>
                <th className="px-3.5 py-2.5">Cari / Alıcı Firma</th>
                <th className="px-3.5 py-2.5">Sipariş & Sevk Tarihi</th>
                <th className="px-3.5 py-2.5">Nakliye / Taşıma</th>
                <th className="px-3.5 py-2.5 text-center">Miktar</th>
                <th className="px-3.5 py-2.5 text-right">Tutar</th>
                <th className="px-3.5 py-2.5 text-center">Durum</th>
                <th className="px-3.5 py-2.5 text-right">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredWaybills.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-400">
                    <Truck className="w-10 h-10 mx-auto mb-2 opacity-30 text-indigo-500" />
                    <p className="font-bold text-sm text-slate-600">Henüz kayıtlı sevk irsaliyesi bulunamadı.</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      "Yeni Sevk İrsaliyesi" butonu ile yeni bir irsaliye oluşturabilir veya Siparişler modülünden sevk başlatabilirsiniz.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredWaybills.map((waybill) => {
                  const contact = contacts?.find(c => c.id === waybill.contactId);
                  const isSales = waybill.type === 'sales';
                  const isInvoiced = waybill.invoicedStatus === 'invoiced';

                  return (
                    <tr 
                      key={`wb-row-${waybill.id}`}
                      className={cn(
                        "hover:bg-slate-50 dark:bg-slate-800/50/80 transition-colors",
                        waybill.status === 'cancelled' ? "opacity-60 bg-rose-50/20" : ""
                      )}
                    >
                      {/* İrsaliye No & Tip */}
                      <td className="px-3.5 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <div className={cn(
                            "w-7 h-7 rounded-lg flex items-center justify-center shrink-0 font-bold text-xs",
                            isSales ? "bg-indigo-50 text-indigo-600" : "bg-emerald-50 text-emerald-600"
                          )}>
                            {isSales ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownLeft className="w-3.5 h-3.5" />}
                          </div>
                          <div>
                            <span className="font-mono font-black text-slate-900 dark:text-slate-100 text-xs hover:text-indigo-600 cursor-pointer block" onClick={() => openViewModal(waybill.id!)}>
                              {waybill.waybillNumber}
                            </span>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                                {isSales ? 'Sevk İrsaliyesi' : 'Alış İrsaliyesi'}
                              </span>
                              {waybill.ettn && (
                                <span className="text-[9px] font-mono text-slate-400 bg-slate-100 dark:bg-slate-800 px-1 rounded">
                                  e-İrsaliye
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Cari Bilgisi */}
                      <td className="px-3.5 py-2.5">
                        <div className="font-bold text-slate-900 dark:text-slate-100 uppercase">
                          {contact?.name || 'Belirtilmedi'}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-xs mt-0.5">
                          {waybill.deliveryAddress || contact?.shippingAddress || contact?.address || 'Merkez Depo'}
                        </div>
                      </td>

                      {/* Sipariş & Tarih */}
                      <td className="px-3.5 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span className="font-semibold text-slate-700 dark:text-slate-200">
                            {waybill.date ? new Date(waybill.date).toLocaleDateString('tr-TR') : '-'}
                          </span>
                        </div>
                        {waybill.orderNumber && (
                          <div className="mt-1">
                            <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded-md">
                              Sipariş: {waybill.orderNumber}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Nakliye / Araç / Şoför */}
                      <td className="px-3.5 py-2.5">
                        <div className="font-mono font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                          <Car className="w-3.5 h-3.5 text-slate-400" />
                          <span>{waybill.vehiclePlate || 'Plaka Yok'}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-xs mt-0.5">
                          {waybill.driverName ? `${waybill.driverName}` : (waybill.carrierTitle || '-')}
                        </div>
                      </td>

                      {/* Miktar */}
                      <td className="px-3.5 py-2.5 text-center">
                        <span className="font-black text-slate-900 dark:text-slate-100 text-xs">
                          {waybill.totalQuantity || 0}
                        </span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold block">Çift / Adet</span>
                      </td>

                      {/* Tutar */}
                      <td className="px-3.5 py-2.5 text-right">
                        <div className="font-mono font-black text-slate-900 dark:text-slate-100 text-xs">
                          {(waybill.grandTotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          KDV: {(waybill.taxTotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                        </div>
                      </td>

                      {/* Durum */}
                      <td className="px-3.5 py-2.5 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className={cn(
                            "px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1",
                            waybill.status === 'issued' ? "bg-emerald-100 text-emerald-800" :
                            waybill.status === 'cancelled' ? "bg-rose-100 text-rose-800" :
                            "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                          )}>
                            {waybill.status === 'issued' && <CheckCircle2 className="w-3 h-3" />}
                            {waybill.status === 'issued' ? 'Sevk Edildi' :
                             waybill.status === 'cancelled' ? 'İptal Edildi' : 'Taslak'}
                          </span>

                          {waybill.status === 'issued' && (
                            isInvoiced ? (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-black tracking-wider bg-purple-100 text-purple-800 border border-purple-200 inline-flex items-center gap-1">
                                <Receipt className="w-2.5 h-2.5" />
                                {waybill.invoiceNumber || 'Faturalandı'}
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider bg-amber-100 text-amber-800 border border-amber-200">
                                Faturalanmadı
                              </span>
                            )
                          )}
                        </div>
                      </td>

                      {/* Aksiyonlar */}
                      <td className="px-3.5 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {waybill.status === 'issued' && (
                            <button
                              disabled={isInvoiced}
                              onClick={() => {
                                if (isInvoiced) return;
                                navigate(`/invoices?waybillId=${waybill.id}&contactId=${waybill.contactId}&type=${waybill.type}`);
                              }}
                              title={isInvoiced 
                                ? `İrsaliye faturalandırılmıştır (${waybill.invoiceNumber || 'Fatura'}). Fatura iptal edilmedikçe tekrar faturalandırılamaz.` 
                                : "Bu irsaliyeyi faturaya dönüştür"
                              }
                              className={cn(
                                "px-2.5 py-1.5 rounded-lg transition-all border shadow-2xs flex items-center gap-1 text-xs font-bold",
                                isInvoiced
                                  ? "bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700 cursor-not-allowed opacity-60 shadow-none"
                                  : "text-white bg-indigo-600 hover:bg-indigo-700 border-transparent cursor-pointer hover:shadow-md"
                              )}
                            >
                              <Receipt className="w-3.5 h-3.5" />
                              <span>{isInvoiced ? 'Faturalandı' : 'Faturalandır'}</span>
                            </button>
                          )}

                          {isInvoiced && waybill.invoiceNumber && (
                            <button
                              onClick={() => navigate(`/invoices?search=${encodeURIComponent(waybill.invoiceNumber || '')}`)}
                              title={`Bağlı Faturayı Görüntüle: ${waybill.invoiceNumber}`}
                              className="p-1.5 text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg transition-all border border-purple-200 shadow-2xs flex items-center gap-1 text-xs font-bold cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5 text-purple-600" />
                            </button>
                          )}

                          <button
                            onClick={() => openViewModal(waybill.id!)}
                            title="GİB e-İrsaliye Önizle & Yazdır"
                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-white dark:bg-slate-900 rounded-lg transition-all border border-transparent hover:border-slate-200 dark:border-slate-700 shadow-2xs cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {waybill.status === 'draft' && (
                            <button
                              onClick={() => handleApproveDraft(waybill)}
                              title="Resmileştir / Sevk Et"
                              className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-white dark:bg-slate-900 rounded-lg transition-all border border-transparent hover:border-slate-200 dark:border-slate-700 shadow-2xs"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                          )}

                          {waybill.status === 'issued' && (
                            <button
                              onClick={() => openActionModalForWaybill(waybill)}
                              title="İrsaliyeyi İptal Et"
                              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all border border-transparent hover:border-rose-200 shadow-2xs flex items-center gap-1 text-xs font-semibold"
                            >
                              <Ban className="w-4 h-4 text-rose-500" />
                              <span className="hidden xl:inline text-[11px] text-rose-600">İptal / Sil</span>
                            </button>
                          )}

                          {(waybill.status === 'cancelled' || waybill.status === 'draft') && (
                            <button
                              onClick={() => openActionModalForWaybill(waybill)}
                              title={waybill.status === 'cancelled' ? "İptal Edilmiş İrsaliyeyi Kalıcı Olarak Temizle" : "Taslağı Sil"}
                              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-white dark:bg-slate-900 rounded-lg transition-all border border-transparent hover:border-slate-200 dark:border-slate-700 shadow-2xs"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
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

      {/* CREATE WAYBILL MODAL */}
      {isCreateModalOpen && (
        <CreateWaybillModal
          isOpen={isCreateModalOpen}
          initialType={createWaybillType}
          initialContactId={preselectedContactId}
          initialOrderId={preselectedOrderId}
          onClose={() => {
            setIsCreateModalOpen(false);
            setPreselectedContactId(undefined);
            setPreselectedOrderId(undefined);
          }}
          onSuccess={(waybillId) => {
            setIsCreateModalOpen(false);
            openViewModal(waybillId);
          }}
        />
      )}

      {/* VIEW & PRINT WAYBILL MODAL */}
      {isViewModalOpen && selectedWaybillId && (
        <WaybillPrintModal
          waybillId={selectedWaybillId}
          isOpen={isViewModalOpen}
          onClose={() => {
            setIsViewModalOpen(false);
            setSelectedWaybillId(null);
          }}
        />
      )}

      {/* ACTION / CANCEL / DELETE MODAL */}
      {isActionModalOpen && actionWaybill && (
        <ActionWaybillModal
          waybill={actionWaybill}
          isOpen={isActionModalOpen}
          onClose={() => {
            setIsActionModalOpen(false);
            setActionWaybill(null);
          }}
          onSuccess={(msg) => {
            setIsActionModalOpen(false);
            setActionWaybill(null);
            setNotification({
              type: 'success',
              title: 'İşlem Başarılı',
              message: msg
            });
          }}
        />
      )}

      {/* RESET WAYBILLS MODAL */}
      {isResetModalOpen && (
        <ResetWaybillsModal
          isOpen={isResetModalOpen}
          onClose={() => setIsResetModalOpen(false)}
          onSuccess={() => {
            setIsResetModalOpen(false);
            setNotification({
              type: 'success',
              title: 'İrsaliyeler Sıfırlandı',
              message: 'Tüm sevk irsaliyeleri temizlendi ve sipariş sevk durumları geri yüklendi.'
            });
          }}
        />
      )}

      {/* KAMERA İLE CANLI BARKOD / İRSALİYE OKUYUCU */}
      <CameraBarcodeScannerModal
        isOpen={isCameraScannerOpen}
        onClose={() => setIsCameraScannerOpen(false)}
        initialMode="waybill_dispatch"
      />
    </div>
  );
}

// =========================================================================================
// CREATE WAYBILL MODAL (With direct Order import & manual line item builder)
// =========================================================================================
interface CreateWaybillModalProps {
  isOpen: boolean;
  initialType: WaybillType;
  initialContactId?: number;
  initialOrderId?: number;
  onClose: () => void;
  onSuccess: (waybillId: number) => void;
}

function CreateWaybillModal({
  isOpen,
  initialType,
  initialContactId,
  initialOrderId,
  onClose,
  onSuccess
}: CreateWaybillModalProps) {
  const [type, setType] = useState<WaybillType>(initialType);
  const [scenario, setScenario] = useState<WaybillScenario>('sevk');
  const [contactId, setContactId] = useState<number | ''>(initialContactId || '');
  const [waybillNumber, setWaybillNumber] = useState('');
  const [ettn, setEttn] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [dispatchDate, setDispatchDate] = useState(new Date().toISOString().split('T')[0]);
  const [dispatchTime, setDispatchTime] = useState(
    new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
  );
  
  // Logistics & Carrier
  const [carrierTitle, setCarrierTitle] = useState('ÖZLEM NAKLİYAT VE LOJİSTİK A.Ş.');
  const [carrierTaxNo, setCarrierTaxNo] = useState('3890123456');
  const [vehiclePlate, setVehiclePlate] = useState('34 YK 8842');
  const [trailerPlate, setTrailerPlate] = useState('');
  const [driverName, setDriverName] = useState('Ahmet Yılmaz');
  const [driverTc, setDriverTc] = useState('28934102948');
  const [deliveryAddress, setDeliveryAddress] = useState('');

  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<WaybillStatus>('issued');
  const [isStockDeducted, setIsStockDeducted] = useState(true);
  const [selectedOrderId, setSelectedOrderId] = useState<number | undefined>(initialOrderId);
  const [selectedOrderNumber, setSelectedOrderNumber] = useState<string | undefined>('');

  // Items State
  const [items, setItems] = useState<Omit<WaybillItem, 'id' | 'waybillId'>[]>([]);

  // Pending orders selector
  const [isOrderSelectorOpen, setIsOrderSelectorOpen] = useState(false);
  const [pendingOrders, setPendingOrders] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Queries
  const contacts = useApiQuery(() => api.contacts.list(), [], ['contacts']);
  const products = useApiQuery(() => api.products.list(), [], ['products']);

  // Generate initial waybill number and ETTN
  useEffect(() => {
    async function initWaybillInfo() {
      const num = await erpService.generateWaybillNumber(type);
      setWaybillNumber(num);
      setEttn(erpService.generateETTN());
    }
    initWaybillInfo();
  }, [type]);

  // When contact changes, update delivery address from contact profile
  useEffect(() => {
    if (contactId) {
      const selectedContact = contacts?.find(c => c.id === Number(contactId));
      if (selectedContact) {
        setDeliveryAddress(selectedContact.shippingAddress || selectedContact.address || '');
      }
    }
  }, [contactId, contacts]);

  // Load pending orders when contact changes
  useEffect(() => {
    async function loadOrders() {
      if (contactId) {
        const ords = await erpService.getPendingOrdersForWaybill(Number(contactId), type);
        setPendingOrders(ords);

        // If an initial order ID was passed, auto-load its remaining items
        if (initialOrderId && ords.some(o => o.id === initialOrderId)) {
          const target = ords.find(o => o.id === initialOrderId);
          if (target) {
            importOrderItems(target);
          }
        }
      } else {
        setPendingOrders([]);
      }
    }
    loadOrders();
  }, [contactId, type, initialOrderId]);

  // Helper to import items from an order
  const importOrderItems = (order: any) => {
    setSelectedOrderId(order.id);
    setSelectedOrderNumber(order.orderNumber);

    const mappedItems: Omit<WaybillItem, 'id' | 'waybillId'>[] = order.items.map((oi: any) => {
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
        quantity: remaining,
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
    setItems(prev => [
      ...prev,
      {
        productCode: '',
        productName: '',
        quantity: 1,
        unit: 'Çift',
        unitPrice: 0,
        discountRate: 0,
        discountAmount: 0,
        taxRate: 20,
        taxAmount: 0,
        total: 0
      }
    ]);
  };

  // Update item field
  const updateItem = (index: number, field: string, value: any) => {
    setItems(prev => {
      const updated = [...prev];
      const current = { ...updated[index], [field]: value };

      if (field === 'productId') {
        const prod = products?.find(p => p.id === Number(value));
        if (prod) {
          current.productId = prod.id;
          current.productCode = prod.code;
          current.productName = prod.name;
          current.unitPrice = type === 'sales' ? (prod.sellingPrice || 0) : (prod.buyingPrice || 0);
        }
      }

      const qty = Number(current.quantity) || 0;
      const price = Number(current.unitPrice) || 0;
      const discRate = Number(current.discountRate) || 0;
      const taxRate = Number(current.taxRate) || 0;

      const sub = qty * price;
      const discAmt = (sub * discRate) / 100;
      const taxable = sub - discAmt;
      const taxAmt = (taxable * taxRate) / 100;
      const total = taxable + taxAmt;

      current.discountAmount = discAmt;
      current.taxAmount = taxAmt;
      current.total = total;

      updated[index] = current;
      return updated;
    });
  };

  // Remove item
  const removeItem = (index: number) => {
    setItems(prev => prev.filter((_, idx) => idx !== index));
  };

  // Total Calculations
  const subtotal = items.reduce((sum, it) => sum + (it.quantity * it.unitPrice - it.discountAmount), 0);
  const discountTotal = items.reduce((sum, it) => sum + it.discountAmount, 0);
  const taxTotal = items.reduce((sum, it) => sum + it.taxAmount, 0);
  const grandTotal = subtotal + taxTotal;
  const totalQuantity = items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);

  const handleSubmit = async (submitStatus: WaybillStatus) => {
    if (!contactId) {
      alert('Lütfen bir müşteri veya tedarikçi cari seçiniz.');
      return;
    }
    if (items.length === 0) {
      alert('Lütfen en az bir sevk kalemi ekleyiniz.');
      return;
    }

    setIsSubmitting(true);
    try {
      const waybillId = await erpService.createWaybill(
        {
          waybillNumber,
          type,
          scenario,
          contactId: Number(contactId),
          orderId: selectedOrderId,
          orderNumber: selectedOrderNumber,
          date: new Date(date),
          dispatchDate: new Date(dispatchDate),
          dispatchTime,
          carrierTitle,
          carrierTaxNo,
          vehiclePlate,
          trailerPlate,
          driverName,
          driverTc,
          deliveryAddress,
          ettn,
          subtotal,
          discountTotal,
          taxTotal,
          grandTotal,
          totalQuantity,
          currency: 'TRY',
          status: submitStatus,
          isStockDeducted,
          invoicedStatus: 'not_invoiced',
          notes
        },
        items
      );

      onSuccess(waybillId);
    } catch (err: any) {
      console.error('İrsaliye oluşturulamadı:', err);
      alert('İrsaliye oluşturulurken hata oluştu: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-5xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl flex flex-col max-h-[96vh] overflow-hidden border border-slate-200 dark:border-slate-700">
        
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 px-6 flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black tracking-tight">
                {type === 'sales' ? 'Yeni Sevk / Satış İrsaliyesi Düzenle' : 'Yeni Alış / Gelen İrsaliye Düzenle'}
              </h3>
              <p className="text-xs text-slate-400">
                GİB e-İrsaliye ve VUK 509 Tebliği Standartlarında Sevk Kaydı
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50 dark:bg-slate-800/50/50 text-xs">
          
          {/* Top Form Fields */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs">
            {/* İrsaliye Tipi & Senaryo */}
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">İrsaliye Türü</label>
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                <button
                  type="button"
                  onClick={() => setType('sales')}
                  className={cn(
                    "py-1.5 rounded-lg font-bold text-xs transition-all",
                    type === 'sales' ? "bg-white dark:bg-slate-900 text-indigo-700 shadow-2xs" : "text-slate-600"
                  )}
                >
                  Sevk / Satış
                </button>
                <button
                  type="button"
                  onClick={() => setType('purchase')}
                  className={cn(
                    "py-1.5 rounded-lg font-bold text-xs transition-all",
                    type === 'purchase' ? "bg-white dark:bg-slate-900 text-emerald-700 shadow-2xs" : "text-slate-600"
                  )}
                >
                  Alış / Gelen
                </button>
              </div>
            </div>

            {/* Senaryo */}
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">e-İrsaliye Senaryosu</label>
              <select
                value={scenario}
                onChange={(e) => setScenario(e.target.value as WaybillScenario)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value="sevk">TEMEL SEVK İRSALİYESİ</option>
                <option value="matbu">MATBU SEVK İRSALİYESİ</option>
                <option value="fason">FASON SEVK İRSALİYESİ</option>
                <option value="konsinye">KONSİNYE SEVK İRSALİYESİ</option>
                <option value="ihracat">İHRACAT SEVK İRSALİYESİ</option>
              </select>
            </div>

            {/* İrsaliye No & ETTN */}
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">İrsaliye Numarası</label>
              <input
                type="text"
                value={waybillNumber}
                onChange={(e) => setWaybillNumber(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl font-mono font-bold text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            {/* Cari Müşteri / Tedarikçi */}
            <div className="md:col-span-2">
              <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">
                {type === 'sales' ? 'Müşteri / Alıcı Cari' : 'Tedarikçi Cari'}
              </label>
              <select
                value={contactId}
                onChange={(e) => setContactId(e.target.value ? Number(e.target.value) : '')}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-900 dark:text-slate-100"
              >
                <option value="">-- Cari Seçiniz --</option>
                {contacts?.map(c => (
                  <option key={`wb-contact-opt-${c.id}`} value={c.id}>
                    {c.name} {c.companyTitle ? `(${c.companyTitle})` : ''} - {c.city || ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Siparişten Çağır Butonu */}
            <div className="flex items-end">
              <button
                type="button"
                disabled={!contactId}
                onClick={() => setIsOrderSelectorOpen(true)}
                className={cn(
                  "w-full py-2 px-3 rounded-xl font-bold flex items-center justify-center gap-2 border transition-all",
                  contactId 
                    ? "bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200 shadow-2xs cursor-pointer"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700 cursor-not-allowed"
                )}
              >
                <ShoppingBag className="w-4 h-4" />
                <span>
                  {selectedOrderNumber ? `Sipariş: ${selectedOrderNumber}` : 'Açık Siparişten Aktar'}
                </span>
              </button>
            </div>

            {/* Tarih Bilgileri */}
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">İrsaliye Tarihi</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">Fiili Sevk Tarihi</label>
              <input
                type="date"
                value={dispatchDate}
                onChange={(e) => setDispatchDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">Fiili Sevk Saati</label>
              <input
                type="time"
                value={dispatchTime}
                onChange={(e) => setDispatchTime(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
          </div>

          {/* Logistics & Carrier Box */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs space-y-3">
            <div className="flex items-center gap-2 text-indigo-900 font-bold border-b border-slate-100 dark:border-slate-800 pb-2">
              <Car className="w-4 h-4 text-indigo-600" />
              <span>Taşıyıcı & Lojistik Sevk Bilgileri (GİB e-İrsaliye Zorunlu Alanları)</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-0.5">Taşıyıcı Firma / Kargo</label>
                <input
                  type="text"
                  placeholder="Örn: Yurtiçi Kargo, MNG, Özlem Lojistik"
                  value={carrierTitle}
                  onChange={(e) => setCarrierTitle(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-0.5">Araç / Çekici Plakası</label>
                <input
                  type="text"
                  placeholder="Örn: 34 YK 8842"
                  value={vehiclePlate}
                  onChange={(e) => setVehiclePlate(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono uppercase"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-0.5">Sürücü Adı Soyadı</label>
                <input
                  type="text"
                  placeholder="Örn: Ahmet Yılmaz"
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-0.5">Sürücü TCKN</label>
                <input
                  type="text"
                  placeholder="11 haneli TCKN"
                  value={driverTc}
                  onChange={(e) => setDriverTc(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono"
                />
              </div>

              <div className="md:col-span-4">
                <label className="text-[11px] font-bold text-slate-600 block mb-0.5">
                  Teslimat / Sevk Depo Adresi
                </label>
                <input
                  type="text"
                  placeholder="Sevkiyatın yapılacağı şantiye, fabrika veya depo adresi"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
                />
              </div>
            </div>
          </div>

          {/* LINE ITEMS TABLE */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs overflow-hidden">
            <div className="p-3 px-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-indigo-600" />
                <span className="font-black text-slate-800 dark:text-slate-200 text-xs">Sevk Edilecek Mal / Hizmet Kalemleri</span>
                <span className="bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full font-bold text-[10px]">
                  {items.length} Kalem
                </span>
              </div>
              <button
                type="button"
                onClick={addBlankItem}
                className="bg-white dark:bg-slate-900 hover:bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 px-3 py-1 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 shadow-2xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Manuel Satır Ekle</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800/75 border-b border-slate-200 dark:border-slate-700 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    <th className="p-2.5 w-10 text-center">#</th>
                    <th className="p-2.5 min-w-[200px]">Ürün / Hizmet</th>
                    <th className="p-2.5 w-24">Renk / Beden</th>
                    <th className="p-2.5 w-20 text-center">Miktar</th>
                    <th className="p-2.5 w-16 text-center">Birim</th>
                    <th className="p-2.5 w-24 text-right">Birim Fiyat</th>
                    <th className="p-2.5 w-16 text-center">KDV %</th>
                    <th className="p-2.5 w-24 text-right">Net Tutar</th>
                    <th className="p-2.5 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-400">
                        Henüz kalem eklenmedi. Açık siparişten aktarabilir veya "Manuel Satır Ekle" butonuna basabilirsiniz.
                      </td>
                    </tr>
                  ) : (
                    items.map((item, idx) => (
                      <tr key={`wb-item-${item.productId || 'p'}-${idx}`} className="hover:bg-slate-50 dark:bg-slate-800/50/50">
                        <td className="p-2.5 text-center text-slate-400 font-bold">{idx + 1}</td>
                        <td className="p-2.5">
                          <select
                            value={item.productId || ''}
                            onChange={(e) => updateItem(idx, 'productId', e.target.value)}
                            className="w-full p-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded font-semibold text-slate-800 dark:text-slate-200"
                          >
                            <option value="">-- Ürün Seç --</option>
                            {products?.map(p => (
                              <option key={`wb-prod-opt-${p.id}`} value={p.id}>
                                {p.code} - {p.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2.5">
                          <div className="flex gap-1">
                            <input
                              type="text"
                              placeholder="Renk"
                              value={item.color || ''}
                              onChange={(e) => updateItem(idx, 'color', e.target.value)}
                              className="w-1/2 p-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded text-center"
                            />
                            <input
                              type="text"
                              placeholder="Beden"
                              value={item.size || ''}
                              onChange={(e) => updateItem(idx, 'size', e.target.value)}
                              className="w-1/2 p-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded text-center"
                            />
                          </div>
                        </td>
                        <td className="p-2.5">
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateItem(idx, 'quantity', Number(e.target.value))}
                            className="w-full p-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded font-bold text-center"
                          />
                        </td>
                        <td className="p-2.5">
                          <select
                            value={item.unit}
                            onChange={(e) => updateItem(idx, 'unit', e.target.value)}
                            className="w-full p-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded text-center"
                          >
                            <option value="Çift">Çift</option>
                            <option value="Adet">Adet</option>
                            <option value="Metre">Metre</option>
                            <option value="Kg">Kg</option>
                            <option value="Paket">Paket</option>
                          </select>
                        </td>
                        <td className="p-2.5">
                          <input
                            type="number"
                            step="0.01"
                            value={item.unitPrice}
                            onChange={(e) => updateItem(idx, 'unitPrice', Number(e.target.value))}
                            className="w-full p-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded text-right font-mono"
                          />
                        </td>
                        <td className="p-2.5">
                          <select
                            value={item.taxRate}
                            onChange={(e) => updateItem(idx, 'taxRate', Number(e.target.value))}
                            className="w-full p-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded text-center"
                          >
                            <option value={0}>%0</option>
                            <option value={1}>%1</option>
                            <option value={10}>%10</option>
                            <option value={20}>%20</option>
                          </select>
                        </td>
                        <td className="p-2.5 text-right font-mono font-black text-slate-900 dark:text-slate-100">
                          {item.total.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                        </td>
                        <td className="p-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => removeItem(idx)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bottom Summary & Notes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs">
                <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">Sevk & Lojistik Notları</label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Şoföre talimatlar, koli no, ambalaj durumu veya teslimat özel notları..."
                  className="w-full p-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none"
                />
              </div>

              {/* Stok Hareketi Checkbox */}
              <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="stockDeduct"
                    checked={isStockDeducted}
                    onChange={(e) => setIsStockDeducted(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded border-slate-300"
                  />
                  <label htmlFor="stockDeduct" className="font-bold text-slate-800 dark:text-slate-200 text-xs cursor-pointer">
                    Stok Hareketi Otomatik Düşülsün / Eklensin
                  </label>
                </div>
                <span className="text-[10px] text-slate-400 font-semibold">Varyant bazlı stok senkronize edilir</span>
              </div>
            </div>

            {/* Calculations Box */}
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs space-y-2 font-mono text-xs">
              <div className="flex justify-between text-slate-600">
                <span className="font-sans font-bold">Toplam Sevk Miktarı:</span>
                <span className="font-black text-slate-900 dark:text-slate-100 text-sm">{totalQuantity} Çift</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Ara Toplam (KDV Hariç):</span>
                <span className="font-bold">{subtotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
              </div>
              {discountTotal > 0 && (
                <div className="flex justify-between text-rose-600">
                  <span>Toplam İskonto:</span>
                  <span className="font-bold">-{discountTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                </div>
              )}
              <div className="flex justify-between text-slate-600 border-b border-slate-100 dark:border-slate-800 pb-2">
                <span>Hesaplanan KDV:</span>
                <span className="font-bold">{taxTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
              </div>
              <div className="flex justify-between text-sm font-black text-slate-900 dark:text-slate-100 pt-1">
                <span className="font-sans">GENEL TOPLAM:</span>
                <span className="text-indigo-600 font-black">
                  {grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
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
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-colors"
          >
            Vazgeç
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleSubmit('draft')}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded-xl text-xs font-bold transition-colors"
            >
              Taslak Kaydet
            </button>

            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleSubmit('issued')}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition-all cursor-pointer"
            >
              <Truck className="w-4 h-4" />
              <span>İrsaliyeyi Kes & Sevk Et</span>
            </button>
          </div>
        </div>

        {/* ORDER SELECTOR MODAL */}
        {isOrderSelectorOpen && (
          <div className="absolute inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-xl max-h-[80vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-700">
              <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShoppingBag className="w-5 h-5 text-indigo-600" />
                  <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">Açık Sipariş Kalemlerini Aktar</h4>
                </div>
                <button 
                  onClick={() => setIsOrderSelectorOpen(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 overflow-y-auto space-y-3 flex-1">
                {pendingOrders.length === 0 ? (
                  <div className="p-8 text-center text-slate-400">
                    <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-30 text-emerald-600" />
                    <p className="font-bold text-slate-600">Bu cariye ait bekleyen açık sipariş bulunamadı.</p>
                  </div>
                ) : (
                  pendingOrders.map(ord => (
                    <div 
                      key={`wb-pending-ord-${ord.id}`}
                      className="p-3 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-indigo-300 hover:bg-indigo-50/30 transition-all cursor-pointer space-y-2"
                      onClick={() => importOrderItems(ord)}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-indigo-700">{ord.orderNumber}</span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">
                          Tarih: {new Date(ord.date).toLocaleDateString('tr-TR')}
                        </span>
                      </div>
                      <div className="text-xs text-slate-700 dark:text-slate-200">
                        {ord.items?.length || 0} kalem ürün sevk edilmeyi bekliyor
                      </div>
                      <div className="flex justify-between items-center text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800">
                        <span>Kalan Miktar: {ord.items?.reduce((s: number, i: any) => s + (i.remainingQuantity || i.quantity), 0)} Çift</span>
                        <span className="text-indigo-600 font-bold">Bu Siparişi Aktar →</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// =========================================================================================
// ACTION / CANCEL / DELETE MODAL
// =========================================================================================
function ActionWaybillModal({
  waybill,
  isOpen,
  onClose,
  onSuccess
}: {
  waybill: Waybill;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (msg: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleCancel = async () => {
    if (!waybill.id || isDeleting) return;
    setIsDeleting(true);
    try {
      await erpService.cancelWaybill(waybill.id, reason);
      onSuccess(`${waybill.waybillNumber} no'lu irsaliye iptal edildi, sipariş sevk miktarı ve stok geri yüklendi.`);
    } catch (err: any) {
      alert('İptal işlemi başarısız: ' + err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDelete = async () => {
    if (!waybill.id || isDeleting) return;
    if (!confirm('Bu irsaliye kaydını kalıcı olarak silmek istediğinize emin misiniz?')) return;

    setIsDeleting(true);
    try {
      await erpService.deleteWaybill(waybill.id);
      onSuccess(`${waybill.waybillNumber} no'lu irsaliye kalıcı olarak silindi.`);
    } catch (err: any) {
      alert('Silme işlemi başarısız: ' + err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-rose-400" />
            <h3 className="font-bold text-sm">İrsaliye İşlemi: {waybill.waybillNumber}</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          {waybill.invoicedStatus === 'invoiced' && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Bu İrsaliye Faturalandırılmıştır!</p>
                <p className="text-[11px] text-rose-700 mt-0.5">
                  Bağlı Fatura No: <strong>{waybill.invoiceNumber || 'Fatura Kesilmiş'}</strong>. İrsaliyeyi iptal etmek veya silmek için lütfen önce ilgili faturayı iptal ediniz.
                </p>
              </div>
            </div>
          )}

          {waybill.status === 'issued' ? (
            <>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900">
                <p className="font-bold">İrsaliyeyi İptal Et</p>
                <p className="text-[11px] mt-0.5">
                  Bu irsaliye iptal edildiğinde bağlı sipariş kalemlerinin sevk miktarları geri yüklenecek ve stok hareketi otomatik olarak tersine çevrilecektir.
                </p>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">İptal Sebebi (Opsiyonel)</label>
                <input
                  type="text"
                  value={reason}
                  disabled={waybill.invoicedStatus === 'invoiced'}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Örn: Müşteri siparişi revize etti / Sevkiyat ertelendi"
                  className="w-full p-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs disabled:opacity-50"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleCancel}
                  disabled={waybill.invoicedStatus === 'invoiced' || isDeleting}
                  className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Ban className="w-4 h-4" />
                  <span>{isDeleting ? 'İşleniyor...' : 'İrsaliyeyi İptal Et'}</span>
                </button>
                <button
                  onClick={handleDelete}
                  disabled={waybill.invoicedStatus === 'invoiced' || isDeleting}
                  className="px-3 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed text-slate-600 font-bold rounded-xl transition-all cursor-pointer"
                  title="Kalıcı Olarak Sil"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-slate-600 font-medium">
                Bu irsaliye taslak veya iptal durumundadır. Kaydı kalıcı olarak veritabanından temizlemek istiyor musunuz?
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={onClose} disabled={isDeleting} className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 font-bold rounded-xl cursor-pointer">Vazgeç</button>
                <button onClick={handleDelete} disabled={isDeleting} className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl flex items-center gap-1.5 cursor-pointer">
                  <Trash2 className="w-4 h-4" />
                  <span>{isDeleting ? 'Siliniyor...' : 'Kalıcı Olarak Sil'}</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// =========================================================================================
// RESET WAYBILLS MODAL
// =========================================================================================
function ResetWaybillsModal({
  isOpen,
  onClose,
  onSuccess
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [resetStock, setResetStock] = useState(true);
  const [resetOrders, setResetOrders] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleReset = async () => {
    if (!confirm('DİKKAT: Tüm irsaliyeler silinecektir. Devam etmek istiyor musunuz?')) return;

    setIsSubmitting(true);
    try {
      await erpService.resetWaybillsAndShipments({
        resetStockMovements: resetStock,
        resetOrdersShipment: resetOrders
      });
      onSuccess();
    } catch (err: any) {
      alert('Sıfırlama sırasında hata oluştu: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="p-4 bg-rose-600 text-white flex justify-between items-center">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-white" />
            <h3 className="font-bold text-sm">İrsaliyeleri Sıfırla</h3>
          </div>
          <button onClick={onClose} className="text-rose-200 hover:text-white"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          <p className="text-slate-600">
            Test ve kurulum aşamasında girilen tüm sevk ve alış irsaliyelerini topluca temizler.
          </p>

          <div className="space-y-2 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
            <label className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200 cursor-pointer">
              <input 
                type="checkbox" 
                checked={resetOrders} 
                onChange={(e) => setResetOrders(e.target.checked)} 
                className="rounded text-rose-600"
              />
              <span>Siparişlerin Sevk Miktarını ve Durumunu Geri Yükle</span>
            </label>
            <label className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200 cursor-pointer">
              <input 
                type="checkbox" 
                checked={resetStock} 
                onChange={(e) => setResetStock(e.target.checked)} 
                className="rounded text-rose-600"
              />
              <span>İrsaliye Kaynaklı Stok Hareketlerini Temizle</span>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 font-bold rounded-xl">Vazgeç</button>
            <button 
              disabled={isSubmitting}
              onClick={handleReset} 
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl flex items-center gap-1.5"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Sıfırla</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
