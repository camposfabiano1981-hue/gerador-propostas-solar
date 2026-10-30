/*
 * Dashboard — tela principal do CRM Solar: vendas do período, conversão, funil, vendas por mês e por tipo de sistema,
 * obras em andamento, ordens de serviço e as propostas para acompanhar. Gráficos em SVG desenhados na largura da tela,
 * com dica ao passar o mouse (ou focar pelo teclado) e a mesma informação em tabela.
 */
(function (App) {
  'use strict';

  const U = App.U, UI = App.UI, S = App.Store;
  const h = U.h;
  const SVGNS = 'http://www.w3.org/2000/svg';
  // cores dos gráficos (paleta validada: categóricas em ordem fixa, escala ordinal de um só azul, cinza de contexto)
  const COR = {
    serie: '#2a78d6', contexto: '#cbd5e1', funil: ['#86b6ef', '#5598e7', '#2a78d6', '#1c5cab'], recusada: '#b4b2a9',
    tipos: { ongrid: '#2a78d6', hibrido: '#eb6834', bess: '#1baf7a' }, grade: '#e8e8e3', eixo: '#c3c2b7', texto: '#0b0b0b', texto2: '#52514e', mudo: '#6b6a65',
    trilha: '#cde2fb', critico: '#d03b3b', subiu: '#006300'
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
    const card = h('section.card.dash-card',
      h('div.dash-card-topo', h('div', h('h3', o.titulo), o.sub ? h('p.dash-sub', o.sub) : null), o.vazio ? null : alternar),
      o.legenda || null, o.vazio ? h('p.dash-vazio', o.vazio) : corpo, tab);
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

  /* ------------------------------------------------------------ gráficos */

  /** Colunas das vendas por mês: os meses do período em azul, os demais em cinza (contexto). */
  function vendasPorMes(dados) {
    const meses = dados.porMes;
    const total = meses.reduce(function (s, m) { return s + m.valor; }, 0);
    return cartaoGrafico({
      titulo: 'Vendas por mês', sub: 'Últimos 12 meses, pela data de aprovação · em azul, os meses do período selecionado',
      legenda: legenda([['No período selecionado', COR.serie], ['Fora do período', COR.contexto]]),
      vazio: total ? null : 'Nenhuma venda nos últimos 12 meses. Ao marcar uma proposta como Aprovada, ela entra aqui.',
      tabela: function () { return tabelaSimples(['Mês', 'Vendido', 'Vendas', 'kWp'], meses.map(function (m) { return [m.rot, U.brl(m.valor), m.n, U.kwp(m.kwp)]; })); },
      desenhar: function (area, W, mostrar) {
        const H = 240, m = { l: 64, r: 10, t: 26, b: 28 };
        const pw = W - m.l - m.r, ph = H - m.t - m.b;
        const max = Math.max.apply(null, meses.map(function (x) { return x.valor; }).concat([1]));
        const passo = passoBonito(max, 4), topo = Math.ceil(max / passo) * passo;
        const y = function (v) { return m.t + ph - v / topo * ph; };
        const s = svg('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, 'font-family': 'inherit' });
        for (let v = 0; v <= topo + 1e-6; v += passo) {
          s.appendChild(svg('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), stroke: v === 0 ? COR.eixo : COR.grade, 'stroke-width': 1 }));
          s.appendChild(texto(m.l - 8, y(v) + 4, compacto(v), { 'text-anchor': 'end', 'font-variant-numeric': 'tabular-nums' }));
        }
        const banda = pw / meses.length, bw = Math.min(24, banda * 0.6);
        const iMax = meses.reduce(function (a, x, i) { return x.valor > meses[a].valor ? i : a; }, 0);
        const iUlt = meses.length - 1;
        const cadaRotulo = banda < 24 ? 3 : (banda < 46 ? 2 : 1); // rótulos "out/26" (~40 px) sem encavalar
        meses.forEach(function (mm, i) {
          const cx = m.l + banda * i + banda / 2;
          if (mm.valor > 0) s.appendChild(barra(cx - bw / 2, y(mm.valor), bw, y(0) - y(mm.valor), mm.noPeriodo ? COR.serie : COR.contexto));
          if ((i === iMax || i === iUlt) && mm.valor > 0) s.appendChild(texto(cx, y(mm.valor) - 6, compacto(mm.valor), { 'text-anchor': 'middle', fill: COR.texto2, 'font-weight': 600 }));
          if ((iUlt - i) % cadaRotulo === 0) s.appendChild(texto(cx, H - 8, mm.rot, { 'text-anchor': 'middle' }));
          const hit = svg('rect', { x: m.l + banda * i, y: m.t, width: banda, height: ph, fill: 'transparent', class: 'dash-hit' });
          alvo(hit, [U.brl(mm.valor), mm.rot + ' · ' + mm.n + (mm.n === 1 ? ' venda' : ' vendas') + (mm.kwp ? ' · ' + U.kwp(mm.kwp) + ' kWp' : '')], mostrar);
          s.appendChild(hit);
        });
        area.appendChild(s);
      }
    });
  }

  /** Funil: situação atual das propostas emitidas no período (escala de um só azul, do rascunho à aprovação). */
  function funil(dados) {
    const etapas = dados.funil.concat([dados.funilRecusadas]);
    const total = etapas.reduce(function (s, e) { return s + e.n; }, 0);
    return cartaoGrafico({
      titulo: 'Funil de vendas', sub: 'Situação atual das propostas emitidas no período',
      vazio: total ? null : 'Nenhuma proposta emitida no período.',
      tabela: function () { return tabelaSimples(['Situação', 'Propostas', 'Valor'], etapas.map(function (e) { return [e.label, e.n, U.brl(e.valor)]; })); },
      desenhar: function (area, W, mostrar) {
        const rot = 112, val = 132, linha = 34, hh = 18;
        const H = etapas.length * linha + 10;
        const pw = Math.max(40, W - rot - val - 10);
        const max = Math.max.apply(null, etapas.map(function (e) { return e.n; }).concat([1]));
        const s = svg('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, 'font-family': 'inherit' });
        etapas.forEach(function (e, i) {
          const y0 = 4 + i * linha + (i === etapas.length - 1 ? 6 : 0);
          const cor = e.id === 'recusada' ? COR.recusada : COR.funil[i];
          s.appendChild(texto(0, y0 + hh / 2 + 4, e.label, { fill: COR.texto2, 'font-size': 12 }));
          const w = e.n ? Math.max(4, e.n / max * pw) : 0;
          if (w) s.appendChild(barra(rot, y0, w, hh, cor, true));
          s.appendChild(texto(rot + w + 8, y0 + hh / 2 + 4, e.n + (e.valor ? ' · ' + compacto(e.valor) : ''), { fill: COR.texto, 'font-size': 12, 'font-weight': 600 }));
          const hit = svg('rect', { x: 0, y: y0 - 6, width: W, height: hh + 12, fill: 'transparent', class: 'dash-hit' });
          alvo(hit, [e.n + (e.n === 1 ? ' proposta' : ' propostas'), e.label + (e.valor ? ' · ' + U.brl(e.valor) : '')], mostrar);
          s.appendChild(hit);
        });
        area.appendChild(s);
      }
    });
  }

  /** Vendas do período por tipo de sistema: barra empilhada (parte do todo) com legenda e valores. */
  function porTipo(dados) {
    const tipos = dados.porTipo.filter(function (t) { return t.valor > 0; });
    const total = tipos.reduce(function (s, t) { return s + t.valor; }, 0);
    return cartaoGrafico({
      titulo: 'Vendas por tipo de sistema', sub: 'Valor aprovado no período',
      legenda: total ? h('div.dash-legenda', dados.porTipo.map(function (t) {
        return h('span', h('i', { style: { background: COR.tipos[t.id] } }), t.label + ' — ' + (t.valor ? U.brl(t.valor) + ' (' + U.fmt(t.valor / total * 100, 0) + '%)' : 'nenhuma'));
      })) : null,
      vazio: total ? null : 'Nenhuma venda no período.',
      tabela: function () { return tabelaSimples(['Tipo', 'Vendas', 'Valor', 'Participação'], dados.porTipo.map(function (t) { return [t.label, t.n, U.brl(t.valor), total ? U.fmt(t.valor / total * 100, 0) + '%' : '—']; })); },
      desenhar: function (area, W, mostrar) {
        const H = 44, hh = 24, y0 = 10;
        const s = svg('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, 'font-family': 'inherit' });
        let x = 0;
        const gap = 2, livre = W - gap * (tipos.length - 1);
        tipos.forEach(function (t, i) {
          const w = t.valor / total * livre;
          // base reta à esquerda; só a ponta do último segmento é arredondada; 2 px de fundo separam os segmentos
          s.appendChild(i === tipos.length - 1 ? barra(x, y0, w, hh, COR.tipos[t.id], true) : svg('rect', { x: x, y: y0, width: w, height: hh, fill: COR.tipos[t.id] }));
          const pct = U.fmt(t.valor / total * 100, 0) + '%';
          if (w > pct.length * 8 + 16) s.appendChild(texto(x + w / 2, y0 + hh / 2 + 4, pct, { 'text-anchor': 'middle', fill: t.id === 'bess' ? '#0b0b0b' : '#ffffff', 'font-weight': 600 }));
          const hit = svg('rect', { x: x, y: 0, width: Math.max(w, 6), height: H, fill: 'transparent', class: 'dash-hit' });
          alvo(hit, [U.brl(t.valor), t.label + ' · ' + t.n + (t.n === 1 ? ' venda' : ' vendas') + ' · ' + pct], mostrar);
          s.appendChild(hit);
          x += w + gap;
        });
        area.appendChild(s);
      }
    });
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
    return h('section.card.dash-card',
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
    return h('section.card.dash-card',
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
    return h('section.card.dash-card',
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

  /* ------------------------------------------------------------ tela */

  function lerPeriodo() { try { return localStorage.getItem(CHAVE_PERIODO) || 'mes'; } catch (e) { return 'mes'; } }
  function gravarPeriodo(v) { try { localStorage.setItem(CHAVE_PERIODO, v); } catch (e) { /* sem armazenamento: só nesta visita */ } }

  UI.rota('/painel', function (cont) {
    const emp = S.config().empresa;
    const props = S.list('propostas');
    let periodo = lerPeriodo();
    if (!App.Crm.PERIODOS.some(function (p) { return p.id === periodo; })) periodo = 'mes';

    cont.appendChild(UI.cabecalho('Dashboard', emp.razao + ' · CRM Solar', [
      h('a.btn', { href: '#/avulsa/nova' }, '+ Proposta de serviços'),
      h('a.btn', { href: '#/proposta/nova?tipo=bess' }, '+ BESS'),
      h('a.btn', { href: '#/proposta/nova?tipo=hibrido' }, '+ Proposta híbrida'),
      h('a.btn.primario', { href: '#/proposta/nova' }, '+ Nova proposta On-Grid')
    ]));

    // avisos de configuração e do dia a dia
    const avisos = [];
    const semInstalacao = App.aprovadasSemInstalacao ? App.aprovadasSemInstalacao() : [];
    if (semInstalacao.length) avisos.push(h('li', semInstalacao.length === 1 ? '1 proposta aprovada ainda sem instalação. ' : semInstalacao.length + ' propostas aprovadas ainda sem instalação. ', h('a', { href: '#/instalacoes' }, 'Iniciar em Instalações'), '.'));
    const semPreco = S.list('equipamentos').filter(function (e) { return e.ativo !== false && ['modulo', 'inversor', 'hibrido', 'bateria'].indexOf(e.tipo) >= 0 && !(U.num(e.preco) > 0); }).length;
    if (semPreco) avisos.push(h('li', semPreco + ' equipamento(s) principal(is) sem preço. ', h('a', { href: '#/equipamentos' }, 'Cadastrar preços'), ' para o kit ser somado automaticamente.'));
    if (props.length && !(App.Nuvem && App.Nuvem.usuario)) avisos.push(h('li', 'Os dados ficam neste navegador — ', h('a', { href: '#/dados' }, 'faça backup'), ' ou ligue a ', h('a', { href: '#/nuvem' }, 'sincronização'), '.'));
    if (!S.list('clientes').length) avisos.push(h('li', 'Comece cadastrando um ', h('a', { href: '#/clientes' }, 'cliente'), ' ou crie a proposta e cadastre o cliente por lá.'));
    if (avisos.length) cont.appendChild(h('div.card.dica', h('ul', avisos)));

    // filtro de período (vale para os indicadores e os gráficos abaixo)
    const filtro = h('div.dash-filtros', { role: 'group', 'aria-label': 'Período' }, h('span.dash-filtros-rot', 'Período'),
      App.Crm.PERIODOS.map(function (p) {
        return h('button.dash-periodo', { type: 'button', 'aria-pressed': p.id === periodo ? 'true' : 'false', 'data-periodo': p.id,
          onclick: function () { periodo = p.id; gravarPeriodo(p.id); desenhar(); } }, p.label);
      }));
    cont.appendChild(filtro);
    const area = h('div.dash');
    cont.appendChild(area);

    function desenhar() {
      filtro.querySelectorAll('.dash-periodo').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-periodo') === periodo ? 'true' : 'false'); });
      const d = App.Crm.indicadores({ propostas: S.list('propostas'), instalacoes: S.list('instalacoes'), ordens: S.list('ordens'), validadePadrao: emp.validadeDias }, periodo);
      area.textContent = '';
      const rotPeriodo = (App.Crm.PERIODOS.find(function (p) { return p.id === periodo; }) || {}).label;
      // número principal + indicadores
      area.appendChild(h('div.dash-topo',
        h('div.card.dash-hero',
          h('span.dash-tile-rot', 'Vendido — ' + String(rotPeriodo).toLowerCase()),
          h('strong.dash-hero-valor', U.brl(d.vendido)),
          variacao(d.vendido, d.vendidoAnt),
          h('small.dash-tile-sub', d.nVendas + (d.nVendas === 1 ? ' venda' : ' vendas') + (d.kwpVendido ? ' · ' + U.kwp(d.kwpVendido) + ' kWp' : ''))),
        h('div.dash-tiles',
          tile('Propostas emitidas', String(d.emitidas), d.valorEmitido ? U.brl(d.valorEmitido) + ' no período' : 'no período', '#/propostas'),
          tile('Taxa de conversão', d.conversao == null ? '—' : U.fmt(d.conversao * 100, 0) + '%', d.decididas ? d.nVendas + ' de ' + d.decididas + ' decididas (aprovadas ou recusadas)' : 'nenhuma decidida no período'),
          tile('Ticket médio', d.nVendas ? U.brl(d.ticket) : '—', d.nVendas ? 'por venda no período' : 'sem vendas no período'),
          tile('Em aberto agora', U.brl(d.abertas.valor), d.abertas.n + (d.abertas.n === 1 ? ' proposta' : ' propostas') + ' em rascunho, enviadas ou em negociação', '#/propostas'),
          d.obras ? tile('Obras em andamento', String(d.obras.andamento.length), [d.obras.atrasadas ? d.obras.atrasadas + ' com etapa atrasada' : '', d.obras.iniciar ? d.obras.iniciar + ' a iniciar' : '', d.obras.concluidas ? d.obras.concluidas + ' concluída(s) no período' : ''].filter(Boolean).join(' · ') || 'nenhuma atrasada', '#/instalacoes') : null,
          d.os ? tile('Ordens de serviço em aberto', String(d.os.abertas), [d.os.atrasadas ? d.os.atrasadas + ' atrasada(s)' : '', d.os.urgentes ? d.os.urgentes + ' urgente(s)' : ''].filter(Boolean).join(' · ') || 'nenhuma atrasada', '#/ordens') : null)));
      area.appendChild(h('div.dash-grade', vendasPorMes(d), funil(d)));
      area.appendChild(h('div.dash-grade', porTipo(d), obras(d)));
      area.appendChild(h('div.dash-grade', acompanhar(d), agendaOS(d)));
      // propostas recentes
      const recentes = S.list('propostas').slice().sort(function (a, b) { return String(b.atualizadoEm).localeCompare(String(a.atualizadoEm)); }).slice(0, 6);
      const box = h('section.card.sem-pad', h('div.card-topo', h('h3', 'Propostas recentes'), h('a', { href: '#/propostas' }, 'Ver todas →')));
      if (!recentes.length) box.appendChild(h('div.vazio', h('p', 'Nenhuma proposta ainda.'), h('a.btn.primario', { href: '#/proposta/nova' }, 'Criar a primeira proposta')));
      else box.appendChild(App.tabelaPropostas(recentes, function () { UI.despachar(true); }));
      area.appendChild(box);
    }
    desenhar();
  });
})(window.App);
