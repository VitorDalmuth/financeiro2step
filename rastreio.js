/* ============================================================
   2STEP · RASTREIO (telas)
   Rastreamento de leads de WhatsApp por cliente: de qual anúncio ou
   link cada conversa veio, jornada de compra, conversões enviadas,
   links rastreáveis, webhooks, acessos e informações do cliente.
   Organização igual à ferramenta que a equipe já usa: escolhe-se o
   cliente no topo e todas as telas passam a ser daquele cliente.
   Os dados vêm do MOTOR (servidor próprio, RAS.base), com o mesmo
   login do Firebase deste app. Nada daqui grava no Realtime Database.
   Depende de app.js (S, AUTH, PAPEL, VIEW, MODULOS, render, modal,
   fecha, esc, toast, brl, nf, listaClientes, euSouAdmin, go, $).
   ============================================================ */

var RAS = {
  base: 'https://motor.2stepmidia.com',
  cliente: '', de: '', ate: '', origem: '', ver: 'venda', seg: false,
  lf: { origem: '', etapa: '', q: '', aguardando: '', ordenar: 'ultima', modo: 'lista', lote: false, sel: {}, de: '', ate: '', campo: 'primeiro' },
  pagina: 1, cache: {}, pendentes: {}, qrTimer: null, qrId: 0
};
var RAS_TTL = 25000;
var RAS_ORIGEM = {
  meta_ctwa:    { n: 'Meta Ads',       s: 'Via Campanha de Mensagem', g: 'meta' },
  meta_link:    { n: 'Meta Ads',       s: 'Via Link Rastreável',      g: 'meta' },
  google:       { n: 'Google Ads',     s: 'Via Link / Mensagem',      g: 'google' },
  link:         { n: 'Outras Origens', s: 'Via Link Rastreável',      g: 'outras' },
  organico:     { n: 'Não rastreada',  s: '',                         g: 'nao' },
  ativo:        { n: 'Não rastreada',  s: 'A empresa iniciou',        g: 'nao' },
  desconhecido: { n: 'Não rastreada',  s: '',                         g: 'nao' }
};
var RAS_GRUPO = { meta: { n: 'Meta Ads', c: 'p-cy', cor: 'var(--cyan)' }, google: { n: 'Google Ads', c: 'p-av', cor: 'var(--amber)' }, outras: { n: 'Outras Origens', c: 'p-vl', cor: 'var(--volt)' }, nao: { n: 'Não Rastreada', c: 'p-off', cor: 'var(--mute2)' } };
var RAS_ESTADO = { open: { n: 'WhatsApp Conectado', c: 'p-on' }, connecting: { n: 'Aguardando QR', c: 'p-av' }, close: { n: 'WhatsApp Desconectado', c: 'p-cr' }, inexistente: { n: 'Removida no servidor', c: 'p-cr' }, desconhecido: { n: 'Verificando…', c: 'p-off' } };
var RAS_TIPO_ETAPA = { contato: 'Primeiro contato', intermediaria: 'Etapa', venda: 'Venda', perdido: 'Perdido' };
var RAS_EVENTOS_META = [
  ['Contact', 'Um contato entre o cliente e a empresa: ligação, mensagem, chat.'],
  ['Lead', 'O cliente deixa informações e aceita ser contatado depois.'],
  ['Schedule', 'Agendamento de horário ou visita.'],
  ['InitiateCheckout', 'Início do processo de compra.'],
  ['AddPaymentInfo', 'Informações de pagamento fornecidas.'],
  ['Purchase', 'Compra concluída, com valor.'],
  ['CompleteRegistration', 'Cadastro concluído em troca de um serviço.'],
  ['SubmitApplication', 'Envio de uma solicitação, proposta ou inscrição.'],
  ['StartTrial', 'Início de um período de teste.'],
  ['Subscribe', 'Início de uma assinatura paga.'],
  ['ViewContent', 'Visita a uma página importante.'],
  ['AddToCart', 'Item adicionado ao carrinho.'],
  ['AddToWishlist', 'Item adicionado à lista de desejos.'],
  ['CustomizeProduct', 'Produto personalizado pelo cliente.'],
  ['FindLocation', 'Busca por uma unidade física.'],
  ['Search', 'Busca realizada no site ou app.'],
  ['Donate', 'Doação realizada.']
];
var RAS_WEBHOOK_EVENTOS = [['lead.criado', 'Nova conversa'], ['lead.origem', 'Origem identificada'], ['lead.etapa', 'Mudança de etapa'], ['lead.venda', 'Venda']];

/* estilos só deste módulo */
(function(){
  var css = '' +
  '.ras-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px;padding:10px 12px;background:var(--slab);border:1px solid var(--line);border-radius:var(--r)}' +
  '.ras-top .fi{width:auto;min-width:220px}.ras-top .sp{flex:1}' +
  '.ras-crumb{font-size:11.5px;color:var(--mute2);margin-top:2px}.ras-crumb b{color:var(--mute);font-weight:500}' +
  '.ras-check{background:rgba(34,211,238,.06);border:1px solid rgba(34,211,238,.25);border-radius:var(--r);padding:16px 18px;margin-bottom:12px}' +
  '.ras-check h3{font-family:var(--disp);font-size:15px;font-weight:600;margin-bottom:10px}.ras-ck{display:flex;align-items:center;gap:10px;padding:7px 0;font-size:13.5px}' +
  '.ras-ck i{width:20px;height:20px;border-radius:50%;border:2px solid var(--line2);display:inline-flex;align-items:center;justify-content:center;font-size:11px;flex-shrink:0;font-style:normal}' +
  '.ras-ck.ok i{background:var(--mint);border-color:var(--mint);color:#0A0C10}.ras-ck.ok span{text-decoration:line-through;color:var(--mute)}' +
  '.ras-two{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}' +
  '.ras-big{display:flex;align-items:center;gap:14px;padding:16px}.ras-big .ic{width:42px;height:42px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}' +
  '.ras-big .v{font-family:var(--mono);font-size:24px;font-weight:700;line-height:1.1}.ras-big .l{font-size:11.5px;color:var(--mute)}' +
  '.ras-filt{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px}.ras-filt .fi{width:auto}' +
  '.ras-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:12px}' +
  '.ras-kpi{background:var(--slab2);border:1px solid var(--line);border-radius:9px;padding:12px 14px}.ras-kpi .l{font-size:10.5px;color:var(--mute);text-transform:uppercase;letter-spacing:.08em;font-weight:600;display:flex;align-items:center;gap:6px}' +
  '.ras-kpi .v{font-family:var(--mono);font-size:22px;font-weight:700;margin-top:6px}.ras-kpi .s{font-size:11px;color:var(--mute);margin-top:3px}' +
  '.ras-bar{display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--line);font-size:12.5px}.ras-bar:last-child{border-bottom:none}' +
  '.ras-bar .l{width:150px;color:var(--mute);flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ras-bar .b{flex:1;height:8px;background:var(--slab3);border-radius:8px;overflow:hidden}.ras-bar .b i{display:block;height:100%;border-radius:8px;background:var(--volt)}' +
  '.ras-bar .n{font-family:var(--mono);font-weight:700;width:110px;text-align:right;font-size:12px}' +
  '.ras-dias{display:flex;gap:3px;align-items:flex-end;height:120px;margin-top:10px}.ras-dias>div{flex:1;position:relative;display:flex;flex-direction:column-reverse;height:100%;cursor:default}' +
  '.ras-dias i{display:block;min-height:0}.ras-dias>div:hover .tip{opacity:1}' +
  '.ras-dl{display:flex;gap:3px;margin-top:6px}.ras-dl div{flex:1;text-align:center;font-family:var(--mono);font-size:9px;color:var(--mute2)}' +
  '.ras-leg{display:flex;gap:12px;font-size:11px;color:var(--mute);flex-wrap:wrap}.ras-leg i{display:inline-flex;align-items:center;gap:5px;font-style:normal}' +
  '.ras-row{cursor:pointer}.ras-row td{vertical-align:top}' +
  '.ras-et{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:7px;border:1px solid var(--line);background:var(--slab2);font-size:12px;font-weight:600;cursor:pointer}' +
  '.ras-et:hover{border-color:var(--volt)}.ras-et.v{color:var(--mint)}.ras-et.p{color:var(--coral)}' +
  '.ras-ov{position:fixed;inset:0;background:rgba(6,8,12,.7);backdrop-filter:blur(2px);z-index:800;display:flex;justify-content:flex-end}' +
  '.ras-dr{width:100%;max-width:520px;height:100%;background:var(--slab);border-left:1px solid var(--line2);display:flex;flex-direction:column;box-shadow:-20px 0 50px rgba(0,0,0,.5)}' +
  '.ras-dr.lg{max-width:760px}.ras-drh{padding:16px 20px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:12px}.ras-drh .t{font-family:var(--disp);font-size:16px;font-weight:600}' +
  '.ras-drb{flex:1;overflow-y:auto;padding:18px 20px}.ras-drf{padding:12px 20px;border-top:1px solid var(--line);display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}' +
  '.ras-sec{font-size:10.5px;color:var(--mute);text-transform:uppercase;letter-spacing:.08em;font-weight:700;margin:16px 0 8px}' +
  '.ras-kv{display:grid;grid-template-columns:130px 1fr;gap:4px 10px;font-size:12.5px}.ras-kv b{color:var(--mute);font-weight:500}' +
  '.ras-chat{background:var(--void);border:1px solid var(--line);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:6px;min-height:200px}' +
  '.ras-m{max-width:80%;padding:7px 10px;border-radius:10px;font-size:12.5px;line-height:1.45;white-space:pre-wrap;word-break:break-word;background:var(--slab2);align-self:flex-start;border:1px solid var(--line)}' +
  '.ras-m.eu{align-self:flex-end;background:rgba(52,211,153,.12);border-color:rgba(52,211,153,.3)}.ras-m small{display:block;font-size:10px;color:var(--mute2);margin-top:3px;font-family:var(--mono)}.ras-m .md{color:var(--mute);font-style:italic}' +
  '.ras-ev{display:flex;gap:9px;padding:7px 0;border-bottom:1px solid var(--line);font-size:12px}.ras-ev:last-child{border-bottom:none}.ras-ev .t{font-family:var(--mono);color:var(--mute2);white-space:nowrap;font-size:11px;padding-top:2px}' +
  '.ras-kb{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(240px,1fr);gap:10px;overflow-x:auto;padding-bottom:8px}' +
  '.ras-kc{background:var(--slab);border:1px solid var(--line);border-radius:var(--r);display:flex;flex-direction:column;max-height:70vh}.ras-kh{padding:10px 12px;border-bottom:1px solid var(--line);font-family:var(--disp);font-weight:600;font-size:13px;display:flex;justify-content:space-between}' +
  '.ras-kl{overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:6px}.ras-ki{background:var(--slab2);border:1px solid var(--line);border-radius:8px;padding:8px 10px;cursor:pointer;font-size:12px}.ras-ki:hover{border-color:var(--volt)}' +
  '.ras-qr{width:260px;height:260px;margin:12px auto;background:#fff;border-radius:12px;display:flex;align-items:center;justify-content:center;color:#333;font-size:12px}.ras-qr img{width:100%;height:100%;border-radius:12px}' +
  '.ras-url{font-family:var(--mono);font-size:11.5px;color:var(--cyan);word-break:break-all}' +
  '.ras-code{font-family:var(--mono);font-size:11px;background:var(--void);border:1px solid var(--line);border-radius:8px;padding:10px;white-space:pre-wrap;word-break:break-all;color:var(--mute)}' +
  '.ras-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}' +
  '.ras-pick{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}' +
  '.ras-funil .ras-bar .l{width:170px}' +
  '@media(max-width:900px){.ras-two{grid-template-columns:1fr}.ras-kv{grid-template-columns:1fr}.ras-bar .l{width:100px}}';
  var s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
})();

