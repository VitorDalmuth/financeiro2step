/* ============================================================
   2STEP · HOME
   Primeira tela ao abrir o app. À esquerda, a agenda do dia de cada
   pessoa (tarefas de social media, de tráfego e a rotina de relatórios
   de segunda), com as atrasadas dos últimos dias. À direita, os alertas:
   contas de anúncio com saldo abaixo do mínimo.
   Para admin e operação. Não mostra nada do financeiro.
   Depende de app.js (S, EMAIL, VIEW, MOD_ABERTO, MODULOS, go, esc,
   toast, chaveEmail, euSouAdmin, addDias), de tarefas.js (TAR, tarLiga,
   tarDoDia, tarMarca, tarHoje, tarDiaLabel), de saldo.js (SAL, salLiga,
   salContas, salSit, salCard, salHa) e de checklist.js (ckResp,
   ckRotinaDoDia, ckRotinaMarca, ckUsuarios, ckNomeUsuario, mCkResponsaveis).
   Grava só as tarefas criadas aqui (botão "+ Tarefa"): avulsas de uma
   pessoa em 2step_financeiro/tarefasPessoais, ou de tráfego / social media
   nos quadros deles, sempre com o responsável (resp = chave do e-mail).
   Cada pessoa cria para si; o administrador cria para qualquer um.
   ============================================================ */

var HOME = { agenda: 'eu' };
var HOME_ATRASO_DIAS = 7;   /* atrasadas: o que ficou para trás nos últimos 7 dias */
var HOME_ORIGEM = { social: 'Social media', trafego: 'Tráfego', rel: 'Relatórios', pessoal: 'Avulsa' };

/* estilos só deste módulo */
(function(){
  var css = '' +
  '.hm-g{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:12px;align-items:start}' +
  '.hm-l{max-height:620px;overflow-y:auto}' +
  '.hm-f{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 16px;border-top:1px solid var(--line);flex-wrap:wrap}' +
  '.hm-tag{font-size:10.5px;font-weight:700;padding:2px 7px;border-radius:6px;background:var(--slab3);color:var(--mute);white-space:nowrap}' +
  '.hm-tag.at{background:var(--coral-dim);color:var(--coral)}' +
  '.hm-tags{display:flex;gap:5px;flex-wrap:wrap;margin-top:4px}' +
  '.tar-t.at{background:linear-gradient(90deg,var(--coral-dim),transparent 70%)}' +
  '.hm-sem{display:flex;align-items:center;justify-content:center;gap:10px;padding:10px 12px 2px}' +
  '.hm-sem-t{font-size:12.5px;color:var(--mute);font-weight:600;min-width:130px;text-align:center}' +
  '.hm-dias{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;padding:6px 12px 10px;border-bottom:1px solid var(--line)}' +
  '.hm-d{display:flex;flex-direction:column;align-items:center;gap:2px;padding:7px 2px 6px;border-radius:10px;background:transparent;color:var(--mute);font-size:11px;line-height:1.2}' +
  '.hm-d b{font-size:16px;color:var(--ink);font-family:var(--body)}.hm-d:hover{background:var(--slab2)}' +
  '.hm-d.on{background:var(--volt);color:#fff}.hm-d.on b,.hm-d.on i{color:#fff}.hm-d.hj:not(.on) b{color:var(--volt)}' +
  '.hm-d i{font-style:normal;font-size:10px;font-weight:700;min-height:14px;padding:0 5px;border-radius:999px;background:var(--coral-dim);color:var(--coral)}' +
  '.hm-d i.ok{background:transparent;color:var(--mint)}.hm-d i.vz{background:transparent}.hm-d.on i{background:rgba(255,255,255,.2)}' +
  '.hm-w{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:6px;padding:10px 12px;max-height:620px;overflow:auto}.hm-g1{grid-template-columns:1fr}' +
  '.hm-wd{background:var(--slab2);border:1px solid var(--line);border-radius:10px;padding:8px;min-width:0}.hm-wd.hj{border-color:var(--volt)}' +
  '.hm-wd-h{display:flex;justify-content:space-between;align-items:center;gap:4px;margin-bottom:4px}' +
  '.hm-wd-b{font-size:11.5px;font-weight:700;color:var(--ink);text-transform:capitalize;padding:0;background:none}.hm-wd-b:hover{color:var(--volt)}' +
  '.hm-wt{display:flex;gap:6px;align-items:flex-start;padding:6px 0;border-top:1px solid var(--line)}.hm-wt .tar-ck{flex:none;transform:scale(.85);transform-origin:left top}' +
  '.hm-wt-t{font-size:12px;line-height:1.3;word-break:break-word}.hm-wt.ok .hm-wt-t{text-decoration:line-through;color:var(--mute)}' +
  '.hm-wt-c{font-size:10.5px;color:var(--mute);margin-top:1px}.hm-wt-v{font-size:11.5px;color:var(--mute2);padding:6px 0}' +
  '@media(max-width:600px){.hm-d span{font-size:9.5px}}' +
  '@media(max-width:1000px){.hm-g{grid-template-columns:1fr}}';
  var s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
})();

