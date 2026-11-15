/* ============================================================
   2STEP · RASTREIO (telas)
   Rastreamento de leads de WhatsApp: de qual anúncio ou link cada
   conversa veio, jornada (frases gatilho), conexões dos números,
   links rastreáveis e integrações (Meta/Google) por cliente.
   Os dados vêm do MOTOR (servidor próprio, ver RAS.base), que lê as
   mensagens do Evolution API e expõe uma API autenticada com o mesmo
   login do Firebase deste app. Nada daqui grava no Realtime Database.
   Depende de app.js (S, AUTH, PAPEL, VIEW, MODULOS, render, modal,
   fecha, esc, toast, brl, nf, listaClientes, euSouAdmin, $).
   Papéis: admin vê e configura tudo; operacao vê e conecta números.
   ============================================================ */

var RAS = {
  base: 'https://srv2164688.hstgr.cloud',
  cliente: '', dias: 30,
  filtros: { origem: '', etapa: '', q: '' }, pagina: 1,
  cache: {}, pendentes: {},
  qrTimer: null, qrId: 0
};
var RAS_TTL = 25000;
var RAS_ORIGEM = {
  meta_ctwa:   { n: 'Anúncio Meta',  c: 'p-cy' },
  meta_link:   { n: 'Link Meta',     c: 'p-vl' },
  google:      { n: 'Google',        c: 'p-av' },
  link:        { n: 'Link',          c: 'p-vl' },
  organico:    { n: 'Orgânico',      c: 'p-off' },
  ativo:       { n: 'Empresa iniciou', c: 'p-off' },
  desconhecido:{ n: 'Sem origem',    c: 'p-off' }
};
var RAS_ETAPA = {
  novo:        { n: 'Novo',        c: 'p-off' },
  qualificado: { n: 'Qualificado', c: 'p-vl' },
  agendado:    { n: 'Agendado',    c: 'p-av' },
  venda:       { n: 'Venda',       c: 'p-on' },
  perdido:     { n: 'Perdido',     c: 'p-cr' }
};
var RAS_ESTADO = {
  open:        { n: 'Conectado',             c: 'p-on' },
  connecting:  { n: 'Aguardando QR',         c: 'p-av' },
  close:       { n: 'Desconectado',          c: 'p-cr' },
  inexistente: { n: 'Removida no servidor',  c: 'p-cr' },
  desconhecido:{ n: 'Verificando…',          c: 'p-off' }
};

/* estilos só deste módulo */
(function(){
  var css = '' +
  '.ras-bar{display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--line);font-size:12.5px}.ras-bar:last-child{border-bottom:none}' +
  '.ras-bar .l{width:130px;color:var(--mute);flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ras-bar .b{flex:1;height:7px;background:var(--slab3);border-radius:7px;overflow:hidden}.ras-bar .b i{display:block;height:100%;border-radius:7px;background:var(--volt)}' +
  '.ras-bar .n{font-family:var(--mono);font-weight:700;width:46px;text-align:right}' +
  '.ras-dias{display:flex;gap:2px;align-items:flex-end;height:90px;margin-top:8px}.ras-dias div{flex:1;position:relative;display:flex;flex-direction:column;justify-content:flex-end;height:100%}' +
  '.ras-dias i{display:block;background:var(--volt);border-radius:3px 3px 0 0;min-height:2px;opacity:.85}.ras-dias i.an{background:var(--cyan)}' +
  '.ras-dias div:hover .tip{opacity:1}' +
  '.ras-f{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px}.ras-f .fi{width:auto;min-width:150px}' +
  '.ras-row{cursor:pointer}' +
  '.ras-cx{background:var(--slab);border:1px solid var(--line);border-radius:var(--r);padding:16px;display:flex;flex-direction:column;gap:10px}' +
  '.ras-cx h3{font-family:var(--disp);font-size:15px;font-weight:600;letter-spacing:-.01em}.ras-cx .ac{display:flex;gap:6px;flex-wrap:wrap;margin-top:auto}' +
  '.ras-chat{background:var(--void);border:1px solid var(--line);border-radius:10px;padding:12px;height:460px;overflow-y:auto;display:flex;flex-direction:column;gap:6px}' +
  '.ras-m{max-width:78%;padding:7px 10px;border-radius:10px;font-size:12.5px;line-height:1.45;white-space:pre-wrap;word-break:break-word;background:var(--slab2);align-self:flex-start;border:1px solid var(--line)}' +
  '.ras-m.eu{align-self:flex-end;background:rgba(124,92,255,.18);border-color:rgba(124,92,255,.35)}.ras-m small{display:block;font-size:10px;color:var(--mute2);margin-top:3px;font-family:var(--mono)}' +
  '.ras-m .md{color:var(--mute);font-style:italic}' +
  '.ras-ev{display:flex;gap:9px;padding:7px 0;border-bottom:1px solid var(--line);font-size:12px}.ras-ev:last-child{border-bottom:none}.ras-ev .t{font-family:var(--mono);color:var(--mute2);white-space:nowrap;font-size:11px;padding-top:2px}' +
  '.ras-info{font-size:12.5px;line-height:1.55}.ras-info b{color:var(--mute);font-weight:600;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;display:block;margin-top:9px}' +
  '.ras-qr{width:260px;height:260px;margin:12px auto;background:#fff;border-radius:12px;display:flex;align-items:center;justify-content:center;color:#333;font-size:12px}.ras-qr img{width:100%;height:100%;border-radius:12px}' +
  '.ras-url{font-family:var(--mono);font-size:11.5px;color:var(--cyan);word-break:break-all}' +
  '.ras-fr{display:grid;grid-template-columns:1fr 110px 1fr 34px;gap:6px;margin-bottom:6px;align-items:center}' +
  '@media(max-width:820px){.ras-bar .l{width:90px}.ras-chat{height:320px}}';
  var s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
})();

