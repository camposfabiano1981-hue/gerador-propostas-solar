/*
 * Leitura de datasheets com a API do Claude (Anthropic): envia o PDF (ou a imagem) do datasheet e recebe os dados técnicos
 * no formato dos campos de cadastro (App.Datasheet), um item por modelo/coluna da ficha. A chave de API fica só neste
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
  const NOMES_TIPO = { inversor: 'inversor on-grid (string)', micro: 'microinversor', hibrido: 'inversor híbrido', bateria: 'bateria' };

  const SISTEMA = [
    'Você extrai dados técnicos de datasheets de equipamentos fotovoltaicos (inversores on-grid, microinversores, inversores híbridos e baterias) para um sistema de dimensionamento de projetos solares no Brasil. Os valores serão usados no cálculo de strings, de baterias e de backup, então a exatidão importa mais que a completude.',
    'Regras:',
    '- Use somente valores impressos no documento. Não estime, não complete com valores típicos e não deduza de outros modelos: o que não estiver no datasheet fica null.',
    '- Crie um item em "modelos" para cada modelo ou variante com coluna própria na tabela de dados técnicos, com o nome exato do modelo.',
    '- Converta para a unidade de cada campo (W → kW dividindo por 1000; Wh → kWh; mA → A). Percentuais como número (97,6% → 97.6).',
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

  function custoEstimado(msg) {
    const u = msg.usage || {};
    const p = MODELOS.find(function (m) { return m.id === msg.model; }) || FALLBACK[msg.model];
    if (!p) return null;
    const entrada = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
    return (entrada * p.entrada + (u.output_tokens || 0) * p.saida) / 1e6;
  }

  /**
   * Lê o datasheet e devolve {tipoDetectado, modelos[] (campos do cadastro), avisos, modeloIA, fallback, custoUSD}.
   * opcoes: {tipo, modeloInteresse, aoProgredir(caracteres), sinal (AbortSignal)}.
   */
  IA.lerDatasheet = async function (file, opcoes) {
    const o = opcoes || {};
    const tipo = o.tipo;
    if (!App.Datasheet.CAMPOS[tipo]) throw new Error('Tipo de equipamento sem leitura de datasheet.');
    const cfg = IA.config();
    if (!cfg.chave) throw new Error('Configure a chave de API em Configurações › Leitura de datasheet (IA).');
    const arquivo = await IA.blocoArquivo(file);
    const c = await cliente(cfg);
    const pedido = 'Extraia os dados técnicos deste datasheet para o cadastro de ' + NOMES_TIPO[tipo] + '.' +
      (o.modeloInteresse ? ' Interessa principalmente o modelo "' + o.modeloInteresse + '", mas inclua todos os modelos da tabela.' : '');
    const params = {
      model: cfg.modelo,
      max_tokens: 64000,
      system: SISTEMA,
      output_config: { effort: 'high', format: { type: 'json_schema', schema: App.Datasheet.esquema(tipo) } },
      messages: [{ role: 'user', content: [arquivo, { type: 'text', text: pedido }] }]
    };
    if (COM_FALLBACK[cfg.modelo]) { params.betas = [BETA_FALLBACK]; params.fallbacks = 'default'; }
    let msg;
    try {
      const stream = c.client.beta.messages.stream(params);
      if (o.sinal) {
        if (o.sinal.aborted) stream.abort();
        else o.sinal.addEventListener('abort', function () { stream.abort(); });
      }
      if (o.aoProgredir) stream.on('text', function (delta, total) { o.aoProgredir(total.length); });
      msg = await stream.finalMessage();
    } catch (e) { throw traduzirErro(e, c.Anthropic); }
    if (msg.stop_reason === 'refusal') throw new Error('O modelo recusou a leitura deste documento (filtro de segurança). Tente outro arquivo ou outro modelo.');
    if (msg.stop_reason === 'max_tokens') throw new Error('Resposta incompleta: o documento é extenso demais. Envie só as páginas da ficha técnica.');
    // com fallback no meio da resposta, o texto continua no bloco seguinte: junta todos os blocos de texto
    const texto = msg.content.filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('');
    let dados;
    try { dados = JSON.parse(texto); } catch (e) { throw new Error('Resposta da IA em formato inesperado. Tente novamente.'); }
    if (!dados || !Array.isArray(dados.modelos)) throw new Error('Resposta da IA em formato inesperado. Tente novamente.');
    const fallback = (msg.usage && msg.usage.iterations || []).some(function (it) { return it.type === 'fallback_message'; });
    return {
      tipoDetectado: dados.tipoEquipamento,
      modelos: dados.modelos.map(function (m) { return App.Datasheet.converter(tipo, m); })
        .filter(function (m) { return m.fabricante || m.modelo; }),
      avisos: String(dados.avisos || '').trim(),
      modeloIA: msg.model,
      fallback: fallback,
      custoUSD: custoEstimado(msg)
    };
  };

  App.IA = IA;
})(window.App);
