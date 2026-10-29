import { demoAPI, demoGames } from './demo.js';
import { TweakLibrary } from './tweak-library.js';
import { LiveMetrics } from './live.js';
import { renderHub } from './hub.js';
import { gameArtwork } from './game-art.js';
import { laptopPage } from './laptop.js';
import { recommendations } from './recommendations.js';
const icons = {
  home:'M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z',
  games:'M7 7h10c3 0 5 10 3 11-2 1-4-3-5-3H9c-1 0-3 4-5 3C2 17 4 7 7 7ZM6 11h5m-2.5-2.5v5M16 11h.01M18 13h.01',
  tune:'M4 7h16M4 17h16M8 4v6M16 14v6',
  memory:'M6 5h12v14H6ZM9 9h6v6H9ZM3 8h3m-3 4h3m-3 4h3m12-8h3m-3 4h3m-3 4h3M9 2v3m6-3v3M9 19v3m6-3v3',
  chart:'M4 3v17h17M7 14l4-5 4 3 5-7',
  history:'M3 10a9 9 0 1 1 2 8M3 4v6h6m3-3v6l4 2',
  settings:'m9 3-1 3-3 1-2 4 2 2v3l3 2 1 3h6l1-3 3-2v-3l2-2-2-4-3-1-1-3ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  arrow:'M5 12h14m-6-6 6 6-6 6',
  scan:'M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5M7 12h10',
  shield:'m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6ZM8 12l3 3 5-6',
  cpu:'M5 5h14v14H5ZM9 9h6v6H9ZM8 2v3m8-3v3M8 19v3m8-3v3M2 8h3m-3 8h3M19 8h3m-3 8h3',
  gpu:'M3 6h18v12H3Zm4 15v-3m8 3v-3M16 9v6m-6-6a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
  disk:'m6 3-3 12v6h18v-6L18 3ZM3 15h18M7 18h.01M10 18h.01',
  check:'m5 12 4 4L19 6',
  plus:'M12 5v14M5 12h14',
  close:'m6 6 12 12M6 18 18 6',
  bolt:'m13 2-9 12h7l-1 8 10-13h-7Z',
  info:'M12 11v6m0-10h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  play:'m8 4 12 8-12 8Z',
  restore:'M3 10a9 9 0 1 1 3 9M3 4v6h6',
  battery:'M3 7h16v10H3Zm18 3v4M7 10v4m4-4v4'
};
const icon = (name, cls='')=>`<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${icons[name]||icons.info}"/></svg>`;
const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let api = window.nexo || demoAPI;
let laptopReview=null;
let state, snapshot, route = location.hash.slice(1) || 'dashboard', busy = false, candidates = [], search = '', sourceFilter = 'Todos', telemetryError = '';
const routes = [['dashboard','Resumen','home'],['games','Mis juegos','games'],['optimize','Optimización','tune'],['laptop','Laptop','battery'],['memory','Memoria RAM','memory'],['benchmark','Comparar FPS','chart'],['history','Historial','history']];
const $ = selector => document.querySelector(selector);
const live=new LiveMetrics();
const tweaks=new TweakLibrary({api:()=>state.demo?demoAPI:api,demo:()=>state.demo,state:()=>state,snapshot:()=>snapshot,render:()=>render(),setState:value=>state=value,icon,escape,button,openDialog,perform,toast});
function toast(message, error=false) { const t=$('#toast'); t.textContent=message; t.className=error?'error':''; t.hidden=false; clearTimeout(toast.timer); toast.timer=setTimeout(()=>t.hidden=true,7000); }
function header(eyebrow,title,subtitle,button='') { return `<div class="page-heading"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${subtitle}</p></div>${button}</div>`; }
function button(text,action,kind='secondary',ico='arrow',extra='') { return `<button class="button ${kind}" data-action="${action}" ${extra}>${icon(ico)}${text}</button>`; }
function empty(title,text,ico='games') { return `<div class="empty">${icon(ico)}<h3>${title}</h3><p>${text}</p></div>`; }
function artwork(game){return gameArtwork(game,escape);}
function gameCard(game) { const p=state.profiles[game.id]; return `<button class="game-card" data-action="game" data-id="${escape(game.id)}">${artwork(game)}<div class="game-info"><div class="game-name">${escape(game.name)}${icon('arrow')}</div><div class="game-meta"><span>${escape(game.source)}</span><span class="profile-label ${p?'configured':''}">${p?'Perfil configurado':'Sin ajustes'}</span></div></div></button>`; }
function telemetryCard(label,ico,value,unit,sub,kind) {
  const percent=Number.isFinite(value)?Math.max(0,Math.min(100,value)):0;
  return `<section class="panel metric ${kind}" data-metric="${ico}"><div class="metric-label">${icon(ico)}${label}<span class="live-dot"></span></div><div class="metric-data"><div><strong class="metric-value">${Number.isFinite(value)?Math.round(value):'—'}</strong><span>${unit}</span><p class="metric-caption">${sub}</p></div><svg class="ring" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="40"/><circle class="ring-value ring-p${Math.round(percent/5)*5}" cx="50" cy="50" r="40"/><path d="M36 51h8l5-12 7 23 5-11h5"/></svg></div></section>`;
}
function dashboard(){return renderHub({state,snapshot,icon,escape,button,gameCard,telemetryCard,empty});}

