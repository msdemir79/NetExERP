import React, { useState } from 'react';
import { Building2, Save, Check, Database, Download, Upload, AlertTriangle, RefreshCw, FileText, Image as ImageIcon, Trash2, UploadCloud, RotateCcw, CheckCircle2, X } from 'lucide-react';
import { api, commit, reseedDatabase, uploadImage, type Mutation } from '../../api/client';
import { invoiceService } from '../../services/invoiceService';
import { useAuth } from '../../context/AuthContext';
import Modal from '../Modal';
import { showToast, confirmDialog } from '../../lib/feedback';
import type { AppSettings, CompanySettings as CompanySettingsType } from '../../types';

interface CompanySettingsProps {
  settings: AppSettings;
  onSave: (newSettings: AppSettings) => Promise<void>;
}

export default function CompanySettings({ settings, onSave }: CompanySettingsProps) {
  // Yedekleme/geri yükleme ve sıfırlama işlemleri yıkıcıdır: yalnızca Süper Admin.
  const { isSuperAdmin } = useAuth();
  const [comp, setComp] = useState<CompanySettingsType>(settings.company || {
    companyName: 'ProERP Ayakkabı San. ve Tic. Ltd. Şti.',
    companyTitle: 'ProERP Ayakkabı İmalat Sanayi ve Ticaret Limited Şirketi',
    taxOffice: 'Güngören Vergi Dairesi',
    taxNumber: '7340981245',
    tradeRegistryNo: '458921-5',
    phone: '+90 212 555 44 33',
    email: 'info@proerp-shoes.com',
    website: 'https://proerp-shoes.com',
    address: 'Sanayi Cad. Ayakkabıcılar Sanayi Sitesi No: 42 Kat: 3 Güngören',
    city: 'İstanbul / TÜRKİYE',
    bankName: 'Garanti BBVA - Merter Kurumsal',
    iban: 'TR12 0006 2000 1234 5678 9012 34'
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isClearingMovements, setIsClearingMovements] = useState(false);

  // Modal states replacing blocked browser confirm()
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [isDemoConfirmOpen, setIsDemoConfirmOpen] = useState(false);
  const [feedbackNotice, setFeedbackNotice] = useState<{
    type: 'success' | 'error';
    title: string;
    message: string;
    details?: string[];
  } | null>(null);

  // Reset Movements Except Today's Orders
  const executeResetExceptToday = async () => {
    setIsClearingMovements(true);
    try {
      const res = await invoiceService.resetExceptTodayOrders({ clearWorkOrders: true });
      setIsResetConfirmOpen(false);
      setFeedbackNotice({
        type: 'success',
        title: 'Hareket Sıfırlama Başarılı!',
        message: 'Bugün girilen siparişler hariç tüm hareketler ve üretim planlama verileri temizlendi.',
        details: [
          `Korunan Bugün Siparişleri: ${res.keptOrdersCount} adet`,
          `Silinen Eski Siparişler: ${res.deletedOrdersCount} adet`,
          `Silinen Üretim İş Emirleri: ${res.deletedWorkOrdersCount} adet`,
          'Stok, Cari, TDHP Kartları ve Reçeteler eksiksiz korundu.'
        ]
      });
    } catch (err: any) {
      console.error('Sıfırlama hatası:', err);
      setFeedbackNotice({
        type: 'error',
        title: 'Sıfırlama Sırasında Sorun Oluştu',
        message: err?.message || 'İşlem tamamlanırken bir hata oluştu. Lütfen tekrar deneyiniz.'
      });
    } finally {
      setIsClearingMovements(false);
    }
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      showToast('Logo görsel boyutu maksimum 2MB olmalıdır.', 'warning');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      try {
        // Logo artık settings.company JSON içinde base64 tutulmaz; sunucuya
        // yüklenip URL saklanır (#51).
        const url = await uploadImage(base64);
        setComp(prev => ({ ...prev, logo: url }));
      } catch (err) {
        console.error('Logo yüklenemedi:', err);
        showToast('Logo yüklenirken bir hata oluştu.', 'error');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    setComp(prev => ({ ...prev, logo: undefined }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const updated: AppSettings = {
        ...settings,
        company: comp
      };
      await onSave(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Firma ayarları kaydedilemedi:', err);
      showToast('Firma bilgileri kaydedilirken hata oluştu.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Kayıtları JSON olarak dışa aktar (tam yedek değil: görsel/sayaç/audit yok).
  const handleExportBackup = async () => {
    setIsBackingUp(true);
    try {
      const dump = {
        exportedAt: new Date().toISOString(),
        version: '1.0',
        products: await api.products.list(),
        colors: await api.colors.list(),
        productColors: await api.productColors.list(),
        contacts: await api.contacts.list(),
        orders: await api.orders.list(),
        orderItems: await api.orderItems.list(),
        invoices: await api.invoices.list(),
        invoiceItems: await api.invoiceItems.list(),
        waybills: await api.waybills.list(),
        waybillItems: await api.waybillItems.list(),
        recipes: await api.recipes.list(),
        workOrders: await api.workOrders.list(),
        transactions: await api.transactions.list(),
        bankAccounts: await api.bankAccounts.list(),
        cashBoxes: await api.cashBoxes.list(),
        checks: await api.checks.list(),
        accounts: await api.accounts.list(),
        journalEntries: await api.journalEntries.list(),
        employees: await api.employees.list(),
        attendanceRecords: await api.attendanceRecords.list(),
        leaveRequests: await api.leaveRequests.list(),
        payrollRecords: await api.payrollRecords.list(),
        assortmentTemplates: await api.assortmentTemplates.list(),
        settings: await api.settings.list()
      };

      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ProERP_Backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Yedekleme hatası:', err);
      showToast('Veritabanı yedeği alınırken bir sorun oluştu.', 'error');
    } finally {
      setIsBackingUp(false);
    }
  };

  // JSON dosyasını içe aktar (tam sistem geri yükleme değil).
  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!(await confirmDialog('DİKKAT: JSON verilerini içe aktarmak mevcut kayıtların üzerine yazabilir (görseller, sayaçlar ve denetim izi dahil değildir). Devam etmek istiyor musunuz?', { tone: 'danger', confirmText: 'İçe Aktar' }))) {
      e.target.value = '';
      return;
    }

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      const mutations: Mutation[] = [];
      const pushRestore = (resource: string, rows: any[] | undefined) => {
        if (!rows) return;
        mutations.push({ op: 'clear', resource });
        if (rows.length) mutations.push({ op: 'insertMany', resource, rows });
      };
      // Renk kartları ürünlerden önce geri yüklenir: productColors bağı hem
      // products'a hem colors'a FK ile bağlıdır.
      pushRestore('colors', data.colors);
      pushRestore('products', data.products);
      pushRestore('productColors', data.productColors);
      pushRestore('contacts', data.contacts);
      pushRestore('orders', data.orders);
      pushRestore('orderItems', data.orderItems);
      pushRestore('invoices', data.invoices);
      pushRestore('invoiceItems', data.invoiceItems);
      pushRestore('waybills', data.waybills);
      pushRestore('waybillItems', data.waybillItems);
      pushRestore('recipes', data.recipes);
      pushRestore('workOrders', data.workOrders);
      pushRestore('transactions', data.transactions);
      pushRestore('bankAccounts', data.bankAccounts);
      pushRestore('cashBoxes', data.cashBoxes);
      pushRestore('checks', data.checks);
      pushRestore('accounts', data.accounts);
      pushRestore('journalEntries', data.journalEntries);
      pushRestore('employees', data.employees);
      pushRestore('attendanceRecords', data.attendanceRecords);
      pushRestore('leaveRequests', data.leaveRequests);
      pushRestore('payrollRecords', data.payrollRecords);
      pushRestore('assortmentTemplates', data.assortmentTemplates);
      pushRestore('settings', data.settings);

      await commit(mutations, { disableFkChecks: true });

      showToast('JSON verileri içe aktarıldı! Sayfa yenilenecek.', 'success');
      window.location.reload();
    } catch (err) {
      console.error('Geri yükleme hatası:', err);
      showToast('Yedek dosyası okunamadı veya biçimi geçersiz.', 'error');
    } finally {
      e.target.value = '';
    }
  };

  // Re-seed Database with demo data
  const executeResetToDemo = async () => {
    setIsResetting(true);
    try {
      await reseedDatabase();
      setIsDemoConfirmOpen(false);
      setFeedbackNotice({
        type: 'success',
        title: 'Demo Verileri Yüklendi!',
        message: 'Tüm sistem varsayılan zengin ayakkabı demo verileriyle yenilendi.'
      });
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err: any) {
      console.error('Sıfırlama hatası:', err);
      setFeedbackNotice({
        type: 'error',
        title: 'Demo Yükleme Hatası',
        message: err?.message || 'Demo verileri yüklenirken bir hata oluştu.'
      });
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Feedback Notice Banner */}
      {feedbackNotice && (
        <div className={`p-4 rounded-xl border flex items-start justify-between shadow-xs ${
          feedbackNotice.type === 'success'
            ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
            : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200'
        }`}>
          <div className="flex items-start gap-3">
            {feedbackNotice.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 mt-0.5 shrink-0" />
            )}
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider">{feedbackNotice.title}</h4>
              <p className="text-xs mt-0.5 opacity-90">{feedbackNotice.message}</p>
              {feedbackNotice.details && (
                <ul className="mt-2 space-y-1 text-[11px] list-disc list-inside opacity-85">
                  {feedbackNotice.details.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackNotice(null)}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {saveSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <Check className="w-5 h-5 text-emerald-600" />
            <span className="text-xs font-bold uppercase tracking-wider">Firma künye ve antet bilgileri başarıyla kaydedildi.</span>
          </div>
        </div>
      )}

      {/* SECTION 1: FİRMA KİMLİK VE ANTET BİLGİLERİ */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-md">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold uppercase tracking-wider">Firma Künyesi & İrsaliye/Fatura Anteti</h3>
              <p className="text-slate-400 text-xs font-medium">Resmi fatura, sevk irsaliyesi ve sipariş çıktılarında basılacak bilgiler</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* LOGO YÜKLEME ALANI */}
          <div className="bg-slate-50 dark:bg-slate-800/50/80 p-4 rounded-xl border border-slate-200 dark:border-slate-700/80 dark:border-slate-800/80 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                  <ImageIcon className="w-4 h-4 text-indigo-600" />
                  Firma Logosu
                </label>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-normal mt-0.5">
                  Eklenen logo yan menüde (panelde) ve tüm sayfa başlıklarında gösterilir. (PNG, JPG, SVG - max 2MB)
                </p>
              </div>
              {comp.logo && (
                <button
                  type="button"
                  onClick={handleRemoveLogo}
                  className="px-2.5 py-1 text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg border border-rose-200 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Logoyu Kaldır
                </button>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-4 pt-1">
              {comp.logo ? (
                <div className="relative group shrink-0">
                  <div className="w-24 h-24 rounded-2xl bg-white dark:bg-slate-900 border-2 border-indigo-200 p-2 shadow-xs flex items-center justify-center overflow-hidden">
                    <img src={comp.logo} alt="Firma Logosu" className="max-w-full max-h-full object-contain" />
                  </div>
                  <div className="mt-1 text-center">
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      Aktif Logo
                    </span>
                  </div>
                </div>
              ) : (
                <div className="w-24 h-24 rounded-2xl bg-slate-100 dark:bg-slate-800 border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 shrink-0">
                  <ImageIcon className="w-8 h-8 stroke-1" />
                  <span className="text-[10px] font-medium mt-1">Logo Yok</span>
                </div>
              )}

              <div className="flex-1 space-y-2 w-full">
                <label className="flex flex-col items-center justify-center px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition-all shadow-2xs group text-center">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200 group-hover:text-indigo-600">
                    <UploadCloud className="w-4 h-4 text-indigo-600" />
                    <span>{comp.logo ? 'Logoyu Değiştir' : 'Yeni Logo Görseli Yükle'}</span>
                  </div>
                  <span className="text-[10px] text-slate-400 mt-0.5">Görsel dosyası seçmek için tıklayın</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoChange}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Firma Kısa Adı (Ticari Marka)</label>
              <input
                type="text"
                required
                value={comp.companyName || ''}
                onChange={e => setComp({ ...comp, companyName: e.target.value })}
                className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Resmi Ticari Ünvan</label>
              <input
                type="text"
                required
                value={comp.companyTitle || ''}
                onChange={e => setComp({ ...comp, companyTitle: e.target.value })}
                className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Vergi Dairesi</label>
              <input
                type="text"
                value={comp.taxOffice || ''}
                onChange={e => setComp({ ...comp, taxOffice: e.target.value })}
                className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Vergi Kimlik Numarası (VKN)</label>
              <input
                type="text"
                value={comp.taxNumber || ''}
                onChange={e => setComp({ ...comp, taxNumber: e.target.value })}
                className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Telefon</label>
              <input
                type="text"
                value={comp.phone || ''}
                onChange={e => setComp({ ...comp, phone: e.target.value })}
                className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">E-Posta</label>
              <input
                type="email"
                value={comp.email || ''}
                onChange={e => setComp({ ...comp, email: e.target.value })}
                className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            <div className="md:col-span-2 space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Firma Adresi</label>
              <textarea
                rows={2}
                value={comp.address || ''}
                onChange={e => setComp({ ...comp, address: e.target.value })}
                className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Banka & Şube</label>
              <input
                type="text"
                value={comp.bankName || ''}
                onChange={e => setComp({ ...comp, bankName: e.target.value })}
                placeholder="Örn: Garanti BBVA Merter"
                className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">IBAN Numarası</label>
              <input
                type="text"
                value={comp.iban || ''}
                onChange={e => setComp({ ...comp, iban: e.target.value })}
                placeholder="TRXX 0000 0000 0000 0000 00"
                className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-sm flex items-center gap-2 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Kaydediliyor...' : 'Firma Bilgilerini Kaydet'}
            </button>
          </div>
        </form>
      </div>

      {/* SECTION 2: VERİTABANI YÖNETİMİ, YEDEKLEME VE SIFIRLAMA */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-700 rounded-xl flex items-center justify-center text-white shadow-md">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold uppercase tracking-wider">Veritabanı Yedekleme & Sistem Araçları</h3>
              <p className="text-slate-400 text-xs font-medium">JSON veri dışa/içe aktarma, hareket ve demo sıfırlama. Tam sistem yedeği (SQL + görseller) sunucu tarafında <code className="text-slate-300">npm run db:backup</code> ile alınır.</p>
            </div>
          </div>
        </div>

        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {/* Reset Movements Except Today's Orders */}
          <div className="bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50 rounded-xl p-5 flex flex-col justify-between space-y-4">
            <div className="space-y-2">
              <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400 flex items-center justify-center">
                <RotateCcw className="w-4 h-4" />
              </div>
              <h4 className="text-xs font-black text-amber-900 dark:text-amber-200 uppercase tracking-wider">Hareketleri Sıfırla</h4>
              <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80">Bugün girilen siparişler hariç; stok, cari, finans, TDHP ve üretim hareketlerini temizler. Kartlar korunur.</p>
              {!isSuperAdmin && (
                <p className="text-[10px] font-bold text-rose-600 dark:text-rose-400">Bu işlem yalnızca Süper Admin yetkisindedir.</p>
              )}
            </div>

            <button
              type="button"
              onClick={() => setIsResetConfirmOpen(true)}
              disabled={!isSuperAdmin || isClearingMovements}
              title={isSuperAdmin ? undefined : 'Bu işlem yalnızca Süper Admin yetkisindedir'}
              className="w-full bg-amber-600 hover:bg-amber-700 text-white py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              <RotateCcw className={`w-4 h-4 ${isClearingMovements ? 'animate-spin' : ''}`} />
              {isClearingMovements ? 'Temizleniyor...' : 'Hareketleri Sıfırla'}
            </button>
          </div>

          {/* Backup */}
          <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-5 flex flex-col justify-between space-y-4">
            <div className="space-y-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <Download className="w-4 h-4" />
              </div>
              <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider">Veri Dışa Aktarma (JSON)</h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Stoklar, siparişler, irsaliyeler, cariler ve ayarları tek bir JSON dosyasında indirir. <strong className="text-slate-600 dark:text-slate-300">Tam yedek DEĞİLDİR:</strong> görselleri (uploads), sayaçları ve denetim izini içermez. Taşınabilir tam yedek için sunucuda <code>npm run db:backup</code>.</p>
              {!isSuperAdmin && (
                <p className="text-[10px] font-bold text-rose-600 dark:text-rose-400">Tüm modülleri okuma yetkisi gerektirir (Süper Admin).</p>
              )}
            </div>

            <button
              type="button"
              onClick={handleExportBackup}
              disabled={!isSuperAdmin || isBackingUp}
              title={isSuperAdmin ? undefined : 'Bu işlem yalnızca Süper Admin yetkisindedir'}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              <Download className="w-4 h-4" />
              {isBackingUp ? 'İndiriliyor...' : 'Verileri Dışa Aktar (JSON)'}
            </button>
          </div>

          {/* Restore */}
          <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-5 flex flex-col justify-between space-y-4">
            <div className="space-y-2">
              <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center">
                <Upload className="w-4 h-4" />
              </div>
              <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider">JSON Verileri İçe Aktar</h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Daha önce dışa aktardığınız bir JSON dosyasını yükleyerek kayıtları yeniler. <strong className="text-slate-600 dark:text-slate-300">Tam sistem geri yükleme DEĞİLDİR</strong> (görseller/sayaçlar/denetim izi dönmez); tam yedekten dönüş için sunucuda <code>npm run db:restore</code>.</p>
              {!isSuperAdmin && (
                <p className="text-[10px] font-bold text-rose-600 dark:text-rose-400">Bu işlem yalnızca Süper Admin yetkisindedir.</p>
              )}
            </div>

            <label className={`w-full text-white py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-colors flex items-center justify-center gap-2 shadow-xs ${isSuperAdmin ? 'bg-sky-600 hover:bg-sky-700 cursor-pointer' : 'bg-slate-400 cursor-not-allowed'}`}>
              <Upload className="w-4 h-4" />
              JSON Dosyası Seç
              <input
                type="file"
                accept=".json"
                onChange={handleImportBackup}
                disabled={!isSuperAdmin}
                className="hidden"
              />
            </label>
          </div>

          {/* Reset Demo */}
          <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-5 flex flex-col justify-between space-y-4">
            <div className="space-y-2">
              <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center">
                <RefreshCw className="w-4 h-4" />
              </div>
              <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider">Fabrika / Demo Verisi</h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Tüm tabloları sıfırlar ve zengin ayakkabı imalat demo verilerini (ürünler, reçeteler, cariler) tekrar yükler.</p>
              {!isSuperAdmin && (
                <p className="text-[10px] font-bold text-rose-600 dark:text-rose-400">Bu işlem yalnızca Süper Admin yetkisindedir.</p>
              )}
            </div>

            <button
              type="button"
              onClick={() => setIsDemoConfirmOpen(true)}
              disabled={!isSuperAdmin || isResetting}
              title={isSuperAdmin ? undefined : 'Bu işlem yalnızca Süper Admin yetkisindedir'}
              className="w-full bg-slate-900 hover:bg-rose-600 text-white py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              <RefreshCw className={`w-4 h-4 ${isResetting ? 'animate-spin' : ''}`} />
              {isResetting ? 'Yükleniyor...' : 'Demo Verilerini Yükle'}
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation Modal: Reset Movements */}
      <Modal
        isOpen={isResetConfirmOpen}
        onClose={() => setIsResetConfirmOpen(false)}
        title="Hareketleri Sıfırla (Kartlar Dursun)"
        size="lg"
      >
        <div className="p-6 space-y-5">
          <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-xl p-4 text-amber-900 dark:text-amber-200">
            <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <p className="font-bold text-sm">Bu işlem geri alınamaz!</p>
              <p>Bugün girilen siparişler haricindeki tüm geçmiş işlem ve hareket kayıtları temizlenecektir.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/50 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center gap-1.5 font-bold text-emerald-800 dark:text-emerald-300">
                <Check className="w-4 h-4 text-emerald-600" />
                <span>KORUNACAK KARTLAR</span>
              </div>
              <ul className="space-y-1 text-slate-700 dark:text-slate-300 list-disc list-inside text-[11px]">
                <li>Stok & Hammadde Kartları (Bakiye sıfırlanır)</li>
                <li>Cari Hesap Kartları (Müşteri & Tedarikçi)</li>
                <li>TDHP Hesap Planı Kartları</li>
                <li>Ürün Reçeteleri (BOM) & Şablonlar</li>
                <li>Personel & Kullanıcı Kartları</li>
                <li><strong>Bugün girilen siparişler</strong> ve kalemleri</li>
              </ul>
            </div>

            <div className="bg-rose-50/70 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/50 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center gap-1.5 font-bold text-rose-800 dark:text-rose-300">
                <Trash2 className="w-4 h-4 text-rose-600" />
                <span>TEMİZLENECEK HAREKETLER</span>
              </div>
              <ul className="space-y-1 text-slate-700 dark:text-slate-300 list-disc list-inside text-[11px]">
                <li>Eski siparişler ve geçmiş sipariş kayıtları</li>
                <li>Stok giriş / çıkış / transfer hareket logları</li>
                <li>Üretim iş emirleri (sıfırdan başlama)</li>
                <li>Satış ve alış faturaları & irsaliyeler</li>
                <li>Kasa, banka, çek ve tahsilat hareketleri</li>
                <li>TDHP Yevmiye defteri kayıtları</li>
              </ul>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setIsResetConfirmOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
            >
              Vazgeç
            </button>
            <button
              type="button"
              onClick={executeResetExceptToday}
              disabled={isClearingMovements}
              className="px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl transition-colors flex items-center gap-2 cursor-pointer shadow-xs"
            >
              <RotateCcw className={`w-4 h-4 ${isClearingMovements ? 'animate-spin' : ''}`} />
              {isClearingMovements ? 'Sıfırlanıyor...' : 'Evet, Hareketleri Sıfırla'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Confirmation Modal: Demo Data Reset */}
      <Modal
        isOpen={isDemoConfirmOpen}
        onClose={() => setIsDemoConfirmOpen(false)}
        title="Fabrika / Demo Verilerine Sıfırla"
        size="md"
      >
        <div className="p-6 space-y-4">
          <div className="flex items-start gap-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/50 rounded-xl p-4 text-rose-900 dark:text-rose-200">
            <AlertTriangle className="w-6 h-6 text-rose-600 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <p className="font-bold text-sm">Tüm Veriler Silinecektir!</p>
              <p>Mevcut tüm tablolar sıfırlanacak ve hazır ayakkabı imalat demo verileri yüklenecektir. Bu işlem geri alınamaz.</p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setIsDemoConfirmOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
            >
              Vazgeç
            </button>
            <button
              type="button"
              onClick={executeResetToDemo}
              disabled={isResetting}
              className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors flex items-center gap-2 cursor-pointer shadow-xs"
            >
              <RefreshCw className={`w-4 h-4 ${isResetting ? 'animate-spin' : ''}`} />
              {isResetting ? 'Yükleniyor...' : 'Evet, Demo Verisi Yükle'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
