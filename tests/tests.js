/*
 * Testes do motor de cálculo e do gerador .docx.
 * O cenário "referência" reproduz as premissas da proposta GE-20260929-012 (TUSD Fio B R$ 0,08, COSIP sem reajuste)
 * e confere geração, parcelas e materiais publicados naquele documento. A conta com sistema segue a REN ANEEL 1.000/2021,
 * art. 655-I (maior valor entre custo de disponibilidade e energia não compensada + Fio B sobre a energia compensada),
 * e por isso difere da publicada, que somava a disponibilidade e o Fio B sobre toda a energia injetada.
 */
(function () {
  'use strict';

  const U = App.U, C = App.Calc, D = App.DEFAULTS;
  const resultados = [];

  function ok(nome, cond, detalhe) {
    resultados.push({ nome: nome, ok: !!cond, detalhe: detalhe || '' });
  }

  function perto(nome, obtido, esperado, tol) {
    const t = tol == null ? 0.005 : tol;
    ok(nome, Math.abs(obtido - esperado) <= t, 'obtido ' + obtido + ' | esperado ' + esperado);
  }

  function igual(nome, obtido, esperado) {
    ok(nome, obtido === esperado, 'obtido "' + obtido + '" | esperado "' + esperado + '"');
  }

  function ctxReferencia() {
    const prem = U.clone(D.premissas);
    prem.reajusteCosip = 0;
    return {
      empresa: U.clone(D.empresa),
      premissas: prem,
      textos: U.clone(D.textos),
      equipamentos: U.clone(D.equipamentos.concat(window.EQUIP_TESTE)),
      concessionarias: [{ id: 'c1', nome: 'Energisa MS', uf: 'MS', tarifas: { B1: 0.9762, B2: 0.72, B3: 0.98 }, tusdFioB: 0.08 }],
      localidades: [Object.assign(U.clone(D.localidades[0]), { concessionariaId: 'c1' })],
      pagamentos: [
        { id: 'a', nome: 'À vista', tipo: 'avista', parcelas: 1, taxa: 0, ativo: true },
        { id: 'b', nome: 'Cartão', tipo: 'acrescimo', parcelas: 12, taxa: 0, ativo: true },
        { id: 'c', nome: 'Cartão 12x c/ juros', tipo: 'pmt', parcelas: 12, taxa: 0.02, ativo: true },
        { id: 'd', nome: 'BV', tipo: 'pmt', parcelas: 48, taxa: 0.027, ativo: true },
        { id: 'e', nome: 'BV', tipo: 'pmt', parcelas: 60, taxa: 0.027, ativo: true },
        { id: 'f', nome: 'BV', tipo: 'pmt', parcelas: 72, taxa: 0.027, ativo: true }
      ],
      clientes: [{ id: 'cli', nome: 'Cliente Exemplo', cidade: 'Corumbá', uf: 'MS' }]
    };
  }

  function propostaReferencia(ctx) {
    return {
      numero: 'GE-20260929-012', data: '2026-09-29', validadeDias: 5, tipoSistema: 'ongrid', clienteId: 'cli',
      localidadeId: 'corumba-ms', concessionariaId: 'c1', classe: 'Residencial B1', ligacao: 'bi', ligacaoConfirmar: true,
      tensao: '220 V', telhado: 'Fibrocimento', telhadoDetalhe: 'parafuso estrutural', consumoModo: 'media', consumoMedio: 650,
      simultaneidade: 0.5, moduloId: 'mod-dmegc-625', nModulos: '', inversorId: 'inv-sofar-4', nInversores: '',
      itens: [], kitManual: true, kitValor: 8177.08, infraValor: 1500, precoModo: 'composto', valorTotal: 12700,
      premissas: ctx.premissas
    };
  }

  // ---------------------------------------------------------------- utilitários
  igual('crc32("123456789")', App.crc32(new TextEncoder().encode('123456789')).toString(16), 'cbf43926');
  igual('brl(12700)', U.brl(12700), 'R$ 12.700,00');
  igual('brl(-4567.26)', U.brl(-4567.26), 'R$ -4.567,26');
  igual('kwp(5.625)', U.kwp(5.625), '5,625');
  igual('anosMeses(1.56)', U.anosMeses(1.56), '1 ano e 7 meses');
  igual('anosMeses(2.99)', U.anosMeses(2.99), '3 anos');
  perto('num("1.234,56")', U.num('1.234,56'), 1234.56, 1e-9);
  igual('fioBTexto 2026', C.fioBTexto(2026, D.premissas, ', '), '2026=60%, 2027=75%, 2028=90%, 2029+=100%');
  igual('fioBTexto 2030', C.fioBTexto(2030, D.premissas, ', '), '2030+=100%');

  // ---------------------------------------------------------------- cenário de referência
  const ctx = ctxReferencia();
  const p = propostaReferencia(ctx);
  const r = C.calcular(p, ctx);
  igual('módulos sugeridos', r.nModulosSugerido, 9);
  perto('kWp', r.kwp, 5.625, 1e-9);
  igual('geração mensal', U.fmt(r.geracaoMensal, 0), '702');
  igual('geração anual', U.fmt(r.geracaoAnual, 0), '8.541');
  igual('FDG (Pcc/Pca)', U.fmt(r.fdg, 3), '1,406');
  ok('FDG acima da faixa (inversor subdimensionado)', !r.fdgOk && r.alertas.some(function (x) { return /FDG \(Pcc\/Pca\) 1,406 .*subdimensionado/.test(x.msg); }));
  igual('cobertura', U.fmt(r.cobertura * 100, 1), '108,0');
  igual('área', U.fmt(r.area, 0), '25');
  perto('mão de obra', r.maoObra, 3022.92);
  igual('tecnologia', r.tecnologia, 'DMEGC 625W Bifacial + Sofar 4kW');
  igual('cabeçalho', r.resumoCabecalho, '5,625 kWp — DMEGC 625W + Sofar 4kW');
  igual('estrutura', r.estruturaTexto, 'Solfácil — 2× Kit Fibrocimento p/ 4 módulos + 1× Kit p/ 2 módulos + 10 Perfis AL 2400mm');
  igual('itens (qtd)', r.itens.map(function (i) { return C.qtdTxt(i); }).join(','), '9,1,2,1,10,25m,25m,2 pt');
  igual('descrição módulo', r.itens[0].descricao, 'Módulo Bifacial DMEGC 625W — Ef. 23,1% — Frame Composto — DM625G12RT-B66HBW-P');
  igual('descrição inversor', r.itens[1].descricao, 'Inversor Sofar 4KTL2-G3 — 4 kW Monofásico 220V / 1 MPPT');
  igual('garantia módulo', r.itens[0].garantia, '12 anos produto / 25 anos performance');

  const a = r.fin.anos;
  perto('2026 conta s/ sistema', a[0].contaSem, 695.53);
  perto('2026 disponib. mín.', a[0].contaMin, 48.81);
  perto('2026 energia compensada = consumo da rede (650 − autoconsumo de 50%)', a[0].compensada / 12, 650 - r.geracaoAnual / 12 * 0.5, 1e-9);
  perto('2026 Fio B calculado só sobre a energia compensada (× R$ 0,08 × 60%)', a[0].fioBCalcMes, 294.125 * 0.08 * 0.6, 1e-9);
  perto('2026 custo de disponibilidade (50 kWh)', a[0].custoDisp, 48.81);
  ok('2026 prevalece o custo de disponibilidade', a[0].minimo && a[0].energiaGD < a[0].custoDisp);
  perto('2026 Fio B/mês absorvido pela disponibilidade', a[0].fioBMes, 0);
  perto('2026 conta c/ sistema (maior valor + COSIP)', a[0].contaCom, 109.81);
  perto('2026 economia/mês', a[0].economiaMes, 585.72);
  perto('2026 Fio B anual', a[0].fioB, 0);
  perto('2027 conta s/ sistema', a[1].contaSem, 727.26);
  perto('2027 Fio B/mês', a[1].fioBMes, 0);
  perto('2027 conta c/ sistema', a[1].contaCom, 112.25);
  perto('2027 economia/mês', a[1].economiaMes, 615.006);
  igual('2027 geração', U.fmt(a[1].geracao, 0), '8.498');
  igual('2027 tarifa', U.fmt(a[1].tarifa, 4), '1,0250');
  perto('2029 conta c/ sistema', a[3].contaCom, 117.50);
  perto('2029 economia/mês', a[3].economiaMes, 678.04);
  perto('2035 conta s/ sistema', a[9].contaSem, 1045.36);
  perto('2035 disponib. mín.', a[9].contaMin, 75.72);
  perto('2035 Fio B/mês', a[9].fioBMes, 0);
  perto('2035 economia/mês', a[9].economiaMes, 908.64);
  ok('todos os anos: conta c/ sistema = maior valor + COSIP', a.every(function (x) { return Math.abs(x.contaCom - (Math.max(x.custoDisp, x.energiaGD) + x.cosip)) < 1e-9; }));
  igual('anos da projeção', r.fin.projecao.map(function (x) { return x.ano; }).join(','), '2026,2027,2028,2029,2030,2031,2035,2040,2045,2050');
  perto('economia líquida = economia/mês × 12', a[0].liq, a[0].economiaMes * 12, 1e-6);
  ok('payback simples calculado', r.fin.paybackSimples > 1 && r.fin.paybackSimples < 3, String(r.fin.paybackSimples));
  ok('payback descontado > simples', r.fin.paybackDescontado > r.fin.paybackSimples, String(r.fin.paybackDescontado));
  ok('TIR > TMA', r.fin.tir > 0.145, String(r.fin.tir));
  perto('VPL coerente com fluxo descontado', r.fin.vpl, -12700 + a.reduce(function (s, x) { return s + x.liq / Math.pow(1.145, x.n); }, 0), 1e-6);

  const pg = r.pagamentos;
  perto('cartão 12x (0%) parcela', pg[1].parcela, 1058.33);
  perto('cartão 12x 2% parcela', pg[2].parcela, 1200.91);
  perto('cartão 12x 2% total', pg[2].total, 14410.88, 0.01);
  perto('BV 48x 2,7%', pg[3].parcela, 475.17);
  perto('BV 60x 2,7%', pg[4].parcela, 429.81);
  perto('BV 72x 2,7%', pg[5].parcela, 401.93);
  igual('rótulo PMT', pg[3].label, 'BV 48x — 2,7% a.m.');

  // ---------------------------------------------------------------- cartão com acréscimo (padrão)
  const pgPad = C.pagamentos(10000, D.pagamentos);
  perto('cartão 12x +11,49%', pgPad[1].parcela, 10000 * 1.1149 / 12, 1e-6);
  igual('rótulo cartão', pgPad[1].label, 'Cartão 12x — acréscimo de 11,49% (Outras bandeiras)');

  // ---------------------------------------------------------------- consumo baixo (gerador menor que consumo)
  const pBaixo = Object.assign(U.clone(p), { nModulos: 4 });
  const rBaixo = C.calcular(pBaixo, ctx);
  perto('subdimensionado: faturada = consumo − geração anual/12', rBaixo.fin.anos[0].faturada, 650 - rBaixo.geracaoAnual / 12, 1e-9);
  ok('subdimensionado: economia positiva', rBaixo.fin.anos[0].liq > 0);

  // ---------------------------------------------------------------- híbrido
  const ctxH = ctxReferencia();
  ctxH.premissas = U.clone(D.premissas);
  const pH = Object.assign(propostaReferencia(ctxH), {
    tipoSistema: 'hibrido', inversorId: null, cargas: U.clone(D.cargasExemplo), autonomiaHoras: 6,
    bateriaId: 'bat-deye-51', usoBateria: 'ciclagem', valorTotal: 32000, kitManual: true, kitValor: 22000, premissas: ctxH.premissas
  });
  const rH = C.calcular(pH, ctxH);
  ok('híbrido: inversor híbrido escolhido', rH.inversor && rH.inversor.tipo === 'hibrido', rH.inversor && rH.inversor.modelo);
  perto('híbrido: energia de backup (Wh)', rH.hibrido.energiaBackup, 150 * 6 + 8 * 10 * 4 + 12 * 6 + 100 * 3 + 2 * 80 * 4, 1e-9);
  perto('híbrido: eficiência de ciclo padrão 92%', rH.hibrido.eficiencia, 0.92, 1e-12);
  perto('híbrido: capacidade necessária', rH.hibrido.capNecessaria, (rH.hibrido.energiaBackup / 1000) / (rH.hibrido.dod * 0.92), 1e-9);
  ok('híbrido: baterias suficientes', rH.hibrido.capInstalada >= rH.hibrido.capNecessaria, rH.hibrido.nBaterias + ' un');
  ok('híbrido: ciclagem reduz a energia compensada (base do Fio B)', rH.fin.anos[0].compensada < C.calcular(Object.assign(U.clone(pH), { usoBateria: 'backup' }), ctxH).fin.anos[0].compensada);
  ok('híbrido: itens incluem bateria', rH.itens.some(function (i) { return i.categoria === 'bateria'; }));
  ok('híbrido: cenários avaliados (solar, backup, horários)', rH.cenariosAvaliados.map(function (c) { return c.id; }).join(',') === 'solar,backup,ponta',
    rH.cenariosAvaliados.map(function (c) { return c.id; }).join(','));
  ok('híbrido: redução de picos não se aplica ao grupo B', rH.cenarios.find(function (c) { return c.id === 'picos'; }).aplicavel === false);
  const bkp = rH.cenarios.find(function (c) { return c.id === 'backup'; });
  ok('híbrido: backup dimensionado para as cargas críticas', bkp.capInstalada >= rH.hibrido.capNecessaria, bkp.n + ' un / ' + bkp.capInstalada + ' kWh');
  perto('híbrido: backup sem efeito na conta = cenário solar', bkp.fin.anos[0].economiaMes, rH.cenarios[0].fin.anos[0].economiaMes, 1e-9);

  // ---------------------------------------------------------------- híbrido: dimensionamento das baterias pelas cargas críticas
  const ctxG = U.clone(ctxH);
  ctxG.equipamentos.forEach(function (e) { if (e.id === 'bat-byd-hvs51') e.preco = 14000; });
  const pG = Object.assign(U.clone(pH), { bateriaId: 'bat-byd-hvs51', inversorId: 'hib-huawei-6-l1', usoBateria: undefined, cenarioEscolhido: 'auto',
    cargas: [{ descricao: 'Geladeira', qtd: 1, potencia: 150, horas: 4 }], autonomiaHoras: 5 });
  const rG = C.calcular(pG, ctxG);
  const cenG = function (id) { return rG.cenarios.find(function (c) { return c.id === id; }); };
  perto('híbrido geladeira: energia de backup 150 W × 4 h', rG.hibrido.energiaBackup, 600, 1e-9);
  perto('híbrido geladeira: capacidade necessária = 0,6 ÷ (DoD 100% × 92%)', rG.hibrido.capNecessaria, 0.6 / 0.92, 1e-9);
  igual('híbrido geladeira: backup com 1 bateria', cenG('backup').n, 1);
  igual('híbrido geladeira: ciclagem (tarifa convencional) usa o mesmo banco do backup', cenG('ponta').n, cenG('backup').n);
  igual('híbrido geladeira: cenário renomeado na tarifa convencional', cenG('ponta').nome, 'Backup + ciclagem diária');
  perto('híbrido geladeira: ciclagem só acima da reserva de backup', cenG('ponta').fin.kwhDeslocadosAno1, (5.12 - 0.6 / 0.92) * 0.92 * 365, 1e-6);
  ok('híbrido geladeira: proposta detalha um cenário com baterias', rG.cen.n > 0 && rG.cen.id !== 'solar', rG.cen.id);
  ok('híbrido geladeira: recomendação informa o VPL sem baterias', rG.recomendacao.motivos.some(function (m) { return /Sem armazenamento/.test(m); }));
  perto('híbrido geladeira: autonomia estimada (5,12 × 0,92 ÷ 0,6 kWh × 5 h)', rG.hibrido.autonomiaEstimada, 5.12 * 0.92 / 0.6 * 5, 1e-9);
  const rGaut = C.calcular(Object.assign(U.clone(pG), { cargas: [{ descricao: 'Geladeira', qtd: 1, potencia: 150, horas: 8 }, { descricao: 'Roteador', qtd: 1, potencia: 12, horas: '' }] }), ctxG);
  perto('híbrido: horas limitadas à autonomia e em branco = autonomia', rGaut.hibrido.energiaBackup, 150 * 5 + 12 * 5, 1e-9);
  const rG9 = C.calcular(Object.assign(U.clone(pG), { cenarios: { backup: { n: 9 } } }), ctxG);
  ok('híbrido: alerta de capacidade acima do máximo da BYD HVS (38,4 kWh)', rG9.alertas.some(function (a) { return /acima do máximo do sistema/.test(a.msg); }));
  ok('híbrido: configuração de alta tensão sem "em paralelo"', /alta tensão/.test(rG9.hibrido.configuracao) && !/paralelo/.test(rG9.hibrido.configuracao), rG9.hibrido.configuracao);
  ok('base antiga: capacidade máxima das baterias HV (migração)', D.CAP_MAX_SISTEMA['bat-byd-hvs51'] === 38.4 && window.EQUIP_TESTE.find(function (e) { return e.id === 'bat-byd-hvs51'; }).capMaxSistema === 38.4);

  // ---------------------------------------------------------------- híbrido: consumo próprio, perdas, balanço, potências e limites
  const kwh40 = 40 * 24 * 365 / 12 / 1000;
  perto('premissa: consumo próprio padrão 40 W ≈ 29,2 kWh/mês', C.kwhMes(D.premissas.hibrido.consumoProprioW), kwh40, 1e-9);
  perto('premissas antigas: eficiência 90% → 92%', App.Store.ajustarPremissas({ hibrido: { eficiencia: 0.9 } }).hibrido.eficiencia, 0.92, 1e-12);
  perto('premissas novas: 90% escolhido pelo usuário é mantido', App.Store.ajustarPremissas({ hibrido: { eficiencia: 0.9, consumoProprioW: 40 } }).hibrido.eficiencia, 0.9, 1e-12);
  perto('híbrido: consumo próprio do inversor (padrão)', rG.consumoProprio, kwh40, 1e-9);
  perto('híbrido: dimensionamento = consumo + consumo próprio', rG.consumoDimensionamento, 650 + kwh40 + rG.dimensionamento.perdas, 1e-9);
  ok('on-grid: sem consumo próprio no dimensionamento', r.consumoDimensionamento === 650 && r.consumoProprio === 0);
  const rGc = C.calcular(Object.assign(U.clone(pG), { cenarioEscolhido: 'ponta' }), ctxG);
  const a1Gc = rGc.cen.fin.anos[0];
  perto('ciclagem: perdas do ciclo entram no dimensionamento (2ª passada)', rGc.dimensionamento.perdas, a1Gc.descarga / 12 * (1 / 0.92 - 1), 0.05);
  perto('ciclagem 1 bateria: banco totalmente utilizado', rGc.balanco.utilizacao, 1, 1e-9);
  igual('ciclagem: balanço no mês de menor geração (jun)', rGc.balanco.mes, 5);
  ok('ciclagem 1 bateria: sem alerta de utilização', !rGc.alertas.some(function (x) { return /Na ciclagem o banco usa/.test(x.msg); }));
  const rG4 = C.calcular(Object.assign(U.clone(pG), { cenarioEscolhido: 'ponta', cenarios: { ponta: { n: 4 } } }), ctxG);
  ok('ciclagem 4 baterias: utilização abaixo de 70% e sugestão de 3 baterias', rG4.balanco.utilizacao < 0.7 &&
    rG4.alertas.some(function (x) { return x.nivel === 'aviso' && /bastam 3 bateria/.test(x.msg); }), rG4.alertas.map(function (x) { return x.msg; }).join(' | '));
  ok('ciclagem 4 baterias: mais perdas → mais módulos sugeridos', rG4.nModulosSugerido > rGc.nModulosSugerido, rG4.nModulosSugerido + ' × ' + rGc.nModulosSugerido);
  const ctxG0 = U.clone(ctxG);
  ctxG0.premissas.hibrido.consumoProprioW = 0;
  const pBig = Object.assign(U.clone(pG), { consumoMedio: 1000, nModulos: 9, cenarioEscolhido: 'backup' });
  const c40 = C.calcular(pBig, ctxG).fin.anos[0].contaCom, c0b = C.calcular(Object.assign(U.clone(pBig), { premissas: ctxG0.premissas }), ctxG0).fin.anos[0].contaCom;
  perto('consumo próprio: soma 29,2 kWh × tarifa à conta com sistema', c40 - c0b, kwh40 * 0.9762, 0.01);
  const rPot = C.calcular(Object.assign(U.clone(pG), { bateriaId: 'bat-pylon-us3000c', inversorId: 'hib-deye-6-lp1', cenarioEscolhido: 'backup',
    cargas: [{ descricao: 'Bomba', qtd: 1, potencia: 3000, horas: 0.25, motor: true }] }), ctxG);
  igual('backup: baterias pela potência (3 kW × 1,25 ÷ 1,78 kW)', rPot.cen.n, 3);
  perto('pico de partida: cargas + motor × (5 − 1)', rPot.hibrido.picoPartida, 3000 + 3000 * 4, 1e-9);
  const rLvs = C.calcular(Object.assign(U.clone(pG), { bateriaId: 'bat-byd-lvs4', inversorId: 'hib-deye-6-lp1' }), ctxG);
  ok('bateria sem potência cadastrada: aviso de 0,5C', rLvs.alertas.some(function (x) { return /não cadastrada: considerado 0,5C/.test(x.msg); }));
  const ctxLim = U.clone(ctxG);
  Object.assign(ctxLim.equipamentos.find(function (e) { return e.id === 'hib-huawei-6-l1'; }), { pFVMax: 5, capBateriaMax: 4, surtoKW: 0.5, pBateriaMax: 0.5 });
  const rLim = C.calcular(Object.assign(U.clone(pG), { cenarioEscolhido: 'ponta', cargas: [{ descricao: 'Geladeira', qtd: 1, potencia: 150, horas: 4, motor: true }] }), ctxLim);
  const msgsLim = rLim.alertas.map(function (x) { return x.msg; }).join(' | ');
  ok('inversor: entrada FV máxima', /acima da entrada FV máxima/.test(msgsLim), msgsLim);
  ok('inversor: capacidade máxima de bateria', /acima da capacidade máxima de bateria do inversor/.test(msgsLim), msgsLim);
  ok('inversor: surto × pico de partida (150 W × 5)', /Pico de partida estimado \(0,75 kW/.test(msgsLim), msgsLim);
  ok('inversor: potência de carga para a ciclagem', /exige cerca de/.test(msgsLim), msgsLim);
  perto('inversor: potência do banco limitada pela potência de bateria do inversor', rLim.hibrido.potenciaArm, 0.5, 1e-9);
  const rMes = C.calcular(Object.assign(U.clone(p), { consumoMedio: 1000, nModulos: 9 }), ctx);
  igual('faixa mensal: menor conta em dez e maior em jun', rMes.contasMes.mesMin + ',' + rMes.contasMes.mesMax, '11,5');
  perto('faixa mensal: média dos 12 meses = mês médio do fluxo', rMes.contasMes.media, rMes.fin.anos[0].contaCom, rMes.fin.anos[0].contaCom * 0.005);
  const prT = U.clone(D.premissas);
  perto('rateio do consumo 24 h: ponta na verde (3 h × dias úteis)', App.Energia.ratear(100, 'verde', prT).p, 100 * 3 / 24 * 252 / 365, 1e-9);
  perto('rateio do consumo 24 h: intermediário na branca (2 h)', App.Energia.ratear(100, 'branca', prT).i, 100 * 2 / 24 * 252 / 365, 1e-9);
  const txLim = textoModelo(App.Documento.montar(Object.assign(U.clone(pG), { cenarioEscolhido: 'ponta', cargas: [{ descricao: 'Geladeira', qtd: 1, potencia: 150, horas: 4, motor: true }] }),
    rLim, ctxLim, ctxLim.clientes[0], { w: 1400, h: 752 })).join('\n');
  ok('documento híbrido: cargas críticas e resumo do banco para o cliente', txLim.indexOf('Geladeira (motor)') >= 0 && /🔋 Banco de baterias: \d+ × .* kWh úteis\)\./.test(txLim));
  ok('documento híbrido: sem a tabela de parâmetros técnicos do banco',
    ['Consumo Considerado no Dimensionamento', 'Pico de Partida (motores)', 'Utilização do Banco na Ciclagem', 'Consumo Próprio do Inversor', 'Balanço Diário', 'Potência Contínua de Descarga', 'Tensão do Banco']
      .every(function (t) { return txLim.indexOf(t) < 0; }));
  const txMes = textoModelo(App.Documento.montar(Object.assign(U.clone(p), { consumoMedio: 1000, nModulos: 9 }), rMes, ctx, ctx.clientes[0], { w: 1400, h: 752 })).join('\n');
  ok('documento: faixa da conta do ano 1', /a conta com sistema varia de R\$ [\d.,]+ \(dez\) a R\$ [\d.,]+ \(jun\)/.test(txMes));

  // ---------------------------------------------------------------- tarifas grupo A / branca
  const E = App.Energia;
  const prA = U.clone(D.premissas);
  const tVerde = { grupo: 'A', modalidade: 'verde', ponta: 2.5, inter: 0.6, fp: 0.6, dem: 40, referencia: 0.6 };
  const contaV = E.conta(tVerde, { p: 2000, i: 0, fp: 18000 }, { contr: 150, med: 160 }, { cosip: 61 }, prA);
  perto('verde: energia ponta + fora de ponta', contaV.energia, 15800, 1e-9);
  perto('verde: demanda faturada (maior entre contratada e medida)', contaV.demanda, 6400, 1e-9);
  perto('verde: multa de ultrapassagem (>5%)', contaV.ultrapassagem, 800, 1e-9);
  perto('verde: total da conta', contaV.total, 23061, 1e-9);
  const tAzul = { grupo: 'A', modalidade: 'azul', ponta: 2.5, inter: 0.6, fp: 0.6, demP: 90, demFP: 35, referencia: 0.6 };
  const contaA = E.conta(tAzul, { p: 2000, i: 0, fp: 18000 }, { contrP: 100, medP: 104, contrFP: 150, medFP: 150 }, { cosip: 0 }, prA);
  perto('azul: demandas de ponta e fora de ponta sem ultrapassagem (≤5%)', contaA.demanda + contaA.ultrapassagem, 104 * 90 + 150 * 35, 1e-9);
  const tBranca = { grupo: 'B', modalidade: 'branca', ponta: 1.6, inter: 1.05, fp: 0.75, referencia: 0.75 };
  perto('branca: energia por posto', E.conta(tBranca, { p: 50, i: 30, fp: 420 }, null, { cosip: 0, disp: 50 }, prA).energia, 50 * 1.6 + 30 * 1.05 + 420 * 0.75, 1e-9);
  const apB = E.aplicar(tBranca, { p: 50, i: 30, fp: 420 }, null, { G: 600, s: 0.5 }, null);
  ok('branca: créditos excedentes abatem intermediário e ponta', apB.c.fp === 0 && apB.c.i === 0 && apB.c.p < 50, JSON.stringify(apB.c));

  // ---------------------------------------------------------------- conta mínima com geração (REN 1.000/2021, art. 655-I)
  const tConv = { grupo: 'B', modalidade: 'conv', conv: 1.15933, ponta: 1.15933, inter: 1.15933, fp: 1.15933, referencia: 1.15933 };
  const celesc = E.conta(tConv, { p: 0, i: 0, fp: 0 }, null, { cosip: 0, disp: 30, compensada: 1000, fioBTarifa: 0.07965 }, prA);
  perto('655-I (ex. Celesc): Fio B de R$ 79,65 > disponibilidade de R$ 34,78 → não se somam', celesc.total, 79.65, 1e-9);
  ok('655-I (ex. Celesc): sem mínimo aplicado', !celesc.minimo);
  const tUm = { grupo: 'B', modalidade: 'conv', conv: 1, ponta: 1, inter: 1, fp: 1, referencia: 1 };
  perto('655-I: disponibilidade maior que o Fio B → paga só a disponibilidade',
    E.conta(tUm, { p: 0, i: 0, fp: 0 }, null, { cosip: 10, disp: 50, compensada: 185, fioBTarifa: 0.2 }, prA).total, 50 + 10, 1e-9);
  perto('655-I: energia não compensada + Fio B maior que a disponibilidade',
    E.conta(tUm, { p: 0, i: 0, fp: 40 }, null, { cosip: 10, disp: 50, compensada: 100, fioBTarifa: 0.2 }, prA).total, 40 + 20 + 10, 1e-9);
  perto('regra "disponibilidade" (ex. Luvik): 50 kWh pela tarifa + Fio B sobre 135 kWh',
    E.conta(tUm, { p: 0, i: 0, fp: 0 }, null, { cosip: 0, disp: 50, compensada: 185, fioBTarifa: 0.2, regra: 'disponibilidade' }, prA).total, 50 + 135 * 0.2, 1e-9);
  perto('sem geração: custo de disponibilidade (art. 291)', E.conta(tUm, { p: 0, i: 0, fp: 20 }, null, { cosip: 0, disp: 50 }, prA).total, 50, 1e-9);
  const apS = E.aplicar(tUm, { p: 0, i: 0, fp: 500 }, null, { G: 400, s: 0.3 }, null);
  perto('simultaneidade: autoconsumo fora da compensação (400 × 30%)', apS.autoconsumo, 120, 1e-9);
  perto('simultaneidade: energia compensada = injetada até o consumo da rede', apS.compensada, 280, 1e-9);
  const pGrande = Object.assign(U.clone(p), { consumoMedio: 3000, nModulos: 30, inversorId: null, valorTotal: 50000, kitManual: true, kitValor: 30000 });
  const aG = C.calcular(pGrande, ctx).fin.anos;
  ok('consumidor maior: energia + Fio B prevalece sobre a disponibilidade', aG.every(function (x) { return !x.minimo && x.fioBMes > 0; }));
  perto('consumidor maior: Fio B efetivo = Fio B calculado', aG[0].fioBMes, aG[0].fioBCalcMes, 1e-9);
  perto('consumidor maior: conta = energia + Fio B + COSIP', aG[0].contaCom, aG[0].energiaGD + aG[0].cosip, 1e-9);
  const aT = C.calcular(Object.assign(U.clone(pGrande), { nModulos: 40 }), ctx).fin.anos;
  perto('tudo compensado: Fio B efetivo = acréscimo sobre a disponibilidade', aT[0].fioBMes, aT[0].fioBCalcMes - aT[0].custoDisp, 1e-9);
  const ctxDisp = U.clone(ctx);
  ctxDisp.premissas.regraDisponibilidade = 'disponibilidade';
  const aD = C.calcular(Object.assign(U.clone(p), { premissas: ctxDisp.premissas }), ctxDisp).fin.anos;
  perto('regra "disponibilidade" na referência: Fio B sobre (consumo da rede − 50 kWh)', aD[0].fioBMes, (294.125 - 50) * 0.08 * 0.6, 1e-9);
  ok('regra "disponibilidade" nunca é menor que a do maior valor', aD.every(function (x, i) { return x.contaCom >= a[i].contaCom - 1e-9; }));

  // ---------------------------------------------------------------- FDG: premissas antigas (FDI) convertidas
  const premAntiga = Object.assign(U.clone(D.premissas), { fdiMin: 0.75, fdiMax: 1.2, fdiAlvo: 0.9 });
  ['fdgMin', 'fdgMax', 'fdgAlvo', 'regraDisponibilidade'].forEach(function (k) { delete premAntiga[k]; });
  const premConv = C.premissas({ premissas: premAntiga }, ctx);
  ok('FDI padrão antigo → faixa FDG padrão', premConv.fdgMin === D.premissas.fdgMin && premConv.fdgMax === D.premissas.fdgMax &&
    premConv.fdgAlvo === D.premissas.fdgAlvo && premConv.fdiMin === undefined && premConv.regraDisponibilidade === 'maior', JSON.stringify([premConv.fdgMin, premConv.fdgMax, premConv.fdgAlvo]));
  const premPers = App.Store.ajustarPremissas({ fdiMin: 0.8, fdiMax: 1.25, fdiAlvo: 1 });
  igual('FDI personalizado convertido (invertido)', [premPers.fdgMin, premPers.fdgMax, premPers.fdgAlvo].join(' | '), '0.8 | 1.25 | 1');

  // ---------------------------------------------------------------- composição do preço: comissão e outros valores
  const pPreco = Object.assign(U.clone(p), { comissaoValor: 500, outrosValor: 300, outrosDescricao: 'Adequação do padrão de entrada' });
  const rPreco = C.calcular(pPreco, ctx);
  perto('preço composto: total inalterado', rPreco.total, 12700, 1e-9);
  perto('preço composto: mão de obra = total − kit − infra − outros (inclui a comissão)', rPreco.maoObra, 12700 - 8177.08 - 1500 - 300, 1e-9);
  perto('preço composto: mão de obra líquida da comissão', rPreco.maoObraLiquida, 12700 - 8177.08 - 1500 - 300 - 500, 1e-9);
  const rSep = C.calcular(Object.assign(U.clone(pPreco), { precoModo: 'separado', maoObraValor: 3000 }), ctx);
  perto('itens separados: total = kit + infra + mão de obra + outros (comissão dentro da mão de obra)', rSep.total, 8177.08 + 1500 + 3000 + 300, 1e-9);
  const txPreco = textoModelo(App.Documento.montar(pPreco, rPreco, ctx, ctx.clientes[0], { w: 1400, h: 752 })).join('\n');
  ok('proposta: só o valor final, sem a composição do investimento', txPreco.indexOf('Composição do investimento') < 0 &&
    txPreco.indexOf(U.brl(rPreco.total)) >= 0 && txPreco.indexOf('Adequação do padrão de entrada') < 0);
  ok('proposta: comissão não aparece', !/comiss[aã]o/i.test(txPreco) && txPreco.indexOf('R$ 500,00') < 0);
  ok('proposta: valores internos (kit e mão de obra) fora do documento', txPreco.indexOf(U.brl(rPreco.maoObra)) < 0 && txPreco.indexOf(U.brl(rPreco.kit)) < 0);
  ok('proposta: sem a tabela de dimensionamento técnico (FDG, PR, HSP)', !/DIMENSIONAMENTO TÉCNICO|Fator de Dimensionamento|Performance Ratio|Simultaneidade Adotada/.test(txPreco));
  ok('proposta: sem condições comerciais e conformidade legal no final', !/CONDIÇÕES COMERCIAIS|CONFORMIDADE LEGAL|CRONOGRAMA DE EXECUÇÃO|NBR 16690/.test(txPreco));
  ok('proposta: garantia da instalação nos cartões de garantia', /Instalação\n1 ano\npela .+: mão de obra e conexões/.test(txPreco));
  const txObs = textoModelo(App.Documento.montar(Object.assign(U.clone(pPreco), { condicoesObs: 'Preço válido para pagamento via PIX.' }), rPreco, ctx, ctx.clientes[0], { w: 1400, h: 752 })).join('\n');
  ok('proposta: observações da proposta junto das opções de pagamento', txObs.indexOf('Observações: Preço válido para pagamento via PIX.') >= 0);
  ok('proposta: validade com data na capa, no resumo e nos próximos passos', (txPreco.match(/04\/10\/2026/g) || []).length >= 3);
  ok('proposta: conta dos próximos anos em linguagem simples, sem anexo técnico', txPreco.indexOf('Sem energia solar') >= 0 && txPreco.indexOf('25º ano') >= 0 &&
    txPreco.indexOf('Custo Disponib.') < 0 && txPreco.indexOf('Anexo') < 0 && !/655-I|Premissas do cálculo|Fluxo de caixa/.test(txPreco));

  // ---------------------------------------------------------------- fluxo de caixa pela conta anual e indicadores de retorno
  (function () {
    const f = r.fin;
    ok('fluxo: economia anual = (conta sem − conta com) × 12 em todos os anos', f.anos.every(function (a) { return Math.abs(a.liq - (a.contaSem - a.contaCom) * 12) < 1e-6; }));
    perto('fluxo: economia anual do ano 1 = economia mensal × 12', f.economiaAno1, f.economiaMes1 * 12, 1e-9);
    let acc = -r.total, pb = null;
    f.anos.forEach(function (a, k) { const liq = (a.contaSem - a.contaCom) * 12; if (pb == null && acc + liq >= 0) pb = k + (-acc) / liq; acc += liq; });
    perto('retorno: payback simples recalculado pelo fluxo da conta', f.paybackSimples, pb, 1e-9);
    const vplManual = f.anos.reduce(function (s0, a, k) { return s0 + (a.contaSem - a.contaCom) * 12 / Math.pow(1 + D.premissas.tma, k + 1); }, -r.total);
    perto('retorno: VPL recalculado (TMA)', f.vpl, vplManual, 1e-6);
    const npvTir = f.anos.reduce(function (s0, a, k) { return s0 + a.liq / Math.pow(1 + f.tir, k + 1); }, -r.total);
    ok('retorno: TIR zera o VPL', Math.abs(npvTir) < 0.01, npvTir);
    perto('retorno: acumulado final = economia total − investimento', f.anos[f.anos.length - 1].acumulado, f.economiaTotal - r.total, 1e-6);
    const tx = textoModelo(App.Documento.montar(p, r, ctx, ctx.clientes[0], { w: 1400, h: 752 }));
    ok('documento: sem a tabela do fluxo de caixa (saldo acumulado em gráfico no retorno)', ['Conta anual sem sistema', 'Fluxo acumulado', 'Custo Fio B (R$)'].every(function (c) { return tx.indexOf(c) < 0; }) &&
      tx.indexOf('Seu dinheiro ao longo do tempo (saldo acumulado)') >= 0);
  })();

  // ---------------------------------------------------------------- preço pela margem: instalação por módulo, lucro e comissão sobre o valor final
  (function () {
    const nova = C.novaProposta(ctx);
    ok('nova proposta: preço pela margem, faixa 1, lucro 15% e comissão 5%, infraestrutura zerada',
      nova.precificacao === 'margem' && nova.instalacaoFaixa === 1 && nova.lucroModo === 'pct' && nova.lucroPct === 0.15 && nova.comissaoPct === 0.05 && !U.num(nova.infraValor));
    const base = Object.assign(U.clone(p), { precificacao: 'margem', instalacaoFaixa: 1, lucroModo: 'pct', lucroPct: 0.15, comissaoPct: 0.05, infraValor: '', valorTotal: '' });
    const rm = C.calcular(base, ctx);
    perto('margem: instalação = 9 módulos × R$ 80', rm.instalacao, 720, 1e-9);
    perto('margem: valor final = custos ÷ (1 − 15% − 5%)', rm.total, (8177.08 + 720) / 0.8, 1e-6);
    perto('margem: lucro = 15% do valor final', rm.lucro, rm.total * 0.15, 1e-6);
    perto('margem: comissão = 5% do valor final', rm.comissao, rm.total * 0.05, 1e-6);
    perto('margem: mão de obra da proposta = instalação + lucro + comissão', rm.maoObra, 720 + rm.lucro + rm.comissao, 1e-6);
    perto('margem: kit + infra + mão de obra + outros = valor final', rm.kit + rm.infra + rm.maoObra + rm.outros, rm.total, 1e-6);
    perto('margem: investimento do fluxo = valor final', rm.fin.anos[0].acumulado + rm.total, rm.fin.anos[0].liq, 1e-6);
    perto('margem: faixa 2 = 9 × R$ 100', C.calcular(Object.assign(U.clone(base), { instalacaoFaixa: 2 }), ctx).instalacao, 900, 1e-9);
    const rInfra = C.calcular(Object.assign(U.clone(base), { infraValor: 1200, outrosValor: 300, outrosDescricao: 'Frete' }), ctx);
    perto('margem: infraestrutura e outros entram nos custos', rInfra.total, (8177.08 + 720 + 1200 + 300) / 0.8, 1e-6);
    const rV = C.calcular(Object.assign(U.clone(base), { lucroModo: 'valor', lucroValor: 1500 }), ctx);
    perto('margem: lucro em R$ — valor final = (custos + lucro) ÷ (1 − 5%)', rV.total, (8177.08 + 720 + 1500) / 0.95, 1e-6);
    perto('margem: lucro em R$ mantido', rV.lucro, 1500, 1e-9);
    const rPad = C.calcular(Object.assign(U.clone(base), { lucroPct: '', comissaoPct: '' }), ctx);
    perto('margem: percentuais em branco usam as premissas', rPad.total, (8177.08 + 720) / 0.8, 1e-6);
    const rAlto = C.calcular(Object.assign(U.clone(base), { lucroPct: 0.8, comissaoPct: 0.05 }), ctx);
    ok('margem: lucro + comissão excessivos geram erro', rAlto.alertas.some(function (a) { return a.nivel === 'erro' && /inviabilizam/.test(a.msg); }));
    const txm = textoModelo(App.Documento.montar(Object.assign(U.clone(base), { infraValor: 1200 }), rInfra, ctx, ctx.clientes[0], { w: 1400, h: 752 })).join('\n');
    ok('margem: comissão e lucro não aparecem na proposta', !/comiss[aã]o|Lucro \(|lucro em/i.test(txm) && txm.indexOf(U.brl(rInfra.comissao)) < 0 && txm.indexOf(U.brl(rInfra.lucro)) < 0);
    ok('margem: proposta mostra só o valor final (sem a mão de obra com lucro e comissão)', txm.indexOf(U.brl(rInfra.maoObra)) < 0 && txm.indexOf(U.brl(rInfra.total)) >= 0);
    perto('proposta antiga (valor total) não muda', r.total, 12700, 1e-9);
    // híbrido: lucro e comissão sobre o valor final do cenário (FV + armazenamento)
    const pHm = Object.assign(U.clone(pH), { precificacao: 'margem', instalacaoFaixa: 1, lucroModo: 'pct', lucroPct: 0.15, comissaoPct: 0.05, infraValor: '', valorTotal: '' });
    const rHm = C.calcular(pHm, ctxH);
    const custoH = rHm.kit + rHm.instalacao + rHm.infra + rHm.outros + rHm.kitArm + (rHm.instalArm);
    perto('margem híbrido: valor final = (FV + armazenamento) ÷ 0,8', rHm.total, custoH / 0.8, 1e-6);
    perto('margem híbrido: linhas da proposta somam o valor final', rHm.kit + rHm.kitArm + rHm.instalArm + rHm.infra + rHm.maoObra + rHm.outros, rHm.total, 1e-6);
    perto('margem híbrido: comissão = 5% do valor final', rHm.comissao, rHm.total * 0.05, 1e-6);

    // valor na proposta impressa: sempre o valor final cheio, sem detalhamento
    const pD = Object.assign(U.clone(base), { infraValor: 1200 });
    const rD = C.calcular(pD, ctx);
    const txD = textoModelo(App.Documento.montar(pD, rD, ctx, ctx.clientes[0], { w: 1400, h: 752 })).join('\n');
    ok('valor na proposta: somente o valor final, sem kit, infraestrutura e mão de obra', txD.indexOf(U.brl(rD.total)) >= 0 && txD.indexOf('↳') < 0 &&
      txD.indexOf(U.brl(rD.kit)) < 0 && txD.indexOf(U.brl(rD.maoObra)) < 0 && txD.indexOf(U.brl(1200)) < 0);
    ok('economia mensal sem a simultaneidade entre parênteses', !/\(sim\./.test(txD));
  })();

  // ---------------------------------------------------------------- BESS no grupo A (verde) — picos e horários estratégicos
  const ctxA = ctxReferencia();
  ctxA.premissas = U.clone(D.premissas);
  ctxA.equipamentos.forEach(function (e) { if (e.tipo === 'bess') e.preco = 150000; });
  const pA = Object.assign(propostaReferencia(ctxA), {
    tipoSistema: 'bess', bessComFV: false, bessId: 'bess-exemplo-100', modalidade: 'verde', subgrupo: 'A4',
    consumoPonta: 2000, consumoForaPonta: 18000, demandaContratada: 150, demandaMedida: 160,
    tarifaPonta: 2.5, tarifaForaPonta: 0.6, tarifaDemanda: 40, cosip: 61, objetivo: 'economia', cenarioEscolhido: 'auto',
    kitManual: false, valorTotal: '', premissas: ctxA.premissas
  });
  const rA = C.calcular(pA, ctxA);
  const pk = rA.cenarios.find(function (c) { return c.id === 'picos'; });
  const pt = rA.cenarios.find(function (c) { return c.id === 'ponta'; });
  ok('BESS: sem FV o cenário solar não se aplica', !rA.cenarios[0].aplicavel);
  igual('BESS picos: unidades (energia p/ 32 kW × 3 h)', pk.n, 2);
  perto('BESS picos: redução de demanda (20% de 160 kW)', pk.fin.reducaoKW1, 32, 1e-9);
  perto('BESS picos: economia mensal ano 1 (demanda − perdas da recarga)', pk.fin.anos[0].economiaMes, 2080 - 2016 * (1 / 0.9 - 1) * 0.6, 1e-6);
  igual('BESS horários: unidades', pt.n, 2);
  perto('BESS horários: economia mensal ano 1 (ponta − recarga fora de ponta)', pt.fin.anos[0].economiaMes, 2000 * 2.5 - (2000 / 0.9) * 0.6, 1e-6);
  perto('BESS: investimento = equipamento + 15% instalação', pt.investimento, 2 * 150000 * 1.15, 1e-6);
  const rAm = C.calcular(Object.assign(U.clone(pA), { precificacao: 'margem', lucroModo: 'pct', lucroPct: 0.10, comissaoPct: 0.05 }), ctxA);
  perto('BESS margem: valor final = (equipamento + instalação) ÷ (1 − 10% − 5%)', rAm.total, rAm.cen.n * 150000 * 1.15 / 0.85, 1e-6);
  perto('BESS margem: lucro e comissão entram na instalação do armazenamento', rAm.kitArm + rAm.instalArm, rAm.total, 1e-6);
  ok('BESS: recomendação = maior VPL', rA.recomendacao && rA.recomendacao.id === (pt.fin.vpl >= pk.fin.vpl ? 'ponta' : 'picos'), rA.recomendacao && rA.recomendacao.id);
  ok('BESS: objetivo "demanda" recomenda redução de picos', C.calcular(Object.assign(U.clone(pA), { objetivo: 'demanda' }), ctxA).recomendacao.id === 'picos');
  ok('BESS: proposta usa o cenário recomendado', rA.cen.id === rA.recomendacao.id && rA.total === rA.cen.investimento);
  ok('BESS: itens com o gabinete BESS', rA.itens.length === 1 && rA.itens[0].categoria === 'bess' && rA.itens[0].qtd === rA.cen.n, JSON.stringify(rA.itens.map(function (i) { return i.categoria + ':' + i.qtd; })));

  // ---------------------------------------------------------------- microinversores
  const pM = Object.assign(U.clone(p), { topologia: 'micro', inversorId: null, moduloId: 'mod-osda-620', nModulos: 14, kitManual: true });
  const rM = C.calcular(pM, ctx);
  ok('micro: microinversor escolhido', rM.micro && rM.inversor.tipo === 'micro', rM.inversor && rM.inversor.modelo);
  igual('micro: quantidade = módulos ÷ 4 entradas', rM.nInversores, 4);
  ok('micro: módulo dentro da faixa do micro', !rM.inversor.potModuloMax || rM.inversor.potModuloMax >= 620);
  perto('micro: FDG mais próximo do alvo (8,68 kWp ÷ 4 × 2 kW)', rM.fdg, 8.68 / 8, 1e-9);
  const descM = rM.itens.map(function (i) { return i.descricao; }).join(' | ');
  ok('micro: cabo tronco e suporte do micro na lista', /Cabo tronco/.test(descM) && /Suporte de fixação do microinversor/.test(descM), descM);
  ok('micro: sem cabo solar CC nem MC4', !/Cabo Solar 4,0mm|MC4/.test(descM));
  igual('micro: terminais de fim de linha (ramais de até 3)', rM.itens.find(function (i) { return /Terminal de fim de linha/.test(i.descricao); }).qtd, 2);
  const rM2 = C.calcular(Object.assign(U.clone(pM), { nModulos: 15, inversorId: 'mic-hoymiles-2000', nInversores: 3 }), ctx);
  ok('micro: alerta quando faltam entradas', rM2.alertas.some(function (a) { return a.nivel === 'erro' && /entradas/.test(a.msg); }));
  const rM3 = C.calcular(Object.assign(U.clone(pM), { inversorId: 'mic-hoymiles-1600' }), ctx);
  ok('micro: alerta de módulo acima da faixa do micro', rM3.alertas.some(function (a) { return /fora da faixa recomendada/.test(a.msg); }));
  const rS = C.calcular(Object.assign(U.clone(p), { moduloId: 'mod-osda-620' }), ctx);
  ok('string: cabos CC e MC4 continuam na lista', rS.itens.some(function (i) { return /Cabo Solar/.test(i.descricao); }) && !rS.micro);

  // ---------------------------------------------------------------- compatibilidade bateria × inversor híbrido
  const pHV = Object.assign(U.clone(pH), { bateriaId: 'bat-byd-hvs51' });
  const rHV = C.calcular(pHV, ctxH);
  igual('híbrido: bateria de alta tensão → inversor HV', C.classeBateriaInversor(rHV.inversor), 'HV');
  ok('híbrido: sem alerta de incompatibilidade na escolha automática', !rHV.alertas.some(function (a) { return /incompatível com o inversor/.test(a.msg); }));
  const rLVxHV = C.calcular(Object.assign(U.clone(pHV), { inversorId: 'hib-deye-5' }), ctxH);
  ok('híbrido: alerta 48 V × alta tensão', rLVxHV.alertas.some(function (a) { return a.nivel === 'erro' && /incompatível com o inversor/.test(a.msg); }));
  const rBatAuto = C.calcular(Object.assign(U.clone(pH), { bateriaId: null, inversorId: 'hib-huawei-5-l1' }), ctxH);
  igual('híbrido: bateria padrão compatível com o inversor escolhido', C.classeBateria(rBatAuto.hibrido.bateria), 'HV');

  // ---------------------------------------------------------------- estruturas por tipo de telhado
  function itensTelhado(telhado, nMod) {
    return C.calcular(Object.assign(U.clone(p), { telhado: telhado, moduloId: 'mod-osda-620', nModulos: nMod }), ctx).itens
      .filter(function (i) { return i.categoria === 'estrutura'; });
  }
  const cer = itensTelhado('Cerâmico', 10);
  ok('cerâmico: ganchos, perfis, emendas, grampos e aterramento', ['Gancho regulável', 'Perfil/trilho', 'Emenda', 'Grampo intermediário', 'Grampo final', 'aterramento']
    .every(function (t) { return cer.some(function (i) { return i.descricao.indexOf(t) >= 0; }); }), cer.map(function (i) { return i.descricao; }).join(' | '));
  igual('cerâmico: 2 ganchos por módulo', cer.find(function (i) { return /Gancho regulável/.test(i.descricao); }).qtd, 20);
  const met = itensTelhado('Metálico', 10);
  igual('metálico: mini trilhos (2,2 por módulo)', met.find(function (i) { return /Mini trilho/.test(i.descricao); }).qtd, 22);
  ok('metálico: alternativas não entram automaticamente', !met.some(function (i) { return /zipada|sanduíche|Suporte "L"/.test(i.descricao); }));
  const solo = itensTelhado('Solo', 26);
  igual('solo: mesas combinadas (2 × 12 + 1 × 4)', solo.filter(function (i) { return /Mesa de solo/.test(i.descricao); }).map(function (i) { return i.qtd + '×' + i.descricao.match(/p\/ (\d+)/)[1]; }).join(', '), '2×12, 1×4');
  ok('fibrocimento: somente o kit original (sem alternativas)', itensTelhado('Fibrocimento', 9).every(function (i) { return /Solfácil/.test(i.descricao); }));
  ok('catálogo: ids únicos', (function () { const v = {}; return D.equipamentos.every(function (e) { if (v[e.id]) return false; v[e.id] = true; return true; }); })());
  ok('catálogo: sem módulos, inversores, microinversores, híbridos e baterias (cadastro pelo datasheet)', !D.equipamentos.some(function (e) { return ['modulo', 'inversor', 'micro', 'hibrido', 'bateria'].indexOf(e.tipo) >= 0; }));
  ok('catálogo: estruturas, materiais e BESS de exemplo mantidos', ['estrutura', 'material', 'bess'].every(function (t) { return D.equipamentos.some(function (e) { return e.tipo === t; }); }));
  ok('fixture de testes: ids únicos', (function () { const v = {}; return D.equipamentos.concat(window.EQUIP_TESTE).every(function (e) { if (v[e.id]) return false; v[e.id] = true; return true; }); })());

  // ---------------------------------------------------------------- datasheet: campos, esquema da leitura por IA e conversão
  const DS = App.Datasheet;
  DS.TIPOS.forEach(function (t) {
    const sch = DS.esquema(t);
    const item = sch.properties.modelos.items;
    const txt = JSON.stringify(sch);
    ok('datasheet ' + t + ': esquema fechado e todos os campos obrigatórios (sem opcionais)', sch.additionalProperties === false && item.additionalProperties === false &&
      item.required.length === DS.todos(t).length && Object.keys(item.properties).length === item.required.length);
    ok('datasheet ' + t + ': sem campos anuláveis/uniões (limite de 16 das respostas estruturadas)', txt.indexOf('anyOf') < 0 && txt.indexOf('"null"') < 0 && !/"type":\[/.test(txt));
    ok('datasheet ' + t + ': campos de texto com opção vazia nas listas', item.required.every(function (k) { const pr = item.properties[k]; return pr.type === 'string' && (!pr.enum || pr.enum.indexOf('') >= 0); }));
    ok('datasheet ' + t + ': sem restrições não suportadas pelas respostas estruturadas', JSON.stringify(sch).search(/"(minimum|maximum|minLength|maxLength|multipleOf)"/) < 0);
    igual('datasheet ' + t + ': campos únicos', new Set(DS.todos(t).map(function (c) { return c.k; })).size, DS.todos(t).length);
  });
  const conv = DS.converter('micro', { fabricante: ' Hoymiles ', modelo: 'HMS-2000-4T', fases: 'Trifásico?', modulosPorUnidade: 4.2, potencia: 2, vmaxCC: -1, iscMaxMppt: '25', potModuloMin: null });
  ok('datasheet: conversão limpa textos e descarta opção inválida, negativo e nulo', conv.fabricante === 'Hoymiles' && conv.fases === undefined && conv.vmaxCC === undefined &&
    conv.iscMaxMppt === 25 && !('potModuloMin' in conv) && conv.tipo === 'micro' && conv.preco === 0);
  igual('datasheet: inteiro arredondado e MPPTs do microinversor = entradas', conv.modulosPorUnidade + '/' + conv.mppts, '4/4');
  const convTxt = DS.converter('modulo', { fabricante: 'T', modelo: 'M', potencia: '620', voc: '48,5', vmp: '40.24', coefVoc: '\u22120.25', vMaxSistema: '1500', isc: '', celulas: '132', bifacial: '' });
  igual('datasheet: números lidos como texto (vírgula, sinal de menos, vazio)', [convTxt.potencia, convTxt.voc, convTxt.vmp, convTxt.coefVoc, convTxt.vMaxSistema, convTxt.celulas, 'isc' in convTxt, 'bifacial' in convTxt].join('|'),
    '620|48.5|40.24|-0.25|1500|132|false|false');
  ok('datasheet: formulário marca com ★ só os campos do dimensionamento', DS.camposForm('hibrido').some(function (d) { return d.k === 'vBatMin' && /^★/.test(d.label); }) &&
    DS.camposForm('hibrido').some(function (d) { return d.k === 'ip' && !/★/.test(d.label); }));
  igual('datasheet: campos ★ vazios para revisão', DS.faltando('bateria', { energia: 5, tensao: 51.2 }).indexOf('Energia nominal'), -1);

  // ---------------------------------------------------------------- datasheet no dimensionamento: eficiência, DoD e potências
  const premD = D.premissas;
  perto('η de ciclo: sem dados = premissa', C.eficienciaCiclo({}, {}, premD, false), 0.92, 1e-12);
  perto('η de ciclo: bateria 96% × inversor típico 97%', C.eficienciaCiclo({ eficiencia: 96 }, {}, premD, false), 0.96 * 0.97, 1e-12);
  perto('η de ciclo: bateria típica 95% × inversor 94,5%', C.eficienciaCiclo({}, { efBateria: 94.5 }, premD, false), 0.95 * 0.945, 1e-12);
  perto('η de ciclo: BESS usa só a do gabinete', C.eficienciaCiclo({ eficiencia: 90 }, { efBateria: 97 }, premD, true), 0.9, 1e-12);
  perto('DoD: energia útil ÷ nominal', C.dodBateria({ energia: 5.12, energiaUtil: 4.6 }, '', premD), 4.6 / 5.12, 1e-12);
  perto('DoD: o da proposta prevalece', C.dodBateria({ dod: 95 }, 80, premD), 0.8, 1e-12);
  perto('bateria: potência contínua = corrente × tensão', C.potenciaUnidade({ iDescargaMax: 100, tensao: 51.2 }), 5.12, 1e-12);
  perto('inversor: potência de bateria = corrente máx. × tensão do banco', C.potenciaBateriaInversor({ iDescargaMax: 135 }, 51.2, 'descarga'), 6.912, 1e-12);
  perto('inversor: potência de bateria do datasheet prevalece', C.potenciaBateriaInversor({ pBateriaMax: 6, iDescargaMax: 135 }, 51.2), 6, 1e-12);
  const invPFV = { id: 'a', tipo: 'inversor', potencia: 5, fases: 'Monofásico', pFVMax: 5.5 };
  igual('sugestão: respeita a entrada FV máxima do datasheet', C.sugerirInversor(6, 'mono', [invPFV, { id: 'b', tipo: 'inversor', potencia: 5, fases: 'Monofásico' }], premD, 0, 0, 0).inv.id, 'b');

  // ---------------------------------------------------------------- datasheet no dimensionamento: strings e correntes por MPPT
  const modDS = { id: 'mod-ds', tipo: 'modulo', ativo: true, fabricante: 'X', modelo: 'M620', potencia: 620, voc: 48.5, vmp: 40.2, isc: 16.3, area: 2.7 };
  const invDS = { id: 'inv-ds', tipo: 'inversor', ativo: true, fabricante: 'Y', modelo: 'Z-5K', potencia: 5, fases: 'Monofásico', mppts: 2, stringsPorMppt: 1,
    vmaxCC: 600, mpptMin: 90, mpptMax: 520, vPartida: 100, imaxMppt: 16, iscMaxMppt: 20 };
  const calcS = function (inv, mod, extra) {
    const c = ctxReferencia();
    c.equipamentos.push(Object.assign({}, modDS, mod), Object.assign({}, invDS, inv));
    return C.calcular(Object.assign(propostaReferencia(c), { moduloId: 'mod-ds', inversorId: 'inv-ds', nModulos: 9 }, extra), c);
  };
  const temAlerta = function (r, nivel, rx) { return r.alertas.some(function (a) { return a.nivel === nivel && rx.test(a.msg); }); };
  const rStr = calcS({}, {});
  const cStr = ctxReferencia();
  cStr.equipamentos.push(modDS, invDS);
  const docStr = textoModelo(App.Documento.montar(Object.assign(propostaReferencia(cStr), { moduloId: 'mod-ds', inversorId: 'inv-ds', nModulos: 9 }), rStr, cStr, cStr.clientes[0], { w: 1400, h: 752 })).join('\n');
  ok('documento: arranjo de strings e Voc no frio ficam só no painel (fora da proposta impressa)', docStr.indexOf('string(s) de até') < 0 && docStr.indexOf('Voc da string') < 0);
  ok('strings: arranjo dentro do datasheet sem alertas', !rStr.alertas.some(function (a) { return /MPPT|strings para|curto-circuito|partida|limitação/.test(a.msg); }), rStr.alertas.map(function (a) { return a.msg; }).join(' | '));
  igual('strings: 1 string de 9 por MPPT, 2 entradas', [rStr.strings.nStrings, rStr.strings.porString, rStr.strings.porMppt, rStr.strings.entradas].join('/'), '1/9/1/2');
  perto('strings: Imp do módulo = Pmáx ÷ Vmp', rStr.strings.impMppt, 620 / 40.2, 1e-9);
  ok('strings: Isc do módulo acima do máximo por MPPT = erro', temAlerta(calcS({}, { isc: 21 }), 'erro', /curto-circuito por MPPT/));
  ok('strings: Imp acima da corrente máx. de entrada = aviso de limitação', temAlerta(calcS({ imaxMppt: 14 }, {}), 'aviso', /limitação de corrente/));
  const rStr2 = calcS({ mppts: 1, stringsPorMppt: 2 }, {}, { nModulos: 20, nInversores: 1 });
  ok('strings: 2 strings no mesmo MPPT somam o Isc', rStr2.strings.porMppt === 2 && temAlerta(rStr2, 'erro', /2 × 16,3 A = 32,6 A/), rStr2.alertas.map(function (a) { return a.msg; }).join(' | '));
  ok('strings: mais strings que entradas = erro', temAlerta(calcS({}, {}, { nModulos: 30, nInversores: 1 }), 'erro', /3 strings para 2 entradas/));
  ok('strings: tensão acima da faixa MPPT = aviso', temAlerta(calcS({ mpptMax: 300 }, {}), 'aviso', /acima da faixa MPPT máxima/));
  ok('strings: Voc abaixo da tensão de partida = aviso', temAlerta(calcS({}, {}, { nModulos: 2 }), 'aviso', /tensão de partida/));

  // ---------------------------------------------------------------- datasheet do módulo no dimensionamento
  const premT = Object.assign(U.clone(D.premissas), { tempMinima: 0, tempMaxCelula: 70 });
  perto('módulo: Voc no frio pelo coeficiente (−0,25%/°C a 0 °C)', C.vocFrio({ voc: 48.5, coefVoc: -0.25 }, premT), 48.5 * 1.0625, 1e-9);
  perto('módulo: sem coeficiente usa o fator das premissas', C.vocFrio({ voc: 48.5 }, premT), 48.5 * 1.12, 1e-9);
  perto('módulo: Vmp no calor (célula a 70 °C)', C.vmpQuente({ vmp: 40.2, coefVoc: -0.25 }, premT), 40.2 * (1 - 0.0025 * 45), 1e-9);
  perto('módulo: Imp do datasheet ou Pmáx ÷ Vmp', C.impModulo({ imp: 15.1, potencia: 620, vmp: 40.2 }) + C.impModulo({ potencia: 620, vmp: 40.2 }), 15.1 + 620 / 40.2, 1e-9);
  perto('módulo: área pelas dimensões', C.areaModulo({ comprimento: 2382, largura: 1134 }), 2.701188, 1e-9);
  perto('datasheet: área do módulo calculada na leitura', DS.converter('modulo', { fabricante: 'T', modelo: 'M', potencia: 620, comprimento: 2382, largura: 1134, coefVoc: 0.25 }).area, 2.701, 1e-9);
  igual('datasheet: coeficiente de Voc sempre negativo', DS.converter('modulo', { fabricante: 'T', modelo: 'M', coefVoc: 0.25 }).coefVoc, -0.25);
  const rSv = calcS({ vmaxCC: 1100 }, { coefVoc: -0.25, vMaxSistema: 1000 }, { nModulos: 19 });
  igual('strings: limite pela tensão máxima do sistema do módulo (1000 V ÷ 51,5 V)', rSv.strings.maxSerie + (rSv.strings.limitePeloModulo ? ' (módulo)' : ''), '19 (módulo)');
  ok('strings: Vmp no calor abaixo da faixa MPPT = aviso (no STC passaria)', temAlerta(calcS({ mpptMin: 230 }, { coefVoc: -0.25 }, { nModulos: 6 }), 'aviso', /com a célula a 70 °C/) &&
    !temAlerta(calcS({ mpptMin: 230 }, {}, { nModulos: 6 }), 'aviso', /faixa MPPT mínima/));
  ok('strings: 3 strings em paralelo acima do fusível do módulo = aviso', temAlerta(calcS({ mppts: 1, stringsPorMppt: 3, iscMaxMppt: 60, imaxMppt: 60 }, { fusivelMax: 25 }, { nModulos: 30, nInversores: 1 }), 'aviso', /fusíveis de string/));
  const rDeg = calcS({}, { degradacaoAnual: 0.4, comprimento: 2382, largura: 1134, area: null });
  perto('módulo: degradação do datasheet na projeção de geração', rDeg.cen.fin.anos[1].geracao / rDeg.cen.fin.anos[0].geracao, 0.996, 1e-9);
  perto('módulo: área do telhado pelas dimensões do datasheet', rDeg.areaModulo, 2.701188, 1e-9);

  // ---------------------------------------------------------------- datasheet no dimensionamento: microinversor
  const calcM = function (inv, mod) {
    const c = ctxReferencia();
    c.equipamentos.push(Object.assign({}, modDS, mod), Object.assign({ id: 'mic-ds', tipo: 'micro', ativo: true, fabricante: 'H', modelo: 'M-2000', potencia: 2, fases: 'Monofásico',
      modulosPorUnidade: 4, mppts: 4, iscMaxMppt: 20, imaxMppt: 16, maxPorRamal: 3 }, inv));
    return C.calcular(Object.assign(propostaReferencia(c), { topologia: 'micro', moduloId: 'mod-ds', inversorId: 'mic-ds', nModulos: 40 }), c);
  };
  const rMic = calcM({}, {});
  igual('micro: 10 unidades em 4 ramais CA (máx. 3 por ramal)', rMic.nInversores + '/' + rMic.ramaisMicro, '10/4');
  ok('micro: Isc do módulo acima do máximo por entrada = erro', temAlerta(calcM({}, { isc: 21 }), 'erro', /por entrada do microinversor/));
  ok('micro: Imp acima da corrente máx. por entrada = aviso', temAlerta(calcM({ imaxMppt: 14 }, {}), 'aviso', /limitação de corrente/));

  // ---------------------------------------------------------------- datasheet no dimensionamento: inversor híbrido e baterias
  const hibDS = { id: 'hib-ds', tipo: 'hibrido', ativo: true, fabricante: 'D', modelo: 'H-6K', potencia: 6, potenciaBackup: 6, fases: 'Monofásico', mppts: 2, tipoBateria: 'LV',
    vBatMin: 40, vBatMax: 60, iDescargaMax: 100, iCargaMax: 100, efBateria: 95, paraleloMax: 1 };
  const batDS = { id: 'bat-ds', tipo: 'bateria', ativo: true, fabricante: 'B', modelo: 'B12', energia: 2.4, tensao: 12, tipoBateria: 'LV', eficiencia: 85, dod: 50, picoKW: 0.2 };
  let ultimoH = null;
  const calcH = function (inv, bat, extra) {
    const c = ctxReferencia();
    c.premissas = U.clone(D.premissas);
    c.equipamentos.push(Object.assign({}, hibDS, inv), Object.assign({}, batDS, bat));
    ultimoH = { c: c };
    return C.calcular(ultimoH.p = Object.assign(propostaReferencia(c), { tipoSistema: 'hibrido', inversorId: 'hib-ds', bateriaId: 'bat-ds', nModulos: 10, cargas: U.clone(D.cargasExemplo),
      autonomiaHoras: 6, cenarioEscolhido: 'backup', cenarios: { backup: { n: 4 } }, valorTotal: 32000, premissas: c.premissas }, extra), c);
  };
  const rHd = calcH({}, {});
  const docHd = textoModelo(App.Documento.montar(ultimoH.p, rHd, ultimoH.c, ultimoH.c.clientes[0], { w: 1400, h: 752 })).join('\n');
  ok('documento: tensão do banco fica só no painel (fora da proposta impressa)', docHd.indexOf('faixa do inversor') < 0 && /🔋 Banco de baterias: 4 × /.test(docHd));
  igual('híbrido: baterias de 12 V em série até a faixa do inversor (40–60 V)', rHd.hibrido.serie + ' × 12 V = ' + rHd.hibrido.tensaoBanco + ' V', '4 × 12 V = 48 V');
  perto('híbrido: η de ciclo = bateria 85% × inversor 95%', rHd.hibrido.eficiencia, 0.85 * 0.95, 1e-12);
  perto('híbrido: capacidade necessária usa a η dos datasheets', rHd.hibrido.capNecessaria, rHd.hibrido.energiaBackup / 1000 / (0.5 * 0.85 * 0.95), 1e-9);
  perto('híbrido: potência de bateria do inversor = 100 A × 48 V', rHd.hibrido.pBateriaInv, 4.8, 1e-9);
  ok('híbrido: pico de partida acima do pico das baterias = aviso', temAlerta(rHd, 'aviso', /potência de pico do banco de baterias/));
  ok('híbrido: banco fora da faixa de tensão do inversor = erro', temAlerta(calcH({ tensaoBateria: 48 }, { tensao: 100 }), 'erro', /fora da faixa de tensão de bateria do inversor/));
  ok('híbrido: alta tensão fora da faixa do inversor = erro', temAlerta(calcH({ tipoBateria: 'HV', vBatMin: 250, vBatMax: 600 }, { tipoBateria: 'HV', tensao: 204.8, vMin: 150, vMax: 220 }), 'erro', /fora da faixa de bateria do inversor/));
  ok('híbrido: mais inversores que o paralelismo do datasheet = aviso', temAlerta(calcH({}, {}, { nInversores: 2 }), 'aviso', /operação sem paralelismo/));
  ok('híbrido: dentro dos limites, sem alerta de tensão', !rHd.alertas.some(function (a) { return /faixa de tensão|faixa de bateria/.test(a.msg); }));

  // ---------------------------------------------------------------- base v6 → v7: catálogo zerado sem mudar propostas
  (function () {
    const S = App.Store;
    const chaves = ['col.equipamentos', 'col.propostas', 'col.localidades', 'col.concessionarias', 'col.pagamentos', 'removidos.v7', 'v'];
    const guardado = {};
    chaves.forEach(function (k) { guardado[k] = localStorage.getItem('gsp.' + k); });
    try {
      const cm = ctxReferencia();
      ['equipamentos', 'localidades', 'concessionarias', 'pagamentos'].forEach(function (k) { localStorage.setItem('gsp.col.' + k, JSON.stringify(cm[k])); });
      const fixa = Object.assign(propostaReferencia(cm), { id: 'pf' });
      const auto = Object.assign(propostaReferencia(cm), { id: 'pa', inversorId: '' });
      localStorage.setItem('gsp.col.propostas', JSON.stringify([fixa, auto]));
      const invAuto = C.calcular(U.clone(auto), C.contexto());
      S.migrar(6);
      const depois = S.list('equipamentos');
      const pa = S.get('propostas', 'pa');
      const rAuto = C.calcular(U.clone(pa), C.contexto());
      igual('migração v7: versão da base (atual)', localStorage.getItem('gsp.v'), '8');
      ok('migração v7: inversor usado fica inativo e arquivado', depois.some(function (e) { return e.id === 'inv-sofar-4' && e.ativo === false && e.arquivado; }));
      igual('migração v7: proposta automática fixa o inversor que já usava', pa.inversorId, invAuto.inversor.id);
      ok('migração v7: resultado da proposta automática inalterado', rAuto.nInversores === invAuto.nInversores && Math.abs(rAuto.total - invAuto.total) < 1e-6);
      const nUso = new Set([fixa.moduloId, fixa.inversorId, invAuto.inversor.id]).size;
      igual('migração v7: só ficam os equipamentos em uso (módulo e inversores)', depois.filter(function (e) { return DS.TIPOS.indexOf(e.tipo) >= 0; }).length, nUso);
      ok('migração v7: módulo usado fica inativo', depois.some(function (e) { return e.id === fixa.moduloId && e.ativo === false && e.arquivado; }));
      igual('migração v7: cópia de segurança dos removidos', S.removidosV7().length, window.EQUIP_TESTE.length - nUso);
      igual('migração v7: restauração devolve os removidos', S.restaurarRemovidosV7(), window.EQUIP_TESTE.length - nUso);
      ok('migração v7: cópia descartada após restaurar', !S.removidosV7().length);
    } finally {
      chaves.forEach(function (k) { if (guardado[k] == null) localStorage.removeItem('gsp.' + k); else localStorage.setItem('gsp.' + k, guardado[k]); });
    }
  })();

  // ---------------------------------------------------------------- materiais: proposta solar × propostas avulsas
  (function () {
    const tomada = { id: 'u-tomada', tipo: 'material', ativo: true, descricao: 'Tomada industrial 32A', regra: 'fixa', fator: 1, unidade: 'un', aplicaEm: 'ambos', autoIncluir: true, preco: 150 };
    const disjuntor = Object.assign({}, tomada, { id: 'u-disjuntor', descricao: 'Disjuntor CC 2P 20A', preco: 90 });
    const cm = Object.assign(ctxReferencia(), { avulsas: [{ id: 'av1', materiais: [{ id: 'm1', equipamentoId: 'u-tomada', descricao: 'Tomada industrial 32A', qtd: 2, unidade: 'un', precoUnit: 150 }] }] });
    cm.equipamentos = cm.equipamentos.concat([tomada, disjuntor]);
    const mc4 = cm.equipamentos.find(function (e) { return e.id === 'mat-mc4'; });
    igual('materiais: criado pelo usuário e usado em avulsa → só avulsas', C.usoMaterial(tomada, cm), 'avulsa');
    igual('materiais: criado pelo usuário sem avulsa → continua nas duas', C.usoMaterial(disjuntor, cm), 'ambas');
    igual('materiais: catálogo inicial → proposta solar', C.usoMaterial(mc4, cm), 'solar');
    igual('materiais: escolha do cadastro prevalece', C.usoMaterial(Object.assign({}, tomada, { uso: 'ambas' }), cm), 'ambas');
    const rM = C.calcular(Object.assign(U.clone(p), { itens: [] }), cm);
    ok('materiais: lista automática da solar sem os materiais das avulsas', !rM.itens.some(function (i) { return i.equipamentoId === 'u-tomada'; }) &&
      rM.itens.some(function (i) { return i.equipamentoId === 'u-disjuntor'; }) && rM.itens.some(function (i) { return i.equipamentoId === 'mat-mc4'; }));
    // lista gravada antes da correção: o material da avulsa entrou sozinho; outro foi adicionado à mão
    const gravada = U.clone(rM.itens).concat([
      { id: 'x1', equipamentoId: 'u-tomada', categoria: 'material', descricao: 'Tomada industrial 32A', qtd: 1, unidade: 'un', precoUnit: 150 },
      { id: 'x2', equipamentoId: 'u-tomada', categoria: 'material', descricao: 'Tomada (incluída à mão)', qtd: 1, unidade: 'un', precoUnit: 150, manual: true }
    ]);
    const rG = C.calcular(Object.assign(U.clone(p), { itens: gravada, kitManual: false }), cm);
    ok('materiais: lista gravada perde o que entrou sozinho e mantém o incluído à mão', !rG.itens.some(function (i) { return i.id === 'x1'; }) && rG.itens.some(function (i) { return i.id === 'x2'; }));
    perto('materiais: soma do kit sem o material da avulsa', rG.kitFVSoma, C.calcular(Object.assign(U.clone(p), { itens: U.clone(rM.itens), kitManual: false }), cm).kitFVSoma + 150, 1e-9);
    // migração v8: grava o uso dos materiais antigos
    const S = App.Store;
    const chaves = ['col.equipamentos', 'col.avulsas', 'v'];
    const guardado = {};
    chaves.forEach(function (k) { guardado[k] = localStorage.getItem('gsp.' + k); });
    try {
      const antigos = cm.equipamentos.map(function (e) { const c = U.clone(e); if (c.tipo === 'material') delete c.uso; return c; });
      localStorage.setItem('gsp.col.equipamentos', JSON.stringify(antigos));
      localStorage.setItem('gsp.col.avulsas', JSON.stringify(cm.avulsas));
      S.migrar(7);
      const uso = function (id) { return S.get('equipamentos', id).uso; };
      ok('migração v8: uso gravado (avulsa, ambas, solar)', uso('u-tomada') === 'avulsa' && uso('u-disjuntor') === 'ambas' && uso('mat-mc4') === 'solar');
      ok('migração v8: material das avulsas deixa de entrar automaticamente na solar', S.get('equipamentos', 'u-tomada').autoIncluir === false);
      igual('migração v8: versão da base', localStorage.getItem('gsp.v'), '8');
    } finally {
      chaves.forEach(function (k) { if (guardado[k] == null) localStorage.removeItem('gsp.' + k); else localStorage.setItem('gsp.' + k, guardado[k]); });
    }
  })();

  // ---------------------------------------------------------------- leitura local do datasheet (sem IA)
  const LL = App.LeituraLocal, LI = LL._internos;
  igual('leitura local: números com vírgula, milhar, faixa e sinal', LI.numeros('1,500 V; 48,5; 40-560; -0.29%/°C; 0,045').join('|'), '1500|48.5|40|560|-0.29|0.045');
  igual('leitura local: faixas', [LI.faixa('40~560'), LI.faixa('320 to 540+'), LI.faixa('16-60'), LI.faixa('≥ 400')].map(JSON.stringify).join(' '), '[40,560] [320,540] [16,60] [400,null]');
  igual('leitura local: menor corrente por entrada', [LI.menorDaLista('4 × 16'), LI.menorDaLista('26+13'), LI.menorDaLista('16/32'), LI.menorDaLista('13')].join('|'), '16|13|16|13');
  igual('leitura local: potência em kW (W, VA, kW)', [LI.kW('5000', 'Nominal Output Power (W)'), LI.kW('6.6', 'Max. Output Power (kVA)'), LI.kW('1600', 'Rated output power (VA)'), LI.kW('7800W', 'PV power')].join('|'), '5|6.6|1.6|7.8');
  igual('leitura local: energia em kWh', [LI.kWh('3552', 'Nominal Capacity (Wh)'), LI.kWh('5.12', 'Energy (kWh)')].join('|'), '3.552|5.12');
  igual('leitura local: garantias e degradação do módulo',
    JSON.stringify(LI.garantiasModulo('12 year Product Workmanship Warranty\n30 year Power Warranty\n1% first year degradation\n0.4% Annual Power Attenuation')),
    '{"garantiaProduto":12,"garantiaPerformance":30,"degradacao1Ano":1,"degradacaoAnual":0.4}');
  ok('leitura local: códigos de modelo', ['GW5000-DNS-30', 'SUN-6K-SG05LP1-EU-SM2', 'HMS-2000-4T', 'US3000C', 'TSM-620NEG19RC.20'].every(LI.ehModelo) &&
    !['IP66', 'MC4-EVO2', '220/230V', 'TS4', '1500V', 'RS485', 'IEC 61215', '50/60Hz'].some(LI.ehModelo));
  // linhas sintéticas: rótulo em x = 30, colunas dos modelos a partir de x = 250 (passo 100)
  const lin = function (y, rot, vals, extra) {
    const cs = [{ t: rot, x: 30, x2: 30 + rot.length * 3.5, h: 7 }];
    (vals || []).forEach(function (v, i) { const x = vals.length === 1 && extra && extra.span ? 350 : 250 + 100 * i; cs.push({ t: String(v), x: x - 10, x2: x + 10, h: 7 }); });
    ((extra && extra.lado) || []).forEach(function (t, i) { cs.push({ t: t, x: 600 + i * 90, x2: 640 + i * 90, h: 7 }); });
    return { y: y, h: 7, pagina: 1, celulas: cs };
  };
  const rLoc = LL.analisar([
    { y: 820, h: 18, pagina: 1, celulas: [{ t: 'GoodWe DNS Series', x: 30, x2: 200, h: 18 }] },
    lin(800, 'Technical Data', ['GW5000-DNS-30', 'GW6000-DNS-30', 'GW8000-DNS-30']),
    lin(790, 'Input', []),
    lin(780, 'Max. Input Voltage (V)', [600], { span: true }),
    lin(770, 'MPPT Operating Voltage Range (V)', ['40~560']),
    lin(760, 'Max. Input Current per MPPT (A)', ['16/16', '16/16', '16/32'], { lado: ['Communication', 'WiFi'] }),
    lin(750, 'Number of MPP Trackers', [2], { span: true }),
    lin(740, 'Output', []),
    lin(730, 'Nominal Output Power (W)', [5000, 6000, 8000]),
    lin(720, 'Grid Type', ['Single phase', 'Single phase', 'Single phase'])
  ], 'inversor');
  igual('leitura local: modelos pelo cabeçalho', rLoc.modelos.map(function (m) { return m.modelo; }).join(','), 'GW5000-DNS-30,GW6000-DNS-30,GW8000-DNS-30');
  igual('leitura local: valor mesclado vale para todos e por coluna', rLoc.modelos.map(function (m) { return [m.vmaxCC, m.mpptMin, m.mpptMax, m.mppts, m.potencia, m.imaxMppt].join('/'); }).join(' '),
    '600/40/560/2/5/16 600/40/560/2/6/16 600/40/560/2/8/16');
  ok('leitura local: tabela ao lado na mesma linha não invade as colunas', rLoc.modelos.every(function (m) { return m.monitoramento === 'WiFi' && m.fabricante === 'GoodWe' && m.fases === 'Monofásico'; }));
  const rPar = LL.analisar([
    { y: 820, h: 24, pagina: 1, celulas: [{ t: 'US3000C', x: 30, x2: 130, h: 24 }] },
    { y: 800, h: 8, pagina: 1, celulas: [{ t: 'Nominal Voltage (V)', x: 30, x2: 110, h: 8 }, { t: '48', x: 170, x2: 180, h: 8 }, { t: 'Nominal Capacity (Wh)', x: 310, x2: 400, h: 8 }, { t: '3552', x: 450, x2: 470, h: 8 }] },
    { y: 784, h: 8, pagina: 1, celulas: [{ t: 'Charge Current (A)', x: 30, x2: 110, h: 8 }, { t: 'Recommend 37 / Max 74', x: 170, x2: 260, h: 8 }, { t: 'Discharge Current (A)', x: 310, x2: 400, h: 8 }, { t: 'Recommend 37 / Max 74', x: 450, x2: 540, h: 8 }] },
    { y: 768, h: 8, pagina: 1, celulas: [{ t: 'Depth of Discharge', x: 30, x2: 110, h: 8 }, { t: '95%', x: 170, x2: 185, h: 8 }, { t: 'Cycle Life', x: 310, x2: 360, h: 8 }, { t: '>6000', x: 450, x2: 470, h: 8 }] },
    { y: 752, h: 8, pagina: 1, celulas: [{ t: 'Battery: LiFePO4 (Pylontech)', x: 30, x2: 150, h: 8 }] }
  ], 'bateria');
  igual('leitura local: tabela de pares rótulo/valor (bateria de um modelo)', [rPar.modelos[0].modelo, rPar.modelos[0].tensao, rPar.modelos[0].energia, rPar.modelos[0].iCargaMax, rPar.modelos[0].iDescargaMax,
    rPar.modelos[0].dod, rPar.modelos[0].ciclos, rPar.modelos[0].quimica, rPar.modelos[0].tipoBateria, rPar.modelos[0].fabricante].join('|'), 'US3000C|48|3.552|37|37|95|6000|LiFePO4|LV|Pylontech');

  // ---------------------------------------------------------------- valores por extenso
  igual('extenso: valor do contrato modelo', U.extenso(86110.55), 'Oitenta e seis mil, cento e dez reais e cinquenta e cinco centavos');
  igual('extenso: 12.700,00', U.extenso(12700), 'Doze mil e setecentos reais');
  igual('extenso: 1.000.000,00', U.extenso(1000000), 'Um milhão de reais');
  igual('extenso: 1,01', U.extenso(1.01), 'Um real e um centavo');
  igual('número por extenso: 80', U.numeroExtenso(80), 'oitenta');
  igual('número por extenso: 2005', U.numeroExtenso(2005), 'dois mil e cinco');
  igual('número por extenso: 1100', U.numeroExtenso(1100), 'mil e cem');
  igual('número por extenso: 1.234.567', U.numeroExtenso(1234567), 'um milhão, duzentos e trinta e quatro mil, quinhentos e sessenta e sete');
  igual('data por extenso', U.dataExtenso('2026-05-20'), '20 de maio de 2026');

  // ---------------------------------------------------------------- contrato
  const K = App.Contrato;
  const parc = K.parcelasPadrao(86110.55, 67305.61);
  igual('contrato: parcelas padrão (equipamentos + 50/50 serviços)', parc.map(function (x) { return U.fmt(x.valor, 2); }).join(' | '), '67.305,61 | 9.402,47 | 9.402,47');
  perto('contrato: soma das parcelas = total', K.total({ parcelas: parc }), 86110.55, 1e-9);
  const parcImpar = K.parcelasPadrao(1000.01, 0);
  perto('contrato: parcelas de valor ímpar fecham o total', K.total({ parcelas: parcImpar }), 1000.01, 1e-9);
  igual('contrato: sem equipamentos → 2 parcelas', parcImpar.length, 2);

  const ctxK = U.clone(ctx);
  ctxK.empresa.cidade = 'Corumbá';
  ctxK.empresa.uf = 'MS';
  const ctK = K.deProposta(Object.assign(U.clone(p), { id: 'p-ref' }), ctxK);
  ctK.modelo = U.clone(D.contrato); // independe de um modelo personalizado salvo neste navegador
  ok('contrato: objeto com a potência', /de 5,625 kWp$/.test(ctK.objeto), ctK.objeto);
  igual('contrato: parcelas da proposta', ctK.parcelas.map(function (x) { return U.fmt(x.valor, 2); }).join(' | '), '8.177,08 | 2.261,46 | 2.261,46');
  igual('contrato: grupos de equipamentos', ctK.equipamentos.map(function (g) { return g.titulo; }).join(', '), 'Módulos Fotovoltaicos, Inversores, Estrutura de Fixação, Itens Adicionais');
  perto('contrato: produção mensal = geração da proposta', ctK.producao.meses.reduce(function (a, b) { return a + b; }, 0), r.geracaoAnual, 12);
  igual('contrato: vínculo com a proposta', ctK.propostaNumero, 'GE-20260929-012');

  function textoModelo(m) {
    const partes = [];
    (function andar(nos) {
      (nos || []).forEach(function (n) {
        if (n.tipo === 'p') partes.push(n.filhos.filter(function (f) { return f.tipo === 'r'; }).map(function (f) { return f.texto; }).join(''));
        andar(n.linhas); andar(n.celulas); if (n.tipo !== 'p') andar(n.filhos);
      });
    })(m.corpo);
    return partes;
  }
  // contrato com baterias: linha de garantia das baterias logo após a dos inversores
  const ctxKH = U.clone(ctxH);
  const ctKH = K.deProposta(Object.assign(U.clone(pH), { id: 'p-hib' }), ctxKH);
  ctKH.modelo = U.clone(D.contrato);
  const txKH = textoModelo(K.montar(ctKH, ctxKH, { w: 1400, h: 752 }, ctxKH.clientes[0]));
  const iInvK = txKH.indexOf('Inversores'), iBatK = txKH.indexOf('Baterias'), iEstK = txKH.indexOf('Estruturas de Fixação');
  ok('contrato com baterias: garantia das baterias após os inversores', iInvK >= 0 && iBatK > iInvK && iEstK > iBatK, [iInvK, iBatK, iEstK].join(','));
  ok('contrato com baterias: prazo e cobertura conforme o fabricante', txKH[iBatK + 1] === '10 anos' && /retenção de capacidade/.test(txKH[iBatK + 2]), txKH.slice(iBatK, iBatK + 3).join(' | '));
  ok('contrato sem baterias: sem linha de baterias na garantia', textoModelo(K.montar(ctK, ctxK, { w: 1400, h: 752 }, ctxK.clientes[0])).indexOf('Baterias') < 0);
  // gráfico da proposta = gráfico do contrato (mesma produção mês a mês, título e descrição)
  const dgP = App.Documento.dadosGrafico(r, ctx);
  igual('gráfico da proposta: mesma produção mês a mês do contrato', dgP.meses.join(','), ctK.producao.meses.join(','));
  ok('gráfico da proposta: título, descrição do sistema e rodapé do contrato', /ESTIMATIVA DE PRODUÇÃO MENSAL.*5,625 kWp/.test(dgP.titulo) && dgP.subtitulo === ctK.producao.subtitulo && /HSP mensal/.test(dgP.rodape), dgP.titulo + ' | ' + dgP.subtitulo);
  perto('gráfico da proposta: total anual = geração anual', dgP.meses.reduce(function (a, b) { return a + b; }, 0), r.geracaoAnual, 6);
  const mK = K.montar(ctK, ctxK, { w: 1400, h: 752 }, ctxK.clientes[0]);
  const txK = textoModelo(mK);
  const clausulas = txK.filter(function (s) { return /^Cláusula \d+ª/.test(s); });
  igual('contrato: 20 cláusulas numeradas', clausulas.length, 20);
  ok('contrato: referência à cláusula de pagamento resolvida', txK.some(function (s) { return /estabelecidas na Cláusula 11ª\.$/.test(s); }));
  ok('contrato: valor por extenso na cláusula de preço', txK.some(function (s) { return s.indexOf('R$ 12.700,00 (Doze mil e setecentos reais)') >= 0; }));
  ok('contrato: prazo por extenso', txK.some(function (s) { return s.indexOf('60 (sessenta) dias') >= 0; }));
  ok('contrato: local da produção sem repetição', txK.some(function (s) { return s.indexOf('plano inclinado para Corumbá – MS, com fator') >= 0; }));
  igual('contrato: seções numeradas', txK.filter(function (s) { return /^\d+\. [A-ZÇÃÕÉÍÓÚÊÂ ,]+$/.test(s); }).map(function (s) { return s.split('.')[0]; }).join(','), '1,2,3,4,5,6,7,8,9,10');
  ok('contrato: local e data por extenso', txK.some(function (s) { return s.indexOf('Data: ' + U.dataExtenso(ctK.data) + '.') >= 0; }));
  const semProd = K.montar(Object.assign(U.clone(ctK), { producao: { incluir: false } }), ctxK, { w: 1400, h: 752 }, ctxK.clientes[0]);
  ok('contrato: sem produção a seção é omitida e a numeração segue', textoModelo(semProd).some(function (s) { return s === '3. OBRIGAÇÕES DAS PARTES'; }));
  const xmlK = App.Docx.serializar(mK);
  ok('contrato: XML do documento válido', !new DOMParser().parseFromString(xmlK.documento, 'application/xml').querySelector('parsererror'));
  ok('contrato: XML do cabeçalho e rodapé válidos', !new DOMParser().parseFromString(xmlK.header, 'application/xml').querySelector('parsererror') &&
    !new DOMParser().parseFromString(xmlK.footer, 'application/xml').querySelector('parsererror'));
  ok('contrato: página A4 com margens do modelo', /<w:pgSz w:w="11906" w:h="16838"\/><w:pgMar w:top="1800" w:right="1134" w:bottom="1600" w:left="1134"/.test(xmlK.documento));

  // ---------------------------------------------------------------- proposta avulsa
  const Av = App.Avulsa;
  const av = Object.assign(Av.novo(ctx), { numero: 'GE-20260929-013', data: '2026-09-29', clienteId: 'cli', desconto: 100 });
  av.itens = [Av.itemDeServico(Object.assign({}, D.servicos[1], { preco: 850 })), Object.assign(Av.itemDeServico(D.servicos[0]), { qtd: 65, precoUnit: 25 })];
  const rAv = Av.calcular(av, ctx);
  perto('avulsa: subtotal', rAv.subtotal, 2475, 1e-9);
  perto('avulsa: total com desconto', rAv.total, 2375, 1e-9);
  igual('avulsa: opções de pagamento', rAv.pagamentos.length, ctx.pagamentos.length);
  const mAv = Av.montar(av, ctx, ctx.clientes[0], { w: 1400, h: 752 });
  ok('avulsa: XML válido', !new DOMParser().parseFromString(App.Docx.serializar(mAv).documento, 'application/xml').querySelector('parsererror'));
  ok('avulsa: linha de total', textoModelo(mAv).indexOf('VALOR TOTAL') >= 0 && textoModelo(mAv).indexOf('R$ 2.375,00') >= 0);
  ok('avulsa: quadro da capa centralizado', /<w:tblW w:w="6084" w:type="dxa"\/><w:jc w:val="center"\/>/.test(App.Docx.serializar(mAv).documento));
  ok('avulsa sem materiais: sem a seção de materiais', textoModelo(mAv).indexOf('MATERIAIS UTILIZADOS') < 0);
  const avM = Object.assign(U.clone(av), { materiais: [
    { id: 'm1', descricao: 'Cabo solar 6 mm²', qtd: 20, unidade: 'm', precoUnit: 8 },
    { id: 'm2', descricao: 'Conector MC4 (par)', qtd: 4, unidade: 'pt', precoUnit: '' }
  ] });
  const rAvM = Av.calcular(avM, ctx);
  perto('avulsa com materiais: serviços', rAvM.servicos, 2475, 1e-9);
  perto('avulsa com materiais: materiais', rAvM.materiais, 160, 1e-9);
  perto('avulsa com materiais: total = serviços + materiais − desconto', rAvM.total, 2475 + 160 - 100, 1e-9);
  const txAvM = textoModelo(Av.montar(avM, ctx, ctx.clientes[0], { w: 1400, h: 752 }));
  ok('avulsa com materiais: seção, subtotais e total no documento', ['MATERIAIS UTILIZADOS', 'Cabo solar 6 mm²', 'Subtotal dos materiais', 'Subtotal dos serviços', 'R$ 160,00', 'R$ 2.535,00']
    .every(function (x) { return txAvM.some(function (l) { return l.indexOf(x) >= 0; }); }));
  ok('avulsa com materiais: item sem preço sai como incluso', txAvM.indexOf('Incluso') >= 0 && txAvM.some(function (l) { return /fornecidos dentro do valor dos serviços/.test(l); }));
  ok('avulsa com materiais: material do cadastro', Av.itemDeMaterial({ id: 'mat-x', tipo: 'material', descricao: 'Disjuntor 20 A', unidade: 'un', preco: 35 }).precoUnit === 35);

  // ---------------------------------------------------------------- projetos realizados (portfólio) — fotos sintéticas de teste
  function fotoTeste(cor, rotulo) {
    const cv = document.createElement('canvas');
    cv.width = 400; cv.height = 300;
    const g = cv.getContext('2d');
    g.fillStyle = cor; g.fillRect(0, 0, 400, 300);
    g.fillStyle = '#FFFFFF'; g.font = 'bold 28px sans-serif'; g.fillText(rotulo, 20, 160);
    return { dataURL: cv.toDataURL('image/jpeg', 0.8), w: 400, h: 300 };
  }
  function projTeste(id, tipo, seg, cidade, conclusao, comFotos) {
    return {
      id: id, titulo: 'Projeto de teste ' + id, segmento: seg, tipoSistema: tipo, cidade: cidade, uf: 'MS', conclusao: conclusao,
      potenciaKwp: 5.4, modulos: '9 × Módulo de teste 600 W', inversor: 'Inversor de teste 5 kW', geracaoMes: 690, economiaMes: 520, reducaoPct: 85,
      descricao: 'Destaque de teste.', foto1: comFotos ? fotoTeste('#1E3A8A', 'FOTO DE TESTE A') : null, foto2: comFotos ? fotoTeste('#166534', 'FOTO DE TESTE B') : null, exibir: true
    };
  }
  const ctxP = U.clone(ctx);
  ctxP.projetos = [
    projTeste('p1', 'ongrid', 'residencial', 'Corumbá', '03/2024', true),
    projTeste('p2', 'hibrido', 'comercial', 'Ladário', '08/2025', true),
    projTeste('p3', 'ongrid', 'comercial', 'Campo Grande', '10/2025', true),
    projTeste('p4', 'ongrid', 'residencial', 'Corumbá', '09/2025', true),
    projTeste('p5', 'ongrid', 'residencial', 'Corumbá', '12/2025', false),
    projTeste('p6', 'ongrid', 'rural', 'Miranda', '01/2023', true)
  ];
  const rP = C.calcular(p, ctxP);
  igual('projetos: 4 prontos — mesmo tipo, segmento e cidade primeiro, depois os mais recentes', rP.projetos.map(function (x) { return x.id; }).join(','), 'p4,p1,p3,p6');
  const alertaProj = function (rr) { return rr.alertas.some(function (x) { return /Projetos realizados/.test(x.msg); }); };
  ok('projetos: sem alerta com 4 projetos prontos', !alertaProj(rP));
  ok('projetos: alerta quando não há projetos cadastrados', alertaProj(r));
  igual('projetos: seção desligada na proposta', C.calcular(Object.assign(U.clone(p), { incluirProjetos: false }), ctxP).projetos.length, 0);
  const ctxP0 = U.clone(ctxP);
  ctxP0.empresa.projetosNaProposta = 0;
  const rP0 = C.calcular(p, ctxP0);
  ok('projetos: 0 na configuração = sem seção e sem alerta', rP0.projetos.length === 0 && !alertaProj(rP0));
  const mP = App.Documento.montar(p, rP, ctxP, ctxP.clientes[0], { w: 1400, h: 752 });
  const txP = textoModelo(mP);
  const titulos = function (tx) { return tx.filter(function (x) { return /^\d+   \S/.test(x); }).map(function (x) { return x.replace(/   /, ' '); }); };
  igual('ordem: resumo, apresentação, projetos e como funciona', titulos(txP).slice(0, 4).join(' | '),
    '1 Sua proposta em uma página | 2 Apresentação da empresa | 3 Projetos realizados | 4 Como a energia solar funciona na sua casa');
  const mSemP = App.Documento.montar(p, r, ctx, ctx.clientes[0], { w: 1400, h: 752 });
  igual('sem projetos: seções na ordem da proposta amigável', titulos(textoModelo(mSemP)).join(' | '),
    '1 Sua proposta em uma página | 2 Apresentação da empresa | 3 Como a energia solar funciona na sua casa | 4 Seu sistema solar | ' +
    '5 O que está incluso | 6 Quanto você economiza | 7 Retorno do investimento | 8 Próximos passos');
  ok('passo a passo: fora da proposta por padrão', D.textos.passoNaProposta === false && !mSemP.imagens.passos && textoModelo(mSemP).indexOf(D.textos.passoIntro) < 0);
  const ctxPassos = U.clone(ctxP); ctxPassos.textos = Object.assign(U.clone(ctxP.textos || D.textos), { passoNaProposta: true });
  const mPassos = App.Documento.montar(p, rP, ctxPassos, ctxP.clientes[0], { w: 1400, h: 752 });
  ok('passo a passo ligado: linha do tempo em PNG com a frase de abertura, logo após os projetos', /^data:image\/png;base64,/.test(mPassos.imagens.passos || '') &&
    textoModelo(mPassos).indexOf(D.textos.passoIntro) >= 0 && titulos(textoModelo(mPassos)).slice(2, 4).join(' | ') === '3 Projetos realizados | 4 Passo a passo');
  const pa6 = App.Passos.imagem(D.textos.cronograma), pa3 = App.Passos.imagem(D.textos.cronograma.slice(0, 3));
  ok('passo a passo: altura cresce com o número de etapas', pa6.proporcao > pa3.proporcao * 1.6 && pa6.proporcao < 1.4, pa3.proporcao.toFixed(3) + ' / ' + pa6.proporcao.toFixed(3));
  const ctxSemCron = U.clone(ctx); ctxSemCron.textos = U.clone(ctx.textos || D.textos); ctxSemCron.textos.cronograma = []; ctxSemCron.textos.passoNaProposta = true;
  const mSemCron = App.Documento.montar(p, r, ctxSemCron, ctx.clientes[0], { w: 1400, h: 752 });
  ok('passo a passo: sem etapas, sem a seção', !mSemCron.imagens.passos && textoModelo(mSemCron).indexOf('2. PASSO A PASSO') < 0);
  igual('projetos: 2 fotos por projeto no documento (+ capa, como funciona e saldo)', Object.keys(mP.imagens).length, 11);
  ok('projetos: ficha técnica com CO₂ evitado', txP.indexOf('Potência instalada') >= 0 && txP.indexOf('Geração média') >= 0 && txP.some(function (x) { return /^\d+(,\d)? t\/ano$/.test(x); }));
  const xmlP = App.Docx.serializar(mP);
  ok('projetos: fotos referenciadas no Word', /r:embed="rIdImg1"/.test(xmlP.documento) && /r:embed="rIdImg8"/.test(xmlP.documento));
  ok('projetos: XML do Word válido', !new DOMParser().parseFromString(xmlP.documento, 'application/xml').querySelector('parsererror'));
  ok('capa: faixa da marca e quadro azul com o cliente, o número e a validade', mP.imagens.capa && /PREPARADA PARA/.test(xmlP.documento) && /Válida até/.test(xmlP.documento));

  // ---------------------------------------------------------------- docx
  async function testarDocx() {
    const out = { ref: null, hib: null };
    try {
      const gc = await K.gerarDocx(ctK, ctxK);
      const head = new Uint8Array(await gc.blob.slice(0, 2).arrayBuffer());
      ok('contrato: docx gerado', head[0] === 0x50 && head[1] === 0x4b && gc.blob.size > 20000, gc.blob.size + ' bytes');
      const pc = await K.gerarPdf(ctK, ctxK);
      ok('contrato: pdf gerado', new TextDecoder().decode(await pc.blob.slice(0, 5).arrayBuffer()) === '%PDF-' && pc.blob.size > 20000, pc.blob.size + ' bytes');
      out.contrato = gc; out.pdfContrato = pc;
      const ga = await Av.gerarDocx(av, ctx);
      const pa = await Av.gerarPdf(av, ctx);
      ok('avulsa: docx e pdf gerados', ga.blob.size > 20000 && pa.blob.size > 20000, ga.blob.size + ' / ' + pa.blob.size + ' bytes');
      igual('avulsa: nome do arquivo', pa.nome, 'Proposta_Servicos_ClienteExemplo_20260929.pdf');
    } catch (e) {
      ok('contrato/avulsa gerados', false, e && e.stack || String(e));
    }
    try {
      const g = await App.Docx.gerar(p, ctx);
      ok('docx gerado (referência)', g.blob.size > 20000, g.blob.size + ' bytes');
      const head = new Uint8Array(await g.blob.slice(0, 4).arrayBuffer());
      ok('docx é ZIP', head[0] === 0x50 && head[1] === 0x4b);
      out.ref = g;
      const gh = await App.Docx.gerar(pH, ctxH);
      ok('docx gerado (híbrido)', gh.blob.size > 20000, gh.blob.size + ' bytes');
      out.hib = gh;
    } catch (e) {
      ok('docx gerado', false, e && e.stack || String(e));
    }
    try {
      const gP = await App.Docx.gerar(p, ctxP);
      const pdfP = await App.Pdf.gerar(p, ctxP);
      ok('projetos: Word e PDF gerados com as fotos', gP.blob.size > 30000 && new TextDecoder().decode(await pdfP.blob.slice(0, 5).arrayBuffer()) === '%PDF-',
        gP.blob.size + ' / ' + pdfP.blob.size + ' bytes');
      out.pdfProjetos = pdfP;
    } catch (e) {
      ok('projetos: Word e PDF gerados', false, e && e.stack || String(e));
    }
    try {
      const pdf = await App.Pdf.gerar(p, ctx);
      const head = new TextDecoder().decode(await pdf.blob.slice(0, 5).arrayBuffer());
      ok('pdf gerado (referência)', head === '%PDF-' && pdf.blob.size > 20000, pdf.blob.size + ' bytes');
      ok('pdf com fonte Arimo (métrica Arial)', pdf.fonteOk, pdf.fonteOk ? 'Arimo' : 'Helvetica (sem internet?)');
      igual('nome do pdf', pdf.nome, 'Proposta_Solar_ClienteExemplo_20260929.pdf');
      out.pdfRef = pdf;
      const pdfH = await App.Pdf.gerar(pH, ctxH);
      ok('pdf gerado (híbrido)', pdfH.blob.size > 20000, pdfH.blob.size + ' bytes');
      out.pdfHib = pdfH;
    } catch (e) {
      ok('pdf gerado', false, e && e.stack || String(e));
    }
    return out;
  }

  // ---------------------------------------------------------------- modelo do documento: cores de fundo válidas
  [['referência', p, ctx, r], ['híbrido', pH, ctxH, rH]].forEach(function (c) {
    const m = App.Documento.montar(c[1], c[3], c[2], c[2].clientes[0], { w: 1400, h: 752 });
    const invalidos = [];
    (function andar(nos) {
      (nos || []).forEach(function (n) {
        if (n.tipo === 'tc' && n.o.fill != null && !/^[0-9A-F]{6}$/.test(String(n.o.fill))) invalidos.push(String(n.o.fill).slice(0, 30));
        andar(n.filhos); andar(n.linhas); andar(n.celulas);
      });
    })(m.corpo.concat(m.cabecalho, m.rodape));
    ok('cores de fundo das células válidas (' + c[0] + ')', !invalidos.length, invalidos.slice(0, 3).join(' | '));
  });
  [['contrato', mK], ['avulsa', mAv]].forEach(function (c) {
    const invalidos = [];
    (function andar(nos) {
      (nos || []).forEach(function (n) {
        if (n.tipo === 'tc' && n.o.fill != null && !/^[0-9A-F]{6}$/.test(String(n.o.fill))) invalidos.push(String(n.o.fill).slice(0, 30));
        andar(n.filhos); andar(n.linhas); andar(n.celulas);
      });
    })(c[1].corpo.concat(c[1].cabecalho, c[1].rodape));
    ok('cores de fundo das células válidas (' + c[0] + ')', !invalidos.length, invalidos.slice(0, 3).join(' | '));
  });

  // ---------------------------------------------------------------- numeração automática (somente leitura do armazenamento)
  const num = App.Store.proximoNumero('2026-09-29');
  ok('número automático no formato PREFIXO-AAAAMMDD-NNN', /^[A-Z0-9]+-20260929-\d{3}$/.test(num.numero), num.numero);

  // ---------------------------------------------------------------- proposta amigável: seções novas
  (function () {
    const m = App.Documento.montar(p, r, ctx, ctx.clientes[0], { w: 1400, h: 752 });
    const tx = textoModelo(m), txt = tx.join('\n'), f = r.fin, a1 = f.anos[0];
    ok('capa: manchete com a redução da conta', /^conta de luz \d+% menor$/m.test(txt) && txt.indexOf('Energia do sol,') >= 0);
    ok('resumo: investimento, economia no 1º ano, retorno e economia em 25 anos', ['Investimento', 'Economia no 1º ano', 'O investimento volta em', 'Economia em 25 anos', U.brl(r.total), U.anosMeses(f.paybackSimples)]
      .every(function (x) { return txt.indexOf(x) >= 0; }));
    ok('resumo: conta de hoje × com energia solar', txt.indexOf('Sua conta de luz por mês') >= 0 && txt.indexOf(U.brl(a1.contaSem)) >= 0 && txt.indexOf(U.brl(a1.contaCom)) >= 0);
    ok('resumo: o que você recebe e as formas de pagamento', txt.indexOf('O que você recebe') >= 0 && /9 módulos .* de 625 Wp/.test(txt) && txt.indexOf('Formas de pagamento') >= 0 &&
      txt.indexOf('Formas de pagamento') < txt.indexOf('Apresentação da empresa'));
    // todas as opções de pagamento no resumo, com parcelas, total e sobra no mês
    const pgs = r.pagamentos;
    ok('resumo: todas as formas de pagamento com parcelas, total e sobra no mês', pgs.length >= 3 && pgs.every(function (pg) {
      return txt.indexOf(pg.label) >= 0 && tx.indexOf(U.brl(pg.total)) >= 0 && (pg.prazo === '1x' || tx.indexOf(parseInt(pg.prazo, 10) + ' × ' + U.brl(pg.parcela)) >= 0);
    }) && ['Parcelas', 'Total pago', 'Sobra no mês*', 'melhor preço', 'pagamento único', D.textos.notaPagamento].every(function (x) { return txt.indexOf(x) >= 0; }) &&
      pgs.every(function (pg) { const sb = f.economiaMes1 - (pg.prazo === '1x' ? 0 : pg.parcela); return tx.indexOf((sb >= 0 ? '+ ' : '− ') + U.brl(Math.abs(sb))) >= 0; }));
    ok('como funciona: ilustração e 5 passos', !!m.imagens.comoFunciona && txt.indexOf('Painéis no telhado captam a luz do sol') >= 0 && txt.indexOf('À noite e em dias nublados você usa a rede') >= 0);
    ok('benefícios personalizados com os números do cliente', txt.indexOf('Por que vale a pena para você') >= 0 && new RegExp('De R\\$ [\\d.]+ para cerca de R\\$ [\\d.]+ por mês').test(txt));
    ok('seu sistema: faixa de indicadores, gráfico e equipamentos com garantia', txt.indexOf('geração média/mês') >= 0 && txt.indexOf('Geração estimada mês a mês') >= 0 && /Garantia: /.test(txt));
    ok('o que está incluso: inclusos, não inclusos, garantias e pós-instalação', ['Está incluso', 'Não está incluso', 'Projeto elétrico completo + ART/CFT-BR', 'Troca do padrão de entrada (medidor)', 'Garantias', 'Depois da instalação: ']
      .every(function (x) { return txt.indexOf(x) >= 0; }));
    ok('quanto você economiza: quadros, explicações e tabela dos anos', ['Conta hoje', 'Você economiza', 'Por que a conta não zera?', 'O que é o Fio B?', 'Sua conta de luz nos próximos anos'].every(function (x) { return txt.indexOf(x) >= 0; }));
    ok('retorno: tempo, TIR, vezes, custo do kWh e saldo acumulado', !!m.imagens.saldo && ['Tempo de retorno', 'Rentabilidade (TIR)', 'vezes', 'Custo da sua energia solar', '/kWh'].every(function (x) { return txt.indexOf(x) >= 0; }));
    ok('seção de investimento e pagamento retirada (valor e pagamento ficam no resumo)', ['Investimento e formas de pagamento', 'Investimento total', 'Tudo incluído:', 'Composição do investimento'].every(function (x) { return txt.indexOf(x) < 0; }));
    ok('seções retiradas: dados do cliente, lista de equipamentos e passo a passo', ['Dados do cliente e do projeto', 'Lista de equipamentos e materiais', 'Passo a passo', 'Tipo de Telhado'].every(function (x) { return txt.indexOf(x) < 0; }));
    // conta dos próximos anos: marcos de 5 em 5 anos, valores arredondados e total
    const somaEco = f.anos.reduce(function (s0, a) { return s0 + a.economiaMes * 12; }, 0);
    const reais = function (v) { return U.brl(Math.round(v)).replace(/,00$/, ''); };
    ok('conta nos próximos anos: tabela amigável com marcos e total', ['Quando', 'Você economiza', '1º ano', '5º ano', '10º ano', '15º ano', '20º ano', '25º ano', reais(a1.contaSem), reais(a1.contaCom),
      reais(a1.economiaMes) + ' por mês', reais(a1.economiaMes * 12) + ' no ano', 'Somando os 25 anos, a economia na conta de luz chega a ', reais(somaEco)].every(function (x) { return txt.indexOf(x) >= 0; }) &&
      txt.indexOf('Economia no mês') < 0, reais(a1.contaSem) + ' / ' + reais(somaEco));
    // apresentação: texto, diferenciais e o responsável técnico
    ok('apresentação: diferenciais da empresa', txt.indexOf('Por que escolher a ' + (ctx.empresa.nomeCurto || ctx.empresa.razao)) >= 0 && D.textos.diferenciais.length === 6 &&
      D.textos.diferenciais.every(function (d) { return txt.indexOf(d.titulo) >= 0; }) && txt.indexOf('{registroTipo}') < 0 && txt.indexOf('{concessionaria}') < 0);
    ok('apresentação: cartão de quem cuida do projeto', txt.indexOf('Quem cuida do seu projeto') >= 0 && txt.indexOf('Responsável pelo projeto, pela ART') >= 0 &&
      tx.indexOf(ctx.empresa.responsavel) >= 0 && /^[A-Z]{2}$/m.test(txt));
    ok('considerações: sem o passo a passo, prazos combinados após a aprovação', txt.indexOf('Após a aprovação, combinamos com você as datas de cada etapa') >= 0);
    ok('próximos passos: 3 passos, validade com data, contato e assinatura', ['Aprovação', 'Contrato e pagamento', 'Vistoria e projeto', 'Considerações importantes', 'Contratante — de acordo'].every(function (x) { return txt.indexOf(x) >= 0; }) &&
      /válida até\n?04\/10\/2026/.test(txt.replace(/e é válida até /, 'válida até')));
    ok('sem anexo: termina nos próximos passos', txt.indexOf('Anexo') < 0 && txt.indexOf('Premissas do cálculo:') < 0 && txt.lastIndexOf(D.textos.slogan) > txt.indexOf('Próximos passos'));
    const xml = App.Docx.serializar(m).documento;
    ok('Word: XML válido e sem tabelas encostadas (que o Word fundiria)', !new DOMParser().parseFromString(xml, 'application/xml').querySelector('parsererror') && xml.indexOf('</w:tbl><w:tbl>') < 0);
    ok('Word: seções principais começam em página nova', (xml.match(/<w:pageBreakBefore\/>/g) || []).length >= 6);
    // com o telefone da empresa: WhatsApp na capa, no resumo e no contato
    const ctxF = U.clone(ctx); ctxF.empresa.telefone = '(67) 99999-0000';
    const txF = textoModelo(App.Documento.montar(p, r, ctxF, ctxF.clientes[0], { w: 1400, h: 752 })).join('\n');
    ok('telefone da empresa: WhatsApp na capa, no resumo e no contato', (txF.match(/\(67\) 99999-0000/g) || []).length >= 3);
    // híbrido: baterias na ilustração, nos equipamentos e nas garantias
    const mH = App.Documento.montar(pH, rH, ctxH, ctxH.clientes[0], { w: 1400, h: 752 });
    const txH = textoModelo(mH).join('\n');
    ok('híbrido: baterias em "como funciona", equipamentos e garantias', txH.indexOf('As baterias guardam energia') >= 0 && /🔋  Baterias/.test(txH) && /Baterias\n\d+ anos|Baterias\nconforme fabricante/.test(txH));
    ok('híbrido: XML do Word válido', !new DOMParser().parseFromString(App.Docx.serializar(mH).documento, 'application/xml').querySelector('parsererror'));
    // BESS sem FV (grupo A): sem "como funciona" nem "seu sistema"; conta com demanda
    const mA = App.Documento.montar(pA, rA, ctxA, ctxA.clientes[0], { w: 1400, h: 752 });
    const txA = textoModelo(mA).join('\n');
    ok('BESS sem FV: proposta sem como funciona e sem seu sistema, com a explicação da demanda', txA.indexOf('Como a energia solar funciona') < 0 && txA.indexOf('Seu sistema solar') < 0 &&
      txA.indexOf('demanda contratada continua sendo cobrada') >= 0 && txA.indexOf('O que é o Fio B?') < 0 && !mA.imagens.comoFunciona);
    ok('BESS sem FV: XML do Word válido', !new DOMParser().parseFromString(App.Docx.serializar(mA).documento, 'application/xml').querySelector('parsererror'));
    // artes
    const fx = App.Arte.faixaCapa(), cf = App.Arte.comoFunciona({ bateria: true });
    ok('artes: faixa da capa e ilustração em PNG', /^data:image\/png/.test(fx.dataURL) && /^data:image\/png/.test(cf.dataURL) && cf.proporcao > 0.4 && cf.proporcao < 0.5);
  })();

  // ---------------------------------------------------------------- sincronização (nuvem): ganchos do Store e configuração do Firebase
  (function () {
    const S = App.Store, N = App.Nuvem;
    const copia = {};
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.indexOf('gsp.') === 0) copia[k] = localStorage.getItem(k); }
    const ganchosAntes = S.ganchos;
    const chamadas = [];
    S.ganchos = {
      aoSalvar: function (col, obj) { chamadas.push(['salvar', col, obj.id, obj.atualizadoEm]); },
      aoRemover: function (col, id, ts) { chamadas.push(['remover', col, id, ts]); },
      aoSalvarConfig: function (c) { chamadas.push(['config', c.atualizadoEm]); },
      aoSubstituirTudo: function () { chamadas.push(['tudo']); }
    };
    try {
      if (S.list('clientes') == null || !localStorage.getItem('gsp.v')) S.semear();
      const cli = S.save('clientes', { nome: 'Teste Nuvem' });
      ok('nuvem: salvar avisa a sincronização com a data da alteração', chamadas.length === 1 && chamadas[0][0] === 'salvar' && chamadas[0][1] === 'clientes' && chamadas[0][2] === cli.id && !!chamadas[0][3], JSON.stringify(chamadas));
      S.remove('clientes', cli.id);
      ok('nuvem: excluir avisa e marca a exclusão', chamadas[1] && chamadas[1][0] === 'remover' && !!S.excluidos('clientes')[cli.id]);
      S.save('clientes', cli);
      ok('nuvem: salvar de novo desfaz a marca de exclusão', !S.excluidos('clientes')[cli.id]);
      chamadas.length = 0;
      S.aplicarRemoto('clientes', { id: 'remoto-1', nome: 'Da nuvem', atualizadoEm: '2026-10-01T10:00:00.000Z' });
      ok('nuvem: registro vindo da nuvem é gravado sem novo aviso e sem nova data',
        chamadas.length === 0 && S.get('clientes', 'remoto-1') && S.get('clientes', 'remoto-1').atualizadoEm === '2026-10-01T10:00:00.000Z');
      S.excluirRemoto('clientes', 'remoto-1', '2026-10-02T10:00:00.000Z');
      ok('nuvem: exclusão vinda da nuvem', chamadas.length === 0 && !S.get('clientes', 'remoto-1') && S.excluidos('clientes')['remoto-1'] === '2026-10-02T10:00:00.000Z');
      const emp = S.config().empresa;
      S.salvarConfig('empresa', emp);
      ok('nuvem: configuração salva leva data e avisa', chamadas.length === 1 && chamadas[0][0] === 'config' && !!S.configBruta().atualizadoEm);
      S.reservarNumero('20261023', 9);
      const base = S.configBruta();
      const remota = JSON.parse(JSON.stringify(base)); remota.seq = { '20261023': 4, '20261024': 2 }; remota.atualizadoEm = '2030-01-01T00:00:00.000Z';
      const adiantado = S.aplicarConfigRemota(remota);
      ok('nuvem: numeração mescla o maior número de cada aparelho', adiantado === true && S.configBruta().seq['20261023'] === 9 && S.configBruta().seq['20261024'] === 2, JSON.stringify(S.configBruta().seq));
      const remota2 = JSON.parse(JSON.stringify(S.configBruta())); remota2.seq['20261023'] = 12;
      ok('nuvem: numeração remota maior não reenvia', S.aplicarConfigRemota(remota2) === false && S.configBruta().seq['20261023'] === 12);
      chamadas.length = 0;
      S.importar(S.exportar());
      const datas = {};
      S.COLECOES.forEach(function (c) { S.list(c).forEach(function (x) { datas[x.atualizadoEm] = true; }); });
      ok('nuvem: importar carimba tudo como mais recente e espelha na nuvem', Object.keys(datas).length === 1 && chamadas.some(function (c) { return c[0] === 'tudo'; }) &&
        !Object.keys(S.excluidos('clientes')).length, Object.keys(datas).length);
    } catch (e) {
      ok('nuvem: ganchos do Store', false, e && e.stack || String(e));
    } finally {
      S.ganchos = ganchosAntes;
      Object.keys(localStorage).filter(function (k) { return k.indexOf('gsp.') === 0; }).forEach(function (k) { localStorage.removeItem(k); });
      Object.keys(copia).forEach(function (k) { localStorage.setItem(k, copia[k]); });
    }

    const trecho = 'const firebaseConfig = {\n  apiKey: "AIzaSyX-1",\n  authDomain: "proj.firebaseapp.com",\n  projectId: "proj",\n  storageBucket: "proj.firebasestorage.app",\n' +
      '  messagingSenderId: "42",\n  appId: "1:42:web:ab",\n  measurementId: "G-XYZ"\n};';
    const cfg = N.lerConfig(trecho);
    igual('nuvem: firebaseConfig colado do console', JSON.stringify(cfg), JSON.stringify({ apiKey: 'AIzaSyX-1', authDomain: 'proj.firebaseapp.com', projectId: 'proj', storageBucket: 'proj.firebasestorage.app', messagingSenderId: '42', appId: '1:42:web:ab' }));
    igual('nuvem: firebaseConfig em JSON', N.lerConfig(JSON.stringify(cfg)).appId, '1:42:web:ab');
    let erro = '';
    try { N.lerConfig('apiKey: "x"'); } catch (e) { erro = e.message; }
    ok('nuvem: configuração incompleta é recusada', /incompleta/.test(erro), erro);
    const regras = N.regras('Fulano@Gmail.com ');
    ok('nuvem: regras do Firestore limitadas à conta e ao e-mail', /match \/usuarios\/\{uid\}\/\{documento=\*\*\}/.test(regras) && /request\.auth\.uid == uid/.test(regras) &&
      /request\.auth\.token\.email == "fulano@gmail\.com"/.test(regras), regras);
    const siteAntes = App.NUVEM_CONFIG, localAntes = localStorage.getItem('gsp.nuvem');
    try {
      App.NUVEM_CONFIG = { apiKey: 'site', projectId: 'site-proj' };
      localStorage.removeItem('gsp.nuvem');
      ok('nuvem: configuração publicada no site', N.config().projectId === 'site-proj' && N.origemConfig() === 'site');
      N.salvarConfig(cfg);
      ok('nuvem: configuração colada no aparelho tem prioridade', N.config().projectId === 'proj' && N.origemConfig() === 'aparelho');
      App.NUVEM_CONFIG = null; N.salvarConfig(null);
      ok('nuvem: sem configuração', !N.configurada() && N.origemConfig() === null);
    } finally {
      App.NUVEM_CONFIG = siteAntes;
      if (localAntes) localStorage.setItem('gsp.nuvem', localAntes); else localStorage.removeItem('gsp.nuvem');
    }
  })();

  window.__testes = { resultados: resultados, testarDocx: testarDocx, cenario: { p: p, ctx: ctx, r: r, pH: pH, ctxH: ctxH, rH: rH } };
})();
