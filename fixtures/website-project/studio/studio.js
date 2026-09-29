'use strict';
const $=id=>document.getElementById(id);
const get=(object,key)=>key.split('.').reduce((value,k)=>value[k],object);
const put=(object,key,value)=>{const keys=key.split('.');const leaf=keys.pop();keys.reduce((o,k)=>o[k],object)[leaf]=value;};
let state,recipe,dirty=false,busy=false,stopped=false,pendingFocus;
const sections=[
 ['01','Identidade & direção','O que identifica o projeto, sem mudar a estrutura.',[
 ['id','Identificador do projeto'],['name','Nome da marca'],['origin','Origem de referência','url'],
 ['fonts.body','Fonte de texto','select',['manrope','bricolage']],['fonts.display','Fonte de títulos','select',['bricolage','manrope']],
 ['palette.bg','Fundo','color'],['palette.surface','Superfície','color'],['palette.ink','Texto','color'],['palette.accent','Acento','color']]],
 ['02','As palavras certas','Texto simples; o gerador trata do HTML.',[
 ['content.eyebrow','Sobretítulo'],['content.headline','Título principal'],['content.description','Descrição','textarea'],['content.approachTitle','Título da abordagem'],['content.steps','Etapas · uma por linha','steps'],['content.contactTitle','Título do contacto'],['content.contactText','Texto do contacto','textarea'],['routes.home','Página inicial'],['routes.contact','Página de contacto'],['navigation.home','Navegação · início'],['navigation.approach','Navegação · abordagem'],['navigation.contact','Navegação · contacto'],['navigation.open','Nome acessível · abrir menu'],['navigation.close','Nome acessível · fechar menu']]],
 ['03','Recursos locais','Só referências do catálogo aprovado. Sem uploads.',[
 ['assets.logo','Logótipo','catalog'],['assets.hero','Imagem principal','catalog'],['assets.heroAlt','Descrição acessível da imagem','textarea'],['assets.heroCaption','Legenda da imagem','textarea']]]
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
     if(input.tagName==='INPUT'){input.type=type==='url'?'url':'text';if(type==='color'){input.maxLength=7;input.placeholder='#0C7C8F';}}
     if(input.tagName==='SELECT')for(const value of options||state.catalog[key.split('.')[1]]){const option=el('option',value);option.value=value;input.append(option);}
     input.value=type==='steps'?get(recipe,key).join('\n'):get(recipe,key);
     input.setAttribute('aria-describedby',key+'-error');
     input.addEventListener('input',()=>{dirty=true;input.removeAttribute('aria-invalid');$(key+'-error').textContent='';});
     const error=el('span',undefined,'error');error.id=key+'-error';box.append(lab,input,error);grid.append(box);
   }
   if(n==='03')grid.append(el('p','Assets e proveniência vêm da receita BRANCT versionada. A inclusão de recursos novos exige revisão fora desta bancada.','asset-note'));
   section.append(grid);$('fields').append(section);
 }
}
function collect(){const next=structuredClone(recipe);for(const [,, ,items] of sections)for(const [key,,type] of items)put(next,key,type==='steps'?$(key).value.split(/\r?\n/):$(key).value);return next;}
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
async function api(route,body){
 const response=await fetch('/api/'+route,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-Studio-Token':state.token},body:JSON.stringify(body)});
 const result=await response.json();if(!response.ok){errors(result);throw new Error(result.message);}return result;
}
async function act(fn){
 if(busy||stopped)return;busy=true;document.querySelectorAll('button,input,select,textarea').forEach(b=>b.disabled=true);
 $('recipe-form').setAttribute('aria-busy','true');document.querySelectorAll('.error').forEach(n=>n.textContent='');document.querySelectorAll('[aria-invalid]').forEach(n=>n.removeAttribute('aria-invalid'));
 try{await fn();}catch(error){if($('status').dataset.state!=='error')message('Não foi possível concluir: '+error.message,true);}
 finally{busy=false;$('recipe-form').removeAttribute('aria-busy');document.querySelectorAll('button,input,select,textarea').forEach(b=>b.disabled=stopped);pendingFocus?.focus();pendingFocus=undefined;}
}
async function refresh(){
 state=await api('state');
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
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
act(async()=>{await refresh();await load('preset');});
