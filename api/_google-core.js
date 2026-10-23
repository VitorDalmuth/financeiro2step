/* ============================================================
   2STEP · CONEXÃO GOOGLE ADS (núcleo do servidor)
   Usado por api/google-ads.js e api/google-retorno.js.
   Login com a conta Google da MCC; o sistema lista as contas de
   anúncio a que ela tem acesso e consulta os dados de faturamento.
   ------------------------------------------------------------
   Variáveis de ambiente (Vercel > Settings > Environment Variables):
     GOOGLE_CLIENT_ID       ID do cliente OAuth (Google Cloud)
     GOOGLE_CLIENT_SECRET   chave secreta do cliente OAuth
     GOOGLE_ADS_MCC_ID      ID da MCC, ex. 123-456-7890 (recomendado)
     GOOGLE_ADS_API_VERSAO  opcional, padrão v26
     GOOGLE_ADS_DEVELOPER_TOKEN  opcional: o Google aposentou o token
                            em set/2026; o acesso agora vem do projeto
   O token de acesso fica em 2step_financeiro/googlePriv, que o app
   não consegue ler.
   ============================================================ */
var crypto = require('crypto');
var core = require('./_asaas-core');

var ref = core.ref;
function erro(msg, http){ return Object.assign(new Error(msg), { http: http }); }
function soDigitos(s){ return String(s || '').replace(/\D/g, ''); }
function versao(){ return process.env.GOOGLE_ADS_API_VERSAO || 'v26'; }
function appOk(){ return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET); }
function mcc(){ return soDigitos(process.env.GOOGLE_ADS_MCC_ID); }
function configStatus(){ return { app: appOk(), mcc: !!mcc(), versao: versao() }; }

/* ---------- login Google ---------- */
/* o endereço de volta precisa ser exatamente o cadastrado no cliente OAuth */
function urlRetorno(req){ return 'https://' + String(req.headers['x-forwarded-host'] || req.headers.host || '') + '/api/google-retorno'; }

