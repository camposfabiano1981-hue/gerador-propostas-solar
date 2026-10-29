/*
 * Conteúdo da proposta como modelo de documento (parágrafos, tabelas e imagens), no layout do modelo GE.
 * O mesmo modelo é convertido em Word (js/docx.js) e em PDF (js/pdf.js), garantindo conteúdo idêntico nos dois formatos.
 *
 * Unidades seguem o WordprocessingML: espaçamentos e larguras em twips (1/20 pt, base 9.360 = largura útil do modelo),
 * tamanhos de fonte em meios-pontos (sz), bordas em oitavos de ponto e imagens em EMU.
 */
window.App = window.App || {};

(function (App) {
  'use strict';

  const U = App.U;
  const C = App.Calc;

  const COR = {
    AZUL: '1E3A8A', DOURADO: 'F59E0B', CINZA: '6B7280', GRAFITE: '374151',
    ZEBRA: 'EFF6FF', BRANCO: 'FFFFFF', DESTAQUE: 'DBEAFE', VERDE: '166534', VERMELHO: 'DC2626'
  };
  const AZUL = COR.AZUL, DOURADO = COR.DOURADO, CINZA = COR.CINZA, GRAFITE = COR.GRAFITE;
  const ZEBRA = COR.ZEBRA, BRANCO = COR.BRANCO, DESTAQUE = COR.DESTAQUE, VERDE = COR.VERDE, VERMELHO = COR.VERMELHO;

  /* ------------------------------------------------------------ nós do modelo */

  function lista(v) { return v == null ? [] : (Array.isArray(v) ? v : [v]); }
  function R(texto, ro) { return { tipo: 'r', texto: texto == null ? '' : String(texto), ro: ro || {} }; }
  function P(filhos, po) { return { tipo: 'p', po: po || {}, filhos: lista(filhos) }; }
  function T(texto, po, ro) { return P([R(texto, ro)], po); }
  function vazio() { return P([], { after: 100 }); }
  function IMG(ref, cx, cy, nome) { return { tipo: 'img', ref: ref, cx: cx, cy: cy, nome: nome }; }
  function TC(filhos, o) { return { tipo: 'tc', o: o || {}, filhos: lista(filhos) }; }
  function TR(celulas, cabecalho, o) { return { tipo: 'tr', cabecalho: !!cabecalho, celulas: celulas, naoQuebrar: !!(o && o.naoQuebrar) }; }
  /** o: {jc: 'center' (tabela centralizada na página), manterJunto (a tabela inteira na mesma página)} */
  function TBL(larguras, linhas, o) {
    o = o || {};
    return { tipo: 'tbl', larguras: larguras, linhas: linhas, jc: o.jc || null, manterJunto: !!o.manterJunto };
  }

  function alinhar(jc) { return jc && jc !== 'left' ? { jc: jc } : null; }

  /**
   * Tabela de dados no padrão do modelo.
   * colunas: [{t, w, jc}] — cabeçalho azul, texto branco em negrito
   * linhas: [[cel, ...]] onde cel = string | {t, b, color, sz, jc, fill}; linha.fundo = cor de fundo da linha inteira
   * o: {sz, semCabecalho}
   */
  function tabela(colunas, linhas, o) {
    o = o || {};
    const rows = [];
    if (!o.semCabecalho) {
      rows.push(TR(colunas.map(function (c) {
        return TC(T(c.t, alinhar(c.jc), { b: true, color: BRANCO }), { w: c.w, fill: c.fill || AZUL });
      }), true));
    }
    linhas.forEach(function (lin, i) {
      const fill = i % 2 === 0 ? ZEBRA : BRANCO;
      rows.push(TR(lin.map(function (cel, j) {
        const c = typeof cel === 'object' && cel !== null ? cel : { t: cel };
        const col = colunas[j] || {};
        const jc = c.jc || col.jc;
        const ro = { b: c.b, color: c.color, sz: c.sz || o.sz, i: c.i };
        const conteudo = c.t === '' || c.t == null ? P([], alinhar(jc)) : T(c.t, alinhar(jc), ro);
        // atenção: não usar "lin.fill" (Array.prototype.fill) para a cor da linha
        return TC(conteudo, { w: col.w, fill: c.fill || lin.fundo || fill });
      })));
    });
    return TBL(colunas.map(function (c) { return c.w; }), rows);
  }

  /** Tabela chave/valor (1ª coluna em negrito; cabeçalho opcional). */
  function kv(larguras, linhas, cabecalho) {
    const cols = [{ t: cabecalho ? cabecalho[0] : '', w: larguras[0] }, { t: cabecalho ? cabecalho[1] : '', w: larguras[1] }];
    const lin = linhas.map(function (l) {
      const v = typeof l[1] === 'object' && l[1] !== null ? l[1] : { t: l[1] };
      return [{ t: l[0], b: true }, v];
    });
    return tabela(cols, lin, { semCabecalho: !cabecalho });
  }

  /** Tabela cujo cabeçalho é centralizado e as linhas seguem o alinhamento de cada coluna. */
  function tabelaCabecalhoCentral(cols, linhas, sz) {
    const rows = [TR(cols.map(function (c) {
      return TC(T(c.t, { jc: 'center' }, { b: true, color: BRANCO }), { w: c.w, fill: AZUL });
    }), true)];
    linhas.forEach(function (lin, i) {
      const fill = i % 2 === 0 ? ZEBRA : BRANCO;
      rows.push(TR(lin.map(function (cel, j) {
        const c = typeof cel === 'object' && cel !== null ? cel : { t: cel };
        const jc = c.jc || cols[j].jc;
        return TC(T(c.t, alinhar(jc), { b: c.b, color: c.color, sz: sz }), { w: cols[j].w, fill: fill });
      })));
    });
    return TBL(cols.map(function (c) { return c.w; }), rows);
  }

  function titulo(texto) {
    return T(texto, { keepNext: true, bottom: { sz: 8, space: 2, color: AZUL }, before: 300, after: 120 }, { b: true, color: AZUL, sz: 28 });
  }

  function encaixar(wImg, hImg, maxW, maxH) {
    const r = wImg / hImg;
    let cx = maxW, cy = Math.round(maxW / r);
    if (cy > maxH) { cy = maxH; cx = Math.round(maxH * r); }
    return { cx: cx, cy: cy };
  }

  /** Nº de casas decimais significativas (até 4) — tarifas como 0,9762 mantêm as 4 casas. */
  function decimais(v) {
    for (let d = 0; d <= 4; d++) if (Math.abs(v * Math.pow(10, d) - Math.round(v * Math.pow(10, d))) < 1e-9) return d;
    return 4;
  }

  function substituir(texto, vars) {
    return String(texto || '').replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; });
  }

  /* ------------------------------------------------------------ blocos visuais da proposta */

  const TONS = { azul: ['F8FAFF', 'DBEAFE', AZUL], verde: ['F0FDF4', 'BBF7D0', '15803D'], ouro: ['FFFBEB', 'FDE68A', 'B45309'] };

  /** Título de seção: número dourado e título azul, com subtítulo opcional; `quebra` começa em página nova. */
  function tituloSecao(n, texto, sub, quebra) {
    const out = [P([R(n + '   ', { b: true, color: DOURADO, sz: 44 }), R(texto, { b: true, color: AZUL, sz: 34 })],
      { keepNext: true, quebra: !!quebra, before: quebra ? 0 : 360, after: sub ? 0 : 160 })];
    if (sub) out.push(T(sub, { keepNext: true, after: 200 }, { color: CINZA, sz: 20 }));
    return out;
  }

  function subtitulo(texto, antes) { return T(texto, { keepNext: true, before: antes != null ? antes : 260, after: 100 }, { b: true, color: AZUL, sz: 24 }); }

  function espaco(w) { return TC(P([], { after: 0 }), { w: w, semBorda: true }); }

  /** Cartão de indicador: rótulo, valor em destaque, complemento e nota em verde opcional (tom: azul, verde ou ouro). */
  function cartao(c, w) {
    const tom = TONS[c.tom || 'azul'];
    const filhos = [T(c.rot, { after: 20 }, { color: CINZA, sz: 17 }), T(c.valor, { after: 20 }, { b: true, color: tom[2], sz: c.sz || 34 }),
      c.sub ? T(c.sub, c.nota ? { after: 20 } : null, { color: '475569', sz: 16 }) : P([])];
    if (c.nota) filhos.push(T(c.nota, null, { b: true, color: '15803D', sz: 15 }));
    return TC(filhos,
    { w: w, fill: tom[0], borda: { sz: 6, cor: tom[1] }, mar: { t: 120, b: 120, l: 200, r: 140 }, vAlign: 'top' });
  }

  /** Cartões em grade (2 a 4 colunas), com espaço entre eles. */
  function grade(itens, colunas, celula) {
    const gap = 200;
    const wc = Math.floor((9360 - gap * (colunas - 1)) / colunas);
    const larg = [];
    for (let i = 0; i < colunas; i++) { if (i) larg.push(gap); larg.push(wc); }
    const linhas = [];
    for (let i = 0; i < itens.length; i += colunas) {
      if (i) linhas.push(TR(larg.map(function (w) { return TC(P([], { after: 0 }), { w: w, semBorda: true, mar: { t: 0, b: 0, l: 0, r: 0 } }); })));
      const cel = [];
      for (let j = 0; j < colunas; j++) {
        if (j) cel.push(espaco(gap));
        cel.push(itens[i + j] ? celula(itens[i + j], wc) : espaco(wc));
      }
      linhas.push(TR(cel, false, { naoQuebrar: true }));
    }
    return TBL(larg, linhas);
  }

  /** Barra horizontal proporcional (conta de hoje × conta com o sistema). */
  function barra(rot, valor, frac, cor, extra) {
    const wRot = 2300, wMax = 7060;
    const wBar = Math.max(380, Math.round(wMax * Math.max(0, Math.min(1, frac))));
    const dentro = frac > 0.35;
    const cel = [TC(T(rot, null, { b: true, sz: 19 }), { w: wRot, semBorda: true }),
      TC(dentro ? T(valor, null, { b: true, color: BRANCO, sz: 20 }) : P([]), { w: wBar, fill: cor, borda: { sz: 4, cor: cor }, mar: { t: 110, b: 110, l: 160, r: 80 } })];
    const larg = [wRot, wBar];
    if (wMax - wBar > 0) {
      cel.push(TC(dentro ? (extra ? T(extra, null, { b: true, color: '15803D', sz: 22 }) : P([])) :
        P([R(valor + '    ', { b: true, color: cor, sz: 20 }), R(extra || '', { b: true, color: '15803D', sz: 22 })]), { w: wMax - wBar, semBorda: true, mar: { t: 0, b: 0, l: 160, r: 0 } }));
      larg.push(wMax - wBar);
    }
    return TBL(larg, [TR(cel, false, { naoQuebrar: true })]);
  }

  /** Lista com marcador colorido (✔, ✖…) em uma ou mais colunas. */
  function listaMarcada(itens, simbolo, cor, colunas) {
    const n = colunas || 1;
    const w = Math.floor(9360 / n);
    const linhas = [];
    for (let i = 0; i < itens.length; i += n) {
      const cel = [];
      for (let j = 0; j < n; j++) {
        const x = itens[i + j];
        cel.push(TC(x ? P([R(simbolo + '  ', { b: true, color: cor }), R(x, { sz: 19 })]) : P([]), { w: w, semBorda: true, mar: { t: 40, b: 40, l: 40, r: 140 }, vAlign: 'top' }));
      }
      linhas.push(TR(cel));
    }
    const larg = [];
    for (let j = 0; j < n; j++) larg.push(w);
    return TBL(larg, linhas);
  }

  function somarDias(iso, n) {
    const d = new Date(String(iso || U.todayISO()) + 'T12:00:00');
    d.setDate(d.getDate() + (parseInt(n, 10) || 0));
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  /* ------------------------------------------------------------ montagem */

  /**
   * Monta o modelo do documento.
   * @param logo {w, h} dimensões do logotipo em pixels (para manter a proporção)
   * @returns {{papel, k, corpo, cabecalho, rodape}}
   */
  function montar(p, r, ctx, cliente, logo) {
    const emp = ctx.empresa;
    const textos = Object.assign({}, ctx.textos, p.textos || {});
    const prem = r.premissas;
    const papel = emp.papel === 'a4' ? { w: 11906, h: 16838 } : { w: 12240, h: 15840 };
    const k = (papel.w - 2880) / 9360;
    const hib = r.hibridoAtivo && r.hibrido;
    const arm = r.armazenamentoAtivo ? r.hibrido : null;
    const cen = r.cen;
    const temArm = !!(arm && cen && cen.n > 0);
    const temFV = r.incluiFV && r.kwp > 0;
    const conc = r.concessionaria ? r.concessionaria.nome : '';
    const nomeCliente = (cliente && cliente.nome) || 'Cliente';
    const cidadeUF = [r.cidade, r.uf].filter(Boolean).join(' / ');
    const inv = temFV ? r.inversor : null, mod = temFV ? r.modulo : null;
    const bat = arm ? arm.bateria : null;
    const H = r.fin.horizonte;
    const tf = r.tarifas;
    const tou = r.modalidade.id !== 'conv';
    const grupoA = r.grupo === 'A';
    let sec = 0;
    const projetos = r.projetos || [];
    // a seção de projetos realizados (quando houver) desloca o dimensionamento para o item 4
    const imagens = {};

    const vars = {
      empresa: emp.razao, empresaCurta: emp.nomeCurto || emp.razao, cidadeEmpresa: [emp.cidade, emp.uf].filter(Boolean).join('/'),
      registroTipo: emp.registroTipo || '', registro: emp.registro || '', concessionaria: conc || 'concessionária',
      inversor: inv ? inv.fabricante : '', modulo: mod ? mod.fabricante : '', bateria: bat ? bat.fabricante : '',
      fdg: U.fmt(r.fdg, 3), fdgIcone: r.fdgOk ? '✅' : '⚠️', cliente: nomeCliente, cidade: r.cidade || ''
    };
    vars.fdi = vars.fdg; vars.fdiIcone = vars.fdgIcone; // marcadores antigos em textos personalizados
    const t = function (x) { return substituir(x, vars); };
    const rs = function (v) { return 'R$' + U.fmt(v, Math.max(2, decimais(v))); };

    const b = [];
    const f = r.fin;
    const a1 = f.anos[0];
    const wTexto = Math.round(5943600 * k); // largura útil em EMU
    const abrir = function (texto, sub, quebra) { tituloSecao(String(++sec), texto, sub, quebra).forEach(function (n) { b.push(n); }); };
    const reducao = a1.contaSem > 0 ? 1 - a1.contaCom / a1.contaSem : 0;
    const pct = Math.round(reducao * 100);
    const validoAte = U.dataBR(somarDias(p.data, p.validadeDias || emp.validadeDias || 5));
    const fone = String(emp.telefone || '').trim();
    const garantiaAnos = function (e) { return e && U.num(e.garantia) > 0 ? U.fmtSmart(U.num(e.garantia), 0) + ' anos' : 'conforme fabricante'; };
    const nomeEq = function (e) { return e ? [e.fabricante, e.modelo].filter(Boolean).join(' ') : ''; };
    const reais = function (v) { return U.brl(Math.round(v)).replace(/,00$/, ''); }; // valor arredondado, sem centavos
    const valorCurto = function (v) { return Math.abs(v) >= 1e6 ? 'R$ ' + U.fmt(v / 1e6, 2) + ' mi' : reais(v); };
    const pags = r.pagamentos || [];
    const maxParcelas = pags.reduce(function (m, pg) { return Math.max(m, parseInt(pg.prazo, 10) || 1); }, 1);
    const semRot = temFV ? 'Sem energia solar' : 'Sem o sistema';
    const comRot = temFV ? (temArm ? 'Com energia solar e baterias' : 'Com energia solar') : 'Com o sistema';
    const disp = r.disponibilidade;

    /* ---------- CAPA */
    const lc = encaixar(logo.w, logo.h, 2743200, 1371600);
    b.push(P(IMG('logo', lc.cx, lc.cy, 'Logotipo'), { before: 240, after: 300, jc: 'center' }));
    b.push(T('PROPOSTA DE ENERGIA SOLAR', { after: 100, jc: 'center' }, { b: true, color: DOURADO, sz: 20 }));
    const manchete = temFV && pct >= 30 ? ['Energia do sol,', 'conta de luz ' + pct + '% menor']
      : (temArm && !temFV ? ['Energia armazenada:', 'economia e segurança'] : ['Sua energia,', 'mais econômica']);
    b.push(P([R(manchete[0], { b: true, color: AZUL, sz: 54 })], { jc: 'center', after: 0 }));
    b.push(P([R(manchete[1], { b: true, color: '2563EB', sz: 54 })], { jc: 'center', after: 120 }));
    const tipoNome = r.bessAtivo
      ? (temFV ? 'Sistema fotovoltaico + armazenamento (BESS)' : 'Sistema de armazenamento de energia (BESS)')
      : 'Sistema fotovoltaico ' + (hib ? 'híbrido (com baterias)' : 'conectado à rede');
    const subt = tipoNome + ' · ' + [temFV ? U.kwp(r.kwp) + ' kWp' : '', temArm ? U.fmtSmart(arm.capInstalada, 2) + ' kWh' : ''].filter(Boolean).join(' + ');
    b.push(T(subt, { after: 160, jc: 'center' }, { color: CINZA, sz: 24 }));
    if (App.Arte) {
      const fx = App.Arte.faixaCapa();
      imagens.capa = fx.dataURL;
      b.push(P(IMG('capa', wTexto, Math.round(wTexto * fx.proporcao), 'Faixa da capa'), { before: 600, after: 0, jc: 'center' }));
    }
    const AZUL_CAPA = AZUL, CHIP = '2E4C9C', TXT_CLARO = 'DBEAFE';
    const celCapa = function (filhos, w, o) { return TC(filhos, Object.assign({ w: w, fill: AZUL_CAPA, borda: { sz: 4, cor: AZUL_CAPA }, mar: { t: 80, b: 80, l: 220, r: 160 } }, o || {})); };
    const chip = function (valor, rot, ouro) {
      return TC([T(valor, { after: 0 }, { b: true, color: ouro ? '1F2937' : BRANCO, sz: 30 }), T(rot, null, { color: ouro ? '3F2A00' : TXT_CLARO, sz: 16 })],
        { w: 2880, fill: ouro ? 'F6A81C' : CHIP, borda: { sz: 4, cor: ouro ? 'F6A81C' : CHIP }, mar: { t: 160, b: 160, l: 200, r: 120 } });
    };
    const vaoCapa = function (w) { return TC(P([], { after: 0 }), { w: w, fill: AZUL_CAPA, borda: { sz: 4, cor: AZUL_CAPA }, mar: { t: 0, b: 0, l: 0, r: 0 } }); };
    const chips = [];
    if (temFV) chips.push(chip(U.kwp(r.kwp) + ' kWp', 'potência'), chip('≈ ' + U.fmt(r.geracaoMensal, 0) + ' kWh', 'geração por mês'));
    if (temArm) chips.push(chip(U.fmtSmart(arm.capInstalada, 2) + ' kWh', 'armazenamento'));
    chips.splice(2);
    chips.push(chip(f.economiaMes1 > 0 ? reais(f.economiaMes1) : U.brl(r.total), f.economiaMes1 > 0 ? 'economia por mês*' : 'investimento', true));
    while (chips.length < 3) chips.unshift(chip(r.tecnologia ? r.tecnologia.split(' ')[0] : '—', 'tecnologia'));
    // grade: margem, destaque, vão, destaque, vão, destaque, margem (os vãos azuis separam os destaques)
    const LC = [180, 2880, 180, 2880, 180, 2880, 180];
    b.push(TBL(LC, [
      TR([celCapa([T('PREPARADA PARA', { before: 120, after: 0 }, { color: 'BFDBFE', sz: 18 }), T(nomeCliente, { after: 0 }, { b: true, color: BRANCO, sz: 48 }),
        T(cidadeUF || ' ', { after: 160 }, { color: TXT_CLARO, sz: 24 })], 9360, { span: 7 })]),
      TR([vaoCapa(180), chips[0], vaoCapa(180), chips[1], vaoCapa(180), chips[2], vaoCapa(180)]),
      TR([celCapa(P([], { after: 0 }), 9360, { span: 7, mar: { t: 60, b: 60, l: 0, r: 0 } })]),
      TR([celCapa(P([R('Nº ', { color: TXT_CLARO, sz: 18 }), R(p.numero, { b: true, color: BRANCO, sz: 18 })]), 3240, { span: 2 }),
        celCapa(P([R('Emitida em ', { color: TXT_CLARO, sz: 18 }), R(U.dataBR(p.data), { b: true, color: BRANCO, sz: 18 })]), 3060, { span: 2 }),
        celCapa(P([R('Válida até ', { color: TXT_CLARO, sz: 18 }), R(validoAte, { b: true, color: BRANCO, sz: 18 })]), 3060, { span: 3 })]),
      TR([celCapa([T('Responsável: ' + (emp.responsavel || emp.razao) + (fone ? ' · WhatsApp ' + fone : ''), { after: 20 }, { color: TXT_CLARO, sz: 18 }),
        f.economiaMes1 > 0 ? T('*estimativa do 1º ano, detalhada nas páginas seguintes', { after: 160 }, { color: '93C5FD', sz: 15 }) : P([], { after: 160 })], 9360, { span: 7 })])
    ], { manterJunto: true }));
    b.push(T(emp.razao + '  │  CNPJ ' + emp.cnpj + (emp.registro ? '  │  ' + emp.registroTipo + ' ' + emp.registro : ''), { before: 160, jc: 'center', sectPr: 'capa' }, { color: CINZA, sz: 16 }));

    /* ---------- RESUMO */
    abrir('Sua proposta em uma página', 'O essencial para decidir. Os detalhes estão nas páginas seguintes.');
    const cartoesResumo = [
      { rot: 'Investimento', valor: U.brl(r.total), sub: maxParcelas > 1 ? 'à vista ou parcelado em até ' + maxParcelas + 'x' : 'à vista' },
      { rot: 'Economia no 1º ano', valor: valorCurto(f.economiaAno1), sub: '≈ ' + valorCurto(f.economiaMes1) + ' por mês', tom: 'verde' },
      { rot: 'O investimento volta em', valor: f.paybackSimples != null ? U.anosMeses(f.paybackSimples) : 'mais de ' + H + ' anos', sub: 'depois disso, a economia é lucro', tom: 'ouro' },
      { rot: 'Economia em ' + H + ' anos', valor: valorCurto(f.economiaTotal), sub: 'com reajuste de ' + U.fmtSmart(prem.inflacaoTarifa * 100, 1) + '% ao ano na tarifa' }
    ];
    b.push(grade(cartoesResumo, 2, cartao));
    if (a1.contaSem > 0) {
      b.push(subtitulo('Sua conta de luz por mês', 200));
      b.push(barra('Hoje', U.brl(a1.contaSem), 1, '94A3B8'));
      b.push(P([], { after: 40 })); // tabelas vizinhas se fundem no Word: um parágrafo entre elas
      b.push(barra(comRot, U.brl(a1.contaCom), a1.contaSem > 0 ? a1.contaCom / a1.contaSem : 0, '2563EB', pct > 0 ? '−' + pct + '%' : ''));
    }
    b.push(subtitulo('O que você recebe', 200));
    const recebe = [];
    if (temFV && mod) recebe.push(r.nModulos + ' módulos ' + nomeEq(mod) + ' de ' + U.fmtSmart(mod.potencia, 0) + ' Wp');
    if (temFV && inv) recebe.push((r.nInversores > 1 ? r.nInversores + ' × ' : '') + (r.micro ? 'Microinversores ' : (hib ? 'Inversor híbrido ' : 'Inversor ')) + nomeEq(inv) + ' com acompanhamento pelo celular');
    if (temArm && bat) recebe.push((r.bessAtivo ? 'Armazenamento ' : 'Baterias ') + nomeEq(bat) + ' — ' + U.fmtSmart(arm.capInstalada, 2) + ' kWh');
    if (temFV) recebe.push('Estrutura de fixação e materiais elétricos');
    recebe.push('Projeto elétrico, ART e homologação' + (conc ? ' na ' + conc : ''));
    recebe.push('Instalação por equipe técnica' + (emp.registroTipo ? ' registrada no ' + emp.registroTipo : ''));
    const gar = [];
    if (mod) gar.push('módulos ' + C.garantiaModulo(mod));
    if (inv) gar.push((hib ? 'inversor híbrido ' : 'inversor ') + garantiaAnos(inv));
    if (temArm && bat) gar.push((r.bessAtivo ? 'BESS ' : 'baterias ') + garantiaAnos(bat));
    if (textos.garantiaInstalacao) gar.push('instalação ' + t(textos.garantiaInstalacao));
    if (gar.length) recebe.push('Garantias: ' + gar.join('; '));
    b.push(listaMarcada(recebe, '✓', '15803D', 2));
    const pFin = pags.filter(function (pg) { return !/cart/i.test(pg.label) && pg.prazo !== '1x'; })
      .sort(function (x, y) { return (parseInt(y.prazo, 10) || 0) - (parseInt(x.prazo, 10) || 0); })[0];
    // como pagar: todas as opções em cartões, na ordem cadastrada (rótulo antes do " — " e o detalhe, como a taxa, no complemento)
    const comoPagar = pags.map(function (pg) {
      const partes = String(pg.label || '').split(' — ');
      const detalhe = partes.slice(1).join(' — ');
      if (pg.prazo === '1x') return { rot: partes[0], valor: U.brl(pg.total), sub: [detalhe, 'melhor preço'].filter(Boolean).join(' · '), sz: 26 };
      const semAcrescimo = Math.abs(pg.total - r.total) < 1;
      return {
        rot: partes[0], valor: (parseInt(pg.prazo, 10) || 1) + ' × ' + U.brl(pg.parcela), sz: 26,
        sub: [detalhe, semAcrescimo ? (/sem acr/i.test(detalhe) ? '' : 'sem acréscimo') : 'total ' + U.brl(pg.total)].filter(Boolean).join(' · '),
        nota: f.economiaMes1 > pg.parcela ? 'parcela menor que a economia do mês' : ''
      };
    });
    if (comoPagar.length) {
      b.push(subtitulo('Como pagar', 200));
      b.push(grade(comoPagar, comoPagar.length === 1 ? 2 : (comoPagar.length === 4 ? 2 : Math.min(3, comoPagar.length)), cartao));
    }
    const notas = [];
    if (comoPagar.length && textos.notaPagamento) notas.push([textos.notaPagamento, CINZA, 15]);
    if (p.condicoesObs) notas.push(['Observações: ' + p.condicoesObs, GRAFITE, 17]);
    notas.forEach(function (n, i) { b.push(T(n[0], { before: i ? 0 : 60, after: i === notas.length - 1 ? 120 : 0 }, { color: n[1], sz: n[2] })); });
    const cta = [TC([T('Proposta válida até ' + validoAte, { after: 20 }, { b: true, color: BRANCO, sz: 24 }),
      T('Para aprovar, assine a última página' + (fone ? ' ou responda pelo WhatsApp.' : '.'), null, { color: TXT_CLARO, sz: 18 })],
    { w: fone ? 6160 : 9360, fill: AZUL, borda: { sz: 4, cor: AZUL }, mar: { t: 160, b: 160, l: 260, r: 160 } })];
    if (fone) cta.push(TC(T('WhatsApp ' + fone, { jc: 'center' }, { b: true, color: BRANCO, sz: 22 }), { w: 3200, fill: '22C55E', borda: { sz: 4, cor: '22C55E' }, mar: { t: 160, b: 160, l: 120, r: 120 } }));
    if (b[b.length - 1].tipo === 'tbl') b.push(P([], { after: 120 })); // tabelas vizinhas se fundem no Word: um parágrafo entre elas
    b.push(TBL(fone ? [6160, 3200] : [9360], [TR(cta, false, { naoQuebrar: true })]));

    /* ---------- APRESENTAÇÃO */
    const nomeEmp = emp.nomeCurto || emp.razao;
    abrir('Apresentação da empresa', 'Quem vai cuidar do seu projeto, do primeiro contato à energia gerando.', true);
    b.push(T(t(textos.apresentacao), { after: 120 }, { sz: 21 }));
    const difs = (textos.diferenciais || []).filter(function (d) { return d && (d.titulo || d.texto); });
    if (difs.length) {
      b.push(subtitulo('Por que escolher a ' + nomeEmp));
      b.push(grade(difs, difs.length <= 4 && difs.length % 2 === 0 ? 2 : 3, function (d, w) {
        return TC([P([R(d.icone ? d.icone + '  ' : '', { sz: 24 }), R(t(d.titulo || ''), { b: true, color: AZUL, sz: 21 })], { after: 40 }), T(t(d.texto || ''), null, { color: '475569', sz: 17 })],
          { w: w, fill: 'F8FAFF', borda: { sz: 6, cor: 'DBEAFE' }, mar: { t: 140, b: 140, l: 180, r: 140 }, vAlign: 'top' });
      }));
    }
    if (emp.responsavel) {
      // cartão do responsável técnico: iniciais em destaque, cargo, registro e contato
      b.push(subtitulo('Quem cuida do seu projeto'));
      const nomes = String(emp.responsavel).trim().split(/\s+/);
      const iniciais = (nomes[0].charAt(0) + (nomes.length > 1 ? nomes[nomes.length - 1].charAt(0) : '')).toUpperCase();
      const resp = [T(emp.responsavel, { after: 20 }, { b: true, color: AZUL, sz: 26 }),
        T([emp.cargo || 'Responsável técnico', emp.registro ? emp.registroTipo + ' ' + emp.registro : ''].filter(Boolean).join(' · '), { after: 60 }, { color: '475569', sz: 19 }),
        T('Responsável pelo projeto, pela ART e pelo acompanhamento da instalação até a ligação do sistema.', { after: fone ? 40 : 0 }, { color: GRAFITE, sz: 18 })];
      if (fone) resp.push(T('WhatsApp ' + fone, null, { b: true, color: '15803D', sz: 19 }));
      b.push(TBL([1500, 7860], [TR([
        TC(T(iniciais, { jc: 'center' }, { b: true, color: BRANCO, sz: 48 }), { w: 1500, fill: AZUL, borda: { sz: 6, cor: AZUL }, mar: { t: 160, b: 160, l: 80, r: 80 }, vAlign: 'center' }),
        TC(resp, { w: 7860, fill: 'F8FAFF', borda: { sz: 6, cor: 'DBEAFE' }, mar: { t: 160, b: 160, l: 240, r: 160 } })
      ], false, { naoQuebrar: true })]));
    }
    b.push(vazio());


    /* ---------- PROJETOS REALIZADOS (portfólio: 2 fotos + ficha técnica por obra) */
    if (projetos.length) {
      abrir('Projetos realizados', null, true);
      if (textos.projetosIntro) b.push(T(t(textos.projetosIntro), { after: 60 }, { color: GRAFITE }));
      const rotSeg = {}, rotTipo = {};
      App.DEFAULTS.SEGMENTOS.forEach(function (x) { rotSeg[x.id] = x.label; });
      App.DEFAULTS.TIPOS_PROJETO.forEach(function (x) { rotTipo[x.id] = x.label; });
      const wFoto = Math.round(4500 * k * 635); // EMU (1 twip = 635 EMU), dentro da célula de 4.680
      projetos.forEach(function (pr, i) {
        const refs = ['proj' + (i + 1) + 'a', 'proj' + (i + 1) + 'b'];
        imagens[refs[0]] = pr.foto1.dataURL;
        imagens[refs[1]] = pr.foto2.dataURL;
        const local = [pr.cidade, pr.uf].filter(Boolean).join('/');
        const sub = [rotSeg[pr.segmento], rotTipo[pr.tipoSistema] ? 'Sistema ' + rotTipo[pr.tipoSistema] : '', pr.conclusao ? 'concluído em ' + pr.conclusao : '']
          .filter(Boolean).join(' · ');
        b.push(T(pr.titulo + (local ? ' — ' + local : ''), { keepNext: true, before: i ? 280 : 120, after: 20 }, { b: true, color: AZUL, sz: 22 }));
        if (sub) b.push(T(sub, { keepNext: true, after: 60 }, { color: CINZA, sz: 18 }));
        const foto = function (ref, f) {
          const cy = Math.round(wFoto * (f.w && f.h ? f.h / f.w : 0.75));
          return TC(P(IMG(ref, wFoto, cy, 'Foto do projeto ' + (i + 1)), { jc: 'center', keepNext: true }),
            { w: 4680, span: 2, semBorda: true, mar: { t: 40, b: 40, l: 60, r: 60 } });
        };
        const kwpP = U.num(pr.potenciaKwp), ger = U.num(pr.geracaoMes), eco = U.num(pr.economiaMes), red = U.num(pr.reducaoPct);
        const ficha = [];
        if (kwpP > 0) ficha.push(['Potência instalada', U.kwp(kwpP) + ' kWp']);
        if (ger > 0) ficha.push(['Geração média', U.fmt(ger, 0) + ' kWh/mês']);
        if (pr.modulos) ficha.push(['Módulos', pr.modulos]);
        if (pr.inversor) ficha.push(['Inversor', pr.inversor]);
        if (pr.armazenamento) ficha.push(['Armazenamento', pr.armazenamento]);
        if (pr.estrutura) ficha.push(['Estrutura', pr.estrutura]);
        if (eco > 0) ficha.push(['Economia média', U.brl(eco) + '/mês']);
        if (red > 0) ficha.push(['Redução da conta', U.fmtSmart(red, 1) + '%']);
        if (ger > 0) ficha.push(['CO₂ evitado', U.fmtSmart(ger * 12 * prem.fatorCO2 / 1000, 1) + ' t/ano']);
        const linhasP = [TR([foto(refs[0], pr.foto1), foto(refs[1], pr.foto2)], false, { naoQuebrar: true })];
        const nLin = Math.ceil(ficha.length / 2);
        for (let j = 0; j < nLin; j++) {
          // keepNext nas linhas que não são a última: o Word mantém o cartão inteiro na mesma página
          const po = j < nLin - 1 ? { keepNext: true } : null;
          const fill = j % 2 === 0 ? ZEBRA : BRANCO;
          const cel = [];
          [ficha[2 * j], ficha[2 * j + 1]].forEach(function (d) {
            cel.push(TC(d ? T(d[0], po, { b: true, sz: 18 }) : P([], po), { w: 2100, fill: fill }),
              TC(d ? T(d[1], po, { sz: 18 }) : P([], po), { w: 2580, fill: fill }));
          });
          linhasP.push(TR(cel, false, { naoQuebrar: true }));
        }
        b.push(TBL([2100, 2580, 2100, 2580], linhasP, { manterJunto: true }));
        if (pr.descricao) b.push(T(pr.descricao, { before: 40, after: 40 }, { i: true, color: GRAFITE, sz: 18 }));
      });
      b.push(vazio());
    }


    /* ---------- PASSO A PASSO (cronograma em linha do tempo ilustrada; entra quando ligado em Configurações › Textos padrão) */
    const etapas = (textos.cronograma || []).filter(function (c) { return c && (c.etapa || c.prazo); })
      .map(function (c) { return { etapa: t(c.etapa), prazo: t(c.prazo) }; });
    const comPassos = etapas.length > 0 && !!textos.passoNaProposta;
    if (comPassos) {
      abrir('Passo a passo', null, true);
      if (textos.passoIntro) b.push(T(t(textos.passoIntro), { keepNext: true, after: 100 }, { color: GRAFITE }));
      const pa = App.Passos.imagem(etapas);
      imagens.passos = pa.dataURL;
      const tp = encaixar(1000, Math.round(1000 * pa.proporcao), Math.round(5943600 * k), Math.round(7600000 * k));
      b.push(P(IMG('passos', tp.cx, tp.cy, 'Passo a passo do projeto'), { after: 120, jc: 'center' }));
      b.push(vazio());
    }


    /* ---------- COMO FUNCIONA */
    if (temFV) {
      abrir('Como a energia solar funciona' + (cliente && /empresa|comerc|indus/i.test(r.classe || '') ? ' no seu negócio' : ' na sua casa'),
        'Simples, silencioso e automático: você não precisa fazer nada no dia a dia.', true);
      if (App.Arte) {
        const il = App.Arte.comoFunciona({ bateria: temArm });
        imagens.comoFunciona = il.dataURL;
        b.push(P(IMG('comoFunciona', wTexto, Math.round(wTexto * il.proporcao), 'Como funciona'), { after: 120, jc: 'center' }));
      }
      const passosCF = [
        ['Painéis no telhado', 'captam a luz do sol e produzem energia elétrica (corrente contínua).'],
        [r.micro ? 'Os microinversores' : 'O inversor', 'transforma' + (r.micro ? 'm' : '') + ' essa energia na corrente alternada que os aparelhos usam.'],
        ['Você usa primeiro', 'a energia do sol, no mesmo momento em que ela é produzida.'],
        ['O que sobra vai para a rede', 'e o medidor bidirecional registra como crédito em kWh.'],
        ['À noite e em dias nublados', 'você usa a rede, e os créditos abatem a sua conta.']
      ];
      if (temArm) passosCF.push(['As baterias', 'guardam energia para usar à noite e mantêm as cargas essenciais funcionando na falta de energia.']);
      b.push(TBL([520, 8840], passosCF.map(function (x, i) {
        return TR([TC(T(String(i + 1), { jc: 'center' }, { b: true, color: '1F2937', sz: 20 }), { w: 520, fill: 'F6A81C', borda: { sz: 18, cor: BRANCO } }),
          TC(P([R(x[0] + ' ', { b: true }), R(x[1])]), { w: 8840, semBorda: true, mar: { t: 50, b: 50, l: 160, r: 60 } })]);
      })));
      b.push(subtitulo('Por que vale a pena para você'));
      const benef = [];
      if (pct > 0) benef.push(['💰', 'Conta ' + pct + '% menor', 'De ' + valorCurto(a1.contaSem) + ' para cerca de ' + valorCurto(a1.contaCom) + ' por mês no primeiro ano.']);
      benef.push(['🛡️', 'Proteção contra reajustes', 'A energia que você produz não sofre os aumentos anuais da tarifa.']);
      benef.push(['🏠', 'Imóvel valorizado', 'Um sistema solar é um diferencial na venda ou na locação do imóvel.']);
      if (f.co2t > 0) benef.push(['🌱', U.fmt(f.co2t, 0) + ' t de CO₂ evitadas', 'Energia limpa e renovável ao longo dos ' + H + ' anos de operação.']);
      if (temArm) benef.push(['🔋', 'Energia na falta de luz', 'As cargas essenciais continuam funcionando durante as quedas da rede.']);
      benef.push(['📱', 'Acompanhamento no celular', 'Veja a geração em tempo real pelo aplicativo do inversor.']);
      if (pFin && f.economiaMes1 > pFin.parcela) benef.push(['💳', 'Pagamento que cabe no bolso', 'No financiamento em ' + pFin.prazo + ', a parcela é menor que a economia do mês.']);
      b.push(grade(benef.slice(0, 6), 2, function (x, w) {
        return TC([P([R(x[0] + '  ', { sz: 24 }), R(x[1], { b: true, sz: 21 })], { after: 30 }), T(x[2], null, { color: '475569', sz: 17 })],
          { w: w, fill: BRANCO, borda: { sz: 6, cor: 'E2E8F0' }, mar: { t: 120, b: 120, l: 180, r: 140 }, vAlign: 'top' });
      }));
    }


    /* ---------- SEU SISTEMA */
    if (temFV) {
      abrir('Seu sistema solar', 'Dimensionado para o seu consumo médio de ' + U.fmt(r.consumoMedio, 0) + ' kWh/mês' + (cidadeUF ? ' em ' + cidadeUF.replace(' / ', '/') : '') + '.', true);
      const faixa = [[U.kwp(r.kwp) + ' kWp', 'potência'], [r.nModulos + ' × ' + (mod ? U.fmtSmart(mod.potencia, 0) : '') + ' Wp', 'módulos'],
        [U.fmt(r.geracaoMensal, 0) + ' kWh', 'geração média/mês'], [U.fmt(r.cobertura * 100, 0) + '%', 'do seu consumo'], ['≈ ' + U.fmt(r.area, 0) + ' m²', 'de telhado']];
      b.push(TBL([1872, 1872, 1872, 1872, 1872], [TR(faixa.map(function (x) {
        return TC([T(x[0], { jc: 'center', after: 0 }, { b: true, color: BRANCO, sz: 24 }), T(x[1], { jc: 'center' }, { color: 'BFDBFE', sz: 16 })],
          { w: 1872, fill: AZUL, borda: { sz: 6, cor: '3557A6' }, mar: { t: 140, b: 140, l: 60, r: 60 } });
      }), false, { naoQuebrar: true })]));
      b.push(subtitulo('Geração estimada mês a mês'));
      b.push(P(IMG('grafico', Math.round(5524500 * k), Math.round(5524500 * 772 / 1800 * k), 'Grafico'), { after: 60, jc: 'center' }));
      b.push(T('Nos meses de inverno o sol é mais fraco e a geração cai um pouco; os créditos dos meses de maior geração compensam essa diferença.', { after: 60 }, { color: CINZA, sz: 17 }));
      b.push(subtitulo('Equipamentos'));
      const eqs = [];
      if (mod) eqs.push(['⚡', 'Módulos fotovoltaicos', r.nModulos + ' × ' + nomeEq(mod) + ' (' + U.fmtSmart(mod.potencia, 0) + ' Wp' + (mod.tecnologia ? ', ' + String(mod.tecnologia).toLowerCase() : '') + ')', C.garantiaModulo(mod)]);
      if (inv) eqs.push(['🔌', r.micro ? 'Microinversores' : (hib ? 'Inversor híbrido' : 'Inversor'), (r.nInversores > 1 ? r.nInversores + ' × ' : '') + nomeEq(inv) + ' · ' + C.specInversor(inv), garantiaAnos(inv)]);
      if (temArm && bat) eqs.push(['🔋', r.bessAtivo ? 'Armazenamento (BESS)' : 'Baterias', cen.n + ' × ' + nomeEq(bat) + ' — ' + U.fmtSmart(arm.capInstalada, 2) + ' kWh', garantiaAnos(bat)]);
      eqs.push(['🏗️', 'Estrutura de fixação', r.estruturaTexto || 'Conforme o tipo de telhado', 'conforme fabricante']);
      eqs.push(['📱', 'Monitoramento', r.monitoramento, 'acompanhe a geração pelo celular']);
      b.push(grade(eqs, 2, function (x, w) {
        return TC([P([R(x[0] + '  ', { sz: 22 }), R(x[1], { b: true, sz: 21 })], { after: 30 }), T(x[2], { after: 30 }, { color: '374151', sz: 17 }),
          T((x[0] === '📱' ? '' : 'Garantia: ') + x[3], null, { b: true, color: '15803D', sz: 16 })],
        { w: w, fill: 'F8FAFF', borda: { sz: 6, cor: 'DBEAFE' }, mar: { t: 120, b: 120, l: 180, r: 140 }, vAlign: 'top' });
      }));
      b.push(P([R('Entenda os termos: ', { b: true, color: '475569', sz: 17 }), R('kWp — potência máxima dos módulos em condições de teste (sol forte e temperatura padrão).  kWh — quantidade de energia: é a unidade que aparece na sua conta de luz.', { color: '475569', sz: 17 })],
        { left: { sz: 18, space: 6, color: 'F6A81C' }, shd: 'F8FAFC', before: 200, after: 80 }));
    }

    /* ---------- ARMAZENAMENTO */
    if (temArm) {
      const backupCen = cen.id === 'backup';
      abrir('Armazenamento de energia' + (backupCen && arm.cargas.length ? ' e cargas críticas' : (r.bessAtivo ? ' (BESS)' : '')), null, true);
      let txt;
      if (backupCen) {
        txt = 'O sistema ' + (hib ? 'híbrido' : 'de armazenamento') + ' mantém as cargas críticas abaixo em funcionamento durante interrupções no fornecimento' +
          (conc ? ' da ' + conc : '') + ', utilizando o ' + (r.bessAtivo ? 'BESS' : 'banco de baterias') + (temFV ? ' e a geração fotovoltaica.' : '.');
      } else if (cen.id === 'ponta') {
        txt = tou
          ? 'O armazenamento carrega fora do horário de ponta' + (temFV ? ' (preferencialmente com o excedente solar)' : '') + ' e descarrega nos dias úteis durante a ponta (' +
            U.fmtSmart(prem.armazenamento.duracaoPonta, 1) + ' h), quando a energia custa ' + rs(tf.ponta) + '/kWh contra ' + rs(tf.fp) + '/kWh fora de ponta.'
          : 'Fora dos períodos de falta, as baterias armazenam a energia excedente do dia para uso noturno, reduzindo a energia injetada na rede' +
            (arm.cargas.length ? ', e mantêm reservados ' + U.fmtSmart(arm.reservaUtil, 2) + ' kWh para as cargas críticas em caso de falta de energia.' : '.');
      } else {
        const kw = cen.fin.reducaoKW1;
        txt = 'O armazenamento corta os picos de demanda em até ' + U.fmtSmart(kw, 1) + ' kW, reduzindo a demanda faturada' +
          (r.cenariosConfig.picos.readequar !== false ? ' e permitindo readequar a demanda contratada' : '') + ', além de evitar multas de ultrapassagem.';
      }
      // a ciclagem na tarifa convencional já menciona a reserva para as cargas críticas
      if (!backupCen && arm.cargas.length && !(cen.id === 'ponta' && !tou)) txt += ' Em caso de falta de energia, o sistema também pode alimentar as cargas críticas listadas.';
      b.push(T(txt, { after: 80 }, { color: GRAFITE }));
      b.push(vazio());
      if (arm.cargas.length) {
        const cargasCols = [{ t: 'Carga crítica', w: 3560 }, { t: 'Qtd.', w: 800, jc: 'center' }, { t: 'Potência (W)', w: 1500, jc: 'right' },
          { t: 'Uso no backup (h)', w: 1500, jc: 'center' }, { t: 'Energia (Wh)', w: 2000, jc: 'right' }];
        const cargasLin = arm.cargas.map(function (c) {
          return [c.descricao + (c.motor ? ' (motor)' : ''), U.fmtSmart(c.qtd, 2), U.fmt(c.potTotal, 0), U.fmtSmart(c.horas, 1), U.fmt(c.energia, 0)];
        });
        const tot = [{ t: 'Total', b: true }, '', { t: U.fmt(arm.potCargas, 0), b: true }, '', { t: U.fmt(arm.energiaBackup, 0), b: true }];
        tot.fundo = DESTAQUE;
        cargasLin.push(tot);
        b.push(tabela(cargasCols, cargasLin, { sz: 19 }));
        b.push(vazio());
      }
      // resumo para o cliente; os parâmetros técnicos do banco ficam no painel da proposta
      const resumoArm = [];
      if (bat) {
        resumoArm.push((r.bessAtivo ? 'Sistema de armazenamento: ' : 'Banco de baterias: ') + cen.n + ' × ' + [bat.fabricante, bat.modelo].filter(Boolean).join(' ') +
          ' — ' + U.fmtSmart(arm.capInstalada, 2) + ' kWh (' + U.fmtSmart(arm.capUtil, 2) + ' kWh úteis).');
      }
      if (arm.cargas.length && arm.autonomiaEstimada != null) resumoArm.push('Autonomia estimada de ≈ ' + U.fmtSmart(arm.autonomiaEstimada, 1) + ' h com as cargas listadas.');
      if (cen.fin.reducaoKW1) resumoArm.push('Redução de demanda de ' + U.fmtSmart(cen.fin.reducaoKW1, 1) + ' kW.');
      if (resumoArm.length) b.push(T('🔋 ' + resumoArm.join(' '), { left: { sz: 12, space: 4, color: AZUL }, shd: DESTAQUE, after: 80 }, { color: AZUL }));
      b.push(vazio());
    }


    /* ---------- COMPARATIVO DE CENÁRIOS */
    if (r.comparar) {
      const av = r.cenariosAvaliados;
      const rec = r.recomendacao;
      abrir('Comparativo de cenários', null, false);
      b.push(T(t(textos.cenariosIntro), { after: 80 }, { color: GRAFITE }));
      b.push(vazio());
      const wL = 2360;
      const wC = Math.floor((9360 - wL) / av.length);
      const cols = [{ t: 'Indicador', w: 9360 - wC * av.length }].concat(av.map(function (c) {
        const ehRec = rec && rec.id === c.id;
        return { t: c.nome + (ehRec ? ' ✅' : ''), w: wC, jc: 'center', fill: ehRec ? VERDE : null };
      }));
      const linha = function (rot, fn, negrito) {
        return [{ t: rot, b: true }].concat(av.map(function (c) {
          const ehRec = rec && rec.id === c.id;
          return { t: fn(c), jc: 'center', b: negrito || ehRec, color: ehRec ? VERDE : null, fill: ehRec ? 'DCFCE7' : null };
        }));
      };
      const tirTxt = function (f) { return f.tir != null ? U.fmt(f.tir * 100, 1) + '% a.a.' : (f.tirAcima ? '> 1.000% a.a.' : '—'); };
      const lin = [
        linha('Sistema FV', function (c) { return c.incluirFV && r.kwp ? U.kwp(r.kwp) + ' kWp' : '—'; }),
        linha('Armazenamento', function (c) { return c.n ? U.fmtSmart(c.capInstalada, 2) + ' kWh / ' + U.fmtSmart(c.potencia, 1) + ' kW' : '—'; }),
        linha('Investimento', function (c) { return U.brl(c.investimento); }, true),
        linha('Benefício no ano 1', function (c) { return U.brl(c.fin.beneficioAno1); }),
        linha('Payback simples', function (c) { return U.anosMeses(c.fin.paybackSimples); }),
        linha('Payback descontado', function (c) { return U.anosMeses(c.fin.paybackDescontado); }),
        linha('VPL ' + H + ' anos', function (c) { return U.brl(c.fin.vpl); }, true),
        linha('TIR', function (c) { return tirTxt(c.fin); }),
        linha('Autonomia em falta de energia', function (c) { return c.metricas && c.metricas.autonomiaH ? '≈ ' + U.fmtSmart(c.metricas.autonomiaH, 1) + ' h' : '—'; }),
        linha('Redução de demanda', function (c) { return c.fin.reducaoKW1 ? U.fmtSmart(c.fin.reducaoKW1, 1) + ' kW' : '—'; }),
        linha('Energia deslocada (ano 1)', function (c) { return c.fin.kwhDeslocadosAno1 ? U.fmt(c.fin.kwhDeslocadosAno1, 0) + ' kWh' : '—'; })
      ];
      b.push(tabela(cols, lin, { sz: 18 }));
      b.push(vazio());
      if (rec) {
        b.push(P([R('✅ Recomendação: ' + rec.nome, { b: true, color: VERDE, sz: 22 }),
          R('\n' + rec.motivos.map(function (m) { return '• ' + m; }).join('\n'), { color: '14532D', sz: 19 })],
        { left: { sz: 18, space: 6, color: '16A34A' }, shd: 'F0FDF4', after: 80 }));
      }
      const outros = r.cenarios.filter(function (c) { return c.ativo && !c.aplicavel; });
      if (outros.length) {
        b.push(T('Cenários não aplicáveis: ' + outros.map(function (c) { return c.nome + ' — ' + c.motivoNA; }).join(' | '), { after: 80 }, { color: CINZA, sz: 18 }));
      }
      b.push(T(rec && cen && rec.id !== cen.id
        ? 'Por opção do cliente, as seções seguintes detalham o cenário "' + cen.nome + '".'
        : 'As seções seguintes detalham o cenário recomendado.', { after: 80 }, { color: GRAFITE, sz: 18 }));
      b.push(vazio());
    }


    /* ---------- O QUE ESTÁ INCLUSO */
    abrir('O que está incluso', 'Do projeto à energia gerando: tudo o que fazemos por você, e o que fica fora do escopo.', true);
    const extraInc = hib ? textos.inclusosHibrido || [] : (r.bessAtivo ? textos.inclusosBess || [] : []);
    const extraNinc = hib ? textos.naoInclusosHibrido || [] : (r.bessAtivo ? textos.naoInclusosBess || [] : []);
    const inc = (textos.inclusos || []).concat(extraInc).map(t).filter(Boolean);
    const ninc = (textos.naoInclusos || []).concat(extraNinc).map(t).filter(Boolean);
    const itensMarcados = function (lista, simbolo, cor) {
      return lista.map(function (x) { return P([R(simbolo + '  ', { b: true, color: cor }), R(x, { sz: 19 })], { after: 60 }); });
    };
    b.push(TBL([5160, 200, 4000], [
      TR([TC(T('Está incluso', null, { b: true, color: BRANCO, sz: 22 }), { w: 5160, fill: '15803D', borda: { sz: 4, cor: '15803D' }, mar: { t: 120, b: 120, l: 200, r: 120 } }),
        espaco(200),
        TC(T('Não está incluso', null, { b: true, color: BRANCO, sz: 22 }), { w: 4000, fill: '64748B', borda: { sz: 4, cor: '64748B' }, mar: { t: 120, b: 120, l: 200, r: 120 } })], true),
      TR([TC(itensMarcados(inc, '✓', '15803D'), { w: 5160, fill: 'F0FDF4', borda: { sz: 4, cor: 'BBF7D0' }, mar: { t: 140, b: 120, l: 200, r: 160 }, vAlign: 'top' }),
        espaco(200),
        TC(itensMarcados(ninc, '✗', 'DC2626').concat([T('Se algum desses itens for necessário (por exemplo, exigência da ' + (conc || 'concessionária') + ' na vistoria), avisamos antes e passamos o orçamento à parte.',
          { before: 120, top: { sz: 4, space: 4, color: 'CBD5E1' } }, { color: CINZA, sz: 16 })]), { w: 4000, fill: 'F8FAFC', borda: { sz: 4, cor: 'E2E8F0' }, mar: { t: 140, b: 120, l: 200, r: 160 }, vAlign: 'top' })])
    ]));
    const garantias = [];
    if (mod) garantias.push({ rot: 'Módulos', valor: (C.garantiaModulo(mod).match(/^\d+\s*anos?/) || [C.garantiaModulo(mod)])[0], sub: C.garantiaModulo(mod), sz: 26 });
    if (inv) garantias.push({ rot: r.micro ? 'Microinversores' : (hib ? 'Inversor híbrido' : 'Inversor'), valor: garantiaAnos(inv), sub: 'pelo fabricante ' + (inv.fabricante || ''), sz: 26 });
    if (temArm && bat) garantias.push({ rot: r.bessAtivo ? 'BESS' : 'Baterias', valor: garantiaAnos(bat), sub: 'pelo fabricante ' + (bat.fabricante || ''), sz: 26 });
    if (textos.garantiaInstalacao) garantias.push({ rot: 'Instalação', valor: t(textos.garantiaInstalacao), sub: 'pela ' + (emp.nomeCurto || emp.razao) + ': mão de obra e conexões', sz: 26 });
    if (garantias.length) {
      b.push(subtitulo('Garantias'));
      b.push(grade(garantias, Math.max(2, garantias.length), cartao));
    }
    b.push(P([R('Depois da instalação: ', { b: true, color: '92400E' }), R('você recebe o acesso ao aplicativo de monitoramento, a documentação do projeto e as orientações de limpeza dos módulos' +
      (fone ? '. Qualquer dúvida, fale com a gente pelo WhatsApp ' + fone + '.' : '.'), { color: '57534E', sz: 19 })], { left: { sz: 18, space: 6, color: 'F6A81C' }, shd: 'FFFBEB', before: 220, after: 80 }));

    /* ---------- QUANTO VOCÊ ECONOMIZA */
    abrir('Quanto você economiza', 'Valores estimados com a tarifa atual, reajuste de ' + U.fmtSmart(prem.inflacaoTarifa * 100, 1) + '% ao ano' + (temFV ? ' e as regras da Lei 14.300/2022.' : '.'), true);
    const caixa = function (rot, valor, sub, fundo, cor, w) {
      return TC([T(rot, { after: 20 }, { color: cor, sz: 17 }), T(valor, { after: 20 }, { b: true, color: cor, sz: 30 }), T(sub, null, { color: cor, sz: 16 })],
        { w: w, fill: fundo, borda: { sz: 4, cor: fundo }, mar: { t: 140, b: 140, l: 200, r: 120 } });
    };
    b.push(TBL([2900, 400, 2900, 260, 2900], [TR([
      caixa('Conta hoje', U.brl(a1.contaSem), 'por mês', 'F1F5F9', '334155', 2900),
      TC(T('➜', { jc: 'center' }, { color: CINZA, sz: 28 }), { w: 400, semBorda: true }),
      caixa('Conta ' + comRot.toLowerCase(), U.brl(a1.contaCom), 'por mês', 'EFF6FF', AZUL, 2900),
      espaco(260),
      caixa('Você economiza', U.brl(f.economiaMes1), 'por mês · ' + valorCurto(f.economiaAno1) + ' no 1º ano', '15803D', BRANCO, 2900)
    ], false, { naoQuebrar: true })]));
    const infos = [];
    infos.push(['Por que a conta não zera?', grupoA
      ? 'No grupo A, a demanda contratada continua sendo cobrada, assim como a energia que não é compensada e a iluminação pública (COSIP).'
      : 'Mesmo gerando toda a energia, a ' + (conc || 'concessionária') + ' cobra um valor mínimo pela conexão (o custo de disponibilidade: ' + U.fmt(disp, 0) + ' kWh na ligação ' +
        C.LIG_ADJ[r.ligacao] + ') e a prefeitura cobra a iluminação pública. É isso que sobra na conta.']);
    if (temFV) infos.push(['O que é o Fio B?', 'É a parte da tarifa que paga o uso da rede. Pela Lei 14.300/2022, ela passa a ser cobrada aos poucos sobre a energia que vai para a rede e volta como crédito (' +
      C.fioBTexto(r.anoBase, prem, ', ') + '). Já está incluída nos números desta proposta.']);
    b.push(P([], { after: 120 }));
    b.push(grade(infos, 2, function (x, w) {
      return TC([T(x[0], { after: 40 }, { b: true, color: '92400E', sz: 21 }), T(x[1], null, { color: '57534E', sz: 17 })],
        { w: w, fill: 'FFFBEB', borda: { sz: 6, cor: 'FDE68A' }, mar: { t: 120, b: 120, l: 180, r: 140 }, vAlign: 'top' });
    }));
    b.push(subtitulo('Sua conta de luz nos próximos anos'));
    b.push(T('A tarifa de energia sobe quase todo ano (nesta proposta, ' + U.fmtSmart(prem.inflacaoTarifa * 100, 1) + '% ao ano). ' +
      (temFV ? 'Com energia solar' : 'Com o sistema') + ', a sua conta fica pequena e a diferença fica no seu bolso:', { keepNext: true, after: 120 }, { color: GRAFITE, sz: 19 }));
    // tabela amigável: marcos de 5 em 5 anos, valores arredondados e uma cor por coluna
    const marcos = [1, 5, 10, 15, 20, 25].filter(function (n) { return n <= f.anos.length; });
    if (marcos[marcos.length - 1] !== f.anos.length) marcos.push(f.anos.length);
    const LCT = [1700, 2300, 2300, 3060];
    const bordaT = { sz: 4, cor: 'E2E8F0' };
    const cabT = function (txt, w, cor, jc) {
      return TC(T(txt, { jc: jc || 'right' }, { b: true, color: BRANCO, sz: 19 }), { w: w, fill: cor, borda: { sz: 4, cor: cor }, mar: { t: 110, b: 110, l: 160, r: 160 } });
    };
    const valT = function (v1, v2, cor, corSub, w, fundo, jc) {
      return TC([T(v1, { jc: jc || 'right', after: 0 }, { b: true, color: cor, sz: 22 }), T(v2, { jc: jc || 'right' }, { color: corSub, sz: 15 })],
        { w: w, fill: fundo, borda: bordaT, mar: { t: 90, b: 90, l: 160, r: 160 } });
    };
    const linhasT = [TR([cabT('Quando', LCT[0], AZUL, 'left'), cabT(semRot, LCT[1], '64748B'), cabT(comRot, LCT[2], '2563EB'), cabT('Você economiza', LCT[3], '15803D')], true)];
    let somaEco = 0;
    f.anos.forEach(function (a) { somaEco += a.economiaMes * 12; });
    marcos.forEach(function (n, i) {
      const a = f.anos[n - 1];
      const fundo = i % 2 ? 'F8FAFC' : BRANCO;
      linhasT.push(TR([
        valT(String(a.ano), n + 'º ano', AZUL, CINZA, LCT[0], fundo, 'left'),
        valT(reais(a.contaSem), 'por mês', '475569', CINZA, LCT[1], fundo),
        valT(reais(a.contaCom), 'por mês', '2563EB', '2563EB', LCT[2], fundo),
        valT(reais(a.economiaMes) + ' por mês', reais(a.economiaMes * 12) + ' no ano', '15803D', '15803D', LCT[3], 'F0FDF4')
      ], false, { naoQuebrar: true }));
    });
    linhasT.push(TR([TC(P([R('Somando os ' + f.anos.length + ' anos, a economia na conta de luz chega a ', { color: BRANCO, sz: 20 }), R(valorCurto(somaEco), { b: true, color: BRANCO, sz: 24 })], { jc: 'center' }),
      { w: 9360, span: 4, fill: '15803D', borda: { sz: 4, cor: '15803D' }, mar: { t: 120, b: 120, l: 160, r: 160 } })], false, { naoQuebrar: true }));
    b.push(TBL(LCT, linhasT, { manterJunto: true }));
    const cmes = r.contasMes;
    if (cmes && cmes.max - cmes.min > 0.5) {
      b.push(T('📆 No ano ' + r.anoBase + ', conforme a geração de cada mês (créditos transportados entre os meses), a conta com sistema varia de ' +
        U.brl(cmes.min) + ' (' + C.MESES_CURTOS[cmes.mesMin] + ') a ' + U.brl(cmes.max) + ' (' + C.MESES_CURTOS[cmes.mesMax] + ').', { before: 60, after: 20 }, { color: GRAFITE, sz: 17 }));
    }
    b.push(T('Valores mensais médios com impostos' + (r.cosip > 0 ? ' e a COSIP de ' + U.brl(r.cosip) + '/mês' : '') + '.', { before: 60, after: 60 }, { color: CINZA, sz: 16 }));

    /* ---------- RETORNO DO INVESTIMENTO */
    abrir('Retorno do investimento', 'A energia solar funciona como uma aplicação: você investe uma vez e recebe a economia todo mês.', true);
    const geracao25 = f.anos.reduce(function (s0, a) { return s0 + (a.geracao || 0); }, 0);
    const cartoesRet = [
      { rot: 'Tempo de retorno', valor: f.paybackSimples != null ? U.anosMeses(f.paybackSimples) : 'mais de ' + H + ' anos', sub: temFV ? 'o sistema dura mais de 25 anos' : 'considerando a vida útil do sistema', tom: 'ouro' },
      { rot: 'Rentabilidade (TIR)', valor: f.tir != null ? U.fmt(f.tir * 100, 1) + '% a.a.' : (f.tirAcima ? 'acima de 1.000% a.a.' : '—'), sub: 'a ' + (prem.tmaNome || 'SELIC') + ' está em ' + U.fmt(prem.tma * 100, 2) + '% a.a.', tom: 'verde' },
      { rot: 'Retorno total', valor: r.total > 0 ? U.fmt(f.economiaTotal / r.total, 1) + ' vezes' : '—', sub: 'a economia de ' + H + ' anos sobre o valor investido' },
      temFV && geracao25 > 0
        ? { rot: 'Custo da sua energia solar', valor: U.brl(r.total / geracao25) + '/kWh', sub: 'contra ' + U.brl(r.tarifa) + '/kWh da ' + (conc || 'concessionária') }
        : { rot: 'Valor presente líquido (VPL)', valor: valorCurto(f.vpl), sub: 'em ' + H + ' anos, descontado pela ' + (prem.tmaNome || 'SELIC') }
    ];
    b.push(grade(cartoesRet, 2, cartao));
    if (App.Chart && App.Chart.saldoDataURL) {
      b.push(subtitulo('Seu dinheiro ao longo do tempo (saldo acumulado)'));
      const ptsSaldo = [{ rot: 'Hoje', v: -r.total }].concat(f.anos.map(function (a) { return { rot: String(a.ano), v: a.acumulado }; }));
      const gs = App.Chart.saldoDataURL({
        pontos: ptsSaldo, marca: f.paybackSimples != null ? 'O investimento se paga em ' + U.anosMeses(f.paybackSimples) : '',
        sub: 'a partir daí, a economia é lucro', final: reais(f.anos[f.anos.length - 1].acumulado) + ' de saldo em ' + H + ' anos'
      });
      imagens.saldo = gs.dataURL;
      b.push(P(IMG('saldo', wTexto, Math.round(wTexto * gs.proporcao), 'Saldo acumulado'), { after: 60, jc: 'center' }));
    }
    const extrasRet = ['Payback descontado (' + (prem.tmaNome || 'SELIC') + ' ' + U.fmt(prem.tma * 100, 2) + '% a.a.): ' + (f.paybackDescontado != null ? U.anosMeses(f.paybackDescontado) : 'acima do horizonte'),
      'VPL em ' + H + ' anos: ' + U.brl(f.vpl)];
    if (temFV) extrasRet.push('CO₂ evitado: ' + U.fmt(f.co2t, 1) + ' t');
    if (a1.beneficioBackup > 0) extrasRet.push('benefício de backup: ' + U.brl(a1.beneficioBackup) + '/ano');
    if (r.trocaBateria && r.trocaBateria.custo > 0) extrasRet.push('substituição ' + (r.bessAtivo ? 'do BESS' : 'das baterias') + ' no ano ' + (r.anoBase + r.trocaBateria.ano - 1) + ': ' + U.brl(r.trocaBateria.custo));
    b.push(T(extrasRet.join('  •  '), { after: 80 }, { color: CINZA, sz: 17 }));

    /* ---------- PRÓXIMOS PASSOS */
    abrir('Próximos passos', 'Gostou? Em três passos começamos o seu projeto.', true);
    const passo3 = function (n, tit, txt) {
      return TC([T(String(n), { jc: 'center', after: 40 }, { b: true, color: '2563EB', sz: 30 }), T(tit, { jc: 'center', after: 30 }, { b: true, color: AZUL, sz: 22 }), T(txt, { jc: 'center' }, { color: '475569', sz: 17 })],
        { w: 2900, fill: 'F8FAFF', borda: { sz: 6, cor: 'DBEAFE' }, mar: { t: 140, b: 140, l: 140, r: 140 }, vAlign: 'top' });
    };
    const seta = function () { return TC(T('➜', { jc: 'center' }, { color: 'F6A81C', sz: 28 }), { w: 330, semBorda: true }); };
    b.push(TBL([2900, 330, 2900, 330, 2900], [TR([
      passo3(1, 'Aprovação', 'Assine abaixo' + (fone ? ' ou responda pelo WhatsApp.' : '.')), seta(),
      passo3(2, 'Contrato e pagamento', 'Formalizamos o contrato e a forma de pagamento escolhida.'), seta(),
      passo3(3, 'Vistoria e projeto', 'Visitamos o local e damos entrada' + (conc ? ' na ' + conc : ' na concessionária') + '.')
    ], false, { naoQuebrar: true })]));
    b.push(P([R('Esta proposta foi emitida em ', { color: '78350F', sz: 22 }), R(U.dataBR(p.data), { b: true, color: '78350F', sz: 22 }), R(' e é válida até ', { color: '78350F', sz: 22 }),
      R(validoAte, { b: true, color: '78350F', sz: 22 }), R('.', { color: '78350F', sz: 22 })], { jc: 'center', shd: 'FFFBEB', before: 240, after: 160, top: { sz: 6, space: 6, color: 'FDE68A' }, bottom: { sz: 6, space: 6, color: 'FDE68A' } }));
    b.push(subtitulo('Considerações importantes'));
    const cons = [];
    if (temFV) cons.push('A geração foi estimada com dados de irradiação solar' + (r.cidade ? ' de ' + cidadeUF.replace(' / ', '/') : '') + (r.localidade && r.localidade.fonte ? ' (' + r.localidade.fonte + ')' : '') + ' e varia conforme o clima de cada mês.');
    cons.push('A economia considera o consumo informado, a tarifa atual da ' + (conc || 'concessionária') + ', reajuste de ' + U.fmtSmart(prem.inflacaoTarifa * 100, 1) + '% ao ano' + (temFV ? ' e a cobrança gradual do Fio B prevista na Lei 14.300/2022.' : '.'));
    if (temFV) cons.push('A manutenção é simples: recomendamos limpar os módulos a cada 6 a 12 meses, principalmente na época seca.');
    cons.push((comPassos ? 'Os prazos de cada etapa estão no passo a passo desta proposta' : 'Após a aprovação, combinamos com você as datas de cada etapa') +
      '; a ligação do sistema depende da aprovação da ' + (conc || 'concessionária') + '.');
    cons.forEach(function (x) { b.push(P([R('•  ', { b: true, color: 'F6A81C' }), R(x, { sz: 19 })], { after: 60, ind: 120 })); });
    const hlc = encaixar(logo.w, logo.h, 1600200, 800100);
    const contato = [T(emp.razao, { after: 40 }, { b: true, color: AZUL, sz: 24 })];
    if (fone) contato.push(T('WhatsApp / telefone: ' + fone, { after: 20 }, { b: true, color: '15803D', sz: 19 }));
    if (emp.email) contato.push(T('E-mail: ' + emp.email, { after: 20 }, { sz: 18 }));
    const endEmp = [emp.endereco, emp.bairro, [emp.cidade, emp.uf].filter(Boolean).join('/')].filter(Boolean).join(' — ');
    if (endEmp) contato.push(T(endEmp, { after: 20 }, { sz: 18 }));
    contato.push(T(['CNPJ ' + emp.cnpj, emp.registro ? emp.registroTipo + ' ' + emp.registro : '', emp.horarioAtendimento || ''].filter(Boolean).join(' · '), null, { color: CINZA, sz: 17 }));
    b.push(P([], { after: 120 }));
    b.push(TBL([2800, 6560], [TR([TC(P(IMG('logo', hlc.cx, hlc.cy, 'Logotipo'), { jc: 'center' }), { w: 2800, fill: BRANCO, borda: { sz: 6, cor: 'E2E8F0' }, mar: { t: 120, b: 120, l: 120, r: 120 } }),
      TC(contato, { w: 6560, fill: BRANCO, borda: { sz: 6, cor: 'E2E8F0' }, mar: { t: 120, b: 120, l: 220, r: 140 } })], false, { naoQuebrar: true })]));
    b.push(vazio());
    const centro = { after: 80, jc: 'center' };
    const linhaAss = { top: { sz: 4, space: 0, color: '000000' }, before: 520, jc: 'center' };
    const colEmp = [
      T(emp.responsavel || emp.razao, linhaAss, { b: true }),
      T(emp.cargo || 'Responsável Técnico', { jc: 'center' }, { color: CINZA, sz: 18 }),
      T(emp.razao, centro, { color: CINZA, sz: 17 })
    ];
    const colCli = [
      T(nomeCliente, linhaAss, { b: true }),
      T('Contratante — de acordo', { jc: 'center' }, { color: CINZA, sz: 18 }),
      T('Data: ____/____/________', centro, { color: CINZA, sz: 17 })
    ];
    b.push(TBL([4680, 4680], [TR([TC(colEmp, { w: 4680, semBorda: true, mar: { t: 0, b: 0, l: 240, r: 240 } }), TC(colCli, { w: 4680, semBorda: true, mar: { t: 0, b: 0, l: 240, r: 240 } })], false, { naoQuebrar: true })]));
    b.push(vazio());
    b.push(T(t(textos.slogan), { top: { sz: 6, space: 4, color: DOURADO }, before: 100, jc: 'center' }, { color: AZUL }));

    /* ---------- cabeçalho e rodapé */
    const hl = encaixar(logo.w, logo.h, 1238250, 666750);
    const cabTexto = nomeCliente + '  |  ' + p.numero + '  |  ' + r.resumoCabecalho;
    const cabecalho = [
      TBL([3600, 5760], [TR([
        TC(P(IMG('logo', hl.cx, hl.cy, 'Logotipo')), { w: 3600, semBorda: true }),
        TC(T(cabTexto, { jc: 'right' }, { color: CINZA, sz: 16 }), { w: 5760, semBorda: true, vAlign: 'bottom' })
      ])]),
      P([], { bottom: { sz: 8, space: 2, color: AZUL } })
    ];
    const rodTexto = [emp.razao, 'CNPJ ' + emp.cnpj, emp.registro ? emp.registroTipo + ' ' + emp.registro : '', [emp.cidade, emp.uf].filter(Boolean).join('/')]
      .filter(Boolean).join('  │  ');
    const rodape = [T(rodTexto, { top: { sz: 6, space: 2, color: AZUL }, before: 80, jc: 'center' }, { color: CINZA, sz: 16 })];

    return { papel: papel, k: k, corpo: b, cabecalho: cabecalho, rodape: rodape, imagens: imagens };
  }

  /* ------------------------------------------------------------ recursos compartilhados */

  /** Logotipo em JPEG/PNG (bytes + dataURL) com dimensões, convertendo outros formatos para PNG. */
  async function prepararLogo(dataURL) {
    const src = dataURL || App.LOGO_PADRAO;
    const img = await U.loadImage(src);
    const mime = (String(src).match(/^data:([^;,]+)/) || [])[1] || '';
    let url = src, ext;
    if (mime === 'image/jpeg' || mime === 'image/png') {
      ext = mime === 'image/png' ? 'png' : 'jpg';
    } else {
      const cv = document.createElement('canvas');
      cv.width = img.naturalWidth || 600;
      cv.height = img.naturalHeight || 300;
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      url = cv.toDataURL('image/png');
      ext = 'png';
    }
    return { dataURL: url, bytes: U.dataURLtoBytes(url), ext: ext, w: img.naturalWidth || 1400, h: img.naturalHeight || 752 };
  }

  /** Gráfico de produção da proposta: o mesmo do contrato, com o consumo médio (ou mês a mês, quando varia). */
  function dadosGrafico(r, ctx) {
    const prem = r.premissas || ctx.premissas;
    return App.Chart.dadosProducao({
      kwp: r.kwp, meses: C.producaoMensal(r), consumo: r.consumoMeses, rotuloConsumo: 'Consumo Médio',
      subtitulo: C.descricaoSistema(r, prem), pr: prem.pr * 100
    });
  }

  /** Calcula a proposta e reúne tudo o que os geradores precisam. */
  async function preparar(p, ctx) {
    ctx = ctx || C.contexto();
    const r = C.calcular(p, ctx);
    const cliente = (ctx.clientes || []).find(function (c) { return c.id === p.clienteId; }) || p.clienteSnapshot || null;
    const logo = await prepararLogo(ctx.empresa.logo);
    const grafico = r.permiteFV && r.kwp > 0 ? App.Chart.producaoDataURL(dadosGrafico(r, ctx)) : null;
    const modelo = montar(p, r, ctx, cliente, logo);
    const nomeCliente = (cliente && cliente.nome) || 'Cliente';
    const nomeBase = 'Proposta_Solar_' + U.slug(nomeCliente) + '_' + String(p.data || U.todayISO()).replace(/-/g, '');
    return { ctx: ctx, r: r, cliente: cliente, nomeCliente: nomeCliente, logo: logo, grafico: grafico, modelo: modelo, nomeBase: nomeBase };
  }

  App.Documento = {
    montar: montar, preparar: preparar, prepararLogo: prepararLogo, dadosGrafico: dadosGrafico, COR: COR,
    // construtores de nós reaproveitados pelos demais documentos (contrato e proposta avulsa)
    nos: {
      R: R, P: P, T: T, IMG: IMG, TC: TC, TR: TR, TBL: TBL, encaixar: encaixar, substituir: substituir, decimais: decimais,
      tabela: tabela, kv: kv, titulo: titulo, vazio: vazio
    }
  };
})(window.App);
