/* ============================================================
   2STEP · CHECKLIST SEMANAL, ROTINA DE RELATÓRIOS E RESPONSÁVEIS
   - Checklist da semana dentro do relatório: o que a 2STEP fez, o que
     o cliente precisa fazer e o próximo passo. Vira uma imagem PNG para
     mandar junto com a do relatório (envio manual, duas imagens).
   - Rotina de segunda: para cada cliente dos Relatórios, "Enviar
     relatório", "Enviar checklist" e "Enviar áudio". As duas primeiras
     se marcam sozinhas quando as imagens são baixadas.
   - Responsáveis por frente (social media, tráfego, relatórios), usados
     na agenda de cada pessoa na Home.
   Depende de app.js, de relatorios.js (REL, relLiga, relSem, relNome,
   relUpd, relPlats, relPeriodoTexto, relPeriodoDe, relDesenha, relExporta,
   relRR, relCabe, relImg, REL_COR) e de tarefas.js (TAR, tarLiga, tarD,
   tarDoDia, tarHoje, tarDow).
   Dados:
     relatorios/semanas/{cliente}/{segunda}/checklist  -> o checklist
     relatorios/rotina/{data}/{cliente}_{item}         -> tarefa da rotina feita
     relatorios/clientes/{cliente}/responsavel         -> responsável da rotina
     tarefas/config/responsaveis                       -> { social, trafego, relatorios, inicioRotina }
   ============================================================ */

var CK = { d: null, id: '', ini: '', rotina: {}, ligado: false };
var CK_ST = { ok: 'Concluído', and: 'Em andamento', pen: 'Pendente' };
var CK_ORDEM = ['ok', 'and', 'pen'];
var CK_ROTINA = [['relatorio', 'Enviar relatório'], ['checklist', 'Enviar checklist'], ['audio', 'Enviar áudio']];
var CK_FRENTES = [['relatorios', 'Rotina de relatórios (segunda)'], ['trafego', 'Tarefas de tráfego'], ['social', 'Tarefas de social media']];

/* estilos só deste módulo */
(function(){
  var css = '' +
  '.ck-sec{margin-bottom:16px}' +
  '.ck-row{display:flex;gap:8px;align-items:center;margin-bottom:8px}' +
  '.ck-row .fi{flex:1;min-width:0}' +
  '.ck-ic{width:40px;height:40px;border-radius:9px;border:1px solid var(--line);background:var(--slab2);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:18px}' +
  '.ck-ic i{width:18px;height:18px;border-radius:50%;display:block}' +
  '.ck-del{width:34px;height:40px;color:var(--mute);font-size:16px;flex-shrink:0}.ck-del:hover{color:var(--coral)}' +
  '.ck-add{width:100%;padding:9px;border:1px solid var(--line);border-radius:8px;background:var(--slab2);font-weight:600;font-size:13px}.ck-add:hover{border-color:var(--line2)}' +
  '.ck-tit{font-family:var(--disp);font-weight:700;font-size:14px;margin-bottom:8px;display:flex;align-items:center;gap:6px}' +
  '.ck-tit input{background:none;border:none;border-bottom:1px dashed var(--line2);color:var(--ink);font:inherit;padding:2px 0;min-width:0;flex:1}' +
  '.ck-req{color:var(--coral)}' +
  '.ck-av{border-color:rgba(251,191,36,.45) !important;background:rgba(251,191,36,.06) !important}';
  var s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
})();

/* ---------- dados ---------- */
function ckLiga(){
  if(CK.ligado || MEM || !DB || PAPEL === 'sem-acesso') return;
  CK.ligado = true;
  /* só as últimas semanas da rotina: o histórico antigo não precisa vir */
  DB.ref(ROOT + '/relatorios/rotina').orderByKey().startAt(addDias(tarHoje(), -21)).on('value', function(snap){
    CK.rotina = snap.val() || {}; render();
  }, function(){});
}
function ckResp(){ return ((tarD('social').config || {}).responsaveis) || {}; }
function ckUsuarios(){
  return Object.keys(S.usuarios || {}).map(function(k){ var u = S.usuarios[k] || {}; return { k: k, nome: u.nome || String(u.email || k).split('@')[0], papel: u.papel }; })
    .sort(function(a, b){ return String(a.nome).localeCompare(String(b.nome), 'pt-BR'); });
}
function ckNomeUsuario(k){ var u = (S.usuarios || {})[k]; return u ? (u.nome || String(u.email).split('@')[0]) : ''; }

