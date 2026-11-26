/*
 * PDF das pranchas fotovoltaicas sobre os modelos em branco (assets/pranchas): cada campo do mapa recebe o valor na posição,
 * no ângulo, na cor e na fonte do desenho original — Arial (Arimo, mesma métrica) para os textos TrueType e traços nas fontes
 * do AutoCAD (TXT, colhida das próprias pranchas, e ROMANS/Hershey) para os textos SHX. Textos longos estreitam e, se preciso,
 * diminuem para caber na célula. A assinatura guardada do responsável técnico entra no carimbo. pdf-lib e fontkit sob demanda.
 */
window.App = window.App || {};

(function (App) {
  'use strict';

  function carregarLibs() {
    // os mesmos pdf-lib e fontkit do memorial Energisa (carregados uma vez só)
    if (window.PDFLib && window.fontkit) return Promise.resolve();
    const s = function (src) {
      return new Promise(function (res, rej) {
        const el = document.createElement('script');
        el.src = src; el.async = true; el.crossOrigin = 'anonymous';
        el.onload = function () { res(); };
        el.onerror = function () { el.remove(); rej(new Error('falha ao carregar ' + src)); };
        document.head.appendChild(el);
      });
    };
    const L = (App.HomologacaoPdf && App.HomologacaoPdf.LIBS) || {
      pdfLib: 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js',
      fontkit: 'https://cdn.jsdelivr.net/npm/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js'
    };
    return (window.PDFLib ? Promise.resolve() : s(L.pdfLib)).then(function () { return window.fontkit ? null : s(L.fontkit); })
      .then(function () { if (!window.PDFLib || !window.fontkit) throw new Error('pdf-lib indisponível'); })
      .catch(function (e) { throw new Error('Não foi possível carregar o gerador da prancha. Verifique a internet e tente de novo. (' + e.message + ')'); });
  }

  function bytesDeDataUrl(d) {
    const bin = atob(String(d).split(',')[1] || '');
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  /** Texto que a Arimo (recorte Latin-1) desenha: o mesmo filtro do memorial. */
  function textoArial(s) {
    if (App.Homologacao && App.Homologacao.textoPdf) return App.Homologacao.textoPdf(s, false);
    return String(s == null ? '' : s).replace(/\s+/g, ' ').replace(/[^\x20-\x7E -ÿ]/g, '');
  }

  const r2 = function (v) { return Math.round(v * 100) / 100; };

  /** Texto TrueType (Arial): rotação em torno do ponto de ancoragem; reduz o tamanho se passar da largura do campo. */
  function desenharArial(pg, oc, s, fonte, P) {
    s = textoArial(s);
    if (!s.trim()) return;
    let tam = oc.s, w = fonte.widthOfTextAtSize(s, tam);
    if (oc.w && w > oc.w) { tam = Math.max(oc.s * 0.55, tam * oc.w / w); w = fonte.widthOfTextAtSize(s, tam); }
    const a = (oc.ang || 0) * Math.PI / 180;
    const dx = oc.al === 'c' ? -w / 2 : (oc.al === 'r' ? -w : 0);
    pg.drawText(s, { x: oc.x + dx * Math.cos(a), y: oc.y + dx * Math.sin(a), size: tam, font: fonte, color: P.rgb(oc.cor[0], oc.cor[1], oc.cor[2]), rotate: P.degrees(oc.ang || 0) });
  }

  /** Texto SHX (TXT ou ROMANS) desenhado em traços, como o AutoCAD exporta: linhas de espessura mínima, pontas redondas. */
  function desenharTracos(pg, oc, s, F, P) {
    s = String(s == null ? '' : s).replace(/\s+/g, ' ');
    if (!s.trim()) return;
    const Pr = App.Pranchas;
    const aj = Pr.caber(function (tam, fl) { return Pr.larguraTracos(F, oc, s, tam, fl); }, oc, s);
    const pls = Pr.tracos(F, oc, s, aj.tam, aj.fl);
    if (!pls.length) return;
    const Op = P.PDFOperator, n = P.PDFNumber;
    const ops = [Op.of('q'), Op.of('RG', [n.of(oc.cor[0]), n.of(oc.cor[1]), n.of(oc.cor[2])]), Op.of('w', [n.of(0)]), Op.of('J', [n.of(1)]), Op.of('j', [n.of(1)])];
    pls.forEach(function (pl) {
      if (pl.length < 2) return;
      ops.push(Op.of('m', [n.of(r2(pl[0][0])), n.of(r2(pl[0][1]))]));
      for (let i = 1; i < pl.length; i++) ops.push(Op.of('l', [n.of(r2(pl[i][0])), n.of(r2(pl[i][1]))]));
    });
    ops.push(Op.of('S'), Op.of('Q'));
    pg.pushOperators.apply(pg, ops);
  }

  /** Quebra o texto em linhas de até larg (medida pela fonte do texto). */
  function quebrar(medir, txt, larg) {
    const out = [];
    let cur = '';
    String(txt == null ? '' : txt).split(/\s+/).filter(Boolean).forEach(function (p) {
      const t = cur ? cur + ' ' + p : p;
      if (cur && medir(t) > larg) { out.push(cur); cur = p; } else cur = t;
    });
    if (cur) out.push(cur);
    return out;
  }
  /**
   * Parágrafo (ou lista numerada) com quebra de linha: q = {w, lh, max, x, y, rotulo: {x, fmt: 'n.', ini}}. Se passar de max linhas,
   * as letras e o passo diminuem juntos até caber.
   */
  function desenharParagrafo(pg, c, FT, P, fonte) {
    const q = c.quebra, Pr = App.Pranchas, base = Object.assign({}, c.oc, { x: q.x, y: q.y });
    const itens = c.itens || [c.txt];
    let oc = base, blocos = [];
    const medir = function (o) {
      return function (t) { return o.t === 'tt' ? (fonte ? fonte.widthOfTextAtSize(textoArial(t), o.s) : t.length * o.s * 0.5) : Pr.larguraTracos(FT, o, t, o.s, o.fl || 1); };
    };
    for (let k = 0; k < 10; k++) {
      blocos = itens.map(function (t) { return quebrar(medir(oc), t, q.w); });
      const total = blocos.reduce(function (a, l) { return a + l.length; }, 0);
      if (!q.max || total <= q.max) break;
      oc = Object.assign({}, oc, { s: oc.s * 0.94 });
    }
    const lh = (q.lh || base.s * 1.2) * oc.s / base.s;
    const escreve = function (o, t) { if (o.t === 'tt') { if (fonte) desenharArial(pg, o, t, fonte, P); } else desenharTracos(pg, o, t, FT, P); };
    let y = oc.y;
    blocos.forEach(function (linhas, i) {
      if (q.rotulo) escreve(Object.assign({}, oc, { x: q.rotulo.x, y: y, w: null }), (q.rotulo.fmt || 'n.').replace('n', String((q.rotulo.ini || 1) + i)));
      linhas.forEach(function (t) { escreve(Object.assign({}, oc, { y: y, w: null }), t); y -= lh; });
    });
  }

  /** Linha (polilinha) com a espessura mínima do AutoCAD; traco = padrão de tracejado. */
  function desenharLinha(pg, pts, cor, traco, P) {
    if (!pts || pts.length < 2) return;
    const Op = P.PDFOperator, n = P.PDFNumber;
    const ops = [Op.of('q'), Op.of('RG', [n.of(cor[0]), n.of(cor[1]), n.of(cor[2])]), Op.of('w', [n.of(0)]), Op.of('J', [n.of(1)]), Op.of('j', [n.of(1)])];
    if (traco) ops.push(Op.of('d', [arr(pg, traco, P), n.of(0)]));
    ops.push(Op.of('m', [n.of(r2(pts[0][0])), n.of(r2(pts[0][1]))]));
    for (let i = 1; i < pts.length; i++) ops.push(Op.of('l', [n.of(r2(pts[i][0])), n.of(r2(pts[i][1]))]));
    ops.push(Op.of('S'), Op.of('Q'));
    pg.pushOperators.apply(pg, ops);
  }
  function arr(pg, vals, P) {
    const a = P.PDFArray.withContext(pg.doc.context);
    vals.forEach(function (v) { a.push(P.PDFNumber.of(v)); });
    return a;
  }

  /**
   * Executa o desenho das strings do estilo A: blocos do desenho original (com recorte opcional), linhas, textos (em traços ou
   * Arial), trechos copiados do modelo (regiões já embutidas em regioes, na ordem), retângulos brancos e pontos de ligação.
   */
  function desenharStringsA(pg, cmds, FT, P, fonte) {
    const Op = P.PDFOperator, n = P.PDFNumber;
    cmds.forEach(function (c) {
      if (c.t === 'forma') {
        const ops = [Op.of('q')];
        if (c.clip) ops.push(Op.of('re', [n.of(c.clip[0]), n.of(c.clip[1]), n.of(c.clip[2] - c.clip[0]), n.of(c.clip[3] - c.clip[1])]), Op.of('W'), Op.of('n'));
        ops.push(Op.of('cm', c.m.map(function (v) { return n.of(Math.round(v * 10000) / 10000); })), Op.of('Do', [P.PDFName.of(c.nome)]), Op.of('Q'));
        pg.pushOperators.apply(pg, ops);
      } else if (c.t === 'linha') desenharLinha(pg, c.pts, c.cor, c.traco, P);
      else if (c.t === 'texto' && c.quebra) desenharParagrafo(pg, c, FT, P, fonte);
      else if (c.t === 'texto') { if (c.oc.t === 'tt') { if (fonte) desenharArial(pg, c.oc, c.txt, fonte, P); } else desenharTracos(pg, c.oc, c.txt, FT, P); }
      else if (c.t === 'regiao') {
        // trecho do modelo na nova posição (w/h: ampliado, ex.: o inversor maior das 3 fases): o mesmo bloco do modelo inteiro
        // (/CRMPagina), recortado e levado ao lugar — o desenho do modelo entra uma vez só no PDF, por maior que seja a obra
        const b = c.bb, bw = b[2] - b[0], bh = b[3] - b[1], w = c.w || bw, hh = c.h || bh, kx = w / bw, ky = hh / bh, x = b[0] + c.dx, y = b[1] + c.dy;
        const r4 = function (v) { return n.of(Math.round(v * 10000) / 10000); };
        pg.pushOperators(Op.of('q'), Op.of('re', [r4(x), r4(y), r4(w), r4(hh)]), Op.of('W'), Op.of('n'),
          Op.of('cm', [r4(kx), n.of(0), n.of(0), r4(ky), r4(x - kx * b[0]), r4(y - ky * b[1])]), Op.of('Do', [P.PDFName.of(MODELO_XO)]), Op.of('Q'));
      }
      else if (c.t === 'branco') pg.drawRectangle({ x: c.r[0], y: c.r[1], width: c.r[2] - c.r[0], height: c.r[3] - c.r[1], color: P.rgb(1, 1, 1) });
      else if (c.t === 'ponto') pg.drawCircle({ x: c.x, y: c.y, size: c.r, color: P.rgb(0, 0, 0) });
      // realce translúcido (ampliação: o que é novo)
      else if (c.t === 'realce') pg.drawRectangle({ x: c.r[0], y: c.r[1], width: c.r[2] - c.r[0], height: c.r[3] - c.r[1], color: P.rgb(c.cor[0], c.cor[1], c.cor[2]), opacity: c.op || 0.15 });
    });
  }

  // nome do bloco com o desenho inteiro do modelo (na página e nos trechos copiados)
  const MODELO_XO = 'CRMPagina';
  /**
   * Folhas de um estilo sobre o modelo, sem repetir o desenho: as n folhas vêm de uma cópia só da página do modelo, e o conteúdo
   * dela vira um bloco (Form XObject) chamado por cada folha e por cada trecho copiado. Antes, cada folha e cada trecho levava o
   * desenho inteiro (≈ 0,5 MB cada), e a prancha de 2 folhas passava de 9 MB.
   */
  async function folhasDoModelo(doc, bytes, nFolhas, P) {
    const src = await P.PDFDocument.load(bytes);
    const pags = await doc.copyPages(src, Array.from({ length: nFolhas }, function () { return 0; }));
    const ctx = doc.context, N = P.PDFName, node = pags[0].node;
    const cont = node.Contents();
    const refs = cont instanceof P.PDFArray ? cont.asArray() : [node.get(N.of('Contents'))];
    const partes = refs.map(function (r) { const s = ctx.lookup(r); return s instanceof P.PDFRawStream ? P.decodePDFRawStream(s).decode() : s.getContents(); });
    const tot = partes.reduce(function (a, p) { return a + p.length + 1; }, 0), bytesC = new Uint8Array(tot);
    let k = 0;
    partes.forEach(function (p) { bytesC.set(p, k); k += p.length; bytesC[k++] = 10; });
    const mb = pags[0].getMediaBox();
    const res = node.Resources();
    const form = ctx.register(ctx.flateStream(bytesC, { Type: 'XObject', Subtype: 'Form', BBox: [mb.x, mb.y, mb.x + mb.width, mb.y + mb.height], Resources: res }));
    // recursos das folhas: os do modelo (os blocos /CRMMod… continuam com o mesmo nome) + o bloco do desenho
    const resF = res.clone(ctx), xo = res.lookup(N.of('XObject'));
    const xoF = xo instanceof P.PDFDict ? xo.clone(ctx) : ctx.obj({});
    xoF.set(N.of(MODELO_XO), form);
    resF.set(N.of('XObject'), xoF);
    pags.forEach(function (pg) {
      const chama = ctx.register(ctx.flateStream('q /' + MODELO_XO + ' Do Q\n'));
      pg.node.set(N.of('Contents'), ctx.obj([chama]));
      pg.node.set(N.of('Resources'), resF.clone(ctx));
    });
    refs.forEach(function (r) { if (r instanceof P.PDFRef) ctx.delete(r); });
    return pags;
  }

  /** Imagem da assinatura com no máximo maxW px de largura (PNG com transparência): a foto original pode ter vários MB. */
  function reduzirImagem(dataURL, maxW) {
    return new Promise(function (res) {
      if (typeof document === 'undefined' || !/^data:image\//.test(String(dataURL))) return res(dataURL);
      const im = new Image();
      im.onload = function () {
        if (!(im.naturalWidth > maxW)) return res(dataURL);
        const cv = document.createElement('canvas'), k = maxW / im.naturalWidth;
        cv.width = maxW; cv.height = Math.max(1, Math.round(im.naturalHeight * k));
        cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
        try { res(cv.toDataURL('image/png')); } catch (e) { res(dataURL); }
      };
      im.onerror = function () { res(dataURL); };
      im.src = dataURL;
    });
  }

  async function assinaturaRt(doc) {
    if (!App.Assinatura || !App.Assinatura.guardada) return null;
    const g = App.Assinatura.guardada();
    const f = g && App.Fotos ? await App.Fotos.obter(g.fotoId) : null;
    if (!f || !f.dataURL) return null;
    const d = await reduzirImagem(f.dataURL, 900);
    try { return /^data:image\/png/.test(d) ? await doc.embedPng(bytesDeDataUrl(d)) : await doc.embedJpg(bytesDeDataUrl(d)); } catch (e) { return null; }
  }

  /**
   * Gera a prancha (um estilo ou os dois, uma página A1 cada): {blob, nome, paginas, assinado}.
   * o: {ctx (empresa), semAssinatura}
   */
  async function gerar(pr, o) {
    o = o || {};
    const Pr = App.Pranchas;
    const estilos = Pr.estilosDe(pr);
    const res = await Promise.all([Pr.mapa(), Pr.fonteTxt(), Pr.fonteRomans(), Pr.fonteArial(), carregarLibs()]
      .concat(estilos.map(function (e) { return Pr.modelo(e); })))
      .catch(function (e) { throw new Error(/gerador/.test(e.message) ? e.message : 'Não foi possível carregar o modelo da prancha (' + e.message + ').'); });
    const mapa = res[0], FT = res[1], FR = res[2], arial = res[3], modelos = res.slice(5);
    const P = window.PDFLib;
    const doc = await P.PDFDocument.create();
    doc.registerFontkit(window.fontkit);
    const fonte = await doc.embedFont(arial, { subset: false });
    const ass = pr.assinarRt !== false && !o.semAssinatura ? await assinaturaRt(doc) : null;
    // folhas: o estilo A com mais de um inversor sai em 2 folhas A1 (1/2: tabelas e diagramas; 2/2: o desenho das strings)
    const folhas = [];
    estilos.forEach(function (e, i) {
      const n = e === 'A' && Pr.folhasA ? Pr.folhasA(pr) : 1;
      for (let f = 1; f <= n; f++) folhas.push({ e: e, i: i, folha: n > 1 ? f : undefined });
    });
    // as folhas de cada estilo, copiadas de uma vez do modelo (o desenho dele entra uma vez só)
    const pagsEstilo = [];
    for (let i = 0; i < estilos.length; i++) pagsEstilo.push(await folhasDoModelo(doc, modelos[i], folhas.filter(function (f) { return f.i === i; }).length, P));
    const usadas = estilos.map(function () { return 0; });
    for (const fo of folhas) {
      const e = fo.e, i = fo.i;
      const pg = pagsEstilo[i][usadas[i]++];
      doc.addPage(pg);
      const vals = Pr.valores(pr, e, o.ctx);
      const campos = mapa[e] || {};
      // estilo A: strings, tabela e unifilares com a quantidade real da obra
      const pular = {};
      let desloc = null, pularOc = {}, soCarimbo = false, pularRegiao = null, manterRegiao = null, mover = null, pularRegioes = [];
      if (e === 'A' && mapa.stringsA) {
        Pr.CAMPOS_STRINGS_A.forEach(function (k) { pular[k] = true; });
        const d = Pr.desenhoStringsA(pr, campos, mapa.stringsA, fo.folha);
        desloc = d.desloc || null;
        (d.pular || []).forEach(function (k) { pular[k] = true; });
        pularOc = d.pularOc || {}; soCarimbo = !!d.soCarimbo; pularRegiao = d.pularRegiao || null; pularRegioes = d.pularRegioes || []; manterRegiao = d.manterRegiao || null; mover = (d.moverRegiao ? [d.moverRegiao] : []).concat(d.moverMF || []);
        // trechos do modelo copiados pelo desenho (ex.: o símbolo do 2º inversor): o bloco do modelo recortado
        desenharStringsA(pg, d, FT, P, fonte);
      }
      Object.keys(campos).forEach(function (cid) {
        if (pular[cid]) return;
        const v = vals[cid];
        if (v == null) return;
        campos[cid].forEach(function (oc, k) {
          const s = Array.isArray(v) ? v[k] : v;
          if (s == null || String(s).trim() === '') return;
          if (pularOc[cid] && pularOc[cid].indexOf(k) >= 0) return;
          const em = function (r) { return r && oc.x >= r[0] && oc.x <= r[2] && oc.y >= r[1] && oc.y <= r[3]; };
          // campos de um trecho que foi para a outra folha (ex.: o detalhe de instalação)
          if (em(pularRegiao) || pularRegioes.some(em)) return;
          // folha 2: entram o carimbo, o descritivo e as legendas (à direita) e os campos do trecho mantido (o detalhe de instalação)
          if (soCarimbo && oc.x < 1862 && !em(manterRegiao)) return;
          // trecho levado a outro lugar da folha (ex.: o croqui ao lado das tabelas): os campos dele vão junto, na mesma escala
          // (o croqui antes; na folha 1 de 2, também o multifilar, deslocado para a direita)
          const mv = mover && mover.find(function (m) { return em(m.r); });
          if (mv) oc = Object.assign({}, oc, { x: mv.k * oc.x + mv.tx, y: mv.k * oc.y + mv.ty, s: oc.s * mv.k, w: oc.w ? oc.w * mv.k : oc.w });
          // a tabela de strings (e a do inversor) cresceu: o que está abaixo dela na coluna de textos desce junto — vale a regra de
          // limite mais baixo que o campo atinge
          const regra = (Array.isArray(desloc) ? desloc : (desloc ? [desloc] : [])).filter(function (d) { return oc.x < d.x && oc.y < d.y; })
            .sort(function (a, b) { return a.y - b.y; })[0];
          if (regra) oc = Object.assign({}, oc, { y: oc.y + regra.dy });
          const escreve = function (o, t) { if (o.t === 'tt') desenharArial(pg, o, t, fonte, P); else desenharTracos(pg, o, t, o.t === 'rom' ? FR : FT, P); };
          // campo em mais de uma linha (ex.: legenda com um módulo por linha): centradas no campo ou a 1ª nele e as outras abaixo
          const linhas = String(s).split('\n');
          if (linhas.length > 1) {
            const lh = oc.s * (oc.t === 'tt' ? 1.2 : 1.4), modo = (Pr.MULTILINHA || {})[cid] || 'centro';
            linhas.forEach(function (t, i) { escreve(Object.assign({}, oc, { y: oc.y + (modo === 'abaixo' ? -i : (linhas.length - 1) / 2 - i) * lh }), t); });
            return;
          }
          escreve(oc, s);
        });
      });
      const bb = Pr.ASSINATURA[e];
      if (ass && bb) {
        const cx = campos.rt_nome_mai && campos.rt_nome_mai[0] ? campos.rt_nome_mai[0].x : (bb[0] + bb[2]) / 2;
        const bw = Math.min(bb[2] - bb[0], 2 * Math.min(cx - bb[0], bb[2] - cx)), bh = bb[3] - bb[1];
        const esc = Math.min(bw / ass.width, bh / ass.height);
        const w = ass.width * esc, h = ass.height * esc;
        pg.drawImage(ass, { x: cx - w / 2, y: bb[1], width: w, height: h });
      }
    }
    doc.setTitle('Prancha fotovoltaica — ' + ((pr.cliente && pr.cliente.nome) || '') + (pr.uc ? ' — UC ' + pr.uc : ''));
    doc.setSubject('Projeto elétrico do sistema fotovoltaico (' + estilos.map(function (e) { return Pr.ESTILOS[e].nome; }).join(' e ') + ')');
    doc.setProducer('CRM Solar');
    doc.setCreator('CRM Solar — pranchas fotovoltaicas');
    const bytes = await doc.save();
    return { blob: new Blob([bytes], { type: 'application/pdf' }), nome: Pr.nomeArquivo(pr), paginas: folhas.length, estilos: estilos, assinado: !!ass };
  }

  App.PranchasPdf = { gerar: gerar, carregarLibs: carregarLibs, bytesDeDataUrl: bytesDeDataUrl };
})(window.App);
