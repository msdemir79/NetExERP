import React, { useMemo, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Settings as SettingsIcon,
  Package,
  ShoppingCart,
  Hammer,
  Landmark,
  UserCheck,
  Building2,
  ShieldCheck,
  Search,
  X,
} from 'lucide-react';
import StockSettings from './StockSettings';
import OrderSettings from './OrderSettings';
import ProductionSettings from './ProductionSettings';
import FinanceSettings from './FinanceSettings';
import HRSettings from './HRSettings';
import CompanySettings from './CompanySettings';
import UsersManagement from '../Users';
import Tabs from '../Common/Tabs';
import { SettingsTabContext } from './SettingsSection';
import { settingsService } from '../../services/settingsService';
import type { AppSettings } from '../../types';
import { confirmDialog } from '../../lib/feedback';

/** Ayar arama indeksi: bölüm başlıkları, alt bileşenlerdeki SettingsSection başlıklarıyla birebir aynı olmalı. */
const SEARCH_INDEX: { tabId: string; tabLabel: string; keywords: string; sections: { title: string; keywords: string }[] }[] = [
  {
    tabId: 'stock',
    tabLabel: 'Stok & Barkod',
    keywords: 'stok barkod asorti beden numara renk koli kritik eşik sayaç',
    sections: [
      { title: 'Asorti & Beden Şablonları', keywords: 'asorti şablon beden koli numara dağılım preset' },
      { title: 'Barkod Formatı & Sayacı', keywords: 'barkod code-128 ean-13 code-39 önek gs1 sayaç otomatik' },
      { title: 'Numara Standartları & Kritik Eşik', keywords: 'numara seri ayakka kritk stok eşik uyarı limiti' },
      { title: 'Renk Tanımları', keywords: 'renk kartı hex pantone rgb üretici kodu grup' },
    ],
  },
  {
    tabId: 'order',
    tabLabel: 'Sipariş & Lojistik',
    keywords: 'sipariş irsaliye fatura önek seri numara kdv vade para birimi',
    sections: [
      { title: 'Sipariş & Sevkiyat Evrak Numaratörleri', keywords: 'satış satın alma önek seri sipariş irsaliye fatura' },
      { title: 'Ticari Varsayılanlar & KDV', keywords: 'kdv vergi oranı para birimi vade ödeme iş emri stok düş' },
    ],
  },
  {
    tabId: 'production',
    tabLabel: 'Üretim Planlama',
    keywords: 'üretim iş emri bant kapasite fire aşama istasyon reçete',
    sections: [
      { title: 'Üretim & İş Emri Parametreleri', keywords: 'iş emri önek kapasite çift fire tolerans reçete hammadde' },
      { title: 'Üretim İstasyonları & İmalat Akışı', keywords: 'istasyon aşama bant imalat süreci' },
    ],
  },
  {
    tabId: 'finance',
    tabLabel: 'Finans & TDHP',
    keywords: 'finans muhasebe tdhp hesap kodu çek senet vade alarm kdv cari stok',
    sections: [
      { title: 'Finans & Tahsilat Parametreleri', keywords: 'para birimi çek senet vade alarm gün' },
      { title: 'TDHP Hesap Kodu Eşleştirmeleri', keywords: 'tdhp hesap planı müşteri tedarikçi mamul hammadde satış gelir kdv' },
    ],
  },
  {
    tabId: 'hr',
    tabLabel: 'İK & Bordro',
    keywords: 'İK bordro çalışma saat fazla mesai sgk vergi asgari ücret izin hafta tatili',
    sections: [
      { title: 'Çalışma Süreleri & Fazla Mesai', keywords: 'haftalık günlük saat mesai çarpanı izin' },
      { title: 'Hafta Tatili Günleri', keywords: 'hafta tatili gün puantaj çalışma takvimi' },
      { title: 'Asgari Ücret & Vergi Parametreleri', keywords: 'asgari ücret brüt net gelir vergisi damga istisna sgk saat' },
      { title: 'SGK & Yasal Kesinti Oranları', keywords: 'sgk işçi işveren prim işsizlik kesinti oran' },
    ],
  },
  {
    tabId: 'users',
    tabLabel: 'Kullanıcı & RBAC',
    keywords: 'kullanıcı rol yetki rbac denetim audit silinen kayıt',
    sections: [],
  },
  {
    tabId: 'company',
    tabLabel: 'Firma & Yedekleme',
    keywords: 'firma antet logo vergi iban banka yedekleme json sıfırlama demo veritabanı',
    sections: [
      { title: 'Firma Künyesi & Antet', keywords: 'firma ünvan vergi dairesi vkno adres telefon email banka iban logo antet' },
      { title: 'Veritabanı Yedekleme & Sistem Araçları', keywords: 'yedek json dışa içe aktar sıfırla hareket demo veritabanı' },
    ],
  },
];

