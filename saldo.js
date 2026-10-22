/* ============================================================
   2STEP · SALDO META (tela)
   Saldo pré-pago das contas de anúncio dos clientes, com alerta no
   WhatsApp quando fica abaixo do mínimo de cada conta.
   Entra no módulo Operacional, para admin e operação. A configuração
   do WhatsApp só aparece para administradores.
   Depende de app.js (S, DB, AUTH, MEM, EMAIL, ROOT, MODULOS, ouve,
   save, del, render, modal, fecha, esc, n, nf, brl, kpi, dLabel,
   toast, listaClientes, euSouAdmin, $) e de asaas.js (asaSugestao).
   Dados novos: 2step_financeiro/meta (contas, config, log).
   A leitura e o envio são feitos no servidor (api/meta-saldo.js).
   ============================================================ */

var SAL = {
  d: {}, ligado: false,
  status: null, zapi: null, statusErro: '', statusPedido: false,
  contasMeta: null,   // contas que o token da Meta enxerga, quando buscadas
  grupos: null,       // grupos da Z-API, quando buscados
  ocupado: ''         // 'verificar' | 'contas' | 'grupos' | 'teste'
};

var SAL_SIT = {
  baixo:       { t:'Abaixo do mínimo',   pill:'p-cr' },
  erro:        { t:'Erro na leitura',    pill:'p-cr' },
  'sem-saldo': { t:'Sem saldo pré-pago', pill:'p-av' },
  novo:        { t:'Aguardando leitura', pill:'p-off' },
  pausado:     { t:'Pausado',            pill:'p-off' },
  ok:          { t:'Saldo ok',           pill:'p-on' }
};
var SAL_ORDEM = ['baixo', 'erro', 'sem-saldo', 'novo', 'ok', 'pausado'];
var SAL_CONTA_ST = { 2:'desativada', 3:'com pagamento pendente', 7:'em análise', 8:'em acerto', 9:'em período de carência', 100:'em encerramento', 101:'encerrada' };
var SAL_REPETIR = [[0, 'Uma vez, até recarregar'], [6, 'A cada 6 horas'], [12, 'A cada 12 horas'], [24, 'Uma vez por dia']];

/* estilos só deste módulo */
(function(){
  var css = '' +
  '.sal-c{display:flex;flex-direction:column;min-width:0}' +
  '.sal-c.baixo{border-color:rgba(251,113,133,.55);background:linear-gradient(180deg,var(--coral-dim),var(--slab) 60%)}' +
  '.sal-c.pausado{opacity:.55}' +
  '.sal-n{font-family:var(--disp);font-size:15px;font-weight:600;letter-spacing:-.01em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
  '.sal-s{font-size:11.5px;color:var(--mute);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px}' +
  '.sal-v{font-family:var(--mono);font-size:24px;font-weight:700;letter-spacing:-.03em;margin-top:14px;line-height:1}' +
  '.sal-a{display:flex;gap:6px;margin-top:auto;padding-top:12px;flex-wrap:wrap}' +
  '.sal-a .btn{flex:1;text-align:center;text-decoration:none;color:var(--ink)}' +
  '.sal-l{display:flex;gap:10px;padding:11px 16px;border-bottom:1px solid var(--line);align-items:flex-start}' +
  '.sal-l:last-child{border-bottom:none}' +
  '.sal-l .mono{font-size:11.5px;color:var(--mute);white-space:nowrap;padding-top:2px}' +
  '.sal-k{grid-template-columns:repeat(4,minmax(0,1fr))}' +
  '@media(max-width:1100px){.sal-k{grid-template-columns:repeat(2,minmax(0,1fr))}}' +
  '@media(max-width:820px){.sal-k{gap:8px}.sal-k .card{padding:12px}.sal-k .kpi-l{font-size:9.5px;letter-spacing:.06em}.sal-k .kpi-v{font-size:20px}.sal-k .kpi-s{font-size:11px}}';
  var s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
})();