/* ---------- chamadas ao motor ---------- */
function rasApi(metodo, caminho, corpo){
  if(!AUTH || !AUTH.currentUser) return Promise.reject(new Error('Faça login'));
  return AUTH.currentUser.getIdToken().then(function(tk){
    return fetch(RAS.base + caminho, {
      method: metodo || 'GET',
      headers: Object.assign({ Authorization: 'Bearer ' + tk }, corpo ? { 'Content-Type': 'application/json' } : {}),
      body: corpo ? JSON.stringify(corpo) : undefined
    });
  }).then(function(r){
    return r.json().catch(function(){ return { ok: false, erro: 'Resposta inválida do motor (' + r.status + ')' }; }).then(function(j){
      if(!r.ok || j.ok === false) throw new Error(j.erro || ('Erro ' + r.status));
      return j;
    });
  });
}
/* cache simples: devolve os dados se já tem; senão busca e re-renderiza quando chegar */
function rasDados(chave, caminho){
  var c = RAS.cache[chave];
  if(c && Date.now() - c.em < RAS_TTL) return c;
  if(RAS.pendentes[chave]) return c || null;
  RAS.pendentes[chave] = true;
  rasApi('GET', caminho).then(function(j){ RAS.cache[chave] = { em: Date.now(), dados: j }; })
    .catch(function(e){ RAS.cache[chave] = { em: Date.now(), erro: e.message }; })
    .finally(function(){ delete RAS.pendentes[chave]; if(VIEW.indexOf('ras_') === 0) render(); });
  return c || null;
}
function rasLimpa(prefixo){
  Object.keys(RAS.cache).forEach(function(k){ if(!prefixo || k.indexOf(prefixo) === 0) delete RAS.cache[k]; });
}
function rasRecarrega(prefixo){ rasLimpa(prefixo); render(); }

/* ---------- formatação ---------- */
function rasFone(t){
  var d = String(t || '').replace(/\D/g, '');
  if(!d) return '';
  if(d.length === 13 && d.indexOf('55') === 0) return '(' + d.slice(2, 4) + ') ' + d.slice(4, 5) + ' ' + d.slice(5, 9) + '-' + d.slice(9);
  if(d.length === 12 && d.indexOf('55') === 0) return '(' + d.slice(2, 4) + ') ' + d.slice(4, 8) + '-' + d.slice(8);
  return '+' + d;
}
function rasQuando(iso){
  if(!iso) return '—';
  var d = new Date(iso); if(isNaN(d)) return '—';
  var p = function(n){ return (n < 10 ? '0' : '') + n; };
  return p(d.getDate()) + '/' + p(d.getMonth() + 1) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}
function rasData(iso){ if(!iso) return '—'; var d = new Date(iso); var p = function(n){ return (n < 10 ? '0' : '') + n; }; return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear(); }
function rasPill(mapa, chave){ var m = mapa[chave] || { n: chave || '—', c: 'p-off' }; return '<span class="pill ' + m.c + '">' + esc(m.n) + '</span>'; }
function rasNomeLead(l){ var n = l.nome && !/^[\d\s()+\-]+$/.test(l.nome) ? l.nome : ''; return esc(n || (l.telefone ? rasFone(l.telefone) : 'Contato sem nome')); }
function rasErro(c){ return c && c.erro ? '<div class="note">Não consegui falar com o motor: ' + esc(c.erro) + ' <button class="btn btn-s" onclick="rasRecarrega()">Tentar de novo</button></div>' : ''; }
function rasCarregando(){ return '<div class="empty"><b>Carregando…</b>buscando no motor de rastreio</div>'; }

/* ---------- clientes do motor (filtro comum) ---------- */
function rasClientes(){ var c = rasDados('clientes', '/api/clientes'); return c && c.dados ? c.dados.itens : []; }
function rasSelCliente(onchange){
  var cs = rasClientes();
  return '<select class="fi" onchange="' + (onchange || 'rasTrocaCliente(this.value)') + '"><option value="">Todos os clientes</option>' +
    cs.map(function(c){ return '<option value="' + c.id + '" ' + (String(RAS.cliente) === String(c.id) ? 'selected' : '') + '>' + esc(c.nome) + '</option>'; }).join('') + '</select>';
}
function rasTrocaCliente(v){ RAS.cliente = v; RAS.pagina = 1; rasLimpa('resumo'); rasLimpa('leads'); rasLimpa('links'); render(); }
function rasQsCliente(){ return RAS.cliente ? '&cliente_id=' + encodeURIComponent(RAS.cliente) : ''; }

