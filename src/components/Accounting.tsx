import React, { useState, useEffect, useMemo } from 'react';
import { 
  BookOpen, 
  FileText, 
  Plus, 
  Search, 
  Filter, 
  Printer, 
  CheckCircle2, 
  AlertCircle, 
  Layers, 
  TrendingUp, 
  TrendingDown, 
  RefreshCw, 
  ArrowRight, 
  BarChart3, 
  ChevronRight, 
  Eye, 
  Trash2,
  Calendar,
  Building2,
  DollarSign,
  Edit3,
  ExternalLink
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useApiQuery } from '../hooks/useApiQuery';
import { accountingService, compareAccountCodes, type MizanRow } from '../services/accountingService';
import type { Account, JournalEntry, Contact, Invoice, CollectionReceipt } from '../types';
import { Calculator } from 'lucide-react';
import PageHeader from './PageHeader';
import JournalEntryModal from './Accounting/JournalEntryModal';
import JournalEntryPrintModal from './Accounting/JournalEntryPrintModal';
import AddAccountModal from './Accounting/AddAccountModal';
import EditAccountModal from './Accounting/EditAccountModal';
import DeleteAccountModal from './Accounting/DeleteAccountModal';
import ChartOfAccounts from './Accounting/ChartOfAccounts';
import MizanPrintModal from './Accounting/MizanPrintModal';
import KebirPrintModal from './Accounting/KebirPrintModal';
import AccountingReport from './Reports/AccountingReport';

