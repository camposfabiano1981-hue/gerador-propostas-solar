/*
 * Campos técnicos dos equipamentos na estrutura dos datasheets (módulo fotovoltaico, inversor on-grid, microinversor,
 * inversor híbrido e bateria). Fonte única para os formulários de cadastro, o esquema da leitura do datasheet por IA e a conversão do
 * resultado em cadastro. Campos com `dim: true` (★) entram no dimensionamento técnico.
 */
window.App = window.App || {};

(function (App) {
  'use strict';

  const FASES = ['Monofásico', 'Bifásico', 'Trifásico'];
  const CLASSE_BAT = [{ v: 'LV', t: 'Baixa tensão (48 V)' }, { v: 'HV', t: 'Alta tensão (HV)' }];
  const QUIMICAS = ['LiFePO4', 'Lítio NMC', 'Chumbo-ácido', 'Chumbo-carbono', 'Sódio-íon', 'Outra'];

  /** Campo: tipo 'num' | 'int' | 'texto' | 'opcao'; `ia` orienta a leitura do datasheet (inglês, como nos datasheets). */
  function f(k, label, un, tipo, extra) {
    return Object.assign({ k: k, label: label, un: un || '', tipo: tipo || 'num' }, extra || {});
  }

  const IDENT_INV = { titulo: 'Identificação', campos: [
    f('fabricante', 'Fabricante', '', 'texto', { obrig: true, ia: 'manufacturer / brand' }),
    f('modelo', 'Modelo', '', 'texto', { obrig: true, ia: 'exact model name of this column/variant' }),
    f('fases', 'Fases', '', 'opcao', { opcoes: FASES, dim: true, ia: 'AC phases: single-phase = Monofásico, split-phase = Bifásico, three-phase = Trifásico' }),
    f('tensao', 'Tensão CA nominal', '', 'texto', { ia: 'nominal AC grid voltage, e.g. "220V" or "220/380V"' })
  ] };

  const ENTRADA_CC = { titulo: 'Entrada CC (fotovoltaica)', campos: [
    f('pFVMax', 'Potência FV máxima de entrada', 'kWp', 'num', { dim: true, ajuda: 'Do modelo exato (varia entre versões).', ia: 'max PV input power / max DC input power, in kW (sum of all MPPTs)' }),
    f('vmaxCC', 'Tensão CC máxima', 'V', 'num', { dim: true, ia: 'max DC input voltage' }),
    f('vPartida', 'Tensão de partida', 'V', 'num', { dim: true, ia: 'start-up voltage' }),
    f('mpptMin', 'Faixa MPPT — mínima', 'V', 'num', { dim: true, ia: 'MPPT voltage range, lower value' }),
    f('mpptMax', 'Faixa MPPT — máxima', 'V', 'num', { dim: true, ia: 'MPPT voltage range, upper value' }),
    f('mppts', 'Nº de MPPTs', '', 'int', { dim: true, ia: 'number of MPP trackers' }),
    f('stringsPorMppt', 'Strings por MPPT', '', 'int', { dim: true, ajuda: 'Entradas de string em cada MPPT.', ia: 'number of strings (inputs) per MPPT; if given as "2/1", use the smallest' }),
    f('imaxMppt', 'Corrente máx. de entrada por MPPT', 'A', 'num', { dim: true, ia: 'max input current per MPPT; if different per MPPT, use the smallest' }),
    f('iscMaxMppt', 'Corrente máx. de curto-circuito por MPPT', 'A', 'num', { dim: true, ajuda: 'Comparada ao Isc do módulo × strings no MPPT.', ia: 'max short-circuit current per MPPT; if different per MPPT, use the smallest' })
  ] };

  const SAIDA_CA = { titulo: 'Saída CA (rede)', campos: [
    f('potencia', 'Potência nominal CA', 'kW', 'num', { obrig: true, dim: true, ia: 'rated AC output power in kW' }),
    f('potenciaMaxCA', 'Potência aparente máxima', 'kVA', 'num', { ia: 'max AC apparent power in kVA' }),
    f('iSaidaMax', 'Corrente máx. de saída CA', 'A', 'num', { ia: 'max AC output current' })
  ] };

  const EFICIENCIA = { titulo: 'Eficiência', campos: [
    f('efMax', 'Eficiência máxima', '%', 'num', { ia: 'max efficiency in %' }),
    f('efEuro', 'Eficiência europeia / ponderada', '%', 'num', { ia: 'European (or CEC weighted) efficiency in %' })
  ] };

  const GERAL_INV = function (comHibrido) {
    const c = [
      f('consumoProprioW', 'Consumo próprio', 'W', 'num', { dim: !!comHibrido, ajuda: comHibrido ? 'Ligado 24 h. Em branco = premissa.' : '', ia: comHibrido ? 'self-consumption in standby / no-load / idle (W); not the night consumption if a no-load value exists' : 'self-consumption at night (W)' })
    ];
    if (comHibrido) c.push(f('paraleloMax', 'Inversores em paralelo (máx.)', '', 'int', { dim: true, ia: 'max number of units in parallel; 1 if parallel operation is not supported' }));
    return { titulo: 'Geral', campos: c.concat([
      f('ip', 'Grau de proteção', '', 'texto', { ia: 'ingress protection, e.g. "IP65"' }),
      f('peso', 'Peso', 'kg', 'num', { ia: 'weight in kg' }),
      f('garantia', 'Garantia', 'anos', 'num', { ia: 'standard warranty in years' }),
      f('monitoramento', 'Monitoramento', '', 'texto', { ia: 'monitoring / communication (Wi-Fi, app name, RS485...)' }),
      f('certificacoes', 'Certificações', '', 'texto', { ia: 'certifications / standards (INMETRO, IEC 62109, ...)' })
    ]) };
  };

  const CAMPOS = {
    modulo: [
      { titulo: 'Identificação', campos: [
        f('fabricante', 'Fabricante', '', 'texto', { obrig: true, ia: 'manufacturer / brand' }),
        f('modelo', 'Modelo', '', 'texto', { obrig: true, ia: 'exact model name of this power class (e.g. "TSM-620NEG19RC.20")' }),
        f('tecnologia', 'Tecnologia', '', 'texto', { ia: 'cell technology in Portuguese, short, e.g. "TOPCon bifacial", "Monocristalino PERC", "HJT bifacial"' }),
        f('detalhe', 'Detalhe construtivo', '', 'texto', { ia: 'construction in Portuguese, short, e.g. "Vidro duplo, moldura de alumínio"' }),
        f('bifacial', 'Bifacial', '', 'opcao', { opcoes: ['Sim', 'Não'], ia: 'Sim if the module is bifacial, Não otherwise' }),
        f('bifacialidade', 'Bifacialidade', '%', 'num', { ia: 'bifaciality factor in %' })
      ] },
      { titulo: 'Dados elétricos (STC)', campos: [
        f('potencia', 'Potência máxima (Pmáx)', 'Wp', 'num', { obrig: true, dim: true, ia: 'maximum power at STC in W' }),
        f('voc', 'Tensão de circuito aberto (Voc)', 'V', 'num', { dim: true, ia: 'open-circuit voltage at STC' }),
        f('vmp', 'Tensão de máxima potência (Vmp)', 'V', 'num', { dim: true, ia: 'maximum power voltage at STC' }),
        f('isc', 'Corrente de curto-circuito (Isc)', 'A', 'num', { dim: true, ia: 'short-circuit current at STC (front side, not the bifacial gain table)' }),
        f('imp', 'Corrente de máxima potência (Imp)', 'A', 'num', { dim: true, ajuda: 'Em branco = Pmáx ÷ Vmp.', ia: 'maximum power current at STC' }),
        f('eficiencia', 'Eficiência do módulo', '%', 'num', { ia: 'module efficiency at STC in %' }),
        f('tolerancia', 'Tolerância de potência', '', 'texto', { ia: 'power tolerance as printed, e.g. "0~+5 W"' })
      ] },
      { titulo: 'Coeficientes de temperatura', campos: [
        f('coefVoc', 'Coeficiente de Voc', '%/°C', 'num', { dim: true, neg: true, ajuda: 'Negativo, ex.: -0,25. Corrige o Voc no frio e o Vmp no calor.', ia: 'temperature coefficient of Voc in %/°C (negative number)' }),
        f('coefPmax', 'Coeficiente de Pmáx', '%/°C', 'num', { neg: true, ia: 'temperature coefficient of Pmax in %/°C (negative number)' }),
        f('coefIsc', 'Coeficiente de Isc', '%/°C', 'num', { neg: true, ia: 'temperature coefficient of Isc in %/°C' }),
        f('noct', 'Temperatura nominal de operação (NOCT/NMOT)', '°C', 'num', { ia: 'NOCT or NMOT in °C' })
      ] },
      { titulo: 'Limites', campos: [
        f('vMaxSistema', 'Tensão máxima do sistema', 'V', 'num', { dim: true, ajuda: 'Limita os módulos em série junto com o inversor.', ia: 'maximum system voltage (IEC), e.g. 1500' }),
        f('fusivelMax', 'Corrente máxima do fusível em série', 'A', 'num', { dim: true, ajuda: 'Indica quando são necessários fusíveis de string.', ia: 'maximum series fuse rating in A' })
      ] },
      { titulo: 'Dados mecânicos', campos: [
        f('comprimento', 'Comprimento', 'mm', 'num', { ia: 'module length in mm' }),
        f('largura', 'Largura', 'mm', 'num', { ia: 'module width in mm' }),
        f('espessura', 'Espessura', 'mm', 'num', { ia: 'module thickness / frame height in mm' }),
        f('area', 'Área ocupada por módulo', 'm²', 'num', { dim: true, ajuda: 'Área do telhado. Em branco = comprimento × largura.', ia: 'module area in m² only if printed; otherwise null' }),
        f('peso', 'Peso', 'kg', 'num', { ia: 'weight in kg' }),
        f('celulas', 'Nº de células', '', 'int', { ia: 'number of cells (half cells count as printed, e.g. 132)' }),
        f('conector', 'Conector', '', 'texto', { ia: 'connector type, e.g. "MC4 compatível"' })
      ] },
      { titulo: 'Garantia e degradação', campos: [
        f('garantiaProduto', 'Garantia do produto', 'anos', 'num', { ia: 'product / workmanship warranty in years' }),
        f('garantiaPerformance', 'Garantia de performance', 'anos', 'num', { ia: 'linear power output warranty in years' }),
        f('degradacao1Ano', 'Degradação no 1º ano', '%', 'num', { ia: 'first-year power degradation in %' }),
        f('degradacaoAnual', 'Degradação anual (após o 1º ano)', '%/ano', 'num', { dim: true, ajuda: 'Usada na projeção de geração. Em branco = premissa.', ia: 'annual power degradation after the first year in %' }),
        f('certificacoes', 'Certificações', '', 'texto', { ia: 'certifications (INMETRO, IEC 61215, IEC 61730, ...)' })
      ] }
    ],
    inversor: [IDENT_INV, ENTRADA_CC, SAIDA_CA, EFICIENCIA, GERAL_INV(false)],
    micro: [
      IDENT_INV,
      { titulo: 'Entrada CC (por módulo)', campos: [
        f('modulosPorUnidade', 'Módulos por microinversor (entradas)', '', 'int', { obrig: true, dim: true, ia: 'number of PV modules (inputs) per microinverter unit' }),
        f('potModuloMin', 'Potência de módulo recomendada — mín.', 'Wp', 'num', { dim: true, ia: 'recommended PV module power range, lower value (W)' }),
        f('potModuloMax', 'Potência de módulo recomendada — máx.', 'Wp', 'num', { dim: true, ia: 'recommended PV module power range, upper value (W)' }),
        f('vmaxCC', 'Tensão CC máxima', 'V', 'num', { dim: true, ia: 'max DC input voltage' }),
        f('vPartida', 'Tensão de partida', 'V', 'num', { ia: 'start-up voltage' }),
        f('mpptMin', 'Faixa MPPT — mínima', 'V', 'num', { ia: 'MPPT voltage range, lower value' }),
        f('mpptMax', 'Faixa MPPT — máxima', 'V', 'num', { ia: 'MPPT voltage range, upper value' }),
        f('imaxMppt', 'Corrente máx. de entrada por módulo', 'A', 'num', { dim: true, ia: 'max input current per input / module' }),
        f('iscMaxMppt', 'Corrente máx. de curto-circuito por módulo', 'A', 'num', { dim: true, ia: 'max short-circuit current per input / module' })
      ] },
      { titulo: 'Saída CA', campos: [
        f('potencia', 'Potência nominal CA', 'kW', 'num', { obrig: true, dim: true, ia: 'rated AC output power of one unit, in kW' }),
        f('potenciaMaxCA', 'Potência aparente máxima', 'kVA', 'num', { ia: 'max AC apparent power in kVA' }),
        f('iSaidaMax', 'Corrente máx. de saída CA', 'A', 'num', { ia: 'max AC output current' }),
        f('maxPorRamal', 'Unidades por ramal CA (máx.)', '', 'int', { dim: true, ajuda: 'Define o nº de circuitos CA dos microinversores.', ia: 'max units per AC branch (at the grid voltage used in Brazil, 220 V when given)' })
      ] },
      EFICIENCIA, GERAL_INV(false)
    ],
    hibrido: [
      IDENT_INV, ENTRADA_CC,
      { titulo: 'Bateria', campos: [
        f('tipoBateria', 'Classe de bateria', '', 'opcao', { opcoes: ['LV', 'HV'], rotulos: CLASSE_BAT, dim: true, ia: 'LV for low-voltage (48 V) batteries, HV for high-voltage batteries' }),
        f('tensaoBateria', 'Tensão nominal da bateria', 'V', 'num', { dim: true, ajuda: 'Ex.: 48. Define as baterias em série; em branco na alta tensão.', ia: 'nominal battery voltage' }),
        f('vBatMin', 'Faixa de tensão da bateria — mínima', 'V', 'num', { dim: true, ia: 'battery voltage range, lower value' }),
        f('vBatMax', 'Faixa de tensão da bateria — máxima', 'V', 'num', { dim: true, ia: 'battery voltage range, upper value' }),
        f('iCargaMax', 'Corrente máx. de carga', 'A', 'num', { dim: true, ia: 'max battery charge current' }),
        f('iDescargaMax', 'Corrente máx. de descarga', 'A', 'num', { dim: true, ia: 'max battery discharge current' }),
        f('pBateriaMax', 'Potência máx. de carga/descarga', 'kW', 'num', { dim: true, ajuda: 'Em branco = corrente máx. × tensão do banco.', ia: 'max battery charge/discharge power in kW' }),
        f('capBateriaMax', 'Capacidade máx. de bateria', 'kWh', 'num', { dim: true, ia: 'max supported battery capacity in kWh' }),
        f('efBateria', 'Eficiência máx. bateria ↔ CA', '%', 'num', { dim: true, ajuda: 'Com a eficiência da bateria forma a eficiência de ciclo.', ia: 'max battery charge/discharge (battery to AC) efficiency in %' })
      ] },
      SAIDA_CA,
      { titulo: 'Backup (EPS / off-grid)', campos: [
        f('potenciaBackup', 'Potência nominal de backup', 'kW', 'num', { dim: true, ajuda: 'Em branco = potência nominal CA.', ia: 'rated backup / EPS / off-grid output power in kW' }),
        f('surtoKW', 'Potência de pico (surto) em backup', 'kW', 'num', { dim: true, ajuda: 'Comparada ao pico de partida dos motores das cargas críticas.', ia: 'peak / surge backup output power in kW (kVA if only that is given)' }),
        f('surtoS', 'Duração do pico', 's', 'num', { ia: 'duration of the peak power in seconds' }),
        f('tempoComutacao', 'Tempo de comutação para backup', 'ms', 'num', { ia: 'switch-over / transfer time to backup in ms' })
      ] },
      EFICIENCIA, GERAL_INV(true)
    ],
    bateria: [
      { titulo: 'Identificação', campos: [
        f('fabricante', 'Fabricante', '', 'texto', { obrig: true, ia: 'manufacturer / brand' }),
        f('modelo', 'Modelo', '', 'texto', { obrig: true, ia: 'exact model name of this column/variant (module or tower as sold)' }),
        f('quimica', 'Química', '', 'opcao', { opcoes: QUIMICAS, ia: 'cell chemistry: LFP = LiFePO4' }),
        f('tipoBateria', 'Classe de tensão', '', 'opcao', { opcoes: ['LV', 'HV'], rotulos: CLASSE_BAT, dim: true, ia: 'LV for low-voltage (≈48 V) batteries, HV for high-voltage batteries' })
      ] },
      { titulo: 'Energia', campos: [
        f('energia', 'Energia nominal', 'kWh', 'num', { obrig: true, dim: true, ia: 'nominal energy in kWh' }),
        f('energiaUtil', 'Energia útil', 'kWh', 'num', { dim: true, ajuda: 'Sem DoD informado, DoD = energia útil ÷ nominal.', ia: 'usable energy in kWh' }),
        f('dod', 'Profundidade de descarga (DoD)', '%', 'num', { dim: true, ia: 'recommended depth of discharge in %' }),
        f('capacidadeAh', 'Capacidade', 'Ah', 'num', { ia: 'nominal capacity in Ah' })
      ] },
      { titulo: 'Tensão', campos: [
        f('tensao', 'Tensão nominal', 'V', 'num', { dim: true, ia: 'nominal voltage' }),
        f('vMin', 'Faixa de tensão — mínima', 'V', 'num', { ia: 'operating voltage range, lower value' }),
        f('vMax', 'Faixa de tensão — máxima', 'V', 'num', { ia: 'operating voltage range, upper value' })
      ] },
      { titulo: 'Corrente e potência', campos: [
        f('iCargaMax', 'Corrente contínua de carga (recomendada/máx.)', 'A', 'num', { ia: 'continuous charge current (recommended if given, else max continuous)' }),
        f('iDescargaMax', 'Corrente contínua de descarga (recomendada/máx.)', 'A', 'num', { dim: true, ia: 'continuous discharge current (recommended if given, else max continuous)' }),
        f('potencia', 'Potência contínua de descarga', 'kW', 'num', { dim: true, ajuda: 'Em branco = corrente de descarga × tensão (sem ela, 0,5C).', ia: 'continuous (nominal/max continuous) discharge power in kW' }),
        f('picoKW', 'Potência de pico de descarga', 'kW', 'num', { ia: 'peak discharge power in kW' }),
        f('picoS', 'Duração do pico', 's', 'num', { ia: 'duration of the peak discharge in seconds' })
      ] },
      { titulo: 'Desempenho e garantia', campos: [
        f('eficiencia', 'Eficiência de ciclo (round-trip)', '%', 'num', { dim: true, ajuda: 'Em branco = típica de 95% (× eficiência do inversor).', ia: 'round-trip efficiency in %' }),
        f('ciclos', 'Vida útil em ciclos', 'ciclos', 'int', { dim: true, ia: 'cycle life (number of cycles)' }),
        f('garantia', 'Garantia', 'anos', 'num', { ia: 'warranty in years' }),
        f('garantiaMWh', 'Energia garantida', 'MWh', 'num', { ia: 'warranted energy throughput in MWh' })
      ] },
      { titulo: 'Expansão', campos: [
        f('capMaxSistema', 'Capacidade máx. do sistema', 'kWh', 'num', { dim: true, ajuda: 'Por inversor, conforme o fabricante. Em branco = sem limite.', ia: 'max system capacity per inverter in kWh (modules per tower × towers in parallel)' }),
        f('paraleloMax', 'Unidades/torres em paralelo (máx.)', '', 'int', { ia: 'max number of units or towers in parallel' })
      ] },
      { titulo: 'Geral', campos: [
        f('comunicacao', 'Comunicação', '', 'texto', { ia: 'communication interfaces (CAN, RS485...)' }),
        f('compatibilidade', 'Inversores compatíveis', '', 'texto', { ia: 'compatible inverter brands/models listed' }),
        f('certificacoes', 'Certificações', '', 'texto', { ia: 'certifications (IEC 62619, UN38.3, ...)' }),
        f('ip', 'Grau de proteção', '', 'texto', { ia: 'ingress protection' }),
        f('peso', 'Peso', 'kg', 'num', { ia: 'weight in kg' })
      ] }
    ]
  };

  const TIPOS = ['modulo', 'inversor', 'micro', 'hibrido', 'bateria'];

  function todos(tipo) {
    return (CAMPOS[tipo] || []).reduce(function (a, s) { return a.concat(s.campos); }, []);
  }

  /** Definições de campos para UI.grade (seções do datasheet; ★ = entra no dimensionamento). */
  function camposForm(tipo) {
    const defs = [];
    (CAMPOS[tipo] || []).forEach(function (s) {
      defs.push({ secao: s.titulo });
      s.campos.forEach(function (c) {
        const d = { k: c.k, label: (c.dim ? '★ ' : '') + c.label, required: !!c.obrig };
        if (c.ajuda) d.help = c.ajuda;
        if (c.tipo === 'num') { d.type = 'number'; if (c.un) d.suffix = c.un; }
        else if (c.tipo === 'int') { d.type = 'int'; if (c.un) d.suffix = c.un; }
        else if (c.tipo === 'opcao') { d.type = 'select'; d.options = [{ v: '', t: '—' }].concat(c.rotulos || c.opcoes.map(function (o) { return { v: o, t: o }; })); }
        defs.push(d);
      });
    });
    return defs;
  }

  /** Esquema JSON (respostas estruturadas) da leitura do datasheet: um objeto por modelo/coluna. */
  /*
   * Todos os campos são texto obrigatório ("" = ausente no datasheet): as respostas estruturadas limitam a 16 os campos
   * anuláveis (anyOf/null) e a 24 os opcionais, e uma ficha tem perto de 40 campos. Os números chegam como texto e
   * são convertidos em converter().
   */
  function esquema(tipo) {
    const props = {}, req = [];
    todos(tipo).forEach(function (c) {
      const desc = c.label + (c.un ? ' (' + c.un + ')' : '') + (c.ia ? ' — ' + c.ia : '') +
        (c.tipo === 'num' || c.tipo === 'int' ? '. Number only, as text with a decimal point, no unit and no thousands separator' : '') +
        '. Empty string if not in the datasheet.';
      props[c.k] = c.tipo === 'opcao' ? { type: 'string', enum: c.opcoes.concat(['']), description: desc } : { type: 'string', description: desc };
      req.push(c.k);
    });
    return {
      type: 'object',
      properties: {
        tipoEquipamento: { type: 'string', enum: TIPOS.concat(['outro']), description: 'Equipment type described by the datasheet' },
        modelos: {
          type: 'array',
          description: 'One entry per model/variant (each column of the technical data table)',
          items: { type: 'object', properties: props, required: req, additionalProperties: false }
        },
        avisos: { type: 'string', description: 'Short notes in Brazilian Portuguese about values that were unclear, estimated or converted (empty if none)' }
      },
      required: ['tipoEquipamento', 'modelos', 'avisos'],
      additionalProperties: false
    };
  }

  /** Número de um valor lido ("48.5", "-0,25", "1,500.5", 620); NaN se não houver. */
  function numero(v) {
    if (typeof v === 'number') return v;
    let s = String(v == null ? '' : v).trim().replace(/[\u2212\u2013]/g, '-');
    if (!s) return NaN;
    s = s.indexOf('.') >= 0 ? s.replace(/,/g, '') : s.replace(',', '.');
    const m = s.match(/-?\d+(\.\d+)?/);
    return m ? Number(m[0]) : NaN;
  }

  /** Converte um modelo lido do datasheet em campos do cadastro (somente valores válidos). */
  function converter(tipo, m) {
    const out = { tipo: tipo, ativo: true, preco: 0 };
    todos(tipo).forEach(function (c) {
      const v = m ? m[c.k] : null;
      if (v == null || v === '') return;
      if (c.tipo === 'texto') { const s = String(v).trim(); if (s) out[c.k] = s; }
      else if (c.tipo === 'opcao') { if (c.opcoes.indexOf(v) >= 0) out[c.k] = v; }
      else { const n = numero(v); if (isFinite(n) && (n >= 0 || c.neg)) out[c.k] = c.tipo === 'int' ? Math.round(n) : n; }
    });
    // microinversor: cada entrada tem o próprio MPPT (regra "por MPPT" dos materiais)
    if (tipo === 'micro' && out.modulosPorUnidade && !out.mppts) out.mppts = out.modulosPorUnidade;
    if (tipo === 'bateria' && !out.quimica) out.quimica = 'LiFePO4';
    // módulo: área pelas dimensões e coeficiente de Voc sempre negativo
    if (tipo === 'modulo' && !out.area && out.comprimento && out.largura) out.area = Math.round(out.comprimento * out.largura / 1000) / 1000;
    if (tipo === 'modulo' && out.coefVoc > 0) out.coefVoc = -out.coefVoc;
    return out;
  }

  /** Campos essenciais (★) que ficaram vazios — para a revisão do cadastro. */
  function faltando(tipo, eq) {
    return todos(tipo).filter(function (c) { return c.dim && (eq[c.k] == null || eq[c.k] === ''); }).map(function (c) { return c.label; });
  }

  App.Datasheet = { CAMPOS: CAMPOS, TIPOS: TIPOS, todos: todos, camposForm: camposForm, esquema: esquema, converter: converter, faltando: faltando };
})(window.App);
