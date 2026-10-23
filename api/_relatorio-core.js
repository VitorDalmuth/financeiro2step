/* ============================================================
   2STEP · RELATÓRIOS SEMANAIS (núcleo do servidor)
   Usado por api/relatorios.js e pelo agendador (api/meta-saldo.js).
   Puxa as métricas da semana fechada (segunda a domingo) das contas
   Meta e Google de cada cliente e guarda como rascunho para revisar.
   ------------------------------------------------------------
   Dados em 2step_financeiro/relatorios:
     clientes/{clienteId}         -> contas, métricas escolhidas, logo
     semanas/{clienteId}/{segunda}-> { inicio, fim, originais, editados,
                                      erros, geradoEm, origem, enviadoEm }
   Os valores ajustados à mão ficam em "editados" e nunca são apagados
   quando os dados são puxados de novo.
   ============================================================ */
var core = require('./_asaas-core');
var meta = require('./_meta-core');
var google = require('./_google-core');

var ref = core.ref;
var POR_RODADA = 6;   /* clientes por rodada do agendador (o resto sai na hora seguinte) */
function erro(msg, http){ return Object.assign(new Error(msg), { http: http }); }

/* ---------- semanas (fuso de São Paulo) ---------- */
function hojeSP(){ return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }); }
function horaSP(){ return Number(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false })) % 24; }
function addDias(d, k){ var x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + k); return x.toISOString().slice(0, 10); }
function segundaDe(d){ var dow = (new Date(d + 'T12:00:00Z').getUTCDay() + 6) % 7; return addDias(d, -dow); }
/* a última semana completa: de segunda a domingo, sem contar a semana atual */
function semanaPassada(){ return addDias(segundaDe(hojeSP()), -7); }

/* ---------- Meta ---------- */
var CAMPOS_META = 'spend,impressions,reach,clicks,inline_link_clicks,outbound_clicks,actions,action_values,video_thruplay_watched_actions';
/* tipos de ação, em ordem de preferência (pega o primeiro que existir para não contar duas vezes) */
var ACOES = {
  conversas: ['onsite_conversion.messaging_conversation_started_7d'],
  leads: ['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead'],
  compras: ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase'],
  engajamento: ['post_engagement']
};
function acao(lista, tipos){
  lista = lista || [];
  for(var i = 0; i < tipos.length; i++){
    var a = lista.filter(function(x){ return x.action_type === tipos[i]; })[0];
    if(a) return Number(a.value) || 0;
  }
  return 0;
}
/* visitas ao perfil do Instagram: a Meta já mudou o nome dessa ação algumas vezes */
var RE_PERFIL = /profile_visit|profile_view|ig_profile|instagram_profile/i;
function visitasPerfil(lista){
  return (lista || []).filter(function(x){ return RE_PERFIL.test(x.action_type); })
    .reduce(function(m, x){ return Math.max(m, Number(x.value) || 0); }, 0);
}
/* Lê campanha por campanha o RESULTADO (campo "results") e o investimento.
   - Em Tráfego com destino "Perfil do Instagram" as visitas só aparecem aqui.
   - Os custos por resultado usam só o investimento das campanhas daquele
     resultado (igual ao Gerenciador): uma campanha de engajamento na mesma
     conta não encarece o custo por visita, por lead ou por conversa.
   Se o campo não existir, segue sem ele (os custos usam o investimento total). */
