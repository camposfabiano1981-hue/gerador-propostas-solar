/* Camada de dados: persiste cadastros, configurações e propostas no localStorage do navegador. */
window.App = window.App || {};

(function (App) {
  'use strict';

  const U = App.U;
  const D = App.DEFAULTS;
  const PREFIX = 'gsp.';
  const VERSAO = 11;
  // equipamentos cadastrados a partir do datasheet (sem catálogo de fábrica desde a versão 7)
  const TIPOS_DATASHEET = ['modulo', 'inversor', 'micro', 'hibrido', 'bateria'];
  const COLECOES = ['clientes', 'equipamentos', 'concessionarias', 'localidades', 'pagamentos', 'propostas', 'servicos', 'avulsas', 'contratos', 'projetos', 'instalacoes', 'ordens', 'compras'];

  const mem = {}; // fallback quando o localStorage não estiver disponível

  function ler(chave, def) {
    try {
      const v = localStorage.getItem(PREFIX + chave);
      return v == null ? def : JSON.parse(v);
    } catch (e) {
      return mem[chave] !== undefined ? U.clone(mem[chave]) : def;
    }
  }

  function gravar(chave, valor) {
    mem[chave] = U.clone(valor);
    try {
      localStorage.setItem(PREFIX + chave, JSON.stringify(valor));
    } catch (e) {
      if (e && /quota/i.test(e.name + e.message)) {
        throw new Error('Espaço de armazenamento do navegador esgotado. Faça um backup e exclua propostas antigas.');
      }
    }
  }

  /** Mescla profunda: completa `alvo` com chaves ausentes de `base` (não sobrescreve valores existentes). */
  function completar(alvo, base) {
    if (alvo == null) return U.clone(base);
    if (typeof base !== 'object' || base == null || Array.isArray(base)) return alvo;
    Object.keys(base).forEach(function (k) {
      if (alvo[k] === undefined) alvo[k] = U.clone(base[k]);
      else if (typeof base[k] === 'object' && base[k] && !Array.isArray(base[k])) alvo[k] = completar(alvo[k], base[k]);
    });
    return alvo;
  }

  const Store = {};

  /*
   * Ganchos da sincronização com a nuvem (App.Nuvem): chamados após cada alteração feita neste aparelho.
   * aoSalvar(col, obj), aoRemover(col, id, ts), aoSalvarConfig(config), aoSubstituirTudo().
   */
  Store.ganchos = {};
  function avisar(nome) {
    const fn = Store.ganchos[nome];
    if (!fn) return;
    try { fn.apply(null, Array.prototype.slice.call(arguments, 1)); } catch (e) { console.error(e); }
  }

  /** Exclusões feitas neste aparelho (coleção → id → data), para não trazer de volta da nuvem o que foi excluído. */
  Store.excluidos = function (col) { return (ler('sync.excluidos', {}) || {})[col] || {}; };
  function marcarExcluido(col, id, ts) {
    const ex = ler('sync.excluidos', {}) || {};
    ex[col] = ex[col] || {};
    if (ts) ex[col][id] = ts; else delete ex[col][id];
    gravar('sync.excluidos', ex);
  }

  Store.init = function () {
    const v = ler('v', null);
    if (v == null) Store.semear();
    else if (v < VERSAO) Store.migrar(v);
  };

  /** Atualiza bases criadas por versões anteriores sem perder dados. */
  Store.migrar = function (v) {
    if (v < 2) {
      if (ler('col.servicos', null) == null) gravar('col.servicos', U.clone(D.servicos));
      if (ler('col.avulsas', null) == null) gravar('col.avulsas', []);
      if (ler('col.contratos', null) == null) gravar('col.contratos', []);
      const eqs = Store.list('equipamentos');
      if (!eqs.some(function (e) { return e.tipo === 'bess'; })) {
        D.equipamentos.filter(function (e) { return e.tipo === 'bess'; }).forEach(function (e) { eqs.push(U.clone(e)); });
        gravar('col.equipamentos', eqs);
      }
    }
    if (v < 3) {
      // catálogo ampliado: acrescenta os itens novos (por id) sem alterar os já cadastrados/editados
      const eqs = Store.list('equipamentos');
      const ids = {};
      eqs.forEach(function (e) { ids[e.id] = true; });
      D.equipamentos.forEach(function (e) { if (!ids[e.id]) eqs.push(U.clone(e)); });
      // cabos CC e MC4 do catálogo original deixam de entrar em propostas com microinversores
      eqs.forEach(function (e) {
        if (['mat-cabo-vm', 'mat-cabo-pt', 'mat-mc4'].indexOf(e.id) >= 0 && (!e.aplicaEm || e.aplicaEm === 'ambos')) e.aplicaEm = 'string';
      });
      gravar('col.equipamentos', eqs);
    }
    if (v < 4) {
      // baterias de alta tensão: capacidade máxima por inversor (módulos por torre × torres)
      const eqs = Store.list('equipamentos');
      eqs.forEach(function (e) { if (D.CAP_MAX_SISTEMA[e.id] && e.capMaxSistema === undefined) e.capMaxSistema = D.CAP_MAX_SISTEMA[e.id]; });
      gravar('col.equipamentos', eqs);
    }
    if (v < 5) {
      // baterias do catálogo: potência contínua de descarga confirmada no datasheet
      const eqs = Store.list('equipamentos');
      eqs.forEach(function (e) { if (D.POT_BATERIA[e.id] && !(U.num(e.potencia) > 0)) e.potencia = D.POT_BATERIA[e.id]; });
      gravar('col.equipamentos', eqs);
    }
    if (v < 6) {
      // portfólio de projetos realizados (seção da proposta após a apresentação da empresa)
      if (ler('col.projetos', null) == null) gravar('col.projetos', []);
    }
    if (v < 7) zerarCatalogoDatasheet();
    if (v < 8) separarMateriaisAvulsas();
    // gestão das instalações (obras das propostas aprovadas)
    if (v < 9 && ler('col.instalacoes', null) == null) gravar('col.instalacoes', []);
    // ordens de serviço das instalações
    if (v < 10 && ler('col.ordens', null) == null) gravar('col.ordens', []);
    // pedidos de compra (orçamentos dos fornecedores e custo dos materiais)
    if (v < 11 && ler('col.compras', null) == null) gravar('col.compras', []);
    gravar('v', VERSAO);
  };

  /**
   * Versão 8: cada material indica onde é usado (proposta solar, propostas avulsas ou as duas). Os criados pelo usuário e já
   * usados em propostas avulsas entravam sozinhos na lista de materiais das propostas solares: passam a ser só das avulsas.
   * Sem alterar a data de gravação: os aparelhos que receberem a versão antiga pela nuvem chegam ao mesmo resultado (App.Calc.usoMaterial).
   */
  function separarMateriaisAvulsas() {
    const C = App.Calc;
    if (!C || !C.usoMaterial) return;
    const ctx = { avulsas: Store.list('avulsas') };
    const eqs = Store.list('equipamentos');
    eqs.forEach(function (e) {
      if (e.tipo !== 'material' || e.uso) return;
      e.uso = C.usoMaterial(e, ctx);
      if (e.uso === 'avulsa') e.autoIncluir = false;
    });
    gravar('col.equipamentos', eqs);
  }

  /**
   * Versão 7: módulos, inversores, microinversores, híbridos e baterias passam a ser cadastrados pelo datasheet. Os que não estão em
   * nenhuma proposta são removidos (cópia em gsp.removidos.v7, restaurável); os usados ficam inativos para a proposta continuar
   * igual. Propostas com escolha automática recebem o equipamento que o cálculo já usava, para não mudarem de resultado.
   */
  function zerarCatalogoDatasheet() {
    const eqs = Store.list('equipamentos');
    const propostas = Store.list('propostas');
    const C = App.Calc;
    if (C && propostas.length) {
      let ctx = null;
      try { ctx = C.contexto(); } catch (e) { ctx = null; }
      propostas.forEach(function (p) {
        if (!ctx || (p.inversorId && p.bateriaId && p.moduloId)) return;
        try {
          const r = C.calcular(U.clone(p), ctx);
          const inv = r.inversor, bat = r.hibrido && r.hibrido.bateria;
          if (!p.inversorId && inv && TIPOS_DATASHEET.indexOf(inv.tipo) >= 0) {
            p.inversorId = inv.id;
            // com o inversor fixado a quantidade automática pode mudar; mantém a do cálculo original
            if (!(U.num(p.nInversores) > 0) && C.calcular(U.clone(p), ctx).nInversores !== r.nInversores) p.nInversores = r.nInversores;
          }
          if (!p.bateriaId && bat && bat.tipo === 'bateria') p.bateriaId = bat.id;
          if (!p.moduloId && r.modulo) p.moduloId = r.modulo.id;
        } catch (e) { /* proposta incompleta: segue sem fixar */ }
      });
      gravar('col.propostas', propostas);
    }
    const usados = {};
    propostas.forEach(function (p) {
      [p.moduloId, p.inversorId, p.bateriaId].concat((p.itens || []).map(function (i) { return i.equipamentoId; })).forEach(function (id) { if (id) usados[id] = true; });
    });
    const manter = [], removidos = [];
    eqs.forEach(function (e) {
      if (TIPOS_DATASHEET.indexOf(e.tipo) < 0) { manter.push(e); return; }
      if (usados[e.id]) {
        e.ativo = false;
        e.arquivado = true;
        manter.push(e);
      } else removidos.push(e);
    });
    if (removidos.length) gravar('removidos.v7', removidos);
    gravar('col.equipamentos', manter);
  }

  /** Equipamentos removidos na versão 7 (cópia de segurança). */
  Store.removidosV7 = function () { return ler('removidos.v7', []) || []; };

  /** Devolve ao cadastro os equipamentos removidos na versão 7 (inativos, para revisão com o datasheet). */
  Store.restaurarRemovidosV7 = function () {
    const lista = Store.removidosV7();
    const eqs = Store.list('equipamentos');
    const ids = {};
    eqs.forEach(function (e) { ids[e.id] = true; });
    let n = 0;
    lista.forEach(function (e) { if (!ids[e.id]) { e.ativo = false; Store.save('equipamentos', e); n++; } });
    Store.descartarRemovidosV7();
    return n;
  };

  Store.descartarRemovidosV7 = function () {
    delete mem['removidos.v7'];
    try { localStorage.removeItem(PREFIX + 'removidos.v7'); } catch (e) { /* indisponível */ }
  };

  Store.semear = function () {
    gravar('config', { empresa: U.clone(D.empresa), premissas: U.clone(D.premissas), textos: U.clone(D.textos), seq: {} });
    gravar('col.clientes', []);
    gravar('col.equipamentos', U.clone(D.equipamentos));
    gravar('col.concessionarias', U.clone(D.concessionarias));
    gravar('col.localidades', U.clone(D.localidades));
    gravar('col.pagamentos', U.clone(D.pagamentos));
    gravar('col.propostas', []);
    gravar('col.servicos', U.clone(D.servicos));
    gravar('col.avulsas', []);
    gravar('col.contratos', []);
    gravar('col.projetos', []);
    gravar('col.instalacoes', []);
    gravar('col.ordens', []);
    gravar('col.compras', []);
    gravar('v', VERSAO);
  };

  /**
   * Premissas gravadas por versões anteriores: a eficiência de ciclo padrão do híbrido passa de 90% para 92%;
   * a faixa do FDI (P inversor ÷ P FV) vira FDG (P FV ÷ P inversor) — a padrão antiga usa a nova e uma personalizada é invertida.
   */
  Store.ajustarPremissas = function (prem) {
    if (!prem) return prem;
    // híbrido: premissas anteriores ao consumo próprio do inversor usavam 90% de eficiência de ciclo como padrão
    if (prem.hibrido && prem.hibrido.consumoProprioW === undefined && prem.hibrido.eficiencia === 0.9) prem.hibrido.eficiencia = D.premissas.hibrido.eficiencia;
    if (prem.fdiMin === undefined) return prem;
    const padraoAntigo = prem.fdiMin === 0.75 && prem.fdiMax === 1.2 && prem.fdiAlvo === 0.9;
    const inverso = function (x) { const n = U.num(x); return n > 0 ? U.round(1 / n, 2) : undefined; };
    if (prem.fdgMin === undefined && !padraoAntigo) {
      prem.fdgMin = inverso(prem.fdiMax);
      prem.fdgMax = inverso(prem.fdiMin);
      prem.fdgAlvo = inverso(prem.fdiAlvo);
    }
    delete prem.fdiMin; delete prem.fdiMax; delete prem.fdiAlvo;
    return prem;
  };

  /** Textos personalizados com o marcador antigo {fdi} passam a exibir o FDG. */
  function ajustarTextos(tx) {
    if (tx && Array.isArray(tx.conformidade)) {
      tx.conformidade.forEach(function (c) {
        if (c && typeof c.descricao === 'string') c.descricao = c.descricao.replace(/FDI \{fdi\}/g, 'FDG {fdg}').replace(/\{fdiIcone\}/g, '{fdgIcone}');
      });
    }
    return tx;
  }

  Store.config = function () {
    const c = ler('config', {}) || {};
    c.empresa = completar(c.empresa, D.empresa);
    c.premissas = completar(Store.ajustarPremissas(c.premissas), D.premissas);
    c.textos = completar(ajustarTextos(c.textos), D.textos);
    c.contrato = completar(c.contrato, D.contrato);
    c.seq = c.seq || {};
    return c;
  };

  /** Configuração como gravada (sem completar com os padrões), para que padrões nunca editados continuem acompanhando as novas versões. */
  function configBruta() {
    const c = ler('config', {}) || {};
    c.seq = c.seq || {};
    return c;
  }

  Store.salvarConfig = function (parte, valor) {
    const c = configBruta();
    c[parte] = valor;
    c.atualizadoEm = new Date().toISOString();
    gravar('config', c);
    avisar('aoSalvarConfig', c);
  };

  Store.configBruta = configBruta;

  Store.list = function (col) {
    return ler('col.' + col, []) || [];
  };

  Store.get = function (col, id) {
    return Store.list(col).find(function (x) { return x.id === id; }) || null;
  };

  Store.save = function (col, obj) {
    const lista = Store.list(col);
    if (!obj.id) obj.id = U.uid();
    obj.atualizadoEm = new Date().toISOString();
    if (!obj.criadoEm) obj.criadoEm = obj.atualizadoEm;
    const i = lista.findIndex(function (x) { return x.id === obj.id; });
    if (i >= 0) lista[i] = obj; else lista.push(obj);
    gravar('col.' + col, lista);
    if (Store.excluidos(col)[obj.id]) marcarExcluido(col, obj.id, null);
    avisar('aoSalvar', col, obj);
    return obj;
  };

  Store.remove = function (col, id) {
    gravar('col.' + col, Store.list(col).filter(function (x) { return x.id !== id; }));
    const ts = new Date().toISOString();
    marcarExcluido(col, id, ts);
    avisar('aoRemover', col, id, ts);
  };

  /* Alterações vindas da nuvem: gravadas como chegaram (sem nova data) e sem disparar os ganchos. */
  Store.aplicarRemoto = function (col, obj) {
    const lista = Store.list(col);
    const i = lista.findIndex(function (x) { return x.id === obj.id; });
    if (i >= 0) lista[i] = obj; else lista.push(obj);
    gravar('col.' + col, lista);
    if (Store.excluidos(col)[obj.id]) marcarExcluido(col, obj.id, null);
  };

  Store.excluirRemoto = function (col, id, ts) {
    gravar('col.' + col, Store.list(col).filter(function (x) { return x.id !== id; }));
    marcarExcluido(col, id, ts);
  };

  /** Devolve true quando este aparelho tinha numeração mais adiantada (a configuração mesclada deve voltar à nuvem). */
  Store.aplicarConfigRemota = function (c) {
    const local = configBruta();
    if (!c.seq) c.seq = {};
    // numeração: preserva o maior número já reservado em qualquer aparelho
    let adiantado = false;
    Object.keys(local.seq || {}).forEach(function (k) {
      if ((local.seq[k] || 0) > (c.seq[k] || 0)) { c.seq[k] = local.seq[k]; adiantado = true; }
    });
    if (adiantado) c.atualizadoEm = new Date().toISOString();
    gravar('config', c);
    return adiantado;
  };

  /**
   * Próximo número no formato PREFIXO-AAAAMMDD-NNN.
   * tipo 'proposta' (propostas solares e avulsas compartilham a sequência), 'contrato', 'os' (ordem de serviço) ou 'compra' (pedido de compra).
   */
  Store.proximoNumero = function (dataISO, tipo) {
    const c = Store.config();
    const contrato = tipo === 'contrato', os = tipo === 'os', compra = tipo === 'compra';
    const dia = String(dataISO || U.todayISO()).replace(/-/g, '').slice(0, 8);
    const chave = contrato ? 'CT:' + dia : (os ? 'OS:' + dia : (compra ? 'PC:' + dia : dia));
    const cols = contrato ? ['contratos'] : (os ? ['ordens'] : (compra ? ['compras'] : ['propostas', 'avulsas']));
    const usados = [];
    cols.forEach(function (col) {
      Store.list(col).forEach(function (p) {
        const n = p.numero || '';
        if (n.indexOf('-' + dia + '-') >= 0) usados.push(parseInt(n.split('-').pop(), 10) || 0);
      });
    });
    const seq = Math.max(c.seq[chave] || 0, usados.length ? Math.max.apply(null, usados) : 0) + 1;
    const prefixo = contrato ? (c.empresa.prefixoContrato || 'CT') : (os ? 'OS' : (compra ? 'PC' : (c.empresa.prefixo || 'PR')));
    return { numero: prefixo + '-' + dia + '-' + String(seq).padStart(3, '0'), dia: dia, seq: seq, chave: chave };
  };

  Store.reservarNumero = function (dia, seq, chave) {
    const c = configBruta();
    const k = chave || dia;
    c.seq[k] = Math.max(c.seq[k] || 0, seq);
    c.atualizadoEm = new Date().toISOString();
    gravar('config', c);
    avisar('aoSalvarConfig', c);
  };

  Store.exportar = function () {
    const out = { app: 'gerador-propostas-solar', versao: VERSAO, exportadoEm: new Date().toISOString(), config: configBruta(), colecoes: {} };
    COLECOES.forEach(function (c) { out.colecoes[c] = Store.list(c); });
    return out;
  };

  Store.importar = function (dados) {
    if (!dados || dados.app !== 'gerador-propostas-solar' || !dados.colecoes) {
      throw new Error('Arquivo de backup inválido.');
    }
    if (dados.config) gravar('config', dados.config);
    COLECOES.forEach(function (c) {
      if (Array.isArray(dados.colecoes[c])) gravar('col.' + c, dados.colecoes[c]);
    });
    // backup de versão anterior: aplica as mesmas atualizações de base
    const vb = parseInt(dados.versao, 10) || 1;
    if (vb < VERSAO) Store.migrar(vb);
    else gravar('v', VERSAO);
    carimbarTudo();
    avisar('aoSubstituirTudo');
  };

  Store.restaurarPadroes = function () {
    Store.semear();
    carimbarTudo();
    avisar('aoSubstituirTudo');
  };

  /** Importação e restauração substituem a base inteira: tudo passa a valer como a versão mais nova (inclusive na nuvem). */
  function carimbarTudo() {
    const ts = new Date().toISOString();
    COLECOES.forEach(function (col) {
      const lista = Store.list(col);
      lista.forEach(function (x) { x.atualizadoEm = ts; });
      gravar('col.' + col, lista);
    });
    const c = configBruta();
    c.atualizadoEm = ts;
    gravar('config', c);
    gravar('sync.excluidos', {});
  }

  Store.uso = function () {
    let total = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k.indexOf(PREFIX) === 0) total += (localStorage.getItem(k) || '').length * 2;
      }
    } catch (e) { /* indisponível */ }
    return total;
  };

  Store.COLECOES = COLECOES;
  App.Store = Store;
})(window.App);
