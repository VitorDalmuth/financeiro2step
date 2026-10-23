/* ============================================================
   2STEP · GOOGLE ADS (tela)
   Card de conexão com o Google (login da MCC) dentro de
   Operacional › Saldo Meta, só para administradores: lista as
   contas de anúncio e investiga onde a API guarda o saldo pré-pago.
   Depende de app.js (AUTH, MEM, VIEW, MOD_ABERTO, render, modal,
   fecha, esc, brl, dLabel, toast, euSouAdmin, $) e de saldo.js
   (salCopia, SAL_NOTA_RUIM), que chama gglCard().
   O servidor é api/google-ads.js.
   ============================================================ */

var GGL_ST = { ENABLED: 'ativa', CANCELED: 'cancelada', SUSPENDED: 'suspensa', CLOSED: 'encerrada' };
var GGL = { status: null, conexao: null, statusErro: '', statusPedido: false, contas: null, ocupado: '', retorno: null, ultimo: null };

/* volta do login Google (api/google-retorno.js manda para /?google=ok ou /?google=erro&msg=...) */
(function(){
  var p = new URLSearchParams(location.search), r = p.get('google');
  if(!r) return;
  GGL.retorno = { ok: r === 'ok', msg: p.get('msg') || '' };
  VIEW = 'saldo'; MOD_ABERTO = 'mid';
  history.replaceState(null, '', location.pathname + location.hash);
})();

/* ---------- chamadas ao servidor ---------- */
function gglApi(acao, metodo, extra){
  if(MEM) return Promise.reject(new Error('Só funciona com o Firebase ligado'));
  if(!AUTH || !AUTH.currentUser) return Promise.reject(new Error('Faça login de novo'));
  return AUTH.currentUser.getIdToken().then(function(tk){
    return fetch('/api/google-ads?acao=' + acao + (extra || ''), { method: metodo || 'GET', headers: { Authorization: 'Bearer ' + tk } });
  }).then(function(r){
    return r.json().catch(function(){
      throw new Error(r.status === 404 ? 'A função do Google (/api/google-ads) ainda não está publicada na Vercel' : 'Resposta inválida do servidor (' + r.status + ')');
    }).then(function(j){
      if(!j.ok){ var e = new Error(j.erro || 'Erro no servidor'); e.status = j.status; throw e; }
      return j;
    });
  });
}
function gglStatus(){
  GGL.statusPedido = true;
  gglApi('status').then(function(j){ GGL.status = j.status; GGL.conexao = j.conexao; GGL.statusErro = ''; render(); },
    function(e){ GGL.status = e.status || null; GGL.statusErro = e.message; render(); });
}
function gglConectar(){
  if(GGL.ocupado) return;
  if(MEM) return toast('Na demonstração não dá para conectar: precisa do Firebase', 'err');
  GGL.ocupado = 'conectar'; render();
  gglApi('conectar', 'POST').then(function(j){ location.href = j.url; },
    function(e){ GGL.ocupado = ''; render(); toast(e.message, 'err'); });
}
function gglDesconectar(){
  if(!confirm('Desconectar o Google?')) return;
  gglApi('desconectar', 'POST').then(function(){ GGL.conexao = null; GGL.contas = null; render(); toast('Google desconectado'); },
    function(e){ toast(e.message, 'err'); });
}
function gglBuscaContas(){
  if(GGL.ocupado) return;
  GGL.ocupado = 'contas'; render();
  gglApi('contas').then(function(j){ GGL.contas = j.contas; GGL.ocupado = ''; render(); toast(j.contas.length + ' conta(s) do Google Ads encontrada(s)', 'ok'); },
    function(e){ GGL.ocupado = ''; render(); toast(e.message, 'err'); });
}
function gglInvestiga(cid, gerente){
  if(GGL.ocupado) return;
  GGL.ocupado = 'inv:' + cid; render();
  gglApi('investigar', 'GET', '&cid=' + encodeURIComponent(cid) + '&gerente=' + encodeURIComponent(gerente || '')).then(function(j){
    GGL.ocupado = ''; GGL.ultimo = j.resultado; render(); mGglResultado();
  }, function(e){ GGL.ocupado = ''; render(); toast(e.message, 'err'); });
}

