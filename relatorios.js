/* ============================================================
   2STEP · RELATÓRIOS SEMANAIS (tela)
   Lista de clientes → card do cliente (configuração e histórico de
   relatórios) → relatório da semana (métricas editáveis, ordem das
   métricas e imagem PNG para o WhatsApp). Só para a equipe (admin e
   operação); o cliente recebe só a imagem.
   Depende de app.js (S, DB, MEM, EMAIL, ROOT, MODULOS, AUTH, ouve,
   save, del, render, modal, fecha, esc, n, brl, dLabel, addDias,
   toast, listaClientes, $), de saldo.js (SAL, salLiga, salApi) e de
   google.js (gglApi).
   Dados: 2step_financeiro/relatorios (clientes e semanas).
   A busca das métricas é feita no servidor (api/relatorios.js).
   ============================================================ */

var REL = { cfg: {}, sem: {}, ligado: false, sel: '', semana: '', ocupado: '', r: null };

/* catálogo de métricas. calc: sai das outras (ajustou a base, o cálculo acompanha);
   um cálculo pode usar os que vêm antes dele nesta lista */
function relDiv(a, b, k){ return b ? a / b * (k || 1) : null; }
var REL_MET = {
  meta: [
    { k:'alcance',       n:'Alcance',                                 f:'int' },
    { k:'ctr',           n:'Interação com o anúncio',                 f:'pct', calc:function(v){ return relDiv(v.cliques, v.impressoes, 100); } },
    { k:'cliquesSaida',  n:'Cliques de saída',                        f:'int' },
    { k:'leads',         n:'Leads',                                   f:'int' },
    { k:'custoLead',     n:'Custo por lead',                          f:'brl', calc:function(v){ return relDiv(v.invest, v.leads); } },
    { k:'invest',        n:'Valor investido',                         f:'brl' },
    { k:'visitasPerfil', n:'Visitas ao perfil do Instagram',          f:'int' },
    { k:'custoVisita',   n:'Custo por visita ao perfil do Instagram', f:'brl', calc:function(v){ return relDiv(v.invest, v.visitasPerfil); } },
    { k:'conversas',     n:'Conversas no WhatsApp',                   f:'int' },
    { k:'custoConversa', n:'Custo por conversa',                      f:'brl', calc:function(v){ return relDiv(v.invest, v.conversas); } },
    { k:'impressoes',    n:'Impressões',                              f:'int' },
    { k:'frequencia',    n:'Frequência',                              f:'dec', calc:function(v){ return relDiv(v.impressoes, v.alcance); } },
    { k:'cliques',       n:'Cliques (todos)',                         f:'int' },
    { k:'cliquesLink',   n:'Cliques no link',                         f:'int' },
    { k:'ctrLink',       n:'CTR do link',                             f:'pct', calc:function(v){ return relDiv(v.cliquesLink, v.impressoes, 100); } },
    { k:'cpc',           n:'Custo por clique no link',                f:'brl', calc:function(v){ return relDiv(v.invest, v.cliquesLink); } },
    { k:'cpm',           n:'CPM',                                     f:'brl', calc:function(v){ return relDiv(v.invest, v.impressoes, 1000); } },
    { k:'compras',       n:'Compras',                                 f:'int' },
    { k:'valorCompras',  n:'Valor em compras',                        f:'brl' },
    { k:'roas',          n:'ROAS',                                    f:'x',   calc:function(v){ return relDiv(v.valorCompras, v.invest); } },
    { k:'engajamento',   n:'Engajamento',                             f:'int' },
    { k:'thruplay',      n:'Visualizações de vídeo',                  f:'int' }
  ],
  google: [
    { k:'invest',         n:'Valor investido',       f:'brl' },
    { k:'cliques',        n:'Cliques',               f:'int' },
    { k:'ligacoes',       n:'Ligações',              f:'int' },
    { k:'impressoes',     n:'Impressões',            f:'int' },
    { k:'ctr',            n:'Interação com o anúncio', f:'pct', calc:function(v){ return relDiv(v.cliques, v.impressoes, 100); } },
    { k:'cpc',            n:'Custo por clique',      f:'brl', calc:function(v){ return relDiv(v.invest, v.cliques); } },
    { k:'conversoes',     n:'Conversões',            f:'dec' },
    { k:'custoConversao', n:'Custo por conversão',   f:'brl', calc:function(v){ return relDiv(v.invest, v.conversoes); } },
    { k:'taxaConversao',  n:'Taxa de conversão',     f:'pct', calc:function(v){ return relDiv(v.conversoes, v.cliques, 100); } }
  ]
};
var REL_PADRAO = {
  meta: ['alcance', 'ctr', 'cliquesSaida', 'leads', 'custoLead', 'invest', 'visitasPerfil', 'custoVisita'],
  google: ['invest', 'cliques', 'ligacoes']
};
var REL_PLAT = { meta: 'Meta Ads', google: 'Google Ads' };
function relMet(p, k){ return REL_MET[p].filter(function(x){ return x.k === k; })[0]; }

/* estilos só deste módulo */
(function(){
  var css = '' +
  '.rel-g{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:12px;align-items:start}' +
  '.rel-img{width:100%;display:block;border-radius:12px;background:#0C447C;min-height:200px}' +
  '.rel-ed{display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--line)}' +
  '.rel-ed:last-child{border-bottom:none}' +
  '.rel-ed .fi{width:120px;padding:7px 10px;text-align:right;font-family:var(--mono);flex-shrink:0}' +
  '.rel-ed.aj .fi{border-color:var(--amber)}' +
  '.rel-n{flex:1;min-width:0;font-size:13px;line-height:1.3}' +
  '.rel-o{font-size:11px;color:var(--amber);margin-top:2px}' +
  '.rel-mv{display:flex;flex-direction:column;gap:2px;flex-shrink:0}' +
  '.rel-mv button{width:26px;height:20px;border-radius:5px;background:var(--slab3);color:var(--mute);font-size:11px;line-height:1}' +
  '.rel-mv button:hover{color:var(--ink);background:var(--line2)}' +
  '.rel-mv button:disabled{opacity:.25;pointer-events:none}' +
  '.rel-chips{display:flex;flex-wrap:wrap;gap:6px}' +
  '.rel-chip{padding:6px 11px;border-radius:20px;border:1px solid var(--line);background:var(--slab2);font-size:12.5px;color:var(--mute)}' +
  '.rel-chip.on{border-color:var(--volt);background:var(--volt-dim);color:var(--ink)}' +
  '.rel-lg{width:44px;height:44px;border-radius:10px;background:#fff;display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0}' +
  '.rel-lg img{max-width:84%;max-height:84%}' +
  '.rel-ini{background:var(--slab3);color:var(--ink);font-family:var(--disp);font-weight:700;font-size:15px}' +
  '@media(max-width:820px){.rel-g{grid-template-columns:1fr}.rel-ed .fi{width:104px}.rel-ab{display:none}}';
  var s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
})();

