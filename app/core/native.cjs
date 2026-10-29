const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const ALLOWED = new Set(['snapshot', 'games', 'powerPlans', 'powerSet', 'priorityGet', 'prioritySet', 'animationsGet', 'animationsSet', 'memoryCandidates', 'memoryTrim']);
class Native {
  async call(action, payload = {}) {
    if (!ALLOWED.has(action)) throw new Error('Operación nativa no permitida.');
    if (process.platform !== 'win32') throw new Error('Esta operación requiere Windows 10/11.');
    const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const script = fs.readFileSync(path.join(__dirname, '../native/bridge.ps1'));
    return new Promise((resolve, reject) => {
      const encoded = Buffer.from(JSON.stringify(payload)).toString('base64');
      // Run bundled commands via stdin, including from ASAR. Never alter execution policy.
      // Both interpolated arguments are constrained: action is allowlisted; payload is base64.
      const command = `& { $script = [scriptblock]::Create([Console]::In.ReadToEnd()); & $script -Action '${action}' -Payload '${encoded}' }`;
      const child = spawn(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, shell: false });
      child.stdin.on('error', () => {});
      child.stdin.end(script);
      let stdout = '', stderr = '', tooLarge = false;
      const timer = setTimeout(() => { child.kill(); reject(new Error('Windows no respondió a tiempo. Comprueba el estado antes de reintentar.')); }, 45000);
      child.stdout.on('data', b => { stdout += b.toString('utf8'); if (stdout.length > 8e6) { tooLarge = true; child.kill(); } });
      child.stderr.on('data', b => { if (stderr.length < 8000) stderr += b.toString('utf8'); });
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.on('close', code => {
        clearTimeout(timer);
        if (tooLarge) return reject(new Error('Respuesta de Windows demasiado grande.'));
        try {
          const result = JSON.parse(stdout.replace(/^\uFEFF/, '').trim());
          if (code !== 0 || result.error) throw new Error(result.error || 'La operación de Windows falló.');
          resolve(result.data);
        } catch (error) { reject(new Error(error instanceof SyntaxError ? 'No se pudo leer la respuesta de PowerShell. Comprueba la política de ejecución de tu equipo. ' + stderr.slice(0, 600) : error.message)); }
      });
    });
  }
}
class Store {
  constructor(file) { this.file = file; this.data = { version: 1, games: [], profiles: {}, history: [], benchmarks: [] }; if (fs.existsSync(file)) { const data = JSON.parse(fs.readFileSync(file, 'utf8')); if (data.version !== 1) throw new Error('Versión de datos no compatible.'); this.data = data; } }
  save() { fs.mkdirSync(path.dirname(this.file), { recursive: true }); const tmp = this.file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2)); fs.renameSync(tmp, this.file); }
}
module.exports = { Native, Store };
