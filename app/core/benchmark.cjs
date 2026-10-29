function parseCSV(text) {
  if (typeof text !== 'string' || text.length > 20 * 1024 * 1024) throw new Error('CSV demasiado grande (máximo 20 MB).');
  const rows = []; let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted; }
    else if (c === ',' && !quoted) { row.push(field); field = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); if (row.some(Boolean)) rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (quoted) throw new Error('CSV incompleto.');
  row.push(field); if (row.some(Boolean)) rows.push(row);
  return rows;
}
function analyzeCSV(text) {
  const [headers, ...rows] = parseCSV(text.replace(/^\uFEFF/, ''));
  if (!headers) throw new Error('El archivo está vacío.');
  const names = headers.map(x => x.trim().toLowerCase());
  const index = ['msbetweenpresents', 'frametime', 'frametime (ms)', 'msbetweenappstart'].map(x => names.indexOf(x)).find(x => x >= 0);
  if (index === undefined) throw new Error('Se requiere una columna MsBetweenPresents, FrameTime o MsBetweenAppStart en milisegundos.');
  const processIndex = names.indexOf('processid');
  const processes = new Set(rows.map(r => r[processIndex]).filter(Boolean));
  if (processIndex >= 0 && processes.size > 1) throw new Error('Exporta un único proceso del juego; este CSV mezcla procesos.');
  for (const column of ['application', 'processname', 'swapchainaddress']) {
    const i = names.indexOf(column);
    if (i >= 0 && new Set(rows.map(r => r[i]).filter(Boolean)).size > 1) throw new Error('La captura mezcla aplicaciones o swapchains. Exporta un único flujo de fotogramas del juego.');
  }
  const times = rows.map(r => Number(r[index])).filter(x => Number.isFinite(x) && x > 0);
  if (times.length < 120) throw new Error('La captura debe contener al menos 120 fotogramas válidos.');
  const durationMs = times.reduce((a, b) => a + b, 0);
  const sorted = [...times].sort((a,b) => b-a);
  const slow = sorted.slice(0, Math.max(1, Math.ceil(times.length * .01)));
  return { frames: times.length, seconds: durationMs / 1000, average: 1000 * times.length / durationMs,
    low1: 1000 / (slow.reduce((a,b) => a+b,0) / slow.length), p99Ms: [...times].sort((a,b)=>a-b)[Math.ceil(times.length * .99)-1] };
}
module.exports = { parseCSV, analyzeCSV };
