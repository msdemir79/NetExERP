import React, { useState, useEffect, useMemo } from 'react';
import {
  BookOpen,
  FileText,
  Plus,
  Printer,
  CheckCircle2,
  AlertCircle,
  Layers,
  TrendingUp,
  RefreshCw,
  BarChart3,
  Trash2,
  Building2,
  DollarSign,
  ExternalLink
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useApiQuery } from '../hooks/useApiQuery';
import { accountingService, compareAccountCodes, type MizanRow } from '../services/accountingService';
import type { Account, JournalEntry, Contact, Invoice, CollectionReceipt } from '../types';
import { Calculator } from 'lucide-react';
import PageHeader from './PageHeader';
import DataGrid, { StatusPill } from './Common/DataGrid';
import KpiCard from './Common/KpiCard';
import DetailPanel from './Common/DetailPanel';
import { DetailSection, DetailSummary, DetailTiles } from './Common/DetailPanelContent';
import StatusBadge from './Common/StatusBadge';
import Button from './Common/Button';
import { showToast, confirmDialog } from '../lib/feedback';
import JournalEntryModal from './Accounting/JournalEntryModal';
import JournalEntryPrintModal from './Accounting/JournalEntryPrintModal';
import AddAccountModal from './Accounting/AddAccountModal';
import EditAccountModal from './Accounting/EditAccountModal';
import DeleteConfirmModal from './Common/DeleteConfirmModal';
import ChartOfAccounts from './Accounting/ChartOfAccounts';
import MizanPrintModal from './Accounting/MizanPrintModal';
import KebirPrintModal from './Accounting/KebirPrintModal';
import AccountingReport from './Reports/AccountingReport';
import PeriodClosing from './Accounting/PeriodClosing';

