const {test,expect}=require('@playwright/test');
test('dashboard renders an explicit demo and navigates to real profile controls',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
  await expect(page.getByRole('heading',{name:'Más juego. Menos límites.'})).toBeVisible();
  await expect(page.locator('#demo-banner')).toBeVisible();
  await expect(page.getByText('AMD Ryzen 7 5700',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Preparar mi juego'}).click();
  await page.getByRole('button',{name:/Counter-Strike 2/}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('#profile-performance')).toBeChecked();
  await expect(page.locator('#profile-priority')).not.toBeChecked();
  await page.getByRole('button',{name:'Guardar y aplicar'}).click();
  await expect(page.getByRole('status')).toContainText('necesita la aplicación de escritorio');
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(errors).toEqual([]);
});
test('library search, launcher filters, empty state and modal keyboard close',async({page})=>{
  await page.goto('/#games');await page.getByLabel('Buscar un juego').fill('valo');
  await expect(page.locator('.game-card')).toHaveCount(1);await page.getByRole('button',{name:/VALORANT Riot/}).click();
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByLabel('Buscar un juego').fill('no existe');await expect(page.getByRole('heading',{name:'Aún no hay juegos aquí'})).toBeVisible();
  await page.getByLabel('Buscar un juego').fill('');await page.getByRole('button',{name:'Steam',exact:true}).click();await expect(page.locator('.game-card')).toHaveCount(2);
});
test('every section loads and Windows adjustment requires a separate explicit action',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
  for(const [label,heading] of [['Optimización','Prepara el terreno.'],['Memoria RAM','Memoria con espacio.'],['Comparar FPS','Comprueba la diferencia.'],['Historial','Cada cambio, a la vista.']]){
    await page.getByRole('button',{name:label,exact:true}).click();await expect(page.getByRole('heading',{name:heading})).toBeVisible();
  }
  await page.getByRole('button',{name:'Windows Opcional'}).click();await page.getByRole('button',{name:'Desactivar estas animaciones'}).click();
  await expect(page.getByRole('heading',{name:'¿Desactivar animaciones de controles?'})).toBeVisible();
  await page.getByRole('button',{name:'Cancelar',exact:true}).click();await expect(page.getByRole('dialog')).not.toBeVisible();expect(errors).toEqual([]);
});
test('hardware dialog reports demo specifications and all connected disks',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Ver mi hardware'}).click();
  await expect(page.getByRole('dialog')).toContainText('EQUIPO DE EJEMPLO');await expect(page.getByRole('dialog')).toContainText('RTX 5070');await expect(page.getByRole('dialog')).toContainText('3000 GB');
});
test('desktop and compact layouts have no horizontal overflow',async({page})=>{
  for(const width of [1440,1050,800]){await page.setViewportSize({width,height:1100});await page.goto('/');await expect(page.locator('h1')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
});
test('discovered names are treated as text rather than HTML',async({page})=>{
  await page.addInitScript(()=>{window.nexo={state:async()=>({demo:false,games:[{id:'1',name:'<img src=x onerror=alert(1)>',source:'Manual'}],profiles:{},history:[],benchmarks:[]}),snapshot:async()=>({memory:{totalGB:32,availableGB:16,usedPercent:50},gpu:[],disks:[]})};});
  await page.goto('/#games');await expect(page.locator('.game-card')).toContainText('<img src=x onerror=alert(1)>');await expect(page.locator('.game-card img')).toHaveCount(0);
});
test('tweak library filters, selects and reviews without applying immediately',async({page})=>{
 await page.goto('/#optimize');await expect(page.locator('.tweak-card')).toHaveCount(32);
 await page.getByRole('button',{name:'Gaming 8',exact:true}).click();await expect(page.locator('.tweak-card')).toHaveCount(8);
 const box=page.getByRole('checkbox',{name:'Seleccionar Desactivar captura de Xbox',exact:true});await expect(box).toBeEnabled();await box.check();
 await expect(page.locator('#tweak-selected-count')).toContainText('1 ajustes');
 await page.getByRole('button',{name:'Revisar cambios',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('1 ajustes por aplicar');
 await expect(page.getByRole('dialog')).toContainText('grab');await page.getByRole('button',{name:'Aplicar estos ajustes',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('necesita la aplicación de escritorio');await expect(page.getByRole('dialog')).toBeVisible();
 await page.keyboard.press('Escape');await page.getByLabel('Buscar ajustes').fill('portapapeles');await page.getByRole('button',{name:'Todos 32',exact:true}).click();await expect(page.locator('.tweak-card')).toHaveCount(2);
});
test('live RAM changes without replacing process controls or clearing their selection',async({page})=>{
 await page.addInitScript(()=>{
  const state={demo:false,platform:'win32',games:[],profiles:{},history:[],benchmarks:[]};let callback;
  window.nexo={state:async()=>state,snapshot:async()=>({memory:{totalGB:32,availableGB:20,usedPercent:37.5},gpu:[],disks:[]}),memoryCandidates:async()=>[{pid:123,name:'chrome',memoryMB:200}],onTelemetry:fn=>{callback=fn;window.emitTestSample=message=>callback(message);return ()=>{};}};
 });
 await page.goto('/#memory');await page.getByRole('button',{name:'Analizar aplicaciones'}).click();
 const process=page.locator('input[name="process"]');await process.check();await process.evaluate(e=>e.dataset.identity='preserved');
 await page.evaluate(()=>window.emitTestSample({sample:{memory:{totalGB:32,availableGB:19.123,usedPercent:40},cpuPercent:14,capturedAt:new Date().toISOString()}}));
 await expect(page.locator('[data-live="ram-free"]')).toHaveText('19.12');
 await page.evaluate(()=>window.emitTestSample({sample:{memory:{totalGB:32,availableGB:18.456,usedPercent:42},cpuPercent:20,capturedAt:new Date().toISOString()}}));
 await expect(page.locator('[data-live="ram-free"]')).toHaveText('18.46');await expect(process).toBeChecked();await expect(process).toHaveAttribute('data-identity','preserved');
 await expect(page.locator('[data-live="status"]')).toContainText('En vivo');await expect(page.locator('#ram-sparkline')).not.toHaveAttribute('points','');
 await page.evaluate(()=>window.emitTestSample({error:'Monitor desconectado'}));await expect(page.locator('[data-live="error"]')).toContainText('Monitor desconectado');await expect(page.locator('[data-live="ram-free"]')).toHaveText('18.46');
});
test('demo RAM monitor samples every second and desktop changes remain opt-in',async({page})=>{
 await page.goto('/#memory');const number=page.locator('[data-live="ram-free"]');await expect(page.locator('[data-live="status"]')).toContainText('En vivo');const before=await number.textContent();await expect(number).not.toHaveText(before,{timeout:3500});
 await page.goto('/#optimize');await page.getByRole('button',{name:'Desktop 5',exact:true}).click();await expect(page.locator('.tweak-card')).toHaveCount(5);await expect(page.locator('input[data-tweak-select]:checked')).toHaveCount(0);
 await page.getByRole('button',{name:'Detalles',exact:false}).first().click();await expect(page.getByRole('dialog')).toContainText('CAMBIO VISUAL');await expect(page.getByRole('dialog')).toContainText('restaur');
});
test('popular games have local logos; unknown games keep a safe fallback',async({page})=>{
 await page.goto('/#games');await expect(page.locator('.game-card .game-logo')).toHaveCount(3);
 for(const image of await page.locator('.game-card .game-logo').all()){await expect(image).toHaveJSProperty('complete',true);expect(await image.evaluate(i=>i.naturalWidth)).toBeGreaterThan(0);}
});
test('Windows 11 hides Windows 10-only tweaks by default and can reveal their disabled cards',async({page})=>{
 await page.goto('/#optimize');await expect(page.locator('.os-library-banner')).toContainText('Windows 11');
 await expect(page.locator('[data-tweak="background-apps"]')).toHaveCount(0);await expect(page.locator('[data-tweak="windowed-optimizations"]')).toBeVisible();
 await page.getByRole('button',{name:'Ver todo el catálogo'}).click();await expect(page.locator('.tweak-card')).toHaveCount(35);await expect(page.locator('[data-tweak-select="background-apps"]')).toBeDisabled();
});
test('desktop detection keeps laptop-only controls disabled',async({page})=>{
 await page.goto('/#laptop');await expect(page.getByRole('heading',{name:/Potencia cuando toca/})).toBeVisible();await expect(page.getByText(/Se detectó un PC de escritorio/)).toBeVisible();
 for(const button of await page.getByRole('button',{name:'Revisar este plan'}).all())await expect(button).toBeDisabled();
});
test('laptop has a separate power tab and no energy switch in game profiles',async({page})=>{
 await page.addInitScript(()=>{
  const state={demo:false,platform:'win32',games:[{id:'g',name:'VALORANT',source:'Manual',directory:'C:\\Games',exe:'C:\\Games\\game.exe'}],profiles:{},history:[],benchmarks:[]};
  const snapshot={cpu:'Mobile CPU',cores:8,threads:16,gpu:[],disks:[],memory:{totalGB:16,availableGB:8,usedPercent:50},platform:{family:'Windows 11',build:22631,supported:true},device:{kind:'laptop',isLaptop:true,acConnected:true,batteryPercent:77}};
  window.nexo={state:async()=>state,snapshot:async()=>snapshot,reviewLaptopPlan:async()=>({id:'review',before:'balanced',after:'performance'}),applyLaptopPlan:async()=>state};
 });
 await page.goto('/#games');await page.locator('.game-card').click();await expect(page.locator('#profile-performance')).toHaveCount(0);await expect(page.getByRole('dialog')).toContainText('pestaña Laptop');await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Laptop',exact:true}).click();await expect(page.locator('[data-live="battery-percent"]')).toHaveText('77 %');await page.getByRole('button',{name:'Revisar este plan'}).first().click();await expect(page.getByRole('dialog')).toContainText('se comprueban otra vez');
});
test('hub motion respects reduced-motion preferences',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');await expect(page.locator('.nexo-core')).toBeVisible();expect(await page.locator('.nexo-core').evaluate(e=>getComputedStyle(e).animationName)).toBe('none');
});
test('Windows 10 receives its own compatible library',async({page})=>{
 await page.addInitScript(()=>{
  const state={demo:false,platform:'win32',games:[],profiles:{},history:[],benchmarks:[]};
  window.nexo={state:async()=>state,snapshot:async()=>({cpu:'CPU',cores:8,threads:16,gpu:[],disks:[],memory:{totalGB:32,availableGB:16,usedPercent:50},platform:{family:'Windows 10',caption:'Microsoft Windows 10 Pro',build:19045,productType:1,supported:true},device:{kind:'desktop',isLaptop:false}}),tweakStatus:async()=>{const list=await fetch('./catalog.json').then(r=>r.json());return list.map(t=>({id:t.id,available:t.windows.includes('Windows 10'),configured:false}));}};
 });
 await page.goto('/#optimize');await expect(page.locator('.os-library-banner')).toContainText('Windows 10');await expect(page.locator('[data-tweak="background-apps"]')).toBeVisible();await expect(page.locator('[data-tweak="windowed-optimizations"]')).toHaveCount(0);await expect(page.locator('[data-tweak="widgets"]')).toHaveCount(0);
});
test('unsupported Windows is explicitly read-only and offers no compatible tweak cards',async({page})=>{
 await page.addInitScript(()=>{window.nexo={state:async()=>({demo:false,games:[],profiles:{},history:[],benchmarks:[]}),snapshot:async()=>({memory:{totalGB:32,availableGB:16,usedPercent:50},gpu:[],disks:[],platform:{family:'Windows no compatible',caption:'Windows Server',build:26100,productType:3,supported:false,reason:'Solo Windows 10 y Windows 11 de escritorio.'}}),tweakStatus:async()=>[]};});
 await page.goto('/#optimize');await expect(page.locator('#platform-banner')).toContainText('Solo Windows 10 y Windows 11');await expect(page.locator('.tweak-card')).toHaveCount(0);
});