function fold(value: string): string {
  return value
    .toLocaleLowerCase('tr-TR')
    .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i')
    .replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
    .trim();
}

const MODULE_ICONS: Record<string, React.ElementType> = {
  stock: Package, order: ShoppingCart, production: Hammer, finance: Landmark,
  hr: UserCheck, users: ShieldCheck, company: Building2,
};
const SECTION_LABELS: Record<string, string[]> = {
  stock: ['Asorti & Beden', 'Barkod', 'Numaralar & Stok Eşiği', 'Renkler'],
  order: ['Evrak Numaratörleri', 'Ticari Kurallar & KDV'],
  production: ['İş Emri Parametreleri', 'İstasyonlar & Akış'],
  finance: ['Tahsilat & Vade', 'Hesap Eşleştirmeleri'],
  hr: ['Çalışma & Mesai', 'Hafta Tatili', 'Ücret & Vergi', 'SGK & Kesintiler'],
  company: ['Firma Bilgileri', 'Yedekleme & Sistem'],
};
const MODULE_DESCRIPTIONS: Record<string, string> = {
  stock: 'Ürün standartları, barkod kuralları ve stok tanımları.',
  order: 'Evrak serileri, vergi varsayılanları ve sevkiyat kuralları.',
  production: 'İş emirleri, kapasite ve üretim istasyonları.',
  finance: 'Tahsilat parametreleri ve muhasebe hesap bağlantıları.',
  hr: 'Çalışma takvimi, ücretler ve bordro hesaplama parametreleri.',
  users: 'Kullanıcılar, roller, erişim yetkileri ve denetim kayıtları.',
  company: 'Firma kimliği, belge antetleri ve sistem araçları.',
};