/* ================= PAINEL ================= */
function vRasPainel(){
  var c = rasDados('resumo:' + RAS.dias + ':' + RAS.cliente, '/api/resumo?dias=' + RAS.dias + rasQsCliente());
  var h = '<div class="hd"><div><h1>Rastreio de leads</h1><p>De onde vêm as conversas de WhatsApp dos clientes e o que viram venda</p></div>' +
    '<div class="hd-act">' + rasSelCliente() +
    '<div class="seg">' + [7, 30, 90].map(function(d){ return '<button class="' + (RAS.dias === d ? 'on' : '') + '" onclick="RAS.dias=' + d + ';render()">' + d + ' dias</button>'; }).join('') + '</div>' +
    '<button class="btn" onclick="rasRecarrega(\'resumo\')">Atualizar</button></div></div>';
  if(!c) return h + rasCarregando();
  if(c.erro) return h + rasErro(c);
  var d = c.dados, t = d.totais || {};
  var pct = t.leads ? Math.round(100 * t.rastreados / t.leads) : 0;
  h += '<div class="grid g4 mb12">' +
    '<div class="card"><div class="kpi-l">Leads no período</div><div class="kpi-v">' + (t.leads || 0) + '</div><div class="kpi-s">conversas novas em ' + d.dias + ' dias</div></div>' +
    '<div class="card"><div class="kpi-l">Com origem rastreada</div><div class="kpi-v cyn">' + pct + '%</div><div class="kpi-s">' + (t.rastreados || 0) + ' de anúncio, link ou Google</div></div>' +
    '<div class="card"><div class="kpi-l">Vendas</div><div class="kpi-v pos">' + (t.vendas || 0) + '</div><div class="kpi-s">marcadas com a frase gatilho</div></div>' +
    '<div class="card"><div class="kpi-l">Receita marcada</div><div class="kpi-v">' + brl(t.receita || 0, 1) + '</div><div class="kpi-s">soma dos valores nas vendas</div></div></div>';
  var maxO = Math.max.apply(null, (d.por_origem || []).map(function(x){ return x.n; }).concat([1]));
  var maxE = Math.max.apply(null, (d.por_etapa || []).map(function(x){ return x.n; }).concat([1]));
  h += '<div class="grid g2 mb12">' +
    '<div class="card"><div class="rw-t mb12">Por origem</div>' + ((d.por_origem || []).map(function(x){ var m = RAS_ORIGEM[x.origem] || { n: x.origem }; return '<div class="ras-bar"><span class="l">' + esc(m.n) + '</span><span class="b"><i style="width:' + Math.round(100 * x.n / maxO) + '%"></i></span><span class="n">' + x.n + '</span></div>'; }).join('') || '<div class="empty">Sem leads no período</div>') + '</div>' +
    '<div class="card"><div class="rw-t mb12">Por etapa</div>' + ((d.por_etapa || []).map(function(x){ var m = RAS_ETAPA[x.etapa] || { n: x.etapa }; return '<div class="ras-bar"><span class="l">' + esc(m.n) + '</span><span class="b"><i style="width:' + Math.round(100 * x.n / maxE) + '%;background:var(--mint)"></i></span><span class="n">' + x.n + '</span></div>'; }).join('') || '<div class="empty">Sem leads no período</div>') + '</div></div>';
  var dias = d.por_dia || [], maxD = Math.max.apply(null, dias.map(function(x){ return x.n; }).concat([1]));
  h += '<div class="card mb12"><div class="rw-hd"><div class="rw-t">Leads novos por dia</div><div class="rw-leg"><i><span class="dot" style="background:var(--volt)"></span>todos</i><i><span class="dot" style="background:var(--cyan)"></span>de anúncio</i></div></div>' +
    (dias.length ? '<div class="ras-dias">' + dias.map(function(x){
      var hh = Math.max(2, Math.round(80 * x.n / maxD)), ha = Math.max(0, Math.round(80 * x.anuncio / maxD));
      return '<div><div class="tip"><b>' + x.dia.slice(8, 10) + '/' + x.dia.slice(5, 7) + '</b><br>' + x.n + ' leads · ' + x.anuncio + ' de anúncio</div><i style="height:' + hh + 'px"></i>' + (ha ? '<i class="an" style="height:' + ha + 'px;margin-top:-' + ha + 'px"></i>' : '') + '</div>';
    }).join('') + '</div>' : '<div class="empty">Sem dados no período</div>') + '</div>';
  h += '<div class="card"><div class="rw-t mb12">Conexões</div>' + ((d.conexoes || []).map(function(x){ return rasPill(RAS_ESTADO, x.estado) + ' <span class="mono">' + x.n + '</span> &nbsp; '; }).join('') || '<span class="sub">Nenhum número conectado ainda</span>') +
    ' <button class="btn btn-s" style="margin-left:10px" onclick="go(\'ras_conexoes\')">Ver conexões</button></div>';
  return h;
}

/* ================= CONVERSAS (LEADS) ================= */
function rasChaveLeads(){ return 'leads:' + JSON.stringify([RAS.cliente, RAS.filtros, RAS.pagina]); }
function rasFiltro(k, v){ RAS.filtros[k] = v; RAS.pagina = 1; render(); }
function vRasLeads(){
  var f = RAS.filtros;
  var qs = '/api/leads?por=50&pagina=' + RAS.pagina + rasQsCliente() + (f.origem ? '&origem=' + f.origem : '') + (f.etapa ? '&etapa=' + f.etapa : '') + (f.q ? '&q=' + encodeURIComponent(f.q) : '');
  var c = rasDados(rasChaveLeads(), qs);
  var h = '<div class="hd"><div><h1>Conversas</h1><p>Cada contato que falou com um número conectado, com origem e etapa</p></div>' +
    '<div class="hd-act"><button class="btn" onclick="rasRecarrega(\'leads\')">Atualizar</button></div></div>';
  h += '<div class="ras-f">' + rasSelCliente() +
    '<select class="fi" onchange="rasFiltro(\'origem\',this.value)"><option value="">Todas as origens</option>' + Object.keys(RAS_ORIGEM).map(function(k){ return '<option value="' + k + '" ' + (f.origem === k ? 'selected' : '') + '>' + RAS_ORIGEM[k].n + '</option>'; }).join('') + '</select>' +
    '<select class="fi" onchange="rasFiltro(\'etapa\',this.value)"><option value="">Todas as etapas</option>' + Object.keys(RAS_ETAPA).map(function(k){ return '<option value="' + k + '" ' + (f.etapa === k ? 'selected' : '') + '>' + RAS_ETAPA[k].n + '</option>'; }).join('') + '</select>' +
    '<input class="sr" placeholder="Nome ou telefone… (Enter)" value="' + esc(f.q) + '" onkeydown="if(event.key===\'Enter\')rasFiltro(\'q\',this.value)">' +
    (f.q || f.origem || f.etapa ? '<button class="btn btn-s" onclick="RAS.filtros={origem:\'\',etapa:\'\',q:\'\'};RAS.pagina=1;render()">Limpar</button>' : '') + '</div>';
  if(!c) return h + rasCarregando();
  if(c.erro) return h + rasErro(c);
  var d = c.dados, its = d.itens || [];
  h += '<div class="tw"><div class="tw-hd"><div class="tw-t">' + d.total + ' conversa' + (d.total === 1 ? '' : 's') + '</div><div class="sub">página ' + d.pagina + ' de ' + Math.max(1, Math.ceil(d.total / d.por)) + '</div></div><div class="tsc"><table><thead><tr><th>Contato</th><th>Cliente</th><th>Origem</th><th>Etapa</th><th class="tr">Msgs</th><th>Primeiro contato</th><th>Última mensagem</th></tr></thead><tbody>' +
    (its.map(function(l){
      var od = l.origem_dados || {};
      var det = od.titulo ? '<div class="sub">' + esc(od.titulo) + '</div>' : (od.link_nome ? '<div class="sub">' + esc(od.link_nome) + '</div>' : '');
      return '<tr class="ras-row" onclick="rasAbreLead(' + l.id + ')"><td><div class="nm">' + rasNomeLead(l) + '</div>' + (l.nome && !/^[\d\s()+\-]+$/.test(l.nome) && l.telefone ? '<div class="sub mono">' + rasFone(l.telefone) + '</div>' : '') + '</td>' +
        '<td>' + esc(l.cliente) + '<div class="sub">' + esc(l.conexao_nome || '') + '</div></td><td>' + rasPill(RAS_ORIGEM, l.origem) + det + '</td>' +
        '<td>' + rasPill(RAS_ETAPA, l.etapa) + (l.valor ? '<div class="sub mono">' + brl(l.valor) + '</div>' : '') + '</td>' +
        '<td class="tr mono">' + l.msgs_recebidas + ' <span style="color:var(--mute2)">/ ' + l.msgs_enviadas + '</span></td><td class="mono">' + rasQuando(l.primeiro_contato_em) + '</td><td class="mono">' + rasQuando(l.ultima_mensagem_em) + '</td></tr>';
    }).join('') || '<tr><td colspan="7"><div class="empty"><b>Nenhuma conversa</b>com esses filtros</div></td></tr>') + '</tbody></table></div>' +
    '<div class="mtot" style="justify-content:flex-end;gap:8px"><button class="btn btn-s" ' + (RAS.pagina <= 1 ? 'disabled' : '') + ' onclick="RAS.pagina--;render()">← Anterior</button><button class="btn btn-s" ' + (d.pagina * d.por >= d.total ? 'disabled' : '') + ' onclick="RAS.pagina++;render()">Próxima →</button></div></div>';
  return h;
}