/* ---------- dados ---------- */
function salLiga(){
  if(SAL.ligado) return;
  if(MEM){ SAL.ligado = true; salDemo(); return; }
  if(!DB || PAPEL === 'sem-acesso') return;
  SAL.ligado = true;
  ouve('meta', function(v){ SAL.d = v; });
}
function salConta(id){ return (SAL.d.contas || {})[id] || null; }
function salSit(c){
  if(c.ativo === false) return 'pausado';
  if(!c.lidoEm) return 'novo';
  return SAL_SIT[c.situacao] ? c.situacao : 'novo';
}
function salCliente(c){ return (S.clientes[c.clienteId] || {}).nome || 'Cliente não vinculado'; }
function salContas(){
  var cs = SAL.d.contas || {};
  return Object.keys(cs).map(function(k){ return cs[k]; }).filter(function(c){ return c && c.id; })
    .sort(function(a, b){
      return SAL_ORDEM.indexOf(salSit(a)) - SAL_ORDEM.indexOf(salSit(b)) ||
        salCliente(a).localeCompare(salCliente(b), 'pt-BR');
    });
}
function salBadge(){ salLiga(); return salContas().filter(function(c){ return salSit(c) === 'baixo'; }).length; }

function salHa(iso){
  if(!iso) return '';
  var min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if(isNaN(min)) return '';
  if(min < 1) return 'agora';
  if(min < 60) return 'há ' + min + ' min';
  if(min < 48 * 60) return 'há ' + Math.round(min / 60) + ' h';
  return 'em ' + dLabel(String(iso).slice(0, 10));
}
function salDataHora(iso){
  var d = new Date(iso);
  if(isNaN(d)) return '—';
  return d.toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
}
function salLinkRecarga(id){ return 'https://business.facebook.com/billing_hub/payment_settings/?asset_id=' + encodeURIComponent(String(id).replace(/^act_/, '')); }

/* grava só os campos passados, sem apagar o que o servidor leu */
function salUpd(id, mud){
  var c = (SAL.d.contas = SAL.d.contas || {})[id] = Object.assign({}, salConta(id), mud);
  Object.keys(mud).forEach(function(k){ if(mud[k] === null) delete c[k]; });
  if(MEM || !DB){ render(); return Promise.resolve(); }
  return DB.ref(ROOT + '/meta/contas/' + id).update(mud);
}

/* ---------- chamadas ao servidor ---------- */
function salApi(acao, metodo){
  if(MEM) return Promise.reject(new Error('Só funciona com o Firebase ligado'));
  if(!AUTH || !AUTH.currentUser) return Promise.reject(new Error('Faça login de novo'));
  return AUTH.currentUser.getIdToken().then(function(tk){
    return fetch('/api/meta-saldo?acao=' + acao, { method: metodo || 'GET', headers: { Authorization: 'Bearer ' + tk } });
  }).then(function(r){
    return r.json().catch(function(){
      throw new Error(r.status === 404 ? 'As funções do servidor (/api) ainda não estão publicadas na Vercel' : 'Resposta inválida do servidor (' + r.status + ')');
    }).then(function(j){
      if(!j.ok){ var e = new Error(j.erro || 'Erro no servidor'); e.status = j.status; throw e; }
      return j;
    });
  });
}
function salStatus(){
  SAL.statusPedido = true;
  salApi('status').then(function(j){ SAL.status = j.status; SAL.zapi = j.zapi || null; SAL.statusErro = ''; render(); },
    function(e){ SAL.status = e.status || null; SAL.statusErro = e.message; render(); });
}
function salVerifica(){
  if(SAL.ocupado) return;
  if(MEM) return toast('Na demonstração não há leitura real: precisa do Firebase e do token da Meta', 'err');
  SAL.ocupado = 'verificar'; render();
  salApi('verificar', 'POST').then(function(j){
    var r = j.resumo;
    SAL.ocupado = ''; render();
    if(r.erroEnvio) return toast('Saldos lidos, mas o WhatsApp falhou: ' + r.erroEnvio, 'err');
    toast(r.total + ' conta(s) lida(s)' + (r.baixo ? ' · ' + r.baixo + ' abaixo do mínimo' : ' · todas ok') +
      (r.avisadas ? ' · alerta enviado' : (r.adiadas ? ' · alerta fica para o horário de envio' : '')), r.erros ? 'err' : 'ok');
  }, function(e){ SAL.ocupado = ''; render(); toast(e.message, 'err'); });
}
function salBuscaContas(){
  if(SAL.ocupado) return;
  SAL.ocupado = 'contas'; mSalConta();
  salApi('contas').then(function(j){
    SAL.contasMeta = j.contas.sort(function(a, b){ return String(a.nome).localeCompare(String(b.nome), 'pt-BR'); });
    SAL.ocupado = ''; mSalConta();
    toast(j.contas.length + ' conta(s) encontrada(s) na Meta', 'ok');
  }, function(e){ SAL.ocupado = ''; mSalConta(); toast(e.message, 'err'); });
}
function salBuscaGrupos(){
  if(SAL.ocupado) return;
  SAL.ocupado = 'grupos'; render();
  salApi('grupos').then(function(j){
    SAL.grupos = j.grupos; SAL.ocupado = ''; render();
    toast(j.grupos.length ? j.grupos.length + ' grupo(s) encontrados' : 'Nenhum grupo: adicione o número da Z-API ao grupo', j.grupos.length ? 'ok' : 'err');
  }, function(e){ SAL.ocupado = ''; render(); toast(e.message, 'err'); });
}

