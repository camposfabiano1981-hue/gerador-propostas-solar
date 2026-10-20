/* Propostas avulsas (serviços complementares à energia solar) e catálogo de serviços. */
(function (App) {
  'use strict';

  const U = App.U, UI = App.UI, S = App.Store, D = App.DEFAULTS, C = App.Calc, A = App.Avulsa;
  const h = U.h;

  const COR_STATUS = { rascunho: 'cinza', enviada: 'azul', negociacao: 'ambar', aprovada: 'ok', recusada: 'erro' };

  function statusBadge(s) {
    const st = D.STATUS.find(function (x) { return x.id === s; }) || D.STATUS[0];
    return UI.badge(st.label, COR_STATUS[st.id]);
  }

  async function baixar(a, formato, botao) {
    const rotulo = botao ? botao.textContent : '';
    if (botao) { botao.disabled = true; botao.textContent = '…'; }
    try {
      const ctx = C.contexto();
      const g = formato === 'pdf' ? await A.gerarPdf(a, ctx) : await A.gerarDocx(a, ctx);
      U.download(g.blob, g.nome);
      UI.toast('Proposta gerada: ' + g.nome, 'ok');
    } catch (e) {
      console.error(e);
      UI.toast('Falha ao gerar: ' + e.message, 'erro');
    } finally {
      if (botao) { botao.disabled = false; botao.textContent = rotulo; }
    }
  }

  /* ------------------------------------------------------------ catálogo de serviços */

  UI.rota('/servicos', function (cont) {
    UI.crud(cont, {
      colecao: 'servicos',
      titulo: 'Serviços',
      subtitulo: 'Catálogo de serviços complementares usado nas propostas avulsas.',
      rotuloNovo: '+ Novo serviço',
      vazio: 'Nenhum serviço cadastrado.',
      novo: function () { return { descricao: '', categoria: D.CATEGORIAS_SERVICO[0], unidade: 'vb', preco: 0, prazo: '', garantia: '', detalhes: '', ativo: true }; },
      ordenar: function (a, b) { return String(a.categoria).localeCompare(String(b.categoria), 'pt-BR') || String(a.descricao).localeCompare(String(b.descricao), 'pt-BR'); },
      busca: function (s) { return [s.descricao, s.categoria, s.detalhes].join(' '); },
      colunas: [
        { t: 'Serviço', v: function (s) { return h('strong', s.descricao); } },
        { t: 'Categoria', v: function (s) { return s.categoria; } },
        { t: 'Unidade', v: function (s) { return s.unidade; } },
        { t: 'Preço', cls: 'num', v: function (s) { return U.num(s.preco) > 0 ? U.brl(U.num(s.preco)) : UI.badge('Sem preço', 'ambar'); } },
        { t: 'Situação', v: function (s) { return s.ativo === false ? UI.badge('Inativo', 'cinza') : UI.badge('Ativo', 'ok'); } }
      ],
      validar: function (s) { return String(s.descricao || '').trim() ? null : 'Informe a descrição do serviço.'; },
      campos: function () {
        return [
          { k: 'descricao', label: 'Descrição', required: true, cls: 'span2' },
          { k: 'categoria', label: 'Categoria', type: 'select', options: D.CATEGORIAS_SERVICO },
          { k: 'unidade', label: 'Unidade', type: 'select', options: D.UNIDADES_SERVICO },
          { k: 'preco', label: 'Preço unitário', type: 'money' },
          { k: 'prazo', label: 'Prazo típico' },
          { k: 'detalhes', label: 'Escopo / detalhes (aparece na proposta)', type: 'textarea', cls: 'span2' },
          { k: 'ativo', label: 'Ativo', type: 'checkbox' }
        ];
      }
    });
  });

  /* ------------------------------------------------------------ lista */

  function tabela(lista, recarregar) {
    const ctx = C.contexto();
    const tb = h('tbody');
    lista.forEach(function (a) {
      const r = A.calcular(a, ctx);
      const btnPdf = h('button.btn-formato.pdf', { type: 'button', title: 'Baixar em PDF', onclick: function () { baixar(a, 'pdf', btnPdf); } }, 'PDF');
      const btnDocx = h('button.btn-formato', { type: 'button', title: 'Baixar em Word (.docx)', onclick: function () { baixar(a, 'docx', btnDocx); } }, 'DOCX');
      const sel = h('select.status-sel', { 'aria-label': 'Situação', onchange: function () { a.status = sel.value; S.save('avulsas', a); UI.toast('Situação atualizada.'); recarregar(); } },
        D.STATUS.map(function (s) { const o = h('option', { value: s.id }, s.label); if (s.id === a.status) o.selected = true; return o; }));
      tb.appendChild(h('tr', { onclick: function (e) { if (!e.target.closest('button,select')) UI.ir('#/avulsa/' + a.id); } },
        h('td', h('strong', a.numero), h('div.mini', U.dataBR(a.data))),
        h('td', a.clienteNome || '—'),
        h('td', h('div.texto-curto', (a.itens || []).map(function (i) { return i.descricao; }).join(', ') || '—')),
        h('td.num', U.brl(r.total)),
        h('td', statusBadge(a.status), sel),
        h('td.acoes-col', btnPdf, btnDocx,
          h('button.btn-icone.perigo', {
            type: 'button', title: 'Excluir', 'aria-label': 'Excluir', onclick: async function () {
              if (await UI.confirmar('Excluir a proposta ' + a.numero + '?', 'Excluir', true)) {
                S.remove('avulsas', a.id);
                UI.toast('Proposta excluída.');
                recarregar();
              }
            }
          }, '🗑'))));
    });
    return h('div.tabela-rolagem', h('table.tabela.propostas',
      h('thead', h('tr', ['Nº / data', 'Cliente', 'Serviços', 'Valor', 'Situação', ''].map(function (t, i) { return h('th' + (i === 3 ? '.num' : ''), t); }))),
      tb));
  }

  UI.rota('/avulsas', function (cont) {
    const filtro = { q: '', status: '' };
    const box = h('div.card.sem-pad');
    function desenhar() {
      let lista = S.list('avulsas');
      const q = filtro.q.trim().toLowerCase();
      if (q) lista = lista.filter(function (a) { return [a.numero, a.clienteNome, (a.itens || []).map(function (i) { return i.descricao; }).join(' ')].join(' ').toLowerCase().indexOf(q) >= 0; });
      if (filtro.status) lista = lista.filter(function (a) { return a.status === filtro.status; });
      lista.sort(function (a, b) { return String(b.numero).localeCompare(String(a.numero)); });
      box.innerHTML = '';
      if (!lista.length) {
        box.appendChild(h('div.vazio', h('p', S.list('avulsas').length ? 'Nenhuma proposta encontrada com esses filtros.' : 'Nenhuma proposta de serviços ainda.'),
          h('a.btn.primario', { href: '#/avulsa/nova' }, '+ Nova proposta de serviços')));
        return;
      }
      box.appendChild(tabela(lista, desenhar));
    }
    const busca = h('input.busca', { type: 'search', placeholder: 'Nº, cliente ou serviço…', oninput: function () { filtro.q = busca.value; desenhar(); } });
    const selStatus = h('select', { 'aria-label': 'Filtrar por situação', onchange: function () { filtro.status = selStatus.value; desenhar(); } },
      h('option', { value: '' }, 'Todas as situações'), D.STATUS.map(function (s) { return h('option', { value: s.id }, s.label); }));
    cont.appendChild(UI.cabecalho('Propostas avulsas', 'Serviços complementares (manutenção, limpeza, laudos, projetos…). Mesma numeração das propostas solares.', [
      busca, selStatus, h('a.btn', { href: '#/servicos' }, 'Catálogo de serviços'), h('a.btn.primario', { href: '#/avulsa/nova' }, '+ Nova proposta de serviços')
    ]));
    cont.appendChild(box);
    desenhar();
  });

  /* ------------------------------------------------------------ formulário */

  UI.rota('/avulsa/nova', function (cont, params, qs) { formulario(cont, null, qs); });
  UI.rota('/avulsa/:id', function (cont, params) { formulario(cont, params.id); });

  function formulario(cont, id, qs) {
    const ctx = C.contexto();
    let a;
    if (id) {
      const salvo = S.get('avulsas', id);
      if (!salvo) { UI.toast('Proposta não encontrada.', 'erro'); UI.ir('#/avulsas'); return; }
      a = U.clone(salvo);
      const base = A.novo(ctx);
      Object.keys(base).forEach(function (k) { if (a[k] === undefined && k !== '_seq' && k !== 'numero') a[k] = U.clone(base[k]); });
    } else {
      a = A.novo(ctx);
      if (qs && qs.get('cliente')) a.clienteId = qs.get('cliente');
    }
    let sujo = !id;
    const inicial = id ? null : JSON.stringify(a);
    const alterada = function () { return sujo && (a.id || JSON.stringify(a) !== inicial); };
    UI.guarda = function () { return !alterada() || confirm('A proposta tem alterações não salvas. Deseja sair mesmo assim?'); };
    window.onbeforeunload = function (e) { if (alterada() && document.body.contains(cont.firstChild)) { e.preventDefault(); e.returnValue = ''; } };

    const btnSalvar = h('button.btn', { type: 'button', onclick: function () { salvar(true); } }, 'Salvar');
    const btnPdf = h('button.btn.primario', { type: 'button', onclick: function () { gerar('pdf'); } }, '⬇ Proposta em PDF');
    const btnDocx = h('button.btn', { type: 'button', onclick: function () { gerar('docx'); } }, '⬇ Word (.docx)');
    const titulo = h('h1', id ? 'Proposta ' + a.numero : 'Nova proposta de serviços');
    cont.appendChild(h('div.pagina-topo', h('div', titulo, h('p.sub', 'Serviços complementares à energia solar.')), h('div.acoes', btnSalvar, btnDocx, btnPdf)));

    const colForm = h('div.form-col');
    const nav = h('nav.passos');
    const resumo = h('aside.resumo-col');
    cont.appendChild(h('div.form-layout', h('div', nav, colForm), resumo));
    const secoes = {};
    function secao(chave, tituloSec, construir) {
      const corpo = h('div.secao-corpo');
      const el = h('section.card.secao#sec-' + chave, h('h2', tituloSec), corpo);
      secoes[chave] = { el: el, corpo: corpo, construir: construir };
      colForm.appendChild(el);
      nav.appendChild(h('a', { href: 'javascript:void 0', onclick: function () { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, tituloSec));
    }
    function desenhar(chave) { const s = secoes[chave]; s.corpo.innerHTML = ''; s.construir(s.corpo); }
    const mudou = function () { sujo = true; atualizarTotais(); atualizarResumo(); };

    secao('ident', 'Identificação', function (c) {
      c.appendChild(UI.grade([
        { k: 'numero', label: 'Nº da proposta', readonly: true, help: a.id ? 'Gerado automaticamente.' : 'Automático — confirmado ao salvar.' },
        { k: 'data', label: 'Data de emissão', type: 'date' },
        { k: 'validadeDias', label: 'Validade', type: 'int', suffix: 'dias' },
        { k: 'status', label: 'Situação', type: 'select', options: D.STATUS.map(function (s) { return { v: s.id, t: s.label }; }) },
        { k: 'titulo', label: 'Título (capa)', cls: 'span2' }
      ], a, function (k) {
        if (k === 'data' && !a.id) { const n = S.proximoNumero(a.data); a.numero = n.numero; a._seq = n; desenhar('ident'); }
        mudou();
      }, 3));
    });

    secao('cliente', 'Cliente', function (c) {
      const opts = [{ v: '', t: '— selecione —' }].concat(ctx.clientes.slice().sort(function (x, y) { return String(x.nome).localeCompare(String(y.nome), 'pt-BR'); })
        .map(function (x) { return { v: x.id, t: x.nome + (x.cidade ? ' — ' + x.cidade : '') }; }));
      c.appendChild(h('div.linha-campo',
        UI.campo({ k: 'clienteId', label: 'Cliente', type: 'select', options: opts, required: true, cls: 'cresce' }, a, mudou),
        h('a.btn', { href: '#/clientes' }, 'Cadastro de clientes')));
      c.appendChild(UI.campo({ k: 'localExecucao', label: 'Local de execução (se diferente do endereço do cliente)' }, a, mudou));
    });

    const totaisEl = h('div.avulsa-totais');
    function atualizarTotais() {
      const r = A.calcular(a, ctx);
      totaisEl.innerHTML = '';
      totaisEl.appendChild(h('span', 'Subtotal: ', h('strong', U.brl(r.subtotal))));
      if (r.desconto > 0) totaisEl.appendChild(h('span', 'Desconto: ', h('strong', '- ' + U.brl(r.desconto))));
      totaisEl.appendChild(h('span', 'Total: ', h('strong', U.brl(r.total))));
    }

    secao('servicos', 'Serviços', function (c) {
      const tb = h('tbody');
      a.itens.forEach(function (it, i) {
        const sub = h('td.num');
        const atual = function () { sub.textContent = U.brl(U.numOr(it.qtd, 0) * U.numOr(it.precoUnit, 0)); mudou(); };
        tb.appendChild(h('tr',
          h('td.num', String(i + 1)),
          h('td', { style: { minWidth: '260px' } }, UI.campo({ k: 'descricao' }, it, atual), UI.campo({ k: 'detalhes', type: 'textarea', rows: 2, placeholder: 'Escopo / detalhes (opcional)' }, it, atual)),
          h('td', { style: { width: '80px' } }, UI.campo({ k: 'qtd', type: 'number' }, it, atual)),
          h('td', { style: { width: '84px' } }, UI.campo({ k: 'unidade', type: 'select', options: D.UNIDADES_SERVICO.indexOf(it.unidade) >= 0 || !it.unidade ? D.UNIDADES_SERVICO : D.UNIDADES_SERVICO.concat([it.unidade]) }, it, atual)),
          h('td', { style: { width: '130px' } }, UI.campo({ k: 'precoUnit', type: 'money' }, it, atual)),
          sub,
          h('td.acoes-col', h('button.btn-icone.perigo', { type: 'button', title: 'Remover', 'aria-label': 'Remover serviço', onclick: function () { a.itens.splice(i, 1); mudou(); desenhar('servicos'); } }, '×'))));
        sub.textContent = U.brl(U.numOr(it.qtd, 0) * U.numOr(it.precoUnit, 0));
      });
      if (a.itens.length) {
        c.appendChild(h('div.tabela-rolagem', h('table.tabela.editavel.itens',
          h('thead', h('tr', ['#', 'Serviço', 'Qtd.', 'Un.', 'Preço unit.', 'Subtotal', ''].map(function (t) { return h('th', t); }))), tb)));
      } else {
        c.appendChild(h('div.nota', 'Adicione serviços do catálogo ou um item avulso.'));
      }
      const servs = S.list('servicos').filter(function (s) { return s.ativo !== false; });
      const selAdd = h('select', h('option', { value: '' }, '+ Adicionar serviço do catálogo…'));
      D.CATEGORIAS_SERVICO.concat(['']).forEach(function (cat) {
        const doGrupo = servs.filter(function (s) { return cat ? s.categoria === cat : D.CATEGORIAS_SERVICO.indexOf(s.categoria) < 0; });
        if (!doGrupo.length) return;
        const og = h('optgroup', { label: cat || 'Outros' });
        doGrupo.forEach(function (s) { og.appendChild(h('option', { value: s.id }, s.descricao + (U.num(s.preco) > 0 ? ' — ' + U.brl(U.num(s.preco)) + '/' + s.unidade : ''))); });
        selAdd.appendChild(og);
      });
      selAdd.addEventListener('change', function () {
        const s = servs.find(function (x) { return x.id === selAdd.value; });
        if (!s) return;
        a.itens.push(A.itemDeServico(s));
        mudou();
        desenhar('servicos');
      });
      c.appendChild(h('div.barra-itens', selAdd,
        h('button.btn.pequeno', { type: 'button', onclick: function () { a.itens.push({ id: U.uid(), servicoId: null, descricao: 'Novo serviço', detalhes: '', qtd: 1, unidade: 'vb', precoUnit: 0 }); mudou(); desenhar('servicos'); } }, '+ Item avulso'),
        h('a.btn.pequeno', { href: '#/servicos' }, 'Gerenciar catálogo')));
      c.appendChild(UI.grade([{ k: 'desconto', label: 'Desconto', type: 'money' }], a, mudou, 3));
      c.appendChild(totaisEl);
      atualizarTotais();
    });

    secao('condicoes', 'Prazo, garantia e pagamento', function (c) {
      c.appendChild(UI.grade([
        { k: 'prazo', label: 'Prazo de execução' },
        { k: 'garantia', label: 'Garantia dos serviços', type: 'textarea', cls: 'span2' },
        { k: 'observacoes', label: 'Observações', type: 'textarea', cls: 'span2' }
      ], a, mudou, 2));
      const lista = h('div.lista-pagamentos');
      ctx.pagamentos.filter(function (pg) { return pg.ativo !== false; }).forEach(function (pg) {
        const cb = h('input', { type: 'checkbox' });
        cb.checked = !Array.isArray(a.pagamentosIds) || a.pagamentosIds.indexOf(pg.id) >= 0;
        cb.addEventListener('change', function () {
          const ids = Array.isArray(a.pagamentosIds) ? a.pagamentosIds : ctx.pagamentos.map(function (x) { return x.id; });
          a.pagamentosIds = cb.checked ? ids.concat([pg.id]).filter(function (v, i, arr) { return arr.indexOf(v) === i; }) : ids.filter(function (x) { return x !== pg.id; });
          mudou();
        });
        lista.appendChild(h('label.check', cb, ' ', pg.nome + (pg.tipo === 'avista' ? '' : ' ' + pg.parcelas + 'x') + (pg.obs ? ' (' + pg.obs + ')' : '')));
      });
      c.appendChild(h('div.campo', h('label', 'Opções de pagamento exibidas'), lista));
    });

    secao('textos', 'Textos da proposta', function (c) {
      c.appendChild(UI.grade([
        { k: 'apresentacao', label: 'Apresentação', type: 'textarea', rows: 3, cls: 'span2' },
        { k: 'inclusos', label: 'Itens inclusos (um por linha)', type: 'linhas' },
        { k: 'naoInclusos', label: 'Itens não inclusos (um por linha)', type: 'linhas' }
      ], a, mudou, 2));
    });

    function atualizarResumo() {
      const r = A.calcular(a, ctx);
      const cli = ctx.clientes.find(function (x) { return x.id === a.clienteId; });
      const pend = [];
      if (!a.clienteId) pend.push('Selecione o cliente.');
      if (!a.itens.length) pend.push('Adicione ao menos um serviço.');
      else if (!(r.total > 0)) pend.push('Informe os preços dos serviços.');
      resumo.innerHTML = '';
      resumo.appendChild(h('div.resumo-topo', UI.badge('Serviços', 'azul'), a.numero ? UI.badge(a.numero, 'cinza') : null));
      resumo.appendChild(h('div.kpis',
        h('div.kpi.grande', h('span', 'Valor total'), h('strong', U.brl(r.total))),
        h('div.kpi', h('span', 'Serviços'), h('strong', String(a.itens.length))),
        h('div.kpi', h('span', 'Validade'), h('strong', (a.validadeDias || 0) + ' dias'))));
      resumo.appendChild(h('p.mini', cli ? cli.nome : 'Sem cliente'));
      resumo.appendChild(pend.length ? h('div.nota.aviso', h('ul', pend.map(function (x) { return h('li', x); }))) : h('div.nota.ok', 'Pronta para gerar.'));
      resumo.appendChild(h('div.resumo-acoes',
        h('button.btn', { type: 'button', onclick: function () { salvar(true); } }, 'Salvar'),
        h('button.btn', { type: 'button', onclick: function () { gerar('docx'); } }, 'DOCX'),
        h('button.btn.primario', { type: 'button', onclick: function () { gerar('pdf'); } }, 'PDF')));
    }

    function salvar(avisar) {
      if (!a.clienteId) { UI.toast('Selecione o cliente antes de salvar.', 'erro'); secoes.cliente.el.scrollIntoView({ behavior: 'smooth' }); return false; }
      const cli = ctx.clientes.find(function (x) { return x.id === a.clienteId; });
      const novo = !a.id;
      if (novo) { const n = S.proximoNumero(a.data); a.numero = n.numero; a._seq = n; }
      const seq = a._seq;
      delete a._seq;
      a.clienteNome = cli ? cli.nome : '';
      a.total = A.calcular(a, ctx).total;
      try { S.save('avulsas', a); } catch (e) { UI.toast(e.message, 'erro'); return false; }
      if (seq) S.reservarNumero(seq.dia, seq.seq);
      sujo = false;
      if (novo) { UI.substituirHash('#/avulsa/' + a.id); titulo.textContent = 'Proposta ' + a.numero; }
      desenhar('ident');
      atualizarResumo();
      if (avisar) UI.toast('Proposta ' + a.numero + ' salva.', 'ok');
      return true;
    }

    async function gerar(formato) {
      if (!a.clienteId) { UI.toast('Selecione o cliente.', 'erro'); return; }
      if (!a.itens.length) { UI.toast('Adicione ao menos um serviço.', 'erro'); return; }
      if (sujo && !salvar(false)) return;
      await baixar(a, formato, formato === 'pdf' ? btnPdf : btnDocx);
    }

    Object.keys(secoes).forEach(desenhar);
    atualizarResumo();
  }
})(window.App);