/* ================= CHAMADAS AO MOTOR ================= */
function rasApi(metodo, caminho, corpo){
  if(!AUTH || !AUTH.currentUser) return Promise.reject(new Error('Faça login'));
  return AUTH.currentUser.getIdToken().then(function(tk){
    return fetch(RAS.base + caminho, { method: metodo || 'GET', headers: Object.assign({ Authorization: 'Bearer ' + tk }, corpo ? { 'Content-Type': 'application/json' } : {}), body: corpo ? JSON.stringify(corpo) : undefined });
  }).then(function(r){
    return r.json().catch(function(){ return { ok: false, erro: 'Resposta inválida do motor (' + r.status + ')' }; }).then(function(j){
      if(!r.ok || j.ok === false) throw new Error(j.erro || ('Erro ' + r.status));
      return j;
    });
  });
}
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
function rasLimpa(prefixo){ Object.keys(RAS.cache).forEach(function(k){ if(!prefixo || k.indexOf(prefixo) === 0) delete RAS.cache[k]; }); }
function rasRecarrega(prefixo){ rasLimpa(prefixo); render(); }
function rasBaixa(caminho, nome){
  toast('Gerando arquivo…');
  AUTH.currentUser.getIdToken().then(function(tk){ return fetch(RAS.base + caminho, { headers: { Authorization: 'Bearer ' + tk } }); })
    .then(function(r){ if(!r.ok) throw new Error('Erro ' + r.status); return r.blob(); })
    .then(function(b){ var u = URL.createObjectURL(b); var a = document.createElement('a'); a.href = u; a.download = nome; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function(){ URL.revokeObjectURL(u); }, 5000); })
    .catch(function(e){ toast(e.message, 'err'); });
}

/* ================= FORMATAÇÃO ================= */
function rasFone(t){
  var d = String(t || '').replace(/\D/g, ''); if(!d) return '';
  if(d.length === 13 && d.indexOf('55') === 0) return '(' + d.slice(2, 4) + ') ' + d.slice(4, 9) + '-' + d.slice(9);
  if(d.length === 12 && d.indexOf('55') === 0) return '(' + d.slice(2, 4) + ') ' + d.slice(4, 8) + '-' + d.slice(8);
  return '+' + d;
}
function rasP2(n){ return (n < 10 ? '0' : '') + n; }
function rasQuando(iso){ if(!iso) return '—'; var d = new Date(iso); if(isNaN(d)) return '—'; return rasP2(d.getDate()) + '/' + rasP2(d.getMonth() + 1) + '/' + d.getFullYear() + '<br><span class="sub mono">' + rasP2(d.getHours()) + ':' + rasP2(d.getMinutes()) + ':' + rasP2(d.getSeconds()) + '</span>'; }
function rasQ(iso){ if(!iso) return '—'; var d = new Date(iso); if(isNaN(d)) return '—'; return rasP2(d.getDate()) + '/' + rasP2(d.getMonth() + 1) + ' ' + rasP2(d.getHours()) + ':' + rasP2(d.getMinutes()); }
function rasDataISO(d){ return d.getFullYear() + '-' + rasP2(d.getMonth() + 1) + '-' + rasP2(d.getDate()); }
function rasDur(seg){
  if(seg == null || !isFinite(seg)) return '—';
  var m = Math.round(seg / 60); if(m < 60) return m + ' min';
  var h = Math.round(seg / 3600); if(h < 48) return h + ' horas';
  var d = Math.floor(seg / 86400); if(d < 30) return d + ' dias';
  var ms = Math.floor(d / 30); return ms + (ms === 1 ? ' mês' : ' meses') + (d % 30 ? ' e ' + (d % 30) + ' dias' : '');
}
function rasPct(n, t){ return t ? (Math.round(10000 * n / t) / 100).toFixed(2).replace('.', ',') + '%' : '0%'; }
function rasNome(l){ return l.nome && !/^[\d\s()+\-]+$/.test(l.nome) ? l.nome : ''; }
function rasOrigemCel(l){
  var o = RAS_ORIGEM[l.origem] || { n: l.origem, s: '', g: 'nao' }, g = RAS_GRUPO[o.g];
  var sub = l.campanha_nome ? esc(l.campanha_nome) : (o.s || '');
  return '<span class="pill ' + g.c + '">' + esc(o.n) + '</span>' + (sub ? '<div class="sub">' + sub + '</div>' : '');
}
function rasEtapaBtn(l){
  var cls = l.etapa_tipo === 'venda' ? 'v' : (l.etapa_tipo === 'perdido' ? 'p' : '');
  return '<button class="ras-et ' + cls + '" onclick="event.stopPropagation();rasMenuEtapa(' + l.id + ',\'' + esc(l.etapa) + '\')">' + esc(l.etapa_nome || l.etapa) + ' ▾</button>' + (l.valor ? '<div class="sub mono">' + brl(l.valor) + '</div>' : '');
}
function rasErro(c){ return c && c.erro ? '<div class="note">Não consegui falar com o motor: ' + esc(c.erro) + ' <button class="btn btn-s" onclick="rasRecarrega()">Tentar de novo</button></div>' : ''; }
function rasCarregando(){ return '<div class="empty"><b>Carregando…</b>buscando no motor de rastreio</div>'; }
function rasStatusPill(s){ return { enviado: '<span class="pill p-on">Sucesso</span>', pendente: '<span class="pill p-av">Pendente</span>', erro: '<span class="pill p-cr">Erro</span>' }[s] || '<span class="pill p-off">' + esc(s) + '</span>'; }

/* ================= CLIENTE ATUAL (seletor no topo) ================= */
function rasClientes(){ var c = rasDados('clientes', '/api/clientes'); return c && c.dados ? c.dados.itens : null; }
function rasClienteAtual(){
  var cs = rasClientes() || [];
  if(!RAS.cliente){ try{ RAS.cliente = localStorage.getItem('ras_cliente') || ''; }catch(e){} }
  var c = cs.filter(function(x){ return String(x.id) === String(RAS.cliente); })[0];
  if(!c && cs.length === 1){ c = cs[0]; RAS.cliente = String(c.id); }
  return c || null;
}
function rasTrocaCliente(v){ RAS.cliente = v; RAS.pagina = 1; RAS.lf.sel = {}; try{ localStorage.setItem('ras_cliente', v); }catch(e){} rasLimpa('d:'); render(); }
function rasConexoesDo(cid){ var c = rasDados('d:cx:' + cid, '/api/conexoes?cliente_id=' + cid); return c && c.dados ? c.dados.itens : null; }
function rasEtapasDo(cid){ var c = rasDados('d:et:' + cid, '/api/clientes/' + cid + '/etapas'); return c && c.dados ? c.dados.itens : null; }
function rasTopo(titulo, acoes){
  var cs = rasClientes(), c = rasClienteAtual();
  var cx = c ? rasConexoesDo(c.id) : null;
  var st = 'desconhecido';
  if(cx && cx.length){ st = cx.some(function(x){ return x.estado === 'open'; }) ? 'open' : (cx.some(function(x){ return x.estado === 'connecting'; }) ? 'connecting' : 'close'); }
  else if(cx && !cx.length) st = 'close';
  var sel = '<select class="fi" onchange="rasTrocaCliente(this.value)"><option value="">Selecione o cliente…</option>' + (cs || []).map(function(x){ return '<option value="' + x.id + '" ' + (c && c.id === x.id ? 'selected' : '') + '>' + esc(x.nome) + '</option>'; }).join('') + '</select>';
  return '<div class="ras-top">' + sel +
    (c ? '<button class="pill ' + RAS_ESTADO[st].c + '" style="cursor:pointer" onclick="go(\'ras_info\')" title="Gerenciar conexão">● ' + RAS_ESTADO[st].n + (cx && cx.length > 1 ? ' (' + cx.length + ')' : '') + '</button>' : '') +
    '<span class="sp"></span>' + (acoes || '') + (euSouAdmin() ? '<button class="btn btn-s" onclick="rasEditaCliente(0)">+ Cliente</button>' : '') + '</div>' +
    '<div class="hd"><div><h1>' + titulo + (c ? ' <span style="color:var(--mute);font-weight:500">· ' + esc(c.nome) + '</span>' : '') + '</h1><div class="ras-crumb"><b>Rastreio</b> › ' + titulo + '</div></div></div>';
}
function rasSemCliente(titulo){
  var cs = rasClientes();
  if(cs === null) return rasTopo(titulo) + rasCarregando();
  if(!cs.length) return rasTopo(titulo) + '<div class="tw"><div class="empty"><b>Nenhum cliente no rastreio</b>' + (euSouAdmin() ? 'Clique em "+ Cliente" acima para cadastrar o primeiro.' : 'Peça a um administrador para cadastrar.') + '</div></div>';
  return rasTopo(titulo) + '<div class="ras-pick">' + cs.map(function(c){
    return '<button class="pc" onclick="rasTrocaCliente(\'' + c.id + '\')"><div class="pc-n">' + esc(c.nome) + '</div><div class="pc-s">' + c.leads + ' conversas · ' + c.conexoes_ativas + ' de ' + c.conexoes + ' números conectados</div></button>';
  }).join('') + '</div>';
}
function rasQsPeriodo(){ return (RAS.de ? '&de=' + RAS.de : '') + (RAS.ate ? '&ate=' + RAS.ate : '') + (RAS.origem ? '&origem=' + RAS.origem : ''); }
function rasPreset(dias){ var h = new Date(), d = new Date(); d.setDate(h.getDate() - (dias - 1)); RAS.de = rasDataISO(d); RAS.ate = rasDataISO(h); rasLimpa('d:res'); render(); }
function rasFiltroPeriodo(){
  if(!RAS.de){ var h = new Date(), d = new Date(); d.setDate(h.getDate() - 6); RAS.de = rasDataISO(d); RAS.ate = rasDataISO(h); }
  return '<div class="ras-filt">' +
    '<input type="date" class="fi" value="' + RAS.de + '" onchange="RAS.de=this.value;rasLimpa(\'d:res\');render()"><span class="sub">até</span><input type="date" class="fi" value="' + RAS.ate + '" onchange="RAS.ate=this.value;rasLimpa(\'d:res\');render()">' +
    '<div class="seg"><button onclick="rasPreset(7)">7 dias</button><button onclick="rasPreset(30)">30 dias</button><button onclick="rasPreset(90)">90 dias</button></div>' +
    '<select class="fi" onchange="RAS.origem=this.value;rasLimpa(\'d:res\');render()"><option value="">Todas as Origens</option>' + Object.keys(RAS_GRUPO).map(function(k){ return '<option value="' + k + '" ' + (RAS.origem === k ? 'selected' : '') + '>' + RAS_GRUPO[k].n + '</option>'; }).join('') + '</select>' +
    '<span style="flex:1"></span><button class="btn btn-p" onclick="rasBaixa(\'/api/relatorios/conversas?cliente_id=' + RAS.cliente + rasQsPeriodo() + '\',\'conversas.csv\')">Baixar Relatório</button></div>';
}