function gamesPage() {
  const filtered=state.games.filter(g=>(sourceFilter==='Todos'||g.source===sourceFilter)&&g.name.toLowerCase().includes(search.toLowerCase()));
  return `${header('BIBLIOTECA','Tus juegos. Tus reglas.','Perfiles individuales, sin modificar los archivos del juego.',button('Buscar juegos','scan','primary','scan'))}<div class="library-toolbar"><div class="tabs">${['Todos',...new Set(state.games.map(g=>g.source))].map(s=>`<button class="filter ${sourceFilter===s?'active':''}" data-filter="${escape(s)}">${escape(s)}</button>`).join('')}</div><div class="search-add"><input id="game-search" type="search" placeholder="Buscar un juego…" aria-label="Buscar un juego" value="${escape(search)}">${button('Añadir juego','add','secondary','plus')}</div></div><div class="game-grid library" id="game-list">${filtered.map(gameCard).join('')||empty('Aún no hay juegos aquí','Busca instalaciones de Steam, Epic y Riot o añade su ejecutable.')}</div><div class="notice">${icon('info')} El escaneo busca instalaciones locales, también en bibliotecas de Steam en discos externos conectados. No busca en todo tu disco. Xbox y otros launchers: añade el .exe manualmente.</div>`;
}
function optimizePage() { return tweaks.render(); }

