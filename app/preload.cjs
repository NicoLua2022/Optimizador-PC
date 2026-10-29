const { contextBridge, ipcRenderer } = require('electron');
const api = {};
for (const method of ['preferences','openDataFolder','diagnostics','toolCatalog','inspectTool','reviewTool','applyTool','createRestorePoint','restoreAll','exportBackup','openSystemTool','reviewLaptopPlan','applyLaptopPlan','chooseGameExecutable','tweakCatalog', 'tweakStatus', 'reviewTweaks', 'applyTweaks', 'state', 'snapshot', 'scan', 'profile', 'apply', 'animations', 'restore', 'memoryCandidates', 'trim', 'addGame', 'launch', 'importBenchmark']) {
  api[method] = async (...args) => { const response = await ipcRenderer.invoke(method, ...args); if (!response.ok) throw new Error(response.error); return response.value; };
}
api.onTelemetry = callback => {
  if(typeof callback!=='function')throw new Error('Callback no válido.');
  const listener=(_event,message)=>callback(message);
  ipcRenderer.on('telemetry',listener);ipcRenderer.send('telemetry:subscribe');
  return ()=>ipcRenderer.removeListener('telemetry',listener);
};
contextBridge.exposeInMainWorld('nexo', Object.freeze(api));
