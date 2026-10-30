/*
 * Gestão das instalações (obras): cada proposta aprovada vira uma instalação com as etapas do cronograma de execução
 * (Configurações › Textos padrão › Passo a passo), datas previstas e realizadas, checklist, dados da obra e histórico.
 * O histórico registra cada mudança de etapa — base para avisar o cliente a cada avanço.
 */
window.App = window.App || {};

(function (App) {
  'use strict';

  const U = App.U;

  const SITUACOES = [{ id: 'ativa', label: 'Ativa' }, { id: 'pausada', label: 'Pausada' }, { id: 'cancelada', label: 'Cancelada' }];
  const STATUS_ETAPA = [{ id: 'pendente', label: 'A fazer' }, { id: 'andamento', label: 'Em andamento' }, { id: 'concluida', label: 'Concluída' }];
  // situação exibida (calculada pelas etapas, salvo obra pausada ou cancelada)
  const STATUS = [
    { id: 'iniciar', label: 'A iniciar', cor: 'cinza' }, { id: 'andamento', label: 'Em andamento', cor: 'azul' },
    { id: 'concluida', label: 'Concluída', cor: 'ok' }, { id: 'pausada', label: 'Pausada', cor: 'ambar' }, { id: 'cancelada', label: 'Cancelada', cor: 'erro' }
  ];

  // checklist da instalação em três grupos (itens padrão em Configurações › Textos padrão)
  const GRUPOS = [
    { id: 'estrutura', titulo: 'Estrutura de fixação e módulos', chave: 'checklistEstrutura' },
    { id: 'stringbox', titulo: 'String box', chave: 'checklistStringBox' },
    { id: 'inversor', titulo: 'Inversor', chave: 'checklistInversor' }
  ];

  function agora() { return new Date().toISOString(); }

  /** Checklist padrão; com microinversores a string box (CC) começa marcada como "não se aplica". */
  function checklistPadrao(textos, micro) {
    return GRUPOS.map(function (g) {
      return { id: g.id, titulo: g.titulo, naoSeAplica: g.id === 'stringbox' && !!micro,
        itens: ((textos && textos[g.chave]) || []).filter(Boolean).map(function (t) { return { texto: t, ok: false, obs: '' }; }) };
    });
  }

  /**
   * Módulo e inversor efetivamente instalados: equipamento do cadastro (equipamentoId) ou marca e modelo digitados,
   * nº de série e as fotos das etiquetas (ids em App.Fotos).
   */
  function placasVazias() {
    return {
      modulo: { equipamentoId: '', marca: '', modelo: '', potencia: '', quantidade: '', serie: '', fotos: [], legendas: {} },
      inversor: { equipamentoId: '', marca: '', modelo: '', potencia: '', quantidade: '', serie: '', fotos: [], legendas: {} }
    };
  }

  // tipos do cadastro de equipamentos aceitos em cada placa
  const TIPOS_PLACA = { modulo: ['modulo'], inversor: ['inversor', 'micro', 'hibrido'] };

  /** Equipamentos do cadastro para a placa (ativos primeiro, depois por fabricante e modelo). */
  function opcoesCadastro(equipamentos, qual) {
    const tipos = TIPOS_PLACA[qual] || [];
    return (equipamentos || []).filter(function (e) { return tipos.indexOf(e.tipo) >= 0; }).slice().sort(function (a, b) {
      return ((a.ativo === false) - (b.ativo === false)) || [a.fabricante, a.modelo].join(' ').localeCompare([b.fabricante, b.modelo].join(' '), 'pt-BR');
    });
  }

  /** Preenche a placa com um equipamento do cadastro (marca, modelo e potência); sem equipamento, passa a ser digitada. */
  function placaDoCadastro(placa, e) {
    placa.equipamentoId = e ? e.id : '';
    if (e) { placa.marca = e.fabricante || ''; placa.modelo = e.modelo || ''; placa.potencia = e.potencia || ''; }
    return placa;
  }

  function norm(x) { return String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }

  /** Liga a placa digitada ao equipamento do cadastro com a mesma marca e modelo (quando houver). */
  function vincularCadastro(placa, equipamentos, qual) {
    if (placa.equipamentoId || !placa.modelo) return placa;
    const e = opcoesCadastro(equipamentos, qual).find(function (x) { return norm(x.modelo) === norm(placa.modelo) && (!placa.marca || norm(x.fabricante) === norm(placa.marca)); });
    if (e) placa.equipamentoId = e.id;
    return placa;
  }

  /** Marca, modelo, potência e quantidade do módulo e do inversor da proposta (mantém nº de série e fotos). Devolve false sem equipamentos. */
  function placasDaProposta(inst, p, ctx) {
    let r = null;
    try { r = App.Calc.calcular(U.clone(p), ctx); } catch (e) { r = null; }
    if (!r || !r.incluiFV) return false;
    const pv = placasVazias();
    inst.placas = inst.placas || pv;
    inst.placas.modulo = Object.assign(pv.modulo, inst.placas.modulo || {});
    inst.placas.inversor = Object.assign(pv.inversor, inst.placas.inversor || {});
    let ok = false;
    if (r.modulo) { placaDoCadastro(inst.placas.modulo, r.modulo); inst.placas.modulo.quantidade = r.nModulos || ''; ok = true; }
    if (r.inversor) { placaDoCadastro(inst.placas.inversor, r.inversor); inst.placas.inversor.quantidade = r.nInversores || ''; ok = true; }
    return ok;
  }

  function progressoChecklist(inst) {
    let feitos = 0, total = 0;
    (inst.checklistInstalacao || []).forEach(function (g) {
      if (g.naoSeAplica) return;
      (g.itens || []).forEach(function (it) { total++; if (it.ok) feitos++; });
    });
    return { feitos: feitos, total: total };
  }

  /** Marca um item; quando o grupo fica completo, registra no histórico. */
  function marcarItem(inst, grupo, item, ok) {
    item.ok = !!ok;
    if (ok && (grupo.itens || []).length && grupo.itens.every(function (x) { return x.ok; })) registrar(inst, 'Checklist "' + grupo.titulo + '" concluído.', 'etapa');
    return inst;
  }

  /** Prazo do cronograma em dias ("5 dias úteis", "15–30 dias úteis", "1 dia"): o maior número; null quando não há número ("Após aprovação"). */
  function prazoDias(texto) {
    const m = String(texto || '').match(/(\d+)\s*(?:[–—-]\s*(\d+))?\s*dias?(\s*[úu]teis)?/i);
    return m ? { dias: parseInt(m[2] || m[1], 10), uteis: !!m[3] } : null;
  }

  /** Soma dias corridos ou úteis (segunda a sexta) a uma data ISO. */
  function somarDias(iso, n, uteis) {
    const d = new Date(String(iso || U.todayISO()) + 'T12:00:00');
    if (!uteis) d.setDate(d.getDate() + n);
    else {
      let k = 0;
      while (k < n) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) k++; }
    }
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  /**
   * Datas previstas em sequência: cada etapa termina após o seu prazo, contado do fim da anterior (ou do início previsto).
   * Etapas concluídas mantêm a previsão e passam a contar a partir da data em que foram concluídas.
   */
  function preverDatas(inst) {
    let ref = inst.inicioPrevisto || U.todayISO();
    (inst.etapas || []).forEach(function (e) {
      if (e.status === 'concluida' && e.concluidoEm) { ref = e.concluidoEm; return; }
      const p = prazoDias(e.prazo);
      e.previsto = p ? somarDias(ref, p.dias, p.uteis) : ref;
      ref = e.previsto;
    });
    return inst;
  }

  function novaEtapa(titulo, prazo) {
    return { id: 'et-' + U.uid(), titulo: titulo || '', prazo: prazo || '', status: 'pendente', previsto: '', iniciadoEm: '', concluidoEm: '', obs: '', checklist: [] };
  }

  /** Etapas do cronograma de execução (Textos padrão), com os marcadores substituídos. */
  function etapasPadrao(textos, vars) {
    const sub = App.Documento ? App.Documento.nos.substituir : function (x) { return x; };
    return ((textos && textos.cronograma) || []).filter(function (c) { return c && (c.etapa || c.prazo); })
      .map(function (c) { return novaEtapa(sub(c.etapa || '', vars), sub(c.prazo || '', vars)); });
  }

  function varsTexto(ctx, conc, clienteNome) {
    const emp = ctx.empresa || {};
    return { empresa: emp.razao || '', empresaCurta: emp.nomeCurto || emp.razao || '', concessionaria: conc || 'concessionária', cliente: clienteNome || '', registroTipo: emp.registroTipo || '' };
  }

  /** Instalação em branco (sem proposta de origem). */
  function nova(ctx) {
    const emp = ctx.empresa || {};
    const inst = {
      titulo: '', propostaId: '', propostaNumero: '', clienteId: '', clienteNome: '', telefone: '', endereco: '', cidade: '', uf: emp.uf || '',
      tipoSistema: 'ongrid', kwp: 0, kwh: 0, valor: 0, equipamentos: { modulos: '', inversor: '', armazenamento: '', estrutura: '' },
      geracaoMes: 0, economiaMes: 0, reducaoPct: 0, segmento: 'residencial',
      situacao: 'ativa', responsavel: emp.responsavel || '', equipe: '', inicioPrevisto: U.todayISO(),
      uc: '', art: '', protocolo: '', medidor: '', ligacao: '', fotosLink: '', observacoes: '',
      placas: placasVazias(), checklistInstalacao: checklistPadrao(ctx.textos, false), materiais: [], comprasLancadas: [],
      assinaturas: { cliente: { fotoId: '', nome: '', em: '' }, tecnico: { fotoId: '', nome: '', em: '' } },
      etapas: etapasPadrao(ctx.textos, varsTexto(ctx, '', '')), historico: []
    };
    return preverDatas(inst);
  }

  /** Instalação a partir de uma proposta: cliente, endereço, sistema, equipamentos e as etapas com o nome da concessionária. */
  function deProposta(p, ctx) {
    const C = App.Calc;
    let r = null;
    try { r = C.calcular(U.clone(p), ctx); } catch (e) { r = null; }
    const cli = (ctx.clientes || []).find(function (x) { return x.id === p.clienteId; }) || null;
    const conc = r && r.concessionaria ? r.concessionaria.nome : (((ctx.concessionarias || []).find(function (x) { return x.id === p.concessionariaId; }) || {}).nome || '');
    const rs = p.resumo || {};
    const inst = nova(ctx);
    const nomeCli = (cli && cli.nome) || p.clienteNome || '';
    const kwp = r && r.incluiFV ? r.kwp : U.numOr(rs.kwp, 0);
    const kwh = r && r.armazenamentoAtivo && r.hibrido ? U.numOr(r.hibrido.capInstalada, 0) : U.numOr(rs.kwh, 0);
    const tipo = p.tipoSistema === 'hibrido' ? 'Híbrido' : (p.tipoSistema === 'bess' ? 'BESS' : 'On-Grid');
    Object.assign(inst, {
      propostaId: p.id || '', propostaNumero: p.numero || '', clienteId: p.clienteId || '', clienteNome: nomeCli, telefone: (cli && cli.telefone) || '',
      endereco: p.enderecoInstalacao || (cli ? [cli.endereco, cli.numero, cli.bairro].filter(Boolean).join(', ') : ''),
      cidade: (r && r.cidade) || rs.cidade || (cli && cli.cidade) || '', uf: (r && r.uf) || (cli && cli.uf) || inst.uf,
      tipoSistema: p.tipoSistema || 'ongrid', kwp: kwp, kwh: kwh, valor: r ? r.total : U.numOr(rs.total, 0),
      titulo: [nomeCli, [kwp > 0 ? U.kwp(kwp) + ' kWp' : '', kwh > 0 ? U.fmtSmart(kwh, 2) + ' kWh' : ''].filter(Boolean).join(' + '), tipo].filter(Boolean).join(' — '),
      etapas: etapasPadrao(ctx.textos, varsTexto(ctx, conc, nomeCli)),
      // materiais CA previstos na proposta; o consumo real é lançado na obra
      materiais: App.Materiais ? App.Materiais.daProposta(p) : []
    });
    if (r) {
      const nome = function (e) { return e ? [e.fabricante, e.modelo].filter(Boolean).join(' ') : ''; };
      inst.equipamentos = {
        modulos: r.incluiFV && r.modulo ? r.nModulos + ' × ' + nome(r.modulo) + ' (' + U.fmtSmart(r.modulo.potencia, 0) + ' Wp)' : '',
        inversor: r.incluiFV && r.inversor ? (r.nInversores > 1 ? r.nInversores + ' × ' : '') + nome(r.inversor) : '',
        armazenamento: r.armazenamentoAtivo && r.hibrido && r.hibrido.bateria ? nome(r.hibrido.bateria) + ' — ' + U.fmtSmart(r.hibrido.capInstalada, 2) + ' kWh' : '',
        estrutura: [p.telhado, r.estruturaTexto].filter(Boolean).join(' — ')
      };
      inst.placas = placasVazias();
      if (r.incluiFV && r.modulo) { placaDoCadastro(inst.placas.modulo, r.modulo); inst.placas.modulo.quantidade = r.nModulos || ''; }
      if (r.incluiFV && r.inversor) { placaDoCadastro(inst.placas.inversor, r.inversor); inst.placas.inversor.quantidade = r.nInversores || ''; }
      inst.checklistInstalacao = checklistPadrao(ctx.textos, r.micro);
      const a1 = r.fin && r.fin.anos && r.fin.anos[0];
      inst.geracaoMes = r.incluiFV ? U.round(r.geracaoMensal, 0) : 0;
      inst.economiaMes = r.fin ? U.round(r.fin.economiaMes1, 2) : 0;
      inst.reducaoPct = a1 && a1.contaSem > 0 ? U.round((1 - a1.contaCom / a1.contaSem) * 100, 0) : 0;
      inst.segmento = r.grupo === 'A' ? 'industrial' : (String(r.classe || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(' ')[0].replace('poder', 'publico') || 'residencial');
      if (!App.DEFAULTS.SEGMENTOS.some(function (s) { return s.id === inst.segmento; })) inst.segmento = 'residencial';
    }
    preverDatas(inst);
    registrar(inst, 'Instalação criada' + (p.numero ? ' a partir da proposta ' + p.numero : '') + '.', 'sistema');
    return inst;
  }

  /** Registra um evento no histórico (mais recente primeiro). tipo: 'etapa', 'nota' ou 'sistema'. */
  function registrar(inst, texto, tipo, etapaId) {
    inst.historico = inst.historico || [];
    inst.historico.unshift({ data: agora(), tipo: tipo || 'nota', texto: texto, etapaId: etapaId || '' });
    return inst;
  }

  /** Muda a situação de uma etapa: datas de início/conclusão automáticas e registro no histórico. */
  function mudarEtapa(inst, etapa, novo, hoje) {
    const dia = hoje || U.todayISO();
    if (!etapa || etapa.status === novo) return inst;
    const antes = etapa.status;
    etapa.status = novo;
    if (novo === 'andamento' && !etapa.iniciadoEm) etapa.iniciadoEm = dia;
    if (novo === 'concluida') { if (!etapa.iniciadoEm) etapa.iniciadoEm = dia; etapa.concluidoEm = dia; }
    if (novo !== 'concluida') etapa.concluidoEm = '';
    if (novo === 'pendente') etapa.iniciadoEm = '';
    const n = (inst.etapas || []).indexOf(etapa) + 1;
    const rot = 'Etapa ' + n + ' — ' + etapa.titulo;
    registrar(inst, novo === 'concluida' ? rot + ': concluída.' : (novo === 'andamento' ? rot + (antes === 'concluida' ? ': reaberta.' : ': iniciada.') : rot + ': voltou para "a fazer".'), 'etapa', etapa.id);
    preverDatas(inst);
    return inst;
  }

  function progresso(inst) {
    const et = inst.etapas || [];
    const feitas = et.filter(function (e) { return e.status === 'concluida'; }).length;
    return { feitas: feitas, total: et.length, pct: et.length ? feitas / et.length : 0 };
  }

  /** Etapa em que a obra está: a primeira em andamento ou, sem nenhuma, a primeira a fazer. */
  function etapaAtual(inst) {
    const et = inst.etapas || [];
    return et.find(function (e) { return e.status === 'andamento'; }) || et.find(function (e) { return e.status !== 'concluida'; }) || null;
  }

  function status(inst) {
    if (inst.situacao === 'cancelada') return 'cancelada';
    if (inst.situacao === 'pausada') return 'pausada';
    const pr = progresso(inst);
    if (pr.total && pr.feitas === pr.total) return 'concluida';
    if (pr.feitas || (inst.etapas || []).some(function (e) { return e.status === 'andamento'; })) return 'andamento';
    return 'iniciar';
  }

  /** Etapas não concluídas com a data prevista já vencida. */
  function atrasadas(inst, hoje) {
    const dia = hoje || U.todayISO();
    if (inst.situacao === 'cancelada') return [];
    return (inst.etapas || []).filter(function (e) { return e.status !== 'concluida' && e.previsto && e.previsto < dia; });
  }

  /** Data prevista para terminar a obra (a da última etapa) ou a de conclusão, quando já terminou. */
  function previsaoConclusao(inst) {
    const et = inst.etapas || [];
    if (!et.length) return '';
    const ult = et[et.length - 1];
    return ult.status === 'concluida' && ult.concluidoEm ? ult.concluidoEm : (ult.previsto || '');
  }

  /** Ficha para Projetos realizados (portfólio das propostas) a partir de uma instalação concluída; as 2 fotos ficam para o usuário. */
  function paraProjeto(inst) {
    const fim = previsaoConclusao(inst);
    const eq = inst.equipamentos || {};
    const pl = inst.placas || {};
    const desc = function (x, un) {
      if (!x || !(x.marca || x.modelo)) return '';
      return (U.num(x.quantidade) > 1 ? U.fmtSmart(U.num(x.quantidade), 0) + ' × ' : '') + [x.marca, x.modelo].filter(Boolean).join(' ') + (U.num(x.potencia) > 0 ? ' (' + U.fmtSmart(U.num(x.potencia), 2) + ' ' + un + ')' : '');
    };
    const local = inst.endereco ? String(inst.endereco).split(',').slice(-1)[0].trim() : '';
    return {
      titulo: (inst.segmento === 'residencial' ? 'Residência' : App.DEFAULTS.SEGMENTOS.find(function (s) { return s.id === inst.segmento; }).label) + (local ? ' — ' + local : ''),
      segmento: inst.segmento || 'residencial', tipoSistema: inst.tipoSistema || 'ongrid', cidade: inst.cidade || '', uf: inst.uf || '',
      conclusao: fim ? fim.slice(5, 7) + '/' + fim.slice(0, 4) : '', potenciaKwp: inst.kwp || '',
      modulos: desc(pl.modulo, 'Wp') || eq.modulos || '', inversor: desc(pl.inversor, 'kW') || eq.inversor || '', armazenamento: eq.armazenamento || '', estrutura: eq.estrutura || '',
      geracaoMes: inst.geracaoMes || '', economiaMes: inst.economiaMes || '', reducaoPct: inst.reducaoPct || '',
      descricao: '', foto1: null, foto2: null, exibir: true, instalacaoId: inst.id || ''
    };
  }

  App.Instalacao = {
    SITUACOES: SITUACOES, STATUS_ETAPA: STATUS_ETAPA, STATUS: STATUS, GRUPOS: GRUPOS,
    checklistPadrao: checklistPadrao, placasVazias: placasVazias, progressoChecklist: progressoChecklist, marcarItem: marcarItem,
    opcoesCadastro: opcoesCadastro, placaDoCadastro: placaDoCadastro, vincularCadastro: vincularCadastro, placasDaProposta: placasDaProposta,
    prazoDias: prazoDias, somarDias: somarDias, preverDatas: preverDatas, novaEtapa: novaEtapa, etapasPadrao: etapasPadrao,
    nova: nova, deProposta: deProposta, registrar: registrar, mudarEtapa: mudarEtapa,
    progresso: progresso, etapaAtual: etapaAtual, status: status, atrasadas: atrasadas, previsaoConclusao: previsaoConclusao, paraProjeto: paraProjeto
  };
})(window.App);