/* ---------- resultado da investigação ---------- */
/* achata o JSON da API em linhas "campo: valor"; valores em micros ganham o R$ ao lado */
function gglAchata(o, pre, out){
  out = out || [];
  Object.keys(o || {}).forEach(function(k){
    var v = o[k], nome = pre ? pre + '.' + k : k;
    if(v && typeof v === 'object' && !Array.isArray(v)) gglAchata(v, nome, out);
    else out.push([nome, Array.isArray(v) ? JSON.stringify(v) : String(v)]);
  });
  return out;
}
function gglNomeConta(cid){
  var c = (GGL.contas || []).filter(function(x){ return x.id === cid; })[0];
  return c ? c.nome : cid;
}
function mGglResultado(){
  var r = GGL.ultimo;
  if(!r) return;
  var cand = r.candidatos.length ? '<div class="note" style="background:var(--mint-dim);border-color:rgba(52,211,153,.3);color:var(--mint)"><b>Cálculos possíveis do saldo:</b><br>' +
    r.candidatos.map(function(c){ return esc(c.como) + ': <b class="mono">' + brl(c.valor) + '</b>'; }).join('<br>') + '</div>'
    : '<div class="note">Nenhum orçamento da conta encontrado para calcular o saldo. Confira as seções abaixo.</div>';
  var blocos = r.consultas.map(function(q){
    var corpo;
    if(!q.ok) corpo = '<div class="sub neg" style="white-space:pre-wrap">' + esc(q.erro) + '</div>';
    else if(!q.linhas.length) corpo = '<div class="sub">Nenhum registro</div>';
    else corpo = q.linhas.map(function(l, i){
      return (q.linhas.length > 1 ? '<div class="sub" style="margin-top:6px;color:var(--ink)">Registro ' + (i + 1) + '</div>' : '') +
        gglAchata(l).map(function(c){
          var rs = /Micros$/.test(c[0]) && /^-?\d+$/.test(c[1]) ? ' <span style="color:var(--mint)">(' + brl(Number(c[1]) / 1e6) + ')</span>' : '';
          return '<div class="mono" style="font-size:11.5px;word-break:break-all"><span style="color:var(--mute)">' + esc(c[0]) + ':</span> ' + esc(c[1]) + rs + '</div>';
        }).join('');
    }).join('');
    return '<div class="cal-post"><div class="flx sp mb12"><b>' + esc(q.titulo) + '</b><span class="pill ' + (q.ok ? 'p-on' : 'p-cr') + '">' + (q.ok ? q.linhas.length + ' registro(s)' : 'erro') + '</span></div>' + corpo + '</div>';
  }).join('');
  modal('Dados de faturamento · ' + esc(gglNomeConta(r.cid)),
    '<div class="hint" style="margin:0 0 12px">Compare com o "Fundos disponíveis" da tela de Faturamento do Google Ads. Depois clique em <b>Copiar resultado</b> e cole na conversa com o Claude.</div>' +
    cand + blocos,
    '<button class="btn" onclick="fecha()">Fechar</button><button class="btn btn-p" onclick="gglCopiaResultado()">Copiar resultado</button>', true);
}
function gglCopiaResultado(){ salCopia(JSON.stringify(GGL.ultimo, null, 1)); }

