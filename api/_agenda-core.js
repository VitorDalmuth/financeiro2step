/* ============================================================
   2STEP · AVISOS DA AGENDA PESSOAL (núcleo do servidor)
   Usado por api/tarefas.js e pelo agendador (api/meta-saldo.js).
   Cada pessoa pode receber no próprio WhatsApp a mesma agenda que
   vê na Home: tarefas avulsas, de tráfego, de social media e a rotina
   de relatórios de segunda, só as dela (ou sem responsável, se for
   administrador), mais as atrasadas dos últimos dias.
   A regra de montar o dia é a mesma de home.js (homeDoDia/homeVisivel).
   ------------------------------------------------------------
   Dados (raiz "tarefasPessoais"):
     avisos/{chaveEmail}        -> { ligado, fone, horaResumo, lembretes, diasUteis }
     envios/{data}/{chaveEmail} -> o que o agendador já mandou naquele dia
   Envio pela Z-API (mesmo chip dos alertas de saldo e das tarefas).
   ============================================================ */
var core = require('./_asaas-core');
var meta = require('./_meta-core');
var tar = require('./_tarefas-core');

var ref = core.ref;
var ATRASO_DIAS = 7;
var ROTINA = [['relatorio', 'Enviar relatório'], ['checklist', 'Enviar checklist'], ['audio', 'Enviar áudio']];
var ORIGEM = { social: 'social media', trafego: 'tráfego', rel: 'relatórios' };
function erro(msg, http){ return Object.assign(new Error(msg), { http: http }); }
function num(v, p){ var x = Number(v); return isFinite(x) && v !== '' && v != null ? x : p; }
function chaveDe(email){ return String(email || '').toLowerCase().replace(/\./g, ','); }
function horaSP(){ return Number(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false })) % 24; }
function dataBR(d){ return d.slice(8, 10) + '/' + d.slice(5, 7); }
function addDias(dstr, k){ var d = new Date(dstr + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + k); return d.toISOString().slice(0, 10); }

/* ---------- configuração de cada pessoa ---------- */
function limpaConfig(b){
  b = b || {};
  var lemb = Array.isArray(b.lembretes) ? b.lembretes.map(Number).filter(function(x){ return x >= 6 && x <= 22; }) : [12, 15, 18];
  var c = { ligado: !!b.ligado, fone: String(b.fone || '').replace(/\D/g, ''), horaResumo: Math.min(12, Math.max(5, num(b.horaResumo, 8))),
            lembretes: lemb.filter(function(x, i){ return lemb.indexOf(x) === i; }).sort(function(a, b){ return a - b; }), diasUteis: b.diasUteis !== false };
  if(c.ligado && !/^55\d{10,11}$/.test(c.fone)) throw erro('Número inválido: use 55 + DDD + número, ex. 5548999999999', 400);
  return c;
}
async function salvaConfig(email, b){
  var c = limpaConfig(b); c.atualizadoEm = new Date().toISOString();
  await ref('tarefasPessoais/avisos/' + chaveDe(email)).set(c);
  return c;
}
async function configDe(email){ return (await ref('tarefasPessoais/avisos/' + chaveDe(email)).once('value')).val() || {}; }
function destinoDe(cfg){ var f = String((cfg || {}).fone || '').replace(/\D/g, ''); return f ? { canal: 'zapi', destino: f } : null; }

/* ---------- carregar tudo de uma vez ---------- */
async function carregaTudo(hoje){
  var r = await Promise.all([
    ref('tarefas').once('value'), ref('tarefasTrafego').once('value'), ref('tarefasPessoais').once('value'),
    ref('clientes').once('value'), ref('usuarios').once('value'), ref('relatorios/clientes').once('value'),
    ref('relatorios/rotina').orderByKey().startAt(addDias(hoje, -ATRASO_DIAS)).once('value')
  ]);
  var D = { social: r[0].val() || {}, trafego: r[1].val() || {}, pessoal: r[2].val() || {}, clientes: r[3].val() || {}, usuarios: r[4].val() || {},
            relCfg: r[5].val() || {}, rotina: r[6].val() || {}, semanas: {} };
  D.resp = (D.social.config || {}).responsaveis || {};
  /* as semanas dos relatórios só importam se a rotina de segunda estiver ligada */
  if(D.resp.inicioRotina) D.semanas = (await ref('relatorios/semanas').once('value')).val() || {};
  return D;
}