export default function SettingsHub() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedModule = searchParams.get('tab');
  const activeModule = SEARCH_INDEX.find(entry => entry.tabId === requestedModule) ?? SEARCH_INDEX[0];
  const activeTab = activeModule.tabId;
  const sectionIndex = activeModule.sections.findIndex((_, index) => searchParams.get('section') === String(index));
  const activeSection = sectionIndex < 0 ? 0 : sectionIndex;
  const [query, setQuery] = useState('');
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError(false);
    settingsService.getSystemSettings().then(data => {
      if (!cancelled) setSettings(data);
    }).catch(() => { if (!cancelled) setLoadError(true); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  const navigateModule = async (moduleId: string, section = 0) => {
    if (moduleId !== activeTab && dirty && !await confirmDialog('Kaydedilmemiş değişiklikleriniz var. Modül değiştirip bu değişiklikleri bırakmak istiyor musunuz?')) return;
    if (moduleId !== activeTab) setDirty(false);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('tab', moduleId);
      next.set('section', String(section));
      next.delete('userTab');
      return next;
    });
  };
  const selectSection = (key: string) => {
    const index = key.replace('settings-section-', '');
    setSearchParams(prev => { const next = new URLSearchParams(prev); next.set('section', index); return next; });
  };
  const handleSaveSettings = async (newSettings: AppSettings) => {
    const saved = await settingsService.updateSystemSettings(newSettings);
    setSettings(saved);
    setDirty(false);
  };
  const normalizedQuery = fold(query);
  const searchHits = useMemo(() => {
    if (!normalizedQuery) return [];
    return SEARCH_INDEX.flatMap(entry => {
      const moduleMatch = fold(`${entry.tabLabel} ${entry.keywords}`).includes(normalizedQuery);
      if (!entry.sections.length) return moduleMatch ? [{ module: entry, section: 0, label: entry.tabLabel }] : [];
      return entry.sections.flatMap((section, index) =>
        moduleMatch || fold(`${section.title} ${section.keywords}`).includes(normalizedQuery)
          ? [{ module: entry, section: index, label: SECTION_LABELS[entry.tabId][index] }] : []);
    });
  }, [normalizedQuery]);
  const Icon = MODULE_ICONS[activeTab];

  return (
    <div className="settings-workspace space-y-5 max-w-[1500px] mx-auto">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-brand"><SettingsIcon className="h-6 w-6" /></span>
          <div><h1 className="text-xl font-bold text-fg-strong">Ayarlar ve yapılandırma</h1><p className="text-xs text-fg-muted mt-1">Modülünüzü seçin, ilgili ayarları sekmelerden yönetin.</p></div>
        </div>
        <div className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" />
          <input aria-label="Tüm modül ayarlarında ara" value={query} onChange={event => setQuery(event.target.value)} placeholder="Tüm ayarlarda ara…" className="h-11 w-full rounded-xl border border-line bg-surface pl-10 pr-10 text-sm text-fg outline-none focus:ring-2 focus:ring-ring" />
          {query && <button type="button" aria-label="Aramayı temizle" onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-muted cursor-pointer"><X className="w-4 h-4" /></button>}
        </div>
      </div>
      {normalizedQuery && <section className="rounded-2xl border border-line bg-surface p-4" aria-label="Ayar arama sonuçları">
        <p role="status" className="text-xs text-fg-muted mb-3">{searchHits.length ? `${searchHits.length} bölüm bulundu` : 'Aramanızla eşleşen ayar bulunamadı.'}</p>
        <div className="flex flex-wrap gap-2">{searchHits.map(hit => <button type="button" key={`${hit.module.tabId}-${hit.section}`} onClick={() => { navigateModule(hit.module.tabId, hit.section); setQuery(''); }} className="rounded-xl border border-line px-3 py-2 text-xs text-fg hover:bg-brand-soft hover:border-brand cursor-pointer"><span className="font-semibold text-brand">{hit.module.tabLabel}</span> › {hit.label}</button>)}</div>
      </section>}
      <div className="grid grid-cols-1 lg:grid-cols-[245px_minmax(0,1fr)] gap-5 items-start">
        <nav aria-label="Yapılandırma modülleri" className="rounded-2xl border border-line bg-surface p-3 shadow-card lg:sticky lg:top-0">
          <p className="px-3 py-2 text-2xs font-semibold tracking-wider text-fg-muted">MODÜLLER</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-1 gap-1">
            {SEARCH_INDEX.map(entry => {
              const ModuleIcon = MODULE_ICONS[entry.tabId];
              const active = entry.tabId === activeTab;
              return <button key={entry.tabId} type="button" aria-current={active ? 'page' : undefined} onClick={() => navigateModule(entry.tabId)} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-left text-xs cursor-pointer transition-colors focus-visible:ring-2 focus-visible:ring-ring ${active ? 'bg-brand-soft text-brand-fg font-bold' : 'text-fg-muted hover:bg-surface-hover hover:text-fg'}`}><ModuleIcon className="w-[18px] h-[18px] shrink-0" /><span>{entry.tabLabel}</span></button>;
            })}
          </div>
        </nav>
        <div className="min-w-0 space-y-4">
          <div className="rounded-2xl border border-line bg-surface shadow-card overflow-hidden">
            <div className="flex items-start gap-3 p-5"><span className="p-2.5 rounded-xl bg-brand-soft text-brand"><Icon className="w-5 h-5" /></span><div><h2 className="text-lg font-bold text-fg-strong">{activeModule.tabLabel}</h2><p className="text-xs text-fg-muted mt-1">{MODULE_DESCRIPTIONS[activeTab]}</p></div></div>
            {activeModule.sections.length > 0 && <Tabs items={activeModule.sections.map((_, index) => ({ key: `settings-section-${index}`, label: SECTION_LABELS[activeTab][index] }))} value={`settings-section-${activeSection}`} onChange={selectSection} ariaLabel={`${activeModule.tabLabel} ayar bölümleri`} className="px-3" />}
          </div>
          {isLoading ? <div role="status" className="p-12 text-center text-fg-muted">Ayarlar yükleniyor…</div> : loadError || !settings ? <div role="alert" className="p-6 rounded-2xl border border-danger/30 bg-danger-soft text-danger"><p>Ayarlar yüklenemedi.</p><button type="button" onClick={() => setReloadKey(value => value + 1)} className="mt-3 underline cursor-pointer">Tekrar dene</button></div> :
            <SettingsTabContext.Provider value={{ titles: activeModule.sections.map(section => section.title), activeTitle: activeModule.sections[activeSection]?.title ?? '' }}>
              <div key={activeTab} onChangeCapture={() => setDirty(true)}>
                {activeTab === 'stock' && <StockSettings settings={settings} onSave={handleSaveSettings} />}
                {activeTab === 'order' && <OrderSettings settings={settings} onSave={handleSaveSettings} />}
                {activeTab === 'production' && <ProductionSettings settings={settings} onSave={handleSaveSettings} />}
                {activeTab === 'finance' && <FinanceSettings settings={settings} onSave={handleSaveSettings} />}
                {activeTab === 'hr' && <HRSettings settings={settings} onSave={handleSaveSettings} />}
                {activeTab === 'users' && <UsersManagement tabParam="userTab" />}
                {activeTab === 'company' && <CompanySettings settings={settings} onSave={handleSaveSettings} />}
              </div>
            </SettingsTabContext.Provider>}
        </div>
      </div>
    </div>
  );
}
