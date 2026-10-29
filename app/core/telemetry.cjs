const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
function nativeScript() {
  return fs.readFileSync(path.join(__dirname,'../native/bridge.ps1'),'utf8')
    .replace('# NEXO_PLATFORM_FUNCTIONS',()=>fs.readFileSync(path.join(__dirname,'../native/platform.ps1'),'utf8'))
    .replace('# NEXO_TWEAK_FUNCTIONS',fs.readFileSync(path.join(__dirname,'../native/tweaks.ps1'),'utf8'))
    .replace('__NEXO_CATALOG__',Buffer.from(fs.readFileSync(path.join(__dirname,'../shared/tweaks.json'))).toString('base64'));
}
function powershell() { return path.join(process.env.SystemRoot || 'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'); }
class Telemetry {
  constructor(send, launch=spawn, delay=5000) { this.send=send;this.launch=launch;this.delay=delay;this.stopped=true; }
  start() {
    if(!this.stopped)return;
    this.stopped=false;this.connect();
  }
  connect() {
    if(this.stopped)return;
    let buffer='',stderr='',finished=false;
    const child=this.launch(powershell(),['-NoLogo','-NoProfile','-NonInteractive','-Command',"& { $script=[scriptblock]::Create([Console]::In.ReadToEnd()); & $script -Action 'metricsStream' }"],{windowsHide:true,shell:false});
    this.child=child;
    const fail=message=>{
      if(finished)return;finished=true;clearTimeout(this.watchdog);child.kill();
      if(!this.stopped){this.send({error:message});this.retry=setTimeout(()=>this.connect(),this.delay);}
    };
    const watchdog=()=>{clearTimeout(this.watchdog);this.watchdog=setTimeout(()=>fail('La lectura en vivo dejo de responder. Reconectando…'),10000);};
    watchdog();
    child.stdin.on('error',()=>{});child.stdin.end(nativeScript());
    child.stdout.on('data',chunk=>{
      if(finished||this.stopped)return;
      buffer+=chunk.toString('utf8');if(buffer.length>65536)return fail('Respuesta de telemetria demasiado grande.');
      let newline;
      while((newline=buffer.indexOf('\n'))>=0){
        const line=buffer.slice(0,newline).replace(/^\uFEFF/,'').trim();buffer=buffer.slice(newline+1);if(!line)continue;
        try{const result=JSON.parse(line);if(result.error)return fail(result.error);const sample=result.data;
          if(!sample||!Number.isFinite(sample.memory?.availableGB)||!Number.isFinite(sample.memory?.usedPercent))return fail('Lectura de memoria no valida.');
          watchdog();this.send({sample});
        }catch{return fail('No se pudo leer la telemetria de Windows.');}
      }
    });
    child.stderr.on('data',b=>{if(stderr.length<1000)stderr+=b.toString();});
    child.once('error',e=>fail(e.message));child.once('close',()=>fail('Se cerro el monitor de Windows. '+stderr.slice(0,200)));
  }
  stop(){this.stopped=true;clearTimeout(this.retry);clearTimeout(this.watchdog);this.child?.kill();this.child=null;}
}
module.exports={Telemetry,nativeScript,powershell};