/* ---------- card dentro de Saldo Meta ---------- */
function gglCard(){
  if(!euSouAdmin()) return '';
  if(!MEM && !GGL.statusPedido) gglStatus();
  if(GGL.retorno){
    var rt = GGL.retorno; GGL.retorno = null;
    setTimeout(function(){ toast(rt.ok ? 'Google conectado. Clique em Buscar contas.' : 'Não conectou o Google: ' + rt.msg, rt.ok ? 'ok' : 'err'); }, 60);
  }
  var st = GGL.status, c = GGL.conexao;
  var retorno = location.origin + '/api/google-retorno';
  var pill = c ? (c.situacao === 'expirada' ? '<span class="pill p-cr">conexão caiu</span>' : '<span class="pill p-on">conectado</span>') : '<span class="pill p-off">não conectado</span>';
  var ocC = GGL.ocupado === 'conectar';

  var corpo;
  if(c){
    corpo = '<div style="font-size:13px;line-height:1.7">' +
      '<div><span style="color:var(--mute)">Conta Google:</span> <b>' + esc(c.email || '—') + '</b></div>' +
      '<div><span style="color:var(--mute)">Conectado em:</span> ' + dLabel(String(c.conectadoEm).slice(0, 10)) + '</div></div>' +
      (c.situacao === 'expirada' ? '<div class="note mt12"' + SAL_NOTA_RUIM + '>A conexão caiu. Clique em Reconectar Google.</div>' : '') +
      '<div class="flx mt12" style="justify-content:flex-end"><button class="btn btn-d" onclick="gglDesconectar()">Desconectar</button>' +
      '<button class="btn" onclick="gglConectar()"' + (ocC ? ' disabled' : '') + '>' + (ocC ? 'Abrindo...' : 'Reconectar Google') + '</button>' +
      '<button class="btn btn-p" onclick="gglBuscaContas()"' + (GGL.ocupado === 'contas' ? ' disabled' : '') + '>' + (GGL.ocupado === 'contas' ? 'Buscando...' : 'Buscar contas') + '</button></div>';
  }else{
    corpo = '<div style="font-size:13px;color:var(--mute);line-height:1.6">Entre com a conta Google da sua MCC. O sistema passa a enxergar as contas de Google Ads dos clientes ligadas a ela.</div>' +
      '<div class="flx mt12" style="justify-content:flex-end"><button class="btn btn-p" onclick="gglConectar()"' + (ocC || (st && !st.app) ? ' disabled style="opacity:.6"' : '') + '>' +
      (ocC ? 'Abrindo o Google...' : 'Conectar Google') + '</button></div>';
  }

  var contas = '';
  if(c && GGL.contas){
    contas = GGL.contas.length ? '<div class="tsc mt12"><table><thead><tr><th>Conta</th><th>Situação</th><th class="tr"></th></tr></thead><tbody>' +
      GGL.contas.map(function(k){
        var oc = GGL.ocupado === 'inv:' + k.id;
        return '<tr><td><div class="nm">' + esc(k.nome || 'Sem nome') + '</div><div class="sub mono">' + esc(k.id.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3')) + '</div></td>' +
          '<td><span class="pill ' + (k.status === 'ENABLED' ? 'p-on' : 'p-off') + '">' + esc(GGL_ST[k.status] || (k.status || '—').toLowerCase()) + '</span></td>' +
          '<td class="tr"><button class="btn btn-s" onclick="gglInvestiga(\'' + esc(k.id) + '\',\'' + esc(k.gerente || '') + '\')"' + (GGL.ocupado ? ' disabled' : '') + '>' +
            (oc ? 'Consultando...' : 'Investigar saldo') + '</button></td></tr>';
      }).join('') + '</tbody></table></div>'
      : '<div class="note mt12" style="margin-bottom:0">Nenhuma conta de anúncio encontrada nessa conta Google.</div>';
  }

  return '<div class="tw"><div class="tw-hd"><div class="tw-t">Google Ads <span class="pill p-vl" style="margin-left:6px">em teste</span></div>' + pill + '</div><div style="padding:16px">' +
    (GGL.statusErro && !st ? '<div class="note">' + esc(GGL.statusErro) + '</div>' : '') +
    corpo + contas +
    (st && !st.app ? '<div class="note mt12" style="margin-bottom:0">Faltam as variáveis GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET na Vercel (veja o guia).</div>' : '') +
    (st && st.app && !st.mcc ? '<div class="hint mt12">Dica: coloque o ID da sua MCC na variável GOOGLE_ADS_MCC_ID para a busca ficar mais rápida.</div>' : '') +
    '<div class="fl mt18">Endereço de retorno (cadastre no Google Cloud)</div>' +
    '<div class="flx" style="flex-wrap:nowrap"><input class="fi mono" style="font-size:11.5px" readonly value="' + esc(retorno) + '" onclick="this.select()">' +
    '<button class="btn btn-s" onclick="salCopia(\'' + esc(retorno) + '\')">Copiar</button></div>' +
    '</div></div>';
}
