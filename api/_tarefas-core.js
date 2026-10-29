/* ============================================================
   2STEP · TAREFAS (núcleo do servidor)
   Usado por api/tarefas.js e pelo agendador (api/meta-saldo.js).
   Dois quadros com a mesma lógica:
     social  -> tarefas da social media: rotina fixa de cada cliente com
                Social media marcado (padrão: post seg/qua/sex, stories
                ter/qui) + avulsas; WhatsApp vai para o número dela.
     trafego -> tarefas do tráfego: só as cadastradas dia a dia, cada
                uma vinculada a um cliente; WhatsApp vai para um grupo.
   Em cada quadro: resumo do dia, pendências nos lembretes, confirmação
   de tarefa concluída e envio na hora pelo botão do painel.
   ------------------------------------------------------------
   Dados (raiz "tarefas" ou "tarefasTrafego"):
     config               -> fone (social) ou grupo/grupoNome (tráfego),
                             horaResumo, lembretes, diasUteis, ligado, inicio
     rotinas/{clienteId}  -> { editado, pausado, itens: { id: { tipo, dias:[1..7] } } }  (só social)
     avulsas/{id}         -> { clienteId, data, titulo, ... }
     excecoes/{data}/{chave} -> true  (tarefa fixa tirada daquele dia)
     feitas/{data}/{chave}   -> { em, por }
     envios/{data}        -> o que o agendador já mandou naquele dia
   Chave da tarefa: r_{clienteId}_{item} (fixa) ou a_{id} (avulsa).
   A mesma regra de montar o dia está em tarefas.js (tela).
   ============================================================ */
var core = require('./_asaas-core');
var meta = require('./_meta-core');

var ref = core.ref;
var QUADROS = {
  social:  { raiz: 'tarefas',        rotinas: true,  nome: 'Tarefas de hoje',            vazio: 'Cadastre o número da social media primeiro' },
  trafego: { raiz: 'tarefasTrafego', rotinas: false, nome: 'Tarefas de tráfego de hoje', vazio: 'Escolha o grupo do tráfego primeiro' }
};
var PADRAO = { post: { tipo: 'Post', dias: [1, 3, 5] }, stories: { tipo: 'Stories', dias: [2, 4] } };
var SEM = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
function erro(msg, http){ return Object.assign(new Error(msg), { http: http }); }
function num(v, p){ var x = Number(v); return isFinite(x) && v !== '' && v != null ? x : p; }
function quadro(q){ var x = QUADROS[q || 'social']; if(!x) throw erro('Quadro de tarefas inválido', 400); return x; }

/* ---------- datas (São Paulo) ---------- */
function hojeSP(){ return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }); }
function horaSP(){ return Number(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false })) % 24; }
/* 1 = segunda ... 7 = domingo */
function dow(d){ var x = new Date(d + 'T12:00:00Z').getUTCDay(); return x === 0 ? 7 : x; }
function dataBR(d){ return d.slice(8, 10) + '/' + d.slice(5, 7); }

/* ---------- montar o dia ---------- */
function tarefasDoDia(data, base, comRotinas){
  var d = dow(data), out = [];
  var exc = (base.excecoes || {})[data] || {};
  var inicio = (base.config || {}).inicio || '';
  if(comRotinas !== false && (!inicio || data >= inicio)){
    Object.keys(base.clientes || {}).forEach(function(cid){
      var c = base.clientes[cid];
      if(!c || !c.socialMedia || c.status === 'encerrado') return;
      var r = (base.rotinas || {})[cid] || {};
      if(r.pausado) return;
      var itens = r.editado ? (r.itens || {}) : PADRAO;
      Object.keys(itens).forEach(function(k){
        var it = itens[k];
        if(!it || (it.dias || []).indexOf(d) < 0) return;
        var ch = 'r_' + cid + '_' + k;
        if(!exc[ch]) out.push({ chave: ch, clienteId: cid, cliente: c.nome || 'Cliente', titulo: it.tipo || 'Tarefa', fixa: true });
      });
    });
  }
  Object.keys(base.avulsas || {}).forEach(function(k){
    var a = base.avulsas[k];
    if(!a || a.data !== data) return;
    out.push({ chave: 'a_' + k, clienteId: a.clienteId, cliente: ((base.clientes || {})[a.clienteId] || {}).nome || 'Cliente', titulo: a.titulo || 'Tarefa', fixa: false });
  });
  var f = (base.feitas || {})[data] || {};
  out.forEach(function(t){ t.feita = f[t.chave] || null; });
  return out.sort(function(a, b){
    return String(a.cliente).localeCompare(String(b.cliente), 'pt-BR') || (b.fixa - a.fixa) || String(a.titulo).localeCompare(String(b.titulo), 'pt-BR');
  });
}
async function carrega(data, Q){
  var t = (await ref(Q.raiz).once('value')).val() || {};
  var clientes = (await ref('clientes').once('value')).val() || {};
  var base = { config: t.config || {}, rotinas: Q.rotinas ? (t.rotinas || {}) : {}, avulsas: t.avulsas || {}, excecoes: {}, feitas: {}, clientes: clientes };
  base.excecoes[data] = ((t.excecoes || {})[data]) || {};
  base.feitas[data] = ((t.feitas || {})[data]) || {};
  base.envios = ((t.envios || {})[data]) || {};
  return base;
}
function doDia(data, base, Q){ return tarefasDoDia(data, base, Q.rotinas); }