function memoryPage() {
  const m=snapshot?.memory;
  return `${header('RESPIRA, SIN FORZAR','Memoria con espacio.','Windows aprovecha la RAM libre como caché. Un uso alto no siempre es un problema.',button('Analizar aplicaciones','memory-scan','primary','scan'))}<div class="live-monitor-bar"><span class="stream-status"><i></i><b data-live="status">Conectando monitor…</b></span><span>Última lectura <time data-live="time">—</time></span></div><div class="notice warning" data-live="error" hidden></div><div class="memory-layout"><section class="panel memory-overview"><div class="metric-label">${icon('memory')} ESTADO DE LA MEMORIA</div><div class="memory-number"><strong data-live="ram-free">${m?m.availableGB.toFixed(2):'—'}</strong><span>GB disponibles</span></div><div class="memory-bar"><span class="usage-p${m?Math.round(m.usedPercent/5)*5:0}"></span></div><div class="memory-chart"><svg viewBox="0 0 600 100" preserveAspectRatio="none" aria-label="Historial de uso de RAM, últimas 60 muestras"><path class="chart-guide" d="M0 25H600M0 50H600M0 75H600"/><polyline id="ram-sparkline" points=""/></svg><div><span>Últimas 60 muestras</span><span><b data-live="ram-percent">${m?Math.round(m.usedPercent):'—'}</b> % en uso</span></div></div><div class="memory-legend"><span><i></i>En uso <b data-live="ram-used">${m?(m.totalGB-m.availableGB).toFixed(2):'—'}</b> GB</span><span>Total <b data-live="ram-total">${m?m.totalGB:'—'}</b> GB</span></div><div class="notice">No ejecutamos limpiezas automáticas. Vaciar la RAM puede obligar a releer datos del SSD y causar tirones.</div></section><section class="panel memory-explainer"><span class="feature-icon green">${icon('shield')}</span><h2>Una limpieza selectiva.</h2><p>Reduce el conjunto residente (working set) de navegadores, Discord, Teams o Spotify que selecciones. No cierra aplicaciones ni borra archivos.</p><p>Los procesos en primer plano, juegos y servicios del sistema quedan fuera. La memoria puede volver a crecer al usar la aplicación.</p></section></div><section class="panel process-panel"><div class="section-title"><h2>Aplicaciones en segundo plano</h2><span>Solo procesos de tu usuario</span></div>${candidates.length?`<div class="process-list">${candidates.map(p=>`<label class="process-row"><input type="checkbox" name="process" value="${p.pid}"><span>${icon('memory')}<strong>${escape(p.name)}</strong><small>PID ${p.pid}</small></span><b>${p.memoryMB} MB</b></label>`).join('')}</div><div class="process-footer"><p>Selecciona solo aplicaciones que no estés usando.</p>${button('Reducir memoria seleccionada','trim','secondary','memory')}</div>`:empty('Analiza antes de liberar','Busca aplicaciones elegibles. Si no hay presión de memoria, lo mejor es dejar que Windows la gestione.','memory')}</section>`;
}
function benchmarkPage() {
  return `${header('LOS NÚMEROS MANDAN','Comprueba la diferencia.','Compara capturas reales. Sin FPS inventados, sin porcentajes prometidos.')}<section class="panel benchmark-intro"><div class="feature-icon amber">${icon('chart')}</div><div><h2>La misma escena. Dos capturas.</h2><p>Captura una partida antes y después con PresentMon o exporta un CSV de frametimes desde CapFrameX. Usa el mismo juego, resolución, ajustes, duración y recorrido. NEXO analiza el CSV; no captura ni se conecta al proceso del juego.</p></div></section><section class="panel benchmark-form"><div class="form-grid"><label>Juego<select id="bench-game">${state.games.map(g=>`<option value="${escape(g.id)}">${escape(g.name)}</option>`).join('')}</select></label><label>Condiciones de la prueba<input id="bench-context" placeholder="1440p · Alto · DLSS Calidad · misma escena" maxlength="200"></label></div><div class="benchmark-actions">${button('Importar antes','import-before','secondary','plus')}${button('Importar después','import-after','primary','plus')}</div><p class="muted">CSV con FrameTime, MsBetweenPresents o MsBetweenAppStart (ms), de un solo proceso. Mínimo 120 fotogramas. Máximo 20 MB.</p></section><div class="section-title"><h2>Resultados guardados</h2><span>FPS medios · 1 % low · P99</span></div>${renderComparisons()}${state.benchmarks.length?`<div class="table-wrap panel"><table><thead><tr><th>Juego / condiciones</th><th>Captura</th><th>FPS medios</th><th>1 % low</th><th>P99 (ms)</th><th>Duración</th></tr></thead><tbody>${state.benchmarks.map(b=>`<tr><td><strong>${escape(state.games.find(g=>g.id===b.gameId)?.name||'Juego')}</strong><small>${escape(b.context)}</small></td><td><span class="small-tag">${b.phase==='before'?'ANTES':'DESPUÉS'}</span></td><td>${b.average.toFixed(1)}</td><td>${b.low1.toFixed(1)}</td><td>${b.p99Ms.toFixed(2)}</td><td>${b.seconds.toFixed(1)} s</td></tr>`).join('')}</tbody></table></div>`:empty('Tu mejora empieza con una referencia','Importa primero una captura sin ajustes para tener una comparación honesta.','chart')}`;
}
function renderComparisons() {
  const groups=new Map();
  for (const b of state.benchmarks) { const key=b.gameId+'|'+b.context; if (!groups.has(key)) groups.set(key,{}); const pair=groups.get(key); if (!pair[b.phase]) pair[b.phase]=b; }
  return [...groups.values()].filter(p=>p.before&&p.after).map(({before:a,after:b})=>{const change=(b.average/a.average-1)*100;return `<div class="comparison panel"><div><span class="eyebrow">${escape(state.games.find(g=>g.id===a.gameId)?.name||'Juego')}</span><h3>${escape(a.context)}</h3><small>Verifica que las capturas sean equivalentes; una comparación no demuestra causalidad.</small></div><div><span>${a.average.toFixed(1)} → ${b.average.toFixed(1)} FPS</span><strong class="${change>=0?'positive':'negative'}">${change>=0?'+':''}${change.toFixed(1)} %</strong></div></div>`;}).join('');
}
function historyValue(value){return Array.isArray(value)?value.map(v=>v.name+': '+(v.exists?String(v.value):'No existía')).join(' · '):String(value);}
function historyPage() {
  const labels={pending:'Sin verificar',applied:'Aplicado',restored:'Restaurado','restore-failed':'Error al restaurar'};
  return `${header('SIEMPRE HAY VUELTA ATRÁS','Cada cambio, a la vista.','Los ajustes de energía permanecen hasta que los restaures, incluso al cerrar NEXO.')}<div class="notice warning">${icon('info')} Restaura tus ajustes al terminar de jugar. Si Windows rechazó una operación o la aplicación se cerró durante ella, el historial conserva el valor original para recuperarlo.</div><div class="history-list">${state.history.map(h=>`<section class="panel history-item"><span class="history-icon">${icon(h.status==='restored'?'check':'history')}</span><div><span class="small-tag ${h.status==='restored'?'success':''}">${labels[h.status]||escape(h.status)}</span><h3>${escape(h.label)}</h3><p>${new Date(h.at).toLocaleString('es-MX')} · ${escape(historyValue(h.before))} → ${escape(historyValue(h.after))}</p>${h.error?`<p class="negative">${escape(h.error)}</p>`:''}</div>${h.status!=='restored'?button('Restaurar','restore','secondary','restore',`data-id="${escape(h.id)}"`):'<span class="restored-label">Valor original recuperado</span>'}</section>`).join('')||empty('Sin cambios todavía','Cuando apliques un ajuste, verás aquí qué cambió y cómo restaurarlo.','history')}</div>`;
}
function windowsPage() {
  return `${header('SOLO SI TÚ LO ELIGES','Windows, a tu gusto.','Estos ajustes nunca forman parte del perfil de juego.')}<section class="panel windows-card"><div class="feature-icon blue">${icon('settings')}</div><div><span class="small-tag">OPCIONAL · REVERSIBLE</span><h2>Animaciones de controles</h2><p>Desactiva las animaciones del área de cliente que respetan las aplicaciones de Windows. Cambia la respuesta visual de algunos controles; no garantiza una mejora en juegos.</p><p>Tu configuración original se registra antes de aplicar el cambio. No altera temas, transparencia ni la resolución de pantalla.</p>${button('Desactivar estas animaciones','animations','secondary','settings')}</div></section><div class="notice">${icon('info')} Por defecto, NEXO conserva el aspecto de Windows. Para volver al estado anterior usa Historial → Restaurar.</div><section class="panel guidance"><div>${icon('shield')}<h2>Privado por diseño</h2></div><p>Hardware, biblioteca, perfiles y mediciones se guardan localmente en tu carpeta de usuario. No se envían a servidores ni se descargan «optimizaciones» de terceros. No requiere cuenta ni suscripción.</p></section>`;
}
function render() {
  $('#navigation').innerHTML=routes.map(([id,label,ico])=>`<button class="nav-item ${route===id?'active':''}" data-route="${id}" ${route===id?'aria-current="page"':''}>${icon(ico)}${label}${id==='games'?`<span class="nav-count">${state.games.length}</span>`:''}</button>`).join('');
  document.querySelector('[data-route="windows"]').classList.toggle('active',route==='windows');
  $('#breadcrumb').textContent=routes.find(r=>r[0]===route)?.[1]||'Windows';
  $('#demo-banner').hidden=!state.demo;
  $('#platform-banner').hidden=snapshot?.platform?.supported!==false;$('#platform-banner').textContent=snapshot?.platform?.reason||'Solo Windows 10 y Windows 11: los cambios están bloqueados en este sistema.';
  $('#connection').innerHTML=`<span class="status-dot ${telemetryError?'warn':''}"></span>${state.demo?'Modo demostración':telemetryError?'Lectura no disponible':'Windows · Local'}`;
  const pages={dashboard,games:gamesPage,optimize:optimizePage,memory:memoryPage,benchmark:benchmarkPage,history:historyPage,windows:windowsPage,laptop:()=>laptopPage({snapshot,icon,button,escape})};
  $('#main').innerHTML=(pages[route]||dashboard)();
  document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));
  document.querySelectorAll('[data-action]').forEach(b=>{b.disabled=busy||b.hasAttribute('disabled');});
  if(route==='optimize')tweaks.paint();
  live.paint(snapshot);
  $('#main').classList.remove('route-enter');requestAnimationFrame(()=>$('#main').classList.add('route-enter'));
}
function openDialog(html) { $('#dialog-content').innerHTML=`<button class="dialog-close" data-action="close" aria-label="Cerrar">${icon('close')}</button>${html}`; $('#dialog').showModal(); }
function gameDialog(id) {
  const game=state.games.find(g=>g.id===id),p=state.profiles[id]||{performance:!snapshot?.device?.isLaptop,priority:false,gpu:false,legacyFullscreen:false};
  const laptop=snapshot?.device?.isLaptop;
  const setting=(id,title,detail,checked,disabled=false)=>`<label class="setting-row"><span><strong>${title}</strong><small>${detail}</small></span><input type="checkbox" id="${id}" ${checked?'checked':''} ${disabled?'disabled':''}></label>`;
  openDialog(`<span class="eyebrow">PERFIL INDIVIDUAL · ${escape(game.source)}</span><h2>${escape(game.name)}</h2><p class="muted">Ajustes de Windows por juego. Sin cambiar archivos ni sistemas de seguridad. Reinicia el juego para aplicar preferencias gráficas.</p>${laptop?`<div class="notice">${icon('battery')} La energía de tu portátil se gestiona en la pestaña Laptop.</div>`:setting('profile-performance','Plan Alto rendimiento','Si el fabricante ya lo ofrece; puede aumentar consumo y temperatura.',p.performance)}${setting('profile-priority','Prioridad superior a lo normal','Abre el juego antes de aplicar. Puede no aportar FPS y el juego puede rechazarla.',p.priority)}${setting('profile-gpu','Preferir GPU de alto rendimiento','Preferencia de Windows por ejecutable. Puede ayudar si se estaba usando otra GPU. No hace overclock.',p.gpu&&snapshot?.platform?.build>=17134,!game.exe||!(snapshot?.platform?.build>=17134))}${setting('profile-fullscreen','Compatibilidad de pantalla completa clásica','Prueba opcional para juegos con problemas de presentación. Puede empeorar el rendimiento; compara y restaura si no ayuda.',p.legacyFullscreen&&snapshot?.platform?.build>=15063,!game.exe||!(snapshot?.platform?.build>=15063))}<div class="game-executable"><span>${game.exe?'Ejecutable asignado: '+escape(game.exe):'Asigna el ejecutable real del juego para habilitar las preferencias gráficas.'}</span>${button('Elegir ejecutable','choose-exe','secondary','plus',`data-id="${escape(id)}"`)}</div><div class="notice">${icon('history')} Los ajustes permanecen al cerrar NEXO. Recupera tus valores originales desde Historial → Restaurar.</div><section class="game-recommendations"><h3>Ajustes específicos dentro del juego</h3><p class="muted">Sugerencias manuales; NEXO no las aplica ni modifica archivos.</p>${recommendations(game.name).map(([title,text])=>`<div><strong>${escape(title)}</strong><p>${escape(text)}</p></div>`).join('')}</section><div class="dialog-actions">${button('Guardar perfil','save-profile','secondary','check',`data-id="${escape(id)}"`)}${button('Guardar y aplicar','apply-profile','primary','bolt',`data-id="${escape(id)}" ${snapshot?.platform?.supported===false?'disabled':''}`)}</div>${game.source==='Steam'||game.exe?`<div class="launch-row">${button('Iniciar juego','launch','text','play',`data-id="${escape(id)}"`)}</div>`:'<p class="muted">Inicia este juego desde su launcher oficial.</p>'}`);
}

