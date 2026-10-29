const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { analyzeCSV } = require('./benchmark.cjs');
const { isDeepStrictEqual } = require('node:util');
const catalog = require('./catalog.cjs');
const tools = require('../shared/tools.json');
const {classifyWindows}=require('./platform.cjs');
const ACTIVE = new Set(['pending', 'applied', 'restore-failed']);
class Service {
  constructor(native, store, platform = process.platform) { this.native = native; this.store = store; this.platform = platform; this.busy = false; this.reviews = new Map(); this.powerReviews=new Map(); this.toolReviews=new Map(); this.restorePointAttempted=false; this.store.data.settings={autoRestorePoint:true,showAdvanced:false,confirmFeatureChanges:true,...store.data.settings}; }
  preferences(value){
    if(!value||typeof value!=='object'||Object.keys(value).some(k=>!['autoRestorePoint','showAdvanced','confirmFeatureChanges'].includes(k))||Object.values(value).some(v=>typeof v!=='boolean'))throw new Error('Preferencia no válida.');
    Object.assign(this.store.data.settings,value);this.store.save();return this.state();
  }
  record(action,details){this.store.data.activity??=[];this.store.data.activity.unshift({at:new Date().toISOString(),action,details});this.store.data.activity=this.store.data.activity.slice(0,1000);while(this.store.data.activity.length>1&&Buffer.byteLength(JSON.stringify(this.store.data.activity))>4*1024*1024)this.store.data.activity.pop();this.store.save();}
  async exclusive(fn) { if (this.busy) throw new Error('Hay otra operación en curso. Espera a que termine.'); this.busy = true; try { return await fn(); } finally { this.busy = false; } }
  state() { return { ...this.store.data, platform: this.platform, demo: this.platform !== 'win32' }; }
  game(id) { const game = this.store.data.games.find(g => g.id === id); if (!game) throw new Error('Juego no encontrado. Vuelve a escanear.'); return game; }
  async assertSupported() {
    const platform=classifyWindows(await this.native.call('platform'));
    if(!platform.supported)throw new Error(platform.reason);
    return platform;
  }
  setGameExecutable(id,exe){
    const game=this.game(id);
    if(path.extname(exe).toLowerCase()!=='.exe'||!fs.existsSync(exe))throw new Error('Selecciona un ejecutable .exe existente.');
    const real=fs.realpathSync(exe),root=fs.realpathSync(game.directory),relative=path.relative(root,real);
    if(relative.startsWith('..'+path.sep)||path.isAbsolute(relative)||relative==='..')throw new Error('El ejecutable debe estar dentro de la instalación del juego.');
    game.exe=real;this.store.save();return this.state();
  }
  async reviewLaptopPlan(mode){
    if(!['performance','balanced','saver'].includes(mode))throw new Error('Plan no permitido.');
    return this.exclusive(async()=>{
      await this.assertSupported();const plans=await this.native.call('powerPlans');
      if(!plans.device?.isLaptop)throw new Error('Estos controles son exclusivos de equipos portátiles detectados.');
      if(!plans[mode])throw new Error('El fabricante no ofrece este plan en tu equipo. No crearemos ni forzaremos otro.');
      if(mode==='performance'&&plans.device.acConnected!==true)throw new Error('Conecta el cargador antes de activar Alto rendimiento.');
      if(plans.active===plans[mode])throw new Error('Este plan ya está activo.');
      const review={id:randomUUID(),mode,before:plans.active,after:plans[mode],expiresAt:Date.now()+300000};
      this.powerReviews.clear();this.powerReviews.set(review.id,review);return structuredClone(review);
    });
  }
  async applyLaptopPlan(id){
    return this.exclusive(async()=>{
      const review=this.powerReviews.get(id);this.powerReviews.delete(id);
      if(!review||review.expiresAt<Date.now())throw new Error('La revisión del plan caducó. Revisa otra vez.');
      await this.assertSupported();const plans=await this.native.call('powerPlans');
      if(!plans.device?.isLaptop||plans.active!==review.before||plans[review.mode]!==review.after)throw new Error('El equipo o el plan cambió desde la revisión. Revisa otra vez.');
      if(review.mode==='performance'&&plans.device.acConnected!==true)throw new Error('Se desconectó el cargador. No se aplicó Alto rendimiento.');
      await this.change('power',{},review.before,review.after,'Laptop · '+{performance:'Alto rendimiento',balanced:'Equilibrado',saver:'Ahorro de energía'}[review.mode]);
      return this.state();
    });
  }
  async scan() {
    return this.exclusive(async () => {
      const games = await this.native.call('games');
      for(const game of games){
        const previous=this.store.data.games.find(g=>g.id===game.id);
        if(!game.exe&&previous?.exe&&fs.existsSync(previous.exe)&&fs.existsSync(game.directory)){
          const real=fs.realpathSync(previous.exe),relative=path.relative(fs.realpathSync(game.directory),real);
          if(relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative))game.exe=real;
        }
      }
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
    this.store.data.profiles[id] = { performance: value.performance, priority: value.priority, gpu: value.gpu===true, legacyFullscreen:value.legacyFullscreen===true }; this.store.save(); return this.state();
  }
  async change(kind, target, before, after, label) {
    if (isDeepStrictEqual(before, after)) return null;
    if (this.store.data.history.some(h => ACTIVE.has(h.status) && h.kind === kind && JSON.stringify(h.target) === JSON.stringify(target))) throw new Error('Restaura primero el cambio anterior de este ajuste.');
    const entry = { id: randomUUID(), at: new Date().toISOString(), kind, target, before, after, label, status: 'pending' };
    this.store.data.history.unshift(entry); this.store.save();
    try { await this.write(entry, after); entry.status = 'applied'; this.store.save(); this.record('apply',{label,kind}); }
    catch (e) { entry.error = e.message; if(e.unchanged)entry.status='cancelled'; this.store.save(); throw e; } // Ambiguous failures remain recoverable; confirmed no-write failures never roll back external changes.
    return entry;
  }
  async write(entry, value, restoring = false) {
    const action = { power: 'powerSet', priority: 'prioritySet', animations: 'animationsSet', tweak: 'tweakWrite',gamePreference:'gamePreferenceWrite' }[entry.kind];
    if (!action) throw new Error('Cambio desconocido.');
    return this.native.call(action, { ...entry.target, value, restoring, ...(entry.kind==='tweak'&&!restoring?{expectedBefore:entry.before}:{}) });
  }
  async applyGame(id) {
    return this.exclusive(async () => {
      await this.assertSupported();
      const game = this.game(id), profile = this.store.data.profiles[id] || { performance: true, priority: false };
      // Resolve the running process before making any global changes.
      const processInfo = profile.priority ? await this.native.call('priorityGet', { game }) : null;
      const plans = profile.performance ? await this.native.call('powerPlans') : null;
      if (plans && !plans.performance) throw new Error('El equipo no ofrece el plan Alto rendimiento. Conserva el plan del fabricante.');
      if (plans?.onBattery) throw new Error('Conecta el cargador antes de activar Alto rendimiento.');
      if(plans?.device?.isLaptop)throw new Error('Gestiona la energía de tu portátil en la pestaña Laptop.');
      if((profile.gpu||profile.legacyFullscreen)&&!game.exe)throw new Error('Asigna primero el ejecutable real del juego.');
      const graphics=(profile.gpu||profile.legacyFullscreen)?await this.native.call('gamePreferences',{exe:game.exe,gpu:profile.gpu===true,legacyFullscreen:profile.legacyFullscreen===true}):[];
      const applied = [];
      try {
        if (plans) { const e = await this.change('power', {}, plans.active, plans.performance, 'Energía · ' + game.name); if (e) applied.push(e); }
        for(const option of graphics){const e=await this.change('gamePreference',{exe:game.exe,preference:option.id},option.before,option.after,(option.id==='gpu'?'GPU de alto rendimiento':'Compatibilidad de pantalla completa')+' · '+game.name);if(e)applied.push(e);}
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
    return this.exclusive(async () => { await this.assertSupported(); const before = await this.native.call('animationsGet'); await this.change('animations', {}, before, enabled, 'Animaciones de controles de Windows'); return this.state(); });
  }
  async restore(id) {
    return this.exclusive(async () => {
      const entry = this.store.data.history.find(h => h.id === id);
      if (!entry || !ACTIVE.has(entry.status)) throw new Error('Este cambio ya está restaurado.');
      try { this.assertRestoreOrder(entry); await this.write(entry, entry.before, true); entry.status = 'restored'; entry.restoredAt = new Date().toISOString(); delete entry.error; this.record('restore',{label:entry.label}); }
      catch (error) { entry.status = 'restore-failed'; entry.error = error.message; throw error; }
      finally { this.store.save(); }
      return this.state();
    });
  }
  tweakCatalog() { return catalog.map(({values,resources,policy,...meta}) => ({...meta,details:[...(values||[]).map(v=>`${v.hive==='LocalMachine'?'HKLM':'HKCU'}\\${v.path} · ${v.name||'(Predeterminado)'} → ${v.mergeToken?v.mergeToken.name+'='+v.mergeToken.value:v.clearBits?'Conservar flags y quitar bits de atajo':String(v.value)}`),...(resources||[]).map(r=>[r.type,r.name,r.subgroup,r.setting].filter(Boolean).join(' · '))]})); }
  validateTweaks(ids) {
    if (!Array.isArray(ids) || ids.length<1 || ids.length>160 || new Set(ids).size!==ids.length || !ids.every(id=>catalog.some(t=>t.id===id))) throw new Error('Selección de ajustes no válida.');
  }
  async tweakStatus(scope='general') {
    if(!['general','laptop'].includes(scope))throw new Error('Sección no válida.');
    const result=await this.native.call('tweakInspect',{ids:catalog.map(t=>t.id),scope});
    return result.map(({before,after,...status})=>status);
  }
  async reviewTweaks(ids,scope='general') {
    this.validateTweaks(ids);
    if(!['general','laptop'].includes(scope))throw new Error('Sección no válida.');
    return this.exclusive(async()=>{
      await this.assertSupported();
      const inspection=await this.native.call('tweakInspect',{ids,scope});
      if(inspection.some(t=>!t.available))throw new Error('Uno de los ajustes no está disponible. Actualiza la biblioteca.');
      const changes=inspection.filter(t=>!t.configured);
      if(!changes.length)throw new Error('Los ajustes seleccionados ya coinciden con Windows.');
      for(const t of changes)if(this.store.data.history.some(h=>h.kind==='tweak'&&h.target.tweakId===t.id&&ACTIVE.has(h.status)))throw new Error('Restaura primero el ajuste anterior desde el historial.');
      this.checkTweakConflicts(changes);
      const review={id:randomUUID(),expiresAt:Date.now()+5*60*1000,changes,scope,requiresConsent:changes.some(t=>{const risk=catalog.find(c=>c.id===t.id).risk;return ['security','driver','boot','data'].includes(risk)||(this.store.data.settings.confirmFeatureChanges&&['feature','power','network'].includes(risk));}),security:changes.some(t=>catalog.find(c=>c.id===t.id).risk==='security')};
      this.reviews.clear();this.reviews.set(review.id,review);return structuredClone(review);
    });
  }
  async applyTweaks(reviewId,consent={}) {
    return this.exclusive(async()=>{
      const review=this.reviews.get(reviewId);this.reviews.delete(reviewId);
      if(!review||review.expiresAt<Date.now())throw new Error('La revisión caducó. Revisa otra vez antes de aplicar.');
      if(review.requiresConsent&&consent?.acknowledged!==true)throw new Error('Confirma que entiendes los riesgos indicados.');
      if(review.security&&consent?.phrase!=='ACEPTO EL RIESGO')throw new Error('Para reducir protecciones escribe ACEPTO EL RIESGO en la revisión.');
      await this.assertSupported();
      const current=await this.native.call('tweakInspect',{ids:review.changes.map(t=>t.id),scope:review.scope});
      if(current.length!==review.changes.length||current.some(t=>!t.available||!isDeepStrictEqual(t.before,review.changes.find(c=>c.id===t.id)?.before)))throw new Error('Windows cambió desde la revisión. Revisa de nuevo para conservar el valor original correcto.');
      this.checkTweakConflicts(current);
      if(review.changes.some(t=>catalog.find(c=>c.id===t.id).admin))await this.ensureRestorePoint();
      const previous=new Set(this.store.data.history.map(h=>h.id));
      try{
        for(const t of review.changes)await this.change('tweak',{tweakId:t.id,...(review.scope==='laptop'?{scope:'laptop'}:{})},t.before,t.after,catalog.find(c=>c.id===t.id).title);
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
  resourceKeys(values){return new Set((Array.isArray(values)?values:[]).map(v=>v.key||(v.path?`reg:${v.hive||'CurrentUser'}:${v.path}:${v.name}`:null)).filter(Boolean).map(k=>k.toLowerCase()));}
  checkTweakConflicts(changes){
    const active=this.store.data.history.filter(h=>ACTIVE.has(h.status));
    for(const [index,t] of changes.entries()){
      const definition=catalog.find(d=>d.id===t.id),keys=this.resourceKeys(t.after);
      const others=[...active.filter(h=>h.kind==='tweak').map(h=>({id:h.target.tweakId,after:h.after,label:h.label})),...changes.slice(0,index)];
      for(const other of others){
        const otherDefinition=catalog.find(d=>d.id===other.id);
        if(definition.conflicts?.includes(other.id)||otherDefinition?.conflicts?.includes(t.id)||[...this.resourceKeys(other.after)].some(k=>keys.has(k)))throw new Error(`Los ajustes «${definition.title}» y «${otherDefinition?.title||other.label||other.id}» comparten o contradicen una configuración. Restaura o quita uno de ellos.`);
      }
      if(definition.resources?.some(r=>r.type==='dedicatedPlan')&&active.some(h=>h.kind==='power'))throw new Error('Restaura primero el cambio de plan de Mis juegos o Laptop.');
    }
  }
  async ensureRestorePoint(){
    if(!this.store.data.settings.autoRestorePoint)return;
    if(this.restorePointAttempted)return;
    this.restorePointAttempted=true;
    try{const result=await this.native.call('restorePoint');this.record('restore-point',result);}
    catch(e){this.record('restore-point',{created:false,reason:e.message});}
  }
  async createRestorePoint(){return this.exclusive(async()=>{await this.assertSupported();const result=await this.native.call('restorePoint');this.record('restore-point',result);if(result.created)this.restorePointAttempted=true;return result;});}
  async restoreAll(){
    return this.exclusive(async()=>{
      const results=[];
      for(const entry of this.store.data.history.filter(h=>ACTIVE.has(h.status))){
        try{this.assertRestoreOrder(entry);await this.write(entry,entry.before,true);entry.status='restored';entry.restoredAt=new Date().toISOString();delete entry.error;results.push({label:entry.label,ok:true});}
        catch(e){entry.status='restore-failed';entry.error=e.message;results.push({label:entry.label,ok:false,error:e.message});}
        this.store.save();
      }
      this.record('restore-all',results);return {state:this.state(),results};
    });
  }
  assertRestoreOrder(entry){
    const index=this.store.data.history.indexOf(entry),newer=this.store.data.history.slice(0,index).filter(h=>ACTIVE.has(h.status));
    const changesPlan=h=>h.kind==='power'||(h.kind==='tweak'&&h.after?.some(v=>v.type==='dedicatedPlan'));
    if(changesPlan(entry)&&newer.some(changesPlan))throw new Error('Restaura primero el cambio de plan más reciente.');
    const created=entry.after?.find?.(v=>v.type==='dedicatedPlan')?.target?.guid;
    if(created&&this.store.data.history.some(h=>h.id!==entry.id&&ACTIVE.has(h.status)&&h.after?.some?.(v=>v.type==='powerSetting'&&v.target.scheme===created)))throw new Error('Restaura primero los parámetros del plan NEXO. No se eliminará un plan con cambios pendientes.');
  }
  toolCatalog(){return structuredClone(tools);}
  async inspectTool(id){if(!tools.some(t=>t.id===id))throw new Error('Herramienta no válida.');return this.native.call('toolInspect',{tool:id});}
  async reviewTool(id,selection){
    if(!tools.some(t=>t.id===id)||!Array.isArray(selection)||!selection.length||selection.length>5000||new Set(selection).size!==selection.length||!selection.every(x=>typeof x==='string'))throw new Error('Selecciona elementos válidos para revisar.');
    return this.exclusive(async()=>{
      await this.assertSupported();const items=await this.inspectTool(id);const chosen=selection.map(key=>items.find(x=>x.id===key));
      if(chosen.some(x=>!x))throw new Error('La selección cambió. Analiza de nuevo.');
      const review={id:randomUUID(),tool:id,items:chosen,expiresAt:Date.now()+300000};
      this.toolReviews.clear();this.toolReviews.set(review.id,review);return structuredClone(review);
    });
  }
  async applyTool(id,acknowledged){
    return this.exclusive(async()=>{
      const review=this.toolReviews.get(id);this.toolReviews.delete(id);
      if(!review||review.expiresAt<Date.now())throw new Error('La revisión caducó. Analiza de nuevo.');
      if(acknowledged!==true)throw new Error('Debes confirmar el efecto de esta herramienta.');
      await this.assertSupported();
      if(tools.find(t=>t.id===review.tool).kind==='apps')await this.ensureRestorePoint();
      // Persist the exact selection before irreversible work, so interruption is visible in the log.
      this.record('tool-pending',{tool:review.tool,items:review.items.map(x=>({id:x.id,name:x.name}))});
      try{const result=await this.native.call('toolApply',{tool:review.tool,items:review.items});this.record('tool-result',{tool:review.tool,...result});return result;}
      catch(e){this.record('tool-error',{tool:review.tool,error:e.message});throw e;}
    });
  }
  async trim(pids) {
    if (!Array.isArray(pids) || !pids.length || pids.length > 32 || !pids.every(x => Number.isInteger(x) && x > 0)) throw new Error('Selecciona entre 1 y 32 procesos.');
    return this.exclusive(async() => {await this.assertSupported();return this.native.call('memoryTrim', { pids });});
  }
  benchmark(gameId, phase, context, csv) {
    this.game(gameId);
    if (!['before', 'after'].includes(phase) || typeof context !== 'string' || context.trim().length < 3 || context.length > 200) throw new Error('Indica resolución, ajustes y escena (3–200 caracteres).');
    const result = { id: randomUUID(), gameId, phase, context: context.trim(), at: new Date().toISOString(), ...analyzeCSV(csv) };
    this.store.data.benchmarks.unshift(result); this.store.data.benchmarks = this.store.data.benchmarks.slice(0, 100); this.store.save(); return this.state();
  }
}
module.exports = { Service, ACTIVE };
