/* ============================================================
   2STEP · TAREFAS (telas)
   Duas abas independentes no Operacional, com dados separados:
     Tarefas de social media (v: tarefas) -> rotina fixa dos clientes com
       Social media marcado (padrão: post seg/qua/sex, stories ter/qui) +
       avulsas; WhatsApp vai para o número da social media.
     Tarefas de tráfego (v: trafego) -> tarefas cadastradas dia a dia,
       cada uma vinculada a um cliente; WhatsApp vai para um grupo.
   Em cada aba: tarefas do dia com check, calendário do mês, botão para
   receber as pendências na hora e a configuração do WhatsApp (admin).
   Depende de app.js (S, DB, AUTH, MEM, EMAIL, ROOT, MODULOS, PAPEL, VIEW,
   ouve, render, modal, fecha, esc, uid, addDias, toast, listaClientes,
   euSouAdmin, $) e de saldo.js (SAL, salApi).
   A regra de montar o dia é a mesma de api/_tarefas-core.js.
   Dados: 2step_financeiro/tarefas e 2step_financeiro/tarefasTrafego.
   ============================================================ */

var TAR_Q = {
  social: {
    raiz: 'tarefas', v: 'tarefas', menu: 'Tarefas de social media', rotinas: true,
    titulo: 'Tarefas de social media',
    sub: 'Rotina fixa dos clientes de social media e tarefas avulsas. A social media recebe as tarefas no WhatsApp.',
    botaoEnvio: 'Receber pendências no WhatsApp'
  },
  trafego: {
    raiz: 'tarefasTrafego', v: 'trafego', menu: 'Tarefas de tráfego', rotinas: false,
    titulo: 'Tarefas de tráfego',
    sub: 'Tarefas do time de tráfego, por dia e por cliente. O grupo do WhatsApp recebe as tarefas do dia e as pendências.',
    botaoEnvio: 'Enviar pendências no grupo'
  }
};
var TAR = { q: 'social', dados: { social: {}, trafego: {} }, ligados: {}, inicioGravado: {}, dia: '', mes: '', ocupado: '', r: null };
var TAR_PADRAO = { post: { tipo: 'Post', dias: [1, 3, 5] }, stories: { tipo: 'Stories', dias: [2, 4] } };
var TAR_SEM = ['', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
var TAR_SEML = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
var TAR_MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

/* estilos só deste módulo */
(function(){
  var css = '' +
  '.tar-cli{padding:10px 16px 4px;font-family:var(--disp);font-weight:600;font-size:13.5px;color:var(--mute)}' +
  '.tar-t{display:flex;align-items:center;gap:12px;padding:10px 16px;border-bottom:1px solid var(--line)}' +
  '.tar-t:last-child{border-bottom:none}' +
  '.tar-ck{width:26px;height:26px;border-radius:8px;border:2px solid var(--line2);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:15px;color:transparent;background:var(--slab2)}' +
  '.tar-t.ok .tar-ck{background:var(--mint);border-color:var(--mint);color:#0A0C10}' +
  '.tar-t.ok .tar-tt{text-decoration:line-through;color:var(--mute)}' +
  '.tar-tt{font-weight:600;font-size:14px}' +
  '.tar-tag{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;padding:1px 6px;border-radius:5px;margin-left:6px;vertical-align:1px}' +
  '.tar-tag.f{background:var(--slab3);color:var(--mute)}.tar-tag.a{background:var(--amber-dim);color:var(--amber)}' +
  '.tar-ac{margin-left:auto;display:flex;gap:4px;flex-shrink:0}' +
  '.tar-g{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px}' +
  '.tar-h{font-size:10px;color:var(--mute2);text-transform:uppercase;letter-spacing:.1em;text-align:center;font-weight:700;padding:2px 0 4px}' +
  '.tar-d{background:var(--slab);border:1px solid var(--line);border-radius:9px;min-height:64px;padding:6px;text-align:left;display:flex;flex-direction:column;gap:4px;width:100%;min-width:0}' +
  '.tar-d.in{cursor:pointer}.tar-d.in:hover{border-color:var(--volt)}' +
  '.tar-d.out{opacity:.25;cursor:default}' +
  '.tar-d.sel{border-color:var(--volt);background:var(--volt-dim)}' +
  '.tar-d.hj .tar-n{color:var(--volt)}' +
  '.tar-n{font-family:var(--mono);font-size:11px;color:var(--mute);font-weight:700}' +
  '.tar-q{font-family:var(--mono);font-size:11.5px;font-weight:700;padding:1px 6px;border-radius:6px;align-self:flex-start}' +
  '.tar-q.ok{background:var(--mint-dim);color:var(--mint)}.tar-q.pe{background:var(--coral-dim);color:var(--coral)}.tar-q.fu{background:var(--slab3);color:var(--mute)}' +
  '.tar-dias{display:flex;gap:4px;flex-wrap:wrap}' +
  '.tar-dias button{width:38px;padding:6px 0;border-radius:7px;border:1px solid var(--line);background:var(--slab2);font-size:12px;color:var(--mute)}' +
  '.tar-dias button.on{border-color:var(--volt);background:var(--volt-dim);color:var(--ink)}' +
  '.tar-it{background:var(--slab2);border:1px solid var(--line);border-radius:10px;padding:10px;margin-bottom:8px}' +
  '.tar-pe{display:flex;gap:8px;flex-wrap:wrap;padding:10px 16px;border-top:1px solid var(--line)}' +
  '@media(max-width:820px){.tar-d{min-height:46px;padding:4px}.tar-q{font-size:10px;padding:0 4px}.tar-h{font-size:9px;letter-spacing:0}}';
  var s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
})();

/* ---------- datas ---------- */
function tarHoje(){ return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }); }
function tarDow(d){ var x = new Date(d + 'T12:00:00').getDay(); return x === 0 ? 7 : x; }
function tarDiaLabel(d){ return TAR_SEML[new Date(d + 'T12:00:00').getDay()] + ', ' + d.slice(8, 10) + '/' + d.slice(5, 7); }

