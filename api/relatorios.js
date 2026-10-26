/* ============================================================
   2STEP · RELATÓRIOS SEMANAIS (admin e operação)
   /api/relatorios?acao=gerar&cliente=ID&semana=AAAA-MM-DD  (POST)
       puxa as métricas da semana (segunda a domingo) e guarda
       &de=AAAA-MM-DD&ate=AAAA-MM-DD  período próprio para esse relatório
       &padrao=1                      volta para a semana inteira
   Os rascunhos de toda segunda às 7h saem pelo agendador de
   api/meta-saldo.js (acao=cron).
   ============================================================ */
var meta = require('./_meta-core');
var rel = require('./_relatorio-core');

module.exports = async function(req, res){
  res.setHeader('Cache-Control', 'no-store');
  var q = req.query || {}, acao = String(q.acao || '');
  try{
    if(!meta.configStatus().firebase) throw Object.assign(new Error('FIREBASE_SERVICE_ACCOUNT não configurada na Vercel'), { http: 500 });
    await meta.exigeUsuario(req);
    if(acao === 'gerar'){
      if(req.method !== 'POST') return res.status(405).json({ ok: false, erro: 'use POST' });
      var opc = q.padrao === '1' ? { padrao: true } : (q.de || q.ate ? { de: String(q.de || ''), ate: String(q.ate || '') } : {});
      return res.status(200).json({ ok: true, relatorio: await rel.gera(q.cliente, q.semana, 'manual', opc) });
    }
    return res.status(400).json({ ok: false, erro: 'ação desconhecida' });
  }catch(e){
    if(!e.http) console.error('relatorios', acao, e);
    return res.status(e.http || 500).json({ ok: false, erro: String(e.message || e) });
  }
};
