import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import { useApiQueryIf } from '../../hooks/useApiQuery';
import { useAuth } from '../../context/AuthContext';
import { 
  BarChart3, 
  Users, 
  Hammer, 
  ShoppingCart, 
  Landmark, 
  BookOpen, 
  Package, 
  ArrowRight,
  TrendingUp,
  Wallet,
  ShieldCheck,
  Truck,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { cn } from '../../lib/utils';
import PageHeader from '../PageHeader';
import HRReport from './HRReport';
import ProductionReport from './ProductionReport';
import FinanceReport from './FinanceReport';
import AccountingReport from './AccountingReport';
import OrderDeliveryReport from './OrderDeliveryReport';
import StockReportTab from './StockReportTab';

export default function ReportsHub() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get('tab') || 'overview';
  const { hasPermission } = useAuth();

  const setTab = (tabName: string) => {
    setSearchParams({ tab: tabName });
  };

  // Her rapor sekmesi kendi modülünün görüntüleme yetkisine bağlıdır.
  const canHr = hasPermission('hr', 'view');
  const canProduction = hasPermission('production', 'view');
  const canOrders = hasPermission('orders', 'view');
  const canFinance = hasPermission('finance', 'view');
  const canAccounting = hasPermission('accounting', 'view');
  const canInventory = hasPermission('inventory', 'view');

  // Yetkisi olmayan modüllerin sorguları hiç çalıştırılmaz.
  const products = useApiQueryIf(canInventory, () => api.products.list(), [], ['products']) || [];
  const workOrders = useApiQueryIf(canProduction, () => api.workOrders.list(), [], ['workOrders']) || [];
  const orders = useApiQueryIf(canOrders, () => api.orders.list({ where: { type: 'sales' } }), [], ['orders']) || [];
  const cashBoxes = useApiQueryIf(canFinance, () => api.cashBoxes.list(), [], ['cashBoxes']) || [];
  const bankAccounts = useApiQueryIf(canFinance, () => api.bankAccounts.list(), [], ['bankAccounts']) || [];
  const employees = useApiQueryIf(canHr, () => api.employees.list({ where: { status: 'active' } }), [], ['employees']) || [];
  const payrolls = useApiQueryIf(canHr, () => api.payrollRecords.list(), [], ['payrollRecords']) || [];
  const accounts = useApiQueryIf(canAccounting, () => api.accounts.list(), [], ['accounts']) || [];
  const journalEntries = useApiQueryIf(canAccounting, () => api.journalEntries.list(), [], ['journalEntries']) || [];

  // Overview metrics
  const totalStockCount = products.reduce((s, p) => s + (p.stock || 0), 0);
  const criticalStockCount = products.filter(p => p.stock <= p.minStock).length;
  
  const activeWorkOrders = workOrders.filter(w => w.currentStage !== 'completed');
  const activePairsInProduction = activeWorkOrders.reduce((s, w) => s + (w.quantity || 0), 0);
  
  const totalLiquidity = 
    cashBoxes.reduce((s, c) => s + (c.balance || 0), 0) + 
    bankAccounts.reduce((s, b) => s + (b.balance || 0), 0);

  const totalEmployeesCount = employees.length;
  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();
  const currentMonthPayrolls = payrolls.filter(p => p.month === currentMonth && p.year === currentYear);
  const currentMonthEmployerCost = currentMonthPayrolls.reduce((s, p) => s + (p.totalEmployerCost || 0), 0);

  let kdv191 = 0;
  let kdv391 = 0;
  journalEntries.forEach(entry => {
    entry.lines?.forEach(line => {
      if (line.accountCode.startsWith('191')) {
        kdv191 += (Number(line.debit) || 0) - (Number(line.credit) || 0);
      }
      if (line.accountCode.startsWith('391')) {
        kdv391 += (Number(line.credit) || 0) - (Number(line.debit) || 0);
      }
    });
  });
  const netKdvDiff = kdv391 - kdv191;

  const tabs = [
    { id: 'overview', label: 'Genel Yönetim Özeti', icon: BarChart3, allowed: true },
    { id: 'hr', label: 'İK & Bordro İcmali', icon: Users, allowed: canHr },
    { id: 'production', label: 'Üretim & İmalat', icon: Hammer, allowed: canProduction },
    { id: 'orders', label: 'Sipariş & Sevkiyat', icon: ShoppingCart, allowed: canOrders },
    { id: 'finance', label: 'Finans & Likidite', icon: Landmark, allowed: canFinance },
    { id: 'accounting', label: 'Muhasebe (Mizan/KDV)', icon: BookOpen, allowed: canAccounting },
    { id: 'stock', label: 'Stok & Malzeme', icon: Package, allowed: canInventory },
  ].filter(t => t.allowed);

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto animate-in fade-in duration-200">
      
      {/* Top Header */}
      <PageHeader
        title="Raporlar & Analiz Merkezi"
        subtitle="İnsan kaynakları bordrosundan imalat hattına, kasa-banka likiditesinden TDHP mizanına fabrikanın tüm icmalleri"
        badge="Raporlama"
        icon={BarChart3}
        iconColor="indigo"
      />

      {/* Ana Modül Sekmeleri Barı */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-slate-200 dark:border-slate-700">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer",
                isActive 
                  ? "bg-indigo-600 text-white shadow-xs" 
                  : "bg-white dark:bg-slate-900 text-slate-600 hover:bg-slate-100 dark:bg-slate-800 hover:text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700/80 dark:border-slate-800/80"
              )}
            >
              <Icon className={cn("w-4 h-4", isActive ? "text-white" : "text-slate-500 dark:text-slate-400")} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab İçerikleri */}
      {currentTab === 'overview' && (
        <div className="space-y-6">
          
          {/* Yönetici Özet Kartları */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            
            {/* 1. İK & Bordro Kartı */}
            <div 
              onClick={() => setTab('hr')}
              className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs hover:shadow-md hover:border-indigo-300 transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-indigo-600">
                  <div className="p-2 bg-indigo-50 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                    <Users className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">İK & Bordro Durumu</span>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all" />
              </div>

              <div className="text-2xl font-black text-slate-900 dark:text-slate-100 font-mono">
                {canHr ? totalEmployeesCount : '—'} <span className="text-xs font-bold text-slate-400">Aktif Çalışan</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Bu Ayki Toplam İşveren Maliyeti: <strong className="text-purple-800 font-mono">₺{currentMonthEmployerCost.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</strong>
              </p>

              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] font-bold text-indigo-600">
                <span>Bordro İcmalini Görüntüle</span>
                <span>Detay →</span>
              </div>
            </div>

            {/* 2. Üretim & İmalat Kartı */}
            <div 
              onClick={() => setTab('production')}
              className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs hover:shadow-md hover:border-indigo-300 transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-amber-600">
                  <div className="p-2 bg-amber-50 rounded-xl group-hover:bg-amber-600 group-hover:text-white transition-colors">
                    <Hammer className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">Üretim & Proses Hattı</span>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all" />
              </div>

              <div className="text-2xl font-black text-slate-900 dark:text-slate-100 font-mono">
                {canProduction ? activePairsInProduction.toLocaleString('tr-TR') : '—'} <span className="text-xs font-bold text-slate-400">Çift Hatta</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {activeWorkOrders.length} Adet İş Emri 8 Kademeli Proses Hattında İşleniyor
              </p>

              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] font-bold text-indigo-600">
                <span>İş Emri & Hat Çizelgesini Aç</span>
                <span>Detay →</span>
              </div>
            </div>

            {/* 3. Finans & Likidite Kartı */}
            <div 
              onClick={() => setTab('finance')}
              className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs hover:shadow-md hover:border-indigo-300 transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-emerald-600">
                  <div className="p-2 bg-emerald-50 rounded-xl group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                    <Wallet className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">Kasa & Banka Likidite</span>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all" />
              </div>

              <div className="text-2xl font-black text-emerald-700 font-mono">
                {canFinance
                  ? `₺${totalLiquidity.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`
                  : '—'}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Kasa ve Banka Hesaplarındaki Toplam Kullanılabilir Likidite
              </p>

              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] font-bold text-indigo-600">
                <span>Çek Takvimi & Likidite Raporu</span>
                <span>Detay →</span>
              </div>
            </div>

            {/* 4. Muhasebe & KDV Kartı */}
            <div 
              onClick={() => setTab('accounting')}
              className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs hover:shadow-md hover:border-indigo-300 transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-blue-600">
                  <div className="p-2 bg-blue-50 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-colors">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">TDHP Mizan & KDV</span>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all" />
              </div>

              <div className={cn("text-2xl font-black font-mono", netKdvDiff > 0 ? "text-rose-700" : "text-emerald-700")}>
                {canAccounting
                  ? `₺${Math.abs(netKdvDiff).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`
                  : '—'}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {netKdvDiff > 0 ? '360 Ödenecek Vergi Tahakkuku' : '190 Devreden KDV Bakiyesi'}
              </p>

              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] font-bold text-indigo-600">
                <span>Mizan Tablosunu İncele</span>
                <span>Detay →</span>
              </div>
            </div>

            {/* 5. Sipariş & Sevkiyat Kartı */}
            <div 
              onClick={() => setTab('orders')}
              className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs hover:shadow-md hover:border-indigo-300 transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-purple-600">
                  <div className="p-2 bg-purple-50 rounded-xl group-hover:bg-purple-600 group-hover:text-white transition-colors">
                    <Truck className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">Sipariş & Sevkiyat</span>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all" />
              </div>

              <div className="text-2xl font-black text-slate-900 dark:text-slate-100 font-mono">
                {canOrders ? orders.length : '—'} <span className="text-xs font-bold text-slate-400">Sipariş Kaydı</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Sipariş Karşılama Oranları & 7 Günlük Açık Sevk İrsaliyeleri
              </p>

              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] font-bold text-indigo-600">
                <span>Sevk Raporunu Aç</span>
                <span>Detay →</span>
              </div>
            </div>

            {/* 6. Stok & Malzeme Kartı */}
            <div 
              onClick={() => setTab('stock')}
              className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs hover:shadow-md hover:border-indigo-300 transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-teal-600">
                  <div className="p-2 bg-teal-50 rounded-xl group-hover:bg-teal-600 group-hover:text-white transition-colors">
                    <Package className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">Stok & Asorti Matrisi</span>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all" />
              </div>

              <div className="text-2xl font-black text-slate-900 dark:text-slate-100 font-mono">
                {canInventory ? totalStockCount.toLocaleString('tr-TR') : '—'} <span className="text-xs font-bold text-slate-400">Adet/Çift Stok</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {criticalStockCount > 0 ? (
                  <span className="text-rose-600 font-bold">{criticalStockCount} Model Kritik Seviyenin Altında!</span>
                ) : (
                  <span className="text-emerald-600 font-semibold">Tüm stok seviyeleri güvenli.</span>
                )}
              </p>

              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] font-bold text-indigo-600">
                <span>Stok & Beden Raporları</span>
                <span>Detay →</span>
              </div>
            </div>

          </div>

        </div>
      )}

      {currentTab === 'hr' && canHr && <HRReport />}
      {currentTab === 'production' && canProduction && <ProductionReport />}
      {currentTab === 'orders' && canOrders && <OrderDeliveryReport />}
      {currentTab === 'finance' && canFinance && <FinanceReport />}
      {currentTab === 'accounting' && canAccounting && <AccountingReport />}
      {currentTab === 'stock' && canInventory && <StockReportTab />}

      {/* Yetkisi olmayan bir sekme doğrudan bağlantı ile açılırsa */}
      {currentTab !== 'overview' && !tabs.some(t => t.id === currentTab) && (
        <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl border border-slate-200 dark:border-slate-700 text-center">
          <ShieldCheck className="w-8 h-8 text-rose-500 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Bu rapor için yetkiniz bulunmuyor</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            İlgili modülde görüntüleme yetkisi tanımlandığında rapor otomatik olarak görünür.
          </p>
        </div>
      )}

    </div>
  );
}
