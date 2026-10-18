/* ============================================================
   2STEP · CALENDÁRIO DE POSTAGENS (social media)
   A social media monta o calendário do período, sobe o material de
   cada post e gera um link para o cliente aprovar ou pedir edição.
   Entra no módulo Operacional, para admin e operação.
   Depende de app.js (S, DB, MEM, EMAIL, PAPEL, ROOT, MODULOS, ouve,
   save, del, render, modal, fecha, esc, uid, dLabel, hoje, addDias,
   addMesesD, toast, listaClientes, $).
   Dados novos: 2step_financeiro/calendarios/{id}
   Arquivos:    Firebase Storage, em calendarios/{id}/{post}/...
   A página do cliente é aprovacao.html, servida por api/calendario.js.
   ============================================================ */

var CAL = { c: {}, ligado: false, sel: '', limpou: false, enviando: false };

var CAL_TIPOS = {
  imagem:    { n:'Imagem',    accept:'image/*',         multi:false, ic:'▣' },
  carrossel: { n:'Carrossel', accept:'image/*,video/*', multi:true,  ic:'❐' },
  reels:     { n:'Reels',     accept:'video/*',         multi:false, ic:'▶' },
  stories:   { n:'Stories',   accept:'image/*,video/*', multi:true,  ic:'◷' }
};
var CAL_ST = {
  pendente: { n:'Aguardando cliente', pill:'p-av', cor:'var(--amber)' },
  aprovado: { n:'Aprovado',           pill:'p-on', cor:'var(--mint)' },
  ajuste:   { n:'Pediu edição',       pill:'p-cr', cor:'var(--coral)' }
};
var CAL_MAX_IMG = 30 * 1024 * 1024, CAL_MAX_VID = 300 * 1024 * 1024;
var CAL_DIAS_ARQUIVO = 60;   /* arquivos são apagados 60 dias depois do fim do período */
var CAL_SEM = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/* estilos só deste módulo */
(function(){
  var css = '' +
  '.cal-g{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px}' +
  '.cal-h{font-size:10px;color:var(--mute2);text-transform:uppercase;letter-spacing:.1em;text-align:center;padding:2px 0 4px;font-weight:700}' +
  '.cal-d{background:var(--slab);border:1px solid var(--line);border-radius:9px;min-height:96px;padding:6px;text-align:left;display:flex;flex-direction:column;gap:5px;transition:.13s;width:100%;min-width:0}' +
  '.cal-d.in{cursor:pointer}.cal-d.in:hover{border-color:var(--volt);background:var(--slab2)}' +
  '.cal-d.out{opacity:.22;cursor:default}' +
  '.cal-d.hj .cal-n{color:var(--volt)}' +
  '.cal-n{font-family:var(--mono);font-size:11px;color:var(--mute);font-weight:700;display:flex;justify-content:space-between}' +
  '.cal-t{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px}' +
  '.cal-t i{aspect-ratio:1;border-radius:6px;background:var(--slab3) center/cover no-repeat;border:2px solid var(--line2);font-style:normal;font-size:12px;display:flex;align-items:center;justify-content:center;color:var(--ink);overflow:hidden}' +
  '.cal-mais{font-size:10px;color:var(--mute);font-weight:700}' +
  '.cal-post{background:var(--slab2);border:1px solid var(--line);border-radius:10px;padding:12px;margin-bottom:10px}' +
  '.cal-car{display:flex;gap:8px;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:4px}' +
  '.cal-car>*{scroll-snap-align:start;flex:0 0 auto;height:220px;max-width:85%;border-radius:8px;background:#000;object-fit:contain}' +
  '.cal-bar{height:6px;background:var(--slab3);border-radius:6px;overflow:hidden;margin-top:8px}.cal-bar i{display:block;height:100%;background:var(--volt);transition:.2s}' +
  '@media(max-width:820px){.cal-d{min-height:58px;padding:4px}.cal-t{grid-template-columns:1fr}.cal-t i:nth-child(n+2){display:none}.cal-h{font-size:9px;letter-spacing:0}}';
  var s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
})();