async function refreshTelemetry() {
  try { snapshot=state.demo?await demoAPI.snapshot():await api.snapshot(); telemetryError=''; }
  catch(e){telemetryError=e.message;}
}
async function perform(fn,message) {
  if(busy)return;
  busy=true;document.body.classList.add('busy'); document.querySelectorAll('[data-action]').forEach(b=>{if(!b.disabled)b.dataset.busyDisabled='1';b.disabled=true;});
  try { await fn(); if(message)toast(message); }
  catch(e){toast(e.message,true);if(!state.demo){try{state=await api.state();}catch{}}}
  finally { busy=false;document.body.classList.remove('busy');render(); document.querySelectorAll('#dialog [data-busy-disabled]').forEach(b=>{b.disabled=false;delete b.dataset.busyDisabled;}); }
}
function hardwareDialog() { openDialog(`<span class="eyebrow">${state.demo?'EQUIPO DE EJEMPLO':'DETECTADO EN TU PC'}</span><h2>Tu hardware</h2><div class="spec-list"><div>${icon('cpu')}<span>Procesador<strong>${escape(snapshot?.cpu||'No disponible')}</strong></span></div><div>${icon('gpu')}<span>Gráficos<strong>${escape(snapshot?.gpu?.map(g=>g.name).join(' · ')||'No disponible')}</strong></span></div><div>${icon('memory')}<span>Memoria<strong>${snapshot?.memory?.totalGB||'—'} GB RAM</strong></span></div><div>${icon('settings')}<span>Sistema<strong>${escape(snapshot?.os||'No disponible')}</strong></span></div>${(snapshot?.disks||[]).map(d=>`<div>${icon('disk')}<span>${escape(d.name)} ${escape(d.label)}<strong>${d.freeGB} GB libres de ${d.totalGB} GB</strong></span></div>`).join('')}</div><p class="muted">Capacidad de volúmenes accesibles, en GiB redondeados. Los discos externos deben estar conectados al escanear.</p>`); }
document.addEventListener('click',async event=>{
  const nav=event.target.closest('[data-route]'); if(nav){location.hash=nav.dataset.route;return;}
  const filter=event.target.closest('[data-filter]'); if(filter){sourceFilter=filter.dataset.filter;render();return;}
  const el=event.target.closest('[data-action]'); if(!el||busy)return;
  const {action,id}=el.dataset;
  if(await tweaks.handle(action,id,el))return;
  if(action.startsWith('goto-')){location.hash=action.slice(5);return;}
  if(action==='close'){$('#dialog').close();return;}
  if(action==='choose-exe')return perform(async()=>{state=await api.chooseGameExecutable(id);$('#dialog').close();gameDialog(id);},'Ejecutable del juego actualizado.');
  if(action==='laptop-review')return perform(async()=>{
    const review=await api.reviewLaptopPlan(el.dataset.mode);
    laptopReview=review.id;
    openDialog(`<span class="eyebrow">LAPTOP · REVISIÓN DE ENERGÍA</span><h2>${{performance:'Alto rendimiento',balanced:'Equilibrado',saver:'Ahorro de energía'}[review.mode]||'Cambiar el plan de esta sesión'}</h2><p>Se conservará el plan original para restaurarlo desde Historial. La alimentación y el plan activo se comprueban otra vez antes de aplicar.</p><div class="notice warning">Alto rendimiento requiere el cargador y puede aumentar ruido, consumo y temperatura. Ahorro de energía puede reducir los FPS.</div><div class="dialog-actions">${button('Cancelar','close','secondary','close')}${button('Aplicar el plan revisado','laptop-apply','primary','check')}</div>`);
  });
  if(action==='laptop-apply')return perform(async()=>{state=await api.applyLaptopPlan(laptopReview);laptopReview=null;$('#dialog').close();await refreshTelemetry();},'Plan registrado. Puedes restaurarlo desde Historial.');
  if(action==='game'){gameDialog(id);return;}
  if(action==='hardware'){hardwareDialog();return;}
  if(action==='refresh')return perform(async()=>{await refreshTelemetry(); if(telemetryError)throw new Error(telemetryError);},'Lectura del equipo actualizada.');
  if(action==='scan')return perform(async()=>{state=await api.scan();},'Biblioteca actualizada.');
  if(action==='add')return perform(async()=>{state=await api.addGame();},'Biblioteca actualizada.');
  if(action==='save-profile'||action==='apply-profile'){
    const profile={performance:$('#profile-performance')?.checked===true,priority:$('#profile-priority').checked,gpu:$('#profile-gpu')?.checked===true,legacyFullscreen:$('#profile-fullscreen')?.checked===true};
    return perform(async()=>{state=await api.profile(id,profile); if(action==='apply-profile')state=await api.apply(id);$('#dialog').close();},action==='apply-profile'?'Operación completada. Revisa el historial y compara una captura.':'Perfil guardado.');
  }
  if(action==='launch')return perform(()=>api.launch(id),'Inicio solicitado al launcher o ejecutable.');
  if(action==='restore')return perform(async()=>{state=await api.restore(id);if($('#dialog').open)$('#dialog').close();if(route==='optimize')await tweaks.load(true);},'Valor original restaurado.');
  if(action==='animations'){openDialog(`<span class="eyebrow">CAMBIO VISUAL OPCIONAL</span><h2>¿Desactivar animaciones de controles?</h2><p>Puede afectar a la apariencia de algunas aplicaciones. Guardaremos el valor actual en el historial para que puedas restaurarlo.</p><div class="dialog-actions">${button('Cancelar','close','secondary','close')}${button('Desactivar y registrar','confirm-animations','primary','check')}</div>`);return;}
  if(action==='confirm-animations')return perform(async()=>{state=await api.animations(false);$('#dialog').close();},'Ajuste visual registrado. Puedes restaurarlo desde el historial.');
  if(action==='memory-scan')return perform(async()=>{candidates=await api.memoryCandidates();},'Análisis terminado. No se ha liberado memoria.');
  if(action==='trim'){
    const pids=[...document.querySelectorAll('input[name="process"]:checked')].map(x=>Number(x.value));
    if(!pids.length)return toast('Selecciona al menos un proceso.',true);
    return perform(async()=>{const result=await api.trim(pids);const ok=result.processes.filter(p=>p.ok).length;await refreshTelemetry();candidates=await api.memoryCandidates();openDialog(`<span class="eyebrow">RESULTADO DE WINDOWS</span><h2>${ok} de ${result.processes.length} solicitudes aceptadas</h2><p>RAM disponible: ${result.before.availableGB} → ${result.after.availableGB} GB. La diferencia puede incluir actividad de otras aplicaciones y no representa una mejora de FPS.</p><div class="spec-list">${result.processes.map(p=>`<div>${icon(p.ok?'check':'info')}<span>PID ${p.pid}<strong>${escape(p.reason)}</strong></span></div>`).join('')}</div>`);});
  }
  if(action.startsWith('import-')){
    const gameId=$('#bench-game').value,context=$('#bench-context').value;
    if(!gameId)return toast('Añade primero un juego.',true);
    if(context.trim().length<3)return toast('Indica resolución, ajustes y escena para comparar.',true);
    return perform(async()=>{state=await api.importBenchmark(gameId,action==='import-before'?'before':'after',context);},'Capturas actualizadas.');
  }
});
document.addEventListener('change',event=>{if(event.target.dataset.tweakSelect)tweaks.select(event.target.dataset.tweakSelect,event.target.checked);});
document.addEventListener('input',event=>{if(event.target.id==='tweak-search'){tweaks.search=event.target.value;tweaks.paint();return;}if(event.target.id==='game-search'){search=event.target.value;const start=event.target.selectionStart;render();$('#game-search').focus();$('#game-search').setSelectionRange?.(start,start);}});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.matches('[role="button"][data-action]'))e.target.click();});
window.addEventListener('hashchange',()=>{route=location.hash.slice(1)||'dashboard';render();if(route==='optimize')tweaks.load();$('#main').focus();window.scrollTo(0,0);});
async function init(){try{state=await api.state();tweaks.catalog=typeof api.tweakCatalog==='function'?await api.tweakCatalog():await demoAPI.tweakCatalog();if(state.demo){demoAPI.catalog=tweaks.catalog;state={...state,games:demoGames};api=demoAPI;}render();await refreshTelemetry();render();if(!state.demo&&state.history.some(h=>h.status==='pending'||h.status==='restore-failed'))toast('Hay cambios sin verificar. Revisa el historial para restaurarlos.',true);}catch(e){$('#main').textContent='No se pudo iniciar NEXO: '+e.message;}}
await init();
if(state&&!state.demo&&typeof api.scan==='function'){await perform(async()=>{state=await api.scan();});}
if(state){
  if(route==='optimize')tweaks.load();
  const source=state.demo?demoAPI:api;
  if(typeof source.onTelemetry==='function')source.onTelemetry(message=>{if(!snapshot)snapshot={};live.receive(message,snapshot);});
  setInterval(()=>live.paint(snapshot),1000);
}