/* ---------- checklist: montar o rascunho ---------- */
function ckSemana(id, ini){ return relSem(id, ini) || {}; }
function ckPeriodo(s, ini){ return { de: (s.proprio && s.de) || ini, ate: (s.proprio && s.ate) || addDias(ini, 6) }; }
/* o que foi concluído nas Tarefas (tráfego e social) para esse cliente no período */
function ckFeitasNoPeriodo(id, de, ate){
  tarLiga('social'); tarLiga('trafego');
  var cont = {}, ordem = [];
  ['trafego', 'social'].forEach(function(q){
    for(var d = de, g = 0; d <= ate && g < 70; d = addDias(d, 1), g++){
      tarDoDia(d, q).forEach(function(t){
        if(t.clienteId !== id || !t.feita) return;
        var k = t.titulo.trim();
        if(!cont[k]){ cont[k] = 0; ordem.push(k); }
        cont[k]++;
      });
    }
  });
  return ordem.map(function(k){ return cont[k] > 1 ? k + ' (' + cont[k] + 'x)' : k; });
}
/* o que o cliente ainda não fez no checklist da semana anterior continua */
function ckPendentesAnteriores(id, ini){
  var ant = (ckSemana(id, addDias(ini, -7)).checklist || {}).cliente || [];
  return ant.filter(function(x){ return x && x.t && x.s !== 'ok'; }).map(function(x){ return { s: x.s, t: x.t }; });
}
function ckNovo(id, ini){
  var s = ckSemana(id, ini), p = ckPeriodo(s, ini);
  var feitas = ckFeitasNoPeriodo(id, p.de, p.ate);
  var cli = ckPendentesAnteriores(id, ini);
  return {
    dataHora: '', intro: 'Checklist de Tarefas Semanal', aviso: '',
    tituloCliente: (REL.cfg[id] || {}).tituloChecklist || relNome(id),
    nos: feitas.length ? feitas.map(function(t){ return { s: 'ok', t: t }; }) : [{ s: 'ok', t: '' }],
    cliente: cli.length ? cli : [{ s: 'pen', t: '' }],
    proximos: [{ t: '' }],
    preenchido: { tarefas: feitas.length, pendentes: cli.length }
  };
}
function ckLista(a){ return (Array.isArray(a) ? a : Object.keys(a || {}).sort(function(x, y){ return x - y; }).map(function(k){ return a[k]; })).filter(Boolean); }
function ckDados(id, ini){
  var c = ckSemana(id, ini).checklist;
  if(!c) return null;
  return { dataHora: c.dataHora || '', intro: c.intro || '', aviso: c.aviso || '', tituloCliente: c.tituloCliente || relNome(id),
           nos: ckLista(c.nos), cliente: ckLista(c.cliente), proximos: ckLista(c.proximos), enviadoEm: c.enviadoEm || '', salvoEm: c.salvoEm || '' };
}

