import React, { useState, useEffect } from 'react';
import { ArrowDownLeft, ArrowUpRight, X } from 'lucide-react';
import { financeService } from '../../services/financeService';
import type { Contact, CashBox, BankAccount, Invoice, ReceiptType, PaymentInstrument } from '../../types';

interface ReceiptFormModalProps {
  isOpen: boolean;
  type: ReceiptType;
  contacts: Contact[];
  cashBoxes: CashBox[];
  bankAccounts: BankAccount[];
  invoices: Invoice[];
  contactId: number | '';
  onContactChange: (id: number | '') => void;
  onClose: () => void;
}

export default function ReceiptFormModal({
  isOpen,
  type,
  contacts,
  cashBoxes,
  bankAccounts,
  invoices,
  contactId,
  onContactChange,
  onClose
}: ReceiptFormModalProps) {
  // Form State for Receipt
  const [receiptInstrument, setReceiptInstrument] = useState<PaymentInstrument>('cash');
  const [receiptCashBoxId, setReceiptCashBoxId] = useState<number | ''>('');
  const [receiptBankAccountId, setReceiptBankAccountId] = useState<number | ''>('');
  const [receiptAmount, setReceiptAmount] = useState<string>('');
  const [receiptDescription, setReceiptDescription] = useState<string>('');
  const [receiptDate, setReceiptDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [receiptInvoiceId, setReceiptInvoiceId] = useState<number | ''>('');

  // Form State for Check in Receipt
  const [checkSerial, setCheckSerial] = useState('');
  const [checkBank, setCheckBank] = useState('');
  const [checkBranch, setCheckBranch] = useState('');
  const [checkDrawer, setCheckDrawer] = useState('');
  const [checkDueDate, setCheckDueDate] = useState('');
  const [checkIssueDate, setCheckIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [checkNotes, setCheckNotes] = useState('');

  // Selected contact details
  const selectedContact = contacts.find(c => c.id === Number(contactId));

  // Set default cash box or bank when opening modal
  useEffect(() => {
    if (cashBoxes.length > 0 && !receiptCashBoxId) {
      setReceiptCashBoxId(cashBoxes[0].id!);
    }
    if (bankAccounts.length > 0 && !receiptBankAccountId) {
      setReceiptBankAccountId(bankAccounts[0].id!);
    }
  }, [cashBoxes, bankAccounts, receiptCashBoxId, receiptBankAccountId]);

  // Handle Receipt Submission
  const handleSaveReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactId) {
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
        type: type,
        contactId: Number(contactId),
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

      onClose();
      resetReceiptForm();
      alert('Makbuz başarıyla kaydedildi ve Tek Düzen Hesap Planına (TDHP) muhasebeleştirildi.');
    } catch (err: any) {
      alert(`Hata: ${err.message}`);
    }
  };

  const resetReceiptForm = () => {
    onContactChange('');
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-xl w-full p-6 space-y-5 my-8">
        <div className="flex items-center justify-between border-b pb-3">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            {type === 'collection' ? (
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
            onClick={() => onClose()}
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
              value={contactId}
              onChange={(e) => onContactChange(Number(e.target.value))}
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
                  .filter(inv => !contactId || inv.contactId === Number(contactId))
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
              onClick={() => onClose()}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
            >
              Vazgeç
            </button>
            <button
              type="submit"
              className={`px-5 py-2 rounded-lg text-white text-sm font-medium shadow-sm transition-colors ${
                type === 'collection' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
              }`}
            >
              Makbuzu Kaydet & Muhasebeleştir
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
