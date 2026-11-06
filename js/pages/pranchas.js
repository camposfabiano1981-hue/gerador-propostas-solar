/*
 * Seção "Pranchas do projeto elétrico" da instalação: as pranchas A1 nos estilos A e B do projetista, com os dados do CRM, os
 * cálculos (strings, correntes, quedas de tensão), os campos do projetista (proteções, cabos, fiação…), as conferências e o PDF.
 */
window.App = window.App || {};

(function (App) {
  'use strict';

  const U = App.U;
  const h = U.h;
  const UI = App.UI;
  const S = App.Store;
  const P = App.Pranchas;

  function padroes() { const c = S.configBruta().pranchas; return (c && c.padroes) || {}; }
  const MATERIAIS = ['PVC', 'XLPE', 'EPR', 'HEPR'];
  const ROT_NIVEL = { erro: '⛔', aviso: '⚠', info: 'ℹ' };

  /** Monta a seção. o: {inst, ctx, mudou, registrar(texto)} */
  function secao(c, o) {
    c.appendChild(h('p.ajuda-sec', 'Pranchas A1 do projeto elétrico nos seus dois estilos (A: tabelas de strings e do inversor, unifilar e croqui; ',
      'B: plantas, fachadas, multifilar e unifilar), desenhadas sobre as suas pranchas do AutoCAD. Cliente, equipamentos e arranjo vêm do CRM; ',
      'correntes, quedas e textos são calculados; proteções, cabos e fiação são seus (o último projeto vira o padrão do próximo). ',
      'Disjuntores, DPS CA, bitolas, ligação e UTM são os mesmos da Homologação.'));
    const box = h('div.homolog.prancha');
    c.appendChild(box);
    desenhar(box, o);
  }

  function desenhar(box, o) {
    const inst = o.inst, ctx = o.ctx;
    box.replaceChildren();
    if (!inst.pranchas) {
      box.appendChild(h('div.homolog-inicio',
        h('p', 'Prepare as pranchas com os dados do cliente, da proposta aprovada e da obra. Depois confira os campos do projetista.'),
        h('button.btn.primario.btn-prancha-preparar', {
          type: 'button', onclick: function () {
            inst.pranchas = P.sugerir(inst, ctx, padroes());
            o.mudou(); desenhar(box, o);
            UI.toast('Pranchas preparadas com os dados do CRM. Confira os campos do projetista.', 'ok');
          }
        }, '📐 Preparar as pranchas')));
      return;
    }
    const pr = inst.pranchas;
    // campos que entraram depois (pranchas preparadas antes): o padrão do projetista
    if (pr.condCA == null) pr.condCA = padroes().condCA || P.PADROES.condCA;
    if (pr.terraMod == null) pr.terraMod = padroes().terraMod || P.PADROES.terraMod;
    if (pr.porMppt == null) pr.porMppt = '';
    if (!Array.isArray(pr.invs)) pr.invs = [];
    // quantidade > 1 no inversor (obras antigas): cada unidade vira um inversor da prancha (INV1, INV2…)
    if (!pr.invs.length && U.numOr(pr.inv.qtd, 1) > 1) {
      for (let i = 1; i < U.numOr(pr.inv.qtd, 1); i++) pr.invs.push(P.novoInversor(pr, Object.assign({}, pr.inv, { qtd: '1', qtdMod: '', nStrings: '', porString: '', porMppt: '', caBit: '', caDist: '', disjCa: '' })));
      pr.inv.qtd = '1';
    }
    const multi = pr.invs.length > 0;
    const mudou = function (redesenho) { pr.atualizadoEm = new Date().toISOString(); o.mudou(); pintarResumo(); pintarCalc(); if (redesenho) desenhar(box, o); };
    // campo compartilhado com a Homologação: grava lá também
    const comp = function () { if (inst.homologacao) P.gravarCompartilhados(pr, inst.homologacao); };

    // ---------- resumo: totais, pendências, conferências e botões
    const resumo = h('div.homolog-resumo');
    box.appendChild(resumo);
    function pintarResumo() {
      const c = P.calcular(pr), pend = P.pendencias(pr, ctx), conf = P.conferir(pr);
      const f2 = function (v) { return U.fmtSmart(v, 2); };
      const nErro = conf.filter(function (x) { return x.nivel === 'erro'; }).length;
      const lista = P.inversores(pr), cs = lista.map(function (x) { return P.calcular(x.p); });
      const strTxt = function (k, mod) { return k.nStr ? k.tam.join(' + ') + (mod ? ' módulos' : '') + (k.grupos.some(function (g) { return g > 1; }) ? ' (' + k.grupos.join(' + ') + ' por MPPT)' : '') : '—'; };
      resumo.replaceChildren(
        h('div.homolog-totais', h('span', 'Sistema: ', h('strong', f2(c.kwp) + ' kWp')),
          lista.length > 1 ? h('span', 'Strings: ', h('strong', cs.map(function (k, j) { return 'INV' + (j + 1) + ': ' + strTxt(k); }).join(' · ')))
            : h('span', 'Strings: ', h('strong', strTxt(c, true))),
          lista.length > 1 ? h('span', 'Inversores: ', h('strong', cs.map(function (k) { return f2(k.kw); }).join(' + ') + ' kW · ' + cs.map(function (k) { return f2(k.iInv); }).join(' + ') + ' A'))
            : h('span', 'Inversor: ', h('strong', c.kw ? f2(c.kw) + ' kW · ' + f2(c.iInv) + ' A' : '—')), h('span', 'Páginas: ', h('strong', String(P.estilosDe(pr).reduce(function (a, e) { return a + (e === 'A' ? P.folhasA(pr) : 1); }, 0))))),
        pend.length ? h('details.homolog-pendencias', h('summary', '⚠ ' + pend.length + (pend.length === 1 ? ' campo pendente' : ' campos pendentes')), h('ul', pend.map(function (p) { return h('li', p); })))
          : h('p.nota.ok', '✓ Campos da prancha preenchidos.'),
        conf.length ? h('details.prancha-conferencias' + (nErro ? '.tem-erro' : ''), { open: nErro > 0 }, h('summary', (nErro ? '⛔ ' : '🔎 ') + conf.length + (conf.length === 1 ? ' conferência' : ' conferências') + ' do projeto'),
          h('ul', conf.map(function (x) { return h('li.' + x.nivel, ROT_NIVEL[x.nivel] + ' ' + x.texto); }))) : null,
        h('div.barra-itens',
          h('button.btn.pequeno', { type: 'button', onclick: function () { P.puxarCrm(pr, inst, ctx); mudou(true); UI.toast('Dados do cliente, dos equipamentos e da Homologação atualizados.', 'ok'); } }, '↻ Puxar dados do CRM'),
          h('button.btn.pequeno.btn-prancha-ver', { type: 'button', onclick: function () { App.Visualizar.abrir(function () { return App.PranchasPdf.gerar(pr, { ctx: ctx }); }, { titulo: 'Prancha — ' + ((pr.cliente && pr.cliente.nome) || '') }); } }, '👁 Visualizar'),
          h('button.btn.pequeno.primario.btn-prancha-pdf', { type: 'button', onclick: baixar }, '⬇ Prancha em PDF')));
    }
    async function baixar(ev) {
      const pend = P.pendencias(pr, ctx);
      if (pend.length && !(await UI.confirmar('Faltam ' + pend.length + ' campo(s) (' + pend.slice(0, 4).join('; ') + (pend.length > 4 ? '…' : '') + '). Gerar a prancha mesmo assim?', 'Gerar mesmo assim'))) return;
      const b = ev && ev.target;
      if (b) { b.disabled = true; b.textContent = 'Gerando…'; }
      try {
        const g = await App.PranchasPdf.gerar(pr, { ctx: ctx });
        U.download(g.blob, g.nome);
        S.salvarConfig('pranchas', Object.assign({}, S.configBruta().pranchas || {}, { padroes: P.padroesDe(pr) }));
        pr.geradoEm = new Date().toISOString();
        if (o.registrar) o.registrar('📐 Prancha do projeto elétrico gerada (' + g.estilos.map(function (e) { return P.ESTILOS[e].nome; }).join(' e ') + ')' + (g.assinado ? ', com a assinatura do responsável técnico' : '') + '.');
        o.mudou();
        UI.toast('Prancha gerada: ' + g.nome, 'ok');
      } catch (e) {
        console.error(e);
        UI.toast(e.message, 'erro');
      } finally {
        if (b) { b.disabled = false; b.textContent = '⬇ Prancha em PDF'; }
      }
    }

    const grupo = function (titulo, aberto, conteudo) { box.appendChild(h('details.homolog-grupo', { open: !!aberto }, h('summary', titulo), conteudo)); };
    const auto = P.automaticos(pr, ctx);
    const ph = function (v) { return v ? 'Auto: ' + v : ''; };

    // ---------- 1. estilo, cliente e carimbo
    grupo('1. Estilo, cliente e carimbo', true, h('div',
      UI.grade([
        { k: 'estilo', label: 'Estilo da prancha', type: 'select', options: P.OPCOES_ESTILO, help: 'A: tabelas e unifilar · B: plantas, fachadas e diagramas.' },
        { k: 'folhasA', label: 'Folhas do estilo A', type: 'select', options: [{ v: '', t: 'Automático (2 folhas com 2 ou mais inversores)' }, { v: '1', t: 'Uma folha só' }],
          help: 'Com 2 folhas: a 1ª com as tabelas e os diagramas; a 2ª com o layout das strings ampliado.' },
        { k: 'data', label: 'Data', type: 'date' },
        { k: 'art', label: 'ART/TRT', placeholder: 'Nº da ART' },
        { k: 'cliente.nome', label: 'Proprietário (cliente)', cls: 'span2' },
        { k: 'cliente.documento', label: 'CPF/CNPJ' },
        { k: 'cliente.endereco', label: 'Endereço (como sai no carimbo)', cls: 'span2' },
        { k: 'uc', label: 'UC' },
        { k: 'utm.fuso', label: 'Fuso (UTM)', type: 'select', options: ['18K', '19K', '20K', '21K', '22K', '23K', '24K', '25K'] },
        { k: 'utm.x', label: 'X (UTM) — 6 dígitos' },
        { k: 'utm.y', label: 'Y (UTM) — 7 dígitos' }
      ], pr, function (k) { if (k === 'estilo') mudou(true); else { if (/^utm\./.test(k)) comp(); mudou(); } }, 3),
      h('h4.secao-form', 'Croqui de localização (ruas)'),
      UI.grade([{ k: 'ruas.uc', label: 'Rua da UC' }, { k: 'ruas.r2', label: 'Rua 2' }, { k: 'ruas.r3', label: 'Rua 3' }, { k: 'ruas.r4', label: 'Rua 4' }], pr, function () { mudou(); }, 4),
      h('h4.secao-form', 'Empresa e responsável técnico (em branco = Configurações › Empresa)'),
      UI.grade([
        { k: 'emp.endereco', label: 'Endereço da empresa', placeholder: ph(auto.empEndereco), cls: 'span2' },
        { k: 'emp.contato', label: 'Contato da empresa', placeholder: ph(auto.empContato) },
        { k: 'rt.nome', label: 'Responsável técnico', placeholder: ph(auto.rtNome) },
        { k: 'rt.registro', label: 'Registro', placeholder: ph(auto.rtRegistro) },
        { k: 'rt.tel', label: 'Telefone no carimbo', placeholder: ph(auto.rtTel) }
      ], pr, function () { mudou(); }, 3),
      UI.campo({ k: 'assinarRt', label: 'Incluir a assinatura do responsável técnico (guardada em Configurações › Empresa)', type: 'checkbox' }, pr, function () { mudou(); }),
      App.Assinatura && App.Assinatura.guardada && App.Assinatura.guardada() ? null : h('p.nota.aviso', 'Nenhuma assinatura guardada do responsável técnico: o carimbo sai sem assinatura.')));

    // ---------- 2. módulos, inversor e arranjo
    const c0 = P.calcular(pr);
    const lista0 = P.inversores(pr), cs0 = lista0.map(function (x) { return P.calcular(x.p); });
    const FASES = [{ v: 'mono', t: 'Monofásica' }, { v: 'tri', t: 'Trifásica' }];
    // campos do arranjo de um inversor (com mais de um): módulos, strings, divisão por string e por MPPT
    const arranjo = function (j) {
      const cj = cs0[j] || { tam: [], grupos: [] }, nMod = lista0[j] ? lista0[j].p.mod.qtd : '';
      return [
        { k: 'qtdMod', label: 'Módulos neste inversor', type: 'int', placeholder: nMod ? 'Auto: ' + nMod : '', help: 'Em branco = divide os módulos da obra pela potência.' },
        { k: 'nStrings', label: 'Nº de strings', type: 'int', placeholder: cj.tam.length ? 'Auto: ' + cj.tam.length : '' },
        { k: 'porString', label: 'Módulos por string', placeholder: cj.tam.length ? 'Auto: ' + cj.tam.join(' + ') : '' },
        { k: 'porMppt', label: 'Strings por MPPT', placeholder: cj.grupos.length ? 'Auto: ' + cj.grupos.join(' + ') : '' }
      ];
    };
    const blocoExtra = function (x, i) {
      const j = i + 1, cj = cs0[j], sugJ = cj && cj.iInv > 0 ? P.proxDisjuntor(1.25 * cj.iInv) : null;
      return h('div.prancha-inv-extra', { 'data-inv': String(j + 1) },
        h('div.prancha-inv-topo', h('h4.secao-form', 'Inversor ' + (j + 1) + ' (INV' + (j + 1) + ')'),
          h('button.btn.pequeno.perigo.btn-inv-remover', { type: 'button', onclick: function () {
            pr.invs.splice(i, 1);
            if (!pr.invs.length) { pr.nStrings = String(Math.max(1, Math.ceil(U.numOr(pr.mod.qtd, 0) / (U.numOr(pr.maxStr, 10) || 10)))); pr.porString = ''; pr.porMppt = ''; }
            mudou(true);
          } }, '✕ Remover')),
        UI.grade([
          { k: 'fab', label: 'Fabricante' }, { k: 'modelo', label: 'Modelo', cls: 'span2' }, { k: 'kw', label: 'Potência (kW)', type: 'number' },
          { k: 'tensao', label: 'Tensão CA (V)', type: 'number', help: 'No trifásico, a de linha (220 ou 380 V).' }, { k: 'fases', label: 'Saída', type: 'select', options: FASES }, { k: 'vmaxCC', label: 'Tensão CC máx. (V)', type: 'number' },
          { k: 'mppts', label: 'Nº de MPPT', type: 'int' }, { k: 'imaxMppt', label: 'Corrente máx. por MPPT (A)', type: 'number' },
          { secao: 'Arranjo do INV' + (j + 1) }
        ].concat(arranjo(j), [
          { secao: 'Circuitos do INV' + (j + 1) },
          { k: 'ccDist1', label: 'Distância CC string 1 (m)', type: 'number', placeholder: 'Igual ao INV1' }, { k: 'ccDist2', label: 'Distância CC demais strings (m)', type: 'number', placeholder: 'Igual à 1' },
          { k: 'caBit', label: 'Cabo CA (mm²)', type: 'number', placeholder: 'Igual ao INV1' }, { k: 'caUn', label: 'Queda unitária CA (V/A·km)', placeholder: 'Igual ao INV1' },
          { k: 'condCA', label: 'Condutores (inversor → quadro)', type: 'select', options: [{ v: '', t: 'Pela saída do inversor' }].concat(P.CONDUTORES_CA), help: 'Marcas da fiação no desenho; trifásico = 3 fases.' },
          { k: 'caDist', label: 'Distância CA (m)', type: 'number' },
          { k: 'disjCa', label: 'Disjuntor CA (A)', type: 'number', help: sugJ ? 'Sugestão: ' + sugJ + ' A (≥ 1,25 × ' + U.fmt(cj.iInv, 2) + ' A).' : '' }
        ]), x, function (k) {
          // disjuntor sugerido enquanto o projetista não digitar outro (≥ 1,25 × corrente do inversor)
          if (k === 'kw' || k === 'tensao' || k === 'fases') {
            const i = P.correnteInv(x, pr.fp), sug = i > 0 ? String(P.proxDisjuntor(1.25 * i) || '') : '';
            if (!String(x.disjCa || '').trim() || x.disjCa === x.disjSug) {
              x.disjCa = sug; x.disjSug = sug;
              const el = box.querySelector('.prancha-inv-extra[data-inv="' + (j + 1) + '"] [data-k="disjCa"]');
              if (el) el.value = sug;
            }
          }
          mudou();
        }, 4));
    };
    const extras = h('div.prancha-invs', pr.invs.map(blocoExtra),
      h('button.btn.pequeno.btn-inv-adicionar', { type: 'button', onclick: function () {
        if (!pr.invs.length) { pr.inv.qtd = '1'; pr.inv.qtdMod = ''; pr.inv.nStrings = ''; pr.inv.porString = ''; pr.inv.porMppt = ''; }
        pr.invs.push(P.novoInversor(pr));
        mudou(true);
        UI.toast('Inversor ' + (pr.invs.length + 1) + ' incluído: informe o modelo e a potência. Os módulos se dividem pela potência.', 'ok');
      } }, '+ Adicionar inversor'),
      h('small.ajuda', multi ? 'Cada inversor tem os seus módulos, strings, circuito CA e disjuntor. Na prancha A, cada um ganha o seu bloco de strings, a sua linha na tabela e o seu disjuntor nos unifilares.'
        : 'Obra com mais de um inversor (ex.: 10 kW + 15 kW)? Adicione aqui.'));
    grupo('2. Módulos, inversor e arranjo', true, h('div',
      h('h4.secao-form', 'Módulo (datasheet do cadastro)'),
      UI.grade([
        { k: 'mod.fab', label: 'Fabricante' }, { k: 'mod.modelo', label: 'Modelo', cls: 'span2' }, { k: 'mod.qtd', label: 'Quantidade', type: 'int' },
        { k: 'mod.w', label: 'Potência (W)', type: 'number' }, { k: 'mod.vmp', label: 'Vmp (V)', type: 'number' }, { k: 'mod.imp', label: 'Imp (A)', type: 'number' },
        { k: 'mod.voc', label: 'Voc (V)', type: 'number' }, { k: 'mod.isc', label: 'Isc (A)', type: 'number' }, { k: 'mod.celulas', label: 'Nº de células', type: 'int' },
        { k: 'mod.coefVoc', label: 'Coef. de Voc (%/°C)', type: 'number' }
      ], pr, function () { mudou(); }, 4),
      h('h4.secao-form', multi ? 'Inversor 1 (INV1)' : 'Inversor'),
      UI.grade([
        { k: 'inv.fab', label: 'Fabricante' }, { k: 'inv.modelo', label: 'Modelo', cls: 'span2' }, multi ? null : { k: 'inv.qtd', label: 'Quantidade', type: 'int', help: 'Mais de 1: cada um vira INV1, INV2…' },
        { k: 'inv.kw', label: 'Potência (kW)', type: 'number' }, { k: 'inv.tensao', label: 'Tensão CA (V)', type: 'number' },
        { k: 'inv.fases', label: 'Saída', type: 'select', options: [{ v: 'mono', t: 'Monofásica' }, { v: 'tri', t: 'Trifásica' }] }, { k: 'inv.vmaxCC', label: 'Tensão CC máx. (V)', type: 'number' },
        { k: 'inv.mppts', label: 'Nº de MPPT', type: 'int' }, { k: 'inv.imaxMppt', label: 'Corrente máx. por MPPT (A)', type: 'number', help: 'Confere as strings em paralelo.' },
        { k: 'efic', label: 'Eficiência na tabela (%)', type: 'number' }, { k: 'fp', label: 'Fator de potência', type: 'number' }
      ], pr, function (k) { mudou(k === 'inv.qtd' && U.numOr(pr.inv.qtd, 1) > 1); }, 4),
      multi ? UI.grade(arranjo(0), pr.inv, function () { mudou(); }, 4) : null,
      extras,
      h('h4.secao-form', 'Arranjo e ligação'),
      UI.grade([
        multi ? null : { k: 'nStrings', label: 'Nº de strings', type: 'int', help: 'Sugerido pelo máximo de módulos por string.' },
        multi ? null : { k: 'porString', label: 'Módulos por string', placeholder: c0.tam.length ? 'Auto: ' + c0.tam.join(' + ') : '', help: 'Em branco = divide igual. Ou digite a divisão: 10+10+5.' },
        { k: 'maxStr', label: 'Máx. de módulos por string', type: 'int', help: 'Seu limite (padrão 10): o CRM divide e avisa por ele.' },
        multi ? null : { k: 'porMppt', label: 'Strings por MPPT (em paralelo)', placeholder: c0.grupos.length ? 'Auto: ' + c0.grupos.join(' + ') : '', help: 'Em branco = divide pelos MPPTs. Ou digite: 3+3+3. No desenho, as do mesmo MPPT ficam num bloco.' },
        { k: 'ligacao', label: 'Ligação da UC', type: 'select', options: [{ v: 'mono', t: 'Monofásica' }, { v: 'bi', t: 'Bifásica' }, { v: 'tri', t: 'Trifásica' }] },
        { k: 'telhado', label: 'Telhado (estilo B)', placeholder: 'Ex.: Fibrocimento' },
        { k: 'inclinacao', label: 'Inclinação (°) (estilo B)', type: 'number' }
      ], pr, function (k) {
        if (k === 'ligacao') comp();
        if (k === 'maxStr' || k === 'mod.qtd') { const nm = U.numOr(pr.mod.qtd, 0), mx = U.numOr(pr.maxStr, 10) || 10; if (nm > 0) pr.nStrings = Math.max(U.numOr(pr.nStrings, 0), Math.ceil(nm / mx)); }
        mudou(k === 'maxStr');
      }, 3)));

    // ---------- 3. circuitos e quedas de tensão
    const calc = h('div.tabela-rolagem');
    function pintarCalc() {
      const f = function (v, d) { return isFinite(v) && v ? U.fmt(v, d) : '—'; };
      const lista = P.inversores(pr), cs = lista.map(function (x) { return P.calcular(x.p); }), varios = lista.length > 1;
      const linhas = [];
      let k = 0;
      cs.forEach(function (c, j) {
        c.strings.forEach(function (s) {
          k++;
          linhas.push(h('tr', h('td', (varios ? 'INV' + (j + 1) + '-' : '') + 'STR' + k), h('td.num', String(s.n)), h('td.num', f(s.p, 2)), h('td.num', f(s.v, 1)), h('td.num', f(s.i, 2)), h('td.num', s.dist ? f(s.dist, 2) : '—'), h('td.num', s.dist ? f(s.dv, 2) : '—'), h('td.num', s.dist ? f(s.pct, 2) + '%' : '—')));
        });
      });
      cs.forEach(function (c, j) {
        const d = num(lista[j].p.ca.dist);
        linhas.push(h('tr', h('td', varios ? 'CA (INV' + (j + 1) + ')' : 'CA (inversor)'), h('td.num', '—'), h('td.num', f(c.kw, 2)), h('td.num', f(c.vInv, 0)), h('td.num', f(c.iInv, 2)), h('td.num', d ? f(d, 2) : '—'),
          h('td.num', d ? f(c.dvCa, 2) : '—'), h('td.num', d ? f(c.pctCa, 2) + '%' : '—')));
      });
      calc.replaceChildren(h('table.tabela.homolog-tab', h('thead', h('tr', ['Circuito', 'Módulos', 'kW', 'V', 'A', 'Dist. (m)', 'ΔV (V)', 'ΔV (%)'].map(function (t) { return h('th', t); }))), h('tbody', linhas)));
    }
    function num(v) { return U.numOr(v, 0); }
    const refCc = P.quedaRef(pr.cc.bit, false), refCa = P.quedaRef(pr.ca.bit, pr.inv && pr.inv.fases === 'tri');
    const ref = function (v, bit) { return v ? 'Referência para ' + bit + ' mm² (cobre a 70 °C): ≈ ' + U.fmt(v, 2) + ' V/A·km.' : ''; };
    grupo('3. Circuitos e quedas de tensão', true, h('div',
      h('h4.secao-form', multi ? 'Circuito CC (strings do INV1 — e dos outros, se não tiverem distância própria)' : 'Circuito CC (strings)'),
      UI.grade([
        { k: 'cc.bit', label: 'Cabo CC (mm²)', type: 'number' }, { k: 'cc.tipo', label: 'Tipo do cabo CC', placeholder: 'EPR SOLAR 1.8 KV' },
        { k: 'cc.un', label: 'Queda unitária (V/A·km)', help: ref(refCc, pr.cc.bit) },
        { k: 'terraMod', label: 'Aterramento dos módulos (mm²)', type: 'number', help: 'Vai no T dos ramais e na fiação das placas.' },
        { k: 'cc.dist1', label: 'Distância string 1 (m)', type: 'number' }, { k: 'cc.dist2', label: 'Distância demais strings (m)', type: 'number', placeholder: 'Igual à 1' },
        { k: 'limiteCC', label: 'Limite de queda CC (%)', type: 'number' }
      ], pr, function (k) { mudou(k === 'cc.bit'); }, 3),
      h('h4.secao-form', multi ? 'Circuito CA do INV1 (inversor → QGBT) — os outros no bloco de cada inversor' : 'Circuito CA (inversor → QGBT)'),
      UI.grade([
        { k: 'ca.bit', label: 'Cabo CA (mm²)', type: 'number' }, { k: 'ca.mat', label: 'Isolação', type: 'select', options: MATERIAIS }, { k: 'ca.iso', label: 'Classe / temperatura', placeholder: '450/750V - 70°C' },
        { k: 'ca.un', label: 'Queda unitária (V/A·km)', help: ref(refCa, pr.ca.bit) },
        { k: 'condCA', label: 'Condutores (inversor → quadro)', type: 'select', options: P.CONDUTORES_CA, help: 'Marcas da fiação no desenho e na fiação do inversor.' },
        { k: 'ca.dist', label: 'Distância (m)', type: 'number' }, { k: 'limiteCA', label: 'Limite de queda CA (%)', type: 'number' }
      ], pr, function (k) { mudou(k === 'ca.bit'); }, 3),
      h('p.ajuda-sec', 'ΔV = queda unitária × corrente × distância ÷ 1000; % sobre a tensão da string (CC) ou do inversor (CA). Valores calculados:'), calc));
    pintarCalc();

    // ---------- 4. proteções
    const sug = c0.iInv > 0 ? P.proxDisjuntor(1.25 * c0.iInv) : null;
    grupo('4. Proteções', true, h('div',
      UI.grade([
        { k: 'disjGeral', label: 'Disjuntor geral (A)', type: 'number', help: 'O mesmo da Homologação.' },
        { k: 'disjCa', label: multi ? 'Disjuntor CA do INV1 (A)' : 'Disjuntor CA do inversor (A)', type: 'number', help: sug ? 'Sugestão: ' + sug + ' A (≥ 1,25 × ' + U.fmt(c0.iInv, 2) + ' A).' : '' },
        { k: 'disjCaKa', label: 'Capacidade de interrupção (kA)', type: 'number' }
      ], pr, function () { comp(); mudou(); }, 3),
      h('h4.secao-form', 'DPS CA'),
      UI.grade([
        { k: 'dpsCa.classe', label: 'Classe', type: 'select', options: ['I', 'II', 'I+II', 'III'] }, { k: 'dpsCa.uc', label: 'Uc (V)', type: 'number' },
        { k: 'dpsCa.in', label: 'In (kA)', type: 'number' }, { k: 'dpsCa.imax', label: 'Imáx (kA)', type: 'number' }, { k: 'dpsCa.up', label: 'Up (kV)', placeholder: '1,2' }
      ], pr, function (k) { if (k === 'dpsCa.in') comp(); mudou(); }, 5),
      h('h4.secao-form', 'Lado CC'),
      UI.grade([
        { k: 'dpsCcUcpv', label: 'DPS CC — Ucpv (V)', type: 'number', help: 'Só para a conferência com o Voc no frio.' },
        { k: 'sbCc', label: 'String box (entradas/saídas)', placeholder: '4E/2S' }
      ], pr, function () { mudou(); }, 3)));

    // ---------- 5. cabos de entrada, saída e ramal
    grupo('5. Ramal, entrada, saída e aterramento', false, h('div',
      h('h4.secao-form', 'Ramal de ligação'),
      UI.grade([
        { k: 'ramal.cond', label: 'Condutores fase', type: 'int' }, { k: 'ramal.bit', label: 'Bitola (mm²)', type: 'number' }, { k: 'ramal.neutro', label: 'Neutro (mm²)', type: 'number' },
        { k: 'ramal.tipo', label: 'Tipo (estilo A)', placeholder: 'XLPE- MULTIPLEX' }, { k: 'ramal.iso', label: 'Classe / temperatura', placeholder: '0,6/1KV - 90°C' }
      ], pr, function () { mudou(); }, 5),
      h('h4.secao-form', 'Ramal de entrada (padrão → medidor)'),
      UI.grade([{ k: 'entrada.bit', label: 'Bitola (mm²)', type: 'number', help: 'A "bitola fase" da Homologação.' }, { k: 'entrada.mat', label: 'Isolação', type: 'select', options: MATERIAIS }, { k: 'entrada.iso', label: 'Classe / temperatura' }],
        pr, function (k) { if (k === 'entrada.bit') comp(); mudou(); }, 3),
      h('h4.secao-form', 'Ramal de saída (medidor → QGBT)'),
      UI.grade([{ k: 'saida.bit', label: 'Bitola (mm²)', type: 'number' }, { k: 'saida.mat', label: 'Isolação', type: 'select', options: MATERIAIS }, { k: 'saida.iso', label: 'Classe / temperatura' }], pr, function () { mudou(); }, 3),
      UI.grade([{ k: 'terraBit', label: 'Terra do circuito CA (mm²)', type: 'number', help: 'O dos módulos fica em Circuito CC.' }], pr, function () { comp(); mudou(); }, 3)));

    // ---------- 6. detalhe da instalação
    grupo('6. Detalhe da instalação (fiação, eletrodutos e aterramento)', false, h('div',
      UI.grade([
        { k: 'fia.placas', label: 'Fiação das placas', placeholder: ph(auto.fiaPlacas) }, { k: 'fia.sb', label: 'Fiação da string box (estilo B)', placeholder: ph(auto.fiaSb) },
        { k: 'fia.inversor', label: 'Fiação do inversor', placeholder: ph(auto.fiaInversor) }, { k: 'fia.qgbt', label: 'Fiação do QGBT' }, { k: 'fia.ramal', label: 'Fiação do ramal' },
        { k: 'elet.placas', label: 'Eletroduto das placas' }, { k: 'elet.inversor', label: 'Eletroduto do inversor' }, { k: 'elet.ramal', label: 'Eletroduto do ramal' },
        { k: 'haste', label: 'Haste de aterramento' }, { k: 'cxPassagem', label: 'Caixa de passagem' }, { k: 'cxInspecao', label: 'Caixa de inspeção' }
      ], pr, function () { mudou(); }, 3),
      h('p.ajuda-sec', 'Fiação em branco = automática pelas strings, bitolas e ligação (ex.: 4#6(T#6) = 4 condutores de 6 mm² + terra de 6 mm²).')));

    pintarResumo();
  }

  App.PranchasTela = { secao: secao };
})(window.App);
