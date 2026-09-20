import React, { useState, useEffect } from 'react';
import type { Contact, Transaction, TransactionType } from '../../types';
import { 
  ArrowDownLeft, 
  ArrowUpRight, 
  DollarSign, 
  CreditCard, 
  Calendar, 
  FileText, 
  Wallet,
  Building2,
  CheckCircle2,
  X,
  AlertCircle,
  Tag
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { erpService } from '../../services/erpService';
import { api } from '../../api/client';
import { useApiQuery } from '../../hooks/useApiQuery';

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactionToEdit?: Transaction | null;
  defaultType?: TransactionType;
  presetContact?: Contact | null;
  onSuccess?: (message?: string) => void;
}

export default function TransactionModal({
  isOpen,
  onClose,
  transactionToEdit,
  defaultType = 'income',
  presetContact,
  onSuccess
}: TransactionModalProps) {
  const contacts = useApiQuery(() => api.contacts.list(), [], ['contacts']);

  const [type, setType] = useState<TransactionType>(defaultType);
  const [amount, setAmount] = useState<number | ''>('');
  const [contactId, setContactId] = useState<number | ''>('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank_transfer' | 'credit_card' | 'check' | 'other'>('cash');
  const [documentNo, setDocumentNo] = useState('');
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [category, setCategory] = useState('Satış Tahsilatı');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditMode = !!transactionToEdit;

  useEffect(() => {
    if (!isOpen) return;

    setError(null);
    if (transactionToEdit) {
      setType(transactionToEdit.type);
      setAmount(transactionToEdit.amount);
      setContactId(transactionToEdit.contactId || '');
      setPaymentMethod(transactionToEdit.paymentMethod || 'cash');
      setDocumentNo(transactionToEdit.documentNo || '');
      setDate(
        transactionToEdit.date 
          ? new Date(transactionToEdit.date).toISOString().split('T')[0] 
          : new Date().toISOString().split('T')[0]
      );
      setCategory(transactionToEdit.category || (transactionToEdit.type === 'income' ? 'Satış Tahsilatı' : 'Tedarikçi Ödemesi'));
      setDescription(transactionToEdit.description || '');
    } else {
      const initialType = defaultType;
      setType(initialType);
      const selContactId = presetContact?.id || '';
      setContactId(selContactId);
      setPaymentMethod('cash');
      setDocumentNo(`MAK-${Date.now().toString().slice(-6)}`);
      setDate(new Date().toISOString().split('T')[0]);
      
      const defaultCategory = initialType === 'income' ? 'Satış Tahsilatı' : 'Tedarikçi Ödemesi';
      setCategory(defaultCategory);
      
      if (presetContact) {
        setDescription(
          initialType === 'income'
            ? `${presetContact.name} firmasından tahsilat alındı`
            : `${presetContact.name} firmasına ödeme yapıldı`
        );
      } else {
        setDescription('');
      }
      setAmount('');
    }
  }, [isOpen, transactionToEdit, defaultType, presetContact]);

  const handleTypeChange = (newType: TransactionType) => {
    setType(newType);
    if (!isEditMode) {
      if (newType === 'income') {
        setCategory('Satış Tahsilatı');
        if (selectedContact) {
          setDescription(`${selectedContact.name} firmasından tahsilat alındı`);
        }
      } else {
        setCategory('Tedarikçi Ödemesi');
        if (selectedContact) {
          setDescription(`${selectedContact.name} firmasına ödeme yapıldı`);
        }
      }
    }
  };

  const handleContactChange = (newContactIdStr: string) => {
    const id = newContactIdStr ? Number(newContactIdStr) : '';
    setContactId(id);
    if (id && contacts) {
      const c = contacts.find(item => item.id === id);
      if (c && !isEditMode && !description) {
        setDescription(
          type === 'income'
            ? `${c.name} firmasından tahsilat alındı`
            : `${c.name} firmasına ödeme yapıldı`
        );
      }
    }
  };

  const selectedContact = contacts?.find(c => c.id === (contactId ? Number(contactId) : undefined)) || presetContact;

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) {
      setError('Lütfen sıfırdan büyük geçerli bir tutar giriniz.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload: Partial<Transaction> = {
        type,
        amount: Number(amount),
        contactId: contactId ? Number(contactId) : undefined,
        category: category.trim() || (type === 'income' ? 'Tahsilat' : 'Ödeme'),
        paymentMethod,
        documentNo: documentNo.trim() || undefined,
        description: description.trim() || (type === 'income' ? 'Tahsilat / Gelir' : 'Ödeme / Gider'),
        date: date ? new Date(date) : new Date()
      };

      if (isEditMode && transactionToEdit?.id) {
        await erpService.updateTransaction(transactionToEdit.id, payload);
        if (onSuccess) onSuccess('Finansal hareket ve cari bakiyesi başarıyla güncellendi.');
      } else {
        await erpService.addTransaction(payload as Transaction);
        if (onSuccess) onSuccess('Yeni finansal hareket başarıyla kaydedildi.');
      }

      onClose();
    } catch (err: any) {
      setError(err?.message || 'İşlem kaydedilirken bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  const incomeCategories = [
    'Satış Tahsilatı',
    'Hizmet Geliri',
    'Ortaklar Cari',
    'Faiz & Kur Farkı Geliri',
    'Açılış Bakiyesi',
    'Diğer Gelir'
  ];

  const expenseCategories = [
    'Tedarikçi Ödemesi',
    'Hammadde Alımı',
    'Maaş & Personel',
    'Kira Gideri',
    'Elektrik & Su & Doğalgaz',
    'Nakliye & Kargo',
    'Vergi & SGK & Harç',
    'Bakım & Onarım',
    'Açılış Bakiyesi',
    'Diğer Gider'
  ];

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-lg shadow-2xl border border-slate-100 dark:border-slate-800 flex flex-col max-h-[90vh] overflow-hidden my-auto animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className={cn(
          "p-6 border-b flex items-center justify-between transition-colors shrink-0",
          type === 'income' ? "bg-emerald-50 border-emerald-100" : "bg-rose-50 border-rose-100"
        )}>
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-11 h-11 rounded-2xl flex items-center justify-center text-white shadow-md",
              type === 'income' ? "bg-emerald-600 shadow-emerald-200" : "bg-rose-600 shadow-rose-200"
            )}>
              {type === 'income' ? <ArrowDownLeft className="w-6 h-6" /> : <ArrowUpRight className="w-6 h-6" />}
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 dark:text-slate-100 tracking-tight">
                {isEditMode 
                  ? (type === 'income' ? 'Tahsilat / Gelir Düzenle' : 'Ödeme / Gider Düzenle') 
                  : (type === 'income' ? 'Yeni Tahsilat / Gelir Girişi' : 'Yeni Ödeme / Gider Çıkışı')}
              </h3>
              <p className={cn(
                "text-xs mt-0.5 font-medium",
                type === 'income' ? "text-emerald-700" : "text-rose-700"
              )}>
                {isEditMode 
                  ? 'Kayıtlı finansal hareket bilgilerini ve cari etkisini güncelleyin'
                  : (type === 'income' ? 'Kasa veya bankaya para girişi kaydedin' : 'Kasa veya bankadan para çıkışı kaydedin')}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={loading}
            className="w-9 h-9 bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 dark:text-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 flex-1 min-h-0 overflow-y-auto">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Type Toggle */}
          <div className="grid grid-cols-2 gap-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl">
            <button
              type="button"
              onClick={() => handleTypeChange('income')}
              className={cn(
                "py-2.5 px-3 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all",
                type === 'income'
                  ? "bg-white dark:bg-slate-900 text-emerald-700 shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200"
              )}
            >
              <ArrowDownLeft className="w-4 h-4 text-emerald-600" />
              Tahsilat / Gelir (+)
            </button>
            <button
              type="button"
              onClick={() => handleTypeChange('expense')}
              className={cn(
                "py-2.5 px-3 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all",
                type === 'expense'
                  ? "bg-white dark:bg-slate-900 text-rose-700 shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200"
              )}
            >
              <ArrowUpRight className="w-4 h-4 text-rose-600" />
              Ödeme / Gider (-)
            </button>
          </div>

          {/* Amount & Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                İşlem Tutarı (₺) *
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">₺</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="0.00"
                  className={cn(
                    "w-full pl-8 pr-3 py-2.5 border rounded-xl text-base font-black font-mono outline-none transition-all shadow-2xs",
                    type === 'income' 
                      ? "border-emerald-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 text-emerald-950" 
                      : "border-rose-200 focus:border-rose-500 focus:ring-2 focus:ring-rose-100 text-rose-950"
                  )}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                İşlem Tarihi *
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 bg-white dark:bg-slate-900"
              />
            </div>
          </div>

          {/* Contact Select */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                İlgili Cari Firma / Müşteri / Tedarikçi
              </label>
              {selectedContact && (
                <span className="text-[10px] text-slate-400 font-mono">
                  Bakiye: ₺{selectedContact.balance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                </span>
              )}
            </div>
            <select
              value={contactId}
              onChange={(e) => handleContactChange(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 bg-white dark:bg-slate-900"
            >
              <option value="">-- Cari Seçilmedi (Genel Kasa Hareketi) --</option>
              {contacts?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.code ? `(${c.code})` : ''} — [{c.type === 'customer' ? 'Müşteri' : c.type === 'supplier' ? 'Tedarikçi' : 'Müşteri/Tedarikçi'}]
                </option>
              ))}
            </select>
          </div>

          {/* Payment Method & Document No */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Ödeme Yöntemi
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as any)}
                className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 bg-white dark:bg-slate-900"
              >
                <option value="cash">Nakit (Kasa)</option>
                <option value="bank_transfer">Banka Havalesi / EFT</option>
                <option value="credit_card">Kredi Kartı / POS</option>
                <option value="check">Çek / Senet</option>
                <option value="other">Diğer</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Makbuz / Dekont No
              </label>
              <input
                type="text"
                value={documentNo}
                onChange={(e) => setDocumentNo(e.target.value)}
                placeholder="Örn: MAK-10293"
                className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono font-bold text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 bg-white dark:bg-slate-900"
              />
            </div>
          </div>

          {/* Category */}
          <div className="space-y-1">
            <label className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              Kategori
            </label>
            <div className="space-y-2">
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Kategori seçin veya yazın..."
                className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 bg-white dark:bg-slate-900"
              />
              <div className="flex flex-wrap gap-1.5">
                {(type === 'income' ? incomeCategories : expenseCategories).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(cat)}
                    className={cn(
                      "text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-all",
                      category === cat
                        ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                        : "bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-600 hover:bg-slate-100 dark:bg-slate-800"
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1">
            <label className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              Açıklama & Not
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="İşlem ile ilgili detaylı açıklama..."
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 resize-none bg-white dark:bg-slate-900"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-5 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-50"
            >
              Vazgeç
            </button>
            <button
              type="submit"
              disabled={loading}
              className={cn(
                "px-6 py-2.5 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-md transition-all flex items-center gap-2 disabled:opacity-50",
                type === 'income' 
                  ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200" 
                  : "bg-rose-600 hover:bg-rose-700 shadow-rose-200"
              )}
            >
              <CheckCircle2 className="w-4 h-4" />
              {loading ? 'Kaydediliyor...' : isEditMode ? 'Değişiklikleri Kaydet' : 'Finansal Hareketi Ekle'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
