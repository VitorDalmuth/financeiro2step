/* ============================================================
   2STEP · WEBHOOK DO ASAAS
   URL para cadastrar no Asaas: https://SEU-DOMINIO/api/asaas-webhook
   Eventos: PAYMENT_CONFIRMED e PAYMENT_RECEIVED
   ------------------------------------------------------------
   Sempre responde 200 quando o token confere, mesmo se não houver
   vínculo: o Asaas pausa a fila depois de 15 falhas seguidas.
   ============================================================ */
var crypto = require('crypto');
var core = require('./_asaas-core');

var EVENTOS = ['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED'];

function tokenConfere(recebido){
  var esperado = String(process.env.ASAAS_WEBHOOK_TOKEN || '');
  var a = Buffer.from(String(recebido || '')), b = Buffer.from(esperado);
  return esperado.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = async function(req, res){
  if(req.method !== 'POST') return res.status(200).json({ ok: true, info: 'Webhook 2STEP ativo. O Asaas envia por POST.' });
  if(!tokenConfere(req.headers['asaas-access-token'])) return res.status(401).json({ ok: false, erro: 'token inválido' });

  var body = req.body;
  if(typeof body === 'string'){ try{ body = JSON.parse(body); }catch(e){ body = {}; } }
  body = body || {};

  if(EVENTOS.indexOf(body.event) < 0) return res.status(200).json({ ok: true, ignorado: body.event || '' });

  try{
    var r = await core.processaPagamento(body.payment, body.event);
    return res.status(200).json({ ok: true, resultado: r.resultado });
  }catch(e){
    /* erro nosso (banco fora, credencial errada): devolve 500 para o Asaas tentar de novo */
    console.error('asaas-webhook', e);
    return res.status(500).json({ ok: false, erro: String(e.message || e) });
  }
};
