import React from 'react';
import type { Contact } from '../../types';
import { Printer, Download, Users, TrendingUp, TrendingDown, Building2, AlertTriangle } from 'lucide-react';
import { cn } from '../../lib/utils';
import Modal from '../Modal';

interface ContactBalanceReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  contacts: Contact[];
}

export default function ContactBalanceReportModal({
  isOpen,
  onClose,
  contacts
}: ContactBalanceReportModalProps) {
  const handlePrint = () => {
    window.print();
  };

  const handleExportCSV = () => {
    const headers = [
      'Cari Kodu',
      'Firma Ünvanı',
      'Cari Türü',
      'Yetkili Kişi',
      'Telefon',
      'Şehir',
      'Vergi No',
      'Vade Günü',
      'Risk Limiti',
      'Bakiye (TL)',
      'Bakiye Durumu'
    ];

    const rows = contacts.map(c => [
      `"${c.code || c.id}"`,
      `"${c.name.replace(/"/g, '""')}"`,
      `"${c.type === 'customer' ? 'Müşteri' : c.type === 'supplier' ? 'Tedarikçi' : 'Müşteri+Tedarikçi'}"`,
      `"${c.contactPerson || ''}"`,
      `"${c.phone || c.mobile || ''}"`,
      `"${c.city || ''}"`,
      `"${c.taxNumber || c.tcKimlik || ''}"`,
      `"${c.paymentTermDays || 0}"`,
      `"${c.creditLimit || 0}"`,
      c.balance.toFixed(2),
      `"${c.balance > 0 ? 'Alacaklıyız' : c.balance < 0 ? 'Borçluyuz' : 'Sıfır'}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Cari_Bakiye_Raporu_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const totalReceivables = contacts.filter(c => c.balance > 0).reduce((sum, c) => sum + c.balance, 0);
  const totalPayables = contacts.filter(c => c.balance < 0).reduce((sum, c) => sum + Math.abs(c.balance), 0);
  const netBalance = totalReceivables - totalPayables;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title=""
      size="full"
      headerActions={
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            Excel / CSV
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-colors shadow-sm"
          >
            <Printer className="w-3.5 h-3.5" />
            Yazdır / PDF
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Header Report Card */}
        <div className="border-b-2 border-slate-900 pb-4 flex flex-col sm:flex-row justify-between items-start gap-4">
          <div>
            <h2 className="text-xl font-black uppercase tracking-tight text-slate-900 dark:text-slate-100">
              GENEL CARİ BAKIYE & RİSK DURUM RAPORU
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Tüm müşteriler ve tedarikçilerin konsolide borç/alacak ve risk listesi.
            </p>
            <p className="text-[11px] text-slate-400 font-mono mt-1">
              Rapor Tarihi: {new Date().toLocaleDateString('tr-TR')} {new Date().toLocaleTimeString('tr-TR')} | Toplam {contacts.length} Cari Kaydı
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-xl text-right">
              <span className="text-[10px] font-bold text-emerald-700 uppercase block">Toplam Alacağımız</span>
              <span className="font-mono font-black text-sm text-emerald-900">
                ₺{totalReceivables.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="bg-rose-50 border border-rose-200 px-3 py-2 rounded-xl text-right">
              <span className="text-[10px] font-bold text-rose-700 uppercase block">Toplam Borcumuz</span>
              <span className="font-mono font-black text-sm text-rose-900">
                ₺{totalPayables.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="bg-indigo-50 border border-indigo-200 px-3 py-2 rounded-xl text-right">
              <span className="text-[10px] font-bold text-indigo-700 uppercase block">Net Bakiye</span>
              <span className="font-mono font-black text-sm text-indigo-950">
                ₺{Math.abs(netBalance).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        {/* Report Table */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="px-3 py-2.5 font-bold text-slate-600 uppercase tracking-wider w-24">Cari Kodu</th>
                  <th className="px-3 py-2.5 font-bold text-slate-600 uppercase tracking-wider">Cari / Firma Ünvanı</th>
                  <th className="px-3 py-2.5 font-bold text-slate-600 uppercase tracking-wider w-28">Tür</th>
                  <th className="px-3 py-2.5 font-bold text-slate-600 uppercase tracking-wider">Yetkili & İletişim</th>
                  <th className="px-3 py-2.5 font-bold text-slate-600 uppercase tracking-wider">Şehir</th>
                  <th className="px-3 py-2.5 font-bold text-slate-600 uppercase tracking-wider text-right w-24">Vade</th>
                  <th className="px-3 py-2.5 font-bold text-slate-600 uppercase tracking-wider text-right w-28">Risk Limiti</th>
                  <th className="px-3 py-2.5 font-bold text-slate-600 uppercase tracking-wider text-right w-36">Cari Bakiye (₺)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {contacts.map((c) => {
                  const isRiskExceeded = c.creditLimit && c.balance > c.creditLimit;
                  return (
                    <tr key={c.id} className="hover:bg-slate-50 dark:bg-slate-800/50 transition-colors">
                      <td className="px-3 py-2 font-mono font-bold text-indigo-700 whitespace-nowrap">
                        {c.code || `CAR-${c.id}`}
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-bold text-slate-900 dark:text-slate-100 uppercase tracking-tight">{c.name}</div>
                        {c.taxNumber && (
                          <div className="text-[10px] font-mono text-slate-400">VKN: {c.taxNumber}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={cn(
                          "px-2 py-0.5 text-[10px] font-bold rounded uppercase tracking-wider",
                          c.type === 'customer' ? "bg-indigo-100 text-indigo-800" :
                          c.type === 'supplier' ? "bg-amber-100 text-amber-800" :
                          "bg-emerald-100 text-emerald-800"
                        )}>
                          {c.type === 'customer' ? 'Müşteri' : c.type === 'supplier' ? 'Tedarikçi' : 'Müşteri+Tedarikçi'}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="text-slate-800 dark:text-slate-200 font-semibold">{c.contactPerson || '-'}</div>
                        <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400">{c.phone || c.mobile || ''}</div>
                      </td>
                      <td className="px-3 py-2 text-slate-700 dark:text-slate-200 font-medium">
                        {c.city || '-'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-slate-700 dark:text-slate-200">
                        {c.paymentTermDays ? `${c.paymentTermDays} Gün` : 'Peşin'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-700 dark:text-slate-200">
                        {c.creditLimit ? `₺${c.creditLimit.toLocaleString()}` : '-'}
                      </td>
                      <td className={cn(
                        "px-3 py-2 text-right font-mono font-black whitespace-nowrap",
                        c.balance > 0 ? "text-emerald-700" : c.balance < 0 ? "text-rose-700" : "text-slate-500 dark:text-slate-400"
                      )}>
                        <div className="flex items-center justify-end gap-1">
                          {isRiskExceeded && (
                            <span title="Risk Limiti Aşıldı!" className="text-rose-600 font-bold text-[10px]">
                              ⚠️
                            </span>
                          )}
                          <span>
                            ₺{Math.abs(c.balance).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          <span className="text-[10px] font-bold opacity-75">
                            {c.balance > 0 ? '(A)' : c.balance < 0 ? '(B)' : ''}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-100 dark:bg-slate-800 border-t-2 border-slate-300 font-bold">
                <tr>
                  <td colSpan={5} className="px-3 py-3 text-slate-800 dark:text-slate-200 uppercase tracking-wider text-right">
                    GENEL TOPLAM:
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-slate-700 dark:text-slate-200">-</td>
                  <td className="px-3 py-3 text-right font-mono text-slate-700 dark:text-slate-200">-</td>
                  <td className={cn(
                    "px-3 py-3 text-right font-mono font-black text-sm",
                    netBalance > 0 ? "text-emerald-700" : netBalance < 0 ? "text-rose-700" : "text-slate-800 dark:text-slate-200"
                  )}>
                    ₺{Math.abs(netBalance).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                    <span className="text-xs ml-1 font-semibold">
                      {netBalance > 0 ? '(Net Alacak)' : netBalance < 0 ? '(Net Borç)' : ''}
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </Modal>
  );
}
