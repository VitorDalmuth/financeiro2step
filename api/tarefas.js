/* ============================================================
   2STEP · TAREFAS DE SOCIAL MEDIA
   /api/tarefas?acao=marcar&data=AAAA-MM-DD&chave=..&feito=1|0 (POST)
       marca ou desmarca; ao marcar, avisa a social media no WhatsApp
   /api/tarefas?acao=teste (POST, só admin)  mensagem de teste
   O resumo do dia e os lembretes saem pelo agendador de
   api/meta-saldo.js (acao=cron).
   ============================================================ */
var meta = require('./_meta-core');
var tar = require('./_tarefas-core');

module.exports = async function(req, res){
  res.setHeader('Cache-Control', 'no-store');
  var q = req.query || {}, acao = String(q.acao || '');
  try{
    if(!meta.configStatus().firebase) throw Object.assign(new Error('FIREBASE_SERVICE_ACCOUNT não configurada na Vercel'), { http: 500 });
    if(req.method !== 'POST') return res.status(405).json({ ok: false, erro: 'use POST' });
    if(acao === 'marcar'){
      var u = await meta.exigeUsuario(req);
      return res.status(200).json(await tar.marca(q.data, q.chave, q.feito === '1', u.email));
    }
    if(acao === 'teste'){
      await meta.exigeUsuario(req, true);
      await tar.teste();
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ ok: false, erro: 'ação desconhecida' });
  }catch(e){
    if(!e.http) console.error('tarefas', acao, e);
    return res.status(e.http || 500).json({ ok: false, erro: String(e.message || e) });
  }
};
