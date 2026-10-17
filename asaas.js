/* ============================================================
   2STEP · INTEGRAÇÃO ASAAS (tela)
   Módulo à parte: entra no menu em Sistema › Integração Asaas.
   Depende de app.js (S, DB, AUTH, MEM, MODULOS, ouve, save, del,
   render, esc, brl, dLabel, ymLabelL, toast, listaClientes, hoje).
   Dados novos ficam só em 2step_financeiro/asaas:
     vinculos/{clienteAsaas} -> { clienteId, nomeAsaas, vinculadoEm }
     eventos/{pagamentoAsaas} -> registro de cada pagamento recebido
   A baixa em si é feita no servidor (api/asaas-webhook.js).
   ============================================================ */

var ASA = {
  vinculos: {}, eventos: {}, ligado: false,
  clientesAsaas: null,  // lista vinda da API, quando carregada
  status: null, statusErro: '', statusPedido: false,
  ocupado: '',          // 'clientes' | 'sinc'
  ultimoResumo: null
};

var ASA_RES = {
  'baixado':             { t:'Baixa feita',         c:'p-on' },
  'ja-pago':             { t:'Já estava pago',      c:'p-off' },
  'sem-vinculo':         { t:'Sem vínculo',         c:'p-cr' },
  'cliente-inexistente': { t:'Cliente apagado',     c:'p-cr' },
  'sem-vencimento':      { t:'Sem vencimento',      c:'p-av' }
};

/* ---------- dados ---------- */
function asaLiga(){
  if(ASA.ligado || MEM || !DB || !euSouAdmin()) return;
  ASA.ligado = true;
  ouve('asaas/vinculos', function(v){ ASA.vinculos = v; });
  ouve('asaas/eventos',  function(v){ ASA.eventos  = v; });
}
function asaEventos(){
  return Object.keys(ASA.eventos).map(function(k){ return ASA.eventos[k]; })
    .sort(function(a, b){ return String(b.atualizadoEm || '').localeCompare(String(a.atualizadoEm || '')); });
}
function asaPendentes(){
  return asaEventos().filter(function(e){ return e.resultado === 'sem-vinculo' && !(ASA.vinculos[e.customer] || {}).clienteId; });
}
function asaBadge(){ asaLiga(); return asaPendentes().length; }

function asaNomeAsaas(cid){
  var l = ASA.clientesAsaas || [];
  for(var i = 0; i < l.length; i++) if(l[i].id === cid) return l[i].nome;
  return (ASA.vinculos[cid] || {}).nomeAsaas || cid;
}
function asaNorm(s){
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}
/* sugere um cliente 2STEP pelo nome. Só sugere: quem decide é você. */
function asaSugestao(nomeAsaas){
  var a = asaNorm(nomeAsaas);
  if(a.length < 4) return null;
  var cs = listaClientes();
  for(var i = 0; i < cs.length; i++){
    var b = asaNorm(cs[i].nome);
    if(b.length >= 4 && (a === b || a.indexOf(b) > -1 || b.indexOf(a) > -1)) return cs[i];
  }
  return null;
}

/* ---------- chamadas ao servidor ---------- */
function asaApi(acao, metodo, extra){
  if(!AUTH || !AUTH.currentUser) return Promise.reject(new Error('Faça login de novo'));
  return AUTH.currentUser.getIdToken().then(function(tk){
    return fetch('/api/asaas?acao=' + acao + (extra || ''), { method: metodo || 'GET', headers: { Authorization: 'Bearer ' + tk } });
  }).then(function(r){
    return r.json().catch(function(){
      throw new Error(r.status === 404 ? 'As funções do servidor (/api) ainda não estão publicadas na Vercel' : 'Resposta inválida do servidor (' + r.status + ')');
    }).then(function(j){
      if(!j.ok){ var e = new Error(j.erro || 'Erro no servidor'); e.status = j.status; throw e; }
      return j;
    });
  });
}
function asaStatus(){
  ASA.statusPedido = true;
  asaApi('status').then(function(j){ ASA.status = j.status; ASA.statusErro = ''; render(); },
    function(e){ ASA.status = e.status || null; ASA.statusErro = e.message; render(); });
}
function asaCarregaClientes(){
  ASA.ocupado = 'clientes'; render();
  asaApi('clientes').then(function(j){
    ASA.clientesAsaas = j.clientes.sort(function(a, b){ return a.nome.localeCompare(b.nome, 'pt-BR'); });
    ASA.ocupado = ''; render();
    toast(j.clientes.length + ' clientes carregados do Asaas', 'ok');
  }, function(e){ ASA.ocupado = ''; render(); toast(e.message, 'err'); });
}
function asaSincroniza(){
  if(ASA.ocupado) return;
  ASA.ocupado = 'sinc'; render();
  asaApi('sincronizar', 'POST', '&dias=40').then(function(j){
    ASA.ocupado = ''; ASA.ultimoResumo = j.resumo; render();
    toast(j.resumo.baixado ? j.resumo.baixado + ' mensalidade(s) baixada(s)' : 'Nada novo para baixar', 'ok');
  }, function(e){ ASA.ocupado = ''; render(); toast(e.message, 'err'); });
}

