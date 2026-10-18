/* ============================================================
   2STEP · APROVAÇÃO DO CALENDÁRIO (página do cliente)
   GET  /api/calendario?id=ID&k=CHAVE   devolve só aquele calendário
   POST /api/calendario { id, k, postId, acao, comentario }
        acao: "aprovar" | "ajuste" (ajuste exige comentário)
   ------------------------------------------------------------
   O cliente não tem login: a chave longa do link é a senha daquele
   calendário. Nada mais do banco é exposto por aqui.
   ============================================================ */
var crypto = require('crypto');
var core = require('./_asaas-core');

function chaveConfere(a, b){
  a = Buffer.from(String(a || '')); b = Buffer.from(String(b || ''));
  return b.length >= 20 && a.length === b.length && crypto.timingSafeEqual(a, b);
}
function idValido(id){ return /^[A-Za-z0-9_-]{1,40}$/.test(String(id || '')); }

function publico(cal, nome){
  var ps = cal.posts || {};
  return {
    cliente: nome || '',
    inicio: cal.inicio, fim: cal.fim,
    arquivosApagados: !!cal.arquivosApagados,
    posts: Object.keys(ps).map(function(k){
      var p = ps[k] || {};
      return {
        id: p.id, data: p.data, tipo: p.tipo, versao: p.versao || 1,
        status: p.status || 'pendente', comentario: p.comentario || '',
        midias: (p.midias || []).map(function(m){ return { url: cal.arquivosApagados ? '' : (m.url || ''), tipo: m.tipo }; }),
        criadoEm: p.criadoEm || ''
      };
    })
  };
}

async function carrega(id, k){
  if(!idValido(id)) return null;
  var cal = (await core.ref('calendarios/' + id).once('value')).val();
  if(!cal || !chaveConfere(k, cal.token)) return null;
  return cal;
}

module.exports = async function(req, res){
  res.setHeader('Cache-Control', 'no-store');
  try{
    if(req.method === 'GET'){
      var q = req.query || {};
      var cal = await carrega(q.id, q.k);
      if(!cal) return res.status(404).json({ ok: false, erro: 'Link inválido ou expirado.' });
      if(cal.status !== 'enviado') return res.status(403).json({ ok: false, erro: 'Este calendário ainda não foi liberado.' });
      var nome = (await core.ref('clientes/' + cal.clienteId + '/nome').once('value')).val();
      return res.status(200).json({ ok: true, calendario: publico(cal, nome) });
    }

    if(req.method === 'POST'){
      var b = req.body;
      if(typeof b === 'string'){ try{ b = JSON.parse(b); }catch(e){ b = {}; } }
      b = b || {};
      var cal2 = await carrega(b.id, b.k);
      if(!cal2) return res.status(404).json({ ok: false, erro: 'Link inválido ou expirado.' });
      if(cal2.status !== 'enviado') return res.status(403).json({ ok: false, erro: 'Este calendário ainda não foi liberado.' });
      if(!idValido(b.postId) || !(cal2.posts || {})[b.postId]) return res.status(404).json({ ok: false, erro: 'Post não encontrado.' });
      if(b.acao !== 'aprovar' && b.acao !== 'ajuste') return res.status(400).json({ ok: false, erro: 'Ação inválida.' });

      var com = String(b.comentario || '').trim().slice(0, 2000);
      if(b.acao === 'ajuste' && !com) return res.status(400).json({ ok: false, erro: 'Escreva o que quer mudar.' });

      var post = cal2.posts[b.postId];
      if(b.versao && Number(b.versao) !== (post.versao || 1))
        return res.status(409).json({ ok: false, erro: 'Este post acabou de ser atualizado pela equipe. A página vai recarregar para você ver a versão nova.' });
      var agora = new Date().toISOString();
      var base = 'calendarios/' + b.id + '/posts/' + b.postId;
      var mud = { status: b.acao === 'aprovar' ? 'aprovado' : 'ajuste', comentario: b.acao === 'ajuste' ? com : '', respondidoEm: agora };
      await core.ref(base).update(mud);
      await core.ref(base + '/respostas').push({ acao: b.acao, comentario: com, em: agora, versao: post.versao || 1 });

      Object.assign(post, mud);
      return res.status(200).json({ ok: true, status: mud.status, comentario: mud.comentario });
    }

    return res.status(405).json({ ok: false, erro: 'Método não permitido' });
  }catch(e){
    console.error('calendario', e);
    return res.status(500).json({ ok: false, erro: 'Erro no servidor. Tente de novo em instantes.' });
  }
};
