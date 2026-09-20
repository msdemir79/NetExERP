import React, { useState } from 'react';
import { 
  X, 
  Printer, 
  Receipt, 
  Calendar, 
  Building2, 
  User, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  FileText, 
  ArrowRight,
  TrendingUp,
  Banknote,
  DollarSign
} from 'lucide-react';
import { printTabularReport } from '../../lib/printService';
import type { CheckNote, CheckStatus } from '../../types';

interface CheckHistoryModalProps {
  check: CheckNote | null;
  isOpen: boolean;
  onClose: () => void;
  onActionRequest?: (check: CheckNote, action: 'collect' | 'endorse' | 'bounce') => void;
}

export default function CheckHistoryModal({ check, isOpen, onClose, onActionRequest }: CheckHistoryModalProps) {
  if (!isOpen || !check) return null;

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const dueDate = new Date(check.dueDate);
  dueDate.setHours(0, 0, 0, 0);
  const diffTime = dueDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  const isOverdue = diffDays < 0 && (check.status === 'portfolio' || check.status === 'bank_collection');

  const getStatusBadge = (status: CheckStatus) => {
    switch (status) {
      case 'portfolio':
        return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">Portföyde (Cüzdanda)</span>;
      case 'bank_collection':
        return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-900 border border-blue-300">Tahsilde (Bankada)</span>;
      case 'collected':
        return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">Tahsil Edildi</span>;
      case 'endorsed':
        return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-900 border border-indigo-300">Ciro Edildi</span>;
      case 'bounced':
        return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-900 border border-rose-300">Karşılıksız</span>;
      case 'returned':
        return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-800 border border-gray-300">İade Edildi</span>;
      default:
        return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">{status}</span>;
    }
  };

  const getCheckTypeLabel = (type: string) => {
    switch (type) {
      case 'received_check': return 'Müşteri Çeki (Alınan)';
      case 'given_check': return 'Firma Çeki (Verilen)';
      case 'received_note': return 'Müşteri Senedi (Alınan)';
      case 'given_note': return 'Firma Senedi (Verilen)';
      default: return type;
    }
  };

  const handlePrint = () => {
    const headers = ['İŞLEM AŞAMASI', 'TARİH', 'AÇIKLAMA', 'İŞLEM YAPAN / HESAP', 'TUTAR (₺)'];
    const rows: (string | number)[][] = [
      [
        '1. BORDROYA GİRİŞ',
        new Date(check.issueDate || check.createdAt || new Date()).toLocaleDateString('tr-TR'),
        `${getCheckTypeLabel(check.type)} - Portföy No: ${check.portfolioNumber}`,
        check.contactName || check.drawer || '-',
        check.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })
      ]
    ];

    if (check.status === 'bank_collection' || check.status === 'collected') {
      rows.push([
        '2. BANKAYA TAKASA VERİLİŞ',
        new Date(check.dueDate).toLocaleDateString('tr-TR'),
        'Tahsile Verildi / Takas İşlemi',
        check.bankName || 'Banka Takası',
        check.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })
      ]);
    }

    if (check.status === 'collected') {
      rows.push([
        '3. TAHSİLAT KAPANIŞI',
        new Date(check.dueDate).toLocaleDateString('tr-TR'),
        'Çek Bedeli Hesaba Geçti',
        check.bankName || 'Kasa / Banka Hesabı',
        check.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })
      ]);
    } else if (check.status === 'endorsed') {
      rows.push([
        '3. CİRO EDİLME',
        new Date().toLocaleDateString('tr-TR'),
        'Tedarikçi / İlgili Cari Hesaba Ciro',
        'Tedarikçi Cari',
        check.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })
      ]);
    } else if (check.status === 'bounced') {
      rows.push([
        '3. KARŞILIKSIZ İŞLEMİ',
        new Date(check.dueDate).toLocaleDateString('tr-TR'),
        'Karşılıksız Kaşesi / İade Süreci',
        'Yasal Takip',
        check.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })
      ]);
    }

    const stats = [
      { label: 'ÇEK / SENET TUTARI', value: `₺${check.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` },
      { label: 'VADE TARİHİ', value: new Date(check.dueDate).toLocaleDateString('tr-TR') },
      { label: 'DURUMU', value: check.status === 'portfolio' ? 'Portföyde' : check.status === 'collected' ? 'Tahsil Edildi' : check.status === 'bank_collection' ? 'Tahsilde' : 'İşlem Gördü' },
      { label: 'TDHP HESAP', value: check.accountCode || (check.type.startsWith('received') ? '101.01' : '103.01') }
    ];

    printTabularReport(
      `ÇEK / SENET HAREKET KARTI & BORDRO BİLGİSİ: ${check.portfolioNumber}`,
      `Keşideci: ${check.drawer} | Seri No: ${check.serialNumber} | Banka: ${check.bankName || '-'}`,
      headers,
      rows,
      stats
    );
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col border border-gray-200 overflow-y-auto animate-in fade-in zoom-in duration-200">
        
        {/* HEADER */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center shadow-inner">
              <Receipt className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-amber-300 bg-amber-950/60 px-2.5 py-0.5 rounded border border-amber-700/50">
                  {check.portfolioNumber}
                </span>
                <h2 className="text-lg font-bold text-white">{getCheckTypeLabel(check.type)}</h2>
                <span className="text-xs text-slate-400 font-mono">TDHP: {check.accountCode || (check.type.startsWith('received') ? '101.01' : '103.01')}</span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Seri No: <span className="text-white font-mono font-bold">{check.serialNumber}</span> • Keşideci: <span className="text-white font-medium">{check.drawer}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline">Yazdır</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* SUMMARY & STATUS BANNER */}
        <div className="p-6 bg-slate-50 dark:bg-slate-800/50 border-b border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* Tutar & Vade */}
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-gray-200 shadow-xs flex flex-col justify-between">
              <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">Çek / Senet Tutarı</div>
              <div className="text-2xl font-black text-indigo-700 mt-1 font-mono">
                ₺{check.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-gray-400" />
                Vade: <span className="font-bold text-gray-800">{new Date(check.dueDate).toLocaleDateString('tr-TR')}</span>
              </div>
            </div>

            {/* Vade Analizi / Kalan Gün */}
            <div className={`p-4 rounded-xl border shadow-xs flex flex-col justify-between ${
              isOverdue 
                ? 'bg-rose-50 border-rose-200' 
                : check.status === 'collected'
                ? 'bg-emerald-50 border-emerald-200'
                : 'bg-blue-50 border-blue-200'
            }`}>
              <div className="text-xs font-bold uppercase tracking-wider flex items-center justify-between">
                <span>Vade Analizi</span>
                {getStatusBadge(check.status)}
              </div>
              <div className="mt-2">
                {check.status === 'collected' ? (
                  <div className="flex items-center gap-1.5 text-emerald-700 font-bold text-sm">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Tahsilat Başarıyla Tamamlandı
                  </div>
                ) : isOverdue ? (
                  <div className="text-rose-700 font-bold text-sm flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-rose-600" />
                    {Math.abs(diffDays)} Gün Gecikmede!
                  </div>
                ) : (
                  <div className="text-blue-700 font-bold text-sm flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-blue-600" />
                    Vadeye {diffDays} Gün Kaldı
                  </div>
                )}
              </div>
              <div className="text-[11px] text-gray-500 mt-1">
                Keşide Tarihi: {new Date(check.issueDate || check.createdAt || new Date()).toLocaleDateString('tr-TR')}
              </div>
            </div>

            {/* İlgili Cari & Banka */}
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-gray-200 shadow-xs flex flex-col justify-between text-xs">
              <div>
                <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Muhatap & Banka</div>
                <div className="font-bold text-gray-900 mt-1 truncate" title={check.contactName}>
                  {check.contactName || '-'}
                </div>
                <div className="text-gray-500 mt-0.5 truncate">
                  {check.bankName ? `${check.bankName} ${check.branchName ? `(${check.branchName})` : ''}` : 'Banka Belirtilmedi'}
                </div>
              </div>
              {check.notes && (
                <div className="mt-2 p-1.5 rounded bg-gray-50 text-[11px] text-gray-600 border border-gray-100 truncate">
                  Not: {check.notes}
                </div>
              )}
            </div>

          </div>
        </div>

        {/* TIMELINE OF MOVEMENTS */}
        <div className="p-6 overflow-y-auto max-h-[360px]">
          <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-indigo-600" />
            Çek / Senet Yaşam Döngüsü ve Hareket Geçmişi
          </h3>

          <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-indigo-200">
            
            {/* Step 1: Giriş */}
            <div className="relative">
              <div className="absolute -left-6 top-0.5 w-5 h-5 rounded-full bg-indigo-600 border-4 border-white shadow-xs flex items-center justify-center">
                <div className="w-1.5 h-1.5 bg-white dark:bg-slate-900 rounded-full"></div>
              </div>
              <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-gray-200 shadow-xs">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-gray-900 flex items-center gap-1.5">
                    1. Portföye / Bordroya Giriş
                  </span>
                  <span className="text-gray-500 font-mono">
                    {new Date(check.issueDate || check.createdAt || new Date()).toLocaleDateString('tr-TR')}
                  </span>
                </div>
                <p className="text-xs text-gray-600 mt-1">
                  İlgili Cari: <span className="font-semibold text-gray-900">{check.contactName}</span> tarafından <span className="font-mono font-bold text-indigo-700">{check.portfolioNumber}</span> no ile portföye kaydedildi.
                </p>
                <div className="mt-2 text-[11px] text-gray-400 font-mono">
                  Muhasebe Hesabı: {check.type.startsWith('received') ? '101.01 (Alınan Çekler)' : '103.01 (Verilen Çekler)'}
                </div>
              </div>
            </div>

            {/* Step 2: Bankaya Takas / Tahsilat */}
            {(check.status === 'bank_collection' || check.status === 'collected') && (
              <div className="relative">
                <div className="absolute -left-6 top-0.5 w-5 h-5 rounded-full bg-blue-600 border-4 border-white shadow-xs flex items-center justify-center">
                  <div className="w-1.5 h-1.5 bg-white dark:bg-slate-900 rounded-full"></div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-gray-200 shadow-xs">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-blue-900 flex items-center gap-1.5">
                      2. Bankaya Takasa Veriliş
                    </span>
                    <span className="text-gray-500 font-mono">
                      {new Date(check.dueDate).toLocaleDateString('tr-TR')}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">
                    Çek banka tahsilatı için takasa verildi.
                  </p>
                </div>
              </div>
            )}

            {/* Step 3: Son Durum */}
            {check.status === 'collected' && (
              <div className="relative">
                <div className="absolute -left-6 top-0.5 w-5 h-5 rounded-full bg-emerald-600 border-4 border-white shadow-xs flex items-center justify-center">
                  <div className="w-1.5 h-1.5 bg-white dark:bg-slate-900 rounded-full"></div>
                </div>
                <div className="bg-emerald-50/70 p-3.5 rounded-xl border border-emerald-200 shadow-xs">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-emerald-900 flex items-center gap-1.5">
                      3. Tahsilat Başarıyla Tamamlandı
                    </span>
                    <span className="text-emerald-700 font-mono">
                      {new Date(check.dueDate).toLocaleDateString('tr-TR')}
                    </span>
                  </div>
                  <p className="text-xs text-emerald-800 mt-1">
                    ₺{check.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} tutar hesaba geçti ve çek portföyden düşüldü.
                  </p>
                </div>
              </div>
            )}

            {check.status === 'endorsed' && (
              <div className="relative">
                <div className="absolute -left-6 top-0.5 w-5 h-5 rounded-full bg-indigo-600 border-4 border-white shadow-xs flex items-center justify-center">
                  <div className="w-1.5 h-1.5 bg-white dark:bg-slate-900 rounded-full"></div>
                </div>
                <div className="bg-indigo-50/70 p-3.5 rounded-xl border border-indigo-200 shadow-xs">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-indigo-900">
                      3. Ciro Edildi
                    </span>
                    <span className="text-indigo-700 font-mono">
                      {new Date().toLocaleDateString('tr-TR')}
                    </span>
                  </div>
                  <p className="text-xs text-indigo-800 mt-1">
                    Çek tedarikçiye ciro edilerek borç kapatıldı.
                  </p>
                </div>
              </div>
            )}

            {check.status === 'bounced' && (
              <div className="relative">
                <div className="absolute -left-6 top-0.5 w-5 h-5 rounded-full bg-rose-600 border-4 border-white shadow-xs flex items-center justify-center">
                  <div className="w-1.5 h-1.5 bg-white dark:bg-slate-900 rounded-full"></div>
                </div>
                <div className="bg-rose-50/70 p-3.5 rounded-xl border border-rose-200 shadow-xs">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-rose-900">
                      3. Karşılıksız Kaşesi Vuruldu
                    </span>
                    <span className="text-rose-700 font-mono">
                      {new Date(check.dueDate).toLocaleDateString('tr-TR')}
                    </span>
                  </div>
                  <p className="text-xs text-rose-800 mt-1">
                    Banka tarafından karşılıksız işlemi yapıldı. İlgili cari hesaba borç geri yüklendi.
                  </p>
                </div>
              </div>
            )}

          </div>
        </div>

        {/* FOOTER */}
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between text-xs">
          <div>
            {(check.status === 'portfolio' || check.status === 'bank_collection') && onActionRequest && (
              <button
                type="button"
                onClick={() => onActionRequest(check, 'collect')}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
              >
                Durum Güncelle / Tahsil Et
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-white dark:bg-slate-900 hover:bg-gray-100 text-gray-700 font-semibold rounded-lg border border-gray-300 transition-colors shadow-xs cursor-pointer"
          >
            Kapat
          </button>
        </div>

      </div>
    </div>
  );
}
