/*
 * CRM Solar: indicadores do dashboard (vendas, conversão, funil, tipos de sistema, obras e ordens de serviço) e o registro das
 * mudanças de situação da proposta (datas de aprovação e recusa), a partir das coleções do armazenamento.
 */
window.App = window.App || {};

(function (App) {
  'use strict';

  const U = App.U;

  const PERIODOS = [
    { id: 'mes', label: 'Este mês' }, { id: '3m', label: 'Últimos 3 meses' }, { id: '12m', label: 'Últimos 12 meses' },
    { id: 'ano', label: 'Este ano' }, { id: 'tudo', label: 'Tudo' }
  ];
  const ETAPAS_FUNIL = [
    { id: 'rascunho', label: 'Rascunho' }, { id: 'enviada', label: 'Enviada' }, { id: 'negociacao', label: 'Em negociação' }, { id: 'aprovada', label: 'Aprovada' }
  ];
  // o BESS saiu das propostas novas; as antigas continuam somando no tipo delas
  const TIPOS = [{ id: 'ongrid', label: 'On-Grid' }, { id: 'hibrido', label: 'Híbrido' }, { id: 'offgrid', label: 'Off-Grid' }, { id: 'bess', label: 'BESS' }];
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function dataDe(x) { return new Date(String(x).slice(0, 10) + 'T12:00:00'); }
  function diasEntre(a, b) { return Math.round((dataDe(b) - dataDe(a)) / 86400000); }

  /** Rótulo curto do mês: "2026-08" → "ago/26". */
  function rotuloMes(chave) { const m = /^(\d{4})-(\d{2})/.exec(chave || ''); return m ? MESES[+m[2] - 1] + '/' + m[1].slice(2) : ''; }

  /**
   * Intervalo do período (datas ISO, inclusivas) e o período anterior de mesma duração (para a variação).
   * id: um dos PERIODOS ou "m:AAAA-MM" (um mês escolhido no painel; o anterior é o mês de antes).
   */
  function intervalo(id, hoje) {
    const h = dataDe(hoje || U.todayISO());
    const mm = /^m:(\d{4})-(\d{2})$/.exec(id || '');
    if (mm) {
      const a = +mm[1], m = +mm[2] - 1;
      const fimMes = new Date(a, m + 1, 0, 12);
      return { ini: iso(new Date(a, m, 1, 12)), fim: iso(fimMes > h ? h : fimMes), iniAnt: iso(new Date(a, m - 1, 1, 12)), fimAnt: iso(new Date(a, m, 0, 12)), mes: mm[1] + '-' + mm[2] };
    }
    // este mês e este ano: comparados com os mesmos dias do mês (ou do ano) anterior
    if (id === 'mes') {
      const ultAnt = new Date(h.getFullYear(), h.getMonth(), 0, 12);
      return { ini: iso(new Date(h.getFullYear(), h.getMonth(), 1, 12)), fim: iso(h), iniAnt: iso(new Date(h.getFullYear(), h.getMonth() - 1, 1, 12)),
        fimAnt: iso(new Date(h.getFullYear(), h.getMonth() - 1, Math.min(h.getDate(), ultAnt.getDate()), 12)) };
    }
    if (id === 'ano') {
      const fimAnt = new Date(h.getFullYear() - 1, h.getMonth(), Math.min(h.getDate(), new Date(h.getFullYear() - 1, h.getMonth() + 1, 0, 12).getDate()), 12);
      return { ini: iso(new Date(h.getFullYear(), 0, 1, 12)), fim: iso(h), iniAnt: iso(new Date(h.getFullYear() - 1, 0, 1, 12)), fimAnt: iso(fimAnt) };
    }
    let ini;
    if (id === 'mes') ini = new Date(h.getFullYear(), h.getMonth(), 1, 12);
    else if (id === '3m') ini = new Date(h.getFullYear(), h.getMonth() - 2, 1, 12);
    else if (id === '12m') ini = new Date(h.getFullYear(), h.getMonth() - 11, 1, 12);
    else if (id === 'ano') ini = new Date(h.getFullYear(), 0, 1, 12);
    else return { ini: '0000-01-01', fim: iso(h), iniAnt: null, fimAnt: null };
    const dur = diasEntre(iso(ini), iso(h));
    const fimAnt = new Date(ini); fimAnt.setDate(fimAnt.getDate() - 1);
    const iniAnt = new Date(fimAnt); iniAnt.setDate(iniAnt.getDate() - dur);
    return { ini: iso(ini), fim: iso(h), iniAnt: iso(iniAnt), fimAnt: iso(fimAnt) };
  }

  /** Muda a situação da proposta registrando a data (aprovação, recusa e última mudança). */
  function mudarStatus(p, novo, hoje) {
    const dia = hoje || U.todayISO();
    if (p.status !== novo || !p.statusEm) p.statusEm = dia;
    p.status = novo;
    if (novo === 'aprovada' && !p.aprovadaEm) p.aprovadaEm = dia;
    if (novo === 'recusada' && !p.recusadaEm) p.recusadaEm = dia;
    return p;
  }

  function valor(p) { return U.numOr((p.resumo || {}).total, 0); }
  function kwp(p) { return U.numOr((p.resumo || {}).kwp, 0); }
  /** Data da venda: a da aprovação (registrada a partir desta versão) ou, nas antigas, a de emissão. */
  function dataVenda(p) { return String(p.aprovadaEm || p.data || '').slice(0, 10); }
  function dataRecusa(p) { return String(p.recusadaEm || (p.atualizadoEm || '').slice(0, 10) || p.data || '').slice(0, 10); }
  function dentro(d, ini, fim) { return !!d && d >= ini && d <= fim; }
  function soma(l, fn) { return l.reduce(function (s, x) { return s + fn(x); }, 0); }
  /** Vendedor da proposta (nome ou e-mail de quem a fez, com a sincronização ligada). */
  function vendedorDe(p) { return p && p.vendedor ? String(p.vendedor.nome || p.vendedor.email || '').trim() : ''; }

  /** Propostas que passam nas segmentações do painel: {vendedor, tipo, cidade}. cidadeDe(p) devolve a cidade da proposta. */
  function filtrar(props, f, cidadeDe) {
    f = f || {};
    return (props || []).filter(function (p) {
      if (f.tipo && (p.tipoSistema || 'ongrid') !== f.tipo) return false;
      if (f.vendedor && vendedorDe(p) !== f.vendedor) return false;
      if (f.cidade && (cidadeDe ? cidadeDe(p) : String(p.cidade || '')) !== f.cidade) return false;
      return true;
    });
  }

  /** Agrupa e soma (n, valor) por chave; ordena do maior valor para o menor; acima de "max" itens, o resto vira "Outras". */
  function agrupar(lista, chaveDe, max, rotuloResto) {
    const g = {};
    lista.forEach(function (p) { const k = chaveDe(p) || '—'; g[k] = g[k] || { label: k, n: 0, valor: 0 }; g[k].n++; g[k].valor += valor(p); });
    const out = Object.keys(g).map(function (k) { return g[k]; }).sort(function (a, b) { return b.valor - a.valor || a.label.localeCompare(b.label); });
    if (max && out.length > max) {
      const resto = out.splice(max - 1);
      out.push({ label: rotuloResto || 'Outras', n: soma(resto, function (x) { return x.n; }), valor: soma(resto, function (x) { return x.valor; }), resto: true });
    }
    return out;
  }

  /** Validade da proposta (data de emissão + dias de validade). */
  function vencimento(p, validadePadrao) {
    const dias = parseInt(p.validadeDias || validadePadrao || 5, 10) || 5;
    const d = dataDe(p.data || U.todayISO()); d.setDate(d.getDate() + dias);
    return iso(d);
  }

  /**
   * Indicadores do dashboard. dados: {propostas, instalacoes, ordens, validadePadrao}; periodo: id de PERIODOS.
   */
  function indicadores(dados, periodo, hoje) {
    const dia = hoje || U.todayISO();
    const iv = intervalo(periodo, dia);
    const props = dados.propostas || [];
    const aprovadas = props.filter(function (p) { return p.status === 'aprovada'; });
    const vendas = aprovadas.filter(function (p) { return dentro(dataVenda(p), iv.ini, iv.fim); });
    const vendasAnt = iv.iniAnt ? aprovadas.filter(function (p) { return dentro(dataVenda(p), iv.iniAnt, iv.fimAnt); }) : null;
    const emitidasAnt = iv.iniAnt ? props.filter(function (p) { return dentro(String(p.data || '').slice(0, 10), iv.iniAnt, iv.fimAnt); }).length : null;
    const recusas = props.filter(function (p) { return p.status === 'recusada' && dentro(dataRecusa(p), iv.ini, iv.fim); });
    const emitidas = props.filter(function (p) { return dentro(String(p.data || '').slice(0, 10), iv.ini, iv.fim); });
    const abertas = props.filter(function (p) { return ['rascunho', 'enviada', 'negociacao'].indexOf(p.status) >= 0; });
    const vendido = soma(vendas, valor);
    const decididas = vendas.length + recusas.length;

    // funil: situação atual das propostas emitidas no período
    const funil = ETAPAS_FUNIL.map(function (e) {
      const l = emitidas.filter(function (p) { return (p.status || 'rascunho') === e.id; });
      return { id: e.id, label: e.label, n: l.length, valor: soma(l, valor) };
    });
    const rec = emitidas.filter(function (p) { return p.status === 'recusada'; });
    const funilRecusadas = { id: 'recusada', label: 'Recusada', n: rec.length, valor: soma(rec, valor) };

    // vendas por mês (12 meses até o mês atual), marcando os meses do período
    const h = dataDe(dia);
    const porMes = [];
    for (let i = 11; i >= 0; i--) {
      const m = new Date(h.getFullYear(), h.getMonth() - i, 1, 12);
      const chave = m.getFullYear() + '-' + String(m.getMonth() + 1).padStart(2, '0');
      const l = aprovadas.filter(function (p) { return dataVenda(p).slice(0, 7) === chave; });
      const fimMes = iso(new Date(m.getFullYear(), m.getMonth() + 1, 0, 12));
      const emit = props.filter(function (p) { return String(p.data || '').slice(0, 7) === chave; }).length;
      const recs = props.filter(function (p) { return p.status === 'recusada' && dataRecusa(p).slice(0, 7) === chave; }).length;
      porMes.push({ mes: chave, rot: MESES[m.getMonth()] + '/' + String(m.getFullYear()).slice(2), valor: soma(l, valor), n: l.length, kwp: soma(l, kwp),
        emitidas: emit, recusas: recs, conversao: l.length + recs ? l.length / (l.length + recs) : null,
        noPeriodo: fimMes >= iv.ini && iso(m) <= iv.fim });
    }

    // últimos 12 meses (mix por tipo, cidades) e vendas do período por vendedor
    const ini12 = iso(new Date(h.getFullYear(), h.getMonth() - 11, 1, 12));
    const vendas12 = aprovadas.filter(function (p) { return dentro(dataVenda(p), ini12, dia); });
    const porTipo12 = TIPOS.map(function (t) {
      const l = vendas12.filter(function (p) { return (p.tipoSistema || 'ongrid') === t.id; });
      return { id: t.id, label: t.label, n: l.length, valor: soma(l, valor) };
    });
    const porCidade12 = agrupar(vendas12, function (p) { return dados.cidadeDe ? dados.cidadeDe(p) : String(p.cidade || ''); }, 5, 'Outras');
    const porVendedor = agrupar(vendas, function (p) { return vendedorDe(p) || 'Sem vendedor'; }, 8, 'Outros');

    // vendas do período por tipo de sistema
    const porTipo = TIPOS.map(function (t) {
      const l = vendas.filter(function (p) { return (p.tipoSistema || 'ongrid') === t.id; });
      return { id: t.id, label: t.label, n: l.length, valor: soma(l, valor) };
    });

    // propostas para acompanhar: enviadas/em negociação vencidas, vencendo ou paradas
    const acompanhar = props.filter(function (p) { return p.status === 'enviada' || p.status === 'negociacao'; }).map(function (p) {
      const venc = vencimento(p, dados.validadePadrao);
      const ultima = String(p.statusEm || (p.atualizadoEm || '').slice(0, 10) || p.data || dia).slice(0, 10);
      const paraVencer = diasEntre(dia, venc), parada = diasEntre(ultima, dia);
      let motivo = '', peso = 9;
      if (paraVencer < 0) { motivo = 'Validade vencida há ' + (-paraVencer) + (paraVencer === -1 ? ' dia' : ' dias'); peso = 0; }
      else if (paraVencer <= 3) { motivo = paraVencer === 0 ? 'Vence hoje' : 'Vence em ' + paraVencer + (paraVencer === 1 ? ' dia' : ' dias'); peso = 1; }
      else if (parada >= 7) { motivo = 'Sem movimento há ' + parada + ' dias'; peso = 2; }
      return { p: p, motivo: motivo, peso: peso, vencimento: venc, valor: valor(p) };
    }).filter(function (x) { return x.motivo; }).sort(function (a, b) { return (a.peso - b.peso) || (b.valor - a.valor); });

    // obras e ordens de serviço (situação atual)
    const I = App.Instalacao, O = App.Ordem;
    const insts = dados.instalacoes || [], ordens = dados.ordens || [];
    const obras = I ? {
      andamento: insts.filter(function (x) { return I.status(x) === 'andamento'; }),
      iniciar: insts.filter(function (x) { return I.status(x) === 'iniciar'; }).length,
      atrasadas: insts.filter(function (x) { return I.status(x) === 'andamento' && I.atrasadas(x, dia).length; }).length,
      concluidas: insts.filter(function (x) { return I.status(x) === 'concluida' && dentro(I.dataConclusao(x), iv.ini, iv.fim); }).length
    } : null;
    if (obras) obras.emDia = obras.andamento.length - obras.atrasadas;
    const em7 = iso(new Date(h.getFullYear(), h.getMonth(), h.getDate() + 7, 12));
    const os = O ? {
      abertas: ordens.filter(O.aberta).length,
      atrasadas: ordens.filter(function (o) { return O.atrasada(o, dia); }).length,
      urgentes: ordens.filter(function (o) { return O.aberta(o) && o.prioridade === 'urgente'; }).length,
      urgentesNoPrazo: ordens.filter(function (o) { return O.aberta(o) && o.prioridade === 'urgente' && !O.atrasada(o, dia); }).length,
      agenda: ordens.filter(function (o) { return O.aberta(o) && (O.atrasada(o, dia) || (o.agendadaPara && o.agendadaPara <= em7) || o.prioridade === 'urgente'); })
        .sort(function (a, b) { return String(a.agendadaPara || '0').localeCompare(String(b.agendadaPara || '0')); })
    } : null;

    return {
      periodo: periodo, intervalo: iv,
      vendido: vendido, vendidoAnt: vendasAnt ? soma(vendasAnt, valor) : null, nVendas: vendas.length, kwpVendido: soma(vendas, kwp),
      ticket: vendas.length ? vendido / vendas.length : 0, ticketAnt: vendasAnt && vendasAnt.length ? soma(vendasAnt, valor) / vendasAnt.length : null,
      emitidas: emitidas.length, emitidasAnt: emitidasAnt, valorEmitido: soma(emitidas, valor),
      // funil acumulado: quantas das emitidas chegaram a cada etapa (aprovada passou por enviada e negociação; recusada, por enviada)
      funilAcum: (function () {
        const st = function (p) { return p.status || 'rascunho'; };
        const env = emitidas.filter(function (p) { return st(p) !== 'rascunho'; });
        const neg = emitidas.filter(function (p) { return st(p) === 'negociacao' || st(p) === 'aprovada'; });
        const apr = emitidas.filter(function (p) { return st(p) === 'aprovada'; });
        return [{ id: 'emitidas', label: 'Emitidas', n: emitidas.length, valor: soma(emitidas, valor) }, { id: 'enviadas', label: 'Enviadas', n: env.length, valor: soma(env, valor) },
          { id: 'negociacao', label: 'Em negociação', n: neg.length, valor: soma(neg, valor) }, { id: 'aprovadas', label: 'Aprovadas', n: apr.length, valor: soma(apr, valor) }];
      })(),
      porTipo12: porTipo12, porCidade12: porCidade12, porVendedor: porVendedor, vendido12: soma(vendas12, valor),
      conversao: decididas ? vendas.length / decididas : null, decididas: decididas,
      abertas: { n: abertas.length, valor: soma(abertas, valor) },
      funil: funil, funilRecusadas: funilRecusadas, porMes: porMes, porTipo: porTipo, acompanhar: acompanhar, obras: obras, os: os
    };
  }

  App.Crm = {
    PERIODOS: PERIODOS, ETAPAS_FUNIL: ETAPAS_FUNIL, TIPOS: TIPOS,
    intervalo: intervalo, rotuloMes: rotuloMes, mudarStatus: mudarStatus, dataVenda: dataVenda, vencimento: vencimento, indicadores: indicadores,
    filtrar: filtrar, vendedorDe: vendedorDe, agrupar: agrupar
  };
})(window.App);
