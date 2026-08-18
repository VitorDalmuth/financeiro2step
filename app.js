/* ============================================================
   2STEP · CAIXA E PROJEÇÃO
   App single-file · Firebase Realtime Database · deploy Vercel
   ------------------------------------------------------------
   PARA ATIVAR O BANCO: cole abaixo o config do seu projeto
   Firebase (Console > Configurações do projeto > Seus apps).
   Enquanto não colar, o app roda em memória (nada é salvo).
   ============================================================ */
var FB = {
  apiKey: "AIzaSyBPy8NMgdiRauk7h8JfHFijvVm4_h_0o7s",
  authDomain: "step-financeiro.firebaseapp.com",
  databaseURL: "https://step-financeiro-default-rtdb.firebaseio.com",
  projectId: "step-financeiro",
  storageBucket: "step-financeiro.firebasestorage.app",
  messagingSenderId: "6219383783",
  appId: "1:6219383783:web:0785b1cdb52fbccd763342"
};
var ROOT = "2step_financeiro";

/* ================= ESTADO ================= */
var DB = null, AUTH = null, MEM = false, LIGADO = false, ESCUTANDO = false;
var EMAIL = '', PAPEL = 'admin';
var PAPEIS = {
  admin:    { nome:'Administrador', desc:'Acesso total: financeiro, mídias e usuários', cor:'#34D399' },
  operacao: { nome:'Operação',      desc:'Só o portal de mídias. Não vê nada do financeiro', cor:'#7C5CFF' }
};
var S = {
  clientes: {},
  custos: {},
  recebimentos: {},   // chave: clienteId__YYYY-MM
  pagamentos: {},     // chave: custoId__YYYY-MM
  backups: {},        // chave: YYYY-MM
  portais: {},        // chave: clienteId -> { linkId: {...} }
  usuarios: {},       // chave: e-mail com virgulas no lugar dos pontos
  config: {
    saldoInicial: 0,
    saldoInicialMes: '',
    aliquota: 6,
    encargos: 40,
    dolar: 5.40,
    metaResultado: 0,
    horizonte: 12,
    ratear: true,
    ultimoDownload: ''
  }
};
var VIEW = 'dash';
var MESREF = '';

/* ================= USUÁRIOS E PAPÉIS ================= */
function chaveEmail(e){ return String(e || '').trim().toLowerCase().replace(/\./g, ','); }
function euSouAdmin(){ return PAPEL === 'admin'; }
function semUsuarios(){ return !Object.keys(S.usuarios).length; }
function papelDe(email){
  if(semUsuarios()) return 'admin';           // primeiro acesso: quem entra e o dono
  var u = S.usuarios[chaveEmail(email)];
  return u ? (u.papel || 'operacao') : 'sem-acesso';
}
function listaUsuarios(){
  return Object.keys(S.usuarios).map(function(k){ return S.usuarios[k]; })
    .sort(function(a, b){ return String(a.nome || a.email).localeCompare(String(b.nome || b.email), 'pt-BR'); });
}

/* ================= UTILS ================= */
function $(id){ return document.getElementById(id); }
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function n(v){ var x = parseFloat(String(v==null?0:v).replace(/\./g,'').replace(',','.')); return isNaN(x)?0:x; }
function nf(v){ var x = parseFloat(v); return isNaN(x)?0:x; }

function brl(v, curto){
  var x = nf(v);
  if(curto && Math.abs(x) >= 1000){
    return (x<0?'-':'') + 'R$ ' + (Math.abs(x)/1000).toFixed(Math.abs(x)>=10000?0:1).replace('.',',') + 'k';
  }
  return (x<0?'-':'') + 'R$ ' + Math.abs(x).toLocaleString('pt-BR',{minimumFractionDigits:2, maximumFractionDigits:2});
}
function pct(v){ return (nf(v)).toLocaleString('pt-BR',{minimumFractionDigits:1, maximumFractionDigits:1}) + '%'; }
function cls(v){ return nf(v) > 0 ? 'pos' : (nf(v) < 0 ? 'neg' : ''); }

var MESES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
var MESESL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function hoje(){ var d = new Date(); return d.getFullYear() + '-' + p2(d.getMonth()+1) + '-' + p2(d.getDate()); }
function p2(x){ return x < 10 ? '0'+x : ''+x; }
function ymHoje(){ return hoje().slice(0,7); }
function ymOf(dstr){ return dstr ? String(dstr).slice(0,7) : ''; }
function ymAdd(ym, k){
  var a = ym.split('-'), y = +a[0], m = +a[1] - 1 + k;
  y += Math.floor(m/12); m = ((m%12)+12)%12;
  return y + '-' + p2(m+1);
}
function ymDiff(a, b){ // b - a em meses
  var x = a.split('-'), y = b.split('-');
  return (+y[0] - +x[0]) * 12 + (+y[1] - +x[1]);
}
function ymLabel(ym){ if(!ym) return '—'; var a = ym.split('-'); return MESES[+a[1]-1] + '/' + a[0].slice(2); }
function ymLabelL(ym){ if(!ym) return '—'; var a = ym.split('-'); return MESESL[+a[1]-1] + ' ' + a[0]; }
function dLabel(d){ if(!d) return '—'; var a = String(d).slice(0,10).split('-'); return a[2] + '/' + a[1] + '/' + a[0]; }
function addDias(dstr, k){ var d = new Date(dstr + 'T12:00:00'); d.setDate(d.getDate() + k); return d.getFullYear()+'-'+p2(d.getMonth()+1)+'-'+p2(d.getDate()); }
function addMesesD(dstr, k){ var d = new Date(dstr + 'T12:00:00'); d.setMonth(d.getMonth() + k); return d.getFullYear()+'-'+p2(d.getMonth()+1)+'-'+p2(d.getDate()); }
function diasEntre(a, b){ return Math.round((new Date(b+'T12:00:00') - new Date(a+'T12:00:00')) / 86400000); }

function toast(msg, tipo){
  var t = $('toast');
  t.textContent = msg;
  t.style.color = tipo === 'err' ? 'var(--coral)' : (tipo === 'ok' ? 'var(--mint)' : 'var(--ink)');
  t.classList.add('on');
  clearTimeout(t._t);
  t._t = setTimeout(function(){ t.classList.remove('on'); }, 2600);
}

/* ================= PERSISTÊNCIA ================= */
function initDB(){
  if(String(FB.apiKey).indexOf('COLE_') === 0){
    MEM = true;
    $('dbState').innerHTML = '<span style="color:var(--amber)">memória</span>';
    seedDemo();
    boot();
    return;
  }
  try{
    firebase.initializeApp(FB);
    DB   = firebase.database();
    AUTH = firebase.auth();
    AUTH.onAuthStateChanged(function(user){
      if(user) abreApp(user); else fechaApp();
    });
    boot();
  }catch(e){
    MEM = true;
    $('dbState').innerHTML = '<span style="color:var(--coral)">erro</span>';
    boot();
  }
}

function abreApp(user){
  $('login').classList.add('hidden');
  $('app').classList.remove('hidden');
  $('dbState').innerHTML = '<span style="color:var(--mint)">●</span> ' + esc(user.email || 'conectado') +
    '<br><span style="color:var(--mute2);font-size:10px">' + ((PAPEIS[PAPEL] || {}).nome || 'sem acesso') + '</span>';
  $('dbState').title = user.email || '';
  EMAIL = user.email || '';
  if(!LIGADO){
    LIGADO = true;
    /* a lista de usuarios vem primeiro: e ela que define o que sera carregado depois */
    DB.ref(ROOT + '/usuarios').on('value', function(snap){
      S.usuarios = snap.val() || {};
      PAPEL = papelDe(EMAIL);
      $('dbState').innerHTML = '<span style="color:var(--mint)">●</span> ' + esc(EMAIL) +
        '<br><span style="color:var(--mute2);font-size:10px">' + ((PAPEIS[PAPEL] || {}).nome || 'sem acesso') + '</span>';
      ligaDados();
      render();
    }, function(){
      PAPEL = 'sem-acesso';
      render();
    });
  }
  render();
}
function ouve(no, aplica){
  DB.ref(ROOT + '/' + no).on('value', function(snap){
    aplica(snap.val() || {});
    render();
  }, function(){ /* sem permissao neste no: segue sem ele */ });
}
function ligaDados(){
  if(ESCUTANDO || PAPEL === 'sem-acesso') return;
  ESCUTANDO = true;
  ouve('clientes', function(v){ S.clientes = v; });
  ouve('portais',  function(v){ S.portais  = v; });
  if(!euSouAdmin()) return;
  ouve('custos',       function(v){ S.custos = v; });
  ouve('recebimentos', function(v){ S.recebimentos = v; });
  ouve('pagamentos',   function(v){ S.pagamentos = v; });
  ouve('backups',      function(v){ S.backups = v; snapshotMensal(); });
  ouve('config',       function(v){ S.config = Object.assign({}, S.config, v); });
}
function fechaApp(){
  EMAIL = ''; PAPEL = 'admin';
  $('app').classList.add('hidden');
  $('login').classList.remove('hidden');
  $('senha').value = '';
  $('email').focus();
}
function save(caminho, valor){
  if(MEM || !DB){ render(); return Promise.resolve(); }
  return DB.ref(ROOT + '/' + caminho).set(valor);
}
function del(caminho){
  if(MEM || !DB){ render(); return Promise.resolve(); }
  return DB.ref(ROOT + '/' + caminho).remove();
}
function pacote(){
  return { clientes:S.clientes, custos:S.custos, recebimentos:S.recebimentos, pagamentos:S.pagamentos, portais:S.portais, usuarios:S.usuarios, config:S.config };
}
var SNAP_OK = false;
/* copia automatica dentro do proprio banco, uma por mes, mantendo as 6 ultimas */
function snapshotMensal(){
  if(MEM || !DB || SNAP_OK) return;
  SNAP_OK = true;
  var ym = ymHoje();
  if(S.backups[ym]) return;
  if(!Object.keys(S.clientes).length && !Object.keys(S.custos).length) return;
  var reg = { ym:ym, criadoEm:new Date().toISOString(), dados:JSON.stringify(pacote()) };
  DB.ref(ROOT + '/backups/' + ym).set(reg).then(function(){
    var ks = Object.keys(S.backups).concat([ym]).sort();
    while(ks.length > 6) DB.ref(ROOT + '/backups/' + ks.shift()).remove();
  });
}
function listaBackups(){
  return Object.keys(S.backups).map(function(k){ return S.backups[k]; }).sort(function(a,b){ return b.ym.localeCompare(a.ym); });
}
function restaurarSnapshot(ym){
  var reg = S.backups[ym];
  if(!reg) return;
  if(!confirm('Restaurar a copia de ' + ymLabelL(ym) + '?\n\nTudo que foi cadastrado depois dessa data sera substituido. O estado de agora e salvo como copia antes de trocar.')) return;
  var antes = { ym:'antes-' + ymHoje(), criadoEm:new Date().toISOString(), dados:JSON.stringify(pacote()) };
  var d = JSON.parse(reg.dados);
  DB.ref(ROOT + '/backups/antes-' + ymHoje()).set(antes).then(function(){
    return DB.ref(ROOT).update({ clientes:d.clientes||{}, custos:d.custos||{}, recebimentos:d.recebimentos||{}, pagamentos:d.pagamentos||{}, portais:d.portais||{}, usuarios:d.usuarios||S.usuarios, config:d.config||S.config });
  }).then(function(){ toast('Copia de ' + ymLabelL(ym) + ' restaurada', 'ok'); });
}
function precisaDownload(){
  if(MEM) return false;
  if(!Object.keys(S.clientes).length && !Object.keys(S.custos).length) return false;
  return S.config.ultimoDownload !== ymHoje();
}
function baixarBackupMes(){
  exportJSON();
  S.config.ultimoDownload = ymHoje();
  setConfig();
  render();
}
function adiarDownload(){
  S.config.ultimoDownload = ymHoje();
  setConfig();
  render();
  toast('Ok, aviso de novo no mes que vem');
}

function setCliente(c){ S.clientes[c.id] = c; save('clientes/' + c.id, c); }
function setCusto(c){ S.custos[c.id] = c; save('custos/' + c.id, c); }
function setConfig(){ save('config', S.config); }

/* ================= DOMÍNIO ================= */
var CAT = {
  anuncio:    { nome:'Anúncios (captação)', cor:'#7C5CFF' },
  ferramenta: { nome:'Ferramentas',         cor:'#22D3EE' },
  pessoal:    { nome:'Equipe',              cor:'#FBBF24' },
  freela:     { nome:'Freelancers',         cor:'#F472B6' },
  prolabore:  { nome:'Pró-labore',          cor:'#A78BFA' },
  estrutura:  { nome:'Estrutura',           cor:'#60A5FA' },
  outros:     { nome:'Outros',              cor:'#7C8798' }
};
var CATK = Object.keys(CAT);
var REC = { mensal:'Mensal', anual:'Anual', pontual:'Pontual' };

function listaClientes(){
  return Object.keys(S.clientes).map(function(k){ return S.clientes[k]; })
    .sort(function(a,b){ return nf(b.mensalidade) - nf(a.mensalidade); });
}
function listaCustos(){
  return Object.keys(S.custos).map(function(k){ return S.custos[k]; })
    .sort(function(a,b){ return valorMensalizado(b) - valorMensalizado(a); });
}

