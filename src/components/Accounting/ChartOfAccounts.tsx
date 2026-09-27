import React, { useState, useMemo, useCallback } from 'react';
import {
  Search,
  Plus,
  Edit3,
  ArrowRight,
  FileSpreadsheet,
  PlusSquare,
  MinusSquare,
  X,
  CheckCircle2,
  AlertCircle,
  Trash2
} from 'lucide-react';
import type { Account, JournalEntry } from '../../types';
import { exportToCsv } from '../../lib/exportService';
import { cn } from '../../lib/utils';
import DataGrid, { StatusPill } from '../Common/DataGrid';
import { LEVEL_META, getAccountGroup } from './chartOfAccountsMeta';

interface ChartOfAccountsProps {
  accounts: Account[];
  journalEntries?: JournalEntry[];
  onEditAccount: (account: Account) => void;
  onAddAccount: (parentCode?: string) => void;
  onOpenKebir: (accountCode: string) => void;
  onDeleteAccount?: (account: Account) => void;
}

export default function ChartOfAccounts({
  accounts,
  journalEntries = [],
  onEditAccount,
  onAddAccount,
  onOpenKebir,
  onDeleteAccount
}: ChartOfAccountsProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [selectedAccountCode, setSelectedAccountCode] = useState<string | null>(null);
  const [onlyWithBalance, setOnlyWithBalance] = useState<boolean>(false);
  const [showDecimals, setShowDecimals] = useState<boolean>(true);
  // Build parent-child relationships and find which accounts have children
  const { parentMap, allParentCodes } = useMemo(() => {
    const pMap = new Map<string, string>();
    const parents = new Set<string>();

    for (const acc of accounts) {
      let pCode = acc.parentCode;
      if (!pCode) {
        if (acc.level === 2) pCode = acc.code.slice(0, 1);
        else if (acc.level === 3) pCode = acc.code.slice(0, 2);
        else if (acc.level === 4 && acc.code.includes('.')) pCode = acc.code.split('.')[0];
        else if (acc.level >= 5 && acc.code.includes('.')) {
          const parts = acc.code.split('.');
          pCode = parts.slice(0, -1).join('.');
        }
      }

      if (pCode) {
        pMap.set(acc.code, pCode);
        parents.add(pCode);
      }
    }

    return {
      parentMap: pMap,
      allParentCodes: parents
    };
  }, [accounts]);

  // Expanded nodes state: start with Level 1 & Level 2 expanded
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const acc of accounts) {
      if (acc.level === 1 || acc.level === 2) {
        initial.add(acc.code);
      }
    }
    return initial;
  });

  const toggleNode = (code: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  };

  const expandAll = () => {
    const all = new Set<string>();
    for (const acc of accounts) {
      if (allParentCodes.has(acc.code)) {
        all.add(acc.code);
      }
    }
    setExpandedNodes(all);
  };

  const collapseAll = () => {
    setExpandedNodes(new Set());
  };

  const expandToLevel = (level: number) => {
    const next = new Set<string>();
    for (const acc of accounts) {
      if (acc.level < level && allParentCodes.has(acc.code)) {
        next.add(acc.code);
      }
    }
    setExpandedNodes(next);
  };

  // Helper to check if an account's ancestors are all expanded
  const isAccountVisible = (acc: Account): boolean => {
    if (acc.level === 1) return true;

    let currentParentCode = parentMap.get(acc.code) || acc.parentCode;
    while (currentParentCode) {
      if (!expandedNodes.has(currentParentCode)) {
        return false;
      }
      currentParentCode = parentMap.get(currentParentCode);
    }
    return true;
  };

  // =========================================================================
  // 🧮 HIERARCHICAL BALANCES COMPUTATION (TDHP Mizan Rollup)
  // Both leaf accounts and parent accounts roll up Borç, Alacak, Borç Bakiye, Alacak Bakiye
  // =========================================================================
  const balancesMap = useMemo(() => {
    // 1. Accumulate direct debit and credit totals from journal entries
    const directMap = new Map<string, { debit: number; credit: number }>();
    for (const entry of journalEntries) {
      if (!entry.lines) continue;
      for (const line of entry.lines) {
        const c = line.accountCode?.trim();
        if (!c) continue;
        const cur = directMap.get(c) || { debit: 0, credit: 0 };
        cur.debit += Number(line.debit) || 0;
        cur.credit += Number(line.credit) || 0;
        directMap.set(c, cur);
      }
    }

    // Helper: Determine if childCode belongs under parentCode in the TDHP tree
    const isDescendant = (childCode: string, childParentCode: string | undefined, parentCode: string, parentLevel: number): boolean => {
      if (childCode === parentCode) return false;
      if (childParentCode === parentCode) return true;
      
      // Standard dot hierarchy: e.g. "100.01" -> child "100.01.001"
      if (parentCode.includes('.')) {
        return childCode.startsWith(parentCode + '.');
      }
      // Level 3 main account: e.g. "100" -> child "100.01", "100.01.001"
      if (parentLevel === 3 || parentCode.length === 3) {
        return childCode.startsWith(parentCode + '.') || (childCode.startsWith(parentCode) && childCode.length > 3);
      }
      // Level 2 group: e.g. "10" -> child "100", "100.01", "101", etc.
      if (parentLevel === 2 || parentCode.length === 2) {
        return childCode.startsWith(parentCode) && childCode !== parentCode;
      }
      // Level 1 class: e.g. "1" -> child "10", "100", "120", etc.
      if (parentLevel === 1 || parentCode.length === 1) {
        return childCode.startsWith(parentCode) && childCode !== parentCode;
      }
      return false;
    };

    // Identify leaf accounts (accounts that do not have child accounts)
    const leafCodes = new Set<string>();
    for (const acc of accounts) {
      const hasChild = accounts.some(other => isDescendant(other.code, other.parentCode, acc.code, acc.level));
      if (!hasChild) {
        leafCodes.add(acc.code);
      }
    }

    // Precalculate leaf balances
    const leafBalances = new Map<string, { debit: number; credit: number; debitBal: number; creditBal: number }>();
    for (const acc of accounts) {
      if (leafCodes.has(acc.code)) {
        let d = 0;
        let c = 0;
        // Direct matches or subcodes matching this leaf prefix
        for (const [entryCode, totals] of directMap.entries()) {
          if (entryCode === acc.code || entryCode.startsWith(acc.code + '.')) {
            d += totals.debit;
            c += totals.credit;
          }
        }
        d = Number(d.toFixed(2));
        c = Number(c.toFixed(2));
        const diff = d - c;
        const debitBal = diff > 0 ? Number(diff.toFixed(2)) : 0;
        const creditBal = diff < 0 ? Number(Math.abs(diff).toFixed(2)) : 0;
        leafBalances.set(acc.code, { debit: d, credit: c, debitBal, creditBal });
      }
    }

    // Build the final balance map for EVERY account (leaf + parent)
    const finalMap = new Map<string, {
      totalDebit: number;
      totalCredit: number;
      debitBalance: number;
      creditBalance: number;
      hasActivity: boolean;
    }>();

    for (const acc of accounts) {
      if (leafCodes.has(acc.code)) {
        const lb = leafBalances.get(acc.code) || { debit: 0, credit: 0, debitBal: 0, creditBal: 0 };
        finalMap.set(acc.code, {
          totalDebit: lb.debit,
          totalCredit: lb.credit,
          debitBalance: lb.debitBal,
          creditBalance: lb.creditBal,
          hasActivity: lb.debit > 0 || lb.credit > 0
        });
      } else {
        // Parent account: aggregate all descendant leaf balances
        const parentDirect = directMap.get(acc.code) || { debit: 0, credit: 0 };
        const pDiff = parentDirect.debit - parentDirect.credit;
        let sumDebit = parentDirect.debit;
        let sumCredit = parentDirect.credit;
        let sumDebitBal = pDiff > 0 ? pDiff : 0;
        let sumCreditBal = pDiff < 0 ? Math.abs(pDiff) : 0;

        for (const leafAcc of accounts) {
          if (leafCodes.has(leafAcc.code) && isDescendant(leafAcc.code, leafAcc.parentCode, acc.code, acc.level)) {
            const lb = leafBalances.get(leafAcc.code);
            if (lb) {
              sumDebit += lb.debit;
              sumCredit += lb.credit;
              sumDebitBal += lb.debitBal;
              sumCreditBal += lb.creditBal;
            }
          }
        }

        // Include any uncataloged journal lines that fall under this parent
        for (const [entryCode, totals] of directMap.entries()) {
          const belongsToParent = isDescendant(entryCode, undefined, acc.code, acc.level);
          const alreadyInLeaf = accounts.some(l => leafCodes.has(l.code) && (entryCode === l.code || entryCode.startsWith(l.code + '.')));
          if (belongsToParent && !alreadyInLeaf) {
            sumDebit += totals.debit;
            sumCredit += totals.credit;
            const diff = totals.debit - totals.credit;
            if (diff > 0) sumDebitBal += diff;
            else if (diff < 0) sumCreditBal += Math.abs(diff);
          }
        }

        sumDebit = Number(sumDebit.toFixed(2));
        sumCredit = Number(sumCredit.toFixed(2));
        sumDebitBal = Number(sumDebitBal.toFixed(2));
        sumCreditBal = Number(sumCreditBal.toFixed(2));

        finalMap.set(acc.code, {
          totalDebit: sumDebit,
          totalCredit: sumCredit,
          debitBalance: sumDebitBal,
          creditBalance: sumCreditBal,
          hasActivity: sumDebit > 0 || sumCredit > 0 || sumDebitBal > 0 || sumCreditBal > 0
        });
      }
    }

    return finalMap;
  }, [accounts, journalEntries]);

  // Grand totals across Level 1 accounts (or top level)
  const grandTotals = useMemo(() => {
    let totalDebit = 0;
    let totalCredit = 0;
    let totalDebitBal = 0;
    let totalCreditBal = 0;

    for (const acc of accounts) {
      if (acc.level === 1) {
        const b = balancesMap.get(acc.code);
        if (b) {
          totalDebit += b.totalDebit;
          totalCredit += b.totalCredit;
          totalDebitBal += b.debitBalance;
          totalCreditBal += b.creditBalance;
        }
      }
    }

    totalDebit = Number(totalDebit.toFixed(2));
    totalCredit = Number(totalCredit.toFixed(2));
    totalDebitBal = Number(totalDebitBal.toFixed(2));
    totalCreditBal = Number(totalCreditBal.toFixed(2));
    const diff = Number((totalDebit - totalCredit).toFixed(2));
    const isBalanced = Math.abs(diff) < 0.01;

    return {
      totalDebit,
      totalCredit,
      totalDebitBal,
      totalCreditBal,
      diff,
      isBalanced
    };
  }, [accounts, balancesMap]);

  // Search matching with ancestor propagation
  const matchingCodesWithAncestors = useMemo(() => {
    if (!searchTerm.trim()) return null;
    const q = searchTerm.toLowerCase().trim();
    const matches = new Set<string>();

    for (const acc of accounts) {
      const isMatch = acc.code.toLowerCase().includes(q) || 
                      acc.name.toLowerCase().includes(q) ||
                      (acc.description && acc.description.toLowerCase().includes(q));
      if (isMatch) {
        matches.add(acc.code);
        let p = parentMap.get(acc.code) || acc.parentCode;
        while (p) {
          matches.add(p);
          p = parentMap.get(p);
        }
      }
    }
    return matches;
  }, [accounts, searchTerm, parentMap]);

  // Filter accounts based on visibility and filters
  const visibleAccounts = useMemo(() => {
    return accounts.filter(acc => {
      // Type filter
      if (typeFilter !== 'all' && acc.type !== typeFilter) {
        return false;
      }
      // Balance filter: Sadece Bakiyesi Olanlar
      if (onlyWithBalance) {
        const b = balancesMap.get(acc.code);
        if (!b || !b.hasActivity) {
          return false;
        }
      }
      // Search matching
      if (matchingCodesWithAncestors) {
        return matchingCodesWithAncestors.has(acc.code);
      }
      // Hierarchy tree expand/collapse
      return isAccountVisible(acc);
    });
  }, [accounts, typeFilter, onlyWithBalance, balancesMap, matchingCodesWithAncestors, expandedNodes]);

  // Format amount like in the user's screenshot
  const formatAmount = useCallback((val: number) => {
    if (!val || Math.abs(val) < 0.0001) return '0';
    return new Intl.NumberFormat('tr-TR', {
      minimumFractionDigits: showDecimals ? 2 : 0,
      maximumFractionDigits: showDecimals ? 2 : 0
    }).format(val);
  }, [showDecimals]);

  const getBal = (acc: Account) => balancesMap.get(acc.code) || {
    totalDebit: 0,
    totalCredit: 0,
    debitBalance: 0,
    creditBalance: 0,
    hasActivity: false
  };

  // Export to Excel / CSV with all balances
  const handleExportCsv = () => {
    const headers = [
      'HESAP KODU',
      'HESAP ADI',
      'BORÇ (₺)',
      'ALACAK (₺)',
      'BORÇ BAKİYE (₺)',
      'ALACAK BAKİYE (₺)',
      'HESAP GRUBU',
      'SEVİYE',
      'PARA BİRİMİ'
    ];

    const rows = visibleAccounts.map(acc => {
      const b = balancesMap.get(acc.code) || { totalDebit: 0, totalCredit: 0, debitBalance: 0, creditBalance: 0 };
      return [
        acc.code,
        acc.name,
        b.totalDebit,
        b.totalCredit,
        b.debitBalance,
        b.creditBalance,
        getAccountGroup(acc),
        acc.level === 1 ? '1: Sınıf' : acc.level === 2 ? '2: Grup' : acc.level === 3 ? '3: Ana Hesap' : '4: Alt Hesap',
        acc.currency || 'TRY'
      ];
    });

    const dateStr = new Date().toISOString().slice(0, 10);
    exportToCsv(`Hesap_Plani_ve_Mizan_${dateStr}.csv`, headers, rows);
  };

  const isAllExpanded = allParentCodes.size > 0 && Array.from(allParentCodes).every(c => expandedNodes.has(c));
  const isAllCollapsed = expandedNodes.size === 0;

  // Selected account entity
  const selectedAccount = useMemo(() => {
    if (!selectedAccountCode) return null;
    return accounts.find(a => a.code === selectedAccountCode) || null;
  }, [accounts, selectedAccountCode]);

  return (
    <div className="space-y-0 font-sans border border-slate-400/80 rounded-md shadow-md overflow-hidden bg-slate-100 dark:bg-slate-800">
      
      {/* 1. CLASSIC ERP WINDOW TITLE BAR */}
      <div className="bg-gradient-to-r from-sky-800 via-blue-800 to-indigo-900 text-white px-3 py-1 flex items-center justify-between select-none shadow-xs">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-xs bg-white dark:bg-slate-900/20 border border-white/40 flex items-center justify-center text-[10px] font-black text-sky-200">
            H
          </div>
          <span className="text-xs font-bold tracking-tight">
            Hesap Planı Yönetimi & Mizan Bakiyeleri (080001)
          </span>
          <span className="text-[10px] bg-white dark:bg-slate-900/15 px-1.5 py-0.2 rounded text-sky-100 font-mono">
            TDHP Konsolide
          </span>
        </div>
      </div>

      {/* 3. ERP QUICK TOOLBAR */}
      <div className="bg-gradient-to-b from-slate-100 to-slate-200 border-b border-slate-300 px-3 py-1.5 flex flex-wrap items-center justify-between gap-2">
        
        {/* Left Toolbar Tools */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* New Sub-Account Button */}
          <button
            type="button"
            onClick={() => onAddAccount(selectedAccountCode || undefined)}
            className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded text-xs font-bold flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
            title="Yeni alt hesap kartı tanımla"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Yeni Alt Hesap</span>
          </button>

          {/* Edit Selected */}
          {selectedAccount && (
            <button
              type="button"
              onClick={() => onEditAccount(selectedAccount)}
              className="px-2 py-1 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:bg-slate-800/50 border border-slate-300 text-slate-700 dark:text-slate-200 rounded text-xs font-semibold flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
              title="Seçili hesabı düzenle"
            >
              <Edit3 className="w-3 h-3 text-indigo-600" />
              <span>Düzenle</span>
            </button>
          )}

          {/* Delete Selected */}
          {selectedAccount && onDeleteAccount && (
            <button
              type="button"
              onClick={() => onDeleteAccount(selectedAccount)}
              className="px-2 py-1 bg-white dark:bg-slate-900 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 rounded text-xs font-semibold flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
              title="Seçili hesabı plandan sil"
            >
              <Trash2 className="w-3 h-3 text-rose-600" />
              <span>Hesabı Sil</span>
            </button>
          )}

          {/* Open Kebir for Selected */}
          {selectedAccount && (
            <button
              type="button"
              onClick={() => onOpenKebir(selectedAccount.code)}
              className="px-2 py-1 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-800 rounded text-xs font-semibold flex items-center gap-1 shadow-2xs transition-colors"
              title="Seçili hesabın Defter-i Kebir hareketlerini aç"
            >
              <span>Kebir</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          )}

          <div className="h-4 w-px bg-slate-300 mx-0.5" />

          {/* Node Expand / Collapse Tools */}
          <div className="flex items-center gap-0.5 bg-white dark:bg-slate-900 border border-slate-300 rounded px-1 py-0.5 shadow-2xs">
            <button
              type="button"
              onClick={collapseAll}
              className={`px-1.5 py-0.5 text-xs font-medium rounded flex items-center gap-1 transition-colors ${
                isAllCollapsed ? 'bg-slate-800 text-white' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:bg-slate-800'
              }`}
              title="Tüm düğümleri kapat - Sadece Seviye 1 (Sınıflar) görünür"
            >
              <MinusSquare className="w-3.5 h-3.5 text-rose-500" />
              <span className="hidden sm:inline">Düğümleri Kapat</span>
            </button>

            <button
              type="button"
              onClick={expandAll}
              className={`px-1.5 py-0.5 text-xs font-medium rounded flex items-center gap-1 transition-colors ${
                isAllExpanded ? 'bg-slate-800 text-white' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:bg-slate-800'
              }`}
              title="Tüm düğümleri aç - Tüm üst ve alt hesaplar görünür"
            >
              <PlusSquare className="w-3.5 h-3.5 text-emerald-600" />
              <span className="hidden sm:inline">Düğümleri Aç</span>
            </button>

            <div className="h-3 w-px bg-slate-300 mx-1 hidden md:block" />

            {/* Quick Level Presets */}
            <div className="hidden lg:flex items-center gap-0.5 text-[11px] text-slate-600">
              <span className="text-[9px] text-slate-400 font-bold px-1 uppercase">Seviye:</span>
              <button
                type="button"
                onClick={() => expandToLevel(2)}
                className="px-1.5 py-0.5 rounded hover:bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold"
                title="L1: Sadece Sınıflar (1-9)"
              >
                L1
              </button>
              <button
                type="button"
                onClick={() => expandToLevel(3)}
                className="px-1.5 py-0.5 rounded hover:bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold"
                title="L2: Gruplar (10-99)"
              >
                L2
              </button>
              <button
                type="button"
                onClick={() => expandToLevel(4)}
                className="px-1.5 py-0.5 rounded hover:bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold"
                title="L3: Ana Hesaplar (100-999)"
              >
                L3
              </button>
              <button
                type="button"
                onClick={() => expandToLevel(5)}
                className="px-1.5 py-0.5 rounded hover:bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold"
                title="L4: Alt Hesaplar (.01)"
              >
                L4
              </button>
            </div>
          </div>

          <div className="h-4 w-px bg-slate-300 mx-0.5" />

          {/* Sadece Bakiyesi Olanlar Filtresi */}
          <label className="flex items-center gap-1.5 px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 rounded text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer shadow-2xs hover:bg-slate-50 dark:bg-slate-800/50 transition-colors select-none">
            <input
              type="checkbox"
              checked={onlyWithBalance}
              onChange={(e) => setOnlyWithBalance(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-slate-800 dark:text-slate-200">Sadece Bakiyesi Olanlar</span>
          </label>

          {/* Kuruş Göster Filtresi */}
          <button
            type="button"
            onClick={() => setShowDecimals(!showDecimals)}
            className={`px-2 py-1 rounded text-xs font-semibold border transition-colors ${
              showDecimals 
                ? 'bg-blue-50 border-blue-200 text-blue-800' 
                : 'bg-white dark:bg-slate-900 border-slate-300 text-slate-600'
            }`}
            title="Kuruş ondalık basamaklarını aç/kapat"
          >
            {showDecimals ? '₺ 0,00' : '₺ 0'}
          </button>
        </div>

        {/* Right Toolbar Tools: Export */}
        <div className="flex items-center gap-1.5">
          {/* Export to Excel */}
          <button
            type="button"
            onClick={handleExportCsv}
            className="px-2.5 py-1 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-200 border border-slate-300 rounded text-xs font-semibold flex items-center gap-1 shadow-2xs transition-colors"
            title="Mevcut listeyi ve bakiyeleri Excel/CSV olarak kaydet"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
            <span className="hidden sm:inline">Excel</span>
          </button>
        </div>
      </div>

      {/* 4. DATA GRID */}
      <div className="bg-white dark:bg-slate-900">
        <DataGrid<Account>
          data={visibleAccounts}
          rowKey={(acc) => acc.code}
          onRowClick={(acc) => setSelectedAccountCode(acc.code)}
          maxHeight="calc(100vh - 320px)"
          emptyMessage="Görüntülenecek hesap kaydı bulunamadı."
          toolbar={
            <>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Hesap kodu veya adı ara..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-44 sm:w-56 pl-6 pr-6 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-xs text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-1 focus:ring-blue-500 placeholder-slate-400"
                />
                <Search className="w-3 h-3 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="py-1 px-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-xs text-slate-700 dark:text-slate-200 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              >
                <option value="all">Tüm Tipler</option>
                <option value="asset">1-2: Aktif</option>
                <option value="liability">3-4: Pasif</option>
                <option value="equity">5: Özkaynak</option>
                <option value="revenue">6: Gelir</option>
                <option value="cost">7: Maliyet</option>
              </select>
            </>
          }
          columns={[
            {
              key: 'code',
              title: 'HESAP KODU',
              width: '240px',
              sortable: false,
              render: (acc) => {
                const hasChildren = allParentCodes.has(acc.code);
                const isExpanded = expandedNodes.has(acc.code);
                const isSelected = selectedAccountCode === acc.code;
                return (
                  <div
                    className="flex items-center gap-1.5"
                    style={{ paddingLeft: `${(acc.level - 1) * 14}px` }}
                  >
                    {isSelected && <span className="text-[9px] font-black text-blue-700 shrink-0">▶</span>}
                    {hasChildren ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleNode(acc.code);
                        }}
                        className="w-3.5 h-3.5 rounded-xs border flex items-center justify-center bg-white dark:bg-slate-900 border-slate-300 hover:border-blue-500 hover:bg-blue-50 text-slate-700 dark:text-slate-200 shrink-0 cursor-pointer shadow-2xs"
                        title={isExpanded ? 'Düğümü Kapat' : 'Düğümü Aç'}
                      >
                        <span className="font-mono text-[10px] leading-none font-black text-slate-800 dark:text-slate-200">
                          {isExpanded ? '−' : '+'}
                        </span>
                      </button>
                    ) : (
                      <span className="w-3.5 h-3.5 flex items-center justify-center shrink-0 opacity-40 text-slate-400 font-mono text-[9px]">
                        {acc.level >= 4 ? '└' : '•'}
                      </span>
                    )}
                    <span
                      className={cn(
                        'font-mono tracking-tight truncate',
                        acc.level === 1 && 'font-black text-slate-950 dark:text-slate-100',
                        acc.level === 2 && 'font-bold text-slate-900 dark:text-slate-100',
                        acc.level === 3 && 'font-bold text-blue-950 dark:text-blue-300',
                        acc.level >= 4 && 'font-semibold text-slate-800 dark:text-slate-200 text-xs'
                      )}
                    >
                      {acc.code}
                    </span>
                  </div>
                );
              },
              filterValue: (acc) => `${acc.code} ${acc.name} ${acc.description || ''}`,
            },
            {
              key: 'name',
              title: 'HESAP ADI',
              sortable: false,
              render: (acc) => (
                <span
                  className={cn(
                    'truncate block',
                    acc.level === 1 && 'font-black text-slate-950 dark:text-slate-100 uppercase',
                    acc.level === 2 && 'font-bold text-slate-900 dark:text-slate-100 uppercase',
                    acc.level === 3 && 'font-bold text-slate-900 dark:text-slate-100',
                    acc.level >= 4 && 'font-normal text-slate-800 dark:text-slate-200'
                  )}
                >
                  {acc.name}
                </span>
              ),
            },
            {
              key: 'debit',
              title: 'BORÇ',
              align: 'right',
              sortable: false,
              render: (acc) => {
                const v = getBal(acc).totalDebit;
                return (
                  <span
                    className={cn(
                      'font-mono whitespace-nowrap',
                      v === 0
                        ? 'text-slate-400'
                        : acc.level <= 3
                          ? 'font-bold text-slate-950 dark:text-slate-100'
                          : 'text-slate-900 dark:text-slate-100'
                    )}
                  >
                    {formatAmount(v)}
                  </span>
                );
              },
              filterValue: (acc) => String(getBal(acc).totalDebit),
            },
            {
              key: 'credit',
              title: 'ALACAK',
              align: 'right',
              sortable: false,
              render: (acc) => {
                const v = getBal(acc).totalCredit;
                return (
                  <span
                    className={cn(
                      'font-mono whitespace-nowrap',
                      v === 0
                        ? 'text-slate-400'
                        : acc.level <= 3
                          ? 'font-bold text-slate-950 dark:text-slate-100'
                          : 'text-slate-900 dark:text-slate-100'
                    )}
                  >
                    {formatAmount(v)}
                  </span>
                );
              },
              filterValue: (acc) => String(getBal(acc).totalCredit),
            },
            {
              key: 'debitBalance',
              title: 'BORÇ BAKİYE',
              align: 'right',
              sortable: false,
              render: (acc) => {
                const v = getBal(acc).debitBalance;
                return (
                  <span
                    className={cn(
                      'font-mono whitespace-nowrap',
                      v === 0
                        ? 'text-slate-400'
                        : acc.level <= 3
                          ? 'font-bold text-blue-950 dark:text-blue-200 bg-blue-50/40 dark:bg-blue-500/10'
                          : 'font-semibold text-blue-900 dark:text-blue-300'
                    )}
                  >
                    {formatAmount(v)}
                  </span>
                );
              },
              filterValue: (acc) => String(getBal(acc).debitBalance),
            },
            {
              key: 'creditBalance',
              title: 'ALACAK BAKİYE',
              align: 'right',
              sortable: false,
              render: (acc) => {
                const v = getBal(acc).creditBalance;
                return (
                  <span
                    className={cn(
                      'font-mono whitespace-nowrap',
                      v === 0
                        ? 'text-slate-400'
                        : acc.level <= 3
                          ? 'font-bold text-amber-950 dark:text-amber-200 bg-amber-50/40 dark:bg-amber-500/10'
                          : 'font-semibold text-amber-900 dark:text-amber-300'
                    )}
                  >
                    {formatAmount(v)}
                  </span>
                );
              },
              filterValue: (acc) => String(getBal(acc).creditBalance),
            },
            {
              key: 'group',
              title: 'HESAP GRUBU',
              sortable: false,
              render: (acc) => (
                <span className="text-slate-700 dark:text-slate-200 font-medium truncate block">
                  {getAccountGroup(acc)}
                </span>
              ),
            },
            {
              key: 'level',
              title: 'SEVİYE',
              align: 'center',
              sortable: false,
              render: (acc) => {
                const meta = LEVEL_META[acc.level] || LEVEL_META[5];
                return (
                  <StatusPill tone={meta.tone} className="text-[10px] px-1.5">
                    {meta.label}
                  </StatusPill>
                );
              },
              filterValue: (acc) => (LEVEL_META[acc.level] || LEVEL_META[5]).label,
            },
            {
              key: 'currency',
              title: 'PB',
              align: 'center',
              sortable: false,
              render: (acc) => (
                <span className="font-mono text-xs text-slate-600 dark:text-slate-300">
                  {acc.currency || 'TRY'}
                </span>
              ),
            },
          ]}
          rowActions={(acc) => (
            <>
              {(acc.level === 3 || acc.level === 4) && (
                <button
                  type="button"
                  onClick={() => onAddAccount(acc.code)}
                  className="px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100 rounded border border-emerald-300/60 transition-colors"
                  title={`${acc.code} altına yeni alt hesap aç`}
                >
                  +Alt
                </button>
              )}
              <button
                type="button"
                onClick={() => onEditAccount(acc)}
                className="px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 dark:text-slate-200 hover:text-blue-700 hover:bg-blue-50 rounded border border-slate-300 transition-colors"
                title="Hesap adını ve niteliklerini düzenle"
              >
                Düzenle
              </button>
              {onDeleteAccount && (
                <button
                  type="button"
                  onClick={() => onDeleteAccount(acc)}
                  className="px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 dark:text-rose-400 hover:text-rose-900 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded border border-rose-200 dark:border-rose-800 transition-colors inline-flex items-center gap-0.5"
                  title="Bu hesabı sil"
                >
                  <Trash2 className="w-2.5 h-2.5" />
                  <span>Sil</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => onOpenKebir(acc.code)}
                className="px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 rounded border border-blue-200 transition-colors inline-flex items-center gap-0.5"
                title="Defter-i Kebir muavin hareketlerini aç"
              >
                <span>Kebir</span>
                <ArrowRight className="w-2.5 h-2.5" />
              </button>
            </>
          )}
          footer={
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 w-full">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-black uppercase tracking-tight text-slate-800 dark:text-slate-100 whitespace-nowrap">
                  GENEL TOPLAM
                </span>
                <span className="text-[11px] font-semibold text-slate-500 truncate">
                  Konsolide TDHP Mizan Toplamları
                </span>
              </div>
              <div className="flex items-center gap-4 font-mono font-bold whitespace-nowrap">
                <span className="text-slate-600 dark:text-slate-400">
                  Borç: <strong className="text-slate-950 dark:text-slate-50">{formatAmount(grandTotals.totalDebit)}</strong>
                </span>
                <span className="text-slate-600 dark:text-slate-400">
                  Alacak: <strong className="text-slate-950 dark:text-slate-50">{formatAmount(grandTotals.totalCredit)}</strong>
                </span>
                <span className="text-blue-900 dark:text-blue-300">
                  B.Bakiye: <strong>{formatAmount(grandTotals.totalDebitBal)}</strong>
                </span>
                <span className="text-amber-900 dark:text-amber-300">
                  A.Bakiye: <strong>{formatAmount(grandTotals.totalCreditBal)}</strong>
                </span>
              </div>
              <div className="flex items-center font-mono text-[11px]">
                {grandTotals.isBalanced ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 font-bold border border-emerald-300">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                    MİZAN DENK (Borç = Alacak)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-100 text-rose-900 font-bold border border-rose-300">
                    <AlertCircle className="w-3.5 h-3.5 text-rose-700" />
                    BAKİYE FARKI: ₺ {grandTotals.diff.toLocaleString('tr-TR')}
                  </span>
                )}
              </div>
            </div>
          }
        />

        {/* 6. CLASSIC ERP STATUS BAR AT BOTTOM */}
        <div className="bg-slate-200 border-t border-slate-300 px-3 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-200 flex flex-wrap items-center justify-between gap-3 select-none">
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1 font-bold text-slate-800 dark:text-slate-200">
              <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse"></span>
              SİSTEM AKTİF
            </span>
            <span>Toplam Hesap: <strong className="text-slate-900 dark:text-slate-100 font-mono">{accounts.length}</strong></span>
            <span>Listelenen: <strong className="text-slate-900 dark:text-slate-100 font-mono">{visibleAccounts.length}</strong></span>
            <span>Açık Düğümler: <strong className="text-blue-800 font-mono">{expandedNodes.size}</strong> / {allParentCodes.size}</span>
          </div>

          <div className="flex items-center gap-3 text-[11px] text-slate-600 font-mono">
            {selectedAccount ? (
              <span className="bg-white dark:bg-slate-900 px-2 py-0.5 rounded-xs border border-slate-300 text-blue-800 font-bold">
                Seçili: {selectedAccount.code} - {selectedAccount.name}
              </span>
            ) : (
              <span>Herhangi bir satıra tıklayarak seçebilir veya çift tıklayarak düzenleyebilirsiniz</span>
            )}
            <span className="text-slate-400 hidden md:inline">| Sütun kenarını sürükleyerek genişliği ayarlayabilirsiniz</span>
          </div>
        </div>
      </div>
    </div>
  );
}
