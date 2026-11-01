/* ============================================================
   2STEP · HOME
   Primeira tela ao abrir o app: as tarefas de hoje (social media e
   tráfego) e as contas de anúncio com saldo abaixo do mínimo.
   Para admin e operação. Não mostra nada do financeiro.
   Depende de app.js (S, EMAIL, VIEW, MOD_ABERTO, MODULOS, go, esc,
   kpi, toast, chaveEmail), de tarefas.js (TAR, tarLiga, tarDoDia,
   tarMarca, tarHoje, tarDiaLabel) e de saldo.js (SAL, salLiga,
   salContas, salSit, salCard, salHa).
   Não grava dados próprios: usa os das telas de Tarefas e Saldo Ads.
   ============================================================ */

/* estilos só deste módulo */
(function(){
  var css = '' +
  '.hm-l{max-height:460px;overflow-y:auto}' +
  '.hm-f{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 16px;border-top:1px solid var(--line);flex-wrap:wrap}';
  var s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
})();

function homeNome(){
  var u = (S.usuarios || {})[chaveEmail(EMAIL)] || {};
  var n = String(u.nome || String(EMAIL || '').split('@')[0] || '').trim().split(' ')[0];
  return n ? n.charAt(0).toUpperCase() + n.slice(1) : '';
}
function homeSaudacao(){
  var h = Number(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false })) % 24;
  return h < 12 ? 'Bom dia' : (h < 18 ? 'Boa tarde' : 'Boa noite');
}

/* marca a tarefa no quadro certo (tarMarca usa o quadro aberto em TAR.q) */
function homeMarca(q, data, chave, feito){
  TAR.q = q;
  tarMarca(data, chave, feito);
}

/* ---------- tela ---------- */
function vHome(){
  var hoje = tarHoje();
  tarLiga('social'); tarLiga('trafego'); salLiga();

  var soc = tarDoDia(hoje, 'social'), trf = tarDoDia(hoje, 'trafego');
  var feitas = function(ts){ return ts.filter(function(t){ return t.feita; }).length; };
  var baixas = salContas().filter(function(c){ return c.ativo !== false && salSit(c) === 'baixo'; });
  var erros = salContas().filter(function(c){ return c.ativo !== false && salSit(c) === 'erro'; });
  var uv = (SAL.d || {}).ultimaVerificacao;
  var tot = soc.length + trf.length, fe = feitas(soc) + feitas(trf);
  var nome = homeNome();

  return '' +
  '<div class="hd"><div><h1>' + homeSaudacao() + (nome ? ', ' + esc(nome) : '') + '</h1>' +
    '<p>' + esc(tarDiaLabel(hoje).charAt(0).toUpperCase() + tarDiaLabel(hoje).slice(1)) + ' · o que precisa de atenção hoje</p></div></div>' +

  '<div class="grid g4 mb12">' +
    kpi('Tarefas de hoje', fe + ' de ' + tot, tot ? (tot - fe ? (tot - fe) + ' pendente(s)' : 'Tudo concluído') : 'Nenhuma tarefa hoje', tot && fe === tot ? 'pos' : (tot ? 'warn' : '')) +
    kpi('Social media', feitas(soc) + ' de ' + soc.length, 'Tarefas feitas hoje', soc.length && feitas(soc) === soc.length ? 'pos' : '') +
    kpi('Tráfego', feitas(trf) + ' de ' + trf.length, 'Tarefas feitas hoje', trf.length && feitas(trf) === trf.length ? 'pos' : '') +
    kpi('Saldo abaixo do mínimo', String(baixas.length), baixas.length ? 'Conta(s) precisando de recarga' : 'Todas as contas acima do mínimo', baixas.length ? 'neg' : 'pos') +
  '</div>' +

  '<div class="grid g2 mb12">' +
    homeTarefas('social', 'Tarefas de social media', soc, hoje, 'tarefas') +
    homeTarefas('trafego', 'Tarefas de tráfego', trf, hoje, 'trafego') +
  '</div>' +

  homeSaldo(baixas, erros, uv);
}

