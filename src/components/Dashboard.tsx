import React, { useMemo, useState } from 'react';
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
import SegmentedFilter from './Common/SegmentedFilter';
import { api } from '../api/client';
import { useApiQuery } from '../hooks/useApiQuery';
import { useAppSummary } from '../hooks/useAppSummary';
import { cn } from '../lib/utils';

type RangeKey = 'today' | 'yesterday' | '7d' | '15d' | 'month' | 'prevMonth' | '3m' | 'year';

const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: 'today', label: 'Bugün' },
  { key: 'yesterday', label: 'Dün' },
  { key: '7d', label: 'Son 7 Gün' },
  { key: '15d', label: 'Son 15 Gün' },
  { key: 'month', label: 'Bu Ay' },
  { key: 'prevMonth', label: 'Geçen Ay' },
  { key: '3m', label: 'Son 3 Ay' },
  { key: 'year', label: 'Bu Yıl' },
];

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const endOfDay = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };

function rangeBounds(key: RangeKey): { from: Date; to: Date } {
  const now = new Date();
  switch (key) {
    case 'today': return { from: startOfDay(now), to: endOfDay(now) };
    case 'yesterday': { const y = new Date(now); y.setDate(y.getDate() - 1); return { from: startOfDay(y), to: endOfDay(y) }; }
    case '7d': { const f = new Date(now); f.setDate(f.getDate() - 6); return { from: startOfDay(f), to: endOfDay(now) }; }
    case '15d': { const f = new Date(now); f.setDate(f.getDate() - 14); return { from: startOfDay(f), to: endOfDay(now) }; }
    case 'month': return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: endOfDay(now) };
    case 'prevMonth': return { from: new Date(now.getFullYear(), now.getMonth() - 1, 1), to: endOfDay(new Date(now.getFullYear(), now.getMonth(), 0)) };
    case '3m': { const f = new Date(now); f.setMonth(f.getMonth() - 3); return { from: startOfDay(f), to: endOfDay(now) }; }
    case 'year': return { from: new Date(now.getFullYear(), 0, 1), to: endOfDay(now) };
  }
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { stats, recentTransactions, recentOrders, productCount } = useAppSummary();
  const [range, setRange] = useState<RangeKey>('7d');

  const transactions = useApiQuery(() => api.transactions.list(), [], ['transactions']);
  const checks = useApiQuery(() => api.checks.list(), [], ['checks']);
  const invoices = useApiQuery(() => api.invoices.list(), [], ['invoices']);

  const handleNav = (path: string) => navigate(path.startsWith('/') ? path : '/' + path);

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 0 }).format(val);

  // Finansal Özetler
  const toplamAlacak = (stats.customerChecksTotal || 0) + (stats.openSalesTotal || 0);
  const toplamBorc = (stats.issuedChecksTotal || 0) + (stats.openPurchaseTotal || 0);
  const netDurum = stats.totalLiquidAssets + toplamAlacak - toplamBorc;

  const bounds = useMemo(() => rangeBounds(range), [range]);

  // Seçilen dönemin kasa/banka hareketleri; iptal edilmiş ve ters kayıtlar hariç.
  // 62 günden uzun dönemlerde gün yerine ay kovalarına toplanır.
  const rangeChartData = useMemo(() => {
    const from = bounds.from.getTime();
    const to = bounds.to.getTime();
    const spanDays = Math.round((to - from) / 86400000) + 1;
    const monthly = spanDays > 62;
    const pad = (n: number) => String(n).padStart(2, '0');
    const bucketKey = (d: Date) =>
      monthly ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}` : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    const totals = new Map<string, { gelir: number; gider: number }>();
    (transactions || []).forEach((trx) => {
      if (trx.status === 'cancelled' || trx.reversalOfId) return;
      const date = new Date(trx.date);
      const t = date.getTime();
      if (t < from || t > to) return;
      const key = bucketKey(date);
      const entry = totals.get(key) || { gelir: 0, gider: 0 };
      const amount = Number(trx.amount) || 0;
      if (trx.type === 'income') entry.gelir += amount;
      else entry.gider += amount;
      totals.set(key, entry);
    });

    const labels = new Map<string, string>();
    const cursor = startOfDay(bounds.from);
    while (cursor.getTime() <= to) {
      const key = bucketKey(cursor);
      if (!labels.has(key)) {
        labels.set(key, monthly
          ? cursor.toLocaleDateString('tr-TR', { month: 'short' })
          : cursor.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' }));
      }
      if (monthly) cursor.setMonth(cursor.getMonth() + 1);
      else cursor.setDate(cursor.getDate() + 1);
    }

    return Array.from(labels.entries()).map(([key, name]) => ({
      name,
      gelir: totals.get(key)?.gelir || 0,
      gider: totals.get(key)?.gider || 0,
    }));
  }, [transactions, bounds]);

  const rangeTotals = useMemo(() => {
    let gelir = 0;
    let gider = 0;
    rangeChartData.forEach((d) => { gelir += d.gelir; gider += d.gider; });
    return { gelir, gider, net: gelir - gider };
  }, [rangeChartData]);

  const rangeLabel = RANGE_OPTIONS.find((o) => o.key === range)?.label || '';

  // Vadesi bugünden sonra gelen açık borçlar: verilen çek/senet + ödenmemiş alış faturaları.
  const upcomingPayments = useMemo(() => {
    const today = startOfDay(new Date()).getTime();
    const items: { id: string; label: string; sub: string; amount: number; dueDate: Date; target: string }[] = [];

    (checks || []).forEach((c) => {
      if (c.type !== 'given_check' && c.type !== 'given_note') return;
      if (c.status !== 'portfolio' && c.status !== 'bank_collection') return;
      const due = new Date(c.dueDate);
      if (due.getTime() < today) return;
      items.push({
        id: `chk-${c.id}`,
        label: c.contactName || c.drawer || c.portfolioNumber,
        sub: `${c.type === 'given_check' ? 'Verilen Çek' : 'Verilen Senet'} • ${c.portfolioNumber}`,
        amount: Number(c.amount) || 0,
        dueDate: due,
        target: '/finance',
      });
    });

    (invoices || []).forEach((inv) => {
      if (inv.type !== 'purchase' || inv.status !== 'issued' || inv.paymentStatus === 'paid') return;
      if (!inv.dueDate) return;
      const due = new Date(inv.dueDate);
      if (due.getTime() < today) return;
      const remaining = (Number(inv.grandTotal) || 0) - (Number(inv.paidAmount) || 0);
      if (remaining <= 0) return;
      items.push({
        id: `inv-${inv.id}`,
        label: inv.invoiceNumber,
        sub: 'Alış Faturası',
        amount: remaining,
        dueDate: due,
        target: '/invoices',
      });
    });

    return items.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime()).slice(0, 6);
  }, [checks, invoices]);

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

      {/* Dönem seçici + dönem özeti */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentedFilter
          options={RANGE_OPTIONS}
          value={range}
          onChange={(key) => setRange(key as RangeKey)}
          ariaLabel="Nakit akışı dönemi"
          size="sm"
        />
        <div className="flex items-center gap-3 text-xs font-bold">
          <span className="text-slate-500 dark:text-slate-400 font-semibold">{rangeLabel}</span>
          <span className="text-emerald-600 dark:text-emerald-400">Gelir {formatCurrency(rangeTotals.gelir)}</span>
          <span className="text-rose-600 dark:text-rose-400">Gider {formatCurrency(rangeTotals.gider)}</span>
          <span className={rangeTotals.net >= 0 ? 'text-slate-900 dark:text-slate-100' : 'text-rose-600 dark:text-rose-400'}>
            Net {formatCurrency(rangeTotals.net)}
          </span>
        </div>
      </div>

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
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Nakit Akışı */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Activity className="w-5 h-5 text-indigo-600" /> Nakit Akışı
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">({rangeLabel})</span>
            </h3>
          </div>
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={rangeChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: '#64748b' }}
                  domain={[0, (dataMax: number) => (dataMax > 0 ? dataMax : 1000)]}
                  tickFormatter={(val: number) => (val >= 1000 ? `₺${(val / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}k` : `₺${val}`)}
                />
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

        {/* Mali Durum + Yaklaşan Ödemeler */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col overflow-hidden">
          <div className="p-3 border-b border-slate-100 dark:border-slate-800">
            <h3 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-indigo-500" /> Mali Durum
            </h3>
          </div>
          <div className="px-3 py-2.5 space-y-1.5 border-b border-slate-100 dark:border-slate-800">
            {[
              { label: 'Kasa', value: stats.cashBalance, tone: 'text-slate-900 dark:text-slate-100' },
              { label: 'Banka', value: stats.bankBalance, tone: 'text-slate-900 dark:text-slate-100' },
              { label: 'Alacaklar', value: toplamAlacak, tone: 'text-emerald-600 dark:text-emerald-400' },
              { label: 'Borçlar', value: toplamBorc, tone: 'text-rose-600 dark:text-rose-400' },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-300">{row.label}</span>
                <span className={cn('font-bold font-mono', row.tone)}>{formatCurrency(row.value || 0)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between text-sm pt-2 border-t border-slate-100 dark:border-slate-800">
              <span className="font-bold text-slate-700 dark:text-slate-200">Net Varlık</span>
              <span className={cn(
                'font-black font-mono',
                netDurum >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
              )}>
                {formatCurrency(netDurum)}
              </span>
            </div>
          </div>

          <div className="p-3 flex justify-between items-center">
            <h3 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Receipt className="w-4 h-4 text-rose-500" /> Yaklaşan Ödemeler
            </h3>
            <span className="px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400 text-xs font-bold">
              {upcomingPayments.length}
            </span>
          </div>
          <div className="px-2 pb-2 flex-1 overflow-y-auto max-h-[220px] custom-scrollbar">
            {upcomingPayments.length > 0 ? (
              <div className="space-y-1">
                {upcomingPayments.map((p) => (
                  <div
                    key={p.id}
                    className="p-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-xl flex justify-between items-center transition-colors cursor-pointer"
                    onClick={() => handleNav(p.target)}
                  >
                    <div className="min-w-0 pr-3">
                      <div className="font-medium text-sm text-slate-900 dark:text-slate-100 truncate">{p.label}</div>
                      <div className="text-xs text-slate-500 truncate">
                        {p.sub} • Vade {p.dueDate.toLocaleDateString('tr-TR')}
                      </div>
                    </div>
                    <div className="text-sm font-bold text-rose-600 dark:text-rose-400 shrink-0">{formatCurrency(p.amount)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-slate-400 p-6 text-center">
                <Receipt className="w-8 h-8 mb-2 opacity-20" />
                <p className="text-sm">Yaklaşan ödeme yok.</p>
              </div>
            )}
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