/* fim da receita do cliente: o que vier primeiro entre aviso prévio, prazo e encerramento */
function fimCliente(c){
  var fins = [];
  if(c.status === 'encerrado') fins.push(ymOf(c.dataEncerramento || c.dataAviso || c.dataInicio));
  if(c.status === 'aviso' && c.dataAviso) fins.push(ymOf(addDias(c.dataAviso, 30)));
  if(!c.renovaAuto && nf(c.prazoMeses) > 0 && c.dataInicio)
    fins.push(ymOf(addDias(addMesesD(c.dataInicio, nf(c.prazoMeses)), -1)));
  if(!fins.length) return null;
  fins.sort();
  return fins[0];
}
function ultimaMensalidade(c){
  if(c.status === 'aviso' && c.dataAviso) return addDias(c.dataAviso, 30);
  return null;
}
function fimContrato(c){
  if(c.renovaAuto || !nf(c.prazoMeses) || !c.dataInicio) return null;
  return addDias(addMesesD(c.dataInicio, nf(c.prazoMeses)), -1);
}
function ativoNoMes(c, ym){
  if(!c.dataInicio) return false;
  if(ym < ymOf(c.dataInicio)) return false;
  var f = fimCliente(c);
  if(f && ym > f) return false;
  return true;
}
function ativoHoje(c){ return ativoNoMes(c, ymHoje()); }
function vencimentoDoMes(c, ym){
  var dia = Math.min(Math.max(nf(c.diaVencimento) || 10, 1), 28);
  return ym + '-' + p2(dia);
}

/* custo convertido para o mês pedido */
function custoNoMes(x, ym){
  if(x.ativo === false) return 0;
  var ini = ymOf(x.dataInicio);
  if(!ini || ym < ini) return 0;
  if(x.dataFim && ym > ymOf(x.dataFim)) return 0;
  var v = nf(x.valor);
  if(x.moeda === 'USD') v = v * nf(S.config.dolar);
  if(x.categoria === 'pessoal' && x.comEncargos !== false) v = v * (1 + nf(S.config.encargos)/100);
  if(x.recorrencia === 'anual')   return ym.slice(5) === ini.slice(5) ? v : 0;
  if(x.recorrencia === 'pontual') return ym === ini ? v : 0;
  return v; // mensal
}
/* peso mensal médio, para ranking e custo fixo */
function valorMensalizado(x){
  if(x.ativo === false) return 0;
  var v = nf(x.valor);
  if(x.moeda === 'USD') v = v * nf(S.config.dolar);
  if(x.categoria === 'pessoal' && x.comEncargos !== false) v = v * (1 + nf(S.config.encargos)/100);
  if(x.recorrencia === 'anual') return v / 12;
  if(x.recorrencia === 'pontual') return 0;
  return v;
}
function proximaRenovacao(x){
  if(x.recorrencia !== 'anual' || !x.dataInicio) return null;
  var d = x.dataInicio, hj = hoje(), guard = 0;
  while(d < hj && guard++ < 60) d = addMesesD(d, 12);
  return d;
}

/* ================= ENGINE ================= */
function mesCalc(ym, o){
  o = o || {};
  var ex = o.excluir || {};
  var receita = 0, clientesAtivos = 0;

  for(var k in S.clientes){
    var c = S.clientes[k];
    if(ex[c.id]) continue;
    if(ativoNoMes(c, ym)){ receita += nf(c.mensalidade); clientesAtivos++; }
  }
  if(nf(o.novos) > 0 && nf(o.ticket) > 0){
    var desde = o.novosDesde || ymHoje();
    if(ym >= desde){
      var qtd = (ymDiff(desde, ym) + 1) * nf(o.novos);
      receita += qtd * nf(o.ticket);
      clientesAtivos += qtd;
    }
  }

  var saida = {}; CATK.forEach(function(g){ saida[g] = 0; });
  for(var k2 in S.custos){
    var x = S.custos[k2];
    var v = custoNoMes(x, ym);
    if(v) saida[CAT[x.categoria] ? x.categoria : 'outros'] += v;
  }
  if(nf(o.deltaAnuncio)) saida.anuncio = saida.anuncio * (1 + nf(o.deltaAnuncio)/100);
  if(nf(o.extraCusto))   saida.outros  = saida.outros + nf(o.extraCusto);

  var imposto = receita * nf(S.config.aliquota) / 100;
  var totalSaida = imposto;
  CATK.forEach(function(g){ totalSaida += saida[g]; });

  return {
    ym: ym, receita: receita, clientes: clientesAtivos,
    imposto: imposto, saida: saida, totalSaida: totalSaida,
    resultado: receita - totalSaida,
    margem: receita > 0 ? (receita - totalSaida) / receita * 100 : 0
  };
}

function saldoNoFimDe(ym, o){
  var base = ymOf(S.config.saldoInicialMes) || ymHoje();
  var s = nf(S.config.saldoInicial);
  if(ym < base) return s;
  var k = ymDiff(base, ym);
  for(var i = 0; i <= k; i++) s += mesCalc(ymAdd(base, i), o).resultado;
  return s;
}

function serie(inicio, meses, o){
  var arr = [], saldo = saldoNoFimDe(ymAdd(inicio, -1), o);
  for(var i = 0; i < meses; i++){
    var m = mesCalc(ymAdd(inicio, i), o);
    saldo += m.resultado;
    m.saldo = saldo;
    arr.push(m);
  }
  return arr;
}

function runway(o){
  var ini = ymHoje();
  var s = saldoNoFimDe(ymAdd(ini, -1), o), i = 0;
  if(s < 0) return 0;
  for(i = 0; i < 36; i++){
    s += mesCalc(ymAdd(ini, i), o).resultado;
    if(s < 0) return i;
  }
  return 36;
}

function metricas(){
  var ym = ymHoje();
  var ativos = listaClientes().filter(ativoHoje);
  var mrr = ativos.reduce(function(a,c){ return a + nf(c.mensalidade); }, 0);
  var maior = ativos.reduce(function(a,c){ return Math.max(a, nf(c.mensalidade)); }, 0);

  var saindo = ativos.filter(function(c){ return c.status === 'aviso'; });
  var mrrSaindo = saindo.reduce(function(a,c){ return a + nf(c.mensalidade); }, 0);

  var doze = ymAdd(ym, -12), perdidos = 0, mrrPerdido = 0;
  listaClientes().forEach(function(c){
    var f = fimCliente(c);
    if(c.status === 'encerrado' && f && f >= doze && f <= ym){ perdidos++; mrrPerdido += nf(c.mensalidade); }
  });
  var baseChurn = ativos.length + perdidos;

  return {
    mrr: mrr, ativos: ativos.length,
    ticket: ativos.length ? mrr / ativos.length : 0,
    maior: maior, concentracao: mrr > 0 ? maior / mrr * 100 : 0,
    saindo: saindo.length, mrrSaindo: mrrSaindo,
    churnQtd: perdidos, churnPct: baseChurn > 0 ? perdidos / baseChurn * 100 : 0,
    mrrPerdido: mrrPerdido
  };
}

/* margem por cliente: mensalidade − custos diretos − rateio dos indiretos */
function margemCliente(c){
  var m = mesCalc(ymHoje());
  var diretos = (c.custosDiretos || []).reduce(function(a,x){ return a + nf(x.valor); }, 0);
  var imposto = nf(c.mensalidade) * nf(S.config.aliquota) / 100;
  var rateio = 0;
  if(S.config.ratear && m.receita > 0){
    var indiretos = m.totalSaida - m.imposto;
    var diretosTotais = listaClientes().filter(ativoHoje)
      .reduce(function(a,x){ return a + (x.custosDiretos || []).reduce(function(b,y){ return b + nf(y.valor); }, 0); }, 0);
    indiretos = Math.max(0, indiretos - diretosTotais);
    rateio = indiretos * (nf(c.mensalidade) / m.receita);
  }
  var lucro = nf(c.mensalidade) - diretos - imposto - rateio;
  return { diretos: diretos, imposto: imposto, rateio: rateio, lucro: lucro,
           pct: nf(c.mensalidade) > 0 ? lucro / nf(c.mensalidade) * 100 : 0 };
}

/* ================= ALERTAS ================= */
function alertas(){
  var a = [], hj = hoje(), ym = ymHoje(), M = metricas();

  listaClientes().forEach(function(c){
    if(c.status === 'aviso'){
      var u = ultimaMensalidade(c);
      a.push({ t:'av', ic:'!', cor:'var(--amber)', bg:'var(--amber-dim)',
        titulo: c.nome + ' está em aviso prévio',
        sub: 'Última mensalidade em ' + dLabel(u) + ' · ' + brl(c.mensalidade) + ' saem do MRR a partir de ' + ymLabelL(ymAdd(ymOf(u), 1)) });
    }
    var fc = fimContrato(c);
    if(fc && c.status === 'ativo'){
      var d = diasEntre(hj, fc);
      if(d >= 0 && d <= 60) a.push({ t:'ct', ic:'C', cor:'var(--cyan)', bg:'rgba(34,211,238,.13)',
        titulo: 'Contrato de ' + c.nome + ' vence em ' + d + ' dias',
        sub: 'Termina em ' + dLabel(fc) + '. Janela boa para renegociar reajuste antes do vencimento.' });
    }
  });

  var atras = pendencias(ym).filter(function(r){ return r.atrasado; });
  if(atras.length) a.push({ t:'at', ic:'$', cor:'var(--coral)', bg:'var(--coral-dim)',
    titulo: atras.length + (atras.length > 1 ? ' mensalidades atrasadas' : ' mensalidade atrasada'),
    sub: brl(atras.reduce(function(x,r){ return x + r.valor; }, 0)) + ' vencidos e não recebidos neste mês' });

  listaCustos().forEach(function(x){
    var r = proximaRenovacao(x);
    if(r){
      var d = diasEntre(hj, r);
      if(d >= 0 && d <= 30) a.push({ t:'rn', ic:'R', cor:'var(--volt)', bg:'var(--volt-dim)',
        titulo: 'Renovação anual: ' + x.nome,
        sub: brl(custoNoMes(x, ymOf(r))) + ' em ' + dLabel(r) + ' (' + d + ' dias). Esse mês pesa mais no caixa.' });
    }
  });

  if(M.concentracao > 30) a.push({ t:'cc', ic:'%', cor:'var(--coral)', bg:'var(--coral-dim)',
    titulo: 'Concentração de receita em ' + pct(M.concentracao),
    sub: 'Seu maior cliente responde por mais de 30% do MRR. Perder ele é risco de operação, não só de faturamento.' });

  var sr = serie(ym, nf(S.config.horizonte) || 12);
  var quebra = sr.find(function(m){ return m.saldo < 0; });
  if(quebra) a.push({ t:'sq', ic:'!', cor:'var(--coral)', bg:'var(--coral-dim)',
    titulo: 'Caixa fica negativo em ' + ymLabelL(quebra.ym),
    sub: 'Saldo projetado de ' + brl(quebra.saldo) + '. Dá tempo de agir se começar agora.' });

  return a;
}

/* ================= FECHAMENTO DO MÊS ================= */
function pendencias(ym){
  var out = [], hj = hoje();
  listaClientes().forEach(function(c){
    if(!ativoNoMes(c, ym)) return;
    var key = c.id + '__' + ym;
    var r = S.recebimentos[key] || {};
    var venc = vencimentoDoMes(c, ym);
    out.push({
      cliente: c, key: key, valor: nf(r.valor) || nf(c.mensalidade),
      venc: venc, pago: r.status === 'pago', data: r.data || '',
      atrasado: r.status !== 'pago' && venc < hj
    });
  });
  return out.sort(function(a,b){ return a.venc.localeCompare(b.venc); });
}
function despesasDoMes(ym){
  var out = [], hj = hoje();
  listaCustos().forEach(function(x){
    var v = custoNoMes(x, ym);
    if(!v) return;
    var key = x.id + '__' + ym;
    var p = S.pagamentos[key] || {};
    out.push({ custo: x, key: key, valor: v, pago: p.status === 'pago', data: p.data || '' });
  });
  return out;
}
function marcarRecebimento(key, pago){
  var r = S.recebimentos[key] || {};
  r.status = pago ? 'pago' : 'pendente';
  r.data = pago ? hoje() : '';
  S.recebimentos[key] = r;
  save('recebimentos/' + key, r);
  render();
}
function marcarPagamento(key, pago){
  var p = S.pagamentos[key] || {};
  p.status = pago ? 'pago' : 'pendente';
  p.data = pago ? hoje() : '';
  S.pagamentos[key] = p;
  save('pagamentos/' + key, p);
  render();
}

/* ================= MÓDULOS =================
   Para criar um módulo novo: escreva as telas num arquivo .js proprio,
   carregue no index.html e acrescente um bloco aqui. Nada mais muda.
   ============================================ */
