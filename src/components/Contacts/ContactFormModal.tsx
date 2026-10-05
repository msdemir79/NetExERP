import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../api/client';
import { useApiQuery } from '../../hooks/useApiQuery';
import type { Contact, EntityType } from '../../types';
import { 
  Building2, 
  User, 
  Phone, 
  Mail, 
  MapPin, 
  CreditCard, 
  Percent, 
  Calendar, 
  FileText, 
  Tag, 
  DollarSign,
  ShieldCheck,
  Globe,
  BookOpen,
  Sparkles,
  AlertCircle
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { compareAccountCodes } from '../../services/accountingService';
import { getNextContactCode } from '../../services/contactService';
import Modal from '../Modal';

interface ContactFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<Contact>) => Promise<void>;
  initialData?: Contact | null;
  defaultType?: EntityType;
  /** Başka bir modalın içinden açılıyorsa ESC yalnızca bu formu kapatır. */
  nested?: boolean;
}

const CATEGORY_OPTIONS = [
  'Toptancı Mağaza',
  'Perakende Zincir Mağaza',
  'İhracat Müşterisi',
  'E-Ticaret / Pazaryeri',
  'Fason Saya Dikim Atölyesi',
  'Taban / Ökçe İmalatçısı',
  'Deri & Kumaş Tedarikçisi',
  'Astar & Sünger Tedarikçisi',
  'Aksesuar & Kutu / Matbaa',
  'Hırdavat & Kimyevi Madde',
  'Lojistik / Kargo',
  'Diğer Hizmet & Tedarik'
];

const TURKISH_CITIES = [
  'İstanbul', 'İzmir', 'Ankara', 'Bursa', 'Gaziantep', 'Konya', 'Adana', 'Antalya', 
  'Denizli', 'Kayseri', 'Kocaeli', 'Manisa', 'Kahramanmaraş', 'Aydın', 'Mersin', 'Hatay',
  'Balıkesir', 'Diyarbakır', 'Şanlıurfa', 'Tekirdağ', 'Samsun', 'Trabzon', 'Eskişehir', 'Diğer'
];

