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
  tweakStatus:async()=>{const catalog=await demoAPI.tweakCatalog();return catalog.map(t=>({id:t.id,available:!t.maxBuild,configured:false,reason:t.maxBuild?'Ejemplo: ajuste exclusivo de Windows 10.':null}));},
  reviewTweaks:async ids=>({id:'demo-review',changes:ids.map(id=>({id}))}),
  applyTweaks:unavailable,
  onTelemetry:callback=>{const sample=async()=>{const data=await demoAPI.snapshot();demoTick++;data.memory.availableGB=Number((21.8+Math.sin(demoTick/3)*.8).toFixed(3));data.memory.usedPercent=100*(1-data.memory.availableGB/32);data.cpuPercent=24+Math.sin(demoTick/2)*5;data.capturedAt=new Date().toISOString();callback({sample:data});};sample();const timer=setInterval(sample,1000);return ()=>clearInterval(timer);},
  state:async()=>structuredClone(demoState),
  snapshot:async()=>({cpu:'AMD Ryzen 7 5700',cores:8,threads:16,cpuPercent:24,memory:{totalGB:32,availableGB:21.8,usedPercent:32},gpu:[{name:'NVIDIA GeForce RTX 5070',driver:'Ejemplo'}],disks:[{name:'C:',label:'SSD principal',totalGB:1000,freeGB:642},{name:'E:',label:'Almacenamiento externo',totalGB:3000,freeGB:1840}],os:'Windows 11 · Ejemplo',gpuPercent:null,onBattery:false}),
  ...Object.fromEntries(['scan','profile','apply','animations','restore','memoryCandidates','trim','addGame','launch','importBenchmark'].map(x=>[x,unavailable]))
};