/* ---------- formulário (igual ao da outra ferramenta) ---------- */
function ckAgora(){ var d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); }
function mCkEditar(id, ini){
  CK.id = id; CK.ini = ini;
  var atual = ckDados(id, ini);
  CK.d = atual ? JSON.parse(JSON.stringify(atual)) : ckNovo(id, ini);
  if(!CK.d.dataHora) CK.d.dataHora = ckAgora();
  if(!CK.d.nos.length) CK.d.nos.push({ s: 'ok', t: '' });
  if(!CK.d.cliente.length) CK.d.cliente.push({ s: 'pen', t: '' });
  if(!CK.d.proximos.length) CK.d.proximos.push({ t: '' });
  mCkRender();
}
function ckIconeHTML(s){ return { ok: '🟢', and: '⏳', pen: '🔴' }[s] || '🟢'; }
function ckLinhas(sec, comStatus){
  return CK.d[sec].map(function(it, i){
    return '<div class="ck-row">' +
      (comStatus ? '<button type="button" class="ck-ic" title="' + CK_ST[it.s] + ' (clique para trocar)" onclick="ckTroca(\'' + sec + '\',' + i + ')">' + ckIconeHTML(it.s) + '</button>'
                 : '<span class="ck-ic">🎯</span>') +
      '<input class="fi" value="' + esc(it.t) + '" maxlength="200" placeholder="Descreva o item..." oninput="CK.d.' + sec + '[' + i + '].t=this.value">' +
      '<button type="button" class="ck-del" title="Tirar" onclick="CK.d.' + sec + '.splice(' + i + ',1);mCkRender()">🗑</button></div>';
  }).join('') +
  '<button type="button" class="ck-add" onclick="CK.d.' + sec + '.push(' + (comStatus ? '{s:\'' + (sec === 'nos' ? 'ok' : 'pen') + '\',t:\'\'}' : '{t:\'\'}') + ');mCkRender()">＋ Adicionar item</button>';
}
function mCkRender(){
  var d = CK.d;
  var pre = d.preenchido && (d.preenchido.tarefas || d.preenchido.pendentes)
    ? '<div class="note" style="background:var(--volt-dim);border-color:rgba(124,92,255,.35);color:#c4b5fd">Já vem preenchido com ' +
      [d.preenchido.tarefas ? d.preenchido.tarefas + ' tarefa(s) concluída(s) no período' : '', d.preenchido.pendentes ? d.preenchido.pendentes + ' pendência(s) do cliente da semana passada' : ''].filter(Boolean).join(' e ') +
      '. Revise antes de salvar.</div>' : '';
  modal('Checklist da semana · ' + esc(relNome(CK.id)),
    '<div class="hint" style="margin:0 0 14px">Preencha as seções da atualização semanal para o cliente. Clique na bolinha para trocar o status.</div>' + pre +
    '<div class="fg"><label class="fl">Data/hora</label><input type="datetime-local" class="fi" value="' + esc(d.dataHora) + '" oninput="CK.d.dataHora=this.value"></div>' +
    '<div class="fg"><label class="fl">Introdução (opcional)</label><textarea class="fi" placeholder="Texto de introdução..." oninput="CK.d.intro=this.value">' + esc(d.intro) + '</textarea></div>' +
    '<div class="fg"><label class="fl">⚠️ Aviso (opcional)</label><textarea class="fi ck-av" placeholder="Avisos importantes..." oninput="CK.d.aviso=this.value">' + esc(d.aviso) + '</textarea></div>' +
    '<div class="ck-sec"><div class="ck-tit">2STEP MIDIA <span class="ck-req">*</span></div>' + ckLinhas('nos', true) + '</div>' +
    '<div class="ck-sec"><div class="ck-tit"><input value="' + esc(d.tituloCliente) + '" maxlength="60" title="Nome que aparece na imagem" oninput="CK.d.tituloCliente=this.value"> <span style="font-size:11px;color:var(--mute2);font-weight:500">✎</span></div>' + ckLinhas('cliente', true) +
      '<div class="hint">O que o cliente precisa fazer. O que não estiver 🟢 passa para o checklist da semana seguinte.</div></div>' +
    '<div class="ck-sec"><div class="ck-tit">Próximo Passo <span class="ck-req">*</span></div>' + ckLinhas('proximos', false) + '</div>' +
    '<div class="hint">Status: 🟢 concluído · ⏳ em andamento · 🔴 pendente.</div>',
    '<button class="btn" onclick="fecha()">Cancelar</button><button class="btn btn-p" onclick="ckSalvar()">Salvar checklist</button>', true);
}
function ckTroca(sec, i){
  var it = CK.d[sec][i];
  it.s = CK_ORDEM[(CK_ORDEM.indexOf(it.s) + 1) % CK_ORDEM.length];
  mCkRender();
}
function ckSalvar(){
  var d = CK.d;
  function limpa(l, comS){ return l.map(function(x){ var t = String(x.t || '').trim(); return t ? (comS ? { s: x.s || 'ok', t: t } : { t: t }) : null; }).filter(Boolean); }
  var nos = limpa(d.nos, true), cli = limpa(d.cliente, true), prox = limpa(d.proximos, false);
  if(!nos.length) return toast('Escreva pelo menos um item em 2STEP MIDIA', 'err');
  if(!prox.length) return toast('Escreva pelo menos um próximo passo', 'err');
  var antes = ckDados(CK.id, CK.ini) || {};
  var c = { dataHora: d.dataHora || ckAgora(), intro: String(d.intro || '').trim(), aviso: String(d.aviso || '').trim(),
            tituloCliente: String(d.tituloCliente || '').trim() || relNome(CK.id),
            nos: nos, cliente: cli, proximos: prox, salvoEm: new Date().toISOString(), salvoPor: EMAIL || '' };
  if(antes.enviadoEm) c.enviadoEm = antes.enviadoEm;
  relUpd('semanas/' + CK.id + '/' + CK.ini, { checklist: c });
  /* lembra o nome da seção do cliente para as próximas semanas */
  if(c.tituloCliente !== ((REL.cfg[CK.id] || {}).tituloChecklist || relNome(CK.id))){
    REL.cfg[CK.id].tituloChecklist = c.tituloCliente;
    relUpd('clientes/' + CK.id, { tituloChecklist: c.tituloCliente });
  }
  fecha(); render(); toast('Checklist salvo', 'ok');
}

