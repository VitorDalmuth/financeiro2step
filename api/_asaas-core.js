/* ============================================================
   2STEP · INTEGRAÇÃO ASAAS (núcleo do servidor)
   Usado pelas funções da Vercel em /api. Arquivos que começam
   com "_" não viram endpoint, só são importados.
   ------------------------------------------------------------
   Variáveis de ambiente (Vercel > Settings > Environment Variables):
     ASAAS_API_KEY             chave de API do Asaas
     ASAAS_WEBHOOK_TOKEN       token que você define no webhook do Asaas
     ASAAS_AMBIENTE            "producao" (padrão) ou "sandbox"
     FIREBASE_SERVICE_ACCOUNT  JSON da conta de serviço do Firebase
   ============================================================ */
var admin = require('firebase-admin');

var ROOT = '2step_financeiro';
var DATABASE_URL = 'https://step-financeiro-default-rtdb.firebaseio.com';

/* status do Asaas que significam "o cliente pagou" */
var PAGOS = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'];

function db(){
  if(!admin.apps.length){
    var cred = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
    admin.initializeApp({ credential: admin.credential.cert(cred), databaseURL: DATABASE_URL });
  }
  return admin.database();
}
function ref(caminho){ return db().ref(ROOT + '/' + caminho); }

function hojeSP(){ return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }); }
function addDias(dstr, k){
  var d = new Date(dstr + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + k);
  return d.toISOString().slice(0, 10);
}

/* ---------- API do Asaas ---------- */
function baseAsaas(){
  return process.env.ASAAS_AMBIENTE === 'sandbox' ? 'https://api-sandbox.asaas.com/v3' : 'https://api.asaas.com/v3';
}
async function asaasGet(caminho, params){
  var qs = new URLSearchParams(params || {}).toString();
  var r = await fetch(baseAsaas() + caminho + (qs ? '?' + qs : ''), {
    headers: { 'access_token': process.env.ASAAS_API_KEY || '', 'User-Agent': '2step-financeiro', 'Content-Type': 'application/json' }
  });
  if(!r.ok){
    var txt = await r.text();
    throw new Error('Asaas respondeu ' + r.status + ': ' + txt.slice(0, 300));
  }
  return r.json();
}
/* percorre todas as páginas de uma listagem */
async function asaasTodos(caminho, params){
  var out = [], offset = 0, guard = 0;
  while(guard++ < 50){
    var p = Object.assign({}, params, { limit: 100, offset: offset });
    var pg = await asaasGet(caminho, p);
    out = out.concat(pg.data || []);
    if(!pg.hasMore) break;
    offset += 100;
  }
  return out;
}

/* ---------- baixa de um pagamento ----------
   Regra: o pagamento do Asaas dá baixa na mensalidade do mês do
   VENCIMENTO da cobrança, para o cliente 2STEP vinculado ao
   cliente do Asaas. Nunca apaga nem desmarca nada.               */
