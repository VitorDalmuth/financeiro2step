/* ============================================================
   2STEP · TAREFAS DE TRÁFEGO PELO GRUPO DO WHATSAPP
   A Z-API manda cada mensagem recebida para api/zapi-webhook.js, que
   chama mensagemRecebida(). Só vale no grupo configurado em Tarefas de
   tráfego, com a opção "Criar tarefas por mensagem no grupo" ligada,
   e com "Cliente:" e "Tarefa:" na mensagem:
       Cliente: Buffet Solar
       Tarefa: Subir campanha de remarketing
       Data: amanhã
   - "Tarefa:" pode repetir (uma tarefa por linha, mesmo cliente);
   - "Data:" aceita hoje, amanhã, dia da semana (sexta) ou 05/11;
     vazia ou sem a linha, a tarefa entra para hoje;
   - o nome do cliente pode vir sem acento ou incompleto.
   Responde no grupo confirmando ou pedindo correção.
   ============================================================ */
var core = require('./_asaas-core');
var meta = require('./_meta-core');
var tar = require('./_tarefas-core');

var ref = core.ref;
var MODELO = 'Cliente: Nome do cliente\nTarefa: O que fazer\nData: amanhã';
var DIAS_NOME = { domingo: 7, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };

function norm(s){ return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim(); }
function addDias(d, k){ var x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + k); return x.toISOString().slice(0, 10); }

/* separa as linhas Cliente / Tarefa / Data (aceita negrito do WhatsApp e tudo numa linha só) */
function lerMensagem(texto){
  var t = String(texto || '').replace(/[*_~]/g, '');
  var cli = '', tarefas = [], data = '';
  t.split(/\r?\n/).forEach(function(l){
    var m = l.match(/^\s*(cliente|tarefas?|data|dia|quando)\s*:\s*(.*?)\s*$/i);
    if(!m) return;
    var k = norm(m[1]);
    if(k === 'cliente') cli = m[2];
    else if(k === 'tarefa' || k === 'tarefas'){ if(m[2]) tarefas.push(m[2]); }
    else data = m[2];
  });
  if(!cli || !tarefas.length){
    var c = t.match(/cliente\s*:\s*(.+?)\s*(?=tarefa\s*:|$)/i), tf = t.match(/tarefa\s*:\s*(.+?)\s*(?=data\s*:|dia\s*:|$)/i), dt = t.match(/(?:data|dia)\s*:\s*(.+?)\s*$/i);
    if(c && tf){ cli = c[1]; tarefas = [tf[1]]; if(dt) data = dt[1]; }
  }
  return { cliente: cli.trim(), tarefas: tarefas.map(function(x){ return x.trim().slice(0, 120); }).filter(Boolean), data: data.trim() };
}
/* "hoje", "amanhã", "sexta", "05/11", "05/11/2026"; vazio = hoje; '' se não entender */
function lerData(txt, hoje){
  var s = norm(txt);
  if(!s || s === 'hoje') return hoje;
  if(s === 'amanha') return addDias(hoje, 1);
  var nome = s.replace(/ feira$/, '');
  if(DIAS_NOME[nome]){ var dif = (DIAS_NOME[nome] - tar.dow(hoje) + 7) % 7; return addDias(hoje, dif || 7); }
  var m = String(txt).match(/(\d{1,2})\s*[\/.-]\s*(\d{1,2})(?:\s*[\/.-]\s*(\d{2,4}))?/);
  if(m){
    var a = m[3] ? (m[3].length === 2 ? '20' + m[3] : m[3]) : hoje.slice(0, 4);
    var d = a + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
    var ok = new Date(d + 'T12:00:00Z');
    if(isNaN(ok) || ok.toISOString().slice(0, 10) !== d) return '';
    if(!m[3] && d < hoje) d = (+a + 1) + d.slice(4);   /* "05/01" em dezembro é o ano que vem */
    return d;
  }
  return '';
}
/* acha o cliente pelo nome: igual, contém ou todas as palavras; empate desempata pelos clientes de tráfego */
function achaCliente(nome, clientes){
  var q = norm(nome);
  if(!q) return { lista: [] };
  var cs = Object.keys(clientes || {}).map(function(k){ var c = clientes[k]; return c && c.status !== 'encerrado' ? Object.assign({ id: c.id || k }, c) : null; }).filter(Boolean);
  var exatos = cs.filter(function(c){ return norm(c.nome) === q; });
  if(exatos.length) return { cliente: exatos[0] };
  var parecidos = cs.filter(function(c){ var n = norm(c.nome); return n.indexOf(q) > -1 || q.indexOf(n) > -1; });
  if(!parecidos.length){
    var pal = q.split(' ').filter(function(p){ return p.length > 2; });
    parecidos = cs.filter(function(c){ var n = norm(c.nome); return pal.length && pal.every(function(p){ return n.indexOf(p) > -1; }); });
  }
  if(parecidos.length > 1){
    var trf = parecidos.filter(function(c){ return c.trafego !== false; });
    if(trf.length === 1) return { cliente: trf[0] };
  }
  return parecidos.length === 1 ? { cliente: parecidos[0] } : { lista: parecidos.slice(0, 5) };
}

