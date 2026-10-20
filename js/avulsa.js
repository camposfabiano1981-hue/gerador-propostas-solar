/*
 * Proposta avulsa: serviços complementares à energia solar (manutenção, limpeza, laudos, projetos, carregador veicular…).
 * Mesma identidade visual da proposta solar (capa, títulos com filete azul, tabelas zebradas, cabeçalho e rodapé),
 * gerada em Word e PDF a partir do mesmo modelo de documento.
 */
window.App = window.App || {};

(function (App) {
  'use strict';

  const U = App.U;
  const N = App.Documento.nos;
  const COR = App.Documento.COR;
  const AZUL = COR.AZUL, DOURADO = COR.DOURADO, CINZA = COR.CINZA, GRAFITE = COR.GRAFITE, ZEBRA = COR.ZEBRA, BRANCO = COR.BRANCO;
  const T = N.T, P = N.P, TC = N.TC, TR = N.TR, TBL = N.TBL, vazio = N.vazio, titulo = N.titulo;

  /** Nova proposta avulsa com os textos padrão. */
  function novo(ctx) {
    const num = App.Store.proximoNumero(U.todayISO());
    const tx = ctx.textos;
    return {
      id: null,
      numero: num.numero,
      data: U.todayISO(),
      validadeDias: ctx.empresa.validadeDias || 5,
      status: 'rascunho',
      clienteId: null,
      titulo: 'Serviços Complementares',
      localExecucao: '',
      itens: [],
      desconto: '',
      prazo: 'A combinar',
      garantia: tx.avulsaGarantia || '',
      apresentacao: tx.avulsaApresentacao || '',
      inclusos: U.clone(tx.avulsaInclusos || []),
      naoInclusos: U.clone(tx.avulsaNaoInclusos || []),
      pagamentosIds: (ctx.pagamentos || []).filter(function (p) { return p.ativo !== false; }).map(function (p) { return p.id; }),
      observacoes: '',
      _seq: num
    };
  }

  /** Item a partir de um serviço do catálogo. */
  function itemDeServico(s) {
    return {
      id: U.uid(), servicoId: s.id, descricao: s.descricao || '', detalhes: s.detalhes || '',
      qtd: 1, unidade: s.unidade || 'vb', precoUnit: U.numOr(s.preco, 0)
    };
  }

  function calcular(a, ctx) {
    const itens = a.itens || [];
    const subtotal = itens.reduce(function (s, i) { return s + U.numOr(i.qtd, 0) * U.numOr(i.precoUnit, 0); }, 0);
    const desconto = Math.min(subtotal, Math.max(0, U.numOr(a.desconto, 0)));
    const total = subtotal - desconto;
    const pags = (ctx.pagamentos || []).filter(function (pg) { return !Array.isArray(a.pagamentosIds) || a.pagamentosIds.indexOf(pg.id) >= 0; });
    return { subtotal: subtotal, desconto: desconto, total: total, pagamentos: App.Calc.pagamentos(total, pags) };
  }

  function montar(a, ctx, cliente, logo) {
    const emp = ctx.empresa;
    const tx = ctx.textos;
    const r = calcular(a, ctx);
    const papel = emp.papel === 'a4' ? { w: 11906, h: 16838 } : { w: 12240, h: 15840 };
    const k = (papel.w - 2880) / 9360;
    const nomeCliente = (cliente && cliente.nome) || 'Cliente';
    const cidadeUF = cliente ? [cliente.cidade, cliente.uf].filter(Boolean).join(' / ') : '';
    const vars = {
      empresa: emp.razao, empresaCurta: emp.nomeCurto || emp.razao, cidadeEmpresa: [emp.cidade, emp.uf].filter(Boolean).join('/'),
      registroTipo: emp.registroTipo || '', registro: emp.registro || '', cliente: nomeCliente, cidade: cliente ? cliente.cidade || '' : ''
    };
    const t = function (x) { return N.substituir(x, vars); };
    let sec = 0;
    const b = [];

    /* ---------- capa */
    const lc = N.encaixar(logo.w, logo.h, 3048000, 1638300);
    b.push(P(N.IMG('logo', lc.cx, lc.cy, 'Logotipo'), { before: 500, after: 360, jc: 'center' }));
    b.push(P([], { bottom: { sz: 12, space: 2, color: AZUL }, after: 360 }));
    b.push(vazio(), vazio());
    b.push(T('PROPOSTA COMERCIAL', { after: 100, jc: 'center' }, { b: true, color: AZUL, sz: 44 }));
    b.push(T(a.titulo || 'Serviços Complementares', { after: 80, jc: 'center' }, { color: GRAFITE, sz: 28 }));
    b.push(vazio(), vazio());
    b.push(T(nomeCliente, { after: 80, jc: 'center' }, { b: true, color: AZUL, sz: 36 }));
    if (cidadeUF) b.push(T(cidadeUF, { after: 80, jc: 'center' }, { color: CINZA, sz: 26 }));
    b.push(vazio(), vazio(), vazio());
    const capaCel = function (txt, cab, negrito) {
      return TC(T(txt, { jc: 'center' }, cab ? { b: true, color: BRANCO } : { b: negrito }), { w: 3042, fill: cab ? AZUL : null });
    };
    b.push(TBL([3042, 3042], [
      TR([capaCel('Nº da Proposta', true), capaCel('Data de Emissão', true)]),
      TR([capaCel(a.numero, false, true), capaCel(U.dataBR(a.data))]),
      TR([capaCel('Validade', true), capaCel('Valor Total', true)]),
      TR([capaCel((a.validadeDias || emp.validadeDias) + ' dias'), capaCel(U.brl(r.total), false, true)])
    ]));
    b.push(vazio(), vazio(), vazio(), vazio(), vazio(), vazio());
    b.push(T(emp.razao, { top: { sz: 6, space: 2, color: DOURADO }, after: 40, jc: 'center' }, { b: true, color: AZUL, sz: 22 }));
    b.push(T(['CNPJ: ' + emp.cnpj, emp.registro ? emp.registroTipo + ' ' + emp.registro : ''].filter(Boolean).join(' │ '), { after: 40, jc: 'center' }, { color: CINZA, sz: 18 }));
    b.push(T([emp.cidade, U.UF_NOMES[emp.uf] || emp.uf].filter(Boolean).join(' — '), { jc: 'center', sectPr: 'capa' }, { color: CINZA, sz: 18 }));

    /* ---------- apresentação */
    if (a.apresentacao) {
      b.push(titulo((++sec) + '. APRESENTAÇÃO'));
      b.push(T(t(a.apresentacao), { after: 80 }));
      b.push(vazio());
    }

    /* ---------- cliente */
    b.push(titulo((++sec) + '. DADOS DO CLIENTE'));
    const dados = [['Cliente', nomeCliente]];
    if (cliente && cliente.documento) dados.push(['CPF / CNPJ', cliente.documento]);
    const end = cliente ? [[cliente.endereco, cliente.numero].filter(Boolean).join(', '), cliente.bairro].filter(Boolean).join(' — ') : '';
    if (end) dados.push(['Endereço', end]);
    if (cidadeUF) dados.push(['Cidade / UF', cidadeUF]);
    if (cliente && cliente.telefone) dados.push(['Telefone', cliente.telefone]);
    if (cliente && cliente.email) dados.push(['E-mail', cliente.email]);
    if (a.localExecucao) dados.push(['Local de Execução', a.localExecucao]);
    dados.push(['Nº da Proposta', a.numero], ['Data de Emissão', U.dataBR(a.data)], ['Validade', (a.validadeDias || emp.validadeDias) + ' dias']);
    b.push(N.kv([3000, 6360], dados));
    b.push(vazio());

    /* ---------- serviços */
    b.push(titulo((++sec) + '. SERVIÇOS PROPOSTOS'));
    const cols = [{ t: '#', w: 500, jc: 'center' }, { t: 'Descrição', w: 4260 }, { t: 'Qtd.', w: 800, jc: 'center' }, { t: 'Un.', w: 700, jc: 'center' },
      { t: 'Valor Unit.', w: 1500, jc: 'right' }, { t: 'Subtotal', w: 1600, jc: 'right' }];
    const lin = (a.itens || []).map(function (it, i) {
      return [String(i + 1), it.descricao, U.fmtSmart(U.numOr(it.qtd, 0), 2), it.unidade || '', U.brl(U.numOr(it.precoUnit, 0)),
        { t: U.brl(U.numOr(it.qtd, 0) * U.numOr(it.precoUnit, 0)), b: true }];
    });
    const totais = [];
    if (r.desconto > 0) {
      totais.push(['', { t: 'Subtotal', b: true }, '', '', '', U.brl(r.subtotal)]);
      totais.push(['', { t: 'Desconto', b: true }, '', '', '', '- ' + U.brl(r.desconto)]);
    }
    const tab = N.tabela(cols, lin.concat(totais), { sz: 19 });
    tab.linhas.push(TR([
      TC(T('VALOR TOTAL', null, { b: true, color: BRANCO }), { w: 500 + 4260 + 800 + 700 + 1500, span: 5, fill: AZUL }),
      TC(T(U.brl(r.total), { jc: 'right' }, { b: true, color: BRANCO }), { w: 1600, fill: AZUL })
    ]));
    b.push(tab);
    b.push(vazio());

    /* ---------- escopo */
    const detalhados = (a.itens || []).filter(function (it) { return String(it.detalhes || '').trim(); });
    if (detalhados.length) {
      b.push(titulo((++sec) + '. ESCOPO DOS SERVIÇOS'));
      b.push(N.kv([3000, 6360], detalhados.map(function (it) { return [it.descricao, t(it.detalhes)]; })));
      b.push(vazio());
    }

    /* ---------- inclusos / não inclusos */
    const inc = (a.inclusos || []).map(t).filter(Boolean);
    const ninc = (a.naoInclusos || []).map(t).filter(Boolean);
    if (inc.length || ninc.length) {
      b.push(titulo((++sec) + '. ITENS INCLUSOS E NÃO INCLUSOS'));
      b.push(TBL([4680, 4680], [
        TR([TC(T('✅ Inclusos', null, { b: true, color: BRANCO }), { w: 4680, fill: AZUL }), TC(T('❌ Não Inclusos', null, { b: true, color: BRANCO }), { w: 4680, fill: AZUL })], true),
        TR([TC(T(inc.join('\n')), { w: 4680, fill: ZEBRA, vAlign: 'top' }), TC(T(ninc.join('\n')), { w: 4680, fill: BRANCO, vAlign: 'top' })])
      ]));
      b.push(vazio());
    }

    /* ---------- prazo, garantia e pagamento */
    b.push(titulo((++sec) + '. PRAZO, GARANTIA E CONDIÇÕES COMERCIAIS'));
    const cond = [['Valor Total', { t: U.brl(r.total), b: true }]];
    if (a.prazo) cond.push(['Prazo de Execução', a.prazo]);
    if (a.garantia) cond.push(['Garantia', t(a.garantia)]);
    cond.push(['Validade da Proposta', (a.validadeDias || emp.validadeDias) + ' dias a partir da data de emissão']);
    if (a.observacoes) cond.push(['Observações', a.observacoes]);
    b.push(N.kv([3000, 6360], cond));
    b.push(vazio());
    if (r.pagamentos.length && r.total > 0) {
      b.push(titulo((++sec) + '. OPÇÕES DE PAGAMENTO'));
      b.push(N.tabela([{ t: 'Modalidade', w: 3600 }, { t: 'Prazo', w: 1200, jc: 'center' }, { t: 'Parcela (R$)', w: 2280, jc: 'right' }, { t: 'Total Pago (R$)', w: 2280, jc: 'right' }],
        r.pagamentos.map(function (pg) { return [pg.label, pg.prazo, U.brl(pg.parcela), { t: U.brl(pg.total), b: true }]; })));
      if (tx.notaPagamento) b.push(T(tx.notaPagamento, { after: 80 }, { color: CINZA, sz: 18 }));
      b.push(vazio());
    }

    /* ---------- aceite */
    b.push(titulo((++sec) + '. ACEITE DA PROPOSTA'));
    b.push(vazio());
    const centro = { after: 80, jc: 'center' };
    const linhaAss = { top: { sz: 4, space: 0, color: '000000' }, before: 400, jc: 'center' };
    const colEmp = [
      T(String(emp.razao).toUpperCase(), centro, { b: true, color: AZUL, sz: 22 }),
      T('CNPJ: ' + emp.cnpj, centro),
      emp.registro ? T(emp.registroTipo + ' ' + emp.registro, centro) : null,
      T(emp.responsavel || '', linhaAss),
      T(emp.cargo || 'Responsável Técnico', { jc: 'center' }, { color: CINZA, sz: 18 })
    ].filter(Boolean);
    const colCli = [
      T('CLIENTE', centro, { b: true, color: AZUL, sz: 22 }),
      T(nomeCliente, centro),
      T(cidadeUF, centro, { color: CINZA }),
      T(nomeCliente, linhaAss),
      T('De acordo', { jc: 'center' }, { color: CINZA, sz: 18 })
    ];
    b.push(TBL([4680, 4680], [TR([TC(colEmp, { w: 4680, simples: true }), TC(colCli, { w: 4680, simples: true })])]));
    b.push(vazio(), vazio());
    if (tx.slogan) b.push(T(t(tx.slogan), { top: { sz: 6, space: 4, color: DOURADO }, before: 100, jc: 'center' }, { color: AZUL }));

    /* ---------- cabeçalho e rodapé */
    const hl = N.encaixar(logo.w, logo.h, 1238250, 666750);
    const cabecalho = [
      TBL([3600, 5760], [TR([
        TC(P(N.IMG('logo', hl.cx, hl.cy, 'Logotipo')), { w: 3600, semBorda: true }),
        TC(T(nomeCliente + '  |  ' + a.numero + '  |  ' + (a.titulo || 'Serviços Complementares'), { jc: 'right' }, { color: CINZA, sz: 16 }), { w: 5760, semBorda: true, vAlign: 'bottom' })
      ])]),
      P([], { bottom: { sz: 8, space: 2, color: AZUL } })
    ];
    const rodTexto = [emp.razao, 'CNPJ ' + emp.cnpj, emp.registro ? emp.registroTipo + ' ' + emp.registro : '', [emp.cidade, emp.uf].filter(Boolean).join('/')]
      .filter(Boolean).join('  │  ');
    const rodape = [T(rodTexto, { top: { sz: 6, space: 2, color: AZUL }, before: 80, jc: 'center' }, { color: CINZA, sz: 16 })];
    return { papel: papel, k: k, corpo: b, cabecalho: cabecalho, rodape: rodape };
  }

  async function preparar(a, ctx) {
    ctx = ctx || App.Calc.contexto();
    const cliente = (ctx.clientes || []).find(function (c) { return c.id === a.clienteId; }) || null;
    const logo = await App.Documento.prepararLogo(ctx.empresa.logo);
    const nomeCliente = (cliente && cliente.nome) || 'Cliente';
    return {
      ctx: ctx, cliente: cliente, nomeCliente: nomeCliente, logo: logo, modelo: montar(a, ctx, cliente, logo),
      nomeBase: 'Proposta_Servicos_' + U.slug(nomeCliente) + '_' + String(a.data || U.todayISO()).replace(/-/g, '')
    };
  }

  function meta(a, d) {
    return { titulo: 'Proposta Comercial ' + a.numero + ' — ' + d.nomeCliente, assunto: a.titulo || 'Serviços complementares', autor: d.ctx.empresa.razao };
  }

  async function gerarDocx(a, ctx) {
    const d = await preparar(a, ctx);
    const blob = await App.Docx.pacote(d.modelo, { logo: d.logo }, meta(a, d));
    return { blob: blob, nome: d.nomeBase + '.docx' };
  }

  async function gerarPdf(a, ctx, opcoes) {
    const d = await preparar(a, ctx);
    const out = await App.Pdf.pacote(d.modelo, { logo: d.logo }, meta(a, d), opcoes);
    return { blob: out.blob, nome: d.nomeBase + '.pdf', fonteOk: out.fonteOk };
  }

  App.Avulsa = { novo: novo, itemDeServico: itemDeServico, calcular: calcular, montar: montar, preparar: preparar, gerarDocx: gerarDocx, gerarPdf: gerarPdf };
})(window.App);
