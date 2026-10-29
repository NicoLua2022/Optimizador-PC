export const demoGames = [
  { id:'demo:cs2',name:'Counter-Strike 2',source:'Steam',directory:'Demo',art:'cs2' },
  { id:'demo:valorant',name:'VALORANT',source:'Riot',directory:'Demo',art:'valorant' },
  { id:'demo:fortnite',name:'Fortnite',source:'Epic Games',directory:'Demo',art:'fortnite' },
  { id:'demo:apex',name:'Apex Legends',source:'Steam',directory:'Demo',art:'apex' }
];
const demoState = { version:1, platform:'linux',demo:true,games:demoGames,profiles:{},history:[],benchmarks:[] };
const unavailable = async () => { throw new Error('Esta acción necesita la aplicación de escritorio en Windows. La demostración no modifica tu equipo.'); };
let demoTick=0;
export const demoAPI = {
  tweakCatalog:async()=>demoAPI.catalog||fetch('./catalog.json').then(r=>r.json()),
  tweakStatus:async()=>{const catalog=await demoAPI.tweakCatalog();const p=(await demoAPI.snapshot()).platform;return catalog.map(t=>{const available=p.supported&&(!t.windows||t.windows.includes(p.family))&&p.build>=t.minBuild&&(!t.maxBuild||p.build<=t.maxBuild);return {id:t.id,available,configured:false,reason:available?null:'Ejemplo: no compatible con la versión detectada.'};});},
  reviewTweaks:async ids=>({id:'demo-review',changes:ids.map(id=>({id}))}),
  applyTweaks:unavailable,
  onTelemetry:callback=>{const sample=async()=>{const data=await demoAPI.snapshot();demoTick++;data.memory.availableGB=Number((21.8+Math.sin(demoTick/3)*.8).toFixed(3));data.memory.usedPercent=100*(1-data.memory.availableGB/32);data.cpuPercent=24+Math.sin(demoTick/2)*5;data.capturedAt=new Date().toISOString();callback({sample:data});};sample();const timer=setInterval(sample,1000);return ()=>clearInterval(timer);},
  state:async()=>structuredClone(demoState),
  snapshot:async()=>({platform:demoAPI.platform||{family:'Windows 11',caption:'Microsoft Windows 11 Pro',build:22631,displayVersion:'23H2',architecture:'64 bits',productType:1,supported:true},device:demoAPI.device||{kind:'desktop',isLaptop:false,acConnected:true,batteryPercent:null},cpu:'AMD Ryzen 7 5700',cores:8,threads:16,cpuPercent:24,memory:{totalGB:32,availableGB:21.8,usedPercent:32},gpu:[{name:'NVIDIA GeForce RTX 5070',driver:'Ejemplo'}],disks:[{name:'C:',label:'SSD principal',totalGB:1000,freeGB:642},{name:'E:',label:'Almacenamiento externo',totalGB:3000,freeGB:1840}],os:'Windows 11 · Ejemplo',gpuPercent:null,onBattery:false}),
  ...Object.fromEntries(['reviewLaptopPlan','applyLaptopPlan','chooseGameExecutable','scan','profile','apply','animations','restore','memoryCandidates','trim','addGame','launch','importBenchmark'].map(x=>[x,unavailable]))
};