var MODULOS = [
  { id:'fin', nome:'Financeiro', sigla:'F', cor:'#34D399', papeis:['admin'], telas:[
      { v:'dash',   n:'Painel',            f:function(){ return vDash(); }, badge:function(){ return alertas().length; } },
      { v:'proj',   n:'Projeção',          f:function(){ return vProj(); } },
      { v:'sim',    n:'Simulador',         f:function(){ return vSim(); } },
      { v:'cli',    n:'Clientes',          f:function(){ return vCli(); } },
      { v:'cus',    n:'Custos',            f:function(){ return vCus(); } },
      { v:'mes',    n:'Fechamento',        f:function(){ return vMes(); },
        badge:function(){ return pendencias(ymHoje()).filter(function(r){ return !r.pago; }).length; } },
      { v:'marg',   n:'Margem por cliente',f:function(){ return vMarg(); } }
  ]},
  { id:'mid', nome:'Mídias', sigla:'M', cor:'#7C5CFF', papeis:['admin','operacao'], telas:[
      { v:'portal', n:'Portal do cliente', f:function(){ return vPortal(); } }
  ]},
  { id:'sis', nome:'Sistema', sigla:'S', cor:'#7C8798', papeis:['admin'], telas:[
      { v:'usr',    n:'Usuários',          f:function(){ return vUsr(); } },
      { v:'cfg',    n:'Parâmetros',        f:function(){ return vCfg(); } }
  ]}
];
var MOD_ABERTO = 'fin';

function modulosVisiveis(){
  return MODULOS.filter(function(m){ return !m.papeis || m.papeis.indexOf(PAPEL) > -1; });
}
function podeVer(v){
  return modulosVisiveis().some(function(m){
    return m.telas.some(function(t){ return t.v === v; });
  });
}
function primeiraTela(){
  var m = modulosVisiveis()[0];
  return m ? m.telas[0].v : '';
}
function moduloDe(v){
  for(var i = 0; i < MODULOS.length; i++)
    for(var j = 0; j < MODULOS[i].telas.length; j++)
      if(MODULOS[i].telas[j].v === v) return MODULOS[i];
  return MODULOS[0];
}
function telaDe(v){
  for(var i = 0; i < MODULOS.length; i++)
    for(var j = 0; j < MODULOS[i].telas.length; j++)
      if(MODULOS[i].telas[j].v === v) return MODULOS[i].telas[j];
  return MODULOS[0].telas[0];
}
function contaBadge(t){ try{ return t.badge ? t.badge() : 0; }catch(e){ return 0; } }

/* ================= NAVEGAÇÃO ================= */
function go(v){
  VIEW = v;
  if(v !== 'portal') PORTAL_SEL = '';
  MOD_ABERTO = moduloDe(v).id;
  render();
  window.scrollTo(0, 0);
}
function abreModulo(id){
  var m = MODULOS.filter(function(x){ return x.id === id; })[0];
  if(!m) return;
  if(MOD_ABERTO === id && moduloDe(VIEW).id === id){ MOD_ABERTO = ''; renderNav(); return; }
  MOD_ABERTO = id;
  if(moduloDe(VIEW).id !== id) go(m.telas[0].v); else renderNav();
}
function renderNav(){
  var atualMod = moduloDe(VIEW).id;
  $('navList').innerHTML = modulosVisiveis().map(function(m){
    var aberto = MOD_ABERTO === m.id;
    var soma = m.telas.reduce(function(a, t){ return a + contaBadge(t); }, 0);
    var cab = '<button class="nv-m ' + (aberto ? 'open' : '') + '" onclick="abreModulo(\'' + m.id + '\')">' +
      '<i class="nv-sq" style="background:' + m.cor + (aberto || atualMod === m.id ? '' : ';opacity:.35') + '">' + m.sigla + '</i>' +
      m.nome +
      (!aberto && soma ? '<span class="nv-badge">' + soma + '</span>' : '') +
      '<i class="nv-ch">▼</i></button>';
    if(!aberto) return cab;
    return cab + '<div class="nv-sub">' + m.telas.map(function(t){
      var b = contaBadge(t);
      return '<button class="nv-i ' + (VIEW === t.v ? 'on' : '') + '" onclick="go(\'' + t.v + '\')">' +
        '<i class="nv-d"></i>' + t.n + (b ? '<span class="nv-badge">' + b + '</span>' : '') + '</button>';
    }).join('') + '</div>';
  }).join('');
}
function render(){
  if($('app').classList.contains('hidden')) return;
  if(PAPEL === 'sem-acesso'){ $('navList').innerHTML = ''; $('main').innerHTML = vSemAcesso(); return; }
  if(!podeVer(VIEW)) VIEW = primeiraTela();
  renderNav();
  $('main').innerHTML = telaDe(VIEW).f();
}
function vSemAcesso(){
  return '<div class="hd"><div><h1>Acesso não liberado</h1>' +
    '<p>Sua conta entrou, mas ainda não tem permissão definida neste app</p></div></div>' +
    '<div class="tw"><div class="empty"><b>' + esc(EMAIL) + '</b>' +
    'Peça a quem administra o app para cadastrar este e-mail em Sistema › Usuários.</div></div>';
}

/* ================= PAINEL ================= */
function vDash(){
  var ym = ymHoje(), M = metricas(), m = mesCalc(ym);
  var H = nf(S.config.horizonte) || 12;
  var sr = serie(ym, H);
  var prox = mesCalc(ymAdd(ym, 1));
  var rec = pendencias(ym), recebido = rec.filter(function(r){ return r.pago; }).reduce(function(a,r){ return a + r.valor; }, 0);
  var rw = runway();
  var saldoAgora = saldoNoFimDe(ym);
  var al = alertas();

  /* faixa de runway */
  var mx = Math.max.apply(null, sr.map(function(x){ return Math.abs(x.saldo); }).concat([1]));
  var barras = sr.map(function(x, i){
    var h = Math.max(3, Math.abs(x.saldo) / mx * 100);
    var neg = x.saldo < 0;
    var cor = neg ? 'var(--coral)' : (x.saldo < x.totalSaida ? 'var(--amber)' : 'var(--mint)');
    return '<div class="rw-col">' +
      '<div class="tip"><b>' + ymLabelL(x.ym) + '</b><br>Saldo <b class="' + (neg?'neg':'pos') + '">' + brl(x.saldo) + '</b><br>' +
      'Entra <b>' + brl(x.receita, 1) + '</b> · Sai <b>' + brl(x.totalSaida, 1) + '</b><br>' +
      'Resultado <b class="' + cls(x.resultado) + '">' + brl(x.resultado, 1) + '</b></div>' +
      '<div class="rw-bar" style="height:' + h + '%;background:' + cor + (neg ? ';opacity:.85' : '') + '"></div>' +
      '</div>';
  }).join('');
  var labels = sr.map(function(x, i){ return '<div class="' + (i === 0 ? 'now' : '') + '">' + ymLabel(x.ym).split('/')[0] + '</div>'; }).join('');

  var catRows = CATK.filter(function(g){ return m.saida[g] > 0; })
    .sort(function(a,b){ return m.saida[b] - m.saida[a]; })
    .map(function(g){
      var p = m.totalSaida > 0 ? m.saida[g] / m.totalSaida * 100 : 0;
      return '<div style="margin-bottom:11px"><div class="flx sp" style="margin-bottom:5px">' +
        '<span style="font-size:12.5px"><i class="dot" style="background:' + CAT[g].cor + '"></i> ' + CAT[g].nome + '</span>' +
        '<span class="mono" style="font-size:12.5px">' + brl(m.saida[g]) + ' <span style="color:var(--mute2)">' + p.toFixed(0) + '%</span></span></div>' +
        '<div class="bar"><i style="width:' + p + '%;background:' + CAT[g].cor + '"></i></div></div>';
    }).join('');
  var pImp = m.totalSaida > 0 ? m.imposto / m.totalSaida * 100 : 0;
  if(m.imposto > 0) catRows += '<div><div class="flx sp" style="margin-bottom:5px">' +
    '<span style="font-size:12.5px"><i class="dot" style="background:var(--coral)"></i> Impostos (' + pct(S.config.aliquota) + ')</span>' +
    '<span class="mono" style="font-size:12.5px">' + brl(m.imposto) + ' <span style="color:var(--mute2)">' + pImp.toFixed(0) + '%</span></span></div>' +
    '<div class="bar"><i style="width:' + pImp + '%;background:var(--coral)"></i></div></div>';

  return '' +
  '<div class="hd"><div><h1>' + ymLabelL(ym) + '</h1><p>Panorama do mês e o que vem pela frente</p></div>' +
  '<div class="hd-act"><button class="btn" onclick="mCliente()">+ Cliente</button><button class="btn" onclick="mCusto()">+ Custo</button></div></div>' +

  (precisaDownload() ? '<div class="note" style="display:flex;gap:14px;align-items:center;justify-content:space-between;flex-wrap:wrap">' +
    '<span>Copia de ' + ymLabelL(ymHoje()) + ' ja esta guardada no banco. Baixe o arquivo tambem e jogue no Drive: protege ate se a conta do Firebase se perder.</span>' +
    '<span class="flx" style="gap:7px"><button class="btn btn-s" onclick="adiarDownload()">Agora nao</button>' +
    '<button class="btn btn-s btn-p" onclick="baixarBackupMes()">Baixar arquivo</button></span></div>' : '') +

  (MEM ? '<div class="note">Rodando em memória: o Firebase ainda não foi configurado, então nada é salvo ao recarregar. Cole seu config no topo do arquivo para ativar o banco.</div>' : '') +

  '<div class="rw"><div class="rw-hd"><div class="rw-t">Fôlego de caixa · próximos ' + H + ' meses</div>' +
  '<div class="rw-leg"><i><span class="dot" style="background:var(--mint)"></span>saudável</i><i><span class="dot" style="background:var(--amber)"></span>menos de 1 mês de custo</i><i><span class="dot" style="background:var(--coral)"></span>negativo</i></div></div>' +
  '<div class="rw-track">' + barras + '</div><div class="rw-zero"></div><div class="rw-lbl">' + labels + '</div></div>' +

  '<div class="grid g4 mb12">' +
    kpi('MRR ativo', brl(M.mrr), M.ativos + ' clientes · ticket ' + brl(M.ticket), 'vlt') +
    kpi('Resultado do mês', brl(m.resultado), 'Margem de ' + pct(m.margem) + ' sobre ' + brl(m.receita), cls(m.resultado)) +
    kpi('Saldo projetado', brl(saldoAgora), 'No fim de ' + ymLabelL(ym), cls(saldoAgora)) +
    kpi('Fôlego', rw >= 36 ? '36+ meses' : (rw === 0 ? 'agora' : rw + (rw === 1 ? ' mês' : ' meses')), rw >= 36 ? 'Caixa se sustenta no horizonte todo' : 'Até o caixa zerar no ritmo atual', rw <= 3 ? 'neg' : (rw <= 6 ? 'warn' : 'pos')) +
  '</div>' +

  '<div class="grid g4 mb12">' +
    kpi('Recebido no mês', brl(recebido), brl(m.receita - recebido) + ' ainda a receber', recebido >= m.receita ? 'pos' : '') +
    kpi('Saindo do MRR', M.mrrSaindo > 0 ? '-' + brl(M.mrrSaindo) : brl(0), M.saindo ? M.saindo + ' cliente(s) em aviso prévio' : 'Nenhum aviso prévio ativo', M.mrrSaindo > 0 ? 'neg' : '') +
    kpi('Concentração', pct(M.concentracao), 'Maior cliente: ' + brl(M.maior), M.concentracao > 30 ? 'neg' : (M.concentracao > 20 ? 'warn' : 'pos')) +
    kpi('Churn 12 meses', pct(M.churnPct), M.churnQtd + ' saíram · ' + brl(M.mrrPerdido) + ' de MRR perdido', M.churnPct > 20 ? 'neg' : '') +
  '</div>' +

  '<div class="grid g2">' +
    '<div class="tw"><div class="tw-hd"><div class="tw-t">Para onde vai o dinheiro</div><span class="pill p-off">' + ymLabel(ym) + '</span></div>' +
    '<div style="padding:16px">' + (catRows || '<div style="color:var(--mute);font-size:13px">Nenhum custo lançado neste mês.</div>') + '</div>' +
    '<div class="mtot"><div><span>Entra</span><b class="pos">' + brl(m.receita) + '</b></div>' +
    '<div><span>Sai</span><b class="neg">' + brl(m.totalSaida) + '</b></div>' +
    '<div><span>Resultado</span><b class="' + cls(m.resultado) + '">' + brl(m.resultado) + '</b></div></div></div>' +

    '<div class="tw"><div class="tw-hd"><div class="tw-t">O que precisa da sua atenção</div>' +
    (al.length ? '<span class="pill p-cr">' + al.length + '</span>' : '<span class="pill p-on">tudo certo</span>') + '</div>' +
    (al.length ? al.map(function(a){
      return '<div class="al"><div class="al-ic" style="background:' + a.bg + ';color:' + a.cor + '">' + a.ic + '</div>' +
        '<div class="al-b"><div class="al-t">' + esc(a.titulo) + '</div><div class="al-s">' + esc(a.sub) + '</div></div></div>';
    }).join('') : '<div class="empty"><b>Nada pendente</b>Sem atrasos, avisos prévios ou renovações nos próximos 30 dias.</div>') +
    '</div>' +
  '</div>' +

  '<div class="tw mt12"><div class="tw-hd"><div class="tw-t">Comparativo com o mês seguinte</div></div>' +
  '<div class="tsc"><table><thead><tr><th>Linha</th><th class="tr">' + ymLabelL(ym) + '</th><th class="tr">' + ymLabelL(ymAdd(ym,1)) + '</th><th class="tr">Variação</th></tr></thead><tbody>' +
    cmpRow('Receita', m.receita, prox.receita, 1) +
    cmpRow('Anúncios', m.saida.anuncio, prox.saida.anuncio, -1) +
    cmpRow('Equipe + pró-labore', m.saida.pessoal + m.saida.prolabore, prox.saida.pessoal + prox.saida.prolabore, -1) +
    cmpRow('Ferramentas', m.saida.ferramenta, prox.saida.ferramenta, -1) +
    cmpRow('Impostos', m.imposto, prox.imposto, -1) +
    cmpRow('Total de saída', m.totalSaida, prox.totalSaida, -1) +
    cmpRow('Resultado', m.resultado, prox.resultado, 1) +
  '</tbody></table></div></div>';
}
function kpi(l, v, s, c){
  return '<div class="card"><div class="kpi-l">' + l + '</div><div class="kpi-v ' + (c||'') + '">' + v + '</div><div class="kpi-s">' + s + '</div></div>';
}
function cmpRow(nome, a, b, sinal){
  var d = b - a, bom = sinal * d >= 0;
  var p = a !== 0 ? (d / Math.abs(a) * 100) : (b !== 0 ? 100 : 0);
  return '<tr><td class="nm">' + nome + '</td><td class="tr mono">' + brl(a) + '</td><td class="tr mono">' + brl(b) + '</td>' +
    '<td class="tr mono ' + (Math.abs(d) < .01 ? '' : (bom ? 'pos' : 'neg')) + '">' +
    (Math.abs(d) < .01 ? '—' : (d > 0 ? '+' : '') + brl(d) + '  <span style="color:var(--mute2)">' + (p>0?'+':'') + p.toFixed(0) + '%</span>') + '</td></tr>';
}

