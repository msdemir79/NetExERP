import React, { useState, useEffect } from 'react';
import { 
  CreditCard, 
  Plus, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  DollarSign, 
  User, 
  Search, 
  Calendar 
} from 'lucide-react';
import type { Employee, AdvanceRequest } from '../../types';
import { hrService } from '../../services/hrService';

interface AdvanceTabProps {
  employees: Employee[];
  onAdvancesUpdated?: () => void;
}

export default function AdvanceTab({ employees, onAdvancesUpdated }: AdvanceTabProps) {
  const [advances, setAdvances] = useState<AdvanceRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedEmpId, setSelectedEmpId] = useState<number>(employees[0]?.id || 0);
  const [amount, setAmount] = useState<number>(5000);
  const [requestDate, setRequestDate] = useState(new Date().toISOString().split('T')[0]);
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadAdvances = async () => {
    try {
      setLoading(true);
      const data = await hrService.getAdvances();
      setAdvances(data);
    } catch (err) {
      console.error('Avans talepleri yüklenemedi:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdvances();
  }, []);

  const handleCreateAdvance = async (e: React.FormEvent) => {
    e.preventDefault();
    const emp = employees.find(e => e.id === selectedEmpId);
    if (!emp) return;

    try {
      setIsSubmitting(true);
      const d = new Date(requestDate);
      const curMonth = d.getMonth() + 1;
      const curYear = d.getFullYear();

      await hrService.addAdvance({
        employeeId: emp.id!,
        employeeName: emp.name,
        amount: Number(amount) || 0,
        date: d,
        month: curMonth,
        year: curYear,
        status: 'pending',
        description: reason.trim() || undefined
      });

      await loadAdvances();
      onAdvancesUpdated?.();
      setIsModalOpen(false);
      setReason('');
    } catch (err: any) {
      alert(err?.message || 'Avans talebi eklenemedi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApprove = async (id: number) => {
    try {
      await hrService.updateAdvanceStatus(id, 'paid');
      await loadAdvances();
      onAdvancesUpdated?.();
    } catch (err) {
      console.error('Avans onaylama hatası:', err);
    }
  };

  const filteredAdvances = advances.filter(adv => {
    if (searchTerm && !adv.employeeName.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  const totalPending = advances.filter(a => a.status === 'pending').reduce((sum, a) => sum + a.amount, 0);
  const totalPaid = advances.filter(a => a.status === 'paid').reduce((sum, a) => sum + a.amount, 0);

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="relative w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Personel ara..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 dark:text-slate-400">Bekleyen: <b className="text-amber-600 font-mono">₺{totalPending.toLocaleString('tr-TR')}</b></span>
            <span className="text-slate-300">|</span>
            <span className="text-slate-500 dark:text-slate-400">Ödenen/Mahsup: <b className="text-emerald-600 font-mono">₺{totalPaid.toLocaleString('tr-TR')}</b></span>
          </div>

          <button
            onClick={() => {
              if (employees.length > 0) setSelectedEmpId(employees[0].id!);
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-sm shadow-indigo-200 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Yeni Avans Talebi
          </button>
        </div>
      </div>

      {/* Advances Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-indigo-600" />
            Personel Avans Talepleri & Mahsup Listesi
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold border-b border-slate-200 dark:border-slate-700">
                <th className="p-3">Personel</th>
                <th className="p-3">Talep Tarihi</th>
                <th className="p-3">Mahsup Dönemi</th>
                <th className="p-3 text-right">Avans Tutarı</th>
                <th className="p-3">Açıklama</th>
                <th className="p-3 text-center">Durum</th>
                <th className="p-3 text-center">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAdvances.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    Kayıtlı avans talebi bulunamadı.
                  </td>
                </tr>
              ) : (
                filteredAdvances.map((adv) => (
                  <tr key={adv.id} className="hover:bg-slate-50 dark:bg-slate-800/50/80 transition-colors">
                    <td className="p-3 font-bold text-slate-800 dark:text-slate-200">{adv.employeeName}</td>
                    <td className="p-3 text-slate-600">{new Date(adv.date).toLocaleDateString('tr-TR')}</td>
                    <td className="p-3 font-mono text-slate-700 dark:text-slate-200">{adv.month}/{adv.year}</td>
                    <td className="p-3 text-right font-mono font-bold text-rose-600">
                      ₺{adv.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-3 text-slate-500 dark:text-slate-400 max-w-xs truncate">{adv.description || '-'}</td>
                    <td className="p-3 text-center">
                      {adv.status === 'paid' && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {adv.isDeducted ? 'Bordrodan Kesildi' : 'Ödendi / Mahsup Bekliyor'}
                        </span>
                      )}
                      {adv.status === 'pending' && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          Onay Bekliyor
                        </span>
                      )}
                      {adv.status === 'rejected' && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          Reddedildi
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      {adv.status === 'pending' && (
                        <button
                          onClick={() => handleApprove(adv.id!)}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold transition-colors shadow-2xs"
                        >
                          Onayla & Öde
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Advance Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 dark:border-slate-700 p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="shrink-0 flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-base text-slate-800 dark:text-slate-200">Yeni Personel Avans Girişi</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <form onSubmit={handleCreateAdvance} className="flex-1 min-h-0 overflow-y-auto space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1 uppercase">Personel *</label>
                <select
                  value={selectedEmpId}
                  onChange={(e) => setSelectedEmpId(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white dark:bg-slate-900"
                >
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.employeeCode} - {emp.department})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1 uppercase">Avans Tutarı (₺) *</label>
                <input
                  type="number"
                  min="100"
                  step="100"
                  required
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-bold font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1 uppercase">Ödeme / Talep Tarihi</label>
                <input
                  type="date"
                  required
                  value={requestDate}
                  onChange={(e) => setRequestDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1 uppercase">Açıklama / Not</label>
                <textarea
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Avans gerekçesi (örn: Kira ödemesi, sağlık)..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:bg-slate-800 rounded-lg"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm shadow-indigo-200 transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? 'Kaydediliyor...' : 'Avansı Kaydet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
