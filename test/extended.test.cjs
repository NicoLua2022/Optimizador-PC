const {test}=require('node:test');const assert=require('node:assert/strict');
const {Service}=require('../app/core/service.cjs');const catalog=require('../app/core/catalog.cjs');const tools=require('../app/shared/tools.json');const coverage=require('../docs/frameforge-coverage.json');
function fixture(){
 const store={data:{version:1,games:[],profiles:{},history:[],benchmarks:[]},save(){}};const writes=[],snapshots=new Map();let failure=null;
 function inspection(id){const t=catalog.find(x=>x.id===id);if(!snapshots.has(id))snapshots.set(id,(t.resources||t.values).map((v,i)=>v.type?{type:v.type,key:id+':'+i,target:{name:v.name||id},state:{enabled:true}}:{path:v.path,name:v.name,...(v.hive?{hive:v.hive}:{}),keyExisted:false,exists:false,kind:null,value:null}));const before=structuredClone(snapshots.get(id));const after=before.map((v,i)=>v.type?{...v,state:{enabled:false}}:{...v,exists:true,keyExisted:true,kind:t.values[i].kind,value:t.values[i].value??'1'});return {id,available:true,configured:false,before,after};}
 const native={async call(action,payload){
  if(action==='platform')return {caption:'Microsoft Windows 11 Pro',build:26100,productType:1};
  if(action==='tweakInspect')return payload.ids.map(inspection);
  if(action==='restorePoint')return {created:false,reason:'Protección del sistema no disponible en fixture'};
  if(action==='tweakWrite'){writes.push({payload:structuredClone(payload),journal:structuredClone(store.data.history)});if(failure)failure(payload);snapshots.set(payload.tweakId,structuredClone(payload.value));return true;}
  if(action==='toolInspect')return [{id:'allowed-app-v1',name:'Allowed',kind:'app'}];
  if(action==='toolApply'){writes.push({payload:structuredClone(payload),activity:structuredClone(store.data.activity)});return {results:[{name:'Allowed',ok:true,reason:'done'}],restorable:false};}
  throw new Error('Unexpected '+action);
 }};
 const service=new Service(native,store,'win32');return {service,store,writes,snapshots,fail:fn=>failure=fn};
}
test('all 81 reference features resolve to real catalogue entries or reviewed tools',()=>{
 assert.equal(coverage.features.length,81);assert.equal(new Set(coverage.features.map(x=>x.referenceId)).size,81);
 for(const f of coverage.features){assert.ok(f.nexo.length);for(const id of f.nexo)assert.ok(id.startsWith('tool:')?tools.some(t=>t.id===id.slice(5)):catalog.some(t=>t.id===id),id);}
 assert.equal(new Set(catalog.map(t=>t.id)).size,catalog.length);
 for(const t of catalog){assert.ok(t.windows.every(w=>['Windows 10','Windows 11'].includes(w)));if(t.risk==='security')assert.equal(t.recommended,false);if(t.resources)assert.equal(t.admin,true);}
});
test('critical changes require independent consent and security requires exact phrase, even with ordinary confirmations disabled',async()=>{
 const {service,writes}=fixture();service.preferences({confirmFeatureChanges:false});
 let review=await service.reviewTweaks(['security-vbs']);assert.equal(review.security,true);await assert.rejects(service.applyTweaks(review.id),/Confirma/);assert.equal(writes.length,0);
 review=await service.reviewTweaks(['security-vbs']);await assert.rejects(service.applyTweaks(review.id,{acknowledged:true,phrase:'yes'}),/ACEPTO/);assert.equal(writes.length,0);
 review=await service.reviewTweaks(['security-vbs']);await service.applyTweaks(review.id,{acknowledged:true,phrase:'ACEPTO EL RIESGO'});assert.equal(writes.length,1);assert.ok(writes[0].payload.expectedBefore);assert.equal(writes[0].journal[0].status,'pending');
});
test('system resource originals survive local restore point failure and remain restorable',async()=>{
 const {service,store,snapshots}=fixture();let review=await service.reviewTweaks(['memory-compression']);const original=structuredClone(review.changes[0].before);await service.applyTweaks(review.id);
 assert.ok(store.data.activity.some(a=>a.action==='restore-point'&&a.details.created===false));await service.restore(store.data.history[0].id);assert.deepEqual(snapshots.get('memory-compression'),original);
});
test('confirmed pre-write rejection is never rolled back over an external Windows change',async()=>{
 const {service,store,writes,fail}=fixture();fail(p=>{if(p.tweakId==='menu-delay'&&!p.restoring){const e=new Error('stale');e.unchanged=true;throw e;}});
 const review=await service.reviewTweaks(['advertising-id','menu-delay']);await assert.rejects(service.applyTweaks(review.id),/stale/);
 assert.equal(store.data.history.find(h=>h.target.tweakId==='menu-delay').status,'cancelled');assert.equal(store.data.history.find(h=>h.target.tweakId==='advertising-id').status,'restored');assert.ok(!writes.some(w=>w.payload.tweakId==='menu-delay'&&w.payload.restoring));
});
test('contradictory full-screen policies cannot be reviewed together or layered on active changes',async()=>{
 const {service,store}=fixture();await assert.rejects(service.reviewTweaks(['fullscreen-global','windowed-optimizations']),/contradicen/);
 const review=await service.reviewTweaks(['fullscreen-global']);await service.applyTweaks(review.id);assert.equal(store.data.history[0].status,'applied');await assert.rejects(service.reviewTweaks(['windowed-optimizations']),/contradicen/);
});
test('restore-all proceeds in reverse order and retains failed originals for recovery',async()=>{
 const {service,store,writes,fail}=fixture();const review=await service.reviewTweaks(['advertising-id','menu-delay']);await service.applyTweaks(review.id);writes.length=0;
 fail(p=>{if(p.restoring&&p.tweakId==='menu-delay')throw new Error('restore denied');});const report=await service.restoreAll();
 assert.equal(writes[0].payload.tweakId,'menu-delay');assert.equal(report.results.filter(x=>x.ok).length,1);assert.equal(store.data.history[0].status,'restore-failed');assert.ok(store.data.history[0].before.length);assert.equal(store.data.history[1].status,'restored');
});
test('a created plan is not deleted while its parameter restoration is unresolved',async()=>{
 const {service,store,writes}=fixture();const plan={id:'p',kind:'tweak',target:{tweakId:'dedicated-plan'},status:'applied',before:[],after:[{type:'dedicatedPlan',target:{guid:'nexo-plan'}}]};
 store.data.history=[{id:'s',kind:'tweak',target:{tweakId:'cpu-minimum'},status:'restore-failed',after:[{type:'powerSetting',target:{scheme:'nexo-plan'}}]},plan];
 await assert.rejects(service.restore('p'),/parámetros/);assert.equal(writes.length,0);
});
test('tool review accepts only inspected IDs, requires consent, is single use and logs before irreversible work',async()=>{
 const {service,store,writes}=fixture();await assert.rejects(service.reviewTool('apps-news',['arbitrary-package']),/selección cambió/);assert.equal(writes.length,0);
 let review=await service.reviewTool('apps-news',['allowed-app-v1']);review.items[0].id='injected';await assert.rejects(service.applyTool(review.id,false),/confirmar/);assert.equal(writes.length,0);
 review=await service.reviewTool('apps-news',['allowed-app-v1']);await service.applyTool(review.id,true);assert.equal(writes[0].payload.items[0].id,'allowed-app-v1');assert.ok(writes[0].activity.some(x=>x.action==='tool-pending'));assert.equal(store.data.history.length,0);assert.ok(store.data.activity.some(x=>x.action==='tool-result'));await assert.rejects(service.applyTool(review.id,true),/caducó/);
});
test('preferences retain old profile/history schema and cannot turn off critical consent with extra fields',()=>{
 const {service,store}=fixture();assert.equal(store.data.version,1);assert.equal(store.data.settings.autoRestorePoint,true);assert.equal(store.data.settings.showAdvanced,false);assert.throws(()=>service.preferences({skipSecurityConsent:true}));assert.throws(()=>service.preferences({showAdvanced:'true'}));service.preferences({showAdvanced:true});assert.equal(service.state().settings.showAdvanced,true);
});
test('rescans retain a selected executable only while it still belongs to the detected installation',async()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');const root=fs.mkdtempSync(path.join(os.tmpdir(),'nexo-scan-'));const first=path.join(root,'first'),second=path.join(root,'second');fs.mkdirSync(first);fs.mkdirSync(second);const exe=path.join(first,'game.exe');fs.writeFileSync(exe,'fixture');
 try{let directory=first;const store={data:{version:1,games:[{id:'steam:1',source:'Steam',directory:first,exe}],profiles:{'steam:1':{gpu:true}},history:[],benchmarks:[]},save(){}};const service=new Service({call:async()=>[{id:'steam:1',source:'Steam',directory,exe:null}]},store,'win32');await service.scan();assert.equal(store.data.games[0].exe,exe);directory=second;await service.scan();assert.equal(store.data.games[0].exe,null);assert.equal(store.data.profiles['steam:1'].gpu,true);}finally{fs.rmSync(root,{recursive:true,force:true});}
});