function rasAbreLead(id){
  modal('Conversa', rasCarregando(), '<button class="btn" onclick="fecha()">Fechar</button>', true);
  Promise.all([rasApi('GET', '/api/leads/' + id), rasApi('GET', '/api/leads/' + id + '/mensagens')]).then(function(rs){
    var l = rs[0].lead, evs = rs[0].eventos || [], cvs = rs[0].conversoes || [], msgs = rs[1].itens || [];
    var od = l.origem_dados || {};
    var info = '<div class="ras-info">' +
      '<div style="font-family:var(--disp);font-size:17px;font-weight:600">' + rasNomeLead(l) + '</div>' +
      (l.telefone ? '<div class="mono" style="color:var(--mute)">' + rasFone(l.telefone) + '</div>' : '<div class="sub">telefone ainda não identificado pelo WhatsApp</div>') +
      '<div style="margin-top:8px">' + rasPill(RAS_ORIGEM, l.origem) + ' ' + rasPill(RAS_ETAPA, l.etapa) + (l.valor ? ' <span class="mono">' + brl(l.valor) + '</span>' : '') + '</div>' +
      '<b>Cliente</b>' + esc(l.cliente) + ' · ' + esc(l.conexao_nome || '') +
      (l.origem === 'meta_ctwa' ? '<b>Anúncio</b>' + esc(od.titulo || '—') + (od.descricao ? '<div class="sub">' + esc(od.descricao) + '</div>' : '') + (od.anuncio_id ? '<div class="sub mono">id ' + esc(od.anuncio_id) + (od.app ? ' · ' + esc(od.app) : '') + '</div>' : '') + (od.url ? '<div class="sub"><a class="ras-url" href="' + esc(od.url) + '" target="_blank" rel="noopener">' + esc(od.url) + '</a></div>' : '') : '') +
      (od.link ? '<b>Link rastreável</b>' + esc(od.link_nome || od.link) + ' <span class="mono">#' + esc(od.codigo) + '</span>' + (od.utm && Object.keys(od.utm).length ? '<div class="sub mono">' + Object.keys(od.utm).map(function(k){ return esc(k) + '=' + esc(od.utm[k]); }).join(' · ') + '</div>' : '') : '') +
      '<b>Datas</b>primeiro contato ' + rasQuando(l.primeiro_contato_em) + '<br>última mensagem ' + rasQuando(l.ultima_mensagem_em) +
      '<b>Mensagens</b>' + l.msgs_recebidas + ' recebidas · ' + l.msgs_enviadas + ' enviadas' +
      '<b>Jornada</b></div>' +
      '<div>' + (evs.map(function(e){
        var txt = e.tipo === 'lead' ? 'Lead criado (' + ((RAS_ORIGEM[(e.dados || {}).origem] || {}).n || 'origem') + ')' :
                  e.tipo === 'origem' ? 'Origem identificada: ' + ((RAS_ORIGEM[(e.dados || {}).para] || {}).n || '') :
                  e.tipo === 'venda' ? 'Venda marcada' + (e.valor ? ' · ' + brl(e.valor) : '') + ' <span class="sub">' + esc((e.dados || {}).frase || '') + '</span>' :
                  'Etapa: ' + ((RAS_ETAPA[e.etapa] || {}).n || e.etapa) + ' <span class="sub">' + esc((e.dados || {}).frase || '') + '</span>';
        return '<div class="ras-ev"><span class="t">' + rasQuando(e.em) + '</span><span>' + txt + '</span></div>';
      }).join('') || '<div class="sub">sem eventos</div>') + '</div>' +
      (cvs.length ? '<div class="ras-info"><b>Conversões enviadas</b></div><div>' + cvs.map(function(v){ return '<div class="ras-ev"><span class="t">' + rasQuando(v.criado_em) + '</span><span>' + esc(v.plataforma) + ' · ' + esc(v.evento) + ' · ' + rasPill({ enviado: { n: 'enviado', c: 'p-on' }, pendente: { n: 'pendente', c: 'p-av' }, erro: { n: 'erro', c: 'p-cr' } }, v.status) + '</span></div>'; }).join('') + '</div>' : '');
    var chat = '<div class="ras-chat" id="rasChat">' + (msgs.map(function(m){
      var corpo = m.texto ? esc(m.texto) : '<span class="md">' + (m.midia ? '[' + esc(m.tipo.replace('Message', '')) + ']' : '[' + esc(m.tipo) + ']') + '</span>';
      return '<div class="ras-m ' + (m.de_mim ? 'eu' : '') + '">' + corpo + '<small>' + rasQuando(m.em) + '</small></div>';
    }).join('') || '<div class="empty">Sem mensagens no servidor</div>') + '</div>';
    modal('Conversa', '<div class="fr fr2" style="grid-template-columns:300px 1fr;gap:16px"><div>' + info + '</div>' + chat + '</div>',
      '<button class="btn" onclick="fecha()">Fechar</button>', true);
    var el = $('rasChat'); if(el) el.scrollTop = el.scrollHeight;
  }).catch(function(e){ modal('Conversa', '<div class="note">' + esc(e.message) + '</div>', '<button class="btn" onclick="fecha()">Fechar</button>'); });
}

