/*
 * Croqui de localização pelas ruas do mapa (OpenStreetMap): norte para cima, as ruas em volta do ponto da UC (as mesmas da imagem
 * de satélite da planta de localização), o lote da UC hachurado na frente da rua mais próxima do ponto, os nomes das ruas, o selo
 * do titular com a seta até o lote e o norte. Desenhado em vetor (pdf-lib) num quadro da planta de localização ou da prancha.
 * A geometria (em metros, com o ponto na origem) fica gravada na prancha (pr.croquiMapa) quando as ruas são buscadas.
 */
window.App = window.App || {};

(function (App) {
  'use strict';

  const K = {};
  // largura da via de muro a muro (m), pelo tipo do OpenStreetMap
  K.LARGURA = { motorway: 26, trunk: 24, primary: 18, secondary: 16, tertiary: 14, residential: 12, unclassified: 11, road: 11, living_street: 8, service: 7 };
  K.LOTE = { testada: 12, profundidade: 30 };
  K.RAIO = 300;
  K.OPCOES = [
    { v: '', t: 'Pelas ruas do mapa (norte para cima, lote na posição da UC)' },
    { v: 'modelo', t: 'Desenho padrão do modelo da prancha' }
  ];
  const FORA = ['footway', 'path', 'cycleway', 'steps', 'pedestrian', 'track', 'bridleway', 'corridor', 'platform', 'proposed', 'construction', 'elevator', 'via_ferrata'];

  function chave(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }
  // texto que as fontes do PDF desenham (Latin-1)
  function txt(s) { return String(s == null ? '' : s).replace(/[\t\r\n]+/g, ' ').replace(/[–—]/g, '-').replace(/[^\x20-\x7E\xA0-\xFF]/g, ''); }
  const r1 = function (v) { return Math.round(v * 10) / 10; };
  const sub = function (a, b) { return [a[0] - b[0], a[1] - b[1]]; };
  const soma = function (a, b, k) { return [a[0] + b[0] * (k == null ? 1 : k), a[1] + b[1] * (k == null ? 1 : k)]; };
  const dot = function (a, b) { return a[0] * b[0] + a[1] * b[1]; };
  const len = function (a) { return Math.hypot(a[0], a[1]); };
  function pontoSeg(p, a, b) {
    const ab = sub(b, a), l2 = dot(ab, ab);
    const t = l2 > 0 ? Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2)) : 0;
    const q = [a[0] + ab[0] * t, a[1] + ab[1] * t];
    return { d: len(sub(p, q)), q: q, dir: l2 > 0 ? [ab[0] / Math.sqrt(l2), ab[1] / Math.sqrt(l2)] : [1, 0] };
  }
  // distância ao longo do raio (origem o, direção u unitária) até o segmento a–b, ou null
  function raioSeg(o, u, a, b) {
    const s = sub(b, a), den = u[0] * s[1] - u[1] * s[0];
    if (Math.abs(den) < 1e-9) return null;
    const ao = sub(a, o), t = (ao[0] * s[1] - ao[1] * s[0]) / den, v = (ao[0] * u[1] - ao[1] * u[0]) / den;
    return t > 0 && v >= 0 && v <= 1 ? t : null;
  }
  K.largura = function (via) { return K.LARGURA[via && via.h] || 11; };

  /**
   * Geometria das vias com nome em volta do ponto (resposta do Overpass, `out geom`), em metros: x para o leste, y para o norte,
   * o ponto na origem. {lat, lon, em, vias: [{n: nome, h: tipo, p: [[x, y], …]}]}.
   */
  K.geometria = function (dados, lat, lon) {
    const kx = 111320 * Math.cos(lat * Math.PI / 180), ky = 110540, vias = [];
    ((dados && dados.elements) || []).forEach(function (e) {
      const nome = e.tags && String(e.tags.name || '').trim();
      if (e.type !== 'way' || !nome || !e.tags.highway || FORA.indexOf(e.tags.highway) >= 0 || !Array.isArray(e.geometry) || e.geometry.length < 2) return;
      const p = e.geometry.map(function (g) { return [r1((g.lon - lon) * kx), r1((g.lat - lat) * ky)]; });
      if (p.every(function (q) { return Math.abs(q[0]) > 900 || Math.abs(q[1]) > 900; })) return;
      vias.push({ n: nome, h: e.tags.highway, p: p });
    });
    return { lat: Number(lat.toFixed(7)), lon: Number(lon.toFixed(7)), em: new Date().toISOString(), vias: vias };
  };

  /** A geometria gravada vale para o ponto (até 3 m de diferença)? */
  K.confere = function (geo, lat, lon) {
    if (!geo || !Array.isArray(geo.vias) || !geo.vias.length || !isFinite(geo.lat) || !isFinite(geo.lon)) return false;
    const dx = (geo.lon - lon) * 111320 * Math.cos(lat * Math.PI / 180), dy = (geo.lat - lat) * 110540;
    return Math.hypot(dx, dy) <= 3;
  };

  /** De volta ao formato do Overpass (para escolher as ruas do croqui com App.Coordenadas.ruasDoCroqui). */
  K.dados = function (geo) {
    const kx = 111320 * Math.cos(geo.lat * Math.PI / 180), ky = 110540;
    return { elements: geo.vias.map(function (v) { return { type: 'way', tags: { name: v.n, highway: v.h }, geometry: v.p.map(function (q) { return { lat: geo.lat + q[1] / ky, lon: geo.lon + q[0] / kx }; }) }; }) };
  };

  const MEMO = {};
  /**
   * Geometria para o ponto: a gravada (se for do mesmo ponto), a da memória ou a do OpenStreetMap (Overpass). ms: tempo limite.
   */
  K.obter = async function (lat, lon, salva, ms) {
    if (K.confere(salva, lat, lon)) return salva;
    const k = lat.toFixed(6) + ',' + lon.toFixed(6);
    if (MEMO[k]) return MEMO[k];
    const busca = App.Coordenadas.vias(lat, lon, K.RAIO);
    const dados = ms ? await Promise.race([busca, new Promise(function (res, rej) { setTimeout(function () { rej(new Error('tempo esgotado')); }, ms); })]) : await busca;
    const g = K.geometria(dados, lat, lon);
    if (!g.vias.length) throw new Error('nenhuma rua com nome a ' + K.RAIO + ' m do ponto no OpenStreetMap');
    MEMO[k] = g;
    return g;
  };

  /**
   * O lote da UC: na frente da rua mais próxima do ponto (a frente na divisa da rua, centrado no ponto), do lado do ponto, com a
   * testada e a profundidade dadas (afastado da esquina e sem passar da rua de trás; fundo até o ponto, se ele estiver mais para dentro).
   * Devolve {pts (4 cantos), centro, frente, t (direção da rua), n (para dentro do lote), via, dist}.
   */
  K.lote = function (geo, o) {
    o = o || {};
    let testada = Number(o.testada) > 0 ? Number(o.testada) : K.LOTE.testada;
    const prof0 = Number(o.profundidade) > 0 ? Number(o.profundidade) : K.LOTE.profundidade, O = [0, 0];
    let best = null;
    ((geo && geo.vias) || []).forEach(function (v) {
      for (let i = 1; i < v.p.length; i++) { const r = pontoSeg(O, v.p[i - 1], v.p[i]); if (!best || r.d < best.d) best = Object.assign(r, { v: v }); }
    });
    if (!best) return null;
    const t = best.dir, n = best.d > 0.5 ? [-best.q[0] / best.d, -best.q[1] / best.d] : [-t[1], t[0]];
    const meia = K.largura(best.v) / 2, nomeUc = chave(best.v.n);
    let F = soma(best.q, n, meia);
    // o que o raio encontra primeiro (outra rua): distância até a divisa dela
    const bate = function (o0, u) {
      let m = null;
      geo.vias.forEach(function (v) {
        if (chave(v.n) === nomeUc) return;
        for (let i = 1; i < v.p.length; i++) {
          const d = raioSeg(o0, u, v.p[i - 1], v.p[i]);
          if (d != null && d < 250) { const x = d - K.largura(v) / 2; if (m == null || x < m) m = x; }
        }
      });
      return m;
    };
    // esquinas dos dois lados: o lote não entra na rua transversal
    const folga = 1;
    const ladoA = bate(soma(F, n, 1), t), ladoB = bate(soma(F, n, 1), [-t[0], -t[1]]);
    const livreA = ladoA == null ? Infinity : ladoA - folga, livreB = ladoB == null ? Infinity : ladoB - folga;
    if (livreA + livreB < testada) testada = Math.max(4, livreA + livreB);
    let desl = 0;
    if (livreA < testada / 2) desl = livreA - testada / 2;
    else if (livreB < testada / 2) desl = testada / 2 - livreB;
    F = soma(F, t, desl);
    // fundo: a profundidade, até o ponto (se estiver mais para dentro) e sem passar da rua de trás
    let prof = Math.max(prof0, best.d - meia + 6);
    const tras = bate(soma(F, t, 0), n);
    if (tras != null) prof = Math.min(prof, Math.max(8, tras - folga));
    const a = soma(F, t, -testada / 2), b = soma(F, t, testada / 2);
    const pts = [a, b, soma(b, n, prof), soma(a, n, prof)];
    return { pts: pts, centro: soma(F, n, prof / 2), frente: F, t: t, n: n, via: best.v.n, dist: best.d, testada: testada, prof: prof };
  };

  /** Nomes que saem no croqui: o da UC e os das ruas 2, 3 e 4 como digitados na prancha (o resto, como no mapa). */
  K.nomes = function (geo, ruas) {
    const out = {};
    if (!ruas || !App.Coordenadas || !App.Coordenadas.ruasDoCroqui) return out;
    let r = null;
    try { r = App.Coordenadas.ruasDoCroqui(K.dados(geo), geo.lat, geo.lon); } catch (e) { r = null; }
    if (!r) return out;
    ['uc', 'r2', 'r3', 'r4'].forEach(function (k) { const v = String(ruas[k] || '').trim(); if (r[k] && v) out[chave(r[k])] = v; });
    return out;
  };

  /* ------------------------------------------------------------ desenho (pdf-lib) */

  /**
   * Escala do croqui (pontos por metro) num quadro de bw × bh pontos, centrado no lote: mostra as ruas mais próximas — a da UC e mais
   * três (as transversais e a de trás, em geral) —, entre 160 e 520 m na largura.
   */
  K.escala = function (bw, bh, geo, L) {
    const dist = {};
    ((geo && geo.vias) || []).forEach(function (v) {
      const kk = chave(v.n);
      for (let i = 1; i < v.p.length; i++) { const d = pontoSeg(L.centro, v.p[i - 1], v.p[i]).d; if (dist[kk] == null || d < dist[kk]) dist[kk] = d; }
    });
    const ds = Object.keys(dist).map(function (kk) { return dist[kk]; }).sort(function (a, b) { return a - b; });
    const raio = (ds.length >= 4 ? ds[3] : ds.length ? ds[ds.length - 1] : 100) + 25;
    let k = Math.min(bw, bh) / (2 * raio);
    k = Math.min(k, bw / 160); k = Math.max(k, bw / 520);
    return k;
  };

  // recorte de um segmento pelo retângulo (Liang–Barsky): [p, q] ou null
  function recortar(p, q, r) {
    let t0 = 0, t1 = 1;
    const dx = q[0] - p[0], dy = q[1] - p[1];
    const ps = [-dx, dx, -dy, dy], qs = [p[0] - r[0], r[2] - p[0], p[1] - r[1], r[3] - p[1]];
    for (let i = 0; i < 4; i++) {
      if (ps[i] === 0) { if (qs[i] < 0) return null; continue; }
      const u = qs[i] / ps[i];
      if (ps[i] < 0) { if (u > t1) return null; if (u > t0) t0 = u; } else { if (u < t0) return null; if (u < t1) t1 = u; }
    }
    return [[p[0] + t0 * dx, p[1] + t0 * dy], [p[0] + t1 * dx, p[1] + t1 * dy]];
  }
  const cruza = function (a, b) { return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]; };

  /**
   * Desenha o croqui no retângulo caixa = [x, y, largura, altura] (pontos do PDF). o: {fonte (pdf-lib), selo: [linhas],
   * titulo (true: "CROQUI DE LOCALIZAÇÃO / S/Escala" no canto de baixo), nomes ({chave: rótulo}), lote: {testada, profundidade},
   * tam (letra dos nomes), tamSelo, janela (m na largura), fundo (true: pinta o quadro de branco antes)}.
   * Devolve o lote (ou null, sem ruas).
   */
  K.desenhar = function (pg, P, caixa, geo, o) {
    o = o || {};
    const L = K.lote(geo, o.lote);
    if (!L) return null;
    const Op = P.PDFOperator, N = function (v) { return P.PDFNumber.of(Math.round(v * 100) / 100); };
    const op = function (nome) { return Op.of(nome, Array.prototype.slice.call(arguments, 1).map(N)); };
    const bx = caixa[0], by = caixa[1], bw = caixa[2], bh = caixa[3], R = [bx, by, bx + bw, by + bh];
    const k = K.escala(bw, bh, geo, L);
    const cx = bx + bw / 2, cy = by + bh / 2, c0 = L.centro;
    const X = function (p) { return [cx + (p[0] - c0[0]) * k, cy + (p[1] - c0[1]) * k]; };
    const fonte = o.fonte, lw = o.linha || 0.8;
    const tw = function (s, t) { return fonte.widthOfTextAtSize(txt(s), t); };
    const texto = function (s, x, y, t, ang, cor) {
      pg.drawText(txt(s), { x: x, y: y, size: t, font: fonte, color: cor || P.rgb(0, 0, 0), rotate: P.degrees(ang || 0) });
    };
    // vias que aparecem no quadro (em pontos, com folga de 40 pt)
    const margem = 40;
    const visiveis = geo.vias.map(function (v) { return { v: v, q: v.p.map(X), w: K.largura(v) * k }; }).filter(function (x) {
      return x.q.some(function (p, i) { return i > 0 && recortar(x.q[i - 1], p, [R[0] - margem, R[1] - margem, R[2] + margem, R[3] + margem]); });
    });
    const caminho = function (ops, q) { ops.push(op('m', q[0][0], q[0][1])); for (let i = 1; i < q.length; i++) ops.push(op('l', q[i][0], q[i][1])); };

    if (o.fundo) pg.drawRectangle({ x: bx, y: by, width: bw, height: bh, color: P.rgb(1, 1, 1) });
    let ops = [Op.of('q'), op('re', bx, by, bw, bh), Op.of('W'), Op.of('n'), op('J', 1), op('j', 1)];
    // ruas: o contorno (traço preto largo) e o leito (traço branco por cima) — as esquinas se fundem, como no desenho à mão
    ops.push(op('RG', 0, 0, 0));
    visiveis.forEach(function (x) { ops.push(op('w', x.w + 2 * lw)); caminho(ops, x.q); ops.push(Op.of('S')); });
    ops.push(op('RG', 1, 1, 1));
    visiveis.forEach(function (x) { ops.push(op('w', x.w)); caminho(ops, x.q); ops.push(Op.of('S')); });
    // lote da UC: hachura (vermelha, como o marcador da imagem) e contorno
    const Q = L.pts.map(X);
    const bb = [Math.min.apply(null, Q.map(function (p) { return p[0]; })), Math.min.apply(null, Q.map(function (p) { return p[1]; })),
      Math.max.apply(null, Q.map(function (p) { return p[0]; })), Math.max.apply(null, Q.map(function (p) { return p[1]; }))];
    ops.push(Op.of('q')); caminho(ops, Q); ops.push(Op.of('h'), Op.of('W'), Op.of('n'), op('RG', 0.85, 0.05, 0.05), op('w', Math.max(0.45, lw * 0.6)));
    const passo = Math.max(1.8, Math.min(3.2, (bb[2] - bb[0] + bb[3] - bb[1]) / 18));
    for (let c = bb[0] - (bb[3] - bb[1]); c <= bb[2]; c += passo) ops.push(op('m', c, bb[1]), op('l', c + (bb[3] - bb[1]), bb[3]));
    ops.push(Op.of('S'), Op.of('Q'));
    ops.push(op('RG', 0, 0, 0), op('w', lw * 1.3)); caminho(ops, Q); ops.push(Op.of('h'), Op.of('S'), Op.of('Q'));
    pg.pushOperators.apply(pg, ops);
    ops = [];

    // ocupados (para os nomes e o selo não ficarem por cima)
    const ocupados = [[bb[0] - 3, bb[1] - 3, bb[2] + 3, bb[3] + 3]];
    // norte (canto de cima, à direita)
    const nx = R[2] - 16, ny = R[3] - 30;
    pg.drawRectangle({ x: nx - 9, y: ny - 12, width: 18, height: 34, color: P.rgb(1, 1, 1) });
    pg.drawSvgPath('M 0 -12 L 5.5 8 L 0 4 L -5.5 8 Z', { x: nx, y: ny, color: P.rgb(0, 0, 0) });
    texto('N', nx - tw('N', 8) / 2, ny + 14, 8);
    ocupados.push([nx - 10, ny - 13, nx + 10, ny + 23]);
    // título (prancha): no canto de baixo, à direita
    if (o.titulo) {
      const t1 = 'CROQUI DE LOCALIZAÇÃO', t2 = 'S/Escala', tt = o.tamTitulo || 9, w1 = tw(t1, tt);
      const x1 = R[2] - 8 - w1, y1 = R[1] + 8 + tt * 1.25;
      pg.drawRectangle({ x: x1 - 4, y: R[1] + 3, width: w1 + 8, height: tt * 2.6 + 6, color: P.rgb(1, 1, 1) });
      texto(t1, x1, y1, tt); pg.drawLine({ start: { x: x1, y: y1 - 2 }, end: { x: x1 + w1, y: y1 - 2 }, thickness: 0.6, color: P.rgb(0, 0, 0) });
      texto(t2, x1, y1 - tt * 1.3, tt * 0.9);
      ocupados.push([x1 - 5, R[1], R[2], y1 + tt + 2]);
    }
    // crédito das ruas (OpenStreetMap, ODbL)
    const cred = 'Ruas: © OpenStreetMap', tc = o.tamCredito || 4.5;
    texto(cred, R[0] + 3, R[1] + 3, tc, 0, P.rgb(0.35, 0.35, 0.35));
    ocupados.push([R[0], R[1], R[0] + tw(cred, tc) + 6, R[1] + tc + 5]);

    // selo do titular: no canto com menos rua por baixo, com a seta até o lote
    const selo = (o.selo || []).filter(function (s) { return String(s || '').trim(); });
    if (selo.length) {
      const ts = o.tamSelo || 6.5, lh = ts * 1.3, sw = Math.max.apply(null, selo.map(function (s) { return tw(s, ts); })) + 10, sh = selo.length * lh + 6;
      const m = 6, cand = [[R[0] + m, R[3] - m - sh], [R[0] + m, R[1] + m + 10], [R[2] - m - sw, R[1] + m + (o.titulo ? 34 : 10)], [R[2] - m - sw - 26, R[3] - m - sh],
        [R[0] + m, cy - sh / 2], [R[2] - m - sw, cy - sh / 2]];
      const amostras = [];
      visiveis.forEach(function (x) {
        for (let i = 1; i < x.q.length; i++) {
          const c = recortar(x.q[i - 1], x.q[i], R);
          if (!c) continue;
          const l = len(sub(c[1], c[0])), n = Math.max(1, Math.ceil(l / 6));
          for (let j = 0; j <= n; j++) amostras.push({ p: soma(c[0], sub(c[1], c[0]), j / n), r: x.w / 2 });
        }
      });
      const custo = function (c) {
        const r = [c[0], c[1], c[0] + sw, c[1] + sh];
        let s = 0;
        amostras.forEach(function (a) { if (a.p[0] + a.r > r[0] && a.p[0] - a.r < r[2] && a.p[1] + a.r > r[1] && a.p[1] - a.r < r[3]) s++; });
        if (ocupados.some(function (x) { return cruza(x, r); })) s += 1000;
        const dl = len(sub([c[0] + sw / 2, c[1] + sh / 2], X(L.centro)));
        return s + dl / 1000;
      };
      const pos = cand.filter(function (c) { return c[0] >= R[0] && c[1] >= R[1] && c[0] + sw <= R[2] && c[1] + sh <= R[3]; })
        .sort(function (a, b) { return custo(a) - custo(b); })[0] || cand[0];
      const sr = [pos[0], pos[1], pos[0] + sw, pos[1] + sh];
      // seta: da borda do selo mais perto do lote até o meio do lote
      const alvo = X(L.centro), sc = [(sr[0] + sr[2]) / 2, (sr[1] + sr[3]) / 2];
      const ini = [Math.max(sr[0], Math.min(sr[2], alvo[0])), Math.max(sr[1], Math.min(sr[3], alvo[1]))];
      if (ini[0] === alvo[0] && ini[1] === alvo[1]) { ini[0] = sc[0]; ini[1] = sr[1]; }
      const u = sub(alvo, ini), lu = len(u) || 1, e = [u[0] / lu, u[1] / lu], pn = [-e[1], e[0]], ponta = 7;
      const base = soma(alvo, e, -ponta);
      pg.drawLine({ start: { x: ini[0], y: ini[1] }, end: { x: base[0], y: base[1] }, thickness: 0.7, color: P.rgb(0, 0, 0) });
      const a1 = soma(base, pn, 2.4), a2 = soma(base, pn, -2.4);
      pg.pushOperators(Op.of('q'), op('rg', 0, 0, 0), op('m', alvo[0], alvo[1]), op('l', a1[0], a1[1]), op('l', a2[0], a2[1]), Op.of('h'), Op.of('f'), Op.of('Q'));
      pg.drawRectangle({ x: sr[0], y: sr[1], width: sw, height: sh, color: P.rgb(1, 1, 1), borderColor: P.rgb(0, 0, 0), borderWidth: 0.6 });
      selo.forEach(function (s, i) { texto(s, sr[0] + 5, sr[3] - 3 - (i + 1) * lh + ts * 0.3, ts); });
      ocupados.push([sr[0] - 2, sr[1] - 2, sr[2] + 2, sr[3] + 2]);
    }

    // nomes das ruas: ao longo do trecho reto mais comprido que aparece, no meio do leito, sem cobrir o lote, o selo ou outro nome
    const tam = o.tam || 7, porNome = {};
    visiveis.forEach(function (x) {
      const kk = chave(x.v.n);
      const g = porNome[kk] || (porNome[kk] = { nome: (o.nomes && o.nomes[kk]) || x.v.n, trechos: [], w: x.w });
      g.w = Math.max(g.w, x.w);
      // trechos quase retos (até 8° de mudança) juntos
      let ini = 0;
      for (let i = 1; i < x.q.length; i++) {
        const fim = i === x.q.length - 1;
        if (!fim) {
          const d1 = sub(x.q[i], x.q[i - 1]), d2 = sub(x.q[i + 1], x.q[i]);
          const cosA = dot(d1, d2) / ((len(d1) * len(d2)) || 1);
          if (cosA > Math.cos(8 * Math.PI / 180)) continue;
        }
        const c = recortar(x.q[ini], x.q[i], [R[0] + 4, R[1] + 4, R[2] - 4, R[3] - 4]);
        if (c) g.trechos.push(c);
        ini = i;
      }
    });
    const nomesOrdem = Object.keys(porNome).sort(function (a, b) { return (a === chave(L.via) ? -1 : 0) - (b === chave(L.via) ? -1 : 0); });
    nomesOrdem.forEach(function (kk) {
      const g = porNome[kk], t = Math.max(4, Math.min(tam, g.w * 0.62)), wt = tw(g.nome, t);
      const trechos = g.trechos.map(function (c) { return { c: c, l: len(sub(c[1], c[0])) }; }).filter(function (x) { return x.l >= wt + 8; }).sort(function (a, b) { return b.l - a.l; });
      for (const tr of trechos) {
        const c = tr.c, d = sub(c[1], c[0]), e = [d[0] / tr.l, d[1] / tr.l];
        let ang = Math.atan2(e[1], e[0]) * 180 / Math.PI;
        let u = e;
        if (ang > 90.5 || ang <= -89.5) { ang += ang > 0 ? -180 : 180; u = [-e[0], -e[1]]; }
        const v = [-u[1], u[0]];
        const folgaT = (wt / 2 + 4) / tr.l;
        const ts = [0.5, 0.35, 0.65, 0.22, 0.78, 0.12, 0.88].filter(function (s) { return s >= folgaT && s <= 1 - folgaT; });
        let feito = false;
        for (const s of ts) {
          const M = soma(c[0], d, s);
          const cantos = [soma(soma(M, u, -wt / 2), v, -t / 2), soma(soma(M, u, wt / 2), v, -t / 2), soma(soma(M, u, wt / 2), v, t / 2), soma(soma(M, u, -wt / 2), v, t / 2)];
          const r = [Math.min.apply(null, cantos.map(function (p) { return p[0]; })), Math.min.apply(null, cantos.map(function (p) { return p[1]; })),
            Math.max.apply(null, cantos.map(function (p) { return p[0]; })), Math.max.apply(null, cantos.map(function (p) { return p[1]; }))];
          if (ocupados.some(function (x) { return cruza(x, r); })) continue;
          const o0 = soma(soma(M, u, -wt / 2), v, -t * 0.35);
          texto(g.nome, o0[0], o0[1], t, ang);
          ocupados.push(r);
          feito = true;
          break;
        }
        if (feito) break;
      }
    });
    return L;
  };

  /** Linhas do selo do titular (como no desenho do modelo). */
  K.selo = function (nome, uc, utm) {
    const u = utm || {}, s = function (v) { return String(v == null ? '' : v).trim(); };
    return ['Titular da U.C', s(nome), s(uc) ? 'UC: ' + s(uc) : '', 'Coordenada em UTM', s(u.fuso) ? 'Fuso: ' + s(u.fuso) : '', s(u.x) ? 'X: ' + s(u.x) : '', s(u.y) ? 'Y: ' + s(u.y) : ''];
  };

  /** Ponto da UC na prancha: o do GPS/digitado (pr.geo) ou o do UTM. {lat, lon} ou null. */
  K.ponto = function (pr) {
    const C = App.Coordenadas, u = (pr && pr.utm) || {}, g = pr && pr.geo;
    if (g && isFinite(g.lat) && isFinite(g.lon) && g.lat !== null && g.lon !== null) return { lat: Number(g.lat), lon: Number(g.lon) };
    const ll = C && C.latLonDeUtm ? C.latLonDeUtm(u.fuso, u.x, u.y) : null;
    return ll && isFinite(ll.lat) && isFinite(ll.lon) ? ll : null;
  };

  /** O croqui pelo mapa está escolhido na prancha? (o padrão; 'modelo' = o desenho do modelo). */
  K.peloMapa = function (pr) { return !pr || pr.croqui !== 'modelo'; };

  K.chave = chave;
  App.Croqui = K;
})(window.App);
