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

  function tabela(lista, recarregar) {
    const tb = h('tbody');
    lista.forEach(function (p) {
      const rs = resumoProposta(p);
      const btnPdf = h('button.btn-formato.pdf', { type: 'button', title: 'Baixar proposta em PDF', onclick: function () { baixar(p, 'pdf', btnPdf); } }, 'PDF');
      const btnDocx = h('button.btn-formato', { type: 'button', title: 'Baixar proposta em Word (.docx)', onclick: function () { baixar(p, 'docx', btnDocx); } }, 'DOCX');
      const sel = h('select.status-sel', { 'aria-label': 'Situação', onchange: function () { App.Crm.mudarStatus(p, sel.value); S.save('propostas', p); UI.toast('Situação atualizada.'); recarregar(); } },
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

  // tabela reaproveitada no dashboard (propostas recentes)
  App.tabelaPropostas = tabela;

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
