/* ============================================================
   2STEP · RELATÓRIOS SEMANAIS (tela)
   Um card por cliente. Dentro dele: a semana fechada (segunda a
   domingo), as métricas da Meta e do Google editáveis e a imagem
   PNG pronta para mandar no WhatsApp. Só para a equipe (admin e
   operação); o cliente recebe só a imagem.
   Depende de app.js (S, DB, MEM, EMAIL, ROOT, MODULOS, ouve, save,
   del, render, modal, fecha, esc, n, brl, dLabel, toast,
   listaClientes, $), de saldo.js (SAL, salLiga, salApi, salIdGoogle)
   e de google.js (gglApi).
   Dados: 2step_financeiro/relatorios (clientes e semanas).
   A busca das métricas é feita no servidor (api/relatorios.js).
   ============================================================ */

var REL = { cfg: {}, sem: {}, ligado: false, sel: '', semana: '', ocupado: '', r: null };

/* catálogo de métricas, na ordem em que aparecem no relatório.
   calc: métricas que saem das outras (se você ajustar a base, elas acompanham) */
function relDiv(a, b, k){ return b ? a / b * (k || 1) : null; }
var REL_MET = {
  meta: [
    { k:'invest',        n:'Investimento',           f:'brl' },
    { k:'conversas',     n:'Conversas no WhatsApp',  f:'int' },
    { k:'custoConversa', n:'Custo por conversa',     f:'brl', calc:function(v){ return relDiv(v.invest, v.conversas); } },
    { k:'alcance',       n:'Alcance',                f:'int' },
    { k:'visitasPerfil', n:'Visitas ao perfil',      f:'int' },
    { k:'cliquesLink',   n:'Cliques no link',        f:'int' },
    { k:'impressoes',    n:'Impressões',             f:'int' },
    { k:'frequencia',    n:'Frequência',             f:'dec', calc:function(v){ return relDiv(v.impressoes, v.alcance); } },
    { k:'ctr',           n:'CTR',                    f:'pct', calc:function(v){ return relDiv(v.cliquesLink, v.impressoes, 100); } },
    { k:'cpc',           n:'Custo por clique',       f:'brl', calc:function(v){ return relDiv(v.invest, v.cliquesLink); } },
    { k:'cpm',           n:'CPM',                    f:'brl', calc:function(v){ return relDiv(v.invest, v.impressoes, 1000); } },
    { k:'leads',         n:'Leads (formulário)',     f:'int' },
    { k:'custoLead',     n:'Custo por lead',         f:'brl', calc:function(v){ return relDiv(v.invest, v.leads); } },
    { k:'compras',       n:'Compras',                f:'int' },
    { k:'valorCompras',  n:'Valor em compras',       f:'brl' },
    { k:'roas',          n:'ROAS',                   f:'x',   calc:function(v){ return relDiv(v.valorCompras, v.invest); } },
    { k:'engajamento',   n:'Engajamento',            f:'int' },
    { k:'thruplay',      n:'Visualizações de vídeo', f:'int' }
  ],
  google: [
    { k:'invest',         n:'Investimento',          f:'brl' },
    { k:'cliques',        n:'Cliques',               f:'int' },
    { k:'ligacoes',       n:'Ligações',              f:'int' },
    { k:'impressoes',     n:'Impressões',            f:'int' },
    { k:'ctr',            n:'CTR',                   f:'pct', calc:function(v){ return relDiv(v.cliques, v.impressoes, 100); } },
    { k:'cpc',            n:'Custo por clique',      f:'brl', calc:function(v){ return relDiv(v.invest, v.cliques); } },
    { k:'conversoes',     n:'Conversões',            f:'dec' },
    { k:'custoConversao', n:'Custo por conversão',   f:'brl', calc:function(v){ return relDiv(v.invest, v.conversoes); } },
    { k:'taxaConversao',  n:'Taxa de conversão',     f:'pct', calc:function(v){ return relDiv(v.conversoes, v.cliques, 100); } }
  ]
};
var REL_PADRAO = { meta: ['invest', 'conversas', 'custoConversa', 'alcance', 'visitasPerfil', 'cliquesLink'], google: ['invest', 'cliques', 'ligacoes'] };
var REL_PLAT = { meta: 'Meta Ads', google: 'Google Ads' };