/* ---------- dados (do quadro aberto: TAR.q) ---------- */
function tarQ(){ return TAR_Q[TAR.q]; }
function tarD(q){ q = q || TAR.q; return TAR.dados[q] || (TAR.dados[q] = {}); }
function tarLiga(q){
  q = q || TAR.q;
  if(TAR.ligados[q]) return;
  if(MEM){ TAR.ligados[q] = true; tarDemo(q); return; }
  if(!DB || PAPEL === 'sem-acesso') return;
  TAR.ligados[q] = true;
  ouve(TAR_Q[q].raiz, function(v){
    TAR.dados[q] = v;
    /* marca o primeiro dia: antes dele a rotina não gera tarefas atrasadas */
    if(euSouAdmin() && !(v.config || {}).inicio && !TAR.inicioGravado[q]){
      TAR.inicioGravado[q] = true;
      DB.ref(ROOT + '/' + TAR_Q[q].raiz + '/config/inicio').set(tarHoje());
    }
  });
}
function tarCfg(){ return tarD().config || {}; }
function tarClientesSocial(){
  return listaClientes().filter(function(c){ return c.socialMedia && c.status !== 'encerrado'; })
    .sort(function(a, b){ return String(a.nome).localeCompare(String(b.nome), 'pt-BR'); });
}
function tarRotina(cid){
  var r = (tarD('social').rotinas || {})[cid] || {};
  return { pausado: !!r.pausado, editado: !!r.editado, itens: r.editado ? (r.itens || {}) : TAR_PADRAO };
}
/* mesma regra do servidor (api/_tarefas-core.js) */
function tarDoDia(data, q){
  q = q || TAR.q;
  var D = tarD(q), d = tarDow(data), out = [], exc = (D.excecoes || {})[data] || {};
  var inicio = (D.config || {}).inicio || (MEM ? '' : tarHoje());
  if(TAR_Q[q].rotinas && (!inicio || data >= inicio)){
    tarClientesSocial().forEach(function(c){
      var r = tarRotina(c.id);
      if(r.pausado) return;
      Object.keys(r.itens).forEach(function(k){
        var it = r.itens[k];
        if(!it || (it.dias || []).indexOf(d) < 0) return;
        var ch = 'r_' + c.id + '_' + k;
        if(!exc[ch]) out.push({ chave: ch, clienteId: c.id, cliente: c.nome, titulo: it.tipo || 'Tarefa', fixa: true });
      });
    });
  }
  var av = D.avulsas || {};
  Object.keys(av).forEach(function(k){
    var a = av[k];
    if(!a || a.data !== data) return;
    out.push({ chave: 'a_' + k, id: k, clienteId: a.clienteId, cliente: (S.clientes[a.clienteId] || {}).nome || 'Cliente', titulo: a.titulo || 'Tarefa', fixa: false });
  });
  var f = (D.feitas || {})[data] || {};
  out.forEach(function(t){ t.feita = f[t.chave] || null; });
  return out.sort(function(a, b){
    return String(a.cliente).localeCompare(String(b.cliente), 'pt-BR') || (b.fixa - a.fixa) || String(a.titulo).localeCompare(String(b.titulo), 'pt-BR');
  });
}
function tarUpd(caminho, valor){
  if(MEM || !DB){
    var ks = caminho.split('/'), o = tarD();
    ks.slice(0, -1).forEach(function(p){ o = o[p] = o[p] || {}; });
    if(valor === null) delete o[ks[ks.length - 1]]; else o[ks[ks.length - 1]] = valor;
    render(); return Promise.resolve();
  }
  var r = DB.ref(ROOT + '/' + tarQ().raiz + '/' + caminho);
  return valor === null ? r.remove() : r.set(valor);
}
function tarBadge(q){ tarLiga(q); return tarDoDia(tarHoje(), q).filter(function(t){ return !t.feita; }).length; }