/* ---------- mensagens ---------- */
function lista(ts){
  var grupos = {}, ordem = [];
  ts.forEach(function(t){ if(!grupos[t.cliente]){ grupos[t.cliente] = []; ordem.push(t.cliente); } grupos[t.cliente].push(t); });
  return ordem.map(function(c){ return '*' + c + '*\n' + grupos[c].map(function(t){ return '• ' + t.titulo; }).join('\n'); }).join('\n\n');
}
function quando(data){ return SEM[new Date(data + 'T12:00:00Z').getUTCDay()] + ', ' + dataBR(data); }
function msgResumo(Q, data, ts, url){
  return '☀️ *Bom dia! ' + Q.nome + '* (' + quando(data) + ')\n\n' +
    lista(ts) + '\n\n' + ts.length + ' tarefa' + (ts.length > 1 ? 's' : '') + '. Marque cada uma como feita no painel' + (url ? ': ' + url : '.');
}
function msgPendentes(Q, data, ts, pend, url){
  var hoje = data === hojeSP();
  return '⏰ *' + (hoje ? Q.nome.replace('de hoje', 'pendentes de hoje') : Q.nome.replace(' de hoje', '') + ' pendentes (' + quando(data) + ')') + '* (' +
    (ts.length - pend.length) + ' de ' + ts.length + ' feitas)\n\n' + lista(pend) + (url ? '\n\nPainel: ' + url : '');
}
function msgTudoFeito(data, ts){
  return '🎉 *Todas as tarefas ' + (data === hojeSP() ? 'de hoje' : 'de ' + quando(data)) + ' foram concluídas!* (' + ts.length + ' de ' + ts.length + ')';
}
function msgConcluida(t, data, restantes){
  var hoje = data === hojeSP();
  return '✅ *Tarefa concluída*\n*' + t.cliente + '* · ' + t.titulo + (hoje ? '' : ' (' + dataBR(data) + ')') + '\n\n' +
    (restantes ? 'Falta' + (restantes > 1 ? 'm ' : ' ') + restantes + ' tarefa' + (restantes > 1 ? 's' : '') + (hoje ? ' hoje.' : ' nesse dia.')
               : '🎉 Todas as tarefas ' + (hoje ? 'de hoje' : 'desse dia') + ' foram concluídas!');
}
/* social: número da social media · tráfego: grupo */
function destinoDe(cfg){ var d = cfg.grupo || String(cfg.fone || '').replace(/\D/g, ''); return d ? { canal: 'zapi', destino: d } : null; }

/* ---------- marcar como feita (e avisar no WhatsApp) ---------- */
async function marca(q, data, chave, feito, email){
  var Q = quadro(q);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(data || ''))) throw erro('Data inválida', 400);
  if(!/^(r_[A-Za-z0-9_-]{1,40}_[A-Za-z0-9_-]{1,40}|a_[A-Za-z0-9_-]{1,40})$/.test(String(chave || ''))) throw erro('Tarefa inválida', 400);
  var r = ref(Q.raiz + '/feitas/' + data + '/' + chave);
  if(!feito){ await r.remove(); return { ok: true }; }
  await r.set({ em: new Date().toISOString(), por: email || '' });

  var base = await carrega(data, Q), cfg = base.config, dest = destinoDe(cfg);
  if(!cfg.ligado || !dest) return { ok: true };
  var ts = doDia(data, base, Q), t = ts.filter(function(x){ return x.chave === chave; })[0];
  if(!t) return { ok: true };
  try{ await meta.enviaWhats(msgConcluida(t, data, ts.filter(function(x){ return !x.feita; }).length), dest); return { ok: true, avisou: true }; }
  catch(e){ return { ok: true, aviso: 'Tarefa marcada, mas o WhatsApp não foi enviado: ' + e.message }; }
}

