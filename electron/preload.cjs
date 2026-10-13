const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('taildesk', Object.freeze({
  status: () => ipcRenderer.invoke('status'),
  preferences: () => ipcRenderer.invoke('preferences'),
  change: (action, value) => ipcRenderer.invoke('change', action, value),
  ping: ip => ipcRenderer.invoke('ping', ip),
  copy: value => ipcRenderer.invoke('copy', value),
  openOfficial: () => ipcRenderer.invoke('open-official'),
  quit: () => ipcRenderer.invoke('quit')
}));
