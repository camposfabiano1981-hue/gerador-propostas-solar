/* Pedidos de compra: lista, formulário (documento do fornecedor em PDF ou foto, itens e totais) e lançamento dos itens em Materiais e acessórios. */
(function (App) {
  'use strict';

  const U = App.U, UI = App.UI, S = App.Store, Cp = App.Compra, F = App.Fotos;
  const h = U.h;

  let arquivoPendente = null; // documento escolhido na lista, lido ao abrir o novo pedido

  function badge(id) {
    const s = Cp.SITUACOES.find(function (x) { return x.id === id; }) || Cp.SITUACOES[0];
    return UI.badge(s.label, s.cor);
  }

  function vinculados(c) {
    const ids = {};
    S.list('equipamentos').forEach(function (e) { ids[e.id] = true; });
    const itens = (c.itens || []).filter(function (it) { return String(it.descricao || '').trim(); });
    return { n: itens.filter(function (it) { return it.equipamentoId && ids[it.equipamentoId]; }).length, total: itens.length };
  }

  /** Pedido de compra em PDF (para enviar ao fornecedor). */
  async function baixarPdf(c, botao) {
    const rotulo = botao ? botao.textContent : '';
    if (botao) { botao.disabled = true; botao.textContent = 'Gerando…'; }
    try {
      const g = await App.Relatorios.pdfCompra(c, App.Calc.contexto());
      U.download(g.blob, g.nome);
      UI.toast('PDF gerado: ' + g.nome, 'ok');
    } catch (e) {
      console.error(e);
      UI.toast('Falha ao gerar o PDF: ' + e.message, 'erro');
    } finally {
      if (botao) { botao.disabled = false; botao.textContent = rotulo; }
    }
  }

  function seletorArquivo(rotulo, aoEscolher, cls) {
    const input = h('input', { type: 'file', accept: 'application/pdf,image/*', onchange: function () { const f = input.files[0]; input.value = ''; if (f) aoEscolher(f); } });
    return h('label.btn' + (cls ? '.' + cls : ''), input, rotulo);
  }

  /* ------------------------------------------------------------ lista */

  UI.rota('/compras', function (cont) {
    const filtro = { q: '', situacao: '' };
    const box = h('div.card.sem-pad');
    function desenhar() {
      let lista = S.list('compras');
      const q = filtro.q.trim().toLowerCase();
      if (q) lista = lista.filter(function (c) { return [c.numero, c.docFornecedor, c.fornecedor && c.fornecedor.nome, (c.itens || []).map(function (i) { return i.descricao; }).join(' ')].join(' ').toLowerCase().indexOf(q) >= 0; });
      if (filtro.situacao) lista = lista.filter(function (c) { return c.situacao === filtro.situacao; });
      lista.sort(function (a, b) { return String(b.data).localeCompare(String(a.data)) || String(b.numero).localeCompare(String(a.numero)); });
      box.innerHTML = '';
      if (!lista.length) {
        box.appendChild(h('div.vazio', h('p', S.list('compras').length ? 'Nenhum pedido de compra com esses filtros.' : 'Nenhum pedido de compra ainda. Carregue o PDF ou a foto do orçamento do fornecedor para ler os itens.'),
          seletorArquivo('📄 Carregar PDF ou foto', function (f) { arquivoPendente = f; UI.ir('#/compra/nova'); }, 'primario')));
        return;
      }
      const insts = {};
      S.list('instalacoes').forEach(function (i) { insts[i.id] = i; });
      const tb = h('tbody');
      lista.forEach(function (c) {
        const t = Cp.totais(c), v = vinculados(c), obra = c.instalacaoId && insts[c.instalacaoId];
        tb.appendChild(h('tr', { onclick: function (e) { if (!e.target.closest('button')) UI.ir('#/compra/' + c.id); } },
          h('td', h('strong', c.numero || '(sem número)'), h('div.mini', U.dataBR(c.data))),
          h('td', (c.fornecedor && c.fornecedor.nome) || '—', c.docFornecedor ? h('div.mini', 'Doc. ' + c.docFornecedor) : null),
          h('td.num', String(v.total)),
          h('td.num', U.brl(t.total)),
          h('td', obra ? obra.titulo || obra.clienteNome : '—'),
          h('td', v.total && v.n === v.total ? UI.badge('No cadastro', 'ok') : (v.n ? UI.badge(v.n + ' de ' + v.total, 'ambar') : UI.badge('Pendente', 'cinza'))),
          h('td', badge(c.situacao)),
          h('td.acoes-col', (function () {
            const btn = h('button.btn-formato.pdf', { type: 'button', title: 'Baixar o pedido em PDF', onclick: function () { baixarPdf(c, btn); } }, 'PDF');
            return btn;
          })(), h('button.btn-icone.perigo', {
            type: 'button', title: 'Excluir', 'aria-label': 'Excluir', onclick: async function () {
              if (!(await UI.confirmar('Excluir o pedido de compra ' + (c.numero || '') + '? Os materiais já lançados no cadastro continuam lá.', 'Excluir', true))) return;
              (c.anexos || []).forEach(function (a) { F.remover(a.fotoId); });
              S.remove('compras', c.id);
              UI.toast('Pedido de compra excluído.');
              desenhar();
            }
          }, '🗑'))));
      });
      box.appendChild(h('div.tabela-rolagem', h('table.tabela', h('thead', h('tr', ['Nº / data', 'Fornecedor', 'Itens', 'Total', 'Obra', 'Cadastro de materiais', 'Situação', ''].map(function (x, i) {
        return h('th' + (i === 2 || i === 3 ? '.num' : ''), x);
      }))), tb)));
    }
    const busca = h('input.busca', { type: 'search', placeholder: 'Fornecedor, nº ou item…', oninput: function () { filtro.q = busca.value; desenhar(); } });
    const sel = h('select', { 'aria-label': 'Filtrar por situação', onchange: function () { filtro.situacao = sel.value; desenhar(); } },
      h('option', { value: '' }, 'Todas as situações'), Cp.SITUACOES.map(function (s) { return h('option', { value: s.id }, s.label); }));
    cont.appendChild(UI.cabecalho('Pedidos de compra', 'Orçamentos e pedidos dos fornecedores: leia o PDF ou a foto, confira os itens e lance-os em Materiais e acessórios com o custo de aquisição.', [
      busca, sel,
      seletorArquivo('📄 Carregar PDF ou foto', function (f) { arquivoPendente = f; UI.ir('#/compra/nova'); }),
      h('a.btn.primario', { href: '#/compra/nova' }, '+ Novo pedido')
    ]));
    cont.appendChild(box);
    desenhar();
  });

  /* ------------------------------------------------------------ formulário */

  UI.rota('/compra/nova', function (cont, params, qs) { formulario(cont, null, qs); });
  UI.rota('/compra/:id', function (cont, params) { formulario(cont, params.id); });

  function normalizar(salvo) {
    const base = Cp.nova();
    const c = Object.assign(base, U.clone(salvo));
    c.fornecedor = Object.assign(Cp.nova().fornecedor, c.fornecedor || {});
    if (!Array.isArray(c.itens)) c.itens = [];
    if (!Array.isArray(c.anexos)) c.anexos = [];
    c.itens.forEach(function (it) { if (!it.id) it.id = 'it-' + U.uid(); });
    return c;
  }

  function formulario(cont, id, qs) {
    let c;
    if (id) {
      const salvo = S.get('compras', id);
      if (!salvo) { UI.toast('Pedido de compra não encontrado.', 'erro'); UI.ir('#/compras'); return; }
      c = normalizar(salvo);
    } else {
      c = Cp.nova();
      c.numero = S.proximoNumero(c.data, 'compra').numero;
      if (qs && qs.get('instalacao')) c.instalacaoId = qs.get('instalacao');
    }
    let sujo = !id;
    const inicial = id ? null : JSON.stringify(c);
    const alterado = function () { return sujo && (c.id || JSON.stringify(c) !== inicial); };
    UI.guarda = function () { return !alterado() || confirm('O pedido de compra tem alterações não salvas. Deseja sair mesmo assim?'); };
    window.onbeforeunload = function (e) { if (alterado() && document.body.contains(cont.firstChild)) { e.preventDefault(); e.returnValue = ''; } };
    let avisosLeitura = [];

    const titulo = h('h1');
    const subt = h('p.sub');
    const atualizarTopo = function () {
      titulo.textContent = (c.id ? 'Pedido de compra ' : 'Novo pedido de compra ') + (c.numero || '');
      subt.textContent = [c.fornecedor.nome, c.docFornecedor ? 'doc. ' + c.docFornecedor : '', c.itens.length ? c.itens.length + (c.itens.length === 1 ? ' item' : ' itens') + ' · ' + U.brl(Cp.totais(c).total) : ''].filter(Boolean).join(' · ') ||
        'Carregue o PDF ou a foto do orçamento do fornecedor, ou digite os itens.';
    };
    atualizarTopo();
    // o PDF sai do pedido gravado (com o número definitivo)
    const gerarPdf = function (botao) {
      if ((sujo || !c.id) && !salvar(false)) return;
      baixarPdf(c, botao);
    };
    const btnPdfTopo = h('button.btn', { type: 'button', onclick: function () { gerarPdf(btnPdfTopo); } }, '⬇ Pedido em PDF');
    cont.appendChild(h('div.pagina-topo', h('div', titulo, subt), h('div.acoes',
      h('a.btn', { href: '#/compras' }, '← Pedidos de compra'),
      btnPdfTopo,
      h('button.btn.primario', { type: 'button', onclick: function () { salvar(true); } }, 'Salvar'))));

    const colForm = h('div.form-col');
    const resumo = h('aside.resumo-col');
    cont.appendChild(h('div.form-layout', h('div', colForm), resumo));
    const secoes = {};
    function secao(chave, tituloSec, construir) {
      const corpo = h('div.secao-corpo');
      const el = h('section.card.secao#sec-' + chave, h('h2', tituloSec), corpo);
      secoes[chave] = { el: el, corpo: corpo, construir: construir };
      colForm.appendChild(el);
    }
    function desenhar(chave) { const s = secoes[chave]; s.corpo.innerHTML = ''; s.construir(s.corpo); }
    const mudou = function () { sujo = true; atualizarTopo(); desenharResumo(); };

    /* ---------- documento do fornecedor */
    const status = h('p.leitura-status', { hidden: true });
    const mostrarStatus = function (t) { status.textContent = t || ''; status.hidden = !t; };

    async function anexar(arquivo) {
      let a;
      try { a = await F.salvarArquivo(arquivo); } catch (e) { console.error(e); UI.toast(e.message || 'Não foi possível ler o arquivo. Use PDF, JPG ou PNG.', 'erro'); return; }
      c.anexos.push(a);
      mudou();
      desenhar('documento');
      if (c.id) salvar(false);
      if (F.ehPdf(arquivo)) ler(a, 'local', arquivo);
      else if (App.IA && App.IA.configurada()) {
        if (await UI.confirmar('Ler os itens desta foto com IA (Claude)? A leitura usa a sua chave da Anthropic e custa alguns centavos de dólar.', 'Ler com IA')) ler(a, 'ia', arquivo);
      } else UI.toast('Foto anexada. Para ler os itens de fotos, configure a leitura com IA (Configurações › Leitura de datasheet); ou digite os itens.');
    }

    async function ler(a, modo, arquivo) {
      const arq = arquivo || await F.arquivo(a);
      if (!arq) { UI.toast('O documento não está neste aparelho. Ligue a sincronização para baixá-lo da nuvem.', 'erro'); return; }
      const pdf = F.ehPdf(arq);
      let lido = null, origem = '';
      try {
        if (modo === 'local') {
          if (!pdf) throw new Error('A leitura no navegador funciona só com PDF. Para foto, use a leitura com IA.');
          mostrarStatus('Lendo o PDF no navegador…');
          const linhas = await App.LeituraLocal.linhasDoPdf(arq);
          if (linhas.length < 3) throw new Error('O PDF não tem texto selecionável (provavelmente é escaneado). Use a leitura com IA ou digite os itens.');
          lido = Cp.lerLinhas(linhas);
          origem = 'Leitura no navegador (sem IA)';
          if (!lido.itens.length) throw new Error('Nenhum item identificado neste PDF. ' + (App.IA.configurada() ? 'Tente a leitura com IA.' : 'Digite os itens ou configure a leitura com IA.'));
        } else {
          if (!App.IA.configurada()) throw new Error('Configure a chave de API em Configurações › Leitura de datasheet (IA) para ler fotos e PDFs escaneados. Ou digite os itens.');
          mostrarStatus('Lendo com IA… pode levar até um minuto.');
          const r = await App.IA.lerPedido(arq, { aoProgredir: function (n) { mostrarStatus('Lendo com IA… ' + n + ' caracteres recebidos.'); } });
          lido = r.lido;
          origem = 'Leitura com IA — ' + App.IA.nomeModelo(r.modeloIA) + (r.custoUSD != null ? ' (≈ US$ ' + r.custoUSD.toFixed(3) + ')' : '');
          if (!lido.itens.length) throw new Error('A IA não encontrou itens neste documento.');
        }
      } catch (e) {
        console.error(e);
        mostrarStatus('');
        UI.toast(e.message, 'erro');
        return;
      }
      mostrarStatus('');
      confirmarLeitura(lido, origem);
    }

    function confirmarLeitura(lido, origem) {
      const k = Cp.conciliar(lido);
      const soma = lido.itens.reduce(function (s, it) { return s + Cp.totalItem(it); }, 0);
      const f = lido.fornecedor || {};
      const corpo = h('div.leitura-pedido',
        h('p.ajuda-sec', origem + '. Confira com o documento antes de usar.'),
        h('div.kpis',
          h('div.kpi', h('span', 'Fornecedor'), h('strong', f.nome || '—'), f.cnpj ? h('small', 'CNPJ ' + f.cnpj) : null),
          h('div.kpi', h('span', 'Documento'), h('strong', lido.docFornecedor || '—'), lido.data ? h('small', U.dataBR(lido.data)) : null),
          h('div.kpi', h('span', 'Itens'), h('strong', String(lido.itens.length)), h('small', 'soma ' + U.brl(soma))),
          h('div.kpi', h('span', 'Total do documento'), h('strong', k.totalDocumento ? U.brl(k.totalDocumento) : '—'),
            U.num(k.desconto) > 0 ? h('small', 'desconto ' + U.brl(U.num(k.desconto))) : null)),
        k.avisos.concat(lido.avisos || []).length ? h('ul.alertas', k.avisos.concat(lido.avisos || []).map(function (x) { return h('li.aviso', x); })) : null,
        h('div.tabela-rolagem', h('table.tabela.compacta',
          h('thead', h('tr', ['Código', 'Descrição', 'Marca', 'Qtd.', 'Preço unit.', 'Total'].map(function (t, i) { return h('th' + (i >= 3 ? '.num' : ''), t); }))),
          h('tbody', lido.itens.map(function (it) {
            return h('tr', h('td', it.codigo || '—'), h('td', it.descricao), h('td', it.marca || '—'),
              h('td.num', U.fmtSmart(U.num(it.qtd), 3) + ' ' + (it.unidade || '')), h('td.num', U.brl(U.num(it.preco))), h('td.num', U.brl(Cp.totalItem(it))));
          })))));
      const aplicar = function (acrescentar) {
        avisosLeitura = Cp.aplicarLeitura(c, lido, acrescentar);
        mudou();
        Object.keys(secoes).forEach(desenhar);
        if (c.id) salvar(false);
        UI.toast(lido.itens.length + ' item(ns) ' + (acrescentar ? 'acrescentado(s)' : 'lido(s)') + ' do documento. Confira e lance em Materiais e acessórios.', 'ok');
      };
      const acoes = [{ label: 'Cancelar' }];
      if (c.itens.some(function (it) { return String(it.descricao || '').trim(); })) acoes.push({ label: 'Acrescentar aos itens', onClick: function () { aplicar(true); } });
      acoes.push({ label: 'Usar estes dados', primario: true, onClick: function () { aplicar(false); } });
      UI.modal({ titulo: 'Dados lidos do documento', largo: true, corpo: corpo, acoes: acoes });
    }

    async function abrirAnexo(a) {
      const reg = await F.obter(a.fotoId);
      if (!reg) { UI.toast('O documento não está neste aparelho. Ligue a sincronização para baixá-lo da nuvem.', 'erro'); return; }
      if (a.tipo === 'application/pdf') {
        const blob = await (await fetch(reg.dataURL)).blob();
        const url = URL.createObjectURL(blob);
        if (!window.open(url, '_blank')) U.download(blob, a.nome || 'documento.pdf');
        setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
      } else UI.modal({ titulo: a.nome || 'Documento', largo: true, corpo: h('img.foto-ampliada', { src: reg.dataURL, alt: a.nome || 'Documento do fornecedor' }), acoes: [{ label: 'Fechar' }] });
    }

    secao('documento', 'Documento do fornecedor', function (box) {
      box.appendChild(h('p.ajuda-sec', 'Anexe o PDF ou a foto do orçamento, pedido ou nota do fornecedor. PDF com texto é lido aqui no navegador, sem custo; ',
        'foto ou PDF escaneado são lidos pela IA (chave em Configurações › Leitura de datasheet). O arquivo fica neste aparelho e na nuvem.'));
      if (c.anexos.length) {
        box.appendChild(h('ul.anexos', c.anexos.map(function (a) {
          const pdf = a.tipo === 'application/pdf';
          return h('li',
            h('span.anexo-icone', pdf ? '📄' : '🖼️'),
            h('button.link-anexo', { type: 'button', title: 'Abrir o documento', onclick: function () { abrirAnexo(a); } }, a.nome || (pdf ? 'documento.pdf' : 'foto.jpg')),
            h('span.cresce'),
            pdf ? h('button.btn.pequeno', { type: 'button', onclick: function () { ler(a, 'local'); } }, 'Ler itens') : null,
            h('button.btn.pequeno', { type: 'button', title: 'Ler com a API do Claude', onclick: function () { ler(a, 'ia'); } }, '✨ Ler com IA'),
            h('button.btn-icone.perigo', {
              type: 'button', title: 'Remover documento', 'aria-label': 'Remover documento', onclick: async function () {
                if (!(await UI.confirmar('Remover este documento do pedido? Os itens já lidos continuam.', 'Remover', true))) return;
                await F.remover(a.fotoId);
                c.anexos.splice(c.anexos.indexOf(a), 1);
                mudou(); desenhar('documento');
                if (c.id) salvar(false);
              }
            }, '×'));
        })));
      }
      box.appendChild(h('div.barra-itens', seletorArquivo(c.anexos.length ? '📎 Anexar outro documento' : '📄 Carregar PDF ou foto', anexar, c.anexos.length ? 'pequeno' : 'primario')));
      box.appendChild(status);
    });

    /* ---------- dados do pedido */
    secao('pedido', 'Pedido', function (box) {
      const insts = S.list('instalacoes').slice().sort(function (a, b) { return String(a.titulo).localeCompare(String(b.titulo), 'pt-BR'); });
      box.appendChild(UI.grade([
        { k: 'numero', label: 'Nº do pedido', readonly: true, help: c.id ? 'Gerado automaticamente.' : 'Automático — confirmado ao salvar.' },
        { k: 'data', label: 'Data', type: 'date' },
        { k: 'situacao', label: 'Situação', type: 'select', options: Cp.SITUACOES.map(function (s) { return { v: s.id, t: s.label }; }) },
        { k: 'docFornecedor', label: 'Nº do orçamento / pedido do fornecedor' },
        { k: 'fornecedor.nome', label: 'Fornecedor', required: true, cls: 'span2' },
        { k: 'fornecedor.cnpj', label: 'CNPJ' },
        { k: 'fornecedor.telefone', label: 'Telefone', type: 'tel' },
        { k: 'fornecedor.cidade', label: 'Cidade' },
        { k: 'vendedor', label: 'Vendedor / contato' },
        { k: 'condicao', label: 'Condição de pagamento' },
        { k: 'prazoEntrega', label: 'Prazo de entrega' },
        { k: 'instalacaoId', label: 'Obra (instalação)', type: 'select', cls: 'span2',
          options: [{ v: '', t: '— estoque / sem obra —' }].concat(insts.map(function (x) { return { v: x.id, t: x.titulo || x.clienteNome }; })),
          help: 'Com a obra, os itens podem ser lançados nos materiais consumidos da instalação.' },
        { k: 'observacoes', label: 'Observações', type: 'textarea', rows: 2, cls: 'span2' }
      ], c, function (k) {
        if (k === 'data' && !c.id) { c.numero = S.proximoNumero(c.data, 'compra').numero; desenhar('pedido'); }
        mudou();
      }, 2));
    });

    /* ---------- itens e totais */
    function campoNum(def, it, aoMudar) {
      const el = UI.campo(def, it, aoMudar);
      el.classList.add('sem-rotulo');
      return el;
    }

    secao('itens', 'Itens', function (box) {
      if (avisosLeitura.length) box.appendChild(h('ul.alertas', avisosLeitura.map(function (x) { return h('li.aviso', x); })));
      const eqs = {};
      S.list('equipamentos').forEach(function (e) { eqs[e.id] = e; });
      const totaisBox = h('div.compra-totais');
      const tb = h('tbody');
      c.itens.forEach(function (it, i) {
        const totalEl = campoNum({ k: 'total', type: 'money' }, it, function () { desenharTotais(); mudou(); });
        const recalcular = function () {
          it.total = U.round(U.numOr(it.qtd, 0) * U.numOr(it.preco, 0), 2);
          totalEl.querySelector('input').value = String(it.total).replace('.', ',');
          desenharTotais(); mudou();
        };
        const eq = it.equipamentoId && eqs[it.equipamentoId];
        tb.appendChild(h('tr',
          h('td.compra-cod', { 'data-rotulo': 'Código' }, campoNum({ k: 'codigo' }, it, mudou)),
          h('td.compra-desc', { 'data-rotulo': 'Descrição' }, campoNum({ k: 'descricao', placeholder: 'Descrição do item' }, it, mudou)),
          h('td.compra-marca', { 'data-rotulo': 'Marca' }, campoNum({ k: 'marca' }, it, mudou)),
          h('td.compra-un', { 'data-rotulo': 'Un.' }, campoNum({ k: 'unidade', type: 'select', options: unidadesDe(it.unidade) }, it, mudou)),
          h('td.compra-qtd', { 'data-rotulo': 'Qtd.' }, campoNum({ k: 'qtd', type: 'number' }, it, recalcular)),
          h('td.compra-preco', { 'data-rotulo': 'Preço unit.' }, campoNum({ k: 'preco', type: 'money' }, it, recalcular)),
          h('td.compra-total', { 'data-rotulo': 'Total' }, totalEl),
          h('td.compra-cad', { 'data-rotulo': 'Cadastro' }, eq ? h('a.badge.ok', { href: '#/equipamentos?tipo=material', title: eq.descricao }, 'No cadastro') : h('span.mini', '—')),
          h('td.acoes-col', h('button.btn-icone.perigo', {
            type: 'button', title: 'Remover item', 'aria-label': 'Remover item', onclick: function () { c.itens.splice(i, 1); mudou(); desenhar('itens'); }
          }, '×'))));
      });
      if (c.itens.length) {
        box.appendChild(h('div.tabela-rolagem', h('table.tabela.editavel.tabela-compra',
          h('thead', h('tr', ['Código', 'Descrição', 'Marca', 'Un.', 'Qtd.', 'Preço unit.', 'Total', 'Cadastro', ''].map(function (t) { return h('th', t); }))), tb)));
      } else box.appendChild(h('p.ajuda-sec', 'Nenhum item ainda: carregue o documento do fornecedor acima ou adicione os itens.'));
      box.appendChild(h('div.barra-itens',
        h('button.btn.pequeno', { type: 'button', onclick: function () { c.itens.push(Cp.novoItem()); mudou(); desenhar('itens'); const ult = box.querySelector('tbody tr:last-child .compra-desc input'); if (ult) ult.focus(); } }, '+ Adicionar item'),
        c.itens.length ? h('button.btn.primario.pequeno', { type: 'button', onclick: cadastrar }, '📦 Lançar em Materiais e acessórios') : null));

      function desenharTotais() {
        const t = Cp.totais(c);
        totaisBox.innerHTML = '';
        totaisBox.appendChild(h('div.compra-linha', h('span', 'Soma dos itens'), h('strong', U.brl(t.itens))));
        totaisBox.appendChild(UI.grade([
          { k: 'desconto', label: 'Desconto', type: 'money' },
          { k: 'frete', label: 'Frete', type: 'money' },
          { k: 'outras', label: 'Outras despesas', type: 'money' }
        ], c, function () { atualizarTotal(); mudou(); }, 3));
        const totalLinha = h('div.compra-linha.total');
        const notas = h('div');
        const atualizarTotal = function () {
          const tt = Cp.totais(c);
          totalLinha.innerHTML = '';
          totalLinha.appendChild(h('span', 'Total do pedido'));
          totalLinha.appendChild(h('strong', U.brl(tt.total)));
          notas.innerHTML = '';
          const doc = U.num(c.totalDocumento);
          if (doc > 0 && Math.abs(doc - tt.total) > 0.05) notas.appendChild(h('p.nota.aviso', 'O total impresso no documento é ' + U.brl(doc) + ': confira itens, desconto e frete.'));
          if (tt.itens > 0 && Math.abs(tt.fator - 1) > 0.0001) {
            notas.appendChild(h('p.ajuda-sec', 'Custo de aquisição: ' + (tt.fator < 1 ? 'o desconto' : 'frete e despesas') + ' entram no custo de cada item na proporção do valor (' +
              (tt.fator < 1 ? '−' : '+') + U.fmtSmart(Math.abs(tt.fator - 1) * 100, 2) + '% em cada preço).'));
          }
        };
        atualizarTotal();
        totaisBox.appendChild(totalLinha);
        totaisBox.appendChild(notas);
      }
      desenharTotais();
      box.appendChild(totaisBox);
    });

    function unidadesDe(atual) {
      const base = App.Avulsa.UNIDADES_MATERIAL;
      return !atual || base.indexOf(atual) >= 0 ? base : base.concat([atual]);
    }

    /* ---------- lançamento no cadastro de materiais */
    function cadastrar() {
      const itens = c.itens.filter(function (it) { return String(it.descricao || '').trim() && U.num(it.qtd) > 0; });
      if (!itens.length) { UI.toast('Inclua os itens com descrição e quantidade.', 'erro'); return; }
      if (!c.id && !salvar(false)) return;
      const eqs = S.list('equipamentos');
      const mats = eqs.filter(function (e) { return e.tipo === 'material'; }).sort(function (a, b) { return String(a.descricao).localeCompare(String(b.descricao), 'pt-BR'); });
      const op = { ratear: true, atualizarPreco: true, infraCA: true };
      const escolhas = itens.map(function (it) {
        const sug = Cp.sugerir(it, c, eqs);
        return { item: it, destino: sug ? sug.eq.id : 'novo', sug: sug };
      });
      const corpo = h('div.cadastro-compra');
      const desenharModal = function () {
        corpo.innerHTML = '';
        corpo.appendChild(h('p.ajuda-sec', 'Cada item vira um material novo ou atualiza um já cadastrado (custo da última compra, fornecedor e histórico de compras). ' +
          'Os materiais novos ficam em Equipamentos › Materiais e acessórios, para as propostas solares e avulsas e para a lista de materiais CA.'));
        corpo.appendChild(UI.grade([
          { k: 'ratear', label: 'Ratear desconto, frete e outras despesas no custo dos itens (custo de aquisição)', type: 'checkbox', cls: 'span2', onChange: desenharModal },
          { k: 'atualizarPreco', label: 'Atualizar também o preço unitário dos materiais já cadastrados', type: 'checkbox', cls: 'span2' },
          { k: 'infraCA', label: 'Marcar os materiais novos como infraestrutura CA (aparecem primeiro na lista de materiais CA da proposta)', type: 'checkbox', cls: 'span2' }
        ], op, null, 2));
        const tb = h('tbody');
        escolhas.forEach(function (es) {
          const sel = h('select', { 'aria-label': 'Destino no cadastro', onchange: function () { es.destino = sel.value; } },
            h('option', { value: 'novo' }, '➕ Novo material'),
            h('option', { value: '' }, '— não lançar —'),
            mats.map(function (e) { return h('option', { value: e.id }, e.descricao + (e.ativo === false ? ' (inativo)' : '')); }));
          sel.value = es.destino;
          tb.appendChild(h('tr',
            h('td', h('strong', es.item.descricao), es.item.marca ? h('div.mini', es.item.marca + (es.item.codigo ? ' · cód. ' + es.item.codigo : '')) : null),
            h('td.num', U.fmtSmart(U.num(es.item.qtd), 3) + ' ' + (es.item.unidade || '')),
            h('td.num', U.brl(Cp.custoUnitario(c, es.item, op.ratear))),
            h('td', sel, es.sug && es.sug.nota < 1 ? h('div.mini', 'Sugerido pela descrição parecida') : (es.sug ? h('div.mini', 'Já vinculado') : null))));
        });
        corpo.appendChild(h('div.tabela-rolagem', h('table.tabela.compacta', h('thead', h('tr', h('th', 'Item'), h('th.num', 'Qtd.'), h('th.num', 'Custo unit.'), h('th', 'Cadastro'))), tb)));
      };
      desenharModal();
      UI.modal({
        titulo: 'Lançar em Materiais e acessórios', largo: true, corpo: corpo,
        acoes: [
          { label: 'Cancelar' },
          {
            label: 'Gravar no cadastro', primario: true, onClick: function () {
              const sel = escolhas.filter(function (es) { return es.destino; });
              if (!sel.length) { UI.toast('Escolha ao menos um item para lançar.', 'erro'); return false; }
              const res = Cp.paraCadastro(c, sel, eqs, op);
              try {
                res.registros.forEach(function (r) { S.save('equipamentos', r); });
              } catch (e) { UI.toast(e.message, 'erro'); return false; }
              c.cadastradoEm = U.todayISO();
              salvar(false);
              desenhar('itens');
              const partes = [];
              if (res.novos) partes.push(res.novos + (res.novos === 1 ? ' material novo' : ' materiais novos'));
              if (res.atualizados) partes.push(res.atualizados + (res.atualizados === 1 ? ' atualizado' : ' atualizados'));
              UI.toast((partes.join(' e ') || 'Nenhum material') + ' em Materiais e acessórios.', 'ok');
            }
          }
        ]
      });
    }

    /* ---------- resumo */
    function desenharResumo() {
      resumo.innerHTML = '';
      const t = Cp.totais(c), v = vinculados(c);
      const kpi = function (rot, val, sub) { return h('div.kpi', h('span', rot), h('strong', val), sub ? h('small', sub) : null); };
      resumo.appendChild(h('div.resumo-topo', badge(c.situacao), sujo ? UI.badge('Não salvo', 'ambar') : null));
      resumo.appendChild(h('div.kpis',
        kpi('Fornecedor', c.fornecedor.nome || '—', c.docFornecedor ? 'Doc. ' + c.docFornecedor : null),
        kpi('Itens', String(c.itens.length), 'soma ' + U.brl(t.itens)),
        kpi('Total do pedido', U.brl(t.total), t.desconto || t.frete || t.outras ? [t.desconto ? '− ' + U.brl(t.desconto) + ' desconto' : '', t.frete ? '+ ' + U.brl(t.frete) + ' frete' : '', t.outras ? '+ ' + U.brl(t.outras) + ' despesas' : ''].filter(Boolean).join(' · ') : null),
        kpi('Materiais e acessórios', v.total ? v.n + ' de ' + v.total + ' no cadastro' : '—', c.cadastradoEm ? 'Lançado em ' + U.dataBR(c.cadastradoEm) : null)));
      const links = [];
      const btnPdf = h('button.btn', { type: 'button', onclick: function () { gerarPdf(btnPdf); } }, '⬇ Pedido em PDF');
      links.push(btnPdf);
      if (c.itens.length) links.push(h('button.btn', { type: 'button', onclick: cadastrar }, '📦 Lançar em Materiais'));
      if (c.instalacaoId && S.get('instalacoes', c.instalacaoId)) links.push(h('a.btn', { href: '#/instalacao/' + c.instalacaoId }, '🏗 Abrir a obra'));
      if (links.length) resumo.appendChild(h('div.resumo-links', links));
      resumo.appendChild(h('button.btn.primario', { type: 'button', onclick: function () { salvar(true); } }, 'Salvar'));
    }

    function salvar(avisar) {
      if (!String(c.fornecedor.nome || '').trim()) {
        UI.toast('Informe o fornecedor.', 'erro');
        secoes.pedido.el.scrollIntoView({ behavior: 'smooth' });
        return false;
      }
      const novo = !c.id;
      let n = null;
      if (novo) { n = S.proximoNumero(c.data, 'compra'); c.numero = n.numero; }
      c.itens = c.itens.filter(function (it) { return String(it.descricao || '').trim() || U.num(it.qtd) > 0 || U.num(it.total) > 0; });
      S.save('compras', c);
      if (n) S.reservarNumero(n.dia, n.seq, n.chave);
      sujo = false;
      if (novo) { id = c.id; UI.substituirHash('#/compra/' + c.id); desenhar('pedido'); }
      atualizarTopo();
      desenharResumo();
      if (avisar) UI.toast('Pedido de compra ' + c.numero + ' salvo.', 'ok');
      return true;
    }

    Object.keys(secoes).forEach(desenhar);
    desenharResumo();
    if (!id && arquivoPendente) {
      const f = arquivoPendente;
      arquivoPendente = null;
      setTimeout(function () { anexar(f); }, 0);
    }
  }
})(window.App);
