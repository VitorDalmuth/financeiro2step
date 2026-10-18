/* ============================================================
   2STEP · REGISTROS DE CLIENTES
   Um texto livre por cliente com o que foi levantado no onboarding
   (regiões, serviços, público, diferenciais) para usar nas
   campanhas. Entra no módulo Operacional, para admin e operação.
   Depende de app.js (S, DB, MEM, EMAIL, PAPEL, MODULOS, ouve, save,
   del, render, modal, fecha, esc, dLabel, toast, listaClientes,
   ativoHoje, $).
   Dados novos ficam só em 2step_financeiro/registros/{clienteId}.
   ============================================================ */

var REG = { r: {}, ligado: false, busca: '', base: '' };

var REG_MODELO = 'REGIÕES DE ATENDIMENTO\n- \n\n' +
  'SERVIÇOS OFERECIDOS\n- \n\n' +
  'PÚBLICO E TICKET\n- \n\n' +
  'DIFERENCIAIS\n- \n\n' +
  'O QUE NÃO FAZER / RESTRIÇÕES\n- \n\n' +
  'OUTRAS INFORMAÇÕES\n- ';

/* ---------- dados ---------- */
function regLiga(){
  if(REG.ligado || MEM || !DB || PAPEL === 'sem-acesso') return;
  REG.ligado = true;
  ouve('registros', function(v){ REG.r = v; });
}
function regNorm(s){ return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
/* registros de clientes que ainda existem no financeiro */
function regLista(){
  return Object.keys(REG.r).map(function(k){ return REG.r[k]; })
    .filter(function(r){ return r && S.clientes[r.clienteId]; })
    .sort(function(a, b){ return String(S.clientes[a.clienteId].nome).localeCompare(String(S.clientes[b.clienteId].nome), 'pt-BR'); });
}
function regSemRegistro(){
  return listaClientes().filter(function(c){ return ativoHoje(c) && !(REG.r[c.id] && String(REG.r[c.id].texto || '').trim()); })
    .sort(function(a, b){ return String(a.nome).localeCompare(String(b.nome), 'pt-BR'); });
}

/* rascunho local: se a janela fechar sem salvar, o texto não se perde */
function regRascunhoChave(id){ return '2step_reg_rascunho_' + id; }
function regRascunhoLer(id){ try{ return JSON.parse(localStorage.getItem(regRascunhoChave(id)) || 'null'); }catch(e){ return null; } }
function regRascunhoGravar(id, texto){ try{ localStorage.setItem(regRascunhoChave(id), JSON.stringify({ texto: texto, em: new Date().toISOString() })); }catch(e){} }
function regRascunhoApagar(id){ try{ localStorage.removeItem(regRascunhoChave(id)); }catch(e){} }

/* ---------- tela ---------- */
function vReg(){
  regLiga();
  var todos = regLista();
  var q = regNorm(REG.busca).trim();
  var lista = !q ? todos : todos.filter(function(r){
    return regNorm(S.clientes[r.clienteId].nome + ' ' + r.texto).indexOf(q) > -1;
  });
  var sem = regSemRegistro();

  var cards = lista.map(function(r){
    var c = S.clientes[r.clienteId];
    var txt = String(r.texto || '').trim();
    var linhas = txt.split('\n').filter(function(l){ return l.trim(); });
    var trecho = linhas.slice(0, 4).join('\n');
    /* na busca, mostra a linha onde a palavra aparece */
    if(q){
      var achada = linhas.filter(function(l){ return regNorm(l).indexOf(q) > -1; })[0];
      if(achada) trecho = achada;
    }
    var st = c.status === 'encerrado' ? ' <span class="pill p-off" style="font-size:10px">encerrado</span>'
           : (c.status === 'aviso' ? ' <span class="pill p-av" style="font-size:10px">em aviso</span>' : '');
    return '<button class="pc" onclick="mReg(\'' + c.id + '\')">' +
      '<div class="pc-n">' + esc(c.nome) + st + '</div>' +
      '<div class="pc-s">' + (r.atualizadoEm ? 'Atualizado em ' + dLabel(String(r.atualizadoEm).slice(0, 10)) + (r.atualizadoPor ? ' por ' + esc(String(r.atualizadoPor).split('@')[0]) : '') : '') + '</div>' +
      '<div style="margin-top:10px;font-size:12px;color:var(--mute);line-height:1.5;white-space:pre-wrap;max-height:76px;overflow:hidden">' +
        (trecho ? esc(trecho) : '<i>Sem anotações ainda</i>') + '</div>' +
      '</button>';
  }).join('');

  return '' +
  '<div class="hd"><div><h1>Registros de clientes</h1><p>O que coletamos no onboarding, guardado para usar nas campanhas</p></div>' +
  '<div class="hd-act"><input class="sr" placeholder="Buscar cliente ou palavra no texto" value="' + esc(REG.busca) + '" oninput="regBusca(this.value)">' +
  '<button class="btn btn-p" onclick="mRegNovo()">+ Novo registro</button></div></div>' +

  (sem.length && !q ? '<div class="note">' + sem.length + ' cliente(s) ativo(s) ainda sem registro: ' +
    sem.slice(0, 8).map(function(c){ return '<b style="cursor:pointer;text-decoration:underline" onclick="mReg(\'' + c.id + '\')">' + esc(c.nome) + '</b>'; }).join(', ') +
    (sem.length > 8 ? ' e outros' : '') + '.</div>' : '') +

  (lista.length ? '<div class="pg">' + cards + '</div>' :
    '<div class="tw"><div class="empty"><b>' + (q ? 'Nada encontrado' : 'Nenhum registro ainda') + '</b>' +
    (q ? 'Nenhum cliente ou texto bate com essa busca.' : 'Depois da reunião de onboarding, clique em <b style="display:inline;font-size:13px">+ Novo registro</b>, escolha o cliente e anote tudo o que for útil para as campanhas.') + '</div></div>');
}
function regBusca(v){
  REG.busca = v; render();
  var e = document.querySelector('#main .sr');
  if(e){ e.focus(); e.setSelectionRange(v.length, v.length); }
}

/* ---------- novo: escolher o cliente ---------- */
function mRegNovo(){
  var cs = listaClientes().filter(function(c){ return c.status !== 'encerrado' && !(REG.r[c.id] && String(REG.r[c.id].texto || '').trim()); })
    .sort(function(a, b){ return String(a.nome).localeCompare(String(b.nome), 'pt-BR'); });
  if(!cs.length) return toast('Todos os clientes ativos já têm registro', 'ok');
  modal('Novo registro',
    '<div class="fg"><label class="fl">Cliente</label><select class="fi" id="r_cli">' +
      '<option value="">Escolha o cliente</option>' +
      cs.map(function(c){ return '<option value="' + esc(c.id) + '">' + esc(c.nome) + (c.status === 'aviso' ? ' (em aviso)' : '') + '</option>'; }).join('') +
    '</select><div class="hint">A lista mostra os clientes cadastrados no financeiro que ainda não têm registro.</div></div>',
    '<button class="btn" onclick="fecha()">Cancelar</button>' +
    '<button class="btn btn-p" onclick="var v=$(\'r_cli\').value; if(!v) return toast(\'Escolha o cliente\',\'err\'); mReg(v)">Continuar</button>');
}

/* ---------- editar o texto ---------- */
function mReg(id){
  var c = S.clientes[id];
  if(!c) return;
  var r = REG.r[id] || {};
  var salvo = String(r.texto || '');
  var rasc = regRascunhoLer(id);
  var temRasc = rasc && rasc.texto !== salvo && String(rasc.texto || '').trim();
  REG.base = r.atualizadoEm || '';

  modal('Registro · ' + esc(c.nome),
    (temRasc ? '<div class="note flx sp" id="r_rasc" style="flex-wrap:wrap">Você tem um texto não salvo deste cliente, de ' + dLabel(String(rasc.em).slice(0, 10)) + '.' +
      '<span class="flx" style="gap:6px"><button class="btn btn-s" onclick="regDescartaRascunho(\'' + id + '\')">Descartar</button>' +
      '<button class="btn btn-s btn-p" onclick="regRecuperaRascunho(\'' + id + '\')">Recuperar</button></span></div>' : '') +
    '<div class="flx sp" style="margin-bottom:8px"><span class="fl" style="margin:0">Anotações</span>' +
      (salvo.trim() ? '' : '<button class="btn btn-s" id="r_mod" onclick="regModelo()">Usar modelo de onboarding</button>') + '</div>' +
    '<textarea class="fi" id="r_txt" style="min-height:52vh;line-height:1.6;font-size:13.5px" ' +
      'placeholder="Regiões de atendimento, serviços oferecidos, público, diferenciais, o que evitar nas campanhas..." ' +
      'oninput="regRascunhoGravar(\'' + id + '\', this.value)">' + esc(salvo) + '</textarea>' +
    '<div class="hint">' + (r.atualizadoEm ? 'Última alteração em ' + dLabel(String(r.atualizadoEm).slice(0, 10)) + (r.atualizadoPor ? ' por ' + esc(r.atualizadoPor) : '') + '. ' : '') +
      'Organize do seu jeito: títulos em maiúsculas e tópicos com hífen ajudam a achar as coisas depois.</div>',
    (salvo.trim() ? '<button class="btn btn-d" onclick="regExcluir(\'' + id + '\')">Excluir</button>' : '') +
    '<button class="btn" onclick="fecha()">Fechar</button>' +
    '<button class="btn btn-p" onclick="regSalvar(\'' + id + '\')">Salvar</button>', true);
  setTimeout(function(){ var e = $('r_txt'); if(e && !salvo.trim()) e.focus(); }, 60);
}
function regModelo(){
  var e = $('r_txt');
  if(!e) return;
  if(e.value.trim() && !confirm('Substituir o texto atual pelo modelo?')) return;
  e.value = REG_MODELO;
  var b = $('r_mod'); if(b) b.remove();
  e.focus(); e.setSelectionRange(e.value.indexOf('- ') + 2, e.value.indexOf('- ') + 2);
}
function regRecuperaRascunho(id){
  var rasc = regRascunhoLer(id);
  if(rasc) $('r_txt').value = rasc.texto;
  var n = $('r_rasc'); if(n) n.remove();
  toast('Texto recuperado. Clique em Salvar para guardar.');
}
function regDescartaRascunho(id){
  regRascunhoApagar(id);
  var n = $('r_rasc'); if(n) n.remove();
}
function regSalvar(id){
  var texto = $('r_txt').value.replace(/\s+$/, '');
  var atual = REG.r[id] || {};
  /* alguém salvou este mesmo registro enquanto a janela estava aberta */
  if((atual.atualizadoEm || '') !== REG.base){
    if(!confirm((atual.atualizadoPor || 'Outra pessoa') + ' salvou este registro enquanto você editava.\n\n' +
      'OK: salvar o seu texto por cima do dela.\nCancelar: voltar e copiar o seu texto antes de recarregar.')) return;
  }
  var r = { clienteId: id, texto: texto, atualizadoEm: new Date().toISOString(), atualizadoPor: EMAIL || '' };
  REG.r[id] = r;
  REG.base = r.atualizadoEm;
  save('registros/' + id, r);
  regRascunhoApagar(id);
  fecha(); render();
  toast('Registro salvo', 'ok');
}
function regExcluir(id){
  var c = S.clientes[id];
  if(!confirm('Apagar todo o registro de ' + (c ? c.nome : 'este cliente') + '?\n\nO texto some para todo mundo. O cliente continua cadastrado.')) return;
  delete REG.r[id];
  del('registros/' + id);
  regRascunhoApagar(id);
  fecha(); render();
  toast('Registro apagado');
}

/* ---------- registro no menu: Operacional › Registros de clientes ---------- */
(function(){
  var m = MODULOS.filter(function(x){ return x.id === 'mid'; })[0];
  if(m) m.telas.push({ v:'reg', n:'Registros de clientes', f:function(){ return vReg(); } });
})();