/* ================= CONEXÕES ================= */
function vRasConexoes(){
  var c = rasDados('conexoes', '/api/conexoes');
  var h = '<div class="hd"><div><h1>Conexões</h1><p>Números de WhatsApp ligados ao rastreio. Cada número é conectado pelo QR Code, como no WhatsApp Web.</p></div>' +
    '<div class="hd-act"><button class="btn" onclick="rasRecarrega(\'conexoes\')">Atualizar</button><button class="btn btn-p" onclick="rasNovaConexao()">+ Conectar número</button></div></div>';
  if(!c) return h + rasCarregando();
  if(c.erro) return h + rasErro(c);
  var its = c.dados.itens || [];
  if(!its.length) return h + '<div class="tw"><div class="empty"><b>Nenhum número conectado</b>Clique em "Conectar número", escolha o cliente e leia o QR Code no celular dele.</div></div>';
  return h + '<div class="pg">' + its.map(function(x){
    var det = x.detalhe || {};
    return '<div class="ras-cx"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px"><div><h3>' + esc(x.cliente) + '</h3><div class="sub">' + esc(x.nome_perfil || x.instancia) + (x.numero ? ' · <span class="mono">' + rasFone(x.numero) + '</span>' : '') + '</div></div>' + rasPill(RAS_ESTADO, x.estado) + '</div>' +
      '<div class="sub"><span class="mono">' + x.leads + '</span> conversas · <span class="mono">' + x.total_processadas + '</span> mensagens lidas · atualizado ' + rasQuando(x.atualizado_em) + (det.motivo && x.estado !== 'open' && String(det.motivo) !== '200' ? ' · motivo ' + esc(det.motivo) : '') + '</div>' +
      '<div class="ac">' + (x.estado !== 'open' ? '<button class="btn btn-s btn-p" onclick="rasQr(' + x.id + ')">Ler QR Code</button>' : '') +
      '<button class="btn btn-s" onclick="rasAcaoCx(' + x.id + ',\'sincronizar\')">Sincronizar</button>' +
      (x.estado !== 'open' ? '<button class="btn btn-s" onclick="rasAcaoCx(' + x.id + ',\'reiniciar\')">Reiniciar</button>' : '') +
      (euSouAdmin() ? '<button class="btn btn-s btn-d" onclick="rasAcaoCx(' + x.id + ',\'sair\')">Desconectar</button><button class="btn btn-s btn-d" onclick="rasRemoveCx(' + x.id + ',\'' + esc(x.cliente) + '\')">Remover</button>' : '') + '</div></div>';
  }).join('') + '</div>';
}
function rasNovaConexao(){
  var cs = rasClientes();
  if(!cs.length) return toast('Cadastre um cliente em Rastreio › Clientes primeiro', 'err');
  modal('Conectar número de WhatsApp',
    '<div class="fg"><label class="fl">Cliente</label><select class="fi" id="ras_cx_cli">' + cs.map(function(c){ return '<option value="' + c.id + '">' + esc(c.nome) + '</option>'; }).join('') + '</select></div>' +
    '<div class="hint">Vai abrir um QR Code. No celular do cliente: WhatsApp › Mais opções › Dispositivos conectados › Conectar dispositivo. O histórico recente entra sozinho depois da leitura.</div>',
    '<button class="btn" onclick="fecha()">Cancelar</button><button class="btn btn-p" onclick="rasCriaConexao()">Gerar QR Code</button>');
}
function rasCriaConexao(){
  var cid = $('ras_cx_cli').value;
  modal('Conectar número de WhatsApp', rasCarregando(), '');
  rasApi('POST', '/api/conexoes', { cliente_id: Number(cid) }).then(function(j){ rasLimpa('conexoes'); rasQr(j.conexao.id); })
    .catch(function(e){ toast(e.message, 'err'); fecha(); });
}
function rasFechaQr(){ clearTimeout(RAS.qrTimer); RAS.qrTimer = null; RAS.qrId = 0; fecha(); rasRecarrega('conexoes'); }
function rasQr(id){
  RAS.qrId = id;
  modal('Ler QR Code', '<div class="ras-qr" id="rasQrBox">gerando…</div><div class="tc" id="rasQrSt"><span class="pill p-av">aguardando leitura</span></div><div class="hint tc mt12">O código renova sozinho. No celular: WhatsApp › Mais opções (⋮) › Dispositivos conectados › Conectar dispositivo.</div>',
    '<button class="btn" onclick="rasFechaQr()">Fechar</button>');
  rasPollQr();
}
function rasPollQr(){
  var id = RAS.qrId; if(!id) return;
  rasApi('GET', '/api/conexoes/' + id + '/qr').then(function(j){
    if(RAS.qrId !== id) return;
    var box = $('rasQrBox'), st = $('rasQrSt'); if(!box) return;
    if(j.estado === 'open'){
      box.innerHTML = '<div style="font-size:54px">✅</div>'; st.innerHTML = '<span class="pill p-on">conectado</span>';
      rasLimpa('conexoes'); RAS.qrId = 0; return;
    }
    if(j.qr && j.qr.base64){ box.innerHTML = '<img alt="QR" src="' + j.qr.base64 + '">'; st.innerHTML = '<span class="pill p-av">aguardando leitura' + (j.qr.count ? ' · tentativa ' + j.qr.count : '') + '</span>'; }
    else if(j.qr && j.qr.erro){ st.innerHTML = '<span class="pill p-cr">' + esc(j.qr.erro) + '</span>'; }
    else { st.innerHTML = '<span class="pill p-off">' + esc((RAS_ESTADO[j.estado] || {}).n || j.estado) + '</span>'; }
    RAS.qrTimer = setTimeout(rasPollQr, 12000);
  }).catch(function(e){ var st = $('rasQrSt'); if(st) st.innerHTML = '<span class="pill p-cr">' + esc(e.message) + '</span>'; RAS.qrTimer = setTimeout(rasPollQr, 15000); });
}
function rasAcaoCx(id, acao){
  var msgs = { sincronizar: 'Sincronizando…', reiniciar: 'Reiniciando a conexão…', sair: 'Desconectando…' };
  toast(msgs[acao] || 'Aguarde…');
  rasApi('POST', '/api/conexoes/' + id + '/' + acao).then(function(j){
    toast(acao === 'sincronizar' ? (j.processadas || 0) + ' mensagens novas processadas' : 'Feito', 'ok');
    rasRecarrega('conexoes'); rasLimpa('leads'); rasLimpa('resumo');
  }).catch(function(e){ toast(e.message, 'err'); });
}
function rasRemoveCx(id, nome){
  modal('Remover conexão', '<div class="note">Isso desconecta o número de <b>' + nome + '</b> e apaga a conexão do servidor. As conversas já rastreadas continuam no histórico de leads.</div>',
    '<button class="btn" onclick="fecha()">Cancelar</button><button class="btn btn-d" onclick="rasApi(\'DELETE\',\'/api/conexoes/' + id + '\').then(function(){fecha();toast(\'Conexão removida\',\'ok\');rasRecarrega(\'conexoes\')}).catch(function(e){toast(e.message,\'err\')})">Remover</button>');
}