/* ---------- datas (semana fechada: segunda a domingo) ---------- */
function relHoje(){ return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }); }
function relSegunda(d){ var dow = (new Date(d + 'T12:00:00').getDay() + 6) % 7; return addDias(d, -dow); }
function relSemanaPassada(){ return addDias(relSegunda(relHoje()), -7); }
function relPeriodo(ini){ var fim = addDias(ini, 6); return ini.slice(8, 10) + '/' + ini.slice(5, 7) + ' a ' + dLabel(fim); }

/* ---------- dados ---------- */
function relLiga(){
  if(REL.ligado) return;
  if(MEM){ REL.ligado = true; relDemo(); return; }
  if(!DB || PAPEL === 'sem-acesso') return;
  REL.ligado = true;
  ouve('relatorios/clientes', function(v){ REL.cfg = v; });
  ouve('relatorios/semanas', function(v){ REL.sem = v; });
}
function relNome(id){ return (S.clientes[id] || {}).nome || 'Cliente removido'; }
function relSem(id, ini){ return ((REL.sem[id] || {})[ini]) || null; }
function relSemanas(id){
  var o = REL.sem[id] || {};
  return Object.keys(o).filter(function(k){ return o[k]; }).sort().reverse();
}
function relContas(c){ return Object.keys((c && c.contas) || {}).map(function(k){ return c.contas[k]; }).filter(Boolean); }
function relPlats(c){
  var cs = relContas(c);
  return ['meta', 'google'].filter(function(p){
    return cs.some(function(x){ return (x.plataforma === 'google' ? 'google' : 'meta') === p; }) && ((c.metricas || {})[p] || []).length;
  });
}
/* valor de cada métrica: ajuste manual > cálculo > o que veio da plataforma */
function relBase(s, plat){
  var b = Object.assign({}, ((s || {}).originais || {})[plat] || {});
  /* "Leads" são os de formulário; uma versão anterior guardava como "leadsForm" */
  if(plat === 'meta' && b.leads == null && b.leadsForm != null) b.leads = b.leadsForm;
  delete b.leadsForm;
  return b;
}
function relValores(s, plat){
  var base = relBase(s, plat);
  var ed = (((s || {}).editados || {})[plat]) || {};
  REL_MET[plat].forEach(function(m){ if(!m.calc && ed[m.k] != null) base[m.k] = ed[m.k]; });
  var out = {};
  REL_MET[plat].forEach(function(m){
    out[m.k] = ed[m.k] != null ? ed[m.k] : (m.calc ? m.calc(base) : (base[m.k] != null ? base[m.k] : null));
    base[m.k] = out[m.k];
  });
  return out;
}
function relOriginal(s, plat, k){
  var b = relBase(s, plat), out = null;
  REL_MET[plat].forEach(function(m){ if(m.calc) b[m.k] = m.calc(b); if(m.k === k) out = b[m.k] != null ? b[m.k] : null; });
  return out;
}
function relTotal(c, s){
  return relPlats(c).reduce(function(a, p){ return a + (Number(relValores(s, p).invest) || 0); }, 0);
}
function relFmt(v, f){
  if(v == null || isNaN(v)) return '—';
  if(f === 'brl') return brl(v);
  if(f === 'int') return Math.round(v).toLocaleString('pt-BR');
  if(f === 'pct') return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
  var t = Number(v).toLocaleString('pt-BR', { minimumFractionDigits: f === 'dec' ? 2 : 0, maximumFractionDigits: 2 });
  return f === 'x' ? t + 'x' : t;
}
function relFmtEd(v, f){
  if(v == null || isNaN(v)) return '';
  return f === 'int' ? Math.round(v).toLocaleString('pt-BR') : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
/* grava só os campos passados (os ajustes nunca se perdem quando os dados são puxados de novo) */
function relUpd(caminho, obj){
  if(MEM || !DB){
    var partes = caminho.split('/');
    var alvo = partes.shift() === 'semanas' ? REL.sem : REL.cfg;
    partes.forEach(function(p){ alvo = alvo[p] = alvo[p] || {}; });
    Object.keys(obj).forEach(function(k){
      var ks = k.split('/'), o = alvo;
      ks.slice(0, -1).forEach(function(p){ o = o[p] = o[p] || {}; });
      if(obj[k] === null) delete o[ks[ks.length - 1]]; else o[ks[ks.length - 1]] = obj[k];
    });
    render(); return Promise.resolve();
  }
  return DB.ref(ROOT + '/relatorios/' + caminho).update(obj);
}

/* ---------- servidor ---------- */
function relGerar(id, ini){
  if(REL.ocupado) return;
  ini = ini || relSemanaPassada();
  fecha();
  if(MEM){ relDemoSemana(id, ini, 'manual'); REL.semana = ini; render(); toast('Demonstração: números de exemplo', 'ok'); return; }
  if(!AUTH || !AUTH.currentUser) return toast('Faça login de novo', 'err');
  REL.ocupado = 'gerar:' + ini; render();
  AUTH.currentUser.getIdToken().then(function(tk){
    return fetch('/api/relatorios?acao=gerar&cliente=' + encodeURIComponent(id) + '&semana=' + ini, { method: 'POST', headers: { Authorization: 'Bearer ' + tk } });
  }).then(function(r){
    return r.json().catch(function(){ throw new Error(r.status === 404 ? 'A função de relatórios ainda não está publicada na Vercel' : 'Resposta inválida do servidor (' + r.status + ')'); });
  }).then(function(j){
    REL.ocupado = '';
    if(!j.ok) throw new Error(j.erro || 'Erro no servidor');
    (REL.sem[id] = REL.sem[id] || {})[ini] = j.relatorio;
    REL.semana = ini; render(); window.scrollTo(0, 0);
    var av = (j.relatorio.erros || []).length;
    toast(av ? 'Gerado com avisos: confira no topo' : 'Relatório gerado', av ? 'err' : 'ok');
  }).catch(function(e){ REL.ocupado = ''; render(); toast(e.message, 'err'); });
}

/* ---------- navegação ---------- */
function relAbrir(id){ REL.sel = id; REL.semana = ''; render(); window.scrollTo(0, 0); }
function relAbreSemana(ini){ REL.semana = ini; render(); window.scrollTo(0, 0); }
function relVoltar(){ if(REL.semana) REL.semana = ''; else REL.sel = ''; render(); window.scrollTo(0, 0); }
function vRel(){
  relLiga();
  if(typeof salLiga === 'function') salLiga();
  if(REL.sel && REL.cfg[REL.sel]) return REL.semana && relSem(REL.sel, REL.semana) ? vRelRelatorio(REL.sel, REL.semana) : vRelCard(REL.sel);
  return vRelLista();
}

/* ---------- lista de clientes ---------- */
function relLogoHTML(c, id){
  return c.logo ? '<div class="rel-lg"><img src="' + esc(c.logo) + '" alt=""></div>'
    : '<div class="rel-lg rel-ini">' + esc(relNome(id).slice(0, 2).toUpperCase()) + '</div>';
}
function relSituacao(s){
  if(!s) return '<span class="pill p-off">ainda não gerado</span>';
  if(!s.originais && (s.erros || []).length) return '<span class="pill p-cr">erro ao gerar</span>';
  if(s.enviadoEm) return '<span class="pill p-on">enviado</span>';
  return '<span class="pill p-av">pronto para revisar</span>';
}
function vRelLista(){
  var sp = relSemanaPassada();
  var ids = Object.keys(REL.cfg).filter(function(k){ return REL.cfg[k]; })
    .sort(function(a, b){ return relNome(a).localeCompare(relNome(b), 'pt-BR'); });
  var prontos = 0;
  var cards = ids.map(function(id){
    var c = REL.cfg[id], s = relSem(id, sp);
    if(s && s.originais && !s.enviadoEm) prontos++;
    var plats = relPlats(c);
    return '<button class="pc" onclick="relAbrir(\'' + esc(id) + '\')">' +
      '<div class="flx" style="flex-wrap:nowrap;gap:11px">' + relLogoHTML(c, id) +
        '<div style="min-width:0"><div class="pc-n" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(relNome(id)) + '</div>' +
        '<div class="pc-s">' + (plats.length ? plats.map(function(p){ return REL_PLAT[p]; }).join(' + ') : 'Falta configurar') + '</div></div></div>' +
      '<div class="flx mt12" style="gap:6px">' + (plats.length ? relSituacao(s) : '<span class="pill p-av">configurar</span>') + '</div>' +
      '<div class="pc-v">' + (s && s.originais ? brl(relTotal(c, s)) : '—') + '</div>' +
      '<div class="sub">semana de ' + relPeriodo(sp) + ' · ' + relSemanas(id).length + ' relatório(s) salvos</div></button>';
  }).join('');

  return '' +
  '<div class="hd"><div><h1>Relatórios</h1><p>Um card por cliente, com todos os relatórios dele. Os rascunhos da semana ficam prontos toda segunda às 7h.</p></div>' +
  '<div class="hd-act"><button class="btn btn-p" onclick="mRelNovo()">+ Adicionar cliente</button></div></div>' +
  (MEM ? '<div class="note">Demonstração: os números são de exemplo.</div>' : '') +
  (prontos ? '<div class="note" style="background:var(--volt-dim);border-color:rgba(124,92,255,.35);color:#c4b5fd">' + prontos + ' relatório(s) de ' + relPeriodo(sp) + ' pronto(s) para revisar.</div>' : '') +
  (cards ? '<div class="pg">' + cards + '</div>' :
    '<div class="tw"><div class="empty"><b>Nenhum cliente nos relatórios</b>Clique em <b style="display:inline;font-size:13px">+ Adicionar cliente</b> para criar o card do cliente.</div></div>');
}
function mRelNovo(){
  var cs = listaClientes().filter(function(x){ return x.status !== 'encerrado' && !REL.cfg[x.id]; })
    .sort(function(a, b){ return String(a.nome).localeCompare(String(b.nome), 'pt-BR'); });
  if(!cs.length) return toast('Todos os clientes ativos já estão nos relatórios', 'err');
  modal('Adicionar cliente',
    '<div class="fg"><label class="fl">Cliente que vai receber o relatório</label><select class="fi" id="r_cli"><option value="">Escolha o cliente</option>' +
      cs.map(function(x){ return '<option value="' + esc(x.id) + '">' + esc(x.nome) + '</option>'; }).join('') + '</select>' +
      '<div class="hint">Dentro do card você escolhe as contas, as métricas e a logo, e gera os relatórios.</div></div>',
    '<button class="btn" onclick="fecha()">Cancelar</button><button class="btn btn-p" onclick="relNovoSalva()">Criar card</button>');
}
function relNovoSalva(){
  var id = $('r_cli').value;
  if(!id) return toast('Escolha o cliente', 'err');
  /* já traz as contas desse cliente que estão no Saldo Ads */
  var contas = {};
  relContasDisponiveis().forEach(function(o){ if(o.clienteId === id) contas[o.key] = relContaLimpa(o); });
  var c = { clienteId: id, contas: contas, metricas: { meta: REL_PADRAO.meta.slice(), google: REL_PADRAO.google.slice() }, logo: '',
            criadoEm: new Date().toISOString(), criadoPor: EMAIL || '' };
  REL.cfg[id] = c;
  save('relatorios/clientes/' + id, c);
  fecha(); relAbrir(id);
  toast(Object.keys(contas).length ? 'Card criado. Confira a configuração e gere o relatório.' : 'Card criado. Agora configure as contas de anúncio.', 'ok');
}

/* ---------- card do cliente: configuração e histórico ---------- */
function vRelCard(id){
  var c = REL.cfg[id], plats = relPlats(c), contas = relContas(c);
  var sems = relSemanas(id);
  var oc = String(REL.ocupado).indexOf('gerar') === 0;

  var resumoCfg = '<div class="tw mb12"><div class="tw-hd"><div class="tw-t">Configuração</div><button class="btn btn-s" onclick="mRelConfig(\'' + esc(id) + '\')">Configurar</button></div>' +
    '<div style="padding:12px 16px;font-size:13px;line-height:1.8">' +
      '<div><span style="color:var(--mute)">Contas:</span> ' + (contas.length ? contas.map(function(x){
        return '<span class="sal-pf ' + (x.plataforma === 'google' ? 'g' : 'm') + '">' + (x.plataforma === 'google' ? 'Google' : 'Meta') + '</span>' + esc(x.nome || x.id || x.googleId);
      }).join(' &nbsp; ') : '<b class="warn">nenhuma ainda</b>') + '</div>' +
      plats.map(function(p){
        return '<div><span style="color:var(--mute)">Métricas ' + REL_PLAT[p] + ':</span> ' + c.metricas[p].map(function(k){ var m = relMet(p, k); return m ? esc(m.n) : ''; }).filter(Boolean).join(' · ') + '</div>';
      }).join('') +
      '<div><span style="color:var(--mute)">Logo:</span> ' + (c.logo ? 'enviada' : 'sem logo') + '</div>' +
    '</div></div>';

  var lista = sems.length ? '<div class="tsc"><table><thead><tr><th>Semana</th><th>Situação</th><th class="tr">Investido</th><th class="tr rel-ab"></th></tr></thead><tbody>' +
    sems.map(function(ini){
      var s = relSem(id, ini);
      return '<tr style="cursor:pointer" onclick="relAbreSemana(\'' + ini + '\')"><td><div class="nm">' + relPeriodo(ini) + '</div><div class="sub">' +
        (s.origem === 'automatico' ? 'rascunho automático' : 'gerado no painel') + ' · ' + dLabel(String(s.geradoEm || '').slice(0, 10)) + '</div></td>' +
        '<td>' + relSituacao(s) + '</td><td class="tr mono">' + (s.originais ? brl(relTotal(c, s)) : '—') + '</td>' +
        '<td class="tr rel-ab"><button class="btn btn-s">Abrir</button></td></tr>';
    }).join('') + '</tbody></table></div>'
    : '<div class="empty"><b>Nenhum relatório ainda</b>Clique em <b style="display:inline;font-size:13px">+ Gerar relatório</b>. Toda segunda às 7h o rascunho da semana também sai sozinho.</div>';

  return '<button class="bk" onclick="relVoltar()">← Todos os clientes</button>' +
    '<div class="hd"><div class="flx" style="flex-wrap:nowrap;gap:12px">' + relLogoHTML(c, id) + '<div><h1>' + esc(relNome(id)) + '</h1>' +
      '<p>' + sems.length + ' relatório(s) salvos</p></div></div>' +
    '<div class="hd-act"><button class="btn btn-p" onclick="mRelGerar(\'' + esc(id) + '\')"' + (oc || !plats.length ? ' disabled style="opacity:.6"' : '') + '>' +
      (oc ? 'Puxando as métricas...' : '+ Gerar relatório') + '</button></div></div>' +
    (!plats.length ? '<div class="note">Antes de gerar, configure as contas de anúncio e as métricas deste cliente. <button class="btn btn-s btn-p" style="margin-left:6px" onclick="mRelConfig(\'' + esc(id) + '\')">Configurar</button></div>' : '') +
    resumoCfg +
    '<div class="tw"><div class="tw-hd"><div class="tw-t">Relatórios gerados</div></div>' + lista + '</div>';
}
function mRelGerar(id){
  var sp = relSemanaPassada(), op = '';
  for(var i = 0; i < 8; i++){
    var ini = addDias(sp, -7 * i);
    op += '<option value="' + ini + '">' + relPeriodo(ini) + (relSem(id, ini) ? ' (já gerado: atualiza os dados)' : '') + '</option>';
  }
  modal('Gerar relatório · ' + esc(relNome(id)),
    '<div class="fg"><label class="fl">Semana (Segunda a Domingo)</label><select class="fi" id="r_sem">' + op + '</select>' +
    '<div class="hint">Puxa as campanhas que rodaram nessa semana, nas contas configuradas. Se já existir, os seus ajustes manuais são mantidos.</div></div>',
    '<button class="btn" onclick="fecha()">Cancelar</button><button class="btn btn-p" onclick="relGerar(\'' + esc(id) + '\', $(\'r_sem\').value)">Gerar</button>');
}

/* ---------- configuração (contas, métricas, logo) ---------- */
function relContasDisponiveis(){
  var out = {};
  function poe(o){ if(!out[o.key]) out[o.key] = o; }
  var sd = (typeof SAL !== 'undefined' && SAL.d && SAL.d.contas) || {};
  Object.keys(sd).forEach(function(k){
    var c = sd[k]; if(!c || !c.id) return;
    if(c.plataforma === 'google') poe({ key: c.id, plataforma: 'google', googleId: c.googleId, gerente: c.gerente || '', nome: c.nome || '', clienteId: c.clienteId });
    else poe({ key: c.id, plataforma: 'meta', id: c.id, nome: c.nome || '', clienteId: c.clienteId });
  });
  ((typeof SAL !== 'undefined' && SAL.contasMeta) || []).forEach(function(c){ poe({ key: c.id, plataforma: 'meta', id: c.id, nome: c.nome || '' }); });
  ((typeof SAL !== 'undefined' && SAL.contasGoogle) || []).forEach(function(c){ poe({ key: 'g_' + c.id, plataforma: 'google', googleId: c.id, gerente: c.gerente || '', nome: c.nome || '' }); });
  Object.keys((REL.r || {}).contas || {}).forEach(function(k){ poe(Object.assign({ key: k }, REL.r.contas[k])); });
  return Object.keys(out).map(function(k){ return out[k]; });
}
function relContaLimpa(o){
  return o.plataforma === 'google' ? { plataforma: 'google', googleId: o.googleId, gerente: o.gerente || '', nome: o.nome || '' }
                                   : { plataforma: 'meta', id: o.id, nome: o.nome || '' };
}
function mRelConfig(id){
  var c = REL.cfg[id];
  REL.r = {
    clienteId: id,
    contas: JSON.parse(JSON.stringify(c.contas || {})),
    metricas: { meta: ((c.metricas && c.metricas.meta) || []).slice(), google: ((c.metricas && c.metricas.google) || []).slice() },
    logo: c.logo || ''
  };
  mRelConfigRender();
}
function mRelConfigRender(){
  var r = REL.r;
  var disp = relContasDisponiveis().sort(function(a, b){
    return ((b.clienteId === r.clienteId) - (a.clienteId === r.clienteId)) || String(a.nome).localeCompare(String(b.nome), 'pt-BR');
  });
  var contas = disp.length ? disp.map(function(o){
    var on = !!r.contas[o.key];
    return '<label class="chk' + (on ? ' on' : '') + '" style="margin-bottom:6px"><input type="checkbox"' + (on ? ' checked' : '') + ' onchange="relRConta(\'' + esc(o.key) + '\')">' +
      '<span class="sal-pf ' + (o.plataforma === 'google' ? 'g' : 'm') + '">' + (o.plataforma === 'google' ? 'Google' : 'Meta') + '</span>' +
      '<span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(o.nome || o.key) + '</span></label>';
  }).join('') : '<div class="hint" style="margin-bottom:8px">Nenhuma conta carregada ainda. Busque abaixo.</div>';
  var oc = SAL && SAL.ocupado;
  function chips(p){
    return '<div class="rel-chips">' + REL_MET[p].map(function(m){
      var on = r.metricas[p].indexOf(m.k) > -1;
      return '<button type="button" class="rel-chip' + (on ? ' on' : '') + '" onclick="relRMet(\'' + p + '\',\'' + m.k + '\')">' + (on ? '✓ ' : '') + esc(m.n) + '</button>';
    }).join('') + '</div>';
  }
  modal('Configurar · ' + esc(relNome(r.clienteId)),
    '<div class="fg"><label class="fl">Contas de anúncio do cliente</label>' + contas +
      '<div class="flx mt12" style="gap:6px"><button type="button" class="btn btn-s" onclick="relBusca(\'meta\')"' + (oc ? ' disabled' : '') + '>' + (oc === 'contas' ? 'Buscando...' : 'Buscar contas na Meta') + '</button>' +
      '<button type="button" class="btn btn-s" onclick="relBusca(\'google\')"' + (oc ? ' disabled' : '') + '>' + (oc === 'contasG' ? 'Buscando...' : 'Buscar contas no Google') + '</button></div>' +
      '<div class="hint">O relatório soma as campanhas que rodaram na semana em todas as contas marcadas.</div></div>' +
    '<div class="fg"><label class="fl">Métricas da Meta Ads</label>' + chips('meta') + '</div>' +
    '<div class="fg"><label class="fl">Métricas do Google Ads</label>' + chips('google') +
      '<div class="hint">A ordem você ajusta depois, dentro do relatório, com as setas ↑ ↓.</div></div>' +
    '<div class="fg"><label class="fl">Logo do cliente</label><div class="flx" style="flex-wrap:nowrap">' +
      (r.logo ? '<div class="rel-lg" style="width:64px;height:64px"><img src="' + esc(r.logo) + '" alt=""></div>' : '') +
      '<input type="file" class="fi" accept="image/png,image/jpeg,image/webp,image/svg+xml" onchange="relRLogo(this)">' +
      (r.logo ? '<button type="button" class="btn btn-s btn-d" onclick="REL.r.logo=\'\';mRelConfigRender()">Tirar</button>' : '') + '</div>' +
      '<div class="hint">PNG com fundo transparente fica melhor. Ela aparece num quadrado branco no canto do relatório.</div></div>',
    '<button class="btn btn-d" style="margin-right:auto" onclick="relRemove(\'' + esc(r.clienteId) + '\')">Remover cliente</button>' +
    '<button class="btn" onclick="fecha()">Cancelar</button><button class="btn btn-p" onclick="relRSalva()">Salvar</button>', true);
}
function relRConta(key){
  if(REL.r.contas[key]) delete REL.r.contas[key];
  else{ var o = relContasDisponiveis().filter(function(x){ return x.key === key; })[0]; if(o) REL.r.contas[key] = relContaLimpa(o); }
  mRelConfigRender();
}
/* ligar entra no fim da lista; a ordem se ajusta depois com as setas */
function relRMet(p, k){
  var l = REL.r.metricas[p], i = l.indexOf(k);
  if(i > -1) l.splice(i, 1); else l.push(k);
  mRelConfigRender();
}
function relBusca(p){
  var fn = p === 'google' ? (typeof gglApi === 'function' ? gglApi : null) : (typeof salApi === 'function' ? salApi : null);
  if(!fn) return toast('Recarregue a página (Ctrl + Shift + R)', 'err');
  SAL.ocupado = p === 'google' ? 'contasG' : 'contas'; mRelConfigRender();
  fn('contas').then(function(j){
    if(p === 'google') SAL.contasGoogle = j.contas; else SAL.contasMeta = j.contas;
    SAL.ocupado = ''; mRelConfigRender(); toast(j.contas.length + ' conta(s) encontrada(s)', 'ok');
  }, function(e){ SAL.ocupado = ''; mRelConfigRender(); toast(e.message, 'err'); });
}
/* logo: reduz para no máximo 320px e guarda junto da configuração */
function relRLogo(inp){
  var f = inp.files && inp.files[0];
  if(!f) return;
  if(!/^image\//.test(f.type)) return toast('Escolha uma imagem', 'err');
  var rd = new FileReader();
  rd.onload = function(){
    var im = new Image();
    im.onload = function(){
      var k = Math.min(1, 320 / Math.max(im.width || 320, im.height || 320));
      var cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round((im.width || 320) * k)); cv.height = Math.max(1, Math.round((im.height || 320) * k));
      cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
      REL.r.logo = cv.toDataURL('image/png');
      mRelConfigRender();
    };
    im.onerror = function(){ toast('Não consegui ler essa imagem', 'err'); };
    im.src = rd.result;
  };
  rd.readAsDataURL(f);
}
function relRSalva(){
  var r = REL.r;
  if(!Object.keys(r.contas).length) return toast('Marque pelo menos uma conta de anúncios', 'err');
  if(!r.metricas.meta.length && !r.metricas.google.length) return toast('Escolha pelo menos uma métrica', 'err');
  var mud = { contas: r.contas, metricas: r.metricas, logo: r.logo || '', atualizadoEm: new Date().toISOString(), atualizadoPor: EMAIL || '' };
  Object.assign(REL.cfg[r.clienteId], mud);
  relUpd('clientes/' + r.clienteId, mud);
  fecha(); render();
  toast('Configuração salva', 'ok');
}
function relRemove(id){
  if(!confirm('Tirar ' + relNome(id) + ' dos relatórios?\n\nO card, a configuração e todos os relatórios salvos desse cliente são apagados.')) return;
  delete REL.cfg[id]; delete REL.sem[id];
  del('relatorios/clientes/' + id); del('relatorios/semanas/' + id);
  fecha(); REL.sel = ''; REL.semana = ''; render(); toast('Cliente removido dos relatórios');
}

/* ---------- um relatório ---------- */
function vRelRelatorio(id, ini){
  var c = REL.cfg[id], s = relSem(id, ini);
  var oc = REL.ocupado === 'gerar:' + ini;
  var podeShare = !!(navigator.canShare && window.File);

  var topo = '<button class="bk" onclick="relVoltar()">← Relatórios de ' + esc(relNome(id)) + '</button>' +
    '<div class="hd"><div class="flx" style="flex-wrap:nowrap;gap:12px">' + relLogoHTML(c, id) + '<div><h1>' + esc(relNome(id)) + '</h1>' +
      '<p>' + relPeriodo(ini) + ' · Segunda a Domingo</p></div></div>' +
    '<div class="hd-act"><button class="btn" onclick="relGerar(\'' + esc(id) + '\',\'' + ini + '\')"' + (oc ? ' disabled' : '') + '>' + (oc ? 'Puxando...' : 'Atualizar dados') + '</button>' +
      (s.originais ? (podeShare ? '<button class="btn" onclick="relExporta(\'' + esc(id) + '\', true)">Compartilhar</button>' : '') +
        '<button class="btn btn-p" onclick="relExporta(\'' + esc(id) + '\')">Baixar imagem</button>' : '') +
    '</div></div>';

  var avisos = (s.erros || []).length ? '<div class="note" style="background:var(--coral-dim);border-color:rgba(251,113,133,.35);color:#fda4af">' +
    s.erros.map(esc).join('<br>') + '</div>' : '';
  var info = '<div class="hint mb12">' + (s.origem === 'automatico' ? 'Rascunho automático' : 'Gerado no painel') + ' em ' + dLabel(String(s.geradoEm || '').slice(0, 10)) +
    (s.enviadoEm ? ' · <b style="color:var(--mint)">enviado em ' + dLabel(String(s.enviadoEm).slice(0, 10)) + '</b>' : '') + '</div>';
  if(!s.originais) return topo + avisos + info;

  var edicao = relPlats(c).map(function(p){
    var v = relValores(s, p), ed = ((s.editados || {})[p]) || {}, lista = c.metricas[p];
    return '<div class="tw mb12"><div class="tw-hd"><div class="tw-t"><span class="sal-pf ' + (p === 'google' ? 'g' : 'm') + '">' + (p === 'google' ? 'Google' : 'Meta') + '</span>' + REL_PLAT[p] + '</div></div>' +
      lista.map(function(k, i){
        var m = relMet(p, k);
        if(!m) return '';
        var aj = ed[k] != null;
        return '<div class="rel-ed' + (aj ? ' aj' : '') + '">' +
          '<div class="rel-mv"><button title="Subir" onclick="relMove(\'' + esc(id) + '\',\'' + p + '\',' + i + ',-1)"' + (i ? '' : ' disabled') + '>▲</button>' +
            '<button title="Descer" onclick="relMove(\'' + esc(id) + '\',\'' + p + '\',' + i + ',1)"' + (i < lista.length - 1 ? '' : ' disabled') + '>▼</button></div>' +
          '<div class="rel-n">' + esc(m.n) +
            (aj ? '<div class="rel-o">ajustado · original ' + relFmt(relOriginal(s, p, k), m.f) + '</div>' : (m.calc ? '<div class="sub">calculado</div>' : '')) + '</div>' +
          (aj ? '<button class="btn btn-s" title="Voltar ao original" onclick="relEdita(\'' + esc(id) + '\',\'' + p + '\',\'' + k + '\',null)">↺</button>' : '') +
          '<input class="fi" inputmode="decimal" value="' + esc(relFmtEd(v[k], m.f)) + '" onchange="relEdita(\'' + esc(id) + '\',\'' + p + '\',\'' + k + '\',this.value)"></div>';
      }).join('') + '</div>';
  }).join('');

  setTimeout(function(){ relPreview(id); }, 0);
  return topo + avisos + info +
    '<div class="rel-g"><div><img id="relImg" class="rel-img" alt="Prévia do relatório"></div>' +
    '<div>' + edicao +
      '<div class="tw"><div class="rel-ed"><div class="rel-n"><b>Investimento total da semana</b><div class="sub">soma das plataformas</div></div><b class="mono">' + brl(relTotal(c, s)) + '</b></div></div>' +
      '<div class="hint mt12">▲ ▼ mudam a ordem das métricas (vale para os próximos relatórios deste cliente). Mudou um número? Os que dependem dele se ajustam sozinhos; o ↺ volta ao valor da plataforma.</div>' +
      '<div class="flx mt18" style="justify-content:flex-end"><button class="btn btn-s btn-d" onclick="relExclui(\'' + esc(id) + '\',\'' + ini + '\')">Excluir este relatório</button></div>' +
    '</div></div>';
}
function relEdita(id, p, k, txt){
  var ini = REL.semana;
  var m = relMet(p, k);
  var v = txt == null || String(txt).trim() === '' ? null : n(txt);
  if(v != null && m.f === 'int') v = Math.round(v);
  var o = {}; o['editados/' + p + '/' + k] = v;
  var s = relSem(id, ini);
  if(s){ s.editados = s.editados || {}; s.editados[p] = s.editados[p] || {}; if(v == null) delete s.editados[p][k]; else s.editados[p][k] = v; }
  relUpd('semanas/' + id + '/' + ini, o);
  render();
}
/* muda a posição de uma métrica (a ordem fica salva no cliente) */
function relMove(id, p, i, k){
  var l = REL.cfg[id].metricas[p].slice(), j = i + k;
  if(j < 0 || j >= l.length) return;
  l.splice(j, 0, l.splice(i, 1)[0]);
  REL.cfg[id].metricas[p] = l;
  var o = {}; o['metricas/' + p] = l;
  relUpd('clientes/' + id, o);
  render();
}
function relExclui(id, ini){
  if(!confirm('Excluir o relatório de ' + relPeriodo(ini) + '?\n\nOs ajustes manuais dele também são apagados.')) return;
  if(REL.sem[id]) delete REL.sem[id][ini];
  del('relatorios/semanas/' + id + '/' + ini);
  REL.semana = ''; render(); toast('Relatório excluído');
}

/* ---------- imagem PNG (desenhada direto no canvas) ---------- */
var REL_COR = { fundo: '#0C447C', caixa: '#185FA5', claro: '#B5D4F4', verdeFundo: '#EAF3DE', verdeTexto: '#27500A' };
function relRR(ctx, x, y, w, h, r){
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}
/* diminui a fonte até o texto caber na largura */
function relCabe(ctx, txt, peso, tam, fam, larg, min){
  while(tam > (min || 16)){ ctx.font = peso + ' ' + tam + 'px ' + fam; if(ctx.measureText(txt).width <= larg) break; tam -= 2; }
  ctx.font = peso + ' ' + tam + 'px ' + fam;
  return tam;
}
/* nome da métrica em uma linha; se não couber, quebra em duas */
function relRotulo(ctx, txt, fam, larg){
  ctx.font = '500 24px ' + fam;
  if(ctx.measureText(txt).width <= larg) return [txt];
  var pal = txt.split(' '), melhor = null;
  for(var i = 1; i < pal.length; i++){
    var a = pal.slice(0, i).join(' '), b = pal.slice(i).join(' ');
    var w = Math.max(ctx.measureText(a).width, ctx.measureText(b).width);
    if(!melhor || w < melhor.w) melhor = { l: [a, b], w: w };
  }
  var tam = 24;
  while(tam > 15 && melhor && melhor.l.some(function(t){ ctx.font = '500 ' + tam + 'px ' + fam; return ctx.measureText(t).width > larg; })) tam -= 1;
  ctx.font = '500 ' + tam + 'px ' + fam;
  return melhor ? melhor.l : [txt];
}
function relImg(src){
  return new Promise(function(ok){ if(!src) return ok(null); var im = new Image(); im.onload = function(){ ok(im); }; im.onerror = function(){ ok(null); }; im.src = src; });
}
function relDesenha(id, ini){
  var c = REL.cfg[id], s = relSem(id, ini);
  var DISP = "'Space Grotesk', sans-serif", CORPO = "'Plus Jakarta Sans', sans-serif";
  var fontes = document.fonts && document.fonts.load ? Promise.all([
    document.fonts.load('700 40px "Space Grotesk"'), document.fonts.load('500 24px "Plus Jakarta Sans"'), document.fonts.load('700 24px "Plus Jakarta Sans"')
  ]).catch(function(){}) : Promise.resolve();
  return Promise.all([fontes, relImg(c.logo)]).then(function(r){
    var logo = r[1];
    var W = 1080, P = 72, G = 20, COLS = 3, BW = (W - 2 * P - G * (COLS - 1)) / COLS, BH = 176;
    var plats = relPlats(c);
    var H = P + 200;
    plats.forEach(function(p){ H += 52 + 22 + Math.ceil(c.metricas[p].length / COLS) * (BH + G) + 26; });
    H += 130 + P;

    var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = REL_COR.fundo; ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = 'alphabetic';

    /* cabeçalho */
    var LOGO = 150, largTexto = W - 2 * P - (logo ? LOGO + 30 : 0);
    ctx.fillStyle = REL_COR.claro; ctx.font = '500 26px ' + CORPO;
    ctx.fillText('2STEP · Relatório Semanal', P, P + 26);
    ctx.fillStyle = '#FFFFFF'; relCabe(ctx, relNome(id), '700', 58, DISP, largTexto, 30);
    ctx.fillText(relNome(id), P, P + 100);
    ctx.fillStyle = REL_COR.claro; relCabe(ctx, relPeriodo(ini) + ' · Segunda a Domingo', '500', 28, CORPO, largTexto, 18);
    ctx.fillText(relPeriodo(ini) + ' · Segunda a Domingo', P, P + 148);
    if(logo){
      var lx = W - P - LOGO, ly = P;
      ctx.fillStyle = '#FFFFFF'; relRR(ctx, lx, ly, LOGO, LOGO, 28); ctx.fill();
      var k = Math.min((LOGO - 28) / logo.width, (LOGO - 28) / logo.height);
      ctx.drawImage(logo, lx + (LOGO - logo.width * k) / 2, ly + (LOGO - logo.height * k) / 2, logo.width * k, logo.height * k);
    }
    var y = P + 200;

    /* blocos por plataforma */
    plats.forEach(function(p){
      ctx.font = '700 26px ' + CORPO;
      var partes = p === 'google'
        ? [['G', '#4285F4'], ['o', '#EA4335'], ['o', '#FBBC05'], ['g', '#4285F4'], ['l', '#34A853'], ['e', '#EA4335'], [' Ads', '#5F6368']]
        : [['Meta Ads', '#0866FF']];
      var largPill = partes.reduce(function(a, t){ return a + ctx.measureText(t[0]).width; }, 0) + 44;
      ctx.fillStyle = '#FFFFFF'; relRR(ctx, P, y, largPill, 52, 26); ctx.fill();
      var tx = P + 22;
      partes.forEach(function(t){ ctx.fillStyle = t[1]; ctx.fillText(t[0], tx, y + 35); tx += ctx.measureText(t[0]).width; });
      y += 52 + 22;

      var v = relValores(s, p);
      c.metricas[p].forEach(function(k, i){
        var m = relMet(p, k);
        if(!m) return;
        var bx = P + (i % COLS) * (BW + G), by = y + Math.floor(i / COLS) * (BH + G);
        ctx.fillStyle = REL_COR.caixa; relRR(ctx, bx, by, BW, BH, 22); ctx.fill();
        ctx.fillStyle = REL_COR.claro;
        relRotulo(ctx, m.n, CORPO, BW - 44).forEach(function(t, li){ ctx.fillText(t, bx + 22, by + 44 + li * 28); });
        var val = relFmt(v[k], m.f);
        ctx.fillStyle = '#FFFFFF'; relCabe(ctx, val, '700', 46, DISP, BW - 44, 22);
        ctx.fillText(val, bx + 22, by + 144);
      });
      y += Math.ceil(c.metricas[p].length / COLS) * (BH + G) + 26;
    });

    /* total */
    ctx.fillStyle = REL_COR.verdeFundo; relRR(ctx, P, y, W - 2 * P, 130, 24); ctx.fill();
    var tot = brl(relTotal(c, s));
    ctx.fillStyle = REL_COR.verdeTexto; ctx.font = '700 56px ' + DISP;
    var wTot = ctx.measureText(tot).width;
    ctx.fillText(tot, W - P - 32 - wTot, y + 85);
    relCabe(ctx, 'Investimento total da semana', '500', 28, CORPO, W - 2 * P - 64 - wTot - 24, 18);
    ctx.fillText('Investimento total da semana', P + 32, y + 76);
    return cv;
  });
}
function relPreview(id){
  if(!$('relImg')) return;
  relDesenha(id, REL.semana).then(function(cv){ var el = $('relImg'); if(el) el.src = cv.toDataURL('image/png'); });
}
function relExporta(id, compartilhar){
  var ini = REL.semana;
  var nome = 'relatorio-' + relNome(id).normalize('NFD').replace(/[^\w]+/g, '-').replace(/-+/g, '-').toLowerCase().replace(/^-|-$/g, '') + '-' + ini + '.png';
  relDesenha(id, ini).then(function(cv){
    cv.toBlob(function(b){
      var arq = new File([b], nome, { type: 'image/png' });
      var marca = function(){ relUpd('semanas/' + id + '/' + ini, { enviadoEm: new Date().toISOString() }); };
      if(compartilhar && navigator.canShare && navigator.canShare({ files: [arq] })){
        navigator.share({ files: [arq], title: 'Relatório ' + relNome(id) }).then(marca, function(){});
        return;
      }
      var a = document.createElement('a');
      a.href = URL.createObjectURL(b); a.download = nome;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function(){ URL.revokeObjectURL(a.href); }, 4000);
      marca();
      toast('Imagem baixada', 'ok');
    }, 'image/png');
  });
}