/* ---------- dados ---------- */
function calLiga(){
  if(CAL.ligado || MEM || !DB || PAPEL === 'sem-acesso') return;
  CAL.ligado = true;
  ouve('calendarios', function(v){ CAL.c = v; calLimpaAntigos(); });
}
function calLista(){
  return Object.keys(CAL.c).map(function(k){ return CAL.c[k]; }).filter(Boolean)
    .sort(function(a, b){ return String(b.inicio || '').localeCompare(String(a.inicio || '')); });
}
function calPosts(cal){
  var p = cal.posts || {};
  return Object.keys(p).map(function(k){ return p[k]; }).filter(Boolean)
    .sort(function(a, b){ return String(a.data).localeCompare(String(b.data)) || String(a.criadoEm || '').localeCompare(String(b.criadoEm || '')); });
}
function calConta(cal){
  var ps = calPosts(cal), o = { total: ps.length, aprovado: 0, ajuste: 0, pendente: 0 };
  ps.forEach(function(p){ o[p.status || 'pendente']++; });
  return o;
}
function calBadge(){ calLiga(); return calLista().reduce(function(a, c){ return a + (c.status === 'enviado' ? calConta(c).ajuste : 0); }, 0); }
function calClientesSocial(){
  return listaClientes().filter(function(c){ return c.socialMedia && c.status !== 'encerrado'; })
    .sort(function(a, b){ return String(a.nome).localeCompare(String(b.nome), 'pt-BR'); });
}
function calNomeCliente(cal){ return (S.clientes[cal.clienteId] || {}).nome || 'Cliente removido'; }
function calLink(cal){ return location.origin + '/aprovacao.html?id=' + encodeURIComponent(cal.id) + '&k=' + encodeURIComponent(cal.token); }
function calToken(){
  var a = '', ch = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  var r = new Uint32Array(32);
  (window.crypto || window.msCrypto).getRandomValues(r);
  for(var i = 0; i < r.length; i++) a += ch[r[i] % ch.length];
  return a;
}

/* grava só os campos passados, sem apagar o que o cliente respondeu */
function calUpd(caminho, obj){
  if(MEM || !DB){ render(); return Promise.resolve(); }
  return DB.ref(ROOT + '/' + caminho).update(obj);
}

/* ---------- arquivos (Firebase Storage) ---------- */
function calStorage(){
  try{ return (!MEM && firebase.storage) ? firebase.storage() : null; }catch(e){ return null; }
}
function calSobe(calId, postId, file, aoProgresso){
  var st = calStorage();
  var video = /^video\//.test(file.type);
  if(!st) return Promise.resolve({ url: URL.createObjectURL(file), path: '', tipo: video ? 'video' : 'imagem', nome: file.name });
  var ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5);
  var path = 'calendarios/' + calId + '/' + postId + '/' + uid() + '.' + ext;
  return new Promise(function(ok, falha){
    var t = st.ref(path).put(file, { contentType: file.type });
    t.on('state_changed', function(s){ if(aoProgresso) aoProgresso(s.bytesTransferred / (s.totalBytes || 1)); }, falha, function(){
      t.snapshot.ref.getDownloadURL().then(function(url){ ok({ url: url, path: path, tipo: video ? 'video' : 'imagem', nome: file.name }); }, falha);
    });
  });
}
function calApagaArquivos(midias){
  var st = calStorage();
  if(!st) return Promise.resolve();
  return Promise.all((midias || []).filter(function(m){ return m && m.path; }).map(function(m){
    return st.ref(m.path).delete().catch(function(){ /* já não existe: segue */ });
  }));
}
/* apaga os arquivos dos calendários cujo período acabou há mais de 60 dias.
   Roda quando alguém da equipe abre o app; o registro de aprovações fica. */
function calLimpaAntigos(){
  if(CAL.limpou || !calStorage()) return;
  CAL.limpou = true;
  var lim = addDias(hoje(), -CAL_DIAS_ARQUIVO);
  calLista().forEach(function(cal){
    if(cal.arquivosApagados || !cal.fim || cal.fim >= lim) return;
    var todas = [];
    calPosts(cal).forEach(function(p){ todas = todas.concat(p.midias || []); });
    calApagaArquivos(todas).then(function(){ return calUpd('calendarios/' + cal.id, { arquivosApagados: true }); });
  });
}
function calValidaArquivos(files, tipo){
  var t = CAL_TIPOS[tipo];
  if(!files.length) return 'Escolha o arquivo';
  if(!t.multi && files.length > 1) return t.n + ' leva um arquivo só';
  for(var i = 0; i < files.length; i++){
    var f = files[i], v = /^video\//.test(f.type), im = /^image\//.test(f.type);
    if(!v && !im) return f.name + ' não é imagem nem vídeo';
    if(tipo === 'reels' && !v) return 'Reels precisa ser vídeo';
    if(tipo === 'imagem' && !im) return 'Escolha uma imagem (para vídeo use Reels)';
    if(im && f.size > CAL_MAX_IMG) return f.name + ' passa de 30 MB';
    if(v && f.size > CAL_MAX_VID) return f.name + ' passa de 300 MB';
  }
  return '';
}
/* carrossel na ordem do nome do arquivo: 1.jpg, 2.jpg, 10.jpg */
function calOrdena(files){
  return [].slice.call(files).sort(function(a, b){ return a.name.localeCompare(b.name, 'pt-BR', { numeric: true }); });
}

