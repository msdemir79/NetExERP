import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useApiQuery } from '../hooks/useApiQuery';
import type { Contact, EntityType } from '../types';
import PageHeader from './PageHeader';
import DataGrid, { GridColumn, StatusPill } from './Common/DataGrid';
import {
  Users,
  UserPlus,
  Phone,
  Mail,
  MapPin,
  Search,
  Filter,
  ArrowUpRight,
  ArrowDownLeft,
  Building2,
  CreditCard,
  FileText,
  ShoppingBag,
  Edit,
  Trash2,
  Printer,
  Download,
  LayoutGrid,
  Table as TableIcon,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Clock,
  ShieldAlert,
  Percent,
  CheckCircle2,
  ChevronRight,
  Receipt,
  DollarSign
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import Modal from './Modal';
import { contactService } from '../services/contactService';
import ContactStatementModal from './Contacts/ContactStatementModal';
import ContactFormModal from './Contacts/ContactFormModal';
import QuickPaymentModal from './Contacts/QuickPaymentModal';
import ContactBalanceReportModal from './Contacts/ContactBalanceReportModal';

type FilterType = 'all' | 'customer' | 'supplier' | 'both' | 'receivables' | 'payables' | 'zero' | 'risk_exceeded';
type ViewMode = 'table' | 'grid';
type SortOption = 'code_asc' | 'code_desc' | 'name_asc' | 'name_desc' | 'type_asc' | 'type_desc' | 'balance_desc' | 'balance_asc' | 'recent';

export default function Contacts() {
  const navigate = useNavigate();
  const contacts = useApiQuery(() => api.contacts.list(), [], ['contacts']);

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [selectedCity, setSelectedCity] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [sortOption, setSortOption] = useState<SortOption>('code_asc');
  const [viewMode, setViewMode] = useState<ViewMode>('table');

  // Modals state
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  
  const [isStatementModalOpen, setIsStatementModalOpen] = useState(false);
  const [selectedContactForStatement, setSelectedContactForStatement] = useState<Contact | null>(null);

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedContactForPayment, setSelectedContactForPayment] = useState<Contact | null>(null);
  const [paymentDefaultType, setPaymentDefaultType] = useState<'income' | 'expense'>('income');

  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [deleteConfirmContact, setDeleteConfirmContact] = useState<Contact | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Financial Metrics Calculation
  const metrics = useMemo(() => {
    if (!contacts) return { total: 0, customers: 0, suppliers: 0, receivables: 0, payables: 0, net: 0, riskExceededCount: 0 };
    
    let customers = 0;
    let suppliers = 0;
    let receivables = 0;
    let payables = 0;
    let riskExceededCount = 0;

    for (const c of contacts) {
      if (c.type === 'customer' || c.type === 'both') customers++;
      if (c.type === 'supplier' || c.type === 'both') suppliers++;

      if (c.balance > 0) {
        receivables += c.balance;
      } else if (c.balance < 0) {
        payables += Math.abs(c.balance);
      }

      if (c.creditLimit && c.balance > c.creditLimit) {
        riskExceededCount++;
      }
    }

    return {
      total: contacts.length,
      customers,
      suppliers,
      receivables,
      payables,
      net: receivables - payables,
      riskExceededCount
    };
  }, [contacts]);

  // Unique categories and cities for dropdowns
  const availableCategories = useMemo(() => {
    if (!contacts) return [];
    const set = new Set<string>();
    contacts.forEach(c => { if (c.category) set.add(c.category); });
    return Array.from(set).sort();
  }, [contacts]);

  const availableCities = useMemo(() => {
    if (!contacts) return [];
    const set = new Set<string>();
    contacts.forEach(c => { if (c.city) set.add(c.city); });
    return Array.from(set).sort();
  }, [contacts]);

  // Filtered and Sorted Contacts
  const filteredContacts = useMemo(() => {
    if (!contacts) return [];

    return contacts.filter(c => {
      // Search term
      if (searchTerm) {
        const query = searchTerm.toLowerCase();
        const matchName = c.name.toLowerCase().includes(query);
        const matchTitle = c.companyTitle?.toLowerCase().includes(query);
        const matchCode = c.code?.toLowerCase().includes(query);
        const matchPerson = c.contactPerson?.toLowerCase().includes(query);
        const matchPhone = c.phone?.toLowerCase().includes(query) || c.mobile?.toLowerCase().includes(query);
        const matchTax = c.taxNumber?.toLowerCase().includes(query) || c.tcKimlik?.toLowerCase().includes(query);
        const matchCity = c.city?.toLowerCase().includes(query);
        if (!matchName && !matchTitle && !matchCode && !matchPerson && !matchPhone && !matchTax && !matchCity) {
          return false;
        }
      }

      // Filter Type
      if (filterType === 'customer' && c.type !== 'customer' && c.type !== 'both') return false;
      if (filterType === 'supplier' && c.type !== 'supplier' && c.type !== 'both') return false;
      if (filterType === 'both' && c.type !== 'both') return false;
      if (filterType === 'receivables' && c.balance <= 0) return false;
      if (filterType === 'payables' && c.balance >= 0) return false;
      if (filterType === 'zero' && c.balance !== 0) return false;
      if (filterType === 'risk_exceeded' && (!c.creditLimit || c.balance <= c.creditLimit)) return false;

      // City filter
      if (selectedCity !== 'all' && c.city !== selectedCity) return false;

      // Category filter
      if (selectedCategory !== 'all' && c.category !== selectedCategory) return false;

      return true;
    }).sort((a, b) => {
      // 1. Cari Kodu (Varsayılan)
      if (sortOption === 'code_asc') {
        const res = (a.code || '').localeCompare(b.code || '', 'tr', { numeric: true, sensitivity: 'base' });
        return res !== 0 ? res : a.name.localeCompare(b.name, 'tr');
      }
      if (sortOption === 'code_desc') {
        const res = (b.code || '').localeCompare(a.code || '', 'tr', { numeric: true, sensitivity: 'base' });
        return res !== 0 ? res : b.name.localeCompare(a.name, 'tr');
      }

      // 2. Cari / Firma Ünvanı
      if (sortOption === 'name_asc') return a.name.localeCompare(b.name, 'tr', { sensitivity: 'base' });
      if (sortOption === 'name_desc') return b.name.localeCompare(a.name, 'tr', { sensitivity: 'base' });

      // 3. Cari Türü (Müşteri <-> Tedarikçi)
      if (sortOption === 'type_asc') {
        const typePriority: Record<string, number> = { customer: 1, both: 2, supplier: 3 };
        const diff = (typePriority[a.type] || 99) - (typePriority[b.type] || 99);
        return diff !== 0 ? diff : (a.code || '').localeCompare(b.code || '', 'tr', { numeric: true });
      }
      if (sortOption === 'type_desc') {
        const typePriority: Record<string, number> = { supplier: 1, both: 2, customer: 3 };
        const diff = (typePriority[a.type] || 99) - (typePriority[b.type] || 99);
        return diff !== 0 ? diff : (a.code || '').localeCompare(b.code || '', 'tr', { numeric: true });
      }

      // 4. Cari Bakiye
      if (sortOption === 'balance_desc') return b.balance - a.balance;
      if (sortOption === 'balance_asc') return a.balance - b.balance;

      // 5. En Son Eklenenler
      if (sortOption === 'recent') return (b.id || 0) - (a.id || 0);

      return (a.code || '').localeCompare(b.code || '', 'tr', { numeric: true, sensitivity: 'base' });
    });
  }, [contacts, searchTerm, filterType, selectedCity, selectedCategory, sortOption]);

  // Handlers
  const handleOpenAddModal = () => {
    setEditingContact(null);
    setIsFormModalOpen(true);
  };

  const handleOpenEditModal = (contact: Contact) => {
    setEditingContact(contact);
    setIsFormModalOpen(true);
  };

  const handleSaveContact = async (data: Partial<Contact>) => {
    if (editingContact?.id) {
      await contactService.updateContact(editingContact.id, data);
    } else {
      await contactService.addContact(data as any);
    }
  };

  const handleOpenStatement = (contact: Contact) => {
    setSelectedContactForStatement(contact);
    setIsStatementModalOpen(true);
  };

  const handleOpenPayment = (contact: Contact, type: 'income' | 'expense' = 'income') => {
    setSelectedContactForPayment(contact);
    setPaymentDefaultType(type);
    setIsPaymentModalOpen(true);
  };

  const handleDeleteContact = async () => {
    if (!deleteConfirmContact?.id) return;
    setActionError(null);
    try {
      await contactService.deleteContact(deleteConfirmContact.id);
      setDeleteConfirmContact(null);
    } catch (err: any) {
      setActionError(err.message || 'Cari silinirken bir hata meydana geldi.');
    }
  };

  const handleExportCSV = () => {
    const headers = ['Cari Kodu', 'Firma Ünvanı', 'Cari Türü', 'Yetkili', 'Telefon', 'Şehir', 'Vergi No', 'Vade', 'Risk Limiti', 'Bakiye'];
    const rows = filteredContacts.map(c => [
      `"${c.code || c.id}"`,
      `"${c.name.replace(/"/g, '""')}"`,
      `"${c.type}"`,
      `"${c.contactPerson || ''}"`,
      `"${c.phone || c.mobile || ''}"`,
      `"${c.city || ''}"`,
      `"${c.taxNumber || ''}"`,
      `"${c.paymentTermDays || ''}"`,
      `"${c.creditLimit || ''}"`,
      c.balance.toFixed(2)
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `Cari_Hesaplar_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const contactColumns = useMemo<GridColumn<Contact>[]>(() => [
    {
      key: 'code', title: 'Kod', width: 'w-28',
      render: (c) => (
        <span className="font-mono font-bold text-indigo-600 whitespace-nowrap">
          {c.code || `CAR-${c.id?.toString().padStart(4, '0')}`}
        </span>
      ),
      filterValue: (c) => c.code || '',
    },
    {
      key: 'name', title: 'Cari / Firma Ünvanı',
      render: (c) => (
        <div className="max-w-xs">
          <div
            onClick={() => handleOpenStatement(c)}
            className="font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight hover:text-indigo-600 cursor-pointer transition-colors"
          >
            {c.name}
          </div>
          {c.discountRate && c.discountRate > 0 && (
            <div className="flex flex-wrap items-center gap-2 mt-0.5">
              <span className="text-[10px] bg-amber-50 text-amber-800 px-1.5 py-0.2 rounded font-bold">
                %{c.discountRate} İskonto
              </span>
            </div>
          )}
        </div>
      ),
      filterValue: (c) => `${c.name} ${c.accountCode || ''} ${c.category || ''}`,
    },
    {
      key: 'type', title: 'Tür', width: 'w-36',
      render: (c) => {
        if (c.type === 'customer') return <StatusPill tone="blue">Müşteri</StatusPill>;
        if (c.type === 'supplier') return <StatusPill tone="amber">Tedarikçi</StatusPill>;
        return <StatusPill tone="green">Müşteri + Tedarikçi</StatusPill>;
      },
      filterValue: (c) => c.type === 'customer' ? 'Müşteri' : c.type === 'supplier' ? 'Tedarikçi' : 'Müşteri Tedarikçi',
    },
    {
      key: 'contactPerson', title: 'Yetkili & İletişim',
      render: (c) => (
        <div>
          {c.contactPerson ? (
            <div className="font-bold text-slate-800 dark:text-slate-200">{c.contactPerson}</div>
          ) : (
            <div className="text-slate-400 font-medium">-</div>
          )}
          <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
            {c.phone || c.mobile || c.email || '-'}
          </div>
        </div>
      ),
      filterValue: (c) => `${c.contactPerson || ''} ${c.phone || ''} ${c.mobile || ''} ${c.email || ''}`,
    },
    {
      key: 'city', title: 'Şehir / VKN',
      render: (c) => (
        <div>
          <div className="font-semibold text-slate-800 dark:text-slate-200">
            {c.city ? `${c.city}${c.district ? ` / ${c.district}` : ''}` : '-'}
          </div>
          {c.taxNumber && (
            <div className="text-[10px] font-mono text-slate-400">
              VKN: {c.taxNumber}
            </div>
          )}
        </div>
      ),
      filterValue: (c) => `${c.city || ''} ${c.taxNumber || ''}`,
    },
    {
      key: 'paymentTermDays', title: 'Vade', align: 'right', width: 'w-24',
      render: (c) => (
        <span className="font-mono font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap">
          {c.paymentTermDays ? `${c.paymentTermDays} Gün` : 'Peşin'}
        </span>
      ),
    },
    {
      key: 'balance', title: 'Cari Bakiye (₺)', align: 'right',
      render: (c) => {
        const isRiskExceeded = c.creditLimit && c.balance > c.creditLimit;
        return (
          <div className="text-right whitespace-nowrap">
            <div className={`font-mono font-black text-sm ${c.balance > 0 ? 'text-emerald-700' : c.balance < 0 ? 'text-rose-700' : 'text-slate-500 dark:text-slate-400'}`}>
              ₺{Math.abs(c.balance).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              <span className="text-[10px] ml-1 opacity-75">
                {c.balance > 0 ? '(A)' : c.balance < 0 ? '(B)' : ''}
              </span>
            </div>
            {isRiskExceeded && (
              <div className="text-[9px] font-bold text-rose-600 flex items-center justify-end gap-1 mt-0.5">
                <AlertTriangle className="w-2.5 h-2.5" /> Risk Aşıldı
              </div>
            )}
          </div>
        );
      },
      filterValue: (c) => `${c.balance || 0}`,
    },
  ], []);

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header & Fast Actions */}
      <PageHeader
        title="Cari Hesaplar & Finansal Yönetim"
        subtitle="Müşteri ve tedarikçi kartları, borç/alacak bakiyeleri, ekstreler ve risk analizleri"
        badge={`${metrics.total} Cari Kart`}
        icon={Users}
        iconColor="indigo"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setIsReportModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold transition-colors shadow-xs cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              <span>Bakiye Raporu</span>
            </button>

            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold transition-colors shadow-xs cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              <span>Excel / CSV</span>
            </button>

            <button
              onClick={handleOpenAddModal}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-xs cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Yeni Cari Kaydı</span>
            </button>
          </div>
        }
      />

      {/* Financial KPI Summary Ribbon */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Total Contacts */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">
            <span>Toplam Cari Kartı</span>
            <Users className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-3xl font-black font-mono text-slate-900 dark:text-slate-100">
            {metrics.total}
          </div>
          <div className="flex items-center gap-2 mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span className="text-indigo-600 font-bold">{metrics.customers} Müşteri</span>
            <span>•</span>
            <span className="text-amber-600 font-bold">{metrics.suppliers} Tedarikçi</span>
          </div>
        </div>

        {/* Metric 2: Total Receivables (Piyasadan Alacak) */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">
            <span>Piyasadan Alacaklarımız</span>
            <ArrowDownLeft className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-3xl font-black font-mono text-emerald-600">
            ₺{metrics.receivables.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="mt-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            Müşteri borç bakiyeleri toplamı
          </div>
        </div>

        {/* Metric 3: Total Payables (Piyasaya Borç) */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">
            <span>Piyasaya Borçlarımız</span>
            <ArrowUpRight className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-3xl font-black font-mono text-rose-600">
            ₺{metrics.payables.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="mt-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            Tedarikçi alacak bakiyeleri toplamı
          </div>
        </div>

        {/* Metric 4: Net Financial Position & Risk */}
        <div className={cn(
          "p-5 rounded-2xl border shadow-sm relative overflow-hidden",
          metrics.net >= 0 ? "bg-indigo-900 text-white border-indigo-950" : "bg-slate-900 text-white border-slate-950"
        )}>
          <div className="flex items-center justify-between text-indigo-200 text-xs font-bold uppercase tracking-widest mb-1">
            <span>Net Cari Pozisyonu</span>
            {metrics.net >= 0 ? <TrendingUp className="w-4 h-4 text-emerald-400" /> : <TrendingDown className="w-4 h-4 text-rose-400" />}
          </div>
          <div className="text-3xl font-black font-mono text-white">
            ₺{Math.abs(metrics.net).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="flex items-center justify-between mt-2 text-xs font-semibold text-indigo-200">
            <span>{metrics.net >= 0 ? 'Net Alacaklı Durumda' : 'Net Borçlu Durumda'}</span>
            {metrics.riskExceededCount > 0 && (
              <span className="bg-rose-500/30 text-rose-300 px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {metrics.riskExceededCount} Risk Aşımı
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main Control Panel & Filter Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
        {/* Search & Quick Controls */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari Ünvanı, Kod, Yetkili, Telefon, Vergi No veya Şehir ile arayın..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold focus:bg-white dark:bg-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-400"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-slate-600 font-bold"
              >
                Temizle
              </button>
            )}
          </div>

          {/* City, Category & Sort Dropdowns */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
              className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500/20 shadow-sm"
            >
              <option value="all">Tüm Şehirler</option>
              {availableCities.map(city => (
                <option key={city} value={city}>{city}</option>
              ))}
            </select>

            {availableCategories.length > 0 && (
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500/20 shadow-sm"
              >
                <option value="all">Tüm Gruplar</option>
                {availableCategories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            )}

            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as SortOption)}
              className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500/20 shadow-sm cursor-pointer"
            >
              <option value="code_asc">Cari Kodu (A - Z / Artan) [Varsayılan]</option>
              <option value="code_desc">Cari Kodu (Z - A / Azalan)</option>
              <option value="name_asc">Cari / Firma Ünvanı (A - Z)</option>
              <option value="name_desc">Cari / Firma Ünvanı (Z - A)</option>
              <option value="type_asc">Cari Türü (Müşteri &gt; Tedarikçi)</option>
              <option value="type_desc">Cari Türü (Tedarikçi &gt; Müşteri)</option>
              <option value="balance_desc">Bakiye (En Yüksek Alacak)</option>
              <option value="balance_asc">Bakiye (En Yüksek Borç)</option>
              <option value="recent">En Son Eklenenler</option>
            </select>

            {/* View Mode Toggle */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setViewMode('table')}
                title="Tablo Görünümü"
                className={cn(
                  "p-1.5 rounded-lg text-xs font-bold transition-all",
                  viewMode === 'table' ? "bg-white dark:bg-slate-900 text-indigo-600 shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200"
                )}
              >
                <TableIcon className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('grid')}
                title="Kart Görünümü"
                className={cn(
                  "p-1.5 rounded-lg text-xs font-bold transition-all",
                  viewMode === 'grid' ? "bg-white dark:bg-slate-900 text-indigo-600 shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200"
                )}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
          {[
            { id: 'all', label: 'Tüm Cariler', count: contacts?.length },
            { id: 'customer', label: 'Müşteriler (Alıcılar)', count: metrics.customers },
            { id: 'supplier', label: 'Tedarikçiler (Satıcılar)', count: metrics.suppliers },
            { id: 'receivables', label: 'Alacağımız Olanlar', count: contacts?.filter(c => c.balance > 0).length, color: 'text-emerald-700' },
            { id: 'payables', label: 'Borcumuz Olanlar', count: contacts?.filter(c => c.balance < 0).length, color: 'text-rose-700' },
            { id: 'zero', label: 'Sıfır Bakiye', count: contacts?.filter(c => c.balance === 0).length },
            { id: 'risk_exceeded', label: 'Risk Limiti Aşanlar', count: metrics.riskExceededCount, highlight: true }
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setFilterType(item.id as FilterType)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5",
                filterType === item.id
                  ? "bg-slate-900 text-white shadow-sm"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 hover:bg-slate-200"
              )}
            >
              <span>{item.label}</span>
              <span className={cn(
                "px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold",
                filterType === item.id ? "bg-white dark:bg-slate-900/20 text-white" : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 shadow-2xs"
              )}>
                {item.count || 0}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Content Area: Table View or Grid View */}
      {filteredContacts.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 p-12 text-center rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-3">
          <Users className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">Filtreleme kriterlerine uygun cari hesap bulunamadı</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Arama terimini değiştirebilir, filtreleri sıfırlayabilir veya sağ üstteki butonla yeni bir cari hesap kartı ekleyebilirsiniz.
          </p>
          <button
            onClick={() => { setSearchTerm(''); setFilterType('all'); setSelectedCity('all'); setSelectedCategory('all'); }}
            className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors"
          >
            Filtreleri Temizle
          </button>
        </div>
      ) : viewMode === 'table' ? (
        <DataGrid<Contact>
          columns={contactColumns}
          data={filteredContacts}
          rowKey="id"
          rowActions={(c) => (
            <>
              <button
                onClick={() => handleOpenStatement(c)}
                title="Cari Hesap Ekstresi"
                className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 hover:text-indigo-600 text-slate-700 dark:text-slate-200 rounded-lg transition-colors"
              >
                <FileText className="w-4 h-4" />
              </button>

              <button
                onClick={() => handleOpenPayment(c, c.type === 'supplier' ? 'expense' : 'income')}
                title={c.type === 'supplier' ? 'Ödeme Yap' : 'Tahsilat Al'}
                className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 hover:text-emerald-700 text-slate-700 dark:text-slate-200 rounded-lg transition-colors"
              >
                <DollarSign className="w-4 h-4" />
              </button>

              <button
                onClick={() => handleOpenEditModal(c)}
                title="Cari Kartını Düzenle"
                className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded-lg transition-colors"
              >
                <Edit className="w-4 h-4" />
              </button>

              <button
                onClick={() => setDeleteConfirmContact(c)}
                title="Cari Kartını Sil"
                className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 hover:text-rose-600 text-slate-400 transition-colors rounded-lg"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
        />
      ) : (
        /* GRID VIEW (KART GÖRÜNÜMÜ) */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredContacts.map((c) => {
            const isRiskExceeded = c.creditLimit && c.balance > c.creditLimit;
            return (
              <motion.div
                key={c.id}
                whileHover={{ y: -3 }}
                className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm relative overflow-hidden flex flex-col justify-between group"
              >
                {/* Type ribbon */}
                <div className={cn(
                  "absolute top-0 right-0 px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-bl-xl shadow-xs border-l border-b",
                  c.type === 'customer'
                    ? "bg-indigo-50 text-indigo-700 border-indigo-100"
                    : c.type === 'supplier'
                    ? "bg-amber-50 text-amber-800 border-amber-100"
                    : "bg-emerald-50 text-emerald-800 border-emerald-100"
                )}>
                  {c.type === 'customer' ? 'Müşteri' : c.type === 'supplier' ? 'Tedarikçi' : 'Müşteri+Tedarikçi'}
                </div>

                <div>
                  {/* Top info */}
                  <div className="flex items-start gap-3 mb-4 pr-16">
                    <div className="w-11 h-11 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-center font-black text-indigo-600 text-lg shrink-0">
                      {c.name.substring(0, 1).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-[10px] font-mono font-bold text-slate-400">
                        {c.code || `CAR-${c.id?.toString().padStart(4, '0')}`}
                      </div>
                      <h3 
                        onClick={() => handleOpenStatement(c)}
                        className="font-black text-base text-slate-900 dark:text-slate-100 uppercase tracking-tight leading-snug hover:text-indigo-600 cursor-pointer transition-colors"
                      >
                        {c.name}
                      </h3>
                    </div>
                  </div>

                  {/* Details */}
                  <div className="space-y-2 py-3 border-y border-slate-100 dark:border-slate-800 text-xs">
                    {c.contactPerson && (
                      <div className="flex items-center gap-2 text-slate-600">
                        <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="font-semibold">{c.contactPerson}</span>
                      </div>
                    )}
                    {(c.phone || c.mobile) && (
                      <div className="flex items-center gap-2 text-slate-600 font-mono">
                        <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{c.phone || c.mobile}</span>
                      </div>
                    )}
                    {c.email && (
                      <div className="flex items-center gap-2 text-slate-600 truncate">
                        <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{c.email}</span>
                      </div>
                    )}
                    {c.city && (
                      <div className="flex items-center gap-2 text-slate-600">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{c.city} {c.district ? `/ ${c.district}` : ''}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Bottom Balance & Actions */}
                <div className="pt-4 mt-2">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      {c.balance > 0 ? 'Müşteri Borcu (Alacak)' : c.balance < 0 ? 'Tedarikçi Alacağı (Borç)' : 'Bakiye Durumu'}
                    </div>
                    <div className={cn(
                      "font-mono font-black text-base",
                      c.balance > 0 ? "text-emerald-600" : c.balance < 0 ? "text-rose-600" : "text-slate-600"
                    )}>
                      ₺{Math.abs(c.balance).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => handleOpenStatement(c)}
                      className="flex items-center justify-center gap-1 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-colors"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      Ekstre
                    </button>
                    <button
                      onClick={() => handleOpenPayment(c, c.type === 'supplier' ? 'expense' : 'income')}
                      className="flex items-center justify-center gap-1 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-colors"
                    >
                      <DollarSign className="w-3.5 h-3.5" />
                      {c.type === 'supplier' ? 'Ödeme' : 'Tahsilat'}
                    </button>
                    <button
                      onClick={() => handleOpenEditModal(c)}
                      className="flex items-center justify-center gap-1 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-colors"
                    >
                      <Edit className="w-3.5 h-3.5" />
                      Düzenle
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* MODAL 1: Account Statement (Ekstre) */}
      <ContactStatementModal
        isOpen={isStatementModalOpen}
        onClose={() => setIsStatementModalOpen(false)}
        contact={selectedContactForStatement}
        onQuickPayment={(c, type) => {
          setIsStatementModalOpen(false);
          handleOpenPayment(c, type);
        }}
        onNewOrder={(c) => {
          setIsStatementModalOpen(false);
          navigate('/orders');
        }}
      />

      {/* MODAL 2: Contact Form (Add/Edit) */}
      <ContactFormModal
        isOpen={isFormModalOpen}
        onClose={() => setIsFormModalOpen(false)}
        onSave={handleSaveContact}
        initialData={editingContact}
        defaultType={filterType === 'supplier' ? 'supplier' : filterType === 'both' ? 'both' : 'customer'}
      />

      {/* MODAL 3: Quick Payment & Collection */}
      <QuickPaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        contact={selectedContactForPayment}
        defaultType={paymentDefaultType}
      />

      {/* MODAL 4: General Balance Report */}
      <ContactBalanceReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        contacts={contacts || []}
      />

      {/* MODAL 5: Delete Confirmation */}
      <Modal
        isOpen={!!deleteConfirmContact}
        onClose={() => setDeleteConfirmContact(null)}
        title="Cari Kartını Sil"
        size="sm"
      >
        <div className="space-y-4">
          {actionError && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-lg text-xs font-semibold">
              {actionError}
            </div>
          )}
          <p className="text-sm text-slate-700 dark:text-slate-200">
            <strong className="text-slate-900 dark:text-slate-100 uppercase font-black">{deleteConfirmContact?.name}</strong> isimli cari kartını silmek istediğinizden emin misiniz?
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Bu işlem cariye ait tüm muhasebe ve hesap hareketlerini silecektir. Bağlı siparişler varsa silme işlemi engellenecektir.
          </p>
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              onClick={() => setDeleteConfirmContact(null)}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 dark:text-slate-200 uppercase tracking-wider"
            >
              Vazgeç
            </button>
            <button
              onClick={handleDeleteContact}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold uppercase tracking-wider shadow-sm transition-colors"
            >
              Evet, Sil
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
