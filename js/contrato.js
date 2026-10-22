/*
 * Contrato de prestação de serviços: dados do contrato (criado a partir de uma proposta ou em branco) e
 * montagem do documento no layout do modelo de contrato (faixas azuis, tabelas CAMPO/DADOS, cláusulas numeradas,
 * gráfico de produção, termo de garantia, tabela de parcelas, local/data e assinaturas).
 * O modelo é convertido em Word por App.Docx.pacote e em PDF por App.Pdf.pacote.
 */
window.App = window.App || {};

(function (App) {
  'use strict';

  const U = App.U;
  const N = App.Documento.nos;

  const AZUL = '0D5B8F', ZEBRA = 'EAF2FB', BRANCO = 'FFFFFF', CINZA = '5A5A5A', BORDA = '1B2A4A', OURO = 'C49A22';
  const SZ = 22; // corpo do contrato em 11 pt
  const PAPEL = { w: 11906, h: 16838 };
  const MARGENS = { top: 1800, right: 1134, bottom: 1600, left: 1134, header: 708, footer: 708 };
  const LARG = 9360;

  const STATUS = [
    { id: 'rascunho', label: 'Rascunho' },
    { id: 'enviado', label: 'Enviado para assinatura' },
    { id: 'assinado', label: 'Assinado' },
    { id: 'concluido', label: 'Concluído' },
    { id: 'cancelado', label: 'Cancelado' }
  ];

  /* ------------------------------------------------------------ nós com o estilo do contrato */

  function r(texto, ro) { return N.R(texto, Object.assign({ sz: SZ }, ro || {})); }
  function p(filhos, po) { return N.P(filhos, po); }
  function t(texto, po, ro) { return p([r(texto, ro)], po); }
  function espaco(before) { return p([], { before: before }); }

  /** Texto com trechos **assim** em negrito sublinhado. */
  function ricos(texto, ro) {
    const out = [];
    String(texto || '').split(/(\*\*[^*]+\*\*)/).forEach(function (s) {
      if (!s) return;
      const m = s.match(/^\*\*([^*]+)\*\*$/);
      out.push(m ? r(m[1], Object.assign({}, ro, { b: true, u: true })) : r(s, ro));
    });
    return out;
  }

  const SEM_BORDA = { semBorda: true };
  const BORDA_TAB = { cor: BORDA, sz: 4 };

  /** Faixa azul de título de seção (tabela de 1 coluna, sem bordas). */
  function faixa(titulos) {
    const tbl = N.TBL([LARG], [].concat(titulos).map(function (tx) {
      return N.TR([N.TC(t(tx, { jc: 'center', keepNext: true }, { b: true, color: BRANCO, sz: 24 }),
        Object.assign({ w: LARG, fill: AZUL, mar: { t: 100, l: 180, b: 100, r: 180 } }, SEM_BORDA))]);
    }));
    tbl.manterComProximo = true;
    return tbl;
  }

  function celCab(texto, w, jc) {
    return N.TC(t(texto, { jc: jc || 'center' }, { b: true, color: BRANCO, sz: 20 }), { w: w, fill: AZUL, borda: BORDA_TAB, mar: { t: 80, l: 150, b: 80, r: 150 } });
  }

  /** Tabela CAMPO | DADOS das partes: 1ª coluna azul, 2ª coluna zebrada, texto 10 pt. */
  function tabelaPartes(linhas, larguras) {
    const w = larguras || [2340, 7020];
    const rows = [N.TR([celCab('CAMPO', w[0]), celCab('DADOS', w[1])], true)];
    linhas.forEach(function (l, i) {
      const mar = { t: 70, l: 150, b: 70, r: 150 };
      rows.push(N.TR([
        N.TC(t(l[0], null, { b: true, color: BRANCO, sz: 20 }), { w: w[0], fill: AZUL, borda: BORDA_TAB, mar: mar }),
        N.TC(t(l[1], null, { sz: 20 }), { w: w[1], fill: i % 2 === 0 ? ZEBRA : BRANCO, borda: BORDA_TAB, mar: mar })
      ]));
    });
    return N.TBL(w, rows);
  }

  /** Tabela de especificação (CARACTERÍSTICA | ESPECIFICAÇÃO) e de dados bancários: 1ª coluna clara em negrito. */
  function tabelaSpec(linhas, larguras, cab) {
    const w = larguras || [2734, 6626];
    const c = cab || ['CARACTERÍSTICA', 'ESPECIFICAÇÃO'];
    const mar = { t: 80, l: 150, b: 80, r: 150 };
    const rows = [N.TR([celCab(c[0], w[0]), celCab(c[1], w[1])], true)];
    linhas.forEach(function (l) {
      rows.push(N.TR([
        N.TC(t(l[0], null, { b: true }), { w: w[0], fill: ZEBRA, borda: BORDA_TAB, mar: mar }),
        N.TC(t(l[1]), { w: w[1], borda: BORDA_TAB, mar: mar })
      ]));
    });
    return N.TBL(w, rows);
  }

  /** Tabela genérica com cabeçalho azul e linhas zebradas (a 2ª linha de dados é a clara). */
  function tabelaLista(colunas, linhas, o) {
    o = o || {};
    const mar = { t: 80, l: 150, b: 80, r: 150 };
    const rows = [N.TR(colunas.map(function (c) { return celCab(c.t, c.w); }), true)];
    linhas.forEach(function (lin, i) {
      const fill = (o.primeiraClara ? i % 2 === 0 : i % 2 === 1) ? ZEBRA : null;
      rows.push(N.TR(lin.map(function (cel, j) {
        const c = typeof cel === 'object' && cel !== null ? cel : { t: cel };
        const col = colunas[j];
        const jc = c.jc || col.jc;
        return N.TC(t(c.t == null ? '' : c.t, jc ? { jc: jc } : null, { b: c.b || col.b, color: c.color || col.color, sz: c.sz || col.sz }),
          { w: col.w, fill: fill, borda: BORDA_TAB, mar: mar });
      })));
    });
    return N.TBL(colunas.map(function (c) { return c.w; }), rows);
  }

  /** Item de lista "a) texto" (rótulo azul em negrito, recuo de 0,25"). */
  function itemLetra(i, texto, esp) {
    const e = esp || 40;
    return p([r(String.fromCharCode(97 + i) + ') ', { b: true, color: AZUL })].concat(ricos(texto)), { before: e, after: e, ind: 360 });
  }

  function itemPonto(texto) {
    return p([r('• ' + texto)], { before: 30, after: 30, ind: 360 });
  }

  function documentoLabel(doc) {
    const d = String(doc || '').replace(/\D/g, '');
    return d.length === 11 ? 'CPF' : 'CNPJ';
  }

  function enderecoCompleto(o, comCep) {
    const rua = [o.endereco, o.numero].filter(Boolean).join(', ');
    const cidade = [o.cidade, o.uf].filter(Boolean).join(' – ');
    const partes = [rua, o.bairro, cidade].filter(Boolean).join(', ');
    return partes + (comCep && o.cep ? (partes ? ', ' : '') + 'CEP: ' + o.cep : '');
  }

  /* ------------------------------------------------------------ dados do contrato */

  /** Total do contrato = soma das parcelas. */
  function total(ct) {
    return (ct.parcelas || []).reduce(function (s, x) { return s + U.numOr(x.valor, 0); }, 0);
  }

  /**
   * Parcelas padrão: equipamentos na assinatura; serviços em 50% na assinatura e 50% após a homologação.
   */
  function parcelasPadrao(valorTotal, valorEquip, descEquip) {
    const tot = U.round(U.numOr(valorTotal, 0), 2);
    const eq = Math.max(0, Math.min(tot, U.round(U.numOr(valorEquip, 0), 2)));
    const serv = U.round(tot - eq, 2);
    const metade = U.round(serv / 2, 2);
    const lista = [];
    if (eq > 0) lista.push({ valor: eq, descricao: descEquip || 'Aquisição dos Equipamentos', forma: 'Na assinatura do contrato', banco: false });
    lista.push({ valor: metade, descricao: '50% dos serviços de execução, instalação, montagem e projeto', forma: 'Na assinatura do contrato — PIX/Transferência', banco: true });
    lista.push({ valor: U.round(serv - metade, 2), descricao: '50% dos serviços de execução, instalação, montagem e projeto', forma: 'Após homologação na concessionária — PIX/Transferência', banco: true });
    return lista;
  }

  function snapshotCliente(c) {
    if (!c) return null;
    return {
      nome: c.nome || '', nomeFantasia: c.nomeFantasia || '', documento: c.documento || '', inscricaoEstadual: c.inscricaoEstadual || '',
      endereco: c.endereco || '', numero: c.numero || '', bairro: c.bairro || '', cidade: c.cidade || '', uf: c.uf || '', cep: c.cep || '',
      telefone: c.telefone || '', email: c.email || ''
    };
  }

  /** Contrato em branco. */
  function novo(ctx) {
    const emp = ctx.empresa;
    const num = App.Store.proximoNumero(U.todayISO(), 'contrato');
    return {
      id: null,
      numero: num.numero,
      data: U.todayISO(),
      status: 'rascunho',
      propostaId: null,
      propostaNumero: '',
      clienteId: null,
      clienteSnapshot: null,
      subtitulo: 'Sistema de Geração de Energia Solar Fotovoltaica',
      objeto: 'Elaboração de Projeto e Instalação de Sistema de Energia Solar Fotovoltaica',
      kwp: '',
      consumoMedio: '',
      prazoDias: 60,
      cidade: emp.cidade || '',
      uf: emp.uf || '',
      foro: [emp.cidade, emp.uf].filter(Boolean).join(' – '),
      producao: { incluir: false, meses: Array(12).fill(''), consumo: '', perdas: 20, pr: 80, local: [emp.cidade, emp.uf].filter(Boolean).join(' – '), subtitulo: '' },
      equipamentos: [],
      parcelas: parcelasPadrao(0, 0),
      modelo: U.clone(App.Store.config().contrato),
      _seq: num
    };
  }

  /** Grupos de equipamentos (tabelas da seção "Dos equipamentos contratados") a partir do resultado da proposta. */
  function equipamentosDaProposta(r, ctx, emp, prop) {
    const grupos = [];
    const un = function (n) { return U.fmt(n, 0) + (n === 1 ? ' Unidade' : ' Unidades'); };
    const anos = function (v) { return U.num(v) > 0 ? U.fmtSmart(U.num(v), 1) + ' Anos' : 'Conforme fabricante'; };
    if (r.incluiFV && r.modulo && r.nModulos > 0) {
      const m = r.modulo;
      grupos.push({
        titulo: 'Módulos Fotovoltaicos', tipo: 'spec', linhas: [
          ['Fabricante', String(m.fabricante || '').toUpperCase()],
          ['Modelo', [m.modelo, [m.tecnologia, m.detalhe].filter(Boolean).join(' ')].filter(Boolean).join(' – ')],
          ['Potência', U.fmt(m.potencia, 0) + ' Wp'],
          ['Quantidade', un(r.nModulos)],
          ['Garantia – Defeitos de Fabricação', anos(m.garantiaProduto)],
          ['Garantia – Eficiência/Performance', anos(m.garantiaPerformance)]
        ]
      });
    }
    if (r.incluiFV && r.inversor && r.nInversores > 0) {
      const i = r.inversor;
      const potW = U.num(i.potencia) * 1000;
      const pot = r.nInversores > 1
        ? U.fmt(potW, 0) + ' W (× ' + r.nInversores + ' un.) = ' + U.fmt(potW * r.nInversores, 0) + ' W total'
        : U.fmt(potW, 0) + ' W';
      grupos.push({
        titulo: i.tipo === 'hibrido' ? 'Inversores Híbridos' : (i.tipo === 'micro' ? 'Microinversores' : 'Inversores'), tipo: 'spec', linhas: [
          ['Fabricante', String(i.fabricante || '').toUpperCase()],
          ['Modelo', i.modelo || ''],
          ['Potência', pot],
          ['Fase', [[i.fases, i.tensao].filter(Boolean).join(' '), U.num(i.mppts) > 0 ? i.mppts + ' MPPT' : ''].filter(Boolean).join(' – ')],
          i.tipo === 'micro' && U.num(i.modulosPorUnidade) > 0 ? ['Módulos por Microinversor', String(i.modulosPorUnidade)] : ['', ''],
          ['Quantidade', un(r.nInversores)],
          ['Garantia', anos(i.garantia)]
        ].filter(function (l) { return l[1]; })
      });
    }
    const h = r.hibrido;
    if (h && h.bateria && h.nBaterias > 0) {
      const b = h.bateria;
      const e = U.num(b.energia);
      const linhas = [
        ['Fabricante', String(b.fabricante || '').toUpperCase()],
        ['Modelo', b.modelo || ''],
        ['Capacidade', h.nBaterias > 1 ? U.fmtSmart(e, 2) + ' kWh (× ' + h.nBaterias + ' un.) = ' + U.fmtSmart(e * h.nBaterias, 2) + ' kWh' : U.fmtSmart(e, 2) + ' kWh']
      ];
      if (U.num(h.potenciaArm) > 0) linhas.push(['Potência', U.fmtSmart(h.potenciaArm, 2) + ' kW']);
      if (b.quimica) linhas.push(['Tecnologia', b.quimica + (U.num(b.ciclos) > 0 ? ' – ' + U.fmt(b.ciclos, 0) + ' ciclos' : '')]);
      linhas.push(['Configuração', h.configuracao || '']);
      linhas.push(['Quantidade', un(h.nBaterias)]);
      linhas.push(['Garantia', anos(b.garantia)]);
      grupos.push({ titulo: b.tipo === 'bess' ? 'Sistema de Armazenamento (BESS)' : 'Baterias', tipo: 'spec', linhas: linhas.filter(function (l) { return l[1]; }) });
    }
    const fab = function (it) {
      const eq = (ctx.equipamentos || []).find(function (e) { return e.id === it.equipamentoId; });
      return (eq && eq.fabricante) || '—';
    };
    const qtd = function (it) { return U.fmtSmart(U.numOr(it.qtd, 0), 2) + (it.unidade && it.unidade !== 'un' ? ' ' + it.unidade : ''); };
    const est = (r.itens || []).filter(function (i) { return i.categoria === 'estrutura'; });
    if (est.length) grupos.push({ titulo: 'Estrutura de Fixação', tipo: 'lista', itens: est.map(function (i) { return [i.descricao, fab(i), qtd(i)]; }) });
    const adicionais = (r.itens || []).filter(function (i) { return i.categoria === 'material' || i.categoria === 'outro'; })
      .map(function (i) { return [i.descricao, fab(i), qtd(i)]; });
    if (r.incluiFV && r.infra > 0) adicionais.push([prop.infraDescricao || ctx.textos.infraDescricao, '—', '01']);
    adicionais.push(['Instalação e Montagem do Sistema + Suporte Técnico', emp.nomeFantasia || emp.nomeCurto || emp.razao, '01']);
    grupos.push({ titulo: 'Itens Adicionais', tipo: 'lista', itens: adicionais });
    return grupos;
  }

  /** Cria o contrato a partir de uma proposta salva. */
  function deProposta(prop, ctx) {
    const ct = novo(ctx);
    const r = App.Calc.calcular(prop, ctx);
    const emp = ctx.empresa;
    const cliente = (ctx.clientes || []).find(function (c) { return c.id === prop.clienteId; }) || prop.clienteSnapshot || null;
    ct.propostaId = prop.id;
    ct.propostaNumero = prop.numero;
    ct.clienteId = prop.clienteId || null;
    ct.clienteSnapshot = snapshotCliente(cliente);
    ct.consumoMedio = r.consumoMedio > 0 ? U.round(r.consumoMedio, 0) : '';
    const temFV = r.incluiFV && r.kwp > 0;
    const temArm = r.hibrido && r.hibrido.nBaterias > 0;
    const capArm = temArm ? U.fmtSmart(r.hibrido.capInstalada, 2) + ' kWh' : '';
    ct.kwp = temFV ? U.round(r.kwp, 3) : '';
    if (temFV) {
      ct.objeto = 'Elaboração de Projeto e Instalação de Sistema de Energia Solar Fotovoltaica de ' + U.kwp(r.kwp) + ' kWp' +
        (temArm ? (r.bessAtivo ? ' com Sistema de Armazenamento de Energia (BESS) de ' : ' com banco de baterias de ') + capArm : '');
      ct.subtitulo = temArm ? 'Sistema de Geração de Energia Solar Fotovoltaica com Armazenamento' : 'Sistema de Geração de Energia Solar Fotovoltaica';
    } else if (temArm) {
      ct.objeto = 'Fornecimento, Instalação e Comissionamento de Sistema de Armazenamento de Energia (BESS) de ' + capArm +
        (U.num(r.hibrido.potenciaArm) > 0 ? ' / ' + U.fmtSmart(r.hibrido.potenciaArm, 2) + ' kW' : '');
      ct.subtitulo = 'Sistema de Armazenamento de Energia (BESS)';
    }
    ct.cidade = emp.cidade || r.cidade || '';
    ct.uf = emp.uf || r.uf || '';
    if (temFV) {
      const prem = r.premissas || ctx.premissas;
      // perfil mensal da localidade ajustado para que o total anual prometido seja a geração anual da proposta
      ct.producao = {
        incluir: true,
        meses: App.Calc.producaoMensal(r),
        consumo: r.consumoMedio > 0 ? U.round(r.consumoMedio, 0) : '',
        perdas: U.round((1 - prem.pr) * 100, 1),
        pr: U.round(prem.pr * 100, 1),
        local: [r.cidade, r.uf].filter(Boolean).join(' – '),
        subtitulo: App.Calc.descricaoSistema(r, prem)
      };
    } else {
      ct.producao.incluir = false;
    }
    ct.equipamentos = equipamentosDaProposta(r, ctx, emp, prop);
    const valorEquip = (r.incluiFV ? r.kit : 0) + (r.kitArm || 0);
    ct.parcelas = parcelasPadrao(r.total, valorEquip, 'Aquisição dos Equipamentos' + (prop.numero ? ' (conforme Proposta ' + prop.numero + ')' : ''));
    return ct;
  }

  /* ------------------------------------------------------------ montagem do documento */

  /**
   * @param ct contrato; ctx contexto (empresa); logo {w, h}; cliente (cadastro atual ou snapshot)
   * @returns modelo {papel, k, margens, corpo, cabecalho, rodape}
   */
  function montar(ct, ctx, logo, cliente) {
    const emp = ctx.empresa;
    const mod = ct.modelo || App.Store.config().contrato;
    const cli = cliente || ct.clienteSnapshot || {};
    const valor = total(ct);
    const uf = ct.uf || emp.uf || '';
    const cidade = ct.cidade || emp.cidade || '';
    const prod = ct.producao || {};
    const temProducao = !!(prod.incluir && (prod.meses || []).some(function (v) { return U.num(v) > 0; }));
    const temEquip = (ct.equipamentos || []).some(function (g) { return (g.linhas && g.linhas.length) || (g.itens && g.itens.length); });

    // numeração das seções e cláusulas (para as referências {sec:ID} e {cl:ID})
    const secoes = (mod.secoes || []).filter(function (s) {
      if (s.tipo === 'producao') return temProducao;
      if (s.tipo === 'equipamentos') return temEquip;
      return true;
    });
    const numSec = {}, numCl = {};
    let ns = 1, nc = 0;
    secoes.forEach(function (s) {
      numSec[s.id] = ++ns;
      (s.clausulas || []).forEach(function (c) { if (!c.semNumero) { nc++; if (c.id) numCl[c.id] = nc; } });
    });

    const kwpTxt = U.num(ct.kwp) > 0 ? U.kwp(U.num(ct.kwp)) : '';
    const vars = {
      objeto: ct.objeto || '', kwp: kwpTxt, prazoDias: String(U.numOr(ct.prazoDias, 0)), prazoExtenso: U.numeroExtenso(U.numOr(ct.prazoDias, 0)),
      valorExtenso: U.brl(valor) + ' (' + U.extenso(valor) + ')', valor: U.brl(valor),
      local: prod.local || [cidade, uf].filter(Boolean).join(' – '), cidade: cidade, uf: uf, foro: ct.foro || [cidade, uf].filter(Boolean).join(' – '),
      perdas: U.fmtSmart(U.numOr(prod.perdas, 20), 1), pr: U.fmtSmart(U.numOr(prod.pr, 80), 1),
      empresa: emp.nomeFantasia || emp.nomeCurto || emp.razao, cliente: cli.nome || ''
    };
    const sub = function (texto) {
      return String(texto || '').replace(/\{(\w+)(?::(\w+))?\}/g, function (m, k, id) {
        if (k === 'cl' && id) return numCl[id] != null ? numCl[id] + 'ª' : m;
        if (k === 'sec' && id) return numSec[id] != null ? String(numSec[id]) : m;
        return vars[k] != null ? vars[k] : m;
      });
    };

    const b = [];
    b.push(t(mod.titulo || 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS', { before: 240, after: 80, jc: 'center' }, { b: true, u: true, color: AZUL, sz: 32 }));
    b.push(t(ct.subtitulo || mod.subtitulo || '', { after: 280, jc: 'center' }, { b: true, color: AZUL }));

    /* ---------- 1. partes */
    b.push(faixa('1. IDENTIFICAÇÃO DAS PARTES'));
    b.push(espaco(80));
    b.push(t('CONTRATADA – Prestadora dos Serviços', { before: 120, after: 60, keepNext: true }, { b: true, color: AZUL }));
    const linhaSe = function (rot, v) { return v ? [rot, v] : null; };
    b.push(tabelaPartes([
      linhaSe('Nome Fantasia', emp.nomeFantasia || emp.nomeCurto),
      linhaSe('Razão Social', emp.razaoSocial || emp.razao),
      linhaSe('CNPJ', emp.cnpj),
      linhaSe('Endereço', enderecoCompleto(emp, true)),
      linhaSe('Resp. Técnico', emp.responsavel),
      linhaSe('Registro CREA' + (emp.uf ? '/' + emp.uf : ''), emp.crea),
      linhaSe(emp.registroTipo || 'Registro', emp.registro),
      linhaSe('WhatsApp', emp.telefone),
      linhaSe('E-mail', emp.email)
    ].filter(Boolean)));
    b.push(espaco(160));
    b.push(t('CONTRATANTE – Cliente', { before: 60, after: 60, keepNext: true }, { b: true, color: AZUL }));
    b.push(tabelaPartes([
      ['Nome', cli.nome || ''],
      linhaSe('Nome Fantasia', cli.nomeFantasia),
      linhaSe(documentoLabel(cli.documento), cli.documento),
      linhaSe('Inscrição Estadual', cli.inscricaoEstadual),
      linhaSe('Endereço', enderecoCompleto(cli, true)),
      linhaSe('Telefone / WhatsApp', cli.telefone),
      linhaSe('E-mail', cli.email),
      linhaSe('Consumo Médio Contratado', U.num(ct.consumoMedio) > 0 ? U.fmt(U.num(ct.consumoMedio), 0) + ' kWh/mês' : '')
    ].filter(Boolean)));
    b.push(espaco(200));

    /* ---------- seções do modelo */
    let clausula = 0;
    const paragrafoClausula = function (c, po) {
      const filhos = [];
      if (c.semNumero) {
        filhos.push(r(c.rotulo || 'Parágrafo Único', { b: true, color: AZUL }));
      } else {
        clausula++;
        filhos.push(r('Cláusula ' + clausula + 'ª', { b: true, color: AZUL }));
        if (c.rotulo) filhos.push(r(' – ' + c.rotulo, { b: true, color: AZUL, u: !!c.sublinhar }));
      }
      filhos.push(r(': '));
      return p(filhos.concat(ricos(sub(c.texto))), po);
    };

    secoes.forEach(function (s) {
      const n = numSec[s.id];
      if (s.tipo === 'garantias') {
        b.push.apply(b, secaoGarantias(n, s, mod.garantias || {}, emp, sub, linhaGarantiaArmazenamento(ct)));
        return;
      }
      b.push(faixa(n + '. ' + s.titulo));
      b.push(espaco(80));
      const cls = s.clausulas || [];
      if (s.tipo === 'producao') {
        b.push(p([r('Parágrafo Único', { b: true, color: AZUL }), r('. ')].concat(ricos(sub(s.paragrafo))), { before: 100, after: 100 }));
        const ex = N.encaixar(1800, 772, 5276850, 2263140);
        b.push(p(N.IMG('grafico', ex.cx, ex.cy, 'Estimativa de produção mensal'), { before: 60, after: 60, jc: 'center' }));
        b.push(t(sub(s.fonte), { before: 20, after: 200, jc: 'center' }, { i: true, color: CINZA, sz: 18 }));
        return;
      }
      if (s.tipo === 'equipamentos') {
        (ct.equipamentos || []).forEach(function (g, gi) {
          const temLinhas = (g.linhas && g.linhas.length) || (g.itens && g.itens.length);
          if (!temLinhas) return;
          b.push(t(n + '.' + (gi + 1) + ' – ' + g.titulo, { before: 140, after: 60, keepNext: true }, { b: true, color: AZUL }));
          if (g.tipo === 'lista') {
            b.push(tabelaLista([
              { t: 'ITEM / DESCRIÇÃO', w: 5460 }, { t: 'FABRICANTE', w: 2400, jc: 'center' }, { t: 'QTDE', w: 1500, jc: 'center' }
            ], g.itens));
          } else {
            b.push(tabelaSpec(g.linhas));
          }
          b.push(espaco(140));
        });
        b.push(espaco(260));
        return;
      }
      cls.forEach(function (c, i) {
        const po = s.id === 'objeto' ? { before: 140, after: 80 } : (c.rotulo && !c.semNumero ? { before: 80, after: 120 } : { before: 120, after: 60 });
        if (s.id === 'rescisao' || s.id === 'disposicoes') po.before = 100;
        if (s.tipo === 'pagamento' && i === 0) { po.before = 120; po.after = 120; }
        b.push(paragrafoClausula(c, po));
      });
      if (s.tipo === 'pagamento') {
        b.push.apply(b, blocoPagamento(ct, emp, valor));
      }
      b.push(espaco(s.tipo === 'pagamento' ? 200 : 120));
    });

    /* ---------- local, data e assinaturas */
    b.push(p([], { before: 120, after: 120, bottom: { sz: 12, space: 1, color: OURO } }));
    b.push(N.TBL([LARG], [N.TR([N.TC(p([
      r('Local: ', { b: true, color: AZUL }), r([cidade, uf].filter(Boolean).join(' – ') + '          '),
      r('Data:', { b: true, color: AZUL }), r(' ' + U.dataExtenso(ct.data) + '.', { b: true, color: AZUL })
    ], { jc: 'center' }), { w: LARG, fill: ZEBRA, borda: BORDA_TAB, mar: { t: 100, l: 200, b: 100, r: 200 } })])]));
    b.push(espaco(160), espaco(160), espaco(160), espaco(160));
    const assinatura = function (nome, papel, doc) {
      return [
        p([], { before: 100, after: 40, top: { sz: 6, space: 1, color: BORDA } }),
        t(nome, { jc: 'center' }, { b: true, color: AZUL }),
        t(papel + (doc ? '  |  ' + documentoLabel(doc) + ': ' + doc : ''), { jc: 'center' }, { color: CINZA, sz: 20 }),
        p([], { before: 80 })
      ];
    };
    b.push(N.TBL([4380, 600, 4380], [N.TR([
      N.TC(assinatura(cli.nome || 'CONTRATANTE', 'CONTRATANTE', cli.documento), Object.assign({ w: 4380, vAlign: 'top' }, SEM_BORDA)),
      N.TC(p([]), Object.assign({ w: 600 }, SEM_BORDA)),
      N.TC(assinatura(emp.razaoSocial || emp.razao, 'CONTRATADA', emp.cnpj), Object.assign({ w: 4380, vAlign: 'top' }, SEM_BORDA))
    ])]));
    b.push(espaco(400));

    /* ---------- cabeçalho e rodapé */
    const lc = N.encaixar(logo.w, logo.h, 1311216, 657860);
    const pc = { before: 60, after: 80 };
    const cabecalho = [
      p(N.IMG('logo', lc.cx, lc.cy, 'Logotipo')),
      N.TBL([4600, 4600], [N.TR([
        N.TC([
          t(emp.razaoSocial || emp.razao, Object.assign({}, pc), { b: true, color: AZUL }),
          t('CNPJ: ' + (emp.cnpj || ''), Object.assign({}, pc), { color: CINZA, sz: 18 })
        ], Object.assign({ w: 4600, vAlign: 'top' }, SEM_BORDA)),
        N.TC(t(emp.sloganContrato || '', Object.assign({ jc: 'right' }, pc), { i: true, color: CINZA, sz: 18 }), Object.assign({ w: 4600 }, SEM_BORDA))
      ])]),
      p([], { before: 40, after: 40, bottom: { sz: 8, space: 1, color: AZUL } })
    ];
    const end = [[emp.endereco, emp.numero].filter(Boolean).join(', '), emp.bairro, emp.cep ? 'CEP: ' + emp.cep : '', emp.cidade, emp.uf].filter(Boolean).join(' - ');
    const contato = [emp.telefone ? 'Tel: ' + emp.telefone : '', emp.email ? 'E-mail: ' + emp.email : ''].filter(Boolean).join('   |   ');
    const linhaRod = function (texto, b2, mar) {
      return N.TR([N.TC(t(texto, { before: 60, after: 80, jc: 'center' }, { b: b2, color: BRANCO, sz: 17 }), Object.assign({ w: 9200, fill: AZUL, mar: mar }, SEM_BORDA))]);
    };
    const rodape = [N.TBL([9200], [
      linhaRod(end || emp.razaoSocial || emp.razao, true, { t: 60, l: 120, b: 20, r: 120 }),
      linhaRod(contato || ('CNPJ: ' + (emp.cnpj || '')), false, { t: 20, l: 120, b: 60, r: 120 })
    ])];

    return { papel: PAPEL, k: 1, margens: MARGENS, corpo: b, cabecalho: cabecalho, rodape: rodape };
  }

  /**
   * Linha da tabela de garantias para baterias/BESS, quando o contrato tem armazenamento (grupo de equipamentos
   * "Baterias" ou "Sistema de Armazenamento (BESS)"): prazo e vida útil conforme o fabricante.
   */
  function linhaGarantiaArmazenamento(ct) {
    const gr = (ct.equipamentos || []).find(function (x) { return /bateria|armazenamento|bess/i.test(x.titulo || ''); });
    if (!gr) return null;
    const val = function (rot) { const l = (gr.linhas || []).find(function (x) { return x[0] === rot; }); return l ? String(l[1] || '') : ''; };
    const garantia = val('Garantia');
    const tecnologia = val('Tecnologia');
    return {
      item: /bess/i.test(gr.titulo) ? 'Sistema de Armazenamento (BESS)' : 'Baterias',
      prazo: garantia && !/conforme/i.test(garantia) ? garantia.replace(/\bAnos\b/, 'anos') : 'Conforme fabricante',
      cobertura: 'Defeitos de fabricação e retenção de capacidade conforme o fabricante' + (tecnologia ? ' (' + tecnologia + ')' : '') +
        '. Suporte ao acionamento prestado pela CONTRATADA.'
    };
  }

  function secaoGarantias(n, s, g, emp, sub, linhaArm) {
    const out = [];
    let k = 0;
    const subt = function (titulo) { return n + '.' + (++k) + '. ' + titulo; };
    const intro = function (texto) { return t(sub(texto), { before: 100, after: 60, keepNext: true }); };
    out.push(faixa([n + '. ' + s.titulo, subt('OBJETO DA GARANTIA')]));
    out.push(espaco(80));
    out.push(p(ricos(sub(g.objeto)), { before: 120, after: 160 }));

    out.push(faixa(subt('PRAZOS E COBERTURA DE GARANTIA')));
    out.push(espaco(80));
    out.push(t(sub(g.prazosIntro), { before: 120, after: 80, keepNext: true }));
    const tabela = (g.tabela || []).slice();
    // armazenamento: linha das baterias logo após a dos inversores (se o modelo ainda não tiver uma)
    if (linhaArm && !tabela.some(function (l) { return /bateria|armazenamento|bess/i.test(l.item || ''); })) {
      const iInv = tabela.findIndex(function (l) { return /inversor/i.test(l.item || ''); });
      tabela.splice(iInv >= 0 ? iInv + 1 : tabela.length, 0, linhaArm);
    }
    out.push(tabelaLista([
      { t: 'ITEM', w: 2800, b: true }, { t: 'PRAZO', w: 1400, jc: 'center' }, { t: 'COBERTURA', w: 5160 }
    ], tabela.map(function (l) { return [sub(l.item), sub(l.prazo), sub(l.cobertura)]; }), { primeiraClara: true }));
    out.push(espaco(120));
    if (g.suporte) out.push(t(sub(g.suporte), { before: 80, after: 160 }));

    out.push(faixa(subt('CONDIÇÕES DE COBERTURA')));
    out.push(espaco(80));
    out.push(intro(g.coberturaIntro));
    (g.cobertura || []).forEach(function (x, i) { out.push(itemLetra(i, sub(x))); });
    out.push(espaco(120));

    out.push(faixa(subt('EXCLUSÕES DE GARANTIA')));
    out.push(espaco(80));
    out.push(intro(g.exclusoesIntro));
    (g.exclusoes || []).forEach(function (x, i) { out.push(itemLetra(i, sub(x))); });
    out.push(espaco(120));

    out.push(faixa(subt('PROCEDIMENTO PARA ACIONAMENTO DA GARANTIA')));
    out.push(espaco(80));
    out.push(intro(g.procedimentoIntro));
    (g.procedimento || []).forEach(function (x) { out.push(itemPonto(sub(x))); });
    out.push(espaco(80));
    if (g.atendimento) out.push(t(sub(g.atendimento), { before: 80, after: 100 }));
    const canais = [emp.email ? 'E-mail: ' + emp.email : '', emp.telefone ? 'WhatsApp: ' + emp.telefone : ''].filter(Boolean).join('  |  ');
    if (canais) {
      out.push(N.TBL([LARG], [N.TR([N.TC([
        t('Canais de Atendimento Oficiais', { after: 60, jc: 'center' }, { b: true, color: AZUL, sz: 24 }),
        t(canais, { jc: 'center' }, { color: AZUL }),
        emp.horarioAtendimento ? t('Horário de atendimento: ' + emp.horarioAtendimento, { jc: 'center' }, { color: CINZA, sz: 20 }) : null
      ].filter(Boolean), { w: LARG, fill: ZEBRA, borda: { cor: BORDA, sz: 6 }, mar: { t: 120, l: 240, b: 120, r: 240 } })])]));
    }
    out.push(espaco(200));

    out.push(faixa(subt('OBRIGAÇÕES DO CONTRATANTE')));
    out.push(espaco(80));
    out.push(intro(g.obrigacoesIntro));
    (g.obrigacoes || []).forEach(function (x, i) { out.push(itemLetra(i, sub(x))); });
    out.push(espaco(120));

    out.push(faixa(subt('LIMITAÇÃO DE RESPONSABILIDADE')));
    out.push(espaco(80));
    (g.limitacao || []).forEach(function (x, i, arr) {
      out.push(p(ricos(sub(x)), { before: i === 0 ? 100 : 60, after: i === arr.length - 1 ? 160 : 60 }));
    });

    out.push(faixa(subt('DISPOSIÇÕES GERAIS')));
    out.push(espaco(80));
    (g.disposicoes || []).forEach(function (x, i) { out.push(itemLetra(i, sub(x), 60)); });
    out.push(espaco(200));
    return out;
  }

  function blocoPagamento(ct, emp, valor) {
    const out = [];
    const mar = { t: 80, l: 150, b: 80, r: 150 };
    const cols = [1200, 2460, 3000, 2700];
    const rows = [N.TR(['PARCELA', 'VALOR', 'DESCRIÇÃO', 'FORMA / PRAZO'].map(function (tx, i) { return celCab(tx, cols[i]); }), true)];
    (ct.parcelas || []).forEach(function (pc, i) {
      const fill = i % 2 === 0 ? ZEBRA : null;
      const o = function (w) { return { w: w, fill: fill, borda: BORDA_TAB, mar: mar }; };
      rows.push(N.TR([
        N.TC(t(U.ordinal(i + 1), { jc: 'center' }, { b: true, color: AZUL, sz: 24 }), o(cols[0])),
        N.TC(t(U.brl(U.numOr(pc.valor, 0)), { jc: 'center' }, { b: true, color: AZUL }), o(cols[1])),
        N.TC(t(pc.descricao || ''), o(cols[2])),
        N.TC(t(pc.forma || ''), o(cols[3]))
      ]));
    });
    const marT = { t: 100, l: 150, b: 100, r: 150 };
    rows.push(N.TR([
      N.TC(t('TOTAL', { jc: 'center' }, { b: true, color: BRANCO, sz: 24 }), { w: cols[0] + cols[1], span: 2, fill: AZUL, borda: BORDA_TAB, mar: marT }),
      N.TC(t(U.brl(valor), { jc: 'center' }, { b: true, color: BRANCO, sz: 26 }), { w: cols[2] + cols[3], span: 2, fill: AZUL, borda: BORDA_TAB, mar: marT })
    ]));
    out.push(N.TBL(cols, rows));

    const bc = emp.banco || {};
    const linhasBanco = [
      ['Banco', bc.banco], ['Agência', bc.agencia], ['Conta Corrente', bc.conta], ['Titular', bc.titular],
      [documentoLabel(bc.documento), bc.documento], ['Chave PIX', bc.pix]
    ].filter(function (l) { return l[1]; });
    if (linhasBanco.length) {
      const nums = (ct.parcelas || []).map(function (pc, i) { return pc.banco ? U.ordinal(i + 1) : null; }).filter(Boolean);
      const ref = nums.length === 0 ? '' : ' (' + (nums.length === 1 ? 'Parcela ' + nums[0] : 'Parcelas ' + nums.slice(0, -1).join(', ') + ' e ' + nums[nums.length - 1]) + ')';
      out.push(espaco(140));
      out.push(t('Dados Bancários para Pagamento' + ref + ':', { before: 120, after: 60, keepNext: true }, { b: true, color: AZUL }));
      out.push(tabelaSpec(linhasBanco, [2500, 6860], ['CAMPO', 'DADOS']));
    }
    return out;
  }

  /* ------------------------------------------------------------ geração */

  function nomeArquivo(ct, cli) {
    const nome = cli ? (cli.nomeFantasia || cli.nome) : '';
    return 'Contrato_' + (U.slug(nome) || 'Cliente') + '_' + String(ct.data || U.todayISO()).replace(/-/g, '');
  }

  function clienteDe(ct, ctx) {
    const atual = ct.clienteId ? (ctx.clientes || []).find(function (c) { return c.id === ct.clienteId; }) : null;
    return snapshotCliente(atual) || ct.clienteSnapshot || {};
  }

  async function preparar(ct, ctx) {
    ctx = ctx || App.Calc.contexto();
    const cli = clienteDe(ct, ctx);
    const logo = await App.Documento.prepararLogo(ctx.empresa.logo);
    const prod = ct.producao || {};
    const grafico = prod.incluir ? App.Chart.producaoDataURL(App.Chart.dadosProducao({
      kwp: ct.kwp, meses: (prod.meses || []).map(function (v) { return U.numOr(v, 0); }), consumo: U.num(prod.consumo), subtitulo: prod.subtitulo, pr: prod.pr
    })) : null;
    const modelo = montar(ct, ctx, logo, cli);
    return { ctx: ctx, cliente: cli, logo: logo, grafico: grafico, modelo: modelo, nomeBase: nomeArquivo(ct, cli) };
  }

  function meta(ct, d) {
    return {
      titulo: 'Contrato ' + ct.numero + ' — ' + (d.cliente.nome || 'Cliente'),
      assunto: 'Contrato de prestação de serviços',
      autor: d.ctx.empresa.razaoSocial || d.ctx.empresa.razao
    };
  }

  async function gerarDocx(ct, ctx) {
    const d = await preparar(ct, ctx);
    const blob = await App.Docx.pacote(d.modelo, { logo: d.logo, grafico: d.grafico }, meta(ct, d));
    return { blob: blob, nome: d.nomeBase + '.docx' };
  }

  async function gerarPdf(ct, ctx, opcoes) {
    const d = await preparar(ct, ctx);
    const out = await App.Pdf.pacote(d.modelo, { logo: d.logo, grafico: d.grafico }, meta(ct, d), opcoes);
    return { blob: out.blob, nome: d.nomeBase + '.pdf', fonteOk: out.fonteOk };
  }

  App.Contrato = {
    STATUS: STATUS, novo: novo, deProposta: deProposta, parcelasPadrao: parcelasPadrao, total: total,
    snapshotCliente: snapshotCliente, montar: montar, preparar: preparar, gerarDocx: gerarDocx, gerarPdf: gerarPdf
  };
})(window.App);
