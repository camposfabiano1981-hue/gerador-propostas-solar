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

  // ---------------------------------------------------------------- docx
  async function testarDocx() {
    const out = { ref: null, hib: null };
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
    return out;
  }

  window.__testes = { resultados: resultados, testarDocx: testarDocx, cenario: { p: p, ctx: ctx, r: r, pH: pH, ctxH: ctxH, rH: rH } };
})();