export default function Accounting() {
  const [activeTab, setActiveTab] = useState<'entries' | 'chart' | 'mizan' | 'kebir' | 'financial' | 'integration' | 'reports'>('entries');

  // Live queries
  const rawAccounts = useApiQuery(() => api.accounts.list(), [], ['accounts']) || [];
  const accounts = useMemo(() => {
    const map = new Map<string, Account>();
    for (const a of rawAccounts) {
      const k = a.code.trim();
      if (!map.has(k)) {
        map.set(k, a);
      }
    }
    const list = Array.from(map.values());
    list.sort((a, b) => compareAccountCodes(a.code, b.code));
    return list;
  }, [rawAccounts]);
  const journalEntries = useApiQuery(() => api.journalEntries.list({ orderBy: 'date', orderDir: 'desc' }), [], ['journalEntries']) || [];
  const contacts = useApiQuery(() => api.contacts.list(), [], ['contacts']) || [];
  const invoices = useApiQuery(() => api.invoices.list(), [], ['invoices']) || [];
  const receipts = useApiQuery(() => api.collectionReceipts.list(), [], ['collectionReceipts']) || [];

  // Modals
  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [selectedParentCodeForAdd, setSelectedParentCodeForAdd] = useState<string | undefined>(undefined);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [accountToDelete, setAccountToDelete] = useState<Account | null>(null);
  const [selectedEntryForPrint, setSelectedEntryForPrint] = useState<JournalEntry | null>(null);
  const [isMizanPrintModalOpen, setIsMizanPrintModalOpen] = useState(false);
  const [isKebirPrintModalOpen, setIsKebirPrintModalOpen] = useState(false);

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [entryTypeFilter, setEntryTypeFilter] = useState<string>('all');
  const [mizanRows, setMizanRows] = useState<MizanRow[]>([]);
  const [mizanLoading, setMizanLoading] = useState(false);
  const [mizanOnlyBalance, setMizanOnlyBalance] = useState(false);
  const [mizanLevelFilter, setMizanLevelFilter] = useState<'all' | 'class' | 'group' | 'main' | 'sub'>('all');

  // Defter-i Kebir state
  const [selectedKebirCode, setSelectedKebirCode] = useState<string>('100.01');
  const [kebirLines, setKebirLines] = useState<any[]>([]);
  const [kebirLoading, setKebirLoading] = useState(false);

  // Integration state
  const [integrating, setIntegrating] = useState(false);
  const [integrationResult, setIntegrationResult] = useState<{ processedCount: number; errors: string[] } | null>(null);

  // Fetch Mizan whenever tab is active or filters change
  useEffect(() => {
    if (activeTab === 'mizan') {
      setMizanLoading(true);
      accountingService.getMizanReport({
        onlyWithBalance: mizanOnlyBalance,
        levelFilter: mizanLevelFilter
      }).then(res => {
        setMizanRows(res);
        setMizanLoading(false);
      });
    }
  }, [activeTab, mizanOnlyBalance, mizanLevelFilter, journalEntries]);

  // Fetch Defter-i Kebir when selected code or tab changes
  useEffect(() => {
    if (activeTab === 'kebir' && selectedKebirCode) {
      setKebirLoading(true);
      accountingService.getGeneralLedger(selectedKebirCode).then(lines => {
        setKebirLines(lines);
        setKebirLoading(false);
      });
    }
  }, [activeTab, selectedKebirCode, journalEntries]);

  // Handle Batch Invoice Integration
  const handleAutoAccountInvoices = async () => {
    setIntegrating(true);
    setIntegrationResult(null);
    try {
      const result = await accountingService.autoAccountAllInvoices();
      setIntegrationResult(result);
    } catch (e: any) {
      alert(`Entegrasyon hatası: ${e.message}`);
    } finally {
      setIntegrating(false);
    }
  };

  // Delete Journal Entry
  const handleDeleteEntry = async (id: number) => {
    if (confirm('Bu yevmiye fişini silmek istediğinize emin misiniz?')) {
      await accountingService.deleteJournalEntry(id);
    }
  };

  // Filtered Journal Entries
  const filteredEntries = journalEntries.filter(e => {
    if (entryTypeFilter !== 'all' && e.entryType !== entryTypeFilter) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const matchHeader = `${e.entryNumber} ${e.description} ${e.documentNumber || ''}`.toLowerCase().includes(q);
      const matchLines = e.lines.some(l => `${l.accountCode} ${l.accountName} ${l.description}`.toLowerCase().includes(q));
      if (!matchHeader && !matchLines) return false;
    }
    return true;
  });

  // KPI Calculations
  const totalEntriesCount = journalEntries.length;
  const totalDebitSum = journalEntries.reduce((sum, e) => sum + (e.totalDebit || 0), 0);
  const totalCreditSum = journalEntries.reduce((sum, e) => sum + (e.totalCredit || 0), 0);

  // Calculate quick income statement figures
  const sales600 = journalEntries.flatMap(e => e.lines).filter(l => l.accountCode.startsWith('600')).reduce((s, l) => s + (l.credit - l.debit), 0);
  const cogs620 = journalEntries.flatMap(e => e.lines).filter(l => l.accountCode.startsWith('620') || l.accountCode.startsWith('621')).reduce((s, l) => s + (l.debit - l.credit), 0);
  const expenses700 = journalEntries.flatMap(e => e.lines).filter(l => l.accountCode.startsWith('760') || l.accountCode.startsWith('770') || l.accountCode.startsWith('780')).reduce((s, l) => s + (l.debit - l.credit), 0);
  const netIncome = sales600 - cogs620 - expenses700;

  // Unaccounted Invoices count
  const accountedDocIds = new Set(journalEntries.filter(e => e.documentType === 'invoice').map(e => e.documentId).filter(Boolean));
  const unaccountedInvoicesCount = invoices.filter(inv => inv.status !== 'cancelled' && inv.id && !accountedDocIds.has(inv.id)).length;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <PageHeader
        title="Genel Muhasebe (TDHP)"
        subtitle="Tek Düzen Hesap Planına uygun yevmiye defteri, mizan raporu, defter-i kebir ve mali tablolar"
        badge="Muhasebe & Defter"
        icon={Calculator}
        iconColor="amber"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {unaccountedInvoicesCount > 0 && (
              <button
                onClick={handleAutoAccountInvoices}
                disabled={integrating}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${integrating ? 'animate-spin' : ''}`} />
                <span>{unaccountedInvoicesCount} Faturayı Muhasebeleştir</span>
              </button>
            )}

            <button
              onClick={() => setIsAccountModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-50 dark:bg-slate-800/50 shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              <span>Yeni Alt Hesap</span>
            </button>

            <button
              onClick={() => setIsEntryModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Yeni Yevmiye Fişi</span>
            </button>
          </div>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Kayıtlı Yevmiye Fişi</span>
            <span className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
              <BookOpen className="w-5 h-5" />
            </span>
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-2">{totalEntriesCount} Adet</p>
          <p className="text-xs text-emerald-600 font-medium mt-1">Borç/Alacak Dengeli</p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Toplam Yevmiye Hacmi</span>
            <span className="p-2 rounded-lg bg-blue-50 text-blue-600">
              <DollarSign className="w-5 h-5" />
            </span>
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-2">
            ₺{totalDebitSum.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-gray-500 mt-1">Genel Toplam Borç = Alacak</p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">600 Satış Gelirleri</span>
            <span className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
              <TrendingUp className="w-5 h-5" />
            </span>
          </div>
          <p className="text-2xl font-bold text-emerald-600 mt-2">
            ₺{sales600.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-gray-500 mt-1">Brüt Yurtiçi Satışlar</p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Dönem Net Faaliyet Kârı</span>
            <span className={`p-2 rounded-lg ${netIncome >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
              <BarChart3 className="w-5 h-5" />
            </span>
          </div>
          <p className={`text-2xl font-bold mt-2 ${netIncome >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
            ₺{netIncome.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-gray-500 mt-1">600 Gelir - 700 Gider Dengesi</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 space-x-6 overflow-x-auto">
        <button
          onClick={() => setActiveTab('entries')}
          className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap flex items-center gap-2 ${
            activeTab === 'entries'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          Yevmiye Defteri (Fişler)
          <span className="ml-1 py-0.5 px-2 rounded-full text-xs bg-gray-100 text-gray-600 font-semibold">
            {journalEntries.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('chart')}
          className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap flex items-center gap-2 ${
            activeTab === 'chart'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <Layers className="w-4 h-4" />
          Hesap Planı (TDHP)
          <span className="ml-1 py-0.5 px-2 rounded-full text-xs bg-gray-100 text-gray-600 font-semibold">
            {accounts.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('mizan')}
          className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap flex items-center gap-2 ${
            activeTab === 'mizan'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <FileText className="w-4 h-4" />
          Mizan Raporu
        </button>

        <button
          onClick={() => setActiveTab('kebir')}
          className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap flex items-center gap-2 ${
            activeTab === 'kebir'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <Building2 className="w-4 h-4" />
          Defter-i Kebir (Büyük Defter)
        </button>

        <button
          onClick={() => setActiveTab('financial')}
          className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap flex items-center gap-2 ${
            activeTab === 'financial'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Mali Tablolar (Gelir/Bilanço)
        </button>

        <button
          onClick={() => setActiveTab('integration')}
          className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap flex items-center gap-2 ${
            activeTab === 'integration'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <RefreshCw className="w-4 h-4" />
          Entegrasyon Merkezi
          {unaccountedInvoicesCount > 0 && (
            <span className="ml-1 py-0.5 px-2 rounded-full text-xs bg-amber-100 text-amber-700 font-bold">
              {unaccountedInvoicesCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('reports')}
          className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap flex items-center gap-2 ${
            activeTab === 'reports'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <BarChart3 className="w-4 h-4 text-emerald-600" />
          Muhasebe Analiz & Raporlar
        </button>

        <div className="ml-auto flex items-center pr-2">
          <Link
            to="/reports?tab=accounting"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors whitespace-nowrap"
          >
            <span>Raporlar Merkezi</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* TAB 1: Yevmiye Defteri (Journal Entries) */}
      {activeTab === 'entries' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-lg border border-gray-200">
            <div className="flex items-center gap-2 flex-1 max-w-md">
              <Search className="w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Fiş no, açıklama, hesap kodu veya hesap adı ile ara..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full text-sm border-none focus:ring-0 placeholder-gray-400 p-0"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={entryTypeFilter}
                onChange={(e) => setEntryTypeFilter(e.target.value)}
                className="text-xs border border-gray-300 rounded-md py-1.5 px-2.5 bg-white dark:bg-slate-900 text-gray-700"
              >
                <option value="all">Tüm Fiş Türleri</option>
                <option value="mahsup">Mahsup Fişleri</option>
                <option value="tahsil">Tahsil Fişleri</option>
                <option value="tediye">Tediye Fişleri</option>
                <option value="acilis">Açılış Fişleri</option>
              </select>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-gray-600 font-semibold">
                  <tr>
                    <th className="py-3 px-4 text-left">Yevmiye Fiş No</th>
                    <th className="py-3 px-4 text-left">Tarih</th>
                    <th className="py-3 px-4 text-left">Fiş Tipi</th>
                    <th className="py-3 px-4 text-left">Açıklama</th>
                    <th className="py-3 px-4 text-left">Belge No</th>
                    <th className="py-3 px-4 text-right">Borç Toplamı</th>
                    <th className="py-3 px-4 text-right">Alacak Toplamı</th>
                    <th className="py-3 px-4 text-center">Denge</th>
                    <th className="py-3 px-4 text-right">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-700">
                  {filteredEntries.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-gray-400">
                        Kayıtlı yevmiye fişi bulunmamaktadır.
                      </td>
                    </tr>
                  ) : (
                    filteredEntries.map((entry) => (
                      <tr key={`entry-${entry.id || entry.entryNumber}`} className="hover:bg-gray-50 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-indigo-600">
                          {entry.entryNumber}
                        </td>
                        <td className="py-3 px-4 text-gray-500 whitespace-nowrap">
                          {new Date(entry.date).toLocaleDateString('tr-TR')}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold uppercase ${
                            entry.entryType === 'tahsil' ? 'bg-emerald-100 text-emerald-800' :
                            entry.entryType === 'tediye' ? 'bg-rose-100 text-rose-800' :
                            entry.entryType === 'acilis' ? 'bg-purple-100 text-purple-800' :
                            'bg-blue-100 text-blue-800'
                          }`}>
                            {entry.entryType}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-medium text-gray-900 max-w-sm truncate">
                          {entry.description}
                          <span className="text-xs text-gray-400 block font-normal">
                            {entry.lines.length} satır kayıt
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-gray-600">
                          {entry.documentNumber || '-'}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-gray-900">
                          ₺{entry.totalDebit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-gray-900">
                          ₺{entry.totalCredit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {entry.isBalanced ? (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded font-medium">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Denk
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-rose-600 bg-rose-50 px-2 py-0.5 rounded font-medium">
                              <AlertCircle className="w-3.5 h-3.5" /> Farklı
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={() => setSelectedEntryForPrint(entry)}
                              className="p-1.5 text-gray-500 hover:text-indigo-600 hover:bg-gray-100 rounded"
                              title="Resmi Fişi Görüntüle / Yazdır"
                            >
                              <Printer className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteEntry(entry.id!)}
                              className="p-1.5 text-gray-500 hover:text-rose-600 hover:bg-gray-100 rounded"
                              title="Fişi Sil"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Tek Düzen Hesap Planı (TDHP) */}
      {activeTab === 'chart' && (
        <ChartOfAccounts
          accounts={accounts}
          journalEntries={journalEntries}
          onEditAccount={(acc) => setEditingAccount(acc)}
          onDeleteAccount={(acc) => setAccountToDelete(acc)}
          onAddAccount={(parentCode) => {
            setSelectedParentCodeForAdd(parentCode);
            setIsAccountModalOpen(true);
          }}
          onOpenKebir={(code) => {
            setSelectedKebirCode(code);
            setActiveTab('kebir');
          }}
        />
      )}

      {/* TAB 3: Mizan Raporu (Trial Balance) */}
      {activeTab === 'mizan' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3.5 rounded-lg border border-gray-200">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={mizanOnlyBalance}
                  onChange={(e) => setMizanOnlyBalance(e.target.checked)}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                Sadece Bakiyesi Olan Hesapları Göster
              </label>

              <select
                value={mizanLevelFilter}
                onChange={(e) => setMizanLevelFilter(e.target.value as any)}
                className="text-xs border border-gray-300 rounded-md py-1.5 px-2.5 bg-white dark:bg-slate-900 text-gray-700"
              >
                <option value="all">Tüm Seviyeler (Sınıf, Grup, Ana, Alt)</option>
                <option value="class">Sadece Sınıflar (1, 2, 3, 4, 5, 6, 7)</option>
                <option value="group">Grup Düzeyinde (10, 12, 15, 32...)</option>
                <option value="main">Ana Hesaplar (100, 102, 120, 320...)</option>
                <option value="sub">Alt / Muavin Hesaplar (100.01, 102.01...)</option>
              </select>
            </div>

            <button
              onClick={() => setIsMizanPrintModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 rounded-lg text-xs font-semibold text-indigo-700 shadow-sm transition-colors"
              title="Resmi Mizan Cetveli Önizleme ve Yazdırma"
            >
              <Printer className="w-3.5 h-3.5" />
              Mizanı Yazdır
            </button>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-xs">
                <thead className="bg-gray-100 text-gray-700 font-bold border-b border-gray-300">
                  <tr>
                    <th className="py-2.5 px-3 text-left w-28">Hesap Kodu</th>
                    <th className="py-2.5 px-3 text-left">Hesap Adı</th>
                    <th className="py-2.5 px-3 text-right w-32">Toplam Borç (₺)</th>
                    <th className="py-2.5 px-3 text-right w-32">Toplam Alacak (₺)</th>
                    <th className="py-2.5 px-3 text-right w-32">Borç Bakiyesi (₺)</th>
                    <th className="py-2.5 px-3 text-right w-32">Alacak Bakiyesi (₺)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-800">
                  {mizanLoading ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-gray-400">
                        Mizan hesaplanıyor...
                      </td>
                    </tr>
                  ) : mizanRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-gray-400">
                        Kriterlere uygun mizan kaydı bulunamadı.
                      </td>
                    </tr>
                  ) : (
                    mizanRows.map((r, idx) => {
                      const isBold = r.level <= 2;
                      return (
                        <tr 
                          key={`mizan-${r.code}-${idx}`} 
                          className={`hover:bg-gray-50 ${isBold ? 'bg-gray-50/70 font-bold text-gray-900' : ''}`}
                        >
                          <td className="py-2 px-3 font-mono font-medium">{r.code}</td>
                          <td className="py-2 px-3">{r.name}</td>
                          <td className="py-2 px-3 text-right font-mono">
                            {r.totalDebit > 0 ? r.totalDebit.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '-'}
                          </td>
                          <td className="py-2 px-3 text-right font-mono">
                            {r.totalCredit > 0 ? r.totalCredit.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '-'}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-emerald-700">
                            {r.debitBalance > 0 ? r.debitBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '-'}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-blue-700">
                            {r.creditBalance > 0 ? r.creditBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '-'}
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

      {/* TAB 4: Defter-i Kebir (Büyük Defter) */}
      {activeTab === 'kebir' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3.5 rounded-lg border border-gray-200">
            <div className="flex items-center gap-3">
              <label className="text-xs font-semibold text-gray-700 whitespace-nowrap">
                Hesap Seçimi:
              </label>
              <select
                value={selectedKebirCode}
                onChange={(e) => setSelectedKebirCode(e.target.value)}
                className="text-xs border border-gray-300 rounded-md py-1.5 px-2.5 bg-white dark:bg-slate-900 text-gray-900 font-mono font-bold min-w-[280px]"
              >
                {accounts.map((acc) => (
                  <option key={`kebir-opt-${acc.code}`} value={acc.code}>
                    {acc.code} - {acc.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => setIsKebirPrintModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 rounded-lg text-xs font-semibold text-indigo-700 shadow-sm transition-colors"
              title="Defter-i Kebir Ekstresi Önizleme ve Yazdırma"
            >
              <Printer className="w-3.5 h-3.5" />
              Ekstreyi Yazdır
            </button>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-xs">
                <thead className="bg-gray-100 text-gray-700 font-bold border-b border-gray-300">
                  <tr>
                    <th className="py-2.5 px-3 text-left w-36">Yevmiye Fiş No</th>
                    <th className="py-2.5 px-3 text-left w-24">Tarih</th>
                    <th className="py-2.5 px-3 text-left">Açıklama</th>
                    <th className="py-2.5 px-3 text-right w-28">Borç (₺)</th>
                    <th className="py-2.5 px-3 text-right w-28">Alacak (₺)</th>
                    <th className="py-2.5 px-3 text-right w-32">Bakiye (₺)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-800">
                  {kebirLoading ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-gray-400">
                        Defter-i Kebir yükleniyor...
                      </td>
                    </tr>
                  ) : kebirLines.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-gray-400">
                        Bu hesap için henüz yevmiye hareketi bulunmuyor.
                      </td>
                    </tr>
                  ) : (
                    kebirLines.map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="py-2 px-3 font-mono font-bold text-indigo-600">{row.entryNumber}</td>
                        <td className="py-2 px-3 whitespace-nowrap">{new Date(row.date).toLocaleDateString('tr-TR')}</td>
                        <td className="py-2 px-3">{row.description}</td>
                        <td className="py-2 px-3 text-right font-mono font-bold">
                          {row.debit > 0 ? row.debit.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '-'}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold">
                          {row.credit > 0 ? row.credit.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '-'}
                        </td>
                        <td className={`py-2 px-3 text-right font-mono font-bold ${row.balance >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                          ₺{Math.abs(row.balance).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {row.balance >= 0 ? '(B)' : '(A)'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: Mali Tablolar (Gelir Tablosu & Bilanço) */}
      {activeTab === 'financial' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* GELİR TABLOSU */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h2 className="text-base font-bold text-gray-900">Özet Gelir Tablosu (6 Grubu)</h2>
              <span className="text-xs text-gray-500">TL Bazında</span>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between py-1.5 border-b border-gray-100">
                <span className="font-semibold text-gray-800">A. BRÜT SATIŞLAR (600)</span>
                <span className="font-mono font-bold text-gray-900">₺{sales600.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
              </div>

              <div className="flex justify-between py-1.5 border-b border-gray-100 text-gray-600 pl-4">
                <span>B. Satış İndirimleri (-)</span>
                <span className="font-mono">₺0,00</span>
              </div>

              <div className="flex justify-between py-1.5 bg-gray-50 px-2 rounded font-bold">
                <span>NET SATIŞLAR</span>
                <span className="font-mono text-indigo-700">₺{sales600.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
              </div>

              <div className="flex justify-between py-1.5 border-b border-gray-100 text-rose-600 pl-4">
                <span>C. Satışların Maliyeti (620) (-)</span>
                <span className="font-mono">-₺{cogs620.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
              </div>

              <div className="flex justify-between py-1.5 bg-indigo-50/50 px-2 rounded font-bold">
                <span>BRÜT SATIŞ KÂRI / ZARARI</span>
                <span className="font-mono text-indigo-900">₺{(sales600 - cogs620).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
              </div>

              <div className="flex justify-between py-1.5 border-b border-gray-100 text-rose-600 pl-4">
                <span>D. Faaliyet Giderleri (760/770) (-)</span>
                <span className="font-mono">-₺{expenses700.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
              </div>

              <div className={`flex justify-between p-3 rounded-lg font-black text-base ${netIncome >= 0 ? 'bg-emerald-100 text-emerald-900' : 'bg-rose-100 text-rose-900'}`}>
                <span>DÖNEM NET KÂRI / ZARARI</span>
                <span className="font-mono">₺{netIncome.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>

          {/* BİLANÇO ÖZETİ */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h2 className="text-base font-bold text-gray-900">Özet Bilanço Göstergesi</h2>
              <span className="text-xs text-gray-500">Aktif = Pasif</span>
            </div>

            <div className="space-y-4 text-sm">
              <div className="p-3 bg-blue-50/60 rounded-lg border border-blue-100 space-y-2">
                <span className="font-bold text-blue-900 block text-xs uppercase">I. AKTİF (VARLIKLAR)</span>
                <div className="flex justify-between text-xs text-blue-800">
                  <span>1. Dönen Varlıklar (Kasa, Banka, Alacaklar, Stoklar)</span>
                  <span className="font-mono font-bold">Aktif Varlıklar</span>
                </div>
                <div className="flex justify-between text-xs text-blue-800">
                  <span>2. Duran Varlıklar (Makineler, Demirbaşlar)</span>
                  <span className="font-mono font-bold">Tesis & Ekipman</span>
                </div>
              </div>

              <div className="p-3 bg-amber-50/60 rounded-lg border border-amber-100 space-y-2">
                <span className="font-bold text-amber-900 block text-xs uppercase">II. PASİF (KAYNAKLAR)</span>
                <div className="flex justify-between text-xs text-amber-800">
                  <span>3. Kısa Vadeli Yabancı Kaynaklar (Satıcılar, Borçlar, KDV)</span>
                  <span className="font-mono font-bold">Ticari Borçlar</span>
                </div>
                <div className="flex justify-between text-xs text-amber-800">
                  <span>5. Özkaynaklar (Sermaye, Dönem Kârı)</span>
                  <span className="font-mono font-bold">Şirket Sermayesi</span>
                </div>
              </div>

              <div className="text-xs text-gray-500 italic bg-gray-50 p-2.5 rounded">
                * Bilanço kalemleri, Tek Düzen Hesap Planındaki 1-5 sınıf hesaplarının yevmiye kapanış bakiyelerinden anlık olarak üretilmektedir.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: Entegrasyon Merkezi */}
      {activeTab === 'integration' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">ERP Modülleri Otomatik TDHP Entegrasyonu</h2>
                <p className="text-xs text-gray-500 mt-1">
                  Faturalar (Satış/Alış) ve Tahsilat/Tediye makbuzlarının Tek Düzen Hesap Planına tek tıkla toplu aktarımı
                </p>
              </div>

              <button
                onClick={handleAutoAccountInvoices}
                disabled={integrating || unaccountedInvoicesCount === 0}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 shadow-sm transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${integrating ? 'animate-spin' : ''}`} />
                {integrating ? 'Muhasebeleştiriliyor...' : 'Bekleyen Faturaları Muhasebeleştir'}
              </button>
            </div>

            {integrationResult && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  İşlem Tamamlandı: {integrationResult.processedCount} adet fatura TDHP yevmiye fişlerine aktarıldı.
                </p>
                {integrationResult.errors.length > 0 && (
                  <div className="mt-2 text-rose-700 space-y-0.5">
                    {integrationResult.errors.map((err, i) => (
                      <p key={i}>• {err}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Invoices accounting status list */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="p-4 border-b border-gray-200 bg-gray-50">
              <h3 className="text-sm font-bold text-gray-900">Faturaların Muhasebe Durumu</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-gray-600 font-semibold">
                  <tr>
                    <th className="py-3 px-4 text-left">Fatura No</th>
                    <th className="py-3 px-4 text-left">Tarih</th>
                    <th className="py-3 px-4 text-left">Tür</th>
                    <th className="py-3 px-4 text-left">Cari</th>
                    <th className="py-3 px-4 text-right">Tutar</th>
                    <th className="py-3 px-4 text-center">TDHP Durumu</th>
                    <th className="py-3 px-4 text-right">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-700">
                  {invoices.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-gray-400">
                        Henüz kayıtlı fatura bulunmuyor.
                      </td>
                    </tr>
                  ) : (
                    invoices.map((inv) => {
                      const isAccounted = accountedDocIds.has(inv.id);
                      return (
                        <tr key={inv.id} className="hover:bg-gray-50">
                          <td className="py-3 px-4 font-mono font-medium text-indigo-600">{inv.invoiceNumber}</td>
                          <td className="py-3 px-4 text-gray-500">{new Date(inv.date).toLocaleDateString('tr-TR')}</td>
                          <td className="py-3 px-4 text-xs font-semibold">
                            {inv.type === 'sales' ? 'Satış Faturası' : 'Alış Faturası'}
                          </td>
                          <td className="py-3 px-4 font-medium text-gray-900">
                            {contacts.find(c => c.id === inv.contactId)?.name || `Cari #${inv.contactId}`}
                          </td>
                          <td className="py-3 px-4 text-right font-bold">
                            ₺{inv.grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {isAccounted ? (
                              <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-semibold">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Muhasebeleşti
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded font-semibold">
                                <AlertCircle className="w-3.5 h-3.5" /> Bekliyor
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            {!isAccounted && (
                              <button
                                onClick={async () => {
                                  await accountingService.createInvoiceJournalEntry(inv.id!);
                                  alert(`${inv.invoiceNumber} faturası başarıyla muhasebeleştirildi.`);
                                }}
                                className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold"
                              >
                                Şimdi Muhasebeleştir
                              </button>
                            )}
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

      {/* TAB 7: Accounting Analysis & Reports */}
      {activeTab === 'reports' && (
        <AccountingReport />
      )}

      {/* MODAL: Yeni Yevmiye Fişi */}
      <JournalEntryModal
        isOpen={isEntryModalOpen}
        onClose={() => setIsEntryModalOpen(false)}
        accounts={accounts}
        contacts={contacts}
        onSuccess={() => alert('Yevmiye fişi başarıyla kaydedildi.')}
      />

      {/* MODAL: Yeni Alt Hesap Açma */}
      <AddAccountModal
        isOpen={isAccountModalOpen}
        onClose={() => {
          setIsAccountModalOpen(false);
          setSelectedParentCodeForAdd(undefined);
        }}
        parentAccounts={accounts}
        initialParentCode={selectedParentCodeForAdd}
        onSuccess={() => alert('Yeni alt hesap başarıyla açıldı.')}
      />

      {/* MODAL: Fiş Yazdırma */}
      <JournalEntryPrintModal
        entry={selectedEntryForPrint}
        onClose={() => setSelectedEntryForPrint(null)}
      />

      {/* MODAL: Mizan Raporu Yazdırma */}
      <MizanPrintModal
        isOpen={isMizanPrintModalOpen}
        onClose={() => setIsMizanPrintModalOpen(false)}
        mizanRows={mizanRows}
        options={{
          onlyWithBalance: mizanOnlyBalance,
          levelFilter: mizanLevelFilter
        }}
      />

      {/* MODAL: Defter-i Kebir Ekstresi Yazdırma */}
      <KebirPrintModal
        isOpen={isKebirPrintModalOpen}
        onClose={() => setIsKebirPrintModalOpen(false)}
        accountCode={selectedKebirCode}
        account={accounts.find(a => a.code === selectedKebirCode)}
        lines={kebirLines}
      />

      {/* MODAL: Hesap Bilgilerini / Adını Düzenleme */}
      <EditAccountModal
        isOpen={!!editingAccount}
        onClose={() => setEditingAccount(null)}
        account={editingAccount}
        onDeleteAccount={(acc) => {
          setEditingAccount(null);
          setAccountToDelete(acc);
        }}
      />

      {/* MODAL: TDHP Hesap Silme */}
      <DeleteAccountModal
        isOpen={!!accountToDelete}
        onClose={() => setAccountToDelete(null)}
        account={accountToDelete}
      />
    </div>
  );
}