/* ---------- imagem do checklist (canvas, mesmo visual do relatório) ---------- */
function ckQuebra(ctx, txt, larg){
  var out = [];
  String(txt || '').split(/\r?\n/).forEach(function(par){
    var pal = par.split(/\s+/).filter(Boolean), linha = '';
    if(!pal.length){ out.push(''); return; }
    pal.forEach(function(p){
      var tenta = linha ? linha + ' ' + p : p;
      if(ctx.measureText(tenta).width <= larg || !linha) linha = tenta;
      else{ out.push(linha); linha = p; }
      /* palavra maior que a linha: corta */
      while(ctx.measureText(linha).width > larg && linha.length > 1){
        var k = linha.length;
        while(k > 1 && ctx.measureText(linha.slice(0, k)).width > larg) k--;
        out.push(linha.slice(0, k)); linha = linha.slice(k);
      }
    });
    if(linha) out.push(linha);
  });
  return out;
}
/* Mesmo padrão da imagem que a 2STEP já manda aos clientes: cartão claro,
   "data | dia da semana", "Atualização semanal", seções em maiúsculas com
   linha embaixo e os ícones 🟢 🔴 ⏳ 🎯. Desenhada em 2x para ficar nítida. */
var CK_EMOJI = { ok: '🟢', pen: '🔴', and: '⏳', alvo: '🎯' };
var CK_DIAS = ['Domingo', 'Segunda-Feira', 'Terça-Feira', 'Quarta-Feira', 'Quinta-Feira', 'Sexta-Feira', 'Sábado'];
function ckTitulo(dh){
  var d = String(dh || '').slice(0, 10) || tarHoje(), p = d.split('-');
  return p[2] + '/' + p[1] + '/' + p[0] + ' | ' + CK_DIAS[new Date(d + 'T12:00:00').getDay()];
}
function ckDesenha(id, ini){
  var d = ckDados(id, ini);
  var FONTE = "'Plus Jakarta Sans', 'Segoe UI', Arial, sans-serif";
  var EMOJI = "'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif";
  var fontes = document.fonts && document.fonts.load ? Promise.all([
    document.fonts.load('400 16px "Plus Jakarta Sans"'), document.fonts.load('600 16px "Plus Jakarta Sans"'), document.fonts.load('700 16px "Plus Jakarta Sans"')
  ]).catch(function(){}) : Promise.resolve();
  return fontes.then(function(){
    var K = 2, W = 700, PX = 30, TX = 61, LARG = W - TX - PX;
    var secoes = [
      { tit: '2STEP MIDIA', itens: d.nos },
      { tit: d.tituloCliente, itens: d.cliente },
      { tit: 'PRÓXIMO PASSO', itens: d.proximos.map(function(x){ return { s: 'alvo', t: x.t }; }) }
    ].filter(function(x){ return x.itens.length; });

    /* duas passadas: a primeira mede a altura, a segunda desenha */
    function desenha(ctx, pinta){
      var y = 0;
      function linha(y0){ if(pinta){ ctx.fillStyle = '#E3E3E3'; ctx.fillRect(PX, y0, W - 2 * PX, 1); } }
      function texto(t, x, yb, fonte, cor){ if(pinta){ ctx.font = fonte; ctx.fillStyle = cor; ctx.fillText(t, x, yb); } }

      if(pinta){
        ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, ctx.canvas.height / K);
        ctx.fillStyle = '#F7F7F7'; relRR(ctx, 0.5, 0.5, W - 1, ctx.canvas.height / K - 1, 12); ctx.fill();
        ctx.strokeStyle = '#E6E6E6'; ctx.lineWidth = 1; ctx.stroke();
      }
      ctx.textBaseline = 'alphabetic';
      texto(ckTitulo(d.dataHora), PX, 44, '700 19px ' + FONTE, '#1F1F1F');
      texto('Atualização semanal', PX, 73, '400 15px ' + FONTE, '#6B6B6B');
      linha(97);
      y = 97;

      if(d.intro){
        ctx.font = '400 16px ' + FONTE;
        y += 14;
        ckQuebra(ctx, d.intro, W - 2 * PX).forEach(function(l){ y += 27; texto(l, PX, y, '400 16px ' + FONTE, '#222222'); });
      }
      if(d.aviso){
        ctx.font = '600 15px ' + FONTE;
        var la = ckQuebra(ctx, '⚠️ ' + d.aviso, W - 2 * PX - 28), ha = la.length * 23 + 22;
        y += 18;
        if(pinta){ ctx.fillStyle = '#FFF6DB'; relRR(ctx, PX, y, W - 2 * PX, ha, 8); ctx.fill(); ctx.strokeStyle = '#F2D27A'; ctx.lineWidth = 1; ctx.stroke(); }
        la.forEach(function(l, i){ texto(l, PX + 14, y + 27 + i * 23, '600 15px ' + FONTE, '#7A5300'); });
        y += ha;
      }

      secoes.forEach(function(sec){
        y += 50;
        ctx.font = '700 15px ' + FONTE;
        var tit = String(sec.tit || '').toUpperCase() + ':';
        var tamT = 15;
        while(tamT > 11 && ctx.measureText(tit).width > W - 2 * PX){ tamT--; ctx.font = '700 ' + tamT + 'px ' + FONTE; }
        texto(tit, PX, y, '700 ' + tamT + 'px ' + FONTE, '#1F1F1F');
        y += 10; linha(y);
        y += 1;
        ctx.font = '400 16px ' + FONTE;
        sec.itens.forEach(function(it, i){
          var ls = ckQuebra(ctx, it.t, LARG);
          y += i ? 33 : 27;
          if(pinta){ ctx.font = '16px ' + EMOJI; ctx.fillStyle = '#000000'; ctx.fillText(CK_EMOJI[it.s] || CK_EMOJI.ok, PX + 1, y); }
          ls.forEach(function(l, k){ texto(l, TX, y + k * 24, '400 16px ' + FONTE, '#222222'); });
          y += (ls.length - 1) * 24;
        });
      });
      return y + 35;
    }
    var med = document.createElement('canvas').getContext('2d');
    var H = Math.ceil(desenha(med, false));
    var cv = document.createElement('canvas'); cv.width = W * K; cv.height = H * K;
    var ctx = cv.getContext('2d'); ctx.scale(K, K);
    desenha(ctx, true);
    return cv;
  });
}
function ckNomeArquivo(id, ini, tipo){
  return tipo + '-' + relNome(id).normalize('NFD').replace(/[^\w]+/g, '-').replace(/-+/g, '-').toLowerCase().replace(/^-|-$/g, '') + '-' + ini + '.png';
}
function ckBlob(cv){ return new Promise(function(ok){ cv.toBlob(ok, 'image/png'); }); }
function ckBaixaBlob(b, nome){
  var a = document.createElement('a');
  a.href = URL.createObjectURL(b); a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function(){ URL.revokeObjectURL(a.href); }, 4000);
}
function ckMarcaEnviado(id, ini){
  var s = relSem(id, ini);
  var v = new Date().toISOString();
  if(s && s.checklist) s.checklist.enviadoEm = v;
  relUpd('semanas/' + id + '/' + ini, { 'checklist/enviadoEm': v });
}
function ckBaixar(id){
  var ini = REL.semana;
  if(!ckDados(id, ini)) return toast('Preencha o checklist primeiro', 'err');
  ckDesenha(id, ini).then(ckBlob).then(function(b){
    ckBaixaBlob(b, ckNomeArquivo(id, ini, 'checklist'));
    ckMarcaEnviado(id, ini); render();
    toast('Checklist baixado', 'ok');
  });
}
/* as duas imagens: relatório primeiro, checklist em seguida */
function ckBaixarAmbas(id){
  var ini = REL.semana;
  if(!ckDados(id, ini)) return toast('Preencha o checklist primeiro', 'err');
  relExporta(id);
  setTimeout(function(){ ckBaixar(id); }, 700);
}
/* no celular: manda as duas de uma vez para o WhatsApp pelo compartilhar do sistema */
function ckCompartilhar(id){
  var ini = REL.semana;
  if(!ckDados(id, ini)) return toast('Preencha o checklist primeiro', 'err');
  Promise.all([relDesenha(id, ini).then(ckBlob), ckDesenha(id, ini).then(ckBlob)]).then(function(bs){
    var fs = [new File([bs[0]], ckNomeArquivo(id, ini, 'relatorio'), { type: 'image/png' }), new File([bs[1]], ckNomeArquivo(id, ini, 'checklist'), { type: 'image/png' })];
    if(!(navigator.canShare && navigator.canShare({ files: fs }))) return toast('Este navegador não compartilha duas imagens. Use "Baixar as duas".', 'err');
    navigator.share({ files: fs, title: 'Relatório ' + relNome(id) }).then(function(){
      relUpd('semanas/' + id + '/' + ini, { enviadoEm: new Date().toISOString() });
      ckMarcaEnviado(id, ini); render();
    }, function(){});
  });
}

