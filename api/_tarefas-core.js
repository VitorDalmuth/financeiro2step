/* ============================================================
   2STEP · TAREFAS DE SOCIAL MEDIA (núcleo do servidor)
   Usado por api/tarefas.js e pelo agendador (api/meta-saldo.js).
   As tarefas de cada dia saem da rotina fixa de cada cliente com
   Social media marcado (padrão: post seg/qua/sex, stories ter/qui)
   mais as tarefas avulsas. A social media recebe no WhatsApp (Z-API):
   o resumo do dia, as pendências nos horários escolhidos e a
   confirmação de cada tarefa concluída.
   ------------------------------------------------------------
   Dados em 2step_financeiro/tarefas:
     config               -> fone, horaResumo, lembretes, diasUteis, ligado, inicio
     rotinas/{clienteId}  -> { editado, pausado, itens: { id: { tipo, dias:[1..7] } } }
     avulsas/{id}         -> { clienteId, data, titulo, ... }
     excecoes/{data}/{chave} -> true  (tarefa fixa tirada daquele dia)
     feitas/{data}/{chave}   -> { em, por }
     envios/{data}        -> o que já foi mandado no WhatsApp naquele dia
   Chave da tarefa: r_{clienteId}_{item} (fixa) ou a_{id} (avulsa).
   A mesma regra de montar o dia está em tarefas.js (tela).
   ============================================================ */
var core = require('./_asaas-core');
var meta = require('./_meta-core');

var ref = core.ref;
var PADRAO = { post: { tipo: 'Post', dias: [1, 3, 5] }, stories: { tipo: 'Stories', dias: [2, 4] } };
var SEM = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
function erro(msg, http){ return Object.assign(new Error(msg), { http: http }); }
function num(v, p){ var x = Number(v); return isFinite(x) && v !== '' && v != null ? x : p; }

/* ---------- datas (São Paulo) ---------- */
function hojeSP(){ return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }); }
function horaSP(){ return Number(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false })) % 24; }
/* 1 = segunda ... 7 = domingo */
function dow(d){ var x = new Date(d + 'T12:00:00Z').getUTCDay(); return x === 0 ? 7 : x; }
function dataBR(d){ return d.slice(8, 10) + '/' + d.slice(5, 7); }

/* ---------- montar o dia ---------- */
function tarefasDoDia(data, base){
  var d = dow(data), out = [];
  var exc = (base.excecoes || {})[data] || {};
  var inicio = (base.config || {}).inicio || '';
  if(!inicio || data >= inicio){
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
async function carrega(data){
  var t = (await ref('tarefas').once('value')).val() || {};
  var clientes = (await ref('clientes').once('value')).val() || {};
  var base = { config: t.config || {}, rotinas: t.rotinas || {}, avulsas: t.avulsas || {}, excecoes: {}, feitas: {}, clientes: clientes };
  base.excecoes[data] = ((t.excecoes || {})[data]) || {};
  base.feitas[data] = ((t.feitas || {})[data]) || {};
  base.envios = ((t.envios || {})[data]) || {};
  return base;
}

/* ---------- mensagens ---------- */
function lista(ts){
  var grupos = {}, ordem = [];
  ts.forEach(function(t){ if(!grupos[t.cliente]){ grupos[t.cliente] = []; ordem.push(t.cliente); } grupos[t.cliente].push(t); });
  return ordem.map(function(c){ return '*' + c + '*\n' + grupos[c].map(function(t){ return '• ' + t.titulo; }).join('\n'); }).join('\n\n');
}
function msgResumo(data, ts, url){
  return '☀️ *Bom dia! Tarefas de hoje* (' + SEM[new Date(data + 'T12:00:00Z').getUTCDay()] + ', ' + dataBR(data) + ')\n\n' +
    lista(ts) + '\n\n' + ts.length + ' tarefa' + (ts.length > 1 ? 's' : '') + '. Marque cada uma como feita no painel' + (url ? ': ' + url : '.');
}
function msgPendentes(ts, pend, url){
  return '⏰ *Tarefas pendentes de hoje* (' + (ts.length - pend.length) + ' de ' + ts.length + ' feitas)\n\n' +
    lista(pend) + (url ? '\n\nPainel: ' + url : '');
}
function msgConcluida(t, data, restantes){
  var hoje = data === hojeSP();
  return '✅ *Tarefa concluída*\n*' + t.cliente + '* · ' + t.titulo + (hoje ? '' : ' (' + dataBR(data) + ')') + '\n\n' +
    (restantes ? 'Falta' + (restantes > 1 ? 'm ' : ' ') + restantes + ' tarefa' + (restantes > 1 ? 's' : '') + (hoje ? ' hoje.' : ' nesse dia.')
               : '🎉 Todas as tarefas ' + (hoje ? 'de hoje' : 'desse dia') + ' foram concluídas!');
}
function destino(cfg){ return { canal: 'zapi', destino: String(cfg.fone || '').replace(/\D/g, '') }; }

/* ---------- marcar como feita (e avisar a social media) ---------- */
async function marca(data, chave, feito, email){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(data || ''))) throw erro('Data inválida', 400);
  if(!/^(r_[A-Za-z0-9_-]{1,40}_[A-Za-z0-9_-]{1,40}|a_[A-Za-z0-9_-]{1,40})$/.test(String(chave || ''))) throw erro('Tarefa inválida', 400);
  var r = ref('tarefas/feitas/' + data + '/' + chave);
  if(!feito){ await r.remove(); return { ok: true }; }
  await r.set({ em: new Date().toISOString(), por: email || '' });

  var base = await carrega(data), cfg = base.config;
  if(!cfg.ligado || !cfg.fone) return { ok: true };
  var ts = tarefasDoDia(data, base), t = ts.filter(function(x){ return x.chave === chave; })[0];
  if(!t) return { ok: true };
  try{ await meta.enviaWhats(msgConcluida(t, data, ts.filter(function(x){ return !x.feita; }).length), destino(cfg)); return { ok: true, avisou: true }; }
  catch(e){ return { ok: true, aviso: 'Tarefa marcada, mas o WhatsApp não foi enviado: ' + e.message }; }
}

