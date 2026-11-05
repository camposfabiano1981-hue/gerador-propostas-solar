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
    inclinacao: '15', efic: '100', fp: '1', limiteCC: '3', limiteCA: '4', maxStr: '10'
  };
  const CHAVES_PADRAO = ['estilo', 'cc.bit', 'cc.tipo', 'cc.un', 'ca.bit', 'ca.mat', 'ca.iso', 'ca.un', 'entrada.bit', 'entrada.mat', 'entrada.iso', 'saida.bit', 'saida.mat', 'saida.iso',
    'ramal.cond', 'ramal.bit', 'ramal.neutro', 'ramal.tipo', 'ramal.iso', 'terraBit', 'disjCaKa', 'dpsCa.classe', 'dpsCa.uc', 'dpsCa.in', 'dpsCa.imax', 'dpsCa.up', 'dpsCcUcpv',
    'sbCc', 'fia.qgbt', 'fia.ramal', 'elet.placas', 'elet.inversor', 'elet.ramal', 'haste', 'cxPassagem', 'cxInspecao', 'inclinacao', 'efic', 'fp', 'limiteCC', 'limiteCA', 'maxStr'];

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
    const tensao = ((eq && eq.tensao) ? String(eq.tensao).match(/\d+/) : null);
    return {
      fab: (eq && eq.fabricante) || (placa && placa.marca) || '', modelo: (eq && eq.modelo) || (placa && placa.modelo) || '',
      kw: g((eq && eq.potencia) || (placa && placa.potencia)), qtd: qtd > 0 ? String(qtd) : '', fases: fases,
      tensao: tensao ? tensao[0] : '220', vmaxCC: g(eq && eq.vmaxCC), iSaida: g(eq && eq.iSaidaMax), mppts: g(eq && eq.mppts)
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
    qInv += extras.reduce(function (s, e) { return s + (num(e.quantidade) || 1); }, 0);
    const st = r && r.strings;
    let nStr = st ? num(st.nStrings) : 0;
    if (!nStr && qMod > 0) nStr = 1;
    return {
      x: x, mod: dadosModulo(eqMod, pm, qMod), inv: dadosInversor(eqInv, pi, qInv), modelosDiferentes: outros.length > 0,
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
      mod: {}, inv: {}, nStrings: '', porString: '', ligacao: 'bi',
      cc: { bit: pad.cc.bit, tipo: pad.cc.tipo, un: pad.cc.un, dist1: '', dist2: '' },
      ca: { bit: pad.ca.bit, mat: pad.ca.mat, iso: pad.ca.iso, un: pad.ca.un, dist: '' },
      entrada: U.clone(pad.entrada), saida: U.clone(pad.saida), ramal: U.clone(pad.ramal), terraBit: pad.terraBit,
      disjGeral: '', disjCa: '', disjCaKa: pad.disjCaKa, dpsCa: U.clone(pad.dpsCa), dpsCcUcpv: pad.dpsCcUcpv, sbCc: pad.sbCc,
      fia: { placas: '', inversor: '', sb: '', qgbt: pad.fia.qgbt, ramal: pad.fia.ramal }, elet: U.clone(pad.elet),
      haste: pad.haste, cxPassagem: pad.cxPassagem, cxInspecao: pad.cxInspecao,
      telhado: '', inclinacao: pad.inclinacao, efic: pad.efic, fp: pad.fp, limiteCC: pad.limiteCC, limiteCA: pad.limiteCA, maxStr: pad.maxStr,
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
    pr.mod = e.mod; pr.inv = e.inv;
    pr.modelosDiferentes = e.modelosDiferentes;
    // strings: as do dimensionamento, respeitando o máximo de módulos por string do projetista (padrão 10)
    const maxS = num(pr.maxStr) || 10, nMod = num(e.mod.qtd);
    const nMin = nMod > 0 ? Math.ceil(nMod / maxS) : 0;
    if (e.nStrings || nMin) pr.nStrings = String(Math.max(num(e.nStrings), nMin));
    pr.porString = '';
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
    return {
      nMod: nMod, nStr: tam.length, nInv: nInv, tam: tam, strings: strings, maxStr: maxStr, w: w, vmp: vmp, imp: imp, kwp: kwp,
      kw: kw, vInv: vInv, fp: fp, iInv: iInv, dvCa: dvCa, pctCa: vInv > 0 ? dvCa / vInv * 100 : 0,
      strPorInv: nInv > 0 ? Math.ceil(tam.length / nInv) : tam.length, modPorInv: nInv > 0 ? Math.round(nMod / nInv) : nMod,
      vocFrioStr: vocFrioMod * maxStr, iscStr: num(m.isc)
    };
  }

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
    const c = calcular(pr);
    const cond = pr.ligacao === 'tri' ? 3 : 2;
    return {
      empEndereco: endEmp, empContato: contato, rtNome: str(emp.responsavel),
      rtRegistro: reg ? [str(emp.registroTipo) || 'CFT-BR', 'nº', regFmt].join(' ') : '', rtTel: telRt ? 'TEL. ' + telRt.replace(/^\(?\d{2}\)?\s+(?=9?\d{4})/, '') : '',
      fiaPlacas: c.nStr > 0 ? (2 * c.nStr) + '#' + str(pr.cc.bit) + '(T#' + str(pr.terraBit) + ')' : '',
      fiaSb: (2 * Math.max(1, Math.min(c.nStr || 1, num(pr.inv && pr.inv.mppts) || 1))) + '#' + str(pr.cc.bit) + '(T#' + str(pr.terraBit) + ')',
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
        bit_ca_marca: str(pr.ca.bit), bit_cc_marca: str(pr.cc.bit)
      });
      return v;
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
      bit_terra_ca_marca: str(pr.terraBit) ? '#' + str(pr.terraBit) : '', bit_terra_cc_marca: str(pr.terraBit) ? '#' + str(pr.terraBit) : '',
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
   * Desenho das strings do estilo A com a quantidade real da obra: uma fileira por string com os módulos dela (as placas diminuem
   * só quando não cabem), o ramal de cada string até o inversor, a tabela com uma linha por string e um "Campo Fotov." por string
   * nos dois unifilares. Devolve comandos para o gerador do PDF: {t: 'forma', nome, m} (bloco do desenho original com a matriz),
   * {t: 'linha', pts, cor, traco} e {t: 'texto', oc, txt} (texto em traços na posição/tamanho do original).
   * campos: mapa do estilo A; G: mapa.stringsA.
   */
  function desenhoStringsA(pr, campos, G) {
    const c = calcular(pr), cmds = [], tam = c.tam, N = tam.length;
    if (!N || !G) return cmds;
    const w = c.w > 0 ? pt(c.w, 1) : '', bit = str(pr.cc.bit), preto = [0, 0, 0];
    const forma = function (nome, ox, oy, nx, ny, s) { cmds.push({ t: 'forma', nome: nome, m: [s, 0, 0, s, nx - s * ox, ny - s * oy] }); };
    const linha = function (pts, cor, traco) { cmds.push({ t: 'linha', pts: pts, cor: cor || preto, traco: traco || null }); };
    const texto = function (oc, txt, ox, oy, nx, ny, s) {
      if (!oc || !txt) return;
      cmds.push({ t: 'texto', txt: txt, oc: Object.assign({}, oc, { x: nx + s * (oc.x - ox), y: ny + s * (oc.y - oy), s: oc.s * s, w: oc.w ? oc.w * s : oc.w }) });
    };
    const um = function (k) { return campos[k] && campos[k][0]; };
    // ---- fileiras e ramais
    const F = G.fileira, R = G.ramal;
    const nmax = Math.max.apply(null, tam);
    const s = Math.min(1, (F.xmax - F.x0) / ((nmax - 1) * F.passo + F.larg), (F.topo - F.base) / (N * F.alt + (N - 1) * (F.passoY - F.alt)));
    const xu = F.x0 + F.ultimo * F.passo; // 1º módulo da última posição no desenho original
    const sg = Math.min(1, 1.5 * s);     // grupo + − T do ramal
    tam.forEach(function (n, k) {
      const oy = F.topo - F.alt * s - (N - 1 - k) * F.passoY * s, rot = 'STR' + (k + 1);
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
      const ent = [F.x0 + s * (F.entrada[0] - F.x0), oy + s * (F.entrada[1] - F.y0)];
      linha([R.p0, ent]);
      const ax = R.ancora[0], ay = R.p0[1] + (ax - R.p0[0]) / (ent[0] - R.p0[0]) * (ent[1] - R.p0[1]);
      forma('CRMRam', ax, R.ancora[1], ax, ay, sg);
      texto(um('_ram_str'), rot, ax, R.ancora[1], ax, ay, sg);
      (campos._ram_bit || []).forEach(function (oc) { texto(oc, bit ? '#' + bit : '', ax, R.ancora[1], ax, ay, sg); });
    });
    // ---- tabela de strings: uma linha por string, centradas no corpo da tabela
    const T = G.tabela, rotTab = um('_tab_str');
    // passo entre linhas e altura das letras: até 3 strings como no desenho (14,8); com mais, as linhas se aproximam e as letras
    // diminuem na mesma proporção, o bloco sempre centrado no corpo da tabela
    const H0 = 7.48, livre = T.topo - T.fundo - 4;
    const sp = Math.min(T.passo, livre / (N - 1 + 1 / 1.4));
    const st = Math.min(1, sp / 1.4 / H0), alt = (N - 1) * sp + H0 * st;
    const baseFundo = (T.topo + T.fundo) / 2 - alt / 2;
    c.strings.forEach(function (sx, i) {
      const y = baseFundo + (N - 1 - i) * sp, l = linhaTabela(pr, sx);
      if (rotTab) cmds.push({ t: 'texto', txt: 'STR' + (i + 1), oc: Object.assign({}, rotTab, { y: y, s: rotTab.s * st }) });
      COLUNAS.forEach(function (k) { const oc = um('t1_' + k); if (oc && l[k]) cmds.push({ t: 'texto', txt: l[k], oc: Object.assign({}, oc, { y: y, s: oc.s * st }) }); });
    });
    // ---- unifilar simplificado: um ramo por string sob o inversor, ligados pelo barramento
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
    return cmds;
  }
  /** Campos do estilo A que o desenho das strings escreve (o laço geral do PDF não os desenha). */
  const CAMPOS_STRINGS_A = ['campo_fv', 'cabo_cc', 'bit_cc_marca'].concat(COLUNAS.map(function (k) { return 't1_' + k; }), COLUNAS.map(function (k) { return 't2_' + k; }));

  // ------------------------------------------------------------ conferências e pendências
  /** Conferências do projeto (avisos, não bloqueiam): [{nivel: 'erro' | 'aviso' | 'info', texto}]. */
  function conferir(pr, estilos) {
    const c = calcular(pr), out = [];
    const add = function (nivel, texto) { out.push({ nivel: nivel, texto: texto }); };
    const f2 = function (v) { return U.fmtSmart ? U.fmtSmart(v, 2) : String(U.round(v, 2)); };
    const es = estilos || (pr.estilo === 'AB' ? ['A', 'B'] : [pr.estilo || 'A']);
    // desenho fixo de cada modelo
    // strings: máximo de módulos por string do projetista e a soma da divisão manual
    const maxS = num(pr.maxStr) || 10;
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

  /** Campos que faltam para a prancha sair completa. */
  function pendencias(pr, ctx) {
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
    tamanhos: tamanhos, calcular: calcular, automaticos: automaticos, efetivos: efetivos, valores: valores, conferir: conferir, pendencias: pendencias,
    estilosDe: estilosDe, nomeArquivo: nomeArquivo, desenhoStringsA: desenhoStringsA, linhaTabela: linhaTabela, CAMPOS_STRINGS_A: CAMPOS_STRINGS_A, proxDisjuntor: proxDisjuntor, izCabo: izCabo, quedaRef: quedaRef, rua: rua,
    txtDispor: txtDispor, romDispor: romDispor, larguraTracos: larguraTracos, tracos: tracos, caber: caber,
    fmt: { pt: pt, fx: fx, dig: dig, pad2: pad2, documento: documento, dataBR: dataBR }
  };
})(window.App);