/* ================= LINKS RASTREÁVEIS ================= */
function vRasLinks(){
  var c = rasDados('links:' + RAS.cliente, '/api/links?x=1' + rasQsCliente());
  var h = '<div class="hd"><div><h1>Links rastreáveis</h1><p>Links para site, bio e anúncios que abrem o WhatsApp com um código. Quando a mensagem chega, o lead ganha a origem e os parâmetros (UTM, fbclid, gclid) do clique.</p></div>' +
    '<div class="hd-act">' + rasSelCliente() + '<button class="btn btn-p" onclick="rasNovoLink()">+ Novo link</button></div></div>';
  if(!c) return h + rasCarregando();
  if(c.erro) return h + rasErro(c);
  var its = c.dados.itens || [];
  return h + '<div class="tw"><div class="tsc"><table><thead><tr><th>Cliente</th><th>Link</th><th>Endereço</th><th class="tr">Cliques</th><th class="tr">Conversas</th><th>Pixel</th><th></th></tr></thead><tbody>' +
    (its.map(function(k){
      return '<tr class="' + (k.ativo ? '' : 'lk off') + '"><td>' + esc(k.cliente) + '</td><td><div class="nm">' + esc(k.nome) + '</div><div class="sub mono">' + rasFone(k.numero) + '</div></td>' +
        '<td><span class="ras-url">' + esc(k.url) + '</span> <button class="ib" title="Copiar" onclick="navigator.clipboard.writeText(\'' + esc(k.url) + '\').then(function(){toast(\'Link copiado\',\'ok\')})">⧉</button></td>' +
        '<td class="tr mono">' + k.cliques + '</td><td class="tr mono">' + k.conversas + '</td><td class="mono">' + (k.pixel_id ? esc(k.pixel_id) : '<span class="sub">—</span>') + '</td>' +
        '<td class="tr"><label class="sw" title="' + (k.ativo ? 'Ativo' : 'Desligado') + '"><input type="checkbox" ' + (k.ativo ? 'checked' : '') + ' onchange="rasApi(\'PUT\',\'/api/links/' + k.id + '\',{ativo:this.checked}).then(function(){rasRecarrega(\'links\')}).catch(function(e){toast(e.message,\'err\')})"><i></i></label></td></tr>';
    }).join('') || '<tr><td colspan="7"><div class="empty"><b>Nenhum link ainda</b>Crie um link por cliente e use no site, na bio do Instagram ou em anúncios de tráfego para o WhatsApp.</div></td></tr>') + '</tbody></table></div></div>';
}
function rasNovoLink(){
  var cs = rasClientes();
  if(!cs.length) return toast('Cadastre um cliente em Rastreio › Clientes primeiro', 'err');
  modal('Novo link rastreável',
    '<div class="fr fr2"><div class="fg"><label class="fl">Cliente</label><select class="fi" id="ras_lk_cli">' + cs.map(function(c){ return '<option value="' + c.id + '" ' + (String(RAS.cliente) === String(c.id) ? 'selected' : '') + '>' + esc(c.nome) + '</option>'; }).join('') + '</select></div>' +
    '<div class="fg"><label class="fl">Nome do link</label><input class="fi" id="ras_lk_nome" placeholder="Site, Bio Instagram, Anúncio X…"></div></div>' +
    '<div class="fr fr2"><div class="fg"><label class="fl">WhatsApp de destino</label><input class="fi" id="ras_lk_num" placeholder="5548999999999"><div class="hint">DDI + DDD + número, só dígitos. Precisa ser um número conectado no rastreio.</div></div>' +
    '<div class="fg"><label class="fl">Pixel da Meta (opcional)</label><input class="fi" id="ras_lk_px" placeholder="ID do pixel"><div class="hint">Com pixel, o clique dispara PageView e Contact antes de abrir o WhatsApp.</div></div></div>' +
    '<div class="fg"><label class="fl">Mensagem pré-preenchida</label><textarea class="fi" id="ras_lk_msg">Olá! Vim pelo link e quero mais informações. Código: {codigo}</textarea><div class="hint">Mantenha {codigo}: é ele que liga a conversa ao clique.</div></div>',
    '<button class="btn" onclick="fecha()">Cancelar</button><button class="btn btn-p" onclick="rasSalvaLink()">Criar link</button>');
}
function rasSalvaLink(){
  rasApi('POST', '/api/links', { cliente_id: Number($('ras_lk_cli').value), nome: $('ras_lk_nome').value, numero: $('ras_lk_num').value, pixel_id: $('ras_lk_px').value, mensagem: $('ras_lk_msg').value })
    .then(function(j){ fecha(); toast('Link criado', 'ok'); rasRecarrega('links'); })
    .catch(function(e){ toast(e.message, 'err'); });
}

