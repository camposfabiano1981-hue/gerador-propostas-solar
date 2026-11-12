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
          h('td', (c.fornecedor && c.fornecedor.nome) || '—', c.docFornecedor ? h('div.mini', 'Doc. ' + c.docFornecedor) : null, c.kitId ? h('div.mini', '📦 Kit salvo') : null),
          h('td.num', String(v.total)),
          h('td.num', U.brl(t.total)),
          h('td', obra ? obra.titulo || obra.clienteNome : '—'),
          h('td', c.kitFechado ? UI.badge('Kit fechado', 'azul') : (v.total && v.n === v.total ? UI.badge('No cadastro', 'ok') : (v.n ? UI.badge(v.n + ' de ' + v.total, 'ambar') : UI.badge('Pendente', 'cinza')))),
          h('td', badge(c.situacao)),
          h('td.acoes-col', App.Visualizar.botao(function () { return App.Relatorios.pdfCompra(c, App.Calc.contexto()); }, 'Pedido de compra ' + (c.numero || '')),
            App.botaoFinanceiro ? App.botaoFinanceiro('compra', c, desenhar) : null, (function () {
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
    if (!Array.isArray(c.entregas)) c.entregas = [];
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
      // pedido do kit da proposta aprovada: kit fechado (uma linha com o valor do kit), fornecedor e frete, ligado à obra
      const kit = qs && qs.get('kit') ? S.get('kits', qs.get('kit')) : null;
      if (kit) {
        const prop = qs.get('proposta') ? S.get('propostas', qs.get('proposta')) : null;
        const inst = qs.get('instalacao') ? S.get('instalacoes', qs.get('instalacao'))
          : (prop ? S.list('instalacoes').find(function (i) { return i.propostaId === prop.id && i.situacao !== 'cancelada'; }) : null);
        c = App.Kit.paraCompra(kit, S.list('equipamentos'), { propostaId: prop ? prop.id : '', instalacaoId: inst ? inst.id : '', numeroProposta: prop ? prop.numero : '' });
      }
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
    const visualizar = function () {
      if (!String(c.fornecedor.nome || '').trim()) { UI.toast('Informe o fornecedor.', 'erro'); return; }
      App.Visualizar.abrir(function () { return App.Relatorios.pdfCompra(c, App.Calc.contexto()); }, { titulo: 'Pedido de compra ' + (c.numero || '') });
    };
    cont.appendChild(h('div.pagina-topo', h('div', titulo, subt), h('div.acoes',
      h('a.btn', { href: '#/compras' }, '← Pedidos de compra'),
      h('button.btn', { type: 'button', onclick: visualizar }, '👁 Visualizar'),
      btnPdfTopo,
      App.Acesso.podeGravar('lancamentos') ? h('button.btn', { type: 'button', onclick: function () {
        if ((sujo || !c.id) && !salvar(false)) return;
        App.lancarNoFinanceiro('compra', c);
      } }, '💰 Lançar a pagar') : null,
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
    const mudou = function () { sujo = true; atualizarTopo(); desenharResumo(); if (secoes.recebimento) desenhar('recebimento'); };

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
        { k: 'validade', label: 'Validade da cotação', type: 'date', help: 'Vai para o kit ao usar "Salvar como kit".' },
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
      // custo final de cada item: preço com a parte do desconto, do frete e das outras despesas (rateio pelo valor)
      const custos = [];
      const pintarCustos = function () {
        custos.forEach(function (x) {
          const r = Cp.rateio(c, x.it);
          const rateados = r.frete + r.outras;
          x.el.replaceChildren(h('strong', U.brl(r.custoUnit) + ' / ' + (x.it.unidade || 'un')),
            rateados || r.desconto ? h('small', [rateados ? '+ ' + U.brl(rateados) + ' frete/desp.' : '', r.desconto ? '− ' + U.brl(r.desconto) + ' desc.' : ''].filter(Boolean).join(' · ')) : null);
          x.el.title = 'Valor ' + U.brl(r.valor) + (r.desconto ? ' − desconto ' + U.brl(r.desconto) : '') + (r.frete ? ' + frete ' + U.brl(r.frete) : '') +
            (r.outras ? ' + outras despesas ' + U.brl(r.outras) : '') + ' = ' + U.brl(r.custoTotal);
        });
      };
      c.itens.forEach(function (it, i) {
        const totalEl = campoNum({ k: 'total', type: 'money' }, it, function () { desenharTotais(); pintarCustos(); mudou(); });
        const recalcular = function () {
          it.total = U.round(U.numOr(it.qtd, 0) * U.numOr(it.preco, 0), 2);
          totalEl.querySelector('input').value = String(it.total).replace('.', ',');
          desenharTotais(); pintarCustos(); mudou();
        };
        const custoEl = h('div.compra-custo-val');
        custos.push({ it: it, el: custoEl });
        const eq = it.equipamentoId && eqs[it.equipamentoId];
        tb.appendChild(h('tr',
          h('td.compra-cod', { 'data-rotulo': 'Código' }, campoNum({ k: 'codigo' }, it, mudou)),
          h('td.compra-desc', { 'data-rotulo': 'Descrição' }, campoNum({ k: 'descricao', placeholder: 'Descrição do item' }, it, mudou)),
          h('td.compra-marca', { 'data-rotulo': 'Marca' }, campoNum({ k: 'marca' }, it, mudou)),
          h('td.compra-un', { 'data-rotulo': 'Un.' }, campoNum({ k: 'unidade', type: 'select', options: unidadesDe(it.unidade) }, it, mudou)),
          h('td.compra-qtd', { 'data-rotulo': 'Qtd.' }, campoNum({ k: 'qtd', type: 'number' }, it, recalcular)),
          h('td.compra-preco', { 'data-rotulo': 'Preço unit.' }, campoNum({ k: 'preco', type: 'money' }, it, recalcular)),
          h('td.compra-total', { 'data-rotulo': 'Total' }, totalEl),
          h('td.compra-custo', { 'data-rotulo': 'Custo final (c/ frete)' }, custoEl),
          h('td.compra-cad', { 'data-rotulo': 'Cadastro' }, eq ? h('a.badge.ok', { href: '#/equipamentos?tipo=material', title: eq.descricao }, 'No cadastro') : h('span.mini', '—')),
          h('td.acoes-col', h('button.btn-icone.perigo', {
            type: 'button', title: 'Remover item', 'aria-label': 'Remover item', onclick: function () { c.itens.splice(i, 1); mudou(); desenhar('itens'); }
          }, '×'))));
      });
      if (c.itens.length) {
        box.appendChild(h('div.tabela-rolagem', h('table.tabela.editavel.tabela-compra',
          h('thead', h('tr', ['Código', 'Descrição', 'Marca', 'Un.', 'Qtd.', 'Preço unit.', 'Total', 'Custo final', 'Cadastro', ''].map(function (t) { return h('th', t); }))), tb)));
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
        ], c, function () { atualizarTotal(); pintarCustos(); mudou(); }, 3));
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
          if (tt.itens > 0 && (tt.desconto || tt.frete || tt.outras)) {
            const partes = [tt.frete ? 'frete de ' + U.brl(tt.frete) : '', tt.outras ? 'outras despesas de ' + U.brl(tt.outras) : '', tt.desconto ? 'desconto de ' + U.brl(tt.desconto) : ''].filter(Boolean);
            const lista = partes.length > 1 ? partes.slice(0, -1).join('; ') + ' e ' + partes[partes.length - 1] : partes[0];
            notas.appendChild(h('p.ajuda-sec', 'Custo de aquisição: ' + lista + ' atribuídos aos itens na proporção do valor de cada um (' +
              (tt.fator < 1 ? '−' : '+') + U.fmtSmart(Math.abs(tt.fator - 1) * 100, 2) + '% em cada preço). O custo final de cada item é o que vai para Materiais e acessórios.'));
          }
        };
        atualizarTotal();
        totaisBox.appendChild(totalLinha);
        totaisBox.appendChild(notas);
      }
      desenharTotais();
      pintarCustos();
      box.appendChild(totaisBox);
    });

    /* ---------- conferência do recebimento */
    secao('recebimento', 'Conferência do recebimento', function (box) {
      const itens = c.itens.filter(function (it) { return String(it.descricao || '').trim() && U.num(it.qtd) > 0; });
      box.appendChild(h('p.ajuda-sec', 'Quando a mercadoria chegar, confira item a item com a nota: registre o que chegou, o que faltou, o que veio trocado ',
        'e o que veio sem ter sido pedido. A falta e a troca ficam pendentes até a próxima entrega do fornecedor (registre cada entrega).'));
      if (!itens.length) { box.appendChild(h('p.ajuda-sec', 'Inclua os itens do pedido para conferir o recebimento.')); return; }
      const k = Cp.conferencia(c);
      if (k.entregas) {
        const chip = function (n, rot, cor) { return n ? UI.badge(n + ' ' + rot, cor) : null; };
        box.appendChild(h('div.receb-resumo', k.completo ? UI.badge('Tudo recebido certo', 'ok') : null,
          chip(k.ok, k.ok === 1 ? 'completo' : 'completos', 'ok'), chip(k.faltando, 'faltando', 'erro'), chip(k.trocas, k.trocas === 1 ? 'trocado' : 'trocados', 'ambar'),
          chip(k.aMais, 'a mais', 'azul'), chip(k.extrasPendentes, 'não pedido' + (k.extrasPendentes > 1 ? 's' : ''), 'ambar'),
          k.valorFalta > 0 ? h('span.mini', 'Valor do que falta: ' + U.brl(k.valorFalta)) : null));
        const tb = h('tbody');
        k.linhas.forEach(function (l) {
          const sit = Cp.SIT_ITEM[l.situacao];
          const det = h('div');
          if (l.falta > 0) det.appendChild(h('div.mini', 'Falta ' + U.fmtSmart(l.falta, 3) + ' ' + (l.item.unidade || 'un') + ' (' + U.brl(l.valorFalta) + ')'));
          if (l.aMais > 0) det.appendChild(h('div.mini', 'Veio ' + U.fmtSmart(l.aMais, 3) + ' ' + (l.item.unidade || 'un') + ' a mais'));
          l.trocas.forEach(function (t) {
            const e = c.entregas.find(function (x) { return x.id === t.entregaId; });
            const tr = e && e.trocas[l.item.id];
            det.appendChild(h('div.receb-troca', h('span.mini', 'Veio ' + (t.qtd ? U.fmtSmart(t.qtd, 3) + ' ' + (l.item.unidade || 'un') + ' de ' : '') + (t.descricao || 'outro item') + ' (' + U.dataBR(t.data) + ')'),
              h('button.btn.pequeno', { type: 'button', title: 'Ficar com o item que veio no lugar do pedido', onclick: function () { tr.status = 'aceita'; aposEntrega(); } }, 'Aceitar troca'),
              h('button.btn.pequeno', { type: 'button', title: 'O item errado volta ao fornecedor; o pedido continua faltando até chegar o certo', onclick: function () { tr.status = 'devolvida'; aposEntrega(); } }, 'Devolvido')));
          });
          tb.appendChild(h('tr', h('td', h('strong', l.item.descricao), l.item.codigo ? h('div.mini', 'cód. ' + l.item.codigo) : null),
            h('td.num', U.fmtSmart(l.pedido, 3) + ' ' + (l.item.unidade || '')), h('td.num', U.fmtSmart(l.recebido, 3)),
            h('td', UI.badge(sit.label, sit.cor), det)));
        });
        k.extras.forEach(function (x) {
          const e = c.entregas.find(function (y) { return y.id === x.entregaId; });
          const reg = e && e.extras[x.indice];
          tb.appendChild(h('tr', h('td', h('strong', x.descricao || 'Item sem descrição'), h('div.mini', 'Veio sem ter sido pedido · ' + U.dataBR(x.data))),
            h('td.num', '—'), h('td.num', U.fmtSmart(x.qtd, 3) + ' ' + x.unidade),
            h('td', x.status ? UI.badge(x.status === 'aceito' ? 'Não pedido — aceito' : 'Não pedido — devolvido', 'cinza') : h('div',
              UI.badge('Não pedido', 'ambar'),
              h('div.receb-troca', h('button.btn.pequeno', { type: 'button', onclick: function () { reg.status = 'aceito'; aposEntrega(); } }, 'Ficar com o item'),
                h('button.btn.pequeno', { type: 'button', onclick: function () { reg.status = 'devolvido'; aposEntrega(); } }, 'Devolvido'))))));
        });
        box.appendChild(h('div.tabela-rolagem', h('table.tabela.compacta.tabela-receb',
          h('thead', h('tr', h('th', 'Item'), h('th.num', 'Pedido'), h('th.num', 'Recebido'), h('th', 'Situação'))), tb)));
        box.appendChild(h('ul.receb-entregas', c.entregas.map(function (e, i) {
          const n = Object.keys(e.qtd || {}).filter(function (id) { return U.num(e.qtd[id]) > 0; }).length;
          return h('li', h('span', '📦 Entrega ' + (i + 1) + ' — ' + U.dataBR(e.data) + (e.nf ? ' · NF ' + e.nf : '') + ' · ' + n + ' item(ns)' + (e.obs ? ' · ' + e.obs : '')),
            h('span.cresce'),
            h('button.btn.pequeno', { type: 'button', onclick: function () { registrarEntrega(e); } }, 'Editar'),
            h('button.btn-icone.perigo', { type: 'button', title: 'Excluir a entrega', 'aria-label': 'Excluir a entrega', onclick: async function () {
              if (!(await UI.confirmar('Excluir a entrega de ' + U.dataBR(e.data) + '?', 'Excluir', true))) return;
              c.entregas.splice(i, 1); aposEntrega();
            } }, '×'));
        })));
      }
      const texto = Cp.textoDivergencias(c, (App.Calc.contexto().empresa) || {});
      const fone = String(c.fornecedor.telefone || '').replace(/\D/g, '');
      box.appendChild(h('div.barra-itens',
        h('button.btn.primario.pequeno.btn-receber', { type: 'button', onclick: function () { registrarEntrega(null); } }, k.entregas ? '+ Registrar outra entrega' : '📦 Conferir o que chegou'),
        texto ? h('button.btn.pequeno', { type: 'button', onclick: function () {
          (navigator.clipboard ? navigator.clipboard.writeText(texto) : Promise.reject()).then(function () { UI.toast('Divergências copiadas: cole na conversa com o fornecedor.', 'ok'); },
            function () { UI.modal({ titulo: 'Divergências do recebimento', corpo: h('textarea', { rows: 12, readonly: true }, texto), acoes: [{ label: 'Fechar' }] }); });
        } }, '📋 Copiar divergências') : null,
        texto ? h('a.btn.pequeno', { href: 'https://wa.me/' + (fone ? (fone.length <= 11 ? '55' + fone : fone) : '') + '?text=' + encodeURIComponent(texto), target: '_blank', rel: 'noopener' }, '💬 Enviar ao fornecedor') : null));
    });

    // depois de registrar ou resolver: a situação acompanha a conferência (recebido ou recebido com pendência)
    function aposEntrega() {
      c.situacao = Cp.situacaoRecebimento(c);
      sujo = true;
      desenhar('pedido'); desenhar('recebimento'); atualizarTopo(); desenharResumo();
      if (c.id || String(c.fornecedor.nome || '').trim()) salvar(false);
    }

    /** Registra (ou edita) uma entrega: o que chegou de cada item, o que veio no lugar e o que veio sem ser pedido. */
    function registrarEntrega(existente) {
      const itens = c.itens.filter(function (it) { return String(it.descricao || '').trim() && U.num(it.qtd) > 0; });
      const e = existente ? U.clone(existente) : Cp.novaEntrega();
      if (!e.qtd) e.qtd = {};
      if (!e.trocas) e.trocas = {};
      if (!Array.isArray(e.extras)) e.extras = [];
      // nova entrega: já vem preenchida com o que falta de cada item (é só corrigir o que não chegou)
      if (!existente) {
        const k = Cp.conferencia(c);
        itens.forEach(function (it) { const l = k.linhas.find(function (x) { return x.item === it; }); const f = l ? (k.entregas ? l.falta : l.pedido) : U.num(it.qtd); e.qtd[it.id] = f > 0 ? String(f) : ''; });
      }
      itens.forEach(function (it) { if (!e.trocas[it.id]) e.trocas[it.id] = { descricao: '', qtd: '', status: '' }; });
      const corpo = h('div.receb-modal');
      const desenharModal = function () {
        corpo.innerHTML = '';
        corpo.appendChild(UI.grade([{ k: 'data', label: 'Data do recebimento', type: 'date' }, { k: 'nf', label: 'Nº da nota fiscal' }, { k: 'obs', label: 'Observação' }], e, null, 3));
        corpo.appendChild(h('p.ajuda-sec', 'A quantidade que chegou já vem preenchida com o que falta: corrija o que veio a menos (ou zere). Se veio outro item no lugar, ',
          'descreva o que veio e a quantidade — ele fica como "veio trocado" até você aceitar a troca ou devolver.'));
        const tb = h('tbody');
        const k = Cp.conferencia(c);
        itens.forEach(function (it) {
          const l = k.linhas.find(function (x) { return x.item === it; });
          const jaRec = l && existente ? l.recebido - U.numOr(existente.qtd[it.id], 0) - (existente.trocas[it.id] && existente.trocas[it.id].status === 'aceita' ? U.numOr(existente.trocas[it.id].qtd, 0) : 0) : (l ? l.recebido : 0);
          const cq = UI.campo({ k: it.id, type: 'number', placeholder: '0' }, e.qtd);
          cq.classList.add('sem-rotulo');
          const ct = UI.campo({ k: 'descricao', placeholder: 'Veio outro? Descreva' }, e.trocas[it.id]);
          const cn = UI.campo({ k: 'qtd', type: 'number', placeholder: 'Qtd.' }, e.trocas[it.id]);
          ct.classList.add('sem-rotulo'); cn.classList.add('sem-rotulo');
          tb.appendChild(h('tr', { 'data-item': it.id },
            h('td', h('strong', it.descricao), h('div.mini', (it.codigo ? 'cód. ' + it.codigo + ' · ' : '') + 'pedido ' + U.fmtSmart(U.num(it.qtd), 3) + ' ' + (it.unidade || 'un') +
              (jaRec > 0 ? ' · já recebido ' + U.fmtSmart(jaRec, 3) : ''))),
            h('td.receb-qtd', { 'data-rotulo': 'Chegou' }, cq),
            h('td.receb-troca-desc', { 'data-rotulo': 'Veio no lugar' }, ct),
            h('td.receb-troca-qtd', { 'data-rotulo': 'Qtd.' }, cn)));
        });
        corpo.appendChild(h('div.tabela-rolagem', h('table.tabela.compacta.editavel', h('thead', h('tr', h('th', 'Item pedido'), h('th', 'Chegou'), h('th', 'Veio outro item no lugar'), h('th', 'Qtd.'))), tb)));
        corpo.appendChild(h('h4.secao-form', 'Veio sem ter sido pedido'));
        const tbx = h('tbody');
        e.extras.forEach(function (x, i) {
          const cd = UI.campo({ k: 'descricao', placeholder: 'Descrição do item' }, x), cq = UI.campo({ k: 'qtd', type: 'number', placeholder: 'Qtd.' }, x), cu = UI.campo({ k: 'unidade', placeholder: 'un' }, x);
          [cd, cq, cu].forEach(function (el) { el.classList.add('sem-rotulo'); });
          tbx.appendChild(h('tr', h('td', cd), h('td', cq), h('td', cu), h('td', h('button.btn-icone.perigo', { type: 'button', 'aria-label': 'Remover', onclick: function () { e.extras.splice(i, 1); desenharModal(); } }, '×'))));
        });
        if (e.extras.length) corpo.appendChild(h('table.tabela.compacta.editavel', tbx));
        corpo.appendChild(h('button.btn.pequeno.btn-extra', { type: 'button', onclick: function () { e.extras.push({ descricao: '', qtd: '', unidade: 'un', status: '' }); desenharModal(); } }, '+ Item que veio sem ser pedido'));
      };
      desenharModal();
      UI.modal({
        titulo: existente ? 'Editar a entrega de ' + U.dataBR(existente.data) : 'Conferir o que chegou', largo: true, corpo: corpo,
        acoes: [{ label: 'Cancelar' }, {
          label: 'Gravar a conferência', primario: true, onClick: function () {
            // limpa as trocas vazias; troca nova com quantidade em branco = 1
            Object.keys(e.trocas).forEach(function (id) {
              const t = e.trocas[id];
              if (!String(t.descricao || '').trim() && !(U.num(t.qtd) > 0)) delete e.trocas[id];
              else if (!(U.num(t.qtd) > 0)) t.qtd = '1';
            });
            e.extras = e.extras.filter(function (x) { return String(x.descricao || '').trim() || U.num(x.qtd) > 0; });
            if (existente) c.entregas[c.entregas.indexOf(existente)] = e; else c.entregas.push(e);
            aposEntrega();
            const k = Cp.conferencia(c);
            UI.toast(k.completo ? 'Recebimento conferido: tudo certo.' : 'Recebimento conferido com pendências: ' + [k.faltando ? k.faltando + ' faltando' : '', k.trocas ? k.trocas + ' trocado(s)' : '',
              k.extrasPendentes ? k.extrasPendentes + ' não pedido(s)' : ''].filter(Boolean).join(', ') + '.', k.completo ? 'ok' : 'aviso');
          }
        }]
      });
    }

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
        c.kitFechado ? kpi('Kit fechado', 'Custo do kit da obra', 'fora do cadastro de materiais')
          : kpi('Materiais e acessórios', v.total ? v.n + ' de ' + v.total + ' no cadastro' : '—', c.cadastradoEm ? 'Lançado em ' + U.dataBR(c.cadastradoEm) : null),
        (function () {
          const k = Cp.conferencia(c);
          if (!k.entregas) return null;
          return kpi('Recebimento', k.completo ? 'Tudo certo' : 'Com pendência', k.completo ? k.entregas + (k.entregas === 1 ? ' entrega' : ' entregas') :
            [k.faltando ? k.faltando + ' faltando' : '', k.trocas ? k.trocas + ' trocado(s)' : '', k.extrasPendentes ? k.extrasPendentes + ' não pedido(s)' : ''].filter(Boolean).join(' · '));
        })()));
      const links = [];
      const btnPdf = h('button.btn', { type: 'button', onclick: function () { gerarPdf(btnPdf); } }, '⬇ Pedido em PDF');
      links.push(h('button.btn', { type: 'button', onclick: visualizar }, '👁 Visualizar'));
      links.push(btnPdf);
      if (c.itens.length && !c.kitFechado) links.push(h('button.btn', { type: 'button', onclick: cadastrar }, '📦 Lançar em Materiais'));
      const kitLigado = c.kitId ? S.get('kits', c.kitId) : null;
      if (c.itens.length && !kitLigado && App.Acesso.podeGravar('kits')) links.push(h('button.btn.btn-salvar-kit', { type: 'button', onclick: salvarComoKit }, '📦 Salvar como kit'));
      if (kitLigado) resumo.appendChild(h('p.nota.kit-ligado', '📦 ', h('a', { href: '#/kits' }, App.Kit.titulo(kitLigado.nome)),
        c.propostaId && S.get('propostas', c.propostaId) ? ' · proposta ' + S.get('propostas', c.propostaId).numero : ''));
      if (c.instalacaoId && S.get('instalacoes', c.instalacaoId)) links.push(h('a.btn', { href: '#/instalacao/' + c.instalacaoId }, '🏗 Abrir a obra'));
      if (links.length) resumo.appendChild(h('div.resumo-links', links));
      resumo.appendChild(h('button.btn.primario', { type: 'button', onclick: function () { salvar(true); } }, 'Salvar'));
    }

    /** Orçamento do distribuidor → kit salvo (Cadastros › Kits), com os itens, o valor fechado, o frete e a validade. */
    function salvarComoKit() {
      const k = App.Kit.deCompra(c, S.list('equipamentos'));
      App.Kits.abrirForm(k, function (salvo) {
        c.kitId = salvo.id;
        mudou();
        if (c.id) salvar(false);
        desenharResumo();
        UI.toast('Kit "' + salvo.nome + '" salvo em Cadastros › Kits.', 'ok');
      }, { titulo: 'Salvar o orçamento como kit' });
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
