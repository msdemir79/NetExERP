import React, { useState, useEffect } from 'react';
import { useApiQuery } from '../hooks/useApiQuery';
import { api } from '../api/client';
import { turkishIncludes } from '../lib/turkishUtils';
import { 
  Plus, 
  Search, 
  Filter, 
  ArrowDownLeft, 
  ArrowUpRight, 
  Wallet, 
  Landmark, 
  FileCheck, 
  ArrowRightLeft, 
  Printer, 
  Calendar, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Building2, 
  User, 
  ChevronDown, 
  Eye, 
  Download, 
  Layers,
  HelpCircle,
  TrendingUp,
  CreditCard,
  X,
  Edit3,
  Trash2,
  BarChart3,
  ExternalLink,
  FileText
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { financeService } from '../services/financeService';
import { accountingService } from '../services/accountingService';
import PageHeader from './PageHeader';
import EditCashBoxModal from './Finance/EditCashBoxModal';
import EditBankAccountModal from './Finance/EditBankAccountModal';
import DeleteFinanceModal from './Finance/DeleteFinanceModal';
import CashStatementModal from './Finance/CashStatementModal';
import BankStatementModal from './Finance/BankStatementModal';
import CheckHistoryModal from './Finance/CheckHistoryModal';
import FinanceReport from './Reports/FinanceReport';
import { AgingAnalysisTab } from './Finance/AgingAnalysisTab';
import ContactStatementModal from './Contacts/ContactStatementModal';
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
  const [isCheckModalOpen, setIsCheckModalOpen] = useState(false);
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
  const [checkTargetBankId, setCheckTargetBankId] = useState<number | ''>('');
  const [checkTargetCashId, setCheckTargetCashId] = useState<number | ''>('');
  const [checkEndorseContactId, setCheckEndorseContactId] = useState<number | ''>('');
  const [checkActionNotes, setCheckActionNotes] = useState('');

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterReceiptType, setFilterReceiptType] = useState<'all' | 'collection' | 'disbursement'>('all');
  const [filterInstrument, setFilterInstrument] = useState<string>('all');
  const [filterCheckStatus, setFilterCheckStatus] = useState<string>('all');
  const [filterCheckType, setFilterCheckType] = useState<string>('all');

  // Form State for Receipt
  const [receiptContactId, setReceiptContactId] = useState<number | ''>('');
  const [receiptInstrument, setReceiptInstrument] = useState<PaymentInstrument>('cash');
  const [receiptCashBoxId, setReceiptCashBoxId] = useState<number | ''>('');
  const [receiptBankAccountId, setReceiptBankAccountId] = useState<number | ''>('');
  const [receiptAmount, setReceiptAmount] = useState<string>('');
  const [receiptDescription, setReceiptDescription] = useState<string>('');
  const [receiptDate, setReceiptDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [receiptInvoiceId, setReceiptInvoiceId] = useState<number | ''>('');

  // Form State for Check in Receipt or standalone Check
  const [checkSerial, setCheckSerial] = useState('');
  const [checkBank, setCheckBank] = useState('');
  const [checkBranch, setCheckBranch] = useState('');
  const [checkDrawer, setCheckDrawer] = useState('');
  const [checkDueDate, setCheckDueDate] = useState('');
  const [checkIssueDate, setCheckIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [checkNotes, setCheckNotes] = useState('');

  // Form State for Virman
  const [virmanFromType, setVirmanFromType] = useState<'cash' | 'bank'>('cash');
  const [virmanFromId, setVirmanFromId] = useState<number | ''>('');
  const [virmanToType, setVirmanToType] = useState<'cash' | 'bank'>('bank');
  const [virmanToId, setVirmanToId] = useState<number | ''>('');
  const [virmanAmount, setVirmanAmount] = useState<string>('');
  const [virmanDesc, setVirmanDesc] = useState<string>('');

  // Form State for New Cash Box
  const [newCashCode, setNewCashCode] = useState('');
  const [newCashName, setNewCashName] = useState('');
  const [newCashAccountCode, setNewCashAccountCode] = useState('100.01');
  const [newCashCurrency, setNewCashCurrency] = useState('TRY');
  const [newCashBalance, setNewCashBalance] = useState('0');
  const [newCashPerson, setNewCashPerson] = useState('');

  // Form State for New Bank Account
  const [newBankName, setNewBankName] = useState('');
  const [newBankBranch, setNewBankBranch] = useState('');
  const [newBankAccountNo, setNewBankAccountNo] = useState('');
  const [newBankIban, setNewBankIban] = useState('');
  const [newBankAccountCode, setNewBankAccountCode] = useState('102.01');
  const [newBankCurrency, setNewBankCurrency] = useState('TRY');
  const [newBankBalance, setNewBankBalance] = useState('0');

  // Selected contact details
  const selectedContact = contacts.find(c => c.id === Number(receiptContactId));

  // Set default cash box or bank when opening modal
  useEffect(() => {
    if (cashBoxes.length > 0 && !receiptCashBoxId) {
      setReceiptCashBoxId(cashBoxes[0].id!);
    }
    if (bankAccounts.length > 0 && !receiptBankAccountId) {
      setReceiptBankAccountId(bankAccounts[0].id!);
    }
  }, [cashBoxes, bankAccounts, receiptCashBoxId, receiptBankAccountId]);

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
    if (searchTerm) {
      const matchText = `${r.receiptNumber} ${r.contactName} ${r.description}`;
      if (!turkishIncludes(matchText, searchTerm)) return false;
    }
    return true;
  });

  // Filtered Checks
  const filteredChecks = checks.filter(c => {
    if (filterCheckType !== 'all' && c.type !== filterCheckType) return false;
    if (filterCheckStatus !== 'all' && c.status !== filterCheckStatus) return false;
    if (searchTerm) {
      const matchText = `${c.portfolioNumber} ${c.serialNumber} ${c.drawer} ${c.contactName} ${c.bankName || ''}`;
      if (!turkishIncludes(matchText, searchTerm)) return false;
    }
    return true;
  });

  // Handle Receipt Submission
  const handleSaveReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiptContactId) {
      alert('Lütfen bir cari hesap seçiniz.');
      return;
    }
    const amount = Number(receiptAmount);
    if (isNaN(amount) || amount <= 0) {
      alert('Lütfen geçerli bir tutar giriniz.');
      return;
    }

    try {
      await financeService.addReceipt({
        type: receiptType,
        contactId: Number(receiptContactId),
        amount,
        instrument: receiptInstrument,
        cashBoxId: receiptInstrument === 'cash' ? Number(receiptCashBoxId) : undefined,
        bankAccountId: receiptInstrument === 'bank' ? Number(receiptBankAccountId) : undefined,
        checkData: receiptInstrument === 'check' ? {
          serialNumber: checkSerial || 'ÇEK-' + Math.floor(Math.random() * 10000),
          bankName: checkBank,
          branchName: checkBranch,
          drawer: checkDrawer || selectedContact?.name || '',
          issueDate: new Date(checkIssueDate),
          dueDate: new Date(checkDueDate || checkIssueDate),
          notes: checkNotes
        } : undefined,
        description: receiptDescription,
        date: new Date(receiptDate),
        invoiceId: receiptInvoiceId ? Number(receiptInvoiceId) : undefined
      });

      setIsReceiptModalOpen(false);
      resetReceiptForm();
      alert('Makbuz başarıyla kaydedildi ve Tek Düzen Hesap Planına (TDHP) muhasebeleştirildi.');
    } catch (err: any) {
      alert(`Hata: ${err.message}`);
    }
  };

  const resetReceiptForm = () => {
    setReceiptContactId('');
    setReceiptAmount('');
    setReceiptDescription('');
    setCheckSerial('');
    setCheckBank('');
    setCheckBranch('');
    setCheckDrawer('');
    setCheckDueDate('');
    setCheckNotes('');
    setReceiptInvoiceId('');
  };

  // Handle Virman
  const handleSaveVirman = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(virmanAmount);
    if (!virmanFromId || !virmanToId || isNaN(amount) || amount <= 0) {
      alert('Lütfen kaynak, hedef ve geçerli bir tutar seçiniz.');
      return;
    }
    if (virmanFromType === virmanToType && virmanFromId === virmanToId) {
      alert('Kaynak ve hedef hesap aynı olamaz.');
      return;
    }

    try {
      await financeService.transferFunds({
        fromType: virmanFromType,
        fromId: Number(virmanFromId),
        toType: virmanToType,
        toId: Number(virmanToId),
        amount,
        description: virmanDesc || 'Hesaplar arası virman transferi'
      });
      setIsVirmanModalOpen(false);
      setVirmanAmount('');
      setVirmanDesc('');
      alert('Virman işlemi başarıyla tamamlandı ve muhasebeleştirildi.');
    } catch (err: any) {
      alert(`Virman hatası: ${err.message}`);
    }
  };

  // Handle New Cash Box
  const handleSaveCashBox = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCashName) return;
    try {
      const cashCode = newCashCode || `KAS-${cashBoxes.length + 1}`;
      const accCode = newCashAccountCode || '100.01';
      await api.cashBoxes.create({
        code: cashCode,
        name: newCashName,
        accountCode: accCode,
        currency: newCashCurrency,
        balance: Number(newCashBalance) || 0,
        responsiblePerson: newCashPerson,
        createdAt: new Date()
      });

      // Otomatik TDHP Kasa Hesabı Açılışı
      await accountingService.registerAccountFromCode({
        code: accCode,
        name: `${cashCode} - ${newCashName}`,
        type: 'asset',
        currency: newCashCurrency,
        sourceModule: 'finance',
        description: `Kasa Hesabı (${cashCode})`
      });

      setIsCashBoxModalOpen(false);
      setNewCashName('');
      setNewCashCode('');
      setNewCashBalance('0');
      setNewCashPerson('');
    } catch (err: any) {
      alert(`Kasa ekleme hatası: ${err.message}`);
    }
  };

  // Handle New Bank Account
  const handleSaveBankAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBankName || !newBankIban) {
      alert('Lütfen banka adı ve IBAN giriniz.');
      return;
    }
    try {
      const accCode = newBankAccountCode || '102.01';
      await api.bankAccounts.create({
        bankName: newBankName,
        branchName: newBankBranch,
        accountNumber: newBankAccountNo,
        iban: newBankIban,
        accountCode: accCode,
        currency: newBankCurrency,
        balance: Number(newBankBalance) || 0,
        createdAt: new Date()
      });

      // Otomatik TDHP Banka Hesabı Açılışı
      await accountingService.registerAccountFromCode({
        code: accCode,
        name: `${newBankName} (${newBankBranch || 'Merkez'})`,
        type: 'asset',
        currency: newBankCurrency,
        sourceModule: 'finance',
        description: `Banka Hesabı - IBAN: ${newBankIban}`
      });

      setIsBankAccountModalOpen(false);
      setNewBankName('');
      setNewBankBranch('');
      setNewBankAccountNo('');
      setNewBankIban('');
      setNewBankBalance('0');
    } catch (err: any) {
      alert(`Banka hesabı ekleme hatası: ${err.message}`);
    }
  };

  // Handle Delete Cash Box or Bank Account
  const handleConfirmDelete = async (force: boolean) => {
    if (!deleteTarget?.target.id) return;
    if (deleteTarget.type === 'cash') {
      await financeService.deleteCashBox(deleteTarget.target.id, force);
    } else {
      await financeService.deleteBankAccount(deleteTarget.target.id, force);
    }
  };

  // Handle Check Action (Collect, Endorse, etc.)
  const handleSaveCheckAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCheckForAction?.id) return;

    try {
      let targetStatus: CheckStatus = 'collected';
      if (checkActionType === 'collect') targetStatus = 'collected';
      else if (checkActionType === 'endorse') targetStatus = 'endorsed';
      else if (checkActionType === 'bank_collection') targetStatus = 'bank_collection';
      else if (checkActionType === 'bounce') targetStatus = 'bounced';

      await financeService.updateCheckStatus(selectedCheckForAction.id, targetStatus, {
        targetBankAccountId: checkTargetBankId ? Number(checkTargetBankId) : undefined,
        targetCashBoxId: checkTargetCashId ? Number(checkTargetCashId) : undefined,
        endorsedToContactId: checkEndorseContactId ? Number(checkEndorseContactId) : undefined,
        notes: checkActionNotes
      });

      setSelectedCheckForAction(null);
      alert('Çek işlem kaydı güncellendi ve muhasebe yevmiye fişi oluşturuldu.');
    } catch (err: any) {
      alert(`Çek işlemi hatası: ${err.message}`);
    }
  };

  const getCheckStatusBadge = (status: CheckStatus) => {
    switch (status) {
      case 'portfolio':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">Cüzdanda (Portföy)</span>;
      case 'bank_collection':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">Tahsilde (Banka)</span>;
      case 'collected':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800">Tahsil Edildi</span>;
      case 'endorsed':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">Ciro Edildi</span>;
      case 'bounced':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-rose-100 text-rose-800">Karşılıksız / Protesto</span>;
      case 'returned':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">İade Edildi</span>;
      default:
        return null;
    }
  };

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
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-lg border border-gray-200">
            <div className="flex items-center gap-2 flex-1 max-w-md">
              <Search className="w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Makbuz no, cari adı veya açıklama ile ara..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full text-sm border-none focus:ring-0 placeholder-gray-400 p-0"
              />
            </div>

            <div className="flex items-center gap-2">
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
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-gray-600 font-semibold">
                  <tr>
                    <th className="py-3 px-4 text-left">Makbuz No</th>
                    <th className="py-3 px-4 text-left">Tarih</th>
                    <th className="py-3 px-4 text-left">İşlem Türü</th>
                    <th className="py-3 px-4 text-left">Cari Hesap</th>
                    <th className="py-3 px-4 text-left">Ödeme Aracı</th>
                    <th className="py-3 px-4 text-right">Tutar</th>
                    <th className="py-3 px-4 text-left">Açıklama</th>
                    <th className="py-3 px-4 text-center">TDHP Kaydı</th>
                    <th className="py-3 px-4 text-right">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-700">
                  {filteredReceipts.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-gray-400">
                        Henüz tahsilat veya tediye makbuzu bulunmuyor.
                      </td>
                    </tr>
                  ) : (
                    filteredReceipts.map((rc) => (
                      <tr key={rc.id} className="hover:bg-gray-50 transition-colors">
                        <td className="py-3 px-4 font-mono font-medium text-indigo-600">
                          {rc.receiptNumber}
                        </td>
                        <td className="py-3 px-4 text-gray-500 whitespace-nowrap">
                          {new Date(rc.date).toLocaleDateString('tr-TR')}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          {rc.type === 'collection' ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full text-xs font-medium">
                              <ArrowDownLeft className="w-3.5 h-3.5" /> Tahsilat
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-full text-xs font-medium">
                              <ArrowUpRight className="w-3.5 h-3.5" /> Tediye
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-medium text-gray-900">
                          {rc.contactName}
                        </td>
                        <td className="py-3 px-4">
                          <span className="capitalize text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
                            {rc.instrument === 'cash' ? 'Nakit Kasa' : rc.instrument === 'bank' ? 'Banka Transferi' : rc.instrument === 'check' ? 'Çek/Senet' : 'Kredi Kartı'}
                          </span>
                        </td>
                        <td className={`py-3 px-4 text-right font-bold ${rc.type === 'collection' ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {rc.type === 'collection' ? '+' : '-'}₺{rc.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-4 text-gray-500 max-w-xs truncate">
                          {rc.description || '-'}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {rc.journalEntryId ? (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Yevmiye #{rc.journalEntryId}
                            </span>
                          ) : (
                            <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded">Bekliyor</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => setSelectedReceiptForPrint(rc)}
                            className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-indigo-600 p-1 rounded hover:bg-gray-100 transition-colors"
                            title="Makbuzu Yazdır"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
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

      {/* TAB CONTENT: Cash Boxes */}
      {activeTab === 'cash' && (
        <div className="space-y-6">
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {cashBoxes.map((box) => (
              <div key={box.id} className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 p-5 shadow-sm space-y-4 flex flex-col justify-between hover:shadow-md transition-shadow">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-indigo-600 font-semibold bg-indigo-50 px-2 py-0.5 rounded">
                      {box.code}
                    </span>
                    <span className="text-xs text-gray-500 font-mono">TDHP: {box.accountCode}</span>
                  </div>

                  <div>
                    <h3 className="text-lg font-bold text-gray-900">{box.name}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">Sorumlu: {box.responsiblePerson || 'Belirtilmedi'}</p>
                  </div>

                  <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                    <span className="text-xs text-gray-500">Mevcut Bakiye</span>
                    <span className="text-xl font-bold text-emerald-600">
                      ₺{box.balance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  {box.notes && (
                    <p className="text-xs text-gray-400 bg-gray-50 p-2 rounded">{box.notes}</p>
                  )}
                </div>

                <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
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
                  <span className="text-[11px] text-gray-400 font-mono">ID: #{box.id}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB CONTENT: Bank Accounts */}
      {activeTab === 'bank' && (
        <div className="space-y-6">
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {bankAccounts.map((acc) => (
              <div key={acc.id} className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 p-5 shadow-sm space-y-4 flex flex-col justify-between hover:shadow-md transition-shadow">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-gray-900 flex items-center gap-1.5">
                      <Building2 className="w-4 h-4 text-blue-600" />
                      {acc.bankName}
                    </span>
                    <span className="text-xs text-gray-500 font-mono">TDHP: {acc.accountCode}</span>
                  </div>

                  <div>
                    <p className="text-xs text-gray-500">{acc.branchName || 'Merkez'} - {acc.accountNumber || ''}</p>
                    <p className="font-mono text-xs font-medium text-gray-700 mt-1 bg-gray-50 p-2 rounded border border-gray-100 select-all">
                      {acc.iban}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                    <span className="text-xs text-gray-500">Mevduat Bakiyesi</span>
                    <span className="text-xl font-bold text-blue-600">
                      ₺{acc.balance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
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
                  <span className="text-[11px] text-gray-400 font-mono">ID: #{acc.id}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB CONTENT: Checks & Notes Portfolio */}
      {activeTab === 'checks' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-lg border border-gray-200">
            <div className="flex items-center gap-2 flex-1 max-w-md">
              <Search className="w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Çek no, portföy no, keşideci veya cari ile ara..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full text-sm border-none focus:ring-0 placeholder-gray-400 p-0"
              />
            </div>

            <div className="flex items-center gap-2">
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
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-gray-600 font-semibold">
                  <tr>
                    <th className="py-3 px-4 text-left">Portföy No</th>
                    <th className="py-3 px-4 text-left">Tür</th>
                    <th className="py-3 px-4 text-left">Çek / Senet No</th>
                    <th className="py-3 px-4 text-left">Banka / Şube</th>
                    <th className="py-3 px-4 text-left">Keşideci</th>
                    <th className="py-3 px-4 text-left">İlgili Cari</th>
                    <th className="py-3 px-4 text-left">Vade Tarihi</th>
                    <th className="py-3 px-4 text-right">Tutar</th>
                    <th className="py-3 px-4 text-center">Durum</th>
                    <th className="py-3 px-4 text-right">İşlemler</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-700">
                  {filteredChecks.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-gray-400">
                        Kayıtlı çek veya senet bulunmamaktadır.
                      </td>
                    </tr>
                  ) : (
                    filteredChecks.map((chk) => {
                      const isOverdue = new Date(chk.dueDate) < new Date() && chk.status === 'portfolio';
                      return (
                        <tr key={chk.id} className="hover:bg-gray-50 transition-colors">
                          <td className="py-3 px-4 font-mono font-medium text-indigo-600">
                            {chk.portfolioNumber}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap text-xs font-medium text-gray-600">
                            {chk.type === 'received_check' ? 'Alınan Çek' : chk.type === 'given_check' ? 'Verilen Çek' : chk.type === 'received_note' ? 'Alınan Senet' : 'Verilen Senet'}
                          </td>
                          <td className="py-3 px-4 font-mono text-gray-800">
                            {chk.serialNumber}
                          </td>
                          <td className="py-3 px-4 text-gray-600">
                            {chk.bankName ? `${chk.bankName} ${chk.branchName ? `(${chk.branchName})` : ''}` : '-'}
                          </td>
                          <td className="py-3 px-4 font-medium text-gray-900">
                            {chk.drawer}
                          </td>
                          <td className="py-3 px-4 text-gray-600">
                            {chk.contactName}
                          </td>
                          <td className={`py-3 px-4 whitespace-nowrap font-medium ${isOverdue ? 'text-rose-600 font-bold' : 'text-gray-700'}`}>
                            {new Date(chk.dueDate).toLocaleDateString('tr-TR')}
                            {isOverdue && <span className="ml-1 text-xs text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">Gecikmiş</span>}
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-gray-900">
                            ₺{chk.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {getCheckStatusBadge(chk.status)}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
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
      {isReceiptModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-xl w-full p-6 space-y-5 my-8">
            <div className="flex items-center justify-between border-b pb-3">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                {receiptType === 'collection' ? (
                  <>
                    <ArrowDownLeft className="w-5 h-5 text-emerald-600" />
                    Yeni Tahsilat Makbuzu (Müşteri)
                  </>
                ) : (
                  <>
                    <ArrowUpRight className="w-5 h-5 text-rose-600" />
                    Yeni Tediye Makbuzu (Tedarikçi Ödemesi)
                  </>
                )}
              </h2>
              <button
                onClick={() => setIsReceiptModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveReceipt} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    İşlem Tarihi
                  </label>
                  <input
                    type="date"
                    required
                    value={receiptDate}
                    onChange={(e) => setReceiptDate(e.target.value)}
                    className="w-full text-sm border border-gray-300 rounded-lg p-2.5"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Ödeme Aracı
                  </label>
                  <select
                    value={receiptInstrument}
                    onChange={(e) => setReceiptInstrument(e.target.value as any)}
                    className="w-full text-sm border border-gray-300 rounded-lg p-2.5 bg-white dark:bg-slate-900"
                  >
                    <option value="cash">Nakit (Kasa)</option>
                    <option value="bank">Banka (Havale / EFT)</option>
                    <option value="check">Çek / Senet</option>
                    <option value="credit_card">Kredi Kartı</option>
                  </select>
                </div>
              </div>

              {/* Cari Hesap Seçimi */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Cari Hesap (Müşteri / Tedarikçi) *
                </label>
                <select
                  required
                  value={receiptContactId}
                  onChange={(e) => setReceiptContactId(Number(e.target.value))}
                  className="w-full text-sm border border-gray-300 rounded-lg p-2.5 bg-white dark:bg-slate-900"
                >
                  <option value="">Cari Hesap Seçiniz...</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.type === 'customer' ? 'Müşteri' : c.type === 'supplier' ? 'Tedarikçi' : 'Müşteri & Tedarikçi'}) - Bakiye: ₺{c.balance.toLocaleString('tr-TR')}
                    </option>
                  ))}
                </select>
              </div>

              {/* Kasa veya Banka Seçimi */}
              {receiptInstrument === 'cash' && (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    İşlem Yapılacak Kasa
                  </label>
                  <select
                    value={receiptCashBoxId}
                    onChange={(e) => setReceiptCashBoxId(Number(e.target.value))}
                    className="w-full text-sm border border-gray-300 rounded-lg p-2.5 bg-white dark:bg-slate-900"
                  >
                    {cashBoxes.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.accountCode}) - Bakiye: ₺{b.balance.toLocaleString('tr-TR')}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {receiptInstrument === 'bank' && (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    İşlem Yapılacak Banka Hesabı
                  </label>
                  <select
                    value={receiptBankAccountId}
                    onChange={(e) => setReceiptBankAccountId(Number(e.target.value))}
                    className="w-full text-sm border border-gray-300 rounded-lg p-2.5 bg-white dark:bg-slate-900"
                  >
                    {bankAccounts.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.bankName} ({b.iban}) - Bakiye: ₺{b.balance.toLocaleString('tr-TR')}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Çek Bilgileri */}
              {receiptInstrument === 'check' && (
                <div className="bg-gray-50 p-3.5 rounded-lg border border-gray-200 space-y-3">
                  <p className="text-xs font-bold text-gray-800">Çek / Senet Detayları</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-600 mb-0.5">Çek Seri No *</label>
                      <input
                        type="text"
                        required
                        placeholder="Örn: 948271"
                        value={checkSerial}
                        onChange={(e) => setCheckSerial(e.target.value)}
                        className="w-full text-xs border border-gray-300 rounded p-2"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-0.5">Vade Tarihi *</label>
                      <input
                        type="date"
                        required
                        value={checkDueDate}
                        onChange={(e) => setCheckDueDate(e.target.value)}
                        className="w-full text-xs border border-gray-300 rounded p-2"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-600 mb-0.5">Banka Adı</label>
                      <input
                        type="text"
                        placeholder="Örn: Akbank"
                        value={checkBank}
                        onChange={(e) => setCheckBank(e.target.value)}
                        className="w-full text-xs border border-gray-300 rounded p-2"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-0.5">Keşideci</label>
                      <input
                        type="text"
                        placeholder={selectedContact ? selectedContact.name : 'Keşideci Firma/Kişi'}
                        value={checkDrawer}
                        onChange={(e) => setCheckDrawer(e.target.value)}
                        className="w-full text-xs border border-gray-300 rounded p-2"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Tutar ve Açıklama */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    İşlem Tutarı (₺) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={receiptAmount}
                    onChange={(e) => setReceiptAmount(e.target.value)}
                    className="w-full text-sm font-bold border border-gray-300 rounded-lg p-2.5"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    İlişkili Fatura (Opsiyonel)
                  </label>
                  <select
                    value={receiptInvoiceId}
                    onChange={(e) => setReceiptInvoiceId(e.target.value ? Number(e.target.value) : '')}
                    className="w-full text-sm border border-gray-300 rounded-lg p-2.5 bg-white dark:bg-slate-900 truncate"
                  >
                    <option value="">Fatura Bağımsız</option>
                    {invoices
                      .filter(inv => !receiptContactId || inv.contactId === Number(receiptContactId))
                      .map((inv) => (
                        <option key={inv.id} value={inv.id}>
                          {inv.invoiceNumber} - Kalan: ₺{(inv.grandTotal - (inv.paidAmount || 0)).toLocaleString('tr-TR')}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Açıklama / Not
                </label>
                <input
                  type="text"
                  placeholder="İşleme ait açıklama..."
                  value={receiptDescription}
                  onChange={(e) => setReceiptDescription(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-lg p-2.5"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setIsReceiptModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  className={`px-5 py-2 rounded-lg text-white text-sm font-medium shadow-sm transition-colors ${
                    receiptType === 'collection' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  Makbuzu Kaydet & Muhasebeleştir
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Virman Transferi */}
      {isVirmanModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-lg w-full p-6 space-y-5">
            <div className="flex items-center justify-between border-b pb-3">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-indigo-600" />
                Hesaplar Arası Virman (Transfer)
              </h2>
              <button
                onClick={() => setIsVirmanModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveVirman} className="space-y-4">
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
                <span className="text-xs font-bold text-gray-700">Kaynak Hesap (Paranın Çıkacağı)</span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Tür</label>
                    <select
                      value={virmanFromType}
                      onChange={(e) => {
                        setVirmanFromType(e.target.value as any);
                        setVirmanFromId('');
                      }}
                      className="w-full text-xs border border-gray-300 rounded p-2 bg-white dark:bg-slate-900"
                    >
                      <option value="cash">Kasa (Nakit)</option>
                      <option value="bank">Banka Hesabı</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Hesap Seçimi</label>
                    <select
                      required
                      value={virmanFromId}
                      onChange={(e) => setVirmanFromId(Number(e.target.value))}
                      className="w-full text-xs border border-gray-300 rounded p-2 bg-white dark:bg-slate-900"
                    >
                      <option value="">Seçiniz...</option>
                      {virmanFromType === 'cash' ? (
                        cashBoxes.map(b => (
                          <option key={b.id} value={b.id}>{b.name} (₺{b.balance.toLocaleString('tr-TR')})</option>
                        ))
                      ) : (
                        bankAccounts.map(b => (
                          <option key={b.id} value={b.id}>{b.bankName} (₺{b.balance.toLocaleString('tr-TR')})</option>
                        ))
                      )}
                    </select>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
                <span className="text-xs font-bold text-gray-700">Hedef Hesap (Paranın Giriş Yapacağı)</span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Tür</label>
                    <select
                      value={virmanToType}
                      onChange={(e) => {
                        setVirmanToType(e.target.value as any);
                        setVirmanToId('');
                      }}
                      className="w-full text-xs border border-gray-300 rounded p-2 bg-white dark:bg-slate-900"
                    >
                      <option value="bank">Banka Hesabı</option>
                      <option value="cash">Kasa (Nakit)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Hesap Seçimi</label>
                    <select
                      required
                      value={virmanToId}
                      onChange={(e) => setVirmanToId(Number(e.target.value))}
                      className="w-full text-xs border border-gray-300 rounded p-2 bg-white dark:bg-slate-900"
                    >
                      <option value="">Seçiniz...</option>
                      {virmanToType === 'cash' ? (
                        cashBoxes.map(b => (
                          <option key={b.id} value={b.id}>{b.name} (₺{b.balance.toLocaleString('tr-TR')})</option>
                        ))
                      ) : (
                        bankAccounts.map(b => (
                          <option key={b.id} value={b.id}>{b.bankName} (₺{b.balance.toLocaleString('tr-TR')})</option>
                        ))
                      )}
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Transfer Tutarı (₺) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={virmanAmount}
                  onChange={(e) => setVirmanAmount(e.target.value)}
                  className="w-full text-sm font-bold border border-gray-300 rounded-lg p-2.5"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Açıklama
                </label>
                <input
                  type="text"
                  placeholder="Örn: Günlük hasılatın bankaya yatırılması"
                  value={virmanDesc}
                  onChange={(e) => setVirmanDesc(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-lg p-2.5"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setIsVirmanModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 shadow-sm"
                >
                  Virman İşlemini Tamamla
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Çek Durum Değiştirme (Tahsilat / Ciro) */}
      {selectedCheckForAction && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-md w-full p-6 space-y-5">
            <div className="flex items-center justify-between border-b pb-3">
              <h2 className="text-lg font-bold text-gray-900">
                Çek Durum İşlemi: {selectedCheckForAction.portfolioNumber}
              </h2>
              <button
                onClick={() => setSelectedCheckForAction(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 text-xs space-y-1">
              <p><span className="font-semibold text-gray-700">Keşideci:</span> {selectedCheckForAction.drawer}</p>
              <p><span className="font-semibold text-gray-700">Tutar:</span> ₺{selectedCheckForAction.amount.toLocaleString('tr-TR')}</p>
              <p><span className="font-semibold text-gray-700">Vade:</span> {new Date(selectedCheckForAction.dueDate).toLocaleDateString('tr-TR')}</p>
            </div>

            <form onSubmit={handleSaveCheckAction} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Yapılacak İşlem *
                </label>
                <select
                  value={checkActionType}
                  onChange={(e) => setCheckActionType(e.target.value as any)}
                  className="w-full text-sm border border-gray-300 rounded-lg p-2.5 bg-white dark:bg-slate-900"
                >
                  <option value="collect">Tahsil Et (Nakit veya Bankaya Yatır)</option>
                  <option value="endorse">Ciro Et (Tedarikçiye Devret)</option>
                  <option value="bank_collection">Bankaya Tahsile Ver (Beklemede)</option>
                  <option value="bounce">Karşılıksız / Protesto Kaydı</option>
                </select>
              </div>

              {checkActionType === 'collect' && (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Tahsil Edilecek Banka Hesabı
                  </label>
                  <select
                    value={checkTargetBankId}
                    onChange={(e) => setCheckTargetBankId(Number(e.target.value))}
                    className="w-full text-sm border border-gray-300 rounded-lg p-2.5 bg-white dark:bg-slate-900"
                  >
                    <option value="">Banka Seçiniz...</option>
                    {bankAccounts.map(b => (
                      <option key={b.id} value={b.id}>{b.bankName} ({b.iban})</option>
                    ))}
                  </select>
                </div>
              )}

              {checkActionType === 'endorse' && (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Ciro Edilecek Tedarikçi *
                  </label>
                  <select
                    required
                    value={checkEndorseContactId}
                    onChange={(e) => setCheckEndorseContactId(Number(e.target.value))}
                    className="w-full text-sm border border-gray-300 rounded-lg p-2.5 bg-white dark:bg-slate-900"
                  >
                    <option value="">Tedarikçi Seçiniz...</option>
                    {contacts.filter(c => c.type === 'supplier' || c.type === 'both').map(c => (
                      <option key={c.id} value={c.id}>{c.name} (Bakiye: ₺{c.balance.toLocaleString('tr-TR')})</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  İşlem Notu
                </label>
                <input
                  type="text"
                  placeholder="İsteğe bağlı not..."
                  value={checkActionNotes}
                  onChange={(e) => setCheckActionNotes(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-lg p-2.5"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setSelectedCheckForAction(null)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 shadow-sm"
                >
                  Onayla & TDHP'ye İşle
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Yeni Kasa Tanımlama */}
      {isCashBoxModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h2 className="text-lg font-bold text-gray-900">Yeni Kasa Tanımla</h2>
              <button onClick={() => setIsCashBoxModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCashBox} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Kasa Kodu</label>
                <input
                  type="text"
                  placeholder="Örn: KAS-04"
                  value={newCashCode}
                  onChange={(e) => setNewCashCode(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-lg p-2"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Kasa Adı *</label>
                <input
                  type="text"
                  required
                  placeholder="Örn: Atölye / Fabrika Kasası"
                  value={newCashName}
                  onChange={(e) => setNewCashName(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-lg p-2"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">TDHP Hesap Kodu</label>
                <input
                  type="text"
                  value={newCashAccountCode}
                  onChange={(e) => setNewCashAccountCode(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-lg p-2 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Açılış Bakiyesi (₺)</label>
                <input
                  type="number"
                  step="0.01"
                  value={newCashBalance}
                  onChange={(e) => setNewCashBalance(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-lg p-2"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Sorumlu Kişi</label>
                <input
                  type="text"
                  value={newCashPerson}
                  onChange={(e) => setNewCashPerson(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-lg p-2"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setIsCashBoxModalOpen(false)}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-700"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700"
                >
                  Kasayı Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Yeni Banka Hesabı Tanımlama */}
      {isBankAccountModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h2 className="text-lg font-bold text-gray-900">Yeni Banka Hesabı Tanımla</h2>
              <button onClick={() => setIsBankAccountModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveBankAccount} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Banka Adı *</label>
                <input
                  type="text"
                  required
                  placeholder="Örn: Akbank T.A.Ş."
                  value={newBankName}
                  onChange={(e) => setNewBankName(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-lg p-2"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Şube Adı</label>
                <input
                  type="text"
                  placeholder="Örn: Merter Şubesi"
                  value={newBankBranch}
                  onChange={(e) => setNewBankBranch(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-lg p-2"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">IBAN Numarası *</label>
                <input
                  type="text"
                  required
                  placeholder="TR00 0000 0000 0000 0000 0000 00"
                  value={newBankIban}
                  onChange={(e) => setNewBankIban(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-lg p-2 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">TDHP Hesap Kodu</label>
                <input
                  type="text"
                  value={newBankAccountCode}
                  onChange={(e) => setNewBankAccountCode(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-lg p-2 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Açılış Bakiyesi (₺)</label>
                <input
                  type="number"
                  step="0.01"
                  value={newBankBalance}
                  onChange={(e) => setNewBankBalance(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-lg p-2"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setIsBankAccountModalOpen(false)}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-700"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700"
                >
                  Hesabı Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PRINT PREVIEW MODAL: Makbuz Yazdır */}
      {selectedReceiptForPrint && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-2xl w-full p-8 space-y-6 my-8 print:p-0 print:m-0 print:shadow-none">
            <div className="flex items-center justify-between border-b pb-4 print:hidden">
              <span className="text-sm font-semibold text-gray-500">Resmi Makbuz Çıktısı</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 shadow-sm"
                >
                  <Printer className="w-4 h-4" />
                  Yazdır
                </button>
                <button
                  onClick={() => setSelectedReceiptForPrint(null)}
                  className="p-1 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable Receipt Canvas */}
            <div className="border-2 border-gray-800 p-6 space-y-6 rounded">
              <div className="flex justify-between items-start border-b-2 border-gray-800 pb-4 gap-4">
                <div className="flex items-center gap-3">
                  {companySettings?.logo ? (
                    <div className="w-12 h-12 rounded bg-white dark:bg-slate-900 border border-gray-300 p-0.5 flex items-center justify-center shrink-0 overflow-hidden">
                      <img src={companySettings.logo} alt={companySettings.companyName} className="max-w-full max-h-full object-contain" />
                    </div>
                  ) : null}
                  <div>
                    <h2 className="text-xl font-black text-gray-900 uppercase tracking-wide">
                      {companySettings?.companyTitle || companySettings?.companyName || 'PRO ERP AYAKKABI SAN. TİC. LTD. ŞTİ.'}
                    </h2>
                    <p className="text-xs text-gray-600 mt-1">{companySettings?.address || 'İkitelli OSB Aykosan Sanayi Sitesi 4. Ada B Blok No:12 Başakşehir / İstanbul'}</p>
                    <p className="text-xs text-gray-600">Vergi Dairesi: {companySettings?.taxOffice || 'İkitelli V.D.'} - Vergi No: {companySettings?.taxNumber || '7320491820'}</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="inline-block border-2 border-gray-800 px-3 py-1 text-sm font-black uppercase">
                    {selectedReceiptForPrint.type === 'collection' ? 'TAHSİLAT MAKBUZU' : 'TEDİYE MAKBUZU'}
                  </div>
                  <p className="text-xs font-mono font-bold mt-2">Makbuz No: {selectedReceiptForPrint.receiptNumber}</p>
                  <p className="text-xs text-gray-600">Tarih: {new Date(selectedReceiptForPrint.date).toLocaleDateString('tr-TR')}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="space-y-1.5 border border-gray-300 p-3 rounded">
                  <span className="font-bold text-gray-700 uppercase">Cari Bilgileri</span>
                  <p className="text-sm font-bold text-gray-900">{selectedReceiptForPrint.contactName}</p>
                  <p className="text-gray-600">Ödeme Aracı: {selectedReceiptForPrint.instrument === 'cash' ? 'Nakit Kasa' : selectedReceiptForPrint.instrument === 'bank' ? 'Banka EFT/Havale' : selectedReceiptForPrint.instrument === 'check' ? 'Çek / Senet' : 'Kredi Kartı'}</p>
                </div>

                <div className="space-y-1.5 border border-gray-300 p-3 rounded flex flex-col justify-center">
                  <span className="font-bold text-gray-700 uppercase">Tutar Bilgisi</span>
                  <p className="text-2xl font-black text-gray-900">
                    ₺{selectedReceiptForPrint.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-gray-600">Para Birimi: {selectedReceiptForPrint.currency || 'TRY'}</p>
                </div>
              </div>

              <div className="border border-gray-300 p-3 rounded text-xs space-y-1">
                <span className="font-bold text-gray-700">Açıklama:</span>
                <p className="text-gray-800">{selectedReceiptForPrint.description || 'Cari hesap mahsuben tahsilat/tediye bedeli.'}</p>
              </div>

              <div className="grid grid-cols-2 gap-8 pt-8 border-t border-gray-300 text-center text-xs">
                <div>
                  <p className="font-bold text-gray-800">Teslim Eden</p>
                  <div className="h-16 mt-2 border-b border-dashed border-gray-400"></div>
                  <p className="text-gray-500 mt-1">İmza / Kaşe</p>
                </div>
                <div>
                  <p className="font-bold text-gray-800">Teslim Alan (Tahsil Eden)</p>
                  <div className="h-16 mt-2 border-b border-dashed border-gray-400"></div>
                  <p className="text-gray-500 mt-1">İmza / Kaşe</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

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

      {/* MODAL: Kasa / Banka Silme Onayı */}
      {deleteTarget && (
        <DeleteFinanceModal
          isOpen={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          type={deleteTarget?.type || 'cash'}
          target={deleteTarget?.target || null}
          receiptCount={
            deleteTarget?.target?.id
              ? deleteTarget.type === 'cash'
                ? receipts.filter(r => r && r.cashBoxId === deleteTarget.target!.id).length
                : receipts.filter(r => r && r.bankAccountId === deleteTarget.target!.id).length
              : 0
          }
          onConfirm={handleConfirmDelete}
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