/* ---------- servidor ---------- */
function tarApi(acao, extra){
  if(MEM) return Promise.reject(new Error('Na demonstração não há envio de WhatsApp'));
  if(!AUTH || !AUTH.currentUser) return Promise.reject(new Error('Faça login de novo'));
  var q = TAR.q;
  return AUTH.currentUser.getIdToken().then(function(tk){
    return fetch('/api/tarefas?acao=' + acao + '&quadro=' + q + (extra || ''), { method: 'POST', headers: { Authorization: 'Bearer ' + tk } });
  }).then(function(r){
    return r.json().catch(function(){ throw new Error(r.status === 404 ? 'A função de tarefas ainda não está publicada na Vercel' : 'Resposta inválida do servidor (' + r.status + ')'); })
      .then(function(j){ if(!j.ok) throw new Error(j.erro || 'Erro no servidor'); return j; });
  });
}
/* marca ou desmarca: aparece na hora; o servidor grava e avisa no WhatsApp */
function tarMarca(data, chave, feito){
  var D = tarD(), antes = ((D.feitas || {})[data] || {})[chave] || null;
  var f = (D.feitas = D.feitas || {})[data] = (D.feitas[data] || {});
  if(feito) f[chave] = { em: new Date().toISOString(), por: EMAIL || '' }; else delete f[chave];
  render();
  if(MEM) return;
  tarApi('marcar', '&data=' + data + '&chave=' + encodeURIComponent(chave) + '&feito=' + (feito ? 1 : 0)).then(function(j){
    if(j.aviso) toast(j.aviso, 'err'); else if(feito) toast('Tarefa concluída', 'ok');
  }, function(e){
    if(antes) f[chave] = antes; else delete f[chave];
    render(); toast(e.message, 'err');
  });
}
/* botão: manda agora no WhatsApp o que falta do dia aberto */
function tarEnviaAgora(){
  if(TAR.ocupado) return;
  if(MEM) return toast('Na demonstração não há envio de WhatsApp', 'err');
  TAR.ocupado = 'enviar'; render();
  tarApi('enviar', '&data=' + TAR.dia).then(function(j){
    TAR.ocupado = ''; render();
    toast(j.pendentes ? 'Enviado: ' + j.pendentes + ' tarefa(s) pendente(s)' : 'Enviado: tudo concluído nesse dia', 'ok');
  }, function(e){ TAR.ocupado = ''; render(); toast(e.message, 'err'); });
}

/* ---------- tela ---------- */
function tarVaiDia(d){ TAR.dia = d; TAR.mes = d.slice(0, 7); render(); }
function tarVaiMes(k){
  var a = TAR.mes.split('-'), y = +a[0], m = +a[1] - 1 + k;
  y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
  TAR.mes = y + '-' + (m < 9 ? '0' : '') + (m + 1); render();
}
function vTarQuadro(q){
  TAR.q = q;
  tarLiga(q);
  if(!TAR.dia){ TAR.dia = tarHoje(); TAR.mes = TAR.dia.slice(0, 7); }
  var Q = tarQ();
  var aviso = '';
  if(Q.rotinas && !tarClientesSocial().length) aviso = '<div class="note">Nenhum cliente com Social media marcado. Um administrador marca em Financeiro › Clientes › Editar.</div>';
  return '' +
  '<div class="hd"><div><h1>' + Q.titulo + '</h1><p>' + Q.sub + '</p></div>' +
  '<div class="hd-act">' + (Q.rotinas ? '<button class="btn" onclick="mTarRotinas()">Rotinas</button>' : '') +
    '<button class="btn btn-p" onclick="mTarAvulsa()">' + (Q.rotinas ? '+ Tarefa avulsa' : '+ Nova tarefa') + '</button></div></div>' +
  (MEM ? '<div class="note">Demonstração: as tarefas são de exemplo.</div>' : '') +
  aviso +
  tarDiaHTML(TAR.dia) +
  '<div class="mt12">' + tarMesHTML() + '</div>' +
  (euSouAdmin() ? '<div class="mt12">' + tarCfgHTML() + '</div>' : '');
}
function vTar(){ return vTarQuadro('social'); }
function vTrf(){ return vTarQuadro('trafego'); }