function homeTarefas(q, titulo, ts, hoje, tela){
  var fe = ts.filter(function(t){ return t.feita; }).length;
  var pct = ts.length ? Math.round(fe / ts.length * 100) : 0;
  var grupos = {}, ordem = [];
  ts.forEach(function(t){ if(!grupos[t.clienteId]){ grupos[t.clienteId] = []; ordem.push(t.clienteId); } grupos[t.clienteId].push(t); });

  var lista = ordem.map(function(cid){
    return '<div class="tar-cli">' + esc(grupos[cid][0].cliente) + '</div>' + grupos[cid].map(function(t){
      var hora = t.feita ? new Date(t.feita.em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
      return '<div class="tar-t' + (t.feita ? ' ok' : '') + '">' +
        '<button class="tar-ck" aria-label="' + (t.feita ? 'Desmarcar' : 'Marcar como feita') + '" onclick="homeMarca(\'' + q + '\',\'' + hoje + '\',\'' + esc(t.chave) + '\',' + (t.feita ? 'false' : 'true') + ')">✓</button>' +
        '<div style="min-width:0"><div><span class="tar-tt">' + esc(t.titulo) + '</span>' +
          (q === 'social' ? '<span class="tar-tag ' + (t.fixa ? 'f">fixa' : 'a">avulsa') + '</span>' : '') + '</div>' +
          (t.feita ? '<div class="sub">feita às ' + hora + (t.feita.por ? ' · ' + esc(String(t.feita.por).split('@')[0]) : '') + '</div>' : '') + '</div></div>';
    }).join('');
  }).join('');

  return '<div class="tw"><div class="tw-hd"><div class="tw-t">' + titulo + '</div>' +
      '<span class="pill ' + (!ts.length ? 'p-off' : (fe === ts.length ? 'p-on' : 'p-av')) + '">' + fe + ' de ' + ts.length + ' feitas</span></div>' +
    (ts.length ? '<div style="padding:10px 16px 2px"><div class="bar"><i style="width:' + pct + '%;background:var(--mint)"></i></div></div><div class="hm-l">' + lista + '</div>'
               : '<div class="empty"><b>Nenhuma tarefa hoje</b>As tarefas do dia aparecem aqui.</div>') +
    '<div class="hm-f"><span class="sub" style="margin:0">' + (ts.length && fe === ts.length ? '🎉 Tudo concluído' : (ts.length ? (ts.length - fe) + ' pendente(s)' : '')) + '</span>' +
      '<button class="btn btn-s" onclick="go(\'' + tela + '\')">Abrir ' + (q === 'social' ? 'social media' : 'tráfego') + ' →</button></div>' +
    '</div>';
}

function homeSaldo(baixas, erros, uv){
  return '<div class="tw"><div class="tw-hd"><div class="tw-t">Saldo abaixo do mínimo</div>' +
      (baixas.length ? '<span class="pill p-cr">' + baixas.length + '</span>' : '<span class="pill p-on">tudo certo</span>') + '</div>' +
    (baixas.length ? '<div class="pg" style="padding:12px">' + baixas.map(salCard).join('') + '</div>'
      : '<div class="empty"><b>Nenhuma conta abaixo do mínimo</b>Quando um saldo baixar do mínimo configurado, a conta aparece aqui.</div>') +
    (erros.length ? '<div class="note" style="margin:0 12px 12px">' + erros.length + ' conta(s) com erro na leitura do saldo: ' +
      erros.map(function(c){ return esc((S.clientes[c.clienteId] || {}).nome || c.nome || c.id); }).join(', ') + '. O saldo delas pode estar baixo sem aparecer aqui.</div>' : '') +
    '<div class="hm-f"><span class="sub" style="margin:0">' + (uv ? 'Última verificação ' + salHa(uv.em) : 'Nenhuma verificação ainda') + '</span>' +
      '<button class="btn btn-s" onclick="go(\'saldo\')">Abrir Saldo Ads →</button></div>' +
    '</div>';
}

/* ---------- registro no menu: primeiro módulo, e tela inicial do app ---------- */
(function(){
  MODULOS.unshift({ id:'ini', nome:'Início', sigla:'I', cor:'#22D3EE', papeis:['admin','operacao'], telas:[
    { v:'home', n:'Home', f:function(){ return vHome(); } }
  ]});
  /* só troca a tela padrão; a volta do login do Facebook/Google continua abrindo em Saldo Ads */
  if(VIEW === 'dash'){ VIEW = 'home'; MOD_ABERTO = 'ini'; }
})();