/* ---------- vincular / editar conta ---------- */
function mSalConta(id){
  var c = id ? salConta(id) : null;
  var ja = SAL.d.contas || {};
  var lista = SAL.contasMeta;
  var campoConta;
  if(c){
    campoConta = '<div class="fi" style="background:var(--slab3)">' + esc(c.nome || 'Conta de anúncios') + ' <span class="mono" style="color:var(--mute);font-size:12px">' + esc(c.id) + '</span></div>';
  }else if(lista){
    var livres = lista.filter(function(x){ return !ja[x.id]; });
    campoConta = '<select class="fi" id="m_conta" onchange="salSugereCliente(this.value)"><option value="">' + (livres.length ? 'Escolha a conta' : 'Todas as contas já estão vinculadas') + '</option>' +
      livres.map(function(x){
        return '<option value="' + esc(x.id) + '">' + esc(x.nome || x.id) + ' · ' + (x.saldo != null ? brl(x.saldo) : 'sem saldo pré-pago') + '</option>';
      }).join('') + '</select>' +
      '<div class="hint">' + lista.length + ' conta(s) que o token da Meta enxerga. O valor ao lado é o saldo agora.</div>';
  }else{
    campoConta = '<div class="flx" style="flex-wrap:nowrap"><input class="fi mono" id="m_conta" placeholder="act_1234567890" autocomplete="off">' +
      '<button class="btn" type="button" onclick="salBuscaContas()"' + (SAL.ocupado === 'contas' ? ' disabled' : '') + '>' + (SAL.ocupado === 'contas' ? 'Buscando...' : 'Buscar na Meta') + '</button></div>' +
      '<div class="hint">Busque as contas na Meta ou cole o ID (aparece no endereço do Gerenciador de Anúncios, depois de act=).</div>';
  }
  var cs = listaClientes().filter(function(x){ return x.status !== 'encerrado' || (c && x.id === c.clienteId); })
    .sort(function(a, b){ return String(a.nome).localeCompare(String(b.nome), 'pt-BR'); });

  modal(c ? 'Editar conta' : 'Vincular conta de anúncios',
    '<div class="fg"><label class="fl">Conta de anúncios</label>' + campoConta + '</div>' +
    '<div class="fg"><label class="fl">Cliente</label><select class="fi" id="m_cli"><option value="">Escolha o cliente</option>' +
      cs.map(function(x){ return '<option value="' + esc(x.id) + '"' + (c && c.clienteId === x.id ? ' selected' : '') + '>' + esc(x.nome) + '</option>'; }).join('') + '</select></div>' +
    '<div class="fg"><label class="fl">Avisar quando o saldo ficar abaixo de</label>' +
      '<input class="fi mono" id="m_min" inputmode="decimal" placeholder="150,00" value="' + (c && nf(c.minimo) ? String(nf(c.minimo)).replace('.', ',') : '') + '">' +
      '<div class="hint">Em reais. Dica: um valor que dê para uns 2 ou 3 dias de anúncio, para dar tempo de recarregar.</div></div>' +
    (c ? '<label class="chk' + (c.ativo !== false ? ' on' : '') + '"><input type="checkbox" id="m_ativo"' + (c.ativo !== false ? ' checked' : '') +
      ' onchange="this.parentNode.classList.toggle(\'on\',this.checked)">Monitorar esta conta</label>' : ''),
    (c ? '<button class="btn btn-d" onclick="salRemove(\'' + esc(c.id) + '\')" style="margin-right:auto">Remover</button>' : '') +
    '<button class="btn" onclick="fecha()">Cancelar</button>' +
    '<button class="btn btn-p" onclick="salSalvaConta(\'' + (c ? esc(c.id) : '') + '\')">' + (c ? 'Salvar' : 'Vincular') + '</button>');
}
/* ao escolher a conta, sugere o cliente pelo nome (só sugere: dá para trocar) */
function salSugereCliente(id){
  var x = (SAL.contasMeta || []).filter(function(k){ return k.id === id; })[0];
  var sel = $('m_cli');
  if(!x || !sel || sel.value) return;
  var sug = asaSugestao(x.nome) || asaSugestao(x.empresa);
  if(sug) sel.value = sug.id;
}
function salSalvaConta(id){
  var cid = id || String(($('m_conta') || {}).value || '').trim().replace(/\s/g, '');
  if(!cid) return toast('Escolha a conta de anúncios', 'err');
  if(/^\d+$/.test(cid)) cid = 'act_' + cid;
  if(!/^act_\d{5,25}$/.test(cid)) return toast('ID da conta inválido. Use o formato act_1234567890', 'err');
  if(!id && salConta(cid)) return toast('Essa conta já está vinculada', 'err');
  var cli = $('m_cli').value;
  if(!cli) return toast('Escolha o cliente', 'err');
  var min = n($('m_min').value);
  if(!(min > 0)) return toast('Informe o saldo mínimo', 'err');

  if(id){
    var antes = salConta(id), mud = { clienteId: cli, minimo: min, ativo: $('m_ativo').checked };
    /* mudou a regra: o próximo aviso conta do zero, sem "recarga" falsa */
    if(min !== nf(antes.minimo) || mud.ativo !== (antes.ativo !== false)) mud.alertadoEm = null;
    salUpd(id, mud);
    fecha(); render(); toast('Conta atualizada', 'ok');
    return;
  }
  var info = (SAL.contasMeta || []).filter(function(x){ return x.id === cid; })[0] || {};
  var nova = { id: cid, nome: info.nome || '', clienteId: cli, minimo: min, ativo: true,
               vinculadoEm: new Date().toISOString(), vinculadoPor: EMAIL || '' };
  (SAL.d.contas = SAL.d.contas || {})[cid] = nova;
  save('meta/contas/' + cid, nova);
  fecha(); render();
  toast('Conta vinculada. Lendo o saldo...', 'ok');
  if(!MEM) setTimeout(salVerifica, 400);
}
function salRemove(id){
  var c = salConta(id);
  if(!c || !confirm('Parar de monitorar a conta ' + (c.nome || c.id) + ' de ' + salCliente(c) + '?')) return;
  delete SAL.d.contas[id];
  del('meta/contas/' + id);
  fecha(); render(); toast('Conta removida');
}