function homeNome(){
  var u = (S.usuarios || {})[chaveEmail(EMAIL)] || {};
  var n = String(u.nome || String(EMAIL || '').split('@')[0] || '').trim().split(' ')[0];
  return n ? n.charAt(0).toUpperCase() + n.slice(1) : '';
}
function homeSaudacao(){
  var h = Number(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false })) % 24;
  return h < 12 ? 'Bom dia' : (h < 18 ? 'Boa tarde' : 'Boa noite');
}

/* ---------- tarefas de todos os quadros, com responsável ---------- */
function homeDoDia(data){
  var r = ckResp(), out = [];
  ['social', 'trafego', 'pessoal'].forEach(function(q){
    /* tarefa com responsável próprio vai para ele; senão, para o responsável da frente */
    tarDoDia(data, q).forEach(function(t){ out.push(Object.assign({}, t, { q: q, data: data, resp: t.resp || (q === 'pessoal' ? '' : r[q] || '') })); });
  });
  ckRotinaDoDia(data).forEach(function(t){ out.push(Object.assign({}, t, { data: data })); });
  return out;
}
function homeVisivel(t){
  if(HOME.agenda === 'todos') return true;
  var alvo = HOME.agenda === 'eu' ? chaveEmail(EMAIL) : HOME.agenda;
  /* sem responsável definido: aparece para os administradores na própria agenda */
  return t.resp ? t.resp === alvo : (HOME.agenda === 'eu' && euSouAdmin());
}
function homeAgenda(){
  var hoje = tarHoje(), lista = homeDoDia(hoje).filter(homeVisivel);
  var atras = [];
  for(var i = HOME_ATRASO_DIAS; i >= 1; i--){
    homeDoDia(addDias(hoje, -i)).forEach(function(t){ if(!t.feita && homeVisivel(t)) atras.push(t); });
  }
  return { hoje: lista, atrasadas: atras };
}

/* marca a tarefa no quadro certo */
function homeMarca(q, data, chave, feito, auto){
  if(q === 'rel') return ckRotinaMarca(data, chave, feito, auto);
  TAR.q = q;
  tarMarca(data, chave, feito);
}
function homeAgendaTroca(v){ HOME.agenda = v; render(); }

