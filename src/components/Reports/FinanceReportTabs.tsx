import React from 'react';
import { Eye, AlertTriangle, Clock, Calendar, Search } from 'lucide-react';
import DataGrid, { type GridColumn } from '../Common/DataGrid';
import { cn } from '../../lib/utils';
import type { CheckNote, CashBox, BankAccount } from '../../types';

export type StatementRow = {
  id?: string | number;
  isDevir?: boolean;
  date: string;
  documentNo: string;
  type: string;
  typeLabel?: string;
  description?: string;
  contactName?: string;
  debit: number;
  credit: number;
  balance: number;
};

export type CheckAgingFilter = 'all' | 'overdue' | '0-30' | '31-60' | '61-90' | '90+';

interface CashStatementTabProps {
  selectedCashBoxId: number | 'all';
  setSelectedCashBoxId: React.Dispatch<React.SetStateAction<number | 'all'>>;
  cashBoxes: CashBox[];
  cashStartDate: string;
  setCashStartDate: React.Dispatch<React.SetStateAction<string>>;
  cashEndDate: string;
  setCashEndDate: React.Dispatch<React.SetStateAction<string>>;
  cashStatementData: any;
  setSelectedCashBoxModal: React.Dispatch<React.SetStateAction<CashBox | null>>;
  cashStatementColumns: GridColumn<StatementRow>[];
  cashStatementRows: StatementRow[];
  isLoadingCash: boolean;
}

