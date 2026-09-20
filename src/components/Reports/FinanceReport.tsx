import React, { useState, useMemo, useEffect } from 'react';
import { api } from '../../api/client';
import { useApiQuery } from '../../hooks/useApiQuery';
import { 
  Landmark, 
  Wallet, 
  CreditCard, 
  Search, 
  Printer, 
  FileDown, 
  Filter, 
  Calendar, 
  ArrowDownLeft, 
  ArrowUpRight, 
  Clock, 
  CheckCircle2, 
  AlertTriangle,
  Building2,
  TrendingUp,
  AlertCircle,
  FileText,
  DollarSign,
  ChevronRight,
  Eye
} from 'lucide-react';
import { printTabularReport } from '../../lib/printService';
import { exportToCsv } from '../../lib/exportService';
import { financeService } from '../../services/financeService';
import { turkishIncludes } from '../../lib/turkishUtils';
import CashStatementModal from '../Finance/CashStatementModal';
import BankStatementModal from '../Finance/BankStatementModal';
import CheckHistoryModal from '../Finance/CheckHistoryModal';
import { cn } from '../../lib/utils';
import type { CheckNote, CashBox, BankAccount, AccountStatement } from '../../types';

export default function FinanceReport() {
  const [activeTab, setActiveTab] = useState<'liquidity' | 'cash' | 'bank' | 'checks'>('liquidity');
  
  // Queries
  const cashBoxes = useApiQuery(() => api.cashBoxes.list(), [], ['cashBoxes']) || [];
  const bankAccounts = useApiQuery(() => api.bankAccounts.list(), [], ['bankAccounts']) || [];
  const checks = useApiQuery(() => api.checks.list({ orderBy: 'dueDate' }), [], ['checks']) || [];
  const contacts = useApiQuery(() => api.contacts.list(), [], ['contacts']) || [];

  const contactMap = useMemo(() => {
    return new Map((contacts || []).filter(c => c && c.id != null).map(c => [c.id!, c.name || '']));
  }, [contacts]);

  // Modal State
  const [selectedCashBoxModal, setSelectedCashBoxModal] = useState<CashBox | null>(null);
  const [selectedBankAccountModal, setSelectedBankAccountModal] = useState<BankAccount | null>(null);
  const [selectedCheckModal, setSelectedCheckModal] = useState<CheckNote | null>(null);

  // Filters for Cash Tab
  const [selectedCashBoxId, setSelectedCashBoxId] = useState<number | 'all'>('all');
  const [cashStartDate, setCashStartDate] = useState('');
  const [cashEndDate, setCashEndDate] = useState('');
  const [cashStatementData, setCashStatementData] = useState<any>(null);
  const [isLoadingCash, setIsLoadingCash] = useState(false);

  // Filters for Bank Tab
  const [selectedBankAccountId, setSelectedBankAccountId] = useState<number | 'all'>('all');
  const [bankStartDate, setBankStartDate] = useState('');
  const [bankEndDate, setBankEndDate] = useState('');
  const [bankStatementData, setBankStatementData] = useState<any>(null);
  const [isLoadingBank, setIsLoadingBank] = useState(false);

  // Filters for Checks Tab
  const [checkSearchTerm, setCheckSearchTerm] = useState('');
  const [checkTypeFilter, setCheckTypeFilter] = useState<'all' | 'received' | 'given'>('all');
  const [checkStatusFilter, setCheckStatusFilter] = useState<string>('all');
  const [checkAgingFilter, setCheckAgingFilter] = useState<'all' | 'overdue' | '0-30' | '31-60' | '61-90' | '90+'>('all');

  // Load Cash Statement when filters change
  useEffect(() => {
    if (activeTab !== 'cash') return;
    let isMounted = true;
    setIsLoadingCash(true);

    const loadData = async () => {
      try {
        const filters = {
          startDate: cashStartDate ? new Date(cashStartDate) : undefined,
          endDate: cashEndDate ? new Date(cashEndDate) : undefined
        };
        if (selectedCashBoxId === 'all') {
          // If all cash boxes, aggregate first box or general
          if (cashBoxes.length > 0) {
            const data = await financeService.getCashBoxStatement(cashBoxes[0].id!, filters);
            if (isMounted) setCashStatementData(data);
          } else {
            if (isMounted) setCashStatementData(null);
          }
        } else {
          const data = await financeService.getCashBoxStatement(selectedCashBoxId, filters);
          if (isMounted) setCashStatementData(data);
        }
      } catch (err) {
        console.error('Error loading cash statement:', err);
      } finally {
        if (isMounted) setIsLoadingCash(false);
      }
    };

    loadData();
    return () => { isMounted = false; };
  }, [activeTab, selectedCashBoxId, cashStartDate, cashEndDate, cashBoxes]);

  // Load Bank Statement when filters change
  useEffect(() => {
    if (activeTab !== 'bank') return;
    let isMounted = true;
    setIsLoadingBank(true);

    const loadData = async () => {
      try {
        const filters = {
          startDate: bankStartDate ? new Date(bankStartDate) : undefined,
          endDate: bankEndDate ? new Date(bankEndDate) : undefined
        };
        if (selectedBankAccountId === 'all') {
          if (bankAccounts.length > 0) {
            const data = await financeService.getBankAccountStatement(bankAccounts[0].id!, filters);
            if (isMounted) setBankStatementData(data);
          } else {
            if (isMounted) setBankStatementData(null);
          }
        } else {
          const data = await financeService.getBankAccountStatement(selectedBankAccountId, filters);
          if (isMounted) setBankStatementData(data);
        }
      } catch (err) {
        console.error('Error loading bank statement:', err);
      } finally {
        if (isMounted) setIsLoadingBank(false);
      }
    };

    loadData();
    return () => { isMounted = false; };
  }, [activeTab, selectedBankAccountId, bankStartDate, bankEndDate, bankAccounts]);

  // Overall Statistics
  const stats = useMemo(() => {
    const totalCash = cashBoxes.reduce((sum, c) => sum + (c.balance || 0), 0);
    const totalBank = bankAccounts.reduce((sum, b) => sum + (b.balance || 0), 0);
    const totalLiquidity = totalCash + totalBank;

    // Checks stats
    const activeCustomerChecks = checks.filter(c => c.type.startsWith('received') && (c.status === 'portfolio' || c.status === 'bank_collection'));
    const activeSupplierChecks = checks.filter(c => c.type.startsWith('given') && c.status === 'portfolio');

    const totalCustomerChecks = activeCustomerChecks.reduce((sum, c) => sum + (c.amount || 0), 0);
    const totalSupplierChecks = activeSupplierChecks.reduce((sum, c) => sum + (c.amount || 0), 0);

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    let overdueChecksAmount = 0;
    let overdueChecksCount = 0;
    let checks0to30 = 0;
    let checks31to60 = 0;
    let checks61to90 = 0;
    let checks90Plus = 0;

    activeCustomerChecks.forEach(c => {
      const due = new Date(c.dueDate);
      due.setHours(0, 0, 0, 0);
      const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays < 0) {
        overdueChecksAmount += c.amount;
        overdueChecksCount++;
      } else if (diffDays <= 30) {
        checks0to30 += c.amount;
      } else if (diffDays <= 60) {
        checks31to60 += c.amount;
      } else if (diffDays <= 90) {
        checks61to90 += c.amount;
      } else {
        checks90Plus += c.amount;
      }
    });

    return {
      totalCash,
      totalBank,
      totalLiquidity,
      totalCustomerChecks,
      totalSupplierChecks,
      netPosition: totalLiquidity + totalCustomerChecks - totalSupplierChecks,
      overdueChecksAmount,
      overdueChecksCount,
      checks0to30,
      checks31to60,
      checks61to90,
      checks90Plus
    };
  }, [cashBoxes, bankAccounts, checks]);

  // Filtered checks
  const filteredChecks = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    return checks.filter(c => {
      const contactName = contactMap.get(c.contactId) || c.contactName || c.drawer || '';
      const matchesSearch = 
        turkishIncludes(c.serialNumber, checkSearchTerm) ||
        turkishIncludes(c.portfolioNumber, checkSearchTerm) ||
        turkishIncludes(contactName, checkSearchTerm) ||
        turkishIncludes(c.bankName, checkSearchTerm);

      const isReceived = c.type.startsWith('received');
      const isGiven = c.type.startsWith('given');
      const matchesType = 
        checkTypeFilter === 'all' || 
        (checkTypeFilter === 'received' && isReceived) || 
        (checkTypeFilter === 'given' && isGiven);
      const matchesStatus = checkStatusFilter === 'all' || c.status === checkStatusFilter;

      const due = new Date(c.dueDate);
      due.setHours(0, 0, 0, 0);
      const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      let matchesAging = true;
      if (checkAgingFilter === 'overdue') matchesAging = diffDays < 0;
      else if (checkAgingFilter === '0-30') matchesAging = diffDays >= 0 && diffDays <= 30;
      else if (checkAgingFilter === '31-60') matchesAging = diffDays > 30 && diffDays <= 60;
      else if (checkAgingFilter === '61-90') matchesAging = diffDays > 60 && diffDays <= 90;
      else if (checkAgingFilter === '90+') matchesAging = diffDays > 90;

      return matchesSearch && matchesType && matchesStatus && matchesAging;
    });
  }, [checks, checkSearchTerm, checkTypeFilter, checkStatusFilter, checkAgingFilter, contactMap]);

  // Print Liquidity Report
  const handlePrintLiquidity = () => {
    const headers = ['HESAP TÜRÜ', 'HESAP / KASA ADI', 'DETAY / IBAN / ŞUBE', 'PARA BİRİMİ', 'BAKİYE (₺)'];
    const rows = [
      ...cashBoxes.map(c => [
        'KASA',
        c.name,
        c.code || 'Nakit Kasa',
        c.currency || 'TRY',
        c.balance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })
      ]),
      ...bankAccounts.map(b => [
        'BANKA',
        b.bankName,
        `${b.branchName || ''} - IBAN: ${b.iban || '-'}`,
        b.currency || 'TRY',
        b.balance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })
      ])
    ];

    printTabularReport(
      'Nakit & Banka Likidite Durum Raporu',
      'Şirket mevcut kasa ve banka mevduat bakiyeleri genel dökümü',
      headers,
      rows,
      [
        { label: 'Kasa Nakit Toplamı', value: `₺${stats.totalCash.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` },
        { label: 'Banka Mevduat Toplamı', value: `₺${stats.totalBank.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` },
        { label: 'Genel Likidite Toplamı', value: `₺${stats.totalLiquidity.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` }
      ]
    );
  };

  // Print Checks Report
  const handlePrintChecks = () => {
    if (filteredChecks.length === 0) return;

    const headers = ['PORTFÖY NO', 'TÜR', 'ÇEK / SENET NO', 'BANKA / ŞUBE', 'KEŞİDECİ / CARİ', 'VADE TARİHİ', 'KALAN GÜN', 'TUTAR (₺)', 'DURUM'];
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const rows = filteredChecks.map(c => {
      const due = new Date(c.dueDate);
      due.setHours(0, 0, 0, 0);
      const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const contactName = contactMap.get(c.contactId) || c.contactName || c.drawer || '-';

      return [
        c.portfolioNumber || '-',
        c.type === 'received_check' ? 'Alınan Çek' : c.type === 'given_check' ? 'Verilen Çek' : c.type === 'received_note' ? 'Alınan Senet' : 'Verilen Senet',
        c.serialNumber || '-',
        `${c.bankName || ''} ${c.branchName ? `(${c.branchName})` : ''}`,
        contactName,
        due.toLocaleDateString('tr-TR'),
        diffDays < 0 ? `Geçti (${Math.abs(diffDays)} gün)` : `${diffDays} gün`,
        c.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 }),
        c.status === 'portfolio' ? 'Portföyde' : c.status === 'bank_collection' ? 'Tahsilde' : c.status === 'collected' ? 'Tahsil Edildi' : c.status === 'endorsed' ? 'Ciro Edildi' : 'Karşılıksız'
      ];
    });

    printTabularReport(
      'Çek & Senet Portföy ve Vade Yaşlandırma Raporu',
      'Müşteri portföy çekleri ve ödenecek borç senetleri vade dökümü',
      headers,
      rows,
      [
        { label: 'Alınan Müşteri Çekleri', value: `₺${stats.totalCustomerChecks.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` },
        { label: 'Verilen Borç Çekleri', value: `₺${stats.totalSupplierChecks.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` },
        { label: 'Vadesi Geçmiş Portföy', value: `₺${stats.overdueChecksAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` },
        { label: 'Net Likidite Pozisyonu', value: `₺${stats.netPosition.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` }
      ]
    );
  };

  // Export to Excel CSV
  const handleExportChecksCsv = () => {
    if (filteredChecks.length === 0) return;

    const headers = [
      'Portföy No',
      'Çek/Senet Türü',
      'Seri Numarası',
      'Banka Adı',
      'Şube',
      'Keşideci',
      'İlgili Cari Hesap',
      'Vade Tarihi',
      'Tutar (TL)',
      'Para Birimi',
      'Durum'
    ];

    const rows = filteredChecks.map(c => [
      c.portfolioNumber || '',
      c.type === 'received_check' ? 'Alınan Çek' : c.type === 'given_check' ? 'Verilen Çek' : c.type === 'received_note' ? 'Alınan Senet' : 'Verilen Senet',
      c.serialNumber || '',
      c.bankName || '',
      c.branchName || '',
      c.drawer || '',
      contactMap.get(c.contactId) || c.contactName || '',
      new Date(c.dueDate).toLocaleDateString('tr-TR'),
      c.amount.toFixed(2),
      c.currency || 'TRY',
      c.status
    ]);

    exportToCsv(`Cek_Senet_Portfoy_Raporu_${new Date().toISOString().split('T')[0]}.csv`, headers, rows);
  };

  const getCheckStatusBadge = (status: string) => {
    switch (status) {
      case 'portfolio':
        return <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">Portföyde</span>;
      case 'bank_collection':
        return <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-900 border border-blue-300">Tahsilde</span>;
      case 'collected':
        return <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 border border-emerald-300">Tahsil Edildi</span>;
      case 'endorsed':
        return <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-900 border border-indigo-300">Ciro Edildi</span>;
      case 'bounced':
        return <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-900 border border-rose-300">Karşılıksız</span>;
      default:
        return <span className="inline-block text-[10px] font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-800">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Üst Bar & Sekme Seçimi */}
      <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        
        <div className="flex flex-wrap items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl gap-1">
          <button
            onClick={() => setActiveTab('liquidity')}
            className={cn(
              "flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer",
              activeTab === 'liquidity' ? "bg-white dark:bg-slate-900 text-indigo-700 shadow-xs" : "text-slate-600 hover:text-slate-900 dark:text-slate-100"
            )}
          >
            <Wallet className="w-4 h-4 text-emerald-600" />
            Likidite Durumu
          </button>

          <button
            onClick={() => setActiveTab('cash')}
            className={cn(
              "flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer",
              activeTab === 'cash' ? "bg-white dark:bg-slate-900 text-indigo-700 shadow-xs" : "text-slate-600 hover:text-slate-900 dark:text-slate-100"
            )}
          >
            <DollarSign className="w-4 h-4 text-emerald-600" />
            Kasa Ekstreleri & Hareketleri
          </button>

          <button
            onClick={() => setActiveTab('bank')}
            className={cn(
              "flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer",
              activeTab === 'bank' ? "bg-white dark:bg-slate-900 text-indigo-700 shadow-xs" : "text-slate-600 hover:text-slate-900 dark:text-slate-100"
            )}
          >
            <Landmark className="w-4 h-4 text-blue-600" />
            Banka Ekstreleri & Hareketleri
          </button>

          <button
            onClick={() => setActiveTab('checks')}
            className={cn(
              "flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer",
              activeTab === 'checks' ? "bg-white dark:bg-slate-900 text-indigo-700 shadow-xs" : "text-slate-600 hover:text-slate-900 dark:text-slate-100"
            )}
          >
            <CreditCard className="w-4 h-4 text-indigo-600" />
            Çek & Senet Vade Yaşlandırma ({checks.length})
          </button>
        </div>

        <div className="flex items-center gap-2.5">
          {activeTab === 'liquidity' && (
            <button
              onClick={handlePrintLiquidity}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-xl transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4 text-slate-600" />
              Yazdır (A4)
            </button>
          )}

          {activeTab === 'checks' && (
            <>
              <button
                onClick={handlePrintChecks}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                <Printer className="w-4 h-4 text-slate-600" />
                Yazdır (A4)
              </button>
              <button
                onClick={handleExportChecksCsv}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                <FileDown className="w-4 h-4" />
                Excel'e Aktar
              </button>
            </>
          )}
        </div>

      </div>

      {/* KPI KARTLARI (GENEL FİNANSAL POZİSYON) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Nakit & Banka Likidite</span>
            <Wallet className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-700 font-mono">
            ₺{stats.totalLiquidity.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-1">
            Kasa: ₺{stats.totalCash.toLocaleString('tr-TR')} • Banka: ₺{stats.totalBank.toLocaleString('tr-TR')}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Alınan Müşteri Çekleri</span>
            <ArrowDownLeft className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-black text-blue-700 font-mono">
            ₺{stats.totalCustomerChecks.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-1">
            Portföy / Tahsildeki Çek & Senetler
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Verilen Borç Çekleri</span>
            <ArrowUpRight className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-black text-rose-700 font-mono">
            ₺{stats.totalSupplierChecks.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-1">
            Ödenecek Firma Çekleri
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Net Likidite Pozisyonu</span>
            <TrendingUp className="w-4 h-4 text-purple-600" />
          </div>
          <div className={cn(
            "text-2xl font-black font-mono",
            stats.netPosition >= 0 ? "text-purple-800" : "text-rose-700"
          )}>
            ₺{stats.netPosition.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-1">
            (Nakit + Alınan Çek) - Borç Çeki
          </div>
        </div>

      </div>

      {/* TAB 1: LİKİDİTE ÖZETİ */}
      {activeTab === 'liquidity' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Kasa Bakiyeleri */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50/50">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                  <Wallet className="w-4 h-4" />
                </div>
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-slate-100">
                  Nakit Kasalar ({cashBoxes.length})
                </h3>
              </div>
              <span className="text-xs font-black text-emerald-700 font-mono">
                ₺{stats.totalCash.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50/80 border-b border-slate-100 dark:border-slate-800 text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-wider">
                  <th className="py-2.5 px-4">Kasa Adı</th>
                  <th className="py-2.5 px-4">Kod / TDHP</th>
                  <th className="py-2.5 px-4 text-right">Bakiye</th>
                  <th className="py-2.5 px-4 text-center">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cashBoxes.map(c => (
                  <tr key={c.id} className="hover:bg-slate-50 dark:bg-slate-800/50">
                    <td className="py-3 px-4 font-bold text-slate-900 dark:text-slate-100">{c.name}</td>
                    <td className="py-3 px-4 text-slate-500 dark:text-slate-400 font-mono text-[11px]">{c.code || c.accountCode || '-'}</td>
                    <td className="py-3 px-4 text-right font-mono font-black text-slate-900 dark:text-slate-100">
                      ₺{c.balance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => setSelectedCashBoxModal(c)}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                      >
                        <FileText className="w-3 h-3 text-emerald-600" />
                        Ekstre Aç
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Banka Hesap Bakiyeleri */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50/50">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                  <Landmark className="w-4 h-4" />
                </div>
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-slate-100">
                  Banka Mevduat Hesapları ({bankAccounts.length})
                </h3>
              </div>
              <span className="text-xs font-black text-blue-700 font-mono">
                ₺{stats.totalBank.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50/80 border-b border-slate-100 dark:border-slate-800 text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-wider">
                  <th className="py-2.5 px-4">Banka & Şube</th>
                  <th className="py-2.5 px-4">IBAN</th>
                  <th className="py-2.5 px-4 text-right">Bakiye</th>
                  <th className="py-2.5 px-4 text-center">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bankAccounts.map(b => (
                  <tr key={b.id} className="hover:bg-slate-50 dark:bg-slate-800/50">
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900 dark:text-slate-100">{b.bankName}</div>
                      <div className="text-[10px] text-slate-400">{b.branchName || 'Merkez'}</div>
                    </td>
                    <td className="py-3 px-4 font-mono text-[10px] text-slate-600">{b.iban || '-'}</td>
                    <td className="py-3 px-4 text-right font-mono font-black text-slate-900 dark:text-slate-100">
                      ₺{b.balance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => setSelectedBankAccountModal(b)}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                      >
                        <FileText className="w-3 h-3 text-blue-600" />
                        Ekstre Aç
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>
      )}

      {/* TAB 2: KASA EKSTRELERİ & HAREKET RAPORU */}
      {activeTab === 'cash' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs overflow-hidden space-y-4 p-5">
          
          {/* FİLTRE VE SEÇİMLER */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-gray-100">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <label className="block text-[11px] font-bold text-gray-500 mb-1 uppercase">Kasa Seçimi</label>
                <select
                  value={selectedCashBoxId}
                  onChange={(e) => setSelectedCashBoxId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                  className="text-xs font-semibold border border-gray-300 rounded-lg px-3 py-2 bg-white dark:bg-slate-900 text-gray-800 focus:ring-2 focus:ring-emerald-500/20"
                >
                  {cashBoxes.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.code || '100.01'}) - ₺{c.balance.toLocaleString('tr-TR')}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-500 mb-1 uppercase">Başlangıç Tarihi</label>
                <input
                  type="date"
                  value={cashStartDate}
                  onChange={(e) => setCashStartDate(e.target.value)}
                  className="text-xs font-medium border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-900 text-gray-800 focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-500 mb-1 uppercase">Bitiş Tarihi</label>
                <input
                  type="date"
                  value={cashEndDate}
                  onChange={(e) => setCashEndDate(e.target.value)}
                  className="text-xs font-medium border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-900 text-gray-800 focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              {(cashStartDate || cashEndDate) && (
                <div className="flex items-end">
                  <button
                    onClick={() => { setCashStartDate(''); setCashEndDate(''); }}
                    className="text-xs text-rose-600 hover:text-rose-800 font-semibold py-2 cursor-pointer"
                  >
                    Tarihi Temizle
                  </button>
                </div>
              )}
            </div>

            {cashStatementData && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const currentBox = cashBoxes.find(c => c.id === (selectedCashBoxId === 'all' ? cashBoxes[0]?.id : selectedCashBoxId));
                    if (currentBox) setSelectedCashBoxModal(currentBox);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  <Eye className="w-4 h-4" />
                  Tam Ekran & Yazdır
                </button>
              </div>
            )}
          </div>

          {/* KASA ÖZET KARTLARI */}
          {cashStatementData && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
              <div>
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Devir Bakiyesi</span>
                <p className="text-base font-bold text-gray-800 font-mono mt-0.5">
                  ₺{cashStatementData.initialBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div>
                <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Toplam Giriş (Tahsilat)</span>
                <p className="text-base font-bold text-emerald-700 font-mono mt-0.5">
                  +₺{cashStatementData.totalDebit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div>
                <span className="text-[10px] font-bold text-rose-700 uppercase tracking-wider">Toplam Çıkış (Ödeme)</span>
                <p className="text-base font-bold text-rose-700 font-mono mt-0.5">
                  -₺{cashStatementData.totalCredit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div>
                <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider">Kapanış Bakiyesi</span>
                <p className="text-lg font-black text-indigo-800 font-mono mt-0.5">
                  ₺{cashStatementData.closingBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          )}

          {/* KASA HAREKET TABLOSU */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-wider">
                  <th className="py-2.5 px-3">Tarih</th>
                  <th className="py-2.5 px-3">Belge No</th>
                  <th className="py-2.5 px-3">İşlem Türü</th>
                  <th className="py-2.5 px-3">Açıklama</th>
                  <th className="py-2.5 px-3">Muhatap / Cari</th>
                  <th className="py-2.5 px-3 text-right">Giriş (Borç ₺)</th>
                  <th className="py-2.5 px-3 text-right">Çıkış (Alacak ₺)</th>
                  <th className="py-2.5 px-3 text-right">Bakiye (₺)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {isLoadingCash ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-gray-400 font-medium">Yükleniyor...</td>
                  </tr>
                ) : !cashStatementData || cashStatementData.items.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-gray-400">
                      Bu tarih aralığında kasa hareketi bulunmamaktadır.
                    </td>
                  </tr>
                ) : (
                  <>
                    <tr className="bg-slate-50 dark:bg-slate-800/50/60 font-semibold text-gray-600">
                      <td className="py-2 px-3">{cashStartDate ? new Date(cashStartDate).toLocaleDateString('tr-TR') : '-'}</td>
                      <td className="py-2 px-3">-</td>
                      <td className="py-2 px-3 text-[10px] uppercase font-bold text-gray-500">DEVİR</td>
                      <td className="py-2 px-3 italic text-gray-500" colSpan={2}>Dönem Başı Devir Bakiyesi</td>
                      <td className="py-2 px-3 text-right">{cashStatementData.initialBalance > 0 ? `₺${cashStatementData.initialBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` : '-'}</td>
                      <td className="py-2 px-3 text-right">{cashStatementData.initialBalance < 0 ? `₺${Math.abs(cashStatementData.initialBalance).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` : '-'}</td>
                      <td className="py-2 px-3 text-right font-bold text-gray-900">₺{cashStatementData.initialBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                    </tr>
                    {cashStatementData.items.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 dark:bg-slate-800/50/80">
                        <td className="py-2.5 px-3 text-gray-700">{new Date(item.date).toLocaleDateString('tr-TR')}</td>
                        <td className="py-2.5 px-3 text-indigo-600 font-bold">{item.documentNo || '-'}</td>
                        <td className="py-2.5 px-3 font-sans text-[11px] font-semibold text-gray-700">{item.typeLabel || item.type}</td>
                        <td className="py-2.5 px-3 font-sans text-gray-700 max-w-xs truncate" title={item.description}>{item.description || '-'}</td>
                        <td className="py-2.5 px-3 font-sans text-gray-800 font-medium">{item.contactName || '-'}</td>
                        <td className="py-2.5 px-3 text-right text-emerald-700 font-bold">{item.debit > 0 ? `₺${item.debit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` : '-'}</td>
                        <td className="py-2.5 px-3 text-right text-rose-700 font-bold">{item.credit > 0 ? `₺${item.credit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` : '-'}</td>
                        <td className="py-2.5 px-3 text-right font-black text-gray-900">₺{item.balance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                      </tr>
                    ))}
                  </>
                )}
              </tbody>
            </table>
          </div>

        </div>
      )}

      {/* TAB 3: BANKA EKSTRELERİ & HAREKET RAPORU */}
      {activeTab === 'bank' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs overflow-hidden space-y-4 p-5">
          
          {/* FİLTRE VE SEÇİMLER */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-gray-100">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <label className="block text-[11px] font-bold text-gray-500 mb-1 uppercase">Banka Hesabı</label>
                <select
                  value={selectedBankAccountId}
                  onChange={(e) => setSelectedBankAccountId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                  className="text-xs font-semibold border border-gray-300 rounded-lg px-3 py-2 bg-white dark:bg-slate-900 text-gray-800 focus:ring-2 focus:ring-blue-500/20"
                >
                  {bankAccounts.map(b => (
                    <option key={b.id} value={b.id}>{b.bankName} ({b.branchName || 'Merkez'}) - ₺{b.balance.toLocaleString('tr-TR')}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-500 mb-1 uppercase">Başlangıç Tarihi</label>
                <input
                  type="date"
                  value={bankStartDate}
                  onChange={(e) => setBankStartDate(e.target.value)}
                  className="text-xs font-medium border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-900 text-gray-800 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-500 mb-1 uppercase">Bitiş Tarihi</label>
                <input
                  type="date"
                  value={bankEndDate}
                  onChange={(e) => setBankEndDate(e.target.value)}
                  className="text-xs font-medium border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-900 text-gray-800 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              {(bankStartDate || bankEndDate) && (
                <div className="flex items-end">
                  <button
                    onClick={() => { setBankStartDate(''); setBankEndDate(''); }}
                    className="text-xs text-rose-600 hover:text-rose-800 font-semibold py-2 cursor-pointer"
                  >
                    Tarihi Temizle
                  </button>
                </div>
              )}
            </div>

            {bankStatementData && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const currentBank = bankAccounts.find(b => b.id === (selectedBankAccountId === 'all' ? bankAccounts[0]?.id : selectedBankAccountId));
                    if (currentBank) setSelectedBankAccountModal(currentBank);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  <Eye className="w-4 h-4" />
                  Tam Ekran & Yazdır
                </button>
              </div>
            )}
          </div>

          {/* BANKA ÖZET KARTLARI */}
          {bankStatementData && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
              <div>
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Devir Bakiyesi</span>
                <p className="text-base font-bold text-gray-800 font-mono mt-0.5">
                  ₺{bankStatementData.initialBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div>
                <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Gelen Havale / Yatırılan</span>
                <p className="text-base font-bold text-emerald-700 font-mono mt-0.5">
                  +₺{bankStatementData.totalDebit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div>
                <span className="text-[10px] font-bold text-rose-700 uppercase tracking-wider">Gönderilen EFT / Çekilen</span>
                <p className="text-base font-bold text-rose-700 font-mono mt-0.5">
                  -₺{bankStatementData.totalCredit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div>
                <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">Mevduat Bakiyesi</span>
                <p className="text-lg font-black text-blue-800 font-mono mt-0.5">
                  ₺{bankStatementData.closingBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          )}

          {/* BANKA HAREKET TABLOSU */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-wider">
                  <th className="py-2.5 px-3">Tarih</th>
                  <th className="py-2.5 px-3">Belge / Dekont No</th>
                  <th className="py-2.5 px-3">İşlem Türü</th>
                  <th className="py-2.5 px-3">Açıklama</th>
                  <th className="py-2.5 px-3">Muhatap / Cari</th>
                  <th className="py-2.5 px-3 text-right">Giriş (Borç ₺)</th>
                  <th className="py-2.5 px-3 text-right">Çıkış (Alacak ₺)</th>
                  <th className="py-2.5 px-3 text-right">Bakiye (₺)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {isLoadingBank ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-gray-400 font-medium">Yükleniyor...</td>
                  </tr>
                ) : !bankStatementData || bankStatementData.items.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-gray-400">
                      Bu tarih aralığında banka hareketi bulunmamaktadır.
                    </td>
                  </tr>
                ) : (
                  <>
                    <tr className="bg-slate-50 dark:bg-slate-800/50/60 font-semibold text-gray-600">
                      <td className="py-2 px-3">{bankStartDate ? new Date(bankStartDate).toLocaleDateString('tr-TR') : '-'}</td>
                      <td className="py-2 px-3">-</td>
                      <td className="py-2 px-3 text-[10px] uppercase font-bold text-gray-500">DEVİR</td>
                      <td className="py-2 px-3 italic text-gray-500" colSpan={2}>Dönem Başı Devir Bakiyesi</td>
                      <td className="py-2 px-3 text-right">{bankStatementData.initialBalance > 0 ? `₺${bankStatementData.initialBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` : '-'}</td>
                      <td className="py-2 px-3 text-right">{bankStatementData.initialBalance < 0 ? `₺${Math.abs(bankStatementData.initialBalance).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` : '-'}</td>
                      <td className="py-2 px-3 text-right font-bold text-gray-900">₺{bankStatementData.initialBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                    </tr>
                    {bankStatementData.items.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 dark:bg-slate-800/50/80">
                        <td className="py-2.5 px-3 text-gray-700">{new Date(item.date).toLocaleDateString('tr-TR')}</td>
                        <td className="py-2.5 px-3 text-blue-600 font-bold">{item.documentNo || '-'}</td>
                        <td className="py-2.5 px-3 font-sans text-[11px] font-semibold text-gray-700">{item.typeLabel || item.type}</td>
                        <td className="py-2.5 px-3 font-sans text-gray-700 max-w-xs truncate" title={item.description}>{item.description || '-'}</td>
                        <td className="py-2.5 px-3 font-sans text-gray-800 font-medium">{item.contactName || '-'}</td>
                        <td className="py-2.5 px-3 text-right text-emerald-700 font-bold">{item.debit > 0 ? `₺${item.debit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` : '-'}</td>
                        <td className="py-2.5 px-3 text-right text-rose-700 font-bold">{item.credit > 0 ? `₺${item.credit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` : '-'}</td>
                        <td className="py-2.5 px-3 text-right font-black text-gray-900">₺{item.balance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                      </tr>
                    ))}
                  </>
                )}
              </tbody>
            </table>
          </div>

        </div>
      )}

      {/* TAB 4: ÇEK & SENET VADE YAŞLANDIRMA & PORTFÖY RAPORU */}
      {activeTab === 'checks' && (
        <div className="space-y-4">
          
          {/* VADE YAŞLANDIRMA BUCKETLARI */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            
            <button
              type="button"
              onClick={() => setCheckAgingFilter(checkAgingFilter === 'overdue' ? 'all' : 'overdue')}
              className={cn(
                "p-3 rounded-xl border text-left transition-all cursor-pointer",
                checkAgingFilter === 'overdue' ? "bg-rose-100 border-rose-400 ring-2 ring-rose-400/30" : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-rose-300"
              )}
            >
              <div className="flex items-center justify-between text-rose-600 text-[10px] font-bold uppercase">
                <span>Vadesi Geçmiş</span>
                <AlertTriangle className="w-3.5 h-3.5" />
              </div>
              <div className="text-base font-black text-rose-700 font-mono mt-1">
                ₺{stats.overdueChecksAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[10px] text-gray-500 mt-0.5">{stats.overdueChecksCount} Adet Çek</div>
            </button>

            <button
              type="button"
              onClick={() => setCheckAgingFilter(checkAgingFilter === '0-30' ? 'all' : '0-30')}
              className={cn(
                "p-3 rounded-xl border text-left transition-all cursor-pointer",
                checkAgingFilter === '0-30' ? "bg-amber-100 border-amber-400 ring-2 ring-amber-400/30" : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-amber-300"
              )}
            >
              <div className="flex items-center justify-between text-amber-600 text-[10px] font-bold uppercase">
                <span>0 - 30 Gün</span>
                <Clock className="w-3.5 h-3.5" />
              </div>
              <div className="text-base font-black text-amber-800 font-mono mt-1">
                ₺{stats.checks0to30.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[10px] text-gray-500 mt-0.5">Bu ay ödenecek/tahsil</div>
            </button>

            <button
              type="button"
              onClick={() => setCheckAgingFilter(checkAgingFilter === '31-60' ? 'all' : '31-60')}
              className={cn(
                "p-3 rounded-xl border text-left transition-all cursor-pointer",
                checkAgingFilter === '31-60' ? "bg-blue-100 border-blue-400 ring-2 ring-blue-400/30" : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-blue-300"
              )}
            >
              <div className="flex items-center justify-between text-blue-600 text-[10px] font-bold uppercase">
                <span>31 - 60 Gün</span>
                <Calendar className="w-3.5 h-3.5" />
              </div>
              <div className="text-base font-black text-blue-800 font-mono mt-1">
                ₺{stats.checks31to60.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[10px] text-gray-500 mt-0.5">Gelecek ay</div>
            </button>

            <button
              type="button"
              onClick={() => setCheckAgingFilter(checkAgingFilter === '61-90' ? 'all' : '61-90')}
              className={cn(
                "p-3 rounded-xl border text-left transition-all cursor-pointer",
                checkAgingFilter === '61-90' ? "bg-indigo-100 border-indigo-400 ring-2 ring-indigo-400/30" : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-indigo-300"
              )}
            >
              <div className="flex items-center justify-between text-indigo-600 text-[10px] font-bold uppercase">
                <span>61 - 90 Gün</span>
                <Calendar className="w-3.5 h-3.5" />
              </div>
              <div className="text-base font-black text-indigo-800 font-mono mt-1">
                ₺{stats.checks61to90.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[10px] text-gray-500 mt-0.5">3. Ay vadeli</div>
            </button>

            <button
              type="button"
              onClick={() => setCheckAgingFilter(checkAgingFilter === '90+' ? 'all' : '90+')}
              className={cn(
                "p-3 rounded-xl border text-left transition-all cursor-pointer",
                checkAgingFilter === '90+' ? "bg-purple-100 border-purple-400 ring-2 ring-purple-400/30" : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-purple-300"
              )}
            >
              <div className="flex items-center justify-between text-purple-600 text-[10px] font-bold uppercase">
                <span>90+ Gün</span>
                <Calendar className="w-3.5 h-3.5" />
              </div>
              <div className="text-base font-black text-purple-800 font-mono mt-1">
                ₺{stats.checks90Plus.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[10px] text-gray-500 mt-0.5">Uzun vadeli</div>
            </button>

          </div>

          {/* FİLTRE VE TABLO */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input 
                    type="text"
                    placeholder="Çek no, portföy no, keşideci, banka ara..."
                    value={checkSearchTerm}
                    onChange={(e) => setCheckSearchTerm(e.target.value)}
                    className="pl-9 pr-3 py-1.5 text-xs font-medium bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 w-64"
                  />
                </div>

                <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs">
                  <button
                    onClick={() => setCheckTypeFilter('all')}
                    className={cn(
                      "px-3 py-1 font-bold rounded-lg transition-all cursor-pointer",
                      checkTypeFilter === 'all' ? "bg-white dark:bg-slate-900 text-indigo-700 shadow-xs" : "text-slate-600"
                    )}
                  >
                    Tümü
                  </button>
                  <button
                    onClick={() => setCheckTypeFilter('received')}
                    className={cn(
                      "px-3 py-1 font-bold rounded-lg transition-all cursor-pointer",
                      checkTypeFilter === 'received' ? "bg-white dark:bg-slate-900 text-emerald-700 shadow-xs" : "text-slate-600"
                    )}
                  >
                    Alınan Çek/Senet
                  </button>
                  <button
                    onClick={() => setCheckTypeFilter('given')}
                    className={cn(
                      "px-3 py-1 font-bold rounded-lg transition-all cursor-pointer",
                      checkTypeFilter === 'given' ? "bg-white dark:bg-slate-900 text-rose-700 shadow-xs" : "text-slate-600"
                    )}
                  >
                    Verilen Borç Çeki
                  </button>
                </div>

                <select
                  value={checkStatusFilter}
                  onChange={(e) => setCheckStatusFilter(e.target.value)}
                  className="text-xs border border-gray-300 rounded-lg py-1.5 px-2.5 bg-white dark:bg-slate-900 text-gray-700"
                >
                  <option value="all">Tüm Durumlar</option>
                  <option value="portfolio">Portföyde</option>
                  <option value="bank_collection">Tahsilde</option>
                  <option value="collected">Tahsil Edildi</option>
                  <option value="endorsed">Ciro Edildi</option>
                  <option value="bounced">Karşılıksız</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                {checkAgingFilter !== 'all' && (
                  <button
                    onClick={() => setCheckAgingFilter('all')}
                    className="text-xs font-semibold text-rose-600 hover:text-rose-800"
                  >
                    Vade Filtresini Sıfırla
                  </button>
                )}
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                  {filteredChecks.length} Çek Kaydı
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700/80 dark:border-slate-800/80 text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-wider">
                    <th className="py-3 px-3">Portföy No</th>
                    <th className="py-3 px-3">Tür</th>
                    <th className="py-3 px-3">Seri No</th>
                    <th className="py-3 px-3">Banka & Şube</th>
                    <th className="py-3 px-3">Keşideci / Cari</th>
                    <th className="py-3 px-3">Vade Tarihi</th>
                    <th className="py-3 px-3">Kalan Gün</th>
                    <th className="py-3 px-3 text-right">Tutar</th>
                    <th className="py-3 px-3 text-center">Durum</th>
                    <th className="py-3 px-3 text-center">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredChecks.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-10 text-center text-slate-400 font-bold">
                        Kriterlere uygun kayıtlı çek veya senet bulunamadı.
                      </td>
                    </tr>
                  ) : (
                    filteredChecks.map(c => {
                      const due = new Date(c.dueDate);
                      due.setHours(0, 0, 0, 0);
                      const now = new Date();
                      now.setHours(0, 0, 0, 0);
                      const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                      const isOverdue = diffDays < 0 && (c.status === 'portfolio' || c.status === 'bank_collection');
                      const isUpcoming = diffDays >= 0 && diffDays <= 7 && (c.status === 'portfolio' || c.status === 'bank_collection');
                      const isReceived = c.type.startsWith('received');

                      return (
                        <tr key={c.id} className="hover:bg-slate-50 dark:bg-slate-800/50/80 transition-colors">
                          <td className="py-3 px-3 font-mono font-bold text-indigo-700">
                            {c.portfolioNumber || '-'}
                          </td>
                          <td className="py-3 px-3">
                            {isReceived ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                                <ArrowDownLeft className="w-3 h-3" /> {c.type === 'received_note' ? 'Alınan Senet' : 'Müşteri Çeki'}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                                <ArrowUpRight className="w-3 h-3" /> {c.type === 'given_note' ? 'Verilen Senet' : 'Firma Çeki'}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 font-mono font-bold text-slate-800 dark:text-slate-200">
                            {c.serialNumber || '-'}
                          </td>
                          <td className="py-3 px-3">
                            <div className="font-bold text-slate-800 dark:text-slate-200">{c.bankName || '-'}</div>
                            <div className="text-[10px] text-slate-400">{c.branchName || ''}</div>
                          </td>
                          <td className="py-3 px-3">
                            <div className="font-medium text-slate-900 dark:text-slate-100">{contactMap.get(c.contactId) || c.contactName || '-'}</div>
                            <div className="text-[10px] text-slate-400">Keşideci: {c.drawer}</div>
                          </td>
                          <td className="py-3 px-3 font-mono font-medium text-slate-700 dark:text-slate-200">
                            {due.toLocaleDateString('tr-TR')}
                          </td>
                          <td className="py-3 px-3">
                            {isOverdue ? (
                              <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                                {Math.abs(diffDays)} gün geçti
                              </span>
                            ) : isUpcoming ? (
                              <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                {diffDays} gün kaldı
                              </span>
                            ) : (
                              <span className="text-[10px] font-medium text-slate-600">
                                {diffDays} gün
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-black text-slate-900 dark:text-slate-100">
                            ₺{c.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-3 px-3 text-center">
                            {getCheckStatusBadge(c.status)}
                          </td>
                          <td className="py-3 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => setSelectedCheckModal(c)}
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                              title="Çek bordro ve hareket detayını incele"
                            >
                              <FileText className="w-3 h-3 text-indigo-600" />
                              Kart
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
        </div>
      )}

      {/* POPUP MODALLER */}
      {selectedCashBoxModal && (
        <CashStatementModal
          isOpen={!!selectedCashBoxModal}
          onClose={() => setSelectedCashBoxModal(null)}
          cashBox={selectedCashBoxModal}
        />
      )}

      {selectedBankAccountModal && (
        <BankStatementModal
          isOpen={!!selectedBankAccountModal}
          onClose={() => setSelectedBankAccountModal(null)}
          bankAccount={selectedBankAccountModal}
        />
      )}

      {selectedCheckModal && (
        <CheckHistoryModal
          isOpen={!!selectedCheckModal}
          onClose={() => setSelectedCheckModal(null)}
          check={selectedCheckModal}
        />
      )}

    </div>
  );
}
