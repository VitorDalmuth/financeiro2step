/* ============================================================
   2STEP · ALERTA DE SALDO META (núcleo do servidor)
   Usado por api/meta-saldo.js. Lê o saldo pré-pago das contas de
   anúncio vinculadas e avisa no WhatsApp quando fica abaixo do
   mínimo de cada conta.
   ------------------------------------------------------------
   Variáveis de ambiente (Vercel > Settings > Environment Variables):
     META_TOKEN          token do usuário do sistema (Gerenciador de
                         Negócios) com acesso às contas de anúncio
     META_API_VERSAO     opcional, padrão v25.0
     CRON_SECRET         senha que o agendador manda para verificar
     ZAPI_INSTANCIA      canal Z-API: ID da instância
     ZAPI_TOKEN          canal Z-API: token da instância
     ZAPI_CLIENT_TOKEN   canal Z-API: token de segurança da conta (se ativado)
     FIREBASE_SERVICE_ACCOUNT  (a mesma do Asaas)
   Dados em 2step_financeiro/meta:
     contas/{act_id}    -> vínculo, mínimo e última leitura
     config             -> canal, destino, horário, repetição
     log/{id}           -> cada mensagem enviada (ou que falhou)
     ultimaVerificacao  -> resumo da última rodada
   ============================================================ */
var crypto = require('crypto');
var admin = require('firebase-admin');
var core = require('./_asaas-core');

var ref = core.ref;
function num(v, padrao){ var x = Number(v); return isFinite(x) && v !== '' && v != null ? x : (padrao || 0); }

