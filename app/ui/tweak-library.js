export class TweakLibrary {
  constructor(ctx){this.ctx=ctx;this.catalog=[];this.statuses=new Map();this.selected=new Set();this.category='Todos';this.search='';this.loading=false;this.loadedAt=0;}
  async load(force=false){
    if(this.loading||(!force&&Date.now()-this.loadedAt<5000))return;
    this.loading=true;this.paint();
    try{const status=await this.ctx.api().tweakStatus();this.statuses=new Map(status.map(s=>[s.id,s]));this.loadedAt=Date.now();}
    catch(e){this.statuses=new Map(this.catalog.map(t=>[t.id,{id:t.id,available:false,reason:e.message}]));this.ctx.toast(e.message,true);}
    finally{this.loading=false;for(const id of this.selected)if(!this.statuses.get(id)?.available||this.statuses.get(id)?.configured)this.selected.delete(id);this.paint();}
  }
  render(){
    const {icon,escape,button}=this.ctx;
    return `<div class="page-heading"><div><div class="eyebrow">TWEAK LIBRARY · TU CONFIGURACIÓN</div><h1>Prepara el terreno.</h1><p>Elige qué cambiar. Revisa el efecto. Conserva una forma de volver atrás.</p></div>${button('Leer estado de Windows','tweaks-refresh','secondary','scan')}</div><section class="tweak-hero"><div class="tweak-hero-icon">${icon('bolt')}</div><div><strong>${this.catalog.length} ajustes. Tú decides cuáles.</strong><p>Gaming, segundo plano, escritorio, entrada y privacidad. Los cambios visuales solo se aplican si los seleccionas.</p></div><div class="tweak-hero-count"><b>06</b><span>CATEGORÍAS</span></div></section><div class="tweak-search-wrap"><label for="tweak-search">Buscar ajustes</label><input id="tweak-search" type="search" placeholder="Game Bar, captura, ratón, privacidad…" value="${escape(this.search)}"></div><div class="tweak-tabs" role="group" aria-label="Categorías de ajustes">${['Todos','Gaming','Background','Debloat','Desktop','Input','Privacy'].map(cat=>`<button class="tweak-tab ${cat===this.category?'active':''}" data-action="tweak-category" data-category="${cat}">${cat}<span>${cat==='Todos'?this.catalog.length:this.catalog.filter(t=>t.category===cat).length}</span></button>`).join('')}</div><div class="tweak-list-meta"><span id="tweak-count"></span><span>${this.ctx.demo()?'VISTA DEMO · Sin cambios reales':'TU USUARIO · Copia del valor original antes de cada cambio'}</span></div><div id="tweak-cards" class="tweak-grid">${this.cards()}</div><div class="tweak-selection-bar"><div>${icon('shield')}<span><strong id="tweak-selected-count">${this.selected.size} ajustes seleccionados</strong><small>Nada cambia hasta que revises y apliques.</small></span></div><div>${button('Limpiar selección','tweak-clear','text','close')}${button('Revisar cambios','tweak-review','primary','arrow','id="tweak-review-button"')}</div></div><div class="notice">${icon('info')} Estos son controles de Windows, no una promesa de FPS. Debloat oculta contenido y sugerencias: no desinstala apps. Los ajustes de registro pueden necesitar cerrar sesión. Los planes de energía y prioridad siguen en Mis juegos.</div>`;
  }
  filtered(){return this.catalog.filter(t=>(this.category==='Todos'||this.category===t.category)&&(t.title+' '+t.description+' '+t.category).toLocaleLowerCase('es').includes(this.search.toLocaleLowerCase('es')));}
  cards(){
    const {icon,escape}=this.ctx;
    const list=this.filtered();
    return list.map(t=>{const s=this.statuses.get(t.id),active=this.ctx.state().history.find(h=>h.kind==='tweak'&&h.target.tweakId===t.id&&h.status!=='restored');const selected=this.selected.has(t.id);const disabled=this.loading||!s?.available||s.configured;
      return `<article class="tweak-card category-${t.category.toLowerCase()} ${selected?'selected':''} ${s&&!s.available?'unavailable':''}" data-tweak="${t.id}"><div class="tweak-card-top"><span>${icon(t.category==='Gaming'?'games':t.category==='Input'?'tune':t.category==='Privacy'?'shield':t.category==='Desktop'?'settings':'bolt')}${t.category}</span><b>${this.loading?'LEYENDO':!s?'SIN LEER':!s.available?'NO DISPONIBLE':active?'REGISTRADO':s.configured?'CONFIGURADO':t.visual?'VISUAL · OPCIONAL':'OPCIONAL'}</b></div><h2>${escape(t.title)}</h2><p>${escape(t.description)}</p><div class="tweak-hint">${s&&!s.available?escape(s.reason):t.visual?'Cambia el aspecto · Restaurable':'Usuario actual · Restaurable'}</div><div class="tweak-card-actions"><button class="tweak-details" data-action="tweak-detail" data-id="${t.id}">Detalles ${icon('arrow')}</button><label class="tweak-switch"><span>${selected?'Seleccionado':s?.configured?'Ya configurado':'Seleccionar'}</span><input type="checkbox" data-tweak-select="${t.id}" aria-label="Seleccionar ${escape(t.title)}" ${selected?'checked':''} ${disabled?'disabled':''}></label></div></article>`;
    }).join('')||'<div class="empty"><h3>No hay ajustes que coincidan</h3><p>Prueba otra búsqueda o cambia la categoría.</p></div>';
  }
  paint(){
    const root=document.querySelector('#tweak-cards');if(!root)return;
    root.innerHTML=this.cards();this.summary();
    document.querySelectorAll('.tweak-tab').forEach(b=>b.classList.toggle('active',b.dataset.category===this.category));
    document.querySelector('#tweak-count').textContent=`${this.filtered().length} opciones · ${this.loading?'Leyendo preferencias…':'Revisa antes de aplicar'}`;
  }
  summary(){
    const el=document.querySelector('#tweak-selected-count');if(el)el.textContent=`${this.selected.size} ajustes seleccionados`;
    const button=document.querySelector('#tweak-review-button');if(button)button.disabled=!this.selected.size||this.loading;
  }
  select(id,checked){if(checked)this.selected.add(id);else this.selected.delete(id);this.paint();}
  detail(id){
    const t=this.catalog.find(t=>t.id===id),s=this.statuses.get(id);if(!t)return;
    const {escape,icon,button}=this.ctx;
    const active=this.ctx.state().history.find(h=>h.kind==='tweak'&&h.target.tweakId===id&&h.status!=='restored');
    this.ctx.openDialog(`<span class="eyebrow">${t.category} · ${t.visual?'CAMBIO VISUAL':'USUARIO ACTUAL'}</span><h2>${escape(t.title)}</h2><p>${escape(t.description)}</p><div class="detail-effect"><h3>Qué cambia para ti</h3><p>${escape(t.impact)}</p></div><div class="notice">${icon('info')}${escape(t.refresh)}</div>${s&&!s.available?`<div class="notice warning">${escape(s.reason)}</div>`:''}<p class="muted">Se conserva el tipo y valor original, incluida la ausencia de una preferencia. Puedes restaurarlo desde Historial. No se desinstalan componentes ni se desactivan servicios.</p><div class="dialog-actions">${button('Cerrar','close','secondary','close')}${active?button('Restaurar valor original','restore','primary','restore',`data-id="${active.id}"`):s?.available&&!s.configured?button(this.selected.has(id)?'Quitar de la selección':'Añadir a la selección','tweak-toggle','primary','plus',`data-id="${id}"`):''}</div>`);
  }
  review(){
    const {escape,button,icon}=this.ctx;
    return this.ctx.perform(async()=>{
      this.reviewData=await this.ctx.api().reviewTweaks([...this.selected]);
      this.ctx.openDialog(`<span class="eyebrow">REVISIÓN FINAL · ${this.ctx.demo()?'DEMOSTRACIÓN':'COPIA LOCAL'}</span><h2>${this.reviewData.changes.length} ajustes por aplicar</h2><p>Solo se aplican estos ajustes. El estado de Windows se comprueba otra vez antes de escribir.</p><div class="review-list">${this.reviewData.changes.map(c=>{const t=this.catalog.find(t=>t.id===c.id);return `<div><span class="small-tag">${t.category}</span><strong>${escape(t.title)}</strong><p>${escape(t.impact)}</p></div>`;}).join('')}</div><div class="notice warning">${icon('info')} Guarda tu trabajo. Puede ser necesario cerrar sesión después. NEXO no cierra tu sesión ni reinicia el equipo.</div><p class="muted">Si un ajuste falla, se intenta restaurar el lote. Cualquier restauración fallida queda en el historial.</p><div class="dialog-actions">${button('Volver','close','secondary','close')}${button('Aplicar estos ajustes','tweak-apply','primary','check')}</div>`);
    });
  }
  async handle(action,id,el){
    if(!action.startsWith('tweak'))return false;
    if(action==='tweaks-refresh')await this.load(true);
    if(action==='tweak-category'){this.category=el.dataset.category;this.paint();}
    if(action==='tweak-clear'){this.selected.clear();this.paint();}
    if(action==='tweak-detail')this.detail(id);
    if(action==='tweak-toggle'){this.select(id,!this.selected.has(id));document.querySelector('#dialog').close();}
    if(action==='tweak-review')await this.review();
    if(action==='tweak-apply')await this.ctx.perform(async()=>{const id=this.reviewData?.id;this.reviewData=null;document.querySelector('#dialog-content').insertAdjacentHTML('beforeend','<p class="applying-message">Aplicando y verificando cada ajuste… Mantén NEXO abierto.</p>');this.ctx.setState(await this.ctx.api().applyTweaks(id));this.selected.clear();await this.load(true);document.querySelector('#dialog').close();},'Ajustes registrados. Revisa el historial; algunas preferencias requieren volver a iniciar sesión.');
    return true;
  }
}