/* ---------- demonstração (sem Firebase) ---------- */
function relDemoSemana(id, ini, origem){
  var r = function(a, b){ return Math.round(a + Math.random() * (b - a)); };
  (REL.sem[id] = REL.sem[id] || {})[ini] = {
    inicio: ini, fim: addDias(ini, 6), geradoEm: new Date().toISOString(), origem: origem, erros: [],
    originais: {
      meta: { invest: r(800, 1600) + 0.37, conversas: r(30, 70), leads: r(5, 25), alcance: r(12000, 24000), visitasPerfil: r(600, 1500), cliquesLink: r(400, 900),
              cliquesSaida: r(350, 800), cliques: r(1200, 2400), impressoes: r(40000, 80000), compras: 0, valorCompras: 0, engajamento: r(2000, 5000), thruplay: r(1000, 4000) },
      google: { invest: r(400, 900) + 0.5, cliques: r(300, 700), ligacoes: r(10, 40), impressoes: r(6000, 12000), conversoes: r(15, 40) }
    }
  };
}
function relDemo(){
  var cs = listaClientes().filter(function(c){ return c.status !== 'encerrado'; }).slice(0, 2);
  if(cs.length < 2) return;
  var sp = relSemanaPassada();
  REL.cfg[cs[0].id] = { clienteId: cs[0].id, contas: { act_1: { plataforma: 'meta', id: 'act_1', nome: 'Conta Meta' }, g_1: { plataforma: 'google', googleId: '1112223333', nome: 'Conta Google' } },
    metricas: { meta: REL_PADRAO.meta.slice(), google: REL_PADRAO.google.slice() }, logo: '' };
  REL.cfg[cs[1].id] = { clienteId: cs[1].id, contas: {}, metricas: { meta: REL_PADRAO.meta.slice(), google: REL_PADRAO.google.slice() }, logo: '' };
  relDemoSemana(cs[0].id, sp, 'automatico');
  relDemoSemana(cs[0].id, addDias(sp, -7), 'manual');
  REL.sem[cs[0].id][addDias(sp, -7)].enviadoEm = new Date().toISOString();
}

/* ---------- registro no menu: Operacional › Relatórios ---------- */
(function(){
  var m = MODULOS.filter(function(x){ return x.id === 'mid'; })[0];
  if(m) m.telas.push({ v:'rel', n:'Relatórios', f:function(){ return vRel(); }, badge:function(){
    relLiga();
    var sp = relSemanaPassada();
    return Object.keys(REL.cfg).filter(function(id){ var s = relSem(id, sp); return s && s.originais && !s.enviadoEm; }).length;
  } });
})();