/* ---------- navegação ---------- */
function calAbrir(id){ CAL.sel = id; render(); window.scrollTo(0, 0); }
function calVoltar(){ CAL.sel = ''; render(); }
function vCal(){
  calLiga();
  return CAL.sel && CAL.c[CAL.sel] ? vCalEditor(CAL.c[CAL.sel]) : vCalLista();
}

/* ---------- lista ---------- */
function vCalLista(){
  var cals = calLista();
  var social = calClientesSocial();
  var semCal = social.filter(function(c){
    return !cals.some(function(k){ return k.clienteId === c.id && k.fim >= hoje(); });
  });

  var cards = cals.map(function(cal){
    var n = calConta(cal);
    var st;
    if(cal.status !== 'enviado') st = '<span class="pill p-off">rascunho</span>';
    else if(n.total && n.aprovado === n.total) st = '<span class="pill p-on">tudo aprovado</span>';
    else if(n.ajuste) st = '<span class="pill p-cr">' + n.ajuste + ' pediu edição</span>';
    else st = '<span class="pill p-av">aguardando cliente</span>';
    var pct = n.total ? Math.round(n.aprovado / n.total * 100) : 0;
    return '<button class="pc" onclick="calAbrir(\'' + cal.id + '\')">' +
      '<div class="pc-n">' + esc(calNomeCliente(cal)) + '</div>' +
      '<div class="pc-s">' + dLabel(cal.inicio) + ' a ' + dLabel(cal.fim) + '</div>' +
      '<div class="flx mt12" style="gap:6px">' + st + (cal.arquivosApagados ? '<span class="pill p-off">arquivos apagados</span>' : '') + '</div>' +
      '<div class="flx sp" style="margin-top:12px;font-size:11.5px;color:var(--mute)"><span>' + n.total + ' post(s)</span><span>' + n.aprovado + ' aprovado(s)</span></div>' +
      '<div class="bar" style="margin-top:6px"><i style="width:' + pct + '%;background:var(--mint)"></i></div>' +
      '</button>';
  }).join('');

  return '' +
  '<div class="hd"><div><h1>Calendário de postagens</h1><p>Monte o calendário, mande o link e acompanhe a aprovação do cliente</p></div>' +
  '<div class="hd-act"><button class="btn btn-p" onclick="mCalNovo()">+ Novo calendário</button></div></div>' +

  (!social.length ? '<div class="note">Nenhum cliente com Social media marcado. Um administrador marca em Financeiro › Clientes › Editar › Linhas de serviço.</div>' :
    (semCal.length ? '<div class="note">Sem calendário para o período atual: ' + semCal.map(function(c){ return esc(c.nome); }).join(', ') + '.</div>' : '')) +

  (cards ? '<div class="pg">' + cards + '</div>' :
    '<div class="tw"><div class="empty"><b>Nenhum calendário ainda</b>Clique em <b style="display:inline;font-size:13px">+ Novo calendário</b>, escolha o cliente e o período.</div></div>');
}