var RE_CONVERSA = /messaging_conversation_started/i;
var RE_LEAD = /(^|[.:_])lead($|_grouped)|fb_pixel_lead/i;
async function resultadosCampanhas(actId, inicio, fim, tk){
  var out = { visitas: 0, investPerfil: 0, investConversas: 0, investLeads: 0, bruto: '' };
  try{
    var j = await meta.metaFetch(meta.metaUrl(actId + '/insights', {
      fields: 'campaign_name,objective,spend,results', level: 'campaign', limit: 200,
      time_range: JSON.stringify({ since: inicio, until: fim })
    }, tk));
    (j.data || []).forEach(function(c){
      var gasto = Number(c.spend) || 0, tipos = {};
      (c.results || []).forEach(function(r){
        var ind = String(r.indicator || '');
        if(RE_PERFIL.test(ind)){ tipos.perfil = 1; out.visitas += Number(((r.values || [])[0] || {}).value) || 0; }
        else if(RE_CONVERSA.test(ind)) tipos.conversa = 1;
        else if(RE_LEAD.test(ind)) tipos.lead = 1;
      });
      if(tipos.perfil) out.investPerfil += gasto;
      if(tipos.conversa) out.investConversas += gasto;
      if(tipos.lead) out.investLeads += gasto;
    });
    out.bruto = JSON.stringify(j.data || []).slice(0, 4000);
  }catch(e){ out.bruto = 'erro: ' + e.message; }
  return out;
}
async function leMeta(actId, inicio, fim, tk, diag){
  var j = await meta.metaFetch(meta.metaUrl(actId + '/insights', {
    fields: CAMPOS_META, level: 'account', time_range: JSON.stringify({ since: inicio, until: fim })
  }, tk));
  var d = (j.data || [])[0] || {};
  var res = await resultadosCampanhas(actId, inicio, fim, tk);
  /* guarda o que a Meta devolveu, para conferência no relatório */
  if(diag) diag.push({
    conta: actId,
    acoes: (d.actions || []).map(function(a){ return { t: a.action_type, v: a.value }; }),
    resultados: res.bruto
  });
  return {
    invest: Number(d.spend) || 0, impressoes: Number(d.impressions) || 0, alcance: Number(d.reach) || 0,
    cliques: Number(d.clicks) || 0, cliquesLink: Number(d.inline_link_clicks) || 0,
    /* cliques de saída: soma o que vier no campo, seja qual for o nome do tipo */
    cliquesSaida: (d.outbound_clicks || []).reduce(function(a, x){ return a + (Number(x.value) || 0); }, 0),
    conversas: acao(d.actions, ACOES.conversas), leads: acao(d.actions, ACOES.leads),
    compras: acao(d.actions, ACOES.compras), valorCompras: acao(d.action_values, ACOES.compras),
    engajamento: acao(d.actions, ACOES.engajamento), visitasPerfil: Math.max(visitasPerfil(d.actions), res.visitas),
    investPerfil: res.investPerfil, investConversas: res.investConversas, investLeads: res.investLeads,
    thruplay: ((d.video_thruplay_watched_actions || [])[0] || {}).value ? Number(d.video_thruplay_watched_actions[0].value) : 0
  };
}

/* ---------- Google ---------- */
async function leGoogle(gid, gerente, inicio, fim, tk){
  var login = String(gerente || '').replace(/\D/g, '') || google.mcc() || gid;
  var onde = " FROM customer WHERE segments.date BETWEEN '" + inicio + "' AND '" + fim + "'";
  var rows;
  try{ rows = await google.gaql(gid, 'SELECT metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.phone_calls' + onde, tk, login); }
  catch(e){ rows = await google.gaql(gid, 'SELECT metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions' + onde, tk, login); }
  var m = ((rows || [])[0] || {}).metrics || {};
  return {
    invest: Math.round(Number(m.costMicros || 0) / 1e4) / 100, impressoes: Number(m.impressions) || 0,
    cliques: Number(m.clicks) || 0, conversoes: Math.round((Number(m.conversions) || 0) * 100) / 100, ligacoes: Number(m.phoneCalls) || 0
  };
}

/* várias contas da mesma plataforma: soma tudo */
function soma(a, b){
  Object.keys(b).forEach(function(k){ a[k] = Math.round(((a[k] || 0) + (b[k] || 0)) * 100) / 100; });
  return a;
}

