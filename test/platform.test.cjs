const {test}=require('node:test');const assert=require('node:assert/strict');const {classifyWindows}=require('../app/core/platform.cjs');const {Service}=require('../app/core/service.cjs');
test('only Windows 10/11 client editions are supported, regardless of server build numbers',()=>{
 for(const [caption,build,productType,expected]of[['Microsoft Windows 10 Pro',19045,1,true],['Microsoft Windows 11 Pro',22631,1,true],['Microsoft Windows 11 Home',26100,1,true],['Microsoft Windows Server 2025 Datacenter',26100,3,false],['Microsoft Windows 11 Pro',26100,3,false],['Microsoft Windows 12',30000,1,false],['Microsoft Windows 8.1',9600,1,false],['Microsoft Windows 10 Pro',22631,1,false],['Microsoft Windows 11 Pro',19045,1,false]])assert.equal(classifyWindows({caption,build,productType}).supported,expected,caption);
});
test('unsupported OS is blocked before any game optimization writes',async()=>{
 const calls=[];const service=new Service({call:async(action)=>{calls.push(action);return {caption:'Microsoft Windows Server 2025',build:26100,productType:3};}},{data:{games:[{id:'g'}],profiles:{},history:[]},save(){}},'win32');
 await assert.rejects(service.applyGame('g'),/Solo se admiten/);assert.deepEqual(calls,['platform']);
});
function laptop(){
 const plans={active:'balanced',performance:'performance',balanced:'balanced',saver:'saver',device:{isLaptop:true,acConnected:true}};const writes=[];
 const store={data:{version:1,games:[],profiles:{},history:[],benchmarks:[]},save(){}};
 const service=new Service({call:async(action,payload)=>{if(action==='platform')return {caption:'Windows 11 Pro',build:22631,productType:1};if(action==='powerPlans')return structuredClone(plans);if(action==='powerSet'){writes.push(payload.value);plans.active=payload.value;return true;}throw new Error(action);}},store,'win32');
 return {service,plans,writes,store};
}
test('laptop plans require detected laptop, availability and confirmed AC for performance',async()=>{const{service,plans,writes}=laptop();plans.device.isLaptop=false;await assert.rejects(service.reviewLaptopPlan('performance'),/portátiles/);plans.device.isLaptop=true;plans.device.acConnected=false;await assert.rejects(service.reviewLaptopPlan('performance'),/cargador/);plans.device.acConnected=true;plans.performance=null;await assert.rejects(service.reviewLaptopPlan('performance'),/fabricante/);assert.equal(writes.length,0);});
test('unplugging after laptop review prevents the plan from being applied',async()=>{const{service,plans,writes}=laptop();const review=await service.reviewLaptopPlan('performance');plans.device.acConnected=false;await assert.rejects(service.applyLaptopPlan(review.id),/desconectó/);assert.equal(writes.length,0);});
test('laptop plan is journalled and restores exact original plan',async()=>{const{service,plans,writes,store}=laptop();const review=await service.reviewLaptopPlan('saver');assert.equal(writes.length,0);await service.applyLaptopPlan(review.id);assert.equal(plans.active,'saver');assert.equal(store.data.history[0].before,'balanced');await service.restore(store.data.history[0].id);assert.equal(plans.active,'balanced');});
test('Windows client compatibility fixtures accept LF and CRLF checkouts',()=>{
 const{platformFixture}=require('./helpers/windows-platform.cjs');const{nativeScript}=require('../app/core/telemetry.cjs');
 for(const family of[10,11])for(const ending of['\n','\r\n']){const script=nativeScript().replace(/\r?\n/g,ending);assert.ok(platformFixture(family,script).includes("displayVersion='test fixture'"));}
});
