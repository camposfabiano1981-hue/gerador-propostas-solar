/* Dados padrão (semente) da plataforma. Tudo aqui pode ser alterado pela interface. */
window.App = window.App || {};

(function (App) {
  'use strict';

  const D = {};

  D.LIGACOES = [
    { id: 'mono', label: 'Monofásica' },
    { id: 'bi', label: 'Bifásica' },
    { id: 'tri', label: 'Trifásica' }
  ];

  D.CLASSES = [
    { id: 'Residencial B1', tarifa: 'B1' },
    { id: 'Rural B2', tarifa: 'B2' },
    { id: 'Comercial B3', tarifa: 'B3' },
    { id: 'Industrial B3', tarifa: 'B3' },
    { id: 'Poder Público B3', tarifa: 'B3' }
  ];

  D.TENSOES = ['127 V', '220 V', '127/220 V', '220/380 V', '380 V'];

  D.TELHADOS = ['Cerâmico', 'Fibrocimento', 'Metálico', 'Laje', 'Solo', 'Outro'];

  D.TIPOS_EQUIP = [
    { id: 'modulo', label: 'Módulos FV' },
    { id: 'inversor', label: 'Inversores On-Grid' },
    { id: 'hibrido', label: 'Inversores Híbridos' },
    { id: 'bateria', label: 'Baterias' },
    { id: 'estrutura', label: 'Estruturas' },
    { id: 'material', label: 'Materiais e acessórios' }
  ];

  D.REGRAS_QTD = [
    { id: 'fixa', label: 'Quantidade fixa' },
    { id: 'porModulo', label: 'Proporcional ao nº de módulos (fator × módulos, arred. p/ cima)' },
    { id: 'kitModulos', label: 'Kit para N módulos (combinação automática)' },
    { id: 'porInversor', label: 'Proporcional ao nº de inversores' },
    { id: 'porMppt', label: 'Proporcional ao nº de MPPTs' },
    { id: 'porBateria', label: 'Proporcional ao nº de baterias' }
  ];

  D.STATUS = [
    { id: 'rascunho', label: 'Rascunho' },
    { id: 'enviada', label: 'Enviada' },
    { id: 'negociacao', label: 'Em negociação' },
    { id: 'aprovada', label: 'Aprovada' },
    { id: 'recusada', label: 'Recusada' }
  ];

  D.empresa = {
    razao: 'Gênesis Engenharia & Consultoria',
    nomeCurto: 'Gênesis',
    cnpj: '55.342.066/0001-51',
    registroTipo: 'CFT-BR',
    registro: '69715998100',
    cidade: 'Corumbá',
    uf: 'MS',
    endereco: '',
    telefone: '',
    email: '',
    site: '',
    responsavel: 'Fabiano Guimarães Campos',
    cargo: 'Engenheiro Responsável',
    prefixo: 'GE',
    validadeDias: 5,
    papel: 'letter',
    logo: null
  };

  D.premissas = {
    pr: 0.80,
    degradacao: 0.005,
    inflacaoTarifa: 0.05,
    reajusteCosip: 0.05,
    reajustarTusd: false,
    tma: 0.145,
    tmaNome: 'SELIC',
    fatorCO2: 0.0817,
    simultaneidade: 0.5,
    horizonte: 25,
    disponibilidade: { mono: 30, bi: 50, tri: 100 },
    limiteKwp: { mono: 8, bi: 15, tri: 75 },
    fdiMin: 0.75,
    fdiMax: 1.20,
    fdiAlvo: 0.90,
    areaModulo: 2.8,
    fatorVocFrio: 1.12,
    fioB: [
      { ano: 2023, pct: 0.15 }, { ano: 2024, pct: 0.30 }, { ano: 2025, pct: 0.45 },
      { ano: 2026, pct: 0.60 }, { ano: 2027, pct: 0.75 }, { ano: 2028, pct: 0.90 }
    ],
    fioBDepois: 1.0,
    hibrido: {
      dod: 0.90,
      eficiencia: 0.90,
      fatorSegurancaInversor: 1.25,
      autonomiaHoras: 6,
      trocaBateriaAno: 0,
      trocaBateriaPct: 0.70
    }
  };

  D.textos = {
    apresentacao: 'A {empresa} é especializada em energia solar fotovoltaica, automação e engenharia elétrica em {cidadeEmpresa}. Executamos o ciclo completo: dimensionamento técnico, fornecimento, instalação certificada, homologação {concessionaria} e suporte pós-venda. Equipe registrada no {registroTipo}.',
    slogan: '"Sua conta de luz vira investimento, seu imóvel valoriza e o planeta agradece."',
    inclusos: [
      'Projeto elétrico completo + ART/{registroTipo}',
      'Fornecimento e instalação dos equipamentos',
      'Instalação da estrutura de fixação',
      'Cabeamento CC e CA',
      'Infraestrutura elétrica CA (DPS, disjuntores, aterramento)',
      'Parametrização do inversor {inversor}',
      'Protocolo de homologação MMGD — {concessionaria}',
      'Comissionamento e testes',
      'Treinamento de monitoramento'
    ],
    inclusosHibrido: [
      'Configuração do banco de baterias e do modo de backup',
      'Montagem do quadro de cargas críticas (backup)'
    ],
    naoInclusos: [
      'Adequação da rede interna de baixa tensão',
      'Troca do padrão de entrada (medidor)',
      'Obras civis (reforço de telhado/madeiramento)',
      'Seguro patrimonial dos equipamentos',
      'Taxa de vistoria da {concessionaria}',
      'Frete dos equipamentos (a calcular — CIF)'
    ],
    naoInclusosHibrido: [
      'Ampliação futura do banco de baterias',
      'Separação de circuitos além das cargas críticas listadas'
    ],
    cronograma: [
      { etapa: 'Projeto elétrico + emissão de ART', prazo: '5 dias úteis' },
      { etapa: 'Aquisição e entrega do kit fotovoltaico (itens disponíveis em estoque)', prazo: '15–30 dias úteis' },
      { etapa: 'Instalação mecânica e elétrica', prazo: '2–3 dias úteis' },
      { etapa: 'Parametrização do inversor e comissionamento', prazo: '1 dia' },
      { etapa: 'Protocolo de homologação MMGD — {concessionaria}', prazo: '30–60 dias ({concessionaria})' },
      { etapa: 'Troca do medidor bidirecional e início de geração', prazo: 'Após aprovação {concessionaria}' }
    ],
    conformidade: [
      { norma: 'Lei 14.300/2022', descricao: 'Marco Legal da Geração Distribuída — Fio B e MMGD' },
      { norma: 'REN ANEEL nº 1.000/2021', descricao: 'Condições de acesso — FDI {fdi} documentado (item {secDim}) {fdiIcone}' },
      { norma: 'ABNT NBR 16690:2019', descricao: 'Instalações de arranjos fotovoltaicos — Requisitos' },
      { norma: 'ABNT NBR 5410:2004', descricao: 'Instalações elétricas de baixa tensão' },
      { norma: 'ABNT NBR 16274:2014', descricao: 'Sistemas FV conectados à rede elétrica' },
      { norma: 'COSIP', descricao: 'Contribuição municipal não compensável por geração própria — mantida em ambos os cenários' },
      { norma: 'NDU 001 — {concessionaria}', descricao: 'Limites de injeção em Baixa Tensão atendidos ✅' }
    ],
    conformidadeHibrido: [
      { norma: 'IEC 62619', descricao: 'Requisitos de segurança para baterias de lítio em aplicações estacionárias' }
    ],
    garantiaInstalacao: '1 ano',
    notaPagamento: '* Condições sujeitas à análise de crédito e taxas vigentes na data da contratação.',
    infraDescricao: 'Materiais CA: DPS, disjuntores, quadro de proteção e sistema de aterramento'
  };

  D.concessionarias = [
    {
      id: 'energisa-ms', nome: 'Energisa MS', uf: 'MS',
      tarifas: { B1: 0.9762, B2: 0.72, B3: 0.98 },
      tusdFioB: 0.32,
      obs: 'Tarifas finais com impostos (R$/kWh). Confira sempre com a fatura do cliente.'
    }
  ];

  D.localidades = [
    {
      id: 'corumba-ms', cidade: 'Corumbá', uf: 'MS', hsp: 5.2, cosip: 61.0, fonte: 'CRESESB',
      fatores: [1.03, 0.98, 0.97, 0.99, 0.94, 0.88, 0.90, 0.96, 1.00, 1.05, 1.08, 1.12],
      concessionariaId: 'energisa-ms'
    }
  ];

  D.pagamentos = [
    { id: 'pg-avista', nome: 'À vista', tipo: 'avista', parcelas: 1, taxa: 0, obs: '', ativo: true },
    { id: 'pg-c12', nome: 'Cartão', tipo: 'acrescimo', parcelas: 12, taxa: 0.1149, obs: 'Outras bandeiras', ativo: true },
    { id: 'pg-c18', nome: 'Cartão', tipo: 'acrescimo', parcelas: 18, taxa: 0.1620, obs: 'Mastercard / Elo', ativo: true },
    { id: 'pg-c24', nome: 'Cartão', tipo: 'acrescimo', parcelas: 24, taxa: 0.2105, obs: 'Visa / Amex', ativo: true },
    { id: 'pg-bv48', nome: 'BV', tipo: 'pmt', parcelas: 48, taxa: 0.0149, obs: '', ativo: true },
    { id: 'pg-bv60', nome: 'BV', tipo: 'pmt', parcelas: 60, taxa: 0.0159, obs: '', ativo: true },
    { id: 'pg-bv72', nome: 'BV', tipo: 'pmt', parcelas: 72, taxa: 0.0169, obs: '', ativo: true },
    { id: 'pg-sf48', nome: 'Solfácil', tipo: 'pmt', parcelas: 48, taxa: 0.0149, obs: '', ativo: true },
    { id: 'pg-sf60', nome: 'Solfácil', tipo: 'pmt', parcelas: 60, taxa: 0.0155, obs: '', ativo: true },
    { id: 'pg-sf72', nome: 'Solfácil', tipo: 'pmt', parcelas: 72, taxa: 0.0165, obs: '', ativo: true }
  ];

  const REF = 'Dados de referência — conferir datasheet e preço com o distribuidor.';

  D.equipamentos = [
    {
      id: 'mod-dmegc-625', tipo: 'modulo', ativo: true, fabricante: 'DMEGC', modelo: 'DM625G12RT-B66HBW-P',
      potencia: 625, eficiencia: 23.1, tecnologia: 'Bifacial', detalhe: 'Frame Composto', area: 2.8,
      garantiaProduto: 12, garantiaPerformance: 25, voc: null, vmp: null, isc: null, preco: 0, obs: REF
    },
    {
      id: 'inv-sofar-4', tipo: 'inversor', ativo: true, fabricante: 'Sofar', modelo: '4KTL2-G3',
      potencia: 4, fases: 'Monofásico', tensao: '220V', mppts: 1, vmaxCC: null, mpptMin: null, mpptMax: null,
      monitoramento: 'Sofar SolarMAN Smart (Wi-Fi — módulo opcional)', garantia: 10, preco: 0, obs: REF
    },
    {
      id: 'hib-deye-5', tipo: 'hibrido', ativo: true, fabricante: 'Deye', modelo: 'SUN-5K-SG04LP1',
      potencia: 5, potenciaBackup: 5, fases: 'Monofásico', tensao: '220V', mppts: 2, tensaoBateria: 48,
      vmaxCC: null, mpptMin: null, mpptMax: null, monitoramento: 'Deye Cloud (Wi-Fi)', garantia: 5, preco: 0, obs: REF
    },
    {
      id: 'bat-deye-51', tipo: 'bateria', ativo: true, fabricante: 'Deye', modelo: 'SE-G5.1 Pro-B',
      quimica: 'LiFePO4', tensao: 51.2, capacidadeAh: 100, energia: 5.12, dod: 90, ciclos: 6000, garantia: 10, preco: 0, obs: REF
    },
    {
      id: 'bat-pylon-us5000', tipo: 'bateria', ativo: true, fabricante: 'Pylontech', modelo: 'US5000',
      quimica: 'LiFePO4', tensao: 48, capacidadeAh: 100, energia: 4.8, dod: 95, ciclos: 6000, garantia: 10, preco: 0, obs: REF
    },
    {
      id: 'est-fibro-4', tipo: 'estrutura', ativo: true, fabricante: 'Solfácil', telhado: 'Fibrocimento',
      descricao: 'Kit Suporte Telha Fibrocimento — Parafuso Estrutural — p/ 4 módulos (Solfácil)',
      resumo: 'Kit Fibrocimento p/ 4 módulos', regra: 'kitModulos', fator: 4, unidade: 'un', garantia: 'Vitalícia', preco: 0, autoIncluir: true
    },
    {
      id: 'est-fibro-2', tipo: 'estrutura', ativo: true, fabricante: 'Solfácil', telhado: 'Fibrocimento',
      descricao: 'Kit Suporte Telha Fibrocimento — Parafuso Estrutural — p/ 2 módulos (Solfácil)',
      resumo: 'Kit p/ 2 módulos', regra: 'kitModulos', fator: 2, unidade: 'un', garantia: 'Vitalícia', preco: 0, autoIncluir: true
    },
    {
      id: 'est-perfil-2400', tipo: 'estrutura', ativo: true, fabricante: 'Solfácil', telhado: 'Fibrocimento',
      descricao: 'Perfil Alumínio Solfácil 2400mm (0,537 kg/m) — p/ módulos 585–660W',
      resumo: 'Perfis AL 2400mm', regra: 'porModulo', fator: 1.1, unidade: 'un', garantia: 'Vitalícia', preco: 0, autoIncluir: true
    },
    {
      id: 'mat-cabo-vm', tipo: 'material', ativo: true, descricao: 'Cabo Solar 4,0mm² Vermelho — proteção UV 1,8 kVCC',
      regra: 'fixa', fator: 25, unidade: 'm', aplicaEm: 'ambos', garantia: '5 anos', preco: 0, autoIncluir: true
    },
    {
      id: 'mat-cabo-pt', tipo: 'material', ativo: true, descricao: 'Cabo Solar 4,0mm² Preto — proteção UV 1,8 kVCC',
      regra: 'fixa', fator: 25, unidade: 'm', aplicaEm: 'ambos', garantia: '5 anos', preco: 0, autoIncluir: true
    },
    {
      id: 'mat-mc4', tipo: 'material', ativo: true, descricao: 'Conector (par) MC4 4mm',
      regra: 'porMppt', fator: 2, unidade: 'pt', aplicaEm: 'ambos', garantia: '2 anos', preco: 0, autoIncluir: true
    }
  ];

  /** Cargas críticas de exemplo para novos sistemas híbridos. */
  D.cargasExemplo = [
    { descricao: 'Geladeira', qtd: 1, potencia: 150, horas: 6 },
    { descricao: 'Iluminação LED', qtd: 8, potencia: 10, horas: 4 },
    { descricao: 'Roteador Wi-Fi', qtd: 1, potencia: 12, horas: 6 },
    { descricao: 'Televisor', qtd: 1, potencia: 100, horas: 3 },
    { descricao: 'Ventilador', qtd: 2, potencia: 80, horas: 4 }
  ];

  App.DEFAULTS = D;
})(window.App);
