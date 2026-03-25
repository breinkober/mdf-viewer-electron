const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mdfApi', {
  selectFile: extension => ipcRenderer.invoke('select-file', extension),
  setPath: payload => ipcRenderer.invoke('set-path', payload),
  getState: () => ipcRenderer.invoke('get-state'),
  attachDatabase: () => ipcRenderer.invoke('attach-database'),
  listTables: () => ipcRenderer.invoke('list-tables'),
  previewTable: tableName => ipcRenderer.invoke('preview-table', tableName),
  runQuery: query => ipcRenderer.invoke('run-query', query),
  exportCsv: payload => ipcRenderer.invoke('export-csv', payload)
});
