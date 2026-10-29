/* ============================================================
   2STEP · TAREFAS (social media e tráfego)
   Todas as ações recebem &quadro=social|trafego (padrão: social).
   /api/tarefas?acao=marcar&data=AAAA-MM-DD&chave=..&feito=1|0 (POST)
       marca ou desmarca; ao marcar, avisa no WhatsApp
   /api/tarefas?acao=enviar&data=AAAA-MM-DD (POST)
       manda agora no WhatsApp o que falta do dia
   /api/tarefas?acao=teste (POST, só admin)  mensagem de teste
   O resumo do dia e os lembretes saem pelo agendador de
   api/meta-saldo.js (acao=cron).
   ============================================================ */
var meta = require('./_meta-core');
var tar = require('./_tarefas-core');

module.exports = async function(req, res){
  res.setHeader('Cache-Control', 'no-store');
  var q = req.query || {}, acao = String(q.acao || ''), quadro = String(q.quadro || 'social');
  var painel = 'https://' + String(req.headers['x-forwarded-host'] || req.headers.host || '');
  try{
    if(!meta.configStatus().firebase) throw Object.assign(new Error('FIREBASE_SERVICE_ACCOUNT não configurada na Vercel'), { http: 500 });
    if(req.method !== 'POST') return res.status(405).json({ ok: false, erro: 'use POST' });
    if(acao === 'marcar'){
      var u = await meta.exigeUsuario(req);
      return res.status(200).json(await tar.marca(quadro, q.data, q.chave, q.feito === '1', u.email));
    }
    if(acao === 'enviar'){
      await meta.exigeUsuario(req);
      return res.status(200).json(await tar.enviaAgora(quadro, q.data, painel));
    }
    if(acao === 'teste'){
      await meta.exigeUsuario(req, true);
      await tar.teste(quadro);
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ ok: false, erro: 'ação desconhecida' });
  }catch(e){
    if(!e.http) console.error('tarefas', acao, e);
    return res.status(e.http || 500).json({ ok: false, erro: String(e.message || e) });
  }
};
