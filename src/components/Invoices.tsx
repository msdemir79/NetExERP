import React, { useState, useEffect } from 'react';
import { useApiQuery } from '../hooks/useApiQuery';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { erpService } from '../services/erpService';
import type { Invoice, InvoiceItem, InvoiceType, InvoiceStatus, InvoiceScenario, Contact, Product, Order } from '../types';
import { 
  Receipt, 
  Plus, 
  Search, 
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
  DollarSign, 
  Percent, 
  Package, 
  Check, 
  Ban,
  AlertTriangle,
  RotateCcw,
  Info,
  ShieldAlert,
  Truck
} from 'lucide-react';
import { cn } from '../lib/utils';
import DataGrid, { StatusPill, type GridColumn, type PillTone } from './Common/DataGrid';
import { InvoicePrintModal } from './Invoices/InvoicePrintModal';
import PageHeader from './PageHeader';

export default function Invoices() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<'all' | 'sales' | 'purchase'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'issued' | 'draft' | 'cancelled'>('all');
  
  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createInvoiceType, setCreateInvoiceType] = useState<InvoiceType>('sales');
  const [preselectedContactId, setPreselectedContactId] = useState<number | undefined>(undefined);
  const [preselectedOrderId, setPreselectedOrderId] = useState<number | undefined>(undefined);
  const [preselectedWaybillId, setPreselectedWaybillId] = useState<number | undefined>(undefined);
  const [isGlobalWaybillSelectorOpen, setIsGlobalWaybillSelectorOpen] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);

  // Controlled Action / Delete / Cancel Modal State
  const [actionInvoice, setActionInvoice] = useState<Invoice | null>(null);
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
  const invoices = useApiQuery(() => api.invoices.list(), [], ['invoices']);
  const contacts = useApiQuery(() => api.contacts.list(), [], ['contacts']);
  const orders = useApiQuery(() => api.orders.list(), [], ['orders']);
  const products = useApiQuery(() => api.products.list(), [], ['products']);

  // Handle URL params if directed from Orders, Waybills, or Contacts
  useEffect(() => {
    const orderIdParam = searchParams.get('orderId');
    const waybillIdParam = searchParams.get('waybillId');
    const contactIdParam = searchParams.get('contactId');
    const typeParam = searchParams.get('type') as InvoiceType;
    const actionParam = searchParams.get('action');

    if (actionParam === 'selectWaybill' || searchParams.get('openWaybillSelector') === 'true') {
      setIsGlobalWaybillSelectorOpen(true);
      setSearchParams({});
    } else if (orderIdParam || waybillIdParam || contactIdParam) {
      if (orderIdParam) setPreselectedOrderId(Number(orderIdParam));
      if (waybillIdParam) setPreselectedWaybillId(Number(waybillIdParam));
      if (contactIdParam) setPreselectedContactId(Number(contactIdParam));
      if (typeParam) setCreateInvoiceType(typeParam);
      setIsCreateModalOpen(true);
      // clear search params from url
      setSearchParams({});
    }
  }, [searchParams]);

  // Calculations for summary KPI cards
  const salesInvoices = invoices?.filter(i => i.type === 'sales' && i.status !== 'cancelled') || [];
  const purchaseInvoices = invoices?.filter(i => i.type === 'purchase' && i.status !== 'cancelled') || [];

  const totalSalesAmount = salesInvoices.reduce((sum, i) => sum + i.grandTotal, 0);
  const totalPurchaseAmount = purchaseInvoices.reduce((sum, i) => sum + i.grandTotal, 0);
  const totalSalesTax = salesInvoices.reduce((sum, i) => sum + i.taxTotal, 0);
  const totalPurchaseTax = purchaseInvoices.reduce((sum, i) => sum + i.taxTotal, 0);
  const netVatPayable = totalSalesTax - totalPurchaseTax; // Hesaplanan KDV - İndirilecek KDV

  const filteredInvoices = invoices?.filter(inv => {
    if (activeTab !== 'all' && inv.type !== activeTab) return false;
    if (statusFilter !== 'all' && inv.status !== statusFilter) return false;
    return true;
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) || [];

  const invoiceStatusMeta: Record<InvoiceStatus, { label: string; tone: PillTone }> = {
    draft: { label: 'Taslak', tone: 'slate' },
    issued: { label: 'Kesildi', tone: 'green' },
    cancelled: { label: 'İptal Edildi', tone: 'red' }
  };

  const invoiceScenarioLabel = (scenario: InvoiceScenario) =>
    scenario === 'commercial' ? 'Ticari Fatura' :
    scenario === 'basic' ? 'Temel Fatura' :
    scenario === 'return' ? 'İade Faturası' :
    scenario === 'withholding' ? 'Tevkifatlı' :
    scenario === 'export' ? 'İhracat' : scenario;

  const invoiceColumns: GridColumn<Invoice>[] = [
    {
      key: 'invoiceNumber',
      title: 'Fatura No & ETTN',
      render: (invoice) => (
        <div className="flex flex-col">
          <span className="font-mono font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
            {invoice.invoiceNumber}
          </span>
          {invoice.ettn && (
            <span className="font-mono text-[9px] text-slate-400 tracking-tighter truncate max-w-[130px]" title={invoice.ettn}>
              ETTN: {invoice.ettn.substring(0, 8)}...
            </span>
          )}
        </div>
      ),
      filterValue: (invoice) => `${invoice.invoiceNumber || ''} ${invoice.ettn || ''}`
    },
    {
      key: 'contactId',
      title: 'Cari / Ünvan',
      render: (invoice) => {
        const contact = contacts?.find(c => c.id === invoice.contactId);
        const isSales = invoice.type === 'sales';
        return (
          <div className="flex items-center gap-2.5">
            <div className={cn(
              "w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black uppercase shrink-0",
              isSales ? "bg-indigo-50 text-indigo-700" : "bg-amber-50 text-amber-700"
            )}>
              {contact?.name ? contact.name.substring(0, 2) : 'C'}
            </div>
            <div>
              <div className="font-bold text-slate-800 dark:text-slate-200 line-clamp-1">{contact?.name || 'Bilinmeyen Cari'}</div>
              <div className="text-[10px] text-slate-400">{contact?.taxOffice ? `${contact.taxOffice} V.D.` : ''}</div>
            </div>
          </div>
        );
      },
      filterValue: (invoice) => {
        const contact = contacts?.find(c => c.id === invoice.contactId);
        return `${contact?.name || ''} ${contact?.taxOffice || ''}`;
      }
    },
    {
      key: 'date',
      title: 'Tarih / Vade',
      render: (invoice) => (
        <>
          <div className="text-slate-700 dark:text-slate-200 font-semibold font-mono">
            {new Date(invoice.date).toLocaleDateString('tr-TR')}
          </div>
          {invoice.dueDate && (
            <div className="text-[10px] text-amber-700 flex items-center gap-1 font-mono">
              <Clock className="w-3 h-3" />
              {new Date(invoice.dueDate).toLocaleDateString('tr-TR')}
            </div>
          )}
        </>
      ),
      filterValue: (invoice) => `${new Date(invoice.date).toLocaleDateString('tr-TR')} ${invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString('tr-TR') : ''}`
    },
    {
      key: 'type',
      title: 'Tür & Senaryo',
      render: (invoice) => {
        const isSales = invoice.type === 'sales';
        return (
          <div className="flex flex-col items-start gap-0.5">
            <span className={cn(
              "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
              isSales ? "bg-indigo-100 text-indigo-800" : "bg-amber-100 text-amber-800"
            )}>
              {isSales ? 'Satış Faturası' : 'Alış Faturası'}
            </span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium capitalize">
              {invoiceScenarioLabel(invoice.scenario)}
            </span>
          </div>
        );
      },
      filterValue: (invoice) => `${invoice.type === 'sales' ? 'Satış Faturası' : 'Alış Faturası'} ${invoiceScenarioLabel(invoice.scenario)}`
    },
    {
      key: 'orderNumber',
      title: 'Sipariş & İrsaliye',
      render: (invoice) => (
        <div className="flex flex-col gap-0.5 items-start font-mono text-slate-600">
          {invoice.orderNumber && (
            <span className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded font-bold text-[10px] border border-slate-200 dark:border-slate-700">
              Sip: {invoice.orderNumber}
            </span>
          )}
          {invoice.waybillNumber && (
            <span className="px-1.5 py-0.5 bg-purple-50 text-purple-700 rounded font-bold text-[10px] border border-purple-200 flex items-center gap-1">
              <Truck className="w-2.5 h-2.5 text-purple-600" />
              İrs: {invoice.waybillNumber}
            </span>
          )}
          {!invoice.orderNumber && !invoice.waybillNumber && (
            <span className="text-slate-300">-</span>
          )}
        </div>
      ),
      filterValue: (invoice) => `${invoice.orderNumber || ''} ${invoice.waybillNumber || ''}`
    },
    {
      key: 'subtotal',
      title: 'KDV Matrahı',
      align: 'right',
      filterable: false,
      render: (invoice) => (
        <span className="font-mono text-slate-600">
          ₺{invoice.subtotal.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      )
    },
    {
      key: 'taxTotal',
      title: 'KDV',
      align: 'right',
      filterable: false,
      render: (invoice) => (
        <>
          <div className="font-mono text-slate-600">₺{invoice.taxTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          {invoice.withholdingAmount ? (
            <div className="text-[9px] text-purple-600 font-medium">Tevk: -₺{invoice.withholdingAmount.toFixed(2)}</div>
          ) : null}
        </>
      )
    },
    {
      key: 'grandTotal',
      title: 'Genel Toplam',
      align: 'right',
      filterable: false,
      render: (invoice) => (
        <span className={cn(
          "font-mono font-bold text-xs",
          invoice.type === 'sales' ? "text-slate-900 dark:text-slate-100" : "text-amber-700"
        )}>
          ₺{invoice.grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      )
    },
    {
      key: 'status',
      title: 'Durum',
      align: 'center',
      render: (invoice) => {
        const meta = invoiceStatusMeta[invoice.status] || invoiceStatusMeta.draft;
        return <StatusPill tone={meta.tone}>{meta.label}</StatusPill>;
      },
      filterValue: (invoice) => (invoiceStatusMeta[invoice.status] || invoiceStatusMeta.draft).label
    }
  ];

  const invoiceRowActions = (invoice: Invoice) => (
    <>
      <button
        onClick={() => openViewModal(invoice.id!)}
        title="Görüntüle & Yazdır"
        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-white dark:bg-slate-900 rounded-lg transition-all border border-transparent hover:border-slate-200 dark:border-slate-700 shadow-2xs cursor-pointer"
      >
        <Eye className="w-3.5 h-3.5" />
      </button>

      {invoice.status === 'draft' && (
        <button
          onClick={() => handleApproveDraft(invoice)}
          title="Resmileştir / Kes"
          className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-white dark:bg-slate-900 rounded-lg transition-all border border-transparent hover:border-slate-200 dark:border-slate-700 shadow-sm"
        >
          <Check className="w-4 h-4" />
        </button>
      )}

      {invoice.status === 'issued' && (
        <button
          onClick={() => openActionModalForInvoice(invoice)}
          title="Faturayı İptal Et veya Sil"
          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all border border-transparent hover:border-rose-200 shadow-sm flex items-center gap-1 text-xs font-semibold"
        >
          <Ban className="w-4 h-4 text-rose-500" />
          <span className="hidden xl:inline text-[11px] text-rose-600">İptal / Sil</span>
        </button>
      )}

      {(invoice.status === 'cancelled' || invoice.status === 'draft') && (
        <button
          onClick={() => openActionModalForInvoice(invoice)}
          title={invoice.status === 'cancelled' ? "İptal Edilmiş Faturayı Kalıcı Olarak Temizle" : "Taslağı Sil"}
          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-white dark:bg-slate-900 rounded-lg transition-all border border-transparent hover:border-slate-200 dark:border-slate-700 shadow-sm"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </>
  );

  const openCreateModal = (type: InvoiceType = 'sales', contactId?: number, orderId?: number) => {
    setCreateInvoiceType(type);
    setPreselectedContactId(contactId);
    setPreselectedOrderId(orderId);
    setIsCreateModalOpen(true);
  };

  const openViewModal = (invoiceId: number) => {
    setSelectedInvoiceId(invoiceId);
    setIsViewModalOpen(true);
  };

  const openActionModalForInvoice = (invoice: Invoice) => {
    setActionInvoice(invoice);
    setIsActionModalOpen(true);
  };

  const handleApproveDraft = async (invoice: Invoice) => {
    try {
      await erpService.updateInvoiceStatus(invoice.id!, 'issued');
      setNotification({
        type: 'success',
        title: 'Fatura Kesildi & Resmileşti',
        message: `${invoice.invoiceNumber} no'lu fatura onaylandı ve cari hesap bakiyesine işlendi.`
      });
    } catch (err: any) {
      setNotification({
        type: 'error',
        title: 'Hata',
        message: err?.message || 'Fatura resmileştirilirken bir hata oluştu.'
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {notification && (
        <div className={cn(
          "p-4 rounded-2xl border flex items-start justify-between gap-3 shadow-lg transition-all animate-in slide-in-from-top-2",
          notification.type === 'success' ? "bg-emerald-50 border-emerald-200 text-emerald-900" :
          notification.type === 'error' ? "bg-rose-50 border-rose-200 text-rose-900" :
          "bg-indigo-50 border-indigo-200 text-indigo-900"
        )}>
          <div className="flex items-center gap-3">
            {notification.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" /> :
             notification.type === 'error' ? <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" /> :
             <Info className="w-5 h-5 text-indigo-600 shrink-0" />}
            <div>
              <h4 className="font-bold text-xs">{notification.title}</h4>
              <p className="text-xs opacity-90">{notification.message}</p>
            </div>
          </div>
          <button 
            onClick={() => setNotification(null)}
            className="text-slate-400 hover:text-slate-700 dark:text-slate-200 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Page Header */}
      <PageHeader
        title="Fatura Yönetimi & e-Dönüşüm"
        subtitle="Satış ve alış faturaları, e-Arşiv / e-Fatura entegrasyonu ve sipariş faturalandırma"
        badge="Faturalar"
        icon={Receipt}
        iconColor="purple"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setIsResetModalOpen(true)}
              className="bg-white dark:bg-slate-900 border border-rose-200 hover:bg-rose-50 text-rose-700 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
              title="Tüm faturaları ve stok hareketlerini sıfırla"
            >
              <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
              <span className="hidden sm:inline">Sıfırla</span>
            </button>

            <button
              onClick={() => setIsGlobalWaybillSelectorOpen(true)}
              className="bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              title="Depodan sevk edilmiş açık irsaliyeleri faturaya dönüştür"
            >
              <Truck className="w-3.5 h-3.5 text-purple-600" />
              <span>İrsaliyeyi Faturalandır</span>
            </button>

            <button
              onClick={() => openCreateModal('purchase')}
              className="bg-slate-800 hover:bg-slate-900 text-white px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <ArrowDownLeft className="w-3.5 h-3.5 text-amber-400" />
              <span>Gelen Alış Faturası</span>
            </button>

            <button
              onClick={() => openCreateModal('sales')}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Yeni Satış Faturası</span>
            </button>
          </div>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Satış Faturaları</span>
            <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
              <ArrowUpRight className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-2xl font-black text-slate-800 dark:text-slate-200 font-mono">
              ₺{totalSalesAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-slate-400 font-medium mt-1">
              {salesInvoices.length} Adet Kesilen Satış Faturası
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Alış Faturaları</span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
              <ArrowDownLeft className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-2xl font-black text-slate-800 dark:text-slate-200 font-mono">
              ₺{totalPurchaseAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-slate-400 font-medium mt-1">
              {purchaseInvoices.length} Adet Gelen Alış Faturası
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Hesaplanan KDV</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
              <Percent className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-2xl font-black text-emerald-600 font-mono">
              ₺{totalSalesTax.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-slate-400 font-medium mt-1">
              İndirilecek KDV: ₺{totalPurchaseTax.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Ödenecek Net KDV</span>
            <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className={cn(
              "text-2xl font-black font-mono",
              netVatPayable >= 0 ? "text-purple-700" : "text-amber-600"
            )}>
              ₺{Math.abs(netVatPayable).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-slate-400 font-medium mt-1">
              {netVatPayable >= 0 ? 'Maliyeye Ödenecek KDV Farkı' : 'Devreden KDV Fazlası'}
            </div>
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <DataGrid<Invoice>
        columns={invoiceColumns}
        data={filteredInvoices}
        rowKey="id"
        loading={!invoices}
        toolbar={(
          <div className="flex items-center gap-2 flex-wrap w-full">
            <div className="flex bg-slate-200/70 p-1 rounded-xl">
              <button
                onClick={() => setActiveTab('all')}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all",
                  activeTab === 'all' ? "bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200"
                )}
              >
                Tümü ({invoices?.length || 0})
              </button>
              <button
                onClick={() => setActiveTab('sales')}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all",
                  activeTab === 'sales' ? "bg-white dark:bg-slate-900 text-indigo-600 shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-indigo-600"
                )}
              >
                Satış ({salesInvoices.length})
              </button>
              <button
                onClick={() => setActiveTab('purchase')}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all",
                  activeTab === 'purchase' ? "bg-white dark:bg-slate-900 text-amber-600 shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-amber-600"
                )}
              >
                Alış ({purchaseInvoices.length})
              </button>
            </div>

            <div className="flex bg-slate-200/70 p-1 rounded-xl md:ml-auto">
              <button
                onClick={() => setStatusFilter('all')}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                  statusFilter === 'all' ? "bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200"
                )}
              >
                Tüm Durumlar
              </button>
              <button
                onClick={() => setStatusFilter('issued')}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                  statusFilter === 'issued' ? "bg-emerald-600 text-white shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-emerald-700"
                )}
              >
                Kesildi
              </button>
              <button
                onClick={() => setStatusFilter('draft')}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                  statusFilter === 'draft' ? "bg-slate-700 text-white shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-200"
                )}
              >
                Taslak
              </button>
              <button
                onClick={() => setStatusFilter('cancelled')}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                  statusFilter === 'cancelled' ? "bg-rose-600 text-white shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-rose-700"
                )}
              >
                İptal
              </button>
            </div>
          </div>
        )}
        rowActions={invoiceRowActions}
        emptyMessage="Kayıtlı Fatura Bulunamadı"
      />

      {/* CREATE INVOICE MODAL */}
      {isCreateModalOpen && (
        <CreateInvoiceModal
          isOpen={isCreateModalOpen}
          initialType={createInvoiceType}
          initialContactId={preselectedContactId}
          initialOrderId={preselectedOrderId}
          initialWaybillId={preselectedWaybillId}
          onClose={() => {
            setIsCreateModalOpen(false);
            setPreselectedContactId(undefined);
            setPreselectedOrderId(undefined);
            setPreselectedWaybillId(undefined);
          }}
          onSuccess={(invoiceId) => {
            setIsCreateModalOpen(false);
            setPreselectedContactId(undefined);
            setPreselectedOrderId(undefined);
            setPreselectedWaybillId(undefined);
            openViewModal(invoiceId);
          }}
        />
      )}

      {/* GLOBAL WAYBILL SELECTOR MODAL */}
      {isGlobalWaybillSelectorOpen && (
        <GlobalWaybillSelectorModal
          isOpen={isGlobalWaybillSelectorOpen}
          onClose={() => setIsGlobalWaybillSelectorOpen(false)}
          onSelectWaybill={(wb) => {
            setIsGlobalWaybillSelectorOpen(false);
            setCreateInvoiceType(wb.type);
            setPreselectedContactId(wb.contactId);
            setPreselectedWaybillId(wb.id);
            setIsCreateModalOpen(true);
          }}
        />
      )}

      {/* VIEW & PRINT INVOICE MODAL */}
      {isViewModalOpen && selectedInvoiceId && (
        <InvoicePrintModal
          invoiceId={selectedInvoiceId}
          isOpen={isViewModalOpen}
          onClose={() => {
            setIsViewModalOpen(false);
            setSelectedInvoiceId(null);
          }}
          onOpenActionModal={(inv) => {
            setIsViewModalOpen(false);
            openActionModalForInvoice(inv);
          }}
        />
      )}

      {/* CONTROLLED INVOICE ACTION (CANCEL / DELETE) MODAL */}
      {isActionModalOpen && actionInvoice && (
        <InvoiceActionConfirmModal
          invoice={actionInvoice}
          contactName={contacts?.find(c => c.id === actionInvoice.contactId)?.name}
          isOpen={isActionModalOpen}
          onClose={() => {
            setIsActionModalOpen(false);
            setActionInvoice(null);
          }}
          onSuccess={(action, message) => {
            setIsActionModalOpen(false);
            setActionInvoice(null);
            setNotification({
              type: action === 'cancelled' ? 'info' : 'success',
              title: action === 'cancelled' ? 'Fatura İptal Edildi' : 'Fatura Silindi',
              message
            });
          }}
        />
      )}

      {/* RESET ALL INVOICES & STOCK MOVEMENTS MODAL */}
      {isResetModalOpen && (
        <ResetInvoicesAndStockModal
          isOpen={isResetModalOpen}
          onClose={() => setIsResetModalOpen(false)}
          onSuccess={(message) => {
            setIsResetModalOpen(false);
            setNotification({
              type: 'success',
              title: 'Sıfırlama Tamamlandı',
              message
            });
          }}
        />
      )}
    </div>
  );
}

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