/* ---------- criar / editar período ---------- */
function mCalNovo(){
  var cs = calClientesSocial();
  if(!cs.length) return toast('Nenhum cliente com Social media marcado no cadastro', 'err');
  var ini = addDias(hoje(), 1);
  modal('Novo calendário',
    '<div class="fg"><label class="fl">Cliente</label><select class="fi" id="k_cli"><option value="">Escolha o cliente</option>' +
      cs.map(function(c){ return '<option value="' + esc(c.id) + '">' + esc(c.nome) + '</option>'; }).join('') + '</select>' +
      '<div class="hint">Aparecem os clientes com Social media marcado no cadastro.</div></div>' +
    '<div class="fr fr2">' +
      '<div class="fg"><label class="fl">Começa em</label><input type="date" class="fi" id="k_ini" value="' + ini + '" onchange="var f=$(\'k_fim\'); if(!f.dataset.mexeu) f.value=addMesesD(this.value,1)"></div>' +
      '<div class="fg"><label class="fl">Termina em</label><input type="date" class="fi" id="k_fim" value="' + addMesesD(ini, 1) + '" onchange="this.dataset.mexeu=1"></div>' +
    '</div>',
    '<button class="btn" onclick="fecha()">Cancelar</button><button class="btn btn-p" onclick="calCriar()">Criar e montar</button>');
}
function calCriar(){
  var cli = $('k_cli').value, ini = $('k_ini').value, fim = $('k_fim').value;
  if(!cli) return toast('Escolha o cliente', 'err');
  if(!ini || !fim || fim < ini) return toast('Confira o período', 'err');
  if(addMesesD(ini, 4) < fim) return toast('Período longo demais: até 4 meses', 'err');
  var cal = { id: uid(), clienteId: cli, inicio: ini, fim: fim, status: 'rascunho', token: calToken(),
              criadoEm: new Date().toISOString(), criadoPor: EMAIL || '', posts: {} };
  CAL.c[cal.id] = cal;
  save('calendarios/' + cal.id, cal);
  fecha();
  calAbrir(cal.id);
  toast('Calendário criado. Clique nos dias para adicionar os posts.', 'ok');
}
function mCalPeriodo(id){
  var cal = CAL.c[id];
  modal('Período do calendário',
    '<div class="fr fr2">' +
      '<div class="fg"><label class="fl">Começa em</label><input type="date" class="fi" id="k_ini" value="' + cal.inicio + '"></div>' +
      '<div class="fg"><label class="fl">Termina em</label><input type="date" class="fi" id="k_fim" value="' + cal.fim + '"></div>' +
    '</div>',
    '<button class="btn" onclick="fecha()">Cancelar</button><button class="btn btn-p" onclick="calSalvaPeriodo(\'' + id + '\')">Salvar</button>');
}
function calSalvaPeriodo(id){
  var cal = CAL.c[id], ini = $('k_ini').value, fim = $('k_fim').value;
  if(!ini || !fim || fim < ini) return toast('Confira o período', 'err');
  if(addMesesD(ini, 4) < fim) return toast('Período longo demais: até 4 meses', 'err');
  var fora = calPosts(cal).filter(function(p){ return p.data < ini || p.data > fim; });
  if(fora.length) return toast(fora.length + ' post(s) ficariam fora do período. Mova ou exclua antes.', 'err');
  cal.inicio = ini; cal.fim = fim;
  calUpd('calendarios/' + id, { inicio: ini, fim: fim });
  fecha(); render(); toast('Período atualizado', 'ok');
}

