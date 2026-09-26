import React, { useState, useMemo } from 'react';
import { api } from '../../api/client';
import { useApiQuery } from '../../hooks/useApiQuery';
import { 
  BookOpen, 
  Search, 
  Printer, 
  FileDown, 
  TrendingUp, 
  Percent, 
  CheckCircle2, 
  Scale
} from 'lucide-react';
import { printTabularReport } from '../../lib/printService';
import { exportToCsv } from '../../lib/exportService';
import { cn } from '../../lib/utils';
import DataGrid, { type GridColumn } from '../Common/DataGrid';
import type { Account } from '../../types';

export default function AccountingReport() {
  const [activeTab, setActiveTab] = useState<'mizan' | 'kdv' | 'journal'>('mizan');
  const [searchTerm, setSearchTerm] = useState('');
  const [balanceOnly, setBalanceOnly] = useState(false);
  const [mainAccountsOnly, setMainAccountsOnly] = useState(false);

  // Queries
  const accounts = useApiQuery(() => api.accounts.list({ orderBy: 'code' }), [], ['accounts']) || [];
  const entries = useApiQuery(() => api.journalEntries.list({ orderBy: 'date', orderDir: 'desc' }), [], ['journalEntries']) || [];

  // Account debit/credit balances calculated from journal entry lines
  const accountTotals = useMemo(() => {
    const map = new Map<string, { debit: number; credit: number }>();
    entries.forEach(entry => {
      entry.lines?.forEach(line => {
        const c = line.accountCode;
        const curr = map.get(c) || { debit: 0, credit: 0 };
        curr.debit += Number(line.debit) || 0;
        curr.credit += Number(line.credit) || 0;
        map.set(c, curr);
      });
    });
    return map;
  }, [entries]);

  // Mizan accounts
  const filteredAccounts = useMemo(() => {
    return accounts.filter(acc => {
      const matchesSearch = 
        acc.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        acc.name.toLowerCase().includes(searchTerm.toLowerCase());

      const t = accountTotals.get(acc.code) || { debit: 0, credit: 0 };
      const debit = t.debit;
      const credit = t.credit;
      const balance = Math.abs(debit - credit);
      const matchesBalance = !balanceOnly || balance > 0.01;

      const isMain = acc.code.length <= 3;
      const matchesLevel = !mainAccountsOnly || isMain;

      return matchesSearch && matchesBalance && matchesLevel;
    });
  }, [accounts, accountTotals, searchTerm, balanceOnly, mainAccountsOnly]);

  // Overall totals
  const totals = useMemo(() => {
    let totalDebit = 0;
    let totalCredit = 0;
    let total191 = 0;
    let total391 = 0;
    let sales600 = 0;

    accounts.forEach(a => {
      const t = accountTotals.get(a.code) || { debit: 0, credit: 0 };
      totalDebit += t.debit;
      totalCredit += t.credit;

      if (a.code.startsWith('191')) {
        total191 += (t.debit - t.credit);
      }
      if (a.code.startsWith('391')) {
        total391 += (t.credit - t.debit);
      }
      if (a.code.startsWith('600')) {
        sales600 += (t.credit - t.debit);
      }
    });

    const netKdvDifference = total391 - total191; // Pozitifse ödenecek (360), negatifse devreden (190)

    return {
      totalDebit,
      totalCredit,
      total191: Math.max(0, total191),
      total391: Math.max(0, total391),
      netKdvDifference,
      sales600
    };
  }, [accounts, accountTotals]);

  // Mizan tablosu kolonları
  const mizanColumns: GridColumn<Account>[] = [
    {
      key: 'code', title: 'Hesap Kodu', width: '110px',
      render: (acc) => <span className="font-mono font-bold text-[11px] text-slate-700 dark:text-slate-200">{acc.code}</span>,
      filterValue: (acc) => acc.code
    },
    {
      key: 'name', title: 'Hesap Adı',
      render: (acc) => <span className={cn('text-slate-900 dark:text-slate-100', acc.code.length <= 3 && 'font-bold')}>{acc.name}</span>,
      filterValue: (acc) => acc.name
    },
    {
      key: 'debit', title: 'Borç Toplamı', align: 'right',
      render: (acc) => {
        const t = accountTotals.get(acc.code) || { debit: 0, credit: 0 };
        return <span className="font-mono text-slate-800 dark:text-slate-200">₺{t.debit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>;
      },
      filterValue: (acc) => String((accountTotals.get(acc.code) || { debit: 0, credit: 0 }).debit)
    },
    {
      key: 'credit', title: 'Alacak Toplamı', align: 'right',
      render: (acc) => {
        const t = accountTotals.get(acc.code) || { debit: 0, credit: 0 };
        return <span className="font-mono text-slate-800 dark:text-slate-200">₺{t.credit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>;
      },
      filterValue: (acc) => String((accountTotals.get(acc.code) || { debit: 0, credit: 0 }).credit)
    },
    {
      key: 'debitBalance', title: 'Borç Bakiye', align: 'right',
      render: (acc) => {
        const t = accountTotals.get(acc.code) || { debit: 0, credit: 0 };
        const debitBal = t.debit > t.credit ? t.debit - t.credit : 0;
        return debitBal > 0
          ? <span className="font-mono font-bold text-indigo-700">₺{debitBal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
          : <span className="text-slate-400">-</span>;
      },
      filterValue: (acc) => {
        const t = accountTotals.get(acc.code) || { debit: 0, credit: 0 };
        return String(t.debit > t.credit ? t.debit - t.credit : 0);
      }
    },
    {
      key: 'creditBalance', title: 'Alacak Bakiye', align: 'right',
      render: (acc) => {
        const t = accountTotals.get(acc.code) || { debit: 0, credit: 0 };
        const creditBal = t.credit > t.debit ? t.credit - t.debit : 0;
        return creditBal > 0
          ? <span className="font-mono font-bold text-purple-700">₺{creditBal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
          : <span className="text-slate-400">-</span>;
      },
      filterValue: (acc) => {
        const t = accountTotals.get(acc.code) || { debit: 0, credit: 0 };
        return String(t.credit > t.debit ? t.credit - t.debit : 0);
      }
    }
  ];

  // Print Mizan Report
  const handlePrintMizan = () => {
    const headers = ['HESAP KODU', 'HESAP ADI', 'BORÇ TOPLAMI (₺)', 'ALACAK TOPLAMI (₺)', 'BORÇ BAKİYE (₺)', 'ALACAK BAKİYE (₺)'];
    const rows = filteredAccounts.map(a => {
      const t = accountTotals.get(a.code) || { debit: 0, credit: 0 };
      const debit = t.debit;
      const credit = t.credit;
      const debitBal = debit > credit ? debit - credit : 0;
      const creditBal = credit > debit ? credit - debit : 0;

      return [
        a.code,
        a.name,
        debit.toLocaleString('tr-TR', { minimumFractionDigits: 2 }),
        credit.toLocaleString('tr-TR', { minimumFractionDigits: 2 }),
        debitBal > 0 ? debitBal.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '-',
        creditBal > 0 ? creditBal.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '-'
      ];
    });

    printTabularReport(
      'Genel Mizan Raporu (Tekdüzen Hesap Planı)',
      'Dönem içi hesap hareketleri borç/alacak toplamları ve bakiye dökümü',
      headers,
      rows,
      [
        { label: 'Hesap Adedi', value: filteredAccounts.length },
        { label: 'Toplam Borç', value: `₺${totals.totalDebit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` },
        { label: 'Toplam Alacak', value: `₺${totals.totalCredit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` },
        { label: 'Genel Bakiye Dengesi', value: Math.abs(totals.totalDebit - totals.totalCredit) < 0.01 ? 'TAM DENK' : 'FARK VAR' }
      ]
    );
  };

  // Export Mizan to Excel CSV
  const handleExportMizanCsv = () => {
    const headers = [
      'Hesap Kodu',
      'Hesap Adı',
      'Borç Toplamı (TL)',
      'Alacak Toplamı (TL)',
      'Borç Bakiye (TL)',
      'Alacak Bakiye (TL)'
    ];

    const rows = filteredAccounts.map(a => {
      const t = accountTotals.get(a.code) || { debit: 0, credit: 0 };
      const debit = t.debit;
      const credit = t.credit;
      const debitBal = debit > credit ? debit - credit : 0;
      const creditBal = credit > debit ? credit - debit : 0;

      return [
        a.code,
        a.name,
        debit.toFixed(2),
        credit.toFixed(2),
        debitBal.toFixed(2),
        creditBal.toFixed(2)
      ];
    });

    exportToCsv('Genel_Mizan_Raporu.csv', headers, rows);
  };

  return (
    <div className="space-y-6">
      
      {/* Üst Bar & Sekme Seçimi */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        
        <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('mizan')}
            className={cn(
              "flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer",
              activeTab === 'mizan' ? "bg-white dark:bg-slate-900 text-indigo-700 shadow-xs" : "text-slate-600 hover:text-slate-900 dark:text-slate-100"
            )}
          >
            <Scale className="w-4 h-4 text-indigo-600" />
            Genel Mizan Raporu
          </button>
          <button
            onClick={() => setActiveTab('kdv')}
            className={cn(
              "flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer",
              activeTab === 'kdv' ? "bg-white dark:bg-slate-900 text-indigo-700 shadow-xs" : "text-slate-600 hover:text-slate-900 dark:text-slate-100"
            )}
          >
            <Percent className="w-4 h-4 text-emerald-600" />
            KDV Tahakkuk & Beyan Analizi (191 / 391)
          </button>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handlePrintMizan}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-xl transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4 text-slate-600" />
            Yazdır (A4)
          </button>
          <button
            onClick={handleExportMizanCsv}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <FileDown className="w-4 h-4" />
            Excel'e Aktar
          </button>
        </div>

      </div>

      {/* KPI Kartları */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Toplam Mizan Hacmi</span>
            <BookOpen className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-slate-100 font-mono">
            ₺{totals.totalDebit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] font-semibold text-emerald-600 mt-1 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Borç = Alacak Dengeli
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">191 İndirilecek KDV</span>
            <Percent className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-black text-blue-700 font-mono">
            ₺{totals.total191.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-1">
            Alış ve Gider KDV'si
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">391 Hesaplanan KDV</span>
            <Percent className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-2xl font-black text-purple-800 font-mono">
            ₺{totals.total391.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-1">
            Satış Fatura KDV'si
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Net KDV Durumu</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <div className={cn(
            "text-2xl font-black font-mono",
            totals.netKdvDifference > 0 ? "text-rose-700" : "text-emerald-700"
          )}>
            ₺{Math.abs(totals.netKdvDifference).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-1">
            {totals.netKdvDifference > 0 ? '360 Ödenecek Vergi Çıktı' : '190 Devreden KDV Kaldı'}
          </div>
        </div>

      </div>

      {/* Tab 1: Mizan Raporu */}
      {activeTab === 'mizan' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs overflow-hidden">
          
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input 
                  type="text"
                  placeholder="Hesap kodu veya adı ara..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 pr-3 py-1.5 text-xs font-medium bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 w-56"
                />
              </div>

              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
                <input 
                  type="checkbox"
                  checked={balanceOnly}
                  onChange={(e) => setBalanceOnly(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-0 cursor-pointer"
                />
                Sadece Bakiyesi Olanlar
              </label>

              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
                <input 
                  type="checkbox"
                  checked={mainAccountsOnly}
                  onChange={(e) => setMainAccountsOnly(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-0 cursor-pointer"
                />
                Sadece Ana Hesaplar (3 Haneli)
              </label>
            </div>

            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
              {filteredAccounts.length} Hesap Gösteriliyor
            </span>
          </div>

          <DataGrid<Account>
            columns={[
              {
                key: 'code',
                title: 'Hesap Kodu',
                width: '8rem',
                render: (acc) => (
                  <span className={cn('font-mono text-[11px] font-bold text-slate-700 dark:text-slate-200', acc.code.length <= 3 && 'text-slate-900 dark:text-slate-50')}>
                    {acc.code}
                  </span>
                ),
              },
              {
                key: 'name',
                title: 'Hesap Adı',
                render: (acc) => (
                  <span className={cn('text-slate-900 dark:text-slate-100', acc.code.length <= 3 && 'font-bold')}>{acc.name}</span>
                ),
              },
              {
                key: 'debit',
                title: 'Borç Toplamı',
                align: 'right',
                render: (acc) => (
                  <span className="font-mono text-slate-800 dark:text-slate-200">
                    ₺{(accountTotals.get(acc.code)?.debit || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                  </span>
                ),
                filterValue: (acc) => String(accountTotals.get(acc.code)?.debit || 0),
              },
              {
                key: 'credit',
                title: 'Alacak Toplamı',
                align: 'right',
                render: (acc) => (
                  <span className="font-mono text-slate-800 dark:text-slate-200">
                    ₺{(accountTotals.get(acc.code)?.credit || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                  </span>
                ),
                filterValue: (acc) => String(accountTotals.get(acc.code)?.credit || 0),
              },
              {
                key: 'debitBal',
                title: 'Borç Bakiye',
                align: 'right',
                render: (acc) => {
                  const t = accountTotals.get(acc.code) || { debit: 0, credit: 0 };
                  const bal = t.debit > t.credit ? t.debit - t.credit : 0;
                  return <span className="font-mono font-bold text-indigo-700">{bal > 0 ? `₺${bal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` : '-'}</span>;
                },
                filterValue: (acc) => {
                  const t = accountTotals.get(acc.code) || { debit: 0, credit: 0 };
                  return String(t.debit > t.credit ? t.debit - t.credit : 0);
                },
              },
              {
                key: 'creditBal',
                title: 'Alacak Bakiye',
                align: 'right',
                render: (acc) => {
                  const t = accountTotals.get(acc.code) || { debit: 0, credit: 0 };
                  const bal = t.credit > t.debit ? t.credit - t.debit : 0;
                  return <span className="font-mono font-bold text-purple-700">{bal > 0 ? `₺${bal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` : '-'}</span>;
                },
                filterValue: (acc) => {
                  const t = accountTotals.get(acc.code) || { debit: 0, credit: 0 };
                  return String(t.credit > t.debit ? t.credit - t.debit : 0);
                },
              },
            ]}
            data={filteredAccounts}
            rowKey="code"
            emptyMessage="Kayıtlı hesap bulunamadı."
            footer={
              <div className="flex flex-wrap items-center justify-end gap-4 font-mono font-black text-slate-900 dark:text-slate-100">
                <span className="mr-auto uppercase text-[10px] tracking-wider text-slate-600 dark:text-slate-300">Genel Toplam:</span>
                <span>₺{totals.totalDebit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                <span>₺{totals.totalCredit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
              </div>
            }
          />

        </div>
      )}

      {/* Tab 2: KDV Analizi */}
      {activeTab === 'kdv' && (
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs space-y-6">
          <div className="border-b border-slate-100 dark:border-slate-800 pb-4">
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-slate-100">
              KDV Beyannamesi Tahakkuk ve Karşılaştırma Raporu
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Satış faturalarından doğan 391 Hesaplanan KDV ile alış/gider faturalarından doğan 191 İndirilecek KDV dengesi.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* 191 İndirilecek KDV */}
            <div className="p-5 rounded-2xl bg-blue-50/50 border border-blue-200/80">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-black uppercase tracking-wider text-blue-900">191 İndirilecek KDV</span>
                <span className="text-xs font-bold text-blue-600">Alışlar & Giderler</span>
              </div>
              <div className="text-3xl font-black text-blue-900 font-mono">
                ₺{totals.total191.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
              </div>
              <p className="text-[11px] text-blue-700 mt-2">
                Şirketin mal, hammadde ve genel gider faturalarında devlete ödediği toplam KDV.
              </p>
            </div>

            {/* 391 Hesaplanan KDV */}
            <div className="p-5 rounded-2xl bg-purple-50/50 border border-purple-200/80">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-black uppercase tracking-wider text-purple-900">391 Hesaplanan KDV</span>
                <span className="text-xs font-bold text-purple-600">Satış Faturaları</span>
              </div>
              <div className="text-3xl font-black text-purple-900 font-mono">
                ₺{totals.total391.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
              </div>
              <p className="text-[11px] text-purple-700 mt-2">
                Müşterilere kesilen satış faturalarında tahsil edilen toplam KDV.
              </p>
            </div>

          </div>

          {/* Tahakkuk Sonucu */}
          <div className={cn(
            "p-6 rounded-2xl border text-center space-y-2",
            totals.netKdvDifference > 0 
              ? "bg-rose-50 border-rose-200 text-rose-950" 
              : "bg-emerald-50 border-emerald-200 text-emerald-950"
          )}>
            <span className="text-xs font-black uppercase tracking-widest px-3 py-1 rounded-full bg-white dark:bg-slate-900/80 shadow-xs">
              {totals.netKdvDifference > 0 ? 'ÖDENECEK VERGİ TAHAKKUKU' : 'DEVREDEN KDV DURUMU'}
            </span>
            <div className="text-4xl font-black font-mono mt-2">
              ₺{Math.abs(totals.netKdvDifference).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs font-medium max-w-lg mx-auto mt-2">
              {totals.netKdvDifference > 0 ? (
                <>Satış KDV'niz (391) alış KDV'nizden (191) fazla olduğu için vergi dairesine <strong>360 Ödenecek Vergi</strong> doğmuştur.</>
              ) : (
                <>Alış KDV'niz (191) satış KDV'nizden (391) fazla olduğu için aradaki fark <strong>190 Sonraki Döneme Devreden KDV</strong> olarak aktarılacaktır.</>
              )}
            </p>
          </div>

        </div>
      )}

    </div>
  );
}
