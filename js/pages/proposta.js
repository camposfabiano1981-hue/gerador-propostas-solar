/* Formulário da proposta: dados, dimensionamento On-Grid/Híbrido ao vivo, materiais, preço, pagamento e geração do .docx. */
(function (App) {
  'use strict';

  const U = App.U, UI = App.UI, S = App.Store, D = App.DEFAULTS, C = App.Calc;
  const h = U.h;

  UI.rota('/proposta/nova', function (cont, params, qs) { formulario(cont, null, qs); });
  UI.rota('/proposta/:id', function (cont, params, qs) { formulario(cont, params.id, qs); });

  function normalizar(p, ctx) {
    const base = C.novaProposta(ctx);
    Object.keys(base).forEach(function (k) {
      if (p[k] === undefined && k !== '_seq' && k !== 'numero') p[k] = U.clone(base[k]);
    });
    p.premissas = Object.assign(U.clone(ctx.premissas), p.premissas || {});
    p.premissas.hibrido = Object.assign(U.clone(ctx.premissas.hibrido), (p.premissas && p.premissas.hibrido) || {});
    if (!Array.isArray(p.consumoMensal) || p.consumoMensal.length !== 12) p.consumoMensal = Array(12).fill('');
    if (!Array.isArray(p.cargas)) p.cargas = [];
    if (!Array.isArray(p.itens)) p.itens = [];
    return p;
  }

  function assinaturaItens(itens) {
    return JSON.stringify((itens || []).map(function (i) { return [i.equipamentoId, i.descricao, i.qtd, i.unidade, i.precoUnit]; }));
  }

  function opcoesEquip(ctx, tipo, atual) {
    return ctx.equipamentos.filter(function (e) { return e.tipo === tipo && (e.ativo !== false || e.id === atual); })
      .sort(function (a, b) { return U.numOr(a.potencia || a.energia, 0) - U.numOr(b.potencia || b.energia, 0); })
      .map(function (e) { return { v: e.id, t: C.nomeEquip(e) + (U.num(e.preco) > 0 ? ' — ' + U.brl(e.preco) : '') }; });
  }

  function formulario(cont, id, qs) {
    let ctx = C.contexto();
    let p;
    if (id) {
      const salvo = S.get('propostas', id);
      if (!salvo) { UI.toast('Proposta não encontrada.', 'erro'); UI.ir('#/propostas'); return; }
      p = normalizar(U.clone(salvo), ctx);
    } else {
      p = C.novaProposta(ctx);
      p.itensSync = true;
      if (qs && qs.get('cliente')) p.clienteId = qs.get('cliente');
      if (qs && qs.get('tipo') === 'hibrido') p.tipoSistema = 'hibrido';
      if (p.tipoSistema === 'hibrido') p.cargas = U.clone(D.cargasExemplo);
    }
    let r = null;
    let sujo = !id;
    UI.guarda = function () { return !sujo || confirm('A proposta tem alterações não salvas. Deseja sair mesmo assim?'); };
    window.onbeforeunload = function (e) { if (sujo && document.body.contains(cont.firstChild)) { e.preventDefault(); e.returnValue = ''; } };

    const secoes = {};
    const infos = {};

    /* ---------------- cabeçalho */
    const subtitulo = h('p.sub');
    const btnSalvar = h('button.btn', { type: 'button', onclick: function () { salvar(true); } }, 'Salvar');
    const btnDocx = h('button.btn.primario', { type: 'button', onclick: gerarDocx }, '⬇ Gerar proposta (.docx)');
    const titulo = h('h1', id ? 'Proposta ' + p.numero : 'Nova proposta');
    cont.appendChild(h('div.pagina-topo', h('div', titulo, subtitulo), h('div.acoes', btnSalvar, btnDocx)));

    const nav = h('nav.passos');
    const colForm = h('div.form-col');
    const resumo = h('aside.resumo-col');
    cont.appendChild(h('div.form-layout', h('div', nav, colForm), resumo));

    function secao(chave, tituloSec, construir, visivel) {
      const corpo = h('div.secao-corpo');
      const el = h('section.card.secao#sec-' + chave, h('h2', tituloSec), corpo);
      secoes[chave] = { el: el, corpo: corpo, construir: construir, visivel: visivel };
      colForm.appendChild(el);
      nav.appendChild(h('a', { href: 'javascript:void 0', 'data-sec': chave, onclick: function () { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, tituloSec));
    }

    function desenhar(chave) {
      const s = secoes[chave];
      const vis = !s.visivel || s.visivel();
      s.el.hidden = !vis;
      const link = nav.querySelector('[data-sec="' + chave + '"]');
      if (link) link.hidden = !vis;
      s.corpo.innerHTML = '';
      if (vis) s.construir(s.corpo);
    }

    function desenharTudo() { Object.keys(secoes).forEach(desenhar); }

    const atualizarDebounce = U.debounce(function () { atualizar(); }, 150);

    function mudou(k) {
      sujo = true;
      const reDesenho = {
        tipoSistema: ['sistema', 'hibrido', 'materiais', 'ident'], localidadeId: ['local'], concessionariaId: ['local'], classe: ['local'],
        consumoModo: ['consumo'], clienteId: ['cliente'], precoModo: ['materiais'], kitManual: ['materiais'], data: ['ident']
      };
      if (k === 'localidadeId') {
        const loc = ctx.localidades.find(function (l) { return l.id === p.localidadeId; });
        if (loc && loc.concessionariaId) p.concessionariaId = loc.concessionariaId;
      }
      if (k === 'tipoSistema') {
        p.inversorId = null;
        p.nInversores = '';
        if (p.tipoSistema === 'hibrido' && !p.cargas.length) p.cargas = U.clone(D.cargasExemplo);
      }
      if (k === 'data' && !p.id) {
        const n = S.proximoNumero(p.data);
        p.numero = n.numero;
        p._seq = n;
      }
      if (k === 'clienteId') {
        const cli = ctx.clientes.find(function (c) { return c.id === p.clienteId; });
        if (cli && cli.cidade) {
          const loc = ctx.localidades.find(function (l) { return U.slug(l.cidade) === U.slug(cli.cidade) && (!cli.uf || l.uf === cli.uf); });
          if (loc && loc.id !== p.localidadeId) { p.localidadeId = loc.id; if (loc.concessionariaId) p.concessionariaId = loc.concessionariaId; desenhar('local'); }
        }
      }
      (reDesenho[k] || []).forEach(desenhar);
      if (reDesenho[k]) atualizar(); else atualizarDebounce();
    }

    /* ---------------- seção: identificação */
    secao('ident', 'Identificação', function (c) {
      const tipos = h('div.opcoes-cartao',
        [['ongrid', 'On-Grid', 'Conectado à rede, sem baterias. Compensação de energia (Lei 14.300).'],
          ['hibrido', 'Híbrido', 'Conectado à rede com banco de baterias para backup e/ou autoconsumo.']].map(function (o) {
          return h('button.opcao' + (p.tipoSistema === o[0] ? '.ativa' : ''), {
            type: 'button', onclick: function () { if (p.tipoSistema !== o[0]) { p.tipoSistema = o[0]; mudou('tipoSistema'); } }
          }, h('strong', o[1]), h('small', o[2]));
        }));
      c.appendChild(h('div.campo', h('label', 'Tipo de sistema'), tipos));
      c.appendChild(UI.grade([
        { k: 'numero', label: 'Nº da proposta' },
        { k: 'data', label: 'Data de emissão', type: 'date' },
        { k: 'validadeDias', label: 'Validade', type: 'int', suffix: 'dias' },
        { k: 'status', label: 'Situação', type: 'select', options: D.STATUS.map(function (s) { return { v: s.id, t: s.label }; }) }
      ], p, mudou, 4));
    });

    /* ---------------- seção: cliente */
    secao('cliente', 'Cliente', function (c) {
      const clientes = ctx.clientes.slice().sort(function (a, b) { return String(a.nome).localeCompare(String(b.nome), 'pt-BR'); });
      const novo = h('button.btn.pequeno', {
        type: 'button', onclick: function () {
          const cli = { nome: '', documento: '', telefone: '', email: '', cep: '', endereco: '', numero: '', bairro: '', cidade: '', uf: '', observacoes: '' };
          const corpo = h('div');
          const red = function () { corpo.innerHTML = ''; corpo.appendChild(UI.grade(App.camposCliente(cli, red), cli, null, 2)); };
          red();
          UI.modal({
            titulo: 'Novo cliente', corpo: corpo, largo: true, acoes: [{ label: 'Cancelar' }, {
              label: 'Salvar cliente', primario: true, onClick: function () {
                if (!String(cli.nome || '').trim()) { UI.toast('Informe o nome do cliente.', 'erro'); return false; }
                S.save('clientes', cli);
                ctx = C.contexto();
                p.clienteId = cli.id;
                mudou('clienteId');
                UI.toast('Cliente cadastrado.', 'ok');
              }
            }]
          });
        }
      }, '+ Novo cliente');
      c.appendChild(h('div.linha-campo', UI.campo({
        k: 'clienteId', label: 'Cliente', type: 'select', required: true, cls: 'cresce',
        options: [{ v: '', t: '— selecione o cliente —' }].concat(clientes.map(function (x) { return { v: x.id, t: x.nome + (x.cidade ? ' — ' + x.cidade + (x.uf ? '/' + x.uf : '') : '') }; }))
      }, p, mudou), novo));
      const cli = ctx.clientes.find(function (x) { return x.id === p.clienteId; });
      if (cli) {
        const end = [cli.endereco, cli.numero, cli.bairro].filter(Boolean).join(', ');
        c.appendChild(h('div.ficha', [
          ['CPF/CNPJ', cli.documento], ['Telefone', cli.telefone], ['E-mail', cli.email],
          ['Endereço', end], ['Cidade/UF', [cli.cidade, cli.uf].filter(Boolean).join('/')]
        ].filter(function (x) { return x[1]; }).map(function (x) { return h('div', h('span', x[0]), h('strong', x[1])); })));
        c.appendChild(UI.grade([{ k: 'enderecoInstalacao', label: 'Endereço de instalação (se diferente do cadastro)', placeholder: end || 'Rua, número, bairro', cls: 'span2' }], p, mudou));
      }
    });

    /* ---------------- seção: local e tarifa */
    secao('local', 'Local, concessionária e tarifa', function (c) {
      const loc = ctx.localidades.find(function (l) { return l.id === p.localidadeId; });
      const conc = ctx.concessionarias.find(function (x) { return x.id === p.concessionariaId; });
      const classe = D.CLASSES.find(function (x) { return x.id === p.classe; }) || D.CLASSES[0];
      const tarifaPad = conc && conc.tarifas ? conc.tarifas[classe.tarifa] : null;
      c.appendChild(UI.grade([
        { k: 'localidadeId', label: 'Cidade de instalação (irradiação)', type: 'select', required: true,
          options: [{ v: '', t: '— selecione —' }].concat(ctx.localidades.map(function (l) { return { v: l.id, t: l.cidade + '/' + l.uf + ' — HSP ' + U.fmtSmart(l.hsp, 2) }; })),
          help: ctx.localidades.length ? null : 'Cadastre localidades em Cadastros › Localidades.' },
        { k: 'concessionariaId', label: 'Concessionária', type: 'select', options: [{ v: '', t: '—' }].concat(ctx.concessionarias.map(function (x) { return { v: x.id, t: x.nome }; })) },
        { k: 'classe', label: 'Classe de consumo', type: 'select', options: D.CLASSES.map(function (x) { return x.id; }) },
        { k: 'ligacao', label: 'Tipo de ligação', type: 'select', options: D.LIGACOES.map(function (x) { return { v: x.id, t: x.label }; }) },
        { k: 'tensao', label: 'Tensão de atendimento', type: 'select', options: D.TENSOES },
        { k: 'ligacaoConfirmar', label: 'Tipo de ligação a confirmar (premissa)', type: 'checkbox' },
        { k: 'telhado', label: 'Tipo de telhado', type: 'select', options: D.TELHADOS },
        { k: 'telhadoDetalhe', label: 'Detalhe da fixação', placeholder: 'Ex.: parafuso estrutural' },
        { secao: 'Valores da fatura (deixe em branco para usar os cadastros)' },
        { k: 'tarifa', label: 'Tarifa com impostos', type: 'number', prefix: 'R$', suffix: '/kWh', placeholder: tarifaPad ? String(tarifaPad).replace('.', ',') : '' },
        { k: 'tusdFioB', label: 'TUSD Fio B', type: 'number', prefix: 'R$', suffix: '/kWh', placeholder: conc && conc.tusdFioB ? String(conc.tusdFioB).replace('.', ',') : '' },
        { k: 'cosip', label: 'COSIP', type: 'money', suffix: '/mês', placeholder: loc && loc.cosip != null ? String(loc.cosip).replace('.', ',') : '' },
        { k: 'hsp', label: 'HSP', type: 'number', suffix: 'kWh/m²/dia', placeholder: loc ? String(loc.hsp).replace('.', ',') : '' }
      ], p, mudou, 4));
    });

    /* ---------------- seção: consumo */
    secao('consumo', 'Consumo de energia', function (c) {
      c.appendChild(UI.grade([
        { k: 'consumoModo', label: 'Forma de informar', type: 'select', options: [{ v: 'media', t: 'Média mensal' }, { v: 'mensal', t: 'Histórico de 12 meses (fatura)' }] },
        p.consumoModo === 'mensal' ? null : { k: 'consumoMedio', label: 'Consumo médio mensal', type: 'number', suffix: 'kWh/mês', required: true },
        { k: 'simultaneidade', label: 'Simultaneidade (autoconsumo direto)', type: 'pct', help: 'Parcela da geração consumida no momento; o restante é injetado na rede.' }
      ], p, mudou, 3));
      if (p.consumoModo === 'mensal') {
        const g = h('div.meses');
        U.MESES.forEach(function (m, i) { g.appendChild(UI.campo({ k: 'consumoMensal.' + i, label: m, type: 'number' }, p, mudou)); });
        c.appendChild(h('div.campo', h('label', 'Consumo por mês (kWh)'), g));
      }
      infos.consumo = h('div.info');
      c.appendChild(infos.consumo);
    });

    /* ---------------- seção: sistema FV */
    secao('sistema', 'Dimensionamento do sistema fotovoltaico', function (c) {
      const tipoInv = p.tipoSistema === 'hibrido' ? 'hibrido' : 'inversor';
      infos.placeModulos = UI.campo({ k: 'nModulos', label: 'Quantidade de módulos', type: 'int', help: 'Em branco = quantidade sugerida.' }, p, mudou);
      infos.placeInv = UI.campo({ k: 'nInversores', label: 'Quantidade de inversores', type: 'int', help: 'Em branco = automático.' }, p, mudou);
      c.appendChild(UI.grade([
        { k: 'moduloId', label: 'Módulo fotovoltaico', type: 'select', required: true, cls: 'span2',
          options: [{ v: '', t: '— selecione —' }].concat(opcoesEquip(ctx, 'modulo', p.moduloId)) },
        { el: infos.placeModulos },
        { k: 'inversorId', label: tipoInv === 'hibrido' ? 'Inversor híbrido' : 'Inversor', type: 'select', cls: 'span2',
          options: function () { return [{ v: '', t: 'Automático (melhor FDI)' }].concat(opcoesEquip(ctx, tipoInv, p.inversorId)); } },
        { el: infos.placeInv }
      ], p, mudou, 3));
      infos.sistema = h('div.info');
      c.appendChild(infos.sistema);
    });

    /* ---------------- seção: híbrido */
    secao('hibrido', 'Armazenamento — baterias e cargas críticas', function (c) {
      c.appendChild(h('p.ajuda-sec', 'Liste os equipamentos que devem funcionar durante a falta de energia e por quantas horas cada um será usado nesse período.'));
      const ed = UI.editorLinhas(p.cargas, [
        { k: 'descricao', label: 'Carga crítica', placeholder: 'Ex.: Geladeira' },
        { k: 'qtd', label: 'Qtd.', type: 'number', w: '80px' },
        { k: 'potencia', label: 'Potência (W)', type: 'number', w: '120px' },
        { k: 'horas', label: 'Uso no backup (h)', type: 'number', w: '140px' }
      ], function () { mudou('cargas'); }, '+ Adicionar carga', function () { return { descricao: '', qtd: 1, potencia: '', horas: '' }; });
      c.appendChild(ed);
      c.appendChild(h('button.btn.pequeno.link', {
        type: 'button', onclick: function () { p.cargas.splice(0, p.cargas.length); D.cargasExemplo.forEach(function (x) { p.cargas.push(U.clone(x)); }); ed.redesenhar(); mudou('cargas'); }
      }, 'Carregar cargas de exemplo'));
      infos.placeBat = UI.campo({ k: 'nBaterias', label: 'Quantidade de baterias', type: 'int', help: 'Em branco = sugerido.' }, p, mudou);
      c.appendChild(UI.grade([
        { k: 'autonomiaHoras', label: 'Autonomia desejada', type: 'number', suffix: 'h' },
        { k: 'bateriaId', label: 'Bateria', type: 'select', cls: 'span2',
          options: [{ v: '', t: 'Primeira bateria ativa do catálogo' }].concat(opcoesEquip(ctx, 'bateria', p.bateriaId)) },
        { el: infos.placeBat },
        { k: 'dod', label: 'DoD (profundidade de descarga)', type: 'number', suffix: '%', help: 'Em branco = DoD da bateria.' },
        { k: 'usoBateria', label: 'Modo de operação', type: 'select', cls: 'span2', options: [
          { v: 'backup', t: 'Backup — baterias reservadas para falta de energia' },
          { v: 'ciclagem', t: 'Backup + ciclagem diária (armazena excedente para a noite)' }] }
      ], p, mudou, 4));
      infos.hibrido = h('div.info');
      c.appendChild(infos.hibrido);
    }, function () { return p.tipoSistema === 'hibrido'; });

    /* ---------------- seção: materiais e preço */
    let corpoItens = null;
    secao('materiais', 'Materiais e composição do preço', function (c) {
      c.appendChild(UI.campo({
        k: 'itensSync', label: 'Atualizar a lista automaticamente conforme o dimensionamento (mantém preços editados)', type: 'checkbox',
        onChange: function (v) { if (v) atualizar(true); }
      }, p, function () { sujo = true; }));
      corpoItens = h('div');
      c.appendChild(corpoItens);
      desenharItens();

      c.appendChild(h('h4.secao-form', 'Composição do preço'));
      const modos = h('div.opcoes-cartao.compacto', [
        ['composto', 'Valor total', 'Informe o preço final; a mão de obra é calculada (total − kit − infraestrutura).'],
        ['separado', 'Itens separados', 'Informe a mão de obra; o total é a soma de kit + infraestrutura + mão de obra.']
      ].map(function (o) {
        return h('button.opcao' + (p.precoModo === o[0] ? '.ativa' : ''), {
          type: 'button', onclick: function () { if (p.precoModo !== o[0]) { p.precoModo = o[0]; mudou('precoModo'); } }
        }, h('strong', o[1]), h('small', o[2]));
      }));
      c.appendChild(modos);
      c.appendChild(UI.grade([
        { k: 'kitManual', label: 'Informar valor do kit manualmente (cotação do distribuidor)', type: 'checkbox', cls: 'span2' },
        p.kitManual ? { k: 'kitValor', label: 'Valor do kit fotovoltaico', type: 'money' } : null,
        { k: 'infraValor', label: 'Infraestrutura elétrica CA', type: 'money', help: 'DPS, disjuntores, quadro, aterramento.' },
        p.precoModo === 'separado'
          ? { k: 'maoObraValor', label: 'Mão de obra + projeto + homologação', type: 'money', required: true }
          : { k: 'valorTotal', label: 'Valor total da proposta', type: 'money', required: true },
        { k: 'infraDescricao', label: 'Descrição da infraestrutura CA (lista de equipamentos)', cls: 'span2' }
      ], p, mudou, 3));
      infos.preco = h('div.info');
      c.appendChild(infos.preco);
    });

    function desenharItens() {
      if (!corpoItens) return;
      corpoItens.innerHTML = '';
      const tb = h('tbody');
      const subtotais = [];
      p.itens.forEach(function (it, i) {
        const sub = h('td.num');
        subtotais.push({ el: sub, it: it });
        const editar = function (campo) {
          return function () {
            sujo = true;
            if (p.itensSync && !it.manual && campo !== 'precoUnit' && campo !== 'garantia') {
              p.itensSync = false;
              desenhar('materiais');
              UI.toast('Lista passou a ser manual (atualização automática desativada).');
            }
            sub.textContent = U.brl(U.numOr(it.qtd, 0) * U.numOr(it.precoUnit, 0));
            atualizarDebounce();
          };
        };
        tb.appendChild(h('tr',
          h('td.num', String(i + 1)),
          h('td', UI.campo({ k: 'descricao' }, it, editar('descricao'))),
          h('td', { style: { width: '70px' } }, UI.campo({ k: 'qtd', type: 'number' }, it, editar('qtd'))),
          h('td', { style: { width: '72px' } }, UI.campo({ k: 'unidade', type: 'select', options: ['un', 'm', 'pt', 'cj', 'kg'] }, it, editar('unidade'))),
          h('td', { style: { width: '120px' } }, UI.campo({ k: 'precoUnit', type: 'money' }, it, editar('precoUnit'))),
          sub,
          h('td', { style: { width: '140px' } }, UI.campo({ k: 'garantia' }, it, editar('garantia'))),
          h('td.acoes-col', h('button.btn-icone.perigo', {
            type: 'button', title: 'Remover', 'aria-label': 'Remover item', onclick: function () {
              p.itens.splice(i, 1);
              if (!it.manual) p.itensSync = false;
              sujo = true;
              desenhar('materiais');
              atualizar();
            }
          }, '×'))));
        sub.textContent = U.brl(U.numOr(it.qtd, 0) * U.numOr(it.precoUnit, 0));
      });
      corpoItens.appendChild(h('div.tabela-rolagem', h('table.tabela.editavel.itens',
        h('thead', h('tr', ['#', 'Descrição', 'Qtd.', 'Un.', 'Preço unit.', 'Subtotal', 'Garantia', ''].map(function (t) { return h('th', t); }))),
        tb)));

      const selAdd = h('select', h('option', { value: '' }, '+ Adicionar item do catálogo…'));
      D.TIPOS_EQUIP.forEach(function (t) {
        const og = h('optgroup', { label: t.label });
        ctx.equipamentos.filter(function (e) { return e.tipo === t.id && e.ativo !== false; }).forEach(function (e) {
          og.appendChild(h('option', { value: e.id }, C.nomeEquip(e)));
        });
        if (og.children.length) selAdd.appendChild(og);
      });
      selAdd.addEventListener('change', function () {
        const e = ctx.equipamentos.find(function (x) { return x.id === selAdd.value; });
        if (!e) return;
        const cat = { modulo: 'modulo', inversor: 'inversor', hibrido: 'inversor', bateria: 'bateria', estrutura: 'estrutura' }[e.tipo] || 'material';
        p.itens.push({ id: U.uid(), equipamentoId: e.id, categoria: cat, descricao: C.descEquip(e), qtd: 1, unidade: e.unidade || 'un', precoUnit: U.numOr(e.preco, 0), garantia: C.garantiaEquip(e), manual: true });
        sujo = true;
        desenharItens();
        atualizar();
      });
      corpoItens.appendChild(h('div.barra-itens',
        selAdd,
        h('button.btn.pequeno', {
          type: 'button', onclick: function () {
            p.itens.push({ id: U.uid(), equipamentoId: null, categoria: 'material', descricao: 'Novo item', qtd: 1, unidade: 'un', precoUnit: 0, garantia: '', manual: true });
            sujo = true; desenharItens(); atualizar();
          }
        }, '+ Item avulso'),
        h('button.btn.pequeno', {
          type: 'button', onclick: async function () {
            if (await UI.confirmar('Regerar a lista de materiais a partir do dimensionamento atual? Itens editados manualmente serão substituídos.')) {
              p.itens = [];
              p.itensSync = true;
              sujo = true;
              desenhar('materiais');
              atualizar(true);
            }
          }
        }, '↻ Regerar lista'),
        h('span.total-itens', { 'data-total-itens': '' })));
    }

    /* ---------------- seção: financeiro e pagamento */
    secao('financeiro', 'Premissas financeiras e pagamento', function (c) {
      c.appendChild(UI.grade([
        { k: 'premissas.tma', label: 'Taxa de desconto (TMA)', type: 'pct', suffix: '% a.a.' },
        { k: 'premissas.tmaNome', label: 'Nome da taxa', placeholder: 'SELIC' },
        { k: 'premissas.inflacaoTarifa', label: 'Inflação tarifária', type: 'pct', suffix: '% a.a.' },
        { k: 'premissas.reajusteCosip', label: 'Reajuste da COSIP', type: 'pct', suffix: '% a.a.' },
        { k: 'premissas.degradacao', label: 'Degradação dos módulos', type: 'pct', suffix: '% a.a.' },
        { k: 'premissas.pr', label: 'Performance Ratio', type: 'number' },
        { k: 'premissas.horizonte', label: 'Horizonte', type: 'int', suffix: 'anos' },
        { el: h('div.campo', h('label', ' '), h('button.btn.pequeno', {
          type: 'button', onclick: function () {
            p.premissas = U.clone(S.config().premissas);
            sujo = true; desenhar('financeiro'); atualizar();
            UI.toast('Premissas padrão aplicadas a esta proposta.');
          }
        }, 'Aplicar premissas padrão')) }
      ], p, mudou, 4));
      c.appendChild(h('h4.secao-form', 'Opções de pagamento exibidas na proposta'));
      infos.pagamentos = h('div.lista-pagamentos');
      c.appendChild(infos.pagamentos);
    });

    /* ---------------- seção: textos */
    secao('textos', 'Textos e observações', function (c) {
      c.appendChild(UI.grade([
        { k: 'tecnologiaTexto', label: 'Tecnologia (capa)', placeholder: 'Automático' },
        { k: 'monitoramento', label: 'Monitoramento', placeholder: 'Automático (cadastro do inversor)' },
        { k: 'estruturaTexto', label: 'Estrutura de fixação (tabela de dimensionamento)', placeholder: 'Automático (a partir da lista de materiais)', cls: 'span2' },
        { k: 'condicoesObs', label: 'Observações nas condições comerciais (aparece na proposta)', type: 'textarea', cls: 'span2' },
        { k: 'observacoes', label: 'Anotações internas (não aparecem na proposta)', type: 'textarea', cls: 'span2' }
      ], p, mudou, 2));
    });

    /* ---------------- atualização */

    function linhaInfo(rotulo, valor, tipo) {
      return h('div.info-item' + (tipo ? '.' + tipo : ''), h('span', rotulo), h('strong', valor));
    }

    function atualizar(forcarSync) {
      if (p.itensSync || forcarSync) {
        const r0 = C.calcular(Object.assign({}, p, { itens: [] }), ctx);
        const antigos = p.itens || [];
        const novos = r0.itens.map(function (n) {
          const a = antigos.find(function (o) { return !o.manual && o.equipamentoId && o.equipamentoId === n.equipamentoId; });
          if (a) { n.id = a.id; n.precoUnit = a.precoUnit; n.garantia = a.garantia; n.descricao = a.descricao; }
          return n;
        }).concat(antigos.filter(function (o) { return o.manual; }));
        const mud = assinaturaItens(novos) !== assinaturaItens(antigos);
        p.itens = novos;
        if (mud) desenharItens();
      }
      r = C.calcular(p, ctx);
      const cli = ctx.clientes.find(function (x) { return x.id === p.clienteId; });
      subtitulo.textContent = [cli ? cli.nome : 'Cliente não selecionado', p.tipoSistema === 'hibrido' ? 'Sistema Híbrido' : 'Sistema On-Grid', p.numero].join(' · ');
      titulo.textContent = p.id ? 'Proposta ' + p.numero : 'Nova proposta';

      if (infos.consumo) {
        infos.consumo.replaceChildren(
          linhaInfo('Consumo médio', U.fmt(r.consumoMedio, 0) + ' kWh/mês'),
          linhaInfo('Consumo anual', U.fmt(r.consumoMedio * 12, 0) + ' kWh'),
          linhaInfo('Disponibilidade (' + C.LIG_ADJ[r.ligacao] + ')', U.fmt(r.disponibilidade, 0) + ' kWh/mês'),
          linhaInfo('Tarifa considerada', r.tarifa ? 'R$ ' + U.fmt(r.tarifa, 4) + '/kWh' : '—'));
      }
      if (infos.sistema) {
        const placeM = infos.placeModulos.querySelector('input');
        if (placeM) placeM.placeholder = r.nModulosSugerido ? 'Sugerido: ' + r.nModulosSugerido : '';
        const placeI = infos.placeInv.querySelector('input');
        if (placeI) placeI.placeholder = r.inversor ? 'Auto: ' + r.nInversores : '';
        const sug = r.inversorSugerido;
        const itensInfo = [
          linhaInfo('Potência necessária', U.fmt(r.kwpNecessario, 2) + ' kWp'),
          linhaInfo('Potência do sistema', U.kwp(r.kwp) + ' kWp', 'destaque'),
          linhaInfo('Inversor', r.inversor ? r.nInversores + ' × ' + C.nomeEquip(r.inversor) : '—'),
          linhaInfo('FDI (P inv ÷ P FV)', r.kwp ? U.fmt(r.fdi, 3) + (r.fdiOk ? ' ✅' : ' ⚠️') : '—', r.kwp && !r.fdiOk ? 'alerta' : null),
          linhaInfo('Geração mensal', U.fmt(r.geracaoMensal, 0) + ' kWh/mês'),
          linhaInfo('Geração anual (ano 1)', U.fmt(r.geracaoAnual, 0) + ' kWh'),
          linhaInfo('Cobertura do consumo', U.fmt(r.cobertura * 100, 1) + '%'),
          linhaInfo('Área aproximada', '~' + U.fmt(r.area, 0) + ' m²')
        ];
        if (r.strings) itensInfo.push(linhaInfo('Arranjo sugerido', r.strings.nStrings + ' string(s) de até ' + r.strings.porString + ' módulos (máx. ' + r.strings.maxSerie + '/string)'));
        if (!p.inversorId && sug) itensInfo.push(linhaInfo('Sugestão automática', sug.n + ' × ' + C.nomeEquip(sug.inv)));
        infos.sistema.replaceChildren.apply(infos.sistema, itensInfo);
      }
      if (infos.hibrido && r.hibrido) {
        const hb = r.hibrido;
        const placeB = infos.placeBat.querySelector('input');
        if (placeB) placeB.placeholder = hb.nSugerido ? 'Sugerido: ' + hb.nSugerido : '';
        infos.hibrido.replaceChildren(
          linhaInfo('Potência das cargas', U.fmtSmart(hb.potCargas / 1000, 2) + ' kW'),
          linhaInfo('Energia no backup', U.fmtSmart(hb.energiaBackup / 1000, 2) + ' kWh'),
          linhaInfo('Capacidade necessária', U.fmtSmart(hb.capNecessaria, 2) + ' kWh'),
          linhaInfo('Banco instalado', hb.bateria ? hb.nBaterias + ' × ' + U.fmtSmart(hb.bateria.energia, 2) + ' = ' + U.fmtSmart(hb.capInstalada, 2) + ' kWh' : '—', 'destaque'),
          linhaInfo('Configuração', hb.configuracao || '—'),
          linhaInfo('Capacidade útil', U.fmtSmart(hb.capUtil, 2) + ' kWh'),
          linhaInfo('Autonomia estimada', hb.autonomiaEstimada != null ? '≈ ' + U.fmtSmart(hb.autonomiaEstimada, 1) + ' h' : '—', hb.autonomiaEstimada != null && hb.autonomiaEstimada < hb.autonomiaHoras ? 'alerta' : null),
          linhaInfo('Backup do inversor', U.fmtSmart(hb.potBackup || 0, 2) + ' kW' + (hb.backupOk ? ' ✅' : ' ⚠️'), hb.backupOk ? null : 'alerta'));
      }
      if (infos.preco) {
        const wp = r.kwp * 1000;
        infos.preco.replaceChildren(
          linhaInfo('Kit fotovoltaico' + (p.kitManual ? ' (manual)' : ' (soma dos itens)'), U.brl(r.kit)),
          linhaInfo('Infraestrutura CA', U.brl(r.infra)),
          linhaInfo('Mão de obra + projeto + homologação', U.brl(r.maoObra), r.maoObra < 0 ? 'alerta' : null),
          linhaInfo('Valor total', U.brl(r.total), 'destaque'),
          linhaInfo('Preço por Wp', wp > 0 ? 'R$ ' + U.fmt(r.total / wp, 2) + '/Wp' : '—'));
      }
      const totItens = corpoItens && corpoItens.querySelector('[data-total-itens]');
      if (totItens) totItens.textContent = 'Soma dos itens: ' + U.brl(r.kitSoma);
      if (infos.pagamentos) desenharPagamentos();
      desenharResumo();
    }

    function desenharPagamentos() {
      const box = infos.pagamentos;
      box.innerHTML = '';
      if (!ctx.pagamentos.length) { box.appendChild(h('p.ajuda-sec', 'Nenhuma modalidade cadastrada (Cadastros › Pagamentos).')); return; }
      ctx.pagamentos.forEach(function (pg) {
        const marcado = p.pagamentosIds.indexOf(pg.id) >= 0;
        const sim = C.pagamentos(r.total, [Object.assign({}, pg, { ativo: true })])[0];
        const chk = h('input', {
          type: 'checkbox', checked: marcado, onchange: function () {
            const i = p.pagamentosIds.indexOf(pg.id);
            if (chk.checked && i < 0) p.pagamentosIds.push(pg.id);
            if (!chk.checked && i >= 0) p.pagamentosIds.splice(i, 1);
            sujo = true;
            desenharResumo();
          }
        });
        box.appendChild(h('label.pagamento', chk, h('span', sim.label), h('strong', sim.prazo + ' de ' + U.brl(sim.parcela))));
      });
    }

    const mini = h('canvas.mini-grafico', { width: 720, height: 300 });

    function desenharResumo() {
      const f = r.fin;
      resumo.innerHTML = '';
      const kpi = function (rot, val, cls) { return h('div.kpi' + (cls ? '.' + cls : ''), h('span', rot), h('strong', val)); };
      const blocos = [
        h('div.resumo-topo', UI.badge(p.tipoSistema === 'hibrido' ? 'Híbrido' : 'On-Grid', p.tipoSistema === 'hibrido' ? 'roxo' : 'azul'),
          UI.badge((D.STATUS.find(function (s) { return s.id === p.status; }) || D.STATUS[0]).label, 'cinza'), sujo ? UI.badge('Não salvo', 'ambar') : null),
        h('div.kpis',
          kpi('Potência', U.kwp(r.kwp) + ' kWp', 'grande'),
          kpi('Módulos', r.modulo ? r.nModulos + ' × ' + r.modulo.potencia + ' Wp' : '—'),
          kpi('Inversor', r.inversor ? r.nInversores + ' × ' + U.fmtSmart(r.inversor.potencia, 2) + ' kW' : '—'),
          kpi('FDI', r.kwp ? U.fmt(r.fdi, 3) : '—', r.kwp && !r.fdiOk ? 'alerta' : null),
          kpi('Geração', U.fmt(r.geracaoMensal, 0) + ' kWh/mês'),
          kpi('Cobertura', U.fmt(r.cobertura * 100, 0) + '%'),
          r.hibrido ? kpi('Baterias', U.fmtSmart(r.hibrido.capInstalada || 0, 2) + ' kWh') : null,
          r.hibrido ? kpi('Autonomia', r.hibrido.autonomiaEstimada != null ? '≈ ' + U.fmtSmart(r.hibrido.autonomiaEstimada, 1) + ' h' : '—') : null),
        h('div.kpis',
          kpi('Investimento', U.brl(r.total), 'grande'),
          kpi('Economia mês 1', U.brl(f.economiaMes1), 'verde'),
          kpi('Payback', r.total > 0 ? U.anosMeses(f.paybackSimples) : '—'),
          kpi('Payback desc.', r.total > 0 ? U.anosMeses(f.paybackDescontado) : '—'),
          kpi('TIR', f.tir != null ? U.fmt(f.tir * 100, 1) + '% a.a.' : (f.tirAcima ? '> 1.000%' : '—')),
          kpi('VPL ' + f.horizonte + ' anos', U.brl(f.vpl))),
        mini
      ];
      blocos.forEach(function (b) { if (b) resumo.appendChild(b); });
      App.Chart.desenhar(mini, { consumo: r.consumoMeses, geracao: r.geracaoMeses, titulo: 'Consumo × Geração — ' + U.kwp(r.kwp) + ' kWp' });
      if (r.alertas.length) {
        resumo.appendChild(h('ul.alertas', r.alertas.map(function (a) { return h('li.' + a.nivel, a.msg); })));
      } else {
        resumo.appendChild(h('p.tudo-ok', '✅ Dimensionamento sem alertas.'));
      }
      resumo.appendChild(h('div.resumo-acoes',
        h('button.btn', { type: 'button', onclick: function () { salvar(true); } }, 'Salvar'),
        h('button.btn.primario', { type: 'button', onclick: gerarDocx }, '⬇ Gerar .docx')));
    }

    /* ---------------- salvar / gerar */

    function salvar(avisar) {
      if (!p.clienteId) { UI.toast('Selecione o cliente antes de salvar.', 'erro'); secoes.cliente.el.scrollIntoView({ behavior: 'smooth' }); return false; }
      const cli = ctx.clientes.find(function (x) { return x.id === p.clienteId; });
      const novo = !p.id;
      if (novo && S.list('propostas').some(function (x) { return x.numero === p.numero; })) {
        const n = S.proximoNumero(p.data);
        p.numero = n.numero;
        p._seq = n;
      }
      const seq = p._seq;
      delete p._seq;
      p.clienteNome = cli ? cli.nome : '';
      p.resumo = {
        kwp: r.kwp, total: r.total, kwh: r.hibrido ? r.hibrido.capInstalada : 0,
        payback: r.fin.paybackSimples, geracao: r.geracaoMensal, cidade: r.cidade
      };
      try { S.save('propostas', p); } catch (e) { UI.toast(e.message, 'erro'); return false; }
      if (seq) S.reservarNumero(seq.dia, seq.seq);
      sujo = false;
      if (novo) UI.substituirHash('#/proposta/' + p.id);
      desenhar('ident');
      atualizar();
      if (avisar) UI.toast('Proposta ' + p.numero + ' salva.', 'ok');
      return true;
    }

    async function gerarDocx() {
      atualizar();
      const erros = r.alertas.filter(function (a) { return a.nivel === 'erro'; });
      if (!p.clienteId) { UI.toast('Selecione o cliente.', 'erro'); return; }
      if (erros.length) {
        const continuar = await UI.confirmar('Há pendências no dimensionamento: ' + erros.map(function (e) { return e.msg; }).join(' ') + ' Gerar mesmo assim?', 'Gerar mesmo assim');
        if (!continuar) return;
      }
      if (sujo && !salvar(false)) return;
      btnDocx.disabled = true;
      btnDocx.textContent = 'Gerando…';
      try {
        const g = await App.Docx.gerar(p, ctx);
        U.download(g.blob, g.nome);
        UI.toast('Proposta gerada: ' + g.nome, 'ok');
      } catch (e) {
        console.error(e);
        UI.toast('Falha ao gerar o documento: ' + e.message, 'erro');
      } finally {
        btnDocx.disabled = false;
        btnDocx.textContent = '⬇ Gerar proposta (.docx)';
      }
    }

    desenharTudo();
    atualizar();
    // proposta nova ainda não foi alterada pelo usuário: não exigir confirmação para sair se nada for preenchido
    if (!id) {
      const inicial = JSON.stringify(p);
      UI.guarda = function () { return !sujo || JSON.stringify(p) === inicial || confirm('A proposta tem alterações não salvas. Deseja sair mesmo assim?'); };
    }
  }
})(window.App);