/* ---------- tela ---------- */
function vHome(){
  var hoje = tarHoje();
  tarLiga('social'); tarLiga('trafego'); tarLiga('pessoal'); salLiga();

  var ag = homeAgenda();
  var baixas = salContas().filter(function(c){ return c.ativo !== false && salSit(c) === 'baixo'; });
  var erros = salContas().filter(function(c){ return c.ativo !== false && salSit(c) === 'erro'; });
  var uv = (SAL.d || {}).ultimaVerificacao;
  var nome = homeNome(), r = ckResp();
  var semResp = euSouAdmin() && !(r.social || r.trafego || r.relatorios);

  return '' +
  '<div class="hd"><div><h1>' + homeSaudacao() + (nome ? ', ' + esc(nome) : '') + '!</h1>' +
    '<p>' + esc(tarDiaLabel(hoje).charAt(0).toUpperCase() + tarDiaLabel(hoje).slice(1)) + '</p></div>' +
    '<div class="hd-act">' + (ag.atrasadas.length ? '<span class="pill p-cr" style="padding:7px 12px;font-size:12.5px">🔔 ' + ag.atrasadas.length + ' atrasada(s)</span>' : '') +
      '<button class="btn" onclick="mHomeAvisos()">' + (homeAvisosCfg().ligado ? '🔔 Avisos ligados' : '🔔 Avisos no WhatsApp') + '</button>' +
      (euSouAdmin() ? '<button class="btn" onclick="mCkResponsaveis()">Responsáveis</button>' : '') + '</div></div>' +

  (semResp ? '<div class="note">Defina quem cuida de cada frente (tráfego, social media e rotina de relatórios) para cada pessoa ver só as suas tarefas. ' +
    '<button class="btn btn-s btn-p" style="margin-left:6px" onclick="mCkResponsaveis()">Definir responsáveis</button></div>' : '') +

  '<div class="hm-g' + ((HOME.modo || 'dia') === 'semana' ? ' hm-g1' : '') + '">' + homeTarefasHTML(ag, hoje) + homeAlertasHTML(baixas, erros, uv) + '</div>';
}

/* ---------- dia escolhido e semana (padrão: hoje, como sempre foi) ---------- */
var HOME_MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
var HOME_SEM = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];
function homeDia(){ return HOME.dia || tarHoje(); }
function homeSegunda(d){ return addDias(d, -(tarDow(d) - 1)); }
function homeDiaCurto(d){ return String(+d.slice(8, 10)) + ' ' + HOME_MESES[+d.slice(5, 7) - 1]; }
function homeVaiDia(d){ HOME.dia = d; HOME.modo = 'dia'; render(); }
function homeModo(m){ HOME.modo = m; render(); }
function homeSemana(k){ HOME.dia = addDias(homeDia(), 7 * k); render(); }
function homeDoDiaVisivel(data){ return homeDoDia(data).filter(homeVisivel); }

/* faixa com os sete dias da semana do dia escolhido */
function homeFaixaHTML(hoje){
  var dia = homeDia(), seg = homeSegunda(dia), cel = '';
  for(var i = 0; i < 7; i++){
    var d = addDias(seg, i), ts = homeDoDiaVisivel(d), pend = ts.filter(function(t){ return !t.feita; }).length;
    cel += '<button class="hm-d' + (d === dia ? ' on' : '') + (d === hoje ? ' hj' : '') + '" onclick="homeVaiDia(\'' + d + '\')"><span>' + HOME_SEM[i] + '</span><b>' + (+d.slice(8, 10)) + '</b>' +
      (ts.length ? '<i class="' + (pend ? '' : 'ok') + '">' + (pend || '✓') + '</i>' : '<i class="vz"></i>') + '</button>';
  }
  return '<div class="hm-sem"><button class="btn btn-s" onclick="homeSemana(-1)" aria-label="Semana anterior">‹</button>' +
    '<span class="hm-sem-t">' + homeDiaCurto(seg) + ' — ' + homeDiaCurto(addDias(seg, 6)) + '</span>' +
    (dia !== hoje ? '<button class="btn btn-s" onclick="homeVaiDia(\'' + hoje + '\')">Hoje</button>' : '') +
    '<button class="btn btn-s" onclick="homeSemana(1)" aria-label="Próxima semana">›</button></div><div class="hm-dias">' + cel + '</div>';
}

