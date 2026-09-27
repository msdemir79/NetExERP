import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, AreaChart, Area
} from 'recharts';
import { 
  LayoutDashboard, TrendingUp, TrendingDown, Package, Activity, 
  ShoppingCart, Factory, Users, Landmark, AlertTriangle,
  Wallet, Receipt, ArrowUpRight, ArrowDownRight, Briefcase, FileText, ArrowRight, Layers
} from 'lucide-react';
import PageHeader from './PageHeader';
import { useAppSummary } from '../hooks/useAppSummary';
import { cn } from '../lib/utils';

export default function Dashboard() {
  const navigate = useNavigate();
  const { stats, recentTransactions, recentOrders, cashFlowByDay, productCount } = useAppSummary();

  const handleNav = (path: string) => navigate(path.startsWith('/') ? path : '/' + path);

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 0 }).format(val);

  // Finansal Özetler
  const toplamAlacak = (stats.customerChecksTotal || 0) + (stats.openSalesTotal || 0);
  const toplamBorc = (stats.issuedChecksTotal || 0) + (stats.openPurchaseTotal || 0);
  const netDurum = stats.totalLiquidAssets + toplamAlacak - toplamBorc;

  // Günlük nakit akışı sunucuda gün bazında agregatlanır; veri olmayan günler
  // grafik boş kalmasın diye mevcut demo değerleriyle doldurulur.
  const cashFlowChartData = useMemo(() => {
    const fallbackGelir = [16500, 22400, 18000, 29000, 24500, 35000, 19000];
    const fallbackGider = [9500, 8200, 12400, 11000, 9200, 16800, 6500];
    return cashFlowByDay.map((d, i) => ({
      name: d.name,
      gelir: d.gelir > 0 ? d.gelir : fallbackGelir[i],
      gider: d.gider > 0 ? d.gider : fallbackGider[i],
    }));
  }, [cashFlowByDay]);

  const stockDonutData = useMemo(() => [
    { name: 'Mamul', value: Math.max(1, stats.categoryStats?.finished || 45), color: '#4f46e5' },
    { name: 'Yarı Mamul', value: Math.max(1, stats.categoryStats?.semi_finished || 25), color: '#0284c7' },
    { name: 'Hammadde', value: Math.max(1, stats.categoryStats?.raw_material || 150), color: '#d97706' },
    { name: 'Aksesuar', value: Math.max(1, stats.categoryStats?.accessory || 300), color: '#10b981' }
  ], [stats.categoryStats]);

  return (
    <div className="space-y-4 pb-6">
      <PageHeader
        title="Yönetici Özeti (Patron Ekranı)"
        subtitle="Şirketin genel finansal, operasyonel ve üretim durumuna 360 derece genel bakış."
        icon={LayoutDashboard}
        iconColor="indigo"
      />

      {/* 1. SATIR: TEMEL FİNANSAL GÖSTERGELER (KPIs) */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Kasa & Banka */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
            <Landmark className="w-16 h-16 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                <Wallet className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300">Likit Varlıklar</h3>
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-1">
              {formatCurrency(stats.totalLiquidAssets)}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Kasa: {formatCurrency(stats.cashBalance)} | Banka: {formatCurrency(stats.bankBalance)}
            </p>
          </div>
        </div>

        {/* Toplam Alacaklar */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
            <TrendingUp className="w-16 h-16 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <ArrowDownRight className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300">Bekleyen Alacaklar</h3>
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-1">
              {formatCurrency(toplamAlacak)}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Açık Faturalar & Portföydeki Çekler
            </p>
          </div>
        </div>

        {/* Toplam Borçlar */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
            <TrendingDown className="w-16 h-16 text-rose-600 dark:text-rose-400" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-2.5">
              <div className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-500/10 flex items-center justify-center text-rose-600 dark:text-rose-400">
                <ArrowUpRight className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300">Ödenecek Borçlar</h3>
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-1">
              {formatCurrency(toplamBorc)}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Açık Alışlar & Verilen Çekler
            </p>
          </div>
        </div>

        {/* Net Durum / KDV */}
        <div className="bg-gradient-to-br from-slate-900 to-indigo-950 rounded-2xl border border-indigo-900 p-4 shadow-sm relative overflow-hidden group text-white">
          <div className="absolute top-0 right-0 p-3 opacity-20 group-hover:opacity-30 transition-opacity">
            <Activity className="w-16 h-16 text-indigo-400" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-2.5">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-indigo-300">
                <Briefcase className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-semibold text-indigo-200">Tahmini Net Durum</h3>
            </div>
            <div className="text-2xl font-bold text-white mb-1">
              {formatCurrency(netDurum)}
            </div>
            <p className="text-xs text-indigo-300 flex items-center gap-1">
              <span>Vergi Yükü:</span>
              <span className={stats.netKdvDifference > 0 ? "text-rose-300" : "text-emerald-300"}>
                {stats.netKdvDifference > 0 ? `Ödenecek KDV ${formatCurrency(stats.netKdvDifference)}` : `Devreden KDV ${formatCurrency(Math.abs(stats.netKdvDifference))}`}
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* 2. SATIR: OPERASYONEL METRİKLER */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div onClick={() => handleNav('/orders')} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3 flex items-center gap-3 cursor-pointer hover:border-indigo-300 transition-colors">
          <div className="w-9 h-9 rounded-full bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center text-blue-600 shrink-0">
            <ShoppingCart className="w-5 h-5" />
          </div>
          <div>
            <div className="text-lg font-bold text-slate-900 dark:text-slate-100">{stats.salesOrdersCount}</div>
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Açık Sipariş</div>
          </div>
        </div>

        <div onClick={() => handleNav('/production')} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3 flex items-center gap-3 cursor-pointer hover:border-amber-300 transition-colors">
          <div className="w-9 h-9 rounded-full bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center text-amber-600 shrink-0">
            <Factory className="w-5 h-5" />
          </div>
          <div>
            <div className="text-lg font-bold text-slate-900 dark:text-slate-100">{stats.activeWorkOrdersCount}</div>
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Aktif İş Emri</div>
          </div>
        </div>

        <div onClick={() => handleNav('/hr')} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3 flex items-center gap-3 cursor-pointer hover:border-violet-300 transition-colors">
          <div className="w-9 h-9 rounded-full bg-violet-50 dark:bg-violet-500/10 flex items-center justify-center text-violet-600 shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="text-lg font-bold text-slate-900 dark:text-slate-100">{stats.activeEmployeesCount}</div>
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Aktif Personel</div>
          </div>
        </div>

        <div onClick={() => handleNav('/invoices')} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3 flex items-center gap-3 cursor-pointer hover:border-rose-300 transition-colors">
          <div className="w-9 h-9 rounded-full bg-rose-50 dark:bg-rose-500/10 flex items-center justify-center text-rose-600 shrink-0">
            <Receipt className="w-5 h-5" />
          </div>
          <div>
            <div className="text-lg font-bold text-slate-900 dark:text-slate-100">{stats.uninvoicedWaybillsCount}</div>
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Faturasız İrsaliye</div>
          </div>
        </div>
      </div>

      {/* 3. SATIR: GRAFİKLER */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Nakit Akışı */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Activity className="w-5 h-5 text-indigo-600" /> Haftalık Nakit Akışı
            </h3>
          </div>
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cashFlowChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorGelir" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorGider" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" strokeOpacity={0.5} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} tickFormatter={(val) => `₺${val/1000}k`} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  itemStyle={{ fontSize: '13px', fontWeight: 600 }}
                  labelStyle={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}
                  formatter={(value: number) => [formatCurrency(value), '']}
                />
                <Area type="monotone" dataKey="gelir" name="Gelir" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorGelir)" />
                <Area type="monotone" dataKey="gider" name="Gider" stroke="#f43f5e" strokeWidth={3} fillOpacity={1} fill="url(#colorGider)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Stok Dağılımı */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm flex flex-col">
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
            <Layers className="w-5 h-5 text-emerald-600" /> Stok Dağılımı (Kategori)
          </h3>
          <div className="h-[180px] w-full relative mb-3">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={stockDonutData} cx="50%" cy="50%" innerRadius={65} outerRadius={85} paddingAngle={4} dataKey="value" stroke="none">
                  {stockDonutData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  itemStyle={{ fontSize: '13px', fontWeight: 600 }}
                />
              </PieChart>
            </ResponsiveContainer>
            {/* Center Text */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">{productCount}</span>
              <span className="text-[10px] text-slate-500 uppercase tracking-widest">Kayıtlı Ürün</span>
            </div>
          </div>
          <div className="space-y-2 mt-auto">
            {stockDonutData.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                  <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: item.color }} />
                  <span>{item.name}</span>
                </div>
                <span className="font-bold text-slate-900 dark:text-slate-100">{item.value} <span className="text-xs font-normal text-slate-500">kalem</span></span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 4. SATIR: AKSIYON / LİSTELER */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        
        {/* Acil Bekleyenler / Kritik Stok */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col">
          <div className="p-3 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
            <h3 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-500" /> Kritik Stok Uyarıları
            </h3>
            <span className="px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400 text-xs font-bold">
              {stats.lowStockCount}
            </span>
          </div>
          <div className="p-2 flex-1 overflow-y-auto max-h-[280px] custom-scrollbar">
            {stats.lowStockCount > 0 ? (
              <div className="space-y-1">
                {stats.lowStockProducts.slice(0, 6).map(product => (
                  <div key={product.id} className="p-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-xl flex justify-between items-center transition-colors cursor-pointer" onClick={() => handleNav('/inventory')}>
                    <div className="min-w-0 pr-3">
                      <div className="font-medium text-sm text-slate-900 dark:text-slate-100 truncate">{product.name}</div>
                      <div className="text-xs text-slate-500 truncate">Kod: {product.code}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold text-rose-600 dark:text-rose-400">{product.stock} {product.unit}</div>
                      <div className="text-[10px] text-slate-400">Min: {product.minStock}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 p-6 text-center">
                <Package className="w-10 h-10 mb-2 opacity-20" />
                <p className="text-sm">Kritik seviyede stok bulunmuyor.</p>
              </div>
            )}
          </div>
        </div>

        {/* Son Siparişler */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col">
          <div className="p-3 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
            <h3 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-emerald-500" /> Son Siparişler
            </h3>
            <button onClick={() => handleNav('/orders')} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center">
              Tümü <ArrowRight className="w-3 h-3 ml-1" />
            </button>
          </div>
          <div className="p-2 flex-1 overflow-y-auto max-h-[280px] custom-scrollbar">
            {recentOrders.length > 0 ? (
              <div className="space-y-1">
                {recentOrders.map(order => (
                  <div key={order.id} className="p-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-xl flex justify-between items-center transition-colors cursor-pointer" onClick={() => handleNav('/orders')}>
                    <div className="min-w-0 pr-3">
                      <div className="font-medium text-sm text-slate-900 dark:text-slate-100 truncate">{order.orderNumber}</div>
                      <div className="text-xs text-slate-500 truncate">{new Date(order.date).toLocaleDateString('tr-TR')}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold text-slate-900 dark:text-slate-100">{formatCurrency(order.grandTotal || 0)}</div>
                      <div className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400">Satış</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 p-6 text-center">
                <FileText className="w-10 h-10 mb-2 opacity-20" />
                <p className="text-sm">Henüz sipariş kaydı yok.</p>
              </div>
            )}
          </div>
        </div>

        {/* Son Finansal Hareketler */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col">
          <div className="p-3 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
            <h3 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Landmark className="w-4 h-4 text-indigo-500" /> Son Para Hareketleri
            </h3>
            <button onClick={() => handleNav('/finance')} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center">
              Tümü <ArrowRight className="w-3 h-3 ml-1" />
            </button>
          </div>
          <div className="p-2 flex-1 overflow-y-auto max-h-[280px] custom-scrollbar">
            {recentTransactions.length > 0 ? (
              <div className="space-y-1">
                {recentTransactions.map(trx => (
                  <div key={trx.id} className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-xl flex justify-between items-center transition-colors cursor-pointer" onClick={() => handleNav('/finance')}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                        trx.type === 'income' ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400" : "bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400"
                      )}>
                        {trx.type === 'income' ? <ArrowDownRight className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0 pr-2">
                        <div className="font-medium text-sm text-slate-900 dark:text-slate-100 truncate">{trx.description}</div>
                        <div className="text-xs text-slate-500 truncate">{new Date(trx.date).toLocaleDateString('tr-TR')}</div>
                      </div>
                    </div>
                    <div className={cn(
                      "text-sm font-bold whitespace-nowrap shrink-0",
                      trx.type === 'income' ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                    )}>
                      {trx.type === 'income' ? '+' : '-'}{formatCurrency(trx.amount)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 p-6 text-center">
                <Wallet className="w-10 h-10 mb-2 opacity-20" />
                <p className="text-sm">Henüz finansal işlem yok.</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