/* ---------- editor ---------- */
function calGrade(cal, celula){
  var ini = cal.inicio, fim = cal.fim;
  var d0 = addDias(ini, -new Date(ini + 'T12:00:00').getDay());
  var d1 = addDias(fim, 6 - new Date(fim + 'T12:00:00').getDay());
  var h = CAL_SEM.map(function(s){ return '<div class="cal-h">' + s + '</div>'; }).join('');
  var dias = '', d = d0, guard = 0, ms = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  while(d <= d1 && guard++ < 200){
    var dentro = d >= ini && d <= fim;
    var rot = +d.slice(8) + ((d.slice(8) === '01' || d === d0) ? ' ' + ms[+d.slice(5, 7) - 1] : '');
    dias += celula(d, dentro, rot);
    d = addDias(d, 1);
  }
  return '<div class="cal-g">' + h + dias + '</div>';
}
function calMiniatura(p){
  var m = (p.midias || [])[0];
  var cor = (CAL_ST[p.status || 'pendente'] || CAL_ST.pendente).cor;
  var bg = m && m.tipo === 'imagem' && m.url ? 'background-image:url(\'' + esc(m.url) + '\');' : '';
  return '<i style="' + bg + 'border-color:' + cor + '" title="' + CAL_TIPOS[p.tipo].n + ' · ' + (CAL_ST[p.status || 'pendente'] || {}).n + '">' +
    (bg ? '' : CAL_TIPOS[p.tipo].ic) + '</i>';
}
function vCalEditor(cal){
  var ps = calPosts(cal), n = calConta(cal);
  var porDia = {};
  ps.forEach(function(p){ (porDia[p.data] = porDia[p.data] || []).push(p); });
  var enviado = cal.status === 'enviado';

  var grade = calGrade(cal, function(d, dentro, rot){
    var lst = porDia[d] || [];
    return '<div class="cal-d ' + (dentro ? 'in' : 'out') + (d === hoje() ? ' hj' : '') + '" ' + (dentro ? 'onclick="mCalDia(\'' + cal.id + '\',\'' + d + '\')"' : '') + '>' +
      '<div class="cal-n"><span>' + rot + '</span>' + (dentro && !lst.length ? '<span style="color:var(--mute2)">+</span>' : '') + '</div>' +
      (lst.length ? '<div class="cal-t">' + lst.slice(0, 4).map(calMiniatura).join('') + '</div>' + (lst.length > 4 ? '<div class="cal-mais">+' + (lst.length - 4) + '</div>' : '') : '') +
      '</div>';
  });

  var ajustes = ps.filter(function(p){ return p.status === 'ajuste'; });

  return '' +
  '<button class="bk" onclick="calVoltar()">← Todos os calendários</button>' +
  '<div class="hd"><div><h1>' + esc(calNomeCliente(cal)) + '</h1><p>' + dLabel(cal.inicio) + ' a ' + dLabel(cal.fim) +
    ' · <span style="cursor:pointer;text-decoration:underline" onclick="mCalPeriodo(\'' + cal.id + '\')">mudar período</span></p></div>' +
  '<div class="hd-act">' +
    (enviado ? '<button class="btn" onclick="calCopiaLink(\'' + cal.id + '\')">Copiar link</button>' +
               '<button class="btn" onclick="calWhats(\'' + cal.id + '\')">Mandar no WhatsApp</button>' +
               '<a class="btn" style="text-decoration:none;color:var(--ink)" href="' + esc(calLink(cal)) + '" target="_blank" rel="noopener">Ver como o cliente</a>'
             : '<button class="btn btn-p" onclick="calFinaliza(\'' + cal.id + '\')">Finalizar e gerar link</button>') +
  '</div></div>' +

  (cal.arquivosApagados ? '<div class="note">O período acabou há mais de ' + CAL_DIAS_ARQUIVO + ' dias e os arquivos foram apagados. As aprovações continuam registradas.</div>' : '') +
  (!enviado ? '<div class="note" style="background:var(--volt-dim);border-color:rgba(124,92,255,.35);color:#c4b5fd">Rascunho: o cliente ainda não vê nada. Clique nos dias para adicionar os posts e, no fim, em <b>Finalizar e gerar link</b>.</div>' : '') +

  '<div class="grid g4 mb12">' +
    kpi('Posts', String(n.total), Object.keys(porDia).length + ' dia(s) com post', '') +
    kpi('Aprovados', String(n.aprovado), n.total ? Math.round(n.aprovado / n.total * 100) + '% do calendário' : '—', n.aprovado ? 'pos' : '') +
    kpi('Pediu edição', String(n.ajuste), n.ajuste ? 'Troque o material para voltar à aprovação' : 'Nenhum pedido de edição', n.ajuste ? 'neg' : '') +
    kpi('Aguardando', String(n.pendente), enviado ? 'Ainda sem resposta do cliente' : 'Link ainda não gerado', n.pendente ? 'warn' : '') +
  '</div>' +

  (ajustes.length ? '<div class="tw mb12"><div class="tw-hd"><div class="tw-t">Pedidos de edição</div><span class="pill p-cr">' + ajustes.length + '</span></div>' +
    ajustes.map(function(p){
      return '<div class="al" style="cursor:pointer" onclick="mCalDia(\'' + cal.id + '\',\'' + p.data + '\')"><div class="al-ic" style="background:var(--coral-dim);color:var(--coral)">!</div>' +
        '<div class="al-b"><div class="al-t">' + dLabel(p.data) + ' · ' + CAL_TIPOS[p.tipo].n + '</div><div class="al-s" style="white-space:pre-wrap;color:var(--ink)">' + esc(p.comentario || '') + '</div></div></div>';
    }).join('') + '</div>' : '') +

  '<div class="tw"><div class="tw-hd"><div class="tw-t">Calendário</div>' +
    '<div class="rw-leg"><i><span class="dot" style="background:var(--amber)"></span>aguardando</i><i><span class="dot" style="background:var(--mint)"></span>aprovado</i><i><span class="dot" style="background:var(--coral)"></span>pediu edição</i></div></div>' +
    '<div style="padding:12px">' + grade + '</div></div>' +

  '<div class="flx mt18" style="justify-content:flex-end"><button class="btn btn-s btn-d" onclick="calExcluir(\'' + cal.id + '\')">Excluir calendário</button></div>';
}