export const CashStatementTab: React.FC<CashStatementTabProps> = ({
  selectedCashBoxId,
  setSelectedCashBoxId,
  cashBoxes,
  cashStartDate,
  setCashStartDate,
  cashEndDate,
  setCashEndDate,
  cashStatementData,
  setSelectedCashBoxModal,
  cashStatementColumns,
  cashStatementRows,
  isLoadingCash
}) => {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs overflow-hidden space-y-4 p-5">

      {/* FİLTRE VE SEÇİMLER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-gray-100">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="block text-[11px] font-bold text-gray-500 mb-1 uppercase">Kasa Seçimi</label>
            <select
              value={selectedCashBoxId}
              onChange={(e) => setSelectedCashBoxId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="text-xs font-semibold border border-gray-300 rounded-lg px-3 py-2 bg-white dark:bg-slate-900 text-gray-800 focus:ring-2 focus:ring-emerald-500/20"
            >
              {cashBoxes.map(c => (
                <option key={c.id} value={c.id}>{c.name} ({c.code || '100.01'}) - ₺{c.balance.toLocaleString('tr-TR')}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-gray-500 mb-1 uppercase">Başlangıç Tarihi</label>
            <input
              type="date"
              value={cashStartDate}
              onChange={(e) => setCashStartDate(e.target.value)}
              className="text-xs font-medium border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-900 text-gray-800 focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-gray-500 mb-1 uppercase">Bitiş Tarihi</label>
            <input
              type="date"
              value={cashEndDate}
              onChange={(e) => setCashEndDate(e.target.value)}
              className="text-xs font-medium border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-900 text-gray-800 focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          {(cashStartDate || cashEndDate) && (
            <div className="flex items-end">
              <button
                onClick={() => { setCashStartDate(''); setCashEndDate(''); }}
                className="text-xs text-rose-600 hover:text-rose-800 font-semibold py-2 cursor-pointer"
              >
                Tarihi Temizle
              </button>
            </div>
          )}
        </div>

        {cashStatementData && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const currentBox = cashBoxes.find(c => c.id === (selectedCashBoxId === 'all' ? cashBoxes[0]?.id : selectedCashBoxId));
                if (currentBox) setSelectedCashBoxModal(currentBox);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <Eye className="w-4 h-4" />
              Tam Ekran & Yazdır
            </button>
          </div>
        )}
      </div>

      {/* KASA ÖZET KARTLARI */}
      {cashStatementData && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
          <div>
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Devir Bakiyesi</span>
            <p className="text-base font-bold text-gray-800 font-mono mt-0.5">
              ₺{cashStatementData.initialBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div>
            <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Toplam Giriş (Tahsilat)</span>
            <p className="text-base font-bold text-emerald-700 font-mono mt-0.5">
              +₺{cashStatementData.totalDebit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div>
            <span className="text-[10px] font-bold text-rose-700 uppercase tracking-wider">Toplam Çıkış (Ödeme)</span>
            <p className="text-base font-bold text-rose-700 font-mono mt-0.5">
              -₺{cashStatementData.totalCredit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div>
            <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider">Kapanış Bakiyesi</span>
            <p className="text-lg font-black text-indigo-800 font-mono mt-0.5">
              ₺{cashStatementData.periodBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      )}

      {/* KASA HAREKET TABLOSU */}
      <DataGrid<StatementRow>
        columns={cashStatementColumns}
        data={cashStatementRows}
        rowKey={(item) => item.id ?? item.documentNo ?? item.description ?? 'row'}
        loading={isLoadingCash}
        emptyMessage="Bu tarih aralığında kasa hareketi bulunmamaktadır."
      />

    </div>
  );
};

interface BankStatementTabProps {
  selectedBankAccountId: number | 'all';
  setSelectedBankAccountId: React.Dispatch<React.SetStateAction<number | 'all'>>;
  bankAccounts: BankAccount[];
  bankStartDate: string;
  setBankStartDate: React.Dispatch<React.SetStateAction<string>>;
  bankEndDate: string;
  setBankEndDate: React.Dispatch<React.SetStateAction<string>>;
  bankStatementData: any;
  setSelectedBankAccountModal: React.Dispatch<React.SetStateAction<BankAccount | null>>;
  bankStatementColumns: GridColumn<StatementRow>[];
  bankStatementRows: StatementRow[];
  isLoadingBank: boolean;
}

export const BankStatementTab: React.FC<BankStatementTabProps> = ({
  selectedBankAccountId,
  setSelectedBankAccountId,
  bankAccounts,
  bankStartDate,
  setBankStartDate,
  bankEndDate,
  setBankEndDate,
  bankStatementData,
  setSelectedBankAccountModal,
  bankStatementColumns,
  bankStatementRows,
  isLoadingBank
}) => {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs overflow-hidden space-y-4 p-5">

      {/* FİLTRE VE SEÇİMLER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-gray-100">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="block text-[11px] font-bold text-gray-500 mb-1 uppercase">Banka Hesabı</label>
            <select
              value={selectedBankAccountId}
              onChange={(e) => setSelectedBankAccountId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="text-xs font-semibold border border-gray-300 rounded-lg px-3 py-2 bg-white dark:bg-slate-900 text-gray-800 focus:ring-2 focus:ring-blue-500/20"
            >
              {bankAccounts.map(b => (
                <option key={b.id} value={b.id}>{b.bankName} ({b.branchName || 'Merkez'}) - ₺{b.balance.toLocaleString('tr-TR')}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-gray-500 mb-1 uppercase">Başlangıç Tarihi</label>
            <input
              type="date"
              value={bankStartDate}
              onChange={(e) => setBankStartDate(e.target.value)}
              className="text-xs font-medium border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-900 text-gray-800 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-gray-500 mb-1 uppercase">Bitiş Tarihi</label>
            <input
              type="date"
              value={bankEndDate}
              onChange={(e) => setBankEndDate(e.target.value)}
              className="text-xs font-medium border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-900 text-gray-800 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          {(bankStartDate || bankEndDate) && (
            <div className="flex items-end">
              <button
                onClick={() => { setBankStartDate(''); setBankEndDate(''); }}
                className="text-xs text-rose-600 hover:text-rose-800 font-semibold py-2 cursor-pointer"
              >
                Tarihi Temizle
              </button>
            </div>
          )}
        </div>

        {bankStatementData && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const currentBank = bankAccounts.find(b => b.id === (selectedBankAccountId === 'all' ? bankAccounts[0]?.id : selectedBankAccountId));
                if (currentBank) setSelectedBankAccountModal(currentBank);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <Eye className="w-4 h-4" />
              Tam Ekran & Yazdır
            </button>
          </div>
        )}
      </div>

      {/* BANKA ÖZET KARTLARI */}
      {bankStatementData && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
          <div>
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Devir Bakiyesi</span>
            <p className="text-base font-bold text-gray-800 font-mono mt-0.5">
              ₺{bankStatementData.initialBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div>
            <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Gelen Havale / Yatırılan</span>
            <p className="text-base font-bold text-emerald-700 font-mono mt-0.5">
              +₺{bankStatementData.totalDebit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div>
            <span className="text-[10px] font-bold text-rose-700 uppercase tracking-wider">Gönderilen EFT / Çekilen</span>
            <p className="text-base font-bold text-rose-700 font-mono mt-0.5">
              -₺{bankStatementData.totalCredit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div>
            <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">Mevduat Bakiyesi</span>
            <p className="text-lg font-black text-blue-800 font-mono mt-0.5">
              ₺{bankStatementData.periodBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      )}

      {/* BANKA HAREKET TABLOSU */}
      <DataGrid<StatementRow>
        columns={bankStatementColumns}
        data={bankStatementRows}
        rowKey={(item) => item.id ?? item.documentNo ?? item.description ?? 'row'}
        loading={isLoadingBank}
        emptyMessage="Bu tarih aralığında banka hareketi bulunmamaktadır."
      />

    </div>
  );
};

interface ChecksAgingTabProps {
  checkAgingFilter: CheckAgingFilter;
  setCheckAgingFilter: React.Dispatch<React.SetStateAction<CheckAgingFilter>>;
  stats: {
    overdueChecksAmount: number;
    overdueChecksCount: number;
    checks0to30: number;
    checks31to60: number;
    checks61to90: number;
    checks90Plus: number;
  };
  checkColumns: GridColumn<CheckNote>[];
  filteredChecks: CheckNote[];
  checkSearchTerm: string;
  setCheckSearchTerm: React.Dispatch<React.SetStateAction<string>>;
  checkTypeFilter: 'all' | 'received' | 'given';
  setCheckTypeFilter: React.Dispatch<React.SetStateAction<'all' | 'received' | 'given'>>;
  checkStatusFilter: string;
  setCheckStatusFilter: React.Dispatch<React.SetStateAction<string>>;
}

export const ChecksAgingTab: React.FC<ChecksAgingTabProps> = ({
  checkAgingFilter,
  setCheckAgingFilter,
  stats,
  checkColumns,
  filteredChecks,
  checkSearchTerm,
  setCheckSearchTerm,
  checkTypeFilter,
  setCheckTypeFilter,
  checkStatusFilter,
  setCheckStatusFilter
}) => {
  return (
    <div className="space-y-4">

      {/* VADE YAŞLANDIRMA BUCKETLARI */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">

        <button
          type="button"
          onClick={() => setCheckAgingFilter(checkAgingFilter === 'overdue' ? 'all' : 'overdue')}
          className={cn(
            "p-3 rounded-xl border text-left transition-all cursor-pointer",
            checkAgingFilter === 'overdue' ? "bg-rose-100 border-rose-400 ring-2 ring-rose-400/30" : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-rose-300"
          )}
        >
          <div className="flex items-center justify-between text-rose-600 text-[10px] font-bold uppercase">
            <span>Vadesi Geçmiş</span>
            <AlertTriangle className="w-3.5 h-3.5" />
          </div>
          <div className="text-base font-black text-rose-700 font-mono mt-1">
            ₺{stats.overdueChecksAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-gray-500 mt-0.5">{stats.overdueChecksCount} Adet Çek</div>
        </button>

        <button
          type="button"
          onClick={() => setCheckAgingFilter(checkAgingFilter === '0-30' ? 'all' : '0-30')}
          className={cn(
            "p-3 rounded-xl border text-left transition-all cursor-pointer",
            checkAgingFilter === '0-30' ? "bg-amber-100 border-amber-400 ring-2 ring-amber-400/30" : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-amber-300"
          )}
        >
          <div className="flex items-center justify-between text-amber-600 text-[10px] font-bold uppercase">
            <span>0 - 30 Gün</span>
            <Clock className="w-3.5 h-3.5" />
          </div>
          <div className="text-base font-black text-amber-800 font-mono mt-1">
            ₺{stats.checks0to30.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-gray-500 mt-0.5">Bu ay ödenecek/tahsil</div>
        </button>

        <button
          type="button"
          onClick={() => setCheckAgingFilter(checkAgingFilter === '31-60' ? 'all' : '31-60')}
          className={cn(
            "p-3 rounded-xl border text-left transition-all cursor-pointer",
            checkAgingFilter === '31-60' ? "bg-blue-100 border-blue-400 ring-2 ring-blue-400/30" : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-blue-300"
          )}
        >
          <div className="flex items-center justify-between text-blue-600 text-[10px] font-bold uppercase">
            <span>31 - 60 Gün</span>
            <Calendar className="w-3.5 h-3.5" />
          </div>
          <div className="text-base font-black text-blue-800 font-mono mt-1">
            ₺{stats.checks31to60.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-gray-500 mt-0.5">Gelecek ay</div>
        </button>

        <button
          type="button"
          onClick={() => setCheckAgingFilter(checkAgingFilter === '61-90' ? 'all' : '61-90')}
          className={cn(
            "p-3 rounded-xl border text-left transition-all cursor-pointer",
            checkAgingFilter === '61-90' ? "bg-indigo-100 border-indigo-400 ring-2 ring-indigo-400/30" : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-indigo-300"
          )}
        >
          <div className="flex items-center justify-between text-indigo-600 text-[10px] font-bold uppercase">
            <span>61 - 90 Gün</span>
            <Calendar className="w-3.5 h-3.5" />
          </div>
          <div className="text-base font-black text-indigo-800 font-mono mt-1">
            ₺{stats.checks61to90.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-gray-500 mt-0.5">3. Ay vadeli</div>
        </button>

        <button
          type="button"
          onClick={() => setCheckAgingFilter(checkAgingFilter === '90+' ? 'all' : '90+')}
          className={cn(
            "p-3 rounded-xl border text-left transition-all cursor-pointer",
            checkAgingFilter === '90+' ? "bg-purple-100 border-purple-400 ring-2 ring-purple-400/30" : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-purple-300"
          )}
        >
          <div className="flex items-center justify-between text-purple-600 text-[10px] font-bold uppercase">
            <span>90+ Gün</span>
            <Calendar className="w-3.5 h-3.5" />
          </div>
          <div className="text-base font-black text-purple-800 font-mono mt-1">
            ₺{stats.checks90Plus.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-gray-500 mt-0.5">Uzun vadeli</div>
        </button>

      </div>

      {/* FİLTRE VE TABLO */}
      <DataGrid<CheckNote>
        columns={checkColumns}
        data={filteredChecks}
        rowKey="id"
        emptyMessage="Kriterlere uygun kayıtlı çek veya senet bulunamadı."
        toolbar={
          <>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Çek no, portföy no, keşideci, banka ara..."
                value={checkSearchTerm}
                onChange={(e) => setCheckSearchTerm(e.target.value)}
                className="pl-9 pr-3 py-1.5 text-xs font-medium bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 w-64"
              />
            </div>

            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs">
              <button
                onClick={() => setCheckTypeFilter('all')}
                className={cn(
                  "px-3 py-1 font-bold rounded-lg transition-all cursor-pointer",
                  checkTypeFilter === 'all' ? "bg-white dark:bg-slate-900 text-indigo-700 shadow-xs" : "text-slate-600"
                )}
              >
                Tümü
              </button>
              <button
                onClick={() => setCheckTypeFilter('received')}
                className={cn(
                  "px-3 py-1 font-bold rounded-lg transition-all cursor-pointer",
                  checkTypeFilter === 'received' ? "bg-white dark:bg-slate-900 text-emerald-700 shadow-xs" : "text-slate-600"
                )}
              >
                Alınan Çek/Senet
              </button>
              <button
                onClick={() => setCheckTypeFilter('given')}
                className={cn(
                  "px-3 py-1 font-bold rounded-lg transition-all cursor-pointer",
                  checkTypeFilter === 'given' ? "bg-white dark:bg-slate-900 text-rose-700 shadow-xs" : "text-slate-600"
                )}
              >
                Verilen Borç Çeki
              </button>
            </div>

            <select
              value={checkStatusFilter}
              onChange={(e) => setCheckStatusFilter(e.target.value)}
              className="text-xs border border-gray-300 rounded-lg py-1.5 px-2.5 bg-white dark:bg-slate-900 text-gray-700"
            >
              <option value="all">Tüm Durumlar</option>
              <option value="portfolio">Portföyde</option>
              <option value="bank_collection">Tahsilde</option>
              <option value="collected">Tahsil Edildi</option>
              <option value="endorsed">Ciro Edildi</option>
              <option value="bounced">Karşılıksız</option>
            </select>

            <div className="flex items-center gap-2 ml-auto">
              {checkAgingFilter !== 'all' && (
                <button
                  onClick={() => setCheckAgingFilter('all')}
                  className="text-xs font-semibold text-rose-600 hover:text-rose-800"
                >
                  Vade Filtresini Sıfırla
                </button>
              )}
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                {filteredChecks.length} Çek Kaydı
              </span>
            </div>
          </>
        }
      />
    </div>
  );
};
