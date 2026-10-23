/* ============================================================
   2STEP · VOLTA DO LOGIN DO FACEBOOK
   Endereço para cadastrar no app da Meta (URI de redirecionamento):
     https://SEU-DOMINIO/api/meta-retorno
   Troca o código pelo token, guarda no servidor e devolve a pessoa
   para o painel, em Operacional › Saldo Ads.
   ============================================================ */
var meta = require('./_meta-core');

module.exports = async function(req, res){
  res.setHeader('Cache-Control', 'no-store');
  var destino = '/?meta=ok';
  try{ await meta.concluiLogin(req); }
  catch(e){
    console.error('meta-retorno', e);
    destino = '/?meta=erro&msg=' + encodeURIComponent(String(e.message || e).slice(0, 200));
  }
  res.statusCode = 302;
  res.setHeader('Location', destino);
  res.end();
};