/* modo Semana: os sete dias lado a lado */
function homeSemanaHTML(hoje){
  var seg = homeSegunda(homeDia()), cols = '';
  for(var i = 0; i < 7; i++){
    var d = addDias(seg, i), ts = homeDoDiaVisivel(d), pend = ts.filter(function(t){ return !t.feita; }).length;
    cols += '<div class="hm-wd' + (d === hoje ? ' hj' : '') + '"><div class="hm-wd-h"><button class="hm-wd-b" onclick="homeVaiDia(\'' + d + '\')">' + HOME_SEM[i].slice(0, 3) + ' ' + (+d.slice(8, 10)) + '</button>' +
        (ts.length ? '<span class="sub" style="margin:0;font-size:11px">' + (pend ? pend + ' pend.' : '✓ feito') + '</span>' : '') + '</div>' +
      (ts.length ? ts.map(function(t){
        return '<div class="hm-wt' + (t.feita ? ' ok' : '') + '">' +
          '<button class="tar-ck" aria-label="' + (t.feita ? 'Desmarcar' : 'Marcar como feita') + '" onclick="homeMarca(\'' + t.q + '\',\'' + t.data + '\',\'' + esc(t.chave) + '\',' + (t.feita ? 'false' : 'true') + ',' + !!(t.feita && t.feita.auto) + ')">✓</button>' +
          '<div style="min-width:0"><div class="hm-wt-t">' + esc(t.titulo) + '</div><div class="hm-wt-c">' + esc(t.cliente) + ' · ' + HOME_ORIGEM[t.q] + (HOME.agenda === 'todos' ? ' · ' + esc(t.resp ? ckNomeUsuario(t.resp) : 'sem responsável') : '') + '</div></div></div>';
      }).join('') : '<div class="hm-wt-v">sem tarefas</div>') + '</div>';
  }
  return '<div class="hm-w">' + cols + '</div>';
}

