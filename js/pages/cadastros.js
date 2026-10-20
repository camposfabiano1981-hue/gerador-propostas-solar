/* Cadastros: clientes, equipamentos, concessionárias, localidades (irradiação) e condições de pagamento. */
(function (App) {
  'use strict';

  const U = App.U, UI = App.UI, S = App.Store, D = App.DEFAULTS, C = App.Calc;
  const h = U.h;

  const SIM_NAO = function (v) { return v === false ? UI.badge('Inativo', 'cinza') : UI.badge('Ativo', 'ok'); };
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
    inversor: function (hibrido) {
      const c = [
        { k: 'fabricante', label: 'Fabricante', required: true },
        { k: 'modelo', label: 'Modelo', required: true },
        { k: 'potencia', label: 'Potência nominal CA', type: 'number', suffix: 'kW', required: true },
        { k: 'fases', label: 'Fases', type: 'select', options: ['Monofásico', 'Trifásico'] },
        { k: 'tensao', label: 'Tensão de saída', placeholder: 'Ex.: 220V' },
        { k: 'mppts', label: 'Nº de MPPTs', type: 'int' }
      ];
      if (hibrido) {
        c.push(
          { k: 'potenciaBackup', label: 'Potência de backup (off-grid)', type: 'number', suffix: 'kW', help: 'Em branco = potência nominal.' },
          { k: 'tensaoBateria', label: 'Tensão nominal da bateria', type: 'number', suffix: 'V', help: 'Ex.: 48 (baixa tensão) ou 200+ (alta tensão).' }
        );
      }
      c.push(
        { k: 'monitoramento', label: 'Monitoramento', cls: 'span2', placeholder: 'Ex.: App do fabricante (Wi-Fi)' },
        { k: 'garantia', label: 'Garantia', type: 'number', suffix: 'anos' },
        { k: 'preco', label: 'Preço unitário', type: 'money' },
        { secao: 'Dados elétricos (opcional — verificação de strings)' },
        { k: 'vmaxCC', label: 'Tensão máx. CC', type: 'number', suffix: 'V' },
        { k: 'mpptMin', label: 'Faixa MPPT mín.', type: 'number', suffix: 'V' },
        { k: 'mpptMax', label: 'Faixa MPPT máx.', type: 'number', suffix: 'V' },
        { secao: 'Proposta' },
        { k: 'descricaoProposta', label: 'Descrição na lista de equipamentos', cls: 'span2', help: function (e) { return 'Em branco = automática: ' + C.descInversor(Object.assign({}, e, { descricaoProposta: '' })); } },
        { k: 'obs', label: 'Observações internas', cls: 'span2' },
        { k: 'ativo', label: 'Ativo (disponível nas propostas)', type: 'checkbox' }
      );
      return c;
    },
    bateria: function () {
      return [
        { k: 'fabricante', label: 'Fabricante', required: true },
        { k: 'modelo', label: 'Modelo', required: true },
        { k: 'quimica', label: 'Química', type: 'select', options: ['LiFePO4', 'Lítio NMC', 'Chumbo-ácido', 'Chumbo-carbono', 'Outra'] },
        { k: 'energia', label: 'Energia nominal', type: 'number', suffix: 'kWh', required: true },
        { k: 'tensao', label: 'Tensão nominal', type: 'number', suffix: 'V' },
        { k: 'capacidadeAh', label: 'Capacidade', type: 'number', suffix: 'Ah' },
        { k: 'dod', label: 'Profundidade de descarga (DoD)', type: 'number', suffix: '%' },
        { k: 'ciclos', label: 'Vida útil', type: 'int', suffix: 'ciclos' },
        { k: 'garantia', label: 'Garantia', type: 'number', suffix: 'anos' },
        { k: 'preco', label: 'Preço unitário', type: 'money' },
        { k: 'descricaoProposta', label: 'Descrição na lista de equipamentos', cls: 'span2', help: function (e) { return 'Em branco = automática: ' + C.descBateria(Object.assign({}, e, { descricaoProposta: '' })); } },
        { k: 'obs', label: 'Observações internas', cls: 'span2' },
        { k: 'ativo', label: 'Ativo (disponível nas propostas)', type: 'checkbox' }
      ];
    },
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
        { k: 'garantia', label: 'Garantia', placeholder: 'Ex.: Vitalícia' },
        { k: 'preco', label: 'Preço unitário', type: 'money' },
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
        { k: 'aplicaEm', label: 'Aplica-se a', type: 'select', options: [{ v: 'ambos', t: 'On-Grid e Híbrido' }, { v: 'ongrid', t: 'Somente On-Grid' }, { v: 'hibrido', t: 'Somente Híbrido' }] },
        { k: 'garantia', label: 'Garantia', placeholder: 'Ex.: 5 anos' },
        { k: 'preco', label: 'Preço unitário', type: 'money' },
        { k: 'autoIncluir', label: 'Incluir automaticamente nas propostas', type: 'checkbox', cls: 'span2' },
        { k: 'ativo', label: 'Ativo', type: 'checkbox' }
      ];
    }
  };

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
      { t: 'Situação', v: function (e) { return SIM_NAO(e.ativo); } }
    ],
    bateria: [
      { t: 'Bateria', v: function (e) { return h('span', h('strong', e.fabricante + ' '), e.modelo); } },
      { t: 'Energia', cls: 'num', v: function (e) { return U.fmtSmart(e.energia, 2) + ' kWh'; } },
      { t: 'Tensão', cls: 'num', v: function (e) { return e.tensao ? U.fmtSmart(e.tensao, 1) + ' V' : '—'; } },
      { t: 'Química', v: function (e) { return e.quimica; } },
      { t: 'DoD', cls: 'num', v: function (e) { return e.dod ? e.dod + '%' : '—'; } },
      { t: 'Preço', cls: 'num', v: function (e) { return U.brl(U.numOr(e.preco, 0)); } },
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
      { t: 'Telhado', v: function (e) { return e.telhado; } },
      { t: 'Regra', v: function (e) { return regraTxt(e); } },
      { t: 'Preço', cls: 'num', v: function (e) { return U.brl(U.numOr(e.preco, 0)); } },
      { t: 'Auto', v: function (e) { return e.autoIncluir ? UI.badge('Sim', 'ok') : UI.badge('Não', 'cinza'); } },
      { t: 'Situação', v: function (e) { return SIM_NAO(e.ativo); } }
    ],
    material: [
      { t: 'Descrição', v: function (e) { return e.descricao; } },
      { t: 'Regra', v: function (e) { return regraTxt(e); } },
      { t: 'Aplica-se', v: function (e) { return { ambos: 'Ambos', ongrid: 'On-Grid', hibrido: 'Híbrido' }[e.aplicaEm || 'ambos']; } },
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
      ordenar: function (a, b) { return (U.numOr(a.potencia, 0) - U.numOr(b.potencia, 0)) || String(a.fabricante || a.descricao).localeCompare(String(b.fabricante || b.descricao)); },
      colunas: COLUNAS_EQUIP[def.id === 'hibrido' ? 'inversor' : def.id],
      novo: function () {
        const base = { tipo: def.id, ativo: true, preco: 0 };
        if (def.id === 'modulo') Object.assign(base, { area: 2.8, garantiaProduto: 12, garantiaPerformance: 25 });
        if (def.id === 'inversor' || def.id === 'hibrido') Object.assign(base, { fases: 'Monofásico', tensao: '220V', mppts: 1, garantia: 10 });
        if (def.id === 'hibrido') Object.assign(base, { tensaoBateria: 48 });
        if (def.id === 'bateria') Object.assign(base, { quimica: 'LiFePO4', dod: 90, garantia: 10 });
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
        return U.num(e.potencia) > 0 ? null : 'Informe a potência.';
      },
      podeExcluir: function (e) {
        const n = usoEmPropostas(function (p) {
          return p.moduloId === e.id || p.inversorId === e.id || p.bateriaId === e.id || p.bessId === e.id ||
            (p.itens || []).some(function (i) { return i.equipamentoId === e.id; });
        });
        return n ? 'Item usado em ' + n + ' proposta(s). Desative-o em vez de excluir.' : null;
      },
      campos: function () { return def.id === 'hibrido' ? CAMPOS_EQUIP.inversor(true) : CAMPOS_EQUIP[def.id](); }
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