async function iniciaLogin(req, email){
  if(!appOk()) throw erro('GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET não configurados na Vercel', 500);
  var state = crypto.randomBytes(24).toString('hex');
  await ref('googlePriv/oauth/' + state).set({ email: email || '', em: new Date().toISOString() });
  return 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: urlRetorno(req), response_type: 'code',
    scope: 'https://www.googleapis.com/auth/adwords openid email',
    access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state: state
  }).toString();
}
async function tokenPost(params){
  var r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params).toString()
  });
  var j = await r.json().catch(function(){ return {}; });
  if(!r.ok || j.error) throw Object.assign(new Error('Google: ' + (j.error_description || j.error || ('respondeu ' + r.status))), { expirado: j.error === 'invalid_grant' });
  return j;
}
function emailDoIdToken(jwt){
  try{ return JSON.parse(Buffer.from(String(jwt).split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')).email || ''; }
  catch(e){ return ''; }
}
async function concluiLogin(req){
  var q = req.query || {};
  if(q.error) throw new Error(q.error === 'access_denied' ? 'Você cancelou a autorização no Google' : ('O Google não autorizou: ' + q.error));
  var state = String(q.state || '');
  if(!/^[a-f0-9]{48}$/.test(state)) throw new Error('Link de retorno inválido. Clique em Conectar Google de novo.');
  var stRef = ref('googlePriv/oauth/' + state), st = (await stRef.once('value')).val();
  await stRef.remove();
  if(!st || Date.now() - Date.parse(st.em) > 15 * 60e3) throw new Error('A conexão demorou demais. Clique em Conectar Google de novo.');
  if(!appOk()) throw new Error('GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET não configurados na Vercel');

  var t = await tokenPost({ code: String(q.code || ''), client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET,
                            redirect_uri: urlRetorno(req), grant_type: 'authorization_code' });
  if(String(t.scope || '').indexOf('adwords') < 0) throw new Error('Faltou autorizar o acesso ao Google Ads. Conecte de novo e marque a permissão do Google Ads.');
  if(!t.refresh_token) throw new Error('O Google não devolveu a autorização permanente. Remova o app em myaccount.google.com/permissions e conecte de novo.');
  var pub = { email: emailDoIdToken(t.id_token), conectadoEm: new Date().toISOString(), conectadoPor: st.email || '', situacao: 'ok' };
  await ref('googlePriv/conexao').set(Object.assign({ refreshToken: t.refresh_token }, pub));
  return pub;
}
async function conexaoPublica(){
  var c = (await ref('googlePriv/conexao').once('value')).val();
  if(!c) return null;
  return { email: c.email || '', conectadoEm: c.conectadoEm || '', conectadoPor: c.conectadoPor || '', situacao: c.situacao || 'ok' };
}
async function desconecta(){ await ref('googlePriv/conexao').remove(); }

/* token de acesso de 1 hora, gerado a partir da autorização permanente */
async function acesso(){
  var c = (await ref('googlePriv/conexao').once('value')).val();
  if(!c || !c.refreshToken) throw erro('Conecte o Google em Operacional › Saldo Ads', 400);
  try{
    return (await tokenPost({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET,
                              refresh_token: c.refreshToken, grant_type: 'refresh_token' })).access_token;
  }catch(e){
    if(e.expirado){
      await ref('googlePriv/conexao/situacao').set('expirada');
      throw Object.assign(erro('A conexão com o Google caiu (autorização revogada ou app em modo Teste). Clique em Reconectar Google.', 400), { expirado: true });
    }
    throw e;
  }
}

/* ---------- API do Google Ads ---------- */
function msgErro(j, status){
  var e = (j && j.error) || (Array.isArray(j) && j[0] && j[0].error) || {};
  var det = ((e.details || [])[0] || {}).errors || [];
  var d = det[0] ? det[0].message + ' [' + JSON.stringify(det[0].errorCode || {}) + ']' : '';
  return (e.message || ('respondeu ' + status)) + (d ? ' · ' + d : '');
}
async function adsFetch(caminho, corpo, tk, loginId){
  var h = { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' };
  if(process.env.GOOGLE_ADS_DEVELOPER_TOKEN) h['developer-token'] = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if(loginId) h['login-customer-id'] = loginId;
  var r = await fetch('https://googleads.googleapis.com/' + versao() + '/' + caminho, {
    method: corpo ? 'POST' : 'GET', headers: h, body: corpo ? JSON.stringify(corpo) : undefined
  });
  var j = await r.json().catch(function(){ return {}; });
  if(!r.ok || (j && j.error)) throw new Error('Google Ads: ' + msgErro(j, r.status));
  return j;
}
async function gaql(cid, query, tk, loginId){
  var out = [], pagina = '', guard = 0;
  do{
    var corpo = { query: query };
    if(pagina) corpo.pageToken = pagina;
    var j = await adsFetch('customers/' + cid + '/googleAds:search', corpo, tk, loginId);
    out = out.concat(j.results || []);
    pagina = j.nextPageToken || '';
  }while(pagina && guard++ < 20);
  return out;
}

/* contas de anúncio (não gerenciadoras) da MCC, ou de todas as contas que o login acessa */
async function listaContas(){
  var tk = await acesso();
  var raizes = mcc() ? [mcc()] :
    ((await adsFetch('customers:listAccessibleCustomers', null, tk)).resourceNames || []).map(function(n){ return n.split('/')[1]; });
  var porId = {}, erros = [];
  for(var i = 0; i < raizes.length && i < 30; i++){
    try{
      var rows = await gaql(raizes[i], 'SELECT customer_client.id, customer_client.descriptive_name, customer_client.manager, customer_client.status, ' +
        'customer_client.currency_code, customer_client.level FROM customer_client WHERE customer_client.level <= 3', tk, raizes[i]);
      rows.forEach(function(r){
        var c = r.customerClient || {};
        if(c.manager || porId[c.id]) return;
        porId[c.id] = { id: String(c.id), nome: c.descriptiveName || '', status: c.status || '', moeda: c.currencyCode || 'BRL', gerente: raizes[i] };
      });
    }catch(e){ erros.push(raizes[i] + ': ' + e.message); }
  }
  var lista = Object.keys(porId).map(function(k){ return porId[k]; });
  if(!lista.length && erros.length) throw new Error(erros[0]);
  return lista.sort(function(a, b){ return a.nome.localeCompare(b.nome, 'pt-BR'); });
}

/* ---------- saldo pré-pago ----------
   O Google guarda o pré-pago como "orçamento da conta": cada Pix aumenta
   o limite; fundos disponíveis = limite ajustado − valor já veiculado.
   Vale o orçamento aprovado que está em vigor agora. */
function agoraSP(){ return new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).replace('T', ' '); }
async function leSaldo(cid, gerente, tk){
  cid = soDigitos(cid);
  var rows = await gaql(cid, 'SELECT account_budget.status, account_budget.approved_start_date_time, account_budget.approved_end_date_time, ' +
    'account_budget.approved_end_time_type, account_budget.approved_spending_limit_micros, account_budget.approved_spending_limit_type, ' +
    "account_budget.adjusted_spending_limit_micros, account_budget.amount_served_micros FROM account_budget WHERE account_budget.status = 'APPROVED'",
    tk, soDigitos(gerente) || mcc() || cid);
  var agora = agoraSP();
  var bs = rows.map(function(r){ return r.accountBudget || {}; })
    .sort(function(a, b){ return String(b.approvedStartDateTime || '').localeCompare(String(a.approvedStartDateTime || '')); });
  var vigente = bs.filter(function(b){
    return String(b.approvedStartDateTime || '') <= agora &&
      (b.approvedEndTimeType === 'FOREVER' || !b.approvedEndDateTime || String(b.approvedEndDateTime) > agora);
  })[0];
  if(!vigente) return { saldo: null, saldoTexto: bs.length ? 'Nenhum orçamento da conta em vigor agora' : 'A conta não usa pagamento manual (sem orçamento da conta)', fonte: '' };
  if(vigente.approvedSpendingLimitType === 'INFINITE') return { saldo: null, saldoTexto: 'Orçamento da conta sem limite', fonte: '' };
  var limite = Number(vigente.adjustedSpendingLimitMicros != null ? vigente.adjustedSpendingLimitMicros : vigente.approvedSpendingLimitMicros);
  return { saldo: Math.round((limite - Number(vigente.amountServedMicros || 0)) / 1e4) / 100, saldoTexto: 'Fundos disponíveis (orçamento da conta)', fonte: 'google' };
}

/* ---------- investigação do saldo ----------
   A documentação não diz onde fica o "Fundos disponíveis" das contas
   pré-pagas. Consulta tudo o que a API oferece de faturamento numa conta
   e aponta os cálculos que podem dar o saldo. */
function hojeSP(){ return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }); }
var MESES_EN = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];

