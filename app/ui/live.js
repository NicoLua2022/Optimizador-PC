export class LiveMetrics {
  constructor(){this.history=[];this.lastReceived=0;this.startedAt=Date.now();this.error='';}
  receive(message,snapshot){
    if(message.error){this.error=message.error;this.paint(snapshot);return;}
    const sample=message.sample;if(!sample?.memory||!Number.isFinite(sample.memory.availableGB))return;
    Object.assign(snapshot,{memory:sample.memory,capturedAt:sample.capturedAt});
    if(Number.isFinite(sample.cpuPercent))snapshot.cpuPercent=sample.cpuPercent;
    if(Object.hasOwn(sample,'gpuTelemetry'))snapshot.gpuTelemetry=sample.gpuTelemetry;
    if(sample.power&&snapshot.device){snapshot.device.acConnected=sample.power.acConnected;snapshot.device.batteryPercent=sample.power.batteryPercent;}
    this.lastReceived=Date.now();this.error='';this.history.push(sample.memory.usedPercent);if(this.history.length>60)this.history.shift();this.paint(snapshot);
  }
  paint(snapshot){
    if(!snapshot?.memory)return;
    const m=snapshot.memory,used=Number.isFinite(m.totalBytes)&&Number.isFinite(m.availableBytes)?(m.totalBytes-m.availableBytes)/1073741824:m.totalGB-m.availableGB;
    const set=(selector,value)=>document.querySelectorAll(selector).forEach(e=>e.textContent=value);
    set('[data-live="battery-percent"]',snapshot.device?.isLaptop&&Number.isFinite(snapshot.device.batteryPercent)?snapshot.device.batteryPercent+' %':'—');
    set('[data-live="ac-status"]',!snapshot.device?.isLaptop?'No hay una laptop detectada':snapshot.device.acConnected===true?'Cargador conectado':snapshot.device.acConnected===false?'Usando batería':'Alimentación sin confirmar');
    set('[data-live="ram-free"]',m.availableGB.toFixed(2));set('[data-live="ram-used"]',used.toFixed(2));set('[data-live="ram-total"]',m.totalGB.toFixed(1));set('[data-live="ram-percent"]',Math.round(m.usedPercent));
    const age=this.lastReceived?Date.now()-this.lastReceived:Date.now()-this.startedAt,stale=age>5000||!!this.error;
    set('[data-live="time"]',this.lastReceived?new Date(this.lastReceived).toLocaleTimeString('es-MX'):'Esperando primera muestra…');
    set('[data-live="status"]',stale?'Sin señal reciente':!this.lastReceived?'Conectando monitor…':'En vivo · cada segundo');
    document.querySelectorAll('.stream-status').forEach(e=>e.classList.toggle('stale',stale));
    const error=document.querySelector('[data-live="error"]');if(error){error.textContent=this.error||'La lectura lleva más de 5 segundos sin actualizarse. Reconectando…';error.hidden=!stale;}
    const memoryMetric=document.querySelector('[data-metric="memory"]');
    if(memoryMetric){memoryMetric.querySelector('.metric-value').textContent=Math.round(m.usedPercent);memoryMetric.querySelector('.metric-caption').textContent=`${used.toFixed(2)} de ${m.totalGB} GB en uso`;memoryMetric.querySelector('.ring-value').setAttribute('class',`ring-value ring-p${Math.round(m.usedPercent/5)*5}`);}
    const cpu=document.querySelector('[data-metric="cpu"]');if(cpu&&Number.isFinite(snapshot.cpuPercent)){cpu.querySelector('.metric-value').textContent=Math.round(snapshot.cpuPercent);cpu.querySelector('.ring-value').setAttribute('class',`ring-value ring-p${Math.round(snapshot.cpuPercent/5)*5}`);}
    const gpu=document.querySelector('[data-metric="gpu"]'),g=snapshot.gpuTelemetry;
    if(gpu){const fresh=g&&Date.now()-Date.parse(g.capturedAt)<10000;gpu.querySelector('.metric-value').textContent=fresh&&Number.isFinite(g.utilization)?Math.round(g.utilization):'—';gpu.querySelector('.metric-caption').textContent=fresh?`${g.temperatureC??'—'} °C · VRAM ${g.memoryUsedMB??'—'} / ${g.memoryTotalMB??'—'} MB`:'Sin lectura NVIDIA compatible';gpu.querySelector('.ring-value').setAttribute('class',`ring-value ring-p${fresh&&Number.isFinite(g.utilization)?Math.round(g.utilization/5)*5:0}`);}
    document.querySelectorAll('.memory-bar>span').forEach(e=>e.className=`usage-p${Math.round(m.usedPercent/5)*5}`);
    const graph=document.querySelector('#ram-sparkline');if(graph&&this.history.length){const points=this.history.map((v,i)=>`${i*600/59},${100-Math.max(0,Math.min(100,v))}`).join(' ');graph.setAttribute('points',points);}
  }
}
