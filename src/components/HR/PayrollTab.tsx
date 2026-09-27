import React, { useState, useEffect, useRef } from 'react';
import {
  DollarSign,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Printer,
  BookOpen,
  Shield,
  Landmark,
  Banknote,
  Wallet,
  ShieldCheck,
  Receipt,
  FileSpreadsheet,
  FileDown,
  ChevronDown
} from 'lucide-react';
import DataGrid, { StatusPill, type GridColumn } from '../Common/DataGrid';
import type { Employee, PayrollRecord, HRModuleSettings } from '../../types';
import { hrService } from '../../services/hrService';
import { settingsService } from '../../services/settingsService';
import { exportPayrollToExcel, exportPayrollToCsv } from '../../lib/exportService';
import { buildPayrollPaymentSummary } from '../../lib/payrollSummary';
import PayrollSlipModal from './PayrollSlipModal';
import PayrollSummaryModal from './PayrollSummaryModal';

interface PayrollTabProps {
  employees: Employee[];
  onPayrollUpdated?: () => void;
}

const MONTH_NAMES = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
];

export default function PayrollTab({ employees, onPayrollUpdated }: PayrollTabProps) {
  const currentDate = new Date();
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1);
  const [payrolls, setPayrolls] = useState<PayrollRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [sgkFilter, setSgkFilter] = useState<'all' | 'sgk_li' | 'sgk_siz'>('all');
  const [accountingPayrollId, setAccountingPayrollId] = useState<number | null>(null);
  const [selectedPayrollForSlip, setSelectedPayrollForSlip] = useState<PayrollRecord | null>(null);
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const [hrParams, setHrParams] = useState<HRModuleSettings | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Close export dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setIsExportMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const loadPayrolls = async () => {
    try {
      setLoading(true);
      // Generate or fetch payrolls for this month
      const list = await hrService.generateMonthlyPayroll(selectedMonth, selectedYear);
      setPayrolls(list);
    } catch (err) {
      console.error('Bordrolar yüklenemedi:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPayrolls();
  }, [selectedMonth, selectedYear]);

  useEffect(() => {
    hrService.getHRParameters()
      .then(setHrParams)
      .catch(err => console.error('İK parametreleri okunamadı:', err));
  }, []);

  const handleRecalculate = async () => {
    try {
      setCalculating(true);
      setMessage(null);
      const list = await hrService.generateMonthlyPayroll(selectedMonth, selectedYear);
      setPayrolls(list);
      setMessage({ type: 'success', text: `${MONTH_NAMES[selectedMonth - 1]} ${selectedYear} bordroları puantaj ve avanslara göre güncellendi.` });
      onPayrollUpdated?.();
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Bordro hesaplanırken hata oluştu.' });
    } finally {
      setCalculating(false);
    }
  };

  const handleAccountPayroll = async (id: number) => {
    try {
      setAccountingPayrollId(id);
      await hrService.accountPayroll(id);
      await loadPayrolls();
      setMessage({ type: 'success', text: 'Bordro Genel Muhasebeye (TDHP) yevmiye fişi olarak aktarıldı.' });
      onPayrollUpdated?.();
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Muhasebeleştirme hatası.' });
    } finally {
      setAccountingPayrollId(null);
    }
  };

  // Navigations
  const prevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear(selectedYear - 1);
    } else {
      setSelectedMonth(selectedMonth - 1);
    }
  };

  const nextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear(selectedYear + 1);
    } else {
      setSelectedMonth(selectedMonth + 1);
    }
  };

  // Export handlers
  const handleExport = async (format: 'xls' | 'csv' = 'xls', filterScope: 'filtered' | 'all' = 'filtered') => {
    const listToExport = filterScope === 'all' 
      ? payrolls 
      : (sgkFilter === 'all' ? payrolls : payrolls.filter(p => p.sgkStatus === sgkFilter));

    if (listToExport.length === 0) {
      setMessage({ type: 'error', text: 'Dışa aktarılacak bordro kaydı bulunamadı. Lütfen önce bordroları hesaplayınız.' });
      return;
    }

    const filterScopeTitle = filterScope === 'all' 
      ? 'Tüm Personeller' 
      : (sgkFilter === 'sgk_li' ? 'SGK\'lı Personel Bordrosu' : sgkFilter === 'sgk_siz' ? 'Yevmiyeli Personel Bordrosu' : 'Tüm Personeller');

    if (format === 'xls') {
      const sysSettings = await settingsService.getSystemSettings();
      const companyName = sysSettings?.company?.companyTitle || sysSettings?.company?.companyName;
      exportPayrollToExcel(selectedMonth, selectedYear, listToExport, employees, { filterTitle: filterScopeTitle, companyName });
      setMessage({ type: 'success', text: `${MONTH_NAMES[selectedMonth - 1]} ${selectedYear} bordro icmali Excel (.xls) formatında başarıyla dışa aktarıldı (${listToExport.length} kayıt).` });
    } else {
      exportPayrollToCsv(selectedMonth, selectedYear, listToExport, employees);
      setMessage({ type: 'success', text: `${MONTH_NAMES[selectedMonth - 1]} ${selectedYear} bordro verileri CSV formatında dışa aktarıldı (${listToExport.length} kayıt).` });
    }
    setIsExportMenuOpen(false);
  };

  // Filtered Payrolls
  const filteredPayrolls = payrolls.filter(p => sgkFilter === 'all' || p.sgkStatus === sgkFilter);

  const payrollColumns: GridColumn<PayrollRecord>[] = [
    {
      key: 'employee',
      title: 'Personel',
      render: (rec) => (
        <div>
          <div className="font-bold text-slate-800 dark:text-slate-200">{rec.employeeName}</div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400">{rec.employeeCode} • {rec.department}</div>
        </div>
      ),
      filterValue: (rec) => `${rec.employeeName} ${rec.employeeCode} ${rec.department}`
    },
    {
      key: 'sgkStatus',
      title: 'SGK Tipi',
      align: 'center',
      render: (rec) => (
        <StatusPill tone={rec.sgkStatus === 'sgk_li' ? 'green' : 'amber'}>
          {rec.sgkStatus === 'sgk_li' ? 'SGK\'lı' : 'SGK\'sız / Yevmiyeli'}
        </StatusPill>
      ),
      filterValue: (rec) => rec.sgkStatus === 'sgk_li' ? 'SGKlı' : 'Yevmiyeli'
    },
    {
      key: 'daysWorked',
      title: 'Puantaj',
      align: 'center',
      render: (rec) => (
        <div>
          <div className="font-semibold text-slate-700 dark:text-slate-200">{rec.daysWorked} Gün</div>
          {rec.overtimeHours > 0 && (
            <div className="text-[10px] font-bold text-indigo-600">+{rec.overtimeHours} sa mesai</div>
          )}
        </div>
      ),
      filterValue: (rec) => String(rec.daysWorked)
    },
    {
      key: 'basePay',
      title: 'Taban / Hak Ediş',
      align: 'right',
      render: (rec) => (
        <span className="font-mono font-medium text-slate-700 dark:text-slate-200">
          ₺{rec.basePay.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
        </span>
      ),
      filterValue: (rec) => String(rec.basePay)
    },
    {
      key: 'overtimePay',
      title: 'Fazla Mesai',
      align: 'right',
      render: (rec) => (
        <span className="font-mono font-medium text-indigo-600">
          {rec.overtimePay > 0 ? `₺${rec.overtimePay.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` : '-'}
        </span>
      ),
      filterValue: (rec) => String(rec.overtimePay)
    },
    {
      key: 'totalLegalDeductions',
      title: 'Yasal Kesintiler',
      align: 'right',
      render: (rec) => (
        <span className="font-mono text-rose-600">
          {rec.totalLegalDeductions > 0 ? `-₺${rec.totalLegalDeductions.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` : '-'}
        </span>
      ),
      filterValue: (rec) => String(rec.totalLegalDeductions)
    },
    {
      key: 'advanceDeduction',
      title: 'Avans Kes.',
      align: 'right',
      render: (rec) => (
        <span className="font-mono text-rose-600">
          {rec.advanceDeduction > 0 ? `-₺${rec.advanceDeduction.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` : '-'}
        </span>
      ),
      filterValue: (rec) => String(rec.advanceDeduction)
    },
    {
      key: 'netSalary',
      title: 'Net Ödenecek',
      align: 'right',
      render: (rec) => (
        <span className="font-mono font-black text-slate-900 dark:text-slate-100">
          ₺{rec.netSalary.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
        </span>
      ),
      filterValue: (rec) => String(rec.netSalary)
    },
    {
      key: 'totalEmployerCost',
      title: 'İşveren Maliyeti',
      align: 'right',
      render: (rec) => (
        <span className="font-mono font-bold text-emerald-700">
          ₺{rec.totalEmployerCost.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
        </span>
      ),
      filterValue: (rec) => String(rec.totalEmployerCost)
    },
    {
      key: 'isAccounted',
      title: 'Muhasebe',
      align: 'center',
      filterable: false,
      render: (rec) =>
        rec.isAccounted ? (
          <StatusPill tone="green">İşlendi</StatusPill>
        ) : (
          <button
            onClick={() => handleAccountPayroll(rec.id!)}
            disabled={accountingPayrollId === rec.id}
            className="px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded text-[10px] font-bold border border-slate-300 transition-colors flex items-center gap-1 mx-auto disabled:opacity-50"
            title="Genel Muhasebe TDHP Yevmiye Fişi Oluştur"
          >
            <BookOpen className="w-3 h-3 text-indigo-600" />
            {accountingPayrollId === rec.id ? 'İşleniyor...' : 'Fiş Kes'}
          </button>
        )
    }
  ];

  // Aggregations: SGK'lı vs SGK'sız
  const sgkLiRecords = payrolls.filter(p => p.sgkStatus === 'sgk_li');
  const sgkSizRecords = payrolls.filter(p => p.sgkStatus === 'sgk_siz');

  // Ödeme özeti: banka/nakit dağılımı, SGK primleri ve vergiler
  const paymentSummary = buildPayrollPaymentSummary(payrolls, employees);

  const fmtRate = (n: number) => String(n).replace('.', ',');
  const sgkEmployeeRate = hrParams?.sgkEmployeeRate ?? 14;
  const unemploymentEmployeeRate = hrParams?.unemploymentEmployeeRate ?? 1;
  const sgkEmployerRate = hrParams?.sgkEmployerRate ?? 15.5;
  const unemploymentEmployerRate = hrParams?.unemploymentEmployerRate ?? 2;
  const incomeTaxRate = hrParams?.incomeTaxRate ?? 15;
  const stampTaxPerMille = hrParams?.stampTaxPerMille ?? 7.59;

  return (
    <div className="space-y-6">
      {/* Top Controls */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="flex items-center gap-2">
          <button
            onClick={prevMonth}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:bg-slate-800/50 text-slate-600 transition-colors cursor-pointer"
            title="Önceki Ay"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg">
            <Calendar className="w-4 h-4 text-indigo-600" />
            <span className="text-sm font-black text-slate-800 dark:text-slate-200 tracking-wide">
              {MONTH_NAMES[selectedMonth - 1]} {selectedYear} Bordrosu
            </span>
          </div>
          <button
            onClick={nextMonth}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:bg-slate-800/50 text-slate-600 transition-colors cursor-pointer"
            title="Sonraki Ay"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Filter & Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5 text-xs w-full lg:w-auto">
          {/* SGK Status Filter */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
            <button
              onClick={() => setSgkFilter('all')}
              className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                sgkFilter === 'all' ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 shadow-xs' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200'
              }`}
            >
              Tümü ({payrolls.length})
            </button>
            <button
              onClick={() => setSgkFilter('sgk_li')}
              className={`px-2.5 py-1 rounded-md font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
                sgkFilter === 'sgk_li' ? 'bg-white dark:bg-slate-900 text-emerald-700 shadow-xs' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200'
              }`}
            >
              <Shield className="w-3 h-3 text-emerald-600" />
              SGK'lı ({sgkLiRecords.length})
            </button>
            <button
              onClick={() => setSgkFilter('sgk_siz')}
              className={`px-2.5 py-1 rounded-md font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
                sgkFilter === 'sgk_siz' ? 'bg-white dark:bg-slate-900 text-amber-700 shadow-xs' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200'
              }`}
            >
              <DollarSign className="w-3 h-3 text-amber-600" />
              Yevmiyeli ({sgkSizRecords.length})
            </button>
          </div>

          {/* Excel Export Button with Dropdown */}
          <div className="relative" ref={exportMenuRef}>
            <div className="flex items-center">
              <button
                onClick={() => handleExport('xls', 'filtered')}
                disabled={payrolls.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-l-lg font-bold text-xs shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                title={`${MONTH_NAMES[selectedMonth - 1]} ${selectedYear} bordro icmalini Excel (.xls) olarak indir`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Bordroyu Excel'e Aktar</span>
              </button>
              <button
                onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
                disabled={payrolls.length === 0}
                className="px-1.5 py-1.5 bg-emerald-800 hover:bg-emerald-900 text-white rounded-r-lg border-l border-emerald-600 transition-colors cursor-pointer disabled:opacity-50"
                title="Dışa aktarma seçenekleri"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Dropdown Options */}
            {isExportMenuOpen && (
              <div className="absolute right-0 mt-1.5 w-64 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 py-1.5 z-50 text-xs animate-in fade-in zoom-in-95">
                <div className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  Bordro Dışa Aktarma Seçenekleri
                </div>

                <button
                  onClick={() => handleExport('xls', 'filtered')}
                  className="w-full px-3 py-2 text-left flex items-start gap-2 hover:bg-slate-50 dark:bg-slate-800/50 text-slate-800 dark:text-slate-200 transition-colors cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-slate-900 dark:text-slate-100">Excel İcmal Tablosu (.xls)</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">Biçimlendirilmiş, tüm yasal kesintiler ve toplamlar</div>
                  </div>
                </button>

                <button
                  onClick={() => handleExport('csv', 'filtered')}
                  className="w-full px-3 py-2 text-left flex items-start gap-2 hover:bg-slate-50 dark:bg-slate-800/50 text-slate-800 dark:text-slate-200 transition-colors cursor-pointer"
                >
                  <FileDown className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-slate-900 dark:text-slate-100">CSV Tablosu (.csv)</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">Standart UTF-8 BOM virgüllü veri seti</div>
                  </div>
                </button>

                {sgkFilter !== 'all' && (
                  <button
                    onClick={() => handleExport('xls', 'all')}
                    className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer border-t border-slate-100 dark:border-slate-800 font-semibold"
                  >
                    <Shield className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span>Tüm Personelleri Dahil Et ({payrolls.length})</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Recalculate Button */}
          <button
            onClick={handleRecalculate}
            disabled={calculating}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-xs shadow-indigo-200 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {calculating ? 'Hesaplanıyor...' : 'Yeniden Hesapla'}
          </button>
        </div>
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-xs font-medium border flex items-center justify-between ${
          message.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'
        }`}>
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="font-bold ml-2">✕</button>
        </div>
      )}

      {/* Bordro Ödeme Özeti: Banka / Nakit dağılımı, SGK primleri ve vergiler */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-indigo-600" />
            <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">
              Bordro Ödeme Özeti ({MONTH_NAMES[selectedMonth - 1]} {selectedYear})
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700 dark:text-slate-200">
              {payrolls.length} Personel
            </span>
          </div>
          <button
            onClick={() => setIsSummaryOpen(true)}
            disabled={payrolls.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-xs shadow-indigo-200 transition-colors disabled:opacity-40 cursor-pointer"
            title="Yazdırılabilir ödeme özet raporunu açar"
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>Ödeme Özeti Raporu</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-slate-100 dark:divide-slate-800">

          {/* 1. Ödeme Dağılımı: Banka (SGK'lı) vs Nakit (SGK'sız) */}
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
                <Wallet className="w-4 h-4" />
              </span>
              <h4 className="font-bold text-xs text-slate-800 dark:text-slate-200">ÖDEME DAĞILIMI</h4>
            </div>

            <div className="space-y-2">
              <div className="p-3 rounded-lg border border-emerald-200 bg-emerald-50/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-emerald-100 text-emerald-700 rounded">
                    <Landmark className="w-3.5 h-3.5" />
                  </span>
                  <div>
                    <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200">Bankaya Yatacak</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">{paymentSummary.bank.count} personel · SGK'lı</p>
                  </div>
                </div>
                <span className="font-mono font-bold text-sm text-emerald-700">
                  ₺{paymentSummary.bank.netTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="p-3 rounded-lg border border-amber-200 bg-amber-50/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-amber-100 text-amber-700 rounded">
                    <Banknote className="w-3.5 h-3.5" />
                  </span>
                  <div>
                    <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200">Nakit Ödenecek</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">{paymentSummary.cash.count} personel · SGK'sız / Yevmiyeli</p>
                  </div>
                </div>
                <span className="font-mono font-bold text-sm text-amber-700">
                  ₺{paymentSummary.cash.netTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-slate-100 dark:border-slate-800">
              <span className="font-black text-xs text-slate-900 dark:text-slate-100">TOPLAM ÖDENECEK NET</span>
              <span className="font-mono font-black text-base text-slate-900 dark:text-slate-100">
                ₺{paymentSummary.totalNet.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
              </span>
            </div>
            {paymentSummary.advanceTotal > 0 && (
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                Mahsup edilen avans (netten düşülmüş): ₺{paymentSummary.advanceTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
              </p>
            )}
          </div>

          {/* 2. SGK'ya Ödenecek Primler */}
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
                <ShieldCheck className="w-4 h-4" />
              </span>
              <h4 className="font-bold text-xs text-slate-800 dark:text-slate-200">SGK'YA ÖDENECEK PRİMLER</h4>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Sigorta Primi İşçi Payı (%{fmtRate(sgkEmployeeRate)})</span>
                <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                  ₺{paymentSummary.sgkEmployeeShare.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>İşsizlik Sigortası İşçi Payı (%{fmtRate(unemploymentEmployeeRate)})</span>
                <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                  ₺{paymentSummary.unemploymentEmployeeShare.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Sigorta Primi İşveren Payı (%{fmtRate(sgkEmployerRate)})</span>
                <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                  ₺{paymentSummary.sgkEmployerShare.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>İşsizlik Sigortası İşveren Payı (%{fmtRate(unemploymentEmployerRate)})</span>
                <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                  ₺{paymentSummary.unemploymentEmployerShare.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-slate-100 dark:border-slate-800">
              <span className="font-black text-xs text-slate-900 dark:text-slate-100">TOPLAM SGK PRİMİ</span>
              <span className="font-mono font-black text-base text-indigo-700">
                ₺{paymentSummary.totalSgkPremium.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">
              {paymentSummary.sgkLiCount} SGK'lı personel · APHB ile beyan edilir (işçi payı maaştan kesilir, işveren payı ek maliyettir).
            </p>
          </div>

          {/* 3. Vergi Dairesine Ödenecek + Genel Toplam */}
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
                <Receipt className="w-4 h-4" />
              </span>
              <h4 className="font-bold text-xs text-slate-800 dark:text-slate-200">VERGİ DAİRESİNE ÖDENECEK</h4>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Gelir Vergisi Stopajı (%{fmtRate(incomeTaxRate)})</span>
                <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                  ₺{paymentSummary.incomeTax.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Damga Vergisi (binde {fmtRate(stampTaxPerMille)})</span>
                <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                  ₺{paymentSummary.stampTax.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-slate-100 dark:border-slate-800">
              <span className="font-black text-xs text-slate-900 dark:text-slate-100">TOPLAM VERGİ</span>
              <span className="font-mono font-black text-base text-rose-600">
                ₺{paymentSummary.totalTaxes.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="p-3 bg-slate-900 text-white rounded-lg space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-300">
                <span>Toplam Brüt Kazanç</span>
                <span className="font-mono font-bold text-white">
                  ₺{paymentSummary.totalGrossPay.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between pt-1.5 border-t border-slate-800">
                <span className="font-black text-slate-200">Toplam İşveren Maliyeti</span>
                <span className="font-mono font-black text-emerald-400">
                  ₺{paymentSummary.totalEmployerCost.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Payroll Records Table */}
      <DataGrid
        columns={payrollColumns}
        data={filteredPayrolls}
        rowKey={(rec) => rec.id ?? `${rec.employeeId}-${rec.month}-${rec.year}`}
        loading={loading}
        maxHeight="560px"
        emptyMessage={
          payrolls.length === 0
            ? 'Henüz bordro hesabı yapılmadı. Yukarıdaki "Bordroları Yeniden Hesapla" butonuna tıklayınız.'
            : 'Seçili filtreye uygun bordro kaydı bulunamadı.'
        }
        toolbar={
          <>
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-indigo-600" />
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">
                Personel Bordro & Hakediş Listesi ({MONTH_NAMES[selectedMonth - 1]} {selectedYear})
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700 dark:text-slate-200">
                {filteredPayrolls.length} Kayıt
              </span>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={() => handleExport('xls', 'filtered')}
                disabled={filteredPayrolls.length === 0}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 transition-colors disabled:opacity-40 cursor-pointer"
                title="Listeyi Excel olarak indir"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Excel (.xls)</span>
              </button>
              <button
                onClick={() => handleExport('csv', 'filtered')}
                disabled={filteredPayrolls.length === 0}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors disabled:opacity-40 cursor-pointer"
                title="Listeyi CSV olarak indir"
              >
                <FileDown className="w-3.5 h-3.5" />
                <span>CSV</span>
              </button>
            </div>
          </>
        }
        rowActions={(rec) => (
          <button
            onClick={() => setSelectedPayrollForSlip(rec)}
            className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-700 rounded-md text-xs font-semibold border border-slate-300 transition-colors inline-flex items-center gap-1"
          >
            <Printer className="w-3.5 h-3.5" />
            Pusula
          </button>
        )}
      />

      {/* Slip Modal */}
      {selectedPayrollForSlip && (
        <PayrollSlipModal
          isOpen={!!selectedPayrollForSlip}
          onClose={() => setSelectedPayrollForSlip(null)}
          payroll={selectedPayrollForSlip}
          employee={employees.find(e => e.id === selectedPayrollForSlip.employeeId)}
        />
      )}

      <PayrollSummaryModal
        isOpen={isSummaryOpen}
        onClose={() => setIsSummaryOpen(false)}
        month={selectedMonth}
        year={selectedYear}
        payrolls={payrolls}
        employees={employees}
        summary={paymentSummary}
      />
    </div>
  );
}
