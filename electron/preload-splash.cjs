'use strict';

/** Açılış (splash) penceresi preload'u: durum metni güncellemelerini alır. */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('proerpSplash', {
  onStatus: (cb) => {
    const listener = (_event, text) => {
      try { cb(text); } catch { /* sayfa hata verdi */ }
    };
    ipcRenderer.on('splash:status', listener);
    return () => ipcRenderer.removeListener('splash:status', listener);
  },
});
