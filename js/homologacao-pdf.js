/*
 * PDF do memorial Energisa (V6) sobre o modelo oficial: as páginas do modelo em branco (exportadas pelo Excel da própria planilha,
 * sem nenhum dado) recebem os valores na posição, na fonte, no tamanho e no alinhamento de cada campo (mapa-v6.json).
 * Fontes com a mesma métrica das do formulário: Arimo (Arial) e Carlito (Calibri), em recortes Latin-1 servidos pelo próprio site
 * (assets/energisa/fontes) e embutidas inteiras — o subset do fontkit apagava letras dessas fontes. pdf-lib e fontkit sob demanda.
 */
window.App = window.App || {};

(function (App) {
  'use strict';

  const LIBS = {
    pdfLib: 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js',
    fontkit: 'https://cdn.jsdelivr.net/npm/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js'
  };
  let promessaLibs = null;

  function script(src) {
    return new Promise(function (res, rej) {
      const s = document.createElement('script');
      s.src = src; s.async = true; s.crossOrigin = 'anonymous';
      s.onload = function () { res(); };
      s.onerror = function () { s.remove(); rej(new Error('falha ao carregar ' + src)); };
      document.head.appendChild(s);
    });
  }

  function carregarLibs() {
    if (window.PDFLib && window.fontkit) return Promise.resolve();
    if (!promessaLibs) {
      promessaLibs = (window.PDFLib ? Promise.resolve() : script(LIBS.pdfLib)).then(function () { return window.fontkit ? null : script(LIBS.fontkit); })
        .then(function () { if (!window.PDFLib || !window.fontkit) throw new Error('pdf-lib indisponível'); })
        .catch(function (e) { promessaLibs = null; throw new Error('Não foi possível carregar o gerador do memorial. Verifique a internet e tente de novo. (' + e.message + ')'); });
    }
    return promessaLibs;
  }

  function carregarFontes() {
    const H = App.Homologacao, ks = Object.keys(H.ARQ_FONTES);
    return Promise.all(ks.map(function (k) { return H.fonte(k); }))
      .then(function (bs) { const o = {}; ks.forEach(function (k, i) { o[k] = bs[i]; }); return o; })
      .catch(function (e) { throw new Error('Não foi possível carregar as fontes do memorial (' + e.message + ').'); });
  }

  function bytesDeDataUrl(d) {
    const b64 = String(d).split(',')[1] || '';
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  /** Quebra o texto em linhas que cabem na largura (mantém as quebras digitadas). */
  function quebrar(txt, fonte, tam, largura) {
    const linhas = [];
    String(txt).split('\n').forEach(function (par) {
      let atual = '';
      par.split(' ').forEach(function (pal) {
        const t = (atual + ' ' + pal).trim();
        if (!atual || fonte.widthOfTextAtSize(t, tam) <= largura) atual = t;
        else { linhas.push(atual); atual = pal; }
      });
      linhas.push(atual);
    });
    return linhas;
  }

  /** Escreve um campo: centralizado/à esquerda/à direita na célula; reduz a fonte quando não cabe (o Excel cortaria). */
  function desenhar(pg, reg, txt, F, rgb) {
    const fonte = F[reg.f] || F.AB;
    const cor = reg.cor ? rgb(reg.cor[0], reg.cor[1], reg.cor[2]) : rgb(0, 0, 0);
    txt = App.Homologacao.textoPdf(txt, reg.tipo === 'area');
    if (!txt.trim()) return;
    if (reg.tipo === 'area') {
      const s = reg.s, alt = s * 1.25;
      const linhas = quebrar(txt, fonte, s, reg.x1 - reg.x0 - 6);
      const topo = (reg.y0 + reg.y1) / 2 + (linhas.length * alt) / 2 - s * 0.95;
      linhas.forEach(function (ln, k) {
        pg.drawText(ln, { x: (reg.x0 + reg.x1) / 2 - fonte.widthOfTextAtSize(ln, s) / 2, y: topo - k * alt, size: s, font: fonte, color: cor });
      });
      return;
    }
    let s = reg.s;
    let w = fonte.widthOfTextAtSize(txt, s);
    if (reg.w && w > reg.w) { s = Math.max(s * reg.w / w, s * 0.55); w = fonte.widthOfTextAtSize(txt, s); }
    const x = reg.a === 'c' ? reg.x - w / 2 : (reg.a === 'r' ? reg.x - w : reg.x);
    pg.drawText(txt, { x: x, y: reg.y, size: s, font: fonte, color: cor });
    if (reg.sublinhar) pg.drawLine({ start: { x: x, y: reg.y - 1.1 }, end: { x: x + w, y: reg.y - 1.1 }, thickness: 0.45, color: cor });
  }

  /**
   * Hachura vermelha da formatação condicional da planilha (célula obrigatória vazia): o mesmo ladrilho 8×8 que o Excel exporta
   * (diagonal "lightUp", FF4F4F), como padrão de preenchimento da página, desenhado na caixa interna da célula (sem cobrir as bordas).
   */
  function criarHachura(doc, hc) {
    const P = window.PDFLib, ctx = doc.context;
    const bin = atob(hc.rgb), px = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) px[i] = bin.charCodeAt(i);
    const img = ctx.register(ctx.flateStream(px, { Type: 'XObject', Subtype: 'Image', Width: hc.w, Height: hc.h, ColorSpace: 'DeviceRGB', BitsPerComponent: 8 }));
    const passo = hc.passo;
    const pat = ctx.register(ctx.flateStream('q ' + passo + ' 0 0 ' + passo + ' 0 0 cm /I0 Do Q', {
      Type: 'Pattern', PatternType: 1, PaintType: 1, TilingType: 1, BBox: [0, 0, passo, passo], XStep: passo, YStep: passo,
      Matrix: hc.matriz, Resources: { XObject: { I0: img } }
    }));
    return function pintar(pg, caixas) {
      if (!caixas.length) return;
      const res = pg.node.normalizedEntries().Resources;
      let pats = res.lookup(P.PDFName.of('Pattern'));
      if (!(pats instanceof P.PDFDict)) { pats = ctx.obj({}); res.set(P.PDFName.of('Pattern'), pats); }
      pats.set(P.PDFName.of('CRMHachura'), pat);
      caixas.forEach(function (c) {
        pg.pushOperators(P.pushGraphicsState(), P.PDFOperator.of('cs', [P.PDFName.of('Pattern')]), P.PDFOperator.of('scn', [P.PDFName.of('CRMHachura')]),
          P.rectangle(c.r[0], c.r[1], c.r[2] - c.r[0], c.r[3] - c.r[1]), P.fill(), P.popGraphicsState());
      });
    };
  }

  /**
   * Gera o memorial: {blob, nome, paginas}. o: {semAssinatura} — com a assinatura guardada do responsável técnico
   * (Configurações › Empresa) e h.assinarProjetista, ela entra nas linhas "Assinatura do Projetista".
   */
  async function gerar(h, o) {
    o = o || {};
    const H = App.Homologacao;
    const res = await Promise.all([H.listas(), H.mapa(), H.modelo(), carregarLibs(), carregarFontes()]);
    const L = res[0], mapa = res[1], modelo = res[2], fontes = res[4];
    const PDFLib = window.PDFLib;
    const src = await PDFLib.PDFDocument.load(modelo);
    const doc = await PDFLib.PDFDocument.create();
    doc.registerFontkit(window.fontkit);
    const F = {};
    for (const k of Object.keys(fontes)) F[k] = await doc.embedFont(fontes[k], { subset: false });
    const pags = H.paginas(h);
    const copias = await doc.copyPages(src, pags.map(function (k) { return mapa.paginas.indexOf(k); }));
    const vals = H.valores(h, L);
    const vermelhas = H.vermelhas(vals, mapa, pags);
    const hachura = mapa.hachura ? criarHachura(doc, mapa.hachura) : null;
    let assinatura = null;
    if (h.assinarProjetista && !o.semAssinatura && App.Assinatura && App.Assinatura.guardada) {
      const g = App.Assinatura.guardada();
      const f = g && App.Fotos ? await App.Fotos.obter(g.fotoId) : null;
      if (f && f.dataURL) {
        try { assinatura = /^data:image\/png/.test(f.dataURL) ? await doc.embedPng(bytesDeDataUrl(f.dataURL)) : await doc.embedJpg(bytesDeDataUrl(f.dataURL)); } catch (e) { assinatura = null; }
      }
    }
    copias.forEach(function (pg, n) {
      doc.addPage(pg);
      const chave = pags[n];
      if (hachura) hachura(pg, vermelhas.filter(function (c) { return c.pagina === chave; }));
      Object.keys(vals).forEach(function (cid) {
        if (cid.indexOf(chave + '.') !== 0) return;
        const reg = mapa.campos[cid];
        if (reg) desenhar(pg, reg, vals[cid], F, PDFLib.rgb);
      });
      const bb = mapa.assinaturas && mapa.assinaturas[chave];
      if (assinatura && bb && chave !== 'beneficiarias') {
        const bw = bb[2] - bb[0], bh = bb[3] - bb[1];
        const esc = Math.min(bw / assinatura.width, bh / assinatura.height);
        const w = assinatura.width * esc, hh = assinatura.height * esc;
        pg.drawImage(assinatura, { x: bb[0] + (bw - w) / 2, y: bb[1] + (bh - hh) / 2, width: w, height: hh });
      }
    });
    doc.setTitle('Memorial GD — ' + (h.titular || '') + ' — UC ' + (h.uc || ''));
    doc.setSubject('Formulário de Orçamento de Conexão de Geração Distribuída (Energisa, V6)');
    doc.setProducer('CRM Solar');
    doc.setCreator('CRM Solar — memorial Energisa V6');
    const bytes = await doc.save();
    return { blob: new Blob([bytes], { type: 'application/pdf' }), nome: H.nomeArquivo(h), paginas: pags, assinado: !!assinatura, vermelhas: vermelhas };
  }

  App.HomologacaoPdf = { gerar: gerar, LIBS: LIBS };
})(window.App);
