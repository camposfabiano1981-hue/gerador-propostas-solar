/*
 * Financeiro (administrador): contas a receber e a pagar (parcelas, baixa com juros e desconto, saldo em aberto), caixa e bancos
 * (saldo, extrato, transferências, fluxo de caixa realizado × previsto), DRE gerencial (competência ou caixa), resultado por
 * obra (vendido × custos lançados), comissões dos vendedores (liberadas conforme o cliente paga) e conciliação com o extrato
 * do banco (arquivo OFX). Lançamentos: tipo receber | pagar | transferencia; situação aberto | pago | cancelado.
 */
window.App = window.App || {};

(function (App) {
  'use strict';

  const U = App.U;

  const TIPOS = [{ id: 'receber', label: 'A receber' }, { id: 'pagar', label: 'A pagar' }, { id: 'transferencia', label: 'Transferência' }];
  const FORMAS = [
    { id: 'pix', label: 'PIX' }, { id: 'boleto', label: 'Boleto' }, { id: 'transferencia', label: 'Transferência / TED' }, { id: 'cartao_credito', label: 'Cartão de crédito' },
    { id: 'cartao_debito', label: 'Cartão de débito' }, { id: 'dinheiro', label: 'Dinheiro' }, { id: 'financiamento', label: 'Financiamento' }, { id: 'cheque', label: 'Cheque' }
  ];
  const TIPOS_CONTA = [{ id: 'banco', label: 'Conta bancária' }, { id: 'caixa', label: 'Caixa (dinheiro)' }, { id: 'aplicacao', label: 'Aplicação financeira' }, { id: 'cartao', label: 'Recebimentos de cartão' }];

  function arred(v) { return U.round(v, 2); }
  function num(v) { return U.numOr(v, 0); }
  function hojeISO() { return U.todayISO(); }
  function dataDe(x) { return new Date(String(x).slice(0, 10) + 'T12:00:00'); }
  function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function diasEntre(a, b) { return Math.round((dataDe(b) - dataDe(a)) / 86400000); }
  function somarDias(d, n) { const x = dataDe(d); x.setDate(x.getDate() + n); return iso(x); }

  /** Soma meses mantendo o dia (31/01 + 1 mês = 28 ou 29/02). */
  function somarMeses(d, n) {
    const x = dataDe(d), dia = x.getDate();
    const alvo = new Date(x.getFullYear(), x.getMonth() + n, 1, 12);
    const ultimo = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0, 12).getDate();
    alvo.setDate(Math.min(dia, ultimo));
    return iso(alvo);
  }

  function rotulo(lista, id) { return (lista.find(function (x) { return x.id === id; }) || {}).label || id || ''; }

  /* ------------------------------------------------------------ lançamentos */

  function novoLancamento(tipo, x) {
    return Object.assign({
      tipo: tipo || 'receber', descricao: '', categoriaId: '', contaId: '', valor: '', vencimento: hojeISO(), competencia: hojeISO(), situacao: 'aberto',
      pagoEm: '', valorPago: '', juros: '', desconto: '', forma: '', documento: '', pessoa: { tipo: '', id: '', nome: '' }, origem: { tipo: 'manual', id: '', numero: '' },
      obraId: '', parcela: null, conciliado: null, observacoes: '', destinoId: ''
    }, x || {});
  }

  /** Situação para a tela: vencido quando aberto e com vencimento antes de hoje. */
  function situacao(l, hoje) {
    if (l.situacao === 'pago' || l.situacao === 'cancelado') return l.situacao;
    return l.vencimento && l.vencimento < (hoje || hojeISO()) ? 'vencido' : 'aberto';
  }

  /**
   * Parcelas de um valor: entrada (opcional) e n parcelas iguais (o arredondamento fica na última), vencimentos mensais a partir
   * do primeiro (ou a cada intervaloDias). Todas com a mesma competência (data da venda/compra) e o mesmo grupo.
   * o: {total, n, primeiroVencimento, intervaloDias, entrada, dataEntrada, competencia}
   */
  function gerarParcelas(base, o) {
    const total = arred(num(o.total)), entrada = Math.min(total, arred(num(o.entrada)));
    const n = Math.max(1, parseInt(o.n, 10) || 1);
    const resto = arred(total - entrada);
    const grupo = 'grp-' + U.uid();
    const prim = o.primeiroVencimento || hojeISO();
    const comp = o.competencia || o.dataEntrada || prim;
    const de = n + (entrada > 0 ? 1 : 0);
    const out = [];
    const desc = String(base.descricao || '').trim();
    if (entrada > 0) {
      out.push(novoLancamento(base.tipo, Object.assign({}, U.clone(base), { valor: entrada, vencimento: o.dataEntrada || prim, competencia: comp,
        descricao: desc + ' — entrada', parcela: { n: 1, de: de, grupo: grupo } })));
    }
    if (resto > 0) {
      const p = arred(Math.floor(resto / n * 100) / 100);
      for (let i = 0; i < n; i++) {
        const venc = o.intervaloDias > 0 ? somarDias(prim, i * o.intervaloDias) : somarMeses(prim, i);
        const valor = i === n - 1 ? arred(resto - p * (n - 1)) : p;
        out.push(novoLancamento(base.tipo, Object.assign({}, U.clone(base), { valor: valor, vencimento: venc,
          competencia: comp, descricao: desc + (n > 1 || entrada > 0 ? ' — parcela ' + (i + 1) + '/' + n : ''), parcela: { n: i + 1 + (entrada > 0 ? 1 : 0), de: de, grupo: grupo } })));
      }
    }
    return out;
  }

  /**
   * Baixa (recebimento ou pagamento). b: {data, contaId, valor (principal pago), juros, desconto, forma}. Pagamento parcial: o saldo
   * vira um novo lançamento em aberto, com o mesmo vencimento. Devolve {lancamento, saldo}.
   */
  function baixar(l, b) {
    const principal = Math.min(num(l.valor), arred(num(b.valor != null && b.valor !== '' ? b.valor : l.valor)));
    let saldo = null;
    if (principal > 0 && principal < num(l.valor) - 0.004) {
      saldo = novoLancamento(l.tipo, Object.assign(U.clone(l), { id: undefined, valor: arred(num(l.valor) - principal), situacao: 'aberto', pagoEm: '', valorPago: '', juros: '', desconto: '',
        conciliado: null, descricao: String(l.descricao || '').replace(/ \(saldo\)$/, '') + ' (saldo)' }));
      delete saldo.id; delete saldo.criadoEm; delete saldo.atualizadoEm;
      l.valor = principal;
    }
    l.situacao = 'pago';
    l.pagoEm = b.data || hojeISO();
    l.contaId = b.contaId || l.contaId;
    l.juros = arred(num(b.juros)) || '';
    l.desconto = arred(num(b.desconto)) || '';
    l.forma = b.forma || l.forma;
    l.valorPago = arred(num(l.valor) + num(l.juros) - num(l.desconto));
    return { lancamento: l, saldo: saldo };
  }

  function estornar(l) {
    l.situacao = 'aberto';
    l.pagoEm = ''; l.valorPago = ''; l.juros = ''; l.desconto = ''; l.conciliado = null;
    return l;
  }

  /** Transferência entre contas (já realizada). */
  function transferencia(origemId, destinoId, valor, data, descricao) {
    return novoLancamento('transferencia', { contaId: origemId, destinoId: destinoId, valor: arred(num(valor)), vencimento: data, competencia: data, pagoEm: data,
      valorPago: arred(num(valor)), situacao: 'pago', descricao: descricao || 'Transferência entre contas', categoriaId: '' });
  }

  /* ------------------------------------------------------------ caixa e bancos */

  /** Movimentos realizados de uma conta: {data, descricao, entrada, saida, l}, em ordem de data. */
  function movimentos(contaId, lancs) {
    const out = [];
    (lancs || []).forEach(function (l) {
      if (l.situacao !== 'pago') return;
      const v = num(l.valorPago || l.valor);
      if (l.tipo === 'transferencia') {
        if (l.contaId === contaId) out.push({ data: l.pagoEm, descricao: l.descricao, entrada: 0, saida: v, l: l });
        if (l.destinoId === contaId) out.push({ data: l.pagoEm, descricao: l.descricao, entrada: v, saida: 0, l: l });
        return;
      }
      if (l.contaId !== contaId) return;
      if (l.tipo === 'receber') out.push({ data: l.pagoEm, descricao: l.descricao, entrada: v, saida: 0, l: l });
      else out.push({ data: l.pagoEm, descricao: l.descricao, entrada: 0, saida: v, l: l });
    });
    return out.sort(function (a, b) { return String(a.data).localeCompare(String(b.data)) || (b.entrada - a.entrada); });
  }

  /** Saldo da conta ao fim do dia `ate` (padrão: hoje). */
  function saldoConta(conta, lancs, ate) {
    const limite = ate || hojeISO();
    return arred(movimentos(conta.id, lancs).reduce(function (s, m) {
      if (m.data > limite || (conta.dataSaldoInicial && m.data < conta.dataSaldoInicial)) return s;
      return s + m.entrada - m.saida;
    }, num(conta.saldoInicial)));
  }

  /** Extrato do período: saldo anterior e as linhas com o saldo corrente. */
  function extrato(conta, lancs, de, ate) {
    const anterior = de ? saldoConta(conta, lancs, somarDias(de, -1)) : num(conta.saldoInicial);
    let saldo = anterior;
    const linhas = movimentos(conta.id, lancs).filter(function (m) {
      return (!de || m.data >= de) && (!ate || m.data <= ate) && (!conta.dataSaldoInicial || m.data >= conta.dataSaldoInicial);
    }).map(function (m) { saldo = arred(saldo + m.entrada - m.saida); return Object.assign({ saldo: saldo }, m); });
    return { anterior: anterior, linhas: linhas, final: saldo };
  }

  function saldoTotal(contas, lancs, ate) {
    return arred((contas || []).filter(function (c) { return c.ativo !== false; }).reduce(function (s, c) { return s + saldoConta(c, lancs, ate); }, 0));
  }

  /** Números da visão geral: saldo, a receber/a pagar nos próximos 30 dias, vencidos e o realizado no mês. */
  function resumo(lancs, contas, hoje) {
    const dia = hoje || hojeISO(), ate = somarDias(dia, 30), mes = dia.slice(0, 7);
    const r = { saldo: saldoTotal(contas, lancs, dia), aReceber30: 0, aPagar30: 0, vencRec: { n: 0, valor: 0 }, vencPag: { n: 0, valor: 0 }, recebidoMes: 0, pagoMes: 0 };
    (lancs || []).forEach(function (l) {
      if (l.tipo === 'transferencia' || l.situacao === 'cancelado') return;
      if (l.situacao === 'pago') {
        if (String(l.pagoEm).slice(0, 7) === mes) { if (l.tipo === 'receber') r.recebidoMes += num(l.valorPago); else r.pagoMes += num(l.valorPago); }
        return;
      }
      const v = num(l.valor);
      if (l.vencimento < dia) { const x = l.tipo === 'receber' ? r.vencRec : r.vencPag; x.n++; x.valor += v; }
      else if (l.vencimento <= ate) { if (l.tipo === 'receber') r.aReceber30 += v; else r.aPagar30 += v; }
    });
    ['aReceber30', 'aPagar30', 'recebidoMes', 'pagoMes'].forEach(function (k) { r[k] = arred(r[k]); });
    r.vencRec.valor = arred(r.vencRec.valor); r.vencPag.valor = arred(r.vencPag.valor);
    return r;
  }

  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  /**
   * Fluxo de caixa mês a mês: meses passados com o realizado (pagos); o mês atual com o realizado até hoje mais o previsto
   * (em aberto, inclusive vencidos); os seguintes com o previsto. Saldo ao fim de cada mês (o projetado a partir do saldo de hoje).
   */
  function fluxo(lancs, contas, hoje, antes, depois) {
    const dia = hoje || hojeISO();
    const h = dataDe(dia);
    const atual = dia.slice(0, 7);
    const out = [];
    let projetado = saldoTotal(contas, lancs, dia);
    for (let i = -(antes == null ? 2 : antes); i <= (depois == null ? 5 : depois); i++) {
      const m = new Date(h.getFullYear(), h.getMonth() + i, 1, 12);
      const chave = iso(m).slice(0, 7);
      const fim = iso(new Date(m.getFullYear(), m.getMonth() + 1, 0, 12));
      let entR = 0, saiR = 0, entP = 0, saiP = 0;
      (lancs || []).forEach(function (l) {
        if (l.tipo === 'transferencia' || l.situacao === 'cancelado') return;
        if (l.situacao === 'pago') {
          if (String(l.pagoEm).slice(0, 7) === chave) { if (l.tipo === 'receber') entR += num(l.valorPago); else saiR += num(l.valorPago); }
          return;
        }
        // em aberto: vencidos entram no mês atual
        const mesV = l.vencimento < dia ? atual : String(l.vencimento).slice(0, 7);
        if (mesV === chave && chave >= atual) { if (l.tipo === 'receber') entP += num(l.valor); else saiP += num(l.valor); }
      });
      let saldoFim;
      if (chave < atual) saldoFim = saldoTotal(contas, lancs, fim);
      else { projetado = arred(projetado + entP - saiP); saldoFim = projetado; }
      out.push({ mes: chave, rot: MESES[m.getMonth()] + '/' + String(m.getFullYear()).slice(2), passado: chave < atual, atual: chave === atual,
        entradas: arred(entR + entP), saidas: arred(saiR + saiP), entradasRealizadas: arred(entR), saidasRealizadas: arred(saiR), entradasPrevistas: arred(entP), saidasPrevistas: arred(saiP), saldo: saldoFim });
    }
    return out;
  }

  /* ------------------------------------------------------------ DRE gerencial */

  function grupoDe(categorias, id) { const c = (categorias || []).find(function (x) { return x.id === id; }); return c ? c.grupo : null; }

  /**
   * DRE do ano, mês a mês. regime 'competencia' (padrão): lançamentos não cancelados pela data de competência e o valor
   * principal; 'caixa': só os pagos, pela data do pagamento. Juros pagos e descontos concedidos vão para despesas financeiras;
   * juros recebidos e descontos obtidos, para receitas financeiras. Transferências não entram; "fora do resultado" aparece à parte.
   */
  function dre(lancs, categorias, ano, regime) {
    const caixa = regime === 'caixa';
    const G = App.DEFAULTS.GRUPOS_DRE;
    const zeros = function () { return Array(12).fill(0); };
    const porGrupo = {}, porCategoria = {};
    G.forEach(function (g) { porGrupo[g.id] = zeros(); });
    const somar = function (grupo, catId, mes, v) {
      if (!porGrupo[grupo]) return;
      porGrupo[grupo][mes] += v;
      const k = grupo + '|' + (catId || '');
      (porCategoria[k] = porCategoria[k] || zeros())[mes] += v;
    };
    let semCategoria = 0;
    (lancs || []).forEach(function (l) {
      if (l.tipo === 'transferencia' || l.situacao === 'cancelado') return;
      if (caixa && l.situacao !== 'pago') return;
      const data = String(caixa ? l.pagoEm : (l.competencia || l.vencimento) || '');
      if (data.slice(0, 4) !== String(ano)) return;
      const mes = parseInt(data.slice(5, 7), 10) - 1;
      const sinal = l.tipo === 'receber' ? 1 : -1;
      const grupo = grupoDe(categorias, l.categoriaId);
      if (!grupo) semCategoria++;
      somar(grupo || (l.tipo === 'receber' ? 'receita' : 'despesa_admin'), grupo ? l.categoriaId : '', mes, sinal * num(l.valor));
      if (l.situacao === 'pago') {
        const juros = num(l.juros), desc = num(l.desconto);
        const dMes = caixa ? mes : parseInt(String(l.pagoEm || data).slice(5, 7), 10) - 1;
        const noAno = caixa || String(l.pagoEm || '').slice(0, 4) === String(ano);
        if (noAno && juros) somar(l.tipo === 'receber' ? 'financeiro_receita' : 'financeiro_despesa', l.tipo === 'receber' ? 'juros-recebidos' : 'juros-pagos', dMes, sinal * juros);
        if (noAno && desc) somar(l.tipo === 'receber' ? 'financeiro_despesa' : 'financeiro_receita', l.tipo === 'receber' ? 'descontos-concedidos' : 'descontos-obtidos', dMes, -sinal * desc);
      }
    });
    const linhas = [];
    const soma = function (ids) { const v = zeros(); ids.forEach(function (id) { porGrupo[id].forEach(function (x, i) { v[i] += x; }); }); return v; };
    const total = function (v) { return arred(v.reduce(function (s, x) { return s + x; }, 0)); };
    const r12 = function (v) { return v.map(arred); };
    const nomesExtras = { 'juros-recebidos': 'Juros e multas recebidos', 'juros-pagos': 'Juros e multas pagos (nas baixas)', 'descontos-concedidos': 'Descontos concedidos', 'descontos-obtidos': 'Descontos obtidos' };
    const grupo = function (id) {
      const g = G.find(function (x) { return x.id === id; });
      linhas.push({ tipo: 'grupo', id: id, label: g.label, valores: r12(porGrupo[id]), total: total(porGrupo[id]) });
      Object.keys(porCategoria).filter(function (k) { return k.indexOf(id + '|') === 0; }).forEach(function (k) {
        const catId = k.split('|')[1];
        const c = (categorias || []).find(function (x) { return x.id === catId; });
        linhas.push({ tipo: 'categoria', id: catId, grupo: id, label: c ? c.nome : (nomesExtras[catId] || 'Sem categoria'), valores: r12(porCategoria[k]), total: total(porCategoria[k]) });
      });
    };
    const sub = function (label, ids, destaque) { const v = soma(ids); linhas.push({ tipo: 'subtotal', label: label, valores: r12(v), total: total(v), destaque: !!destaque }); };
    grupo('receita'); grupo('deducao');
    sub('= Receita líquida', ['receita', 'deducao']);
    grupo('custo');
    sub('= Lucro bruto (margem de contribuição das obras)', ['receita', 'deducao', 'custo']);
    grupo('despesa_comercial'); grupo('despesa_admin');
    sub('= Resultado operacional', ['receita', 'deducao', 'custo', 'despesa_comercial', 'despesa_admin']);
    grupo('financeiro_receita'); grupo('financeiro_despesa');
    sub('= Resultado antes do IRPJ e da CSLL', ['receita', 'deducao', 'custo', 'despesa_comercial', 'despesa_admin', 'financeiro_receita', 'financeiro_despesa']);
    grupo('imposto_lucro');
    sub('= Resultado líquido do período', ['receita', 'deducao', 'custo', 'despesa_comercial', 'despesa_admin', 'financeiro_receita', 'financeiro_despesa', 'imposto_lucro'], true);
    const fora = { tipo: 'fora', label: 'Fora do resultado (investimentos, empréstimos, aportes e retiradas)', valores: r12(porGrupo.fora), total: total(porGrupo.fora) };
    const rl = linhas.find(function (l) { return l.label === '= Receita líquida'; });
    return { ano: ano, regime: caixa ? 'caixa' : 'competencia', linhas: linhas, fora: fora, receitaLiquida: rl.total, semCategoria: semCategoria };
  }

  /** DRE em CSV (planilha): ; como separador e vírgula decimal. */
  function dreCsv(d) {
    const fmt = function (v) { return String(arred(v)).replace('.', ','); };
    const cab = ['Linha'].concat(MESES.map(function (m) { return m + '/' + d.ano; }), ['Total', 'AV %']);
    const linha = function (l) {
      const av = d.receitaLiquida ? fmt(l.total / d.receitaLiquida * 100) : '';
      return ['"' + (l.tipo === 'categoria' ? '   ' : '') + l.label.replace(/"/g, '""') + '"'].concat(l.valores.map(fmt), [fmt(l.total), av]).join(';');
    };
    return [cab.join(';')].concat(d.linhas.map(linha), [linha(d.fora)]).join('\r\n');
  }

  /* ------------------------------------------------------------ resultado por obra (apuração) */

  // linhas da apuração: o custo previsto na composição de preço da proposta × o realizado nos lançamentos da obra
  const LINHAS_OBRA = [
    { id: 'kit', label: 'Kit de equipamentos (módulos, inversor, estrutura, baterias)', cats: ['cat-cus-kit'] },
    { id: 'maoobra', label: 'Mão de obra de instalação', cats: ['cat-cus-maoobra'] },
    { id: 'materialCA', label: 'Material CA (infraestrutura elétrica)', cats: ['cat-cus-materiais'] },
    { id: 'outros', label: 'Outros custos da proposta (frete, projeto, ART)', cats: ['cat-cus-frete', 'cat-cus-projeto'] },
    { id: 'comissao', label: 'Comissão de vendas', cats: ['cat-com-comissoes'] },
    { id: 'impostos', label: 'Impostos sobre a venda', grupos: ['deducao'] },
    { id: 'adicionais', label: 'Custos adicionais da obra', resto: true }
  ];

  /** Linha da apuração em que entra um lançamento a pagar da obra (null: fora do resultado). */
  function linhaObra(l, categorias) {
    const g = grupoDe(categorias, l.categoriaId);
    if (g === 'fora') return null;
    const d = LINHAS_OBRA.find(function (x) { return (x.cats && x.cats.indexOf(l.categoriaId) >= 0) || (x.grupos && x.grupos.indexOf(g) >= 0); });
    return d ? d.id : 'adicionais';
  }

  /** Parâmetros da apuração guardados na configuração (alíquota dos impostos sobre a venda) e as instalações. */
  function parametrosObras() {
    const S = App.Store;
    const c = S ? (S.config().financeiro || {}) : {};
    return { aliquota: Math.max(0, num(c.aliquotaImpostos)), instalacoes: S ? S.list('instalacoes') : [] };
  }

  /**
   * Custos previstos na composição de preço da proposta: kit (FV + armazenamento), mão de obra de instalação (a da composição;
   * nas propostas sem preço pela margem, estimada pelas premissas: módulos × R$/módulo da faixa), material CA (lista ou valor da
   * infraestrutura), outros valores, comissão e os impostos sobre a venda (alíquota da apuração).
   */
  function previstoProposta(p, ctx, o) {
    let r = null;
    try { r = App.Calc.calcular(U.clone(p), ctx); } catch (e) { r = null; }
    const aliq = Math.max(0, num(o && o.aliquota));
    if (!r) {
      const t = arred(num((p.resumo || {}).total));
      return { r: null, venda: t, aliquota: aliq, semCalculo: true, valores: { kit: 0, maoobra: 0, materialCA: 0, outros: 0, comissao: 0, impostos: arred(t * aliq), adicionais: 0 } };
    }
    const cen = r.cen || null;
    const kitArm = cen ? num(cen.kitArm) : 0, instArm = cen ? num(cen.instalArm) : 0;
    let instalacao = r.incluiFV ? num(r.instalacao) : 0, estimada = false, porModulo = num(r.instalacaoModulo);
    if (!r.precoMargem && r.incluiFV) {
      const pp = (ctx.premissas && ctx.premissas.preco) || {};
      porModulo = Number(p.instalacaoFaixa) === 2 ? num(pp.instalacaoFaixa2) : num(pp.instalacaoFaixa1);
      instalacao = num(r.nModulos) * porModulo;
      estimada = instalacao > 0;
    }
    const venda = arred(num(r.total));
    return {
      r: r, venda: venda, aliquota: aliq, precoMargem: !!r.precoMargem, maoobraEstimada: estimada, instalacaoModulo: porModulo, nModulos: r.incluiFV ? num(r.nModulos) : 0,
      outrosDescricao: num(r.outros) > 0 ? r.outrosDescricao : '', infraLista: p.infraModo === 'lista',
      valores: {
        kit: arred((r.incluiFV ? num(r.kit) : 0) + kitArm), maoobra: arred(instalacao + instArm), materialCA: arred(r.incluiFV ? num(r.infra) : 0),
        outros: arred(r.incluiFV ? num(r.outros) : 0), comissao: arred(num(r.comissao)), impostos: arred(venda * aliq), adicionais: 0
      }
    };
  }

  /**
   * Apuração do resultado de uma obra (proposta aprovada). Para cada linha de custo: previsto (proposta), realizado (lançamentos
   * a pagar com a obra; no material CA sem lançamento, o consumo registrado na instalação) e apurado — com a apuração aberta, o
   * maior entre previsto e realizado (custos ainda não lançados ficam pelo previsto); fechada, o realizado. Receita: o preço de
   * venda (aberta, o maior entre ele e o lançado a receber; fechada, o lançado). Resultado = receita − custos apurados.
   * o: {aliquota, instalacoes}
   */
  function apuracaoObra(p, lancs, categorias, ctx, o) {
    o = o || {};
    const prev = previstoProposta(p, ctx, o);
    const ls = (lancs || []).filter(function (l) { return l.obraId === p.id && l.situacao !== 'cancelado' && l.tipo !== 'transferencia'; });
    const real = { kit: 0, maoobra: 0, materialCA: 0, outros: 0, comissao: 0, impostos: 0, adicionais: 0 };
    const nLanc = { kit: 0, maoobra: 0, materialCA: 0, outros: 0, comissao: 0, impostos: 0, adicionais: 0 };
    let lancadoRec = 0, recebido = 0, pago = 0, aPagar = 0;
    ls.forEach(function (l) {
      const v = num(l.valor);
      if (l.tipo === 'receber') { lancadoRec += v; if (l.situacao === 'pago') recebido += v; return; }
      const id = linhaObra(l, categorias);
      if (!id) return;
      real[id] += v; nLanc[id]++;
      if (l.situacao === 'pago') pago += v; else aPagar += v;
    });
    const inst = (o.instalacoes || []).find(function (i) { return i.propostaId === p.id && i.situacao !== 'cancelada'; }) || null;
    const statusInst = inst && App.Instalacao ? App.Instalacao.status(inst) : '';
    const fontes = {};
    if (!(real.materialCA > 0) && inst && App.Materiais) {
      const usado = App.Materiais.resumo(inst, p).usado;
      if (usado > 0) { real.materialCA = usado; fontes.materialCA = 'consumo registrado na instalação'; }
    }
    const fechada = !!(p.apuracao && p.apuracao.fechada);
    const linhas = LINHAS_OBRA.map(function (d) {
      const previsto = arred(prev.valores[d.id]), realizado = arred(real[d.id]);
      const apurado = arred(fechada ? realizado : Math.max(previsto, realizado));
      let label = d.label;
      if (d.id === 'outros' && prev.outrosDescricao) label = 'Outros custos da proposta (' + prev.outrosDescricao + ')';
      if (d.id === 'impostos' && prev.aliquota) label += ' (' + String(arred(prev.aliquota * 100)).replace('.', ',') + '% no previsto)';
      let nota = fontes[d.id] || '';
      if (d.id === 'maoobra' && prev.maoobraEstimada) nota = 'previsto estimado: ' + prev.nModulos + ' módulos × R$ ' + String(arred(prev.instalacaoModulo)).replace('.', ',') + ' (premissas)';
      return { id: d.id, label: label, previsto: previsto, realizado: realizado, apurado: apurado, variacao: arred(previsto - apurado), lancamentos: nLanc[d.id],
        pelo: fechada || (realizado > 0 && realizado >= previsto) ? 'realizado' : 'previsto', nota: nota };
    });
    const soma = function (k) { return arred(linhas.reduce(function (s, x) { return s + x[k]; }, 0)); };
    const vendaPrev = prev.venda;
    const receita = arred(fechada ? (lancadoRec > 0 ? lancadoRec : vendaPrev) : Math.max(vendaPrev, lancadoRec));
    const custoPrevisto = soma('previsto'), custoRealizado = soma('realizado'), custoApurado = soma('apurado');
    const resultadoPrevisto = arred(vendaPrev - custoPrevisto), resultado = arred(receita - custoApurado);
    return {
      p: p, prev: prev, linhas: linhas, fechada: fechada, fechadaEm: fechada ? (p.apuracao.em || '') : '', instalacao: inst, statusInstalacao: statusInst,
      vendido: vendaPrev, receita: receita, lancadoReceber: arred(lancadoRec), recebido: arred(recebido), aReceber: arred(lancadoRec - recebido),
      pago: arred(pago), aPagar: arred(aPagar), saldoCaixa: arred(recebido - pago),
      custoPrevisto: custoPrevisto, custoRealizado: custoRealizado, custoApurado: custoApurado, custos: custoApurado,
      resultadoPrevisto: resultadoPrevisto, resultado: resultado, variacao: arred(resultado - resultadoPrevisto),
      margem: receita > 0 ? resultado / receita : 0, margemPrevista: vendaPrev > 0 ? resultadoPrevisto / vendaPrev : null,
      lancamentos: ls, semLancamentos: !ls.some(function (l) { return l.tipo === 'pagar'; }), semCalculo: !!prev.semCalculo
    };
  }

  /** Obras (propostas aprovadas) com a apuração, das aprovadas mais recentes para as mais antigas. o: {aliquota, instalacoes} */
  function resultadoObras(propostas, lancs, categorias, ctx, o) {
    return (propostas || []).filter(function (p) { return p.status === 'aprovada'; }).map(function (p) { return apuracaoObra(p, lancs, categorias, ctx, o); })
      .sort(function (a, b) { return String(b.p.aprovadaEm || b.p.data).localeCompare(String(a.p.aprovadaEm || a.p.data)); });
  }

  /** Totais das obras: venda, receita, custos e resultados (previsto e apurado), recebido, a receber e margens. */
  function totaisObras(lista) {
    const t = { n: lista.length, vendido: 0, receita: 0, custoPrevisto: 0, custoRealizado: 0, custoApurado: 0, resultadoPrevisto: 0, resultado: 0, recebido: 0, aReceber: 0, pago: 0, aPagar: 0, fechadas: 0 };
    lista.forEach(function (o) {
      ['vendido', 'receita', 'custoPrevisto', 'custoRealizado', 'custoApurado', 'resultadoPrevisto', 'resultado', 'recebido', 'aReceber', 'pago', 'aPagar'].forEach(function (k) { t[k] += o[k]; });
      if (o.fechada) t.fechadas++;
    });
    Object.keys(t).forEach(function (k) { if (k !== 'n' && k !== 'fechadas') t[k] = arred(t[k]); });
    t.margem = t.receita > 0 ? t.resultado / t.receita : 0;
    t.margemPrevista = t.vendido > 0 ? t.resultadoPrevisto / t.vendido : 0;
    return t;
  }

  /* ------------------------------------------------------------ dados dos relatórios */

  const FILTROS = [
    { id: 'aberto', label: 'Em aberto (inclui vencidos)' }, { id: 'vencidos', label: 'Vencidos' }, { id: '30', label: 'Vencem nos próximos 30 dias' },
    { id: 'mes', label: 'Vencimento neste mês' }, { id: 'pagosMes', label: 'Baixados neste mês' }, { id: 'periodo', label: 'Vencimento no período' }, { id: 'todos', label: 'Todos' }
  ];

  /** Lançamentos a receber ou a pagar pelo filtro da lista (o: {filtro, q, de, ate, hoje}), na ordem de vencimento (baixados: de pagamento). */
  function filtrar(lancs, tipo, o) {
    o = o || {};
    const f = o.filtro || 'aberto', dia = o.hoje || hojeISO(), ate30 = somarDias(dia, 30), mes = dia.slice(0, 7);
    const busca = String(o.q || '').trim().toLowerCase();
    return (lancs || []).filter(function (l) {
      if (l.tipo !== tipo) return false;
      const s = situacao(l, dia);
      if (f === 'aberto' && !(s === 'aberto' || s === 'vencido')) return false;
      if (f === 'vencidos' && s !== 'vencido') return false;
      if (f === '30' && !(s === 'aberto' && l.vencimento <= ate30)) return false;
      if (f === 'mes' && String(l.vencimento).slice(0, 7) !== mes) return false;
      if (f === 'pagosMes' && !(s === 'pago' && String(l.pagoEm).slice(0, 7) === mes)) return false;
      if (f === 'periodo' && ((o.de && l.vencimento < o.de) || (o.ate && l.vencimento > o.ate))) return false;
      if (busca && [l.descricao, l.pessoa && l.pessoa.nome, l.documento, l.origem && l.origem.numero].join(' ').toLowerCase().indexOf(busca) < 0) return false;
      return true;
    }).sort(function (a, b) {
      if (f === 'pagosMes') return String(b.pagoEm).localeCompare(String(a.pagoEm));
      return String(a.vencimento).localeCompare(String(b.vencimento));
    });
  }

  const FAIXAS_ATRASO = [{ id: 'aVencer', label: 'A vencer' }, { id: 'd30', label: '1 a 30 dias' }, { id: 'd60', label: '31 a 60 dias' }, { id: 'd90', label: '61 a 90 dias' }, { id: 'd90mais', label: 'Mais de 90 dias' }];

  /** Inadimplência (contas a receber) ou atrasos (a pagar) por pessoa, nas faixas de atraso. */
  function atrasos(lancs, tipo, hoje) {
    const dia = hoje || hojeISO();
    const porPessoa = {};
    (lancs || []).forEach(function (l) {
      if (l.tipo !== (tipo || 'receber') || l.situacao !== 'aberto') return;
      const nome = (l.pessoa && l.pessoa.nome) || '(sem nome)';
      const x = porPessoa[nome] = porPessoa[nome] || { pessoa: nome, aVencer: 0, d30: 0, d60: 0, d90: 0, d90mais: 0, vencido: 0, total: 0, n: 0, maisAntigo: '' };
      const v = num(l.valor), dias = diasEntre(l.vencimento, dia);
      const faixa = dias <= 0 ? 'aVencer' : dias <= 30 ? 'd30' : dias <= 60 ? 'd60' : dias <= 90 ? 'd90' : 'd90mais';
      x[faixa] += v; x.total += v; x.n++;
      if (dias > 0) { x.vencido += v; if (!x.maisAntigo || l.vencimento < x.maisAntigo) x.maisAntigo = l.vencimento; }
    });
    const lista = Object.keys(porPessoa).map(function (k) { const x = porPessoa[k]; ['aVencer', 'd30', 'd60', 'd90', 'd90mais', 'vencido', 'total'].forEach(function (c) { x[c] = arred(x[c]); }); return x; })
      .sort(function (a, b) { return (b.vencido - a.vencido) || (b.total - a.total); });
    const tot = { aVencer: 0, d30: 0, d60: 0, d90: 0, d90mais: 0, vencido: 0, total: 0, n: 0 };
    lista.forEach(function (x) { Object.keys(tot).forEach(function (k) { tot[k] += x[k]; }); });
    Object.keys(tot).forEach(function (k) { if (k !== 'n') tot[k] = arred(tot[k]); });
    return { lista: lista, total: tot };
  }

  /**
   * Receitas e despesas por categoria no período. regime 'competencia': lançamentos não cancelados pela competência (valor);
   * 'caixa': os pagos pela data do pagamento (valor pago). Fora do resultado separado.
   */
  function porCategoria(lancs, categorias, de, ate, regime) {
    const caixa = regime === 'caixa';
    const acc = {};
    (lancs || []).forEach(function (l) {
      if (l.tipo === 'transferencia' || l.situacao === 'cancelado' || (caixa && l.situacao !== 'pago')) return;
      const data = String(caixa ? l.pagoEm : (l.competencia || l.vencimento) || '').slice(0, 10);
      if ((de && data < de) || (ate && data > ate)) return;
      const k = l.tipo + '|' + (l.categoriaId || '');
      const c = (categorias || []).find(function (x) { return x.id === l.categoriaId; });
      const x = acc[k] = acc[k] || { tipo: l.tipo, categoriaId: l.categoriaId || '', nome: c ? c.nome : 'Sem categoria', grupo: c ? c.grupo : (l.tipo === 'receber' ? 'receita' : 'despesa_admin'), total: 0, n: 0 };
      x.total += caixa ? num(l.valorPago || l.valor) : num(l.valor); x.n++;
    });
    const todos = Object.keys(acc).map(function (k) { acc[k].total = arred(acc[k].total); return acc[k]; });
    const montar = function (tipo, fora) {
      const l = todos.filter(function (x) { return x.tipo === tipo && (x.grupo === 'fora') === fora; }).sort(function (a, b) { return b.total - a.total; });
      const t = arred(l.reduce(function (s, x) { return s + x.total; }, 0));
      l.forEach(function (x) { x.pct = t > 0 ? x.total / t : 0; });
      return { lista: l, total: t };
    };
    const rec = montar('receber', false), desp = montar('pagar', false), foraE = montar('receber', true), foraS = montar('pagar', true);
    return { regime: caixa ? 'caixa' : 'competencia', receitas: rec, despesas: desp, foraEntradas: foraE, foraSaidas: foraS, resultado: arred(rec.total - desp.total) };
  }

  /** Movimento de caixa do período (realizado, todas as contas): linhas por data, totais e saldos de cada conta. */
  function movimento(lancs, contas, categorias, de, ate) {
    const ativas = (contas || []).filter(function (c) { return c.ativo !== false; });
    const linhas = [];
    let entradas = 0, saidas = 0, transf = 0;
    (lancs || []).forEach(function (l) {
      if (l.situacao !== 'pago') return;
      const d = String(l.pagoEm || '').slice(0, 10);
      if ((de && d < de) || (ate && d > ate)) return;
      const v = num(l.valorPago || l.valor);
      if (l.tipo === 'transferencia') { transf++; return; }
      const c = (contas || []).find(function (x) { return x.id === l.contaId; });
      const cat = (categorias || []).find(function (x) { return x.id === l.categoriaId; });
      linhas.push({ data: d, descricao: l.descricao, pessoa: (l.pessoa && l.pessoa.nome) || '', conta: c ? c.nome : '—', categoria: cat ? cat.nome : '—', entrada: l.tipo === 'receber' ? v : 0, saida: l.tipo === 'pagar' ? v : 0, l: l });
      if (l.tipo === 'receber') entradas += v; else saidas += v;
    });
    linhas.sort(function (a, b) { return a.data.localeCompare(b.data) || (b.entrada - a.entrada); });
    const saldos = ativas.map(function (c) {
      const ex = extrato(c, lancs, de || '', ate || hojeISO());
      return { conta: c, anterior: ex.anterior, entradas: arred(ex.linhas.reduce(function (s, m) { return s + m.entrada; }, 0)), saidas: arred(ex.linhas.reduce(function (s, m) { return s + m.saida; }, 0)), final: ex.final };
    });
    return { linhas: linhas, entradas: arred(entradas), saidas: arred(saidas), saldo: arred(entradas - saidas), transferencias: transf, saldos: saldos };
  }

  /* ------------------------------------------------------------ comissões */

  /**
   * Comissão de cada venda (proposta aprovada com vendedor): o valor da comissão da proposta, liberado na proporção do que o
   * cliente já pagou; descontado o que já foi lançado a pagar ao vendedor. Por vendedor, os totais.
   */
  function comissoes(propostas, lancs, ctx) {
    const C = App.Calc;
    const vendas = (propostas || []).filter(function (p) { return p.status === 'aprovada' && p.vendedor && p.vendedor.email; }).map(function (p) {
      let r = null;
      try { r = C.calcular(U.clone(p), ctx); } catch (e) { r = null; }
      const total = r ? num(r.total) : num((p.resumo || {}).total);
      const comissao = arred(r ? num(r.comissao) : 0);
      let recebido = 0, lancada = 0, paga = 0;
      (lancs || []).forEach(function (l) {
        if (l.situacao === 'cancelado') return;
        if (l.tipo === 'receber' && l.obraId === p.id && l.situacao === 'pago') recebido += num(l.valor);
        if (l.tipo === 'pagar' && l.origem && l.origem.tipo === 'comissao' && l.origem.id === p.id) { lancada += num(l.valor); if (l.situacao === 'pago') paga += num(l.valor); }
      });
      const fracao = total > 0 ? Math.min(1, recebido / total) : 0;
      const liberada = arred(comissao * fracao);
      return { p: p, vendedor: p.vendedor, total: arred(total), comissao: comissao, recebido: arred(recebido), fracao: fracao, liberada: liberada,
        lancada: arred(lancada), paga: arred(paga), aLancar: arred(Math.max(0, liberada - lancada)) };
    });
    const porVendedor = {};
    vendas.forEach(function (v) {
      const k = v.vendedor.email;
      const t = porVendedor[k] = porVendedor[k] || { email: k, nome: v.vendedor.nome || k, vendas: 0, vendido: 0, comissao: 0, liberada: 0, lancada: 0, paga: 0, aLancar: 0, itens: [] };
      t.vendas++; t.vendido += v.total; t.comissao += v.comissao; t.liberada += v.liberada; t.lancada += v.lancada; t.paga += v.paga; t.aLancar += v.aLancar;
      t.itens.push(v);
    });
    const lista = Object.keys(porVendedor).map(function (k) {
      const t = porVendedor[k];
      ['vendido', 'comissao', 'liberada', 'lancada', 'paga', 'aLancar'].forEach(function (x) { t[x] = arred(t[x]); });
      return t;
    }).sort(function (a, b) { return b.vendido - a.vendido; });
    return { vendas: vendas, vendedores: lista };
  }

  /* ------------------------------------------------------------ conciliação bancária (OFX) */

  function tag(bloco, nome) {
    const m = bloco.match(new RegExp('<' + nome + '>([^<\\r\\n]*)', 'i'));
    return m ? m[1].trim() : '';
  }

  /** Extrato do banco em OFX (v1 SGML ou v2 XML): conta, período, saldo e as transações {fitid, data, valor, tipo, descricao}. */
  function lerOfx(texto) {
    const t = String(texto || '');
    if (!/<OFX>/i.test(t) && !/<STMTTRN>/i.test(t)) throw new Error('O arquivo não parece um extrato OFX.');
    const data = function (s) { const m = String(s || '').match(/^(\d{4})(\d{2})(\d{2})/); return m ? m[1] + '-' + m[2] + '-' + m[3] : ''; };
    const valor = function (s) { let x = String(s || '').trim(); if (/,\d{1,2}$/.test(x) && x.indexOf('.') >= 0) x = x.replace(/\./g, ''); return Number(x.replace(',', '.')); };
    const transacoes = t.split(/<STMTTRN>/i).slice(1).map(function (b) {
      const bloco = b.split(/<\/STMTTRN>/i)[0];
      const memo = tag(bloco, 'MEMO'), nome = tag(bloco, 'NAME');
      return { fitid: tag(bloco, 'FITID'), data: data(tag(bloco, 'DTPOSTED')), valor: valor(tag(bloco, 'TRNAMT')), tipo: tag(bloco, 'TRNTYPE'),
        descricao: [nome, memo].filter(Boolean).filter(function (x, i, a) { return a.indexOf(x) === i; }).join(' — ') || tag(bloco, 'CHECKNUM') };
    }).filter(function (x) { return x.data && isFinite(x.valor) && x.valor !== 0; });
    // saldo do extrato: só quando o banco informa (LEDGERBAL)
    const bal = tag(t.split(/<LEDGERBAL>/i)[1] || '', 'BALAMT');
    return {
      banco: tag(t, 'BANKID'), agencia: tag(t, 'BRANCHID'), conta: tag(t, 'ACCTID'), inicio: data(tag(t, 'DTSTART')), fim: data(tag(t, 'DTEND')),
      saldo: bal !== '' && isFinite(valor(bal)) ? valor(bal) : null,
      transacoes: transacoes
    };
  }

  /** Categoria sugerida para uma transação do extrato sem lançamento (tarifas, juros, rendimentos). */
  function categoriaSugerida(t) {
    const d = String(t.descricao || '').toUpperCase();
    if (t.valor < 0 && /TARIFA|TAR\b|PACOTE|CESTA|MANUT|IOF|ANUIDADE|TX\b|TAXA/.test(d)) return 'cat-fin-tarifas';
    if (t.valor < 0 && /JUROS|ENCARGO|MULTA|MORA/.test(d)) return 'cat-fin-juros';
    if (t.valor > 0 && /REND|APLIC|RESGATE|JUROS/.test(d)) return 'cat-fin-rendimentos';
    return t.valor > 0 ? 'cat-rec-outras' : 'cat-adm-outras';
  }

  /**
   * Casa as transações do extrato com os lançamentos: já conciliado (mesmo FITID); pago na mesma conta com o mesmo valor e
   * data próxima (até 3 dias) → conciliar; em aberto com o mesmo valor e vencimento próximo (até 10 dias) → baixar e conciliar;
   * sem correspondência → novo lançamento (com categoria sugerida). Cada lançamento casa com uma transação só.
   */
  function conciliar(transacoes, lancs, contaId) {
    const usados = {};
    const porFitid = {};
    (lancs || []).forEach(function (l) { if (l.conciliado && l.conciliado.fitid) porFitid[l.conciliado.fitid] = l; });
    const sinalOk = function (l, t) { return t.valor > 0 ? (l.tipo === 'receber' || (l.tipo === 'transferencia' && l.destinoId === contaId)) : (l.tipo === 'pagar' || (l.tipo === 'transferencia' && l.contaId === contaId)); };
    return (transacoes || []).map(function (t) {
      if (t.fitid && porFitid[t.fitid]) { usados[porFitid[t.fitid].id] = true; return { t: t, acao: 'ja', lanc: porFitid[t.fitid] }; }
      const v = Math.abs(t.valor);
      const pagos = (lancs || []).filter(function (l) {
        if (usados[l.id] || l.situacao !== 'pago' || (l.conciliado && l.conciliado.fitid) || !sinalOk(l, t)) return false;
        const naConta = l.tipo === 'transferencia' ? (l.contaId === contaId || l.destinoId === contaId) : l.contaId === contaId;
        return naConta && Math.abs(num(l.valorPago || l.valor) - v) <= 0.01 && Math.abs(diasEntre(l.pagoEm, t.data)) <= 3;
      }).sort(function (a, b) { return Math.abs(diasEntre(a.pagoEm, t.data)) - Math.abs(diasEntre(b.pagoEm, t.data)); });
      if (pagos.length) { usados[pagos[0].id] = true; return { t: t, acao: 'conciliar', lanc: pagos[0] }; }
      const abertos = (lancs || []).filter(function (l) {
        return !usados[l.id] && l.situacao === 'aberto' && l.tipo !== 'transferencia' && sinalOk(l, t) && Math.abs(num(l.valor) - v) <= 0.01 && Math.abs(diasEntre(l.vencimento, t.data)) <= 10;
      }).sort(function (a, b) { return Math.abs(diasEntre(a.vencimento, t.data)) - Math.abs(diasEntre(b.vencimento, t.data)); });
      if (abertos.length) { usados[abertos[0].id] = true; return { t: t, acao: 'baixar', lanc: abertos[0] }; }
      return { t: t, acao: 'novo', categoriaId: categoriaSugerida(t) };
    });
  }

  /* ------------------------------------------------------------ lançamentos a partir dos documentos */

  function clienteDe(ctx, id, nome) {
    const c = (ctx.clientes || []).find(function (x) { return x.id === id; });
    return { tipo: 'cliente', id: id || '', nome: (c && c.nome) || nome || '' };
  }

  /** Base do lançamento (e o valor total) de cada documento: proposta, contrato, proposta avulsa, OS e pedido de compra. */
  function baseDe(tipo, doc, ctx) {
    const C = App.Calc;
    if (tipo === 'proposta') {
      let r = null;
      try { r = C.calcular(U.clone(doc), ctx); } catch (e) { r = null; }
      return { total: r ? arred(r.total) : num((doc.resumo || {}).total), base: novoLancamento('receber', { descricao: 'Proposta ' + doc.numero + ' — ' + (doc.clienteNome || 'cliente'),
        categoriaId: 'cat-rec-sistemas', pessoa: clienteDe(ctx, doc.clienteId, doc.clienteNome), origem: { tipo: 'proposta', id: doc.id, numero: doc.numero }, obraId: doc.id,
        competencia: String(doc.aprovadaEm || doc.data || hojeISO()).slice(0, 10) }) };
    }
    if (tipo === 'contrato') {
      const total = App.Contrato && App.Contrato.total ? num(App.Contrato.total(doc)) : (doc.parcelas || []).reduce(function (s, p) { return s + num(p.valor); }, 0);
      const cli = doc.clienteSnapshot || (ctx.clientes || []).find(function (x) { return x.id === doc.clienteId; }) || {};
      return { total: arred(total), parcelas: (doc.parcelas || []).map(function (p) { return { valor: num(p.valor), descricao: p.descricao || '' }; }),
        base: novoLancamento('receber', { descricao: 'Contrato ' + doc.numero + ' — ' + (cli.nome || 'cliente'), categoriaId: 'cat-rec-sistemas',
          pessoa: { tipo: 'cliente', id: doc.clienteId || '', nome: cli.nome || '' }, origem: { tipo: 'contrato', id: doc.id, numero: doc.numero }, obraId: doc.propostaId || '',
          competencia: String(doc.data || hojeISO()).slice(0, 10) }) };
    }
    if (tipo === 'avulsa') {
      const r = App.Avulsa.calcular(doc, ctx);
      return { total: arred(r.total), base: novoLancamento('receber', { descricao: 'Proposta de serviços ' + doc.numero + ' — ' + (doc.clienteNome || 'cliente'), categoriaId: 'cat-rec-servicos',
        pessoa: clienteDe(ctx, doc.clienteId, doc.clienteNome), origem: { tipo: 'avulsa', id: doc.id, numero: doc.numero }, competencia: String(doc.data || hojeISO()).slice(0, 10) }) };
    }
    if (tipo === 'os') {
      const inst = doc.instalacaoId && App.Store ? App.Store.get('instalacoes', doc.instalacaoId) : null;
      return { total: arred(num(doc.valor)), base: novoLancamento('receber', { descricao: 'OS ' + doc.numero + ' — ' + (doc.clienteNome || 'cliente'), categoriaId: 'cat-rec-servicos',
        pessoa: clienteDe(ctx, doc.clienteId, doc.clienteNome), origem: { tipo: 'os', id: doc.id, numero: doc.numero }, obraId: (inst && inst.propostaId) || '',
        competencia: String(doc.concluidaEm || doc.data || hojeISO()).slice(0, 10) }) };
    }
    if (tipo === 'compra') {
      const inst = doc.instalacaoId && App.Store ? App.Store.get('instalacoes', doc.instalacaoId) : null;
      const f = doc.fornecedor || {};
      return { total: arred(App.Compra.totais(doc).total), base: novoLancamento('pagar', { descricao: 'Pedido ' + doc.numero + ' — ' + (f.nome || 'fornecedor'), categoriaId: 'cat-cus-materiais',
        pessoa: { tipo: 'fornecedor', id: '', nome: f.nome || '' }, origem: { tipo: 'compra', id: doc.id, numero: doc.numero }, obraId: (inst && inst.propostaId) || '',
        documento: doc.docFornecedor || '', competencia: String(doc.data || hojeISO()).slice(0, 10) }) };
    }
    throw new Error('Documento sem lançamento no financeiro: ' + tipo);
  }

  /** Lançamentos já feitos a partir do documento (para avisar antes de lançar de novo). */
  function lancadosDe(lancs, tipo, id) {
    return (lancs || []).filter(function (l) { return l.origem && l.origem.tipo === tipo && l.origem.id === id && l.situacao !== 'cancelado'; });
  }

  App.Fin = {
    TIPOS: TIPOS, FORMAS: FORMAS, TIPOS_CONTA: TIPOS_CONTA, MESES: MESES, rotulo: rotulo, somarMeses: somarMeses, somarDias: somarDias,
    novoLancamento: novoLancamento, situacao: situacao, gerarParcelas: gerarParcelas, baixar: baixar, estornar: estornar, transferencia: transferencia,
    movimentos: movimentos, saldoConta: saldoConta, saldoTotal: saldoTotal, extrato: extrato, resumo: resumo, fluxo: fluxo,
    dre: dre, dreCsv: dreCsv, resultadoObras: resultadoObras, comissoes: comissoes, lerOfx: lerOfx, conciliar: conciliar, categoriaSugerida: categoriaSugerida,
    LINHAS_OBRA: LINHAS_OBRA, linhaObra: linhaObra, parametrosObras: parametrosObras, previstoProposta: previstoProposta, apuracaoObra: apuracaoObra, totaisObras: totaisObras,
    FAIXAS_ATRASO: FAIXAS_ATRASO, atrasos: atrasos, porCategoria: porCategoria, movimento: movimento, FILTROS: FILTROS, filtrar: filtrar,
    baseDe: baseDe, lancadosDe: lancadosDe
  };
})(window.App);