/* ---------- um dia ---------- */
function calMidiasHTML(midias){
  var ms = midias || [];
  if(!ms.length) return '<div style="color:var(--mute);font-size:12.5px">Sem arquivo</div>';
  var itens = ms.map(function(m){
    if(!m.url) return '<div style="display:flex;align-items:center;justify-content:center;color:var(--mute);font-size:12px;width:160px">arquivo apagado</div>';
    return m.tipo === 'video' ? '<video src="' + esc(m.url) + '" controls playsinline preload="metadata"></video>'
                              : '<img src="' + esc(m.url) + '" alt="" loading="lazy">';
  }).join('');
  return '<div class="cal-car">' + itens + '</div>' + (ms.length > 1 ? '<div class="hint">' + ms.length + ' arquivos · arraste para o lado</div>' : '');
}
function mCalDia(calId, data){
  var cal = CAL.c[calId];
  if(!cal) return;
  var ps = calPosts(cal).filter(function(p){ return p.data === data; });
  var dia = CAL_SEM[new Date(data + 'T12:00:00').getDay()];

  var lista = ps.map(function(p){
    var st = CAL_ST[p.status || 'pendente'];
    var resp = p.respostas ? Object.keys(p.respostas).map(function(k){ return p.respostas[k]; }).sort(function(a, b){ return String(b.em).localeCompare(String(a.em)); }) : [];
    return '<div class="cal-post">' +
      '<div class="flx sp mb12"><div class="flx" style="gap:7px"><b>' + CAL_TIPOS[p.tipo].n + '</b><span class="pill ' + st.pill + '">' + st.n + '</span>' +
        (p.versao > 1 ? '<span class="pill p-off">versão ' + p.versao + '</span>' : '') + '</div>' +
        '<div class="flx" style="gap:6px"><button class="btn btn-s" onclick="mCalPost(\'' + calId + '\',\'' + data + '\',\'' + p.id + '\')">Trocar material</button>' +
        '<button class="btn btn-s btn-d" onclick="calExcluirPost(\'' + calId + '\',\'' + p.id + '\')">Excluir</button></div></div>' +
      (p.status === 'ajuste' && p.comentario ? '<div class="note" style="background:var(--coral-dim);border-color:rgba(251,113,133,.35);color:#fda4af;white-space:pre-wrap"><b>O cliente pediu:</b> ' + esc(p.comentario) + '</div>' : '') +
      calMidiasHTML(p.midias) +
      (resp.length ? '<details class="mt12"><summary style="cursor:pointer;font-size:12px;color:var(--mute)">Histórico de respostas (' + resp.length + ')</summary>' +
        resp.map(function(r){
          return '<div style="font-size:12px;margin-top:6px;color:var(--mute)">' + dLabel(String(r.em).slice(0, 10)) + ' · ' + (r.acao === 'aprovar' ? 'aprovou' : 'pediu edição') +
            (r.versao ? ' (versão ' + r.versao + ')' : '') + (r.comentario ? ': <span style="color:var(--ink);white-space:pre-wrap">' + esc(r.comentario) + '</span>' : '') + '</div>';
        }).join('') + '</details>' : '') +
      '</div>';
  }).join('');

  modal(dia + ', ' + dLabel(data) + ' · ' + esc(calNomeCliente(cal)),
    (lista || '<div class="empty" style="padding:26px 10px"><b>Nenhum post neste dia</b>Adicione o primeiro abaixo.</div>'),
    '<button class="btn" onclick="fecha()">Fechar</button><button class="btn btn-p" onclick="mCalPost(\'' + calId + '\',\'' + data + '\')">+ Adicionar post</button>', true);
}