/* ================= DASHBOARD ================= */
function rasCk(ok, t, v){ return '<div class="ras-ck ' + (ok ? 'ok' : '') + '"><i>' + (ok ? '✓' : '') + '</i><span>' + t + '</span>' + (ok ? '' : '<button class="btn btn-s btn-p" onclick="go(\'' + v + '\')">Iniciar</button>') + '</div>'; }
function vRasDash(){
  var c = rasClienteAtual(); if(!c) return rasSemCliente('Dashboard');
  if(!RAS.de){ var h0 = new Date(), d0 = new Date(); d0.setDate(h0.getDate() - 6); RAS.de = rasDataISO(d0); RAS.ate = rasDataISO(h0); }
  var h = rasTopo('Dashboard do cliente');
  var cx = rasConexoesDo(c.id) || [], et = rasEtapasDo(c.id) || [];
  var r = rasDados('d:res:' + c.id + ':' + RAS.de + ':' + RAS.ate + ':' + RAS.origem + ':' + RAS.ver, '/api/resumo?cliente_id=' + c.id + rasQsPeriodo() + '&ver=' + RAS.ver);
  var conectado = cx.some(function(x){ return x.estado === 'open'; }), temFrase = et.some(function(e){ return e.tipo === 'venda' && e.frase; });
  var capiOk = !!(c.config && c.config.capi && c.config.capi.dataset_id);
  var temVenda = r && r.dados && r.dados.funil && r.dados.funil.some(function(f){ return f.tipo === 'venda' && f.n > 0; });
  if(!(conectado && temFrase && capiOk && temVenda)){
    h += '<div class="ras-check"><h3>🔥 Configurações iniciais</h3>' + rasCk(conectado, 'Conectar no WhatsApp', 'ras_info') + rasCk(temFrase, 'Configurar frase gatilho', 'ras_jornada') + rasCk(!!temVenda, 'Identificar a primeira venda', 'ras_leads') + rasCk(capiOk, 'Configurar rastreio de campanhas (pixel e token da Meta)', 'ras_info') + '</div>';
  }
  if(!r) return h + rasCarregando();
  if(r.erro) return h + rasErro(r);
  var d = r.dados, t = d.totais || {};
  h += '<div class="ras-two">' +
    '<div class="card ras-big"><div class="ic" style="background:var(--amber-dim);color:var(--amber)">💬</div><div><div class="l">Conversas aguardando primeira resposta <span title="Conversas iniciadas pelo lead que ainda não receberam nenhuma resposta" style="cursor:help">ⓘ</span></div><div class="v">' + d.aguardando + '</div></div><span style="flex:1"></span><button class="btn btn-s" onclick="RAS.lf.aguardando=\'1\';RAS.pagina=1;go(\'ras_leads\')">Ver conversas →</button></div>' +
    '<div class="card ras-big"><div class="ic" style="background:var(--volt-dim);color:var(--volt)">⏱</div><div><div class="l">Tempo médio de Jornada <span title="Tempo entre o primeiro contato e a venda, para quem já comprou" style="cursor:help">ⓘ</span></div><div class="v" style="font-size:18px">' + (d.seg_jornada ? rasDur(d.seg_jornada) : '<span class="sub">Aguardando primeira venda registrada</span>') + '</div></div></div></div>';
  h += rasFiltroPeriodo();
  var seg1 = RAS.seg ? t.seg_2a_resposta : t.seg_1a_resposta;
  h += '<div class="card mb12"><div class="rw-t mb12">Visão Geral das Conversas</div><div class="ras-kpis">' +
    '<div class="ras-kpi"><div class="l">Total de Conversas Novas Ativas</div><div class="v">' + t.leads + '</div></div>' +
    '<div class="ras-kpi"><div class="l">Conversas Rastreadas</div><div class="v pos">' + t.rastreadas + '</div><div class="s">' + rasPct(t.rastreadas, t.leads) + '</div></div>' +
    '<div class="ras-kpi"><div class="l">Conversas não rastreadas</div><div class="v">' + (t.leads - t.rastreadas) + '</div><div class="s">' + rasPct(t.leads - t.rastreadas, t.leads) + '</div></div>' +
    '<div class="ras-kpi"><div class="l">Tempo médio de 1ª resposta</div><div class="v">' + rasDur(seg1) + '</div><div class="s"><label class="chk" style="padding:4px 8px;margin-top:4px;font-size:11px"><input type="checkbox" ' + (RAS.seg ? 'checked' : '') + ' onchange="RAS.seg=this.checked;render()"> Calcular a partir da 2ª mensagem</label></div></div></div>' +
    '<div class="bar" style="height:8px"><i style="width:' + (t.leads ? Math.round(100 * t.rastreadas / t.leads) : 0) + '%;background:var(--mint)"></i></div><div class="ras-leg mt12"><i><span class="dot" style="background:var(--mint)"></span>' + rasPct(t.rastreadas, t.leads) + ' Rastreadas</i><i><span class="dot" style="background:var(--slab3)"></span>' + rasPct(t.leads - t.rastreadas, t.leads) + ' Não rastreadas</i></div></div>';
  var dias = d.por_dia || [], maxD = Math.max.apply(null, dias.map(function(x){ return x.meta + x.google + x.outras + x.nao; }).concat([1]));
  h += '<div class="card mb12"><div class="rw-hd"><div class="rw-t">Origem das Conversas</div><div class="ras-leg">' + Object.keys(RAS_GRUPO).map(function(k){ return '<i><span class="dot" style="background:' + RAS_GRUPO[k].cor + '"></span>' + RAS_GRUPO[k].n + '</i>'; }).join('') + '</div></div>' +
    '<div class="ras-kpis">' + [['meta', t.meta], ['google', t.google], ['outras', t.outras], ['nao', t.nao]].map(function(x){ return '<div class="ras-kpi"><div class="l"><span class="dot" style="background:' + RAS_GRUPO[x[0]].cor + '"></span>' + RAS_GRUPO[x[0]].n + '</div><div class="v">' + x[1] + '</div></div>'; }).join('') + '</div>' +
    (dias.length ? '<div class="ras-dias">' + dias.map(function(x){
      var tot = x.meta + x.google + x.outras + x.nao;
      return '<div><div class="tip"><b>' + x.dia.slice(8, 10) + '/' + x.dia.slice(5, 7) + '</b><br>' + tot + ' conversas<br>Meta ' + x.meta + ' · Google ' + x.google + '<br>Outras ' + x.outras + ' · Não rastr. ' + x.nao + '</div>' +
        ['meta', 'google', 'outras', 'nao'].map(function(k){ return '<i style="height:' + Math.round(110 * x[k] / maxD) + 'px;background:' + RAS_GRUPO[k].cor + '"></i>'; }).join('') + '</div>';
    }).join('') + '</div><div class="ras-dl">' + dias.map(function(x){ return '<div>' + x.dia.slice(8, 10) + '/' + x.dia.slice(5, 7) + '</div>'; }).join('') + '</div>' : '<div class="empty">Sem conversas no período</div>') + '</div>';
  var funil = d.funil || [], maxF = Math.max.apply(null, funil.map(function(f){ return f.n; }).concat([1]));
  h += '<div class="card mb12 ras-funil"><div class="rw-hd"><div class="rw-t">Funil da Jornada de Compra</div><button class="btn btn-s" onclick="go(\'ras_jornada\')">Editar etapas</button></div>' +
    (funil.map(function(f){ return '<div class="ras-bar"><span class="l">' + esc(f.nome) + '</span><span class="b"><i style="width:' + Math.round(100 * f.n / maxF) + '%;background:' + (f.tipo === 'venda' ? 'var(--mint)' : (f.tipo === 'perdido' ? 'var(--coral)' : 'var(--volt)')) + '"></i></span><span class="n">' + rasPct(f.n, t.leads) + ' (' + f.n + ')</span></div>'; }).join('') || '<div class="empty">Sem etapas</div>') + '</div>';
  var vd = d.vendas_dia || [], maxV = Math.max.apply(null, vd.map(function(x){ return x.n; }).concat([1]));
  h += '<div class="card"><div class="rw-hd"><div class="rw-t">Vendas</div><div class="seg"><button class="' + (RAS.ver === 'contato' ? 'on' : '') + '" onclick="RAS.ver=\'contato\';render()">Data do Primeiro Contato</button><button class="' + (RAS.ver === 'venda' ? 'on' : '') + '" onclick="RAS.ver=\'venda\';render()">Data da Venda</button></div></div>' +
    '<div class="ras-kpis"><div class="ras-kpi"><div class="l">Total de Vendas</div><div class="v pos">' + (d.vendas ? d.vendas.n : 0) + '</div></div><div class="ras-kpi"><div class="l">Faturamento Total (R$)</div><div class="v">' + brl(d.vendas ? d.vendas.faturamento : 0) + '</div></div></div>' +
    (vd.length ? '<div class="ras-dias" style="height:80px">' + vd.map(function(x){ return '<div><div class="tip"><b>' + x.dia.slice(8, 10) + '/' + x.dia.slice(5, 7) + '</b><br>' + x.n + ' vendas · ' + brl(x.valor) + '</div><i style="height:' + Math.round(70 * x.n / maxV) + 'px;background:var(--mint)"></i></div>'; }).join('') + '</div><div class="ras-dl">' + vd.map(function(x){ return '<div>' + x.dia.slice(8, 10) + '/' + x.dia.slice(5, 7) + '</div>'; }).join('') + '</div>' : '<div class="empty"><b>Nenhum registro encontrado</b>Nenhuma venda no período. As vendas são marcadas pela frase gatilho ou manualmente na conversa.</div>') + '</div>';
  return h;
}

