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
      clientes: S.list('clientes'),
      projetos: S.list('projetos')
    };
  };

  /** Mês de conclusão de um projeto ("10/2025" → nº de meses) para ordenar do mais recente ao mais antigo. */
  C.periodoProjeto = function (pr) {
    const m = String((pr && pr.conclusao) || '').match(/(\d{1,2})\s*\/\s*(\d{4})/);
    if (m) return Number(m[2]) * 12 + Number(m[1]);
    const a = String((pr && pr.conclusao) || '').match(/(\d{4})/);
    return a ? Number(a[1]) * 12 : 0;
  };

  /** Projeto pronto para a proposta: marcado para exibição e com as 2 fotos. */
  C.projetoPronto = function (pr) {
    return !!(pr && pr.exibir !== false && pr.foto1 && pr.foto1.dataURL && pr.foto2 && pr.foto2.dataURL);
  };

  /**
   * Projetos realizados da proposta: os prontos, priorizando o mesmo tipo de sistema, o mesmo segmento do cliente
   * e a mesma cidade, depois os mais recentes. Quantidade em Configurações › Empresa (padrão 4).
   */
  C.projetosProposta = function (p, r, ctx) {
    const n = Math.max(0, parseInt(U.numOr(ctx.empresa && ctx.empresa.projetosNaProposta, 4), 10) || 0);
    if (!n || p.incluirProjetos === false) return [];
    const norm = function (x) { return String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); };
    const segmento = r.grupo === 'A' ? 'industrial' : norm((r.classe || '').split(' ')[0]).replace('poder', 'publico');
    const cidade = norm(r.cidade);
    const prontos = (ctx.projetos || []).filter(C.projetoPronto).map(function (pr, i) {
      const pontos = (pr.tipoSistema === r.tipoSistema ? 4 : 0) + (pr.segmento === segmento ? 2 : 0) + (cidade && norm(pr.cidade) === cidade ? 1 : 0);
      return { pr: pr, pontos: pontos, periodo: C.periodoProjeto(pr), i: i };
    });
    prontos.sort(function (a, b) { return (b.pontos - a.pontos) || (b.periodo - a.periodo) || (a.i - b.i); });
    return prontos.slice(0, n).map(function (x) { return x.pr; });
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

  /** Consumo contínuo de W watts em kWh por mês médio. */
  C.kwhMes = function (w) {
    return U.numOr(w, 0) * 24 * 365 / 12 / 1000;
  };

  C.MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

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

  /** Geração mês a mês (kWh, inteiros) com o perfil da localidade, ajustada para somar a geração anual da proposta. */
  C.producaoMensal = function (r) {
    const soma = r.geracaoMeses.reduce(function (a, b) { return a + b; }, 0);
    const ajuste = soma > 0 ? r.geracaoAnual / soma : 1;
    return r.geracaoMeses.map(function (v) { return U.round(v * ajuste, 0); });
  };

  /** Descrição do sistema no subtítulo do gráfico de produção: módulos | inversores | perdas | cidade. */
  C.descricaoSistema = function (r, prem) {
    const mod = r.modulo, inv = r.inversor;
    return [
      mod ? r.nModulos + ' Módulos ' + mod.fabricante + ' ' + U.fmt(mod.potencia, 0) + 'W' : '',
      inv ? r.nInversores + (r.nInversores > 1 ? (r.micro ? ' Microinversores ' : ' Inversores ') : (r.micro ? ' Microinversor ' : ' Inversor ')) + inv.fabricante + ' ' + U.fmtSmart(inv.potencia, 2) + 'kW' : '',
      'Perdas: ' + U.fmtSmart((1 - prem.pr) * 100, 1) + '%',
      [r.cidade, r.uf].filter(Boolean).join('–')
    ].filter(Boolean).join('  |  ');
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

  /** Percentual do cadastro (ex.: 95) como fração; aceita também a fração (0,95). */
  function frac(v) {
    const n = pos(v);
    return n ? (n > 1 ? n / 100 : n) : null;
  }

  // valores típicos quando só um dos datasheets informa a eficiência (produto ≈ premissa padrão de 92%)
  C.EF_BATERIA_TIPICA = 0.95;
  C.EF_INVERSOR_BATERIA_TIPICA = 0.97;

  /**
   * Eficiência de ciclo do armazenamento. BESS: a do gabinete (CA–CA). Híbrido: eficiência de ciclo (round-trip) da bateria ×
   * eficiência bateria↔CA do inversor, conforme os datasheets; faltando uma delas usa o valor típico; sem nenhuma, a premissa.
   */
  C.eficienciaCiclo = function (bat, inv, prem, bess) {
    const eb = bat ? frac(bat.eficiencia) : null;
    if (bess) return eb || prem.hibrido.eficiencia;
    const ei = inv ? frac(inv.efBateria) : null;
    if (eb == null && ei == null) return prem.hibrido.eficiencia;
    return (eb == null ? C.EF_BATERIA_TIPICA : eb) * (ei == null ? C.EF_INVERSOR_BATERIA_TIPICA : ei);
  };

  /** DoD: o informado na proposta, o do datasheet ou energia útil ÷ nominal; senão a premissa. */
  C.dodBateria = function (bat, dodProposta, prem) {
    if (pos(dodProposta)) return U.num(dodProposta) / 100;
    if (bat && frac(bat.dod)) return frac(bat.dod);
    if (bat && pos(bat.energiaUtil) && pos(bat.energia)) return Math.min(1, bat.energiaUtil / bat.energia);
    return prem.hibrido.dod;
  };

  /** Voc do módulo no frio (V): coeficiente de Voc do datasheet e temperatura mínima da célula; sem coeficiente, fator das premissas. */
  C.vocFrio = function (m, prem) {
    const coef = U.num(m && m.coefVoc);
    if (isFinite(coef) && coef !== 0) return m.voc * (1 + Math.abs(coef) / 100 * (25 - U.numOr(prem.tempMinima, 0)));
    return m.voc * prem.fatorVocFrio;
  };

  /** Vmp do módulo no calor (V), pelo coeficiente de Voc e a temperatura máxima da célula; sem coeficiente, o Vmp nominal. */
  C.vmpQuente = function (m, prem) {
    const coef = U.num(m && m.coefVoc);
    if (isFinite(coef) && coef !== 0) return m.vmp * (1 - Math.abs(coef) / 100 * (U.numOr(prem.tempMaxCelula, 70) - 25));
    return m.vmp;
  };

  /** Imp do módulo (A): a do datasheet ou Pmáx ÷ Vmp. */
  C.impModulo = function (m) {
    return pos(m && m.imp) || (m && pos(m.vmp) && pos(m.potencia) ? m.potencia / m.vmp : null);
  };

  /** Área ocupada por módulo (m²): a do datasheet ou comprimento × largura. */
  C.areaModulo = function (m) {
    return pos(m && m.area) || (m && pos(m.comprimento) && pos(m.largura) ? m.comprimento * m.largura / 1e6 : null);
  };

  /** Potência contínua de descarga de uma unidade (kW): a do datasheet ou corrente contínua × tensão. */
  C.potenciaUnidade = function (b) {
    if (!b) return null;
    if (pos(b.potencia)) return b.potencia;
    if (pos(b.iDescargaMax) && pos(b.tensao)) return b.iDescargaMax * b.tensao / 1000;
    return null;
  };

  /** Potência de bateria do inversor híbrido (kW): a do datasheet ou corrente máxima × tensão do banco. tipo 'carga' | 'descarga'. */
  C.potenciaBateriaInversor = function (inv, vBanco, tipo) {
    if (!inv) return null;
    if (pos(inv.pBateriaMax)) return inv.pBateriaMax;
    const i = pos(tipo === 'carga' ? inv.iCargaMax : inv.iDescargaMax);
    const v = pos(vBanco) || pos(inv.tensaoBateria);
    return i && v ? i * v / 1000 : null;
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
        // limites do datasheet: entrada FV máxima e unidades em paralelo (híbrido)
        if (pos(inv.pFVMax) && kwp > inv.pFVMax * n + 1e-9) score += 10;
        if (inv.tipo === 'hibrido' && pos(inv.paraleloMax) && n > inv.paraleloMax) score += 10;
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
    prem.preco = Object.assign({}, D.premissas.preco, prem.preco || {});
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
      const aut = U.numOr(p.autonomiaHoras, prem.hibrido.autonomiaHoras);
      // horas de uso de cada carga durante a falta de energia, limitadas à autonomia desejada (em branco = toda a autonomia)
      const h = { autonomiaHoras: aut, cargas: (p.cargas || []).map(function (c) {
        const qtd = U.numOr(c.qtd, 0), pot = U.numOr(c.potencia, 0);
        const horas = aut > 0 ? Math.min(pos(c.horas) || aut, aut) : U.numOr(c.horas, 0);
        return { descricao: c.descricao || '', qtd: qtd, potencia: pot, horas: horas, potTotal: qtd * pot, energia: qtd * pot * horas, motor: !!c.motor };
      }) };
      h.potCargas = h.cargas.reduce(function (s, c) { return s + c.potTotal; }, 0);
      h.energiaBackup = h.cargas.reduce(function (s, c) { return s + c.energia; }, 0);
      // pico de partida (W): todas as cargas ligadas + o maior motor partindo (partida direta, um motor por vez)
      const maiorMotor = h.cargas.reduce(function (m, c) { return c.motor && c.qtd > 0 ? Math.max(m, c.potencia) : m; }, 0);
      h.picoPartida = h.potCargas + maiorMotor * (prem.hibrido.fatorPartida - 1);
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
      h.dod = C.dodBateria(h.bateria, p.dod, prem);
      r.hibrido = h;
      if (!h.bateria) alerta('erro', r.bessAtivo ? 'Cadastre/selecione um equipamento BESS (Cadastros › Equipamentos › BESS).' : 'Cadastre/selecione uma bateria para o sistema híbrido.');
    }

    // Módulos e potência
    const modulo = r.permiteFV ? porId(eqs, p.moduloId) : null;
    r.modulo = modulo;
    if (r.permiteFV && !modulo) alerta('erro', 'Selecione o módulo fotovoltaico.');
    const wp = modulo ? U.numOr(modulo.potencia, 0) : 0;
    // Consumo do dimensionamento: no híbrido soma o consumo próprio do inversor (24 h) e, se o cenário detalhado cicla
    // a bateria, as perdas do ciclo. Na 1ª passada usa a premissa; a 2ª (p._dimExtra) usa o inversor e as perdas calculadas.
    const dimExtra = p._dimExtra || { proprio: r.hibridoAtivo && r.permiteFV ? C.kwhMes(prem.hibrido.consumoProprioW) : 0, perdas: 0 };
    r.dimensionamento = { consumo: r.consumoMedio, proprio: dimExtra.proprio, perdas: dimExtra.perdas };
    r.consumoDimensionamento = r.consumoMedio + dimExtra.proprio + dimExtra.perdas;
    r.kwpNecessario = r.permiteFV && r.hsp > 0 ? r.consumoDimensionamento / (r.hsp * 30 * prem.pr) : 0;
    r.nModulosSugerido = wp > 0 ? Math.ceil((r.kwpNecessario * 1000) / wp - 1e-9) : 0;
    r.nModulos = !r.permiteFV ? 0 : (pos(p.nModulos) ? Math.round(U.num(p.nModulos)) : r.nModulosSugerido);
    r.kwp = (r.nModulos * wp) / 1000;
    r.geracaoMensal = r.kwp * r.hsp * 30 * prem.pr;
    r.geracaoAnual = r.kwp * r.hsp * 365 * prem.pr;
    r.geracaoMeses = r.fatores.map(function (f) { return r.geracaoMensal * f; });
    r.cobertura = r.consumoMedio > 0 ? r.geracaoMensal / r.consumoMedio : 0;
    r.areaModulo = C.areaModulo(modulo) || prem.areaModulo;
    // degradação anual dos módulos: a do datasheet (após o 1º ano) ou a das premissas
    r.degradacaoModulos = modulo && pos(modulo.degradacaoAnual) ? modulo.degradacaoAnual / 100 : prem.degradacao;
    r.degradacaoDatasheet = !!(modulo && pos(modulo.degradacaoAnual));
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
    if (r.hibrido) {
      // eficiência de ciclo (datasheets da bateria e do inversor híbrido) e capacidade para o backup:
      // energia das cargas ÷ (DoD × eficiência)
      const hb = r.hibrido;
      hb.eficiencia = C.eficienciaCiclo(hb.bateria, r.hibridoAtivo ? inv : null, prem, r.bessAtivo);
      hb.capNecessaria = hb.energiaBackup / 1000 / (hb.dod * hb.eficiencia);
      // energia útil mantida como reserva (SOC de backup) quando o banco também faz ciclagem ou corte de picos
      hb.reservaUtil = hb.energiaBackup / 1000 / hb.eficiencia;
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
    // consumo próprio do inversor híbrido (kWh/mês): o do cadastro do inversor ou o das premissas
    r.consumoProprioW = r.hibridoAtivo && inv ? U.numOr(inv.consumoProprioW, prem.hibrido.consumoProprioW) * Math.max(1, nInv) : 0;
    r.consumoProprio = C.kwhMes(r.consumoProprioW);
    if (inv && pos(inv.pFVMax) && r.kwp > inv.pFVMax * Math.max(1, nInv) + 1e-9) {
      alerta('aviso', 'Potência FV de ' + U.kwp(r.kwp) + ' kWp acima da entrada FV máxima do inversor (' + U.fmtSmart(inv.pFVMax * Math.max(1, nInv), 2) + ' kWp).');
    }
    // FDG — fator de dimensionamento global: potência FV (Pcc) ÷ potência dos inversores (Pca)
    r.fdg = r.kwp > 0 && r.potInversores > 0 ? r.kwp / r.potInversores : 0;
    r.fdgOk = r.fdg >= prem.fdgMin && r.fdg <= prem.fdgMax;
    if (inv && r.kwp > 0 && !r.fdgOk) {
      alerta('aviso', 'FDG (Pcc/Pca) ' + U.fmt(r.fdg, 3) + ' fora da faixa recomendada (' + U.fmt(prem.fdgMin, 2) + '–' + U.fmt(prem.fdgMax, 2) + '). ' +
        (r.fdg > prem.fdgMax ? 'Inversor subdimensionado: haverá corte de potência (clipping) nos horários de pico.' : 'Inversor superdimensionado em relação ao gerador FV.'));
    }
    if (inv && r.ligacao !== 'tri' && /tri/i.test(inv.fases || '')) alerta('erro', 'Inversor trifásico incompatível com ligação ' + C.LIG_ADJ[r.ligacao] + '.');
    if (r.hibridoAtivo && inv && pos(inv.paraleloMax) && nInv > inv.paraleloMax) {
      alerta('aviso', nInv + ' inversores híbridos ' + inv.modelo + ': o datasheet admite ' + (inv.paraleloMax > 1 ? 'no máximo ' + inv.paraleloMax + ' em paralelo' : 'operação sem paralelismo') +
        '. Use um modelo de maior potência ou sistemas independentes (cada um com seu banco e suas cargas).');
    }

    // Microinversor: entradas suficientes, faixa de potência e tensão do módulo
    if (r.micro && modulo) {
      const capacidade = nInv * (pos(inv.modulosPorUnidade) || 1);
      if (r.nModulos > capacidade) alerta('erro', r.nModulos + ' módulos para ' + nInv + ' microinversor(es) de ' + (inv.modulosPorUnidade || 1) + ' entradas (máx. ' + capacidade + ' módulos).');
      if (!moduloCompativel(inv, wp)) alerta('aviso', 'Módulo de ' + wp + ' W fora da faixa recomendada para o ' + inv.modelo + ' (' + (inv.potModuloMin || '—') + '–' + (inv.potModuloMax || '—') + ' W).');
      if (pos(modulo.voc) && pos(inv.vmaxCC) && C.vocFrio(modulo, prem) > inv.vmaxCC) alerta('erro', 'Voc do módulo (corrigido p/ frio) acima da tensão máxima de entrada do microinversor (' + inv.vmaxCC + ' V).');
      const impMod = C.impModulo(modulo);
      if (pos(modulo.isc) && pos(inv.iscMaxMppt) && modulo.isc > inv.iscMaxMppt + 1e-9) {
        alerta('erro', 'Isc do módulo (' + U.fmtSmart(modulo.isc, 2) + ' A) acima da corrente de curto-circuito máxima por entrada do microinversor (' + U.fmtSmart(inv.iscMaxMppt, 2) + ' A).');
      } else if (impMod && pos(inv.imaxMppt) && impMod > inv.imaxMppt + 1e-9) {
        alerta('aviso', 'Corrente de operação do módulo (≈ ' + U.fmtSmart(impMod, 2) + ' A) acima da corrente máxima por entrada do microinversor (' + U.fmtSmart(inv.imaxMppt, 2) +
          ' A): haverá limitação de corrente (perda de geração).');
      }
    }
    // microinversores: circuitos (ramais) CA conforme o máximo de unidades por ramal do datasheet
    r.ramaisMicro = r.micro && inv && pos(inv.maxPorRamal) && nInv > 0 ? Math.ceil(nInv / inv.maxPorRamal - 1e-9) : null;

    // Arranjo (strings) — validação opcional quando houver dados elétricos
    r.strings = null;
    if (!r.micro && modulo && inv && pos(modulo.voc) && pos(inv.vmaxCC) && r.nModulos > 0) {
      // tensão máxima: a menor entre a entrada CC do inversor e a tensão máxima do sistema do módulo; Voc corrigido p/ frio
      const vocFrio = C.vocFrio(modulo, prem);
      const vLimite = Math.min(inv.vmaxCC, pos(modulo.vMaxSistema) || Infinity);
      const maxSerie = Math.floor(vLimite / vocFrio + 1e-9);
      const totMppt = (pos(inv.mppts) || 1) * nInv;
      const nStr = Math.max(1, Math.ceil(r.nModulos / Math.max(1, maxSerie)));
      const porStr = Math.ceil(r.nModulos / nStr);
      const menorStr = Math.floor(r.nModulos / nStr);
      // strings por MPPT (distribuição uniforme) e correntes do módulo: Isc (STC) e Imp = Pmáx ÷ Vmp
      const porMppt = Math.ceil(nStr / totMppt - 1e-9);
      const impMod = C.impModulo(modulo);
      r.strings = {
        maxSerie: maxSerie, nStrings: nStr, porString: porStr, menorString: menorStr, mppts: totMppt, porMppt: porMppt,
        vocFrioString: porStr * vocFrio, vLimite: vLimite, limitePeloModulo: vLimite < inv.vmaxCC,
        entradas: pos(inv.stringsPorMppt) ? totMppt * inv.stringsPorMppt : null,
        iscMppt: pos(modulo.isc) ? porMppt * modulo.isc : null, impMppt: impMod ? porMppt * impMod : null
      };
      const st = r.strings;
      if (maxSerie < 1) alerta('erro', 'Voc do módulo (corrigido p/ frio) excede a tensão máxima CC ' + (st.limitePeloModulo ? 'do sistema do módulo.' : 'do inversor.'));
      if (st.entradas && nStr > st.entradas) {
        alerta('erro', nStr + ' strings para ' + st.entradas + ' entradas do inversor (' + totMppt + ' MPPT × ' + inv.stringsPorMppt + ' string' + (inv.stringsPorMppt > 1 ? 's' : '') +
          '). Aumente o número de inversores ou use um modelo com mais entradas.');
      }
      if (st.iscMppt && pos(inv.iscMaxMppt) && st.iscMppt > inv.iscMaxMppt + 1e-9) {
        alerta('erro', 'Corrente de curto-circuito por MPPT (' + porMppt + ' × ' + U.fmtSmart(modulo.isc, 2) + ' A = ' + U.fmtSmart(st.iscMppt, 2) +
          ' A) acima do máximo do inversor (' + U.fmtSmart(inv.iscMaxMppt, 2) + ' A).');
      } else if (st.impMppt && pos(inv.imaxMppt) && st.impMppt > inv.imaxMppt + 1e-9) {
        alerta('aviso', 'Corrente de operação por MPPT (≈ ' + U.fmtSmart(st.impMppt, 2) + ' A) acima da corrente máxima de entrada do inversor (' + U.fmtSmart(inv.imaxMppt, 2) +
          ' A): haverá limitação de corrente (perda de geração).');
      }
      if (st.iscMppt && pos(modulo.fusivelMax) && porMppt >= 3 && (porMppt - 1) * modulo.isc > modulo.fusivelMax + 1e-9) {
        alerta('aviso', porMppt + ' strings em paralelo no MPPT: a corrente reversa ((n − 1) × Isc = ' + U.fmtSmart((porMppt - 1) * modulo.isc, 1) +
          ' A) supera o fusível máximo do módulo (' + U.fmtSmart(modulo.fusivelMax, 0) + ' A). Preveja fusíveis de string (ABNT NBR 16690).');
      }
      const vmpCalor = C.vmpQuente(modulo, prem);
      if (pos(inv.mpptMin) && pos(modulo.vmp) && menorStr * vmpCalor < inv.mpptMin) {
        alerta('aviso', 'Tensão da string (' + U.fmt(menorStr * vmpCalor, 0) + ' V' + (vmpCalor !== modulo.vmp ? ' com a célula a ' + U.fmt(U.numOr(prem.tempMaxCelula, 70), 0) + ' °C' : '') +
          ') abaixo da faixa MPPT mínima do inversor (' + inv.mpptMin + ' V).');
      }
      if (pos(inv.mpptMax) && pos(modulo.vmp) && porStr * modulo.vmp > inv.mpptMax + 1e-9) {
        alerta('aviso', 'Tensão da string (' + U.fmt(porStr * modulo.vmp, 0) + ' V) acima da faixa MPPT máxima do inversor (' + inv.mpptMax + ' V). Use mais strings, mais curtas.');
      }
      if (pos(inv.vPartida) && menorStr * modulo.voc < inv.vPartida) {
        alerta('aviso', 'Voc da string (' + U.fmt(menorStr * modulo.voc, 0) + ' V) abaixo da tensão de partida do inversor (' + inv.vPartida + ' V).');
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
    // preço pela margem (propostas novas): custos diretos + lucro + comissão, ambos em % do valor final (ou lucro em R$)
    r.precoMargem = p.precificacao === 'margem';
    if (r.precoMargem) {
      const pp = prem.preco;
      const pctOu = function (v, pad) { const n = U.num(v); return v !== '' && v != null && isFinite(n) ? n : pad; };
      r.instalacaoFaixa = Number(p.instalacaoFaixa) === 2 ? 2 : 1;
      r.instalacaoModulo = U.numOr(r.instalacaoFaixa === 2 ? pp.instalacaoFaixa2 : pp.instalacaoFaixa1, 0);
      r.instalacao = r.permiteFV ? r.nModulos * r.instalacaoModulo : 0;
      r.comissaoPct = Math.max(0, pctOu(p.comissaoPct, pp.comissaoPct));
      r.lucroModo = p.lucroModo === 'valor' ? 'valor' : 'pct';
      r.lucroPct = r.lucroModo === 'pct' ? Math.max(0, pctOu(p.lucroPct, pp.lucroPct)) : 0;
      r.lucroFixo = r.lucroModo === 'valor' ? Math.max(0, U.numOr(p.lucroValor, 0)) : 0;
      r.custoFV = r.permiteFV ? r.kit + r.instalacao + r.infra + r.outros : 0;
      const divisor = 1 - r.comissaoPct - r.lucroPct;
      if (divisor < 0.2) alerta('erro', 'Lucro + comissão (' + U.fmt((r.lucroPct + r.comissaoPct) * 100, 1) + '% do valor final) inviabilizam o preço — reduza os percentuais.');
      // valor final P = (custos + lucro em R$) ÷ (1 − % comissão − % lucro); lucro e comissão saem de P
      r.precificar = function (custo) {
        if (!(custo > 0) || divisor < 0.2) return { total: 0, lucro: 0, comissao: 0 };
        const total = (custo + r.lucroFixo) / divisor;
        return { total: total, lucro: r.lucroModo === 'pct' ? total * r.lucroPct : r.lucroFixo, comissao: total * r.comissaoPct };
      };
      const pfv = r.precificar(r.custoFV);
      r.investimentoFV = pfv.total;
      r.lucro = pfv.lucro;
      r.comissao = pfv.comissao;
      // na proposta, lucro e comissão entram na linha de mão de obra + projeto + instalação + homologação
      r.maoObra = r.permiteFV ? r.instalacao + r.lucro + r.comissao : 0;
      r.maoObraLiquida = r.instalacao;
    } else if (!r.permiteFV) {
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
    if (!r.precoMargem) {
      r.comissao = r.permiteFV ? U.numOr(p.comissaoValor, 0) : 0;
      r.maoObraLiquida = r.maoObra - r.comissao;
      if (r.comissao > 0 && r.maoObra >= 0 && r.maoObraLiquida < 0) alerta('aviso', 'Comissão (' + U.brl(r.comissao) + ') maior que a mão de obra (' + U.brl(r.maoObra) + ').');
    }

    // Unidade de armazenamento: energia, potência e custo
    const h = r.hibrido;
    let unid = null;
    if (h && h.bateria) {
      const eq = h.bateria;
      const itemEq = itensP.find(function (i) { return i.equipamentoId === eq.id; });
      unid = {
        equip: eq,
        energia: pos(eq.energia) || 0,
        potencia: C.potenciaUnidade(eq) || (r.bessAtivo ? 0 : (pos(eq.energia) || 0) * 0.5),
        preco: itemEq ? U.numOr(itemEq.precoUnit, 0) : U.numOr(eq.preco, 0),
        vida: Math.min(pos(eq.vidaAnos) || ar.vidaCalendario, ar.vidaCalendario),
        ciclos: pos(eq.ciclos) || ar.ciclosPadrao
      };
      h.serie = 1;
      const baixaTensao = C.classeBateria(eq) !== 'HV';
      if (r.hibridoAtivo && inv && pos(eq.tensao)) {
        // baterias em série: tensão nominal do inversor ÷ tensão da bateria ou, em baixa tensão, o mínimo para entrar na faixa do inversor
        if (pos(inv.tensaoBateria)) h.serie = Math.max(1, Math.round(inv.tensaoBateria / eq.tensao));
        else if (baixaTensao && pos(inv.vBatMin)) h.serie = Math.max(1, Math.ceil(inv.vBatMin / eq.tensao - 1e-9));
      }
      h.tensaoBanco = pos(eq.tensao) ? eq.tensao * h.serie : null;
      // o banco não entrega mais que o inversor híbrido permite (potência de backup e potência de bateria do datasheet)
      h.pBateriaInv = r.hibridoAtivo && inv ? C.potenciaBateriaInversor(inv, h.tensaoBanco, 'descarga') : null;
      h.pCargaInv = r.hibridoAtivo && inv ? C.potenciaBateriaInversor(inv, h.tensaoBanco, 'carga') : null;
      unid.limitePotencia = r.hibridoAtivo && inv
        ? Math.min(pos(inv.potenciaBackup) || potInv, h.pBateriaInv || Infinity) * Math.max(1, nInv) : Infinity;
      unid.potenciaInformada = !!C.potenciaUnidade(eq);
      // carga por unidade (kW): corrente contínua de carga × tensão
      unid.potenciaCarga = pos(eq.iCargaMax) && pos(eq.tensao) ? eq.iCargaMax * eq.tensao / 1000 : null;
      if (r.hibridoAtivo && inv && h.tensaoBanco) {
        const vMin = pos(inv.vBatMin), vMax = pos(inv.vBatMax);
        if (baixaTensao && ((vMin && h.tensaoBanco < vMin - 1e-9) || (vMax && h.tensaoBanco > vMax + 1e-9))) {
          alerta('erro', 'Banco de ' + U.fmtSmart(h.tensaoBanco, 1) + ' V (' + h.serie + ' × ' + U.fmtSmart(eq.tensao, 1) + ' V) fora da faixa de tensão de bateria do inversor (' +
            (vMin || '…') + '–' + (vMax || '…') + ' V).');
        } else if (!baixaTensao && (vMin || vMax)) {
          // alta tensão: a faixa de operação da bateria precisa cruzar a do inversor
          const bMin = pos(eq.vMin) || eq.tensao, bMax = pos(eq.vMax) || eq.tensao;
          if ((vMax && bMin > vMax + 1e-9) || (vMin && bMax < vMin - 1e-9)) {
            alerta('erro', 'Tensão da bateria (' + U.fmtSmart(bMin, 0) + (bMax !== bMin ? '–' + U.fmtSmart(bMax, 0) : '') + ' V) fora da faixa de bateria do inversor (' +
              (vMin || '…') + '–' + (vMax || '…') + ' V). Confira a configuração de módulos indicada pelo fabricante.');
          }
        }
      }
      if (!unid.energia) { alerta('erro', 'Equipamento de armazenamento sem energia (kWh) cadastrada.'); unid = null; }
      else if (r.hibridoAtivo && !unid.potenciaInformada && h.potCargas > 0) {
        alerta('info', 'Potência de descarga da bateria ' + [eq.fabricante, eq.modelo].filter(Boolean).join(' ') + ' não cadastrada: considerado 0,5C (' +
          U.fmtSmart(unid.potencia, 2) + ' kW por unidade). Confira o datasheet.');
      }
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
        // potência contínua das baterias ≥ fator de segurança × cargas críticas
        const nP = h.potCargas > 0 ? Math.ceil((h.potCargas / 1000) * prem.hibrido.fatorSegurancaInversor / pU - 1e-9) : 0;
        n = Math.max(1, nE, nP);
      } else if (id === 'ponta') {
        if (r.modalidade.id === 'conv') {
          // Sem tarifa horária não há arbitragem: o ganho de guardar o excedente solar é só o Fio B evitado
          // (frequentemente nulo, pois prevalece o custo de disponibilidade — art. 655-I) menos as perdas do ciclo.
          // Por isso a ciclagem usa o mesmo banco do backup, em vez de um banco para todo o excedente.
          return c.incluirFV && injMes > 0 ? dimensionar('backup', cfg.backup) : 0;
        }
        const eDia = cp.p * 12 / ar.diasUteis;
        const pNec = eDia / ar.duracaoPonta;
        if (eDia > 0) n = Math.max(1, Math.ceil((util(eDia) + h.capNecessaria) / eU - 1e-9), pNec > 0 ? Math.ceil(pNec / pU - 1e-9) : 0);
      } else if (id === 'picos') {
        const kw = C.reducaoAlvo(r, c, prem);
        const dur = pos(c.duracaoH) || ar.duracaoPonta;
        if (kw > 0) n = Math.max(1, Math.ceil((util(kw * dur) + h.capNecessaria) / eU - 1e-9), Math.ceil(kw / pU - 1e-9));
      }
      return n > 0 ? arredSerie(n) : 0;
    };

    const cenarios = E.CENARIOS.map(function (def) {
      const c = cfg[def.id];
      const rot = E.rotuloCenario(def, r.modalidade.id);
      const cen = { id: def.id, nome: rot.nome, descricao: rot.descricao, ativo: !!c.ativo, aplicavel: true, motivoNA: '' };
      cen.incluirFV = def.id === 'solar' ? true : (r.permiteFV && c.incluirFV !== false);
      if (def.id === 'solar' && !(r.permiteFV && r.kwp > 0)) { cen.aplicavel = false; cen.motivoNA = 'Sem sistema fotovoltaico nesta proposta.'; }
      if (def.armazenamento && !unid) { cen.aplicavel = false; cen.motivoNA = 'Selecione o equipamento de armazenamento.'; }
      if (def.id === 'picos' && r.grupo !== 'A') { cen.aplicavel = false; cen.motivoNA = 'Clientes do grupo B não pagam demanda (kW).'; }
      cen.n = def.armazenamento && cen.aplicavel ? dimensionar(def.id, c) : 0;
      if (def.id === 'ponta' && cen.aplicavel && !cen.n) {
        cen.aplicavel = false;
        cen.motivoNA = r.modalidade.id === 'conv' ? 'Na tarifa convencional a ciclagem diária só se aplica com excedente solar injetado.' : 'Informe o consumo na ponta.';
      }
      if (def.id === 'picos' && cen.aplicavel && !cen.n) { cen.aplicavel = false; cen.motivoNA = 'Informe a demanda medida/contratada para definir a redução.'; }
      if (!cen.aplicavel || !cen.ativo || !tarifasOk) {
        cen.investimento = 0;
        return cen;
      }
      cen.capInstalada = cen.n * (unid ? unid.energia : 0);
      cen.capUtil = cen.capInstalada * (h ? h.dod : 0);
      cen.potencia = potenciaArm(cen.n);
      cen.kitArm = cen.n * (unid ? unid.preco : 0);
      cen.instalArm = cen.n > 0 ? (pos(p.instalArmValor) || cen.kitArm * ar.instalPct) : 0;
      cen.invArm = cen.kitArm + cen.instalArm;
      if (r.precoMargem) {
        // lucro e comissão sobre o valor final do cenário (sistema FV + armazenamento)
        const pc = r.precificar((cen.incluirFV ? r.custoFV : 0) + cen.invArm);
        cen.investimento = pc.total;
        cen.lucro = pc.lucro;
        cen.comissao = pc.comissao;
        cen.invFV = cen.investimento - cen.invArm;
      } else {
        cen.invFV = cen.incluirFV ? r.investimentoFV : 0;
        cen.investimento = cen.invFV + cen.invArm;
      }
      cen.kwp = cen.incluirFV ? r.kwp : 0;
      const ciclosAno = def.id === 'ponta' ? (r.modalidade.id === 'conv' ? 365 : ar.diasUteis) : (def.id === 'picos' ? ar.diasUteis : 12);
      const vida = unid ? Math.max(1, Math.min(unid.vida, unid.ciclos / ciclosAno)) : 0;
      cen.vidaArmAnos = vida;
      const trocaManual = r.hibridoAtivo && prem.hibrido.trocaBateriaAno > 0;
      const custoHora = U.numOr(c.custoHoraFalta, 0), horasFalta = U.numOr(c.horasFaltaAno, 0);
      cen.fin = E.fluxo({
        prem: r.degradacaoDatasheet ? Object.assign({}, prem, { degradacao: r.degradacaoModulos }) : prem, anoBase: anoBase, investimento: cen.investimento, tarifas: r.tarifas, consumo: cp, demanda: r.demanda,
        disp: r.disponibilidade, cosip: r.cosip, tusd: r.tusdFioB, s: r.simultaneidade,
        geracaoAnual1: cen.incluirFV ? r.geracaoAnual : 0,
        estrategia: def.armazenamento ? def.id : null,
        arm: cen.n > 0 ? {
          capUtil: cen.capUtil, potencia: cen.potencia, eta: h.eficiencia, degradacao: ar.degradacao,
          vida: trocaManual ? prem.hibrido.trocaBateriaAno - 1 : vida,
          custoTroca: cen.kitArm * (trocaManual ? prem.hibrido.trocaBateriaPct : ar.trocaPct),
          reducaoKW: C.reducaoAlvo(r, c, prem), duracao: pos(c.duracaoH) || ar.duracaoPonta,
          posto: c.posto || '', readequar: c.readequar !== false, reserva: h.reservaUtil
        } : null,
        beneficioBackup: def.id === 'backup' ? custoHora * horasFalta : 0,
        consumoProprio: r.consumoProprio,
        fatores: r.fatores, consumoFatores: r.consumoMedio > 0 ? r.consumoMeses.map(function (x) { return x / r.consumoMedio; }) : null
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
    // híbrido/BESS: a recomendação escolhe entre os cenários com armazenamento; "Geração solar" fica só como comparação
    const comArm = avaliados.filter(function (c) { return c.n > 0; });
    const candRec = r.armazenamentoAtivo && comArm.length ? comArm : avaliados;
    r.recomendacao = avaliados.length > 1 ? E.recomendar(candRec, objetivo, { modalidade: r.modalidade.id, ponta: r.tarifas.ponta, fp: r.tarifas.fp }) : null;
    const soSolar = avaliados.find(function (c) { return c.id === 'solar'; });
    const recCen = r.recomendacao && avaliados.find(function (c) { return c.id === r.recomendacao.id; });
    if (candRec !== avaliados && soSolar && recCen && soSolar.fin.vpl > recCen.fin.vpl + 0.5) {
      r.recomendacao.motivos.push('Sem armazenamento (cenário "' + soSolar.nome + '") o VPL seria ' + U.brl(soSolar.fin.vpl - recCen.fin.vpl) +
        ' maior: as baterias se justificam pela segurança no fornecimento, não pela economia na conta.');
    }
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
      h.paraleloMax = h.bateria && !r.bessAtivo ? pos(h.bateria.paraleloMax) : null;
      if (h.nBaterias > 0 && h.paraleloMax && C.classeBateria(h.bateria) !== 'HV' && h.paralelo > h.paraleloMax) {
        alerta('aviso', h.paralelo + ' baterias ' + [h.bateria.fabricante, h.bateria.modelo].filter(Boolean).join(' ') + ' em paralelo: o datasheet admite no máximo ' + h.paraleloMax + '.');
      }
      const altaTensao = !r.bessAtivo && C.classeBateria(h.bateria) === 'HV';
      h.configuracao = r.bessAtivo
        ? (h.nBaterias > 1 ? h.nBaterias + ' gabinetes em paralelo' : '1 gabinete')
        : (altaTensao && h.nBaterias > 1
          // alta tensão: a capacidade cresce com módulos em série na torre (e torres em paralelo), conforme o fabricante
          ? h.nBaterias + ' × ' + U.fmtSmart(unid ? unid.energia : 0, 2) + ' kWh = ' + U.fmtSmart(h.capInstalada, 2) + ' kWh em alta tensão (módulos/torres conforme o fabricante)'
          : ((h.serie || 1) > 1
            ? h.serie + ' em série × ' + h.paralelo + ' em paralelo (' + U.fmtSmart(h.tensaoBanco, 1) + ' V)'
            : (h.nBaterias > 1 ? h.nBaterias + ' em paralelo' : '1 unidade') + (vb ? ' (' + U.fmtSmart(vb, 1) + ' V)' : '')));
      h.usoBateria = escolhido && escolhido.id === 'ponta' ? 'ciclagem' : 'backup';
      h.estrategia = escolhido ? escolhido.id : null;
      h.potBackup = r.hibridoAtivo ? (inv ? (pos(inv.potenciaBackup) || potInv) * nInv : 0) : h.potenciaArm;
      h.backupOk = h.potBackup * 1000 >= h.potCargas * prem.hibrido.fatorSegurancaInversor;
      const temArm = escolhido && escolhido.n > 0;
      if (temArm && h.potCargas > 0 && !h.backupOk) {
        alerta('aviso', 'Potência de backup (' + U.fmtSmart(h.potBackup, 2) + ' kW) abaixo de ' +
          U.fmtSmart(prem.hibrido.fatorSegurancaInversor, 2) + ' × potência das cargas críticas (' + U.fmtSmart(h.potCargas / 1000, 2) + ' kW).');
      }
      if (temArm && h.autonomiaEstimada != null && h.autonomiaEstimada + 1e-9 < h.autonomiaHoras) {
        alerta('aviso', 'Armazenamento atende ' + U.fmtSmart(h.autonomiaEstimada, 1) + ' h das ' + U.fmtSmart(h.autonomiaHoras, 1) + ' h de autonomia desejadas.');
      }
      const capMax = h.bateria && !r.bessAtivo ? pos(h.bateria.capMaxSistema) : null;
      if (temArm && capMax && h.capInstalada > capMax + 1e-9) {
        alerta('aviso', 'Banco de ' + U.fmtSmart(h.capInstalada, 2) + ' kWh acima do máximo do sistema ' + [h.bateria.fabricante, h.bateria.modelo].filter(Boolean).join(' ') +
          ' (' + U.fmtSmart(capMax, 2) + ' kWh por inversor, conforme o fabricante). Reduza as baterias ou use outro modelo.');
      }
      if (escolhido && escolhido.id === 'backup' && !h.cargas.length) alerta('aviso', 'Informe as cargas críticas que devem funcionar durante a falta de energia.');
      const fs = prem.hibrido.fatorSegurancaInversor;
      // potência contínua do banco (baterias e, no híbrido, o limite de bateria do inversor) × cargas críticas
      if (temArm && h.potCargas > 0 && h.potenciaArm * 1000 + 1e-6 < h.potCargas * fs) {
        const pelasBaterias = unid && h.nBaterias * unid.potencia <= unid.limitePotencia;
        alerta('aviso', 'Potência contínua do banco (' + U.fmtSmart(h.potenciaArm, 2) + ' kW) abaixo de ' + U.fmtSmart(fs, 2) + ' × cargas críticas (' +
          U.fmtSmart(h.potCargas * fs / 1000, 2) + ' kW)' + (pelasBaterias ? '. Aumente as baterias.' : ', limitada pelo inversor.'));
      }
      if (r.hibridoAtivo && inv && temArm) {
        const nI = Math.max(1, nInv);
        if (pos(inv.capBateriaMax) && h.capInstalada > inv.capBateriaMax * nI + 1e-9) {
          alerta('aviso', 'Banco de ' + U.fmtSmart(h.capInstalada, 2) + ' kWh acima da capacidade máxima de bateria do inversor (' + U.fmtSmart(inv.capBateriaMax * nI, 2) + ' kWh).');
        }
        const picoBat = h.bateria && pos(h.bateria.picoKW) ? h.bateria.picoKW * h.nBaterias : null;
        if (picoBat && h.picoPartida > picoBat * 1000 + 1e-6) {
          alerta('aviso', 'Pico de partida estimado (' + U.fmtSmart(h.picoPartida / 1000, 2) + ' kW) acima da potência de pico do banco de baterias (' + U.fmtSmart(picoBat, 2) + ' kW).');
        }
        if (pos(inv.surtoKW) && h.picoPartida > inv.surtoKW * nI * 1000 + 1e-6) {
          alerta('aviso', 'Pico de partida estimado (' + U.fmtSmart(h.picoPartida / 1000, 2) + ' kW, motor partindo a ' + U.fmtSmart(prem.hibrido.fatorPartida, 1) +
            '× com as demais cargas ligadas) acima do surto do inversor (' + U.fmtSmart(inv.surtoKW * nI, 2) + ' kW).');
        }
      }
      h.nBackupAuto = unid ? dimensionar('backup', {}) : 0;
      r.balanco = temArm && (escolhido.id === 'ponta' || escolhido.id === 'picos') ? C.balancoBanco(r, escolhido, prem) : null;
      const b = r.balanco;
      if (b && b.utilizacao + 1e-9 < prem.hibrido.utilizacaoMin) {
        const excedeBackup = h.nBaterias > h.nBackupAuto;
        let msg = 'Na ciclagem o banco usa ' + U.fmt(b.utilizacao * 100, 0) + '% da capacidade disponível' + (b.mes != null ? ' no mês de menor geração (' + C.MESES_CURTOS[b.mes] + ')' : '') +
          ' — mínimo recomendado ' + U.fmt(prem.hibrido.utilizacaoMin * 100, 0) + '%. ';
        msg += b.motivo || 'Banco maior que a energia ciclada';
        if (b.modulosParaEncher) msg += ': seriam ' + b.modulosParaEncher + ' módulos para enchê-lo.';
        else if (excedeBackup && b.bateriasIdeais && b.bateriasIdeais < h.nBaterias) msg += ': bastam ' + b.bateriasIdeais + ' bateria(s).';
        else msg += '.';
        if (!excedeBackup) msg += ' O banco é definido pelo backup; mais baterias não aumentam a economia.';
        alerta(excedeBackup ? 'aviso' : 'info', msg);
      }
      if (b && b.potenciaCargaKW && r.hibridoAtivo && inv && h.pCargaInv && b.potenciaCargaKW > h.pCargaInv * Math.max(1, nInv) + 1e-9) {
        alerta('aviso', 'Recarregar ' + U.fmtSmart(b.cargaDia, 1) + ' kWh por dia exige cerca de ' + U.fmtSmart(b.potenciaCargaKW, 2) + ' kW de carga, acima da potência de bateria do inversor (' +
          U.fmtSmart(h.pCargaInv * Math.max(1, nInv), 2) + ' kW).');
      }
      if (b && b.potenciaCargaKW && unid && unid.potenciaCarga && b.potenciaCargaKW > unid.potenciaCarga * h.nBaterias + 1e-9) {
        alerta('aviso', 'Recarregar ' + U.fmtSmart(b.cargaDia, 1) + ' kWh por dia exige cerca de ' + U.fmtSmart(b.potenciaCargaKW, 2) + ' kW, acima da corrente de carga das baterias (' +
          U.fmtSmart(unid.potenciaCarga * h.nBaterias, 2) + ' kW no banco).');
      }
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
    if (!r.incluiFV) { r.kit = 0; r.infra = 0; r.maoObra = 0; r.outros = 0; r.comissao = 0; r.maoObraLiquida = 0; r.instalacao = 0; }
    if (r.precoMargem && escolhido) {
      r.lucro = escolhido.lucro || 0;
      r.comissao = escolhido.comissao || 0;
      // sem sistema FV no cenário, lucro e comissão entram na instalação do armazenamento
      if (r.incluiFV) r.maoObra = r.instalacao + r.lucro + r.comissao;
      else r.instalArm += r.lucro + r.comissao;
    }
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

    // faixa da conta com sistema no ano 1 (sazonalidade da geração e do consumo, créditos transportados)
    r.contasMes = null;
    const cm = escolhido && escolhido.fin && escolhido.fin.contasMes1;
    if (cm) {
      let iMin = 0, iMax = 0;
      cm.forEach(function (v, i) { if (v < cm[iMin]) iMin = i; if (v > cm[iMax]) iMax = i; });
      r.contasMes = { valores: cm, min: cm[iMin], mesMin: iMin, max: cm[iMax], mesMax: iMax, media: cm.reduce(function (s, x) { return s + x; }, 0) / 12 };
    }

    // 2ª passada do dimensionamento: consumo próprio do inversor escolhido e perdas do ciclo do cenário detalhado
    if (!p._dimExtra && r.hibridoAtivo && r.permiteFV) {
      const a1 = escolhido && escolhido.fin ? escolhido.fin.anos[0] : null;
      const cicla = escolhido && (escolhido.id === 'ponta' || escolhido.id === 'picos') && escolhido.n > 0;
      const perdas = cicla && a1 && h ? a1.descarga / 12 * (1 / h.eficiencia - 1) : 0;
      if (Math.abs(r.consumoProprio - dimExtra.proprio) > 0.01 || perdas > 0.01) {
        return C.calcular(Object.assign({}, p, { _dimExtra: { proprio: r.consumoProprio, perdas: perdas } }), ctx);
      }
    }

    // portfólio: projetos realizados exibidos após a apresentação da empresa
    r.projetos = C.projetosProposta(p, r, ctx);
    const nProj = Math.max(0, parseInt(U.numOr(ctx.empresa && ctx.empresa.projetosNaProposta, 4), 10) || 0);
    if (nProj && p.incluirProjetos !== false && r.projetos.length < nProj) {
      alerta('info', (r.projetos.length ? 'A proposta mostra ' + r.projetos.length + ' projeto(s) realizado(s); recomendado: ' + nProj + '. '
        : 'A seção de projetos realizados ficará fora da proposta. ') + 'Cadastre obras concluídas com 2 fotos em Cadastros › Projetos realizados.');
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

  C.DIAS_MES = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  /**
   * Balanço diário do banco num cenário que cicla a bateria (energia entregue por dia ÷ capacidade disponível acima da
   * reserva de backup = fator de utilização).
   * Tarifa convencional (recarga só pelo excedente solar): no mês de menor geração, compara excedente solar, carga do
   * banco e consumo noturno, e indica os módulos que encheriam o banco (até o limite do consumo noturno).
   * Tarifas horárias e grupo A (recarga também pela rede): usa a energia ciclada no ano 1 por dia útil.
   */
  C.balancoBanco = function (r, cen, prem) {
    const h = r.hibrido, u = r.unidadeArm;
    const eta = h.eficiencia;
    const capCiclo = Math.max(0, cen.capUtil - h.reservaUtil);
    const entregaMax = capCiclo * eta;
    const b = { mes: null, capCiclo: capCiclo, entregaMaxDia: entregaMax, reservaUtil: h.reservaUtil };
    const bateriasPara = function (entregaDia) {
      const serie = h.serie || 1;
      const n = Math.ceil(((h.reservaUtil + entregaDia / eta) / h.dod) / u.energia - 1e-9);
      return Math.max(h.nBackupAuto || 1, Math.ceil(Math.max(1, n) / serie - 1e-9) * serie);
    };
    if (!(entregaMax > 0)) {
      return Object.assign(b, { entregueDia: 0, cargaDia: 0, utilizacao: 0, limitante: 'reserva', motivo: 'Toda a capacidade útil está reservada para o backup.' });
    }
    if (r.modalidade.id === 'conv') {
      const f = r.fatores;
      const somaF = f.reduce(function (x, y) { return x + y; }, 0);
      let iMin = 0;
      f.forEach(function (x, i) { if (x < f[iMin]) iMin = i; });
      const dias = C.DIAS_MES[iMin];
      const gerDia = cen.incluirFV ? r.geracaoAnual * f[iMin] / somaF / dias : 0;
      const consDia = (r.consumoMeses[iMin] + r.consumoProprio) / dias;
      const instDia = Math.min(r.simultaneidade * gerDia, consDia);
      const excedente = gerDia - instDia, noturno = consDia - instDia;
      const entregue = Math.max(0, Math.min(entregaMax, excedente * eta, noturno));
      const limitante = entregue >= entregaMax - 1e-9 ? 'banco' : (excedente * eta <= noturno ? 'excedente' : 'consumo');
      Object.assign(b, {
        mes: iMin, geracaoDia: gerDia, consumoDia: consDia, excedenteDia: excedente, noturnoDia: noturno,
        entregueDia: entregue, cargaDia: entregue / eta, utilizacao: entregue / entregaMax, limitante: limitante,
        // potência média de carga para recarregar o banco nas horas de sol pleno equivalentes do mês (HSP do mês)
        potenciaCargaKW: r.hsp > 0 ? (entregue / eta) / (r.hsp * f[iMin] / (somaF / 12)) : null
      });
      if (limitante === 'excedente') {
        b.motivo = 'Falta excedente solar para recarregá-lo';
        // energia ciclável com G kWh/dia de geração: E = (1 − s)·η·G, limitada pelo consumo noturno (cons − s·G);
        // o máximo, com o FV ideal, é a·cons ÷ (a + s), com a = (1 − s)·η
        const a = (1 - r.simultaneidade) * eta;
        if (a > 0 && r.modulo && r.kwp > 0 && gerDia > 0) {
          const maxCiclavel = a * consDia / (a + r.simultaneidade);
          b.maxCiclavelDia = maxCiclavel;
          if (maxCiclavel >= entregaMax * prem.hibrido.utilizacaoMin) {
            const nMod = Math.ceil((Math.min(entregaMax, maxCiclavel) / a) / (gerDia / r.kwp) * 1000 / r.modulo.potencia - 1e-9);
            if (nMod > r.nModulos) b.modulosParaEncher = nMod;
          } else {
            // nem com mais módulos o consumo noturno absorve o banco: o problema é o tamanho do banco
            b.motivo = 'Mesmo com mais módulos, o consumo noturno só absorve ' + U.fmtSmart(maxCiclavel, 1) + ' kWh/dia';
            b.bateriasIdeais = bateriasPara(maxCiclavel);
          }
        }
      } else if (limitante === 'consumo') {
        b.motivo = 'O consumo noturno não absorve mais energia';
        b.bateriasIdeais = bateriasPara(entregue);
      }
      return b;
    }
    const diasCiclo = prem.armazenamento.diasUteis;
    const entregue = cen.fin.kwhDeslocadosAno1 / diasCiclo;
    Object.assign(b, { entregueDia: entregue, cargaDia: entregue / eta, utilizacao: entregue / entregaMax });
    if (entregue >= entregaMax - 1e-9) b.limitante = 'banco';
    else if (cen.id === 'picos') { b.limitante = 'demanda'; b.motivo = 'A redução de demanda pedida usa só parte do banco'; b.bateriasIdeais = bateriasPara(entregue); }
    else {
      const consPontaDia = r.consumoPostos.p * 12 / diasCiclo;
      const pot = cen.potencia * prem.armazenamento.duracaoPonta;
      if (pot + 1e-9 < Math.min(entregaMax, consPontaDia)) { b.limitante = 'potencia'; b.motivo = 'Limitado pela potência de descarga na ponta'; }
      else { b.limitante = 'consumo'; b.motivo = 'O consumo na ponta não absorve mais energia'; b.bateriasIdeais = bateriasPara(entregue); }
    }
    return b;
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
      infraValor: '',
      infraDescricao: ctx.textos.infraDescricao,
      precificacao: 'margem',
      instalacaoFaixa: 1,
      lucroModo: 'pct',
      lucroPct: (ctx.premissas.preco || D.premissas.preco).lucroPct,
      lucroValor: '',
      comissaoPct: (ctx.premissas.preco || D.premissas.preco).comissaoPct,
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
      incluirProjetos: true,
      _seq: num
    };
  };

  App.Calc = C;
})(window.App);