/* ---------- adicionar post / trocar material ---------- */
function mCalPost(calId, data, postId){
  var cal = CAL.c[calId];
  var p = postId ? (cal.posts || {})[postId] : null;
  modal((p ? 'Trocar material · ' : 'Novo post · ') + dLabel(data),
    (p && p.status === 'ajuste' && p.comentario ? '<div class="note" style="white-space:pre-wrap"><b>O cliente pediu:</b> ' + esc(p.comentario) + '</div>' : '') +
    '<div class="fg"><label class="fl">Tipo</label><div class="seg" id="k_tipos">' +
      Object.keys(CAL_TIPOS).map(function(t){
        return '<button type="button" data-t="' + t + '" class="' + ((p ? p.tipo : 'imagem') === t ? 'on' : '') + '" onclick="calEscolheTipo(\'' + t + '\')">' + CAL_TIPOS[t].n + '</button>';
      }).join('') + '</div></div>' +
    '<div class="fg"><label class="fl">Material</label><input type="file" class="fi" id="k_arq" accept="' + CAL_TIPOS[p ? p.tipo : 'imagem'].accept + '" ' + (CAL_TIPOS[p ? p.tipo : 'imagem'].multi ? 'multiple' : '') + '>' +
      '<div class="hint" id="k_dica">' + calDicaTipo(p ? p.tipo : 'imagem') + '</div></div>' +
    (p ? '<div class="hint">Ao salvar, o material antigo é apagado e o post volta para aprovação do cliente.</div>' : '') +
    '<div id="k_prog" class="hidden"><div style="font-size:12.5px;color:var(--mute)" id="k_prog_t">Enviando...</div><div class="cal-bar"><i id="k_prog_b" style="width:0"></i></div></div>',
    '<button class="btn" id="k_canc" onclick="mCalDia(\'' + calId + '\',\'' + data + '\')">Voltar</button>' +
    '<button class="btn btn-p" id="k_ok" onclick="calSalvaPost(\'' + calId + '\',\'' + data + '\',\'' + (postId || '') + '\')">' + (p ? 'Trocar e reenviar' : 'Salvar post') + '</button>');
  $('k_tipos').dataset.t = p ? p.tipo : 'imagem';
}
function calDicaTipo(t){
  return {
    imagem: 'Uma imagem (JPG, PNG). Até 30 MB.',
    carrossel: 'Selecione todas as imagens de uma vez. A ordem segue o nome do arquivo: 1.jpg, 2.jpg, 3.jpg...',
    reels: 'Um vídeo (MP4, MOV). Até 300 MB.',
    stories: 'Uma ou mais imagens ou vídeos, na ordem do nome do arquivo.'
  }[t];
}
function calEscolheTipo(t){
  var box = $('k_tipos');
  box.dataset.t = t;
  [].forEach.call(box.querySelectorAll('button'), function(b){ b.classList.toggle('on', b.dataset.t === t); });
  var a = $('k_arq');
  a.value = '';
  a.accept = CAL_TIPOS[t].accept;
  a.multiple = CAL_TIPOS[t].multi;
  $('k_dica').textContent = calDicaTipo(t);
}
function calSalvaPost(calId, data, postId){
  if(CAL.enviando) return;
  var cal = CAL.c[calId];
  var tipo = $('k_tipos').dataset.t;
  var files = calOrdena($('k_arq').files);
  var erro = calValidaArquivos(files, tipo);
  if(erro) return toast(erro, 'err');

  var antigo = postId ? (cal.posts || {})[postId] : null;
  var antigoMidias = antigo ? (antigo.midias || []).slice() : [];
  var pid = postId || uid();
  var total = files.reduce(function(a, f){ return a + f.size; }, 0), feito = 0;
  CAL.enviando = true;
  $('k_ok').disabled = true; $('k_canc').disabled = true;
  $('k_prog').classList.remove('hidden');

  var midias = [];
  var fila = Promise.resolve();
  files.forEach(function(f, i){
    fila = fila.then(function(){
      $('k_prog_t').textContent = 'Enviando ' + (i + 1) + ' de ' + files.length + ' · ' + f.name;
      return calSobe(calId, pid, f, function(fr){
        var b = $('k_prog_b'); if(b) b.style.width = Math.round((feito + fr * f.size) / total * 100) + '%';
      }).then(function(m){ midias.push(m); feito += f.size; });
    });
  });

  fila.then(function(){
    var agora = new Date().toISOString();
    if(antigo){
      var mud = { tipo: tipo, midias: midias, status: 'pendente', comentario: '', versao: (antigo.versao || 1) + 1, atualizadoEm: agora, atualizadoPor: EMAIL || '' };
      Object.assign(antigo, mud);
      return calUpd('calendarios/' + calId + '/posts/' + pid, mud).then(function(){ return calApagaArquivos(antigoMidias); });
    }
    var p = { id: pid, data: data, tipo: tipo, midias: midias, status: 'pendente', comentario: '', versao: 1, criadoEm: agora, criadoPor: EMAIL || '' };
    cal.posts = cal.posts || {};
    cal.posts[pid] = p;
    return save('calendarios/' + calId + '/posts/' + pid, p);
  }).then(function(){
    CAL.enviando = false;
    mCalDia(calId, data); render();
    toast(antigo ? 'Material trocado. O post voltou para aprovação.' : 'Post salvo', 'ok');
  }, function(e){
    CAL.enviando = false;
    calApagaArquivos(midias);
    var ok = $('k_ok'), cc = $('k_canc');
    if(ok) ok.disabled = false; if(cc) cc.disabled = false;
    toast('Falhou o envio: ' + ((e && e.code) || (e && e.message) || 'erro'), 'err');
  });
}
function calExcluirPost(calId, pid){
  var cal = CAL.c[calId], p = (cal.posts || {})[pid];
  if(!p) return;
  if(!confirm('Excluir este post de ' + dLabel(p.data) + '?\n\nO material é apagado e o cliente deixa de ver.')) return;
  var data = p.data;
  calApagaArquivos(p.midias);
  delete cal.posts[pid];
  del('calendarios/' + calId + '/posts/' + pid);
  mCalDia(calId, data); render();
  toast('Post excluído');
}

