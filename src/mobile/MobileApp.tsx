import { lazy, Suspense, useEffect, useState } from 'react';
import { LogOut, ScanBarcode } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import MobileShell, { type MobileTab } from './MobileShell';
import MobileDashboard from './MobileDashboard';
import MobileContacts from './MobileContacts';
import MobileInventory from './MobileInventory';
import MobileOrders from './MobileOrders';
import MobileProduction from './MobileProduction';
import CameraBarcodeScannerModal from '../components/Common/CameraBarcodeScannerModal';
import Button from '../components/Common/Button';
const OperationsHub = lazy(() => import('../components/OperationsHub'));
import {
  initNativeBridge,
  updateNativeStatusBar,
  registerBackButtonHandler,
  isNativeApp,
  scanBarcodeNative,
} from './nativeBridge';

const TITLES: Record<MobileTab, string> = {
  summary: 'ProERP Özet',
  contacts: 'Cari Hesaplar',
  inventory: 'Stok Durumu',
  orders: 'Siparişler',
  production: 'Üretim Planlama',
};

/**
 * Mobil uygulama kökü: alt-sekme ile ekranlar arasında geçiş yapar.
 * Masaüstü Layout/Router'dan tamamen ayrıdır; AuthGate oturum yoksa giriş ekranını gösterir.
 */
export default function MobileApp() {
  const [tab, setTab] = useState<MobileTab>(() => window.location.pathname.startsWith('/production/workflows') ? 'production' : window.location.pathname.startsWith('/orders/workflows') ? 'orders' : window.location.pathname.startsWith('/inventory/workflows') ? 'inventory' : 'summary');
  const [operationsOpen, setOperationsOpen] = useState(window.location.pathname.endsWith('/workflows'));
  const [scannerOpen, setScannerOpen] = useState(false);
  const { logout, hasPermission } = useAuth();
  const { actualTheme } = useTheme();

  const handleHeaderScan = async () => {
    setOperationsOpen(false);
    if (isNativeApp()) {
      const code = await scanBarcodeNative();
      if (code) {
        if (code.startsWith('WO-')) {
          setTab('production');
        } else {
          setTab('inventory');
        }
      }
      return;
    }
    setScannerOpen(true);
  };

  // Android geri tuşu: özet sekmesinde değilsek önce özete dön
  useEffect(() => {
    if (tab === 'summary' && !operationsOpen) return;
    return registerBackButtonHandler(() => {
      if (operationsOpen) { setOperationsOpen(false); return true; }
      setTab('summary');
      return true;
    });
  }, [tab, operationsOpen]);

  // Durum çubuğunu (StatusBar) aktif tema ile eşle
  useEffect(() => {
    void updateNativeStatusBar(actualTheme === 'dark');
  }, [actualTheme]);

  // Mobil köprü başlat (Splash ekranını kapat, durum çubuğunu ayarla, geri tuşunu dinle)
  useEffect(() => {
    void initNativeBridge({
      isDark: actualTheme === 'dark',
      onDefaultBack: () => {
        if (tab !== 'summary') {
          setTab('summary');
          return true;
        }
        return false;
      },
    });
  }, []);

  return (
    <>
      <MobileShell
        title={TITLES[tab]}
        active={tab}
        onTab={next => { setOperationsOpen(false); setTab(next); }}
        right={
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleHeaderScan}
              title="Kamera Barkod Okuyucu"
              aria-label="Kamera barkod okuyucu aç"
              className="rounded-lg p-2 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50"
            >
              <ScanBarcode className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => void logout()}
              title="Çıkış"
              aria-label="Çıkış yap"
              className="rounded-lg p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        }
      >
        {(['inventory', 'orders', 'production'] as string[]).includes(tab) && hasPermission(tab as 'inventory' | 'orders' | 'production', 'view') && <Button className="w-full" onClick={() => setOperationsOpen(value => !value)}>{operationsOpen ? 'Modüle geri dön' : tab === 'inventory' ? 'Stok rezervasyonları' : tab === 'orders' ? 'Satın alma talepleri' : 'Kalite kontrolleri'}</Button>}
        {operationsOpen ? <Suspense fallback={<p role="status">Operasyonlar yükleniyor…</p>}><OperationsHub key={tab} initialTab={tab === 'production' ? 'quality' : tab === 'orders' ? 'purchasing' : 'reservations'} /></Suspense> : <>
          {tab === 'summary' && <MobileDashboard />}
          {tab === 'contacts' && <MobileContacts />}
          {tab === 'inventory' && <MobileInventory />}
          {tab === 'orders' && <MobileOrders />}
          {tab === 'production' && <MobileProduction />}
        </>}
      </MobileShell>

      {scannerOpen && (
        <CameraBarcodeScannerModal
          isOpen={scannerOpen}
          onClose={() => setScannerOpen(false)}
          onProductScanned={(p) => {
            setScannerOpen(false);
            setTab('inventory');
          }}
          onWorkOrderFound={(wo) => {
            setScannerOpen(false);
            setTab('production');
          }}
        />
      )}
    </>
  );
}
