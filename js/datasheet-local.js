/*
 * Leitura local de datasheets, sem IA: o PDF é aberto no próprio navegador com o PDF.js, o texto é organizado em linhas
 * e colunas pela posição na página e os campos do cadastro (App.Datasheet) são procurados pelos rótulos usuais das fichas
 * técnicas (inglês e português). Gratuito e sem chave; o PDF não sai do computador. Os valores lidos passam pela revisão.
 */
window.App = window.App || {};

(function (App) {
  'use strict';

  const PDFJS_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/legacy/build/pdf.min.mjs';
  const WORKER_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/legacy/build/pdf.worker.min.mjs';
  const MAX_PAGINAS = 8;

  const LL = {};

  /* ------------------------------------------------------------ números, faixas e listas */

  function normalizarNumero(tok) {
    let s = tok.replace(/[−–]/g, '-');
    if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s) && !/^-?0,/.test(s)) return Number(s.replace(/,/g, '')); // 1,500 / 1,500.5
    if (s.indexOf(',') >= 0 && s.indexOf('.') < 0) s = s.replace(',', '.');                             // 48,5
    else s = s.replace(/,/g, '');
    return Number(s);
  }

  /** Números do texto, na ordem (aceita vírgula decimal, separador de milhar e sinal de menos). */
  function numeros(txt) {
    const out = [];
    String(txt == null ? '' : txt).replace(/[-−–]?\d+(?:[.,]\d+)*/g, function (t, pos, s) {
      // hífen entre dígitos é separador de faixa (40-560), não sinal
      const tok = /\d/.test(s.charAt(pos - 1) || '') && /^[-–]/.test(t) ? t.slice(1) : t;
      const n = normalizarNumero(tok);
      if (isFinite(n)) out.push(n);
      return t;
    });
    return out;
  }

  function numero(txt) {
    const n = numeros(txt);
    return n.length ? n[0] : null;
  }

  /** Faixa "40~560", "40-560", "40 to 560", "320 a 540+" → [mín, máx]. */
  function faixa(txt) {
    const s = String(txt || '').replace(/[−]/g, '-');
    const m = s.match(/(-?\d+(?:[.,]\d+)?)\s*(?:~|～|–|—|-|to|a|até|\.\.\.|…)\s*\+?(\d+(?:[.,]\d+)?)/i);
    if (m) {
      const a = normalizarNumero(m[1]), b = normalizarNumero(m[2]);
      if (isFinite(a) && isFinite(b) && b > a) return [a, b];
    }
    const lim = s.match(/(≥|>=|>|min\.?|mín\.?)\s*(\d+(?:[.,]\d+)?)/i);
    if (lim) return [normalizarNumero(lim[2]), null];
    return null;
  }

  /** Menor valor por entrada de listas "16/16", "13+13", "16/32", "4 × 16" (multiplicador ignorado). */
  function menorDaLista(txt) {
    const s = String(txt || '');
    const mult = s.match(/(\d+)\s*[×xX*]\s*(\d+(?:[.,]\d+)?)/);
    if (mult) return normalizarNumero(mult[2]);
    const n = numeros(s.split(/[(]/)[0]);
    return n.length ? Math.min.apply(null, n) : null;
  }

  /** Multiplicador de "4 × 16" (nº de entradas). */
  function multiplicador(txt) {
    const m = String(txt || '').match(/(\d+)\s*[×xX*]\s*\d/);
    return m ? Number(m[1]) : null;
  }

  function temUnidade(txt, rx) { return rx.test(String(txt || '')); }

  /** Potência em kW: aceita W, VA, kW e kVA (sem unidade, acima de 100 é W). */
  function kW(v, rotulo) {
    const n = numero(v);
    if (n == null) return null;
    const t = rotulo + ' ' + v;
    if (temUnidade(t, /k\s*w(?!h)|kva/i)) return n;
    if (temUnidade(t, /\(\s*(w|va|wp)\s*\)|\[\s*(w|va)\s*\]|\d\s*(w|va)\b|\b(w|va)\b/i)) return n / 1000;
    return n > 100 ? n / 1000 : n;
  }

  /** Energia em kWh: aceita Wh e kWh (sem unidade, acima de 100 é Wh). */
  function kWh(v, rotulo) {
    const n = numero(v);
    if (n == null) return null;
    const t = rotulo + ' ' + v;
    if (/kwh/i.test(t)) return n;
    if (/wh/i.test(t)) return n / 1000;
    return n > 100 ? n / 1000 : n;
  }

  /* ------------------------------------------------------------ texto do PDF em linhas e células */

  let carregando = null;
  function pdfjs() {
    if (!carregando) {
      carregando = import(PDFJS_URL).then(function (m) {
        m.GlobalWorkerOptions.workerSrc = WORKER_URL;
        return m;
      }).catch(function () {
        carregando = null;
        throw new Error('Não foi possível carregar o leitor de PDF (verifique a internet).');
      });
    }
    return carregando;
  }

  /** Agrupa os trechos de texto de uma página em linhas (mesma altura) e células (separadas por espaço largo). */
  function agrupar(itens, pagina) {
    const ord = itens.slice().sort(function (a, b) { return b.y - a.y || a.x - b.x; });
    const linhas = [];
    ord.forEach(function (it) {
      const tol = Math.max(2, 0.45 * it.h);
      let l = null;
      for (let i = linhas.length - 1; i >= 0 && i >= linhas.length - 4; i--) {
        if (Math.abs(linhas[i].y - it.y) <= tol) { l = linhas[i]; break; }
      }
      if (!l) { l = { y: it.y, h: it.h, itens: [], pagina: pagina }; linhas.push(l); }
      l.itens.push(it);
      l.h = Math.max(l.h, it.h);
    });
    return linhas.map(function (l) {
      const its = l.itens.sort(function (a, b) { return a.x - b.x; });
      const celulas = [];
      its.forEach(function (it) {
        const c = celulas[celulas.length - 1];
        const gap = c ? it.x - c.x2 : Infinity;
        if (c && gap < Math.max(1.5, 0.6 * it.h)) {
          c.t += (gap > 0.12 * it.h && !/\s$/.test(c.t) && !/^\s/.test(it.t) ? ' ' : '') + it.t;
          c.x2 = Math.max(c.x2, it.x + it.w);
          c.h = Math.max(c.h, it.h);
        } else celulas.push({ t: it.t, x: it.x, x2: it.x + it.w, h: it.h });
      });
      celulas.forEach(function (c) { c.t = c.t.replace(/\s+/g, ' ').trim(); });
      return { y: l.y, h: l.h, pagina: pagina, celulas: celulas.filter(function (c) { return c.t; }) };
    }).filter(function (l) { return l.celulas.length; });
  }

  /** Linhas de texto do PDF (até MAX_PAGINAS páginas). */
  LL.linhasDoPdf = async function (file) {
    const lib = await pdfjs();
    const dados = new Uint8Array(await file.arrayBuffer());
    let doc;
    try {
      doc = await lib.getDocument({ data: dados, isEvalSupported: false }).promise;
    } catch (e) {
      throw new Error(/password/i.test(e && e.name + e.message) ? 'PDF protegido por senha.' : 'Não foi possível abrir o PDF.');
    }
    const linhas = [];
    for (let p = 1; p <= Math.min(doc.numPages, MAX_PAGINAS); p++) {
      const pag = await doc.getPage(p);
      const tc = await pag.getTextContent();
      const itens = tc.items.filter(function (i) { return i.str && i.str.trim(); }).map(function (i) {
        const tr = i.transform;
        return { t: i.str, x: tr[4], y: tr[5], w: i.width || 0, h: Math.abs(tr[3]) || i.height || 8 };
      });
      Array.prototype.push.apply(linhas, agrupar(itens, p));
    }
    try { doc.destroy(); } catch (e) { /* ignora */ }
    return linhas;
  };

  /* ------------------------------------------------------------ rótulo × valores de cada linha */

  const UNIDADE = /^[(\[]?\s*(v|a|w|kw|va|kva|wp|kwh|wh|ah|%|mm|kg|°c|ms|s|hz|v\s*dc|vdc|vac|mw|m²|pcs|%\/°c)\s*[)\]]?$/i;
  const VALOR = /^[\s(]*([-−+<>≤≥~±]|max\.?\s|min\.?\s|up\s*to\s)?\s*\d/i;

  function pareceValor(t) {
    return VALOR.test(t) || /^(yes|no|sim|não|n\/a)(\s*[,(]|$)/i.test(t) || /^(optional|opcional|standard|ip\s?\d{2}|mc4\b|lifepo4|lfp\b|wi-?fi|rs485|can\b|lithium|lead|li-?ion)/i.test(t);
  }

  /** Célula com cara de rótulo: texto com palavras, sem cara de valor (ex.: "Discharge Current (A)"). */
  function pareceRotulo(t) {
    return !pareceValor(t) && /[A-Za-zÀ-ú]{3}/.test(t) && (/\)\s*$/.test(t) || t.trim().split(/\s+/).length >= 2);
  }

  /** Normaliza o texto de valores numa célula única: "40 ~ 560" → "40~560", "4 x 16" → "4×16", "16 / 16" → "16/16". */
  function compactar(t) {
    return t.replace(/\s*(~|～|\bto\b)\s*/gi, '~').replace(/(\d)\s*[xX×*]\s*(?=\d)/g, '$1×').replace(/\s*\/\s*/g, '/').replace(/(\d)\s*\+\s*(?=\d)/g, '$1+');
  }

  /**
   * Divide a linha em partes {rotulo, valores, seg}: rótulo à esquerda e células de valor; uma célula de texto depois de
   * valores abre nova parte (tabelas lado a lado na mesma linha). Com cabeçalho de modelos, `area` = {ini, fim} das colunas:
   * dentro dela qualquer célula é valor (inclusive texto, como "Single phase").
   */
  LL.dividir = function (linha, area) {
    const cs = linha.celulas;
    if (cs.length === 1) {
      const t = cs[0].t;
      const m = t.match(/^(.*?[A-Za-zµ°%)\]:.])\s+([-−+<>≤≥~±]?\s*\d.*)$/);
      if (!m) return [{ rotulo: t, valores: [], seg: 0 }];
      const toks = compactar(m[2]).split(/\s+/);
      const vals = [];
      toks.forEach(function (tk) {
        if (vals.length && (UNIDADE.test(tk) || !/\d/.test(tk))) vals[vals.length - 1].t += ' ' + tk;
        else vals.push({ t: tk, x: null, x2: null });
      });
      return [{ rotulo: m[1].trim(), valores: vals, seg: 0 }];
    }
    if (pareceValor(cs[0].t) && !pareceValor(cs[1].t) && !(area && (cs[1].x + cs[1].x2) / 2 >= area.ini)) {
      // frases com o valor antes do texto (ex.: "12 year | Product Warranty") ficam inteiras no rótulo
      return [{ rotulo: cs.map(function (c) { return c.t; }).join(' '), valores: [], seg: 0 }];
    }
    // tabela de pares rótulo/valor em duas (ou mais) colunas na mesma linha: "Rótulo | valor | Rótulo | valor"
    if (!area && cs.length >= 4 && cs.length % 2 === 0 && cs.every(function (c, i) { return i % 2 ? true : pareceRotulo(c.t); })) {
      const pares = [];
      for (let i = 0; i < cs.length; i += 2) pares.push({ rotulo: cs[i].t, valores: [{ t: cs[i + 1].t, x: cs[i + 1].x, x2: cs[i + 1].x2 }], seg: i / 2 });
      return pares;
    }
    const partes = [];
    let cur = null;
    cs.forEach(function (c) {
      const cx = (c.x + c.x2) / 2;
      const naArea = area && cx >= area.ini && cx <= area.fim;
      const valor = naArea || (!area || cx > area.fim ? pareceValor(c.t) : false);
      if (!cur) { cur = { rotulo: c.t, valores: [], seg: partes.length, fora: area ? cx > area.fim : false, celulas: [c] }; return; }
      cur.celulas.push(c);
      if (!cur.valores.length && UNIDADE.test(c.t)) { cur.rotulo += ' ' + c.t; return; }
      if (valor || (cur.valores.length && UNIDADE.test(c.t))) {
        if (cur.valores.length && UNIDADE.test(c.t) && !naArea) cur.valores[cur.valores.length - 1].t += ' ' + c.t;
        else cur.valores.push({ t: c.t, x: c.x, x2: c.x2, fora: area ? cx > area.fim : false });
        return;
      }
      if (cur.valores.length) { partes.push(cur); cur = { rotulo: c.t, valores: [], seg: partes.length, fora: area ? cx > area.fim : false, celulas: [c] }; return; }
      cur.rotulo += ' ' + c.t;
    });
    if (cur) partes.push(cur);
    // parte sem valor numérico com várias células: a 1ª é o rótulo e as demais são valores de texto ("Connector | MC4 EVO2")
    partes.forEach(function (p) {
      const cel = p.celulas.filter(function (c) { return !UNIDADE.test(c.t); });
      if (!p.valores.length && cel.length >= 2) {
        p.rotulo = cel[0].t;
        p.valores = cel.slice(1).map(function (c) { return { t: c.t, x: c.x, x2: c.x2, fora: p.fora }; });
      }
      delete p.celulas;
    });
    return partes;
  };

  /* ------------------------------------------------------------ colunas de modelos */

  const RX_MODELO = /^(?=.*\d)[A-Za-z][A-Za-z0-9.\-_\/+]{2,}(?: [A-Za-z0-9.\-_\/+]{1,12}){0,2}$/;
  const NAO_MODELO = /^(ip\s?\d+|mc4.*|\d+(\.\d+)?\s*(v|a|w|kw|kva|wp|mm|kg|%|kwh|ah|hz|°c)s?\b.*|[a-z]+\d?$|rs\d+|wi-?fi.*|iec.*|ul\s?\d+|en\s?\d+|ce|inmetro.*|v\d+(\.\d+)*|ver\.?.*|rev.*)$/i;

  function ehModelo(t) {
    return RX_MODELO.test(t) && !NAO_MODELO.test(t) && /[A-Za-z]{2}/.test(t) && t.length <= 40;
  }

  /** Linha de cabeçalho com os nomes dos modelos (≥ 2 células com código de modelo) e o centro de cada coluna. */
  LL.colunas = function (linhas) {
    let melhor = null;
    linhas.forEach(function (l) {
      const cs = l.celulas;
      const inicio = cs.length > 1 && !ehModelo(cs[0].t) ? 1 : 0;
      const mods = cs.slice(inicio).filter(function (c) { return ehModelo(c.t); });
      const rotuloModelo = inicio === 1 && /model|type|modelo|technical|datasheet|specification|parameter/i.test(cs[0].t);
      if (mods.length >= 2 || (mods.length === 1 && rotuloModelo)) {
        if (!melhor || mods.length > melhor.nomes.length) {
          const centros = mods.map(function (c) { return (c.x + c.x2) / 2; });
          const passo = centros.length > 1 ? (centros[centros.length - 1] - centros[0]) / (centros.length - 1) : 80;
          melhor = { nomes: mods.map(function (c) { return c.t; }), centros: centros, linha: l, area: { ini: centros[0] - 0.6 * passo, fim: centros[centros.length - 1] + 0.6 * passo } };
        }
      }
    });
    return melhor;
  };

  /** Título: o código de modelo em fonte maior na 1ª página (fichas de um só modelo). */
  function titulo(linhas) {
    let melhor = null;
    linhas.filter(function (l) { return l.pagina === 1; }).forEach(function (l) {
      l.celulas.forEach(function (c) {
        const toks = c.t.split(/\s+/).filter(ehModelo);
        if (toks.length && (!melhor || c.h > melhor.h)) melhor = { t: toks.sort(function (a, b) { return b.length - a.length; })[0], h: c.h };
      });
    });
    return melhor && melhor.t;
  }

  /** Valor de cada modelo na linha: pela posição das colunas (quando há cabeçalho) ou pela quantidade de células. */
  function porModelo(vals, cols, n, parte) {
    if (!vals.length) return null;
    const out = new Array(n).fill(null);
    const foraDasColunas = parte && (parte.fora || vals.every(function (v) { return v.fora; }));
    if (cols && cols.centros.length === n && n > 1 && vals[0].x != null && !foraDasColunas) {
      const tol = 10;
      vals.forEach(function (v) {
        const dentro = [];
        cols.centros.forEach(function (c, j) { if (c >= v.x - tol && c <= v.x2 + tol) dentro.push(j); });
        if (dentro.length) dentro.forEach(function (j) { if (out[j] == null) out[j] = v.t; });
        else {
          const cx = (v.x + v.x2) / 2;
          let jm = 0;
          cols.centros.forEach(function (c, j) { if (Math.abs(c - cx) < Math.abs(cols.centros[jm] - cx)) jm = j; });
          if (out[jm] == null) out[jm] = v.t;
        }
      });
      const unicos = out.filter(function (x) { return x != null; });
      if (unicos.length && unicos.every(function (x) { return x === unicos[0]; })) return out.map(function () { return unicos[0]; });
      return out;
    }
    if (vals.length === 1) return out.map(function () { return vals[0].t; });
    for (let j = 0; j < n; j++) out[j] = vals[j] ? vals[j].t : null;
    return out;
  }

  /* ------------------------------------------------------------ regras de campos */

  // r(chave(s), rótulo, {nao: exclusão, secao: 'backup' | 'semBackup' | 'bateria', conv})
  function r(ks, rx, o) { return Object.assign({ ks: [].concat(ks), rx: rx }, o || {}); }

  const C = {
    num: function (v) { return numero(v); },
    int: function (v) { const n = numero(v); return n == null ? null : Math.round(n); },
    kw: function (v, rot) { return kW(v, rot); },
    kwh: function (v, rot) { return kWh(v, rot); },
    menor: function (v) { return menorDaLista(v); },
    texto: function (v) { return String(v).trim() || null; },
    faixa: function (v) { return faixa(v) || [null, null]; },
    w: function (v, rot) { const n = numero(v); return n == null ? null : (/mw/i.test(rot + ' ' + v) ? n / 1000 : n); },
    tensaoTxt: function (v) {
      // "220/230/240" = alternativas; "230/180-275" = nominal/faixa → só a nominal
      const t = String(v);
      const n = numeros(/\d\s*[-~]\s*\d/.test(t) ? t.split('/')[0] : t);
      return n.length ? n.join('/') + 'V' : t.trim();
    },
    ip: function (v) { const m = String(v).match(/IP\s?\d{2}/i); return m ? m[0].replace(/\s/, '').toUpperCase() : null; },
    coef: function (v) { const n = numero(v); return n == null ? null : n; },
    paralelo: function (v) {
      if (/^\s*(no|não|n\/a|-)\b/i.test(v)) return 1;
      const n = numeros(v);
      return n.length ? Math.max.apply(null, n) : null;
    },
    dimensoes: function (v) {
      const n = numeros(String(v).split(/[(]/)[0]).filter(function (x) { return x > 0; });
      return n.length >= 2 ? [n[0], n[1], n[2] != null ? n[2] : null] : [null, null, null];
    },
    cargaDescarga: function (v) {
      const rec = String(v).match(/recom\w*\D{0,12}(\d+(?:[.,]\d+)?)/i);
      if (rec) { const x = normalizarNumero(rec[1]); return [x, x]; }
      const n = numeros(v);
      return n.length ? [n[0], n.length > 1 ? n[1] : n[0]] : [null, null];
    },
    primeiroRecomendado: function (v) {
      const m = String(v).match(/recom\w*\D{0,12}(\d+(?:[.,]\d+)?)/i);
      return m ? normalizarNumero(m[1]) : numero(v);
    }
  };

  const GERAL = [
    r('ip', /ingress|protection\s*(degree|class|rating|level)|\bip\s*(rating|class)|grau\s*de\s*prote|enclosure\s*(rating|protection)/i, { conv: C.ip }),
    r('peso', /\bweight\b|\bpeso\b/i, { nao: /packag|pallet|container|embalagem/i, conv: C.num }),
    r('garantia', /warranty|garantia/i, { nao: /power|performance|output|linear/i, conv: C.num })
  ];

  const ENTRADA = [
    r('pFVMax', /max(imum)?\.?\s*(dc\s*|pv\s*)?(input|array)\s*power|max(imum)?\.?\s*pv\s*power|recommended.{0,12}pv\s*power|max(imum)?\.?\s*usable\s*(dc|pv)\s*power|pot[eê]ncia\s*(fv|cc|de\s*entrada)\s*m[aá]x/i, { nao: /battery|charg/i, conv: C.kw }),
    r('vmaxCC', /max(imum)?\.?\s*(dc\s*|pv\s*)?(input\s*)?voltage|max(imum)?\.?\s*(dc|pv)\s*voltage|tens[aã]o\s*(cc\s*|de\s*entrada\s*)?m[aá]x/i, { nao: /battery|ac\b|output|grid|mppt|mpp\b|start|nominal|rated|range|system|bateria/i, secao: 'naoBateria', conv: C.num }),
    r('vPartida', /start[\s-]*up\s*voltage|start(ing)?\s*voltage|initial.{0,15}voltage|tens[aã]o\s*de\s*partida/i, { conv: C.num }),
    r(['mpptMin', 'mpptMax'], /mpp(t)?.{0,25}(voltage\s*)?range|mpp(t)?\s*voltage|faixa.{0,15}mppt/i, { nao: /full[\s-]*load|plena\s*carga|battery/i, conv: C.faixa }),
    r('mppts', /(number|no\.?|n[ºo°]|qty|quantity)\s*(of\s*)?mpp(t|\s*trackers?)?s?\b|mpp\s*trackers?|independent\s*mppts?|n[uú]mero\s*de\s*mppt/i, { nao: /per\s*mppt|strings?|inputs?\s*per/i, conv: C.int }),
    r('stringsPorMppt', /strings?\s*(per|\/)\s*mpp(t|\s*tracker)?|inputs?\s*per\s*mpp(t|\s*tracker)?|strings?\s*por\s*mppt/i, { conv: C.menor }),
    r('_stringsTotal', /(number|no\.?|n[ºo°])\s*(of\s*)?(dc\s*|pv\s*)?(inputs?|strings?)\b/i, { nao: /per|mppt|current|voltage/i, conv: C.int }),
    r('imaxMppt', /max(imum)?\.?\s*(dc\s*|pv\s*)?input\s*current|corrente\s*(de\s*entrada\s*)?m[aá]x/i, { nao: /short|isc|battery|curto|bateria/i, conv: C.menor }),
    r('iscMaxMppt', /short[\s-]*circuit\s*current|\bisc\b|curto[\s-]*circuito/i, { nao: /battery|output|bateria/i, conv: C.menor })
  ];

  const SAIDA = [
    r('potencia', /(nominal|rated)\s*(ac\s*)?(output\s*|grid\s*)?(active\s*)?power|(nominal|rated)\s*(ac\s*)?output.{0,16}power|nominal\s*ac\s*power|pot[eê]ncia\s*(nominal|ativa\s*nominal)/i, { nao: /apparent|input|\bdc\b|\bpv\b|battery|charg|aparente|entrada/i, secao: 'semBackup', conv: C.kw }),
    r('potenciaMaxCA', /max(imum)?\.?\s*(ac\s*)?(output\s*)?apparent\s*power|max(imum)?\.?\s*(ac\s*)?output\s*power|pot[eê]ncia\s*aparente\s*m[aá]x/i, { nao: /input|\bdc\b|\bpv\b|battery|charg/i, secao: 'semBackup', conv: C.kw }),
    r('iSaidaMax', /max(imum)?\.?\s*(ac\s*)?output\s*current|max(imum)?\.?\s*ac\s*current|corrente\s*(de\s*sa[ií]da\s*)?m[aá]x/i, { secao: 'semBackup', conv: C.num }),
    r('tensao', /(nominal|rated)\s*(ac\s*|grid\s*|output\s*)+voltage|nominal\s*voltage|tens[aã]o\s*(nominal\s*)?(ca|de\s*sa[ií]da|da\s*rede)/i, { nao: /battery|\bdc\b|input|\bpv\b|bateria/i, secao: 'semBackup', conv: C.tensaoTxt })
  ];

  const EFICIENCIA_INV = [
    r('efMax', /max(imum)?\.?\s*efficiency|efici[eê]ncia\s*m[aá]x/i, { nao: /mppt|battery|charg|discharg|bateria/i, conv: C.num }),
    r('efEuro', /(euro(pean)?|cec|weighted)\s*(weighted\s*)?efficiency|efici[eê]ncia\s*(europeia|ponderada)/i, { conv: C.num }),
    r('consumoProprioW', /self[\s-]*consumption|standby\s*(power|consumption|loss)|night(time)?\s*(power\s*)?consumption|no[\s-]*load\s*(loss|consumption|power)|consumo\s*pr[oó]prio/i, { conv: C.w }),
    r('monitoramento', /monitoring|communication|comunica[cç][aã]o|monitoramento/i, { conv: C.texto })
  ];

  const BATERIA_INV = [
    r('tensaoBateria', /(nominal|rated)\s*(battery\s*)?voltage|battery\s*(nominal\s*)?voltage|tens[aã]o\s*nominal\s*(da\s*)?bateria/i, { nao: /range|charg|ac\b|grid|output|faixa/i, secao: 'bateria', conv: C.num }),
    r(['vBatMin', 'vBatMax'], /voltage\s*range|faixa\s*de\s*tens[aã]o/i, { nao: /mppt|mpp\b|pv|grid|ac\b|output/i, secao: 'bateria', conv: C.faixa }),
    r(['iCargaMax', 'iDescargaMax'], /charg(e|ing)\s*\/\s*discharg(e|ing)\s*current|carga\s*\/\s*descarga/i, { conv: C.cargaDescarga }),
    r('iCargaMax', /max(imum)?\.?\s*(continuous\s*)?charg(e|ing)\s*current|corrente\s*(m[aá]x\.?\s*)?de\s*carga/i, { nao: /discharg|descarga/i, conv: C.num }),
    r('iDescargaMax', /max(imum)?\.?\s*(continuous\s*)?discharg(e|ing)\s*current|corrente\s*(m[aá]x\.?\s*)?de\s*descarga/i, { conv: C.num }),
    r('pBateriaMax', /(max(imum)?\.?\s*)?charg(e|ing)(\s*\/\s*discharg(e|ing))?\s*power|battery\s*power|pot[eê]ncia.{0,20}bateria/i, { conv: C.kw }),
    r('_capBateria', /battery\s*capacity|max(imum)?\.?\s*capacity|capacidade.{0,15}bateria/i, { secao: 'bateria', conv: C.texto }),
    r('efBateria', /(battery|charg(e|ing)|discharg(e|ing)|bat(tery)?\s*to\s*ac).{0,15}efficiency|efici[eê]ncia.{0,15}bateria/i, { conv: C.num })
  ];

  const BACKUP = [
    r('potenciaBackup', /(back[\s-]*up|eps|off[\s-]*grid).{0,30}(rated|nominal|output)?\s*(apparent\s*)?power/i, { nao: /peak|surge|pico/i, conv: C.kw }),
    r('potenciaBackup', /(rated|nominal)\s*(output\s*)?(apparent\s*)?power|output\s*power|pot[eê]ncia\s*(nominal|de\s*sa[ií]da)/i, { nao: /peak|surge|pico|max/i, secao: 'backup', conv: C.kw }),
    r('_surto', /peak|surge|pico/i, { secao: 'backup', conv: C.texto }),
    r('tempoComutacao', /switch(ing|[\s-]*over)?\s*time|transfer\s*time|change[\s-]*over|comuta[cç][aã]o/i, { conv: C.num }),
    r('paraleloMax', /parallel|paralel/i, { conv: C.paralelo })
  ];

  const REGRAS = {
    modulo: [
      r('potencia', /(peak|max(imum)?|nominal|rated)\.?\s*(output\s*)?power|\bp\s*max\b|\bpmpp\b|pot[eê]ncia\s*(m[aá]xima|nominal|de\s*pico)/i, { nao: /tolerance|temp|coef|voltage|current|system|fuse|bifacial|gain|noct|nmot|toler/i, conv: C.num }),
      r('tolerancia', /tolerance|toler[aâ]ncia/i, { conv: C.texto }),
      r('voc', /open[\s-]*circuit\s*voltage|\bv\s*oc\b|\buoc\b|tens[aã]o\s*de\s*circuito\s*aberto/i, { nao: /coef|temp/i, conv: C.num }),
      r('vmp', /(max(imum)?\.?\s*power|optimum\s*operating|\bmpp|operating)\s*voltage|\bv\s*mpp?\b|\bumpp?\b|tens[aã]o\s*(de\s*|em\s*)?m[aá]xima\s*pot[eê]ncia/i, { nao: /coef|temp|system/i, conv: C.num }),
      r('isc', /short[\s-]*circuit\s*current|\bi\s*sc\b|corrente\s*de\s*curto/i, { nao: /coef|temp|fuse/i, conv: C.num }),
      r('imp', /(max(imum)?\.?\s*power|optimum\s*operating|\bmpp|operating)\s*current|\bi\s*mpp?\b|corrente\s*(de\s*|em\s*)?m[aá]xima\s*pot[eê]ncia/i, { nao: /coef|temp/i, conv: C.num }),
      r('eficiencia', /module\s*efficiency|efficiency|efici[eê]ncia/i, { nao: /cell|temp|c[eé]lula/i, conv: C.num }),
      r('coefVoc', /(coef\w*|temp\w*).{0,30}(voc|uoc|open[\s-]*circuit)|(voc|uoc).{0,20}(coef|temp)|β/i, { conv: C.coef }),
      r('coefPmax', /(coef\w*|temp\w*).{0,30}(pmax|pmpp|p\s*max|power|pot[eê]ncia)|(pmax|pmpp).{0,20}(coef|temp)|γ/i, { conv: C.coef }),
      r('coefIsc', /(coef\w*|temp\w*).{0,30}(isc|short)|(isc).{0,20}(coef|temp)|α/i, { conv: C.coef }),
      r('noct', /\bnoct\b|\bnmot\b|nominal\s*(module\s*)?operating\s*(cell\s*)?temp/i, { nao: /power|voltage|current|efficien|pot[eê]ncia|tens[aã]o|corrente/i, conv: C.num }),
      r('vMaxSistema', /max(imum)?\.?\s*system\s*voltage|tens[aã]o\s*m[aá]xima\s*(do\s*)?sistema/i, { conv: C.num }),
      r('fusivelMax', /series\s*fuse|fus[ií]vel/i, { conv: C.num }),
      r(['comprimento', 'largura', 'espessura'], /dimension|dimens[oõ]es/i, { nao: /packag|pallet|container|embalagem/i, conv: C.dimensoes }),
      r('peso', /\bweight\b|\bpeso\b/i, { nao: /packag|pallet|container|embalagem/i, conv: C.num }),
      r('celulas', /(no\.?|number|n[ºo°])\s*(of\s*)?cells|cell\s*(orientation|quantity|arrangement|number)|c[eé]lulas/i, { conv: C.int }),
      r('conector', /connector|conector/i, { conv: C.texto }),
      r('bifacialidade', /bifaciality|bifacial(ity)?\s*(factor|coefficient)|bifacialidade/i, { conv: C.num })
    ],
    inversor: ENTRADA.concat(SAIDA, EFICIENCIA_INV, GERAL),
    hibrido: ENTRADA.concat(BATERIA_INV, SAIDA, BACKUP, EFICIENCIA_INV, GERAL),
    micro: [
      r(['potModuloMin', 'potModuloMax'], /module\s*power|pv\s*(module|panel)\s*power|panel\s*power|pot[eê]ncia\s*(do\s*)?m[oó]dulo/i, { conv: C.faixa }),
      r('vmaxCC', /max(imum)?\.?\s*(dc\s*)?input\s*voltage|tens[aã]o\s*(de\s*entrada\s*)?m[aá]x/i, { conv: C.num }),
      r(['mpptMin', 'mpptMax'], /mpp(t)?.{0,20}(voltage\s*)?range|faixa.{0,15}mppt/i, { nao: /full[\s-]*load/i, conv: C.faixa }),
      r('vPartida', /start[\s-]*up\s*voltage|start(ing)?\s*voltage|tens[aã]o\s*de\s*partida/i, { conv: C.num }),
      r('imaxMppt', /max(imum)?\.?\s*(dc\s*)?input\s*current|corrente\s*(de\s*entrada\s*)?m[aá]x/i, { nao: /short|curto/i, conv: C.menor }),
      r('iscMaxMppt', /short[\s-]*circuit|curto[\s-]*circuito/i, { conv: C.menor }),
      r('modulosPorUnidade', /(number|no\.?|n[ºo°])\s*(of\s*)?(mppts?|dc\s*inputs?|inputs?|modules?\s*per)|n[uú]mero\s*de\s*(entradas|mppt)/i, { nao: /per\s*mppt|por\s*mppt/i, conv: C.int }),
      r('potencia', /(rated|nominal|max(imum)?\.?\s*continuous)\s*(ac\s*)?output\s*power|rated\s*power|pot[eê]ncia\s*(nominal|de\s*sa[ií]da)/i, { conv: C.kw }),
      r('potenciaMaxCA', /peak\s*output\s*power|max(imum)?\.?\s*output\s*power/i, { conv: C.kw }),
      r('iSaidaMax', /(rated|max(imum)?)\.?\s*output\s*current|corrente\s*(nominal\s*)?de\s*sa[ií]da/i, { conv: C.num }),
      r('tensao', /(nominal|rated)\s*(output\s*|grid\s*)?voltage|tens[aã]o\s*(nominal\s*)?(de\s*sa[ií]da|da\s*rede)/i, { conv: C.tensaoTxt }),
      r('maxPorRamal', /units?\s*per\s*(ac\s*)?(branch|circuit|string|trunk)|max(imum)?\.?\s*(number\s*of\s*)?units|m[aá]x.{0,20}por\s*ramal/i, { conv: C.int }),
      r('efEuro', /(cec|euro(pean)?|weighted)\s*(weighted\s*)?efficiency|efici[eê]ncia\s*(europeia|ponderada)/i, { conv: C.num }),
      r('efMax', /(peak|max(imum)?)\.?\s*efficiency|efici[eê]ncia\s*m[aá]x/i, { nao: /mppt/i, conv: C.num }),
      r('consumoProprioW', /night(time)?\s*(power\s*)?consumption|standby|self[\s-]*consumption|consumo\s*noturno/i, { conv: C.w }),
      r('monitoramento', /monitoring|communication|comunica[cç][aã]o/i, { conv: C.texto })
    ].concat(GERAL),
    bateria: [
      r('energiaUtil', /usable\s*(energy|capacity)|energia\s*[uú]til/i, { cond: function (t) { return /wh/i.test(t); }, conv: C.kwh }),
      r('energia', /(nominal|rated|total)?\s*(energy|capacity)|energia\s*nominal|capacidade\s*nominal/i, { nao: /usable|system|scalab|expan|cell|max(imum)?\s*(capacity|energy)|[uú]til/i, cond: function (t) { return /wh/i.test(t); }, conv: C.kwh }),
      r('capacidadeAh', /capacity|capacidade/i, { nao: /usable|system|scalab|expan|max(imum)?\s*capacity|[uú]til/i, cond: function (t) { return /\bah\b|\(ah\)|\dah\b/i.test(t) && !/wh/i.test(t); }, conv: C.num }),
      r('tensao', /(nominal|rated)\s*voltage|tens[aã]o\s*nominal/i, { nao: /range|charg|cut|faixa/i, conv: C.num }),
      r(['vMin', 'vMax'], /voltage\s*range|(operating|working|operation)\s*voltage|discharg(e|ing)\s*voltage|faixa\s*de\s*tens[aã]o/i, { nao: /^\s*charg(e|ing)\s*voltage/i, conv: C.faixa }),
      r(['iCargaMax', 'iDescargaMax'], /charg(e|ing)\s*\/\s*discharg(e|ing)\s*current|carga\s*\/\s*descarga/i, { nao: /peak|pico/i, conv: C.cargaDescarga }),
      r('iCargaMax', /charg(e|ing)\s*current|corrente\s*de\s*carga/i, { nao: /discharg|descarga|peak|pico/i, conv: C.primeiroRecomendado }),
      r('iDescargaMax', /discharg(e|ing)\s*current|corrente\s*de\s*descarga/i, { nao: /peak|pico/i, conv: C.primeiroRecomendado }),
      r('potencia', /(max(imum)?|rated|nominal|continuous)\.?\s*(continuous\s*)?(dis)?charg(e|ing)\s*power|(rated|nominal)?\s*output\s*power|pot[eê]ncia.{0,15}descarga/i, { nao: /peak|pico/i, conv: C.kw }),
      r('picoKW', /peak\s*(discharg\w*\s*)?power|pot[eê]ncia\s*de\s*pico/i, { conv: C.kw }),
      r('dod', /depth\s*of\s*discharge|\bdod\b|profundidade\s*de\s*descarga/i, { nao: /cycle|ciclo/i, conv: C.num }),
      r('eficiencia', /round[\s-]*trip|efficiency|efici[eê]ncia/i, { conv: C.num }),
      r('ciclos', /cycle\s*life|cycles|ciclos/i, { conv: C.int }),
      r('garantiaMWh', /throughput|energia\s*garantida/i, { conv: C.num }),
      r('capMaxSistema', /(max(imum)?\.?\s*)?(system\s*)?(capacity|energy)\s*(expansion|scalab\w*|max)|scalab\w*|expandab\w*|expansion|capacidade\s*m[aá]x/i, { conv: C.texto }),
      r('paraleloMax', /parallel|paralel/i, { conv: C.paralelo }),
      r('comunicacao', /communication|interface|comunica[cç][aã]o/i, { conv: C.texto }),
      r('certificacoes', /certific|safety\s*standard|certifica/i, { conv: C.texto })
    ].concat(GERAL)
  };

  /* ------------------------------------------------------------ dados do documento inteiro */

  const MARCAS = ['Trina Solar', 'JinkoSolar', 'LONGi', 'JA Solar', 'Canadian Solar', 'Risen', 'Astronergy', 'Chint', 'TCL Solar', 'OSDA', 'Honor Solar', 'ERA Solar', 'DMEGC',
    'Aiko', 'Tongwei', 'Znshine', 'Runergy', 'Leapton', 'Sunova', 'BYD', 'Huawei', 'Sungrow', 'GoodWe', 'Growatt', 'Deye', 'Solis', 'Sofar', 'Hoymiles', 'APsystems',
    'Enphase', 'Fronius', 'SMA', 'WEG', 'Intelbras', 'Tsuness', 'FoxESS', 'Livoltek', 'SAJ', 'Pylontech', 'Dyness', 'Unipower', 'Moura', 'Weco', 'Elgin', 'Renovigi', 'Felicity'];
  const APELIDOS = { jinko: 'JinkoSolar', trina: 'Trina Solar', 'ja solar': 'JA Solar', ginlong: 'Solis', canadian: 'Canadian Solar', longi: 'LONGi' };

  function fabricanteDo(texto) {
    const cont = {};
    MARCAS.concat(Object.keys(APELIDOS)).forEach(function (m) {
      const rx = new RegExp('\\b' + m.replace(/ /g, '\\s*') + '\\b', 'gi');
      const n = (texto.match(rx) || []).length;
      if (n) { const nome = APELIDOS[m.toLowerCase()] || m; cont[nome] = (cont[nome] || 0) + n; }
    });
    const ord = Object.keys(cont).sort(function (a, b) { return cont[b] - cont[a]; });
    return ord[0] || '';
  }

  function fasesDo(texto) {
    if (/three[\s-]*phase|3[\s-]*phase|trif[aá]sic|3\s*\/\s*n\s*\/\s*pe|3w\s*\+\s*n/i.test(texto)) return 'Trifásico';
    if (/split[\s-]*phase|bif[aá]sic/i.test(texto)) return 'Bifásico';
    if (/single[\s-]*phase|1[\s-]*phase|monof[aá]sic|l\s*\/\s*n\s*\/\s*pe/i.test(texto)) return 'Monofásico';
    return null;
  }

  function tipoDetectado(texto) {
    const t = texto.toLowerCase();
    const conta = function (rx) { return (t.match(rx) || []).length; };
    const mod = conta(/open[\s-]*circuit|bifacial|cells|\bwp\b|module efficiency|noct|nmot/g);
    const bat = conta(/battery|lifepo4|\blfp\b|cycle life|depth of discharge|\bdod\b/g);
    const inv = conta(/mppt|inverter|grid|\bac\b/g);
    if (/micro[\s-]*inverter|microinversor|units? per branch/.test(t)) return 'micro';
    if (mod > 3 && mod >= inv) return 'modulo';
    if (inv > 3 && (/hybrid|h[ií]brido|back[\s-]*up|\beps\b|off[\s-]*grid/.test(t) || /battery voltage/.test(t))) return 'hibrido';
    if (bat > 3 && conta(/mppt/g) === 0) return 'bateria';
    if (inv > 3) return 'inversor';
    return null;
  }

  function garantiasModulo(texto) {
    const o = {};
    let m = texto.match(/(\d{1,2})\s*[-\s]?(years?|anos)\s*(of\s*)?(product|workmanship|material|produto)/i) || texto.match(/(product|workmanship|produto).{0,30}?(\d{1,2})\s*(years?|anos)/i);
    if (m) o.garantiaProduto = Number(m[1]) || Number(m[2]);
    m = texto.match(/(\d{1,2})\s*[-\s]?(years?|anos)\s*(of\s*)?(linear\s*)?(power|performance|output|pot[eê]ncia|desempenho)/i) || texto.match(/(linear\s*)?(power|performance)\s*(output\s*)?warranty.{0,20}?(\d{1,2})\s*(years?|anos)/i);
    if (m) o.garantiaPerformance = Number(m[1]) || Number(m[4]);
    m = texto.match(/(\d+(?:[.,]\d+)?)\s*%\s*(for\s*)?(the\s*)?(first|1st|1º|primeiro)[\s-]*(year|ano)/i) || texto.match(/(first|1st)[\s-]*year\s*(power\s*)?(degradation|attenuation).{0,15}?(\d+(?:[.,]\d+)?)\s*%/i);
    if (m) o.degradacao1Ano = normalizarNumero(m[1].indexOf('%') < 0 && /\d/.test(m[1]) ? m[1] : m[4]);
    m = texto.match(/(\d+(?:[.,]\d+)?)\s*%\s*(annual|per\s*year|year[\s-]*on[\s-]*year|yearly|linear|ao\s*ano|anual)/i) ||
      texto.match(/(annual|linear|yearly)\s*(power\s*)?(degradation|attenuation|decline).{0,20}?(\d+(?:[.,]\d+)?)\s*%/i);
    if (m) o.degradacaoAnual = normalizarNumero(/\d/.test(m[1]) ? m[1] : m[4]);
    return o;
  }

  /* ------------------------------------------------------------ análise */

  function categoriaSecao(t, cabecalho) {
    if (/back[\s-]*up|\beps\b|off[\s-]*grid/i.test(t) || (cabecalho && /\bups\b/i.test(t))) return 'backup';
    if (/battery|bateria/i.test(t)) return 'bateria';
    return '';
  }

  function secaoAceita(regra, rot, secao) {
    const cat = categoriaSecao(rot) || secao;
    if (regra.secao === 'backup') return cat === 'backup';
    if (regra.secao === 'semBackup') return cat !== 'backup';
    if (regra.secao === 'bateria') return cat === 'bateria';
    if (regra.secao === 'naoBateria') return cat !== 'bateria';
    return true;
  }

  /**
   * Campos de cada modelo a partir das linhas do PDF. Devolve {modelos[] (campos do cadastro), avisos[], tipoDetectado,
   * encontrados (nº de campos por modelo)}.
   */
  LL.analisar = function (linhas, tipo) {
    const regras = REGRAS[tipo];
    if (!regras) throw new Error('Tipo de equipamento sem leitura de datasheet.');
    const texto = linhas.map(function (l) { return l.celulas.map(function (c) { return c.t; }).join(' '); }).join('\n');
    const avisos = [];
    const cols = LL.colunas(linhas);
    const partes = [];
    linhas.forEach(function (l) {
      // linhas acima do cabeçalho de modelos (título, textos) não usam a área das colunas
      const area = cols && (l.pagina > cols.linha.pagina || (l.pagina === cols.linha.pagina && l.y <= cols.linha.y)) ? cols.area : null;
      Array.prototype.push.apply(partes, LL.dividir(l, area));
    });

    // seções: linhas só com rótulo curto (ex.: "Battery Data", "Back-up Output")
    let secao = '';
    const secoes = partes.map(function (p) {
      if (!p.valores.length && p.rotulo.split(/\s+/).length <= 6) {
        const cat = categoriaSecao(p.rotulo, true);
        secao = cat || (/input|output|general|efficiency|protection|entrada|sa[ií]da|geral|dados|data|parameters|electrical|mechanical/i.test(p.rotulo) ? '' : secao);
      }
      return secao;
    });

    // nº de modelos: colunas do cabeçalho ou a contagem mais comum de valores nas linhas de potência/energia
    let n = cols ? cols.nomes.length : 0;
    if (!n) {
      const chave = tipo === 'bateria' ? /energy|capacity|energia/i : /power|pot[eê]ncia/i;
      const contagens = {};
      partes.forEach(function (p) { if (p.valores.length && chave.test(p.rotulo)) contagens[p.valores.length] = (contagens[p.valores.length] || 0) + 1; });
      const ks = Object.keys(contagens).map(Number).filter(function (k) { return k <= 12; });
      n = ks.length ? ks.sort(function (a, b) { return contagens[b] - contagens[a] || a - b; })[0] : 1;
    }

    const valores = {}; // chave → valores por modelo (primeira linha que casar com a regra)
    const rotulos = {}, brutos = {};
    regras.forEach(function (rg) {
      if (rg.ks.every(function (k) { return valores[k]; })) return;
      for (let i = 0; i < partes.length; i++) {
        const p = partes[i];
        if (!p.valores.length || !rg.rx.test(p.rotulo) || (rg.nao && rg.nao.test(p.rotulo)) || !secaoAceita(rg, p.rotulo, secoes[i])) continue;
        if (rg.cond && !rg.cond(p.rotulo + ' ' + p.valores.map(function (v) { return v.t; }).join(' '))) continue;
        const vs = porModelo(p.valores, cols, n, p);
        if (!vs) continue;
        const conv = vs.map(function (v) { return v == null ? null : rg.conv(v, p.rotulo); });
        const porChave = rg.ks.map(function (k, j) { return conv.map(function (c) { return Array.isArray(c) ? c[j] : (rg.ks.length > 1 ? null : c); }); });
        if (!porChave.some(function (vk) { return vk.some(function (x) { return x != null && x !== ''; }); })) continue;
        rg.ks.forEach(function (k, j) {
          if (valores[k]) return;
          valores[k] = porChave[j];
          rotulos[k] = p.rotulo;
          brutos[k] = vs;
        });
        break;
      }
    });

    const fab = fabricanteDo(texto);
    const fases = fasesDo(texto);
    const tit = titulo(linhas);
    const modelos = [];
    for (let j = 0; j < n; j++) {
      const m = {};
      Object.keys(valores).forEach(function (k) { if (valores[k][j] != null) m[k] = valores[k][j]; });
      m.fabricante = fab;
      if (cols && cols.nomes[j]) m.modelo = cols.nomes[j];
      else if (n === 1 && tit) m.modelo = tit;
      else if (tit && /x{2,3}/i.test(tit) && m.potencia) m.modelo = tit.replace(/x{2,3}/i, String(Math.round(m.potencia)));
      else m.modelo = (tit ? tit + ' ' : (fab ? fab + ' ' : 'Modelo ')) + (m.potencia ? (tipo === 'modulo' ? Math.round(m.potencia) + 'W' : m.potencia + 'kW') : (n > 1 ? String(j + 1) : ''));
      if (tipo !== 'modulo' && tipo !== 'bateria' && fases) m.fases = fases;
      if (tipo === 'micro' && !m.fases) m.fases = 'Monofásico';
      derivados(tipo, m, texto, brutos, rotulos, j, avisos);
      modelos.push(m);
    }
    if (n > 1 && !cols) avisos.push('Os nomes dos modelos não foram identificados na tabela: confira o modelo de cada coluna.');
    const dim = App.Datasheet.todos(tipo).filter(function (c) { return c.dim; });
    const conv = modelos.map(function (m) { return App.Datasheet.converter(tipo, m); });
    const achados = conv.length ? Math.max.apply(null, conv.map(function (m) { return dim.filter(function (c) { return m[c.k] != null; }).length; })) : 0;
    return { modelos: conv, avisos: avisos.filter(function (a, i, arr) { return arr.indexOf(a) === i; }), tipoDetectado: tipoDetectado(texto), encontrados: achados, totalDim: dim.length };
  };

  /** Campos que dependem de outros ou do texto do documento. */
  function derivados(tipo, m, texto, brutos, rotulos, j, avisos) {
    if (tipo === 'modulo') {
      Object.assign(m, garantiasModulo(texto));
      const tec = /topcon/i.test(texto) ? 'TOPCon' : (/\bhjt\b|heterojunction|heterojun[cç][aã]o/i.test(texto) ? 'HJT' : (/\bbc\b|back[\s-]*contact/i.test(texto) ? 'BC' : (/perc/i.test(texto) ? 'PERC' : (/mono/i.test(texto) ? 'Monocristalino' : ''))));
      const bif = /bifacial/i.test(texto);
      if (tec || bif) m.tecnologia = [tec || (bif ? 'Monocristalino' : ''), bif ? 'bifacial' : ''].filter(Boolean).join(' ');
      m.bifacial = bif ? 'Sim' : 'Não';
      if (/dual[\s-]*glass|double[\s-]*glass|glass[\s-]*glass|vidro\s*duplo/i.test(texto)) m.detalhe = 'Vidro duplo';
      if (m.coefVoc != null && m.coefVoc > 0) m.coefVoc = -m.coefVoc;
      if (m.coefPmax != null && m.coefPmax > 0) m.coefPmax = -m.coefPmax;
    }
    if (tipo === 'inversor' || tipo === 'hibrido') {
      if (m.stringsPorMppt == null && m._stringsTotal && m.mppts) m.stringsPorMppt = Math.max(1, Math.round(m._stringsTotal / m.mppts));
      const rot = rotulos.imaxMppt || '';
      if (m.imaxMppt != null && m.mppts > 1 && !/per\s*mpp|por\s*mppt/i.test(rot) && brutos.imaxMppt && /^\s*\d+([.,]\d+)?\s*a?\s*$/i.test(String(brutos.imaxMppt[j]))) {
        avisos.push('Corrente máxima de entrada sem indicação "por MPPT": confira se o valor é por MPPT ou total.');
      }
    }
    if (tipo === 'hibrido') {
      if (m.tensaoBateria != null) m.tipoBateria = m.tensaoBateria > 60 ? 'HV' : 'LV';
      else if (m.vBatMax != null) m.tipoBateria = m.vBatMax > 100 ? 'HV' : 'LV';
      if (m._capBateria) {
        const t = m._capBateria;
        const n = numeros(t);
        if (n.length) {
          const max = Math.max.apply(null, n);
          if (/kwh/i.test(t)) m.capBateriaMax = max;
          else if (/wh/i.test(t)) m.capBateriaMax = max / 1000;
          else if (/ah/i.test(t) && (m.tensaoBateria || 48)) m.capBateriaMax = max * (m.tensaoBateria || 48) / 1000;
        }
      }
      if (m._surto) {
        const t = m._surto;
        const vezes = t.match(/(\d+(?:[.,]\d+)?)\s*(times|x\b|vezes)/i);
        if (vezes && m.potenciaBackup) m.surtoKW = normalizarNumero(vezes[1]) * m.potenciaBackup;
        else if (!vezes) m.surtoKW = kW(t, rotulos._surto || '');
        const s = t.match(/(\d+(?:[.,]\d+)?)\s*s(ec)?\b/i);
        if (s) m.surtoS = normalizarNumero(s[1]);
      }
      if (m.potenciaBackup == null && m.potencia) m.potenciaBackup = null;
    }
    if (tipo === 'micro') {
      if (m.modulosPorUnidade == null && brutos.imaxMppt) m.modulosPorUnidade = multiplicador(brutos.imaxMppt[j]) || undefined;
      if (m.modulosPorUnidade == null && m.modelo) { const mm = String(m.modelo).match(/-(\d)T\b|(\d)\s*in\s*1/i); if (mm) m.modulosPorUnidade = Number(mm[1] || mm[2]); }
      if (m.modulosPorUnidade == null) delete m.modulosPorUnidade;
    }
    if (tipo === 'bateria') {
      if (m.capacidadeAh == null) { const ah = texto.match(/(\d+(?:[.,]\d+)?)\s*Ah\b/); if (ah) m.capacidadeAh = normalizarNumero(ah[1]); }
      if (m.energia == null && m.capacidadeAh && m.tensao) m.energia = Math.round(m.capacidadeAh * m.tensao) / 1000;
      if (m.capMaxSistema != null) {
        const t = String(m.capMaxSistema);
        const n = numeros(t);
        m.capMaxSistema = /kwh|wh/i.test(t) && n.length ? (/kwh/i.test(t) ? Math.max.apply(null, n) : Math.max.apply(null, n) / 1000) : null;
      }
      if (m.tensao != null) m.tipoBateria = m.tensao > 60 ? 'HV' : 'LV';
      m.quimica = /lifepo4|\blfp\b|lithium iron phosphate|fosfato de ferro/i.test(texto) ? 'LiFePO4' : (/\bnmc\b/i.test(texto) ? 'Lítio NMC' : (/lead[\s-]*acid|agm|\bgel\b|chumbo/i.test(texto) ? 'Chumbo-ácido' : (/sodium|s[oó]dio/i.test(texto) ? 'Sódio-íon' : undefined)));
      if (m.picoKW == null) delete m.picoKW;
    }
    Object.keys(m).forEach(function (k) { if (k.charAt(0) === '_' || m[k] == null) delete m[k]; });
  }

  /**
   * Lê o datasheet no navegador. Devolve o mesmo formato da leitura por IA:
   * {tipoDetectado, modelos[], avisos, modeloIA: 'local', fallback: false, custoUSD: 0, local: true}.
   */
  LL.lerDatasheet = async function (file, opcoes) {
    const o = opcoes || {};
    const pdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
    if (!pdf) throw new Error('A leitura no navegador funciona só com PDF. Para foto da ficha técnica, use a leitura com IA.');
    if (o.aoEtapa) o.aoEtapa('Abrindo o PDF no navegador…');
    const linhas = await LL.linhasDoPdf(file);
    if (o.sinal && o.sinal.aborted) throw new Error('Leitura cancelada.');
    if (linhas.length < 5) throw new Error('O PDF não tem texto selecionável (provavelmente é escaneado). Use a leitura com IA.');
    if (o.aoEtapa) o.aoEtapa('Procurando os campos na tabela…');
    const res = LL.analisar(linhas, o.tipo);
    const interesse = String(o.modeloInteresse || '').toLowerCase().replace(/\s+/g, '');
    const avisos = ['Leitura no navegador (sem IA): ' + res.encontrados + ' de ' + res.totalDim + ' campos ★ encontrados. Confira cada valor com o datasheet.'].concat(res.avisos);
    if (res.encontrados < Math.ceil(res.totalDim / 3)) avisos.push('Poucos campos encontrados: a tabela deste fabricante tem um formato diferente. Se preferir, leia com IA.');
    if (interesse && !res.modelos.some(function (m) { return String(m.modelo || '').toLowerCase().replace(/\s+/g, '').indexOf(interesse) >= 0; })) {
      avisos.push('O modelo "' + o.modeloInteresse + '" não foi identificado pelo nome na tabela.');
    }
    return { tipoDetectado: res.tipoDetectado, modelos: res.modelos.filter(function (m) { return m.modelo; }), avisos: avisos.join(' '), modeloIA: 'local', fallback: false, custoUSD: 0, local: true };
  };

  LL._internos = { numeros: numeros, numero: numero, faixa: faixa, menorDaLista: menorDaLista, kW: kW, kWh: kWh, agrupar: agrupar, ehModelo: ehModelo, garantiasModulo: garantiasModulo, fabricanteDo: fabricanteDo };
  App.LeituraLocal = LL;
})(window.App);
