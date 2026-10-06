import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { settingsService } from '../../services/settingsService';
import { 
  Settings as SettingsIcon, 
  Package, 
  ShoppingCart, 
  Hammer, 
  Landmark, 
  UserCheck, 
  Building2, 
  Sliders, 
  Save, 
  Check, 
  Boxes, 
  Barcode, 
  Truck, 
  Receipt,
  RotateCcw,
  RefreshCw
} from 'lucide-react';
import StockSettings from './StockSettings';
import OrderSettings from './OrderSettings';
import ProductionSettings from './ProductionSettings';
import FinanceSettings from './FinanceSettings';
import HRSettings from './HRSettings';
import CompanySettings from './CompanySettings';
import UpdateSettings from './UpdateSettings';
import UsersManagement from '../Users';
import PageHeader from '../PageHeader';
import type { AppSettings } from '../../types';
import { ShieldCheck } from 'lucide-react';

export default function SettingsHub() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTabParam = searchParams.get('tab') || 'stock';
  const [activeTab, setActiveTab] = useState(activeTabParam);

  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Sync tab with URL search parameter
  useEffect(() => {
    if (activeTabParam && activeTabParam !== activeTab) {
      setActiveTab(activeTabParam);
    }
  }, [activeTabParam]);

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    setSearchParams({ tab: tabId });
  };

  // Load system settings
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const data = await settingsService.getSystemSettings();
        setSettings(data);
      } catch (err) {
        console.error('Ayarlar yüklenirken hata:', err);
      } finally {
        setIsLoading(false);
      }
    };
    loadSettings();
  }, []);

  const handleSaveSettings = async (newSettings: AppSettings) => {
    await settingsService.updateSystemSettings(newSettings);
    setSettings(newSettings);
  };

  const TABS = [
    {
      id: 'stock',
      label: 'Stok Modülü Ayarları',
      shortLabel: 'Stok & Barkod',
      icon: Package,
      badge: 'Asorti, Barkod & Renk',
      description: 'Asorti şablonları, barkod standardı, sayaç ve numara serileri, merkezi renk kartları'
    },
    {
      id: 'order',
      label: 'Sipariş & Sevkiyat Ayarları',
      shortLabel: 'Sipariş & Lojistik',
      icon: ShoppingCart,
      badge: 'Evrak & KDV',
      description: 'Sipariş/irsaliye/fatura seri önekleri, KDV ve otomatik iş emri kuralları'
    },
    {
      id: 'production',
      label: 'Üretim & İmalat Ayarları',
      shortLabel: 'Üretim Planlama',
      icon: Hammer,
      badge: 'Bant & Fire',
      description: 'Bant kapasitesi, fire toleransı, iş emri kuralları ve aşamalar'
    },
    {
      id: 'finance',
      label: 'Finans & Muhasebe Ayarları',
      shortLabel: 'Finans & TDHP',
      icon: Landmark,
      badge: 'TDHP & Çek',
      description: 'TDHP hesap kodları haritası, çek vade alarmları ve para birimleri'
    },
    {
      id: 'hr',
      label: 'İK & Bordro Parametreleri',
      shortLabel: 'İK & Bordro',
      icon: UserCheck,
      badge: 'Yasal Kesintiler',
      description: 'Çalışma saatleri, fazla mesai katsayıları, SGK ve vergi oranları'
    },
    {
      id: 'users',
      label: 'Kullanıcı & Yetki Yönetimi',
      shortLabel: 'Kullanıcı & RBAC',
      icon: ShieldCheck,
      badge: 'Yetki & Denetim',
      description: 'Kullanıcı hesapları, rol yetki matrisi ve işlem denetim izi'
    },
    {
      id: 'company',
      label: 'Firma & Sistem Araçları',
      shortLabel: 'Firma & Yedekleme',
      icon: Building2,
      badge: 'Yedek & Antet',
      description: 'Firma künyesi, veritabanı JSON yedeği ve demo veri araçları'
    },
    {
      id: 'system',
      label: 'Sistem & Güncellemeler',
      shortLabel: 'Sistem & Güncelleme',
      icon: RefreshCw,
      badge: 'Sürüm & Update',
      description: 'Uygulama sürümü, otomatik güncelleme denetimi ve sistem bilgileri'
    }
  ];

  if (isLoading || !settings) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">Sistem Ayarları Yükleniyor...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* PAGE HEADER */}
      <PageHeader
        title="Sistem & Modül Ayarları"
        subtitle="Tüm operasyonel modüllerin parametrelerini, şablonlarını ve kurallarını tek bir merkezden yönetin"
        badge="Sistem Yapılandırması"
        icon={SettingsIcon}
        iconColor="indigo"
        actions={
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 bg-slate-50 dark:bg-slate-800/50 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Veritabanı Aktif</span>
          </div>
        }
      />

      {/* MODULE TABS NAVIGATION */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 bg-slate-100 dark:bg-slate-800/80 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-700">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`p-3 rounded-xl text-left transition-all flex flex-col justify-between gap-2 cursor-pointer ${
                isActive
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm border border-slate-200 dark:border-slate-700 ring-2 ring-indigo-500/20'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-100 hover:bg-white dark:bg-slate-900/60'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className={`p-2 rounded-lg ${isActive ? 'bg-indigo-600 text-white' : 'bg-slate-200/80 text-slate-600'}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${
                  isActive ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-slate-200 text-slate-600'
                }`}>
                  {tab.badge}
                </span>
              </div>
              <div>
                <div className="text-xs font-black tracking-tight leading-tight">{tab.shortLabel}</div>
                <div className="text-[10px] text-slate-400 font-medium truncate mt-0.5 hidden sm:block">{tab.description}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* ACTIVE TAB CONTENT */}
      <div className="transition-all">
        {activeTab === 'stock' && <StockSettings settings={settings} onSave={handleSaveSettings} />}
        {activeTab === 'order' && <OrderSettings settings={settings} onSave={handleSaveSettings} />}
        {activeTab === 'production' && <ProductionSettings settings={settings} onSave={handleSaveSettings} />}
        {activeTab === 'finance' && <FinanceSettings settings={settings} onSave={handleSaveSettings} />}
        {activeTab === 'hr' && <HRSettings settings={settings} onSave={handleSaveSettings} />}
        {activeTab === 'users' && <UsersManagement />}
        {activeTab === 'company' && <CompanySettings settings={settings} onSave={handleSaveSettings} />}
        {activeTab === 'system' && <UpdateSettings />}
      </div>
    </div>
  );
}
