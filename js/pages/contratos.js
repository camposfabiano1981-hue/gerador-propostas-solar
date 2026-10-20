/* Contratos de prestação de serviços: lista, formulário (a partir de uma proposta ou em branco) e editor de cláusulas. */
(function (App) {
  'use strict';

  const U = App.U, UI = App.UI, S = App.Store, C = App.Calc, K = App.Contrato;
  const h = U.h;

  const COR_STATUS = { rascunho: 'cinza', enviado: 'azul', assinado: 'ok', concluido: 'roxo', cancelado: 'erro' };

  function statusBadge(s) {
    const st = K.STATUS.find(function (x) { return x.id === s; }) || K.STATUS[0];
    return UI.badge(st.label, COR_STATUS[st.id]);
  }

  async function baixar(ct, formato, botao) {
    const rotulo = botao ? botao.textContent : '';
    if (botao) { botao.disabled = true; botao.textContent = '…'; }
    try {
      const ctx = C.contexto();
      const g = formato === 'pdf' ? await K.gerarPdf(ct, ctx) : await K.gerarDocx(ct, ctx);
      U.download(g.blob, g.nome);
      UI.toast('Contrato gerado: ' + g.nome, 'ok');
    } catch (e) {
      console.error(e);
      UI.toast('Falha ao gerar o contrato: ' + e.message, 'erro');
    } finally {
      if (botao) { botao.disabled = false; botao.textContent = rotulo; }
    }
  }

  /* ------------------------------------------------------------ editor de cláusulas (contrato e modelo padrão) */

  /**
   * Edita a estrutura do modelo de contrato: textos das cláusulas por seção e o termo de garantia.
   * Usado no formulário do contrato (cópia própria) e em Textos padrão (modelo para novos contratos).
   */
  App.editorModeloContrato = function (modelo, aoMudar) {
    const box = h('div.editor-contrato');
    const mudou = function () { if (aoMudar) aoMudar(); };
    box.appendChild(h('div.nota', 'Marcadores: {objeto}, {kwp}, {prazoDias}, {prazoExtenso}, {valorExtenso}, {local} (local da produção), {cidade}, {uf}, {foro}, {perdas}, {pr}, ',
      '{cl:ID} (número da cláusula com o id indicado, ex.: {cl:pagamento}). Use **texto** para negrito sublinhado. As cláusulas são numeradas automaticamente.'));
    box.appendChild(UI.grade([
      { k: 'titulo', label: 'Título do contrato' },
      { k: 'subtitulo', label: 'Subtítulo padrão' }
    ], modelo, mudou, 2));

    (modelo.secoes || []).forEach(function (s) {
      const det = h('details.bloco-clausulas');
      det.appendChild(h('summary', s.titulo + (s.tipo === 'producao' ? ' (gráfico de produção)' : s.tipo === 'equipamentos' ? ' (tabelas de equipamentos)' : s.tipo === 'garantias' ? ' (termo de garantia)' : '')));
      const corpo = h('div.secao-corpo');
      corpo.appendChild(UI.campo({ k: 'titulo', label: 'Título da seção' }, s, mudou));
      if (s.tipo === 'producao') {
        corpo.appendChild(UI.campo({ k: 'paragrafo', label: 'Parágrafo único', type: 'textarea', rows: 4 }, s, mudou));
        corpo.appendChild(UI.campo({ k: 'fonte', label: 'Fonte (abaixo do gráfico)', type: 'textarea', rows: 2 }, s, mudou));
      }
      if (s.tipo === 'garantias') corpo.appendChild(editorGarantias(modelo.garantias || (modelo.garantias = {}), mudou));
      const lista = h('div.secao-corpo');
      const desenharClausulas = function () {
        lista.innerHTML = '';
        (s.clausulas || []).forEach(function (c, i) {
          const rot = c.semNumero ? (c.rotulo || 'Parágrafo Único') : 'Cláusula' + (c.rotulo ? ' – ' + c.rotulo : '') + (c.id ? '  [id: ' + c.id + ']' : '');
          lista.appendChild(h('div.clausula-edit',
            UI.campo({ k: 'texto', label: rot, type: 'textarea', rows: 3 }, c, mudou),
            c.id ? null : h('button.btn-icone.perigo', {
              type: 'button', title: 'Remover cláusula', 'aria-label': 'Remover cláusula',
              onclick: function () { s.clausulas.splice(i, 1); mudou(); desenharClausulas(); }
            }, '×')));
        });
      };
      desenharClausulas();
      if (s.clausulas || (!s.tipo || s.tipo === 'pagamento')) {
        corpo.appendChild(lista);
        corpo.appendChild(h('div.barra-itens',
          h('button.btn.pequeno', { type: 'button', onclick: function () { (s.clausulas = s.clausulas || []).push({ texto: '' }); mudou(); desenharClausulas(); } }, '+ Cláusula'),
          h('button.btn.pequeno', { type: 'button', onclick: function () { (s.clausulas = s.clausulas || []).push({ rotulo: 'Parágrafo Único', semNumero: true, texto: '' }); mudou(); desenharClausulas(); } }, '+ Parágrafo único')));
      }
      det.appendChild(corpo);
      box.appendChild(det);
    });
    return box;
  };

  function editorGarantias(g, mudou) {
    const box = h('div.secao-corpo');
    box.appendChild(UI.campo({ k: 'objeto', label: 'Objeto da garantia', type: 'textarea', rows: 3 }, g, mudou));
    box.appendChild(UI.campo({ k: 'prazosIntro', label: 'Introdução da tabela de prazos', type: 'textarea', rows: 2 }, g, mudou));
    const tab = h('div');
    const desenharTabela = function () {
      tab.innerHTML = '';
      const tb = h('tbody');
      (g.tabela = g.tabela || []).forEach(function (l, i) {
        tb.appendChild(h('tr',
          h('td', UI.campo({ k: 'item' }, l, mudou)),
          h('td', { style: { width: '130px' } }, UI.campo({ k: 'prazo' }, l, mudou)),
          h('td', UI.campo({ k: 'cobertura' }, l, mudou)),
          h('td.acoes-col', h('button.btn-icone.perigo', { type: 'button', 'aria-label': 'Remover linha', onclick: function () { g.tabela.splice(i, 1); mudou(); desenharTabela(); } }, '×'))));
      });
      tab.appendChild(h('div.campo', h('label', 'Prazos e cobertura'), h('div.tabela-rolagem', h('table.tabela.editavel',
        h('thead', h('tr', ['Item', 'Prazo', 'Cobertura', ''].map(function (t) { return h('th', t); }))), tb))));
      tab.appendChild(h('div.barra-itens', h('button.btn.pequeno', { type: 'button', onclick: function () { g.tabela.push({ item: '', prazo: '', cobertura: '' }); mudou(); desenharTabela(); } }, '+ Linha')));
    };
    desenharTabela();
    box.appendChild(tab);
    box.appendChild(UI.grade([
      { k: 'suporte', label: 'Suporte ao acionamento', type: 'textarea', cls: 'span2' },
      { k: 'coberturaIntro', label: 'Condições de cobertura — introdução', cls: 'span2' },
      { k: 'cobertura', label: 'Itens cobertos (um por linha)', type: 'linhas', cls: 'span2' },
      { k: 'exclusoesIntro', label: 'Exclusões — introdução', cls: 'span2' },
      { k: 'exclusoes', label: 'Exclusões (uma por linha)', type: 'linhas', rows: 8, cls: 'span2' },
      { k: 'procedimentoIntro', label: 'Procedimento — introdução', cls: 'span2' },
      { k: 'procedimento', label: 'Informações obrigatórias (uma por linha)', type: 'linhas', cls: 'span2' },
      { k: 'atendimento', label: 'Prazo de atendimento', type: 'textarea', cls: 'span2' },
      { k: 'obrigacoesIntro', label: 'Obrigações do contratante — introdução', cls: 'span2' },
      { k: 'obrigacoes', label: 'Obrigações (uma por linha)', type: 'linhas', cls: 'span2' },
      { k: 'limitacao', label: 'Limitação de responsabilidade (um parágrafo por linha)', type: 'linhas', rows: 4, cls: 'span2' },
      { k: 'disposicoes', label: 'Disposições gerais (uma por linha)', type: 'linhas', cls: 'span2' }
    ], g, mudou, 2));
    return box;
  }

  /* ------------------------------------------------------------ lista */

  function tabela(lista, recarregar) {
    const tb = h('tbody');
    lista.forEach(function (ct) {
      const btnPdf = h('button.btn-formato.pdf', { type: 'button', title: 'Baixar contrato em PDF', onclick: function () { baixar(ct, 'pdf', btnPdf); } }, 'PDF');
      const btnDocx = h('button.btn-formato', { type: 'button', title: 'Baixar contrato em Word (.docx)', onclick: function () { baixar(ct, 'docx', btnDocx); } }, 'DOCX');
      const sel = h('select.status-sel', { 'aria-label': 'Situação', onchange: function () { ct.status = sel.value; S.save('contratos', ct); UI.toast('Situação atualizada.'); recarregar(); } },
        K.STATUS.map(function (s) { const o = h('option', { value: s.id }, s.label); if (s.id === ct.status) o.selected = true; return o; }));
      tb.appendChild(h('tr', { onclick: function (e) { if (!e.target.closest('button,select')) UI.ir('#/contrato/' + ct.id); } },
        h('td', h('strong', ct.numero), h('div.mini', U.dataBR(ct.data))),
        h('td', ct.clienteNome || (ct.clienteSnapshot && ct.clienteSnapshot.nome) || '—', ct.propostaNumero ? h('div.mini', 'Proposta ' + ct.propostaNumero) : null),
        h('td', h('div.texto-curto', ct.objeto || '—')),
        h('td.num', U.brl(K.total(ct))),
        h('td', statusBadge(ct.status), sel),
        h('td.acoes-col', btnPdf, btnDocx,
          h('button.btn-icone.perigo', {
            type: 'button', title: 'Excluir', 'aria-label': 'Excluir', onclick: async function () {
              if (await UI.confirmar('Excluir o contrato ' + ct.numero + '?', 'Excluir', true)) {
                S.remove('contratos', ct.id);
                UI.toast('Contrato excluído.');
                recarregar();
              }
            }
          }, '🗑'))));
    });
    return h('div.tabela-rolagem', h('table.tabela.propostas',
      h('thead', h('tr', ['Nº / data', 'Contratante', 'Objeto', 'Valor', 'Situação', ''].map(function (t, i) { return h('th' + (i === 3 ? '.num' : ''), t); }))),
      tb));
  }

  UI.rota('/contratos', function (cont) {
    const filtro = { q: '', status: '' };
    const box = h('div.card.sem-pad');
    function desenhar() {
      let lista = S.list('contratos');
      const q = filtro.q.trim().toLowerCase();
      if (q) lista = lista.filter(function (c) { return [c.numero, c.clienteNome, c.objeto, c.propostaNumero].join(' ').toLowerCase().indexOf(q) >= 0; });
      if (filtro.status) lista = lista.filter(function (c) { return c.status === filtro.status; });
      lista.sort(function (a, b) { return String(b.numero).localeCompare(String(a.numero)); });
      box.innerHTML = '';
      if (!lista.length) {
        box.appendChild(h('div.vazio', h('p', S.list('contratos').length ? 'Nenhum contrato encontrado com esses filtros.' : 'Nenhum contrato ainda. Crie a partir de uma proposta aprovada ou em branco.'),
          h('a.btn.primario', { href: '#/contrato/novo' }, '+ Novo contrato')));
        return;
      }
      box.appendChild(tabela(lista, desenhar));
    }
    const busca = h('input.busca', { type: 'search', placeholder: 'Nº, cliente ou objeto…', oninput: function () { filtro.q = busca.value; desenhar(); } });
    const selStatus = h('select', { 'aria-label': 'Filtrar por situação', onchange: function () { filtro.status = selStatus.value; desenhar(); } },
      h('option', { value: '' }, 'Todas as situações'), K.STATUS.map(function (s) { return h('option', { value: s.id }, s.label); }));
    cont.appendChild(UI.cabecalho('Contratos', 'Contratos de prestação de serviços gerados a partir das propostas. PDF / DOCX baixam o contrato.', [
      busca, selStatus, h('a.btn.primario', { href: '#/contrato/novo' }, '+ Novo contrato')
    ]));
    cont.appendChild(box);
    desenhar();
  });

  /* ------------------------------------------------------------ formulário */

  UI.rota('/contrato/novo', function (cont, params, qs) { formulario(cont, null, qs); });
  UI.rota('/contrato/:id', function (cont, params, qs) { formulario(cont, params.id, qs); });

  function normalizar(ct, ctx) {
    const base = K.novo(ctx);
    Object.keys(base).forEach(function (k) { if (ct[k] === undefined && k !== '_seq' && k !== 'numero') ct[k] = U.clone(base[k]); });
    ct.producao = Object.assign(U.clone(base.producao), ct.producao || {});
    if (!Array.isArray(ct.producao.meses) || ct.producao.meses.length !== 12) ct.producao.meses = Array(12).fill('');
    if (!Array.isArray(ct.equipamentos)) ct.equipamentos = [];
    if (!Array.isArray(ct.parcelas)) ct.parcelas = [];
    return ct;
  }

  function formulario(cont, id, qs) {
    let ctx = C.contexto();
    let ct;
    if (id) {
      const salvo = S.get('contratos', id);
      if (!salvo) { UI.toast('Contrato não encontrado.', 'erro'); UI.ir('#/contratos'); return; }
      ct = normalizar(U.clone(salvo), ctx);
    } else {
      const prop = qs && qs.get('proposta') ? S.get('propostas', qs.get('proposta')) : null;
      try {
        ct = prop ? K.deProposta(prop, ctx) : K.novo(ctx);
      } catch (e) {
        console.error(e);
        UI.toast('Não foi possível ler a proposta: ' + e.message, 'erro');
        ct = K.novo(ctx);
      }
    }
    let sujo = !id;
    const inicial = id ? null : JSON.stringify(ct);
    const alterado = function () { return sujo && (ct.id || JSON.stringify(ct) !== inicial); };
    UI.guarda = function () { return !alterado() || confirm('O contrato tem alterações não salvas. Deseja sair mesmo assim?'); };
    window.onbeforeunload = function (e) { if (alterado() && document.body.contains(cont.firstChild)) { e.preventDefault(); e.returnValue = ''; } };

    const btnSalvar = h('button.btn', { type: 'button', onclick: function () { salvar(true); } }, 'Salvar');
    const btnPdf = h('button.btn.primario', { type: 'button', onclick: function () { gerar('pdf'); } }, '⬇ Contrato em PDF');
    const btnDocx = h('button.btn', { type: 'button', onclick: function () { gerar('docx'); } }, '⬇ Word (.docx)');
    const titulo = h('h1', id ? 'Contrato ' + ct.numero : 'Novo contrato');
    const subt = h('p.sub', ct.propostaNumero ? 'Gerado a partir da proposta ' + ct.propostaNumero + '.' : 'Contrato em branco — preencha os dados ou importe de uma proposta.');
    cont.appendChild(h('div.pagina-topo', h('div', titulo, subt), h('div.acoes', btnSalvar, btnDocx, btnPdf)));

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
    function desenharTudo() { Object.keys(secoes).forEach(desenhar); }
    const mudou = function () { sujo = true; atualizarResumo(); };

    /* ---------- identificação */
    secao('ident', 'Identificação', function (c) {
      c.appendChild(UI.grade([
        { k: 'numero', label: 'Nº do contrato', readonly: true, help: ct.id ? 'Gerado automaticamente.' : 'Automático — confirmado ao salvar.' },
        { k: 'data', label: 'Data de assinatura', type: 'date' },
        { k: 'status', label: 'Situação', type: 'select', options: K.STATUS.map(function (s) { return { v: s.id, t: s.label }; }) }
      ], ct, function (k) {
        if (k === 'data' && !ct.id) { const n = S.proximoNumero(ct.data, 'contrato'); ct.numero = n.numero; ct._seq = n; desenhar('ident'); }
        mudou();
      }, 3));
      const props = S.list('propostas').slice().sort(function (a, b) { return String(b.numero).localeCompare(String(a.numero)); });
      const estado = { propostaId: ct.propostaId || '' };
      c.appendChild(h('div.linha-campo',
        UI.campo({ k: 'propostaId', label: 'Proposta de origem', type: 'select', options: [{ v: '', t: '— nenhuma —' }].concat(props.map(function (p) {
          return { v: p.id, t: p.numero + ' — ' + (p.clienteNome || 'sem cliente') + ((p.resumo || {}).total ? ' — ' + U.brl(p.resumo.total) : '') };
        })) }, estado),
        h('button.btn', {
          type: 'button', onclick: async function () {
            const prop = estado.propostaId ? S.get('propostas', estado.propostaId) : null;
            if (!prop) { UI.toast('Selecione a proposta.', 'erro'); return; }
            if (!(await UI.confirmar('Importar cliente, objeto, produção, equipamentos e parcelas da proposta ' + prop.numero + '? Os dados atuais desses campos serão substituídos (as cláusulas são mantidas).', 'Importar'))) return;
            const novo = K.deProposta(prop, ctx);
            ['propostaId', 'propostaNumero', 'clienteId', 'clienteSnapshot', 'consumoMedio', 'kwp', 'objeto', 'subtitulo', 'producao', 'equipamentos', 'parcelas']
              .forEach(function (k) { ct[k] = novo[k]; });
            sujo = true;
            subt.textContent = 'Gerado a partir da proposta ' + ct.propostaNumero + '.';
            desenharTudo();
            atualizarResumo();
            UI.toast('Dados importados da proposta ' + prop.numero + '.', 'ok');
          }
        }, 'Importar dados da proposta')));
    });

    /* ---------- contratante */
    secao('cliente', 'Contratante', function (c) {
      const opts = [{ v: '', t: '— selecione —' }].concat(ctx.clientes.slice().sort(function (a, b) { return String(a.nome).localeCompare(String(b.nome), 'pt-BR'); })
        .map(function (x) { return { v: x.id, t: x.nome + (x.documento ? ' — ' + x.documento : '') }; }));
      c.appendChild(h('div.linha-campo',
        UI.campo({ k: 'clienteId', label: 'Cliente', type: 'select', options: opts, required: true }, ct, function () {
          const cli = ctx.clientes.find(function (x) { return x.id === ct.clienteId; });
          ct.clienteSnapshot = K.snapshotCliente(cli);
          mudou();
          desenhar('cliente');
        }),
        h('a.btn', { href: '#/clientes' }, 'Cadastro de clientes')));
      const cli = ct.clienteSnapshot;
      if (cli) {
        const faltando = [!cli.documento ? 'CPF/CNPJ' : '', !cli.endereco ? 'endereço' : '', !cli.cidade ? 'cidade' : ''].filter(Boolean);
        c.appendChild(h('div.nota' + (faltando.length ? '.aviso' : ''),
          h('strong', cli.nome), cli.nomeFantasia ? ' (' + cli.nomeFantasia + ')' : '', h('br'),
          [cli.documento, cli.inscricaoEstadual ? 'IE ' + cli.inscricaoEstadual : '', [cli.endereco, cli.numero].filter(Boolean).join(', '), cli.bairro, [cli.cidade, cli.uf].filter(Boolean).join('/'), cli.telefone, cli.email].filter(Boolean).join(' · '),
          faltando.length ? h('div', 'Complete no cadastro do cliente: ' + faltando.join(', ') + '.') : null));
      }
      c.appendChild(UI.grade([
        { k: 'consumoMedio', label: 'Consumo médio contratado', type: 'number', suffix: 'kWh/mês', help: 'Aparece na identificação do contratante (opcional).' }
      ], ct, mudou, 2));
    });

    /* ---------- objeto e prazos */
    secao('objeto', 'Objeto, prazo e foro', function (c) {
      c.appendChild(UI.grade([
        { k: 'subtitulo', label: 'Subtítulo do contrato', cls: 'span2' },
        { k: 'objeto', label: 'Objeto (serviços contratados)', type: 'textarea', rows: 3, cls: 'span2', help: 'Entra no lugar de {objeto} na cláusula do objeto.' },
        { k: 'kwp', label: 'Potência do sistema', type: 'number', suffix: 'kWp' },
        { k: 'prazoDias', label: 'Prazo de execução', type: 'int', suffix: 'dias', help: function () { return 'Por extenso: ' + U.numeroExtenso(U.numOr(ct.prazoDias, 0)) + ' dias.'; } },
        { k: 'cidade', label: 'Local de assinatura — cidade' },
        { k: 'uf', label: 'UF', type: 'select', options: [{ v: '', t: '—' }].concat(U.UFS.map(function (u) { return { v: u, t: u }; })) },
        { k: 'foro', label: 'Foro (comarca)', cls: 'span2', help: 'Ex.: Corumbá – MS' }
      ], ct, mudou, 2));
    });

    /* ---------- produção */
    secao('producao', 'Produção média prometida', function (c) {
      const pr = ct.producao;
      const canvas = h('canvas.mini-grafico', { width: 1800, height: 772 });
      const redesenharGrafico = function () {
        App.Chart.desenharProducao(canvas, {
          meses: pr.meses.map(function (v) { return U.numOr(v, 0); }), consumo: U.num(pr.consumo),
          titulo: 'ESTIMATIVA DE PRODUÇÃO MENSAL' + (U.num(ct.kwp) > 0 ? ' – ' + U.kwp(U.num(ct.kwp)) + ' kWp' : ''), subtitulo: pr.subtitulo
        });
      };
      const aoMudar = function () { mudou(); redesenharGrafico(); };
      c.appendChild(UI.campo({ k: 'incluir', label: 'Incluir a seção de produção com gráfico no contrato', type: 'checkbox' }, pr, function () { mudou(); desenhar('producao'); }));
      if (!pr.incluir) return;
      const g = h('div.meses');
      U.MESES.forEach(function (m, i) { g.appendChild(UI.campo({ k: 'meses.' + i, label: m, type: 'number' }, pr, aoMudar)); });
      c.appendChild(h('div.campo', h('label', 'Geração estimada por mês (kWh)'), g));
      c.appendChild(UI.grade([
        { k: 'consumo', label: 'Consumo contratado (linha do gráfico)', type: 'number', suffix: 'kWh/mês' },
        { k: 'local', label: 'Local (texto do parágrafo)' },
        { k: 'perdas', label: 'Perdas sistêmicas', type: 'number', suffix: '%' },
        { k: 'pr', label: 'Eficiência (PR)', type: 'number', suffix: '%' },
        { k: 'subtitulo', label: 'Subtítulo do gráfico', cls: 'span2' }
      ], pr, aoMudar, 2));
      c.appendChild(canvas);
      redesenharGrafico();
    });

    /* ---------- equipamentos */
    secao('equip', 'Equipamentos contratados', function (c) {
      c.appendChild(h('p.ajuda', 'Cada grupo vira uma tabela da seção "Dos equipamentos contratados". Especificação = Característica | Especificação; Lista = Item | Fabricante | Qtde.'));
      ct.equipamentos.forEach(function (gr, gi) {
        const card = h('div.grupo-equip');
        const linhas = gr.tipo === 'lista' ? (gr.itens = gr.itens || []) : (gr.linhas = gr.linhas || []);
        const tb = h('tbody');
        linhas.forEach(function (l, li) {
          const est = {};
          l.forEach(function (v, j) { est[j] = v; });
          const ed = function (j) { return function () { l[j] = est[j]; mudou(); }; };
          tb.appendChild(h('tr',
            l.map(function (v, j) { return h('td', UI.campo({ k: String(j) }, est, ed(j))); }),
            h('td.acoes-col', h('button.btn-icone.perigo', { type: 'button', 'aria-label': 'Remover linha', onclick: function () { linhas.splice(li, 1); mudou(); desenhar('equip'); } }, '×'))));
        });
        const cab = gr.tipo === 'lista' ? ['Item / descrição', 'Fabricante', 'Qtde'] : ['Característica', 'Especificação'];
        card.appendChild(h('div.grupo-topo',
          UI.campo({ k: 'titulo', label: 'Grupo ' + (gi + 1) + (gr.tipo === 'lista' ? ' — lista' : ' — especificação') }, gr, mudou),
          h('div.acoes',
            h('button.btn-icone', { type: 'button', title: 'Subir', 'aria-label': 'Subir grupo', disabled: gi === 0, onclick: function () { ct.equipamentos.splice(gi - 1, 0, ct.equipamentos.splice(gi, 1)[0]); mudou(); desenhar('equip'); } }, '↑'),
            h('button.btn-icone', { type: 'button', title: 'Descer', 'aria-label': 'Descer grupo', disabled: gi === ct.equipamentos.length - 1, onclick: function () { ct.equipamentos.splice(gi + 1, 0, ct.equipamentos.splice(gi, 1)[0]); mudou(); desenhar('equip'); } }, '↓'),
            h('button.btn-icone.perigo', { type: 'button', title: 'Remover grupo', 'aria-label': 'Remover grupo', onclick: function () { ct.equipamentos.splice(gi, 1); mudou(); desenhar('equip'); } }, '🗑'))));
        card.appendChild(h('div.tabela-rolagem', h('table.tabela.editavel', h('thead', h('tr', cab.concat(['']).map(function (t) { return h('th', t); }))), tb)));
        card.appendChild(h('div.barra-itens', h('button.btn.pequeno', {
          type: 'button', onclick: function () { linhas.push(gr.tipo === 'lista' ? ['', '', ''] : ['', '']); mudou(); desenhar('equip'); }
        }, '+ Linha')));
        c.appendChild(card);
      });
      c.appendChild(h('div.barra-itens',
        h('button.btn.pequeno', { type: 'button', onclick: function () { ct.equipamentos.push({ titulo: 'Novo equipamento', tipo: 'spec', linhas: [['Fabricante', ''], ['Modelo', ''], ['Quantidade', ''], ['Garantia', '']] }); mudou(); desenhar('equip'); } }, '+ Grupo (especificação)'),
        h('button.btn.pequeno', { type: 'button', onclick: function () { ct.equipamentos.push({ titulo: 'Itens', tipo: 'lista', itens: [['', '', '']] }); mudou(); desenhar('equip'); } }, '+ Grupo (lista)')));
    });

    /* ---------- pagamento */
    const totalInfo = h('div.nota');
    function atualizarTotal() {
      const v = K.total(ct);
      totalInfo.innerHTML = '';
      totalInfo.appendChild(h('strong', 'Total do contrato: ' + U.brl(v)));
      totalInfo.appendChild(h('div', U.brl(v) + ' (' + U.extenso(v) + ')'));
    }
    secao('pagamento', 'Preço e parcelas', function (c) {
      const tb = h('tbody');
      ct.parcelas.forEach(function (pc, i) {
        tb.appendChild(h('tr',
          h('td.num', U.ordinal(i + 1)),
          h('td', { style: { width: '140px' } }, UI.campo({ k: 'valor', type: 'money' }, pc, function () { mudou(); atualizarTotal(); })),
          h('td', UI.campo({ k: 'descricao' }, pc, mudou)),
          h('td', UI.campo({ k: 'forma' }, pc, mudou)),
          h('td', { style: { width: '70px', textAlign: 'center' } }, UI.campo({ k: 'banco', type: 'checkbox', label: '' }, pc, mudou)),
          h('td.acoes-col', h('button.btn-icone.perigo', { type: 'button', 'aria-label': 'Remover parcela', onclick: function () { ct.parcelas.splice(i, 1); mudou(); desenhar('pagamento'); } }, '×'))));
      });
      c.appendChild(h('div.tabela-rolagem', h('table.tabela.editavel',
        h('thead', h('tr', ['Parcela', 'Valor', 'Descrição', 'Forma / prazo', 'Dados bancários', ''].map(function (t) { return h('th', t); }))), tb)));
      const padrao = { total: K.total(ct), equip: (ct.parcelas.length === 3 && !ct.parcelas[0].banco) ? U.numOr(ct.parcelas[0].valor, 0) : 0 };
      c.appendChild(h('div.barra-itens',
        h('button.btn.pequeno', { type: 'button', onclick: function () { ct.parcelas.push({ valor: 0, descricao: '', forma: '', banco: true }); mudou(); desenhar('pagamento'); } }, '+ Parcela')));
      c.appendChild(h('details.bloco-clausulas', h('summary', 'Recalcular parcelas padrão (equipamentos + 50% / 50% dos serviços)'),
        h('div.secao-corpo',
          UI.grade([
            { k: 'total', label: 'Valor total do contrato', type: 'money' },
            { k: 'equip', label: 'Valor dos equipamentos (1ª parcela)', type: 'money' }
          ], padrao, null, 2),
          h('div.barra-itens', h('button.btn', {
            type: 'button', onclick: function () {
              ct.parcelas = K.parcelasPadrao(padrao.total, padrao.equip);
              mudou(); desenhar('pagamento');
            }
          }, 'Recalcular parcelas')))));
      c.appendChild(totalInfo);
      const bc = ctx.empresa.banco || {};
      c.appendChild(h('div.nota' + (bc.banco || bc.pix ? '' : '.aviso'),
        bc.banco || bc.pix ? 'Os dados bancários vêm de Configurações › Empresa e aparecem para as parcelas marcadas.' : 'Dados bancários não cadastrados — ',
        bc.banco || bc.pix ? null : h('a', { href: '#/empresa' }, 'cadastre em Configurações › Empresa'),
        bc.banco || bc.pix ? null : ' para incluí-los no contrato.'));
      atualizarTotal();
    });

    /* ---------- cláusulas */
    secao('clausulas', 'Cláusulas e termo de garantia', function (c) {
      c.appendChild(h('p.ajuda', 'Este contrato tem uma cópia própria das cláusulas. Para alterar o padrão dos próximos contratos, use Configurações › Modelo de contrato.'));
      c.appendChild(App.editorModeloContrato(ct.modelo, mudou));
      c.appendChild(h('div.barra-itens', h('button.btn.pequeno', {
        type: 'button', onclick: async function () {
          if (!(await UI.confirmar('Substituir as cláusulas deste contrato pelo modelo padrão atual?', 'Substituir'))) return;
          ct.modelo = U.clone(S.config().contrato);
          mudou(); desenhar('clausulas');
        }
      }, 'Restaurar cláusulas do modelo padrão')));
    });

    /* ---------- resumo */
    function atualizarResumo() {
      resumo.innerHTML = '';
      const cli = ct.clienteSnapshot;
      const pend = [];
      if (!ct.clienteId) pend.push('Selecione o contratante.');
      if (!(K.total(ct) > 0)) pend.push('Informe o valor das parcelas.');
      if (!ctx.empresa.razaoSocial && !ctx.empresa.endereco) pend.push('Complete os dados da empresa (razão social, endereço, contatos).');
      resumo.appendChild(h('div.card.resumo',
        h('div.resumo-topo', h('span', 'Contrato'), h('strong', ct.numero)),
        h('div.kpis',
          h('div.kpi', h('span', 'Valor total'), h('strong', U.brl(K.total(ct)))),
          h('div.kpi', h('span', 'Parcelas'), h('strong', String(ct.parcelas.length))),
          h('div.kpi', h('span', 'Prazo'), h('strong', U.numOr(ct.prazoDias, 0) + ' dias'))),
        h('p.mini', cli ? cli.nome : 'Sem contratante'),
        pend.length ? h('div.nota.aviso', h('ul', pend.map(function (x) { return h('li', x); }))) : h('div.nota.ok', 'Pronto para gerar.'),
        h('div.resumo-acoes', h('button.btn.primario', { type: 'button', onclick: function () { gerar('pdf'); } }, '⬇ PDF'), h('button.btn', { type: 'button', onclick: function () { gerar('docx'); } }, '⬇ DOCX'))));
    }

    function salvar(avisar) {
      if (!ct.clienteId) { UI.toast('Selecione o contratante antes de salvar.', 'erro'); secoes.cliente.el.scrollIntoView({ behavior: 'smooth' }); return false; }
      const cli = ctx.clientes.find(function (x) { return x.id === ct.clienteId; });
      if (cli) ct.clienteSnapshot = K.snapshotCliente(cli);
      const novo = !ct.id;
      if (novo) {
        const n = S.proximoNumero(ct.data, 'contrato');
        ct.numero = n.numero;
        ct._seq = n;
      }
      const seq = ct._seq;
      delete ct._seq;
      ct.clienteNome = ct.clienteSnapshot ? ct.clienteSnapshot.nome : '';
      ct.valorTotal = K.total(ct);
      try { S.save('contratos', ct); } catch (e) { UI.toast(e.message, 'erro'); return false; }
      if (seq) S.reservarNumero(seq.dia, seq.seq, seq.chave);
      sujo = false;
      if (novo) { UI.substituirHash('#/contrato/' + ct.id); titulo.textContent = 'Contrato ' + ct.numero; }
      desenhar('ident');
      atualizarResumo();
      if (avisar) UI.toast('Contrato ' + ct.numero + ' salvo.', 'ok');
      return true;
    }

    async function gerar(formato) {
      if (!ct.clienteId) { UI.toast('Selecione o contratante.', 'erro'); return; }
      if (sujo && !salvar(false)) return;
      const botao = formato === 'pdf' ? btnPdf : btnDocx;
      await baixar(ct, formato, botao);
    }

    desenharTudo();
    atualizarResumo();
  }
})(window.App);
