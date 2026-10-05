import React, { useState } from 'react';
import { X } from 'lucide-react';
import { api } from '../../api/client';
import { accountingService } from '../../services/accountingService';
import { showToast } from '../../lib/feedback';

interface NewBankAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function NewBankAccountModal({ isOpen, onClose }: NewBankAccountModalProps) {
  // Form State for New Bank Account
  const [newBankName, setNewBankName] = useState('');
  const [newBankBranch, setNewBankBranch] = useState('');
  const [newBankAccountNo, setNewBankAccountNo] = useState('');
  const [newBankIban, setNewBankIban] = useState('');
  const [newBankAccountCode, setNewBankAccountCode] = useState('102.01');
  const [newBankCurrency, setNewBankCurrency] = useState('TRY');
  const [newBankBalance, setNewBankBalance] = useState('0');

  // Handle New Bank Account
  const handleSaveBankAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBankName || !newBankIban) {
      showToast('Lütfen banka adı ve IBAN giriniz.', 'warning');
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

      onClose();
      setNewBankName('');
      setNewBankBranch('');
      setNewBankAccountNo('');
      setNewBankIban('');
      setNewBankBalance('0');
    } catch (err: any) {
      showToast(`Banka hesabı ekleme hatası: ${err.message}`, 'error');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
        <div className="flex items-center justify-between border-b pb-3">
          <h2 className="text-lg font-bold text-gray-900">Yeni Banka Hesabı Tanımla</h2>
          <button onClick={() => onClose()} className="text-gray-400 hover:text-gray-600">
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
            <label className="block text-xs font-semibold text-gray-700 mb-1">Para Birimi</label>
            <select
              value={newBankCurrency}
              onChange={(e) => setNewBankCurrency(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-lg p-2 bg-white dark:bg-slate-900"
            >
              <option value="TRY">Türk Lirası (TRY)</option>
              <option value="USD">Amerikan Doları (USD)</option>
              <option value="EUR">Euro (EUR)</option>
            </select>
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
              onClick={() => onClose()}
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
  );
}
