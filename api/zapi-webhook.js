/* ============================================================
   2STEP · WEBHOOK "AO RECEBER" DA Z-API
   Endereço para cadastrar na instância da Z-API (Webhooks › Ao receber):
     https://SEU-DOMINIO/api/zapi-webhook?chave=SENHA
   (SENHA = o mesmo CRON_SECRET do agendador)
   Hoje serve para criar tarefas de tráfego por mensagem no grupo
   (api/_tarefas-grupo.js). Sempre responde 200 quando a senha confere,
   para a Z-API não ficar reenviando.
   ============================================================ */
var meta = require('./_meta-core');
var grupo = require('./_tarefas-grupo');

module.exports = async function(req, res){
  res.setHeader('Cache-Control', 'no-store');
  if(req.method !== 'POST') return res.status(200).json({ ok: true, info: 'Webhook 2STEP ativo. A Z-API envia por POST.' });
  if(!meta.cronConfere(req)) return res.status(401).json({ ok: false, erro: 'senha inválida' });
  var b = req.body;
  if(typeof b === 'string'){ try{ b = JSON.parse(b); }catch(e){ b = {}; } }
  try{ return res.status(200).json(Object.assign({ ok: true }, await grupo.mensagemRecebida(b))); }
  catch(e){ console.error('zapi-webhook', e); return res.status(200).json({ ok: false, erro: String(e.message || e) }); }
};