export default function ContactFormModal({
  isOpen,
  onClose,
  onSave,
  initialData,
  defaultType = 'customer',
  nested = false
}: ContactFormModalProps) {
  const [activeTab, setActiveTab] = useState<'general' | 'contact' | 'financial' | 'notes'>('general');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [code, setCode] = useState('');
  const [isManualCode, setIsManualCode] = useState(false);
  const [name, setName] = useState('');
  const [companyTitle, setCompanyTitle] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [type, setType] = useState<EntityType>('customer');
  const [category, setCategory] = useState('');
  const [phone, setPhone] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [city, setCity] = useState('');
  const [district, setDistrict] = useState('');
  const [address, setAddress] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [taxOffice, setTaxOffice] = useState('');
  const [taxNumber, setTaxNumber] = useState('');
  const [tcKimlik, setTcKimlik] = useState('');
  const [paymentTermDays, setPaymentTermDays] = useState<number | ''>('');
  const [creditLimit, setCreditLimit] = useState<number | ''>('');
  const [discountRate, setDiscountRate] = useState<number | ''>('');
  const [bankName, setBankName] = useState('');
  const [iban, setIban] = useState('');
  const [bankAccountName, setBankAccountName] = useState('');
  const [balance, setBalance] = useState<number>(0);
  const [accountCode, setAccountCode] = useState('');
  const [isManualAccountCode, setIsManualAccountCode] = useState(false);
  const [notes, setNotes] = useState('');

  // Live queries for suggestions
  const allContacts = useApiQuery(() => api.contacts.list(), [], ['contacts']);
  const tdhpAccounts = useApiQuery(() => api.accounts.list(), [], ['accounts']);

  // Auto-suggest next Contact Code (CAR-001 / CAR-005, TED-001, etc.)
  const handleAutoSuggestContactCode = (targetType: EntityType = type) => {
    const suggestion = getNextContactCode(allContacts || [], targetType);
    setCode(suggestion.nextCode);
    setIsManualCode(false);
  };

  // Auto-suggest next TDHP sub-account code (120.01.xxx or 320.01.xxx)
  const handleAutoSuggestAccountCode = (targetType: EntityType = type) => {
    const isSupplier = targetType === 'supplier';
    const prefix = isSupplier ? '320.01.' : '120.01.';
    
    let maxSeq = 0;
    allContacts?.forEach(c => {
      if (c.accountCode && c.accountCode.startsWith(prefix)) {
        const parts = c.accountCode.split('.');
        const lastPart = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(lastPart) && lastPart > maxSeq) {
          maxSeq = lastPart;
        }
      }
    });

    tdhpAccounts?.forEach(a => {
      if (a.code && a.code.startsWith(prefix)) {
        const parts = a.code.split('.');
        const lastPart = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(lastPart) && lastPart > maxSeq) {
          maxSeq = lastPart;
        }
      }
    });

    const nextSeq = (maxSeq + 1).toString().padStart(3, '0');
    setAccountCode(`${prefix}${nextSeq}`);
  };

  // Handle Cari Türü switch (Müşteri <-> Tedarikçi)
  const handleTypeChange = (newType: EntityType) => {
    setType(newType);

    // If this is a new card and code was not manually typed (or matches standard auto-generated pattern)
    if (!initialData) {
      const isAutoPattern = !isManualCode || !code.trim() || /^(CAR|TED|MUS)[-_]?\d+$/i.test(code.trim());
      if (isAutoPattern) {
        const suggestion = getNextContactCode(allContacts || [], newType);
        setCode(suggestion.nextCode);
      }

      // Also update TDHP account code if empty or matches 120.01 / 320.01 pattern
      const isTdhpPattern = !accountCode.trim() || /^(120|320)\.01\.\d+$/.test(accountCode.trim());
      if (isTdhpPattern) {
        handleAutoSuggestAccountCode(newType);
      }
    }
  };

  // Current code metadata for UI suggestions (highest number, last code)
  const currentCodeMeta = useMemo(() => {
    return getNextContactCode(allContacts || [], type);
  }, [allContacts, type]);

  // Check if entered code already exists in another contact
  const isDuplicateCode = useMemo(() => {
    if (!code.trim() || !allContacts) return false;
    const currentId = initialData?.id;
    return allContacts.some(c => c.id !== currentId && c.code?.trim().toLowerCase() === code.trim().toLowerCase());
  }, [code, allContacts, initialData]);

  const suggestedAccounts = useMemo(() => {
    if (!tdhpAccounts) return [];
    const filterPrefix = type === 'supplier' ? '320' : '120';
    const filtered = tdhpAccounts.filter(a => a.code.startsWith(filterPrefix));
    const uniqueMap = new Map<string, typeof filtered[0]>();
    for (const acc of filtered) {
      const codeKey = acc.code.trim();
      if (!uniqueMap.has(codeKey)) {
        uniqueMap.set(codeKey, acc);
      }
    }
    const list = Array.from(uniqueMap.values());
    list.sort((a, b) => compareAccountCodes(a.code, b.code));
    return list;
  }, [tdhpAccounts, type]);

  // Check if entered accountCode already exists in TDHP chart
  const existingAccountMatch = useMemo(() => {
    if (!accountCode.trim() || !tdhpAccounts) return null;
    return tdhpAccounts.find(a => a.code.toLowerCase() === accountCode.trim().toLowerCase());
  }, [accountCode, tdhpAccounts]);

  useEffect(() => {
    if (initialData) {
      setCode(initialData.code || '');
      setIsManualCode(true);
      setName(initialData.name || '');
      setCompanyTitle(initialData.companyTitle || '');
      setContactPerson(initialData.contactPerson || '');
      setType(initialData.type || 'customer');
      setCategory(initialData.category || '');
      setPhone(initialData.phone || '');
      setMobile(initialData.mobile || '');
      setEmail(initialData.email || '');
      setWebsite(initialData.website || '');
      setCity(initialData.city || '');
      setDistrict(initialData.district || '');
      setAddress(initialData.address || '');
      setShippingAddress(initialData.shippingAddress || '');
      setTaxOffice(initialData.taxOffice || '');
      setTaxNumber(initialData.taxNumber || '');
      setTcKimlik(initialData.tcKimlik || '');
      setPaymentTermDays(initialData.paymentTermDays ?? '');
      setCreditLimit(initialData.creditLimit ?? '');
      setDiscountRate(initialData.discountRate ?? '');
      setBankName(initialData.bankName || '');
      setIban(initialData.iban || '');
      setBankAccountName(initialData.bankAccountName || '');
      setBalance(initialData.balance || 0);
      setAccountCode(initialData.accountCode || '');
      setIsManualAccountCode(true);
      setNotes(initialData.notes || '');
    } else if (isOpen) {
      // Reset form & automatically suggest next sequential codes
      const initialType = defaultType || 'customer';
      setType(initialType);
      setIsManualCode(false);

      // Suggest contact code (e.g. CAR-001 or CAR-005)
      const contactCodeSuggestion = getNextContactCode(allContacts || [], initialType);
      setCode(contactCodeSuggestion.nextCode);

      // Suggest TDHP account code (e.g. 120.01.xxx or 320.01.xxx)
      const isSupplier = initialType === 'supplier';
      const tdhpPrefix = isSupplier ? '320.01.' : '120.01.';
      let maxSeq = 0;
      allContacts?.forEach(c => {
        if (c.accountCode && c.accountCode.startsWith(tdhpPrefix)) {
          const parts = c.accountCode.split('.');
          const lastPart = parseInt(parts[parts.length - 1], 10);
          if (!isNaN(lastPart) && lastPart > maxSeq) maxSeq = lastPart;
        }
      });
      tdhpAccounts?.forEach(a => {
        if (a.code && a.code.startsWith(tdhpPrefix)) {
          const parts = a.code.split('.');
          const lastPart = parseInt(parts[parts.length - 1], 10);
          if (!isNaN(lastPart) && lastPart > maxSeq) maxSeq = lastPart;
        }
      });
      const nextTdhpSeq = (maxSeq + 1).toString().padStart(3, '0');
      setAccountCode(`${tdhpPrefix}${nextTdhpSeq}`);
      setIsManualAccountCode(false);

      setName('');
      setCompanyTitle('');
      setContactPerson('');
      setCategory('');
      setPhone('');
      setMobile('');
      setEmail('');
      setWebsite('');
      setCity('');
      setDistrict('');
      setAddress('');
      setShippingAddress('');
      setTaxOffice('');
      setTaxNumber('');
      setTcKimlik('');
      setPaymentTermDays('');
      setCreditLimit('');
      setDiscountRate('');
      setBankName('');
      setIban('');
      setBankAccountName('');
      setBalance(0);
      setNotes('');
    }
    setActiveTab('general');
    setError(null);
  }, [initialData, isOpen, defaultType]);

  // Keep auto-generated code synchronized with actual DB data if loaded asynchronously
  useEffect(() => {
    if (isOpen && !initialData && !isManualCode && allContacts) {
      const suggestion = getNextContactCode(allContacts, type);
      setCode(suggestion.nextCode);
    }
  }, [isOpen, initialData, isManualCode, allContacts, type]);

  // TDHP muavin hesap kodu önerisi de listeler geldikten sonra yeniden hesaplanır.
  // Form iç içe (ör. irsaliye ekranından) açıldığında carî/hesap listeleri henüz
  // yüklenmemiş olur; ilk öneri dolu bir kod (örn. 120.01.001) verebilir ve kayıt
  // sırasında mevcut hesabın adı bu cariyle ezilirdi.
  useEffect(() => {
    if (isOpen && !initialData && !isManualAccountCode && allContacts && tdhpAccounts) {
      handleAutoSuggestAccountCode(type);
    }
  }, [isOpen, initialData, isManualAccountCode, allContacts, tdhpAccounts, type]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Portal ile taşınmış olsa da React olayları ağaçta yukarı yayılır;
    // ev sahibi formun (ör. stok kartı) submit'i tetiklenmesin.
    e.stopPropagation();
    if (!name.trim()) {
      setError('Lütfen cari ünvanını giriniz.');
      setActiveTab('general');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await onSave({
        code: code.trim() || undefined,
        name: name.trim(),
        companyTitle: companyTitle.trim() || undefined,
        contactPerson: contactPerson.trim() || undefined,
        type,
        category: category || undefined,
        phone: phone.trim() || undefined,
        mobile: mobile.trim() || undefined,
        email: email.trim() || undefined,
        website: website.trim() || undefined,
        city: city || undefined,
        district: district.trim() || undefined,
        address: address.trim() || undefined,
        shippingAddress: shippingAddress.trim() || undefined,
        taxOffice: taxOffice.trim() || undefined,
        taxNumber: taxNumber.trim() || undefined,
        tcKimlik: tcKimlik.trim() || undefined,
        paymentTermDays: paymentTermDays === '' ? undefined : Number(paymentTermDays),
        creditLimit: creditLimit === '' ? undefined : Number(creditLimit),
        discountRate: discountRate === '' ? undefined : Number(discountRate),
        bankName: bankName.trim() || undefined,
        iban: iban.trim().toUpperCase() || undefined,
        bankAccountName: bankAccountName.trim() || undefined,
        balance: initialData ? initialData.balance : Number(balance) || 0,
        accountCode: accountCode.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Cari kartı kaydedilirken bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={initialData ? `Cari Kartı Düzenle: ${initialData.name}` : 'Yeni Cari Hesap Kartı'}
      size="xl"
      nested={nested}
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-lg text-xs font-semibold">
            {error}
          </div>
        )}

        {/* Tab Headers */}
        <div className="flex border-b border-slate-200 dark:border-slate-700 gap-2 pb-2">
          <button
            type="button"
            onClick={() => setActiveTab('general')}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all",
              activeTab === 'general'
                ? "bg-indigo-600 text-white shadow-sm"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 hover:bg-slate-200"
            )}
          >
            <Building2 className="w-3.5 h-3.5" />
            1. Genel & Ticari
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('contact')}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all",
              activeTab === 'contact'
                ? "bg-indigo-600 text-white shadow-sm"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 hover:bg-slate-200"
            )}
          >
            <Phone className="w-3.5 h-3.5" />
            2. İletişim & Adres
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('financial')}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all",
              activeTab === 'financial'
                ? "bg-indigo-600 text-white shadow-sm"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 hover:bg-slate-200"
            )}
          >
            <CreditCard className="w-3.5 h-3.5" />
            3. Mali & Banka
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('notes')}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all",
              activeTab === 'notes'
                ? "bg-indigo-600 text-white shadow-sm"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 hover:bg-slate-200"
            )}
          >
            <FileText className="w-3.5 h-3.5" />
            4. Notlar
          </button>
        </div>

        {/* TAB 1: GENEL & TICARI */}
        {activeTab === 'general' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-1">
                    <span>Cari Kodu (ERP)</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => handleAutoSuggestContactCode(type)}
                    className="text-[9px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-900/60 px-1.5 py-0.5 rounded transition-colors flex items-center gap-0.5 cursor-pointer"
                    title={`Sıradaki ${type === 'supplier' ? 'tedarikçi' : 'müşteri'} kodunu öner`}
                  >
                    <Sparkles className="w-2.5 h-2.5" />
                    <span>Öner ({type === 'supplier' ? 'TED-...' : 'CAR-...'})</span>
                  </button>
                </div>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value);
                    setIsManualCode(true);
                  }}
                  placeholder={type === 'supplier' ? 'Örn: TED-001' : 'Örn: CAR-001'}
                  className={cn(
                    "w-full border rounded-lg p-2.5 text-xs font-mono font-bold outline-none uppercase transition-colors",
                    isDuplicateCode
                      ? "border-rose-400 bg-rose-50 text-rose-900 focus:ring-1 focus:ring-rose-500"
                      : "border-slate-200 dark:border-slate-700 focus:ring-1 focus:ring-indigo-500 text-slate-900 dark:text-slate-100"
                  )}
                />
                
                {/* Visual feedback for the suggested/entered code */}
                {isDuplicateCode ? (
                  <div className="flex items-center gap-1 text-[10px] text-rose-600 font-semibold mt-0.5">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    <span>Bu kod sistemde zaten başka bir caride kayıtlı!</span>
                  </div>
                ) : currentCodeMeta.lastCode ? (
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center justify-between">
                    <span>Son kayıt: <strong className="font-mono text-slate-700 dark:text-slate-200">{currentCodeMeta.lastCode}</strong></span>
                    <span className="text-[9px] text-indigo-600 dark:text-indigo-400 font-medium">Sıradaki: +1</span>
                  </div>
                ) : (
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    <span>İlk {type === 'supplier' ? 'tedarikçi' : 'müşteri'} için önerildi</span>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest flex items-center gap-1">
                    <BookOpen className="w-3 h-3" /> TDHP Muhasebe
                  </label>
                  <button
                    type="button"
                    onClick={() => handleAutoSuggestAccountCode()}
                    className="text-[9px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-1.5 py-0.5 rounded transition-colors"
                    title="Sonraki boş hesap kodunu öner"
                  >
                    Öner
                  </button>
                </div>
                <input
                  type="text"
                  value={accountCode}
                  onChange={(e) => { setAccountCode(e.target.value); setIsManualAccountCode(true); }}
                  placeholder={type === 'supplier' ? 'Örn: 320.01.001' : 'Örn: 120.01.001'}
                  list="tdhp-contact-accounts-quick"
                  className="w-full border border-indigo-200 bg-indigo-50/40 rounded-lg p-2.5 text-xs font-mono font-bold text-indigo-950 focus:ring-1 focus:ring-indigo-500 outline-none uppercase"
                />
                <datalist id="tdhp-contact-accounts-quick">
                  {suggestedAccounts.map((acc) => (
                    <option key={`quick-${acc.code}`} value={acc.code}>
                      {acc.code} - {acc.name}
                    </option>
                  ))}
                </datalist>
                {accountCode.trim() && (
                  <div className="mt-1">
                    {existingAccountMatch ? (
                      <div className="flex items-center gap-1.5 text-[10px] text-emerald-700 bg-emerald-50 px-2 py-1 rounded border border-emerald-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                        <span className="truncate"><strong>Mevcut TDHP Hesabı:</strong> {existingAccountMatch.name}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-[10px] text-indigo-700 bg-indigo-50/80 px-2 py-1 rounded border border-indigo-200 font-medium">
                        <Sparkles className="w-3 h-3 text-indigo-600 shrink-0 animate-pulse" />
                        <span><strong>Otomatik Açılacak:</strong> Kaydedildiğinde bu hesap TDHP planına anında eklenecektir.</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="sm:col-span-2 space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Firma / Cari Ünvanı *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Örn: Eren Kundura Toptan San. Tic. Ltd. Şti."
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-xs font-bold focus:ring-1 focus:ring-indigo-500 outline-none uppercase text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Resmi Ticari Ünvan (Varsa)
                </label>
                <input
                  type="text"
                  value={companyTitle}
                  onChange={(e) => setCompanyTitle(e.target.value)}
                  placeholder="Fatura başlığı ile aynı değilse giriniz"
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Yetkili Kişi (Ad Soyad)
                </label>
                <input
                  type="text"
                  value={contactPerson}
                  onChange={(e) => setContactPerson(e.target.value)}
                  placeholder="Örn: Ahmet Yılmaz (Satın Alma Müdürü)"
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-xs font-semibold focus:ring-1 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Cari Türü *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => handleTypeChange('customer')}
                    className={cn(
                      "py-2.5 px-2 rounded-lg text-xs font-bold uppercase tracking-wider border transition-all text-center cursor-pointer",
                      type === 'customer'
                        ? "bg-indigo-50 border-indigo-600 text-indigo-700 shadow-sm"
                        : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 hover:bg-slate-50 dark:bg-slate-800/50"
                    )}
                  >
                    Müşteri (Alıcı)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTypeChange('supplier')}
                    className={cn(
                      "py-2.5 px-2 rounded-lg text-xs font-bold uppercase tracking-wider border transition-all text-center cursor-pointer",
                      type === 'supplier'
                        ? "bg-amber-50 border-amber-600 text-amber-800 shadow-sm"
                        : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 hover:bg-slate-50 dark:bg-slate-800/50"
                    )}
                  >
                    Tedarikçi (Satıcı)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTypeChange('both')}
                    className={cn(
                      "py-2.5 px-2 rounded-lg text-xs font-bold uppercase tracking-wider border transition-all text-center cursor-pointer",
                      type === 'both'
                        ? "bg-emerald-50 border-emerald-600 text-emerald-800 shadow-sm"
                        : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 hover:bg-slate-50 dark:bg-slate-800/50"
                    )}
                  >
                    Her İkisi
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Sektör / Cari Grubu
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-xs font-bold focus:ring-1 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-900"
                >
                  <option value="">Kategori Seçiniz</option>
                  {CATEGORY_OPTIONS.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {!initialData && (
              <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                    Açılış / Devir Bakiyesi (₺)
                  </label>
                  <span className="text-[10px] text-slate-400">
                    Pozitif: Alacaklıyız (Müşteri Borcu), Negatif: Borçluyuz (Tedarikçi Alacağı)
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    step="0.01"
                    value={balance}
                    onChange={(e) => setBalance(parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg p-2.5 text-sm font-mono font-bold focus:ring-1 focus:ring-indigo-500 outline-none"
                  />
                  <div className={cn(
                    "px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap",
                    balance > 0 ? "bg-emerald-100 text-emerald-800" : balance < 0 ? "bg-rose-100 text-rose-800" : "bg-slate-200 text-slate-700 dark:text-slate-200"
                  )}>
                    {balance > 0 ? 'Alacağımız Var' : balance < 0 ? 'Borcumuz Var' : 'Sıfır Bakiye'}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: ILETISIM & ADRES */}
        {activeTab === 'contact' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Sabit Telefon
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0212 XXX XX XX"
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-xs font-mono font-bold focus:ring-1 focus:ring-indigo-500 outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  GSM / Cep Telefonu
                </label>
                <input
                  type="text"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  placeholder="05XX XXX XX XX"
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-xs font-mono font-bold focus:ring-1 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  E-Posta Adresi
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="muhasebe@firma.com"
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-xs focus:ring-1 focus:ring-indigo-500 outline-none font-medium"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Web Sitesi
                </label>
                <input
                  type="text"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="www.firma.com.tr"
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-xs focus:ring-1 focus:ring-indigo-500 outline-none font-medium"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  İl / Şehir
                </label>
                <select
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-xs font-bold focus:ring-1 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-900"
                >
                  <option value="">Şehir Seçiniz</option>
                  {TURKISH_CITIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  İlçe / Semt
                </label>
                <input
                  type="text"
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  placeholder="Örn: Güngören / İkitelli"
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-xs font-semibold focus:ring-1 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Fatura / Merkez Adresi
              </label>
              <textarea
                rows={2}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Fatura ve tebligat adresi"
                className="w-full border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Sevkiyat / Depo Teslim Adresi (Farklıysa)
              </label>
              <textarea
                rows={2}
                value={shippingAddress}
                onChange={(e) => setShippingAddress(e.target.value)}
                placeholder="Ürünlerin teslim edileceği depo / ambar lokasyonu"
                className="w-full border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
              />
            </div>
          </div>
        )}

        {/* TAB 3: MALI & BANKA */}
        {activeTab === 'financial' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Vergi Dairesi
                </label>
                <input
                  type="text"
                  value={taxOffice}
                  onChange={(e) => setTaxOffice(e.target.value)}
                  placeholder="Örn: Merter V.D."
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-xs font-semibold focus:ring-1 focus:ring-indigo-500 outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Vergi Numarası (VKN)
                </label>
                <input
                  type="text"
                  maxLength={10}
                  value={taxNumber}
                  onChange={(e) => setTaxNumber(e.target.value)}
                  placeholder="10 Haneli VKN"
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-xs font-mono font-bold focus:ring-1 focus:ring-indigo-500 outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  TC Kimlik No (Şahıs)
                </label>
                <input
                  type="text"
                  maxLength={11}
                  value={tcKimlik}
                  onChange={(e) => setTcKimlik(e.target.value)}
                  placeholder="11 Haneli TCKN"
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-xs font-mono font-bold focus:ring-1 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                  Ödeme Vadesi (Gün)
                </label>
                <input
                  type="number"
                  min="0"
                  value={paymentTermDays}
                  onChange={(e) => setPaymentTermDays(e.target.value === '' ? '' : parseInt(e.target.value))}
                  placeholder="Örn: 30 / 60 gün"
                  className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg p-2.5 text-xs font-mono font-bold focus:ring-1 focus:ring-indigo-500 outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                  Kredi / Risk Limiti (₺)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={creditLimit}
                  onChange={(e) => setCreditLimit(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  placeholder="Örn: 250000"
                  className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg p-2.5 text-xs font-mono font-bold focus:ring-1 focus:ring-indigo-500 outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                  Özel İskonto Oranı (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={discountRate}
                  onChange={(e) => setDiscountRate(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  placeholder="Örn: 5 (%5 indirim)"
                  className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg p-2.5 text-xs font-mono font-bold focus:ring-1 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>

            <div className="border-t border-slate-200 dark:border-slate-700 pt-4 space-y-4">
              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-indigo-600" />
                Banka Hesap & IBAN Bilgileri
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Banka Adı & Şube
                  </label>
                  <input
                    type="text"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="Örn: Garanti BBVA - Merter Şb."
                    className="w-full border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-xs font-semibold focus:ring-1 focus:ring-indigo-500 outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Hesap Sahibi (Alıcı Adı)
                  </label>
                  <input
                    type="text"
                    value={bankAccountName}
                    onChange={(e) => setBankAccountName(e.target.value)}
                    placeholder="Banka hesabındaki resmi ad"
                    className="w-full border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-xs font-semibold focus:ring-1 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  IBAN Numarası
                </label>
                <input
                  type="text"
                  maxLength={32}
                  value={iban}
                  onChange={(e) => setIban(e.target.value)}
                  placeholder="TRXX XXXX XXXX XXXX XXXX XXXX XX"
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-xs font-mono font-bold focus:ring-1 focus:ring-indigo-500 outline-none uppercase"
                />
              </div>
            </div>

            {/* TEK DÜZEN HESAP PLANI (TDHP) MUHASEBE BAĞLANTISI */}
            <div className="border-t border-slate-200 dark:border-slate-700 pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
                  Tek Düzen Muhasebe Hesap Planı (TDHP) Entegrasyonu
                </h4>
                <button
                  type="button"
                  onClick={() => handleAutoSuggestAccountCode()}
                  className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-md transition-colors"
                >
                  <Sparkles className="w-3 h-3" />
                  Sıradaki Kodu Öner
                </button>
              </div>

              <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">
                      Tanımlı Muhasebe Muavin Hesap Kodu
                    </label>
                    <input
                      type="text"
                      value={accountCode}
                      onChange={(e) => { setAccountCode(e.target.value); setIsManualAccountCode(true); }}
                      placeholder={type === 'supplier' ? 'Örn: 320.01.001' : 'Örn: 120.01.001'}
                      list="tdhp-contact-accounts-tab3"
                      className="w-full border border-indigo-200 bg-white dark:bg-slate-900 rounded-lg p-2.5 text-xs font-mono font-bold text-indigo-950 focus:ring-1 focus:ring-indigo-500 outline-none uppercase"
                    />
                    <datalist id="tdhp-contact-accounts-tab3">
                      {suggestedAccounts.map((acc) => (
                        <option key={`tab3-${acc.code}`} value={acc.code}>
                          {acc.code} - {acc.name}
                        </option>
                      ))}
                    </datalist>
                    {accountCode.trim() && (
                      <div className="mt-1.5">
                        {existingAccountMatch ? (
                          <div className="flex items-center gap-1.5 text-xs text-emerald-800 bg-emerald-50 px-2.5 py-1.5 rounded-lg border border-emerald-200">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                            <span><strong>Mevcut TDHP Hesabı:</strong> {existingAccountMatch.code} - {existingAccountMatch.name}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-xs text-indigo-900 bg-indigo-50 px-2.5 py-1.5 rounded-lg border border-indigo-200 font-medium">
                            <Sparkles className="w-3.5 h-3.5 text-indigo-600 shrink-0 animate-pulse" />
                            <span><strong>Otomatik Açılacak Alt Hesap:</strong> {accountCode.trim()} - Bu cari kartı kaydedildiğinde Tek Düzen Hesap Planında otomatik olarak açılacaktır.</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                      Hızlı Hesap Grubu
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const prefix = '120.01.';
                          let maxSeq = 0;
                          allContacts?.forEach(c => {
                            if (c.accountCode?.startsWith(prefix)) {
                              const s = parseInt(c.accountCode.split('.')[2], 10);
                              if (!isNaN(s) && s > maxSeq) maxSeq = s;
                            }
                          });
                          setAccountCode(`${prefix}${(maxSeq + 1).toString().padStart(3, '0')}`);
                          setIsManualAccountCode(true);
                        }}
                        className={cn(
                          "flex-1 py-2 rounded-lg text-[10px] font-bold border text-center transition-all",
                          accountCode.startsWith('120') ? "bg-indigo-600 text-white border-indigo-600" : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:bg-slate-800/50"
                        )}
                      >
                        120 Alıcılar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const prefix = '320.01.';
                          let maxSeq = 0;
                          allContacts?.forEach(c => {
                            if (c.accountCode?.startsWith(prefix)) {
                              const s = parseInt(c.accountCode.split('.')[2], 10);
                              if (!isNaN(s) && s > maxSeq) maxSeq = s;
                            }
                          });
                          setAccountCode(`${prefix}${(maxSeq + 1).toString().padStart(3, '0')}`);
                          setIsManualAccountCode(true);
                        }}
                        className={cn(
                          "flex-1 py-2 rounded-lg text-[10px] font-bold border text-center transition-all",
                          accountCode.startsWith('320') ? "bg-indigo-600 text-white border-indigo-600" : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:bg-slate-800/50"
                        )}
                      >
                        320 Satıcılar
                      </button>
                    </div>
                  </div>
                </div>

                <div className="text-[11px] text-slate-600 bg-white dark:bg-slate-900/70 p-3 rounded-lg border border-indigo-100 flex items-start gap-2">
                  <span className="text-indigo-600 font-bold">ℹ️</span>
                  <span>
                    <strong>Otomatik Yevmiye & Defter-i Kebir Entegrasyonu:</strong> Bu cariye kesilen satış veya alış faturaları ile kasa/banka/çek tahsilat-tediyeleri onaylandığında, genel hesap yerine doğrudan burada tanımlanan muavin koduna kaydedilir. Böylece Mizan ve Muavin Defterinde bu carinin net borç/alacak durumu kuruşu kuruşuna listelenir.
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: NOTLAR */}
        {activeTab === 'notes' && (
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Özel Ticari Notlar, Anlaşmalar ve Açıklamalar
              </label>
              <textarea
                rows={6}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Cari ile ilgili özel anlaşmalar, teslimat şartları, iskonto kuralları veya dahili uyarılar..."
                className="w-full border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-xs focus:ring-1 focus:ring-indigo-500 outline-none leading-relaxed"
              />
            </div>
          </div>
        )}

        {/* Bottom Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-700">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 dark:text-slate-100 uppercase tracking-wider"
          >
            İptal
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-colors shadow-sm"
          >
            {loading ? 'Kaydediliyor...' : initialData ? 'Cari Bilgilerini Güncelle' : 'Yeni Cari Kartını Kaydet'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
