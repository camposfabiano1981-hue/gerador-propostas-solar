/* Utilitários gerais: formatação pt-BR, números, datas, DOM. */
window.App = window.App || {};

(function (App) {
  'use strict';

  const U = {};

  U.uid = function () {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  };

  U.clone = function (o) {
    return o == null ? o : JSON.parse(JSON.stringify(o));
  };

  U.round = function (v, d) {
    const f = Math.pow(10, d || 0);
    return Math.round((Number(v) + Number.EPSILON) * f) / f;
  };

  /** Converte "1.234,56", "1234.56", "1234,56" ou número em Number (NaN se vazio/inválido). */
  U.num = function (v) {
    if (typeof v === 'number') return v;
    if (v == null) return NaN;
    let s = String(v).trim().replace(/\s|R\$|%/g, '');
    if (!s) return NaN;
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    return Number(s);
  };

  U.numOr = function (v, def) {
    const n = U.num(v);
    return isFinite(n) ? n : def;
  };

  /** Formata número com casas decimais fixas no padrão brasileiro. */
  U.fmt = function (v, dec) {
    if (v == null || !isFinite(v)) return '—';
    let n = Number(v);
    if (Math.abs(n) < Math.pow(10, -(dec || 0)) / 2) n = 0; // evita "-0"
    return n.toLocaleString('pt-BR', {
      minimumFractionDigits: dec || 0,
      maximumFractionDigits: dec || 0
    });
  };

  U.brl = function (v) {
    if (v == null || !isFinite(v)) return 'R$ —';
    const s = U.fmt(Math.abs(v), 2);
    return (v < 0 ? 'R$ -' : 'R$ ') + s;
  };

  U.pct = function (v, dec) {
    return U.fmt(v * 100, dec == null ? 0 : dec) + '%';
  };

  /** Formata potência (kWp) com até 3 casas, mantendo zeros significativos como no modelo (5,625). */
  U.kwp = function (v) {
    if (!isFinite(v)) return '—';
    const r = U.round(v, 3);
    const dec = Math.abs(r * 100 - Math.round(r * 100)) > 1e-9 ? 3 : 2;
    return U.fmt(r, dec);
  };

  /** Número "enxuto": até `max` casas, sem zeros à direita. */
  U.fmtSmart = function (v, max) {
    if (v == null || !isFinite(v)) return '—';
    return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: max == null ? 2 : max });
  };

  U.anosMeses = function (anos) {
    if (anos == null || !isFinite(anos)) return 'Acima do horizonte de análise';
    let a = Math.floor(anos);
    let m = Math.round((anos - a) * 12);
    if (m === 12) { a += 1; m = 0; }
    const ta = a === 1 ? '1 ano' : a + ' anos';
    const tm = m === 1 ? '1 mês' : m + ' meses';
    if (a === 0) return tm;
    if (m === 0) return ta;
    return ta + ' e ' + tm;
  };

  U.todayISO = function () {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };

  U.dataBR = function (iso) {
    if (!iso) return '';
    const p = String(iso).slice(0, 10).split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : iso;
  };

  U.anoDe = function (iso) {
    const y = parseInt(String(iso || '').slice(0, 4), 10);
    return isFinite(y) ? y : new Date().getFullYear();
  };

  U.MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  U.MESES_NOMES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  /** "20 de maio de 2026" */
  U.dataExtenso = function (iso) {
    const p = String(iso || U.todayISO()).slice(0, 10).split('-');
    if (p.length !== 3) return String(iso || '');
    return parseInt(p[2], 10) + ' de ' + U.MESES_NOMES[parseInt(p[1], 10) - 1] + ' de ' + p[0];
  };

  /** Ordinal feminino abreviado: 1 → "1ª". */
  U.ordinal = function (n) { return n + 'ª'; };

  const UNIDADES = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze',
    'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

  function ate999(n) {
    if (n === 100) return 'cem';
    const c = Math.floor(n / 100), r = n % 100;
    const partes = [];
    if (c) partes.push(CENTENAS[c]);
    if (r) partes.push(r < 20 ? UNIDADES[r] : DEZENAS[Math.floor(r / 10)] + (r % 10 ? ' e ' + UNIDADES[r % 10] : ''));
    return partes.join(' e ');
  }

  /** Número inteiro por extenso (até a casa dos bilhões): 80 → "oitenta". */
  U.numeroExtenso = function (v) {
    let n = Math.floor(Math.abs(Number(v) || 0));
    if (n === 0) return 'zero';
    const escalas = [['', ''], ['mil', 'mil'], ['milhão', 'milhões'], ['bilhão', 'bilhões']];
    const grupos = [];
    while (n > 0) { grupos.push(n % 1000); n = Math.floor(n / 1000); }
    const partes = [];
    for (let i = grupos.length - 1; i >= 0; i--) {
      const g = grupos[i];
      if (!g) continue;
      let t = i === 1 && g === 1 ? '' : ate999(g);
      if (i > 0) t = (t ? t + ' ' : '') + escalas[i][g === 1 ? 0 : 1];
      partes.push({ t: t, g: g });
    }
    // conector "e" antes do último grupo quando ele é < 100 ou centena exata (ex.: "mil e cem", "dois mil e cinco")
    return partes.map(function (p, i) {
      if (i === 0) return p.t;
      const ult = i === partes.length - 1;
      return (ult && (p.g < 100 || p.g % 100 === 0) ? ' e ' : ', ') + p.t;
    }).join('');
  };

  /** Valor em reais por extenso, com inicial maiúscula: "Oitenta e seis mil, cento e dez reais e cinquenta e cinco centavos". */
  U.extenso = function (v) {
    const total = Math.round(Math.abs(Number(v) || 0) * 100);
    const reais = Math.floor(total / 100), cent = total % 100;
    const partes = [];
    if (reais) {
      const t = U.numeroExtenso(reais);
      const de = reais % 1000000 === 0 ? ' de' : '';
      partes.push(t + de + (reais === 1 ? ' real' : ' reais'));
    }
    if (cent) partes.push(U.numeroExtenso(cent) + (cent === 1 ? ' centavo' : ' centavos'));
    const s = partes.length ? partes.join(' e ') : 'zero reais';
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  U.UF_NOMES = {
    AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal',
    ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul',
    MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí',
    RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima',
    SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins'
  };
  U.UFS = Object.keys(U.UF_NOMES);

  U.esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  U.slug = function (s) {
    return String(s || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '').slice(0, 40) || 'Cliente';
  };

  U.debounce = function (fn, ms) {
    let t;
    return function () {
      const args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  };

  U.get = function (obj, path) {
    return String(path).split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj);
  };

  U.set = function (obj, path, val) {
    const ks = String(path).split('.');
    let o = obj;
    for (let i = 0; i < ks.length - 1; i++) {
      if (o[ks[i]] == null || typeof o[ks[i]] !== 'object') o[ks[i]] = /^\d+$/.test(ks[i + 1]) ? [] : {};
      o = o[ks[i]];
    }
    o[ks[ks.length - 1]] = val;
  };

  /** Construtor de elementos: h('div.cls#id', {attr}, filhos...) */
  U.h = function (tag, attrs) {
    const m = String(tag).match(/^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i);
    const el = document.createElement((m && m[1]) || 'div');
    if (m && m[2]) {
      m[2].replace(/([.#])([\w-]+)/g, function (_, t, v) {
        if (t === '.') el.classList.add(v); else el.id = v;
      });
    }
    let start = 1;
    if (attrs && typeof attrs === 'object' && !(attrs instanceof Node) && !Array.isArray(attrs)) {
      start = 2;
      Object.keys(attrs).forEach(function (k) {
        const v = attrs[k];
        if (v == null || v === false) return;
        if (k.indexOf('on') === 0 && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'html') el.innerHTML = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k === 'value') el.value = v;
        else if (k === 'checked') el.checked = !!v;
        else el.setAttribute(k, v === true ? '' : v);
      });
    }
    for (let i = start; i < arguments.length; i++) U.append(el, arguments[i]);
    return el;
  };

  U.append = function (el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { U.append(el, x); }); return; }
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  };

  U.download = function (blob, nome) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  };

  U.readFileAsDataURL = function (file) {
    return new Promise(function (res, rej) {
      const r = new FileReader();
      r.onload = function () { res(r.result); };
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  };

  U.readFileAsText = function (file) {
    return new Promise(function (res, rej) {
      const r = new FileReader();
      r.onload = function () { res(r.result); };
      r.onerror = rej;
      r.readAsText(file, 'utf-8');
    });
  };

  U.dataURLtoBytes = function (dataURL) {
    const b64 = String(dataURL).split(',')[1] || '';
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  };

  U.loadImage = function (src) {
    return new Promise(function (res, rej) {
      const img = new Image();
      img.onload = function () { res(img); };
      img.onerror = function () { rej(new Error('Não foi possível carregar a imagem.')); };
      img.src = src;
    });
  };

  App.U = U;
})(window.App);