/* ================= PROJEÇÃO ================= */
function vProj(){
  var H = nf(S.config.horizonte) || 12;
  var sr = serie(ymHoje(), H);
  var totR = sr.reduce(function(a,m){ return a + m.receita; }, 0);
  var totS = sr.reduce(function(a,m){ return a + m.totalSaida; }, 0);
  var melhor = sr.slice().sort(function(a,b){ return b.resultado - a.resultado; })[0];
  var pior   = sr.slice().sort(function(a,b){ return a.resultado - b.resultado; })[0];

  var rows = sr.map(function(m, i){
    var pes = m.saida.pessoal + m.saida.prolabore + m.saida.freela;
    return '<tr>' +
      '<td class="nm">' + ymLabelL(m.ym) + (i === 0 ? ' <span class="pill p-vl">atual</span>' : '') + '</td>' +
      '<td class="tc mono" style="color:var(--mute)">' + m.clientes + '</td>' +
      '<td class="tr mono pos">' + brl(m.receita) + '</td>' +
      '<td class="tr mono" style="color:var(--mute)">' + brl(m.imposto) + '</td>' +
      '<td class="tr mono" style="color:var(--mute)">' + brl(m.saida.anuncio) + '</td>' +
      '<td class="tr mono" style="color:var(--mute)">' + brl(pes) + '</td>' +
      '<td class="tr mono" style="color:var(--mute)">' + brl(m.saida.ferramenta + m.saida.estrutura + m.saida.outros) + '</td>' +
      '<td class="tr mono neg">' + brl(m.totalSaida) + '</td>' +
      '<td class="tr mono ' + cls(m.resultado) + '"><b>' + brl(m.resultado) + '</b></td>' +
      '<td class="tr mono ' + cls(m.saldo) + '"><b>' + brl(m.saldo) + '</b></td>' +
      '</tr>';
  }).join('');

  return '' +
  '<div class="hd"><div><h1>Projeção de caixa</h1><p>Mês a mês, considerando contratos vigentes, avisos prévios e custos programados</p></div>' +
  '<div class="hd-act"><div class="seg">' +
    [6,12,18,24].map(function(h){ return '<button class="' + (H===h?'on':'') + '" onclick="setHz(' + h + ')">' + h + 'm</button>'; }).join('') +
  '</div><button class="btn" onclick="exportCSV()">Exportar CSV</button></div></div>' +

  '<div class="grid g4 mb12">' +
    kpi('Entra em ' + H + ' meses', brl(totR), 'Somente contratos já assinados', 'pos') +
    kpi('Sai em ' + H + ' meses', brl(totS), 'Custos, impostos e equipe', 'neg') +
    kpi('Resultado acumulado', brl(totR - totS), 'Antes de novos fechamentos', cls(totR - totS)) +
    kpi('Melhor / pior mês', ymLabel(melhor.ym) + ' · ' + ymLabel(pior.ym), brl(melhor.resultado, 1) + ' contra ' + brl(pior.resultado, 1), '') +
  '</div>' +

  grafico(sr) +

  '<div class="tw mt12"><div class="tw-hd"><div class="tw-t">Detalhamento</div>' +
  '<span style="font-size:11.5px;color:var(--mute)">Saldo acumulado parte de ' + brl(S.config.saldoInicial) + ' em ' + (S.config.saldoInicialMes ? ymLabelL(S.config.saldoInicialMes) : ymLabelL(ymHoje())) + '</span></div>' +
  '<div class="tsc"><table><thead><tr><th>Mês</th><th class="tc">Cli</th><th class="tr">Receita</th><th class="tr">Impostos</th><th class="tr">Anúncios</th><th class="tr">Pessoas</th><th class="tr">Outros</th><th class="tr">Total sai</th><th class="tr">Resultado</th><th class="tr">Saldo</th></tr></thead>' +
  '<tbody>' + rows + '</tbody></table></div></div>';
}
function setHz(h){ S.config.horizonte = h; setConfig(); render(); }

function grafico(sr){
  var W = 1000, Hh = 230, pad = 34;
  var vals = sr.map(function(m){ return [m.receita, m.totalSaida]; });
  var mx = Math.max.apply(null, [].concat.apply([], vals).concat([1]));
  var bw = (W - pad*2) / sr.length;
  var bars = sr.map(function(m, i){
    var x = pad + i * bw;
    var hr = (m.receita / mx) * (Hh - 40);
    var hs = (m.totalSaida / mx) * (Hh - 40);
    var w = Math.max(4, bw * .3);
    return '<rect x="' + (x + bw*.16) + '" y="' + (Hh - 20 - hr) + '" width="' + w + '" height="' + hr + '" rx="2.5" fill="#34D399" opacity=".9"></rect>' +
           '<rect x="' + (x + bw*.16 + w + 3) + '" y="' + (Hh - 20 - hs) + '" width="' + w + '" height="' + hs + '" rx="2.5" fill="#FB7185" opacity=".9"></rect>' +
           '<text x="' + (x + bw/2) + '" y="' + (Hh - 6) + '" fill="#5A6475" font-size="10" font-family="JetBrains Mono" text-anchor="middle">' + ymLabel(m.ym).split('/')[0] + '</text>';
  }).join('');
  var linha = sr.map(function(m, i){
    var x = pad + i * bw + bw/2;
    var y = Hh - 20 - ((m.resultado > 0 ? m.resultado : 0) / mx) * (Hh - 40);
    return (i ? 'L' : 'M') + x.toFixed(1) + ',' + y.toFixed(1);
  }).join(' ');

  return '<div class="tw"><div class="tw-hd"><div class="tw-t">Entradas contra saídas</div>' +
    '<div class="rw-leg"><i><span class="dot" style="background:var(--mint)"></span>entra</i><i><span class="dot" style="background:var(--coral)"></span>sai</i><i><span class="dot" style="background:var(--volt)"></span>resultado</i></div></div>' +
    '<div style="padding:14px 8px"><svg viewBox="0 0 ' + W + ' ' + Hh + '" style="width:100%;height:auto;display:block">' +
    '<line x1="' + pad + '" y1="' + (Hh-20) + '" x2="' + (W-pad) + '" y2="' + (Hh-20) + '" stroke="#262D3A" stroke-width="1"></line>' +
    bars + '<path d="' + linha + '" fill="none" stroke="#7C5CFF" stroke-width="2" stroke-linejoin="round" opacity=".85"></path>' +
    '</svg></div></div>';
}

