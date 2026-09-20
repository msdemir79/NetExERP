import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { 
  Search, 
  Plus, 
  Edit3, 
  ArrowRight, 
  FileSpreadsheet,
  PlusSquare,
  MinusSquare,
  RotateCcw,
  Printer,
  RefreshCw,
  SlidersHorizontal,
  X,
  Layers,
  ChevronDown,
  ChevronRight,
  Maximize2,
  Minus,
  Check,
  Filter,
  Eye,
  Scale,
  CheckCircle2,
  AlertCircle,
  Trash2
} from 'lucide-react';
import type { Account, JournalEntry } from '../../types';
import { exportToCsv } from '../../lib/exportService';

interface ChartOfAccountsProps {
  accounts: Account[];
  journalEntries?: JournalEntry[];
  onEditAccount: (account: Account) => void;
  onAddAccount: (parentCode?: string) => void;
  onOpenKebir: (accountCode: string) => void;
  onDeleteAccount?: (account: Account) => void;
}

// Map class digit to Account Group name (matching standard TDHP)
const GROUP_NAMES: Record<string, string> = {
  '1': '1 DÖNEN VARLIKLAR',
  '2': '2 DURAN VARLIKLAR',
  '3': '3 KISA VADELİ YABANCI KAYNAKLAR',
  '4': '4 UZUN VADELİ YABANCI KAYNAKLAR',
  '5': '5 ÖZKAYNAKLAR',
  '6': '6 GELİR TABLOSU HESAPLARI',
  '7': '7 MALİYET HESAPLARI (7/A SEÇENEĞİ)',
  '8': '8 SERBEST HESAPLAR',
  '9': '9 NAZIM HESAPLARI',
};

// Map 2-digit to Main Group description
const MAIN_GROUPS: Record<string, string> = {
  '10': '10 HAZIR DEĞERLER',
  '11': '11 MENKUL KIYMETLER',
  '12': '12 TİCARİ ALACAKLAR',
  '13': '13 DİĞER ALACAKLAR',
  '15': '15 STOKLAR',
  '17': '17 YILLARA YAYGIN İNŞAAT VE ONARIM',
  '18': '18 GELECEK AYLARA AİT GİDERLER',
  '19': '19 DİĞER DÖNEN VARLIKLAR',
  '22': '22 TİCARİ ALACAKLAR',
  '24': '24 MALİ DURAN VARLIKLAR',
  '25': '25 MADDİ DURAN VARLIKLAR',
  '26': '26 MADDİ OLMAYAN DURAN VARLIKLAR',
  '27': '27 ÖZEL TÜKENMEYE TABİ VARLIKLAR',
  '28': '28 GELECEK YILLARA AİT GİDERLER',
  '29': '29 DİĞER DURAN VARLIKLAR',
  '30': '30 MALİ BORÇLAR',
  '32': '32 TİCARİ BORÇLAR',
  '33': '33 DİĞER BORÇLAR',
  '34': '34 ALINAN AVANSLAR',
  '36': '36 ÖDENECEK VERGİ VE YÜKÜMLÜLÜKLER',
  '37': '37 BORÇ VE GİDER KARŞILIKLARI',
  '38': '38 GELECEK AYLARA AİT GELİRLER',
  '39': '39 DİĞER KISA VADELİ BORÇLAR',
  '40': '40 MALİ BORÇLAR',
  '42': '42 TİCARİ BORÇLAR',
  '50': '50 ÖDENMİŞ SERMAYE',
  '52': '52 SERMAYE YEDEKLERİ',
  '54': '54 KÂR YEDEKLERİ',
  '57': '57 GEÇMİŞ YILLAR KÂRLARI',
  '58': '58 GEÇMİŞ YILLAR ZARARLARI (-)',
  '59': '59 DÖNEM NET KÂRI (ZARARI)',
  '60': '60 BRÜT SATIŞLAR',
  '61': '61 SATIŞ İNDİRİMLERİ (-)',
  '62': '62 SATIŞLARIN MALİYETİ (-)',
  '63': '63 FAALİYET GİDERLERİ (-)',
  '64': '64 DİĞER FAALİYETLERDEN OLAĞAN GELİR',
  '65': '65 DİĞER FAALİYETLERDEN OLAĞAN GİDER (-)',
  '66': '66 FİNANSMAN GİDERLERİ (-)',
  '70': '70 MALİYET MUHASEBESİ BAĞLANTI',
  '71': '71 DİREKT İLK MADDE VE MALZEME',
  '72': '72 DİREKT İŞÇİLİK GİDERLERİ',
  '73': '73 GENEL ÜRETİM GİDERLERİ',
  '74': '74 HİZMET ÜRETİM MALİYETİ',
  '75': '75 ARAŞTIRMA VE GELİŞTİRME',
  '76': '76 PAZARLAMA SATIŞ VE DAĞITIM',
  '77': '77 GENEL YÖNETİM GİDERLERİ',
  '78': '78 FİNANSMAN GİDERLERİ',
  '90': '90 NAZIM HESAPLAR',
  '99': '99 DİĞER NAZIM HESAPLAR'
};

