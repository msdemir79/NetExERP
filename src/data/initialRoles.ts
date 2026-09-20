import type { Role, RolePermissions, AppModule, ModulePermission } from '../types';

export const ALL_APP_MODULES: { id: AppModule; name: string; description: string; category: string }[] = [
  { id: 'dashboard', name: 'Yönetici Paneli', description: 'Genel durum, KPI kartları ve özet grafikler', category: 'Genel' },
  { id: 'inventory', name: 'Stok Yönetimi', description: 'Ürün kartları, hammadde, asorti ve depo hareketleri', category: 'Operasyon' },
  { id: 'orders', name: 'Sipariş Yönetimi', description: 'Müşteri ve satıcı siparişleri, onay süreçleri', category: 'Satış & Pazarlama' },
  { id: 'waybills', name: 'İrsaliyeler', description: 'Gelen ve giden sevk irsaliyeleri, mal kabul', category: 'Lojistik & Depo' },
  { id: 'invoices', name: 'Faturalar', description: 'e-Arşiv ve e-Fatura kesimi, alış faturaları', category: 'Finans & Muhasebe' },
  { id: 'finance', name: 'Finans & Kasa/Banka', description: 'Kasa, banka, çek/senet ve tahsilat makbuzları', category: 'Finans & Muhasebe' },
  { id: 'accounting', name: 'Genel Muhasebe', description: 'TDHP hesap planı, yevmiye fişleri, mizan ve kebir', category: 'Finans & Muhasebe' },
  { id: 'hr', name: 'İnsan Kaynakları (İK)', description: 'Personel özlük, puantaj, izin ve maaş bordrosu', category: 'İnsan Kaynakları' },
  { id: 'production', name: 'Üretim Planlama', description: 'İş emirleri, bant aşamaları, reçete ve kapasite', category: 'Üretim & İmalat' },
  { id: 'contacts', name: 'Cari Hesaplar', description: 'Müşteri ve tedarikçi kartları, bakiye ve ekstreler', category: 'Satış & Pazarlama' },
  { id: 'reports', name: 'Raporlar & Analiz', description: 'Envanter, hareket, İK ve finansal analiz raporları', category: 'Raporlama' },
  { id: 'users', name: 'Kullanıcılar & Yetkiler', description: 'Kullanıcı hesapları, roller ve erişim matrisi', category: 'Yönetim & Güvenlik' },
  { id: 'settings', name: 'Ayarlar & Yapılandırma', description: 'Sistem parametreleri, firma künyesi ve sayaçlar', category: 'Yönetim & Güvenlik' }
];

