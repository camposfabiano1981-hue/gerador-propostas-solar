/*
 * Geração da proposta em PDF a partir do mesmo modelo usado no .docx (js/documento.js),
 * reproduzindo a paginação do Word: capa sem cabeçalho, páginas internas com cabeçalho (logo + referência)
 * e rodapé, títulos com filete, tabelas zebradas com cabeçalho repetido a cada página.
 *
 * Usa jsPDF (carregado sob demanda) e a fonte Arimo — métrica idêntica à Arial do modelo.
 * Emojis e símbolos ausentes na fonte são desenhados como imagem com a fonte do sistema.
 */
window.App = window.App || {};

(function (App) {
  'use strict';

  const U = App.U;

  const JSPDF_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
  const FONTES = {
    normal: 'https://cdn.jsdelivr.net/npm/@expo-google-fonts/arimo@0.4.2/400Regular/Arimo_400Regular.ttf',
    bold: 'https://cdn.jsdelivr.net/npm/@expo-google-fonts/arimo@0.4.2/700Bold/Arimo_700Bold.ttf',
    italic: 'https://cdn.jsdelivr.net/npm/@expo-google-fonts/arimo@0.4.2/400Regular_Italic/Arimo_400Regular_Italic.ttf',
    bolditalic: 'https://cdn.jsdelivr.net/npm/@expo-google-fonts/arimo@0.4.2/700Bold_Italic/Arimo_700Bold_Italic.ttf'
  };
  const ESTILOS = ['normal', 'bold', 'italic', 'bolditalic'];
  const FAMILIA = 'Arimo';
  const ALTURA_LINHA = 1.15;   // espaçamento simples da Arial no Word
  const ASCENDENTE = 0.905;

  /* ------------------------------------------------------------ carregamento sob demanda */

  let promessaJsPDF = null;
  let promessaFontes = null;

  function carregarScript(src) {
    return new Promise(function (res, rej) {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.crossOrigin = 'anonymous';
      s.onload = function () { res(); };
      s.onerror = function () { s.remove(); rej(new Error('falha ao carregar ' + src)); };
      document.head.appendChild(s);
    });
  }

  function carregarJsPDF() {
    if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
    if (!promessaJsPDF) {
      promessaJsPDF = carregarScript(JSPDF_URL).then(function () {
        if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('jsPDF indisponível');
        return window.jspdf.jsPDF;
      }).catch(function (e) {
        promessaJsPDF = null;
        throw new Error('Não foi possível carregar o gerador de PDF. Verifique a conexão com a internet e tente novamente. (' + e.message + ')');
      });
    }
    return promessaJsPDF;
  }

  function paraBase64(ab) {
    const bytes = new Uint8Array(ab);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  /** Baixa a fonte Arimo (uma vez por sessão). Sem internet, retorna null e o PDF usa Helvetica. */
  function carregarFontes() {
    if (!promessaFontes) {
      promessaFontes = Promise.all(ESTILOS.map(function (k) {
        return fetch(FONTES[k]).then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.arrayBuffer();
        }).then(paraBase64);
      })).then(function (b) { const o = {}; ESTILOS.forEach(function (k, i) { o[k] = b[i]; }); return o; })
        .catch(function (e) { console.warn('Fonte Arimo indisponível; usando Helvetica.', e); promessaFontes = null; return null; });
    }
    return promessaFontes;
  }

  /* ------------------------------------------------------------ utilitários */

  function rgb(hex) {
    const h = String(hex || '000000').replace('#', '');
    const v = h === 'auto' ? '000000' : h;
    return [parseInt(v.slice(0, 2), 16) || 0, parseInt(v.slice(2, 4), 16) || 0, parseInt(v.slice(4, 6), 16) || 0];
  }

  const SEGMENTADOR = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('pt-BR', { granularity: 'grapheme' }) : null;
  function grafemas(s) {
    if (SEGMENTADOR) return Array.from(SEGMENTADOR.segment(s), function (x) { return x.segment; });
    return Array.from(s);
  }

  const RE_EMOJI = /\p{Extended_Pictographic}/u;

  /* ------------------------------------------------------------ renderizador */

  function Render(doc, modelo, recursos, fonteOk) {
    this.doc = doc;
    this.m = modelo;
    this.rec = recursos;
    this.fam = fonteOk ? FAMILIA : 'helvetica';
    this.pw = modelo.papel.w / 20;
    this.ph = modelo.papel.h / 20;
    const mg = modelo.margens || { top: 1080, right: 1440, bottom: 1080, left: 1440, header: 708, footer: 708 };
    const mc = modelo.margensCapa || { top: 720, bottom: 720 };
    this.mg = { top: mg.top / 20, right: mg.right / 20, bottom: mg.bottom / 20, left: mg.left / 20, header: mg.header / 20, footer: mg.footer / 20 };
    this.mgCapa = { top: mc.top / 20, bottom: mc.bottom / 20 };
    this.ml = this.mg.left;
    this.cw = this.pw - this.mg.left - this.mg.right;
    this.k = modelo.k;
    this.glifos = {};
    this.mapa = null;
    if (fonteOk) {
      try {
        doc.setFont(FAMILIA, 'normal');
        const f = doc.getFont();
        const cm = f && f.metadata && f.metadata.cmap && f.metadata.cmap.unicode && f.metadata.cmap.unicode.codeMap;
        if (cm && Object.keys(cm).length) this.mapa = cm;
      } catch (e) { /* mapa indisponível: usa heurística */ }
    }
    this.fonteOk = fonteOk;
    this.capa = modelo.corpo.some(function (n) { return n.po && n.po.sectPr; });
    this.y = this.mgCapa.top;
    if (!this.capa) {
      this.desenharCabecalhoRodape();
      this.y = this.topoConteudo();
    }
  }

  /** O caractere pode ser desenhado com a fonte do PDF? */
  Render.prototype.suporta = function (g) {
    if (g.length !== 1 && !(g.length === 2 && g.codePointAt(0) > 0xFFFF)) return false; // sequências (emoji + VS16, ZWJ)
    const cp = g.codePointAt(0);
    if (cp === 0x20 || cp === 0xA0) return true;
    if (RE_EMOJI.test(g)) return false;
    if (!this.fonteOk) return cp >= 0x20 && cp <= 0xFF && !(cp >= 0x7F && cp <= 0x9F);
    if (this.mapa) return !!this.mapa[cp];
    return cp < 0x2190 || (cp >= 0x2500 && cp <= 0x257F);
  };

  /** Glifo desenhado em canvas com a fonte do sistema (emojis e símbolos). */
  Render.prototype.glifo = function (g, cor) {
    const emoji = RE_EMOJI.test(g);
    const chave = g + '|' + (emoji ? '' : cor);
    if (this.glifos[chave]) return this.glifos[chave];
    const px = 64;
    const fonte = px + 'px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji","Segoe UI Symbol","Segoe UI",Arial,sans-serif';
    const cv = document.createElement('canvas');
    const ctx = cv.getContext('2d');
    ctx.font = fonte;
    const largura = Math.max(1, ctx.measureText(g).width);
    cv.width = Math.ceil(largura) + 4;
    cv.height = Math.ceil(px * 1.25);
    ctx.font = fonte;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#' + (cor || '000000');
    ctx.fillText(g, 2, px * 0.98);
    const info = { url: cv.toDataURL('image/png'), wEm: cv.width / px, hEm: cv.height / px, baseEm: 0.98, alias: 'g' + Object.keys(this.glifos).length };
    this.glifos[chave] = info;
    return info;
  };

  Render.prototype.fonte = function (estilo) {
    this.doc.setFont(this.fam, estilo.b && estilo.i ? 'bolditalic' : (estilo.b ? 'bold' : (estilo.i ? 'italic' : 'normal')));
    this.doc.setFontSize(estilo.tam);
  };

  Render.prototype.larguraTexto = function (s, estilo) {
    this.fonte(estilo);
    return this.doc.getTextWidth(s.replace(/ /g, ' '));
  };

  /** Quebra um trecho de palavra em peças de texto (fonte) e glifos (imagem). */
  Render.prototype.pecas = function (s, estilo) {
    const out = [];
    let buf = '';
    const self = this;
    const fechar = function () {
      if (buf) { out.push({ tipo: 't', s: buf, estilo: estilo, w: self.larguraTexto(buf, estilo) }); buf = ''; }
    };
    grafemas(s).forEach(function (g) {
      if (g === '️') return;
      if (self.suporta(g)) { buf += g; return; }
      fechar();
      const gl = self.glifo(g.replace(/️/g, '') || g, estilo.cor);
      out.push({ tipo: 'g', s: g, estilo: estilo, gl: gl, w: gl.wEm * estilo.tam * 0.9 });
    });
    fechar();
    return out;
  };

  /** Converte runs em linhas quebradas pela largura disponível. */
  Render.prototype.linhas = function (runs, larg) {
    const self = this;
    const duras = [[]];
    runs.forEach(function (run) {
      const ro = run.ro || {};
      const estilo = { b: !!ro.b, i: !!ro.i, u: !!ro.u, cor: ro.color || '000000', tam: (ro.sz || 20) / 2 };
      const texto = String(run.texto).replace(/R\$ (?=-?\d)/g, 'R$ ');
      texto.split('\n').forEach(function (parte, i) {
        if (i > 0) duras.push([]);
        const alvo = duras[duras.length - 1];
        alvo.tamPadrao = estilo.tam;
        parte.split(/( +)/).forEach(function (seg) {
          if (!seg) return;
          if (/^ +$/.test(seg)) { alvo.push({ tipo: 'esp', s: seg, estilo: estilo, w: self.larguraTexto(seg, estilo) }); return; }
          seg.split(/(?<=-)/).forEach(function (sub) {
            const pc = self.pecas(sub, estilo);
            alvo.push({ tipo: 'pal', pecas: pc, w: pc.reduce(function (a, x) { return a + x.w; }, 0), tam: estilo.tam });
          });
        });
      });
    });

    const res = [];
    duras.forEach(function (toks) {
      let lin = { itens: [], w: 0, tam: toks.tamPadrao || 10 };
      let primeira = true;
      const fecharLinha = function () {
        while (lin.itens.length && lin.itens[lin.itens.length - 1].tipo === 'esp') lin.w -= lin.itens.pop().w;
        res.push(lin);
        lin = { itens: [], w: 0, tam: toks.tamPadrao || 10 };
        primeira = false;
      };
      toks.forEach(function (tk) {
        if (tk.tipo === 'esp') {
          if (!lin.itens.length && !primeira) return;
          lin.itens.push(tk); lin.w += tk.w; return;
        }
        if (lin.itens.some(function (x) { return x.tipo === 'pal'; }) && lin.w + tk.w > larg + 0.01) fecharLinha();
        if (tk.w > larg + 0.01) {
          // palavra maior que a linha: quebra por caractere
          tk.pecas.forEach(function (pc) {
            const partes = pc.tipo === 't' ? grafemas(pc.s) : [pc.s];
            partes.forEach(function (ch) {
              const w = pc.tipo === 't' ? self.larguraTexto(ch, pc.estilo) : pc.w;
              if (lin.w + w > larg + 0.01 && lin.itens.length) fecharLinha();
              lin.itens.push({ tipo: 'pal', pecas: [Object.assign({}, pc, { s: ch, w: w })], w: w, tam: pc.estilo.tam });
              lin.w += w; lin.tam = Math.max(lin.tam, pc.estilo.tam);
            });
          });
          return;
        }
        lin.itens.push(tk); lin.w += tk.w; lin.tam = Math.max(lin.tam, tk.tam);
      });
      fecharLinha();
    });
    return res;
  };

  Render.prototype.desenharLinha = function (lin, x, larg, jc, topo) {
    const doc = this.doc;
    const base = topo + lin.tam * ASCENDENTE + (lin.tam * (ALTURA_LINHA - 1.117)) / 2;
    let cx = x;
    if (jc === 'center') cx = x + (larg - lin.w) / 2;
    else if (jc === 'right') cx = x + larg - lin.w;
    const self = this;
    // agrupa trechos consecutivos com o mesmo estilo num único texto (PDF menor e texto selecionável por frase)
    let buf = '', est = null, bx = 0;
    const mesmo = function (a, b) { return a && b && a.b === b.b && a.i === b.i && a.u === b.u && a.cor === b.cor && a.tam === b.tam; };
    const despejar = function () {
      if (buf && est && buf.trim()) {
        self.fonte(est);
        const c = rgb(est.cor);
        const txt = buf.replace(/ /g, ' ');
        doc.setTextColor(c[0], c[1], c[2]);
        doc.text(txt, bx, base);
        if (est.u) {
          const wTxt = doc.getTextWidth(txt.replace(/\s+$/, ''));
          doc.setDrawColor(c[0], c[1], c[2]);
          doc.setLineWidth(Math.max(0.4, est.tam * 0.06));
          doc.line(bx, base + est.tam * 0.12, bx + wTxt, base + est.tam * 0.12);
        }
      }
      buf = ''; est = null;
    };
    lin.itens.forEach(function (tk) {
      if (tk.tipo === 'esp') {
        if (buf && mesmo(est, tk.estilo)) buf += tk.s;
        else despejar();
        cx += tk.w;
        return;
      }
      tk.pecas.forEach(function (pc) {
        if (pc.tipo === 't') {
          if (!buf || !mesmo(est, pc.estilo)) { despejar(); est = pc.estilo; bx = cx; }
          buf += pc.s;
        } else {
          despejar();
          const t = pc.estilo.tam * 0.9;
          doc.addImage(pc.gl.url, 'PNG', cx, base - pc.gl.baseEm * t, pc.gl.wEm * t, pc.gl.hEm * t, pc.gl.alias);
        }
        cx += pc.w;
      });
    });
    despejar();
  };

  /* ---------- parágrafos */

  function filhosRun(no) { return no.filhos.filter(function (f) { return f.tipo === 'r'; }); }
  function filhoImg(no) { return no.filhos.find(function (f) { return f.tipo === 'img'; }); }

  Render.prototype.medirParagrafo = function (no, larg) {
    const po = no.po || {};
    const img = filhoImg(no);
    const linhas = img ? [] : this.linhas(filhosRun(no), larg - (po.ind ? po.ind / 20 : 0));
    let h = (po.before || 0) / 20 + (po.after || 0) / 20;
    if (po.top) h += po.top.sz / 8 + (po.top.space || 0);
    if (po.bottom) h += po.bottom.sz / 8 + (po.bottom.space || 0);
    if (img) h += img.cy / 12700;
    else if (!linhas.length || (linhas.length === 1 && !linhas[0].itens.length)) h += 10 * ALTURA_LINHA;
    else linhas.forEach(function (l) { h += l.tam * ALTURA_LINHA; });
    return { h: h, linhas: linhas, img: img };
  };

  /** Desenha um parágrafo. Com `fluxo`, quebra de página entre linhas quando necessário. */
  Render.prototype.paragrafo = function (no, x, larg, y, fluxo, medida) {
    const doc = this.doc;
    const po = no.po || {};
    if (po.ind) { x += po.ind / 20; larg -= po.ind / 20; }
    const med = medida || this.medirParagrafo(no, larg);
    y += (po.before || 0) / 20;
    if (po.top) {
      const bw = po.top.sz / 8, c = rgb(po.top.color);
      doc.setDrawColor(c[0], c[1], c[2]); doc.setLineWidth(bw);
      doc.line(x, y + bw / 2, x + larg, y + bw / 2);
      y += bw + (po.top.space || 0);
    }
    const desenharFaixa = function (topo, altura) {
      if (po.shd) {
        const c = rgb(po.shd);
        doc.setFillColor(c[0], c[1], c[2]);
        const esq = po.left ? (po.left.space || 0) + po.left.sz / 8 : 0;
        doc.rect(x - esq, topo, larg + esq, altura, 'F');
      }
      if (po.left) {
        const bw = po.left.sz / 8, c2 = rgb(po.left.color);
        doc.setDrawColor(c2[0], c2[1], c2[2]); doc.setLineWidth(bw);
        const lx = x - (po.left.space || 0) - bw / 2;
        doc.line(lx, topo, lx, topo + altura);
      }
    };
    if (med.img) {
      const w = med.img.cx / 12700, hh = med.img.cy / 12700;
      if (fluxo && y + hh > this.limite()) { this.novaPagina(); y = this.y; }
      let ix = x;
      if (po.jc === 'center') ix = x + (larg - w) / 2; else if (po.jc === 'right') ix = x + larg - w;
      const rec = this.rec[med.img.ref];
      doc.addImage(rec.url, rec.formato, ix, y, w, hh, med.img.ref);
      y += hh;
    } else if (!med.linhas.length || (med.linhas.length === 1 && !med.linhas[0].itens.length)) {
      const hh = 10 * ALTURA_LINHA;
      desenharFaixa(y, hh);
      y += hh;
    } else {
      for (let i = 0; i < med.linhas.length; i++) {
        const l = med.linhas[i];
        const hh = l.tam * ALTURA_LINHA;
        if (fluxo && y + hh > this.limite()) { this.novaPagina(); y = this.y; }
        desenharFaixa(y, hh);
        this.desenharLinha(l, x, larg, po.jc, y);
        y += hh;
      }
    }
    if (po.bottom) {
      y += po.bottom.space || 0;
      const bw = po.bottom.sz / 8, c = rgb(po.bottom.color);
      doc.setDrawColor(c[0], c[1], c[2]); doc.setLineWidth(bw);
      doc.line(x, y + bw / 2, x + larg, y + bw / 2);
      y += bw;
    }
    return y + (po.after || 0) / 20;
  };

  /* ---------- tabelas */

  function margens(o) {
    if (o.mar) return { t: o.mar.t / 20, b: o.mar.b / 20, l: o.mar.l / 20, r: o.mar.r / 20 };
    if (o.simples || o.semBorda) return { t: 0, b: 0, l: 0.5, r: 0.5 };
    return { t: 4, b: 4, l: 6, r: 6 };
  }

  /** Largura da maior palavra (trecho sem quebra) do parágrafo. */
  Render.prototype.maiorPalavra = function (p) {
    const img = filhoImg(p);
    if (img) return img.cx / 12700;
    const self = this;
    let max = 0;
    filhosRun(p).forEach(function (run) {
      const ro = run.ro || {};
      const estilo = { b: !!ro.b, i: !!ro.i, cor: ro.color || '000000', tam: (ro.sz || 20) / 2 };
      String(run.texto).replace(/R\$ (?=-?\d)/g, 'R$ ').split(/[ \n]+/).forEach(function (pal) {
        pal.split(/(?<=-)/).forEach(function (seg) {
          if (!seg) return;
          const w = self.pecas(seg, estilo).reduce(function (a, x) { return a + x.w; }, 0);
          if (w > max) max = w;
        });
      });
    });
    return max;
  };

  /**
   * Larguras das colunas em pt, com o "ajuste automático" do Word: uma coluna nunca fica mais estreita
   * que sua maior palavra; o excesso é retirado das colunas com folga.
   */
  Render.prototype.colunas = function (no) {
    if (no._cols) return no._cols;
    const k = this.k;
    const self = this;
    const cols = no.larguras.map(function (w) { return (w * k) / 20; });
    const minimos = cols.map(function () { return 0; });
    no.linhas.forEach(function (tr) {
      let ci = 0;
      tr.celulas.forEach(function (tc) {
        const span = tc.o.span || 1;
        if (span === 1) {
          const m = margens(tc.o);
          tc.filhos.forEach(function (p) { minimos[ci] = Math.max(minimos[ci], self.maiorPalavra(p) + m.l + m.r + 0.5); });
        }
        ci += span;
      });
    });
    let deficit = 0;
    cols.forEach(function (w, i) { if (minimos[i] > w) { deficit += minimos[i] - w; cols[i] = minimos[i]; } });
    if (deficit > 0) {
      const folgas = cols.map(function (w, i) { return Math.max(0, w - minimos[i]); });
      const total = folgas.reduce(function (a, b) { return a + b; }, 0);
      if (total > 0) cols.forEach(function (w, i) { cols[i] -= Math.min(folgas[i], deficit * folgas[i] / total); });
    }
    no._cols = cols;
    return cols;
  };

  Render.prototype.medirLinha = function (tr, cols) {
    const self = this;
    let col = 0, h = 0;
    const cel = tr.celulas.map(function (tc) {
      const span = tc.o.span || 1;
      const w = cols.slice(col, col + span).reduce(function (a, b) { return a + b; }, 0);
      const m = margens(tc.o);
      const medidas = tc.filhos.map(function (p) { return self.medirParagrafo(p, w - m.l - m.r); });
      const ch = medidas.reduce(function (a, md) { return a + md.h; }, 0) + m.t + m.b;
      const x = cols.slice(0, col).reduce(function (a, b) { return a + b; }, 0);
      col += span;
      h = Math.max(h, ch);
      return { tc: tc, x: x, w: w, m: m, medidas: medidas, h: ch };
    });
    return { h: h, cel: cel };
  };

  Render.prototype.desenharLinhaTabela = function (med, x0, y) {
    const doc = this.doc;
    const self = this;
    med.cel.forEach(function (c) {
      const o = c.tc.o;
      const x = x0 + c.x;
      if (o.fill) {
        const f = rgb(o.fill);
        doc.setFillColor(f[0], f[1], f[2]);
        doc.rect(x, y, c.w, med.h, 'F');
      }
      if (!o.semBorda) {
        const b = rgb(o.borda ? o.borda.cor : (o.simples ? '000000' : 'CCCCCC'));
        doc.setDrawColor(b[0], b[1], b[2]);
        doc.setLineWidth(o.borda ? (o.borda.sz || 4) / 8 : 0.5);
        doc.rect(x, y, c.w, med.h, 'S');
      }
      const conteudo = c.h - c.m.t - c.m.b;
      let cy = y + c.m.t;
      const va = o.vAlign || 'center';
      if (va === 'center') cy = y + (med.h - conteudo) / 2;
      else if (va === 'bottom') cy = y + med.h - c.m.b - conteudo;
      c.tc.filhos.forEach(function (p, i) {
        cy = self.paragrafo(p, x + c.m.l, c.w - c.m.l - c.m.r, cy, false, c.medidas[i]);
      });
    });
  };

  Render.prototype.tabela = function (no, fluxo, x0, y0) {
    const cols = this.colunas(no);
    let x = x0 == null ? this.ml : x0;
    if (x0 == null && no.jc === 'center') x = this.ml + Math.max(0, (this.cw - cols.reduce(function (a, c) { return a + c; }, 0)) / 2);
    let y = y0 == null ? this.y : y0;
    const cab = [];
    for (const tr of no.linhas) { if (tr.cabecalho) cab.push(tr); else break; }
    const self = this;
    no.linhas.forEach(function (tr) {
      const med = self.medirLinha(tr, cols);
      if (fluxo && y + med.h > self.limite() && y > self.topoConteudo() + 1) {
        self.novaPagina();
        y = self.y;
        if (!tr.cabecalho) {
          cab.forEach(function (c) {
            const mc = self.medirLinha(c, cols);
            self.desenharLinhaTabela(mc, x, y);
            y += mc.h;
          });
        }
      }
      self.desenharLinhaTabela(med, x, y);
      y += med.h;
    });
    return y;
  };

  /* ---------- páginas */

  Render.prototype.topoConteudo = function () {
    return this.capa ? this.mgCapa.top : this.topoPagina;
  };

  Render.prototype.limite = function () {
    return this.capa ? this.ph - this.mgCapa.bottom : this.limitePagina;
  };

  Render.prototype.desenharCabecalhoRodape = function () {
    let y = this.mg.header;
    const self = this;
    this.m.cabecalho.forEach(function (no) {
      if (no.tipo === 'tbl') y = self.tabela(no, false, self.ml, y);
      else y = self.paragrafo(no, self.ml, self.cw, y, false);
    });
    this.topoPagina = Math.max(this.mg.top, y);
    const alturas = this.m.rodape.map(function (no) {
      if (no.tipo === 'tbl') { const cols = self.colunas(no); return no.linhas.reduce(function (a, tr) { return a + self.medirLinha(tr, cols).h; }, 0); }
      return self.medirParagrafo(no, self.cw).h;
    });
    const hRod = alturas.reduce(function (a, b) { return a + b; }, 0);
    let yr = this.ph - this.mg.footer - hRod;
    this.m.rodape.forEach(function (no) {
      if (no.tipo === 'tbl') yr = self.tabela(no, false, self.ml, yr);
      else yr = self.paragrafo(no, self.ml, self.cw, yr, false);
    });
    this.limitePagina = Math.min(this.ph - this.mg.bottom, this.ph - this.mg.footer - hRod);
  };

  Render.prototype.novaPagina = function () {
    this.doc.addPage([this.pw, this.ph], 'p');
    if (!this.capa) this.desenharCabecalhoRodape();
    this.y = this.topoConteudo();
  };

  /** Altura mínima do bloco seguinte (para manter título junto do conteúdo). */
  Render.prototype.alturaInicial = function (no) {
    if (!no) return 0;
    if (no.tipo === 'tbl') {
      const cols = this.colunas(no);
      const self = this;
      return (no.manterJunto ? no.linhas : no.linhas.slice(0, 2)).reduce(function (a, tr) { return a + self.medirLinha(tr, cols).h; }, 0);
    }
    const med = this.medirParagrafo(no, this.cw);
    if (med.img) return med.h;
    return Math.min(med.h, ((no.po.before || 0) / 20) + 2 * 11.5);
  };

  Render.prototype.render = function () {
    const corpo = this.m.corpo;
    for (let i = 0; i < corpo.length; i++) {
      const no = corpo[i];
      if (no.tipo === 'tbl') {
        if (no.manterComProximo) {
          // faixa de título (tabela de uma linha): não fica sozinha no pé da página
          const cols = this.colunas(no), self = this;
          const hTab = no.linhas.reduce(function (a, tr) { return a + self.medirLinha(tr, cols).h; }, 0);
          let j = i + 1;
          while (corpo[j] && corpo[j].tipo === 'p' && !corpo[j].filhos.length && j < corpo.length - 1) j++;
          if (this.y + hTab + this.alturaInicial(corpo[j]) > this.limite() && this.y > this.topoConteudo() + 1) this.novaPagina();
        }
        if (no.manterJunto) {
          // tabela inteira na mesma página (ex.: cartão de projeto com fotos e ficha técnica)
          const hTab = this.alturaInicial(no);
          if (this.y + hTab > this.limite() && this.y > this.topoConteudo() + 1 && hTab <= this.limite() - this.topoConteudo()) this.novaPagina();
        }
        this.y = this.tabela(no, true);
        continue;
      }
      const med = this.medirParagrafo(no, this.cw);
      if (no.po.keepNext) {
        // soma a sequência de parágrafos "manter com o próximo" (ex.: título + subtítulo) e o início do bloco seguinte
        let total = med.h, j = i + 1;
        while (corpo[j]) {
          const prox = corpo[j];
          if (prox.tipo === 'p' && !prox.filhos.length && j < corpo.length - 1) { j++; continue; }
          if (prox.tipo === 'p' && prox.po && prox.po.keepNext) { total += this.medirParagrafo(prox, this.cw).h; j++; continue; }
          total += this.alturaInicial(prox);
          break;
        }
        if (this.y + total > this.limite() && this.y > this.topoConteudo() + 1) this.novaPagina();
      } else if (!med.linhas.length && !med.img && this.y + med.h > this.limite()) {
        // parágrafo vazio no fim da página: não abre página nova só por ele
        continue;
      }
      this.y = this.paragrafo(no, this.ml, this.cw, this.y, true, med);
      if (no.po.sectPr) {
        // fim da capa: páginas seguintes com cabeçalho e rodapé
        this.capa = false;
        this.novaPagina();
      }
    }
  };

  /* ------------------------------------------------------------ API */

  /**
   * Gera o PDF de um modelo de documento.
   * rec: {logo: {dataURL, ext}, grafico: dataURL (opcional)}; meta: {titulo, assunto, autor}
   * @returns {Promise<{blob: Blob, fonteOk: boolean}>}
   */
  async function pacote(modelo, rec, meta, opcoes) {
    opcoes = opcoes || {};
    const res = await Promise.all([carregarJsPDF(), carregarFontes()]);
    const JsPDF = res[0], fontes = res[1];
    const pw = modelo.papel.w / 20, ph = modelo.papel.h / 20;
    const doc = new JsPDF({ unit: 'pt', format: [pw, ph], orientation: 'p', compress: opcoes.compress !== false });
    let fonteOk = false;
    if (fontes) {
      try {
        ESTILOS.forEach(function (k) {
          doc.addFileToVFS('Arimo-' + k + '.ttf', fontes[k]);
          doc.addFont('Arimo-' + k + '.ttf', FAMILIA, k);
        });
        doc.setFont(FAMILIA, 'normal');
        fonteOk = true;
      } catch (e) {
        console.warn('Falha ao registrar a fonte Arimo; usando Helvetica.', e);
      }
    }
    doc.setProperties({ title: meta.titulo, subject: meta.assunto || '', author: meta.autor, creator: 'Gerador de Propostas Solar' });
    if (doc.setLanguage) doc.setLanguage('pt-BR');
    const recursos = {
      logo: { url: rec.logo.dataURL, formato: rec.logo.ext === 'png' ? 'PNG' : 'JPEG' },
      grafico: rec.grafico ? { url: rec.grafico, formato: 'PNG' } : null
    };
    // imagens adicionais do modelo (ex.: fotos de projetos realizados)
    Object.keys(modelo.imagens || {}).forEach(function (ref) {
      const url = modelo.imagens[ref];
      recursos[ref] = { url: url, formato: /^data:image\/png/.test(url) ? 'PNG' : 'JPEG' };
    });
    new Render(doc, modelo, recursos, fonteOk).render();
    return { blob: doc.output('blob'), fonteOk: fonteOk };
  }

  /**
   * Gera o PDF da proposta.
   * @returns {Promise<{blob: Blob, nome: string, resultado: object, fonteOk: boolean}>}
   */
  async function gerar(p, ctx, opcoes) {
    const d = await App.Documento.preparar(p, ctx);
    const out = await pacote(d.modelo, { logo: d.logo, grafico: d.grafico },
      { titulo: 'Proposta Comercial ' + p.numero + ' — ' + d.nomeCliente, assunto: 'Proposta de sistema fotovoltaico', autor: d.ctx.empresa.razao }, opcoes);
    return { blob: out.blob, nome: d.nomeBase + '.pdf', resultado: d.r, fonteOk: out.fonteOk };
  }

  App.Pdf = { gerar: gerar, pacote: pacote, carregarJsPDF: carregarJsPDF };
})(window.App);
