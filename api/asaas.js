/* ============================================================
   2STEP · AÇÕES DO PAINEL ASAAS (só administradores)
   /api/asaas?acao=status       o que já está configurado na Vercel
   /api/asaas?acao=clientes     lista os clientes cadastrados no Asaas
   /api/asaas?acao=sincronizar  busca pagamentos recentes e dá baixa
   ============================================================ */
var core = require('./_asaas-core');

module.exports = async function(req, res){
  var acao = String((req.query && req.query.acao) || '');
  var st = core.configStatus();
  try{
    if(!st.firebase) throw Object.assign(new Error('FIREBASE_SERVICE_ACCOUNT não configurada na Vercel'), { http: 500 });
    await core.exigeAdmin(req);

    if(acao === 'status') return res.status(200).json({ ok: true, status: st });

    if(!st.apiKey) throw Object.assign(new Error('ASAAS_API_KEY não configurada na Vercel'), { http: 500 });

    if(acao === 'clientes'){
      var cs = await core.asaasTodos('/customers', {});
      return res.status(200).json({ ok: true, clientes: cs.map(function(c){
        return { id: c.id, nome: c.name || '', doc: c.cpfCnpj || '', email: c.email || '' };
      }) });
    }
    if(acao === 'sincronizar'){
      if(req.method !== 'POST') return res.status(405).json({ ok: false, erro: 'use POST' });
      var dias = Math.min(Math.max(parseInt(req.query.dias, 10) || 40, 1), 180);
      var resumo = await core.sincroniza(dias);
      return res.status(200).json({ ok: true, resumo: resumo });
    }
    return res.status(400).json({ ok: false, erro: 'ação desconhecida' });
  }catch(e){
    return res.status(e.http || 500).json({ ok: false, erro: String(e.message || e), status: st });
  }
};
