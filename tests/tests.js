/*
 * Testes do motor de cálculo e do gerador .docx.
 * O cenário "referência" reproduz as premissas da proposta GE-20260929-012 (TUSD Fio B R$ 0,08, COSIP sem reajuste)
 * e confere os valores publicados naquele documento.
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
      equipamentos: U.clone(D.equipamentos),
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
  igual('FDI', U.fmt(r.fdi, 3), '0,711');
  ok('FDI fora da faixa', !r.fdiOk);
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
  perto('2026 Fio B/mês', a[0].fioBMes, 17.08);
  perto('2026 conta c/ sistema', a[0].contaCom, 126.89);
  perto('2026 economia/mês', a[0].economiaMes, 568.64);
  perto('2026 Fio B anual', a[0].fioB, 204.98);
  perto('2027 conta s/ sistema', a[1].contaSem, 727.26);
  perto('2027 Fio B/mês', a[1].fioBMes, 21.25);
  perto('2027 conta c/ sistema', a[1].contaCom, 133.50);
  perto('2027 economia/mês', a[1].economiaMes, 593.76);
  igual('2027 geração', U.fmt(a[1].geracao, 0), '8.498');
  igual('2027 tarifa', U.fmt(a[1].tarifa, 4), '1,0250');
  perto('2029 conta c/ sistema', a[3].contaCom, 145.55);
  perto('2029 economia/mês', a[3].economiaMes, 650.00);
  perto('2035 conta s/ sistema', a[9].contaSem, 1045.36);
  perto('2035 disponib. mín.', a[9].contaMin, 75.72);
  perto('2035 Fio B/mês', a[9].fioBMes, 27.21);
  perto('2035 economia/mês', a[9].economiaMes, 881.43);
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
  perto('híbrido: capacidade necessária', rH.hibrido.capNecessaria, (rH.hibrido.energiaBackup / 1000) / (0.9 * 0.9), 1e-9);
  ok('híbrido: baterias suficientes', rH.hibrido.capInstalada >= rH.hibrido.capNecessaria, rH.hibrido.nBaterias + ' un');
  ok('híbrido: ciclagem reduz Fio B', rH.fin.anos[0].fioB < C.calcular(Object.assign(U.clone(pH), { usoBateria: 'backup' }), ctxH).fin.anos[0].fioB);
  ok('híbrido: itens incluem bateria', rH.itens.some(function (i) { return i.categoria === 'bateria'; }));
  ok('híbrido: cenários avaliados (solar, backup, horários)', rH.cenariosAvaliados.map(function (c) { return c.id; }).join(',') === 'solar,backup,ponta',
    rH.cenariosAvaliados.map(function (c) { return c.id; }).join(','));
  ok('híbrido: redução de picos não se aplica ao grupo B', rH.cenarios.find(function (c) { return c.id === 'picos'; }).aplicavel === false);
  const bkp = rH.cenarios.find(function (c) { return c.id === 'backup'; });
  ok('híbrido: backup dimensionado para as cargas críticas', bkp.capInstalada >= rH.hibrido.capNecessaria, bkp.n + ' un / ' + bkp.capInstalada + ' kWh');
  perto('híbrido: backup sem efeito na conta = cenário solar', bkp.fin.anos[0].economiaMes, rH.cenarios[0].fin.anos[0].economiaMes, 1e-9);

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
  perto('micro: FDI mais próximo do alvo (2 kW × 4 ÷ 8,68 kWp)', rM.fdi, 8 / 8.68, 1e-9);
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
  ok('catálogo: fabricantes pedidos presentes', ['Huawei', 'Sungrow', 'Sofar', 'GoodWe', 'Solis', 'Hoymiles', 'Trina Solar', 'Astronergy', 'TCL Solar', 'OSDA', 'Honor Solar', 'ERA Solar']
    .every(function (f) { return D.equipamentos.some(function (e) { return e.fabricante === f; }); }));
  ok('catálogo: microinversores Sungrow, GoodWe e Hoymiles', ['Sungrow', 'GoodWe', 'Hoymiles'].every(function (f) { return D.equipamentos.some(function (e) { return e.tipo === 'micro' && e.fabricante === f; }); }));

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

  window.__testes = { resultados: resultados, testarDocx: testarDocx, cenario: { p: p, ctx: ctx, r: r, pH: pH, ctxH: ctxH, rH: rH } };
})();
