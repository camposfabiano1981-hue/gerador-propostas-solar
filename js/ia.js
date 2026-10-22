/*
 * Leitura de datasheets com a API do Claude (Anthropic): envia o PDF (ou a imagem) do datasheet — ou pesquisa o datasheet do
 * modelo na internet — e recebe os dados técnicos no formato dos campos de cadastro (App.Datasheet), um item por modelo/coluna da ficha. A chave de API fica só neste
 * navegador (não entra no backup); o SDK oficial é carregado do CDN na primeira leitura.
 */
window.App = window.App || {};

(function (App) {
  'use strict';

  const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.132.1/+esm';
  const CHAVE_LOCAL = 'gsp.ia';
  const MODELOS = [
    { id: 'claude-opus-5-5', nome: 'Claude Opus 5.5 — mais preciso (recomendado)', entrada: 4, saida: 20 },
    { id: 'claude-sonnet-5-5', nome: 'Claude Sonnet 5.5 — mais rápido e econômico', entrada: 2, saida: 10 },
    { id: 'claude-haiku-5-5', nome: 'Claude Haiku 5.5 — o mais econômico', entrada: 0.1, saida: 0.5 }
  ];
  // modelos que podem atender quando o filtro de segurança recusa o pedido (preço em US$ por milhão de tokens)
  const FALLBACK = {
    'claude-opus-5': { nome: 'Claude Opus 5', entrada: 5, saida: 25 },
    'claude-opus-4-8': { nome: 'Claude Opus 4.8', entrada: 5, saida: 25 },
    'claude-sonnet-5': { nome: 'Claude Sonnet 5', entrada: 2, saida: 10 }
  };
  // Opus 5.5 e Sonnet 5.5 têm fallback no servidor (refaz o pedido recusado no modelo indicado pela Anthropic); Haiku 5.5 não
  const COM_FALLBACK = { 'claude-opus-5-5': true, 'claude-sonnet-5-5': true };
  const BETA_FALLBACK = 'server-side-fallback-2026-07-01';
  const LIMITE_PDF = 20 * 1024 * 1024; // requisição até 32 MB, com o base64 ocupando 4/3 do arquivo
  const LIMITE_IMAGEM = 5 * 1024 * 1024;
  const IMAGENS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  const NOMES_TIPO = { modulo: 'módulo fotovoltaico', inversor: 'inversor on-grid (string)', micro: 'microinversor', hibrido: 'inversor híbrido', bateria: 'bateria' };

  const SISTEMA = [
    'Você extrai dados técnicos de datasheets de equipamentos fotovoltaicos (módulos, inversores on-grid, microinversores, inversores híbridos e baterias) para um sistema de dimensionamento de projetos solares no Brasil. Os valores serão usados no cálculo de strings, de baterias e de backup, então a exatidão importa mais que a completude.',
    'Regras:',
    '- Use somente valores impressos no documento. Não estime, não complete com valores típicos e não deduza de outros modelos: o que não estiver no datasheet fica como texto vazio ("").',
    '- Crie um item em "modelos" para cada modelo ou variante com coluna própria na tabela de dados técnicos, com o nome exato do modelo.',
    '- Converta para a unidade de cada campo (W → kW dividindo por 1000; Wh → kWh; mA → A). Números como texto, com ponto decimal, sem unidade e sem separador de milhar (97,6% → "97.6"; 1.500 V → "1500").',
    '- Faixas "a–b" ou "a~b" vão para os campos de mínimo e máximo correspondentes.',
    '- Quando um valor varia entre MPPTs ou entradas (ex.: "16/16/32 A"), use o menor, que é o limite mais restritivo, e registre isso em "avisos".',
    '- Quando houver valores por norma ou por país (ex.: 220 V e 230 V), prefira o aplicável ao Brasil (rede 127/220 V ou 220/380 V) e registre a escolha em "avisos".',
    '- "tipoEquipamento" é o tipo que o documento descreve, mesmo que seja diferente do tipo pedido.',
    '- "avisos": frases curtas em português do Brasil sobre valores ambíguos, convertidos ou escolhidos entre opções; texto vazio se não houver.'
  ].join('\n');

  const IA = {};

  IA.MODELOS = MODELOS;
  IA.NOMES_TIPO = NOMES_TIPO;

  /** Configuração local da leitura por IA: {chave, modelo}. */
  IA.config = function () {
    let c = {};
    try { c = JSON.parse(localStorage.getItem(CHAVE_LOCAL) || '{}') || {}; } catch (e) { c = {}; }
    if (!MODELOS.some(function (m) { return m.id === c.modelo; })) c.modelo = MODELOS[0].id;
    c.chave = String(c.chave || '').trim();
    return c;
  };

  IA.salvarConfig = function (c) {
    try { localStorage.setItem(CHAVE_LOCAL, JSON.stringify({ chave: String(c.chave || '').trim(), modelo: c.modelo })); } catch (e) {
      throw new Error('Não foi possível salvar a configuração neste navegador.');
    }
  };

  IA.configurada = function () { return !!IA.config().chave; };

  /** Nome de exibição do modelo (ex.: "Claude Opus 5.5"). */
  IA.nomeModelo = function (id) {
    if (id === 'local') return 'leitura no navegador';
    const m = MODELOS.find(function (x) { return x.id === id; });
    return m ? m.nome.split(' — ')[0] : ((FALLBACK[id] || {}).nome || id || '');
  };

  let sdkCarregando = null;
  function sdk() {
    if (!sdkCarregando) {
      sdkCarregando = import(SDK_URL).catch(function () {
        sdkCarregando = null;
        throw new Error('Não foi possível carregar a biblioteca da API da Anthropic (verifique a internet).');
      });
    }
    return sdkCarregando;
  }

  async function cliente(cfg) {
    const mod = await sdk();
    const Anthropic = mod.default || mod.Anthropic;
    // chamada direta do navegador: a chave é do próprio usuário e fica só neste computador
    return { Anthropic: Anthropic, client: new Anthropic({ apiKey: cfg.chave, dangerouslyAllowBrowser: true, maxRetries: 2 }) };
  }

  /** Mensagem em português para os erros do SDK (do mais específico para o mais genérico). */
  function traduzirErro(e, Anthropic) {
    if (!Anthropic || !e) return e;
    if (e instanceof Anthropic.APIUserAbortError) return new Error('Leitura cancelada.');
    if (e instanceof Anthropic.AuthenticationError) return new Error('Chave de API inválida. Confira em Configurações › Leitura de datasheet (IA).');
    if (e instanceof Anthropic.PermissionDeniedError) return new Error('A chave de API não tem permissão para usar este modelo.');
    if (e instanceof Anthropic.NotFoundError) return new Error('Modelo não encontrado para esta chave de API.');
    if (e instanceof Anthropic.RateLimitError) return new Error('Limite de uso da API atingido. Aguarde um minuto e tente novamente.');
    if (e instanceof Anthropic.BadRequestError) return new Error('A API recusou o pedido: ' + (e.error && e.error.error && e.error.error.message || e.message));
    if (e instanceof Anthropic.InternalServerError) return new Error('Serviço da Anthropic indisponível ou sobrecarregado. Tente novamente em instantes.');
    if (e instanceof Anthropic.APIConnectionError) return new Error('Sem conexão com a API da Anthropic (verifique a internet).');
    if (e instanceof Anthropic.APIError) return new Error('Erro da API da Anthropic: ' + e.message);
    return e;
  }

  /** Confere a chave e o modelo sem gastar tokens (consulta o cadastro do modelo). */
  IA.testar = async function (cfgTeste) {
    const cfg = Object.assign(IA.config(), cfgTeste || {});
    if (!cfg.chave) throw new Error('Informe a chave de API.');
    const c = await cliente(cfg);
    try {
      const m = await c.client.models.retrieve(cfg.modelo);
      return m.display_name || m.id;
    } catch (e) { throw traduzirErro(e, c.Anthropic); }
  };

  function base64(file) {
    return new Promise(function (ok, falha) {
      const r = new FileReader();
      r.onload = function () { ok(String(r.result).split(',')[1] || ''); };
      r.onerror = function () { falha(new Error('Não foi possível ler o arquivo.')); };
      r.readAsDataURL(file);
    });
  }

  /** Bloco de conteúdo do arquivo (PDF ou imagem), com os limites de tamanho da API. */
  IA.blocoArquivo = async function (file) {
    const pdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
    if (pdf) {
      if (file.size > LIMITE_PDF) throw new Error('PDF com mais de 20 MB. Envie só as páginas da ficha técnica.');
      return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: await base64(file) } };
    }
    if (IMAGENS.indexOf(file.type) >= 0) {
      if (file.size > LIMITE_IMAGEM) throw new Error('Imagem com mais de 5 MB. Reduza a resolução ou envie o PDF.');
      return { type: 'image', source: { type: 'base64', media_type: file.type, data: await base64(file) } };
    }
    throw new Error('Envie o datasheet em PDF ou imagem (JPG, PNG ou WebP).');
  };

  const PRECO_PESQUISA = 0.01; // US$ por pesquisa na web (US$ 10 por 1.000)

  function custoEstimado(msg) {
    const u = msg.usage || {};
    const p = MODELOS.find(function (m) { return m.id === msg.model; }) || FALLBACK[msg.model];
    if (!p) return null;
    const entrada = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
    const pesquisas = (u.server_tool_use && u.server_tool_use.web_search_requests) || 0;
    return (entrada * p.entrada + (u.output_tokens || 0) * p.saida) / 1e6 + pesquisas * PRECO_PESQUISA;
  }

  function comFallback(params, cfg) {
    if (COM_FALLBACK[cfg.modelo]) { params.betas = [BETA_FALLBACK]; params.fallbacks = 'default'; }
    return params;
  }

  /** Envia o pedido em streaming (cancelável pelo sinal) e devolve a mensagem final; erros traduzidos guardam o original. */
  async function enviar(c, params, o) {
    try {
      const stream = c.client.beta.messages.stream(params);
      if (o.sinal) {
        if (o.sinal.aborted) stream.abort();
        else o.sinal.addEventListener('abort', function () { stream.abort(); });
      }
      if (o.aoProgredir) stream.on('text', function (delta, total) { o.aoProgredir(total.length); });
      return await stream.finalMessage();
    } catch (e) {
      const t = traduzirErro(e, c.Anthropic);
      if (t !== e) t.original = e;
      throw t;
    }
  }

  // com fallback no meio da resposta, o texto continua no bloco seguinte: junta todos os blocos de texto
  function textoDe(msg) {
    return msg.content.filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('');
  }

  function preparar(tipo) {
    if (!App.Datasheet.CAMPOS[tipo]) throw new Error('Tipo de equipamento sem leitura de datasheet.');
    const cfg = IA.config();
    if (!cfg.chave) throw new Error('Configure a chave de API em Configurações › Leitura de datasheet (IA).');
    return cfg;
  }

  /** Extração estruturada dos campos do cadastro a partir do conteúdo do datasheet (PDF, imagem ou texto transcrito). */
  async function extrair(c, cfg, conteudo, o) {
    const tipo = o.tipo;
    const pedido = 'Extraia os dados técnicos deste datasheet para o cadastro de ' + NOMES_TIPO[tipo] + '.' +
      (o.modeloInteresse ? ' Interessa principalmente o modelo "' + o.modeloInteresse + '", mas inclua todos os modelos da tabela.' : '');
    const params = comFallback({
      model: cfg.modelo,
      max_tokens: 64000,
      system: SISTEMA,
      output_config: { effort: 'high', format: { type: 'json_schema', schema: App.Datasheet.esquema(tipo) } },
      messages: [{ role: 'user', content: conteudo.concat([{ type: 'text', text: pedido }]) }]
    }, cfg);
    const msg = await enviar(c, params, o);
    if (msg.stop_reason === 'refusal') throw new Error('O modelo recusou a leitura deste documento (filtro de segurança). Tente outro arquivo ou outro modelo.');
    if (msg.stop_reason === 'max_tokens') throw new Error('Resposta incompleta: o documento é extenso demais. Envie só as páginas da ficha técnica.');
    let dados;
    try { dados = JSON.parse(textoDe(msg)); } catch (e) { throw new Error('Resposta da IA em formato inesperado. Tente novamente.'); }
    if (!dados || !Array.isArray(dados.modelos)) throw new Error('Resposta da IA em formato inesperado. Tente novamente.');
    return {
      tipoDetectado: dados.tipoEquipamento,
      modelos: dados.modelos.map(function (m) { return App.Datasheet.converter(tipo, m); })
        .filter(function (m) { return m.fabricante || m.modelo; }),
      avisos: String(dados.avisos || '').trim(),
      modeloIA: msg.model,
      fallback: (msg.usage && msg.usage.iterations || []).some(function (it) { return it.type === 'fallback_message'; }),
      custoUSD: custoEstimado(msg)
    };
  }

  /**
   * Lê o datasheet enviado e devolve {tipoDetectado, modelos[] (campos do cadastro), avisos, modeloIA, fallback, custoUSD}.
   * opcoes: {tipo, modeloInteresse, aoProgredir(caracteres), sinal (AbortSignal)}.
   */
  IA.lerDatasheet = async function (file, opcoes) {
    const o = opcoes || {};
    const cfg = preparar(o.tipo);
    const arquivo = await IA.blocoArquivo(file);
    const c = await cliente(cfg);
    return extrair(c, cfg, [arquivo], o);
  };

  const SISTEMA_PESQUISA = [
    'Você localiza datasheets oficiais de equipamentos fotovoltaicos na internet para um sistema de dimensionamento de projetos solares no Brasil.',
    '- Procure a ficha técnica (datasheet) do modelo pedido, de preferência o PDF no site do fabricante; na falta dele, o de um distribuidor confiável.',
    '- Abra o documento com a ferramenta de leitura e confira se ele cobre exatamente o modelo pedido (mesma potência e variante). Se a versão do datasheet importar (ex.: G3, V2), prefira a mais recente.',
    '- Depois de abrir o datasheet, transcreva todos os dados técnicos da tabela, com valores e unidades como impressos, para o modelo pedido e os demais modelos da mesma tabela.',
    'Estruture a resposta assim:',
    'PDF: <link direto do arquivo PDF do datasheet, ou "nenhum">',
    'PAGINA: <link da página em que o datasheet foi encontrado, ou "nenhuma">',
    'DADOS:',
    '<transcrição dos dados técnicos>',
    'Se não encontrar um datasheet confiável do modelo, responda "PDF: nenhum" e explique em uma frase, sem inventar dados.'
  ].join('\n');

  // pesquisa e leitura na web com filtragem dinâmica (Opus 5.5 e Sonnet 5.5); o Haiku usa as versões básicas
  const FERRAMENTAS_WEB = {
    dinamicas: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 6 }, { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 4 }],
    basicas: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 6 }, { type: 'web_fetch_20250910', name: 'web_fetch', max_uses: 4 }]
  };

  /** Link da linha "RÓTULO: ..." da resposta da pesquisa. */
  function linkDe(texto, rotulo) {
    const rx = new RegExp('^[\\s*_#>-]*' + rotulo + '[\\s*_]*:', 'i');
    const linha = texto.split('\n').find(function (l) { return rx.test(l); });
    const m = linha && linha.match(/https?:\/\/[^\s<>()\[\]"']+/);
    return m ? m[0].replace(/[.,;:]+$/, '') : null;
  }

  /** Conteúdo do turno pausado para reenvio: antes de um fallback, sem blocos internos do modelo que recusou. */
  function paraReenvio(conteudo) {
    let ultimo = -1;
    conteudo.forEach(function (b, i) { if (b.type === 'fallback') ultimo = i; });
    if (ultimo < 0) return conteudo;
    const comResultado = {};
    conteudo.forEach(function (b) { if (b.tool_use_id) comResultado[b.tool_use_id] = true; });
    return conteudo.filter(function (b, i) {
      if (i >= ultimo) return true;
      if (['thinking', 'redacted_thinking', 'tool_use'].indexOf(b.type) >= 0) return false;
      return !(b.type === 'server_tool_use' && !comResultado[b.id]);
    });
  }

  /**
   * Pesquisa o datasheet do modelo na internet e lê os dados técnicos: primeiro o PDF original (pelo link encontrado);
   * se ele não puder ser baixado, a transcrição feita na pesquisa. Devolve o mesmo resultado de lerDatasheet + fonte {pdf, pagina, viaPdf}.
   * opcoes: {tipo, fabricante, modelo, aoEtapa(texto), aoProgredir, sinal}.
   */
  IA.pesquisarDatasheet = async function (opcoes) {
    const o = opcoes || {};
    const cfg = preparar(o.tipo);
    const nome = [o.fabricante, o.modelo].map(function (x) { return String(x || '').trim(); }).filter(Boolean).join(' ');
    if (!String(o.modelo || '').trim()) throw new Error('Informe o modelo do equipamento.');
    const c = await cliente(cfg);
    const inicial = { role: 'user', content: 'Encontre o datasheet do ' + NOMES_TIPO[o.tipo] + ' "' + nome + '".' };
    const params = comFallback({
      model: cfg.modelo,
      max_tokens: 32000,
      system: SISTEMA_PESQUISA,
      output_config: { effort: 'medium' },
      tools: cfg.modelo === 'claude-haiku-5-5' ? FERRAMENTAS_WEB.basicas : FERRAMENTAS_WEB.dinamicas,
      messages: [inicial]
    }, cfg);
    if (o.aoEtapa) o.aoEtapa('Pesquisando o datasheet na internet…');
    let msg, custo = 0;
    // turnos longos de pesquisa podem voltar pausados (pause_turn): reenvia o turno para o servidor continuar
    for (let i = 0; i < 4; i++) {
      msg = await enviar(c, params, o);
      custo += custoEstimado(msg) || 0;
      if (msg.stop_reason !== 'pause_turn') break;
      params.messages = [inicial, { role: 'assistant', content: paraReenvio(msg.content) }];
    }
    if (msg.stop_reason === 'refusal') throw new Error('O modelo recusou a pesquisa (filtro de segurança). Envie o PDF pelo botão "Ler datasheet".');
    if (msg.stop_reason === 'pause_turn') throw new Error('A pesquisa demorou demais e foi interrompida. Tente de novo ou envie o PDF pelo botão "Ler datasheet".');
    const texto = textoDe(msg);
    const pdf = linkDe(texto, 'PDF'), pagina = linkDe(texto, 'PAGINA');
    const transcricao = (texto.split(/^[\s*_#>-]*DADOS[\s*_]*:/im)[1] || '').trim();
    if (!pdf && transcricao.length < 40) {
      throw new Error('Datasheet de "' + nome + '" não encontrado na internet. Confira o modelo ou envie o PDF pelo botão "Ler datasheet".');
    }
    const oLeitura = Object.assign({}, o, { modeloInteresse: o.modelo });
    if (o.aoEtapa) o.aoEtapa('Lendo o datasheet encontrado…');
    let res = null;
    if (pdf) {
      try {
        res = await extrair(c, cfg, [{ type: 'document', source: { type: 'url', url: pdf } }], oLeitura);
      } catch (e) {
        // PDF inacessível para a API (bloqueio do site, link de página): segue com a transcrição, se houver
        if (!(e.original instanceof c.Anthropic.BadRequestError) || transcricao.length < 40) throw e;
      }
    }
    const viaPdf = !!res;
    if (!res) {
      res = await extrair(c, cfg, [{ type: 'text', text: 'Dados técnicos transcritos do datasheet' + (pagina || pdf ? ' (fonte: ' + (pdf || pagina) + ')' : '') + ':\n\n' + transcricao }], oLeitura);
    }
    res.custoUSD = (res.custoUSD || 0) + custo;
    res.fonte = { pdf: pdf, pagina: pagina, viaPdf: viaPdf };
    return res;
  };

  App.IA = IA;
})(window.App);