/* ---------- montar o dia (mesma regra da Home e de _tarefas-core, com o responsável) ---------- */
function tarefasDoDia(data, dados, clientes, comRotinas){
  var d = tar.dow(data), out = [];
  var exc = (dados.excecoes || {})[data] || {};
  var inicio = (dados.config || {}).inicio || '';
  if(comRotinas && (!inicio || data >= inicio)){
    Object.keys(clientes).forEach(function(cid){
      var c = clientes[cid];
      if(!c || !c.socialMedia || c.status === 'encerrado') return;
      var r = (dados.rotinas || {})[cid] || {};
      if(r.pausado) return;
      var itens = r.editado ? (r.itens || {}) : tar.PADRAO;
      Object.keys(itens).forEach(function(k){
        var it = itens[k];
        if(!it || (it.dias || []).indexOf(d) < 0) return;
        var ch = 'r_' + cid + '_' + k;
        if(!exc[ch]) out.push({ chave: ch, clienteId: cid, cliente: c.nome || 'Cliente', titulo: it.tipo || 'Tarefa', fixa: true, resp: '' });
      });
    });
  }
  Object.keys(dados.avulsas || {}).forEach(function(k){
    var a = dados.avulsas[k];
    if(!a || a.data !== data) return;
    out.push({ chave: 'a_' + k, clienteId: a.clienteId || '', cliente: a.clienteId ? ((clientes[a.clienteId] || {}).nome || 'Cliente') : 'Sem cliente', titulo: a.titulo || 'Tarefa', fixa: false, resp: a.resp || '' });
  });
  var f = (dados.feitas || {})[data] || {};
  out.forEach(function(t){ t.feita = f[t.chave] || null; });
  return out.sort(function(a, b){
    return String(a.cliente).localeCompare(String(b.cliente), 'pt-BR') || (b.fixa - a.fixa) || String(a.titulo).localeCompare(String(b.titulo), 'pt-BR');
  });
}
function doDiaQuadro(data, dados, D, comRotinas, q, respPadrao){
  return tarefasDoDia(data, dados, D.clientes, comRotinas).map(function(t){ return Object.assign(t, { q: q, data: data, resp: t.resp || (q === 'pessoal' ? '' : (respPadrao || '')) }); });
}
function plats(c){
  var cs = Object.keys(c.contas || {}).map(function(k){ return c.contas[k]; }).filter(Boolean);
  return ['meta', 'google'].filter(function(p){ return cs.some(function(x){ return (x.plataforma === 'google' ? 'google' : 'meta') === p; }) && ((c.metricas || {})[p] || []).length; });
}
function rotinaDoDia(data, D){
  var ini = D.resp.inicioRotina || '';
  if(!ini || data < ini || tar.dow(data) !== 1) return [];
  var sem = addDias(data, -7), feitas = D.rotina[data] || {}, padrao = D.resp.relatorios || '', out = [];
  Object.keys(D.relCfg).forEach(function(id){
    var c = D.relCfg[id], cli = D.clientes[id];
    if(!c || !cli || cli.status === 'encerrado' || !plats(c).length) return;
    var s = ((D.semanas[id] || {})[sem]) || {}, resp = c.responsavel || padrao;
    ROTINA.forEach(function(it){
      var ch = id + '_' + it[0], reg = feitas[ch] || null, auto = '';
      if(!reg && it[0] === 'relatorio' && s.enviadoEm) auto = s.enviadoEm;
      if(!reg && it[0] === 'checklist' && s.checklist && s.checklist.enviadoEm) auto = s.checklist.enviadoEm;
      out.push({ q: 'rel', data: data, chave: ch, clienteId: id, cliente: cli.nome || 'Cliente', titulo: it[1], resp: resp, feita: reg || (auto ? { em: auto, auto: true } : null) });
    });
  });
  return out;
}
function doDia(data, D){
  return [].concat(
    doDiaQuadro(data, D.social, D, true, 'social', D.resp.social),
    doDiaQuadro(data, D.trafego, D, false, 'trafego', D.resp.trafego),
    doDiaQuadro(data, D.pessoal, D, false, 'pessoal', ''),
    rotinaDoDia(data, D));
}
function visivel(t, chave, admin){ return t.resp ? t.resp === chave : admin; }
function agendaDe(D, chave, hoje){
  var admin = ((D.usuarios[chave] || {}).papel === 'admin');
  var lista = doDia(hoje, D).filter(function(t){ return visivel(t, chave, admin); }), atras = [];
  for(var i = ATRASO_DIAS; i >= 1; i--){
    doDia(addDias(hoje, -i), D).forEach(function(t){ if(!t.feita && visivel(t, chave, admin)) atras.push(t); });
  }
  return { hoje: lista, atrasadas: atras };
}
function nomeDe(D, chave){
  var u = D.usuarios[chave] || {}, n = String(u.nome || '').trim().split(' ')[0];
  return n ? n.charAt(0).toUpperCase() + n.slice(1) : '';
}

