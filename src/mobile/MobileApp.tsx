import { useEffect, useState } from 'react';
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
  const [tab, setTab] = useState<MobileTab>('summary');
  const [scannerOpen, setScannerOpen] = useState(false);
  const { logout } = useAuth();
  const { actualTheme } = useTheme();

  const handleHeaderScan = async () => {
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
    if (tab === 'summary') return;
    return registerBackButtonHandler(() => {
      setTab('summary');
      return true;
    });
  }, [tab]);

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
        onTab={setTab}
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
        {tab === 'summary' && <MobileDashboard />}
        {tab === 'contacts' && <MobileContacts />}
        {tab === 'inventory' && <MobileInventory />}
        {tab === 'orders' && <MobileOrders />}
        {tab === 'production' && <MobileProduction />}
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
