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
  ok('documento: faixa da conta do ano 1 no quadro da conta com sistema', /por mês · ao longo do ano, varia de R\$ [\d.,]+ \(dez\) a R\$ [\d.,]+ \(jun\)/.test(txMes));

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
  ok('proposta: conta dos próximos anos em linguagem simples, sem anexo técnico', txPreco.indexOf('Sem energia solar') >= 0 && txPreco.indexOf('Energia + Fio B') >= 0 &&
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
      igual('migração v7: versão da base (atual)', localStorage.getItem('gsp.v'), '13');
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
      igual('migração v8 → v13: versão da base (atual), instalações, ordens de serviço, pedidos de compra e financeiro', localStorage.getItem('gsp.v') + (Array.isArray(S.list('instalacoes')) && Array.isArray(S.list('ordens')) && Array.isArray(S.list('compras')) &&
        Array.isArray(S.list('lancamentos')) && S.list('contasFin').length === 1 && S.list('categoriasFin').length === D.categoriasFin.length ? ' ok' : ''), '13 ok');
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
  igual('ordem: apresentação, projetos, como funciona e seu sistema', titulos(txP).slice(0, 4).join(' | '),
    '1 Apresentação da empresa | 2 Projetos realizados | 3 Como a energia solar funciona na sua casa | 4 Seu sistema solar');
  const mSemP = App.Documento.montar(p, r, ctx, ctx.clientes[0], { w: 1400, h: 752 });
  igual('sem projetos: seções na ordem da proposta amigável', titulos(textoModelo(mSemP)).join(' | '),
    '1 Apresentação da empresa | 2 Como a energia solar funciona na sua casa | 3 Seu sistema solar | 4 Seu investimento e retorno | ' +
    '5 Quanto você economiza | 6 O que está incluso | 7 Próximos passos');
  igual('com projetos: Quanto você economiza (6) logo depois de Seu investimento e retorno (5)', titulos(txP).slice(4).join(' | '),
    '5 Seu investimento e retorno | 6 Quanto você economiza | 7 O que está incluso | 8 Próximos passos');
  ok('passo a passo: fora da proposta por padrão', D.textos.passoNaProposta === false && !mSemP.imagens.passos && textoModelo(mSemP).indexOf(D.textos.passoIntro) < 0);
  const ctxPassos = U.clone(ctxP); ctxPassos.textos = Object.assign(U.clone(ctxP.textos || D.textos), { passoNaProposta: true });
  const mPassos = App.Documento.montar(p, rP, ctxPassos, ctxP.clientes[0], { w: 1400, h: 752 });
  ok('passo a passo ligado: linha do tempo em PNG com a frase de abertura, logo após os projetos', /^data:image\/png;base64,/.test(mPassos.imagens.passos || '') &&
    textoModelo(mPassos).indexOf(D.textos.passoIntro) >= 0 && titulos(textoModelo(mPassos)).slice(1, 3).join(' | ') === '2 Projetos realizados | 3 Passo a passo');
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

  // ---------------------------------------------------------------- pedidos de compra e materiais CA
  (function () {
    const Cp = App.Compra, M = App.Materiais, S = App.Store;
    // linhas como o PDF.js entrega (células com x); layout do orçamento de um distribuidor de material elétrico, com dados fictícios
    const cel = function (x, t, w) { return { t: t, x: x, x2: x + (w || t.length * 4.6) }; };
    const lin = function () { return { celulas: Array.prototype.slice.call(arguments) }; };
    const orc = [
      lin(cel(31, 'ADM 1.0 R1'), cel(218, 'Emitido em 29/09/2026'), cel(529, 'Página: 1')),
      lin(cel(105, '01 - DISTRIBUIDORA ELETRICA EXEMPLO - MATRIZ')),
      lin(cel(105, 'CNPJ: 11.222.333/0001-81'), cel(229, 'Inscrição Estadual:'), cel(313, '123456'), cel(392, 'Fone: (67) 3000-1000')),
      lin(cel(105, 'Bairro: CENTRO'), cel(295, 'Cidade: CAMPO GRANDE-MS')),
      lin(cel(30, 'Cliente: 1.234 - CLIENTE FICTICIO'), cel(383, 'A/C:')),
      lin(cel(30, 'CPF: 000.000.000-00'), cel(382, 'Fone: (67) 99999-0000')),
      lin(cel(30, 'Orçamento: 9.876'), cel(167, 'Data emissão: 29/09/2026'), cel(314, 'Data de validade:'), cel(391, '30/09/2026')),
      lin(cel(30, 'Vendedor: FULANA DE TAL'), cel(299, 'Fone / ramal:')),
      lin(cel(30, 'E-mail do vendedor: vendas@exemplo.com.br'), cel(294, 'Prazo entrega: 1 dias úteis')),
      lin(cel(30, 'Condição de pagamento:'), cel(137, 'A VISTA (DINHEIRO, CARTAO)')),
      lin(cel(41, 'Prod DescriçãoProd Descrição', 120), cel(293, 'MarcaMarca'), cel(410, 'UndUnd'), cel(458, 'Qtd.Qtd.'), cel(482, 'PrecoPreco'), cel(518, 'TotalTotal')),
      lin(cel(32, '1 40.048WETZEL BRANCO CONDULET PVC 1"'), cel(293, 'WETZEL'), cel(410, 'PC'), cel(458, '6,000'), cel(494, '7,81'), cel(523, '46,84')),
      lin(cel(32, '8'), cel(44, '4.306BARRAMENTO DE TERRA VERDE'), cel(293, 'LUKMA'), cel(410, 'PC'), cel(458, '2,000'), cel(491, '15,64'), cel(523, '31,27')),
      lin(cel(40, '40.052WETZEL BRANCO ADAPTADOR CONDULET 1"'), cel(293, 'WETZEL'), cel(410, 'PC'), cel(455, '16,000'), cel(494, '1,58'), cel(523, '25,21')),
      lin(cel(44, '5.710CABO FLEX 4MM PRETO ( POR METRO )'), cel(293, 'CORFIO'), cel(410, 'MT'), cel(455, '10,000'), cel(494, '4,54'), cel(523, '45,44')),
      lin(cel(264, 'T O T A I S')),
      lin(cel(65, 'Total produtos', 55), cel(256, 'Serviços adicionais', 80), cel(374, 'Valor desconto', 58), cel(494, 'Total pedido', 50)),
      lin(cel(94, '160,00', 30), cel(320, '0,00', 18), cel(416, '11,24', 22), cel(514, '148,76', 30)),
      lin(cel(92, 'Valor TC'), cel(170, 'Out. desp. man', 60), cel(491, 'TOTAL GERAL', 52)),
      lin(cel(110, '0,00'), cel(214, '0,00', 18), cel(512, '148,76', 30))
    ];
    const lido = Cp.lerLinhas(orc);
    igual('compras: fornecedor é o emitente (antes dos dados do cliente)', lido.fornecedor.nome, 'DISTRIBUIDORA ELETRICA EXEMPLO - MATRIZ');
    ok('compras: CNPJ, telefone e cidade do fornecedor', lido.fornecedor.cnpj === '11.222.333/0001-81' && lido.fornecedor.telefone === '(67) 3000-1000' && lido.fornecedor.cidade === 'CAMPO GRANDE-MS', JSON.stringify(lido.fornecedor));
    ok('compras: nº do orçamento, data, vendedor, condição e prazo', lido.docFornecedor === '9.876' && lido.data === '2026-09-29' && lido.vendedor === 'FULANA DE TAL' &&
      lido.condicao === 'A VISTA (DINHEIRO, CARTAO)' && lido.prazoEntrega === '1 dias úteis', JSON.stringify([lido.docFornecedor, lido.data, lido.vendedor, lido.condicao, lido.prazoEntrega]));
    igual('compras: 4 itens lidos', lido.itens.length, 4);
    const i0 = lido.itens[0], i1 = lido.itens[1], i2 = lido.itens[2], i3 = lido.itens[3];
    ok('compras: código colado à descrição e nº do item separados', i0 && i0.codigo === '40.048' && i0.descricao === 'WETZEL BRANCO CONDULET PVC 1"' && i0.marca === 'WETZEL' && i0.unidade === 'pç' &&
      i0.qtd === 6 && i0.preco === 7.81 && i0.total === 46.84, JSON.stringify(i0));
    ok('compras: nº do item em célula própria', i1 && i1.codigo === '4.306' && i1.descricao === 'BARRAMENTO DE TERRA VERDE' && i1.marca === 'LUKMA', JSON.stringify(i1));
    ok('compras: preço impresso arredondado (16 × 1,58 ≠ 25,21) ainda é item', i2 && i2.qtd === 16 && i2.total === 25.21, JSON.stringify(i2));
    ok('compras: unidade MT vira metro', i3 && i3.unidade === 'm' && i3.descricao === 'CABO FLEX 4MM PRETO ( POR METRO )', JSON.stringify(i3));
    ok('compras: totais impressos (linha de baixo, alinhados pela coluna)', lido.totalProdutos === 160 && lido.desconto === 11.24 && lido.totalGeral === 148.76 && lido.servicos === 0 && lido.outras === 0,
      JSON.stringify([lido.totalProdutos, lido.desconto, lido.totalGeral]));
    const k = Cp.conciliar(lido);
    ok('compras: desconto já embutido nos preços não é descontado de novo', k.desconto === '' && k.totalDocumento === 148.76 && /já está nos preços/.test(k.avisos[0]), JSON.stringify(k));

    // nota fiscal (DANFE): NCM/CST/CFOP antes da quantidade e impostos depois do total
    const danfe = [
      lin(cel(30, 'MATERIAIS ELETRICOS MODELO LTDA')),
      lin(cel(30, 'CNPJ 22.333.444/0001-55')),
      lin(cel(30, 'DESTINATÁRIO / REMETENTE')),
      lin(cel(30, 'CÓDIGO PRODUTO', 50), cel(90, 'DESCRIÇÃO DO PRODUTO / SERVIÇO', 140), cel(240, 'NCM/SH'), cel(280, 'CST'), cel(300, 'CFOP'), cel(330, 'UN'), cel(350, 'QUANT'), cel(390, 'VALOR UNIT', 40), cel(440, 'VALOR TOTAL', 44), cel(490, 'BC ICMS'), cel(530, 'VALOR ICMS', 40)),
      lin(cel(30, 'A1020'), cel(90, 'DISJUNTOR DIN BIPOLAR 32A CURVA C'), cel(240, '85362000'), cel(280, '000'), cel(300, '5102'), cel(330, 'UN'), cel(350, '2,0000'), cel(390, '30,0000'), cel(440, '60,00'), cel(490, '0,00'), cel(530, '0,00')),
      lin(cel(30, 'B77'), cel(90, 'CABO FLEXIVEL 6MM PRETO'), cel(240, '85444900'), cel(280, '000'), cel(300, '5102'), cel(330, 'M'), cel(350, '50,0000'), cel(390, '7,2000'), cel(440, '360,00'), cel(490, '0,00'), cel(530, '0,00')),
      lin(cel(30, 'VALOR TOTAL DOS PRODUTOS', 100), cel(160, 'VALOR DO FRETE', 60), cel(260, 'DESCONTO', 40), cel(330, 'VALOR TOTAL DA NOTA', 80)),
      lin(cel(60, '420,00', 30), cel(170, '25,00', 25), cel(265, '0,00', 18), cel(350, '445,00', 30))
    ];
    const ld = Cp.lerLinhas(danfe);
    ok('compras: nota fiscal — itens sem NCM/CFOP na descrição e com o código', ld.itens.length === 2 && ld.itens[0].codigo === 'A1020' && ld.itens[0].descricao === 'DISJUNTOR DIN BIPOLAR 32A CURVA C' &&
      ld.itens[0].qtd === 2 && ld.itens[0].total === 60 && ld.itens[1].unidade === 'm' && ld.itens[1].total === 360, JSON.stringify(ld.itens.map(function (i) { return [i.codigo, i.descricao, i.qtd, i.unidade, i.total]; })));
    ok('compras: nota fiscal — fornecedor, frete e total da nota', ld.fornecedor.nome === 'MATERIAIS ELETRICOS MODELO LTDA' && ld.frete === 25 && ld.totalProdutos === 420 && ld.totalGeral === 445,
      JSON.stringify([ld.fornecedor.nome, ld.frete, ld.totalProdutos, ld.totalGeral]));
    const kd = Cp.conciliar(ld);
    ok('compras: frete fora dos preços entra no pedido', kd.frete === 25 && kd.desconto === '' && !kd.avisos.length, JSON.stringify(kd));

    // quantidade no início da linha, sem cabeçalho
    const qIni = Cp.lerLinhas([lin(cel(30, '3 UN TERMINAL TUBULAR 6MM'), cel(300, '2,50'), cel(360, '7,50')), lin(cel(30, '10 M ELETRODUTO CORRUGADO 3/4'), cel(300, '1,90'), cel(360, '19,00'))]);
    ok('compras: quantidade e unidade no início da linha', qIni.itens.length === 2 && qIni.itens[0].qtd === 3 && qIni.itens[0].descricao === 'TERMINAL TUBULAR 6MM' && qIni.itens[1].unidade === 'm' && qIni.itens[1].total === 19,
      JSON.stringify(qIni.itens.map(function (i) { return [i.qtd, i.unidade, i.descricao, i.total]; })));
    ok('compras: números no padrão brasileiro e unidades', Cp.numero('1.098,04') === 1098.04 && Cp.numero('6,000') === 6 && Cp.numero('1.000') === 1000 && Cp.numero('25.41', true) === 25.41 &&
      isNaN(Cp.numero('40A')) && Cp.unidade('PÇ') === 'pç' && Cp.unidade('Mts') === 'm' && Cp.unidade('CX.') === 'cx' && Cp.unidade('WETZEL') === '');

    // totais e custo de aquisição (rateio do desconto e do frete pelo valor de cada item)
    const pc = Object.assign(Cp.nova(), { id: 'pc-1', numero: 'PC-20261030-001', data: '2026-10-30', fornecedor: { nome: 'Distribuidora Exemplo', cnpj: '', telefone: '', cidade: '' },
      itens: [Cp.novoItem({ codigo: '10', descricao: 'Disjuntor bipolar 40A', marca: 'Soprano', unidade: 'pç', qtd: 2, preco: 30, total: 60 }),
        Cp.novoItem({ codigo: '20', descricao: 'Cabo flexível 4mm preto', marca: 'Corfio', unidade: 'm', qtd: 100, preco: 4, total: '' })],
      desconto: 23, frete: 10 });
    const tp = Cp.totais(pc);
    ok('compras: totais do pedido (itens − desconto + frete)', tp.itens === 460 && tp.total === 447 && Math.abs(tp.fator - 447 / 460) < 1e-9, JSON.stringify(tp));
    ok('compras: custo unitário com rateio (e sem, quando pedido)', Cp.custoUnitario(pc, pc.itens[0]) === U.round(60 * 447 / 460 / 2, 4) && Cp.custoUnitario(pc, pc.itens[1]) === U.round(400 * 447 / 460 / 100, 4) &&
      Cp.custoUnitario(pc, pc.itens[0], false) === 30, Cp.custoUnitario(pc, pc.itens[0]) + ' ' + Cp.custoUnitario(pc, pc.itens[1]));
    ok('compras: semelhança das descrições (condulet × condulete)', Cp.semelhanca('WETZEL BRANCO CONDULET PVC 1"', 'Condulete PVC 1" Wetzel branco') >= 0.75 && Cp.semelhanca('Disjuntor 40A', 'Cabo solar 4mm') < 0.3);

    // lançamento no cadastro de materiais: novo, existente (pela descrição) e o mesmo material em duas linhas
    const eqs = [{ id: 'mat-x', tipo: 'material', descricao: 'Disjuntor bipolar 40A', unidade: 'pç', preco: 28, ativo: true, compras: [{ compraId: 'antiga', custo: 27, data: '2026-01-10' }] }];
    const sug0 = Cp.sugerir(pc.itens[0], pc, eqs), sug1 = Cp.sugerir(pc.itens[1], pc, eqs);
    ok('compras: sugere o material de mesma descrição e nenhum para o item novo', sug0 && sug0.eq.id === 'mat-x' && !sug1);
    const res = Cp.paraCadastro(pc, [{ item: pc.itens[0], destino: 'mat-x' }, { item: pc.itens[1], destino: 'novo' }], eqs, { atualizarPreco: true, infraCA: true });
    const exi = res.registros.find(function (r) { return r.id === 'mat-x'; }), nov = res.registros.find(function (r) { return r.id !== 'mat-x'; });
    ok('compras: material existente recebe custo, fornecedor, código e histórico (o mais recente primeiro)', res.atualizados === 1 && exi.custo === Cp.custoUnitario(pc, pc.itens[0]) && exi.preco === U.round(exi.custo, 2) &&
      exi.fornecedor === 'Distribuidora Exemplo' && exi.codigoFornecedor === '10' && exi.fabricante === 'Soprano' && exi.compras.length === 2 && exi.compras[0].compraId === 'pc-1' && eqs[0].preco === 28, JSON.stringify(exi));
    ok('compras: material novo do pedido (uso nas duas listas, sem entrar sozinho na proposta solar, marcado como CA)', res.novos === 1 && nov.tipo === 'material' && nov.uso === 'ambas' && nov.autoIncluir === false &&
      nov.infraCA === true && nov.unidade === 'm' && nov.custo === 3.887 && nov.custoEm === '2026-10-30' && nov.fabricante === 'Corfio', JSON.stringify(nov));
    ok('compras: itens vinculados ao cadastro', pc.itens[0].equipamentoId === 'mat-x' && pc.itens[1].equipamentoId === nov.id);
    const dup = Cp.paraCadastro(pc, [{ item: pc.itens[0], destino: 'mat-x' }, { item: Cp.novoItem({ descricao: 'Disjuntor 40A (outra linha)', qtd: 1, total: 31 }), destino: 'mat-x' }], eqs, {});
    ok('compras: duas linhas do mesmo material geram um só registro', dup.registros.length === 1 && dup.atualizados === 1);
    const pc2 = Cp.nova();
    pc2.fornecedor.nome = 'Já informado';
    const av = Cp.aplicarLeitura(pc2, lido);
    ok('compras: aplicar a leitura preenche o pedido sem trocar o que já foi digitado', pc2.itens.length === 4 && pc2.fornecedor.nome === 'Já informado' && pc2.fornecedor.cnpj === '11.222.333/0001-81' &&
      pc2.docFornecedor === '9.876' && pc2.data === '2026-09-29' && pc2.desconto === '' && pc2.totalDocumento === 148.76 && av.length === 1);
    if (App.IA && App.IA._leituraPedido) {
      const li = App.IA._leituraPedido({ fornecedor: { nome: 'Forn IA', cnpj: '', telefone: '', cidade: '' }, numero: '55', data: '2026-10-01', vendedor: '', condicaoPagamento: '', prazoEntrega: '',
        itens: [{ codigo: '', descricao: 'Quadro de distribuição 8 DIN', marca: 'Legrand', unidade: 'PC', quantidade: '2', precoUnitario: '66.17', total: '132.34' }, { codigo: '', descricao: '', marca: '', unidade: '', quantidade: '', precoUnitario: '', total: '' }],
        totalProdutos: '132.34', desconto: '', frete: '10', outrasDespesas: '', totalPedido: '142.34', avisos: '' });
      ok('compras: leitura pela IA no formato da leitura local', li.itens.length === 1 && li.itens[0].unidade === 'pç' && li.itens[0].qtd === 2 && li.itens[0].preco === 66.17 && li.frete === 10 && li.totalGeral === 142.34 &&
        li.desconto === '' && Cp.conciliar(li).frete === 10, JSON.stringify(li));
    }

    // materiais CA: proposta, instalação e cópia do consumo real
    const ctxM = ctxReferencia();
    const matCA = { id: 'mat-dps', tipo: 'material', descricao: 'DPS 275V 45kA', unidade: 'pç', preco: 50, custo: 54.07, infraCA: true, ativo: true };
    const matCabo = { id: 'mat-cabo-ca', tipo: 'material', descricao: 'Cabo flexível 6mm', unidade: 'm', preco: 7, ativo: true };
    ctxM.equipamentos = ctxM.equipamentos.concat([matCA, matCabo]);
    ok('materiais CA: custo da última compra, senão o preço', M.custoDe(matCA) === 54.07 && M.custoDe(matCabo) === 7);
    const ops = M.opcoes(ctxM.equipamentos);
    ok('materiais CA: materiais da infraestrutura CA primeiro na lista', ops[0].id === 'mat-dps' && ops.every(function (e) { return e.tipo === 'material'; }));
    const pN = C.novaProposta(ctxM);
    ok('materiais CA: proposta nova começa pela lista (vazia)', pN.infraModo === 'lista' && Array.isArray(pN.materiaisCA) && !pN.materiaisCA.length && C.infraValor(pN) === 0);
    pN.materiaisCA.push(M.linhaDe(matCA, 2), M.linhaDe(matCabo, 15));
    perto('materiais CA: valor da infraestrutura = soma da lista (2 × 54,07 + 15 × 7)', C.infraValor(pN), 213.14);
    ok('materiais CA: proposta gravada antes da lista continua com o valor informado', C.infraValor({ infraValor: 350, materiaisCA: [M.linhaDe(matCA, 9)] }) === 350 &&
      C.infraValor({ infraModo: 'manual', infraValor: '120,50' }) === 120.5);
    const pL = Object.assign(U.clone(p), { infraModo: 'lista', infraValor: 999, materiaisCA: U.clone(pN.materiaisCA) });
    const pV = Object.assign(U.clone(p), { infraModo: 'manual', infraValor: 213.14 });
    const rL = C.calcular(pL, ctxM), rV = C.calcular(pV, ctxM);
    ok('materiais CA: cálculo da proposta usa a lista (mesmo preço que o valor informado igual)', rL.infra === 213.14 && Math.abs(rL.total - rV.total) < 0.01, rL.infra + ' ' + rL.total + ' ' + rV.total);
    matCA.custo = 60;
    ok('materiais CA: atualizar custos pelo cadastro', M.atualizarCustos(pN.materiaisCA, ctxM.equipamentos) === 1 && pN.materiaisCA[0].custo === 60 && C.infraValor(pN) === 225);
    pN.id = 'prop-ca';
    const inst = App.Instalacao.deProposta(pN, ctxM);
    ok('materiais CA: instalação traz o previsto da proposta (usado em branco)', inst.materiais.length === 2 && inst.materiais[0].qtdPrevista === 2 && inst.materiais[0].qtd === '' && inst.materiais[0].origem === 'proposta');
    ok('materiais CA: proposta com valor informado não gera previsto', App.Instalacao.deProposta(pV, ctxM).materiais.length === 0);
    const compra = Object.assign(Cp.nova(), { id: 'pc-obra', numero: 'PC-20261030-002', fornecedor: { nome: 'Forn' }, desconto: 10,
      itens: [Cp.novoItem({ descricao: 'DPS 275V 45kA', qtd: 4, preco: 54.07, total: 216.28, equipamentoId: 'mat-dps' }), Cp.novoItem({ descricao: 'Barramento de terra', qtd: 2, preco: 15, total: 30 })] });
    const nL = M.lancarCompra(inst, compra);
    const dps = inst.materiais.find(function (m) { return m.equipamentoId === 'mat-dps'; });
    const barr = inst.materiais.find(function (m) { return m.descricao === 'Barramento de terra'; });
    ok('materiais CA: pedido lançado na obra soma ao usado com o custo de aquisição', nL === 2 && dps.qtd === 4 && dps.qtdPrevista === 2 && dps.custo === Cp.custoUnitario(compra, compra.itens[0]) &&
      barr && barr.origem === 'compra' && barr.qtd === 2 && inst.materiais.length === 3 && inst.comprasLancadas.join() === 'pc-obra', JSON.stringify(inst.materiais));
    M.lancarCompra(inst, compra);
    ok('materiais CA: lançar de novo soma as quantidades sem repetir o pedido', dps.qtd === 8 && inst.comprasLancadas.length === 1);
    const rs = M.resumo(inst, pN);
    ok('materiais CA: resumo previsto × usado', rs.previsto === M.total(inst.materiais, 'qtdPrevista') && rs.usado === M.total(inst.materiais) && rs.diferenca === U.round(rs.usado - rs.previsto, 2) && rs.lancados === 2, JSON.stringify(rs));
    const nPux = M.puxarProposta(inst, pN);
    ok('materiais CA: puxar o previsto de novo não duplica linhas', nPux === 2 && inst.materiais.length === 3);
    inst.id = 'inst-ca'; inst.titulo = 'Obra CA';
    const fts = M.fontes([pN, { id: 'outra', infraModo: 'manual', materiaisCA: [M.linhaDe(matCA, 1)] }], [inst], 'prop-ca');
    ok('materiais CA: fontes para copiar (consumo real da obra; a própria proposta e as de valor informado ficam de fora)', fts.length === 1 && fts[0].tipo === 'obra' && fts[0].linhas.length === 2);
    const destino = [M.linhaDe(matCA, 1)];
    M.copiar(destino, fts[0], ctxM.equipamentos, false);
    ok('materiais CA: copiar soma ao material igual e usa o custo atual do cadastro', destino.length === 2 && destino[0].qtd === 9 && destino[0].custo === 60 && destino[1].descricao === 'Barramento de terra');
    M.copiar(destino, fts[0], ctxM.equipamentos, true);
    ok('materiais CA: copiar substituindo a lista', destino.length === 2 && destino[0].qtd === 8);

    // rateio do frete, das outras despesas e do desconto por item (custo final)
    const pr = Object.assign(Cp.nova(), { desconto: 20, frete: 30, outras: 10, itens: [Cp.novoItem({ descricao: 'A', qtd: 4, preco: 75, total: 300 }), Cp.novoItem({ descricao: 'B', qtd: 10, preco: 10, total: 100 })] });
    const ra = Cp.rateio(pr, pr.itens[0]), rb = Cp.rateio(pr, pr.itens[1]);
    ok('compras: frete e outras despesas atribuídos aos itens pelo valor (75% e 25%)', ra.frete === 22.5 && ra.outras === 7.5 && ra.desconto === 15 && rb.frete === 7.5 && rb.outras === 2.5 && rb.desconto === 5 &&
      ra.custoTotal === 315 && rb.custoTotal === 105 && ra.custoUnit === 78.75 && rb.custoUnit === 10.5 && ra.custoUnit === Cp.custoUnitario(pr, pr.itens[0]) && U.round(ra.custoTotal + rb.custoTotal, 2) === Cp.totais(pr).total,
      JSON.stringify([ra, rb]));

    // proposta em aberto acompanha os custos lançados pelos pedidos de compra depois da última gravação
    const eqC = [{ id: 'm-dps', tipo: 'material', descricao: 'DPS', preco: 60, custo: 58.3, atualizadoEm: '2026-10-30T12:00:00.000Z', custoAtualizadoEm: '2026-10-30T12:00:00.000Z' },
      { id: 'm-cabo', tipo: 'material', descricao: 'Cabo', preco: 5, atualizadoEm: '2026-10-01T10:00:00.000Z' },
      { id: 'm-mc4', tipo: 'material', descricao: 'MC4', preco: 14, custoAtualizadoEm: '2026-10-30T12:00:00.000Z' }];
    const pAb = { status: 'enviada', infraModo: 'lista', atualizadoEm: '2026-10-20T09:00:00.000Z', infraValor: 104,
      materiaisCA: [{ equipamentoId: 'm-dps', descricao: 'DPS', qtd: 2, custo: 50 }, { equipamentoId: 'm-cabo', descricao: 'Cabo', qtd: 1, custo: 4 }],
      itens: [{ equipamentoId: 'm-mc4', categoria: 'material', qtd: 2, precoUnit: 12 }, { equipamentoId: 'm-mc4', manual: true, qtd: 1, precoUnit: 9 }] };
    const atu = C.atualizarCustosProposta(pAb, { equipamentos: eqC });
    ok('proposta: custos novos da compra ao abrir (lista CA e materiais do kit); o que não mudou desde a gravação fica', atu && atu.n === 2 && pAb.materiaisCA[0].custo === 58.3 && pAb.materiaisCA[1].custo === 4 &&
      pAb.itens[0].precoUnit === 14 && pAb.itens[1].precoUnit === 9 && atu.infraAntes === 104 && atu.infraDepois === 120.6 && pAb.infraValor === 120.6, JSON.stringify(atu));
    pAb.atualizadoEm = '2026-10-31T08:00:00.000Z';
    ok('proposta: depois de salva com os custos novos, abrir de novo não muda nada', C.atualizarCustosProposta(pAb, { equipamentos: eqC }) === null);

    // numeração e coleção
    ok('compras: coleção sincronizada e no backup', S.COLECOES.indexOf('compras') >= 0 && Array.isArray(S.exportar().colecoes.compras));
    ok('compras: número PC-AAAAMMDD-NNN com sequência própria', /^PC-20261030-\d{3}$/.test(S.proximoNumero('2026-10-30', 'compra').numero) && S.proximoNumero('2026-10-30', 'compra').chave === 'PC:20261030');
  })();

  // ---------------------------------------------------------------- avisos ao cliente (WhatsApp) e página de acompanhamento
  (function () {
    const A = App.Acompanhamento, I = App.Instalacao;
    ok('avisos: telefone no formato do WhatsApp', A.telefoneWhats('(67) 98888-7777') === '5567988887777' && A.telefoneWhats('67 3316-6288') === '556733166288' &&
      A.telefoneWhats('+55 (67) 99999-0000') === '5567999990000' && A.telefoneWhats('0 67 99999-0000') === '5567999990000' && A.telefoneWhats('') === '');
    igual('avisos: link do WhatsApp com a mensagem', A.linkWhats('(67) 98888-7777', 'Olá, Maria! *Etapa* 1'), 'https://wa.me/5567988887777?text=Ol%C3%A1%2C%20Maria!%20*Etapa*%201');
    igual('avisos: sem telefone, o WhatsApp pede o contato', A.linkWhats('', 'oi'), 'https://wa.me/?text=oi');
    igual('avisos: linha com marcador vazio sai da mensagem', A.preencher('Olá, {cliente}!\n\n{proxima}\n\nAcompanhe: {link}\nFim', { cliente: 'Ana', proxima: '', link: '' }), 'Olá, Ana!\n\nFim');
    const tk = A.novoToken(), tk2 = A.novoToken();
    ok('avisos: código do link aleatório de 22 caracteres', /^[A-HJ-NP-Za-km-z2-9]{22}$/.test(tk) && tk !== tk2, tk);
    igual('avisos: endereço da página do cliente', A.linkAcompanhamento('abc123', 'https://exemplo.github.io/app/'), 'https://exemplo.github.io/app/acompanhe.html?o=abc123');
    const ctxA = ctxReferencia();
    ctxA.empresa = Object.assign({}, ctxA.empresa, { nomeCurto: 'Gênesis', telefone: '(67) 99999-0000' });
    const inst = Object.assign(I.nova(ctxA), { clienteNome: 'MARIA DA SILVA', telefone: '(67) 98888-7777', endereco: 'Rua Secreta, 10', cidade: 'Corumbá', uf: 'MS', kwp: 5.6, valor: 25000, tipoSistema: 'ongrid' });
    inst.etapas.forEach(function (e, i) { e.previsto = '2026-11-' + String(10 + i).padStart(2, '0'); });
    I.mudarEtapa(inst, inst.etapas[0], 'concluida', '2026-10-30');
    const msg = A.mensagemEtapa(inst, ctxA, inst.etapas[0], 'https://x.test/acompanhe.html?o=abc');
    ok('avisos: mensagem da etapa concluída (nome, etapa, próxima com data, link e empresa)', /^Olá, Maria! 👋/.test(msg) && msg.indexOf('etapa 1 de ' + inst.etapas.length) >= 0 && msg.indexOf('*' + inst.etapas[0].titulo + '*') >= 0 &&
      msg.indexOf('Próxima etapa: ' + inst.etapas[1].titulo + ', prevista para ' + U.dataBR(inst.etapas[1].previsto) + '.') >= 0 && /Acompanhe cada etapa por aqui: https:\/\/x\.test/.test(msg) && /Gênesis$/.test(msg), msg);
    const semLink = A.mensagemEtapa(inst, ctxA, inst.etapas[0], '');
    ok('avisos: sem página de acompanhamento, a linha do link sai', semLink.indexOf('Acompanhe') < 0 && semLink.indexOf('{link}') < 0, semLink);
    inst.etapas.forEach(function (e) { I.mudarEtapa(inst, e, 'concluida', '2026-11-20'); });
    ok('avisos: última etapa avisa que o sistema está pronto', A.mensagemEtapa(inst, ctxA, inst.etapas[inst.etapas.length - 1], '').indexOf('Todas as etapas foram concluídas') >= 0);
    ok('avisos: mensagem do link de acompanhamento', /acompanha cada etapa[\s\S]*https:\/\/x\.test\/o/.test(A.mensagemLink(inst, ctxA, 'https://x.test/o')));
    I.mudarEtapa(inst, inst.etapas[2], 'andamento', '2026-11-21');
    const pub = A.dadosPublicos(inst, ctxA, { logo: '', fotos: [] });
    const txt = JSON.stringify(pub);
    ok('avisos: página pública sem valor, endereço nem telefone do cliente', txt.indexOf('Rua Secreta') < 0 && txt.indexOf('98888') < 0 && txt.indexOf('25000') < 0 && txt.indexOf('SILVA') < 0 && pub.cliente === 'Maria', txt.slice(0, 200));
    ok('avisos: página pública com sistema, progresso, etapas e a etapa atual', pub.sistema.kwp === 5.6 && pub.sistema.cidade === 'Corumbá' && pub.progresso.total === inst.etapas.length &&
      pub.progresso.feitas === inst.etapas.length - 1 && pub.etapas[2].status === 'andamento' && pub.etapas[2].atual === true && pub.etapas.filter(function (e) { return e.atual; }).length === 1 &&
      pub.empresa.telefone === '(67) 99999-0000' && pub.situacao.label === 'Em andamento', JSON.stringify(pub.progresso));
    const regras = App.Nuvem.regras('dono@gmail.com');
    ok('avisos: regras do Firestore liberam só a leitura pelo código (sem listar) e a gravação da empresa', /match \/acompanhamento\/\{codigo\} \{\n\s+allow get: if true;\n\s+allow create, update, delete: if dono\(\) \|\| membro\(\);/.test(regras) &&
      !/acompanhamento[\s\S]*allow (read|list)/.test(regras), regras);
  })();

  // ---------------------------------------------------------------- envio dos documentos ao cliente
  (function () {
    const E = App.Envio;
    const ctxE = ctxReferencia();
    ctxE.empresa = Object.assign({}, ctxE.empresa, { nomeCurto: 'Gênesis', telefone: '(67) 99999-0000', email: 'contato@exemplo.com.br' });
    igual('envio: link da página do documento', E.linkDocumento('tok123', 'https://exemplo.github.io/app/'), 'https://exemplo.github.io/app/ver.html?d=tok123');
    const mP = E.mensagem(ctxE, 'envioProposta', { cliente: 'JOÃO PEREIRA', numero: 'GE-20261030-001', validade: '04/11/2026', link: 'https://x.test/ver.html?d=a' });
    ok('envio: mensagem da proposta (nome, número, validade, link e empresa)', /^Olá, João! 👋/.test(mP) && /nº GE-20261030-001, válida até 04\/11\/2026/.test(mP) && /https:\/\/x\.test\/ver\.html\?d=a/.test(mP) && /Gênesis$/.test(mP), mP);
    const mSem = E.mensagem(ctxE, 'envioProposta', { cliente: 'João', numero: 'GE-1', validade: '04/11/2026', link: '' });
    ok('envio: sem link, a linha do link sai da mensagem', mSem.indexOf('{link}') < 0 && !/https?:/.test(mSem) && mSem.indexOf('Abra pelo link') < 0 && /válida até 04\/11\/2026\.\n\nQualquer dúvida/.test(mSem), mSem);
    const mOS = E.mensagem(ctxE, 'envioOS', { cliente: 'Ana', numero: 'OS-20261030-001', tipo: 'limpeza dos módulos', situacao: ', concluída em 30/10/2026', link: 'https://x.test/v' });
    ok('envio: mensagem da OS com tipo e situação', /ordem de serviço nº OS-20261030-001 \(limpeza dos módulos, concluída em 30\/10\/2026\)/.test(mOS), mOS);
    ok('envio: modelos editáveis em Textos padrão', ['envioProposta', 'envioAvulsa', 'envioOS'].every(function (k) { return /\{link\}/.test(D.textos[k]) && /\{cliente\}/.test(D.textos[k]); }));
    const meta = E.metaDocumento({ tipoDoc: 'Proposta de energia solar', numero: 'GE-1', validade: '04/11/2026', clienteNome: 'Maria da Silva' }, { nome: 'Proposta_Solar_Maria.pdf' }, ctxE, 'data:image/jpeg;base64,xx');
    ok('envio: página do documento com primeiro nome, número, validade e contato da empresa', meta.cliente === 'Maria' && meta.numero === 'GE-1' && meta.validade === '04/11/2026' && meta.arquivo === 'Proposta_Solar_Maria.pdf' &&
      meta.empresa.telefone === '(67) 99999-0000' && meta.empresa.logo === 'data:image/jpeg;base64,xx' && JSON.stringify(meta).indexOf('Silva') < 0, JSON.stringify(meta));
  })();

  // ---------------------------------------------------------------- docx
  async function testarFotos() {
    const F = App.Fotos;
    try {
      const cv = document.createElement('canvas'); cv.width = 2400; cv.height = 1600;
      const g = cv.getContext('2d'); g.fillStyle = '#123456'; g.fillRect(0, 0, 2400, 1600); g.fillStyle = '#fff'; g.font = '120px sans-serif'; g.fillText('ETIQUETA 625 W', 200, 800);
      const blob = await new Promise(function (ok) { cv.toBlob(ok, 'image/png'); });
      const foto = await F.preparar(new File([blob], 'etiqueta.png', { type: 'image/png' }));
      ok('fotos: etiqueta reduzida (lado maior 1280 px) e em JPEG', foto.w === 1280 && foto.h === 853 && /^data:image\/jpeg;base64,/.test(foto.dataURL) && foto.dataURL.length <= 450000, foto.w + '×' + foto.h + ' ' + foto.dataURL.length);
      const usoAntes = App.Store.uso();
      const id = await F.salvar(foto);
      const lida = await F.obter(id);
      ok('fotos: gravada fora do armazenamento local e lida de volta pelo id', /^foto-/.test(id) && lida && lida.dataURL === foto.dataURL && App.Store.uso() === usoAntes);
      ok('fotos: entra no backup', (await F.todas()).some(function (x) { return x.id === id && x.dataURL === foto.dataURL; }));
      await F.remover(id);
      ok('fotos: removida', (await F.obter(id)) === null);
      const n = await F.importar([{ id: 'foto-backup-1', dataURL: foto.dataURL, w: foto.w, h: foto.h }]);
      ok('fotos: restauradas do backup', n === 1 && !!(await F.obter('foto-backup-1')));
      await F.remover('foto-backup-1');
      // documento do fornecedor anexado ao pedido de compra (PDF guardado como veio)
      const pdfBytes = new TextEncoder().encode('%PDF-1.4\n% pedido de teste\n%%EOF');
      const anexo = await F.salvarArquivo(new File([pdfBytes], 'orcamento.pdf', { type: 'application/pdf' }));
      const devolvido = await F.arquivo(anexo);
      ok('compras: PDF do fornecedor anexado e devolvido como arquivo', anexo.tipo === 'application/pdf' && anexo.nome === 'orcamento.pdf' && devolvido && devolvido.type === 'application/pdf' &&
        new TextDecoder().decode(await devolvido.arrayBuffer()) === new TextDecoder().decode(pdfBytes) && (await F.todas()).some(function (x) { return x.id === anexo.fotoId && x.tipo === 'application/pdf' && x.nome === 'orcamento.pdf'; }));
      await F.remover(anexo.fotoId);
      const fotoDoc = await F.salvarArquivo(new File([blob], 'pedido.png', { type: 'image/png' }));
      const regDoc = await F.obter(fotoDoc.fotoId);
      ok('compras: foto do pedido reduzida a 1800 px em JPEG', fotoDoc.tipo === 'image/jpeg' && regDoc.w === 1800 && /^data:image\/jpeg/.test(regDoc.dataURL), regDoc && regDoc.w);
      await F.remover(fotoDoc.fotoId);
      // PDF real com uma assinatura colhida (imagem em App.Fotos)
      const cvA = document.createElement('canvas'); cvA.width = 600; cvA.height = 200;
      const gA = cvA.getContext('2d'); gA.fillStyle = '#fff'; gA.fillRect(0, 0, 600, 200); gA.strokeStyle = '#000'; gA.lineWidth = 4; gA.beginPath(); gA.moveTo(40, 150); gA.bezierCurveTo(200, 0, 300, 220, 560, 60); gA.stroke();
      const idA = await F.salvar({ dataURL: cvA.toDataURL('image/png'), w: 600, h: 200 });
      const ctxA = ctxReferencia();
      const osA = Object.assign(App.Ordem.nova(ctxA), { numero: 'OS-20261029-009', clienteNome: 'Cliente Exemplo', descricao: 'Teste', assinaturas: { cliente: { fotoId: idA, nome: 'Cliente Exemplo', em: '2026-10-29T10:00:00' }, tecnico: { fotoId: '', nome: '', em: '' } } });
      const gOS = await App.Relatorios.pdfOS(osA, ctxA);
      ok('PDF da OS gerado com a assinatura do cliente', new TextDecoder().decode(await gOS.blob.slice(0, 5).arrayBuffer()) === '%PDF-' && Object.keys(gOS.modelo.imagens).join(',') === 'assCliente' && /^OS_OS-20261029-009_/.test(gOS.nome), gOS.nome);
      const instA = Object.assign(App.Instalacao.nova(ctxA), { titulo: 'Obra teste', clienteNome: 'Cliente Exemplo', assinaturas: { cliente: { fotoId: idA, nome: 'Cliente Exemplo', em: '2026-10-29T10:00:00' }, tecnico: { fotoId: idA, nome: 'Técnico', em: '2026-10-29T10:01:00' } } });
      instA.placas.modulo.fotos = [idA, idA + '-x'];
      instA.placas.modulo.legendas = { [idA]: 'Arranjo no telhado, lado norte' };
      instA.placas.inversor.fotos = [idA];
      const gIn = await App.Relatorios.pdfInstalacao(instA, ctxA);
      const txIn = JSON.stringify(gIn.modelo.corpo);
      ok('relatório: fotos dos equipamentos com a legenda digitada (ou a padrão)', /Fotos dos equipamentos/.test(txIn) && /Arranjo no telhado, lado norte/.test(txIn) && /"Inversor"/.test(txIn), txIn.match(/Fotos dos equipamentos/) ? 'ok' : 'sem seção');
      ok('PDF do relatório de instalação gerado com as duas assinaturas', new TextDecoder().decode(await gIn.blob.slice(0, 5).arrayBuffer()) === '%PDF-' && ['assCliente', 'assTecnico'].every(function (k) { return !!gIn.modelo.imagens[k]; }), gIn.nome);
      await F.remover(idA);
      // página de acompanhamento publicada com a nuvem simulada (sem gravar de novo o mesmo conteúdo; erro de permissão orienta as regras)
      const Nv = App.Nuvem, usuarioAntes = Nv.usuario, publicarAntes = Nv.publicarAcompanhamento;
      try {
        const gravados = [];
        Nv.usuario = { uid: 'teste' };
        Nv.publicarAcompanhamento = function (codigo, dados) { gravados.push({ codigo: codigo, dados: dados }); return Promise.resolve(); };
        const instP = Object.assign(App.Instalacao.nova(ctxA), { clienteNome: 'Ana Souza', acompanhamento: { token: 'tokTeste1234567890abcd', ativo: true, fotos: true } });
        const idP = await F.salvar({ dataURL: cvA.toDataURL('image/png'), w: 600, h: 200 });
        instP.placas.modulo.fotos = [idP];
        instP.placas.modulo.legendas = { [idP]: 'Módulos no telhado' };
        const s1 = await App.Acompanhamento.publicar(instP, ctxA);
        const s2 = await App.Acompanhamento.publicar(instP, ctxA);
        ok('avisos: página publicada com a foto e a legenda; o mesmo conteúdo não é gravado de novo', s1.estado === 'ok' && s2.estado === 'ok' && gravados.length === 1 && gravados[0].codigo === 'tokTeste1234567890abcd' &&
          gravados[0].dados.fotos.length === 1 && gravados[0].dados.fotos[0].legenda === 'Módulos no telhado' && /^data:image\/jpeg/.test(gravados[0].dados.fotos[0].src) && /^data:image\/jpeg/.test(gravados[0].dados.empresa.logo), JSON.stringify(s1));
        App.Instalacao.mudarEtapa(instP, instP.etapas[0], 'concluida', '2026-10-30');
        await App.Acompanhamento.publicar(instP, ctxA);
        ok('avisos: etapa concluída atualiza a página', gravados.length === 2 && gravados[1].dados.progresso.feitas === 1);
        Nv.publicarAcompanhamento = function () { const e = new Error('Missing or insufficient permissions.'); e.code = 'permission-denied'; return Promise.reject(e); };
        App.Instalacao.mudarEtapa(instP, instP.etapas[1], 'concluida', '2026-10-31');
        const s3 = await App.Acompanhamento.publicar(instP, ctxA);
        ok('avisos: sem permissão no Firebase, orienta a atualizar as regras', s3.estado === 'erro' && /regras do Firestore/.test(s3.mensagem), s3.mensagem);
        Nv.usuario = null;
        const s4 = await App.Acompanhamento.publicar(instP, ctxA);
        ok('avisos: sem a sincronização ligada, orienta entrar na nuvem', s4.estado === 'semNuvem');
        await F.remover(idP);
      } finally { Nv.usuario = usuarioAntes; Nv.publicarAcompanhamento = publicarAntes; }
      // pedido de compra em PDF (para o fornecedor)
      const pcPdf = Object.assign(App.Compra.nova(), { numero: 'PC-20261030-001', data: '2026-10-30', situacao: 'pedido', fornecedor: { nome: 'Distribuidora Exemplo', cnpj: '11.222.333/0001-81', telefone: '', cidade: 'Campo Grande-MS' },
        condicao: '28 dias', prazoEntrega: '3 dias úteis', observacoes: 'Entregar em horário comercial.', desconto: 10, frete: 25,
        itens: [App.Compra.novoItem({ codigo: '10', descricao: 'Disjuntor bipolar 40A', marca: 'Soprano', unidade: 'pç', qtd: 2, preco: 30, total: 60 }), App.Compra.novoItem({ descricao: 'Cabo flexível 4mm', unidade: 'm', qtd: 100, preco: 4.5 })] });
      const gPc = await App.Relatorios.pdfCompra(pcPdf, ctxA);
      const txPc = JSON.stringify(gPc.modelo.corpo);
      ok('pedido de compra em PDF: fornecedor, comprador, itens, desconto, frete, total e autorização', new TextDecoder().decode(await gPc.blob.slice(0, 5).arrayBuffer()) === '%PDF-' &&
        gPc.nome === 'Pedido_PC-20261030-001_DistribuidoraExemplo.pdf' && /Distribuidora Exemplo/.test(txPc) && /Comprador/.test(txPc) && /Disjuntor bipolar 40A — Soprano/.test(txPc) &&
        /R\$ 450,00/.test(txPc) && /− R\$ 10,00/.test(txPc) && /R\$ 525,00/.test(txPc) && /Total do pedido/.test(txPc) && /Fornecedor — de acordo/.test(txPc) && /28 dias/.test(txPc), gPc.nome);
    } catch (e) {
      ok('fotos: IndexedDB', false, e && e.stack || String(e));
    }
  }

  async function testarDocx() {
    await testarFotos();
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

  // ---------------------------------------------------------------- instalações (gestão da obra)
  (function () {
    const I = App.Instalacao;
    igual('instalações: prazo do cronograma em dias', [I.prazoDias('5 dias úteis'), I.prazoDias('15–30 dias úteis'), I.prazoDias('1 dia'), I.prazoDias('30–60 dias (Energisa MS)'), I.prazoDias('Após aprovação')]
      .map(function (x) { return x ? x.dias + (x.uteis ? 'u' : 'c') : '—'; }).join(','), '5u,30u,1c,60c,—');
    igual('instalações: dias úteis pulam o fim de semana (sex + 1 útil = seg)', I.somarDias('2026-10-30', 1, true), '2026-11-02');
    igual('instalações: dias corridos', I.somarDias('2026-10-30', 3, false), '2026-11-02');
    const ctxI = U.clone(ctx); ctxI.clientes[0].telefone = '(67) 99999-0000';
    const pI = Object.assign(U.clone(p), { id: 'prop-teste', numero: 'GE-20260929-012', status: 'aprovada' });
    const inst = I.deProposta(pI, ctxI);
    ok('instalações: criada da proposta com cliente, telefone, sistema e valor', inst.propostaId === 'prop-teste' && inst.clienteNome === ctxI.clientes[0].nome &&
      inst.telefone === '(67) 99999-0000' && Math.abs(inst.kwp - r.kwp) < 1e-9 && Math.abs(inst.valor - r.total) < 1e-6 && /kWp — On-Grid$/.test(inst.titulo), inst.titulo);
    ok('instalações: equipamentos e números para o portfólio', /^9 × .* \(625 Wp\)$/.test(inst.equipamentos.modulos) && !!inst.equipamentos.inversor && inst.geracaoMes > 0 && inst.reducaoPct > 0 && inst.segmento === 'residencial',
      JSON.stringify(inst.equipamentos));
    igual('instalações: etapas do cronograma com o nome da concessionária', inst.etapas.map(function (e) { return e.titulo; }).join(' | '),
      D.textos.cronograma.map(function (c) { return c.etapa.replace(/\{concessionaria\}/g, r.concessionaria.nome); }).join(' | '));
    ok('instalações: previsões em sequência a partir do início', inst.etapas.every(function (e, k) { return e.previsto && (k === 0 || e.previsto >= inst.etapas[k - 1].previsto); }) &&
      inst.etapas[0].previsto === I.somarDias(inst.inicioPrevisto, 5, true));
    ok('instalações: etapa sem prazo em dias fica na data da anterior', inst.etapas[5].previsto === inst.etapas[4].previsto);
    igual('instalações: nova = a iniciar, 0 de 6', I.status(inst) + ' ' + I.progresso(inst).feitas + '/' + I.progresso(inst).total, 'iniciar 0/6');
    ok('instalações: histórico registra a criação', inst.historico.length === 1 && /proposta GE-20260929-012/.test(inst.historico[0].texto));
    // avanço das etapas
    I.mudarEtapa(inst, inst.etapas[0], 'andamento', '2026-11-03');
    ok('instalações: iniciar etapa marca a data e a situação vai a em andamento', inst.etapas[0].iniciadoEm === '2026-11-03' && I.status(inst) === 'andamento' && I.etapaAtual(inst) === inst.etapas[0]);
    I.mudarEtapa(inst, inst.etapas[0], 'concluida', '2026-11-05');
    ok('instalações: concluir etapa marca a data, conta no progresso e passa para a próxima', inst.etapas[0].concluidoEm === '2026-11-05' && I.progresso(inst).feitas === 1 &&
      I.etapaAtual(inst) === inst.etapas[1] && /Etapa 1 — .*: concluída\./.test(inst.historico[0].texto));
    ok('instalações: previsões seguintes recontadas a partir da conclusão real', inst.etapas[1].previsto === I.somarDias('2026-11-05', 30, true));
    I.mudarEtapa(inst, inst.etapas[0], 'andamento', '2026-11-06');
    ok('instalações: reabrir etapa limpa a conclusão e registra', inst.etapas[0].concluidoEm === '' && /reaberta/.test(inst.historico[0].texto));
    ok('instalações: etapa vencida aparece como atrasada', I.atrasadas(inst, '2099-01-01').length === inst.etapas.length && I.atrasadas(inst, '2000-01-01').length === 0);
    inst.etapas.forEach(function (e) { I.mudarEtapa(inst, e, 'concluida', '2026-12-10'); });
    ok('instalações: todas concluídas = obra concluída, sem atrasos', I.status(inst) === 'concluida' && I.atrasadas(inst, '2099-01-01').length === 0 && I.previsaoConclusao(inst) === '2026-12-10');
    inst.situacao = 'pausada'; const stP = I.status(inst); inst.situacao = 'cancelada'; const stC = I.status(inst); inst.situacao = 'ativa';
    igual('instalações: obra pausada e cancelada', stP + ',' + stC, 'pausada,cancelada');
    const proj = I.paraProjeto(inst);
    ok('instalações: concluída vira ficha de Projetos realizados (sem o nome do cliente)', proj.conclusao === '12/2026' && proj.potenciaKwp === inst.kwp && proj.modulos === inst.equipamentos.modulos &&
      proj.tipoSistema === 'ongrid' && proj.titulo.indexOf(inst.clienteNome) < 0 && !proj.foto1 && proj.exibir === true, JSON.stringify(proj).slice(0, 160));
    const branca = I.nova(ctxI);
    ok('instalações: em branco já traz as etapas do cronograma e o responsável', branca.etapas.length === D.textos.cronograma.length && branca.responsavel === ctxI.empresa.responsavel && !branca.propostaId);
    // checklist em três grupos e equipamentos instalados
    const inst2 = I.deProposta(pI, ctxI);
    igual('checklist: três grupos com os itens padrão', inst2.checklistInstalacao.map(function (g) { return g.titulo + ':' + g.itens.length + (g.naoSeAplica ? ' NA' : ''); }).join(' | '),
      'Estrutura de fixação e módulos:' + D.textos.checklistEstrutura.length + ' | String box:' + D.textos.checklistStringBox.length + ' | Inversor:' + D.textos.checklistInversor.length);
    ok('checklist: com microinversores a string box começa como "não se aplica"', I.checklistPadrao(D.textos, true)[1].naoSeAplica === true && I.checklistPadrao(D.textos, false)[1].naoSeAplica === false);
    const g0 = inst2.checklistInstalacao[0];
    g0.itens.forEach(function (it, k) { if (k < g0.itens.length - 1) I.marcarItem(inst2, g0, it, true); });
    const hAntes = inst2.historico.length;
    I.marcarItem(inst2, g0, g0.itens[g0.itens.length - 1], true);
    ok('checklist: grupo completo entra no histórico', inst2.historico.length === hAntes + 1 && /Checklist "Estrutura de fixação e módulos" concluído/.test(inst2.historico[0].texto));
    const pc0 = I.progressoChecklist(inst2);
    inst2.checklistInstalacao[1].naoSeAplica = true;
    const pc1 = I.progressoChecklist(inst2);
    ok('checklist: progresso ignora grupo que não se aplica', pc0.feitos === g0.itens.length && pc1.total === pc0.total - inst2.checklistInstalacao[1].itens.length, JSON.stringify([pc0, pc1]));
    ok('equipamentos instalados: marca, modelo, potência e quantidade da proposta', inst2.placas.modulo.marca === r.modulo.fabricante && inst2.placas.modulo.modelo === r.modulo.modelo &&
      Number(inst2.placas.modulo.potencia) === 625 && Number(inst2.placas.modulo.quantidade) === 9 && inst2.placas.inversor.marca === r.inversor.fabricante && inst2.placas.inversor.modelo === r.inversor.modelo &&
      Array.isArray(inst2.placas.modulo.fotos) && Array.isArray(inst2.placas.inversor.fotos), JSON.stringify(inst2.placas));
    ok('equipamentos instalados: vêm ligados ao cadastro (equipamento da proposta)', inst2.placas.modulo.equipamentoId === r.modulo.id && inst2.placas.inversor.equipamentoId === r.inversor.id);
    const listaMod = I.opcoesCadastro(ctxI.equipamentos, 'modulo'), listaInv = I.opcoesCadastro(ctxI.equipamentos, 'inversor');
    ok('equipamentos instalados: lista do cadastro por tipo (módulos; inversores, micros e híbridos)', listaMod.length > 0 && listaMod.every(function (e) { return e.tipo === 'modulo'; }) &&
      listaInv.length > 0 && listaInv.every(function (e) { return ['inversor', 'micro', 'hibrido'].indexOf(e.tipo) >= 0; }) && listaMod.some(function (e) { return e.id === r.modulo.id; }));
    const plTeste = { equipamentoId: r.modulo.id, marca: 'A', modelo: 'B', potencia: 1 };
    I.placaDoCadastro(plTeste, null);
    ok('equipamentos instalados: "não está no cadastro" mantém o que foi digitado', plTeste.equipamentoId === '' && plTeste.marca === 'A' && plTeste.modelo === 'B');
    const outro = listaMod.find(function (e) { return e.id !== r.modulo.id; }) || listaMod[0];
    I.placaDoCadastro(plTeste, outro);
    ok('equipamentos instalados: escolher da lista preenche marca, modelo e potência', plTeste.equipamentoId === outro.id && plTeste.marca === (outro.fabricante || '') && plTeste.modelo === outro.modelo && plTeste.potencia === outro.potencia);
    const digitada = { equipamentoId: '', marca: String(r.modulo.fabricante || '').toUpperCase(), modelo: '  ' + r.modulo.modelo + ' ', potencia: '' };
    I.vincularCadastro(digitada, ctxI.equipamentos, 'modulo');
    ok('equipamentos instalados: marca e modelo digitados iguais aos do cadastro ficam ligados a ele', digitada.equipamentoId === r.modulo.id);
    const inst3 = I.nova(ctxI);
    inst3.placas.modulo.serie = 'LOTE-1'; inst3.placas.modulo.fotos = ['foto-x']; inst3.placas.inversor.serie = 'SN9';
    ok('equipamentos instalados: puxar da proposta mantém nº de série e fotos', I.placasDaProposta(inst3, pI, ctxI) && inst3.placas.modulo.modelo === r.modulo.modelo && Number(inst3.placas.modulo.quantidade) === 9 &&
      inst3.placas.inversor.modelo === r.inversor.modelo && inst3.placas.modulo.serie === 'LOTE-1' && inst3.placas.modulo.fotos[0] === 'foto-x' && inst3.placas.inversor.serie === 'SN9');
    inst2.placas.modulo.marca = 'Marca X'; inst2.placas.modulo.modelo = 'MX-610'; inst2.placas.modulo.potencia = 610; inst2.placas.modulo.quantidade = 10;
    igual('equipamentos instalados: portfólio usa o que foi instalado', I.paraProjeto(inst2).modulos, '10 × Marca X MX-610 (610 Wp)');
    // ordens de serviço
    const Ord = App.Ordem;
    inst2.id = 'inst-teste';
    const os = Ord.nova(ctxI, inst2);
    ok('OS: ligada à instalação traz cliente, telefone e endereço', os.instalacaoId === 'inst-teste' && os.clienteNome === inst2.clienteNome && os.telefone === '(67) 99999-0000' &&
      os.endereco === inst2.endereco && os.status === 'aberta' && os.responsavel === ctxI.empresa.responsavel);
    ok('OS: numeração própria OS-AAAAMMDD-NNN, separada da das propostas', /^OS-20261029-\d{3}$/.test(App.Store.proximoNumero('2026-10-29', 'os').numero) && !/^OS-/.test(App.Store.proximoNumero('2026-10-29').numero));
    os.agendadaPara = '2026-11-10';
    ok('OS: agendada vencida aparece como atrasada', Ord.atrasada(os, '2026-11-11') && !Ord.atrasada(os, '2026-11-10'));
    Ord.mudarStatus(os, 'concluida', '2026-11-12');
    ok('OS: concluir marca a data e deixa de estar em aberto', os.concluidaEm === '2026-11-12' && !Ord.aberta(os) && !Ord.atrasada(os, '2027-01-01'));
    Ord.mudarStatus(os, 'aberta');
    ok('OS: reabrir limpa a conclusão', os.concluidaEm === '' && Ord.aberta(os));
    igual('OS: tipos de serviço', Ord.TIPOS.map(function (t) { return t.id; }).join(','), 'preventiva,corretiva,limpeza,visita,garantia,vistoria,ampliacao,pendencia,outro');
    // assinaturas e PDFs da execução
    ok('assinatura: OS e instalação nascem com cliente e técnico em branco', ['cliente', 'tecnico'].every(function (k) { return os.assinaturas[k] && os.assinaturas[k].fotoId === '' && inst2.assinaturas[k] && inst2.assinaturas[k].fotoId === ''; }));
    ok('assinatura: termos de aceite padrão', /executados pela \{empresaCurta\}/.test(D.textos.termoOS) && /instalado e em funcionamento/.test(D.textos.termoInstalacao));
    igual('assinatura: data e hora por extenso curto', App.Assinatura.dataHora('2026-10-29T14:05:00'), '29/10/2026 às 14:05');
    const recVazio = { logo: { w: 1400, h: 752 }, imagens: {}, dims: {}, legendas: {} };
    const ctxRel = Object.assign({}, ctxI, { instalacoes: [inst2], ordens: [Object.assign({}, os, { id: 'os1', numero: 'OS-20261029-001' })] });
    const osPdf = Object.assign({}, os, { numero: 'OS-20261029-001', descricao: 'Inversor desligando', servico: 'Conector refeito', materiais: [{ descricao: 'MC4', qtd: '2' }] });
    const txOS = textoModelo(App.Relatorios.montarOS(osPdf, ctxRel, recVazio)).join('\n');
    ok('PDF da OS: faixa, cliente, atendimento, solicitação, serviço, materiais, termo e assinaturas', ['ORDEM DE SERVIÇO', 'OS-20261029-001', 'Cliente e local do atendimento', inst2.clienteNome, 'Atendimento',
      'Solicitação / problema relatado', 'Inversor desligando', 'Serviço executado', 'Conector refeito', 'Materiais utilizados', 'Aceite e assinaturas', 'Data: ____/____/________', 'Cliente'].every(function (x) { return txOS.indexOf(x) >= 0; }) &&
      txOS.indexOf('{empresaCurta}') < 0 && txOS.indexOf(ctxI.empresa.nomeCurto || ctxI.empresa.razao) >= 0, txOS.slice(0, 200));
    const txRel = textoModelo(App.Relatorios.montarInstalacao(inst2, ctxRel, recVazio)).join('\n');
    ok('PDF da instalação: obra, sistema, equipamentos, etapas, checklist, ordens de serviço e termo', ['RELATÓRIO DE INSTALAÇÃO', 'Cliente e obra', 'Sistema instalado', 'Marca X MX-610', 'Etapas da instalação',
      'Checklist da instalação', 'Estrutura de fixação e módulos', 'não se aplica', 'Ordens de serviço', 'OS-20261029-001', 'Termo de entrega e aceite'].every(function (x) { return txRel.indexOf(x) >= 0; }), txRel.slice(0, 200));
    ok('instalações: coleções sincronizadas e no backup', ['instalacoes', 'ordens'].every(function (c) { return App.Store.COLECOES.indexOf(c) >= 0 && Array.isArray(App.Store.exportar().colecoes[c]); }));
  })();

  // ---------------------------------------------------------------- CRM Solar: indicadores do dashboard
  (function () {
    const K = App.Crm;
    igual('CRM: período deste mês e o anterior de mesma duração', JSON.stringify(K.intervalo('mes', '2026-10-30')), JSON.stringify({ ini: '2026-10-01', fim: '2026-10-30', iniAnt: '2026-09-01', fimAnt: '2026-09-30' }));
    igual('CRM: últimos 3 meses começam no 1º dia de 2 meses atrás', K.intervalo('3m', '2026-10-30').ini, '2026-08-01');
    igual('CRM: este ano', K.intervalo('ano', '2026-10-30').ini, '2026-01-01');
    ok('CRM: "tudo" sem período anterior', K.intervalo('tudo', '2026-10-30').iniAnt === null);
    const pp = { status: 'enviada', data: '2026-10-01' };
    K.mudarStatus(pp, 'aprovada', '2026-10-20');
    ok('CRM: aprovar registra a data da aprovação e da mudança', pp.status === 'aprovada' && pp.aprovadaEm === '2026-10-20' && pp.statusEm === '2026-10-20');
    K.mudarStatus(pp, 'negociacao', '2026-10-25'); K.mudarStatus(pp, 'aprovada', '2026-10-28');
    ok('CRM: reaprovar mantém a primeira data de aprovação', pp.aprovadaEm === '2026-10-20' && pp.statusEm === '2026-10-28');
    igual('CRM: venda antiga (sem data de aprovação) conta pela emissão', K.dataVenda({ data: '2026-05-03' }), '2026-05-03');
    const pr = function (o) { return Object.assign({ tipoSistema: 'ongrid', validadeDias: 5 }, o); };
    const lista = [
      pr({ status: 'aprovada', data: '2026-10-02', aprovadaEm: '2026-10-10', resumo: { total: 20000, kwp: 8 } }),
      pr({ status: 'aprovada', data: '2026-09-20', aprovadaEm: '2026-10-05', tipoSistema: 'hibrido', resumo: { total: 40000, kwp: 6 } }),
      pr({ status: 'aprovada', data: '2026-09-02', aprovadaEm: '2026-09-15', resumo: { total: 30000, kwp: 10 } }),
      pr({ status: 'recusada', data: '2026-10-03', recusadaEm: '2026-10-12', resumo: { total: 15000 } }),
      pr({ status: 'enviada', data: '2026-10-01', statusEm: '2026-10-01', resumo: { total: 12000 } }),
      pr({ status: 'negociacao', data: '2026-10-27', statusEm: '2026-10-27', resumo: { total: 18000 } }),
      pr({ status: 'rascunho', data: '2026-10-29', resumo: { total: 9000 } })
    ];
    const d = K.indicadores({ propostas: lista, instalacoes: [], ordens: [], validadePadrao: 5 }, 'mes', '2026-10-30');
    ok('CRM: vendido no mês, nº de vendas, kWp e ticket médio', d.vendido === 60000 && d.nVendas === 2 && d.kwpVendido === 14 && d.ticket === 30000, JSON.stringify([d.vendido, d.nVendas, d.kwpVendido, d.ticket]));
    ok('CRM: variação contra o mês anterior', d.vendidoAnt === 30000);
    ok('CRM: conversão = aprovadas ÷ decididas no período', Math.abs(d.conversao - 2 / 3) < 1e-9 && d.decididas === 3);
    ok('CRM: emitidas no período e em aberto agora', d.emitidas === 5 && d.abertas.n === 3 && d.abertas.valor === 39000, JSON.stringify([d.emitidas, d.abertas]));
    igual('CRM: funil das emitidas no período', d.funil.map(function (e) { return e.id + ':' + e.n; }).join(',') + ',recusada:' + d.funilRecusadas.n, 'rascunho:1,enviada:1,negociacao:1,aprovada:1,recusada:1');
    ok('CRM: vendas por mês (12 meses) com os meses do período marcados', d.porMes.length === 12 && d.porMes[11].mes === '2026-10' && d.porMes[11].valor === 60000 && d.porMes[11].noPeriodo && d.porMes[10].valor === 30000 && !d.porMes[10].noPeriodo);
    igual('CRM: vendas do período por tipo', d.porTipo.map(function (t) { return t.id + ':' + t.valor; }).join(','), 'ongrid:20000,hibrido:40000,bess:0');
    igual('CRM: acompanhar — validade vencida primeiro, depois a que vence em até 3 dias', d.acompanhar.map(function (x) { return x.motivo; }).join(' | '), 'Validade vencida há 24 dias | Vence em 2 dias');
    const d12 = K.indicadores({ propostas: lista }, '12m', '2026-10-30');
    ok('CRM: 12 meses somam todas as vendas', d12.vendido === 90000 && d12.porMes.every(function (m) { return m.noPeriodo; }));
  })();

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
    ok('seu investimento: sem as barras da conta e sem "o que você recebe"', ['Sua proposta em uma página', 'Sua conta de luz por mês', 'O que você recebe'].every(function (x) { return txt.indexOf(x) < 0; }));
    ok('seu investimento: depois de "seu sistema" e antes de "o que está incluso", com como pagar e a validade', txt.indexOf('Seu investimento') > txt.indexOf('Seu sistema solar') &&
      txt.indexOf('Como pagar') > txt.indexOf('Seu investimento') && txt.indexOf('Como pagar') < txt.indexOf('O que está incluso') &&
      txt.indexOf('Proposta válida até') > txt.indexOf('Seu investimento') && txt.indexOf('Proposta válida até') < txt.indexOf('O que está incluso'));
    // como pagar: todas as opções em cartões
    const pgs = r.pagamentos;
    ok('resumo: todas as opções de pagamento em cartões, com a nota de pagamento', pgs.length >= 3 && pgs.every(function (pg) {
      return txt.indexOf(pg.label.split(' — ')[0]) >= 0 && (pg.prazo === '1x' ? tx.indexOf(U.brl(pg.total)) >= 0 : tx.indexOf(parseInt(pg.prazo, 10) + ' × ' + U.brl(pg.parcela)) >= 0);
    }) && txt.indexOf('melhor preço') >= 0 && txt.indexOf(D.textos.notaPagamento) >= 0 && txt.indexOf('Sobra no mês') < 0);
    ok('resumo: total pago e aviso quando a parcela cabe na economia do mês', pgs.filter(function (pg) { return pg.prazo !== '1x' && Math.abs(pg.total - r.total) >= 1; })
      .every(function (pg) { return txt.indexOf('total ' + U.brl(pg.total)) >= 0; }) &&
      (txt.match(/parcela menor que a economia do mês/g) || []).length === pgs.filter(function (pg) { return pg.prazo !== '1x' && f.economiaMes1 > pg.parcela; }).length);
    ok('como funciona: ilustração e 5 passos', !!m.imagens.comoFunciona && txt.indexOf('Painéis no telhado captam a luz do sol') >= 0 && txt.indexOf('À noite e em dias nublados você usa a rede') >= 0);
    ok('benefícios personalizados com os números do cliente', txt.indexOf('Por que vale a pena para você') >= 0 && new RegExp('De R\\$ [\\d.]+ para cerca de R\\$ [\\d.]+ por mês').test(txt));
    ok('seu sistema: faixa de indicadores, gráfico e equipamentos com garantia', txt.indexOf('geração média/mês') >= 0 && txt.indexOf('Geração estimada mês a mês') >= 0 && /Garantia: /.test(txt));
    ok('o que está incluso: inclusos, não inclusos, garantias e pós-instalação', ['Está incluso', 'Não está incluso', 'Projeto elétrico completo + ART/CFT-BR', 'Troca do padrão de entrada (medidor)', 'Garantias', 'Depois da instalação: ']
      .every(function (x) { return txt.indexOf(x) >= 0; }));
    ok('quanto você economiza: quadros, explicações e tabela dos anos', ['Conta hoje', 'Você economiza', 'Por que a conta não zera?', 'O que é o Fio B?', 'Sua conta de luz nos próximos anos'].every(function (x) { return txt.indexOf(x) >= 0; }));
    ok('investimento e retorno juntos: volta em, TIR, vezes, custo do kWh e saldo acumulado', !!m.imagens.saldo && ['O investimento volta em', 'Rentabilidade (TIR)', 'vezes o valor investido', 'Custo da sua energia solar', '/kWh',
      'Seu dinheiro ao longo do tempo (saldo acumulado)'].every(function (x) { return txt.indexOf(x) >= 0; }) && txt.indexOf('Retorno do investimento') < 0 && txt.indexOf('Tempo de retorno') < 0 &&
      txt.indexOf('Seu dinheiro ao longo do tempo') > txt.indexOf('Seu investimento e retorno') && txt.indexOf('Seu dinheiro ao longo do tempo') < txt.indexOf('Como pagar'));
    ok('seção de investimento e pagamento retirada (valor e pagamento ficam no resumo)', ['Investimento e formas de pagamento', 'Investimento total', 'Tudo incluído:', 'Composição do investimento'].every(function (x) { return txt.indexOf(x) < 0; }));
    ok('seções retiradas: dados do cliente, lista de equipamentos e passo a passo', ['Dados do cliente e do projeto', 'Lista de equipamentos e materiais', 'Passo a passo', 'Tipo de Telhado'].every(function (x) { return txt.indexOf(x) < 0; }));
    // conta dos próximos anos: ano a ano, valores arredondados e total
    const somaEco = f.anos.reduce(function (s0, a) { return s0 + a.economiaMes * 12; }, 0);
    const reais = function (v) { return U.brl(Math.round(v)).replace(/,00$/, ''); };
    ok('conta nos próximos anos: formato com Fio B nos anos da projeção (2026–2031, 2035, 2040, 2045 e 2050), amigável, com o total',
      f.projecao.map(function (a) { return a.ano; }).join(',') === '2026,2027,2028,2029,2030,2031,2035,2040,2045,2050' && f.projecao.every(function (a) {
      return [String(a.ano), U.fmtSmart(a.pctFioB * 100, 0) + '%', reais(a.contaSem), reais(a.custoDisp), reais(a.energiaGD), reais(a.cosip), reais(a.contaCom), reais(a.economiaMes)].every(function (x) { return tx.indexOf(x) >= 0; });
    }) && ['Fio B', 'Mínimo', 'disponibilidade', 'Energia + Fio B', 'COSIP', 'Com energia solar', 'Você economiza', 'o que vale está em negrito', 'Somando os 25 anos, a economia na conta de luz chega a ', reais(somaEco)]
      .every(function (x) { return txt.indexOf(x) >= 0; }) && txt.indexOf('Economia no mês') < 0, reais(a1.contaSem) + ' / ' + reais(somaEco));
    ok('valores acima de 1 milhão por extenso', /^R\$ \d+,\d\d milh(ão|ões)$/.test((function () { const x = App.Documento.montar(p, Object.assign({}, r, { fin: Object.assign({}, f, { economiaTotal: 2234567 }) }), ctx, ctx.clientes[0], { w: 1400, h: 752 });
      return textoModelo(x).find(function (y) { return /milh/.test(y); }) || ''; })()));
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
    ok('nuvem: regras do Firestore — dono pelo e-mail verificado, equipe cadastrada e coleções por perfil', /email\(\) == "fulano@gmail\.com" && request\.auth\.token\.email_verified == true/.test(regras) &&
      /match \/usuarios\/\{uid\}\/\{col\}\/\{id\}/.test(regras) && /match \/usuarios\/\{uid\}\/partes\/\{parte\}/.test(regras) && /match \/equipe\/\{conta\}/.test(regras) &&
      /\['lancamentos', 'contasFin', 'categoriasFin'\]/.test(regras) && !/\{documento=\*\*\}/.test(regras) &&
      /request\.auth\.token\.email_verified == true \|\| cadastro\(\)\.get\('uid', ''\) == request\.auth\.uid/.test(regras), regras);
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

  // ---------------------------------------------------------------- acesso por perfil
  (function () {
    const A = App.Acesso;
    igual('acesso: sem a sincronização configurada, o app é de uma pessoa só (administrador)', A.perfil(), 'admin');
    const todas = App.Store.COLECOES;
    ok('acesso: coleções novas do financeiro na base', ['lancamentos', 'contasFin', 'categoriasFin'].every(function (c) { return todas.indexOf(c) >= 0; }), todas.join(','));
    igual('acesso: administrador sincroniza tudo', A.colecoes('admin').length, todas.length);
    ok('acesso: vendedor sincroniza tudo menos o financeiro', A.colecoes('vendedor').length === todas.length - 3 && A.colecoes('vendedor').indexOf('lancamentos') < 0 && A.colecoes('vendedor').indexOf('propostas') >= 0);
    igual('acesso: técnico sincroniza instalações, OS, clientes e equipamentos', A.colecoes('tecnico').slice().sort().join(','), 'clientes,equipamentos,instalacoes,ordens');
    ok('acesso: técnico grava instalações e OS, só consulta clientes e equipamentos', A.podeGravar('instalacoes', 'tecnico') && A.podeGravar('ordens', 'tecnico') &&
      A.podeLer('clientes', 'tecnico') && !A.podeGravar('clientes', 'tecnico') && !A.podeLer('propostas', 'tecnico') && !A.podeLer('compras', 'tecnico'));
    ok('acesso: numeração (config) e fotos liberadas para todos os perfis', ['admin', 'vendedor', 'tecnico'].every(function (x) { return A.podeGravar('config', x) && A.podeGravar('fotos', x); }));
    ok('acesso: vendedor sem financeiro; grava propostas, contratos e compras', !A.podeLer('lancamentos', 'vendedor') && !A.podeGravar('contasFin', 'vendedor') &&
      A.podeGravar('propostas', 'vendedor') && A.podeGravar('contratos', 'vendedor') && A.podeGravar('compras', 'vendedor'));
    ok('acesso: telas do vendedor (sem financeiro, configurações e equipe)', A.rota('/propostas', 'vendedor') && A.rota('/proposta/abc', 'vendedor') && A.rota('/painel', 'vendedor') &&
      A.rota('/conta', 'vendedor') && A.rota('/nuvem', 'vendedor') && !A.rota('/financeiro', 'vendedor') && !A.rota('/financeiro/dre', 'vendedor') && !A.rota('/empresa', 'vendedor') &&
      !A.rota('/premissas', 'vendedor') && !A.rota('/equipe', 'vendedor') && !A.rota('/dados', 'vendedor'));
    ok('acesso: telas do técnico (instalações e OS)', A.rota('/instalacoes', 'tecnico') && A.rota('/instalacao/x1', 'tecnico') && A.rota('/ordens', 'tecnico') && A.rota('/ordem/nova', 'tecnico') &&
      A.rota('/conta', 'tecnico') && !A.rota('/painel', 'tecnico') && !A.rota('/propostas', 'tecnico') && !A.rota('/compras', 'tecnico') && !A.rota('/financeiro', 'tecnico') && !A.rota('/clientes', 'tecnico'));
    ok('acesso: administrador abre todas as telas', ['/financeiro', '/financeiro/dre', '/equipe', '/empresa', '/propostas'].every(function (r) { return A.rota(r, 'admin'); }));
    ok('acesso: tela inicial e valores por perfil', A.inicio('tecnico') === '/instalacoes' && A.inicio('vendedor') === '/painel' && !A.veValores('tecnico') && A.veValores('vendedor'));
  })();

  // ---------------------------------------------------------------- financeiro
  (function () {
    const F = App.Fin;
    const cats = U.clone(D.categoriasFin);
    let seq = 0;
    const L = function (tipo, x) { return F.novoLancamento(tipo, Object.assign({ id: 'l' + (++seq) }, x)); };

    // plano de contas padrão
    ok('financeiro: plano de contas com receitas, deduções, custos, despesas, financeiro, IR e fora do resultado',
      D.GRUPOS_DRE.every(function (g) { return cats.some(function (c) { return c.grupo === g.id; }); }) && cats.every(function (c) { return c.tipo === 'receber' || c.tipo === 'pagar'; }) &&
      cats.filter(function (c) { return c.grupo === 'receita'; }).every(function (c) { return c.tipo === 'receber'; }), cats.length);
    ok('financeiro: ids das categorias únicos', (function () { const v = {}; return cats.every(function (c) { if (v[c.id]) return false; v[c.id] = true; return true; }); })());

    // parcelas
    const pa = F.gerarParcelas({ tipo: 'receber', descricao: 'Venda', categoriaId: 'cat-rec-sistemas' }, { total: 1000, n: 3, primeiroVencimento: '2026-01-31', competencia: '2026-01-20' });
    igual('parcelas: valores com o arredondamento na última', pa.map(function (x) { return x.valor; }).join('|'), '333.33|333.33|333.34');
    igual('parcelas: vencimentos mensais (fim de mês ajustado)', pa.map(function (x) { return x.vencimento; }).join('|'), '2026-01-31|2026-02-28|2026-03-31');
    ok('parcelas: mesma competência, mesmo grupo, numeradas', pa.every(function (x) { return x.competencia === '2026-01-20' && x.parcela.grupo === pa[0].parcela.grupo && x.parcela.de === 3 && x.situacao === 'aberto'; }) &&
      pa[2].parcela.n === 3 && / — parcela 3\/3$/.test(pa[2].descricao), pa[2].descricao);
    const pe = F.gerarParcelas({ tipo: 'receber', descricao: 'Venda' }, { total: 1000, n: 2, entrada: 100, dataEntrada: '2026-01-10', primeiroVencimento: '2026-02-10', intervaloDias: 15 });
    igual('parcelas: entrada + 2 parcelas a cada 15 dias', pe.map(function (x) { return x.vencimento + ':' + x.valor; }).join('|'), '2026-01-10:100|2026-02-10:450|2026-02-25:450');
    ok('parcelas: entrada como parcela 1 de 3', pe[0].parcela.n === 1 && pe[0].parcela.de === 3 && / — entrada$/.test(pe[0].descricao) && pe[2].parcela.n === 3);
    igual('parcelas: valor único sem sufixo', F.gerarParcelas({ tipo: 'pagar', descricao: 'Aluguel' }, { total: 1500, n: 1, primeiroVencimento: '2026-01-05' })[0].descricao, 'Aluguel');

    // baixa, saldo parcial, estorno, situação
    const l1 = L('receber', { descricao: 'Parcela', valor: 1000, vencimento: '2026-02-10' });
    igual('situação: em aberto vencido', F.situacao(l1, '2026-02-11'), 'vencido');
    igual('situação: em aberto no prazo', F.situacao(l1, '2026-02-10'), 'aberto');
    const b1 = F.baixar(U.clone(l1), { data: '2026-02-12', contaId: 'cx', valor: 400, juros: 10, forma: 'pix' });
    ok('baixa parcial: paga 400 (+ juros 10) e cria o saldo de 600 em aberto', b1.lancamento.situacao === 'pago' && b1.lancamento.valor === 400 && b1.lancamento.valorPago === 410 &&
      b1.lancamento.pagoEm === '2026-02-12' && b1.lancamento.contaId === 'cx' && b1.saldo && b1.saldo.valor === 600 && b1.saldo.situacao === 'aberto' && !b1.saldo.id &&
      b1.saldo.vencimento === '2026-02-10' && / \(saldo\)$/.test(b1.saldo.descricao), JSON.stringify(b1.saldo));
    const b2 = F.baixar(U.clone(l1), { data: '2026-02-09', contaId: 'cx', valor: '', desconto: 50 });
    ok('baixa total com desconto: valor pago 950, sem saldo', b2.lancamento.valorPago === 950 && b2.saldo === null && b2.lancamento.valor === 1000);
    const es = F.estornar(U.clone(b2.lancamento));
    ok('estorno: volta para em aberto, sem data e valor pago', es.situacao === 'aberto' && !es.pagoEm && !es.valorPago && !es.desconto);

    // caixa e bancos
    const cA = { id: 'cA', nome: 'Banco', saldoInicial: 1000, dataSaldoInicial: '2026-01-01', ativo: true }, cB = { id: 'cB', nome: 'Caixa', saldoInicial: 0, ativo: true };
    const mov = [
      L('receber', { valor: 500, situacao: 'pago', pagoEm: '2026-02-10', valorPago: 500, contaId: 'cA', descricao: 'Recebimento' }),
      L('pagar', { valor: 200, situacao: 'pago', pagoEm: '2026-02-15', valorPago: 200, contaId: 'cA', descricao: 'Pagamento' }),
      F.transferencia('cA', 'cB', 300, '2026-02-20', 'Sangria'),
      L('pagar', { valor: 999, situacao: 'aberto', vencimento: '2026-02-18', contaId: 'cA' }),
      L('receber', { valor: 50, situacao: 'pago', pagoEm: '2025-12-20', valorPago: 50, contaId: 'cA', descricao: 'antes do saldo inicial' })
    ];
    igual('caixa: saldo = inicial + entradas − saídas − transferência (em aberto e antes do saldo inicial não entram)', F.saldoConta(cA, mov, '2026-02-28'), 1000);
    igual('caixa: transferência entra na conta de destino', F.saldoConta(cB, mov, '2026-02-28'), 300);
    igual('caixa: saldo numa data', F.saldoConta(cA, mov, '2026-02-12'), 1500);
    igual('caixa: saldo total das contas ativas', F.saldoTotal([cA, cB, { id: 'cC', saldoInicial: 70, ativo: false }], mov, '2026-02-28'), 1300);
    const ex = F.extrato(cA, mov, '2026-02-12', '2026-02-28');
    ok('extrato: saldo anterior, linhas do período e saldo corrente', ex.anterior === 1500 && ex.linhas.length === 2 && ex.linhas[0].saida === 200 && ex.linhas[0].saldo === 1300 &&
      ex.linhas[1].saida === 300 && ex.final === 1000, JSON.stringify(ex.linhas.map(function (x) { return [x.data, x.saldo]; })));
    const rs = F.resumo(mov.concat([L('receber', { valor: 800, vencimento: '2026-03-05' }), L('receber', { valor: 120, vencimento: '2026-02-01' })]), [cA, cB], '2026-02-20');
    ok('resumo: saldo, a receber em 30 dias, vencidos e realizado no mês', rs.saldo === 1300 && rs.aReceber30 === 800 && rs.vencRec.n === 1 && rs.vencRec.valor === 120 &&
      rs.vencPag.n === 1 && rs.vencPag.valor === 999 && rs.recebidoMes === 500 && rs.pagoMes === 200, JSON.stringify(rs));
    const fl = F.fluxo(mov.concat([L('receber', { valor: 800, vencimento: '2026-03-05' }), L('pagar', { valor: 100, vencimento: '2026-04-02' })]), [cA, cB], '2026-02-20', 1, 2);
    ok('fluxo: mês passado realizado; atual com vencidos; seguintes previstos; saldo projetado', fl.length === 4 && fl[0].mes === '2026-01' && fl[0].passado && fl[0].entradas === 0 &&
      fl[1].atual && fl[1].entradas === 500 && fl[1].saidas === 200 + 999 && fl[1].saldo === 1300 - 999 && fl[2].entradas === 800 && fl[2].saldo === 1300 - 999 + 800 &&
      fl[3].saidas === 100 && fl[3].saldo === 1300 - 999 + 800 - 100 && fl[0].saldo === 1000 && fl[1].rot === 'fev/26', JSON.stringify(fl.map(function (m) { return [m.mes, m.entradas, m.saidas, m.saldo]; })));

    // DRE
    const dl = [
      L('receber', { valor: 10000, categoriaId: 'cat-rec-sistemas', competencia: '2026-03-05', vencimento: '2026-03-10' }),
      L('pagar', { valor: 4000, categoriaId: 'cat-cus-kit', competencia: '2026-03-06', situacao: 'pago', pagoEm: '2026-04-02', valorPago: 4000 }),
      L('pagar', { valor: 300, categoriaId: 'cat-ded-impostos', competencia: '2026-03-31' }),
      L('pagar', { valor: 1000, categoriaId: 'cat-adm-aluguel', competencia: '2026-03-01', situacao: 'pago', pagoEm: '2026-04-10', juros: 20, valorPago: 1020 }),
      L('pagar', { valor: 5000, categoriaId: 'cat-fora-investimentos', competencia: '2026-03-15' }),
      L('pagar', { valor: 77, categoriaId: 'cat-adm-outras', competencia: '2026-03-15', situacao: 'cancelado' }),
      L('receber', { valor: 90, categoriaId: 'cat-rec-outras', competencia: '2025-12-15' }),
      F.transferencia('cA', 'cB', 300, '2026-03-20')
    ];
    const dc = F.dre(dl, cats, '2026', 'competencia');
    const lin = function (d, label) { return d.linhas.find(function (x) { return x.label === label; }); };
    const grp = function (d, id) { return d.linhas.find(function (x) { return x.tipo === 'grupo' && x.id === id; }); };
    ok('DRE competência: receita, deduções, receita líquida e lucro bruto no mês da venda', grp(dc, 'receita').valores[2] === 10000 && grp(dc, 'deducao').total === -300 &&
      lin(dc, '= Receita líquida').total === 9700 && dc.receitaLiquida === 9700 && lin(dc, '= Lucro bruto (margem de contribuição das obras)').valores[2] === 5700);
    ok('DRE competência: despesas, juros da baixa no mês do pagamento e resultado líquido', grp(dc, 'despesa_admin').total === -1000 && grp(dc, 'financeiro_despesa').valores[3] === -20 &&
      lin(dc, '= Resultado operacional').total === 4700 && dc.linhas[dc.linhas.length - 1].total === 4680 && dc.linhas[dc.linhas.length - 1].destaque);
    ok('DRE: investimentos fora do resultado; cancelados, transferências e outro ano não entram', dc.fora.total === -5000 && grp(dc, 'receita').total === 10000 && dc.semCategoria === 0);
    ok('DRE: linhas por categoria dentro do grupo', dc.linhas.some(function (x) { return x.tipo === 'categoria' && x.id === 'cat-cus-kit' && x.total === -4000; }) &&
      dc.linhas.some(function (x) { return x.tipo === 'categoria' && x.id === 'juros-pagos' && x.label === 'Juros e multas pagos (nas baixas)'; }));
    const dx = F.dre(dl, cats, '2026', 'caixa');
    ok('DRE caixa: só o realizado, no mês do pagamento', grp(dx, 'receita').total === 0 && grp(dx, 'custo').valores[3] === -4000 && grp(dx, 'custo').valores[2] === 0 &&
      grp(dx, 'despesa_admin').valores[3] === -1000 && dx.linhas[dx.linhas.length - 1].total === -5020 && dx.regime === 'caixa');
    const dsc = F.dre([L('pagar', { valor: 50, categoriaId: 'inexistente', competencia: '2026-05-01' })], cats, '2026');
    ok('DRE: lançamento sem categoria vai para despesas administrativas e é contado', dsc.semCategoria === 1 && grp(dsc, 'despesa_admin').total === -50);
    const csv = F.dreCsv(dc);
    ok('DRE em planilha: ; e vírgula decimal, 14 colunas', /^Linha;jan\/2026;fev\/2026/.test(csv) && /"= Resultado líquido do período";0;0;4700;-20;/.test(csv) && /;97;/.test(csv.split('\r\n')[2]) === false &&
      csv.split('\r\n')[0].split(';').length === 15, csv.split('\r\n').slice(0, 3).join(' / '));

    // resultado por obra e comissões
    const obra = Object.assign(U.clone(p), { id: 'obra1', status: 'aprovada', aprovadaEm: '2026-03-01', precificacao: 'margem', instalacaoFaixa: 1, lucroModo: 'pct', lucroPct: 0.15, comissaoPct: 0.05,
      infraValor: '', valorTotal: '', vendedor: { email: 'vend@empresa.com', nome: 'Vendedora' } });
    const ro = C.calcular(U.clone(obra), ctx);
    const ol = [
      L('receber', { valor: U.round(ro.total / 2, 2), obraId: 'obra1', situacao: 'pago', pagoEm: '2026-03-02', valorPago: U.round(ro.total / 2, 2), categoriaId: 'cat-rec-sistemas' }),
      L('receber', { valor: U.round(ro.total / 2, 2), obraId: 'obra1', categoriaId: 'cat-rec-sistemas' }),
      L('pagar', { valor: 8177.08, obraId: 'obra1', categoriaId: 'cat-cus-kit' }),
      L('pagar', { valor: 720, obraId: 'obra1', categoriaId: 'cat-cus-maoobra', situacao: 'pago', pagoEm: '2026-03-20', valorPago: 720 }),
      L('pagar', { valor: 100, obraId: 'obra1', categoriaId: 'cat-com-comissoes', origem: { tipo: 'comissao', id: 'obra1', numero: obra.numero } }),
      L('pagar', { valor: 400, obraId: 'obra1', categoriaId: 'cat-ded-impostos' })
    ];
    const res = F.resultadoObras([obra, Object.assign(U.clone(p), { id: 'outra', status: 'enviada' })], ol, cats, ctx);
    const o1 = res[0];
    ok('obras: só as aprovadas; vendido, recebido e a receber', res.length === 1 && Math.abs(o1.vendido - ro.total) < 0.01 && Math.abs(o1.recebido + o1.aReceber - ro.total) < 0.02, JSON.stringify(res.map(function (x) { return x.p.id; })));
    const T = U.round(ro.total, 2), lanc = U.round(ro.total / 2, 2) * 2;
    const linA = function (a, id) { return a.linhas.find(function (x) { return x.id === id; }); };
    ok('apuração: previsto da proposta — kit, mão de obra (9 × R$ 80), material CA, comissão 5% e lucro previsto 15%', linA(o1, 'kit').previsto === 8177.08 && linA(o1, 'maoobra').previsto === 720 &&
      linA(o1, 'materialCA').previsto === 0 && linA(o1, 'comissao').previsto === U.round(T * 0.05, 2) && linA(o1, 'impostos').previsto === 0 && Math.abs(o1.resultadoPrevisto - T * 0.15) < 0.02,
      JSON.stringify(o1.linhas.map(function (x) { return [x.id, x.previsto]; })));
    ok('apuração: realizado pelas categorias dos lançamentos da obra', linA(o1, 'kit').realizado === 8177.08 && linA(o1, 'maoobra').realizado === 720 && linA(o1, 'comissao').realizado === 100 &&
      linA(o1, 'impostos').realizado === 400 && linA(o1, 'adicionais').realizado === 0 && o1.custoRealizado === 9397.08 && o1.pago === 720 && o1.aPagar === 8677.08);
    ok('apuração aberta: maior entre previsto e realizado (comissão pelo previsto, impostos pelo realizado)', linA(o1, 'comissao').apurado === U.round(T * 0.05, 2) && linA(o1, 'comissao').pelo === 'previsto' &&
      linA(o1, 'impostos').apurado === 400 && linA(o1, 'impostos').pelo === 'realizado' && !o1.fechada);
    perto('apuração aberta: resultado = venda − kit − mão de obra − material CA − comissão − impostos', o1.resultado, U.round(lanc - 8177.08 - 720 - U.round(T * 0.05, 2) - 400, 2), 0.011);
    ok('apuração: margem apurada e efeito no resultado', Math.abs(o1.margem - o1.resultado / o1.receita) < 1e-9 && Math.abs(o1.variacao - (o1.resultado - o1.resultadoPrevisto)) < 0.011 && !o1.semLancamentos);
    ok('obras: margem prevista = lucro da composição ÷ valor de venda', Math.abs(o1.margemPrevista - 0.15) < 1e-4, o1.margemPrevista);
    const fechada = F.apuracaoObra(Object.assign(U.clone(obra), { apuracao: { fechada: true, em: '2026-04-30' } }), ol, cats, ctx);
    ok('apuração fechada: vale o realizado (receita lançada e custos lançados)', fechada.fechada && fechada.fechadaEm === '2026-04-30' && fechada.receita === U.round(lanc, 2) &&
      fechada.custoApurado === 9397.08 && Math.abs(fechada.resultado - (lanc - 9397.08)) < 0.011 && linA(fechada, 'comissao').apurado === 100, JSON.stringify({ r: fechada.resultado }));
    const comImp = F.apuracaoObra(obra, ol, cats, ctx, { aliquota: 0.06 });
    ok('apuração: impostos previstos pela alíquota (6% da venda) e apurados pelo maior', linA(comImp, 'impostos').previsto === U.round(T * 0.06, 2) && linA(comImp, 'impostos').apurado === U.round(T * 0.06, 2) &&
      /6% no previsto/.test(linA(comImp, 'impostos').label));
    const ol2 = ol.concat([L('pagar', { valor: 180, obraId: 'obra1', categoriaId: 'cat-cus-adicionais' }), L('pagar', { valor: 90, obraId: 'obra1', categoriaId: 'cat-adm-veiculos' }),
      L('pagar', { valor: 5000, obraId: 'obra1', categoriaId: 'cat-fora-investimentos' }), L('pagar', { valor: 33, obraId: 'obra1', categoriaId: 'cat-cus-frete' })]);
    const ad = F.apuracaoObra(obra, ol2, cats, ctx, { instalacoes: [{ id: 'i1', propostaId: 'obra1', materiais: [{ descricao: 'Cabo 6 mm', qtdPrevista: 12, qtd: 10, custo: 5 }] }] });
    ok('apuração: custos adicionais (categoria própria e fora da proposta), frete em "outros" e investimento fora', linA(ad, 'adicionais').realizado === 270 && linA(ad, 'outros').realizado === 33 &&
      ad.custoRealizado === 9397.08 + 270 + 33 + 50, JSON.stringify(ad.linhas.map(function (x) { return [x.id, x.realizado]; })));
    ok('apuração: material CA sem lançamento usa o consumo registrado na instalação', linA(ad, 'materialCA').realizado === 50 && /instalação/.test(linA(ad, 'materialCA').nota) && ad.instalacao && ad.instalacao.id === 'i1');
    ok('apuração: linha de cada categoria', F.linhaObra({ categoriaId: 'cat-cus-kit' }, cats) === 'kit' && F.linhaObra({ categoriaId: 'cat-ded-impostos' }, cats) === 'impostos' &&
      F.linhaObra({ categoriaId: 'cat-com-comissoes' }, cats) === 'comissao' && F.linhaObra({ categoriaId: 'cat-cus-projeto' }, cats) === 'outros' && F.linhaObra({ categoriaId: 'cat-fora-retiradas' }, cats) === null &&
      F.linhaObra({ categoriaId: 'cat-adm-aluguel' }, cats) === 'adicionais' && F.linhaObra({ categoriaId: 'nao-existe' }, cats) === 'adicionais');
    const antiga = F.apuracaoObra(Object.assign(U.clone(p), { id: 'antiga', status: 'aprovada' }), [], cats, ctx);
    ok('apuração de proposta sem preço pela margem: mão de obra estimada pelas premissas e sem lançamentos', linA(antiga, 'maoobra').previsto === 720 && /estimado/.test(linA(antiga, 'maoobra').nota) &&
      linA(antiga, 'materialCA').previsto === 1500 && antiga.vendido === 12700 && Math.abs(antiga.resultadoPrevisto - (12700 - 8177.08 - 720 - 1500)) < 0.01 && antiga.semLancamentos && antiga.resultado === antiga.resultadoPrevisto,
      JSON.stringify(antiga.linhas.map(function (x) { return [x.id, x.previsto]; })));
    const to = F.totaisObras([o1, fechada]);
    ok('obras: totais (venda, custos, resultados, margens, fechadas)', to.n === 2 && to.fechadas === 1 && Math.abs(to.resultado - (o1.resultado + fechada.resultado)) < 0.011 && Math.abs(to.margem - to.resultado / to.receita) < 1e-9);
    const cm = F.comissoes([obra], ol, ctx);
    const v1 = cm.vendedores[0];
    ok('comissões: 5% da venda, liberada na proporção do recebido (50%), menos o já lançado', cm.vendas.length === 1 && v1.email === 'vend@empresa.com' && v1.nome === 'Vendedora' &&
      Math.abs(v1.comissao - ro.total * 0.05) < 0.01 && Math.abs(cm.vendas[0].fracao - 0.5) < 1e-4 && Math.abs(v1.liberada - ro.total * 0.025) < 0.02 && v1.lancada === 100 && v1.paga === 0 &&
      Math.abs(v1.aLancar - (v1.liberada - 100)) < 0.01, JSON.stringify(v1, ['email', 'comissao', 'liberada', 'lancada', 'aLancar']));
    ok('comissões: venda sem vendedor fica de fora', F.comissoes([Object.assign(U.clone(obra), { vendedor: null })], ol, ctx).vendas.length === 0);

    // OFX e conciliação
    const sgml = 'OFXHEADER:100\r\nDATA:OFXSGML\r\n\r\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKACCTFROM><BANKID>001<BRANCHID>1234-5<ACCTID>98765-0</BANKACCTFROM>' +
      '<BANKTRANLIST><DTSTART>20260201<DTEND>20260228120000[-3:BRT]' +
      '<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260211120000[-3:BRT]<TRNAMT>500.00<FITID>F1<MEMO>PIX RECEBIDO MARIA</STMTTRN>' +
      '<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260221<TRNAMT>-150,00<FITID>F2<NAME>ENERGISA<MEMO>PAGTO CONTA</STMTTRN>' +
      '<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260225<TRNAMT>-12.90<FITID>F3<MEMO>TARIFA PACOTE SERVICOS</STMTTRN>' +
      '<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260226<TRNAMT>3.21<FITID>F4<MEMO>RENDIMENTO APLIC</STMTTRN>' +
      '<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260227<TRNAMT>-80.00<FITID>F5<MEMO>PIX ENVIADO</STMTTRN>' +
      '</BANKTRANLIST><LEDGERBAL><BALAMT>1.240,31<DTASOF>20260228</LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>';
    const ofx = F.lerOfx(sgml);
    ok('OFX (SGML): conta, período, saldo e transações', ofx.banco === '001' && ofx.agencia === '1234-5' && ofx.conta === '98765-0' && ofx.inicio === '2026-02-01' && ofx.fim === '2026-02-28' &&
      ofx.saldo === 1240.31 && ofx.transacoes.length === 5 && ofx.transacoes[1].valor === -150 && ofx.transacoes[1].descricao === 'ENERGISA — PAGTO CONTA' && ofx.transacoes[0].data === '2026-02-11',
      JSON.stringify(ofx).slice(0, 300));
    const xml = '<?xml version="1.0"?><OFX><STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20260305</DTPOSTED><TRNAMT>-45.5</TRNAMT><FITID>X1</FITID><MEMO>JUROS CHEQUE ESPECIAL</MEMO></STMTTRN></OFX>';
    const ox = F.lerOfx(xml);
    ok('OFX (XML): transação lida', ox.transacoes.length === 1 && ox.transacoes[0].valor === -45.5 && ox.transacoes[0].descricao === 'JUROS CHEQUE ESPECIAL' && ox.saldo === null);
    let erroOfx = '';
    try { F.lerOfx('não é ofx'); } catch (e) { erroOfx = e.message; }
    ok('OFX: arquivo inválido é recusado', /não parece um extrato OFX/.test(erroOfx));
    ok('OFX: categoria sugerida (tarifa, juros, rendimento)', F.categoriaSugerida(ofx.transacoes[2]) === 'cat-fin-tarifas' && F.categoriaSugerida(ox.transacoes[0]) === 'cat-fin-juros' &&
      F.categoriaSugerida(ofx.transacoes[3]) === 'cat-fin-rendimentos' && F.categoriaSugerida(ofx.transacoes[4]) === 'cat-adm-outras');
    const lc = [
      L('receber', { valor: 500, situacao: 'pago', pagoEm: '2026-02-10', valorPago: 500, contaId: 'cA' }),
      L('pagar', { valor: 150, situacao: 'aberto', vencimento: '2026-02-25', contaId: 'cA' }),
      L('pagar', { valor: 80, situacao: 'pago', pagoEm: '2026-02-27', valorPago: 80, contaId: 'cA', conciliado: { fitid: 'F5' } }),
      L('receber', { valor: 500, situacao: 'pago', pagoEm: '2026-02-11', valorPago: 500, contaId: 'outra-conta' })
    ];
    const cc = F.conciliar(ofx.transacoes, lc, 'cA');
    igual('conciliação: conciliar o pago, baixar o aberto, criar os sem lançamento e reconhecer o já conciliado', cc.map(function (x) { return x.acao; }).join(','), 'conciliar,baixar,novo,novo,ja');
    ok('conciliação: casa com o lançamento da mesma conta e com a categoria sugerida', cc[0].lanc.id === lc[0].id && cc[1].lanc.id === lc[1].id && cc[2].categoriaId === 'cat-fin-tarifas' && cc[4].lanc.id === lc[2].id);
    const cc2 = F.conciliar([ofx.transacoes[0], Object.assign({}, ofx.transacoes[0], { fitid: 'F1b' })], lc, 'cA');
    ok('conciliação: um lançamento casa com uma transação só', cc2[0].acao === 'conciliar' && cc2[1].acao === 'novo');

    // lançar a partir dos documentos
    const bp = F.baseDe('proposta', Object.assign(U.clone(obra), { clienteNome: 'Cliente Exemplo' }), ctx);
    ok('documentos: proposta → a receber de vendas de sistemas, ligada à obra', Math.abs(bp.total - ro.total) < 0.01 && bp.base.tipo === 'receber' && bp.base.categoriaId === 'cat-rec-sistemas' &&
      bp.base.obraId === 'obra1' && bp.base.origem.tipo === 'proposta' && bp.base.pessoa.nome === 'Cliente Exemplo' && bp.base.competencia === '2026-03-01');
    const bc = F.baseDe('compra', { id: 'pc1', numero: 'PC-1', data: '2026-03-03', fornecedor: { nome: 'Elétrica' }, itens: [{ descricao: 'Cabo', qtd: 10, preco: 5 }], frete: 20, docFornecedor: '16.220' }, ctx);
    ok('documentos: pedido de compra → a pagar de materiais', bc.total === 70 && bc.base.tipo === 'pagar' && bc.base.categoriaId === 'cat-cus-materiais' && bc.base.documento === '16.220' &&
      bc.base.pessoa.nome === 'Elétrica' && bc.base.origem.tipo === 'compra', JSON.stringify({ t: bc.total }));
    const bk = F.baseDe('contrato', { id: 'k1', numero: 'CT-1', data: '2026-03-04', propostaId: 'obra1', clienteSnapshot: { nome: 'Maria' }, parcelas: [{ descricao: 'Entrada', valor: 3000 }, { descricao: 'Final', valor: 2000 }] }, ctx);
    ok('documentos: contrato → as parcelas do contrato, ligadas à obra', bk.total === 5000 && bk.parcelas.length === 2 && bk.parcelas[0].descricao === 'Entrada' && bk.base.obraId === 'obra1' && bk.base.pessoa.nome === 'Maria');
    const bo = F.baseDe('os', { id: 'os1', numero: 'OS-1', valor: '350,00', clienteNome: 'João' }, ctx);
    ok('documentos: OS → a receber de serviços', bo.total === 350 && bo.base.categoriaId === 'cat-rec-servicos' && bo.base.pessoa.nome === 'João');
    let erroDoc = '';
    try { F.baseDe('xyz', {}, ctx); } catch (e) { erroDoc = e.message; }
    ok('documentos: tipo desconhecido recusado', /sem lançamento/.test(erroDoc));
    const ld = [L('receber', { origem: { tipo: 'proposta', id: 'obra1' } }), L('receber', { origem: { tipo: 'proposta', id: 'obra1' }, situacao: 'cancelado' }), L('receber', { origem: { tipo: 'os', id: 'obra1' } })];
    igual('documentos: lançamentos já feitos do documento (sem os cancelados)', F.lancadosDe(ld, 'proposta', 'obra1').length, 1);
  })();

  // ---------------------------------------------------------------- relatórios do financeiro
  (function () {
    const F = App.Fin;
    const cats = U.clone(D.categoriasFin);
    let seq = 0;
    const L = function (tipo, x) { return F.novoLancamento(tipo, Object.assign({ id: 'r' + (++seq) }, x)); };
    const hojeT = '2026-03-31';
    const ab = [
      L('receber', { valor: 100, vencimento: '2026-04-10', pessoa: { nome: 'Ana' } }),
      L('receber', { valor: 200, vencimento: '2026-03-20', pessoa: { nome: 'Ana' } }),
      L('receber', { valor: 300, vencimento: '2026-02-15', pessoa: { nome: 'Bruno' } }),
      L('receber', { valor: 400, vencimento: '2026-01-15', pessoa: { nome: 'Bruno' } }),
      L('receber', { valor: 500, vencimento: '2025-12-01', pessoa: { nome: 'Carla' } }),
      L('receber', { valor: 999, vencimento: '2025-12-01', situacao: 'pago', pagoEm: '2026-01-02', valorPago: 999, pessoa: { nome: 'Carla' } }),
      L('pagar', { valor: 70, vencimento: '2026-03-01', pessoa: { nome: 'Fornecedor' } })
    ];
    const at = F.atrasos(ab, 'receber', hojeT);
    const pes = function (n) { return at.lista.find(function (x) { return x.pessoa === n; }); };
    ok('inadimplência: faixas de atraso por cliente (a vencer, 1–30, 31–60, 61–90, > 90)', pes('Ana').aVencer === 100 && pes('Ana').d30 === 200 && pes('Bruno').d60 === 300 && pes('Bruno').d90 === 400 &&
      pes('Carla').d90mais === 500 && pes('Carla').total === 500, JSON.stringify(at.lista));
    ok('inadimplência: totais, mais antigo e ordem pelo maior vencido', at.total.vencido === 1400 && at.total.aVencer === 100 && at.total.total === 1500 && at.lista[0].pessoa === 'Bruno' && pes('Carla').maisAntigo === '2025-12-01');
    igual('atrasos a pagar', F.atrasos(ab, 'pagar', hojeT).total.d30, 70);

    const cl = [
      L('receber', { valor: 1000, categoriaId: 'cat-rec-sistemas', competencia: '2026-03-05', situacao: 'pago', pagoEm: '2026-04-02', valorPago: 1000 }),
      L('receber', { valor: 300, categoriaId: 'cat-rec-servicos', competencia: '2026-03-10' }),
      L('pagar', { valor: 600, categoriaId: 'cat-cus-kit', competencia: '2026-03-06', situacao: 'pago', pagoEm: '2026-03-06', valorPago: 610, juros: 10 }),
      L('pagar', { valor: 200, categoriaId: 'cat-adm-aluguel', competencia: '2026-03-01' }),
      L('pagar', { valor: 5000, categoriaId: 'cat-fora-investimentos', competencia: '2026-03-15' }),
      L('pagar', { valor: 50, categoriaId: 'cat-adm-outras', competencia: '2026-03-15', situacao: 'cancelado' }),
      F.transferencia('cA', 'cB', 300, '2026-03-20')
    ];
    const pc = F.porCategoria(cl, cats, '2026-03-01', '2026-03-31', 'competencia');
    ok('por categoria (competência): receitas, despesas, % e fora do resultado separado', pc.receitas.total === 1300 && pc.despesas.total === 800 && pc.resultado === 500 &&
      pc.despesas.lista[0].categoriaId === 'cat-cus-kit' && Math.abs(pc.despesas.lista[0].pct - 0.75) < 1e-9 && pc.foraSaidas.total === 5000, JSON.stringify(pc.despesas.lista));
    const pcx = F.porCategoria(cl, cats, '2026-03-01', '2026-03-31', 'caixa');
    ok('por categoria (caixa): só os pagos no período, pelo valor pago', pcx.receitas.total === 0 && pcx.despesas.total === 610 && pcx.regime === 'caixa');

    const cA = { id: 'cA', nome: 'Banco', saldoInicial: 1000, ativo: true }, cB = { id: 'cB', nome: 'Caixa', saldoInicial: 0, ativo: true };
    cl.forEach(function (l) { if (l.situacao === 'pago' && l.tipo !== 'transferencia') l.contaId = 'cA'; });
    const mv = F.movimento(cl, [cA, cB], cats, '2026-03-01', '2026-03-31');
    ok('movimento de caixa: realizado no período, transferências à parte e saldos por conta', mv.linhas.length === 1 && mv.saidas === 610 && mv.entradas === 0 && mv.transferencias === 1 &&
      mv.saldos[0].anterior === 1000 && mv.saldos[0].final === 1000 - 610 - 300 && mv.saldos[1].final === 300 && mv.linhas[0].categoria === 'Kit fotovoltaico (módulos, inversor, estrutura)', JSON.stringify(mv.saldos.map(function (x) { return [x.anterior, x.final]; })));

    const fl = F.filtrar(ab, 'receber', { filtro: 'periodo', de: '2026-01-01', ate: '2026-03-31', hoje: hojeT });
    ok('filtro por período de vencimento (e os outros filtros)', fl.length === 3 && fl[0].vencimento === '2026-01-15' && F.filtrar(ab, 'receber', { filtro: 'vencidos', hoje: hojeT }).length === 4 &&
      F.filtrar(ab, 'receber', { filtro: 'todos', q: 'carla' }).length === 2 && F.filtrar(ab, 'receber', { filtro: 'todos', hoje: hojeT }).length === 6 && F.FILTROS.some(function (x) { return x.id === 'periodo'; }));

    // estruturas, planilha e PDF dos relatórios (com uma base de teste no armazenamento)
    const RF = App.RelFin, S = App.Store;
    const chaves = ['col.lancamentos', 'col.contasFin', 'col.categoriasFin', 'col.propostas', 'config'];
    const guardado = {};
    chaves.forEach(function (k) { guardado[k] = localStorage.getItem('gsp.' + k); });
    try {
      const hj = U.todayISO();
      localStorage.setItem('gsp.col.contasFin', JSON.stringify([{ id: 'conta-caixa', nome: 'Caixa da empresa', tipo: 'caixa', saldoInicial: 500, ativo: true }]));
      localStorage.setItem('gsp.col.categoriasFin', JSON.stringify(cats));
      localStorage.setItem('gsp.col.propostas', JSON.stringify([]));
      localStorage.setItem('gsp.col.lancamentos', JSON.stringify([
        L('receber', { descricao: 'Venda Maria', valor: 1000, categoriaId: 'cat-rec-sistemas', contaId: 'conta-caixa', vencimento: F.somarDias(hj, -40), competencia: hj, pessoa: { nome: 'Maria' } }),
        L('receber', { descricao: 'Venda João', valor: 2000, categoriaId: 'cat-rec-sistemas', contaId: 'conta-caixa', vencimento: hj, competencia: hj, situacao: 'pago', pagoEm: hj, valorPago: 2000, pessoa: { nome: 'João' } }),
        L('pagar', { descricao: 'Aluguel', valor: 700, categoriaId: 'cat-adm-aluguel', contaId: 'conta-caixa', vencimento: hj, competencia: hj, situacao: 'pago', pagoEm: hj, valorPago: 700 })
      ]));
      const e1 = RF.estrutura('lancamentos', { tipo: 'receber', filtro: 'todos', agrupar: 'situacao' });
      const tab = e1.blocos.filter(Boolean).find(function (b) { return b.cols; });
      ok('relatório de contas a receber: grupos, subtotais e total', /CONTAS A RECEBER/.test(e1.titulo) && e1.deitado && tab.linhas.filter(function (l) { return l.grupo; }).length === 2 &&
        tab.linhas[tab.linhas.length - 1].total && tab.linhas[tab.linhas.length - 1].celulas[6].v === 3000, JSON.stringify(tab.linhas.map(function (l) { return l.grupo || (l.total ? 'T' : l.subtotal ? 'S' : 'L'); })));
      ok('relatório de inadimplência', RF.estrutura('atrasos', { tipo: 'receber' }).indicadores[0][1] === U.brl(1000));
      const tipos = ['resumo', 'fluxo', 'movimento', 'extrato', 'categorias', 'dre', 'obras', 'comissoes'];
      const falhas = tipos.filter(function (t) { try { const e = RF.estrutura(t, {}); return !(e.titulo && e.arquivo && Array.isArray(e.blocos)); } catch (x) { return t + ': ' + x.message; } });
      ok('relatórios: todos montam (resumo, fluxo, movimento, extrato, categorias, DRE, obras, comissões)', falhas.length === 0, JSON.stringify(falhas));
      const ex = RF.estrutura('extrato', { contaId: 'conta-caixa', de: F.somarDias(hj, -1) });
      ok('extrato: saldo anterior, entradas, saídas e saldo final', ex.indicadores[0][1] === U.brl(500) && ex.indicadores[1][1] === U.brl(2000) && ex.indicadores[2][1] === U.brl(700) && ex.indicadores[3][1] === U.brl(1800));
      const csv = RF.csv('lancamentos', { tipo: 'receber', filtro: 'todos', agrupar: '' });
      ok('planilha do relatório: ; e vírgula decimal, valores como número', /^﻿CONTAS A RECEBER/.test(csv.texto) && /;1000\r\n|;1000$/m.test(csv.texto) && /Vencimento;Descrição;Cliente;Categoria;Conta;Situação;Valor/.test(csv.texto) && /\.csv$/.test(csv.nome), csv.texto.slice(0, 300));
      let erroObra = '';
      try { RF.estrutura('obra', { id: 'nada' }); } catch (x) { erroObra = x.message; }
      ok('apuração de obra inexistente é recusada', /não encontrada/.test(erroObra));
      const m = RF.montar(RF.estrutura('dre', {}), { empresa: U.clone(D.empresa) }, { logo: { w: 100, h: 50, dataURL: 'data:image/png;base64,iVBORw0KGgo=', ext: 'png' }, imagens: {} });
      ok('DRE em página deitada (A4/carta na horizontal) com gráfico', m.papel.w > m.papel.h && m.k > 1.3 && Object.keys(m.imagens).length === 1 && /^data:image\/png/.test(m.imagens.graf1));
    } finally {
      chaves.forEach(function (k) { if (guardado[k] == null) localStorage.removeItem('gsp.' + k); else localStorage.setItem('gsp.' + k, guardado[k]); });
    }
  })();

  // ---------------------------------------------------------------- assinaturas (imagem, guardada, gov.br)
  (function () {
    const A = App.Assinatura;
    const enc = function (t) { return Array.from(new TextEncoder().encode(t)); };
    const cn = function (t) { const b = enc(t); return [0x06, 0x03, 0x55, 0x04, 0x03, 0x0C, b.length].concat(b); };
    const hex = function (arr) { return arr.map(function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); };
    const pdf = function (der, extra) {
      const s = '%PDF-1.7\n1 0 obj << /Type /Sig /ByteRange [0 100 300 50] /Contents <' + hex(der) + '0'.repeat(80) + '> ' + (extra || '') + ' >> endobj\n%%EOF';
      return new Uint8Array(Array.from(s).map(function (c) { return c.charCodeAt(0); }));
    };
    const gov = A.analisarPdf(pdf([0x30, 0x82].concat(cn('AC Final do Governo Federal do Brasil v1'), cn('JOSÉ DA SILVA:12345678900'), enc(' Governo Federal ')), "/M (D:20261031101500-03'00')"));
    ok('gov.br: PDF assinado conferido — emissor, signatário sem o CPF e data', gov.pdf && gov.assinado && gov.quantidade === 1 && gov.emissor === 'gov.br' &&
      JSON.stringify(gov.signatarios) === '["JOSÉ DA SILVA"]' && gov.autoridades.length === 1 && gov.data === '2026-10-31T10:15:00', JSON.stringify(gov));
    const icp = A.analisarPdf(pdf([0x30].concat(cn('AC SOLUTI Multipla v5'), cn('Autoridade Certificadora Raiz Brasileira v5'), cn('EMPRESA SOLAR LTDA:12345678000199'), enc('ICP-Brasil'))));
    ok('certificado ICP-Brasil: emissor e titular (sem CNPJ)', icp.assinado && icp.emissor === 'ICP-Brasil' && JSON.stringify(icp.signatarios) === '["EMPRESA SOLAR LTDA"]' && icp.data === '', JSON.stringify(icp));
    const semAss = A.analisarPdf(new Uint8Array(Array.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF').map(function (c) { return c.charCodeAt(0); })));
    ok('PDF sem assinatura digital e arquivo que não é PDF', semAss.pdf && !semAss.assinado && !A.analisarPdf(new Uint8Array([1, 2, 3])).pdf);
    igual('descrição da assinatura digital', A.descricaoDigital({ fotoId: 'x', emissor: 'gov.br', signatarios: ['JOSÉ DA SILVA'], assinadoEm: '2026-10-31T10:15:00' }), 'Assinado digitalmente pelo gov.br por JOSÉ DA SILVA em 31/10/2026');
    ok('como cada assinatura foi feita (tela, imagem, guardada; antigas = tela)', /^Assinado na tela em 31\/10\/2026 às/.test(A.descricao({ fotoId: 'a', em: '2026-10-31T09:05:00', tipo: 'tela' })) &&
      /^Imagem da assinatura incluída em/.test(A.descricao({ fotoId: 'a', em: '2026-10-31T09:05:00', tipo: 'imagem' })) &&
      /^Assinatura guardada aplicada em/.test(A.descricao({ fotoId: 'a', em: '2026-10-31T09:05:00', tipo: 'guardada' })) &&
      /^Assinado na tela em/.test(A.descricao({ fotoId: 'a', em: '2026-10-31T09:05:00' })) && A.descricao(A.vazia()) === '' && A.vazia().tipo === '');
  })();

  window.__testes = { resultados: resultados, testarDocx: testarDocx, cenario: { p: p, ctx: ctx, r: r, pH: pH, ctxH: ctxH, rH: rH } };
})();
