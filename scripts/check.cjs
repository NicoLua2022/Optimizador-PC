const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
function walk(dir) { return fs.readdirSync(dir, {withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]); }
for (const file of [...walk('app'),...walk('scripts'),...walk('test')].filter(f=>/\.(cjs|js)$/.test(f))) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio:'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('Sintaxis JavaScript válida.');