/* ---------- configuração do WhatsApp (só admin) ---------- */
function salCanal(t){
  var box = $('k_canal');
  box.dataset.t = t;
  [].forEach.call(box.querySelectorAll('button'), function(b){ b.classList.toggle('on', b.dataset.t === t); });
  $('k_zapi').classList.toggle('hidden', t !== 'zapi');
  $('k_quando').classList.toggle('hidden', t === 'off');
}
function salSalvaConfig(silencioso){
  var canal = $('k_canal').dataset.t;
  var dest = $('k_dest'), destino = dest ? String(dest.value || '').trim() : '';
  if(canal === 'zapi' && !destino){ toast('Escolha o grupo (ou número) que recebe os alertas', 'err'); return false; }
  var cfg = {
    canal: canal,
    destino: destino,
    destinoNome: dest && dest.tagName === 'SELECT' && dest.selectedIndex > -1 ? dest.options[dest.selectedIndex].text : ((SAL.d.config || {}).destino === destino ? (SAL.d.config.destinoNome || '') : ''),
    horaIni: +$('k_hi').value, horaFim: +$('k_hf').value,
    repetirHoras: +$('k_rep').value,
    avisarRecarga: $('k_rec').checked,
    atualizadoEm: new Date().toISOString(), atualizadoPor: EMAIL || ''
  };
  SAL.d.config = cfg;
  save('meta/config', cfg);
  if(!silencioso) toast('Configuração salva', 'ok');
  return true;
}
function salTeste(){
  if(SAL.ocupado) return;
  if(!salSalvaConfig(true)) return;
  if($('k_canal').dataset.t === 'off') return toast('Ligue o alerta no WhatsApp antes de testar', 'err');
  SAL.ocupado = 'teste'; render();
  salApi('teste', 'POST').then(function(){ SAL.ocupado = ''; render(); toast('Mensagem de teste enviada. Confira o WhatsApp.', 'ok'); },
    function(e){ SAL.ocupado = ''; render(); toast(e.message, 'err'); });
}
function salCopia(txt){
  if(navigator.clipboard && navigator.clipboard.writeText)
    navigator.clipboard.writeText(txt).then(function(){ toast('Copiado', 'ok'); }, function(){ toast('Não consegui copiar', 'err'); });
  else toast('Seu navegador não permite copiar aqui', 'err');
}