/* ---------- mensagens ---------- */
function linha(t, comData){ return '• ' + t.titulo + (ORIGEM[t.q] ? ' · ' + ORIGEM[t.q] : '') + (comData ? ' (' + dataBR(t.data) + ')' : ''); }
function lista(ts, comData){
  var grupos = {}, ordem = [];
  ts.forEach(function(t){ var k = t.cliente || 'Sem cliente'; if(!grupos[k]){ grupos[k] = []; ordem.push(k); } grupos[k].push(t); });
  return ordem.map(function(c){ return '*' + c + '*\n' + grupos[c].map(function(t){ return linha(t, comData); }).join('\n'); }).join('\n\n');
}
function blocoAtrasadas(ag){ return ag.atrasadas.length ? '\n\n⚠️ *Atrasadas (' + ag.atrasadas.length + ')*\n' + lista(ag.atrasadas, true) : ''; }
function plural(n, s){ return n + ' ' + s + (n === 1 ? '' : 's'); }
function msgResumo(nome, hoje, ag, url){
  return '☀️ *Bom dia' + (nome ? ', ' + nome : '') + '!* Sua agenda de ' + tar.quando(hoje) + '\n\n' +
    (ag.hoje.length ? lista(ag.hoje) : 'Nenhuma tarefa marcada para hoje.') + blocoAtrasadas(ag) +
    '\n\n' + plural(ag.hoje.length, 'tarefa') + ' hoje. Marque cada uma como feita no painel' + (url ? ': ' + url : '.');
}
function msgPendentes(hoje, ag, pend, url){
  return '⏰ *Suas pendências de hoje* (' + (ag.hoje.length - pend.length) + ' de ' + ag.hoje.length + ' feitas)\n\n' + lista(pend) + blocoAtrasadas(ag) + (url ? '\n\nPainel: ' + url : '');
}
function msgTudoFeito(ag, url){
  return '🎉 *Tudo feito por hoje!* (' + ag.hoje.length + ' de ' + ag.hoje.length + ')' + blocoAtrasadas(ag) + (ag.atrasadas.length && url ? '\n\nPainel: ' + url : '');
}
function msgAgora(nome, hoje, ag, url){
  var pend = ag.hoje.filter(function(t){ return !t.feita; });
  if(pend.length) return msgPendentes(hoje, ag, pend, url);
  if(ag.hoje.length) return msgTudoFeito(ag, url);
  return '📋 *Sua agenda de ' + tar.quando(hoje) + '*\n\nNenhuma tarefa marcada para hoje.' + blocoAtrasadas(ag) + (url ? '\n\nPainel: ' + url : '');
}

