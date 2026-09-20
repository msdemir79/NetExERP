import React, { useState, useMemo } from 'react';
import { api } from '../../api/client';
import { useApiQuery } from '../../hooks/useApiQuery';
import { 
  Users, 
  Calendar, 
  Search, 
  Printer, 
  FileDown, 
  Filter, 
  DollarSign, 
  CreditCard, 
  ShieldCheck, 
  ShieldAlert,
  Building2,
  Clock,
  ArrowUpRight,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { printTabularReport } from '../../lib/printService';
import { exportToCsv, exportPayrollToExcel, exportPayrollToCsv } from '../../lib/exportService';
import { erpService } from '../../services/erpService';
import { cn } from '../../lib/utils';
import { FileSpreadsheet } from 'lucide-react';
import type { PayrollRecord, Employee } from '../../types';

export default function HRReport() {
  const currentDate = new Date();
  const [selectedMonth, setSelectedMonth] = useState<number>(currentDate.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(currentDate.getFullYear());
  const [searchTerm, setSearchTerm] = useState('');
  const [sgkFilter, setSgkFilter] = useState<'all' | 'sgk_li' | 'sgk_siz'>('all');
  const [activeSubTab, setActiveSubTab] = useState<'payroll' | 'advances_leaves'>('payroll');

  // Queries
  const employees = useApiQuery(() => api.employees.list(), [], ['employees']) || [];
  const payrolls = useApiQuery(() => api.payrollRecords.list(), [], ['payrollRecords']) || [];
  const advances = useApiQuery(() => api.advanceRequests.list(), [], ['advanceRequests']) || [];
  const leaves = useApiQuery(() => api.leaveRequests.list(), [], ['leaveRequests']) || [];

  // Filter payroll records
  const filteredPayrolls = useMemo(() => {
    return payrolls.filter(p => {
      const matchPeriod = p.month === selectedMonth && p.year === selectedYear;
      const matchSgk = sgkFilter === 'all' || p.sgkStatus === sgkFilter;
      const matchSearch = 
        p.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.employeeCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.department.toLowerCase().includes(searchTerm.toLowerCase());
      return matchPeriod && matchSgk && matchSearch;
    });
  }, [payrolls, selectedMonth, selectedYear, sgkFilter, searchTerm]);

  // Statistics
  const stats = useMemo(() => {
    const totalCount = filteredPayrolls.length;
    const sgkLiCount = filteredPayrolls.filter(p => p.sgkStatus === 'sgk_li').length;
    const dailyCount = filteredPayrolls.filter(p => p.sgkStatus === 'sgk_siz').length;

    const totalGross = filteredPayrolls.reduce((sum, p) => sum + (p.totalGrossPay || 0), 0);
    const totalNet = filteredPayrolls.reduce((sum, p) => sum + (p.netSalary || 0), 0);
    const totalAdvanceDeduction = filteredPayrolls.reduce((sum, p) => sum + (p.advanceDeduction || 0), 0);
    const totalLegalDeduction = filteredPayrolls.reduce((sum, p) => sum + (p.totalLegalDeductions || 0), 0);
    const totalEmployerCost = filteredPayrolls.reduce((sum, p) => sum + (p.totalEmployerCost || 0), 0);
    const totalEmployerSgk = filteredPayrolls.reduce((sum, p) => sum + ((p.employerSgkShare || 0) + (p.employerUnemploymentShare || 0)), 0);

    return {
      totalCount,
      sgkLiCount,
      dailyCount,
      totalGross,
      totalNet,
      totalAdvanceDeduction,
      totalLegalDeduction,
      totalEmployerCost,
      totalEmployerSgk
    };
  }, [filteredPayrolls]);

  // Handle Print
  const handlePrintPayroll = () => {
    if (filteredPayrolls.length === 0) return;

    const headers = [
      'KOD',
      'PERSONEL ADI',
      'DEPARTMAN',
      'STATÜ',
      'GÜN',
      'MESAI (S)',
      'BRÜT KAZANÇ (₺)',
      'SGK KESİNTİ (₺)',
      'VERGİLER (₺)',
      'AVANS (₺)',
      'NET MAAŞ (₺)',
      'İŞVEREN SGK (₺)',
      'TOPLAM MALİYET (₺)',
      'DURUM'
    ];

    const rows = filteredPayrolls.map(p => [
      p.employeeCode,
      p.employeeName,
      p.department,
      p.sgkStatus === 'sgk_li' ? 'SGK\'lı' : 'Yevmiyeli',
      p.daysWorked.toString(),
      p.overtimeHours.toString(),
      p.totalGrossPay.toLocaleString('tr-TR', { minimumFractionDigits: 2 }),
      ((p.employeeSgkShare || 0) + (p.employeeUnemploymentShare || 0)).toLocaleString('tr-TR', { minimumFractionDigits: 2 }),
      ((p.incomeTax || 0) + (p.stampTax || 0)).toLocaleString('tr-TR', { minimumFractionDigits: 2 }),
      (p.advanceDeduction || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 }),
      p.netSalary.toLocaleString('tr-TR', { minimumFractionDigits: 2 }),
      ((p.employerSgkShare || 0) + (p.employerUnemploymentShare || 0)).toLocaleString('tr-TR', { minimumFractionDigits: 2 }),
      p.totalEmployerCost.toLocaleString('tr-TR', { minimumFractionDigits: 2 }),
      p.paymentStatus === 'paid' ? 'ÖDENDİ' : 'BEKLİYOR'
    ]);

    const monthNames = ['', 'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

    printTabularReport(
      `Personel Bordro ve Maliyet İcmali (${monthNames[selectedMonth]} ${selectedYear})`,
      'Aylık net maaş, SGK kesintileri, vergi matrahları ve işveren toplam maliyet tablosu',
      headers,
      rows,
      [
        { label: 'Personel Sayısı', value: `${stats.totalCount} Kişi` },
        { label: 'Toplam Net Maaş', value: `₺${stats.totalNet.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` },
        { label: 'SGK & Yasal Kesintiler', value: `₺${stats.totalLegalDeduction.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` },
        { label: 'İşverene Toplam Maliyet', value: `₺${stats.totalEmployerCost.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` }
      ]
    );
  };

  // Handle Excel (.xls) and CSV Export
  const handleExportExcel = async () => {
    if (filteredPayrolls.length === 0) return;
    const filterTitle = sgkFilter === 'sgk_li' ? 'SGK\'lı Personeller' : sgkFilter === 'sgk_siz' ? 'Yevmiyeli Personeller' : 'Tüm Personeller';
    const sysSettings = await erpService.getSystemSettings();
    const companyName = sysSettings?.company?.companyTitle || sysSettings?.company?.companyName;
    exportPayrollToExcel(selectedMonth, selectedYear, filteredPayrolls, employees, { filterTitle, companyName });
  };

  const handleExportCsv = () => {
    if (filteredPayrolls.length === 0) return;
    exportPayrollToCsv(selectedMonth, selectedYear, filteredPayrolls, employees);
  };

  return (
    <div className="space-y-6">
      
      {/* Üst Bar: Dönem Seçici, Filtreler & Butonlar */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        
        {/* Sol Taraf: Ay & Yıl ve Filtreler */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/50 p-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
            <Calendar className="w-4 h-4 text-indigo-600 ml-2" />
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="bg-transparent text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer py-1 px-2"
            >
              <option value={1}>Ocak</option>
              <option value={2}>Şubat</option>
              <option value={3}>Mart</option>
              <option value={4}>Nisan</option>
              <option value={5}>Mayıs</option>
              <option value={6}>Haziran</option>
              <option value={7}>Temmuz</option>
              <option value={8}>Ağustos</option>
              <option value={9}>Eylül</option>
              <option value={10}>Ekim</option>
              <option value={11}>Kasım</option>
              <option value={12}>Aralık</option>
            </select>

            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="bg-transparent text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer py-1 px-2 border-l border-slate-200 dark:border-slate-700"
            >
              <option value={2025}>2025</option>
              <option value={2026}>2026</option>
              <option value={2027}>2027</option>
            </select>
          </div>

          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            <button
              onClick={() => setSgkFilter('all')}
              className={cn(
                "px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer",
                sgkFilter === 'all' ? "bg-white dark:bg-slate-900 text-indigo-700 shadow-xs" : "text-slate-600 hover:text-slate-900 dark:text-slate-100"
              )}
            >
              Tümü ({payrolls.filter(p => p.month === selectedMonth && p.year === selectedYear).length})
            </button>
            <button
              onClick={() => setSgkFilter('sgk_li')}
              className={cn(
                "px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer",
                sgkFilter === 'sgk_li' ? "bg-white dark:bg-slate-900 text-emerald-700 shadow-xs" : "text-slate-600 hover:text-slate-900 dark:text-slate-100"
              )}
            >
              SGK'lı
            </button>
            <button
              onClick={() => setSgkFilter('sgk_siz')}
              className={cn(
                "px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer",
                sgkFilter === 'sgk_siz' ? "bg-white dark:bg-slate-900 text-amber-700 shadow-xs" : "text-slate-600 hover:text-slate-900 dark:text-slate-100"
              )}
            >
              Yevmiyeli
            </button>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text"
              placeholder="Personel veya departman ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-3 py-2 text-xs font-medium bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 w-52"
            />
          </div>
        </div>

        {/* Sağ Taraf: Rapor İndirme ve Yazdırma */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={handlePrintPayroll}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-xl transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4 text-slate-600" />
            Yazdır (A4)
          </button>
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
            title="Excel formatında bordro tablosu indir (.xls)"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Excel'e Aktar (.xls)
          </button>
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl transition-colors cursor-pointer border border-slate-200 dark:border-slate-700"
            title="CSV formatında veri seti indir"
          >
            <FileDown className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
            CSV
          </button>
        </div>
      </div>

      {/* KPI Kartları */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Toplam Personel</span>
            <Users className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-slate-100 font-mono">
            {stats.totalCount} <span className="text-xs font-bold text-slate-400">Kişi</span>
          </div>
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-1">
            <span className="text-emerald-700">{stats.sgkLiCount} SGK'lı</span> • <span className="text-amber-700">{stats.dailyCount} Yevmiyeli</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Toplam Net Maaş</span>
            <DollarSign className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-700 font-mono">
            ₺{stats.totalNet.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-1">
            Hak Edilen Net Maaş Tutarı
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">SGK & Vergi Kesintisi</span>
            <ShieldCheck className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-black text-blue-700 font-mono">
            ₺{stats.totalLegalDeduction.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-1">
            İşçi SGK + Gelir/Damga Vergisi
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">İşveren Toplam Maliyeti</span>
            <Building2 className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-2xl font-black text-purple-800 font-mono">
            ₺{stats.totalEmployerCost.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-1">
            Net + İşçi/İşveren SGK + Vergiler
          </div>
        </div>

      </div>

      {/* Bordro İcmal Tablosu */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-slate-100">
                Personel Bordro & Maliyet İcmal Tablosu
              </h3>
              <p className="text-[10px] text-slate-400 font-semibold">Resmi ve gayriresmi ücret tahakkuku ve şirket maliyeti</p>
            </div>
          </div>
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
            {filteredPayrolls.length} Kayıt Listeleniyor
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700/80 dark:border-slate-800/80 text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-wider">
                <th className="py-3 px-3">Kod</th>
                <th className="py-3 px-3">Personel</th>
                <th className="py-3 px-3">Departman</th>
                <th className="py-3 px-3">Statü</th>
                <th className="py-3 px-2 text-center">Gün</th>
                <th className="py-3 px-2 text-center">Mesai</th>
                <th className="py-3 px-3 text-right">Brüt Kazanç</th>
                <th className="py-3 px-3 text-right">SGK Kesintisi</th>
                <th className="py-3 px-3 text-right">Vergiler</th>
                <th className="py-3 px-3 text-right">Avans Kes.</th>
                <th className="py-3 px-3 text-right text-emerald-800 bg-emerald-50/50">Net Ödenen</th>
                <th className="py-3 px-3 text-right">İşveren SGK</th>
                <th className="py-3 px-3 text-right text-purple-900 bg-purple-50/50">Toplam Maliyet</th>
                <th className="py-3 px-3 text-center">Ödeme</th>
                <th className="py-3 px-3 text-center">Muhasebe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredPayrolls.length === 0 ? (
                <tr>
                  <td colSpan={15} className="py-12 text-center text-slate-400 font-bold">
                    Seçili dönem ve filtrelere uygun bordro kaydı bulunamadı.
                  </td>
                </tr>
              ) : (
                filteredPayrolls.map(p => (
                  <tr key={p.id} className="hover:bg-slate-50 dark:bg-slate-800/50/80 transition-colors">
                    <td className="py-3 px-3 font-mono font-bold text-slate-500 dark:text-slate-400 text-[11px]">
                      {p.employeeCode}
                    </td>
                    <td className="py-3 px-3 font-black text-slate-900 dark:text-slate-100">
                      {p.employeeName}
                    </td>
                    <td className="py-3 px-3 text-slate-600 font-medium">
                      {p.department}
                    </td>
                    <td className="py-3 px-3">
                      {p.sgkStatus === 'sgk_li' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <ShieldCheck className="w-3 h-3" /> SGK'lı
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          <ShieldAlert className="w-3 h-3" /> Yevmiyeli
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-2 text-center font-mono font-bold text-slate-700 dark:text-slate-200">
                      {p.daysWorked}
                    </td>
                    <td className="py-3 px-2 text-center font-mono font-semibold text-slate-600">
                      {p.overtimeHours > 0 ? `${p.overtimeHours} sa` : '-'}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-slate-800 dark:text-slate-200">
                      ₺{p.totalGrossPay.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-medium text-slate-600">
                      ₺{((p.employeeSgkShare || 0) + (p.employeeUnemploymentShare || 0)).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-medium text-slate-600">
                      ₺{((p.incomeTax || 0) + (p.stampTax || 0)).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-medium text-rose-600">
                      {p.advanceDeduction > 0 ? `-₺${p.advanceDeduction.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` : '-'}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-black text-emerald-700 bg-emerald-50/40">
                      ₺{p.netSalary.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-medium text-slate-600">
                      ₺{((p.employerSgkShare || 0) + (p.employerUnemploymentShare || 0)).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-black text-purple-900 bg-purple-50/40">
                      ₺{p.totalEmployerCost.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-3 text-center">
                      {p.paymentStatus === 'paid' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                          <CheckCircle2 className="w-3 h-3" /> Ödendi
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md">
                          <Clock className="w-3 h-3" /> Bekliyor
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center">
                      {p.isAccounted ? (
                        <span className="inline-block text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">
                          Fiş: #{p.journalEntryId || 'OK'}
                        </span>
                      ) : (
                        <span className="inline-block text-[10px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                          Bekliyor
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {filteredPayrolls.length > 0 && (
              <tfoot>
                <tr className="bg-slate-100 dark:bg-slate-800/90 font-black text-slate-900 dark:text-slate-100 border-t-2 border-slate-300">
                  <td colSpan={6} className="py-3.5 px-3 text-right uppercase text-[10px] tracking-wider text-slate-600">
                    Genel İcmal Toplamı:
                  </td>
                  <td className="py-3.5 px-3 text-right font-mono">
                    ₺{stats.totalGross.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-3.5 px-3 text-right font-mono text-slate-700 dark:text-slate-200">
                    ₺{filteredPayrolls.reduce((s, p) => s + (p.employeeSgkShare || 0) + (p.employeeUnemploymentShare || 0), 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-3.5 px-3 text-right font-mono text-slate-700 dark:text-slate-200">
                    ₺{filteredPayrolls.reduce((s, p) => s + (p.incomeTax || 0) + (p.stampTax || 0), 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-3.5 px-3 text-right font-mono text-rose-700">
                    -₺{stats.totalAdvanceDeduction.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-3.5 px-3 text-right font-mono text-emerald-800 bg-emerald-100/60">
                    ₺{stats.totalNet.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-3.5 px-3 text-right font-mono text-slate-700 dark:text-slate-200">
                    ₺{stats.totalEmployerSgk.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-3.5 px-3 text-right font-mono text-purple-900 bg-purple-100/60">
                    ₺{stats.totalEmployerCost.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

    </div>
  );
}