/* ---------- vínculos ---------- */
function asaVincular(cid, clienteId, sincronizar){
  if(!clienteId){
    delete ASA.vinculos[cid];
    del('asaas/vinculos/' + cid);
    render(); toast('Vínculo removido');
    return;
  }
  var v = { clienteId: clienteId, nomeAsaas: asaNomeAsaas(cid), vinculadoEm: hoje() };
  ASA.vinculos[cid] = v;
  save('asaas/vinculos/' + cid, v);
  render();
  toast('Vinculado a ' + ((S.clientes[clienteId] || {}).nome || 'cliente'), 'ok');
  if(sincronizar) setTimeout(asaSincroniza, 400);
}
function asaSelectCliente(cid, atual, sincronizar){
  var cs = listaClientes().slice().sort(function(a, b){ return String(a.nome).localeCompare(String(b.nome), 'pt-BR'); });
  return '<select class="fi" style="min-width:200px;padding:7px 10px" onchange="asaVincular(\'' + esc(cid) + '\', this.value' + (sincronizar ? ', 1' : '') + ')">' +
    '<option value="">— sem vínculo —</option>' +
    cs.map(function(c){
      var st = c.status === 'encerrado' ? ' (encerrado)' : (c.status === 'aviso' ? ' (em aviso)' : '');
      return '<option value="' + esc(c.id) + '" ' + (c.id === atual ? 'selected' : '') + '>' + esc(c.nome) + st + '</option>';
    }).join('') + '</select>';
}
function asaCopiaUrl(){
  var u = location.origin + '/api/asaas-webhook';
  if(navigator.clipboard && navigator.clipboard.writeText)
    navigator.clipboard.writeText(u).then(function(){ toast('Endereço copiado', 'ok'); }, function(){ toast('Não consegui copiar', 'err'); });
  else toast('Seu navegador não permite copiar aqui', 'err');
}

/* ---------- tela ---------- */
function vAsaas(){
  var hd = '<div class="hd"><div><h1>Integração Asaas</h1><p>Quando o cliente paga no Asaas, a mensalidade dele é marcada como recebida aqui sozinha</p></div>' +
    '<div class="hd-act">' + (MEM ? '' : '<button class="btn btn-p" onclick="asaSincroniza()" ' + (ASA.ocupado ? 'disabled style="opacity:.6"' : '') + '>' +
    (ASA.ocupado === 'sinc' ? 'Sincronizando...' : 'Sincronizar agora') + '</button>') + '</div></div>';

  if(MEM) return hd + '<div class="note">A integração só funciona com o Firebase ligado.</div>';

  asaLiga();
  if(!ASA.statusPedido) asaStatus();

  return hd + asaResumo() + '<div class="grid g2 mb12">' + asaCardConfig() + asaCardComo() + '</div>' + asaCardVinculos() + asaCardEventos();
}

function asaResumo(){
  var r = ASA.ultimoResumo;
  if(!r) return '';
  return '<div class="note" style="background:var(--mint-dim);border-color:rgba(52,211,153,.3);color:var(--mint)">' +
    'Sincronização de ' + dLabel(r.de) + ' a ' + dLabel(r.ate) + ': ' + r.total + ' pagamento(s) encontrados no Asaas · ' +
    r.baixado + ' baixado(s) agora · ' + r['ja-pago'] + ' já estavam pagos · ' + r['sem-vinculo'] + ' sem vínculo.</div>';
}

