import React, { useState, useMemo } from 'react';
import { api } from '../../api/client';
import { useApiQuery } from '../../hooks/useApiQuery';
import type { Contact, Order, Transaction, Invoice } from '../../types';
import {
  FileText,
  Printer,
  ArrowUpRight,
  ArrowDownLeft,
  Building2,
  Phone,
  Mail,
  MapPin,
  CreditCard,
  ShoppingBag,
  Receipt
} from 'lucide-react';
import { LedgerTab, InvoicesTab, OrdersTab, TransactionsTab, DetailsTab, PrintableStatement, type LedgerEntry } from './ContactStatementTabs';
import { cn } from '../../lib/utils';
import Modal from '../Modal';
import TransactionModal from '../Accounting/TransactionModal';
import TransactionDeleteModal from '../Accounting/TransactionDeleteModal';

interface ContactStatementModalProps {
  isOpen: boolean;
  onClose: () => void;
  contact: Contact | null;
  onQuickPayment?: (contact: Contact, defaultType: 'income' | 'expense') => void;
  onNewOrder?: (contact: Contact) => void;
  onNewInvoice?: (contact: Contact) => void;
}

export default function ContactStatementModal({
  isOpen,
  onClose,
  contact,
  onQuickPayment,
  onNewOrder,
  onNewInvoice
}: ContactStatementModalProps) {
  const [activeTab, setActiveTab] = useState<'ledger' | 'invoices' | 'orders' | 'transactions' | 'details'>('ledger');
  const [dateFilter, setDateFilter] = useState<'all' | '30days' | 'this_year'>('all');

  // Transaction Edit & Delete states
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [isTxDeleteModalOpen, setIsTxDeleteModalOpen] = useState(false);
  const [deletingTx, setDeletingTx] = useState<Transaction | null>(null);

  // Fetch live contact from DB to ensure always up to date balance and information
  const liveContact = useApiQuery(
    () => (contact?.id ? api.contacts.get(contact.id) : Promise.resolve(undefined)),
    [contact?.id],
    ['contacts']
  );
  const currentContact = liveContact || contact;

  // Fetch orders, invoices, and transactions for this contact
  const orders = useApiQuery(
    () => (contact?.id ? api.orders.list({ where: { contactId: contact.id } }) : Promise.resolve([])),
    [contact?.id],
    ['orders']
  ) || [];

  const invoices = useApiQuery(
    () => (contact?.id ? api.invoices.list({ where: { contactId: contact.id } }) : Promise.resolve([])),
    [contact?.id],
    ['invoices']
  ) || [];

  // Fetch transactions for this contact
  const transactions = useApiQuery(
    () => (contact?.id ? api.transactions.list({ where: { contactId: contact.id } }) : Promise.resolve([])),
    [contact?.id],
    ['transactions']
  ) || [];

  // Build unified chronological ledger strictly from INVOICES and TRANSACTIONS (Orders are commitments, not debits!)
  const ledgerEntries = useMemo(() => {
    const entries: LedgerEntry[] = [];
    if (!contact) return entries;

    // Add invoices to ledger
    if (invoices) {
      for (const inv of invoices) {
        if (inv.status === 'cancelled') continue;
        
        const isSales = inv.type === 'sales';
        entries.push({
          id: `inv-${inv.id}`,
          date: new Date(inv.date),
          docNo: inv.invoiceNumber || `FAT-${inv.id}`,
          type: isSales ? 'sales_invoice' : 'purchase_invoice',
          typeLabel: isSales ? 'Satış Faturası' : 'Alış Faturası',
          description: inv.notes || `${isSales ? 'Satış' : 'Alış'} Faturası (${inv.scenario || 'Ticari'}) ${inv.orderNumber ? `[Sipariş: ${inv.orderNumber}]` : ''}`,
          debit: isSales ? inv.grandTotal : 0, // Sales increases customer debt (Borç)
          credit: !isSales ? inv.grandTotal : 0, // Purchase increases our payable / supplier credit (Alacak)
          runningBalance: 0,
          rawItem: inv
        });
      }
    }

    // Add transactions to ledger
    if (transactions) {
      for (const tx of transactions) {
        const isIncome = tx.type === 'income';
        const isOpening = tx.category === 'Açılış Bakiyesi' || tx.description.includes('Açılış');
        
        let type: LedgerEntry['type'] = isIncome ? 'collection' : 'payment';
        let typeLabel = isIncome ? 'Tahsilat (Giriş)' : 'Ödeme (Çıkış)';
        if (isOpening) {
          type = 'opening';
          typeLabel = 'Açılış / Devir';
        }

        let debit = 0;
        let credit = 0;
        if (isOpening) {
          if (tx.amount > 0 && isIncome) debit = tx.amount;
          else credit = tx.amount;
        } else if (isIncome) {
          credit = tx.amount;
        } else {
          debit = tx.amount;
        }

        entries.push({
          id: `tx-${tx.id}`,
          date: new Date(tx.date),
          docNo: tx.documentNo || `MAK-${tx.id}`,
          type,
          typeLabel,
          description: tx.description || `${tx.category || 'Kasa Hareketi'}`,
          debit,
          credit,
          runningBalance: 0,
          paymentMethod: tx.paymentMethod,
          rawItem: tx
        });
      }
    }

    // Sort chronological ascending for running balance calculation
    entries.sort((a, b) => a.date.getTime() - b.date.getTime());

    let running = 0;
    for (const entry of entries) {
      running += (entry.debit - entry.credit);
      entry.runningBalance = running;
    }

    return entries;
  }, [contact, invoices, transactions]);

  // Calculate all-time authoritative totals from entire ledger
  const allDebit = useMemo(() => ledgerEntries.reduce((acc, curr) => acc + curr.debit, 0), [ledgerEntries]);
  const allCredit = useMemo(() => ledgerEntries.reduce((acc, curr) => acc + curr.credit, 0), [ledgerEntries]);
  const calculatedLedgerBalance = allDebit - allCredit;
  // Effective balance reflects all sales invoices minus all collections
  const effectiveBalance = ledgerEntries.length > 0 ? calculatedLedgerBalance : (currentContact?.balance || 0);

  if (!contact || !currentContact) return null;

  // Filter based on date filter for display
  const now = new Date();
  const filteredLedger = ledgerEntries.filter(entry => {
    if (dateFilter === '30days') {
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return entry.date >= thirtyDaysAgo;
    }
    if (dateFilter === 'this_year') {
      const yearStart = new Date(now.getFullYear(), 0, 1);
      return entry.date >= yearStart;
    }
    return true;
  });

  // Calculate filtered totals
  const totalDebit = filteredLedger.reduce((acc, curr) => acc + curr.debit, 0);
  const totalCredit = filteredLedger.reduce((acc, curr) => acc + curr.credit, 0);
  const netBalance = totalDebit - totalCredit;

  const handlePrint = () => {
    window.print();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title=""
      size="full"
      headerActions={
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 text-white rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-slate-900 transition-colors shadow-sm"
          >
            <Printer className="w-3.5 h-3.5" />
            Yazdır / PDF
          </button>
        </div>
      }
    >
      <div className="space-y-6 print:space-y-4">
        {/* Contact Header Card */}
        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white p-6 rounded-2xl shadow-md relative overflow-hidden border border-slate-700">
          <div className="absolute right-0 top-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
          
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="px-2.5 py-1 bg-white dark:bg-slate-900/10 text-indigo-200 border border-white/10 rounded-md text-xs font-mono font-bold tracking-wider">
                  {currentContact.code || `CAR-${currentContact.id?.toString().padStart(4, '0')}`}
                </span>
                <span className={cn(
                  "px-2.5 py-1 text-xs font-black uppercase tracking-wider rounded-md",
                  currentContact.type === 'customer' 
                    ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30" 
                    : currentContact.type === 'supplier'
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                    : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                )}>
                  {currentContact.type === 'customer' ? 'Müşteri (Alıcı)' : currentContact.type === 'supplier' ? 'Tedarikçi (Satıcı)' : 'Müşteri & Tedarikçi'}
                </span>
                {currentContact.category && (
                  <span className="px-2.5 py-1 bg-slate-800 text-slate-300 rounded-md text-xs font-semibold">
                    {currentContact.category}
                  </span>
                )}
              </div>

              <h2 className="text-2xl lg:text-3xl font-black tracking-tight text-white uppercase">
                {currentContact.name}
              </h2>

              {currentContact.companyTitle && currentContact.companyTitle !== currentContact.name && (
                <p className="text-sm text-slate-300 font-medium">
                  {currentContact.companyTitle}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300 pt-1">
                {currentContact.contactPerson && (
                  <div className="flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Yetkili: <strong>{currentContact.contactPerson}</strong></span>
                  </div>
                )}
                {currentContact.phone && (
                  <div className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-indigo-400" />
                    <span>{currentContact.phone}</span>
                  </div>
                )}
                {currentContact.email && (
                  <div className="flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-indigo-400" />
                    <span>{currentContact.email}</span>
                  </div>
                )}
                {currentContact.city && (
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-indigo-400" />
                    <span>{currentContact.city} {currentContact.district ? `/ ${currentContact.district}` : ''}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Financial Summary Widget inside Header */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 bg-white dark:bg-slate-900/5 border border-white/10 p-4 rounded-xl backdrop-blur-sm">
              <div className="text-left sm:text-right pr-0 sm:pr-4 sm:border-r border-white/10">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  {effectiveBalance > 0 
                    ? 'Müşteri Borcu (Kalan Bakiye)' 
                    : effectiveBalance < 0 
                    ? 'Tedarikçi Alacağı (Borcumuz)' 
                    : 'Cari Bakiye'}
                </div>
                <div className={cn(
                  "text-2xl lg:text-3xl font-black font-mono tracking-tight",
                  effectiveBalance > 0 ? "text-emerald-400" : effectiveBalance < 0 ? "text-rose-400" : "text-slate-300"
                )}>
                  ₺{Math.abs(effectiveBalance).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-[10px] font-medium text-slate-400">
                  {effectiveBalance > 0 
                    ? '(Kalan Alacağımız / Tahsil Edilecek)' 
                    : effectiveBalance < 0 
                    ? '(Firmaya Ödenecek Borcumuz)' 
                    : 'Hesap Kapalı / Sıfır'}
                </div>
              </div>

              <div className="flex sm:flex-col gap-2 justify-center">
                {onQuickPayment && (
                  <>
                    <button
                      onClick={() => onQuickPayment(currentContact, 'income')}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-colors shadow-sm"
                    >
                      <ArrowDownLeft className="w-3.5 h-3.5" />
                      Tahsilat Al
                    </button>
                    <button
                      onClick={() => onQuickPayment(currentContact, 'expense')}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-colors shadow-sm"
                    >
                      <ArrowUpRight className="w-3.5 h-3.5" />
                      Ödeme Yap
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Quick Metrics Line */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 mt-4 border-t border-white/10 text-xs">
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Vergi Dairesi & No:</span>
              <span className="font-mono font-bold text-slate-200">
                {currentContact.taxOffice ? `${currentContact.taxOffice} / ` : ''}{currentContact.taxNumber || currentContact.tcKimlik || 'Tanımlanmamış'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Ödeme Vadesi:</span>
              <span className="font-bold text-slate-200">
                {currentContact.paymentTermDays ? `${currentContact.paymentTermDays} Gün` : 'Peşin / Standart'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Risk Limiti:</span>
              <span className="font-mono font-bold text-slate-200">
                {currentContact.creditLimit ? `₺${currentContact.creditLimit.toLocaleString()}` : 'Limitsiz / Belirtilmemiş'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Özel İskonto:</span>
              <span className="font-bold text-slate-200">
                {currentContact.discountRate ? `%${currentContact.discountRate}` : '%0'}
              </span>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-700 pb-3 print:hidden">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('ledger')}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all",
                activeTab === 'ledger'
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 hover:bg-slate-200"
              )}
            >
              <FileText className="w-4 h-4" />
              Cari Hesap Ekstresi ({filteredLedger.length})
            </button>
            <button
              onClick={() => setActiveTab('invoices')}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all",
                activeTab === 'invoices'
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 hover:bg-slate-200"
              )}
            >
              <Receipt className="w-4 h-4" />
              Faturalar ({invoices?.length || 0})
            </button>
            <button
              onClick={() => setActiveTab('orders')}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all",
                activeTab === 'orders'
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 hover:bg-slate-200"
              )}
            >
              <ShoppingBag className="w-4 h-4" />
              Siparişler & Kalan ({orders?.length || 0})
            </button>
            <button
              onClick={() => setActiveTab('transactions')}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all",
                activeTab === 'transactions'
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 hover:bg-slate-200"
              )}
            >
              <CreditCard className="w-4 h-4" />
              Kasa & Banka ({transactions?.length || 0})
            </button>
            <button
              onClick={() => setActiveTab('details')}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all",
                activeTab === 'details'
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 hover:bg-slate-200"
              )}
            >
              <Building2 className="w-4 h-4" />
              Firma Detayları
            </button>
          </div>

          {activeTab === 'ledger' && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Dönem:</span>
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value as any)}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-indigo-500 shadow-sm"
              >
                <option value="all">Tüm Hareketler</option>
                <option value="30days">Son 30 Gün</option>
                <option value="this_year">Bu Yıl ({now.getFullYear()})</option>
              </select>
            </div>
          )}
        </div>

        {/* TAB 1: CARI HESAP EKSTRESI (LEDGER) */}
        {activeTab === 'ledger' && (
          <LedgerTab
            filteredLedger={filteredLedger}
            totalDebit={totalDebit}
            totalCredit={totalCredit}
            netBalance={netBalance}
          />
        )}

        {/* TAB 2: FATURALAR (INVOICES) */}
        {activeTab === 'invoices' && (
          <InvoicesTab
            invoices={invoices}
            onNewInvoice={onNewInvoice}
            contact={contact}
          />
        )}

        {/* TAB 3: SIPARISLER & KALAN (ORDERS) */}
        {activeTab === 'orders' && (
          <OrdersTab
            orders={orders}
            onNewOrder={onNewOrder}
            contact={contact}
          />
        )}

        {/* TAB 3: TAHSILAT & ODEMELER */}
        {activeTab === 'transactions' && (
          <TransactionsTab
            transactions={transactions}
            onQuickPayment={onQuickPayment}
            contact={contact}
            setEditingTx={setEditingTx}
            setIsTxModalOpen={setIsTxModalOpen}
            setDeletingTx={setDeletingTx}
            setIsTxDeleteModalOpen={setIsTxDeleteModalOpen}
          />
        )}

        {/* TAB 4: FIRMA & BANKA DETAYLARI */}
        {activeTab === 'details' && (
          <DetailsTab
            currentContact={currentContact}
          />
        )}

        {/* Printable Official Statement Template (Visible on Print) */}
        <PrintableStatement
          dateFilter={dateFilter}
          currentContact={currentContact}
          filteredLedger={filteredLedger}
          totalDebit={totalDebit}
          totalCredit={totalCredit}
          netBalance={netBalance}
        />
      </div>

      {/* Transaction Edit Modal */}
      {isTxModalOpen && (
        <TransactionModal
          isOpen={isTxModalOpen}
          onClose={() => {
            setIsTxModalOpen(false);
            setEditingTx(null);
          }}
          transactionToEdit={editingTx}
          presetContact={currentContact}
          defaultType={editingTx?.type || 'income'}
        />
      )}

      {/* Transaction Delete Modal */}
      {isTxDeleteModalOpen && deletingTx && (
        <TransactionDeleteModal
          isOpen={isTxDeleteModalOpen}
          onClose={() => {
            setIsTxDeleteModalOpen(false);
            setDeletingTx(null);
          }}
          transaction={deletingTx}
          contact={currentContact}
        />
      )}
    </Modal>
  );
}