export interface ColumnDef {
  id: string;
  label: string;
  defaultWidth: number;
  minWidth: number;
  align?: 'left' | 'center' | 'right';
  isBalance?: boolean;
}

const ALL_COLUMN_DEFINITIONS: ColumnDef[] = [
  { id: 'code', label: 'HESAP KODU', defaultWidth: 170, minWidth: 100, align: 'left' },
  { id: 'name', label: 'HESAP ADI', defaultWidth: 280, minWidth: 140, align: 'left' },
  { id: 'debit', label: 'BORÇ', defaultWidth: 140, minWidth: 90, align: 'right', isBalance: true },
  { id: 'credit', label: 'ALACAK', defaultWidth: 140, minWidth: 90, align: 'right', isBalance: true },
  { id: 'debitBalance', label: 'BORÇ BAKİYE', defaultWidth: 140, minWidth: 90, align: 'right', isBalance: true },
  { id: 'creditBalance', label: 'ALACAK BAKİYE', defaultWidth: 140, minWidth: 90, align: 'right', isBalance: true },
  { id: 'group', label: 'HESAP GRUBU', defaultWidth: 180, minWidth: 100, align: 'left' },
  { id: 'mainGroup', label: 'ANA GRUP', defaultWidth: 120, minWidth: 70, align: 'left' },
  { id: 'level', label: 'SEVİYE', defaultWidth: 70, minWidth: 50, align: 'center' },
  { id: 'currency', label: 'PB', defaultWidth: 55, minWidth: 45, align: 'center' },
  { id: 'actions', label: 'İŞLEMLER', defaultWidth: 155, minWidth: 95, align: 'right' },
];

const PRESET_MIZAN_COLS = ['code', 'name', 'debit', 'credit', 'debitBalance', 'creditBalance', 'actions'];
const PRESET_EXTENDED_COLS = ['code', 'name', 'debit', 'credit', 'debitBalance', 'creditBalance', 'group', 'level', 'currency', 'actions'];

