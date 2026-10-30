/* Cadastros: clientes, equipamentos, concessionárias, localidades (irradiação) e condições de pagamento. */
(function (App) {
  'use strict';

  const U = App.U, UI = App.UI, S = App.Store, D = App.DEFAULTS, C = App.Calc;
  const h = U.h;

  const SIM_NAO = function (v) { return v === false ? UI.badge('Inativo', 'cinza') : UI.badge('Ativo', 'ok'); };
  const APLICA_EM = [
    { v: 'ambos', t: 'Todos os sistemas' }, { v: 'ongrid', t: 'Somente On-Grid' }, { v: 'hibrido', t: 'Somente Híbrido' }, { v: 'bess', t: 'Somente BESS' },
    { v: 'string', t: 'Somente com inversor string' }, { v: 'micro', t: 'Somente com microinversores' }
  ];
  const APLICA_TXT = {};
  APLICA_EM.forEach(function (a) { APLICA_TXT[a.v] = a.t.replace(/^Somente (com )?/, ''); });
  const UF_OPTS = [{ v: '', t: '—' }].concat(U.UFS.map(function (u) { return { v: u, t: u }; }));
  // materiais: em qual lista entram (proposta solar, propostas avulsas ou as duas)
  const USO_TXT = {};
  C.USOS_MATERIAL.forEach(function (u) { USO_TXT[u.id] = u.label; });
  const USO_COR = { solar: 'ok', avulsa: 'ambar', ambas: 'cinza' };
  let ctxUso = { avulsas: [] }; // propostas avulsas da página aberta (materiais antigos, gravados antes do campo "Usar em")
  const UNIDADES_MATERIAL = ['un', 'm', 'pt', 'cj', 'kg'].concat(App.Avulsa.UNIDADES_MATERIAL.filter(function (u) { return ['un', 'm', 'pt', 'cj', 'kg'].indexOf(u) < 0; }));

  function usoEmPropostas(fn) {
    return S.list('propostas').filter(fn).length;
  }

  /* ------------------------------------------------------------ clientes */

  UI.rota('/clientes', function (cont) {
    UI.crud(cont, {
      colecao: 'clientes',
      titulo: 'Clientes',
      subtitulo: 'Cadastro de clientes para as propostas.',
      rotuloNovo: '+ Novo cliente',
      vazio: 'Nenhum cliente cadastrado ainda.',
      novo: function () { return { nome: '', documento: '', telefone: '', email: '', cep: '', endereco: '', numero: '', bairro: '', cidade: '', uf: '', observacoes: '' }; },
      ordenar: function (a, b) { return String(a.nome).localeCompare(String(b.nome), 'pt-BR'); },
      busca: function (c) { return [c.nome, c.documento, c.cidade, c.telefone, c.email].join(' '); },
      colunas: [
        { t: 'Nome', v: function (c) { return h('strong', c.nome); } },
        { t: 'CPF/CNPJ', v: function (c) { return c.documento; } },
        { t: 'Cidade/UF', v: function (c) { return [c.cidade, c.uf].filter(Boolean).join('/'); } },
        { t: 'Telefone', v: function (c) { return c.telefone; } },
        { t: 'Propostas', cls: 'num', v: function (c) { return usoEmPropostas(function (p) { return p.clienteId === c.id; }); } }
      ],
      validar: function (c) { return String(c.nome || '').trim() ? null : 'Informe o nome do cliente.'; },
      podeExcluir: function (c) {
        const n = usoEmPropostas(function (p) { return p.clienteId === c.id; });
        return n ? 'Cliente possui ' + n + ' proposta(s). Exclua as propostas antes.' : null;
      },
      campos: function (c, redesenhar) { return App.camposCliente(c, redesenhar); }
    });
  });

  App.camposCliente = function (c, redesenhar) {
    const btnCep = h('button.btn.pequeno', {
      type: 'button', onclick: async function () {
        const cep = String(c.cep || '').replace(/\D/g, '');
        if (cep.length !== 8) { UI.toast('Informe um CEP com 8 dígitos.', 'erro'); return; }
        try {
          const r = await fetch('https://viacep.com.br/ws/' + cep + '/json/').then(function (x) { return x.json(); });
          if (r.erro) { UI.toast('CEP não encontrado.', 'erro'); return; }
          c.endereco = r.logradouro || c.endereco;
          c.bairro = r.bairro || c.bairro;
          c.cidade = r.localidade || c.cidade;
          c.uf = r.uf || c.uf;
          if (redesenhar) redesenhar();
        } catch (e) { UI.toast('Não foi possível consultar o CEP (sem internet?).', 'erro'); }
      }
    }, 'Buscar CEP');
    return [
      { k: 'nome', label: 'Nome / Razão social', required: true, cls: 'span2' },
      { k: 'nomeFantasia', label: 'Nome fantasia (empresas)' },
      { k: 'inscricaoEstadual', label: 'Inscrição estadual' },
      { k: 'documento', label: 'CPF / CNPJ' },
      { k: 'telefone', label: 'Telefone', type: 'tel' },
      { k: 'email', label: 'E-mail', type: 'email' },
      { el: h('div.campo.com-botao', UI.campo({ k: 'cep', label: 'CEP' }, c), btnCep) },
      { k: 'endereco', label: 'Endereço (rua/avenida)', cls: 'span2' },
      { k: 'numero', label: 'Número' },
      { k: 'bairro', label: 'Bairro' },
      { k: 'cidade', label: 'Cidade' },
      { k: 'uf', label: 'UF', type: 'select', options: UF_OPTS },
      { k: 'observacoes', label: 'Observações', type: 'textarea', cls: 'span2' }
    ];
  };

  /* ------------------------------------------------------------ equipamentos */

  function camposDatasheet(tipo, desc, e) {
    const notas = [{ el: h('p.nota.span-all', '★ Dados usados no dimensionamento técnico. Preencha conforme o datasheet do modelo exato, use \u201c📄 Ler datasheet\u201d ou \u201c🔎 Pesquisar datasheet\u201d.') }];
    const o = e && e.origem;
    if (o && (o.arquivo || o.url)) {
      const falta = App.Datasheet.faltando(tipo, e);
      const quando = ' em ' + U.dataBR(String(o.lidoEm || '').slice(0, 10)) + (o.modeloIA ? ' (' + App.IA.nomeModelo(o.modeloIA) + ')' : '') + '. ';
      notas.push({ el: h('p.nota.span-all' + (e.revisar ? '.aviso' : ''),
        o.url ? ['🔎 Datasheet encontrado na internet: ', h('a', { href: o.url, target: '_blank', rel: 'noopener' }, o.url), quando + (o.viaPdf === false ? 'Lido da transcrição da página (sem o PDF original). ' : '')]
          : '📄 Lido do datasheet \u201c' + o.arquivo + '\u201d' + quando,
        (e.revisar ? 'Confira os valores com o documento e salve para concluir a revisão. ' : ''),
        (falta.length ? 'Sem dado no datasheet: ' + falta.join(', ') + '.' : '')) });
    }
    return notas.concat(App.Datasheet.camposForm(tipo), [
        { secao: 'Comercial e proposta' },
        { k: 'preco', label: 'Preço unitário', type: 'money' },
        { k: 'descricaoProposta', label: 'Descrição na lista de equipamentos', cls: 'span2', help: function (e) { return 'Em branco = automática: ' + desc(Object.assign({}, e, { descricaoProposta: '' })); } },
        { k: 'obs', label: 'Observações internas', cls: 'span2' },
        { k: 'ativo', label: 'Ativo (disponível nas propostas)', type: 'checkbox' }
      ]);
  }

  const CAMPOS_EQUIP = {
    modulo: function (e) { return camposDatasheet('modulo', C.descModulo, e); },
    // módulo, inversor on-grid, microinversor, híbrido e bateria: campos na estrutura do datasheet (App.Datasheet; ★ = dimensionamento)
    inversor: function (tipo, e) { return camposDatasheet(tipo, C.descInversor, e); },
    bateria: function (e) { return camposDatasheet('bateria', C.descBateria, e); },
    bess: function () {
      return [
        { k: 'fabricante', label: 'Fabricante', required: true },
        { k: 'modelo', label: 'Modelo', required: true },
        { k: 'energia', label: 'Energia nominal (por gabinete)', type: 'number', suffix: 'kWh', required: true },
        { k: 'potencia', label: 'Potência (PCS) por gabinete', type: 'number', suffix: 'kW', required: true },
        { k: 'quimica', label: 'Química', type: 'select', options: ['LiFePO4', 'Lítio NMC', 'Sódio-íon', 'Chumbo-carbono', 'Outra'] },
        { k: 'fases', label: 'Conexão', type: 'select', options: ['Trifásico', 'Monofásico'] },
        { k: 'tensao', label: 'Tensão CA', placeholder: 'Ex.: 380V' },
        { k: 'dod', label: 'Profundidade de descarga (DoD)', type: 'number', suffix: '%' },
        { k: 'eficiencia', label: 'Eficiência de ciclo (round-trip)', type: 'number', suffix: '%' },
        { k: 'ciclos', label: 'Vida útil', type: 'int', suffix: 'ciclos' },
        { k: 'vidaAnos', label: 'Vida útil (calendário)', type: 'int', suffix: 'anos', help: 'Em branco = premissa padrão.' },
        { k: 'garantia', label: 'Garantia', type: 'number', suffix: 'anos' },
        { k: 'preco', label: 'Preço por gabinete', type: 'money' },
        { k: 'descricaoProposta', label: 'Descrição na lista de equipamentos', cls: 'span2', help: function (e) { return 'Em branco = automática: ' + C.descBess(Object.assign({}, e, { descricaoProposta: '' })); } },
        { k: 'obs', label: 'Observações internas', cls: 'span2' },
        { k: 'ativo', label: 'Ativo (disponível nas propostas)', type: 'checkbox' }
      ];
    },
    estrutura: function () {
      return [
        { k: 'descricao', label: 'Descrição (lista de equipamentos)', required: true, cls: 'span2' },
        { k: 'resumo', label: 'Resumo (tabela de dimensionamento)', placeholder: 'Ex.: Kit Fibrocimento p/ 4 módulos' },
        { k: 'fabricante', label: 'Fabricante' },
        { k: 'telhado', label: 'Tipo de telhado', type: 'select', options: D.TELHADOS.concat(['Todos']) },
        { k: 'regra', label: 'Regra de quantidade', type: 'select', options: D.REGRAS_QTD.map(function (r) { return { v: r.id, t: r.label }; }), cls: 'span2' },
        { k: 'fator', label: 'Fator / N', type: 'number', help: 'Kit: nº de módulos por kit. Proporcional: multiplicador. Fixa: quantidade.' },
        { k: 'unidade', label: 'Unidade', type: 'select', options: ['un', 'm', 'pt', 'cj', 'kg'] },
        { k: 'aplicaEm', label: 'Aplica-se a', type: 'select', options: APLICA_EM },
        { k: 'garantia', label: 'Garantia', placeholder: 'Ex.: Vitalícia' },
        { k: 'preco', label: 'Preço unitário', type: 'money' },
        { k: 'obs', label: 'Observações internas', cls: 'span2' },
        { k: 'autoIncluir', label: 'Incluir automaticamente nas propostas (telhado compatível)', type: 'checkbox', cls: 'span2' },
        { k: 'ativo', label: 'Ativo', type: 'checkbox' }
      ];
    },
    material: function (e, desenhar) {
      // material das propostas avulsas não tem regra de quantidade nem entra na lista da proposta solar
      const soAvulsa = e.uso === 'avulsa';
      const unidades = !e.unidade || UNIDADES_MATERIAL.indexOf(e.unidade) >= 0 ? UNIDADES_MATERIAL : UNIDADES_MATERIAL.concat([e.unidade]);
      return [
        { k: 'descricao', label: 'Descrição', required: true, cls: 'span2' },
        {
          k: 'uso', label: 'Usar em', type: 'select', required: true, cls: 'span2',
          options: [{ v: '', t: '— escolha —' }].concat(C.USOS_MATERIAL.map(function (u) { return { v: u.id, t: u.label + ' — ' + u.desc.toLowerCase() }; })),
          help: 'Proposta solar: entra na lista de materiais do sistema. Propostas avulsas: aparece só em "Materiais utilizados" das propostas de serviços.',
          onChange: function () { if (e.uso === 'avulsa') e.autoIncluir = false; desenhar(); }
        },
        soAvulsa ? null : { k: 'regra', label: 'Regra de quantidade', type: 'select', options: D.REGRAS_QTD.filter(function (r) { return r.id !== 'kitModulos'; }).map(function (r) { return { v: r.id, t: r.label }; }), cls: 'span2' },
        soAvulsa ? null : { k: 'fator', label: 'Fator / quantidade', type: 'number' },
        { k: 'unidade', label: 'Unidade', type: 'select', options: unidades },
        soAvulsa ? null : { k: 'aplicaEm', label: 'Aplica-se a', type: 'select', options: APLICA_EM },
        { k: 'garantia', label: 'Garantia', placeholder: 'Ex.: 5 anos' },
        { k: 'preco', label: 'Preço unitário', type: 'money' },
        soAvulsa ? null : { k: 'autoIncluir', label: 'Incluir automaticamente na lista de materiais da proposta solar (pela regra de quantidade)', type: 'checkbox', cls: 'span2' },
        { k: 'infraCA', label: 'Material da infraestrutura CA (aparece primeiro na lista de materiais CA da proposta e da instalação)', type: 'checkbox', cls: 'span2' },
        { k: 'ativo', label: 'Ativo', type: 'checkbox' },
        { secao: 'Compras' },
        { k: 'custo', label: 'Custo de aquisição (última compra)', type: 'money', help: 'Lançado pelos pedidos de compra (com desconto e frete rateados). É o custo usado na lista de materiais CA; sem ele, vale o preço unitário.' },
        { k: 'custoEm', label: 'Data da última compra', type: 'date' },
        { k: 'fabricante', label: 'Marca' },
        { k: 'fornecedor', label: 'Fornecedor' },
        { k: 'codigoFornecedor', label: 'Código no fornecedor' },
        (e.compras || []).length ? { el: historicoCompras(e) } : null
      ];
    }
  };

  /** Últimas compras do material (lançadas pelos pedidos de compra). */
  function historicoCompras(e) {
    return h('div.span2.historico-compras', h('p.rotulo-campo', 'Últimas compras'), h('div.tabela-rolagem', h('table.tabela.compacta',
      h('thead', h('tr', h('th', 'Data'), h('th', 'Pedido'), h('th', 'Fornecedor'), h('th.num', 'Qtd.'), h('th.num', 'Custo unit.'))),
      h('tbody', e.compras.map(function (x) {
        return h('tr', h('td', U.dataBR(x.data) || '—'),
          h('td', x.compraId && S.get('compras', x.compraId) ? h('a', { href: '#/compra/' + x.compraId }, x.numero || 'abrir') : (x.numero || '—')),
          h('td', x.fornecedor || '—'), h('td.num', U.fmtSmart(U.num(x.qtd), 3) + ' ' + (x.unidade || '')), h('td.num', U.brl(U.num(x.custo))));
      })))));
  }

  /** Situação dos dados técnicos: lido do datasheet e ainda não revisado, completo ou com campos ★ vazios. */
  function colDatasheet(tipo) {
    return { t: 'Datasheet', v: function (e) {
      if (e.revisar) return UI.badge('Revisar', 'ambar');
      if (e.arquivado) return h('span', { title: 'Do catálogo antigo, mantido inativo porque está em proposta(s). Complete pelo datasheet para reativar.' }, UI.badge('Catálogo antigo', 'cinza'));
      const f = App.Datasheet.faltando(tipo === 'inversor' && e.tipo === 'hibrido' ? 'hibrido' : tipo, e);
      return f.length ? h('span', { title: 'Sem: ' + f.join(', ') }, UI.badge('Faltam ' + f.length, 'cinza')) : UI.badge('Completo', 'ok');
    } };
  }

  const COLUNAS_EQUIP = {
    modulo: [
      { t: 'Módulo', v: function (e) { return h('span', h('strong', e.fabricante + ' '), e.modelo); } },
      { t: 'Potência', cls: 'num', v: function (e) { return U.fmtSmart(e.potencia, 1) + ' Wp'; } },
      { t: 'Eficiência', cls: 'num', v: function (e) { return e.eficiencia ? U.fmtSmart(e.eficiencia, 2) + '%' : '—'; } },
      { t: 'Preço', cls: 'num', v: function (e) { return U.brl(U.numOr(e.preco, 0)); } },
      { t: 'R$/Wp', cls: 'num', v: function (e) { return e.potencia && e.preco ? U.fmt(e.preco / e.potencia, 2) : '—'; } },
      colDatasheet('modulo'),
      { t: 'Situação', v: function (e) { return SIM_NAO(e.ativo); } }
    ],
    inversor: [
      { t: 'Inversor', v: function (e) { return h('span', h('strong', e.fabricante + ' '), e.modelo); } },
      { t: 'Potência', cls: 'num', v: function (e) { return U.fmtSmart(e.potencia, 2) + ' kW'; } },
      { t: 'Fases', v: function (e) { return e.fases; } },
      { t: 'MPPT', cls: 'num', v: function (e) { return e.mppts || '—'; } },
      { t: 'Preço', cls: 'num', v: function (e) { return U.brl(U.numOr(e.preco, 0)); } },
      colDatasheet('inversor'),
      { t: 'Situação', v: function (e) { return SIM_NAO(e.ativo); } }
    ],
    micro: [
      { t: 'Microinversor', v: function (e) { return h('span', h('strong', e.fabricante + ' '), e.modelo); } },
      { t: 'Potência', cls: 'num', v: function (e) { return U.fmtSmart(e.potencia, 2) + ' kW'; } },
      { t: 'Módulos', cls: 'num', v: function (e) { return e.modulosPorUnidade || '—'; } },
      { t: 'Módulo (Wp)', v: function (e) { return e.potModuloMin || e.potModuloMax ? (e.potModuloMin || '…') + '–' + (e.potModuloMax || '…') : '—'; } },
      { t: 'Fases', v: function (e) { return e.fases; } },
      { t: 'Preço', cls: 'num', v: function (e) { return U.brl(U.numOr(e.preco, 0)); } },
      colDatasheet('micro'),
      { t: 'Situação', v: function (e) { return SIM_NAO(e.ativo); } }
    ],
    bateria: [
      { t: 'Bateria', v: function (e) { return h('span', h('strong', e.fabricante + ' '), e.modelo); } },
      { t: 'Energia', cls: 'num', v: function (e) { return U.fmtSmart(e.energia, 2) + ' kWh'; } },
      { t: 'Tensão', cls: 'num', v: function (e) { return e.tensao ? U.fmtSmart(e.tensao, 1) + ' V' : '—'; } },
      { t: 'Classe', v: function (e) { return C.classeBateria(e) === 'HV' ? 'Alta tensão' : '48 V'; } },
      { t: 'DoD', cls: 'num', v: function (e) { return e.dod ? e.dod + '%' : '—'; } },
      { t: 'Preço', cls: 'num', v: function (e) { return U.brl(U.numOr(e.preco, 0)); } },
      colDatasheet('bateria'),
      { t: 'Situação', v: function (e) { return SIM_NAO(e.ativo); } }
    ],
    bess: [
      { t: 'BESS', v: function (e) { return h('span', h('strong', e.fabricante + ' '), e.modelo); } },
      { t: 'Energia', cls: 'num', v: function (e) { return U.fmtSmart(e.energia, 2) + ' kWh'; } },
      { t: 'Potência', cls: 'num', v: function (e) { return e.potencia ? U.fmtSmart(e.potencia, 2) + ' kW' : '—'; } },
      { t: 'Eficiência', cls: 'num', v: function (e) { return e.eficiencia ? e.eficiencia + '%' : '—'; } },
      { t: 'Preço', cls: 'num', v: function (e) { return U.brl(U.numOr(e.preco, 0)); } },
      { t: 'R$/kWh', cls: 'num', v: function (e) { return e.energia && e.preco ? U.fmt(e.preco / e.energia, 0) : '—'; } },
      { t: 'Situação', v: function (e) { return SIM_NAO(e.ativo); } }
    ],
    estrutura: [
      { t: 'Descrição', v: function (e) { return e.descricao; } },
      { t: 'Telhado', v: function (e) { return e.telhado + (e.aplicaEm && e.aplicaEm !== 'ambos' ? ' · ' + (APLICA_TXT[e.aplicaEm] || e.aplicaEm) : ''); } },
      { t: 'Fabricante', v: function (e) { return e.fabricante || '—'; } },
      { t: 'Regra', v: function (e) { return regraTxt(e); } },
      { t: 'Preço', cls: 'num', v: function (e) { return U.brl(U.numOr(e.preco, 0)); } },
      { t: 'Auto', v: function (e) { return e.autoIncluir ? UI.badge('Sim', 'ok') : UI.badge('Não', 'cinza'); } },
      { t: 'Situação', v: function (e) { return SIM_NAO(e.ativo); } }
    ],
    material: [
      { t: 'Descrição', v: function (e) { return e.descricao; } },
      { t: 'Usar em', v: function (e) { const u = C.usoMaterial(e, ctxUso); return UI.badge(USO_TXT[u], USO_COR[u]); } },
      { t: 'Regra', v: function (e) { return C.usoMaterial(e, ctxUso) === 'avulsa' ? '—' : regraTxt(e); } },
      { t: 'Aplica-se', v: function (e) { return C.usoMaterial(e, ctxUso) === 'avulsa' ? '—' : APLICA_TXT[e.aplicaEm || 'ambos'] || e.aplicaEm; } },
      { t: 'Preço', cls: 'num', v: function (e) { return U.brl(U.numOr(e.preco, 0)) + ' / ' + (e.unidade || 'un'); } },
      { t: 'Últ. custo', cls: 'num', v: function (e) { return U.num(e.custo) > 0 ? h('span', U.brl(U.num(e.custo)), e.custoEm ? h('div.mini', U.dataBR(e.custoEm)) : null) : '—'; } },
      { t: 'Auto (solar)', v: function (e) { return C.usoMaterial(e, ctxUso) === 'avulsa' ? '—' : (e.autoIncluir ? UI.badge('Sim', 'ok') : UI.badge('Não', 'cinza')); } },
      { t: 'Situação', v: function (e) { return SIM_NAO(e.ativo); } }
    ]
  };

  function regraTxt(e) {
    const f = U.fmtSmart(e.fator, 3);
    switch (e.regra) {
      case 'kitModulos': return 'Kit p/ ' + f + ' módulos';
      case 'porModulo': return f + ' × nº de módulos';
      case 'porInversor': return f + ' × nº de inversores';
      case 'porMppt': return f + ' × nº de MPPTs';
      case 'porBateria': return f + ' × nº de baterias';
      default: return f + ' ' + (e.unidade || 'un') + ' (fixo)';
    }
  }

  /* ---------- cadastro pela leitura do datasheet (IA) */

  const normTxt = function (x) { return String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').toLowerCase().trim(); };

  function existenteDatasheet(tipo, m) {
    return S.list('equipamentos').find(function (e) {
      return e.tipo === tipo && normTxt(e.fabricante) === normTxt(m.fabricante) && normTxt(e.modelo) === normTxt(m.modelo);
    }) || null;
  }

  /**
   * Registro a gravar: novo ou o já cadastrado com os dados técnicos atualizados (preço, descrição e observações mantidos).
   * `alvo`: item escolhido para atualizar (ação 🔄), mesmo que o nome do modelo no datasheet seja um pouco diferente.
   */
  function registroDatasheet(tipo, m, origem, novo, alvo) {
    const ex = alvo ? (S.get('equipamentos', alvo.id) || alvo) : existenteDatasheet(tipo, m);
    const tecnicos = Object.assign({}, m);
    delete tecnicos.tipo; delete tecnicos.ativo; delete tecnicos.preco;
    const r = ex ? Object.assign(U.clone(ex), tecnicos) : Object.assign(novo(), tecnicos);
    r.revisar = true;
    r.origem = origem;
    delete r.arquivado;
    return { registro: r, existente: !!ex };
  }

  function exigeChaveIA() {
    if (App.IA.configurada()) return false;
    UI.modal({
      titulo: 'Leitura de datasheet (IA)',
      corpo: h('p', 'Para preencher o cadastro pelo datasheet (PDF ou pesquisa na internet), informe antes a chave de API da Anthropic em Configurações › Leitura de datasheet (IA).'),
      acoes: [{ label: 'Fechar' }, { label: 'Configurar agora', primario: true, onClick: function () { UI.ir('#/ia'); } }]
    });
    return true;
  }

  const CHAVE_MODO = 'gsp.leituraModo';
  const MODOS_LEITURA = [
    { v: 'local', t: 'No navegador — gratuito, sem chave de API (confira os campos lidos)' },
    { v: 'ia', t: 'Com IA (API do Claude) — mais completo, aceita foto; custo por leitura' }
  ];

  function modoLeituraPadrao() {
    let m = null;
    try { m = localStorage.getItem(CHAVE_MODO); } catch (e) { m = null; }
    if (m === 'local' || m === 'ia') return m;
    return App.IA.configurada() ? 'ia' : 'local';
  }

  function escolherDatasheet(def, ctrl) {
    const estado = { modeloInteresse: '', modo: modoLeituraPadrao() };
    const arquivo = h('input', { type: 'file', accept: 'application/pdf,.pdf,image/jpeg,image/png,image/webp' });
    UI.modal({
      titulo: 'Ler datasheet — ' + def.label,
      corpo: h('div',
        h('p', 'Escolha o PDF do datasheet. Todos os modelos da tabela são lidos e preenchem os campos de ' + App.IA.NOMES_TIPO[def.id] + ' para você revisar.'),
        h('div.campo', h('label', 'Arquivo do datasheet'), arquivo),
        UI.grade([
          { k: 'modo', label: 'Como ler', type: 'select', options: MODOS_LEITURA, help: 'No navegador: o PDF não sai do computador; precisa ter texto (não escaneado). Com IA: lê qualquer formato e foto da ficha.' },
          { k: 'modeloInteresse', label: 'Modelo de interesse (opcional)', placeholder: 'Ex.: SUN-6K-SG05LP1-EU', help: 'Todos os modelos são lidos; este vem marcado na lista.' }
        ], estado, null, 1)),
      acoes: [
        { label: 'Cancelar' },
        {
          label: 'Ler datasheet', primario: true, onClick: function () {
            const f = arquivo.files[0];
            if (!f) { UI.toast('Escolha o arquivo do datasheet.', 'erro'); return false; }
            try { localStorage.setItem(CHAVE_MODO, estado.modo); } catch (e) { /* preferência opcional */ }
            const local = estado.modo === 'local';
            if (!local && exigeChaveIA()) return false;
            progressoIA('Lendo datasheet…', [h('p', 'Arquivo: ', h('strong', f.name))], function (o) {
              const opc = Object.assign(o, { tipo: def.id, modeloInteresse: estado.modeloInteresse });
              return local ? App.LeituraLocal.lerDatasheet(f, opc) : App.IA.lerDatasheet(f, opc);
            }, function (res) { mostrarLeitura(def, ctrl, { nome: f.name }, estado.modeloInteresse, res); }, local);
          }
        }
      ]
    });
  }

  /** Pesquisa o datasheet na internet: novo cadastro (sem alvo) ou atualização do item `alvo`. */
  function pesquisarDatasheet(def, ctrl, alvo) {
    if (exigeChaveIA()) return;
    const estado = { fabricante: alvo ? alvo.fabricante || '' : '', modelo: alvo ? alvo.modelo || '' : '' };
    const iniciar = function () {
      const nome = [estado.fabricante, estado.modelo].filter(Boolean).join(' ');
      progressoIA('Pesquisando datasheet…', [h('p', 'Equipamento: ', h('strong', nome))], function (o) {
        return App.IA.pesquisarDatasheet(Object.assign(o, { tipo: def.id, fabricante: estado.fabricante, modelo: estado.modelo }));
      }, function (res) {
        const url = res.fonte.pdf || res.fonte.pagina;
        mostrarLeitura(def, ctrl, { nome: 'pesquisa ' + nome, url: url, viaPdf: res.fonte.viaPdf }, estado.modelo, res, alvo);
      });
    };
    UI.modal({
      titulo: (alvo ? 'Atualizar pelo datasheet — ' : 'Pesquisar datasheet — ') + def.label,
      corpo: h('div',
        h('p', 'A IA pesquisa na internet o datasheet oficial do modelo (de preferência o PDF do fabricante), lê os dados técnicos e mostra o que encontrou para você conferir antes de ' +
          (alvo ? 'atualizar o cadastro (preço, descrição e observações são mantidos).' : 'cadastrar.')),
        UI.grade([
          { k: 'fabricante', label: 'Fabricante', placeholder: 'Ex.: Trina Solar' },
          { k: 'modelo', label: 'Modelo', required: true, placeholder: 'Ex.: TSM-620NEG19RC.20' }
        ], estado, null, 2),
        h('p.ajuda-sec', 'Informe o código completo do modelo, como na etiqueta ou na nota do distribuidor. Cada pesquisa custa cerca de US$ 0,01 por busca na web, além dos tokens.')),
      acoes: [
        { label: 'Cancelar' },
        {
          label: 'Pesquisar', primario: true, onClick: function () {
            if (!String(estado.modelo || '').trim()) { UI.toast('Informe o modelo.', 'erro'); return false; }
            iniciar();
          }
        }
      ]
    });
  }

  /** Janela de progresso da leitura (tempo, etapa, recebimento e cancelamento); `local` = leitura no navegador. */
  function progressoIA(titulo, linhas, tarefa, aoConcluir, local) {
    const controle = new AbortController();
    const tempo = h('strong', '0 s');
    const etapa = h('span.ajuda-sec', 'Iniciando…');
    const inicio = Date.now();
    const relogio = setInterval(function () { tempo.textContent = Math.round((Date.now() - inicio) / 1000) + ' s'; }, 1000);
    let concluido = false;
    let textoEtapa = '';
    const fechar = UI.modal({
      titulo: titulo,
      corpo: h('div',
        linhas,
        h('p', (local ? 'Leitura no navegador (sem IA)' : 'Modelo: ' + App.IA.nomeModelo(App.IA.config().modelo)) + ' · tempo: ', tempo),
        h('p', etapa),
        h('p.ajuda-sec', 'Pode levar alguns minutos. Não feche esta janela.')),
      acoes: [{ label: 'Cancelar' }],
      aoFechar: function () { clearInterval(relogio); if (!concluido) controle.abort(); }
    });
    tarefa({
      sinal: controle.signal,
      aoEtapa: function (t) { textoEtapa = t; etapa.textContent = t; },
      aoProgredir: function (n) { etapa.textContent = (textoEtapa ? textoEtapa + ' ' : '') + '(' + U.fmt(n, 0) + ' caracteres recebidos)'; }
    }).then(function (res) {
      concluido = true;
      fechar();
      aoConcluir(res);
    }).catch(function (e) {
      concluido = true;
      fechar();
      if (!controle.signal.aborted) UI.toast(e.message || String(e), 'erro');
    });
  }

  /** Índice do modelo lido que corresponde ao item a atualizar (nome igual, contido ou único modelo da ficha). */
  function indiceAlvo(modelos, alvo) {
    const a = normTxt(alvo.modelo);
    let i = modelos.findIndex(function (m) { return normTxt(m.modelo) === a; });
    if (i < 0) i = modelos.findIndex(function (m) { const n = normTxt(m.modelo); return n && a && (n.indexOf(a) >= 0 || a.indexOf(n) >= 0); });
    if (i < 0 && modelos.length === 1) i = 0;
    return i;
  }

  function mostrarLeitura(def, ctrl, fonte, modeloInteresse, res, alvo) {
    const tipo = def.id;
    const origem = { arquivo: fonte.url ? null : fonte.nome, url: fonte.url || null, viaPdf: fonte.url ? fonte.viaPdf : undefined, lidoEm: new Date().toISOString(), modeloIA: res.modeloIA };
    if (!fonte.url) delete origem.url; else delete origem.arquivo;
    const novo = function () { return { tipo: tipo, ativo: true, preco: 0 }; };
    const nDim = App.Datasheet.todos(tipo).filter(function (c) { return c.dim; }).length;
    const interesse = normTxt(modeloInteresse);
    const iAlvo = alvo ? indiceAlvo(res.modelos, alvo) : -1;
    const itens = res.modelos.map(function (m, i) {
      const reg = registroDatasheet(tipo, m, origem, novo, i === iAlvo ? alvo : null);
      const destaque = alvo ? i === iAlvo : !!(interesse && normTxt(m.modelo).indexOf(interesse) >= 0);
      return { m: m, reg: reg, marcado: alvo ? i === iAlvo : (!interesse || destaque), destaque: destaque };
    });
    const corpo = h('div');
    const info = [res.modelos.length + ' modelo(s) encontrado(s)', res.local ? 'lido no navegador, sem custo' : 'lido por ' + App.IA.nomeModelo(res.modeloIA)];
    if (res.custoUSD != null && !res.local) info.push('custo estimado US$ ' + U.fmt(res.custoUSD, 3));
    corpo.appendChild(h('p.ajuda-sec', info.join(' · ') + (res.fallback ? ' (refeito no modelo indicado pela Anthropic após recusa do filtro de segurança)' : '') + '.'));
    if (fonte.url) {
      corpo.appendChild(h('div.nota' + (fonte.viaPdf ? '' : '.aviso'), h('strong', 'Fonte: '), h('a', { href: fonte.url, target: '_blank', rel: 'noopener' }, fonte.url),
        fonte.viaPdf ? ' — dados lidos do PDF original.' : ' — o PDF não pôde ser baixado pela IA; os dados vêm da transcrição feita na pesquisa. Confira com atenção.'));
    }
    if (alvo && iAlvo < 0) {
      corpo.appendChild(h('div.nota.aviso', 'Nenhum modelo da ficha coincide com \u201c' + alvo.modelo + '\u201d. Confira o código do modelo; os modelos abaixo entram como novos cadastros se você os marcar.'));
    }
    const outro = res.tipoDetectado && res.tipoDetectado !== tipo && App.Datasheet.TIPOS.indexOf(res.tipoDetectado) >= 0;
    if (outro) {
      const outroDef = D.TIPOS_EQUIP.find(function (t) { return t.id === res.tipoDetectado; });
      corpo.appendChild(h('div.nota.aviso', 'O documento parece ser de ' + App.IA.NOMES_TIPO[res.tipoDetectado] + ', mas foi lido com os campos de ' + App.IA.NOMES_TIPO[tipo] +
        '. Para ler com os campos certos, abra a aba ' + (outroDef ? outroDef.label : res.tipoDetectado) + ' e repita a leitura lá. ',
        h('a', { href: '#/equipamentos?tipo=' + res.tipoDetectado, onclick: function () { fecharRes(); } }, 'Abrir a aba ' + (outroDef ? outroDef.label : res.tipoDetectado))));
    }
    if (res.avisos) corpo.appendChild(h('div.nota', h('strong', 'Observações da leitura: '), res.avisos));
    if (!itens.length) corpo.appendChild(h('p', 'Nenhum modelo identificado no documento.'));
    else {
      const principal = function (m) {
        if (tipo === 'modulo') return [m.potencia ? U.fmtSmart(m.potencia, 0) + ' Wp' : '', m.eficiencia ? U.fmtSmart(m.eficiencia, 2) + '%' : '', m.tecnologia || ''].filter(Boolean).join(' · ');
        if (tipo === 'bateria') return [m.energia ? U.fmtSmart(m.energia, 2) + ' kWh' : '', m.tensao ? U.fmtSmart(m.tensao, 1) + ' V' : '', m.tipoBateria || ''].filter(Boolean).join(' · ');
        return [m.potencia ? U.fmtSmart(m.potencia, 2) + ' kW' : '', m.fases || '', tipo === 'micro' && m.modulosPorUnidade ? m.modulosPorUnidade + ' módulos' : '',
          tipo === 'hibrido' && m.tipoBateria ? 'bateria ' + m.tipoBateria : ''].filter(Boolean).join(' · ');
      };
      const tbody = h('tbody', itens.map(function (it) {
        const cb = h('input', { type: 'checkbox', 'aria-label': 'Cadastrar ' + it.m.modelo });
        cb.checked = it.marcado;
        cb.addEventListener('change', function () { it.marcado = cb.checked; });
        const falta = App.Datasheet.faltando(tipo, it.m);
        return h('tr' + (it.destaque ? '.destaque' : ''),
          h('td', cb),
          h('td', h('strong', (it.m.fabricante || '') + ' '), it.m.modelo || '—'),
          h('td', principal(it.m) || '—'),
          h('td.num', { title: falta.length ? 'Sem dado: ' + falta.join(', ') : 'Todos os campos ★ preenchidos' }, (nDim - falta.length) + '/' + nDim),
          h('td', it.reg.existente ? UI.badge('Atualiza o cadastro', 'azul') : UI.badge('Novo', 'ok')));
      }));
      corpo.appendChild(h('div.tabela-rolagem', h('table.tabela',
        h('thead', h('tr', h('th', ''), h('th', 'Modelo'), h('th', 'Dados principais'), h('th.num', '★ lidos'), h('th', 'Cadastro'))), tbody)));
      corpo.appendChild(h('p.ajuda-sec', 'Os itens entram marcados como \u201cRevisar\u201d: confira cada um com o datasheet, informe o preço dos novos e salve. ' +
        'Em itens já cadastrados, preço, descrição e observações são mantidos.'));
    }
    const acoes = [{ label: 'Cancelar' }];
    const unico = itens.length === 1 ? itens[0] : (iAlvo >= 0 ? itens[iAlvo] : null);
    if (unico) {
      acoes.push({ label: 'Abrir no formulário', onClick: function () { const r = unico.reg; setTimeout(function () { ctrl.abrir(r.existente ? r.registro : null, r.existente ? null : r.registro); }, 0); } });
    }
    if (itens.length) {
      acoes.push({
        label: alvo ? 'Gravar selecionados' : 'Cadastrar selecionados', primario: true, onClick: function () {
          const sel = itens.filter(function (it) { return it.marcado; });
          if (!sel.length) { UI.toast('Marque ao menos um modelo.', 'erro'); return false; }
          try {
            sel.forEach(function (it) { S.save('equipamentos', it.reg.registro); });
          } catch (e) { UI.toast(e.message, 'erro'); return false; }
          UI.toast(sel.length + ' equipamento(s) gravado(s) para revisão.', 'ok');
          ctrl.atualizar();
        }
      });
    }
    const fecharRes = UI.modal({ titulo: (fonte.url ? 'Datasheet encontrado — ' : 'Datasheet lido — ') + fonte.nome, corpo: corpo, largo: true, acoes: acoes });
  }

  UI.rota('/equipamentos', function (cont, params, qs) {
    let ctrl = null; // controle do cadastro, usado pela ação 🔄 das linhas
    const tipo = qs.get('tipo') || 'modulo';
    const def = D.TIPOS_EQUIP.find(function (t) { return t.id === tipo; }) || D.TIPOS_EQUIP[0];
    ctxUso = { avulsas: S.list('avulsas') };
    // vindo das propostas avulsas (Cadastro de materiais): os materiais novos já são das avulsas
    const usoNovo = qs.get('uso') === 'avulsa' ? 'avulsa' : '';
    const abas = h('div.abas', D.TIPOS_EQUIP.map(function (t) {
      const n = S.list('equipamentos').filter(function (e) { return e.tipo === t.id; }).length;
      return h('a.aba' + (t.id === def.id ? '.ativa' : ''), { href: '#/equipamentos?tipo=' + t.id }, t.label, h('span.contagem', String(n)));
    }));
    ctrl = UI.crud(cont, {
      colecao: 'equipamentos',
      titulo: 'Equipamentos — ' + def.label,
      subtitulo: 'Catálogo usado no dimensionamento e na lista de materiais. Informe os preços para o kit ser somado automaticamente.',
      rotuloNovo: '+ Novo item',
      largo: true,
      antesTabela: abas,
      filtro: function (e) { return e.tipo === def.id; },
      busca: function (e) { return [e.fabricante, e.modelo, e.descricao, e.fornecedor, e.codigoFornecedor].join(' '); },
      ordenar: function (a, b) {
        // catálogo grande: agrupa por fabricante (ou por telhado, nas estruturas) e ordena por potência/capacidade
        if (def.id === 'estrutura') return String(a.telhado).localeCompare(String(b.telhado), 'pt-BR') || String(a.descricao).localeCompare(String(b.descricao), 'pt-BR');
        return String(a.fabricante || a.descricao || '').localeCompare(String(b.fabricante || b.descricao || ''), 'pt-BR') ||
          (U.numOr(a.potencia || a.energia, 0) - U.numOr(b.potencia || b.energia, 0)) || String(a.modelo || '').localeCompare(String(b.modelo || ''));
      },
      colunas: COLUNAS_EQUIP[def.id === 'hibrido' ? 'inversor' : def.id],
      antesSalvar: function (e) {
        // salvar pelo formulário confirma a revisão dos dados lidos do datasheet
        delete e.revisar;
        if (e.ativo !== false) delete e.arquivado;
        if (e.tipo === 'micro' && U.num(e.modulosPorUnidade) > 0) e.mppts = Math.round(U.num(e.modulosPorUnidade));
        if (e.tipo === 'material' && e.uso === 'avulsa') e.autoIncluir = false;
      },
      novo: function () {
        const base = { tipo: def.id, ativo: true, preco: 0 };
        if (def.id === 'inversor' || def.id === 'hibrido') Object.assign(base, { fases: 'Monofásico', tensao: '220V', mppts: 1, garantia: 10 });
        if (def.id === 'micro') Object.assign(base, { fases: 'Monofásico', tensao: '220V', mppts: 4, modulosPorUnidade: 4, garantia: 12 });
        if (def.id === 'hibrido') Object.assign(base, { tensaoBateria: 48, tipoBateria: 'LV' });
        if (def.id === 'bateria') Object.assign(base, { quimica: 'LiFePO4', dod: 90, garantia: 10, tipoBateria: 'LV' });
        if (def.id === 'bess') Object.assign(base, { quimica: 'LiFePO4', fases: 'Trifásico', dod: 90, eficiencia: 90, ciclos: 6000, garantia: 10 });
        if (def.id === 'estrutura') Object.assign(base, { regra: 'kitModulos', fator: 4, unidade: 'un', telhado: 'Fibrocimento', garantia: 'Vitalícia', autoIncluir: true });
        if (def.id === 'material') Object.assign(base, { uso: usoNovo, regra: 'fixa', fator: 1, unidade: 'un', aplicaEm: 'ambos', autoIncluir: usoNovo !== 'avulsa' });
        return base;
      },
      validar: function (e) {
        if (def.id === 'material' && !e.uso) return 'Escolha onde o material é usado (proposta solar, propostas avulsas ou as duas).';
        if (def.id === 'estrutura' || def.id === 'material') return String(e.descricao || '').trim() ? null : 'Informe a descrição.';
        if (!String(e.fabricante || '').trim() || !String(e.modelo || '').trim()) return 'Informe fabricante e modelo.';
        if (def.id === 'bateria') return U.num(e.energia) > 0 ? null : 'Informe a energia nominal (kWh).';
        if (def.id === 'bess') return U.num(e.energia) > 0 && U.num(e.potencia) > 0 ? null : 'Informe energia (kWh) e potência (kW) do BESS.';
        if (def.id === 'micro' && !(U.num(e.modulosPorUnidade) > 0)) return 'Informe quantos módulos cada microinversor recebe.';
        return U.num(e.potencia) > 0 ? null : 'Informe a potência.';
      },
      podeExcluir: function (e) {
        const n = usoEmPropostas(function (p) {
          return p.moduloId === e.id || p.inversorId === e.id || p.bateriaId === e.id || p.bessId === e.id ||
            (p.itens || []).some(function (i) { return i.equipamentoId === e.id; });
        });
        return n ? 'Item usado em ' + n + ' proposta(s). Desative-o em vez de excluir.' : null;
      },
      campos: function (e, desenhar) {
        if (def.id === 'inversor' || def.id === 'hibrido' || def.id === 'micro') return CAMPOS_EQUIP.inversor(def.id, e);
        // material gravado antes do campo "Usar em": abre com o uso que já vinha sendo aplicado
        if (def.id === 'material' && e.id && !e.uso) e.uso = C.usoMaterial(e, ctxUso);
        return CAMPOS_EQUIP[def.id](e, desenhar);
      },
      acoesTopo: App.Datasheet.TIPOS.indexOf(def.id) >= 0 ? function (c) {
        return [
          h('button.btn', { type: 'button', onclick: function () { escolherDatasheet(def, c); } }, '📄 Ler datasheet'),
          h('button.btn', { type: 'button', onclick: function () { pesquisarDatasheet(def, c); } }, '🔎 Pesquisar datasheet')
        ];
      } : null,
      acoesExtras: App.Datasheet.TIPOS.indexOf(def.id) >= 0 ? function (e) {
        return h('button.btn-icone', { type: 'button', title: 'Atualizar pelo datasheet (pesquisa na internet)', 'aria-label': 'Atualizar pelo datasheet',
          onclick: function () { if (ctrl) pesquisarDatasheet(def, ctrl, e); } }, '🔄');
      } : null
    });
  });

  /* ------------------------------------------------------------ concessionárias */

  UI.rota('/concessionarias', function (cont) {
    UI.crud(cont, {
      colecao: 'concessionarias',
      titulo: 'Concessionárias e tarifas',
      subtitulo: 'Tarifas finais com impostos (R$/kWh) por classe e TUSD Fio B usada no cálculo da Lei 14.300/2022.',
      rotuloNovo: '+ Nova concessionária',
      novo: function () { return { nome: '', uf: '', tarifas: { B1: '', B2: '', B3: '' }, tusdFioB: '', obs: '' }; },
      colunas: [
        { t: 'Concessionária', v: function (c) { return h('strong', c.nome); } },
        { t: 'UF', v: function (c) { return c.uf; } },
        { t: 'B1 (R$/kWh)', cls: 'num', v: function (c) { return U.fmtSmart(c.tarifas && c.tarifas.B1, 4); } },
        { t: 'B2 (R$/kWh)', cls: 'num', v: function (c) { return U.fmtSmart(c.tarifas && c.tarifas.B2, 4); } },
        { t: 'B3 (R$/kWh)', cls: 'num', v: function (c) { return U.fmtSmart(c.tarifas && c.tarifas.B3, 4); } },
        { t: 'Branca', v: function (c) { return c.branca && U.num(c.branca.ponta) > 0 ? UI.badge('Cadastrada', 'ok') : UI.badge('—', 'cinza'); } },
        { t: 'Verde', v: function (c) { return c.verde && U.num(c.verde.ponta) > 0 ? UI.badge('Cadastrada', 'ok') : UI.badge('—', 'cinza'); } },
        { t: 'Azul', v: function (c) { return c.azul && U.num(c.azul.ponta) > 0 ? UI.badge('Cadastrada', 'ok') : UI.badge('—', 'cinza'); } },
        { t: 'TUSD Fio B', cls: 'num', v: function (c) { return U.fmtSmart(c.tusdFioB, 4); } }
      ],
      validar: function (c) { return String(c.nome || '').trim() ? null : 'Informe o nome.'; },
      podeExcluir: function (c) {
        const n = S.list('localidades').filter(function (l) { return l.concessionariaId === c.id; }).length +
          usoEmPropostas(function (p) { return p.concessionariaId === c.id; });
        return n ? 'Concessionária em uso por localidades ou propostas.' : null;
      },
      largo: true,
      colunasForm: 3,
      campos: function (c) {
        ['branca', 'verde', 'azul'].forEach(function (k) { if (!c[k]) c[k] = {}; });
        const kwh = function (k, label) { return { k: k, label: label, type: 'number', prefix: 'R$', suffix: '/kWh' }; };
        const kw = function (k, label) { return { k: k, label: label, type: 'number', prefix: 'R$', suffix: '/kW' }; };
        return [
          { k: 'nome', label: 'Nome', required: true },
          { k: 'uf', label: 'UF', type: 'select', options: UF_OPTS },
          { k: 'horarioPonta', label: 'Horário de ponta', placeholder: 'Ex.: 17h30 às 20h30' },
          { secao: 'Grupo B — Convencional (com impostos)' },
          kwh('tarifas.B1', 'B1 — Residencial'), kwh('tarifas.B2', 'B2 — Rural'), kwh('tarifas.B3', 'B3 — Comercial/Industrial'),
          { secao: 'Grupo B — Tarifa Branca' },
          kwh('branca.ponta', 'Ponta'), kwh('branca.intermediario', 'Intermediário'), kwh('branca.foraPonta', 'Fora de ponta'),
          { secao: 'Grupo A — Horossazonal Verde' },
          kwh('verde.ponta', 'Energia na ponta'), kwh('verde.foraPonta', 'Energia fora de ponta'), kw('verde.demanda', 'Demanda'),
          { secao: 'Grupo A — Horossazonal Azul' },
          kwh('azul.ponta', 'Energia na ponta'), kwh('azul.foraPonta', 'Energia fora de ponta'), kw('azul.demandaPonta', 'Demanda na ponta'),
          kw('azul.demandaForaPonta', 'Demanda fora de ponta'),
          { secao: 'Lei 14.300/2022' },
          { k: 'tusdFioB', label: 'TUSD Fio B', type: 'number', prefix: 'R$', suffix: '/kWh', help: 'Componente da TUSD usado no cronograma do Fio B.' },
          { k: 'obs', label: 'Observações', type: 'textarea', cls: 'span2' }
        ];
      }
    });
  });

  /* ------------------------------------------------------------ localidades */

  function camposFatores(l) {
    if (!Array.isArray(l.fatores) || l.fatores.length !== 12) l.fatores = Array(12).fill(1);
    const g = h('div.fatores');
    U.MESES.forEach(function (m, i) {
      g.appendChild(UI.campo({ k: 'fatores.' + i, label: m, type: 'number' }, l));
    });
    return h('div.campo.span2', h('label', 'Sazonalidade mensal (fator × geração média)'), g,
      h('small.ajuda', 'Usado no gráfico Consumo × Geração. 1,00 = média do ano.'));
  }

  UI.rota('/localidades', function (cont) {
    UI.crud(cont, {
      colecao: 'localidades',
      titulo: 'Localidades e irradiação',
      subtitulo: 'HSP (horas de sol pleno) por cidade, COSIP municipal e sazonalidade da geração.',
      rotuloNovo: '+ Nova localidade',
      largo: true,
      novo: function () {
        const c = S.list('concessionarias')[0];
        return { cidade: '', uf: '', hsp: '', cosip: '', fonte: 'CRESESB', fatores: Array(12).fill(1), concessionariaId: c ? c.id : null };
      },
      ordenar: function (a, b) { return String(a.cidade).localeCompare(String(b.cidade), 'pt-BR'); },
      colunas: [
        { t: 'Cidade', v: function (l) { return h('strong', l.cidade + (l.uf ? '/' + l.uf : '')); } },
        { t: 'HSP', cls: 'num', v: function (l) { return U.fmtSmart(l.hsp, 2) + ' kWh/m²/dia'; } },
        { t: 'COSIP', cls: 'num', v: function (l) { return U.brl(U.numOr(l.cosip, 0)); } },
        { t: 'Concessionária', v: function (l) { const c = S.get('concessionarias', l.concessionariaId); return c ? c.nome : '—'; } },
        { t: 'Fonte', v: function (l) { return l.fonte; } }
      ],
      validar: function (l) {
        if (!String(l.cidade || '').trim()) return 'Informe a cidade.';
        return U.num(l.hsp) > 0 ? null : 'Informe o HSP.';
      },
      podeExcluir: function (l) {
        const n = usoEmPropostas(function (p) { return p.localidadeId === l.id; });
        return n ? 'Localidade usada em ' + n + ' proposta(s).' : null;
      },
      campos: function (l) {
        return [
          { k: 'cidade', label: 'Cidade', required: true },
          { k: 'uf', label: 'UF', type: 'select', options: UF_OPTS },
          { k: 'hsp', label: 'HSP médio anual', type: 'number', suffix: 'kWh/m²/dia', required: true, help: 'Consulte o SunData/CRESESB para a cidade.' },
          { k: 'fonte', label: 'Fonte do dado' },
          { k: 'cosip', label: 'COSIP padrão', type: 'money', help: 'Contribuição de iluminação pública (pode ser ajustada por proposta).' },
          { k: 'concessionariaId', label: 'Concessionária', type: 'select', options: function () { return S.list('concessionarias').map(function (c) { return { v: c.id, t: c.nome }; }); } },
          { el: camposFatores(l) }
        ];
      }
    });
  });

  /* ------------------------------------------------------------ pagamentos */

  /* ------------------------------------------------------------ projetos realizados (portfólio) */

  /**
   * Foto de projeto: recorte central em 4:3 e JPEG comprimido (até ~300 kB), para que as fotos de vários projetos
   * caibam no armazenamento do navegador e saiam com o mesmo formato na proposta.
   */
  async function prepararFoto(arquivo) {
    const img = await U.loadImage(await U.readFileAsDataURL(arquivo));
    const w0 = img.naturalWidth, h0 = img.naturalHeight, prop = 4 / 3;
    let sw = w0, sh = h0, sx = 0, sy = 0;
    if (w0 / h0 > prop) { sw = h0 * prop; sx = (w0 - sw) / 2; } else { sh = w0 / prop; sy = (h0 - sh) / 2; }
    const W = Math.min(1200, Math.round(sw)), H = Math.round(W / prop);
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    g.fillStyle = '#FFFFFF';
    g.fillRect(0, 0, W, H);
    g.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
    let q = 0.82, url = cv.toDataURL('image/jpeg', q);
    while (url.length > 400000 && q > 0.5) { q -= 0.08; url = cv.toDataURL('image/jpeg', q); }
    return { dataURL: url, w: W, h: H };
  }

  function campoFoto(estado, k, rotulo) {
    const prev = h('img.foto-projeto', { alt: rotulo });
    const semFoto = h('div.foto-vazia', 'Sem foto');
    const mostrar = function () {
      const f = estado[k];
      prev.hidden = !f; semFoto.hidden = !!f;
      if (f) prev.src = f.dataURL;
    };
    const arquivo = h('input', {
      type: 'file', accept: 'image/jpeg,image/png,image/webp', onchange: async function () {
        const f = arquivo.files[0];
        if (!f) return;
        try { estado[k] = await prepararFoto(f); mostrar(); }
        catch (e) { UI.toast('Não foi possível ler a imagem. Use JPG ou PNG.', 'erro'); }
        finally { arquivo.value = ''; }
      }
    });
    mostrar();
    return h('div.campo', h('label', rotulo), h('div.foto-box', prev, semFoto), h('div.foto-acoes', arquivo,
      h('button.btn.pequeno', { type: 'button', onclick: function () { estado[k] = null; mostrar(); } }, 'Remover foto')));
  }

  const ROT_SEGMENTO = {}, ROT_TIPO_PROJ = {};
  D.SEGMENTOS.forEach(function (x) { ROT_SEGMENTO[x.id] = x.label; });
  D.TIPOS_PROJETO.forEach(function (x) { ROT_TIPO_PROJ[x.id] = x.label; });

  UI.rota('/projetos', function (cont) {
    const emp = S.config().empresa;
    UI.crud(cont, {
      colecao: 'projetos',
      titulo: 'Projetos realizados',
      subtitulo: 'Portfólio exibido nas propostas logo após a apresentação da empresa: 2 fotos e a ficha técnica de cada obra concluída. ' +
        'Cada proposta mostra ' + (U.numOr(emp.projetosNaProposta, 4) || 'nenhum') + ' projeto(s), priorizando o mesmo tipo de sistema, segmento e cidade do cliente.',
      rotuloNovo: '+ Novo projeto',
      vazio: 'Nenhum projeto cadastrado. Cadastre pelo menos 4 obras concluídas, com 2 fotos cada.',
      largo: true,
      novo: function () {
        return {
          titulo: '', segmento: 'residencial', tipoSistema: 'ongrid', cidade: emp.cidade || '', uf: emp.uf || '', conclusao: '',
          potenciaKwp: '', modulos: '', inversor: '', armazenamento: '', estrutura: '', geracaoMes: '', economiaMes: '', reducaoPct: '',
          descricao: '', foto1: null, foto2: null, exibir: true
        };
      },
      ordenar: function (a, b) { return C.periodoProjeto(b) - C.periodoProjeto(a); },
      busca: function (x) { return [x.titulo, x.cidade, x.uf, x.modulos, x.inversor, ROT_SEGMENTO[x.segmento], ROT_TIPO_PROJ[x.tipoSistema]].join(' '); },
      colunas: [
        { t: 'Projeto', v: function (x) { return h('strong', x.titulo); } },
        { t: 'Tipo', v: function (x) { return [ROT_SEGMENTO[x.segmento], ROT_TIPO_PROJ[x.tipoSistema]].filter(Boolean).join(' · '); } },
        { t: 'Local', v: function (x) { return [x.cidade, x.uf].filter(Boolean).join('/'); } },
        { t: 'Potência', cls: 'num', v: function (x) { return U.num(x.potenciaKwp) > 0 ? U.kwp(U.num(x.potenciaKwp)) + ' kWp' : '—'; } },
        { t: 'Conclusão', v: function (x) { return x.conclusao || '—'; } },
        { t: 'Nas propostas', v: function (x) {
          if (x.exibir === false) return UI.badge('Oculto', 'cinza');
          return C.projetoPronto(x) ? UI.badge('Pronto', 'ok') : UI.badge('Faltam fotos', 'ambar');
        } }
      ],
      validar: function (x) { return String(x.titulo || '').trim() ? null : 'Informe o título do projeto.'; },
      campos: function (x) {
        return [
          { k: 'titulo', label: 'Título do projeto', required: true, cls: 'span2', placeholder: 'Ex.: Residência — Bairro Centro',
            help: 'Use o nome do cliente apenas com autorização dele (LGPD).' },
          { k: 'segmento', label: 'Segmento', type: 'select', options: D.SEGMENTOS.map(function (o) { return { v: o.id, t: o.label }; }) },
          { k: 'tipoSistema', label: 'Tipo de sistema', type: 'select', options: D.TIPOS_PROJETO.map(function (o) { return { v: o.id, t: o.label }; }) },
          { k: 'cidade', label: 'Cidade' },
          { k: 'uf', label: 'UF', type: 'select', options: UF_OPTS },
          { k: 'conclusao', label: 'Conclusão (mês/ano)', placeholder: 'Ex.: 10/2025' },
          { k: 'potenciaKwp', label: 'Potência instalada', type: 'number', suffix: 'kWp' },
          { secao: 'Ficha técnica' },
          { k: 'modulos', label: 'Módulos', placeholder: 'Ex.: 12 × Trina 600 W' },
          { k: 'inversor', label: 'Inversor', placeholder: 'Ex.: Deye 5 kW híbrido' },
          { k: 'armazenamento', label: 'Armazenamento (opcional)', placeholder: 'Ex.: BYD HVS 5.1 — 5,12 kWh' },
          { k: 'estrutura', label: 'Estrutura / telhado', placeholder: 'Ex.: Telhado cerâmico' },
          { k: 'geracaoMes', label: 'Geração média', type: 'number', suffix: 'kWh/mês', help: 'Medida no monitoramento ou estimada no projeto.' },
          { k: 'economiaMes', label: 'Economia média', type: 'money', help: 'Por mês.' },
          { k: 'reducaoPct', label: 'Redução da conta', type: 'number', suffix: '%' },
          { k: 'descricao', label: 'Destaque (opcional)', type: 'textarea', rows: 2, cls: 'span2', placeholder: 'Ex.: Backup da geladeira e da iluminação; homologado em 30 dias.' },
          { secao: 'Fotos (2 por projeto — recortadas em 4:3)' },
          { el: campoFoto(x, 'foto1', 'Foto 1 — visão geral da instalação') },
          { el: campoFoto(x, 'foto2', 'Foto 2 — detalhe (inversor, baterias, quadro…)') },
          { k: 'exibir', label: 'Exibir nas propostas', type: 'checkbox', cls: 'span2' }
        ];
      }
    });
  });

  UI.rota('/pagamentos', function (cont) {
    UI.crud(cont, {
      colecao: 'pagamentos',
      titulo: 'Condições de pagamento',
      subtitulo: 'Modalidades exibidas na proposta. Cartão usa acréscimo fixo sobre o valor; financiamento usa juros compostos (PMT).',
      rotuloNovo: '+ Nova modalidade',
      novo: function () { return { nome: '', tipo: 'pmt', parcelas: 48, taxa: 0.0149, obs: '', ativo: true }; },
      ordenar: function (a, b) {
        const ord = { avista: 0, acrescimo: 1, pmt: 2 };
        return (ord[a.tipo] - ord[b.tipo]) || String(a.nome).localeCompare(String(b.nome)) || (a.parcelas - b.parcelas);
      },
      colunas: [
        { t: 'Modalidade (como aparece na proposta)', v: function (p) { return C.pagamentos(10000, [p])[0].label; } },
        { t: 'Tipo', v: function (p) { return { avista: 'À vista', acrescimo: 'Cartão (acréscimo)', pmt: 'Financiamento (PMT)' }[p.tipo]; } },
        { t: 'Simulação R$ 10.000', cls: 'num', v: function (p) { const r = C.pagamentos(10000, [p])[0]; return r.prazo + ' de ' + U.brl(r.parcela); } },
        { t: 'Situação', v: function (p) { return SIM_NAO(p.ativo); } }
      ],
      validar: function (p) { return String(p.nome || '').trim() ? null : 'Informe o nome (ex.: BV, Solfácil, Cartão).'; },
      campos: function (p, redesenhar) {
        const rot = { avista: 'Desconto à vista', acrescimo: 'Acréscimo sobre o valor', pmt: 'Taxa de juros (a.m.)' }[p.tipo];
        return [
          { k: 'nome', label: 'Nome / instituição', required: true, placeholder: 'Ex.: BV, Solfácil, Cartão' },
          { k: 'tipo', label: 'Tipo', type: 'select', options: [{ v: 'avista', t: 'À vista' }, { v: 'acrescimo', t: 'Cartão — acréscimo fixo sobre o valor' }, { v: 'pmt', t: 'Financiamento — juros compostos (PMT)' }], onChange: function () { redesenhar(); } },
          p.tipo === 'avista' ? null : { k: 'parcelas', label: 'Nº de parcelas', type: 'int' },
          { k: 'taxa', label: rot, type: 'pct' },
          { k: 'obs', label: 'Observação (aparece entre parênteses)', placeholder: 'Ex.: Visa / Amex' },
          { k: 'ativo', label: 'Ativa (pré-selecionada em novas propostas)', type: 'checkbox' }
        ];
      }
    });
  });
})(window.App);
