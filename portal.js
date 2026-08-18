/* ============================================================
   2STEP · PORTAL DE MÍDIAS
   Módulo de links por cliente. Depende de app.js (S, save, del,
   render, listaClientes, ativoHoje, esc, uid, toast, modal).
   ============================================================ */

var PORTAL_SEL = '';      // cliente aberto
var PORTAL_OCULTOS = false;
var PORTAL_BUSCA = '';

/* tipos sugeridos: cor e sigla. O campo é livre, isto é só para o visual. */
var TIPOS = {
  'Google Drive':   { cor:'#F9AB00', ic:'D' },
  'Documento':      { cor:'#4285F4', ic:'Doc' },
  'Planilha':       { cor:'#0F9D58', ic:'Pl' },
  'Site':           { cor:'#22D3EE', ic:'W' },
  'Meta Business':  { cor:'#0866FF', ic:'M' },
  'Instagram':      { cor:'#E1306C', ic:'Ig' },
  'Criativos':      { cor:'#A78BFA', ic:'Cr' },
  'Contrato':       { cor:'#FB7185', ic:'Ct' },
  'Briefing':       { cor:'#FBBF24', ic:'Br' },
  'Relatório':      { cor:'#34D399', ic:'Rl' },
  'WhatsApp':       { cor:'#25D366', ic:'Wa' },
  'Outro':          { cor:'#7C8798', ic:'·' }
};
var TIPOK = Object.keys(TIPOS);

function tipoInfo(t){ return TIPOS[t] || { cor:'#7C8798', ic:(String(t||'?').trim()[0] || '?').toUpperCase() }; }