/* ---------- tela ---------- */
function vSaldo(){
  salLiga();
  if(!MEM && !SAL.statusPedido) salStatus();
  var cs = salContas();
  var ativas = cs.filter(function(c){ return c.ativo !== false; });
  var baixas = ativas.filter(function(c){ return salSit(c) === 'baixo'; });
  var soma = ativas.reduce(function(a, c){ return a + (c.saldo != null ? nf(c.saldo) : 0); }, 0);
  var uv = SAL.d.ultimaVerificacao;
  var oc = SAL.ocupado === 'verificar';

  return '' +
  '<div class="hd"><div><h1>Saldo Meta</h1><p>Saldo pré-pago das contas de anúncio, com alerta no WhatsApp quando estiver acabando</p></div>' +
  '<div class="hd-act"><button class="btn" onclick="salVerifica()"' + (oc ? ' disabled style="opacity:.6"' : '') + '>' + (oc ? 'Verificando...' : 'Verificar agora') + '</button>' +
  '<button class="btn btn-p" onclick="mSalConta()">+ Vincular conta</button></div></div>' +

  (MEM ? '<div class="note">Demonstração: os saldos abaixo são de exemplo. A leitura real precisa do Firebase e do token da Meta.</div>' : '') +
  salAvisos() +

  '<div class="grid sal-k mb12">' +
    kpi('Contas monitoradas', String(ativas.length), cs.length > ativas.length ? (cs.length - ativas.length) + ' pausada(s)' : 'Contas vinculadas a clientes', '') +
    kpi('Abaixo do mínimo', String(baixas.length), baixas.length ? baixas.map(function(c){ return esc(salCliente(c)); }).slice(0, 2).join(', ') + (baixas.length > 2 ? '…' : '') : 'Nenhuma conta precisa de recarga', baixas.length ? 'neg' : 'pos') +
    kpi('Saldo somado', brl(soma, true), 'Das contas com saldo lido', '') +
    kpi('Última verificação', uv ? salHa(uv.em) : '—', uv ? (uv.origem === 'agendado' ? 'Automática' : 'Feita no painel') + ' · ' + salDataHora(uv.em) : 'Nenhuma verificação ainda', '') +
  '</div>' +

  (cs.length ? '<div class="pg mb12">' + cs.map(salCard).join('') + '</div>' :
    '<div class="tw mb12"><div class="empty"><b>Nenhuma conta vinculada</b>Clique em <b style="display:inline;font-size:13px">+ Vincular conta</b>, escolha a conta de anúncios, o cliente e o saldo mínimo.</div></div>') +

  (euSouAdmin() ? '<div class="grid g2 mb12">' + salCardConfig() + salCardAgenda() + '</div>' : '') +
  salCardLog();
}

function salAvisos(){
  var out = '', uv = SAL.d.ultimaVerificacao, st = SAL.status;
  if(!MEM && SAL.statusErro && !st) out += '<div class="note">' + esc(SAL.statusErro) + '</div>';
  if(st && !st.metaToken) out += '<div class="note">Falta o token da Meta (variável META_TOKEN na Vercel). Sem ele não dá para ler os saldos.</div>';
  if(uv && uv.erroEnvio) out += '<div class="note" style="background:var(--coral-dim);border-color:rgba(251,113,133,.35);color:#fda4af">' +
    'A última verificação não conseguiu mandar o WhatsApp: ' + esc(uv.erroEnvio) + '</div>';
  if(SAL.zapi && (SAL.d.config || {}).canal === 'zapi' && !SAL.zapi.conectado) out += '<div class="note" style="background:var(--coral-dim);border-color:rgba(251,113,133,.35);color:#fda4af">' +
    'O WhatsApp da Z-API está desconectado. Abra o painel da Z-API e leia o QR code de novo com o celular do número dos alertas.</div>';
  return out;
}

