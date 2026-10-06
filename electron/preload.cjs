'use strict';

/**
 * Ana uygulama ve hata penceresi preload'u (http:// arayüz + error.html).
 * Durum/ayar/günlük API'sinin yanında sürüm ve güncelleme API'sini ifşa
 * eder; kurulum IPC'lerine erişimi yoktur.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('proerpApp', {
  getStatus: () => ipcRenderer.invoke('app:getStatus'),
  retry: () => ipcRenderer.invoke('app:retry'),
  openSettings: () => ipcRenderer.invoke('app:openSettings'),
  openLogs: () => ipcRenderer.invoke('app:openLogs'),

  // Sürüm ve otomatik güncelleme (Ayarlar → Sistem & Güncelleme).
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  getUpdateState: () => ipcRenderer.invoke('update:getState'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateState: (callback) => {
    const listener = (_event, state) => {
      try { callback(state); } catch { /* renderer hatası akışı bozmasın */ }
    };
    ipcRenderer.on('update:state', listener);
    return () => ipcRenderer.removeListener('update:state', listener);
  },
});