/* tenta adivinhar o tipo pela URL, só como sugestão ao cadastrar */
function adivinhaTipo(url){
  var u = String(url || '').toLowerCase();
  if(u.indexOf('drive.google') > -1)     return 'Google Drive';
  if(u.indexOf('docs.google.com/spreadsheets') > -1) return 'Planilha';
  if(u.indexOf('docs.google') > -1)      return 'Documento';
  if(u.indexOf('business.facebook') > -1 || u.indexOf('adsmanager') > -1) return 'Meta Business';
  if(u.indexOf('instagram.com') > -1)    return 'Instagram';
  if(u.indexOf('wa.me') > -1 || u.indexOf('whatsapp') > -1) return 'WhatsApp';
  if(u.indexOf('canva.com') > -1)        return 'Criativos';
  if(u.indexOf('lookerstudio') > -1 || u.indexOf('datastudio') > -1) return 'Relatório';
  /* endereço de raiz, sem caminho interno, quase sempre é o site do cliente */
  try{
    var p = new URL(normalizaURL(u)).pathname;
    if(p === '' || p === '/') return 'Site';
  }catch(e){}
  return '';
}
function normalizaURL(u){
  u = String(u || '').trim();
  if(!u) return '';
  if(!/^https?:\/\//i.test(u)) u = 'https://' + u;
  return u;
}
function dominio(u){
  try{ return new URL(u).hostname.replace(/^www\./, ''); }catch(e){ return String(u || '').slice(0, 40); }
}
function favicon(u){
  var d = dominio(u);
  return d ? 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(d) + '&sz=64' : '';
}

/* ---------- dados ---------- */
function linksDe(clienteId){
  var o = S.portais[clienteId] || {};
  return Object.keys(o).map(function(k){ return o[k]; })
    .sort(function(a, b){
      if(!!a.oculto !== !!b.oculto) return a.oculto ? 1 : -1;
      return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
    });
}
function contaLinks(clienteId){
  var l = linksDe(clienteId);
  return { total: l.length, visiveis: l.filter(function(x){ return !x.oculto; }).length };
}
function setLink(clienteId, lk){
  S.portais[clienteId] = S.portais[clienteId] || {};
  S.portais[clienteId][lk.id] = lk;
  save('portais/' + clienteId + '/' + lk.id, lk);
}
/* clientes ativos hoje: inclui quem esta em aviso previo, que ainda e atendido */
function clientesPortal(){
  return listaClientes().filter(ativoHoje).sort(function(a, b){
    return String(a.nome).localeCompare(String(b.nome), 'pt-BR');
  });
}

/* ---------- navegação ---------- */
function pAbrir(id){
  PORTAL_SEL = id;
  VIEW = 'portal';
  document.querySelectorAll('.nv-i').forEach(function(b){ b.classList.toggle('on', b.dataset.v === 'portal'); });
  render();
  window.scrollTo(0, 0);
}
function pVoltar(){ PORTAL_SEL = ''; PORTAL_BUSCA = ''; render(); }
function pBusca(v){ PORTAL_BUSCA = v; render(); }
function pOcultos(){ PORTAL_OCULTOS = !PORTAL_OCULTOS; render(); }

function vPortal(){ return PORTAL_SEL && S.clientes[PORTAL_SEL] ? vPortalCliente(S.clientes[PORTAL_SEL]) : vPortalLista(); }

/* ---------- lista de clientes ---------- */
function vPortalLista(){
  var cs = clientesPortal();
  var q = PORTAL_BUSCA.trim().toLowerCase();
  if(q) cs = cs.filter(function(c){
    if(String(c.nome).toLowerCase().indexOf(q) > -1) return true;
    return linksDe(c.id).some(function(l){
      return String(l.nome || '').toLowerCase().indexOf(q) > -1 ||
             String(l.tipo || '').toLowerCase().indexOf(q) > -1 ||
             String(l.url  || '').toLowerCase().indexOf(q) > -1;
    });
  });

  var totalLinks = clientesPortal().reduce(function(a, c){ return a + contaLinks(c.id).total; }, 0);
  var semNada = clientesPortal().filter(function(c){ return contaLinks(c.id).total === 0; });

  var cards = cs.map(function(c){
    var n = contaLinks(c.id);
    var tipos = {};
    linksDe(c.id).filter(function(l){ return !l.oculto; }).forEach(function(l){ tipos[l.tipo || 'Outro'] = 1; });
    var tags = Object.keys(tipos).slice(0, 4).map(function(t){
      return '<span class="pc-c" style="color:' + tipoInfo(t).cor + '">' + esc(t) + '</span>';
    }).join('');
    var aviso = c.status === 'aviso' ? ' <span class="pill p-av" style="font-size:10px">em aviso</span>' : '';
    return '<button class="pc" onclick="pAbrir(\'' + c.id + '\')">' +
      '<div class="pc-n">' + esc(c.nome) + aviso + '</div>' +
      '<div class="pc-s">' + (c.servicos ? esc(c.servicos) : 'Sem serviços descritos') + '</div>' +
      '<div class="pc-v ' + (n.visiveis ? 'vlt' : '') + '" style="' + (n.visiveis ? '' : 'color:var(--mute2)') + '">' +
        n.visiveis + '<span style="font-size:12px;font-weight:600;color:var(--mute);font-family:var(--body)"> ' +
        (n.visiveis === 1 ? 'link' : 'links') + (n.total > n.visiveis ? ' · ' + (n.total - n.visiveis) + ' oculto(s)' : '') + '</span></div>' +
      (tags ? '<div class="pc-t">' + tags + '</div>' : '<div class="pc-t"><span class="pc-c">nada cadastrado</span></div>') +
      '</button>';
  }).join('');

  return '' +
  '<div class="hd"><div><h1>Portal de mídias</h1><p>' + clientesPortal().length + ' clientes ativos · ' + totalLinks + ' links guardados</p></div>' +
  '<div class="hd-act"><input class="sr" placeholder="Buscar cliente, tipo ou link" value="' + esc(PORTAL_BUSCA) + '" oninput="pBusca(this.value)"></div></div>' +

  (semNada.length && !q ? '<div class="note">' + semNada.length + ' cliente(s) ainda sem nenhum link: ' +
    semNada.slice(0, 6).map(function(c){ return esc(c.nome); }).join(', ') + (semNada.length > 6 ? ' e outros' : '') + '.</div>' : '') +

  (cs.length ? '<div class="pg">' + cards + '</div>' :
    '<div class="tw"><div class="empty"><b>' + (q ? 'Nada encontrado' : 'Nenhum cliente ativo') + '</b>' +
    (q ? 'Nenhum cliente ou link bate com essa busca.' : 'O portal usa os clientes ativos do financeiro. Cadastre um contrato para ele aparecer aqui.') + '</div></div>');
}

/* ---------- links de um cliente ---------- */
function vPortalCliente(c){
  var todos = linksDe(c.id);
  var lista = PORTAL_OCULTOS ? todos : todos.filter(function(l){ return !l.oculto; });
  var ocultos = todos.filter(function(l){ return l.oculto; }).length;

  var linhas = lista.map(function(l){
    var t = tipoInfo(l.tipo);
    var fav = favicon(l.url);
    return '<div class="lk ' + (l.oculto ? 'off' : '') + '">' +
      '<div class="lk-i" style="background:' + t.cor + '22;color:' + t.cor + '">' +
        (fav ? '<img src="' + fav + '" alt="" onerror="this.replaceWith(document.createTextNode(\'' + esc(t.ic) + '\'))">' : esc(t.ic)) + '</div>' +
      '<div class="lk-b">' +
        '<div class="lk-n">' + esc(l.nome || 'Sem nome') +
          '<span class="pill p-off" style="color:' + t.cor + '">' + esc(l.tipo || 'Outro') + '</span>' +
          (l.oculto ? '<span class="pill p-off">oculto</span>' : '') + '</div>' +
        '<div class="lk-u">' + esc(dominio(l.url)) + '</div>' +
        (l.obs ? '<div class="lk-o">' + esc(l.obs) + '</div>' : '') +
      '</div>' +
      '<div class="lk-a">' +
        '<a class="ib" href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer" title="Abrir">↗</a>' +
        '<button class="ib" onclick="pCopiar(\'' + l.id + '\')" title="Copiar link">⧉</button>' +
        '<button class="ib" onclick="pOcultar(\'' + l.id + '\')" title="' + (l.oculto ? 'Mostrar' : 'Ocultar') + '">' + (l.oculto ? '◉' : '○') + '</button>' +
        '<button class="ib" onclick="mLink(\'' + l.id + '\')" title="Editar">✎</button>' +
        '<button class="ib d" onclick="pExcluir(\'' + l.id + '\')" title="Excluir">×</button>' +
      '</div></div>';
  }).join('');

  return '' +
  '<button class="bk" onclick="pVoltar()">← Todos os clientes</button>' +
  '<div class="hd"><div><h1>' + esc(c.nome) +
    (c.status === 'aviso' ? ' <span class="pill p-av" style="vertical-align:middle">em aviso prévio</span>' : '') + '</h1><p>' +
    (c.servicos ? esc(c.servicos) + ' · ' : '') + brl(c.mensalidade) + '/mês · cliente desde ' + dLabel(c.dataInicio) +
    (c.status === 'aviso' ? ' · sai em ' + dLabel(ultimaMensalidade(c)) : '') + '</p></div>' +
  '<div class="hd-act">' +
    (ocultos ? '<button class="btn" onclick="pOcultos()">' + (PORTAL_OCULTOS ? 'Esconder ocultos' : 'Ver ' + ocultos + ' oculto(s)') + '</button>' : '') +
    '<button class="btn btn-p" onclick="mLink()">+ Novo link</button></div></div>' +

  '<div class="tw">' + (lista.length ?
    '<div class="tw-hd"><div class="tw-t">' + lista.length + (lista.length === 1 ? ' link' : ' links') + '</div>' +
    '<span style="font-size:11.5px;color:var(--mute)">Clique na seta para abrir em nova aba</span></div>' + linhas
    : '<div class="empty"><b>' + (ocultos ? 'Nenhum link visível' : 'Nenhum link ainda') + '</b>' +
      (ocultos ? 'Este cliente tem ' + ocultos + ' link(s) oculto(s). Use o botão acima para vê-los.'
               : 'Adicione o drive, o site, a conta de anúncio — o que fizer sentido para este cliente.') + '</div>') +
  '</div>';
}

/* ---------- ações ---------- */
function pCopiar(id){
  var l = (S.portais[PORTAL_SEL] || {})[id];
  if(!l) return;
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(l.url).then(
      function(){ toast('Link copiado', 'ok'); },
      function(){ toast('Não consegui copiar', 'err'); }
    );
  }else{
    toast('Seu navegador não permite copiar aqui', 'err');
  }
}
function pOcultar(id){
  var l = (S.portais[PORTAL_SEL] || {})[id];
  if(!l) return;
  l.oculto = !l.oculto;
  setLink(PORTAL_SEL, l);
  render();
  toast(l.oculto ? 'Link ocultado' : 'Link visível de novo');
}
function pExcluir(id){
  var l = (S.portais[PORTAL_SEL] || {})[id];
  if(!l) return;
  if(!confirm('Excluir "' + (l.nome || 'este link') + '"?\n\nIsso apaga só o registro aqui no portal. O arquivo no Drive não é tocado.')) return;
  delete S.portais[PORTAL_SEL][id];
  del('portais/' + PORTAL_SEL + '/' + id);
  render();
  toast('Link excluído');
}