function salCard(c){
  var s = salSit(c), si = SAL_SIT[s];
  var min = nf(c.minimo), tem = c.saldo != null && c.lidoEm;
  var saldo = nf(c.saldo);
  var pct = tem && min > 0 ? Math.max(3, Math.min(100, saldo / (min * 3) * 100)) : 0;
  var cor = s === 'baixo' ? 'var(--coral)' : (tem && saldo < min * 1.5 ? 'var(--amber)' : 'var(--mint)');
  var extra = '';
  if(s === 'erro') extra = '<div class="sub neg" style="margin-top:6px">' + esc(c.erro || 'Não foi possível ler') + '</div>';
  else if(s === 'sem-saldo') extra = '<div class="sub warn" style="margin-top:6px">' + esc(c.saldoTexto || 'A conta não usa saldo pré-pago') + '</div>';
  if(c.contaStatus && c.contaStatus !== 1) extra += '<div class="sub warn" style="margin-top:6px">Conta ' + esc(SAL_CONTA_ST[c.contaStatus] || ('com status ' + c.contaStatus)) + ' na Meta</div>';
  if(s === 'baixo' && c.alertadoEm) extra += '<div class="sub" style="margin-top:6px">Alerta enviado ' + salHa(c.alertadoEm) + '</div>';
  if(c.fonte === 'limite') extra += '<div class="sub" style="margin-top:6px">Calculado pelo limite de gastos da conta</div>';

  return '<div class="card sal-c ' + s + '">' +
    '<div class="flx sp" style="align-items:flex-start;flex-wrap:nowrap;gap:8px"><div style="min-width:0">' +
      '<div class="sal-n">' + esc(salCliente(c)) + '</div>' +
      '<div class="sal-s">' + esc(c.nome || 'Conta de anúncios') + ' · <span class="mono">' + esc(c.id) + '</span></div></div>' +
      '<span class="pill ' + si.pill + '">' + si.t + '</span></div>' +
    '<div class="sal-v' + (s === 'baixo' ? ' neg' : '') + '">' + (tem ? brl(saldo) : '—') + '</div>' +
    '<div class="bar" style="margin-top:10px"><i style="width:' + pct + '%;background:' + cor + '"></i></div>' +
    '<div class="sub" style="margin-top:8px">Mínimo <b style="color:var(--ink)" class="mono">' + brl(min) + '</b> · ' + (c.lidoEm ? 'lido ' + salHa(c.lidoEm) : 'ainda não lido') + '</div>' +
    extra +
    '<div class="sal-a">' +
      '<a class="btn btn-s" href="' + esc(salLinkRecarga(c.id)) + '" target="_blank" rel="noopener">Recarregar ↗</a>' +
      '<button class="btn btn-s" onclick="mSalConta(\'' + esc(c.id) + '\')">Editar</button></div>' +
    '</div>';
}

