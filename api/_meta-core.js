/* ============================================================
   2STEP · ALERTA DE SALDO META (núcleo do servidor)
   Usado por api/meta-saldo.js e api/meta-retorno.js. Lê o saldo
   pré-pago das contas de anúncio vinculadas e avisa no WhatsApp
   quando fica abaixo do mínimo de cada conta.
   ------------------------------------------------------------
   Conexão com a Meta: pelo botão "Conectar Facebook" do painel.
   O token fica em 2step_financeiro/metaPriv, que o app não lê;
   vale cerca de 60 dias e o sistema avisa antes de vencer.
   (Alternativa que não expira: META_TOKEN de usuário do sistema.)
   ------------------------------------------------------------
   Variáveis de ambiente (Vercel > Settings > Environment Variables):
     META_APP_ID            ID do app criado em developers.facebook.com
     META_APP_SECRET        chave secreta do app
     META_LOGIN_CONFIG_ID   ID da configuração do "Login do Facebook
                            para Empresas" (se o app usar esse login)
     META_TOKEN             opcional, token de usuário do sistema
     META_API_VERSAO        opcional, padrão v25.0
     CRON_SECRET            senha que o agendador manda para verificar
     ZAPI_INSTANCIA         ID da instância na Z-API
     ZAPI_TOKEN             token da instância
     ZAPI_CLIENT_TOKEN      token de segurança da conta (se ativado)
     FIREBASE_SERVICE_ACCOUNT  (a mesma do Asaas)
   Dados em 2step_financeiro/meta:
     contas/{act_id}    -> vínculo, mínimo e última leitura
     config             -> canal, destino, horário, repetição
     conexao            -> quem conectou e quando vence (sem o token)
     log/{id}           -> cada mensagem enviada (ou que falhou)
     ultimaVerificacao  -> resumo da última rodada
   ============================================================ */
var crypto = require('crypto');
var admin = require('firebase-admin');
var core = require('./_asaas-core');
var google = require('./_google-core');

var ref = core.ref;
var DIAS_AVISO = 7;   /* avisa no WhatsApp quando faltar isso para a conexão vencer */
var FOLGA_REPETIR = 10 * 60e3;   /* o agendador não roda no segundo exato: sem folga, "a cada 3h" viraria 4h */
function num(v, padrao){ var x = Number(v); return isFinite(x) && v !== '' && v != null ? x : (padrao || 0); }
function erro(msg, http){ return Object.assign(new Error(msg), { http: http }); }

