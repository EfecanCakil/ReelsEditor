const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  openMedia: (kind) => ipcRenderer.invoke('media:open', kind),
  probePaths: (paths) => ipcRenderer.invoke('media:probePaths', paths),
  pathForFile: (file) => webUtils.getPathForFile(file),
  exists: (paths) => ipcRenderer.invoke('fs:exists', paths),

  saveProject: (data, currentPath) => ipcRenderer.invoke('project:save', data, currentPath),
  openProject: (filePath) => ipcRenderer.invoke('project:open', filePath),
  saveText: (content, defaultName, ext) => ipcRenderer.invoke('file:saveText', content, defaultName, ext),
  autosave: (data, projectPath) => ipcRenderer.invoke('project:autosave', data, projectPath),
  recovery: () => ipcRenderer.invoke('project:recovery'),
  clearAutosave: () => ipcRenderer.invoke('project:clearAutosave'),
  silences: (file, start, end, db, minDur) => ipcRenderer.invoke('media:silences', file, start, end, db, minDur),
  waveform: (file) => ipcRenderer.invoke('media:waveform', file),
  pickImage: (name) => ipcRenderer.invoke('export:pickImage', name),

  pickExportPath: (name) => ipcRenderer.invoke('export:pickPath', name),
  pickFolder: () => ipcRenderer.invoke('export:pickFolder'),
  exportStart: (job) => ipcRenderer.invoke('export:start', job),
  exportCancel: () => ipcRenderer.invoke('export:cancel'),
  showItem: (p) => ipcRenderer.invoke('shell:showItem', p),

  transcribe: (req) => ipcRenderer.invoke('transcribe:start', req),
  translate: (req) => ipcRenderer.invoke('translate:start', req),
  aiCancel: () => ipcRenderer.invoke('ai:cancel'),
  aiModels: () => ipcRenderer.invoke('ai:models'),

  on: (channel, cb) => {
    const h = (_e, data) => cb(data);
    ipcRenderer.on(channel, h);
    return () => ipcRenderer.removeListener(channel, h);
  },
});
