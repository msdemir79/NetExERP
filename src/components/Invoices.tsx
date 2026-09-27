import { useState, useEffect } from 'react';
import { useApiQuery } from '../hooks/useApiQuery';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { invoiceService } from '../services/invoiceService';
import type { Invoice, InvoiceType, InvoiceStatus, InvoiceScenario } from '../types';
import { Receipt, Plus, CheckCircle2, Clock, AlertCircle, X, Trash2, Eye, ArrowUpRight, ArrowDownLeft, DollarSign, Percent, Check, Ban, RotateCcw, Info, Truck } from 'lucide-react';
import { cn } from '../lib/utils';
import DataGrid, { StatusPill, type GridColumn, type PillTone } from './Common/DataGrid';
import { InvoicePrintModal } from './Invoices/InvoicePrintModal';
import PageHeader from './PageHeader';
import CreateInvoiceModal from './Invoices/CreateInvoiceModal';
import GlobalWaybillSelectorModal from './Invoices/GlobalWaybillSelectorModal';
import InvoiceActionConfirmModal from './Invoices/InvoiceActionConfirmModal';
import ResetInvoicesAndStockModal from './Invoices/ResetInvoicesAndStockModal';

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
      await invoiceService.updateInvoiceStatus(invoice.id!, 'issued');
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
