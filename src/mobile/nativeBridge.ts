import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { BarcodeScanner, BarcodeFormat } from '@capacitor-mlkit/barcode-scanning';
import { showToast } from '../lib/feedback';

let lastBackPressTime = 0;
let backButtonListenerAttached = false;
type BackHandler = () => boolean; // return true if handled
const backHandlers: BackHandler[] = [];

/** Check if running inside Capacitor native container (Android / iOS) */
export function isNativeApp(): boolean {
  return typeof window !== 'undefined' && Capacitor.isNativePlatform();
}

/**
 * Scans a barcode using Google ML Kit native camera (works offline, no WebRTC/HTTPS requirements).
 * Returns scanned string or null if cancelled / failed.
 */
export async function scanBarcodeNative(): Promise<string | null> {
  if (!isNativeApp()) return null;

  try {
    // 1. Request camera permission from Capacitor plugin if needed
    const perm = await BarcodeScanner.checkPermissions();
    if (perm.camera !== 'granted') {
      const requestRes = await BarcodeScanner.requestPermissions();
      if (requestRes.camera !== 'granted') {
        showToast('Kamera izni verilmedi.', 'warning');
        return null;
      }
    }

    // 2. Check / install Google Barcode Scanner Module if on Android
    try {
      const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
      if (!available) {
        showToast('Barkod tarayıcı modülü hazırlanıyor...', 'info');
        await BarcodeScanner.installGoogleBarcodeScannerModule();
      }
    } catch {
      // benign check on non-play services
    }

    // 3. Scan barcode using Google's native scanner UI
    const result = await BarcodeScanner.scan({
      formats: [
        BarcodeFormat.QrCode,
        BarcodeFormat.Ean13,
        BarcodeFormat.Ean8,
        BarcodeFormat.Code128,
        BarcodeFormat.Code39,
        BarcodeFormat.Code93,
        BarcodeFormat.Codabar,
        BarcodeFormat.DataMatrix,
        BarcodeFormat.UpcA,
        BarcodeFormat.UpcE,
      ],
    });

    if (result.barcodes && result.barcodes.length > 0) {
      const code = result.barcodes[0].displayValue || result.barcodes[0].rawValue;
      if (code && code.trim()) {
        return code.trim();
      }
    }
  } catch (err: any) {
    console.warn('Native barcode scan error:', err);
    // User cancelled or back pressed
    if (
      err?.message?.includes('canceled') ||
      err?.message?.includes('cancelled') ||
      err?.message?.includes('closed')
    ) {
      return null;
    }
    showToast(`Tarama hatası: ${err?.message || 'Bilinmeyen hata'}`, 'error');
  }

  return null;
}

/** Register a back button interceptor (e.g. for modals or sub-sheets). Returns unregister function. */
export function registerBackButtonHandler(handler: BackHandler): () => void {
  backHandlers.push(handler);
  return () => {
    const idx = backHandlers.indexOf(handler);
    if (idx !== -1) backHandlers.splice(idx, 1);
  };
}

/** Updates status bar color & icons according to active theme */
export async function updateNativeStatusBar(isDark: boolean): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light });
    await StatusBar.setBackgroundColor({ color: isDark ? '#0f172a' : '#ffffff' });
  } catch (err) {
    console.warn('StatusBar update error:', err);
  }
}

/** Initializes native features: Splash screen hide, Status bar setup, Android Back button listener */
export async function initNativeBridge(options?: {
  isDark?: boolean;
  onDefaultBack?: () => boolean; // return true if handled (e.g. switch to home tab)
}): Promise<() => void> {
  if (!isNativeApp()) return () => {};

  try {
    // 1. Hide splash screen smoothly
    await SplashScreen.hide();
  } catch (err) {
    console.warn('SplashScreen.hide error:', err);
  }

  try {
    // 2. Set initial status bar
    const isDark = options?.isDark ?? false;
    await updateNativeStatusBar(isDark);
    await StatusBar.setOverlaysWebView({ overlay: false });
  } catch (err) {
    console.warn('StatusBar.init error:', err);
  }

  // 3. Android Back Button handling
  if (!backButtonListenerAttached) {
    backButtonListenerAttached = true;
    App.addListener('backButton', () => {
      // Check custom modal / sheet handlers first (LIFO order)
      for (let i = backHandlers.length - 1; i >= 0; i--) {
        const handled = backHandlers[i]();
        if (handled) return;
      }

      // Check default fallback (e.g. switch to summary tab)
      if (options?.onDefaultBack && options.onDefaultBack()) {
        return;
      }

      // If at root: double-tap to exit
      const now = Date.now();
      if (now - lastBackPressTime < 2000) {
        App.exitApp();
      } else {
        lastBackPressTime = now;
        showToast('Çıkmak için tekrar geri tuşuna basın', 'info');
      }
    });
  }

  return () => {};
}