export const PERMISSION_ACTIONS: { id: keyof ModulePermission; label: string; shortLabel: string; description: string; color: string }[] = [
  { id: 'view', label: 'Görüntüleme', shortLabel: 'Gör', description: 'Modül sayfalarına ve listelere erişim', color: 'text-blue-600 bg-blue-50 border-blue-200' },
  { id: 'create', label: 'Yeni Kayıt', shortLabel: 'Ekle', description: 'Yeni kart, sipariş veya evrak oluşturma', color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  { id: 'edit', label: 'Düzenleme', shortLabel: 'Düzenle', description: 'Mevcut verileri değiştirme ve güncelleme', color: 'text-amber-600 bg-amber-50 border-amber-200' },
  { id: 'delete', label: 'Silme / İptal', shortLabel: 'Sil', description: 'Kayıtları silme veya iptale alma', color: 'text-rose-600 bg-rose-50 border-rose-200' },
  { id: 'export', label: 'Yazdırma & Dışa Aktarma', shortLabel: 'Yazdır', description: 'Excel/CSV indirme ve PDF/yazdırma', color: 'text-indigo-600 bg-indigo-50 border-indigo-200' },
  { id: 'approve', label: 'Özel Onay Yetkisi', shortLabel: 'Onay', description: 'Evrak, bordro ve üretim emri onaylama', color: 'text-purple-600 bg-purple-50 border-purple-200' }
];

export function createBlankPermissions(): RolePermissions {
  const perm: any = {};
  for (const mod of ALL_APP_MODULES) {
    perm[mod.id] = {
      view: false,
      create: false,
      edit: false,
      delete: false,
      export: false,
      approve: false
    };
  }
  return perm as RolePermissions;
}

export function createFullPermissions(): RolePermissions {
  const perm: any = {};
  for (const mod of ALL_APP_MODULES) {
    perm[mod.id] = {
      view: true,
      create: true,
      edit: true,
      delete: true,
      export: true,
      approve: true
    };
  }
  return perm as RolePermissions;
}

// Initial system roles definition
export const INITIAL_ROLES: Role[] = [
  {
    code: 'super_admin',
    name: 'Süper Admin / Sistem Yöneticisi',
    description: 'Tüm modüllere, sistem ayarlarına, onay süreçlerine ve yetkilendirmelere sınırsız tam erişim.',
    color: 'indigo',
    isSystem: true,
    permissions: createFullPermissions()
  },
  {
    code: 'sales_manager',
    name: 'Satış & Pazarlama Yöneticisi',
    description: 'Müşteri carileri, siparişler, satış faturaları ve irsaliyelerini yönetebilir, onaylayabilir.',
    color: 'emerald',
    isSystem: true,
    permissions: {
      ...createBlankPermissions(),
      dashboard: { view: true, create: false, edit: false, delete: false, export: true, approve: false },
      contacts: { view: true, create: true, edit: true, delete: false, export: true, approve: false },
      orders: { view: true, create: true, edit: true, delete: true, export: true, approve: true },
      waybills: { view: true, create: true, edit: true, delete: false, export: true, approve: true },
      invoices: { view: true, create: true, edit: true, delete: false, export: true, approve: true },
      finance: { view: true, create: false, edit: false, delete: false, export: true, approve: false },
      inventory: { view: true, create: false, edit: false, delete: false, export: true, approve: false },
      reports: { view: true, create: false, edit: false, delete: false, export: true, approve: false }
    }
  },
  {
    code: 'warehouse_keeper',
    name: 'Satın Alma & Depo Görevlisi',
    description: 'Stok kartları, hammadde ve aksesuarlar, irsaliyeler ve depo sevkiyat hareketlerini yönetir.',
    color: 'amber',
    isSystem: true,
    permissions: {
      ...createBlankPermissions(),
      dashboard: { view: true, create: false, edit: false, delete: false, export: false, approve: false },
      inventory: { view: true, create: true, edit: true, delete: false, export: true, approve: true },
      waybills: { view: true, create: true, edit: true, delete: false, export: true, approve: true },
      orders: { view: true, create: false, edit: false, delete: false, export: true, approve: false },
      production: { view: true, create: false, edit: false, delete: false, export: false, approve: false },
      contacts: { view: true, create: false, edit: false, delete: false, export: false, approve: false },
      reports: { view: true, create: false, edit: false, delete: false, export: true, approve: false }
    }
  },
  {
    code: 'production_manager',
    name: 'Üretim Planlama & İmalat Şefi',
    description: 'Model kartları, asorti reçeteleri, iş emirleri, kesim, saya, montaj aşamalarını kontrol eder.',
    color: 'violet',
    isSystem: true,
    permissions: {
      ...createBlankPermissions(),
      dashboard: { view: true, create: false, edit: false, delete: false, export: false, approve: false },
      production: { view: true, create: true, edit: true, delete: true, export: true, approve: true },
      inventory: { view: true, create: true, edit: true, delete: false, export: true, approve: false },
      orders: { view: true, create: false, edit: false, delete: false, export: true, approve: false },
      reports: { view: true, create: false, edit: false, delete: false, export: true, approve: false }
    }
  },
  {
    code: 'hr_manager',
    name: 'İnsan Kaynakları (İK) Sorumlusu',
    description: 'Personel özlük işleri, puantaj cetveli, izin talepleri ve aylık maaş bordrolarını yönetir.',
    color: 'rose',
    isSystem: true,
    permissions: {
      ...createBlankPermissions(),
      dashboard: { view: true, create: false, edit: false, delete: false, export: false, approve: false },
      hr: { view: true, create: true, edit: true, delete: true, export: true, approve: true },
      reports: { view: true, create: false, edit: false, delete: false, export: true, approve: false }
    }
  },
  {
    code: 'finance_manager',
    name: 'Mali İşler & Muhasebe Müdürü',
    description: 'Kasa, banka, çek/senet, yevmiye fişleri, mizan, kebir, faturalar ve tüm finansal işlemleri yönetir.',
    color: 'cyan',
    isSystem: true,
    permissions: {
      ...createBlankPermissions(),
      dashboard: { view: true, create: false, edit: false, delete: false, export: true, approve: false },
      finance: { view: true, create: true, edit: true, delete: true, export: true, approve: true },
      accounting: { view: true, create: true, edit: true, delete: true, export: true, approve: true },
      invoices: { view: true, create: true, edit: true, delete: true, export: true, approve: true },
      contacts: { view: true, create: true, edit: true, delete: false, export: true, approve: false },
      reports: { view: true, create: false, edit: false, delete: false, export: true, approve: false },
      orders: { view: true, create: false, edit: false, delete: false, export: true, approve: false },
      waybills: { view: true, create: false, edit: false, delete: false, export: true, approve: false }
    }
  },
  {
    code: 'auditor',
    name: 'Sadece Okuyucu (Denetçi / İzleyici)',
    description: 'Tüm sistem verilerini ve raporları inceleyebilir, dışa aktarabilir; değişiklik yapamaz veya silemez.',
    color: 'slate',
    isSystem: true,
    permissions: {
      dashboard: { view: true, create: false, edit: false, delete: false, export: true, approve: false },
      inventory: { view: true, create: false, edit: false, delete: false, export: true, approve: false },
      orders: { view: true, create: false, edit: false, delete: false, export: true, approve: false },
      waybills: { view: true, create: false, edit: false, delete: false, export: true, approve: false },
      invoices: { view: true, create: false, edit: false, delete: false, export: true, approve: false },
      finance: { view: true, create: false, edit: false, delete: false, export: true, approve: false },
      accounting: { view: true, create: false, edit: false, delete: false, export: true, approve: false },
      hr: { view: true, create: false, edit: false, delete: false, export: true, approve: false },
      production: { view: true, create: false, edit: false, delete: false, export: true, approve: false },
      contacts: { view: true, create: false, edit: false, delete: false, export: true, approve: false },
      reports: { view: true, create: false, edit: false, delete: false, export: true, approve: false },
      users: { view: true, create: false, edit: false, delete: false, export: true, approve: false },
      settings: { view: true, create: false, edit: false, delete: false, export: true, approve: false }
    }
  }
];