async function investiga(cid, gerente){
  cid = soDigitos(cid);
  if(!/^\d{10}$/.test(cid)) throw erro('ID da conta inválido', 400);
  var tk = await acesso();
  var login = soDigitos(gerente) || mcc() || cid;
  var hoje = hojeSP();
  var consultas = [
    ['Conta', 'SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.status, customer.manager FROM customer'],
    ['Configuração de faturamento', 'SELECT billing_setup.id, billing_setup.status, billing_setup.payments_account, billing_setup.payments_account_info.payments_account_id, ' +
      'billing_setup.payments_account_info.payments_account_name, billing_setup.payments_account_info.payments_profile_id, billing_setup.payments_account_info.payments_profile_name, ' +
      'billing_setup.payments_account_info.secondary_payments_profile_id, billing_setup.start_date_time, billing_setup.end_date_time FROM billing_setup'],
    ['Orçamentos da conta', 'SELECT account_budget.id, account_budget.name, account_budget.status, account_budget.billing_setup, account_budget.approved_start_date_time, ' +
      'account_budget.approved_end_date_time, account_budget.approved_end_time_type, account_budget.approved_spending_limit_micros, account_budget.approved_spending_limit_type, ' +
      'account_budget.adjusted_spending_limit_micros, account_budget.adjusted_spending_limit_type, account_budget.amount_served_micros, account_budget.total_adjustments_micros, ' +
      'account_budget.proposed_spending_limit_micros, account_budget.proposed_spending_limit_type, account_budget.purchase_order_number, account_budget.notes FROM account_budget'],
    ['Propostas de orçamento', 'SELECT account_budget_proposal.id, account_budget_proposal.status, account_budget_proposal.proposal_type, ' +
      'account_budget_proposal.approved_spending_limit_micros, account_budget_proposal.proposed_spending_limit_micros, account_budget_proposal.creation_date_time, ' +
      'account_budget_proposal.approval_date_time FROM account_budget_proposal ORDER BY account_budget_proposal.creation_date_time DESC LIMIT 10'],
    ['Gasto no mês atual', 'SELECT metrics.cost_micros FROM customer WHERE segments.date DURING THIS_MONTH'],
    ['Gasto total (desde 2010)', "SELECT metrics.cost_micros FROM customer WHERE segments.date BETWEEN '2010-01-01' AND '" + hoje + "'"]
  ];
  var out = [];
  for(var i = 0; i < consultas.length; i++){
    try{ out.push({ titulo: consultas[i][0], ok: true, linhas: await gaql(cid, consultas[i][1], tk, login) }); }
    catch(e){ out.push({ titulo: consultas[i][0], ok: false, erro: e.message }); }
  }

  /* faturas (só existem em faturamento mensal, mas vale tentar) */
  var bs = (out[1].linhas || [])[0];
  if(bs && bs.billingSetup && bs.billingSetup.resourceName){
    var d = new Date();
    try{
      var inv = await adsFetch('customers/' + cid + '/invoices?' + new URLSearchParams({ billingSetup: bs.billingSetup.resourceName, issueYear: String(d.getFullYear()), issueMonth: MESES_EN[d.getMonth()] }), null, tk, login);
      out.push({ titulo: 'Faturas do mês', ok: true, linhas: inv.invoices || [] });
    }catch(e){ out.push({ titulo: 'Faturas do mês', ok: false, erro: e.message }); }
  }
  try{
    var pa = await adsFetch('customers/' + cid + '/paymentsAccounts', null, tk, login);
    out.push({ titulo: 'Contas de pagamento', ok: true, linhas: pa.paymentsAccounts || [] });
  }catch(e){ out.push({ titulo: 'Contas de pagamento', ok: false, erro: e.message }); }

  /* cálculos candidatos: limite do orçamento − gasto */
  var candidatos = [];
  var gastoTotal = ((out[5].linhas || [])[0] || {}).metrics;
  (out[2].linhas || []).forEach(function(r){
    var b = r.accountBudget || {};
    var limite = b.adjustedSpendingLimitMicros != null ? b.adjustedSpendingLimitMicros : b.approvedSpendingLimitMicros;
    if(limite != null && b.amountServedMicros != null)
      candidatos.push({ como: 'Orçamento "' + (b.name || b.id) + '" (' + (b.status || '') + '): limite − valor veiculado', valor: (Number(limite) - Number(b.amountServedMicros)) / 1e6 });
    if(limite != null && gastoTotal && gastoTotal.costMicros != null)
      candidatos.push({ como: 'Orçamento "' + (b.name || b.id) + '": limite − gasto total', valor: (Number(limite) - Number(gastoTotal.costMicros)) / 1e6 });
  });
  return { cid: cid, login: login, versao: versao(), em: new Date().toISOString(), consultas: out, candidatos: candidatos };
}

module.exports = {
  configStatus: configStatus, iniciaLogin: iniciaLogin, concluiLogin: concluiLogin,
  conexaoPublica: conexaoPublica, desconecta: desconecta, listaContas: listaContas, investiga: investiga,
  acesso: acesso, leSaldo: leSaldo
};