function tarDiaHTML(dia){
  var Q = tarQ(), cfg = tarCfg();
  var ts = tarDoDia(dia), feitas = ts.filter(function(t){ return t.feita; }).length;
  var hoje = tarHoje(), pct = ts.length ? Math.round(feitas / ts.length * 100) : 0;
  var grupos = {}, ordem = [];
  ts.forEach(function(t){ if(!grupos[t.clienteId]){ grupos[t.clienteId] = []; ordem.push(t.clienteId); } grupos[t.clienteId].push(t); });
  var lista = ordem.map(function(cid){
    return '<div class="tar-cli">' + esc(grupos[cid][0].cliente) + '</div>' + grupos[cid].map(function(t){
      var hora = t.feita ? new Date(t.feita.em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
      return '<div class="tar-t' + (t.feita ? ' ok' : '') + '">' +
        '<button class="tar-ck" aria-label="' + (t.feita ? 'Desmarcar' : 'Marcar como feita') + '" onclick="tarMarca(\'' + dia + '\',\'' + esc(t.chave) + '\',' + (t.feita ? 'false' : 'true') + ')">✓</button>' +
        '<div style="min-width:0"><div><span class="tar-tt">' + esc(t.titulo) + '</span>' +
          (Q.rotinas ? '<span class="tar-tag ' + (t.fixa ? 'f">fixa' : 'a">avulsa') + '</span>' : '') + '</div>' +
          (t.feita ? '<div class="sub">feita às ' + hora + (t.feita.por ? ' · ' + esc(String(t.feita.por).split('@')[0]) : '') + '</div>' : '') + '</div>' +
        '<div class="tar-ac"><button class="btn btn-s" onclick="mTarMover(\'' + dia + '\',\'' + esc(t.chave) + '\')">Mover</button>' +
          '<button class="btn btn-s btn-d" onclick="tarTira(\'' + dia + '\',\'' + esc(t.chave) + '\')">Tirar</button></div></div>';
    }).join('');
  }).join('');
  var titulo = (dia === hoje ? 'Hoje · ' : '') + tarDiaLabel(dia);
  var podeEnviar = cfg.ligado && (cfg.fone || cfg.grupo) && ts.length;
  return '<div class="tw"><div class="tw-hd"><div class="flx" style="gap:6px;flex-wrap:nowrap">' +
      '<button class="btn btn-s" onclick="tarVaiDia(addDias(TAR.dia,-1))" aria-label="Dia anterior">‹</button>' +
      '<div class="tw-t">' + esc(titulo.charAt(0).toUpperCase() + titulo.slice(1)) + '</div>' +
      '<button class="btn btn-s" onclick="tarVaiDia(addDias(TAR.dia,1))" aria-label="Próximo dia">›</button>' +
      (dia !== hoje ? '<button class="btn btn-s" onclick="tarVaiDia(tarHoje())">Hoje</button>' : '') + '</div>' +
    '<span class="pill ' + (!ts.length ? 'p-off' : (feitas === ts.length ? 'p-on' : 'p-av')) + '">' + feitas + ' de ' + ts.length + ' feitas</span></div>' +
    (ts.length ? '<div style="padding:10px 16px 2px"><div class="bar"><i style="width:' + pct + '%;background:var(--mint)"></i></div></div>' + lista
      : '<div class="empty"><b>Nenhuma tarefa neste dia</b>Use <b style="display:inline;font-size:13px">' + (Q.rotinas ? '+ Tarefa avulsa' : '+ Nova tarefa') + '</b> para incluir uma.</div>') +
    '<div class="tar-pe"><button class="btn btn-s" onclick="mTarAvulsa(\'' + dia + '\')">' + (Q.rotinas ? '+ Tarefa avulsa neste dia' : '+ Nova tarefa neste dia') + '</button>' +
      (podeEnviar ? '<button class="btn btn-s btn-p" onclick="tarEnviaAgora()"' + (TAR.ocupado === 'enviar' ? ' disabled' : '') + '>' +
        (TAR.ocupado === 'enviar' ? 'Enviando...' : '📲 ' + Q.botaoEnvio) + '</button>' : '') + '</div>' +
    '</div>';
}

function tarMesHTML(){
  var a = TAR.mes.split('-'), y = +a[0], m = +a[1];
  var ini = TAR.mes + '-01', ult = new Date(y, m, 0).getDate(), fim = TAR.mes + '-' + (ult < 10 ? '0' : '') + ult;
  var d0 = addDias(ini, -(tarDow(ini) - 1)), d1 = addDias(fim, 7 - tarDow(fim));
  var hoje = tarHoje(), cel = '', d = d0, guard = 0;
  while(d <= d1 && guard++ < 45){
    var dentro = d.slice(0, 7) === TAR.mes, ts = dentro ? tarDoDia(d) : [];
    var feitas = ts.filter(function(t){ return t.feita; }).length, q = '';
    if(ts.length) q = '<span class="tar-q ' + (feitas === ts.length ? 'ok' : (d < hoje ? 'pe' : 'fu')) + '">' + feitas + '/' + ts.length + '</span>';
    cel += '<button class="tar-d ' + (dentro ? 'in' : 'out') + (d === hoje ? ' hj' : '') + (d === TAR.dia ? ' sel' : '') + '"' +
      (dentro ? ' onclick="tarVaiDia(\'' + d + '\');window.scrollTo(0,0)"' : '') + '><span class="tar-n">' + (+d.slice(8)) + '</span>' + q + '</button>';
    d = addDias(d, 1);
  }
  return '<div class="tw"><div class="tw-hd"><div class="flx" style="gap:6px;flex-wrap:nowrap"><button class="btn btn-s" onclick="tarVaiMes(-1)" aria-label="Mês anterior">‹</button>' +
    '<div class="tw-t">' + TAR_MESES[m - 1] + ' ' + y + '</div><button class="btn btn-s" onclick="tarVaiMes(1)" aria-label="Próximo mês">›</button></div>' +
    '<div class="rw-leg"><i><span class="dot" style="background:var(--mint)"></span>tudo feito</i><i><span class="dot" style="background:var(--coral)"></span>ficou pendente</i></div></div>' +
    '<div style="padding:12px"><div class="tar-g">' + TAR_SEM.slice(1).map(function(s){ return '<div class="tar-h">' + s + '</div>'; }).join('') + cel + '</div></div></div>';
}

/* ---------- nova tarefa / avulsa, mover, tirar ---------- */
function mTarAvulsa(data){
  var Q = tarQ();
  /* clientes da linha de serviço do quadro aparecem primeiro */
  var daLinha = function(c){ return Q.rotinas ? !!c.socialMedia : c.trafego !== false; };
  var cs = listaClientes().filter(function(c){ return c.status !== 'encerrado'; })
    .sort(function(a, b){ return (daLinha(b) - daLinha(a)) || String(a.nome).localeCompare(String(b.nome), 'pt-BR'); });
  modal(Q.rotinas ? 'Tarefa avulsa' : 'Nova tarefa de tráfego',
    '<div class="fg"><label class="fl">Cliente</label><select class="fi" id="t_cli"><option value="">Escolha o cliente</option>' +
      cs.map(function(c){ return '<option value="' + esc(c.id) + '">' + esc(c.nome) + '</option>'; }).join('') + '</select></div>' +
    '<div class="fg"><label class="fl">O que fazer</label><input class="fi" id="t_tit" maxlength="120" placeholder="' + (Q.rotinas ? 'Gravar vídeo de bastidores' : 'Subir campanha de remarketing') + '"></div>' +
    '<div class="fg"><label class="fl">Dia</label><input type="date" class="fi" id="t_dia" value="' + (data || TAR.dia || tarHoje()) + '"></div>',
    '<button class="btn" onclick="fecha()">Cancelar</button><button class="btn btn-p" onclick="tarSalvaAvulsa()">Adicionar</button>');
  setTimeout(function(){ var e = $('t_tit'); if(e) e.focus(); }, 60);
}
function tarSalvaAvulsa(){
  var cli = $('t_cli').value, tit = $('t_tit').value.trim(), dia = $('t_dia').value;
  if(!cli) return toast('Escolha o cliente', 'err');
  if(!tit) return toast('Escreva o que fazer', 'err');
  if(!dia) return toast('Escolha o dia', 'err');
  tarUpd('avulsas/' + uid(), { clienteId: cli, titulo: tit, data: dia, criadoEm: new Date().toISOString(), criadoPor: EMAIL || '' });
  fecha(); tarVaiDia(dia); toast('Tarefa adicionada', 'ok');
}
function tarAcha(data, chave){ return tarDoDia(data).filter(function(t){ return t.chave === chave; })[0]; }
function mTarMover(data, chave){
  var t = tarAcha(data, chave);
  if(!t) return;
  modal('Mover tarefa',
    '<div class="fg"><div class="nm">' + esc(t.cliente) + ' · ' + esc(t.titulo) + '</div><div class="sub">hoje está em ' + tarDiaLabel(data) + '</div></div>' +
    '<div class="fg"><label class="fl">Mover para</label><input type="date" class="fi" id="t_novo" value="' + addDias(data, 1) + '"></div>' +
    (t.fixa ? '<div class="hint">Só muda nesta data. A rotina do cliente continua igual nos outros dias.</div>' : ''),
    '<button class="btn" onclick="fecha()">Cancelar</button><button class="btn btn-p" onclick="tarSalvaMover(\'' + data + '\',\'' + esc(chave) + '\')">Mover</button>');
}
function tarSalvaMover(data, chave){
  var novo = $('t_novo').value, t = tarAcha(data, chave);
  if(!novo || !t) return toast('Escolha o dia', 'err');
  if(novo === data) return fecha();
  if(t.fixa){
    /* tira da data original e cria uma avulsa igual no novo dia */
    tarUpd('excecoes/' + data + '/' + chave, true);
    tarUpd('avulsas/' + uid(), { clienteId: t.clienteId, titulo: t.titulo, data: novo, movidaDe: data, criadoEm: new Date().toISOString(), criadoPor: EMAIL || '' });
  }else tarUpd('avulsas/' + t.id + '/data', novo);
  if(t.feita) tarUpd('feitas/' + data + '/' + chave, null);
  fecha(); toast('Tarefa movida para ' + tarDiaLabel(novo), 'ok');
}
function tarTira(data, chave){
  var t = tarAcha(data, chave);
  if(!t) return;
  if(!confirm(t.fixa ? 'Tirar "' + t.titulo + '" de ' + t.cliente + ' só em ' + tarDiaLabel(data) + '?\n\nA rotina continua nos outros dias.'
                     : 'Excluir a tarefa "' + t.titulo + '" de ' + t.cliente + '?')) return;
  if(t.fixa) tarUpd('excecoes/' + data + '/' + chave, true);
  else tarUpd('avulsas/' + t.id, null);
  if(t.feita) tarUpd('feitas/' + data + '/' + chave, null);
  toast('Tarefa tirada');
}

/* ---------- rotinas por cliente (só social media) ---------- */
function mTarRotinas(){
  var cs = tarClientesSocial();
  modal('Rotinas dos clientes',
    (cs.length ? cs.map(function(c){
      var r = tarRotina(c.id);
      var resumo = Object.keys(r.itens).map(function(k){
        var it = r.itens[k];
        return esc(it.tipo) + ' (' + (it.dias || []).slice().sort().map(function(d){ return TAR_SEM[d]; }).join(', ') + ')';
      }).join(' · ') || 'nenhuma tarefa fixa';
      return '<div class="tar-it flx sp" style="flex-wrap:nowrap;cursor:pointer" onclick="mTarRotina(\'' + esc(c.id) + '\')"><div style="min-width:0"><div class="nm">' + esc(c.nome) +
        (r.pausado ? ' <span class="pill p-off">pausado</span>' : (r.editado ? ' <span class="pill p-vl">personalizada</span>' : '')) + '</div>' +
        '<div class="sub">' + resumo + '</div></div><span class="btn btn-s">Editar</span></div>';
    }).join('') : '<div class="empty"><b>Nenhum cliente com Social media</b>Marque Social media no cadastro do cliente.</div>') +
    '<div class="hint">Todo cliente com Social media começa com Post na segunda, quarta e sexta, e Stories na terça e quinta.</div>',
    '<button class="btn btn-p" onclick="fecha()">Fechar</button>', true);
}
function mTarRotina(cid){
  var r = tarRotina(cid);
  TAR.r = { cid: cid, pausado: r.pausado, itens: JSON.parse(JSON.stringify(r.itens)) };
  mTarRotinaRender();
}
function mTarRotinaRender(){
  var r = TAR.r;
  var itens = Object.keys(r.itens).map(function(k){
    var it = r.itens[k];
    return '<div class="tar-it"><div class="flx" style="flex-wrap:nowrap;margin-bottom:8px"><input class="fi" style="flex:1;min-width:0" value="' + esc(it.tipo) + '" maxlength="60" onchange="TAR.r.itens[\'' + k + '\'].tipo=this.value.trim()" placeholder="Post, Stories, Reels...">' +
      '<button class="btn btn-s btn-d" onclick="delete TAR.r.itens[\'' + k + '\'];mTarRotinaRender()">Tirar</button></div>' +
      '<div class="tar-dias">' + [1, 2, 3, 4, 5, 6, 7].map(function(d){
        return '<button type="button" class="' + ((it.dias || []).indexOf(d) > -1 ? 'on' : '') + '" onclick="tarRDia(\'' + k + '\',' + d + ')">' + TAR_SEM[d] + '</button>';
      }).join('') + '</div></div>';
  }).join('');
  modal('Rotina · ' + esc((S.clientes[r.cid] || {}).nome || ''),
    (itens || '<div class="hint" style="margin-bottom:10px">Nenhuma tarefa fixa. Adicione abaixo.</div>') +
    '<button class="btn btn-s" onclick="tarRNovo()">+ Tarefa fixa</button>' +
    '<label class="chk mt18' + (r.pausado ? ' on' : '') + '"><input type="checkbox"' + (r.pausado ? ' checked' : '') + ' onchange="TAR.r.pausado=this.checked;this.parentNode.classList.toggle(\'on\',this.checked)">Pausar este cliente (sem tarefas fixas até desmarcar)</label>' +
    '<div class="hint mt12">A rotina vale para os próximos dias. Para mudar só um dia, use Mover ou Tirar na lista do dia.</div>',
    '<button class="btn" style="margin-right:auto" onclick="tarRPadrao()">Voltar ao padrão</button>' +
    '<button class="btn" onclick="mTarRotinas()">Voltar</button><button class="btn btn-p" onclick="tarRSalva()">Salvar</button>');
}
/* guarda o que foi digitado antes de redesenhar */
function tarRGuardaNomes(){
  [].forEach.call(document.querySelectorAll('.md-b .tar-it input.fi'), function(inp, i){ var key = Object.keys(TAR.r.itens)[i]; if(key) TAR.r.itens[key].tipo = inp.value.trim(); });
}
function tarRDia(k, d){
  tarRGuardaNomes();
  var ds = TAR.r.itens[k].dias = TAR.r.itens[k].dias || [], i = ds.indexOf(d);
  if(i > -1) ds.splice(i, 1); else ds.push(d);
  ds.sort();
  mTarRotinaRender();
}
function tarRNovo(){ tarRGuardaNomes(); TAR.r.itens[uid()] = { tipo: '', dias: [] }; mTarRotinaRender(); }
function tarRSalva(){
  tarRGuardaNomes();
  var r = TAR.r, itens = {};
  for(var k in r.itens){
    var it = r.itens[k];
    if(!it.tipo) return toast('Dê um nome para cada tarefa fixa', 'err');
    if(!(it.dias || []).length) return toast('Escolha pelo menos um dia para "' + it.tipo + '"', 'err');
    itens[k] = { tipo: it.tipo, dias: it.dias };
  }
  tarUpd('rotinas/' + r.cid, { editado: true, pausado: !!r.pausado, itens: itens });
  toast('Rotina salva', 'ok');
  mTarRotinas();
}
function tarRPadrao(){
  if(!confirm('Voltar esta rotina para o padrão (Post seg/qua/sex e Stories ter/qui)?')) return;
  tarUpd('rotinas/' + TAR.r.cid, null);
  toast('Rotina no padrão', 'ok');
  mTarRotinas();
}

/* ---------- WhatsApp do quadro (só admin) ---------- */
function tarBuscaGrupos(){
  if(TAR.ocupado) return;
  if(typeof salApi !== 'function') return toast('Recarregue a página (Ctrl + Shift + R)', 'err');
  TAR.ocupado = 'grupos'; render();
  salApi('grupos').then(function(j){ SAL.grupos = j.grupos; TAR.ocupado = ''; render(); toast(j.grupos.length + ' grupo(s) encontrado(s)', 'ok'); },
    function(e){ TAR.ocupado = ''; render(); toast(e.message, 'err'); });
}
/* tráfego: criar tarefa mandando mensagem no grupo (webhook "Ao receber" da Z-API → api/zapi-webhook.js) */
function tarViaGrupoHTML(c){
  var url = location.origin + '/api/zapi-webhook?chave=SUA_SENHA';
  return '<div class="fg"><label class="chk' + (c.viaGrupo ? ' on' : '') + '"><input type="checkbox" id="t_via"' + (c.viaGrupo ? ' checked' : '') +
      ' onchange="this.parentNode.classList.toggle(\'on\',this.checked)">Criar tarefas por mensagem no grupo</label>' +
    '<div class="hint" style="margin-top:8px">Quem estiver no grupo manda a mensagem neste formato e a tarefa entra sozinha, com confirmação no grupo:</div>' +
    '<pre class="mono" style="font-size:12px;background:var(--slab2);border:1px solid var(--line);border-radius:8px;padding:10px;margin-top:6px;white-space:pre-wrap">Cliente: Buffet Solar\nTarefa: Subir campanha de remarketing\nData: amanhã</pre>' +
    '<div class="hint">"Tarefa:" pode repetir. "Data:" aceita hoje, amanhã, o dia da semana ou 05/11; vazia, entra para hoje.</div>' +
    '<div class="fl mt12">Endereço para a Z-API (Webhooks › Ao receber)</div>' +
    '<div class="flx" style="flex-wrap:nowrap"><input class="fi mono" style="font-size:11.5px" readonly value="' + esc(url) + '" onclick="this.select()">' +
    '<button class="btn btn-s" onclick="salCopia(\'' + esc(url) + '\')">Copiar</button></div>' +
    '<div class="hint">Troque SUA_SENHA pela mesma senha do agendador (CRON_SECRET).</div></div>';
}
function tarCfgHTML(){
  var Q = tarQ(), c = tarCfg(), hR = c.horaResumo != null ? +c.horaResumo : 9, lemb = (c.lembretes || [12, 15, 18]).map(Number);
  var zst = (typeof SAL !== 'undefined' && SAL.zapi) ? (SAL.zapi.conectado ? '<span class="pill p-on">WhatsApp conectado</span>' : '<span class="pill p-cr">WhatsApp desconectado</span>') : '';
  var horas = ''; for(var h = 6; h <= 12; h++) horas += '<option value="' + h + '"' + (h === hR ? ' selected' : '') + '>' + h + 'h</option>';
  var chips = ''; for(var l = 10; l <= 20; l++) chips += '<button type="button" data-h="' + l + '" class="' + (lemb.indexOf(l) > -1 ? 'on' : '') + '" onclick="this.classList.toggle(\'on\')">' + l + 'h</button>';
  var destino;
  if(Q.rotinas){
    destino = '<div class="fg"><label class="fl">Número da social media</label><input class="fi mono" id="t_fone" inputmode="tel" placeholder="5548999999999" value="' + esc(c.fone || '') + '">' +
      '<div class="hint">Com 55 e DDD, só números. Ela recebe as mensagens pelo mesmo número da Z-API dos alertas de saldo.</div></div>';
  }else{
    var gs = (typeof SAL !== 'undefined' && SAL.grupos) || null, tem = gs && gs.some(function(g){ return g.id === c.grupo; });
    var campo = gs ? '<select class="fi" id="t_grupo"><option value="">Escolha o grupo</option>' +
        (c.grupo && !tem ? '<option value="' + esc(c.grupo) + '" selected>' + esc(c.grupoNome || c.grupo) + '</option>' : '') +
        gs.map(function(g){ return '<option value="' + esc(g.id) + '"' + (g.id === c.grupo ? ' selected' : '') + '>' + esc(g.nome) + '</option>'; }).join('') + '</select>'
      : '<input class="fi mono" id="t_grupo" placeholder="ID do grupo (use Buscar grupos)" value="' + esc(c.grupo || '') + '">';
    destino = '<div class="fg"><label class="fl">Grupo do WhatsApp</label><div class="flx" style="flex-wrap:nowrap;align-items:flex-start"><div style="flex:1;min-width:0">' + campo + '</div>' +
      '<button class="btn" type="button" onclick="tarBuscaGrupos()"' + (TAR.ocupado === 'grupos' ? ' disabled' : '') + '>' + (TAR.ocupado === 'grupos' ? 'Buscando...' : 'Buscar grupos') + '</button></div>' +
      (c.grupoNome && !gs ? '<div class="hint">Grupo atual: <b style="color:var(--ink)">' + esc(c.grupoNome) + '</b></div>' : '') +
      '<div class="hint">O número da Z-API precisa estar no grupo. Pode ser um grupo diferente do de saldo.</div></div>' +
      tarViaGrupoHTML(c);
  }
  return '<div class="tw"><div class="tw-hd"><div class="tw-t">WhatsApp ' + (Q.rotinas ? 'da social media' : 'do tráfego') + '</div>' + zst + '</div><div style="padding:16px">' +
    '<label class="chk' + (c.ligado ? ' on' : '') + '" style="margin-bottom:14px"><input type="checkbox" id="t_lig"' + (c.ligado ? ' checked' : '') + ' onchange="this.parentNode.classList.toggle(\'on\',this.checked)">Enviar as tarefas no WhatsApp</label>' +
    destino +
    '<div class="fr" style="grid-template-columns:1fr 2fr"><div class="fg"><label class="fl">Resumo do dia às</label><select class="fi" id="t_hres">' + horas + '</select></div>' +
      '<div class="fg"><label class="fl">Lembretes das pendências</label><div class="tar-dias" id="t_lemb">' + chips + '</div></div></div>' +
    '<label class="chk' + (c.diasUteis !== false ? ' on' : '') + '"><input type="checkbox" id="t_uteis"' + (c.diasUteis !== false ? ' checked' : '') + ' onchange="this.parentNode.classList.toggle(\'on\',this.checked)">Só de segunda a sexta</label>' +
    '<div class="hint mt12">' + (Q.rotinas ? 'Ela recebe' : 'O grupo recebe') + ': o resumo com as tarefas do dia, as pendências em cada lembrete e uma confirmação a cada tarefa marcada como feita. ' +
      'O botão "' + Q.botaoEnvio + '", na lista do dia, manda as pendências na hora.</div>' +
    '<div class="flx mt18" style="justify-content:flex-end"><button class="btn" onclick="tarTeste()"' + (TAR.ocupado === 'teste' ? ' disabled' : '') + '>' + (TAR.ocupado === 'teste' ? 'Enviando...' : 'Enviar teste') + '</button>' +
      '<button class="btn btn-p" onclick="tarSalvaCfg()">Salvar</button></div>' +
    '</div></div>';
}
function tarSalvaCfg(silencioso){
  var Q = tarQ(), lig = $('t_lig').checked, extra = {};
  if(Q.rotinas){
    var fone = $('t_fone').value.replace(/\D/g, '');
    if(lig && !/^55\d{10,11}$/.test(fone)){ toast('Número inválido: use 55 + DDD + número, ex. 5548999999999', 'err'); return false; }
    extra.fone = fone;
  }else{
    var g = $('t_grupo'), grupo = String(g.value || '').trim();
    if(lig && !grupo){ toast('Escolha o grupo do WhatsApp', 'err'); return false; }
    extra.grupo = grupo;
    extra.grupoNome = g.tagName === 'SELECT' && g.selectedIndex > 0 ? g.options[g.selectedIndex].text : (tarCfg().grupo === grupo ? (tarCfg().grupoNome || '') : '');
    extra.viaGrupo = !!($('t_via') && $('t_via').checked);
    if(extra.viaGrupo && !grupo){ toast('Escolha o grupo antes de ligar as tarefas por mensagem', 'err'); return false; }
  }
  var lemb = [].map.call(document.querySelectorAll('#t_lemb button.on'), function(b){ return +b.dataset.h; });
  var c = Object.assign({}, tarCfg(), extra, { ligado: lig, horaResumo: +$('t_hres').value, lembretes: lemb, diasUteis: $('t_uteis').checked,
    atualizadoEm: new Date().toISOString(), atualizadoPor: EMAIL || '' });
  if(!c.inicio) c.inicio = tarHoje();
  tarUpd('config', c);
  if(!silencioso) toast('Configuração salva', 'ok');
  return true;
}
function tarTeste(){
  if(TAR.ocupado || !tarSalvaCfg(true)) return;
  TAR.ocupado = 'teste'; render();
  tarApi('teste').then(function(){ TAR.ocupado = ''; render(); toast('Mensagem de teste enviada', 'ok'); },
    function(e){ TAR.ocupado = ''; render(); toast(e.message, 'err'); });
}

/* ---------- demonstração (sem Firebase) ---------- */
function tarDemo(q){
  var cs = listaClientes().filter(function(c){ return c.status !== 'encerrado'; }).slice(0, 3);
  var hoje = tarHoje();
  if(q === 'trafego'){
    var av = {};
    if(cs[0]) av.t1 = { clienteId: cs[0].id, titulo: 'Subir campanha de remarketing', data: hoje };
    if(cs[1]) av.t2 = { clienteId: cs[1].id, titulo: 'Trocar criativos do conjunto frio', data: hoje };
    if(cs[1]) av.t3 = { clienteId: cs[1].id, titulo: 'Revisar orçamento do Google', data: addDias(hoje, 1) };
    TAR.dados.trafego = { config: { ligado: true, grupo: '120363000000000000-group', grupoNome: 'Tráfego 2STEP', horaResumo: 9, lembretes: [12, 15, 18], diasUteis: true, inicio: addDias(hoje, -20) },
      avulsas: av, feitas: {} };
    return;
  }
  cs.forEach(function(c){ c.socialMedia = true; });
  var f = {};
  for(var i = 1; i <= 10; i++){
    var d = addDias(hoje, -i); f[d] = {};
    cs.forEach(function(c){ ['post', 'stories'].forEach(function(k){ if(i !== 3) f[d]['r_' + c.id + '_' + k] = { em: d + 'T14:00:00Z', por: 'social@2step' }; }); });
  }
  TAR.dados.social = { config: { ligado: true, fone: '5548999999999', horaResumo: 9, lembretes: [12, 15, 18], diasUteis: true, inicio: addDias(hoje, -20) },
    feitas: f, avulsas: {}, rotinas: {} };
  if(cs[0]) TAR.dados.social.avulsas.demo1 = { clienteId: cs[0].id, titulo: 'Gravar vídeo de bastidores', data: hoje };
  if(cs[1]) TAR.dados.social.rotinas[cs[1].id] = { editado: true, itens: { post: { tipo: 'Post', dias: [2, 4] }, reels: { tipo: 'Reels', dias: [5] } } };
}

/* ---------- registro no menu: Operacional › duas abas ---------- */
(function(){
  var m = MODULOS.filter(function(x){ return x.id === 'mid'; })[0];
  if(!m) return;
  m.telas.push({ v:'tarefas', n:'Tarefas de social media', f:function(){ return vTar(); }, badge:function(){ return tarBadge('social'); } });
  m.telas.push({ v:'trafego', n:'Tarefas de tráfego', f:function(){ return vTrf(); }, badge:function(){ return tarBadge('trafego'); } });
})();