function homeTarefasHTML(ag, hoje){
  var dia = homeDia(), modo = HOME.modo || 'dia', hojeSel = dia === hoje;
  /* outro dia escolhido: só as tarefas daquele dia (as atrasadas são sempre em relação a hoje) */
  var agDia = hojeSel ? ag : { hoje: homeDoDiaVisivel(dia), atrasadas: [] };
  var todas = agDia.atrasadas.concat(agDia.hoje);
  var feitasHoje = agDia.hoje.filter(function(t){ return t.feita; }).length;
  var grupos = {}, ordem = [];
  todas.forEach(function(t){ var k = t.clienteId || '_'; if(!grupos[k]){ grupos[k] = []; ordem.push(k); } grupos[k].push(t); });
  /* clientes com atrasadas primeiro */
  ordem.sort(function(a, b){
    var at = function(k){ return grupos[k].some(function(t){ return t.data < hoje; }) ? 0 : 1; };
    return at(a) - at(b) || String(grupos[a][0].cliente).localeCompare(String(grupos[b][0].cliente), 'pt-BR');
  });

  var us = ckUsuarios();
  var seletor = '<select class="fi" style="width:auto;padding:6px 10px;font-size:12.5px" onchange="homeAgendaTroca(this.value)">' +
    '<option value="eu"' + (HOME.agenda === 'eu' ? ' selected' : '') + '>Minha agenda</option>' +
    us.filter(function(u){ return u.k !== chaveEmail(EMAIL); }).map(function(u){ return '<option value="' + esc(u.k) + '"' + (HOME.agenda === u.k ? ' selected' : '') + '>Agenda de ' + esc(u.nome) + '</option>'; }).join('') +
    '<option value="todos"' + (HOME.agenda === 'todos' ? ' selected' : '') + '>Toda a equipe</option></select>';
  var modos = '<div class="seg"><button class="' + (modo === 'dia' ? 'on' : '') + '" onclick="homeModo(\'dia\')">Dia</button><button class="' + (modo === 'semana' ? 'on' : '') + '" onclick="homeModo(\'semana\')">Semana</button></div>';

  var lista = ordem.map(function(k){
    var ts = grupos[k], pend = ts.filter(function(t){ return !t.feita; }).length;
    return '<div class="tar-cli flx sp"><span>' + esc(ts[0].cliente) + '</span>' +
      '<span style="font-size:11.5px;font-family:var(--body);font-weight:500">' + (pend ? '<span class="dot" style="background:var(--coral);margin-right:5px"></span>' + pend + ' pendente(s)' : '✓ tudo feito') + '</span></div>' +
      ts.map(function(t){
        var at = t.data < hoje && !t.feita;
        var hora = t.feita && t.feita.em ? new Date(t.feita.em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
        var podeTirar = t.q === 'pessoal' && (euSouAdmin() || t.resp === chaveEmail(EMAIL));
        return '<div class="tar-t' + (t.feita ? ' ok' : '') + (at ? ' at' : '') + '">' +
          '<button class="tar-ck" aria-label="' + (t.feita ? 'Desmarcar' : 'Marcar como feita') + '" onclick="homeMarca(\'' + t.q + '\',\'' + t.data + '\',\'' + esc(t.chave) + '\',' + (t.feita ? 'false' : 'true') + ',' + !!(t.feita && t.feita.auto) + ')">✓</button>' +
          '<div style="min-width:0"><div class="tar-tt">' + esc(t.titulo) + '</div>' +
            '<div class="hm-tags"><span class="hm-tag">' + HOME_ORIGEM[t.q] + '</span>' +
              (at ? '<span class="hm-tag at">Atrasado · ' + esc(tarDiaLabel(t.data).replace(/-feira/, '')) + '</span>' : '') +
              (HOME.agenda === 'todos' ? '<span class="hm-tag">' + esc(t.resp ? ckNomeUsuario(t.resp) : 'sem responsável') + '</span>' : '') + '</div>' +
            (t.feita ? '<div class="sub">' + (t.feita.auto ? 'marcada pelo download' : 'feita às ' + hora + (t.feita.por ? ' · ' + esc(String(t.feita.por).split('@')[0]) : '')) + '</div>' : '') +
          '</div>' + (podeTirar ? '<div class="tar-ac"><button class="btn btn-s btn-d" onclick="homeTira(\'' + t.data + '\',\'' + esc(t.chave) + '\')" aria-label="Excluir tarefa">×</button></div>' : '') + '</div>';
      }).join('');
  }).join('');

  var corpo;
  if(modo === 'semana') corpo = homeSemanaHTML(hoje);
  else if(todas.length) corpo = '<div class="hm-l">' + lista + '</div>';
  else corpo = '<div class="empty"><b>Nenhuma tarefa ' + (HOME.agenda === 'todos' ? '' : 'nesta agenda ') + (hojeSel ? 'hoje' : 'nesse dia') + ' 🎉</b>' +
    (hojeSel ? 'As tarefas do dia e as atrasadas aparecem aqui.' : 'Use "+ Tarefa" para adicionar algo em ' + esc(tarDiaLabel(dia)) + '.') + '</div>';

  return '<div class="tw"><div class="tw-hd"><div class="tw-t">' + (hojeSel ? 'Tarefas do dia' : 'Tarefas de ' + esc(tarDiaLabel(dia))) + '</div><div class="flx" style="gap:8px">' + modos +
      '<button class="btn btn-s btn-p" onclick="mHomeTarefa()">+ Tarefa</button>' + seletor +
      (modo === 'dia' ? '<span class="pill ' + (!agDia.hoje.length ? 'p-off' : (feitasHoje === agDia.hoje.length ? 'p-on' : 'p-av')) + '">' + feitasHoje + ' de ' + agDia.hoje.length + (hojeSel ? ' hoje' : '') + '</span>' : '') + '</div></div>' +
    homeFaixaHTML(hoje) + corpo +
    '<div class="hm-f"><span class="sub" style="margin:0">' + (ag.atrasadas.length ? ag.atrasadas.length + ' atrasada(s) dos últimos ' + HOME_ATRASO_DIAS + ' dias' : 'Nada atrasado') + '</span>' +
      '<span class="flx" style="gap:6px"><button class="btn btn-s" onclick="go(\'trafego\')">Tráfego →</button><button class="btn btn-s" onclick="go(\'tarefas\')">Social media →</button><button class="btn btn-s" onclick="go(\'rel\')">Relatórios →</button></span></div>' +
    '</div>';
}

/* ---------- nova tarefa (avulsa, de tráfego ou de social media) ---------- */
function mHomeTarefa(){
  var adm = euSouAdmin(), eu = chaveEmail(EMAIL);
  var alvo = adm && HOME.agenda !== 'eu' && HOME.agenda !== 'todos' ? HOME.agenda : eu;
  var cs = listaClientes().filter(function(c){ return c.status !== 'encerrado'; })
    .sort(function(a, b){ return String(a.nome).localeCompare(String(b.nome), 'pt-BR'); });
  var us = ckUsuarios();
  if(!us.some(function(u){ return u.k === eu; })) us.unshift({ k: eu, nome: homeNome() || 'Eu' });
  modal('Nova tarefa',
    '<div class="fg"><label class="fl">Tipo</label><select class="fi" id="h_q" onchange="homeTipoTroca()">' +
      '<option value="pessoal">Avulsa (fora de tráfego e social media)</option>' +
      '<option value="trafego">Tráfego</option><option value="social">Social media</option></select>' +
      '<div class="hint" id="h_qh">Fica só na agenda da pessoa, aqui na tela inicial.</div></div>' +
    '<div class="fg"><label class="fl" id="h_clil">Cliente (opcional)</label><select class="fi" id="h_cli"><option value="">Sem cliente</option>' +
      cs.map(function(c){ return '<option value="' + esc(c.id) + '">' + esc(c.nome) + '</option>'; }).join('') + '</select></div>' +
    '<div class="fg"><label class="fl">O que fazer</label><input class="fi" id="h_tit" maxlength="120" placeholder="Ligar para o cliente, revisar contrato..."></div>' +
    '<div class="fr fr2"><div class="fg"><label class="fl">Dia</label><input type="date" class="fi" id="h_dia" value="' + homeDia() + '"></div>' +
      (adm ? '<div class="fg"><label class="fl">Para quem</label><select class="fi" id="h_resp">' +
          us.map(function(u){ return '<option value="' + esc(u.k) + '"' + (u.k === alvo ? ' selected' : '') + '>' + esc(u.k === eu ? u.nome + ' (eu)' : u.nome) + '</option>'; }).join('') + '</select></div>'
        : '<div class="fg"><label class="fl">Para quem</label><div class="fi" style="background:var(--slab2);color:var(--mute)">Para mim</div></div>') + '</div>',
    '<button class="btn" onclick="fecha()">Cancelar</button><button class="btn btn-p" onclick="homeSalvaTarefa()">Adicionar</button>');
  setTimeout(function(){ var e = $('h_tit'); if(e) e.focus(); }, 60);
}
function homeTipoTroca(){
  var q = $('h_q').value, cli = $('h_cli');
  $('h_clil').textContent = q === 'pessoal' ? 'Cliente (opcional)' : 'Cliente';
  cli.options[0].textContent = q === 'pessoal' ? 'Sem cliente' : 'Escolha o cliente';
  $('h_qh').textContent = q === 'pessoal' ? 'Fica só na agenda da pessoa, aqui na tela inicial.'
    : 'Entra também em Tarefas de ' + (q === 'trafego' ? 'tráfego' : 'social media') + ' e nas mensagens do WhatsApp dessa frente.';
}
function homeSalvaTarefa(){
  var q = $('h_q').value, cli = $('h_cli').value, tit = $('h_tit').value.trim(), dia = $('h_dia').value;
  var eu = chaveEmail(EMAIL), resp = euSouAdmin() && $('h_resp') ? $('h_resp').value : eu;
  if(!TAR_Q[q]) return;
  if(q !== 'pessoal' && !cli) return toast('Escolha o cliente', 'err');
  if(!tit) return toast('Escreva o que fazer', 'err');
  if(!dia) return toast('Escolha o dia', 'err');
  if(!resp) return toast('Escolha para quem é a tarefa', 'err');
  tarLiga(q);
  tarUpd('avulsas/' + uid(), { clienteId: cli || '', titulo: tit, data: dia, resp: resp, criadoEm: new Date().toISOString(), criadoPor: EMAIL || '' }, q)
    .then(function(){}, function(e){ toast(e.message, 'err'); });
  fecha();
  toast('Tarefa adicionada' + (resp !== eu ? ' para ' + (ckNomeUsuario(resp) || 'a pessoa') : '') + (dia !== tarHoje() ? ' em ' + tarDiaLabel(dia) : ''), 'ok');
  render();
}
function homeTira(data, chave){
  var t = tarDoDia(data, 'pessoal').filter(function(x){ return x.chave === chave; })[0];
  if(!t || !confirm('Excluir a tarefa "' + t.titulo + '"?')) return;
  tarUpd('avulsas/' + t.id, null, 'pessoal');
  if(t.feita) tarUpd('feitas/' + data + '/' + chave, null, 'pessoal');
  toast('Tarefa excluída');
}

function homeAlertasHTML(baixas, erros, uv){
  return '<div class="tw"><div class="tw-hd"><div class="tw-t">Alertas</div>' +
      (baixas.length ? '<span class="pill p-cr">' + baixas.length + ' saldo(s) baixo(s)</span>' : '<span class="pill p-on">tudo certo</span>') + '</div>' +
    (baixas.length ? '<div class="fl" style="padding:12px 16px 0">Saldo abaixo do mínimo</div><div class="pg" style="padding:10px 12px 12px">' + baixas.map(salCard).join('') + '</div>'
      : '<div class="empty"><b>Nenhum alerta</b>Quando um saldo de anúncio baixar do mínimo configurado, a conta aparece aqui.</div>') +
    (erros.length ? '<div class="note" style="margin:0 12px 12px">' + erros.length + ' conta(s) com erro na leitura do saldo: ' +
      erros.map(function(c){ return esc((S.clientes[c.clienteId] || {}).nome || c.nome || c.id); }).join(', ') + '. O saldo delas pode estar baixo sem aparecer aqui.</div>' : '') +
    '<div class="hm-f"><span class="sub" style="margin:0">' + (uv ? 'Última verificação ' + salHa(uv.em) : 'Nenhuma verificação ainda') + '</span>' +
      '<button class="btn btn-s" onclick="go(\'saldo\')">Abrir Saldo Ads →</button></div>' +
    '</div>';
}

/* ---------- registro no menu: primeiro módulo, e tela inicial do app ---------- */
(function(){
  MODULOS.unshift({ id:'ini', nome:'Início', sigla:'I', cor:'#22D3EE', papeis:['admin','operacao'], telas:[
    { v:'home', n:'Home', f:function(){ return vHome(); } }
  ]});
  /* só troca a tela padrão; a volta do login do Facebook/Google continua abrindo em Saldo Ads */
  if(VIEW === 'dash'){ VIEW = 'home'; MOD_ABERTO = 'ini'; }
})();

/* ---------- avisos da agenda no WhatsApp (cada pessoa configura o seu) ----------
   Salvo pelo servidor em tarefasPessoais/avisos/{chave} (api/tarefas.js?acao=avisos);
   o agendador de hora em hora manda o resumo e as pendências (api/_agenda-core.js). */
function homeAvisosCfg(){ return ((tarD('pessoal').avisos || {})[chaveEmail(EMAIL)]) || {}; }
function homeAvisosApi(acao, corpo){
  if(MEM) return Promise.reject(new Error('Na demonstração não há envio de WhatsApp'));
  if(!AUTH || !AUTH.currentUser) return Promise.reject(new Error('Faça login de novo'));
  return AUTH.currentUser.getIdToken().then(function(tk){
    return fetch('/api/tarefas?acao=' + acao, { method: 'POST', headers: Object.assign({ Authorization: 'Bearer ' + tk }, corpo ? { 'Content-Type': 'application/json' } : {}), body: corpo ? JSON.stringify(corpo) : undefined });
  }).then(function(r){
    return r.json().catch(function(){ throw new Error('Resposta inválida do servidor (' + r.status + ')'); })
      .then(function(j){ if(!j.ok) throw new Error(j.erro || 'Erro no servidor'); return j; });
  });
}
function mHomeAvisos(){
  var c = homeAvisosCfg(), hR = c.horaResumo != null ? +c.horaResumo : 8, lemb = (c.lembretes || [12, 15, 18]).map(Number);
  var horas = ''; for(var h = 5; h <= 12; h++) horas += '<option value="' + h + '"' + (h === hR ? ' selected' : '') + '>' + h + 'h</option>';
  var chips = ''; for(var l = 9; l <= 20; l++) chips += '<button type="button" data-h="' + l + '" class="' + (lemb.indexOf(l) > -1 ? 'on' : '') + '" onclick="this.classList.toggle(\'on\')">' + l + 'h</button>';
  modal('Avisos da minha agenda no WhatsApp',
    '<p class="sub">Você recebe no seu WhatsApp a mesma agenda desta tela: suas tarefas do dia, as atrasadas e, nos lembretes, o que ainda está pendente. Sai pelo mesmo número que manda os alertas de saldo.</p>' +
    '<label class="chk' + (c.ligado ? ' on' : '') + '" style="margin-bottom:14px"><input type="checkbox" id="h_av_lig"' + (c.ligado ? ' checked' : '') + ' onchange="this.parentNode.classList.toggle(\'on\',this.checked)">Receber minha agenda no WhatsApp</label>' +
    '<div class="fg"><label class="fl">Meu número</label><input class="fi mono" id="h_av_fone" inputmode="tel" placeholder="5548999999999" value="' + esc(c.fone || '') + '"><div class="hint">Com 55 e DDD, só números.</div></div>' +
    '<div class="fr" style="grid-template-columns:1fr 2fr"><div class="fg"><label class="fl">Resumo do dia às</label><select class="fi" id="h_av_hres">' + horas + '</select></div>' +
      '<div class="fg"><label class="fl">Lembretes das pendências</label><div class="tar-dias" id="h_av_lemb">' + chips + '</div></div></div>' +
    '<label class="chk' + (c.diasUteis !== false ? ' on' : '') + '"><input type="checkbox" id="h_av_uteis"' + (c.diasUteis !== false ? ' checked' : '') + ' onchange="this.parentNode.classList.toggle(\'on\',this.checked)">Só de segunda a sexta</label>' +
    '<div class="hint mt12">Se não houver tarefa nem atraso no dia, nada é enviado. "Receber agora" manda as pendências de hoje na hora.</div>',
    '<button class="btn" onclick="fecha()">Fechar</button><button class="btn" id="h_av_teste" onclick="homeAvisosAcao(\'avisosTeste\')">Enviar teste</button>' +
    '<button class="btn" id="h_av_agora" onclick="homeAvisosAcao(\'avisosAgora\')">Receber agora</button><button class="btn btn-p" onclick="homeSalvaAvisos()">Salvar</button>');
}
function homeAvisosLe(){
  var lig = $('h_av_lig').checked, fone = $('h_av_fone').value.replace(/\D/g, '');
  if(lig && !/^55\d{10,11}$/.test(fone)){ toast('Número inválido: use 55 + DDD + número, ex. 5548999999999', 'err'); return null; }
  return { ligado: lig, fone: fone, horaResumo: +$('h_av_hres').value, diasUteis: $('h_av_uteis').checked,
    lembretes: [].map.call(document.querySelectorAll('#h_av_lemb button.on'), function(b){ return +b.dataset.h; }) };
}
function homeSalvaAvisos(){
  var c = homeAvisosLe(); if(!c) return;
  homeAvisosApi('avisos', c).then(function(){ fecha(); toast(c.ligado ? 'Avisos ligados' : 'Configuração salva', 'ok'); render(); }, function(e){ toast(e.message, 'err'); });
}
/* teste e "receber agora": salvam antes, para usar o número que está na tela */
function homeAvisosAcao(acao){
  var c = homeAvisosLe(); if(!c) return;
  if(!c.fone){ toast('Informe seu número primeiro', 'err'); return; }
  var b = $(acao === 'avisosTeste' ? 'h_av_teste' : 'h_av_agora'); if(b){ b.disabled = true; b.textContent = 'Enviando...'; }
  homeAvisosApi('avisos', c).then(function(){ return homeAvisosApi(acao); })
    .then(function(j){ toast(acao === 'avisosTeste' ? 'Mensagem de teste enviada' : 'Agenda enviada: ' + (j.pendentes || 0) + ' pendente(s) hoje, ' + (j.atrasadas || 0) + ' atrasada(s)', 'ok'); },
          function(e){ toast(e.message, 'err'); })
    .then(function(){ if(b){ b.disabled = false; b.textContent = acao === 'avisosTeste' ? 'Enviar teste' : 'Receber agora'; } });
}