/* ---------- card dentro do relatório (chamado por relatorios.js) ---------- */
function relChecklistHTML(id, ini){
  var d = ckDados(id, ini);
  var podeShare = !!(navigator.canShare && window.File);
  if(d) setTimeout(function(){ ckPreview(id, ini); }, 0);
  var pill = !d ? '<span class="pill p-off">não preenchido</span>' : (d.enviadoEm ? '<span class="pill p-on">baixado em ' + dLabel(d.enviadoEm.slice(0, 10)) + '</span>' : '<span class="pill p-av">preenchido</span>');
  var resumo = d ? '<div style="font-size:13px;line-height:1.8">' +
      '<div><span style="color:var(--mute)">2STEP MIDIA:</span> ' + d.nos.length + ' item(ns)</div>' +
      '<div><span style="color:var(--mute)">' + esc(d.tituloCliente) + ':</span> ' + d.cliente.length + ' item(ns)' +
        (d.cliente.filter(function(x){ return x.s !== 'ok'; }).length ? ' · <b class="warn">' + d.cliente.filter(function(x){ return x.s !== 'ok'; }).length + ' pendente(s)</b>' : '') + '</div>' +
      '<div><span style="color:var(--mute)">Próximo passo:</span> ' + d.proximos.length + ' item(ns)</div></div>'
    : '<div style="font-size:13px;color:var(--mute);line-height:1.6">O que a 2STEP fez na conta nesse período, o que o cliente precisa fazer e o próximo passo. Vira uma segunda imagem para mandar junto com a do relatório.</div>';
  return '<div class="tw mt18"><div class="tw-hd"><div class="tw-t">Checklist da semana</div>' + pill + '</div>' +
    '<div class="rel-g" style="padding:14px">' +
      '<div>' + (d ? '<img id="ckImg" class="rel-img" alt="Prévia do checklist">' : '<div class="empty" style="background:var(--slab2);border-radius:12px"><b>Checklist ainda não preenchido</b>Ele já vem com as tarefas concluídas no período.</div>') + '</div>' +
      '<div>' + resumo +
        '<div class="flx mt18" style="gap:8px">' +
          '<button class="btn' + (d ? '' : ' btn-p') + '" onclick="mCkEditar(\'' + esc(id) + '\',\'' + ini + '\')">' + (d ? 'Editar checklist' : 'Preencher checklist') + '</button>' +
          (d ? '<button class="btn" onclick="ckBaixar(\'' + esc(id) + '\')">Baixar checklist</button>' : '') + '</div>' +
        (d ? '<div class="flx mt12" style="gap:8px">' +
          '<button class="btn btn-p" onclick="ckBaixarAmbas(\'' + esc(id) + '\')">Baixar as duas imagens</button>' +
          (podeShare ? '<button class="btn" onclick="ckCompartilhar(\'' + esc(id) + '\')">Compartilhar as duas</button>' : '') + '</div>' +
          '<div class="hint mt12">Baixar marca na Home as tarefas "Enviar relatório" e "Enviar checklist" deste cliente. No celular, "Compartilhar as duas" abre o WhatsApp direto. Se o navegador perguntar, permita baixar vários arquivos.</div>' : '') +
      '</div></div></div>';
}
function ckPreview(id, ini){
  if(!$('ckImg')) return;
  ckDesenha(id, ini).then(function(cv){ var el = $('ckImg'); if(el) el.src = cv.toDataURL('image/png'); });
}

