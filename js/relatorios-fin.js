/*
 * Relatórios do financeiro em PDF (visualizar, imprimir e baixar) e em planilha (CSV): contas a receber e a pagar, inadimplência,
 * fluxo de caixa, movimento de caixa, extrato de conta, receitas e despesas por categoria, DRE gerencial, resultado por obra
 * (resumo e apuração de cada obra), comissões e o resumo financeiro. Cada relatório monta uma estrutura (títulos, indicadores,
 * gráficos e tabelas) que vira o PDF — no mesmo motor de documento da proposta — e a planilha.
 */
window.App = window.App || {};

(function (App) {
  'use strict';

  const U = App.U;
  const N = App.Documento.nos;
  const R = N.R, P = N.P, T = N.T, TC = N.TC, TR = N.TR, TBL = N.TBL, IMG = N.IMG;
  const COR = App.Documento.COR;
  const AZUL = COR.AZUL, CINZA = COR.CINZA, GRAFITE = COR.GRAFITE, BRANCO = COR.BRANCO;
  const VERDE_TX = '15803D', VERMELHO_TX = 'B91C1C';
  const PALETA = { azul: '#2a78d6', laranja: '#eb6834', verde: '#1baf7a', cinza: '#b4b2a9', azulEscuro: '#1c5cab' };

  function B() { return App.Relatorios.base; }
  function F() { return App.Fin; }
  function S() { return App.Store; }
  function hoje() { return U.todayISO(); }
  function agora() { const d = new Date(); return U.dataBR(hoje()) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
  function dados() { return { lancs: S().list('lancamentos'), contas: S().list('contasFin'), cats: S().list('categoriasFin') }; }
  function nomeCat(cats, id) { const c = (cats || []).find(function (x) { return x.id === id; }); return c ? c.nome : '—'; }
  function nomeConta(contas, id) { const c = (contas || []).find(function (x) { return x.id === id; }); return c ? c.nome : '—'; }
  function pct(v, d) { return v == null || !isFinite(v) ? '—' : U.fmt(v * 100, d == null ? 1 : d) + '%'; }
  function periodoTxt(de, ate) { return de && ate ? U.dataBR(de) + ' a ' + U.dataBR(ate) : de ? 'desde ' + U.dataBR(de) : ate ? 'até ' + U.dataBR(ate) : 'todo o período'; }

  /* ------------------------------------------------------------ células */

  /** Valor em reais (texto formatado; número para a planilha). */
  function brl(v, o) { return Object.assign({ t: U.brl(v || 0), v: U.round(v || 0, 2), jc: 'right' }, o || {}); }
  function brlSinal(v, o) { return brl(v, Object.assign({ color: v < -0.004 ? VERMELHO_TX : null }, o || {})); }
  function num0(v, o) { return Object.assign({ t: v ? U.fmt(v, 0) : '–', v: U.round(v || 0, 2), jc: 'right', color: v < -0.004 ? VERMELHO_TX : null }, o || {}); }
  function pctC(v, o) { return Object.assign({ t: pct(v), v: v == null ? '' : U.round(v * 100, 2), jc: 'right' }, o || {}); }
  function txt(t, o) { return Object.assign({ t: t == null ? '' : String(t) }, o || {}); }

  /* ------------------------------------------------------------ gráficos (canvas → PNG) */

  function compacto(v) {
    const a = Math.abs(v);
    if (a >= 1e6) return 'R$ ' + U.fmt(v / 1e6, 2) + ' mi';
    if (a >= 1e3) return 'R$ ' + U.fmt(v / 1e3, a >= 1e5 ? 0 : 1) + ' mil';
    return 'R$ ' + U.fmt(v, 0);
  }

  function passo(max) {
    const bruto = max / 4, pot = Math.pow(10, Math.floor(Math.log10(bruto || 1))), r = bruto / pot;
    return (r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10) * pot;
  }

  /**
   * Colunas agrupadas (e linhas opcionais), com eixo em reais e legenda. o: {categorias, series: [{nome, cor, valores, linha}], w, h}
   * Valores negativos descem abaixo do zero.
   */
  function graficoColunas(o) {
    const W = o.w || 1000, H = o.h || 330, esc = 3;
    const cv = document.createElement('canvas');
    cv.width = W * esc; cv.height = H * esc;
    const g = cv.getContext('2d');
    g.scale(esc, esc);
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
    const m = { l: 86, r: 14, t: 38, b: 40 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const todos = [];
    o.series.forEach(function (s) { s.valores.forEach(function (v) { todos.push(v || 0); }); });
    const max = Math.max.apply(null, todos.concat([0])), min = Math.min.apply(null, todos.concat([0]));
    const st = passo(Math.max(max - min, 1));
    const topo = Math.ceil(max / st) * st || st, base = Math.floor(min / st) * st;
    const y = function (v) { return m.t + (topo - v) / (topo - base) * ph; };
    g.font = '13px Arial, sans-serif'; g.textBaseline = 'middle';
    for (let v = base; v <= topo + 1e-6; v += st) {
      g.strokeStyle = Math.abs(v) < 1e-9 ? '#9a9890' : '#e8e8e3'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(m.l, y(v)); g.lineTo(W - m.r, y(v)); g.stroke();
      g.fillStyle = '#6b6a65'; g.textAlign = 'right'; g.fillText(compacto(v), m.l - 10, y(v));
    }
    const barras = o.series.filter(function (s) { return !s.linha; }), linhas = o.series.filter(function (s) { return s.linha; });
    const n = o.categorias.length, banda = pw / Math.max(1, n);
    const bw = Math.min(34, banda * 0.72 / Math.max(1, barras.length));
    o.categorias.forEach(function (rot, i) {
      const cx = m.l + banda * i + banda / 2;
      barras.forEach(function (s, j) {
        const v = s.valores[i] || 0;
        if (!v) return;
        const x = cx - (barras.length * bw) / 2 + j * bw + 1;
        const y0 = y(0), y1 = y(v);
        g.fillStyle = s.cor;
        g.fillRect(x, Math.min(y0, y1), bw - 2, Math.max(1, Math.abs(y1 - y0)));
      });
      g.fillStyle = '#52514e'; g.textAlign = 'center'; g.font = (n > 14 ? '11px' : '13px') + ' Arial, sans-serif';
      g.fillText(rot, cx, H - m.b + 16);
    });
    linhas.forEach(function (s) {
      g.strokeStyle = s.cor; g.lineWidth = 3; g.beginPath();
      s.valores.forEach(function (v, i) { const cx = m.l + banda * i + banda / 2; if (i) g.lineTo(cx, y(v || 0)); else g.moveTo(cx, y(v || 0)); });
      g.stroke();
      g.fillStyle = s.cor;
      s.valores.forEach(function (v, i) { const cx = m.l + banda * i + banda / 2; g.beginPath(); g.arc(cx, y(v || 0), 4, 0, Math.PI * 2); g.fill(); });
    });
    // legenda
    let lx = m.l;
    g.font = '14px Arial, sans-serif'; g.textAlign = 'left';
    o.series.forEach(function (s) {
      g.fillStyle = s.cor;
      if (s.linha) g.fillRect(lx, 15, 16, 3); else g.fillRect(lx, 10, 12, 12);
      g.fillStyle = '#374151'; g.fillText(s.nome, lx + 18, 16);
      lx += 30 + g.measureText(s.nome).width;
    });
    return { dataURL: cv.toDataURL('image/png'), w: W, h: H };
  }

  /** Barras horizontais (uma ou duas séries) com o valor ao lado. o: {categorias, series: [{nome, cor, valores}], w} */
  function graficoBarras(o) {
    const n = o.categorias.length, ns = o.series.length;
    const linhaH = ns > 1 ? 34 : 24;
    const W = o.w || 1000, H = 44 + n * linhaH + 12, esc = 3;
    const cv = document.createElement('canvas');
    cv.width = W * esc; cv.height = H * esc;
    const g = cv.getContext('2d');
    g.scale(esc, esc);
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
    g.font = '13px Arial, sans-serif'; g.textBaseline = 'middle';
    const larguraRot = Math.min(380, Math.max.apply(null, o.categorias.map(function (c) { return g.measureText(c).width; }).concat([100])) + 14);
    const m = { l: larguraRot, r: 110, t: 36 };
    const pw = W - m.l - m.r;
    const max = Math.max.apply(null, o.series.reduce(function (a, s) { return a.concat(s.valores.map(function (v) { return Math.abs(v || 0); })); }, [1]));
    let lx = m.l;
    o.series.forEach(function (s) {
      g.fillStyle = s.cor; g.fillRect(lx, 10, 12, 12);
      g.fillStyle = '#374151'; g.textAlign = 'left'; g.fillText(s.nome, lx + 18, 16);
      lx += 30 + g.measureText(s.nome).width;
    });
    o.categorias.forEach(function (rot, i) {
      const y0 = m.t + i * linhaH;
      g.fillStyle = '#374151'; g.textAlign = 'right'; g.font = '13px Arial, sans-serif';
      g.fillText(rot, m.l - 12, y0 + linhaH / 2);
      const bh = (linhaH - 10) / ns;
      o.series.forEach(function (s, j) {
        const v = Math.abs(s.valores[i] || 0);
        const w = v / max * pw;
        g.fillStyle = s.cor;
        g.fillRect(m.l, y0 + 5 + j * bh, Math.max(v ? 2 : 0, w), bh - 2);
        g.fillStyle = '#52514e'; g.textAlign = 'left'; g.font = '12px Arial, sans-serif';
        g.fillText(U.brl(s.valores[i] || 0), m.l + w + 8, y0 + 5 + j * bh + (bh - 2) / 2);
      });
    });
    return { dataURL: cv.toDataURL('image/png'), w: W, h: H };
  }

  /* ------------------------------------------------------------ montagem do PDF */

  function papel(emp, deitado) { const p = B().papelDe(emp); return deitado ? { w: p.h, h: p.w } : p; }

  /** Indicadores em cartões (até 4 por linha). */
  function indicadores(lista, cw) {
    const itens = lista.filter(Boolean);
    const porLinha = Math.min(4, itens.length) || 1;
    const w = Math.floor(9360 / porLinha);
    const linhas = [];
    for (let i = 0; i < itens.length; i += porLinha) {
      const grupo = itens.slice(i, i + porLinha);
      while (grupo.length < porLinha) grupo.push(null);
      linhas.push(TR(grupo.map(function (x) {
        if (!x) return TC(P([]), { w: w, semBorda: true });
        return TC([T(x[0], { after: 20 }, { color: CINZA, sz: 15 }), T(x[1], null, { b: true, color: x[2] || AZUL, sz: 24 }), x[3] ? T(x[3], { before: 10 }, { color: CINZA, sz: 14 }) : null].filter(Boolean),
          { w: w, fill: 'F8FAFF', borda: { sz: 4, cor: 'DBEAFE' }, mar: { t: 90, b: 90, l: 150, r: 120 } });
      }), false, { naoQuebrar: true }));
    }
    return TBL(grupoLarguras(porLinha, w), linhas);
  }
  function grupoLarguras(n, w) { const l = []; for (let i = 0; i < n; i++) l.push(w); return l; }

  /**
   * Tabela do relatório. cols: [{t, w, jc}] (larguras somando 9360); linhas: arrays de células, ou {grupo: 'texto'}, ou
   * {subtotal|total: true, celulas: [...]}. o: {sz}
   */
  function tabelaRel(cols, linhas, o) {
    o = o || {};
    const sz = o.sz || 16;
    const total = cols.reduce(function (s, c) { return s + c.w; }, 0);
    const mar = { t: 55, b: 55, l: 90, r: 90 };
    const rows = [TR(cols.map(function (c) {
      return TC(T(c.t, { jc: c.jc || 'left' }, { b: true, color: BRANCO, sz: sz }), { w: c.w, fill: AZUL, borda: { sz: 4, cor: AZUL }, mar: mar });
    }), true)];
    let zebra = 0;
    linhas.forEach(function (l) {
      if (l && l.grupo != null) {
        zebra = 0;
        rows.push(TR([TC(T(l.grupo, null, { b: true, color: AZUL, sz: sz + 1 }), { w: total, span: cols.length, fill: 'EEF4FF', borda: { sz: 4, cor: 'C7D7F5' }, mar: mar })], false, { naoQuebrar: true, comProxima: true }));
        return;
      }
      const especial = l && (l.total || l.subtotal || l.destaque);
      const celulas = Array.isArray(l) ? l : l.celulas;
      const fundo = l.total ? 'DCE7FB' : l.subtotal ? 'EEF2F9' : l.destaque ? 'EFF6FF' : (zebra++ % 2 ? 'F8FAFC' : BRANCO);
      rows.push(TR(celulas.map(function (v, j) {
        const x = v && typeof v === 'object' ? v : { t: v };
        return TC(T(x.t == null ? '' : String(x.t), { jc: x.jc || cols[j].jc || 'left' }, { sz: x.sz || sz, b: !!(x.b || especial), i: !!x.i, color: x.color || (l.total ? AZUL : GRAFITE) }),
          { w: cols[j].w, fill: x.fill || fundo, borda: { sz: 4, cor: 'E2E8F0' }, mar: x.recuo ? { t: mar.t, b: mar.b, l: 300, r: mar.r } : mar });
      }), false, { naoQuebrar: true }));
    });
    return TBL(cols.map(function (c) { return c.w; }), rows);
  }

  function nota(texto) { return T(texto, { before: 60, after: 60 }, { color: CINZA, sz: 15, i: true }); }

  /**
   * Estrutura → modelo do documento. e: {titulo, sub, chips, deitado, indicadores, blocos: [{titulo, quebra, texto, grafico,
   * pares, cols, linhas, sz, nota}], notas, rodape}
   */
  function montar(e, ctx, rec) {
    const emp = ctx.empresa;
    const pp = papel(emp, e.deitado);
    const k = (pp.w - 2880) / 9360;
    const imagens = Object.assign({}, rec.imagens || {});
    const b = [];
    b.push(B().faixa(e.titulo, e.sub, e.chips));
    if (e.indicadores && e.indicadores.length) { b.push(P([], { after: 100 })); b.push(indicadores(e.indicadores)); }
    let nImg = 0;
    (e.blocos || []).forEach(function (bl) {
      if (!bl) return;
      if (bl.quebra) b.push(P([], { quebra: true }));
      if (bl.faixa) b.push(B().faixa(bl.faixa[0], bl.faixa[1], bl.faixa[2]));
      if (bl.titulo) b.push(B().secao(bl.titulo));
      if (bl.indicadores) b.push(indicadores(bl.indicadores));
      if (bl.pares) b.push(B().pares(bl.pares));
      if (bl.texto) b.push(B().quadro(bl.texto, { sz: 18 }));
      if (bl.grafico) {
        const ref = 'graf' + (++nImg);
        imagens[ref] = bl.grafico.dataURL;
        const cxMax = Math.round((pp.w - 2880) * 635 * (bl.larguraGrafico || 1));
        const cy = Math.round(cxMax * bl.grafico.h / bl.grafico.w);
        b.push(P(IMG(ref, cxMax, cy, bl.titulo || 'Gráfico'), { jc: 'center', before: 60, after: 120, keepNext: false }));
      }
      if (bl.cols && bl.linhas) {
        if (!bl.linhas.length) b.push(nota(bl.vazio || 'Nenhum lançamento.'));
        else b.push(tabelaRel(bl.cols, bl.linhas, { sz: bl.sz }));
      }
      if (bl.nota) b.push(nota(bl.nota));
    });
    (e.notas || []).forEach(function (n) { b.push(nota(n)); });
    b.push(T('Relatório emitido em ' + agora() + ' — CRM Solar.', { before: 200, jc: 'right' }, { color: CINZA, sz: 14 }));
    const cr = B().cabecalhoRodape(emp, rec.logo, e.titulo);
    return { papel: pp, k: k, corpo: b, cabecalho: cr.cabecalho, rodape: cr.rodape, imagens: imagens };
  }

  /* ------------------------------------------------------------ relatórios */

  const NOMES_SIT = { aberto: 'Em aberto', vencido: 'Vencido', pago: 'Pago', cancelado: 'Cancelado' };

  function sitTexto(l) {
    const s = F().situacao(l, hoje());
    if (s === 'pago') return (l.tipo === 'receber' ? 'Recebido ' : 'Pago ') + U.dataBR(l.pagoEm);
    if (s === 'vencido') return 'Vencido há ' + F_dias(l.vencimento) + ' d';
    return NOMES_SIT[s] || s;
  }
  function F_dias(venc) { return Math.max(0, Math.round((new Date(hoje() + 'T12:00:00') - new Date(String(venc).slice(0, 10) + 'T12:00:00')) / 86400000)); }

  const AGRUPAR = [{ id: 'mes', label: 'Mês de vencimento' }, { id: 'pessoa', label: 'Cliente / fornecedor' }, { id: 'categoria', label: 'Categoria' }, { id: 'situacao', label: 'Situação' }, { id: '', label: 'Sem agrupar' }];

  /** Contas a receber ou a pagar. o: {tipo, filtro, de, ate, q, agrupar} */
  function lancamentos(o) {
    const d = dados();
    const tipo = o.tipo === 'pagar' ? 'pagar' : 'receber';
    const lista = F().filtrar(d.lancs, tipo, o);
    const dia = hoje();
    let aberto = 0, vencido = 0, pago = 0;
    lista.forEach(function (l) { const s = F().situacao(l, dia); if (s === 'vencido') vencido += U.numOr(l.valor, 0); else if (s === 'aberto') aberto += U.numOr(l.valor, 0); else if (s === 'pago') pago += U.numOr(l.valorPago, 0); });
    const filtro = (F().FILTROS.find(function (x) { return x.id === (o.filtro || 'aberto'); }) || {}).label || '';
    const chave = function (l) {
      if (o.agrupar === 'mes') { const m = String(l.vencimento).slice(0, 7); return m ? F().MESES[parseInt(m.slice(5), 10) - 1] + '/' + m.slice(0, 4) : 'Sem vencimento'; }
      if (o.agrupar === 'pessoa') return (l.pessoa && l.pessoa.nome) || '(sem nome)';
      if (o.agrupar === 'categoria') return nomeCat(d.cats, l.categoriaId);
      if (o.agrupar === 'situacao') { const s = F().situacao(l, dia); return s === 'pago' ? (tipo === 'receber' ? 'Recebidos' : 'Pagos') : (NOMES_SIT[s] || s) + 's'; }
      return '';
    };
    const grupos = [];
    lista.forEach(function (l) { const k = chave(l); let g = grupos.find(function (x) { return x.k === k; }); if (!g) grupos.push(g = { k: k, itens: [] }); g.itens.push(l); });
    if (o.agrupar === 'pessoa' || o.agrupar === 'categoria') grupos.sort(function (a, b) { return a.k.localeCompare(b.k, 'pt-BR'); });
    const valorDe = function (l) { return l.situacao === 'pago' ? U.numOr(l.valorPago, 0) : U.numOr(l.valor, 0); };
    const linhas = [];
    grupos.forEach(function (g) {
      if (g.k) linhas.push({ grupo: g.k + ' — ' + g.itens.length + (g.itens.length === 1 ? ' lançamento' : ' lançamentos') });
      g.itens.forEach(function (l) {
        const s = F().situacao(l, dia);
        linhas.push([txt(U.dataBR(l.vencimento) + (l.parcela ? ' (' + l.parcela.n + '/' + l.parcela.de + ')' : '')), txt(l.descricao + (l.documento ? ' · doc. ' + l.documento : '')),
          txt((l.pessoa && l.pessoa.nome) || ''), txt(nomeCat(d.cats, l.categoriaId)), txt(nomeConta(d.contas, l.contaId)),
          txt(sitTexto(l), { color: s === 'vencido' ? VERMELHO_TX : s === 'pago' ? VERDE_TX : null }), brl(valorDe(l))]);
      });
      if (g.k && grupos.length > 1) linhas.push({ subtotal: true, celulas: [txt('Subtotal'), txt(''), txt(''), txt(''), txt(''), txt(''), brl(g.itens.reduce(function (s, l) { return s + valorDe(l); }, 0))] });
    });
    if (lista.length) linhas.push({ total: true, celulas: [txt('Total'), txt(lista.length + ' lançamento(s)'), txt(''), txt(''), txt(''), txt(''), brl(lista.reduce(function (s, l) { return s + valorDe(l); }, 0))] });
    // gráfico: valores por mês de vencimento (em aberto × baixados)
    const meses = {};
    lista.forEach(function (l) { const m = String(l.vencimento).slice(0, 7); if (!m) return; const x = meses[m] = meses[m] || { ab: 0, pg: 0 }; if (l.situacao === 'pago') x.pg += valorDe(l); else x.ab += valorDe(l); });
    const chavesM = Object.keys(meses).sort();
    const grafico = chavesM.length >= 2 && chavesM.length <= 24 ? graficoColunas({
      categorias: chavesM.map(function (m) { return F().MESES[parseInt(m.slice(5), 10) - 1] + '/' + m.slice(2, 4); }),
      series: [{ nome: 'Em aberto', cor: PALETA.azul, valores: chavesM.map(function (m) { return meses[m].ab; }) }, { nome: tipo === 'receber' ? 'Recebido' : 'Pago', cor: PALETA.verde, valores: chavesM.map(function (m) { return meses[m].pg; }) }],
      w: 1120, h: 290
    }) : null;
    const nomeT = tipo === 'receber' ? 'Contas a receber' : 'Contas a pagar';
    return {
      titulo: nomeT.toUpperCase(), arquivo: (tipo === 'receber' ? 'Contas_a_receber_' : 'Contas_a_pagar_') + dia.replace(/-/g, ''), deitado: true,
      sub: filtro + (o.filtro === 'periodo' ? ' (' + periodoTxt(o.de, o.ate) + ')' : '') + (o.q ? ' · busca "' + o.q + '"' : '') + ' · emitido em ' + U.dataBR(dia),
      chips: [['Lançamentos:', String(lista.length), AZUL], ['Em aberto:', U.brl(aberto + vencido), AZUL], ['Vencido:', U.brl(vencido), vencido ? 'DC2626' : AZUL]],
      indicadores: [['Em aberto (no prazo)', U.brl(aberto)], ['Vencido', U.brl(vencido), vencido ? VERMELHO_TX : AZUL], [tipo === 'receber' ? 'Recebido' : 'Pago', U.brl(pago), VERDE_TX], ['Total da lista', U.brl(aberto + vencido + pago)]],
      blocos: [
        grafico ? { titulo: 'Por mês de vencimento', grafico: grafico } : null,
        { titulo: 'Lançamentos', cols: [{ t: 'Vencimento', w: 900 }, { t: 'Descrição', w: 2500 }, { t: tipo === 'receber' ? 'Cliente' : 'Fornecedor', w: 1600 }, { t: 'Categoria', w: 1450 },
          { t: 'Conta', w: 900 }, { t: 'Situação', w: 900 }, { t: 'Valor', w: 1110, jc: 'right' }], linhas: linhas, sz: 15, vazio: 'Nenhum lançamento com esses filtros.' }
      ],
      notas: ['Valor: nos baixados, o valor pago (com juros e descontos); nos demais, o valor do lançamento.']
    };
  }

  /** Inadimplência (a receber) ou atrasos (a pagar) por faixa de dias. o: {tipo} */
  function atrasos(o) {
    const d = dados();
    const tipo = o.tipo === 'pagar' ? 'pagar' : 'receber';
    const a = F().atrasos(d.lancs, tipo, hoje());
    const vencidos = d.lancs.filter(function (l) { return l.tipo === tipo && l.situacao === 'aberto' && l.vencimento < hoje(); })
      .sort(function (x, y) { return String(x.vencimento).localeCompare(String(y.vencimento)); });
    const t = a.total;
    const inadimpl = a.lista.filter(function (x) { return x.vencido > 0; }).length;
    const maisAntigo = vencidos.length ? F_dias(vencidos[0].vencimento) : 0;
    const linhas = a.lista.map(function (x) {
      return [txt(x.pessoa + ' (' + x.n + ')'), brl(x.aVencer), brl(x.d30), brl(x.d60), brl(x.d90), brl(x.d90mais, { color: x.d90mais ? VERMELHO_TX : null }), brl(x.vencido, { b: true, color: x.vencido ? VERMELHO_TX : null })];
    });
    if (a.lista.length) linhas.push({ total: true, celulas: [txt('Total'), brl(t.aVencer), brl(t.d30), brl(t.d60), brl(t.d90), brl(t.d90mais), brl(t.vencido)] });
    const g = t.vencido > 0 ? graficoColunas({ categorias: ['1 a 30 dias', '31 a 60 dias', '61 a 90 dias', 'Mais de 90 dias'], series: [{ nome: 'Vencido', cor: PALETA.laranja, valores: [t.d30, t.d60, t.d90, t.d90mais] }], w: 900, h: 260 }) : null;
    const nome = tipo === 'receber' ? 'INADIMPLÊNCIA — CONTAS A RECEBER VENCIDAS' : 'CONTAS A PAGAR EM ATRASO';
    return {
      titulo: nome, arquivo: (tipo === 'receber' ? 'Inadimplencia_' : 'Atrasos_a_pagar_') + hoje().replace(/-/g, ''), deitado: true,
      sub: 'Posição em ' + U.dataBR(hoje()) + ' · faixas pelos dias de atraso do vencimento',
      chips: [['Vencido:', U.brl(t.vencido), t.vencido ? 'DC2626' : AZUL], [tipo === 'receber' ? 'Clientes:' : 'Fornecedores:', String(inadimpl), AZUL]],
      indicadores: [['Total vencido', U.brl(t.vencido), t.vencido ? VERMELHO_TX : AZUL], ['% do total em aberto', pct(t.total > 0 ? t.vencido / t.total : 0)],
        ['Em aberto (a vencer)', U.brl(t.aVencer)], ['Atraso mais antigo', maisAntigo ? maisAntigo + ' dias' : '—']],
      blocos: [
        g ? { titulo: 'Vencido por faixa de atraso', grafico: g, larguraGrafico: 0.8 } : null,
        { titulo: tipo === 'receber' ? 'Por cliente' : 'Por fornecedor', cols: [{ t: tipo === 'receber' ? 'Cliente (lançamentos)' : 'Fornecedor (lançamentos)', w: 2700 }, { t: 'A vencer', w: 1110, jc: 'right' },
          { t: '1–30 dias', w: 1110, jc: 'right' }, { t: '31–60 dias', w: 1110, jc: 'right' }, { t: '61–90 dias', w: 1110, jc: 'right' }, { t: '> 90 dias', w: 1110, jc: 'right' }, { t: 'Total vencido', w: 1110, jc: 'right' }],
          linhas: linhas, sz: 15, vazio: 'Nada em aberto.' },
        { titulo: 'Lançamentos vencidos', cols: [{ t: 'Vencimento', w: 1100 }, { t: 'Dias', w: 700, jc: 'right' }, { t: 'Descrição', w: 3200 }, { t: tipo === 'receber' ? 'Cliente' : 'Fornecedor', w: 2200 }, { t: 'Valor', w: 2160, jc: 'right' }],
          linhas: vencidos.map(function (l) { return [txt(U.dataBR(l.vencimento)), txt(String(F_dias(l.vencimento)), { jc: 'right', color: VERMELHO_TX }), txt(l.descricao), txt((l.pessoa && l.pessoa.nome) || ''), brl(U.numOr(l.valor, 0))]; }),
          sz: 15, vazio: 'Nenhum lançamento vencido.' }
      ]
    };
  }

  /** Fluxo de caixa mensal (realizado e previsto). o: {antes, depois} */
  function fluxo(o) {
    const d = dados();
    const fl = F().fluxo(d.lancs, d.contas, hoje(), o.antes == null ? 3 : o.antes, o.depois == null ? 6 : o.depois);
    const saldoHoje = F().saldoTotal(d.contas, d.lancs, hoje());
    const linhas = fl.map(function (m) {
      return { destaque: m.atual, celulas: [txt(m.rot + (m.passado ? '' : m.atual ? ' (atual)' : ' (previsto)')), brl(m.entradasRealizadas), brl(m.saidasRealizadas), brl(m.entradasPrevistas), brl(m.saidasPrevistas),
        brlSinal(m.entradas - m.saidas), brlSinal(m.saldo, { b: true })] };
    });
    const tot = fl.reduce(function (s, m) { s.er += m.entradasRealizadas; s.sr += m.saidasRealizadas; s.ep += m.entradasPrevistas; s.sp += m.saidasPrevistas; return s; }, { er: 0, sr: 0, ep: 0, sp: 0 });
    linhas.push({ total: true, celulas: [txt('Total'), brl(tot.er), brl(tot.sr), brl(tot.ep), brl(tot.sp), brlSinal(tot.er + tot.ep - tot.sr - tot.sp), txt('')] });
    const g = graficoColunas({ categorias: fl.map(function (m) { return m.rot; }), series: [{ nome: 'Entradas', cor: PALETA.azul, valores: fl.map(function (m) { return m.entradas; }) },
      { nome: 'Saídas', cor: PALETA.laranja, valores: fl.map(function (m) { return m.saidas; }) }, { nome: 'Saldo no fim do mês', cor: PALETA.verde, valores: fl.map(function (m) { return m.saldo; }), linha: true }], w: 1040, h: 330 });
    const fim = fl[fl.length - 1];
    const menor = fl.filter(function (m) { return !m.passado; }).reduce(function (a, m) { return !a || m.saldo < a.saldo ? m : a; }, null);
    return {
      titulo: 'FLUXO DE CAIXA', arquivo: 'Fluxo_de_caixa_' + hoje().replace(/-/g, ''),
      sub: fl[0].rot + ' a ' + fim.rot + ' · realizado (meses passados) e previsto (em aberto, inclusive vencidos)',
      chips: [['Saldo hoje:', U.brl(saldoHoje), AZUL], ['Saldo projetado (' + fim.rot + '):', U.brl(fim.saldo), fim.saldo < 0 ? 'DC2626' : AZUL]],
      indicadores: [['Saldo em caixa e bancos hoje', U.brl(saldoHoje)], ['Saldo projetado em ' + fim.rot, U.brl(fim.saldo), fim.saldo < 0 ? VERMELHO_TX : AZUL],
        ['Menor saldo projetado', menor ? U.brl(menor.saldo) : '—', menor && menor.saldo < 0 ? VERMELHO_TX : AZUL, menor ? menor.rot : ''], ['Previsto a receber − a pagar', U.brl(tot.ep - tot.sp)]],
      blocos: [
        { titulo: 'Entradas, saídas e saldo', grafico: g },
        { titulo: 'Mês a mês', cols: [{ t: 'Mês', w: 1800 }, { t: 'Entradas realizadas', w: 1260, jc: 'right' }, { t: 'Saídas realizadas', w: 1260, jc: 'right' }, { t: 'Entradas previstas', w: 1260, jc: 'right' },
          { t: 'Saídas previstas', w: 1260, jc: 'right' }, { t: 'Resultado do mês', w: 1260, jc: 'right' }, { t: 'Saldo no fim do mês', w: 1260, jc: 'right' }], linhas: linhas, sz: 15 }
      ],
      notas: ['Saldo no fim do mês: meses passados pelo saldo das contas; mês atual e seguintes, projetado a partir do saldo de hoje com o que está em aberto (os vencidos entram no mês atual).']
    };
  }

  /** Movimento de caixa (realizado) no período, em todas as contas. o: {de, ate} */
  function movimento(o) {
    const d = dados();
    const de = o.de || hoje().slice(0, 8) + '01', ate = o.ate || hoje();
    const mv = F().movimento(d.lancs, d.contas, d.cats, de, ate);
    const linhas = mv.linhas.map(function (m) {
      return [txt(U.dataBR(m.data)), txt(m.descricao), txt(m.pessoa), txt(m.categoria), txt(m.conta), m.entrada ? brl(m.entrada, { color: VERDE_TX }) : txt(''), m.saida ? brl(m.saida, { color: VERMELHO_TX }) : txt('')];
    });
    if (mv.linhas.length) linhas.push({ total: true, celulas: [txt('Total'), txt(mv.linhas.length + ' movimento(s)'), txt(''), txt(''), txt(''), brl(mv.entradas), brl(mv.saidas)] });
    const saldos = mv.saldos.map(function (x) { return [txt(x.conta.nome), brl(x.anterior), brl(x.entradas), brl(x.saidas), brlSinal(x.final, { b: true })]; });
    const st = mv.saldos.reduce(function (s, x) { s.a += x.anterior; s.e += x.entradas; s.s += x.saidas; s.f += x.final; return s; }, { a: 0, e: 0, s: 0, f: 0 });
    if (mv.saldos.length > 1) saldos.push({ total: true, celulas: [txt('Total'), brl(st.a), brl(st.e), brl(st.s), brl(st.f)] });
    return {
      titulo: 'MOVIMENTO DE CAIXA', arquivo: 'Movimento_de_caixa_' + de.replace(/-/g, '') + '_' + ate.replace(/-/g, ''), deitado: true,
      sub: 'Recebimentos e pagamentos realizados de ' + periodoTxt(de, ate),
      chips: [['Entradas:', U.brl(mv.entradas), '15803D'], ['Saídas:', U.brl(mv.saidas), 'DC2626']],
      indicadores: [['Entradas', U.brl(mv.entradas), VERDE_TX], ['Saídas', U.brl(mv.saidas), VERMELHO_TX], ['Resultado de caixa', U.brl(mv.saldo), mv.saldo < 0 ? VERMELHO_TX : AZUL], ['Saldo final das contas', U.brl(st.f)]],
      blocos: [
        { titulo: 'Saldos por conta', cols: [{ t: 'Conta', w: 3360 }, { t: 'Saldo anterior', w: 1500, jc: 'right' }, { t: 'Entradas', w: 1500, jc: 'right' }, { t: 'Saídas', w: 1500, jc: 'right' }, { t: 'Saldo final', w: 1500, jc: 'right' }], linhas: saldos, sz: 15 },
        { titulo: 'Movimentos', cols: [{ t: 'Data', w: 850 }, { t: 'Descrição', w: 2700 }, { t: 'Cliente / fornecedor', w: 1500 }, { t: 'Categoria', w: 1500 }, { t: 'Conta', w: 900 },
          { t: 'Entrada', w: 955, jc: 'right' }, { t: 'Saída', w: 955, jc: 'right' }], linhas: linhas, sz: 15, vazio: 'Nenhum recebimento ou pagamento no período.' }
      ],
      notas: mv.transferencias ? [mv.transferencias + ' transferência(s) entre as contas da empresa no período: aparecem nos saldos por conta, não nos movimentos.'] : []
    };
  }

  /** Extrato de uma conta. o: {contaId, de, ate} */
  function extrato(o) {
    const d = dados();
    const conta = d.contas.find(function (c) { return c.id === o.contaId; }) || d.contas[0];
    if (!conta) throw new Error('Cadastre uma conta em Caixa e bancos.');
    const de = o.de || '', ate = o.ate || hoje();
    const ex = F().extrato(conta, d.lancs, de, ate);
    const ent = ex.linhas.reduce(function (s, m) { return s + m.entrada; }, 0), sai = ex.linhas.reduce(function (s, m) { return s + m.saida; }, 0);
    const linhas = [{ destaque: true, celulas: [txt(de ? U.dataBR(F().somarDias(de, -1)) : ''), txt('Saldo anterior'), txt(''), txt(''), brlSinal(ex.anterior)] }].concat(ex.linhas.map(function (m) {
      return [txt(U.dataBR(m.data)), txt(m.descricao + (m.l.tipo === 'transferencia' ? ' (transferência)' : '') + (m.l.conciliado ? ' ✓' : '')),
        m.entrada ? brl(m.entrada, { color: VERDE_TX }) : txt(''), m.saida ? brl(m.saida, { color: VERMELHO_TX }) : txt(''), brlSinal(m.saldo)];
    }));
    linhas.push({ total: true, celulas: [txt(''), txt('Saldo final'), brl(ent), brl(sai), brlSinal(ex.final)] });
    return {
      titulo: 'EXTRATO — ' + conta.nome.toUpperCase(), arquivo: 'Extrato_' + U.slug(conta.nome) + '_' + ate.replace(/-/g, ''),
      sub: [F().rotulo(F().TIPOS_CONTA, conta.tipo), conta.banco, conta.agencia ? 'ag. ' + conta.agencia : '', conta.numero ? 'c/c ' + conta.numero : ''].filter(Boolean).join(' · ') + ' · ' + periodoTxt(de, ate),
      chips: [['Saldo final:', U.brl(ex.final), ex.final < 0 ? 'DC2626' : AZUL]],
      indicadores: [['Saldo anterior', U.brl(ex.anterior)], ['Entradas', U.brl(ent), VERDE_TX], ['Saídas', U.brl(sai), VERMELHO_TX], ['Saldo final', U.brl(ex.final), ex.final < 0 ? VERMELHO_TX : AZUL]],
      blocos: [{ cols: [{ t: 'Data', w: 1100 }, { t: 'Descrição', w: 4060 }, { t: 'Entrada', w: 1400, jc: 'right' }, { t: 'Saída', w: 1400, jc: 'right' }, { t: 'Saldo', w: 1400, jc: 'right' }], linhas: linhas, sz: 16 }],
      notas: ['✓ = conciliado com o extrato do banco (OFX).']
    };
  }

  /** Receitas e despesas por categoria no período. o: {de, ate, regime} */
  function categorias(o) {
    const d = dados();
    const de = o.de || hoje().slice(0, 4) + '-01-01', ate = o.ate || hoje();
    const c = F().porCategoria(d.lancs, d.cats, de, ate, o.regime);
    const grupoLabel = function (id) { const g = App.DEFAULTS.GRUPOS_DRE.find(function (x) { return x.id === id; }); return g ? g.label.replace(/^\([−+]\)\s*/, '').split(' (')[0] : id; };
    const tab = function (bloco, titulo) {
      const linhas = bloco.lista.map(function (x) { return [txt(x.nome), txt(grupoLabel(x.grupo)), txt(String(x.n), { jc: 'right' }), brl(x.total), pctC(x.pct)]; });
      if (bloco.lista.length) linhas.push({ total: true, celulas: [txt('Total'), txt(''), txt(String(bloco.lista.reduce(function (s, x) { return s + x.n; }, 0)), { jc: 'right' }), brl(bloco.total), pctC(1)] });
      return { titulo: titulo, cols: [{ t: 'Categoria', w: 3560 }, { t: 'Linha da DRE', w: 2300 }, { t: 'Lanç.', w: 800, jc: 'right' }, { t: 'Valor', w: 1600, jc: 'right' }, { t: '%', w: 1100, jc: 'right' }], linhas: linhas, sz: 16, vazio: 'Nada no período.' };
    };
    const top = c.despesas.lista.slice(0, 12);
    const g = top.length ? graficoBarras({ categorias: top.map(function (x) { return x.nome.length > 46 ? x.nome.slice(0, 44) + '…' : x.nome; }), series: [{ nome: 'Despesas', cor: PALETA.laranja, valores: top.map(function (x) { return x.total; }) }], w: 980 }) : null;
    return {
      titulo: 'RECEITAS E DESPESAS POR CATEGORIA', arquivo: 'Categorias_' + de.replace(/-/g, '') + '_' + ate.replace(/-/g, ''),
      sub: periodoTxt(de, ate) + ' · regime de ' + (c.regime === 'caixa' ? 'caixa (recebimentos e pagamentos)' : 'competência (data da venda/compra)'),
      chips: [['Resultado:', U.brl(c.resultado), c.resultado < 0 ? 'DC2626' : AZUL]],
      indicadores: [['Receitas', U.brl(c.receitas.total), VERDE_TX], ['Despesas e custos', U.brl(c.despesas.total), VERMELHO_TX], ['Resultado', U.brl(c.resultado), c.resultado < 0 ? VERMELHO_TX : AZUL],
        ['Margem', pct(c.receitas.total > 0 ? c.resultado / c.receitas.total : null)]],
      blocos: [
        tab(c.receitas, 'Receitas'),
        tab(c.despesas, 'Despesas e custos'),
        g ? { titulo: 'Maiores despesas', grafico: g } : null,
        (c.foraEntradas.lista.length || c.foraSaidas.lista.length) ? tab({ lista: c.foraEntradas.lista.concat(c.foraSaidas.lista), total: U.round(c.foraEntradas.total - c.foraSaidas.total, 2) }, 'Fora do resultado (investimentos, empréstimos, aportes e retiradas)') : null
      ]
    };
  }

  /** DRE gerencial do ano (página deitada). o: {ano, regime} */
  function dre(o) {
    const d = dados();
    const ano = String(o.ano || hoje().slice(0, 4));
    const r = F().dre(d.lancs, d.cats, ano, o.regime);
    const linhaDre = function (l) {
      const cls = l.tipo;
      const av = l.tipo === 'fora' || !r.receitaLiquida ? txt('') : txt(U.fmt(l.total / r.receitaLiquida * 100, 1) + '%', { jc: 'right' });
      const cel = [txt(l.label, { recuo: cls === 'categoria', i: cls === 'fora' })].concat(l.valores.map(function (v) { return num0(v); }), [num0(l.total, { b: true }), av]);
      if (cls === 'subtotal') return { [l.destaque ? 'total' : 'subtotal']: true, celulas: cel };
      if (cls === 'grupo') return { destaque: true, celulas: cel };
      return cel;
    };
    const linhas = r.linhas.filter(function (l) { return l.tipo !== 'categoria' || l.total; }).map(linhaDre).concat([linhaDre(r.fora)]);
    const rl = r.linhas.find(function (l) { return l.label === '= Receita líquida'; });
    const lb = r.linhas.find(function (l) { return /Lucro bruto/.test(l.label); });
    const fim = r.linhas[r.linhas.length - 1];
    const g = graficoColunas({ categorias: F().MESES, series: [{ nome: 'Receita líquida', cor: PALETA.azul, valores: rl.valores }, { nome: 'Resultado líquido', cor: PALETA.verde, valores: fim.valores }], w: 1180, h: 280 });
    return {
      titulo: 'DRE GERENCIAL ' + ano, arquivo: 'DRE_' + ano + '_' + r.regime, deitado: true,
      sub: 'Demonstração do resultado mês a mês (R$) · regime de ' + (r.regime === 'caixa' ? 'caixa' : 'competência') + ' · emitido em ' + U.dataBR(hoje()),
      chips: [['Resultado líquido:', U.brl(fim.total), fim.total < 0 ? 'DC2626' : AZUL]],
      indicadores: [['Receita líquida', U.brl(rl.total)], ['Lucro bruto', U.brl(lb.total), null, 'margem ' + pct(rl.total ? lb.total / rl.total : null)],
        ['Resultado líquido', U.brl(fim.total), fim.total < 0 ? VERMELHO_TX : AZUL, 'margem ' + pct(rl.total ? fim.total / rl.total : null)], ['Fora do resultado', U.brl(r.fora.total)]],
      blocos: [
        { cols: [{ t: '', w: 2300 }].concat(F().MESES.map(function (m) { return { t: m, w: 475, jc: 'right' }; }), [{ t: 'Total', w: 760, jc: 'right' }, { t: 'AV %', w: 600, jc: 'right' }]), linhas: linhas, sz: 13 },
        { titulo: 'Receita líquida × resultado líquido', grafico: g, larguraGrafico: 0.9 }
      ],
      notas: [(r.regime === 'caixa' ? 'Caixa: só os recebimentos e pagamentos, pela data do pagamento.' : 'Competência: lançamentos não cancelados pela data de competência (venda/compra/serviço).') +
        ' Juros e descontos das baixas entram nas receitas e despesas financeiras. AV % = análise vertical sobre a receita líquida.' + (r.semCategoria ? ' ' + r.semCategoria + ' lançamento(s) sem categoria.' : '')]
    };
  }

  /* ---------- resultado por obra */

  function opcoesObras(o) {
    const d = dados();
    const par = F().parametrosObras();
    let lista = F().resultadoObras(S().list('propostas'), d.lancs, d.cats, App.Calc.contexto(), par);
    if (o.de || o.ate) lista = lista.filter(function (x) { const a = String(x.p.aprovadaEm || x.p.data || '').slice(0, 10); return (!o.de || a >= o.de) && (!o.ate || a <= o.ate); });
    if (o.situacao === 'abertas') lista = lista.filter(function (x) { return !x.fechada; });
    if (o.situacao === 'fechadas') lista = lista.filter(function (x) { return x.fechada; });
    return { lista: lista, par: par };
  }

  /** Blocos da apuração de uma obra (relatório da obra e o detalhamento no relatório de todas). */
  function blocosObra(a, quebra) {
    const p = a.p;
    const tipoSis = p.tipoSistema === 'hibrido' ? 'Híbrido' : p.tipoSistema === 'bess' ? 'BESS' : 'On-Grid';
    const r = a.prev.r;
    const inst = a.instalacao;
    const linhas = [{ destaque: true, celulas: [txt('(+) Preço de venda / receita'), brl(a.vendido), brl(a.lancadoReceber), brl(a.receita, { b: true }), brlSinal(a.receita - a.vendido)] }];
    a.linhas.forEach(function (l) {
      linhas.push([txt('(−) ' + l.label + (l.nota ? ' — ' + l.nota : ''), { recuo: true }), brl(l.previsto), brl(l.realizado, { color: l.realizado ? null : CINZA }),
        brl(l.apurado, { b: true }), brlSinal(l.variacao)]);
    });
    linhas.push({ subtotal: true, celulas: [txt('= Custos e despesas da obra'), brl(a.custoPrevisto), brl(a.custoRealizado), brl(a.custoApurado), brlSinal(a.custoPrevisto - a.custoApurado)] });
    linhas.push({ total: true, celulas: [txt('= Resultado da obra'), brlSinal(a.resultadoPrevisto), txt(''), brlSinal(a.resultado), brlSinal(a.variacao)] });
    linhas.push({ subtotal: true, celulas: [txt('Margem sobre a venda'), pctC(a.margemPrevista), txt(''), pctC(a.margem), txt(a.margemPrevista != null ? U.fmt((a.margem - a.margemPrevista) * 100, 1) + ' p.p.' : '', { jc: 'right' })] });
    const linhasG = a.linhas.filter(function (l) { return l.previsto || l.apurado; });
    const g = linhasG.length ? graficoBarras({ categorias: linhasG.map(function (l) { return l.label.split(' (')[0]; }), series: [{ nome: 'Previsto (proposta)', cor: PALETA.cinza, valores: linhasG.map(function (l) { return l.previsto; }) },
      { nome: 'Apurado', cor: PALETA.azul, valores: linhasG.map(function (l) { return l.apurado; }) }], w: 980 }) : null;
    const ls = a.lancamentos.slice().sort(function (x, y) { return String(x.vencimento).localeCompare(String(y.vencimento)); });
    const linhaApur = function (l) { if (l.tipo === 'receber') return 'Receita'; const id = F().linhaObra(l, S().list('categoriasFin')); const d = F().LINHAS_OBRA.find(function (x) { return x.id === id; }); return d ? d.label.split(' (')[0] : 'Fora do resultado'; };
    const blocos = [
      { quebra: !!quebra, faixa: quebra ? ['OBRA ' + p.numero, (p.clienteNome || '') + ' · aprovada em ' + U.dataBR(p.aprovadaEm || p.data), [['Margem apurada:', pct(a.margem), a.margem < 0 ? 'DC2626' : AZUL]]] : null,
        titulo: 'Dados da obra', pares: [['Cliente', p.clienteNome], ['Proposta', p.numero + ' — ' + tipoSis + (r && r.kwp ? ' · ' + U.kwp(r.kwp) + ' kWp' : '')],
          ['Aprovada em', U.dataBR(p.aprovadaEm || p.data)], ['Vendedor', p.vendedor && p.vendedor.nome], ['Instalação', inst ? (inst.titulo || 'vinculada') + ' — ' + (((App.Instalacao.STATUS.find(function (s) { return s.id === a.statusInstalacao; }) || {}).label) || '') : 'sem instalação vinculada'],
          ['Apuração', a.fechada ? 'Fechada em ' + U.dataBR(a.fechadaEm) + ' (vale o realizado)' : 'Em andamento (custos ainda não lançados entram pelo previsto)']] },
      { titulo: 'Apuração do resultado', cols: [{ t: 'Linha', w: 3360 }, { t: 'Previsto (proposta)', w: 1500, jc: 'right' }, { t: 'Realizado (lançado)', w: 1500, jc: 'right' }, { t: 'Apurado', w: 1500, jc: 'right' },
        { t: 'Efeito no resultado', w: 1500, jc: 'right' }], linhas: linhas, sz: 15, nota: 'Efeito no resultado: diferença entre o apurado e o previsto — positivo melhora, negativo piora o resultado da obra.' },
      g ? { titulo: 'Previsto × apurado por linha de custo', grafico: g } : null,
      { titulo: 'Caixa da obra', indicadores: [['Recebido do cliente', U.brl(a.recebido), VERDE_TX], ['A receber', U.brl(a.aReceber)], ['Pago (custos)', U.brl(a.pago), VERMELHO_TX], ['Saldo de caixa', U.brl(a.saldoCaixa), a.saldoCaixa < 0 ? VERMELHO_TX : AZUL, 'a pagar ' + U.brl(a.aPagar)]] },
      { titulo: 'Lançamentos da obra', cols: [{ t: 'Vencimento', w: 1000 }, { t: 'Descrição', w: 3300 }, { t: 'Linha da apuração', w: 2000 }, { t: 'Situação', w: 1360 }, { t: 'Valor', w: 1700, jc: 'right' }],
        linhas: ls.map(function (l) { return [txt(U.dataBR(l.vencimento)), txt(l.descricao), txt(linhaApur(l)), txt(sitTexto(l)), brl(l.tipo === 'receber' ? U.numOr(l.valor, 0) : -U.numOr(l.valor, 0), { color: l.tipo === 'receber' ? VERDE_TX : VERMELHO_TX })]; }),
        sz: 15, vazio: 'Nenhum lançamento com esta obra no financeiro: a apuração usa o previsto da proposta.' }
    ];
    // material CA: previsto na proposta × consumido na instalação
    if (inst && App.Materiais && (inst.materiais || []).length) {
      const ms = inst.materiais.filter(function (m) { return String(m.descricao || '').trim(); });
      const rs = App.Materiais.resumo(inst, p);
      blocos.push({ titulo: 'Material CA: previsto × consumido na instalação', cols: [{ t: 'Material', w: 3960 }, { t: 'Previsto', w: 1000, jc: 'right' }, { t: 'Usado', w: 1000, jc: 'right' }, { t: 'Custo unit.', w: 1500, jc: 'right' }, { t: 'Total usado', w: 1900, jc: 'right' }],
        linhas: ms.map(function (m) { return [txt(m.descricao), txt(U.fmtSmart(U.numOr(m.qtdPrevista, 0), 2) + ' ' + (m.unidade || ''), { jc: 'right' }), txt(U.fmtSmart(U.numOr(m.qtd, 0), 2) + ' ' + (m.unidade || ''), { jc: 'right' }), brl(U.numOr(m.custo, 0)), brl(U.numOr(m.qtd, 0) * U.numOr(m.custo, 0))]; })
          .concat([{ total: true, celulas: [txt('Total'), brl(rs.previsto), brl(rs.usado), txt(''), brl(rs.usado)] }]), sz: 15 });
    }
    return blocos;
  }

  /** Apuração de uma obra. o: {id} */
  function obra(o) {
    const op = opcoesObras({});
    const a = op.lista.find(function (x) { return x.p.id === o.id; });
    if (!a) throw new Error('Obra não encontrada (a proposta precisa estar aprovada).');
    const p = a.p;
    return {
      titulo: 'APURAÇÃO DA OBRA ' + p.numero, arquivo: 'Apuracao_obra_' + U.slug(p.numero) + (p.clienteNome ? '_' + U.slug(p.clienteNome) : ''),
      sub: (p.clienteNome || '') + ' · ' + (a.fechada ? 'apuração fechada' : 'apuração em andamento') + ' · emitido em ' + U.dataBR(hoje()),
      chips: [['Venda:', U.brl(a.vendido), AZUL], ['Resultado:', U.brl(a.resultado), a.resultado < 0 ? 'DC2626' : AZUL], ['Margem:', pct(a.margem), a.margem < 0 ? 'DC2626' : AZUL]],
      indicadores: [['Preço de venda', U.brl(a.vendido)], ['Custos apurados', U.brl(a.custoApurado), VERMELHO_TX], ['Resultado apurado', U.brl(a.resultado), a.resultado < 0 ? VERMELHO_TX : VERDE_TX, 'margem ' + pct(a.margem)],
        ['Resultado previsto', U.brl(a.resultadoPrevisto), null, 'margem ' + pct(a.margemPrevista)]],
      blocos: blocosObra(a, false),
      notas: ['Previsto: composição de preço da proposta (kit, mão de obra de instalação, material CA, outros valores e comissão) e os impostos pela alíquota da apuração (' +
        pct(op.par.aliquota) + '). Realizado: lançamentos a pagar com a obra no financeiro (o material CA sem lançamento usa o consumo registrado na instalação). ' +
        'Apurado: com a apuração em andamento, o maior entre previsto e realizado; fechada, o realizado.']
    };
  }

  /** Resultado de todas as obras (e, opcionalmente, a apuração de cada uma). o: {de, ate, situacao, detalhar} */
  function obras(o) {
    const op = opcoesObras(o);
    const lista = op.lista;
    const t = F().totaisObras(lista);
    const linhas = lista.map(function (a) {
      return [txt(a.p.numero + (a.fechada ? ' 🔒' : '')), txt(a.p.clienteNome || ''), brl(a.vendido), brl(a.custoPrevisto), brl(a.custoApurado), brlSinal(a.resultadoPrevisto), brlSinal(a.resultado, { b: true }),
        txt(pct(a.margem) + ' (prev. ' + pct(a.margemPrevista) + ')', { jc: 'right', color: a.margem < 0 ? VERMELHO_TX : null })];
    });
    if (lista.length) linhas.push({ total: true, celulas: [txt('Total'), txt(lista.length + ' obra(s)'), brl(t.vendido), brl(t.custoPrevisto), brl(t.custoApurado), brlSinal(t.resultadoPrevisto), brlSinal(t.resultado),
      txt(pct(t.margem) + ' (prev. ' + pct(t.margemPrevista) + ')', { jc: 'right' })] });
    const top = lista.slice(0, 14);
    const g = top.length ? graficoColunas({ categorias: top.map(function (a) { return String(a.p.numero).split('-').slice(-2).join('-'); }), series: [{ nome: 'Resultado previsto', cor: PALETA.cinza, valores: top.map(function (a) { return a.resultadoPrevisto; }) },
      { nome: 'Resultado apurado', cor: PALETA.azul, valores: top.map(function (a) { return a.resultado; }) }], w: 1180, h: 280 }) : null;
    let blocos = [
      g ? { titulo: 'Resultado previsto × apurado', grafico: g, larguraGrafico: 0.9 } : null,
      { titulo: 'Obras', cols: [{ t: 'Obra', w: 1500 }, { t: 'Cliente', w: 1700 }, { t: 'Venda', w: 1020, jc: 'right' }, { t: 'Custo previsto', w: 1020, jc: 'right' }, { t: 'Custo apurado', w: 1020, jc: 'right' },
        { t: 'Resultado previsto', w: 1020, jc: 'right' }, { t: 'Resultado apurado', w: 1020, jc: 'right' }, { t: 'Margem apurada', w: 1060, jc: 'right' }], linhas: linhas, sz: 15, vazio: 'Nenhuma obra (proposta aprovada) com esses filtros.' }
    ];
    if (o.detalhar) lista.forEach(function (a) { blocos = blocos.concat(blocosObra(a, true)); });
    return {
      titulo: 'RESULTADO POR OBRA', arquivo: 'Resultado_por_obra_' + hoje().replace(/-/g, ''), deitado: true,
      sub: (o.de || o.ate ? 'Aprovadas ' + periodoTxt(o.de, o.ate) : 'Todas as obras aprovadas') + (o.situacao === 'abertas' ? ' · apuração em andamento' : o.situacao === 'fechadas' ? ' · apuração fechada' : '') + ' · emitido em ' + U.dataBR(hoje()),
      chips: [['Obras:', String(t.n), AZUL], ['Resultado:', U.brl(t.resultado), t.resultado < 0 ? 'DC2626' : AZUL]],
      indicadores: [['Vendido', U.brl(t.vendido)], ['Custos apurados', U.brl(t.custoApurado), VERMELHO_TX], ['Resultado apurado', U.brl(t.resultado), t.resultado < 0 ? VERMELHO_TX : VERDE_TX, 'margem ' + pct(t.margem)],
        ['Resultado previsto', U.brl(t.resultadoPrevisto), null, 'margem ' + pct(t.margemPrevista)]],
      blocos: blocos,
      notas: ['🔒 = apuração fechada (vale o realizado). Nas demais, custos ainda não lançados entram pelo previsto da proposta. Impostos previstos pela alíquota de ' + pct(op.par.aliquota) + '.']
    };
  }

  /** Comissões por vendedor. */
  function comissoes() {
    const d = dados();
    const c = F().comissoes(S().list('propostas'), d.lancs, App.Calc.contexto());
    const linhas = [];
    const tot = { vendido: 0, comissao: 0, liberada: 0, lancada: 0, paga: 0, aLancar: 0 };
    c.vendedores.forEach(function (v) {
      linhas.push({ grupo: v.nome + ' — ' + v.vendas + (v.vendas === 1 ? ' venda' : ' vendas') });
      v.itens.forEach(function (it) {
        linhas.push([txt(it.p.numero), txt(it.p.clienteNome || ''), brl(it.total), brl(it.comissao), pctC(it.fracao), brl(it.liberada), brl(it.lancada), brl(it.paga)]);
      });
      linhas.push({ subtotal: true, celulas: [txt('Subtotal'), txt('a lançar: ' + U.brl(v.aLancar)), brl(v.vendido), brl(v.comissao), txt(''), brl(v.liberada), brl(v.lancada), brl(v.paga)] });
      Object.keys(tot).forEach(function (k) { tot[k] += v[k]; });
    });
    if (c.vendedores.length) linhas.push({ total: true, celulas: [txt('Total'), txt('a lançar: ' + U.brl(tot.aLancar)), brl(tot.vendido), brl(tot.comissao), txt(''), brl(tot.liberada), brl(tot.lancada), brl(tot.paga)] });
    return {
      titulo: 'COMISSÕES POR VENDEDOR', arquivo: 'Comissoes_' + hoje().replace(/-/g, ''), deitado: true,
      sub: 'Comissão de cada venda aprovada, liberada na proporção do que o cliente já pagou · emitido em ' + U.dataBR(hoje()),
      chips: [['Liberada:', U.brl(tot.liberada), AZUL], ['A lançar:', U.brl(tot.aLancar), AZUL]],
      indicadores: [['Comissão das vendas', U.brl(tot.comissao)], ['Liberada', U.brl(tot.liberada)], ['Lançada a pagar', U.brl(tot.lancada)], ['Paga', U.brl(tot.paga), VERDE_TX]],
      blocos: [{ cols: [{ t: 'Venda', w: 1300 }, { t: 'Cliente', w: 2010 }, { t: 'Valor da venda', w: 1150, jc: 'right' }, { t: 'Comissão', w: 1150, jc: 'right' }, { t: 'Recebido', w: 900, jc: 'right' },
        { t: 'Liberada', w: 950, jc: 'right' }, { t: 'Lançada', w: 950, jc: 'right' }, { t: 'Paga', w: 950, jc: 'right' }], linhas: linhas, sz: 15, vazio: 'Nenhuma venda aprovada com vendedor.' }]
    };
  }

  /** Resumo financeiro (painel em uma ou duas páginas). */
  function resumo() {
    const d = dados();
    const dia = hoje();
    const r = F().resumo(d.lancs, d.contas, dia);
    const fl = F().fluxo(d.lancs, d.contas, dia, 2, 5);
    const ano = dia.slice(0, 4), mes = parseInt(dia.slice(5, 7), 10) - 1;
    const dr = F().dre(d.lancs, d.cats, ano, 'competencia');
    const pega = function (re) { return dr.linhas.find(function (l) { return re.test(l.label); }); };
    const linhasDre = [pega(/^= Receita líquida/), pega(/Lucro bruto/), pega(/Resultado operacional/), pega(/Resultado líquido/)].map(function (l) {
      return [txt(l.label.replace(/^= /, '')), brlSinal(l.valores[mes]), brlSinal(l.total, { b: true })];
    });
    const saldos = d.contas.filter(function (c) { return c.ativo !== false; }).map(function (c) { return [txt(c.nome), brlSinal(F().saldoConta(c, d.lancs, dia), { b: true })]; });
    const venc = d.lancs.filter(function (l) { return l.situacao === 'aberto' && l.tipo !== 'transferencia' && l.vencimento <= F().somarDias(dia, 7); })
      .sort(function (a, b) { return String(a.vencimento).localeCompare(String(b.vencimento)); }).slice(0, 15);
    const ob = F().totaisObras(F().resultadoObras(S().list('propostas'), d.lancs, d.cats, App.Calc.contexto(), F().parametrosObras()));
    const g = graficoColunas({ categorias: fl.map(function (m) { return m.rot; }), series: [{ nome: 'Entradas', cor: PALETA.azul, valores: fl.map(function (m) { return m.entradas; }) },
      { nome: 'Saídas', cor: PALETA.laranja, valores: fl.map(function (m) { return m.saidas; }) }, { nome: 'Saldo', cor: PALETA.verde, valores: fl.map(function (m) { return m.saldo; }), linha: true }], w: 1040, h: 280 });
    return {
      titulo: 'RESUMO FINANCEIRO', arquivo: 'Resumo_financeiro_' + dia.replace(/-/g, ''),
      sub: 'Posição em ' + U.dataBR(dia) + ' · ' + F().MESES[mes] + '/' + ano,
      chips: [['Saldo:', U.brl(r.saldo), r.saldo < 0 ? 'DC2626' : AZUL]],
      indicadores: [['Saldo em caixa e bancos', U.brl(r.saldo)], ['A receber em 30 dias', U.brl(r.aReceber30)], ['A pagar em 30 dias', U.brl(r.aPagar30)], ['Resultado do mês (DRE)', U.brl(pega(/Resultado líquido/).valores[mes])],
        ['Vencidos a receber', U.brl(r.vencRec.valor), r.vencRec.valor ? VERMELHO_TX : AZUL, r.vencRec.n + ' lançamento(s)'], ['Vencidos a pagar', U.brl(r.vencPag.valor), r.vencPag.valor ? VERMELHO_TX : AZUL, r.vencPag.n + ' lançamento(s)'],
        ['Recebido no mês', U.brl(r.recebidoMes), VERDE_TX], ['Pago no mês', U.brl(r.pagoMes), VERMELHO_TX]],
      blocos: [
        { titulo: 'Fluxo de caixa', grafico: g },
        { titulo: 'Saldos das contas', cols: [{ t: 'Conta', w: 6360 }, { t: 'Saldo', w: 3000, jc: 'right' }], linhas: saldos, sz: 16 },
        { titulo: 'DRE (competência)', cols: [{ t: 'Linha', w: 4360 }, { t: F().MESES[mes] + '/' + ano, w: 2500, jc: 'right' }, { t: 'Acumulado ' + ano, w: 2500, jc: 'right' }], linhas: linhasDre, sz: 16 },
        { titulo: 'Obras', indicadores: [['Obras aprovadas', String(ob.n)], ['Vendido', U.brl(ob.vendido)], ['Resultado apurado', U.brl(ob.resultado), ob.resultado < 0 ? VERMELHO_TX : VERDE_TX, 'margem ' + pct(ob.margem)], ['A receber das obras', U.brl(ob.aReceber)]] },
        { titulo: 'Vencidos e vencendo em 7 dias', cols: [{ t: 'Vencimento', w: 1200 }, { t: 'Tipo', w: 1000 }, { t: 'Descrição', w: 3960 }, { t: 'Pessoa', w: 1800 }, { t: 'Valor', w: 1400, jc: 'right' }],
          linhas: venc.map(function (l) { return [txt(U.dataBR(l.vencimento), { color: l.vencimento < dia ? VERMELHO_TX : null }), txt(l.tipo === 'receber' ? 'A receber' : 'A pagar'), txt(l.descricao), txt((l.pessoa && l.pessoa.nome) || ''), brl(U.numOr(l.valor, 0))]; }),
          sz: 15, vazio: 'Nada vencido nem vencendo nos próximos 7 dias.' }
      ]
    };
  }

  const RELATORIOS = {
    resumo: { titulo: 'Resumo financeiro', dados: resumo },
    lancamentos: { titulo: 'Contas a receber / a pagar', dados: lancamentos },
    atrasos: { titulo: 'Inadimplência e atrasos', dados: atrasos },
    fluxo: { titulo: 'Fluxo de caixa', dados: fluxo },
    movimento: { titulo: 'Movimento de caixa', dados: movimento },
    extrato: { titulo: 'Extrato de conta', dados: extrato },
    categorias: { titulo: 'Receitas e despesas por categoria', dados: categorias },
    dre: { titulo: 'DRE gerencial', dados: dre },
    obras: { titulo: 'Resultado por obra', dados: obras },
    obra: { titulo: 'Apuração da obra', dados: obra },
    comissoes: { titulo: 'Comissões', dados: comissoes }
  };

  /** Estrutura do relatório (títulos, indicadores, blocos) — base do PDF e da planilha. */
  function estrutura(tipo, o) {
    const def = RELATORIOS[tipo];
    if (!def) throw new Error('Relatório desconhecido: ' + tipo);
    return def.dados(o || {});
  }

  /** PDF do relatório: {blob, nome, modelo, estrutura}. */
  async function pdf(tipo, o) {
    const ctx = App.Calc.contexto();
    const e = estrutura(tipo, o);
    const rec = await B().carregar(ctx, {});
    const modelo = montar(e, ctx, rec);
    const out = await App.Pdf.pacote(modelo, { logo: rec.logo }, { titulo: e.titulo.charAt(0) + e.titulo.slice(1).toLowerCase(), assunto: 'Relatório financeiro', autor: ctx.empresa.razao });
    return { blob: out.blob, nome: e.arquivo + '.pdf', modelo: modelo, estrutura: e };
  }

  /** Planilha (CSV com ; e vírgula decimal) com as tabelas do relatório. */
  function csv(tipo, o) {
    const e = estrutura(tipo, o);
    const esc = function (s) { s = String(s == null ? '' : s); return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const val = function (c) {
      if (c == null) return '';
      if (typeof c !== 'object') return esc(c);
      if (typeof c.v === 'number') return String(c.v).replace('.', ',');
      return esc(c.t);
    };
    const out = [esc(e.titulo), esc(e.sub || '')];
    (e.indicadores || []).forEach(function (x) { if (x) out.push(esc(x[0]) + ';' + esc(x[1])); });
    (e.blocos || []).forEach(function (bl) {
      if (!bl || !bl.cols || !bl.linhas || !bl.linhas.length) return;
      out.push('');
      if (bl.titulo || bl.faixa) out.push(esc(bl.titulo || bl.faixa[0]));
      out.push(bl.cols.map(function (c) { return esc(c.t); }).join(';'));
      bl.linhas.forEach(function (l) {
        if (l.grupo != null) { out.push(esc(l.grupo)); return; }
        out.push((Array.isArray(l) ? l : l.celulas).map(val).join(';'));
      });
    });
    return { texto: '﻿' + out.join('\r\n'), nome: e.arquivo + '.csv' };
  }

  /* ------------------------------------------------------------ botões */

  /**
   * Botões do relatório: 👁 Visualizar, 🖨 Imprimir, ⬇ PDF e ⬇ Planilha. opcoes(): opções do relatório no momento do clique
   * (filtros da tela). o: {semPlanilha, rotulo, planilha: função que devolve {texto, nome} no lugar da planilha padrão}
   */
  function botoes(tipo, opcoes, o) {
    o = o || {};
    const h = U.h, UI = App.UI;
    const gerar = function () { return pdf(tipo, typeof opcoes === 'function' ? opcoes() : opcoes); };
    const titulo = function () { try { return estrutura(tipo, typeof opcoes === 'function' ? opcoes() : opcoes).titulo; } catch (e) { return RELATORIOS[tipo].titulo; } };
    const tratar = function (fn, botao) {
      return async function () {
        if (botao) botao.disabled = true;
        try { await fn(); } catch (e) { console.error(e); UI.toast(e.message || 'Não foi possível gerar o relatório.', 'erro'); } finally { if (botao) botao.disabled = false; }
      };
    };
    const ver = h('button.btn', { type: 'button', title: 'Visualizar o relatório' }, o.rotulo || '👁 Relatório');
    ver.onclick = tratar(function () { App.Visualizar.abrir(gerar, { titulo: titulo() }); }, null);
    const imp = h('button.btn', { type: 'button', title: 'Imprimir o relatório' }, '🖨');
    imp.onclick = tratar(function () { return App.Visualizar.imprimir(gerar); }, imp);
    const bpdf = h('button.btn', { type: 'button', title: 'Baixar o relatório em PDF' }, '⬇ PDF');
    bpdf.onclick = tratar(async function () { const g = await gerar(); U.download(g.blob, g.nome); }, bpdf);
    const lista = [ver, imp, bpdf];
    if (!o.semPlanilha) {
      const bcsv = h('button.btn', { type: 'button', title: 'Baixar a planilha (CSV)' }, '⬇ Planilha');
      bcsv.onclick = tratar(function () { const c = o.planilha ? o.planilha() : csv(tipo, typeof opcoes === 'function' ? opcoes() : opcoes); U.download(new Blob([c.texto], { type: 'text/csv;charset=utf-8' }), c.nome); }, null);
      lista.push(bcsv);
    }
    return h('div.botoes-relatorio', { role: 'group', 'aria-label': 'Relatório' }, lista);
  }

  App.RelFin = { RELATORIOS: RELATORIOS, AGRUPAR: AGRUPAR, estrutura: estrutura, montar: montar, pdf: pdf, csv: csv, botoes: botoes, graficoColunas: graficoColunas, graficoBarras: graficoBarras };
})(window.App);
