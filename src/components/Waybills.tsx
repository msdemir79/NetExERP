import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useApiQuery } from '../hooks/useApiQuery';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { waybillService } from '../services/waybillService';
import type { Waybill, WaybillType, WaybillStatus } from '../types';
import { Truck, Plus, CheckCircle2, AlertCircle, X, Trash2, Eye, ArrowUpRight, ArrowDownLeft, Calendar, Package, Check, Ban, RotateCcw, Info, Car, Receipt, Camera } from 'lucide-react';
import { cn } from '../lib/utils';
import DataGrid, { StatusPill, type GridColumn, type PillTone } from './Common/DataGrid';
import KpiCard from './Common/KpiCard';
import Button from './Common/Button';
import { WaybillPrintModal } from './Waybills/WaybillPrintModal';
import CreateWaybillModal from './Waybills/CreateWaybillModal';
import ActionWaybillModal from './Waybills/ActionWaybillModal';
import ResetWaybillsModal from './Waybills/ResetWaybillsModal';
import PageHeader from './PageHeader';
import CameraBarcodeScannerModal from './Common/CameraBarcodeScannerModal';


export default function Waybills() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<'all' | 'sales' | 'purchase'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'issued' | 'draft' | 'cancelled'>('all');
  const [invoicedFilter, setInvoicedFilter] = useState<'all' | 'invoiced' | 'not_invoiced'>('all');

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
    return true;
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) || [];

  const waybillStatusMeta: Record<WaybillStatus, { label: string; tone: PillTone }> = {
    draft: { label: 'Taslak', tone: 'slate' },
    issued: { label: 'Sevk Edildi', tone: 'green' },
    cancelled: { label: 'İptal Edildi', tone: 'red' }
  };

  const waybillColumns: GridColumn<Waybill>[] = [
    {
      key: 'waybillNumber',
      title: 'İrsaliye Bilgileri',
      render: (waybill) => {
        const isSales = waybill.type === 'sales';
        return (
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
        );
      },
      filterValue: (waybill) => `${waybill.waybillNumber || ''} ${waybill.ettn || ''}`
    },
    {
      key: 'contactId',
      title: 'Cari / Alıcı Firma',
      render: (waybill) => {
        const contact = contacts?.find(c => c.id === waybill.contactId);
        return (
          <>
            <div className="font-bold text-slate-900 dark:text-slate-100 uppercase">
              {contact?.name || 'Belirtilmedi'}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-xs mt-0.5">
              {waybill.deliveryAddress || contact?.shippingAddress || contact?.address || 'Merkez Depo'}
            </div>
          </>
        );
      },
      filterValue: (waybill) => {
        const contact = contacts?.find(c => c.id === waybill.contactId);
        return `${contact?.name || ''} ${waybill.deliveryAddress || contact?.shippingAddress || contact?.address || ''}`;
      }
    },
    {
      key: 'date',
      title: 'Sipariş & Sevk Tarihi',
      render: (waybill) => (
        <>
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
        </>
      ),
      filterValue: (waybill) => `${waybill.date ? new Date(waybill.date).toLocaleDateString('tr-TR') : ''} ${waybill.orderNumber || ''}`
    },
    {
      key: 'vehiclePlate',
      title: 'Nakliye / Taşıma',
      render: (waybill) => (
        <>
          <div className="font-mono font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
            <Car className="w-3.5 h-3.5 text-slate-400" />
            <span>{waybill.vehiclePlate || 'Plaka Yok'}</span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-xs mt-0.5">
            {waybill.driverName ? `${waybill.driverName}` : (waybill.carrierTitle || '-')}
          </div>
        </>
      ),
      filterValue: (waybill) => `${waybill.vehiclePlate || ''} ${waybill.driverName || ''} ${waybill.carrierTitle || ''}`
    },
    {
      key: 'totalQuantity',
      title: 'Miktar',
      align: 'center',
      filterable: false,
      render: (waybill) => (
        <>
          <span className="font-black text-slate-900 dark:text-slate-100 text-xs">
            {waybill.totalQuantity || 0}
          </span>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold block">Çift / Adet</span>
        </>
      )
    },
    {
      key: 'grandTotal',
      title: 'Tutar',
      align: 'right',
      filterable: false,
      render: (waybill) => (
        <>
          <div className="font-mono font-black text-slate-900 dark:text-slate-100 text-xs">
            {(waybill.grandTotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
          </div>
          <div className="text-[10px] text-slate-400 font-mono">
            KDV: {(waybill.taxTotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
          </div>
        </>
      )
    },
    {
      key: 'status',
      title: 'Durum',
      align: 'center',
      render: (waybill) => {
        const isInvoiced = waybill.invoicedStatus === 'invoiced';
        const meta = waybillStatusMeta[waybill.status] || waybillStatusMeta.draft;
        return (
          <div className="flex flex-col items-center gap-1">
            <StatusPill tone={meta.tone}>{meta.label}</StatusPill>
            {waybill.status === 'issued' && (
              isInvoiced ? (
                <StatusPill tone="violet">
                  <Receipt className="w-2.5 h-2.5" />
                  {waybill.invoiceNumber || 'Faturalandı'}
                </StatusPill>
              ) : (
                <StatusPill tone="amber">Faturalanmadı</StatusPill>
              )
            )}
          </div>
        );
      },
      filterValue: (waybill) => {
        const meta = waybillStatusMeta[waybill.status] || waybillStatusMeta.draft;
        const isInvoiced = waybill.invoicedStatus === 'invoiced';
        return `${meta.label} ${waybill.status === 'issued' ? (isInvoiced ? (waybill.invoiceNumber || 'Faturalandı') : 'Faturalanmadı') : ''}`;
      }
    }
  ];

  const waybillRowActions = (waybill: Waybill) => {
    const isInvoiced = waybill.invoicedStatus === 'invoiced';
    return (
      <>
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
      </>
    );
  };

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
      await waybillService.updateWaybillStatus(wb.id, 'issued');
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
            <Button
              variant="secondary"
              icon={<Receipt className="h-3.5 w-3.5 text-brand" />}
              onClick={() => navigate('/invoices?action=selectWaybill')}
              title="Faturalanmamış açık irsaliyeleri listeleyip faturaya dönüştür"
            >
              İrsaliyeyi Faturalandır
            </Button>

            <Button
              variant="secondary"
              icon={<RotateCcw className="h-3.5 w-3.5 text-danger" />}
              onClick={() => setIsResetModalOpen(true)}
              title="İrsaliyeleri ve sevkiyat durumlarını sıfırla"
            >
              <span className="hidden md:inline">Sıfırla</span>
            </Button>

            <Button
              variant="secondary"
              icon={<Camera className="h-3.5 w-3.5 text-brand" />}
              onClick={() => setIsCameraScannerOpen(true)}
              title="Kamera ile barkod okutarak sevkiyat veya mal kabul irsaliyesi hazırla"
            >
              Kamera ile İrsaliye Oku
            </Button>

            <Button
              variant="secondary"
              icon={<ArrowDownLeft className="h-3.5 w-3.5 text-success" />}
              onClick={() => openCreateModal('purchase')}
            >
              Gelen İrsaliye
            </Button>

            <Button
              variant="primary"
              icon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => openCreateModal('sales')}
            >
              Yeni Sevk İrsaliyesi
            </Button>
          </div>
        }
      />

      {/* KPI SUMMARY CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Satış & Sevk İrsaliyeleri"
          value={`${totalSalesGrandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺`}
          sub={`${salesWaybills.length} adet sevk irsaliyesi kesildi`}
          icon={ArrowUpRight}
          tone="brand"
        />
        <KpiCard
          label="Toplam Sevk Miktarı"
          value={`${totalSalesQuantity.toLocaleString('tr-TR')} Çift`}
          sub="Depodan sevk edilen net ürün hacmi"
          icon={Package}
          tone="success"
        />
        <KpiCard
          label="Alış / Gelen İrsaliye"
          value={`${totalPurchaseGrandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺`}
          sub={`${totalPurchaseQuantity.toLocaleString('tr-TR')} Çift / ${purchaseWaybills.length} belge`}
          icon={ArrowDownLeft}
          tone="orange"
        />
        <KpiCard
          label="Faturalanacak İrsaliyeler"
          value={`${pendingInvoicingAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺`}
          sub={`${pendingInvoicingCount} adet irsaliye fatura bekliyor${invoicedFilter === 'not_invoiced' ? ' · Filtrelendi' : ''}`}
          icon={Receipt}
          tone="violet"
          onClick={() => setInvoicedFilter(invoicedFilter === 'not_invoiced' ? 'all' : 'not_invoiced')}
          className={cn(invoicedFilter === 'not_invoiced' && 'border-brand ring-2 ring-ring')}
        />
      </div>

      {/* WAYBILLS DATA TABLE */}
      <DataGrid<Waybill>
        columns={waybillColumns}
        data={filteredWaybills}
        rowKey="id"
        loading={!waybills}
        toolbar={(
          <div className="flex items-center gap-2 flex-wrap w-full">
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

            {/* Status & Invoiced Filters */}
            <div className="flex items-center gap-2 flex-wrap md:ml-auto">
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
            </div>
          </div>
        )}
        rowActions={waybillRowActions}
        emptyMessage="Henüz kayıtlı sevk irsaliyesi bulunamadı."
      />

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
