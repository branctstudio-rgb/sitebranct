'use strict';
const $=id=>document.getElementById(id);
const get=(object,key)=>key.split('.').reduce((value,k)=>value[k],object);
const put=(object,key,value)=>{const keys=key.split('.');const leaf=keys.pop();keys.reduce((o,k)=>o[k],object)[leaf]=value;};
let state,recipe,dirty=false,busy=false,stopped=false,pendingFocus,selection,selectionURL,selectionEpoch=0,mediaEpoch=0;
let activeProject=new URL(location.href).searchParams.get('project')||'legacy';
const sections=[
 ['01','Identidade & direção','O que identifica o projeto, sem mudar a estrutura.',[
 ['id','Identificador do projeto'],['name','Nome da marca'],['origin','Origem de referência','url'],
 ['fonts.body','Fonte de texto','select',['manrope','bricolage']],['fonts.display','Fonte de títulos','select',['bricolage','manrope']],
 ['palette.bg','Fundo','color'],['palette.surface','Superfície','color'],['palette.ink','Texto','color'],['palette.accent','Acento','color']]],
 ['02','As palavras certas','Texto simples; o gerador trata do HTML.',[
 ['content.eyebrow','Sobretítulo'],['content.headline','Título principal'],['content.description','Descrição','textarea'],['content.approachTitle','Título da abordagem'],['content.steps','Etapas · uma por linha','steps'],['content.contactTitle','Título do contacto'],['content.contactText','Texto do contacto','textarea'],['routes.home','Página inicial'],['routes.contact','Página de contacto'],['navigation.home','Navegação · início'],['navigation.approach','Navegação · abordagem'],['navigation.contact','Navegação · contacto'],['navigation.open','Nome acessível · abrir menu'],['navigation.close','Nome acessível · fechar menu']]],
 ['03','Recursos locais','Catálogo aprovado e PNGs importados explicitamente neste projeto.',[
 ['assets.logo','Logótipo','catalog'],['assets.hero','Imagem principal','catalog'],['assets.heroDecorative','Imagem decorativa','checkbox'],['assets.heroAlt','Descrição acessível da imagem','textarea'],['assets.heroCaption','Legenda da imagem','textarea']]]
];
function el(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;}
function message(text,error=false){$('status').textContent=text;$('status').dataset.state=error?'error':'ok';}
function fields(){
 $('fields').replaceChildren();
 for(const [n,title,description,items] of sections){
   const section=el('section',undefined,'section'),head=el('div',undefined,'section-heading'),caption=el('div');
   head.append(el('span',n));caption.append(el('h2',title),el('p',description));head.append(caption);section.append(head);
   const grid=el('div',undefined,'grid');
   for(const [key,label,type='text',options] of items){
     const box=el('div',undefined,'field'+(['textarea','steps'].includes(type)?' wide':'')+(type==='color'?' color-field':''));
     const lab=el('label',label);lab.htmlFor=key;
     const input=el(['textarea','steps'].includes(type)?'textarea':['select','catalog'].includes(type)?'select':'input');
     input.id=key;input.name=key;input.disabled=busy;
     if(input.tagName==='INPUT'){input.type=type==='checkbox'?'checkbox':type==='url'?'url':'text';if(type==='color'){input.maxLength=7;input.placeholder='#0C7C8F';}}
     if(input.tagName==='SELECT')for(const value of options||state.catalog[key.split('.')[1]]){const item=state.imported?.find(r=>r.path===value);const option=el('option',item?item.name+' · '+item.sha256.slice(0,8)+(item.available?'':' · ausente/alterado'):value);option.value=value;input.append(option);}
     if(type==='checkbox')input.checked=Boolean(get(recipe,key));else input.value=type==='steps'?get(recipe,key).join('\n'):get(recipe,key);
     input.setAttribute('aria-describedby',key+'-error');
     input.addEventListener('input',()=>{dirty=true;input.removeAttribute('aria-invalid');$(key+'-error').textContent='';resourcePreview();});
     const error=el('span',undefined,'error');error.id=key+'-error';box.append(lab,input,error);grid.append(box);
   }
   if(n==='03')grid.append(el('p','O logo acompanha o nome visível da marca, por isso tem alt vazio para evitar repetição. A imagem principal requer descrição ou escolha explícita de decorativa. Importar não concede direitos nem autorização para publicar.','asset-note'));
   section.append(grid);$('fields').append(section);
 }resourcePreview();
}
function collect(){const next=structuredClone(recipe);for(const [,, ,items] of sections)for(const [key,,type] of items)put(next,key,type==='checkbox'?$(key).checked:type==='steps'?$(key).value.split(/\r?\n/):$(key).value);next.version=2;next.assets.root='../library';if(next.assets.heroDecorative)next.assets.heroAlt='';return next;}
function resourcePreview(reload=false){
 if(!$('assets.logo'))return;
 if(reload)mediaEpoch++;
 for(const kind of ['logo','hero']){const img=$('asset-'+kind+'-preview'),src='/api/media?kind='+kind+'&path='+encodeURIComponent($('assets.'+kind).value)+'&view='+mediaEpoch+'&project='+encodeURIComponent(activeProject);if(img.getAttribute('src')!==src)img.src=src;img.alt=kind==='logo'?'Prévia do logótipo':$('assets.heroDecorative').checked?'':$('assets.heroAlt').value;}
 $('assets.heroAlt').disabled=busy||stopped||$('assets.heroDecorative').checked;
 $('font-sample').dataset.body=$('fonts.body').value;$('font-sample').dataset.display=$('fonts.display').value;
}
function errors(data){
 let focus;
 for(const [key,error] of Object.entries(data.errors||{})){
   const normalized=key.replace(/\[\d+\]$/,'');
   const keys=normalized==='routes'?['routes.home','routes.contact']:normalized==='palette'?['palette.ink','palette.bg','palette.surface','palette.accent']:[normalized];
   for(const field of keys){
     const node=field==='versionName'?$('version-name'):$(field),target=$(field+'-error');
     if(node&&target){target.textContent=error;node.setAttribute('aria-invalid','true');focus??=node;}
   }
 }
 message(data.message||'A operação falhou. Nada foi aprovado.',true);pendingFocus=focus||$('status');
}
async function api(route,body,project=activeProject){
 const response=await fetch('/api/'+route+(body===undefined?(route.includes('?')?'&':'?')+'project='+encodeURIComponent(project):''),body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-Studio-Token':state.token,'X-Studio-Project':project},body:JSON.stringify(body)});
 const result=await response.json();if(!response.ok){errors(result);throw new Error(result.message);}return result;
}
async function act(fn){
 if(busy||stopped)return;busy=true;document.querySelectorAll('button,input,select,textarea').forEach(b=>b.disabled=true);
 $('recipe-form').setAttribute('aria-busy','true');document.querySelectorAll('.error').forEach(n=>n.textContent='');document.querySelectorAll('[aria-invalid]').forEach(n=>n.removeAttribute('aria-invalid'));
 try{await fn();}catch(error){if($('status').dataset.state!=='error')message('Não foi possível concluir: '+error.message,true);}
 finally{busy=false;$('recipe-form').removeAttribute('aria-busy');document.querySelectorAll('button,input,select,textarea').forEach(b=>b.disabled=stopped);$('import-confirm').disabled=stopped||!selection;resourcePreview();pendingFocus?.focus();pendingFocus=undefined;}
}
async function refresh(project=activeProject){
 state=await api('state',undefined,project);activeProject=state.project.id;
 $('project-active').textContent='Projeto ativo: '+state.project.name+' · '+activeProject;$('project-active').dataset.id=activeProject;
 $('project-select').replaceChildren();for(const item of state.projects){const option=el('option',item.name+' · '+item.id);option.value=item.id;$('project-select').append(option);}$('project-select').value=activeProject;
 const source=$('project-source'),previous=source.value;source.replaceChildren();for(const [value,label] of [['approved','Receita BRANCT aprovada'],['initial','Duplicar ponto de partida deste projeto'],...state.recipes.map(n=>['recipe:'+n,'Duplicar receita · '+n]),...state.revisions.map(n=>['revision:'+n,'Duplicar versão · '+n])]){const option=el('option',label);option.value=value;source.append(option);}if([...source.options].some(o=>o.value===previous))source.value=previous;
 const select=$('recipe-source'),selected=select.value;
 select.replaceChildren();for(const [value,label] of [['preset','BRANCT · receita aprovada'],...state.recipes.map(n=>['recipe:'+n,'Guardada · '+n]),...state.revisions.map(n=>['revision:'+n,'Versão · '+n])]){
   const option=el('option',label);option.value=value;select.append(option);
 }if([...select.options].some(o=>o.value===selected))select.value=selected;
 $('revisions').replaceChildren();
 if(!state.revisions.length)$('revisions').append(el('p','A tua primeira versão aparece aqui.','empty'));
 for(const name of state.revisions){
   const item=el('div',undefined,'revision'),buttons=el('div',undefined,'revision-actions');item.append(el('strong',name));
   const reopen=el('button','Reabrir receita');reopen.type='button';reopen.addEventListener('click',()=>act(()=>load('revision:'+name)));
   const view=el('button','Ver páginas');view.type='button';view.addEventListener('click',()=>act(()=>preview(name)));buttons.append(reopen,view);item.append(buttons);$('revisions').append(item);
 }
}
async function load(value){
 if(dirty&&!confirm('Descartar apenas as alterações por guardar no editor? As versões guardadas mantêm-se.'))return;
 recipe=value==='preset'?structuredClone(state.recipe):(await api((value.startsWith('recipe:')?'recipe':'revision')+'?name='+encodeURIComponent(value.split(':')[1]))).recipe;
 fields();dirty=false;message('Receita carregada. Escolhe um nome novo para guardar a próxima versão.');
}
async function preview(name){
 const result=await api('preview',{name}),panel=$('preview-result');panel.replaceChildren();panel.hidden=false;
 panel.append(el('h2',name+' · pronto a experimentar'),el('p','14 ficheiros verificados. Abre as duas páginas reais, servidas apenas neste computador.'));
 for(const [key,label] of [['home','Abrir página inicial'],['contact','Abrir contacto']]){const link=el('a',label+' ↗');link.href=result.urls[key];link.target='_blank';link.rel='noopener noreferrer';panel.append(link);}
 const stop=el('button','Encerrar esta prévia','secondary');stop.type='button';stop.addEventListener('click',()=>act(async()=>{await api('stop-preview',{id:result.id});panel.hidden=true;message('Prévia encerrada. Recibo guardado; ficheiros preservados.');}));panel.append(stop);
 message('Prévia local ativa. Não foi publicado nenhum site.');panel.scrollIntoView({block:'nearest'});
}
$('load').addEventListener('click',()=>act(()=>load($('recipe-source').value)));
$('version-name').addEventListener('input',()=>{$('versionName-error').textContent='';$('version-name').removeAttribute('aria-invalid');});
$('validate').addEventListener('click',()=>act(async()=>{await api('validate',{recipe:collect()});message('Receita válida. Ainda não foi gerada nem publicada.');}));
$('save').addEventListener('click',()=>act(async()=>{const name=$('version-name').value;await api('save',{name,recipe:collect()});dirty=false;await refresh();message('Receita '+name+' guardada. Podes reabri-la no ponto de partida.');}));
$('recipe-form').addEventListener('submit',event=>{event.preventDefault();act(async()=>{
 const name=$('version-name').value;message('A gerar e verificar a nova versão…');
 await api('generate',{name,recipe:collect()});dirty=false;await refresh();await preview(name);
});});
$('shutdown').addEventListener('click',()=>act(async()=>{
 if(!confirm('Encerrar esta bancada e as suas prévias? As receitas e versões ficam guardadas.'))return;
 const result=await api('stop',{});stopped=true;dirty=false;$('preview-result').hidden=true;message('Encerramento solicitado. Consulta o recibo: '+result.receipt);
}));
function clearSelection(resetInput=true){selectionEpoch++;selection=undefined;if(selectionURL)URL.revokeObjectURL(selectionURL);selectionURL=undefined;if(resetInput)$('import-file').value='';$('import-preview').removeAttribute('src');$('import-preview').hidden=true;$('import-confirm').disabled=true;$('import-progress').value=0;}
$('import-cancel').addEventListener('click',()=>{clearSelection();$('import-status').textContent='Seleção cancelada. Nada foi gravado.';$('import-file').focus();});
$('import-file').addEventListener('change',async()=>{
 const file=$('import-file').files[0];clearSelection(false);if(!file)return;const epoch=selectionEpoch;
 if(file.size>state.limits.bytes){$('import-status').textContent='Máximo 2 MiB por PNG. Nada foi gravado.';return;}
 if(!/\.png$/i.test(file.name)||!file.size){$('import-status').textContent='Escolha PNG estático. Outros formatos não são importados.';return;}
 $('import-status').textContent='A ler e verificar a seleção local…';$('import-progress').value=1;
 try{
  const bytes=new Uint8Array(await file.arrayBuffer());if(epoch!==selectionEpoch)return;
  if([137,80,78,71,13,10,26,10].some((b,i)=>bytes[i]!==b))throw new Error('Assinatura PNG inválida.');
  selectionURL=URL.createObjectURL(file);const img=$('import-preview');img.src=selectionURL;await img.decode();if(epoch!==selectionEpoch)return;
  if(img.naturalWidth>state.limits.width||img.naturalHeight>state.limits.height)throw new Error('Máximo 2048×2048 píxeis.');
  let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  selection={name:file.name,data:btoa(binary)};img.hidden=false;$('import-confirm').disabled=busy||stopped;$('import-status').textContent='Pronto para importar. Ainda não foi gravado.';
 }catch(error){if(epoch!==selectionEpoch)return;clearSelection();$('import-status').textContent=error.message+' Nada foi gravado.';}
});
$('import-confirm').addEventListener('click',()=>act(async()=>{
 if(!selection)return;const next=collect(),kind=$('import-target').value;
 $('import-status').textContent='A validar e guardar no projeto…';$('import-progress').removeAttribute('value');
 try{const result=await api('import',selection);next.assets[kind]=result.path;await refresh();recipe=next;fields();resourcePreview(true);dirty=true;clearSelection();$('import-progress').value=3;$('import-status').textContent='Recurso importado e selecionado. Guarde uma nova versão.';pendingFocus=$('assets.'+kind);}
 catch(error){$('import-progress').value=1;$('import-status').textContent=error.message+' Corrija a seleção; a receita não foi alterada.';throw error;}
}));
for(const kind of ['logo','hero']){const img=$('asset-'+kind+'-preview');img.addEventListener('error',()=>{$('asset-'+kind+'-status').textContent='Recurso ausente ou inválido. Selecione outro ou reimporte o original.';});img.addEventListener('load',()=>{$('asset-'+kind+'-status').textContent='Recurso local disponível.';});}
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
async function allowProjectChange(opener){
 if(busy||stopped)return false;if(!dirty&&!selection)return true;
 const dialog=$('pending-dialog');$('pending-error').textContent='';dialog.returnValue='cancel';dialog.showModal();
 const decision=await new Promise(resolve=>dialog.addEventListener('close',()=>resolve(dialog.returnValue),{once:true}));
 if(decision!=='discard'&&decision!=='saved'){opener.focus();return false;}dirty=false;clearSelection();return true;
}
$('pending-dialog').addEventListener('cancel',event=>{if(busy)event.preventDefault();});
$('pending-save').addEventListener('click',()=>act(async()=>{try{await api('save',{name:$('version-name').value,recipe:collect()});dirty=false;await refresh();$('pending-dialog').close('saved');}catch(error){$('pending-error').textContent=error.message;pendingFocus=$('pending-save');}}));
async function enterProject(id){await refresh(id);clearSelection();dirty=false;$('preview-result').hidden=true;$('recipe-source').value='preset';await load('preset');$('version-name').value='v1';history.replaceState(null,'','/?project='+encodeURIComponent(id));pendingFocus=$('project-select');}
$('project-open').addEventListener('click',async()=>{const id=$('project-select').value;if(id===activeProject)return;if(await allowProjectChange($('project-open')))await act(()=>enterProject(id));});
$('project-create').addEventListener('click',async()=>{if(!await allowProjectChange($('project-create')))return;await act(async()=>{
 const selected=$('project-source').value,[kind,name]=selected.split(':');const source=selected==='approved'?null:{project:activeProject,kind:kind==='initial'?'initial':kind,name:name||null};
 const result=await api('projects',{id:$('project-id').value,name:$('project-name').value,source});await enterProject(result.project.id);$('project-manager').querySelector('details').open=false;message('Projeto criado. Original preservado; guarde uma versão própria.');
});});
act(async()=>{await refresh();await load('preset');});
