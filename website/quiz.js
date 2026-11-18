'use strict';
const copy = {
  pt: {
    title: 'Pedido de proposta para website | BRANCT.Tech', hero: 'Um website à medida da tua empresa.',
    intro: 'Conta-nos o que precisas. Com estas respostas, a nossa equipa pode avaliar o projeto e falar contigo sobre uma proposta.',
    steps: ['Tipo de website','Setor de atividade','Objetivo','Prazo','Pedido de proposta'],
    questions: ['Que tipo de website procuras?', 'Em que setor trabalha a tua empresa?', 'O que queres que as pessoas façam no site?', 'Quando gostarias de lançar o website?', 'Com quem podemos falar sobre o projeto?'],
    options: [
      ['Site de apresentação','Loja online','Página para uma campanha','Renovação do meu site','Preciso de orientação'],
      ['Comércio e retalho','Serviços profissionais','Saúde e bem-estar','Restauração e hotelaria','Construção e imobiliário','Outro setor'],
      ['Pedir um orçamento ou entrar em contacto','Comprar produtos online','Marcar um serviço','Conhecer a empresa e o portefólio','Ainda estou a definir'],
      ['No próximo mês','Dentro de 1 a 3 meses','Daqui a mais de 3 meses','Ainda sem data definida']
    ],
    next: 'Continuar', back: 'Voltar', send: 'Pedir proposta', sending: 'A enviar…', name: 'Nome', email: 'Email', company: 'Empresa (opcional)',
    privacy: 'Política de privacidade', agree: 'Li a política de privacidade e autorizo a BRANCT a contactar-me sobre este pedido.',
    summary: 'Rever as minhas respostas', choose: 'Seleciona uma opção para continuar.', missing: 'Indica o teu nome (pelo menos duas letras) e um endereço de email válido.', permission: 'Confirma que podemos contactar-te sobre este pedido.',
    failed: 'O envio falhou. As tuas respostas continuam aqui. Tenta novamente ou contacta a equipa.', contact: 'Contactar a BRANCT', success: 'Recebemos o teu pedido.', thanks: 'A equipa BRANCT vai analisar o projeto e entrar em contacto através do email indicado.', done: 'Pedido enviado'
  },
  it: {
    title: 'Richiedi un preventivo per il tuo sito | BRANCT.Tech', hero: 'Un sito su misura per la tua attività.',
    intro: 'Raccontaci di cosa hai bisogno. Le tue risposte ci aiuteranno a valutare il progetto e a contattarti per un preventivo.',
    steps: ['Tipo di sito','Settore','Obiettivo','Tempistiche','Richiesta di preventivo'],
    questions: ['Che tipo di sito ti serve?', 'In quale settore opera la tua attività?', 'Che cosa vorresti che facessero i visitatori?', 'Quando vorresti pubblicare il sito?', 'Chi possiamo contattare per il progetto?'],
    options: [
      ['Sito di presentazione','Negozio online','Pagina per una campagna','Rinnovo del mio sito','Vorrei un consiglio'],
      ['Commercio e vendita al dettaglio','Servizi professionali','Salute e benessere','Ristorazione e ospitalità','Edilizia e immobiliare','Altro settore'],
      ['Chiedere un preventivo o contattarci','Acquistare prodotti online','Prenotare un servizio','Conoscere l’attività e il portfolio','Devo ancora definirlo'],
      ['Entro il prossimo mese','Tra 1 e 3 mesi','Tra più di 3 mesi','Non ho ancora una data']
    ],
    next: 'Continua', back: 'Indietro', send: 'Richiedi un preventivo', sending: 'Invio in corso…', name: 'Nome', email: 'Email', company: 'Azienda (facoltativo)',
    privacy: 'Informativa sulla privacy (in portoghese)', agree: 'Ho letto l’informativa sulla privacy e autorizzo BRANCT a contattarmi per questa richiesta.',
    summary: 'Rivedi le tue risposte', choose: 'Seleziona un’opzione per continuare.', missing: 'Inserisci il tuo nome (almeno due lettere) e un indirizzo email valido.', permission: 'Conferma che possiamo contattarti per questa richiesta.',
    failed: 'Invio non riuscito. Le tue risposte sono ancora qui. Riprova o contatta il team.', contact: 'Contatta BRANCT', success: 'Abbiamo ricevuto la tua richiesta.', thanks: 'Il team BRANCT valuterà il progetto e ti contatterà all’indirizzo email indicato.', done: 'Richiesta inviata'
  }
};
const state = { lang: 'pt', step: 0, answers: [null,null,null,null], name: '', email: '', company: '', consent: false, busy: false, done: false };
const el = id => document.getElementById(id);
const query = new URLSearchParams(location.search);
let interacted = false;
const locale = () => state.lang === 'it' ? 'it-IT' : 'pt-PT';
function storeContact() {
  if (!el('name')) return;
  for (const key of ['name','email','company']) state[key] = el(key).value;
  state.consent = el('consent').checked;
}
function summaryRows(t) {
  return state.answers.map((answer,index) => '<dt>'+t.steps[index]+'</dt><dd>'+t.options[index][answer]+'</dd>').join('');
}
function draw(focus = false) {
  const t = copy[state.lang];
  document.documentElement.lang = locale();
  document.title = t.title;
  document.querySelector('meta[name=description]').content = t.intro;
  el('hero-title').textContent = t.hero;
  el('intro').textContent = t.intro;
  el('privacy').textContent = t.privacy;
  for (const lang of ['it','pt']) {
    el(lang).setAttribute('aria-pressed', String(state.lang === lang));
    el(lang).disabled = state.busy;
  }
  el('step').textContent = state.done ? t.done : t.steps[state.step];
  el('count').textContent = state.done ? '' : (state.step+1)+' / 5';
  document.querySelector('.track i').style.width = ((state.step+1)*20)+'%';
  document.querySelector('main').classList.toggle('in-progress', state.step > 0);
  el('error').replaceChildren();
  const fields = el('fields');
  const heading = '<h2 id="question" tabindex="-1">'+(state.done?t.success:t.questions[state.step])+'</h2>';
  if (state.done) {
    fields.innerHTML = '<span class="success-icon" aria-hidden="true">✓</span>'+heading+'<p>'+t.thanks+'</p>';
  } else if (state.step < 4) {
    fields.innerHTML = heading+'<div class="options" role="radiogroup" aria-labelledby="question">'+t.options[state.step].map((label,index) =>
      '<label class="choice"><input type="radio" name="answer" value="'+index+'" '+(state.answers[state.step]===index?'checked':'')+'><span>'+label+'</span></label>'
    ).join('')+'</div>';
    fields.querySelectorAll('input').forEach(input => input.onchange = () => {
      state.answers[state.step] = Number(input.value);
      el('error').replaceChildren();
      interacted = true;
    });
  } else {
    fields.innerHTML = heading + ['name','email','company'].map(key =>
      '<label class="field">'+t[key]+'<input id="'+key+'" name="'+key+'" type="'+(key==='email'?'email':'text')+'" autocomplete="'+({name:'name',email:'email',company:'organization'})[key]+'" maxlength="'+(key==='email'?254:120)+'" '+(key==='company'?'':'required')+'></label>'
    ).join('')+'<label class="trap" aria-hidden="true">URL<input id="website-url" tabindex="-1" autocomplete="off"></label>'+
    '<details><summary>'+t.summary+'</summary><dl>'+summaryRows(t)+'</dl></details>'+
    '<label class="consent"><input id="consent" type="checkbox" required><span>'+t.agree+' <a target="_blank" rel="noopener" href="/politica-privacidade.html">'+t.privacy+'</a></span></label>';
    ['name','email','company'].forEach(key => el(key).value = state[key]);
    el('consent').checked = state.consent;
  }
  el('back').textContent = t.back;
  el('back').hidden = state.step === 0 || state.done;
  el('next').textContent = state.step===4 ? t.send : t.next+' →';
  el('next').hidden = state.done;
  if (focus) el('question').focus();
}
function setBusy(value) {
  state.busy = value;
  document.querySelectorAll('#quiz button,#quiz input,.languages button').forEach(item => item.disabled = value);
  el('next').textContent = value ? copy[state.lang].sending : copy[state.lang].send;
  el('quiz').setAttribute('aria-busy',String(value));
}
el('quiz').noValidate = true;
el('quiz').onsubmit = async event => {
  event.preventDefault();
  if (state.busy || state.done) return;
  interacted = true;
  const t = copy[state.lang];
  if (state.step < 4) {
    if (state.answers[state.step] === null) {
      el('error').textContent = t.choose;
      document.querySelector('input[name=answer]').focus();
      return;
    }
    state.step++;
    draw(true);
    return;
  }
  storeContact();
  const validName = state.name.trim().length >= 2;
  if (!validName || !el('email').validity.valid) {
    el('error').textContent = t.missing;
    el(validName ? 'email' : 'name').focus();
    return;
  }
  if (!state.consent) {
    el('error').textContent = t.permission;
    el('consent').focus();
    return;
  }
  const [siteType,sector,goal,timeline] = state.answers.map((answer,i)=>t.options[i][answer]);
  const payload = {name:state.name.trim(),email:state.email.trim(),company:state.company.trim(),locale:locale(),siteType,sector,goal,timeline,consent:true,website_url:el('website-url').value};
  for (const key of ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','utm_id']) {
    if (query.get(key)) payload[key]=query.get(key).slice(0,160);
  }
  setBusy(true);
  el('error').replaceChildren();
  try {
    const response = await fetch('./lead.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(20000)});
    if (!response.ok || (await response.json()).success !== true) throw new Error('Submission failed');
    state.done = true;
    state.name = state.email = state.company = '';
    setBusy(false);
    draw(true);
  } catch {
    setBusy(false);
    el('error').textContent=t.failed+' ';
    const link = document.createElement('a');
    link.href='/contactos.html'; link.textContent=t.contact;
    el('error').append(link);
  }
};
el('back').onclick = () => { if(state.busy || state.step<1) return; storeContact(); state.step--; draw(true); };
for (const lang of ['it','pt']) el(lang).onclick = () => {
  if (state.busy) return;
  interacted = true;
  storeContact();
  state.lang = lang;
  try {localStorage.setItem('branct.website.language',lang)} catch {}
  draw();
};
async function initialize() {
  let saved;
  try {saved=localStorage.getItem('branct.website.language')} catch {}
  const hint=query.get('lang')?.split('-')[0]?.toLowerCase();
  const supported = value => ['pt','it'].includes(value);
  const fallback = (navigator.languages || [navigator.language]).map(v => v.split('-')[0]).find(supported) || 'pt';
  state.lang = supported(saved) ? saved : supported(hint) ? hint : fallback;
  draw();
  if (supported(saved) || supported(hint)) return;
  try {
    const result=await fetch('./geo.php',{cache:'no-store',signal:AbortSignal.timeout(2200)});
    if (!result.ok || interacted) return;
    const country=(await result.json()).country;
    if (!interacted && ['IT','PT'].includes(country)) {
      state.lang=country.toLowerCase();
      draw();
    }
  } catch {}
}
initialize();
