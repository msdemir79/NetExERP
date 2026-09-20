import React, { useState, useEffect } from 'react';
import type { Contact } from '../../types';
import { 
  ArrowDownLeft, 
  ArrowUpRight, 
  DollarSign, 
  CreditCard, 
  Calendar, 
  FileText, 
  Wallet,
  Building2,
  CheckCircle2
} from 'lucide-react';
import { cn } from '../../lib/utils';
import Modal from '../Modal';
import { erpService } from '../../services/erpService';

interface QuickPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  contact: Contact | null;
  defaultType?: 'income' | 'expense';
  onSuccess?: () => void;
}

export default function QuickPaymentModal({
  isOpen,
  onClose,
  contact,
  defaultType = 'income',
  onSuccess
}: QuickPaymentModalProps) {
  const [type, setType] = useState<'income' | 'expense'>(defaultType);
  const [amount, setAmount] = useState<number | ''>('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank_transfer' | 'credit_card' | 'check' | 'other'>('cash');
  const [documentNo, setDocumentNo] = useState('');
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (contact) {
      const isSupplier = contact.type === 'supplier';
      const initialType = defaultType || (isSupplier ? 'expense' : 'income');
      setType(initialType);
      
      const isIncome = initialType === 'income';
      setCategory(isIncome ? 'Satış Tahsilatı' : 'Tedarikçi Ödemesi');
      setDescription(isIncome 
        ? `${contact.name} firmasından tahsilat alındı` 
        : `${contact.name} firmasına ödeme yapıldı`
      );
      setDocumentNo(`MAK-${Date.now().toString().slice(-6)}`);
      setAmount('');
      setError(null);
    }
  }, [contact, defaultType, isOpen]);

  const handleTypeChange = (newType: 'income' | 'expense') => {
    setType(newType);
    if (contact) {
      if (newType === 'income') {
        setCategory('Satış Tahsilatı');
        setDescription(`${contact.name} firmasından tahsilat alındı`);
      } else {
        setCategory('Tedarikçi Ödemesi');
        setDescription(`${contact.name} firmasına ödeme yapıldı`);
      }
    }
  };

  if (!contact) return null;

  // Calculate projected balance after transaction
  const numAmount = typeof amount === 'number' ? amount : 0;
  let projectedBalance = contact.balance;
  if (contact.type === 'customer') {
    projectedBalance = type === 'income' ? contact.balance - numAmount : contact.balance + numAmount;
  } else if (contact.type === 'supplier') {
    projectedBalance = type === 'expense' ? contact.balance + numAmount : contact.balance - numAmount;
  } else {
    projectedBalance = type === 'income' ? contact.balance - numAmount : contact.balance + numAmount;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) {
      setError('Lütfen geçerli bir tutar giriniz.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await erpService.recordContactTransaction({
        contactId: contact.id!,
        type,
        amount: Number(amount),
        description: description.trim() || (type === 'income' ? 'Tahsilat' : 'Ödeme'),
        category,
        paymentMethod,
        documentNo: documentNo.trim() || undefined,
        date: date ? new Date(date) : new Date()
      });

      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Finansal işlem kaydedilirken hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={type === 'income' ? 'Cari Tahsilat Al (Para Girişi)' : 'Cari Ödeme Yap (Para Çıkışı)'}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-lg text-xs font-semibold">
            {error}
          </div>
        )}

        {/* Contact Info Ribbon */}
        <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-3.5 rounded-xl flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Seçili Cari:</div>
            <div className="font-bold text-sm text-slate-900 dark:text-slate-100 uppercase tracking-tight">{contact.name}</div>
            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">{contact.code || `ID: ${contact.id}`}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Mevcut Bakiye:</div>
            <div className={cn(
              "font-mono font-bold text-sm",
              contact.balance > 0 ? "text-emerald-600" : contact.balance < 0 ? "text-rose-600" : "text-slate-600"
            )}>
              ₺{Math.abs(contact.balance).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
              <span className="text-[10px] ml-1">
                {contact.balance > 0 ? '(Alacak)' : contact.balance < 0 ? '(Borç)' : ''}
              </span>
            </div>
          </div>
        </div>

        {/* Transaction Type Buttons */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => handleTypeChange('income')}
            className={cn(
              "py-2.5 px-3 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 border transition-all",
              type === 'income'
                ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 hover:bg-slate-50 dark:bg-slate-800/50"
            )}
          >
            <ArrowDownLeft className="w-4 h-4" />
            Tahsilat Al (Giriş)
          </button>
          <button
            type="button"
            onClick={() => handleTypeChange('expense')}
            className={cn(
              "py-2.5 px-3 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 border transition-all",
              type === 'expense'
                ? "bg-rose-600 text-white border-rose-600 shadow-sm"
                : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 hover:bg-slate-50 dark:bg-slate-800/50"
            )}
          >
            <ArrowUpRight className="w-4 h-4" />
            Ödeme Yap (Çıkış)
          </button>
        </div>

        {/* Amount & Date */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              İşlem Tutarı (₺) *
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                autoFocus
                value={amount}
                onChange={(e) => setAmount(e.target.value === '' ? '' : parseFloat(e.target.value))}
                placeholder="0.00"
                className="w-full border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 pl-7 text-base font-mono font-black focus:ring-1 focus:ring-indigo-500 outline-none text-slate-900 dark:text-slate-100"
              />
              <span className="absolute left-2.5 top-3 text-slate-400 font-bold text-sm">₺</span>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              İşlem Tarihi *
            </label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-xs font-bold focus:ring-1 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
            />
          </div>
        </div>

        {/* Payment Method */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            Ödeme Kanalı / Şekli *
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { id: 'cash', label: 'Nakit Kasa' },
              { id: 'bank_transfer', label: 'Banka / Havale' },
              { id: 'credit_card', label: 'Kredi Kartı' },
              { id: 'check', label: 'Çek / Senet' }
            ].map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setPaymentMethod(m.id as any)}
                className={cn(
                  "py-2 px-2 rounded-lg text-[11px] font-bold uppercase tracking-wider border transition-all text-center",
                  paymentMethod === m.id
                    ? "bg-slate-900 border-slate-900 text-white shadow-sm"
                    : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 hover:bg-slate-50 dark:bg-slate-800/50"
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Document No & Category */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Makbuz / Dekont No
            </label>
            <input
              type="text"
              value={documentNo}
              onChange={(e) => setDocumentNo(e.target.value)}
              placeholder="Örn: MAK-10293"
              className="w-full border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-xs font-mono font-bold focus:ring-1 focus:ring-indigo-500 outline-none uppercase"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              İşlem Kategorisi
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-xs font-bold focus:ring-1 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-900"
            >
              {type === 'income' ? (
                <>
                  <option value="Satış Tahsilatı">Satış Tahsilatı</option>
                  <option value="Cari Bakiye Tahsilatı">Cari Bakiye Tahsilatı</option>
                  <option value="Avans Tahsilatı">Avans Tahsilatı</option>
                  <option value="İade Girişi">İade Girişi</option>
                  <option value="Diğer Gelir">Diğer Gelir</option>
                </>
              ) : (
                <>
                  <option value="Tedarikçi Ödemesi">Tedarikçi Ödemesi</option>
                  <option value="Hammadde Alım Ödemesi">Hammadde Alım Ödemesi</option>
                  <option value="Fason Saya Ödemesi">Fason Saya Ödemesi</option>
                  <option value="Avans Ödemesi">Avans Ödemesi</option>
                  <option value="Masraf / Diğer">Masraf / Diğer</option>
                </>
              )}
            </select>
          </div>
        </div>

        {/* Description */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            Açıklama
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="İşlem açıklaması"
            className="w-full border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-xs font-semibold focus:ring-1 focus:ring-indigo-500 outline-none"
          />
        </div>

        {/* Projected Balance Projection */}
        {numAmount > 0 && (
          <div className="bg-indigo-50 border border-indigo-100 p-3 rounded-xl flex items-center justify-between text-xs">
            <span className="font-bold text-indigo-900">İşlem Sonrası Tahmini Bakiye:</span>
            <span className="font-mono font-black text-sm text-indigo-950">
              ₺{Math.abs(projectedBalance).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
              <span className="text-[10px] font-bold ml-1 text-indigo-700">
                {projectedBalance > 0 ? '(Alacak)' : projectedBalance < 0 ? '(Borç)' : '(Kapanır)'}
              </span>
            </span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-700">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 dark:text-slate-100 uppercase tracking-wider"
          >
            Vazgeç
          </button>
          <button
            type="submit"
            disabled={loading}
            className={cn(
              "px-6 py-2.5 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-colors shadow-sm",
              type === 'income' ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"
            )}
          >
            {loading ? 'Kaydediliyor...' : type === 'income' ? 'Tahsilatı Tamamla' : 'Ödemeyi Tamamla'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