function exportCSV(){
  var sr = serie(ymHoje(), nf(S.config.horizonte) || 12);
  var L = ['Mes;Clientes;Receita;Impostos;Anuncios;Equipe;Prolabore;Freelancers;Ferramentas;Estrutura;Outros;TotalSaida;Resultado;SaldoAcumulado'];
  sr.forEach(function(m){
    L.push([ymLabelL(m.ym), m.clientes, m.receita, m.imposto, m.saida.anuncio, m.saida.pessoal, m.saida.prolabore,
      m.saida.freela, m.saida.ferramenta, m.saida.estrutura, m.saida.outros, m.totalSaida, m.resultado, m.saldo]
      .map(function(v){ return typeof v === 'number' ? v.toFixed(2).replace('.', ',') : v; }).join(';'));
  });
  var blob = new Blob(['\ufeff' + L.join('\n')], { type:'text/csv;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'projecao-2step-' + ymHoje() + '.csv';
  a.click();
  toast('CSV exportado', 'ok');
}

/* ================= SIMULADOR ================= */
var SIM = { excluir:{}, novos:0, ticket:0, deltaAnuncio:0, extraCusto:0 };
function simSet(k, v){ SIM[k] = v; render(); }
function simTogglaCli(id){ if(SIM.excluir[id]) delete SIM.excluir[id]; else SIM.excluir[id] = 1; render(); }
function simReset(){ SIM = { excluir:{}, novos:0, ticket:0, deltaAnuncio:0, extraCusto:0 }; render(); }

function vSim(){
  var H = nf(S.config.horizonte) || 12, ym = ymHoje();
  var M = metricas();
  var o = { excluir: SIM.excluir, novos: SIM.novos, ticket: SIM.ticket || Math.round(M.ticket), novosDesde: ymAdd(ym, 1), deltaAnuncio: SIM.deltaAnuncio, extraCusto: SIM.extraCusto };
  var base = serie(ym, H);
  var cen  = serie(ym, H, o);
  var fimB = base[base.length-1], fimC = cen[cen.length-1];
  var rwB = runway(), rwC = runway(o);
  var mudou = Object.keys(SIM.excluir).length || nf(SIM.novos) || nf(SIM.deltaAnuncio) || nf(SIM.extraCusto);

  var ativos = listaClientes().filter(ativoHoje);
  var chips = ativos.map(function(c){
    var on = !!SIM.excluir[c.id];
    return '<label class="chk ' + (on ? 'on' : '') + '" style="' + (on ? 'border-color:var(--coral);background:var(--coral-dim)' : '') + '">' +
      '<input type="checkbox" ' + (on ? 'checked' : '') + ' onchange="simTogglaCli(\'' + c.id + '\')">' +
      '<span style="flex:1">' + esc(c.nome) + '</span><span class="mono" style="color:var(--mute);font-size:12px">' + brl(c.mensalidade, 1) + '</span></label>';
  }).join('');

  /* quantos clientes para a meta */
  var meta = nf(S.config.metaResultado);
  var mAtual = mesCalc(ym);
  var falta = meta - mAtual.resultado;
  var liq = (M.ticket || 0) * (1 - nf(S.config.aliquota)/100);
  var precisa = liq > 0 ? Math.max(0, Math.ceil(falta / liq)) : 0;

  var linhas = cen.map(function(m, i){
    var b = base[i], d = m.saldo - b.saldo;
    return '<tr><td class="nm">' + ymLabelL(m.ym) + '</td>' +
      '<td class="tr mono" style="color:var(--mute)">' + brl(b.saldo) + '</td>' +
      '<td class="tr mono ' + cls(m.saldo) + '"><b>' + brl(m.saldo) + '</b></td>' +
      '<td class="tr mono ' + cls(d) + '">' + (Math.abs(d) < .01 ? '—' : (d > 0 ? '+' : '') + brl(d)) + '</td></tr>';
  }).join('');

  return '' +
  '<div class="hd"><div><h1>Simulador</h1><p>Mexa nas variáveis e veja o caixa reagir antes de decidir</p></div>' +
  '<div class="hd-act">' + (mudou ? '<button class="btn btn-d" onclick="simReset()">Limpar cenário</button>' : '') + '</div></div>' +

  '<div class="grid g3 mb12">' +
    '<div class="card"><div class="kpi-l">Se eu perder estes clientes</div>' +
    '<div style="display:grid;gap:7px;margin-top:12px;max-height:230px;overflow-y:auto">' +
    (chips || '<div style="color:var(--mute);font-size:13px">Nenhum cliente ativo cadastrado.</div>') + '</div></div>' +

    '<div class="card"><div class="kpi-l">Se eu fechar novos</div>' +
    '<div class="fg mt12"><label class="fl">Novos clientes por mês</label><input type="number" class="fi" value="' + (SIM.novos || '') + '" min="0" step="1" oninput="SIM.novos=this.value" onchange="render()"></div>' +
    '<div class="fg"><label class="fl">Ticket médio do novo</label><input type="number" class="fi" value="' + (SIM.ticket || Math.round(M.ticket) || '') + '" min="0" step="100" oninput="SIM.ticket=this.value" onchange="render()"></div>' +
    '<div class="hint">Considera entrada a partir de ' + ymLabelL(ymAdd(ym,1)) + ', acumulando mês a mês, sem churn.</div></div>' +

    '<div class="card"><div class="kpi-l">Se eu mexer nos custos</div>' +
    '<div class="fg mt12"><label class="fl">Verba de anúncio</label><input type="number" class="fi" value="' + (SIM.deltaAnuncio || '') + '" step="10" placeholder="0" oninput="SIM.deltaAnuncio=this.value" onchange="render()"><div class="hint">Em % sobre o que já está lançado. 50 aumenta metade, -30 corta um terço.</div></div>' +
    '<div class="fg"><label class="fl">Custo fixo novo por mês</label><input type="number" class="fi" value="' + (SIM.extraCusto || '') + '" step="100" placeholder="0" oninput="SIM.extraCusto=this.value" onchange="render()"><div class="hint">Contratação, sala, ferramenta que ainda não cadastrou.</div></div></div>' +
  '</div>' +

  '<div class="grid g4 mb12">' +
    kpi('Saldo em ' + ymLabel(fimC.ym) + ' hoje', brl(fimB.saldo), 'Cenário atual, sem mexer em nada', cls(fimB.saldo)) +
    kpi('Saldo no cenário', brl(fimC.saldo), (fimC.saldo - fimB.saldo >= 0 ? '+' : '') + brl(fimC.saldo - fimB.saldo) + ' de diferença', cls(fimC.saldo)) +
    kpi('Fôlego no cenário', (rwC >= 36 ? '36+' : rwC) + ' meses', 'Hoje são ' + (rwB >= 36 ? '36+' : rwB) + ' meses', rwC < rwB ? 'neg' : (rwC > rwB ? 'pos' : '')) +
    kpi('Para bater a meta', precisa + (precisa === 1 ? ' cliente' : ' clientes'), meta > 0 ? 'De ' + brl(M.ticket) + ' para chegar em ' + brl(meta) + '/mês de resultado' : 'Defina a meta de resultado em Parâmetros', meta > 0 ? 'vlt' : '') +
  '</div>' +

  '<div class="tw"><div class="tw-hd"><div class="tw-t">Saldo mês a mês: hoje contra o cenário</div>' +
  (mudou ? '<span class="pill p-vl">cenário ativo</span>' : '<span class="pill p-off">sem alterações</span>') + '</div>' +
  '<div class="tsc"><table><thead><tr><th>Mês</th><th class="tr">Saldo hoje</th><th class="tr">Saldo no cenário</th><th class="tr">Diferença</th></tr></thead><tbody>' + linhas + '</tbody></table></div></div>';
}

/* ================= CLIENTES ================= */
var fCli = 'todos';
function setFCli(f){ fCli = f; render(); }
function vCli(){
  var todos = listaClientes();
  var lista = todos.filter(function(c){
    if(fCli === 'todos') return true;
    if(fCli === 'ativo') return c.status === 'ativo';
    if(fCli === 'aviso') return c.status === 'aviso';
    return c.status === 'encerrado';
  });
  var M = metricas();

  var rows = lista.map(function(c){
    var u = ultimaMensalidade(c), fc = fimContrato(c), mg = margemCliente(c);
    var tempo = c.dataInicio ? ymDiff(ymOf(c.dataInicio), ymHoje()) : 0;
    var pillTxt = c.status === 'ativo' ? 'Ativo' : (c.status === 'aviso' ? 'Aviso prévio' : 'Encerrado');
    var pillCls = c.status === 'ativo' ? 'p-on' : (c.status === 'aviso' ? 'p-av' : 'p-off');
    return '<tr>' +
      '<td><div class="nm">' + esc(c.nome) + '</div><div class="sub">' + (c.servicos ? esc(c.servicos) : 'Sem serviços descritos') + '</div></td>' +
      '<td class="tr mono nm">' + brl(c.mensalidade) + '</td>' +
      '<td class="tc"><span class="pill ' + pillCls + '">' + pillTxt + '</span></td>' +
      '<td><div style="font-size:12.5px">' + dLabel(c.dataInicio) + '</div><div class="sub">' + (tempo >= 0 ? tempo + ' meses de casa' : 'começa em breve') + '</div></td>' +
      '<td><div style="font-size:12.5px">' + (c.renovaAuto ? 'Renovação automática' : (fc ? dLabel(fc) : 'Indeterminado')) + '</div>' +
        (u ? '<div class="sub" style="color:var(--amber)">Última mensalidade ' + dLabel(u) + '</div>' : '<div class="sub">Vence dia ' + (nf(c.diaVencimento)||10) + '</div>') + '</td>' +
      '<td class="tr mono ' + cls(mg.lucro) + '">' + brl(mg.lucro, 1) + '<div class="sub">' + mg.pct.toFixed(0) + '% de margem</div></td>' +
      '<td class="tr" style="white-space:nowrap">' +
        (c.status === 'ativo' ? '<button class="btn btn-s" onclick="pAbrir(\'' + c.id + '\')">Mídias</button> ' : '') +
        (c.status === 'ativo' ? '<button class="btn btn-s" onclick="mAviso(\'' + c.id + '\')">Aviso</button> ' : '') +
        '<button class="btn btn-s" onclick="mCliente(\'' + c.id + '\')">Editar</button></td>' +
      '</tr>';
  }).join('');

  return '' +
  '<div class="hd"><div><h1>Clientes</h1><p>' + M.ativos + ' ativos gerando ' + brl(M.mrr) + ' por mês</p></div>' +
  '<div class="hd-act"><div class="seg">' +
    [['todos','Todos',todos.length],['ativo','Ativos',todos.filter(function(c){return c.status==='ativo';}).length],
     ['aviso','Em aviso',todos.filter(function(c){return c.status==='aviso';}).length],
     ['encerrado','Encerrados',todos.filter(function(c){return c.status==='encerrado';}).length]]
    .map(function(f){ return '<button class="' + (fCli===f[0]?'on':'') + '" onclick="setFCli(\'' + f[0] + '\')">' + f[1] + ' ' + f[2] + '</button>'; }).join('') +
  '</div><button class="btn btn-p" onclick="mCliente()">+ Novo cliente</button></div></div>' +

  '<div class="tw">' + (lista.length ?
    '<div class="tsc"><table><thead><tr><th>Cliente</th><th class="tr">Mensalidade</th><th class="tc">Situação</th><th>Início</th><th>Contrato</th><th class="tr">Margem</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '<div class="mtot"><div><span>MRR da seleção</span><b class="pos">' + brl(lista.filter(ativoHoje).reduce(function(a,c){ return a + nf(c.mensalidade); }, 0)) + '</b></div>' +
    '<div><span>Contratos</span><b>' + lista.length + '</b></div></div>'
    : '<div class="empty"><b>Nenhum cliente por aqui</b>Cadastre o primeiro contrato para o app começar a projetar seu caixa.</div>') + '</div>';
}

/* ================= CUSTOS ================= */
var fCus = 'todos';
function setFCus(f){ fCus = f; render(); }
function vCus(){
  var todos = listaCustos();
  var lista = fCus === 'todos' ? todos : todos.filter(function(x){ return x.categoria === fCus; });
  var fixo = todos.reduce(function(a,x){ return a + valorMensalizado(x); }, 0);

  var rows = lista.map(function(x){
    var mens = valorMensalizado(x), ren = proximaRenovacao(x);
    var c = CAT[x.categoria] || CAT.outros;
    return '<tr style="' + (x.ativo === false ? 'opacity:.45' : '') + '">' +
      '<td><div class="nm">' + esc(x.nome) + '</div><div class="sub"><i class="dot" style="background:' + c.cor + '"></i> ' + c.nome +
        (x.categoria === 'pessoal' && x.comEncargos !== false ? ' · com encargos' : '') + '</div></td>' +
      '<td class="tr mono nm">' + (x.moeda === 'USD' ? 'US$ ' + nf(x.valor).toFixed(2) : brl(x.valor)) + '</td>' +
      '<td class="tc"><span class="pill ' + (x.recorrencia === 'mensal' ? 'p-cy' : x.recorrencia === 'anual' ? 'p-vl' : 'p-off') + '">' + REC[x.recorrencia || 'mensal'] + '</span></td>' +
      '<td class="tr mono">' + (mens ? brl(mens) : '—') + '</td>' +
      '<td><div style="font-size:12.5px">' + dLabel(x.dataInicio) + '</div>' +
        (ren ? '<div class="sub" style="color:var(--volt)">Renova ' + dLabel(ren) + '</div>' :
         x.dataFim ? '<div class="sub">Até ' + dLabel(x.dataFim) + '</div>' : '') + '</td>' +
      '<td class="tc"><label class="sw"><input type="checkbox" ' + (x.ativo === false ? '' : 'checked') + ' onchange="toggleCusto(\'' + x.id + '\')"><i></i></label></td>' +
      '<td class="tr"><button class="btn btn-s" onclick="mCusto(\'' + x.id + '\')">Editar</button></td>' +
      '</tr>';
  }).join('');

  var porCat = CATK.map(function(g){
    var v = todos.filter(function(x){ return x.categoria === g; }).reduce(function(a,x){ return a + valorMensalizado(x); }, 0);
    if(!v) return '';
    var p = fixo > 0 ? v / fixo * 100 : 0;
    return '<div style="margin-bottom:11px"><div class="flx sp" style="margin-bottom:5px">' +
      '<span style="font-size:12.5px"><i class="dot" style="background:' + CAT[g].cor + '"></i> ' + CAT[g].nome + '</span>' +
      '<span class="mono" style="font-size:12.5px">' + brl(v) + '</span></div>' +
      '<div class="bar"><i style="width:' + p + '%;background:' + CAT[g].cor + '"></i></div></div>';
  }).join('');

  return '' +
  '<div class="hd"><div><h1>Custos</h1><p>' + brl(fixo) + ' por mês na média, já com encargos e anuais diluídos</p></div>' +
  '<div class="hd-act"><button class="btn btn-p" onclick="mCusto()">+ Novo custo</button></div></div>' +

  '<div class="grid g2 mb12">' +
    '<div class="tw"><div class="tw-hd"><div class="tw-t">Peso de cada categoria</div><span class="mono" style="font-size:13px">' + brl(fixo) + '/mês</span></div>' +
    '<div style="padding:16px">' + (porCat || '<div style="color:var(--mute);font-size:13px">Nenhum custo cadastrado ainda.</div>') + '</div></div>' +
    '<div class="card"><div class="kpi-l">Ponto de equilíbrio</div>' +
    (function(){
      var aliq = nf(S.config.aliquota) / 100;
      var receitaNec = fixo / (1 - aliq);
      var M = metricas();
      var faltam = M.ticket > 0 ? Math.max(0, Math.ceil((receitaNec - M.mrr) / M.ticket)) : 0;
      return '<div class="kpi-v ' + (M.mrr >= receitaNec ? 'pos' : 'warn') + '">' + brl(receitaNec) + '</div>' +
        '<div class="kpi-s">Receita mensal para o resultado ficar em zero, já contando ' + pct(S.config.aliquota) + ' de imposto.<br><br>' +
        (M.mrr >= receitaNec ? 'Seu MRR atual de ' + brl(M.mrr) + ' cobre isso com ' + brl(M.mrr - receitaNec) + ' de folga.'
          : 'Faltam ' + brl(receitaNec - M.mrr) + ' — cerca de ' + faltam + ' cliente(s) no seu ticket médio.') + '</div>';
    })() + '</div>' +
  '</div>' +

  '<div class="tw"><div class="tw-hd"><div class="tw-t">Lançamentos</div>' +
  '<div class="seg"><button class="' + (fCus==='todos'?'on':'') + '" onclick="setFCus(\'todos\')">Todos</button>' +
  CATK.filter(function(g){ return todos.some(function(x){ return x.categoria === g; }); })
    .map(function(g){ return '<button class="' + (fCus===g?'on':'') + '" onclick="setFCus(\'' + g + '\')">' + CAT[g].nome + '</button>'; }).join('') +
  '</div></div>' +
  (lista.length ?
    '<div class="tsc"><table><thead><tr><th>Custo</th><th class="tr">Valor</th><th class="tc">Recorrência</th><th class="tr">Peso mensal</th><th>Vigência</th><th class="tc">Ativo</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
    : '<div class="empty"><b>Nenhum custo aqui</b>Cadastre ferramentas, verba de anúncio, equipe e pró-labore para a projeção ficar real.</div>') + '</div>';
}
function toggleCusto(id){ var x = S.custos[id]; x.ativo = x.ativo === false; setCusto(x); render(); }

/* ================= FECHAMENTO ================= */
function vMes(){
  var ym = MESREF || ymHoje();
  var rec = pendencias(ym), des = despesasDoMes(ym), m = mesCalc(ym);
  var recebido = rec.filter(function(r){ return r.pago; }).reduce(function(a,r){ return a + r.valor; }, 0);
  var pago = des.filter(function(d){ return d.pago; }).reduce(function(a,d){ return a + d.valor; }, 0);

  var rRows = rec.map(function(r){
    return '<tr>' +
      '<td class="tc"><label class="sw"><input type="checkbox" ' + (r.pago ? 'checked' : '') + ' onchange="marcarRecebimento(\'' + r.key + '\', this.checked)"><i></i></label></td>' +
      '<td><div class="nm">' + esc(r.cliente.nome) + '</div>' + (r.data ? '<div class="sub">Recebido em ' + dLabel(r.data) + '</div>' : '') + '</td>' +
      '<td class="mono" style="font-size:12.5px">' + dLabel(r.venc) + '</td>' +
      '<td class="tc">' + (r.pago ? '<span class="pill p-on">Recebido</span>' : (r.atrasado ? '<span class="pill p-cr">Atrasado</span>' : '<span class="pill p-off">A receber</span>')) + '</td>' +
      '<td class="tr mono nm">' + brl(r.valor) + '</td></tr>';
  }).join('');

  var dRows = des.map(function(d){
    var c = CAT[d.custo.categoria] || CAT.outros;
    return '<tr>' +
      '<td class="tc"><label class="sw"><input type="checkbox" ' + (d.pago ? 'checked' : '') + ' onchange="marcarPagamento(\'' + d.key + '\', this.checked)"><i></i></label></td>' +
      '<td><div class="nm">' + esc(d.custo.nome) + '</div><div class="sub"><i class="dot" style="background:' + c.cor + '"></i> ' + c.nome + '</div></td>' +
      '<td class="tc">' + (d.pago ? '<span class="pill p-on">Pago</span>' : '<span class="pill p-off">A pagar</span>') + '</td>' +
      '<td class="tr mono nm">' + brl(d.valor) + '</td></tr>';
  }).join('');

  return '' +
  '<div class="hd"><div><h1>Fechamento</h1><p>Marque o que realmente entrou e saiu — é isso que separa previsão de caixa de verdade</p></div>' +
  '<div class="hd-act"><button class="btn" onclick="mudaMes(-1)">◀</button>' +
  '<input type="month" class="fi" style="width:170px" value="' + ym + '" onchange="MESREF=this.value;render()">' +
  '<button class="btn" onclick="mudaMes(1)">▶</button></div></div>' +

  '<div class="grid g4 mb12">' +
    kpi('Previsto a receber', brl(m.receita), rec.length + ' mensalidades no mês', '') +
    kpi('Já recebido', brl(recebido), m.receita > 0 ? pct(recebido / m.receita * 100) + ' do previsto' : '—', recebido > 0 ? 'pos' : '') +
    kpi('Previsto a pagar', brl(m.totalSaida - m.imposto), des.length + ' lançamentos + ' + brl(m.imposto) + ' de imposto', '') +
    kpi('Já pago', brl(pago), (m.totalSaida - m.imposto) > 0 ? pct(pago / (m.totalSaida - m.imposto) * 100) + ' do previsto' : '—', pago > 0 ? 'neg' : '') +
  '</div>' +

  '<div class="grid g2">' +
    '<div class="tw"><div class="tw-hd"><div class="tw-t">Entradas</div><span class="mono pos" style="font-size:13px">' + brl(recebido) + ' / ' + brl(m.receita) + '</span></div>' +
    (rec.length ? '<div class="tsc"><table><thead><tr><th class="tc">Ok</th><th>Cliente</th><th>Vence</th><th class="tc">Situação</th><th class="tr">Valor</th></tr></thead><tbody>' + rRows + '</tbody></table></div>'
      : '<div class="empty"><b>Sem mensalidades</b>Nenhum contrato ativo neste mês.</div>') + '</div>' +

    '<div class="tw"><div class="tw-hd"><div class="tw-t">Saídas</div><span class="mono" style="font-size:13px">' + brl(pago) + ' / ' + brl(m.totalSaida - m.imposto) + '</span></div>' +
    (des.length ? '<div class="tsc"><table><thead><tr><th class="tc">Ok</th><th>Custo</th><th class="tc">Situação</th><th class="tr">Valor</th></tr></thead><tbody>' + dRows + '</tbody></table></div>'
      : '<div class="empty"><b>Sem custos</b>Nenhum custo cai neste mês.</div>') + '</div>' +
  '</div>';
}
function mudaMes(k){ MESREF = ymAdd(MESREF || ymHoje(), k); render(); }

/* ================= MARGEM ================= */
function vMarg(){
  var ativos = listaClientes().filter(ativoHoje);
  var m = mesCalc(ymHoje());
  var rows = ativos.map(function(c){
    var g = margemCliente(c);
    var dir = (c.custosDiretos || []).map(function(x){ return esc(x.nome) + ' ' + brl(x.valor, 1); }).join(' · ');
    return '<tr>' +
      '<td><div class="nm">' + esc(c.nome) + '</div><div class="sub">' + (dir || 'Sem custo direto alocado') + '</div></td>' +
      '<td class="tr mono">' + brl(c.mensalidade) + '</td>' +
      '<td class="tr mono" style="color:var(--mute)">' + brl(g.imposto) + '</td>' +
      '<td class="tr mono" style="color:var(--mute)">' + brl(g.diretos) + '</td>' +
      '<td class="tr mono" style="color:var(--mute)">' + brl(g.rateio) + '</td>' +
      '<td class="tr mono ' + cls(g.lucro) + '"><b>' + brl(g.lucro) + '</b></td>' +
      '<td class="tr"><div class="mono ' + cls(g.lucro) + '" style="font-size:13px">' + g.pct.toFixed(0) + '%</div>' +
        '<div class="bar" style="margin-top:5px;width:70px;margin-left:auto"><i style="width:' + Math.min(100, Math.max(0, g.pct)) + '%;background:' + (g.lucro < 0 ? 'var(--coral)' : 'var(--mint)') + '"></i></div></td>' +
      '<td class="tr"><button class="btn btn-s" onclick="mDiretos(\'' + c.id + '\')">Custos</button></td></tr>';
  }).join('');
  var negativos = ativos.filter(function(c){ return margemCliente(c).lucro < 0; });

  return '' +
  '<div class="hd"><div><h1>Margem por cliente</h1><p>Quanto sobra de cada contrato depois de imposto, custo direto e rateio da estrutura</p></div>' +
  '<div class="hd-act"><label class="chk ' + (S.config.ratear ? 'on' : '') + '"><input type="checkbox" ' + (S.config.ratear ? 'checked' : '') + ' onchange="S.config.ratear=this.checked;setConfig();render()">Ratear estrutura por receita</label></div></div>' +

  (negativos.length ? '<div class="note">' + negativos.length + ' cliente(s) com margem negativa: ' + negativos.map(function(c){ return esc(c.nome); }).join(', ') + '. Vale reajustar, reduzir escopo ou encerrar.</div>' : '') +

  '<div class="tw">' + (ativos.length ?
    '<div class="tsc"><table><thead><tr><th>Cliente</th><th class="tr">Mensalidade</th><th class="tr">Imposto</th><th class="tr">Custo direto</th><th class="tr">Rateio</th><th class="tr">Sobra</th><th class="tr">Margem</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '<div class="mtot"><div><span>Receita ativa</span><b class="pos">' + brl(m.receita) + '</b></div>' +
    '<div><span>Sobra total</span><b class="' + cls(ativos.reduce(function(a,c){ return a + margemCliente(c).lucro; }, 0)) + '">' + brl(ativos.reduce(function(a,c){ return a + margemCliente(c).lucro; }, 0)) + '</b></div>' +
    '<div><span>Custo de captação no mês</span><b class="neg">' + brl(m.saida.anuncio) + '</b></div></div>'
    : '<div class="empty"><b>Nenhum cliente ativo</b>A margem aparece assim que houver contrato vigente.</div>') + '</div>';
}

/* ================= USUÁRIOS ================= */
function vUsr(){
  var us = listaUsuarios();
  var eu = chaveEmail(EMAIL);
  var admins = us.filter(function(u){ return u.papel === 'admin'; }).length;

  var rows = us.map(function(u){
    var p = PAPEIS[u.papel] || PAPEIS.operacao;
    var sou = chaveEmail(u.email) === eu;
    return '<tr>' +
      '<td><div class="nm">' + esc(u.nome || u.email) + (sou ? ' <span class="pill p-vl">você</span>' : '') + '</div>' +
        '<div class="sub mono">' + esc(u.email) + '</div></td>' +
      '<td><span class="pill" style="background:' + p.cor + '22;color:' + p.cor + '">' + p.nome + '</span>' +
        '<div class="sub">' + p.desc + '</div></td>' +
      '<td class="tr" style="white-space:nowrap">' +
        '<button class="btn btn-s" onclick="mUsr(\'' + chaveEmail(u.email) + '\')">Editar</button> ' +
        (sou ? '' : '<button class="btn btn-s btn-d" onclick="delUsr(\'' + chaveEmail(u.email) + '\')">Remover</button>') +
      '</td></tr>';
  }).join('');

  return '' +
  '<div class="hd"><div><h1>Usuários</h1><p>Quem entra no app e o que cada um enxerga</p></div>' +
  '<div class="hd-act"><button class="btn btn-p" onclick="mUsr()">+ Liberar acesso</button></div></div>' +

  (semUsuarios() ? '<div class="note">Ainda não há ninguém cadastrado, então qualquer conta que faça login entra como administrador. Cadastre o seu e-mail (' + esc(EMAIL) + ') como Administrador agora — a partir daí, só quem estiver nesta lista entra.</div>' : '') +
  (!semUsuarios() && admins === 1 ? '<div class="note">Você é o único administrador. Se perder o acesso a este e-mail, ninguém consegue liberar outro pelo app — só apagando o nó <b>usuarios</b> direto no Console do Firebase.</div>' : '') +

  '<div class="tw">' + (us.length ?
    '<div class="tsc"><table><thead><tr><th>Pessoa</th><th>Papel</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
    : '<div class="empty"><b>Nenhum acesso liberado</b>Cadastre o seu e-mail primeiro, depois os da equipe.</div>') + '</div>' +

  '<div class="tw mt12"><div class="tw-hd"><div class="tw-t">Como liberar alguém</div></div><div style="padding:18px">' +
  '<div style="font-size:13.5px;line-height:1.7;color:var(--mute)">' +
  '<b style="color:var(--ink)">1.</b> No Console do Firebase, em Authentication › Users, clique em <b style="color:var(--ink)">Adicionar usuário</b> e crie o e-mail com uma senha provisória.<br>' +
  '<b style="color:var(--ink)">2.</b> Volte aqui, clique em <b style="color:var(--ink)">Liberar acesso</b> e cadastre o mesmo e-mail com o papel dele.<br>' +
  '<b style="color:var(--ink)">3.</b> Passe o e-mail e a senha. Ele entra e troca a senha por conta própria.' +
  '</div><div class="hint mt12">O passo 1 é no Console porque o navegador não permite criar usuário sem trocar de sessão — se fosse feito aqui, você seria deslogado.</div>' +
  '</div></div>';
}
function mUsr(k){
  var u = k ? S.usuarios[k] : { email:'', nome:'', papel:'operacao' };
  if(!u) return;
  modal(k ? 'Editar acesso' : 'Liberar acesso',
    '<div class="fr fr2">' +
      '<div class="fg"><label class="fl">Nome</label><input class="fi" id="u_nome" value="' + esc(u.nome) + '" placeholder="Como você chama a pessoa"></div>' +
      '<div class="fg"><label class="fl">E-mail</label><input type="email" class="fi" id="u_mail" value="' + esc(u.email) + '" ' + (k ? 'disabled style="opacity:.6"' : '') + ' placeholder="o mesmo do Firebase"></div>' +
    '</div>' +
    '<div class="fg"><label class="fl">Papel</label>' +
      Object.keys(PAPEIS).map(function(p){
        return '<label class="chk ' + (u.papel === p ? 'on' : '') + '" style="margin-bottom:8px">' +
          '<input type="radio" name="u_papel" value="' + p + '" ' + (u.papel === p ? 'checked' : '') + ' style="accent-color:var(--volt)" onchange="marcaPapel(this)">' +
          '<span style="flex:1"><b>' + PAPEIS[p].nome + '</b><div class="hint" style="margin:2px 0 0">' + PAPEIS[p].desc + '</div></span></label>';
      }).join('') + '</div>' +
    (k ? '' : '<div class="hint">Este e-mail precisa existir em Authentication › Users no Console do Firebase, senão a pessoa não consegue fazer login.</div>'),
    '<button class="btn" onclick="fecha()">Cancelar</button><button class="btn btn-p" onclick="saveUsr(\'' + (k || '') + '\')">Salvar acesso</button>');
}
function marcaPapel(el){
  var box = el.closest('.fg');
  if(box) box.querySelectorAll('.chk').forEach(function(c){ c.classList.toggle('on', c.contains(el) ? el.checked : false); });
}
function saveUsr(k){
  var mail = k ? S.usuarios[k].email : $('u_mail').value.trim().toLowerCase();
  if(!mail || mail.indexOf('@') < 0) return toast('Informe um e-mail válido', 'err');
  var sel = document.querySelector('input[name=u_papel]:checked');
  var u = { email:mail, nome:$('u_nome').value.trim() || mail.split('@')[0], papel: sel ? sel.value : 'operacao' };
  var ck = chaveEmail(mail);
  S.usuarios[ck] = u;
  save('usuarios/' + ck, u);
  if(ck === chaveEmail(EMAIL)) PAPEL = u.papel;
  fecha(); render();
  toast(k ? 'Acesso atualizado' : 'Acesso liberado', 'ok');
}
function delUsr(k){
  var u = S.usuarios[k];
  if(!u) return;
  if(chaveEmail(u.email) === chaveEmail(EMAIL)) return toast('Você não pode remover o próprio acesso', 'err');
  if(!confirm('Remover o acesso de ' + (u.nome || u.email) + '?\n\nEle deixa de entrar no app. A conta continua existindo no Firebase até você excluir por lá também.')) return;
  delete S.usuarios[k];
  del('usuarios/' + k);
  render();
  toast('Acesso removido');
}

/* ================= PARÂMETROS ================= */
function vCfg(){
  var c = S.config;
  return '' +
  '<div class="hd"><div><h1>Parâmetros</h1><p>Os números que sustentam toda a projeção</p></div></div>' +
  '<div class="grid g2">' +
    '<div class="tw"><div class="tw-hd"><div class="tw-t">Caixa</div></div><div style="padding:18px">' +
      '<div class="fr fr2"><div class="fg"><label class="fl">Saldo em caixa hoje</label><input type="number" class="fi" step="0.01" value="' + nf(c.saldoInicial) + '" onchange="cfgSet(\'saldoInicial\', this.value)"></div>' +
      '<div class="fg"><label class="fl">Referente a qual mês</label><input type="month" class="fi" value="' + (c.saldoInicialMes || ymHoje()) + '" onchange="cfgSet(\'saldoInicialMes\', this.value)"></div></div>' +
      '<div class="hint">O saldo acumulado da projeção parte daqui. Informe o que você tem em conta no início desse mês.</div>' +
      '<div class="fg mt18"><label class="fl">Meta de resultado por mês</label><input type="number" class="fi" step="100" value="' + nf(c.metaResultado) + '" onchange="cfgSet(\'metaResultado\', this.value)"><div class="hint">Usada no simulador para calcular quantos clientes faltam.</div></div>' +
    '</div></div>' +

    '<div class="tw"><div class="tw-hd"><div class="tw-t">Impostos e encargos</div></div><div style="padding:18px">' +
      '<div class="fg"><label class="fl">Alíquota sobre faturamento (%)</label><input type="number" class="fi" step="0.1" value="' + nf(c.aliquota) + '" onchange="cfgSet(\'aliquota\', this.value)">' +
      '<div class="hint">Simples Nacional efetivo. Agência de marketing costuma cair no Anexo III (6% na primeira faixa) ou no Anexo V, dependendo do fator R. Confirme com seu contador.</div></div>' +
      '<div class="fg"><label class="fl">Encargos sobre salário (%)</label><input type="number" class="fi" step="1" value="' + nf(c.encargos) + '" onchange="cfgSet(\'encargos\', this.value)">' +
      '<div class="hint">Aplicado sobre custos da categoria Equipe. Inclui FGTS, provisão de 13º e férias. 40% é uma referência conservadora para CLT no Simples.</div></div>' +
      '<div class="fg"><label class="fl">Dólar para ferramentas em USD</label><input type="number" class="fi" step="0.01" value="' + nf(c.dolar) + '" onchange="cfgSet(\'dolar\', this.value)"></div>' +
    '</div></div>' +
  '</div>' +

  '<div class="tw mt12"><div class="tw-hd"><div class="tw-t">Copias automaticas</div>' +
  '<span style="font-size:11.5px;color:var(--mute)">Uma por mes, guardadas no proprio banco</span></div>' +
  (listaBackups().length ?
    '<div class="tsc"><table><thead><tr><th>Copia</th><th>Gerada em</th><th class="tr">Conteudo</th><th></th></tr></thead><tbody>' +
    listaBackups().map(function(b){
      var d = {}; try{ d = JSON.parse(b.dados); }catch(e){}
      var nc = Object.keys(d.clientes || {}).length, nx = Object.keys(d.custos || {}).length;
      var manual = b.ym.indexOf('antes-') === 0;
      return '<tr><td><div class="nm">' + (manual ? 'Antes da ultima restauracao' : ymLabelL(b.ym)) + '</div>' +
        (manual ? '<div class="sub">Seguranca automatica</div>' : '') + '</td>' +
        '<td class="mono" style="font-size:12.5px">' + dLabel(String(b.criadoEm).slice(0,10)) + '</td>' +
        '<td class="tr" style="font-size:12.5px;color:var(--mute)">' + nc + ' clientes · ' + nx + ' custos</td>' +
        '<td class="tr"><button class="btn btn-s" onclick="restaurarSnapshot(\'' + b.ym + '\')">Restaurar</button></td></tr>';
    }).join('') + '</tbody></table></div>'
    : '<div class="empty"><b>Nenhuma copia ainda</b>A primeira e gerada automaticamente quando voce abrir o app com dados cadastrados.</div>') +
  '</div>' +

  '<div class="tw mt12"><div class="tw-hd"><div class="tw-t">Arquivo</div>' +
  '<span style="font-size:11.5px;color:var(--mute)">' + (S.config.ultimoDownload ? 'Ultimo download em ' + ymLabelL(S.config.ultimoDownload) : 'Nenhum download ainda') + '</span></div><div style="padding:18px">' +
    '<div class="flx" style="gap:9px">' +
    '<button class="btn" onclick="exportJSON()">Baixar backup</button>' +
    '<button class="btn" onclick="$(\'imp\').click()">Restaurar backup</button>' +
    '<input type="file" id="imp" accept=".json" class="hidden" onchange="importJSON(this)">' +
    '<button class="btn btn-d" onclick="limpar()">Apagar tudo</button></div>' +
    '<div class="hint mt12">O backup traz clientes, custos, fechamentos e parâmetros em um único arquivo JSON.</div>' +
  '</div></div>';
}
function cfgSet(k, v){ S.config[k] = (k === 'saldoInicialMes') ? v : nf(v); setConfig(); render(); }
function exportJSON(){
  var blob = new Blob([JSON.stringify(pacote(), null, 2)], { type:'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'backup-2step-' + hoje() + '.json';
  a.click();
  toast('Backup baixado', 'ok');
}
function importJSON(el){
  var f = el.files[0]; if(!f) return;
  var r = new FileReader();
  r.onload = function(){
    try{
      var d = JSON.parse(r.result);
      S.clientes = d.clientes || {}; S.custos = d.custos || {};
      S.recebimentos = d.recebimentos || {}; S.pagamentos = d.pagamentos || {};
      S.portais = d.portais || {};
      S.usuarios = d.usuarios || {};
      S.config = Object.assign({}, S.config, d.config || {});
      if(!MEM && DB) DB.ref(ROOT).set(pacote());
      render(); toast('Backup restaurado', 'ok');
    }catch(e){ toast('Arquivo inválido', 'err'); }
  };
  r.readAsText(f);
  el.value = '';
}
function limpar(){
  if(!confirm('Apagar clientes, custos e fechamentos? Baixe um backup antes se quiser voltar atrás.')) return;
  S.clientes = {}; S.custos = {}; S.recebimentos = {}; S.pagamentos = {}; S.portais = {};
  if(!MEM && DB) DB.ref(ROOT).set({ config:S.config });
  render(); toast('Dados apagados');
}

/* ================= MODAIS ================= */
function fecha(){ $('modal').innerHTML = ''; }
function modal(titulo, corpo, rodape, largo){
  $('modal').innerHTML = '<div class="mk" onclick="if(event.target===this)fecha()"><div class="md ' + (largo ? 'md-lg' : '') + '">' +
    '<div class="md-hd"><div class="md-t">' + titulo + '</div><button class="md-x" onclick="fecha()">×</button></div>' +
    '<div class="md-b">' + corpo + '</div><div class="md-f">' + rodape + '</div></div></div>';
}

function mCliente(id){
  var c = id ? S.clientes[id] : { id:'', nome:'', mensalidade:'', dataInicio:hoje(), diaVencimento:10, prazoMeses:12, renovaAuto:true, servicos:'', status:'ativo', obs:'' };
  modal(id ? 'Editar cliente' : 'Novo cliente',
    '<div class="fg"><label class="fl">Nome do cliente</label><input class="fi" id="c_nome" value="' + esc(c.nome) + '" placeholder="Espaço de eventos, buffet, etc"></div>' +
    '<div class="fr fr3">' +
      '<div class="fg"><label class="fl">Mensalidade</label><input type="number" class="fi" id="c_mens" step="0.01" value="' + nf(c.mensalidade) + '"></div>' +
      '<div class="fg"><label class="fl">Início do contrato</label><input type="date" class="fi" id="c_ini" value="' + (c.dataInicio || hoje()) + '"></div>' +
      '<div class="fg"><label class="fl">Dia de vencimento</label><input type="number" class="fi" id="c_dia" min="1" max="28" value="' + (nf(c.diaVencimento) || 10) + '"></div>' +
    '</div>' +
    '<div class="fr fr2">' +
      '<div class="fg"><label class="fl">Prazo em meses</label><input type="number" class="fi" id="c_prazo" min="0" value="' + nf(c.prazoMeses) + '"><div class="hint">Zero para prazo indeterminado.</div></div>' +
      '<div class="fg"><label class="fl">Situação</label><select class="fi" id="c_status">' +
        ['ativo','aviso','encerrado'].map(function(s){ return '<option value="' + s + '" ' + (c.status === s ? 'selected' : '') + '>' + ({ativo:'Ativo', aviso:'Em aviso prévio', encerrado:'Encerrado'})[s] + '</option>'; }).join('') +
      '</select></div>' +
    '</div>' +
    '<div class="fg"><label class="chk ' + (c.renovaAuto ? 'on' : '') + '"><input type="checkbox" id="c_auto" ' + (c.renovaAuto ? 'checked' : '') + ' onchange="this.parentNode.classList.toggle(\'on\',this.checked)">Renova automaticamente ao fim do prazo</label>' +
    '<div class="hint">Desmarcado, a receita deste cliente para no fim do prazo e a projeção passa a mostrar isso.</div></div>' +
    '<div class="fr fr2">' +
      '<div class="fg"><label class="fl">Data do aviso prévio</label><input type="date" class="fi" id="c_aviso" value="' + (c.dataAviso || '') + '"><div class="hint">Preenchendo aqui, a última mensalidade é 30 dias depois.</div></div>' +
      '<div class="fg"><label class="fl">Data de encerramento</label><input type="date" class="fi" id="c_enc" value="' + (c.dataEncerramento || '') + '"></div>' +
    '</div>' +
    '<div class="fg"><label class="fl">Serviços contratados</label><input class="fi" id="c_serv" value="' + esc(c.servicos) + '" placeholder="Tráfego Meta, criativos, CRM"></div>' +
    '<div class="fg"><label class="fl">Observações</label><textarea class="fi" id="c_obs">' + esc(c.obs) + '</textarea></div>',
    (id ? '<button class="btn btn-d" onclick="delCliente(\'' + id + '\')">Excluir</button>' : '') +
    '<button class="btn" onclick="fecha()">Cancelar</button><button class="btn btn-p" onclick="saveCliente(\'' + (id || '') + '\')">Salvar cliente</button>');
}
function saveCliente(id){
  var nome = $('c_nome').value.trim();
  if(!nome) return toast('Dê um nome ao cliente', 'err');
  var c = {
    id: id || uid(), nome: nome,
    mensalidade: nf($('c_mens').value),
    dataInicio: $('c_ini').value || hoje(),
    diaVencimento: nf($('c_dia').value) || 10,
    prazoMeses: nf($('c_prazo').value),
    renovaAuto: $('c_auto').checked,
    status: $('c_status').value,
    dataAviso: $('c_aviso').value || '',
    dataEncerramento: $('c_enc').value || '',
    servicos: $('c_serv').value.trim(),
    obs: $('c_obs').value.trim(),
    custosDiretos: (id && S.clientes[id] && S.clientes[id].custosDiretos) || []
  };
  if(c.status === 'aviso' && !c.dataAviso) c.dataAviso = hoje();
  setCliente(c); fecha(); render();
  toast(id ? 'Cliente atualizado' : 'Cliente cadastrado', 'ok');
}
function delCliente(id){
  if(!confirm('Excluir ' + S.clientes[id].nome + '? O histórico de recebimentos dele também sai das contas.')) return;
  delete S.clientes[id]; del('clientes/' + id);
  delete S.portais[id];  del('portais/' + id);
  fecha(); render(); toast('Cliente excluído');
}

function mAviso(id){
  var c = S.clientes[id];
  modal('Registrar aviso prévio',
    '<div style="font-size:13.5px;line-height:1.6;color:var(--mute);margin-bottom:16px">' + esc(c.nome) + ' avisou que vai sair. Informe a data do aviso: a mensalidade de ' + brl(c.mensalidade) + ' continua entrando por mais 30 dias e some da projeção depois disso.</div>' +
    '<div class="fg"><label class="fl">Data do aviso</label><input type="date" class="fi" id="a_data" value="' + hoje() + '" onchange="previewAviso()"></div>' +
    '<div class="card" id="a_prev" style="background:var(--slab2)"></div>',
    '<button class="btn" onclick="fecha()">Cancelar</button><button class="btn btn-p" onclick="salvaAviso(\'' + id + '\')">Registrar aviso</button>');
  previewAviso();
}
function previewAviso(){
  var d = $('a_data').value || hoje();
  var u = addDias(d, 30);
  $('a_prev').innerHTML = '<div class="kpi-l">Última mensalidade</div><div class="kpi-v warn" style="font-size:20px">' + dLabel(u) + '</div>' +
    '<div class="kpi-s">A receita deste cliente aparece na projeção até ' + ymLabelL(ymOf(u)) + ' e some a partir de ' + ymLabelL(ymAdd(ymOf(u), 1)) + '.</div>';
}
function salvaAviso(id){
  var c = S.clientes[id];
  c.status = 'aviso'; c.dataAviso = $('a_data').value || hoje();
  setCliente(c); fecha(); render(); toast('Aviso prévio registrado');
}

function mCusto(id){
  var x = id ? S.custos[id] : { id:'', nome:'', valor:'', categoria:'ferramenta', recorrencia:'mensal', moeda:'BRL', dataInicio:hoje(), dataFim:'', ativo:true, comEncargos:true, obs:'' };
  modal(id ? 'Editar custo' : 'Novo custo',
    '<div class="fr fr2">' +
      '<div class="fg"><label class="fl">Nome do custo</label><input class="fi" id="x_nome" value="' + esc(x.nome) + '" placeholder="Meta Ads captação, Kommo, salário Bruna"></div>' +
      '<div class="fg"><label class="fl">Categoria</label><select class="fi" id="x_cat" onchange="togEnc()">' +
        CATK.map(function(g){ return '<option value="' + g + '" ' + (x.categoria === g ? 'selected' : '') + '>' + CAT[g].nome + '</option>'; }).join('') +
      '</select></div>' +
    '</div>' +
    '<div class="fr fr3">' +
      '<div class="fg"><label class="fl">Valor</label><input type="number" class="fi" id="x_val" step="0.01" value="' + nf(x.valor) + '"></div>' +
      '<div class="fg"><label class="fl">Moeda</label><select class="fi" id="x_moe">' +
        ['BRL','USD'].map(function(m){ return '<option value="' + m + '" ' + (x.moeda === m ? 'selected' : '') + '>' + (m === 'BRL' ? 'Real' : 'Dólar') + '</option>'; }).join('') +
      '</select></div>' +
      '<div class="fg"><label class="fl">Recorrência</label><select class="fi" id="x_rec">' +
        Object.keys(REC).map(function(r){ return '<option value="' + r + '" ' + (x.recorrencia === r ? 'selected' : '') + '>' + REC[r] + '</option>'; }).join('') +
      '</select></div>' +
    '</div>' +
    '<div class="hint" style="margin:-4px 0 14px">Mensal repete todo mês. Anual cai uma vez por ano no mesmo mês da data de início. Pontual acontece só naquele mês.</div>' +
    '<div class="fr fr2">' +
      '<div class="fg"><label class="fl">Começa em</label><input type="date" class="fi" id="x_ini" value="' + (x.dataInicio || hoje()) + '"></div>' +
      '<div class="fg"><label class="fl">Termina em</label><input type="date" class="fi" id="x_fim" value="' + (x.dataFim || '') + '"><div class="hint">Deixe vazio se não tem fim previsto.</div></div>' +
    '</div>' +
    '<div class="fg" id="x_encbox"><label class="chk ' + (x.comEncargos !== false ? 'on' : '') + '"><input type="checkbox" id="x_enc" ' + (x.comEncargos !== false ? 'checked' : '') + ' onchange="this.parentNode.classList.toggle(\'on\',this.checked)">Aplicar ' + pct(S.config.encargos) + ' de encargos sobre este salário</label></div>' +
    '<div class="fg"><label class="fl">Observações</label><textarea class="fi" id="x_obs">' + esc(x.obs) + '</textarea></div>',
    (id ? '<button class="btn btn-d" onclick="delCusto(\'' + id + '\')">Excluir</button>' : '') +
    '<button class="btn" onclick="fecha()">Cancelar</button><button class="btn btn-p" onclick="saveCusto(\'' + (id || '') + '\')">Salvar custo</button>');
  togEnc();
}
function togEnc(){ var b = $('x_encbox'); if(b) b.style.display = $('x_cat').value === 'pessoal' ? '' : 'none'; }
function saveCusto(id){
  var nome = $('x_nome').value.trim();
  if(!nome) return toast('Dê um nome ao custo', 'err');
  var x = {
    id: id || uid(), nome: nome,
    valor: nf($('x_val').value),
    categoria: $('x_cat').value,
    moeda: $('x_moe').value,
    recorrencia: $('x_rec').value,
    dataInicio: $('x_ini').value || hoje(),
    dataFim: $('x_fim').value || '',
    comEncargos: $('x_enc') ? $('x_enc').checked : true,
    obs: $('x_obs').value.trim(),
    ativo: id ? S.custos[id].ativo !== false : true
  };
  setCusto(x); fecha(); render();
  toast(id ? 'Custo atualizado' : 'Custo cadastrado', 'ok');
}
function delCusto(id){
  if(!confirm('Excluir ' + S.custos[id].nome + '?')) return;
  delete S.custos[id]; del('custos/' + id); fecha(); render(); toast('Custo excluído');
}

function mDiretos(id){
  var c = S.clientes[id];
  var lin = (c.custosDiretos || []).map(function(x, i){
    return '<div class="fr fr2" style="align-items:end;margin-bottom:9px"><div class="fg" style="margin:0"><input class="fi" value="' + esc(x.nome) + '" onchange="dirSet(\'' + id + '\',' + i + ',\'nome\',this.value)"></div>' +
      '<div class="flx" style="gap:7px"><input type="number" class="fi" step="0.01" value="' + nf(x.valor) + '" onchange="dirSet(\'' + id + '\',' + i + ',\'valor\',this.value)">' +
      '<button class="btn btn-s btn-d" onclick="dirDel(\'' + id + '\',' + i + ')">×</button></div></div>';
  }).join('');
  var g = margemCliente(c);
  modal('Custos diretos de ' + esc(c.nome),
    '<div class="hint mb18">Custos que existem por causa deste cliente e sumiriam se ele saísse: ferramenta dedicada, freela do criativo, horas de gestão. Não inclua verba de anúncio da sua captação.</div>' +
    (lin || '<div style="color:var(--mute);font-size:13px;margin-bottom:12px">Nenhum custo direto alocado.</div>') +
    '<button class="btn btn-s mt12" onclick="dirAdd(\'' + id + '\')">+ Adicionar linha</button>' +
    '<div class="card mt18" style="background:var(--slab2)"><div class="kpi-l">Sobra hoje</div>' +
    '<div class="kpi-v ' + cls(g.lucro) + '" style="font-size:22px">' + brl(g.lucro) + '</div>' +
    '<div class="kpi-s">' + brl(c.mensalidade) + ' de mensalidade − ' + brl(g.imposto) + ' de imposto − ' + brl(g.diretos) + ' de custo direto' + (g.rateio ? ' − ' + brl(g.rateio) + ' de rateio' : '') + '</div></div>',
    '<button class="btn btn-p" onclick="fecha()">Pronto</button>');
}
function dirAdd(id){ var c = S.clientes[id]; c.custosDiretos = c.custosDiretos || []; c.custosDiretos.push({ nome:'', valor:0 }); setCliente(c); mDiretos(id); }
function dirSet(id, i, k, v){ var c = S.clientes[id]; c.custosDiretos[i][k] = (k === 'valor') ? nf(v) : v; setCliente(c); render(); }
function dirDel(id, i){ var c = S.clientes[id]; c.custosDiretos.splice(i, 1); setCliente(c); mDiretos(id); }

/* ================= LOGIN / BOOT ================= */
var ERROS = {
  'auth/invalid-email':          'E-mail invalido.',
  'auth/user-not-found':         'E-mail ou senha incorretos.',
  'auth/wrong-password':         'E-mail ou senha incorretos.',
  'auth/invalid-credential':     'E-mail ou senha incorretos.',
  'auth/invalid-login-credentials':'E-mail ou senha incorretos.',
  'auth/user-disabled':          'Este usuario foi desativado no Firebase.',
  'auth/too-many-requests':      'Muitas tentativas seguidas. Aguarde alguns minutos.',
  'auth/network-request-failed': 'Sem conexao com o servidor.',
  'auth/operation-not-allowed':  'Ative o login por E-mail/senha no Firebase Authentication.'
};
function tryLogin(){
  var err = $('pinErr');
  err.textContent = '';
  if(MEM){
    $('login').classList.add('hidden');
    $('app').classList.remove('hidden');
    render();
    return;
  }
  var email = $('email').value.trim(), senha = $('senha').value;
  if(!email || !senha){ err.textContent = 'Preencha e-mail e senha.'; return; }
  var bt = $('btEntrar');
  bt.disabled = true; bt.textContent = 'Entrando...';
  AUTH.signInWithEmailAndPassword(email, senha)
    .catch(function(e){
      err.textContent = ERROS[e.code] || ('Nao foi possivel entrar (' + e.code + ')');
      $('senha').value = '';
      $('senha').focus();
    })
    .then(function(){ bt.disabled = false; bt.textContent = 'Entrar'; });
}
function lock(){
  if(MEM){ fechaApp(); return; }
  AUTH.signOut();
}
function boot(){
  if(MEM){
    $('email').classList.add('hidden');
    $('senha').classList.add('hidden');
    $('btEntrar').textContent = 'Abrir demonstracao';
    $('lgNote').textContent = 'Firebase nao configurado: os dados sao de exemplo e nada e salvo.';
  }else{
    $('lgNote').textContent = 'Acesso restrito. Usuarios sao criados no Firebase Authentication.';
    $('senha').addEventListener('keydown', function(e){ if(e.key === 'Enter') tryLogin(); });
    $('email').addEventListener('keydown', function(e){ if(e.key === 'Enter') $('senha').focus(); });
    $('email').focus();
  }
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape') fecha(); });
}

/* dados de demonstração enquanto o Firebase não está ligado */
function seedDemo(){
  var hj = ymHoje();
  function d(ym, dia){ return ym + '-' + p2(dia); }
  var cs = [
    ['Espaço Villa Bella', 3800, ymAdd(hj,-14), 12, true,  'ativo', 'Tráfego Meta, criativos, CRM'],
    ['Buffet Solar',       2900, ymAdd(hj,-8),  12, true,  'ativo', 'Tráfego Meta, criativos'],
    ['Casa de Festas Aurora', 2400, ymAdd(hj,-5), 6, false, 'ativo', 'Tráfego Meta, auditoria comercial'],
    ['Quinta do Lago',     4500, ymAdd(hj,-20), 12, true,  'ativo', 'Tráfego, criativos, CRM, consultoria'],
    ['Chácara Recanto',    1900, ymAdd(hj,-3),  12, true,  'aviso', 'Tráfego Meta'],
    ['Espaço Terrazza',    2200, ymAdd(hj,-18), 12, true,  'encerrado', 'Tráfego Meta']
  ];
  cs.forEach(function(a, i){
    var id = 'demo_c' + i;
    S.clientes[id] = { id:id, nome:a[0], mensalidade:a[1], dataInicio:d(a[2], 5), diaVencimento:[5,10,15,10,20,10][i],
      prazoMeses:a[3], renovaAuto:a[4], status:a[5], servicos:a[6],
      dataAviso: a[5] === 'aviso' ? addDias(hoje(), -8) : '',
      dataEncerramento: a[5] === 'encerrado' ? d(ymAdd(hj,-2), 28) : '',
      custosDiretos: i === 3 ? [{ nome:'Freela de criativo', valor:600 }] : [] };
  });
  var xs = [
    ['Meta Ads · captação 2STEP', 2500, 'anuncio',   'mensal',  'BRL', ymAdd(hj,-12)],
    ['Kommo CRM',                  390, 'ferramenta','mensal',  'BRL', ymAdd(hj,-10)],
    ['Make.com',                    29, 'ferramenta','mensal',  'USD', ymAdd(hj,-9)],
    ['Canva Pro',                  480, 'ferramenta','anual',   'BRL', ymAdd(hj,2)],
    ['Salário · gestor de tráfego',2200,'pessoal',   'mensal',  'BRL', ymAdd(hj,-11)],
    ['Freelancer de edição',       900, 'freela',    'mensal',  'BRL', ymAdd(hj,-4)],
    ['Pró-labore',                5000, 'prolabore', 'mensal',  'BRL', ymAdd(hj,-14)],
    ['Contabilidade',              450, 'estrutura', 'mensal',  'BRL', ymAdd(hj,-14)]
  ];
  xs.forEach(function(a, i){
    var id = 'demo_x' + i;
    S.custos[id] = { id:id, nome:a[0], valor:a[1], categoria:a[2], recorrencia:a[3], moeda:a[4],
      dataInicio: a[5] + '-05', dataFim:'', ativo:true, comEncargos:true, obs:'' };
  });
  S.config.saldoInicial = 18000;
  S.config.saldoInicialMes = hj;
  S.config.metaResultado = 8000;
}

initDB();
