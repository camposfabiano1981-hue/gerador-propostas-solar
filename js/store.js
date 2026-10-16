/* Camada de dados: persiste cadastros, configurações e propostas no localStorage do navegador. */
window.App = window.App || {};

(function (App) {
  'use strict';

  const U = App.U;
  const D = App.DEFAULTS;
  const PREFIX = 'gsp.';
  const VERSAO = 1;
  const COLECOES = ['clientes', 'equipamentos', 'concessionarias', 'localidades', 'pagamentos', 'propostas'];

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
  };

  Store.semear = function () {
    gravar('config', { empresa: U.clone(D.empresa), premissas: U.clone(D.premissas), textos: U.clone(D.textos), seq: {} });
    gravar('col.clientes', []);
    gravar('col.equipamentos', U.clone(D.equipamentos));
    gravar('col.concessionarias', U.clone(D.concessionarias));
    gravar('col.localidades', U.clone(D.localidades));
    gravar('col.pagamentos', U.clone(D.pagamentos));
    gravar('col.propostas', []);
    gravar('v', VERSAO);
  };

  Store.config = function () {
    const c = ler('config', {}) || {};
    c.empresa = completar(c.empresa, D.empresa);
    c.premissas = completar(c.premissas, D.premissas);
    c.textos = completar(c.textos, D.textos);
    c.seq = c.seq || {};
    return c;
  };

  Store.salvarConfig = function (parte, valor) {
    const c = Store.config();
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

  /** Gera o próximo número de proposta no formato PREFIXO-AAAAMMDD-NNN. */
  Store.proximoNumero = function (dataISO) {
    const c = Store.config();
    const dia = String(dataISO || U.todayISO()).replace(/-/g, '').slice(0, 8);
    const usados = Store.list('propostas')
      .map(function (p) { return p.numero || ''; })
      .filter(function (n) { return n.indexOf('-' + dia + '-') >= 0; })
      .map(function (n) { return parseInt(n.split('-').pop(), 10) || 0; });
    const seq = Math.max(c.seq[dia] || 0, usados.length ? Math.max.apply(null, usados) : 0) + 1;
    return { numero: (c.empresa.prefixo || 'PR') + '-' + dia + '-' + String(seq).padStart(3, '0'), dia: dia, seq: seq };
  };

  Store.reservarNumero = function (dia, seq) {
    const c = Store.config();
    c.seq[dia] = Math.max(c.seq[dia] || 0, seq);
    gravar('config', c);
  };

  Store.exportar = function () {
    const out = { app: 'gerador-propostas-solar', versao: VERSAO, exportadoEm: new Date().toISOString(), config: Store.config(), colecoes: {} };
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
    gravar('v', VERSAO);
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
