export const demoGames = [
  { id:'demo:cs2',name:'Counter-Strike 2',source:'Steam',directory:'Demo',art:'cs2' },
  { id:'demo:valorant',name:'VALORANT',source:'Riot',directory:'Demo',art:'valorant' },
  { id:'demo:fortnite',name:'Fortnite',source:'Epic Games',directory:'Demo',art:'fortnite' },
  { id:'demo:apex',name:'Apex Legends',source:'Steam',directory:'Demo',art:'apex' }
];
const demoState = { version:1, platform:'linux',demo:true,games:demoGames,profiles:{},history:[],benchmarks:[] };
const unavailable = async () => { throw new Error('Esta acción necesita la aplicación de escritorio en Windows. La demostración no modifica tu equipo.'); };
export const demoAPI = {
  state:async()=>structuredClone(demoState),
  snapshot:async()=>({cpu:'AMD Ryzen 7 5700',cores:8,threads:16,cpuPercent:24,memory:{totalGB:32,availableGB:21.8,usedPercent:32},gpu:[{name:'NVIDIA GeForce RTX 5070',driver:'Ejemplo'}],disks:[{name:'C:',label:'SSD principal',totalGB:1000,freeGB:642},{name:'E:',label:'Almacenamiento externo',totalGB:3000,freeGB:1840}],os:'Windows 11 · Ejemplo',gpuPercent:null,onBattery:false}),
  ...Object.fromEntries(['scan','profile','apply','animations','restore','memoryCandidates','trim','addGame','launch','importBenchmark'].map(x=>[x,unavailable]))
};
