// Exercises read-only discovery and ONLY the priority of a test process we spawn.
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const path=require('node:path');
const {Native}=require('../app/core/native.cjs');
(async()=>{
  if(process.platform!=='win32')throw new Error('Esta validación requiere Windows real.');
  const native=new Native();
  const snapshot=await native.call('snapshot');
  assert.ok(snapshot.cpu);assert.ok(snapshot.memory.totalGB>0);assert.ok(Array.isArray(snapshot.gpu));assert.ok(Array.isArray(snapshot.disks));
  const games=await native.call('games');assert.ok(Array.isArray(games));
  const candidates=await native.call('memoryCandidates');assert.ok(Array.isArray(candidates));
  const plans=await native.call('powerPlans');assert.match(plans.active,/^[\da-f-]{36}$/);
  const animations=await native.call('animationsGet');assert.equal(typeof animations,'boolean');
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
})().catch(e=>{console.error(e);process.exitCode=1;});
