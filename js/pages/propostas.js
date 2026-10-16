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

  async function baixarDocx(p, botao) {
    if (botao) { botao.disabled = true; botao.textContent = '…'; }
    try {
      const g = await App.Docx.gerar(p, C.contexto());
      U.download(g.blob, g.nome);
      UI.toast('Proposta gerada: ' + g.nome, 'ok');
    } catch (e) {
      console.error(e);
      UI.toast('Falha ao gerar: ' + e.message, 'erro');
    } finally {
      if (botao) { botao.disabled = false; botao.textContent = '⬇'; }
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
      h('a.btn', { href: '#/proposta/nova?tipo=hibrido' }, '+ Proposta híbrida'),
      h('a.btn.primario', { href: '#/proposta/nova' }, '+ Nova proposta On-Grid')
    ]));

    cont.appendChild(h('div.grade-kpi',
      h('div.card.kpi-card', h('span', 'Propostas'), h('strong', String(props.length)), h('small', abertas.length + ' em aberto')),
      h('div.card.kpi-card', h('span', 'Valor em aberto'), h('strong', U.brl(soma(abertas, 'total'))), h('small', U.kwp(soma(abertas, 'kwp')) + ' kWp')),
      h('div.card.kpi-card.ok', h('span', 'Aprovadas'), h('strong', U.brl(soma(aprovadas, 'total'))), h('small', aprovadas.length + ' proposta(s) · ' + U.kwp(soma(aprovadas, 'kwp')) + ' kWp')),
      h('div.card.kpi-card', h('span', 'Clientes'), h('strong', String(S.list('clientes').length)), h('small', h('a', { href: '#/clientes' }, 'Ver cadastro')))));

    const avisos = [];
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

  function tabela(lista, recarregar) {
    const tb = h('tbody');
    lista.forEach(function (p) {
      const rs = resumoProposta(p);
      const btnDocx = h('button.btn-icone', { type: 'button', title: 'Gerar .docx', 'aria-label': 'Gerar .docx', onclick: function () { baixarDocx(p, btnDocx); } }, '⬇');
      const sel = h('select.status-sel', { 'aria-label': 'Situação', onchange: function () { p.status = sel.value; S.save('propostas', p); UI.toast('Situação atualizada.'); recarregar(); } },
        D.STATUS.map(function (s) { const o = h('option', { value: s.id }, s.label); if (s.id === p.status) o.selected = true; return o; }));
      tb.appendChild(h('tr', { onclick: function (e) { if (!e.target.closest('button,select')) UI.ir('#/proposta/' + p.id); } },
        h('td', h('strong', p.numero), h('div.mini', U.dataBR(p.data))),
        h('td', p.clienteNome || '—', h('div.mini', rs.cidade || '')),
        h('td', p.tipoSistema === 'hibrido' ? UI.badge('Híbrido', 'roxo') : UI.badge('On-Grid', 'azul')),
        h('td.num', rs.kwp ? U.kwp(rs.kwp) + ' kWp' : '—', rs.kwh ? h('div.mini', U.fmtSmart(rs.kwh, 2) + ' kWh') : null),
        h('td.num', rs.total ? U.brl(rs.total) : '—'),
        h('td', statusBadge(p.status), sel),
        h('td.acoes-col',
          btnDocx,
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
      h('option', { value: '' }, 'On-Grid e Híbrido'), h('option', { value: 'ongrid' }, 'On-Grid'), h('option', { value: 'hibrido' }, 'Híbrido'));
    cont.appendChild(UI.cabecalho('Propostas', 'Clique em uma proposta para editar. ⬇ gera o .docx, ⧉ duplica.', [
      busca, selStatus, selTipo, h('a.btn.primario', { href: '#/proposta/nova' }, '+ Nova proposta')
    ]));
    cont.appendChild(box);
    desenhar();
  });
})(window.App);
