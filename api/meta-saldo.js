/* ============================================================
   2STEP · ALERTA DE SALDO META
   /api/meta-saldo?acao=cron&chave=SENHA  rodada automática (agendador):
                                          saldos + rascunhos dos relatórios +
                                          WhatsApp das tarefas da social media
   /api/meta-saldo?acao=status            o que já está configurado
   /api/meta-saldo?acao=contas            contas de anúncio que a conexão vê
   /api/meta-saldo?acao=verificar  (POST) lê os saldos e avisa agora
   /api/meta-saldo?acao=conectar   (POST) endereço do login do Facebook (só admin)
   /api/meta-saldo?acao=desconectar(POST) apaga a conexão (só admin)
   /api/meta-saldo?acao=grupos            grupos da Z-API (só admin)
   /api/meta-saldo?acao=teste      (POST) mensagem de teste (só admin)
   A volta do login do Facebook chega em api/meta-retorno.js.
   ============================================================ */
var meta = require('./_meta-core');
var rel = require('./_relatorio-core');
var tar = require('./_tarefas-core');

function erro(msg, http){ return Object.assign(new Error(msg), { http: http }); }
function soPost(req){ if(req.method !== 'POST') throw erro('use POST', 405); }

module.exports = async function(req, res){
  res.setHeader('Cache-Control', 'no-store');
  var acao = String((req.query && req.query.acao) || '');
  var st = meta.configStatus();
  try{
    if(!st.firebase) throw erro('FIREBASE_SERVICE_ACCOUNT não configurada na Vercel', 500);

    if(acao === 'cron'){
      if(!meta.cronConfere(req)) return res.status(401).json({ ok: false, erro: 'senha do agendador inválida' });
      var resumo = await meta.verifica('agendado');
      /* aproveita a rodada: rascunhos dos relatórios semanais (a partir de segunda 7h) */
      var relatorios;
      try{ relatorios = await rel.pendentes(); }catch(e){ relatorios = { erro: String(e.message || e) }; }
      /* e as tarefas da social media: resumo do dia e lembretes de pendências */
      var tarefas, painel = 'https://' + String(req.headers['x-forwarded-host'] || req.headers.host || '');
      try{ tarefas = await tar.rodada(painel); }catch(e){ tarefas = { erro: String(e.message || e) }; }
      return res.status(200).json({ ok: true, resumo: resumo, relatorios: relatorios, tarefas: tarefas });
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
      soPost(req);
      await meta.exigeUsuario(req);
      return res.status(200).json({ ok: true, resumo: await meta.verifica('manual') });
    }
    if(acao === 'conectar'){
      soPost(req);
      var u = await meta.exigeUsuario(req, true);
      return res.status(200).json({ ok: true, url: await meta.iniciaLogin(req, u.email) });
    }
    if(acao === 'desconectar'){
      soPost(req);
      await meta.exigeUsuario(req, true);
      await meta.desconecta();
      return res.status(200).json({ ok: true });
    }
    if(acao === 'grupos'){
      await meta.exigeUsuario(req, true);
      if(!st.zapi) throw erro('ZAPI_INSTANCIA e ZAPI_TOKEN não configurados na Vercel', 500);
      return res.status(200).json({ ok: true, grupos: await meta.zapiGrupos() });
    }
    if(acao === 'teste'){
      soPost(req);
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