/* ================= CONVERSAS ================= */
function rasLeadsQs(c){
  var f = RAS.lf;
  return '/api/leads?cliente_id=' + c.id + '&por=' + (f.modo === 'kanban' ? 400 : 50) + '&pagina=' + RAS.pagina + '&ordenar=' + f.ordenar + (f.origem ? '&origem=' + f.origem : '') + (f.etapa ? '&etapa=' + f.etapa : '') + (f.q ? '&q=' + encodeURIComponent(f.q) : '') + (f.aguardando ? '&aguardando=1' : '') + (f.de ? '&de=' + f.de + '&campo=' + (f.campo || 'primeiro') : '') + (f.ate ? '&ate=' + f.ate : '');
}
function rasLF(k, v){ RAS.lf[k] = v; RAS.pagina = 1; render(); }
function vRasLeads(){
  var c = rasClienteAtual(); if(!c) return rasSemCliente('Conversas');
  var f = RAS.lf, et = rasEtapasDo(c.id) || [];
  var h = rasTopo('Conversas do cliente', '<button class="btn btn-s" onclick="rasRecarrega(\'d:leads\')">Atualizar</button>');
  var r = rasDados('d:leads:' + rasLeadsQs(c), rasLeadsQs(c));
  if(!r) return h + rasCarregando();
  if(r.erro) return h + rasErro(r);
  var d = r.dados, tt = d.totais || {};
  h += '<div class="ras-kpis">' +
    '<div class="ras-kpi"><div class="l">Total</div><div class="v">' + d.total + '</div></div>' +
    [['meta', tt.meta], ['google', tt.google], ['outras', tt.outras], ['nao', tt.nao]].map(function(x){ return '<div class="ras-kpi" style="cursor:pointer" onclick="rasLF(\'origem\',\'' + (f.origem === x[0] ? '' : x[0]) + '\')"><div class="l"><span class="dot" style="background:' + RAS_GRUPO[x[0]].cor + '"></span>' + RAS_GRUPO[x[0]].n + '</div><div class="v">' + x[1] + '</div></div>'; }).join('') + '</div>';
  h += '<div class="ras-filt"><div class="seg"><button class="' + (f.modo === 'lista' ? 'on' : '') + '" onclick="rasLF(\'modo\',\'lista\')">☰ Lista</button><button class="' + (f.modo === 'kanban' ? 'on' : '') + '" onclick="rasLF(\'modo\',\'kanban\')">▦ Colunas</button></div>' +
    '<input class="sr" placeholder="Telefone ou nome… (Enter)" value="' + esc(f.q) + '" onkeydown="if(event.key===\'Enter\')rasLF(\'q\',this.value)">' +
    '<select class="fi" onchange="rasLF(\'origem\',this.value)"><option value="">Todas as Origens</option>' + Object.keys(RAS_GRUPO).map(function(k){ return '<option value="' + k + '" ' + (f.origem === k ? 'selected' : '') + '>' + RAS_GRUPO[k].n + '</option>'; }).join('') + '</select>' +
    '<select class="fi" onchange="rasLF(\'etapa\',this.value)"><option value="">Todas as etapas</option>' + et.map(function(e){ return '<option value="' + esc(e.slug) + '" ' + (f.etapa === e.slug ? 'selected' : '') + '>' + esc(e.nome) + '</option>'; }).join('') + '</select>' +
    '<select class="fi" onchange="rasLF(\'ordenar\',this.value)">' + [['ultima', 'Última mensagem'], ['primeira', 'Primeira mensagem'], ['etapa_em', 'Mudança de etapa'], ['contato', 'Contato'], ['etapa', 'Etapa']].map(function(x){ return '<option value="' + x[0] + '" ' + (f.ordenar === x[0] ? 'selected' : '') + '>Ordenar: ' + x[1] + '</option>'; }).join('') + '</select>' +
    '<button class="btn btn-s" onclick="rasFiltrosAvancados()">Filtros Avançados' + (f.de ? ' ●' : '') + '</button>' +
    '<button class="btn btn-s ' + (f.aguardando ? 'btn-p' : '') + '" onclick="rasLF(\'aguardando\',RAS.lf.aguardando?\'\':\'1\')">💬 Aguardando primeira resposta' + (tt.aguardando != null ? ' (' + tt.aguardando + ')' : '') + '</button>' +
    '<button class="btn btn-s" onclick="RAS.lf.lote=!RAS.lf.lote;RAS.lf.sel={};render()">' + (f.lote ? 'Cancelar lote' : 'Alterar Etapa em Lote') + '</button>' +
    (f.q || f.origem || f.etapa || f.aguardando || f.de ? '<button class="btn btn-s" onclick="RAS.lf.origem=\'\';RAS.lf.etapa=\'\';RAS.lf.q=\'\';RAS.lf.aguardando=\'\';RAS.lf.de=\'\';RAS.lf.ate=\'\';RAS.pagina=1;render()">Limpar</button>' : '') + '</div>';
  if(f.lote){
    var ns = Object.keys(f.sel).length;
    h += '<div class="note" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">' + ns + ' conversa' + (ns === 1 ? '' : 's') + ' selecionada' + (ns === 1 ? '' : 's') + '. Mover para: <select class="fi" id="ras_lote_et" style="width:auto">' + et.map(function(e){ return '<option value="' + esc(e.slug) + '">' + esc(e.nome) + '</option>'; }).join('') + '</select><button class="btn btn-s btn-p" onclick="rasLote()">Aplicar</button></div>';
  }
  var its = d.itens || [];
  if(f.modo === 'kanban') return h + rasKanban(its, et);
  h += '<div class="tw"><div class="tsc"><table><thead><tr>' + (f.lote ? '<th><input type="checkbox" onchange="rasSelTodos(this.checked)"></th>' : '') + '<th>Contato</th><th>Origem</th><th>Etapa da Jornada</th><th>Primeira Mensagem</th><th>Última Mensagem</th><th>Ações</th></tr></thead><tbody>' +
    (its.map(function(l){
      var nm = rasNome(l);
      return '<tr class="ras-row" onclick="rasAbreLead(' + l.id + ')">' + (f.lote ? '<td onclick="event.stopPropagation()"><input type="checkbox" ' + (f.sel[l.id] ? 'checked' : '') + ' onchange="rasSel(' + l.id + ',this.checked)"></td>' : '') +
        '<td><div class="nm mono">' + (l.telefone ? rasFone(l.telefone) : 'sem telefone') + (l.msgs_enviadas === 0 && l.origem !== 'ativo' ? ' <span title="Aguardando primeira resposta" style="color:var(--amber)">●</span>' : '') + '</div><div class="sub">' + esc(nm || '—') + '</div></td>' +
        '<td>' + rasOrigemCel(l) + '</td><td>' + rasEtapaBtn(l) + '</td><td class="mono" style="font-size:12px">' + rasQuando(l.primeiro_contato_em) + '</td><td class="mono" style="font-size:12px">' + rasQuando(l.ultima_mensagem_em) + '</td>' +
        '<td onclick="event.stopPropagation()"><div class="lk-a"><button class="ib" title="Ver detalhes do lead" onclick="rasAbreLead(' + l.id + ')">👤</button><button class="ib" title="Visualizar conversa" onclick="rasAbreConversa(' + l.id + ')">💬</button></div></td></tr>';
    }).join('') || '<tr><td colspan="7"><div class="empty"><b>Nenhuma conversa</b>com esses filtros</div></td></tr>') + '</tbody></table></div>' +
    '<div class="mtot" style="justify-content:space-between;align-items:center"><span class="sub">página ' + d.pagina + ' de ' + Math.max(1, Math.ceil(d.total / d.por)) + '</span><span><button class="btn btn-s" ' + (RAS.pagina <= 1 ? 'disabled' : '') + ' onclick="RAS.pagina--;render()">← Anterior</button> <button class="btn btn-s" ' + (d.pagina * d.por >= d.total ? 'disabled' : '') + ' onclick="RAS.pagina++;render()">Próxima →</button></span></div></div>';
  return h;
}
function rasKanban(its, et){
  return '<div class="ras-kb">' + et.map(function(e){
    var col = its.filter(function(l){ return l.etapa === e.slug; });
    return '<div class="ras-kc"><div class="ras-kh"><span>' + esc(e.nome) + '</span><span class="mono" style="color:var(--mute)">' + col.length + '</span></div><div class="ras-kl">' +
      (col.map(function(l){ var o = RAS_ORIGEM[l.origem] || { g: 'nao' }; return '<div class="ras-ki" onclick="rasAbreLead(' + l.id + ')"><div class="nm">' + esc(rasNome(l) || rasFone(l.telefone) || 'Contato') + '</div><div class="sub mono">' + rasFone(l.telefone) + '</div><div style="margin-top:5px;display:flex;justify-content:space-between;align-items:center"><span class="pill ' + RAS_GRUPO[o.g].c + '">' + esc(RAS_GRUPO[o.g].n) + '</span><span class="sub">' + rasQ(l.ultima_mensagem_em) + '</span></div>' + (l.valor ? '<div class="sub mono pos">' + brl(l.valor) + '</div>' : '') + '</div>'; }).join('') || '<div class="sub" style="padding:10px;text-align:center">vazio</div>') + '</div></div>';
  }).join('') + '</div>';
}
function rasSel(id, on){ if(on) RAS.lf.sel[id] = true; else delete RAS.lf.sel[id]; render(); }
function rasSelTodos(on){ var c = RAS.cache['d:leads:' + rasLeadsQs(rasClienteAtual())]; var its = c && c.dados ? c.dados.itens : []; RAS.lf.sel = {}; if(on) its.forEach(function(l){ RAS.lf.sel[l.id] = true; }); render(); }
function rasLote(){
  var ids = Object.keys(RAS.lf.sel).map(Number); if(!ids.length) return toast('Selecione as conversas', 'err');
  var et = $('ras_lote_et').value;
  rasApi('POST', '/api/leads/lote-etapa', { ids: ids, etapa: et }).then(function(j){ toast(j.alterados + ' conversas movidas', 'ok'); RAS.lf.lote = false; RAS.lf.sel = {}; rasLimpa('d:'); render(); }).catch(function(e){ toast(e.message, 'err'); });
}
function rasFiltrosAvancados(){
  var f = RAS.lf;
  modal('Filtros Avançados',
    '<div class="fg"><label class="fl">Período por</label><select class="fi" id="ras_fa_campo">' + [['primeiro', 'Primeira mensagem'], ['ultimo', 'Última mensagem'], ['etapa', 'Mudança de etapa'], ['venda', 'Data da venda']].map(function(x){ return '<option value="' + x[0] + '" ' + (f.campo === x[0] ? 'selected' : '') + '>' + x[1] + '</option>'; }).join('') + '</select></div>' +
    '<div class="fr fr2"><div class="fg"><label class="fl">De</label><input type="date" class="fi" id="ras_fa_de" value="' + (f.de || '') + '"></div><div class="fg"><label class="fl">Até</label><input type="date" class="fi" id="ras_fa_ate" value="' + (f.ate || '') + '"></div></div>',
    '<button class="btn" onclick="RAS.lf.de=\'\';RAS.lf.ate=\'\';fecha();RAS.pagina=1;render()">Limpar</button><button class="btn btn-p" onclick="RAS.lf.campo=$(\'ras_fa_campo\').value;RAS.lf.de=$(\'ras_fa_de\').value;RAS.lf.ate=$(\'ras_fa_ate\').value;fecha();RAS.pagina=1;render()">Aplicar</button>');
}
function rasMenuEtapa(id, atual){
  var c = rasClienteAtual(), et = (c && rasEtapasDo(c.id)) || [];
  modal('Alterar etapa da jornada',
    '<div class="fg"><label class="fl">Nova etapa</label><select class="fi" id="ras_me_et">' + et.map(function(e){ return '<option value="' + esc(e.slug) + '" ' + (e.slug === atual ? 'selected' : '') + '>' + esc(e.nome) + '</option>'; }).join('') + '</select></div>' +
    '<div class="fg"><label class="fl">Valor da venda (se for venda)</label><input type="number" step="0.01" class="fi" id="ras_me_val" placeholder="0,00"></div>' +
    '<div class="hint">A mudança entra na jornada e, se a etapa tiver evento de conversão configurado, o evento é enviado para a plataforma de anúncios.</div>',
    '<button class="btn" onclick="fecha()">Cancelar</button><button class="btn btn-p" onclick="rasSalvaEtapa(' + id + ')">Salvar</button>');
}
function rasSalvaEtapa(id){
  rasApi('PUT', '/api/leads/' + id + '/etapa', { etapa: $('ras_me_et').value, valor: $('ras_me_val').value })
    .then(function(){ fecha(); toast('Etapa alterada', 'ok'); rasLimpa('d:'); render(); }).catch(function(e){ toast(e.message, 'err'); });
}
function rasGaveta(titulo, corpo, rodape, largo){
  $('modal').innerHTML = '<div class="ras-ov" onclick="if(event.target===this)fecha()"><div class="ras-dr ' + (largo ? 'lg' : '') + '"><div class="ras-drh"><div class="t" style="flex:1">' + titulo + '</div><button class="md-x" onclick="fecha()">×</button></div><div class="ras-drb" id="rasDrB">' + corpo + '</div><div class="ras-drf">' + (rodape || '') + '</div></div></div>';
}
function rasAbreLead(id){
  rasGaveta('Detalhes do lead', rasCarregando(), '<button class="btn" onclick="fecha()">Fechar</button>');
  rasApi('GET', '/api/leads/' + id).then(function(j){
    var l = j.lead, evs = j.eventos || [], cvs = j.conversoes || [], od = l.origem_dados || {}, o = RAS_ORIGEM[l.origem] || { n: l.origem, g: 'nao' };
    var corpo = '<div style="display:flex;gap:12px;align-items:center;margin-bottom:12px"><div class="lk-i" style="background:var(--volt-dim);color:#a78bfa;width:42px;height:42px;font-size:15px">' + esc((rasNome(l) || 'C').slice(0, 2).toUpperCase()) + '</div><div><div style="font-family:var(--disp);font-size:17px;font-weight:600" class="mono">' + (l.telefone ? rasFone(l.telefone) : 'sem telefone') + (l.telefone_fonte === 'nome' ? ' <span class="pill p-av" title="Telefone deduzido pelo nome de exibição">provável</span>' : '') + '</div><div class="sub">' + esc(rasNome(l) || '—') + '</div></div></div>' +
      '<div style="display:flex;gap:8px;margin-bottom:6px"><button class="btn btn-s btn-p" onclick="rasAbreConversa(' + l.id + ')">💬 Ver conversa</button><button class="btn btn-s" onclick="rasMenuEtapa(' + l.id + ',\'' + esc(l.etapa) + '\')">Alterar etapa</button></div>' +
      '<div class="ras-sec">Rastreamento</div><div class="ras-kv">' +
      '<b>Origem</b><span><span class="pill ' + RAS_GRUPO[o.g].c + '">' + esc(o.n) + '</span> <span class="sub">' + esc(o.s || '') + '</span></span>' +
      (l.conta_nome || od.anuncio_id ? '<b>Conta de anúncio</b><span>' + esc(l.conta_nome || '—') + '</span><b>Campanha</b><span>' + esc(l.campanha_nome || '—') + '</span><b>Conjunto</b><span>' + esc(l.conjunto_nome || '—') + '</span><b>Anúncio</b><span>' + esc(l.anuncio_nome || od.titulo || '—') + (od.anuncio_id ? ' <span class="sub mono">' + esc(od.anuncio_id) + '</span>' : '') + '</span>' : '') +
      (od.titulo && l.anuncio_nome ? '<b>Título do criativo</b><span>' + esc(od.titulo) + '</span>' : '') + (od.app ? '<b>Plataforma</b><span>' + esc(od.app) + '</span>' : '') + (od.url ? '<b>Publicação</b><span><a class="ras-url" href="' + esc(od.url) + '" target="_blank" rel="noopener">' + esc(od.url) + '</a></span>' : '') +
      (od.link ? '<b>Link rastreável</b><span>' + esc(od.link_nome || od.link) + ' <span class="mono">#' + esc(od.codigo) + '</span></span>' : '') +
      (od.utm && Object.keys(od.utm).length ? Object.keys(od.utm).map(function(k){ return '<b>' + esc(k) + '</b><span class="mono">' + esc(od.utm[k]) + '</span>'; }).join('') : '') + (od.gclid ? '<b>GCLID</b><span class="mono" style="word-break:break-all">' + esc(od.gclid) + '</span>' : '') + (od.fbclid ? '<b>FBCLID</b><span class="mono" style="word-break:break-all">' + esc(String(od.fbclid).slice(0, 40)) + '…</span>' : '') +
      '</div>' +
      '<div class="ras-sec">Jornada</div><div class="ras-kv"><b>Etapa atual</b><span>' + esc(l.etapa_nome || l.etapa) + (l.valor ? ' · ' + brl(l.valor) : '') + '</span><b>Primeiro contato</b><span>' + rasQ(l.primeiro_contato_em) + '</span><b>Última mensagem</b><span>' + rasQ(l.ultima_mensagem_em) + '</span><b>1ª resposta</b><span>' + (l.primeira_resposta_em ? rasQ(l.primeira_resposta_em) + ' <span class="sub">(' + rasDur((new Date(l.primeira_resposta_em) - new Date(l.primeiro_contato_em)) / 1000) + ')</span>' : (l.origem === 'ativo' ? '—' : '<span class="warn">aguardando</span>')) + '</span><b>Mensagens</b><span>' + l.msgs_recebidas + ' recebidas · ' + l.msgs_enviadas + ' enviadas</span></div>' +
      '<div class="ras-sec">Histórico</div>' + (evs.map(function(e){
        var dd = e.dados || {};
        var txt = e.tipo === 'lead' ? 'Entrou no funil (' + esc((RAS_ORIGEM[dd.origem] || {}).n || 'origem') + ')' : e.tipo === 'origem' ? 'Origem identificada: ' + esc((RAS_ORIGEM[dd.para] || {}).n || '') : (e.tipo === 'venda' ? 'Venda' : 'Etapa') + ': <b>' + esc(dd.nome || e.etapa) + '</b>' + (e.valor ? ' · ' + brl(e.valor) : '') + ' <span class="sub">' + (dd.por === 'frase' ? 'frase gatilho' : (dd.por === 'auto' ? 'automático' : 'por ' + esc(dd.por || ''))) + '</span>';
        return '<div class="ras-ev"><span class="t">' + rasQ(e.em) + '</span><span>' + txt + '</span></div>';
      }).join('') || '<div class="sub">sem eventos</div>') +
      (cvs.length ? '<div class="ras-sec">Eventos de conversão</div>' + cvs.map(function(v){ return '<div class="ras-ev"><span class="t">' + rasQ(v.criado_em) + '</span><span>' + esc(v.plataforma === 'meta' ? 'Meta Ads' : v.plataforma) + ' · ' + esc(v.evento) + ' · ' + rasStatusPill(v.status) + '</span></div>'; }).join('') : '');
    rasGaveta('Detalhes do lead', corpo, '<button class="btn" onclick="fecha()">Fechar</button>');
  }).catch(function(e){ rasGaveta('Detalhes do lead', '<div class="note">' + esc(e.message) + '</div>', '<button class="btn" onclick="fecha()">Fechar</button>'); });
}
function rasAbreConversa(id){
  rasGaveta('Auditoria da Conversa', rasCarregando(), '<button class="btn" onclick="fecha()">Fechar</button>', true);
  Promise.all([rasApi('GET', '/api/leads/' + id), rasApi('GET', '/api/leads/' + id + '/mensagens')]).then(function(rs){
    var l = rs[0].lead, msgs = rs[1].itens || [];
    var cab = '<div style="display:flex;gap:12px;align-items:center;margin-bottom:12px"><div class="lk-i" style="background:var(--volt-dim);color:#a78bfa;width:38px;height:38px">' + esc((rasNome(l) || 'C').slice(0, 2).toUpperCase()) + '</div><div><div class="mono" style="font-weight:600">' + rasFone(l.telefone) + '</div><div class="sub">' + esc(rasNome(l) || '—') + ' · ' + esc(l.etapa_nome || l.etapa) + '</div></div></div>';
    var TIPOS = { audioMessage: '🎧 Mensagem de Áudio', imageMessage: '🖼 Imagem', videoMessage: '🎬 Vídeo', documentMessage: '📄 Documento', stickerMessage: '✨ Figurinha' };
    var chat = '<div class="ras-chat" id="rasChat">' + (msgs.map(function(m){
      var corpo = m.texto ? esc(m.texto) : '<span class="md">' + (TIPOS[m.tipo] || '[' + esc(m.tipo) + ']') + '</span>';
      return '<div class="ras-m ' + (m.de_mim ? 'eu' : '') + '">' + corpo + '<small>' + rasQ(m.em) + '</small></div>';
    }).join('') || '<div class="empty">Sem mensagens no servidor</div>') + '</div>';
    rasGaveta('Auditoria da Conversa', cab + chat, '<button class="btn" onclick="rasAbreLead(' + l.id + ')">Detalhes</button><button class="btn btn-p" onclick="rasMenuEtapa(' + l.id + ',\'' + esc(l.etapa) + '\')">Alterar Etapa da Jornada</button>', true);
    /* quem rola é o corpo do painel lateral: abre já na última mensagem */
    var rolaFim = function(){ var b = $('rasDrB'); if(b) b.scrollTop = b.scrollHeight; };
    rolaFim(); requestAnimationFrame(rolaFim); setTimeout(rolaFim, 150);
  }).catch(function(e){ rasGaveta('Auditoria da Conversa', '<div class="note">' + esc(e.message) + '</div>', '<button class="btn" onclick="fecha()">Fechar</button>', true); });
}