/* ---------- quem chama ---------- */
function chaveEmail(e){ return String(e || '').trim().toLowerCase().replace(/\./g, ','); }
/* qualquer usuário cadastrado no app; soAdmin restringe a administradores */
async function exigeUsuario(req, soAdmin){
  if(soAdmin) return core.exigeAdmin(req);
  var h = String(req.headers.authorization || '');
  var tk = h.indexOf('Bearer ') === 0 ? h.slice(7) : '';
  if(!tk) throw erro('Faça login no app', 401);
  var usuarios = (await ref('usuarios').once('value')).val();
  var u;
  try{ u = await admin.auth().verifyIdToken(tk); }
  catch(e){ throw erro('Sessão inválida, entre de novo', 401); }
  if(!usuarios) return u; /* mesma regra do app: sem usuários cadastrados, quem entra é admin */
  if(!usuarios[chaveEmail(u.email)]) throw erro('Seu usuário não tem acesso', 403);
  return u;
}
/* o agendador manda a senha no header (Vercel Cron) ou na URL (cron-job.org) */
function cronConfere(req){
  var esperado = String(process.env.CRON_SECRET || '');
  var h = String(req.headers.authorization || '');
  var recebido = h.indexOf('Bearer ') === 0 ? h.slice(7) : String((req.query && req.query.chave) || '');
  var a = Buffer.from(recebido), b = Buffer.from(esperado);
  return esperado.length >= 16 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

function appOk(){ return !!(process.env.META_APP_ID && process.env.META_APP_SECRET); }
function configStatus(){
  var fb = false;
  try{ fb = !!JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}').private_key; }catch(e){}
  return {
    firebase: fb,
    metaApp: appOk(),
    metaLoginConfig: !!process.env.META_LOGIN_CONFIG_ID,
    metaToken: !!process.env.META_TOKEN,
    cron: String(process.env.CRON_SECRET || '').length >= 16,
    zapi: !!(process.env.ZAPI_INSTANCIA && process.env.ZAPI_TOKEN),
    zapiClientToken: !!process.env.ZAPI_CLIENT_TOKEN,
    versao: versao()
  };
}

/* ---------- API da Meta ---------- */
function versao(){ return process.env.META_API_VERSAO || 'v25.0'; }
var CAMPOS = 'id,name,account_status,currency,business_name,funding_source_details,spend_cap,amount_spent';
var ESCOPOS = 'ads_read,ads_management,business_management';

async function metaFetch(url){
  var r = await fetch(url);
  var j = await r.json().catch(function(){ return {}; });
  if(!r.ok || j.error){
    var e = j.error || {};
    var m = e.error_user_msg || e.message || ('respondeu ' + r.status);
    /* 190 = token vencido, revogado ou senha do Facebook trocada */
    throw Object.assign(new Error('Meta: ' + m), { expirado: e.code === 190 });
  }
  return j;
}
function metaUrl(caminho, params, token){
  var qs = new URLSearchParams(Object.assign({}, params || {}, { access_token: token || '' })).toString();
  return 'https://graph.facebook.com/' + versao() + '/' + caminho + '?' + qs;
}
/* token do login do Facebook (guardado no banco) ou, se não houver, o do usuário do sistema */
async function tokenAtual(){
  var c = (await ref('metaPriv/conexao').once('value')).val();
  if(c && c.token) return { token: c.token, conexao: c };
  if(process.env.META_TOKEN) return { token: process.env.META_TOKEN, conexao: null };
  throw erro('Conecte o Facebook em Operacional › Saldo Ads para ler os saldos da Meta', 400);
}

/* número escrito em pt-BR ou en-US: 1.234,56 | 1,234.56 | 123,45 | 1234 */
function numeroTexto(s){
  s = String(s || '').replace(/\s/g, '');
  if(!/\d/.test(s)) return null;
  var neg = s.charAt(0) === '-';
  s = s.replace(/[^\d.,]/g, '');
  var p = s.lastIndexOf('.'), v = s.lastIndexOf(','), dec = -1;
  if(p > -1 && v > -1) dec = Math.max(p, v);
  else{
    var k = Math.max(p, v);
    /* um separador só, com até 2 dígitos depois e uma vez só: é decimal (12,5 / 99.90) */
    if(k > -1 && s.length - k - 1 <= 2 && s.split(s.charAt(k)).length === 2) dec = k;
  }
  var inteiro = (dec > -1 ? s.slice(0, dec) : s).replace(/[.,]/g, '');
  var frac = dec > -1 ? s.slice(dec + 1) : '';
  var x = parseFloat(inteiro + (frac ? '.' + frac : ''));
  if(isNaN(x)) return null;
  return neg ? -x : x;
}
/* Conta pré-paga: a Meta devolve o saldo num texto, ex. "Saldo disponível (R$1.234,56 BRL)".
   Sem esse texto, usa o limite de gastos da conta, se houver. */
function saldoDe(c){
  var f = c.funding_source_details || {};
  var txt = String(f.display_string || '');
  if(/saldo|balance|fundos|funds|dispon[ií]vel|available/i.test(txt)){
    var m = txt.match(/(?:R\$|US\$|\$|€)\s*(-?[\d.,\s]*\d)/) || txt.match(/-?\d[\d.,\s]*\d|\d/);
    var v = m ? numeroTexto(m[1] || m[0]) : null;
    if(v != null) return { saldo: v, texto: txt, fonte: 'prepago' };
  }
  var cap = num(c.spend_cap);
  if(cap > 0) return { saldo: Math.round(cap - num(c.amount_spent)) / 100, texto: 'Restante do limite de gastos da conta', fonte: 'limite' };
  return { saldo: null, texto: txt || 'A conta não informou saldo pré-pago', fonte: '' };
}
function resumoConta(c){
  var s = saldoDe(c);
  return {
    id: c.id, nome: c.name || '', empresa: c.business_name || '', moeda: c.currency || 'BRL',
    contaStatus: num(c.account_status), saldo: s.saldo, saldoTexto: s.texto, fonte: s.fonte
  };
}
/* todas as contas que a conexão enxerga, para escolher na hora de vincular:
   as do perfil e as das BMs (inclusive de clientes) em que o perfil tem acesso */
async function listaContas(){
  var tk = (await tokenAtual()).token;
  var porId = {};
  async function pagina(url){
    var guard = 0;
    while(url && guard++ < 20){
      var pg = await metaFetch(url);
      (pg.data || []).forEach(function(c){ porId[c.id] = resumoConta(c); });
      url = pg.paging && pg.paging.next;
    }
  }
  await pagina(metaUrl('me/adaccounts', { fields: CAMPOS, limit: 100 }, tk));
  var bms = [];
  try{ bms = (await metaFetch(metaUrl('me/businesses', { fields: 'id,name', limit: 100 }, tk))).data || []; }
  catch(e){ /* sem acesso às BMs: fica só com as contas do perfil */ }
  for(var i = 0; i < bms.length && i < 50; i++){
    var arestas = ['owned_ad_accounts', 'client_ad_accounts'];
    for(var k = 0; k < arestas.length; k++){
      try{ await pagina(metaUrl(bms[i].id + '/' + arestas[k], { fields: CAMPOS, limit: 100 }, tk)); }
      catch(e){ /* BM sem permissão para listar: segue */ }
    }
  }
  return Object.keys(porId).map(function(k){ return porId[k]; });
}
async function leConta(id, tk){ return resumoConta(await metaFetch(metaUrl(id, { fields: CAMPOS }, tk))); }

/* ---------- login do Facebook ---------- */
/* o endereço de volta precisa ser exatamente o cadastrado no app da Meta */
function urlRetorno(req){ return 'https://' + String(req.headers['x-forwarded-host'] || req.headers.host || '') + '/api/meta-retorno'; }
async function iniciaLogin(req, email){
  if(!appOk()) throw erro('META_APP_ID e META_APP_SECRET não configurados na Vercel', 500);
  var state = crypto.randomBytes(24).toString('hex');
  await ref('metaPriv/oauth/' + state).set({ email: email || '', em: new Date().toISOString() });
  var p = { client_id: process.env.META_APP_ID, redirect_uri: urlRetorno(req), state: state, response_type: 'code' };
  if(process.env.META_LOGIN_CONFIG_ID) p.config_id = process.env.META_LOGIN_CONFIG_ID;
  else p.scope = ESCOPOS;
  return 'https://www.facebook.com/' + versao() + '/dialog/oauth?' + new URLSearchParams(p).toString();
}
async function concluiLogin(req){
  var q = req.query || {};
  if(q.error) throw new Error(q.error_reason === 'user_denied' ? 'Você cancelou a autorização no Facebook' : (q.error_description || 'O Facebook não autorizou'));
  var state = String(q.state || '');
  if(!/^[a-f0-9]{48}$/.test(state)) throw new Error('Link de retorno inválido. Clique em Conectar Facebook de novo.');
  var stRef = ref('metaPriv/oauth/' + state), st = (await stRef.once('value')).val();
  await stRef.remove();
  if(!st || Date.now() - Date.parse(st.em) > 15 * 60e3) throw new Error('A conexão demorou demais. Clique em Conectar Facebook de novo.');
  if(!appOk()) throw new Error('META_APP_ID e META_APP_SECRET não configurados na Vercel');

  var id = process.env.META_APP_ID, sec = process.env.META_APP_SECRET;
  var base = 'https://graph.facebook.com/' + versao() + '/oauth/access_token?';
  var tk = (await metaFetch(base + new URLSearchParams({ client_id: id, client_secret: sec, redirect_uri: urlRetorno(req), code: String(q.code || '') }))).access_token;
  /* troca pelo token de longa duração (~60 dias); se já veio longo, segue com ele */
  try{
    var longo = await metaFetch(base + new URLSearchParams({ grant_type: 'fb_exchange_token', client_id: id, client_secret: sec, fb_exchange_token: tk }));
    if(longo.access_token) tk = longo.access_token;
  }catch(e){}

  var dbg = (await metaFetch(metaUrl('debug_token', { input_token: tk }, id + '|' + sec))).data || {};
  var escopos = dbg.scopes || [];
  if(escopos.length && escopos.indexOf('ads_read') < 0 && escopos.indexOf('ads_management') < 0)
    throw new Error('Faltou autorizar o acesso às contas de anúncio. Conecte de novo e aceite todas as permissões.');
  var eu = await metaFetch(metaUrl('me', { fields: 'id,name' }, tk));
  /* vence no que vier primeiro: o token ou o acesso aos dados */
  var fins = [dbg.expires_at, dbg.data_access_expires_at].map(Number).filter(function(x){ return x > 0; });
  var pub = {
    nome: eu.name || '', fbId: eu.id || '',
    expiraEm: fins.length ? new Date(Math.min.apply(null, fins) * 1000).toISOString() : '',
    conectadoEm: new Date().toISOString(), conectadoPor: st.email || '', situacao: 'ok'
  };
  await ref('metaPriv/conexao').set(Object.assign({ token: tk }, pub));
  await ref('meta/conexao').set(pub);
  return pub;
}
async function desconecta(){
  await ref('metaPriv/conexao').remove();
  await ref('meta/conexao').remove();
}

/* ---------- WhatsApp (Z-API) ---------- */
function zapiBase(){
  return 'https://api.z-api.io/instances/' + encodeURIComponent(process.env.ZAPI_INSTANCIA || '') +
    '/token/' + encodeURIComponent(process.env.ZAPI_TOKEN || '');
}
function zapiHeaders(){
  var h = { 'Content-Type': 'application/json' };
  if(process.env.ZAPI_CLIENT_TOKEN) h['Client-Token'] = process.env.ZAPI_CLIENT_TOKEN;
  return h;
}
async function zapiGet(caminho){
  var r = await fetch(zapiBase() + caminho, { headers: zapiHeaders() });
  var j = await r.json().catch(function(){ return null; });
  if(!r.ok || !j || j.error) throw new Error('Z-API: ' + ((j && (j.error || j.message)) || ('respondeu ' + r.status)));
  return j;
}
async function zapiStatus(){
  var r = await fetch(zapiBase() + '/status', { headers: zapiHeaders() });
  var j = await r.json().catch(function(){ return null; });
  if(!j) throw new Error('Z-API: respondeu ' + r.status);
  /* no /status o campo "error" é só informativo: conectado, vem "You are already connected." */
  return { conectado: !!j.connected, celular: !!j.smartphoneConnected, erro: j.connected ? '' : (j.error || j.message || '') };
}
/* grupos em que o número da instância está, para escolher o destino */
async function zapiGrupos(){
  var out = [], pagina = 1;
  while(pagina <= 10){
    var lista = await zapiGet('/chats?page=' + pagina + '&pageSize=100');
    if(!Array.isArray(lista) || !lista.length) break;
    lista.forEach(function(c){
      var id = String(c.phone || '');
      if(c.isGroup || /-group$/.test(id)) out.push({ id: id, nome: c.name || id });
    });
    if(lista.length < 100) break;
    pagina++;
  }
  return out.sort(function(a, b){ return a.nome.localeCompare(b.nome, 'pt-BR'); });
}
async function enviaWhats(texto, cfg){
  cfg = cfg || {};
  if(cfg.canal === 'zapi'){
    if(!process.env.ZAPI_INSTANCIA || !process.env.ZAPI_TOKEN) throw new Error('ZAPI_INSTANCIA e ZAPI_TOKEN não configurados na Vercel');
    if(!cfg.destino) throw new Error('Escolha o grupo ou número que recebe os alertas');
    var r = await fetch(zapiBase() + '/send-text', { method: 'POST', headers: zapiHeaders(), body: JSON.stringify({ phone: cfg.destino, message: texto }) });
    var j = await r.json().catch(function(){ return {}; });
    if(!r.ok || j.error) throw new Error('Z-API: ' + (j.error || j.message || ('respondeu ' + r.status)));
    return;
  }
  throw new Error('O alerta no WhatsApp está desligado');
}

/* ---------- mensagens ---------- */
function dinheiro(v, moeda){
  try{ return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: moeda || 'BRL' }); }
  catch(e){ return 'R$ ' + Number(v).toFixed(2).replace('.', ','); }
}
function dataBR(iso){ return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }); }
function ehGoogle(c){ return c.plataforma === 'google'; }
function idGoogle(c){ return String(c.googleId || '').replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3'); }
function linkRecarga(c){
  return ehGoogle(c) ? 'https://ads.google.com/aw/billing/summary'
    : 'https://business.facebook.com/billing_hub/payment_settings/?asset_id=' + String(c.id).replace(/^act_/, '');
}
function nomeCliente(c, clientes){ return ((clientes || {})[c.clienteId] || {}).nome || c.nome || c.id; }
function msgBaixo(lista, clientes){
  return '⚠️ *Saldo baixo*' + (lista.length > 1 ? ' (' + lista.length + ' contas)' : '') + '\n\n' +
    lista.map(function(c){
      return '*' + nomeCliente(c, clientes) + '* · ' + (ehGoogle(c) ? 'Google Ads' : 'Meta Ads') + '\n' +
        'Conta: ' + (c.nome || c.id) + (ehGoogle(c) ? ' (' + idGoogle(c) + ')' : '') + '\n' +
        'Saldo: ' + dinheiro(c.saldo, c.moeda) + ' · mínimo ' + dinheiro(c.minimo, c.moeda) + '\n' +
        'Recarregar: ' + linkRecarga(c);
    }).join('\n\n');
}
function msgRecarga(lista, clientes){
  return '✅ *Recarga identificada*\n\n' + lista.map(function(c){
    return '*' + nomeCliente(c, clientes) + '* (' + (ehGoogle(c) ? 'Google' : 'Meta') + '): saldo agora ' + dinheiro(c.saldo, c.moeda);
  }).join('\n');
}
function msgVencendo(con, dias){
  return '🔑 *Conexão com o Facebook vence em ' + dias + ' dia' + (dias > 1 ? 's' : '') + '* (' + dataBR(con.expiraEm) + ')\n\n' +
    'Para os alertas de saldo não pararem: painel 2STEP › Operacional › Saldo Ads › *Reconectar Facebook*.';
}
function msgExpirada(){
  return '⛔ *A conexão com o Facebook expirou*\n\n' +
    'Os saldos da Meta não estão sendo lidos e os alertas da Meta pararam. Abra o painel 2STEP › Operacional › Saldo Ads › *Reconectar Facebook*.';
}
function msgGoogleCaiu(){
  return '⛔ *A conexão com o Google caiu*\n\n' +
    'Os saldos do Google Ads não estão sendo lidos. Abra o painel 2STEP › Operacional › Saldo Ads › *Reconectar Google*.';
}

/* ---------- a verificação ---------- */
function horaSP(){ return Number(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false })) % 24; }
/* manda só dentro do horário escolhido (fora dele, o alerta espera o horário abrir) */
function noHorario(cfg){
  var ini = num(cfg.horaIni, 7), fim = num(cfg.horaFim, 22), h = horaSP();
  if(ini === fim) return true;
  return ini < fim ? (h >= ini && h < fim) : (h >= ini || h < fim);
}