/* estilos só deste módulo */
(function(){
  var css = '' +
  '.rel-g{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:12px;align-items:start}' +
  '.rel-img{width:100%;display:block;border-radius:12px;background:#0C447C;min-height:200px}' +
  '.rel-ed{display:flex;align-items:center;gap:10px;padding:9px 14px;border-bottom:1px solid var(--line)}' +
  '.rel-ed:last-child{border-bottom:none}' +
  '.rel-ed .fi{width:130px;padding:7px 10px;text-align:right;font-family:var(--mono)}' +
  '.rel-ed.aj .fi{border-color:var(--amber)}' +
  '.rel-n{flex:1;min-width:0;font-size:13px}' +
  '.rel-o{font-size:11px;color:var(--amber);margin-top:2px}' +
  '.rel-chips{display:flex;flex-wrap:wrap;gap:6px}' +
  '.rel-chip{padding:6px 11px;border-radius:20px;border:1px solid var(--line);background:var(--slab2);font-size:12.5px;color:var(--mute)}' +
  '.rel-chip.on{border-color:var(--volt);background:var(--volt-dim);color:var(--ink)}' +
  '.rel-lg{width:44px;height:44px;border-radius:10px;background:#fff;display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0}' +
  '.rel-lg img{max-width:84%;max-height:84%}' +
  '.rel-ini{background:var(--slab3);color:var(--ink);font-family:var(--disp);font-weight:700;font-size:15px}' +
  '@media(max-width:820px){.rel-g{grid-template-columns:1fr}.rel-ed .fi{width:110px}}';
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
function relPlats(c){
  var cs = Object.keys(c.contas || {}).map(function(k){ return c.contas[k]; });
  return ['meta', 'google'].filter(function(p){
    return cs.some(function(x){ return (x.plataforma === 'google' ? 'google' : 'meta') === p; }) && ((c.metricas || {})[p] || []).length;
  });
}
/* valor de cada métrica: ajuste manual > cálculo > o que veio da plataforma */
function relValores(s, plat){
  var base = Object.assign({}, ((s || {}).originais || {})[plat] || {});
  var ed = (((s || {}).editados || {})[plat]) || {};
  REL_MET[plat].forEach(function(m){ if(!m.calc && ed[m.k] != null) base[m.k] = ed[m.k]; });
  var out = {};
  REL_MET[plat].forEach(function(m){
    out[m.k] = ed[m.k] != null ? ed[m.k] : (m.calc ? m.calc(base) : (base[m.k] != null ? base[m.k] : null));
  });
  return out;
}
function relOriginal(s, plat, k){
  var m = REL_MET[plat].filter(function(x){ return x.k === k; })[0];
  var o = ((s || {}).originais || {})[plat] || {};
  return m.calc ? m.calc(o) : (o[k] != null ? o[k] : null);
}
function relTotal(c, s){
  return relPlats(c).reduce(function(a, p){ return a + (Number(relValores(s, p).invest) || 0); }, 0);
}
function relFmt(v, f){
  if(v == null || isNaN(v)) return '—';
  if(f === 'brl') return brl(v);
  if(f === 'int') return Math.round(v).toLocaleString('pt-BR');
  var t = Number(v).toLocaleString('pt-BR', { minimumFractionDigits: f === 'dec' ? 2 : 0, maximumFractionDigits: 2 });
  return f === 'pct' ? t + '%' : (f === 'x' ? t + 'x' : t);
}
function relFmtEd(v, f){
  if(v == null || isNaN(v)) return '';
  return f === 'int' ? Math.round(v).toLocaleString('pt-BR') : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
/* grava só os campos passados (os ajustes nunca se perdem quando os dados são puxados de novo) */
function relUpd(caminho, obj){
  if(MEM || !DB){
    var partes = caminho.split('/'), alvo = REL;
    var raiz = partes.shift() === 'semanas' ? (REL.sem) : (REL.cfg);
    alvo = raiz;
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
  ini = ini || REL.semana || relSemanaPassada();
  if(MEM){ relDemoSemana(id, ini, 'manual'); toast('Demonstração: números de exemplo', 'ok'); return; }
  if(!AUTH || !AUTH.currentUser) return toast('Faça login de novo', 'err');
  REL.ocupado = 'gerar'; render();
  AUTH.currentUser.getIdToken().then(function(tk){
    return fetch('/api/relatorios?acao=gerar&cliente=' + encodeURIComponent(id) + '&semana=' + ini, { method: 'POST', headers: { Authorization: 'Bearer ' + tk } });
  }).then(function(r){
    return r.json().catch(function(){ throw new Error(r.status === 404 ? 'A função de relatórios ainda não está publicada na Vercel' : 'Resposta inválida do servidor (' + r.status + ')'); });
  }).then(function(j){
    REL.ocupado = '';
    if(!j.ok) throw new Error(j.erro || 'Erro no servidor');
    (REL.sem[id] = REL.sem[id] || {})[ini] = j.relatorio;
    render();
    toast((j.relatorio.erros || []).length ? 'Gerado com avisos: confira abaixo' : 'Métricas atualizadas', (j.relatorio.erros || []).length ? 'err' : 'ok');
  }).catch(function(e){ REL.ocupado = ''; render(); toast(e.message, 'err'); });
}

/* ---------- navegação ---------- */
function relAbrir(id){ REL.sel = id; REL.semana = relSemanaPassada(); render(); window.scrollTo(0, 0); }
function relVoltar(){ REL.sel = ''; render(); }
function relSemanaVai(k){
  var nova = addDias(REL.semana, 7 * k);
  if(nova > relSemanaPassada()) return;
  REL.semana = nova; render();
}
function vRel(){
  relLiga();
  if(typeof salLiga === 'function') salLiga();
  return REL.sel && REL.cfg[REL.sel] ? vRelCliente(REL.sel) : vRelLista();
}

/* ---------- lista ---------- */
function relLogoHTML(c, id){
  return c.logo ? '<div class="rel-lg"><img src="' + esc(c.logo) + '" alt=""></div>'
    : '<div class="rel-lg rel-ini">' + esc(relNome(id).slice(0, 2).toUpperCase()) + '</div>';
}
function vRelLista(){
  var sp = relSemanaPassada();
  var ids = Object.keys(REL.cfg).filter(function(k){ return REL.cfg[k]; })
    .sort(function(a, b){ return relNome(a).localeCompare(relNome(b), 'pt-BR'); });
  var prontos = 0;
  var cards = ids.map(function(id){
    var c = REL.cfg[id], s = relSem(id, sp);
    var st;
    if(!s) st = '<span class="pill p-off">ainda não gerado</span>';
    else if(!s.originais && (s.erros || []).length) st = '<span class="pill p-cr">erro ao gerar</span>';
    else if(s.enviadoEm) st = '<span class="pill p-on">enviado</span>';
    else { st = '<span class="pill p-av">pronto para revisar</span>'; prontos++; }
    return '<button class="pc" onclick="relAbrir(\'' + esc(id) + '\')">' +
      '<div class="flx" style="flex-wrap:nowrap;gap:11px">' + relLogoHTML(c, id) +
        '<div style="min-width:0"><div class="pc-n" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(relNome(id)) + '</div>' +
        '<div class="pc-s">' + relPlats(c).map(function(p){ return REL_PLAT[p]; }).join(' + ') + '</div></div></div>' +
      '<div class="flx mt12" style="gap:6px">' + st + '</div>' +
      '<div class="pc-v">' + (s && s.originais ? brl(relTotal(c, s)) : '—') + '</div>' +
      '<div class="sub">investimento de ' + relPeriodo(sp) + '</div></button>';
  }).join('');

  return '' +
  '<div class="hd"><div><h1>Relatórios</h1><p>Semana de ' + relPeriodo(sp) + ' (Segunda a Domingo). Os rascunhos ficam prontos toda segunda às 7h.</p></div>' +
  '<div class="hd-act"><button class="btn btn-p" onclick="mRelConfig()">+ Adicionar cliente</button></div></div>' +
  (MEM ? '<div class="note">Demonstração: os números são de exemplo.</div>' : '') +
  (prontos ? '<div class="note" style="background:var(--volt-dim);border-color:rgba(124,92,255,.35);color:#c4b5fd">' + prontos + ' relatório(s) pronto(s) para revisar.</div>' : '') +
  (cards ? '<div class="pg">' + cards + '</div>' :
    '<div class="tw"><div class="empty"><b>Nenhum cliente nos relatórios</b>Clique em <b style="display:inline;font-size:13px">+ Adicionar cliente</b>, escolha as contas de anúncio e as métricas.</div></div>');
}

/* ---------- configuração do cliente ---------- */
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
function mRelConfig(id){
  var c = id ? REL.cfg[id] : null;
  REL.r = {
    clienteId: id || '', novo: !id,
    contas: JSON.parse(JSON.stringify((c && c.contas) || {})),
    metricas: { meta: ((c && c.metricas && c.metricas.meta) || REL_PADRAO.meta).slice(), google: ((c && c.metricas && c.metricas.google) || REL_PADRAO.google).slice() },
    logo: (c && c.logo) || ''
  };
  mRelConfigRender();
}
function mRelConfigRender(){
  var r = REL.r;
  var cs = listaClientes().filter(function(x){ return x.status !== 'encerrado' && (!REL.cfg[x.id] || x.id === r.clienteId); })
    .sort(function(a, b){ return String(a.nome).localeCompare(String(b.nome), 'pt-BR'); });
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
  modal(r.novo ? 'Adicionar cliente aos relatórios' : 'Configurar · ' + esc(relNome(r.clienteId)),
    (r.novo ? '<div class="fg"><label class="fl">Cliente</label><select class="fi" onchange="relRCliente(this.value)"><option value="">Escolha o cliente</option>' +
      cs.map(function(x){ return '<option value="' + esc(x.id) + '"' + (x.id === r.clienteId ? ' selected' : '') + '>' + esc(x.nome) + '</option>'; }).join('') + '</select></div>' : '') +
    '<div class="fg"><label class="fl">Contas de anúncio do cliente</label>' + contas +
      '<div class="flx mt12" style="gap:6px"><button type="button" class="btn btn-s" onclick="relBusca(\'meta\')"' + (oc ? ' disabled' : '') + '>' + (oc === 'contas' ? 'Buscando...' : 'Buscar contas na Meta') + '</button>' +
      '<button type="button" class="btn btn-s" onclick="relBusca(\'google\')"' + (oc ? ' disabled' : '') + '>' + (oc === 'contasG' ? 'Buscando...' : 'Buscar contas no Google') + '</button></div>' +
      '<div class="hint">O relatório soma as campanhas que rodaram na semana em todas as contas marcadas.</div></div>' +
    '<div class="fg"><label class="fl">Métricas da Meta Ads</label>' + chips('meta') + '</div>' +
    '<div class="fg"><label class="fl">Métricas do Google Ads</label>' + chips('google') +
      '<div class="hint">Aparecem na imagem na ordem desta lista. Só entram as plataformas que têm conta marcada.</div></div>' +
    '<div class="fg"><label class="fl">Logo do cliente</label><div class="flx" style="flex-wrap:nowrap">' +
      (r.logo ? '<div class="rel-lg" style="width:64px;height:64px"><img src="' + esc(r.logo) + '" alt=""></div>' : '') +
      '<input type="file" class="fi" accept="image/png,image/jpeg,image/webp,image/svg+xml" onchange="relRLogo(this)">' +
      (r.logo ? '<button type="button" class="btn btn-s btn-d" onclick="REL.r.logo=\'\';mRelConfigRender()">Tirar</button>' : '') + '</div>' +
      '<div class="hint">PNG com fundo transparente fica melhor. Ela aparece num quadrado branco no canto do relatório.</div></div>',
    (!r.novo ? '<button class="btn btn-d" style="margin-right:auto" onclick="relRemove(\'' + esc(r.clienteId) + '\')">Remover</button>' : '') +
    '<button class="btn" onclick="fecha()">Cancelar</button><button class="btn btn-p" onclick="relRSalva()">Salvar</button>', true);
}
function relRCliente(id){
  REL.r.clienteId = id;
  /* já marca as contas desse cliente que estão no Saldo Ads */
  if(!Object.keys(REL.r.contas).length) relContasDisponiveis().forEach(function(o){ if(o.clienteId === id) REL.r.contas[o.key] = relContaLimpa(o); });
  mRelConfigRender();
}
function relContaLimpa(o){
  return o.plataforma === 'google' ? { plataforma: 'google', googleId: o.googleId, gerente: o.gerente || '', nome: o.nome || '' }
                                   : { plataforma: 'meta', id: o.id, nome: o.nome || '' };
}
function relRConta(key){
  if(REL.r.contas[key]) delete REL.r.contas[key];
  else{ var o = relContasDisponiveis().filter(function(x){ return x.key === key; })[0]; if(o) REL.r.contas[key] = relContaLimpa(o); }
  mRelConfigRender();
}
function relRMet(p, k){
  var l = REL.r.metricas[p], i = l.indexOf(k);
  if(i > -1) l.splice(i, 1); else l.push(k);
  /* mantém a ordem do catálogo */
  REL.r.metricas[p] = REL_MET[p].map(function(m){ return m.k; }).filter(function(x){ return l.indexOf(x) > -1; });
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
  if(!r.clienteId) return toast('Escolha o cliente', 'err');
  if(!Object.keys(r.contas).length) return toast('Marque pelo menos uma conta de anúncios', 'err');
  if(!r.metricas.meta.length && !r.metricas.google.length) return toast('Escolha pelo menos uma métrica', 'err');
  var c = { clienteId: r.clienteId, contas: r.contas, metricas: r.metricas, logo: r.logo || '', atualizadoEm: new Date().toISOString(), atualizadoPor: EMAIL || '' };
  REL.cfg[r.clienteId] = c;
  save('relatorios/clientes/' + r.clienteId, c);
  fecha();
  var novo = r.novo;
  relAbrir(r.clienteId);
  toast('Configuração salva', 'ok');
  if(novo && !relSem(r.clienteId, relSemanaPassada())) setTimeout(function(){ relGerar(r.clienteId, relSemanaPassada()); }, 300);
}
function relRemove(id){
  if(!confirm('Tirar ' + relNome(id) + ' dos relatórios?\n\nA configuração e os relatórios salvos desse cliente são apagados.')) return;
  delete REL.cfg[id]; delete REL.sem[id];
  del('relatorios/clientes/' + id); del('relatorios/semanas/' + id);
  fecha(); REL.sel = ''; render(); toast('Cliente removido dos relatórios');
}

/* ---------- relatório de um cliente ---------- */
function vRelCliente(id){
  var c = REL.cfg[id], ini = REL.semana || relSemanaPassada(), s = relSem(id, ini);
  var temProx = addDias(ini, 7) <= relSemanaPassada();
  var oc = REL.ocupado === 'gerar';
  var podeShare = !!(navigator.canShare && window.File);

  var topo = '<button class="bk" onclick="relVoltar()">← Todos os relatórios</button>' +
    '<div class="hd"><div class="flx" style="flex-wrap:nowrap;gap:12px">' + relLogoHTML(c, id) + '<div><h1>' + esc(relNome(id)) + '</h1>' +
      '<p><span style="cursor:pointer;padding:0 6px" onclick="relSemanaVai(-1)">‹</span>' + relPeriodo(ini) + ' · Segunda a Domingo' +
      '<span style="cursor:pointer;padding:0 6px;' + (temProx ? '' : 'opacity:.25') + '" onclick="relSemanaVai(1)">›</span></p></div></div>' +
    '<div class="hd-act"><button class="btn" onclick="mRelConfig(\'' + esc(id) + '\')">Configurar</button>' +
      (s ? '<button class="btn" onclick="relGerar(\'' + esc(id) + '\')"' + (oc ? ' disabled' : '') + '>' + (oc ? 'Puxando...' : 'Atualizar dados') + '</button>' : '') +
      (s && s.originais ? (podeShare ? '<button class="btn" onclick="relExporta(\'' + esc(id) + '\', true)">Compartilhar</button>' : '') +
        '<button class="btn btn-p" onclick="relExporta(\'' + esc(id) + '\')">Baixar imagem</button>' : '') +
    '</div></div>';

  if(!s) return topo + '<div class="tw"><div class="empty"><b>Relatório desta semana ainda não gerado</b>' +
    'O rascunho sai sozinho na segunda às 7h, ou puxe agora.<div class="mt18"><button class="btn btn-p" onclick="relGerar(\'' + esc(id) + '\')"' + (oc ? ' disabled' : '') + '>' +
    (oc ? 'Puxando as métricas...' : 'Gerar relatório') + '</button></div></div></div>';

  var avisos = (s.erros || []).length ? '<div class="note" style="background:var(--coral-dim);border-color:rgba(251,113,133,.35);color:#fda4af">' +
    s.erros.map(esc).join('<br>') + '</div>' : '';
  var info = '<div class="hint mb12">' + (s.origem === 'automatico' ? 'Rascunho automático' : 'Puxado no painel') + ' em ' + dLabel(String(s.geradoEm).slice(0, 10)) +
    (s.enviadoEm ? ' · <b style="color:var(--mint)">enviado em ' + dLabel(String(s.enviadoEm).slice(0, 10)) + '</b>' : '') + '</div>';

  var edicao = relPlats(c).map(function(p){
    var v = relValores(s, p), ed = ((s.editados || {})[p]) || {};
    return '<div class="tw mb12"><div class="tw-hd"><div class="tw-t"><span class="sal-pf ' + (p === 'google' ? 'g' : 'm') + '">' + (p === 'google' ? 'Google' : 'Meta') + '</span>' + REL_PLAT[p] + '</div></div>' +
      c.metricas[p].map(function(k){
        var m = REL_MET[p].filter(function(x){ return x.k === k; })[0];
        if(!m) return '';
        var aj = ed[k] != null;
        return '<div class="rel-ed' + (aj ? ' aj' : '') + '"><div class="rel-n">' + esc(m.n) +
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
      '<div class="hint mt12">Mudou um número? Os que dependem dele (custos, CTR) se ajustam sozinhos. O ↺ volta ao valor da plataforma.</div>' +
    '</div></div>';
}
function relEdita(id, p, k, txt){
  var ini = REL.semana || relSemanaPassada();
  var m = REL_MET[p].filter(function(x){ return x.k === k; })[0];
  var v = txt == null || String(txt).trim() === '' ? null : n(txt);
  if(v != null && m.f === 'int') v = Math.round(v);
  var o = {}; o['editados/' + p + '/' + k] = v;
  var s = relSem(id, ini);
  if(s){ s.editados = s.editados || {}; s.editados[p] = s.editados[p] || {}; if(v == null) delete s.editados[p][k]; else s.editados[p][k] = v; }
  relUpd('semanas/' + id + '/' + ini, o);
  render();
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
    var W = 1080, P = 72, G = 20, COLS = 3, BW = (W - 2 * P - G * (COLS - 1)) / COLS, BH = 160;
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
        var m = REL_MET[p].filter(function(x){ return x.k === k; })[0];
        if(!m) return;
        var bx = P + (i % COLS) * (BW + G), by = y + Math.floor(i / COLS) * (BH + G);
        ctx.fillStyle = REL_COR.caixa; relRR(ctx, bx, by, BW, BH, 22); ctx.fill();
        ctx.fillStyle = REL_COR.claro; relCabe(ctx, m.n, '500', 24, CORPO, BW - 44, 16);
        ctx.fillText(m.n, bx + 22, by + 48);
        var val = relFmt(v[k], m.f);
        ctx.fillStyle = '#FFFFFF'; relCabe(ctx, val, '700', 46, DISP, BW - 44, 22);
        ctx.fillText(val, bx + 22, by + 118);
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
  var img = $('relImg');
  if(!img) return;
  var ini = REL.semana || relSemanaPassada();
  relDesenha(id, ini).then(function(cv){ var el = $('relImg'); if(el) el.src = cv.toDataURL('image/png'); });
}
function relExporta(id, compartilhar){
  var ini = REL.semana || relSemanaPassada();
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
      meta: { invest: r(800, 1600) + 0.37, conversas: r(60, 120), alcance: r(12000, 24000), visitasPerfil: r(600, 1500), cliquesLink: r(400, 900),
              impressoes: r(30000, 60000), leads: r(10, 40), compras: 0, valorCompras: 0, engajamento: r(2000, 5000), thruplay: r(1000, 4000) },
      google: { invest: r(400, 900) + 0.5, cliques: r(300, 700), ligacoes: r(10, 40), impressoes: r(6000, 12000), conversoes: r(15, 40) }
    }
  };
  render();
}
function relDemo(){
  var cs = listaClientes().filter(function(c){ return c.status !== 'encerrado'; }).slice(0, 2);
  if(cs.length < 2) return;
  var sp = relSemanaPassada();
  REL.cfg[cs[0].id] = { clienteId: cs[0].id, contas: { act_1: { plataforma: 'meta', id: 'act_1', nome: 'Conta Meta' }, g_1: { plataforma: 'google', googleId: '1112223333', nome: 'Conta Google' } },
    metricas: { meta: REL_PADRAO.meta.slice(), google: REL_PADRAO.google.slice() }, logo: '' };
  REL.cfg[cs[1].id] = { clienteId: cs[1].id, contas: { act_2: { plataforma: 'meta', id: 'act_2', nome: 'Conta Meta' } },
    metricas: { meta: ['invest', 'conversas', 'custoConversa'], google: [] }, logo: '' };
  relDemoSemana(cs[0].id, sp, 'automatico');
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