/* ================= LINKS RASTREÁVEIS ================= */
function vRasLinks(){
  var c = rasClienteAtual(); if(!c) return rasSemCliente('Links Rastreáveis');
  var h = rasTopo('Links do Cliente', '<button class="btn btn-p" onclick="rasNovoLink()">Criar Novo Link</button>');
  var r = rasDados('d:links:' + c.id, '/api/links?cliente_id=' + c.id);
  if(!r) return h + rasCarregando(); if(r.erro) return h + rasErro(r);
  var its = r.dados.itens || [];
  return h + '<div class="tw"><div class="tsc"><table><thead><tr><th>Nome</th><th>Endereço</th><th class="tr">Cliques</th><th class="tr">Conversas</th><th>Pixel</th><th>Criado em</th><th>Ações</th></tr></thead><tbody>' +
    (its.map(function(k){
      return '<tr class="' + (k.ativo ? '' : 'lk off') + '"><td><div class="nm">' + esc(k.nome) + '</div><div class="sub mono">' + rasFone(k.numero) + '</div></td>' +
        '<td><span class="ras-url">' + esc(k.url) + '</span> <button class="ib" title="Copiar" onclick="navigator.clipboard.writeText(\'' + esc(k.url) + '\').then(function(){toast(\'Link copiado\',\'ok\')})">⧉</button></td>' +
        '<td class="tr mono">' + k.cliques + '</td><td class="tr mono">' + k.conversas + '</td><td class="mono">' + (k.pixel_id ? esc(k.pixel_id) : '<span class="sub">—</span>') + '</td><td class="mono" style="font-size:12px">' + rasQ(k.criado_em) + '</td>' +
        '<td><div class="lk-a"><button class="ib" title="Código do pixel para o site" onclick="rasPixelSite(' + k.id + ')">&lt;/&gt;</button><label class="sw" title="' + (k.ativo ? 'Ativo' : 'Desligado') + '"><input type="checkbox" ' + (k.ativo ? 'checked' : '') + ' onchange="rasApi(\'PUT\',\'/api/links/' + k.id + '\',{ativo:this.checked}).then(function(){rasRecarrega(\'d:links\')}).catch(function(e){toast(e.message,\'err\')})"><i></i></label></div></td></tr>';
    }).join('') || '<tr><td colspan="7"><div class="empty"><b>Nenhum link ainda</b>Crie um link para o site, a bio do Instagram ou anúncios de tráfego para o WhatsApp. Cada clique ganha um código que liga a conversa à origem.</div></td></tr>') + '</tbody></table></div></div>';
}
function rasNovoLink(){
  var c = rasClienteAtual(), cx = rasConexoesDo(c.id) || [];
  var px = (c.config && c.config.capi && c.config.capi.dataset_id) || '';
  modal('Criar Novo Link',
    '<div class="fr fr2"><div class="fg"><label class="fl">Nome do link</label><input class="fi" id="ras_lk_nome" placeholder="Botão do site, Bio Instagram…"></div>' +
    '<div class="fg"><label class="fl">WhatsApp de destino</label>' + (cx.length ? '<select class="fi" id="ras_lk_num">' + cx.map(function(x){ return '<option value="' + esc(x.numero || '') + '">' + esc(x.nome_perfil || x.instancia) + ' · ' + rasFone(x.numero) + '</option>'; }).join('') + '</select>' : '<input class="fi" id="ras_lk_num" placeholder="5548999999999">') + '<div class="hint">Precisa ser um número conectado no rastreio.</div></div></div>' +
    '<div class="fg"><label class="fl">Pixel da Meta (opcional)</label><input class="fi" id="ras_lk_px" value="' + esc(px) + '" placeholder="ID do pixel"><div class="hint">Com pixel, o clique dispara PageView e Contact antes de abrir o WhatsApp.</div></div>' +
    '<div class="fg"><label class="fl">Mensagem pré-preenchida</label><textarea class="fi" id="ras_lk_msg">Olá! Vim pelo link e quero mais informações. Código: {codigo}</textarea><div class="hint">Mantenha {codigo}: é ele que liga a conversa ao clique.</div></div>',
    '<button class="btn" onclick="fecha()">Cancelar</button><button class="btn btn-p" onclick="rasSalvaLink()">Criar link</button>');
}
function rasSalvaLink(){
  rasApi('POST', '/api/links', { cliente_id: Number(RAS.cliente), nome: $('ras_lk_nome').value, numero: $('ras_lk_num').value, pixel_id: $('ras_lk_px').value, mensagem: $('ras_lk_msg').value })
    .then(function(){ fecha(); toast('Link criado', 'ok'); rasRecarrega('d:links'); }).catch(function(e){ toast(e.message, 'err'); });
}
function rasPixelSite(id){
  var r = RAS.cache['d:links:' + RAS.cliente], k = r && r.dados ? r.dados.itens.filter(function(x){ return x.id === id; })[0] : null; if(!k) return;
  var tag = '<script src="' + k.pixel_url + '" async></' + 'script>';
  modal('Pixel do site · ' + esc(k.nome),
    '<p class="sub mb12">Cole o código abaixo no site do cliente, antes de fechar a tag <b>&lt;/body&gt;</b>. Ele guarda fbclid, gclid e UTMs de quem chega ao site e troca todos os botões de WhatsApp da página por este link rastreável, levando esses dados junto.</p>' +
    '<div class="ras-code" id="ras_px_code">' + esc(tag) + '</div>',
    '<button class="btn" onclick="fecha()">Fechar</button><button class="btn btn-p" onclick="navigator.clipboard.writeText(document.getElementById(\'ras_px_code\').textContent).then(function(){toast(\'Código copiado\',\'ok\')})">Copiar código</button>');
}

/* ================= MENSAGENS RASTREÁVEIS (GOOGLE) · fase 2 ================= */
function vRasGoogle(){
  var c = rasClienteAtual(); if(!c) return rasSemCliente('Mensagens Rastreáveis para Google Ads');
  return rasTopo('Mensagens Rastreáveis para Google Ads') + '<div class="tw"><div class="empty"><b>Em preparação (fase 2)</b>Esta tela vai gerar mensagens com código para os anúncios do Google Ads e enviar as conversões offline com GCLID. Enquanto isso, os links rastreáveis já capturam o GCLID de quem clica em anúncios do Google, e o relatório "Conversões Offline com GCLID" sai pronto para importar no Google Ads.</div></div>';
}

/* ================= INSPETOR DE CAMPANHAS (parcial) ================= */
function vRasCampanhas(){
  var c = rasClienteAtual(); if(!c) return rasSemCliente('Inspetor de Campanhas');
  var h = rasTopo('Inspetor de Campanhas', '<button class="btn btn-s" onclick="rasApi(\'POST\',\'/api/anuncios/atualizar\').then(function(j){toast((j.ok||0)+\' anúncios atualizados\',\'ok\');rasRecarrega(\'d:an\')}).catch(function(e){toast(e.message,\'err\')})">Atualizar nomes</button>');
  var r = rasDados('d:an:' + c.id, '/api/anuncios?cliente_id=' + c.id);
  if(!r) return h + rasCarregando(); if(r.erro) return h + rasErro(r);
  var its = r.dados.itens || [];
  h += '<div class="note">Versão inicial: mostra as conversas por campanha, conjunto e anúncio da Meta. Gasto, alcance, CTR e custo por lead entram na fase 2, com a leitura de desempenho da conta de anúncios.</div>';
  return h + '<div class="tw"><div class="tsc"><table><thead><tr><th>Campanha</th><th>Conjunto</th><th>Anúncio</th><th>Conta</th><th class="tr">Conversas</th></tr></thead><tbody>' +
    (its.map(function(a){ return '<tr><td>' + esc(a.campanha || (a.erro ? '— sem acesso à conta de anúncios' : '—')) + '</td><td>' + esc(a.conjunto || '—') + '</td><td>' + esc(a.nome || a.anuncio_id) + '</td><td>' + esc(a.conta || '—') + '</td><td class="tr mono">' + a.leads + '</td></tr>'; }).join('') || '<tr><td colspan="5"><div class="empty"><b>Nenhum anúncio ainda</b>Aparece aqui quando chegarem conversas vindas de anúncios Click-to-WhatsApp.</div></td></tr>') + '</tbody></table></div></div>';
}