/* ---------- quem chama ---------- */
function chaveEmail(e){ return String(e || '').trim().toLowerCase().replace(/\./g, ','); }
/* qualquer usuário cadastrado no app; soAdmin restringe a administradores */
async function exigeUsuario(req, soAdmin){
  if(soAdmin) return core.exigeAdmin(req);
  var h = String(req.headers.authorization || '');
  var tk = h.indexOf('Bearer ') === 0 ? h.slice(7) : '';
  if(!tk) throw Object.assign(new Error('Faça login no app'), { http: 401 });
  var usuarios = (await ref('usuarios').once('value')).val();
  var u;
  try{ u = await admin.auth().verifyIdToken(tk); }
  catch(e){ throw Object.assign(new Error('Sessão inválida, entre de novo'), { http: 401 }); }
  if(!usuarios) return u; /* mesma regra do app: sem usuários cadastrados, quem entra é admin */
  if(!usuarios[chaveEmail(u.email)]) throw Object.assign(new Error('Seu usuário não tem acesso'), { http: 403 });
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

function configStatus(){
  var fb = false;
  try{ fb = !!JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}').private_key; }catch(e){}
  return {
    firebase: fb,
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

async function metaFetch(url){
  var r = await fetch(url);
  var j = await r.json().catch(function(){ return {}; });
  if(!r.ok || j.error){
    var m = (j.error && (j.error.error_user_msg || j.error.message)) || ('respondeu ' + r.status);
    throw new Error('Meta: ' + m);
  }
  return j;
}
function metaUrl(caminho, params){
  var qs = new URLSearchParams(Object.assign({}, params || {}, { access_token: process.env.META_TOKEN || '' })).toString();
  return 'https://graph.facebook.com/' + versao() + '/' + caminho + '?' + qs;
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
/* todas as contas que o token enxerga, para escolher na hora de vincular */
async function listaContas(){
  if(!process.env.META_TOKEN) throw Object.assign(new Error('META_TOKEN não configurado na Vercel'), { http: 500 });
  var out = [], url = metaUrl('me/adaccounts', { fields: CAMPOS, limit: 100 }), guard = 0;
  while(url && guard++ < 20){
    var pg = await metaFetch(url);
    out = out.concat((pg.data || []).map(resumoConta));
    url = pg.paging && pg.paging.next;
  }
  return out;
}
async function leConta(id){ return resumoConta(await metaFetch(metaUrl(id, { fields: CAMPOS }))); }

/* ---------- WhatsApp ---------- */
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
  var j = await zapiGet('/status');
  return { conectado: !!j.connected, celular: !!j.smartphoneConnected, erro: j.error || '' };
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
function linkRecarga(id){ return 'https://business.facebook.com/billing_hub/payment_settings/?asset_id=' + String(id).replace(/^act_/, ''); }
function nomeCliente(c, clientes){ return ((clientes || {})[c.clienteId] || {}).nome || c.nome || c.id; }
function msgBaixo(lista, clientes){
  return '⚠️ *Saldo baixo na Meta*' + (lista.length > 1 ? ' (' + lista.length + ' contas)' : '') + '\n\n' +
    lista.map(function(c){
      return '*' + nomeCliente(c, clientes) + '*\n' +
        'Conta: ' + (c.nome || c.id) + '\n' +
        'Saldo: ' + dinheiro(c.saldo, c.moeda) + ' · mínimo ' + dinheiro(c.minimo, c.moeda) + '\n' +
        'Recarregar: ' + linkRecarga(c.id);
    }).join('\n\n');
}
function msgRecarga(lista, clientes){
  return '✅ *Recarga identificada*\n\n' + lista.map(function(c){
    return '*' + nomeCliente(c, clientes) + '*: saldo agora ' + dinheiro(c.saldo, c.moeda);
  }).join('\n');
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
   - voltou para o mínimo ou mais: limpa o aviso e (se ligado) manda "recarga identificada". */
async function verifica(origem){
  var raiz = (await ref('meta').once('value')).val() || {};
  var cfg = raiz.config || {}, contas = raiz.contas || {};
  var clientes = (await ref('clientes').once('value')).val() || {};
  var ativas = Object.keys(contas).map(function(k){ return contas[k]; }).filter(function(c){ return c && c.id && c.ativo !== false; });
  var agora = new Date().toISOString();
  var resumo = { em: agora, origem: origem || '', total: ativas.length, baixo: 0, erros: 0, avisadas: 0, adiadas: 0, recargas: 0, erroEnvio: '' };

  var leituras = await Promise.all(ativas.map(function(c){
    return leConta(c.id).then(function(d){ return { c: c, d: d }; }, function(e){ return { c: c, erro: String(e.message || e) }; });
  }));

  var upd = {}, novos = [], recarregadas = [];
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
        if(!c.alertadoEm || (rep > 0 && Date.now() - Date.parse(c.alertadoEm) >= rep * 3600e3)) novos.push(Object.assign({}, c, m));
      }else{
        m.situacao = 'ok';
        if(c.alertadoEm){ m.alertadoEm = null; recarregadas.push(Object.assign({}, c, m)); }
      }
    }
    Object.keys(m).forEach(function(k){ upd['contas/' + c.id + '/' + k] = m[k] === undefined ? null : m[k]; });
  });

  var canalLigado = cfg.canal === 'zapi';
  var podeMandar = canalLigado && noHorario(cfg);
  if(novos.length && canalLigado && !podeMandar) resumo.adiadas = novos.length;

  async function manda(tipo, lista, texto){
    var reg = { em: agora, tipo: tipo, canal: cfg.canal, contas: lista.map(function(c){ return { id: c.id, cliente: nomeCliente(c, clientes), saldo: c.saldo, minimo: num(c.minimo) }; }) };
    try{ await enviaWhats(texto, cfg); reg.ok = true; }
    catch(e){ reg.ok = false; reg.erro = String(e.message || e); resumo.erroEnvio = reg.erro; }
    await ref('meta/log').push(reg);
    return reg.ok;
  }
  if(podeMandar && novos.length && await manda('baixo', novos, msgBaixo(novos, clientes))){
    novos.forEach(function(c){ upd['contas/' + c.id + '/alertadoEm'] = agora; });
    resumo.avisadas = novos.length;
  }
  if(podeMandar && recarregadas.length && cfg.avisarRecarga !== false){
    if(await manda('recarga', recarregadas, msgRecarga(recarregadas, clientes))) resumo.recargas = recarregadas.length;
  }

  upd.ultimaVerificacao = resumo;
  await ref('meta').update(upd);
  return resumo;
}

async function enviaTeste(){
  var cfg = (await ref('meta/config').once('value')).val() || {};
  var texto = '✅ *Teste do alerta de saldo 2STEP*\n\nSe esta mensagem chegou, os avisos de saldo baixo vão chegar aqui.';
  await enviaWhats(texto, cfg);
  await ref('meta/log').push({ em: new Date().toISOString(), tipo: 'teste', canal: cfg.canal || '', contas: [], ok: true });
}

module.exports = {
  exigeUsuario: exigeUsuario, cronConfere: cronConfere, configStatus: configStatus,
  listaContas: listaContas, leConta: leConta, zapiStatus: zapiStatus, zapiGrupos: zapiGrupos,
  verifica: verifica, enviaTeste: enviaTeste,
  _numeroTexto: numeroTexto, _saldoDe: saldoDe, _msgBaixo: msgBaixo
};