/* Regra do alerta:
   - saldo abaixo do mínimo e ainda não avisado: avisa e marca alertadoEm;
   - continua abaixo: só avisa de novo se "repetir a cada X horas" estiver ligado;
   - voltou para o mínimo ou mais: limpa o aviso e (se ligado) manda "recarga identificada".
   Conexão do Facebook: avisa uma vez quando faltar DIAS_AVISO dias e uma vez se expirar.
   Conexão do Google: avisa uma vez se cair. Uma plataforma fora do ar não impede a outra. */
async function verifica(origem){
  var raiz = (await ref('meta').once('value')).val() || {};
  var cfg = raiz.config || {}, contas = raiz.contas || {}, pub = raiz.conexao || null;
  var clientes = (await ref('clientes').once('value')).val() || {};
  var ativas = Object.keys(contas).map(function(k){ return contas[k]; }).filter(function(c){ return c && c.id && c.ativo !== false; });
  var ativasMeta = ativas.filter(function(c){ return !ehGoogle(c); }), ativasGoogle = ativas.filter(ehGoogle);
  var agora = new Date().toISOString();
  var resumo = { em: agora, origem: origem || '', total: ativas.length, baixo: 0, erros: 0, avisadas: 0, adiadas: 0, recargas: 0, erroEnvio: '', erroMeta: '', erroGoogle: '' };
  var upd = {};

  var canalLigado = cfg.canal === 'zapi';
  var podeMandar = canalLigado && noHorario(cfg);
  async function manda(tipo, lista, texto){
    var reg = { em: agora, tipo: tipo, canal: cfg.canal, contas: lista.map(function(c){ return { id: c.id, cliente: nomeCliente(c, clientes), saldo: c.saldo, minimo: num(c.minimo) }; }) };
    try{ await enviaWhats(texto, cfg); reg.ok = true; }
    catch(e){ reg.ok = false; reg.erro = String(e.message || e); resumo.erroEnvio = reg.erro; }
    await ref('meta/log').push(reg);
    return reg.ok;
  }
  async function conexaoExpirou(motivo){
    resumo.erroMeta = motivo;
    if(pub){
      upd['conexao/situacao'] = 'expirada';
      if(!pub.avisoExpiradaEm && podeMandar && await manda('conexao', [], msgExpirada())) upd['conexao/avisoExpiradaEm'] = agora;
    }
  }
  async function fim(){
    upd.ultimaVerificacao = resumo;
    await ref('meta').update(upd);
    return resumo;
  }

  function lendo(c, p){
    return p.then(function(d){ return { c: c, d: d }; }, function(e){ return { c: c, erro: String(e.message || e), expirado: !!e.expirado }; });
  }

  /* Meta: sem conexão ou com ela vencida, as contas da Meta ficam como estão */
  var leiturasMeta = [];
  if(ativasMeta.length){
    var con = null;
    try{ con = await tokenAtual(); }catch(e){ resumo.erroMeta = e.message; }
    if(con && !con.conexao) pub = null;   /* usuário do sistema: não vence */
    if(con && pub && pub.expiraEm){
      var dias = (Date.parse(pub.expiraEm) - Date.now()) / 864e5;
      if(dias <= 0){ await conexaoExpirou('A conexão com o Facebook expirou. Reconecte em Saldo Ads.'); con = null; }
      else if(dias <= DIAS_AVISO && !pub.avisoVencendoEm && podeMandar && await manda('conexao', [], msgVencendo(pub, Math.ceil(dias))))
        upd['conexao/avisoVencendoEm'] = agora;
    }
    if(con){
      leiturasMeta = await Promise.all(ativasMeta.map(function(c){ return lendo(c, leConta(c.id, con.token)); }));
      /* todas falharam por token inválido: a conexão caiu (senha trocada, acesso removido...) */
      if(leiturasMeta.every(function(l){ return l.expirado; })){
        await conexaoExpirou('A Meta recusou a conexão (token inválido). Reconecte o Facebook em Saldo Ads.');
        leiturasMeta = [];
      }
    }
  }

  /* Google: uma autorização de acesso por rodada, lida conta a conta */
  var leiturasGoogle = [];
  if(ativasGoogle.length){
    var gtk = null;
    try{ gtk = await google.acesso(); }
    catch(e){
      resumo.erroGoogle = e.message;
      var gpriv = (await ref('googlePriv/conexao').once('value')).val();
      if(e.expirado && gpriv && !gpriv.avisoCaiuEm && podeMandar && await manda('conexao', [], msgGoogleCaiu()))
        await ref('googlePriv/conexao/avisoCaiuEm').set(agora);
    }
    if(gtk) leiturasGoogle = await Promise.all(ativasGoogle.map(function(c){
      return lendo(c, google.leSaldo(c.googleId, c.gerente, gtk).then(function(d){
        return Object.assign({ nome: c.nome || '', empresa: '', moeda: c.moeda || 'BRL', contaStatus: 1 }, d);
      }));
    }));
  }

  var leituras = leiturasMeta.concat(leiturasGoogle);
  var novos = [], recarregadas = [];
  leituras.forEach(function(l){
    var c = l.c, m = { lidoEm: agora };
    if(l.erro){ m.situacao = 'erro'; m.erro = l.erro; resumo.erros++; }
    else{
      var d = l.d;
      m.nome = d.nome; m.empresa = d.empresa; m.moeda = d.moeda; m.contaStatus = d.contaStatus;
      m.saldo = d.saldo; m.saldoTexto = d.saldoTexto; m.fonte = d.fonte; m.erro = '';
      var minimo = num(c.minimo);
      if(d.saldo == null) m.situacao = 'sem-saldo';
      else if(minimo > 0 && d.saldo < minimo){
        m.situacao = 'baixo'; resumo.baixo++;
        var rep = num(cfg.repetirHoras);
        if(!c.alertadoEm || (rep > 0 && Date.now() - Date.parse(c.alertadoEm) >= rep * 3600e3 - FOLGA_REPETIR)) novos.push(Object.assign({}, c, m));
      }else{
        m.situacao = 'ok';
        if(c.alertadoEm){ m.alertadoEm = null; recarregadas.push(Object.assign({}, c, m)); }
      }
    }
    Object.keys(m).forEach(function(k){ upd['contas/' + c.id + '/' + k] = m[k] === undefined ? null : m[k]; });
  });

  if(novos.length && canalLigado && !podeMandar) resumo.adiadas = novos.length;
  if(podeMandar && novos.length && await manda('baixo', novos, msgBaixo(novos, clientes))){
    novos.forEach(function(c){ upd['contas/' + c.id + '/alertadoEm'] = agora; });
    resumo.avisadas = novos.length;
  }
  if(podeMandar && recarregadas.length && cfg.avisarRecarga !== false){
    if(await manda('recarga', recarregadas, msgRecarga(recarregadas, clientes))) resumo.recargas = recarregadas.length;
  }
  return fim();
}

async function enviaTeste(){
  var cfg = (await ref('meta/config').once('value')).val() || {};
  var texto = '✅ *Teste do alerta de saldo 2STEP*\n\nSe esta mensagem chegou, os avisos de saldo baixo vão chegar aqui.';
  await enviaWhats(texto, cfg);
  await ref('meta/log').push({ em: new Date().toISOString(), tipo: 'teste', canal: cfg.canal || '', contas: [], ok: true });
}

module.exports = {
  exigeUsuario: exigeUsuario, cronConfere: cronConfere, configStatus: configStatus,
  listaContas: listaContas, zapiStatus: zapiStatus, zapiGrupos: zapiGrupos,
  iniciaLogin: iniciaLogin, concluiLogin: concluiLogin, desconecta: desconecta,
  verifica: verifica, enviaTeste: enviaTeste,
  _numeroTexto: numeroTexto, _saldoDe: saldoDe
};
