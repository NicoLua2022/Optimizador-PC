const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {Service}=require('../app/core/service.cjs');
const {Store,Native}=require('../app/core/native.cjs');
function fixture(overrides={}) {
  const calls=[],saves=[];
  const store={data:{version:1,games:[{id:'cs2',name:'CS2',source:'Steam',directory:'C:\\Games\\CS2'}],profiles:{cs2:{performance:true,priority:true}},history:[],benchmarks:[]},save(){saves.push(structuredClone(this.data));}};
  const defaults={priorityGet:[{pid:100,started:'2026-10-29T00:00:00Z',priority:'Normal'}],powerPlans:{active:'balanced',performance:'performance',onBattery:false},powerSet:true,prioritySet:true,animationsGet:true,animationsSet:true,games:[]};
  const native={async call(action,payload){calls.push({action,payload,saved:structuredClone(store.data)});const result=Object.hasOwn(overrides,action)?overrides[action]:defaults[action];if(result instanceof Error)throw result;return typeof result==='function'?result(payload):result;}};
  return {service:new Service(native,store,'win32'),store,calls,saves};
}
test('journal precedes Windows mutations; restore uses exact original state',async()=>{
  const {service,store,calls}=fixture();await service.applyGame('cs2');
  assert.equal(store.data.history.length,2);
  for(const c of calls.filter(c=>['powerSet','prioritySet'].includes(c.action)))assert.equal(c.saved.history[0].status,'pending');
  const power=store.data.history.find(h=>h.kind==='power');await service.restore(power.id);
  assert.equal(power.status,'restored');assert.deepEqual(calls.at(-1).payload,{value:'balanced',restoring:true});
});
test('battery and unavailable plan fail before global writes',async()=>{
  for(const powerPlans of [{active:'balanced',performance:'performance',onBattery:true},{active:'balanced',performance:null,onBattery:false}]){
    const {service,store,calls}=fixture({powerPlans});await assert.rejects(service.applyGame('cs2'));assert.equal(store.data.history.length,0);assert.ok(!calls.some(c=>c.action==='powerSet'));
  }
});
test('missing running game fails before changing energy',async()=>{
  const {service,calls}=fixture({priorityGet:new Error('Juego cerrado')});await assert.rejects(service.applyGame('cs2'),/cerrado/);assert.equal(calls.length,1);
});
test('partial failure rolls back energy and retains ambiguous mutation for recovery',async()=>{
  const {service,store,calls}=fixture({prioritySet:new Error('Acceso denegado')});
  await assert.rejects(service.applyGame('cs2'),/denegado/);
  assert.equal(store.data.history.find(h=>h.kind==='power').status,'restored');
  assert.equal(store.data.history.find(h=>h.kind==='priority').status,'pending');
  assert.equal(calls.at(-1).payload.value,'balanced');
});
test('failed restoration keeps recoverable original value',async()=>{
  let fail=false;const {service,store}=fixture({powerSet:()=>{if(fail)throw new Error('Rechazado');return true;}});
  await service.applyGame('cs2');fail=true;const entry=store.data.history.find(h=>h.kind==='power');
  await assert.rejects(service.restore(entry.id),/Rechazado/);assert.equal(entry.status,'restore-failed');assert.equal(entry.before,'balanced');
});
test('repeated adjustments cannot overwrite original rollback value',async()=>{
  const {service,store}=fixture();await service.applyGame('cs2');await assert.rejects(service.applyGame('cs2'),/Restaura primero/);assert.equal(store.data.history.length,2);
});
test('mutations are serialized and a second request cannot race with first',async()=>{
  let release;const wait=new Promise(r=>release=r);
  const {service}=fixture({powerSet:()=>wait});const first=service.applyGame('cs2');
  await new Promise(r=>setImmediate(r));await assert.rejects(service.animations(false),/otra operación/);release(true);await first;
});
test('RAM trims are opt-in and validate selected PIDs',async()=>{
  const {service,calls}=fixture();for(const input of [[],[0],[-1],['123'],Array(33).fill(1)])await assert.rejects(service.trim(input));assert.equal(calls.length,0);
});
test('visual settings are separate and do not run with game profile',async()=>{
  const {service,store,calls}=fixture();await service.applyGame('cs2');assert.ok(!calls.some(c=>c.action.startsWith('animations')));
  await service.animations(false);const entry=store.data.history[0];assert.equal(entry.before,true);assert.equal(entry.after,false);await service.restore(entry.id);assert.equal(calls.at(-1).payload.value,true);
});
test('rescanning retains manually added games and profiles',async()=>{
  const {service,store}=fixture({games:[{id:'epic:1',name:'Fortnite'}]});store.data.games.push({id:'manual',source:'Manual',exe:'C:\\Game.exe'});await service.scan();assert.equal(store.data.games.length,2);assert.ok(store.data.profiles.cs2);
});
test('benchmarks validate game and save actual measured results',()=>{
  const {service,store}=fixture();const csv='FrameTime\n'+Array(120).fill(10).join('\n');
  assert.throws(()=>service.benchmark('unknown','before','1440p',csv),/no encontrado/);
  assert.throws(()=>service.benchmark('cs2','before','',csv),/resolución/);
  service.benchmark('cs2','before','1440p alto misma escena',csv);assert.equal(store.data.benchmarks[0].average,100);
});
test('state survives application restart, including pending journal',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nexo-test-'));
  try{const file=path.join(dir,'state.json');const store=new Store(file);store.data.history.push({status:'pending',before:'original'});store.save();assert.equal(new Store(file).data.history[0].before,'original');fs.writeFileSync(file,'broken');assert.throws(()=>new Store(file));assert.equal(fs.readFileSync(file,'utf8'),'broken');}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('native bridge rejects arbitrary operations',async()=>{await assert.rejects(new Native().call('exec'),/no permitida/);});