/* ---------- gerar ---------- */
async function gera(clienteId, inicio, origem){
  if(!/^[A-Za-z0-9_-]{1,40}$/.test(String(clienteId || ''))) throw erro('Cliente inválido', 400);
  var cfg = (await ref('relatorios/clientes/' + clienteId).once('value')).val();
  if(!cfg) throw erro('Esse cliente não está configurado em Relatórios', 404);
  inicio = /^\d{4}-\d{2}-\d{2}$/.test(String(inicio || '')) ? segundaDe(inicio) : semanaPassada();
  var fim = addDias(inicio, 6);
  if(fim >= hojeSP()) throw erro('Essa semana ainda não terminou. O relatório sai na segunda-feira seguinte.', 400);

  var contas = Object.keys(cfg.contas || {}).map(function(k){ return cfg.contas[k]; }).filter(Boolean);
  var cMeta = contas.filter(function(c){ return c.plataforma !== 'google'; });
  var cGoogle = contas.filter(function(c){ return c.plataforma === 'google'; });
  if(!contas.length) throw erro('Escolha pelo menos uma conta de anúncios na configuração do cliente', 400);

  var originais = {}, erros = [], brutoMeta = [];
  if(cMeta.length){
    try{
      var tk = (await meta.tokenAtual()).token;
      originais.meta = {};
      for(var i = 0; i < cMeta.length; i++){
        try{ soma(originais.meta, await leMeta(cMeta[i].id, inicio, fim, tk, brutoMeta)); }
        catch(e){ erros.push('Meta · ' + (cMeta[i].nome || cMeta[i].id) + ': ' + e.message); }
      }
    }catch(e){ erros.push('Meta: ' + e.message); }
  }
  if(cGoogle.length){
    try{
      var gtk = await google.acesso();
      originais.google = {};
      for(var j = 0; j < cGoogle.length; j++){
        try{ soma(originais.google, await leGoogle(cGoogle[j].googleId, cGoogle[j].gerente, inicio, fim, gtk)); }
        catch(e){ erros.push('Google · ' + (cGoogle[j].nome || cGoogle[j].googleId) + ': ' + e.message); }
      }
    }catch(e){ erros.push('Google: ' + e.message); }
  }

  var reg = { inicio: inicio, fim: fim, geradoEm: new Date().toISOString(), origem: origem || 'manual', originais: originais, erros: erros, brutoMeta: brutoMeta };
  var r = ref('relatorios/semanas/' + clienteId + '/' + inicio);
  await r.update(reg);   /* update: mantém os ajustes manuais e a data de envio */
  return (await r.once('value')).val();
}

/* rascunhos da semana passada para quem ainda não tem: a partir de segunda 7h */
async function pendentes(){
  var hoje = hojeSP();
  if((new Date(hoje + 'T12:00:00Z').getUTCDay() === 1) && horaSP() < 7) return { feitos: 0, motivo: 'antes das 7h de segunda' };
  var semana = semanaPassada();
  var clientes = (await ref('relatorios/clientes').once('value')).val() || {};
  var feitos = 0, falhas = [];
  /* só clientes que já têm conta de anúncio configurada */
  var ids = Object.keys(clientes).filter(function(k){ return clientes[k] && Object.keys(clientes[k].contas || {}).length; });
  for(var i = 0; i < ids.length && feitos < POR_RODADA; i++){
    var ja = (await ref('relatorios/semanas/' + ids[i] + '/' + semana + '/geradoEm').once('value')).val();
    if(ja) continue;
    try{ await gera(ids[i], semana, 'automatico'); }
    catch(e){
      /* registra o erro na semana: aparece na tela e não fica tentando de novo toda hora */
      falhas.push(ids[i] + ': ' + e.message);
      await ref('relatorios/semanas/' + ids[i] + '/' + semana).update({ inicio: semana, fim: addDias(semana, 6), geradoEm: new Date().toISOString(), origem: 'automatico', erros: [e.message] });
    }
    feitos++;
  }
  return { semana: semana, feitos: feitos, falhas: falhas };
}

module.exports = { gera: gera, pendentes: pendentes, semanaPassada: semanaPassada };