/* ---------- finalizar e compartilhar ---------- */
function calFinaliza(id){
  var cal = CAL.c[id];
  var n = calConta(cal);
  if(!n.total) return toast('Adicione pelo menos um post antes de finalizar', 'err');
  if(!confirm('Finalizar o calendário de ' + calNomeCliente(cal) + ' com ' + n.total + ' post(s)?\n\nO link fica pronto para mandar ao cliente. Você ainda pode adicionar ou trocar posts depois.')) return;
  cal.status = 'enviado';
  cal.enviadoEm = new Date().toISOString();
  calUpd('calendarios/' + id, { status: 'enviado', enviadoEm: cal.enviadoEm });
  render();
  calCopiaLink(id);
}
function calCopiaLink(id){
  var u = calLink(CAL.c[id]);
  function mostra(){
    modal('Link para o cliente',
      '<input class="fi mono" style="font-size:12px" readonly value="' + esc(u) + '" onclick="this.select()" id="k_link">' +
      '<div class="hint">Selecione e copie (Ctrl+C). Quem tiver este link vê só este calendário.</div>',
      '<button class="btn btn-p" onclick="fecha()">Pronto</button>');
    setTimeout(function(){ var e = $('k_link'); if(e) e.select(); }, 60);
  }
  if(navigator.clipboard && navigator.clipboard.writeText)
    navigator.clipboard.writeText(u).then(function(){ toast('Link copiado. É só colar para o cliente.', 'ok'); }, mostra);
  else mostra();
}
function calWhats(id){
  var cal = CAL.c[id];
  var txt = 'Olá! Segue o calendário de postagens de ' + dLabel(cal.inicio) + ' a ' + dLabel(cal.fim) +
    ' para sua aprovação. Clique em cada dia para ver o post e aprovar ou pedir ajuste:\n' + calLink(cal);
  window.open('https://wa.me/?text=' + encodeURIComponent(txt), '_blank', 'noopener');
}
function calExcluir(id){
  var cal = CAL.c[id];
  if(!confirm('Excluir o calendário de ' + calNomeCliente(cal) + ' (' + dLabel(cal.inicio) + ' a ' + dLabel(cal.fim) + ')?\n\nTodos os posts e arquivos são apagados e o link do cliente para de funcionar.')) return;
  var todas = [];
  calPosts(cal).forEach(function(p){ todas = todas.concat(p.midias || []); });
  calApagaArquivos(todas);
  delete CAL.c[id];
  del('calendarios/' + id);
  CAL.sel = '';
  render();
  toast('Calendário excluído');
}

/* ---------- registro no menu: Operacional › Calendário de postagens ---------- */
(function(){
  var m = MODULOS.filter(function(x){ return x.id === 'mid'; })[0];
  if(m) m.telas.push({ v:'cal', n:'Calendário de postagens', f:function(){ return vCal(); }, badge:function(){ return calBadge(); } });
})();
