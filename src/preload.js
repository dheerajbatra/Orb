const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('orb', {
  // Config
  getConfig:             ()       => ipcRenderer.invoke('get-config'),
  saveConfig:            (cfg)    => ipcRenderer.invoke('save-config', cfg),
  setBackgroundColor:    (c)      => ipcRenderer.invoke('set-background-color', c),

  // Capture
  captureActiveWindow:   ()       => ipcRenderer.invoke('capture-active-window'),
  openCropSelector:      ()       => ipcRenderer.invoke('open-crop-selector'),
  getClipboard:          ()       => ipcRenderer.invoke('get-clipboard'),

  // Settings window
  openSettings:          ()       => ipcRenderer.invoke('open-settings'),
  closeSettings:         ()       => ipcRenderer.invoke('close-settings'),

  // Window control
  hideWindow:            ()       => ipcRenderer.invoke('hide-window'),

  // AI
  chatRequest:           (p)      => ipcRenderer.invoke('chat-request', p),

  // History persistence
  loadHistory:           ()       => ipcRenderer.invoke('load-history'),
  saveHistory:           (s)      => ipcRenderer.invoke('save-history', s),
  deleteHistorySession:  (id)     => ipcRenderer.invoke('delete-history-session', id),

  // Crop window IPC
  cropSelected:          (rect)   => ipcRenderer.invoke('crop-selected', rect),
  cropCancelled:         ()       => ipcRenderer.invoke('crop-cancelled'),

  // Event listeners
  onTriggerScreenshot:   (cb)     => ipcRenderer.on('trigger-screenshot', cb),
  onCropInit:            (cb)     => ipcRenderer.on('crop-init', (_, d) => cb(d)),
  onCropResult:          (cb)     => ipcRenderer.on('crop-result', (_, d) => cb(d)),
  removeAllListeners:    (ch)     => ipcRenderer.removeAllListeners(ch),
})
