const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { Native, Store } = require('./core/native.cjs');
const { Telemetry } = require('./core/telemetry.cjs');
const { Service } = require('./core/service.cjs');
let window, service, telemetry;
const page = pathToFileURL(path.join(__dirname, 'ui/index.html')).href;
function register(name, fn) {
  ipcMain.handle(name, async (event, ...args) => {
    const senderURL = new URL(event.senderFrame.url); senderURL.hash = '';
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || senderURL.href !== page) throw new Error('Origen no permitido.');
    try { return { ok: true, value: await fn(...args) }; } catch (e) { return { ok: false, error: e.message }; }
  });
}
app.whenReady().then(() => {
  try { service = new Service(new Native(), new Store(path.join(app.getPath('userData'), 'state.json'))); }
  catch (e) { dialog.showErrorBox('No se pueden cargar tus datos', 'Se ha conservado el archivo original. ' + e.message); app.quit(); return; }
  window = new BrowserWindow({ width: 1440, height: 960, minWidth: 1050, minHeight: 740, backgroundColor: '#0b1018', title: 'NEXO · PC Performance', autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  telemetry=new Telemetry(message=>{if(window&&!window.isDestroyed())window.webContents.send('telemetry',message);});
  ipcMain.on('telemetry:subscribe',event=>{
    const url=new URL(event.senderFrame.url);url.hash='';
    if(process.platform==='win32'&&event.sender===window.webContents&&event.senderFrame===window.webContents.mainFrame&&url.href===page)telemetry.start();
  });
  register('tweakCatalog',()=>service.tweakCatalog());
  register('tweakStatus',()=>service.tweakStatus());
  register('reviewTweaks',ids=>service.reviewTweaks(ids));
  register('applyTweaks',id=>service.applyTweaks(id));
  register('state', () => service.state());
  register('snapshot', () => service.native.call('snapshot'));
  register('scan', () => service.scan());
  register('profile', (id, value) => service.profile(id, value));
  register('apply', id => service.applyGame(id));
  register('animations', enabled => service.animations(enabled));
  register('restore', id => service.restore(id));
  register('memoryCandidates', () => service.native.call('memoryCandidates'));
  register('trim', pids => service.trim(pids));
  register('addGame', async () => {
    const choice = await dialog.showOpenDialog(window, { title: 'Añadir ejecutable del juego', properties: ['openFile'], filters: [{ name: 'Ejecutables', extensions: ['exe'] }] });
    return choice.canceled ? service.state() : service.addManual(choice.filePaths[0]);
  });
  register('launch', async id => {
    if (process.platform !== 'win32') throw new Error('Se requiere Windows.');
    const game = service.game(id);
    if (game.source === 'Steam' && /^\d+$/.test(game.appId)) {
      // Only allow the fixed Steam scheme built from a discovered numeric app ID.
      await require('electron').shell.openExternal('steam://rungameid/' + game.appId);
    } else {
      if (!game.exe || path.extname(game.exe).toLowerCase() !== '.exe') throw new Error('Añade el ejecutable manualmente para iniciar este juego.');
      await fs.access(game.exe);
      await new Promise((resolve, reject) => {
        const child = spawn(game.exe, [], { cwd: path.dirname(game.exe), detached: true, stdio: 'ignore', shell: false });
        child.once('error', reject); child.once('spawn', () => { child.unref(); resolve(); });
      });
    }
    return true;
  });
  register('importBenchmark', async (gameId, phase, context) => {
    const choice = await dialog.showOpenDialog(window, { title: 'Importar CSV de PresentMon / CapFrameX', properties: ['openFile'], filters: [{ name: 'Captura CSV', extensions: ['csv'] }] });
    if (choice.canceled) return service.state();
    const file = choice.filePaths[0]; if ((await fs.stat(file)).size > 20 * 1024 * 1024) throw new Error('El archivo supera los 20 MB.');
    return service.benchmark(gameId, phase, context, await fs.readFile(file, 'utf8'));
  });
  window.loadURL(page);
});
app.on('window-all-closed', () => app.quit());

app.on('before-quit',()=>telemetry?.stop());
