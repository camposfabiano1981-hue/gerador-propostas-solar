/*
 * Telas do financeiro (administrador): visão geral, contas a receber e a pagar (lançamento, parcelas, baixa, recibo), caixa e
 * bancos (extrato, transferências e conciliação com o extrato OFX), DRE gerencial, resultado por obra, comissões e plano de
 * contas; e o "💰 Lançar no financeiro" das propostas, contratos, propostas avulsas, OS e pedidos de compra.
 */
(function (App) {
  'use strict';

  const U = App.U, UI = App.UI, S = App.Store, F = App.Fin, D = App.DEFAULTS;
  const h = U.h;

  function dados() { return { lancs: S.list('lancamentos'), contas: S.list('contasFin'), cats: S.list('categoriasFin') }; }
  function hoje() { return U.todayISO(); }
  function porId(lista, id) { return (lista || []).find(function (x) { return x.id === id; }) || null; }
  function nomeCat(cats, id) { const c = porId(cats, id); return c ? c.nome : '—'; }
  function nomeConta(contas, id) { const c = porId(contas, id); return c ? c.nome : '—'; }
  function grupoLabel(id) { const g = D.GRUPOS_DRE.find(function (x) { return x.id === id; }); return g ? g.label.replace(/^\(([−+])\)\s*/, '') : id; }

  function opcoesCategorias(cats, tipo, atual) {
    return [{ v: '', t: '— escolha a categoria —' }].concat((cats || []).filter(function (c) { return (c.tipo === tipo && c.ativo !== false) || c.id === atual; })
      .map(function (c) { return { v: c.id, t: grupoLabel(c.grupo).split(' (')[0] + ' › ' + c.nome }; }));
  }
  function opcoesContas(contas, vazio) {
    return (vazio ? [{ v: '', t: '— conta —' }] : []).concat((contas || []).filter(function (c) { return c.ativo !== false; }).map(function (c) { return { v: c.id, t: c.nome }; }));
  }
  function opcoesObras() {
    return S.list('propostas').filter(function (p) { return p.status === 'aprovada'; }).sort(function (a, b) { return String(b.numero).localeCompare(String(a.numero)); })
      .map(function (p) { return { v: p.id, t: p.numero + ' — ' + (p.clienteNome || 'sem cliente') }; });
  }

  const SIT = { pago: ['Pago', 'ok'], vencido: ['Vencido', 'erro'], aberto: ['Em aberto', 'azul'], cancelado: ['Cancelado', 'cinza'] };
  function badgeSit(l) {
    const s = F.situacao(l, hoje());
    const x = SIT[s] || SIT.aberto;
    return UI.badge(s === 'pago' && l.tipo === 'receber' ? 'Recebido' : x[0], x[1]);
  }

  /* ------------------------------------------------------------ lançamento (novo ou edição) */

  /** o: {titulo, ajuda} — título da janela e orientação no topo do formulário (ex.: custo adicional da obra). */
  function abrirLancamento(orig, tipo, depois, preset, o) {
    o = o || {};
    const d = dados();
    const novo = !orig;
    const l = novo ? F.novoLancamento(tipo, Object.assign({ contaId: (d.contas.find(function (c) { return c.ativo !== false; }) || {}).id || '' }, preset || {})) : U.clone(orig);
    if (!l.pessoa) l.pessoa = { tipo: '', id: '', nome: '' };
    const parc = { n: 1, entrada: '', dataEntrada: hoje(), intervalo: 'mensal' };
    const corpo = h('div.form-lancamento');
    const previa = h('p.ajuda-sec.previa-parcelas');
    const desenharPrevia = function () {
      if (!novo) return;
      const lista = gerar();
      previa.textContent = lista.length > 1 ? lista.length + ' lançamentos: ' + lista.slice(0, 4).map(function (x) { return U.dataBR(x.vencimento) + ' ' + U.brl(x.valor); }).join(' · ') + (lista.length > 4 ? ' …' : '') : '';
    };
    const gerar = function () {
      const n = Math.max(1, parseInt(parc.n, 10) || 1);
      if (n === 1 && !(U.num(parc.entrada) > 0)) return [Object.assign(U.clone(l), { valor: U.round(U.numOr(l.valor, 0), 2) })];
      return F.gerarParcelas(l, { total: l.valor, n: n, entrada: parc.entrada, dataEntrada: parc.dataEntrada, primeiroVencimento: l.vencimento, competencia: l.competencia,
        intervaloDias: parc.intervalo === 'mensal' ? 0 : parseInt(parc.intervalo, 10) });
    };
    const desenhar = function () {
      corpo.innerHTML = '';
      if (o.ajuda) corpo.appendChild(h('p.nota', o.ajuda));
      if (novo && !o.semTipo) {
        corpo.appendChild(h('div.opcoes-cartao.compacto', [['receber', 'A receber', 'Venda, serviço, outras receitas'], ['pagar', 'A pagar', 'Compra, despesa, imposto, comissão']].map(function (o) {
          return h('button.opcao' + (l.tipo === o[0] ? '.ativa' : ''), { type: 'button', onclick: function () { if (l.tipo !== o[0]) { l.tipo = o[0]; l.categoriaId = ''; desenhar(); } } }, h('strong', o[1]), h('small', o[2]));
        })));
      }
      corpo.appendChild(UI.grade([
        { k: 'descricao', label: 'Descrição', required: true, cls: 'span2', placeholder: l.tipo === 'receber' ? 'Ex.: Venda do sistema 6,2 kWp — Maria' : 'Ex.: Aluguel de novembro' },
        { k: 'categoriaId', label: 'Categoria (plano de contas)', type: 'select', options: opcoesCategorias(d.cats, l.tipo, l.categoriaId), cls: 'span2' },
        { k: 'valor', label: novo ? 'Valor total' : 'Valor', type: 'money', required: true },
        { k: 'vencimento', label: novo ? '1º vencimento' : 'Vencimento', type: 'date' },
        { k: 'competencia', label: 'Competência (mês da DRE)', type: 'date', help: 'Data da venda, da compra ou do serviço.' },
        { k: 'contaId', label: l.tipo === 'receber' ? 'Conta de recebimento' : 'Conta de pagamento', type: 'select', options: opcoesContas(d.contas, true) },
        { k: 'forma', label: 'Forma de pagamento', type: 'select', options: [{ v: '', t: '—' }].concat(F.FORMAS.map(function (x) { return { v: x.id, t: x.label }; })) },
        { k: 'documento', label: 'Documento (NF, boleto, recibo)' },
        { k: 'pessoa.nome', label: l.tipo === 'receber' ? 'Cliente / pagador' : 'Fornecedor / favorecido', cls: 'span2' },
        { k: 'obraId', label: 'Obra (resultado por obra)', type: 'select', options: [{ v: '', t: '— sem obra —' }].concat(opcoesObras()), cls: 'span2' },
        !novo && l.situacao !== 'pago' ? { k: 'situacao', label: 'Situação', type: 'select', options: [{ v: 'aberto', t: 'Em aberto' }, { v: 'cancelado', t: 'Cancelado' }] } : null,
        { k: 'observacoes', label: 'Observações', type: 'textarea', rows: 2, cls: 'span2' }
      ], l, desenharPrevia, 2));
      if (novo) {
        corpo.appendChild(h('h4.secao-form', 'Parcelamento (opcional)'));
        corpo.appendChild(UI.grade([
          { k: 'n', label: 'Nº de parcelas', type: 'int' },
          { k: 'intervalo', label: 'Intervalo', type: 'select', options: [{ v: 'mensal', t: 'Mensal (mesmo dia)' }, { v: '7', t: 'A cada 7 dias' }, { v: '15', t: 'A cada 15 dias' }, { v: '30', t: 'A cada 30 dias' }] },
          { k: 'entrada', label: 'Entrada (opcional)', type: 'money' },
          { k: 'dataEntrada', label: 'Data da entrada', type: 'date' }
        ], parc, desenharPrevia, 4));
        corpo.appendChild(previa);
        desenharPrevia();
      } else if (l.situacao === 'pago') {
        corpo.appendChild(h('div.nota.ok', (l.tipo === 'receber' ? 'Recebido' : 'Pago') + ' em ' + U.dataBR(l.pagoEm) + ' — ' + nomeConta(d.contas, l.contaId) + ': ' + U.brl(U.numOr(l.valorPago, 0)) +
          (U.num(l.juros) > 0 ? ' (juros ' + U.brl(U.num(l.juros)) + ')' : '') + (U.num(l.desconto) > 0 ? ' (desconto ' + U.brl(U.num(l.desconto)) + ')' : '') + (l.conciliado ? ' · conciliado com o extrato' : '') + '.',
          ' ', h('button.btn.pequeno', { type: 'button', onclick: async function () {
            if (!(await UI.confirmar('Estornar a baixa? O lançamento volta para "em aberto".', 'Estornar', true))) return;
            F.estornar(l); desenhar();
          } }, 'Estornar baixa')));
      }
    };
    desenhar();
    UI.modal({
      titulo: o.titulo || (novo ? 'Novo lançamento' : 'Lançamento'), largo: true, corpo: corpo, acoes: [
        { label: 'Cancelar' },
        {
          label: 'Salvar', primario: true, onClick: function () {
            if (!String(l.descricao || '').trim()) { UI.toast('Informe a descrição.', 'erro'); return false; }
            if (!(U.num(l.valor) > 0)) { UI.toast('Informe o valor.', 'erro'); return false; }
            if (!l.categoriaId) { UI.toast('Escolha a categoria (plano de contas): é ela que leva o lançamento à linha certa da DRE.', 'erro'); return false; }
            const lista = novo ? gerar() : [l];
            lista.forEach(function (x) { S.save('lancamentos', x); });
            UI.toast(lista.length > 1 ? lista.length + ' lançamentos gravados.' : 'Lançamento gravado.', 'ok');
            if (depois) depois();
          }
        }
      ]
    });
  }

  /* ------------------------------------------------------------ baixa */

  function abrirBaixa(orig, depois) {
    const d = dados();
    const l = U.clone(orig);
    const est = { data: hoje(), contaId: l.contaId || (d.contas[0] || {}).id || '', valor: U.numOr(l.valor, 0), juros: '', desconto: '', forma: l.forma || '' };
    const total = h('p.compra-linha.total');
    const pintar = function () {
      const t = U.numOr(est.valor, 0) + U.numOr(est.juros, 0) - U.numOr(est.desconto, 0);
      total.replaceChildren(h('span', l.tipo === 'receber' ? 'Total recebido' : 'Total pago'), h('strong', U.brl(t)));
      const parcial = U.numOr(est.valor, 0) < U.numOr(l.valor, 0) - 0.004;
      aviso.hidden = !parcial;
      aviso.textContent = parcial ? 'Pagamento parcial: o saldo de ' + U.brl(U.numOr(l.valor, 0) - U.numOr(est.valor, 0)) + ' continua em aberto, num lançamento novo com o mesmo vencimento.' : '';
    };
    const aviso = h('p.nota.aviso', { hidden: true });
    const corpo = h('div',
      h('p.ajuda-sec', l.descricao + ' · vencimento ' + U.dataBR(l.vencimento) + ' · ' + U.brl(U.numOr(l.valor, 0))),
      UI.grade([
        { k: 'data', label: l.tipo === 'receber' ? 'Data do recebimento' : 'Data do pagamento', type: 'date' },
        { k: 'contaId', label: 'Conta', type: 'select', options: opcoesContas(d.contas) },
        { k: 'valor', label: 'Valor da parcela pago', type: 'money' },
        { k: 'forma', label: 'Forma', type: 'select', options: [{ v: '', t: '—' }].concat(F.FORMAS.map(function (x) { return { v: x.id, t: x.label }; })) },
        { k: 'juros', label: 'Juros / multa', type: 'money' },
        { k: 'desconto', label: 'Desconto', type: 'money' }
      ], est, pintar, 2), aviso, total);
    pintar();
    UI.modal({
      titulo: l.tipo === 'receber' ? 'Baixar recebimento' : 'Baixar pagamento', corpo: corpo, acoes: [
        { label: 'Cancelar' },
        {
          label: l.tipo === 'receber' ? 'Confirmar recebimento' : 'Confirmar pagamento', primario: true, onClick: function () {
            if (!est.contaId) { UI.toast('Escolha a conta.', 'erro'); return false; }
            if (!(U.num(est.valor) > 0)) { UI.toast('Informe o valor pago.', 'erro'); return false; }
            const r = F.baixar(l, est);
            S.save('lancamentos', r.lancamento);
            if (r.saldo) S.save('lancamentos', r.saldo);
            UI.toast((l.tipo === 'receber' ? 'Recebimento' : 'Pagamento') + ' registrado' + (r.saldo ? '; saldo de ' + U.brl(r.saldo.valor) + ' em aberto.' : '.'), 'ok');
            if (depois) depois();
          }
        }
      ]
    });
  }

  async function recibo(l, botao) {
    if (botao) botao.disabled = true;
    try {
      App.Visualizar.abrir(function () { return App.Relatorios.pdfRecibo(l, App.Calc.contexto()); }, { titulo: 'Recibo — ' + l.descricao });
    } finally { if (botao) botao.disabled = false; }
  }

  /* ------------------------------------------------------------ listas a receber / a pagar */

  /** Tabela de lançamentos com as ações (baixar, recibo, editar, excluir). */
  function tabelaLancamentos(lista, d, recarregar, semTipo) {
    const tb = h('tbody');
    lista.forEach(function (l) {
      const s = F.situacao(l, hoje());
      const acoes = [];
      if (s === 'aberto' || s === 'vencido') acoes.push(h('button.btn.pequeno.btn-baixar', { type: 'button', title: l.tipo === 'receber' ? 'Registrar o recebimento' : 'Registrar o pagamento', onclick: function () { abrirBaixa(l, recarregar); } }, l.tipo === 'receber' ? '💲 Receber' : '💲 Pagar'));
      if (s === 'pago' && l.tipo === 'receber') {
        const b = h('button.btn-formato.ver', { type: 'button', title: 'Recibo em PDF', onclick: function () { recibo(l, b); } }, '🧾');
        acoes.push(b);
      }
      acoes.push(h('button.btn-icone', { type: 'button', title: 'Editar', 'aria-label': 'Editar', onclick: function () { abrirLancamento(l, l.tipo, recarregar); } }, '✎'));
      acoes.push(h('button.btn-icone.perigo', {
        type: 'button', title: 'Excluir', 'aria-label': 'Excluir', onclick: async function () {
          if (!(await UI.confirmar('Excluir o lançamento "' + l.descricao + '"? Para manter o histórico, prefira marcar como Cancelado.', 'Excluir', true))) return;
          S.remove('lancamentos', l.id); UI.toast('Lançamento excluído.'); recarregar();
        }
      }, '🗑'));
      tb.appendChild(h('tr' + (s === 'vencido' ? '.linha-vencida' : ''),
        h('td', h('strong', U.dataBR(s === 'pago' ? l.pagoEm : l.vencimento)), h('div.mini', s === 'pago' ? 'venc. ' + U.dataBR(l.vencimento) : (l.parcela ? 'parcela ' + l.parcela.n + '/' + l.parcela.de : ''))),
        semTipo ? h('td', l.tipo === 'receber' ? '📥' : '📤') : null,
        h('td', h('div', l.descricao), h('div.mini', [l.pessoa && l.pessoa.nome, l.documento ? 'doc. ' + l.documento : '', l.obraId ? '🏗 obra' : ''].filter(Boolean).join(' · '))),
        h('td', h('span.mini', nomeCat(d.cats, l.categoriaId))),
        h('td', h('span.mini', nomeConta(d.contas, l.contaId))),
        h('td.num', h('strong', U.brl(s === 'pago' ? U.numOr(l.valorPago, 0) : U.numOr(l.valor, 0)))),
        h('td', badgeSit(l), l.conciliado ? h('div.mini', '✓ conciliado') : null),
        h('td.acoes-col', acoes)));
    });
    return h('div.tabela-rolagem', h('table.tabela.tabela-fin', h('thead', h('tr', ['Data', semTipo ? '' : null, 'Descrição', 'Categoria', 'Conta', 'Valor', 'Situação', ''].filter(function (x) { return x !== null; })
      .map(function (t, i, arr) { return h('th' + (t === 'Valor' ? '.num' : ''), t); }))), tb));
  }

  function paginaLista(cont, tipo) {
    const chave = 'crm.fin.filtro.' + tipo;
    let f = 'aberto';
    try { f = localStorage.getItem(chave) || 'aberto'; } catch (e) { /* padrão */ }
    const dia0 = hoje();
    const est = { q: '', de: dia0.slice(0, 8) + '01', ate: F.somarDias(F.somarMeses(dia0.slice(0, 8) + '01', 1), -1), agrupar: 'mes' };
    const caixa = h('div.card.sem-pad');
    const totais = h('div.fin-totais');
    const periodo = h('div.fin-periodo', UI.grade([{ k: 'de', label: 'Vencimento de', type: 'date' }, { k: 'ate', label: 'até', type: 'date' }], est, function () { desenhar(); }, 2));
    function desenhar() {
      periodo.hidden = f !== 'periodo';
      const d = dados();
      const lista = F.filtrar(d.lancs, tipo, { filtro: f, q: est.q, de: est.de, ate: est.ate });
      caixa.innerHTML = '';
      if (!lista.length) caixa.appendChild(h('div.vazio', h('p', 'Nenhum lançamento com esses filtros.')));
      else caixa.appendChild(tabelaLancamentos(lista, d, desenhar));
      const dia = hoje();
      let aberto = 0, vencido = 0, pago = 0;
      lista.forEach(function (l) { const s = F.situacao(l, dia); if (s === 'vencido') vencido += U.numOr(l.valor, 0); else if (s === 'aberto') aberto += U.numOr(l.valor, 0); else if (s === 'pago') pago += U.numOr(l.valorPago, 0); });
      totais.replaceChildren(
        h('span', lista.length + (lista.length === 1 ? ' lançamento' : ' lançamentos')),
        h('span', 'Em aberto ', h('strong', U.brl(aberto))),
        h('span.vencido', 'Vencido ', h('strong', U.brl(vencido))),
        h('span', tipo === 'receber' ? 'Recebido ' : 'Pago ', h('strong', U.brl(pago))));
    }
    const busca = h('input.busca', { type: 'search', placeholder: 'Descrição, pessoa, documento…', oninput: function () { est.q = busca.value; desenhar(); } });
    const sel = h('select', { 'aria-label': 'Filtro', onchange: function () { f = sel.value; try { localStorage.setItem(chave, f); } catch (e) { /* só nesta visita */ } desenhar(); } },
      F.FILTROS.map(function (x) { const o = h('option', { value: x.id }, x.label); if (x.id === f) o.selected = true; return o; }));
    const agrupar = h('select', { 'aria-label': 'Agrupar o relatório por', onchange: function () { est.agrupar = agrupar.value; } },
      App.RelFin.AGRUPAR.map(function (x) { const o = h('option', { value: x.id }, 'Agrupar por: ' + x.label.toLowerCase()); if (x.id === est.agrupar) o.selected = true; return o; }));
    agrupar.options[agrupar.options.length - 1].textContent = 'Sem agrupar';
    cont.appendChild(UI.cabecalho(tipo === 'receber' ? 'Contas a receber' : 'Contas a pagar',
      tipo === 'receber' ? 'Parcelas das vendas, serviços e outras receitas: registre o recebimento (💲), emita o recibo (🧾) e acompanhe os vencidos.' : 'Compras, despesas, impostos e comissões: registre o pagamento (💲) e acompanhe os vencidos.',
      [busca, sel, h('button.btn.primario', { type: 'button', onclick: function () { abrirLancamento(null, tipo, desenhar); } }, '+ Novo lançamento')]));
    cont.appendChild(periodo);
    cont.appendChild(h('div.barra-relatorio', h('span.barra-relatorio-rot', 'Relatório desta lista:'), agrupar,
      App.RelFin.botoes('lancamentos', function () { return { tipo: tipo, filtro: f, q: est.q, de: est.de, ate: est.ate, agrupar: est.agrupar }; })));
    cont.appendChild(totais);
    cont.appendChild(caixa);
    desenhar();
  }

  UI.rota('/financeiro/receber', function (cont) { paginaLista(cont, 'receber'); });
  UI.rota('/financeiro/pagar', function (cont) { paginaLista(cont, 'pagar'); });

  /* ------------------------------------------------------------ visão geral */

  UI.rota('/financeiro', function (cont) {
    const d = dados();
    const G = App.Graficos;
    const r = F.resumo(d.lancs, d.contas, hoje());
    cont.appendChild(UI.cabecalho('Financeiro', 'Caixa, contas a receber e a pagar, fluxo de caixa e resultado.', [
      h('button.btn', { type: 'button', onclick: function () { abrirLancamento(null, 'pagar', function () { UI.despachar(true); }); } }, '+ Conta a pagar'),
      h('button.btn.primario', { type: 'button', onclick: function () { abrirLancamento(null, 'receber', function () { UI.despachar(true); }); } }, '+ Conta a receber')
    ]));
    cont.appendChild(h('div.barra-relatorio', h('span.barra-relatorio-rot', 'Resumo financeiro:'), App.RelFin.botoes('resumo', {}, { semPlanilha: true }),
      h('a.btn', { href: '#/financeiro/relatorios' }, '📑 Todos os relatórios')));
    const anoAtual = hoje().slice(0, 4), mesAtual = parseInt(hoje().slice(5, 7), 10) - 1;
    const dr = F.dre(d.lancs, d.cats, anoAtual, 'competencia');
    const resMes = dr.linhas[dr.linhas.length - 1].valores[mesAtual];
    cont.appendChild(h('div.dash-tiles.fin-tiles',
      G.tile('Saldo em caixa e bancos', U.brl(r.saldo), d.contas.filter(function (c) { return c.ativo !== false; }).length + ' conta(s)', '#/financeiro/contas'),
      G.tile('A receber — 30 dias', U.brl(r.aReceber30), 'recebido no mês: ' + U.brl(r.recebidoMes), '#/financeiro/receber'),
      G.tile('A pagar — 30 dias', U.brl(r.aPagar30), 'pago no mês: ' + U.brl(r.pagoMes), '#/financeiro/pagar'),
      G.tile('⚠ Vencidos a receber', U.brl(r.vencRec.valor), r.vencRec.n + (r.vencRec.n === 1 ? ' lançamento' : ' lançamentos'), '#/financeiro/receber'),
      G.tile('⚠ Vencidos a pagar', U.brl(r.vencPag.valor), r.vencPag.n + (r.vencPag.n === 1 ? ' lançamento' : ' lançamentos'), '#/financeiro/pagar'),
      G.tile('Resultado do mês (DRE)', U.brl(resMes), 'regime de competência', '#/financeiro/dre')));
    // fluxo de caixa
    const fl = F.fluxo(d.lancs, d.contas, hoje(), 2, 5);
    const COR_ENT = '#2a78d6', COR_SAI = '#eb6834';
    const temMov = fl.some(function (m) { return m.entradas || m.saidas; });
    cont.appendChild(G.cartaoGrafico({
      titulo: 'Fluxo de caixa', sub: 'Meses passados: realizado · mês atual e seguintes: realizado + previsto (em aberto, inclusive vencidos)',
      legenda: G.legenda([['Entradas', COR_ENT], ['Saídas', COR_SAI]]),
      vazio: temMov ? null : 'Sem lançamentos ainda. Lance as contas a receber e a pagar para ver o fluxo de caixa.',
      tabela: function () { return G.tabelaSimples(['Mês', 'Entradas', 'Saídas', 'Saldo no fim do mês'], fl.map(function (m) { return [m.rot + (m.passado ? '' : ' (prev.)'), U.brl(m.entradas), U.brl(m.saidas), U.brl(m.saldo)]; })); },
      desenhar: function (area, W, mostrar) {
        const H = 250, m = { l: 66, r: 10, t: 20, b: 40 };
        const pw = W - m.l - m.r, ph = H - m.t - m.b;
        const max = Math.max.apply(null, fl.map(function (x) { return Math.max(x.entradas, x.saidas); }).concat([1]));
        const passo = G.passoBonito(max, 4), topo = Math.ceil(max / passo) * passo;
        const y = function (v) { return m.t + ph - v / topo * ph; };
        const s = G.svg('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, 'font-family': 'inherit' });
        for (let v = 0; v <= topo + 1e-6; v += passo) {
          s.appendChild(G.svg('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), stroke: v === 0 ? G.COR.eixo : G.COR.grade, 'stroke-width': 1 }));
          s.appendChild(G.texto(m.l - 8, y(v) + 4, G.compacto(v), { 'text-anchor': 'end' }));
        }
        const banda = pw / fl.length, bw = Math.min(18, banda * 0.32);
        fl.forEach(function (mm, i) {
          const cx = m.l + banda * i + banda / 2;
          const op = mm.passado ? 1 : 0.75;
          if (mm.entradas > 0) { const b = G.barra(cx - bw - 1, y(mm.entradas), bw, y(0) - y(mm.entradas), COR_ENT); b.setAttribute('opacity', op); s.appendChild(b); }
          if (mm.saidas > 0) { const b = G.barra(cx + 1, y(mm.saidas), bw, y(0) - y(mm.saidas), COR_SAI); b.setAttribute('opacity', op); s.appendChild(b); }
          s.appendChild(G.texto(cx, H - 22, mm.rot, { 'text-anchor': 'middle', 'font-weight': mm.atual ? 700 : 400 }));
          s.appendChild(G.texto(cx, H - 8, G.compacto(mm.saldo), { 'text-anchor': 'middle', fill: mm.saldo < 0 ? G.COR.critico : G.COR.texto2 }));
          const hit = G.svg('rect', { x: m.l + banda * i, y: m.t, width: banda, height: ph, fill: 'transparent', class: 'dash-hit' });
          G.alvo(hit, [mm.rot + (mm.passado ? ' (realizado)' : mm.atual ? ' (realizado + previsto)' : ' (previsto)'), 'Entradas ' + U.brl(mm.entradas), 'Saídas ' + U.brl(mm.saidas), 'Saldo no fim do mês ' + U.brl(mm.saldo)], mostrar);
          s.appendChild(hit);
        });
        area.appendChild(s);
      }
    }));
    // vencidos e próximos 7 dias
    const ate = F.somarDias(hoje(), 7);
    const prox = d.lancs.filter(function (l) { return l.tipo !== 'transferencia' && l.situacao === 'aberto' && l.vencimento <= ate; })
      .sort(function (a, b) { return String(a.vencimento).localeCompare(String(b.vencimento)); });
    cont.appendChild(h('section.card.sem-pad', h('div.card-topo', h('h3', 'Vencidos e próximos 7 dias')),
      prox.length ? tabelaLancamentos(prox, d, function () { UI.despachar(true); }, true) : h('p.ajuda-sec', { style: { padding: '14px 18px' } }, 'Nada vencido nem vencendo nos próximos 7 dias.')));
  });

  /* ------------------------------------------------------------ caixa e bancos */

  function abrirConta(orig, depois) {
    const c = orig ? U.clone(orig) : { nome: '', tipo: 'banco', banco: '', agencia: '', numero: '', saldoInicial: 0, dataSaldoInicial: hoje(), ativo: true };
    UI.modal({
      titulo: orig ? 'Conta' : 'Nova conta', corpo: UI.grade([
        { k: 'nome', label: 'Nome', required: true, placeholder: 'Ex.: Banco do Brasil — conta PJ', cls: 'span2' },
        { k: 'tipo', label: 'Tipo', type: 'select', options: F.TIPOS_CONTA.map(function (x) { return { v: x.id, t: x.label }; }) },
        { k: 'banco', label: 'Banco' }, { k: 'agencia', label: 'Agência' }, { k: 'numero', label: 'Conta' },
        { k: 'saldoInicial', label: 'Saldo inicial', type: 'money', help: 'Saldo do extrato na data abaixo.' },
        { k: 'dataSaldoInicial', label: 'Data do saldo inicial', type: 'date' },
        { k: 'ativo', label: 'Ativa', type: 'checkbox' }
      ], c, null, 2),
      acoes: [{ label: 'Cancelar' }, { label: 'Salvar', primario: true, onClick: function () {
        if (!String(c.nome || '').trim()) { UI.toast('Informe o nome da conta.', 'erro'); return false; }
        S.save('contasFin', c); UI.toast('Conta salva.', 'ok'); if (depois) depois();
      } }]
    });
  }

  function abrirTransferencia(origemId, depois) {
    const d = dados();
    const est = { origem: origemId || (d.contas[0] || {}).id || '', destino: '', valor: '', data: hoje(), descricao: 'Transferência entre contas' };
    UI.modal({
      titulo: 'Transferência entre contas', corpo: UI.grade([
        { k: 'origem', label: 'Sai de', type: 'select', options: opcoesContas(d.contas) },
        { k: 'destino', label: 'Entra em', type: 'select', options: opcoesContas(d.contas, true) },
        { k: 'valor', label: 'Valor', type: 'money' }, { k: 'data', label: 'Data', type: 'date' },
        { k: 'descricao', label: 'Descrição', cls: 'span2' }
      ], est, null, 2),
      acoes: [{ label: 'Cancelar' }, { label: 'Transferir', primario: true, onClick: function () {
        if (!est.destino || est.destino === est.origem) { UI.toast('Escolha duas contas diferentes.', 'erro'); return false; }
        if (!(U.num(est.valor) > 0)) { UI.toast('Informe o valor.', 'erro'); return false; }
        S.save('lancamentos', F.transferencia(est.origem, est.destino, est.valor, est.data, est.descricao));
        UI.toast('Transferência registrada.', 'ok'); if (depois) depois();
      } }]
    });
  }

  UI.rota('/financeiro/contas', function (cont) {
    const box = h('div.card.sem-pad');
    function desenhar() {
      const d = dados();
      box.innerHTML = '';
      const tb = h('tbody');
      d.contas.forEach(function (c) {
        const saldo = F.saldoConta(c, d.lancs);
        tb.appendChild(h('tr', { onclick: function (e) { if (!e.target.closest('button')) UI.ir('#/financeiro/conta/' + c.id); } },
          h('td', h('strong', c.nome), h('div.mini', [F.rotulo(F.TIPOS_CONTA, c.tipo), c.banco, c.agencia ? 'ag. ' + c.agencia : '', c.numero ? 'c/c ' + c.numero : ''].filter(Boolean).join(' · '))),
          h('td.num', h('strong' + (saldo < 0 ? '.negativo' : ''), U.brl(saldo))),
          h('td', c.ativo === false ? UI.badge('Inativa', 'cinza') : UI.badge('Ativa', 'ok')),
          h('td.acoes-col',
            h('a.btn.pequeno', { href: '#/financeiro/conta/' + c.id }, 'Extrato'),
            h('button.btn-icone', { type: 'button', title: 'Editar', 'aria-label': 'Editar', onclick: function () { abrirConta(c, desenhar); } }, '✎'))));
      });
      const total = F.saldoTotal(d.contas, d.lancs);
      box.appendChild(h('div.tabela-rolagem', h('table.tabela', h('thead', h('tr', h('th', 'Conta'), h('th.num', 'Saldo hoje'), h('th', 'Situação'), h('th', ''))), tb,
        h('tfoot', h('tr', h('td', h('strong', 'Total (contas ativas)')), h('td.num', h('strong', U.brl(total))), h('td'), h('td'))))));
    }
    cont.appendChild(UI.cabecalho('Caixa e bancos', 'Saldos, extratos, transferências e a conciliação com o extrato do banco (OFX).', [
      h('button.btn', { type: 'button', onclick: function () { abrirTransferencia(null, desenhar); } }, '⇄ Transferir'),
      h('button.btn.primario', { type: 'button', onclick: function () { abrirConta(null, desenhar); } }, '+ Nova conta')
    ]));
    cont.appendChild(box);
    desenhar();
  });

  UI.rota('/financeiro/conta/:id', function (cont, params) {
    const conta = S.get('contasFin', params.id);
    if (!conta) { UI.toast('Conta não encontrada.', 'erro'); UI.ir('#/financeiro/contas'); return; }
    const est = { per: 'mes' };
    const box = h('div.card.sem-pad');
    const topo = h('div.fin-totais');
    function periodo() {
      const dia = hoje();
      if (est.per === 'mes') return [dia.slice(0, 8) + '01', dia];
      if (est.per === '30') return [F.somarDias(dia, -30), dia];
      if (est.per === '90') return [F.somarDias(dia, -90), dia];
      if (est.per === 'ano') return [dia.slice(0, 4) + '-01-01', dia];
      return ['', ''];
    }
    function desenhar() {
      const d = dados();
      const pr = periodo();
      const ex = F.extrato(conta, d.lancs, pr[0], pr[1]);
      topo.replaceChildren(h('span', 'Saldo anterior ', h('strong', U.brl(ex.anterior))), h('span', 'Saldo final ', h('strong', U.brl(ex.final))),
        h('span', 'Saldo hoje ', h('strong', U.brl(F.saldoConta(conta, d.lancs)))));
      box.innerHTML = '';
      if (!ex.linhas.length) { box.appendChild(h('div.vazio', h('p', 'Nenhum movimento no período.'))); return; }
      const tb = h('tbody');
      ex.linhas.slice().reverse().forEach(function (m) {
        tb.appendChild(h('tr', h('td', U.dataBR(m.data)), h('td', m.descricao, m.l.tipo === 'transferencia' ? h('div.mini', 'transferência') : null),
          h('td.num.entrada', m.entrada ? U.brl(m.entrada) : ''), h('td.num.saida', m.saida ? U.brl(m.saida) : ''), h('td.num', U.brl(m.saldo)),
          h('td', m.l.conciliado ? UI.badge('✓ Conciliado', 'ok') : '')));
      });
      box.appendChild(h('div.tabela-rolagem', h('table.tabela', h('thead', h('tr', h('th', 'Data'), h('th', 'Descrição'), h('th.num', 'Entrada'), h('th.num', 'Saída'), h('th.num', 'Saldo'), h('th', ''))), tb)));
    }
    const sel = h('select', { 'aria-label': 'Período', onchange: function () { est.per = sel.value; desenhar(); } },
      [['mes', 'Este mês'], ['30', 'Últimos 30 dias'], ['90', 'Últimos 90 dias'], ['ano', 'Este ano'], ['tudo', 'Tudo']].map(function (x) { return h('option', { value: x[0] }, x[1]); }));
    const ofx = h('input', { type: 'file', accept: '.ofx,.OFX,application/x-ofx,text/plain', onchange: function () { const f = ofx.files[0]; ofx.value = ''; if (f) conciliarArquivo(conta, f, desenhar); } });
    cont.appendChild(UI.cabecalho(conta.nome, 'Extrato da conta: entradas, saídas e saldo dia a dia.', [
      sel, h('label.btn', ofx, '📥 Conciliar extrato (OFX)'),
      h('button.btn', { type: 'button', onclick: function () { abrirTransferencia(conta.id, desenhar); } }, '⇄ Transferir'),
      h('a.btn', { href: '#/financeiro/contas' }, '← Contas')
    ]));
    cont.appendChild(h('div.barra-relatorio', h('span.barra-relatorio-rot', 'Extrato do período:'),
      App.RelFin.botoes('extrato', function () { const pr = periodo(); return { contaId: conta.id, de: pr[0], ate: pr[1] }; })));
    cont.appendChild(topo);
    cont.appendChild(box);
    desenhar();
  });

  /** Conciliação: lê o OFX, sugere a ação de cada transação e aplica as escolhidas. */
  async function conciliarArquivo(conta, arquivo, depois) {
    let ofx;
    try { ofx = F.lerOfx(await arquivo.text()); } catch (e) { UI.toast(e.message, 'erro'); return; }
    if (!ofx.transacoes.length) { UI.toast('O extrato não tem transações.', 'erro'); return; }
    const d = dados();
    const itens = F.conciliar(ofx.transacoes, d.lancs, conta.id);
    itens.forEach(function (it) { it.escolha = it.acao === 'ja' ? 'ignorar' : it.acao; });
    const cont = { conciliar: 0, baixar: 0, novo: 0, ja: 0 };
    itens.forEach(function (it) { cont[it.acao]++; });
    const tb = h('tbody');
    itens.forEach(function (it) {
      const t = it.t;
      const opcoes = [];
      if (it.acao === 'ja') opcoes.push(['ignorar', 'Já conciliado']);
      else {
        if (it.acao === 'conciliar') opcoes.push(['conciliar', 'Conciliar com: ' + it.lanc.descricao]);
        if (it.acao === 'baixar') opcoes.push(['baixar', 'Baixar e conciliar: ' + it.lanc.descricao + ' (venc. ' + U.dataBR(it.lanc.vencimento) + ')']);
        opcoes.push(['novo', 'Criar lançamento (já pago)']);
        opcoes.push(['ignorar', 'Ignorar']);
      }
      const sel = h('select.status-sel', { 'aria-label': 'Ação', onchange: function () { it.escolha = sel.value; catSel.hidden = sel.value !== 'novo'; } },
        opcoes.map(function (o) { const op = h('option', { value: o[0] }, o[1]); if (o[0] === it.escolha) op.selected = true; return op; }));
      const catSel = h('select.status-sel', { 'aria-label': 'Categoria', hidden: it.escolha !== 'novo', onchange: function () { it.categoriaId = catSel.value; } },
        opcoesCategorias(d.cats, t.valor > 0 ? 'receber' : 'pagar', it.categoriaId).slice(1).map(function (o) { const op = h('option', { value: o.v }, o.t); if (o.v === it.categoriaId) op.selected = true; return op; }));
      if (!it.categoriaId) it.categoriaId = catSel.value;
      tb.appendChild(h('tr', h('td', U.dataBR(t.data)), h('td', t.descricao || '—'), h('td.num' + (t.valor < 0 ? '.saida' : '.entrada'), U.brl(t.valor)),
        h('td', sel, catSel)));
    });
    const saldoApp = F.saldoConta(conta, d.lancs, ofx.fim || hoje());
    const corpo = h('div.conciliacao',
      h('p.ajuda-sec', ofx.transacoes.length + ' transações' + (ofx.inicio ? ' de ' + U.dataBR(ofx.inicio) + ' a ' + U.dataBR(ofx.fim) : '') + ' · ' + cont.conciliar + ' para conciliar, ' + cont.baixar +
        ' para baixar, ' + cont.novo + ' sem lançamento' + (cont.ja ? ', ' + cont.ja + ' já conciliadas' : '') + '. Confira cada sugestão antes de aplicar.'),
      ofx.saldo != null ? h('p.nota' + (Math.abs(ofx.saldo - saldoApp) > 0.01 ? '.aviso' : '.ok'), 'Saldo no banco (OFX) em ' + U.dataBR(ofx.fim) + ': ' + U.brl(ofx.saldo) + ' · saldo no CRM na mesma data: ' + U.brl(saldoApp) +
        (Math.abs(ofx.saldo - saldoApp) > 0.01 ? ' — diferença de ' + U.brl(ofx.saldo - saldoApp) + ' (aplique a conciliação e confira o saldo inicial da conta).' : ' — conferem.')) : null,
      h('div.tabela-rolagem', h('table.tabela.compacta', h('thead', h('tr', h('th', 'Data'), h('th', 'Extrato'), h('th.num', 'Valor'), h('th', 'Ação'))), tb)));
    UI.modal({
      titulo: 'Conciliar extrato — ' + conta.nome, largo: true, corpo: corpo, acoes: [
        { label: 'Cancelar' },
        {
          label: 'Aplicar conciliação', primario: true, onClick: function () {
            const agora = new Date().toISOString();
            let n = 0;
            itens.forEach(function (it) {
              const t = it.t;
              const marca = { em: agora, fitid: t.fitid || (t.data + '|' + t.valor), contaId: conta.id };
              if (it.escolha === 'conciliar' && it.lanc) { const l = U.clone(it.lanc); l.conciliado = marca; S.save('lancamentos', l); n++; }
              else if (it.escolha === 'baixar' && it.lanc) {
                const l = U.clone(it.lanc);
                const r = F.baixar(l, { data: t.data, contaId: conta.id, valor: Math.abs(t.valor) });
                r.lancamento.conciliado = marca;
                S.save('lancamentos', r.lancamento);
                if (r.saldo) S.save('lancamentos', r.saldo);
                n++;
              } else if (it.escolha === 'novo') {
                const tipo = t.valor > 0 ? 'receber' : 'pagar';
                const v = Math.abs(t.valor);
                S.save('lancamentos', F.novoLancamento(tipo, { descricao: t.descricao || 'Lançamento do extrato', categoriaId: it.categoriaId || F.categoriaSugerida(t), contaId: conta.id,
                  valor: v, vencimento: t.data, competencia: t.data, situacao: 'pago', pagoEm: t.data, valorPago: v, conciliado: marca, origem: { tipo: 'extrato', id: '', numero: '' } }));
                n++;
              }
            });
            UI.toast(n + ' transação(ões) conciliada(s).', 'ok');
            if (depois) depois();
          }
        }
      ]
    });
  }

  /* ------------------------------------------------------------ DRE */

  UI.rota('/financeiro/dre', function (cont) {
    const d0 = dados();
    const anos = {};
    anos[hoje().slice(0, 4)] = true;
    d0.lancs.forEach(function (l) { [l.competencia, l.pagoEm, l.vencimento].forEach(function (x) { if (x) anos[String(x).slice(0, 4)] = true; }); });
    const est = { ano: hoje().slice(0, 4), regime: 'competencia' };
    const box = h('div.card.sem-pad');
    const aviso = h('div');
    function desenhar() {
      const d = dados();
      const r = F.dre(d.lancs, d.cats, est.ano, est.regime);
      aviso.replaceChildren();
      if (r.semCategoria) aviso.appendChild(h('p.nota.aviso', r.semCategoria + ' lançamento(s) sem categoria: entraram como receita (a receber) ou despesa administrativa (a pagar). Classifique-os no plano de contas.'));
      const cab = h('tr', h('th', ''), F.MESES.map(function (m) { return h('th.num', m); }), h('th.num', 'Total'), h('th.num', 'AV %'));
      const tb = h('tbody');
      const linha = function (l) {
        const cls = l.tipo === 'grupo' ? '.dre-grupo' : (l.tipo === 'subtotal' ? '.dre-subtotal' + (l.destaque ? '.dre-final' : '') : (l.tipo === 'fora' ? '.dre-fora' : '.dre-cat'));
        const av = r.receitaLiquida ? U.fmt(l.total / r.receitaLiquida * 100, 1) + '%' : '—';
        return h('tr' + cls, h('td', l.label), l.valores.map(function (v) { return h('td.num' + (v < 0 ? '.negativo' : ''), v ? U.fmt(v, 0) : '–'); }),
          h('td.num' + (l.total < 0 ? '.negativo' : ''), U.fmt(l.total, 0)), h('td.num', l.tipo === 'fora' ? '' : av));
      };
      r.linhas.forEach(function (l) { if (l.tipo !== 'categoria' || l.total) tb.appendChild(linha(l)); });
      tb.appendChild(linha(r.fora));
      box.innerHTML = '';
      box.appendChild(h('div.tabela-rolagem', h('table.tabela.tabela-dre', h('thead', cab), tb)));
    }
    const selAno = h('select', { 'aria-label': 'Ano', onchange: function () { est.ano = selAno.value; desenhar(); } },
      Object.keys(anos).sort().reverse().map(function (a) { const o = h('option', { value: a }, a); if (a === est.ano) o.selected = true; return o; }));
    const regimes = h('div.dash-filtros.fin-regime', { role: 'group', 'aria-label': 'Regime' }, [['competencia', 'Competência'], ['caixa', 'Caixa']].map(function (x) {
      const b = h('button.dash-periodo', { type: 'button', 'aria-pressed': String(x[0] === est.regime), onclick: function () {
        est.regime = x[0];
        regimes.querySelectorAll('button').forEach(function (bb) { bb.setAttribute('aria-pressed', String(bb === b)); });
        desenhar();
      } }, x[1]);
      return b;
    }));
    cont.appendChild(UI.cabecalho('DRE gerencial', 'Demonstração do resultado mês a mês (em R$). Competência: pela data da venda/compra; Caixa: pelos recebimentos e pagamentos.', [
      selAno, regimes
    ]));
    cont.appendChild(h('div.barra-relatorio', h('span.barra-relatorio-rot', 'DRE do ano:'), App.RelFin.botoes('dre', function () { return { ano: est.ano, regime: est.regime }; }, {
      planilha: function () { const d = dados(); return { texto: '\ufeff' + F.dreCsv(F.dre(d.lancs, d.cats, est.ano, est.regime)), nome: 'DRE_' + est.ano + '_' + est.regime + '.csv' }; }
    })));
    cont.appendChild(aviso);
    cont.appendChild(box);
    desenhar();
  });

  /* ------------------------------------------------------------ resultado por obra */

  function categoriaAdicional() {
    const cats = S.list('categoriasFin');
    return cats.some(function (c) { return c.id === 'cat-cus-adicionais'; }) ? 'cat-cus-adicionais' : 'cat-cus-materiais';
  }

  /** "+ Custo" da obra: lançamento a pagar já ligado à obra (custo adicional; kit, mão de obra etc. substituem o previsto). */
  function maisCusto(prop, depois) {
    abrirLancamento(null, 'pagar', depois, { obraId: prop.id, categoriaId: categoriaAdicional(), descricao: 'Custo adicional — obra ' + prop.numero, competencia: hoje() }, {
      titulo: '+ Custo da obra ' + prop.numero, semTipo: true,
      ajuda: 'Custo lançado em Contas a pagar, ligado a esta obra. Em "Custos adicionais da obra" (ou outra categoria fora da proposta) ele soma ao resultado como custo adicional; ' +
        'nas categorias Kit, Mão de obra, Materiais elétricos (CA), Frete/Projeto e Comissões ele é o custo real da linha correspondente da proposta.'
    });
  }

  function fecharApuracao(a, fechar, depois) {
    const p = S.get('propostas', a.p.id);
    if (!p) return;
    p.apuracao = fechar ? { fechada: true, em: hoje(), por: (App.Acesso.sessao() || {}).email || '' } : { fechada: false, reabertaEm: hoje() };
    S.save('propostas', p);
    UI.toast(fechar ? 'Apuração da obra ' + p.numero + ' fechada: vale o realizado.' : 'Apuração reaberta: custos não lançados voltam a entrar pelo previsto.', 'ok');
    if (depois) depois();
  }

  /** Tabela da apuração (previsto × realizado × apurado) de uma obra. */
  function tabelaApuracao(a) {
    const tb = h('tbody');
    const linha = function (cls, rot, prev, real, apur, varia, nota) {
      tb.appendChild(h('tr' + cls, h('td', rot, nota ? h('div.mini', nota) : null), h('td.num', prev), h('td.num', real), h('td.num', h('strong', apur)), h('td.num' + (varia < -0.004 ? '.negativo' : ''), varia == null ? '' : U.brl(varia))));
    };
    linha('.apur-receita', '(+) Preço de venda / receita', U.brl(a.vendido), U.brl(a.lancadoReceber), U.brl(a.receita), a.receita - a.vendido, a.lancadoReceber ? 'realizado = lançado a receber' : 'sem lançamento a receber: vale o preço da proposta');
    a.linhas.forEach(function (l) {
      linha('.apur-custo', '(−) ' + l.label, U.brl(l.previsto), l.realizado ? U.brl(l.realizado) : '—', U.brl(l.apurado), l.variacao,
        [l.nota, l.lancamentos ? l.lancamentos + ' lançamento(s)' : '', l.apurado ? 'apurado pelo ' + l.pelo : ''].filter(Boolean).join(' · '));
    });
    linha('.apur-sub', '= Custos e despesas da obra', U.brl(a.custoPrevisto), U.brl(a.custoRealizado), U.brl(a.custoApurado), a.custoPrevisto - a.custoApurado);
    linha('.apur-total', '= Resultado da obra', U.brl(a.resultadoPrevisto), '', U.brl(a.resultado), a.variacao);
    tb.appendChild(h('tr.apur-sub', h('td', 'Margem sobre a venda'), h('td.num', a.margemPrevista != null ? U.fmt(a.margemPrevista * 100, 1) + '%' : '—'), h('td'),
      h('td.num', h('strong' + (a.margem < 0 ? '.negativo' : ''), U.fmt(a.margem * 100, 1) + '%')), h('td.num', a.margemPrevista != null ? U.fmt((a.margem - a.margemPrevista) * 100, 1) + ' p.p.' : '')));
    return h('div.tabela-rolagem', h('table.tabela.tabela-apuracao', h('thead', h('tr', h('th', 'Linha'), h('th.num', 'Previsto (proposta)'), h('th.num', 'Realizado (lançado)'), h('th.num', 'Apurado'), h('th.num', 'Efeito no resultado'))), tb));
  }

  function detalheObra(a, depois) {
    const d = dados();
    let fechar = null;
    const recarregar = function () { if (fechar) fechar(); if (depois) depois(); };
    const prop = a.p;
    const inst = a.instalacao;
    const corpo = h('div.detalhe-obra',
      h('div.kpis.obra-kpis',
        h('div.kpi', h('span', 'Preço de venda'), h('strong', U.brl(a.vendido))),
        h('div.kpi', h('span', 'Custos apurados'), h('strong', U.brl(a.custoApurado))),
        h('div.kpi', h('span', 'Resultado apurado'), h('strong' + (a.resultado < 0 ? '.negativo' : ''), U.brl(a.resultado) + ' (' + U.fmt(a.margem * 100, 1) + '%)')),
        h('div.kpi', h('span', 'Resultado previsto'), h('strong', U.brl(a.resultadoPrevisto) + (a.margemPrevista != null ? ' (' + U.fmt(a.margemPrevista * 100, 1) + '%)' : '')))),
      h('p.ajuda-sec', a.fechada ? '🔒 Apuração fechada em ' + U.dataBR(a.fechadaEm) + ': vale o realizado (o que foi lançado no financeiro).'
        : 'Apuração em andamento: cada custo entra pelo maior entre o previsto na proposta e o realizado; os ainda não lançados ficam pelo previsto. Feche a apuração quando todos os custos estiverem lançados.',
        inst ? ' Instalação: ' + ((App.Instalacao.STATUS.find(function (x) { return x.id === a.statusInstalacao; }) || {}).label || '') + '.' : ''),
      a.semCalculo ? h('p.nota.aviso', 'Não foi possível recalcular a proposta: o previsto usa só o valor total gravado.') : null,
      tabelaApuracao(a),
      h('div.barra-itens',
        h('button.btn', { type: 'button', onclick: function () { maisCusto(prop, recarregar); } }, '+ Custo'),
        a.fechada ? h('button.btn', { type: 'button', onclick: function () { fecharApuracao(a, false, recarregar); } }, '🔓 Reabrir apuração')
          : h('button.btn', { type: 'button', onclick: async function () {
            if (!(await UI.confirmar('Fechar a apuração da obra ' + prop.numero + '? A partir daí o resultado usa só os custos lançados (realizado), sem o previsto da proposta.', 'Fechar apuração'))) return;
            fecharApuracao(a, true, recarregar);
          } }, '🔒 Fechar apuração'),
        App.RelFin.botoes('obra', { id: prop.id }, { rotulo: '👁 Relatório da obra', semPlanilha: false })),
      h('div.obra-caixa', h('strong', 'Caixa da obra: '), 'recebido ' + U.brl(a.recebido) + ' · a receber ' + U.brl(a.aReceber) + ' · pago ' + U.brl(a.pago) + ' · a pagar ' + U.brl(a.aPagar) + ' · saldo ' + U.brl(a.saldoCaixa)),
      h('h4.secao-form', 'Lançamentos da obra'),
      a.lancamentos.length ? tabelaLancamentos(a.lancamentos.slice().sort(function (x, y) { return String(x.vencimento).localeCompare(String(y.vencimento)); }), d, recarregar, true)
        : h('p.ajuda-sec', 'Nenhum lançamento com esta obra ainda: lance as parcelas pelo 💰 da proposta e os custos pelo "+ Custo" ou pelos pedidos de compra.'));
    fechar = UI.modal({ titulo: 'Apuração da obra ' + prop.numero + ' — ' + (prop.clienteNome || ''), largo: true, corpo: corpo, acoes: [{ label: 'Fechar' }] });
  }

  UI.rota('/financeiro/obras', function (cont) {
    let filtro = { situacao: 'todas', periodo: 'tudo', detalhar: false };
    try { filtro = Object.assign(filtro, JSON.parse(localStorage.getItem('crm.fin.obras') || '{}')); } catch (e) { /* padrão */ }
    const guardar = function () { try { localStorage.setItem('crm.fin.obras', JSON.stringify(filtro)); } catch (e) { /* só nesta visita */ } };
    const cfgFin = { aliquota: F.parametrosObras().aliquota };
    const tiles = h('div.dash-tiles.fin-tiles');
    const box = h('div.card.sem-pad');
    const opcoesRel = function () {
      const dia = hoje();
      const de = filtro.periodo === 'ano' ? dia.slice(0, 4) + '-01-01' : filtro.periodo === '12m' ? F.somarMeses(dia, -12) : '';
      return { situacao: filtro.situacao, de: de, ate: '', detalhar: !!filtro.detalhar };
    };
    function desenhar() {
      const d = dados();
      const o = opcoesRel();
      let lista = F.resultadoObras(S.list('propostas'), d.lancs, d.cats, App.Calc.contexto(), F.parametrosObras());
      if (o.de) lista = lista.filter(function (a) { return String(a.p.aprovadaEm || a.p.data || '') >= o.de; });
      if (o.situacao === 'abertas') lista = lista.filter(function (a) { return !a.fechada; });
      if (o.situacao === 'fechadas') lista = lista.filter(function (a) { return a.fechada; });
      const t = F.totaisObras(lista);
      const G = App.Graficos;
      tiles.replaceChildren(
        G.tile('Vendido', U.brl(t.vendido), t.n + (t.n === 1 ? ' obra' : ' obras') + (t.fechadas ? ' · ' + t.fechadas + ' fechada(s)' : '')),
        G.tile('Custos apurados', U.brl(t.custoApurado), 'previstos: ' + U.brl(t.custoPrevisto)),
        G.tile('Resultado apurado', U.brl(t.resultado), 'margem ' + U.fmt(t.margem * 100, 1) + '% · previsto ' + U.brl(t.resultadoPrevisto)));
      box.innerHTML = '';
      if (!lista.length) { box.appendChild(h('div.vazio', h('p', 'Nenhuma obra com esses filtros. As obras aparecem aqui quando a proposta é marcada como Aprovada.'))); return; }
      const tb = h('tbody');
      lista.forEach(function (a) {
        tb.appendChild(h('tr', { onclick: function (e) { if (!e.target.closest('button,a')) detalheObra(a, desenhar); } },
          h('td', h('strong', a.p.numero), a.fechada ? ' 🔒' : '', h('div.mini', a.p.clienteNome || ''), a.semLancamentos ? h('div', UI.badge('custos pelo previsto', 'ambar')) : null),
          h('td.num', U.brl(a.vendido), h('div.mini', 'recebido ' + U.fmt(a.vendido ? a.recebido / a.vendido * 100 : 0, 0) + '%')),
          h('td.num', U.brl(a.custoPrevisto)),
          h('td.num', U.brl(a.custoApurado), a.custoRealizado ? h('div.mini', 'lançado ' + U.brl(a.custoRealizado)) : null),
          h('td.num', U.brl(a.resultadoPrevisto)),
          h('td.num', h('strong' + (a.resultado < 0 ? '.negativo' : ''), U.brl(a.resultado))),
          h('td.num', h('strong' + (a.margem < 0 ? '.negativo' : ''), U.fmt(a.margem * 100, 1) + '%'), h('div.mini', 'prevista ' + (a.margemPrevista != null ? U.fmt(a.margemPrevista * 100, 1) + '%' : '—'))),
          h('td.acoes-col',
            h('button.btn.pequeno', { type: 'button', title: 'Apuração detalhada', onclick: function () { detalheObra(a, desenhar); } }, '🔍 Apuração'),
            h('button.btn.pequeno', { type: 'button', onclick: function () { maisCusto(a.p, desenhar); } }, '+ Custo'))));
      });
      box.appendChild(h('div.tabela-rolagem', h('table.tabela.tabela-fin.tabela-obras', h('thead', h('tr', ['Obra', 'Venda', 'Custo previsto', 'Custo apurado', 'Resultado previsto', 'Resultado apurado', 'Margem', ''].map(function (x, i) {
        return h('th' + (i && i < 7 ? '.num' : ''), x);
      }))), tb, h('tfoot', h('tr', h('td', h('strong', 'Total')), h('td.num', h('strong', U.brl(t.vendido))), h('td.num', h('strong', U.brl(t.custoPrevisto))), h('td.num', h('strong', U.brl(t.custoApurado))),
        h('td.num', h('strong', U.brl(t.resultadoPrevisto))), h('td.num', h('strong', U.brl(t.resultado))), h('td.num', h('strong', U.fmt(t.margem * 100, 1) + '%')), h('td'))))));
    }
    const sel = function (k, opcoes, rotulo) {
      const s = h('select', { 'aria-label': rotulo, onchange: function () { filtro[k] = s.value; guardar(); desenhar(); } }, opcoes.map(function (x) { const op = h('option', { value: x[0] }, x[1]); if (x[0] === filtro[k]) op.selected = true; return op; }));
      return s;
    };
    const aliq = UI.campo({ k: 'aliquota', label: 'Impostos sobre a venda (previsto)', type: 'pct', help: 'Alíquota efetiva (ex.: Simples Nacional). Os impostos realizados vêm dos lançamentos de deduções da obra.' }, cfgFin, function () {
      const c = S.config().financeiro || {};
      S.salvarConfig('financeiro', Object.assign({}, c, { aliquotaImpostos: Math.max(0, U.numOr(cfgFin.aliquota, 0)) }));
      desenhar();
    });
    const detalhar = UI.campo({ k: 'detalhar', label: 'No relatório, incluir a apuração de cada obra', type: 'checkbox' }, filtro, function () { guardar(); });
    cont.appendChild(UI.cabecalho('Resultado por obra', 'Apuração de cada venda a partir da proposta: preço de venda − kit − mão de obra − material CA − outros − comissão − impostos − custos adicionais.', [
      sel('situacao', [['todas', 'Todas as obras'], ['abertas', 'Apuração em andamento'], ['fechadas', 'Apuração fechada']], 'Situação da apuração'),
      sel('periodo', [['tudo', 'Aprovadas: todas'], ['ano', 'Aprovadas neste ano'], ['12m', 'Aprovadas nos últimos 12 meses']], 'Período de aprovação')
    ]));
    cont.appendChild(h('div.barra-relatorio', h('span.barra-relatorio-rot', 'Relatório das obras:'), App.RelFin.botoes('obras', opcoesRel)));
    cont.appendChild(tiles);
    cont.appendChild(h('div.card.obras-config', h('div.obras-config-campos', aliq, detalhar),
      h('p.ajuda-sec', h('strong', 'Como é apurado: '), 'previsto = composição de preço da proposta; realizado = lançamentos a pagar com a obra (pedidos de compra, "+ Custo", comissão lançada…); ',
        'com a apuração em andamento, cada custo entra pelo maior entre previsto e realizado; depois de fechada, pelo realizado. Clique na obra para ver a apuração linha a linha.')));
    cont.appendChild(box);
    desenhar();
  });

  /* ------------------------------------------------------------ comissões */

  UI.rota('/financeiro/comissoes', function (cont) {
    const box = h('div');
    function desenhar() {
      const d = dados();
      const c = F.comissoes(S.list('propostas'), d.lancs, App.Calc.contexto());
      box.innerHTML = '';
      if (!c.vendedores.length) {
        box.appendChild(h('div.card.vazio', h('p', 'Nenhuma venda com vendedor ainda. Informe o vendedor na proposta (Identificação › Vendedor); as propostas novas já saem com quem as criou.')));
        return;
      }
      c.vendedores.forEach(function (v) {
        const tb = h('tbody');
        v.itens.forEach(function (it) {
          tb.appendChild(h('tr', h('td', h('strong', it.p.numero), h('div.mini', it.p.clienteNome || '')), h('td.num', U.brl(it.total)), h('td.num', U.brl(it.comissao)),
            h('td.num', U.fmt(it.fracao * 100, 0) + '%'), h('td.num', U.brl(it.liberada)), h('td.num', U.brl(it.lancada)), h('td.num', U.brl(it.paga)), h('td.num', h('strong', U.brl(it.aLancar)))));
        });
        const lancar = h('button.btn.primario', {
          type: 'button', disabled: !(v.aLancar > 0), onclick: function () {
            const venc = F.somarDias(hoje(), 10);
            let n = 0;
            v.itens.filter(function (it) { return it.aLancar > 0; }).forEach(function (it) {
              S.save('lancamentos', F.novoLancamento('pagar', { descricao: 'Comissão — ' + it.p.numero + ' (' + v.nome + ')', categoriaId: 'cat-com-comissoes', valor: it.aLancar, vencimento: venc,
                competencia: hoje(), pessoa: { tipo: 'vendedor', id: v.email, nome: v.nome }, origem: { tipo: 'comissao', id: it.p.id, numero: it.p.numero }, obraId: it.p.id }));
              n++;
            });
            UI.toast(n + ' comissão(ões) lançada(s) em Contas a pagar para ' + v.nome + '.', 'ok');
            desenhar();
          }
        }, v.aLancar > 0 ? 'Lançar a pagar ' + U.brl(v.aLancar) : 'Nada a lançar');
        box.appendChild(h('section.card',
          h('div.card-topo.sem-borda', h('div', h('h3', v.nome), h('p.dash-sub', v.vendas + (v.vendas === 1 ? ' venda' : ' vendas') + ' · vendido ' + U.brl(v.vendido) + ' · comissão ' + U.brl(v.comissao) +
            ' · liberada ' + U.brl(v.liberada) + ' · paga ' + U.brl(v.paga))), lancar),
          h('div.tabela-rolagem', h('table.tabela.compacta', h('thead', h('tr', ['Venda', 'Valor', 'Comissão', 'Recebido', 'Liberada', 'Lançada', 'Paga', 'A lançar'].map(function (t, i) { return h('th' + (i ? '.num' : ''), t); }))), tb))));
      });
    }
    cont.appendChild(UI.cabecalho('Comissões', 'A comissão de cada venda é liberada na proporção do que o cliente já pagou; lance a pagar o que foi liberado.', [App.RelFin.botoes('comissoes', {})]));
    cont.appendChild(box);
    desenhar();
  });

  /* ------------------------------------------------------------ relatórios */

  UI.rota('/financeiro/relatorios', function (cont) {
    const d = dados();
    const dia = hoje(), iniMes = dia.slice(0, 8) + '01', fimMes = F.somarDias(F.somarMeses(dia.slice(0, 8) + '01', 1), -1), iniAno = dia.slice(0, 4) + '-01-01';
    const anos = {};
    anos[dia.slice(0, 4)] = true;
    d.lancs.forEach(function (l) { [l.competencia, l.pagoEm, l.vencimento].forEach(function (x) { if (x) anos[String(x).slice(0, 4)] = true; }); });
    const filtros = F.FILTROS.map(function (x) { return { v: x.id, t: x.label }; });
    const agrupar = App.RelFin.AGRUPAR.map(function (x) { return { v: x.id, t: x.label }; });
    const regimes = [{ v: 'competencia', t: 'Competência (data da venda/compra)' }, { v: 'caixa', t: 'Caixa (recebimentos e pagamentos)' }];
    const cartao = function (icone, titulo, desc, tipo, campos, estado, fixo, o) {
      const est = estado || {};
      const grade = campos ? UI.grade(campos, est, null, 2) : null;
      return h('section.card.rel-card', { 'data-relatorio': tipo + (fixo && fixo.tipo ? '-' + fixo.tipo : '') },
        h('h3', icone + ' ' + titulo), h('p.ajuda-sec', desc), grade,
        App.RelFin.botoes(tipo, function () { return Object.assign({}, est, fixo || {}); }, Object.assign({ rotulo: '👁 Visualizar' }, o || {})));
    };
    const lancCampos = [
      { k: 'filtro', label: 'Quais', type: 'select', options: filtros, cls: 'span2' },
      { k: 'de', label: 'Vencimento de (no período)', type: 'date' }, { k: 'ate', label: 'até', type: 'date' },
      { k: 'agrupar', label: 'Agrupar por', type: 'select', options: agrupar, cls: 'span2' }
    ];
    cont.appendChild(UI.cabecalho('Relatórios do financeiro', 'Escolha o relatório e os parâmetros: 👁 visualizar, 🖨 imprimir, ⬇ PDF ou ⬇ planilha (CSV, abre no Excel).'));
    cont.appendChild(h('div.rel-grid',
      cartao('📊', 'Resumo financeiro', 'Painel em PDF: saldos, a receber e a pagar, vencidos, fluxo de caixa, DRE do mês e do ano e o resultado das obras.', 'resumo', null, null, null, { semPlanilha: true }),
      cartao('📥', 'Contas a receber', 'Parcelas das vendas e serviços com situação, totais por grupo e gráfico por mês de vencimento.', 'lancamentos', lancCampos, { filtro: 'aberto', de: iniMes, ate: fimMes, agrupar: 'mes' }, { tipo: 'receber' }),
      cartao('📤', 'Contas a pagar', 'Compras, despesas, impostos e comissões com situação, totais por grupo e gráfico por mês de vencimento.', 'lancamentos', lancCampos, { filtro: 'aberto', de: iniMes, ate: fimMes, agrupar: 'mes' }, { tipo: 'pagar' }),
      cartao('⚠️', 'Inadimplência e atrasos', 'Vencidos por cliente (ou fornecedor) nas faixas de 1–30, 31–60, 61–90 e mais de 90 dias, com a lista dos vencidos.', 'atrasos',
        [{ k: 'tipo', label: 'De', type: 'select', options: [{ v: 'receber', t: 'Contas a receber (inadimplência)' }, { v: 'pagar', t: 'Contas a pagar (atrasos)' }], cls: 'span2' }], { tipo: 'receber' }),
      cartao('💹', 'Fluxo de caixa', 'Mês a mês: entradas e saídas realizadas e previstas, resultado e saldo projetado, com gráfico.', 'fluxo',
        [{ k: 'antes', label: 'Meses anteriores', type: 'int' }, { k: 'depois', label: 'Meses seguintes', type: 'int' }], { antes: 3, depois: 6 }),
      cartao('🔄', 'Movimento de caixa', 'Recebimentos e pagamentos realizados no período, com os saldos de cada conta.', 'movimento',
        [{ k: 'de', label: 'De', type: 'date' }, { k: 'ate', label: 'Até', type: 'date' }], { de: iniMes, ate: dia }),
      cartao('🏦', 'Extrato de conta', 'Saldo anterior, movimentos com saldo dia a dia e o que foi conciliado com o banco.', 'extrato',
        [{ k: 'contaId', label: 'Conta', type: 'select', options: opcoesContas(d.contas), cls: 'span2' }, { k: 'de', label: 'De', type: 'date' }, { k: 'ate', label: 'Até', type: 'date' }],
        { contaId: (d.contas[0] || {}).id || '', de: iniMes, ate: dia }),
      cartao('🗂', 'Receitas e despesas por categoria', 'Totais por categoria do plano de contas, com a participação de cada uma e as maiores despesas em gráfico.', 'categorias',
        [{ k: 'de', label: 'De', type: 'date' }, { k: 'ate', label: 'Até', type: 'date' }, { k: 'regime', label: 'Regime', type: 'select', options: regimes, cls: 'span2' }], { de: iniAno, ate: dia, regime: 'competencia' }),
      cartao('📈', 'DRE gerencial', 'Demonstração do resultado mês a mês do ano, com análise vertical e gráfico (página deitada).', 'dre',
        [{ k: 'ano', label: 'Ano', type: 'select', options: Object.keys(anos).sort().reverse() }, { k: 'regime', label: 'Regime', type: 'select', options: regimes }], { ano: dia.slice(0, 4), regime: 'competencia' }),
      cartao('🏗', 'Resultado por obra', 'Venda, custos e resultado previstos × apurados de cada obra; opcionalmente, a apuração completa de cada uma.', 'obras',
        [{ k: 'situacao', label: 'Apuração', type: 'select', options: [{ v: 'todas', t: 'Todas' }, { v: 'abertas', t: 'Em andamento' }, { v: 'fechadas', t: 'Fechadas' }] },
          { k: 'de', label: 'Aprovadas a partir de', type: 'date' }, { k: 'detalhar', label: 'Incluir a apuração de cada obra', type: 'checkbox', cls: 'span2' }], { situacao: 'todas', de: '', detalhar: false }),
      cartao('🤝', 'Comissões', 'Comissão de cada venda por vendedor: liberada pelo recebido, lançada e paga.', 'comissoes', null, null)
    ));
  });

  /* ------------------------------------------------------------ plano de contas */

  UI.rota('/financeiro/categorias', function (cont) {
    UI.crud(cont, {
      colecao: 'categoriasFin', titulo: 'Plano de contas', rotuloNovo: '+ Nova categoria',
      subtitulo: 'Categorias dos lançamentos e a linha da DRE em que cada uma entra.',
      ordenar: function (a, b) {
        const ia = D.GRUPOS_DRE.findIndex(function (g) { return g.id === a.grupo; }), ib = D.GRUPOS_DRE.findIndex(function (g) { return g.id === b.grupo; });
        return (ia - ib) || String(a.nome).localeCompare(String(b.nome), 'pt-BR');
      },
      busca: function (c) { return c.nome + ' ' + grupoLabel(c.grupo); },
      novo: function () { return { nome: '', tipo: 'pagar', grupo: 'despesa_admin', ativo: true }; },
      colunas: [
        { t: 'Categoria', v: function (c) { return h('strong', c.nome); } },
        { t: 'Tipo', v: function (c) { return c.tipo === 'receber' ? UI.badge('Receita', 'ok') : UI.badge('Despesa', 'ambar'); } },
        { t: 'Linha da DRE', v: function (c) { return grupoLabel(c.grupo); } },
        { t: 'Situação', v: function (c) { return c.ativo === false ? UI.badge('Inativa', 'cinza') : UI.badge('Ativa', 'ok'); } }
      ],
      campos: function () {
        return [
          { k: 'nome', label: 'Nome', required: true, cls: 'span2' },
          { k: 'tipo', label: 'Tipo', type: 'select', options: [{ v: 'receber', t: 'Receita (a receber)' }, { v: 'pagar', t: 'Despesa (a pagar)' }] },
          { k: 'grupo', label: 'Linha da DRE', type: 'select', options: D.GRUPOS_DRE.map(function (g) { return { v: g.id, t: g.label }; }) },
          { k: 'ativo', label: 'Ativa', type: 'checkbox' }
        ];
      },
      validar: function (c) { return String(c.nome || '').trim() ? null : 'Informe o nome.'; },
      podeExcluir: function (c) {
        const n = S.list('lancamentos').filter(function (l) { return l.categoriaId === c.id; }).length;
        return n ? 'Categoria usada em ' + n + ' lançamento(s). Desative-a em vez de excluir.' : null;
      }
    });
  });

  /* ------------------------------------------------------------ lançar no financeiro a partir dos documentos */

  const NOMES_DOC = { proposta: 'proposta', contrato: 'contrato', avulsa: 'proposta avulsa', os: 'ordem de serviço', compra: 'pedido de compra' };

  /**
   * Gera as parcelas a receber (proposta, contrato, avulsa, OS) ou a pagar (pedido de compra) do documento: contrato com as parcelas
   * dele (com as datas a definir); os demais com total, entrada, nº de parcelas e vencimentos.
   */
  App.lancarNoFinanceiro = function (tipoDoc, doc, depois) {
    if (!App.Acesso.podeGravar('lancamentos')) { UI.toast('O financeiro é do perfil administrador.', 'erro'); return; }
    const ctx = App.Calc.contexto();
    const d = dados();
    let info;
    try { info = F.baseDe(tipoDoc, doc, ctx); } catch (e) { UI.toast(e.message, 'erro'); return; }
    const base = info.base;
    base.contaId = (d.contas.find(function (c) { return c.ativo !== false; }) || {}).id || '';
    const ja = F.lancadosDe(d.lancs, tipoDoc, doc.id);
    const est = { total: info.total, n: 1, entrada: '', dataEntrada: hoje(), primeiro: F.somarDias(hoje(), tipoDoc === 'compra' ? 28 : 0), intervalo: 'mensal' };
    const linhasContrato = (info.parcelas || []).map(function (p, i) { return { descricao: p.descricao, valor: p.valor, vencimento: F.somarMeses(hoje(), i) }; });
    const corpo = h('div');
    const previa = h('div.previa-parcelas');
    const gerar = function () {
      if (linhasContrato.length) {
        const grupo = 'grp-' + U.uid();
        return linhasContrato.filter(function (p) { return U.num(p.valor) > 0; }).map(function (p, i, arr) {
          return F.novoLancamento(base.tipo, Object.assign(U.clone(base), { valor: U.round(U.num(p.valor), 2), vencimento: p.vencimento, descricao: base.descricao + ' — ' + (p.descricao || 'parcela ' + (i + 1)),
            parcela: { n: i + 1, de: arr.length, grupo: grupo } }));
        });
      }
      return F.gerarParcelas(base, { total: est.total, n: est.n, entrada: est.entrada, dataEntrada: est.dataEntrada, primeiroVencimento: est.primeiro, competencia: base.competencia,
        intervaloDias: est.intervalo === 'mensal' ? 0 : parseInt(est.intervalo, 10) });
    };
    const pintar = function () {
      const l = gerar();
      const soma = l.reduce(function (s, x) { return s + U.numOr(x.valor, 0); }, 0);
      previa.replaceChildren(h('p.ajuda-sec', l.length + (l.length === 1 ? ' lançamento' : ' lançamentos') + ' · ' + U.brl(soma) + ': ' +
        l.slice(0, 6).map(function (x) { return U.dataBR(x.vencimento) + ' ' + U.brl(x.valor); }).join(' · ') + (l.length > 6 ? ' …' : '')));
    };
    corpo.appendChild(h('p.ajuda-sec', 'Documento: ' + NOMES_DOC[tipoDoc] + ' ' + (doc.numero || '') + ' · total ' + U.brl(info.total) + (base.obraId ? ' · ligado à obra (resultado por obra)' : '')));
    if (ja.length) corpo.appendChild(h('p.nota.aviso', 'Este documento já tem ' + ja.length + ' lançamento(s) no financeiro (' + U.brl(ja.reduce(function (s, l) { return s + U.numOr(l.valor, 0); }, 0)) + '). Lançar de novo vai duplicar.'));
    corpo.appendChild(UI.grade([
      { k: 'descricao', label: 'Descrição', cls: 'span2' },
      { k: 'categoriaId', label: 'Categoria', type: 'select', options: opcoesCategorias(d.cats, base.tipo, base.categoriaId), cls: 'span2' },
      { k: 'contaId', label: base.tipo === 'receber' ? 'Conta de recebimento' : 'Conta de pagamento', type: 'select', options: opcoesContas(d.contas, true) },
      { k: 'forma', label: 'Forma', type: 'select', options: [{ v: '', t: '—' }].concat(F.FORMAS.map(function (x) { return { v: x.id, t: x.label }; })) },
      { k: 'competencia', label: 'Competência (mês da DRE)', type: 'date' },
      { k: 'documento', label: 'Documento (NF, boleto)' }
    ], base, pintar, 2));
    if (linhasContrato.length) {
      corpo.appendChild(h('h4.secao-form', 'Parcelas do contrato'));
      corpo.appendChild(UI.editorLinhas(linhasContrato, [
        { k: 'descricao', label: 'Parcela' }, { k: 'valor', label: 'Valor', type: 'money', w: '22%' }, { k: 'vencimento', label: 'Vencimento', type: 'date', w: '22%' }
      ], pintar, '+ Parcela', function () { return { descricao: '', valor: '', vencimento: hoje() }; }));
    } else {
      corpo.appendChild(h('h4.secao-form', 'Parcelas'));
      corpo.appendChild(UI.grade([
        { k: 'total', label: 'Valor total', type: 'money' },
        { k: 'n', label: 'Nº de parcelas', type: 'int' },
        { k: 'primeiro', label: '1º vencimento', type: 'date' },
        { k: 'intervalo', label: 'Intervalo', type: 'select', options: [{ v: 'mensal', t: 'Mensal' }, { v: '7', t: 'A cada 7 dias' }, { v: '15', t: 'A cada 15 dias' }, { v: '30', t: 'A cada 30 dias' }] },
        { k: 'entrada', label: 'Entrada (opcional)', type: 'money' },
        { k: 'dataEntrada', label: 'Data da entrada', type: 'date' }
      ], est, pintar, 3));
    }
    corpo.appendChild(previa);
    pintar();
    UI.modal({
      titulo: (base.tipo === 'receber' ? 'Lançar a receber — ' : 'Lançar a pagar — ') + NOMES_DOC[tipoDoc] + ' ' + (doc.numero || ''), largo: true, corpo: corpo, acoes: [
        { label: 'Cancelar' },
        {
          label: 'Lançar no financeiro', primario: true, onClick: function () {
            if (!base.categoriaId) { UI.toast('Escolha a categoria.', 'erro'); return false; }
            const lista = gerar();
            if (!lista.length) { UI.toast('Informe o valor.', 'erro'); return false; }
            lista.forEach(function (x) { S.save('lancamentos', x); });
            UI.toast(lista.length + ' lançamento(s) em ' + (base.tipo === 'receber' ? 'Contas a receber' : 'Contas a pagar') + '.', 'ok');
            if (depois) depois();
          }
        }
      ]
    });
  };

  /** Botão 💰 das listas e formulários (só para quem acessa o financeiro). */
  App.botaoFinanceiro = function (tipoDoc, doc, depois, grande) {
    if (!App.Acesso.podeGravar('lancamentos')) return null;
    const ja = F.lancadosDe(S.list('lancamentos'), tipoDoc, doc.id).length;
    const titulo = ja ? 'Já lançado no financeiro (' + ja + ') — lançar de novo' : 'Lançar no financeiro';
    if (grande) return h('button.btn', { type: 'button', title: titulo, onclick: function () { App.lancarNoFinanceiro(tipoDoc, doc, depois); } }, ja ? '💰 Lançado no financeiro ✓' : '💰 Lançar no financeiro');
    return h('button.btn-formato.financeiro' + (ja ? '.lancado' : ''), { type: 'button', title: titulo, 'aria-label': titulo, onclick: function () { App.lancarNoFinanceiro(tipoDoc, doc, depois); } }, '💰');
  };

  App.abrirLancamento = abrirLancamento;
})(window.App);
