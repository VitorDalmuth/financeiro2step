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
var CK_COR = { ok: '#22C55E', and: '#F59E0B', pen: '#EF4444', alvo: '#EF4444' };
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
    dataHora: '', intro: '', aviso: '',
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
function ckIcone(s){ return '<i style="background:' + CK_COR[s] + '"></i>'; }
function ckIconeHTML(s){ return s === 'and' ? '⏳' : ckIcone(s); }
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
    '<div class="ck-sec"><div class="ck-tit">2STEP MÍDIA <span class="ck-req">*</span></div>' + ckLinhas('nos', true) + '</div>' +
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
  if(!nos.length) return toast('Escreva pelo menos um item em 2STEP MÍDIA', 'err');
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
function ckDesenhaIcone(ctx, s, x, y, r){
  ctx.save();
  if(s === 'alvo'){
    [[r, '#EF4444'], [r * .68, '#FFFFFF'], [r * .4, '#EF4444']].forEach(function(c){ ctx.beginPath(); ctx.arc(x, y, c[0], 0, Math.PI * 2); ctx.fillStyle = c[1]; ctx.fill(); });
    ctx.restore(); return;
  }
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = CK_COR[s]; ctx.fill();
  ctx.strokeStyle = '#FFFFFF'; ctx.fillStyle = '#FFFFFF'; ctx.lineWidth = r * .2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if(s === 'ok'){
    ctx.beginPath(); ctx.moveTo(x - r * .45, y + r * .02); ctx.lineTo(x - r * .1, y + r * .38); ctx.lineTo(x + r * .48, y - r * .34); ctx.stroke();
  }else if(s === 'and'){
    /* ampulheta */
    var w = r * .42, h = r * .55;
    ctx.beginPath(); ctx.moveTo(x - w, y - h); ctx.lineTo(x + w, y - h); ctx.lineTo(x, y); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - w, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y); ctx.closePath(); ctx.fill();
  }else{
    ctx.beginPath(); ctx.moveTo(x, y - r * .45); ctx.lineTo(x, y + r * .08); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y + r * .38, r * .1, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
function ckAviso(ctx, x, y, r){
  ctx.save(); ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r * 1.1, y + r * .8); ctx.lineTo(x - r * 1.1, y + r * .8); ctx.closePath();
  ctx.fillStyle = '#B45309'; ctx.fill(); ctx.fillStyle = '#FFFFFF'; ctx.font = '700 ' + Math.round(r * 1.1) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('!', x, y + r * .62); ctx.restore();
}
function ckDataHoraTexto(dh){
  if(!dh) return '';
  var a = dh.split('T'), d = a[0].split('-');
  return 'Atualizado em ' + d[2] + '/' + d[1] + '/' + d[0] + (a[1] ? ' às ' + a[1].slice(0, 5) : '');
}
function ckDesenha(id, ini){
  var c = REL.cfg[id], s = ckSemana(id, ini), d = ckDados(id, ini);
  var DISP = "'Space Grotesk', sans-serif", CORPO = "'Plus Jakarta Sans', sans-serif";
  var fontes = document.fonts && document.fonts.load ? Promise.all([
    document.fonts.load('700 40px "Space Grotesk"'), document.fonts.load('500 24px "Plus Jakarta Sans"'), document.fonts.load('700 24px "Plus Jakarta Sans"')
  ]).catch(function(){}) : Promise.resolve();
  return Promise.all([fontes, relImg(c && c.logo)]).then(function(r){
    var logo = r[1], W = 1080, P = 72, LARG = W - 2 * P;
    var secoes = [
      { tit: '2STEP MÍDIA', itens: d.nos.map(function(x){ return { s: x.s, t: x.t }; }) },
      { tit: d.tituloCliente, itens: d.cliente.map(function(x){ return { s: x.s, t: x.t }; }) },
      { tit: 'Próximo passo', itens: d.proximos.map(function(x){ return { s: 'alvo', t: x.t }; }) }
    ].filter(function(x){ return x.itens.length; });

    /* passa duas vezes: a primeira só mede a altura, a segunda desenha */
    function desenha(ctx, pinta){
      var y;
      if(pinta){ ctx.fillStyle = REL_COR.fundo; ctx.fillRect(0, 0, W, ctx.canvas.height); }
      ctx.textBaseline = 'alphabetic';
      var LOGO = 150, largTexto = LARG - (logo ? LOGO + 30 : 0);
      if(pinta){
        ctx.fillStyle = REL_COR.claro; ctx.font = '500 26px ' + CORPO; ctx.fillText('2STEP · Atualização semanal', P, P + 26);
        ctx.fillStyle = '#FFFFFF'; relCabe(ctx, relNome(id), '700', 58, DISP, largTexto, 30); ctx.fillText(relNome(id), P, P + 100);
        var per = relPeriodoTexto(s, ini);
        ctx.fillStyle = REL_COR.claro; relCabe(ctx, per, '500', 28, CORPO, largTexto, 18); ctx.fillText(per, P, P + 148);
        var dh = ckDataHoraTexto(d.dataHora);
        if(dh){ ctx.font = '500 22px ' + CORPO; ctx.fillText(dh, P, P + 184); }
        if(logo){
          var lx = W - P - LOGO, ly = P;
          ctx.fillStyle = '#FFFFFF'; relRR(ctx, lx, ly, LOGO, LOGO, 28); ctx.fill();
          var k = Math.min((LOGO - 28) / logo.width, (LOGO - 28) / logo.height);
          ctx.drawImage(logo, lx + (LOGO - logo.width * k) / 2, ly + (LOGO - logo.height * k) / 2, logo.width * k, logo.height * k);
        }
      }
      y = P + 222;

      if(d.intro){
        ctx.font = '500 27px ' + CORPO;
        ckQuebra(ctx, d.intro, LARG).forEach(function(l){ if(pinta){ ctx.fillStyle = '#FFFFFF'; ctx.fillText(l, P, y + 28); } y += 40; });
        y += 22;
      }
      if(d.aviso){
        ctx.font = '600 26px ' + CORPO;
        var la = ckQuebra(ctx, d.aviso, LARG - 56), ha = 72 + la.length * 38 + 10;
        if(pinta){
          ctx.fillStyle = '#FEF3C7'; relRR(ctx, P, y, LARG, ha, 22); ctx.fill();
          ckAviso(ctx, P + 42, y + 40, 15);
          ctx.fillStyle = '#92400E'; ctx.font = '700 26px ' + CORPO; ctx.fillText('Aviso', P + 68, y + 50);
          ctx.fillStyle = '#78350F'; ctx.font = '600 26px ' + CORPO;
          la.forEach(function(l, i){ ctx.fillText(l, P + 28, y + 96 + i * 38); });
        }
        y += ha + 26;
      }

      secoes.forEach(function(sec){
        ctx.font = '700 26px ' + CORPO;
        var largPill = Math.min(LARG, ctx.measureText(sec.tit).width + 44);
        if(pinta){
          ctx.fillStyle = '#FFFFFF'; relRR(ctx, P, y, largPill, 52, 26); ctx.fill();
          ctx.fillStyle = REL_COR.fundo; relCabe(ctx, sec.tit, '700', 26, CORPO, largPill - 44, 16); ctx.fillText(sec.tit, P + 22, y + 35);
        }
        y += 52 + 16;
        ctx.font = '500 27px ' + CORPO;
        var linhas = sec.itens.map(function(it){ return ckQuebra(ctx, it.t, LARG - 2 * 28 - 56); });
        var hb = 26 + linhas.reduce(function(a, l){ return a + Math.max(1, l.length) * 38 + 20; }, 0) + 6;
        if(pinta){ ctx.fillStyle = REL_COR.caixa; relRR(ctx, P, y, LARG, hb, 22); ctx.fill(); }
        var yy = y + 26;
        sec.itens.forEach(function(it, i){
          if(pinta){
            ckDesenhaIcone(ctx, it.s, P + 28 + 18, yy + 19, 18);
            ctx.fillStyle = '#FFFFFF'; ctx.font = '500 27px ' + CORPO;
            linhas[i].forEach(function(l, k){ ctx.fillText(l, P + 28 + 56, yy + 29 + k * 38); });
          }
          yy += Math.max(1, linhas[i].length) * 38 + 20;
        });
        y += hb + 30;
      });

      /* legenda */
      var leg = [['ok', CK_ST.ok], ['and', CK_ST.and], ['pen', CK_ST.pen]];
      if(pinta){
        var x = P;
        ctx.font = '500 22px ' + CORPO;
        leg.forEach(function(l){
          ckDesenhaIcone(ctx, l[0], x + 13, y + 14, 13);
          ctx.fillStyle = REL_COR.claro; ctx.fillText(l[1], x + 34, y + 22);
          x += 34 + ctx.measureText(l[1]).width + 30;
        });
      }
      y += 30;
      return y + P - 20;
    }
    var med = document.createElement('canvas').getContext('2d');
    var H = Math.ceil(desenha(med, false));
    var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    desenha(cv.getContext('2d'), true);
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
      '<div><span style="color:var(--mute)">2STEP MÍDIA:</span> ' + d.nos.length + ' item(ns)</div>' +
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
