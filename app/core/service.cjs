const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { analyzeCSV } = require('./benchmark.cjs');
const { isDeepStrictEqual } = require('node:util');
const catalog = require('../shared/tweaks.json');
const ACTIVE = new Set(['pending', 'applied', 'restore-failed']);
class Service {
  constructor(native, store, platform = process.platform) { this.native = native; this.store = store; this.platform = platform; this.busy = false; this.reviews = new Map(); }
  async exclusive(fn) { if (this.busy) throw new Error('Hay otra operación en curso. Espera a que termine.'); this.busy = true; try { return await fn(); } finally { this.busy = false; } }
  state() { return { ...this.store.data, platform: this.platform, demo: this.platform !== 'win32' }; }
  game(id) { const game = this.store.data.games.find(g => g.id === id); if (!game) throw new Error('Juego no encontrado. Vuelve a escanear.'); return game; }
  async scan() {
    return this.exclusive(async () => {
      const games = await this.native.call('games');
      const manual = this.store.data.games.filter(g => g.source === 'Manual');
      this.store.data.games = [...games, ...manual.filter(g => !games.some(x => x.exe && x.exe.toLowerCase() === g.exe.toLowerCase()))];
      this.store.save(); return this.state();
    });
  }
  addManual(exe) {
    if (path.extname(exe).toLowerCase() !== '.exe' || !fs.existsSync(exe)) throw new Error('Selecciona un ejecutable .exe existente.');
    const existing = this.store.data.games.find(g => g.exe?.toLowerCase() === exe.toLowerCase());
    if (!existing) { this.store.data.games.push({ id: randomUUID(), name: path.basename(exe, '.exe'), source: 'Manual', exe, directory: path.dirname(exe) }); this.store.save(); }
    return this.state();
  }
  profile(id, value) {
    this.game(id);
    if (!value || typeof value.performance !== 'boolean' || typeof value.priority !== 'boolean') throw new Error('Perfil no válido.');
    this.store.data.profiles[id] = { performance: value.performance, priority: value.priority }; this.store.save(); return this.state();
  }
  async change(kind, target, before, after, label) {
    if (isDeepStrictEqual(before, after)) return null;
    if (this.store.data.history.some(h => ACTIVE.has(h.status) && h.kind === kind && JSON.stringify(h.target) === JSON.stringify(target))) throw new Error('Restaura primero el cambio anterior de este ajuste.');
    const entry = { id: randomUUID(), at: new Date().toISOString(), kind, target, before, after, label, status: 'pending' };
    this.store.data.history.unshift(entry); this.store.save();
    try { await this.write(entry, after); entry.status = 'applied'; this.store.save(); }
    catch (e) { entry.error = e.message; this.store.save(); throw e; } // Pending is intentionally recoverable after ambiguous failures.
    return entry;
  }
  async write(entry, value, restoring = false) {
    const action = { power: 'powerSet', priority: 'prioritySet', animations: 'animationsSet', tweak: 'tweakWrite' }[entry.kind];
    if (!action) throw new Error('Cambio desconocido.');
    return this.native.call(action, { ...entry.target, value, restoring });
  }
  async applyGame(id) {
    return this.exclusive(async () => {
      const game = this.game(id), profile = this.store.data.profiles[id] || { performance: true, priority: false };
      // Resolve the running process before making any global changes.
      const processInfo = profile.priority ? await this.native.call('priorityGet', { game }) : null;
      const plans = profile.performance ? await this.native.call('powerPlans') : null;
      if (plans && !plans.performance) throw new Error('El equipo no ofrece el plan Alto rendimiento. Conserva el plan del fabricante.');
      if (plans?.onBattery) throw new Error('Conecta el cargador antes de activar Alto rendimiento.');
      const applied = [];
      try {
        if (plans) { const e = await this.change('power', {}, plans.active, plans.performance, 'Energía · ' + game.name); if (e) applied.push(e); }
        if (processInfo) for (const proc of processInfo) { const e = await this.change('priority', { pid: proc.pid, started: proc.started }, proc.priority, 'AboveNormal', 'Prioridad · ' + game.name); if (e) applied.push(e); }
      } catch (error) {
        for (const entry of applied.reverse()) { try { await this.write(entry, entry.before, true); entry.status = 'restored'; } catch (restoreError) { entry.status = 'restore-failed'; entry.error = restoreError.message; } }
        this.store.save(); throw error;
      }
      return this.state();
    });
  }
  async animations(enabled) {
    if (typeof enabled !== 'boolean') throw new Error('Valor no válido.');
    return this.exclusive(async () => { const before = await this.native.call('animationsGet'); await this.change('animations', {}, before, enabled, 'Animaciones de controles de Windows'); return this.state(); });
  }
  async restore(id) {
    return this.exclusive(async () => {
      const entry = this.store.data.history.find(h => h.id === id);
      if (!entry || !ACTIVE.has(entry.status)) throw new Error('Este cambio ya está restaurado.');
      try { await this.write(entry, entry.before, true); entry.status = 'restored'; entry.restoredAt = new Date().toISOString(); delete entry.error; }
      catch (error) { entry.status = 'restore-failed'; entry.error = error.message; throw error; }
      finally { this.store.save(); }
      return this.state();
    });
  }
  tweakCatalog() { return catalog.map(({values,policy,...meta}) => meta); }
  validateTweaks(ids) {
    if (!Array.isArray(ids) || ids.length<1 || ids.length>40 || new Set(ids).size!==ids.length || !ids.every(id=>catalog.some(t=>t.id===id))) throw new Error('Selección de ajustes no válida.');
  }
  async tweakStatus() {
    const result=await this.native.call('tweakInspect',{ids:catalog.map(t=>t.id)});
    return result.map(({before,after,...status})=>status);
  }
  async reviewTweaks(ids) {
    this.validateTweaks(ids);
    return this.exclusive(async()=>{
      const inspection=await this.native.call('tweakInspect',{ids});
      if(inspection.some(t=>!t.available))throw new Error('Uno de los ajustes no está disponible. Actualiza la biblioteca.');
      const changes=inspection.filter(t=>!t.configured);
      if(!changes.length)throw new Error('Los ajustes seleccionados ya coinciden con Windows.');
      for(const t of changes)if(this.store.data.history.some(h=>h.kind==='tweak'&&h.target.tweakId===t.id&&ACTIVE.has(h.status)))throw new Error('Restaura primero el ajuste anterior desde el historial.');
      const review={id:randomUUID(),expiresAt:Date.now()+5*60*1000,changes};
      this.reviews.clear();this.reviews.set(review.id,review);return structuredClone(review);
    });
  }
  async applyTweaks(reviewId) {
    return this.exclusive(async()=>{
      const review=this.reviews.get(reviewId);this.reviews.delete(reviewId);
      if(!review||review.expiresAt<Date.now())throw new Error('La revisión caducó. Revisa otra vez antes de aplicar.');
      const current=await this.native.call('tweakInspect',{ids:review.changes.map(t=>t.id)});
      if(current.length!==review.changes.length||current.some(t=>!t.available||!isDeepStrictEqual(t.before,review.changes.find(c=>c.id===t.id)?.before)))throw new Error('Windows cambió desde la revisión. Revisa de nuevo para conservar el valor original correcto.');
      const previous=new Set(this.store.data.history.map(h=>h.id));
      try{
        for(const t of review.changes)await this.change('tweak',{tweakId:t.id},t.before,t.after,catalog.find(c=>c.id===t.id).title);
      }catch(error){
        for(const entry of this.store.data.history.filter(h=>!previous.has(h.id)&&ACTIVE.has(h.status))){
          try{await this.write(entry,entry.before,true);entry.status='restored';}
          catch(restoreError){entry.status='restore-failed';entry.error=restoreError.message;}
        }
        this.store.save();throw error;
      }
      return this.state();
    });
  }
  async trim(pids) {
    if (!Array.isArray(pids) || !pids.length || pids.length > 32 || !pids.every(x => Number.isInteger(x) && x > 0)) throw new Error('Selecciona entre 1 y 32 procesos.');
    return this.exclusive(() => this.native.call('memoryTrim', { pids }));
  }
  benchmark(gameId, phase, context, csv) {
    this.game(gameId);
    if (!['before', 'after'].includes(phase) || typeof context !== 'string' || context.trim().length < 3 || context.length > 200) throw new Error('Indica resolución, ajustes y escena (3–200 caracteres).');
    const result = { id: randomUUID(), gameId, phase, context: context.trim(), at: new Date().toISOString(), ...analyzeCSV(csv) };
    this.store.data.benchmarks.unshift(result); this.store.data.benchmarks = this.store.data.benchmarks.slice(0, 100); this.store.save(); return this.state();
  }
}
module.exports = { Service, ACTIVE };