/* ---------- envio na hora (botão do painel) e teste ---------- */
async function enviaAgora(email, url){
  var cfg = await configDe(email), dest = destinoDe(cfg);
  if(!dest) throw erro('Cadastre seu número primeiro', 400);
  var hoje = tar.hojeSP(), D = await carregaTudo(hoje), chave = chaveDe(email), ag = agendaDe(D, chave, hoje);
  await meta.enviaWhats(msgAgora(nomeDe(D, chave), hoje, ag, url), dest);
  return { ok: true, hoje: ag.hoje.length, pendentes: ag.hoje.filter(function(t){ return !t.feita; }).length, atrasadas: ag.atrasadas.length };
}
async function teste(email){
  var cfg = await configDe(email), dest = destinoDe(cfg);
  if(!dest) throw erro('Cadastre seu número primeiro', 400);
  await meta.enviaWhats('✅ *Teste dos avisos da sua agenda 2STEP*\n\nSe esta mensagem chegou, o resumo das suas tarefas vai chegar aqui.', dest);
}

/* ---------- agendador (roda de hora em hora) ----------
   Para cada pessoa com avisos ligados: no horário do resumo manda a agenda
   do dia; em cada lembrete, o que ainda está pendente. Falhou o WhatsApp,
   nada é marcado e tenta de novo na hora seguinte. */
async function rodada(url){
  var cfgs = (await ref('tarefasPessoais/avisos').once('value')).val() || {};
  var chaves = Object.keys(cfgs).filter(function(k){ return cfgs[k] && cfgs[k].ligado && destinoDe(cfgs[k]); });
  if(!chaves.length) return { motivo: 'ninguém com avisos ligados' };
  var hoje = tar.hojeSP(), h = horaSP(), out = {}, D = null;
  var envTodos = (await ref('tarefasPessoais/envios/' + hoje).once('value')).val() || {};
  for(var i = 0; i < chaves.length; i++){
    var chave = chaves[i], cfg = cfgs[chave];
    try{
      if(cfg.diasUteis !== false && tar.dow(hoje) > 5){ out[chave] = { motivo: 'fim de semana' }; continue; }
      var hResumo = num(cfg.horaResumo, 8);
      var lemb = (cfg.lembretes || [12, 15, 18]).map(Number).filter(function(x){ return x > hResumo; });
      if(h < hResumo){ out[chave] = { motivo: 'antes do resumo' }; continue; }
      var env = envTodos[chave] || {}, devidos = lemb.filter(function(x){ return h >= x && !env['l' + x]; });
      if(env.resumo && !devidos.length){ out[chave] = { motivo: 'nada para mandar agora' }; continue; }

      if(!D) D = await carregaTudo(hoje);
      var ag = agendaDe(D, chave, hoje), dest = destinoDe(cfg), agora = new Date().toISOString(), marcar = {};
      var envRef = ref('tarefasPessoais/envios/' + hoje + '/' + chave);
      if(!env.resumo){
        var tem = ag.hoje.length || ag.atrasadas.length;
        if(tem) await meta.enviaWhats(msgResumo(nomeDe(D, chave), hoje, ag, url), dest);
        marcar.resumo = tem ? agora : 'sem tarefas';
        /* lembretes que já passaram contam como feitos junto com o resumo atrasado */
        lemb.forEach(function(x){ if(h >= x) marcar['l' + x] = agora; });
        await envRef.update(marcar);
        out[chave] = { resumo: ag.hoje.length, atrasadas: ag.atrasadas.length };
        continue;
      }
      var pend = ag.hoje.filter(function(t){ return !t.feita; });
      if(pend.length) await meta.enviaWhats(msgPendentes(hoje, ag, pend, url), dest);
      else if(ag.atrasadas.length) await meta.enviaWhats(msgTudoFeito(ag, url), dest);
      devidos.forEach(function(x){ marcar['l' + x] = agora; });
      await envRef.update(marcar);
      out[chave] = { pendentes: pend.length, atrasadas: ag.atrasadas.length };
    }catch(e){ out[chave] = { erro: String(e.message || e) }; }
  }
  return out;
}

module.exports = { salvaConfig: salvaConfig, configDe: configDe, enviaAgora: enviaAgora, teste: teste, rodada: rodada, agendaDe: agendaDe, carregaTudo: carregaTudo };
