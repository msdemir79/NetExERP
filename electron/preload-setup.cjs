'use strict';

/**
 * İlk kurulum sihirbazı preload'u (yalnız setup.html penceresine atanır).
 * Ana uygulama penceresi bu API yüzeyini hiç göremez; ek olarak ana süreç
 * `setupGuard` ile göndericinin setup.html olduğunu doğrular.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('proerpSetup', {
  getState: () => ipcRenderer.invoke('setup:getState'),
  testConnection: (cfg) => ipcRenderer.invoke('setup:testConnection', cfg),
  testRemote: (remoteUrl) => ipcRenderer.invoke('setup:testRemote', { remoteUrl }),
  initDatabase: (payload) => ipcRenderer.invoke('setup:initDatabase', payload),
  applySchema: (cfg) => ipcRenderer.invoke('setup:applySchema', cfg),
  runMigrations: (cfg) => ipcRenderer.invoke('setup:runMigrations', cfg),
  save: (cfg) => ipcRenderer.invoke('setup:save', cfg),
  finish: (cfg) => ipcRenderer.invoke('setup:finish', cfg),
});

contextBridge.exposeInMainWorld('proerpApp', {
  openLogs: () => ipcRenderer.invoke('app:openLogs'),
});
