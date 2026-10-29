// Exercises discovery, temporary user preferences with restoration, continuous metrics and an owned test process.
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const path=require('node:path');
const {Native,Store}=require('../app/core/native.cjs');
const {Service}=require('../app/core/service.cjs');
const {classifyWindows}=require('../app/core/platform.cjs');
const {platformFixture}=require('../test/helpers/windows-platform.cjs');
const {Telemetry}=require('../app/core/telemetry.cjs');
const fs=require('node:fs');const os=require('node:os');
(async()=>{
  if(process.platform!=='win32')throw new Error('Esta validación requiere Windows real.');
  const detected=new Native();
  const actual=await detected.call('platform');
  assert.equal(actual.supported,classifyWindows(actual).supported);
  console.log('Host real:',actual.caption,'build',actual.build,'supported=',actual.supported);
  if(!actual.supported){
    const status=await detected.call('tweakInspect',{ids:require('../app/shared/tweaks.json').map(t=>t.id)});
    assert.ok(status.every(t=>!t.available));
    await assert.rejects(detected.call('tweakWrite',{tweakId:'advertising-id',value:[]}),/Windows 10|Windows 11/);
    console.log('Windows Server/otro SO: cambios bloqueados correctamente.');
  }
  // GitHub Windows runners use Server. Exercise client compatibility branches using explicit test-only fixtures,
  // while Win32, registry, process and telemetry calls still execute against the real isolated Windows kernel.
  const native=actual.supported?detected:new Native(()=>platformFixture(11));
  const win10=new Native(()=>platformFixture(10));
  const win11=new Native(()=>platformFixture(11));
  for(const [client,label]of[[win10,'Windows 10'],[win11,'Windows 11']]){
    const status=await client.call('tweakInspect',{ids:require('../app/shared/tweaks.json').map(t=>t.id)});
    assert.equal(status.length,35);
    assert.equal(status.find(t=>t.id==='windowed-optimizations').available,label==='Windows 11');
    assert.equal(status.find(t=>t.id==='background-apps').available,label==='Windows 10');
  }
  const snapshot=await native.call('snapshot');
  assert.ok(snapshot.cpu);assert.ok(snapshot.memory.totalGB>0);assert.ok(Array.isArray(snapshot.gpu));assert.ok(Array.isArray(snapshot.disks));
  const games=await native.call('games');assert.ok(Array.isArray(games));
  const candidates=await native.call('memoryCandidates');assert.ok(Array.isArray(candidates));
  const plans=await native.call('powerPlans');assert.match(plans.active,/^[\da-f-]{36}$/);
  const animations=await native.call('animationsGet');assert.equal(typeof animations,'boolean');
  const catalog=require('../app/shared/tweaks.json');
  const statuses=await native.call('tweakInspect',{ids:catalog.map(t=>t.id)});
  assert.equal(statuses.length,35);assert.ok(statuses.every(s=>typeof s.available==='boolean'));
  const samples=[];let monitor;
  try {
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('No llegaron tres muestras de RAM en vivo.')),20000);
      monitor=new Telemetry(message=>{
        if(message.error){clearTimeout(timer);reject(new Error(message.error));return;}
        samples.push(message.sample);if(samples.length>=3){clearTimeout(timer);resolve();}
      });monitor.start();
    });
    assert.ok(samples.every(s=>s.memory.availableBytes>0));assert.ok(Number.isFinite(samples[2].cpuPercent));
    assert.ok(Date.parse(samples[2].capturedAt)>Date.parse(samples[0].capturedAt));
  } finally {monitor?.stop();}
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nexo-native-'));
  const service=new Service(native,new Store(path.join(dir,'state.json')));
  const ids=['menu-delay','advertising-id','game-capture','windowed-optimizations'];
  const originals=await native.call('tweakInspect',{ids});
  const eligible=originals.filter(t=>t.available&&!t.configured).map(t=>t.id);
  assert.ok(eligible.length>0,'Al menos un ajuste real debe ejercitar su escritura y restauracion.');
  try {
    const review=await service.reviewTweaks(eligible);await service.applyTweaks(review.id);
    const changed=await native.call('tweakInspect',{ids:eligible});assert.ok(changed.every(t=>t.configured));
  } finally {
    try {
      for(const entry of [...service.store.data.history])if(entry.status!=='restored')await service.restore(entry.id);
      const restored=await native.call('tweakInspect',{ids});
      for(const before of originals){const after=restored.find(t=>t.id===before.id);if(before.available)assert.deepEqual(after.before,before.before);}
    } finally {fs.rmSync(dir,{recursive:true,force:true});}
  }
  const graphicsDir=fs.mkdtempSync(path.join(os.tmpdir(),'nexo-game-native-'));
  const exe=path.join(graphicsDir,'NEXO-test.exe');fs.writeFileSync(exe,'');
  const options={exe,gpu:true,legacyFullscreen:true};
  const originalPrefs=await native.call('gamePreferences',options);
  const gameStore=new Store(path.join(graphicsDir,'state.json'));
  gameStore.data.games=[{id:'test',name:'Native test',source:'Manual',directory:graphicsDir,exe}];
  gameStore.data.profiles.test={performance:false,priority:false,gpu:true,legacyFullscreen:true};
  const gameService=new Service(native,gameStore);
  try{
    const seeds={gpu:'UnrelatedSetting=7;GpuPreference=1;',legacyFullscreen:'~ HIGHDPIAWARE'};
    for(const item of originalPrefs){
      const seed=structuredClone(item.after);seed[0].value=seeds[item.id];
      await native.call('gamePreferenceWrite',{exe,preference:item.id,value:seed});
    }
    await gameService.applyGame('test');
    const applied=await native.call('gamePreferences',options);
    assert.match(applied.find(t=>t.id==='gpu').before[0].value,/UnrelatedSetting=7;GpuPreference=2;/);
    assert.match(applied.find(t=>t.id==='legacyFullscreen').before[0].value,/HIGHDPIAWARE.*DISABLEDXMAXIMIZEDWINDOWEDMODE/);
    for(const entry of gameStore.data.history)await gameService.restore(entry.id);
    const restored=await native.call('gamePreferences',options);
    for(const entry of restored)assert.equal(entry.before[0].value,seeds[entry.id]);
  }finally{
    for(const item of originalPrefs)await native.call('gamePreferenceWrite',{exe,preference:item.id,value:item.before,restoring:true});
    const restored=await native.call('gamePreferences',options);
    for(const item of originalPrefs)assert.deepEqual(restored.find(t=>t.id===item.id).before,item.before);
    fs.rmSync(graphicsDir,{recursive:true,force:true});
  }
  console.log('GPU por juego y compatibilidad: tokens previos conservados y valores originales restaurados.');
  console.log('Windows: 35 preferencias inspeccionadas, registro verificado/restaurado y telemetria continua de RAM/CPU: OK.');
  const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true});
  let target;
  try {
    await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
    const processes=await native.call('priorityGet',{game:{source:'Manual',directory:path.dirname(process.execPath),exe:process.execPath}});
    target=processes.find(p=>p.pid===child.pid);assert.ok(target,'El proceso controlado debe detectarse.');
    await native.call('prioritySet',{...target,value:'AboveNormal'});
    const changed=await native.call('priorityGet',{game:{source:'Manual',directory:path.dirname(process.execPath),exe:process.execPath}});
    assert.equal(changed.find(p=>p.pid===child.pid).priority,'AboveNormal');
    await native.call('prioritySet',{...target,value:target.priority,restoring:true});
    const restored=await native.call('priorityGet',{game:{source:'Manual',directory:path.dirname(process.execPath),exe:process.execPath}});
    assert.equal(restored.find(p=>p.pid===child.pid).priority,target.priority);
    console.log('Windows: hardware, bibliotecas, energía (lectura), animaciones (lectura), candidatos RAM y prioridad/restauración de proceso de prueba: OK.');
  } finally {
    try{if(target)await native.call('prioritySet',{...target,value:target.priority,restoring:true});}finally{child.kill();}
  }
})().catch(e=>{
  console.error(e);
  const message=String(e.stack||e).replace(/%/g,'%25').replace(/\r/g,'%0D').replace(/\n/g,'%0A');
  console.error('::error title=Validación nativa de NEXO::'+message);
  process.exitCode=1;
});
