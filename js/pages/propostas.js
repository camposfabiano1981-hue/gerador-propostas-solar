/* Painel inicial e lista de propostas. */
(function (App) {
  'use strict';

  const U = App.U, UI = App.UI, S = App.Store, D = App.DEFAULTS, C = App.Calc;
  const h = U.h;

  const COR_STATUS = { rascunho: 'cinza', enviada: 'azul', negociacao: 'ambar', aprovada: 'ok', recusada: 'erro' };

  function statusBadge(s) {
    const st = D.STATUS.find(function (x) { return x.id === s; }) || D.STATUS[0];
    return UI.badge(st.label, COR_STATUS[st.id]);
  }

  function resumoProposta(p) {
    return p.resumo || {};
  }

  async function baixar(p, formato, botao) {
    const rotulo = botao ? botao.textContent : '';
    if (botao) { botao.disabled = true; botao.textContent = '…'; }
    try {
      const g = formato === 'pdf' ? await App.Pdf.gerar(p, C.contexto()) : await App.Docx.gerar(p, C.contexto());
      U.download(g.blob, g.nome);
      UI.toast('Proposta gerada: ' + g.nome, 'ok');
    } catch (e) {
      console.error(e);
      UI.toast('Falha ao gerar: ' + e.message, 'erro');
    } finally {
      if (botao) { botao.disabled = false; botao.textContent = rotulo; }
    }
  }

  function duplicar(p) {
    const n = S.proximoNumero(U.todayISO());
    const copia = U.clone(p);
    copia.id = null;
    copia.criadoEm = null;
    copia.numero = n.numero;
    copia.data = U.todayISO();
    copia.status = 'rascunho';
    S.save('propostas', copia);
    S.reservarNumero(n.dia, n.seq);
    UI.toast('Proposta duplicada como ' + copia.numero + '.', 'ok');
    UI.ir('#/proposta/' + copia.id);
  }

  /* ------------------------------------------------------------ painel */

  UI.rota('/painel', function (cont) {
    const props = S.list('propostas');
    const emp = S.config().empresa;
    const abertas = props.filter(function (p) { return ['rascunho', 'enviada', 'negociacao'].indexOf(p.status) >= 0; });
    const aprovadas = props.filter(function (p) { return p.status === 'aprovada'; });
    const soma = function (l, k) { return l.reduce(function (s, p) { return s + U.numOr(resumoProposta(p)[k], 0); }, 0); };
    const semPreco = S.list('equipamentos').filter(function (e) { return e.ativo !== false && ['modulo', 'inversor', 'hibrido', 'bateria'].indexOf(e.tipo) >= 0 && !(U.num(e.preco) > 0); }).length;

    cont.appendChild(UI.cabecalho('Painel', emp.razao, [
      h('a.btn', { href: '#/avulsa/nova' }, '+ Proposta de serviços'),
      h('a.btn', { href: '#/proposta/nova?tipo=bess' }, '+ BESS'),
      h('a.btn', { href: '#/proposta/nova?tipo=hibrido' }, '+ Proposta híbrida'),
      h('a.btn.primario', { href: '#/proposta/nova' }, '+ Nova proposta On-Grid')
    ]));

    cont.appendChild(h('div.grade-kpi',
      h('div.card.kpi-card', h('span', 'Propostas'), h('strong', String(props.length)), h('small', abertas.length + ' em aberto')),
      h('div.card.kpi-card', h('span', 'Valor em aberto'), h('strong', U.brl(soma(abertas, 'total'))), h('small', U.kwp(soma(abertas, 'kwp')) + ' kWp')),
      h('div.card.kpi-card.ok', h('span', 'Aprovadas'), h('strong', U.brl(soma(aprovadas, 'total'))), h('small', aprovadas.length + ' proposta(s) · ' + U.kwp(soma(aprovadas, 'kwp')) + ' kWp')),
      h('div.card.kpi-card', h('span', 'Clientes'), h('strong', String(S.list('clientes').length)), h('small', h('a', { href: '#/clientes' }, 'Ver cadastro'))),
      cartaoInstalacoes(), cartaoOrdens()));

    const avisos = [];
    const semInstalacao = App.aprovadasSemInstalacao ? App.aprovadasSemInstalacao() : [];
    if (semInstalacao.length) avisos.push(h('li', semInstalacao.length === 1 ? '1 proposta aprovada ainda sem instalação. ' : semInstalacao.length + ' propostas aprovadas ainda sem instalação. ',
      h('a', { href: '#/instalacoes' }, 'Iniciar em Instalações'), '.'));
    if (semPreco) avisos.push(h('li', semPreco + ' equipamento(s) principal(is) sem preço. ', h('a', { href: '#/equipamentos' }, 'Cadastrar preços'), ' para o kit ser somado automaticamente.'));
    if (props.length) avisos.push(h('li', 'Os dados ficam neste navegador — ', h('a', { href: '#/dados' }, 'faça backup'), ' periodicamente.'));
    if (!S.list('clientes').length) avisos.push(h('li', 'Comece cadastrando um ', h('a', { href: '#/clientes' }, 'cliente'), ' ou crie a proposta e cadastre o cliente por lá.'));
    if (avisos.length) cont.appendChild(h('div.card.dica', h('ul', avisos)));

    const recentes = props.slice().sort(function (a, b) { return String(b.atualizadoEm).localeCompare(String(a.atualizadoEm)); }).slice(0, 8);
    const box = h('div.card.sem-pad', h('div.card-topo', h('h3', 'Propostas recentes'), h('a', { href: '#/propostas' }, 'Ver todas →')));
    if (!recentes.length) {
      box.appendChild(h('div.vazio', h('p', 'Nenhuma proposta ainda.'), h('a.btn.primario', { href: '#/proposta/nova' }, 'Criar a primeira proposta')));
    } else {
      box.appendChild(tabela(recentes, function () { UI.despachar(true); }));
    }
    cont.appendChild(box);
  });

  /** Cartão do painel: obras em andamento, atrasadas e a iniciar. */
  function cartaoInstalacoes() {
    const I = App.Instalacao;
    if (!I) return null;
    const lista = S.list('instalacoes');
    const hoje = U.todayISO();
    const andamento = lista.filter(function (x) { return I.status(x) === 'andamento'; });
    const iniciar = lista.filter(function (x) { return I.status(x) === 'iniciar'; }).length;
    const atrasadas = andamento.filter(function (x) { return I.atrasadas(x, hoje).length; }).length;
    return h('div.card.kpi-card' + (atrasadas ? '.alerta' : ''), h('span', 'Instalações em andamento'), h('strong', String(andamento.length)),
      h('small', h('a', { href: '#/instalacoes' }, [atrasadas ? atrasadas + ' com etapa atrasada' : '', iniciar ? iniciar + ' a iniciar' : '', 'ver todas'].filter(Boolean).join(' · '))));
  }

  /** Cartão do painel: ordens de serviço em aberto, atrasadas e urgentes. */
  function cartaoOrdens() {
    const O = App.Ordem;
    if (!O) return null;
    const hoje = U.todayISO();
    const abertas = S.list('ordens').filter(O.aberta);
    if (!abertas.length && !S.list('ordens').length) return null;
    const atrasadas = abertas.filter(function (o) { return O.atrasada(o, hoje); }).length;
    const urgentes = abertas.filter(function (o) { return o.prioridade === 'urgente'; }).length;
    return h('div.card.kpi-card' + (atrasadas || urgentes ? '.alerta' : ''), h('span', 'Ordens de serviço em aberto'), h('strong', String(abertas.length)),
      h('small', h('a', { href: '#/ordens' }, [atrasadas ? atrasadas + ' atrasada(s)' : '', urgentes ? urgentes + ' urgente(s)' : '', 'ver todas'].filter(Boolean).join(' · '))));
  }

  function tabela(lista, recarregar) {
    const tb = h('tbody');
    lista.forEach(function (p) {
      const rs = resumoProposta(p);
      const btnPdf = h('button.btn-formato.pdf', { type: 'button', title: 'Baixar proposta em PDF', onclick: function () { baixar(p, 'pdf', btnPdf); } }, 'PDF');
      const btnDocx = h('button.btn-formato', { type: 'button', title: 'Baixar proposta em Word (.docx)', onclick: function () { baixar(p, 'docx', btnDocx); } }, 'DOCX');
      const sel = h('select.status-sel', { 'aria-label': 'Situação', onchange: function () { p.status = sel.value; S.save('propostas', p); UI.toast('Situação atualizada.'); recarregar(); } },
        D.STATUS.map(function (s) { const o = h('option', { value: s.id }, s.label); if (s.id === p.status) o.selected = true; return o; }));
      tb.appendChild(h('tr', { onclick: function (e) { if (!e.target.closest('button,select')) UI.ir('#/proposta/' + p.id); } },
        h('td', h('strong', p.numero), h('div.mini', U.dataBR(p.data))),
        h('td', p.clienteNome || '—', h('div.mini', rs.cidade || '')),
        h('td', p.tipoSistema === 'hibrido' ? UI.badge('Híbrido', 'roxo') : (p.tipoSistema === 'bess' ? UI.badge('BESS', 'ambar') : UI.badge('On-Grid', 'azul')),
          rs.cenario ? h('div.mini', rs.cenario) : null),
        h('td.num', rs.kwp ? U.kwp(rs.kwp) + ' kWp' : '—', rs.kwh ? h('div.mini', U.fmtSmart(rs.kwh, 2) + ' kWh') : null),
        h('td.num', rs.total ? U.brl(rs.total) : '—'),
        h('td', statusBadge(p.status), sel),
        h('td.acoes-col',
          btnPdf,
          btnDocx,
          h('button.btn-icone', { type: 'button', title: 'Gerar contrato', 'aria-label': 'Gerar contrato', onclick: function () { UI.ir('#/contrato/novo?proposta=' + p.id); } }, '✍'),
          App.abrirInstalacao ? h('button.btn-icone', {
            type: 'button', title: App.instalacaoDaProposta(p.id) ? 'Abrir a instalação' : 'Iniciar a instalação', 'aria-label': 'Instalação',
            onclick: function () { App.abrirInstalacao(p); }
          }, '🏗') : null,
          h('button.btn-icone', { type: 'button', title: 'Duplicar', 'aria-label': 'Duplicar', onclick: function () { duplicar(p); } }, '⧉'),
          h('button.btn-icone.perigo', {
            type: 'button', title: 'Excluir', 'aria-label': 'Excluir', onclick: async function () {
              if (await UI.confirmar('Excluir a proposta ' + p.numero + '?', 'Excluir', true)) {
                S.remove('propostas', p.id);
                UI.toast('Proposta excluída.');
                recarregar();
              }
            }
          }, '🗑'))));
    });
    return h('div.tabela-rolagem', h('table.tabela.propostas',
      h('thead', h('tr', ['Nº / data', 'Cliente', 'Tipo', 'Potência', 'Valor', 'Situação', ''].map(function (t, i) { return h('th' + (i === 3 || i === 4 ? '.num' : ''), t); }))),
      tb));
  }

  /* ------------------------------------------------------------ lista */

  UI.rota('/propostas', function (cont) {
    const filtro = { q: '', status: '', tipo: '' };
    const box = h('div.card.sem-pad');
    function desenhar() {
      let lista = S.list('propostas');
      const q = filtro.q.trim().toLowerCase();
      if (q) lista = lista.filter(function (p) { return [p.numero, p.clienteNome, (p.resumo || {}).cidade].join(' ').toLowerCase().indexOf(q) >= 0; });
      if (filtro.status) lista = lista.filter(function (p) { return p.status === filtro.status; });
      if (filtro.tipo) lista = lista.filter(function (p) { return p.tipoSistema === filtro.tipo; });
      lista.sort(function (a, b) { return String(b.numero).localeCompare(String(a.numero)); });
      box.innerHTML = '';
      if (!lista.length) {
        box.appendChild(h('div.vazio', h('p', S.list('propostas').length ? 'Nenhuma proposta encontrada com esses filtros.' : 'Nenhuma proposta cadastrada.'),
          h('a.btn.primario', { href: '#/proposta/nova' }, '+ Nova proposta')));
        return;
      }
      box.appendChild(tabela(lista, desenhar));
    }
    const busca = h('input.busca', { type: 'search', placeholder: 'Nº, cliente ou cidade…', oninput: function () { filtro.q = busca.value; desenhar(); } });
    const selStatus = h('select', { 'aria-label': 'Filtrar por situação', onchange: function () { filtro.status = selStatus.value; desenhar(); } },
      h('option', { value: '' }, 'Todas as situações'), D.STATUS.map(function (s) { return h('option', { value: s.id }, s.label); }));
    const selTipo = h('select', { 'aria-label': 'Filtrar por tipo', onchange: function () { filtro.tipo = selTipo.value; desenhar(); } },
      h('option', { value: '' }, 'Todos os tipos'), h('option', { value: 'ongrid' }, 'On-Grid'), h('option', { value: 'hibrido' }, 'Híbrido'), h('option', { value: 'bess' }, 'BESS'));
    cont.appendChild(UI.cabecalho('Propostas', 'Clique em uma proposta para editar. PDF / DOCX baixam a proposta, ✍ gera o contrato, 🏗 abre a instalação, ⧉ duplica.', [
      busca, selStatus, selTipo, h('a.btn.primario', { href: '#/proposta/nova' }, '+ Nova proposta')
    ]));
    cont.appendChild(box);
    desenhar();
  });
})(window.App);