/* ---------- agendador (roda de hora em hora) ----------
   No horário do resumo manda as tarefas do dia; em cada horário de lembrete
   manda o que ainda está pendente. Se o WhatsApp falhar, nada é marcado e
   tenta de novo na hora seguinte. */
async function rodada(url){
  var cfgRaw = (await ref('tarefas/config').once('value')).val() || {};
  if(!cfgRaw.ligado || !cfgRaw.fone) return { motivo: 'desligado' };
  var hoje = hojeSP(), h = horaSP();
  if(cfgRaw.diasUteis !== false && dow(hoje) > 5) return { motivo: 'fim de semana' };
  var hResumo = num(cfgRaw.horaResumo, 9);
  var lemb = (cfgRaw.lembretes || [12, 15, 18]).map(Number).filter(function(x){ return x > hResumo; });
  if(h < hResumo) return { motivo: 'antes do resumo' };

  var base = await carrega(hoje), env = base.envios, ts = tarefasDoDia(hoje, base);
  var envRef = ref('tarefas/envios/' + hoje), agora = new Date().toISOString(), marcar = {};
  /* lembretes que já passaram contam como feitos junto com o resumo atrasado */
  function passados(){ lemb.forEach(function(x){ if(h >= x) marcar['l' + x] = agora; }); }

  if(!env.resumo){
    if(ts.length) await meta.enviaWhats(msgResumo(hoje, ts, url), destino(cfgRaw));
    marcar.resumo = ts.length ? agora : 'sem tarefas'; passados();
    await envRef.update(marcar);
    return { resumo: ts.length };
  }
  var devidos = lemb.filter(function(x){ return h >= x && !env['l' + x]; });
  if(!devidos.length) return { motivo: 'nada para mandar agora' };
  var pend = ts.filter(function(t){ return !t.feita; });
  if(pend.length) await meta.enviaWhats(msgPendentes(ts, pend, url), destino(cfgRaw));
  devidos.forEach(function(x){ marcar['l' + x] = agora; });
  await envRef.update(marcar);
  return { pendentes: pend.length };
}

async function teste(){
  var cfg = (await ref('tarefas/config').once('value')).val() || {};
  if(!cfg.fone) throw erro('Cadastre o número da social media primeiro', 400);
  await meta.enviaWhats('✅ *Teste das tarefas 2STEP*\n\nSe esta mensagem chegou, as tarefas do dia vão chegar aqui.', destino(cfg));
}

module.exports = { tarefasDoDia: tarefasDoDia, marca: marca, rodada: rodada, teste: teste, PADRAO: PADRAO };