/* ---------- rotina de segunda (relatórios) ---------- */
function ckRotinaInicio(){ return ckResp().inicioRotina || ''; }
function ckClientesRotina(){
  return Object.keys(REL.cfg || {}).filter(function(id){
    var c = REL.cfg[id], cli = S.clientes[id];
    return c && cli && cli.status !== 'encerrado' && relPlats(c).length;
  });
}
/* tarefas da rotina num dia (só segunda, a partir do início da rotina) */
function ckRotinaDoDia(data){
  var ini = ckRotinaInicio();
  if(!ini || data < ini || tarDow(data) !== 1) return [];
  ckLiga(); relLiga();
  var sem = addDias(data, -7), feitas = CK.rotina[data] || {}, padrao = ckResp().relatorios || '';
  var out = [];
  ckClientesRotina().forEach(function(id){
    var s = relSem(id, sem) || {}, resp = (REL.cfg[id] || {}).responsavel || padrao;
    CK_ROTINA.forEach(function(it){
      var ch = id + '_' + it[0], reg = feitas[ch] || null, auto = '';
      if(!reg && it[0] === 'relatorio' && s.enviadoEm) auto = s.enviadoEm;
      if(!reg && it[0] === 'checklist' && s.checklist && s.checklist.enviadoEm) auto = s.checklist.enviadoEm;
      out.push({ q: 'rel', chave: ch, item: it[0], clienteId: id, cliente: relNome(id), titulo: it[1], resp: resp,
                 feita: reg || (auto ? { em: auto, por: '', auto: true } : null) });
    });
  });
  return out;
}
function ckRotinaMarca(data, ch, feito, auto){
  if(auto && !feito) return toast('Marcada pelo download da imagem. Para desfazer, use o relatório da semana.', 'err');
  var f = CK.rotina[data] = CK.rotina[data] || {};
  if(feito) f[ch] = { em: new Date().toISOString(), por: EMAIL || '' }; else delete f[ch];
  render();
  if(MEM || !DB) return;
  var r = DB.ref(ROOT + '/relatorios/rotina/' + data + '/' + ch);
  (feito ? r.set(f[ch]) : r.remove()).then(function(){ if(feito) toast('Tarefa concluída', 'ok'); }, function(e){ toast(e.message, 'err'); });
}

