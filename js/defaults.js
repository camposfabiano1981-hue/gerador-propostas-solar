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

  /** Segmentos e tipos de sistema do portfólio de projetos realizados. */
  D.SEGMENTOS = [
    { id: 'residencial', label: 'Residencial' }, { id: 'comercial', label: 'Comercial' }, { id: 'industrial', label: 'Industrial' },
    { id: 'rural', label: 'Rural' }, { id: 'publico', label: 'Poder público' }
  ];
  D.TIPOS_PROJETO = [
    { id: 'ongrid', label: 'On-Grid' }, { id: 'hibrido', label: 'Híbrido' }, { id: 'bess', label: 'BESS' }, { id: 'offgrid', label: 'Off-Grid' }
  ];

  D.TELHADOS = ['Cerâmico', 'Fibrocimento', 'Metálico', 'Laje', 'Solo', 'Shingle', 'Carport', 'Outro'];

  D.TIPOS_EQUIP = [
    { id: 'modulo', label: 'Módulos FV' },
    { id: 'inversor', label: 'Inversores On-Grid' },
    { id: 'micro', label: 'Microinversores' },
    { id: 'hibrido', label: 'Inversores Híbridos' },
    { id: 'bateria', label: 'Baterias' },
    { id: 'bess', label: 'BESS (armazenamento)' },
    { id: 'estrutura', label: 'Estruturas' },
    { id: 'material', label: 'Materiais e acessórios' }
  ];

  D.SUBGRUPOS_A = ['A4', 'A3a', 'A3', 'A2', 'A1', 'AS'];

  D.OBJETIVOS = [
    { id: 'economia', label: 'Máxima economia (melhor retorno financeiro)' },
    { id: 'backup', label: 'Segurança energética (backup em falta de energia)' },
    { id: 'demanda', label: 'Reduzir demanda / multas de ultrapassagem' }
  ];

  D.CATEGORIAS_SERVICO = ['Manutenção', 'Limpeza', 'Inspeção e laudos', 'Projetos', 'Instalações elétricas', 'Mobilidade elétrica', 'Monitoramento', 'Outros'];

  D.UNIDADES_SERVICO = ['vb', 'un', 'h', 'm', 'm²', 'kWp', 'mês', 'visita'];

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
    logo: null,
    // dados usados nos contratos (preenchidos em Configurações › Empresa; ficam só no navegador)
    razaoSocial: '',
    nomeFantasia: '',
    bairro: '',
    cep: '',
    crea: '',
    horarioAtendimento: 'Segunda a Sexta, das 08h às 17h30',
    sloganContrato: '"Sua empresa ganha em competitividade, seu imóvel valoriza e o planeta agradece."',
    prefixoContrato: 'CT',
    // projetos realizados exibidos em cada proposta (0 = não incluir a seção)
    projetosNaProposta: 4,
    banco: { banco: '', agencia: '', conta: '', titular: '', documento: '', pix: '' }
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
    // FDG — fator de dimensionamento global = potência FV (Pcc) ÷ potência dos inversores (Pca)
    fdgMin: 0.80,
    fdgMax: 1.35,
    fdgAlvo: 1.15,
    // custo de disponibilidade × Fio B no grupo B (REN 1.000/2021, art. 655-I):
    // 'maior' = maior valor entre disponibilidade e (energia não compensada + Fio B); 'disponibilidade' = disponibilidade + Fio B sobre o restante
    regraDisponibilidade: 'maior',
    areaModulo: 2.8,
    fatorVocFrio: 1.12,
    // temperaturas da célula para corrigir Voc (mínima, amanhecer de inverno) e Vmp (máxima, sol forte) pelo coeficiente do módulo
    tempMinima: 0,
    tempMaxCelula: 70,
    // preço da proposta: instalação por módulo (a faixa 1 entra automaticamente), comissão e lucro em % do valor final
    preco: { instalacaoFaixa1: 80, instalacaoFaixa2: 100, comissaoPct: 0.05, lucroPct: 0.15 },
    fioB: [
      { ano: 2023, pct: 0.15 }, { ano: 2024, pct: 0.30 }, { ano: 2025, pct: 0.45 },
      { ano: 2026, pct: 0.60 }, { ano: 2027, pct: 0.75 }, { ano: 2028, pct: 0.90 }
    ],
    fioBDepois: 1.0,
    hibrido: {
      dod: 0.90,
      // eficiência do ciclo bateria + inversor (híbrido com bateria no barramento CC: 92–97%)
      eficiencia: 0.92,
      fatorSegurancaInversor: 1.25,
      autonomiaHoras: 6,
      trocaBateriaAno: 0,
      trocaBateriaPct: 0.70,
      // consumo próprio do inversor híbrido ligado 24 h (W) — usado quando o inversor não informa o seu
      consumoProprioW: 40,
      // fator de utilização mínimo do banco na ciclagem diária (energia ciclada ÷ capacidade disponível)
      utilizacaoMin: 0.70,
      // pico de partida de motores com partida direta (× potência nominal; compressores/bombas: 5–8×)
      fatorPartida: 5
    },
    armazenamento: {
      degradacao: 0.02,
      vidaCalendario: 15,
      ciclosPadrao: 6000,
      trocaPct: 0.60,
      instalPct: 0.15,
      diasUteis: 252,
      duracaoPonta: 3,
      reducaoDemandaPct: 0.20,
      toleranciaUltrapassagem: 0.05,
      fatorUltrapassagem: 2
    }
  };

  D.textos = {
    projetosIntro: 'Alguns projetos executados pela {empresaCurta}, com a ficha técnica de cada instalação.',
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
    passoIntro: 'Da aprovação da proposta ao sistema gerando energia: veja como conduzimos cada etapa e os prazos estimados.',
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
      { norma: 'REN ANEEL nº 1.000/2021', descricao: 'Condições de acesso — FDG {fdg} documentado (item {secDim}) {fdgIcone}' },
      { norma: 'ABNT NBR 16690:2019', descricao: 'Instalações de arranjos fotovoltaicos — Requisitos' },
      { norma: 'ABNT NBR 5410:2004', descricao: 'Instalações elétricas de baixa tensão' },
      { norma: 'ABNT NBR 16274:2014', descricao: 'Sistemas FV conectados à rede elétrica' },
      { norma: 'COSIP', descricao: 'Contribuição municipal não compensável por geração própria — mantida em ambos os cenários' },
      { norma: 'NDU 001 — {concessionaria}', descricao: 'Limites de injeção em Baixa Tensão atendidos ✅' }
    ],
    conformidadeHibrido: [
      { norma: 'IEC 62619', descricao: 'Requisitos de segurança para baterias de lítio em aplicações estacionárias' }
    ],
    inclusosBess: [
      'Projeto e integração do sistema de armazenamento (BESS)',
      'Configuração da estratégia de operação (backup, horários de ponta e/ou controle de demanda)',
      'Comissionamento e testes do sistema de armazenamento'
    ],
    naoInclusosBess: [
      'Obras civis para base ou abrigo do BESS',
      'Adequações de subestação, transformador ou proteção da concessionária (quando exigidas)'
    ],
    conformidadeBess: [
      { norma: 'IEC 62933', descricao: 'Sistemas de armazenamento de energia elétrica (EES) — segurança e desempenho' },
      { norma: 'IEC 62619', descricao: 'Requisitos de segurança para baterias de lítio em aplicações estacionárias' }
    ],
    cenariosIntro: 'Para o perfil de consumo e a modalidade tarifária do cliente, foram avaliadas as alternativas abaixo com o mesmo horizonte de análise e as mesmas premissas financeiras. A recomendação considera o retorno financeiro (VPL, TIR e payback) e o objetivo principal informado pelo cliente.',
    garantiaInstalacao: '1 ano',
    notaPagamento: '* Condições sujeitas à análise de crédito e taxas vigentes na data da contratação.',
    infraDescricao: 'Materiais CA: DPS, disjuntores, quadro de proteção e sistema de aterramento',
    avulsaApresentacao: 'A {empresa} apresenta a seguir a proposta para os serviços solicitados, executados por equipe técnica registrada no {registroTipo}, com segurança, qualidade e atendimento pós-venda.',
    avulsaGarantia: '90 (noventa) dias para os serviços executados, contados da conclusão, sem prejuízo da garantia dos fabricantes para materiais e equipamentos.',
    avulsaInclusos: [
      'Mão de obra especializada e deslocamento da equipe na sede do município',
      'Ferramentas e equipamentos de segurança (EPI/EPC)',
      'Relatório de execução dos serviços'
    ],
    avulsaNaoInclusos: [
      'Materiais e peças não listados nesta proposta',
      'Serviços adicionais identificados durante a execução (orçados à parte)'
    ]
  };

  /*
   * Modelo de contrato (estrutura e cláusulas). As cláusulas são numeradas automaticamente na ordem em que aparecem.
   * Marcadores: {objeto}, {kwp}, {prazoDias}, {prazoExtenso}, {valorExtenso}, {local}, {cidade}, {uf}, {foro}, {perdas}, {pr},
   * {cl:ID} = número da cláusula com aquele id, {sec:ID} = número da seção. **texto** = negrito sublinhado.
   */
  D.contrato = {
    titulo: 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS',
    subtitulo: 'Sistema de Geração de Energia Solar Fotovoltaica',
    secoes: [
      { id: 'objeto', titulo: 'DO OBJETO', clausulas: [
        { id: 'objeto', texto: 'O presente contrato tem por objeto a prestação de serviços profissionais especializados em {objeto} por parte da **CONTRATADA**, conforme os termos e condições detalhados nas cláusulas seguintes.' }
      ] },
      { id: 'producao', titulo: 'PRODUÇÃO MÉDIA PROMETIDA', tipo: 'producao',
        paragrafo: 'A estimativa de produção mensal abaixo foi calculada com base nos dados do Atlas Brasileiro de Energia Solar – INPE/LABREN (2ª Edição, 2017), considerando a irradiação solar no plano inclinado para {local}, com fator de perdas sistêmicas de {perdas}% (temperatura, cabos, inversor, sombreamento e sujeira). A variação real pode ser de até 10% para mais ou para menos, conforme condições climáticas locais.',
        fonte: 'Fonte: Atlas Brasileiro de Energia Solar – INPE/LABREN, 2ª Ed. (2017) | CRESESB/SunData. Cálculo: potência instalada {kwp} kWp × HSP mensal × eficiência {pr}%.' },
      { id: 'obrigacoes', titulo: 'OBRIGAÇÕES DAS PARTES', clausulas: [
        { texto: 'A CONTRATANTE deverá fornecer à CONTRATADA todas as informações necessárias à realização do serviço, devendo especificar os detalhes necessários à perfeita consecução do mesmo.' },
        { texto: 'A CONTRATANTE deverá efetuar o pagamento na forma e condições estabelecidas na Cláusula {cl:pagamento}.' },
        { texto: 'A CONTRATADA deverá prestar os serviços solicitados pela CONTRATANTE conforme detalhamento e prazos descritos na Proposta Comercial e cláusulas seguintes.' },
        { texto: 'Serão de responsabilidade da CONTRATADA os meios necessários para viabilizar a prestação de serviço, incluindo equipamentos, licenças de software e local de trabalho, salvo as obrigações da CONTRATANTE previstas neste contrato.' },
        { texto: 'A CONTRATADA obriga-se a manter absoluto sigilo sobre as operações, dados, estratégias, materiais, informações e documentos da CONTRATANTE, mesmo após a conclusão dos serviços ou do término da relação contratual.' },
        { texto: 'Os contratos, informações, dados e documentos da CONTRATANTE deverão ser utilizados pela CONTRATADA estritamente para o cumprimento dos serviços solicitados.' },
        { texto: 'A CONTRATADA deverá fornecer os respectivos documentos fiscais referentes aos pagamentos do presente instrumento.' }
      ] },
      { id: 'servicos', titulo: 'DOS SERVIÇOS E PRAZO DE EXECUÇÃO', clausulas: [
        { id: 'inicio', texto: 'Os serviços terão início após o envio de todo o material e especificações necessários por parte da CONTRATANTE.' },
        { id: 'prazo', rotulo: 'PRAZO DE EXECUÇÃO E ENTREGA', sublinhar: true, texto: 'A montagem do Gerador Fotovoltaico fica no prazo de até {prazoDias} ({prazoExtenso}) dias após a assinatura do contrato, podendo ser finalizada antes do prazo.' }
      ] },
      { id: 'equipamentos', titulo: 'DOS EQUIPAMENTOS CONTRATADOS', tipo: 'equipamentos' },
      { id: 'garantias', titulo: 'DAS GARANTIAS', tipo: 'garantias' },
      { id: 'preco', titulo: 'DO PREÇO E DAS CONDIÇÕES DE PAGAMENTO', tipo: 'pagamento', clausulas: [
        { id: 'pagamento', texto: 'Os serviços alvos deste contrato serão remunerados pela quantia total de {valorExtenso}, a serem pagos conforme tabela abaixo:' }
      ] },
      { id: 'rescisao', titulo: 'DO DESCUMPRIMENTO E DA RESCISÃO', clausulas: [
        { texto: 'O descumprimento de qualquer cláusula por qualquer parte implicará na rescisão imediata deste contrato, não isentando a CONTRATADA de suas responsabilidades referentes ao zelo com informações e dados da CONTRATANTE.' },
        { texto: 'Havendo descumprimento por parte da CONTRATADA, deverão ser devolvidos os valores referentes aos serviços não desenvolvidos que já houverem sido pagos.' },
        { rotulo: 'Parágrafo Único', semNumero: true, texto: 'Caso a CONTRATANTE ainda não tenha efetuado o pagamento dos valores totais referentes a serviços já desenvolvidos, compromete-se a efetuar o pagamento dos valores referentes aos serviços realizados conforme prazos da Cláusula {cl:inicio}.' },
        { texto: 'No caso de descumprimento por parte da CONTRATANTE, caberá a devolução dos valores referentes aos serviços não desenvolvidos e já pagos, descontando eventuais impostos já recolhidos.' },
        { texto: 'Caso seja a CONTRATANTE quem requeira a rescisão imotivada, tendo havido pagamento por serviços ainda não realizados, serão devolvidos pela CONTRATADA os valores referentes aos serviços pagos que ainda não houverem sido realizados, descontados eventuais impostos já recolhidos.' },
        { texto: 'Caso seja a CONTRATADA quem requeira a rescisão imotivada, deverá devolver à CONTRATANTE a quantia referente aos serviços por ela não prestados e não realizáveis no período de encerramento do contrato.' }
      ] },
      { id: 'disposicoes', titulo: 'DO PRAZO, VALIDADE E DISPOSIÇÕES GERAIS', clausulas: [
        { texto: 'Este instrumento é válido até a finalização do projeto ou encerramento do contrato, não ficando a CONTRATADA isenta de seus compromissos éticos após sua invalidação.' },
        { texto: 'Fica compactuada entre as partes a total inexistência de vínculo trabalhista entre as partes, excluindo as obrigações previdenciárias e os encargos sociais.' },
        { texto: 'A tolerância de qualquer das partes com relação ao descumprimento de qualquer termo ou condição aqui ajustado não será considerada como desistência em exigir o cumprimento das disposições nele contidas.' },
        { id: 'foro', rotulo: 'Foro', texto: 'Para dirimir quaisquer controvérsias oriundas do presente contrato, as partes elegem o foro da Comarca de {foro}.' }
      ] }
    ],
    garantias: {
      objeto: 'Este Termo de Garantia tem por objeto assegurar a qualidade da instalação do sistema de geração de energia solar fotovoltaica, realizada pela CONTRATADA no endereço indicado pelo CONTRATANTE, nos termos do projeto técnico e do contrato de prestação de serviços celebrado entre as partes.',
      prazosIntro: 'Os prazos de garantia têm início na data de troca do medidor (habilitação do sistema) pela concessionária de energia elétrica, conforme tabela abaixo:',
      tabela: [
        { item: 'Mão de Obra e Instalação', prazo: '12 meses', cobertura: 'Falhas de montagem, fixação, conexões elétricas e suporte de monitoramento Wi-Fi.' },
        { item: 'Módulos Fotovoltaicos', prazo: '10–15 anos', cobertura: 'Defeitos de fabricação. Garantia de performance: até 30 anos (conforme fabricante).' },
        { item: 'Inversores', prazo: '5–10 anos', cobertura: 'Conforme fabricante. Suporte ao acionamento prestado pela CONTRATADA.' },
        { item: 'Estruturas de Fixação', prazo: 'Mín. 10 anos', cobertura: 'Corrosão e falhas estruturais, conforme fabricante.' },
        { item: 'Cabos, Conectores, Disjuntores, Fusíveis e Protetor contra Surtos', prazo: '12 meses', cobertura: 'Defeitos de fabricação.' }
      ],
      suporte: 'A CONTRATADA prestará suporte ao CONTRATANTE para acionamento das garantias dos fabricantes, quando necessário, durante o prazo de garantia da instalação.',
      coberturaIntro: 'A garantia abrange exclusivamente:',
      cobertura: [
        'Defeitos decorrentes de falha na execução da instalação realizada pela CONTRATADA;',
        'Falhas técnicas que impeçam o funcionamento normal do sistema após a entrega;',
        'Substituição ou reparo de componentes que apresentem defeito dentro do prazo de garantia, desde que as causas não estejam descritas nas exclusões de garantia;',
        'Suporte ao monitoramento remoto e conectividade Wi-Fi do sistema, dentro do prazo de 12 meses.'
      ],
      exclusoesIntro: 'A garantia não se aplica a danos ou defeitos originados por:',
      exclusoes: [
        'Mau uso, negligência ou operação em desacordo com as orientações técnicas fornecidas;',
        'Intervenções realizadas por terceiros não autorizados pela CONTRATADA;',
        'Modificações estruturais no imóvel que afetem, direta ou indiretamente, o sistema instalado;',
        'Surtos elétricos, descargas atmosféricas ou variações de tensão da rede sem dispositivos de proteção adequados;',
        'Eventos de força maior: tempestades, granizo, enchentes, incêndios ou outros fenômenos naturais;',
        'Ausência de manutenção preventiva recomendada pela CONTRATADA;',
        'Sujeira acumulada, sombreamento superveniente ou obstruções externas não preexistentes à instalação;',
        'Desgaste natural decorrente do uso normal dos componentes ao longo do tempo.'
      ],
      procedimentoIntro: 'Para acionar a garantia, o CONTRATANTE deverá notificar a CONTRATADA pelos canais oficiais, informando obrigatoriamente:',
      procedimento: [
        'Descrição objetiva do problema constatado;',
        'Data e hora da identificação da falha;',
        'Fotos ou registros visuais do defeito (quando aplicável);',
        'Número do contrato ou nota fiscal de referência.'
      ],
      atendimento: 'O prazo para atendimento técnico inicial é de até 02 (dois) dias úteis contados do recebimento formal da notificação. O atendimento poderá ser realizado de forma remota ou presencial, a critério técnico da CONTRATADA.',
      obrigacoesIntro: 'Para manutenção da validade desta garantia, o CONTRATANTE se compromete a:',
      obrigacoes: [
        'Permitir acesso à instalação para inspeção, manutenção e reparos;',
        'Utilizar o sistema dentro das especificações técnicas fornecidas;',
        'Realizar as limpezas e manutenções preventivas periódicas recomendadas;',
        'Não efetuar alterações, ampliações ou modificações no sistema sem autorização prévia e por escrito da CONTRATADA;',
        'Comunicar a CONTRATADA imediatamente ao identificar qualquer anormalidade no funcionamento do sistema.'
      ],
      limitacao: [
        'Esta garantia não assegura nível mínimo ou específico de geração de energia elétrica. A produção do sistema depende de fatores externos, tais como: incidência solar, nebulosidade, sombreamento, temperatura ambiente e condições climáticas locais, os quais estão fora do controle da CONTRATADA.',
        'A responsabilidade da CONTRATADA limita-se ao reparo ou substituição dos itens com defeito cobertos por esta garantia, não sendo devida qualquer indenização por lucros cessantes, perdas de produção ou danos consequentes.'
      ],
      disposicoes: [
        'Este Termo integra e complementa o contrato de fornecimento e instalação firmado entre as partes. Em caso de conflito, prevalecem as disposições contratuais específicas.',
        'A garantia é intransferível e válida exclusivamente para o endereço de instalação indicado neste documento.',
        'Quaisquer alterações a este Termo somente terão validade se formalizadas por escrito e assinadas por ambas as partes.',
        'Fica eleito o foro da Comarca de {foro} para dirimir eventuais litígios decorrentes deste instrumento, com renúncia expressa a qualquer outro, por mais privilegiado que seja.'
      ]
    }
  };

  D.servicos = [
    { id: 'srv-limpeza', descricao: 'Limpeza técnica de módulos fotovoltaicos', categoria: 'Limpeza', unidade: 'un', preco: 0, prazo: '1 dia', garantia: '', detalhes: 'Limpeza com água desmineralizada e escovas de cerdas macias, sem produtos abrasivos. Unidade = módulo.' },
    { id: 'srv-preventiva', descricao: 'Manutenção preventiva de sistema fotovoltaico', categoria: 'Manutenção', unidade: 'vb', preco: 0, prazo: '1 dia', garantia: '', detalhes: 'Inspeção visual, reaperto de conexões CA/CC, verificação de proteções, aterramento, estrutura e parâmetros do inversor, com relatório.' },
    { id: 'srv-corretiva', descricao: 'Manutenção corretiva (hora técnica)', categoria: 'Manutenção', unidade: 'h', preco: 0, prazo: 'Conforme diagnóstico', garantia: '', detalhes: '' },
    { id: 'srv-termografia', descricao: 'Inspeção termográfica de módulos e quadros', categoria: 'Inspeção e laudos', unidade: 'vb', preco: 0, prazo: '2 dias úteis', garantia: '', detalhes: 'Identificação de pontos quentes, diodos e conexões com falha, com relatório fotográfico.' },
    { id: 'srv-laudo', descricao: 'Laudo técnico com ART', categoria: 'Inspeção e laudos', unidade: 'vb', preco: 0, prazo: '5 dias úteis', garantia: '', detalhes: '' },
    { id: 'srv-padrao', descricao: 'Adequação de padrão de entrada', categoria: 'Instalações elétricas', unidade: 'vb', preco: 0, prazo: 'A combinar', garantia: '', detalhes: '' },
    { id: 'srv-spda', descricao: 'Sistema de aterramento / SPDA', categoria: 'Instalações elétricas', unidade: 'vb', preco: 0, prazo: 'A combinar', garantia: '', detalhes: '' },
    { id: 'srv-wallbox', descricao: 'Instalação de carregador veicular (wallbox)', categoria: 'Mobilidade elétrica', unidade: 'un', preco: 0, prazo: '1 dia', garantia: '', detalhes: 'Circuito dedicado, proteção DR/DPS e comissionamento do carregador.' },
    { id: 'srv-projeto', descricao: 'Projeto elétrico', categoria: 'Projetos', unidade: 'vb', preco: 0, prazo: '5 dias úteis', garantia: '', detalhes: '' },
    { id: 'srv-ampliacao', descricao: 'Ampliação de sistema fotovoltaico', categoria: 'Projetos', unidade: 'kWp', preco: 0, prazo: 'A combinar', garantia: '', detalhes: '' },
    { id: 'srv-monitoramento', descricao: 'Monitoramento remoto e suporte (mensalidade)', categoria: 'Monitoramento', unidade: 'mês', preco: 0, prazo: 'Contínuo', garantia: '', detalhes: '' }
  ];

  D.concessionarias = [
    {
      id: 'energisa-ms', nome: 'Energisa MS', uf: 'MS',
      tarifas: { B1: 0.9762, B2: 0.72, B3: 0.98 },
      branca: { ponta: '', intermediario: '', foraPonta: '' },
      verde: { ponta: '', foraPonta: '', demanda: '' },
      azul: { ponta: '', foraPonta: '', demandaPonta: '', demandaForaPonta: '' },
      horarioPonta: '',
      tusdFioB: 0.32,
      obs: 'Tarifas finais com impostos (R$/kWh e R$/kW). Confira sempre com a fatura do cliente e a resolução homologatória vigente.'
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

  /*
   * Construtores do catálogo (estruturas e materiais). Módulos, inversores, microinversores, híbridos e baterias não têm
   * catálogo: são cadastrados pelo usuário a partir do datasheet (formulário, leitura do PDF ou pesquisa na internet),
   * pois os dados técnicos do modelo exato comandam o dimensionamento.
   */
  function estrutura(id, telhado, descricao, resumo, regra, fator, autoIncluir, extra) {
    return Object.assign({
      id: id, tipo: 'estrutura', ativo: true, fabricante: '', telhado: telhado, descricao: descricao, resumo: resumo, regra: regra, fator: fator,
      unidade: 'un', aplicaEm: 'ambos', garantia: 'Conforme fabricante', preco: 0, autoIncluir: autoIncluir,
      obs: 'Quantidade estimada — conferir no projeto (layout, vãos e nº de fileiras).'
    }, extra || {});
  }

  /** Grampos e aterramento usados em todos os sistemas sobre perfil (cada telhado tem o seu conjunto, editável). */
  function fixacaoModulos(prefixo, telhado) {
    return [
      estrutura(prefixo + '-gi', telhado, 'Grampo intermediário em alumínio p/ módulos de 30–35 mm (c/ parafuso e porca martelo)', 'Grampos intermediários', 'porModulo', 2, true),
      estrutura(prefixo + '-gf', telhado, 'Grampo final (terminal) em alumínio p/ módulos de 30–35 mm', 'Grampos finais', 'porModulo', 0.5, true),
      estrutura(prefixo + '-aterr', telhado, 'Clip/terminal de aterramento p/ equipotencialização módulo–perfil', 'Clips de aterramento', 'porModulo', 1, true)
    ];
  }

  function perfis(prefixo, telhado) {
    return [
      estrutura(prefixo + '-perfil', telhado, 'Perfil/trilho de alumínio 2400 mm p/ fixação de módulos', 'Perfis AL 2400mm', 'porModulo', 1, true),
      estrutura(prefixo + '-emenda', telhado, 'Emenda de perfil de alumínio (c/ parafusos)', 'Emendas de perfil', 'porModulo', 0.5, true)
    ];
  }

  D.equipamentos = [
    /* ---------- BESS */
    {
      id: 'bess-exemplo-100', tipo: 'bess', ativo: true, fabricante: 'Genérico', modelo: 'BESS 100 kWh / 50 kW (exemplo)',
      quimica: 'LiFePO4', energia: 100, potencia: 50, dod: 90, eficiencia: 90, ciclos: 6000, fases: 'Trifásico', tensao: '380V',
      garantia: 10, preco: 0, obs: 'Item de exemplo — substitua pelo equipamento e preço do seu fornecedor.'
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
    // Fibrocimento — alternativas ao kit (não incluídas automaticamente)
    estrutura('est-fibro-parafuso-madeira', 'Fibrocimento', 'Parafuso estrutural M10 × 250 mm c/ vedação EPDM — telha fibrocimento sobre terça de madeira',
      'Parafusos estruturais (madeira)', 'porModulo', 2, false),
    estrutura('est-fibro-parafuso-metal', 'Fibrocimento', 'Fixador p/ telha fibrocimento sobre terça metálica (gancho/abraçadeira c/ vedação)',
      'Fixadores (terça metálica)', 'porModulo', 2, false),

    // Cerâmico / colonial
    estrutura('est-cer-gancho', 'Cerâmico', 'Gancho regulável em aço inox p/ telha cerâmica (colonial/americana), c/ parafusos p/ caibro',
      'Ganchos p/ telha cerâmica', 'porModulo', 2, true),
    estrutura('est-cer-gancho-portuguesa', 'Cerâmico', 'Gancho p/ telha portuguesa/romana (perfil plano) em aço inox',
      'Ganchos p/ telha portuguesa', 'porModulo', 2, false),
    ...perfis('est-cer', 'Cerâmico'),
    ...fixacaoModulos('est-cer', 'Cerâmico'),

    // Metálico (trapezoidal) — mini trilho; alternativas p/ ondulada, zipada e sanduíche
    estrutura('est-met-minitrilho', 'Metálico', 'Mini trilho de alumínio 400 mm p/ telha metálica trapezoidal c/ fita EPDM e parafusos autobrocantes',
      'Mini trilhos', 'porModulo', 2.2, true),
    estrutura('est-met-suporte-l', 'Metálico', 'Suporte "L" c/ parafuso autobrocante p/ telha metálica ondulada (usar com perfil 2400 mm)',
      'Suportes L', 'porModulo', 2, false),
    estrutura('est-met-zipada', 'Metálico', 'Grampo p/ telha zipada/kalzip (fixação sem furar a telha)', 'Grampos p/ telha zipada', 'porModulo', 2, false),
    estrutura('est-met-sanduiche', 'Metálico', 'Suporte p/ telha sanduíche (termoacústica) c/ parafuso de costura e vedação', 'Suportes p/ telha sanduíche', 'porModulo', 2, false),
    ...fixacaoModulos('est-met', 'Metálico'),

    // Laje — triângulos com inclinação; alternativa com lastro
    estrutura('est-laje-triangulo', 'Laje', 'Estrutura triangular de alumínio p/ laje, inclinação ajustável 10°–30°', 'Triângulos p/ laje', 'porModulo', 1.1, true),
    estrutura('est-laje-chumbador', 'Laje', 'Chumbador/parabolt 3/8" em aço inox p/ fixação na laje (c/ vedação)', 'Chumbadores', 'porModulo', 2.2, true),
    estrutura('est-laje-lastro', 'Laje', 'Estrutura com lastro de concreto (sem furação da laje)', 'Bases com lastro', 'porModulo', 1, false),
    ...perfis('est-laje', 'Laje'),
    ...fixacaoModulos('est-laje', 'Laje'),

    // Solo — mesas combinadas automaticamente (12, 6 e 4 módulos)
    estrutura('est-solo-mesa12', 'Solo', 'Mesa de solo em alumínio/aço galvanizado p/ 12 módulos (2 fileiras × 6, retrato)', 'Mesa de solo p/ 12 módulos', 'kitModulos', 12, true),
    estrutura('est-solo-mesa6', 'Solo', 'Mesa de solo em alumínio/aço galvanizado p/ 6 módulos (2 fileiras × 3, retrato)', 'Mesa de solo p/ 6 módulos', 'kitModulos', 6, true),
    estrutura('est-solo-mesa4', 'Solo', 'Mesa de solo em alumínio/aço galvanizado p/ 4 módulos (2 fileiras × 2, retrato)', 'Mesa de solo p/ 4 módulos', 'kitModulos', 4, true),
    estrutura('est-solo-fundacao', 'Solo', 'Fundação em concreto (estaca/sapata) por pilar da mesa de solo', 'Fundações', 'porModulo', 0.5, false),
    ...fixacaoModulos('est-solo', 'Solo'),

    // Shingle
    estrutura('est-shingle-gancho', 'Shingle', 'Gancho com flashing e vedação p/ telha shingle', 'Ganchos p/ shingle', 'porModulo', 2, true),
    ...perfis('est-shingle', 'Shingle'),
    ...fixacaoModulos('est-shingle', 'Shingle'),

    // Carport
    estrutura('est-carport-vaga', 'Carport', 'Estrutura de carport em aço galvanizado — 1 vaga (até 10 módulos), c/ terças e fixações', 'Carport (por vaga)', 'kitModulos', 10, true),
    estrutura('est-carport-calha', 'Carport', 'Kit de vedação/calha entre módulos p/ carport impermeável', 'Vedação do carport', 'porModulo', 1, false),
    ...fixacaoModulos('est-carport', 'Carport'),

    // Microinversores (qualquer telhado)
    estrutura('est-micro-suporte', 'Todos', 'Suporte de fixação do microinversor no perfil/trilho', 'Suportes de microinversor', 'porInversor', 1, true, { aplicaEm: 'micro' }),

    {
      id: 'mat-cabo-vm', tipo: 'material', ativo: true, descricao: 'Cabo Solar 4,0mm² Vermelho — proteção UV 1,8 kVCC',
      regra: 'fixa', fator: 25, unidade: 'm', aplicaEm: 'string', garantia: '5 anos', preco: 0, autoIncluir: true
    },
    {
      id: 'mat-cabo-pt', tipo: 'material', ativo: true, descricao: 'Cabo Solar 4,0mm² Preto — proteção UV 1,8 kVCC',
      regra: 'fixa', fator: 25, unidade: 'm', aplicaEm: 'string', garantia: '5 anos', preco: 0, autoIncluir: true
    },
    {
      id: 'mat-mc4', tipo: 'material', ativo: true, descricao: 'Conector (par) MC4 4mm',
      regra: 'porMppt', fator: 2, unidade: 'pt', aplicaEm: 'string', garantia: '2 anos', preco: 0, autoIncluir: true
    },
    {
      id: 'mat-micro-tronco', tipo: 'material', ativo: true, descricao: 'Cabo tronco CA p/ microinversores (1 conector por unidade)',
      regra: 'porInversor', fator: 1, unidade: 'un', aplicaEm: 'micro', garantia: 'Conforme fabricante', preco: 0, autoIncluir: true
    },
    {
      id: 'mat-micro-terminal', tipo: 'material', ativo: true, descricao: 'Terminal de fim de linha do cabo tronco (1 por ramal de até 3 microinversores)',
      regra: 'porInversor', fator: 0.3333, unidade: 'un', aplicaEm: 'micro', garantia: 'Conforme fabricante', preco: 0, autoIncluir: true
    },
    {
      id: 'mat-micro-dtu', tipo: 'material', ativo: true, descricao: 'Gateway/DTU de monitoramento dos microinversores (conforme fabricante)',
      regra: 'fixa', fator: 1, unidade: 'un', aplicaEm: 'micro', garantia: 'Conforme fabricante', preco: 0, autoIncluir: true
    },
    {
      id: 'mat-stringbox', tipo: 'material', ativo: true, descricao: 'String box CC c/ DPS 1000 V tipo II e chave seccionadora (quando o inversor não tiver DPS CC integrado)',
      regra: 'porInversor', fator: 1, unidade: 'un', aplicaEm: 'string', garantia: 'Conforme fabricante', preco: 0, autoIncluir: false
    }
  ];

  /*
   * Dados das baterias do catálogo anterior (removido), usados só pelas migrações de bases antigas (versões 4 e 5),
   * que atualizam baterias ainda guardadas em propostas.
   *
   * Capacidade máxima por inversor (kWh) das baterias modulares de alta tensão, conforme os datasheets:
   * BYD HVS — torres de 2 a 5 módulos de 2,56 kWh, até 3 torres; BYD HVM — 3 a 8 módulos de 2,76 kWh, até 3 torres;
   * Huawei LUNA2000-S0 — até 3 módulos de 5 kWh por torre, até 2 torres.
   */
  D.CAP_MAX_SISTEMA = {
    'bat-byd-hvs51': 38.4, 'bat-byd-hvm83': 66.24, 'bat-huawei-luna5': 30, 'bat-huawei-luna10': 30, 'bat-huawei-luna15': 30
  };

  /*
   * Potência contínua de descarga por unidade (kW), conforme os datasheets: BYD HVS 25 A (5.1 = 204,8 V) e HVM 50 A
   * (8.3 = 153,6 V); Huawei LUNA2000-S0 2,5 kW (5 kWh) e 5 kW (10/15 kWh); Sungrow SBR 30 A contínuos × tensão nominal;
   * Pylontech US3000C 37 A recomendados × 48 V. Sem dado confirmado, o cálculo usa 0,5C e avisa.
   */
  D.POT_BATERIA = {
    'bat-byd-hvs51': 5.12, 'bat-byd-hvm83': 7.68, 'bat-huawei-luna5': 2.5, 'bat-huawei-luna10': 5, 'bat-huawei-luna15': 5,
    'bat-sungrow-sbr096': 5.76, 'bat-sungrow-sbr128': 7.68, 'bat-pylon-us3000c': 1.78
  };

  /** Cargas críticas de exemplo para novos sistemas híbridos. */
  D.cargasExemplo = [
    { descricao: 'Geladeira', qtd: 1, potencia: 150, horas: 6, motor: true },
    { descricao: 'Iluminação LED', qtd: 8, potencia: 10, horas: 4 },
    { descricao: 'Roteador Wi-Fi', qtd: 1, potencia: 12, horas: 6 },
    { descricao: 'Televisor', qtd: 1, potencia: 100, horas: 3 },
    { descricao: 'Ventilador', qtd: 2, potencia: 80, horas: 4 }
  ];

  App.DEFAULTS = D;
})(window.App);