async function mensagemRecebida(b){
  b = b || {};
  if(b.fromMe || !b.isGroup) return { ignorada: 'não é mensagem de outra pessoa num grupo' };
  var texto = (b.text && b.text.message) || '';
  if(!/cliente\s*\**\s*:/i.test(texto) || !/tarefa\s*\**\s*:/i.test(texto)) return { ignorada: 'sem o formato Cliente/Tarefa' };
  var Q = tar.QUADROS.trafego;
  var cfg = (await ref(Q.raiz + '/config').once('value')).val() || {};
  if(!cfg.viaGrupo || !cfg.grupo || String(b.phone || '') !== cfg.grupo) return { ignorada: 'não é o grupo do tráfego (ou a opção está desligada)' };

  /* a Z-API pode reenviar a mesma mensagem: processa uma vez só */
  var mid = String(b.messageId || '').replace(/[.#$\[\]\/]/g, '_').slice(0, 80);
  if(mid){
    var vista = ref(Q.raiz + '/viaGrupo/' + mid);
    if((await vista.once('value')).val()) return { ignorada: 'já processada' };
    await vista.set(new Date().toISOString());
  }

  var dest = { canal: 'zapi', destino: cfg.grupo };
  var m = lerMensagem(texto), hoje = tar.hojeSP();
  if(!m.cliente || !m.tarefas.length){
    await meta.enviaWhats('⚠️ Não entendi a tarefa. Mande assim:\n\n' + MODELO, dest);
    return { ok: false, motivo: 'formato' };
  }
  var data = lerData(m.data, hoje);
  if(!data){
    await meta.enviaWhats('⚠️ Não entendi a data *' + m.data + '*. Use hoje, amanhã, o dia da semana (ex.: sexta) ou a data (ex.: 05/11).', dest);
    return { ok: false, motivo: 'data' };
  }
  var clientes = (await ref('clientes').once('value')).val() || {};
  var achou = achaCliente(m.cliente, clientes);
  if(!achou.cliente){
    await meta.enviaWhats(achou.lista.length
      ? '⚠️ Mais de um cliente parecido com *' + m.cliente + '*: ' + achou.lista.map(function(c){ return c.nome; }).join(', ') + '. Mande de novo com o nome completo.'
      : '⚠️ Não encontrei o cliente *' + m.cliente + '*. Confira o nome como está no painel e mande de novo.', dest);
    return { ok: false, motivo: 'cliente' };
  }

  var autor = String(b.senderName || b.participantPhone || 'WhatsApp'), agora = new Date().toISOString();
  for(var i = 0; i < m.tarefas.length; i++){
    await ref(Q.raiz + '/avulsas').push({ clienteId: achou.cliente.id, titulo: m.tarefas[i], data: data, criadoEm: agora, criadoPor: 'WhatsApp · ' + autor });
  }
  await meta.enviaWhats('📝 *Tarefa' + (m.tarefas.length > 1 ? 's adicionadas' : ' adicionada') + '* (' + (data === hoje ? 'hoje, ' + tar.dataBR(data) : tar.quando(data)) + ')\n' +
    m.tarefas.map(function(t){ return '*' + achou.cliente.nome + '* · ' + t; }).join('\n'), dest);
  return { ok: true, cliente: achou.cliente.nome, tarefas: m.tarefas.length, data: data };
}

module.exports = { mensagemRecebida: mensagemRecebida, _lerMensagem: lerMensagem, _lerData: lerData, _achaCliente: achaCliente };
