// Isolated resource-engine checks. The fixture catalogue exists only in this test process,
// and touches disposable keys/services/tasks and a temporary power-plan clone, never BCD, security or real NICs.
const fs=require('node:fs');const path=require('node:path');
const assert=require('node:assert/strict');const {randomUUID}=require('node:crypto');const {spawn}=require('node:child_process');
const {Native}=require('../app/core/native.cjs');const {nativeScript,powershell}=require('../app/core/telemetry.cjs');const {platformFixture}=require('../test/helpers/windows-platform.cjs');const catalogue=require('../app/core/catalog.cjs');
async function ps(script){return new Promise((resolve,reject)=>{const child=spawn(powershell(),['-NoLogo','-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,shell:false});let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);child.once('error',reject);child.once('close',code=>code===0?resolve(out.trim()):reject(new Error(err||out)));});}
(async()=>{
 if(process.platform!=='win32')throw new Error('Windows required.');
 const suffix=randomUUID().replaceAll('-','').slice(0,12),key='SOFTWARE\\NexoValidation\\'+suffix,name='NexoValidation_'+suffix,task='NexoValidation_'+suffix,plan=randomUUID();
 const definitions=[
  {id:'test-registry',values:[{hive:'LocalMachine',path:key,name:'Number',kind:'DWord',value:37},{hive:'LocalMachine',path:key,name:'Text',kind:'String',value:'NEXO fixture'}]},
  {id:'test-service',resources:[{type:'service',name}]},
  {id:'test-task',resources:[{type:'task',name:'\\'+task}]},
  {id:'test-power',energy:true,resources:[{type:'powerSetting',subgroup:'54533251-82be-4824-96c1-47b60b740d00',setting:'893dee8e-2bef-41e0-89c6-b55d0929964c',value:7}]}
 ].map(d=>({windows:['Windows 10','Windows 11'],minBuild:17763,admin:true,values:[],...d}));
 const embedded=Buffer.from(JSON.stringify(catalogue)).toString('base64'),replacement=Buffer.from(JSON.stringify(definitions)).toString('base64');
 const fixture=()=>platformFixture(11,nativeScript().replace(embedded,replacement)).replace(/try \{\r?\n  \$data = \[Text.Encoding\]/,match=>"function Get-CachedDevice { return @{isLaptop=$false;acConnected=$true;kind='desktop'} }\n"+match);
 const native=new Native(fixture);const originalPlan=(await new Native().call('powerPlans')).active;
 let createdService=false,createdTask=false,createdPlan=false;
 try{
  // Creating a stopped demand-start service is enough to test exact startup restoration.
  await ps(`$ErrorActionPreference='Stop'; & "$env:SystemRoot\\System32\\sc.exe" create '${name}' binPath= "$env:SystemRoot\\System32\\cmd.exe /c exit" start= demand | Out-Null; if($LASTEXITCODE -ne 0){throw 'sc create failed'}`);createdService=true;
  await ps(`$ErrorActionPreference='Stop'; $action=New-ScheduledTaskAction -Execute "$env:SystemRoot\\System32\\cmd.exe" -Argument '/c exit'; Register-ScheduledTask -TaskName '${task}' -Action $action -Force | Out-Null`);createdTask=true;
  await ps(`$ErrorActionPreference='Stop'; & "$env:SystemRoot\\System32\\powercfg.exe" /duplicatescheme '${originalPlan}' '${plan}' | Out-Null; if($LASTEXITCODE -ne 0){throw 'clone failed'}; & "$env:SystemRoot\\System32\\powercfg.exe" /setactive '${plan}' | Out-Null; if($LASTEXITCODE -ne 0){throw 'activate failed'}`);createdPlan=true;
  for(const id of definitions.map(d=>d.id)){
   const [before]=await native.call('tweakInspect',{ids:[id],scope:'general'});assert.equal(before.available,true,`${id}: ${before.reason}`);
   try{
    await native.call('tweakWrite',{tweakId:id,value:before.after,expectedBefore:before.before});
    const [after]=await native.call('tweakInspect',{ids:[id]});assert.equal(after.configured,true,id);
   }finally{
    await native.call('tweakWrite',{tweakId:id,value:before.before,restoring:true});
    const [restored]=await native.call('tweakInspect',{ids:[id]});assert.deepEqual(restored.before,before.before,id+' original state');
   }
   console.log('Native system resource round-trip:',id);
  }
  const [original]=await native.call('tweakInspect',{ids:['test-registry']});
  await ps(`$ErrorActionPreference='Stop'; New-Item -Path 'HKLM:\\${key}' -Force|Out-Null; New-ItemProperty -Path 'HKLM:\\${key}' -Name Number -Value 99 -PropertyType DWord -Force|Out-Null`);
  await assert.rejects(native.call('tweakWrite',{tweakId:'test-registry',expectedBefore:original.before,value:original.after}),e=>e.unchanged===true);
  assert.equal((await native.call('tweakInspect',{ids:['test-registry']}))[0].before[0].value,99,'External concurrent value must be preserved');
  await native.call('tweakWrite',{tweakId:'test-registry',value:original.before,restoring:true});
  console.log('Concurrent no-write rejection preserves external state.');
 }finally{
  await ps(`$ErrorActionPreference='Continue'; & "$env:SystemRoot\\System32\\powercfg.exe" /setactive '${originalPlan}' | Out-Null; ${createdPlan?`& "$env:SystemRoot\\System32\\powercfg.exe" /delete '${plan}' | Out-Null;`:''} ${createdTask?`Unregister-ScheduledTask -TaskName '${task}' -Confirm:$false -ErrorAction SilentlyContinue;`:''} ${createdService?`& "$env:SystemRoot\\System32\\sc.exe" delete '${name}' | Out-Null;`:''} Remove-Item -LiteralPath 'HKLM:\\${key}' -Recurse -Force -ErrorAction SilentlyContinue; exit 0`);
 }
 // Cleanup is exercised only on files this test created. A junction must never redirect deletion.
 const tempRoot=await ps("[Console]::Write((Join-Path $env:LOCALAPPDATA 'Temp'))");
 const cleanupDir=path.join(tempRoot,name),outside=path.join(tempRoot,name+'-outside'),nested=path.join(cleanupDir,'nested'),link=path.join(cleanupDir,'redirect');
 fs.mkdirSync(nested,{recursive:true});fs.mkdirSync(outside,{recursive:true});
 const old=path.join(nested,'old.tmp'),changed=path.join(nested,'changed.tmp'),young=path.join(nested,'young.tmp'),protectedFile=path.join(outside,'keep.txt');
 for(const file of [old,changed,protectedFile]){fs.writeFileSync(file,'fixture');fs.utimesSync(file,new Date('2001-01-01'),new Date('2001-01-01'));}
 fs.writeFileSync(young,'recent');
 try{
  fs.symlinkSync(outside,link,'junction');
  const client=new Native(()=>platformFixture(11));const list=await client.call('toolInspect',{tool:'temp'});
  const a=list.find(x=>x.path.toLowerCase()===old.toLowerCase()),b=list.find(x=>x.path.toLowerCase()===changed.toLowerCase());
  assert.ok(a&&b,'Old nested files must be detected');assert.ok(!list.some(x=>x.path.toLowerCase().startsWith(link.toLowerCase()+'\\')),'No traversal through a junction');
  assert.ok(!list.some(x=>x.path.toLowerCase()===young.toLowerCase()),'Recent files excluded');
  fs.writeFileSync(changed,'changed after review');
  const malicious={...a,path:path.join(link,'keep.txt'),id:path.join(link,'keep.txt')};
  const result=await client.call('toolApply',{tool:'temp',items:[a,b,malicious]});
  assert.equal(result.results.filter(x=>x.ok).length,1);assert.equal(result.bytes,7);assert.ok(!fs.existsSync(old));assert.ok(fs.existsSync(changed));assert.ok(fs.existsSync(young));assert.equal(fs.readFileSync(protectedFile,'utf8'),'fixture');
  console.log('Cleanup: reviewed nested file deleted, changed/recent/junction targets preserved.');
 }finally{try{fs.unlinkSync(link)}catch{};fs.rmSync(cleanupDir,{recursive:true,force:true});fs.rmSync(outside,{recursive:true,force:true});}
 const production=new Native();const diagnostics=await production.call('diagnostics');assert.equal(typeof diagnostics.admin,'boolean');assert.ok(diagnostics.cpu.name);assert.ok(Array.isArray(diagnostics.memoryModules));assert.ok(Array.isArray(diagnostics.volumes));
 console.log('Detailed hardware diagnostics read successfully.');
})().catch(e=>{console.error(e);process.exitCode=1;});
