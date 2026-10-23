/*
 * Motor energético: tarifas dos grupos A e B (convencional, branca, verde e azul), conta mensal,
 * efeito da geração solar (autoconsumo + compensação, Lei 14.300) e do armazenamento (backup,
 * deslocamento para horários estratégicos e redução de picos de demanda), fluxo de caixa e indicadores.
 */
window.App = window.App || {};

(function (App) {
  'use strict';

  const U = App.U;
  const E = {};

  E.MODALIDADES = [
    { id: 'conv', grupo: 'B', label: 'Convencional', curto: 'Convencional' },
    { id: 'branca', grupo: 'B', label: 'Tarifa Branca', curto: 'Branca' },
    { id: 'verde', grupo: 'A', label: 'Horossazonal Verde', curto: 'Verde' },
    { id: 'azul', grupo: 'A', label: 'Horossazonal Azul', curto: 'Azul' }
  ];

  E.CENARIOS = [
    { id: 'solar', nome: 'Geração solar', curto: 'Solar', armazenamento: false,
      descricao: 'Somente o sistema fotovoltaico: autoconsumo e compensação de créditos.' },
    { id: 'backup', nome: 'Backup', curto: 'Backup', armazenamento: true,
      descricao: 'Baterias reservadas para manter as cargas críticas durante falta de energia.' },
    { id: 'ponta', nome: 'Horários estratégicos', curto: 'Horários estratégicos', armazenamento: true,
      descricao: 'Baterias carregam fora da ponta (ou com o excedente solar) e descarregam nos horários de tarifa mais cara.' },
    { id: 'picos', nome: 'Redução de picos', curto: 'Redução de picos', armazenamento: true,
      descricao: 'Baterias cortam os picos de demanda, reduzindo a demanda faturada e as multas de ultrapassagem.' }
  ];

  E.modalidade = function (id) {
    return E.MODALIDADES.find(function (m) { return m.id === id; }) || E.MODALIDADES[0];
  };

  E.cenario = function (id) {
    return E.CENARIOS.find(function (c) { return c.id === id; }) || E.CENARIOS[0];
  };

  /** Nome e descrição do cenário conforme a modalidade: sem tarifa horária, "ponta" é a ciclagem diária do banco do backup. */
  E.rotuloCenario = function (def, modalidadeId) {
    if (def.id === 'ponta' && (modalidadeId || 'conv') === 'conv') {
      return { nome: 'Backup + ciclagem diária', curto: 'Ciclagem diária',
        descricao: 'O mesmo banco do backup guarda o excedente solar do dia para uso à noite, mantendo a reserva para falta de energia.' };
    }
    return { nome: def.nome, curto: def.curto, descricao: def.descricao };
  };

  function pos(v) {
    const n = U.num(v);
    return isFinite(n) && n > 0 ? n : null;
  }

  function num0(v) {
    const n = U.num(v);
    return isFinite(n) ? n : 0;
  }

  /* ------------------------------------------------------------ tarifas */

  /**
   * Resolve as tarifas da proposta (valores informados na proposta têm prioridade sobre a concessionária).
   * Valores com impostos, em R$/kWh (energia) e R$/kW (demanda).
   */
  E.tarifas = function (p, conc, classeTarifa) {
    const mod = E.modalidade(p.modalidade || 'conv');
    const c = conc || {};
    const br = c.branca || {}, vd = c.verde || {}, az = c.azul || {};
    const t = { grupo: mod.grupo, modalidade: mod.id, faltando: [] };
    const exigir = function (v, nome) { if (!(v > 0)) t.faltando.push(nome); return v || 0; };
    if (mod.id === 'conv') {
      t.conv = exigir(pos(p.tarifa) || (c.tarifas && pos(c.tarifas[classeTarifa || 'B1'])), 'tarifa (R$/kWh)');
      t.ponta = t.inter = t.fp = t.conv;
    } else if (mod.id === 'branca') {
      t.ponta = exigir(pos(p.tarifaPonta) || pos(br.ponta), 'tarifa branca de ponta');
      t.inter = exigir(pos(p.tarifaIntermediario) || pos(br.intermediario), 'tarifa branca intermediária');
      t.fp = exigir(pos(p.tarifaForaPonta) || pos(br.foraPonta), 'tarifa branca fora de ponta');
    } else {
      const src = mod.id === 'verde' ? vd : az;
      t.ponta = exigir(pos(p.tarifaPonta) || pos(src.ponta), 'tarifa de energia na ponta');
      t.fp = exigir(pos(p.tarifaForaPonta) || pos(src.foraPonta), 'tarifa de energia fora de ponta');
      t.inter = t.fp;
      if (mod.id === 'verde') {
        t.dem = exigir(pos(p.tarifaDemanda) || pos(vd.demanda), 'tarifa de demanda (R$/kW)');
      } else {
        t.demP = exigir(pos(p.tarifaDemandaPonta) || pos(az.demandaPonta), 'tarifa de demanda na ponta (R$/kW)');
        t.demFP = exigir(pos(p.tarifaDemandaFP) || pos(az.demandaForaPonta), 'tarifa de demanda fora de ponta (R$/kW)');
      }
    }
    t.referencia = mod.id === 'conv' ? t.conv : t.fp;
    return t;
  };

  E.reajustar = function (t, f) {
    const o = Object.assign({}, t);
    ['conv', 'ponta', 'inter', 'fp', 'dem', 'demP', 'demFP', 'referencia'].forEach(function (k) {
      if (typeof o[k] === 'number') o[k] = o[k] * f;
    });
    return o;
  };

  /** Consumo mensal médio por posto horário. Convencional: tudo em "fp". */
  E.consumo = function (p, consumoMedio) {
    const mod = E.modalidade(p.modalidade || 'conv');
    if (mod.id === 'conv') return { p: 0, i: 0, fp: consumoMedio, total: consumoMedio };
    const cp = num0(p.consumoPonta), ci = mod.id === 'branca' ? num0(p.consumoIntermediario) : 0, cf = num0(p.consumoForaPonta);
    return { p: cp, i: ci, fp: cf, total: cp + ci + cf };
  };

  /** Demanda contratada e medida (kW). Medida em branco = igual à contratada. */
  E.demanda = function (p) {
    const mod = E.modalidade(p.modalidade || 'conv');
    if (mod.grupo !== 'A') return null;
    if (mod.id === 'verde') {
      const contr = num0(p.demandaContratada);
      return { contr: contr, med: pos(p.demandaMedida) || contr };
    }
    const cP = num0(p.demandaContratadaPonta), cF = num0(p.demandaContratadaFP);
    return { contrP: cP, medP: pos(p.demandaMedidaPonta) || cP, contrFP: cF, medFP: pos(p.demandaMedidaFP) || cF };
  };

  function custoDemanda(contr, med, tarifa, prem) {
    const tol = prem.armazenamento.toleranciaUltrapassagem;
    const fat = Math.max(contr, med);
    const ultrap = med > contr * (1 + tol) ? (med - contr) * tarifa * prem.armazenamento.fatorUltrapassagem : 0;
    return { faturada: fat, custo: fat * tarifa, ultrapassagem: ultrap };
  }

  /**
   * Conta mensal média.
   * c: {p, i, fp} kWh faturáveis (já descontada a energia compensada); d: demanda;
   * ex: {cosip, disp (kWh, só grupo B), compensada (kWh), fioBTarifa (R$/kWh = TUSD Fio B × % do ano), regra}
   *
   * Grupo B no SCEE (REN ANEEL 1.000/2021, art. 655-I, § 1º, na redação das REN 1.059/2023 e 1.098/2024):
   * a parcela de energia é o MAIOR valor entre o custo de disponibilidade (art. 291) e a energia não compensada
   * somada ao Fio B da energia compensada — os dois não se somam. O autoconsumo simultâneo não passa pelo
   * medidor, não é compensado e não paga Fio B.
   * regra 'disponibilidade' (leitura de algumas distribuidoras): os kWh do custo de disponibilidade são faturados
   * pela tarifa cheia e o Fio B incide só sobre o restante da energia compensada.
   */
  E.conta = function (t, c, d, ex, prem) {
    const disp = t.grupo === 'B' ? (ex.disp || 0) : 0;
    const tDisp = t.modalidade === 'conv' ? t.conv : t.fp;
    const comp = ex.compensada || 0;
    const tFioB = ex.fioBTarifa || 0;
    let energia = t.modalidade === 'conv' ? c.fp * t.conv : c.p * t.ponta + c.i * t.inter + c.fp * t.fp;
    let kwh = c.p + c.i + c.fp;
    const energiaNaoComp = energia;
    const fioBCalc = comp * tFioB;
    const custoDisp = disp * tDisp;
    let fioB = fioBCalc, minimo = false;
    if (disp > 0 && comp > 0 && ex.regra !== 'disponibilidade') {
      // fioB = acréscimo efetivo do Fio B sobre o maior valor sem ele (zero quando prevalece a disponibilidade)
      const base = Math.max(custoDisp, energia);
      minimo = custoDisp > energia + fioBCalc;
      fioB = Math.max(custoDisp, energia + fioBCalc) - base;
      energia = base;
      if (minimo) kwh = Math.max(kwh, disp);
    } else if (kwh < disp) {
      // custo de disponibilidade (art. 291): os kWh que faltam saem da energia compensada e não pagam Fio B
      const falta = disp - kwh;
      energia += falta * tDisp;
      fioB = Math.max(0, comp - falta) * tFioB;
      kwh = disp;
      minimo = true;
    }
    let demanda = 0, ultrap = 0, faturada = null;
    if (t.modalidade === 'verde' && d) {
      const x = custoDemanda(d.contr, d.med, t.dem, prem);
      demanda = x.custo; ultrap = x.ultrapassagem; faturada = { unica: x.faturada };
    } else if (t.modalidade === 'azul' && d) {
      const xp = custoDemanda(d.contrP, d.medP, t.demP, prem);
      const xf = custoDemanda(d.contrFP, d.medFP, t.demFP, prem);
      demanda = xp.custo + xf.custo; ultrap = xp.ultrapassagem + xf.ultrapassagem; faturada = { p: xp.faturada, fp: xf.faturada };
    }
    const cosip = ex.cosip || 0;
    return {
      energia: energia, kwhFaturado: kwh, demanda: demanda, ultrapassagem: ultrap, demandaFaturada: faturada,
      fioB: fioB, fioBCalculado: fioBCalc, energiaNaoCompensada: energiaNaoComp, custoDisponibilidade: custoDisp, minimo: minimo,
      cosip: cosip, total: energia + demanda + ultrap + fioB + cosip
    };
  };

  /**
   * Compensação: os créditos (kWh fora de ponta) abatem primeiro o fora de ponta; o saldo, valorado pela tarifa
   * fora de ponta, abate intermediário e ponta. Altera `c` e devolve os créditos que sobram.
   */
  function compensar(t, c, cred) {
    const cf = Math.min(cred, c.fp);
    c.fp -= cf; cred -= cf;
    if (cred > 0 && t.modalidade !== 'conv') {
      let valor = cred * t.fp;
      const ci = Math.min(c.i, valor / t.inter);
      c.i -= ci; valor -= ci * t.inter;
      const cp = Math.min(c.p, valor / t.ponta);
      c.p -= cp; valor -= cp * t.ponta;
      cred = valor / t.fp;
    }
    return cred;
  }

  /** Consumo contínuo de 24 h (ex.: consumo próprio do inversor híbrido) rateado pelos postos horários. */
  E.ratear = function (kwh, modalidadeId, prem) {
    if (!(kwh > 0)) return { p: 0, i: 0, fp: 0 };
    if ((modalidadeId || 'conv') === 'conv') return { p: 0, i: 0, fp: kwh };
    const ar = prem.armazenamento;
    const util = ar.diasUteis / 365;
    const p = kwh * ar.duracaoPonta / 24 * util;
    const i = modalidadeId === 'branca' ? kwh * 2 / 24 * util : 0; // intermediário: 1 h antes e 1 h depois da ponta
    return { p: p, i: i, fp: kwh - p - i };
  };

  const DIAS_MES = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  /**
   * Contas do ano 1 mês a mês: geração pelos fatores mensais da localidade, consumo pelo perfil mensal do cliente
   * e créditos transportados entre os meses (a 1ª volta forma o saldo de regime; devolve a 2ª).
   */
  function contasMensais(t, o, cCliente, cExtra, armMes, ger, ex, prem) {
    const f = o.fatores;
    const somaF = f.reduce(function (s, x) { return s + x; }, 0);
    let banco = 0, contas = [];
    for (let volta = 0; volta < 2; volta++) {
      contas = [];
      for (let m = 0; m < 12; m++) {
        const k = o.consumoFatores ? o.consumoFatores[m] : 1;
        const c = { p: cCliente.p * k + cExtra.p, i: cCliente.i * k + cExtra.i, fp: cCliente.fp * k + cExtra.fp };
        const esc = DIAS_MES[m] / (365 / 12);
        const arm = armMes ? Object.assign({}, armMes, {
          descNoite: (armMes.descNoite || 0) * esc, descPonta: (armMes.descPonta || 0) * esc, descForaPonta: (armMes.descForaPonta || 0) * esc
        }) : null;
        const G = ger * f[m] / somaF;
        const ap = E.aplicar(t, c, o.demanda, G > 0 ? { G: G, s: o.s } : null, arm);
        const antes = banco;
        banco = compensar(t, ap.c, banco);
        const usado = antes - banco;
        banco += ap.creditoSobra;
        contas.push(E.conta(t, ap.c, ap.d, Object.assign({}, ex, { compensada: ap.compensada + usado }), prem).total);
      }
    }
    return contas;
  }

  /**
   * Aplica geração solar e armazenamento sobre o consumo do mês.
   * sol: {G kWh/mês, s simultaneidade}
   * arm: {descPonta, descNoite (kWh entregues/mês), eta, reducao: {unica|p|fp kW}, readequar}
   */
  E.aplicar = function (t, c0, d0, sol, arm) {
    const c = { p: c0.p, i: c0.i, fp: c0.fp };
    const G = sol ? sol.G : 0;
    const sc = Math.min((sol ? sol.s : 0) * G, c.fp);
    c.fp -= sc;
    let inj = G - sc;
    let descarga = 0, carga = 0, cargaRede = 0;
    if (arm) {
      const dP = Math.min(arm.descPonta || 0, c.p);
      c.p -= dP;
      // sem tarifa horária, a descarga noturna só faz sentido com excedente solar armazenado
      const dN = Math.min(arm.descNoite || 0, c.fp, inj * arm.eta);
      c.fp -= dN;
      const dF = Math.min(arm.descForaPonta || 0, c.fp);
      c.fp -= dF;
      descarga = dP + dN + dF;
      carga = descarga / arm.eta;
      const cs = Math.min(carga, inj);
      inj -= cs;
      cargaRede = carga - cs;
      c.fp += cargaRede;
    }
    const cred = compensar(t, c, inj);
    let d = d0 ? Object.assign({}, d0) : null;
    if (d && arm && arm.reducao) {
      const red = arm.reducao;
      if (t.modalidade === 'verde' && red.unica) {
        d.med = Math.max(0, d.med - red.unica);
        if (arm.readequar) d.contr = Math.max(d.med, d.contr - red.unica);
      } else if (t.modalidade === 'azul') {
        if (red.p) { d.medP = Math.max(0, d.medP - red.p); if (arm.readequar) d.contrP = Math.max(d.medP, d.contrP - red.p); }
        if (red.fp) { d.medFP = Math.max(0, d.medFP - red.fp); if (arm.readequar) d.contrFP = Math.max(d.medFP, d.contrFP - red.fp); }
      }
    }
    return { c: c, d: d, injetada: inj, compensada: inj - cred, autoconsumo: sc, descarga: descarga, carga: carga, cargaRede: cargaRede, creditoSobra: cred };
  };

  /* ------------------------------------------------------------ indicadores */

  E.indicadores = function (investimento, liqs, i) {
    const descs = liqs.map(function (x, k) { return x / Math.pow(1 + i, k + 1); });
    function payback(fluxos) {
      let acc = 0;
      for (let k = 0; k < fluxos.length; k++) {
        const e = fluxos[k];
        if (e > 0 && acc + e >= investimento) return k + (investimento - acc) / e;
        acc += e;
      }
      return null;
    }
    function npv(r) {
      let s = -investimento;
      for (let k = 0; k < liqs.length; k++) s += liqs[k] / Math.pow(1 + r, k + 1);
      return s;
    }
    let tir = null;
    if (investimento > 0 && npv(10) <= 0 && npv(-0.99) >= 0) {
      let lo = -0.99, hi = 10;
      for (let k = 0; k < 200; k++) {
        const mid = (lo + hi) / 2;
        if (npv(mid) > 0) lo = mid; else hi = mid;
      }
      tir = (lo + hi) / 2;
    }
    return {
      descontados: descs,
      paybackSimples: investimento > 0 ? payback(liqs) : 0,
      paybackDescontado: investimento > 0 ? payback(descs) : 0,
      vpl: -investimento + descs.reduce(function (s, x) { return s + x; }, 0),
      tir: tir,
      tirAcima: investimento > 0 && tir == null && npv(10) > 0
    };
  };

  /* ------------------------------------------------------------ fluxo de caixa */

  /**
   * Fluxo de caixa anual de um cenário.
   * o: {prem, anoBase, investimento, tarifas, consumo {p,i,fp}, demanda, disp, cosip, tusd, s, geracaoAnual1,
   *     estrategia: null|'backup'|'ponta'|'picos', arm: {capUtil, potencia, eta, degradacao, vida, custoTroca,
   *     reducaoKW, duracao, posto, readequar, reserva (kWh úteis guardados para o backup)}, beneficioBackup (R$/ano),
   *     consumoProprio (kWh/mês do inversor híbrido, só na conta com sistema),
   *     fatores (12 fatores mensais de geração) e consumoFatores (consumo do mês ÷ média) para as contas mensais do ano 1}
   */
  E.fluxo = function (o) {
    const prem = o.prem;
    const ar = prem.armazenamento;
    const H = Math.max(1, parseInt(prem.horizonte, 10) || 25);
    const t0 = o.tarifas;
    const anos = [];
    let acum = -o.investimento, somaLiq = 0, somaGer = 0, kwhDesloc1 = 0, red1 = 0;
    const c0 = o.consumo;
    // com sistema: o consumo próprio do inversor híbrido (24 h) soma-se ao consumo do cliente
    const cExtra = E.ratear(o.consumoProprio || 0, t0.modalidade, prem);
    const cCom = { p: c0.p + cExtra.p, i: c0.i + cExtra.i, fp: c0.fp + cExtra.fp };
    let idade = 0, contasMes1 = null;
    for (let n = 1; n <= H; n++) {
      const ano = o.anoBase + n - 1;
      const fT = Math.pow(1 + prem.inflacaoTarifa, n - 1);
      const t = E.reajustar(t0, fT);
      const cosip = o.cosip * Math.pow(1 + prem.reajusteCosip, n - 1);
      const tusd = o.tusd * (prem.reajustarTusd ? fT : 1);
      const ger = o.geracaoAnual1 * Math.pow(1 - prem.degradacao, n - 1);
      const gm = ger / 12;
      const pct = App.Calc.pctFioB(ano, prem);
      const sem = E.conta(t, c0, o.demanda, { cosip: cosip, disp: o.disp }, prem);

      // armazenamento: capacidade com degradação e substituição ao fim da vida útil
      let extra = 0, armMes = null, reducaoKW = 0;
      if (o.estrategia && o.arm && o.arm.capUtil > 0) {
        if (idade >= o.arm.vida) { idade = 0; extra = o.arm.custoTroca; }
        const cap = o.arm.capUtil * Math.pow(1 - (o.arm.degradacao || 0), idade);
        idade += 1;
        // a reserva para as cargas críticas (SOC de backup) fica fora da ciclagem e do corte de picos
        const capCiclo = Math.max(0, cap - (o.arm.reserva || 0));
        const eta = o.arm.eta;
        const diasUteis = ar.diasUteis;
        if (o.estrategia === 'ponta') {
          if (t.modalidade === 'conv') {
            armMes = { eta: eta, descNoite: capCiclo * eta * 365 / 12 };
          } else {
            const lim = Math.min(capCiclo * eta, o.arm.potencia * ar.duracaoPonta) * diasUteis / 12;
            armMes = { eta: eta, descPonta: lim };
          }
        } else if (o.estrategia === 'picos' && t.grupo === 'A') {
          const dur = o.arm.duracao || ar.duracaoPonta;
          reducaoKW = Math.max(0, Math.min(o.arm.reducaoKW || 0, o.arm.potencia, (capCiclo * eta) / dur));
          const energia = reducaoKW * dur * diasUteis / 12;
          const posto = t.modalidade === 'verde' ? (o.arm.posto || 'foraPonta') : (o.arm.posto || 'ponta');
          armMes = { eta: eta, readequar: o.arm.readequar !== false };
          if (t.modalidade === 'verde') armMes.reducao = { unica: reducaoKW };
          else armMes.reducao = posto === 'ponta' ? { p: reducaoKW } : { fp: reducaoKW };
          if (posto === 'ponta') armMes.descPonta = energia; else armMes.descForaPonta = energia;
        }
      }
      const ap = E.aplicar(t, cCom, o.demanda, gm > 0 ? { G: gm, s: o.s } : null, armMes);
      const exCom = { cosip: cosip, disp: o.disp, fioBTarifa: tusd * pct, regra: prem.regraDisponibilidade };
      const com = E.conta(t, ap.c, ap.d, Object.assign({ compensada: ap.compensada }, exCom), prem);
      if (n === 1 && Array.isArray(o.fatores) && o.fatores.length === 12) contasMes1 = contasMensais(t, o, c0, cExtra, armMes, ger, exCom, prem);
      const fioBMes = com.fioB;
      const economiaMes = sem.total - com.total;
      const backup = o.estrategia === 'backup' ? (o.beneficioBackup || 0) : 0;
      const bruta = (sem.total - (com.total - fioBMes)) * 12 + backup;
      const liq = bruta - fioBMes * 12 - extra;
      if (n === 1) { kwhDesloc1 = ap.descarga * 12; red1 = reducaoKW; }
      acum += liq; somaLiq += liq; somaGer += ger;
      anos.push({
        n: n, ano: ano, geracao: ger, tarifa: t.referencia, cosip: cosip, pctFioB: pct, injetada: ap.injetada * 12, compensada: ap.compensada * 12,
        fioB: fioBMes * 12, fioBMes: fioBMes, fioBCalcMes: com.fioBCalculado, faturada: com.kwhFaturado,
        custoDisp: com.custoDisponibilidade, energiaGD: com.energiaNaoCompensada + com.fioBCalculado, minimo: com.minimo,
        contaSem: sem.total, contaMin: com.energia, demandaCom: com.demanda + com.ultrapassagem, demandaSem: sem.demanda + sem.ultrapassagem,
        contaCom: com.total, economiaMes: economiaMes, beneficioBackup: backup, descarga: ap.descarga * 12, reducaoKW: reducaoKW,
        bruta: bruta, extra: extra, liq: liq, acumulado: acum
      });
    }
    const ind = E.indicadores(o.investimento, anos.map(function (a) { return a.liq; }), prem.tma);
    anos.forEach(function (a, k) { a.descontado = ind.descontados[k]; });
    return {
      anos: anos,
      horizonte: H,
      economiaMes1: anos[0].economiaMes,
      economiaAno1: anos[0].economiaMes * 12, // só a conta de energia (sem o benefício de backup)
      beneficioAno1: anos[0].liq + anos[0].extra,
      paybackSimples: ind.paybackSimples,
      paybackDescontado: ind.paybackDescontado,
      vpl: ind.vpl,
      tir: ind.tir,
      tirAcima: ind.tirAcima,
      co2t: (somaGer / H) * prem.fatorCO2 * H / 1000,
      economiaTotal: somaLiq,
      kwhDeslocadosAno1: kwhDesloc1,
      reducaoKW1: red1,
      contasMes1: contasMes1,
      projecao: anos.filter(function (a) { return a.n <= 6 || a.n % 5 === 0; })
    };
  };

  /* ------------------------------------------------------------ recomendação */

  /**
   * Escolhe o cenário que faz mais sentido para o cliente, conforme o objetivo informado.
   * objetivo: 'economia' | 'backup' | 'demanda'
   */
  E.recomendar = function (cenarios, objetivo, ctxTexto) {
    const validos = cenarios.filter(function (c) { return c.aplicavel && c.investimento > 0; });
    if (!validos.length) return null;
    const porVpl = validos.slice().sort(function (a, b) { return (b.fin.vpl - a.fin.vpl) || (a.investimento - b.investimento); });
    let escolhido = porVpl[0];
    let motivoObjetivo = null;
    const achar = function (id) { return validos.find(function (c) { return c.id === id; }); };
    if (objetivo === 'backup') {
      const b = achar('backup') || validos.filter(function (c) { return c.n > 0; }).sort(function (a, b2) { return b2.fin.vpl - a.fin.vpl; })[0];
      if (b) { escolhido = b; motivoObjetivo = 'Atende ao objetivo principal do cliente: manter as cargas críticas funcionando durante falta de energia.'; }
    } else if (objetivo === 'demanda') {
      const pk = achar('picos');
      if (pk && pk.fin.reducaoKW1 > 0) { escolhido = pk; motivoObjetivo = 'Atende ao objetivo principal do cliente: reduzir a demanda faturada e as multas de ultrapassagem.'; }
    }
    const motivos = [];
    if (motivoObjetivo) motivos.push(motivoObjetivo);
    if (escolhido === porVpl[0]) {
      motivos.push('Maior VPL entre as alternativas avaliadas (' + U.brl(escolhido.fin.vpl) + ' em ' + escolhido.fin.horizonte + ' anos).');
    } else {
      motivos.push('VPL de ' + U.brl(escolhido.fin.vpl) + ' — o cenário "' + porVpl[0].nome + '" tem VPL maior (' + U.brl(porVpl[0].fin.vpl) +
        '), mas não atende ao objetivo principal com a mesma eficácia.');
    }
    motivos.push('Investimento de ' + U.brl(escolhido.investimento) + ', payback simples de ' + U.anosMeses(escolhido.fin.paybackSimples) +
      (escolhido.fin.tir != null ? ' e TIR de ' + U.fmt(escolhido.fin.tir * 100, 1) + '% a.a.' : '.'));
    const tx = ctxTexto || {};
    if (escolhido.id === 'solar') {
      motivos.push('Menor investimento e retorno mais rápido; não fornece energia durante quedas da rede.');
    } else if (escolhido.id === 'ponta') {
      if (tx.modalidade && tx.modalidade !== 'conv') {
        motivos.push('Desloca ' + U.fmt(escolhido.fin.kwhDeslocadosAno1, 0) + ' kWh/ano para o horário de ponta, onde a energia custa ' +
          U.brl(tx.ponta) + '/kWh contra ' + U.brl(tx.fp) + '/kWh fora de ponta.');
      } else {
        motivos.push('Armazena o excedente solar para uso noturno, reduzindo a energia injetada e o custo do Fio B.');
      }
    } else if (escolhido.id === 'picos') {
      motivos.push('Reduz ' + U.fmtSmart(escolhido.fin.reducaoKW1, 1) + ' kW de demanda, com economia direta na parcela de demanda da fatura.');
    } else if (escolhido.id === 'backup') {
      if (escolhido.metricas && escolhido.metricas.autonomiaH) motivos.push('Mantém as cargas críticas por cerca de ' + U.fmtSmart(escolhido.metricas.autonomiaH, 1) + ' h em falta de energia.');
    }
    const segundo = porVpl.find(function (c) { return c !== escolhido; });
    if (segundo && escolhido.fin.vpl >= segundo.fin.vpl + 1) {
      motivos.push('Supera a segunda melhor alternativa ("' + segundo.nome + '") em ' + U.brl(escolhido.fin.vpl - segundo.fin.vpl) + ' de VPL.');
    }
    return { id: escolhido.id, nome: escolhido.nome, motivos: motivos };
  };

  App.Energia = E;
})(window.App);