const STORAGE_WIDTHS_KEY = 'proerp_tdhp_col_widths_v2';
const STORAGE_VISIBLE_COLS_KEY = 'proerp_tdhp_col_visible_v2';

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
  const [viewPreset, setViewPreset] = useState<'mizan' | 'extended'>('mizan');
  const [isColumnDropdownOpen, setIsColumnDropdownOpen] = useState(false);

  // Visible columns state
  const [visibleColIds, setVisibleColIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_VISIBLE_COLS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return PRESET_MIZAN_COLS;
  });

  const toggleColumnVisibility = (colId: string) => {
    if (colId === 'code' || colId === 'name') return; // Cannot hide code or name
    setVisibleColIds(prev => {
      const next = prev.includes(colId) ? prev.filter(id => id !== colId) : [...prev, colId];
      try {
        localStorage.setItem(STORAGE_VISIBLE_COLS_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const applyPreset = (preset: 'mizan' | 'extended') => {
    setViewPreset(preset);
    const cols = preset === 'mizan' ? PRESET_MIZAN_COLS : PRESET_EXTENDED_COLS;
    setVisibleColIds(cols);
    try {
      localStorage.setItem(STORAGE_VISIBLE_COLS_KEY, JSON.stringify(cols));
    } catch {
      // ignore
    }
  };

  // Active visible column definitions in order
  const activeColumns = useMemo(() => {
    return ALL_COLUMN_DEFINITIONS.filter(c => visibleColIds.includes(c.id));
  }, [visibleColIds]);

  // Column widths state with localStorage persistence
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_WIDTHS_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // ignore
    }
    const initial: Record<string, number> = {};
    for (const c of ALL_COLUMN_DEFINITIONS) {
      initial[c.id] = c.defaultWidth;
    }
    return initial;
  });

  const saveWidths = (widths: Record<string, number>) => {
    try {
      localStorage.setItem(STORAGE_WIDTHS_KEY, JSON.stringify(widths));
    } catch {
      // ignore
    }
  };

  // Column resizing state and ref
  const resizingRef = useRef<{
    colId: string;
    startX: number;
    startWidth: number;
  } | null>(null);
  const [isResizing, setIsResizing] = useState(false);

  const handleMouseDownResize = (e: React.MouseEvent, colId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const currentWidth = colWidths[colId] || ALL_COLUMN_DEFINITIONS.find(c => c.id === colId)?.defaultWidth || 140;
    resizingRef.current = {
      colId,
      startX: e.clientX,
      startWidth: currentWidth
    };
    setIsResizing(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const { colId, startX, startWidth } = resizingRef.current;
      const colDef = ALL_COLUMN_DEFINITIONS.find(c => c.id === colId);
      const minW = colDef?.minWidth || 50;
      const delta = e.clientX - startX;
      const newWidth = Math.max(minW, startWidth + delta);

      setColWidths(prev => ({ ...prev, [colId]: newWidth }));
    };

    const handleMouseUp = () => {
      if (resizingRef.current) {
        resizingRef.current = null;
        setIsResizing(false);
        setColWidths(prev => {
          saveWidths(prev);
          return prev;
        });
      }
    };

    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  // Reset all column widths to defaults
  const handleResetWidths = () => {
    const resetWidths: Record<string, number> = {};
    for (const c of ALL_COLUMN_DEFINITIONS) {
      resetWidths[c.id] = c.defaultWidth;
    }
    setColWidths(resetWidths);
    saveWidths(resetWidths);
  };

  // Build parent-child relationships and find which accounts have children
  const { childrenMap, parentMap, allParentCodes, level1Codes } = useMemo(() => {
    const cMap = new Map<string, string[]>();
    const pMap = new Map<string, string>();
    const parents = new Set<string>();
    const l1 = new Set<string>();

    for (const acc of accounts) {
      if (acc.level === 1) l1.add(acc.code);

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
        const existing = cMap.get(pCode) || [];
        existing.push(acc.code);
        cMap.set(pCode, existing);
      }
    }

    return { 
      childrenMap: cMap, 
      parentMap: pMap, 
      allParentCodes: parents,
      level1Codes: l1
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

  // Helper: Get Account Group name
  const getAccountGroup = useCallback((acc: Account): string => {
    const firstChar = acc.code.charAt(0);
    if (GROUP_NAMES[firstChar]) return GROUP_NAMES[firstChar];
    return acc.type === 'asset' ? '1 DÖNEN VARLIKLAR' :
           acc.type === 'liability' ? '3 KISA VADELİ YABANCI KAYNAKLAR' :
           acc.type === 'equity' ? '5 ÖZKAYNAKLAR' :
           acc.type === 'revenue' ? '6 GELİR TABLOSU' :
           acc.type === 'cost' ? '7 MALİYET HESAPLARI' : 'DİĞER';
  }, []);

  // Helper: Get Main Group
  const getMainGroup = useCallback((acc: Account): string => {
    const cleanCode = acc.code.replace(/\D/g, '');
    if (cleanCode.length >= 2) {
      const prefix2 = cleanCode.slice(0, 2);
      if (MAIN_GROUPS[prefix2]) return MAIN_GROUPS[prefix2];
      return prefix2;
    }
    return acc.code;
  }, []);

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
    <div className={`space-y-0 font-sans border border-slate-400/80 rounded-md shadow-md overflow-hidden bg-slate-100 dark:bg-slate-800 ${isResizing ? 'select-none cursor-col-resize' : ''}`}>
      
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

        <div className="flex items-center gap-1 text-xs">
          <button 
            type="button"
            onClick={() => applyPreset(viewPreset === 'mizan' ? 'extended' : 'mizan')}
            className="text-[11px] bg-white dark:bg-slate-900/10 hover:bg-white dark:bg-slate-900/20 px-2 py-0.5 rounded text-white font-medium flex items-center gap-1 transition-colors"
            title="Görünüm modunu değiştir"
          >
            <Eye className="w-3 h-3 text-sky-300" />
            <span>{viewPreset === 'mizan' ? 'Bakiye Görünümü (Mizan)' : 'Genişletilmiş ERP'}</span>
          </button>
          <div className="h-3 w-px bg-white dark:bg-slate-900/30 mx-1" />
          <button 
            type="button"
            onClick={handleResetWidths}
            className="text-[11px] bg-white dark:bg-slate-900/10 hover:bg-white dark:bg-slate-900/20 px-1.5 py-0.5 rounded text-white/90 hover:text-white flex items-center gap-1 transition-colors"
            title="Sütun genişliklerini orijinal ayarlarına sıfırla"
          >
            <RotateCcw className="w-3 h-3 text-amber-300" />
            <span>Sütunları Sıfırla</span>
          </button>
        </div>
      </div>

      {/* 2. ERP MENU BAR */}
      <div className="bg-slate-200 border-b border-slate-300 px-3 py-1 flex flex-wrap items-center justify-between text-xs text-slate-700 dark:text-slate-200 select-none">
        <div className="flex items-center gap-4 text-xs font-medium">
          <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200 font-semibold">
            <Scale className="w-3.5 h-3.5 text-blue-700" />
            <span>Görünüm:</span>
            <button
              type="button"
              onClick={() => applyPreset('mizan')}
              className={`px-2 py-0.5 rounded text-[11px] font-bold transition-colors ${
                viewPreset === 'mizan' ? 'bg-blue-700 text-white shadow-2xs' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-300/70'
              }`}
            >
              Mizan / Bakiyeler (Birebir)
            </button>
            <button
              type="button"
              onClick={() => applyPreset('extended')}
              className={`px-2 py-0.5 rounded text-[11px] font-bold transition-colors ${
                viewPreset === 'extended' ? 'bg-blue-700 text-white shadow-2xs' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-300/70'
              }`}
            >
              Tüm Sütunlar
            </button>
          </div>

          <div className="h-3 w-px bg-slate-400" />

          {/* Sütunlar dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsColumnDropdownOpen(!isColumnDropdownOpen)}
              className="hover:text-blue-700 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <SlidersHorizontal className="w-3 h-3 text-slate-500 dark:text-slate-400" />
              <span>Sütun Seçimi ({activeColumns.length}/{ALL_COLUMN_DEFINITIONS.length})</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {isColumnDropdownOpen && (
              <div className="absolute left-0 top-full mt-1 w-56 bg-white dark:bg-slate-900 border border-slate-300 rounded shadow-lg py-1 z-30 text-xs">
                <div className="px-3 py-1 font-bold text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 text-[11px] flex items-center justify-between">
                  <span>Görünür Sütunlar</span>
                  <button 
                    type="button"
                    onClick={() => setIsColumnDropdownOpen(false)}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
                <div className="max-h-60 overflow-y-auto p-1 space-y-0.5">
                  {ALL_COLUMN_DEFINITIONS.map(c => {
                    const isChecked = visibleColIds.includes(c.id);
                    const isRequired = c.id === 'code' || c.id === 'name';
                    return (
                      <label 
                        key={c.id} 
                        className={`flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-100 dark:bg-slate-800 cursor-pointer ${
                          isRequired ? 'opacity-60 cursor-not-allowed' : ''
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={isRequired}
                          onChange={() => toggleColumnVisibility(c.id)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className={`text-[11px] ${isChecked ? 'font-semibold text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'}`}>
                          {c.label} {c.isBalance && <span className="text-[9px] text-blue-600 font-bold">(Bakiye)</span>}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Balance Status Indicator */}
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 font-mono text-[11px]">
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

        {/* Right Toolbar Tools: Search, Filter, Export */}
        <div className="flex items-center gap-1.5">
          {/* Quick Search input */}
          <div className="relative">
            <input
              type="text"
              placeholder="Hesap kodu veya adı ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-44 sm:w-56 pl-6 pr-6 py-0.5 bg-white dark:bg-slate-900 border border-slate-300 rounded text-xs text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-1 focus:ring-blue-500 placeholder-slate-400"
            />
            <Search className="w-3 h-3 text-slate-400 absolute left-2 top-1.5" />
            {searchTerm && (
              <button 
                type="button"
                onClick={() => setSearchTerm('')} 
                className="absolute right-1.5 top-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Account Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="py-0.5 px-1.5 bg-white dark:bg-slate-900 border border-slate-300 rounded text-xs text-slate-700 dark:text-slate-200 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
          >
            <option value="all">Tüm Tipler</option>
            <option value="asset">1-2: Aktif</option>
            <option value="liability">3-4: Pasif</option>
            <option value="equity">5: Özkaynak</option>
            <option value="revenue">6: Gelir</option>
            <option value="cost">7: Maliyet</option>
          </select>

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

      {/* 4. CLASSIC ERP DATA GRID TABLE WITH RESIZABLE COLUMNS */}
      <div className="bg-white dark:bg-slate-900 overflow-hidden">
        <div className="overflow-x-auto max-h-[calc(100vh-295px)] custom-scrollbar">
          <table className="w-full text-left border-collapse border-spacing-0 select-text table-fixed">
            
            {/* Table Column Width Definitions */}
            <colgroup>
              {/* Left Indicator Column (28px) */}
              <col style={{ width: '28px' }} />
              {activeColumns.map(col => (
                <col 
                  key={col.id} 
                  style={{ width: `${colWidths[col.id] || col.defaultWidth}px` }} 
                />
              ))}
            </colgroup>

            {/* Desktop ERP Grid Headers */}
            <thead className="sticky top-0 z-10 bg-gradient-to-b from-slate-100 to-slate-200 text-slate-800 dark:text-slate-200 text-[11px] font-bold tracking-tight border-b border-slate-300 shadow-2xs">
              <tr className="h-6">
                
                {/* Leftmost row pointer header column with '*' */}
                <th className="w-7 p-0 text-center font-mono text-[11px] text-slate-500 dark:text-slate-400 bg-slate-200/90 border-r border-slate-300 select-none">
                  *
                </th>

                {/* Dynamic Resizable Column Headers */}
                {activeColumns.map(col => {
                  const width = colWidths[col.id] || col.defaultWidth;
                  return (
                    <th 
                      key={col.id}
                      className={`relative py-1 px-2 border-r border-slate-300 uppercase tracking-tight select-none ${
                        col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right pr-3' : 'text-left'
                      } ${col.isBalance ? 'bg-slate-200/60 font-black' : ''}`}
                      style={{ width: `${width}px` }}
                    >
                      <div className="truncate pr-2">
                        {col.label}
                      </div>

                      {/* RESIZER DRAG HANDLE */}
                      <div
                        onMouseDown={(e) => handleMouseDownResize(e, col.id)}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          setColWidths(prev => {
                            const next = { ...prev, [col.id]: col.defaultWidth };
                            saveWidths(next);
                            return next;
                          });
                        }}
                        className="absolute top-0 right-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-500/40 active:bg-blue-600 transition-colors z-20 flex items-center justify-center group"
                        title={`${col.label} genişliğini ayarla (Çift tık: Varsayılana dön)`}
                      >
                        <div className="w-[1px] h-full bg-slate-300 group-hover:bg-blue-500 group-hover:w-[2px]" />
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>

            {/* ERP Grid Data Rows */}
            <tbody className="divide-y divide-slate-200 text-xs font-normal">
              {visibleAccounts.length === 0 ? (
                <tr>
                  <td colSpan={activeColumns.length + 1} className="py-12 text-center text-slate-400 bg-slate-50 dark:bg-slate-800/50">
                    <Layers className="w-8 h-8 mx-auto mb-2 opacity-40 text-slate-400" />
                    <p className="font-semibold text-xs text-slate-600">Görüntülenecek hesap kaydı bulunamadı.</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Arama filtresini veya 'Sadece Bakiyesi Olanlar' seçeneğini kontrol edin.</p>
                  </td>
                </tr>
              ) : (
                visibleAccounts.map((acc) => {
                  const hasChildren = allParentCodes.has(acc.code);
                  const isExpanded = expandedNodes.has(acc.code);
                  const isSelected = selectedAccountCode === acc.code;

                  const isLevel1 = acc.level === 1;
                  const isLevel2 = acc.level === 2;
                  const isLevel3 = acc.level === 3;
                  const isLevel4 = acc.level === 4;
                  const isLevel5 = acc.level >= 5;

                  const indentPx = (acc.level - 1) * 14;

                  // Get rolled-up balances for this account
                  const bal = balancesMap.get(acc.code) || {
                    totalDebit: 0,
                    totalCredit: 0,
                    debitBalance: 0,
                    creditBalance: 0,
                    hasActivity: false
                  };

                  return (
                    <tr
                      key={`acc-row-${acc.code}`}
                      onClick={() => setSelectedAccountCode(acc.code)}
                      onDoubleClick={() => onEditAccount(acc)}
                      className={`group transition-colors h-6.5 leading-none cursor-pointer ${
                        isSelected 
                          ? 'bg-blue-100/90 text-slate-950 font-medium' 
                          : isLevel1 
                          ? 'bg-slate-100 dark:bg-slate-800/95 font-black text-slate-950 border-t-2 border-slate-300 hover:bg-slate-200/70' 
                          : isLevel2 
                          ? 'bg-slate-50 dark:bg-slate-800/50 font-bold text-slate-900 dark:text-slate-100 border-t border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:bg-slate-800/80' 
                          : isLevel3 
                          ? 'font-bold text-slate-900 dark:text-slate-100 hover:bg-blue-50/50' 
                          : 'text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:bg-slate-800/50'
                      }`}
                    >
                      {/* Leftmost Row Indicator Gutter: '>' when selected */}
                      <td className="w-7 text-center font-bold text-[11px] bg-slate-100 dark:bg-slate-800/80 border-r border-slate-300 select-none text-blue-700">
                        {isSelected ? '▶' : ''}
                      </td>

                      {/* Render active columns */}
                      {activeColumns.map(col => {
                        if (col.id === 'code') {
                          return (
                            <td key={col.id} className="py-0.5 px-2 border-r border-slate-200 dark:border-slate-700 font-mono whitespace-nowrap overflow-hidden">
                              <div 
                                className="flex items-center gap-1.5"
                                style={{ paddingLeft: `${indentPx}px` }}
                              >
                                {hasChildren ? (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleNode(acc.code);
                                    }}
                                    className="w-3.5 h-3.5 rounded-xs border flex items-center justify-center transition-all bg-white dark:bg-slate-900 border-slate-300 hover:border-blue-500 hover:bg-blue-50 text-slate-700 dark:text-slate-200 shrink-0 cursor-pointer shadow-2xs"
                                    title={isExpanded ? 'Düğümü Kapat' : 'Düğümü Aç'}
                                  >
                                    {isExpanded ? (
                                      <span className="font-mono text-[10px] leading-none font-black text-slate-800 dark:text-slate-200">−</span>
                                    ) : (
                                      <span className="font-mono text-[10px] leading-none font-black text-slate-800 dark:text-slate-200">+</span>
                                    )}
                                  </button>
                                ) : (
                                  <span className="w-3.5 h-3.5 flex items-center justify-center shrink-0 opacity-40 text-slate-400 font-mono text-[9px]">
                                    {isLevel4 || isLevel5 ? '└' : '•'}
                                  </span>
                                )}

                                <span className={`tracking-tight truncate ${
                                  isLevel1 ? 'font-black text-slate-950 text-xs' :
                                  isLevel2 ? 'font-bold text-slate-900 dark:text-slate-100 text-xs' :
                                  isLevel3 ? 'font-bold text-blue-950 text-xs' :
                                  'font-semibold text-slate-800 dark:text-slate-200 text-[11px]'
                                }`}>
                                  {acc.code}
                                </span>
                              </div>
                            </td>
                          );
                        }

                        if (col.id === 'name') {
                          return (
                            <td key={col.id} className="py-0.5 px-2 border-r border-slate-200 dark:border-slate-700 overflow-hidden">
                              <div className="flex items-center justify-between gap-1">
                                <span className={`truncate ${
                                  isLevel1 ? 'font-black text-slate-950 uppercase' :
                                  isLevel2 ? 'font-bold text-slate-900 dark:text-slate-100 uppercase' :
                                  isLevel3 ? 'font-bold text-slate-900 dark:text-slate-100' :
                                  'font-normal text-slate-800 dark:text-slate-200'
                                }`}>
                                  {acc.name}
                                </span>

                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onEditAccount(acc);
                                    }}
                                    className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-blue-700 hover:bg-blue-50 rounded transition-all shrink-0 cursor-pointer"
                                    title="Hesap adını düzenle"
                                  >
                                    <Edit3 className="w-3 h-3" />
                                  </button>
                                  {onDeleteAccount && !acc.isSystem && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onDeleteAccount(acc);
                                      }}
                                      className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-rose-700 hover:bg-rose-50 rounded transition-all shrink-0 cursor-pointer"
                                      title="Hesabı sil"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            </td>
                          );
                        }

                        // BORÇ
                        if (col.id === 'debit') {
                          const isZero = bal.totalDebit === 0;
                          return (
                            <td 
                              key={col.id} 
                              className={`py-0.5 px-2 border-r border-slate-200 dark:border-slate-700 text-right pr-3 font-mono whitespace-nowrap overflow-hidden ${
                                isZero 
                                  ? 'text-slate-400' 
                                  : isLevel1 || isLevel2 || isLevel3 
                                  ? 'font-bold text-slate-950' 
                                  : 'text-slate-900 dark:text-slate-100'
                              }`}
                            >
                              {formatAmount(bal.totalDebit)}
                            </td>
                          );
                        }

                        // ALACAK
                        if (col.id === 'credit') {
                          const isZero = bal.totalCredit === 0;
                          return (
                            <td 
                              key={col.id} 
                              className={`py-0.5 px-2 border-r border-slate-200 dark:border-slate-700 text-right pr-3 font-mono whitespace-nowrap overflow-hidden ${
                                isZero 
                                  ? 'text-slate-400' 
                                  : isLevel1 || isLevel2 || isLevel3 
                                  ? 'font-bold text-slate-950' 
                                  : 'text-slate-900 dark:text-slate-100'
                              }`}
                            >
                              {formatAmount(bal.totalCredit)}
                            </td>
                          );
                        }

                        // BORÇ BAKİYE
                        if (col.id === 'debitBalance') {
                          const isZero = bal.debitBalance === 0;
                          return (
                            <td 
                              key={col.id} 
                              className={`py-0.5 px-2 border-r border-slate-200 dark:border-slate-700 text-right pr-3 font-mono whitespace-nowrap overflow-hidden ${
                                isZero 
                                  ? 'text-slate-400' 
                                  : isLevel1 || isLevel2 || isLevel3 
                                  ? 'font-bold text-blue-950 bg-blue-50/40' 
                                  : 'font-semibold text-blue-900'
                              }`}
                            >
                              {formatAmount(bal.debitBalance)}
                            </td>
                          );
                        }

                        // ALACAK BAKİYE
                        if (col.id === 'creditBalance') {
                          const isZero = bal.creditBalance === 0;
                          return (
                            <td 
                              key={col.id} 
                              className={`py-0.5 px-2 border-r border-slate-200 dark:border-slate-700 text-right pr-3 font-mono whitespace-nowrap overflow-hidden ${
                                isZero 
                                  ? 'text-slate-400' 
                                  : isLevel1 || isLevel2 || isLevel3 
                                  ? 'font-bold text-amber-950 bg-amber-50/40' 
                                  : 'font-semibold text-amber-900'
                              }`}
                            >
                              {formatAmount(bal.creditBalance)}
                            </td>
                          );
                        }

                        // HESAP GRUBU
                        if (col.id === 'group') {
                          return (
                            <td key={col.id} className="py-0.5 px-2 border-r border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-medium overflow-hidden truncate whitespace-nowrap">
                              {getAccountGroup(acc)}
                            </td>
                          );
                        }

                        // ANA GRUP
                        if (col.id === 'mainGroup') {
                          return (
                            <td key={col.id} className="py-0.5 px-2 border-r border-slate-200 dark:border-slate-700 text-slate-600 font-medium overflow-hidden truncate whitespace-nowrap">
                              {getMainGroup(acc)}
                            </td>
                          );
                        }

                        // SEVİYE
                        if (col.id === 'level') {
                          return (
                            <td key={col.id} className="py-0.5 px-2 border-r border-slate-200 dark:border-slate-700 text-center font-mono text-[10px] whitespace-nowrap overflow-hidden">
                              <span className={`inline-block px-1 py-0.2 rounded-xs ${
                                isLevel1 ? 'bg-slate-200 text-slate-800 dark:text-slate-200 font-bold' :
                                isLevel2 ? 'bg-sky-100 text-sky-900 font-semibold' :
                                isLevel3 ? 'bg-emerald-100 text-emerald-900 font-semibold' :
                                isLevel4 ? 'bg-indigo-100 text-indigo-900 font-medium' :
                                'bg-amber-100 text-amber-900 font-medium'
                              }`}>
                                {isLevel1 ? '1: Sınıf' : 
                                 isLevel2 ? '2: Grup' : 
                                 isLevel3 ? '3: Ana' : 
                                 isLevel4 ? '4: Alt' : 
                                 '5: Muavin'}
                              </span>
                            </td>
                          );
                        }

                        // PARA BİRİMİ
                        if (col.id === 'currency') {
                          return (
                            <td key={col.id} className="py-0.5 px-2 border-r border-slate-200 dark:border-slate-700 text-center font-mono text-[11px] text-slate-700 dark:text-slate-200 overflow-hidden">
                              {acc.currency || 'TRY'}
                            </td>
                          );
                        }

                        // İŞLEMLER
                        if (col.id === 'actions') {
                          return (
                            <td key={col.id} className="py-0.5 px-2 text-right pr-2 whitespace-nowrap overflow-hidden">
                              <div className="inline-flex items-center justify-end gap-1">
                                {(isLevel3 || isLevel4) && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onAddAccount(acc.code);
                                    }}
                                    className="px-1 py-0.2 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100 rounded-xs border border-emerald-300/60 transition-colors"
                                    title={`${acc.code} altına yeni alt hesap aç`}
                                  >
                                    +Alt
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onEditAccount(acc);
                                  }}
                                  className="px-1 py-0.2 text-[10px] font-semibold text-slate-700 dark:text-slate-200 hover:text-blue-700 hover:bg-blue-50 rounded-xs border border-slate-300 transition-colors cursor-pointer"
                                  title="Hesap adını ve niteliklerini düzenle"
                                >
                                  Düzenle
                                </button>

                                {onDeleteAccount && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onDeleteAccount(acc);
                                    }}
                                    className="px-1 py-0.2 text-[10px] font-semibold text-rose-700 dark:text-rose-400 hover:text-rose-900 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xs border border-rose-200 dark:border-rose-800 transition-colors inline-flex items-center gap-0.5 cursor-pointer"
                                    title="Bu hesabı sil"
                                  >
                                    <Trash2 className="w-2.5 h-2.5" />
                                    <span>Sil</span>
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onOpenKebir(acc.code);
                                  }}
                                  className="px-1 py-0.2 text-[10px] font-semibold text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 rounded-xs border border-blue-200 transition-colors inline-flex items-center gap-0.5"
                                  title="Defter-i Kebir muavin hareketlerini aç"
                                >
                                  <span>Kebir</span>
                                  <ArrowRight className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            </td>
                          );
                        }

                        return null;
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* 5. STICKY SUMMARY / TOTALS FOOTER ROW (GENEL TOPLAM) */}
            <tfoot className="sticky bottom-0 z-10 bg-gradient-to-b from-slate-200 to-slate-300 text-slate-900 dark:text-slate-100 text-xs font-black border-t-2 border-slate-400 shadow-md">
              <tr className="h-7 leading-none">
                <td className="w-7 text-center font-bold bg-slate-300/90 border-r border-slate-400 select-none">
                  ∑
                </td>

                {activeColumns.map(col => {
                  if (col.id === 'code') {
                    return (
                      <td key={col.id} className="py-1 px-2 border-r border-slate-400 font-bold uppercase tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        GENEL TOPLAM
                      </td>
                    );
                  }
                  if (col.id === 'name') {
                    return (
                      <td key={col.id} className="py-1 px-2 border-r border-slate-400 text-slate-700 dark:text-slate-200 font-semibold text-[11px] truncate">
                        Konsolide TDHP Mizan Toplamları
                      </td>
                    );
                  }
                  if (col.id === 'debit') {
                    return (
                      <td key={col.id} className="py-1 px-2 border-r border-slate-400 text-right pr-3 font-mono font-black text-slate-950 whitespace-nowrap">
                        {formatAmount(grandTotals.totalDebit)}
                      </td>
                    );
                  }
                  if (col.id === 'credit') {
                    return (
                      <td key={col.id} className="py-1 px-2 border-r border-slate-400 text-right pr-3 font-mono font-black text-slate-950 whitespace-nowrap">
                        {formatAmount(grandTotals.totalCredit)}
                      </td>
                    );
                  }
                  if (col.id === 'debitBalance') {
                    return (
                      <td key={col.id} className="py-1 px-2 border-r border-slate-400 text-right pr-3 font-mono font-black text-blue-950 bg-blue-100/50 whitespace-nowrap">
                        {formatAmount(grandTotals.totalDebitBal)}
                      </td>
                    );
                  }
                  if (col.id === 'creditBalance') {
                    return (
                      <td key={col.id} className="py-1 px-2 border-r border-slate-400 text-right pr-3 font-mono font-black text-amber-950 bg-amber-100/50 whitespace-nowrap">
                        {formatAmount(grandTotals.totalCreditBal)}
                      </td>
                    );
                  }
                  return (
                    <td key={col.id} className="py-1 px-2 border-r border-slate-400 text-slate-500 dark:text-slate-400 text-center">
                      -
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>

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
