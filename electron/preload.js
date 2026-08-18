const { contextBridge, ipcRenderer } = require('electron');

// Expose protected APIs to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  versions: process.versions,
  ping: () => 'pong',
  getApiBase: () => {
    // Override API base for Electron if env var is set, otherwise use production
    return process.env.API_BASE || 'https://api.coelgu-system.engineer';
  },
  // Example IPC methods
  send: (channel, data) => {
    // whitelist channels
    const validChannels = ['toMain'];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },
  receive: (channel, func) => {
    const validChannels = ['fromMain'];
    if (validChannels.includes(channel)) {
      // Deliberately strip event as it includes `sender`
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    }
  }
});