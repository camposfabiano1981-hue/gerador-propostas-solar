/* Camada de dados: persiste cadastros, configurações e propostas no localStorage do navegador. */
window.App = window.App || {};

(function (App) {
  'use strict';

  const U = App.U;
  const D = App.DEFAULTS;
  const PREFIX = 'gsp.';
  const VERSAO = 3;
  const COLECOES = ['clientes', 'equipamentos', 'concessionarias', 'localidades', 'pagamentos', 'propostas', 'servicos', 'avulsas', 'contratos'];

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
    gravar('v', VERSAO);
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
    gravar('v', VERSAO);
  };

  /**
   * Premissas gravadas antes da troca do FDI (P inversor ÷ P FV) pelo FDG (P FV ÷ P inversor):
   * a faixa padrão antiga passa a usar a nova; uma faixa personalizada é convertida (valores invertidos).
   */
  Store.ajustarPremissas = function (prem) {
    if (!prem || prem.fdiMin === undefined) return prem;
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
    gravar('config', c);
  };

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
    return obj;
  };

  Store.remove = function (col, id) {
    gravar('col.' + col, Store.list(col).filter(function (x) { return x.id !== id; }));
  };

  /**
   * Próximo número no formato PREFIXO-AAAAMMDD-NNN.
   * tipo 'proposta' (propostas solares e avulsas compartilham a sequência) ou 'contrato'.
   */
  Store.proximoNumero = function (dataISO, tipo) {
    const c = Store.config();
    const contrato = tipo === 'contrato';
    const dia = String(dataISO || U.todayISO()).replace(/-/g, '').slice(0, 8);
    const chave = contrato ? 'CT:' + dia : dia;
    const cols = contrato ? ['contratos'] : ['propostas', 'avulsas'];
    const usados = [];
    cols.forEach(function (col) {
      Store.list(col).forEach(function (p) {
        const n = p.numero || '';
        if (n.indexOf('-' + dia + '-') >= 0) usados.push(parseInt(n.split('-').pop(), 10) || 0);
      });
    });
    const seq = Math.max(c.seq[chave] || 0, usados.length ? Math.max.apply(null, usados) : 0) + 1;
    const prefixo = contrato ? (c.empresa.prefixoContrato || 'CT') : (c.empresa.prefixo || 'PR');
    return { numero: prefixo + '-' + dia + '-' + String(seq).padStart(3, '0'), dia: dia, seq: seq, chave: chave };
  };

  Store.reservarNumero = function (dia, seq, chave) {
    const c = configBruta();
    const k = chave || dia;
    c.seq[k] = Math.max(c.seq[k] || 0, seq);
    gravar('config', c);
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
  };

  Store.restaurarPadroes = function () {
    Store.semear();
  };

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
