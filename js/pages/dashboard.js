/*
 * Dashboard — tela principal do CRM Solar, no estilo de um relatório Power BI: faixa com o título e as ações, abas (Visão geral,
 * Comercial, Obras e OS, Financeiro), segmentações (período, vendedor, tipo de sistema, cidade) que valem para o painel inteiro,
 * cartões de indicadores com a variação e a mini linha de 12 meses, gráficos (vendas por mês com a média, funil, mix por tipo,
 * cidades, vendedores, situação das obras e OS), a matriz do resumo mensal (clicar num mês filtra o painel) e o que acompanhar
 * hoje. Gráficos em SVG desenhados na largura da tela, com dica ao passar o mouse (ou focar pelo teclado) e a mesma informação
 * em tabela.
 */
(function (App) {
  'use strict';

  const U = App.U, UI = App.UI, S = App.Store;
  const h = U.h;
  const SVGNS = 'http://www.w3.org/2000/svg';
  // cores dos gráficos (paleta validada: categóricas em ordem fixa, escala ordinal de um só azul, cinza de contexto)
  // paleta no estilo Power BI, validada (contraste e daltonismo): azul, laranja e violeta para os tipos; rampa ordinal azul no funil;
  // cores de status só para situação (com ícone e rótulo)
  const COR = {
    serie: '#118DFF', contexto: '#B8DAFF', funil: ['#86b6ef', '#5598e7', '#2a78d6', '#184f95'], recusada: '#b4b2a9',
    tipos: { ongrid: '#118DFF', hibrido: '#E66C37', offgrid: '#1AAB40', bess: '#744EC2' }, grade: '#ECEEF1', eixo: '#C9CED6', texto: '#1F2328', texto2: '#57606A', mudo: '#6B7280',
    trilha: '#cde2fb', critico: '#d03b3b', subiu: '#006300', bom: '#0ca30c', alerta: '#fab219', serio: '#ec835a', neutro: '#C9D1DA'
  };
  const CHAVE_PERIODO = 'crm.dash.periodo'; // preferência deste aparelho

  function svg(tag, attrs) {
    const el = document.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    return el;
  }

  function texto(x, y, conteudo, attrs) {
    const t = svg('text', Object.assign({ x: x, y: y, fill: COR.mudo, 'font-size': 11 }, attrs || {}));
    t.textContent = conteudo;
    return t;
  }

  /** Reais compactos para eixos e rótulos: R$ 950, R$ 12,7 mil, R$ 1,25 mi. */
  function compacto(v) {
    const a = Math.abs(v);
    if (a >= 1e6) return 'R$ ' + U.fmt(v / 1e6, a >= 1e7 ? 1 : 2) + ' mi';
    if (a >= 1e3) return 'R$ ' + U.fmt(v / 1e3, a >= 1e5 ? 0 : 1) + ' mil';
    return 'R$ ' + U.fmt(v, 0);
  }

  function passoBonito(max, n) {
    const bruto = max / n, pot = Math.pow(10, Math.floor(Math.log10(bruto || 1)));
    const r = bruto / pot;
    return (r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10) * pot;
  }

  /** Barra com a ponta arredondada (4 px) e a base reta. horizontal: cresce da esquerda. */
  function barra(x, y, w, hh, cor, horizontal) {
    const r = Math.min(4, horizontal ? w / 2 : hh / 2, horizontal ? hh / 2 : w / 2);
    const d = horizontal
      ? 'M' + x + ',' + y + 'h' + (w - r) + 'a' + r + ',' + r + ' 0 0 1 ' + r + ',' + r + 'v' + (hh - 2 * r) + 'a' + r + ',' + r + ' 0 0 1 ' + (-r) + ',' + r + 'h' + (-(w - r)) + 'z'
      : 'M' + x + ',' + (y + hh) + 'v' + (-(hh - r)) + 'a' + r + ',' + r + ' 0 0 1 ' + r + ',' + (-r) + 'h' + (w - 2 * r) + 'a' + r + ',' + r + ' 0 0 1 ' + r + ',' + r + 'v' + (hh - r) + 'z';
    return svg('path', { d: d, fill: cor });
  }

  /* ------------------------------------------------------------ cartão de gráfico (dica + tabela) */

  /**
   * Cartão com título, subtítulo, legenda, alternância gráfico/tabela e dica flutuante.
   * desenhar(area, largura, dica) é chamado na largura atual (e de novo ao redimensionar); tabela() devolve a tabela equivalente.
   */
  function cartaoGrafico(o) {
    const area = h('div.dash-plot');
    const dica = h('div.dash-dica', { role: 'status', hidden: true });
    const corpo = h('div.dash-corpo', area, dica);
    const tab = h('div.dash-tabela', { hidden: true });
    let modoTabela = false;
    const alternar = h('button.btn.pequeno', { type: 'button', onclick: function () {
      modoTabela = !modoTabela;
      corpo.hidden = modoTabela; tab.hidden = !modoTabela;
      if (modoTabela && !tab.firstChild) tab.appendChild(o.tabela());
      alternar.textContent = modoTabela ? 'Ver gráfico' : 'Ver tabela';
    } }, 'Ver tabela');
    const rodape = o.rodape && !o.vazio ? (typeof o.rodape === 'string' ? h('p.dash-sub.bi-nota', o.rodape) : o.rodape) : null;
    const card = h('section.card.dash-card.bi-card',
      h('div.dash-card-topo', h('div', h('h3', o.titulo), o.sub ? h('p.dash-sub', o.sub) : null), o.vazio ? null : alternar),
      o.legenda || null, o.vazio ? h('p.dash-vazio', o.vazio) : corpo, rodape, tab);
    if (o.vazio) return card;
    const mostrar = {
      em: function (ev, linhas) {
        dica.textContent = '';
        linhas.forEach(function (l, i) { const el = h(i === 0 ? 'strong' : 'span'); el.textContent = l; dica.appendChild(el); });
        dica.hidden = false;
        const rc = corpo.getBoundingClientRect();
        let x, y;
        if (ev && ev.clientX != null && ev.type !== 'focus') { x = ev.clientX - rc.left; y = ev.clientY - rc.top; }
        else { const rt = ev.target.getBoundingClientRect(); x = rt.left - rc.left + rt.width / 2; y = rt.top - rc.top; }
        const w = dica.offsetWidth, hh = dica.offsetHeight;
        dica.style.left = Math.max(4, Math.min(rc.width - w - 4, x - w / 2)) + 'px';
        dica.style.top = Math.max(4, y - hh - 12) + 'px';
      },
      esconder: function () { dica.hidden = true; }
    };
    let ultimaLargura = 0;
    const redesenhar = function () {
      const w = Math.round(area.clientWidth);
      if (!w || w === ultimaLargura) return;
      ultimaLargura = w;
      area.textContent = '';
      o.desenhar(area, w, mostrar);
    };
    requestAnimationFrame(redesenhar);
    if (window.ResizeObserver) new ResizeObserver(redesenhar).observe(area);
    return card;
  }

  /** Liga a dica a um alvo (ponteiro e teclado). */
  function alvo(el, linhas, mostrar, rotulo) {
    el.setAttribute('tabindex', '0');
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', rotulo || linhas.join(' — '));
    el.addEventListener('pointermove', function (ev) { mostrar.em(ev, linhas); });
    el.addEventListener('focus', function (ev) { mostrar.em(ev, linhas); });
    el.addEventListener('pointerleave', mostrar.esconder);
    el.addEventListener('blur', mostrar.esconder);
  }

  function tabelaSimples(cols, linhas) {
    return h('div.tabela-rolagem', h('table.tabela.dash-tab', h('thead', h('tr', cols.map(function (c, i) { return h('th' + (i ? '.num' : ''), c); }))),
      h('tbody', linhas.map(function (l) { return h('tr', l.map(function (v, i) { return h('td' + (i ? '.num' : ''), String(v)); })); }))));
  }

  function legenda(itens) {
    return h('div.dash-legenda', itens.map(function (it) { return h('span', h('i', { style: { background: it[1] } }), it[0]); }));
  }


  /* ------------------------------------------------------------ gráficos (estilo Power BI) */

  /** Colunas das vendas por mês: o período selecionado em destaque, os demais meses em azul claro, a linha da média de 12 meses. */
  function vendasPorMes(dados) {
    const meses = dados.porMes;
    const total = meses.reduce(function (s, m) { return s + m.valor; }, 0), media = total / meses.length;
    return cartaoGrafico({
      titulo: 'Vendas por mês', sub: 'Valor aprovado · últimos 12 meses · em destaque, o período selecionado',
      legenda: legenda([['No período selecionado', COR.serie], ['Demais meses', COR.contexto], ['Média de 12 meses (tracejado)', COR.texto2]]),
      vazio: total ? null : 'Nenhuma venda nos últimos 12 meses. Ao marcar uma proposta como Aprovada, ela entra aqui.',
      tabela: function () { return tabelaSimples(['Mês', 'Vendido', 'Vendas', 'kWp'], meses.map(function (m) { return [m.rot, U.brl(m.valor), m.n, U.kwp(m.kwp)]; })); },
      desenhar: function (area, W, mostrar) {
        const H = W < 560 ? 220 : 250, m = { l: 64, r: 10, t: 26, b: 28 };
        const pw = W - m.l - m.r, ph = H - m.t - m.b;
        const max = Math.max.apply(null, meses.map(function (x) { return x.valor; }).concat([1]));
        const passo = passoBonito(max, 4), topo = Math.ceil(max / passo) * passo;
        const y = function (v) { return m.t + ph - v / topo * ph; };
        const s = svg('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, 'font-family': 'inherit' });
        for (let v = 0; v <= topo + 1e-6; v += passo) {
          s.appendChild(svg('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), stroke: v === 0 ? COR.eixo : COR.grade, 'stroke-width': 1 }));
          s.appendChild(texto(m.l - 8, y(v) + 4, compacto(v), { 'text-anchor': 'end', 'font-variant-numeric': 'tabular-nums' }));
        }
        const banda = pw / meses.length, bw = Math.min(30, banda * 0.64);
        const iMax = meses.reduce(function (a, x, i) { return x.valor > meses[a].valor ? i : a; }, 0);
        const iUlt = meses.length - 1;
        const cadaRotulo = banda < 30 ? 3 : (banda < 50 ? 2 : 1);
        meses.forEach(function (mm, i) {
          const cx = m.l + banda * i + banda / 2;
          if (mm.valor > 0) s.appendChild(barra(cx - bw / 2, y(mm.valor), bw, y(0) - y(mm.valor), mm.noPeriodo ? COR.serie : COR.contexto));
          if ((i === iMax || i === iUlt) && mm.valor > 0) {
            const fim = i === iUlt && banda < 70;
            s.appendChild(texto(fim ? cx + bw / 2 : cx, y(mm.valor) - 6, compacto(mm.valor), { 'text-anchor': fim ? 'end' : 'middle', fill: COR.texto, 'font-weight': 600 }));
          }
          if ((iUlt - i) % cadaRotulo === 0) s.appendChild(texto(cx, H - 8, mm.rot, { 'text-anchor': 'middle' }));
        });
        if (media > 0) {
          s.appendChild(svg('line', { x1: m.l, x2: W - m.r, y1: y(media), y2: y(media), stroke: COR.texto2, 'stroke-width': 1.2, 'stroke-dasharray': '5 4' }));
          s.appendChild(texto(m.l + 4, y(media) - 5, 'média ' + compacto(media), { fill: COR.texto2, 'font-size': 10.5 }));
        }
        meses.forEach(function (mm, i) {
          const hit = svg('rect', { x: m.l + banda * i, y: m.t, width: banda, height: ph, fill: 'transparent', class: 'dash-hit' });
          alvo(hit, [U.brl(mm.valor), mm.rot + ' · ' + mm.n + (mm.n === 1 ? ' venda' : ' vendas') + (mm.kwp ? ' · ' + U.kwp(mm.kwp) + ' kWp' : '')], mostrar);
          s.appendChild(hit);
        });
        area.appendChild(s);
      }
    });
  }

  /** Funil acumulado das propostas emitidas no período (rampa de um só azul, da emissão à aprovação) e o % que passa de etapa. */
  function funil(dados) {
    const et = dados.funilAcum, rec = dados.funilRecusadas;
    return cartaoGrafico({
      titulo: 'Funil de vendas', sub: 'Propostas emitidas no período: quantas chegaram a cada etapa',
      vazio: et[0].n ? null : 'Nenhuma proposta emitida no período.',
      rodape: rec.n ? rec.n + (rec.n === 1 ? ' recusada' : ' recusadas') + ' no período (' + compacto(rec.valor) + ')' + (dados.decididas ? ' · conversão ' + dados.nVendas + ' de ' + dados.decididas + ' decididas' : '') : null,
      tabela: function () { return tabelaSimples(['Etapa', 'Propostas', 'Valor', 'Passam'], et.map(function (e, i) { return [e.label, e.n, U.brl(e.valor), i && et[i - 1].n ? U.fmt(e.n / et[i - 1].n * 100, 0) + '%' : '—']; })); },
      desenhar: function (area, W, mostrar) {
        const rot = W < 420 ? 92 : 112, alt = 34, gap = 20, H = et.length * (alt + gap) + 2;
        const larg = W - rot - 6, cx = rot + larg / 2, max = Math.max(1, et[0].n);
        const s = svg('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, 'font-family': 'inherit' });
        et.forEach(function (e, i) {
          const y0 = 14 + i * (alt + gap), w = e.n ? Math.max(36, e.n / max * larg) : 0;
          s.appendChild(texto(0, y0 + alt / 2 + 4, e.label, { fill: COR.texto, 'font-size': 12, 'font-weight': 600 }));
          if (w) s.appendChild(svg('rect', { x: cx - w / 2, y: y0, width: w, height: alt, rx: 4, fill: COR.funil[i] }));
          const r = e.n + (e.valor ? ' · ' + compacto(e.valor) : ''), cabe = w > r.length * 7 + 16;
          s.appendChild(texto(cabe ? cx : cx + w / 2 + 8, y0 + alt / 2 + 4, r, { 'text-anchor': cabe ? 'middle' : 'start', 'font-size': 12, 'font-weight': 600, fill: !cabe ? COR.texto : (i >= 2 ? '#ffffff' : '#0d366b') }));
          if (i) s.appendChild(texto(cx, y0 - 5, '↓ ' + (et[i - 1].n ? U.fmt(e.n / et[i - 1].n * 100, 0) : 0) + '% passam', { 'text-anchor': 'middle', 'font-size': 10.5 }));
          const hit = svg('rect', { x: 0, y: y0 - 4, width: W, height: alt + 8, fill: 'transparent', class: 'dash-hit' });
          alvo(hit, [e.n + (e.n === 1 ? ' proposta' : ' propostas'), e.label + (e.valor ? ' · ' + U.brl(e.valor) : '')], mostrar);
          s.appendChild(hit);
        });
        area.appendChild(s);
      }
    });
  }

  /** Mix por tipo de sistema nos últimos 12 meses: barra segmentada (parte do todo) e a lista com valor e participação. */
  function porTipo(dados) {
    // BESS (descontinuado) só aparece quando há vendas antigas dele
    const tipos = dados.porTipo12.filter(function (t) { return t.id !== 'bess' || t.valor > 0; }), total = tipos.reduce(function (s, t) { return s + t.valor; }, 0);
    const pct = function (t) { return total ? U.fmt(t.valor / total * 100, 0) + '%' : '—'; };
    return cartaoGrafico({
      titulo: 'Mix por tipo de sistema', sub: 'Participação no valor vendido · últimos 12 meses',
      vazio: total ? null : 'Nenhuma venda nos últimos 12 meses.',
      rodape: total ? h('ul.bi-lista-leg', tipos.map(function (t) { return h('li', h('i', { style: { background: COR.tipos[t.id] } }), h('span', t.label), h('strong', (t.valor ? compacto(t.valor) : '—') + ' · ' + pct(t))); })) : null,
      tabela: function () { return tabelaSimples(['Tipo', 'Vendas', 'Valor', 'Participação'], tipos.map(function (t) { return [t.label, t.n, U.brl(t.valor), pct(t)]; })); },
      desenhar: function (area, W, mostrar) {
        const vis = tipos.filter(function (t) { return t.valor > 0; }), H = 50, hh = 40, gap = 2, livre = W - gap * (vis.length - 1);
        const s = svg('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, 'font-family': 'inherit' });
        let x = 0;
        vis.forEach(function (t) {
          const w = t.valor / total * livre;
          s.appendChild(svg('rect', { x: x, y: 4, width: w, height: hh, rx: 4, fill: COR.tipos[t.id] }));
          if (w > 44) s.appendChild(texto(x + w / 2, 4 + hh / 2 + 5, pct(t), { 'text-anchor': 'middle', fill: '#ffffff', 'font-weight': 700, 'font-size': 13 }));
          const hit = svg('rect', { x: x, y: 0, width: Math.max(w, 6), height: H, fill: 'transparent', class: 'dash-hit' });
          alvo(hit, [U.brl(t.valor), t.label + ' · ' + t.n + (t.n === 1 ? ' venda' : ' vendas') + ' · ' + pct(t)], mostrar);
          s.appendChild(hit);
          x += w + gap;
        });
        area.appendChild(s);
      }
    });
  }

  /** Barras horizontais ordenadas (uma série, uma cor): cidades ou vendedores. */
  function ranking(titulo, sub, itens, vazio, rotuloCol) {
    const total = itens.reduce(function (s, t) { return s + t.valor; }, 0);
    return cartaoGrafico({
      titulo: titulo, sub: sub, vazio: total ? null : vazio,
      tabela: function () { return tabelaSimples([rotuloCol, 'Vendas', 'Valor'], itens.map(function (t) { return [t.label, t.n, U.brl(t.valor)]; })); },
      desenhar: function (area, W, mostrar) {
        const rot = Math.min(118, Math.max(70, W * 0.28)), val = 84, linha = 31, H = itens.length * linha + 6;
        const pw = Math.max(30, W - rot - val), max = Math.max.apply(null, itens.map(function (t) { return t.valor; }).concat([1]));
        const s = svg('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, 'font-family': 'inherit' });
        itens.forEach(function (t, i) {
          const y0 = 4 + i * linha, w = t.valor ? Math.max(4, t.valor / max * pw) : 0;
          const nome = t.label.length > 16 ? t.label.slice(0, 15) + '…' : t.label;
          s.appendChild(texto(rot - 8, y0 + 15, nome, { 'text-anchor': 'end', fill: COR.texto, 'font-size': 12 }));
          if (w) s.appendChild(barra(rot, y0 + 3, w, 16, t.resto ? COR.contexto : COR.serie, true));
          s.appendChild(texto(rot + w + 6, y0 + 15, compacto(t.valor), { fill: COR.texto, 'font-size': 11.5, 'font-weight': 600 }));
          const hit = svg('rect', { x: 0, y: y0, width: W, height: linha, fill: 'transparent', class: 'dash-hit' });
          alvo(hit, [U.brl(t.valor), t.label + ' · ' + t.n + (t.n === 1 ? ' venda' : ' vendas')], mostrar);
          s.appendChild(hit);
        });
        area.appendChild(s);
      }
    });
  }

  /** Situação das obras e das ordens de serviço: barras de situação com ícone e rótulo (cores de status). */
  function situacao(dados) {
    const ob = dados.obras, os = dados.os;
    const grupo = function (titulo, partes, link) {
      const tot = partes.reduce(function (s, p) { return s + p[1]; }, 0);
      return h('div.bi-sit',
        h('div.bi-sit-topo', h('a', { href: link }, titulo), h('strong', String(tot))),
        tot ? h('div.bi-sit-barra', partes.filter(function (p) { return p[1]; }).map(function (p) { return h('i', { style: { flex: String(p[1]), background: p[2] }, title: p[0] + ': ' + p[1] }); })) : h('div.bi-sit-barra.vazia'),
        h('div.dash-legenda', partes.map(function (p) { return h('span', h('i', { style: { background: p[2] } }), p[0] + ' ', h('b', String(p[1]))); })));
    };
    return h('section.card.dash-card.bi-card',
      h('div.dash-card-topo', h('div', h('h3', 'Obras e ordens de serviço'), h('p.dash-sub', 'Situação agora'))),
      ob ? grupo('Obras', [['✓ Em dia', ob.emDia, COR.bom], ['⏳ Etapa atrasada', ob.atrasadas, COR.alerta], ['○ A iniciar', ob.iniciar, COR.neutro]], '#/instalacoes') : null,
      os ? grupo('Ordens de serviço', [['✓ No prazo', Math.max(0, os.abertas - os.atrasadas - os.urgentesNoPrazo), COR.bom], ['⚠ Atrasada', os.atrasadas, COR.critico], ['! Urgente', os.urgentesNoPrazo, COR.serio]], '#/ordens') : null);
  }

  /** Matriz do resumo mensal (12 meses, o mais recente primeiro) com barras de dados; clicar num mês filtra o painel por ele. */
  function matriz(dados, aoEscolher, mesAtivo) {
    const meses = dados.porMes.slice().reverse(), max = Math.max.apply(null, meses.map(function (m) { return m.valor; }).concat([1]));
    const chip = function (c) {
      if (c == null) return h('span.mini', '—');
      const p = Math.round(c * 100);
      return h('span.bi-chip.' + (p >= 65 ? 'bom' : p >= 50 ? 'alerta' : 'critico'), (p >= 65 ? '▲ ' : p >= 50 ? '● ' : '▼ ') + p + '%');
    };
    const tot = meses.reduce(function (a, m) { a.e += m.emitidas; a.n += m.n; a.v += m.valor; a.k += m.kwp; a.r += m.recusas; return a; }, { e: 0, n: 0, v: 0, k: 0, r: 0 });
    return h('section.card.dash-card.bi-card',
      h('div.dash-card-topo', h('div', h('h3', 'Resumo mensal'), h('p.dash-sub', 'Barras de dados no valor vendido · toque num mês para filtrar o painel por ele'))),
      h('div.tabela-rolagem.bi-matriz', h('table.tabela.dash-tab',
        h('thead', h('tr', h('th', 'Mês'), h('th.num', 'Emitidas'), h('th.num', 'Vendas'), h('th', 'Vendido'), h('th.num', 'kWp'), h('th.num', 'Conversão'))),
        h('tbody', meses.map(function (m) {
          return h('tr' + (mesAtivo === m.mes ? '.ativo' : ''), { tabindex: '0', role: 'button', 'aria-label': 'Filtrar o painel por ' + m.rot, onclick: function () { aoEscolher(m.mes); },
            onkeydown: function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); aoEscolher(m.mes); } } },
            h('td', m.rot), h('td.num', String(m.emitidas)), h('td.num', String(m.n)),
            h('td.bi-db', h('b', { style: { width: (m.valor / max * 100).toFixed(1) + '%' } }), h('span', U.brl(m.valor))),
            h('td.num', m.kwp ? U.kwp(m.kwp) : '—'), h('td.num', chip(m.conversao)));
        }).concat([h('tr.total', h('td', 'Total'), h('td.num', String(tot.e)), h('td.num', String(tot.n)), h('td', U.brl(tot.v)), h('td.num', U.kwp(tot.k)),
          h('td.num', tot.n + tot.r ? U.fmt(tot.n / (tot.n + tot.r) * 100, 0) + '%' : '—'))])))));
  }

  /** Para acompanhar hoje: propostas vencendo ou paradas, ordens de serviço atrasadas/urgentes e obras com etapa atrasada. */
  function hojeLista(dados, irAba) {
    const I = App.Instalacao, O = App.Ordem, hoje = U.todayISO(), itens = [];
    dados.acompanhar.slice(0, 4).forEach(function (x) {
      const cls = x.peso === 0 ? 'critico' : (x.peso === 1 ? 'alerta' : 'neutro'), ic = x.peso === 0 ? '⚠ ' : (x.peso === 1 ? '⏳ ' : '💤 ');
      itens.push(h('li', { onclick: function () { UI.ir('#/proposta/' + x.p.id); } }, h('div', h('strong', x.p.numero), ' · ' + (x.p.clienteNome || '—'), h('br'), h('small', x.valor ? U.brl(x.valor) : '')), h('span.bi-chip.' + cls, ic + x.motivo)));
    });
    (dados.os ? dados.os.agenda : []).filter(function (o) { return O.atrasada(o, hoje) || o.prioridade === 'urgente'; }).slice(0, 2).forEach(function (o) {
      itens.push(h('li', { onclick: function () { UI.ir('#/ordem/' + o.id); } }, h('div', h('strong', o.numero), ' · ' + (o.clienteNome || '—'), h('br'), h('small', O.rotulo(O.TIPOS, o.tipo))),
        h('span.bi-chip.critico', O.atrasada(o, hoje) ? '⚠ Atrasada' : '! Urgente')));
    });
    (dados.obras ? dados.obras.andamento : []).filter(function (x) { return I.atrasadas(x, hoje).length; }).slice(0, 2).forEach(function (x) {
      const n = I.atrasadas(x, hoje).length, pr = I.progresso(x);
      itens.push(h('li', { onclick: function () { UI.ir('#/instalacao/' + x.id); } }, h('div', h('strong', 'Obra — ' + (x.clienteNome || x.titulo || '')), h('br'), h('small', 'Etapa ' + pr.feitas + ' de ' + pr.total + ' · previsão ' + (U.dataBR(I.previsaoConclusao(x)) || '—'))),
        h('span.bi-chip.alerta', '⏳ ' + (n === 1 ? '1 etapa atrasada' : n + ' etapas atrasadas'))));
    });
    return h('section.card.dash-card.bi-card',
      h('div.dash-card-topo', h('div', h('h3', 'Para acompanhar hoje'), h('p.dash-sub', 'Propostas vencendo ou paradas, serviços atrasados e obras com etapa atrasada')),
        h('button.btn.pequeno', { type: 'button', onclick: function () { irAba('comercial'); } }, 'Ver todas')),
      itens.length ? h('ul.bi-alertas', itens) : h('p.dash-vazio', '✅ Nada pendente para hoje.'));
  }

  /* ------------------------------------------------------------ indicadores, obras, agenda */

  function tile(rot, valor, sub, href) {
    const conteudo = [h('span.dash-tile-rot', rot), h('strong.dash-tile-valor', valor), sub ? h('small.dash-tile-sub', sub) : null];
    return href ? h('a.card.dash-tile', { href: href }, conteudo) : h('div.card.dash-tile', conteudo);
  }

  function variacao(atual, anterior) {
    if (anterior == null) return null;
    if (!anterior) return atual ? h('span.dash-delta', 'sem vendas no período anterior') : null;
    const pct = (atual - anterior) / anterior * 100;
    const sobe = pct >= 0;
    return h('span.dash-delta' + (sobe ? '.sobe' : '.desce'), (sobe ? '▲ +' : '▼ ') + U.fmt(pct, 0) + '% vs período anterior');
  }

  function obras(dados) {
    const I = App.Instalacao;
    const lista = (dados.obras ? dados.obras.andamento : []).slice().sort(function (a, b) { return String(I.previsaoConclusao(a) || '9').localeCompare(String(I.previsaoConclusao(b) || '9')); }).slice(0, 6);
    const hoje = U.todayISO();
    return h('section.card.dash-card.bi-card',
      h('div.dash-card-topo', h('div', h('h3', 'Obras em andamento'), h('p.dash-sub', 'Progresso das etapas e previsão de conclusão')), h('a.btn.pequeno', { href: '#/instalacoes' }, 'Ver instalações')),
      lista.length ? h('ul.dash-obras', lista.map(function (x) {
        const pr = I.progresso(x), atraso = I.atrasadas(x, hoje).length;
        return h('li', h('a', { href: '#/instalacao/' + x.id }, x.titulo || x.clienteNome || 'Instalação'),
          h('div.dash-medidor', { role: 'meter', 'aria-valuenow': Math.round(pr.pct * 100), 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': 'Progresso da obra' },
            h('span', { style: { width: Math.round(pr.pct * 100) + '%' } })),
          h('small', pr.feitas + ' de ' + pr.total + ' etapas · previsão ' + (U.dataBR(I.previsaoConclusao(x)) || '—')),
          atraso ? h('span.dash-status.critico', '⚠ ' + (atraso === 1 ? '1 etapa atrasada' : atraso + ' etapas atrasadas')) : null);
      })) : h('p.dash-vazio', 'Nenhuma obra em andamento.'));
  }

  function acompanhar(dados) {
    const lista = dados.acompanhar.slice(0, 8);
    const icone = function (x) { return x.peso === 0 ? ['⚠', 'critico'] : (x.peso === 1 ? ['⏳', 'aviso'] : ['💤', 'parado']); };
    return h('section.card.dash-card.bi-card',
      h('div.dash-card-topo', h('div', h('h3', 'Propostas para acompanhar'), h('p.dash-sub', 'Enviadas ou em negociação: validade vencida, vencendo em até 3 dias ou sem movimento há 7 dias'))),
      lista.length ? h('div.tabela-rolagem', h('table.tabela.dash-tab', h('thead', h('tr', h('th', 'Proposta'), h('th', 'Motivo'), h('th.num', 'Valor'))),
        h('tbody', lista.map(function (x) {
          const ic = icone(x);
          return h('tr', { onclick: function () { UI.ir('#/proposta/' + x.p.id); } },
            h('td', h('strong', x.p.numero), h('div.mini', x.p.clienteNome || '—')),
            h('td', h('span.dash-status.' + ic[1], ic[0] + ' ' + x.motivo)),
            h('td.num', x.valor ? U.brl(x.valor) : '—'));
        })))) : h('p.dash-vazio', '✅ Nenhuma proposta precisando de retorno agora.'));
  }

  function agendaOS(dados) {
    const O = App.Ordem;
    const lista = dados.os ? dados.os.agenda.slice(0, 8) : [];
    const hoje = U.todayISO();
    return h('section.card.dash-card.bi-card',
      h('div.dash-card-topo', h('div', h('h3', 'Agenda de ordens de serviço'), h('p.dash-sub', 'Atrasadas, urgentes e agendadas para os próximos 7 dias')), h('a.btn.pequeno', { href: '#/ordens' }, 'Ver ordens')),
      lista.length ? h('div.tabela-rolagem', h('table.tabela.dash-tab', h('thead', h('tr', h('th', 'OS'), h('th', 'Tipo'), h('th', 'Agendada'))),
        h('tbody', lista.map(function (o) {
          const atrasada = O.atrasada(o, hoje);
          return h('tr', { onclick: function () { UI.ir('#/ordem/' + o.id); } },
            h('td', h('strong', o.numero), h('div.mini', o.clienteNome || '—')),
            h('td', O.rotulo(O.TIPOS, o.tipo), o.prioridade === 'urgente' ? h('div', h('span.dash-status.critico', '⚠ Urgente')) : null),
            h('td', U.dataBR(o.agendadaPara) || 'sem data', atrasada ? h('div', h('span.dash-status.critico', '⚠ Atrasada')) : null));
        })))) : h('p.dash-vazio', '✅ Nenhuma ordem de serviço pendente para os próximos dias.'));
  }


  /* ------------------------------------------------------------ tela (painel no estilo Power BI) */

  const CHAVE_ABA = 'crm.dash.aba', CHAVE_FILTROS = 'crm.dash.filtros';
  const ABAS = [{ id: 'geral', label: 'Visão geral' }, { id: 'comercial', label: 'Comercial' }, { id: 'obras', label: 'Obras e OS' }, { id: 'financeiro', label: 'Financeiro' }];
  function ler(k, padrao) { try { return localStorage.getItem(k) || padrao; } catch (e) { return padrao; } }
  function gravar(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sem armazenamento: só nesta visita */ } }
  function lerPeriodo() { return ler(CHAVE_PERIODO, 'mes'); }
  function gravarPeriodo(v) { gravar(CHAVE_PERIODO, v); }

  /** Variação contra o período anterior: {txt, cls} ou null. */
  function delta(atual, anterior, ehContagem) {
    if (anterior == null) return null;
    if (!anterior) return atual ? { txt: 'sem movimento no período anterior', cls: '' } : null;
    if (ehContagem) { const d = atual - anterior; return { txt: (d >= 0 ? '▲ ' : '▼ ') + Math.abs(d) + ' vs período anterior', cls: d >= 0 ? 'sobe' : 'desce' }; }
    const pct = (atual - anterior) / anterior * 100;
    return { txt: (pct >= 0 ? '▲ ' : '▼ ') + U.fmt(Math.abs(pct), 0) + '% vs período anterior', cls: pct >= 0 ? 'sobe' : 'desce' };
  }

  /** Reais na forma curta dos cartões (como no Power BI): R$ 950,00 · R$ 101,1 mil · R$ 1,25 mi. */
  function curto(v) {
    const a = Math.abs(v);
    if (a >= 1e6) return 'R$ ' + U.fmt(v / 1e6, 2) + ' mi';
    if (a >= 1e4) return 'R$ ' + U.fmt(v / 1e3, 1) + ' mil';
    return U.brl(v);
  }

  /** Cartão de indicador: rótulo, número grande, variação, referência, mini linha (12 meses) ou medidor. */
  function kpi(o) {
    const corpo = [h('span.bi-kpi-rot', o.rot), h('strong.bi-kpi-val' + (o.principal ? '.dash-hero-valor' : ''), { title: o.titulo || '' }, o.val),
      o.delta ? h('span.bi-kpi-delta.' + (o.delta.cls || 'neutro'), o.delta.txt) : null, o.ref ? h('span.bi-kpi-ref', o.ref) : null];
    if (o.spark && o.spark.some(function (v) { return v > 0; })) {
      const W = 180, H = 30, mx = Math.max.apply(null, o.spark);
      const pts = o.spark.map(function (v, i) { return [(i * (W - 4) / (o.spark.length - 1) + 2).toFixed(1), (H - 3 - v / mx * (H - 7)).toFixed(1)]; });
      const s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', height: H, 'aria-hidden': 'true', preserveAspectRatio: 'none', class: 'bi-spark' });
      s.appendChild(svg('path', { d: 'M' + pts.map(function (p) { return p.join(','); }).join(' L') + ' L' + (W - 2) + ',' + H + ' L2,' + H + ' Z', fill: COR.serie, 'fill-opacity': 0.12 }));
      s.appendChild(svg('path', { d: 'M' + pts.map(function (p) { return p.join(','); }).join(' L'), fill: 'none', stroke: COR.serie, 'stroke-width': 2, 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke' }));
      corpo.push(s);
    }
    if (o.medidor != null) corpo.push(h('div.bi-medidor', { role: 'meter', 'aria-valuenow': Math.round(o.medidor * 100), 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': o.rot }, h('i', { style: { width: Math.round(o.medidor * 100) + '%' } })));
    return o.href ? h('a.card.bi-kpi.dash-tile', { href: o.href }, corpo) : h('div.card.bi-kpi.dash-tile', corpo);
  }

  UI.rota('/painel', function (cont) {
    const emp = S.config().empresa;
    let periodo = lerPeriodo(), aba = ler(CHAVE_ABA, 'geral'), filtros = {};
    try { filtros = JSON.parse(ler(CHAVE_FILTROS, '{}')) || {}; } catch (e) { filtros = {}; }
    if (!/^m:\d{4}-\d{2}$/.test(periodo) && !App.Crm.PERIODOS.some(function (p) { return p.id === periodo; })) periodo = 'mes';
    if (!ABAS.some(function (a) { return a.id === aba; })) aba = 'geral';
    const podeFin = !App.Acesso || App.Acesso.podeLer('lancamentos');

    // cidade de cada proposta: a do cadastro do cliente
    const clientes = {};
    S.list('clientes').forEach(function (c) { clientes[c.id] = c; });
    const cidadeDe = function (p) { const c = clientes[p.clienteId]; return String((c && c.cidade) || p.cidadeCliente || '').trim() || 'Sem cidade'; };

    // ---------- faixa do relatório: logo, título, ações e abas
    const agora = new Date();
    const abasEl = h('nav.bi-abas', { role: 'tablist', 'aria-label': 'Páginas do painel' }, ABAS.map(function (a) {
      return h('button.bi-aba', { type: 'button', role: 'tab', 'data-aba': a.id, 'aria-selected': a.id === aba ? 'true' : 'false', onclick: function () { aba = a.id; gravar(CHAVE_ABA, aba); desenhar(); } }, a.label);
    }));
    cont.appendChild(h('header.bi-topo',
      h('div.bi-topo-linha',
        h('img.bi-logo', { src: emp.logo || App.LOGO_PADRAO, alt: '' }),
        h('div.bi-titulo', h('h1', 'Dashboard'), h('p', 'Painel comercial e de obras · ' + (emp.razao || 'CRM Solar') + ' · atualizado às ' + String(agora.getHours()).padStart(2, '0') + ':' + String(agora.getMinutes()).padStart(2, '0'))),
        h('div.bi-acoes',
          h('a.btn.bi-btn', { href: '#/avulsa/nova' }, '+ Serviços'),
          h('a.btn.bi-btn', { href: '#/proposta/nova?tipo=hibrido' }, '+ Híbrida'),
          h('a.btn.bi-btn', { href: '#/proposta/nova?tipo=offgrid' }, '+ Off-Grid'),
          h('a.btn.bi-btn.primario', { href: '#/proposta/nova' }, '+ Nova proposta On-Grid'))),
      abasEl));

    // avisos de configuração e do dia a dia
    const props0 = S.list('propostas');
    const avisos = [];
    const semInstalacao = App.aprovadasSemInstalacao ? App.aprovadasSemInstalacao() : [];
    if (semInstalacao.length) avisos.push(h('li', semInstalacao.length === 1 ? '1 proposta aprovada ainda sem instalação. ' : semInstalacao.length + ' propostas aprovadas ainda sem instalação. ', h('a', { href: '#/instalacoes' }, 'Iniciar em Instalações'), '.'));
    const semPreco = S.list('equipamentos').filter(function (e) { return e.ativo !== false && ['modulo', 'inversor', 'hibrido', 'bateria'].indexOf(e.tipo) >= 0 && !(U.num(e.preco) > 0); }).length;
    if (semPreco) avisos.push(h('li', semPreco + ' equipamento(s) principal(is) sem preço. ', h('a', { href: '#/equipamentos' }, 'Cadastrar preços'), ' para o kit ser somado automaticamente.'));
    if (props0.length && !(App.Nuvem && App.Nuvem.usuario)) avisos.push(h('li', 'Os dados ficam neste navegador — ', h('a', { href: '#/dados' }, 'faça backup'), ' ou ligue a ', h('a', { href: '#/nuvem' }, 'sincronização'), '.'));
    if (!S.list('clientes').length) avisos.push(h('li', 'Comece cadastrando um ', h('a', { href: '#/clientes' }, 'cliente'), ' ou crie a proposta e cadastre o cliente por lá.'));
    if (avisos.length) cont.appendChild(h('div.card.dica.bi-avisos', h('ul', avisos)));

    // ---------- segmentações (valem para o painel inteiro)
    const opcoes = function (lista, todos) { return [{ v: '', t: todos }].concat(lista.map(function (x) { return { v: x, t: x }; })); };
    const unicos = function (fn) { const m = {}; props0.forEach(function (p) { const v = fn(p); if (v) m[v] = 1; }); return Object.keys(m).sort(function (a, b) { return a.localeCompare(b); }); };
    const sel = function (k, rot, lista) {
      const s = h('select.bi-select', { 'aria-label': rot, 'data-filtro': k, onchange: function () { filtros[k] = s.value; gravar(CHAVE_FILTROS, JSON.stringify(filtros)); desenhar(); } },
        lista.map(function (o) { return h('option', { value: o.v }, o.t); }));
      s.value = filtros[k] || '';
      if (s.value !== (filtros[k] || '')) { filtros[k] = ''; s.value = ''; }
      return h('label.bi-slicer', h('span', rot), s);
    };
    const botoesPeriodo = h('div.bi-seg', App.Crm.PERIODOS.map(function (p) {
      return h('button.dash-periodo', { type: 'button', 'data-periodo': p.id, onclick: function () { periodo = p.id; gravarPeriodo(p.id); desenhar(); } }, p.label);
    }));
    const chipMes = h('button.bi-chip-mes', { type: 'button', hidden: true, onclick: function () { periodo = 'mes'; gravarPeriodo(periodo); desenhar(); } });
    cont.appendChild(h('section.bi-slicers', { 'aria-label': 'Segmentações' },
      h('div.bi-slicer.bi-slicer-periodo', h('span', 'Período'), h('div.bi-seg-linha', botoesPeriodo, chipMes)),
      sel('vendedor', 'Vendedor', opcoes(unicos(App.Crm.vendedorDe), 'Todos')),
      sel('tipo', 'Tipo de sistema', [{ v: '', t: 'Todos' }].concat(App.Crm.TIPOS.filter(function (t) { return t.id !== 'bess' || S.list('propostas').some(function (p) { return p.tipoSistema === 'bess'; }); })
        .map(function (t) { return { v: t.id, t: t.label }; }))),
      sel('cidade', 'Cidade', opcoes(unicos(cidadeDe), 'Todas'))));

    const area = h('div.dash.bi');
    cont.appendChild(area);

    function desenhar() {
      abasEl.querySelectorAll('.bi-aba').forEach(function (b) { b.setAttribute('aria-selected', b.getAttribute('data-aba') === aba ? 'true' : 'false'); });
      botoesPeriodo.querySelectorAll('.dash-periodo').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-periodo') === periodo ? 'true' : 'false'); });
      const mesEscolhido = /^m:/.test(periodo) ? periodo.slice(2) : null;
      chipMes.hidden = !mesEscolhido;
      chipMes.textContent = mesEscolhido ? 'Mês: ' + App.Crm.rotuloMes(mesEscolhido) + ' ✕' : '';
      chipMes.setAttribute('aria-label', 'Tirar o filtro do mês');

      // propostas pelas segmentações; obras e OS pelas propostas delas (sem filtro, todas)
      const props = App.Crm.filtrar(props0, filtros, cidadeDe);
      const filtrando = filtros.vendedor || filtros.tipo || filtros.cidade;
      const idsProps = {};
      props.forEach(function (p) { idsProps[p.id] = 1; });
      const insts = S.list('instalacoes').filter(function (x) { return !filtrando || idsProps[x.propostaId]; });
      const idsInst = {};
      insts.forEach(function (x) { idsInst[x.id] = 1; });
      const ordens = S.list('ordens').filter(function (o) { return !filtrando || idsInst[o.instalacaoId]; });
      const d = App.Crm.indicadores({ propostas: props, instalacoes: insts, ordens: ordens, validadePadrao: emp.validadeDias, cidadeDe: cidadeDe }, periodo);
      const rotPeriodo = mesEscolhido ? App.Crm.rotuloMes(mesEscolhido) : String((App.Crm.PERIODOS.find(function (p) { return p.id === periodo; }) || {}).label || '').toLowerCase();
      area.textContent = '';
      const irAba = function (id) { aba = id; gravar(CHAVE_ABA, aba); desenhar(); window.scrollTo(0, 0); };
      const escolherMes = function (mes) { periodo = 'm:' + mes; gravarPeriodo(periodo); desenhar(); };

      const kpis = h('div.bi-kpis',
        kpi({ rot: 'Vendido — ' + rotPeriodo, val: curto(d.vendido), titulo: U.brl(d.vendido), principal: true, delta: delta(d.vendido, d.vendidoAnt), ref: d.nVendas + (d.nVendas === 1 ? ' venda' : ' vendas') + (d.kwpVendido ? ' · ' + U.kwp(d.kwpVendido) + ' kWp' : ''), spark: d.porMes.map(function (m) { return m.valor; }) }),
        kpi({ rot: 'Propostas emitidas', val: String(d.emitidas), delta: delta(d.emitidas, d.emitidasAnt, true), ref: d.valorEmitido ? curto(d.valorEmitido) + ' em propostas' : 'no período', href: '#/propostas' }),
        kpi({ rot: 'Taxa de conversão', val: d.conversao == null ? '—' : U.fmt(d.conversao * 100, 0) + '%', ref: d.decididas ? d.nVendas + ' de ' + d.decididas + ' decididas' : 'nenhuma decidida no período', medidor: d.conversao == null ? null : d.conversao }),
        kpi({ rot: 'Ticket médio', val: d.nVendas ? curto(d.ticket) : '—', titulo: d.nVendas ? U.brl(d.ticket) : '', delta: d.nVendas ? delta(d.ticket, d.ticketAnt) : null, ref: d.nVendas ? 'por venda no período' : 'sem vendas no período' }),
        kpi({ rot: 'Em aberto agora', val: curto(d.abertas.valor), titulo: U.brl(d.abertas.valor), ref: d.abertas.n + (d.abertas.n === 1 ? ' proposta' : ' propostas') + ' em rascunho, enviadas ou em negociação', href: '#/propostas' }),
        d.obras ? kpi({ rot: 'Obras em andamento', val: String(d.obras.andamento.length), ref: [d.obras.atrasadas ? d.obras.atrasadas + ' com etapa atrasada' : 'nenhuma atrasada', d.os ? d.os.abertas + ' OS abertas' : ''].filter(Boolean).join(' · '), href: '#/instalacoes' }) : null);

      if (aba === 'geral') {
        area.appendChild(kpis);
        area.appendChild(h('div.bi-linha.bi-l2', vendasPorMes(d), funil(d)));
        area.appendChild(h('div.bi-linha.bi-l3', porTipo(d), ranking('Vendas por cidade', 'Valor vendido · últimos 12 meses', d.porCidade12, 'Nenhuma venda nos últimos 12 meses.', 'Cidade'), situacao(d)));
        area.appendChild(h('div.bi-linha.bi-l4', matriz(d, escolherMes, mesEscolhido), hojeLista(d, irAba)));
      } else if (aba === 'comercial') {
        area.appendChild(kpis);
        area.appendChild(h('div.bi-linha.bi-l2', ranking('Vendas por vendedor', 'Valor vendido no período', d.porVendedor, 'Nenhuma venda no período.', 'Vendedor'), funil(d)));
        area.appendChild(h('div.bi-linha.bi-l2b', acompanhar(d), porTipo(d)));
        const recentes = props.slice().sort(function (a, b) { return String(b.atualizadoEm).localeCompare(String(a.atualizadoEm)); }).slice(0, 8);
        const box = h('section.card.sem-pad.bi-card', h('div.card-topo', h('h3', 'Propostas recentes'), h('a', { href: '#/propostas' }, 'Ver todas →')));
        if (!recentes.length) box.appendChild(h('div.vazio', h('p', 'Nenhuma proposta ainda.'), h('a.btn.primario', { href: '#/proposta/nova' }, 'Criar a primeira proposta')));
        else box.appendChild(App.tabelaPropostas(recentes, function () { UI.despachar(true); }));
        area.appendChild(box);
      } else if (aba === 'obras') {
        area.appendChild(h('div.bi-linha.bi-l2b', situacao(d), obras(d)));
        area.appendChild(agendaOS(d));
      } else {
        area.appendChild(financeiro());
      }
    }

    /** Aba Financeiro: os números do caixa e do resultado (perfil com acesso ao financeiro). */
    function financeiro() {
      if (!podeFin || !App.Fin) return h('section.card.dash-card', h('p.dash-vazio', 'O financeiro é do perfil administrador.'));
      const F = App.Fin, hoje = U.todayISO();
      const lancs = S.list('lancamentos'), contas = S.list('contasFin'), cats = S.list('categoriasFin');
      const r = F.resumo(lancs, contas, hoje);
      let resMes = null;
      try { const dr = F.dre(lancs, cats, hoje.slice(0, 4), 'competencia'); resMes = dr.linhas[dr.linhas.length - 1].valores[parseInt(hoje.slice(5, 7), 10) - 1]; } catch (e) { resMes = null; }
      return h('div',
        h('div.bi-kpis',
          kpi({ rot: 'Saldo em caixa e bancos', val: curto(r.saldo), titulo: U.brl(r.saldo), ref: contas.filter(function (c) { return c.ativo !== false; }).length + ' conta(s)', href: '#/financeiro/contas' }),
          kpi({ rot: 'A receber — 30 dias', val: curto(r.aReceber30), titulo: U.brl(r.aReceber30), ref: 'recebido no mês: ' + U.brl(r.recebidoMes), href: '#/financeiro/receber' }),
          kpi({ rot: 'A pagar — 30 dias', val: curto(r.aPagar30), titulo: U.brl(r.aPagar30), ref: 'pago no mês: ' + U.brl(r.pagoMes), href: '#/financeiro/pagar' }),
          kpi({ rot: 'Vencidos a receber', val: curto(r.vencRec.valor), titulo: U.brl(r.vencRec.valor), delta: r.vencRec.n ? { txt: '⚠ ' + r.vencRec.n + (r.vencRec.n === 1 ? ' lançamento' : ' lançamentos'), cls: 'desce' } : null, href: '#/financeiro/receber' }),
          kpi({ rot: 'Vencidos a pagar', val: curto(r.vencPag.valor), titulo: U.brl(r.vencPag.valor), delta: r.vencPag.n ? { txt: '⚠ ' + r.vencPag.n + (r.vencPag.n === 1 ? ' lançamento' : ' lançamentos'), cls: 'desce' } : null, href: '#/financeiro/pagar' }),
          kpi({ rot: 'Resultado do mês (DRE)', val: resMes == null ? '—' : curto(resMes), titulo: resMes == null ? '' : U.brl(resMes), ref: 'regime de competência', href: '#/financeiro/dre' })),
        h('section.card.dash-card.bi-card', h('div.dash-card-topo', h('div', h('h3', 'Fluxo de caixa, DRE e relatórios'), h('p.dash-sub', 'O financeiro completo, com o fluxo de caixa mês a mês, a DRE, o resultado por obra e as comissões.')),
          h('a.btn.primario', { href: '#/financeiro' }, 'Abrir o financeiro'))));
    }
    desenhar();
  });

  // componentes de gráfico reutilizados no financeiro (fluxo de caixa)
  App.Graficos = { COR: COR, kpi: kpi, svg: svg, texto: texto, compacto: compacto, passoBonito: passoBonito, barra: barra, cartaoGrafico: cartaoGrafico, alvo: alvo, tabelaSimples: tabelaSimples, legenda: legenda, tile: tile };
})(window.App);
