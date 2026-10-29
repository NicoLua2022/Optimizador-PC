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