function salCardConfig(){
  var cfg = SAL.d.config || {}, st = SAL.status, canal = cfg.canal || 'off';
  var hi = cfg.horaIni != null ? +cfg.horaIni : 7, hf = cfg.horaFim != null ? +cfg.horaFim : 22;
  function horas(id, v){
    var o = '';
    for(var h = 0; h < 24; h++) o += '<option value="' + h + '"' + (h === v ? ' selected' : '') + '>' + h + 'h</option>';
    return '<select class="fi" id="' + id + '">' + o + '</select>';
  }
  function linha(ok, nome, dica){
    return '<div class="flx" style="padding:5px 0;align-items:flex-start;flex-wrap:nowrap">' +
      '<span class="pill ' + (ok ? 'p-on' : 'p-cr') + '" style="min-width:50px;justify-content:center">' + (ok ? 'ok' : 'falta') + '</span>' +
      '<span style="font-size:12.5px"><b>' + nome + '</b>' + (ok ? '' : '<div class="hint" style="margin-top:2px">' + dica + '</div>') + '</span></div>';
  }

  var dest;
  if(SAL.grupos){
    var tem = SAL.grupos.some(function(g){ return g.id === cfg.destino; });
    dest = '<select class="fi" id="k_dest"><option value="">Escolha o grupo</option>' +
      (cfg.destino && !tem ? '<option value="' + esc(cfg.destino) + '" selected>' + esc(cfg.destinoNome || cfg.destino) + '</option>' : '') +
      SAL.grupos.map(function(g){ return '<option value="' + esc(g.id) + '"' + (g.id === cfg.destino ? ' selected' : '') + '>' + esc(g.nome) + '</option>'; }).join('') + '</select>';
  }else{
    dest = '<input class="fi mono" id="k_dest" placeholder="ID do grupo ou 5511999999999" value="' + esc(cfg.destino || '') + '">' +
      (cfg.destinoNome ? '<div class="hint">Grupo atual: <b style="color:var(--ink)">' + esc(cfg.destinoNome) + '</b></div>' : '');
  }
  var zst = SAL.zapi ? (SAL.zapi.conectado ? '<span class="pill p-on">WhatsApp conectado</span>' : '<span class="pill p-cr">WhatsApp desconectado</span>') : '';

  return '<div class="tw"><div class="tw-hd"><div class="tw-t">Alerta no WhatsApp</div>' + zst + '</div><div style="padding:16px">' +
    '<div class="fg"><label class="fl">Canal</label><div class="seg" id="k_canal" data-t="' + canal + '">' +
      [['off', 'Desligado'], ['zapi', 'Ligado (Z-API)']].map(function(o){
        return '<button type="button" data-t="' + o[0] + '" class="' + (canal === o[0] ? 'on' : '') + '" onclick="salCanal(\'' + o[0] + '\')">' + o[1] + '</button>';
      }).join('') + '</div></div>' +

    '<div id="k_zapi" class="fg' + (canal === 'zapi' ? '' : ' hidden') + '"><label class="fl">Grupo que recebe os alertas</label>' +
      '<div class="flx" style="flex-wrap:nowrap;align-items:flex-start"><div style="flex:1;min-width:0">' + dest + '</div>' +
      '<button class="btn" type="button" onclick="salBuscaGrupos()"' + (SAL.ocupado === 'grupos' ? ' disabled' : '') + '>' + (SAL.ocupado === 'grupos' ? 'Buscando...' : 'Buscar grupos') + '</button></div>' +
      '<div class="hint">O número conectado na Z-API precisa estar no grupo. Também aceita um número com DDI e DDD.</div></div>' +

    '<div id="k_quando"' + (canal === 'off' ? ' class="hidden"' : '') + '>' +
      '<div class="fr" style="grid-template-columns:1fr 1fr"><div class="fg"><label class="fl">Enviar a partir de</label>' + horas('k_hi', hi) + '</div>' +
        '<div class="fg"><label class="fl">Até</label>' + horas('k_hf', hf) + '</div></div>' +
      '<div class="hint" style="margin:-6px 0 14px">Fora desse horário o alerta espera e sai assim que o horário abrir.</div>' +
      '<div class="fg"><label class="fl">Se continuar sem recarga</label><select class="fi" id="k_rep">' +
        SAL_REPETIR.map(function(o){ return '<option value="' + o[0] + '"' + (o[0] === +(cfg.repetirHoras || 0) ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></div>' +
      '<label class="chk' + (cfg.avisarRecarga !== false ? ' on' : '') + '"><input type="checkbox" id="k_rec"' + (cfg.avisarRecarga !== false ? ' checked' : '') +
        ' onchange="this.parentNode.classList.toggle(\'on\',this.checked)">Avisar também quando a recarga for identificada</label>' +
    '</div>' +

    '<div class="flx mt18" style="justify-content:flex-end"><button class="btn" onclick="salTeste()"' + (SAL.ocupado === 'teste' ? ' disabled' : '') + '>' + (SAL.ocupado === 'teste' ? 'Enviando...' : 'Enviar teste') + '</button>' +
      '<button class="btn btn-p" onclick="salSalvaConfig()">Salvar</button></div>' +

    (st ? '<div class="fl mt18">Configuração no servidor</div>' +
      linha(st.metaToken, 'Token da Meta', 'Variável META_TOKEN na Vercel.') +
      linha(st.cron, 'Senha do agendador', 'Variável CRON_SECRET na Vercel (16 caracteres ou mais).') +
      (canal === 'zapi' ? linha(st.zapi, 'Z-API', 'Variáveis ZAPI_INSTANCIA e ZAPI_TOKEN na Vercel (e ZAPI_CLIENT_TOKEN, se o token de segurança estiver ativo).') : '')
      : '') +
    '</div></div>';
}

function salCardAgenda(){
  var url = location.origin + '/api/meta-saldo?acao=cron&chave=SUA_SENHA';
  return '<div class="tw"><div class="tw-hd"><div class="tw-t">Verificação automática</div></div><div style="padding:16px;font-size:13px;line-height:1.65;color:var(--mute)">' +
    '<b style="color:var(--ink)">1.</b> A cada hora um agendador gratuito (cron-job.org) chama o endereço abaixo, trocando <b style="color:var(--ink)">SUA_SENHA</b> pelo valor do CRON_SECRET.<br>' +
    '<b style="color:var(--ink)">2.</b> O sistema lê o saldo de todas as contas monitoradas e guarda aqui.<br>' +
    '<b style="color:var(--ink)">3.</b> Conta abaixo do mínimo recebe <b style="color:var(--ink)">um</b> alerta. Depois da recarga, a conta volta ao normal e o próximo aviso sai só quando baixar de novo.' +
    '<div class="fl mt18">Endereço para o agendador</div>' +
    '<div class="flx" style="flex-wrap:nowrap"><input class="fi mono" style="font-size:11.5px" readonly value="' + esc(url) + '" onclick="this.select()">' +
    '<button class="btn btn-s" onclick="salCopia(\'' + esc(url) + '\')">Copiar</button></div>' +
    '<div class="hint">Além disso, a Vercel faz uma verificação extra todo dia às 8h.</div>' +
    '</div></div>';
}

function salCardLog(){
  var lg = SAL.d.log || {};
  var itens = Object.keys(lg).map(function(k){ return lg[k]; }).filter(Boolean)
    .sort(function(a, b){ return String(b.em).localeCompare(String(a.em)); }).slice(0, 20);
  var tipos = { baixo: ['Saldo baixo', 'p-cr'], recarga: ['Recarga', 'p-on'], teste: ['Teste', 'p-vl'] };
  return '<div class="tw"><div class="tw-hd"><div class="tw-t">Alertas enviados</div></div>' +
    (itens.length ? itens.map(function(r){
      var t = tipos[r.tipo] || [r.tipo, 'p-off'];
      var desc = (r.contas || []).map(function(c){ return esc(c.cliente || c.id) + ' <span class="mono">' + brl(c.saldo) + '</span>'; }).join(' · ');
      return '<div class="sal-l"><span class="mono">' + salDataHora(r.em) + '</span>' +
        '<div style="flex:1;min-width:0"><div class="flx" style="gap:6px"><span class="pill ' + t[1] + '">' + t[0] + '</span>' +
          (r.ok ? '' : '<span class="pill p-cr">falhou</span>') + '</div>' +
          (desc ? '<div class="sub" style="margin-top:4px">' + desc + '</div>' : '') +
          (r.erro ? '<div class="sub neg" style="margin-top:4px">' + esc(r.erro) + '</div>' : '') +
        '</div></div>';
    }).join('') : '<div class="empty"><b>Nenhum alerta ainda</b>Quando um saldo baixar do mínimo, o aviso enviado aparece aqui.</div>') +
    '</div>';
}

/* ---------- demonstração (sem Firebase) ---------- */
function salDemo(){
  var cs = listaClientes().filter(function(c){ return c.status !== 'encerrado'; }).slice(0, 3);
  if(cs.length < 3) return;
  var agora = Date.now();
  function ha(min){ return new Date(agora - min * 60000).toISOString(); }
  SAL.d = {
    contas: {
      act_100200300: { id:'act_100200300', nome: cs[0].nome + ' · Ads', clienteId: cs[0].id, minimo: 150, ativo: true, saldo: 82.4, moeda:'BRL', lidoEm: ha(12), situacao:'baixo', alertadoEm: ha(12), contaStatus: 1, fonte:'prepago' },
      act_400500600: { id:'act_400500600', nome: cs[1].nome + ' · Ads', clienteId: cs[1].id, minimo: 200, ativo: true, saldo: 1240.9, moeda:'BRL', lidoEm: ha(12), situacao:'ok', contaStatus: 1, fonte:'prepago' },
      act_700800900: { id:'act_700800900', nome: cs[2].nome + ' · Ads', clienteId: cs[2].id, minimo: 100, ativo: true, saldo: 260, moeda:'BRL', lidoEm: ha(12), situacao:'ok', contaStatus: 1, fonte:'prepago' }
    },
    config: { canal:'zapi', destino:'120363000000000000-group', destinoNome:'Recargas 2STEP', horaIni: 7, horaFim: 22, repetirHoras: 0, avisarRecarga: true },
    ultimaVerificacao: { em: ha(12), origem:'agendado', total: 3, baixo: 1, avisadas: 1 },
    log: {
      a: { em: ha(12), tipo:'baixo', ok: true, contas: [{ id:'act_100200300', cliente: cs[0].nome, saldo: 82.4, minimo: 150 }] },
      b: { em: ha(60 * 26), tipo:'recarga', ok: true, contas: [{ id:'act_700800900', cliente: cs[2].nome, saldo: 500 }] }
    }
  };
}

/* ---------- registro no menu: Operacional › Saldo Meta ---------- */
(function(){
  var m = MODULOS.filter(function(x){ return x.id === 'mid'; })[0];
  if(m) m.telas.push({ v:'saldo', n:'Saldo Meta', f:function(){ return vSaldo(); }, badge:function(){ return salBadge(); } });
})();