/* ---------- responsáveis (só admin) ---------- */
function mCkResponsaveis(){
  if(!euSouAdmin()) return;
  tarLiga('social'); relLiga();
  var r = ckResp(), us = ckUsuarios();
  function sel(id, v, vazio){
    return '<select class="fi" id="' + id + '"><option value="">' + (vazio || 'Ninguém') + '</option>' +
      us.map(function(u){ return '<option value="' + esc(u.k) + '"' + (u.k === v ? ' selected' : '') + '>' + esc(u.nome) + '</option>'; }).join('') + '</select>';
  }
  var clis = ckClientesRotina().sort(function(a, b){ return relNome(a).localeCompare(relNome(b), 'pt-BR'); });
  modal('Responsáveis',
    '<div class="hint" style="margin:0 0 14px">Quem cuida de cada frente. As tarefas aparecem na agenda dessa pessoa, na Home.</div>' +
    CK_FRENTES.map(function(f){ return '<div class="fg"><label class="fl">' + f[1] + '</label>' + sel('ck_r_' + f[0], r[f[0]] || '') + '</div>'; }).join('') +
    (clis.length ? '<div class="fl mt18">Rotina de relatórios por cliente</div><div class="hint" style="margin:-2px 0 10px">Deixe em "Padrão" para usar o responsável da rotina acima.</div>' +
      clis.map(function(id){
        return '<div class="flx" style="flex-wrap:nowrap;margin-bottom:8px"><span style="flex:1;min-width:0;font-size:13px">' + esc(relNome(id)) + '</span>' +
          '<div style="width:52%">' + sel('ck_c_' + id, (REL.cfg[id] || {}).responsavel || '', 'Padrão') + '</div></div>';
      }).join('') : '<div class="hint">Os clientes aparecem aqui quando forem configurados em Relatórios.</div>') +
    '<div class="hint mt12">A rotina de segunda gera, para cada cliente dos Relatórios: Enviar relatório, Enviar checklist e Enviar áudio.</div>',
    '<button class="btn" onclick="fecha()">Cancelar</button><button class="btn btn-p" onclick="ckSalvaResponsaveis()">Salvar</button>', true);
}
function ckSalvaResponsaveis(){
  var r = Object.assign({}, ckResp());
  CK_FRENTES.forEach(function(f){ r[f[0]] = $('ck_r_' + f[0]).value; });
  /* a rotina começa no dia em que os responsáveis foram definidos: sem atrasadas antigas */
  if(!r.inicioRotina) r.inicioRotina = tarHoje();
  var D = tarD('social'); D.config = D.config || {}; D.config.responsaveis = r;
  if(!MEM && DB) DB.ref(ROOT + '/tarefas/config/responsaveis').set(r);
  ckClientesRotina().forEach(function(id){
    var e = $('ck_c_' + id); if(!e) return;
    var v = e.value || null, antes = (REL.cfg[id] || {}).responsavel || null;
    if(v !== antes){ if(v) REL.cfg[id].responsavel = v; else delete REL.cfg[id].responsavel; relUpd('clientes/' + id, { responsavel: v }); }
  });
  fecha(); render(); toast('Responsáveis salvos', 'ok');
}