/* ================= JORNADA DE COMPRA ================= */
function vRasJornada(){
  var c = rasClienteAtual(); if(!c) return rasSemCliente('Jornada de Compra');
  var h = rasTopo('Jornada de Compra', '<button class="btn btn-p" onclick="rasEditaEtapa(0)">Adicionar Nova Etapa</button>');
  var et = rasEtapasDo(c.id);
  if(!et) return h + rasCarregando();
  return h + '<div class="tw"><div class="tsc"><table><thead><tr><th>Ordem no Funil</th><th>Nome da Etapa</th><th>Tipo</th><th>Frase gatilho</th><th>Evento de Conversão</th><th class="tr">Conversas</th><th>Ações</th></tr></thead><tbody>' +
    et.map(function(e, i){
      return '<tr><td class="mono">' + e.ordem + ' <button class="ib" title="Subir" ' + (i === 0 ? 'disabled' : '') + ' onclick="rasMoveEtapa(' + i + ',-1)">↑</button><button class="ib" title="Descer" ' + (i === et.length - 1 ? 'disabled' : '') + ' onclick="rasMoveEtapa(' + i + ',1)">↓</button></td>' +
        '<td><div class="nm">' + esc(e.nome) + '</div><div class="sub mono">' + esc(e.slug) + '</div></td><td><span class="pill ' + (e.tipo === 'venda' ? 'p-on' : (e.tipo === 'perdido' ? 'p-cr' : (e.tipo === 'contato' ? 'p-cy' : 'p-vl'))) + '">' + RAS_TIPO_ETAPA[e.tipo] + '</span></td>' +
        '<td class="mono">' + (e.frase ? esc(e.frase) : '<span class="sub">—</span>') + '</td><td>' + (e.evento_meta ? '<span class="pill p-cy">Meta · ' + esc(e.evento_meta) + '</span>' : '<span class="sub">—</span>') + (e.evento_google ? ' <span class="pill p-av">Google · ' + esc(e.evento_google) + '</span>' : '') + '</td>' +
        '<td class="tr mono">' + e.leads + '</td><td><div class="lk-a"><button class="ib" onclick="rasEditaEtapa(' + e.id + ')">✎</button>' + (euSouAdmin() ? '<button class="ib d" onclick="rasApagaEtapa(' + e.id + ')">×</button>' : '') + '</div></td></tr>';
    }).join('') + '</tbody></table></div><div class="mtot"><div class="sub">A frase gatilho é digitada pelo atendente dentro da conversa. Para venda, escreva o valor depois da frase, por exemplo <b class="mono">#venda 1500</b>. A primeira etapa (primeiro contato) é automática.</div></div></div>';
}
function rasEditaEtapa(id){
  var c = rasClienteAtual(), et = rasEtapasDo(c.id) || [];
  var e = id ? et.filter(function(x){ return x.id === id; })[0] : { nome: '', tipo: 'intermediaria', frase: '', evento_meta: '', evento_google: '' }; if(!e) return;
  modal(id ? 'Editar etapa' : 'Adicionar Nova Etapa',
    '<div class="fr fr2"><div class="fg"><label class="fl">Nome da etapa</label><input class="fi" id="ras_et_nome" value="' + esc(e.nome) + '" placeholder="Orçamento enviado, Agendado…"></div>' +
    '<div class="fg"><label class="fl">Tipo</label><select class="fi" id="ras_et_tipo">' + Object.keys(RAS_TIPO_ETAPA).map(function(k){ return '<option value="' + k + '" ' + (e.tipo === k ? 'selected' : '') + '>' + RAS_TIPO_ETAPA[k] + '</option>'; }).join('') + '</select></div></div>' +
    '<div class="fg"><label class="fl">Frase gatilho (opcional)</label><input class="fi" id="ras_et_frase" value="' + esc(e.frase || '') + '" placeholder="#orcamento"><div class="hint">Quando o atendente escrever isso na conversa, o lead muda para esta etapa.</div></div>' +
    '<div class="fr fr2"><div class="fg"><label class="fl">Evento de conversão · Meta</label><select class="fi" id="ras_et_meta"><option value="">— não enviar —</option>' + RAS_EVENTOS_META.map(function(x){ return '<option value="' + x[0] + '" ' + (e.evento_meta === x[0] ? 'selected' : '') + '>' + x[0] + '</option>'; }).join('') + '</select></div>' +
    '<div class="fg"><label class="fl">Ação de conversão · Google (fase 2)</label><input class="fi" id="ras_et_google" value="' + esc(e.evento_google || '') + '" placeholder="nome da ação no Google Ads"></div></div>',
    '<button class="btn" onclick="fecha()">Cancelar</button><button class="btn btn-p" onclick="rasSalvaEtapaDef(' + (id || 0) + ')">Salvar</button>');
}
function rasSalvaEtapaDef(id){
  var corpo = { nome: $('ras_et_nome').value, tipo: $('ras_et_tipo').value, frase: $('ras_et_frase').value, evento_meta: $('ras_et_meta').value, evento_google: $('ras_et_google').value };
  (id ? rasApi('PUT', '/api/clientes/' + RAS.cliente + '/etapas/' + id, corpo) : rasApi('POST', '/api/clientes/' + RAS.cliente + '/etapas', corpo))
    .then(function(){ fecha(); toast('Etapa salva', 'ok'); rasLimpa('d:et'); rasLimpa('d:res'); render(); }).catch(function(e){ toast(e.message, 'err'); });
}
function rasMoveEtapa(i, dir){
  var et = (rasEtapasDo(RAS.cliente) || []).slice(); var j = i + dir; if(j < 0 || j >= et.length) return;
  var t = et[i]; et[i] = et[j]; et[j] = t;
  rasApi('POST', '/api/clientes/' + RAS.cliente + '/etapas/ordem', { ids: et.map(function(e){ return e.id; }) }).then(function(){ rasLimpa('d:et'); render(); }).catch(function(e){ toast(e.message, 'err'); });
}
function rasApagaEtapa(id){
  modal('Excluir etapa', '<div class="note">Só é possível excluir etapas sem conversas. Mova as conversas antes, se houver.</div>', '<button class="btn" onclick="fecha()">Cancelar</button><button class="btn btn-d" onclick="rasApi(\'DELETE\',\'/api/clientes/' + RAS.cliente + '/etapas/' + id + '\').then(function(){fecha();toast(\'Etapa excluída\',\'ok\');rasLimpa(\'d:et\');render()}).catch(function(e){toast(e.message,\'err\')})">Excluir</button>');
}

/* ================= EVENTOS DE CONVERSÕES ================= */
function vRasEventos(){
  var c = rasClienteAtual(); if(!c) return rasSemCliente('Eventos de Conversões');
  var et = rasEtapasDo(c.id) || [];
  var uso = {}; et.forEach(function(e){ if(e.evento_meta) (uso[e.evento_meta] = uso[e.evento_meta] || []).push(e.nome); });
  return rasTopo('Eventos e Conversões da Conta', '<button class="btn btn-p" onclick="go(\'ras_jornada\')">Ligar evento a uma etapa</button>') +
    '<div class="tw"><div class="tsc"><table><thead><tr><th>Plataforma</th><th>Nome</th><th>Descrição</th><th>Usado na etapa</th></tr></thead><tbody>' +
    RAS_EVENTOS_META.map(function(x){ return '<tr><td><span class="pill p-cy">Meta Ads</span></td><td class="nm mono">' + x[0] + '</td><td class="sub" style="max-width:520px">' + x[1] + '</td><td>' + (uso[x[0]] ? uso[x[0]].map(function(n){ return '<span class="pill p-vl">' + esc(n) + '</span> '; }).join('') : '<span class="sub">—</span>') + '</td></tr>'; }).join('') +
    '</tbody></table></div><div class="mtot"><div class="sub">Os eventos são enviados pela Conversions API da Meta quando a conversa entra numa etapa que tem evento configurado. Precisa do pixel e do token cadastrados em Informações do Cliente.</div></div></div>';
}

/* ================= DISPAROS DE EVENTOS ================= */
function vRasDisparos(){
  var c = rasClienteAtual(); if(!c) return rasSemCliente('Disparos de eventos');
  var h = rasTopo('Disparos de eventos', '<button class="btn btn-s" onclick="rasRecarrega(\'d:disp\')">Atualizar</button>');
  var r = rasDados('d:disp:' + c.id, '/api/disparos?cliente_id=' + c.id);
  if(!r) return h + rasCarregando(); if(r.erro) return h + rasErro(r);
  var its = r.dados.itens || [];
  return h + '<div class="tw"><div class="tsc"><table><thead><tr><th>Data de Disparo</th><th>Conversa</th><th>Retorno</th><th>Etapa da jornada</th><th>Evento da plataforma</th><th>Plataforma</th><th>Detalhes</th></tr></thead><tbody>' +
    (its.map(function(v){ var rp = v.resposta || {}; var det = rp.erro ? esc(rp.erro) : (rp.aguardando ? esc(rp.aguardando) : (rp.resposta && rp.resposta.events_received != null ? rp.resposta.events_received + ' evento recebido pela Meta' : '')); return '<tr><td class="mono" style="font-size:12px">' + rasQ(v.enviado_em || v.criado_em) + '</td><td><span class="mono">' + rasFone(v.lead_telefone) + '</span><div class="sub">' + esc(v.lead_nome || '') + '</div></td><td>' + rasStatusPill(v.status) + (v.status === 'erro' && euSouAdmin() ? ' <button class="btn btn-s" onclick="rasApi(\'POST\',\'/api/disparos/' + v.id + '/reenviar\').then(function(){toast(\'Reenviando\',\'ok\');rasRecarrega(\'d:disp\')})">Reenviar</button>' : '') + '</td><td>' + esc(v.etapa_nome || v.etapa || '—') + '</td><td class="mono">' + esc(v.evento) + '</td><td>' + (v.plataforma === 'meta' ? '<span class="pill p-cy">Meta Ads</span>' : '<span class="pill p-av">Google Ads</span>') + '</td><td class="sub" style="max-width:260px">' + det + '</td></tr>'; }).join('') || '<tr><td colspan="7"><div class="empty"><b>Nenhum disparo ainda</b>Os eventos aparecem aqui quando uma conversa rastreada entra numa etapa com evento configurado e o cliente tem pixel e token cadastrados.</div></td></tr>') + '</tbody></table></div></div>';
}

/* ================= DISPAROS DE WEBHOOK ================= */
function vRasWebhooks(){
  var c = rasClienteAtual(); if(!c) return rasSemCliente('Disparos de Webhook');
  var h = rasTopo('Disparos de Webhook do Cliente', '<button class="btn btn-s" onclick="go(\'ras_info\')">Configurar webhooks</button><button class="btn btn-s" onclick="rasRecarrega(\'d:wd\')">Atualizar</button>');
  var r = rasDados('d:wd:' + c.id, '/api/webhook-disparos?cliente_id=' + c.id);
  if(!r) return h + rasCarregando(); if(r.erro) return h + rasErro(r);
  var its = r.dados.itens || [];
  return h + '<div class="tw"><div class="tsc"><table><thead><tr><th>Data</th><th>Webhook</th><th>Evento</th><th>Conversa</th><th>Retorno</th><th>Resposta</th></tr></thead><tbody>' +
    (its.map(function(d){ return '<tr><td class="mono" style="font-size:12px">' + rasQ(d.enviado_em || d.criado_em) + '</td><td><div class="nm">' + esc(d.webhook) + '</div><div class="sub ras-url">' + esc(d.url) + '</div></td><td class="mono">' + esc(d.evento) + '</td><td><span class="mono">' + rasFone(d.lead_telefone) + '</span><div class="sub">' + esc(d.lead_nome || '') + '</div></td><td>' + rasStatusPill(d.status) + (d.http ? ' <span class="sub mono">HTTP ' + d.http + '</span>' : '') + '</td><td class="sub" style="max-width:260px">' + esc(d.resposta || '') + '</td></tr>'; }).join('') || '<tr><td colspan="6"><div class="empty"><b>Nenhum disparo encontrado</b>Configure webhooks em Informações do Cliente para enviar os dados do rastreio para outros softwares.</div></td></tr>') + '</tbody></table></div></div>';
}

