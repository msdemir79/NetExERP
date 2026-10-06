/**
 * Electron masaüstü köprüsü (electron/preload.cjs) tip tanımları.
 * Bu API yalnız ProERP masaüstü paketinde bulunur; tarayıcıda
 * window.proerpApp tanımlı değildir (opsiyonel erişim).
 */

export interface DesktopVersionInfo {
  version: string;
  productName: string;
  electron: string;
  node: string;
  platform: string;
  updatesEnabled: boolean;
}

export type DesktopUpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export interface DesktopUpdateState {
  status: DesktopUpdateStatus;
  version?: string;
  releaseNotes?: string;
  releaseDate?: string;
  percent?: number;
  transferred?: number;
  total?: number;
  bytesPerSecond?: number;
  message?: string;
  at?: string;
}

export interface ProerpDesktopBridge {
  getStatus(): Promise<{ error: unknown; backendUrl: string; version: string; logsDir: string }>;
  retry(): Promise<{ ok: boolean }>;
  openSettings(): Promise<{ ok: boolean }>;
  openLogs(): Promise<{ ok: boolean }>;
  getVersion(): Promise<DesktopVersionInfo>;
  getUpdateState(): Promise<DesktopUpdateState>;
  checkForUpdates(): Promise<{ ok: boolean; error?: string }>;
  downloadUpdate(): Promise<{ ok: boolean; error?: string }>;
  installUpdate(): Promise<{ ok: boolean; error?: string }>;
  onUpdateState(callback: (state: DesktopUpdateState) => void): () => void;
}

declare global {
  interface Window {
    proerpApp?: ProerpDesktopBridge;
  }
}
