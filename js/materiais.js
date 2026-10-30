/*
 * Materiais CA (infraestrutura elétrica: quadro, DPS, disjuntores, cabos, eletrodutos, conduletes): a lista da proposta, que dá
 * o valor do campo Infraestrutura elétrica CA (custo do cadastro × quantidade), e os materiais consumidos na instalação
 * (previsto na proposta × usado na obra, com os itens lançados dos pedidos de compra).
 */
window.App = window.App || {};

(function (App) {
  'use strict';

  const U = App.U;
  const h = U.h;

  function chave(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }

  /** Custo do material: o da última compra ou, sem compra lançada, o preço unitário do cadastro. */
  function custoDe(eq) {
    const c = U.num(eq && eq.custo);
    return c > 0 ? c : U.numOr(eq && eq.preco, 0);
  }

  function linha(x) {
    return Object.assign({ id: 'mt-' + U.uid(), equipamentoId: '', descricao: '', unidade: 'un', qtd: '', custo: '' }, x || {});
  }

  function linhaDe(eq, qtd) {
    return linha({ equipamentoId: eq.id, descricao: eq.descricao || '', unidade: eq.unidade || 'un', qtd: qtd == null ? 1 : qtd, custo: custoDe(eq) });
  }

  /** Materiais do cadastro disponíveis para a lista: ativos, os da infraestrutura CA primeiro. */
  function opcoes(equipamentos) {
    return (equipamentos || []).filter(function (e) { return e.tipo === 'material' && e.ativo !== false; }).sort(function (a, b) {
      return (!!b.infraCA - !!a.infraCA) || String(a.descricao || '').localeCompare(String(b.descricao || ''), 'pt-BR');
    });
  }

  /** Soma de quantidade × custo (campo da quantidade: 'qtd' ou, na instalação, 'qtdPrevista'). */
  function total(lista, campo) {
    const k = campo || 'qtd';
    return U.round((lista || []).reduce(function (s, m) { return s + U.numOr(m[k], 0) * U.numOr(m.custo, 0); }, 0), 2);
  }

  /** Atualiza o custo das linhas ligadas ao cadastro (último custo de compra). Devolve quantas mudaram. */
  function atualizarCustos(lista, equipamentos) {
    let n = 0;
    (lista || []).forEach(function (m) {
      const eq = m.equipamentoId && (equipamentos || []).find(function (e) { return e.id === m.equipamentoId; });
      if (!eq) return;
      const c = custoDe(eq);
      if (c > 0 && Math.abs(c - U.numOr(m.custo, 0)) > 0.00005) { m.custo = c; n++; }
    });
    return n;
  }

  function mesma(a, b) {
    if (a.equipamentoId && b.equipamentoId) return a.equipamentoId === b.equipamentoId;
    return !!chave(a.descricao) && chave(a.descricao) === chave(b.descricao);
  }

  /** Materiais da instalação a partir da lista da proposta: quantidade prevista; a usada é lançada na obra. */
  function daProposta(p) {
    const lista = p && p.infraModo === 'lista' ? (p.materiaisCA || []) : [];
    return lista.filter(function (m) { return chave(m.descricao); }).map(function (m) {
      return linha({ equipamentoId: m.equipamentoId || '', descricao: m.descricao, unidade: m.unidade || 'un', qtdPrevista: U.numOr(m.qtd, 0), qtd: '', custo: U.numOr(m.custo, 0), origem: 'proposta' });
    });
  }

  /** Puxa a lista da proposta para a instalação: atualiza o previsto das linhas que já existem e acrescenta as que faltam. */
  function puxarProposta(inst, p) {
    if (!Array.isArray(inst.materiais)) inst.materiais = [];
    const novas = daProposta(p);
    novas.forEach(function (nv) {
      const ex = inst.materiais.find(function (m) { return mesma(m, nv); });
      if (ex) {
        ex.qtdPrevista = nv.qtdPrevista;
        if (!(U.num(ex.custo) > 0)) ex.custo = nv.custo;
      } else inst.materiais.push(nv);
    });
    return novas.length;
  }

  /** Lança os itens de um pedido de compra como usados na obra (soma às quantidades, com o custo de aquisição do pedido). */
  function lancarCompra(inst, c) {
    const Cp = App.Compra;
    if (!Array.isArray(inst.materiais)) inst.materiais = [];
    let n = 0;
    (c.itens || []).forEach(function (it) {
      if (!chave(it.descricao) || !(U.num(it.qtd) > 0)) return;
      const custo = Cp.custoUnitario(c, it, true);
      const nv = { equipamentoId: it.equipamentoId || '', descricao: it.descricao };
      const ex = inst.materiais.find(function (m) { return mesma(m, nv); });
      if (ex) {
        ex.qtd = U.round(U.numOr(ex.qtd, 0) + U.num(it.qtd), 4);
        ex.custo = custo;
        if (!ex.equipamentoId && it.equipamentoId) ex.equipamentoId = it.equipamentoId;
      } else {
        inst.materiais.push(linha({
          equipamentoId: it.equipamentoId || '', descricao: String(it.descricao).trim(), unidade: Cp.unidade(it.unidade) || it.unidade || 'un',
          qtdPrevista: '', qtd: U.num(it.qtd), custo: custo, origem: 'compra'
        }));
      }
      n++;
    });
    inst.comprasLancadas = (inst.comprasLancadas || []).filter(function (id) { return id !== c.id; }).concat(c.id ? [c.id] : []);
    return n;
  }

  /** Totais da instalação: previsto (lista da proposta), usado e o orçado no campo Infraestrutura CA da proposta. */
  function resumo(inst, prop) {
    const ms = inst.materiais || [];
    const previsto = total(ms, 'qtdPrevista'), usado = total(ms, 'qtd');
    const orcado = prop && App.Calc ? App.Calc.infraValor(prop) : null;
    const base = previsto > 0 ? previsto : (orcado || 0);
    return { previsto: previsto, usado: usado, orcado: orcado, diferenca: U.round(usado - base, 2), base: base, lancados: ms.filter(function (m) { return U.num(m.qtd) > 0; }).length, itens: ms.length };
  }

  /** Listas para copiar na proposta: o consumo real das obras e as listas de outras propostas. */
  function fontes(propostas, instalacoes, idAtual) {
    const l = [];
    (instalacoes || []).forEach(function (i) {
      const ms = (i.materiais || []).filter(function (m) { return chave(m.descricao) && U.num(m.qtd) > 0; });
      if (ms.length) l.push({ id: 'i:' + i.id, tipo: 'obra', titulo: i.titulo || i.clienteNome || 'Obra', sub: 'Consumo real da obra · ' + ms.length + (ms.length === 1 ? ' item' : ' itens'), valor: total(ms), linhas: ms });
    });
    (propostas || []).forEach(function (p) {
      if (p.id === idAtual || p.infraModo !== 'lista') return;
      const ms = (p.materiaisCA || []).filter(function (m) { return chave(m.descricao) && U.num(m.qtd) > 0; });
      if (ms.length) l.push({ id: 'p:' + p.id, tipo: 'proposta', titulo: (p.numero || 'Proposta') + ' — ' + (p.clienteNome || 'sem cliente'), sub: 'Lista da proposta · ' + ms.length + (ms.length === 1 ? ' item' : ' itens'), valor: total(ms), linhas: ms });
    });
    return l;
  }

  /** Copia a lista da fonte (custo atual do cadastro nos materiais cadastrados); substituir ou somar às quantidades. */
  function copiar(destino, fonte, equipamentos, substituir) {
    const eqs = {};
    (equipamentos || []).forEach(function (e) { eqs[e.id] = e; });
    const novas = (fonte.linhas || []).map(function (m) {
      const eq = m.equipamentoId && eqs[m.equipamentoId];
      return linha({
        equipamentoId: eq ? eq.id : '', descricao: eq ? eq.descricao : m.descricao, unidade: eq ? eq.unidade || 'un' : m.unidade || 'un',
        qtd: U.numOr(m.qtd, 0), custo: eq ? custoDe(eq) : U.numOr(m.custo, 0)
      });
    });
    if (substituir) destino.splice(0, destino.length);
    novas.forEach(function (nv) {
      const ex = destino.find(function (m) { return mesma(m, nv); });
      if (ex) ex.qtd = U.round(U.numOr(ex.qtd, 0) + nv.qtd, 4); else destino.push(nv);
    });
    return novas.length;
  }

  /* ------------------------------------------------------------ editor (proposta e instalação) */

  function unidades(atual) {
    const base = (App.Avulsa && App.Avulsa.UNIDADES_MATERIAL) || ['un', 'pç', 'm', 'cj', 'pt', 'kg'];
    return !atual || base.indexOf(atual) >= 0 ? base : base.concat([atual]);
  }

  /**
   * Lista editável: material (digitado ou escolhido do cadastro, com o custo da última compra), unidade, quantidade, custo e total.
   * o: {equipamentos, modo: 'proposta' | 'instalacao', botoes: [elementos], vazio}. aoMudar() a cada alteração.
   */
  function editor(lista, o, aoMudar) {
    o = o || {};
    const UI = App.UI;
    const naObra = o.modo === 'instalacao';
    const mats = opcoes(o.equipamentos);
    const porNome = {};
    mats.forEach(function (e) { const k = chave(e.descricao); if (k && !porNome[k]) porNome[k] = e; });
    const idLista = 'mats-' + U.uid();
    const box = h('div.materiais-ca');
    const rodape = h('div.materiais-total');
    const avisar = function () { if (aoMudar) aoMudar(); };

    function totais() {
      rodape.innerHTML = '';
      if (naObra) {
        const pv = total(lista, 'qtdPrevista'), us = total(lista, 'qtd');
        rodape.appendChild(h('span', 'Previsto ', h('strong', U.brl(pv))));
        rodape.appendChild(h('span', 'Usado ', h('strong', U.brl(us))));
        if (pv > 0) {
          const d = U.round(us - pv, 2);
          rodape.appendChild(h('span' + (d > 0 ? '.acima' : (d < 0 ? '.abaixo' : '')), 'Diferença ', h('strong', (d > 0 ? '+' : '') + U.brl(d))));
        }
      } else rodape.appendChild(h('span', 'Total dos materiais CA ', h('strong', U.brl(total(lista)))));
    }

    function linhaTabela(m, i) {
      const totalCel = h('td.num.materiais-subtotal');
      const atualizarTotal = function () { totalCel.textContent = U.brl(U.numOr(m.qtd, 0) * U.numOr(m.custo, 0)); totais(); };
      const origem = h('small.materiais-origem', [m.equipamentoId ? 'do cadastro' : 'digitado', naObra && m.origem === 'compra' ? 'pedido de compra' : '', naObra && m.origem === 'proposta' ? 'da proposta' : ''].filter(Boolean).join(' · '));
      const nome = h('input', {
        type: 'text', value: m.descricao || '', list: idLista, placeholder: mats.length ? 'Digite ou escolha do cadastro' : 'Descrição do material', 'aria-label': 'Material', autocomplete: 'off',
        oninput: function () { m.descricao = nome.value; avisar(); },
        onchange: function () {
          const eq = porNome[chave(nome.value)];
          if (eq) {
            const outro = eq.id !== m.equipamentoId;
            m.equipamentoId = eq.id; m.descricao = eq.descricao; m.unidade = eq.unidade || 'un';
            if (outro || !(U.num(m.custo) > 0)) m.custo = custoDe(eq);
          } else m.equipamentoId = '';
          desenhar();
          avisar();
        }
      });
      const num = function (k, tipo) {
        const c = UI.campo({ k: k, type: tipo || 'number', placeholder: '0' }, m, function () { atualizarTotal(); avisar(); });
        return c;
      };
      const un = UI.campo({ k: 'unidade', type: 'select', options: unidades(m.unidade) }, m, avisar);
      atualizarTotal();
      totalCel.setAttribute('data-rotulo', naObra ? 'Total usado' : 'Total');
      return h('tr',
        h('td.materiais-nome', nome, origem),
        h('td.materiais-un', { 'data-rotulo': 'Un.' }, un),
        naObra ? h('td.materiais-qtd', { 'data-rotulo': 'Previsto' }, num('qtdPrevista')) : null,
        h('td.materiais-qtd', { 'data-rotulo': naObra ? 'Usado' : 'Qtd.' }, num('qtd')),
        h('td.materiais-custo', { 'data-rotulo': 'Custo unit.' }, num('custo', 'money')),
        totalCel,
        h('td.acoes-col', h('button.btn-icone.perigo', {
          type: 'button', title: 'Remover', 'aria-label': 'Remover material', onclick: function () { lista.splice(i, 1); desenhar(); avisar(); }
        }, '×')));
    }

    function desenhar() {
      box.innerHTML = '';
      box.appendChild(h('datalist', { id: idLista }, mats.map(function (e) {
        return h('option', { value: e.descricao }, (e.infraCA ? 'CA · ' : '') + U.brl(custoDe(e)) + ' / ' + (e.unidade || 'un') + (e.fornecedor ? ' · ' + e.fornecedor : ''));
      })));
      if (!lista.length) box.appendChild(h('p.ajuda-sec.materiais-vazio', o.vazio || 'Nenhum material na lista.'));
      else {
        const cab = ['Material', 'Un.'].concat(naObra ? ['Previsto', 'Usado'] : ['Qtd.']).concat(['Custo unit.', naObra ? 'Total usado' : 'Total', '']);
        const tb = h('tbody');
        lista.forEach(function (m, i) { tb.appendChild(linhaTabela(m, i)); });
        box.appendChild(h('div.tabela-rolagem', h('table.tabela.editavel.tabela-materiais' + (naObra ? '.obra' : ''), h('thead', h('tr', cab.map(function (t, j) { return h('th' + (j >= cab.length - 3 && j < cab.length - 1 ? '.num' : ''), t); }))), tb)));
      }
      box.appendChild(rodape);
      totais();
      box.appendChild(h('div.barra-itens',
        h('button.btn.pequeno', { type: 'button', onclick: function () { lista.push(linha(naObra ? { qtdPrevista: '', origem: 'obra' } : {})); desenhar(); avisar(); const ult = box.querySelector('tbody tr:last-child input'); if (ult) ult.focus(); } }, '+ Adicionar material'),
        mats.length ? h('button.btn.pequeno', {
          type: 'button', title: 'Usa o custo da última compra de cada material do cadastro', onclick: function () {
            const n = atualizarCustos(lista, o.equipamentos);
            desenhar(); if (n) avisar();
            UI.toast(n ? n + ' custo(s) atualizado(s) pelo cadastro.' : 'Os custos já são os do cadastro.', n ? 'ok' : null);
          }
        }, '↻ Atualizar custos pelo cadastro') : null,
        naObra && lista.some(function (m) { return U.num(m.qtdPrevista) > 0 && !(U.num(m.qtd) > 0); }) ? h('button.btn.pequeno', {
          type: 'button', title: 'Preenche o usado com o previsto nas linhas ainda sem quantidade usada', onclick: function () {
            lista.forEach(function (m) { if (U.num(m.qtdPrevista) > 0 && !(U.num(m.qtd) > 0)) m.qtd = U.num(m.qtdPrevista); });
            desenhar(); avisar();
          }
        }, '= Usado igual ao previsto') : null,
        o.botoes || null));
    }

    desenhar();
    box.redesenhar = desenhar;
    return box;
  }

  App.Materiais = {
    custoDe: custoDe, linha: linha, linhaDe: linhaDe, opcoes: opcoes, total: total, atualizarCustos: atualizarCustos, mesma: mesma,
    daProposta: daProposta, puxarProposta: puxarProposta, lancarCompra: lancarCompra, resumo: resumo, fontes: fontes, copiar: copiar, editor: editor
  };
})(window.App);