/* ================= ACESSOS DO CLIENTE ================= */
function vRasAcessos(){
  var c = rasClienteAtual(); if(!c) return rasSemCliente('Acessos do Cliente');
  var h = rasTopo('Usuários do Cliente', euSouAdmin() ? '<button class="btn btn-p" onclick="rasNovoAcesso()">Adicionar Novo Usuário</button>' : '');
  var r = rasDados('d:us:' + c.id, '/api/clientes/' + c.id + '/usuarios');
  if(!r) return h + rasCarregando(); if(r.erro) return h + rasErro(r);
  var its = r.dados.itens || [];
  return h + '<div class="tw"><div class="tsc"><table><thead><tr><th>E-mail</th><th>Liberado em</th><th></th></tr></thead><tbody>' +
    (its.map(function(u){ return '<tr><td class="nm">' + esc(u.email) + '</td><td class="mono" style="font-size:12px">' + rasQ(u.criado_em) + '</td><td class="tr">' + (euSouAdmin() ? '<button class="ib d" onclick="rasApi(\'DELETE\',\'/api/clientes/' + c.id + '/usuarios/' + encodeURIComponent(u.email) + '\').then(function(){toast(\'Acesso removido\',\'ok\');rasRecarrega(\'d:us\')})">×</button>' : '') + '</td></tr>'; }).join('') || '<tr><td colspan="3"><div class="empty"><b>Nenhum usuário com acesso a este cliente</b>Adicione o e-mail do cliente para ele ver só a própria conta no rastreio. Ele entra pelo mesmo login do painel; a conta precisa existir no Firebase Authentication.</div></td></tr>') + '</tbody></table></div></div>';
}
function rasNovoAcesso(){
  modal('Adicionar Novo Usuário', '<div class="fg"><label class="fl">E-mail do cliente</label><input class="fi" id="ras_ac_mail" placeholder="email@cliente.com"></div><div class="hint">Esse e-mail passa a ver apenas este cliente no Rastreio. Crie a conta dele no Firebase Authentication com a senha que ele vai usar no painel.</div>',
    '<button class="btn" onclick="fecha()">Cancelar</button><button class="btn btn-p" onclick="rasApi(\'POST\',\'/api/clientes/' + RAS.cliente + '/usuarios\',{email:$(\'ras_ac_mail\').value}).then(function(){fecha();toast(\'Acesso liberado\',\'ok\');rasRecarrega(\'d:us\')}).catch(function(e){toast(e.message,\'err\')})">Liberar</button>');
}

/* ================= INFORMAÇÕES DO CLIENTE ================= */
function rasPillEstado(st){ var e = RAS_ESTADO[st] || { n: st, c: 'p-off' }; return '<span class="pill ' + e.c + '">' + esc(e.n) + '</span>'; }
function vRasInfo(){
  var c = rasClienteAtual(); if(!c) return rasSemCliente('Informações do Cliente');
  var h = rasTopo('Informações do Cliente');
  var cx = rasConexoesDo(c.id), wh = rasDados('d:wh:' + c.id, '/api/clientes/' + c.id + '/webhooks'), lk = rasDados('d:links:' + c.id, '/api/links?cliente_id=' + c.id);
  var capi = (c.config && c.config.capi) || {}, v = c.cliente_2step && S.clientes[c.cliente_2step];
  h += '<div class="ras-cards">';
  h += '<div class="card"><div class="rw-hd"><div class="rw-t">Informações Básicas</div>' + (euSouAdmin() ? '<button class="btn btn-s" onclick="rasEditaCliente(' + c.id + ')">Editar</button>' : '') + '</div>' +
    '<div class="ras-kv"><b>Nome</b><span>' + esc(c.nome) + '</span><b>Cliente no 2STEP</b><span>' + (v ? esc(v.nome) : '<span class="sub">sem vínculo</span>') + '</span><b>Código do cliente</b><span class="mono">' + c.id + ' · ' + esc(c.slug) + '</span></div></div>';
  h += '<div class="card"><div class="rw-hd"><div class="rw-t">WhatsApp</div><button class="btn btn-s btn-p" onclick="rasNovaConexao()">Conectar número</button></div>' +
    (cx === null ? rasCarregando() : (cx.length ? cx.map(function(x){ return '<div class="lk" style="padding:10px 0"><div class="lk-b"><div class="lk-n">' + esc(x.nome_perfil || x.instancia) + ' ' + rasPillEstado(x.estado) + '</div><div class="lk-u">' + rasFone(x.numero) + ' · ' + x.leads + ' conversas · ' + x.total_processadas + ' mensagens</div></div><div class="lk-a">' + (x.estado !== 'open' ? '<button class="btn btn-s btn-p" onclick="rasQr(' + x.id + ')">Ler QR</button>' : '') + '<button class="btn btn-s" onclick="rasAcaoCx(' + x.id + ',\'sincronizar\')">Sincronizar</button>' + (euSouAdmin() ? '<button class="btn btn-s btn-d" onclick="rasAcaoCx(' + x.id + ',\'sair\')">Desconectar</button>' : '') + '</div></div>'; }).join('') : '<div class="empty">Nenhum número conectado</div>')) + '</div>';
  h += '<div class="card"><div class="rw-hd"><div class="rw-t">Meta Ads</div>' + (euSouAdmin() ? '<button class="btn btn-s" onclick="rasEditaCapi()">Editar</button>' : '') + '</div>' +
    '<div class="ras-kv"><b>Pixel / Dataset</b><span class="mono">' + (capi.dataset_id ? esc(capi.dataset_id) : '<span class="sub">não configurado</span>') + '</span><b>Token da API</b><span class="mono">' + (capi.token ? esc(capi.token) : '<span class="sub">—</span>') + '</span><b>Código de teste</b><span class="mono">' + (capi.test_code ? esc(capi.test_code) : '<span class="sub">—</span>') + '</span><b>Disparar para não rastreadas</b><span>' + (capi.nao_rastreados ? 'Sim' : 'Não') + '</span></div>' +
    '<div class="hint mt12">Os eventos de cada etapa da jornada são enviados pela Conversions API com o identificador do clique do anúncio. Use o código de teste da Meta para validar antes de ligar.</div></div>';
  h += '<div class="card"><div class="rw-hd"><div class="rw-t">Webhooks <span class="sub">' + (wh && wh.dados ? wh.dados.itens.length : 0) + ' de 5</span></div><button class="btn btn-s" onclick="rasEditaWebhook(0)">Adicionar Webhook</button></div>' +
    (wh && wh.dados ? (wh.dados.itens.map(function(w){ return '<div class="lk" style="padding:10px 0"><div class="lk-b"><div class="lk-n">' + esc(w.nome) + ' ' + (w.ativo ? '<span class="pill p-on">ativo</span>' : '<span class="pill p-off">desligado</span>') + '</div><div class="lk-u">' + esc(w.url) + '</div><div class="sub">' + ((w.eventos || []).length ? w.eventos.join(', ') : 'todos os eventos') + '</div></div><div class="lk-a"><button class="ib" onclick="rasEditaWebhook(' + w.id + ')">✎</button>' + (euSouAdmin() ? '<button class="ib d" onclick="rasApi(\'DELETE\',\'/api/clientes/' + c.id + '/webhooks/' + w.id + '\').then(function(){rasRecarrega(\'d:wh\')})">×</button>' : '') + '</div></div>'; }).join('') || '<div class="empty">Nenhum webhook configurado</div>') : rasCarregando()) + '</div>';
  h += '<div class="card"><div class="rw-hd"><div class="rw-t">Pixel do site</div></div><p class="sub">Um código para o site do cliente que guarda fbclid, gclid e UTMs e troca os botões de WhatsApp por um link rastreável. Escolha o link que receberá os cliques do site:</p>' +
    (lk && lk.dados ? (lk.dados.itens.length ? '<div class="mt12">' + lk.dados.itens.map(function(k){ return '<button class="btn btn-s" style="margin:0 6px 6px 0" onclick="rasPixelSite(' + k.id + ')">&lt;/&gt; ' + esc(k.nome) + '</button>'; }).join('') + '</div>' : '<div class="hint mt12">Crie um link em Links Rastreáveis primeiro.</div>') : '') + '</div>';
  h += '</div>';
  return h;
}
function rasEditaCapi(){
  var c = rasClienteAtual(), capi = (c.config && c.config.capi) || {};
  modal('Meta Ads · Conversions API',
    '<div class="fr fr2"><div class="fg"><label class="fl">ID do Pixel / Dataset</label><input class="fi" id="ras_cp_ds" value="' + esc(capi.dataset_id || '') + '"></div><div class="fg"><label class="fl">Código de teste (opcional)</label><input class="fi" id="ras_cp_tc" value="' + esc(capi.test_code || '') + '" placeholder="TEST12345"></div></div>' +
    '<div class="fg"><label class="fl">Token de acesso da Conversions API</label><input class="fi" id="ras_cp_tk" placeholder="' + (capi.token ? 'salvo (' + esc(capi.token) + '). Deixe em branco para manter.' : 'cole o token gerado no Gerenciador de Eventos') + '"></div>' +
    '<div class="fr fr2"><div class="fg"><label class="fl">ID da conta do WhatsApp Business (opcional)</label><input class="fi" id="ras_cp_waba" value="' + esc(capi.waba_id || '') + '"></div><div class="fg"><label class="fl">ID da Página (opcional)</label><input class="fi" id="ras_cp_page" value="' + esc(capi.page_id || '') + '"></div></div>' +
    '<label class="chk ' + (capi.nao_rastreados ? 'on' : '') + '"><input type="checkbox" id="ras_cp_nr" ' + (capi.nao_rastreados ? 'checked' : '') + '> Disparar eventos também para conversas não rastreadas (sem identificador de clique)</label>',
    '<button class="btn" onclick="fecha()">Cancelar</button><button class="btn btn-p" onclick="rasSalvaCapi()">Salvar</button>');
}
function rasSalvaCapi(){
  rasApi('PUT', '/api/clientes/' + RAS.cliente, { config: { capi: { dataset_id: $('ras_cp_ds').value.trim(), token: $('ras_cp_tk').value.trim(), test_code: $('ras_cp_tc').value.trim() || null, waba_id: $('ras_cp_waba').value.trim() || null, page_id: $('ras_cp_page').value.trim() || null, nao_rastreados: $('ras_cp_nr').checked } } })
    .then(function(){ fecha(); toast('Configuração salva', 'ok'); rasLimpa(); render(); }).catch(function(e){ toast(e.message, 'err'); });
}
function rasEditaWebhook(id){
  var r = RAS.cache['d:wh:' + RAS.cliente], w = id && r && r.dados ? r.dados.itens.filter(function(x){ return x.id === id; })[0] : { nome: '', url: '', eventos: [], ativo: true };
  if(!w) return;
  modal(id ? 'Editar webhook' : 'Adicionar Webhook',
    '<div class="fr fr2"><div class="fg"><label class="fl">Nome</label><input class="fi" id="ras_wh_nome" value="' + esc(w.nome) + '" placeholder="CRM, planilha, n8n…"></div><div class="fg"><label class="fl">Segredo (opcional)</label><input class="fi" id="ras_wh_seg" placeholder="' + (w.tem_segredo ? 'salvo; em branco mantém' : 'para assinar o envio') + '"></div></div>' +
    '<div class="fg"><label class="fl">URL de destino</label><input class="fi" id="ras_wh_url" value="' + esc(w.url) + '" placeholder="https://…"></div>' +
    '<div class="fg"><label class="fl">Eventos (nenhum marcado = todos)</label>' + RAS_WEBHOOK_EVENTOS.map(function(x){ return '<label class="chk" style="margin-bottom:6px"><input type="checkbox" class="ras_wh_ev" value="' + x[0] + '" ' + ((w.eventos || []).indexOf(x[0]) > -1 ? 'checked' : '') + '> ' + x[1] + ' <span class="sub mono">' + x[0] + '</span></label>'; }).join('') + '</div>' +
    (id ? '<label class="chk"><input type="checkbox" id="ras_wh_at" ' + (w.ativo ? 'checked' : '') + '> Ativo</label>' : ''),
    '<button class="btn" onclick="fecha()">Cancelar</button><button class="btn btn-p" onclick="rasSalvaWebhook(' + (id || 0) + ')">Salvar</button>');
}
function rasSalvaWebhook(id){
  var evs = []; document.querySelectorAll('.ras_wh_ev:checked').forEach(function(i){ evs.push(i.value); });
  var corpo = { nome: $('ras_wh_nome').value, url: $('ras_wh_url').value, eventos: evs, segredo: $('ras_wh_seg').value || undefined };
  if(id) corpo.ativo = $('ras_wh_at').checked;
  (id ? rasApi('PUT', '/api/clientes/' + RAS.cliente + '/webhooks/' + id, corpo) : rasApi('POST', '/api/clientes/' + RAS.cliente + '/webhooks', corpo))
    .then(function(){ fecha(); toast('Webhook salvo', 'ok'); rasRecarrega('d:wh'); }).catch(function(e){ toast(e.message, 'err'); });
}
function rasNovaConexao(){
  if(!rasClienteAtual()) return;
  modal('Conectar número de WhatsApp', '<p class="sub">Vai abrir um QR Code. No celular do cliente: WhatsApp › Mais opções (⋮) › Dispositivos conectados › Conectar dispositivo. O histórico recente entra sozinho depois da leitura.</p>',
    '<button class="btn" onclick="fecha()">Cancelar</button><button class="btn btn-p" onclick="rasCriaConexao()">Gerar QR Code</button>');
}
function rasCriaConexao(){
  modal('Conectar número de WhatsApp', rasCarregando(), '');
  rasApi('POST', '/api/conexoes', { cliente_id: Number(RAS.cliente) }).then(function(j){ rasLimpa('d:cx'); rasLimpa('clientes'); rasQr(j.conexao.id); }).catch(function(e){ toast(e.message, 'err'); fecha(); });
}
function rasFechaQr(){ clearTimeout(RAS.qrTimer); RAS.qrTimer = null; RAS.qrId = 0; fecha(); rasLimpa('d:cx'); render(); }
function rasQr(id){
  RAS.qrId = id;
  modal('Ler QR Code', '<div class="ras-qr" id="rasQrBox">gerando…</div><div class="tc" id="rasQrSt"><span class="pill p-av">aguardando leitura</span></div><div class="hint tc mt12">O código renova sozinho. No celular: WhatsApp › Mais opções (⋮) › Dispositivos conectados › Conectar dispositivo.</div>', '<button class="btn" onclick="rasFechaQr()">Fechar</button>');
  rasPollQr();
}
function rasPollQr(){
  var id = RAS.qrId; if(!id) return;
  rasApi('GET', '/api/conexoes/' + id + '/qr').then(function(j){
    if(RAS.qrId !== id) return;
    var box = $('rasQrBox'), st = $('rasQrSt'); if(!box) return;
    if(j.estado === 'open'){ box.innerHTML = '<div style="font-size:54px">✅</div>'; st.innerHTML = '<span class="pill p-on">conectado</span>'; rasLimpa('d:cx'); RAS.qrId = 0; return; }
    if(j.qr && j.qr.base64){ box.innerHTML = '<img alt="QR" src="' + j.qr.base64 + '">'; st.innerHTML = '<span class="pill p-av">aguardando leitura' + (j.qr.count ? ' · tentativa ' + j.qr.count : '') + '</span>'; }
    else if(j.qr && j.qr.erro){ st.innerHTML = '<span class="pill p-cr">' + esc(j.qr.erro) + '</span>'; }
    else { st.innerHTML = '<span class="pill p-off">' + esc((RAS_ESTADO[j.estado] || {}).n || j.estado) + '</span>'; }
    RAS.qrTimer = setTimeout(rasPollQr, 12000);
  }).catch(function(e){ var st = $('rasQrSt'); if(st) st.innerHTML = '<span class="pill p-cr">' + esc(e.message) + '</span>'; RAS.qrTimer = setTimeout(rasPollQr, 15000); });
}
function rasAcaoCx(id, acao){
  toast({ sincronizar: 'Sincronizando…', reiniciar: 'Reiniciando…', sair: 'Desconectando…' }[acao] || 'Aguarde…');
  rasApi('POST', '/api/conexoes/' + id + '/' + acao).then(function(j){ toast(acao === 'sincronizar' ? (j.processadas || 0) + ' mensagens novas processadas' : 'Feito', 'ok'); rasLimpa('d:'); render(); }).catch(function(e){ toast(e.message, 'err'); });
}