function CreateInvoiceModal({
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
      const num = await erpService.generateInvoiceNumber(type);
      setInvoiceNumber(num);
      setEttn(erpService.generateETTN());
    }
    initInvoiceInfo();
  }, [type]);

  // Load pending orders and waybills when contact changes
  useEffect(() => {
    async function loadOrdersAndWaybills() {
      if (contactId) {
        const [ords, wbs] = await Promise.all([
          erpService.getPendingOrdersForInvoicing(Number(contactId), type),
          erpService.getPendingWaybillsForInvoicing(Number(contactId), type)
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
      invoiceNumber: invoiceNumber.trim() || (await erpService.generateInvoiceNumber(type)),
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
      const newInvoiceId = await erpService.createInvoice(invoiceData, items);
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
                  onClick={() => setEttn(erpService.generateETTN())}
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
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-2.5">
                <ShoppingBag className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-black text-slate-800 dark:text-slate-200">
                  Faturalandırılacak Siparişi Seçiniz
                </h3>
              </div>
              <button 
                onClick={() => setIsOrderSelectorOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 max-h-[60vh] overflow-y-auto">
              {pendingOrders.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs">
                  Bu cariye ait henüz faturalanmamış açık sipariş bulunmuyor.
                </div>
              ) : (
                pendingOrders.map((ord: any) => (
                  <div 
                    key={`inv-pending-ord-${ord.id}`}
                    className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 hover:border-indigo-300 hover:bg-indigo-50/40 transition-all cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-3"
                    onClick={() => importOrderItems(ord)}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-slate-800 dark:text-slate-200 text-sm">{ord.orderNumber}</span>
                        <span className="text-[10px] px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 rounded font-bold">
                          {new Date(ord.date).toLocaleDateString('tr-TR')}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Toplam Kalem: {ord.items?.length || 0} adet ürün kalemi kalan miktar içeriyor.
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right font-mono">
                        <div className="text-xs text-slate-400">Sipariş Tutarı</div>
                        <div className="text-sm font-bold text-slate-800 dark:text-slate-200">
                          ₺{ord.grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          importOrderItems(ord);
                        }}
                        className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-all shadow-sm cursor-pointer"
                      >
                        Aktar
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* SUB-MODAL: CHOOSE PENDING WAYBILL TO IMPORT */}
      {isWaybillSelectorOpen && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-2.5">
                <Truck className="w-5 h-5 text-purple-600" />
                <h3 className="text-base font-black text-slate-800 dark:text-slate-200">
                  Faturalandırılacak İrsaliyeyi Seçiniz
                </h3>
              </div>
              <button 
                onClick={() => setIsWaybillSelectorOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 max-h-[60vh] overflow-y-auto">
              {pendingWaybills.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs">
                  Bu cariye ait henüz faturalanmamış açık sevk irsaliyesi bulunmuyor.
                </div>
              ) : (
                pendingWaybills.map((wb: any) => (
                  <div 
                    key={`inv-sub-wb-${wb.id}`}
                    className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 hover:border-purple-300 hover:bg-purple-50/40 transition-all cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-3"
                    onClick={() => importWaybillItems(wb)}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-slate-800 dark:text-slate-200 text-sm">{wb.waybillNumber}</span>
                        <span className="text-[10px] px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 rounded font-bold">
                          {new Date(wb.date).toLocaleDateString('tr-TR')}
                        </span>
                        {wb.orderNumber && (
                          <span className="text-[10px] px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded font-bold">
                            Sipariş: {wb.orderNumber}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Toplam Miktar: {wb.totalQuantity || 0} Çift | Kalem Sayısı: {wb.items?.length || 0}
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right font-mono">
                        <div className="text-xs text-slate-400">İrsaliye Tutarı</div>
                        <div className="text-sm font-bold text-slate-800 dark:text-slate-200">
                          ₺{Number(wb.grandTotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          importWaybillItems(wb);
                        }}
                        className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-all shadow-sm cursor-pointer"
                      >
                        Aktar
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------------------
// GLOBAL WAYBILL SELECTOR MODAL (Easily invoice any open waybill across all contacts)
// -----------------------------------------------------------------------------------------
function GlobalWaybillSelectorModal({
  isOpen,
  onClose,
  onSelectWaybill
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelectWaybill: (waybill: any) => void;
}) {
  const [filterType, setFilterType] = useState<'all' | 'sales' | 'purchase'>('all');
  const [search, setSearch] = useState('');

  const waybills = useApiQuery(() => api.waybills.list(), [], ['waybills']);
  const contacts = useApiQuery(() => api.contacts.list(), [], ['contacts']);

  if (!isOpen) return null;

  const pendingWaybills = waybills?.filter(w => {
    if (w.status !== 'issued') return false;
    if (w.invoicedStatus === 'invoiced') return false;
    if (filterType !== 'all' && w.type !== filterType) return false;
    if (search.trim()) {
      const term = search.toLowerCase();
      const contact = contacts?.find(c => c.id === w.contactId);
      const matchNumber = w.waybillNumber?.toLowerCase().includes(term);
      const matchContact = contact?.name?.toLowerCase().includes(term);
      const matchOrder = w.orderNumber?.toLowerCase().includes(term);
      return matchNumber || matchContact || matchOrder;
    }
    return true;
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) || [];

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-500/20 text-purple-300 flex items-center justify-center">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm">Faturalandırılacak İrsaliyeler</h3>
              <p className="text-[11px] text-slate-400">
                Depodan sevk edilmiş ve henüz faturası kesilmemiş açık irsaliyeler
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filters */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFilterType('all')}
              className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer", filterType === 'all' ? "bg-purple-600 text-white" : "bg-white dark:bg-slate-900 text-slate-600 border border-slate-200 dark:border-slate-700")}
            >
              Tümü ({waybills?.filter(w => w.status === 'issued' && w.invoicedStatus !== 'invoiced').length || 0})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('sales')}
              className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer", filterType === 'sales' ? "bg-purple-600 text-white" : "bg-white dark:bg-slate-900 text-slate-600 border border-slate-200 dark:border-slate-700")}
            >
              Satış Sevk ({waybills?.filter(w => w.status === 'issued' && w.type === 'sales' && w.invoicedStatus !== 'invoiced').length || 0})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('purchase')}
              className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer", filterType === 'purchase' ? "bg-purple-600 text-white" : "bg-white dark:bg-slate-900 text-slate-600 border border-slate-200 dark:border-slate-700")}
            >
              Alış İrsaliyesi ({waybills?.filter(w => w.status === 'issued' && w.type === 'purchase' && w.invoicedStatus !== 'invoiced').length || 0})
            </button>
          </div>

          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="İrsaliye no veya cari ara..."
              className="w-full pl-9 pr-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
            />
          </div>
        </div>

        {/* Waybill List */}
        <div className="p-4 overflow-y-auto space-y-2.5 flex-1">
          {pendingWaybills.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              <Truck className="w-10 h-10 mx-auto mb-2 opacity-25 text-slate-400" />
              <p className="font-bold">Faturalanmayı bekleyen açık irsaliye bulunmuyor.</p>
              <p className="text-[11px] mt-1 text-slate-400">Tüm sevk edilmiş irsaliyeler faturalandırılmış veya henüz irsaliye düzenlenmemiş.</p>
            </div>
          ) : (
            pendingWaybills.map((wb) => {
              const contact = contacts?.find(c => c.id === wb.contactId);
              const isSales = wb.type === 'sales';
              return (
                <div
                  key={`global-wb-${wb.id}`}
                  className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 hover:border-purple-300 hover:bg-purple-50/30 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      "w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 mt-0.5",
                      isSales ? "bg-indigo-100 text-indigo-700" : "bg-amber-100 text-amber-700"
                    )}>
                      {isSales ? 'SEVK' : 'ALIŞ'}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-sm text-slate-900 dark:text-slate-100">{wb.waybillNumber}</span>
                        <span className="text-[10px] px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 rounded-md font-semibold">
                          {new Date(wb.date).toLocaleDateString('tr-TR')}
                        </span>
                        {wb.orderNumber && (
                          <span className="text-[10px] px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-md font-bold">
                            Sipariş: {wb.orderNumber}
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-bold text-slate-700 dark:text-slate-200 mt-1">
                        {contact?.name || 'Bilinmeyen Cari'}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-3">
                        <span>Toplam Adet: <strong>{wb.totalQuantity} Çift</strong></span>
                        {wb.vehiclePlate && <span>Plaka: {wb.vehiclePlate}</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 self-end sm:self-center">
                    <div className="text-right">
                      <div className="text-[10px] text-slate-400 font-semibold uppercase">İrsaliye Tutarı</div>
                      <div className="text-sm font-black text-slate-900 dark:text-slate-100 font-mono">
                        ₺{Number(wb.grandTotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onSelectWaybill(wb)}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white font-bold rounded-xl text-xs transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                    >
                      <Receipt className="w-3.5 h-3.5" />
                      <span>Faturalandır</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------------------
// INVOICE VIEW & OFFICIAL PRINT MODAL (GİB e-Fatura / e-Arşiv Standart Şablonu)
// -----------------------------------------------------------------------------------------
const InvoiceViewModal = InvoicePrintModal;

// -----------------------------------------------------------------------------------------
// CONTROLLED INVOICE ACTION MODAL (CANCEL / DELETE WITH AUTOMATIC ROLLBACKS)
// -----------------------------------------------------------------------------------------

interface InvoiceActionConfirmModalProps {
  invoice: Invoice;
  contactName?: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (action: 'cancelled' | 'deleted', message: string) => void;
}

function InvoiceActionConfirmModal({
  invoice,
  contactName,
  isOpen,
  onClose,
  onSuccess
}: InvoiceActionConfirmModalProps) {
  const isIssued = invoice.status === 'issued';
  const isCancelled = invoice.status === 'cancelled';
  const isDraft = invoice.status === 'draft';

  const [activeTab, setActiveTab] = useState<'cancel' | 'delete'>(isIssued ? 'cancel' : 'delete');
  const [cancelReason, setCancelReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen) return null;

  const handleCancelInvoice = async () => {
    try {
      setIsProcessing(true);
      setErrorMessage('');
      await erpService.cancelInvoice(invoice.id!, cancelReason.trim() || undefined);
      onSuccess(
        'cancelled',
        `${invoice.invoiceNumber} no'lu fatura iptal edildi. Sipariş miktarları, cari hesap bakiyesi ve stoklar başarıyla iade edildi.`
      );
    } catch (err: any) {
      setErrorMessage(err?.message || 'Fatura iptal edilirken bir hata oluştu.');
      setIsProcessing(false);
    }
  };

  const handleDeleteInvoice = async () => {
    try {
      setIsProcessing(true);
      setErrorMessage('');
      await erpService.deleteInvoice(invoice.id!);
      onSuccess(
        'deleted',
        `${invoice.invoiceNumber} no'lu fatura kalıcı olarak silindi ve ilişkili tüm bakiyeler geri alındı.`
      );
    } catch (err: any) {
      setErrorMessage(err?.message || 'Fatura silinirken bir hata oluştu.');
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-xl shadow-2xl border border-slate-100 dark:border-slate-800 flex flex-col overflow-hidden my-auto animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="p-6 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-10 h-10 rounded-2xl flex items-center justify-center shadow-xs",
              activeTab === 'cancel' ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"
            )}>
              {activeTab === 'cancel' ? <Ban className="w-5 h-5" /> : <Trash2 className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-base font-black text-slate-800 dark:text-slate-200 tracking-tight">
                {isIssued 
                  ? 'Fatura İptali & Silme Kontrolü' 
                  : isDraft 
                    ? 'Taslak Faturayı Sil' 
                    : 'İptal Edilmiş Faturayı Sil'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Fatura No: <span className="font-mono font-bold text-slate-700 dark:text-slate-200">{invoice.invoiceNumber}</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isProcessing}
            className="w-9 h-9 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Invoice Summary Card */}
          <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Cari Ünvan</span>
              <span className="font-bold text-slate-800 dark:text-slate-200 truncate block">{contactName || 'Belirtilmemiş'}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Fatura Tutarı</span>
              <span className="font-mono font-bold text-indigo-700 block">
                ₺{invoice.grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Tarih</span>
              <span className="text-slate-700 dark:text-slate-200 block">{new Date(invoice.date).toLocaleDateString('tr-TR')}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Bağlı Sipariş</span>
              <span className="font-mono font-bold text-slate-700 dark:text-slate-200 block">{invoice.orderNumber || 'Yok'}</span>
            </div>
          </div>

          {/* Mode Switcher for Issued Invoices */}
          {isIssued && (
            <div className="grid grid-cols-2 gap-2 p-1.5 bg-slate-100 dark:bg-slate-800 rounded-2xl">
              <button
                type="button"
                onClick={() => setActiveTab('cancel')}
                className={cn(
                  "py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2",
                  activeTab === 'cancel'
                    ? "bg-white dark:bg-slate-900 text-amber-800 shadow-xs border border-slate-200 dark:border-slate-700"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-100"
                )}
              >
                <Ban className="w-4 h-4 text-amber-600" />
                Faturayı İptal Et (Önerilen)
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('delete')}
                className={cn(
                  "py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2",
                  activeTab === 'delete'
                    ? "bg-white dark:bg-slate-900 text-rose-800 shadow-xs border border-slate-200 dark:border-slate-700"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-100"
                )}
              >
                <Trash2 className="w-4 h-4 text-rose-600" />
                Kalıcı Olarak Sil
              </button>
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {errorMessage}
            </div>
          )}

          {/* Tab 1: Cancel Invoice Content */}
          {activeTab === 'cancel' && isIssued && (
            <div className="space-y-4">
              <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-2xl space-y-2.5">
                <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
                  <ShieldAlert className="w-4 h-4 text-amber-600" />
                  İptal İşlemi İle Otomatik Gerçekleşecek Adımlar:
                </div>
                <ul className="text-xs text-amber-800 space-y-1.5 pl-1">
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span><strong>Sipariş Kalan Adetleri:</strong> {invoice.orderNumber ? `${invoice.orderNumber} siparişinden düşülen miktarlar iade edilir ve sipariş tekrar faturalanabilir duruma döner.` : 'Fatura ile düşülen sipariş kalemleri iade edilir.'}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span><strong>Cari Hesap Bakiyesi:</strong> Fatura tutarı olan <strong>₺{invoice.grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</strong> cari hesaptan düşülerek bakiye eski haline getirilir.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span><strong>Stok İadesi:</strong> Depodan çıkışı yapılan ayakkabı / varyant (beden) adetleri depoya geri yüklenir.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span><strong>Resmi Takip:</strong> Fatura kaydı ve sıra numarası silinmez, "İptal Edildi" statüsünde saklanır.</span>
                  </li>
                </ul>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1.5">
                  İptal Nedeni (Opsiyonel)
                </label>
                <input
                  type="text"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Örn: Yanlış miktar girildi / Müşteri talebiyle iptal / Hatalı iskonto"
                  className="w-full px-4 py-2.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>
            </div>
          )}

          {/* Tab 2: Permanent Delete Content */}
          {(activeTab === 'delete' || !isIssued) && (
            <div className="space-y-4">
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl space-y-2.5 text-xs text-rose-800">
                <div className="flex items-center gap-2 font-bold text-rose-900">
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                  Kalıcı Silme Uyarısı
                </div>
                <p>
                  {isIssued
                    ? 'Bu faturayı kalıcı olarak silmek üzeresiniz. Fatura satırları veritabanından tamamen temizlenecek, sipariş adetleri ve cari hesap bakiyesi otomatik olarak düzeltilecektir.'
                    : isDraft
                      ? 'Bu taslak faturayı kalıcı olarak silmek istediğinize emin misiniz?'
                      : 'Bu iptal edilmiş faturayı listeden tamamen kaldırmak üzeresiniz.'}
                </p>
                {isIssued && (
                  <p className="text-[11px] text-rose-700 bg-white dark:bg-slate-900/70 p-2.5 rounded-lg border border-rose-200">
                    💡 <strong>Tavsiye:</strong> Muhasebe ve e-arşiv fatura numarası bütünlüğünü korumak için silmek yerine <strong>"Faturayı İptal Et"</strong> seçeneğini tercih edebilirsiniz.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="p-6 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="px-5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 hover:bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50"
          >
            Vazgeç
          </button>

          {activeTab === 'cancel' && isIssued ? (
            <button
              type="button"
              onClick={handleCancelInvoice}
              disabled={isProcessing}
              className="px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-md shadow-amber-200 flex items-center gap-2 disabled:opacity-50"
            >
              <Ban className="w-4 h-4" />
              {isProcessing ? 'İptal Ediliyor...' : 'Faturayı İptal Et & İadeleri Uygula'}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleDeleteInvoice}
              disabled={isProcessing}
              className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-md shadow-rose-200 flex items-center gap-2 disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              {isProcessing ? 'Siliniyor...' : 'Faturayı Tamamen Sil'}
            </button>
          )}
        </div>

      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------------------
// RESET INVOICES & STOCK MOVEMENTS MODAL (Full Testing Reset)
// -----------------------------------------------------------------------------------------

interface ResetInvoicesAndStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

function ResetInvoicesAndStockModal({
  isOpen,
  onClose,
  onSuccess
}: ResetInvoicesAndStockModalProps) {
  const [clearStockLogs, setClearStockLogs] = useState(true);
  const [resetOrderInvoicing, setResetOrderInvoicing] = useState(true);
  const [resetContactBalances, setResetContactBalances] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleExecuteReset = async () => {
    try {
      setIsProcessing(true);
      setError('');

      await erpService.resetInvoicesAndStockMovements({
        resetStockMovements: clearStockLogs,
        resetOrdersInvoicing: resetOrderInvoicing,
        resetContactBalances: resetContactBalances
      });

      onSuccess(
        'Tüm faturalar, fatura kalemleri, stok hareket kayıtları ve sipariş faturalanma durumları sıfırlandı. Yeniden test etmeye hazırsınız.'
      );
    } catch (err: any) {
      setError(err?.message || 'Sıfırlama işlemi sırasında bir hata oluştu.');
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-lg shadow-2xl border border-slate-100 dark:border-slate-800 flex flex-col overflow-hidden my-auto animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="p-6 bg-rose-50 border-b border-rose-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-rose-600 text-white rounded-2xl flex items-center justify-center shadow-md shadow-rose-200">
              <RotateCcw className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-black text-rose-950 tracking-tight">
                Fatura & Stok Hareketlerini Sıfırla
              </h3>
              <p className="text-xs text-rose-700 mt-0.5">
                Test Verilerini Temizleme ve Başlangıç Durumuna Getirme
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isProcessing}
            className="w-9 h-9 bg-white dark:bg-slate-900 border border-rose-200 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 space-y-1.5">
            <div className="flex items-center gap-2 font-bold text-amber-950">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              Sıfırlama Bilgilendirmesi
            </div>
            <p>
              Bu işlem ile sistemdeki tüm fatura kayıtları ve geçmiş stok hareket logları temizlenir. Ürün kartlarınız ve tanımlı siparişleriniz silinmez, yalnızca faturalanma durumları sıfırlanır.
            </p>
          </div>

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Options */}
          <div className="space-y-3">
            <label className="text-xs font-black uppercase text-slate-400 tracking-wider block">
              Sıfırlanacak Alanlar
            </label>

            <div className="space-y-2.5">
              <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl">
                <div className="flex items-center gap-2.5">
                  <Receipt className="w-4 h-4 text-indigo-600" />
                  <div>
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200">Tüm Faturalar ve Kalemleri</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">Satış ve alış fatura kayıtları tamamen silinir.</div>
                  </div>
                </div>
                <div className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  Dahil
                </div>
              </div>

              <label className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl cursor-pointer transition-colors">
                <div className="flex items-center gap-2.5">
                  <Package className="w-4 h-4 text-amber-600" />
                  <div>
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200">Stok Hareket Geçmişi (Loglar)</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">Raporlardaki tüm giriş, çıkış ve sarf hareket dökümü sıfırlanır.</div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={clearStockLogs}
                  onChange={(e) => setClearStockLogs(e.target.checked)}
                  className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 border-slate-300"
                />
              </label>

              <label className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl cursor-pointer transition-colors">
                <div className="flex items-center gap-2.5">
                  <ShoppingBag className="w-4 h-4 text-blue-600" />
                  <div>
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200">Sipariş Faturalanma Durumları</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">Siparişlerin faturalanan miktarları 0'lanır ve tekrar faturalandırılabilir olur.</div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={resetOrderInvoicing}
                  onChange={(e) => setResetOrderInvoicing(e.target.checked)}
                  className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 border-slate-300"
                />
              </label>

              <label className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl cursor-pointer transition-colors">
                <div className="flex items-center gap-2.5">
                  <Building2 className="w-4 h-4 text-emerald-600" />
                  <div>
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200">Cari Fatura Bakiyeleri</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">Faturalardan kaynaklanan cari hesap borç/alacak bakiyeleri sıfırlanır.</div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={resetContactBalances}
                  onChange={(e) => setResetContactBalances(e.target.checked)}
                  className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 border-slate-300"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="px-5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 hover:bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50"
          >
            Vazgeç
          </button>
          <button
            type="button"
            onClick={handleExecuteReset}
            disabled={isProcessing}
            className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-md shadow-rose-200 flex items-center gap-2 disabled:opacity-50"
          >
            <RotateCcw className="w-4 h-4" />
            {isProcessing ? 'Sıfırlanıyor...' : 'Seçilenleri Sıfırla ve Temizle'}
          </button>
        </div>

      </div>
    </div>
  );
}
