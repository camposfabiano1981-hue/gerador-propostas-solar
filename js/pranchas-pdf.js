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

  async function assinaturaRt(doc) {
    if (!App.Assinatura || !App.Assinatura.guardada) return null;
    const g = App.Assinatura.guardada();
    const f = g && App.Fotos ? await App.Fotos.obter(g.fotoId) : null;
    if (!f || !f.dataURL) return null;
    try { return /^data:image\/png/.test(f.dataURL) ? await doc.embedPng(bytesDeDataUrl(f.dataURL)) : await doc.embedJpg(bytesDeDataUrl(f.dataURL)); } catch (e) { return null; }
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
    for (let i = 0; i < estilos.length; i++) {
      const e = estilos[i];
      const src = await P.PDFDocument.load(modelos[i]);
      const pg = (await doc.copyPages(src, [0]))[0];
      doc.addPage(pg);
      const vals = Pr.valores(pr, e, o.ctx);
      const campos = mapa[e] || {};
      Object.keys(campos).forEach(function (cid) {
        const v = vals[cid];
        if (v == null) return;
        campos[cid].forEach(function (oc, k) {
          const s = Array.isArray(v) ? v[k] : v;
          if (s == null || String(s).trim() === '') return;
          if (oc.t === 'tt') desenharArial(pg, oc, s, fonte, P);
          else desenharTracos(pg, oc, s, oc.t === 'rom' ? FR : FT, P);
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
    return { blob: new Blob([bytes], { type: 'application/pdf' }), nome: Pr.nomeArquivo(pr), paginas: estilos.length, estilos: estilos, assinado: !!ass };
  }

  App.PranchasPdf = { gerar: gerar };
})(window.App);