export default function Accounting() {
  const [activeTab, setActiveTab] = useState<'entries' | 'chart' | 'mizan' | 'kebir' | 'financial' | 'integration' | 'reports' | 'periods'>('entries');

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
  const [detailEntry, setDetailEntry] = useState<JournalEntry | null>(null);
  const [isMizanPrintModalOpen, setIsMizanPrintModalOpen] = useState(false);
  const [isKebirPrintModalOpen, setIsKebirPrintModalOpen] = useState(false);

  // Search & Filters
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
      }).catch((err: unknown) => {
        // `.catch()` olmadan hata yutulur: `setMizanLoading(false)` hiç çalışmaz,
        // ekran sonsuz spinner'da kalır ve promise reddi yakalanmaz.
        console.error('Mizan raporu alınamadı:', err);
        showToast(err instanceof Error ? err.message : 'Mizan raporu alınamadı.', 'error');
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
      }).catch((err: unknown) => {
        console.error('Defter-i kebir alınamadı:', err);
        showToast(err instanceof Error ? err.message : 'Defter-i kebir alınamadı.', 'error');
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
      showToast(`Entegrasyon hatası: ${e.message}`, 'error');
    } finally {
      setIntegrating(false);
    }
  };

  // Delete Journal Entry
  const handleDeleteEntry = async (id: number) => {
    const entry = journalEntries.find(e => e.id === id);
    const isDraft = entry?.status === 'draft';
    const msg = isDraft
      ? 'Bu taslak yevmiye fişi kalıcı olarak silinecek. Emin misiniz?'
      : 'Bu onaylı yevmiye fişi silinmez; borç/alacak yer değiştirmiş bir TERS KAYIT oluşturulur (orijinal fiş korunur). Devam edilsin mi?';
    if (!(await confirmDialog(msg))) return;
    try {
      await accountingService.reverseJournalEntry(id);
    } catch (e: any) {
      showToast(e?.message || 'Yevmiye fişi iptal edilemedi.', 'error');
    }
  };

  // Filtered Journal Entries
  const filteredEntries = journalEntries.filter(e => {
    if (entryTypeFilter !== 'all' && e.entryType !== entryTypeFilter) return false;
    return true;
  });

  const entryTypeMeta: Record<JournalEntry['entryType'], { tone: 'green' | 'red' | 'violet' | 'blue' | 'slate'; label: string }> = {
    tahsil: { tone: 'green', label: 'Tahsil' },
    tediye: { tone: 'red', label: 'Tediye' },
    acilis: { tone: 'violet', label: 'Açılış' },
    mahsup: { tone: 'blue', label: 'Mahsup' },
    kapanis: { tone: 'slate', label: 'Kapanış' },
  };

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
              <Button
                variant="secondary"
                icon={<RefreshCw className="h-3.5 w-3.5" />}
                loading={integrating}
                onClick={handleAutoAccountInvoices}
              >
                {unaccountedInvoicesCount} Faturayı Muhasebeleştir
              </Button>
            )}

            <Button
              variant="secondary"
              icon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => setIsAccountModalOpen(true)}
            >
              Yeni Alt Hesap
            </Button>

            <Button
              variant="primary"
              icon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => setIsEntryModalOpen(true)}
            >
              Yeni Yevmiye Fişi
            </Button>
          </div>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Kayıtlı Yevmiye Fişi"
          value={`${totalEntriesCount} Adet`}
          sub="Borç/Alacak dengeli"
          icon={BookOpen}
          tone="brand"
        />
        <KpiCard
          label="Toplam Yevmiye Hacmi"
          value={`₺${totalDebitSum.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`}
          sub="Genel toplam Borç = Alacak"
          icon={DollarSign}
          tone="info"
        />
        <KpiCard
          label="600 Satış Gelirleri"
          value={`₺${sales600.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`}
          sub="Brüt yurtiçi satışlar"
          icon={TrendingUp}
          tone="success"
        />
        <KpiCard
          label="Dönem Net Faaliyet Kârı"
          value={`₺${netIncome.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`}
          sub="600 Gelir − 700 Gider dengesi"
          icon={BarChart3}
          tone={netIncome >= 0 ? 'success' : 'danger'}
        />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-line space-x-6 overflow-x-auto">
        <button
          onClick={() => setActiveTab('entries')}
          className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap flex items-center gap-2 ${
            activeTab === 'entries'
              ? 'border-brand text-brand'
              : 'border-transparent text-fg-muted hover:text-fg-strong hover:border-line-strong'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          Yevmiye Defteri (Fişler)
          <span className="ml-1 py-0.5 px-2 rounded-full text-xs bg-surface-hover text-fg-muted font-semibold">
            {journalEntries.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('chart')}
          className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap flex items-center gap-2 ${
            activeTab === 'chart'
              ? 'border-brand text-brand'
              : 'border-transparent text-fg-muted hover:text-fg-strong hover:border-line-strong'
          }`}
        >
          <Layers className="w-4 h-4" />
          Hesap Planı (TDHP)
          <span className="ml-1 py-0.5 px-2 rounded-full text-xs bg-surface-hover text-fg-muted font-semibold">
            {accounts.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('mizan')}
          className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap flex items-center gap-2 ${
            activeTab === 'mizan'
              ? 'border-brand text-brand'
              : 'border-transparent text-fg-muted hover:text-fg-strong hover:border-line-strong'
          }`}
        >
          <FileText className="w-4 h-4" />
          Mizan Raporu
        </button>

        <button
          onClick={() => setActiveTab('kebir')}
          className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap flex items-center gap-2 ${
            activeTab === 'kebir'
              ? 'border-brand text-brand'
              : 'border-transparent text-fg-muted hover:text-fg-strong hover:border-line-strong'
          }`}
        >
          <Building2 className="w-4 h-4" />
          Defter-i Kebir (Büyük Defter)
        </button>

        <button
          onClick={() => setActiveTab('financial')}
          className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap flex items-center gap-2 ${
            activeTab === 'financial'
              ? 'border-brand text-brand'
              : 'border-transparent text-fg-muted hover:text-fg-strong hover:border-line-strong'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Mali Tablolar (Gelir/Bilanço)
        </button>

        <button
          onClick={() => setActiveTab('integration')}
          className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap flex items-center gap-2 ${
            activeTab === 'integration'
              ? 'border-brand text-brand'
              : 'border-transparent text-fg-muted hover:text-fg-strong hover:border-line-strong'
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
              ? 'border-brand text-brand'
              : 'border-transparent text-fg-muted hover:text-fg-strong hover:border-line-strong'
          }`}
        >
          <BarChart3 className="w-4 h-4 text-emerald-600" />
          Muhasebe Analiz & Raporlar
        </button>

        <button onClick={() => setActiveTab('periods')} className={`py-3 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${activeTab === 'periods' ? 'border-brand text-brand' : 'border-transparent text-fg-muted'}`}>Dönem Kontrolü ve Kapama</button>
        <div className="ml-auto flex items-center pr-2">
          <Link
            to="/reports?tab=accounting"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-brand-fg bg-brand-soft hover:bg-brand-soft rounded-lg transition-colors whitespace-nowrap"
          >
            <span>Raporlar Merkezi</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {activeTab === 'periods' && <PeriodClosing />}
      {/* TAB 1: Yevmiye Defteri (Journal Entries) */}
      {activeTab === 'entries' && (
        <DataGrid<JournalEntry>
          columns={[
            { key: 'entryNumber', title: 'Yevmiye Fiş No', render: (entry) => <span className="font-mono font-bold text-brand">{entry.entryNumber}</span> },
            { key: 'date', title: 'Tarih', render: (entry) => <span className="text-fg-muted whitespace-nowrap">{new Date(entry.date).toLocaleDateString('tr-TR')}</span>, filterValue: (entry) => new Date(entry.date).toISOString().slice(0, 10) },
            {
              key: 'entryType', title: 'Fiş Tipi',
              render: (entry) => <StatusPill tone={entryTypeMeta[entry.entryType].tone}>{entryTypeMeta[entry.entryType].label}</StatusPill>,
              filterValue: (entry) => entryTypeMeta[entry.entryType].label,
            },
            {
              key: 'description', title: 'Açıklama',
              render: (entry) => (
                <div className="font-medium text-fg-strong max-w-sm truncate">
                  {entry.description}
                  <span className="text-xs text-fg-muted block font-normal">{entry.lines.length} satır kayıt</span>
                </div>
              ),
              filterValue: (entry) => `${entry.entryNumber} ${entry.description} ${entry.documentNumber || ''} ${entry.lines.map(l => `${l.accountCode} ${l.accountName} ${l.description || ''}`).join(' ')}`,
            },
            { key: 'documentNumber', title: 'Belge No', filterable: false, render: (entry) => <span className="font-mono text-xs text-fg-muted">{entry.documentNumber || '-'}</span> },
            { key: 'totalDebit', title: 'Borç Toplamı', align: 'right', render: (entry) => <span className="font-bold text-fg-strong">₺{entry.totalDebit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span> },
            { key: 'totalCredit', title: 'Alacak Toplamı', align: 'right', render: (entry) => <span className="font-bold text-fg-strong">₺{entry.totalCredit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span> },
            {
              key: 'isBalanced', title: 'Denge', align: 'center', filterable: false,
              render: (entry) => entry.isBalanced
                ? <StatusPill tone="green"><span className="inline-flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />Denk</span></StatusPill>
                : <StatusPill tone="red"><span className="inline-flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" />Farklı</span></StatusPill>,
            },
          ]}
          data={filteredEntries}
          rowKey={(entry) => entry.id ?? entry.entryNumber}
          toolbar={
            <div className="flex items-center gap-2">
              <select
                value={entryTypeFilter}
                onChange={(e) => setEntryTypeFilter(e.target.value)}
                className="text-xs border border-line-strong rounded-md py-1.5 px-2.5 bg-white dark:bg-slate-900 text-fg"
              >
                <option value="all">Tüm Fiş Türleri</option>
                <option value="mahsup">Mahsup Fişleri</option>
                <option value="tahsil">Tahsil Fişleri</option>
                <option value="tediye">Tediye Fişleri</option>
                <option value="acilis">Açılış Fişleri</option>
              </select>
            </div>
          }
          onRowClick={(entry) => setDetailEntry(entry)}
          rowActions={(entry) => (
            <div className="inline-flex items-center gap-1">
              <button
                onClick={() => setSelectedEntryForPrint(entry)}
                className="p-1.5 text-fg-muted hover:text-brand hover:bg-surface-hover rounded"
                title="Resmi Fişi Görüntüle / Yazdır"
              >
                <Printer className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleDeleteEntry(entry.id!)}
                className="p-1.5 text-fg-muted hover:text-rose-600 hover:bg-surface-hover rounded"
                title="Fişi Sil"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
          emptyMessage="Kayıtlı yevmiye fişi bulunmamaktadır."
        />
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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3.5 rounded-lg border border-line">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-xs font-semibold text-fg cursor-pointer">
                <input
                  type="checkbox"
                  checked={mizanOnlyBalance}
                  onChange={(e) => setMizanOnlyBalance(e.target.checked)}
                  className="rounded border-line-strong text-brand focus:ring-ring"
                />
                Sadece Bakiyesi Olan Hesapları Göster
              </label>

              <select
                value={mizanLevelFilter}
                onChange={(e) => setMizanLevelFilter(e.target.value as any)}
                className="text-xs border border-line-strong rounded-md py-1.5 px-2.5 bg-white dark:bg-slate-900 text-fg"
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
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-brand/30 bg-brand-soft hover:bg-brand-soft rounded-lg text-xs font-semibold text-brand-fg shadow-sm transition-colors"
              title="Resmi Mizan Cetveli Önizleme ve Yazdırma"
            >
              <Printer className="w-3.5 h-3.5" />
              Mizanı Yazdır
            </button>
          </div>

          <DataGrid<MizanRow>
            columns={[
              {
                key: 'code',
                title: 'Hesap Kodu',
                width: '8rem',
                render: (r) => (
                  <span className={`font-mono font-medium ${r.level <= 2 ? 'font-bold text-fg-strong' : ''}`}>{r.code}</span>
                ),
              },
              {
                key: 'name',
                title: 'Hesap Adı',
                render: (r) => <span className={r.level <= 2 ? 'font-bold text-fg-strong' : ''}>{r.name}</span>,
              },
              {
                key: 'totalDebit',
                title: 'Toplam Borç (₺)',
                align: 'right',
                render: (r) => <span className="font-mono">{r.totalDebit > 0 ? r.totalDebit.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '-'}</span>,
              },
              {
                key: 'totalCredit',
                title: 'Toplam Alacak (₺)',
                align: 'right',
                render: (r) => <span className="font-mono">{r.totalCredit > 0 ? r.totalCredit.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '-'}</span>,
              },
              {
                key: 'debitBalance',
                title: 'Borç Bakiyesi (₺)',
                align: 'right',
                render: (r) => <span className="font-mono font-bold text-emerald-700">{r.debitBalance > 0 ? r.debitBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '-'}</span>,
              },
              {
                key: 'creditBalance',
                title: 'Alacak Bakiyesi (₺)',
                align: 'right',
                render: (r) => <span className="font-mono font-bold text-blue-700">{r.creditBalance > 0 ? r.creditBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '-'}</span>,
              },
            ]}
            data={mizanRows}
            rowKey={(r) => `${r.code}-${r.level}`}
            loading={mizanLoading}
            emptyMessage="Kriterlere uygun mizan kaydı bulunamadı."
          />
        </div>
      )}

      {/* TAB 4: Defter-i Kebir (Büyük Defter) */}
      {activeTab === 'kebir' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3.5 rounded-lg border border-line">
            <div className="flex items-center gap-3">
              <label className="text-xs font-semibold text-fg whitespace-nowrap">
                Hesap Seçimi:
              </label>
              <select
                value={selectedKebirCode}
                onChange={(e) => setSelectedKebirCode(e.target.value)}
                className="text-xs border border-line-strong rounded-md py-1.5 px-2.5 bg-white dark:bg-slate-900 text-fg-strong font-mono font-bold min-w-[280px]"
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
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-brand/30 bg-brand-soft hover:bg-brand-soft rounded-lg text-xs font-semibold text-brand-fg shadow-sm transition-colors"
              title="Defter-i Kebir Ekstresi Önizleme ve Yazdırma"
            >
              <Printer className="w-3.5 h-3.5" />
              Ekstreyi Yazdır
            </button>
          </div>

          <DataGrid<(typeof kebirLines)[number]>
            columns={[
              {
                key: 'entryNumber',
                title: 'Yevmiye Fiş No',
                width: '9rem',
                render: (row) => <span className="font-mono font-bold text-brand">{row.entryNumber}</span>,
              },
              {
                key: 'date',
                title: 'Tarih',
                width: '7rem',
                render: (row) => <span className="whitespace-nowrap">{new Date(row.date).toLocaleDateString('tr-TR')}</span>,
                filterValue: (row) => new Date(row.date).toLocaleDateString('tr-TR'),
              },
              { key: 'description', title: 'Açıklama' },
              {
                key: 'debit',
                title: 'Borç (₺)',
                align: 'right',
                render: (row) => <span className="font-mono font-bold">{row.debit > 0 ? row.debit.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '-'}</span>,
              },
              {
                key: 'credit',
                title: 'Alacak (₺)',
                align: 'right',
                render: (row) => <span className="font-mono font-bold">{row.credit > 0 ? row.credit.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '-'}</span>,
              },
              {
                key: 'balance',
                title: 'Bakiye (₺)',
                align: 'right',
                render: (row) => (
                  <span className={`font-mono font-bold ${row.balance >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    ₺{Math.abs(row.balance).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {row.balance >= 0 ? '(B)' : '(A)'}
                  </span>
                ),
              },
            ]}
            data={kebirLines}
            rowKey={(row) => `${row.entryNumber}-${row.debit}-${row.credit}-${row.balance}`}
            loading={kebirLoading}
            emptyMessage="Bu hesap için henüz yevmiye hareketi bulunmuyor."
          />
        </div>
      )}

      {/* TAB 5: Mali Tablolar (Gelir Tablosu & Bilanço) */}
      {activeTab === 'financial' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* GELİR TABLOSU */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-line p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h2 className="text-base font-bold text-fg-strong">Özet Gelir Tablosu (6 Grubu)</h2>
              <span className="text-xs text-fg-muted">TL Bazında</span>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between py-1.5 border-b border-line">
                <span className="font-semibold text-fg-strong">A. BRÜT SATIŞLAR (600)</span>
                <span className="font-mono font-bold text-fg-strong">₺{sales600.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
              </div>

              <div className="flex justify-between py-1.5 border-b border-line text-fg-muted pl-4">
                <span>B. Satış İndirimleri (-)</span>
                <span className="font-mono">₺0,00</span>
              </div>

              <div className="flex justify-between py-1.5 bg-surface-raised px-2 rounded font-bold">
                <span>NET SATIŞLAR</span>
                <span className="font-mono text-brand-fg">₺{sales600.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
              </div>

              <div className="flex justify-between py-1.5 border-b border-line text-rose-600 pl-4">
                <span>C. Satışların Maliyeti (620) (-)</span>
                <span className="font-mono">-₺{cogs620.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
              </div>

              <div className="flex justify-between py-1.5 bg-brand-soft/50 px-2 rounded font-bold">
                <span>BRÜT SATIŞ KÂRI / ZARARI</span>
                <span className="font-mono text-brand-fg">₺{(sales600 - cogs620).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
              </div>

              <div className="flex justify-between py-1.5 border-b border-line text-rose-600 pl-4">
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
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-line p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h2 className="text-base font-bold text-fg-strong">Özet Bilanço Göstergesi</h2>
              <span className="text-xs text-fg-muted">Aktif = Pasif</span>
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

              <div className="text-xs text-fg-muted italic bg-surface-raised p-2.5 rounded">
                * Bilanço kalemleri, Tek Düzen Hesap Planındaki 1-5 sınıf hesaplarının yevmiye kapanış bakiyelerinden anlık olarak üretilmektedir.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: Entegrasyon Merkezi */}
      {activeTab === 'integration' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-line p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-fg-strong">ERP Modülleri Otomatik TDHP Entegrasyonu</h2>
                <p className="text-xs text-fg-muted mt-1">
                  Faturalar (Satış/Alış) ve Tahsilat/Tediye makbuzlarının Tek Düzen Hesap Planına tek tıkla toplu aktarımı
                </p>
              </div>

              <button
                onClick={handleAutoAccountInvoices}
                disabled={integrating || unaccountedInvoicesCount === 0}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand-hover shadow-sm transition-colors disabled:opacity-50"
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
          <DataGrid<Invoice>
            columns={[
              {
                key: 'invoiceNumber',
                title: 'Fatura No',
                render: (inv) => <span className="font-mono font-medium text-brand">{inv.invoiceNumber}</span>,
              },
              {
                key: 'date',
                title: 'Tarih',
                render: (inv) => <span className="text-fg-muted">{new Date(inv.date).toLocaleDateString('tr-TR')}</span>,
                filterValue: (inv) => new Date(inv.date).toLocaleDateString('tr-TR'),
              },
              {
                key: 'type',
                title: 'Tür',
                render: (inv) => <span className="text-xs font-semibold">{inv.type === 'sales' ? 'Satış Faturası' : 'Alış Faturası'}</span>,
                filterValue: (inv) => (inv.type === 'sales' ? 'Satış Faturası' : 'Alış Faturası'),
              },
              {
                key: 'contact',
                title: 'Cari',
                render: (inv) => (
                  <span className="font-medium text-fg-strong">
                    {contacts.find(c => c.id === inv.contactId)?.name || `Cari #${inv.contactId}`}
                  </span>
                ),
                filterValue: (inv) => contacts.find(c => c.id === inv.contactId)?.name || '',
              },
              {
                key: 'grandTotal',
                title: 'Tutar',
                align: 'right',
                render: (inv) => <span className="font-bold">₺{inv.grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>,
              },
              {
                key: 'tdhp',
                title: 'TDHP Durumu',
                align: 'center',
                render: (inv) =>
                  accountedDocIds.has(inv.id) ? (
                    <StatusPill tone="green"><CheckCircle2 className="w-3.5 h-3.5" /> Muhasebeleşti</StatusPill>
                  ) : (
                    <StatusPill tone="amber"><AlertCircle className="w-3.5 h-3.5" /> Bekliyor</StatusPill>
                  ),
                filterValue: (inv) => (accountedDocIds.has(inv.id) ? 'Muhasebeleşti' : 'Bekliyor'),
              },
            ]}
            data={invoices}
            rowKey="id"
            emptyMessage="Henüz kayıtlı fatura bulunmuyor."
            toolbar={<h3 className="text-sm font-bold text-fg-strong">Faturaların Muhasebe Durumu</h3>}
            rowActions={(inv) =>
              accountedDocIds.has(inv.id) ? null : (
                <button
                  onClick={async () => {
                    await accountingService.createInvoiceJournalEntry(inv.id!);
                    showToast(`${inv.invoiceNumber} faturası başarıyla muhasebeleştirildi.`, 'success');
                  }}
                  className="text-xs text-brand hover:text-brand-fg font-semibold whitespace-nowrap"
                >
                  Şimdi Muhasebeleştir
                </button>
              )
            }
          />
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
        onSuccess={() => showToast('Yevmiye fişi başarıyla kaydedildi.', 'success')}
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
        onSuccess={() => showToast('Yeni alt hesap başarıyla açıldı.', 'success')}
      />

      {/* JOURNAL ENTRY SUMMARY DETAIL PANEL */}
      {detailEntry && (() => {
        const typeMeta = entryTypeMeta[detailEntry.entryType];
        const toneMap: Record<string, 'success' | 'danger' | 'warning' | 'info' | 'brand' | 'neutral'> = {
          green: 'success', red: 'danger', violet: 'brand', blue: 'info', slate: 'neutral',
        };
        return (
          <DetailPanel
            isOpen={!!detailEntry}
            onClose={() => setDetailEntry(null)}
            title={detailEntry.entryNumber}
            widthClass="max-w-[480px]"
            badge={(
              <StatusBadge tone={typeMeta ? toneMap[typeMeta.tone] : 'neutral'}>
                {typeMeta?.label ?? detailEntry.entryType}
              </StatusBadge>
            )}
            footer={(
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => { const e = detailEntry; setDetailEntry(null); setSelectedEntryForPrint(e); }}
                  className="inline-flex items-center justify-center gap-1.5 rounded-control bg-brand px-3 py-2 text-xs font-black text-white transition-colors hover:bg-brand-hover cursor-pointer"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Fişi Yazdır
                </button>
                <button
                  type="button"
                  onClick={() => { const id = detailEntry.id; setDetailEntry(null); if (id) handleDeleteEntry(id); }}
                  className="inline-flex items-center justify-center gap-1.5 rounded-control border border-danger/30 bg-danger-soft px-3 py-2 text-xs font-black text-danger transition-colors hover:bg-danger-soft cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Fişi Sil
                </button>
              </div>
            )}
          >
            <div className="space-y-4">
              <DetailSummary
                label="Fiş Tutarı"
                value={detailEntry.totalDebit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                unit="₺"
                tone={detailEntry.isBalanced ? 'success' : 'danger'}
                badge={detailEntry.isBalanced ? 'Borç = Alacak' : 'Dengesiz'}
              >
                <div className="mt-2 grid grid-cols-2 gap-2 text-center">
                  <div>
                    <div className="text-label font-bold uppercase text-fg-muted">Borç</div>
                    <div className="font-mono text-xs font-black text-fg-strong">₺{detailEntry.totalDebit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</div>
                  </div>
                  <div>
                    <div className="text-label font-bold uppercase text-fg-muted">Alacak</div>
                    <div className="font-mono text-xs font-black text-fg-strong">₺{detailEntry.totalCredit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</div>
                  </div>
                </div>
              </DetailSummary>

              <DetailSection
                title="Fiş Bilgileri"
                rows={[
                  { label: 'Tarih', value: new Date(detailEntry.date).toLocaleDateString('tr-TR') },
                  { label: 'Belge No', value: detailEntry.documentNumber || '—' },
                  { label: 'Durum', value: detailEntry.status === 'approved' ? 'Onaylı' : 'Taslak' },
                  { label: 'Açıklama', value: detailEntry.description || '—' },
                ]}
              />

              <DetailSection title={`Mizan Kayıtları (${detailEntry.lines.length})`}>
                <div className="divide-y divide-line overflow-hidden rounded-card border border-line">
                  {detailEntry.lines.map((line) => (
                    <div key={line.id} className="px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-label font-black text-brand-fg">{line.accountCode}</span>
                        <span className="truncate text-xs font-bold text-fg-strong">{line.accountName}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2 font-mono text-2xs">
                        <span className={line.debit > 0 ? 'font-black text-fg-strong' : 'text-fg-muted'}>
                          B {line.debit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                        </span>
                        <span className={line.credit > 0 ? 'font-black text-fg-strong' : 'text-fg-muted'}>
                          A {line.credit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      {line.description && (
                        <div className="mt-0.5 truncate text-label font-semibold text-fg-muted">{line.description}</div>
                      )}
                    </div>
                  ))}
                </div>
              </DetailSection>
            </div>
          </DetailPanel>
        );
      })()}

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

      {/* MODAL: TDHP Hesap Silme (ortak silme motoru — Kademe 2) */}
      {accountToDelete && (
        <DeleteConfirmModal
          resource="accounts"
          id={accountToDelete.id ?? null}
          title="TDHP Hesabını Sil"
          onClose={() => setAccountToDelete(null)}
          onDeleted={() => setAccountToDelete(null)}
        />
      )}
    </div>
  );
}
