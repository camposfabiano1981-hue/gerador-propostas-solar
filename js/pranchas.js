/*
 * Pranchas fotovoltaicas (projeto elétrico em A1) nos dois estilos do projetista, sobre os modelos em branco tirados das
 * próprias pranchas dele no AutoCAD (assets/pranchas): estilo A (tabelas de strings e do inversor, unifilar e croqui) e
 * estilo B (plantas, fachadas, diagramas multifilar e unifilar, detalhe da placa).
 *
 * De onde vem cada valor:
 *  - CRM: cliente, UC, ART, módulos e inversores (cadastro com datasheet), arranjo (strings), ligação, telhado, empresa e RT;
 *  - cálculo: potência e tensão das strings, correntes, quedas de tensão, totais, textos ("7x620W", descritivo…);
 *  - projetista: disjuntores, DPS, cabos, distâncias, fiação, eletrodutos, haste… (o último projeto vira o padrão do próximo);
 *  - compartilhado com a Homologação: disjuntor geral, disjuntor e DPS CA, bitolas, ligação e coordenadas UTM.
 * As conferências (disjuntor × corrente e cabo, Voc no frio × inversor, DPS CC, quedas) são avisos: não bloqueiam o PDF.
 */
window.App = window.App || {};

(function (App) {
  'use strict';

  const U = App.U;

  const ESTILOS = {
    A: { nome: 'Estilo A', desc: 'tabelas de strings e do inversor, diagrama unifilar e croqui de localização' },
    B: { nome: 'Estilo B', desc: 'plantas, fachadas, diagramas multifilar e unifilar e detalhe da placa' }
  };
  const OPCOES_ESTILO = [{ v: 'A', t: 'Estilo A' }, { v: 'B', t: 'Estilo B' }, { v: 'AB', t: 'Os dois (A e B no mesmo PDF)' }];
  const LIGACOES = { mono: 'monofásico', bi: 'bifásico', tri: 'trifásico' };
  const POLOS = { mono: '1P', bi: '2P', tri: '3P' };
  const DISJUNTORES = [6, 10, 16, 20, 25, 32, 40, 50, 63, 70, 80, 100, 125, 150, 175, 200, 225, 250];
  // capacidade de condução (A), cobre/PVC 70 °C, método B1 (eletroduto aparente) — NBR 5410, tab. 36: [2, 3] condutores carregados
  const IZ = { 1.5: [17.5, 15.5], 2.5: [24, 21], 4: [32, 28], 6: [41, 36], 10: [57, 50], 16: [76, 68], 25: [101, 89], 35: [125, 110], 50: [151, 134], 70: [192, 171], 95: [232, 207], 120: [269, 239] };
  // cabo solar (ABNT NBR 16612 / EN 50618), um cabo ao ar livre a 60 °C
  const IZ_SOLAR = { 1.5: 30, 2.5: 41, 4: 55, 6: 70, 10: 98, 16: 132, 25: 176, 35: 218 };
  const RHO = 0.0206; // resistividade do cobre a 70 °C (Ω·mm²/m) — referência da queda unitária
  // posição da assinatura do responsável técnico no carimbo (onde ficava a dele, acima do nome)
  const ASSINATURA = { A: [1864, 150, 2100, 184], B: [1868, 150, 2104, 184] };
  // desenho fixo do estilo B (o estilo A desenha as strings com a quantidade da obra)
  const DESENHO = { A: { strings: 2, porString: 7, inversores: 1, bitCC: 6 }, B: { modulos: 8, inversores: 1 } };

  // padrões iniciais = os valores das pranchas do projetista
  const PADROES = {
    estilo: 'A',
    cc: { bit: '6', tipo: 'EPR SOLAR 1.8 KV', un: '0,6' },
    ca: { bit: '6', mat: 'PVC', iso: '450/750V - 70°C', un: '0,49' },
    entrada: { bit: '16', mat: 'PVC', iso: '450/750V - 70°C' },
    saida: { bit: '16', mat: 'PVC', iso: '450/750V - 70°C' },
    ramal: { cond: '2', bit: '25', neutro: '25', tipo: 'XLPE- MULTIPLEX', iso: '0,6/1KV - 90°C' },
    terraBit: '6',
    disjCaKa: '3',
    dpsCa: { classe: 'II', uc: '275', in: '10', imax: '20', up: '1,2' },
    dpsCcUcpv: '',
    sbCc: '4E/2S',
    fia: { qgbt: '3#10(10)10', ramal: '2#10(10)10' },
    elet: { placas: 'GALVANIZADO 1"', inversor: 'GALVANIZADO 3/4"', ramal: 'PVC 32 mm' },
    haste: '5/8 x 2,40 m', cxPassagem: 'Cx passagem 25 X 25', cxInspecao: '30 X 30 X 40 cm',
    inclinacao: '15', efic: '100', fp: '1', limiteCC: '3', limiteCA: '4', maxStr: '10',
    condCA: 'FFT', terraMod: '6'
  };
  const CHAVES_PADRAO = ['estilo', 'cc.bit', 'cc.tipo', 'cc.un', 'ca.bit', 'ca.mat', 'ca.iso', 'ca.un', 'entrada.bit', 'entrada.mat', 'entrada.iso', 'saida.bit', 'saida.mat', 'saida.iso',
    'ramal.cond', 'ramal.bit', 'ramal.neutro', 'ramal.tipo', 'ramal.iso', 'terraBit', 'disjCaKa', 'dpsCa.classe', 'dpsCa.uc', 'dpsCa.in', 'dpsCa.imax', 'dpsCa.up', 'dpsCcUcpv',
    'sbCc', 'fia.qgbt', 'fia.ramal', 'elet.placas', 'elet.inversor', 'elet.ramal', 'haste', 'cxPassagem', 'cxInspecao', 'inclinacao', 'efic', 'fp', 'limiteCC', 'limiteCA', 'maxStr', 'condCA', 'terraMod'];

  // ------------------------------------------------------------ carregamento sob demanda
  const cache = {};
  function asset(nome, tipo) {
    if (!cache[nome]) {
      cache[nome] = fetch(nome + '?v=' + encodeURIComponent(App.VERSAO_APP || '1')).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status + ' em ' + nome);
        return tipo === 'json' ? r.json() : r.arrayBuffer();
      }).catch(function (e) { delete cache[nome]; throw e; });
    }
    return cache[nome];
  }
  const mapa = function () { return asset('assets/pranchas/mapa-pranchas.json', 'json'); };
  const modelo = function (estilo) { return asset('assets/pranchas/prancha-' + String(estilo).toLowerCase() + '.pdf', 'bin'); };
  const fonteTxt = function () { return asset('assets/pranchas/fonte-txt.json', 'json'); };
  const fonteRomans = function () { return asset('assets/pranchas/fonte-romans.json', 'json'); };
  /** Arial do carimbo e dos textos: Arimo (mesma métrica), o mesmo recorte Latin-1 do memorial Energisa. */
  const fonteArial = function () { return asset('assets/energisa/fontes/Arimo-Regular.ttf', 'bin'); };

  // ------------------------------------------------------------ utilidades
  function num(v) { const n = U.num(v); return isFinite(n) ? n : 0; }
  function tem(v) { return v !== '' && v != null && isFinite(U.num(v)); }
  function str(v) { return v == null ? '' : String(v).trim(); }
  /** Número com ponto decimal e sem zeros à direita (como nas tabelas do estilo A): 4.34, 286.9, 6. */
  function pt(v, dec) { return isFinite(v) ? String(Number(Number(v).toFixed(dec == null ? 2 : dec))) : ''; }
  /** Número com casas fixas e o separador pedido: fx(4.96, 2, ',') = "4,96". */
  function fx(v, dec, sep) { return isFinite(v) ? Number(v).toFixed(dec).replace('.', sep || '.') : ''; }
  /** Valor digitado ("0,6", "24,66") no formato das tabelas do estilo A ("0.6", "24.66"). */
  function dig(v) { return tem(v) ? pt(U.num(v), 3) : str(v); }
  function pad2(n) { return n > 0 && n < 10 ? '0' + n : String(n || ''); }
  function maiusc(v) { return str(v).toLocaleUpperCase('pt-BR'); }
  function digitos(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }
  function documento(v) {
    const d = digitos(v);
    if (d.length === 11) return d.slice(0, 3) + '.' + d.slice(3, 6) + '.' + d.slice(6, 9) + '-' + d.slice(9);
    if (d.length === 14) return d.slice(0, 2) + '.' + d.slice(2, 5) + '.' + d.slice(5, 8) + '/' + d.slice(8, 12) + '-' + d.slice(12);
    return str(v);
  }
  function cep(v) { const d = digitos(v); return d.length === 8 ? d.slice(0, 5) + '-' + d.slice(5) : str(v); }
  function dataBR(iso) { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + '/' + m[2] + '/' + m[1] : str(iso); }
  function hojeISO() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function obter(o, k) { return k.split('.').reduce(function (a, p) { return a == null ? a : a[p]; }, o); }
  function definir(o, k, v) { const ps = k.split('.'); let a = o; ps.slice(0, -1).forEach(function (p) { a[p] = a[p] || {}; a = a[p]; }); a[ps[ps.length - 1]] = v; }
  function proxDisjuntor(i) { return DISJUNTORES.find(function (d) { return d >= i - 1e-9; }) || null; }
  function izCabo(bit, fases) { const t = IZ[num(bit)]; return t ? t[fases === 'tri' ? 1 : 0] : null; }
  /** Queda unitária de referência (V/A·km) para cobre a 70 °C: 2ρ/S (CC, mono e bifásico) ou √3·ρ/S (trifásico). */
  function quedaRef(bit, tri) { const s = num(bit); return s > 0 ? (tri ? Math.sqrt(3) : 2) * RHO / s * 1000 : null; }
  /** Rua do endereço (sem o número): "Rua Cedro, 14" → "Rua Cedro". */
  function rua(end) { return str(end).split(',')[0].replace(/\s+n?[ºo°]?\s*\d+\s*$/i, '').trim(); }

  // ------------------------------------------------------------ dados do CRM
  function contexto(inst, ctx) {
    const S = App.Store;
    const prop = inst.propostaId && S ? S.get('propostas', inst.propostaId) : null;
    const cli = (inst.clienteId && S && S.get('clientes', inst.clienteId)) || (prop && prop.clienteId && S && S.get('clientes', prop.clienteId)) || {};
    let r = null;
    try { r = prop && App.Calc ? App.Calc.calcular(U.clone(prop), ctx) : null; } catch (e) { r = null; }
    const eqs = (ctx && ctx.equipamentos) || (S ? S.list('equipamentos') : []);
    const porId = function (id) { return id ? eqs.find(function (e) { return e.id === id; }) || null : null; };
    return { prop: prop, cli: cli, r: r, porId: porId };
  }

  function dadosModulo(eq, placa, qtd) {
    const C = App.Calc || {};
    const imp = eq && C.impModulo ? C.impModulo(eq) : (eq && eq.imp);
    const g = function (v) { return v != null && v !== '' && isFinite(U.num(v)) ? String(v) : ''; };
    return {
      fab: (eq && eq.fabricante) || (placa && placa.marca) || '', modelo: (eq && eq.modelo) || (placa && placa.modelo) || '',
      w: g((eq && eq.potencia) || (placa && placa.potencia)), vmp: g(eq && eq.vmp), imp: imp ? String(U.round(imp, 2)) : '', voc: g(eq && eq.voc), isc: g(eq && eq.isc),
      celulas: g(eq && eq.celulas), coefVoc: g(eq && eq.coefVoc), qtd: qtd > 0 ? String(qtd) : ''
    };
  }
  function dadosInversor(eq, placa, qtd) {
    const g = function (v) { return v != null && v !== '' && isFinite(U.num(v)) ? String(v) : ''; };
    const fases = /tri/i.test((eq && eq.fases) || '') ? 'tri' : 'mono';
    // "127/220V": no trifásico vale a tensão de linha (a maior); nos outros, a primeira
    const nums = (eq && eq.tensao) ? String(eq.tensao).match(/\d+/g) : null;
    const tensao = nums ? [fases === 'tri' ? String(Math.max.apply(null, nums.map(Number))) : nums[0]] : null;
    return {
      fab: (eq && eq.fabricante) || (placa && placa.marca) || '', modelo: (eq && eq.modelo) || (placa && placa.modelo) || '',
      kw: g((eq && eq.potencia) || (placa && placa.potencia)), qtd: qtd > 0 ? String(qtd) : '', fases: fases,
      tensao: tensao ? tensao[0] : '220', vmaxCC: g(eq && eq.vmaxCC), iSaida: g(eq && eq.iSaidaMax), mppts: g(eq && eq.mppts), imaxMppt: g(eq && eq.imaxMppt)
    };
  }

  /** Equipamentos e arranjo da obra: placas da instalação (com o cadastro) ou a proposta aprovada. */
  function equipamentos(inst, ctx) {
    const x = contexto(inst, ctx);
    const pl = inst.placas || {};
    const pm = pl.modulo || {}, pi = pl.inversor || {};
    const r = x.r;
    const eqMod = x.porId(pm.equipamentoId) || (r && r.modulo) || null;
    const eqInv = x.porId(pi.equipamentoId) || (r && r.inversor) || null;
    const qMod = num(pm.quantidade) || (r ? num(r.nModulos) : 0);
    let qInv = num(pi.quantidade) || (r ? num(r.nInversores) : 0) || (eqInv || pi.modelo ? 1 : 0);
    const extras = (Array.isArray(pl.inversoresExtras) ? pl.inversoresExtras : []).filter(function (e) { return e && (e.modelo || e.equipamentoId); });
    const outros = extras.filter(function (e) { return !((e.equipamentoId && eqInv && e.equipamentoId === eqInv.id) || (!e.equipamentoId && e.modelo && e.modelo === (eqInv ? eqInv.modelo : pi.modelo))); });
    // cada unidade é um inversor na prancha (INV1, INV2…): o principal × quantidade e os extras × quantidade
    const unidades = [];
    for (let i = 0; i < Math.max(qInv, eqInv || pi.modelo ? 1 : 0); i++) unidades.push(dadosInversor(eqInv, pi, 1));
    extras.forEach(function (e) { const eq = x.porId(e.equipamentoId); for (let i = 0; i < (num(e.quantidade) || 1); i++) unidades.push(dadosInversor(eq, e, 1)); });
    qInv += extras.reduce(function (s, e) { return s + (num(e.quantidade) || 1); }, 0);
    const st = r && r.strings;
    let nStr = st ? num(st.nStrings) : 0;
    if (!nStr && qMod > 0) nStr = 1;
    return {
      x: x, mod: dadosModulo(eqMod, pm, qMod), inv: dadosInversor(eqInv, pi, qInv), modelosDiferentes: outros.length > 0, unidades: unidades,
      nStrings: nStr > 0 ? String(nStr) : '', ligacao: (x.prop && x.prop.ligacao) || '', telhado: (x.prop && x.prop.telhado) || ''
    };
  }

  function linhaEndereco(cli, inst) {
    const partes = [cli.endereco, cli.numero, cli.bairro].map(str).filter(Boolean).join(', ');
    const cid = [str(cli.cidade || inst.cidade), str(cli.uf || inst.uf)].filter(Boolean).join(' - ');
    let s = partes;
    if (str(cli.cep)) s += (s ? ', ' : '') + 'Cep: ' + cep(cli.cep);
    if (cid) s += (s ? ' - ' : '') + cid;
    return s ? s + '.' : '';
  }

  /** Copia os campos compartilhados da Homologação para a prancha (quando preenchidos lá). */
  function lerCompartilhados(pr, hm) {
    if (!pr || !hm) return pr;
    const pega = function (v) { return str(v); };
    if (pega(hm.utm && hm.utm.fuso)) pr.utm.fuso = hm.utm.fuso;
    if (pega(hm.utm && hm.utm.x)) pr.utm.x = hm.utm.x;
    if (pega(hm.utm && hm.utm.y)) pr.utm.y = hm.utm.y;
    if (pega(hm.padrao && hm.padrao.disjGeral)) pr.disjGeral = String(hm.padrao.disjGeral);
    if (pega(hm.protecoes && hm.protecoes.disjCa)) pr.disjCa = String(hm.protecoes.disjCa);
    if (pega(hm.protecoes && hm.protecoes.dpsCa)) pr.dpsCa.in = String(hm.protecoes.dpsCa);
    if (pega(hm.bitolas && hm.bitolas.fase)) pr.entrada.bit = String(hm.bitolas.fase);
    if (pega(hm.bitolas && hm.bitolas.terra)) pr.terraBit = String(hm.bitolas.terra);
    const lig = { 'MONOFÁSICO': 'mono', 'BIFÁSICO': 'bi', 'TRIFÁSICO': 'tri' }[hm.conexao];
    if (lig) pr.ligacao = lig;
    return pr;
  }
  /** Leva os campos compartilhados da prancha para a Homologação (o que estiver preenchido na prancha). */
  function gravarCompartilhados(pr, hm) {
    if (!pr || !hm) return hm;
    hm.utm = hm.utm || {}; hm.padrao = hm.padrao || {}; hm.protecoes = hm.protecoes || {}; hm.bitolas = hm.bitolas || {};
    if (str(pr.utm && pr.utm.fuso)) hm.utm.fuso = pr.utm.fuso;
    if (str(pr.utm && pr.utm.x)) hm.utm.x = pr.utm.x;
    if (str(pr.utm && pr.utm.y)) hm.utm.y = pr.utm.y;
    if (str(pr.disjGeral)) hm.padrao.disjGeral = pr.disjGeral;
    if (str(pr.disjCa)) hm.protecoes.disjCa = pr.disjCa;
    if (str(pr.dpsCa && pr.dpsCa.in)) hm.protecoes.dpsCa = pr.dpsCa.in;
    if (str(pr.entrada && pr.entrada.bit)) hm.bitolas.fase = pr.entrada.bit;
    if (str(pr.terraBit)) hm.bitolas.terra = pr.terraBit;
    if (LIGACOES[pr.ligacao]) hm.conexao = { mono: 'MONOFÁSICO', bi: 'BIFÁSICO', tri: 'TRIFÁSICO' }[pr.ligacao];
    return hm;
  }

  /**
   * Prancha inicial da instalação: dados do CRM + padrões do projetista (último projeto) + os campos compartilhados da Homologação.
   */
  function sugerir(inst, ctx, padroes) {
    const pad = U.clone(PADROES);
    const p = padroes || {};
    CHAVES_PADRAO.forEach(function (k) { const v = obter(p, k); if (v != null && v !== '') definir(pad, k, v); });
    const pr = {
      versao: 1, estilo: pad.estilo || 'A', data: hojeISO(),
      cliente: { nome: '', documento: '', endereco: '' }, uc: '', art: '',
      ruas: { uc: '', r2: '', r3: '', r4: '' }, utm: { fuso: '21K', x: '', y: '' },
      emp: { endereco: '', contato: '' }, rt: { nome: '', registro: '', tel: '' },
      mod: {}, inv: {}, nStrings: '', porString: '', porMppt: '', ligacao: 'bi',
      cc: { bit: pad.cc.bit, tipo: pad.cc.tipo, un: pad.cc.un, dist1: '', dist2: '' },
      ca: { bit: pad.ca.bit, mat: pad.ca.mat, iso: pad.ca.iso, un: pad.ca.un, dist: '' },
      entrada: U.clone(pad.entrada), saida: U.clone(pad.saida), ramal: U.clone(pad.ramal), terraBit: pad.terraBit,
      disjGeral: '', disjCa: '', disjCaKa: pad.disjCaKa, dpsCa: U.clone(pad.dpsCa), dpsCcUcpv: pad.dpsCcUcpv, sbCc: pad.sbCc,
      fia: { placas: '', inversor: '', sb: '', qgbt: pad.fia.qgbt, ramal: pad.fia.ramal }, elet: U.clone(pad.elet),
      haste: pad.haste, cxPassagem: pad.cxPassagem, cxInspecao: pad.cxInspecao,
      telhado: '', inclinacao: pad.inclinacao, efic: pad.efic, fp: pad.fp, limiteCC: pad.limiteCC, limiteCA: pad.limiteCA, maxStr: pad.maxStr, condCA: pad.condCA, terraMod: pad.terraMod,
      assinarRt: true, atualizadoEm: new Date().toISOString()
    };
    puxarCrm(pr, inst, ctx);
    // disjuntor CA sugerido: o primeiro comercial ≥ 1,25 × corrente do inversor (como nas pranchas do projetista)
    if (!str(pr.disjCa)) { const c = calcular(pr); if (c.iInv > 0) pr.disjCa = String(proxDisjuntor(1.25 * c.iInv) || ''); }
    return pr;
  }

  /** Atualiza os dados que vêm do CRM (cliente, UC, ART, equipamentos, arranjo, ligação) e os compartilhados da Homologação. */
  function puxarCrm(pr, inst, ctx) {
    const e = equipamentos(inst, ctx);
    const cli = e.x.cli || {};
    pr.cliente = { nome: cli.nome || inst.clienteNome || '', documento: documento(cli.documento), endereco: linhaEndereco(cli, inst) };
    pr.uc = inst.uc || pr.uc || '';
    pr.art = inst.art || pr.art || '';
    if (!str(pr.ruas.uc)) pr.ruas.uc = rua(cli.endereco);
    // mais de um inversor na obra: INV1 = o primeiro e INV2… em pr.invs, guardando o arranjo e o circuito já digitados de cada um
    const ARR = ['qtdMod', 'nStrings', 'porString', 'porMppt', 'caBit', 'caUn', 'caDist', 'condCA', 'ccDist1', 'ccDist2', 'disjCa'];
    const guarda = function (novo, velho) { ARR.forEach(function (k) { if (velho && str(velho[k])) novo[k] = velho[k]; }); return novo; };
    const invAnt = pr.inv || {}, invsAnt = Array.isArray(pr.invs) ? pr.invs : [];
    pr.mod = e.mod;
    if (e.unidades.length > 1) {
      pr.inv = guarda(Object.assign({}, e.unidades[0], { qtd: '1' }), invAnt);
      pr.invs = e.unidades.slice(1).map(function (u, i) { return novoInversor(pr, guarda(Object.assign({}, u, { qtd: '1' }), invsAnt[i])); });
    } else pr.inv = invsAnt.length ? guarda(Object.assign({}, e.inv, { qtd: '1' }), invAnt) : e.inv;
    pr.modelosDiferentes = e.modelosDiferentes && !(pr.invs && pr.invs.length);
    // strings: as do dimensionamento, respeitando o máximo de módulos por string do projetista (padrão 10)
    const maxS = num(pr.maxStr) || 10, nMod = num(e.mod.qtd);
    const nMin = nMod > 0 ? Math.ceil(nMod / maxS) : 0;
    if (e.nStrings || nMin) pr.nStrings = String(Math.max(num(e.nStrings), nMin));
    pr.porString = '';
    if (pr.invs && pr.invs.length) pr.nStrings = '';
    if (LIGACOES[e.ligacao]) pr.ligacao = e.ligacao;
    if (e.telhado) pr.telhado = e.telhado;
    if (inst.homologacao) lerCompartilhados(pr, inst.homologacao);
    pr.atualizadoEm = new Date().toISOString();
    return pr;
  }

  /** Padrões do projetista guardados a cada prancha gerada (pré-preenchem a próxima). */
  function padroesDe(pr) {
    const o = {};
    CHAVES_PADRAO.forEach(function (k) { const v = obter(pr, k); if (v != null && v !== '') definir(o, k, v); });
    return o;
  }

  // ------------------------------------------------------------ cálculos
  /**
   * Módulos de cada string. porString: em branco = divide os módulos pelas strings (as primeiras levam um a mais quando a divisão
   * não é exata); um número = todas com esse número; uma lista ("10+10+5") = uma string por item, nessa ordem.
   */
  function tamanhos(nMod, nStr, porString) {
    const lista = String(porString == null ? '' : porString).split(/[+;\s]+/).map(function (x) { return Math.round(num(x)); }).filter(function (x) { return x > 0; });
    if (lista.length > 1) return lista;
    if (!(nStr > 0) || !(nMod > 0)) return [];
    if (lista.length === 1) return Array.from({ length: nStr }, function () { return lista[0]; });
    const base = Math.floor(nMod / nStr), extra = nMod % nStr;
    return Array.from({ length: nStr }, function (_, i) { return base + (i < extra ? 1 : 0); });
  }

  /** Lista "3+3+3" (ou "10 10 5") em números inteiros positivos. */
  function listaNum(v) { return String(v == null ? '' : v).split(/[+;\s]+/).map(function (x) { return Math.round(num(x)); }).filter(function (x) { return x > 0; }); }
  /**
   * Strings de cada MPPT (as do mesmo MPPT ficam em paralelo). porMppt: em branco = as strings divididas pelos MPPTs do inversor
   * (as primeiras levam uma a mais); uma lista ("3+3+3") = strings por MPPT, nessa ordem. Sempre soma nStr: o que faltar vira
   * mais um grupo e o que sobrar é cortado.
   */
  function gruposMppt(nStr, mppts, porMppt) {
    if (!(nStr > 0)) return [];
    let g = listaNum(porMppt);
    if (!g.length) {
      const m = Math.max(1, Math.min(Math.round(num(mppts)) || 1, nStr));
      const base = Math.floor(nStr / m), extra = nStr % m;
      return Array.from({ length: m }, function (_, i) { return base + (i < extra ? 1 : 0); });
    }
    const out = [];
    let resto = nStr;
    g.forEach(function (n) { if (resto > 0) { out.push(Math.min(n, resto)); resto -= Math.min(n, resto); } });
    if (resto > 0) out.push(resto);
    return out;
  }

  function calcular(pr) {
    const m = pr.mod || {}, iv = pr.inv || {};
    const nMod = num(m.qtd), nStr = num(pr.nStrings), nInv = Math.max(num(iv.qtd), iv.kw || iv.modelo ? 1 : 0);
    const w = num(m.w), vmp = num(m.vmp), imp = num(m.imp) || (vmp > 0 && w > 0 ? w / vmp : 0);
    const tam = tamanhos(nMod, nStr, pr.porString);
    const strings = tam.map(function (n, i) {
      const v = n * vmp, p = n * w / 1000;
      const dist = num(i === 0 || !tem(pr.cc.dist2) ? pr.cc.dist1 : pr.cc.dist2); // string 2 em diante: a distância 2 ou, em branco, a 1
      const dv = num(pr.cc.un) * imp * dist / 1000;
      return { n: n, p: p, v: v, i: imp, dist: dist, dv: dv, pct: v > 0 ? dv / v * 100 : 0 };
    });
    const kwp = nMod * w / 1000;
    const kw = num(iv.kw);
    const vInv = num(iv.tensao) || 220, fp = num(pr.fp) || 1;
    const iInv = kw > 0 ? kw * 1000 / (vInv * fp * (iv.fases === 'tri' ? Math.sqrt(3) : 1)) : 0;
    const dvCa = num(pr.ca.un) * iInv * num(pr.ca.dist) / 1000;
    const C = App.Calc;
    const prem = { tempMinima: 0, fatorVocFrio: 1.12 };
    const vocMod = num(m.voc);
    const vocFrioMod = vocMod > 0 ? (C && C.vocFrio ? C.vocFrio({ voc: vocMod, coefVoc: m.coefVoc }, prem) : vocMod * 1.12) : 0;
    const maxStr = tam.length ? Math.max.apply(null, tam) : 0;
    const out = {
      nMod: nMod, nStr: tam.length, nInv: nInv, tam: tam, strings: strings, maxStr: maxStr, w: w, vmp: vmp, imp: imp, kwp: kwp,
      kw: kw, vInv: vInv, fp: fp, iInv: iInv, dvCa: dvCa, pctCa: vInv > 0 ? dvCa / vInv * 100 : 0,
      strPorInv: nInv > 0 ? Math.ceil(tam.length / nInv) : tam.length, modPorInv: nInv > 0 ? Math.round(nMod / nInv) : nMod,
      vocFrioStr: vocFrioMod * maxStr, iscStr: num(m.isc),
      grupos: gruposMppt(tam.length, iv.mppts, pr.porMppt)
    };
    return out;
  }

  /** Condutores do circuito CA do inversor ao quadro, escolhidos pelo projetista (padrão FFT). */
  const CONDUTORES_CA = [{ v: 'FFT', t: 'F + F + T (2 fases e terra)' }, { v: 'FNT', t: 'F + N + T (fase, neutro e terra)' },
    { v: 'FFFT', t: 'F + F + F + T (3 fases e terra)' }, { v: 'FFFNT', t: 'F + F + F + N + T (3 fases, neutro e terra)' }];
  function condCA(pr) { const c = str(pr && pr.condCA).toUpperCase(); return /^[FN]+T$/.test(c) ? c : PADROES.condCA; }
  /** Condutores carregados do circuito CA (sem o terra), do terra para fora no desenho: fases e depois o neutro. */
  function letrasCA(pr) { const c = condCA(pr); return c.replace(/[^F]/g, '').split('').concat(c.indexOf('N') >= 0 ? ['N'] : []); }
  /** Bitola do aterramento dos módulos (campo do projetista; padrão 6 mm²). */
  function terraMod(pr) { return str(pr && pr.terraMod) || PADROES.terraMod; }

  // ------------------------------------------------------------ textos automáticos (carimbo, fiação)
  function automaticos(pr, ctx) {
    const emp = (ctx && ctx.empresa) || (App.Store && App.Store.config ? (App.Store.config().empresa || {}) : {}) || {};
    const bairro = str(emp.bairro);
    const endEmp = [str(emp.endereco), bairro ? (/^bairro/i.test(bairro) ? bairro : 'Bairro ' + bairro) : '', [str(emp.cidade), str(emp.uf)].filter(Boolean).join(' - ')].filter(Boolean).join(', ');
    const tel = str(emp.telefone);
    const contato = [tel ? 'Fone: ' + tel : '', str(emp.email)].filter(Boolean).join(' - ');
    const reg = str(emp.registro);
    const regFmt = /^\d{3,}$/.test(reg) && /cft/i.test(emp.registroTipo || '') ? reg.slice(0, -1) + '-' + reg.slice(-1) : reg;
    const telRt = tel.split('/').map(str).filter(Boolean).pop() || '';
    const lista = inversores(pr);
    const c = lista.length > 1 ? (function () {
      const cs = lista.map(function (x) { return calcular(x.p); });
      return { nStr: cs.reduce(function (a, k) { return a + k.nStr; }, 0) };
    })() : calcular(pr);
    const cond = letrasInv(lista[0].p).length, tm = terraMod(pr);
    return {
      empEndereco: endEmp, empContato: contato, rtNome: str(emp.responsavel),
      rtRegistro: reg ? [str(emp.registroTipo) || 'CFT-BR', 'nº', regFmt].join(' ') : '', rtTel: telRt ? 'TEL. ' + telRt.replace(/^\(?\d{2}\)?\s+(?=9?\d{4})/, '') : '',
      fiaPlacas: c.nStr > 0 ? (2 * c.nStr) + '#' + str(pr.cc.bit) + '(T#' + tm + ')' : '',
      fiaSb: (2 * Math.max(1, Math.min(c.nStr || 1, num(pr.inv && pr.inv.mppts) || 1))) + '#' + str(pr.cc.bit) + '(T#' + tm + ')',
      fiaInversor: cond + '#' + str(pr.ca.bit) + '(T#' + str(pr.terraBit) + ')'
    };
  }
  /** Valor efetivo: o digitado ou, em branco, o automático. */
  function efetivos(pr, ctx) {
    const a = automaticos(pr, ctx);
    const ou = function (v, auto) { return str(v) || auto; };
    return {
      empEndereco: ou(pr.emp.endereco, a.empEndereco), empContato: ou(pr.emp.contato, a.empContato),
      rtNome: ou(pr.rt.nome, a.rtNome), rtRegistro: ou(pr.rt.registro, a.rtRegistro), rtTel: ou(pr.rt.tel, a.rtTel),
      fiaPlacas: ou(pr.fia.placas, a.fiaPlacas), fiaSb: ou(pr.fia.sb, a.fiaSb), fiaInversor: ou(pr.fia.inversor, a.fiaInversor), auto: a
    };
  }

  // ------------------------------------------------------------ valores de cada campo do mapa
  /**
   * Valores dos campos de um estilo: {campo: texto} (o mesmo texto em todas as ocorrências) ou {campo: [texto por ocorrência]}.
   * Os formatos seguem as pranchas do projetista (estilo A com ponto decimal nas tabelas; estilo B como no desenho dele).
   */
  function valores(pr, estilo, ctx) {
    const c = calcular(pr), ef = efetivos(pr, ctx), m = pr.mod || {}, iv = pr.inv || {};
    const fab = maiusc(m.fab), fabInv = maiusc(iv.fab), modInv = str(iv.modelo);
    const w = c.w > 0 ? pt(c.w, 1) : '';
    const kwTxt = c.kw > 0 ? pt(c.kw, 2) : '';
    const kw1 = c.kw > 0 ? fx(c.kw, 1) + ' KW' : '';
    const lig = LIGACOES[pr.ligacao] || 'bifásico';
    const dg = str(pr.disjGeral), dca = str(pr.disjCa);
    const d = pr.dpsCa || {};
    const nModTxt = c.nMod > 0 ? pad2(c.nMod) : '';
    const cli = pr.cliente || {};
    const v = {
      emp_endereco: ef.empEndereco, emp_contato: ef.empContato,
      cli_nome: cli.nome, cli_endereco: cli.endereco, rt_nome: ef.rtNome,
      utm_x: str(pr.utm.x), utm_y: str(pr.utm.y), rt_nome_mai: maiusc(ef.rtNome), rt_registro: ef.rtRegistro, rt_tel: ef.rtTel,
      cli_nome_mai: maiusc(cli.nome), cli_doc: str(cli.documento) ? 'CPF/CNPJ:' + documento(cli.documento) : '', data: dataBR(pr.data),
      uc_carimbo: str(pr.uc) ? 'UC:' + str(pr.uc) : '', art: str(pr.art),
      descritivo: [
        'O sistema é composto por ' + nModTxt + ' módulos de ' + w + ' Wp. A instalação elétrica da casa existente',
        'com ramal de entrada ' + lig + ' de ' + str(pr.entrada.bit) + ' mm2, disjuntor de ' + dg + ' A e ramal de saída ' + lig + ' de',
        str(pr.saida.bit) + ' mm2, disjuntor de ' + dg + ' A.'],
      leg_modulo: 'Módulos fotovoltaico ' + (str(m.celulas) ? str(m.celulas) + ' células ' : '') + w + ' Wp',
      leg_inv_kw: kw1,
      rua_uc: str(pr.ruas.uc), rua_2: str(pr.ruas.r2), rua_3: str(pr.ruas.r3), rua_4: str(pr.ruas.r4),
      fia_placas: ef.fiaPlacas, fia_placas_vem: ef.fiaPlacas ? 'Vem das placas ' + ef.fiaPlacas : '', fia_inversor: ef.fiaInversor,
      fia_qgbt: str(pr.fia.qgbt), fia_ramal: str(pr.fia.ramal), fia_sb: ef.fiaSb,
      elet_placas: str(pr.elet.placas), elet_inversor: str(pr.elet.inversor), elet_ramal: str(pr.elet.ramal),
      cx_inspecao: str(pr.cxInspecao), haste: str(pr.haste), cx_passagem: str(pr.cxPassagem),
      inv_logo: fabInv
    };
    if (estilo === 'A') {
      const s1 = c.strings[0], s2 = c.strings[1];
      const linha = function (p, s) {
        const o = {}, l = linhaTabela(pr, s);
        COLUNAS.forEach(function (k) { o[p + '_' + k] = l[k]; });
        return o;
      };
      const smax = c.strings.reduce(function (a, s) { return !a || s.n > a.n ? s : a; }, null);
      Object.assign(v, linha('t1', s1), linha('t2', s2), {
        selo_nome: str(cli.nome), selo_uc: str(pr.uc) ? 'UC: ' + str(pr.uc) : '', selo_fuso: str(pr.utm.fuso) ? 'Fuso:  ' + str(pr.utm.fuso) : '',
        selo_x: str(pr.utm.x) ? 'X:  ' + str(pr.utm.x) : '', selo_y: str(pr.utm.y) ? 'Y:  ' + str(pr.utm.y) : '',
        mod_nome: [fab, str(m.modelo)].filter(Boolean).join(' - '), inv_nome: [fabInv, modInv].filter(Boolean).join(' - '),
        inv_kw_cad: kwTxt ? kwTxt + 'KW' : '', inv_nome_kw: [fabInv, kwTxt ? kwTxt + 'KW' : ''].filter(Boolean).join(' - '), inv_modelo: modInv,
        mod_w: w, mod_vmp: c.vmp > 0 ? pt(c.vmp, 2) : '', mod_imp: c.imp > 0 ? pt(c.imp, 2) : '',
        str_n: smax ? String(smax.n) : '', str_p: smax ? pt(smax.p, 2) : '', str_v: smax ? pt(smax.v, 1) : '',
        total_kwp: c.kwp > 0 ? pt(c.kwp, 2) : '', inv_strings: c.nStr ? String(c.strPorInv) : '', inv_kw: kwTxt,
        ti_nstr: c.nStr ? String(c.strPorInv) : '', ti_nmod: c.nMod ? String(c.modPorInv) : '', ti_efic: str(pr.efic) ? dig(pr.efic) + '%' : '',
        ti_kw: kwTxt, ti_v: pt(c.vInv, 1), ti_fp: dig(pr.fp), ti_i: c.iInv > 0 ? pt(c.iInv, 2) : '', ti_cabo: str(pr.ca.bit), ti_un: dig(pr.ca.un),
        ti_dist: tem(pr.ca.dist) ? dig(pr.ca.dist) : '', ti_dv: tem(pr.ca.dist) ? pt(c.dvCa, 2) : '', ti_pct: tem(pr.ca.dist) ? pt(c.pctCa, 2) : '',
        n_inv: c.nInv ? String(c.nInv) : '',
        disj_ca: dca ? dca + 'A' : '', disj_ca_ka: str(pr.disjCaKa) ? str(pr.disjCaKa) + 'kA' : '',
        dps_ca_classe: str(d.classe) ? 'DPS Classe ' + str(d.classe) : '', dps_ca_in: str(d.in) ? 'In=' + str(d.in) + 'kA' : '',
        dps_ca_imax: str(d.imax) ? 'In_max=' + str(d.imax) + 'kA' : '', dps_ca_uc: str(d.uc) ? 'Uc=' + str(d.uc) + 'V' : '', dps_ca_up: str(d.up) ? 'Up<' + str(d.up) + 'KV' : '',
        cabo_ramal_lig: str(pr.ramal.bit) ? str(pr.ramal.bit) + 'mm2 - ' + str(pr.ramal.tipo) : '', cabo_ramal_lig_iso: str(pr.ramal.iso),
        cabo_entrada: str(pr.entrada.bit) ? str(pr.entrada.bit) + 'mm2 - ' + str(pr.entrada.mat) : '', cabo_entrada_iso: str(pr.entrada.iso),
        cabo_saida: str(pr.saida.bit) ? str(pr.saida.bit) + 'mm2 - ' + str(pr.saida.mat) : '', cabo_saida_iso: str(pr.saida.iso),
        cabo_inversor: str(pr.ca.bit) ? str(pr.ca.bit) + 'mm2 - ' + str(pr.ca.mat) : '', cabo_inversor_iso: str(pr.ca.iso),
        cabo_cc: str(pr.cc.bit) ? (tem(pr.cc.bit) ? fx(U.num(pr.cc.bit), 1) : str(pr.cc.bit)) + 'mm2/' + str(pr.cc.tipo) : '',
        disj_geral_a: dg ? dg + 'A' : '', disj_ca_a: dca ? dca + 'A' : '',
        campo_fv: [0, 1, 0, 1].map(function (k) { const s = c.strings[k] || c.strings[0]; return s && w ? s.n + 'x' + w + 'W' : ''; }),
        bit_ca_marca: str(pr.ca.bit), bit_cc_marca: str(pr.cc.bit),
        // fiação do quadro ao inversor no desenho das strings: condutores (cabo CA do inversor) e terra
        bit_ca_lig: str(pr.ca.bit) ? '#' + str(pr.ca.bit) : '', bit_terra_lig: str(pr.terraBit) ? '#' + str(pr.terraBit) : ''
      });
      const lista = inversores(pr);
      return lista.length > 1 ? valoresMulti(pr, v, lista) : v;
    }
    // estilo B
    Object.assign(v, {
      selo_nome: str(cli.nome), selo_uc: str(pr.uc) ? 'UC:' + str(pr.uc) : '', selo_fuso: str(pr.utm.fuso) ? 'Fuso: ' + str(pr.utm.fuso) : '',
      selo_x: str(pr.utm.x) ? 'X: ' + str(pr.utm.x) : '', selo_y: str(pr.utm.y) ? 'Y: ' + str(pr.utm.y) : '',
      mod_fab_txt: fab ? 'FABRICANTE: ' + fab : '', mod_modelo_txt: str(m.modelo) ? 'MODELO: ' + str(m.modelo) : '', mod_pot_txt: w ? 'POTENCIA NOMINAL:  ' + w + ' Wp' : '',
      mod_qtd_txt: nModTxt ? 'QTDE MODULOS:  ' + nModTxt : '', mod_total_txt: c.kwp > 0 ? 'POTENCIA TOTAL:  ' + fx(c.kwp, 2, ',') + ' KWp' : '',
      mod_qtd_curto: nModTxt ? nModTxt + ' Módulos' : '',
      inv_fab_txt: fabInv ? 'FABRICANTE: ' + fabInv : '', inv_modelo_txt: modInv ? 'MODELO: ' + modInv : '', inv_pot_txt: kw1 ? 'POTENCIA: ' + kw1 : '',
      inv_rotulo: [fabInv, modInv].filter(Boolean).join(' | '),
      telhado: str(pr.telhado) ? 'Telhado ' + str(pr.telhado) : '', inclinacao: str(pr.inclinacao) ? 'i = ' + str(pr.inclinacao) + 'º' : '',
      cabo_cc_mm2: str(pr.cc.bit) ? str(pr.cc.bit) + ' mm2' : '', cabo_cc_solar: str(pr.cc.bit) ? str(pr.cc.bit) + ' mm2/Solar' : '',
      cabo_inv_pvc: str(pr.ca.bit) ? str(pr.ca.bit) + ' mm2/' + str(pr.ca.mat) : '', cabo_inv_pvc_txt: str(pr.ca.bit) ? str(pr.ca.bit) + ' mm2/' + str(pr.ca.mat) : '',
      cabo_saida_xlpe_esp: str(pr.saida.bit) ? str(pr.saida.bit) + ' mm2 / ' + str(pr.saida.mat) : '', cabo_entrada_xlpe_esp: str(pr.entrada.bit) ? str(pr.entrada.bit) + ' mm2 / ' + str(pr.entrada.mat) : '',
      cabo_saida_xlpe: str(pr.saida.bit) ? str(pr.saida.bit) + ' mm2/' + str(pr.saida.mat) : '', cabo_entrada_xlpe: str(pr.entrada.bit) ? str(pr.entrada.bit) + ' mm2/' + str(pr.entrada.mat) : '',
      disj_geral_a_esp: dg ? dg + ' A' : '', disj_geral_2p: dg ? (POLOS[pr.ligacao] || '2P') + '-' + dg : '',
      bit_cc_marca: str(pr.cc.bit) ? '#' + str(pr.cc.bit) : '', bit_ca_marca: str(pr.ca.bit) ? '#' + str(pr.ca.bit) : '',
      bit_terra_ca_marca: str(pr.terraBit) ? '#' + str(pr.terraBit) : '', bit_terra_cc_marca: '#' + terraMod(pr),
      disj_ca_a: dca ? dca + 'A' : '', dps_ca_classe_mai: str(d.classe) ? 'DPS CA CLASSE ' + maiusc(d.classe) : '', dps_ca_uc_v: str(d.uc) ? str(d.uc) + ' V' : '',
      dps_ca_in_esp: str(d.in) ? 'In = ' + str(d.in) + ' kA' : '', dps_ca_imax_esp: str(d.imax) ? 'In Max = ' + str(d.imax) + ' kA' : '',
      sb_cc: str(pr.sbCc), cabo_ramal_lig_multiplex: str(pr.ramal.bit) ? str(pr.ramal.cond) + '#' + str(pr.ramal.bit) + '(' + (str(pr.ramal.neutro) || str(pr.ramal.bit)) + ') mm2' : ''
    });
    return v;
  }

  const COLUNAS = ['n', 'p', 'v', 'i', 'cabo', 'un', 'dist', 'dv', 'pct'];
  /** Valores de uma linha da tabela de strings do estilo A (vazios sem a string). */
  function linhaTabela(pr, s) {
    const o = {};
    COLUNAS.forEach(function (k) { o[k] = ''; });
    if (!s) return o;
    o.n = String(s.n); o.p = pt(s.p, 2); o.v = pt(s.v, 1); o.i = pt(s.i, 2); o.cabo = str(pr.cc.bit);
    o.un = dig(pr.cc.un); o.dist = s.dist > 0 ? pt(s.dist, 2) : ''; o.dv = s.dist > 0 ? pt(s.dv, 2) : ''; o.pct = s.dist > 0 ? pt(s.pct, 2) : '';
    return o;
  }

  /**
   * Desenho do estilo A com a quantidade real da obra: uma fileira por string com os módulos dela (as placas diminuem só quando
   * não cabem), as strings do mesmo MPPT (em paralelo) agrupadas em blocos, o ramal de cada string até o inversor (em leque com
   * até 2 strings, como no desenho original; com 3 ou mais, por um canal tracejado, sem cruzamentos), a tabela com uma linha por
   * string (cresce para baixo empurrando as seções 3 e 4) e um "Campo Fotov." por string nos unifilares.
   * Devolve comandos para o gerador do PDF: {t: 'forma', nome, m} (bloco do desenho original com a matriz), {t: 'linha', pts, cor,
   * traco} e {t: 'texto', oc, txt}; e ainda cmds.desloc ({x, y, dy}: os campos à esquerda de x e abaixo de y descem dy).
   * campos: mapa do estilo A; G: mapa.stringsA.
   */
  function desenhoStringsA(pr, campos, G, folha) {
    const lista = inversores(pr);
    // em 2 folhas (o padrão) e com mais de um inversor, o desenho vai pelo caminho de várias folhas/inversores
    if (G && (lista.length > 1 || folha)) return desenhoMultiA(pr, campos, G, lista, folha);
    const c = calcular(pr), cmds = [];
    cmds.desloc = null;
    if (!G) return cmds;
    const w = c.w > 0 ? pt(c.w, 1) : '', bit = str(pr.cc.bit), preto = [0, 0, 0];
    const forma = function (nome, ox, oy, nx, ny, s) { cmds.push({ t: 'forma', nome: nome, m: [s, 0, 0, s, nx - s * ox, ny - s * oy] }); };
    const linha = function (pts, cor, traco) { cmds.push({ t: 'linha', pts: pts, cor: cor || preto, traco: traco || null }); };
    const texto = function (oc, txt, ox, oy, nx, ny, s) {
      if (!oc || !txt) return;
      cmds.push({ t: 'texto', txt: txt, oc: Object.assign({}, oc, { x: nx + s * (oc.x - ox), y: ny + s * (oc.y - oy), s: oc.s * s, w: oc.w ? oc.w * s : oc.w }) });
    };
    const um = function (k) { return campos[k] && campos[k][0]; };
    const F = G.fileira, R = G.ramal, K = G.coluna || null;
    const tam = c.tam, N = tam.length;

    // ---- tabela de strings: uma linha por string; com mais de 3 o corpo cresce (até a moldura) e o resto da coluna desce
    const T = G.tabela, rotTab = um('_tab_str');
    const H0 = 7.48, req = (Math.max(N, 1) - 1) * T.passo + T.passo / 1.4 + 4.01; // corpo para o passo cheio (14,8)
    const desce = K ? Math.max(0, Math.min(K.livre, req - (T.topo - T.fundo))) : 0;
    const fundo = T.fundo - desce;
    if (K) {
      forma('CRMSec2', 0, 0, 0, 0, 1);
      K.xs.forEach(function (x) { linha([[x, K.topo], [x, K.cheias.indexOf(x) >= 0 ? K.total - desce : K.corpo - desce]]); });
      forma('CRMBaixo', 0, 0, 0, -desce, 1);
      if (desce > 0) cmds.desloc = { x: 1160, y: K.corpo + 0.6, dy: -desce };
    }
    if (!N) return cmds;
    // passo entre linhas e altura das letras: 14,8 como no desenho; só quando nem a coluna inteira basta as linhas se aproximam e
    // as letras diminuem na mesma proporção, o bloco sempre centrado no corpo da tabela
    const livreT = T.topo - fundo - 4;
    const sp = N > 1 ? Math.min(T.passo, livreT / (N - 1 + 1 / 1.4)) : T.passo;
    const st = Math.min(1, sp / 1.4 / H0), altB = (N - 1) * sp + H0 * st;
    const baseFundo = (T.topo + fundo) / 2 - altB / 2;
    c.strings.forEach(function (sx, i) {
      const y = baseFundo + (N - 1 - i) * sp, l = linhaTabela(pr, sx);
      if (rotTab) cmds.push({ t: 'texto', txt: 'STR' + (i + 1), oc: Object.assign({}, rotTab, { y: y, s: rotTab.s * st }) });
      COLUNAS.forEach(function (k) { const oc = um('t1_' + k); if (oc && l[k]) cmds.push({ t: 'texto', txt: l[k], oc: Object.assign({}, oc, { y: y, s: oc.s * st }) }); });
    });

    // ---- fileiras: STR1 embaixo; as strings do mesmo MPPT (em paralelo) num bloco, com folga entre os blocos
    const paralelo = c.grupos.some(function (g) { return g > 1; });
    const blocoDe = [];
    (paralelo ? c.grupos : tam.map(function () { return 1; })).forEach(function (g, j) { for (let i = 0; i < g; i++) blocoDe.push(j); });
    const nBlocos = paralelo ? c.grupos.length : 1, folgaB = paralelo && N > 2 ? 0.55 * F.passoY : 0;
    const nmax = Math.max.apply(null, tam);
    const altTot = N * F.alt + (N - 1) * (F.passoY - F.alt) + (nBlocos - 1) * folgaB;
    const s = Math.min(1, (F.xmax - F.x0) / ((nmax - 1) * F.passo + F.larg), (F.topo - F.base) / altTot);
    const xu = F.x0 + F.ultimo * F.passo; // 1º módulo da última posição no desenho original
    const sg = Math.min(1, 1.5 * s);     // grupo + − T do ramal
    const oys = [];
    let yAt = F.topo - F.alt * s;
    for (let k = N - 1; k >= 0; k--) {
      oys[k] = yAt;
      yAt -= F.passoY * s;
      if (k > 0 && blocoDe[k - 1] !== blocoDe[k]) yAt -= folgaB * s;
    }
    const ents = [];
    tam.forEach(function (n, k) {
      const oy = oys[k], rot = 'STR' + (k + 1);
      for (let j = 0; j < n; j++) forma('CRMMod', F.x0, F.y0, F.x0 + j * F.passo * s, oy, s);
      forma('CRMDps', F.x0, F.y0, F.x0, oy, s);
      for (let j = 0; j < n - 1; j++) {
        const nx = F.x0 + j * F.passo * s;
        forma('CRMElo', F.x0, F.y0, nx, oy, s);
        texto(um('_elo_str'), rot, F.x0, F.y0, nx, oy, s);
        texto(um('_elo_bit'), bit ? '#' + bit : '', F.x0, F.y0, nx, oy, s);
      }
      const xf = F.x0 + (n - 1) * F.passo * s;
      forma('CRMFim', xu, F.y0, xf, oy, s);
      const yr = oy + s * (F.ret[1] - F.y0);
      linha([[F.x0 + s * (F.ret[0] - F.x0), yr], [xf + s * (F.ret[2] - xu), yr]]);
      ents[k] = [F.x0 + s * (F.entrada[0] - F.x0), oy + s * (F.entrada[1] - F.y0)];
    });
    // grupo + − T, rótulo da string e bitolas (#cabo CC sob + e −, #terra sob o T) no ramal, no ponto (ax, ay)
    const grupoRamal = function (k, ax, ay) {
      forma('CRMRam', ax, R.ancora[1], ax, ay, sg);
      texto(um('_ram_str'), 'STR' + (k + 1), ax, R.ancora[1], ax, ay, sg);
      (campos._ram_bit || []).forEach(function (oc, i) { const b = i === 0 ? bit : terraMod(pr); texto(oc, b ? '#' + b : '', ax, R.ancora[1], ax, ay, sg); });
    };
    if (N <= 2) {
      // como no desenho original: ramais retos do inversor até cada fileira
      ents.forEach(function (ent, k) {
        linha([R.p0, ent]);
        const ax = R.ancora[0], ay = R.p0[1] + (ax - R.p0[0]) / (ent[0] - R.p0[0]) * (ent[1] - R.p0[1]);
        grupoRamal(k, ax, ay);
      });
    } else {
      // canal: cada string sai da fileira na horizontal até a sua pista, desce/sobe até o seu nível e segue para o inversor; as
      // fileiras mais distantes usam as pistas mais externas, então nenhum ramal cruza outro
      // as pistas chegam por linhas curtas a um ponto à direita do rótulo INV1 e seguem juntas até o inversor
      const y0 = R.p0[1], xa = 640, xb = R.ancora[0] - 14, xc = xa - 12, q = [R.p0[0] + 36, y0];
      const acima = [], abaixo = [];
      ents.forEach(function (e, k) { (e[1] >= y0 ? acima : abaixo).push(k); });
      acima.sort(function (a, b) { return ents[b][1] - ents[a][1]; });   // de cima (mais longe) para baixo
      abaixo.sort(function (a, b) { return ents[a][1] - ents[b][1]; });  // de baixo (mais longe) para cima
      const nPistas = Math.max(acima.length, abaixo.length, 1);
      const dx = Math.min(10, (xb - xa) / nPistas), db = Math.min(3, 30 / N);
      const traco = [6, 3];
      const rota = function (k, i, nivel) {
        const e = ents[k], xp = xa + i * dx;
        linha([e, [xp, e[1]], [xp, nivel], [xc, nivel], q, R.p0], preto, traco);
        grupoRamal(k, R.ancora[0], e[1]);
      };
      acima.forEach(function (k, i) { rota(k, i, y0 + (acima.length - 1 - i) * db); });
      abaixo.forEach(function (k, i) { rota(k, i, y0 - (abaixo.length - i) * db); });
      // blocos de strings em paralelo: colchete com o MPPT entre os ramais e as fileiras
      if (paralelo) {
        let ini = 0;
        const ocM = um('_ram_str') || { t: 'txt', s: 5.66, fl: 0.9, ang: 0, cor: preto, al: 'l' };
        c.grupos.forEach(function (g, j) {
          const ks = []; for (let i = 0; i < g; i++) ks.push(ini + i);
          ini += g;
          const yb = oys[ks[0]] - 1, yt = oys[ks[ks.length - 1]] + F.alt * s + 1, xk = F.x0 - 6;
          linha([[xk + 3, yb], [xk, yb], [xk, yt], [xk + 3, yt]], preto);
          if (ocM) cmds.push({ t: 'texto', txt: 'MPPT' + (j + 1), oc: Object.assign({}, ocM, { x: xk - 2.2, y: (yb + yt) / 2 - 8.2 * Math.min(1, 1.6 * s), s: ocM.s * Math.min(1, 1.6 * s), ang: 90, al: 'l', w: null }) });
        });
      }
    }

    unifilares(tam);
    condutoresCA();
    if (pr.ligacao === 'tri') multifilarTri(pr, [{ p: pr }], cmds);
    compactos1F(pr, inversores(pr), cmds);
    return cmds;

    // ---- unifilares: um ramo por string com o "Campo Fotov.", o rótulo e a bitola, e a marca e o texto do cabo CC
    function unifilares(tam) {
    const N = tam.length;
    if (!N) return;
    // unifilar simplificado: um ramo por string sob o inversor, ligados pelo barramento
    const S = G.uniS, cfS = campos.campo_fv && campos.campo_fv[2];
    let xsS = [S.xInv], su = 1;
    if (N > 1) {
      const p = Math.min(S.passo, 2 * Math.min(S.xInv - S.min, S.max - S.xInv) / (N - 1));
      su = Math.min(1, p / S.larg);
      xsS = tam.map(function (_, k) { return S.xInv + (k - (N - 1) / 2) * p; });
      linha([[xsS[0], S.yBus], [xsS[N - 1], S.yBus]]);
    }
    xsS.forEach(function (x, k) {
      forma('CRMRamS', S.x, S.yBus, x, S.yBus, su);
      texto(um('_uS_campo'), 'Campo Fotov.', S.x, S.yBus, x, S.yBus, su);
      texto(cfS, w ? tam[k] + 'x' + w + 'W' : '', S.x, S.yBus, x, S.yBus, su);
      texto(um('_uS_str'), 'STR' + (k + 1), S.x, S.yBus, x, S.yBus, su);
      texto(um('_uS_bit'), bit ? '#' + bit : '', S.x, S.yBus, x, S.yBus, su);
    });
    // ---- unifilar principal: até 2 strings como no desenho; 3 ou mais pelo barramento sob o inversor
    const V = G.uniU, cf = campos.campo_fv || [], uc = campos._uU_campo || [];
    let xsU;
    if (N <= 2) {
      xsU = V.xs.slice(0, N);
      xsU.forEach(function (x, k) {
        forma('CRMRamU', V.xs[0], V.yForma, x, V.yForma, 1);
        linha([[x, V.yForma], [x, V.yInv]]);
        // STR1 com o texto à esquerda do módulo, STR2 à direita (como no desenho)
        texto(uc[k], 'Campo Fotov.', 0, 0, 0, 0, 1);
        texto(cf[k === 0 ? 1 : 0], w ? tam[k] + 'x' + w + 'W' : '', 0, 0, 0, 0, 1);
      });
      forma('CRMPont', 0, 0, 0, 0, 1);
    } else {
      const p = Math.min(V.passo, (V.max - V.min) / (N - 1)), sv = Math.min(1, p / V.passo);
      const cx = Math.min(V.xInv, V.max - (N - 1) * p / 2);
      xsU = tam.map(function (_, k) { return cx + (k - (N - 1) / 2) * p; });
      xsU.forEach(function (x, k) {
        forma('CRMRamU', V.xs[0], V.yForma, x, V.yForma, sv);
        linha([[x, V.yForma], [x, V.yBus]]);
        texto(uc[0], 'Campo Fotov.', V.xs[0], V.yForma, x, V.yForma, sv);
        texto(cf[1], w ? tam[k] + 'x' + w + 'W' : '', V.xs[0], V.yForma, x, V.yForma, sv);
      });
      linha([[Math.min(xsU[0], V.xInv), V.yBus], [Math.max(xsU[N - 1], V.xInv), V.yBus]]);
      linha([[V.xInv, V.yBus], [V.xInv, V.yInv]]);
      const cz = V.caixa, x0 = Math.min(cz[0], xsU[0] - (V.xs[0] - (uc[0] ? uc[0].x - uc[0].s : V.xs[0] - 23.1)) * sv - 4);
      linha([[x0, cz[1]], [cz[2], cz[1]], [cz[2], cz[3]], [x0, cz[3]], [x0, cz[1]]], [0.498, 0, 1], [12.6, 6.3]);
    }
    // marca do cabo CC cruzando os condutores e o texto do cabo logo depois dela
    const x1 = xsU[0] - 1.3, xn = xsU[xsU.length - 1], mk = V.marca;
    linha([[xn + 1.9, mk[1]], [xn + 1.9, mk[0]], [x1, mk[0]], [x1, mk[1]], [xn + 10.6, mk[1]]]);
    const occ = um('cabo_cc');
    if (occ && str(pr.cc.bit)) cmds.push({ t: 'texto', txt: (tem(pr.cc.bit) ? fx(U.num(pr.cc.bit), 1) : str(pr.cc.bit)) + 'mm2/' + str(pr.cc.tipo), oc: Object.assign({}, occ, { x: occ.x + (xn - V.xs[1]) }) });
    }

    // condutores do circuito CA (FFT, FNT…): traços na fiação quadro–inversor e nos dois pontos do unifilar simplificado — os do
    // inversor (pela saída dele) e, no QD, os da ligação da UC
    function condutoresCA() {
      const Kc = G.condutores;
      if (!Kc) return;
      letrasInv(pr).forEach(function (l, i) {
        const x = Kc.h.xF - i * Kc.h.passo;
        if (l === 'N') forma('CRMTickN', Kc.h.xN, 0, x, 0, 1); else forma('CRMTickF', Kc.h.xF, 0, x, 0, 1);
      });
      Kc.v.forEach(function (pv, k) {
        (k === 0 ? letrasUC(pr) : letrasInv(pr)).forEach(function (l, i) {
          const y = pv.y - i * pv.passo;
          if (l === 'N') forma('CRMTickNh', 0, Kc.yN, 0, y, 1); else forma('CRMTickFh', 0, Kc.yF, 0, y, 1);
        });
      });
    }
  }

  // ------------------------------------------------------------ fases dos circuitos CA (diagramas do estilo A)
  /** O inversor é trifásico? */
  function triInv(p) { return !!(p && p.inv && p.inv.fases === 'tri'); }
  /** Condutores do circuito CA de um inversor pela saída dele: trifásico com 3 fases; mono/bifásico com até 2 (o terra à parte). */
  function letrasInv(p) {
    const l = letrasCA(p), f = l.filter(function (x) { return x === 'F'; }).length, n = l.indexOf('N') >= 0;
    if (triInv(p) && f < 3) return ['F', 'F', 'F'].concat(n ? ['N'] : []);
    if (!triInv(p) && f > 2) return ['F', 'F'].concat(n ? ['N'] : []);
    return l;
  }
  /** Condutores do quadro à String Box CA: os da ligação da UC (trifásica: 3 fases). */
  function letrasUC(pr) {
    const l = letrasCA(pr);
    return pr.ligacao === 'tri' ? ['F', 'F', 'F'].concat(l.indexOf('N') >= 0 ? ['N'] : []) : l;
  }
  // detalhe de instalação do inversor e da string box (com a placa CUIDADO e o poste) no modelo A: com 2 folhas, vai para a 2ª
  const DETALHE_INST = [1186, 205, 1756, 632];
  // croqui de localização (com o selo do titular e as ruas): com 2 folhas, vai para o lado das tabelas, ampliado
  const CROQUI = { r: [1343, 1043, 1844, 1433], k: 1.35, centro: [1480, 395] };
  // condutores do diagrama multifilar do modelo (R e S) e o 3º condutor (R) da UC trifásica, à esquerda
  const MF = { xR: 1131.0, xS: 1151.8, xT: 1172.6, d: 20.8 };
  // inversor trifásico no multifilar: o símbolo do modelo ampliado (1,55×) com as 3 fases entrando por cima e as proteções afastadas
  const INV_TRI = {
    bb: [1141.9, 981.7, 1180.7, 1020.6], k: 1.55, prot: [1200.7, 973.6, 1230.0, 1026.8], dProt: 21,
    topo: 981.7 + (1020.12 - 981.7) * 1.55,
    entradas: function (x0) { const a = x0 + 0.5 * 1.55, w = 37.8 * 1.55; return [a + w / 6, a + w / 2, a + 5 * w / 6]; },
    dir: function (x0) { return x0 + (1180.7 - 1141.9) * 1.55; }
  };

  /**
   * Diagrama multifilar (unifilar principal) de UC trifásica. O modelo é bifásico (R, S e N, 2 condutores); aqui entram a fase T
   * e o 3º condutor — R à esquerda, depois S e T — da rede ao medidor (mais largo), o 3º polo do disjuntor geral, a carga da
   * fase R e as marcas dos cabos. Com o INV1 trifásico, a fase R segue até ele: 3º polo na String Box CA, um DPS por fase e a
   * entrada no inversor. Com o INV2 trifásico, a fase R desce até a derivação dele (o desenho do INV2 tira R, S e T).
   */
  function multifilarTri(pr, lista, cmds) {
    const preto = [0, 0, 0], azul = [0, 0, 1], roxo = [0.498, 0, 1], tr = [12.6, 6.3];
    const linha = function (pts, cor, traco) { cmds.push({ t: 'linha', pts: pts, cor: cor || preto, traco: traco || null }); };
    const regiao = function (bb, dx, dy) { cmds.push({ t: 'regiao', bb: bb, dx: dx, dy: dy }); };
    const branco = function (r) { cmds.push({ t: 'branco', r: r }); };
    const ponto = function (x, y) { cmds.push({ t: 'ponto', x: x, y: y, r: 1.6 }); };
    const rotulo = function (x, y, s) { cmds.push({ t: 'texto', txt: s, oc: { t: 'txt', x: x, y: y, s: 4.7, fl: 0.85, ang: 0, cor: azul, al: 'l' } }); };
    const XR = MF.xR, XS = MF.xS, XT = MF.xT, D = MF.d;
    const inv1Tri = triInv(lista[0].p), inv2Tri = lista.length > 1 && triInv(lista[1].p);
    // rede: R, S, T e N — S sai da linha S, T da linha T (no modelo: R e S)
    branco([1149.6, 1574.4, 1154.2, 1596.5]); linha([[1147, 1594.3], [1157, 1594.3]]);
    branco([1170.4, 1553.6, 1174.8, 1575.5]); linha([[1168, 1573.4], [1178, 1573.4]]);
    branco([1109, 1551.4, 1227.6, 1553.8]); branco([1231.5, 1549.3, 1237.6, 1555.9]);
    linha([[1110, 1552.6], [1226.5, 1552.6]]); rotulo(1232.7, 1550.2, 'T');
    linha([[1110, 1531.7], [1226.5, 1531.7]], azul); rotulo(1232.7, 1529.3, 'N');
    linha([[XS, 1573.4], [XS, 1548]]); linha([[XT, 1552.6], [XT, 1548]]);
    ponto(XR, 1594.3); ponto(XS, 1573.4); ponto(XT, 1552.6);
    // medidor mais largo, com os 3 condutores
    branco([1144.9, 1447.0, 1176.9, 1488.5]);
    linha([[1124.8, 1487.8], [1177.6, 1487.8]]); linha([[1124.8, 1447.7], [1177.6, 1447.7]]); linha([[1124.8, 1447.7], [1124.8, 1487.8]]); linha([[1124.8, 1481.4], [1177.6, 1481.4]]);
    // setas e "kWh" maiores, no centro da caixa mais larga
    const cxM = (1124.8 + 1177.6) / 2;
    cmds.push({ t: 'regiao', bb: [1148.4, 1482.2, 1174.8, 1487.0], dx: cxM - 19.8 - 1148.4, dy: 0, w: 39.6, h: 4.8 });
    cmds.push({ t: 'regiao', bb: [1152.2, 1459.3, 1169.1, 1468.0], dx: cxM - 11.83 - 1152.2, dy: 1457.6 - 1459.3, w: 23.66, h: 12.18 });
    linha([[XR, 1594.3], [XR, 1487.8]]); linha([[XR, 1447.7], [XR, 1405.9]]);
    // até onde a fase R desce: o INV1 trifásico, a derivação do INV2 trifásico ou a carga da fase R
    const yFim = inv1Tri ? null : (inv2Tri ? 1210 : 1323.3);
    // marcas dos cabos cobrindo os 3 condutores
    [[1423.9, 1426.3], [1347.8, 1350.1]].concat(yFim === 1323.3 ? [] : [[1219.9, 1222.2]]).forEach(function (m) {
      branco([1149.3, m[0] - 0.6, 1150.3, m[1] + 0.6]);
      linha([[1149.8, m[0]], [1128.6, m[0]], [1128.6, m[1]], [1149.8, m[1]]]);
    });
    // disjuntor geral: 3º polo e a alavanca dos três
    regiao([1149.6, 1358.9, 1160.5, 1405.9], -D, 0);
    linha([[1132.3, 1385.0], [1153.1, 1385.0]]); linha([[1132.3, 1381.8], [1153.1, 1381.8]]);
    // carga instalada: a da fase R (caixa mais alta)
    branco([1048, 1315.6, 1183, 1317.0]); linha([[XS, 1314], [XS, 1318.5]]); linha([[XT, 1314], [XT, 1318.5]]);
    linha([[1049.3, 1316.3], [1049.3, 1334.0], [1181.8, 1334.0], [1181.8, 1316.3]], roxo, tr);
    regiao([1060, 1297.5, 1114.0, 1311.0], 0, 20.9);
    linha([[1113.2, 1323.3], [XR, 1323.3]]); ponto(XR, 1323.3);
    linha([[XR, 1358.9], [XR, yFim == null ? 1190.6 : yFim]]);
    if (!inv1Tri) return;
    // INV1 trifásico: 3º polo na String Box CA, um DPS por fase e a fase R entrando no inversor pelo meio
    regiao([1149.6, 1143.6, 1160.5, 1190.6], -D, 0);
    linha([[1132.3, 1170.6], [1153.1, 1170.6]]); linha([[1132.3, 1167.4], [1153.1, 1167.4]]);
    branco([1175.5, 1084.0, 1233.0, 1137.2]);
    [-15.6, 5.2, 26.0].forEach(function (dx) { regiao([1195.4, 1085.9, 1208.0, 1114.9], dx, 0); });
    linha([[XT, 1114.7], [1186.0, 1114.7]]);
    linha([[XT, 1135.6], [1206.8, 1135.6], [1206.8, 1114.9]]);
    linha([[XR, 1141.5], [1227.6, 1141.5], [1227.6, 1114.9]]); ponto(XR, 1141.5);
    // inversor maior (1,55×) para as 3 fases entrarem por cima, em escada (sem cruzar), e as proteções à direita dele
    const k = INV_TRI.k, xe = INV_TRI.entradas(1141.9);
    branco([1141.4, 981.2, 1182, 1061]); branco([1182, 973.0, 1230.5, 1061]);
    cmds.push({ t: 'regiao', bb: INV_TRI.bb, dx: 0, dy: 0, w: (INV_TRI.bb[2] - INV_TRI.bb[0]) * k, h: (INV_TRI.bb[3] - INV_TRI.bb[1]) * k });
    linha([[XT, 1062], [XT, 1060], [xe[2], 1060], [xe[2], INV_TRI.topo]]);
    linha([[XS, 1062], [XS, 1055], [xe[1], 1055], [xe[1], INV_TRI.topo]]);
    linha([[XR, 1143.6], [XR, 1050], [xe[0], 1050], [xe[0], INV_TRI.topo]]);
    regiao(INV_TRI.prot, INV_TRI.dProt, 0); linha([[INV_TRI.dir(1141.9), 1001.2], [INV_TRI.prot[0] + INV_TRI.dProt + 0.5, 1001.2]]);
  }

  // ------------------------------------------------------------ obra com mais de um inversor (estilo A)
  /** Corrente de saída de um inversor (P ÷ V, ÷ √3 no trifásico). */
  function correnteInv(inv, fp) {
    const kw = num(inv && inv.kw), v = num(inv && inv.tensao) || 220;
    return kw > 0 ? kw * 1000 / (v * (num(fp) || 1) * (inv.fases === 'tri' ? Math.sqrt(3) : 1)) : 0;
  }
  /** INV2…: os campos do arranjo e do circuito CA em branco (automáticos) e o disjuntor sugerido (≥ 1,25 × corrente). */
  function novoInversor(pr, base) {
    const x = Object.assign({ fab: '', modelo: '', kw: '', qtd: '1', fases: (pr.inv && pr.inv.fases) || 'mono', tensao: (pr.inv && pr.inv.tensao) || '220', vmaxCC: '',
      mppts: '', imaxMppt: '', qtdMod: '', nStrings: '', porString: '', porMppt: '', caBit: '', caUn: '', caDist: '', condCA: '', ccDist1: '', ccDist2: '', disjCa: '' }, base || {});
    if (!str(x.disjCa)) { const i = correnteInv(x, pr.fp); if (i > 0) x.disjCa = String(proxDisjuntor(1.25 * i) || ''); }
    return x;
  }
  /**
   * Inversores da obra: INV1 = pr.inv, INV2… = pr.invs. Cada um recebe os módulos digitados (qtdMod) ou, em branco, a sua parte
   * dos módulos da obra pela potência (maiores restos); strings, divisão por string e por MPPT, circuito CA e disjuntor são de
   * cada inversor. Devolve [{k, inv, p}] — p é a prancha "de um inversor só" (o mesmo formato de sempre) para os cálculos.
   */
  function inversores(pr) {
    const extras = (Array.isArray(pr.invs) ? pr.invs : []).filter(function (x) { return x && (num(x.kw) > 0 || str(x.modelo)); });
    const q1 = Math.max(1, Math.round(num(pr.inv && pr.inv.qtd)) || 1);
    if (!extras.length && q1 === 1) return [{ k: 0, inv: pr.inv || {}, p: pr }];
    // quantidade > 1 no INV1 (obras antigas): cada unidade vira um inversor, com o arranjo automático
    const L = [pr.inv || {}];
    for (let i = 1; i < q1; i++) L.push(novoInversor(pr, Object.assign({}, pr.inv, { qtd: '1', qtdMod: '', nStrings: '', porString: '', porMppt: '', caBit: '', caDist: '', disjCa: pr.disjCa || '' })));
    extras.forEach(function (x) { for (let i = 0; i < Math.max(1, Math.round(num(x.qtd)) || 1); i++) L.push(x); });
    const M = num(pr.mod && pr.mod.qtd), maxS = num(pr.maxStr) || 10;
    const dig = L.map(function (x) { return Math.max(0, Math.round(num(x.qtdMod))); });
    const resto = Math.max(0, M - dig.reduce(function (a, b) { return a + b; }, 0));
    const peso = L.map(function (x, i) { return dig[i] > 0 ? 0 : (num(x.kw) || 1); });
    const soma = peso.reduce(function (a, b) { return a + b; }, 0);
    const bruto = peso.map(function (w) { return soma > 0 ? resto * w / soma : 0; });
    const n = bruto.map(Math.floor);
    let falta = resto - n.reduce(function (a, b) { return a + b; }, 0);
    bruto.map(function (b, i) { return { i: i, f: b - Math.floor(b) }; }).filter(function (x) { return peso[x.i] > 0; })
      .sort(function (a, b) { return b.f - a.f; }).forEach(function (x) { if (falta > 0) { n[x.i]++; falta--; } });
    return L.map(function (x, i) {
      const ni = dig[i] || n[i];
      const p = Object.assign({}, pr, {
        invs: [], inv: Object.assign({}, x, { qtd: '1' }), mod: Object.assign({}, pr.mod, { qtd: String(ni) }), modelosDiferentes: false,
        nStrings: str(x.nStrings) || (ni > 0 ? String(Math.ceil(ni / maxS)) : ''), porString: str(x.porString), porMppt: str(x.porMppt),
        // INV1: o circuito CA e o disjuntor da prancha; INV2…: os dele (cabo e queda unitária do INV1 quando em branco)
        ca: i === 0 ? pr.ca : Object.assign({}, pr.ca, { bit: str(x.caBit) || pr.ca.bit, un: str(x.caUn) || pr.ca.un, dist: str(x.caDist) }),
        disjCa: i === 0 ? pr.disjCa : str(x.disjCa),
        // circuito CC e condutores CA do inversor (em branco: as distâncias CC e os condutores do INV1, ajustados à saída dele)
        cc: i === 0 || !str(x.ccDist1) ? pr.cc : Object.assign({}, pr.cc, { dist1: str(x.ccDist1), dist2: str(x.ccDist2) }),
        condCA: i === 0 ? pr.condCA : (str(x.condCA) || pr.condCA)
      });
      return { k: i, inv: x, p: p };
    });
  }

  /** Valores do estilo A que mudam com mais de um inversor (seção 3 com todos, tabela do inversor com o INV1, legenda e totais). */
  function valoresMulti(pr, v, lista) {
    const cs = lista.map(function (x) { return calcular(x.p); });
    const nomes = lista.map(function (x) { return [maiusc(x.inv.fab), str(x.inv.modelo)].filter(Boolean).join(' - '); });
    const kws = cs.map(function (c) { return c.kw > 0 ? pt(c.kw, 2) : ''; });
    const v1 = valores(lista[0].p, 'A');
    const todas = [].concat.apply([], cs.map(function (c) { return c.strings; }));
    const smax = todas.reduce(function (a, s) { return !a || s.n > a.n ? s : a; }, null);
    ['ti_nstr', 'ti_nmod', 'ti_efic', 'ti_kw', 'ti_v', 'ti_fp', 'ti_i', 'ti_cabo', 'ti_un', 'ti_dist', 'ti_dv', 'ti_pct', 'disj_ca', 'disj_ca_a', 'inv_nome_kw', 'inv_modelo', 'inv_logo', 'bit_ca_lig', 'cabo_inversor']
      .forEach(function (k) { v[k] = v1[k]; });
    return Object.assign(v, {
      inv_nome: [nomes.join(' / '), nomes.join(' + '), nomes[0]],
      inv_kw_cad: [kws.map(function (k) { return k + 'KW'; }).join(' / '), kws[0] ? kws[0] + 'KW' : '', kws[0] ? kws[0] + 'KW' : ''],
      leg_inv_kw: cs.map(function (c) { return fx(c.kw, 1) + ' KW'; }).join(' / '),
      inv_strings: cs.map(function (c) { return c.nStr; }).join(' + '), inv_kw: kws.join(' + '), n_inv: String(lista.length),
      str_n: smax ? String(smax.n) : '', str_p: smax ? pt(smax.p, 2) : '', str_v: smax ? pt(smax.v, 1) : ''
    });
  }

  /** Comandos de desenho levados a outra escala e posição (ponto → k·ponto + t): blocos, linhas, textos, trechos e pontos. */
  function transformar(lista, k, tx, ty) {
    const P = function (p) { return [k * p[0] + tx, k * p[1] + ty]; };
    return lista.map(function (c) {
      if (c.t === 'forma') return Object.assign({}, c, { m: [k * c.m[0], k * c.m[1], k * c.m[2], k * c.m[3], k * c.m[4] + tx, k * c.m[5] + ty],
        clip: c.clip ? [k * c.clip[0] + tx, k * c.clip[1] + ty, k * c.clip[2] + tx, k * c.clip[3] + ty] : null });
      if (c.t === 'linha') return Object.assign({}, c, { pts: c.pts.map(P), traco: c.traco ? c.traco.map(function (v) { return v * k; }) : null });
      if (c.t === 'texto') return Object.assign({}, c, { oc: Object.assign({}, c.oc, { x: k * c.oc.x + tx, y: k * c.oc.y + ty, s: c.oc.s * k, w: c.oc.w ? c.oc.w * k : c.oc.w }) });
      if (c.t === 'regiao') {
        const w = c.w || (c.bb[2] - c.bb[0]), h = c.h || (c.bb[3] - c.bb[1]), x = k * (c.bb[0] + c.dx) + tx, y = k * (c.bb[1] + c.dy) + ty;
        return Object.assign({}, c, { dx: x - c.bb[0], dy: y - c.bb[1], w: w * k, h: h * k });
      }
      if (c.t === 'branco') return Object.assign({}, c, { r: [k * c.r[0] + tx, k * c.r[1] + ty, k * c.r[2] + tx, k * c.r[3] + ty] });
      if (c.t === 'ponto') return Object.assign({}, c, { x: k * c.x + tx, y: k * c.y + ty, r: c.r * k });
      return c;
    });
  }

  /**
   * Desenho do estilo A com mais de um inversor: um bloco de fileiras por inversor (e os blocos de MPPT dentro dele), o canal de
   * cada inversor até o seu símbolo (o INV1 no lugar do desenho; os outros copiados do modelo abaixo dele, com a sua ligação ao
   * quadro), a tabela de strings com o inversor de cada uma, a tabela do inversor com uma linha por inversor e, nos unifilares,
   * cada inversor com o seu disjuntor na String Box CA, o seu símbolo e os seus campos.
   */
  // ---- "Uma folha só": diagrama de blocos e detalhe do aterramento compactos, nos espaços livres do modelo (acima do croqui e
  // abaixo do detalhe de instalação)
  const BLOCOS_1F = [1280, 1447, 1852, 1648], ATERR_1F = [1192, 36, 1852, 196];
  function compactos1F(pr, lista, cmds) {
    const azul = [0, 0, 1], verde = [0, 0.62, 0], preto = [0, 0, 0], nI = lista.length;
    const tT = { t: 'txt', s: 8.5, fl: 0.95, ang: 0, cor: azul, al: 'l' }, t1 = { t: 'txt', s: 5.2, fl: 0.92, ang: 0, cor: azul, al: 'c' }, t2 = Object.assign({}, t1, { s: 4.3 });
    const em = function (oc, txt, extra) { if (txt) cmds.push({ t: 'texto', txt: txt, oc: Object.assign({}, oc, extra || {}) }); };
    const linha = function (pts, cor) { cmds.push({ t: 'linha', pts: pts, cor: cor || preto, traco: null }); };
    const caixa = function (x, ytop, w, h, l, a, b) {
      linha([[x, ytop], [x + w, ytop], [x + w, ytop - h], [x, ytop - h], [x, ytop]]);
      const n = l.filter(Boolean).length, passo = h / (n + 1);
      l.filter(Boolean).forEach(function (t, i) { em(i === 0 ? (a || t1) : (b || t2), t, { x: x + w / 2, y: ytop - passo * (i + 1) - 1.6, w: w - 5 }); });
    };
    // seta com o rótulo em cima (o trecho) e embaixo (a bitola)
    const seta = function (xa, ya, xb, yb, rot, rot2) {
      linha([[xa, ya], [xb, yb]]);
      const dx = Math.sign(xb - xa), dy = Math.sign(yb - ya), tr = Object.assign({}, t2, { s: 4.0 });
      if (dx) linha([[xb - 5 * dx, yb + 2.4], [xb, yb], [xb - 5 * dx, yb - 2.4]]); else linha([[xb - 2.4, yb - 5 * dy], [xb, yb], [xb + 2.4, yb - 5 * dy]]);
      if (dx) { em(tr, rot, { x: (xa + xb) / 2, y: ya + 3 }); em(tr, rot2, { x: (xa + xb) / 2, y: ya - 7.5 }); }
      else em(tr, [rot, rot2].filter(Boolean).join(' '), { x: xa + 4, y: (ya + yb) / 2 - 1.5, al: 'l' });
    };
    const mm = function (b) { return str(b) ? '#' + str(b) + ' mm2' : ''; };
    const cs = lista.map(function (x) { return calcular(x.p); }), c0 = cs[0];
    const nMod = cs.reduce(function (a, c) { return a + (c.nMod || 0); }, 0), kwp = cs.reduce(function (a, c) { return a + (c.kwp || 0); }, 0);
    const tams = [].concat.apply([], cs.map(function (c) { return c.tam; })), difs = tams.filter(function (v, i, a) { return a.indexOf(v) === i; });
    const ccBit = str(pr.cc.bit), caBit = str(pr.ca.bit), tm = terraMod(pr), tb = str(pr.terraBit) || tm, lig = LIGACOES[pr.ligacao] || '', d = pr.dpsCa || {};
    const nomeInv = function (x) { return [maiusc(x.inv.fab), str(x.inv.modelo)].filter(Boolean).join(' '); };

    // diagrama de blocos: GERADOR FV → STRING BOX CC → INVERSOR → STRING BOX CA na 1ª linha; QGBT ← MEDIDOR ← REDE na 2ª
    const B = BLOCOS_1F, g = 40, w = (B[2] - B[0] - 3 * g) / 4, h = 42, y1 = B[3] - 28, y2 = y1 - h - 40;
    em(tT, 'DIAGRAMA DE BLOCOS', { x: B[0], y: B[3] - 12 });
    const X = [0, 1, 2, 3].map(function (i) { return B[0] + i * (w + g); });
    caixa(X[0], y1, w, h, ['GERADOR FV', nMod + ' x ' + pt(c0.w, 0) + ' Wp = ' + fx(kwp, 2, ',') + ' kWp', tams.length + (tams.length > 1 ? ' strings de ' : ' string de ') + difs.join('/') + ' módulos']);
    caixa(X[1], y1, w, h, ['STRING BOX CC', 'DPS CC' + (str(pr.dpsCcUcpv) ? ' ' + str(pr.dpsCcUcpv) + ' V' : '') + (str(pr.sbCc) ? ' - ' + str(pr.sbCc) : ''), 'terra #' + tm + ' mm2']);
    caixa(X[2], y1, w, h, nI > 1
      ? ['INVERSORES', lista.map(function (x, j) { return 'INV' + (j + 1) + ' ' + pt(cs[j].kw, 2) + ' kW'; }).join(' + '), lista.map(function (x) { return maiusc(x.inv.fab); }).filter(Boolean).join(' + ')]
      : ['INVERSOR INV1', nomeInv(lista[0]), pt(c0.kw, 2) + ' kW - ' + (triInv(lista[0].p) ? 'trifásico' : 'monofásico') + ' ' + pt(c0.vInv, 0) + ' V']);
    const disj = lista.map(function (x, j) { return 'INV' + (j + 1) + ' ' + (str(x.p.disjCa) || '?') + ' A'; }).join(' + ');
    caixa(X[3], y1, w, h, ['STRING BOX CA', (nI > 1 ? 'disjuntores: ' : 'disjuntor: ') + disj, 'DPS CA classe ' + (str(d.classe) || 'II') + (str(d.uc) ? ' - Uc ' + str(d.uc) + ' V' : '')]);
    seta(X[0] + w, y1 - h / 2, X[1], y1 - h / 2, 'CC', mm(ccBit));
    seta(X[1] + w, y1 - h / 2, X[2], y1 - h / 2, 'CC', mm(ccBit));
    seta(X[2] + w, y1 - h / 2, X[3], y1 - h / 2, 'CA', mm(caBit));
    caixa(X[3], y2, w, h, ['QUADRO GERAL (QGBT)', 'disjuntor geral ' + (str(pr.disjGeral) || '?') + ' A', 'cargas da UC - ' + lig]);
    caixa(X[2], y2, w, h, ['MEDIDOR BIDIRECIONAL', 'UC ' + (str(pr.uc) || ''), 'energia injetada e consumida']);
    caixa(X[1], y2, w, h, ['REDE BT DA DISTRIBUIDORA', 'ligação ' + lig, '']);
    seta(X[3] + w / 2, y1 - h, X[3] + w / 2, y2, 'CA', mm(caBit));
    seta(X[3], y2 - h / 2, X[2] + w, y2 - h / 2, 'entrada', mm(pr.entrada.bit));
    seta(X[2], y2 - h / 2, X[1] + w, y2 - h / 2, 'ramal', mm(pr.ramal.bit));

    // aterramento: as massas (módulos, String Box CC, inversores, String Box CA, QGBT) ligadas pelo PE ao BEP, à caixa de
    // inspeção e à haste
    const A = ATERR_1F, ga = 8, bw = 78, ha = 26, ya = A[3] - 26, yBus = ya - ha - 28;
    em(tT, 'DETALHE DO ATERRAMENTO DO SISTEMA', { x: A[0], y: A[3] - 10 });
    const itens = [['MÓDULOS E ESTRUTURA', 'molduras equipotencializadas', tm], ['STRING BOX CC', 'barra PE e DPS CC', tm],
      [nI > 1 ? 'INVERSORES' : 'INVERSOR INV1', 'terminal PE (carcaça)', tb], ['STRING BOX CA', 'barra PE e DPS CA', tb], ['QUADRO GERAL (QGBT)', 'barra de terra / neutro', tb]];
    const tv = Object.assign({}, t2, { s: 4.0, cor: verde, al: 'l', w: null });
    itens.forEach(function (it, i) {
      const x = A[0] + i * (bw + ga), xm = x + bw / 2;
      caixa(x, ya, bw, ha, [it[0], it[1]], Object.assign({}, t1, { s: 4.6 }), Object.assign({}, t2, { s: 3.9 }));
      linha([[xm, ya - ha], [xm, yBus]], verde); cmds.push({ t: 'ponto', x: xm, y: yBus, r: 1.3 });
      em(tv, '#' + it[2] + ' mm2', { x: xm + 3, y: yBus + 9 });
    });
    const xBep = A[0] + 5 * bw + 4 * ga + 18, xH = xBep + 76;
    linha([[A[0] + bw / 2, yBus], [xBep, yBus]], verde);
    linha([[xBep, yBus + 3], [xBep + 50, yBus + 3], [xBep + 50, yBus - 3], [xBep, yBus - 3], [xBep, yBus + 3]]);
    em(Object.assign({}, t1, { s: 5.0, al: 'l' }), 'BEP', { x: xBep, y: yBus + 6 });
    em(Object.assign({}, t2, { s: 3.9, al: 'l' }), '(barramento de equipotencialização principal)', { x: xBep + 17, y: yBus + 6.5, w: A[2] - xBep - 19 });
    const yCx = yBus - 26, yChao = yCx - 6;
    linha([[xBep + 50, yBus], [xH, yBus], [xH, yCx]], verde);
    em(tv, 'aterramento #' + tb + ' mm2', { x: xH + 4, y: yBus - 13 });
    linha([[xH - 11, yCx], [xH + 11, yCx], [xH + 11, yCx - 20], [xH - 11, yCx - 20], [xH - 11, yCx]]);
    linha([[xH - 40, yChao], [xH - 11, yChao]]); linha([[xH + 11, yChao], [xH + 40, yChao]]);
    for (let i = 0; i < 6; i++) { const xh = xH - 38 + i * 15; if (Math.abs(xh - xH) > 12) linha([[xh, yChao], [xh - 4, yChao - 4]]); }
    const yP = Math.max(A[1] + 4, yCx - 20 - 40);
    linha([[xH - 1, yCx - 20], [xH - 1, yP + 5], [xH, yP], [xH + 1, yP + 5], [xH + 1, yCx - 20]]);
    const tl = Object.assign({}, t2, { s: 3.9, al: 'l' });
    em(tl, 'caixa de inspeção', { x: xH + 44, y: yCx - 8, w: A[2] - xH - 46 });
    em(tl, str(pr.cxInspecao), { x: xH + 44, y: yCx - 16, w: A[2] - xH - 46 });
    em(tl, 'haste ' + (str(pr.haste) || ''), { x: xH + 5, y: yP + 6, w: A[2] - xH - 7 });
    const notas = ['Massas metálicas (molduras, estruturas, carcaças dos inversores e quadros) interligadas ao BEP pelo condutor de',
      'proteção (PE), verde ou verde-amarelo - NBR 5410 e NBR 16690. Módulos #' + tm + ' mm2, terra do circuito CA #' + tb + ' mm2.'];
    notas.forEach(function (t, i) { em(Object.assign({}, tl, { s: 4.0 }), t, { x: A[0], y: yBus - 22 - i * 9, w: xBep - A[0] - 12 }); });
  }

  function desenhoMultiA(pr, campos, G, lista, folha) {
    let cmds = [];
    const preto = [0, 0, 0], roxo = [0.498, 0, 1];
    cmds.desloc = [];
    const forma = function (nome, ox, oy, nx, ny, s, clip) { cmds.push({ t: 'forma', nome: nome, m: [s, 0, 0, s, nx - s * ox, ny - s * oy], clip: clip || null }); };
    const linha = function (pts, cor, traco) { cmds.push({ t: 'linha', pts: pts, cor: cor || preto, traco: traco || null }); };
    const texto = function (oc, txt, ox, oy, nx, ny, s) {
      if (!oc || !txt) return;
      cmds.push({ t: 'texto', txt: txt, oc: Object.assign({}, oc, { x: nx + s * (oc.x - ox), y: ny + s * (oc.y - oy), s: oc.s * s, w: oc.w ? oc.w * s : oc.w }) });
    };
    const em = function (oc, txt, extra) { if (oc && txt) cmds.push({ t: 'texto', txt: txt, oc: Object.assign({}, oc, extra || {}) }); };
    const regiao = function (bb, dx, dy) { cmds.push({ t: 'regiao', bb: bb, dx: dx, dy: dy }); };
    const branco = function (r) { cmds.push({ t: 'branco', r: r }); };
    const ponto = function (x, y) { cmds.push({ t: 'ponto', x: x, y: y, r: 1.3 }); };
    const um = function (k) { return campos[k] && campos[k][0]; };
    const oc = function (k, i) { return campos[k] && campos[k][i || 0]; };
    const F = G.fileira, R = G.ramal, K = G.coluna, T = G.tabela, nI = lista.length;
    const cs = lista.map(function (x) { return calcular(x.p); });
    const c0 = cs[0], w = c0.w > 0 ? pt(c0.w, 1) : '', bit = str(pr.cc.bit);
    // strings de todas, numeradas em sequência: STR1… do INV1, depois as do INV2…
    const todas = [];
    cs.forEach(function (c, j) {
      let g = 0, ini = 0;
      const grupos = c.grupos.length ? c.grupos : [c.tam.length];
      grupos.forEach(function (ng, m) { for (let i = 0; i < ng; i++) todas.push({ j: j, m: m, n: c.tam[ini + i], s: c.strings[ini + i], p: lista[j].p }); ini += ng; g++; });
    });
    const N = todas.length;
    todas.forEach(function (x, i) { x.k = i; x.rot = 'STR' + (i + 1); });

    // ---- coluna de textos: tabela de strings (cresce), tabela do inversor com uma linha por inversor (cresce) e o resto desce
    const ext = T.passo * (nI - 1), req = (Math.max(N, 1) - 1) * T.passo + T.passo / 1.4 + 4.01;
    const desce = K ? Math.max(0, Math.min(K.livre - ext, req - (T.topo - T.fundo))) : 0;
    const fundo = T.fundo - desce, CORTE = 250;
    const XI = [188.8, 255.6, 315.0, 374.4, 418.9, 500.6, 604.6, 678.8, 768.0, 842.2, 909.0, 983.3, 1050.1, 1117.0];
    if (K) {
      forma('CRMSec2', 0, 0, 0, 0, 1);
      K.xs.forEach(function (x) { linha([[x, K.topo], [x, K.cheias.indexOf(x) >= 0 ? K.total - desce : K.corpo - desce]]); });
      forma('CRMBaixo', 0, 0, 0, -desce, 1, [100, CORTE - desce, 1200, K.corpo + 1 - desce]);
      forma('CRMBaixo', 0, 0, 0, -desce - ext, 1, [100, 20, 1200, CORTE - desce - ext]);
      XI.forEach(function (x) { linha([[x, CORTE - desce], [x, CORTE - desce - ext]]); });
      cmds.desloc = [{ x: 1160, y: K.corpo + 0.6, dy: -desce }, { x: 1160, y: CORTE, dy: -desce - ext }];
      // linhas do INV2… na tabela do inversor
      const ocN = um('ti_nstr');
      for (let j = 1; j < nI; j++) {
        const y = 258.4 - desce - j * T.passo, vj = valores(lista[j].p, 'A');
        em(ocN, 'INV' + (j + 1), { x: (188.8 + 255.6) / 2, y: y, w: 60 });
        ['ti_nstr', 'ti_nmod', 'ti_efic', 'ti_kw', 'ti_v', 'ti_fp', 'ti_i', 'ti_cabo', 'ti_un', 'ti_dist', 'ti_dv', 'ti_pct'].forEach(function (k) { em(um(k), vj[k], { y: y }); });
      }
    }
    // tabela de strings: uma linha por string, com o inversor dela
    const rotTab = um('_tab_str'), H0 = 7.48;
    const livreT = T.topo - fundo - 4, sp = N > 1 ? Math.min(T.passo, livreT / (N - 1 + 1 / 1.4)) : T.passo;
    const st = Math.min(1, sp / 1.4 / H0), altB = (N - 1) * sp + H0 * st, baseFundo = (T.topo + fundo) / 2 - altB / 2;
    todas.forEach(function (x, i) {
      const y = baseFundo + (N - 1 - i) * sp, l = linhaTabela(x.p, x.s);
      if (rotTab) cmds.push({ t: 'texto', txt: (nI > 1 ? 'INV' + (x.j + 1) + '-' : '') + x.rot, oc: Object.assign({}, rotTab, { y: y, s: rotTab.s * st }) });
      COLUNAS.forEach(function (k) { const o = um('t1_' + k); if (o && l[k]) cmds.push({ t: 'texto', txt: l[k], oc: Object.assign({}, o, { y: y, s: o.s * st }) }); });
    });
    // linha separando os inversores na tabela de strings
    let nAc = 0;
    cs.slice(0, -1).forEach(function (c) { nAc += c.tam.length; const y = baseFundo + (N - nAc) * sp - sp * 0.32; linha([[K ? K.xs[0] : 188.8, y], [K ? K.xs[K.xs.length - 1] : 975.8, y]], [0.6, 0.6, 0.6]); });

    // ---- fileiras: o INV1 em cima, depois o INV2…; dentro de cada inversor, STR de número menor embaixo; folga entre MPPTs e
    // folga maior entre inversores. F: a área das fileiras; avulso: desenho para a folha das strings (o INV1 e o quadro também
    // copiados do modelo, na altura das fileiras dele). Devolve os limites do desenho.
    function layoutStrings(F, avulso) {
    const ordem = [];
    for (let j = 0; j < nI; j++) todas.filter(function (x) { return x.j === j; }).reverse().forEach(function (x) { ordem.push(x); });
    const folgaB = 0.55 * F.passoY, folgaI = 1.1 * F.passoY;
    let altTot = N * F.alt + (N - 1) * (F.passoY - F.alt);
    for (let i = 1; i < N; i++) altTot += ordem[i].j !== ordem[i - 1].j ? folgaI : (ordem[i].m !== ordem[i - 1].m ? folgaB : 0);
    const nmax = Math.max.apply(null, todas.map(function (x) { return x.n; }));
    const s = Math.min(1, (F.xmax - F.x0) / ((nmax - 1) * F.passo + F.larg), (F.topo - F.base) / altTot);
    const xu = F.x0 + F.ultimo * F.passo, sg = Math.min(1, 1.5 * s);
    let yAt = F.topo - F.alt * s;
    ordem.forEach(function (x, i) {
      if (i > 0) yAt -= F.passoY * s + (x.j !== ordem[i - 1].j ? folgaI : (x.m !== ordem[i - 1].m ? folgaB : 0)) * s;
      x.oy = yAt;
    });
    todas.forEach(function (x) {
      const oy = x.oy, bitx = str(x.p.cc.bit);
      for (let j = 0; j < x.n; j++) forma('CRMMod', F.x0, F.y0, F.x0 + j * F.passo * s, oy, s);
      forma('CRMDps', F.x0, F.y0, F.x0, oy, s);
      for (let j = 0; j < x.n - 1; j++) {
        const nx = F.x0 + j * F.passo * s;
        forma('CRMElo', F.x0, F.y0, nx, oy, s);
        texto(um('_elo_str'), x.rot, F.x0, F.y0, nx, oy, s);
        texto(um('_elo_bit'), bitx ? '#' + bitx : '', F.x0, F.y0, nx, oy, s);
      }
      const xf = F.x0 + (x.n - 1) * F.passo * s;
      forma('CRMFim', xu, F.y0, xf, oy, s);
      const yr = oy + s * (F.ret[1] - F.y0);
      linha([[F.x0 + s * (F.ret[0] - F.x0), yr], [xf + s * (F.ret[2] - xu), yr]]);
      x.ent = [F.x0 + s * (F.entrada[0] - F.x0), oy + s * (F.entrada[1] - F.y0)];
    });
    // posição de cada inversor: o INV1 no lugar do desenho (na folha das strings, como os outros); os outros na altura média
    // das suas fileiras (abaixo do anterior)
    const medio = function (j) { const ys = todas.filter(function (x) { return x.j === j; }).map(function (x) { return x.ent[1]; }); return ys.reduce(function (a, b) { return a + b; }, 0) / ys.length; };
    const y0s = [avulso ? medio(0) : R.p0[1]];
    for (let j = 1; j < nI; j++) {
      const ys = todas.filter(function (x) { return x.j === j; }).map(function (x) { return x.ent[1]; });
      const med = ys.reduce(function (a, b) { return a + b; }, 0) / ys.length;
      y0s.push(Math.min(med, y0s[j - 1] - 30));
    }
    const xa = 640, xb = R.ancora[0] - 14, xc = xa - 12, traco = [6, 3];
    for (let j = 0; j < nI; j++) {
      const y0 = y0s[j], p0 = [R.p0[0], y0], q = [R.p0[0] + 36, y0];
      const minhas = todas.filter(function (x) { return x.j === j; });
      const acima = minhas.filter(function (x) { return x.ent[1] >= y0; }).sort(function (a, b) { return b.ent[1] - a.ent[1]; });
      const abaixo = minhas.filter(function (x) { return x.ent[1] < y0; }).sort(function (a, b) { return a.ent[1] - b.ent[1]; });
      const dx = Math.min(10, (xb - xa) / Math.max(acima.length, abaixo.length, 1)), db = Math.min(3, 30 / Math.max(minhas.length, 1));
      const rota = function (x, i, nivel) {
        const e = x.ent, xp = xa + i * dx;
        linha([e, [xp, e[1]], [xp, nivel], [xc, nivel], q, p0], preto, traco);
        forma('CRMRam', R.ancora[0], R.ancora[1], R.ancora[0], e[1], sg);
        texto(um('_ram_str'), x.rot, R.ancora[0], R.ancora[1], R.ancora[0], e[1], sg);
        (campos._ram_bit || []).forEach(function (o, k) { const b = k === 0 ? str(x.p.cc.bit) : terraMod(pr); texto(o, b ? '#' + b : '', R.ancora[0], R.ancora[1], R.ancora[0], e[1], sg); });
      };
      acima.forEach(function (x, i) { rota(x, i, y0 + (acima.length - 1 - i) * db); });
      abaixo.forEach(function (x, i) { rota(x, i, y0 - (abaixo.length - i) * db); });
      // colchetes dos MPPTs do inversor
      const gs = cs[j].grupos.length ? cs[j].grupos : [cs[j].tam.length];
      gs.forEach(function (ng, m) {
        const rows = minhas.filter(function (x) { return x.m === m; });
        if (!rows.length) return;
        const yb = Math.min.apply(null, rows.map(function (x) { return x.oy; })) - 1, yt = Math.max.apply(null, rows.map(function (x) { return x.oy; })) + F.alt * s + 1, xk = F.x0 - 6;
        linha([[xk + 3, yb], [xk, yb], [xk, yt], [xk + 3, yt]]);
        const sm = Math.min(1, 1.6 * s), o = um('_ram_str') || { t: 'txt', s: 5.66, fl: 0.9, ang: 0, cor: preto, al: 'l' };
        cmds.push({ t: 'texto', txt: 'MPPT' + (m + 1), oc: Object.assign({}, o, { x: xk - 2.2, y: (yb + yt) / 2 - 8.2 * sm, s: o.s * sm, ang: 90, al: 'l', w: null }) });
      });
      if (j === 0 && !avulso) continue;
      // INV2… (e, na folha das strings, o INV1 com o quadro): cópia do trecho do modelo (linha do quadro, T, símbolo do
      // inversor) na altura dele, ligada à linha do quadro
      const dy = y0 - R.p0[1], vj = valores(lista[j].p, 'A');
      if (j === 0) regiao([400, 755, 600, 790], 0, dy);
      else {
        regiao([433.5, 755, 600, 790], 0, dy);
        linha([[433.5, 772.7 + y0s[j - 1] - R.p0[1]], [433.5, 772.7 + dy]]);
        branco([468.5, 779.3 + dy, 486, 787 + dy]); branco([569, 771.6 + dy, 586, 778.6 + dy]);
        const oR = { t: 'txt', s: 5.66, fl: 0.92, ang: 0, cor: preto, al: 'l' };
        em(oR, 'INV' + (j + 1), { x: 469.6, y: 780.1 + dy }); em(oR, 'INV' + (j + 1), { x: 569.9, y: 772.2 + dy });
      }
      const Kc = G.condutores;
      if (Kc) letrasInv(lista[j].p).forEach(function (l, i) { const x = Kc.h.xF - i * Kc.h.passo; if (l === 'N') forma('CRMTickN', Kc.h.xN, 0, x, dy, 1); else forma('CRMTickF', Kc.h.xF, 0, x, dy, 1); });
      em(um('bit_ca_lig'), vj.bit_ca_lig, { y: 758.3 + dy }); em(um('bit_terra_lig'), vj.bit_terra_lig, { y: 758.0 + dy });
      em(oc('inv_kw_cad', 1), vj.inv_kw_cad ? vj.inv_kw_cad : (cs[j].kw > 0 ? pt(cs[j].kw, 2) + 'KW' : ''), { y: 779.2 + dy });
      em(um('inv_logo'), maiusc(lista[j].inv.fab), { y: 760.2 + dy });
    }
    const xs = todas.map(function (x) { return F.x0 + x.n * F.passo * s; }), ys = todas.map(function (x) { return x.oy; });
    return { x0: 398, x1: Math.max.apply(null, xs) + 6, y0: Math.min.apply(null, ys.concat(y0s)) - 22, y1: Math.max.apply(null, ys.concat(y0s)) + F.alt * s + 16 };
    }

    const Kc = G.condutores;
    if (folha === 2) return folhaStrings();
    if (folha === 1) {
      // folha 1 de 2: sem o desenho das strings (vai para a folha 2); no lugar, a indicação da folha e o resumo dos inversores
      branco([398, 757, 1850, 830]); branco([440, 624, 1850, 830]); branco(DETALHE_INST);
      cmds.pularOc = { inv_kw_cad: [1] }; cmds.pular = ['inv_logo', 'bit_ca_lig', 'bit_terra_lig']; cmds.pularRegiao = DETALHE_INST;
      const oT = { t: 'txt', s: 12, fl: 0.95, ang: 0, cor: [0, 0, 1], al: 'c' };
      em(oT, 'LAYOUT DAS STRINGS, DIAGRAMA DE BLOCOS E DETALHES: VER PRANCHA 2/2', { x: 1140, y: 760 });
      resumoInversores().forEach(function (t, i) { em(Object.assign({}, oT, { s: 7.48 }), t, { x: 1140, y: 728 - i * 15 }); });
      // croqui de localização ao lado das tabelas (no espaço do detalhe de instalação), ampliado e longe dos diagramas; os campos
      // dele (ruas e selo) vão junto
      const C = CROQUI.r, kc = CROQUI.k, tcx = CROQUI.centro[0] - kc * (C[0] + C[2]) / 2, tcy = CROQUI.centro[1] - kc * (C[1] + C[3]) / 2;
      branco(C);
      cmds.push({ t: 'regiao', bb: C, dx: kc * C[0] + tcx - C[0], dy: kc * C[1] + tcy - C[1], w: (C[2] - C[0]) * kc, h: (C[3] - C[1]) * kc });
      cmds.moverRegiao = { r: C, k: kc, tx: tcx, ty: tcy };
      folhaNum('1/2');
    } else layoutStrings(F, false);
    // condutores do circuito CA do INV1 (fiação e os dois pontos do unifilar simplificado)
    if (Kc) {
      if (folha !== 1) letrasInv(lista[0].p).forEach(function (l, i) { const x = Kc.h.xF - i * Kc.h.passo; if (l === 'N') forma('CRMTickN', Kc.h.xN, 0, x, 0, 1); else forma('CRMTickF', Kc.h.xF, 0, x, 0, 1); });
      Kc.v.forEach(function (pv, k) {
        (k === 0 ? letrasUC(pr) : letrasInv(lista[0].p)).forEach(function (l, i) { const y = pv.y - i * pv.passo; if (l === 'N') forma('CRMTickNh', 0, Kc.yN, 0, y, 1); else forma('CRMTickFh', 0, Kc.yF, 0, y, 1); });
      });
    }

    // ---- unifilar simplificado: cada inversor com o seu disjuntor dentro da String Box CA, o seu símbolo e os seus campos
    // (até 2 inversores: o croqui e o unifilar principal limitam a largura)
    unifilaresMulti(Math.min(nI, 2));
    if (pr.ligacao === 'tri') multifilarTri(pr, lista, cmds);
    // uma folha só: o diagrama de blocos e o detalhe do aterramento compactos nos espaços livres
    if (!folha) compactos1F(pr, lista, cmds);
    return cmds;

    // número da folha no carimbo (no lugar do "1/1" do modelo)
    function folhaNum(t) {
      branco([2280, 43.5, 2316, 64]);
      cmds.push({ t: 'texto', txt: t, oc: { t: 'tt', x: 2282.0, y: 46.7, s: 19.8, ang: 0, f: 'A', cor: [0.247, 0, 1], al: 'l' } });
    }
    // ---- diagrama de blocos do sistema: gerador FV, String Box CC e inversor de cada um; String Box CA, QGBT (com as cargas),
    // medidor bidirecional e a rede da distribuidora
    function diagramaBlocos(x0, y0, x1, y1) {
      const azul = [0, 0, 1], t1 = { t: 'txt', s: 6.0, fl: 0.92, ang: 0, cor: azul, al: 'c' }, t2 = Object.assign({}, t1, { s: 4.7 });
      em({ t: 'txt', s: 11, fl: 0.95, ang: 0, cor: azul, al: 'l' }, 'DIAGRAMA DE BLOCOS', { x: x0, y: y1 - 22 });
      const bh = 40, gap = 24, cx = (x0 + x1) / 2 - 40, n2 = Math.min(nI, 3);
      const bw = Math.min(170, (440 - 16 * (n2 - 1)) / n2), largM = Math.max(260, n2 * bw + (n2 - 1) * 16);
      const caixa = function (xc, ytop, w, l) {
        linha([[xc - w / 2, ytop], [xc + w / 2, ytop], [xc + w / 2, ytop - bh], [xc - w / 2, ytop - bh], [xc - w / 2, ytop]]);
        l.forEach(function (t, i) { if (t) em(i === 0 ? t1 : t2, t, { x: xc, y: ytop - 12 - i * 10, w: w - 6 }); });
      };
      const seta = function (x, ya, yb, rot) {
        linha([[x, ya], [x, yb]]); linha([[x - 2.6, yb + 5], [x, yb], [x + 2.6, yb + 5]]);
        if (rot) em(t2, rot, { x: x + 9, y: (ya + yb) / 2 - 2, al: 'l', w: null });
      };
      const xs = Array.from({ length: n2 }, function (_, j) { return cx + (j - (n2 - 1) / 2) * (bw + 16); });
      let y = y1 - 46;
      const ccBit = str(pr.cc.bit), caBit = str(pr.ca.bit), tm = terraMod(pr);
      xs.forEach(function (x, j) {
        const c = cs[j], p = lista[j].p;
        caixa(x, y, bw, ['GERADOR FV - INV' + (j + 1), c.nMod + ' x ' + pt(c.w, 0) + ' Wp = ' + fx(c.kwp, 2, ',') + ' kWp', c.nStr + ' strings (' + c.tam.join(' + ') + ')']);
        seta(x, y - bh, y - bh - gap, ccBit ? 'CC #' + ccBit : 'CC');
        caixa(x, y - bh - gap, bw, ['STRING BOX CC', 'DPS CC' + (str(pr.dpsCcUcpv) ? ' ' + str(pr.dpsCcUcpv) + ' V' : '') + ' - ' + (str(pr.sbCc) || ''), 'terra #' + tm + ' mm2']);
        seta(x, y - 2 * bh - gap, y - 2 * bh - 2 * gap, ccBit ? 'CC #' + ccBit : 'CC');
        caixa(x, y - 2 * bh - 2 * gap, bw, ['INVERSOR INV' + (j + 1), [maiusc(lista[j].inv.fab), str(lista[j].inv.modelo)].filter(Boolean).join(' '),
          pt(c.kw, 2) + ' kW - ' + (triInv(p) ? 'trifásico' : 'monofásico') + ' ' + pt(c.vInv, 0) + ' V']);
      });
      // os inversores se juntam na String Box CA
      const yCA = y - 3 * bh - 3 * gap, yJ = yCA + gap / 2;
      xs.forEach(function (x, j) { linha([[x, y - 3 * bh - 2 * gap], [x, yJ]]); em(t2, 'CA #' + (str(lista[j].p.ca.bit) || caBit), { x: x + 9, y: yJ + 4, al: 'l', w: null }); });
      if (n2 > 1) linha([[xs[0], yJ], [xs[n2 - 1], yJ]]);
      seta(cx, yJ, yCA);
      const disj = lista.slice(0, n2).map(function (x, j) { return 'INV' + (j + 1) + ' ' + (str(x.p.disjCa) || '?') + ' A'; }).join(' + ');
      const d = pr.dpsCa || {};
      caixa(cx, yCA, largM, ['STRING BOX CA', (n2 > 1 ? 'disjuntores: ' : 'disjuntor: ') + disj, 'DPS CA classe ' + (str(d.classe) || 'II') + (str(d.uc) ? ' - Uc ' + str(d.uc) + ' V' : '') + (str(d.in) ? ' - In ' + str(d.in) + ' kA' : '')]);
      const yQ = yCA - bh - gap;
      seta(cx, yCA - bh, yQ, 'CA');
      caixa(cx, yQ, largM, ['QUADRO GERAL (QGBT)', 'disjuntor geral ' + (str(pr.disjGeral) || '?') + ' A', 'ligação ' + (LIGACOES[pr.ligacao] || '') + ' - entrada ' + (str(pr.entrada.bit) || '?') + ' mm2']);
      // cargas da instalação ao lado do QGBT
      const xC = cx + largM / 2 + 18 + 60;
      linha([[cx + largM / 2, yQ - bh / 2], [xC - 60, yQ - bh / 2]]);
      caixa(xC, yQ, 120, ['CARGAS DA UC', 'consumo da instalação', '']);
      const yM = yQ - bh - gap;
      seta(cx, yQ - bh, yM, 'CA');
      caixa(cx, yM, largM, ['MEDIDOR BIDIRECIONAL', 'UC ' + (str(pr.uc) || ''), 'energia injetada e consumida']);
      const yR = yM - bh - gap;
      seta(cx, yM - bh, yR, 'ramal ' + (str(pr.ramal.bit) || '?') + ' mm2');
      caixa(cx, yR, largM, ['REDE BT DA DISTRIBUIDORA', 'ligação ' + (LIGACOES[pr.ligacao] || ''), '']);
    }
    // ---- detalhe da ligação do aterramento: as massas de cada equipamento ligadas pelo condutor de proteção (PE) ao BEP, a
    // caixa de inspeção e a haste
    function detalheAterramento(x0, y0, x1, y1) {
      const azul = [0, 0, 1], verde = [0, 0.62, 0], t1 = { t: 'txt', s: 5.6, fl: 0.92, ang: 0, cor: azul, al: 'l' }, t2 = Object.assign({}, t1, { s: 4.6 });
      em({ t: 'txt', s: 11, fl: 0.95, ang: 0, cor: azul, al: 'l' }, 'DETALHE DO ATERRAMENTO DO SISTEMA', { x: x0, y: y1 - 22 });
      const tm = terraMod(pr), tb = str(pr.terraBit) || tm;
      const itens = [
        ['MOLDURAS E ESTRUTURA DOS MÓDULOS', 'equipotencialização das molduras', '#' + tm],
        ['STRING BOX CC', 'barra PE e DPS CC', '#' + tm],
        [(nI > 1 ? 'INVERSORES ' : 'INVERSOR ') + lista.map(function (_, j) { return 'INV' + (j + 1); }).join(' / '), 'terminal PE (carcaça)', '#' + tb],
        ['STRING BOX CA', 'barra PE e DPS CA', '#' + tb],
        ['QUADRO GERAL (QGBT)', 'barra de terra / neutro', '#' + tb]
      ];
      // barramento de proteção afastado da borda: os rótulos da caixa de inspeção e da haste cabem antes do detalhe de instalação
      const xBus = x1 - 165, yTop = y1 - 52, passo = 48, bw = xBus - x0 - 70;
      itens.forEach(function (it, i) {
        const yt = yTop - i * passo, ym = yt - 15;
        linha([[x0, yt], [x0 + bw, yt], [x0 + bw, yt - 30], [x0, yt - 30], [x0, yt]]);
        em(t1, it[0], { x: x0 + 5, y: yt - 12, w: bw - 8 }); em(t2, it[1], { x: x0 + 5, y: yt - 23, w: bw - 8 });
        linha([[x0 + bw, ym], [xBus, ym]], verde); cmds.push({ t: 'ponto', x: xBus, y: ym, r: 1.6 });
        em(Object.assign({}, t2, { cor: verde }), it[2] + ' mm2', { x: x0 + bw + 8, y: ym + 3 });
      });
      // condutor de proteção até o BEP; do BEP à caixa de inspeção e à haste
      const yBep = yTop - itens.length * passo - 18;
      linha([[xBus, yTop - 15], [xBus, yBep]], verde);
      linha([[xBus - 40, yBep], [xBus + 40, yBep]]); linha([[xBus - 40, yBep - 4], [xBus + 40, yBep - 4]]);
      linha([[xBus - 40, yBep], [xBus - 40, yBep - 4]]); linha([[xBus + 40, yBep], [xBus + 40, yBep - 4]]);
      em(t1, 'BEP', { x: xBus - 40, y: yBep + 4 }); em(t2, 'barramento de equipotencialização principal', { x: x0, y: yBep - 2, w: xBus - 45 - x0 });
      const yCx = yBep - 34, yChao = yCx - 8;
      linha([[xBus, yBep - 4], [xBus, yCx]], verde);
      em(Object.assign({}, t2, { cor: verde }), 'condutor de aterramento #' + tb + ' mm2', { x: xBus + 6, y: yBep - 20 });
      linha([[xBus - 22, yCx], [xBus + 22, yCx], [xBus + 22, yCx - 26], [xBus - 22, yCx - 26], [xBus - 22, yCx]]);
      // nível do solo (hachura) e a haste
      linha([[xBus - 60, yChao], [xBus - 22, yChao]]); linha([[xBus + 22, yChao], [xBus + 60, yChao]]);
      for (let i = 0; i < 9; i++) { const xh = xBus - 58 + i * 13.5; if (Math.abs(xh - xBus) > 24) linha([[xh, yChao], [xh - 5, yChao - 5]]); }
      const yH = yCx - 26, yP = yH - 70;
      linha([[xBus - 1.2, yH], [xBus - 1.2, yP + 6], [xBus, yP], [xBus + 1.2, yP + 6], [xBus + 1.2, yH]]);
      em(t2, 'caixa de inspeção ' + (str(pr.cxInspecao) || ''), { x: xBus + 26, y: yCx - 14 });
      em(t2, 'haste de aterramento ' + (str(pr.haste) || ''), { x: xBus + 6, y: yP + 22 });
      // observações
      const notas = ['Todas as massas metálicas (molduras, estruturas, carcaças dos inversores e quadros) interligadas ao BEP',
        'pelo condutor de proteção (PE), na cor verde ou verde-amarela - NBR 5410 (6.4) e NBR 16690.',
        'Bitolas: aterramento dos módulos #' + tm + ' mm2, terra do circuito CA #' + tb + ' mm2.'];
      notas.forEach(function (t, i) { em(t2, t, { x: x0, y: Math.max(y0 + 20, yP - 22) - i * 9, w: x1 - x0 }); });
    }
    // uma linha por inversor: modelo, potência, módulos, strings e MPPTs
    function resumoInversores() {
      return lista.map(function (x, j) {
        const c = cs[j];
        return 'INV' + (j + 1) + ': ' + [maiusc(x.inv.fab), str(x.inv.modelo)].filter(Boolean).join(' - ') + '  |  ' + pt(c.kw, 2) + ' kW  |  ' + c.nMod + ' módulos  |  ' +
          c.nStr + ' strings (' + c.tam.join(' + ') + ')' + (c.grupos.length > 1 ? '  |  por MPPT: ' + c.grupos.join(' + ') : '');
      });
    }
    // folha 2 de 2: só o desenho das strings, ampliado para a área de desenho (o resto da página em branco; entram só os campos
    // do carimbo e das legendas, à direita)
    function folhaStrings() {
      // (a folha começa vazia: as tabelas e os diagramas ficam na folha 1)
      cmds = [];
      const nmaxV = Math.max.apply(null, todas.map(function (x) { return x.n; }));
      const Fv = Object.assign({}, F, { xmax: F.x0 + (nmaxV - 1) * F.passo + F.larg, base: -100000 });
      const lim = layoutStrings(Fv, true);
      const virt = cmds;
      cmds = [];
      cmds.soCarimbo = true; cmds.manterRegiao = DETALHE_INST;
      // tudo em branco, menos o detalhe de instalação do modelo (fica no mesmo lugar, embaixo à direita)
      const D = DETALHE_INST;
      branco([72, D[3], 1861.8, 1654]); branco([72, 29.6, 1861.8, D[1]]); branco([72, D[1], D[0], D[3]]); branco([D[2], D[1], 1861.8, D[3]]);
      diagramaBlocos(100, 60, 680, D[3]);
      detalheAterramento(705, 60, D[0] - 15, D[3]);
      // título e resumo logo acima do desenho; o conjunto centrado na altura da folha
      const area = [110, DETALHE_INST[3] + 40, 1840, 1630], cab = 50 + 15 * nI;
      const k = Math.min(2.2, (area[2] - area[0]) / (lim.x1 - lim.x0), (area[3] - area[1] - cab) / (lim.y1 - lim.y0));
      const hd = k * (lim.y1 - lim.y0), topo = (area[1] + area[3]) / 2 + (hd + cab) / 2;
      const tx = (area[0] + area[2]) / 2 - k * (lim.x0 + lim.x1) / 2, ty = topo - cab - k * lim.y1;
      transformar(virt, k, tx, ty).forEach(function (c) { cmds.push(c); });
      const oT = { t: 'txt', s: 14, fl: 0.95, ang: 0, cor: [0, 0, 1], al: 'l' }, xT = Math.max(area[0], tx + k * lim.x0);
      em(oT, 'LAYOUT DAS STRINGS', { x: xT, y: topo - 14 });
      resumoInversores().forEach(function (t, i) { em(Object.assign({}, oT, { s: 8.5 }), t, { x: xT + 2, y: topo - 36 - i * 15 }); });
      folhaNum('2/2');
      return cmds;
    }
    function unifilaresMulti(nI) {
    const S = G.uniS, cfS = campos.campo_fv && campos.campo_fv[2];
    const xI = [S.xInv].concat(Array.from({ length: nI - 1 }, function (_, j) { return S.xInv + 77.35 * (j + 1); }));
    const xBox = xI[nI - 1] + 32;
    if (nI > 1) {
      branco([965.9, 1163, 968.5, 1275.4]);
      linha([[967.2, 1274.0], [xBox, 1274.0], [xBox, 1164.4], [967.2, 1164.4]], roxo, [12.6, 6.3]);
    }
    // faixas dos campos de cada inversor, proporcionais ao número de strings
    const nTot = todas.filter(function (x) { return x.j < nI; }).length, faixa = [800, 1055], gap = 22;
    let xIni = faixa[0];
    for (let j = 0; j < nI; j++) {
      const minhas = todas.filter(function (x) { return x.j === j; }), nj = minhas.length;
      const larg = (faixa[1] - faixa[0] - gap * (nI - 1)) * nj / nTot, a = xIni, b = xIni + larg;
      xIni = b + gap;
      const p = Math.min(S.passo, larg / Math.max(nj, 1)), su = Math.min(1, p / S.larg);
      const xs = minhas.map(function (_, i) { return a + p * (i + 0.5); });
      const xInv = xI[j];
      if (nj > 1 || Math.abs(xs[0] - xInv) > 0.5) linha([[Math.min(xs[0], xInv), S.yBus], [Math.max(xs[nj - 1], xInv), S.yBus]]);
      xs.forEach(function (x, i) {
        const st = minhas[i];
        forma('CRMRamS', S.x, S.yBus, x, S.yBus, su);
        texto(um('_uS_campo'), 'Campo Fotov.', S.x, S.yBus, x, S.yBus, su);
        texto(cfS, w ? st.n + 'x' + w + 'W' : '', S.x, S.yBus, x, S.yBus, su);
        texto(um('_uS_str'), st.rot, S.x, S.yBus, x, S.yBus, su);
        texto(um('_uS_bit'), bit ? '#' + bit : '', S.x, S.yBus, x, S.yBus, su);
      });
      if (j === 0) continue;
      const d = xInv - S.xInv, vj = valores(lista[j].p, 'A');
      regiao([906, 1183, 940, 1243], d, 0);                       // disjuntor
      linha([[S.xInv, 1256], [xInv, 1256], [xInv, 1243]]); ponto(S.xInv, 1256);
      linha([[xInv, 1183], [xInv, 1056]]);
      regiao([926, 1137, 937, 1147], d, 0);                       // T verde
      if (Kc) letrasInv(lista[j].p).forEach(function (l, i) { const y = Kc.v[1].y - i * Kc.v[1].passo; forma(l === 'N' ? 'CRMTickNh' : 'CRMTickFh', 0, l === 'N' ? Kc.yN : Kc.yF, d, y, 1); });
      regiao([905, 1020, 940, 1057], d, 0);                       // símbolo do inversor
      linha([[xInv, 1020.5], [xInv, S.yBus]]);
      em(oc('disj_ca_a', 0), vj.disj_ca_a, { x: 909.2 + d });
      em(oc('bit_ca_marca', 0), str(lista[j].p.ca.bit) ? '#' + str(lista[j].p.ca.bit) : '', { x: 938.2 + d });
      em(oc('inv_kw_cad', 2), cs[j].kw > 0 ? pt(cs[j].kw, 2) + 'KW' : '', { x: 905.0 + d });
      em(oc('inv_kw_cad', 2), 'INV' + (j + 1), { x: 898.6 + d, y: 1033.2 });
      em(oc('inv_nome', 2), [maiusc(lista[j].inv.fab), str(lista[j].inv.modelo)].filter(Boolean).join(' - '), { x: 949.6 + d, w: null });
    }

    // ---- unifilar principal: o INV1 no lugar do desenho; os outros à direita, com o disjuntor na mesma String Box CA
    const V = G.uniU, cf = campos.campo_fv || [], uc = campos._uU_campo || [];
    // o 2º inversor fica à direita da String Box CA (o croqui começa em x ≈ 1400 nessa altura)
    const tri2 = pr.ligacao === 'tri' && nI > 1 && triInv(lista[1].p), DX = 150, xBoxD = Math.max(1295.4, 1190.64 + DX * (nI - 1) + 32 + (tri2 ? MF.d : 0));
    if (nI > 1) {
      branco([1294.2, 1080.5, 1296.6, 1190.5]);
      linha([[1295.4, 1188.7], [xBoxD, 1188.7], [xBoxD, 1082.5], [1295.4, 1082.5]], roxo, [12.6, 6.3]);
    }
    for (let j = 0; j < nI; j++) {
      const minhas = todas.filter(function (x) { return x.j === j; }), nj = minhas.length, d = DX * j;
      const Vj = Object.assign({}, V, { xs: V.xs.map(function (x) { return x + d; }), xInv: V.xInv + d, max: V.max + d, min: V.min + d,
        caixa: [V.caixa[0] + d, V.caixa[1], V.caixa[2] + d, V.caixa[3]], cabo: V.cabo + d });
      let xsU;
      if (nj <= 2) {
        xsU = Vj.xs.slice(0, nj);
        xsU.forEach(function (x, k) {
          forma('CRMRamU', V.xs[0], V.yForma, x, V.yForma, 1);
          linha([[x, V.yForma], [x, V.yInv]]);
          texto(uc[k], 'Campo Fotov.', 0, 0, d, 0, 1);
          texto(cf[k === 0 ? 1 : 0], w ? minhas[k].n + 'x' + w + 'W' : '', 0, 0, d, 0, 1);
        });
        forma('CRMPont', 0, 0, d, 0, 1);
      } else {
        const p = Math.min(V.passo, (Vj.max - Vj.min) / (nj - 1)), sv = Math.min(1, p / V.passo);
        const cx = Math.min(Vj.xInv, Vj.max - (nj - 1) * p / 2);
        xsU = minhas.map(function (_, k) { return cx + (k - (nj - 1) / 2) * p; });
        xsU.forEach(function (x, k) {
          forma('CRMRamU', V.xs[0], V.yForma, x, V.yForma, sv);
          linha([[x, V.yForma], [x, V.yBus]]);
          texto(uc[0], 'Campo Fotov.', V.xs[0], V.yForma, x, V.yForma, sv);
          texto(cf[1], w ? minhas[k].n + 'x' + w + 'W' : '', V.xs[0], V.yForma, x, V.yForma, sv);
        });
        linha([[Math.min(xsU[0], Vj.xInv), V.yBus], [Math.max(xsU[nj - 1], Vj.xInv), V.yBus]]);
        linha([[Vj.xInv, V.yBus], [Vj.xInv, V.yInv]]);
        const cz = Vj.caixa, x0 = Math.min(cz[0], xsU[0] - (V.xs[0] - (uc[0] ? uc[0].x - uc[0].s : V.xs[0] - 23.1)) * sv - 4);
        linha([[x0, cz[1]], [cz[2], cz[1]], [cz[2], cz[3]], [x0, cz[3]], [x0, cz[1]]], roxo, [12.6, 6.3]);
      }
      const x1 = xsU[0] - 1.3, xn = xsU[xsU.length - 1], mk = V.marca;
      linha([[xn + 1.9, mk[1]], [xn + 1.9, mk[0]], [x1, mk[0]], [x1, mk[1]], [xn + 10.6, mk[1]]]);
      // o cabo CC é o mesmo: o texto vai uma vez, depois das marcas do último inversor
      const occ = um('cabo_cc');
      if (occ && bit && j === nI - 1) cmds.push({ t: 'texto', txt: (tem(pr.cc.bit) ? fx(U.num(pr.cc.bit), 1) : bit) + 'mm2/' + str(pr.cc.tipo), oc: Object.assign({}, occ, { x: occ.x + (xn - V.xs[1]) }) });
      if (j === 0) continue;
      const vj = valores(lista[j].p, 'A');
      const XS = MF.xS, XT = MF.xT, tri = tri2 && j === 1, dl = tri ? MF.d : 0;
      regiao([1140, 1150, 1186, 1186], d, 0);                     // disjuntor (2 polos)
      if (tri) {
        // UC e INV2 trifásicos: derivação das fases R, S e T, 3º polo do disjuntor e a fase T entrando no inversor pelo meio
        regiao([1149.6, 1143.6, 1160.5, 1190.6], d + 2 * MF.d, 0);
        linha([[1185.7 + d, 1170.6], [1206.5 + d, 1170.6]]); linha([[1185.7 + d, 1167.4], [1206.5 + d, 1167.4]]);
        linha([[MF.xR, 1210], [XS + d, 1210], [XS + d, 1186]]); linha([[XS, 1203], [XT + d, 1203], [XT + d, 1186]]); linha([[XT, 1196], [XT + d + MF.d, 1196], [XT + d + MF.d, 1190.6]]);
        ponto(MF.xR, 1210); ponto(XS, 1203); ponto(XT, 1196);
        // inversor maior: as 3 fases entram retas por cima; proteções afastadas
        [XS + d, XT + d].forEach(function (x) { linha([[x, 1150], [x, INV_TRI.topo]]); });
        linha([[XT + d + MF.d, 1143.6], [XT + d + MF.d, INV_TRI.topo]]);
        cmds.push({ t: 'regiao', bb: INV_TRI.bb, dx: d, dy: 0, w: (INV_TRI.bb[2] - INV_TRI.bb[0]) * INV_TRI.k, h: (INV_TRI.bb[3] - INV_TRI.bb[1]) * INV_TRI.k });
        regiao(INV_TRI.prot, d + INV_TRI.dProt, 0); linha([[INV_TRI.dir(1141.9) + d, 1001.2], [INV_TRI.prot[0] + d + INV_TRI.dProt + 0.5, 1001.2]]);
      } else {
        linha([[XS, 1203], [XS + d, 1203], [XS + d, 1186]]); linha([[XT, 1197], [XT + d, 1197], [XT + d, 1186]]);
        ponto(XS, 1203); ponto(XT, 1197);
        linha([[XS + d, 1150], [XS + d, 1021]]); linha([[XT + d, 1150], [XT + d, 1021]]);
        regiao([1140, 970, 1226, 1030], d, 0);                    // inversor e proteções
      }
      regiao([1192, 846, 1212, 868], d, 0);                       // aterramento dos campos
      em(oc('disj_ca', 0), vj.disj_ca, { x: 1190.64 + d + dl }); em(oc('disj_ca_ka', 0), vj.disj_ca_ka, { x: 1191.12 + d + dl });
      const xl = 1226 + d + 6 + (tri ? INV_TRI.dProt + 6 : 0);
      em(oc('inv_nome_kw', 0), 'INVERSOR', { x: xl, y: 1010.6, s: 5.4, w: null });
      em(oc('inv_nome_kw', 0), vj.inv_nome_kw, { x: xl, w: null }); em(oc('inv_modelo', 0), vj.inv_modelo, { x: xl + 0.5, w: null });
    }
    }
  }

  /** Campos do estilo A que o desenho das strings escreve (o laço geral do PDF não os desenha). */
  const CAMPOS_STRINGS_A = ['campo_fv', 'cabo_cc', 'bit_cc_marca'].concat(COLUNAS.map(function (k) { return 't1_' + k; }), COLUNAS.map(function (k) { return 't2_' + k; }));

  // ------------------------------------------------------------ conferências e pendências
  /** Conferências do projeto (avisos, não bloqueiam): [{nivel: 'erro' | 'aviso' | 'info', texto}]. */
  function conferir(pr, estilos) {
    const lista = inversores(pr);
    if (lista.length > 1) return conferirMulti(pr, estilos, lista);
    const c = calcular(pr), out = [];
    const add = function (nivel, texto) { out.push({ nivel: nivel, texto: texto }); };
    const f2 = function (v) { return U.fmtSmart ? U.fmtSmart(v, 2) : String(U.round(v, 2)); };
    const es = estilos || (pr.estilo === 'AB' ? ['A', 'B'] : [pr.estilo || 'A']);
    // desenho fixo de cada modelo
    // strings: máximo de módulos por string do projetista e a soma da divisão manual
    const maxS = num(pr.maxStr) || 10;
    // strings em paralelo no mesmo MPPT: mesma quantidade de módulos e a soma das correntes dentro do limite do MPPT
    let ini = 0;
    const imaxM = num(pr.inv && pr.inv.imaxMppt);
    c.grupos.forEach(function (g, j) {
      const ns = c.tam.slice(ini, ini + g), rot = 'MPPT' + (j + 1);
      if (g > 1 && Math.min.apply(null, ns) !== Math.max.apply(null, ns)) add('aviso', rot + ': strings em paralelo com quantidades diferentes de módulos (' + ns.join(', ') + '). Em paralelo, as strings devem ser iguais.');
      if (imaxM > 0 && c.imp > 0 && g * c.imp > imaxM + 1e-9) add('aviso', rot + ': ' + g + ' strings em paralelo somam ' + f2(g * c.imp) + ' A, acima da corrente máxima de entrada do MPPT (' + f2(imaxM) + ' A).');
      ini += g;
    });
    const mp = Math.round(num(pr.inv && pr.inv.mppts));
    const somaG = listaNum(pr.porMppt).reduce(function (a, n) { return a + n; }, 0);
    if (c.nStr && str(pr.porMppt) && somaG !== c.nStr) add('aviso', 'As strings por MPPT (' + str(pr.porMppt) + ') somam ' + somaG + ', mas são ' + c.nStr + ' strings.');
    if (mp > 0 && c.grupos.length > mp) add('aviso', 'São ' + c.grupos.length + ' grupos de strings, mas o inversor tem ' + mp + ' MPPT.');
    const acima = c.tam.map(function (n, i) { return n > maxS ? 'STR' + (i + 1) + ' (' + n + ')' : ''; }).filter(Boolean);
    if (acima.length) add('aviso', 'String com mais de ' + maxS + ' módulos (máximo adotado): ' + acima.join(', ') + '. Aumente o número de strings.');
    const soma = c.tam.reduce(function (a, n) { return a + n; }, 0);
    if (c.nStr && c.nMod && soma !== c.nMod) add('aviso', 'As strings somam ' + soma + ' módulos, mas a obra tem ' + c.nMod + '. Confira o número de strings e os módulos por string.');
    if (es.indexOf('A') >= 0 && c.nInv > 1) add('info', 'Estilo A: o desenho mostra 1 inversor (INV1); esta obra tem ' + c.nInv + '. As strings, a tabela e os totais saem com os valores da obra.');
    if (es.indexOf('B') >= 0) {
      const D = DESENHO.B;
      if ((c.nMod && c.nMod !== D.modulos) || (c.nInv && c.nInv !== D.inversores)) {
        add('info', 'Estilo B: a planta baixa, a fachada e os diagramas desenham ' + D.modulos + ' módulos e ' + D.inversores + ' inversor; esta obra tem ' + c.nMod +
          ' módulos e ' + c.nInv + ' inversor(es). Quantidades, potências e textos saem com os valores da obra.');
      }
    }
    const vInvT = num(pr.inv && pr.inv.tensao);
    if (pr.inv && pr.inv.fases === 'tri' && vInvT > 0 && vInvT < 200) add('aviso', 'Inversor trifásico com tensão CA de ' + vInvT + ' V: informe a tensão de linha (220 ou 380 V) — a corrente sai de P ÷ (√3 × V).');
    if (pr.modelosDiferentes) add('aviso', 'A obra tem inversores de modelos diferentes: a prancha mostra só o principal (' + [pr.inv.fab, pr.inv.modelo].filter(Boolean).join(' ') + ').');
    // proteções e cabos do lado CA
    const dca = num(pr.disjCa);
    if (c.iInv > 0 && dca > 0) {
      if (dca < c.iInv) add('erro', 'Disjuntor CA de ' + dca + ' A abaixo da corrente do inversor (' + f2(c.iInv) + ' A).');
      else if (dca < 1.25 * c.iInv - 1e-9) add('aviso', 'Disjuntor CA de ' + dca + ' A abaixo de 1,25 × a corrente do inversor (' + f2(1.25 * c.iInv) + ' A).');
    }
    const izCa = izCabo(pr.ca.bit, pr.inv && pr.inv.fases === 'tri' ? 'tri' : 'mono');
    if (dca > 0 && izCa && dca > izCa) add('aviso', 'Disjuntor CA de ' + dca + ' A acima da capacidade do cabo de ' + pr.ca.bit + ' mm² (' + izCa + ' A, NBR 5410 tab. 36, B1): o disjuntor não protege o cabo.');
    const dg = num(pr.disjGeral);
    const izSai = izCabo(pr.saida.bit, pr.ligacao), izEnt = izCabo(pr.entrada.bit, pr.ligacao);
    if (dg > 0 && izSai && dg > izSai) add('aviso', 'Disjuntor geral de ' + dg + ' A acima da capacidade do cabo de saída de ' + pr.saida.bit + ' mm² (' + izSai + ' A).');
    if (dg > 0 && izEnt && dg > izEnt) add('aviso', 'Disjuntor geral de ' + dg + ' A acima da capacidade do cabo de entrada de ' + pr.entrada.bit + ' mm² (' + izEnt + ' A).');
    if (dg > 0 && dca > 0 && dca > dg) add('aviso', 'Disjuntor CA do inversor (' + dca + ' A) maior que o disjuntor geral (' + dg + ' A).');
    // lado CC
    const izCc = IZ_SOLAR[num(pr.cc.bit)];
    if (izCc && c.iscStr > 0 && 1.25 * c.iscStr > izCc) add('aviso', 'Cabo CC de ' + pr.cc.bit + ' mm² (' + izCc + ' A) abaixo de 1,25 × Isc do módulo (' + f2(1.25 * c.iscStr) + ' A).');
    const vmax = num(pr.inv && pr.inv.vmaxCC);
    if (c.vocFrioStr > 0 && vmax > 0 && c.vocFrioStr > vmax) add('erro', 'Voc da string no frio (' + f2(c.vocFrioStr) + ' V) acima da tensão CC máxima do inversor (' + vmax + ' V).');
    const ucpv = num(pr.dpsCcUcpv);
    if (ucpv > 0 && c.vocFrioStr > 0 && ucpv < c.vocFrioStr) add('aviso', 'DPS CC com Ucpv de ' + ucpv + ' V abaixo do Voc da string no frio (' + f2(c.vocFrioStr) + ' V).');
    // quedas de tensão
    const limCC = num(pr.limiteCC) || 3, limCA = num(pr.limiteCA) || 4;
    c.strings.forEach(function (s, i) { if (s.dist > 0 && s.pct > limCC) add('aviso', 'Queda de tensão na string ' + (i + 1) + ' de ' + f2(s.pct) + '% (limite adotado: ' + limCC + '%).'); });
    if (num(pr.ca.dist) > 0 && c.pctCa > limCA) add('aviso', 'Queda de tensão no circuito CA de ' + f2(c.pctCa) + '% (limite adotado: ' + limCA + '%, NBR 5410 6.2.7).');
    const refCc = quedaRef(pr.cc.bit, false), refCa = quedaRef(pr.ca.bit, pr.inv && pr.inv.fases === 'tri');
    if (refCc && num(pr.cc.un) > 0 && num(pr.cc.un) < refCc / 2) add('info', 'Queda unitária CC de ' + pr.cc.un + ' V/A·km: a referência para ' + pr.cc.bit + ' mm² (cobre a 70 °C, 2ρ/S) é ≈ ' + U.round(refCc, 2).toString().replace('.', ',') + ' V/A·km. Confira a tabela usada.');
    if (refCa && num(pr.ca.un) > 0 && num(pr.ca.un) < refCa / 2) add('info', 'Queda unitária CA de ' + pr.ca.un + ' V/A·km: a referência para ' + pr.ca.bit + ' mm² é ≈ ' + U.round(refCa, 2).toString().replace('.', ',') + ' V/A·km. Confira a tabela usada.');
    return out;
  }

  /** Folhas do estilo A: o padrão são 2 folhas A1 (1/2: tabelas, diagramas e croqui; 2/2: layout das strings, diagrama de
   * blocos e detalhes), com um ou mais inversores; o projetista pode pedir uma folha só. */
  function folhasA(pr) { return pr.folhasA !== '1' ? 2 : 1; }

  /**
   * Conferências com mais de um inversor: as de cada inversor (com o prefixo INV1, INV2… quando são só dele; as que dão igual
   * em todos aparecem uma vez), a divisão dos módulos entre eles e os limites do desenho.
   */
  function conferirMulti(pr, estilos, lista) {
    const es = estilos || (pr.estilo === 'AB' ? ['A', 'B'] : [pr.estilo || 'A']);
    const porInv = lista.map(function (x) { return conferir(x.p, ['A']).filter(function (m) { return !/^Estilo [AB]:/.test(m.texto); }); });
    const out = [], visto = {};
    const add = function (nivel, texto) { out.push({ nivel: nivel, texto: texto }); };
    porInv.forEach(function (l, j) {
      l.forEach(function (m) {
        const todos = porInv.every(function (o) { return o.some(function (n) { return n.texto === m.texto; }); });
        if (todos) { if (!visto[m.texto]) { visto[m.texto] = 1; out.push(m); } } else out.push({ nivel: m.nivel, texto: 'INV' + (j + 1) + ': ' + m.texto });
      });
    });
    const M = num(pr.mod && pr.mod.qtd);
    const dig = [pr.inv || {}].concat(pr.invs || []).reduce(function (a, x) { return a + Math.max(0, Math.round(num(x.qtdMod))); }, 0);
    const soma = lista.reduce(function (a, x) { return a + num(x.p.mod.qtd); }, 0);
    if (dig > M) add('erro', 'Os módulos digitados por inversor somam ' + dig + ', mas a obra tem ' + M + '.');
    else if (M && soma !== M) add('aviso', 'Os inversores recebem ' + soma + ' módulos, mas a obra tem ' + M + '. Confira os módulos de cada inversor.');
    lista.forEach(function (x, j) {
      const c = calcular(x.p);
      if (c.kw > 0 && c.kwp > 0 && c.kwp / c.kw > 1.5) add('aviso', 'INV' + (j + 1) + ': ' + fx(c.kwp, 2, ',') + ' kWp para ' + fx(c.kw, 2, ',') + ' kW (relação CC/CA de ' + fx(c.kwp / c.kw, 2, ',') + ').');
    });
    if (es.indexOf('A') >= 0 && lista.length > 2) add('aviso', 'Estilo A: os unifilares desenham até 2 inversores (o croqui limita a largura); do INV3 em diante, só o desenho das strings e as tabelas.');
    if (es.indexOf('B') >= 0) add('info', 'Estilo B: a planta, a fachada e os diagramas desenham ' + DESENHO.B.modulos + ' módulos e 1 inversor; esta obra tem ' + M + ' módulos e ' + lista.length + ' inversores. Quantidades e textos saem com o inversor 1.');
    return out;
  }

  /** Campos que faltam para a prancha sair completa. */
  function pendencias(pr, ctx) {
    const lista = inversores(pr);
    if (lista.length > 1) {
      // os do INV1 e os gerais; dos outros, só os que são do inversor (com o prefixo)
      const DO_INV = ['Potência do inversor (kW)', 'Modelo do inversor', 'Número de strings', 'Distância do circuito CA', 'Disjuntor CA (A)'];
      const out = pendencias(lista[0].p, ctx).map(function (t) { return DO_INV.indexOf(t) >= 0 ? 'INV1: ' + t : t; });
      lista.slice(1).forEach(function (x, j) { pendencias(x.p, ctx).filter(function (t) { return DO_INV.indexOf(t) >= 0; }).forEach(function (t) { out.push('INV' + (j + 2) + ': ' + t); }); });
      return out;
    }
    const p = [], c = calcular(pr), ef = efetivos(pr, ctx);
    const falta = function (cond, txt) { if (cond) p.push(txt); };
    falta(!str(pr.cliente.nome), 'Nome do cliente');
    falta(!str(pr.cliente.endereco), 'Endereço do cliente');
    falta(!str(pr.uc), 'UC');
    falta(!/^\d{6}$/.test(digitos(pr.utm.x)), 'Coordenada UTM X (6 dígitos)');
    falta(!/^\d{7}$/.test(digitos(pr.utm.y)), 'Coordenada UTM Y (7 dígitos)');
    falta(!(c.nMod > 0), 'Quantidade de módulos');
    falta(!(c.w > 0), 'Potência do módulo (W)');
    falta(!(c.vmp > 0), 'Vmp do módulo (datasheet)');
    falta(!(num(pr.mod.imp) > 0), 'Imp do módulo (datasheet)');
    falta(!(c.kw > 0), 'Potência do inversor (kW)');
    falta(!str(pr.inv.modelo), 'Modelo do inversor');
    falta(!(c.nStr > 0), 'Número de strings');
    falta(!(num(pr.cc.dist1) > 0), 'Distância do circuito CC (string 1)');
    falta(!(num(pr.ca.dist) > 0), 'Distância do circuito CA');
    falta(!(num(pr.disjGeral) > 0), 'Disjuntor geral (A)');
    falta(!(num(pr.disjCa) > 0), 'Disjuntor CA (A)');
    falta(!str(pr.dpsCa.in) || !str(pr.dpsCa.imax) || !str(pr.dpsCa.uc), 'DPS CA (In, Imáx e Uc)');
    falta(!str(pr.cc.bit) || !str(pr.ca.bit) || !str(pr.entrada.bit) || !str(pr.saida.bit), 'Bitolas dos cabos');
    falta(!ef.rtNome, 'Responsável técnico (Configurações › Empresa)');
    falta(!ef.empEndereco, 'Endereço da empresa (Configurações › Empresa)');
    falta(!str(pr.data), 'Data');
    return p;
  }

  function estilosDe(pr) { return pr.estilo === 'AB' ? ['A', 'B'] : [pr.estilo === 'B' ? 'B' : 'A']; }
  function nomeArquivo(pr) {
    const limpo = function (s) { return str(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\- ]+/g, '').replace(/\s+/g, ' ').trim(); };
    return ['Prancha FV', pr.estilo === 'AB' ? 'A e B' : (pr.estilo || 'A'), limpo(pr.cliente && pr.cliente.nome) || 'cliente', str(pr.uc) ? 'UC ' + limpo(pr.uc) : ''].filter(Boolean).join(' - ') + '.pdf';
  }

  // ------------------------------------------------------------ texto em traços (fontes TXT e ROMANS das pranchas)
  function semAcento(ch) { return ch.normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  /** Disposição de um texto na fonte TXT: largura (em alturas) e posição de cada glifo. */
  function txtDispor(F, s) {
    const G = F.glifos, itens = [];
    let x = 0, prev = null;
    for (const ch0 of String(s)) {
      const ch = (F.subst && F.subst[ch0]) || ch0;
      if (ch === ' ') { if (prev !== null) x += F.espaco; continue; }
      let k = G[ch] ? ch : (G[ch.toUpperCase()] ? ch.toUpperCase() : null);
      if (!k) { const b = semAcento(ch); k = G[b] ? b : (G[b.toUpperCase()] ? b.toUpperCase() : '-'); }
      if (prev !== null) x += G[prev].r + G[k].l;
      itens.push({ k: k, x: x });
      x += G[k].w; prev = k;
    }
    return { w: x, itens: itens };
  }
  function romDispor(F, s) {
    const G = F.glifos, itens = [];
    let x = 0, ult = 0;
    for (const ch0 of String(s)) {
      if (ch0 === ' ') { x += F.espacoPalavra; continue; }
      let k = G[ch0] ? ch0 : semAcento(ch0);
      if (!G[k]) k = '?';
      const xs = G[k].reduce(function (a, sub) { return a.concat(sub.map(function (p) { return p[0]; })); }, []);
      const mx = xs.length ? Math.max.apply(null, xs) : 0;
      itens.push({ k: k, x: x });
      ult = x + mx;
      x += mx + F.espacoLetra;
    }
    return { w: ult, itens: itens };
  }
  /** Largura do texto na página (pt). oc: ocorrência do mapa ({t, s, fl}). */
  function larguraTracos(F, oc, s, tam, fl) {
    if (oc.t === 'rom') return romDispor(F, s).w * tam / F.altura * fl;
    return txtDispor(F, s).w * tam * fl;
  }
  /**
   * Polilinhas do texto na página: [[[x, y], …], …]. (oc.x, oc.y) = ponto da linha de base no início da tinta ('l'), no centro ('c')
   * ou no fim ('r'); oc.ang em graus.
   */
  function tracos(F, oc, s, tam, fl) {
    tam = tam || oc.s; fl = fl || oc.fl || 1;
    const ca = Math.cos(oc.ang * Math.PI / 180), sa = Math.sin(oc.ang * Math.PI / 180);
    const out = [];
    if (oc.t === 'rom') {
      const d = romDispor(F, s), k = tam / F.altura, w = d.w * k * fl;
      const dx = oc.al === 'c' ? -w / 2 : (oc.al === 'r' ? -w : 0);
      d.itens.forEach(function (it) {
        F.glifos[it.k].forEach(function (sub) {
          out.push(sub.map(function (p) { const u = (it.x + p[0]) * k * fl + dx, v = p[1] * k; return [oc.x + u * ca - v * sa, oc.y + u * sa + v * ca]; }));
        });
      });
      return out;
    }
    const d = txtDispor(F, s), w = d.w * fl;
    const dx = oc.al === 'c' ? -w / 2 : (oc.al === 'r' ? -w : 0);
    d.itens.forEach(function (it) {
      F.glifos[it.k].g.forEach(function (sub) {
        out.push(sub.map(function (p) { const u = (it.x + p[0]) * tam * fl + dx * tam, v = p[1] * tam; return [oc.x + u * ca - v * sa, oc.y + u * sa + v * ca]; }));
      });
    });
    return out;
  }
  /** Ajuste para caber na largura do campo: primeiro estreita (fator de largura até 70%), depois reduz a altura (até 60%). */
  function caber(larguraEm, oc, s) {
    let tam = oc.s, fl = oc.fl || 1;
    if (!oc.w) return { tam: tam, fl: fl };
    const w0 = larguraEm(tam, fl);
    if (w0 <= oc.w) return { tam: tam, fl: fl };
    const flMin = fl * 0.7;
    fl = Math.max(flMin, fl * oc.w / w0);
    const w1 = larguraEm(tam, fl);
    if (w1 > oc.w) tam = Math.max(oc.s * 0.6, tam * oc.w / w1);
    return { tam: tam, fl: fl };
  }

  App.Pranchas = {
    ESTILOS: ESTILOS, OPCOES_ESTILO: OPCOES_ESTILO, LIGACOES: LIGACOES, PADROES: PADROES, DESENHO: DESENHO, ASSINATURA: ASSINATURA, DISJUNTORES: DISJUNTORES,
    mapa: mapa, modelo: modelo, fonteTxt: fonteTxt, fonteRomans: fonteRomans, fonteArial: fonteArial,
    sugerir: sugerir, puxarCrm: puxarCrm, padroesDe: padroesDe, lerCompartilhados: lerCompartilhados, gravarCompartilhados: gravarCompartilhados,
    tamanhos: tamanhos, gruposMppt: gruposMppt, inversores: inversores, calcular: calcular, automaticos: automaticos, efetivos: efetivos, valores: valores, conferir: conferir, pendencias: pendencias,
    CONDUTORES_CA: CONDUTORES_CA, letrasCA: letrasCA, letrasInv: letrasInv, letrasUC: letrasUC, terraMod: terraMod,
    correnteInv: correnteInv, novoInversor: novoInversor, folhasA: folhasA,
    estilosDe: estilosDe, nomeArquivo: nomeArquivo, desenhoStringsA: desenhoStringsA, linhaTabela: linhaTabela, CAMPOS_STRINGS_A: CAMPOS_STRINGS_A, proxDisjuntor: proxDisjuntor, izCabo: izCabo, quedaRef: quedaRef, rua: rua,
    txtDispor: txtDispor, romDispor: romDispor, larguraTracos: larguraTracos, tracos: tracos, caber: caber,
    fmt: { pt: pt, fx: fx, dig: dig, pad2: pad2, documento: documento, dataBR: dataBR }
  };
})(window.App);
