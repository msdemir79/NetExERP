import { useState } from 'react';
import { useApiQuery } from '../hooks/useApiQuery';
import { api } from '../api/client';
import {
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
  Landmark,
  FileCheck,
  ArrowRightLeft,
  Printer,
  CheckCircle2,
  Clock,
  Building2,
  TrendingUp,
  CreditCard,
  Edit3,
  Trash2,
  BarChart3,
  ExternalLink,
  FileText
} from 'lucide-react';
import { Link } from 'react-router-dom';
import PageHeader from './PageHeader';
import DataGrid, { StatusPill, type PillTone } from './Common/DataGrid';
import KpiCard from './Common/KpiCard';
import DetailPanel from './Common/DetailPanel';
import { DetailSection, DetailSummary, DetailTiles } from './Common/DetailPanelContent';
import StatusBadge from './Common/StatusBadge';
import Button from './Common/Button';
import EditCashBoxModal from './Finance/EditCashBoxModal';
import EditBankAccountModal from './Finance/EditBankAccountModal';
import DeleteConfirmModal from './Common/DeleteConfirmModal';
import CashStatementModal from './Finance/CashStatementModal';
import BankStatementModal from './Finance/BankStatementModal';
import CheckHistoryModal from './Finance/CheckHistoryModal';
import FinanceReport from './Reports/FinanceReport';
import { AgingAnalysisTab } from './Finance/AgingAnalysisTab';
import ContactStatementModal from './Contacts/ContactStatementModal';
import ReceiptFormModal from './Finance/ReceiptFormModal';
import VirmanModal from './Finance/VirmanModal';
import CheckActionModal from './Finance/CheckActionModal';
import NewCashBoxModal from './Finance/NewCashBoxModal';
import NewBankAccountModal from './Finance/NewBankAccountModal';
import ReceiptPrintPreviewModal from './Finance/ReceiptPrintPreviewModal';
import type { 
  CollectionReceipt, 
  CashBox, 
  BankAccount, 
  CheckNote, 
  CheckStatus, 
  ReceiptType, 
  PaymentInstrument,
  Contact
} from '../types';

