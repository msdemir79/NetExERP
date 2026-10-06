import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../api/client';
import { useApiQuery } from '../../hooks/useApiQuery';
import type { Contact, EntityType } from '../../types';
import { CreditCard, BookOpen, Sparkles, AlertCircle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { compareAccountCodes } from '../../services/accountingService';
import { getNextContactCode } from '../../services/contactService';
import Modal from '../Modal';
import Tabs from '../Common/Tabs';
import Button from '../Common/Button';
import { Field, Input, Select, Textarea } from '../Common/Field';

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

  // Stepper-sekmeli hibrit: her bölümün "dolu" durumu numaralı başlıkta onay
  // işaretiyle gösterilir. Zorunlu olan yalnızca ünvan (general) — diğerleri
  // opsiyonel, herhangi bir alan dolduysa tamamlanmış sayılır.
  const sectionCompleted = useMemo(() => ({
    general: !!name.trim(),
    contact: !!(phone.trim() || mobile.trim() || email.trim() || city || address.trim()),
    financial: !!(taxNumber.trim() || taxOffice.trim() || iban.trim() || paymentTermDays !== '' || creditLimit !== ''),
    notes: !!notes.trim(),
  }), [name, phone, mobile, email, city, address, taxNumber, taxOffice, iban, paymentTermDays, creditLimit, notes]);

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
          <div className="rounded-card border border-danger/30 bg-danger-soft p-3 text-2xs font-bold text-danger">
            {error}
          </div>
        )}

        {/* Stepper-sekmeli hibrit: bölümler doğrudan tıklanabilir, Kaydet her
            adımda erişilebilir; numaralar tamamlanan bölümde onaya döner. */}
        <Tabs
          ariaLabel="Cari kartı bölümleri"
          numbered
          size="sm"
          value={activeTab}
          onChange={(key) => setActiveTab(key as typeof activeTab)}
          items={[
            { key: 'general', label: 'Genel & Ticari', completed: sectionCompleted.general },
            { key: 'contact', label: 'İletişim & Adres', completed: sectionCompleted.contact },
            { key: 'financial', label: 'Mali & Banka', completed: sectionCompleted.financial },
            { key: 'notes', label: 'Notlar', completed: sectionCompleted.notes },
          ]}
        />

        {/* TAB 1: GENEL & TICARI */}
        {activeTab === 'general' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-label font-black uppercase tracking-widest text-fg-muted">Cari Kodu (ERP)</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="subtle"
                    icon={<Sparkles className="h-3 w-3" />}
                    onClick={() => handleAutoSuggestContactCode(type)}
                    title={`Sıradaki ${type === 'supplier' ? 'tedarikçi' : 'müşteri'} kodunu öner`}
                    className="h-6 px-1.5 text-2xs"
                  >
                    Öner ({type === 'supplier' ? 'TED-...' : 'CAR-...'})
                  </Button>
                </div>
                <Input
                  type="text"
                  value={code}
                  invalid={isDuplicateCode}
                  onChange={(e) => {
                    setCode(e.target.value);
                    setIsManualCode(true);
                  }}
                  placeholder={type === 'supplier' ? 'Örn: TED-001' : 'Örn: CAR-001'}
                  className="font-mono uppercase"
                />

                {/* Visual feedback for the suggested/entered code */}
                {isDuplicateCode ? (
                  <p className="flex items-center gap-1 text-2xs font-bold text-danger">
                    <AlertCircle className="h-3 w-3 shrink-0" />
                    <span>Bu kod sistemde zaten başka bir caride kayıtlı!</span>
                  </p>
                ) : currentCodeMeta.lastCode ? (
                  <div className="flex items-center justify-between text-2xs font-semibold text-fg-muted">
                    <span>Son kayıt: <strong className="font-mono text-fg-strong">{currentCodeMeta.lastCode}</strong></span>
                    <span className="text-brand-fg">Sıradaki: +1</span>
                  </div>
                ) : (
                  <div className="text-2xs font-semibold text-fg-muted">
                    <span>İlk {type === 'supplier' ? 'tedarikçi' : 'müşteri'} için önerildi</span>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="flex items-center gap-1 text-label font-black uppercase tracking-widest text-brand-fg">
                    <BookOpen className="h-3 w-3" /> TDHP Muhasebe
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="subtle"
                    onClick={() => handleAutoSuggestAccountCode()}
                    title="Sonraki boş hesap kodunu öner"
                    className="h-6 px-1.5 text-2xs"
                  >
                    Öner
                  </Button>
                </div>
                <Input
                  type="text"
                  value={accountCode}
                  onChange={(e) => { setAccountCode(e.target.value); setIsManualAccountCode(true); }}
                  placeholder={type === 'supplier' ? 'Örn: 320.01.001' : 'Örn: 120.01.001'}
                  list="tdhp-contact-accounts-quick"
                  className="font-mono uppercase"
                />
                <datalist id="tdhp-contact-accounts-quick">
                  {suggestedAccounts.map((acc) => (
                    <option key={`quick-${acc.code}`} value={acc.code}>
                      {acc.code} - {acc.name}
                    </option>
                  ))}
                </datalist>
                {accountCode.trim() && (
                  existingAccountMatch ? (
                    <div className="flex items-center gap-1.5 rounded-control border border-success/30 bg-success-soft px-2 py-1 text-2xs font-semibold text-success">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-pill bg-success" />
                      <span className="truncate"><strong>Mevcut TDHP Hesabı:</strong> {existingAccountMatch.name}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 rounded-control border border-brand/30 bg-brand-soft px-2 py-1 text-2xs font-semibold text-brand-fg">
                      <Sparkles className="h-3 w-3 shrink-0 animate-pulse text-brand" />
                      <span><strong>Otomatik Açılacak:</strong> Kaydedildiğinde bu hesap TDHP planına anında eklenecektir.</span>
                    </div>
                  )
                )}
              </div>

              <div className="sm:col-span-2">
                <Field label="Firma / Cari Ünvanı" required>
                  <Input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Örn: Eren Kundura Toptan San. Tic. Ltd. Şti."
                    className="uppercase"
                  />
                </Field>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Resmi Ticari Ünvan (Varsa)">
                <Input
                  type="text"
                  value={companyTitle}
                  onChange={(e) => setCompanyTitle(e.target.value)}
                  placeholder="Fatura başlığı ile aynı değilse giriniz"
                />
              </Field>

              <Field label="Yetkili Kişi (Ad Soyad)">
                <Input
                  type="text"
                  value={contactPerson}
                  onChange={(e) => setContactPerson(e.target.value)}
                  placeholder="Örn: Ahmet Yılmaz (Satın Alma Müdürü)"
                  className="font-semibold"
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <span className="text-label font-black uppercase tracking-widest text-fg-muted">Cari Türü *</span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => handleTypeChange('customer')}
                    className={cn(
                      "cursor-pointer rounded-control border py-2.5 px-2 text-center text-xs font-bold uppercase tracking-wider transition-all",
                      type === 'customer'
                        ? "border-brand bg-brand-soft text-brand-fg shadow-card"
                        : "border-line bg-surface text-fg-muted hover:bg-surface-hover"
                    )}
                  >
                    Müşteri (Alıcı)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTypeChange('supplier')}
                    className={cn(
                      "cursor-pointer rounded-control border py-2.5 px-2 text-center text-xs font-bold uppercase tracking-wider transition-all",
                      type === 'supplier'
                        ? "border-brand bg-brand-soft text-brand-fg shadow-card"
                        : "border-line bg-surface text-fg-muted hover:bg-surface-hover"
                    )}
                  >
                    Tedarikçi (Satıcı)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTypeChange('both')}
                    className={cn(
                      "cursor-pointer rounded-control border py-2.5 px-2 text-center text-xs font-bold uppercase tracking-wider transition-all",
                      type === 'both'
                        ? "border-brand bg-brand-soft text-brand-fg shadow-card"
                        : "border-line bg-surface text-fg-muted hover:bg-surface-hover"
                    )}
                  >
                    Her İkisi
                  </button>
                </div>
              </div>

              <Field label="Sektör / Cari Grubu">
                <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="">Kategori Seçiniz</option>
                  {CATEGORY_OPTIONS.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            {!initialData && (
              <div className="space-y-2 rounded-card border border-line bg-surface-raised p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-label font-black uppercase tracking-widest text-fg-muted">
                    Açılış / Devir Bakiyesi (₺)
                  </span>
                  <span className="text-2xs font-semibold text-fg-muted">
                    Pozitif: Alacaklıyız (Müşteri Borcu), Negatif: Borçluyuz (Tedarikçi Alacağı)
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    step="0.01"
                    value={balance}
                    onChange={(e) => setBalance(parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="font-mono text-sm"
                  />
                  <div className={cn(
                    "whitespace-nowrap rounded-control px-3 py-2 text-xs font-bold",
                    balance > 0 ? "bg-success-soft text-success" : balance < 0 ? "bg-danger-soft text-danger" : "bg-surface-raised text-fg-muted"
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
              <Field label="Sabit Telefon">
                <Input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0212 XXX XX XX"
                  className="font-mono"
                />
              </Field>

              <Field label="GSM / Cep Telefonu">
                <Input
                  type="text"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  placeholder="05XX XXX XX XX"
                  className="font-mono"
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="E-Posta Adresi">
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="muhasebe@firma.com"
                  className="font-medium"
                />
              </Field>

              <Field label="Web Sitesi">
                <Input
                  type="text"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="www.firma.com.tr"
                  className="font-medium"
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="İl / Şehir">
                <Select value={city} onChange={(e) => setCity(e.target.value)}>
                  <option value="">Şehir Seçiniz</option>
                  {TURKISH_CITIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="İlçe / Semt">
                <Input
                  type="text"
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  placeholder="Örn: Güngören / İkitelli"
                  className="font-semibold"
                />
              </Field>
            </div>

            <Field label="Fatura / Merkez Adresi">
              <Textarea
                rows={2}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Fatura ve tebligat adresi"
              />
            </Field>

            <Field label="Sevkiyat / Depo Teslim Adresi (Farklıysa)">
              <Textarea
                rows={2}
                value={shippingAddress}
                onChange={(e) => setShippingAddress(e.target.value)}
                placeholder="Ürünlerin teslim edileceği depo / ambar lokasyonu"
              />
            </Field>
          </div>
        )}


        {/* TAB 3: MALI & BANKA */}
        {activeTab === 'financial' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Vergi Dairesi">
                <Input
                  type="text"
                  value={taxOffice}
                  onChange={(e) => setTaxOffice(e.target.value)}
                  placeholder="Örn: Merter V.D."
                  className="font-semibold"
                />
              </Field>

              <Field label="Vergi Numarası (VKN)">
                <Input
                  type="text"
                  maxLength={10}
                  value={taxNumber}
                  onChange={(e) => setTaxNumber(e.target.value)}
                  placeholder="10 Haneli VKN"
                  className="font-mono"
                />
              </Field>

              <Field label="TC Kimlik No (Şahıs)">
                <Input
                  type="text"
                  maxLength={11}
                  value={tcKimlik}
                  onChange={(e) => setTcKimlik(e.target.value)}
                  placeholder="11 Haneli TCKN"
                  className="font-mono"
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 rounded-card border border-line bg-surface-raised p-4">
              <Field label="Ödeme Vadesi (Gün)">
                <Input
                  type="number"
                  min="0"
                  value={paymentTermDays}
                  onChange={(e) => setPaymentTermDays(e.target.value === '' ? '' : parseInt(e.target.value))}
                  placeholder="Örn: 30 / 60 gün"
                  className="font-mono"
                />
              </Field>

              <Field label="Kredi / Risk Limiti (₺)">
                <Input
                  type="number"
                  min="0"
                  step="1000"
                  value={creditLimit}
                  onChange={(e) => setCreditLimit(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  placeholder="Örn: 250000"
                  className="font-mono"
                />
              </Field>

              <Field label="Özel İskonto Oranı (%)">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={discountRate}
                  onChange={(e) => setDiscountRate(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  placeholder="Örn: 5 (%5 indirim)"
                  className="font-mono"
                />
              </Field>
            </div>

            <div className="space-y-4 border-t border-line pt-4">
              <h4 className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-fg-strong">
                <CreditCard className="h-3.5 w-3.5 text-brand" />
                Banka Hesap & IBAN Bilgileri
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Banka Adı & Şube">
                  <Input
                    type="text"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="Örn: Garanti BBVA - Merter Şb."
                    className="font-semibold"
                  />
                </Field>

                <Field label="Hesap Sahibi (Alıcı Adı)">
                  <Input
                    type="text"
                    value={bankAccountName}
                    onChange={(e) => setBankAccountName(e.target.value)}
                    placeholder="Banka hesabındaki resmi ad"
                    className="font-semibold"
                  />
                </Field>
              </div>

              <Field label="IBAN Numarası">
                <Input
                  type="text"
                  maxLength={32}
                  value={iban}
                  onChange={(e) => setIban(e.target.value)}
                  placeholder="TRXX XXXX XXXX XXXX XXXX XXXX XX"
                  className="font-mono uppercase"
                />
              </Field>
            </div>

            {/* TEK DÜZEN HESAP PLANI (TDHP) MUHASEBE BAĞLANTISI */}
            <div className="space-y-3 border-t border-line pt-4">
              <div className="flex items-center justify-between gap-2">
                <h4 className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-fg-strong">
                  <BookOpen className="h-3.5 w-3.5 text-brand" />
                  Tek Düzen Muhasebe Hesap Planı (TDHP) Entegrasyonu
                </h4>
                <Button
                  type="button"
                  size="sm"
                  variant="subtle"
                  icon={<Sparkles className="h-3 w-3" />}
                  onClick={() => handleAutoSuggestAccountCode()}
                >
                  Sıradaki Kodu Öner
                </Button>
              </div>

              <div className="space-y-3 rounded-card border border-brand/30 bg-brand-soft p-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2 space-y-1">
                    <span className="text-label font-black uppercase tracking-widest text-fg-muted">
                      Tanımlı Muhasebe Muavin Hesap Kodu
                    </span>
                    <Input
                      type="text"
                      value={accountCode}
                      onChange={(e) => { setAccountCode(e.target.value); setIsManualAccountCode(true); }}
                      placeholder={type === 'supplier' ? 'Örn: 320.01.001' : 'Örn: 120.01.001'}
                      list="tdhp-contact-accounts-tab3"
                      className="font-mono uppercase"
                    />
                    <datalist id="tdhp-contact-accounts-tab3">
                      {suggestedAccounts.map((acc) => (
                        <option key={`tab3-${acc.code}`} value={acc.code}>
                          {acc.code} - {acc.name}
                        </option>
                      ))}
                    </datalist>
                    {accountCode.trim() && (
                      existingAccountMatch ? (
                        <div className="flex items-center gap-1.5 rounded-control border border-success/30 bg-success-soft px-2.5 py-1.5 text-2xs font-semibold text-success">
                          <span className="h-2 w-2 shrink-0 rounded-pill bg-success" />
                          <span><strong>Mevcut TDHP Hesabı:</strong> {existingAccountMatch.code} - {existingAccountMatch.name}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 rounded-control border border-brand/30 bg-surface px-2.5 py-1.5 text-2xs font-semibold text-brand-fg">
                          <Sparkles className="h-3.5 w-3.5 shrink-0 animate-pulse text-brand" />
                          <span><strong>Otomatik Açılacak Alt Hesap:</strong> {accountCode.trim()} - Bu cari kartı kaydedildiğinde Tek Düzen Hesap Planında otomatik olarak açılacaktır.</span>
                        </div>
                      )
                    )}
                  </div>

                  <div className="space-y-1">
                    <span className="text-label font-black uppercase tracking-widest text-fg-muted">
                      Hızlı Hesap Grubu
                    </span>
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
                          "flex-1 cursor-pointer rounded-control border py-2 text-center text-2xs font-bold transition-all",
                          accountCode.startsWith('120') ? "border-brand bg-brand text-on-brand" : "border-line bg-surface text-fg-muted hover:bg-surface-hover"
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
                          "flex-1 cursor-pointer rounded-control border py-2 text-center text-2xs font-bold transition-all",
                          accountCode.startsWith('320') ? "border-brand bg-brand text-on-brand" : "border-line bg-surface text-fg-muted hover:bg-surface-hover"
                        )}
                      >
                        320 Satıcılar
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-2 rounded-card border border-line bg-surface p-3 text-2xs text-fg">
                  <span className="font-bold text-brand">ℹ️</span>
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
          <Field label="Özel Ticari Notlar, Anlaşmalar ve Açıklamalar">
            <Textarea
              rows={6}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Cari ile ilgili özel anlaşmalar, teslimat şartları, iskonto kuralları veya dahili uyarılar..."
              className="leading-relaxed"
            />
          </Field>
        )}

        {/* Bottom Actions */}
        <div className="flex items-center justify-between border-t border-line pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            İptal
          </Button>
          <Button type="submit" variant="primary" loading={loading}>
            {initialData ? 'Cari Bilgilerini Güncelle' : 'Yeni Cari Kartını Kaydet'}
          </Button>
        </div>

      </form>
    </Modal>
  );
}
