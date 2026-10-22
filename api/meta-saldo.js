/* ============================================================
   2STEP · ALERTA DE SALDO META
   /api/meta-saldo?acao=cron&chave=SENHA  rodada automática (agendador)
   /api/meta-saldo?acao=status            o que já está configurado
   /api/meta-saldo?acao=contas            contas de anúncio que o token vê
   /api/meta-saldo?acao=verificar  (POST) lê os saldos e avisa agora
   /api/meta-saldo?acao=grupos            grupos da Z-API (só admin)
   /api/meta-saldo?acao=teste      (POST) mensagem de teste (só admin)
   ============================================================ */
var meta = require('./_meta-core');

function erro(msg, http){ return Object.assign(new Error(msg), { http: http }); }

module.exports = async function(req, res){
  res.setHeader('Cache-Control', 'no-store');
  var acao = String((req.query && req.query.acao) || '');
  var st = meta.configStatus();
  try{
    if(!st.firebase) throw erro('FIREBASE_SERVICE_ACCOUNT não configurada na Vercel', 500);

    if(acao === 'cron'){
      if(!meta.cronConfere(req)) return res.status(401).json({ ok: false, erro: 'senha do agendador inválida' });
      if(!st.metaToken) throw erro('META_TOKEN não configurado na Vercel', 500);
      return res.status(200).json({ ok: true, resumo: await meta.verifica('agendado') });
    }

    if(acao === 'status'){
      await meta.exigeUsuario(req);
      var out = { ok: true, status: st };
      if(st.zapi){ try{ out.zapi = await meta.zapiStatus(); }catch(e){ out.zapi = { conectado: false, erro: String(e.message || e) }; } }
      return res.status(200).json(out);
    }
    if(acao === 'contas'){
      await meta.exigeUsuario(req);
      return res.status(200).json({ ok: true, contas: await meta.listaContas() });
    }
    if(acao === 'verificar'){
      if(req.method !== 'POST') return res.status(405).json({ ok: false, erro: 'use POST' });
      await meta.exigeUsuario(req);
      if(!st.metaToken) throw erro('META_TOKEN não configurado na Vercel', 500);
      return res.status(200).json({ ok: true, resumo: await meta.verifica('manual') });
    }
    if(acao === 'grupos'){
      await meta.exigeUsuario(req, true);
      if(!st.zapi) throw erro('ZAPI_INSTANCIA e ZAPI_TOKEN não configurados na Vercel', 500);
      return res.status(200).json({ ok: true, grupos: await meta.zapiGrupos() });
    }
    if(acao === 'teste'){
      if(req.method !== 'POST') return res.status(405).json({ ok: false, erro: 'use POST' });
      await meta.exigeUsuario(req, true);
      await meta.enviaTeste();
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ ok: false, erro: 'ação desconhecida' });
  }catch(e){
    if(!e.http) console.error('meta-saldo', acao, e);
    return res.status(e.http || 500).json({ ok: false, erro: String(e.message || e), status: st });
  }
};