/* ================= RELATÓRIOS ================= */
function vRasRel(){
  var c = rasClienteAtual(); if(!c) return rasSemCliente('Relatórios');
  if(!RAS.de){ var hj = new Date(), d0 = new Date(); d0.setDate(hj.getDate() - 29); RAS.de = rasDataISO(d0); RAS.ate = rasDataISO(hj); }
  var qs = '?cliente_id=' + c.id + '&de=' + RAS.de + '&ate=' + RAS.ate;
  var bt = function(tipo, nome, desc){ return '<div class="card"><div class="rw-t">' + nome + '</div><div class="sub mt12" style="min-height:36px">' + desc + '</div><button class="btn btn-p mt12" onclick="rasBaixa(\'/api/relatorios/' + tipo + qs + '\',\'' + tipo + '-' + RAS.de + '-' + RAS.ate + '.csv\')">Gerar planilha</button></div>'; };
  return rasTopo('Relatórios') + '<div class="ras-filt"><span class="sub">Período:</span><input type="date" class="fi" value="' + RAS.de + '" onchange="RAS.de=this.value;render()"><span class="sub">até</span><input type="date" class="fi" value="' + RAS.ate + '" onchange="RAS.ate=this.value;render()"><div class="seg"><button onclick="rasPreset(30)">30 dias</button><button onclick="rasPreset(90)">90 dias</button><button onclick="rasPreset(365)">1 ano</button></div></div>' +
    '<div class="ras-cards">' + bt('conversas', 'Conversas', 'Todas as conversas do período com telefone, origem, campanha, anúncio, etapa, valor e datas.') + bt('gclid', 'Conversões Offline com GCLID', 'No formato aceito pela importação de conversões do Google Ads.') + bt('jornada', 'Histórico de Alterações da Jornada de Compra', 'Cada mudança de etapa, quem fez e quando.') + bt('vendas', 'Histórico de Vendas', 'Vendas marcadas no período, com valor, origem e tempo até a venda.') + '</div>';
}

/* ================= CLIENTES (admin · Sistema) ================= */
function vRasClientes(){
  var h = '<div class="hd"><div><h1>Clientes do rastreio</h1><p>Cada cliente tem seus números, jornada e integrações</p></div><div class="hd-act"><button class="btn" onclick="rasRecarrega(\'clientes\')">Atualizar</button><button class="btn btn-p" onclick="rasEditaCliente(0)">+ Novo cliente</button></div></div>';
  var cs = rasClientes();
  if(cs === null) return h + rasCarregando();
  return h + '<div class="tw"><div class="tsc"><table><thead><tr><th>Cliente</th><th>Vínculo no 2STEP</th><th>Meta CAPI</th><th class="tr">Números</th><th class="tr">Conversas</th><th></th></tr></thead><tbody>' +
    (cs.map(function(x){ var cf = x.config || {}, v = x.cliente_2step && S.clientes[x.cliente_2step]; return '<tr><td><div class="nm">' + esc(x.nome) + '</div><div class="sub mono">' + esc(x.slug) + '</div></td><td>' + (v ? esc(v.nome) : '<span class="sub">—</span>') + '</td><td>' + (cf.capi && cf.capi.dataset_id ? '<span class="pill p-on">ligado</span>' : '<span class="pill p-off">não</span>') + '</td><td class="tr mono">' + x.conexoes_ativas + '/' + x.conexoes + '</td><td class="tr mono">' + x.leads + '</td><td class="tr"><button class="btn btn-s" onclick="rasTrocaCliente(\'' + x.id + '\');go(\'ras_info\')">Abrir</button> <button class="btn btn-s" onclick="rasEditaCliente(' + x.id + ')">Editar</button></td></tr>'; }).join('') || '<tr><td colspan="6"><div class="empty"><b>Nenhum cliente</b>Crie o primeiro para poder conectar um número.</div></td></tr>') + '</tbody></table></div></div>';
}
function rasEditaCliente(id){
  var x = id ? (rasClientes() || []).filter(function(c){ return c.id === id; })[0] : { id: 0, nome: '', cliente_2step: '' }; if(!x) return;
  modal(id ? 'Editar cliente do rastreio' : 'Novo cliente do rastreio',
    '<div class="fg"><label class="fl">Nome do estabelecimento</label><input class="fi" id="ras_c_nome" value="' + esc(x.nome) + '"></div>' +
    '<div class="fg"><label class="fl">Cliente no 2STEP (financeiro)</label><select class="fi" id="ras_c_vinc"><option value="">— sem vínculo —</option>' + listaClientes().map(function(c){ return '<option value="' + esc(c.id) + '" ' + (x.cliente_2step === c.id ? 'selected' : '') + '>' + esc(c.nome) + '</option>'; }).join('') + '</select></div>' +
    (id ? '' : '<div class="hint">Ao criar, a jornada já nasce com "Fez Contato" (evento Contact) e "Comprou" (#venda, evento Purchase). Depois conecte o número em Informações do Cliente.</div>'),
    '<button class="btn" onclick="fecha()">Cancelar</button><button class="btn btn-p" onclick="rasSalvaCliente(' + id + ')">Salvar</button>');
}
function rasSalvaCliente(id){
  var corpo = { nome: $('ras_c_nome').value.trim(), cliente_2step: $('ras_c_vinc').value || null };
  (id ? rasApi('PUT', '/api/clientes/' + id, corpo) : rasApi('POST', '/api/clientes', corpo))
    .then(function(j){ fecha(); toast('Cliente salvo', 'ok'); rasLimpa(); if(!id && j.cliente) rasTrocaCliente(String(j.cliente.id)); else render(); }).catch(function(e){ toast(e.message, 'err'); });
}

/* ================= REGISTRO DO MÓDULO ================= */
(function(){
  var m = { id: 'ras', nome: 'Rastreio', sigla: 'R', cor: '#22D3EE', papeis: ['admin', 'operacao'], telas: [
    { v: 'ras_dash',      n: 'Dashboard',               f: function(){ return vRasDash(); } },
    { v: 'ras_leads',     n: 'Conversas',               f: function(){ return vRasLeads(); } },
    { v: 'ras_links',     n: 'Links Rastreáveis',       f: function(){ return vRasLinks(); } },
    { v: 'ras_google',    n: 'Mensagens Rastreáveis',   f: function(){ return vRasGoogle(); } },
    { v: 'ras_campanhas', n: 'Inspetor de Campanhas',   f: function(){ return vRasCampanhas(); } },
    { v: 'ras_jornada',   n: 'Jornada de Compra',       f: function(){ return vRasJornada(); } },
    { v: 'ras_eventos',   n: 'Eventos de Conversões',   f: function(){ return vRasEventos(); } },
    { v: 'ras_disparos',  n: 'Disparos de Eventos',     f: function(){ return vRasDisparos(); } },
    { v: 'ras_webhooks',  n: 'Disparos de Webhook',     f: function(){ return vRasWebhooks(); } },
    { v: 'ras_acessos',   n: 'Acessos do Cliente',      f: function(){ return vRasAcessos(); } },
    { v: 'ras_info',      n: 'Informações do Cliente',  f: function(){ return vRasInfo(); } },
    { v: 'ras_rel',       n: 'Relatórios',              f: function(){ return vRasRel(); } }
  ]};
  var i = -1;
  MODULOS.forEach(function(x, k){ if(x.id === 'sis') i = k; });
  if(i > -1) MODULOS.splice(i, 0, m); else MODULOS.push(m);
  var sis = MODULOS.filter(function(x){ return x.id === 'sis'; })[0];
  if(sis) sis.telas.push({ v: 'ras_clientes', n: 'Rastreio: clientes', f: function(){ return vRasClientes(); } });
})();
