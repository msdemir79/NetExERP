import React, { useState, useMemo } from 'react';
import { api } from '../../api/client';
import { useApiQuery } from '../../hooks/useApiQuery';
import {
  ShoppingCart,
  Truck,
  Search,
  Printer,
  FileDown,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Receipt
} from 'lucide-react';
import DataGrid, { StatusPill, type GridColumn } from '../Common/DataGrid';
import { printTabularReport } from '../../lib/printService';
import { exportToCsv } from '../../lib/exportService';
import { cn } from '../../lib/utils';
import type { Order, OrderItem, Waybill } from '../../types';

export default function OrderDeliveryReport() {
  const [activeTab, setActiveTab] = useState<'fulfillment' | 'pending_invoices'>('fulfillment');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Queries
  const orders = useApiQuery(() => api.orders.list({ where: { type: 'sales' }, orderBy: 'date', orderDir: 'desc' }), [], ['orders']) || [];
  const orderItems = useApiQuery(() => api.orderItems.list(), [], ['orderItems']) || [];
  const waybills = useApiQuery(() => api.waybills.list({ where: { type: 'sales' }, orderBy: 'date', orderDir: 'desc' }), [], ['waybills']) || [];
  const contacts = useApiQuery(() => api.contacts.list(), [], ['contacts']) || [];

  const contactMap = useMemo(() => {
    return new Map(contacts.map(c => [c.id!, c.name]));
  }, [contacts]);

  // Map order items by orderId
  const orderItemsMap = useMemo(() => {
    const map = new Map<number, OrderItem[]>();
    orderItems.forEach(item => {
      const list = map.get(item.orderId) || [];
      list.push(item);
      map.set(item.orderId, list);
    });
    return map;
  }, [orderItems]);

  // Process Orders fulfillment
  const processedOrders = useMemo(() => {
    return orders.map(order => {
      const items = orderItemsMap.get(order.id!) || [];
      const totalOrderedPairs = items.reduce((sum, i) => sum + (i.quantity || 0), 0);
      const totalShippedPairs = items.reduce((sum, i) => sum + (i.shippedQuantity || 0), 0);
      const remainingPairs = Math.max(0, totalOrderedPairs - totalShippedPairs);
      const fulfillmentRate = totalOrderedPairs > 0 ? Math.round((totalShippedPairs / totalOrderedPairs) * 100) : 0;
      const customerName = contactMap.get(order.contactId) || 'Müşteri';

      return {
        ...order,
        customerName,
        totalOrderedPairs,
        totalShippedPairs,
        remainingPairs,
        fulfillmentRate
      };
    });
  }, [orders, orderItemsMap, contactMap]);

  // Filtered Orders
  const filteredOrders = useMemo(() => {
    return processedOrders.filter(o => {
      const matchesSearch = 
        o.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.customerName.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus = 
        statusFilter === 'all' ||
        (statusFilter === 'completed' && o.remainingPairs === 0) ||
        (statusFilter === 'partial' && o.totalShippedPairs > 0 && o.remainingPairs > 0) ||
        (statusFilter === 'pending' && o.totalShippedPairs === 0);

      return matchesSearch && matchesStatus;
    });
  }, [processedOrders, searchTerm, statusFilter]);

  // Pending Waybills (not yet invoiced)
  const pendingWaybills = useMemo(() => {
    const now = new Date();
    return waybills.filter(w => w.status !== 'cancelled' && w.invoicedStatus !== 'invoiced').map(w => {
      const waybillDate = new Date(w.date);
      const diffDays = Math.floor((now.getTime() - waybillDate.getTime()) / (1000 * 60 * 60 * 24));
      return {
        ...w,
        customerName: contactMap.get(w.contactId) || 'Müşteri',
        diffDays
      };
    });
  }, [waybills, contactMap]);

  // Stats
  const stats = useMemo(() => {
    const totalOrdersCount = processedOrders.length;
    const totalPairsOrdered = processedOrders.reduce((s, o) => s + o.totalOrderedPairs, 0);
    const totalPairsShipped = processedOrders.reduce((s, o) => s + o.totalShippedPairs, 0);
    const totalPairsRemaining = processedOrders.reduce((s, o) => s + o.remainingPairs, 0);
    const overallFulfillmentRate = totalPairsOrdered > 0 ? Math.round((totalPairsShipped / totalPairsOrdered) * 100) : 0;

    const overdueWaybillsCount = pendingWaybills.filter(w => w.diffDays > 7).length;
    const pendingWaybillTotal = pendingWaybills.reduce((s, w) => s + (w.grandTotal || 0), 0);

    return {
      totalOrdersCount,
      totalPairsOrdered,
      totalPairsShipped,
      totalPairsRemaining,
      overallFulfillmentRate,
      pendingWaybillsCount: pendingWaybills.length,
      overdueWaybillsCount,
      pendingWaybillTotal
    };
  }, [processedOrders, pendingWaybills]);

  // Print Fulfillment Report
  const handlePrintFulfillment = () => {
    if (filteredOrders.length === 0) return;

    const headers = [
      'SİPARİŞ NO',
      'TARİH',
      'MÜŞTERİ',
      'SİPARİŞ ÇİFT',
      'SEVK EDİLEN ÇİFT',
      'KALAN ÇİFT',
      'KARŞILAMA (%)',
      'TUTAR (₺)',
      'DURUM'
    ];

    const rows = filteredOrders.map(o => [
      o.orderNumber,
      new Date(o.date).toLocaleDateString('tr-TR'),
      o.customerName,
      o.totalOrderedPairs.toString(),
      o.totalShippedPairs.toString(),
      o.remainingPairs.toString(),
      `%${o.fulfillmentRate}`,
      o.grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 }),
      o.remainingPairs === 0 ? 'TAMAMLANDI' : o.totalShippedPairs > 0 ? 'KISMEN SEVK' : 'SEVK BEKLİYOR'
    ]);

    printTabularReport(
      'Müşteri Sipariş Karşılama ve Sevk Durum Raporu',
      'Sipariş edilen vs sevk edilen çift adetleri, kalan bakiye ve tamamlama yüzdesi',
      headers,
      rows,
      [
        { label: 'Sipariş Adedi', value: stats.totalOrdersCount },
        { label: 'Toplam Sipariş', value: `${stats.totalPairsOrdered} Çift` },
        { label: 'Toplam Sevk Edilen', value: `${stats.totalPairsShipped} Çift` },
        { label: 'Genel Sevk Oranı', value: `%${stats.overallFulfillmentRate}` }
      ]
    );
  };

  // Print Pending Waybills Report
  const handlePrintPendingWaybills = () => {
    if (pendingWaybills.length === 0) return;

    const headers = [
      'İRSALİYE NO',
      'DÜZENLEME TARİHİ',
      'MÜŞTERİ',
      'MİKTAR (ÇİFT)',
      'TUTAR (₺)',
      'GEÇEN GÜN',
      'MEVZUAT UYARISI'
    ];

    const rows = pendingWaybills.map(w => [
      w.waybillNumber,
      new Date(w.date).toLocaleDateString('tr-TR'),
      w.customerName,
      w.totalQuantity.toString(),
      w.grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 }),
      `${w.diffDays} gün`,
      w.diffDays > 7 ? '7 GÜN SÜRESİ GEÇTİ (FATURA KESİLMELİ!)' : `${7 - w.diffDays} gün kaldı`
    ]);

    printTabularReport(
      'Açık Sevk İrsaliyeleri Raporu (Fatura Bekleyenler)',
      'VUK 7 gün faturalaşma süresi ve açık sevk irsaliyeleri takibi',
      headers,
      rows,
      [
        { label: 'Açık İrsaliye', value: `${stats.pendingWaybillsCount} Adet` },
        { label: 'Fatura Bekleyen Tutar', value: `₺${stats.pendingWaybillTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` },
        { label: '7 Günü Aşanlar', value: `${stats.overdueWaybillsCount} Adet` }
      ]
    );
  };

  // Export CSV
  const handleExportCsv = () => {
    if (activeTab === 'fulfillment') {
      const headers = ['Sipariş No', 'Tarih', 'Müşteri', 'Sipariş Edilen (Çift)', 'Sevk Edilen (Çift)', 'Kalan Çift', 'Karşılama Oranı (%)', 'Tutar (TL)'];
      const rows = filteredOrders.map(o => [
        o.orderNumber,
        new Date(o.date).toLocaleDateString('tr-TR'),
        o.customerName,
        o.totalOrderedPairs,
        o.totalShippedPairs,
        o.remainingPairs,
        o.fulfillmentRate,
        o.grandTotal.toFixed(2)
      ]);
      exportToCsv('Siparis_Karsilama_Raporu.csv', headers, rows);
    } else {
      const headers = ['İrsaliye No', 'Tarih', 'Müşteri', 'Sevk Miktarı (Çift)', 'Tutar (TL)', 'Geçen Gün', 'Mevzuat Durumu'];
      const rows = pendingWaybills.map(w => [
        w.waybillNumber,
        new Date(w.date).toLocaleDateString('tr-TR'),
        w.customerName,
        w.totalQuantity,
        w.grandTotal.toFixed(2),
        w.diffDays,
        w.diffDays > 7 ? '7 Günü Aştı' : 'Süre İçinde'
      ]);
      exportToCsv('Acik_Sevk_Irsaliyeleri_Raporu.csv', headers, rows);
    }
  };

  type FulfillmentRow = (typeof filteredOrders)[number];
  type PendingWaybillRow = (typeof pendingWaybills)[number];

  const fulfillmentColumns: GridColumn<FulfillmentRow>[] = [
    {
      key: 'orderNumber',
      title: 'Sipariş No',
      render: (o) => (
        <span className="font-mono font-bold text-slate-700 dark:text-slate-200">{o.orderNumber}</span>
      ),
    },
    {
      key: 'date',
      title: 'Tarih',
      render: (o) => (
        <span className="text-slate-600 font-medium">{new Date(o.date).toLocaleDateString('tr-TR')}</span>
      ),
      filterValue: (o) => new Date(o.date).toLocaleDateString('tr-TR'),
    },
    {
      key: 'customerName',
      title: 'Müşteri',
      render: (o) => (
        <span className="font-bold text-slate-900 dark:text-slate-100">{o.customerName}</span>
      ),
    },
    {
      key: 'totalOrderedPairs',
      title: 'Sipariş (Çift)',
      align: 'right',
      render: (o) => (
        <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{o.totalOrderedPairs}</span>
      ),
    },
    {
      key: 'totalShippedPairs',
      title: 'Sevk Edilen',
      align: 'right',
      render: (o) => (
        <span className="font-mono font-black text-emerald-700">{o.totalShippedPairs}</span>
      ),
    },
    {
      key: 'remainingPairs',
      title: 'Kalan Çift',
      align: 'right',
      render: (o) => (
        <span className="font-mono font-bold text-amber-700">{o.remainingPairs > 0 ? o.remainingPairs : '-'}</span>
      ),
    },
    {
      key: 'fulfillmentRate',
      title: 'Karşılama',
      width: '9rem',
      render: (o) => (
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full",
                o.fulfillmentRate === 100 ? "bg-emerald-600" : "bg-indigo-600"
              )}
              style={{ width: `${o.fulfillmentRate}%` }}
            />
          </div>
          <span className="font-mono text-[10px] font-bold text-slate-600 w-8">
            %{o.fulfillmentRate}
          </span>
        </div>
      ),
      filterValue: (o) => `%${o.fulfillmentRate}`,
    },
    {
      key: 'grandTotal',
      title: 'Tutar',
      align: 'right',
      render: (o) => (
        <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
          ₺{o.grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
        </span>
      ),
    },
  ];

  const pendingWaybillColumns: GridColumn<PendingWaybillRow>[] = [
    {
      key: 'waybillNumber',
      title: 'İrsaliye No',
      render: (w) => (
        <span className="font-mono font-bold text-slate-700 dark:text-slate-200">{w.waybillNumber}</span>
      ),
    },
    {
      key: 'date',
      title: 'Düzenleme Tarihi',
      render: (w) => (
        <span className="text-slate-600 font-medium">{new Date(w.date).toLocaleDateString('tr-TR')}</span>
      ),
      filterValue: (w) => new Date(w.date).toLocaleDateString('tr-TR'),
    },
    {
      key: 'customerName',
      title: 'Müşteri',
      render: (w) => (
        <span className="font-bold text-slate-900 dark:text-slate-100">{w.customerName}</span>
      ),
    },
    {
      key: 'totalQuantity',
      title: 'Sevk Miktarı',
      align: 'right',
      render: (w) => (
        <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{w.totalQuantity} Çift</span>
      ),
      filterValue: (w) => `${w.totalQuantity}`,
    },
    {
      key: 'grandTotal',
      title: 'Tutar',
      align: 'right',
      render: (w) => (
        <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
          ₺{w.grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
        </span>
      ),
    },
    {
      key: 'diffDays',
      title: 'Geçen Gün',
      align: 'center',
      render: (w) => (
        <span className="font-mono font-bold">{w.diffDays} gün</span>
      ),
      filterValue: (w) => `${w.diffDays}`,
    },
    {
      key: 'legalStatus',
      title: 'Yasal Durum',
      align: 'center',
      render: (w) => w.diffDays > 7 ? (
        <StatusPill tone="red"><AlertTriangle className="w-3 h-3" /> 7 Günü Aştı!</StatusPill>
      ) : (
        <StatusPill tone="green"><CheckCircle2 className="w-3 h-3" /> {7 - w.diffDays} gün süresi var</StatusPill>
      ),
      filterValue: (w) => w.diffDays > 7 ? '7 Günü Aştı' : 'Süre İçinde',
    },
  ];

  return (
    <div className="space-y-6">
      
      {/* Üst Bar & Sekme Seçimi */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        
        <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('fulfillment')}
            className={cn(
              "flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer",
              activeTab === 'fulfillment' ? "bg-white dark:bg-slate-900 text-indigo-700 shadow-xs" : "text-slate-600 hover:text-slate-900 dark:text-slate-100"
            )}
          >
            <ShoppingCart className="w-4 h-4 text-indigo-600" />
            Sipariş Karşılama Oranları
          </button>
          <button
            onClick={() => setActiveTab('pending_invoices')}
            className={cn(
              "flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer",
              activeTab === 'pending_invoices' ? "bg-white dark:bg-slate-900 text-indigo-700 shadow-xs" : "text-slate-600 hover:text-slate-900 dark:text-slate-100"
            )}
          >
            <Truck className="w-4 h-4 text-amber-600" />
            Açık Sevk İrsaliyeleri ({pendingWaybills.length})
            {stats.overdueWaybillsCount > 0 && (
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            )}
          </button>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={activeTab === 'fulfillment' ? handlePrintFulfillment : handlePrintPendingWaybills}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-xl transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4 text-slate-600" />
            Yazdır (A4)
          </button>
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <FileDown className="w-4 h-4" />
            Excel'e Aktar
          </button>
        </div>

      </div>

      {/* KPI Kartları */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Toplam Sipariş</span>
            <ShoppingCart className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-slate-100 font-mono">
            {stats.totalPairsOrdered.toLocaleString('tr-TR')} <span className="text-xs font-bold text-slate-400">Çift</span>
          </div>
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-1">
            {stats.totalOrdersCount} Adet Satış Siparişi
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Sevk Edilen Miktar</span>
            <Truck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-700 font-mono">
            {stats.totalPairsShipped.toLocaleString('tr-TR')} <span className="text-xs font-bold text-slate-400">Çift</span>
          </div>
          <div className="text-[11px] font-semibold text-emerald-600 mt-1">
            %{stats.overallFulfillmentRate} Teslim Edildi
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Kalan Sevk Bakiyesi</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-black text-amber-700 font-mono">
            {stats.totalPairsRemaining.toLocaleString('tr-TR')} <span className="text-xs font-bold text-slate-400">Çift</span>
          </div>
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-1">
            Bekleyen Sevkiyat
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Açık İrsaliyeler</span>
            <Receipt className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-2xl font-black text-purple-800 font-mono">
            {stats.pendingWaybillsCount} <span className="text-xs font-bold text-slate-400">İrsaliye</span>
          </div>
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-1">
            ₺{stats.pendingWaybillTotal.toLocaleString('tr-TR')} Fatura Bekliyor
          </div>
        </div>

      </div>

      {/* Tab 1: Sipariş Karşılama */}
      {activeTab === 'fulfillment' && (
        <DataGrid<FulfillmentRow>
          columns={fulfillmentColumns}
          data={filteredOrders}
          rowKey="id"
          emptyMessage="Kayıtlı sipariş bulunamadı."
          toolbar={
            <>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Sipariş no veya müşteri ara..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 pr-3 py-1.5 text-xs font-medium bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 w-56"
                />
              </div>

              <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs">
                <button
                  onClick={() => setStatusFilter('all')}
                  className={cn("px-3 py-1 font-bold rounded-lg transition-all cursor-pointer", statusFilter === 'all' ? "bg-white dark:bg-slate-900 text-indigo-700 shadow-xs" : "text-slate-600")}
                >
                  Tümü
                </button>
                <button
                  onClick={() => setStatusFilter('completed')}
                  className={cn("px-3 py-1 font-bold rounded-lg transition-all cursor-pointer", statusFilter === 'completed' ? "bg-white dark:bg-slate-900 text-emerald-700 shadow-xs" : "text-slate-600")}
                >
                  Tam Sevk
                </button>
                <button
                  onClick={() => setStatusFilter('partial')}
                  className={cn("px-3 py-1 font-bold rounded-lg transition-all cursor-pointer", statusFilter === 'partial' ? "bg-white dark:bg-slate-900 text-amber-700 shadow-xs" : "text-slate-600")}
                >
                  Kısmi Sevk
                </button>
                <button
                  onClick={() => setStatusFilter('pending')}
                  className={cn("px-3 py-1 font-bold rounded-lg transition-all cursor-pointer", statusFilter === 'pending' ? "bg-white dark:bg-slate-900 text-rose-700 shadow-xs" : "text-slate-600")}
                >
                  Bekleyen
                </button>
              </div>

              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 ml-auto">
                {filteredOrders.length} Sipariş Listeleniyor
              </span>
            </>
          }
        />
      )}

      {/* Tab 2: Açık İrsaliyeler */}
      {activeTab === 'pending_invoices' && (
        <DataGrid<PendingWaybillRow>
          columns={pendingWaybillColumns}
          data={pendingWaybills}
          rowKey="id"
          emptyMessage="Faturalaşmayı bekleyen açık sevk irsaliyesi bulunmuyor. Tüm irsaliyeler faturalandırılmış!"
          toolbar={
            <>
              <div className="flex items-center gap-2">
                <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                  <Truck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-slate-100">
                    Faturalaşmamış Açık Sevk İrsaliyeleri
                  </h3>
                  <p className="text-[10px] text-slate-400 font-semibold">VUK 231/5 gereği sevk irsaliyesi düzenlendikten sonra en geç 7 gün içinde faturası kesilmelidir.</p>
                </div>
              </div>
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 ml-auto">
                {pendingWaybills.length} Açık İrsaliye
              </span>
            </>
          }
        />
      )}

    </div>
  );
}
