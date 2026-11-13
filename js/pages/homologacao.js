/*
 * Seção "Homologação (memorial Energisa)" da instalação: o memorial V6 da planilha oficial, com os dados do cliente e da proposta
 * aprovada puxados do CRM e os campos do projetista; equipamentos pela lista oficial da distribuidora; pendências; visualizar e
 * baixar o PDF idêntico ao da planilha.
 */
window.App = window.App || {};

(function (App) {
  'use strict';

  const U = App.U;
  const h = U.h;
  const UI = App.UI;
  const S = App.Store;
  const H = App.Homologacao;

  function opcoes(lista, vazio) { return (vazio != null ? [{ v: '', t: vazio }] : []).concat(lista.map(function (x) { return typeof x === 'string' ? { v: x, t: x } : x; })); }

  function sel(lista, valor, aoMudar, rotulo, vazio) {
    const s = h('select', { 'aria-label': rotulo || '', onchange: function () { aoMudar(s.value); } }, opcoes(lista, vazio).map(function (o) { return h('option', { value: o.v }, o.t); }));
    s.value = valor || '';
    if (valor && s.value !== valor) { s.appendChild(h('option', { value: valor }, valor)); s.value = valor; }
    return s;
  }
  function inp(valor, aoMudar, rotulo, ph, tipo) {
    return h('input', { type: tipo || 'text', value: valor == null ? '' : valor, placeholder: ph || '', 'aria-label': rotulo || '', oninput: function (ev) { aoMudar(ev.target.value); } });
  }

  /** Monta a seção. o: {inst, ctx, mudou, registrar(texto)} */
  function secao(c, o) {
    const inst = o.inst;
    c.appendChild(h('p.ajuda-sec', 'Memorial do "Formulário de Orçamento de Conexão de Geração Distribuída" da Energisa (planilha oficial V6): ',
      'o PDF sai igual ao da planilha. Os dados do cliente e da proposta aprovada vêm do CRM; o projetista preenche a relação de carga (com o fator de demanda), ',
      'o padrão de entrada, as proteções e as coordenadas. Os equipamentos seguem a lista oficial da distribuidora — fora dela, entram como OUTROS/OUTRO e o modelo vai para as Observações.'));
    const box = h('div.homolog');
    c.appendChild(box);
    box.appendChild(h('p.nota', 'Carregando a lista oficial de equipamentos da Energisa…'));
    H.listas().then(function (L) { desenhar(box, o, L); }).catch(function (e) {
      box.replaceChildren(h('p.nota.aviso', 'Não foi possível carregar a lista oficial da Energisa (' + e.message + '). Verifique a conexão e abra a seção de novo.'));
    });
  }

  function padroes() { const c = S.configBruta().homologacao; return (c && c.padroes) || {}; }

  function desenhar(box, o, L) {
    const inst = o.inst;
    box.replaceChildren();
    if (!inst.homologacao) {
      box.appendChild(h('div.homolog-inicio',
        h('p', 'Prepare o memorial com os dados do cliente, da proposta aprovada e da obra. Depois é só completar os campos do projetista.'),
        h('button.btn.primario.btn-homolog-preparar', {
          type: 'button', onclick: function () {
            inst.homologacao = H.sugerir(inst, o.ctx, L, padroes());
            o.mudou(); desenhar(box, o, L);
            UI.toast('Memorial preparado com os dados do CRM. Complete os campos do projetista.', 'ok');
          }
        }, '📑 Preparar o memorial')));
      return;
    }
    const hm = inst.homologacao;
    const lista = H.listaDe(L, hm.distribuidora);
    const mudou = function (redesenho) { hm.atualizadoEm = new Date().toISOString(); o.mudou(); pintarResumo(); if (redesenho) desenhar(box, o, L); };

    // ---------- resumo: pendências e botões
    const resumo = h('div.homolog-resumo');
    box.appendChild(resumo);
    function pintarResumo() {
      const pend = H.pendencias(hm);
      const c = H.calcular(hm);
      resumo.replaceChildren(
        h('div.homolog-totais', h('span', 'Potência de geração: ', h('strong', H.fmt.dec2(c.potGeracao) + ' kW')), h('span', 'Carga instalada: ', h('strong', H.fmt.geral(c.totKw) + ' kW')),
          h('span', 'Demanda: ', h('strong', H.fmt.dec2(c.totDem) + ' kW')), h('span', 'Páginas: ', h('strong', String(H.paginas(hm).length)))),
        pend.length ? h('details.homolog-pendencias', h('summary', '⚠ ' + pend.length + (pend.length === 1 ? ' campo pendente' : ' campos pendentes')), h('ul', pend.map(function (p) { return h('li', p); })))
          : h('p.nota.ok', '✓ Todos os campos obrigatórios da planilha preenchidos.'),
        h('div.barra-itens',
          h('button.btn.pequeno', { type: 'button', onclick: function () { H.puxarCrm(hm, inst, o.ctx, L, padroes()); mudou(true); UI.toast('Dados do cliente e da proposta atualizados.', 'ok'); } }, '↻ Puxar dados do CRM'),
          h('button.btn.pequeno.btn-homolog-ver', { type: 'button', onclick: function () { App.Visualizar.abrir(function () { return App.HomologacaoPdf.gerar(hm); }, { titulo: 'Memorial Energisa — ' + (hm.titular || '') }); } }, '👁 Visualizar'),
          h('button.btn.pequeno.primario.btn-homolog-pdf', { type: 'button', onclick: baixar }, '⬇ Memorial em PDF')));
    }
    async function baixar(ev) {
      const pend = H.pendencias(hm);
      if (pend.length && !(await UI.confirmar('Faltam ' + pend.length + ' campo(s) obrigatório(s) da planilha (' + pend.slice(0, 4).join('; ') + (pend.length > 4 ? '…' : '') + '). Gerar o memorial mesmo assim?', 'Gerar mesmo assim'))) return;
      const b = ev && ev.target;
      if (b) { b.disabled = true; b.textContent = 'Gerando…'; }
      try {
        const g = await App.HomologacaoPdf.gerar(hm);
        U.download(g.blob, g.nome);
        S.salvarConfig('homologacao', Object.assign({}, S.configBruta().homologacao || {}, { padroes: H.padroesDe(hm) }));
        hm.geradoEm = new Date().toISOString();
        if (o.registrar) o.registrar('📑 Memorial Energisa (V6) gerado: ' + g.paginas.length + ' páginas' + (g.assinado ? ', com a assinatura do projetista' : '') + '.');
        o.mudou();
        UI.toast('Memorial gerado: ' + g.nome, 'ok');
      } catch (e) {
        console.error(e);
        UI.toast(e.message, 'erro');
      } finally {
        if (b) { b.disabled = false; b.textContent = '⬇ Memorial em PDF'; }
      }
    }
    pintarResumo();

    const grupo = function (titulo, aberto, conteudo) { box.appendChild(h('details.homolog-grupo', { open: !!aberto }, h('summary', titulo), conteudo)); };

    // ---------- 1. unidade consumidora e solicitação
    const ct = H.contatos(hm.distribuidora);
    grupo('1. Unidade consumidora e solicitação', true, h('div',
      UI.grade([
        { k: 'distribuidora', label: 'Distribuidora', type: 'select', options: Object.keys(H.TENSOES).map(function (k) { return { v: k, t: k + ' — ' + H.contatos(k).empresa }; }) },
        { k: 'uc', label: 'Código do cliente (UC)' },
        { k: 'classe', label: 'Classe', type: 'select', options: H.CLASSES },
        { k: 'titular', label: 'Titular da UC', cls: 'span2' },
        { k: 'documento', label: 'CNPJ/CPF', help: H.fmt.documento(hm.documento) },
        { k: 'logradouro', label: 'Logradouro', cls: 'span2' },
        { k: 'numero', label: 'Nº' },
        { k: 'bairro', label: 'Bairro' },
        { k: 'cidade', label: 'Cidade' },
        { k: 'uf', label: 'UF' },
        { k: 'cep', label: 'CEP' },
        { k: 'email', label: 'E-mail' },
        { k: 'celular', label: 'Celular', type: 'tel' },
        { k: 'telefone', label: 'Telefone fixo', type: 'tel' },
        { k: 'conexao', label: 'Tipo de conexão (padrão)', type: 'select', options: H.CONEXOES },
        { k: 'tensao', label: 'Tensão de atendimento (V)', type: 'select', options: H.tensoes(hm.distribuidora) },
        { k: 'ramal', label: 'Tipo de ramal', type: 'select', options: H.RAMAIS },
        { k: 'potInstalada', label: 'Potência instalada (kW)', type: 'number', placeholder: 'Auto: ' + H.fmt.dec2(H.calcular(hm).totDem), help: 'Em branco = demanda da relação de carga.' }
      ], hm, function (k) { mudou(k === 'distribuidora' || k === 'conexao'); }, 3),
      h('p.ajuda-sec', 'Contatos na distribuidora (automático): ' + ct.empresa + ' · ' + ct.telefone + ' · ' + ct.email + ' · ' + ct.area),
      h('h4.secao-form', '6. Responsável (Cliente/Procurador Legal)'),
      UI.grade([
        { k: 'nome', label: 'Nome', placeholder: hm.titular },
        { k: 'telefone', label: 'Telefone', type: 'tel', placeholder: H.fmt.telefone(hm.celular || hm.telefone) },
        { k: 'email', label: 'E-mail', placeholder: hm.email }
      ], hm.resp, function () { mudou(); }, 3)));

    // ---------- 2. relação de carga
    const cargaBox = h('div');
    function pintarCargas() {
      const c = H.calcular(hm);
      const tb = h('tbody');
      hm.cargas.forEach(function (l, i) {
        const cl = c.cargas[i] || {};
        tb.appendChild(h('tr',
          h('td', inp(l.qtd, function (v) { l.qtd = v; mudou(); atual(); }, 'Quantidade', '', 'number')),
          h('td', inp(l.equip, function (v) { l.equip = v; mudou(); }, 'Equipamento', 'Ex.: CHUVEIRO')),
          h('td', inp(l.w, function (v) { l.w = v; mudou(); atual(); }, 'Potência unitária (W)', '', 'number')),
          h('td.num.calc', cl.kw != null ? H.fmt.geral(cl.kw) : '—'),
          h('td', inp(l.fator, function (v) { l.fator = v; mudou(); atual(); }, 'Fator de demanda', 'Ex.: 0,59')),
          h('td.num.calc', cl.dem != null ? H.fmt.dec2(cl.dem) : '—'),
          h('td.acoes-col', h('button.btn-icone.perigo', { type: 'button', 'aria-label': 'Remover carga', onclick: function () { hm.cargas.splice(i, 1); mudou(); pintarCargas(); } }, '×'))));
      });
      const atual = function () { const c2 = H.calcular(hm); Array.prototype.forEach.call(tb.children, function (tr, i) { const x = c2.cargas[i] || {}; tr.children[3].textContent = x.kw != null ? H.fmt.geral(x.kw) : '—'; tr.children[5].textContent = x.dem != null ? H.fmt.dec2(x.dem) : '—'; }); tot.textContent = 'Total: ' + H.fmt.geral(c2.totKw) + ' kW instalados · demanda ' + H.fmt.dec2(c2.totDem) + ' kW'; };
      const tot = h('p.homolog-total', 'Total: ' + H.fmt.geral(c.totKw) + ' kW instalados · demanda ' + H.fmt.dec2(c.totDem) + ' kW');
      cargaBox.replaceChildren(
        h('div.tabela-rolagem', h('table.tabela.editavel.homolog-tab', h('thead', h('tr', ['Qtd.', 'Equipamento', 'Pot. (W)', 'Total (kW)', 'Fator de demanda', 'Demanda (kW)', ''].map(function (t) { return h('th', t); }))), tb)),
        tot,
        hm.cargas.length < H.LIMITES.cargas ? h('button.btn.pequeno.btn-homolog-carga', { type: 'button', onclick: function () { hm.cargas.push({ qtd: '', equip: '', w: '', fator: '' }); mudou(); pintarCargas(); } }, '+ Carga') : h('small', 'Limite de 20 linhas da planilha.'));
    }
    pintarCargas();
    grupo('2. Relação de carga e cálculo de demanda', !hm.cargas.length, h('div', h('p.ajuda-sec', 'O fator de demanda é do projetista; potência total e demanda saem pelas fórmulas da planilha.'), cargaBox));

    // ---------- 3. checklist do formulário
    grupo('3. Checklist de documentos e declarações', false, h('div.homolog-checklist', H.ITENS.map(function (it) {
      const cod = it[0];
      if (cod === '3.1') {
        return h('label.homolog-item', h('span.cod', cod), h('span', it[1]), sel(['SIM', 'NÃO'], hm.checklist['3.1'], function (v) { hm.checklist['3.1'] = v; mudou(); }, 'Item 3.1', '—'));
      }
      const cb = h('input', { type: 'checkbox', onchange: function () { if (cb.checked) hm.checklist[cod] = 'X'; else delete hm.checklist[cod]; mudou(); } });
      cb.checked = !!hm.checklist[cod];
      return h('label.homolog-item', cb, h('span.cod', cod), h('span', it[1]));
    })));

    // ---------- 4. padrão de entrada, proteções e coordenadas
    const pad = hm.padrao, pr = hm.protecoes, bt = hm.bitolas, utm = hm.utm;
    const coordH = App.Coordenadas.barra({ alvo: hm, ruas: null, aoMudar: function () { mudou(true); } });
    grupo('4. Padrão de entrada, proteções e coordenadas', true, h('div',
      UI.grade([
        { k: 'disjGeral', label: 'Disjuntor geral (A)', type: 'number' },
        { k: 'fatorPot', label: 'Fator de potência' },
        { k: 'modalidade', label: 'Modalidade', type: 'select', options: H.MODALIDADES },
        { k: 'hastes', label: 'Número de hastes', type: 'number' },
        { k: 'potTrafo', label: 'Potência do trafo (kVA)', type: 'select', options: opcoes(H.TRAFOS, '—') }
      ], pad, function () { mudou(); }, 3),
      h('h4.secao-form', 'Proteções (digitadas pelo projetista — vão para o diagrama unifilar)'),
      UI.grade([
        { k: 'dpsCa', label: 'DPS CA (kA)', type: 'number' }, { k: 'disjCa', label: 'Disjuntor CA (A)', type: 'number' },
        { k: 'dpsCc', label: 'DPS CC (kA)', type: 'number' }, { k: 'disjCc', label: 'Disjuntor CC (A)', type: 'number' }
      ], pr, function () { mudou(); }, 4),
      h('h4.secao-form', 'Cabos e ligação'),
      UI.grade([{ k: 'tipoTensao', label: 'Tipo de tensão', type: 'select', options: ['BAIXA', 'ALTA'] }, { k: 'cabos', label: 'Cabos por fase', type: 'number' },
        { k: 'gdInstalado', label: 'Sistema GD já instalado?', type: 'select', options: ['NÃO', 'SIM'] }, { k: 'zona', label: 'Zona', type: 'select', options: ['URBANO', 'RURAL'] }], hm, function () { mudou(); }, 4),
      UI.grade([{ k: 'fase', label: 'Bitola fase (mm²)', type: 'number' }, { k: 'neutro', label: 'Bitola neutro (mm²)', type: 'number' }, { k: 'terra', label: 'Bitola terra (mm²)', type: 'number' }], bt, function () { mudou(); }, 3),
      UI.grade([{ k: 'mes', label: 'Previsão de ligação (mês)', type: 'select', options: opcoes(H.MESES, '—') }, { k: 'ano', label: 'Ano', type: 'number' }], hm.previsao, function () { mudou(); }, 3),
      h('h4.secao-form', 'Coordenadas do padrão de entrada (UTM — digitadas pelo projetista)'),
      UI.grade([{ k: 'fuso', label: 'Fuso', type: 'select', options: App.Coordenadas.opcoesFuso(H.FUSOS) }, { k: 'x', label: 'X (LONG) — 6 dígitos' }, { k: 'y', label: 'Y (LAT) — 7 dígitos' }], utm,
        function () { delete hm.geo; coordH.pintar(); mudou(); }, 3),
      coordH));

    // ---------- 5/6. equipamentos (lista oficial)
    function editorEquip(rows, tipo, limite, listaTipo, rotuloAdd) {
      const wrap = h('div');
      function pintar() {
        const caixa = h('div.homolog-equip' + (tipo === 'mod' ? '.mod' : '.inv'));
        rows.forEach(function (r, i) {
          const sit = H.situacao(listaTipo, r.fab, r.modelo);
          const fabs = Object.keys(listaTipo).sort(function (a, b) { return a.replace(/^\d+\s*-\s*/, '').localeCompare(b.replace(/^\d+\s*-\s*/, '')); }).concat([H.OUTROS]);
          const modelos = (listaTipo[r.fab] || []).concat([H.OUTRO]);
          const lembrar = function () {
            if (!r.equipamentoId) return;
            const eq = S.get('equipamentos', r.equipamentoId);
            if (!eq) return;
            eq.energisa = Object.assign({}, eq.energisa || {}); eq.energisa[hm.distribuidora] = { fab: r.fab, modelo: r.modelo };
            S.save('equipamentos', eq);
          };
          const campo = function (rot, el, cls) { return h('label.homolog-campo' + (cls || ''), h('span', rot), el); };
          caixa.appendChild(h('div.homolog-linha',
            h('div.homolog-linha-topo', h('strong', (tipo === 'mod' ? 'Módulo ' : 'Inversor ') + (i + 1)),
              h('button.btn-icone.perigo', { type: 'button', 'aria-label': 'Remover linha', onclick: function () { rows.splice(i, 1); mudou(); pintar(); } }, '×')),
            h('div.homolog-linha-campos',
              campo('Fabricante (lista oficial)', sel(fabs, r.fab, function (v) { r.fab = v; r.modelo = v === H.OUTROS ? H.OUTRO : ''; lembrar(); mudou(); pintar(); }, 'Fabricante (lista oficial)', '— fabricante —'), '.largo'),
              campo('Modelo (lista oficial)', sel(modelos, r.modelo, function (v) { r.modelo = v; lembrar(); mudou(); pintar(); }, 'Modelo (lista oficial)', '— modelo —'), '.largo'),
              campo('Qtd.', inp(r.qtd, function (v) { r.qtd = v; mudou(); }, 'Quantidade', '', 'number')),
              tipo === 'mod' ? campo('Área (m²)', inp(r.area, function (v) { r.area = v; mudou(); }, 'Área do arranjo (m²)', 'm²')) : null,
              campo('Potência (kW)', inp(r.pot, function (v) { r.pot = v; mudou(); }, 'Potência (kW)', tipo === 'mod' ? 'Ex.: 0,55' : 'Ex.: 5')),
              tipo === 'inv' ? campo('Tensão (V)', inp(r.tensao, function (v) { r.tensao = v; mudou(); }, 'Tensão nominal (V)', '220')) : null),
            h('div.mini' + (sit === 'lista' ? '.ok-txt' : '.aviso-txt'), sit === 'lista' ? '✓ na lista oficial' : (sit === 'modelo' ? '⚠ modelo fora da lista → OUTRO + Observações' : '⚠ fora da lista → OUTROS + Observações')),
            sit !== 'lista' ? campo('Fabricante e modelo reais (vão automaticamente para as Observações)', inp(r.crm, function (v) { r.crm = v; mudou(); }, 'Fabricante e modelo para as Observações', 'Ex.: DMEGC DM625G12RT-B66HBW-P'), '.inteiro') : null));
        });
        wrap.replaceChildren(caixa,
          rows.length < limite ? h('button.btn.pequeno', { type: 'button', onclick: function () { rows.push(H.novaLinhaEquip(tipo)); mudou(); pintar(); } }, rotuloAdd) : null);
      }
      pintar();
      return wrap;
    }
    grupo('5. Módulos e inversores (lista oficial da ' + hm.distribuidora + ')', true, h('div',
      h('h4.secao-form', 'Módulos'), editorEquip(hm.modulos, 'mod', H.LIMITES.modulos, lista.modulos, '+ Módulo'),
      h('h4.secao-form', 'Inversores'), editorEquip(hm.inversores, 'inv', H.LIMITES.inversores, lista.inversores, '+ Inversor')));
    grupo('6. Geração já existente na UC (página condicional)', H.calcular(hm).temGd, h('div',
      h('p.ajuda-sec', 'Preencha só se a unidade já tem geração instalada: a página "Formulário para geração existente" entra no PDF e a potência soma à de geração.'),
      h('h4.secao-form', 'Módulos existentes'), editorEquip(hm.gd.modulos, 'mod', H.LIMITES.gd, lista.modulos, '+ Módulo existente'),
      h('h4.secao-form', 'Inversores existentes'), editorEquip(hm.gd.inversores, 'inv', H.LIMITES.gd, lista.inversores, '+ Inversor existente')));

    // ---------- 7. UCs beneficiárias
    const benBox = h('div');
    function pintarBen() {
      const tb = h('tbody');
      hm.beneficiarias.forEach(function (b, i) {
        tb.appendChild(h('tr',
          h('td', inp(b.uc, function (v) { b.uc = v; mudou(); }, 'UC beneficiária')),
          h('td', inp(b.nome, function (v) { b.nome = v; mudou(); }, 'Nome do titular')),
          h('td', inp(b.cpf, function (v) { b.cpf = v; mudou(); }, 'CPF/CNPJ')),
          h('td', inp(b.endereco, function (v) { b.endereco = v; mudou(); }, 'Endereço')),
          h('td', inp(b.pct, function (v) { b.pct = v; mudou(); somaBen(); }, 'Percentual (%)', '%', 'number')),
          h('td.acoes-col', h('button.btn-icone.perigo', { type: 'button', 'aria-label': 'Remover UC', onclick: function () { hm.beneficiarias.splice(i, 1); mudou(true); } }, '×'))));
      });
      const soma = h('p.homolog-total');
      const somaBen = function () { const t = hm.beneficiarias.reduce(function (s, b) { return s + (U.num(b.pct) || 0); }, 0); soma.textContent = 'Soma dos percentuais: ' + H.fmt.geral(t) + '% (até 100%; a diferença fica na UC geradora)'; soma.className = 'homolog-total' + (t > 100 ? ' aviso-txt' : ''); };
      somaBen();
      benBox.replaceChildren(h('div.tabela-rolagem', h('table.tabela.editavel.homolog-tab', h('thead', h('tr', ['UC', 'Nome do titular', 'CPF/CNPJ', 'Endereço', '%', ''].map(function (t) { return h('th', t); }))), tb)), soma,
        hm.beneficiarias.length < H.LIMITES.beneficiarias ? h('button.btn.pequeno.btn-homolog-ben', { type: 'button', onclick: function () { hm.beneficiarias.push({ uc: '', nome: hm.titular, cpf: H.fmt.documento(hm.documento), endereco: '', pct: '' }); mudou(true); } }, '+ UC beneficiária') : null);
    }
    pintarBen();
    grupo('7. UCs beneficiárias (página condicional)', hm.beneficiarias.length > 0, h('div',
      h('p.ajuda-sec', 'Autoconsumo remoto, múltiplas UCs ou geração compartilhada: a página de cadastro das UCs beneficiárias entra no PDF e as Observações recebem ">>>POSSUI UC BENEFICIÁRIA<<<".'), benBox));

    // ---------- 8. observações e assinatura
    const auto = h('pre.homolog-obs');
    const pintarObs = function () { auto.textContent = H.observacoes(hm, L) || '(sem observações)'; };
    pintarObs();
    const g = App.Assinatura && App.Assinatura.guardada ? App.Assinatura.guardada() : null;
    grupo('8. Observações e assinatura', false, h('div',
      h('p.ajuda-sec', 'Texto que vai no campo Observações do memorial (automático + o que você digitar abaixo):'), auto,
      UI.campo({ k: 'observacoes', label: 'Observações do projetista', type: 'textarea', rows: 2 }, hm, function () { mudou(); pintarObs(); }),
      UI.campo({ k: 'assinarProjetista', label: 'Incluir a assinatura do projetista (guardada em Configurações › Empresa)', type: 'checkbox' }, hm, function () { mudou(); }),
      g ? null : h('p.nota.aviso', 'Nenhuma assinatura guardada do responsável técnico: as linhas de assinatura saem em branco.')));
  }

  App.HomologacaoTela = { secao: secao };
})(window.App);
