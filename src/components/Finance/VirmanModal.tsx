import React, { useState } from 'react';
import { ArrowRightLeft, X } from 'lucide-react';
import { financeService } from '../../services/financeService';
import { showToast } from '../../lib/feedback';
import type { CashBox, BankAccount } from '../../types';

interface VirmanModalProps {
  isOpen: boolean;
  cashBoxes: CashBox[];
  bankAccounts: BankAccount[];
  onClose: () => void;
}

export default function VirmanModal({ isOpen, cashBoxes, bankAccounts, onClose }: VirmanModalProps) {
  // Form State for Virman
  const [virmanFromType, setVirmanFromType] = useState<'cash' | 'bank'>('cash');
  const [virmanFromId, setVirmanFromId] = useState<number | ''>('');
  const [virmanToType, setVirmanToType] = useState<'cash' | 'bank'>('bank');
  const [virmanToId, setVirmanToId] = useState<number | ''>('');
  const [virmanAmount, setVirmanAmount] = useState<string>('');
  const [virmanDesc, setVirmanDesc] = useState<string>('');

  // Handle Virman
  const handleSaveVirman = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(virmanAmount);
    if (!virmanFromId || !virmanToId || isNaN(amount) || amount <= 0) {
      showToast('Lütfen kaynak, hedef ve geçerli bir tutar seçiniz.', 'warning');
      return;
    }
    if (virmanFromType === virmanToType && virmanFromId === virmanToId) {
      showToast('Kaynak ve hedef hesap aynı olamaz.', 'warning');
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
      onClose();
      setVirmanAmount('');
      setVirmanDesc('');
      showToast('Virman işlemi başarıyla tamamlandı ve muhasebeleştirildi.', 'success');
    } catch (err: any) {
      showToast(`Virman hatası: ${err.message}`, 'error');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-lg w-full p-6 space-y-5">
        <div className="flex items-center justify-between border-b pb-3">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-indigo-600" />
            Hesaplar Arası Virman (Transfer)
          </h2>
          <button
            onClick={() => onClose()}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSaveVirman} className="space-y-4">
          <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
            <span className="text-xs font-bold text-gray-700">Kaynak Hesap (Paranın Çıkacağı)</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              onClick={() => onClose()}
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
  );
}
