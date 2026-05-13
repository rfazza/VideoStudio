const { contextBridge, ipcRenderer } = require('electron');

/**
 * Preload Script
 * Safely exposes specific Electron APIs to the renderer process.
 */
contextBridge.exposeInMainWorld('electron', {
  platform: process.platform,
  version: process.versions.electron,
  selectFolder: () => ipcRenderer.invoke('select-folder'),
});

console.log('[Preload] Context bridge initialized.');
