/* ============================================================
   2STEP · GOOGLE ADS (só administradores, menos "contas")
   /api/google-ads?acao=status              conexão e configuração
   /api/google-ads?acao=conectar     (POST) endereço do login Google
   /api/google-ads?acao=desconectar  (POST) apaga a conexão
   /api/google-ads?acao=contas              contas de anúncio da MCC
   /api/google-ads?acao=investigar&cid=..&gerente=..
                                            dados de faturamento de uma conta
   A volta do login Google chega em api/google-retorno.js.
   ============================================================ */
var meta = require('./_meta-core');
var google = require('./_google-core');

function erro(msg, http){ return Object.assign(new Error(msg), { http: http }); }

module.exports = async function(req, res){
  res.setHeader('Cache-Control', 'no-store');
  var q = req.query || {}, acao = String(q.acao || '');
  var st = google.configStatus();
  try{
    if(!meta.configStatus().firebase) throw erro('FIREBASE_SERVICE_ACCOUNT não configurada na Vercel', 500);
    /* listar contas para vincular: toda a equipe; o resto: só administradores */
    var u = await meta.exigeUsuario(req, acao !== 'contas');

    if(acao === 'status') return res.status(200).json({ ok: true, status: st, conexao: await google.conexaoPublica() });
    if(acao === 'conectar'){
      if(req.method !== 'POST') throw erro('use POST', 405);
      return res.status(200).json({ ok: true, url: await google.iniciaLogin(req, u.email) });
    }
    if(acao === 'desconectar'){
      if(req.method !== 'POST') throw erro('use POST', 405);
      await google.desconecta();
      return res.status(200).json({ ok: true });
    }
    if(acao === 'contas') return res.status(200).json({ ok: true, contas: await google.listaContas() });
    if(acao === 'investigar') return res.status(200).json({ ok: true, resultado: await google.investiga(q.cid, q.gerente) });
    return res.status(400).json({ ok: false, erro: 'ação desconhecida' });
  }catch(e){
    if(!e.http) console.error('google-ads', acao, e);
    return res.status(e.http || 500).json({ ok: false, erro: String(e.message || e), status: st });
  }
};
