/* ============================================================
   2STEP · VOLTA DO LOGIN GOOGLE
   Endereço para cadastrar no cliente OAuth do Google Cloud
   (URIs de redirecionamento autorizados):
     https://SEU-DOMINIO/api/google-retorno
   ============================================================ */
var google = require('./_google-core');

module.exports = async function(req, res){
  res.setHeader('Cache-Control', 'no-store');
  var destino = '/?google=ok';
  try{ await google.concluiLogin(req); }
  catch(e){
    console.error('google-retorno', e);
    destino = '/?google=erro&msg=' + encodeURIComponent(String(e.message || e).slice(0, 200));
  }
  res.statusCode = 302;
  res.setHeader('Location', destino);
  res.end();
};
