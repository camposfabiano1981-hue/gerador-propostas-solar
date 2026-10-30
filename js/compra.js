/*
 * Pedidos de compra: orçamentos e pedidos dos fornecedores (PDF ou foto anexados), leitura dos itens — no navegador, pelo texto
 * do PDF, ou pela IA — e lançamento dos itens no cadastro de Materiais e acessórios com o custo de aquisição (preço com o
 * desconto, o frete e as outras despesas do pedido rateados pelo valor de cada item).
 */
window.App = window.App || {};

(function (App) {
  'use strict';

  const U = App.U;

  const SITUACOES = [
    { id: 'cotacao', label: 'Cotação', cor: 'cinza' },
    { id: 'pedido', label: 'Pedido feito', cor: 'azul' },
    { id: 'recebido', label: 'Recebido', cor: 'ok' },
    { id: 'cancelado', label: 'Cancelado', cor: 'erro' }
  ];

  // unidades dos documentos dos fornecedores → unidades do cadastro de materiais
  const UNIDADES = {
    un: 'un', und: 'un', unid: 'un', unidade: 'un', uni: 'un', pc: 'pç', 'pç': 'pç', pca: 'pç', 'pça': 'pç', pcs: 'pç', peca: 'pç', 'peça': 'pç',
    m: 'm', mt: 'm', mts: 'm', metro: 'm', metros: 'm', ml: 'm', m2: 'm²', 'm²': 'm²', cj: 'cj', conj: 'cj', jg: 'cj', jogo: 'cj', kit: 'cj',
    pt: 'pt', par: 'pt', pr: 'pt', kg: 'kg', rl: 'rl', rolo: 'rl', cx: 'cx', caixa: 'cx', l: 'L', lt: 'L', litro: 'L', vb: 'vb', verba: 'vb',
    br: 'br', barra: 'br', pct: 'pct', pacote: 'pct', cto: 'cto', cento: 'cto'
  };

  function semAcento(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }

  /** Unidade do cadastro para o texto do documento ('' quando não for unidade). */
  function unidade(t) {
    const k = String(t == null ? '' : t).trim().toLowerCase().replace(/\.$/, '');
    return UNIDADES[k] || UNIDADES[semAcento(k)] || '';
  }

  /** Número no formato brasileiro (1.098,04; 6,000) ou, no documento com ponto decimal, 25.41. */
  function numero(t, pontoDecimal) {
    let s = String(t == null ? '' : t).trim().replace(/^R\$\s*/i, '').replace(/\s/g, '');
    if (!/\d/.test(s) || !/^-?[\d.,]+$/.test(s)) return NaN;
    if (pontoDecimal) s = s.replace(/,/g, '');
    else if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    return Number(s);
  }

  function perto(a, b) { return Math.abs(a - b) <= Math.max(0.05, Math.abs(b) * 0.002); }
  // quantidade × preço ≈ total, com o preço impresso arredondado ao centavo (até meio centavo por unidade)
  function confere(q, p, t) { return q > 0 && p > 0 && t > 0 && Math.abs(q * p - t) <= Math.max(0.05, t * 0.002, q * 0.0051); }
  function arred(v, d) { return U.round(v, d == null ? 2 : d); }

  /* ------------------------------------------------------------ registro */

  function novoItem(x) {
    return Object.assign({ id: 'it-' + U.uid(), codigo: '', descricao: '', marca: '', unidade: 'un', qtd: '', preco: '', total: '', equipamentoId: '' }, x || {});
  }

  function nova() {
    return {
      numero: '', data: U.todayISO(), situacao: 'cotacao', fornecedor: { nome: '', cnpj: '', telefone: '', cidade: '' },
      docFornecedor: '', vendedor: '', condicao: '', prazoEntrega: '', instalacaoId: '', itens: [],
      desconto: '', frete: '', outras: '', totalDocumento: '', observacoes: '', anexos: [], cadastradoEm: ''
    };
  }

  /** Total da linha: o impresso no documento ou quantidade × preço. */
  function totalItem(it) {
    const t = U.num(it && it.total);
    if (isFinite(t) && t > 0) return t;
    return arred(U.numOr(it && it.qtd, 0) * U.numOr(it && it.preco, 0));
  }

  /** Totais do pedido. fator = total ÷ soma dos itens (rateio de desconto, frete e outras despesas pelo valor de cada item). */
  function totais(c) {
    const itens = arred((c.itens || []).reduce(function (s, it) { return s + totalItem(it); }, 0));
    const desconto = U.numOr(c.desconto, 0), frete = U.numOr(c.frete, 0), outras = U.numOr(c.outras, 0);
    const total = arred(itens - desconto + frete + outras);
    return { itens: itens, desconto: desconto, frete: frete, outras: outras, total: total, fator: itens > 0 ? total / itens : 1 };
  }

  /**
   * Rateio do item pelo valor (CPC 16 — custo de aquisição): parte do desconto, do frete e das outras despesas do pedido,
   * custo total e unitário do item.
   */
  function rateio(c, it) {
    const t = totais(c);
    const v = totalItem(it), q = U.numOr(it.qtd, 0);
    const parte = function (x) { return t.itens > 0 ? arred(x * v / t.itens) : 0; };
    const r = { valor: v, desconto: parte(t.desconto), frete: parte(t.frete), outras: parte(t.outras) };
    r.custoTotal = arred(v * t.fator);
    r.custoUnit = q > 0 ? arred(v * t.fator / q, 4) : arred(U.numOr(it.preco, 0), 4);
    return r;
  }

  /** Custo unitário de aquisição do item (com o rateio, salvo ratear === false). */
  function custoUnitario(c, it, ratear) {
    const q = U.numOr(it.qtd, 0);
    if (!(q > 0)) return arred(U.numOr(it.preco, 0), 4);
    return arred(totalItem(it) * (ratear === false ? 1 : totais(c).fator) / q, 4);
  }

  /* ------------------------------------------------------------ leitura do texto do PDF (linhas e células do PDF.js) */

  // texto em negrito desenhado duas vezes vira "QtdQtd" ou "Prod DescriçãoProd Descrição"
  function desdobrar(t) {
    const s = String(t || '');
    if (s.length >= 4 && s.length % 2 === 0 && s.slice(0, s.length / 2) === s.slice(s.length / 2)) return s.slice(0, s.length / 2);
    return s;
  }

  const COLUNAS = {
    descricao: /descri|discrimina|especifica|produto/, marca: /^marca|fabric/, unidade: /^(und?|unid|unidade|u\.?m\.?|emb)(\.|$|\s)/,
    qtd: /^(qtd|qtde|quant|qde)/, preco: /pre[cç]o|unit/, total: /^(total|vl\.?\s*total|valor\s*total|vlr\.?\s*total)/, codigo: /^(c[oó]d|prod\b|ref|item)/
  };

  function cabecalho(l) {
    const col = {};
    l.celulas.forEach(function (c) {
      const t = semAcento(desdobrar(c.t)).trim();
      const meio = (c.x + (c.x2 || c.x)) / 2;
      Object.keys(COLUNAS).forEach(function (k) {
        if (col[k]) return;
        if (COLUNAS[k].test(t) || t.split(/\s+/).some(function (w) { return COLUNAS[k].test(w); })) col[k] = { x: c.x, x2: c.x2 || c.x, meio: meio };
      });
    });
    const n = ['descricao', 'qtd', 'preco', 'total', 'unidade', 'marca'].filter(function (k) { return col[k]; }).length;
    return n >= 3 && (col.qtd || col.total) ? col : null;
  }

  const FIM_ITENS = /^(t\s*o\s*t\s*a\s*i\s*s|totais|total|sub-?\s*total|valor\s*total|observa|obs\b|condi[cç])/;
  const RX_CNPJ = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/;

  /**
   * Linha de item: quantidade × preço ≈ total entre os números do fim da linha (descrição antes) ou quantidade no início e
   * preço e total no fim. Colunas numéricas depois do total (impostos da nota fiscal) e antes da quantidade (NCM, CFOP) ficam de fora.
   */
  function lerItem(l, col, pontoDecimal) {
    const toks = [];
    l.celulas.forEach(function (c, ci) { c.t.split(/\s+/).filter(Boolean).forEach(function (t) { toks.push({ t: t, ci: ci }); }); });
    const num = function (i) { return toks[i] ? numero(toks[i].t, pontoDecimal) : NaN; };
    const ehUn = function (i) { return !!toks[i] && !!unidade(toks[i].t) && !isFinite(num(i)); };
    let ini = toks.length;
    while (ini > 0 && toks.length - ini < 16 && (isFinite(num(ini - 1)) || ehUn(ini - 1) || toks[ini - 1].t === '%')) ini--;
    const nums = [];
    for (let i = ini; i < toks.length; i++) if (isFinite(num(i))) nums.push({ i: i, v: num(i) });
    let achado = null;
    for (let ti = nums.length - 1; ti >= Math.max(2, nums.length - 7) && !achado; ti--) {
      for (let pi = ti - 1; pi >= Math.max(1, ti - 3) && !achado; pi--) {
        for (let qi = pi - 1; qi >= Math.max(0, pi - 3) && !achado; qi--) {
          const q = nums[qi].v, p = nums[pi].v, t = nums[ti].v;
          if (confere(q, p, t)) achado = { q: nums[qi], p: nums[pi], t: nums[ti] };
        }
      }
    }
    let un = '', descToks;
    if (achado) {
      let iUn = -1;
      [achado.q.i - 1, achado.q.i + 1].forEach(function (i) { if (!un && i >= ini && ehUn(i)) { un = unidade(toks[i].t); iUn = i; } });
      descToks = toks.slice(0, Math.min(achado.q.i, iUn >= 0 ? iUn : Infinity));
    } else if (nums.length >= 2 && ini > 1) {
      // quantidade no início: "6 PC CONDULETE 1\" 7,81 46,84" (ou "1 6 PC …", com o nº do item antes)
      const p = nums[nums.length - 2], t = nums[nums.length - 1];
      [0, 1].some(function (qi) {
        const q = num(qi);
        if (!confere(q, p.v, t.v) || (qi === 1 && !isFinite(num(0)))) return false;
        let de = qi + 1;
        if (ehUn(de)) { un = unidade(toks[de].t); de++; }
        achado = { q: { i: qi, v: q }, p: p, t: t };
        descToks = toks.slice(de, Math.min(ini, p.i));
        return true;
      });
      if (!achado) return null;
    } else return null;
    // células da descrição (e a da marca, quando o cabeçalho tem a coluna)
    const antes = [];
    descToks.forEach(function (tk) {
      const ult = antes[antes.length - 1];
      if (ult && ult.ci === tk.ci) ult.t += ' ' + tk.t; else antes.push({ ci: tk.ci, t: tk.t });
    });
    // NCM, CST e CFOP da nota fiscal: células só com números entre a descrição e a quantidade
    while (antes.length > 1 && /^[\d\s./-]+$/.test(antes[antes.length - 1].t)) antes.pop();
    if (!antes.length) return null;
    let marca = '';
    if (col && col.marca && antes.length > 1) {
      const c = l.celulas[antes[antes.length - 1].ci];
      const meio = (c.x + (c.x2 || c.x)) / 2;
      const limite = col.descricao ? (col.descricao.meio + col.marca.meio) / 2 : col.marca.x - 30;
      if (meio > limite && /[A-Za-zÀ-ú]/.test(c.t)) marca = antes.pop().t;
    }
    // nº do item (célula própria ou antes do código) e código do produto (colado ou não à descrição)
    if (antes.length > 1 && /^\d{1,3}$/.test(antes[0].t)) antes.shift();
    let d = antes.map(function (a) { return a.t; }).join(' ').trim();
    if (/^\d{1,3}\s+\d/.test(d)) d = d.replace(/^\d{1,3}\s+/, '');
    let codigo = '';
    let m = d.match(/^(\d{1,3}(?:[.\-\/]\d+)+|\d{3,}(?:[.\-\/]\d+)*)(?=[A-Za-zÀ-ú"(])/);
    if (m) { codigo = m[1]; d = d.slice(m[1].length); }
    else if ((m = d.match(/^(\d{1,3}(?:[.\-\/]\d+)+|\d{4,})\s+(?=\S)/)) || (col && col.codigo && (m = d.match(/^([A-Za-z0-9]*\d[A-Za-z0-9.\-\/]*)\s+(?=\S)/)))) {
      codigo = m[1]; d = d.slice(m[0].length);
    }
    d = d.trim();
    if (!d || !/[A-Za-zÀ-ú]/.test(d)) return null;
    return novoItem({ codigo: codigo, descricao: d, marca: marca, unidade: un || 'un', qtd: achado.q.v, preco: achado.p.v, total: achado.t.v });
  }

  const TOTAIS = [
    ['totalProdutos', /total\s*(dos\s*)?(produtos|itens|mercadorias)|valor\s*(dos\s*)?produtos|sub-?\s*total/],
    ['servicos', /servi[cç]os?\s*adicionais/],
    ['desconto', /desconto/],
    ['frete', /frete/],
    ['outras', /out(ras|r)?\.?\s*desp|despesas\s*acess|acr[eé]scimo/],
    ['totalGeral', /total\s*geral|total\s*(do\s*)?pedido|valor\s*total|total\s*a\s*pagar|total\s*l[ií]quido|total\s*da\s*(nota|proposta|compra)/]
  ];

  /** Valores dos totais: na mesma célula, na célula seguinte ou na linha de baixo (alinhado pela coluna). */
  function lerTotais(linhas, de, pontoDecimal) {
    const res = {};
    for (let li = de; li < linhas.length; li++) {
      const l = linhas[li];
      l.celulas.forEach(function (c, ci) {
        const t = semAcento(desdobrar(c.t));
        const par = TOTAIS.find(function (x) { return x[1].test(t); });
        if (par) {
          const k = par[0];
          const m = t.match(par[1]);
          if ((res[k] != null && k !== 'totalGeral') || /%/.test(t)) return;
          let v = NaN;
          const resto = t.slice(m.index + m[0].length).replace(/^[\s:.(r$)]*/, '');
          if (resto) v = numero(resto.split(/\s+/)[0], pontoDecimal);
          if (!isFinite(v) && l.celulas[ci + 1]) v = numero(l.celulas[ci + 1].t, pontoDecimal);
          if (!isFinite(v)) {
            const meio = (c.x + (c.x2 || c.x)) / 2;
            for (let lj = li + 1; lj <= li + 2 && lj < linhas.length && !isFinite(v); lj++) {
              let melhor = null;
              linhas[lj].celulas.forEach(function (cc) {
                const n = numero(cc.t, pontoDecimal);
                if (!isFinite(n)) return;
                const dist = Math.abs((cc.x + (cc.x2 || cc.x)) / 2 - meio);
                if (dist <= 90 && (!melhor || dist < melhor.d)) melhor = { d: dist, v: n };
              });
              if (melhor) v = melhor.v;
            }
          }
          if (isFinite(v)) res[k] = v;
        }
      });
    }
    return res;
  }

  function dataISO(t) {
    const m = String(t || '').match(/(\d{2})\/(\d{2})\/(\d{2,4})/);
    if (!m) return '';
    const a = m[3].length === 2 ? '20' + m[3] : m[3];
    return a + '-' + m[2] + '-' + m[1];
  }

  function depoisDe(texto, rx) {
    const m = texto.match(rx);
    if (!m) return '';
    return texto.slice(m.index + m[0].length).replace(/^[\s:|]*/, '').split('|')[0].trim();
  }

  /** Fornecedor (emitente): o bloco do primeiro CNPJ antes dos dados do cliente. */
  function lerFornecedor(textos) {
    const forn = { nome: '', cnpj: '', telefone: '', cidade: '' };
    const iCli = textos.findIndex(function (t) { return /\b(cliente|destinat[aá]rio|comprador|faturar\s*para)\b/i.test(t); });
    const fim = iCli >= 0 ? iCli : Math.min(textos.length, 12);
    let i = -1;
    for (let k = 0; k < fim; k++) { if (RX_CNPJ.test(textos[k])) { i = k; break; } }
    const nomeValido = function (t) {
      return /[A-Za-zÀ-ú]{3}/.test(t) && !/(emitid|p[aá]gina|data|cnpj|cpf|inscri|endere|bairro|cep\b|fone|e-?mail|www\.|vendedor)/i.test(t) && !/\d{2}\/\d{2}\/\d{2,4}/.test(t);
    };
    const limpar = function (t) { return t.split('|')[0].replace(/^\s*\d+\s*[-–]\s*/, '').replace(/\s+/g, ' ').trim(); };
    if (i >= 0) {
      forn.cnpj = textos[i].match(RX_CNPJ)[0];
      const antes = textos[i].split(/cnpj/i)[0].replace(/[|:\s]+$/, '');
      if (nomeValido(antes)) forn.nome = limpar(antes);
      for (let k = i - 1; k >= Math.max(0, i - 3) && !forn.nome; k--) if (nomeValido(textos[k])) forn.nome = limpar(textos[k]);
    } else {
      const k = textos.slice(0, fim).findIndex(nomeValido);
      if (k >= 0) forn.nome = limpar(textos[k]);
    }
    const bloco = textos.slice(Math.max(0, i), fim);
    bloco.forEach(function (t) {
      if (!forn.telefone) { const m = t.match(/(fone|tel(efone)?|whats\w*|cel(ular)?)\s*[:.]?\s*(\(?\d{2}\)?\s*\d{4,5}[-.\s]?\d{4})/i); if (m) forn.telefone = m[4].trim(); }
      if (!forn.cidade) { const v = depoisDe(t, /cidade\s*:?/i); if (v) forn.cidade = v; }
    });
    return forn;
  }

  /**
   * Lê o orçamento ou pedido a partir das linhas do PDF ({celulas: [{t, x, x2}]}). Devolve os campos do pedido, os itens e os
   * totais impressos (sem conciliar: ver conciliar()).
   */
  function lerLinhas(linhas) {
    const ls = (linhas || []).filter(function (l) { return l && l.celulas && l.celulas.length; });
    const textos = ls.map(function (l) { return l.celulas.map(function (c) { return c.t; }).join(' | '); });
    const tudo = textos.join('\n');
    // documento com ponto decimal (25.41) e sem vírgula decimal (25,41)
    const pontoDecimal = !/\d,\d{2}\b/.test(tudo) && /\d\.\d{2}\b/.test(tudo);
    let iCab = -1, col = null;
    for (let i = 0; i < ls.length && !col; i++) { col = cabecalho(ls[i]); if (col) iCab = i; }
    const itens = [], linhaDe = [];
    let iFim = -1;
    for (let i = iCab + 1; i < ls.length; i++) {
      const prim = semAcento(desdobrar(ls[i].celulas[0].t)).trim();
      if (itens.length && FIM_ITENS.test(prim)) { iFim = i; break; }
      const it = lerItem(ls[i], col, pontoDecimal);
      if (it) { itens.push(it); linhaDe.push(i); continue; }
      // descrição quebrada em duas linhas: texto sem números entre itens, na coluna da descrição
      if (itens.length && col && i - linhaDe[linhaDe.length - 1] === 1) {
        const l = ls[i], c0 = l.celulas[0];
        const naColuna = col.descricao ? c0.x >= col.descricao.x - 15 && c0.x < (col.marca || col.unidade || col.qtd || { x: Infinity }).x - 10 : false;
        const proxEhItem = ls[i + 1] && lerItem(ls[i + 1], col, pontoDecimal);
        if (naColuna && l.celulas.length === 1 && !/\d+[.,]\d{2}\b/.test(c0.t) && proxEhItem) itens[itens.length - 1].descricao += ' ' + c0.t.trim();
      }
    }
    const tot = lerTotais(ls, iFim >= 0 ? iFim : (linhaDe.length ? linhaDe[linhaDe.length - 1] + 1 : 0), pontoDecimal);
    let doc = '';
    textos.some(function (t) {
      const m = t.match(/\b(or[cç]amento|pedido|cota[cç][aã]o|proposta)\s*(n[º°o.]*|n[uú]mero)?\s*[:#]\s*([A-Za-z0-9][\w.\-\/]*)/i);
      if (m && /\d/.test(m[3])) { doc = m[3]; return true; }
      return false;
    });
    let data = '';
    [/data\s*(de\s*)?(emiss[aã]o|do\s*pedido|do\s*or[cç]amento|da\s*proposta)\s*:?/i, /emitid[oa]\s*em\s*:?/i, /emiss[aã]o\s*:?/i, /\bdata\s*:?/i].some(function (rx) {
      return textos.some(function (t) { const v = dataISO(depoisDe(t, rx).slice(0, 12)); if (v) { data = v; return true; } return false; });
    });
    if (!data) { const m = tudo.match(/\d{2}\/\d{2}\/\d{4}/); if (m) data = dataISO(m[0]); }
    const achar = function (rx) { let v = ''; textos.some(function (t) { v = depoisDe(t, rx); return !!v; }); return v; };
    return {
      fornecedor: lerFornecedor(textos), docFornecedor: doc, data: data,
      vendedor: achar(/vendedor(a)?\s*:/i), condicao: achar(/condi[cç][aã]o\s*(de\s*)?pagamento\s*:?/i), prazoEntrega: achar(/prazo\s*(de\s*)?entrega\s*:?/i),
      itens: itens,
      totalProdutos: tot.totalProdutos, desconto: tot.desconto, frete: tot.frete, outras: tot.outras, servicos: tot.servicos, totalGeral: tot.totalGeral,
      avisos: col ? [] : ['Cabeçalho da tabela de itens não identificado: confira descrição e marca de cada item.']
    };
  }

  /**
   * Concilia itens e totais impressos: quando a soma dos itens já é o total do pedido, o desconto (ou o frete) está nos preços e
   * não entra de novo. Devolve {desconto, frete, outras, totalDocumento, avisos}.
   */
  function conciliar(l) {
    const soma = arred((l.itens || []).reduce(function (s, it) { return s + totalItem(it); }, 0));
    const n = function (v) { const x = U.num(v); return isFinite(x) ? x : 0; };
    const tg = n(l.totalGeral), tp = n(l.totalProdutos), d = n(l.desconto), f = n(l.frete), o = n(l.outras) + n(l.servicos);
    const avisos = [];
    let desc = d, fre = f, out = o;
    if (tg > 0 && perto(soma, tg)) {
      if (d > 0) avisos.push('O desconto de ' + U.brl(d) + ' já está nos preços dos itens (a soma dos itens é igual ao total do pedido).');
      else if (f > 0 || o > 0) avisos.push('Frete e despesas já estão nos preços dos itens (a soma dos itens é igual ao total do pedido).');
      desc = 0; fre = 0; out = 0;
    } else if (tp > 0 && !perto(soma, tp)) {
      avisos.push('A soma dos itens lidos (' + U.brl(soma) + ') difere do total dos produtos no documento (' + U.brl(tp) + '): confira se algum item ficou de fora ou foi lido errado.');
    }
    const calc = arred(soma - desc + fre + out);
    if (tg > 0 && !perto(calc, tg)) avisos.push('O total calculado (' + U.brl(calc) + ') difere do total do documento (' + U.brl(tg) + '). Confira desconto, frete e despesas.');
    return { desconto: desc || '', frete: fre || '', outras: out || '', totalDocumento: tg || '', avisos: avisos };
  }

  /** Aplica a leitura (local ou da IA) ao pedido: substitui os itens e completa os campos vazios. */
  function aplicarLeitura(c, lido, acrescentar) {
    const k = conciliar(lido);
    c.itens = (acrescentar ? c.itens : []).concat((lido.itens || []).map(function (it) { return novoItem(it); }));
    const f = lido.fornecedor || {};
    c.fornecedor = c.fornecedor || {};
    ['nome', 'cnpj', 'telefone', 'cidade'].forEach(function (x) { if (!c.fornecedor[x] && f[x]) c.fornecedor[x] = f[x]; });
    if (!c.docFornecedor && lido.docFornecedor) c.docFornecedor = lido.docFornecedor;
    if (lido.data) c.data = lido.data;
    ['vendedor', 'condicao', 'prazoEntrega'].forEach(function (x) { if (!c[x] && lido[x]) c[x] = lido[x]; });
    if (!acrescentar) { c.desconto = k.desconto; c.frete = k.frete; c.outras = k.outras; c.totalDocumento = k.totalDocumento; }
    return k.avisos.concat(lido.avisos || []);
  }

  /* ------------------------------------------------------------ cadastro de materiais */

  function palavras(s) { return semAcento(s).replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean); }

  /** Semelhança entre descrições (Dice das palavras; prefixos com 5+ letras contam: condulet × condulete). */
  function semelhanca(a, b) {
    const pa = palavras(a), pb = palavras(b);
    if (!pa.length || !pb.length) return 0;
    const usadas = {};
    let comum = 0;
    pa.forEach(function (w) {
      const j = pb.findIndex(function (x, k) { return !usadas[k] && (x === w || (Math.min(x.length, w.length) >= 5 && (x.indexOf(w) === 0 || w.indexOf(x) === 0))); });
      if (j >= 0) { usadas[j] = true; comum++; }
    });
    return 2 * comum / (pa.length + pb.length);
  }

  function materiais(equipamentos) { return (equipamentos || []).filter(function (e) { return e.tipo === 'material'; }); }

  /** Material do cadastro que corresponde ao item: o já vinculado, o mesmo código do fornecedor, a mesma descrição ou a mais parecida. */
  function sugerir(it, c, equipamentos) {
    const mats = materiais(equipamentos);
    if (it.equipamentoId) { const e = mats.find(function (x) { return x.id === it.equipamentoId; }); if (e) return { eq: e, nota: 1 }; }
    const forn = semAcento(c && c.fornecedor && c.fornecedor.nome).trim();
    if (it.codigo && forn) {
      const e = mats.find(function (x) { return x.codigoFornecedor && String(x.codigoFornecedor) === String(it.codigo) && semAcento(x.fornecedor).trim() === forn; });
      if (e) return { eq: e, nota: 1 };
    }
    let melhor = null;
    mats.forEach(function (e) {
      const nota = semelhanca(it.descricao, e.descricao);
      if (!melhor || nota > melhor.nota) melhor = { eq: e, nota: nota };
    });
    return melhor && melhor.nota >= 0.75 ? melhor : null;
  }

  /**
   * Registros do cadastro de materiais para os itens escolhidos. escolhas: [{item, destino: 'novo' | id do material}].
   * o: {ratear (padrão true), atualizarPreco, infraCA}. Vincula cada item ao material (item.equipamentoId).
   */
  function paraCadastro(c, escolhas, equipamentos, o) {
    o = o || {};
    const regs = {}, ordem = [];
    let novos = 0, atualizados = 0;
    (escolhas || []).forEach(function (es) {
      const it = es.item;
      if (!es.destino || !it) return;
      const custo = custoUnitario(c, it, o.ratear !== false);
      const un = unidade(it.unidade) || it.unidade || 'un';
      let reg;
      if (es.destino === 'novo') {
        reg = {
          id: U.uid(), tipo: 'material', uso: 'ambas', ativo: true, descricao: String(it.descricao || '').trim(), fabricante: it.marca || '',
          unidade: un, regra: 'fixa', fator: 1, aplicaEm: 'ambos', garantia: 'Conforme fabricante', preco: arred(custo), autoIncluir: false, infraCA: !!o.infraCA
        };
        novos++;
      } else {
        reg = regs[es.destino];
        if (!reg) {
          const e = materiais(equipamentos).find(function (x) { return x.id === es.destino; });
          if (!e) return;
          reg = U.clone(e);
          atualizados++;
        }
        if (o.atualizarPreco) reg.preco = arred(custo);
        if (!reg.fabricante && it.marca) reg.fabricante = it.marca;
      }
      reg.custo = custo;
      reg.custoEm = c.data || U.todayISO();
      reg.custoAtualizadoEm = new Date().toISOString(); // as propostas em aberto acompanham o custo novo ao serem abertas
      reg.fornecedor = (c.fornecedor && c.fornecedor.nome) || reg.fornecedor || '';
      if (it.codigo) reg.codigoFornecedor = it.codigo;
      const hist = { compraId: c.id || '', numero: c.numero || '', data: c.data || '', fornecedor: reg.fornecedor, custo: custo, qtd: U.numOr(it.qtd, 0), unidade: un };
      reg.compras = [hist].concat((reg.compras || []).filter(function (x) { return !hist.compraId || x.compraId !== hist.compraId; })).slice(0, 10);
      it.equipamentoId = reg.id;
      if (!regs[reg.id]) { regs[reg.id] = reg; ordem.push(reg.id); }
    });
    return { registros: ordem.map(function (id) { return regs[id]; }), novos: novos, atualizados: atualizados };
  }

  function rotulo(id) { return (SITUACOES.find(function (s) { return s.id === id; }) || SITUACOES[0]).label; }

  App.Compra = {
    SITUACOES: SITUACOES, nova: nova, novoItem: novoItem, totalItem: totalItem, totais: totais, custoUnitario: custoUnitario, rateio: rateio,
    unidade: unidade, numero: numero, lerLinhas: lerLinhas, conciliar: conciliar, aplicarLeitura: aplicarLeitura,
    semelhanca: semelhanca, sugerir: sugerir, paraCadastro: paraCadastro, rotulo: rotulo, semAcento: semAcento
  };
})(window.App);
