/* ============================================================
   2STEP · COMERCIAL
   Quadro de negociações: um card por cliente em conversa, com o
   que foi acordado na reunião (valores, serviços, condições) e o
   histórico de cada contato. Módulo à parte, só para admin.
   Depende de app.js (S, DB, MEM, EMAIL, MODULOS, ouve, save, del,
   render, modal, fecha, esc, uid, nf, brl, dLabel, hoje, ymOf,
   ymHoje, ymLabelL, toast, listaClientes, mCliente, $).
   Dados novos ficam só em 2step_financeiro/comercial/reunioes.
   ============================================================ */

var COM = { r: {}, ligado: false, busca: '', arrastando: '' };

var COM_ETAPAS = {
  negociacao: { n:'Em negociação',    cor:'#22D3EE', pill:'p-cy' },
  proposta:   { n:'Proposta enviada', cor:'#7C5CFF', pill:'p-vl' },
  fechado:    { n:'Fechou',           cor:'#34D399', pill:'p-on' },
  perdido:    { n:'Não fechou',       cor:'#7C8798', pill:'p-off' }
};
var COM_ETK = Object.keys(COM_ETAPAS);
var COM_ORIGENS = ['Indicação', 'Instagram', 'Meta Ads', 'Google', 'Prospecção ativa', 'Evento', 'Outro'];
var COM_SERVICOS = ['Tráfego Meta', 'Tráfego Google', 'Criativos', 'Social media', 'CRM', 'Automação', 'Landing page', 'Consultoria comercial', 'Auditoria'];
var COM_TIPOS_NOTA = { reuniao:'Reunião', ligacao:'Ligação', whatsapp:'WhatsApp', nota:'Anotação', alteracao:'Valores alterados' };

