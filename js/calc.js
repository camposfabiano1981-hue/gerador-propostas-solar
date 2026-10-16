/*
 * Motor de cálculo: dimensionamento On-Grid e Híbrido, lista de materiais,
 * análise financeira de 25 anos (Lei 14.300/2022 — Fio B) e condições de pagamento.
 * Funções puras: recebem a proposta e o contexto (cadastros/premissas) e devolvem o resultado.
 */
window.App = window.App || {};

(function (App) {
  'use strict';

  const U = App.U;
  const D = App.DEFAULTS;
  const C = {};

  C.LIG_LABEL = { mono: 'Monofásica', bi: 'Bifásica', tri: 'Trifásica' };
  C.LIG_ADJ = { mono: 'monofásica', bi: 'bifásica', tri: 'trifásica' };

  /** Monta o contexto a partir do armazenamento local. */
  C.contexto = function () {
    const S = App.Store;
    const cfg = S.config();
    return {
      empresa: cfg.empresa,
      premissas: cfg.premissas,
      textos: cfg.textos,
      equipamentos: S.list('equipamentos'),
      concessionarias: S.list('concessionarias'),
      localidades: S.list('localidades'),
      pagamentos: S.list('pagamentos'),
      clientes: S.list('clientes')
    };
  };

  function porId(lista, id) {
    return (lista || []).find(function (x) { return x.id === id; }) || null;
  }

  function pos(v) {
    const n = U.num(v);
    return isFinite(n) && n > 0 ? n : null;
  }

  C.pctFioB = function (ano, prem) {
    const tab = (prem.fioB || []).slice().sort(function (a, b) { return a.ano - b.ano; });
    if (!tab.length) return prem.fioBDepois == null ? 1 : prem.fioBDepois;
    if (ano < tab[0].ano) return 0;
    const exato = tab.find(function (x) { return x.ano === ano; });
    if (exato) return exato.pct;
    if (ano > tab[tab.length - 1].ano) return prem.fioBDepois == null ? 1 : prem.fioBDepois;
    let ult = 0;
    tab.forEach(function (x) { if (x.ano <= ano) ult = x.pct; });
    return ult;
  };

  /** Texto do cronograma do Fio B a partir do ano-base: "2026=60%, 2027=75%, 2028=90%, 2029+=100%". */
  C.fioBTexto = function (anoBase, prem, sep) {
    const partes = [];
    const ultimoTab = Math.max.apply(null, (prem.fioB || []).map(function (x) { return x.ano; }).concat([anoBase - 1]));
    for (let a = anoBase; a <= Math.max(anoBase, ultimoTab + 1); a++) {
      const p = C.pctFioB(a, prem);
      if (a > ultimoTab) { partes.push(a + '+=' + U.fmtSmart(p * 100, 1) + '%'); break; }
      partes.push(a + '=' + U.fmtSmart(p * 100, 1) + '%');
    }
    return partes.join(sep || ', ');
  };

  C.pmt = function (pv, i, n) {
    if (!n) return pv;
    if (!i) return pv / n;
    const f = Math.pow(1 + i, n);
    return pv * (i * f) / (f - 1);
  };

  C.taxaTxt = function (t) {
    return U.fmtSmart(t * 100, 2) + '%';
  };

  C.pagamentos = function (total, lista) {
    return (lista || []).filter(function (p) { return p.ativo !== false; }).map(function (pg) {
      const n = Math.max(1, parseInt(pg.parcelas, 10) || 1);
      const taxa = U.numOr(pg.taxa, 0);
      const obs = pg.obs ? ' (' + pg.obs + ')' : '';
      let parcela, totalPago, label;
      if (pg.tipo === 'avista') {
        totalPago = total * (1 - taxa);
        parcela = totalPago;
        label = (pg.nome || 'À vista') + (taxa > 0 ? ' — desconto de ' + C.taxaTxt(taxa) : '') + obs;
        return { id: pg.id, label: label, prazo: '1x', parcela: parcela, total: totalPago };
      }
      if (pg.tipo === 'acrescimo') {
        totalPago = total * (1 + taxa);
        parcela = totalPago / n;
        label = (pg.nome || 'Cartão') + ' ' + n + 'x — ' + (taxa > 0 ? 'acréscimo de ' + C.taxaTxt(taxa) : 'sem acréscimo') + obs;
      } else {
        parcela = C.pmt(total, taxa, n);
        totalPago = parcela * n;
        label = (pg.nome || 'Financiamento') + ' ' + n + 'x — ' + C.taxaTxt(taxa) + ' a.m.' + obs;
      }
      return { id: pg.id, label: label, prazo: n + 'x', parcela: parcela, total: totalPago };
    });
  };

  /* ---------------------------------------------------------------- equipamentos */

  C.descModulo = function (m) {
    if (!m) return '';
    if (m.descricaoProposta) return m.descricaoProposta;
    const p = ['Módulo ' + [m.tecnologia, m.fabricante, m.potencia ? m.potencia + 'W' : ''].filter(Boolean).join(' ')];
    if (pos(m.eficiencia)) p.push('Ef. ' + U.fmtSmart(m.eficiencia, 2) + '%');
    if (m.detalhe) p.push(m.detalhe);
    if (m.modelo) p.push(m.modelo);
    return p.join(' — ');
  };

  C.garantiaModulo = function (m) {
    if (!m) return '';
    const a = [];
    if (pos(m.garantiaProduto)) a.push(m.garantiaProduto + ' anos produto');
    if (pos(m.garantiaPerformance)) a.push(m.garantiaPerformance + ' anos performance');
    return a.join(' / ') || 'Conf. fabricante';
  };

  C.specInversor = function (i) {
    if (!i) return '';
    let s = U.fmtSmart(i.potencia, 2) + ' kW ' + [i.fases, i.tensao].filter(Boolean).join(' ');
    if (pos(i.mppts)) s += ' / ' + i.mppts + ' MPPT';
    if (i.tipo === 'hibrido' && pos(i.tensaoBateria)) s += ' / Bateria ' + U.fmtSmart(i.tensaoBateria, 1) + 'V';
    return s.trim();
  };

  C.descInversor = function (i) {
    if (!i) return '';
    if (i.descricaoProposta) return i.descricaoProposta;
    return (i.tipo === 'hibrido' ? 'Inversor Híbrido ' : 'Inversor ') + [i.fabricante, i.modelo].filter(Boolean).join(' ') + ' — ' + C.specInversor(i);
  };

  C.descBateria = function (b) {
    if (!b) return '';
    if (b.descricaoProposta) return b.descricaoProposta;
    const s = ['Bateria ' + [b.quimica, b.fabricante, b.modelo].filter(Boolean).join(' ')];
    const spec = [];
    if (pos(b.energia)) spec.push(U.fmtSmart(b.energia, 2) + ' kWh');
    if (pos(b.tensao)) spec.push(U.fmtSmart(b.tensao, 1) + ' V');
    if (pos(b.capacidadeAh)) spec.push(U.fmtSmart(b.capacidadeAh, 0) + ' Ah');
    if (spec.length) s.push(spec.join(' / '));
    if (pos(b.ciclos)) s.push(U.fmt(b.ciclos, 0) + ' ciclos');
    return s.join(' — ');
  };

  C.descEquip = function (e) {
    if (!e) return '';
    if (e.tipo === 'modulo') return C.descModulo(e);
    if (e.tipo === 'inversor' || e.tipo === 'hibrido') return C.descInversor(e);
    if (e.tipo === 'bateria') return C.descBateria(e);
    return e.descricaoProposta || e.descricao || [e.fabricante, e.modelo].filter(Boolean).join(' ');
  };

  C.garantiaEquip = function (e) {
    if (!e) return '';
    if (e.tipo === 'modulo') return C.garantiaModulo(e);
    if (e.tipo === 'inversor' || e.tipo === 'hibrido' || e.tipo === 'bateria') return pos(e.garantia) ? e.garantia + ' anos' : 'Conf. fabricante';
    return e.garantia || 'Conf. fabricante';
  };

  C.nomeEquip = function (e) {
    if (!e) return '';
    if (e.tipo === 'modulo') return [e.fabricante, e.modelo, e.potencia ? e.potencia + ' Wp' : ''].filter(Boolean).join(' ');
    if (e.tipo === 'inversor' || e.tipo === 'hibrido') return [e.fabricante, e.modelo, e.potencia ? U.fmtSmart(e.potencia, 2) + ' kW' : ''].filter(Boolean).join(' ');
    if (e.tipo === 'bateria') return [e.fabricante, e.modelo, e.energia ? U.fmtSmart(e.energia, 2) + ' kWh' : ''].filter(Boolean).join(' ');
    return e.descricao || [e.fabricante, e.modelo].filter(Boolean).join(' ');
  };

  function fasesCompat(inv, ligacao) {
    const tri = /tri/i.test(inv.fases || '');
    if (ligacao === 'tri') return { ok: true, pen: tri ? 0 : 0.3 };
    return { ok: !tri, pen: 0 };
  }

  /** Escolhe inversor e quantidade com FDI (P_inversor / P_FV) mais próximo do alvo. */
  C.sugerirInversor = function (kwp, ligacao, candidatos, prem, potCargasW) {
    let melhor = null;
    if (!(kwp > 0)) return null;
    (candidatos || []).forEach(function (inv) {
      const pot = pos(inv.potencia);
      if (!pot) return;
      const fc = fasesCompat(inv, ligacao);
      if (!fc.ok) return;
      for (let n = 1; n <= 4; n++) {
        const fdi = (n * pot) / kwp;
        let score = Math.abs(fdi - prem.fdiAlvo) + fc.pen + (n - 1) * 0.08;
        if (fdi < prem.fdiMin || fdi > prem.fdiMax) score += 10;
        if (potCargasW > 0) {
          const bk = (pos(inv.potenciaBackup) || pot) * n * 1000;
          if (bk < potCargasW * prem.hibrido.fatorSegurancaInversor) score += 5;
        }
        if (!melhor || score < melhor.score) melhor = { inv: inv, n: n, fdi: fdi, score: score };
      }
    });
    return melhor;
  };

  function qtdRegra(regra, fator, q) {
    const f = U.numOr(fator, 1);
    switch (regra) {
      case 'porModulo': return Math.ceil(q.nMod * f - 1e-9);
      case 'porInversor': return Math.ceil(q.nInv * f - 1e-9);
      case 'porMppt': return Math.ceil(q.mppts * f - 1e-9);
      case 'porBateria': return Math.ceil(q.nBat * f - 1e-9);
      case 'fixa':
      default: return f;
    }
  }

  /** Combinação de kits de estrutura (ex.: kits p/ 4 e p/ 2 módulos) cobrindo N módulos. */
  C.combinarKits = function (kits, nMod) {
    const ord = kits.slice().filter(function (k) { return pos(k.fator); }).sort(function (a, b) { return b.fator - a.fator; });
    const res = [];
    let resto = nMod;
    ord.forEach(function (k, i) {
      if (resto <= 0) return;
      const q = i === ord.length - 1 ? Math.ceil(resto / k.fator) : Math.floor(resto / k.fator);
      if (q > 0) { res.push({ eq: k, qtd: q }); resto -= q * k.fator; }
    });
    return res;
  };

  /** Gera a lista de materiais a partir do dimensionamento. */
  C.gerarItens = function (p, r, ctx) {
    const itens = [];
    const add = function (eq, categoria, qtd, unidade) {
      if (!(qtd > 0)) return;
      itens.push({
        id: U.uid(), equipamentoId: eq.id, categoria: categoria, descricao: C.descEquip(eq),
        qtd: qtd, unidade: unidade || eq.unidade || 'un', precoUnit: U.numOr(eq.preco, 0), garantia: C.garantiaEquip(eq)
      });
    };
    if (r.modulo) add(r.modulo, 'modulo', r.nModulos, 'un');
    if (r.inversor) add(r.inversor, 'inversor', r.nInversores, 'un');
    if (r.hibrido && r.hibrido.bateria) add(r.hibrido.bateria, 'bateria', r.hibrido.nBaterias, 'un');

    const q = {
      nMod: r.nModulos, nInv: r.nInversores,
      mppts: (pos(r.inversor && r.inversor.mppts) || 1) * r.nInversores,
      nBat: r.hibrido ? r.hibrido.nBaterias : 0
    };
    const ativos = (ctx.equipamentos || []).filter(function (e) { return e.ativo !== false && e.autoIncluir; });

    const estruturas = ativos.filter(function (e) {
      return e.tipo === 'estrutura' && (!e.telhado || e.telhado === 'Todos' || e.telhado === p.telhado);
    });
    C.combinarKits(estruturas.filter(function (e) { return e.regra === 'kitModulos'; }), r.nModulos)
      .forEach(function (k) { add(k.eq, 'estrutura', k.qtd); });
    estruturas.filter(function (e) { return e.regra !== 'kitModulos'; })
      .forEach(function (e) { add(e, 'estrutura', qtdRegra(e.regra, e.fator, q)); });

    ativos.filter(function (e) {
      return e.tipo === 'material' && (!e.aplicaEm || e.aplicaEm === 'ambos' || e.aplicaEm === p.tipoSistema);
    }).forEach(function (e) { add(e, 'material', qtdRegra(e.regra, e.fator, q)); });

    return itens;
  };

  C.textoEstrutura = function (itens, ctx) {
    const est = (itens || []).filter(function (i) { return i.categoria === 'estrutura'; });
    if (!est.length) return '';
    const fabs = [];
    const partes = est.map(function (i) {
      const eq = porId(ctx.equipamentos, i.equipamentoId);
      if (eq && eq.fabricante && fabs.indexOf(eq.fabricante) < 0) fabs.push(eq.fabricante);
      const nome = (eq && eq.resumo) || i.descricao;
      return eq && eq.regra === 'kitModulos' ? U.fmtSmart(i.qtd, 2) + '× ' + nome : U.fmtSmart(i.qtd, 2) + ' ' + nome;
    });
    return (fabs.length ? fabs.join(' / ') + ' — ' : '') + partes.join(' + ');
  };

  C.qtdTxt = function (item) {
    const u = (item.unidade || 'un').trim();
    const q = U.fmtSmart(item.qtd, 2);
    if (!u || u === 'un' || u === 'unid') return q;
    if (u === 'm') return q + 'm';
    return q + ' ' + u;
  };

  /* ---------------------------------------------------------------- financeiro */

  C.financeiro = function (o) {
    const prem = o.prem;
    const H = Math.max(1, parseInt(prem.horizonte, 10) || 25);
    const i = prem.tma;
    const anos = [];
    let acum = -o.investimento;
    let somaLiq = 0, somaGer = 0;
    const Cm = o.consumoMedio;
    const consSem = Math.max(Cm, o.disp);
    for (let n = 1; n <= H; n++) {
      const ano = o.anoBase + n - 1;
      const fT = Math.pow(1 + prem.inflacaoTarifa, n - 1);
      const tarifa = o.tarifa * fT;
      const cosip = o.cosip * Math.pow(1 + prem.reajusteCosip, n - 1);
      const tusd = o.tusd * (prem.reajustarTusd ? fT : 1);
      const ger = o.geracaoAnual1 * Math.pow(1 - prem.degradacao, n - 1);
      const gm = ger / 12;
      const injetada = ger * (1 - o.simultaneidade);
      const armazenada = Math.min((o.armazenamentoDiario || 0) * 365, injetada);
      const injEf = injetada - armazenada;
      const pct = C.pctFioB(ano, prem);
      const fioB = injEf * tusd * pct;
      const faturada = Math.max(Cm - gm, o.disp);
      const contaSem = consSem * tarifa + cosip;
      const contaMin = faturada * tarifa;
      const contaCom = contaMin + cosip + fioB / 12;
      const bruta = (consSem - faturada) * tarifa * 12;
      let extra = 0;
      if (o.trocaBateria && o.trocaBateria.ano === n) extra = o.trocaBateria.custo;
      const liq = bruta - fioB - extra;
      acum += liq;
      somaLiq += liq;
      somaGer += ger;
      anos.push({
        n: n, ano: ano, geracao: ger, tarifa: tarifa, cosip: cosip, pctFioB: pct, injetada: injEf, armazenada: armazenada,
        fioB: fioB, fioBMes: fioB / 12, faturada: faturada, contaSem: contaSem, contaMin: contaMin, contaCom: contaCom,
        economiaMes: contaSem - contaCom, bruta: bruta, extra: extra, liq: liq, acumulado: acum,
        descontado: liq / Math.pow(1 + i, n)
      });
    }

    function payback(fluxos) {
      let acc = 0;
      for (let k = 0; k < fluxos.length; k++) {
        const e = fluxos[k];
        if (e > 0 && acc + e >= o.investimento) return k + (o.investimento - acc) / e;
        acc += e;
      }
      return null;
    }

    const liqs = anos.map(function (a) { return a.liq; });
    const descs = anos.map(function (a) { return a.descontado; });
    const vpl = -o.investimento + descs.reduce(function (s, x) { return s + x; }, 0);

    function npv(r) {
      let s = -o.investimento;
      for (let k = 0; k < liqs.length; k++) s += liqs[k] / Math.pow(1 + r, k + 1);
      return s;
    }
    let tir = null;
    if (o.investimento > 0) {
      let lo = -0.99, hi = 10;
      if (npv(hi) > 0) tir = null;
      else if (npv(lo) < 0) tir = null;
      else {
        for (let k = 0; k < 200; k++) {
          const mid = (lo + hi) / 2;
          if (npv(mid) > 0) lo = mid; else hi = mid;
        }
        tir = (lo + hi) / 2;
      }
    }

    return {
      anos: anos,
      horizonte: H,
      economiaMes1: anos[0].economiaMes,
      economiaAno1: anos[0].bruta - anos[0].fioB,
      paybackSimples: o.investimento > 0 ? payback(liqs) : 0,
      paybackDescontado: o.investimento > 0 ? payback(descs) : 0,
      vpl: vpl,
      tir: tir,
      tirAcima: o.investimento > 0 && tir == null && npv(10) > 0,
      co2t: (somaGer / H) * prem.fatorCO2 * H / 1000,
      economiaTotal: somaLiq,
      projecao: anos.filter(function (a) { return a.n <= 6 || a.n % 5 === 0; })
    };
  };

  /* ---------------------------------------------------------------- cálculo completo */

  C.calcular = function (p, ctx) {
    const prem = U.clone(p.premissas || ctx.premissas || D.premissas);
    prem.hibrido = Object.assign({}, D.premissas.hibrido, prem.hibrido || {});
    const eqs = ctx.equipamentos || [];
    const alertas = [];
    const alerta = function (nivel, msg) { alertas.push({ nivel: nivel, msg: msg }); };
    const r = { premissas: prem, alertas: alertas, hibridoAtivo: p.tipoSistema === 'hibrido' };

    // Local, concessionária e tarifas
    const loc = porId(ctx.localidades, p.localidadeId);
    const conc = porId(ctx.concessionarias, p.concessionariaId) || (loc && porId(ctx.concessionarias, loc.concessionariaId));
    const classe = D.CLASSES.find(function (c) { return c.id === p.classe; }) || D.CLASSES[0];
    r.localidade = loc;
    r.concessionaria = conc;
    r.classe = classe.id;
    r.tarifa = pos(p.tarifa) || (conc && conc.tarifas && pos(conc.tarifas[classe.tarifa])) || 0;
    r.tarifaInformada = !!pos(p.tarifa);
    r.tusdFioB = pos(p.tusdFioB) || (conc && pos(conc.tusdFioB)) || 0;
    const cosipP = U.num(p.cosip);
    r.cosip = isFinite(cosipP) && String(p.cosip).trim() !== '' ? cosipP : (loc && isFinite(U.num(loc.cosip)) ? U.num(loc.cosip) : 0);
    r.hsp = pos(p.hsp) || (loc && pos(loc.hsp)) || 0;
    r.fatores = (loc && Array.isArray(loc.fatores) && loc.fatores.length === 12) ? loc.fatores.map(function (f) { return U.numOr(f, 1); }) : Array(12).fill(1);
    r.cidade = p.cidade || (loc ? loc.cidade : '');
    r.uf = p.uf || (loc ? loc.uf : '');
    if (!loc) alerta('erro', 'Selecione a localidade (cidade) para obter a irradiação (HSP).');
    if (!(r.tarifa > 0)) alerta('erro', 'Informe a tarifa de energia (R$/kWh) ou cadastre-a na concessionária.');

    // Consumo
    const cm = Array.isArray(p.consumoMensal) ? p.consumoMensal.map(function (v) { return U.num(v); }) : [];
    if (p.consumoModo === 'mensal' && cm.filter(isFinite).length === 12) {
      r.consumoMeses = cm;
      r.consumoMedio = cm.reduce(function (s, x) { return s + x; }, 0) / 12;
    } else {
      r.consumoMedio = U.numOr(p.consumoMedio, 0);
      r.consumoMeses = Array(12).fill(r.consumoMedio);
    }
    if (!(r.consumoMedio > 0)) alerta('erro', 'Informe o consumo médio mensal (kWh).');
    r.ligacao = p.ligacao || 'bi';
    r.disponibilidade = U.numOr(prem.disponibilidade && prem.disponibilidade[r.ligacao], 0);
    r.simultaneidade = U.numOr(p.simultaneidade, prem.simultaneidade);

    // Híbrido: cargas críticas e baterias (independe do número de módulos)
    let armazenamentoDiario = 0, perdaMensalBateria = 0;
    if (r.hibridoAtivo) {
      const h = { cargas: (p.cargas || []).map(function (c) {
        const qtd = U.numOr(c.qtd, 0), pot = U.numOr(c.potencia, 0), horas = U.numOr(c.horas, 0);
        return { descricao: c.descricao || '', qtd: qtd, potencia: pot, horas: horas, potTotal: qtd * pot, energia: qtd * pot * horas };
      }) };
      h.potCargas = h.cargas.reduce(function (s, c) { return s + c.potTotal; }, 0);
      h.energiaBackup = h.cargas.reduce(function (s, c) { return s + c.energia; }, 0);
      h.autonomiaHoras = U.numOr(p.autonomiaHoras, prem.hibrido.autonomiaHoras);
      h.bateria = porId(eqs, p.bateriaId) || eqs.find(function (e) { return e.tipo === 'bateria' && e.ativo !== false; }) || null;
      h.dod = pos(p.dod) ? U.num(p.dod) / 100 : (h.bateria && pos(h.bateria.dod) ? h.bateria.dod / 100 : prem.hibrido.dod);
      h.eficiencia = prem.hibrido.eficiencia;
      h.capNecessaria = h.energiaBackup / 1000 / (h.dod * h.eficiencia);
      h.usoBateria = p.usoBateria || 'backup';
      r.hibrido = h;
      if (!h.bateria) alerta('erro', 'Cadastre/selecione uma bateria para o sistema híbrido.');
      if (!h.cargas.length) alerta('aviso', 'Informe as cargas críticas que devem funcionar durante a falta de energia.');
    }

    // Módulos e potência
    const modulo = porId(eqs, p.moduloId);
    r.modulo = modulo;
    if (!modulo) alerta('erro', 'Selecione o módulo fotovoltaico.');
    const wp = modulo ? U.numOr(modulo.potencia, 0) : 0;

    // Pré-cálculo das baterias para estimar perdas da ciclagem diária
    const montarBanco = function (inv) {
      const h = r.hibrido;
      if (!h || !h.bateria) return;
      const vb = pos(h.bateria.tensao);
      const vi = inv && pos(inv.tensaoBateria);
      h.serie = vb && vi ? Math.max(1, Math.round(vi / vb)) : 1;
      const eUnit = pos(h.bateria.energia) || 0;
      h.nSugerido = eUnit ? Math.max(h.serie, Math.ceil(h.capNecessaria / eUnit / h.serie - 1e-9) * h.serie) : 0;
      h.nBaterias = pos(p.nBaterias) ? Math.round(U.num(p.nBaterias)) : h.nSugerido;
      h.paralelo = Math.max(1, Math.floor(h.nBaterias / h.serie));
      h.capInstalada = h.nBaterias * eUnit;
      h.capUtil = h.capInstalada * h.dod;
      h.autonomiaEstimada = h.energiaBackup > 0 ? (h.capUtil * h.eficiencia) / (h.energiaBackup / 1000) * h.autonomiaHoras : null;
      h.tensaoBanco = (vb || 0) * h.serie;
      h.configuracao = h.serie > 1
        ? h.serie + ' em série × ' + h.paralelo + ' em paralelo (' + U.fmtSmart(h.tensaoBanco, 1) + ' V)'
        : (h.nBaterias > 1 ? h.nBaterias + ' em paralelo' : '1 unidade') + (vb ? ' (' + U.fmtSmart(vb, 1) + ' V)' : '');
      armazenamentoDiario = h.usoBateria === 'ciclagem' ? h.capUtil * h.eficiencia : 0;
      perdaMensalBateria = h.usoBateria === 'ciclagem' ? h.capUtil * (1 - h.eficiencia) * 30 : 0;
    };
    const invPreSel = porId(eqs, p.inversorId);
    montarBanco(invPreSel);

    r.consumoDimensionamento = r.consumoMedio + perdaMensalBateria;
    r.kwpNecessario = r.hsp > 0 ? r.consumoDimensionamento / (r.hsp * 30 * prem.pr) : 0;
    r.nModulosSugerido = wp > 0 ? Math.ceil((r.kwpNecessario * 1000) / wp - 1e-9) : 0;
    r.nModulos = pos(p.nModulos) ? Math.round(U.num(p.nModulos)) : r.nModulosSugerido;
    r.kwp = (r.nModulos * wp) / 1000;
    r.geracaoMensal = r.kwp * r.hsp * 30 * prem.pr;
    r.geracaoAnual = r.kwp * r.hsp * 365 * prem.pr;
    r.geracaoMeses = r.fatores.map(function (f) { return r.geracaoMensal * f; });
    r.cobertura = r.consumoMedio > 0 ? r.geracaoMensal / r.consumoMedio : 0;
    r.areaModulo = (modulo && pos(modulo.area)) || prem.areaModulo;
    r.area = r.nModulos * r.areaModulo;

    // Inversor
    const tipoInv = r.hibridoAtivo ? 'hibrido' : 'inversor';
    const candidatos = eqs.filter(function (e) { return e.tipo === tipoInv && e.ativo !== false; });
    const sug = C.sugerirInversor(r.kwp, r.ligacao, candidatos, prem, r.hibrido ? r.hibrido.potCargas : 0);
    r.inversorSugerido = sug;
    const inv = invPreSel || (sug && sug.inv) || null;
    r.inversor = inv;
    if (!inv && (r.kwp > 0 || !candidatos.length)) alerta('erro', r.hibridoAtivo ? 'Cadastre/selecione um inversor híbrido compatível.' : 'Cadastre/selecione um inversor compatível com a ligação.');
    const potInv = inv ? U.numOr(inv.potencia, 0) : 0;
    let nInv;
    if (!inv) nInv = 0;
    else if (pos(p.nInversores)) nInv = Math.round(U.num(p.nInversores));
    else if (!invPreSel && sug) nInv = sug.n;
    else nInv = potInv > 0 && r.kwp > 0 ? Math.max(1, Math.round((r.kwp * prem.fdiAlvo) / potInv)) : 1;
    r.nInversores = nInv;
    r.potInversores = potInv * nInv;
    r.fdi = r.kwp > 0 ? r.potInversores / r.kwp : 0;
    r.fdiOk = r.fdi >= prem.fdiMin && r.fdi <= prem.fdiMax;
    if (inv && r.kwp > 0 && !r.fdiOk) {
      alerta('aviso', 'FDI ' + U.fmt(r.fdi, 3) + ' fora da faixa recomendada (' + U.fmt(prem.fdiMin, 2) + '–' + U.fmt(prem.fdiMax, 2) + '). ' +
        (r.fdi < prem.fdiMin ? 'Inversor subdimensionado: haverá corte de potência (clipping) nos horários de pico.' : 'Inversor superdimensionado em relação ao gerador FV.'));
    }
    if (inv && r.ligacao !== 'tri' && /tri/i.test(inv.fases || '')) alerta('erro', 'Inversor trifásico incompatível com ligação ' + C.LIG_ADJ[r.ligacao] + '.');

    if (r.hibrido) {
      montarBanco(inv);
      const h = r.hibrido;
      h.potBackup = inv ? (pos(inv.potenciaBackup) || potInv) * nInv : 0;
      h.backupOk = h.potBackup * 1000 >= h.potCargas * prem.hibrido.fatorSegurancaInversor;
      if (inv && h.potCargas > 0 && !h.backupOk) {
        alerta('aviso', 'Potência de backup do inversor (' + U.fmtSmart(h.potBackup, 2) + ' kW) abaixo de ' +
          U.fmtSmart(prem.hibrido.fatorSegurancaInversor, 2) + ' × potência das cargas críticas (' + U.fmtSmart(h.potCargas / 1000, 2) + ' kW).');
      }
      if (h.autonomiaEstimada != null && h.autonomiaEstimada + 1e-9 < h.autonomiaHoras) {
        alerta('aviso', 'Banco de baterias atende ' + U.fmtSmart(h.autonomiaEstimada, 1) + ' h das ' + U.fmtSmart(h.autonomiaHoras, 1) + ' h de autonomia desejadas.');
      }
    }

    // Arranjo (strings) — validação opcional quando houver dados elétricos
    r.strings = null;
    if (modulo && inv && pos(modulo.voc) && pos(inv.vmaxCC) && r.nModulos > 0) {
      const maxSerie = Math.floor(inv.vmaxCC / (modulo.voc * prem.fatorVocFrio));
      const totMppt = (pos(inv.mppts) || 1) * nInv;
      const nStr = Math.max(1, Math.ceil(r.nModulos / Math.max(1, maxSerie)));
      const porStr = Math.ceil(r.nModulos / nStr);
      r.strings = { maxSerie: maxSerie, nStrings: nStr, porString: porStr, mppts: totMppt };
      if (maxSerie < 1) alerta('erro', 'Voc do módulo excede a tensão máxima CC do inversor.');
      if (pos(inv.mpptMin) && pos(modulo.vmp) && porStr * modulo.vmp < inv.mpptMin) {
        alerta('aviso', 'Tensão da string (' + U.fmt(porStr * modulo.vmp, 0) + ' V) abaixo da faixa MPPT mínima do inversor (' + inv.mpptMin + ' V).');
      }
    }

    const limite = U.num(prem.limiteKwp && prem.limiteKwp[r.ligacao]);
    if (isFinite(limite) && limite > 0 && r.kwp > limite) {
      alerta('aviso', 'Potência de ' + U.kwp(r.kwp) + ' kWp acima do limite de referência para ligação ' + C.LIG_ADJ[r.ligacao] +
        ' (' + U.fmtSmart(limite, 1) + ' kWp). Pode ser necessária adequação do padrão de entrada (não inclusa).');
    }
    if (r.consumoMedio > 0 && r.kwp > 0) {
      if (r.cobertura < 0.9) alerta('info', 'Geração cobre ' + U.fmt(r.cobertura * 100, 1) + '% do consumo médio.');
      if (r.cobertura > 1.3) alerta('info', 'Geração excede o consumo em ' + U.fmt((r.cobertura - 1) * 100, 1) + '% — créditos excedentes não são monetizados na análise.');
    }

    // Itens e preço
    r.itens = Array.isArray(p.itens) && p.itens.length ? p.itens : C.gerarItens(p, r, ctx);
    r.itensAutomaticos = !(Array.isArray(p.itens) && p.itens.length);
    r.kitSoma = r.itens.reduce(function (s, it) { return s + U.numOr(it.qtd, 0) * U.numOr(it.precoUnit, 0); }, 0);
    r.kit = p.kitManual ? U.numOr(p.kitValor, 0) : r.kitSoma;
    r.infra = U.numOr(p.infraValor, 0);
    if (p.precoModo === 'separado') {
      r.maoObra = U.numOr(p.maoObraValor, 0);
      r.total = r.kit + r.infra + r.maoObra;
    } else {
      r.total = U.numOr(p.valorTotal, 0);
      r.maoObra = r.total - r.kit - r.infra;
      if (r.total > 0 && r.maoObra < 0) alerta('erro', 'Valor total menor que kit + infraestrutura: mão de obra ficaria negativa.');
    }
    if (!(r.total > 0)) alerta('erro', 'Informe o valor da proposta.');
    if (!p.kitManual && r.kitSoma === 0 && r.itens.length) alerta('aviso', 'Itens do kit sem preço — cadastre os preços nos equipamentos ou informe o valor do kit manualmente.');

    // Divergência entre a lista de materiais e o dimensionamento
    if (!r.itensAutomaticos) {
      const soma = function (cat) {
        return r.itens.filter(function (i) { return i.categoria === cat; }).reduce(function (s, i) { return s + U.numOr(i.qtd, 0); }, 0);
      };
      const div = [];
      if (soma('modulo') !== r.nModulos) div.push('módulos');
      if (soma('inversor') !== r.nInversores) div.push('inversores');
      if (r.hibrido && soma('bateria') !== r.hibrido.nBaterias) div.push('baterias');
      r.itensDivergentes = div;
      if (div.length) alerta('aviso', 'A lista de materiais não confere com o dimensionamento (' + div.join(', ') + '). Use "Regerar lista" na etapa de materiais.');
    }

    // Financeiro
    const anoBase = U.anoDe(p.data);
    r.anoBase = anoBase;
    let troca = null;
    if (r.hibrido && prem.hibrido.trocaBateriaAno > 0) {
      const custoBat = r.itens.filter(function (i) { return i.categoria === 'bateria'; })
        .reduce(function (s, i) { return s + U.numOr(i.qtd, 0) * U.numOr(i.precoUnit, 0); }, 0);
      troca = { ano: Math.round(prem.hibrido.trocaBateriaAno), custo: custoBat * prem.hibrido.trocaBateriaPct };
      r.trocaBateria = troca;
    }
    r.fin = C.financeiro({
      prem: prem, anoBase: anoBase, investimento: r.total, geracaoAnual1: r.geracaoAnual, consumoMedio: r.consumoMedio,
      disp: r.disponibilidade, tarifa: r.tarifa, tusd: r.tusdFioB, cosip: r.cosip, simultaneidade: r.simultaneidade,
      armazenamentoDiario: armazenamentoDiario, trocaBateria: troca
    });
    if (r.total > 0 && r.kwp > 0) {
      if (r.fin.tir != null && r.fin.tir < prem.tma) alerta('aviso', 'TIR (' + U.fmt(r.fin.tir * 100, 2) + '% a.a.) abaixo da TMA (' + U.fmt(prem.tma * 100, 2) + '% a.a.).');
      if (r.fin.paybackSimples == null) alerta('aviso', 'O investimento não se paga dentro do horizonte de análise.');
    }

    r.pagamentos = C.pagamentos(r.total, (ctx.pagamentos || []).filter(function (pg) {
      return !Array.isArray(p.pagamentosIds) || p.pagamentosIds.indexOf(pg.id) >= 0;
    }));

    // Textos de identificação
    const invTxt = inv ? (nInv > 1 ? nInv + '× ' : '') + inv.fabricante + ' ' + U.fmtSmart(potInv, 2) + 'kW' : '';
    const modTxt = modulo ? modulo.fabricante + ' ' + wp + 'W' : '';
    r.tecnologia = p.tecnologiaTexto || [modulo ? modTxt + (modulo.tecnologia ? ' ' + modulo.tecnologia : '') : '', invTxt]
      .filter(Boolean).join(' + ') + (r.hibrido && r.hibrido.bateria ? ' + ' + U.fmtSmart(r.hibrido.capInstalada, 2) + ' kWh' : '');
    r.resumoCabecalho = U.kwp(r.kwp) + ' kWp — ' + [modTxt, invTxt].filter(Boolean).join(' + ') +
      (r.hibrido && r.hibrido.bateria ? ' + ' + U.fmtSmart(r.hibrido.capInstalada, 2) + ' kWh' : '');
    r.estruturaTexto = p.estruturaTexto || C.textoEstrutura(r.itens, ctx);
    r.monitoramento = p.monitoramento || (inv && inv.monitoramento) || 'Aplicativo do fabricante do inversor (Wi-Fi)';
    r.erros = alertas.filter(function (a) { return a.nivel === 'erro'; }).length;
    return r;
  };

  /** Nova proposta em branco com padrões. */
  C.novaProposta = function (ctx) {
    const loc = (ctx.localidades || [])[0];
    const num = App.Store.proximoNumero(U.todayISO());
    const mod = (ctx.equipamentos || []).find(function (e) { return e.tipo === 'modulo' && e.ativo !== false; });
    return {
      id: null,
      numero: num.numero,
      data: U.todayISO(),
      validadeDias: ctx.empresa.validadeDias || 5,
      status: 'rascunho',
      tipoSistema: 'ongrid',
      clienteId: null,
      localidadeId: loc ? loc.id : null,
      concessionariaId: loc ? loc.concessionariaId : null,
      classe: 'Residencial B1',
      ligacao: 'bi',
      ligacaoConfirmar: false,
      tensao: '220 V',
      telhado: 'Fibrocimento',
      telhadoDetalhe: 'parafuso estrutural',
      consumoModo: 'media',
      consumoMedio: null,
      consumoMensal: Array(12).fill(''),
      tarifa: '',
      tusdFioB: '',
      cosip: '',
      hsp: '',
      simultaneidade: ctx.premissas.simultaneidade,
      moduloId: mod ? mod.id : null,
      nModulos: '',
      inversorId: null,
      nInversores: '',
      cargas: [],
      autonomiaHoras: ctx.premissas.hibrido.autonomiaHoras,
      bateriaId: null,
      nBaterias: '',
      dod: '',
      usoBateria: 'backup',
      itens: [],
      kitManual: false,
      kitValor: '',
      infraValor: 1500,
      infraDescricao: ctx.textos.infraDescricao,
      precoModo: 'composto',
      valorTotal: '',
      maoObraValor: '',
      pagamentosIds: (ctx.pagamentos || []).filter(function (p) { return p.ativo !== false; }).map(function (p) { return p.id; }),
      premissas: U.clone(ctx.premissas),
      tecnologiaTexto: '',
      estruturaTexto: '',
      monitoramento: '',
      observacoes: '',
      _seq: num
    };
  };

  App.Calc = C;
})(window.App);
