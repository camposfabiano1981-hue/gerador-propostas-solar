/*
 * Kits fotovoltaicos salvos (Cadastros › Kits): o conjunto cotado com o distribuidor — kit fechado, com um valor só — e a
 * composição ligada ao cadastro de equipamentos (módulo, inversor, bateria…). A proposta puxa o kit (equipamentos, quantidades e
 * o valor), o orçamento lido num pedido de compra vira kit e a proposta aprovada gera o pedido de compra do kit.
 */
window.App = window.App || {};

(function (App) {
  'use strict';

  const U = App.U;

  const TIPOS = [
    { id: 'ongrid', label: 'On-grid (inversor string)' },
    { id: 'micro', label: 'On-grid com microinversores' },
    { id: 'hibrido', label: 'Híbrido (com baterias)' }
  ];
  const TIPOS_ITEM = [
    { id: 'modulo', label: 'Módulo' }, { id: 'inversor', label: 'Inversor' }, { id: 'micro', label: 'Microinversor' },
    { id: 'hibrido', label: 'Inversor híbrido' }, { id: 'bateria', label: 'Bateria' }, { id: 'estrutura', label: 'Estrutura' },
    { id: 'material', label: 'Material / acessório' }
  ];
  const INVERSORES = ['inversor', 'micro', 'hibrido'];
  const TOLERANCIA = 0.1; // potência do kit até 10% da necessária: "próximo do dimensionamento"

  function arred(v, d) { return U.round(v, d == null ? 2 : d); }
  function num(v) { const n = U.num(v); return isFinite(n) ? n : 0; }
  function semAcento(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function porId(eqs, id) { return id ? (eqs || []).find(function (e) { return e.id === id; }) || null : null; }

  function novoItem(x) { return Object.assign({ id: 'ki-' + U.uid(), tipo: 'material', equipamentoId: '', descricao: '', qtd: 1, unidade: 'un' }, x || {}); }

  function novo() {
    return {
      nome: '', fornecedor: '', tipo: 'ongrid', potenciaKwp: '', itens: [novoItem({ tipo: 'modulo', unidade: 'un' }), novoItem({ tipo: 'inversor', unidade: 'un' })],
      valor: '', frete: '', cotacao: U.todayISO(), validade: '', observacoes: '', ativo: true, compraId: '', precos: [], precoAtualizadoEm: ''
    };
  }

  /** Custo do kit para a proposta: o valor fechado do distribuidor + o frete. */
  function custo(k) { return arred(num(k && k.valor) + num(k && k.frete)); }

  /** Tipo do item pela descrição do documento do fornecedor. */
  function tipoItem(descricao) {
    const s = semAcento(descricao);
    if (/micro\s*-?\s*inversor/.test(s)) return 'micro';
    if (/inversor/.test(s) && /hibrid/.test(s)) return 'hibrido';
    if (/inversor/.test(s)) return 'inversor';
    if (/bateria|battery/.test(s)) return 'bateria';
    // estrutura antes do módulo: "estrutura p/ 4 módulos"
    if (/estrutura|trilho|perfil|gancho|suporte|telhado|fixacao/.test(s)) return 'estrutura';
    if (/modulo|painel|placa\s+(solar|fotovolt)|\b\d{3}\s*w(p)?\b.*(mono|bifacial|half)/.test(s)) return 'modulo';
    return 'material';
  }

  function itemEq(it, eqs) { return porId(eqs, it && it.equipamentoId); }
  function nomeItem(it, eqs) { const e = itemEq(it, eqs); return e ? App.Calc.nomeEquip(e) : String(it.descricao || '').trim(); }
  function itemDoTipo(k, tipos, eqs) {
    return (k.itens || []).find(function (it) { const e = itemEq(it, eqs); const t = e ? e.tipo : it.tipo; return tipos.indexOf(t) >= 0 && num(it.qtd) > 0; }) || null;
  }

  /** Potência do kit (kWp): a informada ou módulos × Wp do módulo do cadastro. */
  function potencia(k, eqs) {
    if (num(k.potenciaKwp) > 0) return num(k.potenciaKwp);
    const it = itemDoTipo(k, ['modulo'], eqs), e = it && itemEq(it, eqs);
    return e && num(e.potencia) > 0 ? arred(num(it.qtd) * num(e.potencia) / 1000, 3) : 0;
  }

  /** Composição em texto: "10× Jinko 550 Wp + 1× Growatt 5 kW". */
  function composicao(k, eqs) {
    return (k.itens || []).filter(function (it) { return num(it.qtd) > 0 && nomeItem(it, eqs); })
      .map(function (it) { return U.fmtSmart(num(it.qtd), 2) + '× ' + nomeItem(it, eqs); }).join(' + ');
  }

  /** Nome curto do equipamento para o nome do kit: fabricante + potência ("Jinko 550 Wp", "Growatt 5 kW", "Deye 5,12 kWh"). */
  function curto(it, eqs) {
    const e = itemEq(it, eqs);
    if (!e) return String(it.descricao || '').trim().split(/\s+/).slice(0, 4).join(' ');
    const pot = e.tipo === 'modulo' && num(e.potencia) > 0 ? num(e.potencia) + ' Wp'
      : (e.tipo === 'bateria' && num(e.energia) > 0 ? U.fmtSmart(num(e.energia), 2) + ' kWh' : (num(e.potencia) > 0 ? U.fmtSmart(num(e.potencia), 2) + ' kW' : ''));
    return [e.fabricante || e.modelo || '', pot].filter(Boolean).join(' ') || App.Calc.nomeEquip(e);
  }

  /** Nome sugerido: "Kit 5,5 kWp — 10× Jinko 550 Wp + 1× Growatt 5 kW". */
  function nomeSugerido(k, eqs) {
    const kwp = potencia(k, eqs);
    const principais = (k.itens || []).filter(function (it) { const e = itemEq(it, eqs); return num(it.qtd) > 0 && ['modulo', 'inversor', 'micro', 'hibrido', 'bateria'].indexOf(e ? e.tipo : it.tipo) >= 0; });
    const comp = principais.map(function (it) { return U.fmtSmart(num(it.qtd), 2) + '× ' + curto(it, eqs); }).join(' + ');
    return ('Kit' + (kwp > 0 ? ' ' + U.fmtSmart(kwp, 2) + ' kWp' : '') + (comp ? ' — ' + comp : '')).slice(0, 140);
  }

  /** Situação da cotação: {estado: 'sem' | 'ok' | 'vence' (até 3 dias) | 'vencida', dias} — dias até (ou desde) a validade. */
  function validade(k, hoje) {
    if (!k || !k.validade) return { estado: 'sem', dias: null };
    const dias = Math.round((new Date(k.validade + 'T12:00:00') - new Date((hoje || U.todayISO()) + 'T12:00:00')) / 864e5);
    return { estado: dias < 0 ? 'vencida' : (dias <= 3 ? 'vence' : 'ok'), dias: dias };
  }

  function textoValidade(k, hoje) {
    const v = validade(k, hoje);
    if (v.estado === 'sem') return 'sem validade informada';
    if (v.estado === 'vencida') return 'cotação vencida há ' + (-v.dias) + (v.dias === -1 ? ' dia' : ' dias') + ' (' + U.dataBR(k.validade) + ')';
    if (v.dias === 0) return 'cotação vence hoje';
    return 'válida até ' + U.dataBR(k.validade) + (v.estado === 'vence' ? ' (vence em ' + v.dias + (v.dias === 1 ? ' dia)' : ' dias)') : '');
  }

  /** Tipo de kit que serve à proposta. */
  function tipoProposta(p) {
    if (p.tipoSistema === 'hibrido') return 'hibrido';
    return p.topologia === 'micro' ? 'micro' : 'ongrid';
  }

  /**
   * Kits para a proposta: ativos, do mesmo tipo primeiro e, dentro do tipo, os de potência mais próxima da necessária
   * (r.kwpNecessario; sem ela, a do sistema). Cada um: {kit, kwp, dif (fração), proximo, mesmoTipo, validade}.
   */
  function sugerir(kits, p, r, eqs, hoje) {
    const alvo = r ? (num(r.kwpNecessario) > 0 ? num(r.kwpNecessario) : num(r.kwp)) : 0;
    const tipo = tipoProposta(p);
    return (kits || []).filter(function (k) { return k.ativo !== false || k.id === p.kitId; }).map(function (k) {
      const kwp = potencia(k, eqs);
      const dif = alvo > 0 && kwp > 0 ? (kwp - alvo) / alvo : null;
      return { kit: k, kwp: kwp, dif: dif, proximo: dif != null && Math.abs(dif) <= TOLERANCIA, mesmoTipo: (k.tipo || 'ongrid') === tipo, validade: validade(k, hoje) };
    }).sort(function (a, b) {
      if (a.mesmoTipo !== b.mesmoTipo) return a.mesmoTipo ? -1 : 1;
      const da = a.dif == null ? 9 : Math.abs(a.dif), db = b.dif == null ? 9 : Math.abs(b.dif);
      return da - db || String(a.kit.nome).localeCompare(String(b.kit.nome));
    });
  }

  /**
   * Avisos do kit na proposta: potência diferente da necessária (mais de 10%), cotação vencida ou vencendo, tipo de sistema
   * diferente e equipamento do kit fora do cadastro.
   */
  function conferir(p, k, r, eqs, hoje) {
    const av = [];
    if (!k) return av;
    const kwp = potencia(k, eqs), alvo = r ? num(r.kwpNecessario) : 0;
    if (kwp > 0 && alvo > 0) {
      const dif = (kwp - alvo) / alvo;
      if (Math.abs(dif) > TOLERANCIA) {
        av.push({ tipo: 'aviso', texto: 'Potência do kit (' + U.fmtSmart(kwp, 2) + ' kWp) ' + (dif < 0 ? 'abaixo' : 'acima') + ' da necessária pelo dimensionamento (' +
          U.fmtSmart(alvo, 2) + ' kWp): ' + (dif > 0 ? '+' : '') + Math.round(dif * 100) + '%.' });
      }
    }
    const v = validade(k, hoje);
    if (v.estado === 'vencida' || v.estado === 'vence') av.push({ tipo: v.estado === 'vencida' ? 'erro' : 'aviso', texto: 'Kit "' + (k.nome || 'sem nome') + '": ' + textoValidade(k, hoje) + '. Confirme o preço com o fornecedor.' });
    if ((k.tipo || 'ongrid') !== tipoProposta(p)) {
      av.push({ tipo: 'aviso', texto: 'O kit é ' + rotulo(k.tipo).toLowerCase() + ' e a proposta é ' + rotulo(tipoProposta(p)).toLowerCase() + '.' });
    }
    (k.itens || []).forEach(function (it) {
      const t = it.tipo;
      if (['modulo', 'inversor', 'micro', 'hibrido', 'bateria'].indexOf(t) >= 0 && num(it.qtd) > 0 && !itemEq(it, eqs)) {
        av.push({ tipo: 'aviso', texto: '"' + (it.descricao || rotuloItem(t)) + '" não está ligado ao cadastro de equipamentos: cadastre (datasheet) e escolha no kit para o dimensionamento usar os dados dele.' });
      }
    });
    return av;
  }

  /**
   * Aplica o kit na proposta: módulo e quantidade, inversor (do tipo da proposta) e quantidade, a topologia (string × micro),
   * a bateria do híbrido e o valor do kit (kit fechado: valor + frete). Devolve {avisos} do que não pôde ser aplicado.
   */
  function aplicar(p, k, eqs) {
    const avisos = [];
    const mod = itemDoTipo(k, ['modulo'], eqs);
    const eMod = mod && itemEq(mod, eqs);
    if (eMod) { p.moduloId = eMod.id; p.nModulos = String(Math.round(num(mod.qtd))); }
    else if (mod) avisos.push('Módulo do kit fora do cadastro: a proposta mantém o módulo escolhido.');
    if (p.tipoSistema !== 'hibrido' && (k.tipo === 'micro' || k.tipo === 'ongrid')) p.topologia = k.tipo === 'micro' ? 'micro' : 'string';
    const tipoInv = p.tipoSistema === 'hibrido' ? 'hibrido' : (p.topologia === 'micro' ? 'micro' : 'inversor');
    const inv = itemDoTipo(k, INVERSORES, eqs);
    const eInv = inv && itemEq(inv, eqs);
    if (eInv && eInv.tipo === tipoInv) { p.inversorId = eInv.id; p.nInversores = String(Math.round(num(inv.qtd))); }
    else if (inv) avisos.push(eInv ? 'O inversor do kit (' + rotuloItem(eInv.tipo).toLowerCase() + ') não é do tipo da proposta: a proposta mantém o inversor escolhido.' : 'Inversor do kit fora do cadastro: a proposta mantém o inversor escolhido.');
    if (p.tipoSistema === 'hibrido') {
      const bat = itemDoTipo(k, ['bateria'], eqs), eBat = bat && itemEq(bat, eqs);
      if (eBat && eBat.tipo === 'bateria') p.bateriaId = eBat.id;
    }
    p.kitManual = true;
    p.kitValor = custo(k);
    p.kitId = k.id;
    p.kitNome = k.nome || nomeSugerido(k, eqs);
    p.kitAplicadoEm = new Date().toISOString();
    return { avisos: avisos };
  }

  function desvincular(p) { delete p.kitId; delete p.kitNome; delete p.kitAplicadoEm; return p; }

  /**
   * Proposta em aberto com kit salvo: se o preço do kit mudou depois de aplicado, o valor do kit da proposta acompanha.
   * Devolve {antes, depois, kit} ou null.
   */
  function atualizarNaProposta(p, kits) {
    if (!p.kitId || !p.kitManual) return null;
    const k = (kits || []).find(function (x) { return x.id === p.kitId; });
    if (!k) return null;
    const novoValor = custo(k), antes = arred(num(p.kitValor));
    if (Math.abs(novoValor - antes) < 0.005 || String(k.precoAtualizadoEm || '') <= String(p.kitAplicadoEm || '')) return null;
    p.kitValor = novoValor;
    p.kitNome = k.nome || p.kitNome;
    p.kitAplicadoEm = new Date().toISOString();
    return { antes: antes, depois: novoValor, kit: k };
  }

  /** Ao salvar o kit: preço (valor ou frete) mudou → data da mudança e histórico (últimos 10). */
  function registrarPreco(k, anterior) {
    const mudou = !anterior || Math.abs(num(anterior.valor) - num(k.valor)) >= 0.005 || Math.abs(num(anterior.frete) - num(k.frete)) >= 0.005;
    if (!mudou) return false;
    const agora = new Date().toISOString();
    k.precoAtualizadoEm = agora;
    k.precos = [{ em: agora, valor: arred(num(k.valor)), frete: arred(num(k.frete)) }].concat(k.precos || []).slice(0, 10);
    return true;
  }

  /** Kit montado a partir da proposta (dimensionamento calculado r): módulo, inversor, bateria do híbrido e o valor do kit. */
  function deProposta(p, r, eqs) {
    const k = novo();
    k.tipo = tipoProposta(p);
    k.itens = [];
    if (r.modulo && r.nModulos > 0) k.itens.push(novoItem({ tipo: 'modulo', equipamentoId: r.modulo.id, descricao: App.Calc.nomeEquip(r.modulo), qtd: r.nModulos }));
    if (r.inversor && r.nInversores > 0) k.itens.push(novoItem({ tipo: r.inversor.tipo, equipamentoId: r.inversor.id, descricao: App.Calc.nomeEquip(r.inversor), qtd: r.nInversores }));
    const hb = r.hibrido;
    if (p.tipoSistema === 'hibrido' && hb && hb.bateria && hb.nBaterias > 0) {
      k.itens.push(novoItem({ tipo: 'bateria', equipamentoId: hb.bateria.id, descricao: App.Calc.nomeEquip(hb.bateria), qtd: hb.nBaterias }));
    }
    k.valor = arred(num(p.kitManual ? p.kitValor : r.kit));
    k.potenciaKwp = '';
    k.nome = nomeSugerido(k, eqs);
    return k;
  }

  /** Equipamento do cadastro mais parecido com a descrição do item do fornecedor (mesmo tipo; marca, modelo e potência). */
  function sugerirEquip(descricao, tipo, eqs) {
    const lista = (eqs || []).filter(function (e) { return e.tipo === tipo && e.ativo !== false; });
    if (!lista.length) return null;
    const s = semAcento(descricao);
    const nums = (s.match(/\d+(?:[.,]\d+)?/g) || []).map(function (x) { return Number(x.replace(',', '.')); });
    let melhor = null;
    lista.forEach(function (e) {
      let nota = App.Compra ? App.Compra.semelhanca(descricao, App.Calc.nomeEquip(e) + ' ' + (e.modelo || '')) : 0;
      const pot = num(e.potencia);
      if (pot > 0 && nums.some(function (n) { return Math.abs(n - pot) < 1e-6 || Math.abs(n - pot * 1000) < 1e-6 || Math.abs(n / 1000 - pot) < 1e-6; })) nota += 0.35;
      if (e.fabricante && s.indexOf(semAcento(e.fabricante)) >= 0) nota += 0.25;
      if (e.modelo && s.replace(/\s+/g, '').indexOf(semAcento(e.modelo).replace(/\s+/g, '')) >= 0) nota += 0.5;
      if (!melhor || nota > melhor.nota) melhor = { eq: e, nota: nota };
    });
    return melhor && melhor.nota >= 0.6 ? melhor.eq : null;
  }

  /**
   * Kit a partir do orçamento do distribuidor (pedido de compra lido): itens com o tipo e o equipamento do cadastro sugeridos,
   * valor fechado (itens − desconto + outras despesas), frete, cotação (data do pedido) e validade.
   */
  function deCompra(c, eqs) {
    const k = novo();
    const t = App.Compra.totais(c);
    k.itens = (c.itens || []).filter(function (it) { return String(it.descricao || '').trim() && num(it.qtd) > 0; }).map(function (it) {
      const ligado = porId(eqs, it.equipamentoId);
      const tipo = ligado ? (ligado.tipo === 'material' ? tipoItem(it.descricao) : ligado.tipo) : tipoItem(it.descricao);
      // sugestão automática só para os equipamentos principais (estrutura e materiais: só o já ligado no pedido)
      const principal = ['modulo', 'inversor', 'micro', 'hibrido', 'bateria'].indexOf(tipo) >= 0;
      const eq = ligado && (ligado.tipo === tipo || tipo === 'material') ? ligado : (principal ? sugerirEquip(it.descricao, tipo, eqs) : null);
      return novoItem({ tipo: tipo, equipamentoId: eq ? eq.id : '', descricao: String(it.descricao).trim(), qtd: num(it.qtd), unidade: it.unidade || 'un' });
    });
    k.valor = arred(t.total - t.frete);
    k.frete = t.frete ? arred(t.frete) : '';
    k.fornecedor = (c.fornecedor && c.fornecedor.nome) || '';
    k.cotacao = c.data || U.todayISO();
    k.validade = c.validade || '';
    k.compraId = c.id || '';
    const inv = itemDoTipo(k, INVERSORES, eqs), eInv = inv && itemEq(inv, eqs);
    const tInv = eInv ? eInv.tipo : (inv ? inv.tipo : '');
    k.tipo = tInv === 'micro' ? 'micro' : (tInv === 'hibrido' || itemDoTipo(k, ['bateria'], eqs) ? 'hibrido' : 'ongrid');
    k.nome = nomeSugerido(k, eqs);
    k.observacoes = 'Do pedido de compra ' + (c.numero || '') + (c.docFornecedor ? ' (orçamento ' + c.docFornecedor + ' do fornecedor)' : '') + '.';
    return k;
  }

  /**
   * Pedido de compra do kit (kit fechado: uma linha com o valor do kit e a composição na descrição e nas observações), ligado à
   * proposta e à obra. o: {propostaId, instalacaoId, numeroProposta}
   */
  function paraCompra(k, eqs, o) {
    o = o || {};
    const c = App.Compra.nova();
    c.situacao = 'pedido';
    c.fornecedor.nome = k.fornecedor || '';
    c.instalacaoId = o.instalacaoId || '';
    c.propostaId = o.propostaId || '';
    c.kitId = k.id || '';
    c.kitFechado = true; // uma linha com o valor do kit: fora do cadastro de materiais
    const comp = composicao(k, eqs);
    const v = arred(num(k.valor));
    c.itens = [App.Compra.novoItem({ descricao: 'Kit fotovoltaico — ' + (k.nome || nomeSugerido(k, eqs)) + ' (kit fechado)', unidade: 'cj', qtd: 1, preco: v, total: v })];
    c.frete = num(k.frete) > 0 ? arred(num(k.frete)) : '';
    c.totalDocumento = custo(k);
    c.observacoes = [comp ? 'Composição do kit: ' + comp + '.' : '', o.numeroProposta ? 'Proposta ' + o.numeroProposta + '.' : '', k.cotacao ? 'Cotação de ' + U.dataBR(k.cotacao) + '.' : ''].filter(Boolean).join(' ');
    return c;
  }

  /** Pedidos de compra do kit da obra (com o kit, ligados à proposta ou à instalação; feitos ou recebidos). */
  function comprasDaObra(compras, p, inst) {
    return (compras || []).filter(function (c) {
      if (!c.kitId || ['pedido', 'recebido', 'pendencia'].indexOf(c.situacao) < 0) return false;
      return (p && c.propostaId === p.id) || (inst && c.instalacaoId && c.instalacaoId === inst.id);
    });
  }

  /** Nome para exibir: "Kit 5 kWp — …" fica como está; outro nome ganha o "Kit " na frente. */
  function titulo(nome) { const n = String(nome || '').trim() || 'kit salvo'; return /^kit\b/i.test(n) ? n : 'Kit ' + n; }

  function rotulo(id) { return (TIPOS.find(function (t) { return t.id === id; }) || TIPOS[0]).label; }
  function rotuloItem(id) { return (TIPOS_ITEM.find(function (t) { return t.id === id; }) || TIPOS_ITEM[TIPOS_ITEM.length - 1]).label; }

  App.Kit = {
    TIPOS: TIPOS, TIPOS_ITEM: TIPOS_ITEM, TOLERANCIA: TOLERANCIA, novo: novo, novoItem: novoItem, custo: custo, tipoItem: tipoItem, potencia: potencia,
    composicao: composicao, nomeSugerido: nomeSugerido, validade: validade, textoValidade: textoValidade, tipoProposta: tipoProposta, sugerir: sugerir,
    conferir: conferir, aplicar: aplicar, desvincular: desvincular, atualizarNaProposta: atualizarNaProposta, registrarPreco: registrarPreco,
    deProposta: deProposta, sugerirEquip: sugerirEquip, deCompra: deCompra, paraCompra: paraCompra, comprasDaObra: comprasDaObra,
    rotulo: rotulo, rotuloItem: rotuloItem, itemEq: itemEq, nomeItem: nomeItem, titulo: titulo
  };
})(window.App);
