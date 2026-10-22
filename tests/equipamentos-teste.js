/*
 * Módulos, inversores, microinversores, híbridos e baterias usados nos testes (o antigo catálogo do app, removido na versão 7 da base:
 * esses equipamentos passaram a ser cadastrados pelo usuário a partir do datasheet). Os cenários de referência dos testes
 * continuam usando estes dados, com os mesmos ids.
 */
window.EQUIP_TESTE = (function () {
  'use strict';

  const REF = 'Dados de referência — conferir datasheet e preço com o distribuidor.';
  const REF_PARCIAL = 'Dados elétricos parciais — confirmar código, tensões e faixa MPPT no datasheet vigente antes de usar a verificação de strings.';

  const MON = {
    huawei: 'FusionSolar (Wi-Fi / Smart Dongle)', sungrow: 'iSolarCloud (Wi-Fi)', goodwe: 'SEMS Portal (Wi-Fi)',
    solis: 'SolisCloud (datalogger Wi-Fi/4G)', sofar: 'SOFAR Monitor / SolarMAN (Wi-Fi)', hoymiles: 'S-Miles Cloud (gateway DTU)',
    deye: 'Deye Cloud / SolarMAN (Wi-Fi)', growatt: 'ShinePhone / Growatt OSS (Wi-Fi)'
  };

  /* el = [Voc, Vmp, Isc]; dc = [Vmáx CC, MPPT mín., MPPT máx.] */
  function modulo(id, fabricante, modelo, potencia, eficiencia, tecnologia, detalhe, area, gProduto, gPerformance, el, obs) {
    return {
      id: id, tipo: 'modulo', ativo: true, fabricante: fabricante, modelo: modelo, potencia: potencia, eficiencia: eficiencia,
      tecnologia: tecnologia, detalhe: detalhe, area: area, garantiaProduto: gProduto, garantiaPerformance: gPerformance,
      voc: el ? el[0] : null, vmp: el ? el[1] : null, isc: el ? el[2] : null, preco: 0, obs: obs || REF
    };
  }

  function inversor(id, fabricante, modelo, kw, fases, tensao, mppts, dc, garantia, monitoramento, obs) {
    return {
      id: id, tipo: 'inversor', ativo: true, fabricante: fabricante, modelo: modelo, potencia: kw, fases: fases, tensao: tensao, mppts: mppts,
      vmaxCC: dc ? dc[0] : null, mpptMin: dc ? dc[1] : null, mpptMax: dc ? dc[2] : null,
      monitoramento: monitoramento, garantia: garantia, preco: 0, obs: obs || REF
    };
  }

  function microinversor(id, fabricante, modelo, kw, modulos, faixaWp, fases, tensao, dc, garantia, monitoramento, obs) {
    const e = inversor(id, fabricante, modelo, kw, fases, tensao, modulos, dc, garantia, monitoramento, obs);
    e.tipo = 'micro';
    e.modulosPorUnidade = modulos;
    e.potModuloMin = faixaWp ? faixaWp[0] : null;
    e.potModuloMax = faixaWp ? faixaWp[1] : null;
    return e;
  }

  /** tensaoBateria em V para baixa tensão (48 V); null + tipoBateria 'HV' para baterias de alta tensão. */
  function hibrido(id, fabricante, modelo, kw, fases, tensao, mppts, tensaoBateria, tipoBateria, dc, garantia, monitoramento, obs) {
    const e = inversor(id, fabricante, modelo, kw, fases, tensao, mppts, dc, garantia, monitoramento, obs);
    e.tipo = 'hibrido';
    e.potenciaBackup = kw;
    e.tensaoBateria = tensaoBateria;
    e.tipoBateria = tipoBateria;
    return e;
  }

  function bateria(id, fabricante, modelo, kwh, tensao, ah, dod, ciclos, garantia, tipoBateria, obs) {
    return {
      id: id, tipo: 'bateria', ativo: true, fabricante: fabricante, modelo: modelo, quimica: 'LiFePO4', tensao: tensao, capacidadeAh: ah,
      energia: kwh, dod: dod, ciclos: ciclos, garantia: garantia, tipoBateria: tipoBateria, preco: 0, obs: obs || REF
    };
  }

  const lista = [
    {
      id: 'mod-dmegc-625', tipo: 'modulo', ativo: true, fabricante: 'DMEGC', modelo: 'DM625G12RT-B66HBW-P',
      potencia: 625, eficiencia: 23.1, tecnologia: 'Bifacial', detalhe: 'Frame Composto', area: 2.8,
      garantiaProduto: 12, garantiaPerformance: 25, voc: null, vmp: null, isc: null, preco: 0, obs: REF
    },

    /* ---------- Módulos (2382 × 1134 mm = 2,70 m², exceto quando indicado) */
    modulo('mod-trina-600', 'Trina Solar', 'Vertex N TSM-NEG19RC.20 600W', 600, 22.2, 'TOPCon Bifacial', 'Vidro duplo', 2.7, 12, 30, [47.69, 39.43, 16.02]),
    modulo('mod-trina-610', 'Trina Solar', 'Vertex N TSM-NEG19RC.20 610W', 610, 22.6, 'TOPCon Bifacial', 'Vidro duplo', 2.7, 12, 30, [48.09, 39.79, 16.14]),
    modulo('mod-trina-620', 'Trina Solar', 'Vertex N TSM-NEG19RC.20 620W', 620, 23.0, 'TOPCon Bifacial', 'Vidro duplo', 2.7, 12, 30, [48.50, 40.24, 16.26]),
    modulo('mod-astronergy-610', 'Astronergy', 'ASTRO N7 CHSM66RN(DG)/F-BH 610W', 610, 22.6, 'TOPCon Bifacial', 'Vidro duplo', 2.7, 15, 30, null, REF_PARCIAL),
    modulo('mod-astronergy-620', 'Astronergy', 'ASTRO N7 CHSM66RN(DG)/F-BH 620W', 620, 23.0, 'TOPCon Bifacial', 'Vidro duplo', 2.7, 15, 30, [49.04, 41.56, 16.11]),
    modulo('mod-tcl-610', 'TCL Solar', 'HSM-ND66-GR610', 610, 22.6, 'TOPCon Bifacial', 'Vidro duplo', 2.7, 15, 30, null, REF_PARCIAL),
    modulo('mod-tcl-620', 'TCL Solar', 'HSM-ND66-GR620', 620, 23.0, 'TOPCon Bifacial', 'Vidro duplo', 2.7, 15, 30, [48.94, null, null], REF_PARCIAL),
    modulo('mod-osda-610', 'OSDA', 'ODA610-33V-MHDRz', 610, 22.58, 'TOPCon Bifacial', 'Vidro duplo', 2.7, 15, 30, [48.68, 41.38, 15.66]),
    modulo('mod-osda-620', 'OSDA', 'ODA620-33V-MHDRz', 620, 22.96, 'TOPCon Bifacial', 'Vidro duplo', 2.7, 15, 30, [48.78, 41.46, 15.89]),
    modulo('mod-osda-625', 'OSDA', 'ODA625-33V-MHDRz', 625, 23.14, 'TOPCon Bifacial', 'Vidro duplo', 2.7, 15, 30, [48.83, 41.51, 16.00]),
    modulo('mod-honor-665', 'Honor Solar', 'HYM12/132H 665W', 665, null, 'Monocristalino', '2384 × 1303 mm', 3.1, null, null, null, REF_PARCIAL),
    modulo('mod-honor-700', 'Honor Solar', 'HY-M12/132G 700W', 700, null, 'N-type Bifacial', 'Vidro duplo — 2384 × 1303 mm', 3.1, null, null, null, REF_PARCIAL),
    modulo('mod-era-610', 'ERA Solar', 'ERA-RC-66HC 610M', 610, 22.6, 'N-type Monofacial', 'Moldura prata', 2.7, 15, 30, [48.10, 39.77, 16.05]),
    modulo('mod-era-620', 'ERA Solar', 'ERA-RC-66HC 620M', 620, 23.0, 'N-type Monofacial', 'Moldura prata', 2.7, 15, 30, [48.50, 40.15, 16.15]),

    /* ---------- Inversores on-grid (string) */
    {
      id: 'inv-sofar-4', tipo: 'inversor', ativo: true, fabricante: 'Sofar', modelo: '4KTL2-G3',
      potencia: 4, fases: 'Monofásico', tensao: '220V', mppts: 1, vmaxCC: null, mpptMin: null, mpptMax: null,
      monitoramento: 'Sofar SolarMAN Smart (Wi-Fi — módulo opcional)', garantia: 10, preco: 0, obs: REF
    },
    // Huawei — SUN2000-L1 (monofásico, também opera como híbrido com LUNA2000) e trifásicos M1/M3 380 V
    inversor('inv-huawei-3-l1', 'Huawei', 'SUN2000-3KTL-L1', 3, 'Monofásico', '220V', 2, [600, 90, 560], 10, MON.huawei),
    inversor('inv-huawei-4-l1', 'Huawei', 'SUN2000-4KTL-L1', 4, 'Monofásico', '220V', 2, [600, 90, 560], 10, MON.huawei),
    inversor('inv-huawei-5-l1', 'Huawei', 'SUN2000-5KTL-L1', 5, 'Monofásico', '220V', 2, [600, 90, 560], 10, MON.huawei),
    inversor('inv-huawei-6-l1', 'Huawei', 'SUN2000-6KTL-L1', 6, 'Monofásico', '220V', 2, [600, 90, 560], 10, MON.huawei),
    inversor('inv-huawei-8-m1', 'Huawei', 'SUN2000-8KTL-M1', 8, 'Trifásico', '380V', 2, [1100, null, null], 10, MON.huawei, REF_PARCIAL),
    inversor('inv-huawei-10-m1', 'Huawei', 'SUN2000-10KTL-M1', 10, 'Trifásico', '380V', 2, [1100, null, null], 10, MON.huawei, REF_PARCIAL),
    inversor('inv-huawei-50-m3', 'Huawei', 'SUN2000-50KTL-M3', 50, 'Trifásico', '380V', 4, [1100, 200, 1000], 10, MON.huawei, REF_PARCIAL),
    // Sungrow — RS monofásico, CX-SA/LV trifásico 220 V e CX 380 V
    inversor('inv-sungrow-3-rs', 'Sungrow', 'SG3.0RS', 3, 'Monofásico', '220V', null, [600, null, null], 10, MON.sungrow, REF_PARCIAL),
    inversor('inv-sungrow-5-rs', 'Sungrow', 'SG5.0RS', 5, 'Monofásico', '220V', null, [600, null, null], 10, MON.sungrow, REF_PARCIAL),
    inversor('inv-sungrow-6-rs', 'Sungrow', 'SG6.0RS', 6, 'Monofásico', '220V', null, [600, null, null], 10, MON.sungrow, REF_PARCIAL),
    inversor('inv-sungrow-25-cxsa', 'Sungrow', 'SG25CX-SA', 25, 'Trifásico', '220V', null, null, 10, MON.sungrow, REF_PARCIAL),
    inversor('inv-sungrow-33-cx', 'Sungrow', 'SG33CX', 33, 'Trifásico', '380V', null, [1100, null, null], 10, MON.sungrow, REF_PARCIAL),
    inversor('inv-sungrow-50-cx', 'Sungrow', 'SG50CX', 50, 'Trifásico', '380V', null, [1100, null, null], 10, MON.sungrow, REF_PARCIAL),
    inversor('inv-sungrow-75-cxlv', 'Sungrow', 'SG75CX-LV', 75, 'Trifásico', '220V', null, null, 10, MON.sungrow, REF_PARCIAL),
    // Sofar — KTLM-G3 monofásico e KTLX-G3 trifásico 220/380 V (ficha Sofar Brasil)
    inversor('inv-sofar-3-ktlm', 'Sofar', 'SOFAR 3KTLM-G3', 3, 'Monofásico', '220V', 2, null, 10, MON.sofar, REF_PARCIAL),
    inversor('inv-sofar-5-ktlm', 'Sofar', 'SOFAR 5KTLM-G3', 5, 'Monofásico', '220V', 2, null, 10, MON.sofar, REF_PARCIAL),
    inversor('inv-sofar-6-ktlm', 'Sofar', 'SOFAR 6KTLM-G3', 6, 'Monofásico', '220V', 2, null, 10, MON.sofar, REF_PARCIAL),
    inversor('inv-sofar-15-ktlx', 'Sofar', 'SOFAR 15KTLX-G3', 15, 'Trifásico', '220/380V', 2, [1100, 140, 1000], 10, MON.sofar),
    inversor('inv-sofar-20-ktlx', 'Sofar', 'SOFAR 20KTLX-G3', 20, 'Trifásico', '220/380V', 2, [1100, 140, 1000], 10, MON.sofar),
    inversor('inv-sofar-24-ktlx', 'Sofar', 'SOFAR 24KTLX-G3', 24, 'Trifásico', '220/380V', 2, [1100, 140, 1000], 10, MON.sofar),
    // GoodWe — DNS G3 monofásico (ficha LATAM) e SDT G3 trifásico
    inversor('inv-goodwe-3-dns', 'GoodWe', 'GW3000-DNS-30', 3, 'Monofásico', '220V', 2, [600, 40, 560], 10, MON.goodwe),
    inversor('inv-goodwe-36-dns', 'GoodWe', 'GW3600-DNS-30', 3.6, 'Monofásico', '220V', 2, [600, 40, 560], 10, MON.goodwe),
    inversor('inv-goodwe-42-dns', 'GoodWe', 'GW4200-DNS-30', 4.2, 'Monofásico', '220V', 2, [600, 40, 560], 10, MON.goodwe),
    inversor('inv-goodwe-5-dns', 'GoodWe', 'GW5000-DNS-30', 5, 'Monofásico', '220V', 2, [600, 40, 560], 10, MON.goodwe),
    inversor('inv-goodwe-6-dns', 'GoodWe', 'GW6000-DNS-30', 6, 'Monofásico', '220V', 2, [600, 40, 560], 10, MON.goodwe),
    inversor('inv-goodwe-15-sdt', 'GoodWe', 'GW15K-SDT-30', 15, 'Trifásico', '220/380V', 2, [1100, 140, 1000], 10, MON.goodwe, REF_PARCIAL),
    // Solis — S6-GR1P(2.5-6)K-S monofásico 220 V (ficha Solis Brasil)
    inversor('inv-solis-25-s6', 'Solis', 'S6-GR1P2.5K-S', 2.5, 'Monofásico', '220V', 2, [550, 50, 550], 10, MON.solis),
    inversor('inv-solis-3-s6', 'Solis', 'S6-GR1P3K-S', 3, 'Monofásico', '220V', 2, [550, 90, 550], 10, MON.solis),
    inversor('inv-solis-36-s6', 'Solis', 'S6-GR1P3.6K-S', 3.6, 'Monofásico', '220V', 2, [550, 90, 550], 10, MON.solis),
    inversor('inv-solis-4-s6', 'Solis', 'S6-GR1P4K-S', 4, 'Monofásico', '220V', 2, [550, 90, 550], 10, MON.solis),
    inversor('inv-solis-46-s6', 'Solis', 'S6-GR1P4.6K-S', 4.6, 'Monofásico', '220V', 2, [550, 90, 550], 10, MON.solis),
    inversor('inv-solis-5-s6', 'Solis', 'S6-GR1P5K-S', 5, 'Monofásico', '220V', 2, [550, 90, 550], 10, MON.solis),
    inversor('inv-solis-6-s6', 'Solis', 'S6-GR1P6K-S', 6, 'Monofásico', '220V', 2, [550, 90, 550], 10, MON.solis),

    /* ---------- Microinversores (faixa de potência do módulo em Wp) */
    microinversor('mic-hoymiles-1600', 'Hoymiles', 'HMS-1600-4T', 1.6, 4, [320, 540], 'Monofásico', '220V', [65, 16, 60], 12, MON.hoymiles),
    microinversor('mic-hoymiles-1800', 'Hoymiles', 'HMS-1800-4T', 1.8, 4, [360, 600], 'Monofásico', '220V', [65, 16, 60], 12, MON.hoymiles),
    microinversor('mic-hoymiles-2000', 'Hoymiles', 'HMS-2000-4T', 2.0, 4, [400, 670], 'Monofásico', '220V', [65, 16, 60], 12, MON.hoymiles),
    microinversor('mic-hoymiles-2250-pro', 'Hoymiles', 'MIS-2250-W Pro', 2.25, 4, null, 'Monofásico', '220V', null, 12, MON.hoymiles, REF_PARCIAL),
    microinversor('mic-hoymiles-2500-pro', 'Hoymiles', 'MIS-2500-W Pro', 2.5, 4, null, 'Monofásico', '220V', null, 12, MON.hoymiles, REF_PARCIAL),
    microinversor('mic-hoymiles-2750-pro', 'Hoymiles', 'MIS-2750-W Pro', 2.75, 4, null, 'Monofásico', '220V', null, 12, MON.hoymiles, REF_PARCIAL),
    microinversor('mic-goodwe-1600', 'GoodWe', 'GW1600-MIS', 1.6, 4, [320, 535], 'Monofásico', '220V', [65, 16, 60], 12, 'SEMS Portal (Wi-Fi/Bluetooth integrado)'),
    microinversor('mic-goodwe-1800', 'GoodWe', 'GW1800-MIS', 1.8, 4, [360, 600], 'Monofásico', '220V', [65, 16, 60], 12, 'SEMS Portal (Wi-Fi/Bluetooth integrado)'),
    microinversor('mic-goodwe-2000', 'GoodWe', 'GW2000-MIS', 2.0, 4, [400, 670], 'Monofásico', '220V', [65, 16, 60], 12, 'SEMS Portal (Wi-Fi/Bluetooth integrado)'),
    microinversor('mic-sungrow-2000', 'Sungrow', 'S2000S-SA', 2.0, 4, null, 'Monofásico', '220V', [60, null, null], null, MON.sungrow, REF_PARCIAL),
    microinversor('mic-sungrow-2500', 'Sungrow', 'S2500S-L', 2.5, 4, [560, 720], 'Monofásico', '220V', null, null, MON.sungrow, REF_PARCIAL),

    /* ---------- Inversores híbridos */
    {
      id: 'hib-deye-5', tipo: 'hibrido', ativo: true, fabricante: 'Deye', modelo: 'SUN-5K-SG04LP1',
      potencia: 5, potenciaBackup: 5, fases: 'Monofásico', tensao: '220V', mppts: 2, tensaoBateria: 48,
      vmaxCC: null, mpptMin: null, mpptMax: null, monitoramento: 'Deye Cloud (Wi-Fi)', garantia: 5, preco: 0, obs: REF
    },
    hibrido('hib-deye-6-lp1', 'Deye', 'SUN-6K-SG05LP1-EU-SM2', 6, 'Monofásico', '220V', 2, 48, 'LV', [500, 150, 425], 5, MON.deye),
    hibrido('hib-deye-8-lp1', 'Deye', 'SUN-8K-SG05LP1-EU', 8, 'Monofásico', '220V', 2, 48, 'LV', null, 5, MON.deye, REF_PARCIAL),
    hibrido('hib-deye-5-lp3', 'Deye', 'SUN-5K-SG04LP3-EU-AM2-LV', 5, 'Trifásico', '127/220V', 2, 48, 'LV', [600, 200, 450], 5, MON.deye),
    hibrido('hib-deye-8-lp3', 'Deye', 'SUN-8K-SG04LP3-EU-AM2-LV', 8, 'Trifásico', '127/220V', 2, 48, 'LV', [600, 200, 450], 5, MON.deye),
    hibrido('hib-deye-10-lp3', 'Deye', 'SUN-10K-SG04LP3-EU-AM2-LV', 10, 'Trifásico', '127/220V', 2, 48, 'LV', [600, 200, 450], 5, MON.deye),
    hibrido('hib-deye-12-lp3', 'Deye', 'SUN-12K-SG04LP3-EU-AM2-LV', 12, 'Trifásico', '127/220V', 2, 48, 'LV', [600, 200, 450], 5, MON.deye),
    hibrido('hib-huawei-5-l1', 'Huawei', 'SUN2000-5KTL-L1 (híbrido c/ LUNA2000)', 5, 'Monofásico', '220V', 2, null, 'HV', [600, 90, 560], 10, MON.huawei,
      'Backup exige o Backup Box da Huawei. ' + REF),
    hibrido('hib-huawei-6-l1', 'Huawei', 'SUN2000-6KTL-L1 (híbrido c/ LUNA2000)', 6, 'Monofásico', '220V', 2, null, 'HV', [600, 90, 560], 10, MON.huawei,
      'Backup exige o Backup Box da Huawei. ' + REF),
    hibrido('hib-sungrow-5-sh', 'Sungrow', 'SH5.0RS', 5, 'Monofásico', '220V', 2, null, 'HV', [600, null, null], 10, MON.sungrow, REF_PARCIAL),
    hibrido('hib-sungrow-6-sh', 'Sungrow', 'SH6.0RS', 6, 'Monofásico', '220V', 2, null, 'HV', [600, null, null], 10, MON.sungrow, REF_PARCIAL),
    hibrido('hib-sungrow-10-shrt', 'Sungrow', 'SH10RT', 10, 'Trifásico', '380V', 2, null, 'HV', null, 10, MON.sungrow, REF_PARCIAL),
    hibrido('hib-goodwe-6-es', 'GoodWe', 'GW6000-ES-20', 6, 'Monofásico', '220V', 2, 48, 'LV', null, 10, MON.goodwe, REF_PARCIAL),
    hibrido('hib-goodwe-10-et', 'GoodWe', 'GW10K-ET', 10, 'Trifásico', '380V', 2, null, 'HV', null, 10, MON.goodwe, REF_PARCIAL),
    hibrido('hib-solis-5-eh2p', 'Solis', 'S6-EH2P5K02-SV-YD-L', 5, 'Bifásico', '127/220V', 2, 48, 'LV', null, 10, MON.solis,
      'Split-phase: alimenta cargas 127 V e 220 V no backup. ' + REF_PARCIAL),
    hibrido('hib-solis-8-eh2p', 'Solis', 'S6-EH2P8K02-SV-YD-L', 8, 'Bifásico', '127/220V', 2, 48, 'LV', null, 10, MON.solis,
      'Split-phase: alimenta cargas 127 V e 220 V no backup. ' + REF_PARCIAL),
    hibrido('hib-growatt-6-sph', 'Growatt', 'SPH 6000TL BL-UP', 6, 'Monofásico', '220V', 2, 48, 'LV', null, 10, MON.growatt, REF_PARCIAL),
    hibrido('hib-growatt-10-mod', 'Growatt', 'MOD 10KTL3-XH', 10, 'Trifásico', '380V', 2, null, 'HV', [1100, null, null], 10, MON.growatt, REF_PARCIAL),

    /* ---------- Baterias (LV = 48 V; HV = alta tensão, conjunto/torre completo) */
    {
      id: 'bat-deye-51', tipo: 'bateria', ativo: true, fabricante: 'Deye', modelo: 'SE-G5.1 Pro-B',
      quimica: 'LiFePO4', tensao: 51.2, capacidadeAh: 100, energia: 5.12, dod: 90, ciclos: 6000, garantia: 10, preco: 0, obs: REF
    },
    {
      id: 'bat-pylon-us5000', tipo: 'bateria', ativo: true, fabricante: 'Pylontech', modelo: 'US5000',
      quimica: 'LiFePO4', tensao: 48, capacidadeAh: 100, energia: 4.8, dod: 95, ciclos: 6000, garantia: 10, preco: 0, obs: REF
    },
    bateria('bat-pylon-us3000c', 'Pylontech', 'US3000C', 3.55, 48, 74, 95, 6000, 10, 'LV'),
    bateria('bat-byd-lvs4', 'BYD', 'Battery-Box Premium LVS 4.0', 4.0, 51.2, 78, 100, null, 10, 'LV', REF_PARCIAL),
    bateria('bat-byd-hvs51', 'BYD', 'Battery-Box Premium HVS 5.1', 5.12, 204.8, 25, 100, null, 10, 'HV', REF_PARCIAL),
    bateria('bat-byd-hvm83', 'BYD', 'Battery-Box Premium HVM 8.3', 8.28, 153.6, 54, 100, null, 10, 'HV', REF_PARCIAL),
    bateria('bat-huawei-luna5', 'Huawei', 'LUNA2000-5-S0', 5, null, null, 100, null, 10, 'HV', REF_PARCIAL),
    bateria('bat-huawei-luna10', 'Huawei', 'LUNA2000-10-S0', 10, null, null, 100, null, 10, 'HV', REF_PARCIAL),
    bateria('bat-huawei-luna15', 'Huawei', 'LUNA2000-15-S0', 15, null, null, 100, null, 10, 'HV', REF_PARCIAL),
    bateria('bat-sungrow-sbr096', 'Sungrow', 'SBR096', 9.6, 192, null, 100, null, 10, 'HV', REF_PARCIAL),
    bateria('bat-sungrow-sbr128', 'Sungrow', 'SBR128', 12.8, 256, null, 100, null, 10, 'HV', REF_PARCIAL),
    bateria('bat-dyness-a48100', 'Dyness', 'A48100', 4.8, 48, 100, 90, 6000, 10, 'LV', REF_PARCIAL)
  ];

  // capacidade máxima do sistema e potência contínua das baterias (mesmos dados das migrações da base)
  const D = window.App.DEFAULTS;
  lista.forEach(function (e) {
    if (D.CAP_MAX_SISTEMA[e.id]) e.capMaxSistema = D.CAP_MAX_SISTEMA[e.id];
    if (D.POT_BATERIA[e.id]) e.potencia = D.POT_BATERIA[e.id];
  });
  return lista;
})();