/* ---------- dados ---------- */
function comLiga(){
  if(COM.ligado || MEM || !DB || !euSouAdmin()) return;
  COM.ligado = true;
  ouve('comercial/reunioes', function(v){ COM.r = v; });
}
function comLista(){
  return Object.keys(COM.r).map(function(k){ return COM.r[k]; })
    .sort(function(a, b){ return String(b.dataReuniao || '').localeCompare(String(a.dataReuniao || '')) || String(b.criadoEm || '').localeCompare(String(a.criadoEm || '')); });
}
function comSet(g){
  g.atualizadoEm = new Date().toISOString();
  COM.r[g.id] = g;
  save('comercial/reunioes/' + g.id, g);
}
function comAberto(g){ return g.etapa === 'negociacao' || g.etapa === 'proposta'; }
function comAtrasado(g){ return comAberto(g) && g.dataProximoPasso && g.dataProximoPasso <= hoje(); }
function comBadge(){ comLiga(); return comLista().filter(comAtrasado).length; }
function comHistorico(g){
  var h = g.historico || {};
  return Object.keys(h).map(function(k){ return h[k]; })
    .sort(function(a, b){ return String(b.data || '').localeCompare(String(a.data || '')) || String(b.criadoEm || '').localeCompare(String(a.criadoEm || '')); });
}
function comNota(g, tipo, texto, data){
  g.historico = g.historico || {};
  var id = uid();
  g.historico[id] = { id:id, tipo:tipo, texto:texto, data:data || hoje(), por:EMAIL || '', criadoEm:new Date().toISOString() };
}
function comNorm(s){
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
/* cliente do financeiro com o mesmo nome, se já foi cadastrado */
function comNoFinanceiro(g){
  var n = comNorm(g.empresa);
  if(!n) return null;
  return listaClientes().filter(function(c){ return comNorm(c.nome) === n; })[0] || null;
}

/* ---------- quadro ---------- */
function vCom(){
  comLiga();
  var todos = comLista();
  var q = comNorm(COM.busca);
  var lista = !q ? todos : todos.filter(function(g){
    return comNorm([g.empresa, g.contato, (g.servicos || []).join(' '), g.anotacoes, g.segmento].join(' ')).indexOf(q) > -1;
  });

  var abertos = todos.filter(comAberto);
  var potencial = abertos.reduce(function(a, g){ return a + nf(g.mensalidade); }, 0);
  var fechMes = todos.filter(function(g){ return g.etapa === 'fechado' && ymOf(g.fechadoEm) === ymHoje(); });
  var nF = todos.filter(function(g){ return g.etapa === 'fechado'; }).length;
  var nP = todos.filter(function(g){ return g.etapa === 'perdido'; }).length;
  var atras = todos.filter(comAtrasado);

  var colunas = COM_ETK.map(function(e){
    var et = COM_ETAPAS[e];
    var cs = lista.filter(function(g){ return (g.etapa || 'negociacao') === e; });
    var soma = cs.reduce(function(a, g){ return a + nf(g.mensalidade); }, 0);
    return '<div class="tw" style="background:var(--slab);min-width:0" ondragover="event.preventDefault()" ondrop="comDrop(event,\'' + e + '\')">' +
      '<div class="tw-hd" style="padding:12px 14px"><div class="tw-t flx" style="gap:7px"><i class="dot" style="background:' + et.cor + '"></i>' + et.n +
        ' <span style="color:var(--mute2);font-family:var(--mono);font-size:12px">' + cs.length + '</span></div>' +
        (soma ? '<span class="mono" style="font-size:11.5px;color:var(--mute)">' + brl(soma, 1) + '/mês</span>' : '') + '</div>' +
      '<div style="padding:10px;display:grid;gap:9px;min-height:90px">' +
        (cs.length ? cs.map(comCard).join('') : '<div style="color:var(--mute2);font-size:12px;text-align:center;padding:22px 6px">' + (q ? 'Nada aqui com essa busca' : 'Arraste um card para cá') + '</div>') +
      '</div></div>';
  }).join('');

  return '' +
  '<div class="hd"><div><h1>Reuniões e negociações</h1><p>O que foi conversado e acordado com cada cliente, guardado antes de virar contrato</p></div>' +
  '<div class="hd-act"><input class="sr" placeholder="Buscar empresa, contato, serviço" value="' + esc(COM.busca) + '" oninput="comBusca(this.value)">' +
  '<button class="btn btn-p" onclick="mComEditar()">+ Nova reunião</button></div></div>' +

  '<div class="grid g4 mb12">' +
    kpi('Em aberto', String(abertos.length), (abertos.length === 1 ? 'Negociação' : 'Negociações') + ' em andamento ou com proposta enviada', abertos.length ? 'vlt' : '') +
    kpi('Mensalidade em jogo', brl(potencial), 'Soma do valor acordado nas negociações abertas', potencial ? 'cyn' : '') +
    kpi('Fechados em ' + ymLabelL(ymHoje()).split(' ')[0].toLowerCase(), String(fechMes.length), brl(fechMes.reduce(function(a, g){ return a + nf(g.mensalidade); }, 0)) + ' de mensalidade nova', fechMes.length ? 'pos' : '') +
    kpi('Conversão', (nF + nP) ? Math.round(nF / (nF + nP) * 100) + '%' : '—', nF + ' fecharam · ' + nP + ' não fecharam', '') +
  '</div>' +

  (atras.length ? '<div class="note">' + atras.length + ' negociação(ões) com próximo passo vencido ou para hoje: ' +
    atras.slice(0, 5).map(function(g){ return '<b style="cursor:pointer;text-decoration:underline" onclick="mComFicha(\'' + g.id + '\')">' + esc(g.empresa) + '</b>'; }).join(', ') +
    (atras.length > 5 ? ' e outras' : '') + '.</div>' : '') +

  (todos.length ? '<div class="grid g4">' + colunas + '</div>'
    : '<div class="tw"><div class="empty"><b>Nenhuma reunião registrada</b>Depois de cada reunião de vendas, clique em <b style="display:inline;font-size:13px">+ Nova reunião</b> e anote o que foi combinado: valores, serviços e condições.</div></div>');
}
function comCard(g){
  var sv = (g.servicos || []).slice(0, 3).map(function(s){ return '<span class="pc-c">' + esc(s) + '</span>'; }).join('') +
    ((g.servicos || []).length > 3 ? '<span class="pc-c">+' + ((g.servicos || []).length - 3) + '</span>' : '');
  var fin = g.etapa === 'fechado' ? comNoFinanceiro(g) : null;
  var atr = comAtrasado(g);
  return '<button class="pc" style="padding:12px 13px" draggable="true" ondragstart="comDrag(event,\'' + g.id + '\')" onclick="mComFicha(\'' + g.id + '\')">' +
    '<div class="pc-n" style="font-size:14px">' + esc(g.empresa || 'Sem nome') + '</div>' +
    '<div class="pc-s">' + dLabel(g.dataReuniao) + (g.contato ? ' · ' + esc(g.contato) : '') + '</div>' +
    (nf(g.mensalidade) || nf(g.setup) ? '<div class="mono" style="margin-top:9px;font-size:15px;font-weight:700">' + brl(g.mensalidade) +
      '<span style="font-size:11px;color:var(--mute);font-weight:500;font-family:var(--body)">/mês</span>' +
      (nf(g.setup) ? '<div style="font-size:11px;color:var(--mute);font-weight:500;margin-top:2px;font-family:var(--body)">+ ' + brl(g.setup) + ' de setup</div>' : '') + '</div>' : '') +
    (sv ? '<div class="pc-t" style="margin-top:8px">' + sv + '</div>' : '') +
    (comAberto(g) && g.proximoPasso ? '<div style="margin-top:9px;font-size:11.5px;line-height:1.4;color:' + (atr ? 'var(--coral)' : 'var(--mute)') + '">→ ' + esc(g.proximoPasso) +
      (g.dataProximoPasso ? ' · ' + dLabel(g.dataProximoPasso) : '') + '</div>' : '') +
    (g.etapa === 'fechado' ? '<div style="margin-top:9px">' + (fin ? '<span class="pill p-on" style="font-size:10px">no financeiro</span>' : '<span class="pill p-av" style="font-size:10px">falta cadastrar no financeiro</span>') + '</div>' : '') +
    (g.etapa === 'perdido' && g.motivoPerda ? '<div style="margin-top:8px;font-size:11.5px;color:var(--mute)">' + esc(g.motivoPerda) + '</div>' : '') +
    '</button>';
}
function comBusca(v){
  COM.busca = v; render();
  var e = document.querySelector('#main .sr');
  if(e){ e.focus(); e.setSelectionRange(v.length, v.length); }
}
function comDrag(ev, id){ COM.arrastando = id; try{ ev.dataTransfer.setData('text/plain', id); }catch(e){} }
function comDrop(ev, etapa){
  ev.preventDefault();
  var id = COM.arrastando; COM.arrastando = '';
  if(id) comMover(id, etapa);
}

/* ---------- mudar de etapa ---------- */
function comMover(id, etapa, reabrir){
  var g = COM.r[id];
  if(!g || g.etapa === etapa) return;
  if(etapa === 'perdido'){
    var m = prompt('Por que não fechou? (opcional)', g.motivoPerda || '');
    if(m === null) return;
    g.motivoPerda = m.trim();
  }
  var de = COM_ETAPAS[g.etapa || 'negociacao'].n;
  g.etapa = etapa;
  if(etapa === 'fechado' && !g.fechadoEm) g.fechadoEm = hoje();
  if(etapa !== 'fechado') g.fechadoEm = '';
  comNota(g, 'nota', 'Etapa: ' + de + ' → ' + COM_ETAPAS[etapa].n + (etapa === 'perdido' && g.motivoPerda ? ' (' + g.motivoPerda + ')' : ''));
  comSet(g);
  if(reabrir) mComFicha(id); else render();
  toast(etapa === 'fechado' ? 'Fechou! Agora é só cadastrar no financeiro' : 'Movido para ' + COM_ETAPAS[etapa].n, etapa === 'fechado' ? 'ok' : '');
}

/* ---------- ficha (leitura) ---------- */
function mComFicha(id){
  var g = COM.r[id];
  if(!g) return;
  var et = COM_ETAPAS[g.etapa || 'negociacao'];
  var fin = comNoFinanceiro(g);
  var hist = comHistorico(g);
  function campo(l, v){ return v ? '<div><div class="fl" style="margin-bottom:3px">' + l + '</div><div style="font-size:13.5px">' + v + '</div></div>' : ''; }

  var corpo = '' +
    '<div class="flx sp mb18"><div class="seg">' + COM_ETK.map(function(e){
      return '<button class="' + ((g.etapa || 'negociacao') === e ? 'on' : '') + '" onclick="comMover(\'' + id + '\',\'' + e + '\',1)">' + COM_ETAPAS[e].n + '</button>';
    }).join('') + '</div>' +
    (g.etapa === 'fechado' ? (fin ? '<span class="pill p-on">já está no financeiro como ' + esc(fin.nome) + '</span>'
      : '<button class="btn btn-s btn-p" onclick="comParaFinanceiro(\'' + id + '\')">Cadastrar no financeiro</button>') : '') + '</div>' +

    '<div class="card mb12" style="background:var(--slab2);border-color:' + et.cor + '55">' +
      '<div class="kpi-l">Valores acordados</div>' +
      '<div class="grid g3 mt12" style="gap:14px">' +
        '<div><div class="fl" style="margin-bottom:3px">Mensalidade</div><div class="mono" style="font-size:22px;font-weight:700">' + brl(g.mensalidade) + '</div></div>' +
        '<div><div class="fl" style="margin-bottom:3px">Setup / implantação</div><div class="mono" style="font-size:22px;font-weight:700">' + (nf(g.setup) ? brl(g.setup) : '—') + '</div></div>' +
        '<div><div class="fl" style="margin-bottom:3px">Prazo</div><div class="mono" style="font-size:22px;font-weight:700">' + (nf(g.prazoMeses) ? nf(g.prazoMeses) + ' meses' : '—') + '</div></div>' +
      '</div>' +
      '<div class="grid g3 mt12" style="gap:14px">' +
        campo('Vencimento', nf(g.diaVencimento) ? 'Todo dia ' + nf(g.diaVencimento) : '') +
        campo('Início previsto', g.inicioPrevisto ? dLabel(g.inicioPrevisto) : '') +
        campo('Forma de pagamento', esc(g.formaPagamento)) +
      '</div>' +
      (g.condicoes ? '<div class="mt12">' + campo('Condições especiais', '<span style="white-space:pre-wrap">' + esc(g.condicoes) + '</span>') + '</div>' : '') +
    '</div>' +

    ((g.servicos || []).length ? '<div class="fg"><div class="fl">Serviços combinados</div><div class="flx" style="gap:6px">' +
      g.servicos.map(function(s){ return '<span class="pill p-vl">' + esc(s) + '</span>'; }).join('') + '</div></div>' : '') +

    '<div class="grid g3 mb18" style="gap:14px">' +
      campo('Data da reunião', dLabel(g.dataReuniao)) +
      campo('Contato', esc(g.contato) + (g.telefone ? '<div class="sub mono">' + esc(g.telefone) + '</div>' : '') + (g.email ? '<div class="sub mono">' + esc(g.email) + '</div>' : '')) +
      campo('Origem', esc(g.origem) + (g.segmento ? '<div class="sub">' + esc(g.segmento) + '</div>' : '')) +
    '</div>' +

    (g.anotacoes ? '<div class="fg"><div class="fl">Anotações da reunião</div><div class="card" style="background:var(--slab2);white-space:pre-wrap;font-size:13.5px;line-height:1.6">' + esc(g.anotacoes) + '</div></div>' : '') +

    (g.proximoPasso || g.dataProximoPasso ? '<div class="fg"><div class="fl">Próximo passo</div><div style="font-size:13.5px;' + (comAtrasado(g) ? 'color:var(--coral)' : '') + '">' +
      esc(g.proximoPasso || '—') + (g.dataProximoPasso ? ' · até ' + dLabel(g.dataProximoPasso) : '') + '</div></div>' : '') +

    (g.etapa === 'perdido' && g.motivoPerda ? '<div class="fg"><div class="fl">Motivo de não ter fechado</div><div style="font-size:13.5px">' + esc(g.motivoPerda) + '</div></div>' : '') +

    '<div class="fg mt18"><div class="fl">Histórico</div>' +
      '<div class="card" style="background:var(--slab2);padding:12px">' +
        '<div class="fr fr3" style="gap:8px;margin-bottom:8px"><select class="fi" id="g_nt">' +
          ['reuniao', 'ligacao', 'whatsapp', 'nota'].map(function(t){ return '<option value="' + t + '">' + COM_TIPOS_NOTA[t] + '</option>'; }).join('') +
        '</select><input type="date" class="fi" id="g_nd" value="' + hoje() + '"><span></span></div>' +
        '<textarea class="fi" id="g_nx" placeholder="O que foi falado nesse contato: novo valor, objeção, retorno do cliente"></textarea>' +
        '<div class="flx mt12" style="justify-content:flex-end"><button class="btn btn-s btn-p" onclick="comAddNota(\'' + id + '\')">Adicionar ao histórico</button></div>' +
      '</div>' +
      (hist.length ? '<div style="margin-top:10px">' + hist.map(function(h){
        return '<div class="al" style="padding:10px 2px"><div class="al-ic" style="background:var(--slab3);color:var(--mute);font-size:10px;width:auto;padding:0 8px">' + esc(COM_TIPOS_NOTA[h.tipo] || h.tipo) + '</div>' +
          '<div class="al-b"><div style="font-size:13px;white-space:pre-wrap;line-height:1.5">' + esc(h.texto) + '</div>' +
          '<div class="al-s">' + dLabel(h.data) + (h.por ? ' · ' + esc(h.por) : '') + '</div></div></div>';
      }).join('') + '</div>' : '') +
    '</div>' +

    '<div class="hint mt12">Registrado ' + (g.criadoPor ? 'por ' + esc(g.criadoPor) + ' ' : '') + 'em ' + dLabel(String(g.criadoEm || '').slice(0, 10)) +
      (g.atualizadoEm ? ' · última alteração em ' + dLabel(String(g.atualizadoEm).slice(0, 10)) : '') + '</div>';

  modal(esc(g.empresa || 'Negociação') + ' <span class="pill ' + et.pill + '" style="vertical-align:middle;margin-left:6px">' + et.n + '</span>', corpo,
    '<button class="btn btn-d" onclick="comExcluir(\'' + id + '\')">Excluir</button>' +
    '<button class="btn" onclick="comCopiar(\'' + id + '\')">Copiar resumo</button>' +
    '<button class="btn btn-p" onclick="mComEditar(\'' + id + '\')">Editar</button>', true);
}
function comAddNota(id){
  var g = COM.r[id];
  var tx = ($('g_nx').value || '').trim();
  if(!tx) return toast('Escreva o que foi falado', 'err');
  comNota(g, $('g_nt').value, tx, $('g_nd').value || hoje());
  comSet(g);
  mComFicha(id);
  toast('Adicionado ao histórico', 'ok');
}
function comExcluir(id){
  var g = COM.r[id];
  if(!g) return;
  if(!confirm('Excluir a negociação com ' + (g.empresa || 'este cliente') + '?\n\nAs anotações e o histórico dela somem. O cadastro no financeiro, se existir, não é tocado.')) return;
  delete COM.r[id];
  del('comercial/reunioes/' + id);
  fecha(); render(); toast('Negociação excluída');
}

/* texto pronto para colar no WhatsApp ou mandar para a equipe */
function comResumo(g){
  var L = ['*' + (g.empresa || 'Negociação') + '*', 'Reunião em ' + dLabel(g.dataReuniao), '',
    'Mensalidade: ' + brl(g.mensalidade)];
  if(nf(g.setup)) L.push('Setup / implantação: ' + brl(g.setup));
  if(nf(g.prazoMeses)) L.push('Prazo: ' + nf(g.prazoMeses) + ' meses');
  if(nf(g.diaVencimento)) L.push('Vencimento: todo dia ' + nf(g.diaVencimento));
  if(g.inicioPrevisto) L.push('Início previsto: ' + dLabel(g.inicioPrevisto));
  if(g.formaPagamento) L.push('Forma de pagamento: ' + g.formaPagamento);
  if(g.condicoes) L.push('Condições: ' + g.condicoes);
  if((g.servicos || []).length) L.push('', 'Serviços: ' + g.servicos.join(', '));
  return L.join('\n');
}
function comCopiar(id){
  var t = comResumo(COM.r[id]);
  if(navigator.clipboard && navigator.clipboard.writeText)
    navigator.clipboard.writeText(t).then(function(){ toast('Resumo copiado', 'ok'); }, function(){ toast('Não consegui copiar', 'err'); });
  else toast('Seu navegador não permite copiar aqui', 'err');
}

/* abre o cadastro de cliente que já existe no financeiro, preenchido com o que foi acordado */
function comParaFinanceiro(id){
  var g = COM.r[id];
  if(!g) return;
  fecha();
  mCliente();
  function pf(campo, v){ var e = $(campo); if(e && v !== '' && v != null) e.value = v; }
  pf('c_nome', g.empresa);
  pf('c_mens', nf(g.mensalidade) || '');
  pf('c_ini', g.inicioPrevisto || hoje());
  pf('c_dia', nf(g.diaVencimento) || '');
  if(nf(g.prazoMeses)) pf('c_prazo', nf(g.prazoMeses));
  pf('c_serv', (g.servicos || []).join(', '));
  var obs = ['Fechado na negociação de ' + dLabel(g.dataReuniao) + '.'];
  if(nf(g.setup)) obs.push('Setup: ' + brl(g.setup) + '.');
  if(g.formaPagamento) obs.push('Pagamento: ' + g.formaPagamento + '.');
  if(g.condicoes) obs.push('Condições: ' + g.condicoes);
  pf('c_obs', obs.join(' '));
  /* linhas de serviço a partir dos serviços combinados na negociação */
  var sv = comNorm((g.servicos || []).join(' '));
  [['c_trf', sv.indexOf('trafego') > -1], ['c_soc', sv.indexOf('social') > -1]].forEach(function(x){
    var e = $(x[0]); if(e){ e.checked = x[1]; e.parentNode.classList.toggle('on', x[1]); }
  });
  toast('Confira os dados e clique em Salvar cliente');
}

/* ---------- formulário ---------- */
function mComEditar(id){
  var g = id ? COM.r[id] : { id:'', empresa:'', contato:'', telefone:'', email:'', segmento:'', origem:'', dataReuniao:hoje(), etapa:'negociacao',
    mensalidade:'', setup:'', prazoMeses:'', diaVencimento:'', inicioPrevisto:'', formaPagamento:'', condicoes:'', servicos:[], anotacoes:'', proximoPasso:'', dataProximoPasso:'' };
  if(!g) return;
  var sv = (g.servicos || []);
  var opcoes = COM_SERVICOS.concat(sv.filter(function(s){ return COM_SERVICOS.indexOf(s) < 0; }));
  function num(v){ return nf(v) ? nf(v) : ''; }

  modal(id ? 'Editar · ' + esc(g.empresa) : 'Nova reunião',
    '<div class="fl" style="color:var(--ink);font-size:12px;margin-bottom:10px">Cliente</div>' +
    '<div class="fr fr2">' +
      '<div class="fg"><label class="fl">Empresa</label><input class="fi" id="g_emp" value="' + esc(g.empresa) + '" placeholder="Espaço de eventos, buffet, etc"></div>' +
      '<div class="fg"><label class="fl">Segmento</label><input class="fi" id="g_seg" value="' + esc(g.segmento) + '" placeholder="Espaço de eventos"></div>' +
    '</div>' +
    '<div class="fr fr3">' +
      '<div class="fg"><label class="fl">Contato</label><input class="fi" id="g_ctt" value="' + esc(g.contato) + '" placeholder="Nome de quem decide"></div>' +
      '<div class="fg"><label class="fl">Telefone</label><input class="fi" id="g_tel" value="' + esc(g.telefone) + '"></div>' +
      '<div class="fg"><label class="fl">E-mail</label><input class="fi" id="g_eml" value="' + esc(g.email) + '"></div>' +
    '</div>' +
    '<div class="fr fr3">' +
      '<div class="fg"><label class="fl">Data da reunião</label><input type="date" class="fi" id="g_dat" value="' + (g.dataReuniao || hoje()) + '"></div>' +
      '<div class="fg"><label class="fl">Origem</label><input class="fi" id="g_ori" list="g_oris" value="' + esc(g.origem) + '" placeholder="escolha ou escreva">' +
        '<datalist id="g_oris">' + COM_ORIGENS.map(function(o){ return '<option value="' + o + '">'; }).join('') + '</datalist></div>' +
      '<div class="fg"><label class="fl">Etapa</label><select class="fi" id="g_eta">' +
        COM_ETK.map(function(e){ return '<option value="' + e + '" ' + ((g.etapa || 'negociacao') === e ? 'selected' : '') + '>' + COM_ETAPAS[e].n + '</option>'; }).join('') + '</select></div>' +
    '</div>' +

    '<div class="fl mt12" style="color:var(--ink);font-size:12px;margin-bottom:10px">Valores acordados</div>' +
    '<div class="fr fr3">' +
      '<div class="fg"><label class="fl">Mensalidade (R$)</label><input type="number" class="fi" id="g_men" step="0.01" min="0" value="' + num(g.mensalidade) + '"></div>' +
      '<div class="fg"><label class="fl">Setup / implantação (R$)</label><input type="number" class="fi" id="g_set" step="0.01" min="0" value="' + num(g.setup) + '"></div>' +
      '<div class="fg"><label class="fl">Prazo (meses)</label><input type="number" class="fi" id="g_prz" min="0" value="' + num(g.prazoMeses) + '"></div>' +
    '</div>' +
    '<div class="fr fr3">' +
      '<div class="fg"><label class="fl">Dia de vencimento</label><input type="number" class="fi" id="g_dia" min="1" max="28" value="' + num(g.diaVencimento) + '"></div>' +
      '<div class="fg"><label class="fl">Início previsto</label><input type="date" class="fi" id="g_ini" value="' + (g.inicioPrevisto || '') + '"></div>' +
      '<div class="fg"><label class="fl">Forma de pagamento</label><input class="fi" id="g_pag" list="g_pags" value="' + esc(g.formaPagamento) + '" placeholder="Pix, boleto, cartão">' +
        '<datalist id="g_pags"><option value="Pix"><option value="Boleto"><option value="Cartão de crédito"><option value="Transferência"></datalist></div>' +
    '</div>' +
    '<div class="fg"><label class="fl">Condições especiais</label><textarea class="fi" id="g_cnd" placeholder="Desconto nos 3 primeiros meses, carência, reajuste combinado, verba de anúncio por conta do cliente">' + esc(g.condicoes) + '</textarea></div>' +

    '<div class="fg"><label class="fl">Serviços combinados</label><div id="g_svs" style="display:flex;flex-wrap:wrap;gap:7px">' +
      opcoes.map(function(s){ return comChipServico(s, sv.indexOf(s) > -1); }).join('') + '</div>' +
      '<div class="flx mt12" style="flex-wrap:nowrap"><input class="fi" id="g_svn" placeholder="Outro serviço" onkeydown="if(event.key===\'Enter\'){event.preventDefault();comAddServico()}">' +
      '<button class="btn btn-s" onclick="comAddServico()">Adicionar</button></div></div>' +

    '<div class="fg"><label class="fl">Anotações gerais da reunião</label><textarea class="fi" id="g_ano" style="min-height:140px" placeholder="Dores do cliente, objeções, o que prometemos entregar, quem mais participa da decisão">' + esc(g.anotacoes) + '</textarea></div>' +
    '<div class="fr fr2">' +
      '<div class="fg"><label class="fl">Próximo passo</label><input class="fi" id="g_pps" value="' + esc(g.proximoPasso) + '" placeholder="Enviar proposta, ligar para confirmar"></div>' +
      '<div class="fg"><label class="fl">Até quando</label><input type="date" class="fi" id="g_ppd" value="' + (g.dataProximoPasso || '') + '"></div>' +
    '</div>',
    '<button class="btn" onclick="' + (id ? 'mComFicha(\'' + id + '\')' : 'fecha()') + '">Cancelar</button>' +
    '<button class="btn btn-p" onclick="comSalvar(\'' + (id || '') + '\')">Salvar</button>', true);
  if(!id) setTimeout(function(){ var e = $('g_emp'); if(e) e.focus(); }, 60);
}
function comChipServico(s, on){
  return '<label class="chk ' + (on ? 'on' : '') + '" style="padding:7px 10px;font-size:12.5px"><input type="checkbox" class="g_sv" value="' + esc(s) + '" ' + (on ? 'checked' : '') +
    ' onchange="this.parentNode.classList.toggle(\'on\',this.checked)">' + esc(s) + '</label>';
}
function comAddServico(){
  var e = $('g_svn'), s = (e.value || '').trim();
  if(!s) return;
  var ja = [].slice.call(document.querySelectorAll('.g_sv')).filter(function(c){ return comNorm(c.value) === comNorm(s); })[0];
  if(ja){ ja.checked = true; ja.parentNode.classList.add('on'); }
  else $('g_svs').insertAdjacentHTML('beforeend', comChipServico(s, true));
  e.value = ''; e.focus();
}
function comSalvar(id){
  var empresa = $('g_emp').value.trim();
  if(!empresa) return toast('Informe a empresa', 'err');
  var antes = id ? COM.r[id] : null;
  var g = antes ? JSON.parse(JSON.stringify(antes)) : { id: uid(), criadoEm: new Date().toISOString(), criadoPor: EMAIL || '', historico: {} };
  var etapaAntes = antes ? (antes.etapa || 'negociacao') : '';

  g.empresa = empresa;
  g.segmento = $('g_seg').value.trim();
  g.contato = $('g_ctt').value.trim();
  g.telefone = $('g_tel').value.trim();
  g.email = $('g_eml').value.trim();
  g.dataReuniao = $('g_dat').value || hoje();
  g.origem = $('g_ori').value.trim();
  g.etapa = $('g_eta').value;
  g.mensalidade = nf($('g_men').value);
  g.setup = nf($('g_set').value);
  g.prazoMeses = nf($('g_prz').value);
  g.diaVencimento = nf($('g_dia').value);
  g.inicioPrevisto = $('g_ini').value || '';
  g.formaPagamento = $('g_pag').value.trim();
  g.condicoes = $('g_cnd').value.trim();
  g.servicos = [].slice.call(document.querySelectorAll('.g_sv')).filter(function(c){ return c.checked; }).map(function(c){ return c.value; });
  g.anotacoes = $('g_ano').value.trim();
  g.proximoPasso = $('g_pps').value.trim();
  g.dataProximoPasso = $('g_ppd').value || '';
  if(g.etapa === 'fechado' && !g.fechadoEm) g.fechadoEm = hoje();
  if(g.etapa !== 'fechado') g.fechadoEm = '';

  /* registra no histórico toda mudança de valor, para saber o que valia antes */
  if(antes){
    var mud = [];
    if(nf(antes.mensalidade) !== g.mensalidade) mud.push('Mensalidade ' + brl(antes.mensalidade) + ' → ' + brl(g.mensalidade));
    if(nf(antes.setup) !== g.setup) mud.push('Setup ' + brl(antes.setup) + ' → ' + brl(g.setup));
    if(nf(antes.prazoMeses) !== g.prazoMeses) mud.push('Prazo ' + (nf(antes.prazoMeses) || '—') + ' → ' + (g.prazoMeses || '—') + ' meses');
    if(String(antes.condicoes || '') !== g.condicoes) mud.push('Condições: ' + (g.condicoes || '(removidas)'));
    if(mud.length) comNota(g, 'alteracao', mud.join('\n'));
    if(etapaAntes !== g.etapa) comNota(g, 'nota', 'Etapa: ' + COM_ETAPAS[etapaAntes].n + ' → ' + COM_ETAPAS[g.etapa].n);
  }

  comSet(g);
  mComFicha(g.id);
  render();
  toast(id ? 'Negociação atualizada' : 'Reunião registrada', 'ok');
}

/* ---------- registro no menu: módulo Comercial, antes de Sistema ---------- */
(function(){
  var m = { id:'com', nome:'Comercial', sigla:'C', cor:'#FBBF24', papeis:['admin'], telas:[
    { v:'com', n:'Reuniões', f:function(){ return vCom(); }, badge:function(){ return comBadge(); } }
  ]};
  var i = -1;
  MODULOS.forEach(function(x, k){ if(x.id === 'sis') i = k; });
  if(i > -1) MODULOS.splice(i, 0, m); else MODULOS.push(m);
})();