/* ================= CLIENTES E INTEGRAÇÕES (admin) ================= */
function vRasClientes(){
  var c = rasDados('clientes', '/api/clientes');
  var h = '<div class="hd"><div><h1>Clientes do rastreio</h1><p>Cada cliente tem seus números, frases gatilho e integrações de conversão</p></div>' +
    '<div class="hd-act"><button class="btn" onclick="rasRecarrega(\'clientes\')">Atualizar</button><button class="btn btn-p" onclick="rasEditaCliente(0)">+ Novo cliente</button></div></div>';
  if(!c) return h + rasCarregando();
  if(c.erro) return h + rasErro(c);
  var its = c.dados.itens || [];
  return h + '<div class="tw"><div class="tsc"><table><thead><tr><th>Cliente</th><th>Vínculo no 2STEP</th><th>Frases gatilho</th><th>Meta CAPI</th><th class="tr">Conexões</th><th class="tr">Conversas</th><th></th></tr></thead><tbody>' +
    (its.map(function(x){
      var cf = x.config || {}, v = x.cliente_2step && S.clientes[x.cliente_2step];
      return '<tr><td><div class="nm">' + esc(x.nome) + '</div><div class="sub mono">' + esc(x.slug) + '</div></td><td>' + (v ? esc(v.nome) : '<span class="sub">—</span>') + '</td>' +
        '<td>' + (Array.isArray(cf.frases) && cf.frases.length ? cf.frases.map(function(f){ return '<span class="pill p-off">' + esc(f.frase) + '</span> '; }).join('') : '<span class="sub">padrão (#lead, #agendado, #venda, #perdido)</span>') + '</td>' +
        '<td>' + (cf.capi && cf.capi.dataset_id ? '<span class="pill p-on">ligado</span>' : '<span class="pill p-off">não</span>') + '</td>' +
        '<td class="tr mono">' + x.conexoes + '</td><td class="tr mono">' + x.leads + '</td><td class="tr"><button class="btn btn-s" onclick="rasEditaCliente(' + x.id + ')">Editar</button></td></tr>';
    }).join('') || '<tr><td colspan="7"><div class="empty"><b>Nenhum cliente</b>Crie o primeiro para poder conectar um número.</div></td></tr>') + '</tbody></table></div></div>';
}
function rasLinhaFrase(f){
  f = f || { frase: '', tipo: 'etapa', etapa: '' };
  return '<div class="ras-fr"><input class="fi" placeholder="#frase" value="' + esc(f.frase) + '" data-k="frase">' +
    '<select class="fi" data-k="tipo"><option value="etapa" ' + (f.tipo !== 'venda' ? 'selected' : '') + '>Etapa</option><option value="venda" ' + (f.tipo === 'venda' ? 'selected' : '') + '>Venda</option></select>' +
    '<input class="fi" placeholder="nome da etapa (qualificado, agendado…)" value="' + esc(f.etapa || '') + '" data-k="etapa">' +
    '<button class="ib d" onclick="this.parentNode.remove()">×</button></div>';
}
function rasEditaCliente(id){
  var x = id ? rasClientes().filter(function(c){ return c.id === id; })[0] : { id: 0, nome: '', slug: '', cliente_2step: '', config: {} };
  if(!x) return;
  var cf = x.config || {}, capi = cf.capi || {};
  var vinc = '<select class="fi" id="ras_c_vinc"><option value="">— sem vínculo —</option>' + listaClientes().map(function(c){ return '<option value="' + esc(c.id) + '" ' + (x.cliente_2step === c.id ? 'selected' : '') + '>' + esc(c.nome) + '</option>'; }).join('') + '</select>';
  var corpo = '<div class="fr fr2"><div class="fg"><label class="fl">Nome</label><input class="fi" id="ras_c_nome" value="' + esc(x.nome) + '"></div><div class="fg"><label class="fl">Cliente no 2STEP</label>' + vinc + '</div></div>' +
    '<div class="fg"><label class="fl">Frases gatilho (digitadas pelo atendente na conversa)</label><div id="ras_frases">' + ((Array.isArray(cf.frases) && cf.frases.length ? cf.frases : []).map(rasLinhaFrase).join('')) + '</div>' +
    '<button class="btn btn-s" onclick="$(\'ras_frases\').insertAdjacentHTML(\'beforeend\', rasLinhaFrase())">+ frase</button><div class="hint">Vazio usa o padrão: #lead → qualificado, #agendado → agendado, #venda → venda (com valor, ex.: "#venda 1500"), #perdido → perdido.</div></div>';
  if(id){
    corpo += '<div class="fg"><label class="fl">Meta · Conversions API</label><div class="fr fr2">' +
      '<div><input class="fi" id="ras_c_ds" placeholder="ID do dataset / pixel" value="' + esc(capi.dataset_id || '') + '"></div>' +
      '<div><input class="fi" id="ras_c_tk" placeholder="Token de acesso' + (capi.token ? ' (salvo: ' + esc(capi.token) + ')' : '') + '"></div></div>' +
      '<div class="fr fr3 mt12"><div><input class="fi" id="ras_c_el" placeholder="Evento ao criar lead" value="' + esc(capi.evento_lead || 'Lead') + '"></div>' +
      '<div><input class="fi" id="ras_c_ev" placeholder="Evento de venda" value="' + esc(capi.evento_venda || 'Purchase') + '"></div>' +
      '<div><input class="fi" id="ras_c_tc" placeholder="Código de teste (opcional)" value="' + esc(capi.test_code || '') + '"></div></div>' +
      '<div class="hint">Eventos de anúncio Click-to-WhatsApp vão pelo canal de mensagens com o identificador do clique. Deixe o token em branco para manter o atual.</div></div>' +
      '<div class="fg"><label class="fl">Acesso do cliente (e-mails que veem só esta conta)</label><div id="ras_c_us" class="sub">carregando…</div><div class="fr" style="grid-template-columns:1fr auto;margin-top:6px"><input class="fi" id="ras_c_mail" placeholder="email@cliente.com"><button class="btn btn-s" onclick="rasAddUsuario(' + id + ')">Liberar</button></div></div>';
  }
  modal(id ? 'Editar cliente do rastreio' : 'Novo cliente do rastreio', corpo,
    '<button class="btn" onclick="fecha()">Cancelar</button><button class="btn btn-p" onclick="rasSalvaCliente(' + id + ')">Salvar</button>', true);
  if(id) rasListaUsuarios(id);
}
function rasListaUsuarios(id){
  rasApi('GET', '/api/clientes/' + id + '/usuarios').then(function(j){
    var el = $('ras_c_us'); if(!el) return;
    el.innerHTML = (j.itens || []).map(function(u){ return '<span class="pill p-vl" style="margin:0 6px 6px 0">' + esc(u.email) + ' <a style="cursor:pointer;margin-left:4px" onclick="rasApi(\'DELETE\',\'/api/clientes/' + id + '/usuarios/' + encodeURIComponent(u.email) + '\').then(function(){rasListaUsuarios(' + id + ')})">×</a></span>'; }).join('') || 'ninguém liberado ainda';
  }).catch(function(e){ var el = $('ras_c_us'); if(el) el.textContent = e.message; });
}
function rasAddUsuario(id){
  var mail = $('ras_c_mail').value.trim(); if(!mail) return;
  rasApi('POST', '/api/clientes/' + id + '/usuarios', { email: mail }).then(function(){ $('ras_c_mail').value = ''; rasListaUsuarios(id); toast('Acesso liberado', 'ok'); }).catch(function(e){ toast(e.message, 'err'); });
}
function rasSalvaCliente(id){
  var frases = [];
  document.querySelectorAll('#ras_frases .ras-fr').forEach(function(row){
    var o = {}; row.querySelectorAll('[data-k]').forEach(function(i){ o[i.getAttribute('data-k')] = i.value.trim(); });
    if(o.frase) frases.push({ frase: o.frase, tipo: o.tipo, etapa: o.etapa || (o.tipo === 'venda' ? 'venda' : 'qualificado') });
  });
  var corpo = { nome: $('ras_c_nome').value.trim(), cliente_2step: $('ras_c_vinc').value || null, config: { frases: frases } };
  if(id){
    corpo.config.capi = { dataset_id: $('ras_c_ds').value.trim(), token: $('ras_c_tk').value.trim(), evento_lead: $('ras_c_el').value.trim() || 'Lead', evento_venda: $('ras_c_ev').value.trim() || 'Purchase', test_code: $('ras_c_tc').value.trim() || null };
  }
  var p = id ? rasApi('PUT', '/api/clientes/' + id, corpo) : rasApi('POST', '/api/clientes', corpo);
  p.then(function(){ fecha(); toast('Cliente salvo', 'ok'); rasRecarrega('clientes'); rasLimpa('conexoes'); })
   .catch(function(e){ toast(e.message, 'err'); });
}

/* ================= REGISTRO DO MÓDULO ================= */
(function(){
  var m = { id: 'ras', nome: 'Rastreio', sigla: 'R', cor: '#22D3EE', papeis: ['admin', 'operacao'], telas: [
    { v: 'ras_painel',   n: 'Painel',            f: function(){ return vRasPainel(); } },
    { v: 'ras_leads',    n: 'Conversas',         f: function(){ return vRasLeads(); } },
    { v: 'ras_conexoes', n: 'Conexões',          f: function(){ return vRasConexoes(); } },
    { v: 'ras_links',    n: 'Links rastreáveis', f: function(){ return vRasLinks(); } }
  ]};
  var i = -1;
  MODULOS.forEach(function(x, k){ if(x.id === 'sis') i = k; });
  if(i > -1) MODULOS.splice(i, 0, m); else MODULOS.push(m);
  /* tela de clientes/integrações só para admin: vai no módulo Sistema */
  var sis = MODULOS.filter(function(x){ return x.id === 'sis'; })[0];
  if(sis) sis.telas.push({ v: 'ras_clientes', n: 'Rastreio: clientes', f: function(){ return vRasClientes(); } });
})();
