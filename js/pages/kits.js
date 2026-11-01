/*
 * Cadastros › Kits fotovoltaicos: kits fechados cotados com os distribuidores (valor único + frete), com a composição ligada ao
 * cadastro de equipamentos. O formulário (App.Kits.abrirForm) também é usado pela proposta e pelo pedido de compra ("Salvar como kit").
 */
window.App = window.App || {};

(function (App) {
  'use strict';

  const U = App.U;
  const h = U.h;
  const UI = App.UI;
  const S = App.Store;
  const K = App.Kit;

  function equipamentos() { return S.list('equipamentos'); }

  function opcoesEquip(lista, tipo, atual) {
    return lista.filter(function (e) { return e.tipo === tipo && (e.ativo !== false || e.id === atual); })
      .sort(function (a, b) { return U.numOr(a.potencia || a.energia, 0) - U.numOr(b.potencia || b.energia, 0) || String(App.Calc.nomeEquip(a)).localeCompare(App.Calc.nomeEquip(b)); })
      .map(function (e) { return h('option', { value: e.id }, App.Calc.nomeEquip(e)); });
  }

  /** Itens do kit: tipo, equipamento do cadastro (ou descrição livre), quantidade e unidade. */
  function editorItens(k, lista, redesenhar) {
    if (!Array.isArray(k.itens)) k.itens = [];
    const tb = h('tbody');
    k.itens.forEach(function (it, i) {
      const selTipo = h('select', { 'aria-label': 'Tipo do item', onchange: function () { it.tipo = selTipo.value; it.equipamentoId = ''; redesenhar(); } },
        K.TIPOS_ITEM.map(function (t) { return h('option', { value: t.id }, t.label); }));
      selTipo.value = it.tipo || 'material';
      const selEq = h('select', {
        'aria-label': 'Equipamento do cadastro', onchange: function () {
          it.equipamentoId = selEq.value;
          const e = K.itemEq(it, lista);
          if (e) it.descricao = App.Calc.nomeEquip(e);
          redesenhar();
        }
      }, h('option', { value: '' }, '— fora do cadastro —'), opcoesEquip(lista, it.tipo || 'material', it.equipamentoId));
      selEq.value = it.equipamentoId || '';
      const ligado = !!K.itemEq(it, lista);
      tb.appendChild(h('tr' + (ligado ? '' : '.fora-cadastro'),
        h('td', selTipo),
        h('td', selEq, ligado || ['material', 'estrutura'].indexOf(it.tipo) >= 0 ? null : h('div.mini.aviso-txt', 'Ligue ao cadastro para o dimensionamento usar o datasheet.')),
        h('td', h('input', { type: 'text', value: it.descricao || '', placeholder: 'Descrição', 'aria-label': 'Descrição do item', oninput: function (ev) { it.descricao = ev.target.value; } })),
        h('td.num', h('input', { type: 'number', min: '0', step: 'any', value: it.qtd == null ? '' : it.qtd, 'aria-label': 'Quantidade', oninput: function (ev) { it.qtd = ev.target.value; } })),
        h('td', h('input', { type: 'text', value: it.unidade || 'un', 'aria-label': 'Unidade', oninput: function (ev) { it.unidade = ev.target.value; } })),
        h('td.acoes-col', h('button.btn-icone.perigo', { type: 'button', title: 'Remover item', 'aria-label': 'Remover item', onclick: function () { k.itens.splice(i, 1); redesenhar(); } }, '×'))));
    });
    return h('div.span2.kit-itens',
      h('div.tabela-rolagem', h('table.tabela.editavel', h('thead', h('tr', ['Tipo', 'Equipamento do cadastro', 'Descrição', 'Qtd.', 'Un.', ''].map(function (t, i) { return h('th' + (i === 3 ? '.num' : ''), t); }))), tb)),
      h('button.btn.pequeno', { type: 'button', onclick: function () { k.itens.push(K.novoItem({ tipo: k.itens.length ? 'material' : 'modulo' })); redesenhar(); } }, '+ Item'));
  }

  /** Campos do formulário do kit. */
  function campos(k, redesenhar) {
    const lista = equipamentos();
    const kwpCalc = K.potencia(Object.assign({}, k, { potenciaKwp: '' }), lista);
    const info = h('p.nota.span2.kit-custo');
    const pintar = function () {
      info.textContent = 'Custo do kit na proposta (kit fechado + frete): ' + U.brl(K.custo(k)) + (k.validade ? ' · ' + K.textoValidade(k) : '');
      info.className = 'nota span2 kit-custo' + (K.validade(k).estado === 'vencida' ? ' aviso' : '');
    };
    pintar();
    const hist = (k.precos || []).length > 1 ? h('div.span2.kit-historico', h('strong', 'Histórico de preços: '),
      k.precos.map(function (x) { return U.dataBR(String(x.em).slice(0, 10)) + ' — ' + U.brl(x.valor) + (x.frete ? ' + frete ' + U.brl(x.frete) : ''); }).join(' · ')) : null;
    return [
      { secao: 'Kit' },
      { k: 'nome', label: 'Nome do kit', cls: 'span2', placeholder: K.nomeSugerido(k, lista) || 'Ex.: Kit 5,5 kWp — 10× 550 W + inversor 5 kW', help: 'Em branco = o nome sugerido pela composição.' },
      { k: 'fornecedor', label: 'Fornecedor / distribuidor' },
      { k: 'tipo', label: 'Tipo de sistema', type: 'select', options: K.TIPOS.map(function (t) { return { v: t.id, t: t.label }; }) },
      { k: 'potenciaKwp', label: 'Potência', type: 'number', suffix: 'kWp', placeholder: kwpCalc ? U.fmtSmart(kwpCalc, 3) : '',
        help: kwpCalc ? 'Em branco = ' + U.fmtSmart(kwpCalc, 3) + ' kWp (módulos × Wp do cadastro).' : 'Em branco = módulos × Wp do módulo do cadastro.' },
      { k: 'ativo', label: 'Ativo (aparece para escolher nas propostas)', type: 'checkbox' },
      { secao: 'Composição — equipamentos do cadastro' },
      { el: editorItens(k, lista, redesenhar) },
      { secao: 'Preço — kit fechado do distribuidor' },
      { k: 'valor', label: 'Valor do kit fechado', type: 'money', required: true, help: 'O valor único cotado com o distribuidor, sem o frete.', onChange: pintar },
      { k: 'frete', label: 'Frete', type: 'money', onChange: pintar },
      { el: info },
      { k: 'cotacao', label: 'Data da cotação', type: 'date' },
      { k: 'validade', label: 'Cotação válida até', type: 'date', help: 'As propostas avisam quando a cotação vencer.', onChange: pintar },
      { k: 'observacoes', label: 'Observações', type: 'textarea', rows: 2, cls: 'span2' },
      hist ? { el: hist } : null
    ];
  }

  function antesSalvar(k) {
    k.itens = (k.itens || []).filter(function (it) { return it.equipamentoId || String(it.descricao || '').trim(); });
    k.itens.forEach(function (it) { it.qtd = U.numOr(it.qtd, 0); });
    if (!String(k.nome || '').trim()) k.nome = K.nomeSugerido(k, equipamentos());
    K.registrarPreco(k, k.id ? S.get('kits', k.id) : null);
  }

  function validar(k) {
    if (!(U.num(k.valor) > 0)) return 'Informe o valor do kit fechado.';
    if (!(k.itens || []).length) return 'Inclua a composição do kit (módulo, inversor…).';
    return null;
  }

  /** Formulário do kit numa janela: inicial (novo ou existente); aoSalvar(kit gravado). o: {titulo} */
  function abrirForm(inicial, aoSalvar, o) {
    o = o || {};
    const k = Object.assign(K.novo(), U.clone(inicial || {}));
    const corpo = h('div.form-kit');
    const desenhar = function () { corpo.innerHTML = ''; corpo.appendChild(UI.grade(campos(k, desenhar), k, null, 2)); };
    desenhar();
    UI.modal({
      titulo: o.titulo || (k.id ? 'Editar — Kit fotovoltaico' : 'Novo — Kit fotovoltaico'),
      corpo: corpo,
      largo: true,
      acoes: [
        { label: 'Cancelar' },
        {
          label: 'Salvar kit', primario: true, onClick: function () {
            antesSalvar(k);
            const erro = validar(k);
            if (erro) { UI.toast(erro, 'erro'); return false; }
            try { S.save('kits', k); } catch (e) { UI.toast(e.message, 'erro'); return false; }
            if (aoSalvar) aoSalvar(k);
          }
        }
      ]
    });
  }

  /** Propostas em aberto (não aprovadas nem recusadas) que usam o kit. */
  function propostasDoKit(k) {
    return S.list('propostas').filter(function (p) { return p.kitId === k.id; });
  }

  function badgeValidade(k) {
    const v = K.validade(k);
    if (v.estado === 'sem') return UI.badge('Sem validade', 'cinza');
    if (v.estado === 'vencida') return UI.badge('Vencida', 'erro');
    if (v.estado === 'vence') return UI.badge(v.dias === 0 ? 'Vence hoje' : 'Vence em ' + v.dias + (v.dias === 1 ? ' dia' : ' dias'), 'ambar');
    return UI.badge('Válida', 'ok');
  }

  UI.rota('/kits', function (cont) {
    const lista = equipamentos();
    UI.crud(cont, {
      colecao: 'kits',
      titulo: 'Kits fotovoltaicos',
      subtitulo: 'Kits fechados cotados com os distribuidores: o valor único do kit, o frete, a validade da cotação e a composição ligada ao cadastro de equipamentos. ' +
        'Na proposta, "📦 Usar kit salvo" traz o módulo, o inversor, as quantidades e o valor; o orçamento lido num pedido de compra vira kit com "📦 Salvar como kit".',
      rotuloNovo: '+ Novo kit',
      vazio: 'Nenhum kit salvo. Cadastre aqui, salve a partir de uma proposta pronta ou de um pedido de compra (orçamento do distribuidor).',
      largo: true,
      novo: function () { return K.novo(); },
      ordenar: function (a, b) {
        return ((a.ativo === false) - (b.ativo === false)) || (K.potencia(a, lista) - K.potencia(b, lista)) || String(a.nome).localeCompare(String(b.nome));
      },
      busca: function (k) { return [k.nome, k.fornecedor, K.rotulo(k.tipo), K.composicao(k, lista)].join(' '); },
      colunas: [
        { t: 'Kit', v: function (k) { return h('div', h('strong', k.nome || '(sem nome)'), h('div.mini', K.composicao(k, lista) || '—')); } },
        { t: 'Fornecedor', v: function (k) { return k.fornecedor || '—'; } },
        { t: 'Tipo', v: function (k) { return K.rotulo(k.tipo); } },
        { t: 'Potência', cls: 'num', v: function (k) { const kwp = K.potencia(k, lista); return kwp > 0 ? U.fmtSmart(kwp, 2) + ' kWp' : '—'; } },
        { t: 'Custo do kit', cls: 'num', v: function (k) { return h('div', h('strong', U.brl(K.custo(k))), U.num(k.frete) > 0 ? h('div.mini', 'com frete de ' + U.brl(U.num(k.frete))) : null); } },
        { t: 'Cotação', v: function (k) { return h('div', badgeValidade(k), h('div.mini', [k.cotacao ? U.dataBR(k.cotacao) : '', k.validade ? 'até ' + U.dataBR(k.validade) : ''].filter(Boolean).join(' · '))); } },
        { t: 'Propostas', cls: 'num', v: function (k) { const n = propostasDoKit(k).length; return n ? String(n) : '—'; } },
        { t: 'Situação', v: function (k) { return k.ativo === false ? UI.badge('Inativo', 'cinza') : UI.badge('Ativo', 'ok'); } }
      ],
      campos: campos,
      antesSalvar: antesSalvar,
      validar: validar,
      podeExcluir: function (k) {
        const abertas = propostasDoKit(k).filter(function (p) { return ['aprovada', 'recusada'].indexOf(p.status) < 0; });
        return abertas.length ? 'O kit está em ' + abertas.length + ' proposta(s) em aberto (' + abertas.map(function (p) { return p.numero; }).join(', ') + '). Deixe-o inativo em vez de excluir.' : null;
      }
    });
  });

  App.Kits = { abrirForm: abrirForm, campos: campos, antesSalvar: antesSalvar, validar: validar, propostasDoKit: propostasDoKit, badgeValidade: badgeValidade };
})(window.App);
