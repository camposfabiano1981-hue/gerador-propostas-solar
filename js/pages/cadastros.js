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
    const notas = [{ el: h('p.nota.span-all', '★ Dados usados no dimensionamento técnico. Preencha conforme o datasheet do modelo exato ou use \u201c📄 Ler datasheet\u201d.') }];
    if (e && e.origem && e.origem.arquivo) {
      const falta = App.Datasheet.faltando(tipo, e);
      notas.push({ el: h('p.nota.span-all' + (e.revisar ? '.aviso' : ''),
        '📄 Lido do datasheet \u201c' + e.origem.arquivo + '\u201d em ' + U.dataBR(String(e.origem.lidoEm || '').slice(0, 10)) + (e.origem.modeloIA ? ' (' + App.IA.nomeModelo(e.origem.modeloIA) + ')' : '') + '. ' +
        (e.revisar ? 'Confira os valores com o documento e salve para concluir a revisão. ' : '') +
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
    modulo: function () {
      return [
        { k: 'fabricante', label: 'Fabricante', required: true },
        { k: 'modelo', label: 'Modelo', required: true },
        { k: 'potencia', label: 'Potência', type: 'number', suffix: 'Wp', required: true },
        { k: 'eficiencia', label: 'Eficiência', type: 'number', suffix: '%' },
        { k: 'tecnologia', label: 'Tecnologia', placeholder: 'Ex.: Bifacial, Monocristalino, TOPCon' },
        { k: 'detalhe', label: 'Detalhe construtivo', placeholder: 'Ex.: Frame Composto' },
        { k: 'area', label: 'Área ocupada por módulo', type: 'number', suffix: 'm²', help: 'Usada no cálculo da área do telhado.' },
        { k: 'preco', label: 'Preço unitário', type: 'money' },
        { k: 'garantiaProduto', label: 'Garantia do produto', type: 'number', suffix: 'anos' },
        { k: 'garantiaPerformance', label: 'Garantia de performance', type: 'number', suffix: 'anos' },
        { secao: 'Dados elétricos (opcional — verificação de strings)' },
        { k: 'voc', label: 'Voc', type: 'number', suffix: 'V' },
        { k: 'vmp', label: 'Vmp', type: 'number', suffix: 'V' },
        { k: 'isc', label: 'Isc', type: 'number', suffix: 'A' },
        { secao: 'Proposta' },
        { k: 'descricaoProposta', label: 'Descrição na lista de equipamentos', cls: 'span2', help: function (e) { return 'Em branco = automática: ' + C.descModulo(Object.assign({}, e, { descricaoProposta: '' })); } },
        { k: 'obs', label: 'Observações internas', cls: 'span2' },
        { k: 'ativo', label: 'Ativo (disponível nas propostas)', type: 'checkbox' }
      ];
    },
    // inversor on-grid, microinversor, híbrido e bateria: campos na estrutura do datasheet (App.Datasheet; ★ = dimensionamento)
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
    material: function () {
      return [
        { k: 'descricao', label: 'Descrição', required: true, cls: 'span2' },
        { k: 'regra', label: 'Regra de quantidade', type: 'select', options: D.REGRAS_QTD.filter(function (r) { return r.id !== 'kitModulos'; }).map(function (r) { return { v: r.id, t: r.label }; }), cls: 'span2' },
        { k: 'fator', label: 'Fator / quantidade', type: 'number' },
        { k: 'unidade', label: 'Unidade', type: 'select', options: ['un', 'm', 'pt', 'cj', 'kg'] },
        { k: 'aplicaEm', label: 'Aplica-se a', type: 'select', options: APLICA_EM },
        { k: 'garantia', label: 'Garantia', placeholder: 'Ex.: 5 anos' },
        { k: 'preco', label: 'Preço unitário', type: 'money' },
        { k: 'autoIncluir', label: 'Incluir automaticamente nas propostas', type: 'checkbox', cls: 'span2' },
        { k: 'ativo', label: 'Ativo', type: 'checkbox' }
      ];
    }
  };

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
      { t: 'Regra', v: function (e) { return regraTxt(e); } },
      { t: 'Aplica-se', v: function (e) { return APLICA_TXT[e.aplicaEm || 'ambos'] || e.aplicaEm; } },
      { t: 'Preço', cls: 'num', v: function (e) { return U.brl(U.numOr(e.preco, 0)) + ' / ' + (e.unidade || 'un'); } },
      { t: 'Auto', v: function (e) { return e.autoIncluir ? UI.badge('Sim', 'ok') : UI.badge('Não', 'cinza'); } },
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

  /** Registro a gravar: novo ou o já cadastrado com os dados técnicos atualizados (preço, descrição e observações mantidos). */
  function registroDatasheet(tipo, m, origem, novo) {
    const ex = existenteDatasheet(tipo, m);
    const tecnicos = Object.assign({}, m);
    delete tecnicos.tipo; delete tecnicos.ativo; delete tecnicos.preco;
    const r = ex ? Object.assign(U.clone(ex), tecnicos) : Object.assign(novo(), tecnicos);
    r.revisar = true;
    r.origem = origem;
    delete r.arquivado;
    return { registro: r, existente: !!ex };
  }

  function escolherDatasheet(def, ctrl) {
    if (!App.IA.configurada()) {
      UI.modal({
        titulo: 'Leitura de datasheet (IA)',
        corpo: h('p', 'Para preencher o cadastro a partir do PDF do datasheet, informe antes a chave de API da Anthropic em Configurações › Leitura de datasheet (IA).'),
        acoes: [{ label: 'Fechar' }, { label: 'Configurar agora', primario: true, onClick: function () { UI.ir('#/ia'); } }]
      });
      return;
    }
    const estado = { modeloInteresse: '' };
    const arquivo = h('input', { type: 'file', accept: 'application/pdf,.pdf,image/jpeg,image/png,image/webp' });
    UI.modal({
      titulo: 'Ler datasheet — ' + def.label,
      corpo: h('div',
        h('p', 'Escolha o PDF do datasheet (ou uma foto nítida da ficha técnica). A IA lê todos os modelos da tabela e preenche os campos de ' + App.IA.NOMES_TIPO[def.id] + '.'),
        h('div.campo', h('label', 'Arquivo do datasheet'), arquivo),
        UI.grade([{ k: 'modeloInteresse', label: 'Modelo de interesse (opcional)', placeholder: 'Ex.: SUN-6K-SG05LP1-EU', help: 'Todos os modelos são lidos; este vem marcado na lista.' }], estado, null, 1)),
      acoes: [
        { label: 'Cancelar' },
        {
          label: 'Ler datasheet', primario: true, onClick: function () {
            const f = arquivo.files[0];
            if (!f) { UI.toast('Escolha o arquivo do datasheet.', 'erro'); return false; }
            lerDatasheetIA(def, ctrl, f, estado.modeloInteresse);
          }
        }
      ]
    });
  }

  function lerDatasheetIA(def, ctrl, file, modeloInteresse) {
    const controle = new AbortController();
    const nomeIA = App.IA.nomeModelo(App.IA.config().modelo);
    const tempo = h('strong', '0 s');
    const recebido = h('span.ajuda-sec', 'Analisando o documento…');
    const inicio = Date.now();
    const relogio = setInterval(function () { tempo.textContent = Math.round((Date.now() - inicio) / 1000) + ' s'; }, 1000);
    let concluido = false;
    const fechar = UI.modal({
      titulo: 'Lendo datasheet…',
      corpo: h('div',
        h('p', 'Arquivo: ', h('strong', file.name)),
        h('p', 'Modelo: ' + nomeIA + ' · tempo: ', tempo),
        h('p', recebido),
        h('p.ajuda-sec', 'Fichas de várias páginas podem levar alguns minutos. Não feche esta janela.')),
      acoes: [{ label: 'Cancelar leitura' }],
      aoFechar: function () { clearInterval(relogio); if (!concluido) controle.abort(); }
    });
    App.IA.lerDatasheet(file, {
      tipo: def.id, modeloInteresse: modeloInteresse, sinal: controle.signal,
      aoProgredir: function (n) { recebido.textContent = 'Recebendo os dados… (' + U.fmt(n, 0) + ' caracteres)'; }
    }).then(function (res) {
      concluido = true;
      fechar();
      mostrarLeitura(def, ctrl, file, modeloInteresse, res);
    }).catch(function (e) {
      concluido = true;
      fechar();
      if (!controle.signal.aborted) UI.toast(e.message || String(e), 'erro');
    });
  }

  function mostrarLeitura(def, ctrl, file, modeloInteresse, res) {
    const tipo = def.id;
    const origem = { arquivo: file.name, lidoEm: new Date().toISOString(), modeloIA: res.modeloIA };
    const novo = function () { return { tipo: tipo, ativo: true, preco: 0 }; };
    const nDim = App.Datasheet.todos(tipo).filter(function (c) { return c.dim; }).length;
    const alvo = normTxt(modeloInteresse);
    const itens = res.modelos.map(function (m) {
      const reg = registroDatasheet(tipo, m, origem, novo);
      const destaque = alvo && normTxt(m.modelo).indexOf(alvo) >= 0;
      return { m: m, reg: reg, marcado: !alvo || destaque, destaque: destaque };
    });
    const corpo = h('div');
    const info = [res.modelos.length + ' modelo(s) encontrado(s)', 'lido por ' + App.IA.nomeModelo(res.modeloIA)];
    if (res.custoUSD != null) info.push('custo estimado US$ ' + U.fmt(res.custoUSD, 3));
    corpo.appendChild(h('p.ajuda-sec', info.join(' · ') + (res.fallback ? ' (refeito no modelo indicado pela Anthropic após recusa do filtro de segurança)' : '') + '.'));
    const outro = res.tipoDetectado && res.tipoDetectado !== tipo && App.Datasheet.TIPOS.indexOf(res.tipoDetectado) >= 0;
    if (outro) {
      const outroDef = D.TIPOS_EQUIP.find(function (t) { return t.id === res.tipoDetectado; });
      corpo.appendChild(h('div.nota.aviso', 'O documento parece ser de ' + App.IA.NOMES_TIPO[res.tipoDetectado] + ', mas foi lido com os campos de ' + App.IA.NOMES_TIPO[tipo] +
        '. Para ler com os campos certos, abra a aba ' + (outroDef ? outroDef.label : res.tipoDetectado) + ' e use \u201c📄 Ler datasheet\u201d lá. ',
        h('a', { href: '#/equipamentos?tipo=' + res.tipoDetectado, onclick: function () { fecharRes(); } }, 'Abrir a aba ' + (outroDef ? outroDef.label : res.tipoDetectado))));
    }
    if (res.avisos) corpo.appendChild(h('div.nota', h('strong', 'Observações da leitura: '), res.avisos));
    if (!itens.length) corpo.appendChild(h('p', 'Nenhum modelo identificado no documento.'));
    else {
      const principal = function (m) {
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
      corpo.appendChild(h('p.ajuda-sec', 'Os itens entram marcados como \u201cRevisar\u201d e sem preço: confira cada um com o datasheet, informe o preço e salve. ' +
        'Em itens já cadastrados, preço, descrição e observações são mantidos.'));
    }
    const acoes = [{ label: 'Cancelar' }];
    if (itens.length === 1) {
      acoes.push({ label: 'Abrir no formulário', onClick: function () { const r = itens[0].reg; setTimeout(function () { ctrl.abrir(r.existente ? r.registro : null, r.existente ? null : r.registro); }, 0); } });
    }
    if (itens.length) {
      acoes.push({
        label: 'Cadastrar selecionados', primario: true, onClick: function () {
          const sel = itens.filter(function (it) { return it.marcado; });
          if (!sel.length) { UI.toast('Marque ao menos um modelo.', 'erro'); return false; }
          try {
            sel.forEach(function (it) { S.save('equipamentos', it.reg.registro); });
          } catch (e) { UI.toast(e.message, 'erro'); return false; }
          UI.toast(sel.length + ' equipamento(s) cadastrado(s) para revisão.', 'ok');
          ctrl.atualizar();
        }
      });
    }
    const fecharRes = UI.modal({ titulo: 'Datasheet lido — ' + file.name, corpo: corpo, largo: true, acoes: acoes });
  }

  UI.rota('/equipamentos', function (cont, params, qs) {
    const tipo = qs.get('tipo') || 'modulo';
    const def = D.TIPOS_EQUIP.find(function (t) { return t.id === tipo; }) || D.TIPOS_EQUIP[0];
    const abas = h('div.abas', D.TIPOS_EQUIP.map(function (t) {
      const n = S.list('equipamentos').filter(function (e) { return e.tipo === t.id; }).length;
      return h('a.aba' + (t.id === def.id ? '.ativa' : ''), { href: '#/equipamentos?tipo=' + t.id }, t.label, h('span.contagem', String(n)));
    }));
    UI.crud(cont, {
      colecao: 'equipamentos',
      titulo: 'Equipamentos — ' + def.label,
      subtitulo: 'Catálogo usado no dimensionamento e na lista de materiais. Informe os preços para o kit ser somado automaticamente.',
      rotuloNovo: '+ Novo item',
      largo: true,
      antesTabela: abas,
      filtro: function (e) { return e.tipo === def.id; },
      busca: function (e) { return [e.fabricante, e.modelo, e.descricao].join(' '); },
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
      },
      novo: function () {
        const base = { tipo: def.id, ativo: true, preco: 0 };
        if (def.id === 'modulo') Object.assign(base, { area: 2.8, garantiaProduto: 12, garantiaPerformance: 25 });
        if (def.id === 'inversor' || def.id === 'hibrido') Object.assign(base, { fases: 'Monofásico', tensao: '220V', mppts: 1, garantia: 10 });
        if (def.id === 'micro') Object.assign(base, { fases: 'Monofásico', tensao: '220V', mppts: 4, modulosPorUnidade: 4, garantia: 12 });
        if (def.id === 'hibrido') Object.assign(base, { tensaoBateria: 48, tipoBateria: 'LV' });
        if (def.id === 'bateria') Object.assign(base, { quimica: 'LiFePO4', dod: 90, garantia: 10, tipoBateria: 'LV' });
        if (def.id === 'bess') Object.assign(base, { quimica: 'LiFePO4', fases: 'Trifásico', dod: 90, eficiencia: 90, ciclos: 6000, garantia: 10 });
        if (def.id === 'estrutura') Object.assign(base, { regra: 'kitModulos', fator: 4, unidade: 'un', telhado: 'Fibrocimento', garantia: 'Vitalícia', autoIncluir: true });
        if (def.id === 'material') Object.assign(base, { regra: 'fixa', fator: 1, unidade: 'un', aplicaEm: 'ambos', autoIncluir: true });
        return base;
      },
      validar: function (e) {
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
      campos: function (e) {
        if (def.id === 'inversor' || def.id === 'hibrido' || def.id === 'micro') return CAMPOS_EQUIP.inversor(def.id, e);
        return CAMPOS_EQUIP[def.id](e);
      },
      acoesTopo: App.Datasheet.TIPOS.indexOf(def.id) >= 0 ? function (ctrl) {
        return [h('button.btn', { type: 'button', onclick: function () { escolherDatasheet(def, ctrl); } }, '📄 Ler datasheet')];
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
