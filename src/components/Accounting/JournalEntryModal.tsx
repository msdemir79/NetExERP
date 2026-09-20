import React, { useState } from 'react';
import { Plus, Trash2, AlertCircle, CheckCircle2, X } from 'lucide-react';
import type { Account, Contact, JournalEntryLine, JournalEntryType } from '../../types';
import { accountingService } from '../../services/accountingService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  accounts: Account[];
  contacts: Contact[];
  onSuccess: () => void;
}

export default function JournalEntryModal({ isOpen, onClose, accounts, contacts, onSuccess }: Props) {
  const [entryType, setEntryType] = useState<JournalEntryType>('mahsup');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');

  const [lines, setLines] = useState<JournalEntryLine[]>([
    {
      id: 'line-1',
      accountCode: '120.01',
      accountName: 'Yurtiçi Müşteriler Cari Hesabı',
      description: '',
      debit: 0,
      credit: 0
    },
    {
      id: 'line-2',
      accountCode: '600.20',
      accountName: '%20 KDV Yurtiçi Satışlar',
      description: '',
      debit: 0,
      credit: 0
    }
  ]);

  if (!isOpen) return null;

  const handleAccountChange = (index: number, code: string) => {
    const acc = accounts.find(a => a.code === code);
    const updated = [...lines];
    updated[index].accountCode = code;
    if (acc) {
      updated[index].accountName = acc.name;
    }
    setLines(updated);
  };

  const handleLineChange = (index: number, field: keyof JournalEntryLine, value: any) => {
    const updated = [...lines];
    (updated[index] as any)[field] = value;
    setLines(updated);
  };

  const addLine = () => {
    setLines([
      ...lines,
      {
        id: `line-${Date.now()}`,
        accountCode: '100.01',
        accountName: 'Merkez TL Kasası',
        description: description || '',
        debit: 0,
        credit: 0
      }
    ]);
  };

  const removeLine = (index: number) => {
    if (lines.length <= 2) {
      alert('Bir yevmiye fişinde en az 2 satır (Borç ve Alacak) bulunmalıdır.');
      return;
    }
    setLines(lines.filter((_, i) => i !== index));
  };

  const totalDebit = lines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((sum, l) => sum + (Number(l.credit) || 0), 0);
  const difference = Number((totalDebit - totalCredit).toFixed(2));
  const isBalanced = Math.abs(difference) < 0.05;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!description.trim()) {
      alert('Lütfen fiş açıklaması giriniz.');
      return;
    }

    if (!isBalanced) {
      alert(`Yevmiye fişi dengeli değil! Borç ve Alacak tutarları eşit olmalıdır.\nFark: ₺${Math.abs(difference).toLocaleString('tr-TR')}`);
      return;
    }

    if (totalDebit <= 0) {
      alert('Fiş toplam tutarı 0 olamaz.');
      return;
    }

    try {
      await accountingService.createJournalEntry({
        entryType,
        date: new Date(date),
        description,
        documentType: 'manual',
        documentNumber: documentNumber || undefined,
        lines: lines.map(l => ({
          ...l,
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0
        }))
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      alert(`Fiş kaydetme hatası: ${err.message}`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-4xl w-full p-6 space-y-5 my-8 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b pb-3 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Yeni Yevmiye Fişi Girişi</h2>
            <p className="text-xs text-gray-500">Tek Düzen Hesap Planına (TDHP) uygun çift taraflı kayıt</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 flex-1 overflow-y-auto pr-1">
          {/* Top Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 bg-gray-50 p-3.5 rounded-lg border border-gray-200">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Fiş Tipi *</label>
              <select
                value={entryType}
                onChange={(e) => setEntryType(e.target.value as JournalEntryType)}
                className="w-full text-xs border border-gray-300 rounded p-2 bg-white dark:bg-slate-900 font-medium"
              >
                <option value="mahsup">Mahsup Fişi (Genel)</option>
                <option value="tahsil">Tahsil Fişi (Kasaya Giriş)</option>
                <option value="tediye">Tediye Fişi (Kasadan Çıkış)</option>
                <option value="acilis">Açılış Fişi (Dönem Başı)</option>
                <option value="kapanis">Kapanış Fişi</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Fiş Tarihi *</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full text-xs border border-gray-300 rounded p-2 bg-white dark:bg-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Belge / Fatura No</label>
              <input
                type="text"
                placeholder="Örn: FAT-2026-001"
                value={documentNumber}
                onChange={(e) => setDocumentNumber(e.target.value)}
                className="w-full text-xs border border-gray-300 rounded p-2 bg-white dark:bg-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Genel Fiş Açıklaması *</label>
              <input
                type="text"
                required
                placeholder="Örn: Aylık kira tahakkuk fişi"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full text-xs border border-gray-300 rounded p-2 bg-white dark:bg-slate-900"
              />
            </div>
          </div>

          {/* Dynamic Lines Table */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead className="bg-gray-100 text-gray-700 font-semibold">
                <tr>
                  <th className="py-2.5 px-3 text-left w-36">Hesap Kodu</th>
                  <th className="py-2.5 px-3 text-left">Hesap Adı</th>
                  <th className="py-2.5 px-3 text-left">Satır Açıklaması</th>
                  <th className="py-2.5 px-3 text-left w-36">Cari (Opsiyonel)</th>
                  <th className="py-2.5 px-3 text-right w-28">Borç (₺)</th>
                  <th className="py-2.5 px-3 text-right w-28">Alacak (₺)</th>
                  <th className="py-2.5 px-2 text-center w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white dark:bg-slate-900">
                {lines.map((line, idx) => (
                  <tr key={line.id || `line-${idx}`} className="hover:bg-gray-50">
                    <td className="p-2">
                      <select
                        value={line.accountCode}
                        onChange={(e) => handleAccountChange(idx, e.target.value)}
                        className="w-full text-xs font-mono font-bold border border-gray-300 rounded p-1.5 bg-white dark:bg-slate-900"
                      >
                        {accounts.map((acc) => (
                          <option key={`je-acc-${acc.code}`} value={acc.code}>
                            {acc.code} - {acc.name}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="p-2">
                      <span className="text-xs text-gray-800 font-medium truncate block max-w-[200px]" title={line.accountName}>
                        {line.accountName}
                      </span>
                    </td>

                    <td className="p-2">
                      <input
                        type="text"
                        placeholder="Satır açıklaması"
                        value={line.description}
                        onChange={(e) => handleLineChange(idx, 'description', e.target.value)}
                        className="w-full text-xs border border-gray-300 rounded p-1.5"
                      />
                    </td>

                    <td className="p-2">
                      <select
                        value={line.contactId || ''}
                        onChange={(e) => handleLineChange(idx, 'contactId', e.target.value ? Number(e.target.value) : undefined)}
                        className="w-full text-xs border border-gray-300 rounded p-1.5 bg-white dark:bg-slate-900 truncate"
                      >
                        <option value="">Cari Yok</option>
                        {contacts.map((c) => (
                          <option key={`je-contact-${c.id}`} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </td>

                    <td className="p-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={line.debit || ''}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          handleLineChange(idx, 'debit', val);
                          if (val > 0) handleLineChange(idx, 'credit', 0);
                        }}
                        className="w-full text-xs text-right font-bold border border-gray-300 rounded p-1.5 text-gray-900"
                      />
                    </td>

                    <td className="p-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={line.credit || ''}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          handleLineChange(idx, 'credit', val);
                          if (val > 0) handleLineChange(idx, 'debit', 0);
                        }}
                        className="w-full text-xs text-right font-bold border border-gray-300 rounded p-1.5 text-gray-900"
                      />
                    </td>

                    <td className="p-2 text-center">
                      <button
                        type="button"
                        onClick={() => removeLine(idx)}
                        className="text-gray-400 hover:text-rose-600 p-1 rounded"
                        title="Satırı Sil"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Add Line Button */}
          <div>
            <button
              type="button"
              onClick={addLine}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-gray-300 text-xs font-semibold text-gray-700 hover:border-indigo-500 hover:text-indigo-600 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Hesap Satırı Ekle
            </button>
          </div>

          {/* Bottom Balancing Footer */}
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {isBalanced ? (
                <div className="flex items-center gap-1.5 text-emerald-700 bg-emerald-100/60 px-3 py-1 rounded-full text-xs font-bold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Fiş Dengeli (Borç = Alacak)
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-rose-700 bg-rose-100/60 px-3 py-1 rounded-full text-xs font-bold">
                  <AlertCircle className="w-4 h-4 text-rose-600" />
                  Dengesiz Fiş! Fark: ₺{Math.abs(difference).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                </div>
              )}
            </div>

            <div className="flex items-center gap-6 text-sm font-semibold">
              <div>
                <span className="text-gray-500 text-xs mr-2">Toplam Borç:</span>
                <span className="font-mono text-gray-900 font-bold">
                  ₺{totalDebit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div>
                <span className="text-gray-500 text-xs mr-2">Toplam Alacak:</span>
                <span className="font-mono text-gray-900 font-bold">
                  ₺{totalCredit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
            >
              Vazgeç
            </button>
            <button
              type="submit"
              disabled={!isBalanced || totalDebit <= 0}
              className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Yevmiye Fişini Kaydet & Onayla
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