/* ---------- enviar agora (botão do painel) ----------
   Manda o que falta do dia escolhido. Não mexe nos horários automáticos. */
async function enviaAgora(q, data, url){
  var Q = quadro(q);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(data || ''))) throw erro('Data inválida', 400);
  var base = await carrega(data, Q), cfg = base.config, dest = destinoDe(cfg);
  if(!cfg.ligado) throw erro('O envio no WhatsApp está desligado na configuração', 400);
  if(!dest) throw erro(Q.vazio, 400);
  var ts = doDia(data, base, Q), pend = ts.filter(function(t){ return !t.feita; });
  if(!ts.length) throw erro('Não há tarefas nesse dia', 400);
  await meta.enviaWhats(pend.length ? msgPendentes(Q, data, ts, pend, url) : msgTudoFeito(data, ts), dest);
  return { ok: true, pendentes: pend.length, total: ts.length };
}

/* ---------- agendador (roda de hora em hora) ----------
   No horário do resumo manda as tarefas do dia; em cada horário de lembrete
   manda o que ainda está pendente. Se o WhatsApp falhar, nada é marcado e
   tenta de novo na hora seguinte. */
async function rodadaQuadro(Q, url){
  var cfgRaw = (await ref(Q.raiz + '/config').once('value')).val() || {}, dest = destinoDe(cfgRaw);
  if(!cfgRaw.ligado || !dest) return { motivo: 'desligado' };
  var hoje = hojeSP(), h = horaSP();
  if(cfgRaw.diasUteis !== false && dow(hoje) > 5) return { motivo: 'fim de semana' };
  var hResumo = num(cfgRaw.horaResumo, 9);
  var lemb = (cfgRaw.lembretes || [12, 15, 18]).map(Number).filter(function(x){ return x > hResumo; });
  if(h < hResumo) return { motivo: 'antes do resumo' };

  var base = await carrega(hoje, Q), env = base.envios, ts = doDia(hoje, base, Q);
  var envRef = ref(Q.raiz + '/envios/' + hoje), agora = new Date().toISOString(), marcar = {};
  /* lembretes que já passaram contam como feitos junto com o resumo atrasado */
  function passados(){ lemb.forEach(function(x){ if(h >= x) marcar['l' + x] = agora; }); }

  if(!env.resumo){
    if(ts.length) await meta.enviaWhats(msgResumo(Q, hoje, ts, url), dest);
    marcar.resumo = ts.length ? agora : 'sem tarefas'; passados();
    await envRef.update(marcar);
    return { resumo: ts.length };
  }
  var devidos = lemb.filter(function(x){ return h >= x && !env['l' + x]; });
  if(!devidos.length) return { motivo: 'nada para mandar agora' };
  var pend = ts.filter(function(t){ return !t.feita; });
  if(pend.length) await meta.enviaWhats(msgPendentes(Q, hoje, ts, pend, url), dest);
  devidos.forEach(function(x){ marcar['l' + x] = agora; });
  await envRef.update(marcar);
  return { pendentes: pend.length };
}
async function rodada(url){
  var out = {};
  for(var q in QUADROS){
    try{ out[q] = await rodadaQuadro(QUADROS[q], url); }
    catch(e){ out[q] = { erro: String(e.message || e) }; }
  }
  return out;
}

async function teste(q){
  var Q = quadro(q);
  var cfg = (await ref(Q.raiz + '/config').once('value')).val() || {}, dest = destinoDe(cfg);
  if(!dest) throw erro(Q.vazio, 400);
  await meta.enviaWhats('✅ *Teste das tarefas 2STEP*\n\nSe esta mensagem chegou, as tarefas vão chegar aqui.', dest);
}

module.exports = { tarefasDoDia: tarefasDoDia, marca: marca, enviaAgora: enviaAgora, rodada: rodada, teste: teste, PADRAO: PADRAO };