function asaCardConfig(){
  var s = ASA.status;
  function linha(ok, nome, dica){
    return '<div class="flx" style="padding:7px 0;align-items:flex-start;flex-wrap:nowrap">' +
      '<span class="pill ' + (ok ? 'p-on' : 'p-cr') + '" style="min-width:58px;justify-content:center">' + (ok ? 'ok' : 'falta') + '</span>' +
      '<span style="font-size:13px"><b>' + nome + '</b>' + (ok ? '' : '<div class="hint" style="margin-top:2px">' + dica + '</div>') + '</span></div>';
  }
  var corpo;
  if(!s && !ASA.statusErro) corpo = '<div style="color:var(--mute);font-size:13px">Verificando o servidor...</div>';
  else if(!s) corpo = '<div class="note" style="margin:0">' + esc(ASA.statusErro) + '</div>';
  else corpo =
    (ASA.statusErro ? '<div class="note">' + esc(ASA.statusErro) + '</div>' : '') +
    linha(s.firebase, 'Conta de serviço do Firebase', 'Variável FIREBASE_SERVICE_ACCOUNT na Vercel.') +
    linha(s.apiKey, 'Chave da API do Asaas', 'Variável ASAAS_API_KEY na Vercel.') +
    linha(s.webhookToken, 'Token do webhook', 'Variável ASAAS_WEBHOOK_TOKEN na Vercel, igual ao token do webhook no Asaas.') +
    '<div class="hint mt12">Ambiente: <b style="color:var(--ink)">' + (s.ambiente === 'sandbox' ? 'Sandbox (teste)' : 'Produção') + '</b></div>';

  return '<div class="tw"><div class="tw-hd"><div class="tw-t">Configuração</div>' +
    '<button class="btn btn-s" onclick="asaStatus()">Verificar de novo</button></div><div style="padding:16px">' + corpo +
    '<div class="fl mt18">Endereço do webhook</div>' +
    '<div class="flx" style="flex-wrap:nowrap"><input class="fi mono" style="font-size:12px" readonly value="' + esc(location.origin + '/api/asaas-webhook') + '" onclick="this.select()">' +
    '<button class="btn btn-s" onclick="asaCopiaUrl()">Copiar</button></div></div></div>';
}

function asaCardComo(){
  return '<div class="tw"><div class="tw-hd"><div class="tw-t">Como funciona</div></div><div style="padding:16px;font-size:13px;line-height:1.65;color:var(--mute)">' +
    '<b style="color:var(--ink)">1.</b> Vincule cada cliente do Asaas ao cliente correspondente daqui (quadro abaixo).<br>' +
    '<b style="color:var(--ink)">2.</b> Quando o pagamento é confirmado, o Asaas avisa o app e a mensalidade do <b style="color:var(--ink)">mês do vencimento</b> da cobrança é marcada como recebida, com a data do pagamento.<br>' +
    '<b style="color:var(--ink)">3.</b> Se algum aviso se perder, <b style="color:var(--ink)">Sincronizar agora</b> confere os pagamentos dos últimos 40 dias.<br>' +
    '<div class="hint mt12">A integração só marca como recebido. Nunca desmarca, nunca apaga, e não mexe em mensalidade que você já tenha marcado à mão. Você continua podendo marcar ou desmarcar no Fechamento.</div>' +
    '</div></div>';
}