async function processaPagamento(p, evento){
  if(!p || !p.id || PAGOS.indexOf(p.status) < 0) return { resultado: 'ignorado' };

  var evRef = ref('asaas/eventos/' + p.id);
  var anterior = (await evRef.once('value')).val();
  if(anterior && anterior.resultado === 'baixado') return anterior;

  var vencimento = String(p.originalDueDate || p.dueDate || '').slice(0, 10);
  var reg = {
    paymentId: p.id,
    customer: p.customer || '',
    valor: Number(p.value) || 0,
    vencimento: vencimento,
    pagoEm: String(p.clientPaymentDate || p.paymentDate || p.confirmedDate || hojeSP()).slice(0, 10),
    status: p.status,
    forma: p.billingType || '',
    descricao: p.description || '',
    evento: evento || '',
    atualizadoEm: new Date().toISOString()
  };

  var vinc = (await ref('asaas/vinculos/' + reg.customer).once('value')).val();
  if(!vinc || !vinc.clienteId){
    reg.resultado = 'sem-vinculo';
    await evRef.set(reg);
    return reg;
  }
  reg.clienteId = vinc.clienteId;

  var cliente = (await ref('clientes/' + vinc.clienteId).once('value')).val();
  if(!cliente){
    reg.resultado = 'cliente-inexistente';
    await evRef.set(reg);
    return reg;
  }
  if(!vencimento){
    reg.resultado = 'sem-vencimento';
    await evRef.set(reg);
    return reg;
  }

  reg.ym = vencimento.slice(0, 7);
  var chave = vinc.clienteId + '__' + reg.ym;
  var recRef = ref('recebimentos/' + chave);
  var rec = (await recRef.once('value')).val() || {};

  if(rec.status === 'pago'){
    reg.resultado = 'ja-pago';
  }else{
    /* update, não set: preserva qualquer campo que já exista no registro */
    await recRef.update({ status: 'pago', data: reg.pagoEm, origem: 'asaas', asaasPaymentId: p.id, valorPago: reg.valor });
    reg.resultado = 'baixado';
  }
  await evRef.set(reg);
  return reg;
}

/* busca no Asaas os pagamentos recentes e aplica a mesma regra do webhook */
async function sincroniza(dias){
  var fim = hojeSP(), ini = addDias(fim, -(dias || 40));
  var lista = [];
  var recebidos = await asaasTodos('/payments', { status: 'RECEIVED', 'paymentDate[ge]': ini, 'paymentDate[le]': fim });
  var dinheiro  = await asaasTodos('/payments', { status: 'RECEIVED_IN_CASH', 'paymentDate[ge]': ini, 'paymentDate[le]': fim });
  var cartao    = await asaasTodos('/payments', { status: 'CONFIRMED' });
  lista = recebidos.concat(dinheiro, cartao);

  var resumo = { total: lista.length, baixado: 0, 'ja-pago': 0, 'sem-vinculo': 0, outros: 0, de: ini, ate: fim };
  for(var i = 0; i < lista.length; i++){
    var r = await processaPagamento(lista[i], 'SINCRONIZACAO');
    if(resumo[r.resultado] != null && r.resultado !== 'total') resumo[r.resultado]++; else resumo.outros++;
  }
  return resumo;
}

/* ---------- quem chama as ações do painel precisa ser admin ---------- */
function chaveEmail(e){ return String(e || '').trim().toLowerCase().replace(/\./g, ','); }
async function exigeAdmin(req){
  var h = String(req.headers.authorization || '');
  var tk = h.indexOf('Bearer ') === 0 ? h.slice(7) : '';
  if(!tk) throw Object.assign(new Error('Faça login no app'), { http: 401 });
  db();
  var u;
  try{ u = await admin.auth().verifyIdToken(tk); }
  catch(e){ throw Object.assign(new Error('Sessão inválida, entre de novo'), { http: 401 }); }
  var usuarios = (await ref('usuarios').once('value')).val();
  if(!usuarios) return u; /* mesma regra do app: sem usuários cadastrados, quem entra é admin */
  var me = usuarios[chaveEmail(u.email)];
  if(!me || me.papel !== 'admin') throw Object.assign(new Error('Só administradores'), { http: 403 });
  return u;
}

function configStatus(){
  var fb = false;
  try{ fb = !!JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}').private_key; }catch(e){}
  return {
    apiKey: !!process.env.ASAAS_API_KEY,
    webhookToken: !!process.env.ASAAS_WEBHOOK_TOKEN,
    firebase: fb,
    ambiente: process.env.ASAAS_AMBIENTE === 'sandbox' ? 'sandbox' : 'producao'
  };
}

module.exports = {
  PAGOS: PAGOS, ref: ref, asaasTodos: asaasTodos, processaPagamento: processaPagamento,
  sincroniza: sincroniza, exigeAdmin: exigeAdmin, configStatus: configStatus
};
