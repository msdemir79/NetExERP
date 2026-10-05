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
            <button
              onClick={() => {
                setReceiptType('collection');
                setIsReceiptModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 shadow-xs transition-colors cursor-pointer"
            >
              <ArrowDownLeft className="w-3.5 h-3.5" />
              <span>Tahsilat Al</span>
            </button>

            <button
              onClick={() => {
                setReceiptType('disbursement');
                setIsReceiptModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 shadow-xs transition-colors cursor-pointer"
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>Ödeme Yap</span>
            </button>

            <button
              onClick={() => setIsVirmanModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 shadow-xs transition-colors cursor-pointer"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              <span>Virman Transferi</span>
            </button>
          </div>
        }
      />

      {/* Financial KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Kasa */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-gray-200 shadow-sm hover:border-gray-300 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Toplam Nakit Kasa</span>
            <span className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
              <Wallet className="w-5 h-5" />
            </span>
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-2">₺{totalCashBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</p>
          <p className="text-xs text-gray-500 mt-1">{cashBoxes.length} Adet Aktif Kasa</p>
        </div>

        {/* Banka */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-gray-200 shadow-sm hover:border-gray-300 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Toplam Banka Mevduatı</span>
            <span className="p-2 rounded-lg bg-blue-50 text-blue-600">
              <Landmark className="w-5 h-5" />
            </span>
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-2">₺{totalBankBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</p>
          <p className="text-xs text-gray-500 mt-1">{bankAccounts.length} Adet Banka Hesabı</p>
        </div>

        {/* Portföydeki Alınan Çekler */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-gray-200 shadow-sm hover:border-gray-300 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Portföydeki Çekler</span>
            <span className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
              <FileCheck className="w-5 h-5" />
            </span>
          </div>
          <p className="text-2xl font-bold text-indigo-900 mt-2">₺{totalPortfolioChecks.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</p>
          <p className="text-xs text-gray-500 mt-1">{portfolioChecks.length} Adet Alınan Çek</p>
        </div>

        {/* Verilen Çekler */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-gray-200 shadow-sm hover:border-gray-300 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Ödenecek Firma Çekleri</span>
            <span className="p-2 rounded-lg bg-amber-50 text-amber-600">
              <Clock className="w-5 h-5" />
            </span>
          </div>
          <p className="text-2xl font-bold text-amber-900 mt-2">₺{totalPayableGivenChecks.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</p>
          <p className="text-xs text-gray-500 mt-1">{payableGivenChecks.length} Adet Ödeme Bekleyen Çek</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 space-x-8">
        <button
          onClick={() => setActiveTab('receipts')}
          className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${
            activeTab === 'receipts'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          Tahsilat & Tediye Makbuzları
          <span className="ml-1.5 py-0.5 px-2 rounded-full text-xs bg-gray-100 text-gray-600 font-semibold">
            {receipts.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('cash')}
          className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${
            activeTab === 'cash'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <Wallet className="w-4 h-4" />
          Kasa Yönetimi
          <span className="ml-1.5 py-0.5 px-2 rounded-full text-xs bg-gray-100 text-gray-600 font-semibold">
            {cashBoxes.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('bank')}
          className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${
            activeTab === 'bank'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <Landmark className="w-4 h-4" />
          Banka Hesapları
          <span className="ml-1.5 py-0.5 px-2 rounded-full text-xs bg-gray-100 text-gray-600 font-semibold">
            {bankAccounts.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('checks')}
          className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${
            activeTab === 'checks'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <FileCheck className="w-4 h-4" />
          Çek - Senet Portföyü
          <span className="ml-1.5 py-0.5 px-2 rounded-full text-xs bg-gray-100 text-gray-600 font-semibold">
            {checks.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('aging')}
          className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${
            activeTab === 'aging'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <TrendingUp className="w-4 h-4 text-indigo-600" />
          <span>Vade & Yaşlandırma Analizi</span>
          <span className="ml-1 py-0.5 px-2 rounded-full text-[10px] bg-indigo-50 text-indigo-700 font-bold border border-indigo-200">
            Nakit Akışı
          </span>
        </button>

        <button
          onClick={() => setActiveTab('reports')}
          className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${
            activeTab === 'reports'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <BarChart3 className="w-4 h-4 text-emerald-600" />
          Finans & Likidite Raporu
        </button>

        <div className="ml-auto flex items-center pr-2">
          <Link
            to="/reports?tab=finance"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
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
            { key: 'receiptNumber', title: 'Makbuz No', render: (rc) => <span className="font-mono font-medium text-indigo-600">{rc.receiptNumber}</span> },
            { key: 'date', title: 'Tarih', render: (rc) => <span className="text-gray-500 whitespace-nowrap">{new Date(rc.date).toLocaleDateString('tr-TR')}</span>, filterValue: (rc) => new Date(rc.date).toISOString().slice(0, 10) },
            {
              key: 'type', title: 'İşlem Türü',
              render: (rc) => rc.type === 'collection'
                ? <StatusPill tone="green"><span className="inline-flex items-center gap-1"><ArrowDownLeft className="w-3.5 h-3.5" />Tahsilat</span></StatusPill>
                : <StatusPill tone="red"><span className="inline-flex items-center gap-1"><ArrowUpRight className="w-3.5 h-3.5" />Tediye</span></StatusPill>,
              filterValue: (rc) => rc.type === 'collection' ? 'Tahsilat' : 'Tediye',
            },
            { key: 'contactName', title: 'Cari Hesap', render: (rc) => <span className="font-medium text-gray-900">{rc.contactName}</span> },
            { key: 'instrument', title: 'Ödeme Aracı', render: (rc) => <span className="text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded">{instrumentLabel(rc.instrument)}</span>, filterValue: (rc) => instrumentLabel(rc.instrument) },
            {
              key: 'amount', title: 'Tutar', align: 'right',
              render: (rc) => <span className={`font-bold ${rc.type === 'collection' ? 'text-emerald-600' : 'text-rose-600'}`}>{rc.type === 'collection' ? '+' : '-'}₺{rc.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>,
            },
            { key: 'description', title: 'Açıklama', render: (rc) => <span className="text-gray-500">{rc.description || '-'}</span> },
            {
              key: 'journalEntryId', title: 'TDHP Kaydı', align: 'center', filterable: false,
              render: (rc) => rc.journalEntryId
                ? <StatusPill tone="green"><span className="inline-flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />Yevmiye #{rc.journalEntryId}</span></StatusPill>
                : <StatusPill tone="amber">Bekliyor</StatusPill>,
            },
          ]}
          data={filteredReceipts}
          rowKey="id"
          toolbar={
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={filterReceiptType}
                onChange={(e) => setFilterReceiptType(e.target.value as any)}
                className="text-xs border border-gray-300 rounded-md py-1.5 px-2.5 bg-white dark:bg-slate-900 text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="all">Tüm Makbuzlar</option>
                <option value="collection">Sadece Tahsilat (Giriş)</option>
                <option value="disbursement">Sadece Tediye (Ödeme)</option>
              </select>

              <select
                value={filterInstrument}
                onChange={(e) => setFilterInstrument(e.target.value)}
                className="text-xs border border-gray-300 rounded-md py-1.5 px-2.5 bg-white dark:bg-slate-900 text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
              className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-indigo-600 p-1 rounded hover:bg-gray-100 transition-colors"
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
            <h2 className="text-base font-semibold text-gray-900">Nakit Kasalar</h2>
            <button
              onClick={() => setIsCashBoxModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 shadow-sm transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Yeni Kasa Tanımla
            </button>
          </div>

          <DataGrid<CashBox>
            columns={[
              { key: 'code', title: 'Kasa Kodu', render: (box) => <span className="font-mono text-xs text-indigo-600 font-semibold bg-indigo-50 px-2 py-0.5 rounded">{box.code}</span> },
              { key: 'name', title: 'Kasa Adı', render: (box) => <span className="text-base font-bold text-gray-900">{box.name}</span> },
              { key: 'responsiblePerson', title: 'Sorumlu', render: (box) => <span className="text-gray-500">{box.responsiblePerson || 'Belirtilmedi'}</span> },
              { key: 'accountCode', title: 'TDHP Hesabı', render: (box) => <span className="font-mono text-xs text-gray-500">TDHP: {box.accountCode}</span> },
              {
                key: 'balance', title: 'Mevcut Bakiye', align: 'right',
                render: (box) => <span className={`font-bold ${box.balance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>₺{box.balance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>,
              },
              { key: 'notes', title: 'Notlar', render: (box) => box.notes ? <span className="text-xs text-gray-400">{box.notes}</span> : <span className="text-gray-300">-</span> },
            ]}
            data={cashBoxes}
            rowKey="id"
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
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-indigo-700 bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 border border-slate-200 dark:border-slate-700 hover:border-indigo-200 rounded-lg transition-colors cursor-pointer"
                  title="Kasa kartı ve bakiyesini düzenle"
                >
                  <Edit3 className="w-3.5 h-3.5 text-indigo-600" />
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
            <h2 className="text-base font-semibold text-gray-900">Banka Hesapları</h2>
            <button
              onClick={() => setIsBankAccountModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 shadow-sm transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Yeni Banka Hesabı Tanımla
            </button>
          </div>

          <DataGrid<BankAccount>
            columns={[
              { key: 'bankName', title: 'Banka', render: (acc) => <span className="font-semibold text-sm text-gray-900 inline-flex items-center gap-1.5"><Building2 className="w-4 h-4 text-blue-600" />{acc.bankName}</span> },
              { key: 'branchName', title: 'Şube / Hesap No', render: (acc) => <span className="text-xs text-gray-500">{acc.branchName || 'Merkez'} - {acc.accountNumber || ''}</span>, filterValue: (acc) => `${acc.branchName || ''} ${acc.accountNumber || ''}` },
              { key: 'iban', title: 'IBAN', render: (acc) => <span className="font-mono text-xs font-medium text-gray-700 bg-gray-50 px-2 py-1 rounded border border-gray-100 select-all">{acc.iban}</span> },
              { key: 'accountCode', title: 'TDHP Hesabı', render: (acc) => <span className="font-mono text-xs text-gray-500">TDHP: {acc.accountCode}</span> },
              {
                key: 'balance', title: 'Mevduat Bakiyesi', align: 'right',
                render: (acc) => <span className={`font-bold ${acc.balance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>₺{acc.balance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>,
              },
            ]}
            data={bankAccounts}
            rowKey="id"
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
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-indigo-700 bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 border border-slate-200 dark:border-slate-700 hover:border-indigo-200 rounded-lg transition-colors cursor-pointer"
                  title="Banka hesabı ve bakiyesini düzenle"
                >
                  <Edit3 className="w-3.5 h-3.5 text-indigo-600" />
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
            { key: 'portfolioNumber', title: 'Portföy No', render: (chk) => <span className="font-mono font-medium text-indigo-600">{chk.portfolioNumber}</span> },
            { key: 'type', title: 'Tür', render: (chk) => <span className="text-xs font-medium text-gray-600">{checkTypeLabel(chk.type)}</span>, filterValue: (chk) => checkTypeLabel(chk.type) },
            { key: 'serialNumber', title: 'Çek / Senet No', render: (chk) => <span className="font-mono text-gray-800">{chk.serialNumber}</span> },
            { key: 'bankName', title: 'Banka / Şube', render: (chk) => <span className="text-gray-600">{chk.bankName ? `${chk.bankName} ${chk.branchName ? `(${chk.branchName})` : ''}` : '-'}</span>, filterValue: (chk) => `${chk.bankName || ''} ${chk.branchName || ''}` },
            { key: 'drawer', title: 'Keşideci', render: (chk) => <span className="font-medium text-gray-900">{chk.drawer}</span> },
            { key: 'contactName', title: 'İlgili Cari', render: (chk) => <span className="text-gray-600">{chk.contactName}</span> },
            {
              key: 'dueDate', title: 'Vade Tarihi',
              render: (chk) => {
                const isOverdue = new Date(chk.dueDate) < new Date() && chk.status === 'portfolio';
                return (
                  <span className={`whitespace-nowrap font-medium ${isOverdue ? 'text-rose-600 font-bold' : 'text-gray-700'}`}>
                    {new Date(chk.dueDate).toLocaleDateString('tr-TR')}
                    {isOverdue && <StatusPill tone="red" className="ml-1">Gecikmiş</StatusPill>}
                  </span>
                );
              },
              filterValue: (chk) => new Date(chk.dueDate).toISOString().slice(0, 10),
            },
            { key: 'amount', title: 'Tutar', align: 'right', render: (chk) => <span className="font-bold text-gray-900">₺{chk.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span> },
            {
              key: 'status', title: 'Durum', align: 'center',
              render: (chk) => <StatusPill tone={checkStatusMeta[chk.status].tone}>{checkStatusMeta[chk.status].label}</StatusPill>,
              filterValue: (chk) => checkStatusMeta[chk.status].label,
            },
          ]}
          data={filteredChecks}
          rowKey="id"
          toolbar={
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={filterCheckType}
                onChange={(e) => setFilterCheckType(e.target.value)}
                className="text-xs border border-gray-300 rounded-md py-1.5 px-2.5 bg-white dark:bg-slate-900 text-gray-700"
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
                className="text-xs border border-gray-300 rounded-md py-1.5 px-2.5 bg-white dark:bg-slate-900 text-gray-700"
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
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-semibold rounded-md shadow-xs transition-colors cursor-pointer"
                title="Çek ve Senet Raporu & Yaşlandırma Ekstresi"
              >
                <BarChart3 className="w-3.5 h-3.5 text-indigo-600" />
                <span className="hidden sm:inline">Çek/Senet Raporu</span>
              </button>
            </div>
          }
          rowActions={(chk) => (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedCheckForHistory(chk)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-indigo-700 bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 border border-slate-200 dark:border-slate-700 px-2 py-1 rounded transition-colors cursor-pointer"
                title="Çek hareket geçmişi ve bordro kartı"
              >
                <FileText className="w-3.5 h-3.5 text-indigo-600" />
                <span className="hidden md:inline">Hareketler</span>
              </button>
              {chk.status === 'portfolio' || chk.status === 'bank_collection' ? (
                <button
                  onClick={() => {
                    setSelectedCheckForAction(chk);
                    setCheckActionType('collect');
                  }}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded transition-colors cursor-pointer"
                >
                  Durum Güncelle
                </button>
              ) : (
                <span className="text-xs text-gray-400">Tamamlandı</span>
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