function asaCardVinculos(){
  var vk = Object.keys(ASA.vinculos);
  var lista = ASA.clientesAsaas;
  var linhas;

  if(lista){
    linhas = lista.map(function(c){
      var v = ASA.vinculos[c.id] || {};
      var sug = !v.clienteId ? asaSugestao(c.nome) : null;
      return '<tr><td><div class="nm">' + esc(c.nome || 'Sem nome') + '</div><div class="sub mono">' + esc(c.doc || c.email || c.id) + '</div></td>' +
        '<td>' + asaSelectCliente(c.id, v.clienteId) +
          (sug ? '<div class="sub" style="margin-top:5px">Parece ser <b style="color:var(--ink)">' + esc(sug.nome) + '</b> · ' +
            '<button class="btn btn-s" style="padding:2px 8px" onclick="asaVincular(\'' + esc(c.id) + '\',\'' + esc(sug.id) + '\')">Vincular</button></div>' : '') +
        '</td><td class="tc">' + (v.clienteId ? '<span class="pill p-on">vinculado</span>' : '<span class="pill p-off">—</span>') + '</td></tr>';
    }).join('');
  }else{
    linhas = vk.map(function(cid){
      var v = ASA.vinculos[cid];
      return '<tr><td><div class="nm">' + esc(v.nomeAsaas || cid) + '</div><div class="sub mono">' + esc(cid) + '</div></td>' +
        '<td>' + asaSelectCliente(cid, v.clienteId) + '</td><td class="tc"><span class="pill p-on">vinculado</span></td></tr>';
    }).join('');
  }

  var sem = lista ? lista.filter(function(c){ return !(ASA.vinculos[c.id] || {}).clienteId; }).length : 0;

  return '<div class="tw mb12"><div class="tw-hd"><div class="tw-t">Vínculos · cliente do Asaas → cliente 2STEP</div>' +
    '<div class="flx">' + (lista ? '<span style="font-size:11.5px;color:var(--mute)">' + (lista.length - sem) + ' de ' + lista.length + ' vinculados</span>' : '') +
    '<button class="btn btn-s" onclick="asaCarregaClientes()" ' + (ASA.ocupado ? 'disabled style="opacity:.6"' : '') + '>' +
    (ASA.ocupado === 'clientes' ? 'Carregando...' : (lista ? 'Recarregar do Asaas' : 'Carregar clientes do Asaas')) + '</button></div></div>' +
    (linhas ? '<div class="tsc"><table><thead><tr><th>Cliente no Asaas</th><th>Cliente 2STEP</th><th class="tc">Situação</th></tr></thead><tbody>' + linhas + '</tbody></table></div>'
      : '<div class="empty"><b>Nenhum vínculo ainda</b>Clique em <b style="display:inline;font-size:13px">Carregar clientes do Asaas</b> para ver a lista e ligar cada um ao cliente daqui.</div>') +
    '</div>';
}

function asaCardEventos(){
  var ev = asaEventos().slice(0, 40);
  var pend = asaPendentes();
  var linhas = ev.map(function(e){
    var r = ASA_RES[e.resultado] || { t: e.resultado, c: 'p-off' };
    var cli = e.clienteId && S.clientes[e.clienteId] ? S.clientes[e.clienteId].nome : '';
    var semV = e.resultado === 'sem-vinculo' && !(ASA.vinculos[e.customer] || {}).clienteId;
    return '<tr><td class="mono" style="font-size:12.5px">' + dLabel(e.pagoEm) + '</td>' +
      '<td><div class="nm">' + esc(asaNomeAsaas(e.customer)) + '</div><div class="sub">' + esc(e.forma || '') + (e.descricao ? ' · ' + esc(e.descricao) : '') + '</div></td>' +
      '<td>' + (semV ? asaSelectCliente(e.customer, '', true) : (cli ? esc(cli) + (e.ym ? '<div class="sub">mensalidade de ' + ymLabelL(e.ym) + '</div>' : '') : '<span style="color:var(--mute)">—</span>')) + '</td>' +
      '<td class="tr mono nm">' + brl(e.valor) + '</td>' +
      '<td class="tc"><span class="pill ' + r.c + '">' + r.t + '</span></td></tr>';
  }).join('');

  return '<div class="tw"><div class="tw-hd"><div class="tw-t">Pagamentos recebidos do Asaas</div>' +
    (pend.length ? '<span class="pill p-cr">' + pend.length + ' sem vínculo</span>' : '') + '</div>' +
    (pend.length ? '<div class="note" style="margin:14px 16px 0">Há pagamento(s) de cliente(s) do Asaas sem vínculo. Escolha o cliente na linha: o vínculo é salvo e a baixa sai em seguida.</div>' : '') +
    (linhas ? '<div class="tsc"><table><thead><tr><th>Pago em</th><th>Cliente no Asaas</th><th>Cliente 2STEP</th><th class="tr">Valor</th><th class="tc">Resultado</th></tr></thead><tbody>' + linhas + '</tbody></table></div>'
      : '<div class="empty"><b>Nenhum pagamento recebido ainda</b>Assim que o Asaas avisar o primeiro pagamento, ele aparece aqui.</div>') +
    '</div>';
}

/* ---------- registro no menu: Sistema › Integração Asaas ---------- */
(function(){
  var sis = MODULOS.filter(function(m){ return m.id === 'sis'; })[0];
  if(sis) sis.telas.push({ v:'asaas', n:'Integração Asaas', f:function(){ return vAsaas(); }, badge:function(){ return asaBadge(); } });
})();
