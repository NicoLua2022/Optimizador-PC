const { contextBridge, ipcRenderer } = require('electron');
const api = {};
for (const method of ['state', 'snapshot', 'scan', 'profile', 'apply', 'animations', 'restore', 'memoryCandidates', 'trim', 'addGame', 'launch', 'importBenchmark']) {
  api[method] = async (...args) => { const response = await ipcRenderer.invoke(method, ...args); if (!response.ok) throw new Error(response.error); return response.value; };
}
contextBridge.exposeInMainWorld('nexo', Object.freeze(api));