/* ---------- modal ---------- */
function mLink(id){
  var l = id ? (S.portais[PORTAL_SEL] || {})[id] : { id:'', nome:'', url:'', tipo:'', obs:'', oculto:false };
  if(!l) return;
  var c = S.clientes[PORTAL_SEL];
  modal(id ? 'Editar link' : 'Novo link · ' + esc(c.nome),
    '<div class="fg"><label class="fl">Link</label>' +
      '<input class="fi" id="l_url" value="' + esc(l.url) + '" placeholder="cole aqui o endereço" oninput="pSugere()">' +
      '<div class="hint">Pode colar sem o https, eu completo.</div></div>' +
    '<div class="fr fr2">' +
      '<div class="fg"><label class="fl">Nome</label><input class="fi" id="l_nome" value="' + esc(l.nome) + '" placeholder="Drive de criativos, Drive antigo, site"></div>' +
      '<div class="fg"><label class="fl">Tipo</label><input class="fi" id="l_tipo" list="l_tipos" value="' + esc(l.tipo) + '" placeholder="escolha ou escreva o seu">' +
        '<datalist id="l_tipos">' + TIPOK.map(function(t){ return '<option value="' + t + '">'; }).join('') + '</datalist></div>' +
    '</div>' +
    '<div class="fg"><label class="fl">Observação</label><textarea class="fi" id="l_obs" placeholder="ID da conta de anúncio, quem tem acesso, o que tem dentro">' + esc(l.obs) + '</textarea>' +
      '<div class="hint">Serve para contexto: número da conta, pixel, quem administra. Não guarde senhas aqui — quem entra no app lê tudo, e o backup sai em texto aberto.</div></div>' +
    '<div class="fg"><label class="chk ' + (l.oculto ? 'on' : '') + '"><input type="checkbox" id="l_oc" ' + (l.oculto ? 'checked' : '') + ' onchange="this.parentNode.classList.toggle(\'on\',this.checked)">Deixar oculto na lista</label></div>',
    (id ? '<button class="btn btn-d" onclick="fecha();pExcluir(\'' + id + '\')">Excluir</button>' : '') +
    '<button class="btn" onclick="fecha()">Cancelar</button>' +
    '<button class="btn btn-p" onclick="pSalvar(\'' + (id || '') + '\')">Salvar link</button>');
  setTimeout(function(){ var e = $('l_url'); if(e && !id) e.focus(); }, 60);
}
function pSugere(){
  var t = $('l_tipo');
  if(!t || t.value.trim()) return;
  var g = adivinhaTipo($('l_url').value);
  if(g) t.value = g;
}
function pSalvar(id){
  var url = normalizaURL($('l_url').value);
  if(!url) return toast('Cole o link', 'err');
  var nome = $('l_nome').value.trim();
  var tipo = $('l_tipo').value.trim() || adivinhaTipo(url) || 'Outro';
  var lk = {
    id: id || uid(),
    nome: nome || tipo,
    url: url,
    tipo: tipo,
    obs: $('l_obs').value.trim(),
    oculto: $('l_oc').checked,
    criadoEm: (id && (S.portais[PORTAL_SEL] || {})[id] || {}).criadoEm || hoje()
  };
  setLink(PORTAL_SEL, lk);
  fecha();
  render();
  toast(id ? 'Link atualizado' : 'Link salvo', 'ok');
}
