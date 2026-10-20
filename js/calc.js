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
    if (i.tipo === 'micro' && pos(i.modulosPorUnidade)) s += ' / ' + i.modulosPorUnidade + ' módulos';
    if (i.tipo === 'hibrido' && pos(i.tensaoBateria)) s += ' / Bateria ' + U.fmtSmart(i.tensaoBateria, 1) + 'V';
    return s.trim();
  };

  C.TITULO_INVERSOR = { hibrido: 'Inversor Híbrido', micro: 'Microinversor', inversor: 'Inversor' };

  C.descInversor = function (i) {
    if (!i) return '';
    if (i.descricaoProposta) return i.descricaoProposta;
    return (C.TITULO_INVERSOR[i.tipo] || 'Inversor') + ' ' + [i.fabricante, i.modelo].filter(Boolean).join(' ') + ' — ' + C.specInversor(i);
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

  C.specBess = function (b) {
    if (!b) return '';
    const s = [];
    if (pos(b.energia)) s.push(U.fmtSmart(b.energia, 2) + ' kWh');
    if (pos(b.potencia)) s.push(U.fmtSmart(b.potencia, 2) + ' kW');
    return s.join(' / ');
  };

  C.descBess = function (b) {
    if (!b) return '';
    if (b.descricaoProposta) return b.descricaoProposta;
    const s = ['Sistema de Armazenamento (BESS) ' + [b.fabricante, b.modelo].filter(Boolean).join(' ')];
    const spec = C.specBess(b);
    if (spec) s.push(spec);
    const extra = [b.quimica, b.fases, pos(b.eficiencia) ? 'Ef. ' + U.fmtSmart(b.eficiencia, 1) + '%' : '', pos(b.ciclos) ? U.fmt(b.ciclos, 0) + ' ciclos' : ''].filter(Boolean);
    if (extra.length) s.push(extra.join(' / '));
    return s.join(' — ');
  };

  C.descEquip = function (e) {
    if (!e) return '';
    if (e.tipo === 'modulo') return C.descModulo(e);
    if (e.tipo === 'inversor' || e.tipo === 'hibrido' || e.tipo === 'micro') return C.descInversor(e);
    if (e.tipo === 'bateria') return C.descBateria(e);
    if (e.tipo === 'bess') return C.descBess(e);
    return e.descricaoProposta || e.descricao || [e.fabricante, e.modelo].filter(Boolean).join(' ');
  };

  C.garantiaEquip = function (e) {
    if (!e) return '';
    if (e.tipo === 'modulo') return C.garantiaModulo(e);
    if (['inversor', 'hibrido', 'micro', 'bateria', 'bess'].indexOf(e.tipo) >= 0) return pos(e.garantia) ? e.garantia + ' anos' : 'Conf. fabricante';
    return e.garantia || 'Conf. fabricante';
  };

  C.nomeEquip = function (e) {
    if (!e) return '';
    if (e.tipo === 'modulo') return [e.fabricante, e.modelo, e.potencia ? e.potencia + ' Wp' : ''].filter(Boolean).join(' ');
    if (e.tipo === 'inversor' || e.tipo === 'hibrido') return [e.fabricante, e.modelo, e.potencia ? U.fmtSmart(e.potencia, 2) + ' kW' : ''].filter(Boolean).join(' ');
    if (e.tipo === 'micro') return [e.fabricante, e.modelo, e.potencia ? U.fmtSmart(e.potencia, 2) + ' kW' : '', pos(e.modulosPorUnidade) ? '(' + e.modulosPorUnidade + ' módulos)' : ''].filter(Boolean).join(' ');
    if (e.tipo === 'bateria') return [e.fabricante, e.modelo, e.energia ? U.fmtSmart(e.energia, 2) + ' kWh' : ''].filter(Boolean).join(' ');
    if (e.tipo === 'bess') return [e.fabricante, e.modelo, C.specBess(e)].filter(Boolean).join(' ');
    return e.descricao || [e.fabricante, e.modelo].filter(Boolean).join(' ');
  };

  /** Classe de tensão da bateria: 'LV' (48 V) ou 'HV' (alta tensão). */
  C.classeBateria = function (b) {
    if (!b) return null;
    if (b.tipoBateria) return b.tipoBateria;
    return pos(b.tensao) && b.tensao > 60 ? 'HV' : 'LV';
  };

  /** Classe de bateria aceita pelo inversor híbrido. */
  C.classeBateriaInversor = function (inv) {
    if (!inv) return null;
    if (inv.tipoBateria) return inv.tipoBateria;
    return pos(inv.tensaoBateria) && inv.tensaoBateria > 60 ? 'HV' : 'LV';
  };

  function fasesCompat(inv, ligacao) {
    const tri = /tri/i.test(inv.fases || '');
    if (ligacao === 'tri') return { ok: true, pen: tri ? 0 : 0.3 };
    return { ok: !tri, pen: 0 };
  }

  /** Nº de microinversores para N módulos (cada unidade recebe `modulosPorUnidade` módulos). */
  C.qtdMicro = function (inv, nModulos) {
    const m = pos(inv && inv.modulosPorUnidade) || 1;
    return Math.max(1, Math.ceil(nModulos / m - 1e-9));
  };

  /** Módulo dentro da faixa de potência recomendada pelo fabricante do microinversor? */
  function moduloCompativel(inv, wp) {
    if (!wp) return true;
    if (pos(inv.potModuloMin) && wp < inv.potModuloMin) return false;
    if (pos(inv.potModuloMax) && wp > inv.potModuloMax) return false;
    return true;
  }

  /**
   * Escolhe inversor e quantidade com FDG (fator de dimensionamento global = P_FV / P_inversor, Pcc/Pca) mais próximo do alvo.
   * Microinversores: a quantidade é definida pelo nº de módulos (nMod) e a compatibilidade pela potência do módulo (wp).
   */
  C.sugerirInversor = function (kwp, ligacao, candidatos, prem, potCargasW, nMod, wp) {
    let melhor = null;
    if (!(kwp > 0)) return null;
    (candidatos || []).forEach(function (inv) {
      const pot = pos(inv.potencia);
      if (!pot) return;
      const fc = fasesCompat(inv, ligacao);
      if (!fc.ok) return;
      if (inv.tipo === 'micro') {
        if (!(nMod > 0)) return;
        const n = C.qtdMicro(inv, nMod);
        const fdg = kwp / (n * pot);
        let score = Math.abs(fdg - prem.fdgAlvo) + fc.pen;
        if (fdg < prem.fdgMin || fdg > prem.fdgMax) score += 10;
        if (!moduloCompativel(inv, wp)) score += 20;
        // módulos ociosos na última unidade (ex.: 3 módulos num micro de 4 entradas)
        score += ((n * (pos(inv.modulosPorUnidade) || 1)) - nMod) * 0.02;
        if (!melhor || score < melhor.score) melhor = { inv: inv, n: n, fdg: fdg, score: score };
        return;
      }
      for (let n = 1; n <= 4; n++) {
        const fdg = kwp / (n * pot);
        let score = Math.abs(fdg - prem.fdgAlvo) + fc.pen + (n - 1) * 0.08;
        if (fdg < prem.fdgMin || fdg > prem.fdgMax) score += 10;
        if (potCargasW > 0) {
          const bk = (pos(inv.potenciaBackup) || pot) * n * 1000;
          if (bk < potCargasW * prem.hibrido.fatorSegurancaInversor) score += 5;
        }
        if (!melhor || score < melhor.score) melhor = { inv: inv, n: n, fdg: fdg, score: score };
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

  /**
   * Gera a lista de materiais a partir do dimensionamento.
   * opcoes: {fv: incluir itens do sistema FV, armazenamento: nº de unidades de bateria/BESS}
   */
  C.gerarItens = function (p, r, ctx, opcoes) {
    const o = opcoes || {};
    const comFV = o.fv !== false;
    const nArm = o.armazenamento != null ? o.armazenamento : (r.hibrido ? r.hibrido.nBaterias : 0);
    const itens = [];
    const add = function (eq, categoria, qtd, unidade) {
      if (!(qtd > 0)) return;
      itens.push({
        id: U.uid(), equipamentoId: eq.id, categoria: categoria, descricao: C.descEquip(eq),
        qtd: qtd, unidade: unidade || eq.unidade || 'un', precoUnit: U.numOr(eq.preco, 0), garantia: C.garantiaEquip(eq)
      });
    };
    if (comFV && r.modulo) add(r.modulo, 'modulo', r.nModulos, 'un');
    if (comFV && r.inversor) add(r.inversor, 'inversor', r.nInversores, 'un');
    if (r.hibrido && r.hibrido.bateria) add(r.hibrido.bateria, r.hibrido.bateria.tipo === 'bess' ? 'bess' : 'bateria', nArm, 'un');
    if (!comFV) return itens;

    const q = {
      nMod: r.nModulos, nInv: r.nInversores,
      mppts: (pos(r.inversor && r.inversor.mppts) || 1) * r.nInversores,
      nBat: nArm
    };
    const ativos = (ctx.equipamentos || []).filter(function (e) { return e.ativo !== false && e.autoIncluir; });
    // aplicaEm: ambos | ongrid | hibrido | bess (tipo de sistema) ou string | micro (topologia do inversor)
    const ehMicro = !!(r.inversor && r.inversor.tipo === 'micro');
    const aplica = function (e) {
      const a = e.aplicaEm || 'ambos';
      if (a === 'ambos') return true;
      if (a === 'micro') return ehMicro;
      if (a === 'string') return !ehMicro;
      return a === p.tipoSistema;
    };

    const estruturas = ativos.filter(function (e) {
      return e.tipo === 'estrutura' && (!e.telhado || e.telhado === 'Todos' || e.telhado === p.telhado) && aplica(e);
    });
    C.combinarKits(estruturas.filter(function (e) { return e.regra === 'kitModulos'; }), r.nModulos)
      .forEach(function (k) { add(k.eq, 'estrutura', k.qtd); });
    estruturas.filter(function (e) { return e.regra !== 'kitModulos'; })
      .forEach(function (e) { add(e, 'estrutura', qtdRegra(e.regra, e.fator, q)); });

    ativos.filter(function (e) { return e.tipo === 'material' && aplica(e); })
      .forEach(function (e) { add(e, 'material', qtdRegra(e.regra, e.fator, q)); });

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

  /** Fluxo de caixa de um sistema FV no grupo B convencional (mantido para compatibilidade). */
  C.financeiro = function (o) {
    return App.Energia.fluxo({
      prem: o.prem, anoBase: o.anoBase, investimento: o.investimento,
      tarifas: { grupo: 'B', modalidade: 'conv', conv: o.tarifa, ponta: o.tarifa, inter: o.tarifa, fp: o.tarifa, referencia: o.tarifa },
      consumo: { p: 0, i: 0, fp: o.consumoMedio }, demanda: null, disp: o.disp, cosip: o.cosip, tusd: o.tusd,
      s: o.simultaneidade, geracaoAnual1: o.geracaoAnual1, estrategia: null
    });
  };

  /** Premissas completas (com valores padrão para chaves novas). */
  C.premissas = function (p, ctx) {
    const prem = App.Store.ajustarPremissas(U.clone(p.premissas || ctx.premissas || D.premissas));
    ['fdgMin', 'fdgMax', 'fdgAlvo', 'regraDisponibilidade'].forEach(function (k) { if (prem[k] == null) prem[k] = D.premissas[k]; });
    prem.hibrido = Object.assign({}, D.premissas.hibrido, prem.hibrido || {});
    prem.armazenamento = Object.assign({}, D.premissas.armazenamento, prem.armazenamento || {});
    return prem;
  };

  /** Configuração dos cenários da proposta, completando valores ausentes. */
  C.cenariosConfig = function (p) {
    const E = App.Energia;
    const tipo = p.tipoSistema || 'ongrid';
    const grupoA = E.modalidade(p.modalidade).grupo === 'A';
    const cfg = U.clone(p.cenarios || {});
    const pad = {
      solar: { ativo: true },
      backup: { ativo: true, incluirFV: true, n: '', horasFaltaAno: '', custoHoraFalta: '' },
      ponta: { ativo: true, incluirFV: true, n: '' },
      picos: { ativo: grupoA, incluirFV: true, n: '', reducaoKW: '', duracaoH: '', posto: '', readequar: true }
    };
    Object.keys(pad).forEach(function (k) { cfg[k] = Object.assign({}, pad[k], cfg[k] || {}); });
    if (tipo === 'ongrid') {
      cfg.backup.ativo = cfg.ponta.ativo = cfg.picos.ativo = false;
      cfg.solar.ativo = true;
    }
    if (tipo === 'bess' && p.bessComFV === false) {
      cfg.solar.ativo = false;
      cfg.backup.incluirFV = cfg.ponta.incluirFV = cfg.picos.incluirFV = false;
    }
    return cfg;
  };

  /* ---------------------------------------------------------------- cálculo completo */

  C.calcular = function (p, ctx) {
    const E = App.Energia;
    const prem = C.premissas(p, ctx);
    const ar = prem.armazenamento;
    const eqs = ctx.equipamentos || [];
    const alertas = [];
    const alerta = function (nivel, msg) { alertas.push({ nivel: nivel, msg: msg }); };
    const tipo = p.tipoSistema || 'ongrid';
    const r = {
      premissas: prem, alertas: alertas, tipoSistema: tipo,
      hibridoAtivo: tipo === 'hibrido', bessAtivo: tipo === 'bess',
      armazenamentoAtivo: tipo === 'hibrido' || tipo === 'bess'
    };
    r.permiteFV = tipo !== 'bess' || p.bessComFV !== false;

    // Local, concessionária e tarifas
    const loc = porId(ctx.localidades, p.localidadeId);
    const conc = porId(ctx.concessionarias, p.concessionariaId) || (loc && porId(ctx.concessionarias, loc.concessionariaId));
    const classe = D.CLASSES.find(function (c) { return c.id === p.classe; }) || D.CLASSES[0];
    r.localidade = loc;
    r.concessionaria = conc;
    r.classe = classe.id;
    r.modalidade = E.modalidade(p.modalidade || 'conv');
    r.grupo = r.modalidade.grupo;
    r.subgrupo = r.grupo === 'A' ? (p.subgrupo || 'A4') : classe.tarifa;
    r.tarifas = E.tarifas(p, conc, classe.tarifa);
    r.tarifa = r.tarifas.referencia;
    r.tarifaInformada = !!pos(p.tarifa);
    r.tusdFioB = pos(p.tusdFioB) || (conc && pos(conc.tusdFioB)) || 0;
    const cosipP = U.num(p.cosip);
    r.cosip = isFinite(cosipP) && String(p.cosip).trim() !== '' ? cosipP : (loc && isFinite(U.num(loc.cosip)) ? U.num(loc.cosip) : 0);
    r.hsp = pos(p.hsp) || (loc && pos(loc.hsp)) || 0;
    r.fatores = (loc && Array.isArray(loc.fatores) && loc.fatores.length === 12) ? loc.fatores.map(function (f) { return U.numOr(f, 1); }) : Array(12).fill(1);
    r.cidade = p.cidade || (loc ? loc.cidade : '');
    r.uf = p.uf || (loc ? loc.uf : '');
    if (!loc) alerta('erro', 'Selecione a localidade (cidade) para obter a irradiação (HSP).');
    if (r.tarifas.faltando.length) {
      alerta('erro', 'Informe ' + r.tarifas.faltando.join(', ') + ' — na proposta (fatura do cliente) ou em Cadastros › Concessionárias.');
    }

    // Consumo
    if (r.modalidade.id === 'conv') {
      const cm = Array.isArray(p.consumoMensal) ? p.consumoMensal.map(function (v) { return U.num(v); }) : [];
      if (p.consumoModo === 'mensal' && cm.filter(isFinite).length === 12) {
        r.consumoMeses = cm;
        r.consumoMedio = cm.reduce(function (s, x) { return s + x; }, 0) / 12;
      } else {
        r.consumoMedio = U.numOr(p.consumoMedio, 0);
        r.consumoMeses = Array(12).fill(r.consumoMedio);
      }
    } else {
      r.consumoMedio = E.consumo(p, 0).total;
      r.consumoMeses = Array(12).fill(r.consumoMedio);
    }
    r.consumoPostos = E.consumo(p, r.consumoMedio);
    if (!(r.consumoMedio > 0)) {
      alerta('erro', r.modalidade.id === 'conv' ? 'Informe o consumo médio mensal (kWh).' : 'Informe o consumo por posto horário (ponta e fora de ponta).');
    }
    r.demanda = E.demanda(p);
    if (r.grupo === 'A') {
      const semDem = r.modalidade.id === 'verde' ? !(r.demanda.contr > 0) : !(r.demanda.contrP > 0 || r.demanda.contrFP > 0);
      if (semDem) alerta('erro', 'Informe a demanda contratada (kW) do cliente do grupo A.');
    }
    r.ligacao = p.ligacao || 'bi';
    r.disponibilidade = r.grupo === 'B' ? U.numOr(prem.disponibilidade && prem.disponibilidade[r.ligacao], 0) : 0;
    r.simultaneidade = U.numOr(p.simultaneidade, prem.simultaneidade);

    // Armazenamento: cargas críticas e equipamento (bateria do híbrido ou gabinete BESS)
    if (r.armazenamentoAtivo) {
      const h = { cargas: (p.cargas || []).map(function (c) {
        const qtd = U.numOr(c.qtd, 0), pot = U.numOr(c.potencia, 0), horas = U.numOr(c.horas, 0);
        return { descricao: c.descricao || '', qtd: qtd, potencia: pot, horas: horas, potTotal: qtd * pot, energia: qtd * pot * horas };
      }) };
      h.potCargas = h.cargas.reduce(function (s, c) { return s + c.potTotal; }, 0);
      h.energiaBackup = h.cargas.reduce(function (s, c) { return s + c.energia; }, 0);
      h.autonomiaHoras = U.numOr(p.autonomiaHoras, prem.hibrido.autonomiaHoras);
      const tipoEq = r.bessAtivo ? 'bess' : 'bateria';
      const idEq = r.bessAtivo ? p.bessId : p.bateriaId;
      h.tipoEquip = tipoEq;
      // sem bateria escolhida: a primeira ativa compatível com o inversor híbrido selecionado (48 V × alta tensão)
      const invSel = r.hibridoAtivo ? porId(eqs, p.inversorId) : null;
      const classeInv = invSel ? C.classeBateriaInversor(invSel) : null;
      const ativaDoTipo = function (e) { return e.tipo === tipoEq && e.ativo !== false; };
      h.bateria = porId(eqs, idEq) ||
        eqs.find(function (e) { return ativaDoTipo(e) && (!classeInv || tipoEq !== 'bateria' || C.classeBateria(e) === classeInv); }) ||
        eqs.find(ativaDoTipo) || null;
      h.dod = pos(p.dod) ? U.num(p.dod) / 100 : (h.bateria && pos(h.bateria.dod) ? h.bateria.dod / 100 : prem.hibrido.dod);
      h.eficiencia = h.bateria && pos(h.bateria.eficiencia) ? h.bateria.eficiencia / 100 : prem.hibrido.eficiencia;
      h.capNecessaria = h.energiaBackup / 1000 / (h.dod * h.eficiencia);
      r.hibrido = h;
      if (!h.bateria) alerta('erro', r.bessAtivo ? 'Cadastre/selecione um equipamento BESS (Cadastros › Equipamentos › BESS).' : 'Cadastre/selecione uma bateria para o sistema híbrido.');
    }

    // Módulos e potência
    const modulo = r.permiteFV ? porId(eqs, p.moduloId) : null;
    r.modulo = modulo;
    if (r.permiteFV && !modulo) alerta('erro', 'Selecione o módulo fotovoltaico.');
    const wp = modulo ? U.numOr(modulo.potencia, 0) : 0;
    r.consumoDimensionamento = r.consumoMedio;
    r.kwpNecessario = r.permiteFV && r.hsp > 0 ? r.consumoDimensionamento / (r.hsp * 30 * prem.pr) : 0;
    r.nModulosSugerido = wp > 0 ? Math.ceil((r.kwpNecessario * 1000) / wp - 1e-9) : 0;
    r.nModulos = !r.permiteFV ? 0 : (pos(p.nModulos) ? Math.round(U.num(p.nModulos)) : r.nModulosSugerido);
    r.kwp = (r.nModulos * wp) / 1000;
    r.geracaoMensal = r.kwp * r.hsp * 30 * prem.pr;
    r.geracaoAnual = r.kwp * r.hsp * 365 * prem.pr;
    r.geracaoMeses = r.fatores.map(function (f) { return r.geracaoMensal * f; });
    r.cobertura = r.consumoMedio > 0 ? r.geracaoMensal / r.consumoMedio : 0;
    r.areaModulo = (modulo && pos(modulo.area)) || prem.areaModulo;
    r.area = r.nModulos * r.areaModulo;

    // Inversor (string, microinversor ou híbrido)
    r.topologia = !r.hibridoAtivo && p.topologia === 'micro' ? 'micro' : 'string';
    const tipoInv = r.hibridoAtivo ? 'hibrido' : (r.topologia === 'micro' ? 'micro' : 'inversor');
    let candidatos = eqs.filter(function (e) { return e.tipo === tipoInv && e.ativo !== false; });
    const batHib = r.hibridoAtivo && r.hibrido ? r.hibrido.bateria : null;
    if (batHib) {
      const compat = candidatos.filter(function (e) { return C.classeBateriaInversor(e) === C.classeBateria(batHib); });
      if (compat.length) candidatos = compat;
    }
    const invPreSel = r.permiteFV ? porId(eqs, p.inversorId) : null;
    const sug = r.permiteFV ? C.sugerirInversor(r.kwp, r.ligacao, candidatos, prem, r.hibrido && r.hibridoAtivo ? r.hibrido.potCargas : 0, r.nModulos, wp) : null;
    r.inversorSugerido = sug;
    const inv = invPreSel || (sug && sug.inv) || null;
    r.inversor = inv;
    r.micro = !!(inv && inv.tipo === 'micro');
    if (inv && batHib && C.classeBateriaInversor(inv) !== C.classeBateria(batHib)) {
      alerta('erro', 'Bateria ' + batHib.fabricante + ' ' + batHib.modelo + ' (' + (C.classeBateria(batHib) === 'HV' ? 'alta tensão' : '48 V') +
        ') incompatível com o inversor ' + inv.fabricante + ' ' + inv.modelo + ' (' + (C.classeBateriaInversor(inv) === 'HV' ? 'alta tensão' : '48 V') + ').');
    }
    if (r.permiteFV && !inv && (r.kwp > 0 || !candidatos.length)) {
      alerta('erro', r.hibridoAtivo ? 'Cadastre/selecione um inversor híbrido compatível.'
        : (tipoInv === 'micro' ? 'Cadastre/selecione um microinversor compatível com a ligação.' : 'Cadastre/selecione um inversor compatível com a ligação.'));
    }
    const potInv = inv ? U.numOr(inv.potencia, 0) : 0;
    let nInv;
    if (!inv) nInv = 0;
    else if (pos(p.nInversores)) nInv = Math.round(U.num(p.nInversores));
    else if (r.micro) nInv = r.nModulos > 0 ? C.qtdMicro(inv, r.nModulos) : 1;
    else if (!invPreSel && sug) nInv = sug.n;
    else nInv = potInv > 0 && r.kwp > 0 ? Math.max(1, Math.round(r.kwp / (prem.fdgAlvo * potInv))) : 1;
    r.nInversores = nInv;
    r.potInversores = potInv * nInv;
    // FDG — fator de dimensionamento global: potência FV (Pcc) ÷ potência dos inversores (Pca)
    r.fdg = r.kwp > 0 && r.potInversores > 0 ? r.kwp / r.potInversores : 0;
    r.fdgOk = r.fdg >= prem.fdgMin && r.fdg <= prem.fdgMax;
    if (inv && r.kwp > 0 && !r.fdgOk) {
      alerta('aviso', 'FDG (Pcc/Pca) ' + U.fmt(r.fdg, 3) + ' fora da faixa recomendada (' + U.fmt(prem.fdgMin, 2) + '–' + U.fmt(prem.fdgMax, 2) + '). ' +
        (r.fdg > prem.fdgMax ? 'Inversor subdimensionado: haverá corte de potência (clipping) nos horários de pico.' : 'Inversor superdimensionado em relação ao gerador FV.'));
    }
    if (inv && r.ligacao !== 'tri' && /tri/i.test(inv.fases || '')) alerta('erro', 'Inversor trifásico incompatível com ligação ' + C.LIG_ADJ[r.ligacao] + '.');

    // Microinversor: entradas suficientes, faixa de potência e tensão do módulo
    if (r.micro && modulo) {
      const capacidade = nInv * (pos(inv.modulosPorUnidade) || 1);
      if (r.nModulos > capacidade) alerta('erro', r.nModulos + ' módulos para ' + nInv + ' microinversor(es) de ' + (inv.modulosPorUnidade || 1) + ' entradas (máx. ' + capacidade + ' módulos).');
      if (!moduloCompativel(inv, wp)) alerta('aviso', 'Módulo de ' + wp + ' W fora da faixa recomendada para o ' + inv.modelo + ' (' + (inv.potModuloMin || '—') + '–' + (inv.potModuloMax || '—') + ' W).');
      if (pos(modulo.voc) && pos(inv.vmaxCC) && modulo.voc * prem.fatorVocFrio > inv.vmaxCC) alerta('erro', 'Voc do módulo (corrigido p/ frio) acima da tensão máxima de entrada do microinversor (' + inv.vmaxCC + ' V).');
    }

    // Arranjo (strings) — validação opcional quando houver dados elétricos
    r.strings = null;
    if (!r.micro && modulo && inv && pos(modulo.voc) && pos(inv.vmaxCC) && r.nModulos > 0) {
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
    if (r.grupo === 'B' && isFinite(limite) && limite > 0 && r.kwp > limite) {
      alerta('aviso', 'Potência de ' + U.kwp(r.kwp) + ' kWp acima do limite de referência para ligação ' + C.LIG_ADJ[r.ligacao] +
        ' (' + U.fmtSmart(limite, 1) + ' kWp). Pode ser necessária adequação do padrão de entrada (não inclusa).');
    }
    if (r.consumoMedio > 0 && r.kwp > 0) {
      if (r.cobertura < 0.9) alerta('info', 'Geração cobre ' + U.fmt(r.cobertura * 100, 1) + '% do consumo médio.');
      if (r.cobertura > 1.3) alerta('info', 'Geração excede o consumo em ' + U.fmt((r.cobertura - 1) * 100, 1) + '% — créditos excedentes não são monetizados na análise.');
    }

    // Preço do sistema fotovoltaico (sem armazenamento)
    const catArm = ['bateria', 'bess'];
    const itensP = Array.isArray(p.itens) ? p.itens : [];
    const itensFVP = itensP.filter(function (i) { return catArm.indexOf(i.categoria) < 0; });
    const itensFVGerados = r.permiteFV ? C.gerarItens(p, r, ctx, { armazenamento: 0, fv: true }) : [];
    const somaItens = function (l) { return l.reduce(function (s, it) { return s + U.numOr(it.qtd, 0) * U.numOr(it.precoUnit, 0); }, 0); };
    r.kitFVSoma = somaItens(itensFVP.length ? itensFVP : itensFVGerados);
    r.kit = p.kitManual ? U.numOr(p.kitValor, 0) : r.kitFVSoma;
    r.infra = r.permiteFV ? U.numOr(p.infraValor, 0) : 0;
    // outros valores: parcela própria do preço (com descrição); comissão: parte da mão de obra, só para controle gerencial
    r.outros = r.permiteFV ? U.numOr(p.outrosValor, 0) : 0;
    r.outrosDescricao = String(p.outrosDescricao || '').trim() || 'Outros valores';
    if (!r.permiteFV) {
      r.maoObra = 0;
      r.investimentoFV = 0;
    } else if (p.precoModo === 'separado') {
      r.maoObra = U.numOr(p.maoObraValor, 0);
      r.investimentoFV = r.kit + r.infra + r.maoObra + r.outros;
    } else {
      r.investimentoFV = U.numOr(p.valorTotal, 0);
      r.maoObra = r.investimentoFV - r.kit - r.infra - r.outros;
      if (r.investimentoFV > 0 && r.maoObra < 0) alerta('erro', 'Valor do sistema FV menor que kit + infraestrutura' + (r.outros ? ' + outros valores' : '') + ': mão de obra ficaria negativa.');
    }
    r.comissao = r.permiteFV ? U.numOr(p.comissaoValor, 0) : 0;
    r.maoObraLiquida = r.maoObra - r.comissao;
    if (r.comissao > 0 && r.maoObra >= 0 && r.maoObraLiquida < 0) alerta('aviso', 'Comissão (' + U.brl(r.comissao) + ') maior que a mão de obra (' + U.brl(r.maoObra) + ').');

    // Unidade de armazenamento: energia, potência e custo
    const h = r.hibrido;
    let unid = null;
    if (h && h.bateria) {
      const eq = h.bateria;
      const itemEq = itensP.find(function (i) { return i.equipamentoId === eq.id; });
      unid = {
        equip: eq,
        energia: pos(eq.energia) || 0,
        potencia: pos(eq.potencia) || (r.bessAtivo ? 0 : (pos(eq.energia) || 0) * 0.5),
        preco: itemEq ? U.numOr(itemEq.precoUnit, 0) : U.numOr(eq.preco, 0),
        vida: Math.min(pos(eq.vidaAnos) || ar.vidaCalendario, ar.vidaCalendario),
        ciclos: pos(eq.ciclos) || ar.ciclosPadrao
      };
      h.serie = 1;
      if (r.hibridoAtivo && inv && pos(eq.tensao) && pos(inv.tensaoBateria)) h.serie = Math.max(1, Math.round(inv.tensaoBateria / eq.tensao));
      unid.limitePotencia = r.hibridoAtivo && inv ? (pos(inv.potenciaBackup) || potInv) * Math.max(1, nInv) : Infinity;
      if (!unid.energia) { alerta('erro', 'Equipamento de armazenamento sem energia (kWh) cadastrada.'); unid = null; }
    }
    r.unidadeArm = unid;
    const potenciaArm = function (n) { return unid ? Math.min(n * (unid.potencia || unid.energia * 0.5), unid.limitePotencia) : 0; };
    const arredSerie = function (n) { const s = (h && h.serie) || 1; return Math.max(s, Math.ceil(n / s - 1e-9) * s); };

    // Cenários
    const cfg = C.cenariosConfig(p);
    r.cenariosConfig = cfg;
    const anoBase = U.anoDe(p.data);
    r.anoBase = anoBase;
    const sol = r.kwp > 0 ? r.geracaoAnual : 0;
    const injMes = sol / 12 * (1 - r.simultaneidade);
    const cp = r.consumoPostos;
    const tarifasOk = !r.tarifas.faltando.length;
    const objetivo = p.objetivo || 'economia';

    const dimensionar = function (id, c) {
      if (!unid) return 0;
      if (pos(c.n)) return Math.round(U.num(c.n));
      const eU = unid.energia, pU = unid.potencia || eU * 0.5;
      const util = function (kwh) { return kwh / (h.dod * h.eficiencia); };
      let n = 0;
      if (id === 'backup') {
        const nE = h.energiaBackup > 0 ? Math.ceil(util(h.energiaBackup / 1000) / eU - 1e-9) : 1;
        const nP = r.bessAtivo && h.potCargas > 0 ? Math.ceil((h.potCargas / 1000) * prem.hibrido.fatorSegurancaInversor / pU - 1e-9) : 0;
        n = Math.max(1, nE, nP);
      } else if (id === 'ponta') {
        let eDia = 0, pNec = 0;
        if (r.modalidade.id === 'conv') {
          if (c.incluirFV && sol > 0) eDia = Math.min(injMes, Math.max(0, cp.fp - sol / 12 * r.simultaneidade)) / (365 / 12);
        } else {
          eDia = cp.p * 12 / ar.diasUteis;
          pNec = eDia / ar.duracaoPonta;
        }
        if (eDia > 0) n = Math.max(1, Math.ceil(util(eDia) / eU - 1e-9), pNec > 0 ? Math.ceil(pNec / pU - 1e-9) : 0);
      } else if (id === 'picos') {
        const kw = C.reducaoAlvo(r, c, prem);
        const dur = pos(c.duracaoH) || ar.duracaoPonta;
        if (kw > 0) n = Math.max(1, Math.ceil(util(kw * dur) / eU - 1e-9), Math.ceil(kw / pU - 1e-9));
      }
      return n > 0 ? arredSerie(n) : 0;
    };

    const cenarios = E.CENARIOS.map(function (def) {
      const c = cfg[def.id];
      const cen = { id: def.id, nome: def.nome, descricao: def.descricao, ativo: !!c.ativo, aplicavel: true, motivoNA: '' };
      cen.incluirFV = def.id === 'solar' ? true : (r.permiteFV && c.incluirFV !== false);
      if (def.id === 'solar' && !(r.permiteFV && r.kwp > 0)) { cen.aplicavel = false; cen.motivoNA = 'Sem sistema fotovoltaico nesta proposta.'; }
      if (def.armazenamento && !unid) { cen.aplicavel = false; cen.motivoNA = 'Selecione o equipamento de armazenamento.'; }
      if (def.id === 'picos' && r.grupo !== 'A') { cen.aplicavel = false; cen.motivoNA = 'Clientes do grupo B não pagam demanda (kW).'; }
      cen.n = def.armazenamento && cen.aplicavel ? dimensionar(def.id, c) : 0;
      if (def.id === 'ponta' && cen.aplicavel && !cen.n) {
        cen.aplicavel = false;
        cen.motivoNA = r.modalidade.id === 'conv' ? 'Na tarifa convencional o deslocamento só se aplica ao excedente solar.' : 'Informe o consumo na ponta.';
      }
      if (def.id === 'picos' && cen.aplicavel && !cen.n) { cen.aplicavel = false; cen.motivoNA = 'Informe a demanda medida/contratada para definir a redução.'; }
      if (!cen.aplicavel || !cen.ativo || !tarifasOk) {
        cen.investimento = 0;
        return cen;
      }
      cen.capInstalada = cen.n * (unid ? unid.energia : 0);
      cen.capUtil = cen.capInstalada * (h ? h.dod : 0);
      cen.potencia = potenciaArm(cen.n);
      cen.invFV = cen.incluirFV ? r.investimentoFV : 0;
      cen.kitArm = cen.n * (unid ? unid.preco : 0);
      cen.instalArm = cen.n > 0 ? (pos(p.instalArmValor) || cen.kitArm * ar.instalPct) : 0;
      cen.invArm = cen.kitArm + cen.instalArm;
      cen.investimento = cen.invFV + cen.invArm;
      cen.kwp = cen.incluirFV ? r.kwp : 0;
      const ciclosAno = def.id === 'ponta' ? (r.modalidade.id === 'conv' ? 365 : ar.diasUteis) : (def.id === 'picos' ? ar.diasUteis : 12);
      const vida = unid ? Math.max(1, Math.min(unid.vida, unid.ciclos / ciclosAno)) : 0;
      cen.vidaArmAnos = vida;
      const trocaManual = r.hibridoAtivo && prem.hibrido.trocaBateriaAno > 0;
      const custoHora = U.numOr(c.custoHoraFalta, 0), horasFalta = U.numOr(c.horasFaltaAno, 0);
      cen.fin = E.fluxo({
        prem: prem, anoBase: anoBase, investimento: cen.investimento, tarifas: r.tarifas, consumo: cp, demanda: r.demanda,
        disp: r.disponibilidade, cosip: r.cosip, tusd: r.tusdFioB, s: r.simultaneidade,
        geracaoAnual1: cen.incluirFV ? r.geracaoAnual : 0,
        estrategia: def.armazenamento ? def.id : null,
        arm: cen.n > 0 ? {
          capUtil: cen.capUtil, potencia: cen.potencia, eta: h.eficiencia, degradacao: ar.degradacao,
          vida: trocaManual ? prem.hibrido.trocaBateriaAno - 1 : vida,
          custoTroca: cen.kitArm * (trocaManual ? prem.hibrido.trocaBateriaPct : ar.trocaPct),
          reducaoKW: C.reducaoAlvo(r, c, prem), duracao: pos(c.duracaoH) || ar.duracaoPonta,
          posto: c.posto || '', readequar: c.readequar !== false
        } : null,
        beneficioBackup: def.id === 'backup' ? custoHora * horasFalta : 0
      });
      cen.metricas = {
        autonomiaH: h && h.energiaBackup > 0 && cen.n > 0 ? (cen.capUtil * h.eficiencia) / (h.energiaBackup / 1000) * h.autonomiaHoras : null,
        reducaoKW: cen.fin.reducaoKW1,
        kwhDeslocados: cen.fin.kwhDeslocadosAno1
      };
      const a1 = cen.fin.anos[0];
      cen.beneficios = { total: cen.fin.beneficioAno1, backup: a1.beneficioBackup, demanda: Math.max(0, (a1.demandaSem - a1.demandaCom) * 12) };
      return cen;
    });
    r.cenarios = cenarios;
    const avaliados = cenarios.filter(function (c) { return c.ativo && c.aplicavel && c.fin; });
    r.cenariosAvaliados = avaliados;
    r.recomendacao = avaliados.length > 1 ? E.recomendar(avaliados, objetivo, { modalidade: r.modalidade.id, ponta: r.tarifas.ponta, fp: r.tarifas.fp }) : null;
    let escolhidoId = p.cenarioEscolhido && p.cenarioEscolhido !== 'auto' ? p.cenarioEscolhido : null;
    if (!escolhidoId && !p.cenarioEscolhido && r.hibridoAtivo && p.usoBateria) escolhidoId = p.usoBateria === 'ciclagem' ? 'ponta' : 'backup';
    let escolhido = avaliados.find(function (c) { return c.id === escolhidoId; }) ||
      (r.recomendacao && avaliados.find(function (c) { return c.id === r.recomendacao.id; })) || avaliados[0] || null;
    r.cen = escolhido;
    r.comparar = r.armazenamentoAtivo && avaliados.length > 1;

    // Banco de baterias do cenário escolhido (texto técnico)
    if (h) {
      h.nSugerido = escolhido && escolhido.n ? escolhido.n : dimensionar('backup', cfg.backup);
      h.nBaterias = escolhido ? escolhido.n : 0;
      const vb = h.bateria ? pos(h.bateria.tensao) : null;
      h.paralelo = Math.max(1, Math.floor(h.nBaterias / (h.serie || 1)));
      h.capInstalada = h.nBaterias * (unid ? unid.energia : 0);
      h.capUtil = h.capInstalada * h.dod;
      h.potenciaArm = potenciaArm(h.nBaterias);
      h.autonomiaEstimada = h.energiaBackup > 0 && h.nBaterias > 0 ? (h.capUtil * h.eficiencia) / (h.energiaBackup / 1000) * h.autonomiaHoras : null;
      h.tensaoBanco = (vb || 0) * (h.serie || 1);
      h.configuracao = r.bessAtivo
        ? (h.nBaterias > 1 ? h.nBaterias + ' gabinetes em paralelo' : '1 gabinete')
        : ((h.serie || 1) > 1
          ? h.serie + ' em série × ' + h.paralelo + ' em paralelo (' + U.fmtSmart(h.tensaoBanco, 1) + ' V)'
          : (h.nBaterias > 1 ? h.nBaterias + ' em paralelo' : '1 unidade') + (vb ? ' (' + U.fmtSmart(vb, 1) + ' V)' : ''));
      h.usoBateria = escolhido && escolhido.id === 'ponta' ? 'ciclagem' : 'backup';
      h.estrategia = escolhido ? escolhido.id : null;
      h.potBackup = r.hibridoAtivo ? (inv ? (pos(inv.potenciaBackup) || potInv) * nInv : 0) : h.potenciaArm;
      h.backupOk = h.potBackup * 1000 >= h.potCargas * prem.hibrido.fatorSegurancaInversor;
      const temArm = escolhido && escolhido.n > 0;
      if (temArm && h.potCargas > 0 && !h.backupOk) {
        alerta('aviso', 'Potência de backup (' + U.fmtSmart(h.potBackup, 2) + ' kW) abaixo de ' +
          U.fmtSmart(prem.hibrido.fatorSegurancaInversor, 2) + ' × potência das cargas críticas (' + U.fmtSmart(h.potCargas / 1000, 2) + ' kW).');
      }
      if (temArm && escolhido.id === 'backup' && h.autonomiaEstimada != null && h.autonomiaEstimada + 1e-9 < h.autonomiaHoras) {
        alerta('aviso', 'Armazenamento atende ' + U.fmtSmart(h.autonomiaEstimada, 1) + ' h das ' + U.fmtSmart(h.autonomiaHoras, 1) + ' h de autonomia desejadas.');
      }
      if (escolhido && escolhido.id === 'backup' && !h.cargas.length) alerta('aviso', 'Informe as cargas críticas que devem funcionar durante a falta de energia.');
    }

    // Itens do cenário escolhido
    const incluiFV = !escolhido || escolhido.incluirFV;
    r.incluiFV = r.permiteFV && incluiFV;
    const nArm = escolhido ? escolhido.n : 0;
    r.itens = itensP.length ? itensP : C.gerarItens(p, r, ctx, { armazenamento: nArm, fv: r.incluiFV });
    r.itensAutomaticos = !itensP.length;
    r.kitSoma = somaItens(r.itens);

    // Valores do cenário escolhido
    r.kitArm = escolhido ? escolhido.kitArm || 0 : 0;
    r.instalArm = escolhido ? escolhido.instalArm || 0 : 0;
    if (!r.incluiFV) { r.kit = 0; r.infra = 0; r.maoObra = 0; r.outros = 0; r.comissao = 0; r.maoObraLiquida = 0; }
    r.total = escolhido ? escolhido.investimento : (r.incluiFV ? r.investimentoFV : 0);
    if (!(r.total > 0)) alerta('erro', r.permiteFV ? 'Informe o valor da proposta.' : 'Informe o preço do equipamento de armazenamento.');
    if (!p.kitManual && r.kitFVSoma === 0 && r.permiteFV && r.incluiFV && (itensP.length ? itensFVP : itensFVGerados).length) {
      alerta('aviso', 'Itens do kit sem preço — cadastre os preços nos equipamentos ou informe o valor do kit manualmente.');
    }
    if (nArm > 0 && unid && !(unid.preco > 0)) alerta('aviso', 'Equipamento de armazenamento sem preço — cadastre o preço para compor o investimento dos cenários.');

    // Divergência entre a lista de materiais e o dimensionamento
    if (!r.itensAutomaticos) {
      const soma = function (cat) {
        return r.itens.filter(function (i) { return i.categoria === cat; }).reduce(function (s, i) { return s + U.numOr(i.qtd, 0); }, 0);
      };
      const div = [];
      if (r.incluiFV && soma('modulo') !== r.nModulos) div.push('módulos');
      if (r.incluiFV && soma('inversor') !== r.nInversores) div.push('inversores');
      if (h && (soma('bateria') + soma('bess')) !== nArm) div.push(r.bessAtivo ? 'BESS' : 'baterias');
      r.itensDivergentes = div;
      if (div.length) alerta('aviso', 'A lista de materiais não confere com o dimensionamento (' + div.join(', ') + '). Use "Regerar lista" na etapa de materiais.');
    }

    // Financeiro do cenário escolhido
    r.fin = escolhido ? escolhido.fin : C.financeiro({
      prem: prem, anoBase: anoBase, investimento: 0, geracaoAnual1: 0, consumoMedio: r.consumoMedio,
      disp: r.disponibilidade, tarifa: r.tarifa || 0, tusd: r.tusdFioB, cosip: r.cosip, simultaneidade: r.simultaneidade
    });
    r.trocaBateria = null;
    if (escolhido && escolhido.fin) {
      const tr = escolhido.fin.anos.find(function (a) { return a.extra > 0; });
      if (tr) r.trocaBateria = { ano: tr.n, custo: tr.extra };
    }
    if (r.total > 0 && escolhido && escolhido.fin) {
      if (r.fin.tir != null && r.fin.tir < prem.tma) alerta('aviso', 'TIR (' + U.fmt(r.fin.tir * 100, 2) + '% a.a.) abaixo da TMA (' + U.fmt(prem.tma * 100, 2) + '% a.a.).');
      if (r.fin.paybackSimples == null) alerta('aviso', 'O investimento não se paga dentro do horizonte de análise.');
    }

    r.pagamentos = C.pagamentos(r.total, (ctx.pagamentos || []).filter(function (pg) {
      return !Array.isArray(p.pagamentosIds) || p.pagamentosIds.indexOf(pg.id) >= 0;
    }));

    // Textos de identificação
    const invTxt = r.incluiFV && inv ? (nInv > 1 ? nInv + '× ' : '') + inv.fabricante + ' ' + U.fmtSmart(potInv, 2) + 'kW' : '';
    const modTxt = r.incluiFV && modulo ? modulo.fabricante + ' ' + wp + 'W' : '';
    const armTxt = h && nArm > 0 ? U.fmtSmart(nArm * (unid ? unid.energia : 0), 2) + ' kWh' : '';
    r.tecnologia = p.tecnologiaTexto || [modTxt ? modTxt + (modulo.tecnologia ? ' ' + modulo.tecnologia : '') : '', invTxt]
      .filter(Boolean).join(' + ') + (armTxt ? (modTxt || invTxt ? ' + ' : '') + (r.bessAtivo && h.bateria ? 'BESS ' + h.bateria.fabricante + ' ' : '') + armTxt : '');
    r.resumoCabecalho = (r.incluiFV && r.kwp > 0 ? U.kwp(r.kwp) + ' kWp — ' + [modTxt, invTxt].filter(Boolean).join(' + ') : '') +
      (armTxt ? (r.incluiFV && r.kwp > 0 ? ' + ' : 'Armazenamento ') + armTxt : '');
    r.estruturaTexto = p.estruturaTexto || C.textoEstrutura(r.itens, ctx);
    r.monitoramento = p.monitoramento || (inv && inv.monitoramento) || 'Aplicativo do fabricante do inversor (Wi-Fi)';
    r.erros = alertas.filter(function (a) { return a.nivel === 'erro'; }).length;
    return r;
  };

  /** Redução de demanda alvo (kW) para o cenário de picos. */
  C.reducaoAlvo = function (r, c, prem) {
    if (!r.demanda) return 0;
    const informado = pos(c.reducaoKW);
    if (informado) return informado;
    const pct = prem.armazenamento.reducaoDemandaPct;
    if (r.modalidade.id === 'verde') return r.demanda.med * pct;
    const posto = c.posto || 'ponta';
    return (posto === 'ponta' ? r.demanda.medP : r.demanda.medFP) * pct;
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
      modalidade: 'conv',
      subgrupo: 'A4',
      ligacao: 'bi',
      ligacaoConfirmar: false,
      tensao: '220 V',
      telhado: 'Fibrocimento',
      telhadoDetalhe: 'parafuso estrutural',
      consumoModo: 'media',
      consumoMedio: null,
      consumoMensal: Array(12).fill(''),
      consumoPonta: '',
      consumoIntermediario: '',
      consumoForaPonta: '',
      demandaContratada: '',
      demandaMedida: '',
      demandaContratadaPonta: '',
      demandaMedidaPonta: '',
      demandaContratadaFP: '',
      demandaMedidaFP: '',
      tarifa: '',
      tarifaPonta: '',
      tarifaIntermediario: '',
      tarifaForaPonta: '',
      tarifaDemanda: '',
      tarifaDemandaPonta: '',
      tarifaDemandaFP: '',
      tusdFioB: '',
      cosip: '',
      hsp: '',
      simultaneidade: ctx.premissas.simultaneidade,
      moduloId: mod ? mod.id : null,
      nModulos: '',
      topologia: 'string',
      inversorId: null,
      nInversores: '',
      cargas: [],
      autonomiaHoras: ctx.premissas.hibrido.autonomiaHoras,
      bateriaId: null,
      bessId: null,
      bessComFV: true,
      dod: '',
      instalArmValor: '',
      objetivo: 'economia',
      cenarioEscolhido: 'auto',
      cenarios: null,
      itens: [],
      kitManual: false,
      kitValor: '',
      infraValor: 1500,
      infraDescricao: ctx.textos.infraDescricao,
      precoModo: 'composto',
      valorTotal: '',
      maoObraValor: '',
      comissaoValor: '',
      outrosValor: '',
      outrosDescricao: '',
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