export default function Finance() {
  const [activeTab, setActiveTab] = useState<'receipts' | 'cash' | 'bank' | 'checks' | 'aging' | 'reports'>('receipts');
  
  // Queries
  const systemSettings = useApiQuery(() => api.settings.get('global_settings'), [], ['settings']);
  const companySettings = systemSettings?.company;
  const receipts = useApiQuery(() => api.collectionReceipts.list({ orderBy: 'date', orderDir: 'desc' }), [], ['collectionReceipts']) || [];
  const cashBoxes = useApiQuery(() => api.cashBoxes.list(), [], ['cashBoxes']) || [];
  const bankAccounts = useApiQuery(() => api.bankAccounts.list(), [], ['bankAccounts']) || [];
  const checks = useApiQuery(() => api.checks.list({ orderBy: 'dueDate' }), [], ['checks']) || [];
  const contacts = useApiQuery(() => api.contacts.list({ orderBy: 'name' }), [], ['contacts']) || [];
  const invoices = useApiQuery(() => api.invoices.list({ where: { paymentStatus: { op: 'ne', value: 'paid' } } }), [], ['invoices']) || [];

  // Modals state
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [receiptType, setReceiptType] = useState<ReceiptType>('collection');
  const [isVirmanModalOpen, setIsVirmanModalOpen] = useState(false);
  const [isCashBoxModalOpen, setIsCashBoxModalOpen] = useState(false);
  const [isBankAccountModalOpen, setIsBankAccountModalOpen] = useState(false);
  const [selectedReceiptForPrint, setSelectedReceiptForPrint] = useState<CollectionReceipt | null>(null);

  // Statement & History Modals
  const [selectedCashBoxForStatement, setSelectedCashBoxForStatement] = useState<CashBox | null>(null);
  const [selectedBankAccountForStatement, setSelectedBankAccountForStatement] = useState<BankAccount | null>(null);
  const [selectedCheckForHistory, setSelectedCheckForHistory] = useState<CheckNote | null>(null);
  const [selectedContactForStatement, setSelectedContactForStatement] = useState<Contact | null>(null);
  const [isStatementModalOpen, setIsStatementModalOpen] = useState(false);

  // Düzenleme ve Silme Modal Durumları (Kasa & Banka)
  const [editingCashBox, setEditingCashBox] = useState<CashBox | null>(null);
  const [editingBankAccount, setEditingBankAccount] = useState<BankAccount | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'cash' | 'bank';
    target: CashBox | BankAccount;
  } | null>(null);

  // Check Action Modal
  const [selectedCheckForAction, setSelectedCheckForAction] = useState<CheckNote | null>(null);
  const [checkActionType, setCheckActionType] = useState<'collect' | 'endorse' | 'bank_collection' | 'bounce'>('collect');

  // Detail panels (DMR Kinetiq)
  const [detailReceipt, setDetailReceipt] = useState<CollectionReceipt | null>(null);
  const [detailCashBox, setDetailCashBox] = useState<CashBox | null>(null);
  const [detailBank, setDetailBank] = useState<BankAccount | null>(null);
  const [detailCheck, setDetailCheck] = useState<CheckNote | null>(null);

  // Filters
  const [filterReceiptType, setFilterReceiptType] = useState<'all' | 'collection' | 'disbursement'>('all');
  const [filterInstrument, setFilterInstrument] = useState<string>('all');
  const [filterCheckStatus, setFilterCheckStatus] = useState<string>('all');
  const [filterCheckType, setFilterCheckType] = useState<string>('all');

  // Form State for Receipt
  const [receiptContactId, setReceiptContactId] = useState<number | ''>('');

  // Overall Financial Stats
  const totalCashBalance = cashBoxes.reduce((sum, c) => sum + (c.balance || 0), 0);
  const totalBankBalance = bankAccounts.reduce((sum, b) => sum + (b.balance || 0), 0);
  
  const portfolioChecks = checks.filter(c => c.type === 'received_check' && (c.status === 'portfolio' || c.status === 'bank_collection'));
  const totalPortfolioChecks = portfolioChecks.reduce((sum, c) => sum + (c.amount || 0), 0);

  const payableGivenChecks = checks.filter(c => c.type === 'given_check' && c.status === 'portfolio');
  const totalPayableGivenChecks = payableGivenChecks.reduce((sum, c) => sum + (c.amount || 0), 0);

  // Filtered Receipts
  const filteredReceipts = receipts.filter(r => {
    if (filterReceiptType !== 'all' && r.type !== filterReceiptType) return false;
    if (filterInstrument !== 'all' && r.instrument !== filterInstrument) return false;
    return true;
  });

  // Filtered Checks
  const filteredChecks = checks.filter(c => {
    if (filterCheckType !== 'all' && c.type !== filterCheckType) return false;
    if (filterCheckStatus !== 'all' && c.status !== filterCheckStatus) return false;
    return true;
  });

  const checkStatusMeta: Record<CheckStatus, { tone: PillTone; label: string }> = {
    portfolio: { tone: 'blue', label: 'Cüzdanda (Portföy)' },
    bank_collection: { tone: 'blue', label: 'Tahsilde (Banka)' },
    collected: { tone: 'green', label: 'Tahsil Edildi' },
    endorsed: { tone: 'violet', label: 'Ciro Edildi' },
    bounced: { tone: 'red', label: 'Karşılıksız / Protesto' },
    returned: { tone: 'slate', label: 'İade Edildi' },
  };

  const checkTypeLabel = (t: CheckNote['type']) =>
    t === 'received_check' ? 'Alınan Çek' : t === 'given_check' ? 'Verilen Çek' : t === 'received_note' ? 'Alınan Senet' : 'Verilen Senet';

  const instrumentLabel = (i: PaymentInstrument) =>
    i === 'cash' ? 'Nakit Kasa' : i === 'bank' ? 'Banka Transferi' : i === 'check' ? 'Çek/Senet' : 'Kredi Kartı';

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <PageHeader
        title="Finans, Kasa & Banka Yönetimi"
        subtitle="Likit varlıklar, nakit kasalar, banka hesapları ve müşteri/tedarikçi çek portföyü"
        badge="Finans & Tahsilat"
        icon={Landmark}
        iconColor="emerald"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              icon={<ArrowDownLeft className="h-3.5 w-3.5 text-success" />}
              onClick={() => {
                setReceiptType('collection');
                setIsReceiptModalOpen(true);
              }}
            >
              Tahsilat Al
            </Button>

            <Button
              variant="secondary"
              icon={<ArrowUpRight className="h-3.5 w-3.5 text-danger" />}
              onClick={() => {
                setReceiptType('disbursement');
                setIsReceiptModalOpen(true);
              }}
            >
              Ödeme Yap
            </Button>

            <Button
              variant="primary"
              icon={<ArrowRightLeft className="h-3.5 w-3.5" />}
              onClick={() => setIsVirmanModalOpen(true)}
            >
              Virman Transferi
            </Button>
          </div>
        }
      />

      {/* Financial KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Toplam Nakit Kasa"
          value={`₺${totalCashBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`}
          sub={`${cashBoxes.length} adet aktif kasa`}
          icon={Wallet}
          tone="success"
        />
        <KpiCard
          label="Toplam Banka Mevduatı"
          value={`₺${totalBankBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`}
          sub={`${bankAccounts.length} adet banka hesabı`}
          icon={Landmark}
          tone="info"
        />
        <KpiCard
          label="Portföydeki Çekler"
          value={`₺${totalPortfolioChecks.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`}
          sub={`${portfolioChecks.length} adet alınan çek`}
          icon={FileCheck}
          tone="brand"
        />
        <KpiCard
          label="Ödenecek Firma Çekleri"
          value={`₺${totalPayableGivenChecks.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`}
          sub={`${payableGivenChecks.length} adet ödeme bekleyen çek`}
          icon={Clock}
          tone="warning"
        />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-line space-x-8">
        <button
          onClick={() => setActiveTab('receipts')}
          className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${
            activeTab === 'receipts'
              ? 'border-brand text-brand'
              : 'border-transparent text-fg-muted hover:text-fg-strong hover:border-line-strong'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          Tahsilat & Tediye Makbuzları
          <span className="ml-1.5 py-0.5 px-2 rounded-full text-xs bg-surface-hover text-fg-muted font-semibold">
            {receipts.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('cash')}
          className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${
            activeTab === 'cash'
              ? 'border-brand text-brand'
              : 'border-transparent text-fg-muted hover:text-fg-strong hover:border-line-strong'
          }`}
        >
          <Wallet className="w-4 h-4" />
          Kasa Yönetimi
          <span className="ml-1.5 py-0.5 px-2 rounded-full text-xs bg-surface-hover text-fg-muted font-semibold">
            {cashBoxes.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('bank')}
          className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${
            activeTab === 'bank'
              ? 'border-brand text-brand'
              : 'border-transparent text-fg-muted hover:text-fg-strong hover:border-line-strong'
          }`}
        >
          <Landmark className="w-4 h-4" />
          Banka Hesapları
          <span className="ml-1.5 py-0.5 px-2 rounded-full text-xs bg-surface-hover text-fg-muted font-semibold">
            {bankAccounts.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('checks')}
          className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${
            activeTab === 'checks'
              ? 'border-brand text-brand'
              : 'border-transparent text-fg-muted hover:text-fg-strong hover:border-line-strong'
          }`}
        >
          <FileCheck className="w-4 h-4" />
          Çek - Senet Portföyü
          <span className="ml-1.5 py-0.5 px-2 rounded-full text-xs bg-surface-hover text-fg-muted font-semibold">
            {checks.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('aging')}
          className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${
            activeTab === 'aging'
              ? 'border-brand text-brand'
              : 'border-transparent text-fg-muted hover:text-fg-strong hover:border-line-strong'
          }`}
        >
          <TrendingUp className="w-4 h-4 text-brand" />
          <span>Vade & Yaşlandırma Analizi</span>
          <span className="ml-1 py-0.5 px-2 rounded-full text-[10px] bg-brand-soft text-brand-fg font-bold border border-brand/30">
            Nakit Akışı
          </span>
        </button>

        <button
          onClick={() => setActiveTab('reports')}
          className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${
            activeTab === 'reports'
              ? 'border-brand text-brand'
              : 'border-transparent text-fg-muted hover:text-fg-strong hover:border-line-strong'
          }`}
        >
          <BarChart3 className="w-4 h-4 text-emerald-600" />
          Finans & Likidite Raporu
        </button>

        <div className="ml-auto flex items-center pr-2">
          <Link
            to="/reports?tab=finance"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-brand-fg bg-brand-soft hover:bg-brand-soft rounded-lg transition-colors"
          >
            <span>Raporlar Merkezi</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* TAB CONTENT: Receipts */}
      {activeTab === 'receipts' && (
        <DataGrid<CollectionReceipt>
          columns={[
            { key: 'receiptNumber', title: 'Makbuz No', render: (rc) => <span className="font-mono font-medium text-brand">{rc.receiptNumber}</span> },
            { key: 'date', title: 'Tarih', render: (rc) => <span className="text-fg-muted whitespace-nowrap">{new Date(rc.date).toLocaleDateString('tr-TR')}</span>, filterValue: (rc) => new Date(rc.date).toISOString().slice(0, 10) },
            {
              key: 'type', title: 'İşlem Türü',
              render: (rc) => rc.type === 'collection'
                ? <StatusPill tone="green"><span className="inline-flex items-center gap-1"><ArrowDownLeft className="w-3.5 h-3.5" />Tahsilat</span></StatusPill>
                : <StatusPill tone="red"><span className="inline-flex items-center gap-1"><ArrowUpRight className="w-3.5 h-3.5" />Tediye</span></StatusPill>,
              filterValue: (rc) => rc.type === 'collection' ? 'Tahsilat' : 'Tediye',
            },
            { key: 'contactName', title: 'Cari Hesap', render: (rc) => <span className="font-medium text-fg-strong">{rc.contactName}</span> },
            { key: 'instrument', title: 'Ödeme Aracı', render: (rc) => <span className="text-xs text-fg-muted bg-surface-hover px-2 py-0.5 rounded">{instrumentLabel(rc.instrument)}</span>, filterValue: (rc) => instrumentLabel(rc.instrument) },
            {
              key: 'amount', title: 'Tutar', align: 'right',
              render: (rc) => <span className={`font-bold ${rc.type === 'collection' ? 'text-emerald-600' : 'text-rose-600'}`}>{rc.type === 'collection' ? '+' : '-'}₺{rc.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>,
            },
            { key: 'description', title: 'Açıklama', render: (rc) => <span className="text-fg-muted">{rc.description || '-'}</span> },
            {
              key: 'journalEntryId', title: 'TDHP Kaydı', align: 'center', filterable: false,
              render: (rc) => rc.journalEntryId
                ? <StatusPill tone="green"><span className="inline-flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />Yevmiye #{rc.journalEntryId}</span></StatusPill>
                : <StatusPill tone="amber">Bekliyor</StatusPill>,
            },
          ]}
          data={filteredReceipts}
          rowKey="id"
          onRowClick={(rc) => setDetailReceipt(rc)}
          toolbar={
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={filterReceiptType}
                onChange={(e) => setFilterReceiptType(e.target.value as any)}
                className="text-xs border border-line-strong rounded-md py-1.5 px-2.5 bg-white dark:bg-slate-900 text-fg focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="all">Tüm Makbuzlar</option>
                <option value="collection">Sadece Tahsilat (Giriş)</option>
                <option value="disbursement">Sadece Tediye (Ödeme)</option>
              </select>

              <select
                value={filterInstrument}
                onChange={(e) => setFilterInstrument(e.target.value)}
                className="text-xs border border-line-strong rounded-md py-1.5 px-2.5 bg-white dark:bg-slate-900 text-fg focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="all">Tüm Ödeme Araçları</option>
                <option value="cash">Nakit (Kasa)</option>
                <option value="bank">Banka (EFT/Havale)</option>
                <option value="check">Çek / Senet</option>
                <option value="credit_card">Kredi Kartı</option>
              </select>
            </div>
          }
          rowActions={(rc) => (
            <button
              onClick={() => setSelectedReceiptForPrint(rc)}
              className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-brand p-1 rounded hover:bg-surface-hover transition-colors"
              title="Makbuzu Yazdır"
            >
              <Printer className="w-4 h-4" />
            </button>
          )}
          emptyMessage="Henüz tahsilat veya tediye makbuzu bulunmuyor."
        />
      )}

      {/* TAB CONTENT: Cash Boxes */}
      {activeTab === 'cash' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-fg-strong">Nakit Kasalar</h2>
            <button
              onClick={() => setIsCashBoxModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand text-white text-xs font-medium hover:bg-brand-hover shadow-sm transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Yeni Kasa Tanımla
            </button>
          </div>

          <DataGrid<CashBox>
            columns={[
              { key: 'code', title: 'Kasa Kodu', render: (box) => <span className="font-mono text-xs text-brand font-semibold bg-brand-soft px-2 py-0.5 rounded">{box.code}</span> },
              { key: 'name', title: 'Kasa Adı', render: (box) => <span className="text-base font-bold text-fg-strong">{box.name}</span> },
              { key: 'responsiblePerson', title: 'Sorumlu', render: (box) => <span className="text-fg-muted">{box.responsiblePerson || 'Belirtilmedi'}</span> },
              { key: 'accountCode', title: 'TDHP Hesabı', render: (box) => <span className="font-mono text-xs text-fg-muted">TDHP: {box.accountCode}</span> },
              {
                key: 'balance', title: 'Mevcut Bakiye', align: 'right',
                render: (box) => <span className={`font-bold ${box.balance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>₺{box.balance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>,
              },
              { key: 'notes', title: 'Notlar', render: (box) => box.notes ? <span className="text-xs text-fg-muted">{box.notes}</span> : <span className="text-fg-muted">-</span> },
            ]}
            data={cashBoxes}
            rowKey="id"
            onRowClick={(box) => setDetailCashBox(box)}
            rowActions={(box) => (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedCashBoxForStatement(box)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors cursor-pointer"
                  title="Kasa ekstresi ve hareket raporu"
                >
                  <FileText className="w-3.5 h-3.5 text-emerald-600" />
                  Ekstre
                </button>
                <button
                  type="button"
                  onClick={() => setEditingCashBox(box)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-brand-fg bg-slate-100 dark:bg-slate-800 hover:bg-brand-soft border border-slate-200 dark:border-slate-700 hover:border-brand/30 rounded-lg transition-colors cursor-pointer"
                  title="Kasa kartı ve bakiyesini düzenle"
                >
                  <Edit3 className="w-3.5 h-3.5 text-brand" />
                  Düzenle
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget({ type: 'cash', target: box })}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors cursor-pointer"
                  title="Kasayı sil"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                  Sil
                </button>
              </div>
            )}
            emptyMessage="Henüz kasa tanımlanmamış."
          />
        </div>
      )}

      {/* TAB CONTENT: Bank Accounts */}
      {activeTab === 'bank' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-fg-strong">Banka Hesapları</h2>
            <button
              onClick={() => setIsBankAccountModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand text-white text-xs font-medium hover:bg-brand-hover shadow-sm transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Yeni Banka Hesabı Tanımla
            </button>
          </div>

          <DataGrid<BankAccount>
            columns={[
              { key: 'bankName', title: 'Banka', render: (acc) => <span className="font-semibold text-sm text-fg-strong inline-flex items-center gap-1.5"><Building2 className="w-4 h-4 text-blue-600" />{acc.bankName}</span> },
              { key: 'branchName', title: 'Şube / Hesap No', render: (acc) => <span className="text-xs text-fg-muted">{acc.branchName || 'Merkez'} - {acc.accountNumber || ''}</span>, filterValue: (acc) => `${acc.branchName || ''} ${acc.accountNumber || ''}` },
              { key: 'iban', title: 'IBAN', render: (acc) => <span className="font-mono text-xs font-medium text-fg bg-surface-raised px-2 py-1 rounded border border-line select-all">{acc.iban}</span> },
              { key: 'accountCode', title: 'TDHP Hesabı', render: (acc) => <span className="font-mono text-xs text-fg-muted">TDHP: {acc.accountCode}</span> },
              {
                key: 'balance', title: 'Mevduat Bakiyesi', align: 'right',
                render: (acc) => <span className={`font-bold ${acc.balance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>₺{acc.balance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>,
              },
            ]}
            data={bankAccounts}
            rowKey="id"
            onRowClick={(acc) => setDetailBank(acc)}
            rowActions={(acc) => (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedBankAccountForStatement(acc)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors cursor-pointer"
                  title="Banka hesap ekstresi ve hareket raporu"
                >
                  <FileText className="w-3.5 h-3.5 text-blue-600" />
                  Ekstre
                </button>
                <button
                  type="button"
                  onClick={() => setEditingBankAccount(acc)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-brand-fg bg-slate-100 dark:bg-slate-800 hover:bg-brand-soft border border-slate-200 dark:border-slate-700 hover:border-brand/30 rounded-lg transition-colors cursor-pointer"
                  title="Banka hesabı ve bakiyesini düzenle"
                >
                  <Edit3 className="w-3.5 h-3.5 text-brand" />
                  Düzenle
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget({ type: 'bank', target: acc })}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors cursor-pointer"
                  title="Banka hesabını sil"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                  Sil
                </button>
              </div>
            )}
            emptyMessage="Henüz banka hesabı tanımlanmamış."
          />
        </div>
      )}

      {/* TAB CONTENT: Checks & Notes Portfolio */}
      {activeTab === 'checks' && (
        <DataGrid<CheckNote>
          columns={[
            { key: 'portfolioNumber', title: 'Portföy No', render: (chk) => <span className="font-mono font-medium text-brand">{chk.portfolioNumber}</span> },
            { key: 'type', title: 'Tür', render: (chk) => <span className="text-xs font-medium text-fg-muted">{checkTypeLabel(chk.type)}</span>, filterValue: (chk) => checkTypeLabel(chk.type) },
            { key: 'serialNumber', title: 'Çek / Senet No', render: (chk) => <span className="font-mono text-fg-strong">{chk.serialNumber}</span> },
            { key: 'bankName', title: 'Banka / Şube', render: (chk) => <span className="text-fg-muted">{chk.bankName ? `${chk.bankName} ${chk.branchName ? `(${chk.branchName})` : ''}` : '-'}</span>, filterValue: (chk) => `${chk.bankName || ''} ${chk.branchName || ''}` },
            { key: 'drawer', title: 'Keşideci', render: (chk) => <span className="font-medium text-fg-strong">{chk.drawer}</span> },
            { key: 'contactName', title: 'İlgili Cari', render: (chk) => <span className="text-fg-muted">{chk.contactName}</span> },
            {
              key: 'dueDate', title: 'Vade Tarihi',
              render: (chk) => {
                const isOverdue = new Date(chk.dueDate) < new Date() && chk.status === 'portfolio';
                return (
                  <span className={`whitespace-nowrap font-medium ${isOverdue ? 'text-rose-600 font-bold' : 'text-fg'}`}>
                    {new Date(chk.dueDate).toLocaleDateString('tr-TR')}
                    {isOverdue && <StatusPill tone="red" className="ml-1">Gecikmiş</StatusPill>}
                  </span>
                );
              },
              filterValue: (chk) => new Date(chk.dueDate).toISOString().slice(0, 10),
            },
            { key: 'amount', title: 'Tutar', align: 'right', render: (chk) => <span className="font-bold text-fg-strong">₺{chk.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span> },
            {
              key: 'status', title: 'Durum', align: 'center',
              render: (chk) => <StatusPill tone={checkStatusMeta[chk.status].tone}>{checkStatusMeta[chk.status].label}</StatusPill>,
              filterValue: (chk) => checkStatusMeta[chk.status].label,
            },
          ]}
          data={filteredChecks}
          rowKey="id"
          onRowClick={(chk) => setDetailCheck(chk)}
          toolbar={
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={filterCheckType}
                onChange={(e) => setFilterCheckType(e.target.value)}
                className="text-xs border border-line-strong rounded-md py-1.5 px-2.5 bg-white dark:bg-slate-900 text-fg"
              >
                <option value="all">Tüm Çek/Senet Türleri</option>
                <option value="received_check">Alınan Çek (Müşteri)</option>
                <option value="given_check">Verilen Çek (Firma)</option>
                <option value="received_note">Alınan Senet</option>
                <option value="given_note">Verilen Senet</option>
              </select>

              <select
                value={filterCheckStatus}
                onChange={(e) => setFilterCheckStatus(e.target.value)}
                className="text-xs border border-line-strong rounded-md py-1.5 px-2.5 bg-white dark:bg-slate-900 text-fg"
              >
                <option value="all">Tüm Durumlar</option>
                <option value="portfolio">Cüzdanda (Portföy)</option>
                <option value="bank_collection">Tahsilde (Bankada)</option>
                <option value="collected">Tahsil Edildi</option>
                <option value="endorsed">Ciro Edildi</option>
                <option value="bounced">Karşılıksız</option>
              </select>

              <button
                type="button"
                onClick={() => setActiveTab('reports')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-soft hover:bg-brand-soft text-brand-fg border border-brand/30 text-xs font-semibold rounded-md shadow-xs transition-colors cursor-pointer"
                title="Çek ve Senet Raporu & Yaşlandırma Ekstresi"
              >
                <BarChart3 className="w-3.5 h-3.5 text-brand" />
                <span className="hidden sm:inline">Çek/Senet Raporu</span>
              </button>
            </div>
          }
          rowActions={(chk) => (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedCheckForHistory(chk)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-brand-fg bg-slate-100 dark:bg-slate-800 hover:bg-brand-soft border border-slate-200 dark:border-slate-700 px-2 py-1 rounded transition-colors cursor-pointer"
                title="Çek hareket geçmişi ve bordro kartı"
              >
                <FileText className="w-3.5 h-3.5 text-brand" />
                <span className="hidden md:inline">Hareketler</span>
              </button>
              {chk.status === 'portfolio' || chk.status === 'bank_collection' ? (
                <button
                  onClick={() => {
                    setSelectedCheckForAction(chk);
                    setCheckActionType('collect');
                  }}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:text-brand-fg bg-brand-soft hover:bg-brand-soft px-2.5 py-1 rounded transition-colors cursor-pointer"
                >
                  Durum Güncelle
                </button>
              ) : (
                <span className="text-xs text-fg-muted">Tamamlandı</span>
              )}
            </div>
          )}
          emptyMessage="Kayıtlı çek veya senet bulunmamaktadır."
        />
      )}

      {/* TAB CONTENT: Vade & Yaşlandırma Analizi */}
      {activeTab === 'aging' && (
        <AgingAnalysisTab
          onOpenReceiptModal={(contactId, type) => {
            setReceiptContactId(contactId);
            setReceiptType(type);
            setIsReceiptModalOpen(true);
          }}
          onOpenStatementModal={(contactId) => {
            const foundContact = contacts.find(c => c.id === contactId) || null;
            if (foundContact) {
              setSelectedContactForStatement(foundContact);
              setIsStatementModalOpen(true);
            }
          }}
        />
      )}

      {/* TAB CONTENT: Reports */}
      {activeTab === 'reports' && (
        <FinanceReport />
      )}

      {/* MODAL: Yeni Tahsilat / Tediye Makbuzu */}
      <ReceiptFormModal
        isOpen={isReceiptModalOpen}
        type={receiptType}
        contacts={contacts}
        cashBoxes={cashBoxes}
        bankAccounts={bankAccounts}
        invoices={invoices}
        contactId={receiptContactId}
        onContactChange={setReceiptContactId}
        onClose={() => setIsReceiptModalOpen(false)}
      />

      {/* MODAL: Virman Transferi */}
      <VirmanModal
        isOpen={isVirmanModalOpen}
        cashBoxes={cashBoxes}
        bankAccounts={bankAccounts}
        onClose={() => setIsVirmanModalOpen(false)}
      />

      {/* MODAL: Çek Durum Değiştirme (Tahsilat / Ciro) */}
      {selectedCheckForAction && (
        <CheckActionModal
          check={selectedCheckForAction}
          initialActionType={checkActionType}
          bankAccounts={bankAccounts}
          contacts={contacts}
          onClose={() => setSelectedCheckForAction(null)}
        />
      )}

      {/* MODAL: Yeni Kasa Tanımlama */}
      <NewCashBoxModal
        isOpen={isCashBoxModalOpen}
        existingCount={cashBoxes.length}
        onClose={() => setIsCashBoxModalOpen(false)}
      />

      {/* MODAL: Yeni Banka Hesabı Tanımlama */}
      <NewBankAccountModal
        isOpen={isBankAccountModalOpen}
        onClose={() => setIsBankAccountModalOpen(false)}
      />

      {/* TAB: Tahsilat/Tediye Makbuzu Detay Paneli */}
      {detailReceipt && (
        <DetailPanel
          isOpen={!!detailReceipt}
          onClose={() => setDetailReceipt(null)}
          title={detailReceipt.receiptNumber}
          widthClass="max-w-[440px]"
          badge={(
            <StatusBadge tone={detailReceipt.type === 'collection' ? 'success' : 'danger'}>
              {detailReceipt.type === 'collection' ? 'Tahsilat' : 'Tediye'}
            </StatusBadge>
          )}
          footer={(
            <button
              type="button"
              onClick={() => { const rc = detailReceipt; setDetailReceipt(null); setSelectedReceiptForPrint(rc); }}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-control bg-brand px-3 py-2 text-xs font-black text-white transition-colors hover:bg-brand-hover cursor-pointer"
            >
              <Printer className="h-3.5 w-3.5" />
              Makbuzu Yazdır
            </button>
          )}
        >
          <div className="space-y-4">
            <DetailSummary
              label={detailReceipt.type === 'collection' ? 'Tahsil Edilen' : 'Ödenen'}
              value={`${detailReceipt.type === 'collection' ? '+' : '-'}${detailReceipt.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`}
              unit="₺"
              tone={detailReceipt.type === 'collection' ? 'success' : 'danger'}
              badge={instrumentLabel(detailReceipt.instrument)}
            />
            <DetailSection
              title="Makbuz Bilgileri"
              rows={[
                { label: 'Cari Hesap', value: detailReceipt.contactName || '—' },
                { label: 'Tarih', value: new Date(detailReceipt.date).toLocaleDateString('tr-TR') },
                { label: 'Ödeme Aracı', value: instrumentLabel(detailReceipt.instrument) },
                { label: 'Açıklama', value: detailReceipt.description || '—' },
                { label: 'TDHP Kaydı', value: detailReceipt.journalEntryId ? `Yevmiye #${detailReceipt.journalEntryId}` : 'Bekliyor' },
              ]}
            />
          </div>
        </DetailPanel>
      )}

      {/* TAB: Kasa Detay Paneli */}
      {detailCashBox && (
        <DetailPanel
          isOpen={!!detailCashBox}
          onClose={() => setDetailCashBox(null)}
          title={detailCashBox.name}
          widthClass="max-w-[440px]"
          badge={(<StatusBadge tone="neutral">{detailCashBox.code}</StatusBadge>)}
          footer={(
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => { const b = detailCashBox; setDetailCashBox(null); setSelectedCashBoxForStatement(b); }}
                className="inline-flex items-center justify-center gap-1.5 rounded-control bg-brand px-3 py-2 text-xs font-black text-white transition-colors hover:bg-brand-hover cursor-pointer"
              >
                <FileText className="h-3.5 w-3.5" />
                Ekstre
              </button>
              <button
                type="button"
                onClick={() => { const b = detailCashBox; setDetailCashBox(null); setEditingCashBox(b); }}
                className="inline-flex items-center justify-center gap-1.5 rounded-control border border-line bg-surface px-3 py-2 text-xs font-black text-fg-strong transition-colors hover:bg-surface-hover cursor-pointer"
              >
                <Edit3 className="h-3.5 w-3.5" />
                Düzenle
              </button>
            </div>
          )}
        >
          <div className="space-y-4">
            <DetailSummary
              label="Mevcut Bakiye"
              value={detailCashBox.balance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
              unit="₺"
              tone={detailCashBox.balance >= 0 ? 'success' : 'danger'}
            />
            <DetailSection
              title="Kasa Bilgileri"
              rows={[
                { label: 'Kasa Kodu', value: detailCashBox.code },
                { label: 'Sorumlu', value: detailCashBox.responsiblePerson || 'Belirtilmedi' },
                { label: 'TDHP Hesabı', value: detailCashBox.accountCode },
              ]}
            />
            {detailCashBox.notes && (
              <DetailSection title="Notlar">
                <p className="rounded-card border border-line bg-surface-hover/40 p-3 text-xs font-semibold text-fg">{detailCashBox.notes}</p>
              </DetailSection>
            )}
          </div>
        </DetailPanel>
      )}

      {/* TAB: Banka Hesabı Detay Paneli */}
      {detailBank && (
        <DetailPanel
          isOpen={!!detailBank}
          onClose={() => setDetailBank(null)}
          title={detailBank.bankName}
          widthClass="max-w-[440px]"
          badge={(<StatusBadge tone="info">{detailBank.accountCode}</StatusBadge>)}
          footer={(
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => { const a = detailBank; setDetailBank(null); setSelectedBankAccountForStatement(a); }}
                className="inline-flex items-center justify-center gap-1.5 rounded-control bg-brand px-3 py-2 text-xs font-black text-white transition-colors hover:bg-brand-hover cursor-pointer"
              >
                <FileText className="h-3.5 w-3.5" />
                Ekstre
              </button>
              <button
                type="button"
                onClick={() => { const a = detailBank; setDetailBank(null); setEditingBankAccount(a); }}
                className="inline-flex items-center justify-center gap-1.5 rounded-control border border-line bg-surface px-3 py-2 text-xs font-black text-fg-strong transition-colors hover:bg-surface-hover cursor-pointer"
              >
                <Edit3 className="h-3.5 w-3.5" />
                Düzenle
              </button>
            </div>
          )}
        >
          <div className="space-y-4">
            <DetailSummary
              label="Mevduat Bakiyesi"
              value={detailBank.balance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
              unit="₺"
              tone={detailBank.balance >= 0 ? 'success' : 'danger'}
            />
            <DetailSection
              title="Hesap Bilgileri"
              rows={[
                { label: 'Şube', value: detailBank.branchName || 'Merkez' },
                { label: 'Hesap No', value: detailBank.accountNumber || '—' },
                { label: 'IBAN', value: <span className="font-mono select-all">{detailBank.iban}</span> },
                { label: 'TDHP Hesabı', value: detailBank.accountCode },
              ]}
            />
          </div>
        </DetailPanel>
      )}

      {/* TAB: Çek / Senet Detay Paneli */}
      {detailCheck && (() => {
        const toneMap: Record<string, 'success' | 'danger' | 'warning' | 'info' | 'brand' | 'neutral'> = {
          green: 'success', red: 'danger', violet: 'brand', blue: 'info', slate: 'neutral', amber: 'warning',
        };
        const meta = checkStatusMeta[detailCheck.status];
        return (
          <DetailPanel
            isOpen={!!detailCheck}
            onClose={() => setDetailCheck(null)}
            title={detailCheck.serialNumber}
            widthClass="max-w-[440px]"
            badge={(<StatusBadge tone={meta ? toneMap[meta.tone] : 'neutral'}>{meta?.label ?? detailCheck.status}</StatusBadge>)}
            footer={(
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => { const c = detailCheck; setDetailCheck(null); setSelectedCheckForHistory(c); }}
                  className="inline-flex items-center justify-center gap-1.5 rounded-control border border-line bg-surface px-3 py-2 text-xs font-black text-fg-strong transition-colors hover:bg-surface-hover cursor-pointer"
                >
                  <FileText className="h-3.5 w-3.5" />
                  Hareketler
                </button>
                {(detailCheck.status === 'portfolio' || detailCheck.status === 'bank_collection') ? (
                  <button
                    type="button"
                    onClick={() => { const c = detailCheck; setDetailCheck(null); setSelectedCheckForAction(c); setCheckActionType('collect'); }}
                    className="inline-flex items-center justify-center gap-1.5 rounded-control bg-brand px-3 py-2 text-xs font-black text-white transition-colors hover:bg-brand-hover cursor-pointer"
                  >
                    <ArrowRightLeft className="h-3.5 w-3.5" />
                    Durum Güncelle
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setDetailCheck(null)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-control bg-surface-hover px-3 py-2 text-xs font-black text-fg-muted cursor-pointer"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Tamamlandı
                  </button>
                )}
              </div>
            )}
          >
            <div className="space-y-4">
              <DetailSummary
                label="Çek / Senet Tutarı"
                value={detailCheck.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                unit="₺"
                tone="brand"
                badge={checkTypeLabel(detailCheck.type)}
              />
              <DetailSection
                title="Belge Bilgileri"
                rows={[
                  { label: 'Portföy No', value: detailCheck.portfolioNumber },
                  { label: 'Keşideci', value: detailCheck.drawer },
                  { label: 'İlgili Cari', value: detailCheck.contactName || '—' },
                  { label: 'Banka / Şube', value: detailCheck.bankName ? `${detailCheck.bankName}${detailCheck.branchName ? ` (${detailCheck.branchName})` : ''}` : '—' },
                  { label: 'Vade Tarihi', value: new Date(detailCheck.dueDate).toLocaleDateString('tr-TR') },
                ]}
              />
            </div>
          </DetailPanel>
        );
      })()}

      {/* PRINT PREVIEW MODAL: Makbuz Yazdır */}
      <ReceiptPrintPreviewModal
        receipt={selectedReceiptForPrint}
        companySettings={companySettings}
        onClose={() => setSelectedReceiptForPrint(null)}
      />

      {/* MODAL: Kasa Düzenleme */}
      <EditCashBoxModal
        isOpen={!!editingCashBox}
        onClose={() => setEditingCashBox(null)}
        cashBox={editingCashBox}
      />

      {/* MODAL: Banka Hesabı Düzenleme */}
      <EditBankAccountModal
        isOpen={!!editingBankAccount}
        onClose={() => setEditingBankAccount(null)}
        bankAccount={editingBankAccount}
      />

      {/* MODAL: Kasa / Banka Silme (ortak silme motoru — Kademe 2) */}
      {deleteTarget?.target?.id && (
        <DeleteConfirmModal
          resource={deleteTarget.type === 'cash' ? 'cashBoxes' : 'bankAccounts'}
          id={deleteTarget.target.id}
          title={deleteTarget.type === 'cash' ? 'Kasayı Sil' : 'Banka Hesabını Sil'}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => setDeleteTarget(null)}
        />
      )}

      {/* MODAL: Kasa Hareket Raporu & Ekstresi */}
      {selectedCashBoxForStatement && (
        <CashStatementModal
          isOpen={!!selectedCashBoxForStatement}
          onClose={() => setSelectedCashBoxForStatement(null)}
          cashBox={selectedCashBoxForStatement}
        />
      )}

      {/* MODAL: Banka Hesap Hareket Raporu & Ekstresi */}
      {selectedBankAccountForStatement && (
        <BankStatementModal
          isOpen={!!selectedBankAccountForStatement}
          onClose={() => setSelectedBankAccountForStatement(null)}
          bankAccount={selectedBankAccountForStatement}
        />
      )}

      {/* MODAL: Çek / Senet Kartı ve Hareket Geçmişi */}
      {selectedCheckForHistory && (
        <CheckHistoryModal
          isOpen={!!selectedCheckForHistory}
          onClose={() => setSelectedCheckForHistory(null)}
          check={selectedCheckForHistory}
          onActionRequest={(check, action) => {
            setSelectedCheckForHistory(null);
            setSelectedCheckForAction(check);
            setCheckActionType(action);
          }}
        />
      )}

      {/* MODAL: Cari Hesap Ekstresi */}
      {isStatementModalOpen && selectedContactForStatement && (
        <ContactStatementModal
          isOpen={isStatementModalOpen}
          onClose={() => {
            setIsStatementModalOpen(false);
            setSelectedContactForStatement(null);
          }}
          contact={selectedContactForStatement}
        />
      )}
    </div>
  );
}
