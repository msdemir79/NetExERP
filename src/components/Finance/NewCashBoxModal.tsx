import React, { useState } from 'react';
import { X } from 'lucide-react';
import { api } from '../../api/client';
import { accountingService } from '../../services/accountingService';

interface NewCashBoxModalProps {
  isOpen: boolean;
  existingCount: number;
  onClose: () => void;
}

export default function NewCashBoxModal({ isOpen, existingCount, onClose }: NewCashBoxModalProps) {
  // Form State for New Cash Box
  const [newCashCode, setNewCashCode] = useState('');
  const [newCashName, setNewCashName] = useState('');
  const [newCashAccountCode, setNewCashAccountCode] = useState('100.01');
  const [newCashCurrency, setNewCashCurrency] = useState('TRY');
  const [newCashBalance, setNewCashBalance] = useState('0');
  const [newCashPerson, setNewCashPerson] = useState('');

  // Handle New Cash Box
  const handleSaveCashBox = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCashName) return;
    try {
      const cashCode = newCashCode || `KAS-${existingCount + 1}`;
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

      onClose();
      setNewCashName('');
      setNewCashCode('');
      setNewCashBalance('0');
      setNewCashPerson('');
    } catch (err: any) {
      alert(`Kasa ekleme hatası: ${err.message}`);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
        <div className="flex items-center justify-between border-b pb-3">
          <h2 className="text-lg font-bold text-gray-900">Yeni Kasa Tanımla</h2>
          <button onClick={() => onClose()} className="text-gray-400 hover:text-gray-600">
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
              onClick={() => onClose()}
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
  );
}
